/**
 * Tests for scripts/sync-branch.ts and .github/workflows/sync.yml.
 *
 * The sync branch is the one place automation writes to a branch people also
 * edit, so every outcome is proven on scratch repositories with a bare origin:
 * nothing to do, first creation, a refresh that keeps a hand fix, a recreate
 * only after a merge, and a conflict that pushes nothing. Main and release are
 * checked unchanged after every run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, planSync, runSync } from './sync-branch.ts';

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

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

{
	const none = { behind: 0, branchExists: false, branchMerged: false, branchBehind: 0 };
	ok('nothing to bring across is none', planSync(none) === 'none');
	ok('nothing to bring across is none even with a branch', planSync({ ...none, branchExists: true, branchBehind: 3 }) === 'none');
	ok('main ahead and no branch creates one', planSync({ ...none, behind: 2 }) === 'create');
	ok('an open branch that lacks main is refreshed', planSync({ behind: 2, branchExists: true, branchMerged: false, branchBehind: 1 }) === 'refresh');
	ok('an open branch that already has main is left alone', planSync({ behind: 2, branchExists: true, branchMerged: false, branchBehind: 0 }) === 'none');
	ok('a merged branch is recreated', planSync({ behind: 2, branchExists: true, branchMerged: true, branchBehind: 2 }) === 'recreate');
}

// ---------------------------------------------------------------------------
// Scratch repositories
// ---------------------------------------------------------------------------

const DIR = mkdtempSync(join(tmpdir(), 'dt-sync-'));

function git(cwd: string, ...args: string[]): string {
	const run = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', ...args], {
		cwd,
		encoding: 'utf8'
	});
	if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
	return run.stdout.trim();
}

let counter = 0;

/** A bare origin with main and release/1.0 at one commit, and a clone to run the sync in. */
function scenario() {
	const id = ++counter;
	const origin = join(DIR, `origin-${id}.git`);
	const seed = join(DIR, `seed-${id}`);
	const work = join(DIR, `work-${id}`);
	git(DIR, 'init', '-q', '--bare', '-b', 'main', origin);
	git(DIR, 'clone', '-q', origin, seed);
	git(seed, 'checkout', '-q', '-b', 'main');
	writeFileSync(join(seed, 'data.txt'), 'one\n');
	writeFileSync(join(seed, 'code.txt'), 'one\n');
	git(seed, 'add', '.');
	git(seed, 'commit', '-q', '-m', 'start');
	git(seed, 'push', '-q', 'origin', 'main');
	git(seed, 'push', '-q', 'origin', 'main:release/1.0');
	git(DIR, 'clone', '-q', origin, work);
	const pushTo = (branch: string, file: string, text: string, message: string) => {
		git(seed, 'fetch', '-q', 'origin');
		git(seed, 'checkout', '-q', '-B', 'tmp', `origin/${branch}`);
		writeFileSync(join(seed, file), text);
		git(seed, 'add', '.');
		git(seed, 'commit', '-q', '-m', message);
		git(seed, 'push', '-q', 'origin', `tmp:${branch}`);
	};
	const rev = (ref: string) => git(origin, 'rev-parse', ref);
	const has = (ref: string) => {
		const run = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: origin });
		return run.status === 0;
	};
	return { origin, work, pushTo, rev, has, seed };
}

const BRANCH = `refs/heads/${DEFAULTS.branch}`;

/** A run that cannot end the test: a throw becomes a result the checks can fail on. */
function attempt(work: string, options: Parameters<typeof runSync>[1] = {}): ReturnType<typeof runSync> {
	try {
		return runSync(work, options);
	} catch (error) {
		console.error(`  (run threw: ${(error as Error).message.split('\n')[0]})`);
		return { action: 'none', pushed: false, mainSha: '', behind: -1 };
	}
}

// Nothing to do
{
	const s = scenario();
	s.pushTo('release/1.0', 'code.txt', 'two\n', 'release code');
	const result = attempt(s.work);
	ok('release ahead of main only: nothing to sync', result.action === 'none' && !result.pushed);
	ok('no branch was created', !s.has(BRANCH));
}

// Create
{
	const s = scenario();
	s.pushTo('main', 'data.txt', 'two\n', 'data on main');
	s.pushTo('release/1.0', 'code.txt', 'two\n', 'code on release');
	const mainBefore = s.rev('main');
	const releaseBefore = s.rev('release/1.0');
	const dry = attempt(s.work, { dry: true });
	ok('a dry run reports create and pushes nothing', dry.action === 'create' && !dry.pushed && !s.has(BRANCH));
	const result = attempt(s.work);
	ok('main ahead of release creates the branch', result.action === 'create' && result.pushed && s.has(BRANCH), result.action);
	ok('the branch holds both main and release', spawnSync('git', ['merge-base', '--is-ancestor', mainBefore, BRANCH], { cwd: s.origin }).status === 0 && spawnSync('git', ['merge-base', '--is-ancestor', releaseBefore, BRANCH], { cwd: s.origin }).status === 0);
	ok('the tip is a merge commit of release and main', git(s.origin, 'rev-list', '--parents', '-n', '1', BRANCH).split(' ').length === 3);
	ok('main and release are untouched', s.rev('main') === mainBefore && s.rev('release/1.0') === releaseBefore);
	ok('a second run the same night does nothing', attempt(s.work).action === 'none');
	ok('the branch name starts with sync/, which the hash ledger keys on', DEFAULTS.branch.startsWith('sync/'));
}

// Refresh keeps a hand fix
{
	const s = scenario();
	s.pushTo('main', 'data.txt', 'two\n', 'data on main');
	attempt(s.work);
	// A person corrects a typed figure on the branch, then the feed moves main again.
	s.pushTo(DEFAULTS.branch, 'code.txt', 'fixed by hand\n', 'correct a typed figure');
	const fix = s.rev(BRANCH);
	s.pushTo('main', 'data.txt', 'three\n', 'more data on main');
	const mainNow = s.rev('main');
	const result = attempt(s.work);
	ok('main moving again refreshes the open branch', result.action === 'refresh' && result.pushed, result.action);
	ok('the hand fix commit is still in the branch history', spawnSync('git', ['merge-base', '--is-ancestor', fix, BRANCH], { cwd: s.origin }).status === 0);
	ok('the new main commit is in the branch', spawnSync('git', ['merge-base', '--is-ancestor', mainNow, BRANCH], { cwd: s.origin }).status === 0);
	ok('the hand fix is still in the branch files', git(s.origin, 'show', `${BRANCH}:code.txt`) === 'fixed by hand');
	ok('a second run does nothing', attempt(s.work).action === 'none');
}

// Recreate only after the branch was merged
{
	const s = scenario();
	s.pushTo('main', 'data.txt', 'two\n', 'data on main');
	attempt(s.work);
	// The pull request is merged: release takes the branch tip.
	git(s.origin, 'update-ref', 'refs/heads/release/1.0', s.rev(BRANCH));
	const releaseAfterMerge = s.rev('release/1.0');
	const oldTip = s.rev(BRANCH);
	ok('with release caught up there is nothing to sync', attempt(s.work).action === 'none');
	s.pushTo('main', 'data.txt', 'three\n', 'next night, more data');
	const result = attempt(s.work);
	ok('a merged branch is recreated from release', result.action === 'recreate' && result.pushed, result.action);
	ok('the new branch starts from the merged release', spawnSync('git', ['merge-base', '--is-ancestor', releaseAfterMerge, BRANCH], { cwd: s.origin }).status === 0 && s.rev(BRANCH) !== oldTip);
	ok('the old tip is in the new history, so the push was a fast-forward', spawnSync('git', ['merge-base', '--is-ancestor', oldTip, BRANCH], { cwd: s.origin }).status === 0);
	ok('release itself did not move', s.rev('release/1.0') === releaseAfterMerge);
}

// A conflict pushes nothing
{
	const s = scenario();
	s.pushTo('main', 'code.txt', 'main version\n', 'main touches code.txt');
	s.pushTo('release/1.0', 'code.txt', 'release version\n', 'release touches code.txt');
	const mainBefore = s.rev('main');
	const releaseBefore = s.rev('release/1.0');
	let message = '';
	try {
		runSync(s.work);
	} catch (error) {
		message = (error as Error).message;
	}
	ok('a conflicting merge throws', message.includes('conflicts'), message.slice(0, 80));
	ok('no sync branch was pushed', !s.has(BRANCH));
	ok('main and release are untouched', s.rev('main') === mainBefore && s.rev('release/1.0') === releaseBefore);
	ok('the merge was aborted, so the clone is clean', git(s.work, 'status', '--porcelain') === '');
}

rmSync(DIR, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// The workflow
// ---------------------------------------------------------------------------

{
	const text = readFileSync(join(ROOT, '.github', 'workflows', 'sync.yml'), 'utf8');
	const code = text.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
	ok('it runs on a nightly schedule', /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/.test(code));
	ok('it can be started by hand', code.includes('workflow_dispatch:'));
	ok('two runs cannot overlap', /concurrency:\s*\n\s*group: sync-main-into-release\s*\n\s*cancel-in-progress: false/.test(code));
	ok('it checks out release/1.0 with the feed token and full history', /ref: release\/1\.0/.test(code) && code.includes('token: ${{ secrets.FEED_PAT }}') && code.includes('fetch-depth: 0'));
	ok('it runs the tested script', code.includes('scripts/sync-branch.ts'));
	ok('it never pushes to main or release/1.0 itself', !/git push/.test(code) && !/--base main/.test(code));
	ok('the script never forces a push', !/--force|-f\b/.test(readFileSync(join(ROOT, 'scripts', 'sync-branch.ts'), 'utf8').split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n')));
	ok('the pull request it opens targets release/1.0', code.includes('--base release/1.0'));
	ok('it declares its own permissions', code.includes('contents: write') && code.includes('pull-requests: write'));
	ok('every action is pinned to a commit', (code.match(/uses: \S+/g) ?? []).every((u) => /@[0-9a-f]{40}$/.test(u)), (code.match(/uses: \S+/g) ?? []).join(' '));
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
	ok('the test chain runs this file', pkg.scripts.test.includes('tsx scripts/test-sync-branch.ts'));
}

console.log(`\n  ${checks - failures}/${checks} sync branch checks passed\n`);
if (failures) process.exit(1);
