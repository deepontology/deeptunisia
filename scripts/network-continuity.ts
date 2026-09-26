/**
 * Network continuity probe (Phase 10D).
 *
 * H1 asks whether a stable group of security elites bridged every regime
 * change. The personnel reading is already contradicted: no individual is
 * certainly in post at 1987-11-07, 2011-01-14 and 2021-07-25. But personnel
 * discontinuity is not network discontinuity: a path can link one cohort to
 * the next even when no single person spans all three ruptures. This module
 * asks that harder question without weakening the personnel test.
 *
 * Definitions (locked here, emitted with the result so a reader can recompute
 * or disagree):
 *
 *   cohort          holders certainlyActive at the date, over security-layer
 *                   roles at or above MIN_AUTHORITY. Possibly-active-only
 *                   holders land in a secondary watch list, never the cohort.
 *   edges           succession (consecutive holders of one role, gap under the
 *                   published threshold), appointment relationships,
 *                   command/patronage relationship subtypes, and institutional
 *                   co-membership with a real time overlap. Family, business,
 *                   shared-source and same-institution-without-overlap links
 *                   are excluded by construction.
 *   time order      for consecutive edges, the earlier edge's endEarliest is
 *                   not after the later edge's startLatest. Unknown ends take
 *                   the dataset cutoff.
 *   grade gate      a primary path has every edge documented or reported with
 *                   at least one tier-1/2 source (or a live source exception).
 *                   Paths with no unsubstantiated edge but a weaker grade are
 *                   reported as secondary; any unsubstantiated edge excludes
 *                   the path from the count entirely.
 *   null controls   the same query over degree-bucketed shuffled cohorts and
 *                   over random date sets of the same sizes, seeded so the
 *                   gate is deterministic.
 *
 * The module loads the built dataset, never raw YAML. It is written as a pure
 * function plus a CLI so the gate can exercise hand-worked fixtures.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { certainlyActive, possiblyActive, configureTime } from './dates.ts';
import { loadParameters } from './parameters.ts';
import {
	buildRows,
	mergeRows,
	parseReviewCsv,
	renderReviewCsv,
	summarize,
	type ReviewSummary,
	type ReviewRow
} from './network-continuity-review.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const COHORT_DATES = ['1987-11-07', '2011-01-14', '2021-07-25'] as const;
export type CohortDate = (typeof COHORT_DATES)[number];

/** Minimum role authority for a security-layer role to be a command post. */
export const MIN_AUTHORITY = 40;
export const MAX_PATH_EDGES = 3;
export const NULL_TRIALS = 200;
export const NULL_SEED = 20260911;
const MAX_PATHS = 20000;

export type Basis = 'documented' | 'reported' | 'inferred' | 'unsubstantiated';

interface Interval {
	startEarliest: number;
	startLatest: number;
	endEarliest: number | null;
	endLatest: number | null;
	status: string;
}

interface Position {
	id: string;
	role: string;
	holder: string;
	interval: Interval;
	basis: Basis;
	confidence: string;
	sources: string[];
	acting?: boolean;
}

interface Relationship {
	id: string;
	from: string;
	to: string;
	type: string;
	subtype?: string;
	interval?: Interval;
	basis: Basis;
	confidence: string;
	sources: string[];
}

interface Role {
	id: string;
	institution: string;
	authority: number;
}

interface Institution {
	id: string;
	layer: string;
}

interface Source {
	id: string;
	tier: number;
}

interface DatasetLike {
	meta: { cutoff: number; floor: number; successionMeta?: { gapYears?: number } };
	positions: Position[];
	relationships: Relationship[];
	roles: Role[];
	institutions: Institution[];
	sources: Source[];
}

export interface Options {
	seed?: number;
	nullTrials?: number;
	exceptionKeys?: Set<string>;
	/** Cohort dates; defaults to the three rupture dates. Fixtures override. */
	dates?: string[];
}

export interface ContinuityEdge {
	id: string;
	kind: 'succession' | 'appointment' | 'command' | 'patronage' | 'co-membership';
	from: string;
	to: string;
	startEarliest: number;
	startLatest: number;
	endEarliest: number | null;
	endLatest: number | null;
	basis: Basis;
	confidence: string;
	tierFloor: number | null;
	gradeOk: boolean;
	undirected: boolean;
}

export interface ContinuityPath {
	nodes: string[];
	edges: string[];
	kind: 'primary' | 'secondary';
}

export interface ContinuityResult {
	parameters: {
		cohortDates: string[];
		minAuthority: number;
		maxPathEdges: number;
		successionMaxGapYears: number;
		nullTrials: number;
		seed: number;
		cutoff: number;
	};
	cohorts: {
		date: string;
		certain: string[];
		watch: string[];
	};
	personnel: {
		spanning: string[];
		crossings: { person: string; dates: string[] }[];
	};
	edges: { total: number; byKind: Record<string, number> };
	paths: {
		cohort1to2: { primary: ContinuityPath[]; secondary: ContinuityPath[]; excluded: number };
		cohort2to3: { primary: ContinuityPath[]; secondary: ContinuityPath[]; excluded: number };
	};
	nullControls: {
		shuffledCohorts: { trials: number; min: number; median: number; max: number; atLeastReal: number };
		randomDates: { trials: number; min: number; median: number; max: number; atLeastReal: number };
	};
	/**
	 * The editorial triage of the published paths, read back from
	 * `output/network-continuity-review.csv` (M2). Present only where the CSV
	 * exists: the count, the human verdicts on that count and the null
	 * distribution are published together so a path count is never read as a
	 * finding on its own.
	 */
	review?: ReviewSummary;
}

const BASIS_RANK: Record<Basis, number> = {
	documented: 3,
	reported: 2,
	inferred: 1,
	unsubstantiated: 0
};

function weaker(a: Basis, b: Basis): Basis {
	return BASIS_RANK[a] <= BASIS_RANK[b] ? a : b;
}

function lowerConfidence(a: string, b: string): string {
	return a <= b ? a : b;
}

/** mulberry32 — deterministic PRNG so null controls reproduce across runs. */
function rng(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

export function dateToUtc(date: string): number {
	return Date.parse(`${date}T00:00:00Z`);
}

function roleById(ds: DatasetLike): Map<string, Role> {
	return new Map(ds.roles.map((r) => [r.id, r]));
}

function institutionById(ds: DatasetLike): Map<string, Institution> {
	return new Map(ds.institutions.map((i) => [i.id, i]));
}

function sourceTier(ds: DatasetLike): Map<string, number> {
	return new Map(ds.sources.map((s) => [s.id, s.tier]));
}

function exceptionKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

/**
 * Security command positions: security-layer roles at or above the authority
 * floor. The floor is published in the result rather than buried here.
 */
export function securityRoles(ds: DatasetLike): Set<string> {
	const roles = roleById(ds);
	const insts = institutionById(ds);
	const out = new Set<string>();
	for (const role of ds.roles) {
		const inst = insts.get(role.institution);
		if (inst?.layer === 'security' && role.authority >= MIN_AUTHORITY) out.add(role.id);
	}
	return out;
}

function cohortAt(ds: DatasetLike, at: number): { certain: string[]; watch: string[] } {
	const roles = securityRoles(ds);
	const certain = new Set<string>();
	const watch = new Set<string>();
	for (const pos of ds.positions) {
		if (!roles.has(pos.role)) continue;
		if (certainlyActive(pos.interval, at)) certain.add(pos.holder);
		else if (possiblyActive(pos.interval, at)) watch.add(pos.holder);
	}
	for (const c of certain) watch.delete(c);
	return { certain: [...certain].sort(), watch: [...watch].sort() };
}

function edgeTime(e: ContinuityEdge, cutoff: number): { end: number; startLatest: number } {
	return { end: e.endEarliest ?? e.endLatest ?? cutoff, startLatest: e.startLatest };
}

/**
 * Build the traversable edge list. Every edge carries its own grade so the path
 * classifier never has to guess what it inherited.
 */
export function buildEdges(ds: DatasetLike, exceptionKeys: Set<string> = new Set()): ContinuityEdge[] {
	const cutoff = ds.meta.cutoff;
	const gapYears = ds.meta.successionMeta?.gapYears ?? 1;
	const tierOf = sourceTier(ds);
	const edges: ContinuityEdge[] = [];

	const grade = (basis: Basis, sources: string[], key: string) => {
		const tiers = sources.map((s) => tierOf.get(s)).filter((t): t is number => typeof t === 'number');
		const floor = tiers.length ? Math.min(...tiers) : null;
		// Documented/reported plus a tier-1/2 source, or a live V25 exception.
		const gradeOk = BASIS_RANK[basis] >= 2 && ((floor !== null && floor <= 2) || exceptionKeys.has(key));
		return { floor, gradeOk };
	};

	// Succession: consecutive holders of one role, gap under the published threshold.
	const byRole = new Map<string, Position[]>();
	for (const pos of ds.positions) {
		byRole.set(pos.role, [...(byRole.get(pos.role) ?? []), pos]);
	}
	const YEAR = 365.2425 * 86_400_000;
	const commandRoles = securityRoles(ds);
	for (const [roleId, list] of byRole) {
		if (!commandRoles.has(roleId)) continue;
		const sorted = [...list].sort((a, b) => a.interval.startLatest - b.interval.startLatest);
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1];
			const next = sorted[i];
			const gapStart = prev.interval.endEarliest ?? prev.interval.endLatest ?? cutoff;
			const gap = (next.interval.startEarliest - gapStart) / YEAR;
			if (gap > gapYears) continue;
			const basis = weaker(prev.basis, next.basis);
			const sources = [...new Set([...prev.sources, ...next.sources])];
			const g = grade(basis, sources, exceptionKey('position', next.id));
			edges.push({
				id: `succession:${prev.id}:${next.id}`,
				kind: 'succession',
				from: prev.holder,
				to: next.holder,
				// The edge is the successor's tenure: A→B is live while B holds
				// the post, not across A's whole term.
				startEarliest: next.interval.startEarliest,
				startLatest: next.interval.startLatest,
				endEarliest: next.interval.endEarliest,
				endLatest: next.interval.endLatest,
				basis,
				confidence: lowerConfidence(prev.confidence, next.confidence),
				tierFloor: g.floor,
				gradeOk: g.gradeOk,
				undirected: false
			});
		}
	}

	// Recorded edges: appointment, plus command/patronage subtypes.
	for (const rel of ds.relationships) {
		const kind =
			rel.type === 'appointment'
				? 'appointment'
				: rel.type === 'institutional' && rel.subtype === 'patronage'
					? 'patronage'
					: rel.type === 'institutional' && rel.subtype === 'command'
						? 'command'
						: null;
		if (!kind || !rel.interval) continue;
		const g = grade(rel.basis, rel.sources, exceptionKey('relationship', rel.id));
		edges.push({
			id: rel.id,
			kind,
			from: rel.from,
			to: rel.to,
			startEarliest: rel.interval.startEarliest,
			startLatest: rel.interval.startLatest,
			endEarliest: rel.interval.endEarliest,
			endLatest: rel.interval.endLatest,
			basis: rel.basis,
			confidence: rel.confidence,
			tierFloor: g.floor,
			gradeOk: g.gradeOk,
			undirected: false
		});
	}

	// Institutional co-membership with a real overlap between two command-post
	// tenures. Restricted to security command roles: a shared bank board or a
	// party office is a business or political tie, which the locked definitions
	// exclude, and unrestricted co-membership made the null controls meaningless.
	const roles = roleById(ds);
	const commandHolders = new Map<string, Position[]>();
	for (const pos of ds.positions) {
		if (!commandRoles.has(pos.role)) continue;
		const inst = roles.get(pos.role)?.institution;
		if (!inst) continue;
		commandHolders.set(inst, [...(commandHolders.get(inst) ?? []), pos]);
	}
	for (const [inst, positions] of commandHolders) {
		for (let i = 0; i < positions.length; i++) {
			for (let j = i + 1; j < positions.length; j++) {
				const a = positions[i];
				const b = positions[j];
				if (a.holder === b.holder) continue;
				const start = Math.max(a.interval.startEarliest, b.interval.startEarliest);
				const endA = a.interval.endLatest ?? cutoff;
				const endB = b.interval.endLatest ?? cutoff;
				const end = Math.min(endA, endB);
				if (end < start) continue; // no overlap in time
				const basis = weaker(a.basis, b.basis);
				const sources = [...new Set([...a.sources, ...b.sources])];
				const g = grade(basis, sources, exceptionKey('position', a.id));
				edges.push({
					id: `co:${inst}:${a.id}:${b.id}`,
					kind: 'co-membership',
					from: a.holder,
					to: b.holder,
					startEarliest: start,
					startLatest: Math.max(a.interval.startLatest, b.interval.startLatest),
					endEarliest: end,
					endLatest: end,
					basis,
					confidence: lowerConfidence(a.confidence, b.confidence),
					tierFloor: g.floor,
					gradeOk: g.gradeOk,
					undirected: true
				});
			}
		}
	}

	return edges;
}

interface Adjacency {
	edge: ContinuityEdge;
	next: string;
}

function adjacencyOf(edges: ContinuityEdge[]): Map<string, Adjacency[]> {
	const out = new Map<string, Adjacency[]>();
	const add = (from: string, edge: ContinuityEdge, next: string) => {
		out.set(from, [...(out.get(from) ?? []), { edge, next }]);
	};
	for (const e of edges) {
		add(e.from, e, e.to);
		if (e.undirected) add(e.to, e, e.from);
	}
	return out;
}

function classify(path: ContinuityEdge[]): 'primary' | 'secondary' | 'excluded' {
	if (path.some((e) => e.basis === 'unsubstantiated')) return 'excluded';
	if (path.every((e) => e.gradeOk)) return 'primary';
	return 'secondary';
}

/**
 * Enumerate time-ordered paths of at most `maxEdges` from any source to any
 * target. Deterministic: adjacency order follows the edge list order.
 *
 * No temporal anchor beyond step ordering is applied. Whether a bridge has to
 * be live at the cohort date is exactly the kind of extra threshold that would
 * make the result look stronger than it is, so the null controls below measure
 * the locked definition as written and the dashboard publishes the comparison.
 */
export function queryPaths(
	edges: ContinuityEdge[],
	sources: string[],
	targets: string[],
	maxEdges: number,
	cutoff: number
): { primary: ContinuityPath[]; secondary: ContinuityPath[]; excluded: number } {
	const adj = adjacencyOf(edges);
	const targetSet = new Set(targets);
	const primary: ContinuityPath[] = [];
	const secondary: ContinuityPath[] = [];
	let excluded = 0;
	const seen = new Set<string>();

	const walk = (node: string, nodes: string[], path: ContinuityEdge[], visited: Set<string>) => {
		if (path.length > 0 && targetSet.has(node)) {
			const key = path.map((e) => e.id).join('>');
			if (!seen.has(key)) {
				seen.add(key);
				const verdict = classify(path);
				const entry: ContinuityPath = { nodes, edges: path.map((e) => e.id), kind: verdict === 'primary' ? 'primary' : 'secondary' };
				if (verdict === 'primary') primary.push(entry);
				else if (verdict === 'secondary') secondary.push(entry);
				else excluded++;
			}
		}
		if (path.length >= maxEdges || primary.length + secondary.length >= MAX_PATHS) return;
		for (const step of adj.get(node) ?? []) {
			if (visited.has(step.next)) continue;
			if (path.length > 0) {
				const prev = path[path.length - 1];
				const prevEnd = prev.endEarliest ?? prev.endLatest ?? cutoff;
				if (prevEnd > step.edge.startLatest) continue; // wrong time order
			}
			visited.add(step.next);
			walk(step.next, [...nodes, step.next], [...path, step.edge], visited);
			visited.delete(step.next);
		}
	};

	for (const source of sources) walk(source, [source], [], new Set([source]));
	return { primary, secondary, excluded };
}

export function computeNetworkContinuity(ds: DatasetLike, options: Options = {}): ContinuityResult {
	const seed = options.seed ?? NULL_SEED;
	const trials = options.nullTrials ?? NULL_TRIALS;
	const cutoff = ds.meta.cutoff;
	const floor = ds.meta.floor;
	const edges = buildEdges(ds, options.exceptionKeys ?? new Set<string>());

	const roles = securityRoles(ds);
	const securityPositions = ds.positions.filter((p) => roles.has(p.role));
	const pool = [...new Set(securityPositions.map((p) => p.holder))].sort();

	const dates = options.dates ?? [...COHORT_DATES];
	const cohorts = dates.map((date) => ({ date, ...cohortAt(ds, dateToUtc(date)) }));
	const cohortSets = cohorts.map((c) => new Set(c.certain));

	// Personnel reading: who is certain at all three dates?
	const spanning = [...cohortSets[0]].filter((p) => cohortSets[1].has(p) && cohortSets[2].has(p)).sort();
	const crossings: { person: string; dates: string[] }[] = [];
	const allPeople = new Set(cohorts.flatMap((c) => c.certain));
	for (const person of allPeople) {
		const dates = cohorts.filter((c) => c.certain.includes(person)).map((c) => c.date);
		if (dates.length >= 2) crossings.push({ person, dates });
	}
	crossings.sort((a, b) => b.dates.length - a.dates.length || a.person.localeCompare(b.person));

	const paths12 = queryPaths(edges, cohorts[0].certain, cohorts[1].certain, MAX_PATH_EDGES, cutoff);
	const paths23 = queryPaths(edges, cohorts[1].certain, cohorts[2].certain, MAX_PATH_EDGES, cutoff);

	// Null controls.
	const degree = new Map<string, number>();
	for (const e of edges) {
		degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
		degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
	}
	const bucket = new Map<number, string[]>();
	for (const person of pool) bucket.set(degree.get(person) ?? 0, [...(bucket.get(degree.get(person) ?? 0) ?? []), person]);
	const random = rng(seed);
	const pickReplacement = (exclude: Set<string>, targetDegree: number): string | null => {
		const exact = (bucket.get(targetDegree) ?? []).filter((p) => !exclude.has(p));
		const candidates = exact.length ? exact : pool.filter((p) => !exclude.has(p));
		if (!candidates.length) return null;
		// Deterministic choice: the pool is sorted, rng picks an index.
		return candidates[Math.floor(random() * candidates.length)];
	};

	const nullCounts = (generator: () => { certain: string[]; dates: number[] }[]) => {
		const counts: number[] = [];
		for (let t = 0; t < trials; t++) {
			const trial = generator();
			const p12 = queryPaths(edges, trial[0].certain, trial[1].certain, MAX_PATH_EDGES, cutoff);
			const p23 = queryPaths(edges, trial[1].certain, trial[2].certain, MAX_PATH_EDGES, cutoff);
			counts.push(p12.primary.length + p23.primary.length);
		}
		return counts;
	};

	const shuffledCounts = nullCounts(() =>
		cohorts.map((c) => {
			const used = new Set<string>();
			const chosen: string[] = [];
			for (const person of c.certain) {
				const replacement = pickReplacement(used, degree.get(person) ?? 0);
				if (replacement) {
					chosen.push(replacement);
					used.add(replacement);
				}
			}
			return { certain: chosen.sort(), dates: [dateToUtc(c.date)] };
		})
	);

	const randomCounts = nullCounts(() =>
		cohorts.map(() => {
			const at = floor + Math.floor(random() * (cutoff - floor));
			return { ...cohortAt(ds, at), dates: [at] };
		})
	);

	const realCount = paths12.primary.length + paths23.primary.length;
	const summarise = (counts: number[]) => {
		const sorted = [...counts].sort((a, b) => a - b);
		return {
			trials,
			min: sorted[0] ?? 0,
			median: sorted[Math.floor(sorted.length / 2)] ?? 0,
			max: sorted[sorted.length - 1] ?? 0,
			atLeastReal: counts.filter((c) => c >= realCount).length
		};
	};

	const edgeKinds: Record<string, number> = {};
	for (const e of edges) edgeKinds[e.kind] = (edgeKinds[e.kind] ?? 0) + 1;

	return {
		parameters: {
			cohortDates: dates,
			minAuthority: MIN_AUTHORITY,
			maxPathEdges: MAX_PATH_EDGES,
			successionMaxGapYears: ds.meta.successionMeta?.gapYears ?? 1,
			nullTrials: trials,
			seed,
			cutoff
		},
		cohorts: cohorts.map((c) => ({ date: c.date, certain: c.certain, watch: c.watch })),
		personnel: { spanning, crossings },
		edges: { total: edges.length, byKind: edgeKinds },
		paths: {
			cohort1to2: { primary: paths12.primary, secondary: paths12.secondary, excluded: paths12.excluded },
			cohort2to3: { primary: paths23.primary, secondary: paths23.secondary, excluded: paths23.excluded }
		},
		nullControls: { shuffledCohorts: summarise(shuffledCounts), randomDates: summarise(randomCounts) }
	};
}

/** Live source exceptions, keyed kind:id, matching the V25 escape register. */
export function loadExceptionKeys(): Set<string> {
	const path = join(ROOT, 'data', 'source-exceptions.yaml');
	if (!existsSync(path)) return new Set();
	const rows = (parseYaml(readFileSync(path, 'utf8')) ?? []) as { rule: string; kind: string; id: string }[];
	return new Set(rows.map((r) => `${r.kind}:${r.id}`));
}

/**
 * Structural CSV rows: one per primary path, derived from the probe.
 *
 * The review columns stay blank here; a verdict belongs to the reviewer, not to
 * the compiler. Grades and source paths are read from the records the edge
 * actually sits on, so a triage row can be traced back to `positions.yaml`
 * without anyone re-deriving it.
 */
function structuralRows(result: ContinuityResult, ds: DatasetLike, exceptionKeys: Set<string>) {
	const edgeById = new Map(buildEdges(ds, exceptionKeys).map((e) => [e.id, e]));
	const posById = new Map(ds.positions.map((p) => [p.id, p]));
	const relById = new Map(ds.relationships.map((r) => [r.id, r]));
	const dates = result.parameters.cohortDates;
	const segments: [string, string, ContinuityPath[]][] = [
		['c1c2', `${dates[0]}->${dates[1]}`, result.paths.cohort1to2.primary],
		['c2c3', `${dates[1]}->${dates[2]}`, result.paths.cohort2to3.primary]
	];

	const out: {
		path_id: string;
		cohort_pair: string;
		index: string;
		nodes: string;
		edges: string;
		edge_kinds: string;
		edge_grades: string;
		source_paths: string;
	}[] = [];

	for (const [seg, pair, paths] of segments) {
		paths.forEach((path, i) => {
			const kinds: string[] = [];
			const grades: string[] = [];
			const sources: string[] = [];
			for (const id of path.edges) {
				const e = edgeById.get(id);
				kinds.push(e?.kind ?? id.split(':')[0]);
				const a = e ? posById.get(e.from) : undefined;
				const b = e ? posById.get(e.to) : undefined;
				const rel = e && relById.has(id) ? relById.get(id) : undefined;
				const conf = e
					? `${a?.confidence ?? e.confidence}+${b?.confidence ?? e.confidence}`
					: '';
				grades.push(e ? `${e.basis}(${conf})` : '');
				const ids = [
					...new Set([...(a?.sources ?? []), ...(b?.sources ?? []), ...(rel?.sources ?? [])])
				];
				sources.push(ids.join('+'));
			}
			out.push({
				path_id: `h1-net-${seg}-p${i}`,
				cohort_pair: pair,
				index: String(i),
				nodes: path.nodes.join(';'),
				edges: path.edges.join(';'),
				edge_kinds: kinds.join(';'),
				edge_grades: grades.join(';'),
				source_paths: sources.join(';')
			});
		});
	}
	return out;
}

const REVIEW_CSV = 'output/network-continuity-review.csv';

function main(): void {
	// The engine owns time; install the jurisdiction parameters before any
	// predicate runs, exactly as the build does.
	configureTime(loadParameters(join(ROOT, 'data', 'parameters.yaml')).time);
	const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8')) as DatasetLike;
	const exceptionKeys = loadExceptionKeys();
	const result = computeNetworkContinuity(ds, { exceptionKeys });
	mkdirSync(join(ROOT, 'output'), { recursive: true });
	mkdirSync(join(ROOT, 'src', 'generated'), { recursive: true });

	/*
	 * The triage file is both input and output: verdicts survive a rebuild only
	 * for paths whose nodes and edges are unchanged, so a probe that starts
	 * publishing a different chain reopens that row instead of inheriting a
	 * verdict written for a path that no longer exists.
	 */
	const csvPath = join(ROOT, REVIEW_CSV);
	const existing = existsSync(csvPath) ? parseReviewCsv(readFileSync(csvPath, 'utf8')) : [];
	const merged = mergeRows(buildRows(structuralRows(result, ds, exceptionKeys)), existing);
	writeFileSync(csvPath, renderReviewCsv(merged.rows), 'utf8');
	result.review = summarize(merged.rows, REVIEW_CSV);

	const json = JSON.stringify(result, null, 2) + '\n';
	writeFileSync(join(ROOT, 'output', 'network-continuity.json'), json, 'utf8');
	writeFileSync(join(ROOT, 'src', 'generated', 'network-continuity.json'), json, 'utf8');
	const p12 = result.paths.cohort1to2.primary.length;
	const p23 = result.paths.cohort2to3.primary.length;
	const r = result.review;
	console.log(
		`  network continuity: ${result.personnel.spanning.length} person(s) span all three dates; ` +
			`${p12} primary path(s) 1987→2011, ${p23} 2011→2021; ` +
			`nulls ${result.nullControls.shuffledCohorts.median}/${result.nullControls.randomDates.median} median; ` +
			`triage ${r.reviewed}/${r.total} reviewed (${r.refuted} refuted)`
	);
	if (merged.dropped.length) {
		console.log(
			`  review rows no longer matching any published path: ${merged.dropped.map((d) => d.path_id).join(', ')} — retriage or retire them`
		);
	}
	if (r.unreviewed) {
		console.log(`  ${r.unreviewed} primary path(s) carry no verdict yet — fill them in on ${REVIEW_CSV}`);
	}
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) main();
