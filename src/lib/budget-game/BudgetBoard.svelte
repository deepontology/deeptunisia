<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { FIGURES } from '$lib/budget-study/figures';
	import { copyFor } from './copy';
	import { linesFrom, MAX_LEVEL, type LineId } from './lines';
	import * as B from './board';
	import type { Board, BoardState, LogEntry } from './board';
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
			return {
				line: l,
				level,
				amount: B.amountOf(l, level),
				step: B.stepMd(l),
				delta: B.amountOf(l, level) - l.draft,
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
	let moveDirs = $state<number[]>([]);
	let moveSeq = $state(0);

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

	function fmtDelta(n: number): string {
		const sign = n > 0.5 ? '+' : n < -0.5 ? '−' : '';
		return `${sign}${fmt(Math.abs(n))}\u00a0${unit}`;
	}
	function pctLabel(level: number): string {
		return `${level * 5}%`;
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
	function afterMove(dir: number, from: HTMLElement | null) {
		coinDir = dir === 0 ? 0 : dir > 0 ? 1 : -1;
		moveDirs = [...moveDirs, coinDir];
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
		const last = moveDirs[moveDirs.length - 1] ?? 0;
		moveDirs = moveDirs.slice(0, -1);
		coinDir = last === 0 ? 0 : last === 1 ? -1 : 1;
		moveSeq += 1;
		refusal = '';
		game = B.undo(game);
	}
	function reset() {
		game = B.startBoard(board, mode);
		moveDirs = [];
		coinDir = 0;
		flight = null;
		refusal = '';
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
	<div class="purse">
		<p class="purse-label">{c.board.purse}</p>
		<div class="purse-main" role="status" aria-live="polite">
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
			<div class="systems">
				{#each groups as g (g.key)}
					<section class="group {g.key}" style:--rows={g.rows.length}>
						<h3 class="group-title">{c.board.groups[g.key]}</h3>
						<ul class="group-list">
							{#each g.rows as r (r.line.id)}
								<li class="system" class:wide={r.line.id === 'education' || r.line.id === 'subsidies'}>
									<div class="system-head">
										<button
											type="button"
											class="name"
											onclick={(e) => openNote(r.line.id, e.currentTarget)}
										>{c.lines[r.line.id].name}</button>
										<span class="delta">{fmtDelta(r.delta)} · {pctLabel(r.level)}</span>
									</div>
									<div class="tank" aria-hidden="true">
										<span class="fill" class:up={r.level > 20} class:down={r.level < 20} style:inline-size="{(r.amount / scaleMax) * 100}%"></span>
										<span class="tick" style:inset-inline-start="{(r.line.draft / scaleMax) * 100}%"></span>
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
								<td class="num">{fmtDelta(r.delta)}</td>
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
		background: var(--surface-sunken);
		border: var(--rule);
		border-radius: var(--r-sm);
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
		font-size: var(--step-1);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
		white-space: nowrap;
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
		padding: var(--s-3) var(--s-4);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
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
		font-size: var(--step-2);
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
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
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
		gap: var(--s-3);
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
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--s-2);
		min-block-size: 0;
		overflow: hidden;
		padding: var(--s-2) var(--s-3);
		background: var(--surface-raised);
		border: var(--rule);
		border-radius: var(--r-md);
	}
	.system.wide {
		grid-column: span 2;
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
		color: inherit;
		font: inherit;
		font-size: var(--t-sm);
		font-weight: 600;
		line-height: var(--lh-tight);
		text-align: start;
		min-block-size: 0;
		min-inline-size: 0;
		cursor: pointer;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.name:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	.delta {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text-muted);
	}
	.tank {
		position: relative;
		block-size: var(--s-4);
		background: var(--surface-sunken);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		background: var(--text-faint);
		transition: inline-size var(--dur-fast) var(--ease-out);
	}
	.fill.up {
		background: var(--accent);
	}
	.fill.down {
		background: var(--text-muted);
	}
	.tick {
		position: absolute;
		inset-block: 0;
		inline-size: var(--s-1);
		background: var(--text-primary);
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
		min-block-size: var(--s-10);
		padding-inline: var(--s-2);
		font-size: var(--t-2xs);
		line-height: var(--lh-tight);
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
	.give {
		background: var(--accent-muted);
		border-color: var(--accent-border);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button.refused {
		opacity: 0.7;
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
	.stamp {
		position: absolute;
		inset-block-end: var(--s-6);
		inset-inline-end: var(--s-6);
		max-inline-size: 12rem;
		padding: var(--s-4);
		border: 2px double var(--accent);
		border-radius: var(--r-sm);
		background: var(--surface-base);
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		text-align: center;
		pointer-events: none;
		transform: rotate(-6deg);
		animation: stamp-in var(--dur-slow) var(--ease-spring) both;
	}
	.fly {
		position: absolute;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		inline-size: var(--s-4);
		block-size: var(--s-4);
		margin-block-start: calc(var(--s-4) / -2);
		margin-inline-start: calc(var(--s-4) / -2);
		border-radius: var(--r-full);
		background: var(--accent);
		pointer-events: none;
		z-index: 6;
		animation: coin-fly var(--dur-fast) var(--ease-out) both;
	}
	.sheet {
		margin: auto;
		max-inline-size: min(26rem, calc(100vw - var(--s-8)));
		padding: var(--s-5);
		background: var(--surface-overlay);
		color: var(--text-primary);
		border: var(--rule);
		border-radius: var(--r-lg);
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
	@keyframes coin-fly {
		0% {
			opacity: 0;
			transform: translate(var(--fx), var(--fy)) scale(0.7);
		}
		20% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(var(--tx), var(--ty)) scale(1);
		}
	}
	@keyframes stamp-in {
		from {
			opacity: 0;
			transform: rotate(-6deg) scale(1.4);
		}
		to {
			opacity: 1;
			transform: rotate(-6deg) scale(1);
		}
	}
	@keyframes stamp-in-flat {
		from {
			opacity: 0;
			transform: rotate(-1deg) scale(1.15);
		}
		to {
			opacity: 1;
			transform: rotate(-1deg) scale(1);
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
		.amount {
			font-size: var(--t-lg);
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
			background: var(--surface-sunken);
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
			padding-inline: var(--s-3);
			background: var(--surface-sunken);
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
			align-items: center;
			gap: var(--s-2);
			padding: 0 var(--s-3);
			background: transparent;
			border: 0;
			border-block-end: var(--rule);
			border-radius: 0;
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
			display: none;
		}
		.tank {
			position: absolute;
			inset: 0;
			block-size: auto;
			border-radius: 0;
			opacity: 0.3;
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
			animation-name: stamp-in-flat;
		}
	}
	@media (max-height: 760px) and (min-width: 901px) {
		.hint,
		.note {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
		.slots.drop .coin.on,
		.slots.lift .coin.on,
		.fly,
		.stamp {
			animation: none;
		}
		.fly {
			display: none;
		}
	}
</style>
