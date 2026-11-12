import type { PageLoad } from './$types';
import indexData from '$data/media/index.json';

export const load: PageLoad = async () => {
	return {
		investigations: indexData
	};
};
