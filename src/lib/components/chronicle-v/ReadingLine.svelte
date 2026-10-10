<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { formatDate } from '$lib/t.svelte';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * The reading line: the instant at 40% of the scroller's height, and the link
	 * between that instant and `app.t`.
	 *
	 * The line itself is positioned by the parent (`.cv-line`, absolute at 40% of
	 * the stage, which is the height of the scroller), so the chip and the hairline
	 * are drawn at 40% of the scroller without reading a percentage of the 2,800px
	 * track. This component owns only the two-way binding.
	 *
	 * The binding is a small state machine, not two independent effects:
	 *
	 *   - scrolling reads the instant under the line and writes `app.t`;
	 *   - a change to `app.t` (play, the dock, another view) writes the scroll back.
	 *
	 * The second direction synthesises a scroll event the first would read back.
	 * `programmatic` holds the scroll offset just written; the scroll listener
	 * recognises that offset as its own echo, consumes it and writes nothing. An
	 * exact-value check rather than a flag, because the browser clamps the offset
	 * it reports: near the end of the track there is no room for the line to sit on
	 * the last instant, and a one-frame flag released before the scroll event is
	 * dispatched would let the clamp drag the shared date backwards.
	 *
	 * `scroller` is the element the parent scrolls, not the page.
	 */
	interface Props {
		scale: VScale;
		scroller: HTMLElement;
	}

	let { scale, scroller }: Props = $props();

	/** The reading line rides this far into the scroller's height. */
	const LINE_AT = 0.4;
	/** Offsets within this many pixels are the same position, for the no-op check
	 *  and for matching our own echo. */
	const EPS = 1;

	let frame = 0;
	/** The scroll offset this component last wrote, or -1 when none is pending. */
	let programmatic = -1;

	/** The instant currently sitting under the line, from the scroll position. */
	function instantAtLine(): number {
		return scale.t(scroller.scrollTop + scroller.clientHeight * LINE_AT);
	}

	function onScroll() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			// Our own write coming back: consume it and write nothing.
			if (programmatic >= 0 && Math.abs(scroller.scrollTop - programmatic) < EPS) {
				programmatic = -1;
				return;
			}
			programmatic = -1;
			app.t = instantAtLine();
		});
	}

	/** Move the scroll so the current `app.t` sits on the line, without echoing. */
	function positionFromDate() {
		const want = Math.max(0, scale.y(app.t) - scroller.clientHeight * LINE_AT);
		if (Math.abs(want - scroller.scrollTop) < EPS) {
			programmatic = -1;
			return;
		}
		const before = scroller.scrollTop;
		scroller.scrollTop = want;
		// A write that changed nothing fires no scroll event, so there is no echo
		// to guard. A changed write's echo must match the clamped value the browser
		// kept, so record what was accepted rather than what was asked for.
		programmatic = scroller.scrollTop !== before ? scroller.scrollTop : -1;
	}

	// Bind to the scroller the parent hands over. Only `scroller` is read here, so
	// the listeners are not torn down and rebuilt when the instant changes. The
	// resize callback is the mount position too: the observer reports the size
	// once on observe, after layout, which is when the line has a real height. A
	// resize moves the line (it is a percentage of the height), so the date is
	// pushed back onto it the same way.
	$effect(() => {
		// The parent's scroller is a bound element, so it can arrive a beat late.
		// Reading it here makes the effect re-run when it does.
		if (!scroller) return;
		scroller.addEventListener('scroll', onScroll, { passive: true });
		const ro = new ResizeObserver(() => positionFromDate());
		ro.observe(scroller);
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			ro.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	});

	// The other direction: a change to the shared instant or the scale moves the
	// scroll. `positionFromDate` reads both, so this effect re-runs with them.
	$effect(() => {
		if (!scroller) return;
		positionFromDate();
	});
</script>

<div class="cv-rl" aria-hidden="true">
	<span class="cv-rl-chip mono">{formatDate(app.t, 'day')}</span>
</div>

<style>
	.cv-rl {
		position: relative;
		height: 1px;
		background: var(--text-primary);
		opacity: 0.5;
	}
	.cv-rl-chip {
		position: absolute;
		inset-inline-end: calc(var(--s-4) + var(--safe-r));
		top: 50%;
		transform: translateY(-50%);
		padding: var(--s-1) var(--s-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-sm);
		background: var(--surface-overlay);
		color: var(--text-primary);
		font-size: var(--t-xs);
		line-height: 1;
		white-space: nowrap;
		box-shadow: var(--elev-1);
	}
</style>
