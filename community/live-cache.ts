/**
 * Shared storage for computed live study results.
 *
 * `GET /api/studies/:slug/live` is the most expensive read the research API
 * does: every response row for the current instrument hash, read and scored
 * per request, with a bootstrap on top. That cost grows with the answers, so
 * recomputing it on every request spends a Worker's CPU limit and the D1 daily
 * read quota per reader, and anyone holding F5 on the results page can exhaust
 * both. So the computed payload is stored and reused: one computation per study
 * and instrument hash per LIVE_MAX_AGE_SECONDS (research-api.ts), which is
 * what a live figure has always meant here, one up to a minute old.
 *
 * This module is the store, not the policy, the same split `consume` makes
 * with BucketStore in ratelimit.ts. The handler decides the lifetime and
 * re-checks the expiry on every read, so an entry that outlived its welcome
 * costs one recompute and never one wrong answer.
 *
 * Two implementations share the interface. The Worker wraps the platform's
 * edge cache (wired in worker.ts); the local server and the tests take the Map
 * below, because Node has no Cache API.
 */

/** One computed payload and the moment it stops being fresh. */
export interface LiveCacheEntry {
	/** The serialized response body, served byte for byte to the next reader. */
	body: string;
	/** Epoch milliseconds after which the entry is recomputed instead of read. */
	expires_at: number;
}

export interface LiveCache {
	/** The entry stored under the key, or null when none is fresh. */
	get(key: string): Promise<LiveCacheEntry | null>;
	/** Store the entry under the key, replacing whatever was there before. */
	put(key: string, entry: LiveCacheEntry): Promise<void>;
}

/**
 * An in-memory LiveCache: a Map whose entries expire on read.
 *
 * Entries are never evicted, which is fine at the size of this thing (one per
 * study and instrument hash), and a stale one is dropped rather than served,
 * here as well as on the edge. `now` is a parameter so a test can let the
 * lifetime pass without sleeping through it; the server passes nothing.
 */
export function memoryLiveCache(now: () => number = Date.now): LiveCache {
	const entries = new Map<string, LiveCacheEntry>();
	return {
		async get(key) {
			const entry = entries.get(key);
			if (!entry) return null;
			if (entry.expires_at <= now()) {
				entries.delete(key);
				return null;
			}
			return entry;
		},
		async put(key, entry) {
			entries.set(key, entry);
		}
	};
}
