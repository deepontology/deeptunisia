<script lang="ts">
	import { tick } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { copyFor } from './copy';
	import { MOVABLE, LOCKED, DRAFT_ENVELOPE, MIN_PCT, MAX_PCT, STEP_PCT, BALANCE_TOLERANCE } from './lines';
	import { ROUNDS, stepMd, addedMd, cutMd, type Response } from './rounds';

	/**
	 * The citizen budget game, as a prototype.
	 *
	 * One respondent moves money between placeholder lines and balances them.
	 * Nothing is sent, stored or scored. The submit button shows the final card
	 * and stops. Every figure is a stub from lines.ts and is labelled as one.
	 */
	type Step = 'intro' | 'frame' | 'game' | 'items' | 'card' | 'out';
	type Q1 = 'lower' | 'same' | 'higher';

	const STEPS: Exclude<Step, 'out'>[] = ['intro', 'frame', 'game', 'items', 'card'];

	const c = $derived(copyFor(app.locale));
	const dir = $derived(app.locale === 'ar' ? 'rtl' : 'ltr');

	let step = $state<Step>('intro');
	let adult = $state(false);
	let understood = $state(false);
	let pct = $state<Record<string, number>>(Object.fromEntries(MOVABLE.map((l) => [l.id, 100])));
	let q1 = $state<Q1 | null>(null);
	let q2 = $state<number | null>(null);
	let headingEl = $state<HTMLElement | undefined>(undefined);

	const stepIndex = $derived(step === 'out' ? -1 : STEPS.indexOf(step));
	const unit = $derived(c.unit);

	const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
	const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
	const pctSigned = (p: number) => (p > 100 ? '+' : p < 100 ? '−' : '') + Math.abs(p - 100) + '%';

	const rows = $derived(
		MOVABLE.map((line) => {
			const p = pct[line.id];
			const amount = (line.draft * p) / 100;
			return { line, p, amount, delta: amount - line.draft };
		})
	);

	const spent = $derived(rows.reduce((sum, r) => sum + r.amount, 0));
	const gap = $derived(spent - DRAFT_ENVELOPE);
	const tolerance = DRAFT_ENVELOPE * BALANCE_TOLERANCE;
	const balanced = $derived(Math.abs(gap) <= tolerance);
	const overBy = $derived(gap > tolerance ? gap : 0);
	const underBy = $derived(gap < -tolerance ? -gap : 0);
	const kept = $derived(MOVABLE.every((l) => pct[l.id] === 100));

	const LOCKED_TOTAL = LOCKED.reduce((sum, l) => sum + l.draft, 0);
	const TOTAL_DRAFT = DRAFT_ENVELOPE + LOCKED_TOTAL;

	const meterMax = DRAFT_ENVELOPE * 1.5;
	const fillPct = $derived(Math.min(spent / meterMax, 1) * 100);
	const targetPct = (DRAFT_ENVELOPE / meterMax) * 100;

	const balanceText = $derived(
		balanced
			? c.game.balanced
			: overBy > 0
				? c.game.borrow(fmt(overBy))
				: c.game.leftover(fmt(underBy))
	);

	const Q1_OPTIONS: [Q1, string][] = $derived([
		['lower', c.items.q1Lower],
		['same', c.items.q1Same],
		['higher', c.items.q1Higher]
	]);
	const SCALE = Array.from({ length: 11 }, (_, n) => n);

	function go(next: Step) {
		step = next;
		void tick().then(() => headingEl?.focus());
	}

	function start() {
		go(adult ? 'frame' : 'out');
	}

	function setPct(id: string, value: number) {
		pct[id] = value;
	}

	function resetDraft() {
		for (const l of MOVABLE) pct[l.id] = 100;
	}

	/** The round state. `round` is the index of the round on screen; 5 means the year is done. */
	let round = $state(0);
	let choices = $state<(string | null)[]>([null, null, null, null, null]);
	const roundDone = $derived(round < ROUNDS.length && choices[round] !== null);
	const current = $derived(ROUNDS[Math.min(round, ROUNDS.length - 1)]);
	const yearDone = $derived(round >= ROUNDS.length);

	/** Each response is a set of whole 5% steps; a step moves the line by 5 points of its draft. */
	function choose(resp: Response) {
		if (roundDone) return;
		for (const m of resp.moves) pct[m.line] = pct[m.line] + m.steps * 5;
		choices[round] = resp.id;
	}

	function nextRound() {
		round += 1;
	}

	function startYear() {
		resetDraft();
		round = 0;
		choices = [null, null, null, null, null];
	}

	/** Dinars still asked for by the round on screen; zero once answered. */
	const stillToFind = $derived(!yearDone && !roundDone && current.amountMd > 0 ? current.amountMd : 0);
	const cutSoFar = $derived(MOVABLE.reduce((sum, l) => sum + (pct[l.id] < 100 ? (l.draft * (100 - pct[l.id])) / 100 : 0), 0));
	const addedSoFar = $derived(MOVABLE.reduce((sum, l) => sum + (pct[l.id] > 100 ? (l.draft * (pct[l.id] - 100)) / 100 : 0), 0));
	const linesCut = $derived(MOVABLE.filter((l) => pct[l.id] < 100).length);
	const linesAdded = $derived(MOVABLE.filter((l) => pct[l.id] > 100).length);
	/** Lines cut in two or more rounds: a scar, shown in words. */
	const scars = $derived(
		MOVABLE.map((l) => ({
			id: l.id,
			times: ROUNDS.filter((r, i) => {
				const chosen = r.responses.find((x) => x.id === choices[i]);
				return chosen?.moves.some((m) => m.line === l.id && m.steps < 0);
			}).length
		})).filter((x) => x.times >= 2)
	);
	function movesText(resp: Response): string {
		return resp.moves
			.map((m) => {
				const md = Math.abs(m.steps) * stepMd(m.line);
				return `${c.lines[m.line].name} ${m.steps > 0 ? '+' : '\u2212'}${fmt(md)} ${unit}`;
			})
			.join(' · ');
	}
	function outcome(resp: Response): string {
		if (resp.moves.length === 0) return resp.consequence;
		const added = addedMd(resp);
		const cut = cutMd(resp);
		return `${fmt(added)} ${unit} moved from ${fmt(cut)} ${unit} of cuts. ${resp.consequence}`;
	}

	function restart() {
		startYear();
		q1 = null;
		q2 = null;
		adult = false;
		understood = false;
		go('intro');
	}
</script>

<div class="game research-type" {dir} lang={app.locale}>
	<header class="hero">
		<p class="chip">{c.prototype}</p>
		<h1>{c.title}</h1>
		<p class="status">{c.status}</p>
		{#if c.unreviewed}
			<p class="unreviewed">{c.unreviewed}</p>
		{/if}
	</header>

	{#if step !== 'out'}
		<ol class="steps" aria-label={c.title}>
			{#each STEPS as s, i (s)}
				<li class:done={i < stepIndex} aria-current={i === stepIndex ? 'step' : undefined}>
					{c.stepLabels[s]}
				</li>
			{/each}
		</ol>
	{/if}

	{#if step === 'intro'}
		<section class="block" aria-labelledby="h-about">
			<h2 id="h-about">{c.intro.whatWeAsk}</h2>
			<p>{c.intro.whatWeAskBody}</p>

			<h3>{c.intro.stored}</h3>
			<p>{c.intro.storedBody}</p>

			<h3>{c.intro.who}</h3>
			<p>{c.intro.whoBody}</p>

			<h3>{c.intro.figures}</h3>
			<p>{c.intro.figuresBody}</p>

			<h3>{c.intro.sample}</h3>
			<p>{c.intro.sampleBody}</p>
		</section>

		<form class="consent" onsubmit={(e) => { e.preventDefault(); start(); }}>
			<label class="check">
				<input type="checkbox" bind:checked={adult} />
				<span>{c.intro.consentAge}</span>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={understood} />
				<span>{c.intro.consentPrototype}</span>
			</label>
			<div class="actions">
				<button class="cta" type="submit" disabled={!understood}>{c.intro.start}</button>
			</div>
		</form>
	{/if}

	{#if step === 'out'}
		<section class="block" aria-live="polite">
			<p>{c.intro.under18}</p>
		</section>
	{/if}

	{#if step === 'frame'}
		<section class="block" aria-labelledby="h-frame">
			<h2 id="h-frame" bind:this={headingEl} tabindex="-1">{c.frame.title}</h2>
			<p>{c.frame.body}</p>
			<h3>{c.frame.factsHeading}</h3>
			<ul class="facts">
				<li>{c.frame.fact1(fmt(TOTAL_DRAFT))}</li>
				<li>{c.frame.fact2}</li>
				<li>{c.frame.fact3}</li>
			</ul>
			<p class="note">{c.frame.placeholder}</p>
			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('intro')}>{c.frame.back}</button>
				<button class="cta" type="button" onclick={() => go('game')}>{c.frame.next}</button>
			</div>
		</section>
	{/if}

	{#if step === 'game'}
		<section class="block game-panel" aria-labelledby="h-game">
			<div class="meter-wrap">
				<div
					class="meter"
					role="meter"
					aria-label={c.game.meterLabel}
					aria-valuemin="0"
					aria-valuemax={Math.round(meterMax)}
					aria-valuenow={Math.round(spent)}
					aria-valuetext={balanceText}
				>
					<span class="meter-fill" class:over={overBy > 0} class:under={underBy > 0} class:ok={balanced} style:inline-size="{fillPct}%"></span>
					<span class="meter-target" style:inset-inline-start="{targetPct}%"></span>
				</div>
				<p class="balance" class:ok={balanced} class:over={overBy > 0} role="status" aria-live="polite">{balanceText}</p>
				<dl class="gauges">
					<div>
						<dt>Still to find</dt>
						<dd>{fmt(stillToFind)} {unit}</dd>
					</div>
					<div>
						<dt>Cut so far</dt>
						<dd>{fmt(cutSoFar)} {unit} from {linesCut} {linesCut === 1 ? 'line' : 'lines'}</dd>
					</div>
					<div>
						<dt>Added so far</dt>
						<dd>{fmt(addedSoFar)} {unit} to {linesAdded} {linesAdded === 1 ? 'line' : 'lines'}</dd>
					</div>
				</dl>
			</div>

			<h2 id="h-game" bind:this={headingEl} tabindex="-1">{c.game.title}</h2>
			<ol class="rounds" aria-label="Rounds">
				{#each ROUNDS as r, i (r.id)}
					<li class:done={choices[i] !== null} class:current={i === round && !yearDone}>
						<span class="sr-only">Round {r.id}</span>{r.id}
					</li>
				{/each}
			</ol>

			{#if !yearDone}
				<article class="pressure" aria-labelledby="h-pressure">
					<p class="round-no">Round {current.id} of {ROUNDS.length}</p>
					<h3 id="h-pressure">{current.headline}</h3>
					<p>{current.body}</p>
					{#if app.locale !== 'en'}
						<p class="note">This round text is in English for now. Translation is pending review.</p>
					{/if}
				</article>

				<fieldset class="responses" disabled={roundDone}>
					<legend>Choose one response</legend>
					{#each current.responses as resp (resp.id)}
						<button
							class="response"
							class:chosen={choices[round] === resp.id}
							type="button"
							onclick={() => choose(resp)}
						>
							<span class="resp-label">{resp.label}</span>
							<span class="resp-pays">{resp.pays}</span>
							{#if resp.moves.length > 0}
								<span class="resp-moves">{movesText(resp)}</span>
							{/if}
							<span class="resp-cons">{resp.consequence} <em>Illustrative, not a forecast.</em></span>
						</button>
					{/each}
				</fieldset>

				{#if roundDone}
					{@const chosen = current.responses.find((x) => x.id === choices[round])}
					<div class="result" role="status" aria-live="polite">
						<span class="stamp">{chosen && chosen.moves.length > 0 ? 'Funded' : 'Not funded'}</span>
						{#if chosen}<p>{outcome(chosen)}</p>{/if}
						<button class="cta" type="button" onclick={nextRound}>
							{round + 1 < ROUNDS.length ? 'Next round' : 'Close the year'}
						</button>
					</div>
				{/if}
			{:else}
				<section class="year-end" aria-labelledby="h-year">
					<h3 id="h-year">The year is closed</h3>
					<ol class="decisions">
						{#each ROUNDS as r, i (r.id)}
							{@const chosen = r.responses.find((x) => x.id === choices[i])}
							<li>
								<strong>Round {r.id}: {r.headline}.</strong>
								{chosen ? chosen.label : 'No response'}. {chosen ? chosen.consequence : ''}
							</li>
						{/each}
					</ol>
					{#if scars.length > 0}
						<div class="scars" role="note">
							<p>Cut in more than one round:</p>
							<ul>
								{#each scars as sc (sc.id)}
									<li>{c.lines[sc.id].name}: cut in {sc.times} rounds.</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			{/if}

			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('frame')}>{c.game.back}</button>
				<button class="quiet" type="button" onclick={startYear}>Start the year again</button>
				<button class="cta" type="button" disabled={!yearDone || !balanced} onclick={() => go('items')}>{c.game.next}</button>
			</div>
		</section>
	{/if}

	{#if step === 'items'}
		<section class="block">
			<h2 bind:this={headingEl} tabindex="-1">{c.items.title}</h2>

			<fieldset class="q">
				<legend>{c.items.q1}</legend>
				<div class="options">
					{#each Q1_OPTIONS as [value, label] (value)}
						<label class="opt">
							<input type="radio" name="q1" {value} checked={q1 === value} onchange={() => (q1 = value)} />
							<span>{label}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset class="q">
				<legend>{c.items.q2}</legend>
				<div class="scale">
					{#each SCALE as n (n)}
						<button
							class="pill"
							type="button"
							aria-pressed={q2 === n}
							onclick={() => (q2 = n)}
						>{n}</button>
					{/each}
				</div>
				<p class="note scale-ends"><span>{c.items.q2Low}</span><span>{c.items.q2High}</span></p>
			</fieldset>

			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('game')}>{c.items.back}</button>
				<button class="cta" type="button" onclick={() => go('card')}>{c.items.submit}</button>
			</div>
		</section>
	{/if}

	{#if step === 'card'}
		<section class="block">
			<h2 id="h-card" bind:this={headingEl} tabindex="-1">{c.card.title}</h2>
			<p class="note">{c.card.note}</p>
			{#if kept}
				<p>{c.card.keptDraft}</p>
			{/if}

			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="table-scroll" role="region" tabindex="0" aria-labelledby="h-card">
				<table class="card-table">
					<thead>
						<tr>
							<th scope="col">{c.game.rowsLabel}</th>
							<th scope="col" class="num">{c.game.draft}</th>
							<th scope="col" class="num">{c.game.yours}</th>
							<th scope="col" class="num">{c.game.change}</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as r (r.line.id)}
							<tr>
								<th scope="row">{c.lines[r.line.id].name}</th>
								<td class="num">{fmt(r.line.draft)}</td>
								<td class="num">{fmt(r.amount)}</td>
								<td class="num">{signed(r.delta)}</td>
							</tr>
						{/each}
						{#each LOCKED as l (l.id)}
							<tr class="locked-row">
								<th scope="row">{c.lines[l.id].name}</th>
								<td class="num">{fmt(l.draft)}</td>
								<td class="num">{fmt(l.draft)}</td>
								<td class="num">0</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<th scope="row">{c.card.total} ({unit})</th>
							<td class="num">{fmt(TOTAL_DRAFT)}</td>
							<td class="num">{fmt(spent + LOCKED_TOTAL)}</td>
							<td class="num">{signed(spent - DRAFT_ENVELOPE)}</td>
						</tr>
					</tfoot>
				</table>
			</div>

			<p class="note">{c.card.stop}</p>
			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('game')}>{c.card.back}</button>
				<button class="cta" type="button" onclick={restart}>{c.card.restart}</button>
			</div>
		</section>
	{/if}
</div>

<style>
	.game {
		max-width: 46rem;
		margin-inline: auto;
		padding: var(--s-9) var(--s-6) var(--s-11);
		color: var(--text-primary);
	}
	.hero {
		margin-block-end: var(--s-8);
	}
	.chip {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--accent-text);
		background: var(--accent);
		border-radius: var(--r-full);
		padding: var(--s-1) var(--s-4);
		margin-block-end: var(--s-4);
	}
	h1 {
		font-size: var(--step-3);
		line-height: var(--lh-tight);
		margin: 0 0 var(--s-3);
	}
	h2 {
		font-size: var(--step-2);
		line-height: var(--lh-tight);
		margin: var(--s-8) 0 var(--s-4);
	}
	h3 {
		font-size: var(--step-0);
		margin: var(--s-6) 0 var(--s-2);
	}
	h2:focus,
	h3:focus {
		outline: none;
	}
	p {
		margin: 0 0 var(--s-4);
		max-inline-size: var(--measure);
	}
	.status,
	.note {
		color: var(--text-muted);
		font-size: var(--t-md);
	}
	.unreviewed {
		color: var(--rupture);
		font-size: var(--t-md);
	}
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-5);
		list-style: none;
		padding: 0;
		margin: 0 0 var(--s-6);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.steps li[aria-current='step'] {
		color: var(--accent);
	}
	.steps li.done {
		color: var(--text-muted);
	}
	.block {
		border-block-start: var(--rule);
		padding-block-start: var(--s-2);
	}
	.facts {
		margin: 0 0 var(--s-4);
		padding-inline-start: var(--s-6);
		max-inline-size: var(--measure);
	}
	.facts li {
		margin-block-end: var(--s-2);
	}
	.consent {
		margin-block: var(--s-7);
		padding: var(--s-6);
		background: var(--surface-raised);
		border: var(--rule);
		border-radius: var(--r-lg);
	}
	.check {
		display: flex;
		align-items: flex-start;
		gap: var(--s-4);
		margin-block-end: var(--s-4);
		min-block-size: var(--touch);
	}
	.check input {
		inline-size: 1.1rem;
		block-size: 1.1rem;
		accent-color: var(--accent);
		flex: none;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-4);
		align-items: center;
		margin-block-start: var(--s-6);
	}
	button {
		font: inherit;
		min-block-size: var(--touch);
		min-inline-size: var(--touch);
		padding: var(--s-3) var(--s-6);
		border-radius: var(--r-md);
		cursor: pointer;
		border: var(--rule);
		background: var(--surface-raised);
		color: var(--text-primary);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button:focus-visible,
	input:focus-visible,
	[tabindex='0']:focus-visible {
		outline: var(--s-1) solid var(--accent);
		outline-offset: var(--s-1);
	}
	.cta {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}
	.quiet {
		background: transparent;
	}

	/* Balance meter: sticky on phone so the balance stays in view while moving lines. */
	.meter-wrap {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--z-view);
		background: var(--surface-base);
		padding-block: var(--s-4);
		border-block-end: var(--rule);
	}
	.meter {
		position: relative;
		block-size: var(--s-5);
		background: var(--surface-sunken);
		border: var(--rule);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.meter-fill {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		background: var(--text-muted);
		transition: inline-size var(--dur-normal) var(--ease-out);
	}
	.meter-fill.ok {
		background: var(--accent);
	}
	.meter-fill.over {
		background: var(--rupture);
	}
	.meter-target {
		position: absolute;
		inset-block: 0;
		inline-size: var(--s-1);
		background: var(--text-primary);
	}
	.balance {
		margin: var(--s-3) 0 var(--s-1);
		font-weight: 600;
		color: var(--text-secondary);
	}
	.balance.ok {
		color: var(--accent);
	}
	.balance.over {
		color: var(--rupture);
	}

	.q {
		border: 0;
		margin: var(--s-6) 0;
		padding: 0;
		min-inline-size: 0;
	}
	.q legend {
		font-weight: 600;
		margin-block-end: var(--s-3);
		max-inline-size: var(--measure);
	}
	.options,
	.scale {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}
	.opt {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		min-block-size: var(--touch);
		min-inline-size: var(--touch);
		padding-inline: var(--s-4);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		cursor: pointer;
	}
	.pill {
		min-inline-size: var(--touch);
		min-block-size: var(--touch);
		padding: var(--s-2) var(--s-3);
		font-variant-numeric: tabular-nums;
	}
	.pill[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.scale-ends {
		display: flex;
		justify-content: space-between;
		gap: var(--s-4);
		margin-block-start: var(--s-2);
	}

	.table-scroll {
		overflow-x: auto;
		margin-block: var(--s-4);
	}
	.card-table {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
	}
	.card-table th,
	.card-table td {
		padding: var(--s-3) var(--s-3);
		border-block-end: var(--rule);
		text-align: start;
	}
	.card-table .num {
		text-align: end;
	}
	.card-table thead th {
		color: var(--text-muted);
		font-weight: 600;
	}
	.card-table tfoot th,
	.card-table tfoot td {
		font-weight: 700;
		border-block-end: 0;
	}
	.card-table .locked-row th {
		color: var(--text-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.meter-fill,
		.stamp {
			transition: none;
			animation: none;
		}
	}

	/* Rounds: gauges, pressure card, responses, result and the year's end. */
	.gauges {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--s-3);
		margin: var(--s-3) 0 0;
		font-variant-numeric: tabular-nums;
	}
	.gauges dt {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.gauges dd {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-primary);
	}
	.rounds {
		display: flex;
		gap: var(--s-3);
		list-style: none;
		padding: 0;
		margin: var(--s-5) 0 var(--s-4);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
	}
	.rounds li {
		min-inline-size: var(--touch);
		text-align: center;
		padding: var(--s-2) 0;
		border: var(--rule);
		border-radius: var(--r-full);
		color: var(--text-faint);
	}
	.rounds li.current {
		color: var(--accent);
		border-color: var(--accent);
	}
	.rounds li.done {
		color: var(--text-primary);
		background: var(--surface-raised);
	}
	.pressure {
		border-inline-start: 3px solid var(--accent);
		padding-inline-start: var(--s-5);
		margin-block: var(--s-4) var(--s-6);
	}
	.pressure h3 {
		font-size: var(--step-2);
		margin: var(--s-1) 0 var(--s-3);
	}
	.round-no {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0;
	}
	.responses {
		border: 0;
		padding: 0;
		margin: 0;
		min-inline-size: 0;
		display: grid;
		gap: var(--s-4);
	}
	.responses legend {
		font-weight: 600;
		margin-block-end: var(--s-3);
	}
	.response {
		display: grid;
		gap: var(--s-2);
		text-align: start;
		inline-size: 100%;
		padding: var(--s-5);
		background: var(--surface-raised);
		border: var(--rule);
		border-radius: var(--r-lg);
	}
	.response:disabled {
		opacity: 0.55;
	}
	.response.chosen {
		border-color: var(--accent);
		opacity: 1;
	}
	.resp-label {
		font-weight: 600;
		font-size: var(--step-0);
	}
	.resp-pays,
	.resp-moves {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.resp-cons {
		color: var(--text-secondary);
		font-size: var(--t-sm);
	}
	.resp-cons em {
		color: var(--text-faint);
	}
	.result {
		margin-block: var(--s-6);
		padding: var(--s-5);
		border-block-start: var(--rule);
	}
	.stamp {
		display: inline-block;
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
		border: 2px solid var(--accent);
		padding: var(--s-1) var(--s-3);
		border-radius: var(--r-sm);
	}
	.year-end {
		margin-block: var(--s-6);
	}
	.decisions {
		padding-inline-start: var(--s-6);
		max-inline-size: var(--measure);
	}
	.decisions li {
		margin-block-end: var(--s-3);
	}
	.scars {
		padding: var(--s-4);
		border: var(--rule);
		border-radius: var(--r-md);
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
