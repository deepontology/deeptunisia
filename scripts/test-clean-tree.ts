/**
 * Clean tree gate: the build and the tests must leave tracked files alone.
 *
 * The rule: a file is written by a person or by the build, never by both. A
 * file the build writes is not tracked; a file in git is not touched by
 * `npm run build`, `npm run data`, `npm run test` or `npm run check`.
 *
 * This runs last in `npm run test`, after the build and the other suites, and
 * reads `git status --porcelain`. Every listed path must be on the allowlist
 * below, and the allowlist is empty: after a build, a test run or a check, the
 * tree is clean or the gate names the file that broke the rule. Adding an entry
 * to it is a step backwards, so it should only ever happen to record a known
 * fault that is being fixed.
 *
 * Outside a git checkout (an exported tarball) there is nothing to compare and
 * the gate says so instead of passing silently.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * Tracked files the build still rewrites in place. Empty is the goal: a file is
 * written by a person or by the build, never by both.
 */
const ALLOWED = new Set<string>([]);

/**
 * The one exception, and only in a release run. The release workflow sets
 * DT_RELEASE_SHA and writes the tag's commit into the paper's commitSha tag with
 * `npm run stats:write`, because a commit cannot be committed into its own
 * source. The paper may then differ from HEAD, but only in lines that carry that
 * tag. Any other change to it, or any other file, is still an offender.
 */
export function releaseException(
	path: string,
	releaseSha: string,
	diffLines: (path: string) => string[]
): boolean {
	if (!releaseSha) return false;
	if (!/^output\/deeptunisia-release-paper-[^/]+\.md$/.test(path)) return false;
	const changed = diffLines(path);
	return changed.length > 0 && changed.every((l) => l.includes('<!--stat:commitSha-->'));
}

let checks = 0;
let failures = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

console.log('\n  ── clean tree: the build leaves tracked files alone ──\n');

function git(args: string[]): string | null {
	try {
		return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
	} catch {
		return null;
	}
}

const listed = git(['status', '--porcelain']);
if (listed === null) {
	console.log('  not a git checkout; nothing to compare (skipped)');
	console.log('');
	process.exit(0);
}

/** `git status --porcelain` writes a two-character status, a space, then the path. */
function pathOf(line: string): string {
	const raw = line.slice(3).trim();
	// Renames read `old -> new`; the path that exists now is the second half.
	const renamed = raw.split(' -> ');
	const path = renamed[renamed.length - 1];
	return path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path;
}

const dirty = listed
	.split(/\r?\n/)
	.filter(Boolean)
	.map((line) => ({ line: line.trimEnd(), path: pathOf(line) }));

const releaseSha = process.env.DT_RELEASE_SHA?.trim() ?? '';
/** The added and removed lines of one file, without the diff headers. */
function changedLines(path: string): string[] {
	const out = git(['diff', '-U0', '--', path]) ?? '';
	return out.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
}
const offenders = dirty.filter((d) => !ALLOWED.has(d.path) && !releaseException(d.path, releaseSha, changedLines));

ok(
	'the build leaves no tracked file modified, added or removed outside the allowlist',
	offenders.length === 0,
	offenders.length ? `${offenders.length} path(s): ${offenders.map((o) => o.path).join(', ')}` : `${dirty.length} allowed path(s)`
);

{
	const paper = 'output/deeptunisia-release-paper-v0.1.2.md';
	const tagOnly = (_: string) => ['-<!--stat:commitSha--><!--/stat-->', '+<!--stat:commitSha-->abc<!--/stat-->'];
	const otherToo = (_: string) => [...tagOnly(_), '+an edited sentence'];
	ok('a release run may carry the paper commitSha tag change', releaseException(paper, 'abc', tagOnly));
	ok('an ordinary run may not', !releaseException(paper, '', tagOnly));
	ok('a release run may not carry any other change to the paper', !releaseException(paper, 'abc', otherToo));
	ok('a release run may not carry a change to another file', !releaseException('README.md', 'abc', tagOnly));
	ok('a release run with no diff lines is not an exception', !releaseException(paper, 'abc', () => []));
}

if (offenders.length) {
	console.error('');
	console.error('  These paths changed but may not:');
	for (const o of offenders) console.error(`    ${o.line}`);
	console.error('');
	console.error('  A tracked file was written by the build or a test. Either the file belongs');
	console.error('  to a person (stop the build writing it) or to the build (untrack it).');
	console.error('');
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
