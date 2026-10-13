<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { tf } from '$lib/t.svelte';

	/**
	 * A full-bleed artwork plate, ink in both themes, with a `FIG. n` caption.
	 *
	 * The artwork ships exactly as made: no filter, tint, blend mode or resize
	 * beyond `width: 100%`. A plate frames the work, it does not process it, and
	 * the reader sees what the maker drew. That is why the ground is `--plate-bg`
	 * in every theme and palette instead of following the reader's surfaces.
	 *
	 * An animated plate carries a `still`. Under `prefers-reduced-motion` the
	 * still replaces the animation, so the frame that carries the meaning stays
	 * and the movement stops.
	 */
	interface Props {
		/** The artwork as made; may be animated. */
		src: string;
		/** Static frame, shown instead of `src` when reduced motion is preferred. */
		still?: string;
		alt: string;
		n: number;
		caption: string;
	}

	let { src, still, alt, n, caption }: Props = $props();

	const mediaSrc = $derived(still && prefersReducedMotion.current ? still : src);
</script>

<figure class="plate">
	<img src={mediaSrc} {alt} loading="lazy" decoding="async" />
	<figcaption>
		<span class="fig">{tf('plate.fig', { n })}</span>
		<span class="sep" aria-hidden="true">·</span>
		<span class="cap">{caption}</span>
	</figcaption>
</figure>

<style>
	/* Full-bleed of its container. The page decides how wide that is (place the
	   plate outside the prose column to span the page); a 100vw breakout would
	   include the scrollbar and overflow the page sideways. */
	.plate {
		margin: 0;
		width: 100%;
		background: var(--plate-bg);
	}

	img {
		display: block;
		width: 100%;
		height: auto;
	}

	figcaption {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		max-width: var(--measure);
		margin-inline: auto;
		padding: var(--s-4) var(--s-6) var(--s-5);
		color: var(--plate-ink);
	}
	.fig {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		white-space: nowrap;
	}
	:global([dir='rtl']) .fig {
		letter-spacing: 0;
	}
	.sep {
		color: var(--plate-ink);
		opacity: var(--dim);
	}
	.cap {
		flex: 1;
		min-width: 0;
		font-family: var(--font-read);
		font-size: var(--step--1);
		line-height: var(--lh-normal);
	}
</style>
