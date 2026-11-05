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
 *   - the dot view draws everyone the map seats, once each, with every tie
 *     between two drawn dots and no two clusters overlapping;
 *   - a wide screen's stretched lanes keep every one of these promises;
 *   - the scene stays cheap enough to rebuild on every frame of playback.
 *
 *   npx tsx scripts/test-network-scene.ts
 */
import { buildScene, sceneAt, layerMatrix, laneFrames, GEO, WIDEN_MAX, type Scene } from '../src/lib/network/scene.ts';
import { buildDots, dotsAt } from '../src/lib/network/dots.ts';
import { routeTies } from '../src/lib/network/route.ts';
import { DEFAULT_FAMILIES, FAMILIES, familyOf, familiesFromMode, familiesParam, familiesFromParam } from '../src/lib/network/families.ts';
import { ds, institutionById, activity, meetsBasis, LAYERS, CUTOFF, FLOOR, type Layer } from '../src/lib/model.ts';
import { terms, termAt, seatedAt, membersAt, chamberStanding } from '../src/lib/civic.ts';

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
ok('switching every family off survives the URL round trip', familiesParam(new Set()) === '' && familiesFromParam(familiesParam(new Set())!)?.size === 0);

console.log('\n  ── geometry, at every year of the record ──\n');

/** Every year from the floor to the cutoff, plus the dates readers land on. */
const dates: number[] = [];
for (let y = new Date(FLOOR).getUTCFullYear(); y <= new Date(CUTOFF).getUTCFullYear(); y++) dates.push(Math.min(CUTOFF, at(y, 6)));
dates.push(at(2011, 0, 14), at(1987, 10, 8), at(2021, 6, 26), CUTOFF);

const overlaps: string[] = [];
const outside: string[] = [];
const loose: string[] = [];
const offGutter: string[] = [];
const cardOffGutter: string[] = [];
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
		// The other years are laid out on a wide screen's stretched lanes.
		const rtl = families === EVERY && new Date(t).getUTCFullYear() % 2 === 0;
		const widen = families === EVERY && !rtl ? 1.5 : 1;
		const scene = buildScene({ t, floor: 'reported', layers: ALL, families, rtl, widen });
		const day =
			new Date(t).toISOString().slice(0, 10) + (families === EVERY ? ' all' : '') + (rtl ? ' rtl' : '') + (widen > 1 ? ' wide' : '');

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

		// A chamber seats its officers, and otherwise only members a drawn tie names.
		const endpoints = new Set(scene.ties.flatMap((e) => [e.rel.from, e.rel.to]));
		for (const u of scene.units) {
			if (u.kind !== 'chamber') continue;
			for (const s of u.seats) if (!s.position && !endpoints.has(s.person)) rankAndFile.push(`${day} ${u.id} ${s.person}`);
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
			if (!inGutter(scene, r.mid.x)) cardOffGutter.push(`${day} ${e.id} x=${r.mid.x}`);
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
ok('lines run vertically only inside gutters; a bridge between distant lanes crosses behind their boxes', offGutter.length === 0, offGutter.slice(0, 3).join(' | '));
ok('a connection card anchors in a gutter, never over a box', cardOffGutter.length === 0, cardOffGutter.slice(0, 3).join(' | '));
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
	const upper = termAt(t, 'upper');
	const speaker = upper ? scene.units.find((u) => u.id === upper.institution.id)?.seats.find((x) => x.person === 'abdallah-kallel') : undefined;
	ok("a chamber's officers sit in it like any office", !!speaker && !!speaker.position && speaker.primary, speaker ? `${speaker.person} as ${speaker.position?.roleTitle}` : 'the upper chamber president is missing');
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

{
	// A group's chair is a claim: drawn, bundled or counted, never silently dropped.
	// Checked per tie, for every chair and vice-chair tie in play on the date.
	const t = at(2024, 0, 1);
	const isGroup = (id: string) => institutionById.get(id)?.type === 'parliamentary-group';
	const chairRel = (r: (typeof ds.relationships)[number]) => /parliamentary group (vice-)?chair/.test(r.subtype ?? '') && (isGroup(r.from) || isGroup(r.to));
	const on = buildScene({ t, floor: 'reported', layers: ALL, families: EVERY });
	const off = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const inPlay = ds.relationships.filter((r) => chairRel(r) && activity(r.interval, t) > 0 && meetsBasis(r.basis as never, 'reported'));
	const drawn = new Set(on.ties.map((e) => e.rel.id));
	const bundledTo = new Set(on.ties.filter((e) => e.bundle).map((e) => e.rel.to));
	const lost = inPlay.filter((r) => !drawn.has(r.id) && !bundledTo.has(isGroup(r.to) ? r.to : r.from));
	ok(
		"every parliamentary group chair tie in play is drawn or bundled, and counted when party is off",
		inPlay.length > 0 && lost.length === 0 && (off.stats.notShown.get('party') ?? 0) >= inPlay.length,
		`${inPlay.length} chair ties in play in 2024${lost.length ? ', lost: ' + lost.map((r) => r.id).join(', ') : ''}`
	);
}

{
	// The memo never serves a stale picture: scrubbing day by day through the
	// memo gives what a fresh build gives, across the fuzzy-date boundaries
	// where a chamber's possible members become certain.
	const stale: string[] = [];
	const look = (s: Scene) =>
		JSON.stringify([
			s.units.map((u) => [u.key, u.x, u.y, u.h, u.seats.map((x) => x.key), u.chamber?.named, u.chamber?.uncertain, u.chamber?.withheld, u.chamber?.groups.map((g) => g.id + ':' + g.n)]),
			s.ties.map((e) => e.id)
		]);
	// Both floors: the seat bar's group colours are not filtered by the floor.
	// The 2019 window crosses the day the 2019 Assembly's groups were formed.
	const days: number[] = [];
	for (const y of [2011, 2013, 2015, 2017, 2020, 2024]) for (let d = 0; d < 60; d += 3) days.push(Date.UTC(y, 0, 1 + d));
	for (let d = 0; d < 20; d++) days.push(Date.UTC(2019, 10, 15 + d));
	for (const floor of ['reported', 'documented'] as const) {
		for (const t of days) {
			const input = { t, floor, layers: ALL, families: DEFAULT_FAMILIES };
			if (look(sceneAt(input)) !== look(buildScene(input))) stale.push(`${new Date(t).toISOString().slice(0, 10)} ${floor}`);
		}
	}
	ok('scrubbing through the memo matches a fresh build on every day', stale.length === 0, stale.slice(0, 4).join(', ') || `${days.length * 2} days`);
}

{
	// A flow whose value changes is a different picture, even with the same id.
	const t = at(2011, 0, 14);
	const flow = (value: number) => [{ id: 'flow-trade-2011-FR', to: 'etat-tunisien', type: 'trade', subtype: 'exports', description: 'test', value }];
	const a = sceneAt({ t, floor: 'reported', layers: ALL, families: EVERY, flows: flow(100) as never });
	const b = sceneAt({ t, floor: 'reported', layers: ALL, families: EVERY, flows: flow(200) as never });
	ok('the memo rebuilds when only a flow value changes', a !== b);
}

{
	// One person's standing in a chamber agrees with the chamber's counts.
	const t = Date.UTC(2011, 11, 1);
	const bribech = chamberStanding('habib-bribech', t, 'reported');
	ok('a year-only member of an overflowing chamber is possibly sitting, not below the floor', bribech?.standing === 'uncertain', `habib-bribech on 2011-12-01: ${bribech?.standing ?? 'not a member'}`);
	const term = termAt(t, 'lower')!;
	const everyone = membersAt(term, t);
	const lines: string[] = [];
	let agree = true;
	for (const floor of ['reported', 'documented'] as const) {
		const s = seatedAt(term, t, floor);
		const tally = { counted: 0, uncertain: 0, withheld: 0 };
		for (const m of everyone) tally[chamberStanding(m.position.holder, t, floor)!.standing]++;
		agree &&= tally.counted === s.members.length && tally.uncertain === s.uncertain && tally.withheld === s.withheld;
		lines.push(`${floor}: ${tally.counted} counted, ${tally.uncertain} possibly sitting, ${tally.withheld} withheld`);
	}
	ok("each member's standing adds up to the chamber's own counts", agree, lines.join('; '));
}

console.log('\n  ── the dot view ──\n');
{
	const dOutside: string[] = [];
	const dOverlap: string[] = [];
	const dMissing: string[] = [];
	const dTwice: string[] = [];
	const dLoose: string[] = [];
	const dRing: string[] = [];
	for (const t of dates) {
		for (const families of [DEFAULT_FAMILIES, EVERY]) {
			const rtl = families === EVERY && new Date(t).getUTCFullYear() % 2 === 1;
			// Stretched lanes keep every dot invariant too: a third of the default-lens years run wide.
			const widen = families === DEFAULT_FAMILIES && new Date(t).getUTCFullYear() % 3 === 0 ? 1.5 : 1;
			const scene = buildScene({ t, floor: 'reported', layers: ALL, families, rtl, widen });
			const dots = buildDots(scene, rtl);
			const day = new Date(t).toISOString().slice(0, 10) + (families === EVERY ? ' all' : '') + (rtl ? ' rtl' : '') + (widen > 1 ? ' wide' : '');

			// Cells and rows stay in their lane and never share space.
			const boxes = [
				...dots.clusters.map((c) => ({ key: c.key, layer: c.layer, x: c.x, y: c.y, w: c.w, h: c.h })),
				...dots.rows.map((r) => ({ key: r.key, layer: r.layer, x: r.x, y: r.y, w: r.w, h: 20 }))
			];
			for (const b of boxes) {
				const i = scene.lanes.indexOf(b.layer);
				if (b.x < scene.laneX[i] - 0.5 || b.x + b.w > scene.laneX[i] + scene.laneW[i] + 0.5) dOutside.push(`${day} ${b.key}`);
			}
			for (let a = 0; a < boxes.length; a++) {
				for (let b = a + 1; b < boxes.length; b++) {
					const p = boxes[a];
					const q = boxes[b];
					if (p.layer !== q.layer) continue;
					if (p.x < q.x + q.w - 0.5 && q.x < p.x + p.w - 0.5 && p.y < q.y + q.h - 0.5 && q.y < p.y + p.h - 0.5) dOverlap.push(`${day} ${p.key} × ${q.key}`);
				}
			}
			// A person's dot sits on its cluster's rings, inside its cell.
			const cellOf = new Map(dots.clusters.map((c) => [c.id, c]));
			for (const p of dots.people) {
				if (p.outside) continue;
				const u = scene.unitOf.get(p.id);
				const c = u?.id ? cellOf.get(u.id) : undefined;
				if (!c || Math.hypot(p.x - c.cx, p.y - c.cy) > c.R + 0.5 || p.x < c.x || p.x > c.x + c.w) dRing.push(`${day} ${p.id}`);
			}
			// Everyone the map seats is a dot, once.
			const seen = new Map<string, number>();
			for (const p of dots.people) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
			for (const [id, n] of seen) if (n > 1) dTwice.push(`${day} ${id}×${n}`);
			for (const u of scene.units) {
				if (u.id && !dots.pos.has(u.id)) dMissing.push(`${day} ${u.id}`);
				for (const s of u.seats) if (s.primary && !seen.has(s.person)) dMissing.push(`${day} ${s.person}`);
			}
			// Every tie and every spoke runs between two drawn dots.
			for (const e of scene.ties) {
				if (!dots.paths.has(e.id) || !dots.pos.has(e.rel.from) || !dots.pos.has(e.rel.to)) dLoose.push(`${day} ${e.id}`);
			}
			for (const sp of dots.spokes) if (!dots.pos.has(sp.inst) || !dots.pos.has(sp.person)) dLoose.push(`${day} ${sp.key}`);
		}
	}
	ok('dot clusters and rows stay inside their lane', dOutside.length === 0, dOutside.slice(0, 3).join('; '));
	ok('no two dot cells overlap', dOverlap.length === 0, dOverlap.slice(0, 3).join('; '));
	ok('each person sits on the rings of the institution of their primary post', dRing.length === 0, dRing.slice(0, 3).join('; '));
	ok('everyone and every institution the map draws is a dot', dMissing.length === 0, dMissing.slice(0, 3).join('; '));
	ok('a person is one dot', dTwice.length === 0, dTwice.slice(0, 3).join('; '));
	ok('every tie and every post runs between two drawn dots', dLoose.length === 0, dLoose.slice(0, 3).join('; '));

	const t = at(2011, 0, 14);
	const a = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const posts = buildDots(a).spokes.filter((sp) => !sp.secondary).length;
	const seated = a.units.flatMap((u) => u.seats.filter((s) => s.primary && u.kind !== 'actors')).length;
	ok('every seated person has a spoke to their institution', posts === seated, `${posts} spokes, ${seated} seated`);
	ok('the dot view is a pure function of the scene', JSON.stringify([...buildDots(a).pos]) === JSON.stringify([...buildDots(a).pos]));
	ok('the dot view is built once per scene', dotsAt(a) === dotsAt(a));
	const rtlScene = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES, rtl: true });
	const rtlDots = buildDots(rtlScene, true);
	const ltrDots = buildDots(a);
	/** In the first row holding two clusters, does the first sit to the left of the second? */
	const firstLeft = (d: typeof ltrDots) => {
		for (let i = 0; i + 1 < d.clusters.length; i++) {
			const p = d.clusters[i];
			const q = d.clusters[i + 1];
			if (p.layer === q.layer && p.y === q.y) return p.cx < q.cx;
		}
		return null;
	};
	ok("right to left, a row of clusters starts at the reading start", firstLeft(ltrDots) === true && firstLeft(rtlDots) === false);

	const sample = dates.filter((_, i) => i % 3 === 0).map((d) => buildScene({ t: d, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES }));
	const t0 = performance.now();
	for (const sc of sample) buildDots(sc);
	const per = (performance.now() - t0) / sample.length;
	ok('the dot view builds within a frame budget', per < 12, `${per.toFixed(2)} ms per date`);
}

console.log('\n  ── wide screens ──\n');
{
	const t = at(2011, 0, 14);
	const base = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES });
	const wide = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES, widen: 1.5 });
	ok('a wide screen stretches the lanes, not the gutters', wide.width > base.width && wide.gutters.length === base.gutters.length && laneFrames(base.lanes, 1.5).width === wide.width);
	const cols = (sc: Scene) => sc.units.reduce((n, u) => n + u.cols, 0);
	ok('stretched lanes give names more room, never less', cols(wide) >= cols(base) || wide.units.every((u) => u.seats.every((s) => s.w >= 110)));
	const capped = buildScene({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES, widen: 9 });
	ok('the stretch is capped', capped.width === laneFrames(base.lanes, WIDEN_MAX).width);
	ok('a different stretch is a different scene', sceneAt({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES, widen: 1.25 }) !== sceneAt({ t, floor: 'reported', layers: ALL, families: DEFAULT_FAMILIES }));
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
