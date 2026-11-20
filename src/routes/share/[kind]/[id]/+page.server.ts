import type { PageServerLoad } from './$types';
import dataset from '$data/dataset.json';

/**
 * The share pages are prerendered for crawlers, and their description is the first
 * 160 characters of a record's own text. The graph the browser holds no longer carries
 * that text (it is fetched from `prose-en.json` when a panel opens), so the text is
 * read here, from the full dataset, once per build. Nothing reaches the page but the
 * sentence it prints.
 */
export const prerender = true;

type Prose = { id: string; summary?: string; description?: string };
const byId = (rows: unknown): Map<string, Prose> => new Map(((rows ?? []) as Prose[]).map((r) => [r.id, r]));
const people = byId((dataset as Record<string, unknown>).people);
const institutions = byId((dataset as Record<string, unknown>).institutions);
const relationships = byId((dataset as Record<string, unknown>).relationships);

export const load: PageServerLoad = ({ params }) => {
	const text =
		params.kind === 'relationship'
			? relationships.get(params.id)?.description
			: (people.get(params.id)?.summary || institutions.get(params.id)?.summary);
	return { text: (text ?? '').slice(0, 160) };
};
