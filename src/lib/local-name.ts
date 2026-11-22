/**
 * The name a reading page prints for a row of its build-time slice.
 *
 * Reading pages carry names in all three scripts and no records, so the choice
 * `names.svelte.ts` makes from a record is made here from a plain map. The
 * fallback is the English form, never an empty cell.
 */
export interface Scripts {
	en: string;
	fr?: string;
	ar?: string;
}

export function localName(names: Scripts | undefined | null, locale: string): string {
	if (!names) return '';
	if (locale === 'ar' && names.ar) return names.ar;
	if (locale === 'fr' && names.fr) return names.fr;
	return names.en;
}
