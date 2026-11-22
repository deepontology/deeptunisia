/**
 * Assertions over the prerendered study pages.
 *
 * A reader without JavaScript, a crawler and a link preview all get the HTML
 * the build wrote, before the page asks the server anything. For a study the
 * registry marks as fielding, that HTML must not say the study is not
 * collecting: the status line and the headline under the index both derive from
 * the registry status until the live read answers.
 *
 * Reads the built site, so it runs after `npm run build`. Fails if build/ is absent.
 * Set BUILD_DIR to read another build directory.
 * Usage: `npx tsx scripts/test-study-prerender.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = process.env.BUILD_DIR ?? join(ROOT, 'build');
const STUDIES_FILE = join(ROOT, 'src', 'generated', 'studies.json');

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
	if (condition) {
		console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	}
}

function bail(message: string): never {
	console.error(`  FAIL  ${message}`);
	process.exit(1);
}

/** The text a reader without JavaScript sees: scripts and styles dropped, tags removed. */
function visibleText(html: string): string {
	return html
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ');
}

console.log('\n  ── prerendered study pages ──\n');

if (!existsSync(join(BUILD, 'research'))) bail(`${join(BUILD, 'research')} is missing: run \`npm run build\` first`);
if (!existsSync(STUDIES_FILE)) bail('src/generated/studies.json is missing: run `npm run data` (or `npm run build`) first');

const registry = JSON.parse(readFileSync(STUDIES_FILE, 'utf8')) as { studies: { id: string; slug: string; status: string }[] };
const fielding = registry.studies.filter((s) => s.status === 'fielding');

ok('the registry lists at least one fielding study', fielding.length > 0, fielding.map((s) => s.slug).join(', '));

for (const study of fielding) {
	const file = join(BUILD, 'research', `${study.slug}.html`);
	if (!existsSync(file)) {
		ok(`${study.slug}: the study page is prerendered`, false, file);
		continue;
	}
	const text = visibleText(readFileSync(file, 'utf8'));
	ok(`${study.slug}: the status line says it is collecting`, /collecting answers/i.test(text));
	ok(`${study.slug}: the prerendered page does not say "not collecting"`, !/not collecting/i.test(text));
	ok(`${study.slug}: the prerendered page does not say "not collecting responses yet"`, !/not collecting responses yet/i.test(text));
	ok(
		`${study.slug}: the headline under the index says it is collecting`,
		/Collecting answers\. The first figure appears at \d+\./.test(text)
	);
}

console.log(failures === 0 ? '\n  all prerendered study pages agree with the registry\n' : `\n  ${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
