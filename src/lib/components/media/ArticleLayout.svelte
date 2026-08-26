<script lang="ts">
	/**
	 * ArticleLayout — the main reading experience for investigations.
	 *
	 * Composition, top to bottom:
	 *   1. Centered header — series kicker, title, dek, meta line
	 *   2. Introduction box — the S00 "how to read" panel, visually distinct
	 *   3. Narrative sections — each headed by a mono section kicker + serif
	 *      title, with claim indicators and entity mentions inline
	 *   4. Sidebar — the timeline rail (always visible; the entity detail is
	 *      the global Inspector, not a per-article card)
	 *
	 * Entity mentions are gated: only ids that resolve in the graph (via
	 * model.resolveEntity / graph_id) get the interactive mention treatment
	 * and open the Inspector. Anything else is plain text — we do not invent
	 * a record card for a name the dataset does not hold.
	 */

	import { onMount } from 'svelte';
	import { t } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { resolveEntity } from '$lib/model';
	import type { InvestigationBundle, ContentBlock, Entity } from '$lib/media/types';
	import ClaimIndicator from './ClaimIndicator.svelte';
	import ClaimExpansion from './ClaimExpansion.svelte';
	import EntityMention from './EntityMention.svelte';
	import InterpretationPanel from './InterpretationPanel.svelte';
	import SidebarTimeline from './SidebarTimeline.svelte';

	interface Props {
		investigation: InvestigationBundle;
	}

	let { investigation }: Props = $props();

	const meta = $derived(investigation.meta);
	const evidence = $derived(investigation.evidence);
	const sources = $derived(investigation.sources);
	const timeline = $derived(investigation.timeline);
	const entities = $derived(investigation.entities);
	const interpretations = $derived(investigation.interpretations?.interpretations ?? []);
	const narrative = $derived(investigation.narrative);
	const sections = $derived(narrative.en?.sections ?? []);

	/** Group narrative blocks under their section markers. */
	const groupedAll = $derived.by(() => {
		const out: Array<{ id: string | null; title: string; blocks: ContentBlock[] }> = [];
		let cur: { id: string | null; title: string; blocks: ContentBlock[] } | null = null;
		for (const s of sections) {
			if (s.t === 'section') {
				cur = { id: (s.id as string) ?? null, title: (s.title as string) ?? '', blocks: [] };
				out.push(cur);
			} else if (cur) {
				cur.blocks.push(s as ContentBlock);
			}
		}
		return out;
	});
	const introGroup = $derived(groupedAll.find((g) => g.id === 'S00') ?? null);
	const narrativeGroups = $derived(groupedAll.filter((g) => g.id !== 'S00'));
	const sectionTitleMap = $derived(Object.fromEntries(groupedAll.map((g) => [g.id ?? '', g.title])));

	// State
	let expandedClaim = $state<string | null>(null);
	let currentSection = $state<string | null>(null);
	let introOpen = $state(false);

	// Track which section the reader is in: the last marker above the viewport middle.
	onMount(() => {
		const view = document.querySelector('.article-col') as HTMLElement | null;
		if (!view) return;
		const onScroll = () => {
			const markers = Array.from(view.querySelectorAll('[data-section]')) as HTMLElement[];
			const mid = view.scrollTop + view.clientHeight * 0.35;
			let cur: string | null = null;
			for (const m of markers) {
				if (m.offsetTop <= mid) cur = m.dataset.section ?? null;
			}
			currentSection = cur;
		};
		view.addEventListener('scroll', onScroll, { passive: true });
		return () => view.removeEventListener('scroll', onScroll);
	});

	function findClaim(id: string) {
		return evidence.claims.find((c) => c.id === id);
	}
	function findInterp(ref: string) {
		return interpretations.find((i) => i.id === ref);
	}
	function findEntity(id: string): Entity | undefined {
		return entities.entities.find((e) => e.id === id) as Entity | undefined;
	}
	function findSources(sourceIds: string[]) {
		const ids = new Set(sourceIds);
		return sources.sources.filter((s) => ids.has(s.id));
	}
	function toggleClaim(id: string) {
		expandedClaim = expandedClaim === id ? null : id;
	}
	function graphIdFor(entity: Entity | undefined): string | null {
		if (!entity) return null;
		return (entity.graph_id as string) ?? entity.id;
	}
	function existsInGraph(entity: Entity | undefined): boolean {
		const gid = graphIdFor(entity);
		if (!gid) return false;
		return resolveEntity(gid) !== null;
	}
	function openInGraph(entity: Entity) {
		const gid = graphIdFor(entity);
		if (!gid || !resolveEntity(gid)) return;
		app.selected = gid;
	}
	function jumpToSection(id: string) {
		const view = document.querySelector('.article-col') as HTMLElement | null;
		const el = view?.querySelector(`[data-section="${id}"]`) as HTMLElement | null;
		if (el && view) {
			view.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
		}
	}
</script>

<div class="article-layout">
	<div class="article-col">
		<header class="article-header">
			{#if meta.series}
				<span class="series">{meta.series.title.en} · #{String(meta.series.position ?? '')}</span>
			{/if}
			<h1>{meta.title.en}</h1>
			<p class="dek">{meta.subtitle.en}</p>
			<div class="meta-line">
				<span>{meta.published}</span>
				<span class="sep">·</span>
				<span>{meta.reading_time_minutes} min read</span>
			</div>
		</header>

		{#if introGroup}
			<section class="intro-box" class:open={introOpen} aria-label="How to read this investigation">
				<details class="intro-details" bind:open={introOpen}>
					<summary class="intro-toggle">
						<span class="intro-toggle-main">
							<span class="intro-toggle-label">How to read this investigation</span>
							<span class="intro-toggle-sub">Evidence badges · Entity links · Corrections</span>
						</span>
						<span class="intro-toggle-action" aria-hidden="true">
							<span class="intro-toggle-hint">{introOpen ? 'Hide' : 'Show'}</span>
							<span class="intro-toggle-icon" class:open={introOpen}>
								<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
									<path d="M5 3.5L10 8L5 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</span>
						</span>
					</summary>
					<div id="intro-body" class="intro-body">
						{#each introGroup.blocks as block, bi (bi)}
							{@render sectionBlocks(block, true)}
						{/each}
						<div class="intro-profile">
							<div class="profile-item">
								<span class="profile-num">{evidence.claims.length}</span>
								<span class="profile-label">claims</span>
							</div>
							<div class="profile-item">
								<span class="profile-num">{sources.sources.length}</span>
								<span class="profile-label">sources</span>
							</div>
							<div class="profile-item">
								<span class="profile-num">{evidence.claims.filter((c) => c.disputed).length}</span>
								<span class="profile-label">disputed</span>
							</div>
							<div class="profile-item">
								<span class="profile-num">{evidence.claims.filter((c) => c.grade === 'unsubstantiated').length}</span>
								<span class="profile-label">unresolved</span>
							</div>
						</div>
					</div>
				</details>
			</section>
		{/if}

		<article class="narrative">
			{#each narrativeGroups as group, gi (group.id ?? gi)}
				<section class="narrative-section" data-section={group.id}>
					<header class="section-head">
						<span class="section-kicker" aria-hidden="true">{group.id}</span>
						{#if group.title}
							<h2 class="section-title">{group.title}</h2>
						{/if}
					</header>
					{#each group.blocks as block, bi (bi)}
						{@render sectionBlocks(block, false)}
					{/each}
				</section>
			{/each}
		</article>

		<!-- Evidence ledger — real table, not div-based. The article's claims
		     are authoritative; this renders them as a proper <table> with
		     <th scope> so screen readers and the smoke ledger check see it. -->
		<section class="ledger" aria-label="Evidence ledger">
			<h2 class="ledger-title">Evidence ledger</h2>
			<div class="ledger-scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">Claim</th>
							<th scope="col">Grade</th>
							<th scope="col">Text</th>
							<th scope="col">Sources</th>
						</tr>
					</thead>
					<tbody>
						{#each evidence.claims as claim (claim.id)}
							<tr>
								<th scope="row">{claim.id}</th>
								<td>{claim.grade}</td>
								<td>{claim.text.en ?? ''}</td>
								<td>{(claim.sources as string[]).join(', ')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>

	<aside class="sidebar">
		<SidebarTimeline events={timeline.events} {currentSection} oneventclick={jumpToSection} sectionTitles={sectionTitleMap} />
	</aside>
</div>

{#snippet sectionBlocks(block: ContentBlock, inIntro: boolean)}
	{#if block.t === 'h2'}
		<h2 class:intro-heading={inIntro}>
			{#each (block.v ?? []) as node, ni (ni)}
				{@render inlineNode(node)}
			{/each}
		</h2>
	{:else if block.t === 'h3'}
		<h3 class:intro-heading={inIntro}>
			{#each (block.v ?? []) as node, ni (ni)}
				{@render inlineNode(node)}
			{/each}
		</h3>
	{:else if block.t === 'p'}
		<p class:intro-text={inIntro}>
			{#each (block.v ?? []) as node, ni (ni)}
				{@render inlineNode(node)}
			{/each}
		</p>
		{#if expandedClaim && !inIntro}
			{@const claim = findClaim(expandedClaim)}
			{#if claim && (block.v ?? []).some((n) => n.t === 'claim_ref' && n.claim_id === expandedClaim)}
				<ClaimExpansion {claim} sources={findSources((claim.sources as string[]) ?? [])} onclose={() => (expandedClaim = null)} />
			{/if}
		{/if}
	{:else if block.t === 'ul'}
		<ul class:intro-list={inIntro}>
			{#each block.items ?? [] as item, ii (ii)}
				<li>
					{#each item as node, ni (ni)}
						{@render inlineNode(node)}
					{/each}
				</li>
			{/each}
		</ul>
	{:else if block.t === 'ol'}
		<ol class:intro-list={inIntro}>
			{#each block.items ?? [] as item, ii (ii)}
				<li>
					{#each item as node, ni (ni)}
						{@render inlineNode(node)}
					{/each}
				</li>
			{/each}
		</ol>
	{:else if block.t === 'interp'}
		{@const reading = findInterp(block.ref)}
		{#if reading}
			<InterpretationPanel interp={reading} />
		{:else}
			<span class="missing-ref">[{block.ref}]</span>
		{/if}
	{/if}
{/snippet}

{#snippet inlineNode(node: import('$lib/media/types').ContentInline)}
	{#if node.t === 'text'}
		{node.v}
	{:else if node.t === 'strong'}
		<strong>{#each (node.children ?? []) as c, ci (ci)}{@render inlineNode(c)}{/each}</strong>
	{:else if node.t === 'em'}
		<em>{#each (node.children ?? []) as c, ci (ci)}{@render inlineNode(c)}{/each}</em>
	{:else if node.t === 'link'}
		<a href={node.href}>{node.label}</a>
	{:else if node.t === 'claim_ref'}
		{@const claim = findClaim(node.claim_id ?? '')}
		{#if claim}
			<ClaimIndicator {claim} expanded={expandedClaim === node.claim_id} onclick={() => toggleClaim(node.claim_id ?? '')} />
		{:else}
			<span class="missing-ref">[{node.claim_id}]</span>
		{/if}
	{:else if node.t === 'entity_ref'}
		{@const entity = findEntity(node.entity_id ?? '')}
		{#if entity && existsInGraph(entity)}
			<EntityMention {entity} active={false} onclick={() => openInGraph(entity)} />
		{:else if entity}
			<span class="entity-plain">{entity.name.en ?? entity.id}</span>
		{:else}
			<span class="entity-text">@{node.entity_id}</span>
		{/if}
	{:else}
		{node.v ?? ''}
	{/if}
{/snippet}

<style>
	.article-layout {
		display: flex;
		height: 100%;
		overflow: hidden;
	}
	.article-col {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--s-10) var(--s-6) var(--s-12);
	}
	.article-header {
		width: 100%;
		max-width: 660px;
		margin-bottom: var(--s-9);
		text-align: center;
	}
	.series {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--accent);
		display: block;
		margin-bottom: var(--s-4);
	}
	.article-header h1 {
		font-family: var(--font-serif);
		font-size: clamp(30px, 4.5vw, 46px);
		font-weight: 400;
		letter-spacing: var(--track-tight);
		line-height: 1.1;
		color: var(--text-primary);
		margin: 0 0 var(--s-4);
	}
	.dek {
		font-size: var(--t-md);
		line-height: 1.6;
		color: var(--text-secondary);
		max-width: 56ch;
		margin: 0 auto var(--s-4);
	}
	.meta-line {
		display: flex;
		justify-content: center;
		gap: var(--s-3);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.meta-line .sep {
		opacity: 0.5;
	}
	.intro-box {
		width: 100%;
		max-width: 660px;
		margin-bottom: var(--s-10);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.intro-details {
		margin: 0;
	}
	.intro-details summary {
		list-style: none;
		cursor: pointer;
	}
	.intro-details summary::-webkit-details-marker {
		display: none;
	}
	.intro-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--s-4);
		padding: var(--s-4) var(--s-6);
		background: var(--surface-raised);
		border: none;
		border-bottom: 1px solid transparent;
		cursor: pointer;
		text-align: start;
		border-radius: var(--r-lg);
	}
	.intro-box.open .intro-toggle {
		border-bottom-color: var(--border-subtle);
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
	.intro-toggle:hover {
		border-color: color-mix(in oklch, var(--accent) 30%, var(--border-default));
		background: color-mix(in oklch, var(--accent) 4%, var(--surface-raised));
	}
	.intro-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.intro-toggle-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.intro-toggle-label {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 700;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-primary);
	}
	.intro-toggle-sub {
		font-size: var(--t-2xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.intro-toggle-action {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin-inline-start: auto;
		flex-shrink: 0;
	}
	.intro-toggle-hint {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
		border-radius: var(--r-full);
		padding: 2px 8px;
	}
	.intro-toggle-icon {
		color: var(--accent);
		transition: transform var(--dur-fast) var(--ease-out);
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 22%, transparent);
		flex-shrink: 0;
	}
	.intro-toggle-icon.open {
		transform: rotate(90deg);
	}
	.intro-body {
		padding: 0 var(--s-7) var(--s-5);
		animation: intro-in var(--dur-normal) var(--ease-out);
	}
	@keyframes intro-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: none; }
	}
	.intro-heading {
		font-family: var(--font-serif);
		font-size: var(--t-lg);
		font-weight: 400;
		color: var(--text-primary);
		margin: var(--s-5) 0 var(--s-3);
	}
	.intro-text {
		font-size: var(--t-sm);
		line-height: 1.7;
		color: var(--text-secondary);
		margin: 0 0 var(--s-3);
	}
	.intro-list {
		margin: 0 0 var(--s-4);
		padding-inline-start: var(--s-6);
		font-size: var(--t-sm);
		line-height: 1.65;
		color: var(--text-secondary);
	}
	.intro-list li {
		margin-bottom: var(--s-2);
	}
	.intro-profile {
		display: flex;
		gap: var(--s-8);
		margin-top: var(--s-5);
		padding: var(--s-4) 0 0;
		border-top: 1px solid var(--border-subtle);
	}
	.profile-item {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.profile-num {
		font-family: var(--font-mono);
		font-size: var(--t-xl);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}
	.profile-label {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.narrative {
		width: 100%;
		max-width: 660px;
		font-family: var(--font-serif);
		font-size: 16px;
		line-height: 1.75;
		color: var(--text-secondary);
	}
	.narrative-section {
		margin-bottom: var(--s-10);
		scroll-margin-top: var(--s-8);
	}
	.section-head {
		margin-bottom: var(--s-4);
		border-bottom: 1px solid var(--border-subtle);
		padding-bottom: var(--s-3);
	}
	.section-kicker {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		letter-spacing: var(--track-caps);
		color: var(--accent);
		display: block;
		margin-bottom: 2px;
	}
	:global([dir='rtl']) .section-kicker {
		letter-spacing: 0;
	}
	.section-title {
		font-family: var(--font-serif);
		font-size: var(--t-2xl);
		font-weight: 400;
		line-height: 1.25;
		color: var(--text-primary);
		margin: 0;
	}
	.narrative :global(h3) {
		font-family: var(--font-serif);
		font-size: var(--t-lg);
		font-weight: 400;
		color: var(--text-primary);
		margin: var(--s-7) 0 var(--s-3);
	}
	.narrative :global(p) {
		margin: 0 0 var(--s-5);
	}
	.narrative :global(a) {
		color: var(--accent);
		border-bottom-color: var(--accent-border);
	}
	.narrative :global(ul),
	.narrative :global(ol) {
		margin: 0 0 var(--s-5);
		padding-inline-start: var(--s-6);
	}
	.narrative :global(li) {
		margin-bottom: var(--s-3);
	}
	.missing-ref {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--basis-unsubstantiated);
		background: var(--surface-sunken);
		padding: 0 4px;
		border-radius: var(--r-xs);
	}
	.entity-plain {
		font-family: var(--font-serif);
		color: var(--text-secondary);
	}
	.entity-text {
		font-family: var(--font-serif);
		font-style: italic;
		color: var(--text-muted);
	}
	.ledger {
		width: 100%;
		max-width: 660px;
		margin-top: var(--s-10);
		padding-top: var(--s-6);
		border-top: 1px solid var(--border-default);
	}
	.ledger-title {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 600;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin: 0 0 var(--s-4);
	}
	.ledger-scroll {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
	}
	.ledger table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-sm);
	}
	.ledger th,
	.ledger td {
		padding: var(--s-3) var(--s-4);
		text-align: start;
		border-bottom: 1px solid var(--border-subtle);
		white-space: nowrap;
		vertical-align: top;
	}
	.ledger th {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--surface-sunken);
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.ledger td {
		color: var(--text-secondary);
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		max-width: 32ch;
		white-space: normal;
	}
	.ledger tbody tr:hover {
		background: var(--surface-hover);
	}
	.ledger tbody th {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--text-primary);
		background: var(--surface-base);
		position: sticky;
		left: 0;
	}

	.sidebar {
		width: 300px;
		flex-shrink: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--s-7) var(--s-6);
		border-inline-start: 1px solid var(--border-subtle);
		background: color-mix(in oklch, var(--surface-raised) 55%, transparent);
	}
	@media (max-width: 900px) {
		.article-layout {
			flex-direction: column;
			overflow-y: auto;
		}
		.article-col {
			padding: var(--s-7) var(--s-4) var(--s-8);
			overflow-y: visible;
		}
		.sidebar {
			width: 100%;
			border-inline-start: none;
			border-block-start: 1px solid var(--border-subtle);
			max-height: 260px;
			overflow-y: auto;
			padding: var(--s-5) var(--s-4);
		}
		.intro-profile {
			flex-wrap: wrap;
			gap: var(--s-5);
		}
	}
</style>
