<script lang="ts">
	import type { EventRec } from '$lib/model';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * One rupture, as a quiet line across every column.
	 *
	 * A rupture is the line the rest of the record is read against, so it crosses
	 * the spine and every post instead of living in one of them. It carries no
	 * label on the canvas: a label drawn over the columns covers the names it sits
	 * on, and ruptures cluster (the 2013 sequence falls within a few pixels at every
	 * zoom), so labels stack into a wall over exactly the years that matter. The
	 * rupture's mark and its tap target are on the spine, and its title appears at
	 * the reading line as the reader scrolls past it.
	 *
	 * The line spans the full set of columns, not the track: the track is one
	 * window wide and the columns run past it (`--cv-track-w`, from the parent).
	 */
	interface Props {
		event: EventRec;
		scale: VScale;
	}

	let { event, scale }: Props = $props();

	const y = $derived(scale.y(event.interval.startEarliest));
</script>

<div class="cv-rupture" style:top="{y}px" aria-hidden="true"></div>

<style>
	.cv-rupture {
		position: absolute;
		inset-inline-start: 0;
		width: max(100%, var(--cv-track-w));
		height: 1px;
		/* Above the tenure blocks, below the sticky column headers and the spine. */
		z-index: 2;
		pointer-events: none;
		background: var(--rupture-soft);
	}
</style>
