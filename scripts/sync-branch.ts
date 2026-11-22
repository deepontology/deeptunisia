/**
 * Keep one branch that carries main into release/1.0.
 *
 * Data lands on main and code lands on release/1.0, so release falls behind
 * every time main moves. This script opens or refreshes `sync/nightly`: the
 * release branch with main merged in, ready for a pull request. It never
 * touches main or release/1.0 and it never overwrites work on the branch.
 *
 *   none      main adds nothing release lacks, or the branch already carries main
 *   create    no branch yet: release plus a merge of main
 *   refresh   the branch is open and main has moved on: main is merged into it,
 *             so a hand fix committed on the branch (a typed figure corrected after
 *             a sync) is kept, and the push is a fast-forward
 *   recreate  the branch was merged into release already: a fresh one starts from
 *             release, which holds the old tip, so this is a fast-forward too
 *
 * A merge that conflicts is aborted and the run fails, with nothing pushed.
 * The branch name starts with `sync/`, which is what the hash-ledger job keys on.
 *
 *   tsx scripts/sync-branch.ts [--dry] [--remote origin] [--branch sync/nightly]
 *
 * With GITHUB_OUTPUT set, it writes action, branch, behind and main_sha.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULTS = {
	remote: 'origin',
	main: 'main',
	release: 'release/1.0',
	branch: 'sync/nightly'
} as const;

export type SyncAction = 'none' | 'create' | 'refresh' | 'recreate';

export type SyncFacts = {
	/** Commits on main that release/1.0 does not have. */
	behind: number;
	/** Whether the sync branch exists on the remote. */
	branchExists: boolean;
	/** Whether every commit on the sync branch is already in release/1.0. */
	branchMerged: boolean;
	/** Commits on main that the sync branch does not have. */
	branchBehind: number;
};

export function planSync(facts: SyncFacts): SyncAction {
	if (facts.behind <= 0) return 'none';
	if (!facts.branchExists) return 'create';
	if (facts.branchMerged) return 'recreate';
	if (facts.branchBehind <= 0) return 'none';
	return 'refresh';
}

type Options = typeof DEFAULTS & { dry: boolean; name: string; email: string };

function git(cwd: string, args: string[], allowFail = false): { ok: boolean; out: string; err: string } {
	const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
	const ok = run.status === 0;
	if (!ok && !allowFail) throw new Error(`git ${args.join(' ')} failed: ${(run.stderr ?? '').trim()}`);
	return { ok, out: (run.stdout ?? '').trim(), err: (run.stderr ?? '').trim() };
}

export function gatherFacts(cwd: string, o: Pick<Options, 'remote' | 'main' | 'release' | 'branch'>): SyncFacts {
	const main = `${o.remote}/${o.main}`;
	const release = `${o.remote}/${o.release}`;
	const branch = `${o.remote}/${o.branch}`;
	const count = (range: string) => Number(git(cwd, ['rev-list', '--count', range]).out);
	const branchExists = git(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/${branch}`], true).ok;
	return {
		behind: count(`${release}..${main}`),
		branchExists,
		branchMerged: branchExists && git(cwd, ['merge-base', '--is-ancestor', branch, release], true).ok,
		branchBehind: branchExists ? count(`${branch}..${main}`) : 0
	};
}

export type SyncResult = { action: SyncAction; pushed: boolean; mainSha: string; behind: number };

/** Plan and, unless dry, carry out one sync. Throws on a conflict, after aborting the merge. */
export function runSync(cwd: string, options: Partial<Options> = {}): SyncResult {
	const o: Options = { ...DEFAULTS, dry: false, name: 'DeepOntology Collective', email: 'contact@deepontology.org', ...options };
	git(cwd, ['fetch', '--quiet', o.remote, o.main, o.release]);
	// The branch may not exist yet, so asking for it is allowed to fail.
	git(cwd, ['fetch', '--quiet', o.remote, `${o.branch}:refs/remotes/${o.remote}/${o.branch}`], true);
	const facts = gatherFacts(cwd, o);
	const action = planSync(facts);
	const mainSha = git(cwd, ['rev-parse', `${o.remote}/${o.main}`]).out;
	const result: SyncResult = { action, pushed: false, mainSha, behind: facts.behind };
	if (action === 'none' || o.dry) return result;

	const identity = ['-c', `user.name=${o.name}`, '-c', `user.email=${o.email}`, '-c', 'commit.gpgsign=false'];
	const base = action === 'refresh' ? `${o.remote}/${o.branch}` : `${o.remote}/${o.release}`;
	git(cwd, ['checkout', '--quiet', '--detach', base]);
	const merge = git(
		cwd,
		[...identity, 'merge', '--no-ff', '-m', `Sync main into ${o.release} (${mainSha.slice(0, 7)})`, `${o.remote}/${o.main}`],
		true
	);
	if (!merge.ok) {
		git(cwd, ['merge', '--abort'], true);
		throw new Error(`merging ${o.main} into ${base} conflicts, so nothing was pushed: ${merge.err || merge.out}`);
	}
	// Never forced: a refresh descends from the branch, and a recreate descends from
	// release/1.0, which already holds the old tip, so both are fast-forwards.
	git(cwd, ['push', '--quiet', o.remote, `HEAD:refs/heads/${o.branch}`]);
	return { ...result, pushed: true };
}

function main(argv: string[]): number {
	const flag = (name: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const options: Partial<Options> = { dry: argv.includes('--dry') };
	if (flag('--remote')) options.remote = flag('--remote')!;
	if (flag('--branch')) options.branch = flag('--branch')!;
	let result: SyncResult;
	try {
		result = runSync(process.cwd(), options);
	} catch (error) {
		console.error(`  sync failed: ${(error as Error).message}`);
		return 1;
	}
	const branch = options.branch ?? DEFAULTS.branch;
	console.log(`  sync: ${result.action}${result.pushed ? ` (pushed ${branch})` : ''}; release is ${result.behind} commit(s) behind main at ${result.mainSha.slice(0, 7)}`);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`action=${result.action}\nbranch=${branch}\nbehind=${result.behind}\nmain_sha=${result.mainSha}\n`
		);
	}
	return 0;
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) process.exit(main(process.argv.slice(2)));
