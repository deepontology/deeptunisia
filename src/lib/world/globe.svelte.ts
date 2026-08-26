import { geoOrthographic, geoPath, geoDistance, type GeoProjection } from 'd3-geo';
import { prefersReducedMotion } from 'svelte/motion';
import { momentum, type Navigable } from '$lib/viz/camera.svelte';

/**
 * The globe's camera.
 *
 * WHY THIS IS NOT `Camera`
 *
 * `Camera` moves a reader over a fixed plane: it has an x, a y, a world box and a
 * clamp that keeps that box reachable. A sphere has none of those. There is no
 * left edge to bump into, no "content smaller than the viewport", and the thing a
 * drag changes is an angle, not an offset. Bolting rotation onto Camera would have
 * meant three fields that mean nothing on a globe and a clamp that has to be
 * disabled — which is how a shared class becomes two classes wearing one name.
 *
 * What it does share is the `Navigable` contract, so `navigable` in
 * src/lib/viz/gestures.ts drives this without modification and without a second
 * copy of pointer capture, the drag-then-click swallow, pinch handling and the
 * measurement fix. Those four are subtle, hard-won and identical on any surface.
 *
 * WHY DELTA ROTATION RATHER THAN VERSOR
 *
 * The canonical answer to globe dragging is versor (quaternion) rotation, which
 * keeps the exact point you grabbed under the cursor for the whole drag. Two
 * reasons this uses proportional delta rotation instead:
 *
 *   1. Versor needs the pointer's absolute position projected back to a coordinate
 *      on every move. The gesture layer reports deltas, by design, because that is
 *      what a plane needs — so adopting versor means either a second gesture layer
 *      or leaking projection maths into it. Both were worse than the alternative.
 *
 *   2. Versor rotates about an arbitrary axis, which introduces roll: drag in a
 *      circle and the globe ends up tilted, with north pointing sideways. That is
 *      fine for a decorative globe and wrong for one carrying country labels in
 *      three scripts, two of which the reader may not be able to read upside down.
 *
 * So longitude follows the horizontal delta, latitude the vertical, both scaled by
 * the current radius so the surface tracks the finger at roughly 1:1 at any zoom,
 * and north stays up. The cost is that the grabbed point drifts slightly during
 * large diagonal drags. That is a real loss and it is the right trade here.
 */

/** Tunisia, near enough. The globe opens looking at it because this is its atlas. */
export const TUNISIA: [number, number] = [9.5, 34];

/**
 * Latitude is clamped short of the poles.
 *
 * At exactly ±90 the projection is looking straight down at a pole, every meridian
 * converges under the cursor, and the next horizontal drag spins the world about a
 * point rather than moving across it — which reads as the control breaking. Stopping
 * short keeps the horizon meaningful at every reachable angle.
 */
const MAX_PHI = 78;

const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);

export class Globe implements Navigable {
	/** Longitude and latitude of the point facing the reader, in degrees. */
	lon = $state(TUNISIA[0]);
	lat = $state(TUNISIA[1]);

	/** Zoom, as a multiple of the fitted radius. */
	k = $state(1);

	vw = $state(1);
	vh = $state(1);
	moving = $state(false);

	readonly minScale: number;
	readonly maxScale: number;
	/** Fraction of the smaller viewport dimension the fitted sphere occupies. */
	readonly fill: number;

	private anim = 0;
	private cancelGlide: (() => void) | null = null;

	constructor(opts: { minScale?: number; maxScale?: number; fill?: number } = {}) {
		this.minScale = opts.minScale ?? 0.85;
		this.maxScale = opts.maxScale ?? 9;
		this.fill = opts.fill ?? 0.82;
	}

	/**
	 * Fitted is 1 by construction: `k` is defined as a multiple of the fitted radius,
	 * so unlike Camera there is no viewport-dependent scale to compute. Present so
	 * NavControls can show `k / fitScale` without knowing which surface it is on.
	 */
	get fitScale(): number {
		return 1;
	}

	/** Radius of the fitted sphere in CSS pixels, before zoom. */
	get baseRadius(): number {
		return (Math.min(this.vw, this.vh) * this.fill) / 2;
	}

	get radius(): number {
		return this.baseRadius * this.k;
	}

	get centre(): [number, number] {
		return [this.vw / 2, this.vh / 2];
	}

	/**
	 * How far the reader is from the overview, 0..1. Same contract as Camera's, so
	 * the label system can use one rule for semantic zoom on both surfaces.
	 */
	get zoomProgress(): number {
		if (this.k <= 1) return 0;
		return Math.min(1, (this.k - 1) / 3);
	}

	/**
	 * A fresh projection per read.
	 *
	 * d3 projections are mutable configuration objects, not values, so a shared one
	 * would have to be re-configured before every use and any consumer holding it
	 * across a frame would silently read someone else's rotation. Constructing one
	 * is a few object allocations and happens once per render pass, which is not
	 * where this view's time goes.
	 */
	get projection(): GeoProjection {
		return geoOrthographic()
			.rotate([-this.lon, -this.lat])
			.scale(this.radius)
			.translate(this.centre)
			.clipAngle(90);
	}

	/** True when a coordinate is on the near face and therefore drawable. */
	visible(lon: number, lat: number): boolean {
		return geoDistance([lon, lat], [this.lon, this.lat]) < Math.PI / 2;
	}

	/**
	 * How head-on a coordinate is, 1 at the centre falling to 0 at the limb. Used to
	 * fade labels and nodes out as they rotate away rather than having them vanish.
	 */
	facing(lon: number, lat: number): number {
		return Math.max(0, Math.cos(geoDistance([lon, lat], [this.lon, this.lat])));
	}

	// --- Navigable -----------------------------------------------------------

	/** A drag. On a sphere that means rotate; see the header for why not versor. */
	panBy(dx: number, dy: number) {
		// Degrees per pixel at the surface. Guarded because the camera can be driven
		// before it has been measured, and a zero radius would send longitude to NaN
		// — from which no later gesture recovers, because NaN propagates through
		// every subsequent addition.
		const perPx = (180 / Math.PI) / Math.max(1, this.radius);

		/*
		 * Both signs are inverted relative to the drag, and that is what makes the
		 * surface follow the finger rather than flee it.
		 *
		 * These are the coordinates of the point FACING the reader, not of the content.
		 * Orthographic puts a place at screen x ∝ sin(λ − λ₀) and y ∝ −sin(φ − φ₀), so
		 * dragging a country to the right means increasing (λ − λ₀), which means moving
		 * the view centre λ₀ west. Getting this backwards is not subtly wrong — the
		 * globe spins away from the pointer and feels broken on the first touch.
		 */
		this.lon = wrap(this.lon - dx * perPx);
		this.lat = Math.max(-MAX_PHI, Math.min(MAX_PHI, this.lat + dy * perPx));
	}

	/**
	 * Zoom. The screen point is accepted for interface compatibility and ignored:
	 * zooming about the cursor on a sphere means rotating the grabbed point toward
	 * the centre as you scale, and doing that on a wheel event moves the map out
	 * from under the reader. The globe zooms about its own centre.
	 */
	zoomAt(factor: number, _sx?: number, _sy?: number) {
		this.k = Math.min(this.maxScale, Math.max(this.minScale, this.k * factor));
	}

	fit() {
		this.stop();
		this.k = 1;
	}

	/** Back to the opening view: Tunisia facing the reader, fully zoomed out. */
	home() {
		this.flyTo(TUNISIA[0], TUNISIA[1], 1);
	}

	stop() {
		if (this.anim) cancelAnimationFrame(this.anim);
		this.cancelGlide?.();
		this.anim = 0;
		this.cancelGlide = null;
		this.moving = false;
	}

	startGlide(vx: number, vy: number) {
		if (prefersReducedMotion.current) return;
		if (Math.hypot(vx, vy) < 0.04) return;
		this.moving = true;
		this.cancelGlide = momentum(
			vx,
			vy,
			(dx, dy) => this.panBy(dx, dy),
			() => {
				this.cancelGlide = null;
				this.moving = false;
			}
		);
	}

	/**
	 * Rotate to bring a coordinate to the centre.
	 *
	 * The whole point of selecting a country from search or from another view is to
	 * see where it is; a jump cut tells you the globe changed, where a turn tells you
	 * it moved. Longitude interpolates the short way round, so selecting Japan from
	 * Morocco crosses Asia rather than unwinding backwards through the Atlantic.
	 */
	flyTo(lon: number, lat: number, k = this.k, ms = 620) {
		this.stop();
		const targetK = Math.min(this.maxScale, Math.max(this.minScale, k));
		const lat1 = Math.max(-MAX_PHI, Math.min(MAX_PHI, lat));

		if (prefersReducedMotion.current || ms <= 0) {
			this.lon = wrap(lon);
			this.lat = lat1;
			this.k = targetK;
			return;
		}

		const lon0 = this.lon;
		const lat0 = this.lat;
		const k0 = this.k;
		const dLon = shortWay(lon0, lon);
		const t0 = performance.now();

		const step = (now: number) => {
			const p = Math.min(1, (now - t0) / ms);
			const e = EASE_OUT_CUBIC(p);
			this.lon = wrap(lon0 + dLon * e);
			this.lat = lat0 + (lat1 - lat0) * e;
			// Geometric, matching Camera.flyTo: linear zoom interpolation rushes at
			// one end and crawls at the other.
			this.k = k0 * Math.pow(targetK / k0, e);
			if (p < 1) this.anim = requestAnimationFrame(step);
			else this.anim = 0;
		};
		this.anim = requestAnimationFrame(step);
	}
}

/** Longitude into (-180, 180]. */
function wrap(lon: number): number {
	let l = ((lon + 180) % 360 + 360) % 360 - 180;
	if (l === -180) l = 180;
	return l;
}

/** The signed shortest angular distance from a to b, in degrees. */
function shortWay(a: number, b: number): number {
	let d = (b - a) % 360;
	if (d > 180) d -= 360;
	if (d < -180) d += 360;
	return d;
}

/** A path generator bound to a projection, for canvas or SVG. */
export function pathFor(projection: GeoProjection, context?: CanvasRenderingContext2D) {
	return context ? geoPath(projection, context) : geoPath(projection);
}
