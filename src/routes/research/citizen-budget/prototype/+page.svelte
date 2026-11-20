<script lang="ts">
	import { browser } from '$app/environment';
	import BudgetGame from '$lib/budget-game/BudgetGame.svelte';
	import { app } from '$lib/state.svelte';
	import { boardCopyFor } from '$lib/budget-game/board-copy';
	import { DEFAULT_RULE, type MoveRule, type StartMode } from '$lib/budget-game/board';

	/**
	 * The default start is the draft (owner decision D2): every system at its
	 * plan and the purse empty. ?start=empty is the flag for the empty start.
	 *
	 * The default move rule is the 100 MD coin (option A). ?rule=step switches
	 * to 5% steps (option B) so the owner can play both.
	 *
	 * Queries are read in the browser only, because the page is prerendered.
	 */
	let start = $state<StartMode>('draft');
	let rule = $state<MoveRule>(DEFAULT_RULE);
	let playing = $state(false);
	$effect(() => {
		if (!browser) return;
		const q = new URLSearchParams(window.location.search);
		start = q.get('start') === 'empty' ? 'empty' : 'draft';
		rule = q.get('rule') === 'step' ? 'step' : q.get('rule') === 'coin' ? 'coin' : DEFAULT_RULE;
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
	<p class="back"><a href="/research/citizen-budget">{boardCopyFor(app.locale).back}</a></p>
	{#key `${start}-${rule}`}
		<BudgetGame {start} {rule} onstep={(s) => (playing = s === 'board')} />
	{/key}
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
