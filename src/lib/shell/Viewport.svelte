<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { t } from '$lib/t.svelte';
	import { answerKeyFor } from '$lib/views';

	/**
	 * The window body.
	 *
	 * Keyed on the pathname so each view mounts fresh and animates in. That matters
	 * for more than polish: the instruments hold local state (Chronicle's zoom
	 * domain, Investigate's query) and remounting gives each a clean slate rather
	 * than leaking one view's state into the next.
	 *
	 * The caption line is the view's one-sentence answer ("Who held which post,
	 * when, drawn to scale") — the same source the /guide table renders, so the
	 * two can never disagree. It is a sibling of the view, not chrome: the view
	 * owns its scroll and flexes to fill whatever the caption does not take.
	 */
	let { children }: { children: Snippet } = $props();

	const captionKey = $derived(answerKeyFor(page.url.pathname));
</script>

<main class="viewport" id="view" tabindex="-1" data-tour="canvas">
	{#key page.url.pathname}
		<div class="view">
			{#if captionKey}
				<p class="caption">{t(captionKey)}</p>
			{/if}
			<div class="body">
				{@render children()}
			</div>
		</div>
	{/key}
</main>

<style>
	.viewport {
		position: relative;
		flex: 1;
		min-height: 0;
		/*
		   Without this a flex item refuses to shrink below its content's intrinsic
		   width, so any view with a wide toolbar or table stretched the viewport past
		   the window. The shell clips that, which hides it — but `overflow: hidden`
		   stays scriptable, so focusing an off-screen control then panned the entire
		   application window sideways. Views are responsible for scrolling their own
		   wide content; this makes sure they are asked to.
		*/
		min-width: 0;
		display: flex;
		background:
			radial-gradient(
				120% 90% at 50% -20%,
				color-mix(in oklch, var(--accent) 5%, transparent),
				transparent 60%
			),
			var(--surface-base);
	}
	.view {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		animation: view-in var(--dur-normal) var(--ease-out);
	}

	/*
		The one-sentence answer for the current view. A quiet line, not chrome:
		it is a sibling of the view, so the instrument flexes to fill the rest and
		owns its own scroll as before. Mono and faint so it never competes with
		the view's own toolbar.
	*/
	.caption {
		flex: 0 0 auto;
		margin: 0;
		padding: 6px calc(var(--s-5) + var(--safe-l)) 6px calc(var(--s-5) + var(--safe-r));
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-bottom: 1px solid var(--border-subtle);
	}

	.body {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
