import type { Navigable } from './camera.svelte';

/**
 * The gesture layer: turns pointers, wheels and keys into camera moves.
 *
 * Kept apart from the Camera itself so the camera stays a pure model that a test or
 * another view can drive without a DOM, and so this file can be read as one list of
 * every way a reader is allowed to move.
 *
 * THE MAPPING, AND WHY
 *
 *   drag / one finger      pan, with momentum on release
 *   two fingers            pinch to zoom, and pan at the same time
 *   wheel / two-finger     pan vertically; shift for horizontal
 *   ctrl or cmd + wheel    zoom about the cursor (this is what a trackpad pinch
 *                          sends, so pinching on a laptop zooms as expected)
 *   double click / tap     zoom in here; with alt, zoom out
 *   arrows, when focused   pan; +/- zoom; 0 refit
 *
 * Plain wheel pans rather than zooms on purpose. Zoom-on-scroll is the convention
 * for slippy maps, but this canvas sits inside an application shell where the same
 * gesture scrolls everything else, and a reader who overshoots a zoom has to work
 * out how to get back. Panning is recoverable by definition.
 *
 * The arrow keys are claimed only while the canvas has focus, and the events are
 * stopped there so the shell's global handler does not also nudge the timeline. A
 * reader who wants to scrub with the keyboard tabs to the playhead, which is a
 * labelled slider and the more discoverable target of the two.
 */

export interface GestureOptions {
	/** Suppress panning while a child is handling its own drag, if a view needs it. */
	enabled?: () => boolean;
}

export function navigable(node: HTMLElement | SVGElement, params: { cam: Navigable } & GestureOptions) {
	let { cam } = params;
	let enabled = params.enabled ?? (() => true);

	/** Live pointers, by id, in element-relative coordinates. */
	const pointers = new Map<number, { x: number; y: number }>();

	let dragging = false;
	let moved = 0;
	let lastX = 0;
	let lastY = 0;
	let lastT = 0;
	let vx = 0;
	let vy = 0;

	/** Pinch baseline, captured when the second pointer lands. */
	let pinchDist = 0;

	/**
	 * Pointer capture is taken when a drag begins, never on pointerdown.
	 *
	 * With capture active the browser retargets the compatibility `click` event to the
	 * capturing element, so capturing immediately means a tap on a node is delivered to
	 * this container instead and the node never sees it. Deferring until the pointer has
	 * moved keeps taps working while still tracking a drag that leaves the element.
	 *
	 * Capture is a belt-and-suspenders nicety, not the mechanism the drag depends on:
	 * pointermove/up are tracked on `window`, so a drag works even when the browser
	 * refuses to move capture away from the SVG child the press landed on (a known
	 * Firefox behaviour). If the pointer is over this element, its events bubble here
	 * anyway; if it has left, the window listener still sees them.
	 */
	let captured = false;

	function local(e: PointerEvent) {
		const r = node.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	function centroid() {
		let x = 0;
		let y = 0;
		for (const p of pointers.values()) {
			x += p.x;
			y += p.y;
		}
		return { x: x / pointers.size, y: y / pointers.size };
	}

	function spread() {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function onPointerDown(e: PointerEvent) {
		if (!enabled()) return;
		// Let a real control inside the canvas keep its own click.
		if ((e.target as Element)?.closest?.('[data-no-pan]')) return;

		ensureMeasured();
		cam.stop();
		pointers.set(e.pointerId, local(e));

		if (pointers.size === 1) {
			const p = local(e);
			dragging = true;
			moved = 0;
			lastX = p.x;
			lastY = p.y;
			lastT = e.timeStamp;
			vx = 0;
			vy = 0;
		} else if (pointers.size === 2) {
			pinchDist = spread();
			dragging = false;
			// Two fingers is unambiguously a gesture, never a tap, so capture is safe.
			node.setPointerCapture?.(e.pointerId);
			captured = true;
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		const p = local(e);
		pointers.set(e.pointerId, p);

		if (pointers.size >= 2) {
			const d = spread();
			if (pinchDist > 0 && d > 0) {
				const c = centroid();
				cam.zoomAt(d / pinchDist, c.x, c.y);
			}
			pinchDist = d;
			cam.moving = true;
			return;
		}

		if (!dragging) return;
		const dx = p.x - lastX;
		const dy = p.y - lastY;
		const dt = Math.max(1, e.timeStamp - lastT);

		moved += Math.abs(dx) + Math.abs(dy);
		// Velocity is smoothed: a single last-frame sample makes the flick feel
		// random, because the final pointer event before release is often tiny.
		vx = vx * 0.7 + (dx / dt) * 0.3;
		vy = vy * 0.7 + (dy / dt) * 0.3;

		lastX = p.x;
		lastY = p.y;
		lastT = e.timeStamp;

		if (moved > 3) cam.moving = true;
		if (!captured && moved > 4) {
			node.setPointerCapture?.(e.pointerId);
			captured = true;
		}
		cam.panBy(dx, dy);
	}

	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (captured) {
			node.releasePointerCapture?.(e.pointerId);
			captured = false;
		}

		if (pointers.size < 2) pinchDist = 0;
		if (pointers.size > 0) return;

		if (dragging && moved > 6) {
			/*
			 * A drag that ends over a node still fires a click on it, so panning the
			 * map would select whatever happened to be under the finger when you let
			 * go. Swallowed here, in the capture phase, rather than by asking every
			 * view to check a flag — a view that forgets produces a bug that only
			 * shows up on touch, where it is most annoying and least reported.
			 */
			const swallow = (ev: Event) => {
				ev.stopPropagation();
				ev.preventDefault();
			};
			node.addEventListener('click', swallow, { capture: true, once: true });
			// If no click follows (the pointer left the element, or it was a touch
			// that generated none), the listener must not survive to eat a real one.
			setTimeout(() => node.removeEventListener('click', swallow, { capture: true }), 350);

			cam.startGlide(vx, vy);
		} else {
			cam.moving = false;
		}
		dragging = false;
	}

	function onWheel(e: WheelEvent) {
		if (!enabled()) return;
		e.preventDefault();
		ensureMeasured();
		cam.stop();

		if (e.ctrlKey || e.metaKey) {
			const r = node.getBoundingClientRect();
			// deltaY is in the same direction as a pinch-close, hence the negation.
			const factor = Math.exp(-e.deltaY * 0.01);
			const sx = e.clientX - r.left;
			const sy = e.clientY - r.top;
			// Impulse input is smoothed so a wheel does not step the map in bursts;
			// surfaces without smoothing fall back to the direct zoom.
			if (cam.zoomSmoothTo) cam.zoomSmoothTo(factor, sx, sy);
			else cam.zoomAt(factor, sx, sy);
			return;
		}

		if (e.shiftKey) cam.panBy(-e.deltaY - e.deltaX, 0);
		else cam.panBy(-e.deltaX, -e.deltaY);
	}

	function onDblClick(e: MouseEvent) {
		if (!enabled()) return;
		if ((e.target as Element)?.closest?.('[data-no-pan]')) return;
		const r = node.getBoundingClientRect();
		const factor = e.altKey ? 1 / 1.8 : 1.8;
		const sx = e.clientX - r.left;
		const sy = e.clientY - r.top;
		if (cam.zoomSmoothTo) cam.zoomSmoothTo(factor, sx, sy);
		else cam.zoomAt(factor, sx, sy);
	}

	function onKeyDown(e: KeyboardEvent) {
		// Only when the canvas itself is focused. A node inside it that has focus is
		// handling its own keys, and stealing arrows there would break selection.
		if (e.target !== node) return;

		const step = e.shiftKey ? 220 : 70;
		let handled = true;
		switch (e.key) {
			case 'ArrowLeft':
				cam.panBy(step, 0);
				break;
			case 'ArrowRight':
				cam.panBy(-step, 0);
				break;
			case 'ArrowUp':
				cam.panBy(0, step);
				break;
			case 'ArrowDown':
				cam.panBy(0, -step);
				break;
			case '+':
			case '=':
				if (cam.zoomSmoothTo) cam.zoomSmoothTo(1.4);
				else cam.zoomAt(1.4);
				break;
			case '-':
			case '_':
				if (cam.zoomSmoothTo) cam.zoomSmoothTo(1 / 1.4);
				else cam.zoomAt(1 / 1.4);
				break;
			case '0':
				cam.fit();
				break;
			default:
				handled = false;
		}
		if (handled) {
			e.preventDefault();
			// The shell nudges time on arrow keys. Both responding at once would move
			// the map and the date from one press, which reads as a bug.
			e.stopPropagation();
		}
	}

	/**
	 * Viewport size drives the fit scale and the clamp, so it has to be measured
	 * rather than assumed.
	 *
	 * WHY THIS IS NOT JUST A ResizeObserver
	 *
	 * It was, and that shipped a silent failure. If the observer's first callback
	 * arrives at zero size — the element laid out while hidden, or measured before the
	 * shell has settled — the early return leaves the camera at vw = 1, and if the box
	 * never subsequently changes from the observer's point of view, no second callback
	 * ever comes. The result is a map rendered into a 1×1 viewBox at scale 1: nodes
	 * draw, every lane header and label is culled as off-screen, and the zoom readout
	 * reports a number computed against a one-pixel viewport. No error, no warning.
	 *
	 * It is invisible to the test suite too, because Playwright's observer happens to
	 * fire. So measurement now has three independent chances to succeed — on attach,
	 * on the next frame, and on any observation — and a gesture arriving against an
	 * unmeasured camera measures first. Any one of them is enough.
	 */
	let fitted = false;

	function measure(): boolean {
		const r = node.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return false;

		const prevW = cam.vw;
		const prevH = cam.vh;
		cam.vw = r.width;
		cam.vh = r.height;

		if (!fitted) {
			fitted = true;
			cam.fit();
		} else if (cam.skipResizePan) {
			// A flight is about to take the reader somewhere on purpose; the
			// keep-the-centre pan would be a sudden jump right before it starts.
			cam.skipResizePan = false;
		} else {
			// On resize, keep whatever the reader was looking at in the middle rather
			// than snapping back to the overview and losing their place.
			cam.panBy((r.width - prevW) / 2, (r.height - prevH) / 2);
		}
		return true;
	}

	/** Called before any gesture, so an unmeasured camera can never be driven. */
	function ensureMeasured() {
		if (!fitted) measure();
	}

	const ro = new ResizeObserver(() => measure());
	ro.observe(node as Element);

	measure();
	const firstFrame = requestAnimationFrame(() => measure());

	node.addEventListener('pointerdown', onPointerDown as EventListener);
	window.addEventListener('pointermove', onPointerMove as EventListener);
	window.addEventListener('pointerup', onPointerUp as EventListener);
	window.addEventListener('pointercancel', onPointerUp as EventListener);
	node.addEventListener('wheel', onWheel as EventListener, { passive: false });
	node.addEventListener('dblclick', onDblClick as EventListener);
	node.addEventListener('keydown', onKeyDown as EventListener);

	return {
		update(next: { cam: Navigable } & GestureOptions) {
			cam = next.cam;
			enabled = next.enabled ?? (() => true);
		},
		destroy() {
			ro.disconnect();
			cancelAnimationFrame(firstFrame);
			cam.stop();
			node.removeEventListener('pointerdown', onPointerDown as EventListener);
			window.removeEventListener('pointermove', onPointerMove as EventListener);
			window.removeEventListener('pointerup', onPointerUp as EventListener);
			window.removeEventListener('pointercancel', onPointerUp as EventListener);
			node.removeEventListener('wheel', onWheel as EventListener);
			node.removeEventListener('dblclick', onDblClick as EventListener);
			node.removeEventListener('keydown', onKeyDown as EventListener);
		}
	};
}
