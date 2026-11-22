import { error, redirect } from '@sveltejs/kit';
import { boardPathFor, instrumentFor, studies } from '$lib/research';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => studies.map((s) => ({ slug: s.slug }));

export const load: PageLoad = ({ params }) => {
	const study = studies.find((s) => s.slug === params.slug);
	if (!study) error(404, 'unknown study');
	// An allocation study is answered on its board, never in the question runner.
	const board = boardPathFor(study);
	if (board) redirect(308, board);
	return { study, instrument: instrumentFor(study) ?? null };
};
