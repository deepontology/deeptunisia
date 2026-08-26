/**
 * Agora renders on the client.
 *
 * The rest of the atlas is prerendered from data shipped with the page. This view
 * has nothing to prerender — discussion arrives from /api at request time — and
 * server-rendering it would mean the static build depending on a running community
 * worker, which is exactly the coupling the atlas is kept free of.
 *
 * `prerender` stays true so the route's shell is still emitted by the static build:
 * the page exists and loads instantly, then fills in.
 */
export const prerender = true;
export const ssr = false;
