/**
 * Deep links — W2: every selection is a URL.
 *
 * One shared convention across the entity views: `?id=<entity>` selects a
 * person or institution on arrival, exactly like the Network's existing
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
 * TRAP (caught by smoke, W2): the raw `history.replaceState` does NOT update
 * SvelteKit's internal `page.url` — no popstate fires — so a guard comparing
 * the built URL against `page.url.href` no-ops against a stale base and the
 * write is dropped (or a stale param survives). The correct API is
 * SvelteKit's `replaceState` from `$app/navigation`, which keeps its URL
 * state in sync. It also silences the dev-mode advisory about the raw API.
 */

import { page } from '$app/state';
import { replaceState } from '$app/navigation';
import { browser } from '$app/environment';
import { app } from './state.svelte';
import { personById, institutionById, relationshipById } from './model';

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

/** True when the id names a real person or institution in the graph. */
export function validEntity(id: string): boolean {
	return personById.has(id) || institutionById.has(id);
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
 * `?id=`. SvelteKit's `replaceState` (not the raw history API — see the trap
 * above) updates its internal URL, so the next run compares against the
 * value this one wrote.
 */
export function syncSelectionUrl() {
	if (!browser) return;
	if (!consumesEntityLink(page.url.pathname)) return;
	const sel = app.selected;
	const u = new URL(page.url.href);
	if (sel && validEntity(sel)) u.searchParams.set('id', sel);
	else u.searchParams.delete('id');
	if (u.href !== page.url.href) replaceState(u, '');
}
