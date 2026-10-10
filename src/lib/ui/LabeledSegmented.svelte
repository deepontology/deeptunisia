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
	}

	interface Props {
		options: Option[];
		value: string;
		onchange: (value: string) => void;
		/** Names the group for screen readers; the options themselves are the labels. */
		label?: string;
	}

	let { options, value, onchange, label }: Props = $props();

	const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
</script>

<div class="seg" role="radiogroup" aria-label={label} style:--n={options.length}>
	<span class="indicator" style:--i={index} aria-hidden="true"></span>
	{#each options as opt (opt.value)}
		<button
			type="button"
			role="radio"
			aria-checked={opt.value === value}
			class:selected={opt.value === value}
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
		background: var(--accent);
		border-radius: calc(var(--r-md) - 2px);
		box-shadow: var(--elev-1);
		transition:
			transform var(--dur-normal) var(--ease-spring),
			background var(--dur-fast) var(--ease-out);
	}
	/* The indicator follows text flow, so its anchor is logical
	   (inset-inline-start) and the segment index must travel the opposite
	   direction in RTL: the grid fills from the right there. A physical anchor
	   with only the transform flipped would leave the thumb at the outer edge,
	   aligned with no segment. */
	:global([dir='rtl']) .indicator {
		transform: translateX(calc(var(--i) * -100%));
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
		background: var(--accent);
	}

	/* A thumb needs 44px and a mouse does not. */
	@media (pointer: coarse) {
		button {
			min-height: var(--touch);
		}
	}
</style>
