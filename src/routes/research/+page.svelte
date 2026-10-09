<script lang="ts">
	import { onMount } from 'svelte';
	import { t, tf } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { studies, instrumentFor, titleOf, type StudyRecord } from '$lib/research';
	import Content from '$lib/ui/Content.svelte';
	import Plate from '$lib/index-study/Plate.svelte';
	import Ruler from '$lib/index-study/Ruler.svelte';
	import type { LiveResults } from '$lib/index-study/live';

	/**
	 * The research programme, as a front page.
	 *
	 * It shows what exists and what state each study is in, and it says what
	 * the programme is. A study's stage comes from the server when it answers
	 * (the server decides whether answers are being collected) and from the
	 * build-time registry until then, so the page never calls a study live
	 * that is not. The one figure it shows, an index's latest month, is the
	 * same aggregate the study page shows, with its month and its n beside it.
	 */

	const locale = $derived(app.locale);

	type Stage = 'live' | 'development' | 'closed' | 'published';
	function stageOf(status: string): Stage {
		if (status === 'fielding') return 'live';
		if (status === 'closed' || status === 'analyzed') return 'closed';
		if (status === 'published' || status === 'archived') return 'published';
		return 'development';
	}
	/** Where each status sits on the lifecycle strip, 0..4. */
	function stepOf(status: string): number {
		if (status === 'frozen') return 1;
		if (status === 'fielding') return 2;
		if (status === 'closed' || status === 'analyzed') return 3;
		if (status === 'published' || status === 'archived') return 4;
		return 0;
	}
	const LIFE = ['design', 'freeze', 'fielding', 'results', 'data'] as const;

	let serverStatus = $state<Record<string, string>>({});
	let latest = $state<Record<string, { level: number; period: string; n: number } | null>>({});
	const statusOf = (s: StudyRecord) => serverStatus[s.slug] ?? s.status;

	// Indexes (studies with a scoring block) first, then the rest.
	const ordered = $derived(
		[...studies].sort((a, b) => Number(!!instrumentFor(b)?.scoring) - Number(!!instrumentFor(a)?.scoring))
	);
	const liveCount = $derived(studies.filter((s) => stageOf(statusOf(s)) === 'live').length);

	onMount(() => {
		for (const s of studies) {
			void fetch(`/api/studies/${s.slug}`)
				.then((r) => (r.ok ? r.json() : null))
				.then((body) => {
					if (body?.study?.status) serverStatus = { ...serverStatus, [s.slug]: body.study.status };
				})
				.catch(() => {});
			if (!instrumentFor(s)?.scoring) continue;
			void fetch(`/api/studies/${s.slug}/live`)
				.then((r) => (r.ok ? r.json() : null))
				.then((body: LiveResults | null) => {
					const months = body?.series?.months ?? [];
					const last = [...months].reverse().find((m) => m.index.level !== null);
					latest = {
						...latest,
						[s.slug]: last ? { level: last.index.level!, period: last.period, n: last.results.n } : null
					};
				})
				.catch(() => {});
		}
	});

	const fmt = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : locale).format(Math.round(v));
	function monthLabel(period: string): string {
		const [y, m] = period.split('-').map(Number);
		return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
			new Date(Date.UTC(y, m - 1, 1))
		);
	}
	const shortName = (s: StudyRecord) => (instrumentFor(s)?.scoring ? 'PSI' : `DT-${s.id.split('-').pop()}`);

	let scrollEl = $state<HTMLElement | null>(null);
	const sections = $derived(
		[
			{ id: 'studies', key: 'research.hub.sec.studies' },
			{ id: 'about', key: 'research.hub.sec.about' },
			{ id: 'lifecycle', key: 'research.hub.sec.lifecycle' },
			{ id: 'programme', key: 'research.hub.sec.programme' }
		].map((s, i) => ({ id: s.id, num: String(i + 1).padStart(2, '0'), label: t(s.key) }))
	);
	const numOf = (id: string) => sections.find((s) => s.id === id);
</script>

<svelte:head>
	<title>{t('nav.research')} · DeepTunisia</title>
</svelte:head>

{#snippet kicker(id: string)}
	{@const s = numOf(id)}
	{#if s}<p class="kicker mono"><span class="k-num">{s.num}</span><span class="k-slash">/</span>{s.label}</p>{/if}
{/snippet}

<div class="frame" class:rtl={locale === 'ar'}>
<div class="scroll" bind:this={scrollEl}>
<div class="hub">
	<Plate
		name="psi-6"
		width={1920}
		height={1080}
		eager
		focus="50% 55%"
		class="hub-plate"
		label="{t('index.fig.label')} 01"
		caption={t('research.hub.fig')}
	/>

	<!-- The masthead band: what this is, in one line, with the counts that are true today. -->
	<header class="band">
		<p class="band-kicker mono">{t('research.hub.kicker')}</p>
		<h1>DT Research</h1>
		<p class="band-line">{t('research.hub.line')}</p>
		<dl class="stats">
			<div><dt>{t('research.hub.stat.studies')}</dt><dd class="mono">{fmt(studies.length)}</dd></div>
			<div><dt>{t('research.hub.stat.live')}</dt><dd class="mono">{fmt(liveCount)}</dd></div>
			<div><dt>{t('research.hub.stat.rules')}</dt><dd class="mono">{t('research.hub.stat.all')}</dd></div>
		</dl>
	</header>

	<section id="studies">
		{@render kicker('studies')}
		<ul class="cards">
			{#each ordered as s (s.id)}
				{@const stage = stageOf(statusOf(s))}
				{@const isIndex = !!instrumentFor(s)?.scoring}
				{@const last = latest[s.slug]}
				<li class="card" class:index={isIndex}>
					<a href="/research/{s.slug}" class="card-link">
						<div class="card-visual">
							{#if isIndex}
								<picture>
									<source media="(prefers-reduced-motion: reduce)" srcset="/research/media/psi-5-still.webp" />
									<img src="/research/media/psi-5.webp" alt="" width="1540" height="1026" loading="lazy" decoding="async" />
								</picture>
							{:else}
								<!-- No artwork yet: a drafting grid, the honest picture of a study in design. -->
								<div class="drafting" aria-hidden="true">
									<span class="draft-id mono">{shortName(s)}</span>
								</div>
							{/if}
							<span class="chip mono" class:live={stage === 'live'}>
								{#if stage === 'live'}<span class="pulse" aria-hidden="true"></span>{/if}
								{t(`research.stage.${stage}`)}
							</span>
						</div>
						<div class="card-body">
							<p class="card-meta mono">
								<span>{shortName(s)}</span>
								<span>{t(isIndex ? 'research.hub.kind.monthly' : 'research.hub.kind.wave')}</span>
							</p>
							<h2 dir="auto">{titleOf(s, locale)}</h2>
							{#if isIndex && last}
								<p class="figure">
									<span class="figure-n mono">{fmt(last.level)}</span>
									<span class="figure-meta mono">
										<span>{t('research.hub.latestLabel')}</span>
										<span>{tf('research.hub.latest', { month: monthLabel(last.period), n: fmt(last.n) })}</span>
									</span>
								</p>
							{:else if stage === 'development'}
								<p class="card-note">{t('research.hub.dev')}</p>
							{/if}
							<span class="card-go mono">{t('research.hub.open')} <span aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span></span>
						</div>
					</a>
				</li>
			{/each}
			<li class="card planned">
				<div class="planned-body">
					<span class="plus mono" aria-hidden="true">+</span>
					<h2>{t('research.hub.planned.title')}</h2>
					<p class="card-note">{t('research.hub.planned.body')}</p>
				</div>
			</li>
		</ul>
		<p class="note">{t('research.study.populationNote')}</p>
	</section>

	<section id="about">
		{@render kicker('about')}
		<ol class="principles">
			{#each [1, 2, 3, 4] as n (n)}
				<li>
					<span class="p-num mono">0{n}</span>
					<h3>{t(`research.hub.p${n}.title`)}</h3>
					<p>{t(`research.hub.p${n}.body`)}</p>
				</li>
			{/each}
		</ol>
	</section>

	<section id="lifecycle">
		{@render kicker('lifecycle')}
		<!-- Five steps, and where each study stands on them today. -->
		<ol class="life">
			{#each LIFE as step, i (step)}
				<li class="step">
					<span class="step-n mono">{String(i + 1).padStart(2, '0')}</span>
					<h3>{t(`research.life.${step}`)}</h3>
					<p>{t(`research.life.${step}.body`)}</p>
					<div class="here">
						{#each ordered.filter((s) => stepOf(statusOf(s)) === i) as s (s.id)}
							<a class="here-chip mono" class:live={stageOf(statusOf(s)) === 'live'} href="/research/{s.slug}">{shortName(s)}</a>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<section id="programme" class="programme">
		{@render kicker('programme')}
		<div class="prose">
			<Content view="research" section="program" />
		</div>
	</section>
</div>
</div>
<Ruler scroller={scrollEl} {sections} label={t('research.hub.sections')} />
</div>

<style>
	.frame {
		--ruler: 3.25rem;
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding-inline-end: var(--ruler);
		container-type: inline-size;
		scroll-behavior: smooth;
	}
	@media (prefers-reduced-motion: reduce) {
		.scroll {
			scroll-behavior: auto;
		}
	}
	.hub {
		max-width: 72rem;
		margin-inline: auto;
		padding: 0 1rem 5rem;
		color: var(--text-primary);
	}
	.hub :global(.hub-plate) {
		--plate-h: min(52vh, 40cqw);
	}

	/* ---- the masthead band ---------------------------------------------- */
	.band {
		width: 100cqw;
		margin-inline: calc(50% - 50cqw);
		margin-top: 1.5rem;
		padding: 2.2rem max(1rem, calc((100cqw - 72rem) / 2 + 1rem)) 2.4rem;
		background: color-mix(in oklch, var(--accent) 13%, var(--surface-base));
		border-block: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
	}
	.band-kicker {
		margin: 0 0 0.6rem;
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.band h1 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: clamp(3rem, 11vw, 8.5rem);
		line-height: 0.9;
		letter-spacing: -0.04em;
		font-weight: 600;
	}
	.band-line {
		margin: 1rem 0 1.8rem;
		max-width: 34ch;
		font-family: var(--font-serif);
		font-size: clamp(1.3rem, 2.6vw, 1.9rem);
		line-height: 1.25;
	}
	.rtl .band-line {
		font-family: var(--font-sans);
		font-weight: 500;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
		border-top: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
	}
	.stats div {
		padding: 0.8rem 1rem 0 0;
	}
	.stats div + div {
		padding-inline-start: 1rem;
		border-inline-start: 1px solid color-mix(in oklch, var(--accent) 25%, transparent);
	}
	.stats dt {
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.stats dd {
		margin: 0.3rem 0 0;
		font-size: clamp(1.4rem, 3vw, 2.2rem);
	}

	/* ---- section kickers ------------------------------------------------ */
	.kicker {
		display: flex;
		align-items: baseline;
		margin: 3.5rem 0 1.5rem;
		padding-top: 0.65rem;
		border-top: 1px solid var(--border-default);
		font-size: 0.6875rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.k-num {
		color: var(--text-primary);
		font-weight: 600;
	}
	.k-slash {
		margin-inline: 0.55em;
		color: var(--text-faint);
	}
	.rtl .kicker,
	.rtl .band-kicker,
	.rtl .stats dt {
		letter-spacing: 0;
	}

	/* ---- study cards ---------------------------------------------------- */
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		background: var(--border-default);
		border: 1px solid var(--border-default);
	}
	.card {
		background: var(--surface-base);
	}
	.card.index {
		grid-column: 1 / -1;
	}
	.card-link {
		display: grid;
		height: 100%;
		color: inherit;
		text-decoration: none;
	}
	.card.index .card-link {
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
	}
	.card-visual {
		position: relative;
		min-height: 15rem;
		background: #000;
		overflow: hidden;
	}
	.card-visual picture,
	.card-visual img {
		display: block;
		width: 100%;
		height: 100%;
	}
	.card-visual img {
		object-fit: cover;
		object-position: 50% 35%;
	}
	.drafting {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background-color: var(--surface-sunken);
		background-image:
			linear-gradient(var(--border-subtle) 1px, transparent 1px),
			linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
		background-size: 1.25rem 1.25rem;
	}
	.draft-id {
		font-size: clamp(2.2rem, 6vw, 3.6rem);
		letter-spacing: -0.03em;
		color: transparent;
		-webkit-text-stroke: 1px var(--text-faint);
	}
	.chip {
		position: absolute;
		top: 0.8rem;
		inset-inline-start: 0.8rem;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.3rem 0.6rem;
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		background: var(--surface-base);
		color: var(--text-secondary);
		border: 1px solid var(--border-strong);
	}
	.chip.live {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.pulse {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
		}
	}
	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1.4rem 1.4rem 1.2rem;
	}
	.card-meta {
		display: flex;
		justify-content: space-between;
		margin: 0;
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.card-meta span:first-child {
		color: var(--accent);
		font-weight: 600;
	}
	.card h2 {
		margin: 0;
		font-size: clamp(1.3rem, 2.4vw, 1.75rem);
		line-height: 1.15;
	}
	.figure {
		display: flex;
		align-items: flex-end;
		gap: 0.9rem;
		margin: 0.4rem 0 0;
	}
	.figure-n {
		font-size: clamp(3.5rem, 8vw, 5.5rem);
		line-height: 0.85;
		letter-spacing: -0.05em;
	}
	.figure-meta {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding-bottom: 0.35rem;
		font-size: 0.6875rem;
		color: var(--text-secondary);
	}
	.figure-meta span:first-child {
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-faint);
	}
	.card-note {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.95rem;
	}
	.card-go {
		margin-top: auto;
		padding-top: 0.6rem;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.card-link:hover .card-go,
	.card-link:focus-visible .card-go {
		color: var(--accent);
	}
	.card-link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.planned {
		display: flex;
	}
	.planned-body {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.7rem;
		padding: 1.6rem 1.4rem;
		outline: 1px dashed var(--border-strong);
		outline-offset: -0.8rem;
		width: 100%;
	}
	.planned h2 {
		font-size: 1.2rem;
	}
	.plus {
		font-size: 2rem;
		line-height: 1;
		color: var(--text-faint);
	}
	.note {
		margin-top: 1rem;
		font-size: 0.86rem;
		color: var(--text-faint);
	}

	/* ---- principles ----------------------------------------------------- */
	.principles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-top: 1px solid var(--border-default);
	}
	.principles li {
		padding: 1.4rem 1.4rem 1.6rem 0;
		border-bottom: 1px solid var(--border-default);
	}
	.principles li:nth-child(even) {
		padding-inline: 1.4rem 0;
		border-inline-start: 1px solid var(--border-default);
	}
	.p-num {
		font-size: 0.75rem;
		color: var(--accent);
	}
	.principles h3 {
		margin: 0.5rem 0 0.4rem;
		font-size: 1.15rem;
	}
	.principles p {
		margin: 0;
		color: var(--text-secondary);
		line-height: 1.55;
	}

	/* ---- lifecycle ------------------------------------------------------ */
	.life {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
	.step {
		position: relative;
		padding: 1rem 1rem 0 0;
		border-top: 2px solid var(--border-strong);
	}
	.step::before {
		content: '';
		position: absolute;
		top: -0.4rem;
		inset-inline-start: 0;
		width: 0.7rem;
		height: 0.7rem;
		background: var(--surface-base);
		border: 2px solid var(--border-strong);
		transform: rotate(45deg);
	}
	.step-n {
		font-size: 0.6875rem;
		color: var(--text-faint);
	}
	.step h3 {
		margin: 0.3rem 0 0.35rem;
		font-size: 1rem;
	}
	.step p {
		margin: 0 0 0.8rem;
		font-size: 0.85rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.here {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.here-chip {
		padding: 0.2rem 0.5rem;
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		border: 1px solid var(--border-strong);
		color: var(--text-primary);
		text-decoration: none;
	}
	.here-chip.live {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.programme .prose {
		max-width: 46rem;
	}

	/* ---- phones --------------------------------------------------------- */
	@media (max-width: 760px) {
		.frame {
			--ruler: 0.9rem;
		}
		.hub :global(.hub-plate) {
			--plate-h: 34vh;
		}
		.stats {
			grid-template-columns: 1fr;
		}
		.stats div,
		.stats div + div {
			padding: 0.7rem 0;
			border-inline-start: 0;
			border-bottom: 1px solid color-mix(in oklch, var(--accent) 25%, transparent);
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 1rem;
		}
		.stats dd {
			margin: 0;
			font-size: 1.4rem;
		}
		.cards,
		.principles,
		.card.index .card-link {
			grid-template-columns: 1fr;
		}
		.principles li,
		.principles li:nth-child(even) {
			padding-inline: 0;
			border-inline-start: 0;
		}
		.life {
			grid-template-columns: 1fr;
		}
		.step {
			border-top: 0;
			border-inline-start: 2px solid var(--border-strong);
			padding: 0 0 1.2rem 1.2rem;
		}
		.step::before {
			top: 0.15rem;
			inset-inline-start: -0.45rem;
		}
	}
</style>
