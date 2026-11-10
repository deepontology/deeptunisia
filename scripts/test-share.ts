/**
 * Assertions over the built share pages.
 *
 * A share link is handed out for every record, so every person, institution and
 * relationship in the dataset needs its own prerendered page. Each page is a
 * redirect stub: small, without the app's JavaScript, and carrying the preview
 * tags a crawler reads.
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

const targets: { kind: string; id: string }[] = [
	...dataset.people.map((p) => ({ kind: 'entity', id: p.id })),
	...dataset.institutions.map((i) => ({ kind: 'entity', id: i.id })),
	...dataset.relationships.map((r) => ({ kind: 'relationship', id: r.id }))
];

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
	`every person, institution and relationship has a share page (${targets.length})`,
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

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
