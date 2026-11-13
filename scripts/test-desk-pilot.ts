/**
 * The pilot sample: sixty fixed records, and the desk's queue in the file's order.
 *
 * The sample is committed, so this test's first job is to prove the committed
 * file is what the sampler produces today: the same seed, the same dataset, the
 * same bytes. A sample that silently redraws itself between runs is not a
 * sample, it is a queue with a story.
 *
 * It then checks the file describes real records, that every non-empty stratum
 * is represented, and that a desk session started in pilot mode serves the
 * records in exactly the file's order.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminServer } from './admin.ts';
import { DeskSession, REVIEWABLE, type Kind } from './desk.ts';
import {
	PILOT_FILE,
	PILOT_HEADER,
	PILOT_SEED,
	PILOT_SIZE,
	pilotDigest,
	pilotQueue,
	pilotSample,
	readPilotSample,
	renderPilotSample
} from './desk-pilot-sample.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` - ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
	}
}

const dataset = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));
const committedText = readFileSync(join(ROOT, PILOT_FILE), 'utf8');
const entries = readPilotSample(ROOT);
const sample = pilotSample(dataset, PILOT_SEED, PILOT_SIZE);

console.log('\n  ── the sample is fixed and regenerable ──\n');

{
	const regenerated = renderPilotSample(dataset, PILOT_SEED, PILOT_SIZE);
	ok('rerunning the sampler gives the committed file byte for byte', regenerated === committedText, `${regenerated.length} vs ${committedText.length} bytes`);
	ok('the file uses LF line endings', !committedText.includes('\r'), committedText.includes('\r') ? 'CR found' : 'LF only');
	ok('the file has the header and 60 records', committedText.split('\n')[0] === PILOT_HEADER && entries.length === PILOT_SIZE, `${entries.length} records`);
	ok('the sample size is 60 and the seed is fixed', PILOT_SIZE === 60 && PILOT_SEED === 'pilot-2026-11');
	ok('a different seed draws a different sample', renderPilotSample(dataset, 'pilot-2026-12', PILOT_SIZE) !== committedText);
	ok('the sampler is deterministic across two calls', JSON.stringify(pilotSample(dataset, PILOT_SEED, PILOT_SIZE)) === JSON.stringify(sample));
}

console.log('\n  ── every line describes a record the desk can verify ──\n');

{
	const index = new Map<string, any>();
	for (const kind of Object.keys(REVIEWABLE) as Kind[]) {
		for (const record of (dataset[kind] ?? []) as any[]) index.set(`${kind}/${record.id}`, record);
	}
	const unknown = entries.filter((e) => !index.has(`${e.kind}/${e.id}`));
	ok('every id exists in the dataset with that kind', unknown.length === 0, unknown.slice(0, 3).map((e) => `${e.kind}/${e.id}`).join(', '));

	const wrongBasis = entries.filter((e) => index.get(`${e.kind}/${e.id}`)?.basis !== e.basis);
	ok('every line carries the record basis', wrongBasis.length === 0, wrongBasis.slice(0, 3).map((e) => e.id).join(', '));

	const reviewed = entries.filter((e) => index.get(`${e.kind}/${e.id}`)?.review);
	ok('no drawn record already carries a review', reviewed.length === 0, reviewed.slice(0, 3).map((e) => e.id).join(', '));

	const uncited = entries.filter((e) => ((index.get(`${e.kind}/${e.id}`)?.sources ?? []) as unknown[]).length === 0);
	ok('every drawn record cites at least one source', uncited.length === 0, uncited.slice(0, 3).map((e) => e.id).join(', '));

	const keys = entries.map((e) => `${e.kind}/${e.id}`);
	ok('no record is drawn twice', new Set(keys).size === keys.length, `${keys.length} entries, ${new Set(keys).size} unique`);
}

console.log('\n  ── every non-empty stratum is represented ──\n');

{
	const strata = new Map<string, number>();
	for (const kind of Object.keys(REVIEWABLE) as Kind[]) {
		for (const record of (dataset[kind] ?? []) as any[]) {
			if (!Array.isArray(record.sources) || !record.sources.length || record.review) continue;
			const key = `${kind}/${record.basis ?? ''}`;
			strata.set(key, (strata.get(key) ?? 0) + 1);
		}
	}
	const drawn = new Map<string, number>();
	for (const e of entries) drawn.set(`${e.kind}/${e.basis}`, (drawn.get(`${e.kind}/${e.basis}`) ?? 0) + 1);

	const empty = [...strata.keys()].filter((k) => !drawn.get(k));
	ok('every stratum with eligible records is represented', empty.length === 0, empty.join(', '));

	const short = sample.allocation.filter((a) => a.allocated < a.minimum);
	ok('every stratum gets its floor: 2, or 1 when only one record exists', short.length === 0, short.map((a) => `${a.kind}/${a.basis} ${a.allocated} < ${a.minimum}`).join(', '));

	const total = sample.allocation.reduce((n, a) => n + a.allocated, 0);
	ok('the allocation is exactly 60 seats', total === 60, String(total));
	ok('no stratum is given more records than it holds', sample.allocation.every((a) => a.allocated <= a.eligible));
}

console.log('\n  ── the pilot queue is the file, in order ──\n');

{
	const queue = pilotQueue(ROOT);
	ok('every record the file names still exists', queue.missing.length === 0, queue.missing.join(', '));
	ok('the queue has 60 records', queue.items.length === 60, String(queue.items.length));
	ok(
		'the queue keeps the file order',
		queue.items.every((item, i) => item.kind === entries[i].kind && item.id === entries[i].id),
		`${queue.items[0]?.kind}/${queue.items[0]?.id} first`
	);

	const session = new DeskSession({ root: ROOT, now: () => Date.UTC(2026, 10, 13, 9, 0, 0), queue: () => queue.items });
	const served: string[] = [];
	for (let i = 0; i < 60; i++) {
		const packet = session.next();
		if (!packet) break;
		served.push(`${packet.kind}/${packet.id}`);
		// A packet is left behind when the reviewer judges or skips it. Skipping
		// writes nothing, so this walks the order without touching data/.
		session.skip(packet.kind, packet.id);
	}
	ok('a pilot session serves the file records in exactly the file order', served.join('\n') === entries.map((e) => `${e.kind}/${e.id}`).join('\n'), `${served.length} served`);
	ok('the sample is exhausted after 60 packets', session.next() === null && session.state().seen === served.length);
	ok('the order is the digest order, so it is stable', entries.every((e, i) => i === 0 || pilotDigest(PILOT_SEED, entries[i - 1].kind, entries[i - 1].id) <= pilotDigest(PILOT_SEED, e.kind, e.id)));
}

console.log('\n  ── the tool in pilot mode serves that queue ──\n');

{
	// The server reads the sample and the dataset; skipping is in memory, so this
	// walks the first two packets without writing anything into data/.
	const server = createAdminServer({ root: ROOT, pilot: true, now: () => Date.UTC(2026, 10, 13, 9, 0, 0) });
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${(server.address() as any).port}`;
	const first = await (await fetch(base + '/api/packet')).json();
	ok('the first packet is the first record of the sample file', first.packet.kind === entries[0].kind && first.packet.id === entries[0].id);
	ok('the packet response carries the pilot line', first.pilot.total === 60 && first.pilot.seen === 0, JSON.stringify(first.pilot));
	await fetch(base + '/api/skip', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ kind: first.packet.kind, id: first.packet.id })
	});
	const second = await (await fetch(base + '/api/packet')).json();
	ok('the second packet is the second line of the file', second.packet.kind === entries[1].kind && second.packet.id === entries[1].id);
	ok('the pilot line counts the skipped record', second.pilot.seen === 1 && second.pilot.total === 60, JSON.stringify(second.pilot));
	const page = await (await fetch(base + '/')).text();
	ok('the page prints the pilot line', page.includes("pilot: ") && page.includes('pilotInfo.total'));
	ok('the page says the sample is exhausted and points at Finish session', page.includes('Pilot sample complete') && page.includes('Use Finish session'));
	server.close();
}

console.log(`\n${checks - failures}/${checks} checks passed\n`);
if (failures) process.exit(1);
