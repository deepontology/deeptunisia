/**
 * The published payload budget.
 *
 * The graph is the product, but a reader pays for it on every visit. The
 * dataset, the timeline slices and the static exports are all copied into the
 * built site, and the client bundle imports the graph at module scope. The
 * build already publishes the total (README, landing, llms), which catches a
 * number that drifts from the truth. It does not stop the number from growing.
 * This does.
 *
 * A cap is a decision, not a measurement. When a data wave genuinely needs more
 * room, raise the cap in the same change that adds the weight, so the growth is
 * something a person chose and the diff shows it.
 *
 * Usage: `npx tsx scripts/test-budget.ts`
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MB = 1024 * 1024;

/** Caps in megabytes. Deliberately close to today's weight. */
const CAPS = {
	'dataset (published)': 20.6,
	'timelines (published)': 3.5,
	'dataset (generated)': 12,
	'search index': 1,
	'static tree': 37
};

const PATHS = {
	'dataset (published)': 'static/dataset.json',
	'timelines (published)': 'static/timelines.json',
	'dataset (generated)': 'src/generated/dataset.json',
	'search index': 'static/search-index.json',
	'static tree': 'static'
};

let checks = 0;
const failures: string[] = [];

function ok(name: string, pass: boolean, detail = '') {
	checks++;
	if (pass) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures.push(name);
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

function bytes(path: string): number {
	const s = statSync(path);
	if (!s.isDirectory()) return s.size;
	let total = 0;
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		total += bytes(join(path, entry.name));
	}
	return total;
}

for (const [name, cap] of Object.entries(CAPS)) {
	const path = join(ROOT, PATHS[name as keyof typeof PATHS]);
	let size: number;
	try {
		size = bytes(path);
	} catch {
		ok(`${name} is under ${cap} MB`, false, 'file or directory missing');
		continue;
	}
	const mb = size / MB;
	ok(
		`${name} is under ${cap} MB`,
		mb <= cap,
		`${mb.toFixed(1)} MB of ${cap} MB — raise the cap deliberately if this growth is intended`
	);
}

// The search file is the one payload a reader pays for by asking for search,
// not by opening a page. Printed exactly, because its size is the whole point
// of the split: the cap above says when it has grown into a problem.
if (existsSync(join(ROOT, 'static/search-index.json'))) {
	const index = JSON.parse(readFileSync(join(ROOT, 'static/search-index.json'), 'utf8')) as {
		records?: unknown[];
	};
	console.log(
		`\n  search index: ${statSync(join(ROOT, 'static/search-index.json')).size.toLocaleString('en-US')} bytes, ${(index.records ?? []).length} rows, fetched on first search\n`
	);
}

// --- What a page preloads, read from the build -----------------------------
//
// Report mode. The table records today's weight per page and never fails on a
// row; the ceilings land in a later change. The one failure is a build whose
// graph chunk cannot be located, because a missing row would read as a pass.

const BUILD = join(ROOT, 'build');
const CLIENT_MANIFEST = join(ROOT, '.svelte-kit/output/client/.vite/manifest.json');
const DATASET = join(ROOT, 'src/generated/dataset.json');

function head(path: string, length: number): string {
	const fd = openSync(path, 'r');
	try {
		const buf = Buffer.alloc(length);
		const read = readSync(fd, buf, 0, length, 0);
		return buf.subarray(0, read).toString('utf8');
	} finally {
		closeSync(fd);
	}
}

function findGraphChunk(): { path: string; via: string } | null {
	// The manifest names chunk files, and for entry modules the source. Use it
	// only when it actually names the dataset; a chunk name is not a module.
	if (existsSync(CLIENT_MANIFEST)) {
		const manifest = JSON.parse(readFileSync(CLIENT_MANIFEST, 'utf8')) as Record<
			string,
			{ file: string; name?: string; src?: string }
		>;
		for (const [key, entry] of Object.entries(manifest)) {
			const label = `${key} ${entry.name ?? ''} ${entry.src ?? ''}`;
			if (!label.includes('generated/dataset.json')) continue;
			const path = join(BUILD, entry.file);
			if (existsSync(path)) return { path, via: 'manifest' };
		}
	}
	// No manifest lists the modules inside a shared chunk, so fall back to the
	// text: the graph chunk is the one that begins with the dataset itself.
	// The chunk inlines `meta` directly, so the probe starts inside that object.
	if (!existsSync(DATASET)) return null;
	const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as { meta?: unknown };
	const prefix = JSON.stringify(dataset.meta ?? {}).slice(0, 64);
	const dir = join(BUILD, '_app/immutable/chunks');
	if (!existsSync(dir)) return null;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.js')) continue;
		const path = join(dir, name);
		if (head(path, 4096).includes(prefix)) return { path, via: 'text' };
	}
	return null;
}

/** Every script the page asks for before hydration: modulepreload links and inline imports. */
function preloads(html: string): string[] {
	const files = new Set<string>();
	for (const tag of html.match(/<link[^>]*>/g) ?? []) {
		if (!/rel="modulepreload"/.test(tag)) continue;
		const href = /href="([^"]+)"/.exec(tag)?.[1];
		if (href?.endsWith('.js')) files.add(href);
	}
	for (const match of html.matchAll(/import\("([^"]+\.js)"\)/g)) files.add(match[1]);
	return [...files];
}

function builtPath(href: string): string {
	return join(BUILD, href.replace(/^\.?\//, ''));
}

if (!existsSync(BUILD)) {
	console.log('\n  build/ not present, page preload table skipped\n');
} else {
	const chunk = findGraphChunk();
	ok(
		'graph chunk located in the build',
		chunk !== null,
		chunk
			? chunk.via === 'manifest'
				? 'named by the build manifest'
				: 'by its text, because no manifest names it'
			: 'no chunk under build/_app contains the dataset'
	);
	if (chunk) {
		console.log('\n  script preloads per page (report only, uncompressed)\n');
		console.log('  page                        files        bytes   graph');
		const pages = readdirSync(BUILD)
			.filter((name) => name.endsWith('.html'))
			.sort();
		for (const page of pages) {
			const files = preloads(readFileSync(join(BUILD, page), 'utf8'));
			const paths = files.map(builtPath);
			const size = paths.reduce((sum, path) => sum + (existsSync(path) ? statSync(path).size : 0), 0);
			const graph = paths.includes(chunk.path) ? 'yes' : 'no';
			console.log(
				`  ${page.padEnd(26)} ${String(files.length).padStart(5)} ${size.toLocaleString('en-US').padStart(12)}   ${graph}`
			);
		}
		console.log('');
	}
}

console.log(`\n   ${checks - failures.length}/${checks} budget checks passed${failures.length ? `, ${failures.length} FAILED` : ''}\n`);
if (failures.length) process.exit(1);
