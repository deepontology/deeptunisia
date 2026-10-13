/**
 * The daily commitment and its verifier (community/research-commitment.ts,
 * scripts/ledger-verify.ts): what goes into a fingerprint, what does not, and
 * that the checks a reader runs catch what they claim to catch.
 *
 * Usage: `npx tsx scripts/test-ledger.ts`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { compileInstrument, type InstrumentDocument } from '../community/research-contract.ts';
import {
	canonicalJson,
	commitMonth,
	monthDigest,
	periodStart,
	previousPeriod,
	releaseRow,
	type ReleaseRow
} from '../community/research-commitment.ts';
import { aggregateSeries, periodOf, repeatCheck } from '../community/research-scoring.ts';
import { closedEntry, verifyLedger, verifyRelease, type LedgerEntry } from './ledger-verify.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
let checks = 0;
let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (!condition) failures++;
	console.log(`  ${condition ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const police = compileInstrument(
	parseYaml(
		readFileSync(join(HERE, '..', 'research', 'portal', 'study-002', 'instrument-v0.yaml'), 'utf8')
	) as InstrumentDocument
);
const spec = police.scoring!;

console.log('\n  ── the released form ──\n');

const stored = {
	period: '2026-11',
	instrument_hash: police.hash,
	locale: 'ar',
	revision: null,
	completion_ms: 241_987,
	answers: { pti_t1: 4, demo_governorate: 'kasserine' }
};
const released = releaseRow(spec, stored);
ok('the governorate leaves as its region', released.answers.demo_governorate === 'centre_west');
ok('the completion time leaves in whole seconds', released.completion_s === 241);
ok(
	'nothing finer than the month, and no receipt or link code, is in the released form',
	JSON.stringify(Object.keys(released).sort()) ===
		JSON.stringify(['answers', 'completion_s', 'instrument_hash', 'locale', 'period', 'revision'])
);
ok(
	'an answer outside every region group is kept as given',
	releaseRow(spec, { ...stored, answers: { demo_governorate: 'abroad' } }).answers.demo_governorate === 'abroad'
);
ok('the stored row is not modified', stored.answers.demo_governorate === 'kasserine');
ok('canonical JSON ignores key order', canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }) === canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));

console.log('\n  ── the month fingerprint ──\n');

const rowA = releaseRow(spec, stored);
const rowB = releaseRow(spec, { ...stored, answers: { pti_t1: 9 } });
const base = await monthDigest([rowA, rowB]);
ok('the fingerprint does not depend on storage order', base === (await monthDigest([rowB, rowA])));
ok('one changed answer changes it', base !== (await monthDigest([rowA, releaseRow(spec, { ...stored, answers: { pti_t1: 8 } })])));
ok('an added row changes it', base !== (await monthDigest([rowA, rowB, rowB])));
ok('a removed row changes it', base !== (await monthDigest([rowA])));
ok('two identical answers are two rows, not one', (await monthDigest([rowA])) !== (await monthDigest([rowA, rowA])));

console.log('\n  ── months and their boundaries ──\n');

ok('the month before January is December', previousPeriod('2027-01') === '2026-12');
ok(
	'a month starts at midnight Tunisia time',
	periodOf(periodStart('2026-11', 60), 60) === '2026-11' && periodOf(periodStart('2026-11', 60) - 1, 60) === '2026-10'
);

console.log('\n  ── the ledger checks ──\n');

const month = (period: string, closed: boolean, received: number, withdrawn: number, replaced: number, rows: ReleaseRow[]) =>
	commitMonth(period, closed, { received, withdrawn, replaced }, rows);
const entry = async (recorded_at: string, current: Promise<any>, previous: Promise<any>): Promise<LedgerEntry> => ({
	recorded_at,
	study: 'dt-research-002',
	current: await current,
	previous: await previous
});
const october = await month('2026-10', true, 0, 0, 0, []);
const good = [
	await entry('2026-11-01T23:20:00Z', month('2026-11', false, 1, 0, 0, [rowA]), Promise.resolve(october)),
	await entry('2026-11-02T23:20:00Z', month('2026-11', false, 3, 1, 0, [rowA, rowB]), Promise.resolve(october))
];
ok('a consistent ledger passes', verifyLedger(good).length === 0, verifyLedger(good).join('; '));

const vanished = [...good, await entry('2026-11-03T23:20:00Z', month('2026-11', false, 3, 1, 0, [rowA]), Promise.resolve(october))];
ok('a row gone without a withdrawal breaks the sum', verifyLedger(vanished).some((p) => p.includes('received - withdrawn - replaced')));

const shrunk = [...good, await entry('2026-11-03T23:20:00Z', month('2026-11', false, 2, 0, 0, [rowA, rowB]), Promise.resolve(october))];
ok('a counter that goes down is reported', verifyLedger(shrunk).some((p) => p.includes('received went down')));

const novemberClosed = await month('2026-11', true, 3, 1, 0, [rowA, rowB]);
const rewritten = [
	await entry('2026-12-01T23:20:00Z', month('2026-12', false, 0, 0, 0, []), Promise.resolve(novemberClosed)),
	await entry('2026-12-02T23:20:00Z', month('2026-12', false, 0, 0, 0, []), month('2026-11', true, 4, 1, 0, [rowA, rowB, rowB]))
];
ok('a closed month recorded differently later is reported', verifyLedger(rewritten).some((p) => p.includes('recorded differently')));

console.log('\n  ── a release against its closed month ──\n');

const final = closedEntry(rewritten, '2026-11')!;
ok('the closed entry is found', final !== null && final.stored === 2);
ok('the released rows match their month', (await verifyRelease([rowB, rowA], final)).length === 0);
ok('a row added to the release is caught', (await verifyRelease([rowA, rowB, rowB], final)).length > 0);
ok(
	'a changed answer in the release is caught',
	(await verifyRelease([rowA, releaseRow(spec, { ...stored, answers: { pti_t1: 1 } })], final)).some((p) => p.includes('fingerprint'))
);

console.log('\n  ── the repeat check ──\n');

const answers = (t: number) => ({
	pti_t1: t, pti_t2: t, pti_t3: t, pti_t4: t, pti_t5: t,
	pti_s1: 5, pti_s2: 5, pti_s3: 5, pti_s4: 5,
	pti_g1: 6, pti_g2: 4, pti_g3: 6, pti_g4: 6, pti_g5: 6, pti_g6: 6,
	pti_e1: 'no', pti_e5: ['none'], pti_s6: ['none']
});
const options = { seed: 1, resamples: 50 };
const few = [
	...Array.from({ length: 100 }, () => ({ answers: answers(5), revision: null })),
	...Array.from({ length: 5 }, () => ({ answers: answers(9), revision: 'update' })),
	{ answers: answers(9), revision: 'replaced' }
];
const fewCheck = repeatCheck(spec, few, options);
ok('each kind is counted', fewCheck.replaced === 1 && fewCheck.updated === 5 && fewCheck.same_device === 0, JSON.stringify(fewCheck));
ok('below the cell floor there is no figure without them', fewCheck.index_without_repeats === null);
const many = [...few, ...Array.from({ length: 20 }, () => ({ answers: answers(9), revision: 'same-device' }))];
const manyCheck = repeatCheck(spec, many, options);
ok(
	'at the cell floor the index without possible repeats is published',
	manyCheck.index_without_repeats !== null && manyCheck.same_device === 20,
	JSON.stringify(manyCheck)
);

// The two counterfactuals read together (Greptile's case): 100 ordinary answers,
// 20 updates through the largest link, and one organic same-device answer. Each
// passes its own floor, but the two "without" figures would differ by exactly
// that one answer, so the repeat figure is withheld.
{
	const now = Date.now();
	const ordinary = Array.from({ length: 100 }, (_, i) => ({ answers: answers(4 + (i % 3)), channel: 'organic', revision: null, submittedAt: now - 1000 }));
	const viaLink = Array.from({ length: 20 }, () => ({ answers: answers(9), channel: 'wave', revision: 'update', submittedAt: now - 1000 }));
	const lone = { answers: answers(1), channel: 'organic', revision: 'same-device', submittedAt: now - 1000 };
	const series = aggregateSeries(spec, [...ordinary, ...viaLink, lone], { ...options, now })!;
	ok(
		'two counterfactuals that differ by one answer do not both publish',
		series.window!.links.index_without_largest !== null && series.window!.repeats.index_without_repeats === null,
		JSON.stringify({ links: series.window!.links.index_without_largest, repeats: series.window!.repeats })
	);
	const many = Array.from({ length: 20 }, () => ({ ...lone }));
	const safe = aggregateSeries(spec, [...ordinary, ...viaLink, ...many], { ...options, now })!;
	ok(
		'with twenty such answers both are published',
		safe.window!.links.index_without_largest !== null && safe.window!.repeats.index_without_repeats !== null
	);
}

console.log(`\n   ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
