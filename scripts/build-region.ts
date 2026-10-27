/**
 * Compiles the coastline and borders the globe draws at country scale into
 * `static/med-50m.json`.
 *
 * WHY A SECOND, FINER GEOMETRY
 *
 * The globe's world is Natural Earth 1:110m, which is right for a sphere a few
 * hundred pixels across and wrong once the reader zooms into Tunisia: at
 * country scale a degree is around eighty pixels, the 110m Gulf of Gabès is a
 * straight line, and the detailed governorate borders visibly overshoot it.
 * 1:50m is accurate to a few pixels at that scale. Shipping all of it would add
 * 750KB to a view most visits never zoom into, so this cuts the region around
 * Tunisia out of it: the western and central Mediterranean, wide enough that a
 * desktop viewport at country scale never reaches the edge.
 *
 * The cut is in longitude and latitude. The box crosses no pole and no
 * antimeridian, so a planar clip is exact here. Land is clipped as polygons
 * (fill only, so the box edges are never drawn); the coastline and borders are
 * clipped as lines, so they end at the box rather than tracing it.
 *
 * Usage: chained into `npm run data` after build-world.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Position, Polygon, MultiPolygon, MultiLineString } from 'geojson';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ATLAS = join(ROOT, 'node_modules', 'world-atlas');
const STATIC_DIR = process.env.DT_STATIC_DIR ?? join(ROOT, 'static');

/** [west, south, east, north] in degrees. */
export const BOX: [number, number, number, number] = [-6, 24, 26, 46];

const round = (p: Position): Position => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];

/** Sutherland–Hodgman against one edge of the box. */
function clipEdge(ring: Position[], inside: (p: Position) => boolean, cut: (a: Position, b: Position) => Position) {
	const out: Position[] = [];
	for (let i = 0; i < ring.length; i++) {
		const cur = ring[i];
		const prev = ring[(i + ring.length - 1) % ring.length];
		if (inside(cur)) {
			if (!inside(prev)) out.push(cut(prev, cur));
			out.push(cur);
		} else if (inside(prev)) {
			out.push(cut(prev, cur));
		}
	}
	return out;
}

const atX = (x: number) => (a: Position, b: Position): Position => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const atY = (y: number) => (a: Position, b: Position): Position => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

export function clipRing(ring: Position[]): Position[] {
	const [w, s, e, n] = BOX;
	let r = ring.slice(0, -1);
	r = clipEdge(r, (p) => p[0] >= w, atX(w));
	r = clipEdge(r, (p) => p[0] <= e, atX(e));
	r = clipEdge(r, (p) => p[1] >= s, atY(s));
	r = clipEdge(r, (p) => p[1] <= n, atY(n));
	if (r.length < 3) return [];
	return [...r, r[0]].map(round);
}

const inBox = (p: Position) => p[0] >= BOX[0] && p[0] <= BOX[2] && p[1] >= BOX[1] && p[1] <= BOX[3];

/** Keeps the runs of a line that fall inside the box; a run ends at the edge. */
export function clipLine(line: Position[]): Position[][] {
	const runs: Position[][] = [];
	let run: Position[] = [];
	for (const p of line) {
		if (inBox(p)) run.push(round(p));
		else if (run.length) {
			if (run.length > 1) runs.push(run);
			run = [];
		}
	}
	if (run.length > 1) runs.push(run);
	return runs;
}

function main() {
	const landTopo = JSON.parse(readFileSync(join(ATLAS, 'land-50m.json'), 'utf8')) as Topology;
	const countryTopo = JSON.parse(readFileSync(join(ATLAS, 'countries-50m.json'), 'utf8')) as Topology;

	const land = feature(landTopo, landTopo.objects.land as GeometryCollection);
	const polys: Position[][][] = [];
	const coast: Position[][] = [];
	for (const f of land.features) {
		const g = f.geometry as Polygon | MultiPolygon;
		const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
		for (const poly of parts) {
			// The outer ring decides whether the polygon is in the box at all;
			// a hole whose outer ring was cut away has nothing to be a hole in.
			const outer = clipRing(poly[0]);
			if (outer.length >= 4) polys.push([outer, ...poly.slice(1).map(clipRing).filter((r) => r.length >= 4)]);
			for (const ring of poly) coast.push(...clipLine(ring));
		}
	}
	const inner = mesh(countryTopo, countryTopo.objects.countries as GeometryCollection, (a, b) => a !== b) as MultiLineString;
	const borders = inner.coordinates.flatMap(clipLine);

	const out = {
		source: 'Natural Earth 1:50m via world-atlas (public domain), clipped to the box',
		box: BOX,
		land: { type: 'MultiPolygon', coordinates: polys },
		coast: { type: 'MultiLineString', coordinates: coast },
		borders: { type: 'MultiLineString', coordinates: borders }
	};
	if (!existsSync(STATIC_DIR)) mkdirSync(STATIC_DIR, { recursive: true });
	const json = JSON.stringify(out);
	writeFileSync(join(STATIC_DIR, 'med-50m.json'), json, 'utf8');
	console.log(`  med-50m.json written: ${polys.length} land polygons, ${coast.length} coast runs, ${(json.length / 1024).toFixed(0)}KB`);
}

main();
