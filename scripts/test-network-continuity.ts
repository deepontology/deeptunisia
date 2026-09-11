/**
 * Network continuity gate (Phase 10D).
 *
 * The probe's question is falsifiable, so its answer has to be reproducible:
 * this suite asserts that the personnel reading still holds on the emitted
 * graph, that the path query is deterministic, that the published output
 * matches a recompute, and that the locked definitions behave as written on
 * hand-worked fixtures — a valid bridge counts, a weak grade is demoted, an
 * unsubstantiated edge is excluded, a family tie is not an edge, and a chain
 * whose steps run backwards in time is rejected.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureTime } from './dates.ts';
import { loadParameters } from './parameters.ts';
import {
	computeNetworkContinuity,
	loadExceptionKeys,
	MIN_AUTHORITY,
	MAX_PATH_EDGES
} from './network-continuity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
configureTime(loadParameters(join(ROOT, 'data', 'parameters.yaml')).time);

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = ''): void {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

console.log('\n  ── network continuity: the published graph ──\n');

const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8')) as Record<string, unknown>;
const exceptionKeys = loadExceptionKeys();
const result = computeNetworkContinuity(ds as never, { exceptionKeys });

ok(
	'personnel: no individual is certainly in post at all three rupture dates',
	result.personnel.spanning.length === 0,
	result.personnel.spanning.join(', ') || `${result.personnel.crossings.length} two-date crossing(s)`
);
ok(
	'cohorts: every rupture date resolves a non-empty command cohort',
	result.cohorts.every((c) => c.certain.length > 0),
	result.cohorts.map((c) => `${c.date}:${c.certain.length}`).join(' ')
);
ok(
	'cohorts: the authority floor is published with the result',
	result.parameters.minAuthority === MIN_AUTHORITY && MAX_PATH_EDGES === 3,
	`floor ${result.parameters.minAuthority}, max ${result.parameters.maxPathEdges} edges`
);

const again = computeNetworkContinuity(ds as never, { exceptionKeys });
ok(
	'deterministic: the same dataset produces the same result',
	JSON.stringify(result) === JSON.stringify(again),
	`${result.paths.cohort1to2.primary.length}+${result.paths.cohort2to3.primary.length} primary path(s)`
);

const outPath = join(ROOT, 'output', 'network-continuity.json');
if (existsSync(outPath)) {
	ok(
		'output/network-continuity.json matches the recompute',
		readFileSync(outPath, 'utf8') === JSON.stringify(result, null, 2) + '\n',
		existsSync(outPath) ? 'published' : 'missing'
	);
}
ok(
	'null controls: the real count is published beside its null distribution',
	result.nullControls.shuffledCohorts.trials === result.parameters.nullTrials &&
		result.nullControls.randomDates.trials === result.parameters.nullTrials,
	`shuffled atLeastReal ${result.nullControls.shuffledCohorts.atLeastReal}/${result.parameters.nullTrials}, ` +
		`random ${result.nullControls.randomDates.atLeastReal}/${result.parameters.nullTrials}`
);

console.log('\n  ── network continuity: hand-worked fixtures ──\n');

const D = (s: string) => Date.parse(`${s}T00:00:00Z`);
const iv = (a: string, b: string) => ({
	startEarliest: D(a),
	startLatest: D(a),
	endEarliest: D(b),
	endLatest: D(b),
	status: 'ended',
	lastObserved: D(b),
	raw: { start: a, end: b }
});
const fixture = (positions: unknown[], relationships: unknown[] = []) => ({
	meta: { cutoff: D('2026-01-01'), floor: D('1956-03-20'), successionMeta: { gapYears: 1 } },
	roles: [{ id: 'r-cmd', institution: 'i-sec', authority: 60 }],
	institutions: [{ id: 'i-sec', layer: 'security' }],
	sources: [
		{ id: 's1', tier: 1 },
		{ id: 's4', tier: 4 }
	],
	positions,
	relationships
});
const pos = (id: string, holder: string, a: string, b: string, basis = 'documented', sources = ['s1']) => ({
	id,
	role: 'r-cmd',
	holder,
	interval: iv(a, b),
	basis,
	confidence: 'A',
	sources
});
const rel = (
	id: string,
	from: string,
	to: string,
	type: string,
	a: string,
	b: string,
	basis = 'documented',
	sources = ['s1'],
	subtype?: string
) => ({ id, from, to, type, subtype, interval: iv(a, b), basis, confidence: 'A', sources });

const DATES = ['2001-01-01', '2006-01-01', '2012-01-01'];
const run = (data: unknown) =>
	computeNetworkContinuity(data as never, { dates: DATES, nullTrials: 4, seed: 7, exceptionKeys: new Set() });

// Strict gaps between tenures so the only edges are the successions; touching
// intervals would add one-point co-memberships and blur the fixture.
const chain = fixture([
	pos('p-a', 'alice', '2000-01-01', '2001-06-01'),
	pos('p-b', 'bob', '2002-01-01', '2005-01-01'),
	pos('p-d', 'dave', '2005-06-01', '2010-06-01'),
	pos('p-c', 'carol', '2011-01-01', '2020-01-01')
]);
const good = run(chain);
ok(
	'fixture: a time-ordered chain of graded successions counts as a primary bridge',
	good.paths.cohort1to2.primary.length === 1 &&
		good.paths.cohort1to2.primary[0].nodes.join('>') === 'alice>bob>dave' &&
		good.paths.cohort2to3.primary.length === 1,
	`${good.paths.cohort1to2.primary.length}/${good.paths.cohort2to3.primary.length} primary`
);

const weak = run(
	fixture([
		pos('p-a', 'alice', '2000-01-01', '2001-06-01'),
		pos('p-b', 'bob', '2002-01-01', '2005-01-01', 'inferred'),
		pos('p-d', 'dave', '2005-06-01', '2010-06-01', 'inferred'),
		pos('p-c', 'carol', '2011-01-01', '2020-01-01')
	])
);
ok(
	'fixture: an inferred-only chain is demoted to secondary, never primary',
	weak.paths.cohort1to2.primary.length === 0 && weak.paths.cohort1to2.secondary.length === 1,
	`primary ${weak.paths.cohort1to2.primary.length}, secondary ${weak.paths.cohort1to2.secondary.length}`
);

const excluded = run(
	fixture([
		pos('p-a', 'alice', '2000-01-01', '2001-06-01'),
		pos('p-b', 'bob', '2002-01-01', '2005-01-01', 'unsubstantiated', ['s4']),
		pos('p-d', 'dave', '2005-06-01', '2010-06-01', 'unsubstantiated', ['s4']),
		pos('p-c', 'carol', '2011-01-01', '2020-01-01', 'unsubstantiated', ['s4'])
	])
);
ok(
	'fixture: an unsubstantiated edge excludes the path from the count entirely',
	excluded.paths.cohort1to2.primary.length === 0 && excluded.paths.cohort1to2.secondary.length === 0,
	`excluded ${excluded.paths.cohort1to2.excluded}`
);

const family = run(
	fixture(
		[pos('p-a', 'alice', '2000-01-01', '2001-06-01'), pos('p-d', 'dave', '2005-06-01', '2011-01-01')],
		[rel('r-fam', 'alice', 'dave', 'family', '2005-06-01', '2011-01-01')]
	)
);
ok(
	'fixture: a family tie is not an allowed edge, so it bridges nothing',
	(family.edges.byKind['co-membership'] ?? 0) === 0 && family.paths.cohort1to2.primary.length === 0,
	`edges ${family.edges.total}`
);

const backwards = run(
	fixture(
		[pos('p-a', 'alice', '2000-01-01', '2002-01-01'), pos('p-d', 'dave', '2005-06-01', '2011-01-01')],
		[
			rel('r-1', 'alice', 'bob', 'appointment', '2005-01-01', '2010-01-01'),
			rel('r-2', 'bob', 'dave', 'appointment', '1990-01-01', '1991-01-01')
		]
	)
);
ok(
	'fixture: a chain whose steps run backwards in time is rejected',
	backwards.paths.cohort1to2.primary.length === 0 && backwards.paths.cohort1to2.secondary.length === 0,
	`${backwards.paths.cohort1to2.primary.length + backwards.paths.cohort1to2.secondary.length} path(s)`
);

console.log(
	`\n  ${checks - failures}/${checks} network-continuity checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
