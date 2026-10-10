/**
 * The navigation model.
 *
 * FOUR BUBBLES, NOT A FLAT TAB BAR
 *
 * Graph, Media, Agora and Research are not four equal epistemic silos. Graph and
 * Media belong to the record; Research collects structured observations from
 * people; Agora is the argument about the record, and it gets its own slot
 * because crossing that line should be cheap and visible.
 *
 * Graph = the sourced record (instrument views)
 * Media = the reading surfaces: in-house investigations, and the third-party
 *         headline feed
 * Research = open, pre-registered studies: the instrument, the method and the
 *            released data, with the population statement attached to every number
 * Agora = the community layer: discussion, proposed changes, reports
 *
 * Media is architecturally connected to Graph: entities link to the graph,
 * sources are graph sources, the evidence vocabulary is shared. It is not a
 * separate epistemic world; it is a different rendering of the same evidence
 * system, with editorial judgement and narrative framing added.
 *
 * Research is separate by construction: its data are observations about people
 * who chose to take part, never claims about the country, and nothing under it
 * may render in the register of a sourced graph claim. That distinction is why
 * it gets a first-tier slot rather than a link buried under Graph.
 *
 * The feed sits here rather than under Agora for two reasons. Agora's three
 * tabs share identity, moderation and a gate (`AGORA_OPEN`), and the feed shares
 * none of them; keeping it there put a live page under a "soon" badge. And the
 * feed's standing is already carried where a reader meets it: the notice at the
 * top of the page, the item hint in this strip, and a rendering with no basis
 * chips, no confidence grades and no evidence colours. That last point is the
 * rule this file exists to keep: within Media, the feed must never borrow the
 * register of a graded investigation, and nothing under Agora may ever render in
 * the register of a sourced claim. The bubble sets the expectation; the views
 * have to keep it.
 */

import { AGORA_OPEN } from '$lib/agora-gate';

export type BubbleId = 'graph' | 'media' | 'agora' | 'research';

export interface NavItem {
	href: string;
	/** i18n key suffix. Resolved as `nav.<key>`, with `nav.<key>.hint` if present. */
	key: string;
	/**
	 * Agora's sections are one route with a query parameter rather than four routes,
	 * because they share a loaded identity, an offline state and a target filter.
	 * When set, the item is active only if `?tab=` matches (absent counts as the
	 * bubble's first tab).
	 */
	tab?: string;
}

export interface Bubble {
	id: BubbleId;
	key: string;
	/** Where the bubble goes when clicked directly. */
	home: string;
	items: NavItem[];
	/** Reference material. Present in the strip on wide screens, a menu when narrow. */
	docs?: NavItem[];
	/**
	 * The section is announced but not open: the switcher shows a "soon" badge
	 * and the section's page renders a coming-soon banner instead of its views.
	 */
	soon?: boolean;
}

export const BUBBLES: Bubble[] = [
	{
		id: 'graph',
		key: 'graph',
		home: '/',
		items: [
			{ href: '/', key: 'chronicle' },
			{ href: '/now', key: 'now' },
			{ href: '/network', key: 'network' },
			{ href: '/atlas', key: 'atlas' },
			{ href: '/world', key: 'world' },
			{ href: '/rankings', key: 'rankings' },
			{ href: '/investigate', key: 'investigate' }
		],
		docs: [
			{ href: '/guide', key: 'guide' },
			{ href: '/evidence', key: 'evidence' },
			{ href: '/methodology', key: 'method' },
			{ href: '/corrections', key: 'corrections' },
			{ href: '/data', key: 'data' },
			{ href: '/about', key: 'about' }
		]
	},
	{
		id: 'media',
		key: 'media',
		home: '/media',
		items: [
			{ href: '/media', key: 'investigations' },
			{ href: '/feed', key: 'feed' }
		]
	},
	{
		id: 'agora',
		key: 'agora',
		home: '/agora',
		// The discussion layer is staged. The bubble stays so the distinction between
		// the record and the argument about it remains visible, but while AGORA_OPEN
		// is false it is marked: the page behind it is a coming-soon banner. Flip the
		// flag in $lib/agora-gate.ts and the badge disappears with nothing else to do.
		soon: !AGORA_OPEN,
		items: [
			{ href: '/agora?tab=discussion', key: 'discussion', tab: 'discussion' },
			{ href: '/agora?tab=proposals', key: 'proposals', tab: 'proposals' },
			{ href: '/agora?tab=reported', key: 'reported', tab: 'reported' }
		]
	},
	{
		id: 'research',
		key: 'research',
		home: '/research',
		// The label comes from `nav.research` (the same key the guide row uses);
		// the one item below is the program overview. Study pages hang off it, and
		// the nested-path rule keeps the item current on every child route.
		items: [{ href: '/research', key: 'research.overview' }]
	}
];

/** Routes that belong to Media, Agora or Research. Everything else is Graph. */
const MEDIA_PATHS = new Set(['/media', '/feed']);
const AGORA_PATHS = new Set(['/agora']);
const RESEARCH_PATHS = new Set(['/research']);

export function bubbleFor(pathname: string): Bubble {
	if (MEDIA_PATHS.has(pathname) || pathname.startsWith('/media/')) {
		return BUBBLES.find((b) => b.id === 'media')!;
	}
	if (AGORA_PATHS.has(pathname)) {
		return BUBBLES.find((b) => b.id === 'agora')!;
	}
	if (RESEARCH_PATHS.has(pathname) || pathname.startsWith('/research/')) {
		return BUBBLES.find((b) => b.id === 'research')!;
	}
	return BUBBLES.find((b) => b.id === 'graph')!;
}

/**
 * Routes whose child paths keep the parent item current.
 *
 * `/world` and `/research` are single destinations in the strip even though
 * they have child routes, so walking into `/world/tunisia` or
 * `/research/democracy/participate` must not blank the indicator. A set rather
 * than a boolean per route: the next such section adds one word here, not
 * another near-identical branch in both functions below.
 */
const NESTED_PATHS = new Set(['/world', '/research']);

function inNestedPath(path: string, pathname: string): boolean {
	return NESTED_PATHS.has(path) && pathname.startsWith(`${path}/`);
}

/**
 * Which item in the strip is current.
 *
 * Returns an index into `[...items, ...docs]` so a caller can drive a sliding
 * indicator, or -1 when the reader is somewhere the strip does not name.
 */
export function activeIndex(bubble: Bubble, pathname: string, tab: string | null): number {
	const all = [...bubble.items, ...(bubble.docs ?? [])];
	return all.findIndex((item) => {
		const [path] = item.href.split('?');
		if (path !== pathname && !inNestedPath(path, pathname)) return false;
		if (!item.tab) return true;
		// No tab in the URL means the section's default, which is its first tab.
		return tab ? item.tab === tab : item.tab === bubble.items[0]?.tab;
	});
}

export function isActive(item: NavItem, pathname: string, tab: string | null): boolean {
	const [path] = item.href.split('?');
	if (path !== pathname && !inNestedPath(path, pathname)) return false;
	if (!item.tab) return true;
	// No tab in the URL means the section's default, which is its first tab. The
	// owner is resolved from the path; this used to read BUBBLES[1], which stopped
	// being the bubble with tabs the moment a third section was added.
	return tab ? item.tab === tab : item.tab === bubbleFor(pathname).items[0]?.tab;
}

/**
 * Where each bubble was left.
 *
 * Switching to Agora to read one thread and back should return the reader to the
 * Network they were reading, not to the Chronicle. Without this the top-level switch
 * silently costs you your place, which makes people stop using it — and the whole
 * point of promoting the split to the first tier is that crossing it should be cheap.
 *
 * Deliberately not persisted. It is a memory of this session's navigation, not a
 * preference, and restoring it on a cold load would make a shared link open somewhere
 * the sender never was.
 */
export const lastPath = $state<Record<BubbleId, string>>({
	graph: '/',
	media: '/media',
	agora: '/agora',
	research: '/research'
});

/** The href a bubble should navigate to: where you left it, or its home. */
export function bubbleHref(bubble: Bubble): string {
	return lastPath[bubble.id] || bubble.home;
}

export function rememberPath(url: URL) {
	const id = bubbleFor(url.pathname).id;
	lastPath[id] = url.pathname + url.search;
}
