<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { FIGURES } from '$lib/budget-study/figures';
	import { copyFor } from './copy';
	import { boardCopyFor } from './board-copy';
	import { linesFrom, type LineId } from './lines';
	import * as B from './board';
	import { lineDifference } from './diff';
	import { dragMoney, flyCoin } from './drag';
	import SystemRow, { fmtMd, signed } from './SystemRow.svelte';

	/**
	 * The Treasury board, one screen on a desk and on a phone.
	 *
	 * Desk: the purse, the spent-before-you-start block, the chosen system with
	 * Take and Give, the last moves and the actions sit in a column; the sixteen
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
		onfinish
	}: {
		mode?: B.StartMode;
		rule?: B.MoveRule;
		onfinish?: (game: B.BoardState, board: B.Board) => void;
	} = $props();

	const lines = linesFrom(FIGURES.rows);
	const board: B.Board = { lines };
	const start = () => B.startBoard(board, untrack(() => mode), untrack(() => rule));
	let game: B.BoardState = $state(start());

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
	const columns = $derived([rows.slice(0, half), rows.slice(half)]);
	const debt = lines.locked.find((l) => l.id === 'debt')!;
	const reserve = lines.locked.find((l) => l.id === 'reserve')!;
	const lockedTotal = lines.locked.reduce((s, l) => s + l.draft, 0);

	let active = $state<LineId | null>(null);
	let carrying = $state<string | null>(null);
	let over = $state<string | null>(null);
	let refusedId = $state<string | null>(null);
	let message = $state('');
	let view = $state<'bars' | 'table'>('bars');
	let listEl = $state<HTMLElement | undefined>(undefined);
	let rootEl = $state<HTMLElement | undefined>(undefined);

	const activeRow = $derived(active ? rows.find((r) => r.id === active)! : null);
	const takeMd = $derived(active ? B.takeAmount(board, game, active) : 0);
	const giveMd = $derived(active ? B.giveAmount(board, game, active) : 0);
	const stepOf = (id: LineId) => (rule === 'step' ? fmtMd(B.stepMd(B.findLine(board, id))) : '');
	const unitLabel = (id: string) => {
		if (id === 'purse') return `${fmtMd(rule === 'coin' ? Math.min(B.COIN_MD, Math.max(P, 0)) : P)} MD`;
		const amount = B.takeAmount(board, game, id as LineId);
		return `${fmtMd(amount || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, id as LineId))))} MD`;
	};

	function describe(entry: B.LogEntry): string {
		const n = (id: LineId | null) => (id ? c.lines[id].name : '');
		if (entry.kind === 'take') return t.took(fmtMd(entry.md), n(entry.from));
		if (entry.kind === 'give') return t.gave(fmtMd(entry.md), n(entry.to));
		if (entry.kind === 'move')
			return Math.abs(entry.md - entry.mdIn) < 1e-9
				? t.moved(fmtMd(entry.md), n(entry.from), n(entry.to))
				: t.movedStep(fmtMd(entry.md), fmtMd(entry.mdIn), n(entry.from), n(entry.to));
		return t.kept;
	}
	const recent = $derived(game.log.slice(-4).reverse().map(describe));

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
		message = describe(entry);
		return true;
	}

	function select(id: string) {
		if (id === 'purse') return;
		active = id as LineId;
		message = '';
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
				message = t.carrying(unitLabel(active).replace(' MD', ''), nameOf(active));
			} else if (carrying !== active) moveMoney(carrying, active);
		} else if (e.key === 'Escape' && carrying) {
			carrying = null;
			message = '';
		} else return;
		e.preventDefault();
	}

	function undo() {
		game = B.undo(game);
		message = '';
	}
	function reset() {
		game = start();
		active = null;
		message = '';
	}
	function keep() {
		game = B.keepDraft(board, game);
		message = t.kept;
	}

	onMount(() => {
		if (!listEl) return;
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
</script>

<svelte:window onpointerup={stopHold} onblur={stopHold} />

<div class="board" class:carrying={!!carrying} data-rule={rule} bind:this={rootEl}>
	<!-- The purse, with what is spent before you start. -->
	<section class="purse-zone" aria-label={t.purse}>
		<p class="badge">{t.badge}<span class="rule">{t.rule[rule]}</span></p>
		<h1 class="title">{t.title}</h1>

		<div class="purse" class:target={over === 'purse'} class:refused={refusedId === 'purse'} data-drop="purse" data-state={purseState}>
			<span class="purse-label">{t.purse}</span>
			<span class="purse-amount num">{fmtMd(Math.max(P, 0))}<small>{t.unit}</small></span>
			<span class="purse-note">
				{purseState === 'empty' ? t.purseEmpty : purseState === 'leftover' ? t.purseLeftover : t.purseToPlace}
			</span>
			<span class="meter" aria-hidden="true"><span style:inline-size="{Math.min(100, (Math.max(P, 0) / lines.envelope) * 100)}%"></span></span>
		</div>
		<div class="tools">
			<button type="button" class="tool" onclick={undo} disabled={game.snapshots.length === 0} aria-label={t.undo} title={t.undo}><span aria-hidden="true">↶</span></button>
			<button type="button" class="tool" onclick={() => (view = view === 'bars' ? 'table' : 'bars')} aria-pressed={view === 'table'} aria-label={t.table} title={t.table}><span aria-hidden="true">{view === 'bars' ? '☰' : '▥'}</span></button>
		</div>

		<div class="locked">
			<span class="locked-swatch" aria-hidden="true"></span>
			<p><strong>{t.lockedTitle}: <span class="num">{fmtMd(lockedTotal)} MD</span></strong> {t.lockedBody(fmtMd(debt.draft), fmtMd(reserve.draft))}</p>
		</div>
	</section>

	<!-- The systems. -->
	<section class="systems" aria-label={c.board.systems}>
		<div class="legend">
			<span class="key"><span class="sw plan" aria-hidden="true"></span>{t.legendPlan}</span>
			<span class="key"><span class="sw mine" aria-hidden="true"></span>{t.legendYours}</span>
			<span class="scale">{t.scale(fmtMd(SCALE))}</span>
			<button type="button" class="link" onclick={() => (view = view === 'bars' ? 'table' : 'bars')} aria-pressed={view === 'table'}>
				{view === 'bars' ? t.table : t.bars}
			</button>
		</div>

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
					<div class="col">
						<div class="axis" aria-hidden="true">
							{#each TICKS as v (v)}
								<span style:inset-inline-start="{(v / SCALE) * 100}%">{v === 0 ? '0' : `${v / 1000}k`}</span>
							{/each}
						</div>
						{#each col as r (r.id)}
							<div
								class="slot"
								id="sys-{r.id}"
								role="option"
								aria-selected={active === r.id}
								aria-label={t.rowAria(
									c.lines[r.id].name,
									fmtMd(r.plan),
									fmtMd(r.yours),
									r.diff.direction === 'same' ? t.same : `${signed(r.diff.deltaMd)} MD, ${signed(r.diff.deltaPct, 1)}%, ${r.diff.direction === 'more' ? t.more : t.less}`
								)}
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
									active={active === r.id}
									target={over === r.id}
									source={carrying === r.id}
									refused={refusedId === r.id}
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
						<tr><th scope="col">{t.th.system}</th><th scope="col">{t.th.plan}</th><th scope="col">{t.th.yours}</th><th scope="col">{t.th.md}</th><th scope="col">{t.th.pct}</th></tr>
					</thead>
					<tbody>
						{#each rows as r (r.id)}
							<tr>
								<th scope="row">{c.lines[r.id].name}</th>
								<td>{fmtMd(r.plan)}</td>
								<td>{fmtMd(r.yours)}</td>
								<td>{signed(r.diff.deltaMd)}</td>
								<td>{signed(r.diff.deltaPct, 1)}</td>
							</tr>
						{/each}
						{#each lines.locked as l (l.id)}
							<tr class="lockrow"><th scope="row">{c.lines[l.id].name}</th><td>{fmtMd(l.draft)}</td><td>{fmtMd(l.draft)}</td><td>0</td><td>0.0</td></tr>
						{/each}
					</tbody>
					<tfoot>
						<tr><th scope="row">{t.total}</th><td>{fmtMd(lines.total)}</td><td>{fmtMd(lines.total - P)}</td><td>{signed(-P)}</td><td></td></tr>
					</tfoot>
				</table>
			</div>
		{/if}
	</section>

	<!-- The chosen system, the last moves and the actions. -->
	<section class="dock" aria-label={t.change}>
		<div class="chosen">
			{#if activeRow}
				<p class="chosen-name">{c.lines[activeRow.id].name}</p>
				<p class="chosen-figs num">
					<span>{t.plan} {fmtMd(activeRow.plan)}</span>
					<span>{t.yours} {fmtMd(activeRow.yours)}</span>
					<span data-dir={activeRow.diff.direction}>{t.change} <bdi dir="ltr">{signed(activeRow.diff.deltaMd)} · {signed(activeRow.diff.deltaPct, 1)}%</bdi></span>
				</p>
				<p class="chosen-note">{c.lines[activeRow.id].note}</p>
				<div class="moves-buttons">
					<button
						type="button"
						class="move take"
						disabled={takeMd === 0}
						aria-label={t.takeAria(fmtMd(takeMd || B.COIN_MD), c.lines[activeRow.id].name)}
						onpointerdown={(e) => hold(e, activeRow.id, 'purse')}
						onclick={(e) => press(e, activeRow.id, 'purse')}
					>
						<span class="glyph" aria-hidden="true">−</span>{t.take(fmtMd(takeMd || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, activeRow.id)))))}<span class="unit">{t.unit}</span>
					</button>
					<button
						type="button"
						class="move give"
						aria-disabled={giveMd === 0}
						aria-label={t.giveAria(fmtMd(giveMd || B.COIN_MD), c.lines[activeRow.id].name)}
						onpointerdown={(e) => (giveMd === 0 ? refuse(B.giveProblem(board, game, activeRow.id) ?? 'purse', activeRow.id) : hold(e, 'purse', activeRow.id))}
						onclick={(e) => (giveMd === 0 ? e.detail === 0 && refuse(B.giveProblem(board, game, activeRow.id) ?? 'purse', activeRow.id) : press(e, 'purse', activeRow.id))}
					>
						{t.give(fmtMd(giveMd || (rule === 'coin' ? B.COIN_MD : B.stepMd(B.findLine(board, activeRow.id)))))}<span class="unit">{t.unit}</span><span class="glyph" aria-hidden="true">+</span>
					</button>
				</div>
			{:else}
				<p class="chosen-name muted">{t.pick}</p>
				<p class="howto">{t.howTo[rule]}</p>
				<div class="moves-buttons idle">
					<button type="button" class="move take" onclick={keep}>{t.keep}</button>
					<button type="button" class="move take" onclick={reset}>{t.reset}</button>
				</div>
			{/if}
		</div>

		<p class="message" class:ready={!message && done} role="status" aria-live="polite">{message || (done ? (purseState === 'leftover' ? t.readyBand : t.ready) : '')}</p>

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
			<button type="button" class="ghost" onclick={undo} disabled={game.snapshots.length === 0}>{t.undo}</button>
			<button type="button" class="ghost" onclick={keep}>{t.keep}</button>
			<button type="button" class="ghost" onclick={reset}>{t.reset}</button>
			<button type="button" class="finish" disabled={!done} onclick={() => onfinish?.(game, board)}>
				{#if done}{t.finish}{:else}<span class="long">{t.finishNeeds(fmtMd(Math.abs(P)))}</span><span class="short">{t.finish}</span>{/if}
			</button>
		</div>
		{#if t.interim}<p class="interim">{t.interim}</p>{/if}
	</section>
</div>

<style>
	/*
	 * Layout: an instrument, dense and ruled like a ledger. Desk: a 20rem
	 * column (purse, chosen system, actions) beside the sixteen systems in two
	 * columns. Phone: purse bar, systems, dock, top to bottom, one screen.
	 */
	.board {
		--panel-w: 20rem;
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
		margin-inline-start: 0.3em;
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
	.list {
		flex: 1;
		min-block-size: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: var(--s-8);
		padding-block-start: var(--s-2);
		outline: none;
	}
	.list:focus-visible {
		box-shadow: var(--ring);
		border-radius: var(--r-md);
	}
	.col {
		position: relative;
		display: grid;
		grid-template-rows: var(--s-7) repeat(8, minmax(0, 1fr));
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
	.chosen {
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
		grid-template-columns: 1fr 1fr;
		gap: var(--s-4);
	}
	.move {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		min-block-size: var(--touch);
		padding-inline: var(--s-4);
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
		min-block-size: 0;
		overflow: hidden;
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

	/* A low desk window: the chosen system's note and the ledger give way first. */
	@media (min-width: 721px) and (max-height: 760px) {
		.chosen-note,
		.ledger {
			display: none;
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
			display: flex;
			align-items: center;
			gap: var(--s-3);
			padding: var(--s-3) var(--s-6);
			border-block-end: var(--rule);
		}
		.badge,
		.title,
		.locked,
		.meter,
		.legend .link,
		.scale,
		.axis {
			display: none;
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
		.list {
			display: flex;
			flex-direction: column;
			padding-block-start: 0;
		}
		.col {
			display: flex;
			flex-direction: column;
			flex: 8 1 0;
		}
		.slot {
			flex: 1 1 0;
			min-block-size: 0;
		}
		.dock {
			position: relative;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'chosen finish';
			align-items: end;
			gap: var(--s-4);
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
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.chosen-figs {
			display: none;
		}
		.chosen-note,
		.ledger,
		.howto {
			display: none;
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
			grid-area: finish;
			margin: 0;
		}
		.ghost,
		.interim {
			display: none;
		}
		.finish {
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
