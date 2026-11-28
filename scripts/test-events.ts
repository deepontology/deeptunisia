/**
 * Assertions over the events ledger, build/events.html.
 *
 * The ledger is a document, and everything it promises is checked here rather
 * than trusted:
 *
 *   - it is a page of its own, not an index under /e/, and the record count test
 *     still owns that space
 *   - it loads no module and preloads no script
 *   - it stays under the weight ceiling, and says what a row costs
 *   - every event appears exactly once: a visible row at or above the reported
 *     floor, a hidden row below it
 *   - a row carries one date and one category word, not a second copy hidden for
 *     another breakpoint, and no per-row SVG
 *   - every /e/ link lands on a record page that exists
 *   - the standing sentence and the contents counts equal counts computed from
 *     the dataset, and the contents lists every chapter with a computed count
 *   - the basis strokes are the model's DASH and BASIS_OPACITY, not a redrawn set
 *   - a category is a word, never the slug
 *   - the page contains the eras newest first, as the register claims
 *   - it makes no cross-origin request
 *   - the sitemap lists it
 *
 * Reads the built site, so it runs after `npm run build`. A tree that was never
 * built is skipped; a build without the ledger is a failure.
 * Usage: `npx tsx scripts/test-events.ts`
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentWord as translate, documentWords, translate as appTranslate } from '../src/lib/i18n.ts';
import { EVENT_CATEGORIES } from '../src/lib/taxonomy.ts';
import { BASIS_COLOR, BASIS_OPACITY, BASIS_ORDER, DASH } from '../src/lib/model.ts';

await import('../static/events-rings.js');

interface RingGeometry {
	geometry(
		years: number[],
		counts: number[],
		focus: number,
		growDay: number | null,
		rho: number
	): { inner: number[]; outer: number[]; coreEnd: number | null; rc: number; bark: number };
	layout(
		events: { i: number; day: number }[],
		years: number[],
		ring: { inner: number[]; outer: number[]; coreEnd: number | null; rc: number; bark: number },
		rho: number,
		dir: number
	): ({ r: number; a: number; y: number; cored: boolean } | undefined)[];
	angle(frac: number, dir: number): number;
	point(r: number, a: number): [number, number];
	f1(value: number): number;
	yearOfDay(day: number): number;
	startOfYear(year: number): number;
	fracOfDay(day: number): number;
}
const GEO = (globalThis as unknown as { EventsRingsGeometry?: RingGeometry }).EventsRingsGeometry;
if (!GEO) {
	console.error('  FAIL  static/events-rings.js did not expose its geometry');
	process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const PAGE = join(BUILD, 'events.html');
const E = join(BUILD, 'e');
const DATASET = join(ROOT, 'src', 'generated', 'dataset.json');
const SITEMAP = join(BUILD, 'sitemap.xml');

/** The ledger's weight bar: 40 KB of frame plus 1.6 KB for every event. */
const CEILING_BASE = 40 * 1024;
const CEILING_PER_EVENT = 1.6 * 1024;

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	}
}

const sample = (list: string[]) => list.slice(0, 3).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');

console.log('\n  -- events ledger --\n');

if (!existsSync(BUILD)) {
	console.log('  note  build/ is missing: run `npm run build` to generate the ledger\n');
	process.exit(0);
}
ok('build/events.html exists', existsSync(PAGE));

if (!existsSync(PAGE)) {
	console.log(`\n  ${checks - failures}/${checks} checks passed, ${failures} FAILED\n`);
	process.exit(1);
}

interface Span {
	startEarliest?: number;
	startLatest?: number;
	endEarliest?: number;
	endLatest?: number;
	startPrecision?: string;
	endPrecision?: string;
	status?: string;
	raw?: { start?: string | null; end?: string | null };
}
interface EventRow {
	id: string;
	basis?: string;
	category?: string;
	rupture?: boolean;
	confidence?: string;
	verification?: string;
	contested?: { framing?: string }[];
	interval?: Span;
}
interface EraRow {
	id: string;
	label_en: string;
	label_fr?: string;
	label_ar?: string;
	interval: Span;
}
interface Dataset {
	meta?: { cutoff?: number };
	eras: EraRow[];
	events: EventRow[];
}

const data = JSON.parse(readFileSync(DATASET, 'utf8')) as Dataset;
const html = readFileSync(PAGE, 'utf8');
const bytes = Buffer.byteLength(html);

/* ---------------------------------------------------------------------------
   A document, not a view
   --------------------------------------------------------------------------- */

ok('the ledger is not under build/e', !PAGE.startsWith(E + '/'), 'build/events.html');
ok('it preloads no script', !/<link[^>]*modulepreload/.test(html));
ok('it imports nothing', !/\bimport\s*\(/.test(html));
ok('it loads no module script', !/<script[^>]*type=["']?module/.test(html));
const script = html.indexOf('<script src=/events.js defer></script>');
ok('it loads one deferred plain script', script !== -1 && script > html.indexOf('</main>'), 'static/events.js after the document');
ok('it makes no cross-origin src or href', !/(?:src|href)="https?:\/\/(?!deeptunisia\.org)/.test(html));
ok('it has no language or theme switcher', !/data-set-lang|data-set-theme/.test(html));

/* ---------------------------------------------------------------------------
   Weight: the bar this page is held to
   --------------------------------------------------------------------------- */

const ceiling = CEILING_BASE + CEILING_PER_EVENT * data.events.length;
const perEvent = bytes / data.events.length;
const gzip = gzipSync(Buffer.from(html)).length;
console.log(
	`  size  ${(bytes / 1024).toFixed(1)} KB raw · ${(gzip / 1024).toFixed(1)} KB gzip · ${perEvent.toFixed(0)} bytes per event · ceiling ${(ceiling / 1024).toFixed(0)} KB\n`
);
ok(
	`the page is at most 40 KB + 1.6 KB per event (${(ceiling / 1024).toFixed(0)} KB)`,
	bytes <= ceiling,
	`${(bytes / 1024).toFixed(1)} KB raw, ${perEvent.toFixed(0)} bytes per event`
);
const ledgerBody = html.slice(html.indexOf('<div id=ledger'), html.indexOf('<footer'));
ok('no ledger row carries inline SVG', !/<svg/i.test(ledgerBody), 'the strokes are CSS from the model constants');
ok('the page loads the rings script', html.includes('<script src=/events-rings.js defer></script>'));

/* ---------------------------------------------------------------------------
   Rows: every event once, at the floor or hidden below it
   --------------------------------------------------------------------------- */

const FLOOR = 'reported';
const RANK: Record<string, number> = { documented: 0, reported: 1, inferred: 2, unsubstantiated: 3 };
const atFloor = (row: EventRow) => (RANK[String(row.basis)] ?? 9) <= RANK[FLOOR];

const rows = new Map<string, { hidden: boolean; attrs: string; markup: string }[]>();
for (const match of html.matchAll(/<li class="ev[^"]*"([^>]*)>/g)) {
	const attrs = match[1];
	const identified = /data-event=(?:"([^"]+)"|([^\s>]+))/.exec(attrs);
	const id = identified?.[1] ?? identified?.[2];
	if (!id) continue;
	const start = match.index ?? 0;
	const end = html.indexOf('</li>', start);
	const hidden = /\shidden(?=[\s>]|$)/.test(attrs);
	const list = rows.get(id) ?? [];
	list.push({ hidden, attrs, markup: html.slice(start, end + 5) });
	rows.set(id, list);
}

const missing: string[] = [];
const doubled: string[] = [];
const wrongVisibility: string[] = [];
let hiddenCount = 0;
let visibleCount = 0;
for (const event of data.events) {
	const found = rows.get(event.id) ?? [];
	if (!found.length) missing.push(event.id);
	if (found.length > 1) doubled.push(`${event.id} (${found.length})`);
	const row = found[0];
	if (!row) continue;
	if (row.hidden) hiddenCount++;
	else visibleCount++;
	if (atFloor(event) === row.hidden) wrongVisibility.push(`${event.id}: ${row.hidden ? 'hidden' : 'visible'}`);
}
ok(`every event has a row (${data.events.length})`, missing.length === 0, missing.length ? sample(missing) : '');
ok('no event has two rows', doubled.length === 0, doubled.length ? sample(doubled) : '');
ok('a row is hidden exactly when the event is below the floor', wrongVisibility.length === 0, wrongVisibility.length ? sample(wrongVisibility) : '');
const expectedShown = data.events.filter(atFloor).length;
ok('the visible rows are the events at the floor', visibleCount === expectedShown, `${visibleCount} of ${expectedShown}`);
ok('the hidden rows are the events below the floor', hiddenCount === data.events.length - expectedShown, `${hiddenCount}`);

/* The filter reads these; a row missing one would silently never match. */
const NEEDED = ['data-event', 'data-year', 'data-entities'];
const GONE = ['data-era', 'data-decade', 'data-rupture', 'data-q', 'data-cat', 'data-basis', 'data-grade', 'data-ver', 'data-contested'];
const incomplete: string[] = [];
const leftovers: string[] = [];
for (const [id, list] of rows) {
	for (const { attrs, markup } of list) {
		if (NEEDED.some((name) => !new RegExp(`\\s${name}=(?:"|\\S)`).test(attrs))) incomplete.push(id);
		if (!/\shidden(?=[\s>]|$)/.test(attrs) && !/\sdata-t=(?:"|\S)/.test(attrs)) incomplete.push(`${id}: data-t`);
		const open = markup.slice(0, markup.indexOf('>') + 1);
		if (!/\sb-(?:documented|reported|inferred|unsubstantiated)(?=[\s"])/.test(open)) incomplete.push(`${id}: basis`);
		if (!/\sg[A-D](?=[\s"])/.test(open)) incomplete.push(`${id}: grade`);
		if (!/\sc-[a-z-]+(?=[\s"])/.test(open)) incomplete.push(`${id}: category`);
		if (GONE.some((name) => new RegExp(`\\s${name}=`).test(attrs))) leftovers.push(id);
	}
}
ok('every row carries the attributes the filters read', incomplete.length === 0, incomplete.length ? sample(incomplete) : '');
ok('no row carries an attribute nothing reads', leftovers.length === 0, leftovers.length ? sample(leftovers) : GONE.join(', '));

/* One date and one category per row, placed by the stylesheet, not duplicated. */
const duplicated: string[] = [];
for (const [id, list] of rows) {
	for (const { markup } of list) {
		const dates = (markup.match(/class=ev-date/g) ?? []).length;
		const phones = (markup.match(/class=ev-phone|class=ev-date-col/g) ?? []).length;
		if (dates > 1 || phones > 0) duplicated.push(`${id}: ${dates} dates`);
	}
}
ok('each row carries one date and no hidden second copy', duplicated.length === 0, duplicated.length ? sample(duplicated) : '');

/* ---------------------------------------------------------------------------
   Every /e/ link lands somewhere
   --------------------------------------------------------------------------- */

const recordIds = new Set(data.events.map((e) => e.id));
const ASSET = /\.(css|js|json|png|svg|ico)$/;
const dangling: string[] = [];
for (const match of html.matchAll(/href="?\/e\/([^"?#\s>]+)/g)) {
	const id = decodeURIComponent(match[1]);
	if (ASSET.test(id)) continue; /* tokens.css, record.css */
	if (!recordIds.has(id)) dangling.push(id);
	if (!existsSync(join(E, `${id}.html`))) dangling.push(`${id} (no page)`);
}
ok('every event link points at an event record page', dangling.length === 0, dangling.length ? sample([...new Set(dangling)]) : '');

/* ---------------------------------------------------------------------------
   The basis strokes are the model's, not a redrawn set
   --------------------------------------------------------------------------- */

const strokeCss = /<style id="?basis-strokes"?>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
const strokeProblems: string[] = [];
for (const basis of BASIS_ORDER) {
	const dash = String(DASH[basis] ?? '').trim();
	if (!strokeCss.includes(`opacity:${BASIS_OPACITY[basis]}`)) strokeProblems.push(`${basis}: opacity`);
	if (!strokeCss.includes(`--basis:${BASIS_COLOR[basis]}`)) strokeProblems.push(`${basis}: colour`);
	if (!dash) {
		if (!strokeCss.includes(`background-color:${BASIS_COLOR[basis]}`)) strokeProblems.push(`${basis}: solid line`);
		continue;
	}
	const lengths = dash.split(/\s+/).map(Number);
	let at = 0;
	const stops = lengths.map((length, index) => {
		const stop = `${index % 2 === 0 ? 'var(--basis)' : 'transparent'} ${at}px ${at + length}px`;
		at += length;
		return stop;
	});
	if (!strokeCss.includes(stops.join(', '))) strokeProblems.push(`${basis}: dashes ${dash}`);
}
ok('the generated strokes are DASH and BASIS_OPACITY', strokeCss.length > 0 && strokeProblems.length === 0, strokeProblems.length ? sample(strokeProblems) : `${BASIS_ORDER.length} bases`);

/* ---------------------------------------------------------------------------
   Counts: computed from the dataset, never typed
   --------------------------------------------------------------------------- */

const eras = data.eras;
const firstStart = Number(eras[0].interval.startEarliest);
/* An era ends at its latest possible end, as on every other view; an open era
   (`end: ongoing`) runs to the cutoff. */
const eraEnd = (span: Span) => Number(span.endLatest ?? data.meta?.cutoff);
const lastEnd = eraEnd(eras[eras.length - 1].interval);

function chapterOf(event: EventRow): string {
	const t = Number(event.interval?.startEarliest ?? 0);
	if (t < firstStart) return 'before';
	if (t > lastEnd) return 'after';
	for (let i = eras.length - 1; i >= 0; i--) {
		const span = eras[i].interval;
		if (t >= Number(span.startEarliest) && t <= eraEnd(span)) return eras[i].id;
	}
	return 'unfiled';
}

/* A bookend chapter (before the first era, after the last) is printed only when
   it holds an event; every era chapter is always printed. */
const bookends = ['after', 'before'].filter((key) => data.events.some((event) => chapterOf(event) === key));
const expectedCounts = new Map<string, number>(bookends.map((key) => [key, 0]));
for (const era of eras) expectedCounts.set(era.id, 0);
for (const event of data.events) {
	if (!atFloor(event)) continue;
	const key = chapterOf(event);
	expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
}

const strip = (text: string) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const english = (block: string) => {
	const match = /<b data-l=en>([\s\S]*?)<\/b>/.exec(block);
	return strip(match ? match[1] : block);
};

const countProblems: string[] = [];
const countNodes = [...html.matchAll(/<span class=count data-count=(?:"([^"]+)"|([^\s>]+))>([\s\S]*?)<\/span>/g)];
const countByKey = new Map<string, number>();
for (const match of countNodes) {
	const key = match[1] ?? match[2];
	const text = english(match[3]);
	const n = text === translate('en', 'events.countOne') ? 1 : Number(/(\d+)/.exec(text)?.[1] ?? NaN);
	countByKey.set(key, n);
	if (n !== expectedCounts.get(key)) countProblems.push(`${key}: ${n} vs ${expectedCounts.get(key)}`);
}
for (const key of expectedCounts.keys()) if (!countByKey.has(key)) countProblems.push(`${key}: no count`);
ok('every chapter count is the computed count at the floor', countProblems.length === 0, countProblems.length ? sample(countProblems) : `${countByKey.size} chapters`);

/* The contents lists the chapters newest first, with an anchor each. */
const tocKeys = [...html.matchAll(/data-toc=(?:"([^"]+)"|([^\s>]+))/g)].map((m) => m[1] ?? m[2]);
const expectedOrder = [
	...bookends.filter((key) => key === 'after'),
	...[...eras].reverse().map((e) => e.id),
	...bookends.filter((key) => key === 'before')
];
ok('the contents lists every chapter newest first', tocKeys.join(',') === expectedOrder.join(','), tocKeys.join(','));
ok('every contents line is an anchor', [...html.matchAll(/<a class=toc-link href="#[^"]+"/g)].length === expectedOrder.length);
ok('every contents anchor is unique', new Set([...html.matchAll(/<a class=toc-link href="#([^"]+)"/g)].map((m) => m[1])).size === expectedOrder.length);

/* The standing sentence states the numbers the dataset holds. */
const standing = /<p class=sl id=standing-total>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
const standingText = english(standing);
const shownTotal = data.events.filter(atFloor).length;
const ruptureTotal = data.events.filter((e) => e.rupture).length;
const years = data.events.map((e) => new Date(Number(e.interval?.startEarliest ?? 0)).getUTCFullYear());
const fromYear = Math.min(...years);
const toYear = Math.max(...years);
const wanted = [data.events.length, eras.length, fromYear, toYear, ruptureTotal];
const absent = wanted.filter((n) => !standingText.includes(String(n)));
ok('the standing sentence states the totals from the dataset', absent.length === 0, absent.length ? `missing ${absent.join(', ')}` : standingText);

const floorLine = /<p class=sl id=standing-floor>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
const floorText = english(floorLine);
const belowTotal = data.events.length - shownTotal;
ok('the floor sentence states the shown and hidden counts', floorText.includes(String(shownTotal)) && floorText.includes(String(belowTotal)), floorText);
ok('the page states the default floor', html.includes('data-floor=reported'));

/* ---------------------------------------------------------------------------
   A category is a word
   --------------------------------------------------------------------------- */

const slugProblems: string[] = [];
for (const event of data.events) {
	if (event.rupture) continue;
	const word = translate('en', `eventCat.${event.category}`);
	const start = html.indexOf(`data-event=${event.id}`);
	if (start === -1) continue;
	const row = html.slice(start, start + 1600);
	const meta = /<p class=ev-meta>([\s\S]*?)<\/p>/.exec(row)?.[1] ?? '';
	if (!meta.includes(`<b data-l=en>${word}</b>`)) slugProblems.push(`${event.id}: ${String(event.category)}`);
}
ok('every row names its category in words', slugProblems.length === 0, slugProblems.length ? sample(slugProblems) : '');

const optionProblems: string[] = [];
for (const slug of EVENT_CATEGORIES) {
	const option = new RegExp(`<option value="${slug}"[^>]*>([^<]*)</option>`).exec(html);
	const word = translate('en', `eventCat.${slug}`);
	if (!option || !option[1].startsWith(word) || option[1].startsWith(slug)) optionProblems.push(slug);
}
ok('the category filter options are words, not slugs', optionProblems.length === 0, optionProblems.length ? optionProblems.join(', ') : '');

/* ---------------------------------------------------------------------------
   The growth-rings figure: one first frame from the shared geometry
   --------------------------------------------------------------------------- */

const figure = /<figure class=rings-fig[\s\S]*?<\/figure>/.exec(html)?.[0] ?? '';
ok('the growth-rings figure is on the page', figure.includes('id=rings') && figure.includes('class=rings-plate'));
ok('the figure renders no lens control without script', !/<button\b|<input\b/.test(figure), 'the presets and the slider are built by the script');
ok('the figure names the ledger as its table', /<figcaption[^>]*id=rings-cap[\s\S]*href=#contents/.test(figure));

const ringScript = readFileSync(join(BUILD, 'events-rings.js'), 'utf8');
ok('the rings script is plain, with no import or export', !/\bimport\s*[\(\{]/.test(ringScript) && !/\bexport\s/.test(ringScript) && !ringScript.includes('modulepreload'));
ok('the rings script is within 32 KB', Buffer.byteLength(ringScript) <= 32 * 1024, `${(Buffer.byteLength(ringScript) / 1024).toFixed(1)} KB`);

const RING_DAY = 86_400_000;
const ringCutoff = Math.floor(Number((data.meta as { cutoff?: number } | undefined)?.cutoff ?? 0) / RING_DAY);
function ringYear(ms: number): number {
	return new Date(ms).getUTCFullYear();
}
const ringEvents = data.events.map((event, i) => {
	const span = event.interval as Span;
	const lo = Number(span.startEarliest ?? 0);
	const hi = Number(span.startLatest ?? lo);
	const mid = Math.round((lo + hi) / 2);
	return { i, id: event.id, day: Math.floor(mid / RING_DAY), year: ringYear(mid), basis: String(event.basis), atFloor: atFloor(event) };
});
const ringFirst = Math.min(...ringEvents.map((e) => e.year));
const ringLast = Math.max(...ringEvents.map((e) => e.year));
const ringYears = Array.from({ length: ringLast - ringFirst + 1 }, (_, i) => ringFirst + i);
const ringCounts = ringYears.map((y) => ringEvents.filter((e) => e.year === y).length);
const lastEraStart = ringYear(Number(eras[eras.length - 1].interval.startEarliest));
const ring = GEO.geometry(ringYears, ringCounts, lastEraStart, null, 4);
const ringPositions = GEO.layout(ringEvents, ringYears, ring, 4, 1);
const atFloorEvents = ringEvents.filter((e) => e.atFloor);
const placed = atFloorEvents.filter((e) => ringPositions[e.i] && Number.isFinite(ringPositions[e.i]!.r) && Number.isFinite(ringPositions[e.i]!.a));
ok(
	'every event at the floor has exactly one mark position',
	placed.length === atFloorEvents.length,
	`${placed.length} of ${atFloorEvents.length}`
);

const lineGroup = /<g id=rings-lines>([\s\S]*?)<\/g>/.exec(figure)?.[1] ?? '';
const builtRadii = [...lineGroup.matchAll(/<circle[^>]* r=([\d.]+)/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
const wantedRadii = ringYears
	.slice(1)
	.map((_, index) => index + 1)
	.filter((i) => ring.inner[i] > ring.rc + 0.5 && ring.inner[i] < ring.bark - 0.1)
	.map((i) => GEO.f1(ring.inner[i]))
	.sort((a, b) => a - b);
ok('the first frame draws the rings the shared geometry computes', JSON.stringify(builtRadii) === JSON.stringify(wantedRadii), `${builtRadii.length} rings`);

const markStart = figure.indexOf('<g id=rings-marks>');
const markEnd = figure.indexOf('<g id=rings-years>', markStart);
const markGroup = figure.slice(markStart, markEnd);
const markProblems: string[] = [];
const markIds = new Set<string>();
for (const match of markGroup.matchAll(/<a( class=rc)? href=\/e\/([^ >]+)[^>]*><circle cx=([\d.]+) cy=([\d.]+)/g)) {
	const id = decodeURIComponent(match[2]);
	const event = ringEvents.find((e) => e.id === id);
	const position = event ? ringPositions[event.i] : null;
	if (!event || !position) {
		markProblems.push(`${id}: no position`);
		continue;
	}
	if (markIds.has(id)) markProblems.push(`${id}: two marks`);
	markIds.add(id);
	const at = GEO.point(position.r, position.a);
	if (Math.abs(Number(match[3]) - GEO.f1(at[0])) > 0.15 || Math.abs(Number(match[4]) - GEO.f1(at[1])) > 0.15) {
		markProblems.push(`${id}: off the geometry`);
	}
	if (!recordIds.has(id) || !existsSync(join(E, `${id}.html`))) markProblems.push(`${id}: no record page`);
}
const missingMarks = atFloorEvents.filter((e) => !markIds.has(e.id)).map((e) => e.id);
ok(
	'every event at the floor has a mark in the built SVG',
	markIds.size === atFloorEvents.length && missingMarks.length === 0,
	`${markIds.size} of ${atFloorEvents.length}`
);
ok('the first frame marks sit on the shared geometry and link to records', markProblems.length === 0, markProblems.length ? sample(markProblems) : `${markIds.size} marks`);
ok(
	'no built mark is hidden by a class only the script adds',
	!/(?:rings-below|rings-cored|rings-future|rings-dim|rings-faded)/.test(markGroup)
);

const coreRadius = /<circle class=rings-core-disc[^>]* r=([\d.]+)/.exec(figure)?.[1];
ok(
	'the core disc is the shared core radius',
	ring.coreEnd === null ? coreRadius === undefined : coreRadius !== undefined && Math.abs(Number(coreRadius) - GEO.f1(ring.rc)) <= 0.15,
	ring.coreEnd === null ? 'no core at this lens' : `core to ${ring.coreEnd}`
);

const css = readFileSync(join(ROOT, 'static', 'events.css'), 'utf8');
const figureCss = css.slice(css.indexOf('Growth rings: the figure'), css.indexOf('Focus and the last word'));
const colourLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|lab|lch)\(/i.test(figureCss);
const pxLiteral = /\d+px\b/.test(figureCss);
const sideLiteral = /\b(?:left|right)\s*:/.test(figureCss) || /\btext-align\s*:\s*(?:left|right)/.test(figureCss);
ok('the figure styles use tokens only', !colourLiteral && !pxLiteral && !sideLiteral, colourLiteral ? 'colour literal' : pxLiteral ? 'px' : sideLiteral ? 'left or right' : 'tokens');

/* ---------------------------------------------------------------------------
   The eras in order, and the sitemap
   --------------------------------------------------------------------------- */

const positions = [...eras]
	.reverse()
	.map((era) => ({ name: era.label_en, at: html.indexOf(`<b data-l=en>${era.label_en}</b>`) }));
const ordered = positions.every((p, i) => p.at >= 0 && (i === 0 || p.at > positions[i - 1].at));
ok('the page names the eras newest first', ordered, positions.map((p) => p.name).join(' > '));

if (existsSync(SITEMAP)) {
	const sitemap = readFileSync(SITEMAP, 'utf8');
	ok('the sitemap lists /events', /<loc>https:\/\/deeptunisia\.org\/events<\/loc>/.test(sitemap));
} else {
	ok('the sitemap lists /events', false, 'build/sitemap.xml is missing');
}

/* ---------------------------------------------------------------------------
   The document words: held to the dictionary's rules, and out of the app chunk
   --------------------------------------------------------------------------- */

{
	const english = Object.keys(documentWords.en);
	const placeholdersIn = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
	const parity: string[] = [];
	for (const locale of ['fr', 'ar'] as const) {
		const keys = Object.keys(documentWords[locale]);
		for (const key of english) if (!(key in documentWords[locale])) parity.push(`${locale} lacks ${key}`);
		for (const key of keys) if (!(key in documentWords.en)) parity.push(`${locale} adds ${key}`);
	}
	ok('every document word exists in all three languages', parity.length === 0, parity.length ? sample(parity) : `${english.length} words`);

	const shape: string[] = [];
	for (const locale of ['en', 'fr', 'ar'] as const) {
		for (const [key, value] of Object.entries(documentWords[locale])) {
			if (!value.trim()) shape.push(`${locale} ${key} is empty`);
			if (value.includes('—')) shape.push(`${locale} ${key} has an em dash`);
			if (locale !== 'en' && key in documentWords.en && placeholdersIn(value) !== placeholdersIn(documentWords.en[key])) {
				shape.push(`${locale} ${key} placeholders {${placeholdersIn(value)}} vs {${placeholdersIn(documentWords.en[key])}}`);
			}
		}
	}
	ok('every document word is filled, keeps the English placeholders and has no em dash', shape.length === 0, shape.length ? sample(shape) : 'clean');

	/* A key in both places would let two copies drift; the table wins in the build. */
	const shadowed = english.filter((key) => appTranslate('en', key) !== key);
	ok('no document word is also an app dictionary key', shadowed.length === 0, sample(shadowed));

	const chunkDir = join(BUILD, '_app', 'immutable');
	const chunkFiles: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name.endsWith('.js')) chunkFiles.push(path);
		}
	};
	if (existsSync(chunkDir)) walk(chunkDir);
	const leaked = new Set<string>();
	for (const path of chunkFiles) {
		const js = readFileSync(path, 'utf8');
		for (const key of english) if (js.includes(`"${key}"`) || js.includes(`'${key}'`)) leaked.add(key);
	}
	ok('the app chunks carry no document word', chunkFiles.length > 0 && leaked.size === 0, chunkFiles.length ? (leaked.size ? sample([...leaked]) : `${chunkFiles.length} chunks`) : 'no app chunks built');
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
