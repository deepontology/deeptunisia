/**
 * The Network scene, asserted on the record itself.
 *
 * The map is a pure function of (date, evidence floor, layers, tie families),
 * so its promises can be checked without a browser, at every date, in a few
 * seconds. Each assertion below is a property the reader relies on without
 * knowing it:
 *
 *   - nothing overlaps: no two boxes share space, and every seat sits inside
 *     its box and every box inside its lane;
 *   - holding office is never a line: no tie is a synthesised membership;
 *   - every line ends somewhere drawn, and runs vertically only in a gutter,
 *     so a line never crosses a box;
 *   - a person has exactly one seat their lines attach to;
 *   - a chamber's rank and file are counted, not drawn;
 *   - the matrix adds up to the map;
 *   - the same inputs always give the same picture;
 *   - the scene stays cheap enough to rebuild on every frame of playback.
 *
 *   npx tsx scripts/test-network-scene.ts
 */
import { buildScene, sceneAt, layerMatrix, GEO, type Scene } from '../src/lib/network/scene.ts';
import { routeTies } from '../src/lib/network/route.ts';
import { DEFAULT_FAMILIES, FAMILIES, familyOf, familiesFromMode, familiesParam, familiesFromParam } from '../src/lib/network/families.ts';
import { ds, LAYERS, CUTOFF, FLOOR, type Layer } from '../src/lib/model.ts';
import { terms, termAt } from '../src/lib/civic.ts';

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const ALL = new Set(LAYERS);
const EVERY = new Set(FAMILIES);
const at = (y: number, m = 0, d = 1) => Date.UTC(y, m, d);

console.log('\n  ── tie families ──\n');

ok('the default lens leaves out party rosters and measurements', !DEFAULT_FAMILIES.has('party') && !DEFAULT_FAMILIES.has('flows'));
ok(
	'every authored relationship type maps to a claim family, never to measurements',
	ds.relationships.every((r) => familyOf(r.type) !== 'flows'),
	[...new Set(ds.relationships.map((r) => `${r.type}→${familyOf(r.type)}`))].slice(0, 6).join(', ')
);
ok('the older ?mode=all link names every family', familiesFromMode('all')?.size === FAMILIES.length);
ok('the older ?mode=influence link is the default lens', familiesParam(familiesFromMode('influence')!) === null);
ok('a family set survives the URL round trip', familiesParam(familiesFromParam('money,courts')!) === 'money,courts');
ok('an unknown family in the URL is ignored, not invented', familiesFromParam('money,bogus')?.size === 1 && familiesFromParam('bogus') === null);

console.log('\n  ── geometry, at every year of the record ──\n');

/** Every year from the floor to the cutoff, plus the dates readers land on. */
const dates: number[] = [];
for (let y = new Date(FLOOR).getUTCFullYear(); y <= new Date(CUTOFF).getUTCFullYear(); y++) dates.push(Math.min(CUTOFF, at(y, 6)));
dates.push(at(2011, 0, 14), at(1987, 10, 8), at(2021, 6, 26), CUTOFF);

const overlaps: string[] = [];
const outside: string[] = [];
const loose: string[] = [];
const offGutter: string[] = [];
const memberships: string[] = [];
const doubleSeat: string[] = [];
const rankAndFile: string[] = [];
const matrixDrift: string[] = [];

function inGutter(scene: Scene, x: number): boolean {
	return scene.gutters.some((g) => x >= g - 0.2 && x <= g + GEO.GUT + 0.2);
}

/** Points of an orthogonal path, in order (M, L and the corner of each Q). */
function points(d: string): { x: number; y: number }[] {
	const out: { x: number; y: number }[] = [];
	const re = /([MLQ])([^MLQ]+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(d))) {
		const nums = m[2].trim().split(/[\s,]+/).map(Number);
		if (m[1] === 'Q') out.push({ x: nums[2], y: nums[3] });
		else out.push({ x: nums[0], y: nums[1] });
	}
	return out;
}

for (const t of dates) {
	for (const families of [DEFAULT_FAMILIES, EVERY]) {
		// Every other year of the full lens is laid out right to left, so the
		// mirrored geometry is held to the same rules.
		const rtl = families === EVERY && new Date(t).getUTCFullYear() % 2 === 0;
		const scene = buildScene({ t, floor: 'reported', layers: ALL, families, rtl });
		const day = new Date(t).toISOString().slice(0, 10) + (families === EVERY ? ' all' : '') + (rtl ? ' rtl' : '');

		// Boxes inside lanes, seats inside boxes, nothing overlapping.
		const byLane = new Map<Layer, typeof scene.units>();
		for (const u of scene.units) (byLane.get(u.layer) ?? byLane.set(u.layer, []).get(u.layer)!).push(u);
		for (const [layer, list] of byLane) {
			const i = scene.lanes.indexOf(layer);
			for (const u of list) {
				if (u.x < scene.laneX[i] - 0.5 || u.x + u.w > scene.laneX[i] + scene.laneW[i] + 0.5) outside.push(`${day} ${u.key}`);
				for (const s of u.seats) {
					if (s.x < u.x || s.x + s.w > u.x + u.w + 0.5 || s.y < u.y || s.y + GEO.ROW > u.y + u.h + 0.5) outside.push(`${day} ${s.key}`);
				}
			}
			for (let a = 0; a < list.length; a++) {
				for (let b = a + 1; b < list.length; b++) {
					const p = list[a];
					const q = list[b];
					if (p.x < q.x + q.w - 0.5 && q.x < p.x + p.w - 0.5 && p.y < q.y + q.h - 0.5 && q.y < p.y + p.h - 0.5) overlaps.push(`${day} ${p.key} × ${q.key}`);
				}
			}
		}

		// One primary seat per person.
		const primaries = new Map<string, number>();
		for (const u of scene.units) for (const s of u.seats) if (s.primary) primaries.set(s.person, (primaries.get(s.person) ?? 0) + 1);
		for (const [p, n] of primaries) if (n > 1) doubleSeat.push(`${day} ${p}×${n}`);

		// A chamber seats only members a drawn tie names.
		const endpoints = new Set(scene.ties.flatMap((e) => [e.rel.from, e.rel.to]));
		for (const u of scene.units) {
			if (u.kind !== 'chamber') continue;
			for (const s of u.seats) if (!endpoints.has(s.person)) rankAndFile.push(`${day} ${u.id} ${s.person}`);
		}

		// Ties: never a membership, always anchored, vertical only in gutters.
		const routes = routeTies(scene);
		for (const e of scene.ties) {
			if (e.id.startsWith('pos-') || e.rel.type === 'institutional-membership') memberships.push(`${day} ${e.id}`);
			if (!scene.anchors.has(e.rel.from) || !scene.anchors.has(e.rel.to)) loose.push(`${day} ${e.id}`);
			const r = routes.get(e.id);
			if (!r) {
				loose.push(`${day} ${e.id} (no route)`);
				continue;
			}
			const pts = points(r.d);
			for (let k = 1; k < pts.length; k++) {
				const a = pts[k - 1];
				const b = pts[k];
				if (Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) > 1 && !inGutter(scene, a.x)) {
					offGutter.push(`${day} ${e.id} x=${a.x}`);
					break;
				}
			}
		}

		// The matrix counts exactly the authored ties the map draws.
		const m = layerMatrix(scene);
		const sum = m.cells.reduce((a, c) => a + c.count, 0);
		if (sum !== scene.stats.ties) matrixDrift.push(`${day} matrix ${sum} vs map ${scene.stats.ties}`);
	}
}

ok('no two boxes in a lane overlap, at any year', overlaps.length === 0, overlaps.slice(0, 3).join(' | ') || `${dates.length * 2} scenes`);
ok('every box sits in its lane and every seat in its box', outside.length === 0, outside.slice(0, 3).join(' | '));
ok('holding office is never drawn as a line', memberships.length === 0, memberships.slice(0, 3).join(' | '));
ok('every line ends at something drawn', loose.length === 0, loose.slice(0, 3).join(' | '));
ok('lines run vertically only inside gutters, so they never cross a box', offGutter.length === 0, offGutter.slice(0, 3).join(' | '));
ok('a person has one seat their lines attach to', doubleSeat.length === 0, doubleSeat.slice(0, 3).join(' | '));
ok("a chamber's rank and file are counted, not seated", rankAndFile.length === 0, rankAndFile.slice(0, 3).join(' | '));
ok('the layer matrix adds up to the ties on the map', matrixDrift.length === 0, matrixDrift.slice(0, 3).join(' | '));

console.log('\n  ── the date readers land on: 14 January 2011 ──\n');
{
	const t = at(2011, 0, 14);
	const scene = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const term = termAt(t, 'lower');
	const chamber = term ? scene.units.find((u) => u.id === term.institution.id) : undefined;
	ok('the sitting chamber is one box with its seat bar', !!chamber && chamber.kind === 'chamber' && !!chamber.chamber && chamber.chamber.named > 100, chamber ? `${chamber.id}: ${chamber.chamber?.named} of ${chamber.chamber?.seats}` : 'missing');
	ok('no past chamber is drawn', scene.units.every((u) => !u.id || !terms.some((x) => x.institution.id === u.id) || u.kind === 'chamber'));
	ok('the default map draws a readable number of lines', scene.ties.length < 250, `${scene.ties.length} ties (the old map drew 349 lines here)`);
	ok('party ties are counted, not drawn, under the default lens', (scene.stats.notShown.get('party') ?? 0) > 0 && scene.ties.every((e) => e.family !== 'party'));

	const withParty = buildScene({ t, floor: 'reported', layers: ALL, families: new Set([...DEFAULT_FAMILIES, 'party' as const]) });
	const bundles = withParty.ties.filter((e) => e.bundle);
	const sitting = new Set([termAt(t, 'lower'), termAt(t, 'upper')].filter(Boolean).map((x) => x!.institution.id));
	ok(
		'turning on party ties bundles the rank and file per chamber and party',
		bundles.length > 0 && bundles.every((e) => sitting.has(e.rel.from)) && new Set(bundles.map((e) => e.id)).size === bundles.length,
		`${bundles.length} bundles from ${[...sitting].join(' and ')}, ${bundles.reduce((a, e) => a + (e.bundle ?? 0), 0)} ties`
	);

	const a = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const b = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const sig = (s: Scene) => JSON.stringify([s.units.map((u) => [u.key, u.x, u.y, u.h, u.seats.map((x) => x.key)]), s.ties.map((e) => e.id)]);
	ok('the same inputs give the same picture', sig(a) === sig(b));

	// Scrubbing reuses the scene while nothing in the record changes.
	// (On a quiet day: 14 January 2011 itself is the day records change.)
	const quiet = at(1995, 5, 10);
	const s1 = sceneAt({ t: quiet, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const s2 = sceneAt({ t: quiet + 3_600_000, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const s3 = sceneAt({ t: quiet + 3_600_000, floor: 'reported', layers: ALL, families: EVERY });
	ok('an unchanged record hands back the same scene object', s1 === s2);
	ok('a changed lens builds a new scene', s3 !== s2 && s3.ties.length >= s2.ties.length);
	const s4 = sceneAt({ t: at(2025, 10, 19), floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	ok('a different record builds a new scene', s4 !== s1 && sig(s4) !== sig(s1));

	const documented = buildScene({ t, floor: 'documented', layers: ALL, families: DEFAULT_FAMILIES });
	ok('raising the evidence floor only removes', documented.ties.length <= scene.ties.length && documented.ties.every((e) => e.rel.basis === 'documented' || e.measurement || e.bundle), `${scene.ties.length} → ${documented.ties.length}`);

	const solo = buildScene({ t, floor: 'reported', layers: new Set<Layer>(['economic']), families: DEFAULT_FAMILIES });
	ok('soloing a layer draws only that lane', solo.lanes.length === 1 && solo.units.every((u) => u.layer === 'economic') && solo.ties.every((e) => !e.crossLayer));

	const rtl = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES, rtl: true });
	ok('right-to-left reading mirrors the lane order', rtl.lanes[0] === scene.lanes[scene.lanes.length - 1]);
}

console.log('\n  ── cost ──\n');
{
	// Playback advances the clock every frame, so the scene and its routes are
	// rebuilt per frame. Budget generously against slow CI machines; the real
	// figure is printed so a regression is visible long before it fails.
	const sample = dates.filter((_, i) => i % 3 === 0);
	buildScene({ t: sample[0], floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const t0 = performance.now();
	for (const t of sample) routeTies(buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES }));
	const per = (performance.now() - t0) / sample.length;
	ok('a scene and its routes build within a frame budget', per < 25, `${per.toFixed(1)} ms per date over ${sample.length} dates`);
}

console.log(`\n   ${checks - failures}/${checks} checks passed\n`);
if (failures) process.exit(1);
