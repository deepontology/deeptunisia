<script lang="ts">
	import { app } from '$lib/state.svelte';
	import Plate from '$lib/index-study/Plate.svelte';
	import Ruler from '$lib/index-study/Ruler.svelte';
	import { FIGURES, STATUS_WORDS } from './figures';

	/**
	 * The landing page of the citizen budget study. It follows the structure of
	 * the police index landing (plate, cover, numbered sections, scroll ruler,
	 * honest states) and carries its own artwork and its own nouns.
	 *
	 * The study is in design: nothing is collected. Every figure is a draft
	 * figure with its status beside it. The page is in English until the
	 * translations are reviewed, and says so.
	 */
	let { study, instrument }: { study: { slug: string; title_en: string; population_statement: string | null; status: string }; instrument: { id: string; version: string } | null } = $props();

	const locale = $derived(app.locale);
	let scrollEl = $state<HTMLElement | null>(null);

	const sections = [
		{ id: 'sec-question', num: '01', label: 'The question' },
		{ id: 'sec-game', num: '02', label: 'The game' },
		{ id: 'sec-figures', num: '03', label: 'The figures' },
		{ id: 'sec-method', num: '04', label: 'Method' },
		{ id: 'sec-stored', num: '05', label: 'What is stored' },
		{ id: 'sec-limits', num: '06', label: 'What it cannot say' },
		{ id: 'sec-record', num: '07', label: 'Record' },
		{ id: 'sec-take', num: '08', label: 'Take part' }
	];

	const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });
	const rows = $derived(FIGURES.rows.filter((r) => !r.memo));
	const memo = $derived(FIGURES.rows.filter((r) => r.memo));
	const rowSum = $derived(rows.reduce((s, r) => s + r.amount_md, 0));
</script>

<svelte:head>
	<title>{study.title_en} · DeepTunisia</title>
	<meta name="description" content="A citizen budget study for 2027. In design: not collecting responses. Figures are drafts, not verified." />
</svelte:head>

<div class="frame research-type" class:rtl={locale === 'ar'}>
<div class="scroll" bind:this={scrollEl}>
	<div class="secbar mono">
		<span class="secbar-end">CBG · 2027 · IN DESIGN</span>
	</div>

	<article class="pti">
		<!-- Plate: our own 1-bit artwork, not the police study's. -->
		<Plate name="cb-1" width={1600} height={900} eager focus="50% 40%" class="plate-hero">
			<div class="cover">
				<p class="cover-kicker mono">Deeptunisia research · 003 · one-off budget study</p>
				<h1 class="cover-title">Citizen budget 2027</h1>
				<p class="cover-line">
					Rebuild the 2027 state budget as a citizen. See what each choice gives up. Nothing you do is scored.
				</p>
				<p class="cover-meta mono">
					<span class="cover-tag">In design · not collecting</span>
				</p>
			</div>
		</Plate>

		<div class="body">
			<p class="honest">
				Not collecting responses yet. The question, the figures and the rules are published below.
			</p>
			<p class="cta-row">
				<a class="cta" href="/research/citizen-budget/prototype">Open the prototype</a>
				<span class="note">Placeholder figures. Nothing is sent or stored.</span>
			</p>

			<section id="sec-question" class="sec">
				<p class="kicker mono">01 / The question</p>
				<h2>How would you move money, as a citizen?</h2>
				<p>
					The study asks how you would move money between the lines of the 2027 state budget, and how far that
					changes what the state gives up elsewhere. About five minutes. Five rounds, each with a pressure on the
					budget and three responses. Each response names what it pays for and who pays.
				</p>
			</section>

			<section id="sec-game" class="sec">
				<p class="kicker mono">02 / The game</p>
				<h2>Five rounds, one budget, no score</h2>
				<p>
					The total never changes. A fuel subsidy, a hospital wave, a good harvest, a regional road bill, a court
					order: each one is paid for by cutting something else. The rounds record what you chose. They do not
					score it, rank you, or say which choice was right.
				</p>
				<p>
					Each consequence line is illustrative and is not a forecast. It is written to make the trade visible, and
					it is reviewed before fielding.
				</p>
			</section>

			<section id="sec-figures" class="sec">
				<p class="kicker mono">03 / The figures</p>
				<h2>Draft figures, with their status</h2>
				<p>
					Every figure below is a draft, taken from press reports of the 2027 draft budget between 21 October and 9
					November 2026. None has been checked against the official document: the finance ministry site held
					2024 to 2026 files only on the check date. The study will not freeze on a figure until it has a page
					reference in the adopted law.
				</p>
				<p class="note">
					Total spending excluding debt principal, draft: {fmt(FIGURES.total_md)} MD. Rows sum to {fmt(Math.round(rowSum * 10) / 10)} MD.
					Subsidies are a memo inside the Industry and Trade lines, so they are not added.
				</p>
				<div class="table-scroll">
					<table class="figures">
						<caption class="sr-only">Draft 2027 figures by line, with status</caption>
						<thead>
							<tr>
								<th scope="col">Line</th>
								<th scope="col" class="num">MD (draft)</th>
								<th scope="col">Status</th>
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
									<td>{STATUS_WORDS[r.status]} Memo, not added.</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="note">Source for each row: the press reports named in the study file. Checked {FIGURES.checked}.</p>
			</section>

			<section id="sec-method" class="sec">
				<p class="kicker mono">04 / Method</p>
				<h2>How the answers will be read</h2>
				<p>
					For each line: the share of respondents who would give it more, the same, or less than its draft, and the
					median change with its interquartile range. The average budget submitted, with a bootstrap interval. A
					consensus measure. A result without the largest link channel. Results are shown only above 100 valid
					answers, and no cell under 20 is shown.
				</p>
				<p>
					Population: {study.population_statement ?? 'Among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not Tunisians as a whole.'}
				</p>
				{#if instrument}
					<p class="note mono">Instrument {instrument.id} · {instrument.version} · not frozen</p>
				{/if}
			</section>

			<section id="sec-stored" class="sec">
				<p class="kicker mono">05 / What is stored</p>
				<h2>Only what the answers need</h2>
				<p>
					Stored per response: your budget as a share of each line, two short answers, optional region, the study
					version and locale, the channel that brought you, timings, and a random receipt code.
				</p>
				<p>
					Never stored: your name, email, IP address, device details, location beyond the optional region, or free
					text. The prototype stores nothing.
				</p>
			</section>

			<section id="sec-limits" class="sec">
				<p class="kicker mono">06 / What it cannot say</p>
				<h2>What these answers are not</h2>
				<ul>
					<li>Not what Tunisians as a whole want.</li>
					<li>Not what the budget should be, or whether any line is wasteful.</li>
					<li>Not a ranking of respondents, or of their choices.</li>
					<li>
						Open, self-selected, online. Organised groups can take part and can inflate their own line. That is
						real opinion, and it will be read as organised opinion.
					</li>
				</ul>
			</section>

			<section id="sec-record" class="sec">
				<p class="kicker mono">07 / Record</p>
				<h2>The status, stated plainly</h2>
				<dl class="facts">
					<dt>Stage</dt><dd>Design. The study is not open.</dd>
					<dt>Ethics review</dt><dd>None has taken place.</dd>
					<dt>Data-protection review</dt><dd>None has taken place. The legal brief is a draft that asks counsel questions. It is not an opinion.</dd>
					<dt>Preregistration</dt><dd>Drafted, not registered.</dd>
					<dt>Principal investigator</dt><dd>Not named.</dd>
					<dt>Figures</dt><dd>Draft, press-reported, not verified.</dd>
					<dt>Translation</dt><dd>English only for now. French and Arabic are drafts pending review.</dd>
				</dl>
			</section>

			<section id="sec-take" class="sec">
				<p class="kicker mono">08 / Take part</p>
				<h2>Not open yet</h2>
				<p>
					There is nothing to submit. You can try the prototype, which stores nothing and uses placeholder figures.
				</p>
				<p><a class="cta" href="/research/citizen-budget/prototype">Open the prototype</a></p>
			</section>
		</div>
	</article>
</div>
<Ruler scroller={scrollEl} {sections} label="Sections of the citizen budget study" />
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
	.honest {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		border-inline-start: 3px solid var(--accent);
		padding-inline-start: var(--s-4);
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
	.table-scroll {
		overflow-x: auto;
		margin-block: var(--s-5);
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
