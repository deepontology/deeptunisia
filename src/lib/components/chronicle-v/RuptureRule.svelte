<script lang="ts">
	import type { EventRec } from '$lib/model';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * A rupture rule — PLACEHOLDER. The wave that owns this component replaces it.
	 *
	 * What is already decided: a rule is one event, it spans the whole strip rather
	 * than a single column, and its vertical position comes from the scale so it
	 * lands on the year the sources give the event.
	 */
	interface Props {
		event: EventRec;
		scale: VScale;
	}

	let { event, scale }: Props = $props();
</script>

<div class="cv-rule" style:top="{scale.y(event.interval.startEarliest)}px"></div>

<style>
	.cv-rule {
		position: absolute;
		inset-inline: 0;
		height: 1px;
		z-index: var(--z-sheet);
		background: var(--rupture-soft);
	}
</style>
