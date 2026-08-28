<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { format } from '$lib/i18n';
	import { t, tf, describeInterval, durationLabel, formatDate, layerLabel, relLabel, confidenceLabel, nameOf, entityName} from '$lib/t.svelte';
	import Prose from '$lib/ui/Prose.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import SourceList from './SourceList.svelte';
	import EntityTimeline from './EntityTimeline.svelte';
	import {
		LAYER_COLOR,
		eventsByEntity,
		institutionById,
		meetsBasis,
		personById,
		positionsByHolder,
		relKind,
		relationshipsByEntity,
		resolveEntity,
		roleById,
		companyById,
		contractById,
		licenceById,
		ds,
		type Basis,
		type Confidence,
		type Layer,
		type Person
	} from '$lib/model';

	import CommunityActions from '$lib/ui/CommunityActions.svelte';
	import ShareMenu from '$lib/ui/ShareMenu.svelte';
	import { canonicalShareUrl } from '$lib/share';
	import { tradeIn, debtIn, energyIn, debt } from '$lib/world/countries';

	let { id }: { id: string } = $props();

	const entity = $derived(resolveEntity(id));
	const person = $derived(personById.get(id));
	const institution = $derived(institutionById.get(id));

	const targetType = $derived(person ? 'person' : ('institution' as const));

	const positions = $derived(
		[...(positionsByHolder.get(id) ?? [])]
			.filter((p) => meetsBasis(p.basis as Basis, app.basisFloor))
			.sort((a, b) => b.interval.startEarliest - a.interval.startEarliest)
	);

	const relationships = $derived(
		(relationshipsByEntity.get(id) ?? []).filter((r) =>
			meetsBasis(r.basis as Basis, app.basisFloor)
		)
	);

	// Split by epistemic basis, not by relationship type. The whole point is that a
	// documented family tie and a reported influence claim must never sit in the same
	// visual bucket.
	const documented = $derived(relationships.filter((r) => r.basis === 'documented'));
	const reported = $derived(
		relationships.filter((r) => r.basis === 'reported' || r.basis === 'inferred')
	);
	const circulating = $derived(relationships.filter((r) => r.basis === 'unsubstantiated'));

	const events = $derived(
		[...(eventsByEntity.get(id) ?? [])].sort(
			(a, b) => a.interval.startEarliest - b.interval.startEarliest
		)
	);
	/** Busy cards (judiciary holds 30+) list the latest few; the header count stays honest. */
	const EVENT_CLAMP = 8;
	const visibleEvents = $derived(events.slice(-EVENT_CLAMP));

	const openQuestions = $derived(ds.questions.filter((q) => q.relates_to.includes(id)));

	/** Institutions this person served in, for the "bridges" summary. */
	const institutionsTouched = $derived(
		(person?.institutionsTouched ?? []).map((i) => institutionById.get(i)).filter(Boolean)
	);

	/** The company record attached to this institution, if it has one. */
	const company = $derived(institution ? (companyById.get(id) ?? null) : null);

	/** Contracts and licences that name this institution — its economic records. */
	const institutionContracts = $derived(
		institution ? ds.contracts.filter((c) => c.institution === id) : []
	);
	const institutionLicences = $derived(
		institution ? ds.licences.filter((l) => l.holder === id || l.issuer === id) : []
	);

	const crossLayer = $derived.by(() => {
		const layers = new Set((person?.layers ?? []) as Layer[]);
		return layers.size > 1;
	});

	function other(rel: { from: string; to: string }) {
		return rel.from === id ? rel.to : rel.from;
	}

	// Spec §9 — the derived per-entity timeline. Items come from the build
	// (buildTimeline in build-data.ts), never authored; rendering lives in
	// EntityTimeline (one axis, undated counted rather than drawn).
	const timeline = $derived((person ?? institution)?.timeline ?? []);

	/**
	 * Trade, debt and energy figures for a foreign-state institution, so the
	 * country's card carries the same measurements the globe draws. These are
	 * statistical measurements, not graded claims — deliberately rendered without
	 * the basis/confidence apparatus, exactly as the globe and FlowCard do.
	 */
	/**
	 * Latest year with flow data. Trade and debt are real-world measurements,
	 * not view-state projections — we show the most recent available figures,
	 * not whatever year the time scrubber is parked on.
	 */
	const currentYear = $derived(debt?.years.at(-1) ?? new Date().getUTCFullYear());
	const iso2 = $derived((institution as { iso2?: string } | undefined)?.iso2 ?? null);
	const flows = $derived(iso2 ? { iso2, year: currentYear } : null);
	const tradeRow = $derived(flows ? tradeIn(flows.year).find((r) => r.iso2 === flows.iso2) ?? null : null);
	const debtRow = $derived(flows ? debtIn(flows.year).find((r) => r.iso2 === flows.iso2) ?? null : null);
	const energyRow = $derived(
		flows ? energyIn(flows.year).find((r) => r.iso2 === flows.iso2) ?? null : null
	);
	const showFlows = $derived(
		!!flows && (!!tradeRow || !!debtRow || !!energyRow)
	);

	/**
	 * Institutional debt: international organisations that lend to Tunisia
	 * (World Bank, AfDB, EIB, IMF) have lending figures in the World Bank
	 * IDS data, keyed by the graph entity id.
	 */
	const instBody = $derived.by(() => {
		if (!institution) return null;
		const body = debt?.bodies[institution.id];
		if (!body) return null;
		const i = debt!.years.indexOf(currentYear);
		if (i < 0) return null;
		const stock = body.stock[i];
		const disbursed = body.disbursed[i];
		const repaid = body.repaid[i];
		if (stock === null && disbursed === null && repaid === null) return null;
		return { stock, disbursed, repaid };
	});
	const showInstFlows = $derived(!!instBody);

	/** Millions USD → readable. Same shape as the globe's money(), so a figure in the
	 *  panel and a figure on the arc read identically. */
	function money(m: number | null | undefined): string {
		if (m === null || m === undefined) return '—';
		const bn = m / 1000;
		if (bn >= 1) return `${bn.toLocaleString(app.locale, { maximumFractionDigits: 1 })} ${t('world.bn')}`;
		if (m > 0 && m < 0.5) return `<1 ${t('world.mn')}`;
		return `${m.toLocaleString(app.locale, { maximumFractionDigits: 0 })} ${t('world.mn')}`;
	}

	const shareUrl = $derived(canonicalShareUrl('entity', id));
	const shareTitle = $derived(entity?.name ?? id);
</script>

<!--
	One relationship list, three framings.

	These sections are split by epistemic basis and must never merge — a documented
	family tie and a claim that merely circulates cannot share a visual bucket. But
	what actually differs between them is the *framing*: the heading, the caveat above
	the list, and whether attribution is "claimed by" or "circulates via". The rows
	themselves were three copies of the same markup, which is how they drift.

	So the framing is the parameter and the row is shared. Adding a fourth basis tier
	means adding a case here, not another eighteen lines of near-identical list.
-->
{#snippet relSection(tone: 'documented' | 'reported' | 'circulating', heading: string, rels: typeof documented)}
	{#if rels.length}
		<div class="section" class:reported={tone === 'reported'} class:circulating={tone === 'circulating'}>
			<h3>{heading} <span class="count">{rels.length}</span></h3>

			{#if tone === 'reported'}
				<p class="caveat">
					Claims below come from credible reporting but are not established by any public
					document. Each names who is making the claim.
				</p>
			{:else if tone === 'circulating'}
				<p class="caveat hard">
					These claims circulate without reliable evidence. They are recorded, not endorsed —
					deleting them would leave no way to show why the popular account is wrong. Several
					are contradicted by this project's own data.
				</p>
			{/if}

			<ul class="rels">
				{#each rels as rel (rel.id)}
					<li class:uns={tone === 'circulating'}>
						<div class="r-head">
							{#if tone === 'circulating'}
								<span class="chip c-D">UNS</span>
							{:else}
								<span class="verb">{relLabel(rel.type)}</span>
							{/if}
							<button class="target" onclick={() => app.select(other(rel))}>
								{entityName(other(rel))}
							</button>
							{#if tone !== 'circulating'}
								<span class="chip c-{rel.confidence}">{rel.confidence}</span>
							{/if}
						</div>

						{#if tone === 'documented' && rel.subtype}
							<span class="tag" dir="auto">{rel.subtype}</span>
						{/if}

						<!-- Rule 4: a low-confidence claim must name who is making it. -->
						{#if tone === 'reported' && rel.attributed_to}
							<p class="attrib" dir="auto">{t('panel.claimedby')}: {rel.attributed_to}</p>
						{:else if tone === 'circulating'}
							<p class="attrib" dir="auto">{t('panel.circulates')}: {rel.attributed_to}</p>
						{/if}

						<p class="r-desc" dir="auto">{rel.description}</p>
						<SourceList ids={rel.sources} compact />
						{@render relActions(rel)}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/snippet}

<!--
	What you can do with a connection.

	These rows used to be terminal: they described a relationship and offered no way
	to open it, locate it or argue about it, which was odd once the Network grew a card
	that does all three.

	"On the map" is a link rather than a button so a connection has a URL. That is worth
	more than it looks for a research artifact: it is how somebody cites the specific
	edge they are disputing.
-->
{#snippet relActions(rel: (typeof documented)[number])}
	<div class="r-act">
		<!--
			"On the map" stays a plain link rather than joining the pair below: it goes to
			another view of the same record, where Discuss and Propose leave the record
			for the argument about it. Two different kinds of destination, two weights.
		-->
		<a class="tomap" href="/network?rel={encodeURIComponent(rel.id)}">{t('panel.onmap')}</a>
		<CommunityActions
			type="relationship"
			id={rel.id}
			label="{entityName(rel.from)} → {entityName(rel.to)}"
			size="sm"
		/>
	</div>
{/snippet}

<aside class="panel" aria-label="Entity detail">
	<header>
		<div class="titles">
			<span class="eyebrow">
				{#if person}{t('panel.person')}{:else if institution}{t(`inst.${institution.type}`)}{/if}
			</span>
			<h2>{entity?.name ?? id}</h2>
			{#if person?.name_ar}
				<span class="ar" dir="rtl" lang="ar">{person.name_ar}</span>
			{:else if institution?.name_ar}
				<span class="ar" dir="rtl" lang="ar">{institution.name_ar}</span>
			{/if}
			{#if person?.tagline}
				<p class="tagline"><Prose record={person} field="tagline" /></p>
			{/if}
		</div>
		<div class="h-actions">
			<ShareMenu url={shareUrl} title={shareTitle} />
			<button class="close" onclick={() => (app.selected = null)} aria-label={t('panel.close')}>×</button>
		</div>
	</header>

	<!--
		The two affordances the community extension is built around. Plain links, not
		fetches: the atlas makes no cross-origin request, and asking the community
		server about this entity would tell it what each reader is looking at.
	-->
	<div class="community">
		<CommunityActions type={targetType} {id} label={entity?.name} />
	</div>

	<div class="body">
		<div class="layerrow">
			{#each entity?.layers ?? [] as layer (layer)}
				<span class="lp" style:--c={LAYER_COLOR[layer]}><i></i>{layerLabel(layer)}</span>
			{/each}
			{#if person}
				<span class="chip c-{person.confidence}">{confidenceLabel(person.confidence as Confidence)}</span>
			{/if}
			{#if person?.verification === 'needs-primary-source'}
				<span class="warn-flag">{t('entity.needsPrimary')}</span>
			{/if}
		</div>

		{#if person && (person.birth || person.death)}
			<p class="lifespan mono">
				{#if person.birthResolved}b. {formatDate(person.birthResolved.startEarliest, 'year')}{/if}
				{#if person.deathResolved}&nbsp;·&nbsp;d. {formatDate(person.deathResolved.startEarliest, 'year')}{/if}
			</p>
		{/if}

		{#if company}
			<!-- The company record attached to this institution: founding, form,
			     capital — the corporate facts the graph is otherwise silent on. -->
			<div class="section company-rec">
				<h3>
					{t('record.company')}
					<Tooltip content={t('entity.derived.title')}>
						<span class="derived">{t('record.derived')}</span>
					</Tooltip>
				</h3>
				<div class="kf">
					{#if company.founded}<div class="kv"><span>{t('record.founded')}</span><b>{company.founded}</b></div>{/if}
					{#if company.legal_form}<div class="kv"><span>{t('record.legalform')}</span><b>{company.legal_form}</b></div>{/if}
					{#if company.capital?.tnd}<div class="kv"><span>{t('record.capital')}</span><b>{(company.capital.tnd / 1_000_000).toLocaleString()} M TND</b></div>{/if}
					{#if company.state_owned !== undefined}<div class="kv"><span>{t('record.stateowned')}</span><b>{company.state_owned ? t('record.yes') : t('record.no')}</b></div>{/if}
				</div>
			</div>
		{/if}

		{#if institutionContracts.length || institutionLicences.length}
			<!-- The institution's economic records: contracts and licences naming it,
			     each opening its own card. This is how a record is reachable without
			     searching for it. -->
			<div class="section records-rec">
				<h3>{t('panel.records')}</h3>
				<ul class="reclist">
					{#each institutionContracts as c (c.id)}
						<li><button class="reclink" onclick={() => (app.selected = c.id)}>{c.title_en}</button></li>
					{/each}
					{#each institutionLicences as l (l.id)}
						<li><button class="reclink" onclick={() => (app.selected = l.id)}>{entityName(l.holder)} — {l.kind} {t('record.licence')}</button></li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if person?.trajectory?.length}
			<div class="section">
				<h3>
					{t('panel.trajectory')}
					<!-- An authored arc can name a phase no appointment record contains — "Exile",
					     "2019 campaign". A derived one is only ever the institutions this person
					     already holds sourced positions in. Saying which is which keeps the second
					     from borrowing the authority of the first. -->
					{#if person.trajectoryDerived}
						<Tooltip content={t('entity.derived.title')}>
							<span class="derived">{t('entity.derived')}</span>
						</Tooltip>
					{/if}
				</h3>
				<ol class="traj">
					{#each person.trajectory as hop, i (hop + i)}
						<li dir="auto">{hop}</li>
					{/each}
				</ol>
				{#if crossLayer}
					<p class="bridge-note">
						{format(app.locale, 'panel.bridge', { n: (person.layers as Layer[]).length })}
					</p>
				{/if}
			</div>
		{/if}

		{#if person?.summary || institution?.summary}
			<div class="section">
				<!-- Whichever record is selected; both carry a translatable summary. -->
				<p class="summary"><Prose record={(person ?? institution)!} field="summary" block /></p>
			</div>
		{/if}

		{#if timeline.length}
			<div class="section tl">
				<h3>
					{t('panel.timeline')}
					<Tooltip content={t('entity.derived.title')}>
						<span class="derived">{t('entity.derived')}</span>
					</Tooltip>
				</h3>
				<!-- Spec §9: derived, never authored. One axis, marks with fat hit
				     twins, undated items counted rather than drawn - see the component. -->
				<EntityTimeline items={timeline} />
			</div>
		{/if}

		{#if showFlows}
			<div class="section flows">
				<h3>{t('panel.flows')}</h3>
				{#if tradeRow && (tradeRow.out ?? 0) + (tradeRow.in ?? 0) > 0}
					<p class="flowline">
						<span class="fk">{t('world.exports')}</span>
						<span class="fv mono">{money(tradeRow.out)}</span>
						<span class="fk">{t('world.imports')}</span>
						<span class="fv mono">{money(tradeRow.in)}</span>
					</p>
				{/if}
				{#if debtRow && debtRow.stock}
					<p class="flowline">
						<span class="fk">{t('world.owed')}</span>
						<span class="fv mono">{money(debtRow.stock)}</span>
					</p>
				{/if}
				{#if energyRow && energyRow.total > 0}
					<p class="flowline">
						<span class="fk">{t('world.bought')}</span>
						<span class="fv mono">{money(energyRow.bought)}</span>
						<span class="fk">{t('world.sold')}</span>
						<span class="fv mono">{money(energyRow.sold)}</span>
					</p>
				{/if}
				<p class="flow-meta">
					{format(app.locale, 'panel.flows.note', { year: flows?.year ?? '' })}
				</p>
			</div>
		{/if}

		{#if showInstFlows}
			<div class="section flows">
				<h3>{t('panel.flows')}</h3>
				{#if instBody!.stock !== null}
					<p class="flowline">
						<span class="fk">{t('world.owed')}</span>
						<span class="fv mono">{money(instBody!.stock)}</span>
					</p>
				{/if}
				{#if instBody!.disbursed !== null}
					<p class="flowline">
						<span class="fk">{t('world.received')}</span>
						<span class="fv mono">{money(instBody!.disbursed)}</span>
					</p>
				{/if}
				{#if instBody!.repaid !== null}
					<p class="flowline">
						<span class="fk">{t('world.repaid')}</span>
						<span class="fv mono">{money(instBody!.repaid)}</span>
					</p>
				{/if}
				<p class="flow-meta">
					{format(app.locale, 'panel.flows.note', { year: currentYear })}
				</p>
			</div>
		{/if}

		{#if person && positions.length}
			<div class="section">
				<h3>{t('panel.offices')} <span class="count">{positions.length}</span></h3>
				<ul class="offices">
					{#each positions as pos (pos.id)}
						{@const role = roleById.get(pos.role)}
						<li>
							<div class="o-head">
								<strong>{nameOf(role)}</strong>
								<span class="chip c-{pos.confidence}">{pos.confidence}</span>
							</div>
							<div class="o-meta mono">
								{describeInterval(pos.interval)} · {durationLabel(pos.years)}
								{#if pos.acting}· acting{/if}
							</div>
							{#if pos.predecessorDerived || pos.successorDerived}
								<div class="chain">
									{#if pos.predecessorDerived}
										<button onclick={() => app.select(pos.predecessorDerived!)}>
											← {entityName(pos.predecessorDerived)}
										</button>
									{/if}
									{#if pos.successorDerived}
										<button onclick={() => app.select(pos.successorDerived!)}>
											{entityName(pos.successorDerived)} →
										</button>
									{/if}
								</div>
							{/if}
							{#each pos.notes as note (note)}
								<p class="o-note">{note}</p>
							{/each}
							{#if pos.datesInferred}
								<p class="warn-flag">{t('entity.datesEstimated')}</p>
							{/if}
							{#if pos.reasoning}
								<div class="epi">
									<span class="eyebrow">{t('panel.reasoning')}</span>
									<p>{pos.reasoning}</p>
								</div>
							{/if}
							{#if pos.falsifiable_by}
								<div class="epi fals">
									<span class="eyebrow">{t('panel.falsifier')}</span>
									<p><Prose record={pos} field="falsifiable_by" block /></p>
								</div>
							{/if}
							{#if pos.disputes.length}
								<div class="epi disp">
									<span class="eyebrow">{t('panel.disputes')}</span>
									{#each pos.disputes as d (d.claim)}
										<p class="d-claim">&ldquo;{d.claim}&rdquo; <em>— {d.held_by}</em></p>
										{#if d.assessment}<p class="d-assess">{d.assessment}</p>{/if}
									{/each}
								</div>
							{/if}
							{#if pos.review}
								<p class="reviewed">
									{t('panel.review')}: {pos.review.by}, {pos.review.date}{pos.review.method
										? ` — ${pos.review.method}`
										: ''}
								</p>
							{/if}
							<SourceList ids={pos.sources} compact />
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if institutionsTouched.length > 1}
			<div class="section">
				<h3>{t('panel.institutions')}</h3>
				<div class="pills">
					{#each institutionsTouched as inst (inst!.id)}
						<button
							class="pill"
							style:--c={LAYER_COLOR[inst!.layer as Layer]}
							onclick={() => app.select(inst!.id)}>{nameOf(inst!)}</button
						>
					{/each}
				</div>
			</div>
		{/if}

		{@render relSection('documented', t('panel.documented'), documented)}
		{@render relSection('reported', t('panel.reported'), reported)}
		{@render relSection('circulating', t('panel.circulating'), circulating)}

		{#if events.length}
			<div class="section">
				<h3>{t('panel.appears')} <span class="count">{events.length}</span></h3>
				<ul class="events">
					{#each visibleEvents as ev (ev.id)}
						<li>
							<button
								onclick={() => {
									app.setDate(ev.interval.startEarliest);
									app.playing = false;
								}}
							>
								<span class="e-date mono">{formatDate(ev.interval.startEarliest, 'month')}</span>
								<span class="e-title">{nameOf(ev)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{#if events.length > visibleEvents.length}
				<p class="clamp">{tf('panel.appearsClamp', { n: events.length - visibleEvents.length })}</p>
			{/if}
			</div>
		{/if}

		{#if person?.notes?.length}
			<div class="section">
				<h3>{t('panel.notes')}</h3>
				{#each person.notes as note (note)}
					<p class="o-note">{note}</p>
				{/each}
			</div>
		{/if}

		{#if openQuestions.length}
			<div class="section open-q">
				<h3>{t('panel.questions')}</h3>
				<ul>
					{#each openQuestions as q (q.id)}
						<li><Prose record={q} field="question" /></li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if person?.sources?.length || institution?.sources?.length}
			<div class="section">
				<h3>{t('panel.sources')}</h3>
				<SourceList ids={person?.sources ?? institution?.sources ?? []} />
			</div>
		{/if}
	</div>
</aside>

<style>
	/* Positioning and elevation belong to the Inspector shell; this component is
	   just the content, so it can also be reused inline elsewhere. */
	.panel {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: transparent;
	}

	header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px 16px 12px;
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}
	.titles {
		min-width: 0;
	}
	h2 {
		font-size: 19px;
		margin: 2px 0 0;
	}
	.ar {
		display: block;
		font-size: 15px;
		color: var(--text-secondary);
		margin-top: 1px;
	}
	.tagline {
		margin: 6px 0 0;
		font-size: 12.5px;
		color: var(--text-secondary);
		font-family: var(--font-serif);
		font-style: italic;
		line-height: 1.45;
	}
	.close {
		font-size: 22px;
		line-height: 1;
		color: var(--text-faint);
		flex-shrink: 0;
		padding: 0 3px;
	}
	.close:hover {
		color: var(--text-primary);
	}
	.h-actions {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-inline-start: auto;
		flex-shrink: 0;
	}

	/*
		Deliberately quiet. These lead away from the sourced record into a place where
		anyone may write anything, so they must not compete with the evidence on the
		page — a discussion link styled like a primary action would imply the two
		carry the same standing.
	*/
	.community {
		display: flex;
		gap: 6px;
		padding: 0 14px 10px;
		border-bottom: 1px solid var(--border-subtle);
	}

	.body {
		flex: 1;
		overflow-y: auto;
		padding: 14px 16px 40px;
	}

	.layerrow {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		margin-bottom: 8px;
	}
	.lp {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
		border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
		background: color-mix(in srgb, var(--c) 9%, transparent);
		border-radius: var(--r-sm);
		padding: 1.5px 5px;
	}
	.lp i {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--c);
	}

	.lifespan {
		font-size: 11px;
		color: var(--text-faint);
		margin: 0 0 4px;
	}

	/* The company record + economic records sections: a key-fact grid and a list
	   of links into the record cards. */
	.kf {
		margin-top: 4px;
	}
	.kv {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		padding: 3px 0;
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
	.reclist {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.reclist li + li {
		margin-top: var(--s-2);
	}
	.reclink {
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--accent);
		border-bottom: 1px solid var(--accent-border);
		text-align: start;
	}
	.reclink:hover {
		color: var(--accent-hover);
	}

	.section {
		margin-top: 20px;
	}
	h3 {
		font-size: 10.5px;
		font-family: var(--font-mono);
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: 8px;
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.count {
		color: var(--text-faint);
		opacity: 0.65;
	}

	.summary {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: color-mix(in srgb, var(--text-primary) 90%, transparent);
	}

	/* Flow measurements — the panel equivalent of the globe's arcs. Kept visually
	   distinct from the graph claims above: statistics carry no basis chip. */
	.flowline {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin: 4px 0;
		font-size: 12px;
	}
	.fk {
		color: var(--text-faint);
	}
	.fv {
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.flow-meta {
		margin-top: 6px;
		font-size: 10.5px;
		line-height: 1.5;
		color: var(--text-faint);
	}

	.traj {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		list-style: none;
		margin: 0;
		padding: 0;
		counter-reset: hop;
	}
	.traj li {
		font-size: 11px;
		padding: 2px 7px;
		border-radius: var(--r-sm);
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		position: relative;
	}
	.traj li:not(:last-child)::after {
		content: '→';
		position: absolute;
		right: -12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-faint);
		font-size: 9px;
	}
	.traj li:not(:last-child) {
		margin-inline-end: 12px;
	}
	.bridge-note {
		margin: 8px 0 0;
		font-size: 11px;
		color: var(--accent);
	}

	ul.offices,
	ul.rels,
	ul.events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	ul.offices > li,
	ul.rels > li {
		padding: 9px 10px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
	}
	.o-head,
	.r-head {
		display: flex;
		align-items: baseline;
		gap: 7px;
		flex-wrap: wrap;
	}
	.o-head strong {
		font-size: 12.5px;
		font-weight: 500;
	}
	.o-meta {
		font-size: 10.5px;
		color: var(--accent);
		margin: 3px 0 4px;
	}
	.chain {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin: 4px 0 6px;
	}
	.chain button {
		font-size: 10.5px;
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-sm);
		padding: 1px 6px;
	}
	.chain button:hover {
		color: var(--text-primary);
		border-color: var(--border-default);
	}
	.o-note {
		margin: 5px 0;
		font-size: 11.5px;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.verb {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}
	.target {
		font-size: 12.5px;
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--border-default);
	}
	.target:hover {
		text-decoration-color: var(--accent);
	}
	.r-desc {
		margin: 5px 0 6px;
		font-size: 11.5px;
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.attrib {
		margin: 4px 0;
		font-size: 10.5px;
		color: var(--basis-inferred);
		font-family: var(--font-mono);
	}

	.r-act {
		display: flex;
		align-items: center;
		gap: var(--s-5);
		margin-top: var(--s-4);
		flex-wrap: wrap;
	}
	.tomap {
		font-size: var(--t-2xs);
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-default);
		white-space: nowrap;
	}
	.tomap:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-border);
	}

	.reported h3 {
		color: var(--basis-inferred);
	}

	/* Quiet by design. It marks provenance, it is not a warning — a derived arc
	   rests on the same sourced positions the rest of the card does. */
	.derived {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.06em;
		text-transform: none;
		color: var(--text-faint);
		opacity: 0.75;
	}
	.circulating h3 {
		color: var(--basis-unsubstantiated);
	}
	.caveat {
		margin: 0 0 9px;
		font-size: 11px;
		color: var(--text-secondary);
		line-height: 1.5;
		padding: 7px 9px;
		border-inline-start: 2px solid var(--basis-inferred);
		background: color-mix(in oklch, var(--basis-inferred) 6%, transparent);
	}
	.caveat.hard {
		border-inline-start-color: var(--basis-unsubstantiated);
		background: color-mix(in oklch, var(--basis-unsubstantiated) 7%, transparent);
	}
	li.uns {
		border-color: color-mix(in oklch, var(--basis-unsubstantiated) 30%, var(--border-subtle));
	}

	/* Epistemic detail: reasoning, falsifier, source disagreements, review trail. */
	.epi {
		margin: 7px 0;
		padding-inline-start: 9px;
		border-inline-start: 2px solid var(--border-default);
	}
	.epi p {
		margin: 2px 0 0;
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-secondary);
	}
	.epi.fals {
		border-left-color: color-mix(in oklch, var(--basis-documented) 55%, transparent);
	}
	.epi.disp {
		border-left-color: color-mix(in oklch, var(--basis-inferred) 65%, transparent);
	}
	.d-claim {
		font-family: var(--font-serif);
	}
	.d-claim em {
		font-family: var(--font-mono);
		font-size: 10px;
		font-style: normal;
		color: var(--basis-inferred);
	}
	.d-assess {
		margin-top: 3px !important;
		opacity: 0.85;
	}
	.reviewed {
		margin: 6px 0 4px;
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--basis-documented);
	}

	ul.events {
		gap: 1px;
	}
	ul.events button {
		display: flex;
		gap: 9px;
		width: 100%;
		text-align: left;
		padding: 4px 6px;
		border-radius: var(--r-sm);
		font-size: 11.5px;
	}
	ul.events button:hover {
		background: var(--surface-raised);
	}
	.e-date {
		font-size: 10px;
		color: var(--text-faint);
		flex-shrink: 0;
		width: 58px;
		padding-top: 1px;
	}
	.e-title {
		color: var(--text-secondary);
		line-height: 1.4;
	}
	ul.events button:hover .e-title {
		color: var(--text-primary);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.pill {
		font-size: 11px;
		padding: 2px 7px;
		border-radius: var(--r-sm);
		border: 1px solid color-mix(in srgb, var(--c) 40%, var(--border-subtle));
		background: color-mix(in srgb, var(--c) 8%, transparent);
		color: var(--text-secondary);
	}
	.pill:hover {
		color: var(--text-primary);
	}

	.open-q ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.open-q li {
		font-size: 11.5px;
		color: var(--text-secondary);
		line-height: 1.5;
		padding-left: 12px;
		position: relative;
	}
	.open-q li::before {
		content: '?';
		position: absolute;
		left: 0;
		color: var(--accent);
		font-family: var(--font-mono);
	}
</style>
