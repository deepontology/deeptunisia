/**
 * Encoding fidelity sweep — the mojibake gate.
 *
 * Origin: review-response sprint F2 (docs/plans/review-response-v0.1.1.md).
 * Three source files shipped double-encoded UTF-8 (an em dash stored as the
 * three characters "â" + "€" + a curly quote, a middle dot as "Â" + "·", a
 * proportional sign as "â" + "ˆ" + a C1 control) and every existing suite
 * missed them: the i18n sweep sees dictionary keys, not hard-coded markup,
 * and svelte-check does not read bytes. One of the corrupted strings was
 * visible on the boot screen.
 *
 * NOTE: this file's own prose must never contain the literal corrupted byte
 * sequences — the sweep scans itself and would fail on its own documentation,
 * which is exactly the self-referential trap the plan file hit first. Quote
 * the residue by character name and code point, never by its bytes.
 *
 * The detector itself lives in encoding-guard.ts, shared with the smoke
 * rendered-text sweep, so the two suites cannot drift apart.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDoubleEncoding } from './encoding-guard.ts';

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

// --- The sweep --------------------------------------------------------------

const SCAN_DIRS = ['src', 'scripts', 'docs', 'community', 'landing', 'data'];
const SCAN_EXT = ['.ts', '.svelte', '.cjs', '.js', '.md', '.yaml'];

console.log('\n  ── encoding sweep: double-encoded UTF-8 residue ──\n');

let scanned = 0;
let hits: string[] = [];
for (const dir of SCAN_DIRS) {
	const base = join(ROOT, dir);
	if (!existsSync(base)) continue;
	for (const name of walk(base)) {
		const rel = name.slice(ROOT.length + 1);
		if (!SCAN_EXT.some((e) => rel.endsWith(e))) continue;
		if (rel.split(/[\\/]/).some((seg) => seg === 'node_modules' || seg === 'generated' || seg === 'contrib')) continue;
		scanned++;
		const r = hasDoubleEncoding(readFileSync(name, 'utf8'));
		if (r.found) hits.push(`${rel}: ${r.detail}`);
	}
}

ok('sweep scanned a non-trivial file set', scanned > 50, `${scanned} files`);
ok('no file carries double-encoded UTF-8 residue', hits.length === 0, hits.length ? hits.join('; ') : 'clean');

// The fixture: the exact residue that shipped. A deliberately corrupted string
// must be rejected, proving the gate can see what it exists to see.
{
	const fixture = 'const note = "1956\u00e2\u20ac\u201c2026"; // en dash, double-encoded';
	const r = hasDoubleEncoding(fixture);
	ok('fixture: a double-encoded en dash is detected', r.found, r.detail ?? 'not detected');
	const legit = 'const note = "créé en 1956–2026 — vérifié"; // legitimate French';
	ok('fixture: legitimate accented text is not flagged', !hasDoubleEncoding(legit).found);
	const legit2 = '// Âge d\u2019or: §10 · déjà vu';
	ok('fixture: Â, é, §, ·, ’ alone are not flagged', !hasDoubleEncoding(legit2).found);
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);

/** Depth-first walk, yielding absolute file paths. */
function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (entry === 'node_modules' || entry === '.git' || entry === 'generated' || entry === 'contrib') continue;
		let st;
		try {
			st = statSync(p);
		} catch {
			continue;
		}
		if (st.isDirectory()) yield* walk(p);
		else if (st.isFile()) yield p;
	}
}
