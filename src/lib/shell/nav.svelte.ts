/**
 * The navigation model.
 *
 * THREE BUBBLES, NOT A FLAT TAB BAR
 *
 * Graph, Media and Agora are not three equal epistemic silos. Graph and Media
 * belong to the record; Agora is the argument about it, and it gets its own
 * slot because crossing that line should be cheap and visible.
 *
 * Graph = the sourced record (instrument views)
 * Media = the reading surfaces: in-house investigations, and the third-party
 *         headline feed
 * Agora = the community layer: discussion, proposed changes, reports
 *
 * Media is architecturally connected to Graph: entities link to the graph,
 * sources are graph sources, the evidence vocabulary is shared. It is not a
 * separate epistemic world; it is a different rendering of the same evidence
 * system, with editorial judgement and narrative framing added.
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

export type BubbleId = 'graph' | 'media' | 'agora';

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
	}
];

/** Routes that belong to Media or Agora. Everything else is Graph. */
const MEDIA_PATHS = new Set(['/media', '/feed']);
const AGORA_PATHS = new Set(['/agora']);

export function bubbleFor(pathname: string): Bubble {
	if (MEDIA_PATHS.has(pathname) || pathname.startsWith('/media/')) {
		return BUBBLES.find((b) => b.id === 'media')!;
	}
	if (AGORA_PATHS.has(pathname)) {
		return BUBBLES.find((b) => b.id === 'agora')!;
	}
	return BUBBLES.find((b) => b.id === 'graph')!;
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
		const nestedWorld = path === '/world' && pathname.startsWith('/world/');
		if (path !== pathname && !nestedWorld) return false;
		if (!item.tab) return true;
		// No tab in the URL means the section's default, which is its first tab.
		return tab ? item.tab === tab : item.tab === bubble.items[0]?.tab;
	});
}

export function isActive(item: NavItem, pathname: string, tab: string | null): boolean {
	const [path] = item.href.split('?');
	const nestedWorld = path === '/world' && pathname.startsWith('/world/');
	if (path !== pathname && !nestedWorld) return false;
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
	agora: '/agora'
});

/** The href a bubble should navigate to: where you left it, or its home. */
export function bubbleHref(bubble: Bubble): string {
	return lastPath[bubble.id] || bubble.home;
}

export function rememberPath(url: URL) {
	const id = bubbleFor(url.pathname).id;
	lastPath[id] = url.pathname + url.search;
}
