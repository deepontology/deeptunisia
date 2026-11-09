<script lang="ts">
	import { app } from '$lib/state.svelte';
	import Plate from '$lib/index-study/Plate.svelte';
	import Ruler from '$lib/index-study/Ruler.svelte';
	import { FIGURES, STATUS_WORDS } from './figures';
	import { linesFrom } from '$lib/budget-game/lines';
	import StudyGraphic from './StudyGraphic.svelte';
	import { landingCopy, type LandingSection } from './landing-copy';

	/**
	 * The landing page of the citizen budget study. It follows the structure of
	 * the police index landing (plate, cover, numbered sections, scroll ruler,
	 * honest states) and carries its own artwork and its own nouns.
	 *
	 * Every visible string is read from landingCopy for the reader's locale; a
	 * locale outside en, fr and ar falls back to English. The study is in
	 * design: nothing is collected, and every figure is a draft with its status
	 * beside it.
	 */
	let { study, instrument }: { study: { slug: string; title_en: string; population_statement: string | null; status: string }; instrument: { id: string; version: string } | null } = $props();

	const locale = $derived(app.locale);
	const lang = $derived<'en' | 'fr' | 'ar'>(locale === 'fr' || locale === 'ar' ? locale : 'en');
	const copy = $derived(landingCopy[lang]);

	const sec = $derived(
		Object.fromEntries(copy.sections.map((s) => [s.id, s])) as Record<LandingSection['id'], LandingSection>
	);
	const sections = $derived(copy.sections.map((s) => ({ id: `sec-${s.id}`, num: s.num, label: s.label })));

	let scrollEl = $state<HTMLElement | null>(null);

	const fmt = (n: number) =>
		n.toLocaleString(lang === 'ar' ? 'ar-TN' : lang === 'fr' ? 'fr' : 'en-US', {
			maximumFractionDigits: 3
		});

	const rows = $derived(FIGURES.rows.filter((r) => !r.memo));
	const memo = $derived(FIGURES.rows.filter((r) => r.memo));

	/** The board's own lines, the same ones the game places. */
	const lines = $derived(linesFrom(FIGURES.rows));
	const systemName = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
	const graphicSystems = $derived(lines.movable.map((l) => ({ name: systemName(l.id), draft: l.draft })));
	const graphicLocked = $derived(lines.locked.map((l) => ({ name: systemName(l.id), draft: l.draft })));
</script>

<svelte:head>
	<title>{study.title_en} · DeepTunisia</title>
	<meta name="description" content={copy.cover} />
</svelte:head>

<div class="frame research-type" class:rtl={locale === 'ar'}>
	<div class="scroll" bind:this={scrollEl}>
		<div class="secbar mono">
			<span class="secbar-end">{copy.status}</span>
		</div>

		<article class="pti">
			<!-- Plate: our own 1-bit artwork, not the police study's. -->
			<Plate name="cb-1" width={1600} height={900} eager focus="50% 40%" class="plate-hero">
				<div class="cover">
					<p class="cover-kicker mono">{copy.kicker}</p>
					<h1 class="cover-title">{copy.title}</h1>
					<p class="cover-line">{copy.cover}</p>
					<p class="cover-meta mono">
						<span class="cover-tag">{copy.status}</span>
					</p>
				</div>
			</Plate>

			<div class="body">
				<p class="hook">{copy.hook}</p>
				<p class="honest">{copy.notCollecting}</p>
				<p class="cta-row">
					<a class="cta" href="/research/citizen-budget/prototype">{copy.ctaPrototype}</a>
					<span class="note">{copy.ctaNote}</span>
				</p>
				{#if copy.interimNotice}
					<p class="note interim">{copy.interimNotice}</p>
				{/if}

				<!-- 01: the study in seconds. -->
				<section id="sec-question" class="sec">
					<p class="kicker mono">{sec.question.num} / {sec.question.label}</p>
					<h2>{sec.question.heading}</h2>
					{#each sec.question.body as para, i (i)}
						<p>{para}</p>
					{/each}
					<p class="note">{copy.whyItMatters}</p>
					<div class="figure-block">
						<StudyGraphic
							labels={copy.graphicLabels}
							systems={graphicSystems}
							locked={graphicLocked}
							envelopeLabel={sec.board.label}
							playable={false}
						/>
						<p class="note">{copy.draftNotice}</p>
					</div>
				</section>

				<!-- 02: the board, live and touchable, on the real draft lines. -->
				<section id="sec-board" class="sec">
					<p class="kicker mono">{sec.board.num} / {sec.board.label}</p>
					<h2>{sec.board.heading}</h2>
					{#each sec.board.body as para, i (i)}
						<p>{para}</p>
					{/each}
					<div class="figure-block">
						<StudyGraphic
							labels={copy.graphicLabels}
							systems={graphicSystems}
							locked={graphicLocked}
							envelopeLabel={sec.board.label}
							playable={true}
						/>
						<p class="note">{copy.draftNotice}</p>
						<p class="note">{copy.intricacy}</p>
					</div>
				</section>

				<!-- 03: the figures, each with its status, and who is being asked. -->
				<section id="sec-figures" class="sec">
					<p class="kicker mono">{sec.figures.num} / {sec.figures.label}</p>
					<h2>{sec.figures.heading}</h2>
					{#each sec.figures.body as para, i (i)}
						<p>{para}</p>
					{/each}
					<div class="figures-wrap">
						<div class="table-scroll">
							<table class="figures">
								<caption class="sr-only">{sec.figures.label}</caption>
								<thead>
									<tr>
										<th scope="col">{copy.graphicLabels.systems}</th>
										<th scope="col" class="num">{copy.graphicLabels.draft}</th>
										<th scope="col">{sec.record.label}</th>
									</tr>
								</thead>
								<tbody>
									{#each rows as r (r.id)}
										<tr>
											<th scope="row">{r.label_en}</th>
											<td class="num">{fmt(r.amount_md)}</td>
											<td>{STATUS_WORDS[r.status]}</td>
										</tr>
									{/each}
									{#each memo as r (r.id)}
										<tr class="memo">
											<th scope="row">{r.label_en}</th>
											<td class="num">{fmt(r.amount_md)}</td>
											<td>{STATUS_WORDS[r.status]}</td>
										</tr>
									{/each}
								</tbody>
							</table>
							<p class="note">{copy.figuresNote}</p>
						</div>
						<aside class="population">
							<p class="note">{copy.draftNotice}</p>
							{#if study.population_statement}
								<p>{study.population_statement}</p>
							{/if}
						</aside>
					</div>
				</section>

				<!-- 04: how the answers will be read. -->
				<section id="sec-method" class="sec">
					<p class="kicker mono">{sec.method.num} / {sec.method.label}</p>
					<h2>{sec.method.heading}</h2>
					{#each sec.method.body as para, i (i)}
						<p>{para}</p>
					{/each}
					{#if instrument}
						<p class="note mono">{instrument.id} · {instrument.version}</p>
					{/if}
				</section>

				<!-- 05: what is stored. -->
				<section id="sec-stored" class="sec">
					<p class="kicker mono">{sec.stored.num} / {sec.stored.label}</p>
					<h2>{sec.stored.heading}</h2>
					{#each sec.stored.body as para, i (i)}
						<p>{para}</p>
					{/each}
				</section>

				<!-- 06: what the answers cannot say. -->
				<section id="sec-cannot" class="sec">
					<p class="kicker mono">{sec.cannot.num} / {sec.cannot.label}</p>
					<h2>{sec.cannot.heading}</h2>
					{#each sec.cannot.body as para, i (i)}
						<p>{para}</p>
					{/each}
					<ul>
						{#each copy.cannotSay as item, i (i)}
							<li>{item}</li>
						{/each}
					</ul>
				</section>

				<!-- 07: the honest record. -->
				<section id="sec-record" class="sec">
					<p class="kicker mono">{sec.record.num} / {sec.record.label}</p>
					<h2>{sec.record.heading}</h2>
					{#each sec.record.body as para, i (i)}
						<p>{para}</p>
					{/each}
					<dl class="facts">
						{#each copy.recordFacts as fact (fact.label)}
							<dt>{fact.label}</dt>
							<dd>{fact.value}</dd>
						{/each}
					</dl>
				</section>

				<!-- 08: take part. -->
				<section id="sec-take" class="sec">
					<p class="kicker mono">{sec.take.num} / {sec.take.label}</p>
					<h2>{sec.take.heading}</h2>
					{#each sec.take.body as para, i (i)}
						<p>{para}</p>
					{/each}
					<p>
						<a class="cta" href="/research/citizen-budget/prototype">{copy.ctaPrototype}</a>
					</p>
					<p class="note">{copy.ctaNote}</p>
				</section>
			</div>
		</article>
	</div>
	<Ruler scroller={scrollEl} {sections} label={copy.title} />
</div>

<style>
	.frame {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--ruler);
		block-size: 100%;
		min-block-size: 0;
		container-type: size;
		--ruler: 3.5rem;
	}
	.scroll {
		overflow-y: auto;
		min-block-size: 0;
		container-type: inline-size;
	}
	.secbar {
		display: flex;
		justify-content: flex-end;
		padding: var(--s-3) var(--s-6);
		margin-inline-end: 0;
		font-size: var(--t-xs);
		color: var(--text-muted);
		border-block-end: var(--rule);
	}
	.cover {
		position: absolute;
		inset-inline-start: 0;
		inset-block-end: 0;
		inline-size: 100%;
		box-sizing: border-box;
		padding: var(--s-9) var(--s-6) var(--s-8);
		max-inline-size: 46rem;
		background: linear-gradient(to top, var(--plate-bg) 62%, transparent);
		color: var(--plate-ink);
	}
	.cover-kicker {
		font-size: var(--t-xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.8;
		margin: 0 0 var(--s-3);
	}
	.cover-title {
		font-family: var(--font-read);
		font-size: var(--step-4);
		line-height: 0.95;
		text-transform: uppercase;
		margin: 0 0 var(--s-4);
	}
	.cover-line {
		font-family: var(--font-read);
		font-size: var(--step-0);
		margin: 0 0 var(--s-4);
		max-inline-size: 38rem;
	}
	.cover-tag {
		display: inline-block;
		background: var(--accent);
		color: var(--accent-text);
		padding: var(--s-2) var(--s-4);
		border-radius: var(--r-full);
		font-size: var(--t-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.body {
		max-inline-size: var(--measure);
		margin-inline: auto;
		padding: var(--s-9) var(--s-6) var(--s-11);
	}
	.hook {
		font-family: var(--font-read);
		font-size: var(--step-1);
		line-height: 1.45;
		margin-block: var(--s-6) var(--s-5);
	}
	.honest {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		border-inline-start: 3px solid var(--accent);
		padding-inline-start: var(--s-4);
	}
	.interim {
		margin-block-start: var(--s-4);
	}
	.cta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-4);
	}
	.cta {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--touch);
		padding: var(--s-3) var(--s-6);
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--r-md);
		font-weight: 600;
		text-decoration: none;
	}
	.sec {
		padding-block: var(--s-10) var(--s-4);
		border-block-start: var(--rule);
		margin-block-start: var(--s-8);
	}
	.kicker {
		font-size: var(--t-xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin: 0 0 var(--s-3);
	}
	h2 {
		font-family: var(--font-read);
		font-size: var(--step-2);
		line-height: 1.15;
		margin: 0 0 var(--s-5);
	}
	p,
	li {
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: 1.6;
		margin: 0 0 var(--s-4);
	}
	ul {
		padding-inline-start: var(--s-6);
	}
	.note {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.figure-block {
		margin-block: var(--s-6);
	}
	.figures-wrap {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: var(--s-6);
		align-items: start;
		margin-block: var(--s-5);
	}
	@container (max-width: 44rem) {
		.figures-wrap {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.population {
		border-inline-start: 3px solid var(--accent);
		padding-inline-start: var(--s-4);
	}
	.population p {
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.table-scroll {
		overflow-x: auto;
	}
	.figures {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
	}
	.figures th,
	.figures td {
		padding: var(--s-3);
		border-block-end: var(--rule);
		text-align: start;
		vertical-align: top;
	}
	.figures .num {
		text-align: end;
		white-space: nowrap;
	}
	.figures .memo th,
	.figures .memo td {
		color: var(--text-muted);
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--s-3) var(--s-6);
		margin: 0;
	}
	.facts dt {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
		font-family: var(--font-read);
	}
	.sr-only {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
