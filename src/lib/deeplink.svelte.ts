/**
 * Deep links — W2: every selection is a URL.
 *
 * One shared convention across the entity views: `?id=<entity>` selects a
 * person, institution, or event on arrival, exactly like the Network's existing
 * `?id=`/`?rel=` (the pattern this module generalises). Because every entity
 * view drives the SAME global `app.selected`, one write hook in the layout
 * keeps the URL in step with the selection everywhere — Chronicle, Now,
 * Network, Atlas and Rankings all consume `?id=`, and the Inspector opens on
 * selection by its own logic, so a deep link gets you the selection AND the
 * panel without per-view work.
 *
 * The Map is the one exception: its governorate selection is local to
 * TunisiaMap, so it carries its own `?region=` (see TunisiaMap.svelte).
 *
 * Rules inherited from the Network precedent:
 *  - `replaceState`, never `pushState` — the back button must not start
 *    walking through selections, and the reader's place in the view is not
 *    navigation history.
 *  - A URL nothing consumes is the worst shape of broken (the Agora mention
 *    trap). Every param this module emits is read by the view it names; the
 *    write hook only runs on routes that consume `?id=`.
 *
 * TRAP (caught by smoke, W2): `page.url` is where the last navigation put
 * it. Neither the raw `history.replaceState` nor SvelteKit's `replaceState`
 * (shallow routing) moves it, so a write built on `page.url.href`, or a guard
 * comparing against it, works from a stale base: the write is dropped, or a
 * param another view wrote since is lost. Read the current URL from
 * `location.href`, and write through SvelteKit's `replaceState` from
 * `$app/navigation`, which keeps the router's history entry intact and
 * silences the dev-mode advisory about the raw API.
 */

import { page } from '$app/state';
import { replaceState } from '$app/navigation';
import { browser } from '$app/environment';
import { app } from './state.svelte';
import { personById, institutionById, relationshipById, eventById } from './model';

/**
 * Routes whose selection is entity selection, and that consume `?id=`.
 *
 * NOTE: the Chronicle's real route is `/chronicle`, not `/` — the site root
 * belongs to the landing page (build-landing.ts) and only dev-redirects to
 * /chronicle. Nav's `href: '/'` names the landing root, not this view; the
 * write hook must key on the actual instrument route or it silently no-ops
 * there (caught by the W2 smoke round trip).
 */
const ENTITY_ROUTES = new Set(['/chronicle', '/now', '/network', '/atlas', '/rankings']);

export function consumesEntityLink(pathname: string): boolean {
	return ENTITY_ROUTES.has(pathname);
}

/** True when the id names a real person, institution, or event in the graph. */
export function validEntity(id: string): boolean {
	return personById.has(id) || institutionById.has(id) || eventById.has(id);
}

/** True when the id names a relationship in the graph (or a flow synthetic). */
export function validRelationship(id: string): boolean {
	if (relationshipById.has(id)) return true;
	// flows and synthetic membership edges use prefixes; consider them addressable for sharing
	if (id.startsWith('flow-') || id.startsWith('pos-')) return true;
	return false;
}

export function validFlowId(id: string): boolean {
	// format: kind:year:iso2  e.g. trade:2024:US
	return /^(trade|energy|debt):\d{4}:[A-Z0-9-]+$/.test(id);
}

/**
 * One-shot read of `?id=` — call inside a `$effect` in each entity view,
 * guarded by the view's own `deepLinked` flag (see NetworkView). Applies the
 * selection and returns true when a valid entity was named.
 */
export function applyEntityLink(): boolean {
	if (!browser) return false;
	const id = page.url.searchParams.get('id');
	if (!id || !validEntity(id)) return false;
	app.selected = id;
	return true;
}

/**
 * Keep the URL in step with the selection — call once from the layout.
 *
 * Reads `app.selected` so it re-runs on every selection change, and
 * `page.url.pathname` so it does nothing on routes that do not consume
 * `?id=`. It writes through SvelteKit's `replaceState` (not the raw history
 * API — see the trap above). That call is shallow routing and leaves
 * `page.url` where the last navigation put it, so the current value and the
 * new URL are both read from the address bar.
 */
/**
 * Rewrite the address bar from its current value.
 *
 * A write in the first effects of a page load can come before the SvelteKit
 * router is ready, and `replaceState` throws then. Writes therefore go through
 * one queue, applied in the order they were made, each rebuilt from the
 * address bar when it runs: a later write can never be undone by an earlier
 * one that had to wait. A queued write for a page the reader has since left
 * is dropped, and so is the queue if the router never comes up (a few
 * seconds), rather than throwing from a timer.
 */
const pending: { mutate: (u: URL) => void; path: string }[] = [];
let retry: ReturnType<typeof setTimeout> | undefined;
export function rewriteUrl(mutate: (u: URL) => void) {
	if (!browser) return;
	pending.push({ mutate, path: location.pathname });
	if (retry === undefined) flushUrl(60);
}
function flushUrl(tries: number) {
	retry = undefined;
	while (pending.length) {
		const { mutate, path } = pending[0];
		if (path === location.pathname) {
			const u = new URL(location.href);
			mutate(u);
			if (u.href !== location.href) {
				try {
					replaceState(u, page.state);
				} catch {
					if (tries > 0) retry = setTimeout(() => flushUrl(tries - 1), 50);
					else pending.length = 0;
					return;
				}
			}
		}
		pending.shift();
	}
}

export function syncSelectionUrl() {
	if (!browser) return;
	if (!consumesEntityLink(page.url.pathname)) return;
	const sel = app.selected;
	const current = new URL(location.href).searchParams.get('id');
	/*
	 * Compare the PARAM, not the whole href.
	 *
	 * URLSearchParams re-encodes every param it serialises, so a route carrying
	 * an unrelated value like `?flow=trade:2011:FR` produced a "different" href
	 * on every run and called replaceState from the layout's first effect, before
	 * the SvelteKit router was initialised. That threw on any entity route with a
	 * colon in the query and rewrote params the reader had not changed. Deciding
	 * on the `id` value alone leaves every other param byte-for-byte alone.
	 */
	if (sel && validEntity(sel)) {
		if (current === sel) return;
	} else if (current === null) {
		return;
	}
	// From the address bar, not page.url: SvelteKit's replaceState is shallow
	// routing and leaves page.url at the last navigation, so building on it
	// dropped whatever a view had written since (the network's ?view= and
	// ?ties=).
	rewriteUrl((u) => {
		if (sel && validEntity(sel)) u.searchParams.set('id', sel);
		else u.searchParams.delete('id');
	});
}
