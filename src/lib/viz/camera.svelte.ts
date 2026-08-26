/**
 * A viewport camera for the instrument views.
 *
 * WHY THIS EXISTS
 *
 * Every visualisation here was drawn to fit the window. Fitting is the right
 * default and the wrong ceiling: a 300-node network scaled into 900px of height has
 * to draw nodes at three pixels and hide most labels, so the reader can see that
 * structure exists but cannot read any of it. The fix is not a bigger screen, it is
 * letting the reader move — the map stays large and they navigate it.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not move the content. Node positions are computed once over the whole
 * dataset and never recomputed (see NetworkView), which is what makes scrubbing time
 * fade things in and out of a stable map instead of reshuffling it. The camera moves
 * the reader over that fixed map, and nothing here may ever be used to relayout it.
 *
 * COORDINATE MODEL
 *
 *   screen = world * k + (x, y)
 *
 * `world` is whatever fixed space the view laid itself out in — for the network,
 * 0..W by 0..H. The camera converts to the element's own pixel box, so the SVG
 * carries `viewBox="0 0 {vw} {vh}"` and a single `<g transform={cam.transform}>`.
 * Keeping the viewBox in pixels means one world unit is one CSS pixel at k=1, which
 * is what lets the label system reason about legibility in real millimetres.
 */

import { prefersReducedMotion } from 'svelte/motion';

/**
 * What a surface must offer to be driven by the shared navigation machinery.
 *
 * `Camera` and the globe's `Globe` are deliberately different classes — a plane
 * has a world box and a clamp, a sphere has neither — but both are navigable:
 * gestures.ts, NavControls and the measurement fix must not have to care which
 * one they are driving. This is exactly the subset they share. See the "WHY THIS
 * IS NOT `Camera`" note in globe.svelte.ts for the other half of the argument.
 */
export interface Navigable {
	k: number;
	/** Viewport size in CSS pixels, kept current by the `viewport` action. */
	vw: number;
	vh: number;
	/** True while a pointer drag or momentum glide is in flight. */
	moving: boolean;
	/** The reference scale: everything on screen (1 on a sphere, by definition). */
	readonly fitScale: number;
	readonly maxScale: number;
	readonly minScale: number;
	panBy(dx: number, dy: number): void;
	zoomAt(factor: number, sx?: number, sy?: number): void;
	/** Smooth impulse zoom (wheel/buttons); views without smoothing fall back to zoomAt. */
	zoomSmoothTo?(factor: number, sx?: number, sy?: number): void;
	/**
	 * Consumed by the gesture layer's resize handling: when a view is about to
	 * fly somewhere, the resize recentre-pan must stand down or it fights the
	 * flight with a sudden jump.
	 */
	skipResizePan?: boolean;
	fit(): void;
	/** Cancel any animation or momentum. Called on every new user gesture. */
	stop(): void;
	/** Decaying flick. Started by the gesture layer on pointer release. */
	startGlide(vx: number, vy: number): void;
}

export interface CameraOptions {
	/** The fixed layout space the view draws into. */
	world: { w: number; h: number };
	minScale?: number;
	maxScale?: number;
	/** Breathing room around the content when fitting, in screen pixels. */
	padding?: number;
	/**
	 * The scale below which fitting refuses to go.
	 *
	 * "Fit everything on screen" is the wrong default on a phone: a 2100-unit world
	 * squeezed into 390px makes each of seven lanes 55px wide, so nothing can be
	 * named and the overview shows that structure exists while making it unreadable.
	 * With a floor, fitting means "as far out as is still worth looking at" and the
	 * map is allowed to be bigger than the window — which is the point of having a
	 * camera at all.
	 */
	fitFloor?: number;
	/**
	 * How much of the viewport may be empty before panning stops, as a fraction.
	 * 0.5 lets the reader pull content to the middle of the screen — useful when
	 * inspecting an edge node — without ever letting the map leave entirely.
	 */
	overscroll?: number;
}

const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);
const EASE_IN_OUT_CUBIC = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Standalone momentum / decaying-flick animation.
 *
 * Used by the globe camera, which cannot inherit from Camera (a sphere has no
 * world box or clamp). The gesture layer reports velocity on pointer release;
 * this function applies decaying deltas until the motion is negligible.
 *
 * @returns A cancel function. Call it on every new user gesture to stop the glide.
 */
export function momentum(
	vx: number,
	vy: number,
	onDelta: (dx: number, dy: number) => void,
	onEnd: () => void
): () => void {
	if (prefersReducedMotion.current || Math.hypot(vx, vy) < 0.04) {
		onEnd();
		return () => {};
	}
	let raf = 0;
	let last = performance.now();

	const step = (now: number) => {
		const dt = now - last;
		last = now;
		const decay = Math.pow(0.0008, dt / 1000);
		vx *= decay;
		vy *= decay;
		onDelta(vx * dt, vy * dt);
		if (Math.hypot(vx, vy) > 0.01) raf = requestAnimationFrame(step);
		else {
			raf = 0;
			onEnd();
		}
	};
	raf = requestAnimationFrame(step);

	return () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	};
}

export class Camera implements Navigable {
	x = $state(0);
	y = $state(0);
	k = $state(1);

	/** Viewport size in CSS pixels. Kept current by the `viewport` action. */
	vw = $state(1);
	vh = $state(1);

	readonly world: { w: number; h: number };
	readonly minScale: number;
	readonly maxScale: number;
	readonly padding: number;
	readonly overscroll: number;
	readonly fitFloor: number;

	/** True while a pointer drag or momentum glide is in flight. */
	moving = $state(false);

	/** Consumed by the gesture layer's resize handling — see the Navigable note. */
	skipResizePan = false;

	private anim = 0;
	private glide = 0;

	constructor(opts: CameraOptions) {
		this.world = opts.world;
		this.minScale = opts.minScale ?? 0.25;
		this.maxScale = opts.maxScale ?? 8;
		this.padding = opts.padding ?? 24;
		this.overscroll = opts.overscroll ?? 0.55;
		this.fitFloor = opts.fitFloor ?? 0;
	}

	get transform(): string {
		return `translate(${this.x} ${this.y}) scale(${this.k})`;
	}

	/**
	 * The reference scale: everything on screen, or `fitFloor` if that would be too
	 * small to read. On a narrow viewport the floor wins and the world is deliberately
	 * larger than the window.
	 */
	get fitScale(): number {
		const w = Math.max(1, this.vw - this.padding * 2);
		const h = Math.max(1, this.vh - this.padding * 2);
		return Math.max(this.fitFloor, Math.min(w / this.world.w, h / this.world.h));
	}

	/**
	 * How far the reader is from the overview, 0..1. Views use it for semantic zoom:
	 * what is worth drawing at a glance is not what is worth drawing up close.
	 */
	get zoomProgress(): number {
		const fit = this.fitScale;
		if (this.k <= fit) return 0;
		return Math.min(1, (this.k - fit) / (Math.max(fit, 0.001) * 3));
	}

	screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return { x: (sx - this.x) / this.k, y: (sy - this.y) / this.k };
	}

	worldToScreen(wx: number, wy: number): { x: number; y: number } {
		return { x: wx * this.k + this.x, y: wy * this.k + this.y };
	}

	/**
	 * Keep the map reachable.
	 *
	 * Not a hard clamp to the content box: at high zoom the reader legitimately wants
	 * a node at the edge of the world sitting in the middle of the screen, and a
	 * strict clamp makes that impossible and feels broken. Instead the content may
	 * leave the viewport by up to `overscroll` of its width, so there is always
	 * something on screen to navigate back by.
	 */
	private clamp(x: number, y: number, k = this.k): { x: number; y: number } {
		const cw = this.world.w * k;
		const ch = this.world.h * k;
		const slackX = this.vw * this.overscroll;
		const slackY = this.vh * this.overscroll;

		// If the content is smaller than the viewport, centre it on that axis rather
		// than letting it drift into a corner.
		const cx = cw <= this.vw ? (this.vw - cw) / 2 : Math.min(slackX, Math.max(this.vw - cw - slackX, x));
		const cy = ch <= this.vh ? (this.vh - ch) / 2 : Math.min(slackY, Math.max(this.vh - ch - slackY, y));
		return { x: cx, y: cy };
	}

	set(x: number, y: number, k = this.k) {
		this.k = Math.min(this.maxScale, Math.max(this.minScale, k));
		const c = this.clamp(x, y);
		this.x = c.x;
		this.y = c.y;
	}

	panBy(dx: number, dy: number) {
		this.set(this.x + dx, this.y + dy);
	}

	/** Zoom about a point in screen space, keeping the world point under it fixed. */
	zoomAt(factor: number, sx = this.vw / 2, sy = this.vh / 2) {
		const k = Math.min(this.maxScale, Math.max(this.minScale, this.k * factor));
		if (k === this.k) return;
		const w = this.screenToWorld(sx, sy);
		this.set(sx - w.x * k, sy - w.y * k, k);
	}

	// --- Smooth zoom ----------------------------------------------------------
	//
	// A wheel notch is a discrete impulse; applying it to k directly makes the
	// map step in bursts, and a trackpad's stream of small deltas becomes a
	// stutter. Instead the target scale accumulates and k eases toward it each
	// frame (~90ms time constant), keeping the world point under the anchor fixed
	// for the whole flight. Direct manipulation (drag, pinch) stays 1:1 — only
	// impulse input is smoothed, and any new gesture cancels the flight.

	private zoomTarget: number | null = null;
	private zoomAnchor: { sx: number; sy: number; wx: number; wy: number } | null = null;
	private zoomRaf = 0;
	private zoomLast = 0;

	zoomSmoothTo(factor: number, sx?: number, sy?: number) {
		// Read the running target BEFORE stop() nulls it: consecutive impulses
		// (a wheel stream, rapid +/- presses) must accumulate — zoomTarget * factor
		// — not restart from the current, still-mid-flight k. stop() then cancels
		// the in-flight animation and any fly/glide.
		const base = this.zoomTarget ?? this.k;
		this.stop();
		const targetK = Math.min(this.maxScale, Math.max(this.minScale, base * factor));
		if (targetK === this.k) {
			this.zoomTarget = null;
			return;
		}
		this.zoomTarget = targetK;
		if (sx !== undefined && sy !== undefined) {
			const w = this.screenToWorld(sx, sy);
			this.zoomAnchor = { sx, sy, wx: w.x, wy: w.y };
		} else {
			this.zoomAnchor = null;
		}
		this.zoomLast = 0;
		if (prefersReducedMotion.current) {
			this.zoomTarget = null;
			this.zoomAt(factor, sx, sy);
			return;
		}
		if (!this.zoomRaf) this.zoomRaf = requestAnimationFrame(this.zoomStep);
	}

	private zoomStep = (now: number) => {
		const last = this.zoomLast || now;
		this.zoomLast = now;
		const dt = Math.min(48, now - last);
		const t = 1 - Math.exp(-dt / 90);
		const target = this.zoomTarget!;
		const k = Math.abs(target - this.k) < 0.0008 ? target : this.k + (target - this.k) * t;
		if (this.zoomAnchor) {
			const a = this.zoomAnchor;
			this.set(a.sx - a.wx * k, a.sy - a.wy * k, k);
		} else {
			this.set(this.x, this.y, k);
		}
		if (k === target) {
			this.zoomTarget = null;
			this.zoomRaf = 0;
			return;
		}
		this.zoomRaf = requestAnimationFrame(this.zoomStep);
	};

	/**
	 * Put a world point at a given fraction of the viewport, without changing scale.
	 *
	 * Exists because centring is the wrong opening move for a map that is wider than
	 * the window: the middle of the world is a boundary between two lanes, so the
	 * reader arrives looking at the gap. A view that knows where its interesting side
	 * is can say so.
	 */
	alignTo(wx: number, wy: number, fx = 0.5, fy = 0.5) {
		this.set(this.vw * fx - wx * this.k, this.vh * fy - wy * this.k);
	}

	fit(scale?: number) {
		this.stop();
		const k = scale ?? this.fitScale;
		this.k = Math.min(this.maxScale, Math.max(this.minScale, k));
		this.x = (this.vw - this.world.w * this.k) / 2;
		this.y = (this.vh - this.world.h * this.k) / 2;
	}

	/**
	 * Animate to centre a world point at a given scale.
	 *
	 * Used when the reader selects an entity from search or from another view: the
	 * camera travelling there is what tells them the network moved rather than
	 * changed, which a jump cut does not.
	 *
	 * POSITION LERPS, SCALE EASES. The scale interpolates geometrically from k0;
	 * the position interpolates from the CURRENT x/y to the target with the same
	 * easing. The tempting alternative — deriving x/y from k each frame, so the
	 * target stays centred — snaps the first frame to the k-projected position,
	 * which makes the pan teleport while the zoom glides. Lerping means the node
	 * visibly travels; it drifts slightly off-centre mid-flight and settles
	 * centred, which is how flights read.
	 *
	 * `cx`/`cy` (optional) set the screen point the target centres on. When
	 * omitted they are read LIVE from vw/vh each frame, so a resize mid-flight
	 * (the inspector docking) moves the destination without breaking the motion.
	 * `easing` 'inout' starts and ends gently — right for a selection made on the
	 * map; 'out' arrives decisively, right for long navigation.
	 */
	flyTo(
		wx: number,
		wy: number,
		k = Math.max(this.k, this.fitScale * 2.4),
		ms = 560,
		easing: 'out' | 'inout' = 'out',
		cx?: number,
		cy?: number
	) {
		this.stop();
		const targetK = Math.min(this.maxScale, Math.max(this.minScale, k));

		if (prefersReducedMotion.current || ms <= 0) {
			const end = this.clamp((cx ?? this.vw / 2) - wx * targetK, (cy ?? this.vh / 2) - wy * targetK, targetK);
			this.set(end.x, end.y, targetK);
			return;
		}

		const x0 = this.x;
		const y0 = this.y;
		const k0 = this.k;
		const t0 = performance.now();
		const ease = easing === 'inout' ? EASE_IN_OUT_CUBIC : EASE_OUT_CUBIC;

		const step = (now: number) => {
			const p = Math.min(1, (now - t0) / ms);
			const e = ease(p);
			this.k = k0 * Math.pow(targetK / k0, e);
			const end = this.clamp((cx ?? this.vw / 2) - wx * targetK, (cy ?? this.vh / 2) - wy * targetK, targetK);
			this.x = x0 + (end.x - x0) * e;
			this.y = y0 + (end.y - y0) * e;
			if (p < 1) this.anim = requestAnimationFrame(step);
			else this.anim = 0;
		};
		this.anim = requestAnimationFrame(step);
	}

	/** Cancel any animation, momentum or zoom flight. Called on every new user gesture. */
	stop() {
		if (this.anim) cancelAnimationFrame(this.anim);
		if (this.glide) cancelAnimationFrame(this.glide);
		if (this.zoomRaf) cancelAnimationFrame(this.zoomRaf);
		this.anim = 0;
		this.glide = 0;
		this.zoomRaf = 0;
		this.zoomTarget = null;
		this.moving = false;
	}

	/** Decaying flick. Started by the gesture layer on pointer release. */
	startGlide(vx: number, vy: number) {
		if (prefersReducedMotion.current) return;
		if (Math.hypot(vx, vy) < 0.04) return;
		this.moving = true;
		let last = performance.now();

		const step = (now: number) => {
			const dt = now - last;
			last = now;
			// ~halves every 90ms, framerate-independent.
			const decay = Math.pow(0.0008, dt / 1000);
			vx *= decay;
			vy *= decay;
			this.panBy(vx * dt, vy * dt);
			if (Math.hypot(vx, vy) > 0.01) this.glide = requestAnimationFrame(step);
			else {
				this.glide = 0;
				this.moving = false;
			}
		};
		this.glide = requestAnimationFrame(step);
	}
}
