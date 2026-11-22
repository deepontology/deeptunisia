import { error } from '@sveltejs/kit';
import { instrumentFor, studies } from '$lib/research';
import type { PageLoad } from './$types';

/**
 * The board is prerendered from the compiled registry. The page carries the
 * build-time study and instrument so it renders with no API; the board then
 * reads the live study to learn whether answers are being collected, because
 * only the server knows the gate and the storage.
 */
export const load: PageLoad = () => {
	const study = studies.find((s) => s.slug === 'citizen-budget');
	if (!study) error(404, 'unknown study');
	return { study, instrument: instrumentFor(study) ?? null };
};
