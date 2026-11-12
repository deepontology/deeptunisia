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

	const reviewRows = Object.entries(ds.meta.review.flags).map(([key, v]) => ({
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
	<div class="column">
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
					<th>{t('about.review.flag')}</th>
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
			<p>{t('coverage.flagsNote')}</p>
			<p>{t('coverage.examinedNote')}</p>
		</div>

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
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	/* ARCHIVE REGISTER, one column. The reading face and the body size are set
	   HERE, with the measure, because the measure is in `ch`: it only comes out as
	   one width across the whole column in the face and at the size the prose is
	   set in. Head, sections, notes, tables and the status block are all measured
	   against this one box.

	   The running section number lives here too: every h2 on this page is the
	   markdown's, so the count is CSS and follows the document rather than a
	   hand-typed number.

	   --font-read carries every script on the page: Libron has no Arabic glyphs, so
	   Arabic falls through to the Plex Arabic fallback in the same stack. */
	.column {
		max-width: var(--measure);
		margin-inline: auto;
		padding: 0 var(--s-6) var(--s-12);
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
		counter-reset: section;
	}

	.page-head {
		padding: var(--s-9) 0 var(--s-5);
	}
	.page-head .eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* Arabic has no letter case and its script does not track. */
	:global([dir='rtl']) .page-head .eyebrow {
		letter-spacing: 0;
	}
	h1 {
		margin: var(--s-3) 0 var(--s-4);
		font-family: var(--font-read);
		font-size: var(--step-4);
		font-weight: 500;
		line-height: var(--lh-snug);
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	.lede {
		margin: 0;
	}
	.lede :global(.content p) {
		margin: 0;
		font-size: var(--step-1);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	/* The column owns the measure and the body size, so the long-form block in
	   app.css — which sets its own on `.prose` — is overridden here. */
	.prose {
		max-width: none;
		font-size: inherit;
		padding-block: var(--s-2);
	}
	.doc {
		padding-block: var(--s-2) var(--s-5);
	}

	/* Content sets its own body size on its root, so the elements it renders are
	   named here rather than inheriting the column's. --font-read carries every
	   script in the page: Libron has no Arabic glyphs, so Arabic falls through
	   to the Plex Arabic fallback in the same stack. */
	.prose :global(.content p),
	.prose :global(.content ul),
	.prose :global(.content ol),
	.prose :global(.content li),
	.doc :global(.content p),
	.doc :global(.content ul),
	.doc :global(.content ol),
	.doc :global(.content li) {
		font-family: var(--font-read);
		font-size: var(--step-0);
	}
	.prose :global(.content p),
	.doc :global(.content p) {
		margin: 0 0 var(--s-5);
	}
	.prose :global(.content ul),
	.prose :global(.content ol),
	.doc :global(.content ul),
	.doc :global(.content ol) {
		margin: 0 0 var(--s-5);
		padding-inline-start: var(--s-6);
	}
	.prose :global(.content li),
	.doc :global(.content li) {
		margin-bottom: var(--s-2);
	}
	.prose :global(.content a),
	.doc :global(.content a) {
		color: var(--accent);
	}
	.prose :global(.content strong),
	.doc :global(.content strong) {
		color: var(--text-primary);
	}
	/* The page's own list, under the language-coverage section. */
	.prose > ul {
		margin: 0 0 var(--s-5);
		padding-inline-start: var(--s-6);
	}
	.prose > ul li {
		margin-bottom: var(--s-2);
	}

	/* The section eyebrow SectionHeader wears: mono, capped, tracked, number in
	   the accent with a faint slash. The heading text is the markdown's, so the
	   count is CSS and follows the document. */
	.prose :global(.content h2),
	.doc :global(.content h2) {
		counter-increment: section;
		margin: var(--s-9) 0 var(--s-4);
		font-family: var(--font-read);
		font-size: var(--step-2);
		font-weight: 500;
		line-height: var(--lh-snug);
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	.prose :global(.content h2)::before,
	.doc :global(.content h2)::before {
		content: counter(section, decimal-leading-zero) ' /';
		display: block;
		margin-bottom: var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 400;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--accent);
	}
	:global([dir='rtl']) .prose :global(.content h2)::before,
	:global([dir='rtl']) .doc :global(.content h2)::before {
		letter-spacing: 0;
	}
	.prose :global(.content h3),
	.doc :global(.content h3) {
		margin: var(--s-6) 0 var(--s-3);
		font-family: var(--font-read);
		font-size: var(--step-1);
		font-weight: 500;
		line-height: var(--lh-snug);
		color: var(--text-primary);
	}
	.doc p {
		margin: 0 0 var(--s-3);
		font-size: var(--step--1);
		line-height: var(--lh-normal);
		color: var(--text-muted);
	}

	/* The page's tables fill the reading column and carry the reading face. The
	   two "here is the unflattering number" blocks share these proportions so they
	   read as one thing. */
	table.review,
	table.funders {
		border-collapse: collapse;
		font-family: var(--font-read);
		font-size: var(--step--1);
		width: 100%;
		margin: var(--s-4) 0 var(--s-7);
	}
	.review th,
	.review td,
	.funders th,
	.funders td {
		text-align: start;
		padding-block: var(--s-2);
		padding-inline: 0 var(--s-5);
		border-bottom: 1px solid var(--border-subtle);
	}
	.review th,
	.funders th {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
		font-weight: 400;
	}
	:global([dir='rtl']) .review th,
	:global([dir='rtl']) .funders th {
		letter-spacing: 0;
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
		line-height: var(--lh-normal);
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

	.funders tr.none td {
		color: var(--text-secondary);
		line-height: var(--lh-normal);
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
		width: 100%;
		margin: var(--s-5) 0 var(--s-7);
	}
	/* Cells are containers only; the number's own typography lives in <Stat>. */
	.cell {
		background: var(--surface-raised);
		padding: var(--s-5) var(--s-5);
	}
</style>
