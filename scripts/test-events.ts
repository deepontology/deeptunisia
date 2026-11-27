/**
 * Assertions over the events ledger, build/events.html.
 *
 * The ledger is a document, and everything it promises is checked here rather
 * than trusted:
 *
 *   - it is a page of its own, not an index under /e/, and the record count test
 *     still owns that space
 *   - it loads no module and preloads no script
 *   - every event appears exactly once: a visible row at or above the reported
 *     floor, a hidden row below it
 *   - every /e/ link lands on a record page that exists
 *   - the standing sentence and the contents counts equal counts computed from
 *     the dataset, and the contents lists every chapter with a computed count
 *   - a category is a word, never the slug
 *   - the page contains the eras newest first, as the register claims
 *   - it makes no cross-origin request
 *   - the sitemap lists it
 *
 * Reads the built site, so it runs after `npm run build`. A tree that was never
 * built is skipped; a build without the ledger is a failure.
 * Usage: `npx tsx scripts/test-events.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from '../src/lib/i18n.ts';
import { EVENT_CATEGORIES } from '../src/lib/taxonomy.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const PAGE = join(BUILD, 'events.html');
const E = join(BUILD, 'e');
const DATASET = join(ROOT, 'src', 'generated', 'dataset.json');
const SITEMAP = join(BUILD, 'sitemap.xml');

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
	eras: EraRow[];
	events: EventRow[];
}

const data = JSON.parse(readFileSync(DATASET, 'utf8')) as Dataset;
const html = readFileSync(PAGE, 'utf8');

/* ---------------------------------------------------------------------------
   A document, not a view
   --------------------------------------------------------------------------- */

ok('the ledger is not under build/e', !PAGE.startsWith(E + '/'), 'build/events.html');
ok('it preloads no script', !/rel="?modulepreload/.test(html) && !/<link[^>]*modulepreload/.test(html));
ok('it imports nothing', !/\bimport\s*\(/.test(html));
ok('it loads no module script', !/<script[^>]*type=["']?module/.test(html));
const script = html.indexOf('<script src=/events.js defer></script>');
ok('it loads one deferred plain script', script !== -1 && script > html.indexOf('</main>'), 'static/events.js after the document');
ok('it makes no cross-origin src or href', !/(?:src|href)="https?:\/\/(?!deeptunisia\.org)/.test(html));
ok('it has no language or theme switcher', !/data-set-lang|data-set-theme/.test(html));

/* ---------------------------------------------------------------------------
   Rows: every event once, at the floor or hidden below it
   --------------------------------------------------------------------------- */

const FLOOR = 'reported';
const RANK: Record<string, number> = { documented: 0, reported: 1, inferred: 2, unsubstantiated: 3 };
const atFloor = (row: EventRow) => (RANK[String(row.basis)] ?? 9) <= RANK[FLOOR];

const rows = new Map<string, { hidden: boolean; attrs: string }[]>();
for (const match of html.matchAll(/<li class="ev[^"]*"([^>]*)>/g)) {
	const attrs = match[1];
	const id = /data-event="([^"]+)"/.exec(attrs)?.[1];
	if (!id) continue;
	const hidden = /\shidden(?=[\s>]|$)/.test(attrs);
	const list = rows.get(id) ?? [];
	list.push({ hidden, attrs });
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
	const hidden = row.hidden;
	if (hidden) hiddenCount++;
	else visibleCount++;
	if (atFloor(event) === hidden) wrongVisibility.push(`${event.id}: ${hidden ? 'hidden' : 'visible'}`);
}
ok(`every event has a row (${data.events.length})`, missing.length === 0, missing.length ? sample(missing) : '');
ok('no event has two rows', doubled.length === 0, doubled.length ? sample(doubled) : '');
ok('a row is hidden exactly when the event is below the floor', wrongVisibility.length === 0, wrongVisibility.length ? sample(wrongVisibility) : '');
const expectedShown = data.events.filter(atFloor).length;
ok('the visible rows are the events at the floor', visibleCount === expectedShown, `${visibleCount} of ${expectedShown}`);
ok('the hidden rows are the events below the floor', hiddenCount === data.events.length - expectedShown, `${hiddenCount}`);

/* The filter reads these attributes; a row missing one would silently never match. */
const NEEDED = ['data-era', 'data-year', 'data-decade', 'data-cat', 'data-basis', 'data-grade', 'data-ver', 'data-rupture', 'data-contested', 'data-actors', 'data-institutions', 'data-q'];
const incomplete: string[] = [];
const notFolded: string[] = [];
for (const [id, list] of rows) {
	for (const { attrs } of list) {
		if (NEEDED.some((name) => !new RegExp(`\\s${name}="`).test(attrs))) incomplete.push(id);
		const q = /data-q="([^"]*)"/.exec(attrs)?.[1] ?? '';
		if (q !== q.toLowerCase()) notFolded.push(id);
	}
}
ok('every row carries the attributes the filters read', incomplete.length === 0, incomplete.length ? sample(incomplete) : '');
ok('every search string is pre-folded to lower case', notFolded.length === 0, notFolded.length ? sample(notFolded) : '');

/* ---------------------------------------------------------------------------
   Every /e/ link lands somewhere
   --------------------------------------------------------------------------- */

const recordIds = new Set(data.events.map((e) => e.id));
const dangling: string[] = [];
for (const match of html.matchAll(/href="\/e\/([^"?#]+)"/g)) {
	const id = decodeURIComponent(match[1]);
	if (!recordIds.has(id)) dangling.push(id);
	if (!existsSync(join(E, `${id}.html`))) dangling.push(`${id} (no page)`);
}
ok('every event link points at an event record page', dangling.length === 0, dangling.length ? sample([...new Set(dangling)]) : '');

/* ---------------------------------------------------------------------------
   Counts: computed from the dataset, never typed
   --------------------------------------------------------------------------- */

const eras = data.eras;
const firstStart = Number(eras[0].interval.startEarliest);
const lastEnd = Number(eras[eras.length - 1].interval.endEarliest);

function chapterOf(event: EventRow): string {
	const t = Number(event.interval?.startEarliest ?? 0);
	if (t < firstStart) return 'before';
	if (t > lastEnd) return 'after';
	for (let i = eras.length - 1; i >= 0; i--) {
		const span = eras[i].interval;
		if (t >= Number(span.startEarliest) && t <= Number(span.endEarliest)) return eras[i].id;
	}
	return 'unfiled';
}

const expectedCounts = new Map<string, number>([['after', 0], ['before', 0]]);
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
const countNodes = [...html.matchAll(/<span class=count data-count="([^"]+)">([\s\S]*?)<\/span>/g)];
const countByKey = new Map<string, number>();
for (const [, key, block] of countNodes) {
	const text = english(block);
	const n = text === translate('en', 'events.countOne') ? 1 : Number(/(\d+)/.exec(text)?.[1] ?? NaN);
	countByKey.set(key, n);
	if (n !== expectedCounts.get(key)) countProblems.push(`${key}: ${n} vs ${expectedCounts.get(key)}`);
}
for (const key of expectedCounts.keys()) if (!countByKey.has(key)) countProblems.push(`${key}: no count`);
ok('every chapter count is the computed count at the floor', countProblems.length === 0, countProblems.length ? sample(countProblems) : `${countByKey.size} chapters`);

/* The contents lists the chapters newest first, with an anchor each. */
const tocKeys = [...html.matchAll(/data-toc="([^"]+)"/g)].map((m) => m[1]);
const expectedOrder = ['after', ...[...eras].reverse().map((e) => e.id), 'before'];
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
ok('the page states the default floor', html.includes('data-floor="reported"'));

/* ---------------------------------------------------------------------------
   A category is a word
   --------------------------------------------------------------------------- */

const slugProblems: string[] = [];
for (const event of data.events) {
	if (event.rupture) continue;
	const word = translate('en', `eventCat.${event.category}`);
	const start = html.indexOf(`data-event="${event.id}"`);
	if (start === -1) continue;
	const row = html.slice(start, start + 2400);
	if (!row.includes(`<span class=ev-cat><b data-l=en>${word}</b>`)) slugProblems.push(`${event.id}: ${String(event.category)}`);
}
ok('every row names its category in words', slugProblems.length === 0, slugProblems.length ? sample(slugProblems) : '');

const optionProblems: string[] = [];
for (const slug of EVENT_CATEGORIES) {
	const option = new RegExp(`<option value="${slug}"[^>]*data-word="cat:${slug}"[^>]*>([^<]*)</option>`).exec(html);
	const word = translate('en', `eventCat.${slug}`);
	if (!option || !option[1].startsWith(word) || option[1].startsWith(slug)) optionProblems.push(slug);
}
ok('the category filter options are words, not slugs', optionProblems.length === 0, optionProblems.length ? optionProblems.join(', ') : '');

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

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
