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
	'dataset (published)': 17,
	'timelines (published)': 3.5,
	'source excerpts (fetched)': 0.6,
	'record text (fetched)': 2,
	'dataset (generated)': 12,
	'search index': 1,
	'static tree': 36
};

const PATHS = {
	'dataset (published)': 'static/dataset.json',
	'timelines (published)': 'static/timelines.json',
	'source excerpts (fetched)': 'static/sources-prose.json',
	'record text (fetched)': 'static/prose-en.json',
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
// Three kinds of page, three rules. The kind comes from the route group the page
// lives in, so a new page is held to a rule the day it is added:
//
//   reading pages     (src/routes/(read))        never the graph chunk, and a script ceiling
//   instrument pages  (src/routes/(instrument))  today's weight plus 5%, so growth is noticed
//   record pages      (build/e/<id>.html)        no script at all: plain documents
//
// A build whose graph chunk cannot be located fails, because a missing row
// would read as a pass.

const BUILD = join(ROOT, 'build');
const CLIENT_MANIFEST = join(ROOT, '.svelte-kit/output/client/.vite/manifest.json');
const DATASET = join(ROOT, 'src/generated/graph.json');

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
			if (!label.includes('generated/graph.json')) continue;
			const path = join(BUILD, entry.file);
			if (existsSync(path)) return { path, via: 'manifest' };
		}
	}
	// No manifest lists the modules inside a shared chunk, so fall back to the
	// text: the graph chunk is the one that begins with the dataset itself.
	// The chunk inlines `meta` directly, so the probe starts inside that object.
	// `generated` is the clock, and any `npm run data` without a rebuild moves
	// it, so the fallback also accepts the cutoff/floor/license signature: the
	// chunk still has to be a copy of this dataset's meta, just not a rebuild
	// from the same second.
	if (!existsSync(DATASET)) return null;
	const dataset = JSON.parse(readFileSync(DATASET, 'utf8')) as {
		meta?: { cutoff?: unknown; floor?: unknown };
	};
	const meta = dataset.meta ?? {};
	const prefix = JSON.stringify(meta).slice(0, 64);
	const signature =
		typeof meta.cutoff === 'number' && typeof meta.floor === 'number'
			? `"cutoff":${meta.cutoff},"floor":${meta.floor},"license":"CC-BY-4.0"`
			: null;
	const dir = join(BUILD, '_app/immutable/chunks');
	if (!existsSync(dir)) return null;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.js')) continue;
		const path = join(dir, name);
		const text = head(path, 4096);
		if (text.includes(prefix) || (signature !== null && text.includes(signature))) {
			return { path, via: 'text' };
		}
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

/**
 * Ceiling for a reading page's preloaded script, in bytes. The lane book
 * (spec 4, C2) sets 400 KB as the target. The frame every page shares (the
 * Svelte runtime, the menu bar, the translation table) costs about 590 KB on
 * the lightest page today, so the target is not met and this ceiling is the
 * measured one: the heaviest reading page (/research, 917,417 bytes) plus
 * 5%. Lower it as the frame shrinks; never raise it without saying why.
 */
const READING_CEILING = 960_000;

/**
 * Instrument pages may load the graph. Each is held to the weight it had when
 * the ceilings were turned on, plus 5%, and the baseline is lowered when the weight
 * goes down so the gain cannot be spent again. Bytes preloaded, uncompressed.
 * Lowered by about 525,000 bytes each when the sources' excerpts, notes and
 * flags left the bundled graph (`static/sources-prose.json`, fetched on demand), and by
 * about 1,480,000 more when the long English text of people, institutions, positions,
 * connections and events left it (`static/prose-en.json`, fetched on demand).
 * /events joined as an instrument route at its first measured weight, when the
 * events page moved from a built document into the app.
 */
const INSTRUMENT_BASELINE: Record<string, number> = {
	agora: 9_394_076,
	atlas: 9_513_484,
	chronicle: 9_312_075,
	events: 9_459_984,
	evidence: 9_260_454,
	feed: 9_939_391,
	investigate: 9_276_296,
	map: 9_239_964,
	network: 9_334_250,
	now: 9_507_717,
	rankings: 9_339_545,
	world: 9_667_057
};
const INSTRUMENT_GROWTH = 1.05;

/**
 * The HTML a page ships, for the pages whose markup is large enough to matter.
 * The Chronicle draws a bar for every tenure; its prerendered page weighed
 * 2.76 MB before it was windowed to the first screen of rows, and 466,396
 * bytes after. Each ceiling is the weight the page had when it was set, plus
 * 5%, so drawing every row into the page again fails here.
 */
const HTML_CEILING: Record<string, number> = {
	chronicle: 490_000
};

/** Record pages are documents: no script is preloaded, and what is, stays under this. */
const RECORD_SCRIPT_CEILING = 1024;

function routeNames(group: string): string[] {
	const dir = join(ROOT, 'src/routes', group);
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function scriptBytes(html: string): { files: string[]; bytes: number; paths: string[] } {
	const files = preloads(html);
	const paths = files.map(builtPath);
	const bytes = paths.reduce((sum, path) => sum + (existsSync(path) ? statSync(path).size : 0), 0);
	return { files, bytes, paths };
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
		const reading = routeNames('(read)');
		const instruments = routeNames('(instrument)');
		ok('route groups are found', reading.length > 0 && instruments.length > 0, `${reading.length} reading, ${instruments.length} instrument`);
		const pages = readdirSync(BUILD)
			.filter((name) => name.endsWith('.html'))
			.sort();

		console.log('\n  script preloads per page (uncompressed)\n');
		console.log('  page                        kind          files        bytes   graph   ceiling');
		for (const page of pages) {
			const name = page.replace(/\.html$/, '');
			const { files, bytes: size, paths } = scriptBytes(readFileSync(join(BUILD, page), 'utf8'));
			const graph = paths.includes(chunk.path);
			let kind: string;
			let ceiling = 0;
			if (reading.includes(name)) {
				kind = 'reading';
				ceiling = READING_CEILING;
				ok(`/${name} (reading) does not preload the graph`, !graph);
				ok(`/${name} (reading) preloads at most ${READING_CEILING.toLocaleString('en-US')} bytes`, size <= ceiling, `${size.toLocaleString('en-US')} bytes`);
			} else if (instruments.includes(name)) {
				kind = 'instrument';
				const base = INSTRUMENT_BASELINE[name];
				ok(`/${name} (instrument) has a recorded baseline`, base !== undefined, 'add it to INSTRUMENT_BASELINE on purpose');
				if (base !== undefined) {
					ceiling = Math.floor(base * INSTRUMENT_GROWTH);
					ok(`/${name} (instrument) is within 5% of its baseline`, size <= ceiling, `${size.toLocaleString('en-US')} of ${ceiling.toLocaleString('en-US')} bytes`);
				}
			} else {
				// 404, the landing page and the other static documents: no app frame.
				kind = 'document';
				ok(`${page} (document) preloads no script`, files.length === 0, `${files.length} file(s)`);
			}
			console.log(
				`  ${page.padEnd(27)} ${kind.padEnd(11)} ${String(files.length).padStart(5)} ${size.toLocaleString('en-US').padStart(12)}   ${graph ? 'yes' : 'no '}   ${ceiling ? ceiling.toLocaleString('en-US') : '-'}`
			);
		}
		console.log('');

		for (const [name, ceiling] of Object.entries(HTML_CEILING)) {
			const file = join(BUILD, `${name}.html`);
			const size = existsSync(file) ? statSync(file).size : -1;
			ok(`/${name} ships at most ${ceiling.toLocaleString('en-US')} bytes of HTML`, size >= 0 && size <= ceiling, size < 0 ? 'page is missing' : `${size.toLocaleString('en-US')} bytes`);
		}

		ok('every reading route has a built page', reading.every((name) => pages.includes(`${name}.html`)), reading.filter((name) => !pages.includes(`${name}.html`)).join(', '));
		ok('every instrument route has a built page', instruments.every((name) => pages.includes(`${name}.html`)), instruments.filter((name) => !pages.includes(`${name}.html`)).join(', '));
		const stale = Object.keys(INSTRUMENT_BASELINE).filter((name) => !instruments.includes(name));
		ok('every instrument baseline names an instrument route', stale.length === 0, stale.join(', '));

		// Record pages: one file per record, all of them read here.
		const recordDir = join(BUILD, 'e');
		if (existsSync(recordDir)) {
			const records = readdirSync(recordDir).filter((name) => name.endsWith('.html'));
			let heaviest = 0;
			let withGraph = 0;
			let overweight = 0;
			let withModule = 0;
			for (const name of records) {
				const html = readFileSync(join(recordDir, name), 'utf8');
				const { bytes: size, paths } = scriptBytes(html);
				heaviest = Math.max(heaviest, size);
				if (paths.includes(chunk.path)) withGraph++;
				if (size > RECORD_SCRIPT_CEILING) overweight++;
				if (/<script[^>]*type="module"/.test(html)) withModule++;
			}
			ok('record pages exist', records.length > 0, `${records.length} pages`);
			ok('no record page preloads the graph', withGraph === 0, `${withGraph} of ${records.length}`);
			ok(`no record page preloads more than ${RECORD_SCRIPT_CEILING} bytes of script`, overweight === 0, `${overweight} over, heaviest ${heaviest} bytes`);
			ok('no record page loads a module script', withModule === 0, `${withModule} of ${records.length}`);
		} else {
			ok('record pages exist', false, 'build/e is missing');
		}
	}
}

// --- Font preloads ---------------------------------------------------------
// Every face in static/fonts/fonts.css is `font-display: swap` and asked for on first use, and a
// face that arrives after the page is built makes the browser lay the whole page out again
// (about 0.35 s each on the phone profile, twice, on /chronicle). A page preloads the faces its
// first record panel draws, so they are in before the tap, and only those: each preloaded byte
// competes with the page's own scripts. Which faces, and why, is argued where the link is.
// A page that opens the record panel draws the same late faces. Whether it preloads them follows
// from one fact: whether the page has a tap or text line that the late relayout lands before.
// `gated` marks the pages `npm run measure:phone` holds to a line. A gated page must preload; an
// ungated one preloads nothing, because its relayouts fall after the words and the bytes only cost.
// The per-route measurement behind each ungated entry is in the release handoff notes, post-launch
// list. The day a page gains a line, the checks below fail until its row says so and names the faces.
const FONT_ROUTES: Record<string, { gated: boolean; preload: string[] }> = {
	chronicle: { gated: true, preload: ['ibm-plex-sans-arabic-w400-arabic.woff2', 'newsreader-w400-italic-latin.woff2'] },
	atlas: { gated: false, preload: [] },
	network: { gated: false, preload: [] },
	now: { gated: false, preload: [] },
	rankings: { gated: false, preload: [] }
};
const FONT_PRELOADS: Record<string, string[]> = Object.fromEntries(Object.entries(FONT_ROUTES).map(([name, row]) => [name, row.preload]));
const FONT_PRELOAD_CEILING = 120_000;

if (existsSync(BUILD)) {
	console.log('\n  font preloads per page\n');
	const fontCss = readFileSync(join(ROOT, 'static/fonts/fonts.css'), 'utf8');
	const measured = (readFileSync(join(ROOT, 'scripts/measure-phone.ts'), 'utf8').match(/arg\('route'\) \?\? '\/([a-z-]+)'/) ?? [])[1];
	ok(`the page measure:phone holds to a line (/${measured}) is marked gated in FONT_ROUTES`, measured !== undefined && FONT_ROUTES[measured]?.gated === true, 'add the page to FONT_ROUTES and decide its preloads');
	for (const [name, row] of Object.entries(FONT_ROUTES)) {
		ok(`/${name} ${row.gated ? 'has a line and preloads its late faces' : 'has no line and preloads nothing'}`, row.gated ? row.preload.length > 0 : row.preload.length === 0);
	}
	for (const page of readdirSync(BUILD).filter((name) => name.endsWith('.html')).sort()) {
		const name = page.replace(/\.html$/, '');
		const links = [...readFileSync(join(BUILD, page), 'utf8').matchAll(/<link\b[^>]*\brel="preload"[^>]*\bas="font"[^>]*>/g)].map((m) => m[0]);
		const files = links.map((l) => (l.match(/href="\/fonts\/([^"]+)"/) ?? [])[1] ?? '');
		const expected = FONT_PRELOADS[name] ?? [];
		ok(`/${name} preloads ${expected.length ? expected.join(' and ') : 'no font'}`, files.length === expected.length && expected.every((f) => files.includes(f)), files.join(', ') || 'none');
		if (links.length === 0) continue;
		ok(`/${name} font preloads are woff2 and carry crossorigin (without it the font is fetched twice)`, links.every((l) => /type="font\/woff2"/.test(l) && /\bcrossorigin\b/.test(l)));
		ok(`/${name} font preloads are low priority (they must not delay the page's own scripts)`, links.every((l) => /fetchpriority="low"/.test(l)));
		ok(`/${name} font preloads name files that exist and that fonts.css declares`, files.every((f) => existsSync(join(ROOT, 'static/fonts', f)) && fontCss.includes(`./${f}`)));
		const size = files.reduce((sum, f) => sum + (existsSync(join(ROOT, 'static/fonts', f)) ? statSync(join(ROOT, 'static/fonts', f)).size : 0), 0);
		ok(`/${name} font preloads total at most ${FONT_PRELOAD_CEILING.toLocaleString('en-US')} bytes`, size <= FONT_PRELOAD_CEILING, `${size.toLocaleString('en-US')} bytes`);
	}
}

console.log(`\n   ${checks - failures.length}/${checks} budget checks passed${failures.length ? `, ${failures.length} FAILED` : ''}\n`);
if (failures.length) process.exit(1);
