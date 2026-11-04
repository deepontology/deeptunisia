/**
 * Where a tie's line runs.
 *
 * Lines never cross a box. Every tie leaves its endpoint horizontally into a
 * gutter (the channel between two lanes), runs vertically there, and enters
 * the other endpoint horizontally. A tie between two lanes that are not
 * neighbours crosses the lanes between them once, behind their boxes, at the
 * midpoint of its two ends. A tie inside one lane runs as a bracket in
 * whichever of the lane's two gutters is less busy along its span, so a lane
 * with many ties inside it (the business families and their companies) splits
 * them across both sides instead of piling them into one channel.
 *
 * GUTTER TRACKS
 *
 * Two vertical runs in one gutter whose spans overlap would draw on top of
 * each other and read as one line. Each gutter's runs are therefore assigned
 * tracks by greedy interval colouring (sorted by where they start, each takes
 * the first track free over its whole span), which is the fewest tracks that
 * keeps every overlapping pair apart. The tracks are spread evenly across the
 * gutter. Deterministic: it depends only on the tie list.
 *
 * The routed midpoint is where the connection card anchors, so the card and
 * the line it describes can never disagree.
 */

import { GEO, type Scene, type Tie } from './scene';

export interface Route {
	/** The visible path. */
	d: string;
	/** Where the connection card anchors: the middle of the line's longest run. */
	mid: { x: number; y: number };
}

interface Run {
	tie: Tie;
	gutter: number;
	lo: number;
	hi: number;
	/** Which of the tie's runs this is (a tie between distant lanes has two). */
	part: 0 | 1;
	track: number;
}

/** Corner radius of a turn, in world units. */
const R = 7;

/** An orthogonal polyline as a path with rounded corners. */
function orth(points: { x: number; y: number }[]): string {
	if (points.length < 2) return '';
	let d = `M${round(points[0].x)},${round(points[0].y)}`;
	for (let i = 1; i < points.length - 1; i++) {
		const p0 = points[i - 1];
		const p = points[i];
		const p1 = points[i + 1];
		const inLen = Math.hypot(p.x - p0.x, p.y - p0.y);
		const outLen = Math.hypot(p1.x - p.x, p1.y - p.y);
		const r = Math.min(R, inLen / 2, outLen / 2);
		if (r < 0.5) {
			d += ` L${round(p.x)},${round(p.y)}`;
			continue;
		}
		const ax = p.x - ((p.x - p0.x) / inLen) * r;
		const ay = p.y - ((p.y - p0.y) / inLen) * r;
		const bx = p.x + ((p1.x - p.x) / outLen) * r;
		const by = p.y + ((p1.y - p.y) / outLen) * r;
		d += ` L${round(ax)},${round(ay)} Q${round(p.x)},${round(p.y)} ${round(bx)},${round(by)}`;
	}
	const last = points[points.length - 1];
	return d + ` L${round(last.x)},${round(last.y)}`;
}

function round(v: number): number {
	return Math.round(v * 10) / 10;
}

/**
 * The gutters a tie runs in. A tie inside one lane uses the gutter on that
 * lane's leading side; a tie between lanes uses the gutter beside each end,
 * facing the other.
 */
function gutterPlan(tie: Tie): { g0: number; g1: number } {
	const ia = tie.a.lane;
	const ib = tie.b.lane;
	if (ia === ib) return { g0: ia, g1: ia };
	if (ia < ib) return { g0: ia + 1, g1: ib };
	return { g0: ia, g1: ib + 1 };
}

export function routeTies(scene: Scene): Map<string, Route> {
	const runs: Run[] = [];
	const plans = new Map<string, { g0: number; g1: number; ym: number }>();
	const inside: Tie[] = [];
	for (const tie of scene.ties) {
		const { g0, g1 } = gutterPlan(tie);
		const ya = tie.a.y;
		const yb = tie.b.y;
		if (tie.a.lane === tie.b.lane) {
			inside.push(tie);
			continue;
		}
		if (g0 === g1) {
			plans.set(tie.id, { g0, g1, ym: yb });
			runs.push({ tie, gutter: g0, lo: Math.min(ya, yb), hi: Math.max(ya, yb), part: 0, track: 0 });
		} else {
			const ym = (ya + yb) / 2;
			plans.set(tie.id, { g0, g1, ym });
			runs.push({ tie, gutter: g0, lo: Math.min(ya, ym), hi: Math.max(ya, ym), part: 0, track: 0 });
			runs.push({ tie, gutter: g1, lo: Math.min(ym, yb), hi: Math.max(ym, yb), part: 1, track: 0 });
		}
	}

	// Ties inside a lane: longest first, each to the less busy side over its span.
	const load = (g: number, lo: number, hi: number) => runs.filter((r) => r.gutter === g && r.lo < hi && r.hi > lo).length;
	inside.sort((a, b) => Math.abs(b.a.y - b.b.y) - Math.abs(a.a.y - a.b.y) || a.id.localeCompare(b.id));
	for (const tie of inside) {
		const lo = Math.min(tie.a.y, tie.b.y);
		const hi = Math.max(tie.a.y, tie.b.y);
		const left = tie.a.lane;
		const right = tie.a.lane + 1;
		const g = load(right, lo, hi) < load(left, lo, hi) ? right : left;
		plans.set(tie.id, { g0: g, g1: g, ym: tie.b.y });
		runs.push({ tie, gutter: g, lo, hi, part: 0, track: 0 });
	}

	// Interval colouring per gutter.
	const byGutter = new Map<number, Run[]>();
	for (const r of runs) (byGutter.get(r.gutter) ?? byGutter.set(r.gutter, []).get(r.gutter)!).push(r);
	const trackX = new Map<Run, number>();
	const GAP = 3;
	for (const [g, list] of byGutter) {
		list.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.tie.id.localeCompare(b.tie.id));
		const ends: number[] = [];
		for (const r of list) {
			let k = ends.findIndex((end) => end + GAP < r.lo);
			if (k < 0) {
				k = ends.length;
				ends.push(r.hi);
			} else ends[k] = r.hi;
			r.track = k;
		}
		const n = Math.max(1, ends.length);
		const left = scene.gutters[g];
		const usable = GEO.GUT - 12;
		const step = n > 1 ? Math.min(4, usable / (n - 1)) : 0;
		const span = step * (n - 1);
		for (const r of list) trackX.set(r, left + GEO.GUT / 2 - span / 2 + r.track * step);
	}

	const runOf = new Map<string, Run[]>();
	for (const r of runs) (runOf.get(r.tie.id) ?? runOf.set(r.tie.id, []).get(r.tie.id)!).push(r);

	const out = new Map<string, Route>();
	for (const tie of scene.ties) {
		const plan = plans.get(tie.id)!;
		const [r0, r1] = runOf.get(tie.id)!;
		const x0 = trackX.get(r0)!;
		const a = tie.a;
		const b = tie.b;
		if (a.lane === b.lane) {
			// A bracket on whichever side the tie was given.
			const onRight = plan.g0 === a.lane + 1;
			const pts = [
				{ x: onRight ? a.xr : a.xl, y: a.y },
				{ x: x0, y: a.y },
				{ x: x0, y: b.y },
				{ x: onRight ? b.xr : b.xl, y: b.y }
			];
			out.set(tie.id, { d: orth(pts), mid: { x: x0, y: (a.y + b.y) / 2 } });
			continue;
		}
		const right = a.lane < b.lane;
		const ax = right ? a.xr : a.xl;
		const bx = right ? b.xl : b.xr;
		if (plan.g0 === plan.g1) {
			// Neighbouring lanes: one run in the shared gutter.
			const pts = [
				{ x: ax, y: a.y },
				{ x: x0, y: a.y },
				{ x: x0, y: b.y },
				{ x: bx, y: b.y }
			];
			out.set(tie.id, { d: orth(pts), mid: { x: x0, y: (a.y + b.y) / 2 } });
			continue;
		}
		const x1 = trackX.get(r1)!;
		const pts = [
			{ x: ax, y: a.y },
			{ x: x0, y: a.y },
			{ x: x0, y: plan.ym },
			{ x: x1, y: plan.ym },
			{ x: x1, y: b.y },
			{ x: bx, y: b.y }
		];
		out.set(tie.id, { d: orth(pts), mid: { x: (x0 + x1) / 2, y: plan.ym } });
	}
	return out;
}
