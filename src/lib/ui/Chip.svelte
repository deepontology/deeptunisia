<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Small tinted label. Used for epistemic basis, layers, tiers, statuses.
	 * `dot` shows a colour swatch; `solid` fills for maximum emphasis.
	 */
	interface Props {
		tint?: string;
		variant?: 'soft' | 'outline' | 'solid';
		size?: 'xs' | 'sm';
		dot?: boolean;
		mono?: boolean;
		title?: string;
		children: Snippet;
	}

	let {
		tint,
		variant = 'soft',
		size = 'xs',
		dot = false,
		mono = true,
		title,
		children
	}: Props = $props();
</script>

<span class="chip v-{variant} s-{size}" class:mono style:--tint={tint} {title}>
	{#if dot}<i class="dot"></i>{/if}
	{@render children()}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		white-space: nowrap;
		border-radius: var(--r-xs);
		border: 1px solid transparent;
		letter-spacing: var(--track-wide);
		line-height: 1;
	}
	.chip.mono {
		font-family: var(--font-mono);
	}

	.s-xs {
		font-size: var(--t-2xs);
		padding: 2.5px var(--s-3);
	}
	.s-sm {
		font-size: var(--t-xs);
		padding: 3.5px var(--s-4);
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--tint, var(--text-muted));
		flex-shrink: 0;
	}

	.v-soft {
		color: var(--tint, var(--text-muted));
		background: color-mix(in oklch, var(--tint, var(--text-muted)) 13%, transparent);
		border-color: color-mix(in oklch, var(--tint, var(--text-muted)) 30%, transparent);
	}
	.v-outline {
		color: var(--text-muted);
		border-color: var(--border-default);
	}
	.v-solid {
		color: var(--accent-text);
		background: var(--tint, var(--text-muted));
		font-weight: 560;
	}
	.v-soft .dot,
	.v-outline .dot {
		background: var(--tint, var(--text-muted));
	}
	.v-solid .dot {
		background: var(--accent-text);
	}
</style>
