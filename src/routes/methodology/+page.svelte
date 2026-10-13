<script lang="ts">
	/**
	 * The methodology page — ARCHIVE REGISTER: one column, reading face, measure.
	 *
	 * Its section headings are authored here rather than in a content file, so each
	 * one carries its own number on SectionHeader — the one section-heading style
	 * the archive uses everywhere.
	 */
	import { BASIS_COLOR, BASIS_ORDER, DASH, ds, type Basis } from '$lib/model';
	import { nameOf, t, basisLabel, basisDesc, indexMeta } from '$lib/t.svelte';
	import { INDEX_KEYS } from '$lib/indices';
	import SectionHeader from '$lib/ui/SectionHeader.svelte';

	/** Derived, not read once: the eyebrow is a string and the locale can change. */
	const EYEBROW = $derived(t('nav.method'));

	const roleWeights = $derived([...ds.roles].sort((a, b) => b.authority - a.authority));
</script>

<svelte:head>
	<title>Method · DeepTunisia</title>
	<meta
		name="description"
		content="How DeepTunisia is built: the four bases of a claim, fuzzy historical dates, the published authority weight table, and what the project refuses to assert."
	/>
</svelte:head>

<div class="page">
	<div class="column">
		<header class="page-head">
			<span class="eyebrow">{t('nav.method')}</span>
			<h1>{t('m.head')}</h1>
			<p class="lede">
				{t('m.lede')}
			</p>
		</header>

		<div class="prose">
			<SectionHeader n={1} eyebrow={EYEBROW} title={t('m.rule')} />
			<p>
				<strong>{t('m.rule.bold')}</strong> {t('m.rule.body')}
			</p>

			<!-- The four bases, legend first: the rest of the page is unreadable
			     without it. The dash pattern per basis is the model's (DASH), the same
			     encoding the graph draws, and the label and description come from the
			     dictionary rather than the English maps. -->
			<ul class="bases" aria-label={t('guide.bases.title')}>
				{#each BASIS_ORDER as b (b)}
					<li class="base" style:--c={BASIS_COLOR[b]}>
						<div class="b-head">
							<svg width="40" height="8" aria-hidden="true">
								<line
									x1="0"
									y1="4"
									x2="40"
									y2="4"
									stroke={BASIS_COLOR[b]}
									stroke-width="2"
									stroke-dasharray={DASH[b]}
								/>
							</svg>
							<strong>{basisLabel(b)}</strong>
							<span class="b-count mono">{ds.meta.basisCounts[b as Basis]} claims</span>
						</div>
						<p>{basisDesc(b)}</p>
					</li>
				{/each}
			</ul>

			<p>
				{t('m.floor')}
			</p>
			<p>
				{t('m.oblig1')} <strong
					>inferred</strong
				> {t('m.oblig2')}
			</p>

			<h3>{t('m.unskept')}</h3>
			<p>
				{t('m.unsbody')}
			</p>

			<SectionHeader n={2} eyebrow={EYEBROW} title={t('m.dates')} />
			<p>
				{t('m.dates1')}
			</p>
			<p>
				{t('m.dates2')}
			</p>
			<p>
				{t('m.assume1')} <code>&lt;=2013</code> {t('m.assume2')}
			</p>

			<SectionHeader n={3} eyebrow={EYEBROW} title={t('m.succ')} />
			<p>
				{t('m.succ1')}
				<strong>{ds.meta.successionGaps.length} gaps</strong> and
				<strong>{ds.meta.successionOverlaps.length} overlapping tenures</strong>{t('m.succ2')}
				<a href="/evidence">{t('m.link.evidence')}</a>{t('m.succ3')}
			</p>

			<SectionHeader n={4} eyebrow={EYEBROW} title={t('m.dis')} />
			<p>
				{t('m.dis1')}
				<strong>{ds.meta.contradictions.length} recorded contradictions</strong>{t('m.dis2')}
			</p>

			<SectionHeader n={5} eyebrow={EYEBROW} title={t('m.noscore')} />
			<p>
				{t('m.noscore1')}
			</p>
			<ul>
				{#each INDEX_KEYS as key (key)}
					<li>
						<strong>{indexMeta(key).label}.</strong>
						{indexMeta(key).blurb}
						{indexMeta(key).derived}
					</li>
				{/each}
			</ul>
			<p>
				{t('m.noscore2')}
			</p>
			<p>
				{t('m.broker')}
			</p>

			<SectionHeader n={6} eyebrow={EYEBROW} title={t('m.layers')} />
			<p>
				{t('m.layers1')}
				<a href="/investigate">{t('m.link.investigate')}</a> {t('m.layers2')}
			</p>
			<p>
				{t('m.foreign')}
			</p>

			<SectionHeader n={7} eyebrow={EYEBROW} title={t('m.struct')} />
			<p>
				{t('m.ng1')} <strong>not</strong> {t('m.ng2')}
			</p>
			<p>
				{t('m.cos1')} <strong>not</strong> {t('m.cos2')}
			</p>

			<SectionHeader n={8} eyebrow={EYEBROW} title={t('m.weights')} />
			<p>
				{t('m.weights1')}
			</p>

			<table class="weights">
				<thead>
					<tr><th class="num">Weight</th><th>{t('tbl.office')}</th><th>{t('tbl.institution')}</th></tr>
				</thead>
				<tbody>
					{#each roleWeights as role (role.id)}
						<tr>
							<td class="num mono">{role.authority}</td>
							<td>{nameOf(role)}</td>
							<td class="inst">{nameOf(ds.institutions.find((i) => i.id === role.institution))}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<SectionHeader n={9} eyebrow={EYEBROW} title={t('m.srcrank')} />
			<p>{t('m.tiers')}</p>
			<ul>
				<li>
					<strong>Tier 1.</strong> {t('m.t1')}
				</li>
				<li><strong>Tier 2.</strong> {t('m.t2')}</li>
				<li><strong>Tier 3.</strong> {t('m.t3')}</li>
				<li><strong>Tier 4.</strong> {t('m.t4')}</li>
				<li>
					<strong>Tier 5.</strong> {t('m.t5')}
				</li>
			</ul>
			<p>
				{t('m.archive')}
			</p>

			<SectionHeader n={10} eyebrow={EYEBROW} title={t('m.pipeline')} />
			<p>
				{t('m.pipeline1')}
				<a href="/about">{t('m.link.about')}</a> {t('m.pipeline2')}
				<strong>{ds.meta.review.reviewed} of {ds.meta.review.reviewable}</strong>{t('m.pipeline3')}
			</p>
			<p>
				{t('m.noai1')} <a href="/investigate">investigate</a> {t('m.noai2')}
			</p>

			<SectionHeader n={11} eyebrow={EYEBROW} title={t('nav.corrections')} />
			<p>
				{t('m.correct1')}
				<a href="/evidence">{t('m.link.openq')}</a> {t('m.correct2')}
				<a href="/data">{t('m.link.data')}</a> {t('m.correct3')}
			</p>

			<SectionHeader n={12} eyebrow={EYEBROW} title={t('m.notwhat')} />
			<p>
				{t('m.notlist')}
			</p>
		</div>
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
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
		font-size: var(--step-1);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	/* ARCHIVE REGISTER, one column. The reading face and the body size are set
	   HERE, with the measure, because the measure is in `ch`: it only comes out as
	   one width across the whole column in the face and at the size the prose is
	   set in. --font-read carries every script on the page: Libron has no Arabic
	   glyphs, so Arabic falls through to the Plex Arabic fallback in the same
	   stack. */
	.column {
		max-width: var(--measure);
		margin-inline: auto;
		padding: 0 var(--s-6) var(--s-12);
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	/* The column owns the measure and the body size, so the long-form block in
	   app.css — which sets its own on `.prose` — is overridden here. */
	.prose {
		max-width: none;
		font-size: inherit;
	}
	.prose p {
		margin: 0 0 var(--s-5);
	}
	.prose ul {
		margin: 0 0 var(--s-5);
		padding-inline-start: var(--s-6);
	}
	.prose li {
		margin-bottom: var(--s-2);
	}
	.prose a {
		color: var(--accent);
	}
	.prose strong {
		color: var(--text-primary);
	}
	.prose code {
		font-family: var(--font-mono);
		background: var(--surface-sunken);
		border-radius: var(--r-xs);
		padding: 1px var(--s-2);
	}

	/* The numbered section head, and the h3 that sits under one. */
	.prose :global(.section-header) {
		margin-top: var(--s-9);
	}
	.prose :global(.section-header:first-child) {
		margin-top: 0;
	}
	.prose h3 {
		margin: var(--s-7) 0 var(--s-3);
		font-family: var(--font-read);
		font-size: var(--step-1);
		font-weight: 500;
		line-height: var(--lh-snug);
		color: var(--text-primary);
	}

	/* The four-basis legend, inside the column. The dash swatch is the model's
	   encoding of the same basis the graph draws, so the legend and the graph can
	   never disagree. Scoped under .prose so the column's own list rules do not
	   reach into the box. */
	.prose .bases {
		list-style: none;
		margin: 0 0 var(--s-7);
		padding: var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-sunken);
		display: grid;
		gap: var(--s-4);
	}
	.prose .base {
		display: block;
	}
	.prose .b-head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-1);
	}
	.prose .b-head strong {
		font-size: var(--step--1);
		font-weight: 500;
		color: var(--c);
	}
	.prose .base p {
		margin: 0;
		font-size: var(--step--1);
		line-height: var(--lh-normal);
		color: var(--text-secondary);
	}
	.prose .b-count {
		margin-inline-start: auto;
		padding-inline-start: var(--s-4);
		font-size: var(--t-2xs);
		line-height: var(--lh-snug);
		text-align: end;
		white-space: nowrap;
		color: var(--text-faint);
	}

	/* Inside the reading column, in the reading face. */
	table.weights {
		border-collapse: collapse;
		font-family: var(--font-read);
		font-size: var(--step--1);
		width: 100%;
		margin: var(--s-5) 0 var(--s-8);
	}
	.weights th,
	.weights td {
		text-align: start;
		padding: var(--s-2) var(--s-4) var(--s-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.weights th {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
		font-weight: 400;
	}
	:global([dir='rtl']) .weights th {
		letter-spacing: 0;
	}
	.weights .num {
		text-align: end;
		width: 62px;
		padding-inline-end: var(--s-4);
	}
	.weights td.num {
		color: var(--accent);
	}
	.weights .inst {
		color: var(--text-faint);
	}
</style>
