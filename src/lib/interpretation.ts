/**
 * Interpretation-level (L3) advisories — warn-only.
 *
 * Record validity is L1/L2 (schema, referential integrity, derivation). This
 * module is L3: given a locally valid graph, does a multi-hop PATH read as a
 * coherent interpretation? The three remainders of roadmap M2 (paper §10.2 item 5)
 * are:
 *   1. Temporal coherence — do intervals along a 2-3 hop path actually overlap?
 *   2. Type compatibility — are the relationship types along the path compatible
 *      for an influence interpretation?
 *   3. Confidence floor — is the weakest link so weak (D or C without primary
 *      source) that the composed path should be flagged even if drawn as a chain?
 *
 * All three are WARN-ONLY by construction — they never gate dataset emission.
 * The build emits them into `meta.interpretationAudit` and the Inspector
 * surfaces them as quiet pills beside the record.
 */

export interface InterpretationInterval {
	startEarliest: number;
	startLatest: number;
	endEarliest: number | null;
	endLatest: number | null;
}

export interface InterpretationEdge {
	id: string;
	from: string;
	to: string;
	type: string;
	confidence: string;
	verification: string;
	basis: string;
	interval: InterpretationInterval;
}

export interface AdvisoryChain {
	entities: string[];
	edges: string[];
	depth: number;
	reason?: string;
}

export interface InterpretationAudit {
	temporal: AdvisoryChain[];
	typeIncompatible: AdvisoryChain[];
	lowConfidence: AdvisoryChain[];
}

/**
 * Influence-carrying types: edges that can plausibly transmit influence along
 * a path. A path that mixes a carrying type (board, ownership, funding…) with
 * a non-carrying one (family, prosecution, diplomatic…) is flagged as
 * type-incompatible for an influence interpretation — the `board + family +
 * funding` example from the spec is exactly this case.
 *
 * The set is deliberately narrow. Influence-family is obviously carrying;
 * formal corporate / political / financial ties are the other routes real
 * influence travels on this dataset (appointment, board, ownership,
 * shareholder, funding, sponsorship, party, security, business). Kinship
 * (family), legal (prosecution, oversight, sanction…), diplomatic and
 * allegation edges are not influence channels — presenting a chain that
 * routes through one as if it were influence is the distortion this check
 * names.
 */
export const INFLUENCE_CARRYING_TYPES = new Set<string>([
	'influence',
	'reported-influence',
	'advisory',
	'appointment',
	'succession',
	'dismissal',
	'board',
	'ownership',
	'shareholder',
	'sponsorship',
	'partnership',
	'funding',
	'business',
	'party',
	'security',
	// institutional is neutral (held office) but often bridges; treat as non-carrying
	// to keep the check conservative — a path institution→person→family is not
	// a clean influence conduit.
]);

/** True when two fuzzy intervals share any time (outer envelope overlap). */
export function intervalsOverlap(
	a: InterpretationInterval,
	b: InterpretationInterval
): boolean {
	const aStart = a.startEarliest;
	const bStart = b.startEarliest;
	const aEnd = a.endLatest ?? Number.MAX_SAFE_INTEGER;
	const bEnd = b.endLatest ?? Number.MAX_SAFE_INTEGER;
	return aStart <= bEnd && bStart <= aEnd;
}

/** True when every adjacent pair in the ordered path overlaps in time. */
export function isTemporalCoherent(path: InterpretationEdge[]): boolean {
	for (let i = 0; i < path.length - 1; i++) {
		if (!intervalsOverlap(path[i].interval, path[i + 1].interval)) return false;
	}
	return true;
}

/**
 * True when the types along the path can be presented as one influence
 * conduit. A path that stitches an influence-carrying tie (board,
 * ownership, funding…) to a non-carrying tie (family, prosecution,
 * diplomatic…) mixes mechanisms — kinship or coercion is not the same
 * channel as a board seat or a funding line. The `board + family +
 * funding` example from the spec is exactly this mix.
 *
 * Pure carrying paths (board→ownership) and pure non-carrying paths
 * (family→family) are each internally coherent; it is the MIX that is
 * flagged for the Inspector. This keeps pure kinship networks from
 * warning when nobody is presenting them as influence.
 */
export function areTypesCompatible(types: string[]): boolean {
	const hasCarrying = types.some((t) => INFLUENCE_CARRYING_TYPES.has(t));
	const hasNon = types.some((t) => !INFLUENCE_CARRYING_TYPES.has(t));
	return !(hasCarrying && hasNon);
}

/**
 * True when the weakest link is so weak the composed path should be flagged
 * even if it renders as a chain. The rule from the spec: D, or C without a
 * primary source (verification === 'needs-primary-source'). D is
 * `unsubstantiated` on this dataset; C+needs-primary-source is the
 * `inferred` grade that has not cleared the primary-source check.
 */
export function isLowConfidence(path: InterpretationEdge[]): boolean {
	return path.some(
		(e) => e.confidence === 'D' || (e.confidence === 'C' && e.verification === 'needs-primary-source')
	);
}

/**
 * Enumerate all undirected simple paths of length 2-3 and classify each.
 * Warn-only: a path can be flagged in multiple buckets at once.
 * Capped for emission (mirrors pathAudit caps).
 */
export function auditInterpretationPaths(
	edges: InterpretationEdge[]
): InterpretationAudit {
	// Build undirected adjacency — influence interpretation is routinely read
	// undirected (a viewer sees "A connected to B, B to C" regardless of which
	// way the edge was authored). The interval and type checks are symmetric, so
	// undirected enumeration is the honest scope.
	const adj = new Map<string, Array<{ neighbor: string; edge: InterpretationEdge }>>();
	for (const e of edges) {
		if (!adj.has(e.from)) adj.set(e.from, []);
		if (!adj.has(e.to)) adj.set(e.to, []);
		adj.get(e.from)!.push({ neighbor: e.to, edge: e });
		adj.get(e.to)!.push({ neighbor: e.from, edge: e });
	}

	const temporal: AdvisoryChain[] = [];
	const typeIncompatible: AdvisoryChain[] = [];
	const lowConfidence: AdvisoryChain[] = [];
	const seen = new Set<string>();

	function dfs(
		current: string,
		pathEdges: InterpretationEdge[],
		pathNodes: string[],
		visitedNodes: Set<string>
	) {
		if (pathEdges.length >= 2 && pathEdges.length <= 3) {
			const key = pathEdges.map((e) => e.id).sort().join('|');
			if (!seen.has(key)) {
				seen.add(key);
				const types = pathEdges.map((e) => e.type);
				const coherent = isTemporalCoherent(pathEdges);
				const compatible = areTypesCompatible(types);
				const low = isLowConfidence(pathEdges);
				const chain: AdvisoryChain = {
					entities: [...pathNodes],
					edges: pathEdges.map((e) => e.id),
					depth: pathEdges.length
				};
				if (!coherent) {
					// Name the first incoherent adjacent pair for the Inspector tooltip.
					let reason = 'non-overlapping intervals';
					for (let i = 0; i < pathEdges.length - 1; i++) {
						if (!intervalsOverlap(pathEdges[i].interval, pathEdges[i + 1].interval)) {
							reason = `${pathEdges[i].id} ↔ ${pathEdges[i + 1].id} do not overlap`;
							break;
						}
					}
					temporal.push({ ...chain, reason });
				}
				if (!compatible) {
					const offending = types.find((t) => !INFLUENCE_CARRYING_TYPES.has(t)) ?? types[0];
					typeIncompatible.push({ ...chain, reason: `type "${offending}" is not an influence channel` });
				}
				if (low) {
					const weak = pathEdges.find(
						(e) => e.confidence === 'D' || (e.confidence === 'C' && e.verification === 'needs-primary-source')
					);
					const label = weak ? `${weak.id} (${weak.confidence}${weak.verification === 'needs-primary-source' ? ', needs-primary-source' : ''})` : 'weakest link';
					lowConfidence.push({ ...chain, reason: `weakest link ${label}` });
				}
			}
		}
		if (pathEdges.length >= 3) return;
		for (const { neighbor, edge } of adj.get(current) ?? []) {
			if (pathEdges.some((e) => e.id === edge.id)) continue;
			if (visitedNodes.has(neighbor)) continue;
			visitedNodes.add(neighbor);
			dfs(neighbor, [...pathEdges, edge], [...pathNodes, neighbor], visitedNodes);
			visitedNodes.delete(neighbor);
		}
	}

	for (const start of adj.keys()) {
		const visited = new Set<string>([start]);
		dfs(start, [], [start], visited);
	}

	const CHAIN_CAP = 50;
	const ENTITY_CAP = 12;
	const cap = (chains: AdvisoryChain[]) =>
		chains
			.sort((a, b) => b.depth - a.depth || b.edges.length - a.edges.length)
			.slice(0, CHAIN_CAP)
			.map((c) => ({
				...c,
				entities: c.entities.slice(0, ENTITY_CAP)
			}));

	return {
		temporal: cap(temporal),
		typeIncompatible: cap(typeIncompatible),
		lowConfidence: cap(lowConfidence)
	};
}
