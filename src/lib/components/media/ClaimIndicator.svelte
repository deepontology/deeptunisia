<script lang="ts">
	/**
	 * ClaimIndicator — renders a [C048] claim reference as an inline evidence
	 * marker. A small mono chip with a basis-colour dot; the colour stays quiet
	 * at rest and emerges on hover/expand, so the prose keeps the reading flow.
	 *
	 * The dot is the same register the graph uses for basis colours — the reader
	 * who has learned the Chronicle's colours reads this without re-learning.
	 */

	import type { Claim } from '$lib/media/types';

	interface Props {
		claim: Claim;
		expanded: boolean;
		onclick: () => void;
	}

	let { claim, expanded, onclick }: Props = $props();

	const grade = $derived(claim.grade);
	const id = $derived(claim.id);
	// Every known grade maps to its own basis colour. An UNKNOWN grade gets a
	// deliberately unclassified neutral: it must never borrow the documented
	// green, which would lend an ungraded claim the strongest standing in the
	// vocabulary. The build's grade validator keeps this branch rare; when it
	// does fire, faint ink is the honest rendering.
	const tint = $derived.by(() => {
		switch (grade) {
			case 'documented': return 'var(--basis-documented)';
			case 'reported': return 'var(--basis-reported)';
			case 'inferred': return 'var(--basis-inferred)';
			case 'unsubstantiated': return 'var(--basis-unsubstantiated)';
			default: return 'var(--text-faint)';
		}
	});
</script>

<button
	class="indicator"
	class:expanded
	style:--c={tint}
	aria-expanded={expanded}
	aria-controls={`claim-expansion-${id}`}
	aria-label="Evidence claim {id}, grade: {grade}"
	onclick={(e) => { e.stopPropagation(); onclick(); }}
>
	<span class="dot" aria-hidden="true"></span>
	{id}
	{#if claim.disputed}
		<span class="disputed-mark" aria-label="disputed">!</span>
	{/if}
</button>

<style>
	.indicator {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.02em;
		line-height: 1.6;
		padding: 0 5px 0 4px;
		border-radius: 3px;
		vertical-align: 1px;
		cursor: pointer;
		border: 1px solid var(--border-default);
		background: var(--surface-sunken);
		color: var(--text-muted);
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}

	/* The basis dot — the only colour at rest. */
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--c);
		flex-shrink: 0;
		opacity: 0.75;
		transition: opacity var(--dur-fast) var(--ease-out);
	}

	.indicator:hover {
		border-color: color-mix(in oklch, var(--c) 45%, var(--border-default));
		color: var(--text-primary);
		background: var(--surface-raised);
	}
	.indicator:hover .dot {
		opacity: 1;
	}

	/* Expanded: the colour steps up but never fills — the prose stays readable. */
	.indicator.expanded {
		border-color: color-mix(in oklch, var(--c) 55%, transparent);
		background: color-mix(in oklch, var(--c) 12%, var(--surface-raised));
		color: color-mix(in oklch, var(--c) 72%, var(--text-primary));
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--c) 14%, transparent);
	}
	.indicator.expanded .dot {
		opacity: 1;
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--c) 22%, transparent);
	}

	.disputed-mark {
		font-size: 9px;
		font-weight: 700;
		line-height: 1;
		display: grid;
		place-items: center;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: color-mix(in oklch, var(--basis-unsubstantiated) 22%, var(--surface-sunken));
		color: var(--basis-unsubstantiated);
		border: 1px solid color-mix(in oklch, var(--basis-unsubstantiated) 35%, transparent);
	}
</style>
