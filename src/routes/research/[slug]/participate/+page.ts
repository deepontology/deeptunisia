import { error } from '@sveltejs/kit';
import { instrumentFor, studies } from '$lib/research';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => studies.map((s) => ({ slug: s.slug }));

export const load: PageLoad = ({ params }) => {
	const study = studies.find((s) => s.slug === params.slug);
	if (!study) error(404, 'unknown study');
	return { study, instrument: instrumentFor(study) ?? null };
};
