/**
 * The dot view of a network scene: the same record, lanes and ties as the
 * seating chart, drawn as a node-link diagram.
 *
 * The seating chart answers "who sits where" and spends no ink on holding
 * office. This view puts that ink back, because it is the picture of the
 * system: each institution is a square with its people around it on rings,
 * joined by a spoke, and a person who also holds a post elsewhere sends a
 * second, longer spoke across to that institution. Claims (appointments,
 * ownership, family, prosecutions) are the curved lines between dots, in the
 * same basis vocabulary as the map.
 *
 * It stays readable for the reasons the map does. It is built from the
 * scene, so the tie families thin it the same way, a chamber's rank and file
 * stay a count (a ring of seat colours around the chamber's square) rather
 * than two hundred dots, and only people a drawn tie or post names are on
 * it. Positions are a pure function of the scene, so switching views or
 * scrubbing the clock never moves a dot that did not change.
 */

import type { Basis, Layer } from '$lib/model';
import { personById } from '$lib/model';
import { GEO, type ChamberInfo, type Scene, type Tie, type Unit } from './scene';

export const DOT = {
	/** Ring radii: the first ring around a square, and the step between rings. */
	R0: 19,
	RSTEP: 13,
	/** Space along a ring per dot. */
	PITCH: 12.5,
	/** A chamber's seat ring: inner radius and thickness. */
	DONUT: 11,
	DONUT_W: 4.5,
	/** Cluster label block under a cluster: two lines. */
	LABEL: 38,
	/** Narrowest cluster cell, so its two-line label has room. */
	CELL_MIN: 112,
	CELL_GAP: 8,
	/** Row pitch of the list sections (counterparties, outside office). */
	ROW: 20
} as const;

export interface DotPerson {
	id: string;
	layer: Layer;
	x: number;
	y: number;
	r: number;
	basis: Basis;
	/** Which side of the dot its name goes on. */
	side: 'l' | 'r';
	/** No post: drawn because a tie names them. */
	outside: boolean;
}

export interface DotCluster {
	key: string;
	id: string;
	layer: Layer;
	/** The cell. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** The square at the centre. */
	cx: number;
	cy: number;
	/** Outer radius of the rings. */
	R: number;
	chamber?: ChamberInfo;
	/** People seated here (their primary post). */
	people: number;
	/** Every post held here, primary or not. */
	posts: number;
}

/** An institution drawn only for a tie, or a counterparty in the foreign register. */
export interface DotRow {
	key: string;
	id: string | null;
	kind: 'chip' | 'register' | 'outside';
	layer: Layer;
	x: number;
	y: number;
	w: number;
	/** For outside office: the person. */
	person?: string;
}

export interface DotHead {
	key: string;
	layer: Layer;
	group: string;
	x: number;
	y: number;
	w: number;
	count: number;
}

export interface Spoke {
	key: string;
	inst: string;
	person: string;
	layer: Layer;
	basis: Basis;
	/** A post that is not the person's most senior: drawn to wherever they sit. */
	secondary: boolean;
	d: string;
}

export interface DotScene {
	width: number;
	height: number;
	heads: DotHead[];
	clusters: DotCluster[];
	people: DotPerson[];
	rows: DotRow[];
	spokes: Spoke[];
	/** Where every drawn entity is: centre and radius. */
	pos: Map<string, { x: number; y: number; r: number; layer: Layer }>;
	/** Each tie's curve and its midpoint (where a card opens). */
	paths: Map<string, { d: string; mid: { x: number; y: number } }>;
}

/** A person's dot grows a little with the most senior post they ever held. */
function dotR(id: string): number {
	const a = personById.get(id)?.peakAuthority ?? 40;
	return 3.4 + Math.min(1, Math.max(0, a / 100)) * 2.4;
}

/**
 * How many dots fit on ring i, and its radius. A chamber's first ring sits
 * outside its seat ring; one, two or three people sit close to their square.
 */
function ring(i: number, donut: boolean, few: boolean): { r: number; cap: number } {
	const r0 = donut ? DOT.R0 + 4 : few ? 13 : DOT.R0;
	const r = r0 + i * DOT.RSTEP;
	return { r, cap: Math.max(few ? 3 : 6, Math.floor((2 * Math.PI * r) / DOT.PITCH)) };
}

function ringsFor(n: number, donut: boolean): { r: number; count: number }[] {
	const out: { r: number; count: number }[] = [];
	let left = n;
	for (let i = 0; left > 0; i++) {
		const { r, cap } = ring(i, donut, n <= 3);
		const count = Math.min(cap, left);
		out.push({ r, count });
		left -= count;
	}
	return out;
}

const f1 = (v: number) => Math.round(v * 10) / 10;

/**
 * A curved line from one dot to another.
 *
 * Between lanes it leaves and arrives horizontally (an S), so a bridge reads
 * as travel from one layer to the next. Inside a lane it bows outward to the
 * right of both ends, far enough that it clears the dots between them.
 */
export function curve(
	a: { x: number; y: number },
	b: { x: number; y: number },
	sameLane: boolean,
	bowLeft = false
): { d: string; mid: { x: number; y: number } } {
	if (!sameLane) {
		const dx = b.x - a.x;
		const c = Math.max(28, Math.abs(dx) * 0.42) * Math.sign(dx || 1);
		return {
			d: `M${f1(a.x)},${f1(a.y)} C${f1(a.x + c)},${f1(a.y)} ${f1(b.x - c)},${f1(b.y)} ${f1(b.x)},${f1(b.y)}`,
			mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
		};
	}
	const dy = Math.abs(b.y - a.y);
	const off = 14 + Math.min(56, dy * 0.12);
	const edge = bowLeft ? Math.min(a.x, b.x) - off : Math.max(a.x, b.x) + off;
	return {
		d: `M${f1(a.x)},${f1(a.y)} C${f1(edge)},${f1(a.y)} ${f1(edge)},${f1(b.y)} ${f1(b.x)},${f1(b.y)}`,
		mid: { x: 0.125 * (a.x + b.x) + 0.75 * edge, y: (a.y + b.y) / 2 }
	};
}

export function buildDots(scene: Scene, rtl = false): DotScene {
	const heads: DotHead[] = [];
	const clusters: DotCluster[] = [];
	const people: DotPerson[] = [];
	const rows: DotRow[] = [];
	const pos: DotScene['pos'] = new Map();
	const secondaries: { unit: Unit; person: string; basis: Basis }[] = [];
	let height = 0;

	const headCount = new Map(scene.heads.map((h) => [h.key, h.count]));

	scene.lanes.forEach((layer, li) => {
		const x0 = scene.laneX[li];
		const LW = scene.laneW[li];
		const units = scene.units.filter((u) => u.layer === layer);
		let y = GEO.TOP;
		let group: string | null = null;

		// Items of a lane are laid out left to right; mirrored for RTL at the end.
		const laneClusters: DotCluster[] = [];
		const lanePeople: DotPerson[] = [];
		const laneRows: DotRow[] = [];

		/** Flow-pack a run of clusters into rows of cells, each row filling the lane. */
		const packClusters = (list: Unit[]) => {
			const cells = list.map((u) => {
				const own = u.seats.filter((s) => s.primary);
				const donut = !!u.chamber;
				const rings = ringsFor(own.length, donut);
				const inner = donut ? DOT.DONUT + DOT.DONUT_W + 3 : 9;
				const R = rings.length ? rings[rings.length - 1].r + 6 : inner;
				return { u, own, rings, R, w: Math.max(DOT.CELL_MIN, 2 * R + 14), h: 2 * R + 8 + DOT.LABEL };
			});
			let i = 0;
			while (i < cells.length) {
				let used = 0;
				const row: typeof cells = [];
				while (i < cells.length && (row.length === 0 || used + DOT.CELL_GAP + cells[i].w <= LW)) {
					used += (row.length ? DOT.CELL_GAP : 0) + cells[i].w;
					row.push(cells[i]);
					i++;
				}
				// Share what is left of the row, so a row of cells spans the lane.
				const extra = row.length > 0 ? Math.max(0, LW - used) / row.length : 0;
				const rowH = Math.max(...row.map((c) => c.h));
				let cx = x0;
				for (const c of row) {
					const w = c.w + extra;
					const cell: DotCluster = {
						key: 'dc:' + c.u.key,
						id: c.u.id!,
						layer,
						x: cx,
						y,
						w,
						h: rowH,
						cx: cx + w / 2,
						cy: y + 4 + c.R,
						R: c.R,
						chamber: c.u.chamber,
						people: c.own.length,
						posts: c.u.seats.length
					};
					laneClusters.push(cell);
					// People on rings, most senior first, starting at twelve o'clock.
					let k = 0;
					c.rings.forEach((rg, ri) => {
						const offset = ri % 2 ? Math.PI / rg.count : 0;
						for (let j = 0; j < rg.count; j++, k++) {
							const s = c.own[k];
							const ang = -Math.PI / 2 + offset + (2 * Math.PI * j) / rg.count;
							const px = cell.cx + Math.cos(ang) * rg.r;
							lanePeople.push({
								id: s.person,
								layer,
								x: px,
								y: cell.cy + Math.sin(ang) * rg.r,
								r: dotR(s.person),
								basis: ((s.position?.basis ?? 'documented') as Basis) || 'documented',
								side: Math.cos(ang) < -0.2 ? 'l' : 'r',
								outside: false
							});
						}
					});
					for (const s of c.u.seats) {
						if (!s.primary) secondaries.push({ unit: c.u, person: s.person, basis: (s.position?.basis ?? 'documented') as Basis });
					}
					cx += w + DOT.CELL_GAP;
				}
				y += rowH + DOT.CELL_GAP;
			}
		};

		/** A list section: squares or hollow dots with their names, in columns. */
		const packRows = (list: Unit[]) => {
			for (const u of list) {
				if (u.kind === 'actors') {
					const cols = Math.max(1, Math.min(u.cols, Math.floor(LW / 140)));
					const rowsN = Math.ceil(u.seats.length / cols);
					const cw = LW / cols;
					u.seats.forEach((s, i) => {
						const rx = x0 + Math.floor(i / rowsN) * cw;
						const ry = y + (i % rowsN) * DOT.ROW;
						laneRows.push({ key: 'do:' + s.person, id: null, kind: 'outside', layer, x: rx, y: ry, w: cw, person: s.person });
						lanePeople.push({
							id: s.person,
							layer,
							x: rx + 8,
							y: ry + DOT.ROW / 2,
							r: dotR(s.person),
							basis: 'documented',
							side: 'r',
							outside: true
						});
					});
					y += rowsN * DOT.ROW + 6;
				}
			}
			const flat = list.filter((u) => u.kind === 'chip' || u.kind === 'register');
			if (!flat.length) return;
			const register = flat[0].kind === 'register';
			const perRow = register ? 1 : Math.max(1, Math.floor(LW / 150));
			const cw = LW / perRow;
			flat.forEach((u, i) => {
				laneRows.push({
					key: 'dr:' + u.key,
					id: u.id,
					kind: register ? 'register' : 'chip',
					layer,
					x: x0 + (i % perRow) * cw,
					y: y + Math.floor(i / perRow) * DOT.ROW,
					w: cw
				});
			});
			y += Math.ceil(flat.length / perRow) * DOT.ROW + 6;
		};

		// Walk the lane's units in the scene's order, a group at a time.
		let run: Unit[] = [];
		const flush = () => {
			if (!run.length) return;
			packClusters(run.filter((u) => u.kind === 'office' || u.kind === 'chamber'));
			packRows(run.filter((u) => u.kind !== 'office' && u.kind !== 'chamber'));
			run = [];
		};
		for (const u of units) {
			if (u.group !== group) {
				flush();
				if (group !== null) y += GEO.GROUP_GAP - DOT.CELL_GAP;
				group = u.group;
				const hk = u.kind === 'actors' ? layer + ':outside' : layer + ':' + u.group;
				heads.push({ key: 'dh:' + hk, layer, group: u.kind === 'actors' ? '' : u.group, x: x0, y, w: LW, count: headCount.get(hk) ?? 0 });
				y += GEO.GROUP;
			}
			run.push(u);
		}
		flush();
		height = Math.max(height, y);

		if (rtl) {
			const mx = (x: number) => 2 * x0 + LW - x;
			for (const c of laneClusters) {
				c.x = x0 + LW - (c.x - x0) - c.w;
				c.cx = mx(c.cx);
			}
			for (const p of lanePeople) {
				p.x = mx(p.x);
				p.side = p.side === 'l' ? 'r' : 'l';
			}
			for (const r of laneRows) r.x = x0 + LW - (r.x - x0) - r.w;
		}

		clusters.push(...laneClusters);
		people.push(...lanePeople);
		rows.push(...laneRows);
	});

	for (const c of clusters) pos.set(c.id, { x: c.cx, y: c.cy, r: c.chamber ? DOT.DONUT : 6, layer: c.layer });
	for (const r of rows) {
		if (r.id) pos.set(r.id, { x: rtlRowX(r, rtl), y: r.y + DOT.ROW / 2, r: 4, layer: r.layer });
	}
	for (const p of people) pos.set(p.id, { x: p.x, y: p.y, r: p.r, layer: p.layer });

	// Spokes: a straight one from each square to the people seated around it,
	// and a curve to wherever a person sits for each of their other posts.
	const spokes: Spoke[] = [];
	const clusterOf = new Map(clusters.map((c) => [c.id, c]));
	for (const p of people) {
		if (p.outside) continue;
		const u = scene.unitOf.get(p.id);
		const c = u?.id ? clusterOf.get(u.id) : undefined;
		if (!c) continue;
		spokes.push({
			key: 'sp:' + c.id + ':' + p.id,
			inst: c.id,
			person: p.id,
			layer: p.layer,
			basis: p.basis,
			secondary: false,
			d: `M${f1(c.cx)},${f1(c.cy)} L${f1(p.x)},${f1(p.y)}`
		});
	}
	for (const s of secondaries) {
		const c = clusterOf.get(s.unit.id!);
		const at = pos.get(s.person);
		if (!c || !at) continue;
		const same = at.layer === c.layer;
		spokes.push({
			key: 'sp2:' + c.id + ':' + s.person,
			inst: c.id,
			person: s.person,
			layer: c.layer,
			basis: s.basis,
			secondary: true,
			d: curve({ x: c.cx, y: c.cy }, at, same, rtl).d
		});
	}

	// Ties: the same set the map draws, between dots.
	const paths: DotScene['paths'] = new Map();
	for (const e of scene.ties) {
		const a = pos.get(e.a.id) ?? anchorPoint(e.a);
		const b = pos.get(e.b.id) ?? anchorPoint(e.b);
		paths.set(e.id, curve(a, b, e.a.lane === e.b.lane, rtl));
	}

	return {
		width: scene.width,
		height: Math.max(height, GEO.TOP + 200) + GEO.BOTTOM,
		heads,
		clusters,
		people,
		rows,
		spokes,
		pos,
		paths
	};
}

/** Where a list row's square sits: at its reading start. */
function rtlRowX(r: DotRow, rtl: boolean): number {
	return rtl ? r.x + r.w - 8 : r.x + 8;
}

function anchorPoint(a: Tie['a']): { x: number; y: number } {
	return { x: (a.xl + a.xr) / 2, y: a.y };
}

const memo = new WeakMap<Scene, Map<string, DotScene>>();

/** The dot view of a scene, built once per scene object (and reading direction). */
export function dotsAt(scene: Scene, rtl = false): DotScene {
	let m = memo.get(scene);
	if (!m) memo.set(scene, (m = new Map()));
	const k = rtl ? 'rtl' : 'ltr';
	let d = m.get(k);
	if (!d) m.set(k, (d = buildDots(scene, rtl)));
	return d;
}
