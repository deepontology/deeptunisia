<script lang="ts">
	import { app } from '$lib/state.svelte';
	import SourceList from '$lib/components/SourceList.svelte';
	import { entityName, t, nameOf, basisDesc } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import Prose from '$lib/ui/Prose.svelte';
	import { BASIS_COLOR, BASIS_LABEL, BASIS_ORDER, ds, type Basis } from '$lib/model';

	/**
	 * The evidence page. Everything the dataset cannot yet establish is published here
	 * rather than hidden: the hypotheses with honest verdicts and explicit falsifiers,
	 * the open research questions, the disagreements between sources that have NOT been
	 * resolved, and the gaps the build script finds on its own.
	 */

	const SUPPORT_LABEL: Record<string, string> = {
		strong: t('ev.support.strong'),
		moderate: t('ev.support.moderate'),
		insufficient: t('ev.support.insufficient'),
		contradicted: t('ev.support.contradicted')
	};

	let tab = $state<'hypotheses' | 'questions' | 'contradictions' | 'gaps' | 'sources'>('hypotheses');

	const byTier = $derived.by(() => {
		const map = new Map<number, typeof ds.sources>();
		for (const s of ds.sources) {
			const list = map.get(s.tier) ?? [];
			list.push(s);
			map.set(s.tier, list);
		}
		return [...map.entries()].sort((a, b) => a[0] - b[0]);
	});

	const TIER_NAME: Record<number, string> = {
		1: t('sources.tier.1'),
		2: t('sources.tier.2'),
		3: t('sources.tier.3'),
		4: t('sources.tier.4'),
		5: t('sources.tier.5')
	};

	const flaggedPositions = $derived(
		ds.positions.filter((p) => p.verification === 'needs-primary-source')
	);
	const inferred = $derived(ds.positions.filter((p) => p.basis === 'inferred'));
	const unsubstantiated = $derived(ds.relationships.filter((r) => r.basis === 'unsubstantiated'));
	const openQuestions = $derived(ds.questions.filter((q) => q.status !== 'answered'));
	const reviewPct = $derived(
		Math.round((ds.meta.review.reviewed / Math.max(1, ds.meta.review.reviewable)) * 100)
	);
</script>

<svelte:head>
	<title>Evidence · DeepTunisia</title>
	<meta
		name="description"
		content="{t('ev.tab.hyp')} tested against the data, open research questions, unresolved contradictions between sources, and the full source list."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('ev.eyebrow')}</span>
		<h1>{t('ev.title')}</h1>
		<p class="lede">
			{t('ev.lede1')} <em>not</em> {t('ev.lede2')}
		</p>

		<div class="basis-bar">
			{#each BASIS_ORDER as b (b)}
				{@const n = ds.meta.basisCounts[b]}
				<div class="bb" style:--c={BASIS_COLOR[b]} style:flex={Math.max(1, n)} style:min-width={n < 25 ? '54px' : '0'}>
					<span class="bb-n mono">{n}</span>
					<span class="bb-l">{BASIS_LABEL[b]}</span>
				</div>
			{/each}
		</div>
		<p class="basis-note">
			{t('ev.shape1')} <em>fails</em> {t('ev.shape2')}
		</p>

		<div class="counts mono">
			<!-- Cited, not defined. This strip states what holds the graph up, and a source
			     backing no claim holds nothing up. The {t('ev.tab.sources')} tab counts the full catalogue. -->
			<span>{ds.meta.counts.sourcesCited} {t('ev.counts.cited')}</span>
			<span class="flag">{ds.meta.needsPrimarySourceCount} {t('ev.counts.needsPrimary')}</span>
			<span class="flag">{ds.meta.contradictions.length} {t('ev.counts.contradictions')}</span>
			<span
				>{format(app.locale, 'ev.counts.humanReviewed', {
					reviewed: ds.meta.review.reviewed,
					reviewable: ds.meta.review.reviewable,
					pct: reviewPct
				})}</span
			>
		</div>
	</header>

	<nav class="tabs" aria-label={t('ev.tabAria')}>
		<button class:on={tab === 'hypotheses'} onclick={() => (tab = 'hypotheses')}>Hypotheses</button>
		<button class:on={tab === 'questions'} onclick={() => (tab = 'questions')}
			>{t('ev.tab.openq')} <span class="n">{openQuestions.length}</span></button
		>
		<button class:on={tab === 'contradictions'} onclick={() => (tab = 'contradictions')}
			>{t('ev.tab.contra')} <span class="n">{ds.meta.contradictions.length}</span></button
		>
		<button class:on={tab === 'gaps'} onclick={() => (tab = 'gaps')}
			>{t('ev.tab.gaps')} <span class="n">{ds.meta.successionGaps.length + inferred.length}</span
			></button
		>
		<button class:on={tab === 'sources'} onclick={() => (tab = 'sources')}
			>Sources <span class="n">{ds.meta.counts.sources}</span></button
		>
	</nav>

	{#if tab === 'hypotheses'}
		<section class="hyps">
			{#each ds.hypotheses as h (h.id)}
				<article class="hyp s-{h.support}">
					<header>
						<span class="h-label mono">{h.label}</span>
						<span class="verdict">{SUPPORT_LABEL[h.support]}</span>
					</header>
					<p class="statement"><Prose record={h} field="statement" block /></p>
					<p class="reasoning"><Prose record={h} field="reasoning" block /></p>
					<div class="falsifier">
						<span class="eyebrow">{t('ev.overturn')}</span>
						<p><Prose record={h} field="falsifiable_by" block /></p>
					</div>
					{#if h.sources.length}
						<div class="h-sources"><SourceList ids={h.sources} compact /></div>
					{/if}
				</article>
			{/each}
		</section>
	{:else if tab === 'questions'}
		<section class="qs">
			<p class="section-note">
				{t('ev.openq')}
			</p>
			{#each ['verification', 'analytical'] as kind (kind)}
				<h2>{kind === 'verification' ? t('ev.q.verification') : t('ev.q.analytical')}</h2>
				<ul>
					{#each openQuestions.filter((q) => q.kind === kind) as q (q.id)}
						<li>
							<div class="q-head">
								<span class="q-status s-{q.status}">{q.status}</span>
								<p class="q-text"><Prose record={q} field="question" block /></p>
							</div>
							{#if q.notes}<p class="q-note">{q.notes}</p>{/if}
							{#if q.relates_to.length}
								<div class="q-rel">
									{#each q.relates_to as r (r)}
										<button onclick={() => (app.selected = r)}>{entityName(r)}</button>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{:else if tab === 'contradictions'}
		<section class="contras">
			<p class="section-note">
				{t('ev.contra')}
			</p>
			{#if ds.meta.contradictions.length === 0}
				<p class="empty">{t('ev.nocontra')}</p>
			{:else}
				{#each ds.meta.contradictions as c (c.id)}
					<article class="contra">
						<header>
							<span class="tag">{c.kind}</span>
							<strong>{c.subject}</strong>
						</header>
						<p class="adopted"><span class="eyebrow">{t('tbl.adopted')}</span> {c.adopted}</p>
						<ul>
							{#each c.disputes as d (d.claim)}
								<li>
									<p class="d-claim">&ldquo;{d.claim}&rdquo;</p>
									<p class="d-held">— {d.held_by}</p>
									{#if d.assessment}<p class="d-assess">{d.assessment}</p>{/if}
									{#if d.source}<SourceList ids={[d.source]} compact />{/if}
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			{/if}
		</section>
	{:else if tab === 'gaps'}
		<section class="gaps">
			<p class="section-note">
				{t('ev.auto')}
			</p>

			<h2>{t('ev.gaps')} <span class="n">{ds.meta.successionGaps.length}</span></h2>
			<p class="sub">
				{t('ev.gapsdesc')}
			</p>
			<table>
				<thead>
					<tr><th>Post</th><th>After</th><th>Before</th><th class="num">Gap</th></tr>
				</thead>
				<tbody>
					{#each ds.meta.successionGaps as g (g.role + g.after + g.before)}
						<tr>
							<td>{ds.roles.find((r) => r.id === g.role)?.title_en ?? g.role}</td>
							<td><button onclick={() => (app.selected = g.after)}>{entityName(g.after)}</button></td>
							<td><button onclick={() => (app.selected = g.before)}>{entityName(g.before)}</button></td>
							<td class="num mono">{g.gapYears}y</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if ds.meta.successionOverlaps.length}
				<h2>{t('ev.overlaptitle')} <span class="n">{ds.meta.successionOverlaps.length}</span></h2>
				<p class="sub">
					{t('ev.overlaps')}
				</p>
				<table>
					<thead>
						<tr><th>Post</th><th>{t('tbl.holder')}</th><th>Holder</th><th class="num">Overlap</th></tr>
					</thead>
					<tbody>
						{#each ds.meta.successionOverlaps as o (o.role + o.a + o.b)}
							<tr>
								<td>{ds.roles.find((r) => r.id === o.role)?.title_en ?? o.role}</td>
								<td><button onclick={() => (app.selected = o.a)}>{entityName(o.a)}</button></td>
								<td><button onclick={() => (app.selected = o.b)}>{entityName(o.b)}</button></td>
								<td class="num mono">{o.overlapYears}y</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			<h2>{t('ev.inftitle')} <span class="n">{inferred.length}</span></h2>
			<p class="sub">
				{t('ev.infdesc')}
			</p>
			<ul class="inf">
				{#each inferred as p (p.id)}
					<li>
						<div class="inf-head">
							<button onclick={() => (app.selected = p.holder)}>{entityName(p.holder)}</button>
							<span class="f-role">{p.roleTitle}</span>
							<span class="mono f-raw">{p.interval.raw.start ?? '?'} → {p.interval.raw.end ?? '?'}</span>
						</div>
						{#if p.reasoning}<p class="inf-why">{p.reasoning}</p>{/if}
						{#if p.falsifiable_by}
							<p class="inf-fals"><span class="eyebrow">{t('panel.falsifier')}</span> <Prose record={p} field="falsifiable_by" /></p>
						{/if}
					</li>
				{/each}
			</ul>

			<h2>{t('ev.unstitle')} <span class="n">{unsubstantiated.length}</span></h2>
			<p class="sub">
				{t('ev.unsdesc')}
			</p>
			<ul class="uns">
				{#each unsubstantiated as r (r.id)}
					<li>
						<div class="uns-head">
							<span class="chip c-D">UNS</span>
							<strong>{entityName(r.from)} → {entityName(r.to)}</strong>
						</div>
						<p class="uns-attrib">{r.attributed_to}</p>
						<p class="uns-desc">{r.description}</p>
						<SourceList ids={r.sources} compact />
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<section class="srcs">
			<div class="grades">
				{#each BASIS_ORDER as b (b)}
					<div class="grade" style:--c={BASIS_COLOR[b]}>
						<span class="gdot"></span>
						<strong>{BASIS_LABEL[b]}</strong>
						<p>{basisDesc(b)}</p>
					</div>
				{/each}
			</div>
			{#each byTier as [tier, list] (tier)}
				<h2>{TIER_NAME[tier]} <span class="n">{list.length}</span></h2>
				<SourceList ids={list.map((s) => s.id)} />
			{/each}
		</section>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		overflow-y: auto;
		padding: 32px 22px 80px;
	}
	.page-head {
		max-width: 82ch;
	}
	h1 {
		font-size: 27px;
		margin: 4px 0 10px;
		font-family: var(--font-serif);
	}
	.lede {
		margin: 0;
		font-size: 15px;
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.basis-bar {
		display: flex;
		gap: 2px;
		margin: 20px 0 8px;
		height: 46px;
	}
	.bb {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1px;
		padding: 0 10px;
		border-radius: var(--r-sm);
		background: color-mix(in srgb, var(--c) 16%, transparent);
		/* The basis colour bar marks the reading start of each segment; a physical
		   left border put it at the visual end in Arabic. */
		border-inline-start: 3px solid var(--c);
		min-width: 0;
		overflow: hidden;
	}
	.bb-n {
		font-size: 14px;
		font-weight: 500;
		color: var(--c);
	}
	.bb-l {
		font-size: 10px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.basis-note {
		margin: 0;
		font-size: 12px;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.counts {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		margin-top: 14px;
		font-size: 10.5px;
		color: var(--text-faint);
	}
	.counts .flag {
		color: var(--basis-inferred);
	}

	.tabs {
		display: flex;
		gap: 2px;
		margin: 26px 0 22px;
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}
	.tabs button {
		font-size: 12.5px;
		padding: 7px 12px;
		color: var(--text-secondary);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs button.on {
		color: var(--text-primary);
		border-bottom-color: var(--accent);
	}
	.n {
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--text-faint);
		margin-left: 3px;
	}

	.section-note {
		max-width: 84ch;
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--text-secondary);
		padding: 10px 13px;
		border-left: 2px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, transparent);
		margin: 0 0 24px;
	}

	h2 {
		font-size: 15px;
		margin: 30px 0 8px;
		display: flex;
		align-items: baseline;
		gap: 7px;
	}
	.sub {
		margin: 0 0 12px;
		font-size: 12px;
		color: var(--text-secondary);
		max-width: 84ch;
		line-height: 1.55;
	}
	.empty {
		font-size: 13px;
		color: var(--text-secondary);
	}

	/* --- Hypotheses --- */
	.hyps {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
		gap: 14px;
		max-width: 1300px;
	}
	.hyp {
		border: 1px solid var(--border-subtle);
		border-left-width: 3px;
		border-radius: var(--r-md);
		padding: 14px 16px 16px;
		background: var(--surface-raised);
	}
	.hyp.s-strong {
		border-left-color: var(--basis-documented);
	}
	.hyp.s-moderate {
		border-left-color: var(--basis-reported);
	}
	.hyp.s-insufficient {
		border-left-color: var(--basis-inferred);
	}
	.hyp.s-contradicted {
		border-left-color: var(--basis-unsubstantiated);
	}
	.hyp header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}
	.h-label {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.verdict {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}
	.s-strong .verdict {
		color: var(--basis-documented);
	}
	.s-moderate .verdict {
		color: var(--basis-reported);
	}
	.s-insufficient .verdict {
		color: var(--basis-inferred);
	}
	.s-contradicted .verdict {
		color: var(--basis-unsubstantiated);
	}
	.statement {
		margin: 0 0 9px;
		font-size: 14px;
		line-height: 1.5;
		font-family: var(--font-serif);
	}
	.reasoning {
		margin: 0 0 10px;
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.falsifier {
		border-left: 2px solid var(--border-default);
		padding: 4px 0 4px 10px;
		margin-bottom: 12px;
	}
	.falsifier p {
		margin: 2px 0 0;
		font-size: 12px;
		line-height: 1.55;
		color: var(--text-secondary);
	}
	.h-sources {
		border-top: 1px solid var(--border-subtle);
		padding-top: 10px;
	}

	/* --- Questions --- */
	.qs ul {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 96ch;
	}
	.qs li {
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		padding: 11px 13px;
		background: var(--surface-raised);
	}
	.q-head {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.q-status {
		font-family: var(--font-mono);
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		padding: 2px 5px;
		border-radius: var(--r-sm);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
		flex-shrink: 0;
		margin-top: 2px;
	}
	.q-status.s-open {
		color: var(--basis-inferred);
		border-color: color-mix(in oklch, var(--basis-inferred) 40%, transparent);
	}
	.q-status.s-partial {
		color: var(--basis-reported);
		border-color: color-mix(in oklch, var(--basis-reported) 40%, transparent);
	}
	.q-text {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.5;
	}
	.q-note {
		margin: 8px 0 0 62px;
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.55;
	}
	.q-rel {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 9px 0 0 62px;
	}
	.q-rel button {
		font-size: 10.5px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-sm);
		padding: 1px 6px;
		color: var(--text-secondary);
	}
	.q-rel button:hover {
		color: var(--text-primary);
		border-color: var(--border-default);
	}

	/* --- Contradictions --- */
	.contra {
		border: 1px solid var(--border-subtle);
		border-left: 3px solid var(--basis-inferred);
		border-radius: var(--r-md);
		padding: 13px 15px;
		background: var(--surface-raised);
		margin-bottom: 14px;
		max-width: 96ch;
	}
	.contra header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 7px;
	}
	.contra strong {
		font-weight: 500;
		font-size: 13.5px;
	}
	.adopted {
		margin: 0 0 10px;
		font-size: 12.5px;
		color: var(--text-primary);
	}
	.adopted .eyebrow {
		margin-right: 6px;
	}
	.contra ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.contra li {
		padding-left: 12px;
		border-left: 1px solid var(--border-default);
	}
	.d-claim {
		margin: 0;
		font-size: 12.5px;
		font-family: var(--font-serif);
	}
	.d-held {
		margin: 2px 0 0;
		font-size: 11px;
		color: var(--basis-inferred);
		font-family: var(--font-mono);
	}
	.d-assess {
		margin: 5px 0 6px;
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	/* --- Gaps --- */
	table {
		border-collapse: collapse;
		font-size: 12px;
		max-width: 860px;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 5px 12px 5px 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	th {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		font-weight: 400;
	}
	td.num,
	th.num {
		text-align: right;
		padding-right: 0;
	}
	td button {
		text-decoration: underline;
		text-decoration-color: var(--border-default);
	}
	td button:hover {
		text-decoration-color: var(--accent);
	}

	ul.inf,
	ul.uns {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 96ch;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	ul.inf li,
	ul.uns li {
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		padding: 10px 12px;
		background: var(--surface-raised);
	}
	.inf-head,
	.uns-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
	}
	.inf-head button {
		font-weight: 500;
		font-size: 12.5px;
		text-decoration: underline;
		text-decoration-color: var(--border-default);
	}
	.f-role {
		color: var(--text-secondary);
		font-size: 12px;
	}
	.f-raw {
		font-size: 10.5px;
		color: var(--basis-inferred);
	}
	.inf-why {
		margin: 6px 0 0;
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--text-secondary);
	}
	.inf-fals {
		margin: 6px 0 0;
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--text-secondary);
		padding-left: 10px;
		border-left: 2px solid var(--border-default);
	}
	.inf-fals .eyebrow {
		margin-right: 5px;
	}
	.uns-head strong {
		font-weight: 500;
		font-size: 12.5px;
	}
	.uns-attrib {
		margin: 5px 0 0;
		font-size: 10.5px;
		font-family: var(--font-mono);
		color: var(--basis-unsubstantiated);
	}
	.uns-desc {
		margin: 5px 0 7px;
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	/* --- Sources --- */
	.grades {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px;
		max-width: 1200px;
		margin-bottom: 10px;
	}
	.grade {
		border: 1px solid var(--border-subtle);
		border-top: 2px solid var(--c);
		border-radius: var(--r-md);
		padding: 10px 12px;
		background: var(--surface-raised);
	}
	.gdot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--c);
	}
	.grade strong {
		display: block;
		font-size: 12.5px;
		font-weight: 500;
		margin: 5px 0 3px;
	}
	.grade p {
		margin: 0;
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-secondary);
	}
</style>
