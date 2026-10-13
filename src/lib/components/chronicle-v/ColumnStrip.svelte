<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The column strip — the horizontal track the vertical Chronicle's posts sit
	 * on, one column per post, the spine first.
	 *
	 * Two things are settled here, because the whole canvas depends on them:
	 *
	 *  - The parent's scroller (`.cv-strip`) is the scroll container for BOTH
	 *    axes, and it is the element handed to `ReadingLine` as `scroller`. So
	 *    this root is NOT a scroll container, however much it looks like a strip
	 *    of columns that ought to scroll sideways: an element whose `overflow` is
	 *    anything but `visible` is a scroll container, and the nearest scroll
	 *    container is what a sticky child sticks to. Put `overflow-x: auto` on
	 *    this root and every column header in the canvas stops sticking to the
	 *    top of the canvas and starts sticking to the top of the track instead,
	 *    which is where it already was — the canvas would scroll out from under
	 *    every header at once.
	 *
	 *  - The columns are sized here, from the tokens, rather than by each column.
	 *    Three of them plus the spine fill the canvas on a phone, and a column is
	 *    never narrower than `--cv-col-min`. The track is canvas-wide and the
	 *    columns run past its edge, so the reader scrolls them in.
	 *
	 * Snapping is the third, and it is only half of what snapping needs.
	 * `scroll-snap-type` is a property of the scroll container, not of the track,
	 * so it belongs to `.cv-strip`, where the parent scrolls; what a track can
	 * declare is what the columns come to rest against, and that is here, on
	 * every child. When the scroller sets its snap type, the columns settle on
	 * their own edges without a line changing.
	 *
	 * The canvas height arrives as the `--cv-h` custom property, set by the
	 * parent on its stage element.
	 */

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="cv-strip-track">
	{@render children()}
</div>

<!--
   The children are rendered by the parent, so the compiler cannot see that
   anything matches `> *` below and reports the selector as unused. It matches
   every column, every time.
-->
<!-- svelte-ignore css_unused_selector -->
<style>
	/*
	   A canvas-wide track, not a content-wide one. `width: max-content` reads
	   better — the track should be as wide as its columns — and it breaks: the
	   percentage in the column formula resolves against the track's own width,
	   so a track sized by its columns sizes each column to a third of the whole
	   strip, and then the track is sized by those, and with thirty posts the
	   columns come out a thousand pixels wide each. Set the track to the canvas
	   width instead, so the percentage is a percentage of the canvas, and the
	   columns run past the edge of the canvas and are scrolled in.

	   The spine is the parent's first child and takes the one explicit track;
	   the columns fill the rest. Column track sizing is definite, so a column is
	   exactly as wide as the formula says it is — a long institution name
	   overflows its own column rather than stretching it and everything after
	   it.
	*/
	.cv-strip-track {
		position: relative;
		display: grid;
		grid-auto-flow: column;
		grid-template-columns: var(--cv-spine-w);
		grid-auto-columns: max(var(--cv-col-min), (100% - var(--cv-spine-w)) / 3);
		width: 100%;
		height: var(--cv-h, 100%);
	}

	/*
	   Where a column comes to rest. The spine, the rupture rules and the focus
	   rule are also children of this track; the spine is sticky rather than
	   snapped, and the rules are placed on the scale instead, so the alignment
	   costs them nothing.
	*/
	.cv-strip-track > * {
		scroll-snap-align: start;
	}
</style>
