<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, formatDate } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { localized } from '$lib/media/meta';
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

	const claimCount = $derived((investigation.evidence?.claims ?? []).length);
	const sourceCount = $derived((investigation.sources?.sources ?? []).length);
	const disputedCount = $derived(
		(investigation.evidence?.claims ?? []).filter((c: { disputed?: boolean }) => c.disputed).length
	);
	const unresolvedCount = $derived(
		(investigation.evidence?.claims ?? []).filter((c: { grade?: string }) => c.grade === 'unsubstantiated').length
	);
	const timelineCount = $derived((investigation.timeline?.events ?? []).length);
	const exclusionCount = $derived((investigation.exclusions?.exclusions ?? []).length);
	const recordCount = $derived((research?.records_created ?? []).length);

	/** The bundle stores ISO dates; the rest of the site shows them in the reader's locale. */
	const when = (iso: string) => (iso ? formatDate(new Date(iso).getTime()) : '');
</script>

<svelte:head>
	<title>{localized(meta.title)} · Media · DeepTunisia</title>
	<meta name="description" content={localized(meta.subtitle)} />
</svelte:head>

<div class="page">
	<header class="page-head">
		{#if meta.series}
			<span class="eyebrow">{t('media.series.prefix')}: {localized(meta.series.title)} · #{meta.series.position}</span>
		{/if}
		<h1>{localized(meta.title)}</h1>
		<div class="dek">{localized(meta.subtitle)}</div>
		<div class="meta-line">
			<span>{t('media.published')}: {when(meta.published)}</span>
			<span>·</span>
			<span>{format(app.locale, 'media.article.readtime', { n: meta.reading_time_minutes })}</span>
		</div>
	</header>

	<div class="content">
		<!-- Primary CTA -->
		<a class="primary-cta" href="/media/{meta.slug}/article">
			<span class="cta-label">{t('media.article.read')}</span>
			<span class="cta-meta">{format(app.locale, 'media.article.readtime', { n: meta.reading_time_minutes })} · {format(app.locale, 'media.evidence.claims', { n: claimCount })} · {format(app.locale, 'media.card.sources', { n: sourceCount })}</span>
		</a>

		<!-- Evidence profile -->
		<div class="evidence-profile">
			<div class="ep-title">{t('media.evidence.profile')}</div>
			<div class="ep-stats">
				<span>{format(app.locale, 'media.evidence.claims', { n: claimCount })}</span>
				<span>·</span>
				<span>{format(app.locale, 'media.card.sources', { n: sourceCount })}</span>
				<span>·</span>
				<span>{format(app.locale, 'media.evidence.disputed', { n: disputedCount })}</span>
				<span>·</span>
				<span>{format(app.locale, 'media.evidence.unresolved', { n: unresolvedCount })}</span>
			</div>
		</div>

		<!-- Available views -->
		<div class="views-grid">
			<a class="view-card" href="/media/{meta.slug}/article">
				<span class="view-icon">📖</span>
				<span class="view-label">{t('media.view.article')}</span>
				<span class="view-desc">{t('media.view.article.desc')}</span>
			</a>
			<a class="view-card" href="/media/{meta.slug}/article">
				<span class="view-icon">📋</span>
				<span class="view-label">{t('media.evidence.title')}</span>
				<span class="view-desc">{format(app.locale, 'media.evidence.claims', { n: claimCount })}</span>
			</a>
			{#if hasTimeline}
				<a class="view-card" href="/media/{meta.slug}/article">
					<span class="view-icon">📅</span>
					<span class="view-label">{t('media.timeline.title')}</span>
					<span class="view-desc">{format(app.locale, 'media.timeline.events', { n: timelineCount })}</span>
				</a>
			{/if}
			<a class="view-card" href="/media/{meta.slug}/article">
				<span class="view-icon">📚</span>
				<span class="view-label">{t('media.sources.title')}</span>
				<span class="view-desc">{format(app.locale, 'media.sources.entries', { n: sourceCount })}</span>
			</a>
			{#if hasExclusions}
				<a class="view-card" href="/media/{meta.slug}/article">
					<span class="view-icon">🚫</span>
					<span class="view-label">{t('media.exclusions.title')}</span>
					<span class="view-desc">{format(app.locale, 'media.exclusions.items', { n: exclusionCount })}</span>
				</a>
			{/if}
		</div>

		<!-- Research details -->
		{#if research}
			<div class="research-details">
				<div class="rd-title">{t('media.research.title')}</div>
				<dl>
					<dt>{t('media.research.researcher')}</dt>
					<dd>{research.researcher}</dd>
					<dt>{t('media.research.period')}</dt>
					<dd>{research.research_period}</dd>
					<dt>{t('media.research.sources_consulted')}</dt>
					<dd>{format(app.locale, 'media.evidence.sources', { n: research.sources_consulted_count, n_primary: research.primary_sources_count })}</dd>
					<dt>{t('media.research.records_created')}</dt>
					<dd>{format(app.locale, 'media.research.files', { n: recordCount })}</dd>
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
