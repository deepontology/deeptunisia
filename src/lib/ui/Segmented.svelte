<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	/**
	 * Segmented control with a sliding indicator.
	 *
	 * The indicator is a single absolutely-positioned element that transitions
	 * between segments rather than one background per segment. That is what makes
	 * the movement read as one object moving instead of two things blinking, and it
	 * is why this is a component rather than a row of buttons.
	 */
	interface Option {
		value: string;
		label: string;
		title?: string;
		tint?: string;
	}

	interface Props {
		options: Option[];
		value: string;
		onchange: (value: string) => void;
		size?: 'xs' | 'sm';
		label?: string;
		/** Fill every segment up to the selected one, for threshold-style controls. */
		cumulative?: boolean;
	}

	let { options, value, onchange, size = 'sm', label, cumulative = false }: Props = $props();

	const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
	const activeTint = $derived(options[index]?.tint);
</script>

<div class="seg s-{size}" role="radiogroup" aria-label={label} style:--n={options.length}>
	<span
		class="indicator"
		style:--i={index}
		style:--tint={activeTint}
		aria-hidden="true"
	></span>
	{#each options as opt, i (opt.value)}
		{#if opt.title}
			<Tooltip content={opt.title}>
				<button
					role="radio"
					aria-checked={opt.value === value}
					class:selected={opt.value === value}
					class:under={cumulative && i < index}
					style:--tint={opt.tint}
					onclick={() => onchange(opt.value)}
				>
					{opt.label}
				</button>
			</Tooltip>
		{:else}
			<button
				role="radio"
				aria-checked={opt.value === value}
				class:selected={opt.value === value}
				class:under={cumulative && i < index}
				style:--tint={opt.tint}
				onclick={() => onchange(opt.value)}
			>
				{opt.label}
			</button>
		{/if}
	{/each}
</div>

<style>
	.seg {
		position: relative;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: 2px;
		isolation: isolate;
	}

	.indicator {
		position: absolute;
		z-index: 0;
		top: 2px;
		bottom: 2px;
		inset-inline-start: 2px;
		width: calc((100% - 4px) / var(--n));
		transform: translateX(calc(var(--i) * 100%));
		background: var(--tint, var(--accent));
		border-radius: calc(var(--r-md) - 2px);
		box-shadow: var(--elev-1);
		transition:
			transform var(--dur-normal) var(--ease-spring),
			background var(--dur-fast) var(--ease-out);
	}
	/* The indicator follows text flow, so its anchor is logical (inset-inline-start)
	   and the segment index must travel the opposite direction in RTL — the grid
	   fills from the right there. Keeping the anchor physical and flipping only the
	   transform was the bug: the thumb sat at the outer edge of the control,
	   aligned with no segment. */
	:global([dir='rtl']) .indicator {
		transform: translateX(calc(var(--i) * -100%));
	}

	button {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		letter-spacing: var(--track-wide);
		color: var(--text-faint);
		border-radius: calc(var(--r-md) - 2px);
		transition: color var(--dur-fast) var(--ease-out);
	}
	/* A segment with a hint is wrapped in Tooltip's span, which becomes the grid
	   item in the button's place. The wrapper must behave like the button did —
	   one equal track, filled edge to edge — or the sliding indicator's index
	   arithmetic stops matching the visible segments. */
	.seg :global(.tt-anchor) {
		display: grid;
		min-width: 0;
	}
	.seg :global(.tt-anchor button) {
		width: 100%;
	}
	button:hover:not(.selected) {
		color: var(--text-primary);
	}
	/* The visible background of a selected segment is the sliding indicator, which is
	   a sibling. Painting the same colour on the button itself is invisible (the
	   indicator covers it) but makes the element's own contrast honest to anything
	   inspecting computed styles — including the accessibility audit. */
	button.selected {
		color: var(--accent-text);
		background: var(--tint, var(--accent));
		font-weight: 560;
	}
	/* Segments below the active one in a cumulative control are "included but not
	   selected" — a genuinely different state that needs its own treatment. */
	button.under {
		color: var(--tint, var(--accent));
	}

	.s-xs button {
		height: 20px;
		padding: 0 var(--s-4);
		font-size: var(--t-2xs);
	}
	.s-sm button {
		height: 24px;
		padding: 0 var(--s-5);
		font-size: var(--t-xs);
	}
</style>
