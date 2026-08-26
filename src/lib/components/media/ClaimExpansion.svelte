<script lang="ts">
	/**
	 * ClaimExpansion — the evidence card behind a claim indicator.
	 * Opens inline below the paragraph. Archival register: a headed card with
	 * the claim, its grade, its sources and any dispute — nothing decorative.
	 */

	import type { Claim, Source } from '$lib/media/types';

	interface Props {
		claim: Claim;
		sources: Source[];
		onclose: () => void;
	}

	let { claim, sources, onclose }: Props = $props();

	const grade = $derived(claim.grade);
	const dispute = $derived(claim.dispute);
	const isNegative = $derived(Boolean(claim.negative));
	const claimText = $derived(claim.text.en ?? '');
</script>

<div class="expansion" id={`claim-expansion-${claim.id}`} role="region" aria-label="Evidence for claim {claim.id}">
	<header class="card-head">
		<span class="id">{claim.id}</span>
		<span class="grade" class:documented={grade === 'documented'} class:reported={grade === 'reported'} class:inferred={grade === 'inferred'} class:unsubstantiated={grade === 'unsubstantiated'}>
			{grade}
		</span>
		{#if isNegative}
			<span class="negative">documented negative</span>
		{/if}
		<button class="close" onclick={onclose} aria-label="Close claim detail">✕</button>
	</header>

	<p class="claim-text">{claimText}</p>

	{#if sources.length > 0}
		<div class="sources">
			<div class="label">Evidence</div>
			{#each sources as source}
				<div class="source">
					<span class="source-id">{source.id}</span>
					{#if source.url}
						<a href={source.url} target="_blank" rel="noopener" class="source-cite">
							{source.citation.en ?? source.url}
						</a>
					{:else}
						<span class="source-cite">
							{source.citation.en ?? 'Source'}
						</span>
					{/if}
					<span class="tier">tier {source.tier}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if dispute}
		<div class="dispute">
			<div class="label">Disputed</div>
			<p class="dispute-desc">{dispute.description}</p>
			{#each (dispute.positions ?? []) as pos}
				<div class="pos">
					<span class="pos-dot" aria-hidden="true"></span>
					<span class="pos-claim">{pos.claim}</span>
					<span class="pos-holder">— {pos.holder}</span>
				</div>
			{/each}
			{#if dispute.adopted}
				<div class="adopted">
					<strong>Adopted:</strong> {dispute.adopted}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.expansion {
		margin: var(--s-2) 0 var(--s-6);
		padding: var(--s-4) var(--s-5) var(--s-5);
		background: var(--surface-raised);
		border: 1px solid var(--border-default);
		border-inline-start: 2px solid var(--border-strong);
		border-radius: var(--r-md);
		box-shadow: var(--elev-1);
		animation: rise-in var(--dur-normal) var(--ease-out);
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}

	.id {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		letter-spacing: var(--track-wide);
		color: var(--text-faint);
	}

	/* The grade is a chip, not a badge: it names the standing of the claim. */
	.grade {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 1px 7px;
		border-radius: var(--r-full);
		border: 1px solid;
	}
	.documented {
		color: var(--basis-documented);
		border-color: color-mix(in oklch, var(--basis-documented) 40%, transparent);
		background: color-mix(in oklch, var(--basis-documented) 8%, transparent);
	}
	.reported {
		color: var(--basis-reported);
		border-color: color-mix(in oklch, var(--basis-reported) 40%, transparent);
		background: color-mix(in oklch, var(--basis-reported) 8%, transparent);
	}
	.inferred {
		color: var(--basis-inferred);
		border-color: color-mix(in oklch, var(--basis-inferred) 40%, transparent);
		background: color-mix(in oklch, var(--basis-inferred) 8%, transparent);
	}
	.unsubstantiated {
		color: var(--basis-unsubstantiated);
		border-color: color-mix(in oklch, var(--basis-unsubstantiated) 40%, transparent);
		background: color-mix(in oklch, var(--basis-unsubstantiated) 8%, transparent);
	}

	.negative {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-full);
		padding: 1px 7px;
	}

	.close {
		margin-inline-start: auto;
		font-size: var(--t-sm);
		color: var(--text-faint);
		padding: var(--s-1) var(--s-2);
		border-radius: var(--r-xs);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.close:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}

	.claim-text {
		font-family: var(--font-serif);
		font-size: var(--t-sm);
		line-height: 1.65;
		color: var(--text-primary);
		margin: 0 0 var(--s-3);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: var(--s-2);
	}

	.sources {
		padding-top: var(--s-3);
		border-top: 1px solid var(--border-subtle);
	}

	.source {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		font-size: var(--t-xs);
		line-height: 1.55;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.source:last-child {
		border-bottom: none;
	}

	.source-id {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--text-faint);
		flex-shrink: 0;
		min-width: 30px;
	}

	.source-cite {
		color: var(--text-secondary);
		word-break: break-word;
		flex: 1;
	}

	.tier {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		flex-shrink: 0;
	}

	/* Dispute block: the amber register of "sources disagree". */
	.dispute {
		margin-top: var(--s-4);
		padding: var(--s-4);
		background: color-mix(in oklch, var(--basis-reported) 7%, transparent);
		border: 1px solid color-mix(in oklch, var(--basis-reported) 25%, transparent);
		border-radius: var(--r-md);
	}
	.dispute-desc {
		font-size: var(--t-xs);
		color: var(--text-secondary);
		margin: 0 0 var(--s-2);
	}
	.pos {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-muted);
		margin-top: var(--s-1);
	}
	.pos-dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--basis-reported);
		flex-shrink: 0;
	}
	.pos-claim {
		color: var(--text-secondary);
	}
	.adopted {
		font-size: var(--t-xs);
		color: var(--text-secondary);
		margin-top: var(--s-2);
		padding-top: var(--s-2);
		border-top: 1px solid color-mix(in oklch, var(--basis-reported) 20%, transparent);
	}
</style>