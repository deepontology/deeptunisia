/**
 * The desk's session: one branch, one line, one published figure.
 *
 * A ten-record session runs against a copy of `data/` inside a throwaway git
 * repository. "Finish session" commits the writes on `data/desk-<date>` and
 * appends one line to `research/desk/sessions.tsv`; the two publish commands are
 * returned and never run. The test then reads the line, checks the committed tree
 * against the schemas, and checks the figure the build publishes equals a median
 * computed here from the seconds the reviewer actually spent.
 */
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { createAdminServer } from './admin.ts';
import {
	SESSIONS_HEADER,
	configureDeskSchema,
	deskFigure,
	deskStatsText,
	parseSessions
} from './desk.ts';
import { PositionSchema, RelationshipSchema, EventSchema, verifiedGrounded } from './schema.ts';
import { VERIFIED_EXCEPTIONS } from './verified-exceptions.ts';
import { translate, type Locale } from '../src/lib/i18n.ts';

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

const root = mkdtempSync(join(tmpdir(), 'dt-desk-session-'));
cpSync(join(ROOT, 'data'), join(root, 'data'), { recursive: true });
mkdirSync(join(root, 'src', 'generated'), { recursive: true });
cpSync(join(ROOT, 'src', 'generated', 'dataset.json'), join(root, 'src', 'generated', 'dataset.json'));
mkdirSync(join(root, 'research', 'study'), { recursive: true });
cpSync(join(ROOT, 'research', 'study', 'rubric-v2.md'), join(root, 'research', 'study', 'rubric-v2.md'));

const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
git(['init']);
git(['add', '-A']);
git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.org', 'commit', '-m', 'fixture data']);

let clock = Date.UTC(2026, 10, 12, 9, 0, 0);
const server = createAdminServer({ root, now: () => clock });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

console.log('\n  ── a ten-record session ──\n');

/**
 * The plan the reviewer follows, and the seconds each packet stays on screen.
 * The four verdict-1 packets are timed at 60, 120, 180 and 300 seconds, so the
 * median computed independently below is 150 seconds, or 2.5 minutes.
 */
const PLAN: { key: string; seconds: number }[] = [
	{ key: '1', seconds: 60 },
	{ key: '1', seconds: 120 },
	{ key: '1', seconds: 180 },
	{ key: '3', seconds: 240 },
	{ key: '4', seconds: 30 },
	{ key: '5', seconds: 45 },
	{ key: '2', seconds: 90 },
	{ key: '3', seconds: 150 },
	{ key: 's', seconds: 10 },
	{ key: '1', seconds: 300 }
];

const seen: string[] = [];
const refused: string[] = [];
for (const step of PLAN) {
	const out = await (await fetch(base + '/api/packet')).json();
	if (!out.packet) {
		seen.push('');
		continue;
	}
	const packet = out.packet;
	seen.push(`${packet.kind}/${packet.id}`);
	clock += step.seconds * 1000;

	if (step.key === 's') {
		await fetch(base + '/api/skip', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: packet.kind, id: packet.id })
		});
		continue;
	}

	const body: Record<string, unknown> = {
		kind: packet.kind,
		id: packet.id,
		key: step.key,
		by: 'maintainer'
	};
	if (step.key === '2' || step.key === '3') body.note = 'the page does not settle this';
	if (step.key === '5') body.dispute = { claim: 'a competing version of the date', held_by: 'a second list' };
	const res = await fetch(base + '/api/verdict', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (res.status !== 200) {
		const error = await res.json();
		refused.push(`packet ${seen.length} (${step.key}): ${JSON.stringify(error)}`);
	}
}
ok('every verdict in the plan is accepted', refused.length === 0, refused.join(' | '));
ok('the session saw ten records', seen.length === 10 && seen.every((s) => s !== ''), seen.join(', '));

const finished = await (await fetch(base + '/api/session/finish', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ by: 'maintainer' })
})).json();

ok('finish reports the branch it committed on', finished.branch === 'data/desk-2026-11-12', JSON.stringify(finished.branch));
ok('finish reports a commit', /^[0-9a-f]{7,}$/.test(finished.sha ?? ''), JSON.stringify(finished.sha));
ok(
	'finish shows the two publish commands and does not run them',
	typeof finished.commands?.push === 'string' &&
		typeof finished.commands?.pr === 'string' &&
		finished.commands.push.startsWith('git push -u origin data/desk-2026-11-12') &&
		finished.commands.pr.startsWith('gh pr create --head data/desk-2026-11-12')
);
ok('no remote was pushed to: the repository has none', git(['remote']).trim() === '', `remotes: ${git(['remote']).trim()}`);

console.log('\n  ── the branch ──\n');

{
	const branches = git(['branch', '--list']).split('\n').map((l) => l.replace('*', '').trim());
	ok('the branch exists locally', branches.includes('data/desk-2026-11-12'), branches.join(', '));
	ok('the session is the checked-out branch', git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() === 'data/desk-2026-11-12');
	ok('the reported sha is the branch head', git(['rev-parse', '--short', 'HEAD']).trim() === finished.sha);

	const files = git(['show', '--name-only', '--pretty=format:', 'HEAD'])
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	ok('the commit touches data files and the session file only', files.every((f) => f.startsWith('data/') || f === 'research/desk/sessions.tsv'), files.join(', '));
	ok('the commit carries the session file', files.includes('research/desk/sessions.tsv'));
	ok('the working tree is clean after the commit', git(['status', '--porcelain']).trim() === '');
	ok('the commit subject names the desk', /^Desk: record a verification session/.test(git(['log', '-1', '--pretty=%s']).trim()));
}

console.log('\n  ── sessions.tsv gains one line ──\n');

const sessionsText = readFileSync(join(root, 'research', 'desk', 'sessions.tsv'), 'utf8');
const lines = sessionsText.split('\n').filter((l) => l.trim());
const parsed = parseSessions(sessionsText);

{
	ok('the file has the header and one session line', lines.length === 2 && lines[0] === SESSIONS_HEADER, `${lines.length} lines`);
	ok('the line parses as one session', parsed.length === 1);
	const line = parsed[0];
	ok('the line carries the date', line.date === '2026-11-12');
	ok('the line carries the records seen', line.seen === 10, String(line.seen));
	ok('the line carries each verdict count', line.verified === 4 && line.partly === 1 && line.notSaid === 2 && line.unreadable === 1 && line.contested === 1, JSON.stringify(line));
	ok('the line carries the skips', line.skipped === 1);
	ok('the line carries the median seconds per verified claim', line.medianSeconds === 150, String(line.medianSeconds));
	ok('the line is signed with a role label', line.by === 'maintainer');
	ok('no personal name appears in the session file', !/reviewer name|fixture/i.test(sessionsText));
}

console.log('\n  ── the committed tree passes the validators ──\n');

{
	configureDeskSchema(root, true);
	const read = (file: string) => parseYaml(readFileSync(join(root, 'data', file), 'utf8'));
	const position = z.array(PositionSchema).safeParse(read('positions.yaml'));
	const relationship = z.array(RelationshipSchema).safeParse(read('relationships.yaml'));
	const event = z.array(EventSchema).safeParse(read('events.yaml'));
	ok('positions.yaml passes its schema', position.success, position.success ? '' : position.error.issues[0]?.message);
	ok('relationships.yaml passes its schema', relationship.success, relationship.success ? '' : relationship.error.issues[0]?.message);
	ok('events.yaml passes its schema', event.success, event.success ? '' : event.error.issues[0]?.message);

	const legacy = new Set(VERIFIED_EXCEPTIONS.ids as string[]);
	const records = [
		...(position.success ? position.data : []),
		...(relationship.success ? relationship.data : []),
		...(event.success ? event.data : [])
	] as { id: string; verification?: string }[];
	const ungrounded = records.filter((r) => r.verification === 'verified' && !verifiedGrounded(r as any) && !legacy.has(r.id));
	ok('every newly verified record carries a human source-check', ungrounded.length === 0, ungrounded.slice(0, 3).map((r) => r.id).join(', '));
}

console.log('\n  ── the build reads the session and publishes the figure ──\n');

{
	// The real build, over the copy's data folder and the copy's session file.
	// Fixture mode keeps every write inside the temporary folders, and the run
	// fails on any validation error, so a green run is the committed tree passing
	// the build's own gates.
	const outDir = join(root, 'built-out');
	const staticDir = join(root, 'built-static');
	let buildError = '';
	try {
		execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-data.ts'], {
			cwd: ROOT,
			env: {
				...process.env,
				DT_DATA_DIR: join(root, 'data'),
				DT_OUT_DIR: outDir,
				DT_STATIC_DIR: staticDir
			},
			stdio: 'pipe'
		});
	} catch (e: any) {
		buildError = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').filter(Boolean).slice(-3).join(' | ');
	}
	ok('the build runs over the committed copy without a validation error', buildError === '', buildError);

	const emittedStats = JSON.parse(readFileSync(join(outDir, 'stats.json'), 'utf8'));
	ok(
		'the build publishes the copy median as minutes per verified claim',
		emittedStats.deskMinutes === '2.5' && emittedStats.deskClaims === '4' && emittedStats.deskSessions === '1',
		JSON.stringify([emittedStats.deskSessions, emittedStats.deskClaims, emittedStats.deskMinutes])
	);
}

console.log('\n  ── the /about figure equals a fresh median ──\n');

{
	// Computed here from the plan, not from the shared median function.
	const verifiedSeconds = PLAN.filter((p) => p.key === '1').map((p) => p.seconds).sort((a, b) => a - b);
	const freshMedian = (verifiedSeconds[1] + verifiedSeconds[2]) / 2;
	ok('the fresh median of the timed claims is 150 seconds', freshMedian === 150, String(freshMedian));

	const figure = deskFigure(parseSessions(sessionsText));
	ok('the desk figure is that median as minutes', figure.minutes === 2.5, JSON.stringify(figure));
	ok('the desk figure carries the claims behind it', figure.claims === 4 && figure.sessions === 1);

	// A skewed set of sessions separates a median from a mean: medians of 60, 120
	// and 600 seconds give 2.0 minutes; their mean would be 4.3.
	const skew = SESSIONS_HEADER + '\n'
		+ '2026-11-01\t10\t4\t0\t0\t0\t0\t0\t60\tmaintainer\n'
		+ '2026-11-02\t10\t2\t0\t0\t0\t0\t0\t120\tmaintainer\n'
		+ '2026-11-03\t10\t1\t0\t0\t0\t0\t0\t600\tmaintainer\n';
	ok('a skewed set of sessions yields the median, not the mean', deskFigure(parseSessions(skew)).minutes === 2, JSON.stringify(deskFigure(parseSessions(skew))));

	const copyStats = deskStatsText(sessionsText);
	ok('the build helper turns the line into the three published keys', copyStats.deskMinutes === '2.5' && copyStats.deskClaims === '4' && copyStats.deskSessions === '1', JSON.stringify(copyStats));

	// The emitted stats.json is what /about reads. With no session in the real
	// repository, it must say "not measured" rather than a number.
	const repoText = existsSync(join(ROOT, 'research', 'desk', 'sessions.tsv'))
		? readFileSync(join(ROOT, 'research', 'desk', 'sessions.tsv'), 'utf8')
		: '';
	const expected = deskStatsText(repoText);
	const emitted = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'stats.json'), 'utf8'));
	ok(
		'the emitted stats match a fresh read of the repository session file',
		emitted.deskSessions === expected.deskSessions &&
			emitted.deskClaims === expected.deskClaims &&
			emitted.deskMinutes === expected.deskMinutes,
		JSON.stringify({ emitted: [emitted.deskSessions, emitted.deskClaims, emitted.deskMinutes], expected })
	);
	ok('with no session line the figure is empty, not zero', expected.deskMinutes === '' && expected.deskClaims === '0', JSON.stringify(expected));
	ok('and the page has words for that in three languages', (['en', 'fr', 'ar'] as Locale[]).every((l) => translate(l, 'about.desk.notMeasured').length > 0));
}

console.log('\n  ── the page says it in three languages ──\n');

{
	const en = translate('en', 'about.desk.notMeasured');
	const fr = translate('fr', 'about.desk.notMeasured');
	const ar = translate('ar', 'about.desk.notMeasured');
	ok('the unmeasured label differs by language', fr !== en && ar !== en && ar !== fr, `${en} | ${fr} | ${ar}`);
	const labels = (['en', 'fr', 'ar'] as Locale[]).map((l) => translate(l, 'about.desk.perClaim'));
	ok('the per-claim label keeps its count in every language', labels.every((l) => l.includes('{claims}')), labels.join(' | '));
}

server.close();
rmSync(root, { recursive: true, force: true });

console.log(`\n${checks - failures}/${checks} checks passed\n`);
if (failures) process.exit(1);
