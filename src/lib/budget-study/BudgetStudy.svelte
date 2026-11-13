<script lang="ts">
	import { app } from '$lib/state.svelte';
	import Ruler from '$lib/index-study/Ruler.svelte';
	import { FIGURES, type FigureRow } from './figures';
	import { linesFrom, LINE_ROWS, type LineId } from '$lib/budget-game/lines';
	import { copyFor } from '$lib/budget-game/copy';
	import { boardCopyFor } from '$lib/budget-game/board-copy';
	import * as B from '$lib/budget-game/board';
	import { fmtMd, signed } from '$lib/budget-game/SystemRow.svelte';
	import EnvelopeField from './EnvelopeField.svelte';
	import TryBoard from './TryBoard.svelte';
	import { landingCopy, type FactKey, type LandingSection } from './landing-copy';
	import { shareOrCopy } from '$lib/share';

	/**
	 * The landing page of the citizen budget study, built to the police index
	 * bar: an ink plate whose artwork is the budget itself (every dot is money,
	 * every block a line, touchable), a count strip, numbered sections, a scroll
	 * ruler, a playable piece of the board, a worked example, the figures with
	 * their status, and the study's honest states.
	 *
	 * Every amount is computed from the figures file; the copy carries words only.
	 */
	let { study, instrument }: { study: { slug: string; title_en: string; population_statement: string | null; status: string }; instrument: { id: string; version: string } | null } = $props();

	const lang = $derived<'en' | 'fr' | 'ar'>(app.locale === 'fr' || app.locale === 'ar' ? app.locale : 'en');
	const copy = $derived(landingCopy[lang]);
	const names = $derived(copyFor(lang));
	const bc = $derived(boardCopyFor(lang));

	const LANDING_URL = 'https://deeptunisia.org/research/citizen-budget';
	const BOARD_URL = '/research/citizen-budget/prototype';

	const sec = $derived(Object.fromEntries(copy.sections.map((s) => [s.id, s])) as Record<LandingSection['id'], LandingSection>);
	const sections = $derived(copy.sections.map((s) => ({ id: `sec-${s.id}`, num: s.num, label: s.label })));
	let currentId = $state('sec-question');
	const current = $derived(sections.find((s) => s.id === currentId) ?? sections[0]);
	let scrollEl = $state<HTMLElement | null>(null);

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

	const lines = linesFrom(FIGURES.rows);
	const lockedTotal = lines.locked.reduce((s, l) => s + l.draft, 0);
	const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	const lineOf = (id: LineId) => [...lines.movable, ...lines.locked].find((l) => l.id === id)!;

	/** The field: locked lines first, then every movable line, largest first. */
	let fieldActive = $state<string | null>(null);
	const blocks = $derived([
		...lines.locked.map((l) => ({ id: l.id, name: names.lines[l.id].name, md: l.draft, locked: true })),
		...[...lines.movable].sort((a, b) => b.draft - a.draft).map((l) => ({ id: l.id, name: names.lines[l.id].name, md: l.draft, locked: false }))
	]);

	const tally = $derived([
		{ value: fmt(lines.total), unit: copy.unit, label: copy.tally.total },
		{ value: fmt(lockedTotal), unit: copy.unit, label: copy.tally.locked },
		{ value: fmt(lines.envelope), unit: copy.unit, label: copy.tally.movable },
		{ value: String(lines.movable.length), unit: '', label: copy.tally.systems }
	]);

	const top4 = [...lines.movable].sort((a, b) => b.draft - a.draft).slice(0, 4);
	const top4Share = (top4.reduce((s, l) => s + l.draft, 0) / lines.envelope) * 100;
	const FACT_VALUE: Record<FactKey, { value: string; unit: string }> = {
		locked: { value: fmt(lockedTotal), unit: 'MD' },
		subsidies: { value: fmt(lineOf('subsidies').draft), unit: 'MD' },
		largest: { value: top4Share.toFixed(0), unit: '%' },
		zero: { value: '+100 −100', unit: '' }
	};

	/** The worked example: from the plan, Defence dragged onto Health three times. */
	const example = $derived.by(() => {
		const board: B.Board = { lines };
		let s = B.startBoard(board, 'draft', 'coin');
		for (let i = 0; i < 3; i++) s = B.transfer(board, s, 'army', 'health');
		const alloc = B.toAllocation(board, s);
		return (['army', 'health'] as LineId[]).map((id) => {
			const plan = lineOf(id).draft;
			const yours = B.heldMd(board, s, id);
			return { id, plan, yours, md: yours - plan, pct: ((yours - plan) / plan) * 100, bp: alloc[id] as number };
		});
	});

	const demoLines = lines.movable.filter((l) => l.id === 'education' || l.id === 'health' || l.id === 'army');

	/** The figures: each board line, what it is made of, and its weakest status. */
	const rowById = new Map(FIGURES.rows.map((r) => [r.id, r]));
	const STATUS_RANK: FigureRow['status'][] = ['adopted-lf', 'draft-plf', 'draft-press', 'draft-derived'];
	const figureLines = $derived(
		[...lines.movable, ...lines.locked].map((l) => {
			const made = LINE_ROWS[l.id];
			const parts = [...made.plus, ...(made.minus ?? [])].map((id) => rowById.get(id)!);
			const status = parts.reduce<FigureRow['status']>((w, r) => (STATUS_RANK.indexOf(r.status) > STATUS_RANK.indexOf(w) ? r.status : w), 'adopted-lf');
			const madeOf =
				made.plus.length > 1 || made.minus
					? `${made.plus.map((id) => rowById.get(id)!.label_en).join(' + ')}${made.minus ? ` ${copy.figures.less} ${made.minus.map((id) => rowById.get(id)!.label_en).join(', ')}` : ''}`
					: '';
			return { id: l.id, name: names.lines[l.id].name, md: l.draft, locked: l.locked, status, madeOf };
		})
	);

	async function onShare() {
		await shareOrCopy({ url: LANDING_URL, title: copy.title, text: copy.share.text });
	}
</script>

<svelte:head>
	<title>{copy.title} · DeepTunisia</title>
	<meta name="description" content={copy.cover} />
</svelte:head>

<div class="frame research-type" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
	<div class="scroll" bind:this={scrollEl}>
		<div class="secbar mono">
			<span class="secbar-now" aria-live="polite">
				<span class="secbar-lead">{copy.sectionReadout}</span>
				<span class="sec-num">{current?.num}</span><span class="sec-slash">/</span>{current?.label}
			</span>
			<span class="secbar-end">
				<span class="secbar-status">{copy.status}</span>
				<button class="share-btn" type="button" onclick={onShare} title={copy.share.heading}>{copy.share.button}</button>
			</span>
		</div>

		<article>
			<!-- The plate: the budget itself is the artwork. -->
			<header class="plate hero">
				<div class="hero-inner">
					<div class="cover">
						<p class="kicker mono">{copy.kicker}</p>
						<h1 class="title">{copy.title}</h1>
						<p class="hook">{copy.hook}</p>
						<p class="cover-line">{copy.cover}</p>
						<p class="meta">
							<span class="tag mono"><span class="dot" aria-hidden="true"></span>{copy.status}</span>
							<a class="cta" href={BOARD_URL}>{copy.ctaBoard}</a>
						</p>
					</div>
					<div class="hero-field">
						<EnvelopeField
							{blocks}
							total={lines.total}
							bind:active={fieldActive}
							words={{ ...copy.field, unit: copy.unit }}
						/>
					</div>
				</div>
			</header>

			<!-- The count strip. -->
			<section class="strip" aria-label={copy.status}>
				<dl class="tally">
					{#each tally as item (item.label)}
						<div>
							<dd class="mono"><bdi>{item.value}</bdi>{#if item.unit}<small>{item.unit}</small>{/if}</dd>
							<dt>{item.label}</dt>
						</div>
					{/each}
				</dl>
				<p class="strip-note"><span class="mono zero">0 {copy.tally.answers}</span> {copy.notCollecting}</p>
			</section>

			<div class="body">
				<!-- 01 -->
				<section id="sec-question" class="sec">
					<p class="sec-kicker mono">{sec.question.num} / {sec.question.label}</p>
					<h2>{sec.question.heading}</h2>
					{#each sec.question.body as p, i (i)}<p>{p}</p>{/each}

					<h3 class="facts-heading">{copy.facts.heading}</h3>
					<ol class="facts">
						{#each copy.facts.items as f (f.key)}
							<li>
								<p class="fact-value mono"><bdi>{FACT_VALUE[f.key].value}</bdi>{#if FACT_VALUE[f.key].unit}<small>{FACT_VALUE[f.key].unit === 'MD' ? copy.unit : FACT_VALUE[f.key].unit}</small>{/if}</p>
								<p class="fact-title">{f.title}</p>
								<p class="fact-body">{f.body}</p>
							</li>
						{/each}
					</ol>
				</section>

				<!-- 02 -->
				<section id="sec-board" class="sec">
					<p class="sec-kicker mono">{sec.board.num} / {sec.board.label}</p>
					<h2>{sec.board.heading}</h2>
					{#each sec.board.body as p, i (i)}<p>{p}</p>{/each}

					<div class="wide">
						<h3>{copy.demo.title}</h3>
						<p class="note">{copy.demo.body}</p>
						<TryBoard
							lines={demoLines}
							names={Object.fromEntries(demoLines.map((l) => [l.id, names.lines[l.id].name]))}
							words={{ ...copy.demo, plan: bc.plan, yours: bc.yours, more: bc.more, less: bc.less, same: bc.same, legendPlan: bc.legendPlan, legendYours: bc.legendYours, unit: copy.unit, took: bc.took, gave: bc.gave, moved: bc.moved }}
						/>
						<p><a class="cta" href={BOARD_URL}>{copy.demo.fullBoard}</a> <span class="note">{copy.ctaNote}</span></p>
					</div>

					<div class="example">
						<h3>{copy.example.title}</h3>
						<p>{copy.example.intro}</p>
						<div class="table-scroll">
							<table>
								<thead>
									<tr>
										<th scope="col">{copy.example.head.system}</th>
										<th scope="col">{copy.example.head.plan}</th>
										<th scope="col">{copy.example.head.yours}</th>
										<th scope="col">{copy.example.head.change}</th>
										<th scope="col">{copy.example.head.storedAs}</th>
									</tr>
								</thead>
								<tbody>
									{#each example as r (r.id)}
										<tr>
											<th scope="row">{names.lines[r.id].name}</th>
											<td>{fmtMd(r.plan)}</td>
											<td>{fmtMd(r.yours)}</td>
											<td><bdi>{signed(r.md)} · {signed(r.pct, 1)}%</bdi></td>
											<td>{r.bp.toLocaleString('en-US')}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<p class="note">{copy.example.stored} {copy.example.note}</p>
					</div>
				</section>

				<!-- 03 -->
				<section id="sec-figures" class="sec">
					<p class="sec-kicker mono">{sec.figures.num} / {sec.figures.label}</p>
					<h2>{sec.figures.heading}</h2>
					{#each sec.figures.body as p, i (i)}<p>{p}</p>{/each}
					<div class="table-scroll wide">
						<table class="figures">
							<thead>
								<tr>
									<th scope="col">{copy.figures.system}</th>
									<th scope="col">{copy.figures.draft}</th>
									<th scope="col">{copy.figures.status}</th>
								</tr>
							</thead>
							<tbody>
								{#each figureLines as f (f.id)}
									<tr class:locked={f.locked}>
										<th scope="row">
											{f.name}
											{#if f.madeOf}<span class="made" lang="en" dir="ltr">{copy.figures.madeOf}: {f.madeOf}</span>{/if}
											{#if f.locked}<span class="made">{copy.figures.locked}</span>{/if}
										</th>
										<td>{fmtMd(f.md)}</td>
										<td><span class="chip" data-status={f.status}>{copy.figures.chip[f.status]}</span></td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr><th scope="row">{copy.figures.total}</th><td>{fmtMd(lines.total)}</td><td></td></tr>
							</tfoot>
						</table>
					</div>
					<p class="note">{copy.draftNotice}</p>
					<details class="sources">
						<summary>{copy.figures.sources}</summary>
						<ul>
							{#each FIGURES.rows as r (r.id)}
								<li lang="en" dir="ltr">
									<span class="src-name">{r.label_en}</span>
									<span class="mono">{fmtMd(r.amount_md)} MD</span>
									<span class="src">{#if r.url}<a href={r.url} rel="noopener noreferrer">{r.source}</a>{:else}{r.source}{/if}</span>
								</li>
							{/each}
						</ul>
					</details>
					{#if study.population_statement}<p class="note">{study.population_statement}</p>{/if}
				</section>

				<!-- 04 -->
				<section id="sec-method" class="sec">
					<p class="sec-kicker mono">{sec.method.num} / {sec.method.label}</p>
					<h2>{sec.method.heading}</h2>
					{#each sec.method.body as p, i (i)}<p>{p}</p>{/each}
					{#if instrument}<p class="note mono">{instrument.id} · {instrument.version}</p>{/if}
				</section>

				<!-- 05 -->
				<section id="sec-stored" class="sec">
					<p class="sec-kicker mono">{sec.stored.num} / {sec.stored.label}</p>
					<h2>{sec.stored.heading}</h2>
					{#each sec.stored.body as p, i (i)}<p>{p}</p>{/each}
				</section>

				<!-- 06 -->
				<section id="sec-cannot" class="sec">
					<p class="sec-kicker mono">{sec.cannot.num} / {sec.cannot.label}</p>
					<h2>{sec.cannot.heading}</h2>
					{#each sec.cannot.body as p, i (i)}<p>{p}</p>{/each}
					<ul class="cannot">
						{#each copy.cannotSay as item, i (i)}<li>{item}</li>{/each}
					</ul>
				</section>

				<!-- 07 -->
				<section id="sec-record" class="sec">
					<p class="sec-kicker mono">{sec.record.num} / {sec.record.label}</p>
					<h2>{sec.record.heading}</h2>
					{#each sec.record.body as p, i (i)}<p>{p}</p>{/each}
					<dl class="record">
						{#each copy.recordFacts as fact (fact.label)}
							<div><dt class="mono">{fact.label}</dt><dd>{fact.value}</dd></div>
						{/each}
					</dl>
					{#if copy.interimNotice}<p class="note">{copy.interimNotice}</p>{/if}
				</section>
			</div>

			<!-- 08: the closing plate. -->
			<section id="sec-take" class="plate closing">
				<div class="closing-inner">
					<p class="sec-kicker mono">{sec.take.num} / {sec.take.label}</p>
					<p class="closing-line">{copy.closing[0]}<br />{copy.closing[1]}</p>
					<h2>{sec.take.heading}</h2>
					{#each sec.take.body as p, i (i)}<p>{p}</p>{/each}
					<p><a class="cta" href={BOARD_URL}>{copy.ctaBoard}</a></p>
					<p class="mono small">{copy.ctaNote}</p>
				</div>
			</section>
		</article>
	</div>
	<div class="rail-slot">
		<Ruler scroller={scrollEl} {sections} label={copy.title} />
	</div>
</div>

<style>
	/*
	 * Archive register: Libron for reading, mono for figures and labels, one
	 * accent. Two ink plates (the opening field and the closing line) hold the
	 * page; between them a reading column with wider inserts for the board,
	 * the example and the figures.
	 */
	.frame {
		--ruler: 3.5rem;
		--col: 44rem;
		--wide: 60rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--ruler);
		block-size: 100%;
		min-block-size: 0;
		color: var(--text-primary);
		background: var(--surface-base);
	}
	.scroll {
		overflow-y: auto;
		min-block-size: 0;
		container-type: inline-size;
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	/* Section bar */
	.secbar {
		position: sticky;
		inset-block-start: 0;
		z-index: 4;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-3) var(--s-6);
		padding: var(--s-2) var(--s-6);
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
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.sec-num {
		color: var(--text-primary);
		font-weight: 700;
	}
	.secbar-end {
		display: inline-flex;
		align-items: center;
		gap: var(--s-4);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.share-btn {
		min-block-size: var(--touch);
		padding: var(--s-2) var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		cursor: pointer;
	}
	.share-btn:focus-visible,
	.cta:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* Plates */
	.plate {
		background: var(--plate-bg);
		color: var(--plate-ink);
	}
	.hero-inner {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		gap: var(--s-11);
		align-items: end;
		max-inline-size: 84rem;
		margin-inline: auto;
		padding: var(--s-12) var(--s-10) var(--s-10);
	}
	.kicker {
		margin: 0 0 var(--s-5);
		font-size: var(--t-xs);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.title {
		margin: 0 0 var(--s-7);
		font-family: var(--font-read);
		font-size: clamp(2.6rem, 6.4cqi, 5.4rem);
		font-weight: 700;
		line-height: 0.92;
		letter-spacing: -0.015em;
		text-transform: uppercase;
		text-wrap: balance;
	}
	.hook {
		margin: 0 0 var(--s-5);
		max-inline-size: 34rem;
		font-family: var(--font-read);
		font-size: var(--step-1);
		line-height: 1.35;
	}
	.cover-line {
		margin: 0 0 var(--s-8);
		max-inline-size: 34rem;
		font-size: var(--step-0);
		line-height: 1.5;
		opacity: 0.78;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-5);
		margin: 0;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		min-block-size: var(--touch);
		padding-inline: var(--s-5);
		border: 1px solid oklch(100% 0 0 / 0.28);
		font-size: var(--t-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.dot {
		inline-size: var(--s-3);
		block-size: var(--s-3);
		border-radius: var(--r-full);
		border: 1px solid currentColor;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--touch);
		padding-inline: var(--s-7);
		border-radius: var(--r-md);
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 700;
		text-decoration: none;
	}
	.hero-field {
		min-inline-size: 0;
	}

	/* Count strip */
	.strip {
		padding: var(--s-9) var(--s-10);
		background: var(--surface-raised);
		border-block-end: var(--rule);
	}
	.tally {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--s-6) var(--s-8);
		max-inline-size: 84rem;
		margin: 0 auto var(--s-6);
	}
	.tally div {
		display: grid;
		gap: var(--s-2);
		padding-block-start: var(--s-4);
		border-block-start: 2px solid var(--text-primary);
	}
	.tally dd {
		margin: 0;
		font-size: var(--t-3xl);
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.tally small,
	.fact-value small {
		margin-inline-start: var(--s-3);
		font-size: var(--t-md);
		font-weight: 500;
		color: var(--text-muted);
	}
	.tally dt {
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.strip-note {
		max-inline-size: 84rem;
		margin: 0 auto;
		font-size: var(--t-base);
		color: var(--text-secondary);
	}
	.zero {
		margin-inline-end: var(--s-4);
		padding: var(--s-1) var(--s-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-full);
		color: var(--text-primary);
	}

	/* Reading column */
	.body {
		padding: var(--s-11) var(--s-10) var(--s-12);
	}
	.sec {
		max-inline-size: var(--col);
		margin-inline: auto;
		margin-block-end: var(--s-12);
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: 1.6;
	}
	.sec-kicker {
		margin: 0 0 var(--s-4);
		font-size: var(--t-xs);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h2 {
		margin: 0 0 var(--s-6);
		font-family: var(--font-read);
		font-size: var(--step-3);
		line-height: 1.12;
		text-wrap: balance;
	}
	h3 {
		margin: var(--s-9) 0 var(--s-4);
		font-family: var(--font-read);
		font-size: var(--step-1);
		line-height: 1.25;
	}
	.sec p {
		margin: 0 0 var(--s-5);
	}
	.note {
		font-size: var(--t-base);
		color: var(--text-muted);
	}
	.wide {
		inline-size: min(var(--wide), calc(100cqi - 2 * var(--s-10)));
		margin-inline: calc((var(--col) - min(var(--wide), calc(100cqi - 2 * var(--s-10)))) / 2);
	}

	/* Facts */
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--s-8) var(--s-9);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.facts li {
		padding-block-start: var(--s-4);
		border-block-start: var(--rule);
	}
	.facts p {
		margin: 0;
	}
	.fact-value {
		font-size: var(--t-3xl);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.fact-title {
		margin-block: var(--s-3) var(--s-2) !important;
		font-weight: 700;
	}
	.fact-body {
		font-size: var(--t-md);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	/* Tables */
	.table-scroll {
		overflow-x: auto;
	}
	table {
		inline-size: 100%;
		border-collapse: collapse;
		font-family: var(--font-sans);
		font-size: var(--t-md);
	}
	th,
	td {
		padding: var(--s-4) var(--s-4);
		border-block-end: var(--rule);
		text-align: end;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		vertical-align: top;
	}
	th[scope='row'],
	thead th:first-child,
	tfoot th {
		text-align: start;
		font-family: var(--font-read);
		font-weight: 600;
	}
	thead th {
		font-size: var(--t-xs);
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	tfoot th,
	tfoot td {
		border-block-end: none;
		font-weight: 700;
	}
	.made {
		display: block;
		margin-block-start: var(--s-1);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 400;
		color: var(--text-muted);
	}
	tr.locked th,
	tr.locked td {
		color: var(--text-muted);
	}
	.chip {
		display: inline-block;
		padding: var(--s-1) var(--s-4);
		border: 1px dashed var(--border-strong);
		border-radius: var(--r-full);
		font-size: var(--t-xs);
		white-space: nowrap;
		color: var(--text-secondary);
	}
	.example {
		margin-block-start: var(--s-9);
		padding: var(--s-7);
		border-inline-start: 3px solid var(--accent);
		background: var(--surface-raised);
	}
	.example h3 {
		margin-block-start: 0;
	}
	.sources summary {
		min-block-size: var(--touch);
		display: flex;
		align-items: center;
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--t-sm);
	}
	.sources ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--t-sm);
	}
	.sources li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--s-1) var(--s-5);
		padding-block: var(--s-3);
		border-block-end: var(--rule);
	}
	.src {
		grid-column: 1 / -1;
		color: var(--text-muted);
		font-size: var(--t-sm);
	}
	.src a {
		color: inherit;
	}
	.cannot {
		padding-inline-start: var(--s-7);
	}
	.cannot li {
		margin-block-end: var(--s-3);
	}
	.record {
		display: grid;
		margin: 0;
	}
	.record div {
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		gap: var(--s-5);
		padding-block: var(--s-3);
		border-block-end: var(--rule);
	}
	.record dt {
		font-size: var(--t-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		padding-block-start: var(--s-1);
	}
	.record dd {
		margin: 0;
	}

	/* Closing plate */
	.closing {
		font-family: var(--font-read);
	}
	.closing-inner {
		max-inline-size: var(--col);
		margin-inline: auto;
		padding: var(--s-12) var(--s-10);
		font-size: var(--step-0);
		line-height: 1.6;
	}
	.closing .sec-kicker {
		color: var(--accent);
	}
	.closing-line {
		margin: 0 0 var(--s-9);
		font-size: var(--step-4);
		line-height: 1.1;
		font-weight: 700;
	}
	.closing h2 {
		font-size: var(--step-2);
	}
	.closing p {
		margin: 0 0 var(--s-5);
	}
	.small {
		font-size: var(--t-xs);
		opacity: 0.7;
	}

	.rail-slot {
		min-block-size: 0;
	}

	@container (max-width: 60rem) {
		.hero-inner {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--s-9);
			padding: var(--s-10) var(--s-6) var(--s-8);
		}
		.strip {
			padding: var(--s-8) var(--s-6);
		}
		.tally {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.body {
			padding: var(--s-10) var(--s-6) var(--s-11);
		}
		.wide {
			inline-size: auto;
			margin-inline: 0;
		}
		.closing-inner {
			padding: var(--s-11) var(--s-6);
		}
	}
	@container (max-width: 34rem) {
		.facts {
			grid-template-columns: minmax(0, 1fr);
		}
		.tally dd,
		.fact-value {
			font-size: var(--t-2xl);
		}
		.record div {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--s-1);
		}
		.example {
			padding: var(--s-5);
		}
		th,
		td {
			padding: var(--s-3) var(--s-2);
			font-size: var(--t-sm);
		}
		.secbar-status {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.frame {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail-slot {
			display: none;
		}
	}
</style>
