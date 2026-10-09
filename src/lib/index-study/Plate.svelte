<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A full-width plate: one of the study's own artworks, edge to edge.
	 *
	 * The artwork is shipped exactly as it was made. The source GIFs are 1-bit
	 * and every frame is kept, pixel for pixel, as lossless animated WebP
	 * (static/research/media/). Nothing here redraws, tints or resamples it
	 * beyond the browser fitting it to the screen. A reader who asks for
	 * reduced motion gets the first frame as a still.
	 *
	 * The plate is decorative (empty alt): what it shows is said in the caption
	 * under it, which a screen reader reads as text.
	 */
	let {
		name,
		width,
		height,
		/** object-position, for where the crop holds on narrow screens. */
		focus = '50% 50%',
		eager = false,
		label,
		caption,
		children,
		class: klass = ''
	}: {
		name: string;
		width: number;
		height: number;
		focus?: string;
		eager?: boolean;
		label: string;
		caption: string;
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<figure class="plate {klass}">
	<div class="plate-frame">
		<picture>
			<source media="(prefers-reduced-motion: reduce)" srcset="/research/media/{name}-still.webp" type="image/webp" />
			<img
				src="/research/media/{name}.webp"
				alt=""
				{width}
				{height}
				loading={eager ? 'eager' : 'lazy'}
				fetchpriority={eager ? 'high' : 'auto'}
				decoding="async"
				style:object-position={focus}
			/>
		</picture>
		{#if children}<div class="plate-over">{@render children()}</div>{/if}
	</div>
	<figcaption class="plate-cap mono"><span>{label}</span>{caption}</figcaption>
</figure>

<style>
	.plate {
		margin: 0;
		/* Edge to edge of the reading area, whatever column it sits in. The
		   scroll container is the size container (IndexStudy .scroll). */
		width: 100cqw;
		margin-inline: calc(50% - 50cqw);
	}
	.plate-frame {
		position: relative;
		height: var(--plate-h, 60vh);
		background: #000;
		overflow: hidden;
	}
	picture,
	img {
		display: block;
		width: 100%;
		height: 100%;
	}
	img {
		object-fit: cover;
	}
	.plate-over {
		position: absolute;
		inset: 0;
	}
	.plate-cap {
		display: flex;
		gap: 0.9em;
		max-width: 72rem;
		margin: 0 auto;
		padding: 0.55rem 1rem 0;
		font-size: 0.625rem;
		line-height: 1.5;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.plate-cap span {
		flex: none;
		color: var(--text-secondary);
	}
	:global(.rtl) .plate-cap {
		letter-spacing: 0;
	}
</style>
