/**
 * The record of which commit `build/` was made from.
 *
 * `npm run build` clears the stamp before it starts and writes it as its last
 * step, so a stamp exists only after a build that ran to the end. It names the
 * commit the build started from and whether the working tree was clean when the
 * build finished. The preview deploy reads it and refuses a build that is not
 * the commit being deployed, so switching branches or rebuilding another branch
 * cannot put the wrong site on the preview.
 *
 * The stamp is a file at the repository root, outside `build/`, so it is never
 * uploaded with the site. It is ignored by git.
 *
 *   tsx scripts/build-stamp.ts           write the stamp for HEAD
 *   tsx scripts/build-stamp.ts --clear   remove it
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STAMP_FILE = '.build-stamp.json';

export type BuildStamp = {
	/** The full commit id the build was made from. */
	commit: string;
	/** True when no tracked file differed from that commit when the build finished. */
	clean: boolean;
};

const COMMIT = /^[0-9a-f]{40}$/;

/** The stamp in a file's text, or null when the text is not a stamp. */
export function parseStamp(text: string | null): BuildStamp | null {
	if (text === null) return null;
	try {
		const value = JSON.parse(text) as Partial<BuildStamp>;
		if (typeof value.commit !== 'string' || !COMMIT.test(value.commit)) return null;
		if (typeof value.clean !== 'boolean') return null;
		return { commit: value.commit, clean: value.clean };
	} catch {
		return null;
	}
}

export function renderStamp(stamp: BuildStamp): string {
	return `${JSON.stringify(stamp)}\n`;
}

const short = (commit: string) => commit.slice(0, 7);

/**
 * Every reason `build/` cannot be trusted to be the commit now checked out.
 * Empty means the build was made from HEAD, from a clean tree, and the tree has
 * not changed since.
 */
export function stampRefusals(stamp: BuildStamp | null, head: string, treeClean: boolean): string[] {
	const refusals: string[] = [];
	if (stamp === null) {
		refusals.push(
			'build/ has no build stamp, so nothing says which commit made it; run npm run build, then deploy the preview'
		);
	} else {
		if (stamp.commit !== head) {
			refusals.push(
				`build/ was made from ${short(stamp.commit)} but HEAD is ${short(head)}; run npm run build on this commit, then deploy the preview`
			);
		}
		if (!stamp.clean) {
			refusals.push('build/ was made from a tree with uncommitted changes; commit them, run npm run build, then deploy the preview');
		}
	}
	if (!treeClean) {
		refusals.push('the working tree has uncommitted changes, so build/ may not match it; commit or discard them and run npm run build');
	}
	return refusals;
}

function git(root: string, args: string[]): { ok: boolean; out: string } {
	const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	return { ok: run.status === 0, out: (run.stdout ?? '').trim() };
}

/** HEAD and whether the tracked files match it, or null outside a git checkout. */
export function gitFacts(root: string): { head: string; clean: boolean } | null {
	const head = git(root, ['rev-parse', 'HEAD']);
	if (!head.ok || !COMMIT.test(head.out)) return null;
	const status = git(root, ['status', '--porcelain', '--untracked-files=no']);
	if (!status.ok) return null;
	return { head: head.out, clean: status.out === '' };
}

/** The stamp file's text, or null when there is none. */
export function readStampFile(root: string): string | null {
	const path = join(root, STAMP_FILE);
	return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function main(argv: string[]): number {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const path = join(root, STAMP_FILE);
	if (argv.includes('--clear')) {
		rmSync(path, { force: true });
		return 0;
	}
	const facts = gitFacts(root);
	if (!facts) {
		rmSync(path, { force: true });
		console.log('  build stamp: not a git checkout, so none was written; a preview deploy will refuse this build');
		return 0;
	}
	writeFileSync(path, renderStamp({ commit: facts.head, clean: facts.clean }));
	console.log(`  build stamp: ${short(facts.head)}${facts.clean ? '' : ' (tree not clean)'}`);
	return 0;
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) process.exit(main(process.argv.slice(2)));
