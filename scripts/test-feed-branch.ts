/**
 * Tests for scripts/load-feed.ts.
 *
 * The loader is the only thing between a build and a news archive that is not in
 * the checkout. Every outcome is proven on scratch git repositories, with no
 * network: a valid feed branch, a missing branch, a branch without the archive, a
 * corrupt one, an empty one, a moved branch that must replace an older local file,
 * the explicit-ref override, the local-branch fallback, and DT_FEED_LOCAL=1.
 *
 * The failure cases assert the report and the filesystem, not just a non-zero
 * exit: a build that quietly reads a stale feed is the failure this whole change
 * exists to prevent, and a test that only checks an exit code would not see it.
 */
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	FEED_PATH,
	FETCH_COMMAND,
	FeedLoadError,
	loadFeed,
	shortSha,
	type LoadResult
} from './load-feed.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
	}
}

function git(cwd: string, ...args: string[]): string {
	const run = spawnSync(
		'git',
		['-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', ...args],
		{ cwd, encoding: 'utf8' }
	);
	if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${(run.stderr ?? '').trim()}`);
	return (run.stdout ?? '').trim();
}

/** A valid archive with recognizable content, so a stale copy is visible. */
function archiveText(marker: string, items = 3): string {
	return `${JSON.stringify(
		{
			notice: 'Third-party news headlines. NOT DeepTunisia data.',
			cap: 1200,
			items: Array.from({ length: items }, (_, i) => ({
				id: `feed:test:${marker}-${i}`,
				outlet: 'Test Outlet',
				outletId: 'test-outlet',
				title: `Headline ${marker} ${i}`,
				link: `https://example.org/${marker}/${i}`,
				published: '2026-01-01T00:00:00Z',
				lang: 'en'
			}))
		},
		null,
		2
	)}\n`;
}

const DIR = mkdtempSync(join(tmpdir(), 'dt-feed-branch-'));
let counter = 0;

/**
 * A bare origin, a seed checkout that writes the feed branch, and a work clone
 * that runs the loader. The work clone starts with main only, so a test that
 * never writes the feed branch really has no feed ref.
 */
function scenario() {
	const id = ++counter;
	const origin = join(DIR, `origin-${id}.git`);
	const seed = join(DIR, `seed-${id}`);
	const work = join(DIR, `work-${id}`);
	git(DIR, 'init', '-q', '--bare', '-b', 'main', origin);
	git(DIR, 'clone', '-q', origin, seed);
	writeFileSync(join(seed, 'README.md'), 'main\n');
	git(seed, 'add', '.');
	git(seed, 'commit', '-q', '-m', 'start');
	git(seed, 'push', '-q', 'origin', 'main');
	git(DIR, 'clone', '-q', origin, work);

	/** Rewrites the feed branch from main. `null` leaves the archive out entirely. */
	const writeBranch = (text: string | null, extra: Record<string, string> = {}, message = 'feed') => {
		git(seed, 'checkout', '-q', '-B', 'feed-push', 'main');
		git(seed, 'rm', '-rq', '--ignore-unmatch', '--', '.');
		if (text !== null) {
			mkdirSync(dirname(join(seed, FEED_PATH)), { recursive: true });
			writeFileSync(join(seed, FEED_PATH), text);
		}
		for (const [path, content] of Object.entries(extra)) {
			mkdirSync(dirname(join(seed, path)), { recursive: true });
			writeFileSync(join(seed, path), content);
		}
		git(seed, 'add', '-A');
		git(seed, 'commit', '-q', '--allow-empty', '-m', message);
		git(seed, 'push', '-q', '-f', 'origin', 'feed-push:feed');
		git(seed, 'checkout', '-q', 'main');
	};
	const fetchBranch = () =>
		git(work, 'fetch', '-q', 'origin', '+refs/heads/feed:refs/remotes/origin/feed');
	const sha = () => git(origin, 'rev-parse', 'refs/heads/feed');
	return { origin, seed, work, writeBranch, fetchBranch, sha };
}

function failure(run: () => unknown): FeedLoadError | null {
	try {
		run();
		return null;
	} catch (error) {
		if (error instanceof FeedLoadError) return error;
		console.error(`  (run threw ${String(error)})`);
		return null;
	}
}

function load(work: string, env: NodeJS.ProcessEnv = {}): LoadResult {
	return loadFeed({ root: work, env });
}

try {
	// ── A valid branch ──────────────────────────────────────────────────────
	{
		const s = scenario();
		const text = archiveText('first');
		s.writeBranch(text);
		s.fetchBranch();
		const lines: string[] = [];
		const result = loadFeed({ root: s.work, env: {}, log: (line) => lines.push(line) });
		const sha = s.sha();

		ok('a valid feed branch loads the archive', result.status === 'written' && result.items === 3);
		ok(
			'it reports the ref and the commit it resolved',
			result.ref === 'origin/feed' && result.sha === sha,
			`${result.ref}@${shortSha(result.sha)}`
		);
		ok(
			'the local file is byte-identical to the branch',
			readFileSync(join(s.work, FEED_PATH), 'utf8') === text
		);
		ok(
			'one line names the count, ref and short commit',
			lines.length === 1 &&
				lines[0].includes('3 items') &&
				lines[0].includes(`origin/feed@${shortSha(sha)}`),
			lines.join(' | ')
		);
		ok('a second run is unchanged', load(s.work).status === 'unchanged');
	}

	// ── No feed branch at all ───────────────────────────────────────────────
	{
		const s = scenario();
		const error = failure(() => load(s.work));
		ok('a missing feed branch fails', error !== null);
		ok(
			'the report names the ref it wanted, and the local fallback it also tried',
			!!error && error.message.includes('origin/feed') && error.message.includes('also tried: feed')
		);
		ok(
			'the report says the commit is missing',
			!!error && error.commit === null && error.message.includes('missing')
		);
		ok(
			'the report gives the exact command that fixes it',
			!!error && error.message.includes(FETCH_COMMAND),
			FETCH_COMMAND
		);
		ok('nothing was written', !existsSync(join(s.work, FEED_PATH)));
	}

	// ── The branch exists but has no archive ────────────────────────────────
	{
		const s = scenario();
		s.writeBranch(null, { 'notes.txt': 'no archive on this branch\n' });
		s.fetchBranch();
		const sha = s.sha();
		const error = failure(() => load(s.work));
		ok('a branch without feed/feed.json fails', error !== null);
		ok('the report names the ref', !!error && error.message.includes('origin/feed'));
		ok(
			'the report names the commit it resolved and read',
			!!error && error.commit === sha && error.message.includes(sha),
			sha
		);
		ok('the report says the archive is absent', !!error && error.message.includes(`has no ${FEED_PATH}`));
		ok('nothing was written', !existsSync(join(s.work, FEED_PATH)));
	}

	// ── Corrupt archive: fail, and leave the older local file alone ─────────
	{
		const s = scenario();
		s.writeBranch('{ this is not json\n');
		s.fetchBranch();
		const old = archiveText('older');
		mkdirSync(dirname(join(s.work, FEED_PATH)), { recursive: true });
		writeFileSync(join(s.work, FEED_PATH), old);
		const error = failure(() => load(s.work));
		ok('a corrupt archive on the branch fails', error !== null);
		ok('the report says it is not valid JSON', !!error && error.message.includes('is not valid JSON'));
		ok(
			'the older local archive is untouched',
			readFileSync(join(s.work, FEED_PATH), 'utf8') === old
		);
		ok(
			'no temporary file is left behind',
			readdirSync(join(s.work, 'feed')).filter((name) => name.endsWith('.tmp')).length === 0
		);
	}

	// ── Empty archive ───────────────────────────────────────────────────────
	{
		const s = scenario();
		s.writeBranch(`${JSON.stringify({ notice: 'not empty in shape', cap: 1200, items: [] }, null, 2)}\n`);
		s.fetchBranch();
		const error = failure(() => load(s.work));
		ok('an empty items array on the branch fails', error !== null);
		ok('the report says the archive is empty', !!error && error.message.includes('empty "items" array'));
		ok('nothing was written', !existsSync(join(s.work, FEED_PATH)));
	}

	// ── A moved branch must replace an older local file ─────────────────────
	{
		const s = scenario();
		s.writeBranch(archiveText('old'));
		s.fetchBranch();
		const first = load(s.work);
		const oldSha = s.sha();
		s.writeBranch(archiveText('new'));
		s.fetchBranch();
		const newSha = s.sha();
		const lines: string[] = [];
		const second = loadFeed({ root: s.work, env: {}, log: (line) => lines.push(line) });
		const text = readFileSync(join(s.work, FEED_PATH), 'utf8');

		ok('the branch moved between runs', oldSha !== newSha, `${shortSha(oldSha)} -> ${shortSha(newSha)}`);
		ok('the first run loaded the old archive', first.sha === oldSha);
		ok(
			'the newer commit replaces the older local archive',
			second.status === 'written' && second.sha === newSha
		);
		ok('the file carries the new headlines only', text.includes('new-0') && !text.includes('old-0'));
		ok(
			'the log line names the new commit, not the old one',
			lines.length === 1 && lines[0].includes(`origin/feed@${shortSha(newSha)}`)
		);
	}

	// ── DT_FEED_REF ─────────────────────────────────────────────────────────
	{
		const s = scenario();
		const text = archiveText('explicit');
		s.writeBranch(text);
		s.fetchBranch();
		const sha = s.sha();
		git(s.work, 'update-ref', 'refs/remotes/origin/feed-alt', sha);
		const alt = load(s.work, { DT_FEED_REF: 'origin/feed-alt' });
		ok(
			'an explicit ref is honored',
			alt.ref === 'origin/feed-alt' && alt.sha === sha && alt.items === 3,
			alt.ref
		);

		rmSync(join(s.work, FEED_PATH), { force: true });
		const missing = 'refs/remotes/origin/absent';
		const error = failure(() => load(s.work, { DT_FEED_REF: missing }));
		ok('an explicit ref that does not resolve fails', error !== null);
		ok(
			'it never falls back to origin/feed when DT_FEED_REF is set',
			!!error && error.message.includes(missing) && !existsSync(join(s.work, FEED_PATH))
		);
		ok('the report explains DT_FEED_REF', !!error && error.message.includes('DT_FEED_REF'));
	}

	// ── A local feed branch when origin/feed is absent ──────────────────────
	{
		const s = scenario();
		s.writeBranch(archiveText('local-branch'));
		s.fetchBranch();
		const sha = s.sha();
		git(s.work, 'update-ref', 'refs/heads/feed', sha);
		git(s.work, 'update-ref', '-d', 'refs/remotes/origin/feed');
		const result = load(s.work);
		ok(
			'a local feed branch is the fallback when origin/feed is absent',
			result.ref === 'feed' && result.sha === sha,
			result.ref
		);
	}

	// ── DT_FEED_LOCAL=1 ─────────────────────────────────────────────────────
	{
		const s = scenario();
		const text = archiveText('fresh');
		mkdirSync(dirname(join(s.work, FEED_PATH)), { recursive: true });
		writeFileSync(join(s.work, FEED_PATH), text);
		const lines: string[] = [];
		const result = loadFeed({
			root: s.work,
			env: { DT_FEED_LOCAL: '1' },
			log: (line) => lines.push(line)
		});
		ok(
			'local mode verifies a freshly written archive',
			result.status === 'verified' && result.items === 3 && result.sha === '',
			`${result.items} items`
		);
		ok(
			'local mode does not overwrite the fresh file',
			readFileSync(join(s.work, FEED_PATH), 'utf8') === text
		);
		ok('local mode says it verified: the local file', lines.length === 1 && lines[0].includes('verified'));

		rmSync(join(s.work, FEED_PATH), { force: true });
		const missing = failure(() => load(s.work, { DT_FEED_LOCAL: '1' }));
		ok('local mode fails on a missing archive', missing !== null);
		ok(
			'the local failure names the file and the command',
			!!missing && missing.message.includes(FEED_PATH) && missing.message.includes('npm run feed')
		);
		ok('local mode creates nothing', !existsSync(join(s.work, FEED_PATH)));

		const empty = `${JSON.stringify({ notice: 'x', cap: 1200, items: [] }, null, 2)}\n`;
		writeFileSync(join(s.work, FEED_PATH), empty);
		const error = failure(() => load(s.work, { DT_FEED_LOCAL: '1' }));
		ok('local mode fails on an empty archive', error !== null);
		ok('it says the archive is empty', !!error && error.message.includes('empty "items" array'));
		ok('the empty file is not deleted', readFileSync(join(s.work, FEED_PATH), 'utf8') === empty);
	}

	// ── The CLI exit code ───────────────────────────────────────────────────
	{
		const missingRef = `refs/heads/dt-feed-missing-${process.pid}`;
		const cli = spawnSync(
			'npx',
			['--no-install', 'tsx', join(ROOT, 'scripts', 'load-feed.ts')],
			{
				cwd: ROOT,
				env: { ...process.env, DT_FEED_LOCAL: '', DT_FEED_REF: missingRef },
				encoding: 'utf8'
			}
		);
		ok('the CLI exits non-zero when the ref cannot be resolved', cli.status === 1, String(cli.status));
		ok(
			'the CLI writes the report to stderr',
			(cli.stderr ?? '').includes('cannot load the news archive') &&
				(cli.stderr ?? '').includes(FETCH_COMMAND),
			(cli.stderr ?? '').split('\n').slice(0, 3).join(' | ')
		);
	}

	// ── The package wiring this depends on ──────────────────────────────────
	{
		const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
		const tracked = spawnSync('git', ['ls-files', '--error-unmatch', FEED_PATH], { cwd: ROOT });
		ok('package.json exposes feed:load', pkg.scripts['feed:load'] === 'tsx scripts/load-feed.ts');
		ok(
			'data loads the feed before it builds anything',
			pkg.scripts.data.startsWith('tsx scripts/load-feed.ts && ')
		);
		ok(
			'feed loads the archive before it fetches',
			pkg.scripts.feed.startsWith('tsx scripts/load-feed.ts && ')
		);
		ok(
			'the test chain runs this file',
			pkg.scripts.test.includes('tsx scripts/test-feed-branch.ts')
		);
		ok(
			'the local archive and its temporary files are ignored',
			ignore.includes(FEED_PATH) && ignore.includes('feed/.feed.json.*.tmp')
		);
		ok('the archive is no longer tracked', tracked.status !== 0);
	}
} finally {
	rmSync(DIR, { recursive: true, force: true });
}

console.log(`\n  ${checks - failures}/${checks} feed branch checks passed\n`);
process.exit(failures > 0 ? 1 : 0);
