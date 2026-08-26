import { prefersReducedMotion } from 'svelte/motion';

/**
 * A camera for one axis.
 *
 * WHY THIS IS NOT `Camera`
 *
 * The Chronicle zooms time and only time: rows stay put, the label gutter stays
 * stuck to the left, and the vertical direction is an ordinary scroll. Driving that
 * with the 2-D affine `Camera` would mean fighting it on every axis it is good at —
 * the gutter would scale, the rows would drift, and "reset" would have two meanings.
 *
 * So the two share a gesture *vocabulary* rather than an implementation. Drag pans,
 * pinch zooms, wheel zooms about the cursor, momentum carries a flick, and the
 * bounds are hard. What differs is what those verbs move: there, a viewport over a
 * fixed map; here, a window onto a interval of history.
 *
 * The alternative was to leave the Chronicle with hand-rolled handlers, which is how
 * it ended up as the one major view with no pinch support and no inertia — unusable
 * on a phone in exactly the way the rest of the app no longer is.
 */
export interface AxisOptions {
	/** Hard bounds. The domain can never leave these. */
	min: number;
	max: number;
	/** Narrowest window the reader may zoom to, in the same units. */
	minSpan: number;
}

export class AxisCamera {
	d0 = $state(0);
	d1 = $state(1);

	readonly min: number;
	readonly max: number;
	readonly minSpan: number;

	moving = $state(false);
	private glideId = 0;

	constructor(opts: AxisOptions) {
		this.min = opts.min;
		this.max = opts.max;
		this.minSpan = opts.minSpan;
		this.d0 = opts.min;
		this.d1 = opts.max;
	}

	get span() {
		return this.d1 - this.d0;
	}

	/** True when the reader has zoomed in at all — drives "reset" affordances. */
	get zoomed() {
		return this.span < this.max - this.min - 1;
	}

	/** Domain value at a pixel offset within a track of the given width. */
	valueAt(px: number, width: number) {
		return this.d0 + (px / Math.max(1, width)) * this.span;
	}

	/**
	 * Set the window, clamped.
	 *
	 * Clamping preserves the requested span rather than truncating it: sliding into
	 * the start of the record should stop, not silently zoom in, which is what
	 * clamping each edge independently does.
	 */
	setDomain(a: number, b: number) {
		let span = Math.min(this.max - this.min, Math.max(this.minSpan, b - a));
		let d0 = a;
		if (d0 < this.min) d0 = this.min;
		if (d0 + span > this.max) d0 = this.max - span;
		this.d0 = d0;
		this.d1 = d0 + span;
	}

	/** Zoom about a pixel position, holding the value under it fixed. */
	zoomAt(factor: number, px: number, width: number) {
		const anchor = this.valueAt(px, width);
		const span = Math.min(this.max - this.min, Math.max(this.minSpan, this.span * factor));
		const ratio = (anchor - this.d0) / this.span;
		this.setDomain(anchor - ratio * span, anchor - ratio * span + span);
	}

	/** Drag the window by a pixel delta. Positive dx moves the content right. */
	panByPixels(dx: number, width: number) {
		const dt = (dx / Math.max(1, width)) * this.span;
		this.setDomain(this.d0 - dt, this.d1 - dt);
	}

	reset() {
		this.stop();
		this.d0 = this.min;
		this.d1 = this.max;
	}

	stop() {
		if (this.glideId) cancelAnimationFrame(this.glideId);
		this.glideId = 0;
		this.moving = false;
	}

	/** Decaying flick, in pixels per millisecond. */
	startGlide(vx: number, width: number) {
		if (prefersReducedMotion.current || Math.abs(vx) < 0.04) return;
		this.moving = true;
		let last = performance.now();
		const step = (now: number) => {
			const dt = now - last;
			last = now;
			vx *= Math.pow(0.0008, dt / 1000);
			this.panByPixels(vx * dt, width);
			if (Math.abs(vx) > 0.01) this.glideId = requestAnimationFrame(step);
			else {
				this.glideId = 0;
				this.moving = false;
			}
		};
		this.glideId = requestAnimationFrame(step);
	}
}

export interface AxisGestureParams {
	axis: AxisCamera;
	/** Width of the plotting area in pixels. */
	width: () => number;
	/** Pixels between the element's left edge and the start of the plotting area. */
	offset?: () => number;
}

/**
 * Bind pointers, pinch and wheel to an AxisCamera.
 *
 * Mirrors `navigable` in gestures.ts as closely as a one-dimensional control can:
 * plain wheel pans, ctrl/cmd wheel zooms about the cursor, two fingers pinch.
 *
 * One deliberate difference. A vertical wheel over this element zooms rather than
 * pans, because the element is taller than the window and the reader's vertical
 * scroll has to keep working — claiming it would trap them inside the chart. That is
 * also why `deltaY` is only intercepted when it dominates `deltaX`.
 */
export function navigableAxis(node: HTMLElement, params: AxisGestureParams) {
	let { axis } = params;
	let width = params.width;
	let offset = params.offset ?? (() => 0);

	const pointers = new Map<number, number>();
	let dragging = false;
	let moved = 0;
	let lastX = 0;
	let lastT = 0;
	let vx = 0;
	let pinch = 0;

	/**
	 * Pointer capture is taken when a drag begins, never on pointerdown.
	 *
	 * With capture active the browser retargets the compatibility `click` event to the
	 * capturing element, so capturing immediately means a tap on a tenure bar is
	 * delivered to this container instead — the bar never sees it and the inspector
	 * never opens. Deferring until the pointer has actually moved keeps taps intact
	 * while still guaranteeing the drag is tracked if the pointer leaves the element.
	 */
	let captured = false;

	const localX = (clientX: number) => clientX - node.getBoundingClientRect().left - offset();

	function onDown(e: PointerEvent) {
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		axis.stop();
		pointers.set(e.pointerId, localX(e.clientX));

		if (pointers.size === 1) {
			dragging = true;
			moved = 0;
			vx = 0;
			lastX = localX(e.clientX);
			lastT = e.timeStamp;
		} else if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinch = Math.abs(a - b);
			dragging = false;
			// Two fingers is unambiguously a gesture, never a tap, so capture is safe.
			node.setPointerCapture?.(e.pointerId);
			captured = true;
		}
	}

	function onMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		const x = localX(e.clientX);
		pointers.set(e.pointerId, x);

		if (pointers.size >= 2) {
			const [a, b] = [...pointers.values()];
			const d = Math.abs(a - b);
			if (pinch > 4 && d > 4) axis.zoomAt(pinch / d, (a + b) / 2, width());
			pinch = d;
			axis.moving = true;
			return;
		}

		if (!dragging) return;
		const dx = x - lastX;
		const dt = Math.max(1, e.timeStamp - lastT);
		moved += Math.abs(dx);
		vx = vx * 0.7 + (dx / dt) * 0.3;
		lastX = x;
		lastT = e.timeStamp;
		if (moved > 3) axis.moving = true;
		if (!captured && moved > 4) {
			node.setPointerCapture?.(e.pointerId);
			captured = true;
		}
		axis.panByPixels(dx, width());
	}

	function onUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (captured) {
			node.releasePointerCapture?.(e.pointerId);
			captured = false;
		}
		if (pointers.size < 2) pinch = 0;
		if (pointers.size > 0) return;

		if (dragging && moved > 6) {
			// A drag that ends on a tenure bar would otherwise open that person.
			const swallow = (ev: Event) => {
				ev.stopPropagation();
				ev.preventDefault();
			};
			node.addEventListener('click', swallow, { capture: true, once: true });
			setTimeout(() => node.removeEventListener('click', swallow, { capture: true }), 350);
			axis.startGlide(vx, width());
		} else {
			axis.moving = false;
		}
		dragging = false;
	}

	function onWheel(e: WheelEvent) {
		// Let a genuinely vertical scroll pass through to the page: this chart is
		// taller than the window, and swallowing that traps the reader inside it.
		if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < Math.abs(e.deltaX)) {
			e.preventDefault();
			axis.panByPixels(-e.deltaX, width());
			return;
		}
		e.preventDefault();
		axis.stop();
		axis.zoomAt(Math.exp(e.deltaY * 0.0016), localX(e.clientX), width());
	}

	node.addEventListener('pointerdown', onDown as EventListener);
	node.addEventListener('pointermove', onMove as EventListener);
	node.addEventListener('pointerup', onUp as EventListener);
	node.addEventListener('pointercancel', onUp as EventListener);
	node.addEventListener('wheel', onWheel as EventListener, { passive: false });

	return {
		update(next: AxisGestureParams) {
			axis = next.axis;
			width = next.width;
			offset = next.offset ?? (() => 0);
		},
		destroy() {
			axis.stop();
			node.removeEventListener('pointerdown', onDown as EventListener);
			node.removeEventListener('pointermove', onMove as EventListener);
			node.removeEventListener('pointerup', onUp as EventListener);
			node.removeEventListener('pointercancel', onUp as EventListener);
			node.removeEventListener('wheel', onWheel as EventListener);
		}
	};
}
