/**
 * The "Indexes" section of the landing page: one card per study.
 *
 * Each card shows exactly one honest state, chosen from the registry:
 *
 *   - a published monthly value, if the study has one (any status)
 *   - otherwise the status: fielding, design, frozen, or closed
 *
 * WHY THE VALUE IS GUARDED
 *
 * A number on this page is a public claim. The registry does not carry a
 * monthly value yet, so nothing below matches today, and the guard is written
 * against the forward shape instead of against whatever a study happens to
 * carry. An output is accepted as a value only when it is exactly:
 *
 *   { kind: 'results', published: true, month: 'YYYY-MM', value: 0..100, n: positive integer }
 *
 * `month` must also name a real month (01 to 12). The latest such month wins.
 * Anything else, including a `dataset` or `paper` output that happens to carry
 * a number, is ignored.
 *
 * WHY THE TEXT IS IN ITS OWN ELEMENTS
 *
 * The page is translated at runtime by replacing the text of every element with
 * `data-i18n`. A number inside such an element would be lost or mistranslated,
 * so the value, the month and the sample size always sit outside them.
 */

export type Locale = 'en' | 'fr' | 'ar';

export const INDEX_STRINGS: Record<string, string> = {
	'index.eyebrow': 'DT Research',
	'index.title': 'Indexes',
	'index.read': 'Read the study',
	'index.design': 'In development. The questions and the formula are published before the first answer.',
	'index.fielding': 'Collecting responses for',
	'index.frozen': 'The questionnaire is fixed. Collection has not started.',
	'index.closed': 'Collection has closed. Results are on the study page.',
	'index.among': 'among respondents to an open online survey'
};

const SHORT_LABEL: Record<string, string> = { police: 'PSI' };
const COVER: Record<string, string> = { police: '/research/media/psi-9-still.webp' };

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const YEAR_MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DESIGN_STATUSES = new Set(['design', 'proposed', 'ethics-review']);

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Own-property lookup, so a slug such as `constructor` cannot reach Object.prototype.
function own(map: Record<string, string>, key: string): string | undefined {
	return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function nonEmpty(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}

function parseYearMonth(s: string): { year: number; month: number } | null {
	if (!YEAR_MONTH.test(s)) return null;
	const year = Number(s.slice(0, 4));
	const month = Number(s.slice(5, 7));
	return month >= 1 && month <= 12 ? { year, month } : null;
}

function monthText(year: number, month: number, locale: Locale): string {
	const tag = locale === 'ar' ? 'ar-TN' : locale;
	return new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
		new Date(Date.UTC(year, month - 1, 1))
	);
}

interface MonthlyValue {
	month: string;
	value: number;
	n: number;
}

function publishedValue(outputs: unknown): MonthlyValue | null {
	if (!Array.isArray(outputs)) return null;
	let best: MonthlyValue | null = null;
	for (const o of outputs) {
		if (!isRecord(o) || o.kind !== 'results' || o.published !== true) continue;
		const { month, value, n } = o;
		if (typeof month !== 'string' || !parseYearMonth(month)) continue;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) continue;
		if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) continue;
		// YYYY-MM sorts chronologically as a string.
		if (!best || month > best.month) best = { month, value, n };
	}
	return best;
}

// The fielding month is the month the window opens; a window without a start has none.
function fieldingMonth(window: unknown): string | null {
	if (!isRecord(window) || typeof window.start !== 'string' || !DAY.test(window.start)) return null;
	const ym = window.start.slice(0, 7);
	return parseYearMonth(ym) ? ym : null;
}

// The same text in each language. The page swaps it when the reader changes language.
interface Texts {
	en: string;
	fr: string | null;
	ar: string | null;
}

function textIn(texts: Texts, locale: Locale): string {
	return texts[locale] ?? texts.en;
}

function l10nAttrs(texts: Texts): string {
	let out = '';
	for (const l of ['en', 'fr', 'ar'] as const) {
		const text = texts[l];
		if (text) out += ` data-l10n-${l}="${esc(text)}"`;
	}
	return out;
}

function timeTag(ym: string, locale: Locale): string {
	const { year, month } = parseYearMonth(ym)!;
	const texts: Texts = {
		en: monthText(year, month, 'en'),
		fr: monthText(year, month, 'fr'),
		ar: monthText(year, month, 'ar')
	};
	return `<time datetime="${ym}" data-month="${ym}"${l10nAttrs(texts)}>${esc(textIn(texts, locale))}</time>`;
}

function valueLine(slug: string, titles: Texts, v: MonthlyValue, locale: Locale): string {
	const short = own(SHORT_LABEL, slug);
	const label =
		short !== undefined
			? `<span class="idx-label">${esc(short)}</span>`
			: `<span class="idx-label"${l10nAttrs(titles)}>${esc(textIn(titles, locale))}</span>`;
	return (
		`<b class="idx-value">${label} ${timeTag(v.month, locale)}: ` +
		`<span class="idx-v">${v.value}</span>/100</b> · n = <span class="idx-n">${v.n}</span> · ` +
		`<span data-i18n="index.among">${esc(INDEX_STRINGS['index.among'])}</span>`
	);
}

function statusSpan(key: string): string {
	return `<span data-i18n="${key}">${esc(INDEX_STRINGS[key])}</span>`;
}

function statusLine(study: Json, slug: string, titles: Texts, locale: Locale): string {
	const value = publishedValue(study.outputs);
	if (value) return valueLine(slug, titles, value, locale);

	const status = typeof study.status === 'string' ? study.status : '';
	if (status === 'fielding') {
		const ym = fieldingMonth(study.fielding_window);
		const when = ym ? ` ${timeTag(ym, locale)}` : '';
		return `<span data-i18n="index.fielding">${esc(INDEX_STRINGS['index.fielding'])}</span>${when}`;
	}
	if (DESIGN_STATUSES.has(status)) return statusSpan('index.design');
	if (status === 'frozen') return statusSpan('index.frozen');
	return statusSpan('index.closed');
}

function renderCard(study: Json, locale: Locale, assetExists: (path: string) => boolean): string | null {
	const slug = study.slug;
	if (typeof slug !== 'string' || !SLUG.test(slug)) return null;
	const titleEn = nonEmpty(study.title_en);
	if (!titleEn) return null;

	const titles: Texts = {
		en: titleEn,
		fr: nonEmpty(study.title_fr),
		ar: nonEmpty(study.title_ar)
	};

	const cover = own(COVER, slug);
	const img =
		cover !== undefined && assetExists(cover)
			? `\n\t\t\t<img class="plate" src="${esc(cover)}" alt="" loading="lazy" decoding="async">`
			: '';
	const status = typeof study.status === 'string' ? study.status : 'unknown';

	return [
		`\t\t<li class="card index-card" data-status="${esc(status)}">`,
		`\t\t\t<a class="card-link" href="/research/${esc(slug)}">${img}`,
		`\t\t\t\t<span class="card-title"${l10nAttrs(titles)}>${esc(textIn(titles, locale))}</span>`,
		`\t\t\t\t<span class="card-status">${statusLine(study, slug, titles, locale)}</span>`,
		`\t\t\t\t<span class="card-cta" data-i18n="index.read">${esc(INDEX_STRINGS['index.read'])}</span>`,
		`\t\t\t</a>`,
		`\t\t</li>`
	].join('\n');
}

/**
 * Returns the section markup, or '' when there is nothing honest to show.
 * Accepts the registry object or its `studies` array directly.
 */
export function renderIndexes(studies: unknown | null, locale: Locale, assetExists: (path: string) => boolean): string {
	const list = Array.isArray(studies) ? studies : isRecord(studies) && Array.isArray(studies.studies) ? studies.studies : null;
	if (!list) return '';

	const cards: string[] = [];
	for (const s of list) {
		if (!isRecord(s)) continue;
		const card = renderCard(s, locale, assetExists);
		if (card) cards.push(card);
	}
	if (cards.length === 0) return '';

	return [
		'<section class="sec" id="indexes" aria-labelledby="indexes-title">',
		'\t<header class="sec-head">',
		`\t\t<p class="eyebrow" data-i18n="index.eyebrow">${esc(INDEX_STRINGS['index.eyebrow'])}</p>`,
		`\t\t<h2 class="sec-title" id="indexes-title" data-i18n="index.title">${esc(INDEX_STRINGS['index.title'])}</h2>`,
		'\t</header>',
		'\t<ul class="cards index-cards">',
		cards.join('\n'),
		'\t</ul>',
		'</section>'
	].join('\n');
}
