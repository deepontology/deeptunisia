/**
 * The vertical Chronicle's scale.
 *
 * Time runs DOWN the screen here, oldest at the top — the opposite direction from
 * the horizontal Chronicle's left-to-right axis, and the reason this is a separate
 * module rather than an option on the existing axis. Everything else is the same
 * idea: a date maps to a pixel position through a linear mapping, and the reader
 * zooms by changing the ratio rather than the domain. The domain is the whole
 * dataset, always, so nothing can be hidden by a scroll position.
 *
 * The zoom levels are a fixed ladder rather than a continuous control. A
 * continuous slider would let the reader land on 37px/year, where no tick step is
 * obviously right and the ruler starts lying. Every level on the ladder knows its
 * tick step and its meaning, so the spine can always be read.
 */

/** The zoom ladder, in pixels per year. */
export const V_LEVELS = [12, 24, 40, 72, 144] as const;

/** The level the view opens at. */
export const V_DEFAULT = 40;

const YEAR_MS = 365.2425 * 86_400_000;

export interface VTick {
	/** The instant the tick stands for. */
	t: number;
	/** The year, as text. A year is a number and is never wrapped in locale chrome. */
	label: string;
	/** A decade boundary — or every tick, when the step is already a decade. */
	major: boolean;
}

export interface VScale {
	/** The pixel distance from the top of the canvas to an instant. */
	y(t: number): number;
	/** The instant at a pixel distance from the top of the canvas. */
	t(y: number): number;
	/** Pixels from the top of the canvas to the end of the domain. */
	height: number;
	ticks(): VTick[];
	domain: [number, number];
	pxPerYear: number;
}

/**
 * The tick step for a level.
 *
 * The rule is whether the ruler is still readable. One year per tick is legible at
 * 72px/year and a grey smear at 12. 72 and 144 get every year, 24 and 40 get every
 * fifth, and 12 gets every tenth, because below that the labels collide.
 */
export function tickStep(pxPerYear: number): number {
	if (pxPerYear >= 72) return 1;
	if (pxPerYear >= 24) return 5;
	return 10;
}

/**
 * One step along the ladder, saturating at either end.
 *
 * A level that is not on the ladder is accepted and steps from the nearest one, so
 * a caller cannot strand the reader between rungs.
 */
export function stepLevel(pxPerYear: number, dir: 1 | -1): number {
	const i = V_LEVELS.findIndex((l) => l === pxPerYear);
	if (i < 0) {
		const nearest = V_LEVELS.reduce((best, l) =>
			Math.abs(l - pxPerYear) < Math.abs(best - pxPerYear) ? l : best
		);
		return stepLevel(nearest, dir);
	}
	return V_LEVELS[Math.min(V_LEVELS.length - 1, Math.max(0, i + dir))];
}

export function makeVScale(domain: [number, number], pxPerYear: number): VScale {
	const ppy = Math.max(1, pxPerYear);
	const step = tickStep(ppy);
	const startYear = new Date(domain[0]).getUTCFullYear();
	const endYear = new Date(domain[1]).getUTCFullYear();
	const first = Math.ceil(startYear / step) * step;
	const last = Math.floor(endYear / step) * step;

	return {
		domain,
		pxPerYear: ppy,
		height: ((domain[1] - domain[0]) / YEAR_MS) * ppy,
		y(t) {
			return ((t - domain[0]) / YEAR_MS) * ppy;
		},
		t(y) {
			return domain[0] + (y / ppy) * YEAR_MS;
		},
		ticks() {
			const out: VTick[] = [];
			for (let yr = first; yr <= last; yr += step) {
				const t = Date.UTC(yr, 0, 1);
				// A tick before the domain start (the first era begins in March, not
				// January) would draw above the canvas.
				if (t < domain[0] || t > domain[1]) continue;
				out.push({ t, label: String(yr), major: yr % 10 === 0 });
			}
			return out;
		}
	};
}
