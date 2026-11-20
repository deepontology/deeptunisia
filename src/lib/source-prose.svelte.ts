import { SvelteMap } from 'svelte/reactivity';
import { fetchKept } from './fetch-kept';
import { ds } from './model';

/**
 * The prose of a source (its excerpt), fetched the first time a panel shows one.
 *
 * The bundled graph keeps every source's citation (id, title, publisher, date,
 * url, archive_url, tier, lang), so a claim's sources are checkable on the first
 * screen and with no connection. The excerpts are about 145 KB compressed and none
 * of the first screen, so `scripts/build-data.ts` writes them to
 * `static/sources-prose.json` and this module fetches that file once.
 *
 * Offline: the first read goes through the browser's HTTP cache, so a reader who
 * has opened a source before has the excerpts again without a connection for as long
 * as the browser keeps them. A reader who has not gets `status === 'error'`, and the
 * panel says the excerpt is not available without a connection and offers a retry. A
 * source with no excerpt (`hasExcerpt` unset) never shows either state.
 */

export type SourceProse = { excerpt?: string };

export const sourceProseState = $state<{ status: 'idle' | 'loading' | 'ready' | 'error' }>({ status: 'idle' });

/** Reactive: a panel that reads `excerptOf(id)` redraws when the file lands. */
const prose = new SvelteMap<string, SourceProse>();

export function excerptOf(id: string): string | undefined {
	return prose.get(id)?.excerpt;
}

let pending: Promise<void> | null = null;

/** Fetch and merge the file, once. A failure is remembered as `error` and the next call tries again. */
export function ensureSourceProse(): Promise<void> {
	if (pending) return pending;
	sourceProseState.status = 'loading';
	// The graph hash names the build, so a new dataset never meets old prose in a cache.
	const v = encodeURIComponent((ds.meta as { datasetHash?: string }).datasetHash ?? '');
	pending = fetchKept(`/sources-prose.json?v=${v}`)
		.then((r) => {
			if (!r.ok) throw new Error(`sources-prose ${r.status}`);
			return r.json() as Promise<{ sources?: Record<string, SourceProse> }>;
		})
		.then((file) => {
			for (const [id, fields] of Object.entries(file.sources ?? {})) prose.set(id, fields);
			sourceProseState.status = 'ready';
		})
		.catch(() => {
			sourceProseState.status = 'error';
			pending = null;
		});
	return pending;
}
