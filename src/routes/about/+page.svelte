<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { ds } from '$lib/model';
	import { LOCALES, localeCoverage, format } from '$lib/i18n';
	import { t } from '$lib/t.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Content from '$lib/ui/Content.svelte';

	/** Translation coverage, per locale and per provenance tier. Never summed. */
	const tr = ds.meta.translation;

	const reviewPct = $derived(
		Math.round((ds.meta.review.reviewed / Math.max(1, ds.meta.review.reviewable)) * 100)
	);

	/**
	 * Funding transparency table. Empty by design at this stage, and published empty
	 * rather than omitted: the commitment has to exist before there is money, or it is
	 * not a commitment.
	 */
	const FUNDERS: { donor: string; amount: string; period: string; purpose: string; restrictions: string }[] =
		[];

	/**
	 * Coverage audit. Published because a gap nobody can see is worse than one
	 * everybody can, and because this particular gap runs in a direction that would
	 * otherwise read as a political claim the project never meant to make.
	 */
	const coverage = ds.meta.coverage.principals;
	const maxKin = Math.max(1, ...coverage.map((p) => p.kin));

	const reviewRows = Object.entries(ds.meta.review.byRisk).map(([key, v]) => ({
		key,
		reviewed: v.reviewed,
		total: v.total,
		pct: v.total === 0 ? 0 : Math.round((v.reviewed / v.total) * 100)
	}));
</script>

<svelte:head>
	<title>About · DeepTunisia</title>
	<meta
		name="description"
		content="What DeepTunisia is, how it is governed, who funds it, and how to correct it."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('about.eyebrow')}</span>
		<h1>DeepTunisia</h1>
		<div class="lede"><Content view="about" section="intro" /></div>
	</header>

	<div class="prose">
		<Content view="about" section="not" />
		<Content view="about" section="rule" />
		<Content view="about" section="standard" />
		<Content view="about" section="governance" />
		<Content view="about" section="funding" />
	</div>

	<table class="funders">
		<thead>
			<tr>
				<th>{t('about.funders.donor')}</th>
				<th>{t('about.funders.amount')}</th>
				<th>{t('about.funders.period')}</th>
				<th>{t('about.funders.purpose')}</th>
				<th>{t('about.funders.restrictions')}</th>
			</tr>
		</thead>
		<tbody>
			{#if FUNDERS.length === 0}
				<tr class="none">
					<td colspan="5">{t('about.funding.empty')}</td>
				</tr>
			{:else}
				{#each FUNDERS as f (f.donor)}
					<tr>
						<td>{f.donor}</td><td>{f.amount}</td><td>{f.period}</td><td>{f.purpose}</td><td
							>{f.restrictions}</td
						>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>

	<div class="prose">
		<Content view="about" section="state" />
	</div>

	<div class="status">
		{#each [
			{ v: ds.meta.counts.people, k: 'about.stat.people' },
			{ v: ds.meta.counts.positions, k: 'about.stat.positions' },
			{ v: ds.meta.counts.relationships, k: 'about.stat.relationships' },
			{ v: ds.meta.counts.sourcesCited, k: 'about.stat.sourcesCited' }
		] as s (s.k)}
			<div class="cell"><Stat value={s.v} label={t(s.k)} /></div>
		{/each}
		<!-- The unflattering numbers get the inferred tint, so the page's own
		     shortcomings are colour-coded the same way a weak claim would be. -->
		<div class="cell">
			<Stat
				value={ds.meta.needsPrimarySourceCount}
				label={t('about.stat.needsPrimary')}
				tint="var(--basis-inferred)"
			/>
		</div>
		<div class="cell">
			<Stat
				value={ds.meta.contradictions.length}
				label={t('about.stat.contradictions')}
				tint="var(--basis-inferred)"
			/>
		</div>
		<div class="cell">
			<Stat
				value={reviewPct}
				suffix="%"
				label={format(app.locale, 'about.stat.reviewed', {
					reviewed: ds.meta.review.reviewed,
					reviewable: ds.meta.review.reviewable
				})}
				tint="var(--basis-inferred)"
			/>
		</div>
	</div>

	<div class="prose">
		<Content view="about" section="review-caveat" />
		<Content view="about" section="where-review-went" />
	</div>

	<table class="review">
		<thead>
			<tr>
				<th>{t('about.review.claimtype')}</th>
				<th>{t('about.review.reviewed')}</th>
				<th>{t('about.review.coverage')}</th>
			</tr>
		</thead>
		<tbody>
			{#each reviewRows as r (r.key)}
				<tr class:zero={r.reviewed === 0}>
					<td>{t(`about.risk.${r.key}`)}</td>
					<td class="num">{r.reviewed}/{r.total}</td>
					<td>
						<div
							class="track"
							role="img"
							aria-label={format(app.locale, 'about.review.aria', {
								pct: r.pct,
								reviewed: r.reviewed,
								total: r.total
							})}
						>
							<div class="fill" style="inline-size: {r.pct}%"></div>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="doc">
		<Content view="about" section="languages-honest" />
	</div>

	<table class="review">
		<thead>
			<tr>
				<th>{t('about.translation.prose')}</th>
				<th>{t('about.translation.fr')}</th>
				<th>{t('about.translation.ar')}</th>
			</tr>
		</thead>
		<tbody>
			<tr class:zero={tr.fr.done === 0}>
				<td>{t('about.translation.fieldsTranslated')}</td>
				<td class="num">{tr.fr.done}/{tr.fr.total}</td>
				<td class="num">{tr.ar.done}/{tr.ar.total}</td>
			</tr>
			<tr>
				<td>{t('about.translation.modelOnly')}</td>
				<td class="num">{tr.fr.tiers['model-reviewed']}</td>
				<td class="num">{tr.ar.tiers['model-reviewed']}</td>
			</tr>
			<tr class:zero={tr.fr.tiers.human + tr.ar.tiers.human === 0}>
				<td>{t('about.translation.humanChecked')}</td>
				<td class="num">{tr.fr.tiers.human + tr.fr.tiers['machine-reviewed']}</td>
				<td class="num">{tr.ar.tiers.human + tr.ar.tiers['machine-reviewed']}</td>
			</tr>
		</tbody>
	</table>

	<div class="prose">
		<Content view="about" section="coverage-intro" />
	</div>

	<table class="review coverage">
		<thead>
			<tr>
				<th>{t('about.coverage.president')}</th>
				<th>{t('about.coverage.ties')}</th>
				<th>{t('about.coverage.family')}</th>
				<th>{t('about.coverage.missing')}</th>
			</tr>
		</thead>
		<tbody>
			{#each coverage as p (p.id)}
				<tr class:zero={p.total === 0}>
					<td>{p.name}</td>
					<td class="num">{p.total}</td>
					<td>
						<span class="kinwrap">
							<span class="num kin" class:none={p.kin === 0}>{p.kin}</span>
							<span
								class="track"
								role="img"
								aria-label={format(app.locale, 'about.kin.aria', { kin: p.kin })}
							>
								<span class="fill kinfill" style="inline-size: {(p.kin / maxKin) * 100}%"></span>
							</span>
						</span>
					</td>
					<td class="missing">{p.missing.length ? p.missing.join(', ') : '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="prose">
		<Content view="about" section="coverage-caveat" />
		<Content view="about" section="language-coverage" />
		<ul>
			{#each LOCALES as l (l.id)}
				<li>
					<strong>{l.native}</strong> — {format(app.locale, 'about.language.interface', {
						pct: localeCoverage(l.id)
					})}
					{#if l.id !== 'en'}{t('about.language.proseTranslated')}{/if}
				</li>
			{/each}
		</ul>
		<Content view="about" section="language-note" />
		<Content view="about" section="roadmap" />
		<Content view="about" section="corrections" />
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
		margin-bottom: 6px;
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
		margin: 0;
	}
	.prose :global(h2) {
		font-family: var(--font-serif);
	}

	/* Review coverage per risk bucket. Shares the funders table's proportions so the
	   two "here is the unflattering number" blocks on this page read as one thing. */
	table.review {
		border-collapse: collapse;
		font-size: var(--t-xs);
		width: 100%;
		max-width: 900px;
		margin: 6px 0 22px;
	}
	.review th,
	.review td {
		text-align: start;
		padding-block: 7px;
		padding-inline: 0 var(--s-5);
		border-bottom: 1px solid var(--border-subtle);
	}
	.review th {
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		font-weight: 400;
	}
	.review td.num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text-secondary);
	}
	/* A bucket with no review at all is the finding, not a rounding artefact, so it
	   carries the same tint the page gives every other number that counts against it. */
	.review tr.zero td.num {
		color: var(--basis-inferred);
	}
	.review td:last-child {
		inline-size: 40%;
		padding-inline-end: 0;
	}
	.track {
		block-size: 6px;
		inline-size: 100%;
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.fill {
		block-size: 100%;
		background: var(--basis-documented);
		border-radius: var(--r-full);
	}

	/* Coverage table. A zero here is the finding, so it carries the same tint the
	   page gives every other number that counts against the project. */
	.coverage td.missing {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		line-height: 1.5;
	}
	.coverage tr.zero td {
		color: var(--basis-inferred);
	}
	.kinwrap {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	.kinwrap .track {
		inline-size: 90px;
		flex-shrink: 0;
	}
	.kin.none {
		color: var(--basis-inferred);
	}
	.kinfill {
		background: var(--layer-political);
	}

	table.funders {
		border-collapse: collapse;
		font-size: 12px;
		width: 100%;
		max-width: 900px;
		margin: 6px 0 10px;
	}
	.funders th,
	.funders td {
		text-align: start;
		padding-block: 7px;
		padding-inline: 0 14px;
		border-bottom: 1px solid var(--border-subtle);
	}
	.funders th {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		font-weight: 400;
	}
	.funders tr.none td {
		color: var(--text-secondary);
		line-height: 1.6;
		max-width: 80ch;
		padding-inline-end: 0;
	}

	.status {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 1px;
		background: var(--border-subtle);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		overflow: hidden;
		max-width: 1100px;
		margin: 8px 0 22px;
	}
	/* Cells are containers only; the number's own typography lives in <Stat>. */
	.cell {
		background: var(--surface-raised);
		padding: var(--s-5) var(--s-5);
	}
</style>
