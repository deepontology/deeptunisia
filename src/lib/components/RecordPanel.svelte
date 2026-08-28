<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, basisLabel, confidenceLabel, describeInterval, formatDate, nameOf } from '$lib/t.svelte';
	import SourceList from './SourceList.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import CommunityActions from '$lib/ui/CommunityActions.svelte';
	import ShareMenu from '$lib/ui/ShareMenu.svelte';
	import { canonicalShareUrl } from '$lib/share';
	import {
		BASIS_COLOR,
		companyById,
		contractById,
		declarationById,
		educationById,
		ds,
	eventById,
		institutionById,
		licenceById,
		personById,
		entityName,
		type Basis,
		type Contract,
		type Declaration,
		type Education,
		type EventRec,
		type Licence
	} from '$lib/model';

	/**
	 * A v0.0.2 record, as a card.
	 *
	 * Contracts, licences, declarations, education records and events were in the
	 * data but had no interface: the search palette indexed them, then silently
	 * redirected a click to the record's "main party" — or to nothing. A record is
	 * a claim about the graph, so it gets the same apparatus a connection does:
	 * basis, confidence, attribution, sources, and the two community affordances.
	 * Entity references inside the record are buttons: reading a contract almost
	 * always prompts a question about one of its parties.
	 *
	 * Rendered inside the Inspector, so it inherits the docked/sheet behaviour —
	 * this component is the scrollable content, not the shell.
	 */

	let { id }: { id: string } = $props();

	// Resolve which kind of record this id is.
	const contract = $derived(contractById.get(id) ?? null);
	const licence = $derived(licenceById.get(id) ?? null);
	const declaration = $derived(declarationById.get(id) ?? null);
	const education = $derived(educationById.get(id) ?? null);
	const event = $derived(eventById.get(id) ?? null);
	const company = $derived(companyById.get(id) ?? null);

	/** The kind label for the eyebrow. */
	const kindLabel = $derived.by(() => {
		if (contract) return t('timeline.lane.contract');
		if (licence) return t('timeline.lane.licence');
		if (declaration) return t('timeline.lane.declaration');
		if (education) return t('timeline.lane.education');
		if (event) return t('timeline.lane.event');
		if (company) return t('record.company');
		return t('panel.record');
	});

	/** The card title. Records without a title field get one assembled from their facts. */
	const title = $derived.by(() => {
		if (contract) return contract.title_en;
		if (licence) {
			const holder = entityName(licence.holder);
			return `${holder} — ${licence.kind} ${t('record.licence')}`;
		}
		if (declaration) {
			if (declaration.declarer) return `${entityName(declaration.declarer)} — ${t('record.declaration')}`;
			return t('record.declaration.regime');
		}
		if (education) return education.degree_en;
		if (event) return event.title_en;
		if (company) return company.legal_name_fr || company.id;
		return id;
	});

	const basis = $derived((contract ?? declaration ?? event ?? education)?.basis as Basis | undefined);
	const confidence = $derived((contract ?? declaration ?? event ?? education)?.confidence as string | undefined);
	const attributedTo = $derived((contract ?? declaration ?? event ?? education)?.attributed_to);
	const notes = $derived(contract?.notes ?? declaration?.notes ?? education?.notes ?? []);
	const disputes = $derived((contract ?? declaration ?? education)?.disputes ?? []);
	const sources = $derived((contract ?? declaration ?? event ?? education)?.sources ?? []);

	/** A clickable entity reference: selecting it swaps the Inspector to that record. */
	function ref(id: string) {
		app.selected = id;
	}
	function refName(id: string): string {
		const p = personById.get(id);
		if (p) return nameOf(p);
		const i = institutionById.get(id);
		if (i) return nameOf(i);
		return entityName(id);
	}

	/** A labelled key-value row, the record card's field language. */
	function field(label: string, value: string, onPick?: () => void) {
		return { label, value, onPick };
	}

	const fields = $derived.by(() => {
		const out: { label: string; value: string; onPick?: () => void }[] = [];
		if (contract) {
			const c = contract as Contract;
			out.push(field(t('record.institution'), refName(c.institution), () => ref(c.institution)));
			out.push(field(t('record.status'), c.status));
			if (c.procurement?.mechanism) out.push(field(t('record.mechanism'), c.procurement.mechanism));
			if (c.award?.value) {
				const v = Number(c.award.value);
				out.push(
					field(
						t('record.award'),
						`${(v / 1_000_000).toLocaleString()} M ${c.award.currency}${c.award.year ? ` (${c.award.year})` : ''}`
					)
				);
			}
			if (c.winner) out.push(field(t('record.winner'), refName(c.winner)));
			if (c.losers?.length) out.push(field(t('record.losers'), c.losers.map(refName).join(', ')));
			if (c.financing?.type) out.push(field(t('record.financing'), c.financing.type));
		} else if (licence) {
			const l = licence as Licence;
			out.push(field(t('record.holder'), refName(l.holder), () => ref(l.holder)));
			out.push(field(t('record.issuer'), refName(l.issuer), () => ref(l.issuer)));
			if (l.term?.years) out.push(field(t('record.term'), `${l.term.years} ${t('record.years')}`));
			if (l.scope?.region) out.push(field(t('record.scope'), l.scope.region));
			if (l.fees?.amount) {
				out.push(
					field(t('record.fees'), `${(l.fees.amount / 1_000_000).toLocaleString()} M ${l.fees.currency}`)
				);
			}
			out.push(field(t('record.status'), l.status));
		} else if (declaration) {
			const d = declaration as Declaration;
			if (d.declarer) out.push(field(t('record.declarer'), refName(d.declarer), () => ref(d.declarer!)));
			if (d.body) out.push(field(t('record.body'), refName(d.body), () => ref(d.body!)));
			if (d.jurisdiction) out.push(field(t('record.jurisdiction'), d.jurisdiction));
		} else if (education) {
			const e = education as Education;
			out.push(field(t('record.person'), refName(e.person), () => ref(e.person)));
			if (e.institution) out.push(field(t('record.institution'), refName(e.institution), () => ref(e.institution!)));
			if (e.field) out.push(field(t('record.field'), e.field));
			if (e.start) out.push(field(t('record.period'), `${e.start}${e.end ? ' – ' + e.end : ''}`));
		} else if (event) {
			const ev = event as EventRec;
			out.push(field(t('record.category'), ev.category));
			if (ev.rupture) out.push(field(t('record.rupture'), t('record.yes')));
		}
		return out;
	});

	const actors = $derived((event as EventRec | null)?.actors ?? []);
	const eventInstitutions = $derived((event as EventRec | null)?.institutions ?? []);
	const summary = $derived(
		(declaration as Declaration | null)?.summary ?? (event as EventRec | null)?.summary ?? ''
	);

	const dated = $derived((contract as Contract | null)?.interval ?? (event as EventRec | null)?.interval ?? null);

	/** What the Agora thread will be called. */
	const label = $derived(title);

	/** The Agora target type for this record kind. */
	const targetType = $derived.by(() => {
		if (contract) return 'contract' as const;
		if (licence) return 'licence' as const;
		if (declaration) return 'declaration' as const;
		if (education) return 'education' as const;
		return 'event' as const;
	});

	const shareUrl = $derived(canonicalShareUrl('entity', id));
	const shareTitle = $derived(title);
</script>

<article class="rpanel" dir="auto">
	<header>
		<div class="eyebrow mono">{kindLabel}</div>
		<div class="h-actions">
			<ShareMenu url={shareUrl} title={shareTitle} />
			<button class="close" onclick={() => (app.selected = null)} aria-label={t('panel.close')}>×</button>
		</div>
	</header>

	<h2>{title}</h2>

	<div class="meta">
		{#if basis}
			<Chip size="xs" dot tint="var(--basis-{basis})">
				{confidence ? `${confidence} — ` : ''}{basisLabel(basis)}
			</Chip>
		{/if}
		{#if dated}
			<span class="span mono">{describeInterval(dated)}</span>
		{:else if event}
			<span class="span mono">{formatDate(event.interval.startEarliest, 'day')}</span>
		{/if}
	</div>

	{#if event}
		{@const preds = ds.events.filter((e) => e.id !== id && ((e.consequences ?? []).includes(id) || (event.causes ?? []).includes(e.id)))}
		{@const succs = ds.events.filter((e) => e.id !== id && ((e.causes ?? []).includes(id) || (event.consequences ?? []).includes(e.id)))}
		{#if preds.length || succs.length}
			<div class="kf">
				{#if preds.length}
					<div class="kv"><span>{t('record.causes')}</span><span class="refs">
						{#each preds as pe (pe.id)}<button class="ref" onclick={() => (app.selected = pe.id)}>{pe.title_en}</button>{/each}
					</span></div>
				{/if}
				{#if succs.length}
					<div class="kv"><span>{t('record.consequences')}</span><span class="refs">
						{#each succs as se (se.id)}<button class="ref" onclick={() => (app.selected = se.id)}>{se.title_en}</button>{/each}
					</span></div>
				{/if}
			</div>
		{/if}
	{/if}

	{#if company}
		<div class="kf">
			{#if company.founded}<div class="kv"><span>{t('record.founded')}</span><b>{company.founded}</b></div>{/if}
			{#if company.legal_form}<div class="kv"><span>{t('record.legalform')}</span><b>{company.legal_form}</b></div>{/if}
			{#if company.capital?.tnd}<div class="kv"><span>{t('record.capital')}</span><b>{(company.capital.tnd / 1_000_000).toLocaleString()} M TND</b></div>{/if}
			{#if company.state_owned !== undefined}<div class="kv"><span>{t('record.stateowned')}</span><b>{company.state_owned ? t('record.yes') : t('record.no')}</b></div>{/if}
		</div>
	{/if}

	{#if fields.length}
		<div class="kf">
			{#each fields as f (f.label)}
				{#if f.onPick}
					<div class="kv"><span>{f.label}</span><button class="ref" onclick={f.onPick}>{f.value}</button></div>
				{:else}
					<div class="kv"><span>{f.label}</span><b>{f.value}</b></div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if actors.length || eventInstitutions.length}
		<div class="kf">
			{#if actors.length}
				<div class="kv">
					<span>{t('record.actors')}</span>
					<span class="refs">
						{#each actors as a (a)}
							<button class="ref" onclick={() => ref(a)}>{refName(a)}</button>
						{/each}
					</span>
				</div>
			{/if}
			{#if eventInstitutions.length}
				<div class="kv">
					<span>{t('record.institutions')}</span>
					<span class="refs">
						{#each eventInstitutions as i (i)}
							<button class="ref" onclick={() => ref(i)}>{refName(i)}</button>
						{/each}
					</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if summary}
		<p class="desc">{summary}</p>
	{/if}

	{#if notes.length}
		<div class="notes">
			{#each notes as n (n)}
				<p>{n}</p>
			{/each}
		</div>
	{/if}

	<!-- Rule 4: a low-confidence claim must name who is making it. -->
	{#if attributedTo}
		<p class="attrib">
			<span class="eyebrow">{t('panel.claimedby')}</span>
			{attributedTo}
		</p>
	{/if}

	{#if disputes.length}
		<p class="contested">{t('record.disputed')}</p>
	{/if}

	{#if sources.length}
		<div class="sources">
			<SourceList ids={sources} compact />
		</div>
	{/if}

	<footer>
		<CommunityActions type={targetType} id={id} {label} />
	</footer>
</article>

<style>
	.rpanel {
		padding: var(--s-6);
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.h-actions {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-shrink: 0;
		margin: -4px -6px 0 0;
	}
	.eyebrow {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.close {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
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
	h2 {
		margin-top: var(--s-3);
		font-family: var(--font-serif);
		font-size: var(--t-lg);
		font-weight: 560;
		line-height: var(--lh-snug);
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-top: var(--s-4);
	}
	.span {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	/* Key facts: a definition grid. Entity references are buttons. */
	.kf {
		margin-top: var(--s-5);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-subtle);
	}
	.kv {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		padding: var(--s-2) 0;
		font-size: var(--t-sm);
	}
	.kv > span {
		flex-shrink: 0;
		min-width: 92px;
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.kv b {
		font-weight: 520;
	}
	.ref {
		color: var(--accent);
		border-bottom: 1px solid var(--accent-border);
		text-align: start;
	}
	.ref:hover {
		color: var(--accent-hover);
	}
	.refs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}
	.desc {
		margin-top: var(--s-5);
		font-size: var(--t-base);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.notes {
		margin-top: var(--s-5);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-subtle);
	}
	.notes p {
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.notes p + p {
		margin-top: var(--s-3);
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
	.contested {
		margin-top: var(--s-5);
		font-size: var(--t-xs);
		color: var(--basis-inferred);
	}
	.sources {
		margin-top: var(--s-5);
		padding-top: var(--s-5);
		border-top: 1px solid var(--border-subtle);
	}
	footer {
		margin-top: var(--s-6);
	}
</style>
