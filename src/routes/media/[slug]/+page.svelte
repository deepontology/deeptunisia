<script lang="ts">
	import { t } from '$lib/t.svelte';
	import type { InvestigationBundle } from '$lib/media/types';

	/**
	 * Investigation gateway — shows all available views for one investigation.
	 */

	let { data } = $props();
	const investigation = $derived(data.investigation as unknown as InvestigationBundle);
	const meta = $derived(investigation.meta);
	const research = $derived(investigation.research);
	const components = $derived(investigation.components);

	const compList = $derived((components as { components: Array<{ type: string }> }).components ?? []);
	const hasTimeline = $derived(compList.some((c) => c.type === 'timeline'));
	const hasDataTables = $derived(compList.some((c) => c.type === 'data-tables'));
	const hasExclusions = $derived(compList.some((c) => c.type === 'exclusions'));
</script>

<svelte:head>
	<title>{meta.title.en} · Media · DeepTunisia</title>
	<meta name="description" content={meta.subtitle.en} />
</svelte:head>

<div class="page">
	<header class="page-head">
		{#if meta.series}
			<span class="eyebrow">{t('media.series.prefix')}: {meta.series.title.en} · #{meta.series.position}</span>
		{/if}
		<h1>{meta.title.en}</h1>
		<div class="dek">{meta.subtitle.en}</div>
		<div class="meta-line">
			<span>{t('media.published')}: {meta.published}</span>
			<span>·</span>
			<span>{meta.reading_time_minutes} min read</span>
		</div>
	</header>

	<div class="content">
		<!-- Primary CTA -->
		<a class="primary-cta" href="/media/{meta.slug}/article">
			<span class="cta-label">{t('media.article.read')}</span>
			<span class="cta-meta">{meta.reading_time_minutes} min · {(investigation.evidence?.claims ?? []).length} claims · {(investigation.sources?.sources ?? []).length} sources</span>
		</a>

		<!-- Evidence profile -->
		<div class="evidence-profile">
			<div class="ep-title">Evidence profile</div>
			<div class="ep-stats">
				<span>{(investigation.evidence?.claims ?? []).length} claims</span>
				<span>·</span>
				<span>{(investigation.sources?.sources ?? []).length} sources</span>
				<span>·</span>
				<span>{(investigation.evidence?.claims ?? []).filter((c: { disputed?: boolean }) => c.disputed).length} disputed</span>
				<span>·</span>
				<span>{(investigation.evidence?.claims ?? []).filter((c: { grade?: string }) => c.grade === 'unsubstantiated').length} unresolved</span>
			</div>
		</div>

		<!-- Available views -->
		<div class="views-grid">
			<a class="view-card" href="/media/{meta.slug}/article">
				<span class="view-icon">📖</span>
				<span class="view-label">Article</span>
				<span class="view-desc">The full narrative</span>
			</a>
			<a class="view-card" href="/media/{meta.slug}/article">
				<span class="view-icon">📋</span>
				<span class="view-label">{t('media.evidence.title')}</span>
				<span class="view-desc">{(investigation.evidence?.claims ?? []).length} claims</span>
			</a>
			{#if hasTimeline}
				<a class="view-card" href="/media/{meta.slug}/article">
					<span class="view-icon">📅</span>
					<span class="view-label">{t('media.timeline.title')}</span>
					<span class="view-desc">{(investigation.timeline?.events ?? []).length} events</span>
				</a>
			{/if}
			<a class="view-card" href="/media/{meta.slug}/article">
				<span class="view-icon">📚</span>
				<span class="view-label">{t('media.sources.title')}</span>
				<span class="view-desc">{(investigation.sources?.sources ?? []).length} entries</span>
			</a>
			{#if hasExclusions}
				<a class="view-card" href="/media/{meta.slug}/article">
					<span class="view-icon">🚫</span>
					<span class="view-label">{t('media.exclusions.title')}</span>
					<span class="view-desc">{(investigation.exclusions?.exclusions ?? []).length} items</span>
				</a>
			{/if}
		</div>

		<!-- Research details -->
		{#if research}
			<div class="research-details">
				<div class="rd-title">Research details</div>
				<dl>
					<dt>{t('media.research.researcher')}</dt>
					<dd>{research.researcher}</dd>
					<dt>{t('media.research.period')}</dt>
					<dd>{research.research_period}</dd>
					<dt>{t('media.research.sources_consulted')}</dt>
					<dd>{research.sources_consulted_count} ({research.primary_sources_count} primary)</dd>
					<dt>{t('media.research.records_created')}</dt>
					<dd>{(research.records_created ?? []).length} files</dd>
				</dl>
			</div>
		{/if}
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.page-head {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-8) var(--s-6) var(--s-3);
	}
	.page-head .eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.page-head h1 {
		margin: var(--s-3) 0 var(--s-4);
		font-family: var(--font-serif);
		font-size: var(--t-4xl);
		font-weight: 400;
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	.page-head .dek {
		font-size: var(--t-lg);
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.meta-line {
		display: flex;
		gap: var(--s-3);
		margin-top: var(--s-3);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	.content {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-3) var(--s-6) var(--s-12);
	}

	.primary-cta {
		display: block;
		padding: var(--s-5) var(--s-6);
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--r-lg);
		text-decoration: none;
		text-align: center;
		margin-bottom: var(--s-5);
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.primary-cta:hover {
		opacity: 0.9;
	}
	.cta-label {
		display: block;
		font-size: var(--t-lg);
		font-weight: 560;
	}
	.cta-meta {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		margin-top: var(--s-2);
		opacity: 0.8;
	}

	.evidence-profile {
		padding: var(--s-4) var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-sunken);
		margin-bottom: var(--s-5);
	}
	.ep-title {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: var(--s-2);
	}
	.ep-stats {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		display: flex;
		gap: var(--s-3);
	}

	.views-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--s-3);
		margin-bottom: var(--s-6);
	}
	.view-card {
		display: flex;
		flex-direction: column;
		padding: var(--s-4);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		text-decoration: none;
		color: inherit;
		transition:
			border-color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.view-card:hover {
		border-color: var(--accent);
		box-shadow: var(--elev-1);
	}
	.view-icon {
		font-size: var(--t-xl);
		margin-bottom: var(--s-2);
	}
	.view-label {
		font-weight: 560;
		color: var(--text-primary);
	}
	.view-desc {
		font-size: var(--t-xs);
		color: var(--text-muted);
		margin-top: var(--s-1);
	}

	.research-details {
		padding: var(--s-4) var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-sunken);
	}
	.rd-title {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: var(--s-3);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--s-2) var(--s-4);
		font-size: var(--t-sm);
	}
	dt {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
	}
	dd {
		color: var(--text-secondary);
		margin: 0;
	}
</style>
