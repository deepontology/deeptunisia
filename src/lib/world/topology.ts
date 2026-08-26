/**
 * The world topology, fetched at runtime — never bundled.
 *
 * The globe is the only consumer of the country geometry, and bundling 100KB
 * of topojson into the shared chunk made every page — including ones that
 * never draw a globe — transfer it. This module follows the map view's R14
 * pattern: static/world-topo.json is served verbatim by the build (emitted
 * by build-world.ts) and fetched after mount, so the geometry loads only on
 * /world and the first paint never waits for it.
 *
 * The fetch is same-origin, which the CSP allows (`connect-src 'self'`), and
 * the file is content-stable between builds (geometry changes rarely), so the
 * browser's HTTP cache absorbs repeat visits.
 */

import type { Topology } from 'topojson-specification';

let cached: Promise<Topology> | null = null;

/** Fetch (once) and validate the topology. Rejected promises are not cached —
 *  a transient network failure must be retryable by remounting the view. */
export function loadTopology(): Promise<Topology> {
	if (cached) return cached;
	cached = fetch('/world-topo.json')
		.then((r) => {
			if (!r.ok) throw new Error(`world-topo.json: HTTP ${r.status}`);
			return r.json();
		})
		.then((raw: unknown) => {
			const topo = raw as Topology;
			if (!topo || !topo.objects || !topo.objects.countries) {
				throw new Error('world-topo.json: missing countries object — rerun `npm run data`');
			}
			return topo;
		});
	return cached;
}
