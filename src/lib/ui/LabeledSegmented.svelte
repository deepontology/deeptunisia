<script lang="ts">
	/**
	 * A segmented control whose options carry full words and an optional short
	 * hint: the same control as `Segmented` at the same visual weight, but
	 * standing where a word is needed instead of a code.
	 *
	 * The sliding indicator is a single absolutely-positioned element that
	 * transitions between segments rather than one background per segment, so
	 * the movement reads as one object moving instead of two things blinking.
	 */
	interface Option {
		value: string;
		label: string;
		hint?: string;
		/** The segment's own colour, for controls whose options are data (a basis). */
		tint?: string;
	}

	interface Props {
		options: Option[];
		value: string;
		onchange: (value: string) => void;
		/** Names the group for screen readers; the options themselves are the labels. */
		label?: string;
		/** `xs` fits a 44px toolbar row; `sm` is the standalone size. */
		size?: 'xs' | 'sm';
		/** Fill every segment up to the selected one, for threshold-style controls. */
		cumulative?: boolean;
	}

	let { options, value, onchange, label, size = 'sm', cumulative = false }: Props = $props();

	const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
	const activeTint = $derived(options[index]?.tint);

	/*
	 * Words are not equally long, so segments are not equally wide: the indicator
	 * is placed on the selected button's measured box rather than at index / n,
	 * which would leave it straddling two words. Re-measured whenever the control
	 * resizes, which covers a language change and a font arriving late.
	 */
	let root = $state<HTMLDivElement | null>(null);
	const buttons: HTMLButtonElement[] = $state([]);
	let box = $state<{ x: number; w: number } | null>(null);

	function place() {
		const b = buttons[index];
		if (b) box = { x: b.offsetLeft, w: b.offsetWidth };
	}

	$effect(() => {
		void index;
		void options;
		place();
	});

	$effect(() => {
		if (!root) return;
		const ro = new ResizeObserver(place);
		ro.observe(root);
		return () => ro.disconnect();
	});
</script>

<div class="seg s-{size}" role="radiogroup" aria-label={label} bind:this={root}>
	<span
		class="indicator"
		class:placed={box !== null}
		style:--x="{box?.x ?? 0}px"
		style:--w="{box?.w ?? 0}px"
		style:--tint={activeTint}
		aria-hidden="true"
	></span>
	{#each options as opt, i (opt.value)}
		<button
			bind:this={buttons[i]}
			type="button"
			role="radio"
			aria-checked={opt.value === value}
			class:selected={opt.value === value}
			class:under={cumulative && i < index}
			style:--tint={opt.tint}
			onclick={() => onchange(opt.value)}
		>
			<span class="word">{opt.label}</span>
			{#if opt.hint}<span class="hint">{opt.hint}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.seg {
		position: relative;
		display: grid;
		grid-auto-flow: column;
		/* Each word takes what it needs; spare width is shared out evenly. */
		grid-auto-columns: auto;
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: 2px;
		isolation: isolate;
	}

	/*
	   Placed in physical pixels on the selected button's measured box. offsetLeft
	   is physical in both directions, so the same rule is correct in RTL, where
	   the grid fills from the right. Hidden until the first measurement, so it
	   never flashes at the wrong segment.
	*/
	.indicator {
		position: absolute;
		z-index: 0;
		top: 2px;
		bottom: 2px;
		left: 0;
		width: var(--w);
		transform: translateX(var(--x));
		opacity: 0;
		background: var(--tint, var(--accent));
		border-radius: calc(var(--r-md) - 2px);
		box-shadow: var(--elev-1);
		transition:
			transform var(--dur-normal) var(--ease-spring),
			width var(--dur-normal) var(--ease-spring),
			background var(--dur-fast) var(--ease-out);
	}
	.indicator.placed {
		opacity: 1;
	}

	button {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		min-height: var(--s-9);
		padding: var(--s-2) var(--s-4);
		border-radius: calc(var(--r-md) - 2px);
		color: var(--text-faint);
		transition: color var(--dur-fast) var(--ease-out);
	}
	/* The word is the label, so it is set as text; the hint is chrome beside it,
	   kept in the mono instrument voice. */
	.word {
		font-family: var(--font-sans);
		font-size: var(--t-sm);
		font-weight: 560;
		letter-spacing: var(--track-tight);
		text-align: center;
	}
	.hint {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		/* Mixed from currentColor so it follows the unselected and selected
		   states without a second rule. */
		color: color-mix(in oklch, currentColor 60%, transparent);
	}
	:global([dir='rtl']) .hint {
		letter-spacing: 0;
	}

	button:hover:not(.selected) {
		color: var(--text-primary);
	}
	/* The visible background of a selected segment is the sliding indicator,
	   which is a sibling. Painting the same colour on the button itself is
	   invisible (the indicator covers it) but makes the element's own contrast
	   honest to anything inspecting computed styles. */
	button.selected {
		color: var(--accent-text);
		background: var(--tint, var(--accent));
	}
	/* Below the selection in a cumulative control: included, not selected. */
	button.under {
		color: var(--tint, var(--accent));
	}

	.s-xs button {
		min-height: 24px;
		padding: 0 var(--s-3);
	}
	.s-xs .word {
		font-size: var(--t-xs);
		white-space: nowrap;
	}

	/* A thumb needs 44px and a mouse does not. */
	@media (pointer: coarse) {
		.s-sm button {
			min-height: var(--touch);
		}
	}
</style>
