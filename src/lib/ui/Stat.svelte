<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	/**
	 * A number that counts to its value.
	 *
	 * Not decoration: these numbers change when the reader moves the evidence
	 * threshold or the date, and tweening makes the change legible as a change.
	 * A number that simply swaps is easy to miss.
	 */
	interface Props {
		value: number;
		label?: string;
		suffix?: string;
		tint?: string;
		size?: 'sm' | 'md' | 'lg';
		decimals?: number;
	}

	let { value, label, suffix = '', tint, size = 'md', decimals = 0 }: Props = $props();

	const shown = Tween.of(() => value, { duration: 460, easing: cubicOut });
</script>

<span class="stat s-{size}" style:--tint={tint}>
	<span class="v mono">{shown.current.toFixed(decimals)}{suffix}</span>
	{#if label}<span class="k">{label}</span>{/if}
</span>

<style>
	.stat {
		display: inline-flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.v {
		color: var(--tint, var(--text-primary));
		font-weight: 520;
		letter-spacing: var(--track-tight);
	}
	.k {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		line-height: var(--lh-tight);
	}
	.s-sm .v {
		font-size: var(--t-md);
	}
	.s-md .v {
		font-size: var(--t-xl);
	}
	.s-lg .v {
		font-size: var(--t-3xl);
	}
</style>
