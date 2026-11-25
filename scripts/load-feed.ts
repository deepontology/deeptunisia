/**
 * Loads `feed/feed.json` from the dedicated `feed` branch.
 *
 * The news archive is not project data (see `src/lib/feed.ts`), and it does not
 * live on main. The news job commits it to `feed`, and every build reads it from
 * that branch through this file.
 *
 * The rule this file enforces is that a build which cannot read the feed branch
 * fails, with the ref it tried, the commit it resolved and the command that fixes
 * it. It never builds with a silently older or empty archive: a page built from a
 * stale feed looks exactly like a page built from a current one, so the failure
 * has to be loud rather than a small note in the log.
 *
 * `DT_FEED_REF` points the loader at another ref (a scratch branch in a test, a
 * tag in a release run). Without it the loader prefers `origin/feed`, falls back
 * to a local `feed` branch only when `origin/feed` is absent, and fails.
 *
 * `DT_FEED_LOCAL=1` verifies the local `feed/feed.json` instead of syncing it,
 * for work done after `npm run feed`, where the fresh archive on disk is newer
 * than the branch.
 *
 * Usage: `npx tsx scripts/load-feed.ts`
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Path of the archive inside the feed branch and inside the checkout. */
export const FEED_PATH = 'feed/feed.json';

/** The ref a build reads when nothing says otherwise. */
export const REMOTE_REF = 'origin/feed';

/** The local branch tried only when `origin/feed` does not exist. */
export const LOCAL_REF = 'feed';

/** The one command that makes a missing ref available. */
export const FETCH_COMMAND = 'git fetch origin feed:refs/remotes/origin/feed';

export interface FeedArchive {
	notice?: unknown;
	cap?: unknown;
	items: unknown[];
}

export type LoadStatus = 'written' | 'unchanged' | 'verified';

export interface LoadResult {
	status: LoadStatus;
	/** The ref the archive came from, or `feed/feed.json` in local mode. */
	ref: string;
	/** The full commit SHA, empty in local mode. */
	sha: string;
	/** Number of headlines in the archive. */
	items: number;
	/** Absolute path of the local archive. */
	file: string;
}

export interface LoadOptions {
	/** Checkout the git commands run in. */
	root: string;
	env?: NodeJS.ProcessEnv;
	log?: (line: string) => void;
}

export class FeedLoadError extends Error {
	readonly ref: string;
	readonly commit: string | null;

	constructor(message: string, ref = '', commit: string | null = null) {
		super(message);
		this.name = 'FeedLoadError';
		this.ref = ref;
		this.commit = commit;
	}
}

export function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

/** One line, so a JSON parser's snippet cannot break the shape of the report. */
function errorText(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/\s+/g, ' ').trim();
}

/**
 * The whole failure the specification asks for: branch, commit, reason, fix.
 * Exported so the test can assert the wording without running the CLI.
 */
export function renderBranchFailure(ref: string, commit: string | null, reason: string): string {
	return [
		'',
		'  feed: cannot load the news archive from the feed branch',
		'',
		`    ref:     ${ref}`,
		`    commit:  ${commit ?? 'missing'}`,
		`    reason:  ${reason}`,
		'',
		'  The build reads feed/feed.json from the feed branch and will not fall back',
		'  to an older, empty or corrupt archive. A page built from a stale feed looks',
		'  exactly like one built from a current feed, so it fails instead.',
		'',
		`  Fix: ${FETCH_COMMAND}`,
		''
	].join('\n');
}

/** The same report for `DT_FEED_LOCAL=1`, where no branch is involved. */
export function renderLocalFailure(reason: string): string {
	return [
		'',
		'  feed: the local news archive is not usable',
		'',
		`    file:    ${FEED_PATH}`,
		`    reason:  ${reason}`,
		'',
		'  DT_FEED_LOCAL=1 verifies the archive on disk instead of loading the feed',
		'  branch, so the file must exist and parse before anything can use it.',
		'',
		'  Fix: npm run feed',
		''
	].join('\n');
}

/** Full commit SHA the ref points at, or null when it does not resolve to one. */
function revParse(root: string, ref: string): string | null {
	const run = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024
	});
	const sha = (run.stdout ?? '').trim();
	return run.status === 0 && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

function hasArchive(root: string, sha: string): boolean {
	return spawnSync('git', ['cat-file', '-e', `${sha}:${FEED_PATH}`], { cwd: root }).status === 0;
}

/** Bytes of the archive at one commit, exactly as committed. */
function readArchiveAt(root: string, sha: string): string {
	const run = spawnSync('git', ['show', `${sha}:${FEED_PATH}`], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	if (run.status !== 0 || typeof run.stdout !== 'string') {
		throw new Error((run.stderr ?? '').split('\n')[0].trim() || 'git show failed');
	}
	return run.stdout;
}

/**
 * Parses and validates an archive. Throws a short phrase that fits after the
 * file or ref name, so the caller can build the full report.
 */
export function parseFeedArchive(text: string): FeedArchive {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(`is not valid JSON (${errorText(error)})`);
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('is not a JSON object');
	}
	const items = (parsed as { items?: unknown }).items;
	if (!Array.isArray(items)) throw new Error('has no "items" array');
	if (items.length === 0) throw new Error('has an empty "items" array');
	return parsed as FeedArchive;
}

/**
 * The ref to read, and the commit it resolved to.
 *
 * `DT_FEED_REF` is the only candidate when set: an explicit ref that does not
 * resolve is a failure, never a reason to fall back to a different branch.
 */
export function resolveFeedRef(
	root: string,
	env: NodeJS.ProcessEnv = process.env
): { ref: string; sha: string } {
	const explicit = (env.DT_FEED_REF ?? '').trim();
	const candidates = explicit ? [explicit] : [REMOTE_REF, LOCAL_REF];
	for (const ref of candidates) {
		const sha = revParse(root, ref);
		if (sha) return { ref, sha };
	}
	const named = explicit || REMOTE_REF;
	const also =
		!explicit && candidates.length > 1 ? ` (also tried: ${candidates.slice(1).join(', ')})` : '';
	const reason = explicit
		? 'DT_FEED_REF names a ref that does not resolve to a commit in this checkout'
		: 'the ref does not resolve to a commit in this checkout';
	throw new FeedLoadError(renderBranchFailure(`${named}${also}`, null, reason), named, null);
}

/** Write to a sibling temporary file and rename, so a reader never sees half a feed. */
function writeAtomic(file: string, text: string): void {
	const dir = dirname(file);
	mkdirSync(dir, { recursive: true });
	const temp = join(dir, `.${basename(file)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
	try {
		writeFileSync(temp, text, 'utf8');
		renameSync(temp, file);
	} catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
}

/**
 * Loads the archive into `feed/feed.json`, or verifies the local one under
 * `DT_FEED_LOCAL=1`. Throws `FeedLoadError` with the full report on any failure,
 * and writes nothing in that case.
 */
export function loadFeed(options: LoadOptions): LoadResult {
	const { root, env = process.env, log = () => {} } = options;
	const file = join(root, FEED_PATH);

	if (env.DT_FEED_LOCAL === '1') {
		if (!existsSync(file)) {
			throw new FeedLoadError(renderLocalFailure('the file is missing'), FEED_PATH, null);
		}
		let text: string;
		try {
			text = readFileSync(file, 'utf8');
		} catch (error) {
			throw new FeedLoadError(
				renderLocalFailure(`the file could not be read (${errorText(error)})`),
				FEED_PATH,
				null
			);
		}
		let archive: FeedArchive;
		try {
			archive = parseFeedArchive(text);
		} catch (error) {
			throw new FeedLoadError(renderLocalFailure(`${FEED_PATH} ${errorText(error)}`), FEED_PATH, null);
		}
		log(`feed: verified ${archive.items.length} local items in ${FEED_PATH} (DT_FEED_LOCAL=1)`);
		return { status: 'verified', ref: FEED_PATH, sha: '', items: archive.items.length, file };
	}

	const { ref, sha } = resolveFeedRef(root, env);
	if (!hasArchive(root, sha)) {
		throw new FeedLoadError(
			renderBranchFailure(ref, sha, `commit ${shortSha(sha)} has no ${FEED_PATH}`),
			ref,
			sha
		);
	}
	let text: string;
	try {
		text = readArchiveAt(root, sha);
	} catch (error) {
		throw new FeedLoadError(
			renderBranchFailure(ref, sha, `commit ${shortSha(sha)} could not be read (${errorText(error)})`),
			ref,
			sha
		);
	}
	let archive: FeedArchive;
	try {
		archive = parseFeedArchive(text);
	} catch (error) {
		throw new FeedLoadError(
			renderBranchFailure(ref, sha, `${FEED_PATH} on ${ref} ${errorText(error)}`),
			ref,
			sha
		);
	}

	let existing: string | null = null;
	try {
		existing = readFileSync(file, 'utf8');
	} catch {
		existing = null;
	}
	if (existing === text) {
		log(`feed: ${archive.items.length} items from ${ref}@${shortSha(sha)} (unchanged)`);
		return { status: 'unchanged', ref, sha, items: archive.items.length, file };
	}

	writeAtomic(file, text);
	log(`feed: loaded ${archive.items.length} items from ${ref}@${shortSha(sha)}`);
	return { status: 'written', ref, sha, items: archive.items.length, file };
}

export function main(env: NodeJS.ProcessEnv = process.env, root = process.cwd()): number {
	try {
		loadFeed({ root, env, log: (line) => console.log(line) });
		return 0;
	} catch (error) {
		if (error instanceof FeedLoadError) {
			console.error(error.message);
			return 1;
		}
		throw error;
	}
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) process.exit(main());
