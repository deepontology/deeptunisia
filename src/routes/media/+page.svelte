<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, formatDate } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { localized } from '$lib/media/meta';
	import { confidenceTint, isConfidence } from '$lib/media/confidence';

	/**
	 * Media index — lists all investigations.
	 *
	 * Data loaded from src/generated/media/index.json (build output).
	 */

	let { data } = $props();
	const investigations = $derived(data.investigations);

	/** The bundle stores ISO dates; the rest of the site shows them in the reader's locale. */
	const when = (iso: string) => (iso ? formatDate(new Date(iso).getTime()) : '');
</script>

<svelte:head>
	<title>Media · DeepTunisia</title>
	<meta
		name="description"
		content="Investigative reporting on power, industry, and evidence in Tunisia — from the knowledge graph."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('media.eyebrow')}</span>
		<h1>{t('media.index.title')}</h1>
		<div class="lede">{t('media.index.subtitle')}</div>
	</header>

	<div class="grid">
		{#each investigations as inv (inv.slug)}
			{@const conf = isConfidence(inv.overall_confidence) ? inv.overall_confidence : null}
			<a class="card" href="/media/{inv.slug}">
				<div class="card-head">
					{#if inv.series}
						<span class="series">{t('media.series.prefix')}: {localized(inv.series.title)} · #{inv.series.position}</span>
					{/if}
					<h2>{localized(inv.title)}</h2>
					<p class="subtitle">{localized(inv.subtitle)}</p>
				</div>
				<div class="card-meta">
					<span
						class="evidence-bar"
						style:--c={confidenceTint(inv.overall_confidence)}
						role={conf ? 'img' : undefined}
						aria-label={conf ? format(app.locale, 'media.confidence.aria', { grade: conf }) : undefined}
					></span>
					<span class="stats">
						{format(app.locale, 'media.evidence.claims', { n: inv.claim_count })} · {format(app.locale, 'media.card.sources', { n: inv.source_count })}
						{#if inv.disputed_count > 0} · {format(app.locale, 'media.evidence.disputed', { n: inv.disputed_count })}{/if}
						{#if inv.unresolved_count > 0} · {format(app.locale, 'media.evidence.unresolved', { n: inv.unresolved_count })}{/if}
					</span>
					<span class="readtime">{format(app.locale, 'media.article.readtime', { n: inv.reading_time_minutes })}</span>
				</div>
				{#if inv.tags.length > 0}
					<div class="tags">
						{#each inv.tags as tag}
							<span class="tag">{tag}</span>
						{/each}
					</div>
				{/if}
				<div class="date">{when(inv.published)}</div>
			</a>
		{/each}
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
	.page-head .lede {
		font-size: var(--t-lg);
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.grid {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-3) var(--s-6) var(--s-12);
		display: grid;
		gap: var(--s-5);
	}

	.card {
		display: block;
		padding: var(--s-5) var(--s-6);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-raised);
		text-decoration: none;
		color: inherit;
		transition:
			border-color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.card:hover {
		border-color: var(--accent);
		box-shadow: var(--elev-1);
	}

	.card-head .series {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.card-head h2 {
		font-family: var(--font-serif);
		font-size: var(--t-2xl);
		font-weight: 400;
		color: var(--text-primary);
		margin: var(--s-2) 0 var(--s-2);
		line-height: 1.2;
	}
	.card-head .subtitle {
		font-size: var(--t-sm);
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-top: var(--s-4);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	.evidence-bar {
		width: 32px;
		height: 4px;
		border-radius: 2px;
		background: var(--c);
		opacity: 0.7;
	}

	.readtime {
		margin-inline-start: auto;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-top: var(--s-3);
	}
	.tag {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		padding: 1px 6px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		color: var(--text-muted);
	}

	.date {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-top: var(--s-3);
	}
</style>
