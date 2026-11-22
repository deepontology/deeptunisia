<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { FIGURES } from '$lib/budget-study/figures';
	import { copyFor } from './copy';
	import { linesFrom } from './lines';
	import { DEFAULT_RULE, heldMd, toAllocation, type Board, type BoardState, type MoveRule, type StartMode } from './board';
	import BudgetBoard from './BudgetBoard.svelte';
	import { fmtMd, signed } from './SystemRow.svelte';
	import { boardCopyFor } from './board-copy';
	import { startProofOfWork, type BotCheck } from '$lib/pow';
	import {
		budgetAnswers,
		channelFromLocation,
		readLiveStudy,
		submissionPayload,
		submitResponse,
		tunisiaMonth,
		type Assignment
	} from '$lib/research-submit';
	import type { RuntimeInstrument, StudyRecord } from '$lib/research';

	/**
	 * The citizen budget board: consent, framing, the Treasury board, two
	 * questions, and the result card.
	 *
	 * The result card is the submission step. On a draft start it posts the
	 * board's answers to the study's submit route and shows what the server
	 * said: a real receipt when the study is accepting, or one honest line when
	 * it is in design or the gate is closed. The empty-purse view is a prototype
	 * only and posts nothing. The build-time study renders the page with no API;
	 * the live read decides which state the page is in.
	 */
	let {
		start = 'draft',
		rule = DEFAULT_RULE,
		study,
		instrument,
		onstep
	}: {
		start?: StartMode;
		rule?: MoveRule;
		study: StudyRecord;
		instrument: RuntimeInstrument | null;
		onstep?: (step: string) => void;
	} = $props();

	type Step = 'intro' | 'frame' | 'board' | 'items' | 'card' | 'out';
	type Phase = 'idle' | 'sending' | 'sent' | 'refused' | 'not-open' | 'too-fast' | 'failed';
	const STEPS: Exclude<Step, 'out'>[] = ['intro', 'frame', 'board', 'items', 'card'];

	const c = $derived(copyFor(app.locale));
	const t = $derived(boardCopyFor(app.locale));
	const dir = $derived(app.locale === 'ar' ? 'rtl' : 'ltr');
	const lines = linesFrom(FIGURES.rows);
	const board: Board = { lines };
	const unit = $derived(c.unit);
	const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

	let step = $state<Step>('intro');
	let adult = $state(false);
	let readInfo = $state(false);
	let withdrawal = $state(false);
	let result = $state<BoardState | null>(null);
	let q1 = $state<'lower' | 'same' | 'higher' | 'skip' | null>(null);
	let q2 = $state<number | null>(null);
	let q2Skipped = $state(false);
	let region = $state<string>('');
	let showUnchanged = $state(false);
	let headingEl = $state<HTMLElement | undefined>(undefined);
	let openedAt = $state(Date.now());

	// The live study and the submission.
	let liveStudy = $state<StudyRecord | null>(null);
	let liveInstrument = $state<RuntimeInstrument | null>(null);
	let assignment = $state<Assignment | null>(null);
	let check: Promise<BotCheck> | null = null;
	let phase = $state<Phase>('idle');
	let receipt = $state<string | null>(null);
	let sending = $state(false);
	const answeredKey = 'deeptunisia:research:citizen-budget:answered';
	let answeredMonth = $state<string | null>(null);

	// The optional human check. Off by default; the challenge carries its public
	// site key only when the operator has switched it on.
	interface Turnstile {
		render(container: HTMLElement, options: { sitekey: string; callback?: (token: string) => void }): string;
		reset(widgetId?: string): void;
	}
	const turnstileApi = (): Turnstile | undefined => (window as Window & { turnstile?: Turnstile }).turnstile;
	let turnstileSiteKey = $state<string | null>(null);
	let turnstileToken = $state<string | null>(null);
	let turnstileBox = $state<HTMLDivElement | null>(null);
	let widgetId = $state<string | null>(null);
	let widgetInto = $state<HTMLDivElement | null>(null);
	let turnstileLoaded = $state(false);
	let tokenReady: (() => void) | null = null;

	const currentStudy = $derived(liveStudy ?? study);
	const currentInstrument = $derived(liveInstrument ?? instrument);
	const studyStatus = $derived(currentStudy?.status ?? 'design');
	const accepting = $derived(currentStudy?.accepting ?? (studyStatus === 'fielding'));
	const studyState = $derived<'design' | 'paused' | 'accepting'>(
		studyStatus === 'fielding' ? (accepting ? 'accepting' : 'paused') : 'design'
	);
	const design = $derived(studyState === 'design');
	const stateChip = $derived(design ? c.prototype : c.study.chip);
	const stateStatus = $derived(
		studyState === 'accepting' ? c.study.statusAccepting : studyState === 'paused' ? c.study.statusPaused : c.status
	);
	const storedBody = $derived(design ? c.intro.storedBody : c.study.storedBody);
	const whoBody = $derived(design ? c.intro.whoBody : c.study.whoBody);
	const consentWithdrawal = $derived(design ? c.intro.consentWithdrawal : c.study.consentWithdrawal);
	const consentNote = $derived(design ? c.intro.consentNote : c.study.consentNote);
	const cardNote = $derived(design ? c.card.note : c.study.cardNote);
	const itemsSubmitLabel = $derived(
		start === 'empty' || design ? c.items.submit : sending ? c.study.sending : c.study.submit
	);
	const answeredThisMonth = $derived(answeredMonth !== null && answeredMonth === tunisiaMonth());

	/** The governorate options and their labels, read from the instrument so the stored ids are its ids. */
	const regionItem = $derived(currentInstrument?.items.find((item) => item.id === 'demo_governorate'));
	const regionLabel = (id: string): string =>
		regionItem?.optionLabels?.[app.locale === 'fr' || app.locale === 'ar' ? app.locale : 'en']?.[id] ??
		regionItem?.optionLabels?.en?.[id] ??
		id;

	const stepIndex = $derived(step === 'out' ? -1 : STEPS.indexOf(step));

	function go(next: Step) {
		step = next;
		onstep?.(next);
		void tick().then(() => headingEl?.focus());
	}

	function onfinish(state: BoardState) {
		result = state;
		go('items');
	}

	const answer = $derived(result ? toAllocation(board, result) : null);
	const kept = $derived(answer ? answer.kept_draft === true : false);
	const rows = $derived(
		lines.movable.map((l) => {
			// The exact amount on the board, so the result reads the same figures the citizen saw.
			const amount = result ? heldMd(board, result, l.id) : l.draft;
			return { line: l, amount, delta: amount - l.draft };
		})
	);
	const spentTotal = $derived(rows.reduce((s, r) => s + r.amount, 0) + lines.locked.reduce((s, l) => s + l.draft, 0));
	const draftTotal = $derived(lines.total);

	/** Every system the citizen changed, most money gained first and most lost last. */
	const changed = $derived(
		rows
			.filter((r) => Math.abs(r.delta) >= 0.5)
			.map((r) => ({ ...r, pct: (r.delta / r.line.draft) * 100 }))
			.sort((a, b) => b.delta - a.delta)
	);
	const unchanged = $derived(rows.filter((r) => Math.abs(r.delta) < 0.5).map((r) => c.lines[r.line.id].name));
	const unchangedNames = $derived(unchanged.join(app.locale === 'ar' ? '، ' : ', '));
	/** Money moved: what the gaining systems received, which is what the others gave up. */
	const moved = $derived(rows.reduce((s, r) => s + Math.max(0, r.delta), 0));
	const gaining = $derived(changed.filter((r) => r.delta > 0).length);
	const movesCount = $derived(result ? result.log.filter((e) => e.kind !== 'keep').length : 0);
	const maxChange = $derived(Math.max(1, ...changed.map((r) => Math.abs(r.delta))));
	const rise = $derived(changed.length && changed[0].delta > 0 ? changed[0] : null);
	const cut = $derived(changed.length && changed[changed.length - 1].delta < 0 ? changed[changed.length - 1] : null);
	const totalSame = $derived(Math.abs(spentTotal - draftTotal) < 0.5);

	function startCheck() {
		const pending = startProofOfWork('citizen-budget');
		check = pending;
		void pending.then((bot) => {
			if (turnstileSiteKey === null) turnstileSiteKey = bot.turnstileSiteKey;
		});
	}

	function markAnswered() {
		answeredMonth = tunisiaMonth();
		try {
			localStorage.setItem(answeredKey, answeredMonth);
		} catch {
			/* Private mode: the notice simply never appears. */
		}
	}

	async function send() {
		if (sending) return;
		if (start !== 'draft') {
			go('card');
			return;
		}
		// A design study stores nothing, and the consent text a design reader sees
		// says so. Sending the answers anyway would make that text false and would
		// open a race with the freeze deploy: a page loaded in design could store
		// under design consent if the switch came up before the button. So a
		// design state never reaches the network, and the card says the honest
		// thing. The empty-purse view above is the same rule for the other
		// prototype view.
		if (design) {
			phase = 'not-open';
			go('card');
			return;
		}
		const allocation = result ? toAllocation(board, result) : null;
		const current = currentInstrument;
		if (!allocation || !current) {
			phase = 'failed';
			go('card');
			return;
		}
		sending = true;
		phase = 'sending';
		try {
			const bot = check ? await check : null;
			const pow = bot?.proof ?? null;
			if (turnstileSiteKey && widgetId !== null && turnstileToken === null) {
				await new Promise<void>((resolve) => {
					tokenReady = resolve;
					setTimeout(resolve, 5000);
				});
			}
			const payload = submissionPayload({
				instrument: current,
				locale: app.locale === 'fr' || app.locale === 'ar' ? app.locale : 'en',
				channel: channelFromLocation(window.location.search),
				startedAt: openedAt,
				completionMs: Date.now() - openedAt,
				answers: budgetAnswers({ readInfo, withdrawal, adult, allocation, q1, q2, region: region || null }),
				assignment,
				pow,
				turnstileToken: turnstileSiteKey ? (turnstileToken ?? '') : undefined,
				revision: answeredThisMonth ? 'same-device' : undefined
			});
			const res = await submitResponse('citizen-budget', payload);
			if (res.ok) {
				receipt = res.receipt;
				phase = 'sent';
				markAnswered();
			} else if (res.status === 400 && res.error === 'the completion time is below the study minimum') {
				// The floor is a data-quality rule, not a network failure. Keep the
				// answer on screen, say what happened, and leave the send button so a
				// reader who waited the floor out can send the same answer again.
				phase = 'too-fast';
			} else if (res.status === 403 && res.error === 'submissions are closed') {
				phase = 'refused';
			} else if (res.status === 409) {
				phase = 'not-open';
			} else {
				phase = 'failed';
			}
		} catch {
			phase = 'failed';
		} finally {
			sending = false;
			if (!receipt && accepting) startCheck();
			if (turnstileSiteKey && widgetId !== null) {
				turnstileApi()?.reset(widgetId);
				turnstileToken = null;
			}
			go('card');
		}
	}

	function restart() {
		result = null;
		q1 = null;
		q2 = null;
		q2Skipped = false;
		adult = false;
		readInfo = false;
		withdrawal = false;
		receipt = null;
		phase = 'idle';
		openedAt = Date.now();
		go('intro');
	}

	onMount(() => {
		openedAt = Date.now();
		try {
			answeredMonth = localStorage.getItem(answeredKey);
		} catch {
			answeredMonth = null;
		}
		void (async () => {
			const live = await readLiveStudy('citizen-budget');
			if (live) {
				liveStudy = live.study;
				liveInstrument = live.instrument;
				assignment = live.assignment;
			}
			const takes = live?.study.accepting ?? live?.study.status === 'fielding';
			if (takes) startCheck();
		})();
	});

	// Load the human-check script quietly, and only when the challenge carried a
	// site key. With the check off this loads nothing and contacts no other origin.
	$effect(() => {
		if (!turnstileSiteKey) return;
		if (turnstileApi()) {
			turnstileLoaded = true;
			return;
		}
		const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
		if (existing) {
			existing.addEventListener('load', () => (turnstileLoaded = true));
			return;
		}
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
		script.dataset.turnstile = '';
		script.async = true;
		script.addEventListener('load', () => (turnstileLoaded = true));
		document.head.append(script);
	});

	$effect(() => {
		if (!turnstileLoaded || !turnstileSiteKey || !turnstileBox || widgetInto === turnstileBox) return;
		widgetId = turnstileApi()!.render(turnstileBox, {
			sitekey: turnstileSiteKey,
			callback: (token) => {
				turnstileToken = token;
				tokenReady?.();
				tokenReady = null;
			}
		});
		widgetInto = turnstileBox;
	});
</script>

<div class="game research-type" class:playing={step === 'board'} {dir} lang={app.locale}>
	{#if step !== 'board'}
		<header class="hero">
			<p class="chip">{stateChip}</p>
			<h1>{c.title}</h1>
			<p class="status">{stateStatus}</p>
			{#if c.unreviewed}
				<p class="unreviewed">{c.unreviewed}</p>
			{/if}
		</header>

		{#if step !== 'out'}
			<ol class="steps" aria-label={c.title}>
				{#each STEPS as s, i (s)}
					<li class:done={i < stepIndex} aria-current={i === stepIndex ? 'step' : undefined}>{c.stepLabels[s]}</li>
				{/each}
			</ol>
		{/if}
	{/if}

	{#if step === 'intro'}
		<section class="block" aria-labelledby="h-about">
			<h2 id="h-about">{c.intro.whatWeAsk}</h2>
			<p>{c.intro.whatWeAskBody}</p>
			<h3>{c.intro.stored}</h3>
			<p>{storedBody}</p>
			<h3>{c.intro.who}</h3>
			<p>{whoBody}</p>
			<h3>{c.intro.figures}</h3>
			<p>{c.intro.figuresBody}</p>
			<h3>{c.intro.sample}</h3>
			<p>{c.intro.sampleBody}</p>
		</section>
		<form
			class="consent"
			onsubmit={(e) => {
				e.preventDefault();
				go(adult ? 'frame' : 'out');
			}}
		>
			<label class="check"><input type="checkbox" bind:checked={readInfo} /><span>{c.intro.consentRead}</span></label>
			<label class="check"><input type="checkbox" bind:checked={withdrawal} /><span>{consentWithdrawal}</span></label>
			<label class="check"><input type="checkbox" bind:checked={adult} /><span>{c.intro.consentAge}</span></label>
			<p class="consent-note">{consentNote}</p>
			<div class="actions">
				<button class="cta" type="submit" disabled={!readInfo || !withdrawal}>{c.intro.start}</button>
			</div>
		</form>
	{/if}

	{#if step === 'out'}
		<section class="block" aria-live="polite"><p>{c.intro.under18}</p></section>
	{/if}

	{#if step === 'frame'}
		<section class="block" aria-labelledby="h-frame">
			<h2 id="h-frame" bind:this={headingEl} tabindex="-1">{c.frame.title}</h2>
			<p>{c.frame.body}</p>
			<h3>{c.frame.factsHeading}</h3>
			<ul class="facts">
				<li>{c.frame.fact1(fmt(draftTotal))}</li>
				<li>{c.frame.fact2}</li>
				<li>{c.frame.fact3}</li>
			</ul>
			<p class="note">{c.frame.placeholder}</p>
			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('intro')}>{c.frame.back}</button>
				<button class="cta" type="button" onclick={() => go('board')}>{c.frame.next}</button>
			</div>
		</section>
	{/if}

	{#if step === 'board'}
		<BudgetBoard mode={start} {rule} resume={result} live={studyState} {onfinish} />
	{/if}

	{#if step === 'items'}
		<section class="block">
			<h2 bind:this={headingEl} tabindex="-1">{c.items.title}</h2>
			<p class="note">{c.items.optional}</p>
			<fieldset class="q">
				<legend>{c.items.q1}</legend>
				<div class="options">
					{#each [['lower', c.items.q1Lower], ['same', c.items.q1Same], ['higher', c.items.q1Higher], ['skip', c.items.skip]] as [value, label] (value)}
						<label class="opt"><input type="radio" name="q1" {value} checked={q1 === value} onchange={() => (q1 = value as typeof q1)} /><span>{label}</span></label>
					{/each}
				</div>
			</fieldset>
			<fieldset class="q">
				<legend>{c.items.q2}</legend>
				<div class="scale">
					{#each Array.from({ length: 11 }, (_, n) => n) as n (n)}
						<button class="pill" type="button" aria-pressed={q2 === n} onclick={() => { q2 = n; q2Skipped = false; }}>{n}</button>
					{/each}
					<button class="pill skip" type="button" aria-pressed={q2Skipped} onclick={() => { q2 = null; q2Skipped = true; }}>{c.items.skip}</button>
				</div>
				<p class="note scale-ends"><span>{c.items.q2Low}</span><span>{c.items.q2High}</span></p>
			</fieldset>
			{#if regionItem?.options?.length}
				<div class="q region">
					<label for="region">{c.items.q3}</label>
					<select id="region" bind:value={region} aria-describedby="region-note">
						<option value="">{c.items.q3Pick}</option>
						{#each regionItem.options as id (id)}
							<option value={id}>{regionLabel(id)}</option>
						{/each}
					</select>
					<p class="note" id="region-note">{c.items.q3Note}</p>
				</div>
			{/if}
			{#if turnstileSiteKey}
				<div class="turnstile" bind:this={turnstileBox}></div>
			{/if}
			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('board')}>{c.items.back}</button>
				<button class="cta" type="button" onclick={() => void send()} disabled={sending}>{itemsSubmitLabel}</button>
			</div>
		</section>
	{/if}

	{#if step === 'card'}
		<section class="block">
			<h2 bind:this={headingEl} tabindex="-1">{c.card.title}</h2>
			<p class="note">{cardNote}</p>
			{#if kept || changed.length === 0}
				<p>{c.card.keptDraft}</p>
			{:else}
				<p class="summary">{c.card.summary(fmtMd(moved), movesCount, gaining)}{#if totalSame}{' '}{c.card.totalSame}{/if}</p>
				<dl class="stats">
					{#each [[c.card.rise, rise], [c.card.cut, cut]] as const as [label, r] (label)}
						{#if r}
							<div class="stat" data-dir={r.delta > 0 ? 'more' : 'less'}>
								<dt>{label}</dt>
								<dd>
									<span class="stat-name">{c.lines[r.line.id].name}</span>
									<span class="stat-fig num"><bdi dir="ltr">{signed(r.delta)}</bdi> {c.unit} · <bdi dir="ltr">{signed(r.pct, 1)}%</bdi></span>
								</dd>
							</div>
						{/if}
					{/each}
				</dl>

				<h3>{c.card.chartTitle}</h3>
				<p class="note">{c.card.chartNote}</p>
				<ul class="diverge">
					{#each changed as r (r.line.id)}
						{@const dirn = r.delta > 0 ? 'more' : 'less'}
						<li data-dir={dirn} title={`${c.lines[r.line.id].name}: ${signed(r.delta)} ${c.unit}, ${dirn === 'more' ? t.more : t.less}`}>
							<span class="d-name">{c.lines[r.line.id].name}</span>
							<span class="d-track" aria-hidden="true"><span class="d-bar" style:inline-size="{(Math.abs(r.delta) / maxChange) * 50}%"></span></span>
							<span class="d-val num">
								<span class="arrow" aria-hidden="true">{dirn === 'more' ? '▲' : '▼'}</span><bdi dir="ltr">{signed(r.delta)} · {signed(r.pct, 1)}%</bdi>
								<span class="sr">{dirn === 'more' ? t.more : t.less}</span>
							</span>
						</li>
					{/each}
				</ul>
				{#if unchanged.length}
					<button type="button" class="unchanged-toggle" aria-expanded={showUnchanged} onclick={() => (showUnchanged = !showUnchanged)}>
						{c.card.unchangedCount(unchanged.length)}
					</button>
					{#if showUnchanged}<p class="unchanged">{c.card.unchanged(unchangedNames)}</p>{/if}
				{/if}
			{/if}

			<details class="as-table">
				<summary>{c.card.tableToggle}</summary>
				<div class="table-scroll">
					<table class="card-table">
						<thead>
							<tr>
								<th scope="col">{c.board.systems}</th>
								<th scope="col" class="num">{c.board.draft}</th>
								<th scope="col" class="num">{c.board.yours}</th>
								<th scope="col" class="num">{c.board.change}</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as r (r.line.id)}
								<tr>
									<th scope="row">{c.lines[r.line.id].name}</th>
									<td class="num">{fmtMd(r.line.draft)}</td>
									<td class="num">{fmtMd(r.amount)}</td>
									<td class="num"><bdi dir="ltr">{signed(r.delta)}</bdi></td>
								</tr>
							{/each}
							{#each lines.locked as l (l.id)}
								<tr class="locked-row">
									<th scope="row">{c.lines[l.id].name}</th>
									<td class="num">{fmtMd(l.draft)}</td>
									<td class="num">{fmtMd(l.draft)}</td>
									<td class="num">0</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<th scope="row">{c.card.total} ({unit})</th>
								<td class="num">{fmtMd(draftTotal)}</td>
								<td class="num">{fmtMd(spentTotal)}</td>
								<td class="num"><bdi dir="ltr">{signed(spentTotal - draftTotal)}</bdi></td>
							</tr>
						</tfoot>
					</table>
				</div>
			</details>
			{#if start === 'empty'}
				<p class="note" role="status">{c.study.prototypeView}</p>
			{:else if design}
				<p class="note" role="status">{c.study.notOpen}</p>
			{:else if phase === 'sending'}
				<p class="note" role="status">{c.study.sending}</p>
			{:else if phase === 'sent' && receipt}
				<p class="note" role="status">{c.study.sent}</p>
				<div class="receipt">
					<p class="receipt-title">{c.study.receiptTitle}</p>
					<p class="receipt-code num">{receipt}</p>
					<p class="receipt-note">{c.study.receiptNote}</p>
					<a class="receipt-link" href="/research/citizen-budget/withdraw">{c.study.receiptLink}</a>
				</div>
			{:else if phase === 'refused'}
				<p class="note" role="status">{c.study.refused}</p>
			{:else if phase === 'not-open'}
				<p class="note" role="status">{c.study.notOpen}</p>
			{:else if phase === 'too-fast'}
				<p class="note" role="status">{c.study.tooFast}</p>
				<div class="actions">
					<button class="cta" type="button" data-send-again onclick={() => void send()} disabled={sending}>{c.study.sendAgain}</button>
				</div>
			{:else}
				<p class="note" role="status">{c.study.failed}</p>
			{/if}
			<div class="actions">
				<button class="quiet" type="button" onclick={() => go('board')}>{c.card.back}</button>
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
	/* The board owns the whole viewport: no hero, no step strip, no page scroll. */
	.game.playing {
		max-width: none;
		margin-inline: 0;
		inline-size: 100%;
		flex: 1 1 auto;
		min-block-size: 0;
		display: flex;
		flex-direction: column;
		padding: 0;
	}
	.hero {
		margin-block-end: var(--s-8);
	}
	.chip {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent-text);
		background: var(--accent);
		border-radius: var(--r-full);
		padding: var(--s-1) var(--s-4);
		margin-block-end: var(--s-4);
	}
	h1 {
		font-size: var(--step-3);
		line-height: 1.15;
		margin: 0 0 var(--s-3);
	}
	h2 {
		font-size: var(--step-2);
		line-height: 1.2;
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
	/* Result: a one-line summary, the biggest rise and cut, then every change as a bar from a centre line. */
	.summary {
		font-size: var(--t-lg);
		line-height: 1.4;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: var(--s-4);
		margin: var(--s-6) 0;
	}
	.stat {
		padding: var(--s-4) var(--s-5);
		border: var(--rule);
		border-inline-start: 4px solid var(--stat-c);
		border-radius: var(--r-md);
		background: var(--surface-raised);
	}
	.stat[data-dir='more'],
	.diverge li[data-dir='more'] {
		--stat-c: var(--index-band-5);
	}
	.stat[data-dir='less'],
	.diverge li[data-dir='less'] {
		--stat-c: var(--index-band-1);
	}
	.stat dt {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.stat dd {
		margin: var(--s-2) 0 0;
		display: grid;
		gap: var(--s-1);
	}
	.stat-name {
		font-weight: 600;
	}
	.stat-fig {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.diverge {
		list-style: none;
		margin: var(--s-4) 0;
		padding: 0;
		display: grid;
		gap: var(--s-2);
	}
	.diverge li {
		display: grid;
		grid-template-columns: minmax(0, 13rem) minmax(0, 1fr) 9.5rem;
		align-items: center;
		gap: var(--s-4);
		min-block-size: var(--s-8);
	}
	.d-name {
		font-size: var(--t-sm);
		line-height: 1.25;
	}
	.d-track {
		position: relative;
		block-size: var(--s-4);
	}
	/* The centre line is the draft: no change. */
	.d-track::before {
		content: '';
		position: absolute;
		inset-block: calc(-1 * var(--s-2));
		inset-inline-start: 50%;
		inline-size: 1px;
		background: var(--border-default);
	}
	.d-bar {
		position: absolute;
		inset-block: 0;
		min-inline-size: 2px;
		background: var(--stat-c);
	}
	li[data-dir='more'] .d-bar {
		inset-inline-start: calc(50% + 1px);
		border-start-end-radius: 4px;
		border-end-end-radius: 4px;
	}
	li[data-dir='less'] .d-bar {
		inset-inline-end: calc(50% + 1px);
		border-start-start-radius: 4px;
		border-end-start-radius: 4px;
	}
	.d-val {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		text-align: end;
		white-space: nowrap;
	}
	.d-val .arrow {
		color: var(--stat-c);
		margin-inline-end: var(--s-1);
	}
	.sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.unchanged {
		margin: var(--s-2) 0 var(--s-4);
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.unchanged-toggle {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-block-size: var(--touch);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		font: 500 var(--t-sm) var(--font-sans);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.unchanged-toggle::before {
		content: '▸';
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.unchanged-toggle[aria-expanded='true']::before {
		content: '▾';
	}
	.receipt {
		margin-block: var(--s-6);
		padding: var(--s-5);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
	}
	.receipt-title {
		margin: 0 0 var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.receipt-code {
		margin: 0 0 var(--s-3);
		font-size: var(--t-xl);
		font-weight: 600;
		letter-spacing: 0.08em;
	}
	.receipt-note {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.receipt-link {
		font-size: var(--t-sm);
		color: var(--text-secondary);
		text-underline-offset: 3px;
	}
	.consent-note {
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.pill.skip {
		font-size: var(--t-sm);
	}
	.as-table {
		margin-block: var(--s-6);
	}
	.as-table summary {
		cursor: pointer;
		min-block-size: var(--touch);
		display: flex;
		align-items: center;
		color: var(--text-secondary);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	@media (max-width: 560px) {
		.diverge {
			gap: var(--s-4);
		}
		.diverge li {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'name val' 'track track';
			gap: var(--s-1) var(--s-3);
		}
		.d-name {
			grid-area: name;
		}
		.d-val {
			grid-area: val;
		}
		.d-track {
			grid-area: track;
		}
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
		letter-spacing: 0.04em;
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
		align-items: center;
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
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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
	.q {
		border: 0;
		margin: var(--s-6) 0;
		padding: 0;
		min-inline-size: 0;
	}
	.q legend,
	.region label {
		display: block;
		font-weight: 600;
		margin-block-end: var(--s-3);
		max-inline-size: var(--measure);
	}
	.region select {
		min-block-size: var(--touch);
		min-inline-size: min(100%, 20rem);
		padding-inline: var(--s-4);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		color: inherit;
		font: inherit;
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
		padding-inline: var(--s-4);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		cursor: pointer;
	}
	.pill {
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
		padding: var(--s-3);
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
</style>
