<script lang="ts">
	import { type Basis } from '$lib/model';
	import { type ChronRow } from '$lib/chronicle/rows';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * One column, one post — PLACEHOLDER. The wave that owns this component replaces
	 * it. What is already decided: the column is a fixed minimum width on a track of
	 * full canvas height, and its header is the part that sticks to the top of the
	 * canvas while the timeline scrolls under it.
	 */
	interface Props {
		row: ChronRow;
		scale: VScale;
		focus: 'none' | 'linked' | 'dim';
		basisFloor: Basis;
		onselect(personId: string): void;
	}

	let { scale }: Props = $props();
</script>

<div class="cv-col" style:height="{scale.height}px"></div>

<style>
	.cv-col {
		flex: 1 0 var(--cv-col-min);
		min-width: var(--cv-col-min);
		border-inline-start: var(--rule);
		/* A wash, so the skeleton's column tracks are visible before the tenures
		   land. The wave that owns this component paints the tenures instead. */
		background: var(--surface-hover);
	}
</style>
