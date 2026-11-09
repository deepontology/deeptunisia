<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { FIGURES } from '$lib/budget-study/figures';
	import { copyFor } from './copy';
	import { linesFrom, MAX_LEVEL, type LineId } from './lines';
	import * as B from './board';
	import type { Board, BoardState, LogEntry } from './board';
	import { lineDifference, type Difference } from './diff';
	import { isRefused, transferState } from './dragdrop';
	import { untrack } from 'svelte';

	/**
	 * The Treasury board. Systems are tanks on one scale in dinars. The purse
	 * holds what is not yet placed. Take moves money from a system to the purse;
	 * give moves money from the purse into a system. The board finishes when the
	 * purse is within tolerance. Every figure is a draft figure from the figures
	 * file.
	 *
	 * One screen, two shapes: on a desk the purse and controls sit in a left
	 * column and the systems fill a grouped grid on the right; on a phone the
	 * purse is a sticky bar and the systems are a grouped list of rows with 44px
	 * controls. The board itself never scrolls; only the intro, questions and
	 * result screens do.
	 */
	let {
		mode = 'empty',
		onfinish
	}: {
		mode?: B.StartMode;
		onfinish?: (game: B.BoardState, board: B.Board) => void;
	} = $props();

	const lines = linesFrom(FIGURES.rows);
	const board: Board = { lines };
	let game: BoardState = $state(B.startBoard(board, untrack(() => mode)));
	let view = $state<'bars' | 'table'>('bars');
	let refusal = $state('');

	const c = $derived(copyFor(app.locale));
	const unit = $derived(c.unit);
	const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
	const scaleMax = Math.max(...lines.movable.map((l) => l.draft));
	const placedMd = $derived(B.placed(board, game));
	const P = $derived(B.purse(board, game));
	const done = $derived(B.finished(board, game));
	const kept = $derived(B.atDraft(game));

	const rows = $derived(
		lines.movable.map((l) => {
			const level = game.levels[l.id];
			const amount = B.amountOf(l, level);
			return {
				line: l,
				level,
				amount,
				step: B.stepMd(l),
				diff: lineDifference(l.draft, amount),
				takeOk: B.takeProblem(game, l.id) === null,
				giveOk: B.giveProblem(board, game, l.id) === null
			};
		})
	);

	/** The three groups, in the order the brief fixes them. Education and subsidies are the largest and span two tracks. */
	const GROUPS = [
		{ key: 'people', ids: ['education', 'higher_education', 'health', 'social'] },
		{ key: 'state', ids: ['subsidies', 'police', 'army', 'justice', 'presidency', 'government'] },
		{
			key: 'economy',
			ids: ['energy_trade', 'farming', 'roads_housing', 'youth_sports', 'culture', 'other']
		}
	] as const satisfies ReadonlyArray<{
		key: 'people' | 'state' | 'economy';
		ids: readonly LineId[];
	}>;
	const groups = $derived(
		GROUPS.map((g) => ({
			key: g.key,
			rows: g.ids.map((id) => rows.find((r) => r.line.id === id)!).filter(Boolean)
		}))
	);
	/** Every system in the order the board shows them: the order the arrow keys walk. */
	const order = $derived(groups.flatMap((g) => g.rows.map((r) => r.line.id)));

	/** The last five moves, newest first, for the desk ledger strip. */
	const ledger = $derived(game.log.slice(-5).reverse());
	const lockedTotal = lines.locked.reduce((s, l) => s + l.draft, 0);

	/** Coin marks: one per eighth of the envelope still held in the purse. */
	const COIN_SLOTS = Array.from({ length: 8 }, (_, i) => i);
	const held = $derived(
		Math.round(Math.max(0, Math.min(1, P / lines.envelope)) * COIN_SLOTS.length)
	);
	/**
	 * The direction of the last move lives in state, not in the log: undo and a
	 * step too small to change the coin count still animate the way the money
	 * went. +1 is a take (into the purse), -1 is a give (out of it).
	 */
	let coinDir = $state<0 | 1 | -1>(0);
	/** One entry per undoable move: the direction for the animation and how many log entries it wrote. */
	let moveLog = $state<{ dir: 0 | 1 | -1; steps: number }[]>([]);
	let moveSeq = $state(0);

	/** Pointer drag: what is being dragged and which target it is over. */
	type DragFrom = { kind: 'system'; id: LineId } | { kind: 'purse' };
	let drag = $state<DragFrom | null>(null);
	let dropAt = $state<LineId | 'purse' | null>(null);

	/** The coin that crosses the board on a take or a give, in transform only. */
	let boardEl = $state<HTMLElement>();
	let purseEl = $state<HTMLElement>();
	let flight = $state<{ fx: number; fy: number; tx: number; ty: number; seq: number } | null>(null);
	let flightTimer: ReturnType<typeof setTimeout> | undefined;

	/** The note dialog and the rules dialog (the full hint on phone). */
	let noteDialog = $state<HTMLDialogElement>();
	let hintDialog = $state<HTMLDialogElement>();
	let noteLine = $state<LineId | null>(null);
	let noteTrigger: HTMLElement | null = null;

	/** Signed MD for the difference. The sign is the first direction signal; the words repeat it. */
	function diffMd(d: Difference): string {
		if (d.direction === 'same') return `0\u00a0${unit}`;
		return `${d.deltaMd > 0 ? '+' : '−'}${fmt(Math.abs(d.deltaMd))}\u00a0${unit}`;
	}
	function pctText(d: Difference): string {
		if (d.direction === 'same') return '0.0%';
		return `${d.deltaPct > 0 ? '+' : '−'}${Math.abs(d.deltaPct).toFixed(1)}%`;
	}
	function diffWords(d: Difference): string {
		return d.direction === 'more'
			? c.board.moreThanPlan
			: d.direction === 'less'
				? c.board.lessThanPlan
				: c.board.sameAsPlan;
	}
	function ledgerText(entry: LogEntry): string {
		if (entry.kind === 'keep') return c.board.kept;
		const name = entry.line ? c.lines[entry.line].name : '';
		return entry.kind === 'take'
			? c.board.tookFrom(`${fmt(entry.md)}`, name)
			: c.board.gaveTo(`${fmt(entry.md)}`, name);
	}
	/** The short refusal for a give: the cap first, then the purse. */
	function giveReason(r: (typeof rows)[number]): string {
		if (r.giveOk) return '';
		return r.level >= MAX_LEVEL ? c.board.reasonAtMax : c.board.reasonNoPurse(fmt(P));
	}
	function takeReason(r: (typeof rows)[number]): string {
		return r.takeOk ? '' : c.board.reasonAtZero;
	}

	const drop = $derived(planDrop(drag, dropAt));

	/**
	 * What a drop between these two ends would do, or null when there is no
	 * target or the target is the system the drag came from. The text is the cue
	 * shown while dragging: what the drop does, or the words of the refusal.
	 */
	function planDrop(
		active: DragFrom | null,
		target: LineId | 'purse' | null
	): { target: 'purse' | LineId; ok: boolean; text: string } | null {
		if (!active || target === null) return null;
		if (active.kind === 'purse') {
			if (target === 'purse') return null;
			const row = rows.find((r) => r.line.id === target);
			if (!row) return null;
			if (row.giveOk) return { target, ok: true, text: c.board.give(fmt(row.step)) };
			return {
				target,
				ok: false,
				text:
					row.level >= MAX_LEVEL
						? c.board.reasonAtMax
						: c.board.notEnough(fmt(P), fmt(row.step))
			};
		}
		if (target === 'purse') {
			const row = rows.find((r) => r.line.id === active.id);
			if (!row) return null;
			return row.takeOk
				? { target, ok: true, text: c.board.take(fmt(row.step)) }
				: { target, ok: false, text: c.board.reasonAtZero };
		}
		if (target === active.id) return null;
		const from = rows.find((r) => r.line.id === active.id);
		const to = rows.find((r) => r.line.id === target);
		if (!from || !to) return null;
		if (!from.takeOk) return { target, ok: false, text: c.board.reasonAtZero };
		if (to.level >= MAX_LEVEL) return { target, ok: false, text: c.board.reasonAtMax };
		const afterTake = P + from.step;
		if (afterTake + 1e-6 < to.step)
			return { target, ok: false, text: c.board.notEnough(fmt(afterTake), fmt(to.step)) };
		return { target, ok: true, text: c.board.give(fmt(to.step)) };
	}
	function isTarget(id: LineId | 'purse', ok: boolean): boolean {
		const d = drop;
		return !!d && d.target === id && d.ok === ok;
	}
	function systemEl(id: LineId): HTMLElement | null {
		return document.getElementById(`sys-${id}`);
	}
	function focusSystem(id: LineId) {
		systemEl(id)?.focus();
	}
	/** The refusal in words for a transfer, from the same rules the cue uses. */
	function transfer(fromId: LineId, toId: LineId) {
		const result = transferState(board, game, fromId, toId);
		if (isRefused(result)) {
			const plan = planDrop({ kind: 'system', id: fromId }, toId);
			refusal = plan && !plan.ok ? plan.text : c.board.reasonAtZero;
			return;
		}
		game = result;
		refusal = '';
		afterMove(0, null, 2);
	}
	function beginDrag(e: PointerEvent, from: DragFrom) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		drag = from;
		dropAt = null;
		refusal = '';
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// The pointer was already released; the drag ends on the next move.
		}
		e.preventDefault();
	}
	function beginPurseDrag(e: PointerEvent) {
		// On touch, only the coin stack is a handle, so the rest of the purse still scrolls.
		if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('.stack')) return;
		beginDrag(e, { kind: 'purse' });
	}
	function dropTargetAt(e: PointerEvent): LineId | 'purse' | null {
		const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
		const holder = under?.closest<HTMLElement>('[data-drop]');
		const value = holder?.dataset.drop ?? '';
		if (value === 'purse') return 'purse';
		return rows.some((r) => r.line.id === value) ? (value as LineId) : null;
	}
	function moveDrag(e: PointerEvent) {
		if (!drag) return;
		dropAt = dropTargetAt(e);
	}
	function cancelDrag() {
		drag = null;
		dropAt = null;
	}
	function endDrag(e: PointerEvent) {
		const active = drag;
		if (!active) return;
		// Trust the release point over the last move, so a fast drag still lands.
		const released = dropTargetAt(e);
		const plan = planDrop(active, released);
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// Nothing captured, nothing to release.
		}
		drag = null;
		dropAt = null;
		if (plan && !plan.ok) {
			// Keep the reason on screen after the pointer is gone.
			refusal = plan.text;
			return;
		}
		if (!plan) return;
		const target = plan.target;
		if (active.kind === 'purse') {
			if (target !== 'purse') give(target, systemEl(target));
			return;
		}
		if (target === 'purse') take(active.id, systemEl(active.id));
		else transfer(active.id, target);
	}
	function rowKey(e: KeyboardEvent, id: LineId) {
		// Only the row itself: arrow keys inside its buttons keep their own meaning.
		if (e.target !== e.currentTarget) return;
		const i = order.indexOf(id);
		if (i < 0) return;
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			const next = order[e.key === 'ArrowUp' ? i - 1 : i + 1];
			if (!next) return;
			e.preventDefault();
			focusSystem(next);
			return;
		}
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const step = e.key === 'ArrowLeft' ? -1 : 1;
		if (e.shiftKey) {
			const to = order[i + step];
			if (to) transfer(id, to);
			return;
		}
		if (step === -1) take(id, systemEl(id));
		else give(id, systemEl(id));
	}

	/** Computes the flight in board-relative pixels so the overlay needs no physical insets. */
	function fly(from: HTMLElement | null, dir: 1 | -1) {
		if (!from || !purseEl || !boardEl) return;
		const a = from.getBoundingClientRect();
		const p = purseEl.getBoundingClientRect();
		const b = boardEl.getBoundingClientRect();
		const cx = b.left + b.width / 2;
		const cy = b.top + b.height / 2;
		const sx = a.left + a.width / 2 - cx;
		const sy = a.top + a.height / 2 - cy;
		const px = p.left + p.width / 2 - cx;
		const py = p.top + p.height / 2 - cy;
		const fx = dir === 1 ? sx : px;
		const fy = dir === 1 ? sy : py;
		const tx = dir === 1 ? px : sx;
		const ty = dir === 1 ? py : sy;
		flight = { fx, fy, tx, ty, seq: moveSeq };
		if (flightTimer) clearTimeout(flightTimer);
		flightTimer = setTimeout(() => (flight = null), 240);
	}
	function afterMove(dir: number, from: HTMLElement | null, steps = 1) {
		coinDir = dir === 0 ? 0 : dir > 0 ? 1 : -1;
		moveLog = [...moveLog, { dir: coinDir, steps }];
		moveSeq += 1;
		if (coinDir !== 0) fly(from, coinDir);
	}
	function take(id: LineId, from: HTMLElement | null) {
		if (!B.takeProblem(game, id)) {
			game = B.take(board, game, id);
			afterMove(1, from);
			refusal = '';
			return;
		}
		refusal = c.board.reasonAtZero;
	}
	function give(id: LineId, from: HTMLElement | null) {
		if (!B.giveProblem(board, game, id)) {
			game = B.give(board, game, id);
			afterMove(-1, from);
			refusal = '';
			return;
		}
		refusal =
			game.levels[id] >= MAX_LEVEL ? c.board.reasonAtMax : c.board.reasonNoPurse(fmt(P));
	}
	function keep() {
		const dir = P > 0.5 ? -1 : P < -0.5 ? 1 : 0;
		game = B.keepDraft(board, game);
		afterMove(dir, null);
		refusal = '';
	}
	function undo() {
		const last = moveLog[moveLog.length - 1] ?? { dir: 0, steps: 1 };
		moveLog = moveLog.slice(0, -1);
		coinDir = last.dir === 0 ? 0 : last.dir === 1 ? -1 : 1;
		moveSeq += 1;
		refusal = '';
		// A transfer wrote two entries, so one undo steps back over both.
		let next = game;
		for (let i = 0; i < last.steps; i++) next = B.undo(next);
		game = next;
	}
	function reset() {
		game = B.startBoard(board, mode);
		moveLog = [];
		coinDir = 0;
		flight = null;
		refusal = '';
		drag = null;
		dropAt = null;
	}
	function finish() {
		if (done) onfinish?.(game, board);
	}
	function openNote(id: LineId, trigger: HTMLElement | null) {
		noteTrigger = trigger;
		noteLine = id;
		noteDialog?.showModal();
	}
	function closeNote() {
		noteDialog?.close();
	}
	function onNoteClose() {
		noteLine = null;
		noteTrigger?.focus();
	}
	const startLabel = $derived(mode === 'draft' ? c.board.startDraft : c.board.startEmpty);
	const balanceText = $derived(
		done && Math.abs(P) < 0.5 ? c.board.balanced : done ? c.board.leftover(fmt(P)) : ''
	);
</script>

<section class="board" bind:this={boardEl} aria-labelledby="h-board" lang={app.locale}>
	<div
		class="purse"
		class:drop-ok={isTarget('purse', true)}
		class:drop-no={isTarget('purse', false)}
		data-drop="purse"
	>
		<p class="purse-label">{c.board.purse}</p>
		<div
			class="purse-main"
			role="status"
			aria-live="polite"
			onpointerdown={beginPurseDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={cancelDrag}
			onlostpointercapture={cancelDrag}
		>
			<div class="stack" bind:this={purseEl} aria-hidden="true">
				{#key held}
					<span class="slots" class:drop={coinDir > 0} class:lift={coinDir < 0}>
						{#each COIN_SLOTS as i (i)}
							<span class="coin" class:on={i < held}></span>
						{/each}
					</span>
				{/key}
			</div>
			<div class="purse-figures">
				<span class="amount purse-value">{fmt(P)} <span class="unit">{unit}</span></span>
				<p class="progress">{c.board.purseProgress(fmt(placedMd), fmt(lines.envelope))}</p>
			</div>
		</div>
		<p class="purse-rule">{c.board.purseHint}</p>
		<button type="button" class="quiet hint-toggle" onclick={() => hintDialog?.showModal()}>
			{c.board.hintToggle}
		</button>
		{#if refusal}
			<p class="refusal" aria-live="polite">{refusal}</p>
		{/if}
		{#if drag && drop}
			<p class="drag-cue" aria-hidden="true">{drop.text}</p>
		{/if}
	</div>

	<div class="side">
		<div class="toolbar">
			<button type="button" class="quiet" onclick={() => (view = view === 'bars' ? 'table' : 'bars')} aria-pressed={view === 'table'}>{c.board.tableView}</button>
			<button type="button" class="quiet" onclick={undo} disabled={game.snapshots.length === 0}>{c.board.undo}</button>
			<button type="button" class="quiet reset" onclick={reset}>{startLabel}</button>
			<button type="button" class="quiet" onclick={keep} disabled={kept}>{c.board.keep}</button>
			<button type="button" class="cta" onclick={finish} disabled={!done}>{c.board.finish}</button>
		</div>

		<div class="locked">
			<h3 class="sub">{c.board.locked}</h3>
			<p class="locked-line">{c.board.lockedText(fmt(lockedTotal))}</p>
			<ul>
				{#each lines.locked as l (l.id)}
					<li>{c.lines[l.id].name}: {fmt(l.draft)} {unit}</li>
				{/each}
			</ul>
		</div>

		<section class="ledger" aria-labelledby="h-ledger">
			<h3 id="h-ledger" class="sub">{c.board.ledger}</h3>
			<ol>
				{#each ledger as entry, i (i + '-' + game.log.length)}
					<li>{ledgerText(entry)}</li>
				{/each}
			</ol>
		</section>
	</div>

	<div class="field">
		<h2 id="h-board" class="title">{c.board.title}</h2>
		<p class="hint">{c.board.hint}</p>
		{#if mode === 'draft'}<p class="note">{c.board.startNote}</p>{/if}

		{#if view === 'bars'}
			<p class="legend">
				<span class="legend-item">
					<span class="swatch plan" aria-hidden="true"></span>{c.board.planLabel}
				</span>
				<span class="legend-item">
					<span class="swatch yours" aria-hidden="true"></span>{c.board.yoursLabel}
				</span>
			</p>
			<div class="systems">
				{#each groups as g (g.key)}
					<section class="group {g.key}" style:--rows={g.rows.length}>
						<h3 class="group-title">{c.board.groups[g.key]}</h3>
						<ul class="group-list">
							{#each g.rows as r (r.line.id)}
								<!-- The row itself takes focus and the arrow keys, as the board's keyboard rules require; ARIA has no focusable list row. -->
								<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<li
									class="system"
									class:wide={r.line.id === 'education' || r.line.id === 'subsidies'}
									class:drop-ok={isTarget(r.line.id, true)}
									class:drop-no={isTarget(r.line.id, false)}
									id="sys-{r.line.id}"
									data-drop={r.line.id}
									tabindex="0"
									onkeydown={(e) => rowKey(e, r.line.id)}
								>
									<span
										class="grip"
										aria-hidden="true"
										onpointerdown={(e) => beginDrag(e, { kind: 'system', id: r.line.id })}
										onpointermove={moveDrag}
										onpointerup={endDrag}
										onpointercancel={cancelDrag}
										onlostpointercapture={cancelDrag}
									></span>
									<div class="system-head">
										<button
											type="button"
											class="name"
											onclick={(e) => openNote(r.line.id, e.currentTarget)}
										>{c.lines[r.line.id].name}</button>
										<span class="delta">
											<span class="delta-fig">{diffMd(r.diff)} · {pctText(r.diff)}</span>
											<span class="delta-words">{diffWords(r.diff)}</span>
										</span>
									</div>
									<div class="bars" aria-hidden="true">
										<span class="track plan">
											<span class="bar plan" data-series="plan" style:inline-size="{(r.line.draft / scaleMax) * 100}%"></span>
										</span>
										<span class="track yours">
											<span class="bar yours" data-series="yours" style:inline-size="{(r.amount / scaleMax) * 100}%"></span>
										</span>
										<span class="tick" style:margin-inline-start="calc({(r.line.draft / scaleMax) * 100}% - var(--s-1))"></span>
										<span class="bar-val plan-val">{fmt(r.line.draft)}</span>
										<span class="bar-val yours-val">{fmt(r.amount)}</span>
									</div>
									<div class="actions">
										<button
											type="button"
											class="take"
											class:refused={!r.takeOk}
											aria-disabled={!r.takeOk}
											aria-label={r.takeOk ? c.board.take(fmt(r.step)) : `${c.board.take(fmt(r.step))}. ${takeReason(r)}`}
											onclick={(e) => take(r.line.id, e.currentTarget)}
										>{c.board.take(fmt(r.step))}</button>
										<button
											type="button"
											class="give"
											class:refused={!r.giveOk}
											aria-disabled={!r.giveOk}
											aria-label={r.giveOk ? c.board.give(fmt(r.step)) : `${c.board.give(fmt(r.step))}. ${giveReason(r)}`}
											onclick={(e) => give(r.line.id, e.currentTarget)}
										>{c.board.give(fmt(r.step))}</button>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{:else}
			<div class="table-wrap">
				<table class="figures">
					<caption class="sr-only">{c.board.systems}</caption>
					<thead>
						<tr>
							<th scope="col">{c.board.systems}</th>
							<th scope="col" class="num">{c.board.draft} ({unit})</th>
							<th scope="col" class="num">{c.board.yours} ({unit})</th>
							<th scope="col" class="num">{c.board.change} ({unit})</th>
							<th scope="col" class="num">{c.board.change} (%)</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as r (r.line.id)}
							<tr>
								<th scope="row">
									<button type="button" class="name" onclick={(e) => openNote(r.line.id, e.currentTarget)}>{c.lines[r.line.id].name}</button>
								</th>
								<td class="num">{fmt(r.line.draft)}</td>
								<td class="num">{fmt(r.amount)}</td>
								<td class="num">{diffMd(r.diff)}</td>
								<td class="num">{pctText(r.diff)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if balanceText}
			<span class="stamp" aria-hidden="true">{balanceText}</span>
		{/if}
	</div>

	{#if flight}
		{#key flight.seq}
			<span
				class="fly"
				aria-hidden="true"
				style="--fx: {flight.fx}px; --fy: {flight.fy}px; --tx: {flight.tx}px; --ty: {flight.ty}px"
			></span>
		{/key}
	{/if}
</section>

<dialog
	class="sheet"
	bind:this={noteDialog}
	onclose={onNoteClose}
	onclick={(e) => {
		if (e.target === noteDialog) closeNote();
	}}
	aria-labelledby="note-title"
>
	{#if noteLine}
		<h3 id="note-title">{c.board.noteTitle}</h3>
		<p class="note-name">{c.lines[noteLine].name}</p>
		<p>{c.lines[noteLine].note}</p>
	{/if}
	<button type="button" class="quiet close" onclick={closeNote}>{c.board.hintClose}</button>
</dialog>

<dialog
	class="sheet"
	bind:this={hintDialog}
	onclick={(e) => {
		if (e.target === hintDialog) hintDialog?.close();
	}}
	aria-label={c.board.hintToggle}
>
	<p>{c.board.hint}</p>
	<button type="button" class="quiet close" onclick={() => hintDialog?.close()}>{c.board.hintClose}</button>
</dialog>

<style>
	.board {
		position: relative;
		display: grid;
		grid-template-columns: minmax(200px, 288px) minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-areas:
			'purse field'
			'side field';
		gap: var(--s-4);
		block-size: 100%;
		padding: var(--s-4) var(--s-6);
	}
	.purse {
		grid-area: purse;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-4);
		background: var(--surface-raised);
		border: var(--rule);
		border-radius: var(--r-md);
	}
	.purse-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
		color: var(--text-muted);
	}
	.purse-main {
		display: flex;
		align-items: stretch;
		gap: var(--s-3);
	}
	.stack {
		flex: none;
		inline-size: var(--s-6);
		block-size: var(--s-11);
		padding: var(--s-1);
		background: var(--surface-base);
		border: var(--rule);
		border-radius: var(--r-sm);
		touch-action: none;
	}
	.slots {
		display: flex;
		flex-direction: column-reverse;
		gap: var(--s-1);
		block-size: 100%;
		inline-size: 100%;
	}
	.coin {
		flex: 1 1 0;
		min-block-size: 0;
		border-radius: var(--r-full);
		background: var(--surface-base);
	}
	.coin.on {
		background: var(--accent);
	}
	.slots.drop .coin.on,
	.slots.lift .coin.on {
		animation: coin-pop var(--dur-fast) var(--ease-out) both;
	}
	.purse-figures {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--s-1);
		min-inline-size: 0;
	}
	.amount {
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
		white-space: nowrap;
	}
	.purse-value {
		font-family: var(--font-mono);
		font-size: var(--step-3);
		font-weight: 500;
		letter-spacing: var(--track-tight);
	}
	.unit {
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.progress {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.purse-rule {
		display: none;
	}
	.hint-toggle {
		display: none;
	}
	.refusal {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--rupture);
	}
	.drag-cue {
		position: absolute;
		inset-block-start: 100%;
		inset-inline: 0;
		z-index: 5;
		margin: 0;
		padding: var(--s-1) var(--s-3);
		background: var(--surface-overlay);
		border-block-end: var(--rule);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.side {
		grid-area: side;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		min-block-size: 0;
		overflow: hidden;
	}
	.toolbar {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--s-2);
	}
	.toolbar .cta {
		grid-column: 1 / -1;
	}
	.locked {
		padding-block: var(--s-3);
		padding-inline: 0;
		border: 0;
		border-block-start: var(--rule);
		border-radius: 0;
		background: transparent;
		color: var(--text-muted);
	}
	.locked .sub {
		margin-block: 0 var(--s-1);
	}
	.locked-line {
		margin: 0;
		font-size: var(--t-sm);
	}
	.locked ul {
		margin: var(--s-1) 0 0;
		padding-inline-start: var(--s-5);
		font-size: var(--t-sm);
	}
	.ledger {
		min-block-size: 0;
		overflow: hidden;
	}
	.ledger .sub {
		margin-block: 0 var(--s-1);
	}
	.ledger ol {
		margin: 0;
		padding-inline-start: var(--s-5);
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.field {
		grid-area: field;
		position: relative;
		display: flex;
		flex-direction: column;
		min-block-size: 0;
	}
	.title {
		font-family: var(--font-read);
		font-size: var(--step-4);
		font-weight: 400;
		line-height: var(--lh-tight);
		letter-spacing: var(--track-tight);
		margin: 0 0 var(--s-2);
	}
	.hint,
	.note {
		margin: 0 0 var(--s-3);
		color: var(--text-muted);
		font-size: var(--t-sm);
		max-inline-size: var(--measure);
	}
	.sub {
		font-size: var(--t-xs);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
		color: var(--text-muted);
		margin: 0;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-1) var(--s-5);
		margin: 0 0 var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
		line-height: 1;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}
	.swatch {
		flex: none;
		inline-size: var(--s-5);
		block-size: var(--s-1);
		border-radius: 0;
	}
	.swatch.plan {
		background: var(--text-muted);
	}
	.swatch.yours {
		background: var(--accent);
	}
	.systems {
		flex: 1;
		min-block-size: 0;
		display: grid;
		grid-auto-rows: minmax(0, 1fr);
		gap: var(--s-3);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-block-size: 0;
	}
	.group-title {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		margin: 0;
		padding-block-end: var(--s-1);
		border-block-end: var(--rule);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-muted);
	}
	.group-list {
		flex: 1;
		min-block-size: 0;
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-auto-rows: minmax(0, 1fr);
		gap: 0;
	}
	.group.people .group-list {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
	.group.state .group-list {
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}
	.group.economy .group-list {
		grid-template-columns: repeat(6, minmax(0, 1fr));
	}
	.system {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		align-content: stretch;
		gap: var(--s-2);
		min-block-size: 0;
		overflow: hidden;
		padding-block: var(--s-2);
		padding-inline: var(--s-6) var(--s-3);
		background: transparent;
		border: 0;
		border-block-end: var(--rule);
		border-radius: 0;
	}
	.system.wide {
		grid-column: span 2;
	}
	.grip {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		display: grid;
		place-items: center;
		inline-size: var(--s-6);
		block-size: var(--s-6);
		color: var(--text-muted);
		cursor: grab;
		touch-action: none;
	}
	.grip::before {
		content: '';
		inline-size: var(--s-1);
		block-size: var(--s-4);
		border-radius: var(--r-full);
		background: currentColor;
		opacity: 0.45;
	}
	.system:active .grip {
		cursor: grabbing;
	}
	.system.drop-ok,
	.purse.drop-ok {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.system.drop-no,
	.purse.drop-no {
		outline: 2px dashed var(--rupture);
		outline-offset: 2px;
	}
	.system:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.system-head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-1);
		min-inline-size: 0;
	}
	.name {
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-sm);
		font-weight: 600;
		line-height: var(--lh-tight);
		text-align: start;
		min-block-size: 0;
		min-inline-size: 0;
		max-inline-size: 100%;
		cursor: pointer;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	.delta {
		display: flex;
		flex-wrap: wrap;
		column-gap: var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
		white-space: nowrap;
	}
	.delta-fig {
		color: var(--text-secondary);
	}
	.delta-words {
		color: var(--text-muted);
	}
	.bars {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: var(--s-4) var(--s-4);
		column-gap: var(--s-2);
		row-gap: var(--s-1);
		align-self: end;
	}
	.track {
		display: block;
		position: relative;
		grid-column: 1;
		block-size: var(--s-4);
		overflow: hidden;
		background: var(--border-subtle);
	}
	.track.plan {
		grid-row: 1;
	}
	.track.yours {
		grid-row: 2;
	}
	.bar {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		border-start-end-radius: var(--r-sm);
		border-end-end-radius: var(--r-sm);
		transition: inline-size var(--dur-normal) var(--ease-out);
	}
	.bar.plan {
		background: var(--text-muted);
	}
	.bar.yours {
		background: var(--accent);
	}
	.tick {
		grid-column: 1;
		grid-row: 1;
		justify-self: start;
		align-self: stretch;
		inline-size: var(--s-1);
		background: var(--text-primary);
		z-index: 1;
	}
	.bar-val {
		grid-column: 2;
		align-self: center;
		min-inline-size: 6ch;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--text-secondary);
		text-align: end;
		white-space: nowrap;
	}
	.plan-val {
		grid-row: 1;
	}
	.yours-val {
		grid-row: 2;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.system.wide .actions {
		flex-direction: row;
	}
	.actions button {
		flex: 1;
		min-block-size: var(--s-8);
		padding-block: var(--s-1);
		padding-inline: var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
		border-radius: var(--r-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	button {
		font: inherit;
		min-block-size: var(--touch);
		padding: var(--s-2) var(--s-3);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		color: var(--text-primary);
		cursor: pointer;
	}
	.take {
		background: transparent;
		border: var(--rule);
		border-color: var(--border-strong);
		color: var(--text-secondary);
	}
	.take:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	.give {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}
	.give:hover {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button.refused {
		opacity: 0.55;
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.quiet {
		background: transparent;
	}
	.cta {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}
	.table-wrap {
		flex: 1;
		min-block-size: 0;
		overflow: auto;
	}
	.figures {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
	}
	.figures th,
	.figures td {
		padding: var(--s-2) var(--s-3);
		border-block-end: var(--rule);
		text-align: start;
	}
	.figures .name {
		display: inline;
		overflow: visible;
	}
	.figures .num {
		text-align: end;
	}
	.figures td.num {
		white-space: nowrap;
	}
	.figures thead th {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
		color: var(--text-muted);
		vertical-align: bottom;
	}
	.stamp {
		position: absolute;
		inset-block-end: var(--s-6);
		inset-inline-end: var(--s-6);
		max-inline-size: 12rem;
		padding: var(--s-4);
		border: 2px double var(--accent);
		border-radius: 0;
		background: var(--surface-base);
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		text-align: center;
		pointer-events: none;
		transform: rotate(-6deg);
	}
	.sheet {
		margin: auto;
		max-inline-size: min(26rem, calc(100vw - var(--s-8)));
		padding: var(--s-5);
		background: var(--surface-overlay);
		color: var(--text-primary);
		border: var(--rule);
		border-radius: 0;
		box-shadow: var(--elev-3);
	}
	.sheet::backdrop {
		background: var(--n-1000);
		opacity: 0.45;
	}
	.sheet h3 {
		margin: 0 0 var(--s-2);
		font-size: var(--step-0);
	}
	.sheet p {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
	}
	.sheet .note-name {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
	}
	.sheet .close {
		margin-block-start: var(--s-2);
	}
	.sr-only {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@keyframes coin-pop {
		from {
			opacity: 0.2;
			transform: scaleY(0.4);
		}
		to {
			opacity: 1;
			transform: scaleY(1);
		}
	}
	@media (min-width: 901px) and (max-width: 1150px) {
		.actions button {
			font-size: var(--t-2xs);
			padding-inline: var(--s-1);
		}
	}
	@media (max-width: 900px) {
		.board {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto minmax(0, 1fr) auto;
			grid-template-areas:
				'purse'
				'toolbar'
				'field'
				'locked';
			gap: 0;
			padding: 0;
		}
		.purse {
			position: sticky;
			top: 0;
			z-index: 4;
			flex-direction: column;
			align-items: stretch;
			gap: 0;
			block-size: var(--s-11);
			padding: var(--s-1) var(--s-3);
			background: var(--surface-base);
			border: 0;
			border-block-end: var(--rule);
			border-radius: 0;
		}
		.purse-label {
			display: none;
		}
		.purse-main {
			flex: 1;
			min-block-size: 0;
			gap: var(--s-2);
		}
		.stack {
			inline-size: var(--s-4);
			block-size: 100%;
			padding: 0;
			border-radius: var(--r-xs);
		}
		.purse-value {
			font-size: var(--t-xl);
		}
		.progress {
			margin-inline-start: auto;
			align-self: center;
		}
		.purse-rule {
			display: block;
			margin: 0;
			font-size: var(--t-2xs);
			line-height: var(--s-5);
			color: var(--text-muted);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			padding-inline-end: var(--s-10);
		}
		.hint-toggle {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			inset-block-start: 50%;
			inset-inline-end: var(--s-3);
			transform: translateY(-50%);
			min-block-size: var(--touch);
			min-inline-size: var(--touch);
			padding: 0 var(--s-2);
			font-size: var(--t-2xs);
		}
		.refusal {
			position: absolute;
			inset-block-start: 100%;
			inset-inline: 0;
			z-index: 5;
			padding: var(--s-1) var(--s-3);
			background: var(--surface-overlay);
			border-block-end: var(--rule);
		}
		.side {
			display: contents;
		}
		.ledger {
			display: none;
		}
		.toolbar {
			grid-area: toolbar;
			display: flex;
			flex-wrap: nowrap;
			gap: var(--s-2);
			block-size: var(--s-10);
			padding: 0 var(--s-3);
			align-items: center;
			background: var(--surface-base);
			border-block-end: var(--rule);
		}
		.toolbar .cta {
			flex: 1;
		}
		.toolbar button {
			min-block-size: var(--touch);
			padding: 0 var(--s-2);
			font-size: var(--t-2xs);
			white-space: nowrap;
		}
		.reset {
			display: none;
		}
		.locked {
			grid-area: locked;
			block-size: var(--s-6);
			padding: 0 var(--s-3);
			overflow: hidden;
			background: var(--surface-base);
			border: 0;
			border-block-start: var(--rule);
			border-radius: 0;
		}
		.locked .sub,
		.locked ul {
			display: none;
		}
		.locked-line {
			font-size: var(--t-2xs);
			line-height: var(--s-6);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.field {
			min-block-size: 0;
		}
		.title,
		.hint,
		.note {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
			margin: 0;
		}
		.systems {
			display: flex;
			flex-direction: column;
			gap: 0;
			flex: 1;
			min-block-size: 0;
			overflow: hidden;
			border-block-start: var(--rule);
		}
		.group {
			flex: var(--rows) 1 0;
			gap: 0;
			min-block-size: 0;
		}
		.group-title {
			block-size: var(--s-5);
			line-height: var(--s-5);
			padding-block-end: 0;
			padding-inline: var(--s-3);
			background: var(--surface-base);
			border-block-end: var(--rule);
		}
		.group.people .group-list,
		.group.state .group-list,
		.group.economy .group-list {
			grid-template-columns: minmax(0, 1fr);
		}
		.group-list {
			display: grid;
			grid-auto-rows: minmax(0, 1fr);
			gap: 0;
			flex: 1;
			min-block-size: 0;
		}
		.system.wide {
			grid-column: auto;
		}
		.system {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto auto;
			grid-template-rows: minmax(0, 1fr);
			align-items: center;
			gap: var(--s-2);
			padding-block: 0;
			padding-inline: var(--s-11) var(--s-3);
			background: transparent;
			border: 0;
			border-block-end: var(--rule);
			border-radius: 0;
		}
		.grip {
			inline-size: var(--touch);
			block-size: 100%;
			min-block-size: var(--touch);
		}
		.system-head {
			display: contents;
		}
		.name {
			position: relative;
			z-index: 1;
			display: block;
			min-block-size: var(--touch);
			align-self: stretch;
			font-size: var(--t-sm);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.delta {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.legend {
			gap: var(--s-1) var(--s-4);
			margin: 0;
			padding: var(--s-1) var(--s-3);
		}
		.bars {
			position: absolute;
			inset: 0;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
			column-gap: 0;
			row-gap: var(--s-1);
		}
		.track {
			block-size: auto;
			border-radius: 0;
			background: transparent;
		}
		.bar {
			border-radius: 0;
		}
		.bar.plan {
			background: var(--text-muted);
			opacity: 0.16;
		}
		.bar.yours {
			background: var(--accent);
			opacity: 0.32;
		}
		.bar-val {
			display: none;
		}
		.actions {
			display: contents;
		}
		.actions button {
			position: relative;
			z-index: 1;
			flex: none;
			min-block-size: var(--touch);
			min-inline-size: var(--touch);
			padding: 0 var(--s-2);
			font-size: var(--t-2xs);
		}
		.stamp {
			inset-block-start: auto;
			inset-block-end: var(--s-6);
			inset-inline: var(--s-3);
			max-inline-size: none;
			padding: var(--s-1) var(--s-2);
			font-size: var(--t-2xs);
			transform: rotate(-1deg);
		}
	}
	@media (max-height: 760px) and (min-width: 901px) {
		.hint,
		.note {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			transition: none;
		}
		.slots.drop .coin.on,
		.slots.lift .coin.on {
			animation: none;
		}
	}
</style>
