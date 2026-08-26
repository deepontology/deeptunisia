/**
 * The views table — one source, three renders.
 *
 * This is the single list of what each view is and when to reach for it. Three
 * places render it, and they must never drift:
 *
 *   1. the caption line in Viewport.svelte (every view answers one sentence),
 *   2. the table on /guide (the in-product orientation page),
 *   3. the README's views table (repo-level orientation; kept in step by hand
 *      and pointed at /guide as the maintained copy — see README).
 *
 * The text lives in the dictionary under `guide.<key>.answer` (one line, used
 * by the caption and the table) and `guide.<key>.when` (when to reach for it,
 * table only). Labels come from the existing `nav.<key>` keys. Keys must exist
 * in all three locales — test-i18n enforces the parity.
 */

export interface ViewEntry {
	/** Route path, as `page.url.pathname` reports it. */
	route: string;
	/** i18n key stem: `nav.<key>`, `guide.<key>.answer`, `guide.<key>.when`. */
	key: string;
}

/** Every route with a caption and a guide row. Order is the guide's order. */
export const VIEWS: ViewEntry[] = [
	{ route: '/', key: 'chronicle' },
	{ route: '/now', key: 'now' },
	{ route: '/network', key: 'network' },
	{ route: '/atlas', key: 'atlas' },
	{ route: '/world', key: 'world' },
	{ route: '/rankings', key: 'rankings' },
	{ route: '/investigate', key: 'investigate' },
	{ route: '/map', key: 'map' },
	{ route: '/evidence', key: 'evidence' },
	{ route: '/methodology', key: 'method' },
	{ route: '/corrections', key: 'corrections' },
	{ route: '/data', key: 'data' },
	{ route: '/about', key: 'about' },
	{ route: '/agora', key: 'agora' },
	{ route: '/feed', key: 'feed' }
];

const BY_ROUTE = new Map(VIEWS.map((v) => [v.route, v]));

/** The entry for a pathname, or null when the route has no caption. */
export function viewFor(pathname: string): ViewEntry | null {
	return BY_ROUTE.get(pathname) ?? null;
}

/** The answer line for a pathname, as a dictionary key. */
export function answerKeyFor(pathname: string): string | null {
	const v = viewFor(pathname);
	return v ? `guide.${v.key}.answer` : null;
}
