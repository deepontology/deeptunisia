<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { FIGURES, HISTORY, programmesForLine } from '$lib/budget-study/figures';
	import { revenueFor } from '$lib/budget-study/revenue';
	import { cellCheck, checkPhrase, jortLabel, singleParts } from '$lib/budget-study/verification';
	import { copyFor } from './copy';
	import { boardCopyFor, type BoardLive } from './board-copy';
	import { linesFrom, type LineId } from './lines';
	import * as B from './board';
	import { lineDifference } from './diff';
	import { clearCoins, dragMoney, flyCoin } from './drag';
	import SystemRow, { fmtMd, signed } from './SystemRow.svelte';
	import TrendChart from './TrendChart.svelte';
	import BoardTour, { boardTourSeen } from './BoardTour.svelte';

	/**
	 * The Treasury board, one screen on a desk and on a phone.
	 *
	 * Desk: the purse, the spent-before-you-start block, the chosen system with
	 * Take and Give, the last moves and the actions sit in a column; the thirty
	 * systems fill two columns of rows on one scale in dinars. Phone: the purse
	 * is a bar at the top, the systems are rows, and the chosen system's Take
	 * and Give sit in a dock at the bottom, under the thumb.
	 *
	 * Money moves by dragging one system onto another (or onto the purse, or
	 * from the purse onto a system), by Take and Give, or by keys. The engine
	 * (board.ts) decides what one move carries: a 100 MD coin by default.
	 */
	let {
		mode = 'draft',
		rule = B.DEFAULT_RULE,
		resume = null,
		live = 'design',
		onfinish
	}: {
		mode?: B.StartMode;
		rule?: B.MoveRule;
		/** A board the citizen already played: coming back from the questions keeps every move. */
		resume?: B.BoardState | null;
		/** The live study, read by the game. Decides the header line; the board itself never sends. */
		live?: BoardLive;
		onfinish?: (game: B.BoardState, board: B.Board) => void;
	} = $props();

	const lines = linesFrom(FIGURES.rows);
	const board: B.Board = { lines };
	const start = () => B.startBoard(board, untrack(() => mode), untrack(() => rule));
	let game: B.BoardState = $state(untrack(() => resume) ?? start());

	const t = $derived(boardCopyFor(app.locale));
	const c = $derived(copyFor(app.locale));
	const nameOf = (id: string) => (id === 'purse' ? t.purse : c.lines[id as LineId].name);

	/** One scale for every system: half again the largest plan, rounded up to 2,000 MD. */
	const SCALE = Math.ceil((Math.max(...lines.movable.map((l) => l.draft)) * 1.5) / 2000) * 2000;
	const TICKS = [0, 5000, 10000].filter((v) => v < SCALE);

	const P = $derived(B.purse(board, game));
	const done = $derived(B.finished(board, game));
	const rows = $derived(
		lines.movable.map((l) => {
			const yours = B.heldMd(board, game, l.id);
			return { id: l.id, plan: l.draft, yours, diff: lineDifference(l.draft, yours) };
		})
	);
	const half = Math.ceil(lines.movable.length / 2);

	/*
	 * Past years: the adopted laws of 2020 to 2026. One year is compared at a
	 * time, drawn as a bar beside the 2027 draft; the whole series lives in the
	 * trend chart behind the chart icon. The table keeps every year.
	 */
	const DRAFT_YEAR = 2027;
	const pastYears = HISTORY;
	let compared = $state<number | null>(HISTORY.length ? HISTORY[HISTORY.length - 1].year : null);
	const comparedYear = $derived(HISTORY.find((h) => h.year === compared) ?? null);
	/** The compared year's revenue, from its law's own articles. Null when the year has none. */
	const comparedRevenue = $derived(revenueFor(compared));
	function toggleYear(year: number) {
		compared = compared === year ? null : year;
	}
	function historyText(id: LineId): string {
		return pastYears.map((h) => `${h.year} ${fmtMd(h.lines[id])} ${t.unit}`).join(', ');
	}
	function comparedAria(id: LineId): string {
		if (!comparedYear) return '';
		const check = cellCheck(comparedYear.year, id);
		return ` ${t.historyAria(String(comparedYear.year), fmtMd(comparedYear.lines[id]), t.unit)}${check ? ` ${checkPhrase(check, t)}` : ''}`;
	}
	/** A phone shows the rows as a list that scrolls, so a touch pans it; Take and Give move the money. */
	let narrow = $state(false);
	/** Below 1,100 pixels the systems are one column; above, two. */
	let wide = $state(true);
	const columns = $derived(wide ? [rows.slice(0, half), rows.slice(half)] : [rows]);
	const debt = lines.locked.find((l) => l.id === 'debt')!;
	const reserve = lines.locked.find((l) => l.id === 'reserve')!;
	const lockedTotal = lines.locked.reduce((s, l) => s + l.draft, 0);

	let active = $state<LineId | null>(null);
	let carrying = $state<string | null>(null);
	let over = $state<string | null>(null);
	let refusedId = $state<string | null>(null);
	let message = $state('');
	let view = $state<'bars' | 'table'>('bars');
	let keepChoice = $state(false);
	let detailOpen = $state(false);
	/** Every adopted year's audit for the chosen line, for the detail panel. */
	const activeChecks = $derived(
		active && pastYears.length
			? pastYears.flatMap((h) => {
					const check = cellCheck(h.year, active as LineId);
					return check ? [{ year: h.year, check }] : [];
				})
			: []
	);
	/** Every single-read component behind the chosen line, named with its year and page. */
	const singleCells = $derived.by(() => {
		if (!active) return [];
		return activeChecks.flatMap(({ year, check }) => {
			const h = HISTORY.find((x) => x.year === year);
			return singleParts(check).map((part) => ({
				id: `${year}-${part.id}`,
				year,
				label: h?.missions[part.id]?.label ?? part.id,
				amount: h?.missions[part.id]?.amount_md ?? 0,
				page: part.page
			}));
		});
	});
	/** The trend chart: the chosen line across every adopted year and the 2027 draft. */
	let chartOpen = $state(false);
	let tourOpen = $state(false);
	/* First arrival on the board: walk the controls once. The link replays it. */
	onMount(() => {
		if (boardTourSeen()) return;
		const timer = setTimeout(() => (tourOpen = true), 500);
		return () => clearTimeout(timer);
	});
	let listEl = $state<HTMLElement | undefined>(undefined);
	let rootEl = $state<HTMLElement | undefined>(undefined);

	const activeRow = $derived(active ? rows.find((r) => r.id === active)! : null);
	const takeMd = $derived(active ? B.takeAmount(board, game, active) : 0);
	const giveMd = $derived(active ? B.giveAmount(board, game, active) : 0);
	const atDraftNow = $derived(B.atDraft(board, game));
	const hasChange = $derived(!atDraftNow);
	/** Finish needs either a real change or the explicit keep-draft tick. */
	const canFinish = $derived(done && (hasChange || keepChoice));
	const programmes = $derived(activeRow ? programmesForLine(activeRow.id) : []);
	const lineCaveat = $derived.by(() => {
		if (!activeRow) return null;
		const id = activeRow.id;
		if ((id === 'police' || id === 'environment') && compared === 2020) return t.historyCaveat[id] ?? null;
		if (id === 'subsidies_energy' || id === 'subsidies_food' || id === 'energy_trade') return t.historyCaveat[id] ?? null;
		if (id === 'parliament' || id === 'higher_education' || id === 'government_offices') return t.historyCaveat[id] ?? null;
		return null;
	});
	const firstPast = $derived(pastYears[0] ?? null);
	const year2024 = $derived(HISTORY.find((h) => h.year === 2024) ?? null);
	const stepOf = (id: LineId) => (rule === 'step' ? fmtMd(B.stepMd(B.findLine(board, id))) : '');
	const unitLabel = (id: string) => {
		if (id === 'purse') return `${fmtMd(rule === 'coin' ? Math.min(B.COIN_MD, Math.max(P, 0)) : P)} ${t.unit}`;
		const amount = B.takeAmount(board, game, id as LineId);
		return `${fmtMd(amount || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, id as LineId))))} ${t.unit}`;
	};

	function describe(entry: B.LogEntry): string {
		const n = (id: LineId | null) => (id ? c.lines[id].name : '');
		if (entry.kind === 'take') return t.took(fmtMd(entry.md), n(entry.from));
		if (entry.kind === 'give') return t.gave(fmtMd(entry.md), n(entry.to));
		if (entry.kind === 'set') return t.setTo(fmtMd(entry.targetMd ?? entry.md), n(entry.to));
		if (entry.kind === 'move')
			return Math.abs(entry.md - entry.mdIn) < 1e-9
				? t.moved(fmtMd(entry.md), n(entry.from), n(entry.to))
				: t.movedStep(fmtMd(entry.md), fmtMd(entry.mdIn), n(entry.from), n(entry.to));
		return t.kept;
	}
	const recent = $derived(game.log.slice(-4).reverse().map(describe));
	/** The status line repeats the newest ledger line; where the ledger shows, sighted readers see it once. */
	const echo = $derived(message !== '' && message === recent[0]);

	function el(id: string): Element | null {
		return rootEl?.querySelector(`[data-drop="${id}"]`) ?? null;
	}

	function refuse(why: B.Refusal, id: string) {
		const name = nameOf(id);
		message = t.refusal(why, name, fmtMd(P), id !== 'purse' && rule === 'step' && why === 'purse' ? stepOf(id as LineId) : '');
		refusedId = id;
		setTimeout(() => {
			if (refusedId === id) refusedId = null;
		}, 400);
	}

	/** One move from `from` to `to`; either may be the purse. Returns false when refused. */
	function moveMoney(from: string, to: string): boolean {
		let next: B.BoardState;
		if (from === 'purse' && to === 'purse') return false;
		if (from === 'purse') {
			const why = B.giveProblem(board, game, to as LineId);
			if (why) return (refuse(why, to), false);
			next = B.give(board, game, to as LineId);
		} else if (to === 'purse') {
			const why = B.takeProblem(board, game, from as LineId);
			if (why) return (refuse(why, from), false);
			next = B.take(board, game, from as LineId);
		} else {
			const why = B.transferProblem(board, game, from as LineId, to as LineId);
			if (why) return (refuse(why, why === 'zero' ? from : to), false);
			next = B.transfer(board, game, from as LineId, to as LineId);
		}
		const entry = next.log[next.log.length - 1];
		flyCoin(el(from), el(to), `${fmtMd(entry.md)}`);
		game = next;
		keepChoice = false;
		message = describe(entry);
		return true;
	}

	/** The chart needs a line: with none chosen, it takes the first row so the click is never dead. */
	function openChart() {
		if (!active) active = rows[0]?.id ?? null;
		detailOpen = false;
		chartOpen = true;
	}

	function select(id: string) {
		if (id === 'purse') return;
		active = id as LineId;
		detailOpen = false;
		message = '';
	}

	/** The explicit keep-draft control. Ticking it puts the whole board back on the draft. */
	function toggleKeep(next: boolean) {
		keepChoice = next;
		if (next) {
			game = B.keepDraft(board, game);
			active = null;
			detailOpen = false;
			message = t.kept;
		}
	}

	/** Set one line to an exact amount (2024 level, draft or zero). One undo. */
	function applySet(targetMd: number) {
		if (!active) return;
		const why = B.setProblem(board, game, active, targetMd);
		if (why) {
			message = t.setRefused(fmtMd(P));
			refusedId = active;
			setTimeout(() => {
				if (refusedId === active) refusedId = null;
			}, 400);
			return;
		}
		const line = B.findLine(board, active);
		const cap = Math.round(line.draft * 2 * 1000) / 1000;
		const capped = targetMd > cap + 0.0005;
		const next = B.setLine(board, game, active, targetMd);
		if (next === game) return;
		game = next;
		keepChoice = false;
		message = capped ? t.setCapped(fmtMd(targetMd), fmtMd(cap)) : describe(next.log[next.log.length - 1]);
	}

	// Take and Give buttons: one move per press, and holding keeps money flowing.
	let holdDelay: ReturnType<typeof setTimeout> | null = null;
	let holdTick: ReturnType<typeof setInterval> | null = null;
	function stopHold() {
		if (holdDelay) clearTimeout(holdDelay);
		if (holdTick) clearInterval(holdTick);
		holdDelay = holdTick = null;
	}
	function hold(e: PointerEvent, from: string, to: string) {
		if (e.button !== 0) return;
		e.preventDefault();
		stopHold();
		if (!moveMoney(from, to)) return;
		holdDelay = setTimeout(() => {
			holdTick = setInterval(() => {
				if (!moveMoney(from, to)) stopHold();
			}, 110);
		}, 450);
	}
	function press(e: MouseEvent, from: string, to: string) {
		// Pointer presses are handled by hold(); this is the keyboard path (detail 0).
		if (e.detail === 0) moveMoney(from, to);
	}

	// Keys on the list of systems.
	function onkey(e: KeyboardEvent) {
		const ids = rows.map((r) => r.id);
		const i = active ? ids.indexOf(active) : -1;
		const go = (j: number) => {
			active = ids[(j + ids.length) % ids.length];
			void tick().then(() => el(active!)?.scrollIntoView({ block: 'nearest' }));
		};
		if (e.key === 'ArrowDown') go(i + 1);
		else if (e.key === 'ArrowUp') go(i - 1);
		else if (e.key === 'Home') go(0);
		else if (e.key === 'End') go(ids.length - 1);
		else if ((e.key === '-' || e.key === '_') && active) moveMoney(active, 'purse');
		else if ((e.key === '+' || e.key === '=') && active) moveMoney('purse', active);
		else if ((e.key === 'Enter' || e.key === ' ') && active) {
			if (!carrying) {
				carrying = active;
				message = t.carrying(unitLabel(active).replace(` ${t.unit}`, ''), nameOf(active));
			} else if (carrying !== active) moveMoney(carrying, active);
		} else if (e.key === 'Escape' && carrying) {
			carrying = null;
			message = '';
		} else return;
		e.preventDefault();
	}

	function undo() {
		game = B.undo(game);
		// The tick says the board is the draft. If Undo brings moves back, it is not.
		if (!B.atDraft(board, game)) keepChoice = false;
		message = '';
	}
	function reset() {
		game = start();
		active = null;
		message = '';
		keepChoice = false;
		detailOpen = false;
	}
	onMount(() => {
		const mq = window.matchMedia('(max-width: 720px)');
		narrow = mq.matches;
		const onmq = () => (narrow = mq.matches);
		mq.addEventListener('change', onmq);
		const mqw = window.matchMedia('(min-width: 1100px)');
		wide = mqw.matches;
		const onmqw = () => (wide = mqw.matches);
		mqw.addEventListener('change', onmqw);
		if (!listEl)
			return () => {
				mq.removeEventListener('change', onmq);
				mqw.removeEventListener('change', onmqw);
			};
		const parent = listEl.closest('.board') as HTMLElement;
		const stop = dragMoney(parent, {
			canStart: (id) => (id === 'purse' ? P > 0 : true),
			onStart: (id) => {
				carrying = id;
				if (id !== 'purse') active = id as LineId;
			},
			onOver: (id) => (over = id),
			onDrop: (from, to) => moveMoney(from, to),
			onTap: (id) => select(id),
			onEnd: () => {
				carrying = null;
				over = null;
			},
			label: (id) => unitLabel(id)
		});
		return () => {
			stop();
			stopHold();
			clearCoins();
			mq.removeEventListener('change', onmq);
			mqw.removeEventListener('change', onmqw);
		};
	});

	// A message fades after a few seconds; the ledger keeps the record.
	$effect(() => {
		if (!message) return;
		const shown = message;
		const timer = setTimeout(() => {
			if (message === shown) message = '';
		}, 3200);
		return () => clearTimeout(timer);
	});

	const purseState = $derived(Math.abs(P) < 1e-9 ? 'empty' : done ? 'leftover' : 'hold');
	const readyText = $derived(
		done ? (atDraftNow && !keepChoice ? t.readyChoice : purseState === 'leftover' ? t.readyBand : t.ready) : ''
	);
</script>

<svelte:window
	onpointerup={stopHold}
	onblur={stopHold}
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			chartOpen = false;
			detailOpen = false;
		}
	}}
/>

{#snippet detailPanel()}
	{#if activeRow}
		<div class="detail">
			<p class="detail-name">{c.lines[activeRow.id].name}</p>
			{#if activeChecks.length}
				<div class="detail-verify">
					<p class="detail-title">{t.verifiedTitle}</p>
					<ul>
						{#each activeChecks as row (row.year)}
							<li>
								<span class="num dv-year">{row.year}</span>
								<span class="dv-page">{jortLabel(row.check, t)}</span>
								<span class="dv-word" data-status={row.check.status}>{t.verifiedWords[row.check.status]}</span>
								{#if row.year === compared}
									<span class="dv-where" aria-hidden="true">•</span>
								{/if}
							</li>
						{/each}
					</ul>
					{#each singleCells as s (s.id)}
						<p class="detail-note">{t.singleNote(String(s.year), s.label, fmtMd(s.amount), String(s.page))}</p>
					{/each}
				</div>
			{/if}
			{#if programmes.length}
				<p class="detail-title">{t.programmes2026}</p>
				<p class="detail-source">{t.programmesNote}</p>
				{#each programmes as m (m.key)}
					<div class="detail-mission">
						<p class="detail-mission-label">
							<span lang="fr" dir="ltr">{m.mission.label}</span> <span class="num">{fmtMd(m.mission.total_md)} {t.unit}</span>
							<span class="detail-page">{t.pageLabel} {m.mission.page}</span>
						</p>
						<ul>
							{#each m.mission.programmes as p (p.label)}
								<li><span lang="fr" dir="ltr">{p.label}</span><span class="num">{fmtMd(p.amount_md)}</span></li>
							{/each}
						</ul>
					</div>
				{/each}
			{:else}
				<p class="detail-note">{t.noProgrammes}</p>
			{/if}
			<div class="detail-actions">
				{#if year2024}
					<button type="button" class="detail-action" onclick={() => applySet(year2024.lines[activeRow.id])}>
						{t.setTo2024}
					</button>
				{/if}
				<button type="button" class="detail-action" onclick={() => applySet(activeRow.plan)}>{t.setToDraft}</button>
				<button type="button" class="detail-action" onclick={() => applySet(0)}>{t.zeroLine}</button>
			</div>
		</div>
	{/if}
{/snippet}

<div class="board" class:carrying={!!carrying} data-rule={rule} bind:this={rootEl}>
	<!-- The purse, with what is spent before you start. -->
	<section class="purse-zone" aria-label={t.purse}>
		<p class="badge">{t.badge[mode === 'empty' ? 'design' : live]}{#if live === 'design'}<span class="rule">{t.rule[rule]}</span>{/if}</p>
		<h1 class="title">{t.title}</h1>
		<div class="top-links">
			<a class="study-link" href="/research/citizen-budget">{t.studyPage}</a>
			<button type="button" class="help-link" onclick={() => (tourOpen = true)} aria-haspopup="dialog">{t.tour.open}</button>
		</div>

		<div class="purse" data-tour="purse" class:target={over === 'purse'} class:refused={refusedId === 'purse'} data-drop="purse" data-state={purseState}>
			<span class="purse-label">{t.purse}</span>
			<span class="purse-amount num">{fmtMd(Math.max(P, 0))}<small>{t.unit}</small></span>
			<span class="purse-note">
				{purseState === 'empty' ? t.purseEmpty : purseState === 'leftover' ? t.purseLeftover : t.purseToPlace}
			</span>
			<span class="meter" aria-hidden="true"><span style:inline-size="{Math.min(100, (Math.max(P, 0) / lines.envelope) * 100)}%"></span></span>
		</div>
		<div class="tools">
			<button type="button" class="tool" data-tour="undo" onclick={undo} disabled={game.snapshots.length === 0} aria-label={t.undo} title={t.undo}><span aria-hidden="true">↶</span></button>
			<button type="button" class="tool" onclick={() => (view = view === 'bars' ? 'table' : 'bars')} aria-pressed={view === 'table'} aria-label={t.table} title={t.table}><span aria-hidden="true">{view === 'bars' ? '☰' : '▥'}</span></button>
			<button type="button" class="tool years-tool" data-tour="years" onclick={openChart} aria-label={t.chartOpen} title={t.chartOpen} aria-haspopup="dialog">
				<svg viewBox="0 0 20 14" width="20" height="14" aria-hidden="true"><path d="M2 11 L7 8 L12 9 L18 3" /><circle cx="18" cy="3" r="2" /></svg>
			</button>
		</div>

		<div class="locked" data-tour="locked">
			<span class="locked-swatch" aria-hidden="true"></span>
			<p><strong>{t.lockedTitle}: <span class="num">{fmtMd(lockedTotal)} {t.unit}</span></strong> {t.lockedBody(fmtMd(debt.draft), fmtMd(reserve.draft))}</p>
		</div>
	</section>

	<!-- The systems. -->
	<section class="systems" data-tour="systems" aria-label={c.board.systems}>
		<div class="legend">
			<span class="key"><span class="sw year" aria-hidden="true"></span>{comparedYear ? t.legendPast(String(comparedYear.year)) : t.legendPastNone}</span>
			<span class="key"><span class="sw plan" aria-hidden="true"></span>{t.legendPlan}</span>
			<span class="key"><span class="sw mine" aria-hidden="true"></span>{t.legendYours}</span>
			<span class="years" data-tour="years" role="group" aria-label={t.pastYears} title={t.historyNote}>
				<button type="button" class="chart-btn" onclick={openChart} aria-label={t.chartOpen} title={t.chartOpen} aria-haspopup="dialog">
					<svg viewBox="0 0 20 14" width="18" height="12" aria-hidden="true"><path d="M2 11 L7 8 L12 9 L18 3" /><circle cx="18" cy="3" r="2" /></svg>
				</button>
				{#each pastYears as h (h.year)}
					<button type="button" class="year" aria-pressed={compared === h.year} onclick={() => toggleYear(h.year)}>{h.year}</button>
				{/each}
			</span>
			<span class="scale">{t.scale(fmtMd(SCALE))}</span>
			<button type="button" class="link" onclick={() => (view = view === 'bars' ? 'table' : 'bars')} aria-pressed={view === 'table'}>
				{view === 'bars' ? t.table : t.bars}
			</button>
		</div>
		{#if pastYears.length}
			<p class="legend-notes"><span>{t.yearLegend}</span> <span>{t.nominalNote}</span> <span class="derived-short">{t.derivedShort}</span> <span class="basket-short">{t.basketShort}</span> <span class="legend-definitions">{t.historyDefinitions}</span></p>
		{/if}
		{#if comparedRevenue}
			<p class="tax-note"><span class="tax-mark" aria-hidden="true">%</span>{t.taxLine(String(comparedRevenue.year), comparedRevenue.tax_per_100.toFixed(1), comparedRevenue.covered_pct.toFixed(1))}</p>
		{/if}

		{#if view === 'bars'}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="list"
				role="listbox"
				tabindex="0"
				aria-label={`${c.board.systems}. ${t.keys}`}
				aria-activedescendant={active ? `sys-${active}` : undefined}
				onkeydown={onkey}
				bind:this={listEl}
			>
				{#each columns as col, k (k)}
					<div class="col" style:--rows={wide ? half : rows.length}>
						<div class="axis" aria-hidden="true">
							{#each TICKS as v (v)}
								<span style:inset-inline-start="{(v / SCALE) * 100}%">{v === 0 ? '0' : `${v / 1000}k`}</span>
							{/each}
						</div>
						{#each col as r (r.id)}
							<div
								class="slot"
								id="sys-{r.id}"
								data-tour={r.id === 'police' ? 'row' : undefined}
								role="option"
								aria-selected={active === r.id}
								aria-label={t.rowAria(
									c.lines[r.id].name,
									fmtMd(r.plan),
									fmtMd(r.yours),
									r.diff.direction === 'same' ? t.same : `${signed(r.diff.deltaMd)} ${t.unit}, ${signed(r.diff.deltaPct, 1)}%, ${r.diff.direction === 'more' ? t.more : t.less}`
								) + comparedAria(r.id)}
							>
								<SystemRow
									id={r.id}
									name={c.lines[r.id].name}
									plan={r.plan}
									yours={r.yours}
									scale={SCALE}
									deltaMd={r.diff.deltaMd}
									deltaPct={r.diff.deltaPct}
									direction={r.diff.direction}
									words={{ plan: t.plan, yours: t.yours, more: t.more, less: t.less, same: t.same }}
									unit={t.unit}
									active={active === r.id}
									target={over === r.id}
									source={carrying === r.id}
									refused={refusedId === r.id}
									pan={narrow}
									past={comparedYear ? { year: comparedYear.year, md: comparedYear.lines[r.id] } : null}
									pastTitle={comparedYear
										? `${comparedYear.year}: ${fmtMd(comparedYear.lines[r.id])} ${t.unit}${(() => {
												const check = cellCheck(comparedYear.year, r.id);
												return check ? ` · ${checkPhrase(check, t)}` : '';
											})()}`
										: ''}
									planDerived={r.id === 'subsidies_energy' || r.id === 'subsidies_food' || r.id === 'religious_affairs' || r.id === 'communication_technologies' || r.id === 'state_domains' || r.id === 'courts_oversight'}
								/>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th scope="col">{t.th.system}</th>{#each pastYears as h (h.year)}<th scope="col" class="past">{h.year}</th>{/each}<th scope="col">{t.th.plan}</th><th scope="col">{t.th.yours}</th><th scope="col">{t.th.md}</th><th scope="col">{t.th.pct}</th></tr>
					</thead>
					<tbody>
						{#each rows as r (r.id)}
							<tr>
								<th scope="row">{c.lines[r.id].name}</th>
								{#each pastYears as h (h.year)}<td class="past">{fmtMd(h.lines[r.id])}</td>{/each}
								<td>{fmtMd(r.plan)}</td>
								<td>{fmtMd(r.yours)}</td>
								<td>{signed(r.diff.deltaMd)}</td>
								<td>{signed(r.diff.deltaPct, 1)}</td>
							</tr>
						{/each}
						{#each lines.locked as l (l.id)}
							<tr class="lockrow"><th scope="row">{c.lines[l.id].name}</th>{#each pastYears as h (h.year)}<td class="past">{fmtMd(h.lines[l.id])}</td>{/each}<td>{fmtMd(l.draft)}</td><td>{fmtMd(l.draft)}</td><td>0</td><td>0.0</td></tr>
						{/each}
					</tbody>
					<tfoot>
						<tr><th scope="row">{t.total}</th>{#each pastYears as h (h.year)}<td class="past">{fmtMd(h.total_md)}</td>{/each}<td>{fmtMd(lines.total)}</td><td>{fmtMd(lines.total - P)}</td><td>{signed(-P)}</td><td></td></tr>
					</tfoot>
				</table>
			</div>
		{/if}
	</section>

	<!-- The chosen system, the last moves and the actions. -->
	<section class="dock" aria-label={t.change}>
		<div class="chosen" data-tour="dock">
			{#if activeRow}
				<p class="chosen-name">{c.lines[activeRow.id].name}</p>
				<p class="chosen-figs num" class:has-history={pastYears.length > 0}>
					<span>{t.plan} {fmtMd(activeRow.plan)}</span>
					<span>{t.yours} {fmtMd(activeRow.yours)}</span>
					<span data-dir={activeRow.diff.direction}>{t.change} <bdi dir="ltr">{signed(activeRow.diff.deltaMd)} · {signed(activeRow.diff.deltaPct, 1)}%</bdi></span>
				</p>
				<div class="moves-buttons">
					<button
						type="button"
						class="move take"
						disabled={takeMd === 0}
						aria-label={t.takeAria(fmtMd(takeMd || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, activeRow.id)))), c.lines[activeRow.id].name)}
						onpointerdown={(e) => hold(e, activeRow.id, 'purse')}
						onclick={(e) => press(e, activeRow.id, 'purse')}
					>
						<span class="glyph" aria-hidden="true">−</span>{t.take(fmtMd(takeMd || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, activeRow.id)))))}<span class="unit">{t.unit}</span>
					</button>
					<button
						type="button"
						class="move give"
						disabled={giveMd === 0}
						aria-disabled={giveMd === 0}
						aria-label={t.giveAria(fmtMd(giveMd || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, activeRow.id)))), c.lines[activeRow.id].name)}
						onpointerdown={(e) => hold(e, 'purse', activeRow.id)}
						onclick={(e) => press(e, 'purse', activeRow.id)}
					>
						{t.give(fmtMd(giveMd || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, activeRow.id)))))}<span class="unit">{t.unit}</span><span class="glyph" aria-hidden="true">+</span>
					</button>
				</div>
				<div class="dock-links">
					<button type="button" class="details-toggle" aria-expanded={detailOpen} onclick={() => (detailOpen = !detailOpen)}>
						{detailOpen ? t.detailsClose : t.details}
					</button>
					<button type="button" class="chart-link" aria-haspopup="dialog" onclick={openChart}>
						{t.chartHeading}
					</button>
				</div>
				{#if detailOpen && narrow}
					{@render detailPanel()}
				{/if}
				{#if pastYears.length}
					{@const id = activeRow.id}
					{@const series = [
						...pastYears.map((h) => ({ label: String(h.year), md: h.lines[id], kind: 'past' })),
						{ label: t.draftYear, md: activeRow.plan, kind: 'draft' },
						{ label: t.yours, md: activeRow.yours, kind: 'mine' }
					]}
					{@const top = Math.max(...series.map((p) => p.md), 1e-9)}
					{@const first = pastYears[0]}
					<div class="history">
						<p class="history-title">
							<span>{t.yearByYear}</span>
							{#if first.lines[id] > 0}<span class="num">{t.since(String(first.year))} <bdi dir="ltr">{signed(((activeRow.plan - first.lines[id]) / first.lines[id]) * 100, 1)}%</bdi> {t.nominalShort}</span>{/if}
						</p>
						<ul>
							{#each series as p (p.label)}
								<li class={p.kind} data-dir={p.kind === 'mine' ? activeRow.diff.direction : undefined}>
									<span class="h-label">{p.label}</span>
									<span class="h-track" aria-hidden="true"><span style:inline-size="{(p.md / top) * 100}%"></span></span>
									<span class="h-val num">{fmtMd(p.md)}</span>
								</li>
							{/each}
						</ul>
						{#if activeRow.diff.direction !== 'same'}
							<p class="history-change num" data-dir={activeRow.diff.direction}>{t.change} <bdi dir="ltr">{signed(activeRow.diff.deltaMd)} · {signed(activeRow.diff.deltaPct, 1)}%</bdi></p>
						{/if}
						<p class="history-note">{t.nominalNote}</p>
					</div>
				{/if}
				<p class="chosen-note">{c.lines[activeRow.id].note}</p>
				{#if lineCaveat}
					<p class="chosen-note history-caveat">{lineCaveat}</p>
				{/if}
			{:else}
				<p class="chosen-name muted">{t.pick}</p>
				<p class="howto">{t.howTo[rule]}</p>
				<p class="howto phone-howto">{t.howToPhone}</p>
				<div class="moves-buttons idle">
					<button type="button" class="move take" onclick={reset}>{t.reset}</button>
				</div>
			{/if}
		</div>

		<p class="message" class:ready={!message && done} class:echo role="status" aria-live="polite"><span class="main">{message || readyText}</span>{#if echo}<span class="alt" aria-hidden="true">{readyText}</span>{/if}</p>

		<div class="ledger">
			<p class="ledger-title">{t.moves}</p>
			{#if recent.length}
				<ol>
					{#each recent as line, i (i + line)}<li>{line}</li>{/each}
				</ol>
			{:else}
				<p class="muted">{t.noMoves}</p>
			{/if}
		</div>

		<div class="actions">
			<label class="keep-choice" data-tour="keep">
				<input type="checkbox" checked={keepChoice} onchange={(e) => toggleKeep(e.currentTarget.checked)} />
				<span class="keep-tick">{t.keepTick}</span>
				<span class="keep-hint">{t.keepTickHint}</span>
				<span class="keep-note">{t.keepTickNote}</span>
			</label>
			<button type="button" class="ghost" data-tour="undo" onclick={undo} disabled={game.snapshots.length === 0}>{t.undo}</button>
			<button type="button" class="ghost" onclick={reset}>{t.reset}</button>
			<button type="button" class="finish" data-tour="finish" disabled={!canFinish} onclick={() => onfinish?.(game, board)}>
				{#if canFinish}{t.finish}{:else}<span class="long">{atDraftNow ? t.finishNeedsChoice : t.finishNeeds(fmtMd(Math.abs(P)))}</span><span class="short">{t.finish}</span>{/if}
			</button>
		</div>
		{#if t.interim}<p class="interim">{t.interim}</p>{/if}
	</section>

	{#if tourOpen}
		<BoardTour {t} {rule} onclose={() => (tourOpen = false)} />
	{/if}

	{#if chartOpen && activeRow}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="detail-overlay chart-overlay"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-label={`${c.lines[activeRow.id].name}. ${t.chartHeading}`}
			onclick={(e) => {
				if (e.target === e.currentTarget) chartOpen = false;
			}}
		>
			<div class="detail-sheet">
				<button type="button" class="detail-close" onclick={() => (chartOpen = false)}>{t.detailsClose}</button>
				<TrendChart
					name={c.lines[activeRow.id].name}
					plan={activeRow.plan}
					yours={activeRow.yours}
					direction={activeRow.diff.direction}
					years={pastYears.map((h) => ({ year: h.year, md: h.lines[activeRow.id] }))}
					draftYear={DRAFT_YEAR}
					compared={compared}
					words={t}
					unit={t.unit}
					caveat={lineCaveat}
					taxNote={comparedRevenue ? `${t.taxLine(String(comparedRevenue.year), comparedRevenue.tax_per_100.toFixed(1), comparedRevenue.covered_pct.toFixed(1))} ${t.taxPage(String(comparedRevenue.page))}` : null}
					taxDetail={comparedRevenue ? t.taxDefinition : null}
					verifyNote={compared && activeRow ? (() => {
						const check = cellCheck(compared, activeRow.id);
						return check ? `${jortLabel(check, t)} · ${t.verifiedWords[check.status]}` : null;
					})() : null}
					onpick={(year) => (compared = compared === year ? null : year)}
				/>
			</div>
		</div>
	{/if}

	{#if detailOpen && !narrow && activeRow}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="detail-overlay"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-label={c.lines[activeRow.id].name}
			onclick={(e) => {
				if (e.target === e.currentTarget) detailOpen = false;
			}}
		>
			<div class="detail-sheet">
				<button type="button" class="detail-close" onclick={() => (detailOpen = false)}>{t.detailsClose}</button>
				{@render detailPanel()}
			</div>
		</div>
	{/if}
</div>

<style>
	/*
	 * Layout: an instrument, dense and ruled like a ledger. Desk: a 20rem
	 * column (purse, chosen system, actions) beside the thirty systems in two
	 * columns. Phone: purse bar, systems, dock, top to bottom, one screen.
	 */
	.board {
		--panel-w: 20rem;
		position: relative;
		flex: 1;
		min-block-size: 0;
		block-size: 100%;
		display: grid;
		grid-template-columns: var(--panel-w) minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-areas:
			'purse systems'
			'dock systems';
		column-gap: var(--s-8);
		padding: var(--s-6) var(--s-8);
		font-family: var(--font-sans);
		color: var(--text-primary);
		background: var(--surface-base);
	}
	.num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.muted {
		color: var(--text-muted);
	}

	/* Purse zone */
	.purse-zone {
		grid-area: purse;
		display: grid;
		gap: var(--s-5);
		align-content: start;
	}
	.badge {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-4);
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.rule {
		color: var(--accent);
	}
	.title {
		margin: 0;
		font-family: var(--font-read);
		font-size: var(--step-1);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}
	.top-links {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-1) var(--s-4);
	}
	.help-link {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-sm);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.study-link {
		align-self: start;
		font-size: var(--t-sm);
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.purse {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: var(--s-2) var(--s-4);
		padding: var(--s-5) var(--s-6) var(--s-6);
		border-radius: var(--r-lg);
		background: var(--plate-bg);
		color: var(--plate-ink);
		cursor: grab;
		touch-action: none;
		user-select: none;
		transition: box-shadow var(--dur-fast) var(--ease-out);
	}
	.purse.target {
		box-shadow: 0 0 0 3px var(--accent);
	}
	.purse.refused {
		animation: nudge var(--dur-slow) var(--ease-out);
	}
	@keyframes nudge {
		30% {
			transform: translateX(var(--s-2));
		}
		60% {
			transform: translateX(calc(-1 * var(--s-2)));
		}
	}
	.purse-label {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.purse-amount {
		grid-column: 1 / -1;
		font-size: var(--t-4xl);
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.purse-amount small {
		margin-inline-start: var(--s-3);
		font-size: var(--t-md);
		font-weight: 500;
		opacity: 0.7;
	}
	.purse[data-state='hold'] .purse-amount {
		color: var(--accent);
	}
	.purse-note {
		grid-column: 1 / -1;
		font-size: var(--t-sm);
		opacity: 0.8;
	}
	.meter {
		grid-column: 1 / -1;
		display: block;
		block-size: var(--s-2);
		border-radius: var(--r-full);
		background: oklch(100% 0 0 / 0.12);
		overflow: hidden;
	}
	.meter span {
		display: block;
		block-size: 100%;
		background: var(--accent);
		transition: inline-size var(--dur-normal) var(--ease-out);
	}
	.locked {
		display: flex;
		gap: var(--s-4);
		align-items: flex-start;
	}
	.locked p {
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.45;
		color: var(--text-secondary);
	}
	.locked strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.locked-swatch {
		flex: none;
		inline-size: var(--s-6);
		block-size: var(--s-6);
		margin-block-start: var(--s-1);
		border-radius: var(--r-xs);
		background: repeating-linear-gradient(135deg, var(--text-faint) 0 2px, transparent 2px 5px);
		box-shadow: inset 0 0 0 1px var(--border-default);
	}

	.tools,
	.moves-buttons.idle {
		display: none;
	}
	.move .unit {
		/* The flex gap already separates the amount from its unit. */
		margin-inline-start: calc(-1 * var(--s-1));
	}
	.move {
		white-space: nowrap;
	}
	.move .glyph {
		font-family: var(--font-mono);
		font-size: var(--t-lg);
	}

	/* Systems */
	.systems {
		grid-area: systems;
		display: flex;
		flex-direction: column;
		min-block-size: 0;
		min-inline-size: 0;
	}
	.legend {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2) var(--s-6);
		padding-block-end: var(--s-4);
		border-block-end: var(--rule);
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.legend-notes {
		flex: none;
		margin: 0;
		padding-block: var(--s-2);
		font-size: var(--t-xs);
		line-height: 1.4;
		color: var(--text-muted);
	}
	.legend-notes span + span::before {
		content: ' ';
	}
	/* The budget-wide tax dependence of the compared year, beside the line's own years. */
	.tax-note {
		flex: none;
		display: flex;
		gap: var(--s-3);
		margin: 0;
		padding-block-end: var(--s-2);
		font-size: var(--t-xs);
		line-height: 1.4;
		color: var(--text-secondary);
	}
	.tax-mark {
		flex: none;
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent);
	}
	.basket-short {
		display: none;
	}
	.derived-short {
		display: none;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
	}
	.sw {
		inline-size: var(--s-6);
		block-size: var(--s-3);
		border-radius: var(--r-xs);
	}
	.sw.plan {
		background: var(--text-faint);
		opacity: 0.55;
	}
	.sw.year {
		background: var(--text-muted);
		opacity: 0.7;
	}
	.sw.mine {
		background: var(--accent);
	}
	.scale {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.link {
		margin-inline-start: auto;
		min-block-size: var(--s-9);
		padding-inline: var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.years {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}
	.chart-btn {
		display: inline-grid;
		place-items: center;
		min-block-size: var(--s-8);
		min-inline-size: var(--s-8);
		padding: 0;
		border: 0;
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
	}
	.years svg path,
	.years-tool svg path,
	.chart-btn svg path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linejoin: round;
	}
	.years svg circle,
	.years-tool svg circle,
	.chart-btn svg circle {
		fill: var(--accent);
	}
	.year {
		min-block-size: var(--s-8);
		padding-inline: var(--s-3);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-muted);
		font: 500 var(--t-xs) var(--font-mono);
		cursor: pointer;
	}
	.year[aria-pressed='true'] {
		background: var(--surface-raised);
		border-color: var(--text-muted);
		color: var(--text-primary);
	}
	.year[aria-pressed='false'] {
		text-decoration: line-through;
	}
	.year:focus-visible,
	.tool:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.years-tool {
		display: none;
	}
	.history {
		display: grid;
		gap: var(--s-2);
		padding-block-start: var(--s-3);
		border-block-start: var(--rule);
	}
	.history-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.history ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 3px;
	}
	.history li {
		display: grid;
		grid-template-columns: 6rem minmax(0, 1fr) 7ch;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	.h-track {
		block-size: 6px;
	}
	.h-track span {
		display: block;
		block-size: 100%;
		border-start-end-radius: 3px;
		border-end-end-radius: 3px;
		background: var(--text-faint);
		opacity: 0.55;
	}
	.history li.draft .h-track span {
		background: var(--text-secondary);
		opacity: 0.8;
	}
	.history li.mine .h-track span {
		background: var(--accent);
		opacity: 1;
	}
	.history li.mine {
		color: var(--text-primary);
		font-weight: 600;
	}
	.h-val {
		text-align: end;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.history-title {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.history-title .num {
		letter-spacing: 0;
		text-transform: none;
	}
	.history-change {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	.history-caveat {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	/* With the years shown, the year list carries the plan and yours; the one-line figures step aside. */
	.chosen-figs.has-history {
		display: none;
	}
	td.past,
	th.past {
		color: var(--text-muted);
	}
	.list {
		flex: 1;
		min-block-size: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: var(--s-8);
		padding-block-start: var(--s-2);
		outline: none;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* Below 1,100 pixels the names need the full width: one scrolling column,
	   and the axis at the top of that column already carries the scale. */
	@media (max-width: 1099px) {
		.scale {
			display: none;
		}
		.list {
			display: flex;
			flex-direction: column;
			overflow-y: auto;
		}
		.col {
			display: flex;
			flex-direction: column;
			flex: none;
		}
		.axis {
			block-size: var(--s-7);
		}
		.slot {
			flex: none;
			min-block-size: 3rem;
		}
	}
	.list:focus-visible {
		box-shadow: var(--ring);
		border-radius: var(--r-md);
	}
	.col {
		position: relative;
		display: grid;
		grid-template-rows: var(--s-7) repeat(var(--rows, 8), minmax(0, 1fr));
		min-block-size: 0;
	}
	.axis {
		position: relative;
		margin-inline: var(--s-5) var(--s-4);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.axis span {
		position: absolute;
		inset-block-end: var(--s-1);
		transform: translateX(-50%);
	}
	:global([dir='rtl']) .axis span {
		transform: translateX(50%);
	}
	.axis span:first-child {
		transform: none;
	}
	.slot {
		min-block-size: 0;
		border-block-end: var(--rule);
	}
	.board.carrying .slot {
		cursor: grabbing;
	}
	.table-wrap {
		flex: 1;
		min-block-size: 0;
		overflow: auto;
	}
	table {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--t-base);
	}
	th,
	td {
		padding: var(--s-3) var(--s-4);
		border-block-end: var(--rule);
		text-align: end;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	th[scope='row'],
	thead th:first-child {
		text-align: start;
		font-family: var(--font-sans);
		font-weight: 500;
	}
	thead th {
		font-size: var(--t-xs);
		color: var(--text-muted);
		font-weight: 500;
	}
	.lockrow {
		color: var(--text-muted);
	}
	tfoot th,
	tfoot td {
		font-weight: 600;
		border-block-end: none;
	}

	/* Dock */
	.dock {
		grid-area: dock;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		min-block-size: 0;
		padding-block-start: var(--s-5);
	}
	/* The chosen card gives way before the actions: the moves log shrinks first, then the card scrolls. */
	.chosen {
		flex: 0 0 auto;
		min-block-size: 0;
		overflow-y: auto;
		display: grid;
		gap: var(--s-3);
		padding: var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-raised);
	}
	.chosen p {
		margin: 0;
	}
	.chosen-name {
		font-weight: 600;
		font-size: var(--t-lg);
	}
	.chosen-figs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1) var(--s-5);
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.chosen-note,
	.howto {
		font-size: var(--t-sm);
		line-height: 1.45;
		color: var(--text-muted);
	}
	.moves-buttons {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--s-3);
	}
	.details-toggle,
	.chart-link {
		justify-self: start;
		min-block-size: var(--s-8);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		font: 500 var(--t-xs) var(--font-sans);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.dock-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-5);
	}
	.detail {
		display: grid;
		gap: var(--s-3);
		padding-block-start: var(--s-3);
		border-block-start: var(--rule);
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	.detail-name {
		margin: 0;
		font-weight: 600;
		font-size: var(--t-sm);
		color: var(--text-primary);
	}
	.detail-verify {
		display: grid;
		gap: var(--s-1);
		padding-block-start: var(--s-3);
		border-block-start: var(--rule);
	}
	.detail-verify ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 2px;
	}
	.detail-verify li {
		display: grid;
		grid-template-columns: 4ch minmax(0, auto) 1fr auto;
		gap: var(--s-3);
		align-items: baseline;
	}
	.dv-year {
		font-weight: 600;
		color: var(--text-primary);
	}
	.dv-page {
		font-family: var(--font-mono);
	}
	.dv-word[data-status='derived'],
	.dv-word[data-status='single'] {
		color: var(--text-muted);
	}
	.detail-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.detail-source {
		margin: 0;
		font-size: var(--t-2xs);
		color: var(--text-muted);
	}
	.detail-mission {
		display: grid;
		gap: var(--s-1);
	}
	.detail-mission-label {
		margin: 0;
		font-weight: 600;
		color: var(--text-primary);
	}
	.detail-page {
		font-family: var(--font-mono);
		font-weight: 400;
		color: var(--text-muted);
	}
	.detail ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 2px;
	}
	.detail li {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.detail-note {
		margin: 0;
		color: var(--text-muted);
	}
	.detail-overlay {
		position: absolute;
		inset-block: var(--s-6);
		inset-inline-start: calc(var(--panel-w) + var(--s-8) * 2);
		inset-inline-end: var(--s-8);
		z-index: var(--z-sheet);
		display: flex;
		padding: var(--s-3);
		background: var(--surface-base);
		border: var(--rule);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-2);
	}
	/* The chart covers the systems area whole, legend included, and the whole
	   board on a phone, where the board's own year chips are out of reach. */
	.chart-overlay {
		inset-block: 0;
	}
	.detail-sheet {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		inline-size: 100%;
		max-inline-size: 42rem;
		margin-inline: auto;
		min-block-size: 0;
		overflow-y: auto;
		padding: var(--s-4) var(--s-5) var(--s-5);
	}
	.detail-close {
		align-self: flex-end;
		min-block-size: var(--s-8);
		padding-inline: var(--s-4);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-primary);
		font: 500 var(--t-xs) var(--font-sans);
		cursor: pointer;
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.detail-action {
		min-block-size: var(--s-8);
		padding-inline: var(--s-3);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-primary);
		font: 500 var(--t-xs) var(--font-sans);
		cursor: pointer;
	}
	.move {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-inline-size: 0;
		min-block-size: var(--touch);
		padding-inline: var(--s-2);
		border-radius: var(--r-md);
		font: 600 var(--t-md) var(--font-sans);
		cursor: pointer;
		touch-action: none;
		user-select: none;
	}
	.take {
		border: 1px solid var(--border-strong);
		background: var(--surface-base);
		color: var(--text-primary);
	}
	.give {
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-text);
	}
	.give[aria-disabled='true'] {
		background: transparent;
		color: var(--text-muted);
		border-color: var(--border-default);
	}
	.move:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.message {
		min-block-size: 2.6em;
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.35;
		color: var(--text-secondary);
	}
	.ledger {
		flex: 1 1 0;
		min-block-size: 0;
		overflow: hidden;
	}
	.dock > .message,
	.dock > .actions,
	.dock > .interim {
		flex: none;
	}
	.ledger-title {
		margin: 0 0 var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.ledger ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--s-1);
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.ledger li:first-child {
		color: var(--text-primary);
	}
	.ledger p {
		margin: 0;
		font-size: var(--t-sm);
	}
	.actions {
		margin-block-start: auto;
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}
	.keep-choice {
		flex: 1 1 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--s-2) var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.keep-choice input {
		flex: none;
		inline-size: 1.1rem;
		block-size: 1.1rem;
		margin-block-start: 0.15em;
		accent-color: var(--accent);
	}
	.keep-tick {
		font-weight: 600;
		color: var(--text-primary);
	}
	.keep-note {
		flex-basis: 100%;
		padding-inline-start: calc(1.1rem + var(--s-3));
		font-size: var(--t-xs);
		line-height: 1.35;
		color: var(--text-muted);
	}
	.keep-hint {
		display: none;
	}
	.ghost {
		flex: 1 1 0;
		white-space: nowrap;
	}
	.ghost,
	.finish {
		min-block-size: var(--s-10);
		padding-inline: var(--s-3);
		border-radius: var(--r-md);
		font: 500 var(--t-base) var(--font-sans);
		cursor: pointer;
	}
	.ghost {
		border: 1px solid var(--border-default);
		background: transparent;
		color: var(--text-primary);
	}
	.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.finish {
		flex-basis: 100%;
		min-block-size: var(--touch);
		border: 1px solid var(--text-primary);
		background: var(--text-primary);
		color: var(--text-inverted);
		font-weight: 600;
	}
	.finish:disabled {
		background: transparent;
		color: var(--text-muted);
		border-color: var(--border-default);
		cursor: not-allowed;
	}
	.short {
		display: none;
	}
	.interim {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	button:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
	[data-dir='more'] {
		color: var(--text-primary);
	}

	.message .alt {
		display: none;
	}
	/* A desk tall enough for the ledger: the newest move shows there, not twice. */
	@media (min-width: 721px) and (min-height: 761px) {
		.message.echo .main {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.message.echo .alt {
			display: inline;
		}
	}

	/* A low desk window: the chosen system's note and the ledger give way first. */
	@media (min-width: 721px) and (max-height: 860px) {
		.chosen-note,
		.ledger,
		.history,
		.howto,
		.keep-note {
			display: none;
		}
		.keep-hint {
			display: inline;
		}
		.chosen {
			flex: 0 1 auto;
		}
		.chosen-figs.has-history {
			display: flex;
		}
		.board {
			padding-block: var(--s-4);
		}
	}

	/* Phone: purse bar, systems, dock. */
	@media (max-width: 720px) {
		.board {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr) auto;
			grid-template-areas: 'purse' 'systems' 'dock';
			padding: 0;
			column-gap: 0;
		}
		.purse-zone {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'study study'
				'purse tools';
			align-items: center;
			gap: var(--s-2) var(--s-3);
			padding: var(--s-2) var(--s-6) var(--s-3);
			border-block-end: var(--rule);
		}
		.top-links {
			grid-area: study;
		}
		.study-link,
		.help-link {
			font-size: var(--t-xs);
		}
		.purse {
			grid-area: purse;
		}
		.tools {
			grid-area: tools;
		}
		.badge,
		.title,
		.locked,
		.meter,
		.legend .link,
		.scale,
		.axis,
		.years,
		.history {
			display: none;
		}
		.years-tool {
			display: inline-grid;
			place-items: center;
		}
		.purse {
			flex: 1;
			grid-template-columns: auto auto 1fr;
			align-items: center;
			gap: 0 var(--s-4);
			padding: var(--s-2) var(--s-5);
			min-block-size: var(--touch);
			border-radius: var(--r-md);
		}
		.purse-label,
		.purse-amount,
		.purse-note {
			grid-row: 1;
			grid-column: auto;
		}
		.purse-amount {
			font-size: var(--t-2xl);
		}
		.purse-note {
			font-size: var(--t-xs);
			line-height: 1.2;
		}
		.tools {
			display: flex;
			gap: var(--s-2);
		}
		.tool {
			inline-size: var(--touch);
			block-size: var(--touch);
			border: 1px solid var(--border-default);
			border-radius: var(--r-md);
			background: transparent;
			color: var(--text-primary);
			font: 500 var(--t-xl) var(--font-mono);
			cursor: pointer;
		}
		.tool:disabled {
			opacity: 0.4;
		}
		.systems {
			padding-inline: var(--s-4);
		}
		.legend {
			gap: var(--s-1) var(--s-5);
			padding-block: var(--s-2);
			font-size: var(--t-xs);
		}
		/* Twenty-two systems do not fit a phone screen: the list scrolls inside the board, the purse and dock stay put. */
		.list {
			display: flex;
			flex-direction: column;
			padding-block-start: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
		.col {
			display: flex;
			flex-direction: column;
			flex: none;
		}
		.slot {
			flex: none;
			min-block-size: 3rem;
		}
		.dock {
			position: relative;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'chosen finish'
				'keep keep';
			align-items: end;
			gap: var(--s-2) var(--s-4);
			padding: var(--s-3) var(--s-6) calc(var(--s-3) + env(safe-area-inset-bottom, 0px));
			border-block-start: var(--rule);
			background: var(--surface-raised);
		}
		.chosen {
			grid-area: chosen;
			padding: 0;
			border: none;
			background: none;
			gap: var(--s-2);
		}
		.chosen-name {
			font-size: var(--t-base);
			line-height: 1.2;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
		.chosen-figs {
			display: none;
		}
		.chosen-note,
		.ledger,
		.howto {
			display: none;
		}
		.phone-howto {
			display: block;
			font-size: var(--t-xs);
			color: var(--text-muted);
		}
		.legend-definitions {
			display: none;
		}
		.basket-short {
			display: inline;
		}
		.derived-short {
			display: inline;
		}
		.keep-hint {
			display: inline;
		}
		.purse[data-state='empty'] .purse-note {
			display: none;
		}
		.keep-choice {
			padding-block-end: var(--s-2);
		}
		.legend-notes {
			font-size: var(--t-2xs);
			padding-block: var(--s-1);
		}
		.detail {
			max-block-size: 38vh;
			overflow-y: auto;
		}
		/* The chart sheet owns the whole phone screen. */
		.chart-overlay {
			inset: 0;
			padding: 0;
			border: 0;
			border-radius: 0;
		}
		.chart-overlay .detail-sheet {
			max-inline-size: none;
			padding: var(--s-3) var(--s-6) var(--s-6);
		}
		.details-toggle,
		.detail-action {
			min-block-size: var(--touch);
		}
		.moves-buttons.idle {
			display: grid;
		}
		.moves-buttons {
			gap: var(--s-3);
		}
		.move {
			padding-inline: var(--s-2);
			font-size: var(--t-base);
			white-space: nowrap;
		}
		.move .unit {
			display: none;
		}
		/* A refusal or the last move shows above the dock for a moment, without moving the rows. */
		.message {
			position: absolute;
			inset-block-end: calc(100% + var(--s-2));
			inset-inline: var(--s-6);
			min-block-size: 0;
			padding: var(--s-3) var(--s-4);
			border-radius: var(--r-md);
			background: var(--plate-bg);
			color: var(--plate-ink);
			font-size: var(--t-sm);
			box-shadow: var(--elev-2);
			pointer-events: none;
		}
		.message:empty,
		.message.ready {
			display: none;
		}
		.actions {
			display: contents;
		}
		.ghost,
		.interim {
			display: none;
		}
		.keep-choice {
			grid-area: keep;
			font-size: var(--t-xs);
		}
		.keep-note {
			display: none;
		}
		.finish {
			grid-area: finish;
			flex: none;
			min-inline-size: 5.5rem;
			font-size: var(--t-base);
		}
		.long {
			display: none;
		}
		.short {
			display: inline;
		}
	}
</style>
