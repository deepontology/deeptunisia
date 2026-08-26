import Graph from 'graphology';
// graphology-metrics ships CommonJS with a single default export per module.
import betweenness from 'graphology-metrics/centrality/betweenness';
import {
	CUTOFF,
	ds,
	meetsBasis,
	personById,
	possiblyActive,
	relKind,
	resolveEntity,
	type Basis,
	type Layer
} from './model';

/**
 * Structural power indices.
 *
 * There is deliberately no single "power score". Any one number would be read as
 * truth, and it would not be: the research this dataset comes from is explicit
 * that a ranking of institutional significance is not a ranking of who secretly
 * runs the country.
 *
 * So five indices are computed separately and shown side by side. Four are pure
 * functions of the data; one (formal authority) derives from a published, openly
 * editable weight table. The reader can combine them with their own weights, and
 * in doing so discovers that "most powerful" is a function of what you decide to
 * measure. That discovery is the actual argument.
 */

export interface IndexScores {
	personId: string;
	/** Highest formal authority weight of any post held, from the published table. */
	authority: number;
	/** Inverse graph distance to the presidency through institutional edges only. */
	proximity: number;
	/** Years in senior post, plus a bonus per regime rupture survived. */
	survival: number;
	/** Betweenness centrality: how much this person connects otherwise separate parts. */
	brokerage: number;
	/** How many analytical layers the person touches. */
	reach: number;
	/** Evidenced influence: weighted, basis-discounted influence edges (spec §10). */
	influence: number;
	/** Supporting detail so every score can be interrogated rather than trusted. */
	detail: {
		topRole: string | null;
		hops: number | null;
		years: number;
		rupturesSurvived: number;
		layers: Layer[];
		bridgePaths: number;
	};
}

export interface IndexOptions {
	t: number;
	basisFloor: Basis;
	layers: Set<Layer>;
	/** When true, indices reflect the whole timeline rather than one instant. */
	allTime?: boolean;
}

const RUPTURES = ds.events.filter((e) => e.rupture).map((e) => e.interval.startEarliest);

/** Graph used for proximity and brokerage. Documented edges only by default. */
function buildGraph(opts: IndexOptions, includeReported: boolean) {
	const g = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });

	const addNode = (id: string) => {
		if (!g.hasNode(id)) g.addNode(id);
	};

	// Institutional edges: a person is connected to every institution they served.
	for (const pos of ds.positions) {
		if (!meetsBasis(pos.basis as Basis, opts.basisFloor)) continue;
		if (!opts.layers.has(pos.layer as Layer)) continue;
		if (!opts.allTime && !possiblyActive(pos.interval, opts.t)) continue;
		if (!pos.institution) continue;
		addNode(pos.holder);
		addNode(pos.institution);
		if (!g.hasEdge(pos.holder, pos.institution)) g.addEdge(pos.holder, pos.institution);
	}

	// Explicit relationships.
	for (const rel of ds.relationships) {
		if (!meetsBasis(rel.basis as Basis, opts.basisFloor)) continue;
		const kind = relKind(rel.type);
		if (!includeReported && kind !== 'documented') continue;
		const a = resolveEntity(rel.from);
		const b = resolveEntity(rel.to);
		if (!a || !b) continue;
		if (!a.layers.some((l) => opts.layers.has(l)) || !b.layers.some((l) => opts.layers.has(l))) continue;
		if (!opts.allTime && rel.interval.raw.start !== null && !possiblyActive(rel.interval, opts.t)) continue;
		addNode(rel.from);
		addNode(rel.to);
		if (!g.hasEdge(rel.from, rel.to)) g.addEdge(rel.from, rel.to);
	}

	// Institutional hierarchy, so proximity can travel up a command chain.
	for (const inst of ds.institutions) {
		if (!inst.parent) continue;
		if (!opts.layers.has(inst.layer as Layer)) continue;
		const parent = ds.institutions.find((i) => i.id === inst.parent);
		if (!parent || !opts.layers.has(parent.layer as Layer)) continue;
		addNode(inst.id);
		addNode(parent.id);
		if (!g.hasEdge(inst.id, parent.id)) g.addEdge(inst.id, parent.id);
	}

	return g;
}

/** BFS hop counts from a source node. */
function hopsFrom(g: Graph, start: string): Map<string, number> {
	const dist = new Map<string, number>();
	if (!g.hasNode(start)) return dist;
	dist.set(start, 0);
	const queue = [start];
	while (queue.length) {
		const node = queue.shift()!;
		const d = dist.get(node)!;
		for (const neighbour of g.neighbors(node)) {
			if (!dist.has(neighbour)) {
				dist.set(neighbour, d + 1);
				queue.push(neighbour);
			}
		}
	}
	return dist;
}

/**
 * The five structural indices, memoised (spec §14.3).
 *
 * Rankings calls this from a `$derived`, which already recomputes only when its
 * reactive dependencies change — but toggling a layer off and back on re-runs the
 * whole pipeline both times (two graph builds + betweenness) even though the
 * effective inputs are identical. This memo keys on the serialized options, so a
 * round-trip state change costs nothing. The result is returned by reference and
 * callers must treat it as read-only.
 */
let _memoKey = '';
let _memoResult: IndexScores[] | null = null;

export function computeIndices(opts: IndexOptions): IndexScores[] {
	const key = [opts.t, opts.basisFloor, opts.allTime ? 1 : 0, [...opts.layers].sort().join(',')].join('|');
	if (_memoKey === key && _memoResult) return _memoResult;
	_memoKey = key;
	_memoResult = computeIndicesUncached(opts);
	return _memoResult;
}

/**
 * Drop the memoised result. The memo key deliberately excludes the basis
 * discount (it is a property of the parameters, not of the view), so an
 * audit that perturbs `index.discount` in memory must reset the memo between
 * runs or it would keep returning the baseline. The sensitivity harness
 * (scripts/sensitivity.ts, roadmap M3) is the only caller.
 */
export function clearIndicesMemo() {
	_memoKey = '';
	_memoResult = null;
}

function computeIndicesUncached(opts: IndexOptions): IndexScores[] {
	const documentedGraph = buildGraph(opts, false);
	const fullGraph = buildGraph(opts, true);

	const distToPresidency = hopsFrom(documentedGraph, 'presidency');

	let central: Record<string, number> = {};
	if (fullGraph.order > 2) {
		try {
			central = betweenness(fullGraph, { normalized: true });
		} catch {
			central = {};
		}
	}

	const maxBetween = Math.max(0.0001, ...Object.values(central));

	const scores: IndexScores[] = [];

	for (const person of ds.people) {
		const layers = person.layers as Layer[];
		if (!layers.some((l) => opts.layers.has(l))) continue;

		const held = ds.positions.filter(
			(p) =>
				p.holder === person.id &&
				meetsBasis(p.basis as Basis, opts.basisFloor) &&
				opts.layers.has(p.layer as Layer)
		);
		const relevant = opts.allTime ? held : held.filter((p) => possiblyActive(p.interval, opts.t));

		// A person with no post at this instant is not on the board. Their history
		// still exists and is reachable, but a snapshot ranking should reflect the
		// snapshot.
		if (relevant.length === 0 && !opts.allTime) continue;

		const authority = relevant.reduce((max, p) => Math.max(max, p.authority), 0);
		const topRole = relevant.reduce<{ authority: number; title: string } | null>(
			(best, p) => (!best || p.authority > best.authority ? { authority: p.authority, title: p.roleTitle } : best),
			null
		);

		const hops = distToPresidency.get(person.id) ?? null;
		const proximity = hops === null ? 0 : Math.max(0, 100 - (hops - 1) * 28);

		const years = held.reduce((sum, p) => sum + p.years, 0);
		const spanStart = Math.min(...held.map((p) => p.interval.startEarliest), CUTOFF);
		const spanEnd = Math.max(...held.map((p) => p.interval.endLatest ?? CUTOFF), spanStart);
		const rupturesSurvived = RUPTURES.filter((r) => r > spanStart && r < spanEnd).length;
		const survival = Math.min(100, years * 3.2 + rupturesSurvived * 12);

		const brokerage = ((central[person.id] ?? 0) / maxBetween) * 100;

		// Denominator is the number of layers currently ENABLED, not a fixed constant.
		// It was hard-coded to 4 when the model had four layers; judicial, civil and
		// foreign were added later and this was never updated, so reach was scored
		// against a range 43% smaller than the real one. Nobody saturated (the widest
		// trajectory in the dataset touches three layers) but every score was inflated —
		// three spheres read as 75/100 instead of 43/100 — which silently over-weighted
		// reach against the other four indices in the composite.
		//
		// Deriving it from the active filter also keeps the score meaningful when the
		// reader narrows the layer set, where the maximum achievable reach is however
		// many layers they left on.
		const distinctLayers = layers.filter((l) => opts.layers.has(l));
		const reach = (distinctLayers.length / Math.max(1, opts.layers.size)) * 100;

		// How many of this person's edges cross a layer boundary. This is the
		// concrete evidence behind a brokerage score.
		let bridgePaths = 0;
		if (fullGraph.hasNode(person.id)) {
			for (const neighbour of fullGraph.neighbors(person.id)) {
				const other = resolveEntity(neighbour);
				if (!other) continue;
				if (!other.layers.some((l) => distinctLayers.includes(l))) bridgePaths++;
			}
		}

		// Influence (spec §10): the sum of this person's influence-family edges
		// (influence, reported-influence, advisory), each weighted by its authored
		// strength and discounted by how well-evidenced its basis is. Unsubstantiated
		// edges weigh nothing — an influence index computed from documented evidence
		// is the only kind that is honest to publish.
		const influence = Math.min(
			100,
			100 *
				ds.relationships.reduce((sum, rel) => {
					if (rel.from !== person.id && rel.to !== person.id) return sum;
					if (!INFLUENCE_FAMILY.has(rel.type as string)) return sum;
					const strength = (rel as { influence?: { strength?: number } }).influence?.strength;
					if (!strength) return sum;
					return sum + strength * basisDiscount(rel.basis as Basis) * 0.35;
				}, 0)
		);

		scores.push({
			personId: person.id,
			authority,
			proximity,
			survival,
			brokerage,
			reach: Math.min(100, reach),
			influence,
			detail: {
				topRole: topRole?.title ?? null,
				hops,
				years: Math.round(years * 10) / 10,
				rupturesSurvived,
				layers: distinctLayers,
				bridgePaths
			}
		});
	}

	return scores;
}

export const INFLUENCE_FAMILY = new Set(['influence', 'reported-influence', 'advisory']);

/** Basis discount for the influence index: unsubstantiated weighs nothing. */
export const INFLUENCE_BASIS_WEIGHT: Record<Basis, number> = {
	documented: 1,
	reported: 0.55,
	inferred: 0.2,
	unsubstantiated: 0
};

/**
 * The live discount, read from the emitted jurisdiction parameters
 * (dataset.json meta.parameters.index.discount). The exported constant above is
 * the fallback for callers outside the built graph — the shipped values are
 * identical, so behaviour only changes when a fork edits data/parameters.yaml,
 * which is exactly the point: the client and the build can never disagree
 * about what a documented edge weighs.
 */
export function basisDiscount(b: Basis): number {
	const params = ds.meta.parameters;
	const discount = params?.index?.discount;
	return discount ? discount[b] : INFLUENCE_BASIS_WEIGHT[b];
}

export const INDEX_KEYS = ['authority', 'proximity', 'survival', 'brokerage', 'reach', 'influence'] as const;
export type IndexKey = (typeof INDEX_KEYS)[number];

export const INDEX_META: Record<IndexKey, { label: string; short: string; blurb: string; derived: string }> = {
	authority: {
		label: 'Formal authority',
		short: 'Authority',
		blurb: 'The constitutional and command weight of the most senior post held.',
		derived: 'From a published, editable weight table. An editorial judgement, openly stated.'
	},
	proximity: {
		label: 'Proximity to the executive',
		short: 'Proximity',
		blurb: 'How few institutional steps separate this person from the presidency.',
		derived: 'Computed: shortest path to the presidency node over documented edges only.'
	},
	survival: {
		label: 'Tenure and survival',
		short: 'Survival',
		blurb: 'Years in senior post, weighted by how many regime ruptures were survived in office.',
		derived: 'Computed purely from position intervals. The most defensible index here.'
	},
	brokerage: {
		label: 'Brokerage',
		short: 'Brokerage',
		blurb: 'How much this person connects parts of the network that would otherwise be separate.',
		derived: 'Computed: normalised betweenness centrality. Surfaces intermediaries over headline names.'
	},
	reach: {
		label: 'Cross-layer reach',
		short: 'Reach',
		blurb: 'How many of the analytical layers — security, political, economic, media, judicial, civil society, foreign — the person operates in.',
		derived:
			'Computed from layer membership, as a share of the layers currently enabled. Narrowing the layer filter changes the denominator.'
	},
	influence: {
		label: 'Evidenced influence',
		short: 'Influence',
		blurb: 'How many evidenced routes of influence connect to this person, weighted by strength and basis.',
		derived:
			'Computed from documented influence edges in the graph. Reads: how many evidenced routes. Not a judgement of who truly runs the country.'
	}
};

export const DEFAULT_WEIGHTS: Record<IndexKey, number> = {
	authority: 1,
	proximity: 1,
	survival: 1,
	brokerage: 1,
	reach: 1,
	influence: 1
};

export function composite(score: IndexScores, weights: Record<IndexKey, number>): number {
	let total = 0;
	let sum = 0;
	for (const key of INDEX_KEYS) {
		total += score[key] * weights[key];
		sum += weights[key];
	}
	return sum === 0 ? 0 : total / sum;
}

export function personName(id: string): string {
	return personById.get(id)?.name_en ?? id;
}
