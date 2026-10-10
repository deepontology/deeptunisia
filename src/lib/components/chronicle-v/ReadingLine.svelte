<script lang="ts">
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * The reading line — PLACEHOLDER. The wave that owns this component replaces it.
	 *
	 * What is already decided: the line sits at 40% of the scroller's height, and it
	 * is the two-way link between the scroll position and `app.t` — scrolling moves
	 * the shared date, and a change to the shared date moves the scroll. The
	 * `scroller` prop is the element the parent scrolls, not the page.
	 */
	interface Props {
		scale: VScale;
		scroller: HTMLElement;
	}

	let { scroller }: Props = $props();
</script>

<div class="cv-rl"></div>

<style>
	.cv-rl {
		height: 2px;
		background: var(--accent);
	}
</style>
