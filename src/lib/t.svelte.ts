import { app } from './state.svelte';
import { translate, format as formatIn, type Locale } from './i18n';
import {
	BASIS_LABEL,
	CONFIDENCE_LABEL,
	entityName as entityNameIn,
	institutionById,
	personById,
	LAYER_LABEL,
	REL_LABEL,
	type Confidence,
	describeInterval as describeIntervalIn,
	durationLabel as durationLabelIn,
	formatDate as fmtDate,
	type Basis,
	type Layer,
	type Institution,
	type Interval,
	type Person,
	type Role,
	type EventRec
} from './model';
import { type IndexKey } from './indices';

/**
 * Reactive translation helper. `t('nav.atlas')` re-renders when the locale changes
 * because it reads `app.locale` inside a rune-tracked scope.
 */
export function t(key: string): string {
	return translate(app.locale, key);
}

/** Reactive translation with `{param}` interpolation — whole sentences only. */
export function tf(key: string, params: Record<string, string | number> = {}): string {
	return formatIn(app.locale, key, params);
}

export function localeName(): Locale {
	return app.locale;
}

// --- Localised data accessors ----------------------------------------------
//
// Entity names are stored in three scripts in the dataset itself. These pick the
// right one and fall back to English, so a person with no Arabic form still renders
// rather than disappearing in the Arabic interface.

export function personName(p: Person): string {
	if (app.locale === 'ar' && p.name_ar) return p.name_ar;
	if (app.locale === 'fr' && p.name_fr) return p.name_fr;
	return p.name_en;
}

export function institutionName(i: Institution): string {
	if (app.locale === 'ar' && i.name_ar) return i.name_ar;
	if (app.locale === 'fr' && i.name_fr) return i.name_fr;
	return i.name_en;
}

export function roleTitle(r: Role): string {
	if (app.locale === 'ar' && r.title_ar) return r.title_ar;
	if (app.locale === 'fr' && r.title_fr) return r.title_fr;
	return r.title_en;
}

export function eventTitle(e: EventRec): string {
	if (app.locale === 'ar' && e.title_ar) return e.title_ar;
	if (app.locale === 'fr' && e.title_fr) return e.title_fr;
	return e.title_en;
}

/* --- Generated strings, in the reader's language ---------------------------
 *
 * Same split as `translate` / `t`: the pure function in `model.ts` takes an explicit
 * locale, and these wrappers supply it from app state so a component re-renders when
 * the language changes. Call these from components; call the `model.ts` versions only
 * where there is no reactive context — `search.ts` building its index at module load
 * is the one such place.
 */

/*
 * These deliberately keep the names of the pure functions they wrap. A component
 * importing `formatDate` from here gets the reactive one and its call sites do not
 * change; the only edit a view needs is which module the name comes from. Renaming
 * them instead would have meant touching forty-eight call sites to change nothing
 * about what they do, and every one of those is a chance to shadow a local `date` or
 * `interval` — both of which already exist as variables in these files.
 */
export function formatDate(t: number, precision: 'day' | 'month' | 'year' = 'day'): string {
	return fmtDate(t, precision, app.locale);
}

/** "1957 — present", "by June 2018 at the latest", "confirmed through Dec 2025, possibly later". */
export function describeInterval(iv: Interval): string {
	return describeIntervalIn(iv, app.locale);
}

export function durationLabel(years: number): string {
	return durationLabelIn(years, app.locale);
}

/* --- Authored prose, in the reader's language ------------------------------
 *
 * A field written by this project, plus whether the reader is looking at a
 * translation or at the English original.
 *
 * THE FALLBACK IS NEVER SILENT.
 *
 * Returning English with no marker teaches a reader that the Arabic interface is
 * complete when it is not — the same quiet overstatement the published review-coverage
 * number exists to prevent. `translated: false` is what `Prose.svelte` renders the
 * marker from, and callers are expected to use it rather than discard it.
 *
 * `by` carries the provenance tier through to the interface, so a future pass can
 * mark unreviewed machine output differently from a human translation without
 * touching any call site.
 */
export interface ProseValue {
	text: string;
	translated: boolean;
	by?: string;
}

export function prose(record: object, field: string): ProseValue {
	// `object` rather than an index signature: the callers are typed graph records
	// (Person, Institution, Era) which do not carry one, and widening each of them to
	// accept arbitrary keys would cost more type safety than this reads back.
	const rec = record as Record<string, unknown>;
	const original = String(rec[field] ?? '');
	if (app.locale === 'en') return { text: original, translated: true };
	const value = rec[`${field}_${app.locale}`];
	if (typeof value === 'string' && value.trim()) {
		return { text: value, translated: true, by: rec[`${field}_${app.locale}_by`] as string };
	}
	return { text: original, translated: false };
}

/** The list form — trajectory, notes. Falls back element-wise, never partially. */
export function proseList(record: object, field: string): ProseValue & { items: string[] } {
	const rec = record as Record<string, unknown>;
	const original = (rec[field] as string[] | undefined) ?? [];
	if (app.locale === 'en') return { items: original, text: '', translated: true };
	const value = rec[`${field}_${app.locale}`];
	if (Array.isArray(value) && value.length) {
		return {
			items: value as string[],
			text: '',
			translated: true,
			by: rec[`${field}_${app.locale}_by`] as string
		};
	}
	return { items: original, text: '', translated: false };
}

export function basisLabel(b: Basis): string {
	return translate(app.locale, `basis.${b}`);
}

/** The full evidence description, from the dictionary — never BASIS_DESC directly. */
export function basisDesc(b: Basis): string {
	return translate(app.locale, `basis.desc.${b}`);
}

/** The index legend, from the dictionary — INDEX_META stays the EN fallback. */
export function indexMeta(k: IndexKey): { label: string; blurb: string; derived: string } {
	return {
		label: translate(app.locale, `index.${k}.label`),
		blurb: translate(app.locale, `index.${k}.blurb`),
		derived: translate(app.locale, `index.${k}.derived`)
	};
}

export function layerLabel(l: Layer): string {
	return translate(app.locale, `layer.${l}`) || LAYER_LABEL[l];
}

/*
 * These two were the quiet ones.
 *
 * `basis.*` and `layer.*` have been translated in all three locales since the first
 * i18n pass, and eleven call sites rendered the raw English maps from `model.ts`
 * instead — so the Arabic interface showed "Reported" and "ECONOMIC" beside a
 * perfectly good Arabic translation nobody was reading. Translation already paid for
 * and never delivered. Import the reactive label, never the map.
 */
/**
 * The name of any record, in the reader's language.
 *
 * WHY THIS IS ONE FUNCTION AND NOT FOUR
 *
 * People carry `name_*`, roles and events carry `title_*`, eras carry `label_*` —
 * three conventions for the same idea, and fifty-six places in the interface reached
 * past all of them to render the `_en` field directly. The data was already there:
 * every institution has a French name, 98% have Arabic, 96% of people have Arabic.
 * The Arabic interface was showing "President of the Republic" beside a perfectly
 * good Arabic title sitting unused in the same record.
 *
 * Accepting `null | undefined` is deliberate: most call sites come from a `Map.get`
 * and were already written as `x?.name_en`. Returning an empty string keeps them
 * one expression rather than making each one grow a guard.
 */
export function nameOf(rec: unknown): string {
	if (!rec || typeof rec !== 'object') return '';
	const r = rec as Record<string, string | undefined>;
	const base = r.name_en !== undefined ? 'name' : r.title_en !== undefined ? 'title' : 'label';
	return r[`${base}_${app.locale}`] || r[`${base}_en`] || '';
}

/**
 * An entity id to its name, in the reader's language.
 *
 * The pure `entityName` in model.ts resolves through `resolveEntity`, whose `.name`
 * is the English form — so fifteen call sites rendered English names into the Arabic
 * interface while the Arabic name sat in the same record.
 */
export function entityName(id: string): string {
	return nameOf(personById.get(id)) || nameOf(institutionById.get(id)) || entityNameIn(id);
}

export function relLabel(type: string): string {
	return translate(app.locale, `rel.${type}`) || REL_LABEL[type] || type;
}

export function confidenceLabel(c: Confidence): string {
	return translate(app.locale, `confidence.${c}`) || CONFIDENCE_LABEL[c];
}
