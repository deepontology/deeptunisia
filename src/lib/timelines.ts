import type { Person } from '../generated';

export type TimelineItems = NonNullable<Person['timeline']>;

let pending: Promise<Record<string, TimelineItems>> | null = null;

/**
 * Per-entity timelines are derived at build time and kept out of the bundled
 * graph; the file is fetched the first time a card opens and then reused.
 */
export function loadTimelines(): Promise<Record<string, TimelineItems>> {
	pending ??= fetch('/timelines.json')
		.then((r) => (r.ok ? r.json() : {}))
		.catch(() => {
			pending = null;
			return {};
		});
	return pending;
}
