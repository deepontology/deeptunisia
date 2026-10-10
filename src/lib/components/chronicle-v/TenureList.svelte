<script lang="ts">
	import type { Basis } from '$lib/model';
	import type { ChronGroup } from '$lib/chronicle/rows';

	/**
	 * The list — PLACEHOLDER. The wave that owns this component replaces it with the
	 * real chronological table.
	 *
	 * It is the chart's table alternative: every post the canvas draws, in
	 * chronological order, for a reader who is not reading a chart or is on a screen
	 * reader. The canvas is not a substitute for it, so the two must agree about
	 * what is on screen.
	 */
	interface Props {
		groups: ChronGroup[];
		basisFloor: Basis;
	}

	let { groups }: Props = $props();
</script>

<div class="cv-list-root">
	{#each groups as g (g.institutionId)}
		<div class="cv-lg">{g.label} · {g.rows.length}</div>
	{/each}
</div>

<style>
	.cv-list-root {
		padding: var(--s-4);
	}
	.cv-lg {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-muted);
		padding-block: var(--s-2);
		border-bottom: var(--rule);
	}
</style>
