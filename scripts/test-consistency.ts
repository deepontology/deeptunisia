/**
 * Assertions over the narrative ↔ canonical consistency check (M2).
 *
 * The check exists because free prose once dated an event seven years away from
 * the record that carries it, and nothing noticed. What is worth testing here is
 * therefore the two directions of the contract:
 *
 *   1. The known conflict fails. A reference that places Bennour back at the
 *      DGSN in 2018 — the sentence the graph used to carry — must be an error
 *      that names its file and claim id. The corrected reference, 2011-03-02,
 *      must pass. Those two fixtures are the reason this file exists.
 *   2. The shipped graph is clean. Every reference the repository now declares
 *      resolves against a canonical position and falls inside its interval, so
 *      a future edit that quietly moves a date fails here rather than reaching
 *      a reader.
 *
 * The warning half matters too, but for the opposite reason: a claim that
 * declares nothing must be reported as unchecked, never silently assumed
 * checked, and the warning must name the file and the claim id so the backlog
 * can be worked through.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNarrative, unreferencedCount, type CanonicalPosition, type NarrativeClaim } from './consistency.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const ds = () => JSON.parse(read('src/generated/dataset.json'));

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const CUTOFF = ms('2026-09-10');

/**
 * The canonical records the conflict turns on, as `positions.yaml` carries
 * them: two DGSN tenures, the second starting 2011-03-02 and ending with the
 * approximation `~2012` (2013-12-31 at the year's outer bound).
 */
const bennourPositions: CanonicalPosition[] = [
	{
		id: 'p-dgsn-bennour-1',
		holder: 'abdessatar-bennour',
		role: 'dg-national-security',
		start: '2006-06-05',
		end: '~2008',
		sources: ['leaders-ammar-2011'],
		interval: { startEarliest: ms('2006-06-05'), endLatest: ms('2009-12-31') }
	},
	{
		id: 'p-dgsn-bennour-2',
		holder: 'abdessatar-bennour',
		role: 'dg-national-security',
		start: '2011-03-02',
		end: '~2012',
		sources: ['webdo-bennour-2011'],
		interval: { startEarliest: ms('2011-03-02'), endLatest: ms('2013-12-31') }
	},
	{
		id: 'p-dgsn-unsourced',
		holder: 'someone-unsourced',
		role: 'dg-national-security',
		start: '2020-01-01',
		end: '2020-12-31',
		sources: [],
		interval: { startEarliest: ms('2020-01-01'), endLatest: ms('2020-12-31') }
	}
];

const claim = (
	on: string,
	overrides: Partial<NarrativeClaim> = {}
): NarrativeClaim => ({
	file: 'hypotheses.yaml',
	id: 'h2-institutional-continuity',
	sources: ['carnegie-quiet-revolution'],
	references: [{ person: 'abdessatar-bennour', role: 'dg-national-security', on }],
	...overrides
});

// ── 1. the known conflict ───────────────────────────────────────────────────

console.log('\n  ── the known conflict: fails before the correction, passes after ──\n');
{
	const before = checkNarrative([claim('2018-03-01')], bennourPositions, CUTOFF);
	ok('the pre-correction reference is rejected', before.errors.length === 1, `${before.errors.length} error(s)`);
	ok(
		'the error names the file and the claim id',
		before.errors.some((e) => e.where === 'hypotheses.yaml [h2-institutional-continuity]'),
		before.errors[0]?.where
	);
	ok(
		'the error says it contradicts, not that it is missing',
		/contradicts the canonical record/.test(before.errors[0]?.message ?? ''),
		before.errors[0]?.message?.slice(0, 140)
	);
	ok(
		'the error quotes the canonical span so it can be acted on',
		/p-dgsn-bennour-2 2011-03-02/.test(before.errors[0]?.message ?? ''),
		before.errors[0]?.message
	);

	const after = checkNarrative([claim('2011-03-02')], bennourPositions, CUTOFF);
	ok('the corrected reference passes', after.errors.length === 0, after.errors[0]?.message);

	const firstTerm = checkNarrative([claim('2006-06-05')], bennourPositions, CUTOFF);
	ok('the first term passes too', firstTerm.errors.length === 0, firstTerm.errors[0]?.message);

	// The far side of the same interval: a date after the approximation's bound.
	const afterEnd = checkNarrative([claim('2014-01-01')], bennourPositions, CUTOFF);
	ok('a date past the record is rejected', afterEnd.errors.length === 1, `${afterEnd.errors.length}`);
}

// ── 2. the other failure modes ──────────────────────────────────────────────

console.log('\n  ── what else the check refuses ──\n');
{
	const noRecord = checkNarrative(
		[claim('2011-03-02', { references: [{ person: 'nobody-at-all', role: 'dg-national-security', on: '2011-03-02' }] })],
		bennourPositions,
		CUTOFF
	);
	ok('an unknown person is reported as having no canonical record', noRecord.errors.length === 1);
	ok(
		'and it says positions.yaml holds no such position',
		/no canonical record/.test(noRecord.errors[0]?.message ?? ''),
		noRecord.errors[0]?.message?.slice(0, 120)
	);

	const wrongRole = checkNarrative(
		[claim('2011-03-02', { references: [{ person: 'abdessatar-bennour', role: 'prime-minister', on: '2011-03-02' }] })],
		bennourPositions,
		CUTOFF
	);
	ok('the right person in the wrong role is not a match', wrongRole.errors.length === 1, wrongRole.errors[0]?.message?.slice(0, 120));

	for (const bad of ['2018', '2011-03', 'March 2011', '', '2011-13-01']) {
		const r = checkNarrative([claim(bad)], bennourPositions, CUTOFF);
		ok(`a non-exact date "${bad}" is refused`, r.errors.length >= 1, r.errors[0]?.message?.slice(0, 100));
	}

	const noDate = checkNarrative(
		[claim('2011-03-02', { references: [{ person: 'abdessatar-bennour', role: 'dg-national-security' }] as unknown as NarrativeClaim['references'] })],
		bennourPositions,
		CUTOFF
	);
	ok('a reference with no date is refused', noDate.errors.length === 1, noDate.errors[0]?.message?.slice(0, 100));
}

// ── 3. the warning half ─────────────────────────────────────────────────────

console.log('\n  ── what it warns about rather than failing ──\n');
{
	const noRefs = checkNarrative([{ file: 'questions.yaml', id: 'q-role-source-model', sources: [], references: [] }], bennourPositions, CUTOFF);
	ok('a claim that declares nothing is a warning, not an error', noRefs.errors.length === 0 && noRefs.warnings.length === 1);
	ok(
		'the warning names the file and the claim id',
		noRefs.warnings[0]?.where === 'questions.yaml [q-role-source-model]',
		noRefs.warnings[0]?.where
	);
	ok(
		'the warning says prose is not parsed',
		/never parsed/.test(noRefs.warnings[0]?.message ?? ''),
		noRefs.warnings[0]?.message
	);

	const unsourced = checkNarrative(
		[claim('2020-06-01', { references: [{ person: 'someone-unsourced', role: 'dg-national-security', on: '2020-06-01' }] })],
		bennourPositions,
		CUTOFF
	);
	ok('a reference resting on an unsourced record is a warning', unsourced.errors.length === 0 && unsourced.warnings.length === 1, unsourced.warnings[0]?.message?.slice(0, 120));
	ok('and it names the unsourced record', /p-dgsn-unsourced/.test(unsourced.warnings[0]?.message ?? ''));

	ok('unreferencedCount counts the declared-nothing claims', unreferencedCount([{ id: 'a' }, { id: 'b', references: [] }, { id: 'c', references: [{ person: 'p', on: '2020-01-01' }] }]) === 2);
}

// ── 4. the shipped graph ────────────────────────────────────────────────────

console.log('\n  ── the graph as it stands ──\n');
{
	const d = ds();
	const claims: NarrativeClaim[] = [
		...d.hypotheses.map((h: any) => ({ file: 'hypotheses.yaml', id: h.id, sources: h.sources, references: h.references })),
		...d.hypotheses.flatMap((h: any) =>
			(h.evidence ?? []).map((f: any, i: number) => ({
				file: 'hypotheses.yaml',
				id: `${h.id}/evidence-${i}`,
				sources: f.sources,
				references: f.references
			}))
		),
		...d.questions.map((q: any) => ({ file: 'questions.yaml', id: q.id, sources: q.sources, references: q.references }))
	];
	const report = checkNarrative(claims, d.positions, d.meta.cutoff);
	ok('no declared reference in the shipped graph contradicts a record', report.errors.length === 0, report.errors.slice(0, 3).map((e) => `${e.where}: ${e.message}`).join(' | '));

	const declared = claims.filter((c) => (c.references ?? []).length);
	ok('the graph declares typed references at all', declared.length >= 3, `${declared.length} claim(s)`);

	const warned = new Set(report.warnings.map((w) => w.where));
	ok('h2, which does declare them, is not in the unchecked backlog', !warned.has('hypotheses.yaml [h2-institutional-continuity]'));
	ok('the DGSN sequence question is not in the unchecked backlog', !warned.has('questions.yaml [q-dgsn-sequence-2014-2019]'));
	ok('every unchecked claim is reported, so none is silently assumed checked', warned.size === unreferencedCount(claims), `${warned.size} of ${claims.length}`);

	// The specific dates the correction fixed, checked against the real records.
	const byId = new Map((d.positions as CanonicalPosition[]).map((p) => [p.id, p]));
	const covers = (id: string, iso: string) => {
		const p = byId.get(id);
		return !!p && Date.parse(`${iso}T00:00:00Z`) >= (p.interval?.startEarliest ?? 0) && Date.parse(`${iso}T00:00:00Z`) <= (p.interval?.endLatest ?? d.meta.cutoff);
	};
	ok('p-dgsn-bennour-2 still starts on 2011-03-02', covers('p-dgsn-bennour-2', '2011-03-02'));
	ok('and does not cover the disputed 2018 return', !covers('p-dgsn-bennour-2', '2018-03-01'));
}

// ── 5. ongoing positions against the dataset cutoff ─────────────────────────

console.log('\n  ── ongoing and last-verified against the cutoff ──\n');
{
	const d = ds();
	const cutoff = d.meta.cutoff;
	const bad: string[] = [];
	let ongoing = 0;
	let lastVerified = 0;
	for (const p of d.positions as any[]) {
		const startMs = Date.parse(String(p.start).replace(/^~/, ''));
		if (p.end === 'ongoing') {
			ongoing++;
			if (!Number.isNaN(startMs) && startMs > cutoff) bad.push(`${p.id}: ongoing but starts after the cutoff (${p.start})`);
		}
		if (String(p.end).startsWith('verified:')) {
			lastVerified++;
			const t = Date.parse(String(p.end).slice(9));
			if (!Number.isNaN(t) && t > cutoff) bad.push(`${p.id}: last-verified past the cutoff (${p.end})`);
		}
	}
	ok(`every ongoing position is current at the cutoff (${ongoing} ongoing)`, bad.filter((b) => b.includes('ongoing')).length === 0, bad.filter((b) => b.includes('ongoing')).join('; '));
	ok(`no last-verified interval is extended past the cutoff (${lastVerified} verified ends)`, bad.filter((b) => b.includes('last-verified')).length === 0, bad.filter((b) => b.includes('last-verified')).join('; '));

	// The same rule over every `verified:` token in the graph, not only positions.
	const future: string[] = [];
	const walk = (v: unknown, path: string) => {
		if (typeof v === 'string') {
			for (const m of v.matchAll(/verified:(\d{4}-\d{2}(?:-\d{2})?)/g)) {
				const t = Date.parse(m[1].length === 7 ? `${m[1]}-01` : m[1]);
				if (!Number.isNaN(t) && t > cutoff) future.push(`${path}: ${m[1]}`);
			}
			return;
		}
		if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
		if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}.${k}`);
	};
	walk(d, '$');
	ok('no verified: token anywhere in the graph sits after the cutoff', future.length === 0, future.slice(0, 3).join('; '));
}

console.log(`\n  ${checks - failures}/${checks} consistency checks passed\n`);
if (failures) process.exit(1);
