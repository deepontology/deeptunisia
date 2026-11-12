/**
 * The verification desk: packets, verdict writes, timing, undo.
 *
 * The server is started on a copy of `data/`, never on the dataset itself. Each
 * verdict posts to that copy and the test asserts the YAML changed in exactly the
 * expected place and nowhere else: the splicer's guard refuses an edit that moves
 * another record, and this checks the region the write did touch.
 *
 * The copy also holds `src/generated/dataset.json` (the queue and the names come
 * from the built graph), the rubric the packet folds, and a pre-check file, so the
 * packet's source labels are exercised without a network call.
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { createAdminServer } from './admin.ts';
import {
	MAX_IDLE_SECONDS,
	buildPacket,
	claimSentence,
	deskFigure,
	excerptLabel,
	median,
	parseSessions,
	verdictSeconds
} from './desk.ts';
import { PositionSchema, verifiedGrounded } from './schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

const DS = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));

const root = mkdtempSync(join(tmpdir(), 'dt-desk-'));
cpSync(join(ROOT, 'data'), join(root, 'data'), { recursive: true });
mkdirSync(join(root, 'src', 'generated'), { recursive: true });
cpSync(join(ROOT, 'src', 'generated', 'dataset.json'), join(root, 'src', 'generated', 'dataset.json'));
mkdirSync(join(root, 'research', 'study'), { recursive: true });
cpSync(join(ROOT, 'research', 'study', 'rubric-v2.md'), join(root, 'research', 'study', 'rubric-v2.md'));
mkdirSync(join(root, 'research', 'desk'), { recursive: true });

const positionsFile = join(root, 'data', 'positions.yaml');
const readPositions = () => parseYaml(readFileSync(positionsFile, 'utf8')) as any[];
const recordOf = (id: string) => readPositions().find((r) => r.id === id);
const bytes = (file: string) => readFileSync(file, 'utf8');
/** Diffing is line based, so a CRLF data file is folded to LF first. */
const norm = (s: string) => s.replace(/\r\n/g, '\n');

/** True when the two files are identical outside the named record's block. */
function unchangedOutside(before: string, after: string, id: string): boolean {
	const mark = '\u0000';
	return norm(before).replace(block(norm(before), id), mark) === norm(after).replace(block(norm(after), id), mark);
}

/** The record's YAML block, from its first line to the next record. */
function block(text: string, id: string): string {
	const start = text.indexOf(`- id: ${id}\n`);
	if (start === -1) throw new Error(`no block for ${id}`);
	const rest = text.slice(start + 1);
	const next = rest.indexOf('\n- id: ');
	return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next + 1);
}

/** A line diff of one record's block: removed and added runs, in order. */
function lineDiff(a: string, b: string): { removed: string[]; added: string[] }[] {
	const left = a.split('\n');
	const right = b.split('\n');
	const n = left.length;
	const m = right.length;
	if (n > 400 || m > 400) throw new Error(`block too large to diff: ${n} and ${m} lines`);
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const hunks: { removed: string[]; added: string[] }[] = [];
	let i = 0;
	let j = 0;
	const push = (removed: string, added: string) => {
		const last = hunks[hunks.length - 1];
		if (last && last.open) {
			if (removed) last.removed.push(removed);
			if (added) last.added.push(added);
			return;
		}
		hunks.push({ removed: removed ? [removed] : [], added: added ? [added] : [], open: true } as any);
	};
	while (i < n || j < m) {
		if (i < n && j < m && left[i] === right[j]) {
			if (hunks.length) (hunks[hunks.length - 1] as any).open = false;
			i++;
			j++;
		} else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
			push('', right[j++]);
		} else {
			push(left[i++], '');
		}
	}
	return hunks.map(({ removed, added }) => ({ removed, added }));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let clock = Date.UTC(2026, 10, 12, 9, 0, 0);
const server = createAdminServer({ root, now: () => clock });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 5199}`;

const openPacket = (kind: string, id: string) => get(`/api/packet?kind=${kind}&id=${id}`);
const get = async (path: string) => {
	const res = await fetch(base + path);
	return { status: res.status, body: await res.json() };
};
const post = async (path: string, body: unknown = {}) => {
	const res = await fetch(base + path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { status: res.status, body: await res.json() };
};

console.log('\n  ── the packet is one screen ──\n');

{
	const record = {
		id: 'fixture-1',
		holder: 'holder-id',
		role: 'role-id',
		roleTitle: 'Minister of Example',
		confidence: 'C',
		basis: 'reported',
		verification: 'unflagged',
		disputes: [{ claim: 'the end date is one day out', held_by: 'a second list' }],
		sources: ['s-found', 's-missed', 's-unchecked'],
		interval: {
			raw: { start: '1990', end: '1992-05' },
			startPrecision: 'year',
			endPrecision: 'month'
		}
	};
	const context = {
		sources: new Map<string, any>([
			['s-found', { id: 's-found', title: 'Found', publisher: 'JORT', tier: 1, lang: 'fr', url: 'https://example.org/a', excerpt: 'the line' }],
			['s-missed', { id: 's-missed', title: 'Missed', publisher: 'Press', tier: 3, lang: 'fr', url: 'https://example.org/b', excerpt: 'a reading aid' }],
			['s-unchecked', { id: 's-unchecked', title: 'Unchecked', publisher: 'Press', tier: 4, lang: 'ar', url: 'https://example.org/c', excerpt: 'unchecked aid' }]
		]),
		names: (id: string) => ({ 'holder-id': 'A Person', 'role-id': 'the office' })[id] ?? id,
		precheck: new Map<string, any>([
			['s-found', { id: 's-found', status: 'alive', http: 200, excerpt: 'found-live' }],
			['s-missed', { id: 's-missed', status: 'alive', http: 200, excerpt: 'not-found' }]
		]),
		rule: '## 6. Decision tree'
	};
	const packet = buildPacket('positions', record, 'Minister of Example', context);
	ok('the claim says who, what and when, with the dates as written', packet.claim.includes('A Person') && packet.claim.includes('1990 (year precision)') && packet.claim.includes('1992-05 (month precision)'), packet.claim);
	ok('the standing carries basis, grade, what it rests on and the dispute', packet.standing.basis === 'reported' && packet.standing.grade === 'C' && packet.standing.disputes.length === 1);
	ok('each source carries title, publisher, tier, language, link and excerpt', packet.sources[0].title === 'Found' && packet.sources[0].publisher === 'JORT' && packet.sources[0].tier === 1 && packet.sources[0].lang === 'fr' && packet.sources[0].url === 'https://example.org/a' && packet.sources[0].excerpt === 'the line');
	ok('a pre-check that found the excerpt labels it a quote', packet.sources[0].excerptLabel === 'quote found on the page');
	ok('a pre-check that missed it labels the excerpt a summary, not a quote', packet.sources[1].excerptLabel === 'summary, not a quote');
	ok('a source with no pre-check is labelled a summary too', packet.sources[2].excerptLabel === 'summary, not a quote');
	ok('a source with no pre-check says so', packet.sources[2].precheck === null);
	ok('a source that was pre-checked carries its result', packet.sources[0].precheck?.status === 'alive' && packet.sources[0].precheck?.http === 200);
	ok('a source without an excerpt has no excerpt label', excerptLabel(null, null) === null);
	ok('the folded rubric travels with the packet', packet.rule === '## 6. Decision tree');
	ok('a record with no sources has an empty source list', buildPacket('positions', { id: 'x', holder: 'h', role: 'r', sources: [], interval: { raw: {} } }, 'x', context).sources.length === 0);
}

console.log('\n  ── timing ──\n');

{
	ok('a verdict records the seconds from show to verdict', verdictSeconds(1000, 61000) === 60);
	ok('idle time over five minutes is capped at five', verdictSeconds(0, 60 * 60 * 1000) === MAX_IDLE_SECONDS);
	ok('a clock that steps backwards records zero, never a negative', verdictSeconds(61000, 1000) === 0);
	ok('the session median is the middle of the sorted seconds', median([60, 180, 120]) === 120);
	ok('an even count averages the two middles', median([60, 120, 180, 300]) === 150);
	ok('an empty median is null, not zero', median([]) === null);
}

console.log('\n  ── a verdict writes exactly one region ──\n');

/** Pick records with no review, no verification and no disputes, so each verdict
 *  appends at the record's end and the expected region is unambiguous. */
const clean = readPositions().filter(
	(r) => !r.review && !('verification' in r) && !('disputes' in r) && typeof r.start === 'string'
);
const fixture = (n: number) => clean[n];
const [one, two, three, four, five, skip, undoRec] = [0, 1, 2, 3, 4, 5, 6].map((n) => fixture(n));
ok('the copy holds clean records for each verdict', clean.length >= 7, `${clean.length} clean positions`);

{
	// verdict 1: a review and verification: verified
	await openPacket('positions', one.id);
	const before = bytes(positionsFile);
	clock += 90000;
	const out = await post('/api/verdict', { kind: 'positions', id: one.id, key: '1', by: 'maintainer' });
	const after = bytes(positionsFile);
	ok('verdict 1 is accepted', out.status === 200, JSON.stringify(out.body.error ?? ''));
	const hunks = lineDiff(block(norm(before), one.id), block(norm(after), one.id));
	ok(
		'verdict 1 adds exactly the review and the verification line',
		same(hunks, [
			{
				removed: [],
				added: [
					'  review:',
					'    by: maintainer',
					'    date: "2026-11-12"',
					'    method: source-check',
					'    actor: human',
					'  verification: verified'
				]
			}
		]),
		JSON.stringify(hunks)
	);
	const rec = recordOf(one.id);
	ok('verdict 1 writes a human source-check review', rec.review?.actor === 'human' && rec.review?.method === 'source-check' && rec.review?.by === 'maintainer');
	ok('verdict 1 writes the date of the session', rec.review?.date === '2026-11-12');
	ok('verdict 1 makes the record verified', rec.verification === 'verified');
	ok('the written record passes V33', verifiedGrounded(rec));
	ok('verdict 1 is timed', out.body.state.verdicts['1'] === 1 && out.body.last.seconds === 90 && out.body.state.medianSeconds === 90);
	ok('no other record changed', unchangedOutside(before, after, one.id));
}

{
	// verdict 2: a review with a required note, and one field change
	await openPacket('positions', two.id);
	const before = bytes(positionsFile);
	const oldLine = block(norm(before), two.id)
		.split('\n')
		.find((l) => l.startsWith('  start:'));
	const oldStart = String(oldLine ?? '').replace(/^  start: /, '');
	const newStart = oldStart.includes('1985') ? '1986' : '1985';
	const out = await post('/api/verdict', { kind: 'positions', id: two.id, key: '2', note: 'the decree gives the month, not the day', fields: { start: newStart } });
	const after = bytes(positionsFile);
	ok('verdict 2 is accepted with a note', out.status === 200, JSON.stringify(out.body.error ?? ''));
	const hunks = lineDiff(block(norm(before), two.id), block(norm(after), two.id));
	ok(
		'verdict 2 changes the date line and adds the review, nothing else',
		same(hunks, [
			{ removed: [oldLine], added: [`  start: "${newStart}"`] },
			{
				removed: [],
				added: [
					'  review:',
					'    by: maintainer',
					'    date: "2026-11-12"',
					'    method: source-check',
					'    actor: human',
					'    note: "the decree gives the month, not the day"'
				]
			}
		]),
		JSON.stringify(hunks)
	);
	const rec = recordOf(two.id);
	ok('verdict 2 keeps verification unchanged', !('verification' in rec));
	ok('verdict 2 writes the note on the review', rec.review?.note === 'the decree gives the month, not the day');
	ok('verdict 2 changes the date', rec.start === newStart);
	ok('verdict 2 changed nothing outside the record', unchangedOutside(before, after, two.id));
}

{
	// verdict 2 without a note is refused and writes nothing
	const before = bytes(positionsFile);
	const out = await post('/api/verdict', { kind: 'positions', id: two.id, key: '2', fields: {} });
	ok('verdict 2 without a note is refused', out.status === 400, JSON.stringify(out.body));
	ok('the refusal writes nothing', bytes(positionsFile) === before);
}

{
	// verdict 3: needs-primary-source and a review with a note
	await openPacket('positions', three.id);
	const before = bytes(positionsFile);
	const out = await post('/api/verdict', { kind: 'positions', id: three.id, key: '3', note: 'the page names the office but not this holder' });
	const after = bytes(positionsFile);
	ok('verdict 3 is accepted with a note', out.status === 200, JSON.stringify(out.body.error ?? ''));
	const hunks = lineDiff(block(norm(before), three.id), block(norm(after), three.id));
	ok(
		'verdict 3 adds the review and needs-primary-source, nothing else',
		same(hunks, [
			{
				removed: [],
				added: [
					'  review:',
					'    by: maintainer',
					'    date: "2026-11-12"',
					'    method: source-check',
					'    actor: human',
					'    note: the page names the office but not this holder',
					'  verification: needs-primary-source'
				]
			}
		]),
		JSON.stringify(hunks)
	);
	const rec = recordOf(three.id);
	ok('verdict 3 writes needs-primary-source', rec.verification === 'needs-primary-source');
	ok('verdict 3 records a review with a note', rec.review?.note === 'the page names the office but not this holder');
}

{
	// verdict 4: nothing on the record
	await openPacket('positions', four.id);
	const before = bytes(positionsFile);
	const out = await post('/api/verdict', { kind: 'positions', id: four.id, key: '4' });
	ok('verdict 4 is accepted', out.status === 200, JSON.stringify(out.body.error ?? ''));
	ok('verdict 4 writes nothing on the record', bytes(positionsFile) === before);
	ok('verdict 4 is counted', out.body.state.verdicts['4'] === 1);
}

{
	// verdict 5: the dispute and verification: disputed
	await openPacket('positions', five.id);
	const before = bytes(positionsFile);
	const out = await post('/api/verdict', {
		kind: 'positions',
		id: five.id,
		key: '5',
		dispute: { claim: 'the end date is one day later', held_by: 'a second list', assessment: 'both versions kept open' }
	});
	const after = bytes(positionsFile);
	ok('verdict 5 is accepted with the dispute', out.status === 200, JSON.stringify(out.body.error ?? ''));
	const hunks = lineDiff(block(norm(before), five.id), block(norm(after), five.id));
	ok(
		'verdict 5 adds the dispute and the disputed value, nothing else',
		same(hunks, [
			{
				removed: [],
				added: [
					'  disputes: [{claim: the end date is one day later, held_by: a second list, assessment: both versions kept open}]',
					'  verification: disputed'
				]
			}
		]),
		JSON.stringify(hunks)
	);
	const rec = recordOf(five.id);
	ok('verdict 5 writes the dispute on the record', rec.disputes?.length === 1 && rec.disputes[0].claim === 'the end date is one day later');
	ok('verdict 5 writes disputed', rec.verification === 'disputed');
}

{
	// skip writes nothing and is not timed
	await openPacket('positions', skip.id);
	const before = bytes(positionsFile);
	const out = await post('/api/skip', { kind: 'positions', id: skip.id });
	ok('skip is accepted', out.status === 200);
	ok('skip writes nothing', bytes(positionsFile) === before);
	ok('skip is not counted as judged', out.body.state.judged === 5 && out.body.state.skipped === 1, JSON.stringify(out.body.state));
}

{
	// undo restores the last write through the splicer
	await openPacket('positions', undoRec.id);
	const before = bytes(positionsFile);
	await post('/api/verdict', { kind: 'positions', id: undoRec.id, key: '3', note: 'a note that will be undone' });
	const written = bytes(positionsFile);
	ok('the verdict to be undone wrote', written !== before && recordOf(undoRec.id).verification === 'needs-primary-source');
	const out = await post('/api/undo');
	ok('undo reports which verdict it reverted', out.status === 200 && out.body.undone?.id === undoRec.id);
	ok('undo restores the exact bytes', bytes(positionsFile) === before);
	ok('undo removes the review it added', !recordOf(undoRec.id).review && !('verification' in recordOf(undoRec.id)));
}

{
	// idle time over five minutes on one packet is capped at five
	const capRec = clean[7];
	await openPacket('positions', capRec.id);
	clock += 60 * 60 * 1000;
	const out = await post('/api/verdict', { kind: 'positions', id: capRec.id, key: '4' });
	ok('a verdict after an hour idle is recorded as five minutes', out.status === 200 && out.body.last.seconds === 300, JSON.stringify(out.body.last));
}

{
	// a name is not a role label
	const out = await post('/api/verdict', { kind: 'positions', id: one.id, key: '1', by: 'A Reviewers Name' });
	ok('a personal name is refused as a reviewer label', out.status === 400 && /role label/.test(out.body.error));
	const labeled = await post('/api/verdict', { kind: 'positions', id: one.id, key: '1', by: 'reviewer-7' });
	ok('reviewer-7 is accepted', labeled.status === 200);
	ok('the review is signed with the role label', recordOf(one.id).review?.by === 'reviewer-7');
}

console.log('\n  ── the copy still holds a valid dataset ──\n');

{
	const parsed = z.array(PositionSchema).safeParse(readPositions());
	ok('every written position still passes its schema', parsed.success, parsed.success ? '' : parsed.error.issues[0]?.message);
	// The copy still holds the hand-written `verified` values the D1 data pull
	// request has not sorted yet, so this checks the records this session touched.
	const touched = [one.id, two.id, three.id, five.id, undoRec.id];
	ok(
		'every record this session verified carries a human source-check',
		touched.every((id) => verifiedGrounded(recordOf(id)))
	);
}

console.log('\n  ── one remote session produces one line ──\n');

{
	const fixtureText = 'date\trecords_seen\tverified\tpartly\tnot_said\tunreadable\tcontested\tskipped\tmedian_seconds\tsigned_by\n'
		+ '2026-11-01\t10\t4\t1\t2\t1\t1\t1\t150\tmaintainer\n'
		+ '2026-11-02\t6\t2\t0\t0\t0\t0\t0\t90\tmaintainer\n';
	const lines = parseSessions(fixtureText);
	ok('the session file parses its lines and skips the header', lines.length === 2 && lines[0].verified === 4);
	const figure = deskFigure(lines);
	ok('the figure is the median of the session medians', figure.minutes === 2, JSON.stringify(figure));
	ok('the figure carries the number of verified claims behind it', figure.claims === 6 && figure.sessions === 2);
	ok('a file with no session lines reports no figure', deskFigure(parseSessions('date\trecords_seen\tverified\tpartly\tnot_said\tunreadable\tcontested\tskipped\tmedian_seconds\tsigned_by\n')).minutes === null);
}

server.close();
rmSync(root, { recursive: true, force: true });

console.log(`\n${checks - failures}/${checks} checks passed\n`);
if (failures) process.exit(1);
