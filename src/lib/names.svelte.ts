/**
 * Record-aware localisation.
 *
 * Everything here reads a record, so it lives beside the graph: `t.svelte.ts`
 * keeps only dictionary lookups and stays free of the dataset. Instrument code
 * imports these names; a page that only prints translation keys does not.
 */
import { app } from './state.svelte';
import { localeProse } from './locale-prose.svelte';
import {
	entityName as entityNameIn,
	institutionById,
	personById,
	type EventRec,
	type Institution,
	type Person,
	type Role
} from './model';

// --- Localised record fields ------------------------------------------------
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

/* --- Authored prose, in the reader's language ------------------------------
 *
 * A field written by this project, plus whether the reader is looking at a
 * translation or at the English original.
 *
 * THE FALLBACK IS NEVER SILENT. Returning English with no marker teaches a
 * reader that the Arabic interface is complete when it is not. `translated:
 * false` is what `Prose.svelte` renders the marker from, and callers are
 * expected to use it rather than discard it.
 */
export interface ProseValue {
	text: string;
	translated: boolean;
	by?: string;
}

export function prose(record: object, field: string): ProseValue {
	// `object` rather than an index signature: the callers are typed graph records
	// which do not carry one, and widening each of them to accept arbitrary keys
	// would cost more type safety than this reads back.
	const rec = record as Record<string, unknown>;
	const original = String(rec[field] ?? '');
	if (app.locale === 'en') return { text: original, translated: true };
	// Re-read when the reader's language prose arrives (locale-prose.svelte.ts).
	void localeProse.version;
	const value = rec[`${field}_${app.locale}`];
	if (typeof value === 'string' && value.trim()) {
		return { text: value, translated: true, by: rec[`${field}_${app.locale}_by`] as string };
	}
	return { text: original, translated: false };
}

/** The list form, trajectory and notes. Falls back element-wise, never partially. */
export function proseList(record: object, field: string): ProseValue & { items: string[] } {
	const rec = record as Record<string, unknown>;
	const original = (rec[field] as string[] | undefined) ?? [];
	if (app.locale === 'en') return { items: original, text: '', translated: true };
	void localeProse.version;
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

/**
 * The name of any record, in the reader's language.
 *
 * People carry `name_*`, roles and events carry `title_*`, eras carry `label_*`,
 * three conventions for the same idea. Accepting `null | undefined` is
 * deliberate: most call sites come from a `Map.get` and were already written as
 * `x?.name_en`. Returning an empty string keeps them one expression.
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
 * The pure `entityName` in model.ts resolves through `resolveEntity`, whose
 * `.name` is the English form, so relying on it alone would render English names
 * into the Arabic interface while the Arabic name sat in the same record.
 */
export function entityName(id: string): string {
	return nameOf(personById.get(id)) || nameOf(institutionById.get(id)) || entityNameIn(id);
}
