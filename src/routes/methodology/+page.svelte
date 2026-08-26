<script lang="ts">
	import { BASIS_COLOR, BASIS_LABEL, BASIS_ORDER, ds, type Basis } from '$lib/model';
	import { nameOf, t, basisLabel, basisDesc, indexMeta } from '$lib/t.svelte';
	import { INDEX_KEYS } from '$lib/indices';

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
	<header class="page-head">
		<span class="eyebrow">Method</span>
		<h1>{t('m.head')}</h1>
		<p class="lede">
			{t('m.lede')}
		</p>
	</header>

	<div class="prose">
		<h2>{t('m.rule')}</h2>
		<p>
			<strong>{t('m.rule.bold')}</strong> {t('m.rule.body')}
		</p>
	</div>

	<div class="bases">
		{#each BASIS_ORDER as b (b)}
			<div class="base" style:--c={BASIS_COLOR[b]}>
				<div class="b-head">
					<svg width="40" height="8" aria-hidden="true">
						<line
							x1="0"
							y1="4"
							x2="40"
							y2="4"
							stroke={BASIS_COLOR[b]}
							stroke-width="2"
							stroke-dasharray={b === 'documented'
								? ''
								: b === 'reported'
									? '5 3'
									: b === 'inferred'
										? '2 3'
										: '1 3 6 3'}
						/>
					</svg>
					<strong>{BASIS_LABEL[b]}</strong>
				</div>
				<p>{basisDesc(b)}</p>
				<span class="b-count mono">{ds.meta.basisCounts[b as Basis]} claims</span>
			</div>
		{/each}
	</div>

	<div class="prose">
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

		<h2>{t('m.dates')}</h2>
		<p>
			{t('m.dates1')}
		</p>
		<p>
			{t('m.dates2')}
		</p>
		<p>
			{t('m.assume1')} <code>&lt;=2013</code> {t('m.assume2')}
		</p>

		<h2>{t('m.succ')}</h2>
		<p>
			{t('m.succ1')}
			<strong>{ds.meta.successionGaps.length} gaps</strong> and
			<strong>{ds.meta.successionOverlaps.length} overlapping tenures</strong>{t('m.succ2')}
			<a href="/evidence">{t('m.link.evidence')}</a>{t('m.succ3')}
		</p>

		<h2>{t('m.dis')}</h2>
		<p>
			{t('m.dis1')}
			<strong>{ds.meta.contradictions.length} recorded contradictions</strong>{t('m.dis2')}
		</p>

		<h2>{t('m.noscore')}</h2>
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

		<h2>{t('m.layers')}</h2>
		<p>
			{t('m.layers1')}
			<a href="/investigate">{t('m.link.investigate')}</a> {t('m.layers2')}
		</p>
		<p>
			{t('m.foreign')}
		</p>

		<h2>{t('m.struct')}</h2>
		<p>
			{t('m.ng1')} <strong>not</strong> {t('m.ng2')}
		</p>
		<p>
			{t('m.cos1')} <strong>not</strong> {t('m.cos2')}
		</p>

		<h2>{t('m.weights')}</h2>
		<p>
			{t('m.weights1')}
		</p>
	</div>

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

	<div class="prose">
		<h2>{t('m.srcrank')}</h2>
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

		<h2>{t('m.pipeline')}</h2>
		<p>
			{t('m.pipeline1')}
			<a href="/about">{t('m.link.about')}</a> {t('m.pipeline2')}
			<strong>{ds.meta.review.reviewed} of {ds.meta.review.reviewable}</strong>{t('m.pipeline3')}
		</p>
		<p>
			{t('m.noai1')} <a href="/investigate">investigate</a> {t('m.noai2')}
		</p>

		<h2>Corrections</h2>
		<p>
			{t('m.correct1')}
			<a href="/evidence">{t('m.link.openq')}</a> {t('m.correct2')}
			<a href="/data">{t('m.link.data')}</a> {t('m.correct3')}
		</p>

		<h2>{t('m.notwhat')}</h2>
		<p>
			{t('m.notlist')}
		</p>
	</div>
</div>

<style>
	.page {
		flex: 1;
		overflow-y: auto;
		padding: 32px 22px 90px;
	}
	.page-head {
		max-width: 74ch;
		margin-bottom: 10px;
	}
	h1 {
		font-size: 28px;
		margin: 4px 0 12px;
		font-family: var(--font-serif);
	}
	.lede {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.7;
		color: var(--text-secondary);
	}
	.prose :global(h2) {
		font-family: var(--font-serif);
	}

	.bases {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 10px;
		margin: 8px 0 22px;
		max-width: 1200px;
	}
	.base {
		border: 1px solid var(--border-subtle);
		border-top: 2px solid var(--c);
		border-radius: var(--r-md);
		padding: 11px 13px 12px;
		background: var(--surface-raised);
	}
	.b-head {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-bottom: 6px;
	}
	.b-head strong {
		font-size: 13px;
		font-weight: 500;
		color: var(--c);
	}
	.base p {
		margin: 0 0 7px;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--text-secondary);
	}
	.b-count {
		font-size: 9.5px;
		color: var(--text-faint);
	}

	table.weights {
		border-collapse: collapse;
		font-size: 12px;
		margin: 14px 0 4px;
		max-width: 640px;
		width: 100%;
	}
	.weights th,
	.weights td {
		text-align: left;
		padding: 4px 14px 4px 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.weights th {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		font-weight: 400;
	}
	.weights .num {
		text-align: right;
		width: 62px;
		padding-right: 16px;
	}
	.weights td.num {
		color: var(--accent);
	}
	.weights .inst {
		color: var(--text-faint);
		font-size: 11px;
	}
</style>
