/**
 * Fetch a file the site serves, and when the network fails, fall back to a copy the
 * browser still holds from an earlier read, however old.
 *
 * The files the graph leaves out (`prose-<lang>.json`, `sources-prose.json`) are cached
 * by the browser after the first read, and a request that cannot reach the network
 * throws. `cache: 'only-if-cached'` asks the HTTP cache alone, stale or not, so a reader
 * who has opened the file before has it again offline for as long as the browser keeps
 * it. There is no service worker, so this is the browser's cache and not a store the
 * site controls: a reader who never fetched the file gets the original error.
 */
export async function fetchKept(url: string): Promise<Response> {
	try {
		return await fetch(url);
	} catch (e) {
		const kept = await fetch(url, { cache: 'only-if-cached', mode: 'same-origin' }).catch(() => null);
		if (kept?.ok) return kept;
		throw e;
	}
}
