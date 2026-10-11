/**
 * Put the landing page at the site root.
 *
 * WHY THE LANDING PAGE IS NOT A SVELTEKIT ROUTE
 *
 * It is one self-contained file with its own type scale, its own three-language
 * dictionary and its own canvas. Porting it into the app would give it the app's
 * design tokens — which are deliberately tight, "an instrument panel, not a
 * landing page", in the words of tokens.css — and would put a marketing surface
 * inside the bundle every reader of the atlas downloads. Keeping it a file means
 * it can be edited, translated and redesigned without touching the instrument,
 * and it costs one copy at build time.
 *
 * WHAT THIS ENFORCES
 *
 * Everything the landing page claims about itself, checked against the build
 * rather than trusted:
 *
 *   - every asset it references exists in build/
 *   - it makes no cross-origin request of any kind, which is the same rule
 *     docs/anonymity-audit.md imposes on the atlas and the reason the fonts are
 *     self-hosted at all
 *   - it does not silently overwrite a prerendered route
 *   - the DENSITY ribbon, the "Start here" doors and the study cards are
 *     regenerated from src/generated/ at every build, because the page claims
 *     "Nothing is illustrative"; none of them is ever hand-edited
 *
 * Any of those failing is a hard exit. A landing page that 404s its own fonts
 * looks broken to precisely the audience it exists for.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { certainlyActive } from '../src/lib/model';
import { renderDoors, type Dataset as DoorDataset } from './landing/doors.ts';
import { renderIndexes } from './landing/indexes.ts';
import { loadPublicClaims, loadClaimContext, validateClaims } from './public-claims.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const SRC = join(ROOT, 'landing', 'index.html');
const OUT = join(BUILD, 'index.html');

function fail(message: string): never {
	console.error(`\n  build-landing: ${message}\n`);
	process.exit(1);
}

if (!existsSync(BUILD)) fail('build/ does not exist — run `vite build` first');
if (!existsSync(SRC)) fail('landing/index.html is missing');

/*
 * adapter-static prerenders the dev-fallback root route (src/routes/+page.svelte,
 * an empty page that redirects to /chronicle) to build/index.html. That stub is
 * exactly what the landing page replaces, so it is allowed to exist — but it
 * must be recognisable as itself. The page carries a marker comment; any other
 * content at the root is a regression: the route move has been undone and
 * Chronicle — or worse, a pitch — has taken the root. Overwriting that would
 * hide it, and the first anyone would know is a reader following a link to the
 * atlas and landing on the wrong thing.
 */
const ROOT_TITLE = '<title>DeepTunisia</title>';
if (existsSync(OUT)) {
	const existing = readFileSync(OUT, 'utf8');
	if (!existing.includes(ROOT_TITLE)) {
		fail(
			'build/index.html exists but is not the dev-fallback root stub — a route is\n' +
				'  prerendering to `/`. The site root belongs to the landing page;\n' +
				'  Chronicle lives at /chronicle. Check src/routes/+page.svelte.'
		);
	}
}

const original = readFileSync(SRC, 'utf8');
let html = original;

/* ---------------------------------------------------------------------------
   THE DICTIONARIES ARE GENERATED. The inline French and Arabic dictionaries
   are one writable copy too many: the page can be opened off disk, so they
   must live inside it, but the file people edit is landing/_strings.{fr,ar}.json.
   Regenerating the block here from those files removes the drift path that
   produced two different translatable-string counts in one page. The claim
   registry then checks the JSON values, and the generated copy follows.
   --------------------------------------------------------------------------- */
const DICT_BEGIN = '  /* ---- BEGIN GENERATED DICTIONARIES — edit the JSON, not this ---- */';
const DICT_END = '  /* ---- END GENERATED DICTIONARIES ---- */';

function withFreshDictionaries(html: string): string {
	const dicts: Record<string, Record<string, string>> = {};
	for (const lang of ['fr', 'ar'] as const) {
		dicts[lang] = JSON.parse(readFileSync(join(ROOT, 'landing', `_strings.${lang}.json`), 'utf8'));
	}
	const a = html.indexOf(DICT_BEGIN);
	const b = html.indexOf(DICT_END);
	if (a === -1 || b === -1) {
		fail('landing/index.html is missing the generated-dictionary markers — run landing/_i18n-inline.cjs');
	}
	const eol = html.includes('\r\n') ? '\r\n' : '\n';
	const body = JSON.stringify(dicts, null, 1).split('\n').join(eol);
	const block = `${DICT_BEGIN}${eol}  var DICT = ${body};${eol}${DICT_END}`;
	return html.slice(0, a) + block + html.slice(b + DICT_END.length);
}

html = withFreshDictionaries(html);

/* ---------------------------------------------------------------------------
   THE VISUALS ARE THE GRAPH. The DENSITY ribbon is a baked snapshot, and the
   page claims "Nothing is illustrative", so the array is recomputed here from
   the built graph with the site's own interval predicate (certainlyActive,
   imported from src/lib/model.ts), and the page is rewritten in both the build
   copy and the source, so the committed file stays the true snapshot. The same
   holds for the doors and study cards below. If any of them ever looks
   hand-edited, it was: run `npm run build`, which overwrites them.
   --------------------------------------------------------------------------- */
const GRAPH = join(ROOT, 'src', 'generated', 'dataset.json');

function computeVisuals() {
	if (!existsSync(GRAPH)) fail('src/generated/dataset.json is missing — run `npm run data` first');
	const d = JSON.parse(readFileSync(GRAPH, 'utf8')) as {
		positions?: { interval?: { startEarliest: number; startLatest: number; endEarliest: number | null; endLatest: number | null } }[];
	};

	/* DENSITY: positions certainly active per calendar year, 1956–2026,
	   sampled mid-year (1 July) — the same predicate the Chronicle draws its
	   solid core with. */
	const years: number[] = [];
	for (let y = 1956; y <= 2026; y++) years.push(y);
	const DENSITY = years.map((y) =>
		(d.positions || []).filter((p) => p.interval && certainlyActive(p.interval, new Date(y, 6, 1).getTime())).length
	);

	return { DENSITY };
}

type Visuals = ReturnType<typeof computeVisuals>;

const VISUAL_PREFIXES: [keyof Visuals, string][] = [['DENSITY', 'var DENSITY = ']];

function withFreshVisuals(html: string, v: Visuals): string {
	let out = html;
	for (const [key, prefix] of VISUAL_PREFIXES) {
		const re = new RegExp('(^\\s*)' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\[.*?\\];\\s*$', 'm');
		const m = out.match(re);
		if (!m) {
			fail(`could not locate \`${prefix}[…]\` in landing/index.html — has the array syntax changed?`);
		}
		out = out.replace(re, m![1] + prefix + JSON.stringify(v[key]) + ';');
	}
	return out;
}

function withFreshHash(html: string, hash: string): string {
	const marker = `/* dataset-hash: ${hash} */`;
	const re = /\/\* dataset-hash: [0-9a-f]* \*\//;
	if (re.test(html)) return html.replace(re, marker);
	/*
	 * Place the marker AFTER the header comment block closes, never inside it.
	 * Writing it inside the block above would close that comment early and turn
	 * the trailing delimiter line into live code — which is exactly what broke
	 * the 2026-08 deploy with "expected expression, got '==='".
	 */
	const headerBlock =
		/\/\*\s*=+\s*\n\s*REAL DATA — see the header comment\. Regenerate after `npm run data`\.\s*\n\s*=+\s*\*\//;
	if (headerBlock.test(html)) return html.replace(headerBlock, (m) => `${m}\n   ${marker}`);
	return html.replace('var DENSITY =', `${marker}\n   var DENSITY =`);
}

function checkDatasetHash(html: string, hash: string): void {
	const m = html.match(/\/\* dataset-hash: ([0-9a-f]+) \*\//);
	if (!m) fail('landing/index.html missing dataset-hash comment — run `npm run build`');
	else if (m[1] !== hash) {
		fail(
			`landing dataset-hash ${m[1]} does not match dataset.json hash ${hash.slice(0, 8)}… — run \`npm run build\` (stale DENSITY)`
		);
	}
}

/* The landing page's mutable figures are checked against the public-claim
   registry (data/public-claims.yaml), not against a second set of hand-written
   expectations. Every declared landing surface must match the value its typed
   resolver produces, so a stale number on the front page is a hard failure
   naming the claim and the file. */
function checkClaims(): void {
	const file = loadPublicClaims(join(ROOT, 'data', 'public-claims.yaml'));
	const ctx = loadClaimContext(ROOT);
	const { issues } = validateClaims(file, ROOT, ctx);
	const landing = issues.filter((i) => i.detail.includes('landing/'));
	if (landing.length) {
		fail(
			'landing claims are stale or unresolved:\n    ' +
				landing.map((i) => `[${i.code}] ${i.detail}`).join('\n    ')
		);
	}
}
/* ---------------------------------------------------------------------------
   GENERATED SECTIONS. "Start here" (scripts/landing/doors.ts) and the study
   cards (scripts/landing/indexes.ts) are rendered between comment markers and
   written into the source as well as the build, like the arrays above, so the
   committed page is what ships and the claim registry can check its figures.
   The study registry is optional: without src/generated/studies.json the
   indexes region is empty and the section is not on the page.
   --------------------------------------------------------------------------- */
function loadDataset(): DoorDataset {
	return JSON.parse(readFileSync(GRAPH, 'utf8')) as DoorDataset;
}

function loadStudies(): unknown | null {
	const file = join(ROOT, 'src', 'generated', 'studies.json');
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

function withRegion(html: string, name: string, body: string): string {
	const open = `<!--landing:${name}-->`;
	const close = `<!--/landing:${name}-->`;
	const a = html.indexOf(open);
	const b = html.indexOf(close);
	if (a === -1 || b === -1 || b < a) fail(`landing/index.html is missing the ${open} … ${close} markers`);
	const eol = html.includes('\r\n') ? '\r\n' : '\n';
	const inner = body ? eol + body.split('\n').join(eol) + eol : eol;
	return html.slice(0, a + open.length) + inner + html.slice(b);
}

const visuals = computeVisuals();
// Stable hash tied to the visuals themselves (derived from dataset.json), not the
// file's timestamp — otherwise every `npm run data` would invalidate the landing
// even when the graph is unchanged, which would make `npm run data && npm run test`
// spuriously fail. The arrays are the contract; the hash is the manifest tie.
// This marker is NOT the graph identity (dataset.json meta.datasetHash is): it ties
// the committed DENSITY array to the dataset they were computed from.
const datasetHash = createHash('sha256').update(JSON.stringify(visuals)).digest('hex').slice(0, 16);
let fresh = withFreshVisuals(html, visuals);
fresh = withFreshHash(fresh, datasetHash);
fresh = withRegion(fresh, 'doors', renderDoors(loadDataset()));
fresh = withRegion(fresh, 'indexes', renderIndexes(loadStudies(), 'en', (p) => existsSync(join(BUILD, p))));
if (fresh !== original) {
	/* the source stays the true snapshot — the same rule as the build's own
	   published statistics, which rewrite the docs that carry them */
	writeFileSync(SRC, fresh, 'utf8');
	html = fresh;
}
checkDatasetHash(html, datasetHash);
checkClaims();

/*
 * The page is authored to be opened straight off disk, so it reaches its fonts
 * with a relative path out of landing/. In the build, static/ has been flattened
 * onto the root, so the same file is one absolute path away.
 */
const RELATIVE_FONTS = '../static/fonts/fonts.css';
if (!html.includes(RELATIVE_FONTS)) {
	fail(`expected ${RELATIVE_FONTS} in landing/index.html — has the stylesheet link changed?`);
}
html = html.replaceAll(RELATIVE_FONTS, '/fonts/fonts.css');

/* ---------------------------------------------------------------------------
   No cross-origin requests. Not a preference: the site was once found handing
   every reader's IP, User-Agent and current page to Google through a webfont,
   and this page is the one most likely to acquire a tracking pixel because it
   is the one somebody will eventually want conversion numbers for.
   --------------------------------------------------------------------------- */
const EXTERNAL = /(?:src|href)\s*=\s*["'](https?:)?\/\/([^"']+)["']/gi;
const offenders = [...html.matchAll(EXTERNAL)]
	.map((m) => m[0])
	// Links a reader clicks are fine; it is loaded subresources that leak.
	.filter((tag) => !/^href/i.test(tag) || /rel\s*=\s*["']?stylesheet/i.test(tag));
if (offenders.length) {
	fail(`the landing page loads something from another origin:\n    ${offenders.join('\n    ')}`);
}

/* Every local asset it points at has to be in the build. */
const LOCAL = /(?:src|href)\s*=\s*["'](\/[^"'#?]+)["']/gi;
const missing = [...html.matchAll(LOCAL)]
	.map((m) => m[1])
	// Routes, not files — those are prerendered directories.
	.filter((p) => /\.\w{2,5}$/.test(p))
	.filter((p) => !existsSync(join(BUILD, p)));
if (missing.length) fail(`referenced by the landing page but not in build/:\n    ${missing.join('\n    ')}`);

/* The CTA has to land somewhere. adapter-static emits `chronicle.html` for the
   route `/chronicle` under the default `trailingSlash: 'never'`, and
   `chronicle/index.html` under `'always'` — accept either, so flipping that
   setting does not silently turn the only button on the page into a 404. */
const CTA = /<a class="enter" href="([^"]+)"/;
const cta = html.match(CTA)?.[1];
if (!cta) fail('no CTA found — has the `a.enter` class changed?');
if (cta.startsWith('/')) {
	const asFile = join(BUILD, `${cta}.html`);
	const asDir = join(BUILD, cta, 'index.html');
	if (!existsSync(asFile) && !existsSync(asDir)) {
		fail(`the CTA points at ${cta}, which is not in the build`);
	}
}

writeFileSync(OUT, html, 'utf8');

const kb = (n: number) => `${Math.round(n / 1024)}KB`;
const fonts = readdirSync(join(BUILD, 'fonts')).filter((f) => f.endsWith('.woff2')).length;
console.log(
	`\n  landing     ${kb(html.length)} at /  ·  CTA → ${cta}  ·  ${fonts} self-hosted fonts  ·  0 external requests`
);
