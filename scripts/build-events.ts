/**
 * /events: the events ledger.
 *
 * One static document, written the way the record pages are written: after the
 * data build and after vite has copied static/, from src/generated/dataset.json
 * alone. It is not a view. There is no app shell, no graph, no hydration, and the
 * page reads completely with script off.
 *
 * The dataset already holds the shape of the page: seven eras, each with a name
 * in three languages, a start and an end, a one-line formula and a sourced thesis,
 * and fifteen ruptures that hinge them. The ledger is that shape set as a
 * chronological register in numbered chapters, newest first: contents, chapter
 * heads, rupture rules, two-line docket rows, quiet year ticks, silence lines.
 *
 * WEIGHT IS A DESIGN CONSTRAINT
 *
 * 257 events in three languages is a lot of markup, so the page is written
 * lean: one date per row placed by the stylesheet, one category word, attributes
 * only where the filter reads them, no per-row SVG (the basis strokes are four
 * generated CSS rules), no precomputed search text (events.js reads the row it
 * already has, on the first search), and a single fallback marker instead of the
 * untranslated sentence in every row. scripts/test-events.ts holds the ceiling.
 *
 * WHAT THIS REFUSES TO DO
 *
 *   - write under build/e/ (that space belongs to one page per record)
 *   - show a raw slug, id or hand-typed count
 *   - file an event in an era whose span does not contain its start, or invent a
 *     home for an event outside every era
 *   - print three titles per row: the title is printed in three languages once
 *     and the stylesheet shows one
 *   - load a module or ask for a cross-origin resource
 *
 * The dataset is read, never written. Nothing here moves meta.datasetHash.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES_DIR, SITE_URL } from './records/config.ts';
import { esc, loc, one, tri, triEach, triRaw } from './records/labels.ts';
import { basisLine, headShell, nameOf, yearOf, type Rec, type World } from './records/page.ts';
import { BASIS_COLOR, BASIS_OPACITY, BASIS_ORDER, DASH, describeInterval, type Basis } from '../src/lib/model.ts';
import { EVENT_CATEGORIES } from '../src/lib/taxonomy.ts';
import { format, type Locale } from '../src/lib/i18n.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const DATA = join(ROOT, 'src', 'generated', 'dataset.json');
const OUT = join(BUILD, 'events.html');

function fail(message: string): never {
	console.error(`\n  build-events: ${message}\n`);
	process.exit(1);
}

if (!existsSync(BUILD)) fail('build/ does not exist. Run `npm run build` (vite build comes before this step)');
if (!existsSync(DATA)) fail('src/generated/dataset.json is missing. Run `npm run data` first');
if (!existsSync(join(BUILD, 'events.css'))) fail('build/events.css is missing. static/events.css has not been copied');
if (!existsSync(join(BUILD, 'events.js'))) fail('build/events.js is missing. static/events.js has not been copied');
if (!existsSync(join(BUILD, PAGES_DIR, 'tokens.css'))) fail('build/e/tokens.css is missing. Run build-records before this step');

/* ---------------------------------------------------------------------------
   The dataset, read once
   --------------------------------------------------------------------------- */

interface EraRow extends Rec {
	label_en: string;
	label_fr?: string;
	label_ar?: string;
	thesis: string;
	thesis_fr?: string;
	thesis_ar?: string;
	formula: string;
	accent: string;
	sources?: string[];
	interval: Span;
}

/** The interval fields this file reads. `Interval` in page.ts holds the dates only. */
interface Span {
	startEarliest?: number;
	endEarliest?: number;
	startPrecision?: string;
	endPrecision?: string;
	status?: string;
	raw?: { start?: string | null; end?: string | null };
}

interface Dataset {
	meta: { datasetHash: string };
	eras: EraRow[];
	people: Rec[];
	institutions: Rec[];
	events: Rec[];
	sources: Rec[];
	places: Rec[];
	regions?: Rec[];
}

const data = JSON.parse(readFileSync(DATA, 'utf8')) as Dataset;
if (!data.eras?.length) fail('dataset.json has no eras, so there is no chapter to open the ledger with');

const world: World = {
	people: new Map(data.people.map((r) => [r.id, r])),
	institutions: new Map(data.institutions.map((r) => [r.id, r])),
	events: new Map(data.events.map((r) => [r.id, r])),
	places: new Map([...data.places, ...(data.regions ?? [])].map((r) => [r.id, r])),
	sources: new Map(data.sources.map((r) => [r.id, r])),
	positionsByHolder: new Map(),
	positionsByInstitution: new Map(),
	relByEndpoint: new Map(),
	eventsByActor: new Map(),
	eventsByInstitution: new Map(),
	hash: data.meta.datasetHash,
	generated: ''
};

const LOCALES: Locale[] = ['en', 'fr', 'ar'];
const RANK: Record<string, number> = { documented: 0, reported: 1, inferred: 2, unsubstantiated: 3 };
const FLOOR = 'reported';
const DEFAULT_FLOOR_RANK = RANK[FLOOR];

type Tri = { en: string; fr: string; ar: string };

interface Chapter {
	/** The anchor id and the key the filters, the contents and the counts share. */
	key: string;
	era: EraRow | null;
	events: Rec[];
	/** The year the chapter's silence lines stop at, when the era still runs. */
	tailEnd: number;
}

/* ---------------------------------------------------------------------------
   Small helpers
   --------------------------------------------------------------------------- */

function meetsFloor(rec: Rec, floorRank = DEFAULT_FLOOR_RANK): boolean {
	return (RANK[String(rec.basis)] ?? 9) <= floorRank;
}

function startOf(rec: Rec): number {
	return Number((rec.interval as Span | undefined)?.startEarliest ?? 0);
}

function yearNumber(rec: Rec): number {
	return Number(yearOf(rec));
}

function day(t: number): number {
	return Math.floor(t / 86_400_000);
}

function sameDay(a: number, b: number): boolean {
	return day(a) === day(b);
}

function sortNewestFirst(a: Rec, b: Rec): number {
	const byStart = startOf(b) - startOf(a);
	if (byStart) return byStart;
	const endA = Number((a.interval as Span | undefined)?.endEarliest ?? 0);
	const endB = Number((b.interval as Span | undefined)?.endEarliest ?? 0);
	if (endA !== endB) return endB - endA;
	/* A rule before a row on the same date, then a stable tie-break. */
	if (!!a.rupture !== !!b.rupture) return a.rupture ? -1 : 1;
	return a.id.localeCompare(b.id);
}

/** An attribute value left unquoted when it cannot break the tag. */
function attr(value: unknown): string {
	const text = String(value);
	return /^[A-Za-z0-9._:-]+$/.test(text) ? text : `"${esc(text)}"`;
}

/** Years as a phrase: one year alone, a span through the era, both from data. */
function yearsPhrase(start: number, end: number): string {
	return start === end ? esc(start) : tri('events.years', { start, end });
}

function countCopies(n: number): string {
	return n === 1 ? tri('events.countOne') : tri('events.count', { n });
}

function countSpan(key: string, n: number): string {
	return `<span class=count data-count=${attr(key)}>${countCopies(n)}</span>`;
}

/**
 * A date in the three languages, at the precision the source supports.
 *
 * This is the app's own register vocabulary (events.years, rec.event.approx),
 * with the day written first in English: the hanging margin is eleven characters
 * wide, and "27 Nov 2026" is the form the register is set in. A span reads
 * "8 Jul 2026 to 27 Jul 2026", never with an en dash. The app's own renderer
 * describes the one interval that is still open.
 */
const LEDGER_DATE_LOCALE: Record<Locale, string> = { en: 'en-GB', fr: 'fr', ar: 'ar' };
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dateIn(t: number, precision: 'day' | 'month' | 'year', locale: Locale): string {
	if (precision === 'year') return String(new Date(t).getUTCFullYear());
	const key = `${locale}:${precision}`;
	let formatter = dayFormatters.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(LEDGER_DATE_LOCALE[locale], {
			timeZone: 'UTC',
			numberingSystem: 'latn',
			...(precision === 'month' ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' })
		});
		dayFormatters.set(key, formatter);
	}
	return formatter.format(new Date(t));
}

function dateValues(rec: Rec): Tri {
	const interval = rec.interval as Span | undefined;
	const rawStart = String(rec.date ?? interval?.raw?.start ?? '');
	const rawEnd = String(interval?.raw?.end ?? '');
	const startT = Number(interval?.startEarliest ?? 0);
	const endT = Number(interval?.endEarliest ?? 0);
	const approx = interval?.startPrecision === 'approx' || rawStart.startsWith('~');
	const span = rawEnd.length > 0 && rawEnd !== rawStart && Number.isFinite(endT);
	const precision = (value: unknown, raw: string): 'day' | 'month' | 'year' => {
		if (value === 'day' || value === 'month' || value === 'year') return value;
		return raw.length >= 10 ? 'day' : raw.length >= 7 ? 'month' : 'year';
	};
	const values: Tri = { en: '', fr: '', ar: '' };
	for (const locale of LOCALES) {
		const start = dateIn(startT, precision(interval?.startPrecision, rawStart), locale);
		let text = start;
		if (span) {
			const end = dateIn(endT, precision(interval?.endPrecision, rawEnd), locale);
			text = end === start ? start : format(locale, 'events.years', { start, end });
		} else if (interval?.status && interval.status !== 'ended') {
			text = describeInterval(interval as never, locale);
		}
		values[locale] = approx ? format(locale, 'rec.event.approx', { date: text }) : text;
	}
	return values;
}

/* ---------------------------------------------------------------------------
   Basis strokes, generated from the model's constants
   --------------------------------------------------------------------------- */

/**
 * The four strokes as CSS, one rule for the rail and one for the inline sample.
 *
 * DASH holds SVG user units and the rows are drawn 1:1, so a dash pattern of
 * "5 3" becomes a 5px line then a 3px gap. The colours are the basis tokens and
 * the opacity is BASIS_OPACITY, so the ledger's strokes cannot drift from the
 * instrument's without this block changing too. test-events.ts checks the block
 * against the constants.
 */
function strokeRules(): string {
	const rules: string[] = [];
	const gradient = (dash: string, direction: string): string | null => {
		const lengths = dash.trim().split(/\s+/).filter(Boolean).map(Number);
		if (!lengths.length) return null;
		let at = 0;
		const stops: string[] = [];
		lengths.forEach((length, index) => {
			stops.push(`${index % 2 === 0 ? 'var(--basis)' : 'transparent'} ${at}px ${at + length}px`);
			at += length;
		});
		return `repeating-linear-gradient(${direction}, ${stops.join(', ')})`;
	};
	for (const basis of BASIS_ORDER) {
		const color = BASIS_COLOR[basis];
		const opacity = BASIS_OPACITY[basis];
		const dash = DASH[basis] ?? '';
		const rulesFor = (selector: string, direction: string) => {
			const image = gradient(dash, direction);
			return image
				? `${selector}{--basis:${color};background-image:${image};opacity:${opacity}}`
				: `${selector}{--basis:${color};background-color:${color};opacity:${opacity}}`;
		};
		rules.push(rulesFor(`.ev[data-basis=${basis}] .ev-rail`, 'to bottom'));
		rules.push(rulesFor(`.basis-sample[data-basis=${basis}]`, 'to right'));
	}
	return `<style id="basis-strokes">/* Generated by scripts/build-events.ts from DASH and BASIS_OPACITY. */\n${rules.join('\n')}</style>`;
}

function sample(basis: string): string {
	return `<span class=basis-sample data-basis=${attr(basis)} aria-hidden></span>`;
}

/* ---------------------------------------------------------------------------
   Chapters: era membership is a date test, never a guess
   --------------------------------------------------------------------------- */

const eras = data.eras;
const first = eras[0].interval;
const last = eras[eras.length - 1].interval;

function eraIndexFor(t: number): number {
	/* Boundaries can be shared (an era can open on the day the previous one
	   closes), so the later era owns the day. */
	for (let i = eras.length - 1; i >= 0; i--) {
		const span = eras[i].interval;
		if (t >= Number(span.startEarliest) && t <= Number(span.endEarliest)) return i;
	}
	return -1;
}

const byChapter = new Map<string, Rec[]>();
for (const era of eras) byChapter.set(era.id, []);
byChapter.set('before', []);
byChapter.set('after', []);

for (const rec of data.events) {
	const t = startOf(rec);
	let key: string;
	if (t < Number(first.startEarliest)) key = 'before';
	else if (t > Number(last.endEarliest)) key = 'after';
	else {
		const index = eraIndexFor(t);
		if (index < 0) fail(`${rec.id} starts outside every era but is not before or after the spans; the eras have a gap`);
		key = eras[index].id;
	}
	byChapter.get(key)!.push(rec);
}

function endYearOf(era: EraRow): number {
	const end = String(era.interval.raw?.end ?? era.interval.raw?.start ?? '');
	const year = Number(end.slice(0, 4));
	/* A silence line claims a whole calendar year holds nothing. A year the era
	   only partly covers is not claimed, so the tail stops at the last full year. */
	return /-12-31$/.test(end) ? year : year - 1;
}

const chapters: Chapter[] = [
	{
		key: 'after',
		era: null,
		events: byChapter.get('after')!.sort(sortNewestFirst),
		tailEnd: 0
	},
	/* Newest first: the last era opens the register. */
	...[...eras].reverse().map((era) => ({
		key: era.id,
		era,
		events: byChapter.get(era.id)!.sort(sortNewestFirst),
		tailEnd: endYearOf(era)
	})),
	{
		key: 'before',
		era: null,
		events: byChapter.get('before')!.sort(sortNewestFirst),
		tailEnd: 0
	}
];

/* ---------------------------------------------------------------------------
   Counts
   --------------------------------------------------------------------------- */

const total = data.events.length;
const ruptures = data.events.filter((r) => r.rupture).length;
const allYears = data.events.map(yearNumber);
const firstYear = Math.min(...allYears);
const lastYear = Math.max(...allYears);
const shownDefault = data.events.filter((r) => meetsFloor(r)).length;
const belowDefault = total - shownDefault;
const inferredBelow = data.events.filter((r) => r.basis === 'inferred').length;
const unsubstantiatedBelow = data.events.filter((r) => r.basis === 'unsubstantiated').length;

function chapterTocCount(ch: Chapter): number {
	return ch.events.filter((r) => meetsFloor(r)).length;
}

/** Decade value shared by the row's year and the filter's options. */
function decadeOf(year: number): string {
	return `${Math.floor(year / 10) * 10}s`;
}

const decades = [...new Set(allYears.map(decadeOf))].sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)));

/* ---------------------------------------------------------------------------
   Words the script rebuilds, written once as three language copies
   --------------------------------------------------------------------------- */

function phrase(key: string): string {
	return `<span data-key=${attr(key)}>${tri(key)}</span>`;
}

function word(key: string, values: Tri): string {
	return `<span data-word=${attr(key)}>${triRaw(values)}</span>`;
}

const VER_KEY: Record<string, string> = {
	unflagged: 'events.ver.unflagged',
	'needs-primary-source': 'events.ver.needsPrimary',
	disputed: 'events.ver.disputed'
};

/* Every entity an event names. The filter bar can only say a person's or an
   institution's name if it has the name, and ids never reach a reader; the map
   carries the English form the record pages already use for entity links. */
const entityIds = new Set<string>();
for (const rec of data.events) {
	for (const id of (rec.actors as string[] | undefined) ?? []) entityIds.add(id);
	for (const id of (rec.institutions as string[] | undefined) ?? []) entityIds.add(id);
}

function namesIsland(): string {
	const names: Record<string, string> = {};
	for (const id of [...entityIds].sort()) {
		const name = nameOf(world, id);
		if (name) names[id] = name.en;
	}
	return `<script type="application/json" id="events-names">${JSON.stringify(names).replace(/<\//g, '<\\/')}</script>`;
}

function wordsBlock(): string {
	const parts: string[] = [];
	const keys = [
		'events.count',
		'events.countOne',
		'events.catOption',
		'events.grade',
		'events.decade',
		'events.standing.floor',
		'events.standing.floorNoBelow',
		'events.belowBasis',
		'events.basisLower.documented',
		'events.basisLower.reported',
		'events.basisLower.inferred',
		'events.basisLower.unsubstantiated',
		'events.filter.meta',
		'events.filter.allCats',
		'events.filter.allEras',
		'events.filter.allDecades',
		'events.filter.allGrades',
		'events.filter.allVer',
		'events.active',
		'events.active.count',
		'events.active.clearAll',
		'events.remove',
		'events.label.era',
		'events.label.cat',
		'events.label.period',
		'events.label.grade',
		'events.label.ver',
		'events.label.q',
		'events.label.actor',
		'events.label.institution',
		'events.label.ruptures',
		'events.label.contested',
		'events.label.basis',
		'events.empty.line',
		'events.empty.lineFloor',
		'events.empty.lower',
		'events.empty.lowerOne',
		'events.empty.noLower'
	];
	for (const key of keys) parts.push(phrase(key));

	for (const basis of BASIS_ORDER) {
		parts.push(word(`basis:${basis}`, { en: loc('en', `basis.${basis}`), fr: loc('fr', `basis.${basis}`), ar: loc('ar', `basis.${basis}`) }));
	}
	for (const era of eras) {
		parts.push(word(`era:${era.id}`, { en: era.label_en, fr: era.label_fr ?? era.label_en, ar: era.label_ar ?? era.label_en }));
	}
	parts.push(word('era:before', { en: loc('en', 'events.before'), fr: loc('fr', 'events.before'), ar: loc('ar', 'events.before') }));
	parts.push(word('era:after', { en: loc('en', 'events.after'), fr: loc('fr', 'events.after'), ar: loc('ar', 'events.after') }));
	for (const slug of EVENT_CATEGORIES) {
		parts.push(word(`cat:${slug}`, { en: loc('en', `eventCat.${slug}`), fr: loc('fr', `eventCat.${slug}`), ar: loc('ar', `eventCat.${slug}`) }));
	}
	for (const start of decades) {
		const year = start.slice(0, 4);
		parts.push(word(`decade:${start}`, { en: one('en', 'events.decade', { start: year }), fr: one('fr', 'events.decade', { start: year }), ar: one('ar', 'events.decade', { start: year }) }));
	}
	for (const grade of ['A', 'B', 'C', 'D']) {
		parts.push(word(`grade:${grade}`, { en: loc('en', `confidence.${grade}`), fr: loc('fr', `confidence.${grade}`), ar: loc('ar', `confidence.${grade}`) }));
	}
	for (const value of Object.keys(VER_KEY)) {
		const key = VER_KEY[value];
		parts.push(word(`ver:${value}`, { en: loc('en', key), fr: loc('fr', key), ar: loc('ar', key) }));
	}
	return `<div id="events-words" hidden>${parts.join('')}</div>`;
}

/* ---------------------------------------------------------------------------
   The filter bar
   --------------------------------------------------------------------------- */

function option(value: string, text: string, attrs = ''): string {
	return `<option value="${esc(value)}"${attrs}>${text}</option>`;
}

function select(id: string, labelKey: string, options: string): string {
	return `<div class=field><label class=flabel for=${id}>${tri(labelKey)}</label><select class=fcontrol id=${id}>${options}</select></div>`;
}

function filterBlock(): string {
	const basisOptions = BASIS_ORDER.map((basis) => {
		const text = one('en', `basis.${basis}`);
		return option(basis, text, basis === FLOOR ? ' selected' : '');
	}).join('');

	const eraOptions = [
		option('', one('en', 'events.filter.allEras')),
		...eras.map((era) => option(era.id, esc(era.label_en))),
		option('before', one('en', 'events.before')),
		option('after', one('en', 'events.after'))
	].join('');

	const catOptions = [
		option('', one('en', 'events.filter.allCats')),
		...EVENT_CATEGORIES.map((slug) => {
			const n = data.events.filter((r) => r.category === slug && meetsFloor(r)).length;
			return option(slug, esc(one('en', 'events.catOption', { word: one('en', `eventCat.${slug}`), n })));
		})
	].join('');

	const periodOptions = [
		option('', one('en', 'events.filter.allDecades')),
		...decades.map((start) => option(start, esc(one('en', 'events.decade', { start: start.slice(0, 4) }))))
	].join('');

	const gradeOptions = [
		option('', one('en', 'events.filter.allGrades')),
		...['A', 'B', 'C', 'D'].map((grade) =>
			option(grade, esc(one('en', 'events.grade', { grade, word: one('en', `confidence.${grade}`) })))
		)
	].join('');

	const verOptions = [
		option('', one('en', 'events.filter.allVer')),
		...Object.keys(VER_KEY).map((value) => option(value, esc(one('en', VER_KEY[value]))))
	].join('');

	return `<p class=nojs>${tri('events.nojs')}</p>
<details class=filters id=filters>
<summary class=filters-summary>
<span class=filters-title>${tri('events.filter.summary')}</span>
<span class=filters-meta id=f-meta>${triEach('events.filter.meta', {
		en: { basis: loc('en', `basis.${FLOOR}`), shown: shownDefault, total },
		fr: { basis: loc('fr', `basis.${FLOOR}`), shown: shownDefault, total },
		ar: { basis: loc('ar', `basis.${FLOOR}`), shown: shownDefault, total }
	})}</span>
</summary>
<div class=filters-body>
<div class=filter-grid>
${select('f-basis', 'events.filter.basis', basisOptions)}
${select('f-era', 'events.filter.era', eraOptions)}
${select('f-cat', 'events.filter.cat', catOptions)}
${select('f-period', 'events.filter.period', periodOptions)}
${select('f-grade', 'events.filter.grade', gradeOptions)}
${select('f-ver', 'events.filter.ver', verOptions)}
<div class=field><label class=flabel for=f-q>${tri('events.filter.q')}</label><input class=fcontrol id=f-q type=search placeholder="${esc(one('en', 'events.filter.qPlaceholder'))}" autocomplete=off></div>
<div class=checks>
<label class=check><input type=checkbox id=f-ruptures> <span>${tri('events.filter.ruptures')}</span></label>
<label class=check><input type=checkbox id=f-contested> <span>${tri('events.filter.contested')}</span></label>
</div>
<div class=actions><button class=freset id=f-reset type=button>${tri('events.filter.reset')}</button></div>
</div>
</div>
</details>
<div class=active id=active hidden>
<p class=af-line><span class=af-title>${tri('events.active')}</span> <span class=af-count id=af-count></span></p>
<div class=af-chips id=af-chips></div>
</div>`;
}

/* ---------------------------------------------------------------------------
   Contents and standing
   --------------------------------------------------------------------------- */

function eraTitle(era: EraRow): string {
	return triRaw({ en: era.label_en, fr: era.label_fr ?? era.label_en, ar: era.label_ar ?? era.label_en });
}

function chapterTitleHtml(ch: Chapter): string {
	if (ch.era) return eraTitle(ch.era);
	return tri(ch.key === 'before' ? 'events.before' : 'events.after');
}

function chapterYearsHtml(ch: Chapter): string {
	if (ch.era) {
		const start = Number(String(ch.era.start).slice(0, 4));
		const end = Number(String(ch.era.end).slice(0, 4));
		return yearsPhrase(start, end);
	}
	const years = ch.events.map(yearNumber);
	if (!years.length) return '';
	return yearsPhrase(Math.min(...years), Math.max(...years));
}

function contentsBlock(): string {
	const lines = chapters.map((ch) => {
		const number = ch.era ? String(eras.indexOf(ch.era) + 1).padStart(2, '0') : '';
		const num = number
			? `<span class=toc-num>${number}</span>`
			: `<span class="toc-num toc-num-empty" aria-hidden>·</span>`;
		const mark = ch.era ? `<span class=era-mark style="--era: ${esc(ch.era.accent)}" aria-hidden></span>` : '';
		const href = ch.era ? `#era-${ch.key}` : `#${ch.key}`;
		return `<li><a class=toc-link href="${href}" data-toc=${attr(ch.key)}>${num}${mark}<span class=toc-title>${chapterTitleHtml(ch)}</span><span class=toc-leader aria-hidden></span><span class=toc-meta><span class=toc-years>${chapterYearsHtml(ch)}</span> · ${countSpan(ch.key, chapterTocCount(ch))}</span></a></li>`;
	});
	return `<nav class=contents id=contents aria-label="${esc(one('en', 'events.contents'))}">
<p class=contents-heading>${tri('events.contents')}</p>
<ol class=toc>${lines.join('')}</ol>
</nav>`;
}

function standingBlock(): string {
	const totalLine = tri('events.standing.total', {
		n: total,
		eras: eras.length,
		from: firstYear,
		to: lastYear,
		ruptures
	});
	const split = (locale: Locale): string =>
		[
			inferredBelow
				? one(locale, 'events.belowBasis', { n: inferredBelow, basis: loc(locale, 'events.basisLower.inferred') })
				: '',
			unsubstantiatedBelow
				? one(locale, 'events.belowBasis', {
						n: unsubstantiatedBelow,
						basis: loc(locale, 'events.basisLower.unsubstantiated')
					})
				: ''
		]
			.filter(Boolean)
			.join(', ');
	const floorLine = belowDefault
		? triEach('events.standing.floor', {
				en: { shown: shownDefault, basis: loc('en', `basis.${FLOOR}`), below: belowDefault, split: split('en') },
				fr: { shown: shownDefault, basis: loc('fr', `basis.${FLOOR}`), below: belowDefault, split: split('fr') },
				ar: { shown: shownDefault, basis: loc('ar', `basis.${FLOOR}`), below: belowDefault, split: split('ar') }
			})
		: triEach('events.standing.floorNoBelow', {
				en: { shown: shownDefault, basis: loc('en', `basis.${FLOOR}`) },
				fr: { shown: shownDefault, basis: loc('fr', `basis.${FLOOR}`) },
				ar: { shown: shownDefault, basis: loc('ar', `basis.${FLOOR}`) }
			});
	const key = BASIS_ORDER.map((basis) => {
		const n = data.events.filter((r) => r.basis === basis).length;
		return `<span class=key-item>${sample(basis)} <span class=key-word>${tri(`basis.${basis}`)}</span> <span class=key-count>(${n})</span></span>`;
	}).join('');
	const missingFr = data.events.some((r) => !r.title_fr);
	const missingAr = data.events.some((r) => !r.title_ar);
	const note: string[] = [];
	if (missingFr) note.push(`<b data-l=fr>${esc(loc('fr', 'events.fallbackNote'))}</b>`);
	if (missingAr) note.push(`<b data-l=ar lang=ar dir=rtl>${esc(loc('ar', 'events.fallbackNote'))}</b>`);
	const fallback = note.length ? `\n<p class=fallback-note>${note.join('')}</p>` : '';
	return `<section class="standing" id=standing>
<p class=sl id=standing-total>${totalLine}</p>
<p class=sl id=standing-floor>${floorLine}</p>
<div class=basis-key><span class=key-label>${tri('events.basisKey')}</span>${key}</div>
</section>${fallback}`;
}

/* ---------------------------------------------------------------------------
   Rows
   --------------------------------------------------------------------------- */

function placeNames(rec: Rec): Tri[] {
	return ((rec.location as string[] | undefined) ?? [])
		.map((id) => world.places.get(id))
		.filter((p): p is Rec => !!p)
		.map((p) => ({ en: String(p.name_en ?? p.id), fr: String(p.name_fr ?? p.name_en ?? p.id), ar: String(p.name_ar ?? p.name_en ?? p.id) }));
}

function involvedNames(rec: Rec): Tri[] {
	const ids = [...((rec.actors as string[] | undefined) ?? []), ...((rec.institutions as string[] | undefined) ?? [])];
	const seen = new Set<string>();
	const out: Tri[] = [];
	for (const id of ids) {
		if (seen.has(id)) continue;
		seen.add(id);
		const name = nameOf(world, id);
		if (!name) continue;
		out.push({ en: name.en, fr: name.fr ?? name.en, ar: name.ar ?? name.en });
	}
	return out;
}

/** Three copies only when the three forms differ; proper nouns usually do not. */
function copies(values: Tri): string {
	if (values.en === values.fr && values.en === values.ar) return esc(values.en);
	return triRaw(values);
}

/**
 * A title in the three languages, one visible at a time.
 *
 * A missing translation does not repeat the English title into a second slot:
 * the English copy names the languages it covers, the stylesheet shows it for
 * those readers, and one marker plus one sentence (above the register) explain
 * it. That keeps a row's cost to its three real titles, not four.
 */
function ledgerTitle(rec: Rec): string {
	const en = String(rec.title_en ?? rec.id);
	const fr = typeof rec.title_fr === 'string' && rec.title_fr.trim() ? rec.title_fr : '';
	const ar = typeof rec.title_ar === 'string' && rec.title_ar.trim() ? rec.title_ar : '';
	const missing = [!fr && 'fr', !ar && 'ar'].filter(Boolean).join(' ');
	const fallback = missing ? ` data-fallback="${missing}"` : '';
	const parts = [`<b data-l=en${fallback}>${esc(en)}</b>`];
	if (fr) parts.push(`<b data-l=fr>${esc(fr)}</b>`);
	if (ar) parts.push(`<b data-l=ar lang=ar dir=rtl>${esc(ar)}</b>`);
	return parts.join('');
}

function metaLineHtml(rec: Rec): string {
	const runs: string[] = [];
	runs.push(tri(`eventCat.${String(rec.category)}`));
	const places = placeNames(rec);
	if (places.length) runs.push(places.map((p) => copies(p)).join(', '));
	const names = involvedNames(rec);
	if (names.length) {
		const shown = names.slice(0, 3).map((n) => copies(n)).join(', ');
		const rest = names.length - 3;
		runs.push(`${shown}${rest > 0 ? `, ${tri('events.andMore', { n: rest })}` : ''}`);
	}
	runs.push(`<span class=ev-basis>${sample(String(rec.basis))} ${basisLine(rec.basis, rec.confidence)}</span>`);
	const ver = String(rec.verification ?? 'unflagged');
	if (ver !== 'unflagged' && VER_KEY[ver]) {
		runs.push(`<span class=ev-ver data-ver=${attr(ver)}>${tri(VER_KEY[ver])}</span>`);
	}
	const contested = ((rec.contested as Rec[] | undefined) ?? []).length;
	if (contested > 1) runs.push(`<span class=ev-framings>${tri('events.framings', { n: contested })}</span>`);
	/* The date is in the line's flow on a phone and hangs in the margin on a
	   wide screen; the separator between them is the stylesheet's, so the date
	   is outside the joined run and is written once. */
	return `<p class=ev-meta><span class=ev-date>${triRaw(dateValues(rec))}</span>${runs.join(' · ')}</p>`;
}

function rowAttrs(rec: Rec, year: number): string {
	const entities = [
		...((rec.actors as string[] | undefined) ?? []),
		...((rec.institutions as string[] | undefined) ?? [])
	].join(' ');
	const contested = ((rec.contested as Rec[] | undefined) ?? []).length > 1 ? '1' : '0';
	const hidden = meetsFloor(rec) ? '' : ' hidden';
	return ` class="ev${rec.rupture ? ' ev-rupture' : ''}"${hidden} data-event="${esc(rec.id)}" data-year=${attr(year)} data-cat=${attr(rec.category)} data-basis=${attr(rec.basis)} data-grade=${attr(rec.confidence)} data-ver=${attr(rec.verification)} data-contested=${contested} data-entities="${esc(entities)}"`;
}

function rowHtml(rec: Rec, year: number): string {
	const title = `<h3 class=ev-title><a class=ev-link href=/e/${encodeURIComponent(rec.id)}>${ledgerTitle(rec)}</a></h3>`;
	return `<li${rowAttrs(rec, year)}><span class=ev-rail aria-hidden></span>${title}${metaLineHtml(rec)}</li>`;
}

function ruptureHtml(rec: Rec, opening: boolean, anchors: Set<string>): string {
	const year = yearNumber(rec);
	const contested = ((rec.contested as Rec[] | undefined) ?? []).length;
	const extra = contested > 1 ? ` · ${tri('events.framings', { n: contested })}` : '';
	const tag = `<span class=rupture-tag>${tri(opening ? 'events.ruptureOpening' : 'events.rupture')}</span>`;
	const anchor = anchors.has(String(year)) ? '' : ` id="y${year}"`;
	if (anchor) anchors.add(String(year));
	return `<li${rowAttrs(rec, year)}${anchor}><span class=rupture-rule><span class="rupture-line rupture-lead" aria-hidden></span><a class=rupture-card href=/e/${encodeURIComponent(rec.id)}><span class=rupture-kicker>${tag} · <span class=rupture-date>${triRaw(dateValues(rec))}</span></span><span class=rupture-title>${ledgerTitle(rec)}</span><span class=rupture-meta>${sample(String(rec.basis))} ${basisLine(rec.basis, rec.confidence)}${extra}</span></a><span class="rupture-line rupture-tail" aria-hidden></span></span></li>`;
}

/* ---------------------------------------------------------------------------
   A chapter: opening hinges, then newest year first
   --------------------------------------------------------------------------- */

function chapterHtml(ch: Chapter, anchors: Set<string>): string {
	const era = ch.era;
	const title = chapterTitleHtml(ch);
	const yearsHtml = chapterYearsHtml(ch);
	const count = countSpan(ch.key, chapterTocCount(ch));
	const id = era ? `era-${ch.key}` : ch.key;
	const style = era ? ` style="--era: ${esc(era.accent)}"` : '';
	const number = era ? `<span class=chapter-num>${String(eras.indexOf(era) + 1).padStart(2, '0')} /</span>` : '';
	const mark = era ? `<span class=era-mark aria-hidden></span>` : '';
	const eyebrow = `<p class=chapter-eyebrow>${number}${mark}<span class=chapter-years>${yearsHtml}</span> · ${count}</p>`;

	let head = `<header class=chapter-head>${eyebrow}<h2 class=chapter-title>${title}</h2>`;
	if (era) {
		const thesis = triRaw({ en: era.thesis, fr: era.thesis_fr ?? era.thesis, ar: era.thesis_ar ?? era.thesis });
		const sources = (era.sources ?? [])
			.map((sid) => world.sources.get(sid))
			.filter((s): s is Rec => !!s)
			.map((s) => `${esc(s.title ?? s.id)}${s.publisher ? ` (${esc(s.publisher)})` : ''}`);
		head += `\n<p class=chapter-formula>${esc(era.formula)}</p>\n<div class=chapter-thesis>${thesis}</div>`;
		if (sources.length) head += `\n<p class=chapter-sources><span class=src-label>${tri('rec.section.sources')}</span> ${sources.join('; ')}</p>`;
	} else {
		const key = ch.key === 'before' ? 'events.before.note' : 'events.after.note';
		const edge = ch.key === 'before' ? first : last;
		const at = Number(ch.key === 'before' ? edge.startEarliest : edge.endEarliest);
		const note = triEach(key, {
			en: { date: dateIn(at, 'day', 'en') },
			fr: { date: dateIn(at, 'day', 'fr') },
			ar: { date: dateIn(at, 'day', 'ar') }
		});
		head += `\n<p class=chapter-note>${note}</p>`;
	}
	head += '</header>';

	/* The ruptures that open an era sit at the head of their chapter, in date
	   order. Every other rupture keeps its chronological place in the docket. */
	const opening: Rec[] = [];
	const rest: Rec[] = [];
	for (const rec of ch.events) {
		const isOpening = !!era && !!rec.rupture && sameDay(startOf(rec), Number(era.interval.startEarliest));
		(isOpening ? opening : rest).push(rec);
	}

	const items: string[] = opening.map((rec) => ruptureHtml(rec, true, anchors));

	const years: number[] = [];
	for (const rec of rest) {
		const y = yearNumber(rec);
		if (years[years.length - 1] !== y) years.push(y);
	}

	if (ch.tailEnd > 0 && years.length) {
		const run = silenceRun(years[0] + 1, ch.tailEnd);
		if (run) items.push(silenceRunHtml(run[0], run[1]));
	}

	for (let i = 0; i < years.length; i++) {
		const year = years[i];
		if (i > 0) {
			const run = silenceRun(year + 1, years[i - 1] - 1);
			if (run) items.push(silenceRunHtml(run[0], run[1]));
		}
		const tickId = anchors.has(String(year)) ? `y${year}-${ch.key}` : `y${year}`;
		anchors.add(String(year));
		items.push(`<li class=ytick id="${tickId}" data-year-tick="${year}"><span class=ytick-year>${year}</span><span class=ytick-rule aria-hidden></span></li>`);
		for (const rec of rest.filter((r) => yearNumber(r) === year)) {
			items.push(rec.rupture ? ruptureHtml(rec, false, anchors) : rowHtml(rec, year));
		}
	}

	return `<section class="chapter" id="${esc(id)}" data-chapter=${attr(ch.key)}${style}>
${head}
<ol class=ledger>${items.join('')}</ol>
</section>`;
}

/** A run of whole empty years between two recorded years, if it is worth a line. */
function silenceRun(from: number, to: number): [number, number] | null {
	if (to < from) return null;
	if (to - from + 1 < 2) return null;
	return [from, to];
}

function silenceRunHtml(from: number, to: number): string {
	return `<li class=silence><span class=silence-line>${tri('events.silence', { from, to })}</span></li>`;
}

/* ---------------------------------------------------------------------------
   The document
   --------------------------------------------------------------------------- */

const head = headShell({
	title: `${one('en', 'events.title')} · DeepTunisia`,
	description: one('en', 'events.desc'),
	url: `${SITE_URL}/events`,
	styles: ['/events.css']
}).replace('</head>', `${strokeRules()}\n</head>`);

const anchors = new Set<string>();
const ledger = chapters.map((ch) => chapterHtml(ch, anchors)).join('\n');

const html = `${head}
<body>
<main class=sheet>
<header class=head>
<p class=ledger-kind>${tri('events.kind')}</p>
<h1>${tri('events.title')}</h1>
</header>
${standingBlock()}
${contentsBlock()}
${filterBlock()}
<section class=empty id=empty hidden>
<h2>${tri('events.empty.title')}</h2>
<p id=empty-line></p>
<p>${tri('events.empty.hint')}</p>
<p class=empty-lower><button class=flow-btn id=empty-lower type=button></button></p>
<p class=empty-no-lower id=empty-no-lower hidden></p>
<div class=af-chips id=empty-chips></div>
<p class=empty-reset><button class=freset id=empty-reset type=button>${tri('events.filter.reset')}</button></p>
</section>
<div id=ledger data-total=${attr(total)} data-floor=${attr(FLOOR)}>
${ledger}
</div>
<footer>
<p>${tri('rec.footer.license')}</p>
<p class=flinks><a href=/chronicle>${tri('rec.chronicle.link')}</a> <a href=/data>${tri('rec.footer.data')}</a> <a href=/about>${tri('rec.footer.about')}</a> <a href=/methodology>${tri('rec.footer.method')}</a></p>
</footer>
</main>
${wordsBlock()}
${namesIsland()}
<script src=/events.js defer></script>
</body>
</html>
`;

writeFileSync(OUT, html, 'utf8');
console.log(
	`\n  events      ${chapters.length} chapters · ${total} events (${shownDefault} at the ${FLOOR} floor, ${belowDefault} below) · ${ruptures} ruptures · ${Math.round(Buffer.byteLength(html) / 1024)} KB → build/events.html`
);
