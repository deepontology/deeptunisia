<script lang="ts">
	import { browser } from '$app/environment';
	import BudgetGame from '$lib/budget-game/BudgetGame.svelte';
	import type { StartMode } from '$lib/budget-game/board';

	/**
	 * Decision D2: the default start is the draft; ?start=empty opens the empty purse.
	 * The query is read in the browser only, because the page is prerendered.
	 */
	let start = $state<StartMode>('draft');
	$effect(() => {
		if (browser) start = new URLSearchParams(window.location.search).get('start') === 'empty' ? 'empty' : 'draft';
	});
	/**
	 * Citizen budget game, study prototype. Placeholder figures only; nothing is
	 * sent, stored or scored. The page is static, is served at /research/citizen-budget/prototype while the
	 * study entry is in design, and the study page links to it.
	 */
</script>

<svelte:head>
	<title>Citizen budget game (prototype) · DeepTunisia</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="scroll">
	<p class="back"><a href="/research/citizen-budget">Back to the study page</a></p>
	<BudgetGame {start} />
</div>

<style>
	.back {
		max-inline-size: 46rem;
		margin: var(--s-6) auto 0;
		padding-inline: var(--s-6);
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
</style>
