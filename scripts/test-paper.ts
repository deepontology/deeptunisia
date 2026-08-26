/**
 * Paper drift gate — the corrections release's numbers ARE the build's numbers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The V0.1 release paper hand-typed its dataset figures, and one of them —
 * the §8.2 family sentence — contradicted the emitted audit by the time it
 * shipped. `npm run data` rewrites every `<!--stat:key-->value<!--/stat-->`
 * span in the docs the build owns (README, AGENTS, DESIGN, llms.txt); the
 * corrections paper is the next file in that set. This suite is the gate that
 * makes the paper's promise enforceable: every stat tag in the paper must name
 * a key the build emits, and show exactly the value the build emitted. A
 * hand-edited number fails here, and an unknown key fails here, so prose
 * cannot drift from the graph the way V0.1's did.
 *
 * The required-keys list pins the specific claims the corrections release
 * rests on (W3.1's kin counts, the epistemic mix, the review/queue figures,
 * the coverage audit). A key dropped from the paper — or renamed in the
 * build — fails here instead of shipping a claim nobody can check.
 *
 * Test-first state: this suite fails until
 * `output/deeptunisia-release-paper-v0.1.1.md` lands with its stat tags.
 * The V0.1 file stays untagged and frozen, deliberately outside this gate.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { certainlyActive } from '../src/lib/model.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const PAPER_NAME = 'output/deeptunisia-release-paper-v0.1.1.md';
const PAPER = join(HERE, '..', PAPER_NAME);

const stats: Record<string, string> = JSON.parse(
	readFileSync(join(HERE, '..', 'src', 'generated', 'stats.json'), 'utf8')
);

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const STAT_TAG = /<!--stat:([A-Za-z][A-Za-z0-9-]*)-->([\s\S]*?)<!--\/stat-->/g;

/**
 * Every dataset number the paper's claims depend on (W3's correction set).
 * Missing from the paper = the claim is hand-typed again, which is exactly
 * the failure mode this sprint exists to close.
 */
const REQUIRED_KEYS = [
	'sources',
	'sourcesCited',
	'people',
	'positions',
	'relationships',
	'events',
	'institutions',
	'documented',
	'reported',
	'inferred',
	'unsubstantiated',
	'needsPrimarySource',
	'successionGaps',
	'successionOverlaps',
	'contradictions',
	'reviewed',
	'reviewable',
	'familyEdges',
	'researchQueue',
	'kin-kais-saied',
	'kin-ben-ali',
	'reviewed-documented',
	'reviewed-reported',
	'reviewed-attributed',
	'reviewed-inferred',
	'reviewed-unsubstantiated',
	'reviewable-documented',
	'reviewable-reported',
	'reviewable-attributed',
	'reviewable-inferred',
	'reviewable-unsubstantiated',
	'translatedHuman'
];

if (!existsSync(PAPER)) {
	ok(
		'the v0.1.1 corrections paper exists',
		false,
		`missing ${PAPER_NAME} — the paper must land (with stat tags) before this gate can pass; this is the expected test-first state`
	);
	ok(
		'every required stat key is tagged in the paper',
		false,
		`paper file missing — all ${REQUIRED_KEYS.length} required keys untagged`
	);
	console.log(
		`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
	);
	process.exit(failures > 0 ? 1 : 0);
}

const text = readFileSync(PAPER, 'utf8');

// 1. Every tag IN the paper must name an emitted key and show the emitted value.
{
	const drift: string[] = [];
	const tagged = new Map<string, string>();
	for (const m of text.matchAll(STAT_TAG)) {
		const [, key, shown] = m;
		tagged.set(key, shown);
		if (!(key in stats)) drift.push(`unknown stat key "${key}"`);
		else if (shown !== stats[key]) drift.push(`${key} shows "${shown}", graph says "${stats[key]}"`);
	}
	ok(
		'every stat tag in the paper matches the emitted stats.json',
		drift.length === 0,
		drift.length ? drift.join('; ') : `${tagged.size} tagged figures in sync`
	);
}

// 2. The paper's claims rest on these keys — every one must be tagged.
{
	const tagged = new Set<string>();
	for (const m of text.matchAll(STAT_TAG)) tagged.add(m[1]);
	const missing = REQUIRED_KEYS.filter((k) => !tagged.has(k));
	ok(
		'every required stat key is tagged in the paper',
		missing.length === 0,
		missing.length ? `untagged: ${missing.join(', ')}` : `all ${REQUIRED_KEYS.length} required keys tagged`
	);
}

// 3. Landing drift guard — DENSITY/NODES/EDGES tied to dataset.json hash.
//
// The landing page claims "Nothing is illustrative" and its DENSITY/NODES/EDGES
// arrays are rewritten from src/generated/dataset.json at every build
// (scripts/build-landing.ts). A data change without `npm run build` must fail
// here rather than ship stale visuals. The tie is twofold: the JS arrays must
// equal the computed visuals, and the embedded dataset-hash comment must match
// the current dataset.json hash.
{
	const landingPath = join(HERE, '..', 'landing', 'index.html');
	const datasetPath = join(HERE, '..', 'src', 'generated', 'dataset.json');
	if (!existsSync(landingPath)) {
		ok('landing index.html exists for drift check', false, 'missing landing/index.html');
	} else if (!existsSync(datasetPath)) {
		ok('dataset.json exists for landing drift check', false, 'missing src/generated/dataset.json — run npm run data');
	} else {
		const landing = readFileSync(landingPath, 'utf8');
		const datasetRaw = readFileSync(datasetPath, 'utf8');
		// Recompute the visuals exactly as build-landing.ts does, then compare
		// to the embedded arrays. This catches a hand-edit of the arrays that
		// keeps the hash comment intact. The hash is tied to the visuals
		// themselves (stable), not the file timestamp, so `npm run data` without
		// a graph change does not spuriously fail.
		const d = JSON.parse(datasetRaw) as {
			positions?: { interval?: { startEarliest: number; startLatest: number; endEarliest: number | null; endLatest: number | null } }[];
			relationships?: { from: string; to: string; basis?: string }[];
			people?: { id: string; name_en?: string; layers?: string[] }[];
		};

		const years: number[] = [];
		for (let y = 1956; y <= 2026; y++) years.push(y);
		const expectedDENSITY = years.map(
			(y) => (d.positions || []).filter((p) => p.interval && certainlyActive(p.interval as never, new Date(y, 6, 1).getTime())).length
		);

		const deg = new Map<string, number>();
		for (const r of d.relationships || []) {
			if (!r.from || !r.to) continue;
			deg.set(r.from, (deg.get(r.from) || 0) + 1);
			deg.set(r.to, (deg.get(r.to) || 0) + 1);
		}
		const people = new Map((d.people || []).map((p) => [p.id, p]));
		const top = [...deg.entries()]
			.filter(([id]) => people.has(id))
			.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
			.slice(0, 46);
		const inTop = new Set(top.map(([id]) => id));
		const expectedNODES = top.map(([id, dg]) => {
			const p = people.get(id)!;
			return [id, p.name_en || id, (p.layers && p.layers[0]) || 'political', dg];
		});
		const expectedEDGES = (d.relationships || [])
			.filter((r) => r.from && r.to && inTop.has(r.from) && inTop.has(r.to))
			.map((r) => [r.from, r.to, r.basis || 'reported']);

		const expectedVisuals = { DENSITY: expectedDENSITY, NODES: expectedNODES, EDGES: expectedEDGES };
		const datasetHash = createHash('sha256').update(JSON.stringify(expectedVisuals)).digest('hex').slice(0, 16);
		const landedHash = landing.match(/\/\* dataset-hash: ([0-9a-f]+) \*\//)?.[1] ?? null;
		ok(
			'landing dataset-hash matches dataset.json',
			landedHash === datasetHash,
			landedHash ? `landing ${landedHash} vs dataset ${datasetHash} — run npm run build` : 'no hash comment in landing/index.html — run npm run build'
		);

		const extract = (name: string, prefix: string): unknown | null => {
			const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\[.*?\\]);', 's');
			const m = landing.match(re);
			if (!m) return null;
			try {
				return JSON.parse(m[1]);
			} catch {
				return null;
			}
		};

		const landedDENSITY = extract('DENSITY', 'var DENSITY = ');
		const landedNODES = extract('NODES', 'var NODES = ');
		const landedEDGES = extract('EDGES', 'var EDGES = ');

		ok(
			'landing DENSITY is fresh (matches dataset.json)',
			JSON.stringify(landedDENSITY) === JSON.stringify(expectedDENSITY),
			landedDENSITY ? `${(landedDENSITY as unknown[]).length} values` : 'DENSITY not found — has array syntax changed?'
		);
		ok(
			'landing NODES is fresh (matches dataset.json)',
			JSON.stringify(landedNODES) === JSON.stringify(expectedNODES),
			landedNODES ? `${(landedNODES as unknown[]).length} nodes` : 'NODES not found'
		);
		ok(
			'landing EDGES is fresh (matches dataset.json)',
			JSON.stringify(landedEDGES) === JSON.stringify(expectedEDGES),
			landedEDGES ? `${(landedEDGES as unknown[]).length} edges` : 'EDGES not found'
		);

		// The manifest-checked list: landing/index.html must be covered. A data
		// change that does not rebuild the landing leaves the hash stale; the
		// array check above also catches it, but the hash is the explicit tie
		// the spec names. This single extra ok makes the manifest intent visible.
		ok(
			'landing/index.html is in the drift manifest (hash-tied to dataset.json)',
			Boolean(landedHash && datasetHash),
			`manifest: landing/index.html ↔ src/generated/dataset.json @ ${datasetHash}`
		);
	}
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
