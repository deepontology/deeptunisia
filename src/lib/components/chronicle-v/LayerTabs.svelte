<script lang="ts">
	import type { Layer } from '$lib/model';

	/**
	 * Layer tabs — PLACEHOLDER. The wave that owns this component replaces it.
	 *
	 * The vertical Chronicle reads one layer at a time, so this is a choice of one
	 * layer, not the multi-select the horizontal chart uses.
	 */
	interface Props {
		layers: { id: Layer; label: string; count: number; marked: boolean }[];
		active: Layer;
		onchange(l: Layer): void;
	}

	let { layers, active, onchange }: Props = $props();
</script>

<div class="cv-tabs-root">
	{#each layers as l (l.id)}
		<button
			type="button"
			class="cv-tab"
			class:on={l.id === active}
			style:--tab-tint="var(--layer-{l.id})"
			aria-pressed={l.id === active}
			onclick={() => onchange(l.id)}
		>
			<span class="dot"></span>
			<span class="lab">{l.label}</span>
		</button>
	{/each}
</div>

<style>
	.cv-tabs-root {
		display: flex;
		gap: var(--s-2);
		overflow-x: auto;
		scrollbar-width: none;
		min-width: 0;
	}
	.cv-tab {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		flex: 0 0 auto;
		min-height: var(--touch);
		padding-inline: var(--s-4);
		border-radius: var(--r-full);
		border: var(--rule);
		color: var(--text-muted);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.cv-tab.on {
		color: var(--text-primary);
		background: var(--surface-active);
		border-color: var(--border-strong);
	}
	.dot {
		width: var(--s-2);
		height: var(--s-2);
		border-radius: var(--r-full);
		background: var(--tab-tint, var(--text-faint));
	}
	.lab {
		font-size: var(--t-sm);
		white-space: nowrap;
	}
</style>
