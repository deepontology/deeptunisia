<script lang="ts">
	import { ds, personById } from '$lib/model';
	import { personName, t } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { app } from '$lib/state.svelte';
	import Content from '$lib/ui/Content.svelte';
	import Button from '$lib/ui/Button.svelte';

	/**
	 * The knowledge graph is the product; this page is where it leaves the building.
	 *
	 * A power map nobody can check is just an assertion with better typography. Every
	 * record, source and grading is downloadable, so the reasoning can be audited or
	 * disagreed with rather than taken on trust.
	 */

	// The review buckets, most-damaging first — the same order the build emits them
	// in (build-data.ts REVIEW_RISK). Never re-sorted for display. `attributed` is a
	// risk class (grade C/D claims that name their claimant), not a basis — it has
	// its own key beside the basis labels.
	const RISK_ORDER = ['unsubstantiated', 'attributed', 'inferred', 'reported', 'documented'] as const;
	const RISK_KEY: Record<(typeof RISK_ORDER)[number], string> = {
		unsubstantiated: 'basis.unsubstantiated',
		attributed: 'basis.attributed',
		inferred: 'basis.inferred',
		reported: 'basis.reported',
		documented: 'basis.documented'
	};

	const histogramRows = Object.entries(ds.meta.cards.histogram).sort(
		(a, b) => Number(a[0]) - Number(b[0])
	);

	// The live numbers the caveats prose interpolates ({param} in content files).
	const caveatParams = {
		needsPrimary: ds.meta.needsPrimarySourceCount,
		contradictions: ds.meta.contradictions.length,
		reviewed: ds.meta.review.reviewed,
		reviewable: ds.meta.review.reviewable
	};

	const SCHEMA = [
		{
			name: 'Source',
			purpose: 'data.schema.source',
			fields: 'id, title, publisher, date, url, archive_url, tier (1–5), lang, excerpt'
		},
		{
			name: 'Institution',
			purpose: 'data.schema.institution',
			fields: 'id, name_en/fr/ar, abbr, type, layer, parent, active interval, sources'
		},
		{
			name: 'Role',
			purpose: 'data.schema.role',
			fields: 'id, title_en/fr/ar, institution, authority (published weight table)'
		},
		{
			name: 'Person',
			purpose: 'data.schema.person',
			fields: 'id, name_en/fr/ar, aliases, birth, death, layers, trajectory, basis, sources'
		},
		{
			name: 'Position',
			purpose: 'data.schema.position',
			fields:
				'id, role, holder, interval (4-field fuzzy), basis, datesInferred, reasoning, falsifiable_by, disputes, review, predecessorDerived, successorDerived, sources'
		},
		{
			name: 'Relationship',
			purpose: 'data.schema.relationship',
			fields: 'id, from, to, type, subtype, interval, basis, attributed_to, reasoning, falsifiable_by, disputes, sources'
		},
		{
			name: 'Event',
			purpose: 'data.schema.event',
			fields: 'id, date, title_en/fr/ar, category, rupture, actors, institutions, contested, disputes, sources'
		},
		{
			name: 'Era, Question, Hypothesis',
			purpose: 'data.schema.analytical',
			fields: 'era: interval, thesis, formula · question: kind, status · hypothesis: support, reasoning, falsifiable_by'
		}
	];

	const EXAMPLE = `{
  "id": "p-dgsn-saidane",
  "role": "dg-national-security",
  "holder": "mourad-saidane",
  "basis": "documented",
  "datesInferred": false,
  "interval": {
    "startEarliest": 1653955200000,
    "startLatest":   1653955200000,
    "endEarliest":   1759276800000,
    "endLatest":     1785110400000,
    "startPrecision": "day",
    "status": "last-verified",
    "raw": { "start": "2022-05-31", "end": "verified:2025-10-01" }
  },
  "review": { "by": "Initial compilation", "date": "2026-07-26",
              "method": "Checked directly against the JORT decree text" },
  "sources": ["jort-2022-546", "lapresse-saied-securite-2025"]
}`;

	let copied: string | null = $state(null);
	async function copyUrl(href: string) {
		const url = `https://deeptunisia.org${href}`;
		try {
			await navigator.clipboard.writeText(url);
			copied = href;
			setTimeout(() => {
				if (copied === href) copied = null;
			}, 1400);
		} catch {}
	}
</script>

<svelte:head>
	<title>Open data · DeepTunisia</title>
	<meta
		name="description"
		content="Download the full Tunisian power knowledge graph as JSON. Every record, source and grading, reproducible."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('data.eyebrow')}</span>
		<h1>{t('data.title')}</h1>
		<div class="lede"><Content view="data" section="lede" /></div>
	</header>

	<div class="downloads">
		<div class="dl-card">
			<a class="dl primary" href="/dataset.json" download>
				<span class="dl-name">dataset.json</span>
				<span class="dl-desc">{t('data.dl.dataset')}</span>
				<span class="dl-meta mono">JSON · {t('data.meta.intervals')} · ~{Math.round(ds.meta.datasetKB)} KB</span>
			</a>
			<Button variant="ghost" size="xs" onclick={() => copyUrl('/dataset.json')} aria-label="Copy https://deeptunisia.org/dataset.json">
				{copied === '/dataset.json' ? t('agora.copied') : t('agora.copylink')}
			</Button>
		</div>
		<div class="dl-card">
			<a class="dl" href="/positions.csv" download>
				<span class="dl-name">positions.csv</span>
				<span class="dl-desc">{t('data.dl.positions')}</span>
				<span class="dl-meta mono">CSV · {ds.meta.counts.positions} {t('data.meta.rows')}</span>
			</a>
			<Button variant="ghost" size="xs" onclick={() => copyUrl('/positions.csv')} aria-label="Copy https://deeptunisia.org/positions.csv">
				{copied === '/positions.csv' ? t('agora.copied') : t('agora.copylink')}
			</Button>
		</div>
		<div class="dl-card">
			<a class="dl" href="/relationships.csv" download>
				<span class="dl-name">relationships.csv</span>
				<span class="dl-desc">{t('data.dl.relationships')}</span>
				<span class="dl-meta mono">CSV · {ds.meta.counts.relationships} {t('data.meta.rows')}</span>
			</a>
			<Button variant="ghost" size="xs" onclick={() => copyUrl('/relationships.csv')} aria-label="Copy https://deeptunisia.org/relationships.csv">
				{copied === '/relationships.csv' ? t('agora.copied') : t('agora.copylink')}
			</Button>
		</div>
		<div class="dl-card">
			<a class="dl" href="/sources.csv" download>
				<span class="dl-name">sources.csv</span>
				<span class="dl-desc">{t('data.dl.sources')}</span>
				<span class="dl-meta mono">CSV · {ds.meta.counts.sources} {t('data.meta.rows')}</span>
			</a>
			<Button variant="ghost" size="xs" onclick={() => copyUrl('/sources.csv')} aria-label="Copy https://deeptunisia.org/sources.csv">
				{copied === '/sources.csv' ? t('agora.copied') : t('agora.copylink')}
			</Button>
		</div>
	</div>

	<div class="prose">
		<Content view="data" section="read" />
	</div>

	<pre class="example"><code>{EXAMPLE}</code></pre>

	<div class="prose">
		<h2>{t('data.schema.entityModel')}</h2>
	</div>

	<table class="schema">
		<thead>
			<tr><th>{t('data.schema.type')}</th><th>{t('data.schema.purpose')}</th><th>{t('data.schema.keyFields')}</th></tr>
		</thead>
		<tbody>
			{#each SCHEMA as s (s.name)}
				<tr>
					<td class="sname">{s.name}</td>
					<td class="spurpose">{t(s.purpose)}</td>
					<td class="sfields mono">{s.fields}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="prose">
		<Content view="data" section="caveats" params={caveatParams} />

		<h2>{t('coverage.title')}</h2>
		<p>{t('coverage.subtitle')}</p>

		<table class="schema">
			<thead>
				<tr>
					<th>{t('coverage.presidential')}</th>
					<th>{t('coverage.edges')}</th>
					<th>{t('coverage.kin')}</th>
					<th>{t('coverage.missing')}</th>
				</tr>
			</thead>
			<tbody>
				{#each ds.meta.coverage.principals as p (p.id)}
					<tr>
						<td class="sname">
							{personById.has(p.id) ? personName(personById.get(p.id)!) : p.name}
						</td>
						<td>{p.total}</td>
						<td>{p.kin}</td>
						<td class="spurpose mono">{p.missing.length ? p.missing.join(', ') : t('coverage.allPresent')}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h2>{t('coverage.cards')}</h2>
		<table class="schema">
			<tbody>
				{#each histogramRows as [k, count] (k)}
					<tr>
						<td>{k} / {ds.meta.cards.sections.length}</td>
						<td>{count}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h2>{t('coverage.queue')}</h2>
		<p>{t('coverage.queueNote')}</p>
		{#if ds.meta.cards.worklist.length === 0}
			<p>{t('coverage.queueEmpty')}</p>
		{:else}
			<ul class="queue">
				{#each ds.meta.cards.worklist as w (w.id)}
					<li>
						<a href={`/network?id=${encodeURIComponent(w.id)}`}>
							{personById.has(w.id) ? personName(personById.get(w.id)!) : w.name}
						</a>
						<span class="mono">
							{format(app.locale, 'coverage.cardsOf', {
								count: w.filled,
								total: ds.meta.cards.sections.length
							})}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		<h2>{t('coverage.reviewed')}</h2>
		<p>{t('coverage.reviewedNote')}</p>
		<table class="schema">
			<tbody>
				{#each RISK_ORDER as bucket (bucket)}
					{@const counts = ds.meta.review.byRisk[bucket]}
					<tr>
						<td>{t(RISK_KEY[bucket])}</td>
						<td>{counts.reviewed} / {counts.total}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<Content view="data" section="rebuild" />
	</div>
</div>

<style>
	.page {
		flex: 1;
		overflow-y: auto;
		padding: 32px 22px 90px;
	}
	.page-head {
		max-width: 76ch;
	}
	h1 {
		font-size: 30px;
		margin: 4px 0 12px;
		font-family: var(--font-serif);
	}
	.lede {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.7;
		color: var(--text-secondary);
	}
	.lede :global(p) {
		margin: 0 0 12px;
	}
	.prose :global(h2) {
		font-family: var(--font-serif);
	}

	.downloads {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 10px;
		margin: 24px 0 8px;
		max-width: 1200px;
	}
	.dl-card {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.dl-card .dl {
		flex: 1;
	}
	.dl-card :global(.btn) {
		align-self: flex-start;
	}
	.dl {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 13px 15px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		text-decoration: none;
		transition: border-color 0.14s, background 0.14s;
	}
	.dl:hover {
		border-color: var(--accent);
		background: var(--surface-panel);
	}
	.dl.primary {
		border-left: 3px solid var(--accent);
	}
	.dl-name {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--accent);
	}
	.dl-desc {
		font-size: 11.5px;
		color: var(--text-secondary);
		line-height: 1.45;
	}
	.dl-meta {
		font-size: 9.5px;
		color: var(--text-faint);
		margin-top: 2px;
	}

	.example {
		margin: 6px 0 18px;
		padding: 14px 16px;
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 11.5px;
		line-height: 1.6;
		color: var(--text-secondary);
		max-width: 900px;
	}

	table.schema {
		border-collapse: collapse;
		font-size: 12px;
		width: 100%;
		max-width: 1100px;
		margin: 6px 0 14px;
	}
	.schema th,
	.schema td {
		text-align: left;
		vertical-align: top;
		padding: 7px 16px 7px 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.schema th {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		font-weight: 400;
	}
	.sname {
		font-weight: 500;
		white-space: nowrap;
	}
	.spurpose {
		color: var(--text-secondary);
		max-width: 34ch;
		line-height: 1.5;
	}
	.sfields {
		font-size: 10.5px;
		color: var(--text-faint);
		line-height: 1.6;
	}

	.queue {
		list-style: none;
		padding: 0;
		margin: 8px 0 14px;
		max-width: 900px;
	}
	.queue li {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 5px 0;
		border-bottom: 1px solid var(--border-subtle);
		font-size: 12.5px;
	}
	.queue .mono {
		color: var(--text-faint);
		white-space: nowrap;
	}
</style>
