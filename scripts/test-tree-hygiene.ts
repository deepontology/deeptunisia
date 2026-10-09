/**
 * Tree hygiene — what may never be committed or shipped.
 *
 * Three rules, checked against every tracked file and, when it exists, every file
 * in build/ (what the site actually serves):
 *
 *   1. No symbolic links are tracked. A worktree that represents node_modules,
 *      .claude or .opencode as a symlink to the main checkout makes `git add -A`
 *      commit the link, and the link's target is an absolute local path.
 *   2. No absolute home-directory path (`/home/<user>/`, `/Users/<user>/`) appears
 *      in any tracked text file or built file. Local paths say nothing a reader
 *      needs and something about the machine that wrote them.
 *   3. No identifier listed in the maintainer's local pattern file appears in any
 *      tracked file, any built file, or the text and metadata of any PDF among
 *      them. The list itself is never tracked and never printed: a hit is
 *      reported by file, line and list position only. Without the file (CI, a
 *      fork, a fresh clone) this rule is skipped and the run says so.
 *
 * The pattern file is the first of: $DT_IDENTITY_PATTERNS, or
 * internal/identity-patterns.txt in the main checkout (found through the git
 * common dir, so every worktree uses the same list). One identifier per line,
 * matched case-insensitively as a substring; blank lines and `#` lines ignored.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** A home-directory path at the start of a token, not `/home/` inside a URL path. */
const HOME_PATH = /(^|[\s'"`=(\[,;])\/(home|Users)\/[A-Za-z][\w.-]*\//m;

const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|zip|gz|br|mp4|webm|mp3|wasm)$/i;

function git(args: string[]): string {
	return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function loadPatterns(): { patterns: string[]; source: string } {
	const candidates: string[] = [];
	if (process.env.DT_IDENTITY_PATTERNS) candidates.push(resolve(process.env.DT_IDENTITY_PATTERNS));
	try {
		const common = resolve(ROOT, git(['rev-parse', '--git-common-dir']).trim());
		candidates.push(join(dirname(common), 'internal', 'identity-patterns.txt'));
	} catch {
		// not a git checkout — the tracked-file rules below fail on their own
	}
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		const patterns = readFileSync(path, 'utf8')
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith('#'))
			.map((l) => l.toLowerCase());
		return { patterns, source: 'local pattern file' };
	}
	return { patterns: [], source: '' };
}

/** Text a PDF exposes: extracted page text and document info, when poppler is installed. */
function pdfText(path: string): string | null {
	const text = spawnSync('pdftotext', ['-q', path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const info = spawnSync('pdfinfo', [path], { encoding: 'utf8' });
	if (text.error || info.error) return null;
	return `${text.stdout ?? ''}\n${info.stdout ?? ''}`;
}

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const st = lstatSync(p);
		if (st.isDirectory()) yield* walk(p);
		else if (st.isFile()) yield p;
	}
}

interface Hit {
	file: string;
	line: number;
	what: string;
}

function scan(rel: string, abs: string, patterns: string[], hits: Hit[], pdfSkipped: string[]) {
	if (BINARY_EXT.test(rel)) return;
	let content: string;
	if (/\.pdf$/i.test(rel)) {
		const extracted = pdfText(abs);
		if (extracted === null) pdfSkipped.push(rel);
		// Raw bytes as well: uncompressed Info and XMP metadata are plain text.
		content = `${extracted ?? ''}\n${readFileSync(abs).toString('latin1')}`;
	} else {
		content = readFileSync(abs, 'utf8');
	}
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!/\.pdf$/i.test(rel) && HOME_PATH.test(line)) hits.push({ file: rel, line: i + 1, what: 'home-directory path' });
		if (patterns.length) {
			const lower = line.toLowerCase();
			patterns.forEach((p, k) => {
				if (lower.includes(p)) hits.push({ file: rel, line: i + 1, what: `listed identifier #${k + 1}` });
			});
		}
	}
}

console.log('\n  ── tree hygiene: symlinks, local paths, listed identifiers ──\n');

const { patterns, source } = loadPatterns();
if (patterns.length) console.log(`  identifier list: ${patterns.length} entries (${source})`);
else console.log('  identifier list: not configured on this machine; rule 3 skipped, rules 1 and 2 still run');

// 1. Symlinks
const staged = git(['ls-files', '-s', '-z']).split('\0').filter(Boolean);
const links = staged.filter((e) => e.startsWith('120000 ')).map((e) => e.split('\t')[1]);
ok('no tracked symbolic links', links.length === 0, links.length ? links.join(', ') : `${staged.length} entries`);

// 2 and 3. Tracked files
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const trackedHits: Hit[] = [];
const pdfSkipped: string[] = [];
for (const rel of tracked) {
	const abs = join(ROOT, rel);
	if (!existsSync(abs) || !lstatSync(abs).isFile()) continue;
	scan(rel, abs, patterns, trackedHits, pdfSkipped);
}
const fmt = (hits: Hit[]) =>
	hits
		.slice(0, 10)
		.map((h) => `${h.file}:${h.line} (${h.what})`)
		.join('; ');
ok(
	'tracked files carry no home-directory path or listed identifier',
	trackedHits.length === 0,
	trackedHits.length ? fmt(trackedHits) : `${tracked.length} files`
);

// 2 and 3. Built site
const BUILD = join(ROOT, 'build');
if (existsSync(BUILD)) {
	const buildHits: Hit[] = [];
	let n = 0;
	for (const abs of walk(BUILD)) {
		n++;
		scan(abs.slice(ROOT.length + 1), abs, patterns, buildHits, pdfSkipped);
	}
	ok('build/ carries no home-directory path or listed identifier', buildHits.length === 0, buildHits.length ? fmt(buildHits) : `${n} files`);
} else {
	console.log('  build/ absent; built-site scan skipped (run after `npm run build` to include it)');
}

if (pdfSkipped.length) {
	console.log(`  note: pdftotext/pdfinfo not installed; ${pdfSkipped.length} PDF(s) scanned as raw bytes only`);
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
