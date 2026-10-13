<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { ABOUT_IN_TOOLBAR, answerKeyFor } from '$lib/views';
	import AboutView from './AboutView.svelte';

	/**
	 * The window body.
	 *
	 * Keyed on the pathname so each view mounts fresh and animates in. That matters
	 * for more than polish: the instruments hold local state (Chronicle's zoom
	 * domain, Investigate's query) and remounting gives each a clean slate rather
	 * than leaking one view's state into the next.
	 *
	 * The view's one-sentence answer ("Who held which post, when, drawn to scale")
	 * comes from the same source the /guide table renders, so the two can never
	 * disagree. It lives in "About this view": inside the view's own toolbar where
	 * the view has one, otherwise as a row here, a sibling of the view rather than
	 * chrome, so the view still owns its scroll and flexes to fill the rest.
	 */
	let { children }: { children: Snippet } = $props();

	const aboutRow = $derived(
		answerKeyFor(page.url.pathname) !== null && !ABOUT_IN_TOOLBAR.has(page.url.pathname)
	);
</script>

<main class="viewport" id="view" tabindex="-1" data-tour="canvas">
	{#key page.url.pathname}
		<div class="view">
			{#if aboutRow}
				<AboutView standalone />
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

	.body {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
