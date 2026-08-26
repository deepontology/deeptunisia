<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, describeInterval, basisLabel, relLabel } from '$lib/t.svelte';
	import SourceList from './SourceList.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import CommunityActions from '$lib/ui/CommunityActions.svelte';
	import {
		LAYER_COLOR,
		REL_LABEL,
		resolveEntity,
		type Basis,
		type Confidence,
		type Layer
	} from '$lib/model';
	import { AGORA_OPEN } from '$lib/agora-gate';

	/**
	 * A connection, as a record in its own right.
	 *
	 * WHY THIS EXISTS
	 *
	 * A relationship used to be a hover tooltip pinned to the corner of the canvas.
	 * That made the edges the only objects in the project you could see but not
	 * address: no way to link to one, cite one, or argue about one, even though the
	 * relationships are where almost all of the contested claims live. "Ben Ali's
	 * brother-in-law controlled that bank" is an edge, not a node, and it is exactly
	 * the kind of assertion that needs a place to be challenged.
	 *
	 * So the card carries the same apparatus a person's card does — basis, confidence,
	 * who is making the claim, the sources behind it — plus the two community
	 * affordances. The Agora schema already accepts `target_type='relationship'`; only
	 * the interface was missing.
	 *
	 * The endpoints are buttons rather than text: reading an edge almost always
	 * prompts a question about one of its ends, and making the reader hunt for the
	 * node again in a graph of three hundred is the wrong answer to that.
	 */

	interface Edge {
		id: string;
		rel: {
			id: string;
			from: string;
			to: string;
			type: string;
			subtype?: string;
			basis?: string;
			confidence?: string;
			description?: string;
			attributed_to?: string;
			sources?: string[];
			interval?: { raw: { start: string | null } };
		};
		crossLayer: boolean;
		active: boolean;
		a: { layer: Layer };
	}

	let {
		edge,
		onclose,
		onpick
	}: { edge: Edge; onclose: () => void; onpick: (id: string) => void } = $props();

	const rel = $derived(edge.rel);
	const from = $derived(resolveEntity(rel.from));
	const to = $derived(resolveEntity(rel.to));

	/** What the Agora thread will be called, since a relationship id means nothing. */
	const label = $derived(`${from?.name ?? rel.from} → ${to?.name ?? rel.to}`);

	const dated = $derived(Boolean(rel.interval?.raw.start));
	const measurement = $derived(edge.id.startsWith('flow-'));
	const discussionTarget = $derived(rel.from === 'etat-tunisien' ? rel.to : rel.from);

	/*
	 * A membership edge is synthesised from a position record rather than authored as a
	 * relationship, so it has no relationship id to hang a thread on. Offering
	 * "discuss this" against an id that does not exist in the graph would file
	 * something nobody could ever find again — the position itself is the addressable
	 * record, and that is reachable from either endpoint's card.
	 */
	const addressable = $derived(!edge.id.startsWith('pos-'));
</script>

<article class="card" style:--c={LAYER_COLOR[edge.a.layer]}>
	<header>
		<div class="verb">
			<span class="eyebrow">{relLabel(rel.type)}</span>
			{#if rel.subtype && rel.subtype !== rel.type}
				<span class="sub" dir="auto">{rel.subtype}</span>
			{/if}
		</div>
		<button class="close" onclick={onclose} aria-label={t('panel.close')}>×</button>
	</header>

	<div class="ends">
		<button class="end" onclick={() => onpick(rel.from)}>{from?.name ?? rel.from}</button>
		<span class="arrow" aria-hidden="true">→</span>
		<button class="end" onclick={() => onpick(rel.to)}>{to?.name ?? rel.to}</button>
	</div>

	{#if rel.description}
		<p class="desc" dir="auto">{rel.description}</p>
	{/if}

	<div class="meta">
		{#if measurement}
			<Chip variant="outline" size="xs">{t('network.measurement')}</Chip>
		{/if}
		{#if rel.basis}
			<Chip size="xs" dot tint="var(--basis-{rel.basis})">
				{rel.confidence ? `${rel.confidence} — ` : ''}{basisLabel(rel.basis as Basis)}
			</Chip>
		{/if}
		{#if edge.crossLayer}
			<Chip variant="outline" size="xs" tint="var(--bridge)">{t('network.legend.crosses')}</Chip>
		{/if}
		{#if !edge.active}
			<Chip variant="outline" size="xs">{t('network.notnow')}</Chip>
		{/if}
	</div>

	{#if dated && rel.interval}
		<p class="span mono">{describeInterval(rel.interval as never)}</p>
	{/if}

	<!--
		Rule 4: a low-confidence claim must name who is making it. Rendered as a
		sentence rather than a chip, because "somebody said this" is the single most
		important thing about a reported edge and a chip reads as a tag.
	-->
	{#if rel.attributed_to}
		<p class="attrib">
			<span class="eyebrow">{t('panel.claimedby')}</span>
			{rel.attributed_to}
		</p>
	{/if}

	{#if rel.sources?.length}
		<div class="sources">
			<SourceList ids={rel.sources} compact />
		</div>
	{/if}

	{#if addressable}
		<footer>
			<CommunityActions type="relationship" id={rel.id} {label} />
		</footer>
	{:else if measurement}
		<footer>
			{#if AGORA_OPEN}
				<a
					class="discuss"
					href={`/agora?target_type=institution&target_id=${discussionTarget}&label=${encodeURIComponent(label)}`}
				>{t('panel.discuss')}</a>
			{:else}
				<p class="note">{t('world.measurement.discuss')}</p>
			{/if}
		</footer>
	{:else}
		<p class="note">{t('network.frompost')}</p>
	{/if}
</article>

<style>
	.card {
		width: 320px;
		max-width: calc(100vw - var(--s-7));
		max-height: min(60vh, 480px);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--s-5) var(--s-6) var(--s-6);
		background: color-mix(in oklch, var(--surface-overlay) 96%, transparent);
		border: 1px solid var(--border-strong);
		/* The leading hairline carries the layer the connection originates in, the same
		   way Panel does. A coloured fill would compete with the map behind it. */
		border-inline-start: 2px solid var(--c);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-4);
		backdrop-filter: blur(10px);
		animation: rise-in var(--dur-fast) var(--ease-out);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.verb {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.sub {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.close {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		margin: -4px -6px 0 0;
		display: grid;
		place-items: center;
		font-size: var(--t-lg);
		line-height: 1;
		color: var(--text-faint);
		border-radius: var(--r-sm);
	}
	.close:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}

	.ends {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-top: var(--s-3);
	}
	.end {
		font-size: var(--t-md);
		font-weight: 540;
		text-align: start;
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
		border-bottom: 1px solid var(--border-default);
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.end:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-border);
	}
	.arrow {
		color: var(--text-faint);
		font-size: var(--t-sm);
	}

	.desc {
		margin-top: var(--s-4);
		font-size: var(--t-base);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}

	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-top: var(--s-5);
	}

	.span {
		margin-top: var(--s-4);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	.attrib {
		margin-top: var(--s-5);
		padding-inline-start: var(--s-4);
		border-inline-start: 2px solid var(--basis-inferred);
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.attrib .eyebrow {
		display: block;
		margin-bottom: var(--s-1);
	}

	.sources {
		margin-top: var(--s-5);
		padding-top: var(--s-5);
		border-top: 1px solid var(--border-subtle);
	}

	footer {
		display: flex;
		gap: var(--s-3);
		margin-top: var(--s-6);
	}
	.discuss {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: var(--s-2) var(--s-4);
		border: 1px solid var(--accent-border);
		border-radius: var(--r-md);
		background: var(--accent-muted);
		color: var(--accent-text);
		font-size: var(--t-xs);
	}

	.note {
		margin-top: var(--s-5);
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		color: var(--text-faint);
	}

	@media (max-width: 900px) {
		.card {
			width: 100%;
			max-height: 52vh;
		}
	}
</style>
