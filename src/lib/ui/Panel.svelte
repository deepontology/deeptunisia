<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A surface. Everything that isn't the base canvas sits in one of these, which is
	 * what gives the app its layered, application-like feel rather than the flat
	 * document feel of a website.
	 *
	 * elevation maps to the token scale: 0 flush, 1 card, 2 floating, 3 modal.
	 */
	interface Props {
		elevation?: 0 | 1 | 2 | 3;
		padded?: boolean;
		inset?: boolean;
		tint?: string;
		class?: string;
		children: Snippet;
	}

	let {
		elevation = 1,
		padded = false,
		inset = false,
		tint,
		class: klass = '',
		children
	}: Props = $props();
</script>

<div class="panel e-{elevation} {klass}" class:padded class:inset style:--tint={tint}>
	{@render children()}
</div>

<style>
	.panel {
		position: relative;
		border-radius: var(--r-lg);
		border: 1px solid var(--border-subtle);
		background: var(--surface-raised);
		transition:
			background var(--dur-normal) var(--ease-in-out),
			border-color var(--dur-normal) var(--ease-in-out),
			box-shadow var(--dur-normal) var(--ease-in-out);
	}
	.padded {
		padding: var(--s-6);
	}
	.inset {
		background: var(--surface-sunken);
	}

	.e-0 {
		box-shadow: none;
		border-radius: 0;
		border: none;
	}
	.e-1 {
		box-shadow: var(--elev-1);
	}
	.e-2 {
		background: var(--surface-panel);
		border-color: var(--border-default);
		box-shadow: var(--elev-2);
	}
	.e-3 {
		background: var(--surface-overlay);
		border-color: var(--border-default);
		box-shadow: var(--elev-4);
	}

	/* A tinted panel gets a hairline accent on its leading edge rather than a
	   coloured background, so tint never fights legibility of content. */
	.panel[style*='--tint'] {
		border-inline-start: 2px solid var(--tint);
	}
</style>
