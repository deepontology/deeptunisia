import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import investigations from '$data/media/index.json';

export const load: PageLoad = async ({ params }) => {
	const slug = params.slug;

	// Check the investigation exists
	const meta = investigations.find((i) => i.slug === slug);
	if (!meta) {
		throw error(404, `Investigation "${slug}" not found`);
	}

	// Load the full bundle
	const bundle: Record<string, unknown> = await import(`$data/media/${slug}.json`).then(
		(m) => m.default
	);

	return {
		investigation: bundle
	};
};
