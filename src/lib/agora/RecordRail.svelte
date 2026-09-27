<script lang="ts">
	/**
	 * The record rail: whatever record a thread is anchored to, rendered beside it.
	 *
	 * This is the landing page's headline promise made physical — "the entity's
	 * trajectory, offices, documented connections and sources stay beside you while
	 * you argue about them". The heavy lifting is not here; EntityPanel and
	 * RecordPanel already render every kind of record and were written to be reused
	 * inline (both say so at the top of their files). This component decides which
	 * one a target type resolves to and routes selection back to the rail rather
	 * than to the shell Inspector.
	 */
	import EntityPanel from '$lib/components/EntityPanel.svelte';
	import RecordPanel from '$lib/components/RecordPanel.svelte';
	import ConnectionCard from '$lib/components/ConnectionCard.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import SourceList from '$lib/components/SourceList.svelte';
	import { t, basisLabel, confidenceLabel, describeInterval, nameOf } from '$lib/t.svelte';
	import {
		communityTypeOf,
		institutionById,
		personById,
		positionById,
		relationshipById,
		roleById,
		sourceById,
		type Basis,
		type Layer
	} from '$lib/model';

	interface Props {
		/** The declared target type from the URL, used only as a fallback. */
		type: string;
		id: string;
		/** Re-points the rail when a record inside it is clicked. */
		onselect: (type: string, id: string) => void;
	}

	let { type, id, onselect }: Props = $props();

	/** The graph's own answer wins over the URL's claim about a type. */
	const kind = $derived(communityTypeOf(id));

	const isCard = $derived(
		kind === 'person' ||
			kind === 'institution' ||
			kind === 'contract' ||
			kind === 'licence' ||
			kind === 'declaration' ||
			kind === 'education' ||
			kind === 'event' ||
			kind === 'company'
	);

	/** A nested pick: the rail asks the page to re-point it at another record. */
	function pick(next: string) {
		onselect(communityTypeOf(next), next);
	}

	const rel = $derived(relationshipById.get(id) ?? null);
	const source = $derived(sourceById.get(id) ?? null);
	const position = $derived(positionById.get(id) ?? null);
	const role = $derived(roleById.get(id) ?? null);

	const relEdge = $derived.by(() => {
		if (!rel) return null;
		const fromPerson = personById.get(rel.from);
		const fromInst = institutionById.get(rel.from);
		const fromLayers = (fromPerson?.layers ?? (fromInst ? [fromInst.layer] : [])) as Layer[];
		const toPerson = personById.get(rel.to);
		const toInst = institutionById.get(rel.to);
		const toLayers = (toPerson?.layers ?? (toInst ? [toInst.layer] : [])) as Layer[];
		const crossLayer = fromLayers.some((l) => !toLayers.includes(l));
		return {
			id: rel.id,
			rel,
			crossLayer,
			active: true,
			a: { layer: fromLayers[0] ?? 'state' }
		};
	});
</script>

{#if isCard}
	{#if kind === 'person' || kind === 'institution'}
		<EntityPanel {id} embedded onselect={pick} />
	{:else}
		<RecordPanel {id} embedded onselect={pick} />
	{/if}
{:else if rel && relEdge}
	<div class="mini">
		<ConnectionCard edge={relEdge} embedded onclose={() => {}} onpick={pick} />
	</div>
{:else if source}
	<div class="mini src">
		<span class="eyebrow">{t('panel.sources')}</span>
		<h3>{source.title}</h3>
		<p class="pub">
			{source.publisher}{source.date ? ` · ${source.date}` : ''}
		</p>
		<div class="meta">
			<Chip variant="outline" size="xs">T{source.tier}</Chip>
			{#if source.url}
				<a href={source.url} target="_blank" rel="nofollow noopener noreferrer">
					{source.url.replace(/^https?:\/\//, '').slice(0, 42)}…
				</a>
			{/if}
		</div>
		{#if source.excerpt}
			<p class="excerpt">{source.excerpt}</p>
		{/if}
		<SourceList ids={[source.id]} compact />
	</div>
{:else if position}
	<div class="mini">
		<span class="eyebrow">{t('panel.record')}</span>
		<h3>{nameOf(roleById.get(position.role))}</h3>
		<p class="pub">{nameOf(personById.get(position.holder))}</p>
		<div class="meta">
			<Chip size="xs" dot tint="var(--basis-{position.basis})">{basisLabel(position.basis as Basis)}</Chip>
			<Chip variant="outline" size="xs">{position.confidence}</Chip>
			<span class="span mono">{describeInterval(position.interval)}</span>
		</div>
		<SourceList ids={position.sources} compact />
	</div>
{:else if role}
	<div class="mini">
		<span class="eyebrow">{t('panel.record')}</span>
		<h3>{nameOf(role)}</h3>
		<p class="pub">{role.institution}</p>
	</div>
{:else}
	<div class="mini">
		<span class="eyebrow">{type}</span>
		<h3>{id}</h3>
		<p class="pub">{t('agora.rail.unknown')}</p>
	</div>
{/if}

<style>
	/*
		The rail is a viewer, not a second app: the panels bring their own typography
		and the wrapper only supplies the frame. The mini cards cover the record
		kinds that have no full panel yet (relationships, sources, roles).
	*/
	.mini {
		padding: var(--s-5) var(--s-5) var(--s-7);
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.mini h3 {
		margin: 0;
		font-size: var(--t-md);
		font-weight: 520;
		line-height: 1.3;
	}
	.pub {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.meta a {
		color: var(--accent);
		overflow-wrap: anywhere;
	}
	.excerpt {
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}
	.span {
		font-size: var(--t-2xs);
		color: var(--accent);
	}
</style>
