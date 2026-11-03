import { geoArea } from 'd3-geo';
import type { Feature, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';

/**
 * The 24 governorates, as features the globe can project.
 *
 * The polygons are the geoBoundaries TUN ADM1 basemap (static/tn-adm.geojson),
 * the same file the flat map drew; the ids come from the graph build's
 * gazetteer (static/geo.json) through the ISO 3166-2 code each feature
 * carries. Nothing here is drawn by hand.
 *
 * WHY THE RINGS ARE THINNED
 *
 * The basemap holds about 10,700 vertices. The globe re-projects every overlay
 * path on every frame of a drag, and at country zoom a governorate border is a
 * few hundred pixels long, so keeping one vertex in four costs no visible detail
 * and a quarter of the work. Each ring keeps its first and last vertex, so it
 * still closes, and a ring too small to survive thinning is kept whole.
 *
 * WHY THE WINDING IS CHECKED
 *
 * On a plane a ring's direction does not matter. On a sphere d3 reads it as
 * which side is inside, and a ring wound the planar way encloses the rest of
 * the Earth. A polygon whose area comes out above a hemisphere is reversed.
 */

export interface Governorate {
	/** Gazetteer id, e.g. `gov-sfax`. */
	id: string;
	/** ISO 3166-2 code, e.g. `TN-61`. */
	code: string;
	name_en: string;
	name_fr?: string;
	name_ar?: string;
	/** Parent region id from the gazetteer. */
	region: string;
	feature: Feature<MultiPolygon>;
	/** Label anchor: the centroid of the largest ring's vertices, in lon/lat. */
	anchor: [number, number];
}

type GeoFeature = {
	properties: { id: string; kind?: string; code?: string; parent?: string; name_en: string; name_fr?: string; name_ar?: string };
};

const KEEP_EVERY = 4;

function thin(ring: Position[]): Position[] {
	if (ring.length <= KEEP_EVERY * 4) return ring;
	const out = ring.filter((_, i) => i % KEEP_EVERY === 0);
	out.push(ring[ring.length - 1]);
	return out;
}

function rewound(poly: Position[][]): Position[][] {
	const area = geoArea({ type: 'Polygon', coordinates: poly });
	return area > 2 * Math.PI ? poly.map((ring) => [...ring].reverse()) : poly;
}

function polygonsOf(g: Polygon | MultiPolygon): Position[][][] {
	return g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
}

let pending: Promise<Governorate[]> | null = null;

/** Loaded once per visit and shared; the globe asks only when the reader zooms in. */
export function loadGovernorates(): Promise<Governorate[]> {
	pending ??= Promise.all([
		fetch('/tn-adm.geojson').then((r) => r.json()),
		fetch('/geo.json').then((r) => r.json())
	]).then(([adm, geo]) => {
		const byCode = new Map<string, GeoFeature['properties']>();
		for (const f of geo.features as GeoFeature[]) {
			if (f.properties.kind === 'governorate' && f.properties.code) byCode.set(f.properties.code, f.properties);
		}
		const out: Governorate[] = [];
		for (const f of adm.features as Feature<Polygon | MultiPolygon, { shapeISO: string }>[]) {
			const rec = byCode.get(f.properties.shapeISO);
			if (!rec || !f.geometry) continue;
			const polys = polygonsOf(f.geometry).map((p) => rewound(p.map(thin)));
			const largest = polys.map((p) => p[0]).reduce((a, b) => (b.length > a.length ? b : a));
			const lon = largest.reduce((s, p) => s + p[0], 0) / largest.length;
			const lat = largest.reduce((s, p) => s + p[1], 0) / largest.length;
			out.push({
				id: rec.id,
				code: f.properties.shapeISO,
				name_en: rec.name_en,
				name_fr: rec.name_fr,
				name_ar: rec.name_ar,
				region: rec.parent ?? '',
				feature: { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } },
				anchor: [lon, lat]
			});
		}
		return out.sort((a, b) => a.id.localeCompare(b.id));
	});
	return pending;
}

/** The coastline and borders at 1:50m around Tunisia (scripts/build-region.ts). */
export interface Region {
	land: MultiPolygon;
	coast: MultiLineString;
	borders: MultiLineString;
}

let regionPending: Promise<Region> | null = null;

export function loadRegion(): Promise<Region> {
	regionPending ??= fetch('/med-50m.json').then((r) => r.json());
	return regionPending;
}
