<script lang="ts">
	import { t } from '$lib/t.svelte';

	/**
	 * Media index — lists all investigations.
	 *
	 * Data loaded from src/generated/media/index.json (build output).
	 */

	let { data } = $props();
	const investigations = $derived(data.investigations);
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
		<span class="eyebrow">DeepTunisia Media</span>
		<h1>{t('media.index.title')}</h1>
		<div class="lede">{t('media.index.subtitle')}</div>
	</header>

	<div class="grid">
		{#each investigations as inv (inv.slug)}
			<a class="card" href="/media/{inv.slug}">
				<div class="card-head">
					{#if inv.series}
						<span class="series">{t('media.series.prefix')}: {inv.series.title.en} · #{inv.series.position}</span>
					{/if}
					<h2>{inv.title.en}</h2>
					<p class="subtitle">{inv.subtitle.en}</p>
				</div>
				<div class="card-meta">
					<span class="evidence-bar" style:--confidence={inv.overall_confidence}></span>
					<span class="stats">
						{inv.claim_count} claims · {inv.source_count} sources
						{#if inv.disputed_count > 0} · {inv.disputed_count} disputed{/if}
						{#if inv.unresolved_count > 0} · {inv.unresolved_count} unresolved{/if}
					</span>
					<span class="readtime">{inv.reading_time_minutes} min</span>
				</div>
				{#if inv.tags.length > 0}
					<div class="tags">
						{#each inv.tags as tag}
							<span class="tag">{tag}</span>
						{/each}
					</div>
				{/if}
				<div class="date">{inv.published}</div>
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
		background: var(--basis-documented);
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
