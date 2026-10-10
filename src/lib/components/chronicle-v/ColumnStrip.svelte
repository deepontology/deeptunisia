<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The column strip — PLACEHOLDER. The wave that owns this component replaces it.
	 *
	 * Two things are already decided and must survive into the real one, because the
	 * layout depends on them:
	 *
	 *  - The parent's scroller element is the scroll container for BOTH axes, and it
	 *    is the element handed to `ReadingLine` as `scroller`. Nothing inside the
	 *    strip may become a scroll container of its own, or the sticky column
	 *    headers would stick to it instead of to the top of the canvas.
	 *  - This root is the track, sized `width: max-content`, so the columns overflow
	 *    the scroller and the strip scrolls horizontally.
	 *
	 * The canvas height arrives as the `--cv-h` custom property, set by the parent
	 * on its stage element.
	 */
	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="cv-track">
	{@render children()}
</div>

<style>
	.cv-track {
		position: relative;
		display: flex;
		align-items: stretch;
		width: max-content;
		min-width: 100%;
		height: var(--cv-h, 100%);
	}
</style>
