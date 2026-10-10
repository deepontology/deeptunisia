<script lang="ts">
	import type { EventRec } from '$lib/model';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * The year spine — PLACEHOLDER. The wave that owns this component replaces it.
	 *
	 * What is already decided: the spine is `var(--cv-spine-w)` wide, it is pinned to
	 * the inline-start edge so it stays put while the columns scroll underneath it,
	 * and its ticks come from `scale.ticks()` rather than from a hand-written year
	 * list.
	 */
	interface Props {
		scale: VScale;
		events: EventRec[];
		onpick(eventIds: string[]): void;
	}

	let { scale }: Props = $props();
</script>

<div class="cv-spine" style:height="{scale.height}px"></div>

<style>
	.cv-spine {
		position: sticky;
		inset-inline-start: 0;
		z-index: 3;
		flex: 0 0 var(--cv-spine-w);
		min-width: var(--cv-spine-w);
		align-self: stretch;
		background: var(--surface-sunken);
		border-inline-end: var(--rule);
	}
</style>
