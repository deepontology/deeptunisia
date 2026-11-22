<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, tf } from '$lib/t.svelte';
	import { dateFormatter } from '$lib/i18n';
	import { content, type ContentBlock, type ContentInline } from '$lib/content';
	import Ruler from '$lib/index-study/Ruler.svelte';
	import Plate from '$lib/index-study/Plate.svelte';
	import Barcode from '$lib/index-study/Barcode.svelte';
	import { onMount } from 'svelte';
	import Count from './Count.svelte';
	import FloorDemo from './FloorDemo.svelte';
	import GateDemo from './GateDemo.svelte';

	/**
	 * An introduction to the whole project, written to be sent as a link.
	 *
	 * One long document in the study pages' register: a numbered record with a
	 * section bar and a measuring rule, always in Eclipse whatever the reader's
	 * theme, because the page is designed as one look and is read cold from a
	 * shared link. The Eclipse values are pinned on .frame below: the dark
	 * semantic layer lives on :root, so a data-theme attribute on a subtree
	 * cannot bring it back inside a light page.
	 *
	 * The words live in src/content/introduction.{en,fr,ar}.md, with their
	 * translation tier in the frontmatter, and the short labels in the
	 * dictionary. This file only lays them out. Every figure comes from the
	 * build (+page.server.ts), so the page is as current as the record it
	 * describes; the content files hold `{placeholders}`, never numbers.
	 */
	let { data } = $props();

	const doc = $derived(content('introduction', app.locale));
	const nf = $derived(new Intl.NumberFormat(app.locale, { numberingSystem: 'latn' }));
	const n = (v: number) => nf.format(v);

	const params = $derived<Record<string, string>>({
		floor: data.floorYear,
		years: n(Number(data.cutoffYear) - Number(data.floorYear)),
		hypotheses: n(data.hypotheses),
		failing: n(data.hypothesesFailing),
		reviewable: n(data.reviewable),
		checkedByPerson: n(data.checkedByPerson),
		passedByAgent: n(data.passedByAgent),
		unstated: n(data.unstated),
		independent: n(data.independent),
		questions: n(data.questions),
		contradictions: n(data.contradictions),
		gaps: n(data.successionGaps),
		primary: n(data.needsPrimarySource)
	});
	const fill = (v: string) => v.replace(/\{([A-Za-z]+)\}/g, (m, k: string) => params[k] ?? m);

	// ---- reading the content tree ------------------------------------------
	const sec = (id: string): ContentBlock[] => doc.section(id);
	/** The heading that opens a section, as inline nodes. */
	const head = (id: string): ContentInline[] => {
		const b = sec(id)[0];
		return b && (b.t === 'h2' || b.t === 'h3') ? b.v : [];
	};
	/** The paragraphs of a section, without its anchor. */
	const paras = (id: string): ContentInline[][] =>
		sec(id).flatMap((b) => (b.t === 'p' && b.v.length ? [b.v] : []));
	/** The items of a section's first list. */
	const list = (id: string): ContentInline[][] => {
		const b = sec(id).find((x) => x.t === 'ul' || x.t === 'ol');
		return b && (b.t === 'ul' || b.t === 'ol') ? b.items : [];
	};
	/** A list item written `**Name** words`: the bold lead and the rest. */
	const split = (item: ContentInline[]): { lead: ContentInline[]; rest: ContentInline[] } => {
		const first = item[0];
		if (!first || first.t !== 'strong') return { lead: [], rest: item };
		const rest = item.slice(1);
		if (rest[0]?.t === 'text') rest[0] = { t: 'text', v: rest[0].v.replace(/^\s+/, '') };
		return { lead: first.v, rest };
	};

	const hypId = $derived(data.hypothesesFailing === 0 ? 'hyp-none' : data.deepStateFails ? 'hyp-deep' : 'hyp-some');
	const reviewId = $derived(data.independent === 0 ? 'review-none' : 'review-some');
	const sinceLabel = $derived(
		data.psiSince
			? dateFormatter(app.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${data.psiSince}T00:00:00Z`))
			: ''
	);

	// ---- sections, for the bar and the rule ---------------------------------
	const SECTION_IDS = ['philosophy', 'structure', 'engine', 'atlas', 'research', 'agora', 'privacy', 'last', 'contributing', 'now'];
	const sections = $derived(
		SECTION_IDS.map((id, i) => ({ id, num: String(i + 1).padStart(2, '0'), label: t(`intro.sec.${id}`) }))
	);
	let scrollEl = $state<HTMLElement | null>(null);
	let currentId = $state('');
	const current = $derived(sections.find((s) => s.id === currentId));

	$effect(() => {
		const el = scrollEl;
		if (!el) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			const line = el.getBoundingClientRect().top + el.clientHeight * 0.33;
			let id = '';
			for (const s of SECTION_IDS) {
				const node = el.querySelector<HTMLElement>(`#${s}`);
				if (node && node.getBoundingClientRect().top <= line) id = s;
			}
			currentId = id;
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		update();
		return () => {
			cancelAnimationFrame(frame);
			el.removeEventListener('scroll', onScroll);
		};
	});

	/**
	 * Sections rise into place as they reach the reader. Only once the page
	 * has hydrated (`live`): the prerendered page and a reader without
	 * JavaScript see everything at once, and reduced motion turns it off in CSS.
	 */
	let live = $state(false);
	onMount(() => {
		live = true;
	});
	function reveal(node: HTMLElement) {
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						node.classList.add('seen');
						io.disconnect();
					}
				}
			},
			{ rootMargin: '0px 0px -12% 0px' }
		);
		io.observe(node);
		return { destroy: () => io.disconnect() };
	}

	const OG_URL = 'https://deeptunisia.org/introduction';
	const OG_IMAGE = 'https://deeptunisia.org/og/introduction.png';

	/** One square per person in the record. */
	const COLS = 62;
	const squares = $derived(Array.from({ length: data.people }, (_, i) => ({ x: (i % COLS) * 10, y: Math.floor(i / COLS) * 10 })));
	const gridH = $derived(Math.ceil(data.people / COLS) * 10);

	const KINDS = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	const TREE_KICKERS = ['intro.node.parent', 'intro.node.engine', 'intro.node.apm', 'intro.node.deploy', 'intro.node.next'];
	const STAGES = $derived([
		data.psiOpen ? { cls: 'live', key: 'intro.stage.open' } : { cls: '', key: 'intro.stage.closed' },
		{ cls: 'soon', key: 'intro.stage.ready' },
		{ cls: '', key: 'intro.stage.review' },
		{ cls: '', key: 'intro.stage.designed' },
		{ cls: 'faint', key: 'intro.stage.planned' }
	]);
	const STATUS_KEYS = ['intro.now.built', 'intro.now.designed', 'intro.now.imagined'];
</script>

{#snippet inl(nodes: ContentInline[], dimEm = false)}
	{#each nodes as x, i (i)}
		{#if x.t === 'strong'}
			<strong>{@render inl(x.v, dimEm)}</strong>
		{:else if x.t === 'em'}
			{#if dimEm}<span class="dim">{@render inl(x.v)}</span>{:else}<em>{@render inl(x.v)}</em>{/if}
		{:else if x.t === 'code'}
			<code>{x.v}</code>
		{:else if x.t === 'link'}
			<a href={x.href}>{fill(x.label)}</a>
		{:else}
			{fill(x.v)}
		{/if}
	{/each}
{/snippet}

{#snippet ps(id: string, cls = '')}
	{#each paras(id) as p, i (i)}<p class={cls}>{@render inl(p)}</p>{/each}
{/snippet}

{#snippet node(item: ContentInline[], kicker = '', kcls = '', ncls = '')}
	{@const s = split(item)}
	<div class="node {ncls}">
		{#if kicker}<p class="node-k mono {kcls}">{kicker}</p>{/if}
		<p class="node-name">{@render inl(s.lead)}</p>
		<p class="node-sub">{@render inl(s.rest)}</p>
	</div>
{/snippet}

{#snippet labelled(id: string, cls = 'small')}
	<p class="node-k mono">{@render inl(head(id))}</p>
	{@render ps(id, cls)}
{/snippet}

<svelte:head>
	<title>{t('intro.meta.title')} · DeepTunisia</title>
	<meta name="description" content={t('intro.meta.description')} />
	<!-- This page writes its own preview (the layout stands down for it), so a
	     shared link says what it is. -->
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="DeepTunisia" />
	<meta property="og:title" content={`DeepTunisia · ${t('intro.meta.title')}`} />
	<meta property="og:description" content={t('intro.meta.description')} />
	<meta property="og:url" content={OG_URL} />
	<meta property="og:image" content={OG_IMAGE} />
	<meta property="og:image:alt" content={t('intro.og.alt')} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={`DeepTunisia · ${t('intro.meta.title')}`} />
	<meta name="twitter:description" content={t('intro.meta.description')} />
	<meta name="twitter:image" content={OG_IMAGE} />
	<meta name="twitter:image:alt" content={t('intro.og.alt')} />
</svelte:head>

<div class="frame research-type" class:live>
<div class="scroll" bind:this={scrollEl}>
	<div class="secbar mono">
		<span class="secbar-now">
			{#if current}<span class="sec-num">{current.num}</span><span class="sec-slash">/</span>{current.label}{:else}<span class="sec-num">00</span><span class="sec-slash">/</span>{t('intro.sec.start')}{/if}
		</span>
		<span class="secbar-id">{t('intro.secbar')}</span>
	</div>

	<article class="intro">
		<!-- 00 · cover -->
		<header class="cover">
			<h1>{@render inl(head('cover-title'))}</h1>
			{@render ps('cover-title', 'sub')}
			<p class="chips"><span class="chip live">{t('intro.chip.openSource')}</span><span class="chip">{t('intro.chip.code')}</span><span class="chip">{t('intro.chip.data')}</span></p>
			<figure class="squares">
				<svg viewBox="0 0 {COLS * 10 - 3.6} {gridH - 3.6}" aria-hidden="true">
					{#each squares as q, i (i)}<rect x={q.x} y={q.y} width="6.4" height="6.4" />{/each}
				</svg>
				<figcaption class="mono"><span>{tf('intro.cover.caption', { n: n(data.people) })}</span><span dir="ltr">{data.floorYear} → {data.cutoffYear}</span></figcaption>
			</figure>
			<p class="cue mono" aria-hidden="true">↓</p>
		</header>

		<!-- in one page -->
		<section class="block" aria-labelledby="h-one" use:reveal>
			<p class="kick mono">{t('intro.one.kicker')}</p>
			<h2 id="h-one" class="big">{@render inl(head('one-title'), true)}</h2>
			{@render ps('one-lead', 'lead')}
			<div class="cols">
				<div>{@render ps('one-a')}</div>
				<div>{@render ps('one-b')}</div>
			</div>
			<dl class="stats">
				<div><dt>{t('intro.stat.people')}</dt><dd><Count value={data.people} format={n} /></dd></div>
				<div><dt>{t('intro.stat.institutions')}</dt><dd><Count value={data.institutions} format={n} /></dd></div>
				<div><dt>{t('intro.stat.positions')}</dt><dd><Count value={data.positions} format={n} /></dd></div>
				<div><dt>{t('intro.stat.relationships')}</dt><dd><Count value={data.relationships} format={n} /></dd></div>
				<div><dt>{t('intro.stat.sources')}</dt><dd><Count value={data.sources} format={n} /></dd></div>
				<div><dt>{tf('intro.stat.eras', { n: n(data.eras) })}</dt><dd dir="ltr">{data.floorYear} → {data.cutoffYear}</dd></div>
			</dl>
			<p class="note mono">{t('intro.counted')}</p>
		</section>

		<!-- 01 · philosophy -->
		<section id="philosophy" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">01</span><span class="sec-slash">/</span>{t('intro.sec.philosophy')}</p>
			<h2 class="big">{@render inl(head('phil-title'), true)}</h2>
			{@render ps('phil-lead', 'lead')}
			{@render ps('phil-body')}
			<div class="boxes two">
				{#each list('ideas') as item, i (i)}
					{@const s = split(item)}
					<div class="box"><p class="box-n mono">{['I', 'II', 'III', 'IV'][i] ?? ''}</p><h3>{@render inl(s.lead)}</h3><p>{@render inl(s.rest)}</p></div>
				{/each}
			</div>
			{@render ps('phil-motto', 'motto')}

			<h2 class="mid">{@render inl(head('hold-title'))}</h2>
			{@render ps('hold-title')}
			<ol class="numbered">
				{#each list('hold') as item, i (i)}
					{@const s = split(item)}
					<li>
						<h3>{@render inl(s.lead)}</h3>
						{#if s.rest.length}<p>{@render inl(s.rest)}</p>{/if}
						{#if i === 1}{@render ps(hypId)}{/if}
						{#if i === 4}{@render ps(reviewId)}{/if}
					</li>
				{/each}
			</ol>
		</section>

		<!-- 02 · structure -->
		<section id="structure" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">02</span><span class="sec-slash">/</span>{t('intro.sec.structure')}</p>
			<h2 class="big">{@render inl(head('struct-title'), true)}</h2>
			{#if list('tree').length >= 9}
				{@const tr = list('tree')}
				<div class="tree" role="group" aria-label={t('intro.sec.structure')}>
					{@render node(tr[0], t(TREE_KICKERS[0]))}
					<p class="down" aria-hidden="true">↓</p>
					<div class="tier">
						{@render node(tr[1], t(TREE_KICKERS[1]), '', 'strong')}
						{@render node(tr[2], t(TREE_KICKERS[2]), '', 'ghost')}
					</div>
					<p class="down" aria-hidden="true">↓</p>
					<div class="tier">
						{@render node(tr[3], t(TREE_KICKERS[3]), 'live-t')}
						{@render node(tr[4], t(TREE_KICKERS[4]), '', 'ghost')}
					</div>
					<p class="down" aria-hidden="true">↓</p>
					<div class="doors">
						{@render node(tr[5], t('intro.state.live'), 'live-t')}
						{@render node(tr[6], t('intro.state.live'), 'live-t')}
						{@render node(tr[7], t('intro.state.live'), 'live-t')}
						{@render node(tr[8], t('intro.state.soon'), 'soon-t')}
					</div>
				</div>
			{/if}
			<div class="cols">
				<div>{@render ps('struct-a')}</div>
				<div>{@render ps('struct-b')}</div>
			</div>
		</section>

		<!-- 03 · engine -->
		<section id="engine" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">03</span><span class="sec-slash">/</span>{t('intro.sec.engine')}</p>
			<h2 class="big">{@render inl(head('eng-title'), true)}</h2>
			{@render ps('eng-lead', 'lead')}
			{@render ps('eng-body')}
			<div class="gate">
				<div class="gate-box">
					<p class="node-k mono">{@render inl(head('refuse'))}</p>
					<ul class="refuse">
						{#each list('refuse') as item, i (i)}<li>{@render inl(item)}</li>{/each}
					</ul>
				</div>
				<div class="gate-out">
					{#each list('outcomes') as item, i (i)}
						{@const s = split(item)}
						<p class="out {i === 0 ? 'ok' : 'no'}"><span class="mono">{@render inl(s.lead)}</span>{@render inl(s.rest)}</p>
					{/each}
				</div>
			</div>
			<div class="dashed">{@render labelled('boundary', '')}</div>
			<GateDemo />

			<h2 class="mid">{@render inl(head('env-title'))}</h2>
			<div class="cols wide-left">
				<div>
					{@render ps('env-title')}
					<table class="t">
						<thead><tr><th>{t('intro.th.field')}</th><th>{t('intro.th.plain')}</th></tr></thead>
						<tbody>
							{#each list('fields') as item, i (i)}
								{@const s = split(item)}
								<tr><td>{@render inl(s.lead)}</td><td>{@render inl(s.rest)}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div>
					<p class="node-k mono">{@render inl(head('kinds'))}</p>
					<ul class="kinds">
						{#each list('kinds') as item, i (i)}
							{@const s = split(item)}
							<li><span class="line {KINDS[i]}"></span><span><strong>{@render inl(s.lead)}</strong>{@render inl(s.rest)}</span></li>
						{/each}
					</ul>
					{@render ps('kinds', 'small dimp')}
					<p class="node-k mono">{@render inl(head('ranges'))}</p>
					<div class="range" aria-hidden="true"><span class="hatch"></span><span class="core"></span><span class="hatch"></span></div>
					<p class="range-l mono">{#each list('ranges') as item, i (i)}<span>{@render inl(item)}</span>{/each}</p>
					{@render ps('ranges', 'small dimp')}
				</div>
			</div>
			<FloorDemo basis={data.basis} />
			<div class="three">
				<div>{@render labelled('attacked')}</div>
				<div>
					{@render labelled('repro')}
					{#if data.datasetHash}<Barcode hash={data.datasetHash} /><p class="hash mono">{data.datasetHash.slice(0, 16)}…</p>{/if}
				</div>
				<div>{@render labelled('portable')}</div>
			</div>
		</section>

		<!-- 04 · atlas -->
		<section id="atlas" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">04</span><span class="sec-slash">/</span>{t('intro.sec.atlas')}</p>
			<h2 class="big">{@render inl(head('atlas-title'), true)}</h2>
			{@render ps('atlas-lead', 'lead')}
			<table class="t views">
				<thead><tr><th>{t('intro.th.view')}</th><th>{t('intro.th.answers')}</th></tr></thead>
				<tbody>
					{#each list('views') as item, i (i)}
						{@const s = split(item)}
						<tr><td>{@render inl(s.lead)}</td><td>{@render inl(s.rest)}</td></tr>
					{/each}
				</tbody>
			</table>
			<div class="three figs">
				{#each list('figs') as item, i (i)}
					{@const s = split(item)}
					<div class="box"><p class="fig">{@render inl(s.lead)}</p><p class="small">{@render inl(s.rest)}</p></div>
				{/each}
			</div>
			{@render ps('atlas-note', 'small dimp')}
		</section>

		<!-- 05 · research -->
		<section id="research" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">05</span><span class="sec-slash">/</span>{t('intro.sec.research')}</p>
			<Plate name="psi-6" width={1920} height={1080} focus="50% 40%" class="plate-strip" />
			<h2 class="big">{@render inl(head('res-title'), true)}</h2>
			{@render ps('res-lead', 'lead')}
			<div class="dashed">
				<div class="psi-head">
					<h3 class="psi-title">{@render inl(head('psi'))}</h3>
					{#if data.psiOpen && data.psiSince}<span class="chip live">{tf('intro.psi.since', { date: sinceLabel })}</span>{:else}<span class="chip">{t('intro.psi.closed')}</span>{/if}
				</div>
				{@render ps('psi')}
				<div class="bands" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b4"></span><span class="b5"></span></div>
				<p class="range-l mono"><span>{t('intro.psi.low')}</span><span>{t('intro.psi.high')}</span></p>
				<div class="parts">
					{#each list('psi-parts') as item, i (i)}
						{@const s = split(item)}
						<div><p class="node-k mono {i < 2 ? 'up' : 'downk'}">{@render inl(s.lead)} {i < 2 ? '↑' : '↓'}</p><p class="small">{@render inl(s.rest)}</p></div>
					{/each}
				</div>
			</div>
			<div class="cols">
				<div>
					<p class="node-k mono">{@render inl(head('trust'))}</p>
					<ul class="sq">{#each list('trust') as item, i (i)}<li>{@render inl(item)}</li>{/each}</ul>
				</div>
				<div>
					<p class="node-k mono">{@render inl(head('safe'))}</p>
					<ul class="sq">{#each list('safe') as item, i (i)}<li>{@render inl(item)}</li>{/each}</ul>
				</div>
			</div>

			<h2 class="mid">{@render inl(head('platform'))}</h2>
			{@render ps('platform')}
			<ol class="flow">
				{#each list('flow') as item, i (i)}
					{@const s = split(item)}
					<li class:on={i === 3}><strong>{@render inl(s.lead)}</strong><span>{@render inl(s.rest)}</span></li>
				{/each}
			</ol>
			{@render ps('flow-note', 'small dimp')}
			<table class="t">
				<thead><tr><th>{t('intro.th.study')}</th><th>{t('intro.th.question')}</th><th>{t('intro.th.stage')}</th></tr></thead>
				<tbody>
					{#each list('studies') as item, i (i)}
						{@const s = split(item)}
						<tr><td>{@render inl(s.lead)}</td><td>{@render inl(s.rest)}</td><td>{#if STAGES[i]}<span class="chip {STAGES[i].cls}">{t(STAGES[i].key)}</span>{/if}</td></tr>
					{/each}
				</tbody>
			</table>
			<div class="cols">
				<div>{@render ps('res-goal', 'small')}</div>
				<div>{@render ps('res-stories', 'small')}</div>
			</div>
		</section>

		<!-- 06 · agora -->
		<section id="agora" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">06</span><span class="sec-slash">/</span>{t('intro.sec.agora')} <span class="chip soon">{t('intro.state.soon')}</span></p>
			<h2 class="big">{@render inl(head('agora-title'), true)}</h2>
			{@render ps('agora-lead', 'lead')}
			{#if list('agora-ends').length === 2}
				{@const ends = list('agora-ends')}
				<div class="pass">
					{@render node(ends[0])}
					<p class="arrow" aria-hidden="true">→</p>
					<div class="node strong"><p class="node-k mono">{@render inl(head('agora-gate'))}</p><ol class="steps">{#each list('agora-gate') as item, i (i)}<li>{@render inl(item)}</li>{/each}</ol></div>
					<p class="arrow" aria-hidden="true">→</p>
					{@render node(ends[1], '', '', 'ok')}
				</div>
			{/if}
			<div class="cols">
				<div>
					<p class="node-k mono">{@render inl(head('identity'))}</p>
					<ul class="sq">{#each list('identity') as item, i (i)}<li>{@render inl(item)}</li>{/each}</ul>
				</div>
				<div>
					<p class="node-k mono">{@render inl(head('bots'))}</p>
					<ul class="sq">{#each list('bots') as item, i (i)}<li>{@render inl(item)}</li>{/each}</ul>
				</div>
			</div>
			<div class="dashed">{@render labelled('closed', '')}</div>
		</section>

		<!-- 07 · privacy -->
		<section id="privacy" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">07</span><span class="sec-slash">/</span>{t('intro.sec.privacy')}</p>
			<h2 class="big">{@render inl(head('priv-title'), true)}</h2>
			{@render ps('priv-lead', 'lead')}
			<div class="boxes two">
				{#each list('priv-boxes') as item, i (i)}
					{@const s = split(item)}
					<div class="box"><p class="node-k mono">{@render inl(s.lead)}</p><p class="small">{@render inl(s.rest)}</p></div>
				{/each}
			</div>
			<div class="cols">
				<div>{@render labelled('refuse-do')}</div>
				<div>{@render labelled('cannot')}</div>
			</div>
		</section>

		<!-- 08 · built to last -->
		<section id="last" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">08</span><span class="sec-slash">/</span>{t('intro.sec.last')}</p>
			<h2 class="big">{@render inl(head('last-title'), true)}</h2>
			{@render ps('last-lead', 'lead')}
			<ol class="numbered">
				{#each list('last-list') as item, i (i)}
					{@const s = split(item)}
					<li><h3>{@render inl(s.lead)}</h3><p>{@render inl(s.rest)}</p></li>
				{/each}
			</ol>
		</section>

		<!-- 09 · contributing -->
		<section id="contributing" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">09</span><span class="sec-slash">/</span>{t('intro.sec.contributing')}</p>
			<h2 class="big">{@render inl(head('contrib-title'), true)}</h2>
			{@render ps('contrib-lead', 'lead')}
			{#if list('contrib-in').length === 2 && list('contrib-out').length === 2}
				{@const ins = list('contrib-in')}
				{@const outs = list('contrib-out')}
				<div class="pass">
					<div class="stack">
						{@render node(ins[0], t('intro.state.openNow'), 'live-t')}
						{@render node(ins[1], t('intro.state.withAgora'), 'soon-t')}
					</div>
					<p class="arrow" aria-hidden="true">→</p>
					<div class="node strong"><p class="node-k mono">{@render inl(head('contrib-gate'))}</p><ol class="steps">{#each list('contrib-gate') as item, i (i)}<li>{@render inl(item)}</li>{/each}</ol></div>
					<p class="arrow" aria-hidden="true">→</p>
					<div class="stack">
						{@render node(outs[0], '', '', 'ok')}
						{@render node(outs[1])}
					</div>
				</div>
			{/if}
			<div class="cols">
				<div>{@render labelled('devs')}</div>
				<div>{@render labelled('everyone')}</div>
			</div>
			<div class="dashed"><h3 class="mid-s">{@render inl(head('together'))}</h3>{@render ps('together')}</div>
		</section>

		<!-- 10 · where we are -->
		<section id="now" class="block" use:reveal>
			<p class="sec-kicker mono"><span class="sec-num">10</span><span class="sec-slash">/</span>{t('intro.sec.now')}</p>
			<h2 class="big">{@render inl(head('now-title'), true)}</h2>
			<table class="t status">
				<tbody>
					<tr><th scope="row">{t('intro.now.live')}</th><td>{@render ps(data.psiOpen ? 'live-psi' : 'live', 'cell')}</td></tr>
					{#each list('status') as item, i (i)}
						<tr><th scope="row">{t(STATUS_KEYS[i] ?? '')}</th><td>{@render inl(item)}</td></tr>
					{/each}
				</tbody>
			</table>
			<div class="dashed">
				<h3 class="mid-s">{@render inl(head('ours'))}</h3>
				{@render ps('ours')}
			</div>
			<div class="boxes three-up">
				{#each list('who') as item, i (i)}
					{@const s = split(item)}
					<div class="box"><p class="node-k mono">{@render inl(s.lead)}</p><p class="small">{@render inl(s.rest)}</p></div>
				{/each}
			</div>
			<p class="motto">{#each list('motto') as item, i (i)}{#if i > 0}<br />{/if}{@render inl(item)}{/each}</p>
			<dl class="contact">
				<div><dt class="mono">{t('intro.contact.site')}</dt><dd><a href="/">deeptunisia.org</a></dd></div>
				<div><dt class="mono">{t('intro.contact.code')}</dt><dd><a href="https://github.com/deepontology/deeptunisia">github.com/deepontology/deeptunisia</a></dd></div>
				<div><dt class="mono">{t('intro.contact.mail')}</dt><dd><a href="mailto:contact@deeptunisia.org">contact@deeptunisia.org</a></dd></div>
			</dl>
		</section>
	</article>
</div>
<Ruler scroller={scrollEl} {sections} label={t('intro.ruler')} />
</div>

<style>
	.frame {
		/* Eclipse, pinned: true black, bright text, firm borders. */
		--surface-base: oklch(0% 0 0);
		--surface-sunken: oklch(5% 0.002 260);
		--surface-raised: oklch(9% 0.004 260);
		--text-primary: oklch(97% 0.002 260);
		--text-secondary: oklch(87% 0.003 260);
		--text-muted: oklch(74% 0.003 260);
		--text-faint: oklch(56% 0.003 260);
		--border-subtle: oklch(100% 0 0 / 0.1);
		--border-default: oklch(100% 0 0 / 0.17);
		--border-strong: oklch(100% 0 0 / 0.26);
		--accent: oklch(78% 0.13 var(--accent-h));
		--basis-documented: oklch(72% 0.115 var(--hue-documented));
		--basis-unsubstantiated: oklch(72% 0.115 var(--hue-unsubstantiated));
		--basis-reported: oklch(72% 0.115 var(--hue-reported));
		--basis-inferred: oklch(72% 0.115 var(--hue-inferred));
		color-scheme: dark;
		--ruler: 3.25rem;
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		background: var(--surface-base);
		color: var(--text-primary);
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding-inline-end: var(--ruler);
		scroll-behavior: smooth;
		container-type: inline-size;
	}
	@media (prefers-reduced-motion: reduce) {
		.scroll {
			scroll-behavior: auto;
		}
	}
	.mono {
		font-family: var(--font-mono);
	}

	/* ---- the section bar ---- */
	.secbar {
		position: sticky;
		top: 0;
		z-index: 4;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		min-height: 2.25rem;
		padding: 0.25rem 1rem;
		border-bottom: 1px solid var(--border-subtle);
		background: color-mix(in oklab, var(--surface-base) 86%, transparent);
		backdrop-filter: blur(8px);
		font-size: 0.6875rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.secbar-now {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.secbar-id {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.sec-num {
		color: var(--text-primary);
		font-weight: 600;
	}
	.sec-slash {
		margin-inline: 0.55em;
		color: var(--text-faint);
	}
	@media (max-width: 560px) {
		.secbar-id {
			display: none;
		}
	}

	/* ---- the document ---- */
	.intro {
		max-width: 56rem;
		margin-inline: auto;
		padding: 0 1rem 5rem;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	p {
		margin: 0 0 0.9rem;
	}
	a {
		color: var(--text-primary);
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 0.2em;
	}
	a:hover {
		text-decoration-color: var(--accent);
	}
	strong {
		color: var(--text-primary);
	}
	h2,
	h3 {
		color: var(--text-primary);
	}
	.big {
		margin: 0 0 1.2rem;
		font-size: clamp(1.75rem, 5.2cqw, 3rem);
		line-height: 1.02;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.005em;
		max-width: 24ch;
	}
	.dim {
		color: var(--text-muted);
	}
	.mid {
		margin: 2.6rem 0 0.8rem;
		font-size: 1.1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.mid-s {
		margin: 0 0 0.6rem;
		font-size: 1.15rem;
		font-weight: 700;
	}
	h3 {
		margin: 0 0 0.35rem;
		font-size: 1.02rem;
		line-height: 1.3;
		font-weight: 700;
	}
	.lead {
		font-size: clamp(1.15rem, 2.3cqw, 1.35rem);
		line-height: 1.45;
		color: var(--text-primary);
		max-width: 44ch;
		margin-bottom: 1.4rem;
	}
	.small {
		font-size: 0.94rem;
		line-height: 1.55;
	}
	.dimp {
		color: var(--text-muted);
	}
	.note {
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.kick,
	.sec-kicker,
	.node-k {
		font-size: 0.6875rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.node-k {
		margin: 0 0 0.45rem;
	}
	.kick {
		margin: 0 0 1rem;
	}
	.sec-kicker {
		display: flex;
		align-items: center;
		gap: 0;
		margin: 0 0 1.4rem;
	}
	.sec-kicker .chip {
		margin-inline-start: 0.8rem;
	}
	.block {
		border-top: 1px solid var(--border-default);
		margin-top: 4rem;
		padding-top: 1rem;
	}

	/* ---- cover ---- */
	.cover {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: calc(100dvh - 7.5rem);
		padding: clamp(2.5rem, 8vh, 5rem) 0 1rem;
	}
	.cue {
		margin: 1.2rem 0 0;
		text-align: center;
		color: var(--text-faint);
		animation: cue 2.4s ease-in-out infinite;
	}
	@keyframes cue {
		50% {
			transform: translateY(0.35rem);
			opacity: 0.4;
		}
	}
	/* The squares fill row by row on arrival, one row per step. */
	.live .squares svg {
		animation: fill 1.8s steps(40, end) 0.2s both;
	}
	@keyframes fill {
		from {
			clip-path: inset(0 0 100% 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
	}
	/* Sections rise in once, the first time they reach the reader. */
	.live .block {
		opacity: 0;
		transform: translateY(1.5rem);
		transition:
			opacity 700ms cubic-bezier(0.16, 1, 0.3, 1),
			transform 700ms cubic-bezier(0.16, 1, 0.3, 1);
	}
	.live .block:global(.seen) {
		opacity: 1;
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.live .squares svg,
		.cue {
			animation: none;
		}
		.live .block {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
	.cover h1 {
		margin: 0 0 1.4rem;
		font-size: clamp(2.8rem, 10cqw, 5.6rem);
		line-height: 0.96;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -0.005em;
	}
	.sub {
		max-width: 40ch;
		font-size: clamp(1.15rem, 2.4cqw, 1.4rem);
		line-height: 1.42;
		color: var(--text-secondary);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1.4rem 0 3rem;
	}
	.squares {
		margin: 0;
	}
	.squares svg {
		display: block;
		width: 100%;
		height: auto;
		fill: color-mix(in oklab, var(--text-primary) 52%, transparent);
	}
	.squares figcaption,
	.range-l {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.6rem;
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	/* ---- chips ---- */
	.chip {
		display: inline-flex;
		align-items: center;
		padding: 0.22rem 0.55rem;
		border: 1px solid var(--border-strong);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.chip.live {
		background: var(--accent);
		border-color: var(--accent);
		color: #000;
	}
	.chip.live::before {
		content: '●';
		margin-inline-end: 0.45em;
	}
	.chip.soon {
		border-color: var(--accent);
		color: var(--accent);
	}
	.chip.faint {
		color: var(--text-faint);
		border-color: var(--border-default);
	}
	.live-t {
		color: var(--basis-documented);
	}
	.soon-t {
		color: var(--accent);
	}

	/* ---- layout helpers ---- */
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.2rem 2rem;
		margin-top: 1.4rem;
	}
	.cols.wide-left {
		grid-template-columns: 1.1fr 1fr;
	}
	.three {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.2rem 1.6rem;
		margin-top: 2rem;
		padding-top: 1.2rem;
		border-top: 1px solid var(--border-subtle);
	}
	.three.figs {
		border-top: 0;
		padding-top: 0;
		gap: 0.9rem;
	}
	.boxes {
		display: grid;
		gap: 0.9rem;
		margin: 1.4rem 0;
	}
	.boxes.two {
		grid-template-columns: 1fr 1fr;
	}
	.boxes.three-up {
		grid-template-columns: repeat(3, 1fr);
	}
	.box {
		border: 1px solid var(--border-default);
		padding: 1rem 1.1rem;
	}
	.box p:last-child {
		margin-bottom: 0;
	}
	.box,
	.node {
		transition: border-color 200ms ease;
	}
	.box:hover,
	.node:hover {
		border-color: var(--border-strong);
	}
	.box-n {
		margin: 0 0 0.4rem;
		font-size: 0.6875rem;
		color: var(--text-faint);
	}
	.fig {
		margin: 0 0 0.3rem;
		font-size: 2rem;
		line-height: 1;
		font-weight: 700;
		color: var(--text-primary);
	}
	.dashed {
		margin: 1.6rem 0;
		padding: 1rem 1.15rem;
		border: 1px dashed var(--border-strong);
	}
	.dashed p:last-child {
		margin-bottom: 0;
	}
	.motto {
		margin: 2.4rem 0;
		font-size: 0.95rem;
		line-height: 2;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--text-primary);
	}
	@media (max-width: 720px) {
		.cols,
		.cols.wide-left,
		.boxes.two {
			grid-template-columns: 1fr;
		}
		.three,
		.boxes.three-up {
			grid-template-columns: 1fr;
		}
		.motto {
			letter-spacing: 0.12em;
		}
	}

	/* ---- stats ---- */
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 2rem 0 0.8rem;
		border-top: 1px solid var(--border-default);
	}
	.stats div {
		padding: 1rem 1rem 1rem 0;
		border-bottom: 1px solid var(--border-default);
	}
	.stats dt {
		order: 2;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.stats div {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.4rem;
	}
	.stats dd {
		margin: 0;
		font-size: clamp(1.5rem, 4cqw, 2.1rem);
		line-height: 1;
		font-weight: 700;
		color: var(--text-primary);
	}
	@media (max-width: 560px) {
		.stats {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* ---- lists ---- */
	.numbered {
		list-style: none;
		counter-reset: n;
		padding: 0;
		margin: 1.2rem 0 0;
	}
	.numbered li {
		counter-increment: n;
		position: relative;
		padding-inline-start: 2.6rem;
		margin-bottom: 1.2rem;
	}
	.numbered li::before {
		content: counter(n, decimal-leading-zero);
		position: absolute;
		inset-inline-start: 0;
		top: 0.15rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-primary);
	}
	.numbered p {
		margin: 0;
	}
	.sq {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.sq li {
		position: relative;
		padding-inline-start: 1.1rem;
		margin-bottom: 0.6rem;
		font-size: 0.94rem;
		line-height: 1.5;
	}
	.sq li::before {
		content: '';
		position: absolute;
		inset-inline-start: 0;
		top: 0.55em;
		width: 0.38rem;
		height: 0.38rem;
		background: var(--text-muted);
	}

	/* ---- tables ---- */
	.t {
		width: 100%;
		border-collapse: collapse;
		margin: 1rem 0 1.4rem;
		font-size: 0.94rem;
		line-height: 1.45;
	}
	.t th {
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-faint);
		text-align: start;
		padding: 0 0.9rem 0.5rem 0;
		border-bottom: 1px solid var(--border-strong);
	}
	.t td {
		padding: 0.65rem 0.9rem 0.65rem 0;
		border-bottom: 1px solid var(--border-subtle);
		vertical-align: top;
	}
	.t td:first-child {
		color: var(--text-primary);
		font-weight: 700;
	}
	.t.status th {
		width: 9rem;
		padding-top: 0.75rem;
		border-bottom: 1px solid var(--border-subtle);
		vertical-align: top;
	}
	.t.status td:first-child {
		font-weight: 400;
		color: var(--text-secondary);
	}
	@media (max-width: 560px) {
		.t.views td:first-child {
			white-space: normal;
		}
		.t.status th {
			width: 6.5rem;
		}
	}

	/* ---- structure tree ---- */
	.tree {
		display: grid;
		gap: 0.2rem;
		margin: 1.6rem 0;
	}
	.tier {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 0.9rem;
	}
	.doors {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.9rem;
	}
	.node {
		border: 1px solid var(--border-default);
		padding: 0.85rem 1rem;
		background: var(--surface-base);
	}
	.node p:last-child {
		margin-bottom: 0;
	}
	.node.strong {
		border: 1.5px solid var(--text-primary);
	}
	.node.ghost {
		border-style: dashed;
		border-color: var(--border-strong);
	}
	.node.ok {
		border-color: color-mix(in oklab, var(--basis-documented) 70%, transparent);
	}
	.node-name {
		margin: 0 0 0.2rem;
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.node-sub {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.down {
		margin: 0.15rem 0;
		text-align: center;
		color: var(--text-faint);
		font-size: 0.9rem;
	}
	@media (max-width: 720px) {
		.tier,
		.doors {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* ---- the gate ---- */
	.gate {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 1rem;
		margin: 1.6rem 0;
		align-items: stretch;
	}
	.gate-box {
		border: 1.5px solid var(--text-primary);
		padding: 1rem 1.15rem;
	}
	.refuse {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.refuse li {
		position: relative;
		padding-inline-start: 1.4rem;
		margin-bottom: 0.45rem;
		color: var(--text-primary);
		font-size: 0.97rem;
		line-height: 1.4;
	}
	.refuse li::before {
		content: '✕';
		position: absolute;
		inset-inline-start: 0;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		top: 0.1em;
	}
	.gate-out {
		display: grid;
		gap: 1rem;
	}
	.out {
		margin: 0;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border-default);
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.out span {
		display: block;
		margin-bottom: 0.3rem;
		font-size: 0.6875rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.out.ok {
		border-color: color-mix(in oklab, var(--basis-documented) 70%, transparent);
	}
	.out.ok span {
		color: var(--basis-documented);
	}
	.out.no {
		border-color: color-mix(in oklab, var(--basis-unsubstantiated) 70%, transparent);
	}
	.out.no span {
		color: var(--basis-unsubstantiated);
	}
	@media (max-width: 720px) {
		.gate {
			grid-template-columns: 1fr;
		}
	}

	/* ---- passes (Agora, contributing) ---- */
	.pass {
		display: grid;
		grid-template-columns: 1fr auto 1.3fr auto 1fr;
		align-items: center;
		gap: 0.7rem;
		margin: 1.6rem 0;
	}
	.stack {
		display: grid;
		gap: 0.7rem;
	}
	.arrow {
		margin: 0;
		color: var(--text-faint);
	}
	.steps {
		margin: 0;
		padding-inline-start: 1.1rem;
		color: var(--text-primary);
		font-size: 0.95rem;
		line-height: 1.6;
	}
	@media (max-width: 720px) {
		.pass {
			grid-template-columns: 1fr;
		}
		.arrow {
			text-align: center;
			transform: rotate(90deg);
		}
	}

	/* ---- kinds, ranges, bands ---- */
	.kinds {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
	}
	.kinds li {
		display: grid;
		grid-template-columns: 4.2rem 1fr;
		gap: 0.8rem;
		align-items: center;
		margin-bottom: 0.7rem;
		font-size: 0.88rem;
		line-height: 1.35;
		color: var(--text-muted);
	}
	.kinds strong {
		display: block;
		font-size: 0.95rem;
	}
	.line {
		height: 0;
		border-top: 3px solid;
	}
	.line.documented {
		border-color: var(--basis-documented);
	}
	.line.reported {
		border-color: var(--basis-reported);
		border-top-style: dashed;
	}
	.line.inferred {
		border-color: var(--basis-inferred);
		border-top-style: dotted;
	}
	.line.unsubstantiated {
		border-top: 0;
		height: 3px;
		background: repeating-linear-gradient(90deg, var(--basis-unsubstantiated) 0 10px, transparent 10px 14px, var(--basis-unsubstantiated) 14px 16px, transparent 16px 20px);
	}
	.range {
		display: grid;
		grid-template-columns: 1fr 2.4fr 1.2fr;
		height: 0.9rem;
	}
	.range .core {
		background: var(--text-primary);
	}
	.range .hatch {
		background: repeating-linear-gradient(135deg, color-mix(in oklab, var(--text-primary) 60%, transparent) 0 2px, transparent 2px 6px);
	}
	.range-l {
		margin-bottom: 1rem;
	}
	.hash {
		margin: 0.4rem 0 0;
		font-size: 0.6875rem;
		color: var(--text-faint);
	}
	.psi-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.6rem;
	}
	.psi-title {
		margin: 0;
		font-size: 1.3rem;
	}
	.psi-title a {
		text-decoration: none;
	}
	.bands {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 3px;
		height: 0.45rem;
		margin-top: 1rem;
	}
	.b1 {
		background: oklch(52% 0.13 25);
	}
	.b2 {
		background: oklch(38% 0.08 25);
	}
	.b3 {
		background: oklch(32% 0.004 260);
	}
	.b4 {
		background: oklch(40% 0.06 195);
	}
	.b5 {
		background: oklch(58% 0.09 195);
	}
	.parts {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-top: 0.4rem;
	}
	.parts p.small {
		margin: 0;
	}
	.up {
		color: var(--basis-documented);
	}
	.downk {
		color: var(--basis-unsubstantiated);
	}
	@media (max-width: 720px) {
		.parts {
			grid-template-columns: 1fr 1fr;
		}
	}
	.intro :global(.plate-strip) {
		--plate-h: clamp(13rem, 40vh, 26rem);
		margin-bottom: 2rem;
	}

	.cell {
		margin: 0;
	}
	/* Arabic letters join; tracking pulls them apart. The site sets it to zero
	   in RTL everywhere else, and so does this page. */
	:global([dir='rtl']) .frame :global(*) {
		letter-spacing: 0 !important;
	}
	@media (min-width: 721px) {
		:global([dir='rtl']) .arrow {
			transform: scaleX(-1);
		}
	}

	/* ---- the research flow ---- */
	.flow {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.5rem;
		padding: 0;
		margin: 1.4rem 0 0.6rem;
	}
	.flow li {
		border: 1px solid var(--border-default);
		padding: 0.65rem 0.7rem;
		font-size: 0.8rem;
		line-height: 1.3;
		color: var(--text-muted);
	}
	.flow li.on {
		border: 1.5px solid var(--text-primary);
	}
	.flow li.on strong::after {
		content: '';
		display: inline-block;
		width: 0.42rem;
		height: 0.42rem;
		margin-inline-start: 0.45rem;
		border-radius: 50%;
		background: var(--accent);
		vertical-align: middle;
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.flow li.on strong::after {
			animation: none;
		}
	}
	.flow strong {
		display: block;
		margin-bottom: 0.2rem;
		font-size: 0.95rem;
	}
	@media (max-width: 720px) {
		.flow {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* ---- contact ---- */
	.contact {
		display: grid;
		grid-template-columns: repeat(3, auto);
		justify-content: start;
		gap: 1rem 2.4rem;
		margin: 0;
	}
	.contact dt {
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}
	.contact dd {
		margin: 0;
		font-size: 0.95rem;
	}
	@media (max-width: 720px) {
		.contact {
			grid-template-columns: 1fr;
		}
	}
</style>
