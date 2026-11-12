/**
 * Clean tree gate — the build and the tests must leave tracked files alone.
 *
 * The rule: a file is written by a person or by the build, never by both. A
 * file the build writes is not tracked; a file in git is not touched by
 * `npm run build`, `npm run data`, `npm run test` or `npm run check`.
 *
 * This runs last in `npm run test`, after the build and the other suites, and
 * reads `git status --porcelain`. Every listed path must be on the allowlist
 * below. The allowlist is the set of mixed files the team still has to make
 * read-only for the build; it shrinks to nothing and is not meant to grow.
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
 * Tracked files the build still rewrites in place, with the job that removes
 * each from the rewrite path. Empty is the goal.
 */
const ALLOWED = new Set<string>([
	// Documents a person wrote that the build edits in place. The build stops
	// rewriting them; until then they stay here.
	'landing/index.html',
	'static/llms.txt',
	'README.md',
	'AGENTS.md',
	'DESIGN.md',
	'output/deeptunisia-release-paper-v0.1.1.md',
	'output/deeptunisia-release-paper-v0.1.2.md'
]);

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

const offenders = dirty.filter((d) => !ALLOWED.has(d.path));

ok(
	'the build leaves no tracked file modified, added or removed outside the allowlist',
	offenders.length === 0,
	offenders.length ? `${offenders.length} path(s): ${offenders.map((o) => o.path).join(', ')}` : `${dirty.length} allowed path(s)`
);

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
