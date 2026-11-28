/**
 * Growth-rings geometry for the events page.
 *
 * The record drawn as a tree's cross-section: one ring per year from the first
 * recorded event to the cutoff, January at the top, the bark today. A ring is
 * as thick as its year's record (weight 0.5 + n^0.75), so a busy year reads as
 * a wide band and a quiet one as a hairline. The lens compresses the years
 * before it exponentially, so a recent lens pushes the old record toward the
 * pith; the run of years too thin to hold a mark folds into one core disc.
 *
 * Pure by construction: numbers in, numbers out. The figure component draws
 * what this returns, and `scripts/test-events.ts` checks it directly.
 *
 * Units are the figure's own: the plate is 1000 units across, centred on
 * (C, C), the bark at radius R. Time is in whole days since the epoch.
 */

export const DAY = 86_400_000;
/** The plate's centre, in figure units. */
export const C = 500;
/** The bark's radius. */
export const R = 455;
/** The pith: the innermost ring starts here, so the first year is never a point. */
export const R0 = 8;
/** How fast years before the lens shrink, in years per factor of e. */
export const TAU = 2.2;

export function f1(v: number): number {
	return Math.round(v * 10) / 10;
}
export function yearOfDay(d: number): number {
	return new Date(d * DAY).getUTCFullYear();
}
export function startOfYear(y: number): number {
	return Date.UTC(y, 0, 1) / DAY;
}
export function fracOfDay(d: number): number {
	const y = yearOfDay(d);
	return (d - startOfYear(y)) / (startOfYear(y + 1) - startOfYear(y));
}
export function dayOf(ms: number): number {
	return Math.floor(ms / DAY);
}

/** A year's ring weight from its event count. */
export function baseWeight(n: number): number {
	return 0.5 + Math.pow(n, 0.75);
}

/**
 * Ring weights at lens F (a fractional year). Years before the lens shrink
 * exponentially; while growing, years after the growth day are not there yet
 * and the growth year is as thick as the part of it already lived.
 */
export function weights(years: number[], counts: number[], F: number, growDay: number | null): number[] {
	const fy = Math.floor(F);
	const gy = growDay == null ? Infinity : yearOfDay(growDay);
	return years.map((y, i) => {
		let w = baseWeight(counts[i] || 0) * (y >= fy ? 1 : Math.exp(-(fy - y + (F % 1)) / TAU));
		if (y > gy) w = 0;
		else if (y === gy && growDay != null) w *= Math.max(0.02, fracOfDay(growDay));
		return w;
	});
}

export interface RingGeometry {
	inner: number[];
	outer: number[];
	/** The last year folded into the core disc, or null when nothing is folded. */
	coreEnd: number | null;
	/** The core disc's radius (0 without a core). */
	rc: number;
	bark: number;
}

/**
 * Radius map for every year, from the first year to the bark.
 *
 * The scale is the full record's weight, also while growing, so the growth
 * front travels outward through rings that are already the right thickness
 * instead of rescaling the whole figure on every frame.
 */
export function geometry(years: number[], counts: number[], F: number, growDay: number | null, rho: number): RingGeometry {
	const full = weights(years, counts, F, null);
	const w = growDay == null ? full : weights(years, counts, F, growDay);
	const total = full.reduce((s, v) => s + v, 0) || 1;
	const inner: number[] = [];
	const outer: number[] = [];
	let acc = 0;
	for (let j = 0; j < years.length; j++) {
		inner.push(R0 + ((R - R0) * acc) / total);
		acc += w[j];
		outer.push(R0 + ((R - R0) * acc) / total);
	}
	let coreEnd: number | null = null;
	const fy = Math.floor(F);
	if (fy > years[0] + 1 && growDay == null) {
		for (let k = 0; k < years.length; k++) {
			if (years[k] >= fy || outer[k] - inner[k] > 2.2 * rho) break;
			coreEnd = years[k];
		}
		if (coreEnd !== null && coreEnd - years[0] < 1) coreEnd = null;
	}
	const rc = coreEnd === null ? 0 : outer[coreEnd - years[0]];
	return { inner, outer, coreEnd, rc, bark: outer[outer.length - 1] };
}

/** The angle of a fraction of the year; dir is 1 clockwise, -1 for a right-to-left reader. */
export function angle(frac: number, dir: number): number {
	return -Math.PI / 2 + dir * 2 * Math.PI * frac;
}
export function point(r: number, a: number): [number, number] {
	return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** An SVG arc along radius r from a0 to a1 (a full circle when the span is 2π). */
export function arc(r: number, a0: number, a1: number): string {
	if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-6) {
		const p0 = point(r, a0);
		const p1 = point(r, a0 + Math.PI);
		return `M${f1(p0[0])},${f1(p0[1])}A${f1(r)},${f1(r)} 0 1 1 ${f1(p1[0])},${f1(p1[1])}A${f1(r)},${f1(r)} 0 1 1 ${f1(p0[0])},${f1(p0[1])}`;
	}
	const a = point(r, a0);
	const b = point(r, a1);
	return `M${f1(a[0])},${f1(a[1])}A${f1(r)},${f1(r)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 > a0 ? 1 : 0} ${f1(b[0])},${f1(b[1])}`;
}

export interface RingEvent {
	/** Index into the caller's list; positions come back at the same index. */
	i: number;
	day: number;
}
export interface RingPos {
	r: number;
	a: number;
	y: number;
	cored: boolean;
}

/**
 * Where each event sits. Inside a ring, radius only spreads marks apart: lanes
 * fill from the ring's centre line outward, so a quiet year keeps its marks on
 * that line, and a mark takes the lane where it clears its neighbour.
 */
export function layout(events: RingEvent[], years: number[], G: RingGeometry, rho: number, dir: number): (RingPos | undefined)[] {
	const first = years[0];
	const gap = 2 * rho + 1.4;
	const groups = new Map<number, RingEvent[]>();
	for (const e of events) {
		const y = yearOfDay(e.day);
		const list = groups.get(y);
		if (list) list.push(e);
		else groups.set(y, [e]);
	}
	const pos: (RingPos | undefined)[] = [];
	for (const [year, list] of groups) {
		const yi = year - first;
		if (yi < 0 || yi >= years.length) continue;
		list.sort((a, b) => a.day - b.day);
		const r0 = G.inner[yi];
		const T = G.outer[yi] - r0;
		const lanes = Math.max(1, Math.floor((T * 0.9) / gap));
		const mid = (lanes - 1) / 2;
		const order = Array.from({ length: lanes }, (_, k) => k).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
		const last = new Array<number>(lanes).fill(-Infinity);
		for (const e of list) {
			const f = fracOfDay(e.day);
			let best = order[0];
			let bestGap = -Infinity;
			for (const lane of order) {
				const g = (f - last[lane]) * 2 * Math.PI * (r0 + (T * (lane + 0.5)) / lanes);
				if (g > gap) {
					best = lane;
					break;
				}
				if (g > bestGap) {
					bestGap = g;
					best = lane;
				}
			}
			last[best] = f;
			pos[e.i] = {
				r: r0 + (T * (best + 0.5)) / lanes,
				a: angle(f, dir),
				y: year,
				cored: G.coreEnd !== null && year <= G.coreEnd
			};
		}
	}
	return pos;
}

/** A smooth path through points (Catmull-Rom as cubic Béziers), for an actor's thread. */
export function smooth(pts: [number, number][]): string {
	if (!pts.length) return '';
	let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i - 1] ?? pts[i];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[i + 2] ?? p2;
		d += `C${f1(p1[0] + (p2[0] - p0[0]) / 9)},${f1(p1[1] + (p2[1] - p0[1]) / 9)} ${f1(p2[0] - (p3[0] - p1[0]) / 9)},${f1(p2[1] - (p3[1] - p1[1]) / 9)} ${f1(p2[0])},${f1(p2[1])}`;
	}
	return d;
}

/** A chord between two marks, pulled halfway toward the centre. */
export function chord(s: [number, number], q: [number, number]): string {
	const mx = (s[0] + q[0]) / 2;
	const my = (s[1] + q[1]) / 2;
	return `M${f1(s[0])},${f1(s[1])}Q${f1(mx + (C - mx) * 0.5)},${f1(my + (C - my) * 0.5)} ${f1(q[0])},${f1(q[1])}`;
}

/**
 * The growth clock: a day for each moment of the animation, so time spent on a
 * stretch of years follows both the calendar (40%) and the record (60%). The
 * busy years take longer than the empty ones, and the empty ones still pass.
 */
export function growthClock(firstYear: number, cutoffDay: number, days: number[]): (p: number) => number {
	const sorted = [...days].sort((a, b) => a - b);
	const t0 = startOfYear(firstYear);
	const samples: [number, number][] = [];
	let n = 0;
	for (let i = 0; i <= 400; i++) {
		const t = t0 + ((cutoffDay - t0) * i) / 400;
		while (n < sorted.length && sorted[n] <= t) n++;
		samples.push([t, 0.4 * (i / 400) + 0.6 * (n / Math.max(1, sorted.length))]);
	}
	return (p: number) => {
		for (const [t, q] of samples) if (q >= p) return t;
		return cutoffDay;
	};
}
