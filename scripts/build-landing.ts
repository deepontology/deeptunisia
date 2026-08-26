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
 *   - the DENSITY / NODES / EDGES visuals are regenerated from
 *     src/generated/dataset.json at every build, because the page claims
 *     "Nothing is illustrative" — the arrays are never hand-edited
 *
 * Any of those failing is a hard exit. A landing page that 404s its own fonts
 * looks broken to precisely the audience it exists for.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { certainlyActive } from '../src/lib/model';

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

let html = readFileSync(SRC, 'utf8');

/* ---------------------------------------------------------------------------
   THE VISUALS ARE THE GRAPH. The DENSITY ribbon and the evidence-dial demo are
   baked snapshots, and the page claims "Nothing is illustrative" — so the three
   arrays are recomputed here from the built graph with the site's own interval
   predicate (certainlyActive, imported from src/lib/model.ts), and the page is
   rewritten in both the build copy and the source, so the committed file stays
   the true snapshot. If the arrays in landing/index.html ever look hand-edited,
   they were: run `npm run build`, which overwrites them.
   --------------------------------------------------------------------------- */
const GRAPH = join(ROOT, 'src', 'generated', 'dataset.json');

function computeVisuals() {
	if (!existsSync(GRAPH)) fail('src/generated/dataset.json is missing — run `npm run data` first');
	const d = JSON.parse(readFileSync(GRAPH, 'utf8')) as {
		positions?: { interval?: { startEarliest: number; startLatest: number; endEarliest: number | null; endLatest: number | null } }[];
		relationships?: { from: string; to: string; basis?: string }[];
		people?: { id: string; name_en?: string; layers?: string[] }[];
	};

	/* DENSITY: positions certainly active per calendar year, 1956–2026,
	   sampled mid-year (1 July) — the same predicate the Chronicle draws its
	   solid core with. */
	const years: number[] = [];
	for (let y = 1956; y <= 2026; y++) years.push(y);
	const DENSITY = years.map((y) =>
		(d.positions || []).filter((p) => p.interval && certainlyActive(p.interval, new Date(y, 6, 1).getTime())).length
	);

	/* The 46 most-connected people by global relationship degree, with their
	   real primary layer and real degree — what the demo's lane layout eats. */
	const deg = new Map<string, number>();
	for (const r of d.relationships || []) {
		if (!r.from || !r.to) continue;
		deg.set(r.from, (deg.get(r.from) || 0) + 1);
		deg.set(r.to, (deg.get(r.to) || 0) + 1);
	}
	const people = new Map((d.people || []).map((p) => [p.id, p]));
	const top = [...deg.entries()]
		.filter(([id]) => people.has(id))
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
		.slice(0, 46);
	const inTop = new Set(top.map(([id]) => id));
	const NODES = top.map(([id, dg]) => {
		const p = people.get(id)!;
		return [id, p.name_en || id, (p.layers && p.layers[0]) || 'political', dg];
	});
	const EDGES = (d.relationships || [])
		.filter((r) => r.from && r.to && inTop.has(r.from) && inTop.has(r.to))
		.map((r) => [r.from, r.to, r.basis || 'reported']);

	return { DENSITY, NODES, EDGES };
}

type Visuals = ReturnType<typeof computeVisuals>;

const VISUAL_PREFIXES: [keyof Visuals, string][] = [
	['DENSITY', 'var DENSITY = '],
	['NODES', 'var NODES = '],
	['EDGES', 'var EDGES = ']
];

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
			`landing dataset-hash ${m[1]} does not match dataset.json hash ${hash.slice(0, 8)}… — run \`npm run build\` (stale DENSITY/NODES/EDGES)`
		);
	}
}

/* The demo's caption states how many of the 46 are stranded at the
   documented-only floor — a number the arrays imply. If the copy drifts from
   the computed value, the page is quietly wrong about its own demo, and the
   build refuses to ship that. */
function checkFloorNote(html: string, v: Visuals): void {
	const documentedEndpoints = new Set<string>();
	for (const e of v.EDGES) {
		if (e[2] === 'documented') {
			documentedEndpoints.add(e[0]);
			documentedEndpoints.add(e[1]);
		}
	}
	const stranded = v.NODES.length - documentedEndpoints.size;
	const m = html.match(/strands (\d+) of these 46 people/);
	if (!m) fail('could not find the evidence-floor note ("strands N of these 46 people") in landing/index.html');
	if (+m[1] !== stranded) {
		fail(
			`the evidence-floor note says ${m[1]} of these 46 people are stranded at the documented floor, ` +
				`but the current graph implies ${stranded}. Update evidence.38 in landing/index.html and in ` +
				`landing/_strings.{fr,ar}.json, then rebuild.`
		);
	}
}

/* The ledger cells, the tier mix, the limits cards and the og:description all
   carry graph counts. They drifted once (the 08-14 outbox merges moved every
   one of them and nothing caught it), so they are checked here against the
   build's own metadata — the same numbers the /data page publishes. A stale
   number on the front page is a lie about the dataset on the page most people
   see, so this is a hard fail, not a warning. */
function checkLedger(html: string, d: any): void {
	const counts = d.meta?.counts ?? {};
	const review = d.meta?.review ?? {};
	const translation = d.meta?.translation?.fr ?? {};
	const expected: [RegExp, number, string][] = [
		[/(\d+)">0<\/div><div class="micro k" data-i18n="ledger\.1"/, counts.people, 'ledger People'],
		[/(\d+)">0<\/div><div class="micro k" data-i18n="ledger\.2"/, counts.positions, 'ledger Offices held'],
		[/(\d+)">0<\/div><div class="micro k" data-i18n="ledger\.3"/, counts.institutions, 'ledger Institutions'],
		[/(\d+)">0<\/div><div class="micro k" data-i18n="ledger\.4"/, counts.relationships, 'ledger Relationships'],
		[/(\d+)">0<\/div><div class="micro k" data-i18n="ledger\.5"/, counts.sources, 'ledger Sources'],
		[/(\d+)">0<\/div><div class="micro k" data-i18n="ledger\.6"/, counts.events, 'ledger Events'],
		[
			/og:description" content="(\d+) people\./,
			counts.people,
			'og:description people'
		],
		[
			/og:description" content="\d+ people\. (\d+) offices held\./,
			counts.positions,
			'og:description offices'
		],
		[
			/og:description" content="\d+ people\. \d+ offices held\. (\d+) documented relationships\./,
			counts.relationships,
			'og:description relationships'
		],
		[
			/og:description" content="\d+ people\. \d+ offices held\. \d+ documented relationships\. (\d+) sources\./,
			counts.sources,
			'og:description sources'
		],
		[/The current library is (\d+) sources/, counts.sources, 'library total'],
		[/The current library is \d+ sources — (\d+) at tier 1,/, counts.tier1 ?? tierCount(d, 1), 'tier 1'],
		[/at tier 1,\s*(\d+) at tier 2,/, tierCount(d, 2), 'tier 2'],
		[/at tier 2,\s*(\d+) at tier 3,/, tierCount(d, 3), 'tier 3'],
		[/at tier 3,\s*(\d+) at tier 4,/, tierCount(d, 4), 'tier 4'],
		[/at tier 4,\s*(\d+) at tier 5\./, tierCount(d, 5), 'tier 5'],
		[/(\d+) of the \d+ sources currently back/, counts.sources - counts.sourcesCited, 'uncited sources'],
		[/<span class="v">27 \/ (\d+)<\/span>/, review.reviewable, 'reviewed / reviewable'],
		[/<span class="v">(\d+)<\/span>\s*\n\s*<span class="d" data-i18n-html="limits\.8"/, (d.meta?.contradictions ?? []).length, 'contradictions'],
		[/<b>human-translated entries<\/b> of ([\d,]+) translatable strings/, translation.total, 'translatable strings'],
		[/translatable strings, (\d+) human-translated/, translation.tiers?.human ?? 0, 'human-translated count'],
		[/<span class="v">(\d+)<\/span>\s*\n\s*<span class="d" data-i18n-html="limits\.6"/, d.meta?.needsPrimarySourceCount, 'needs-primary-source'],
		[/Of the \d+ unsubstantiated claims, the (\d+) attributed/, review.byRisk?.attributed?.total, 'attributed claims'],
		[/the \d+ attributed\s*\n\s*ones and the (\d+) inferences/, d.meta?.basisCounts?.inferred, 'inferences']
	];
	let failed = false;
	for (const [re, want, label] of expected) {
		const m = html.match(re);
		if (!m) {
			fail(`could not locate the ${label} figure in landing/index.html — has the markup changed?`);
		}
		const have = Number(m![1].replace(/,/g, ''));
		if (have !== want) {
			fail(`landing ${label} says ${have} but the graph implies ${want} — update index.html and _strings.{fr,ar}.json, then rebuild`);
		}
	}
}

function tierCount(d: any, tier: number): number {
	return (d.sources ?? []).filter((s: any) => s.tier === tier).length;
}

const visuals = computeVisuals();
// Stable hash tied to the visuals themselves (derived from dataset.json), not the
// file's timestamp — otherwise every `npm run data` would invalidate the landing
// even when the graph is unchanged, which would make `npm run data && npm run test`
// spuriously fail. The arrays are the contract; the hash is the manifest tie.
const datasetHash = createHash('sha256').update(JSON.stringify(visuals)).digest('hex').slice(0, 16);
let fresh = withFreshVisuals(html, visuals);
fresh = withFreshHash(fresh, datasetHash);
if (fresh !== html) {
	/* the source stays the true snapshot — the same rule as the build's own
	   published statistics, which rewrite the docs that carry them */
	writeFileSync(SRC, fresh, 'utf8');
	html = fresh;
}
checkFloorNote(html, visuals);
checkDatasetHash(html, datasetHash);
{
	const d = JSON.parse(readFileSync(GRAPH, 'utf8'));
	checkLedger(html, d);
}

/* The FR/AR landing strings carry the same graph counts the English page
   does. They are not covered by checkLedger (which reads index.html only), so
   they drifted once with it. The translated prose spells numbers as words and
   digits differently per language, so this checks the five figures that must
   match across all three locales: the library total, the tier mix, the uncited
   count, and the attributed/inferred risk figures. */
function checkLocalizedLedger(d: any): void {
	const counts = d.meta?.counts ?? {};
	const fr = JSON.parse(readFileSync(join(ROOT, 'landing', '_strings.fr.json'), 'utf8')) as Record<string, string>;
	const ar = JSON.parse(readFileSync(join(ROOT, 'landing', '_strings.ar.json'), 'utf8')) as Record<string, string>;
	const bad = (loc: string, what: string, have: string, want: number) =>
		fail(`landing _strings.${loc} ${what} reads "${have}" but the graph implies ${want} — update _strings.${loc}.json, then rebuild`);
	const fr6 = fr['evidence.6'] ?? '';
	const fr8 = fr['evidence.8'] ?? '';
	const fr4 = fr['limits.4'] ?? '';
	const ar6 = ar['evidence.6'] ?? '';
	const ar8 = ar['evidence.8'] ?? '';
	const ar4 = ar['limits.4'] ?? '';
	// Library total + tier mix, e.g. "874 sources — 99 au niveau 1, 85 au niveau 2…"
	for (const [loc, s6] of [['fr', fr6], ['ar', ar6]] as const) {
		const total = s6.match(/(\d+) sources?|(\d+) مصدر/);
		if (total && Number(total[1] ?? total[2]) !== counts.sources) bad(loc, 'library total', total[0], counts.sources);
		for (const tier of [1, 2, 3, 4, 5] as const) {
			// FR: "110 au niveau 1"; AR: "و110 في المستوى 1" — the number PRECEDES the label.
			const re = new RegExp(`(\\d+)\\s*(?:au niveau ${tier}|في المستوى ${tier})`);
			const m = s6.match(re);
			if (m && Number(m[1]) !== tierCount(d, tier)) bad(loc, `tier ${tier}`, m[0], tierCount(d, tier));
		}
	}
	// Uncited: FR "38 des 874 sources"; AR "38 من المصادر الـ874"
	for (const [loc, s8] of [['fr', fr8], ['ar', ar8]] as const) {
		const m = s8.match(/(\d+) des \d+ sources|(\d+) من المصادر الـ\d+/);
		if (m && Number(m[1] ?? m[2]) !== counts.sources - counts.sourcesCited) {
			bad(loc, 'uncited count', m[0], counts.sources - counts.sourcesCited);
		}
	}
	// Risk figures: FR "des 84 affirmations attribuées… des 16 déductions";
	// AR "الأربعة والثمانين المنسوبة… الست عشرة المستنتَجة"
	for (const [loc, s4] of [['fr', fr4], ['ar', ar4]] as const) {
		const attr = s4.match(/(?:des )?(\d+) affirmations attribuées/);
		if (attr && Number(attr[1]) !== (d.meta?.review?.byRisk?.attributed?.total ?? 0)) {
			bad(loc, 'attributed claims', attr[0], d.meta?.review?.byRisk?.attributed?.total ?? 0);
		}
		const inf = s4.match(/(?:des )?(\d+) déductions/);
		if (inf && Number(inf[1]) !== (d.meta?.basisCounts?.inferred ?? 0)) {
			bad(loc, 'inferences', inf[0], d.meta?.basisCounts?.inferred ?? 0);
		}
	}
}
checkLocalizedLedger(JSON.parse(readFileSync(GRAPH, 'utf8')));

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
