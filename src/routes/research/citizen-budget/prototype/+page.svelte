<script lang="ts">
	import BudgetGame from '$lib/budget-game/BudgetGame.svelte';
	/**
	 * Citizen budget game, study prototype. Placeholder figures only; nothing is
	 * sent, stored or scored. The page is static, is served at /research/citizen-budget/prototype while the
	 * study entry is in design, and is not linked from the study page.
	 */
</script>

<svelte:head>
	<title>Citizen budget game (prototype) · DeepTunisia</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="scroll">
	<BudgetGame />
</div>

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
</style>
