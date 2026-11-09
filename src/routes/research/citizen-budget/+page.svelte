<script lang="ts">
	import BudgetGame from '$lib/budget-game/BudgetGame.svelte';
	/**
	 * Citizen budget game, study prototype. Placeholder figures only; nothing is
	 * sent, stored or scored. The page is static and sits outside the research
	 * registry on purpose, so it is not listed as a study.
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
