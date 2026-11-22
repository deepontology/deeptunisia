import { error } from '@sveltejs/kit';
import { instrumentFor, studies } from '$lib/research';
import type { EntryGenerator, PageLoad } from './$types';

/**
 * Prerendered per study from the compiled registry. A study page exists for
 * every registry entry at build time; an unknown slug is a genuine 404.
 */
export const entries: EntryGenerator = () => studies.map((s) => ({ slug: s.slug }));

export const load: PageLoad = ({ params }) => {
	const study = studies.find((s) => s.slug === params.slug);
	if (!study) error(404, 'unknown study');
	return { study, instrument: instrumentFor(study) ?? null };
};
