<script lang="ts">
	import { app } from '$lib/state.svelte';
	import Plate from '$lib/index-study/Plate.svelte';
	import Ruler from '$lib/index-study/Ruler.svelte';
	import { FIGURES, STATUS_WORDS } from './figures';
	import { linesFrom, STEP_SHARE, type LineId } from '$lib/budget-game/lines';
	import { copyFor } from '$lib/budget-game/copy';
	import StudyGraphic from './StudyGraphic.svelte';
	import { landingCopy, type LandingSection } from './landing-copy';
	import { shareOrCopy } from '$lib/share';

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
	/** The board's own line names, so no name is ever made from an id. */
	const board = $derived(copyFor(lang));

	/** The one public address of the landing page: no query string, no tracking. */
	const LANDING_URL = 'https://deeptunisia.org/research/citizen-budget';

	/** The invented card's envelope and one line's draft, in MD. Not a budget figure. */
	const EXAMPLE_ENVELOPE = 100;
	const EXAMPLE_DRAFT = 40;

	const sec = $derived(
		Object.fromEntries(copy.sections.map((s) => [s.id, s])) as Record<LandingSection['id'], LandingSection>
	);
	const sections = $derived(copy.sections.map((s) => ({ id: `sec-${s.id}`, num: s.num, label: s.label })));
	let currentId = $state('sec-question');
	const current = $derived(sections.find((s) => s.id === currentId) ?? sections[0]);

	let scrollEl = $state<HTMLElement | null>(null);

	/** The section whose top has passed a third of the way down the scroll. */
	$effect(() => {
		const el = scrollEl;
		if (!el) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			const line = el.getBoundingClientRect().top + el.clientHeight * 0.33;
			let id = sections[0]?.id ?? currentId;
			for (const s of sections) {
				const node = el.querySelector<HTMLElement>(`#${s.id}`);
				if (node && node.getBoundingClientRect().top <= line) id = s.id;
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

	const fmt = (n: number) =>
		n.toLocaleString(lang === 'ar' ? 'ar-TN' : lang === 'fr' ? 'fr' : 'en-US', {
			maximumFractionDigits: 3
		});
	/** First-screen figures and worked examples read in en-US grouping. */
	const fmtTally = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	const fmtMd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

	const rows = $derived(FIGURES.rows.filter((r) => !r.memo));
	const memo = $derived(FIGURES.rows.filter((r) => r.memo));

	/** The board's own lines, the same ones the game places. */
	const lines = $derived(linesFrom(FIGURES.rows));
	const lineName = (id: LineId) => board.lines[id].name;
	const graphicSystems = $derived(lines.movable.map((l) => ({ name: lineName(l.id), draft: l.draft })));
	const graphicLocked = $derived(lines.locked.map((l) => ({ name: lineName(l.id), draft: l.draft })));

	/** Three draft figures on the first screen: total, locked, and the movable envelope. */
	const tally = $derived([
		{ label: copy.tally.draftTotal, value: fmtTally(FIGURES.total_md) },
		{ label: copy.tally.locked, value: fmtTally(lines.locked.reduce((sum, l) => sum + l.draft, 0)) },
		{ label: copy.tally.movable, value: fmtTally(lines.envelope) }
	]);

	/** One real draft line taken through one step of 5%. */
	const worked = $derived.by(() => {
		const line = lines.movable.reduce((best, l) => (l.draft > best.draft ? l : best));
		const step = line.draft * STEP_SHARE;
		return { text: copy.example.step(lineName(line.id), fmtMd(line.draft), fmtMd(step)) };
	});

	/** The invented card: one line's draft, one step, and the purse it leaves. */
	const invented = $derived.by(() => {
		const step = EXAMPLE_DRAFT * STEP_SHARE;
		const placed = EXAMPLE_ENVELOPE - step;
		return { step, placed, purse: EXAMPLE_ENVELOPE - placed };
	});

	/** Web Share when the platform has it; otherwise the landing URL is copied. */
	async function onShare() {
		await shareOrCopy({ url: LANDING_URL, title: copy.title, text: copy.share.text });
	}
</script>

<svelte:head>
	<title>{study.title_en} · DeepTunisia</title>
	<meta name="description" content={copy.cover} />
</svelte:head>

<div class="frame research-type" class:rtl={locale === 'ar'}>
	<div class="scroll" bind:this={scrollEl}>
		<div class="secbar mono">
			<span class="secbar-now" aria-live="polite">
				<span class="secbar-lead">{copy.sectionReadout}</span>
				<span class="sec-num">{current?.num}</span><span class="sec-slash">/</span>{current?.label}
			</span>
			<span class="secbar-end">
				<span class="secbar-status">{copy.status}</span>
				<!-- The fixed landing URL, never the current location: no query string, no tracking. -->
				<button class="share-btn" type="button" onclick={onShare} title={copy.share.heading}>
					{copy.share.button}
				</button>
			</span>
		</div>

		<article class="pti">
			<!-- Plate: our own 1-bit artwork, not the police study's. -->
			<Plate name="cb-1" width={1600} height={900} eager focus="50% 40%" class="plate-hero">
				<!-- While the plate is a placeholder, the envelope itself fills the hero. -->
				<div class="hero-graphic" aria-hidden="true">
					<StudyGraphic
						labels={copy.graphicLabels}
						systems={graphicSystems}
						locked={graphicLocked}
						envelopeLabel={sec.board.label}
						playable={false}
					/>
				</div>
				<div class="cover">
					<p class="cover-kicker mono">{copy.kicker}</p>
					<h1 class="cover-title">{copy.title}</h1>
					<p class="cover-hook">{copy.hook}</p>
					<dl class="tally cover-tally">
						{#each tally as item (item.label)}
							<div class="tally-item">
								<dt>{item.label}</dt>
								<dd class="mono">{item.value}</dd>
							</div>
						{/each}
					</dl>
					<p class="cover-tagline">{copy.hookTagline[0]}<br />{copy.hookTagline[1]}</p>
					<p class="cover-line">{copy.cover}</p>
					<p class="cover-meta mono">
						<span class="cover-tag">{copy.status}</span>
					</p>
				</div>
			</Plate>

			<!-- The board, playable from the first screen, on the real draft lines. -->
			<section class="first" aria-label={sec.board.label}>
				<div class="first-graphic">
					<StudyGraphic
						labels={copy.graphicLabels}
						systems={graphicSystems}
						locked={graphicLocked}
						envelopeLabel={sec.board.label}
						playable={true}
						compact={true}
					/>
				</div>
				<p class="note">{copy.draftNotice}</p>
			</section>

			<div class="body">
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
				</section>

				<!-- 02: the board's arithmetic, one real line and one invented budget. -->
				<section id="sec-board" class="sec">
					<p class="kicker mono">{sec.board.num} / {sec.board.label}</p>
					<h2>{sec.board.heading}</h2>
					{#each sec.board.body as para, i (i)}
						<p>{para}</p>
					{/each}

					<div class="example">
						<p class="formula mono" dir="ltr">{copy.example.formula}</p>
						<p>{worked.text}</p>
						<p class="note">{copy.example.invented}</p>
					</div>

					<aside class="example-card">
						<p class="example-title">{copy.example.title}</p>
						<p>{copy.example.intro}</p>
						<p class="formula mono" dir="ltr">{fmtMd(EXAMPLE_ENVELOPE)} − {fmtMd(invented.placed)} = {fmtMd(invented.purse)}</p>
						<dl class="example-facts">
							<div>
								<dt>{copy.graphicLabels.draft}</dt>
								<dd class="mono">{fmtMd(EXAMPLE_DRAFT)}</dd>
							</div>
							<div>
								<dt>{copy.graphicLabels.step}</dt>
								<dd class="mono">{fmtMd(invented.step)}</dd>
							</div>
							<div>
								<dt>{copy.graphicLabels.purse}</dt>
								<dd class="mono">{fmtMd(invented.purse)}</dd>
							</div>
						</dl>
						<p class="note">{copy.example.invented}</p>
						<p>{copy.example.result}</p>
					</aside>
					<p class="note">{copy.intricacy}</p>
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
											<td class="num" data-label={copy.graphicLabels.draft}>{fmt(r.amount_md)}</td>
											<td data-label={sec.record.label}>{STATUS_WORDS[r.status]}</td>
										</tr>
									{/each}
									{#each memo as r (r.id)}
										<tr class="memo">
											<th scope="row">{r.label_en}</th>
											<td class="num" data-label={copy.graphicLabels.draft}>{fmt(r.amount_md)}</td>
											<td data-label={sec.record.label}>{STATUS_WORDS[r.status]}</td>
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
	<div class="rail-slot">
		<Ruler scroller={scrollEl} {sections} label={copy.title} />
	</div>
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
		position: sticky;
		inset-block-start: 0;
		z-index: 4;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-3) var(--s-6);
		padding: var(--s-3) var(--s-6);
		margin-inline-end: 0;
		font-size: var(--t-xs);
		color: var(--text-muted);
		background: var(--surface-base);
		border-block-end: var(--rule);
	}
	.secbar-now {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-2);
		min-inline-size: 0;
	}
	.secbar-lead {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
	}
	.sec-num {
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.sec-slash {
		color: var(--text-muted);
	}
	.secbar-end {
		display: inline-flex;
		align-items: center;
		gap: var(--s-4);
	}
	.share-btn {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--touch);
		padding: var(--s-2) var(--s-4);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: var(--surface-raised);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
	}
	.share-btn:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.share-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.hero-graphic {
		position: absolute;
		inset-block-start: 0;
		inset-inline-end: 0;
		inline-size: 52%;
		block-size: 62%;
		overflow: hidden;
		opacity: 0.32;
		pointer-events: none;
	}
	/* Fade the artwork into the plate's ground before the cover text starts. */
	.hero-graphic::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, transparent 42%, var(--plate-bg) 100%);
	}
	.hero-graphic :global(.graphic) {
		inline-size: 100%;
		block-size: auto;
	}
	.hero-graphic :global(figure) {
		margin: 0;
	}
	.cover {
		position: absolute;
		inset-inline-start: 0;
		inset-block-end: 0;
		z-index: 1;
		inline-size: 100%;
		box-sizing: border-box;
		padding: var(--s-9) var(--s-6) var(--s-8);
		max-inline-size: 46rem;
		background: var(--plate-bg);
		color: var(--plate-ink);
	}
	/* Blend the solid cover into the artwork above it. */
	.cover::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block-end: 100%;
		block-size: var(--s-9);
		background: linear-gradient(to top, var(--plate-bg), transparent);
		pointer-events: none;
	}
	@media (min-width: 48rem) {
		/* Soften the cover's right edge where it meets the artwork. */
		.cover {
			background: linear-gradient(to right, var(--plate-bg) 88%, transparent);
		}
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
	.cover-hook {
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: 1.5;
		margin: 0 0 var(--s-3);
		max-inline-size: 38rem;
	}
	.cover-tagline {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		line-height: 1.4;
		color: var(--text-muted);
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
	.first {
		max-inline-size: var(--measure);
		margin-inline: auto;
		padding: var(--s-8) var(--s-6) var(--s-6);
	}
	.first-graphic {
		max-inline-size: 30rem;
		margin-inline: auto;
	}
	.tally {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--s-4);
		margin: var(--s-6) 0 var(--s-4);
		padding-block-start: var(--s-5);
		border-block-start: var(--rule);
	}
	.tally-item {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-inline-size: 0;
	}
	.tally dt {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		line-height: 1.3;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.tally dd {
		margin: 0;
		font-size: var(--step-1);
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}
	@container (max-width: 30rem) {
		.tally {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* The first-screen figures keep three columns inside the cover, so they
	   read on one line at 390 px rather than stacking down the plate. */
	.cover-tally {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: var(--s-5) 0 var(--s-4);
		padding-block-start: var(--s-4);
		border-block-start: 1px solid color-mix(in oklab, var(--plate-ink) 28%, transparent);
	}
	.cover-tally dt {
		color: color-mix(in oklab, var(--plate-ink) 72%, transparent);
		/* Two label lines, so the three figures share one baseline even when a
		   label wraps. */
		min-block-size: 2.6em;
	}
	.cover-tally dd {
		color: var(--plate-ink);
	}
	/* On a phone the cover fills the plate, so the faint hero board would sit
	   entirely behind it. Keep it off and let the plate artwork hold the top
	   edge; the playable board follows directly below. */
	@container (max-width: 40rem) {
		.hero-graphic {
			display: none;
		}
		.pti :global(.plate-hero) {
			--plate-h: max(64vh, 44rem);
		}
	}
	.example {
		margin-block: var(--s-6);
		padding: var(--s-5);
		border-inline-start: 3px solid var(--accent);
		background: var(--surface-raised);
	}
	.example-card {
		margin-block: var(--s-6);
		padding: var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-raised);
	}
	.example-title {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.formula {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		margin-block: var(--s-3);
	}
	.example-facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--s-4);
		margin: var(--s-4) 0;
	}
	.example-facts dt {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
		text-transform: uppercase;
	}
	.example-facts dd {
		margin: 0;
		font-size: var(--step-1);
		font-variant-numeric: tabular-nums;
	}
	@container (max-width: 30rem) {
		.example-facts {
			grid-template-columns: minmax(0, 1fr);
		}
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

	/* Phones: the rule goes away and the page reads edge to edge. The frame
	   carries the one gutter, so every section below is the full content width
	   and no wrapper can narrow it. The safe-area padding keeps the text clear
	   of a notch when the page is opened from a home screen. */
	@media (max-width: 599px) {
		.frame {
			grid-template-columns: minmax(0, 1fr);
			padding-inline-start: max(16px, env(safe-area-inset-left, 0px));
			padding-inline-end: max(16px, env(safe-area-inset-right, 0px));
		}
		.rail-slot {
			display: none;
		}
		/* The gutter now lives on the frame, so the inner blocks give theirs up
		   instead of stacking two of them. */
		.secbar,
		.body,
		.first,
		.cover {
			padding-inline: 0;
		}
		.body,
		.first,
		.cover {
			max-inline-size: none;
		}
		/* The figures table becomes one stacked row per line: the label, then
		   the draft and its status, each with its own small heading. A real
		   table stays at desktop. */
		.figures,
		.figures tbody,
		.figures tr,
		.figures th,
		.figures td {
			display: block;
		}
		.figures thead {
			display: none;
		}
		.figures tr {
			padding-block: var(--s-3);
			border-block-end: var(--rule);
		}
		.figures th,
		.figures td {
			padding: 0;
			border: 0;
		}
		.figures th[scope='row'] {
			font-family: var(--font-read);
			font-size: var(--step-0);
			line-height: 1.4;
			color: var(--text-primary);
		}
		.figures .memo th[scope='row'] {
			color: var(--text-muted);
		}
		.figures td {
			display: grid;
			grid-template-columns: 6.5em minmax(0, 1fr);
			gap: var(--s-3);
			padding-block-start: var(--s-2);
			font-size: var(--t-sm);
			color: var(--text-secondary);
		}
		.figures td::before {
			content: attr(data-label);
			font-family: var(--font-mono);
			font-size: var(--t-xs);
			line-height: 1.4;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.figures .num {
			text-align: start;
			white-space: normal;
		}
	}
</style>
