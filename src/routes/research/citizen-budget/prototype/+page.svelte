<script lang="ts">
	import { browser } from '$app/environment';
	import BudgetGame from '$lib/budget-game/BudgetGame.svelte';
	import type { StartMode } from '$lib/budget-game/board';

	/**
	 * The default start is the draft: every system at its draft and an empty
	 * purse. That is the version 1 study arm. ?start=empty is the prototype view
	 * with every system at zero and the whole envelope in the purse. The query is
	 * read in the browser only, because the page is prerendered.
	 */
	let start = $state<StartMode>('draft');
	let playing = $state(false);
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

<div class="scroll" class:playing>
	<p class="back"><a href="/research/citizen-budget">Back to the study page</a></p>
	<BudgetGame {start} onstep={(s) => (playing = s === 'board')} />
</div>

<style>
	.back {
		flex: none;
		max-inline-size: 46rem;
		margin: var(--s-6) auto 0;
		padding-inline: var(--s-6);
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}
	/* The board is one screen. The intro, questions and result screens scroll. */
	.scroll.playing {
		overflow: hidden;
	}
	@media (max-width: 900px) {
		.scroll.playing .back {
			display: none;
		}
	}
</style>
