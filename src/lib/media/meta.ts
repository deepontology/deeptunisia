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
