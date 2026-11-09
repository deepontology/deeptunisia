<script lang="ts">
	import BudgetGame from '$lib/budget-game/BudgetGame.svelte';
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
	<BudgetGame />
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
