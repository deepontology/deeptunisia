/**
 * Assertions over the built share pages.
 *
 * A person or an institution is shared as its record page (/e/<id>, asserted in
 * test-records.ts); the old /share/entity/<id> address answers 301 to it. Every
 * relationship has a prerendered share page. Each is a redirect stub: small,
 * without the app's JavaScript, and carrying the preview tags a crawler reads.
 *
 * Reads the built site, so it runs after `npm run build`. Fails if build/ is absent.
 * Usage: `npx tsx scripts/test-share.ts`
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHARE_DIR = join(ROOT, 'build', 'share');
const DATASET_FILE = join(ROOT, 'src', 'generated', 'dataset.json');
const MAX_BYTES = 12 * 1024;

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
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

console.log('\n  ── share pages ──\n');

if (!existsSync(SHARE_DIR)) bail('build/share is missing: run `npm run build` first');
if (!existsSync(DATASET_FILE)) bail('src/generated/dataset.json is missing: run `npm run data` (or `npm run build`) first');

const dataset = JSON.parse(readFileSync(DATASET_FILE, 'utf8')) as {
	people: { id: string }[];
	institutions: { id: string }[];
	relationships: { id: string }[];
};

const targets: { kind: string; id: string }[] = dataset.relationships.map((r) => ({ kind: 'relationship', id: r.id }));

const missing: string[] = [];
const oversize: string[] = [];
const untagged: string[] = [];
const shelled: string[] = [];

for (const { kind, id } of targets) {
	const file = join(SHARE_DIR, kind, `${id}.html`);
	if (!existsSync(file)) {
		missing.push(`${kind}/${id}`);
		continue;
	}
	if (statSync(file).size > MAX_BYTES) oversize.push(`${kind}/${id}`);
	const html = readFileSync(file, 'utf8');
	const hasTags =
		/<meta property="og:title"/.test(html) &&
		/<meta http-equiv="refresh"/.test(html) &&
		/<link rel="canonical"/.test(html);
	if (!hasTags) untagged.push(`${kind}/${id}`);
	if (/<script[^>]*type="module"/.test(html)) shelled.push(`${kind}/${id}`);
}

const sample = (list: string[]) => list.slice(0, 3).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');

ok(
	`every relationship has a share page (${targets.length})`,
	missing.length === 0,
	missing.length ? `missing ${missing.length}: ${sample(missing)}` : ''
);
ok(
	'every share page is at most 12 KB',
	oversize.length === 0,
	oversize.length ? `${oversize.length} over 12 KB: ${sample(oversize)}` : ''
);
ok(
	'every share page has og:title, the refresh meta and the canonical link',
	untagged.length === 0,
	untagged.length ? `${untagged.length} without: ${sample(untagged)}` : ''
);
ok(
	'no share page loads the app JavaScript',
	shelled.length === 0,
	shelled.length ? `${shelled.length} with a module script: ${sample(shelled)}` : ''
);

/* An entity is shared as its record page. The address earlier links carry must not be a
   page of its own again, and must answer 301 to the record. */
ok('no entity share page is built', !existsSync(join(SHARE_DIR, 'entity')));
const redirectsFile = join(ROOT, 'build', '_redirects');
const redirects = existsSync(redirectsFile) ? readFileSync(redirectsFile, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')) : [];
ok('/share/entity/* answers 301 to /e/', redirects.includes('/share/entity/* /e/:splat 301'), redirects.join(' | ') || 'build/_redirects is missing');
const sourceOfShare = readFileSync(join(ROOT, 'src', 'lib', 'share.ts'), 'utf8');
ok('an entity share link is the record page', /kind === 'entity'\) return `\$\{origin\}\/e\//.test(sourceOfShare));
const noRecordPage = [...dataset.people, ...dataset.institutions].filter((r) => !existsSync(join(ROOT, 'build', 'e', `${r.id}.html`)));
ok('every person and institution the old entity address named has a record page', noRecordPage.length === 0, noRecordPage.length ? sample(noRecordPage.map((r) => r.id)) : '');

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
