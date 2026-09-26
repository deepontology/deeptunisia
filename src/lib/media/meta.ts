/**
 * Bundled investigation fields, in the reader's language.
 *
 * Titles, subtitles and series names are stored in three languages in the
 * investigation meta, so the index, the gateway and the article header render the
 * translated form rather than reaching past it to `.en`. The narrative itself is
 * English-only by policy and is marked as such; this helper is only for the fields
 * that carry a real translation.
 */
import { app } from '$lib/state.svelte';
import type { LocaleString } from './types';

export function localized(value: LocaleString | undefined): string {
	if (!value) return '';
	return value[app.locale] || value.en || '';
}

/**
 * The ink an editorial-status chip wears.
 *
 * Draft gets `--basis-inferred`, the amber that already means "reasoned, not
 * established" everywhere else in the product: a draft is work in progress,
 * which is a gap in the work rather than a fault in the record, so it must
 * not borrow an error colour either. Every other status is plain chrome. The
 * badge never takes a claim grade's colour: publication state is not an
 * epistemic grade, and mixing the two would let a status chip imply evidence
 * strength nobody claimed.
 */
export function statusTint(status: string): string {
	return status === 'draft' ? 'var(--basis-inferred)' : 'var(--text-muted)';
}
