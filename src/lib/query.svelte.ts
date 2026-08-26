import { browser } from '$app/environment';
import { page } from '$app/state';

/**
 * The query string, or nothing at all while prerendering.
 *
 * WHY THIS EXISTS
 *
 * SvelteKit throws on `url.searchParams` during prerender, and it is right to.
 * A prerendered route is ONE file served for every query string: `/agora`,
 * `/agora?tab=proposals` and `/agora?thread=17` are all answered with the same
 * bytes. HTML that varied by parameter would be baked at build time with
 * whichever value the crawler happened to visit, and then handed to everyone —
 * so a reader opening a link to a proposal would be served markup claiming the
 * discussion tab is current, with no way to tell it was a lie.
 *
 * So during prerender the honest answer is that there are no parameters. The
 * page is built in its parameterless state, hydration reads the real URL, and
 * the first client render corrects it. That is a flash of the default tab on a
 * cold load, which is the cost of a static site, and it is a much smaller cost
 * than a server.
 *
 * Read this inside `$derived` rather than caching it: `page.url` is reactive and
 * the whole point is that the answer changes at hydration and on every
 * subsequent navigation.
 *
 * Do NOT reach for `page.url.searchParams` directly in a component. It compiles,
 * it works in `npm run dev`, and it fails only in `npm run build` — which is how
 * it survived long enough to make the first production build red.
 */
export function query(): URLSearchParams {
	return browser ? page.url.searchParams : EMPTY;
}

/** Shared, and never mutated. Handing out a fresh one per call would make every
 *  `$derived` reading it recompute on every invalidation. */
const EMPTY = new URLSearchParams();
