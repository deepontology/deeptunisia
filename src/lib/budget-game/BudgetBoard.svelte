<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { FIGURES } from '$lib/budget-study/figures';
	import { copyFor } from './copy';
	import { linesFrom, type LineId } from './lines';
	import * as B from './board';
	import type { Board, BoardState, LogEntry } from './board';
	import { untrack } from 'svelte';

	/**
	 * The Treasury board. Systems are bars on one scale in dinars. The purse holds
	 * what is not yet placed. Take moves money from a system to the purse; give
	 * moves money from the purse into a system. The board finishes when the purse
	 * is within tolerance. Every figure is a draft figure from the figures file.
	 */
	let {
		mode = 'draft',
		onfinish
	}: {
		mode?: B.StartMode;
		onfinish?: (game: B.BoardState, board: B.Board) => void;
	} = $props();

	const lines = linesFrom(FIGURES.rows);
	const board: Board = { lines };
	let game: BoardState = $state(B.startBoard(board, untrack(() => mode)));
	let view = $state<'bars' | 'table'>('bars');

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
				giveReason: B.giveProblem(board, game, l.id)
			};
		})
	);

	const ledger = $derived(game.log.slice(-5).reverse());
	const lockedTotal = lines.locked.reduce((s, l) => s + l.draft, 0);

	function fmtDelta(n: number): string {
		const sign = n > 0.5 ? '+' : n < -0.5 ? '−' : '';
		return `${sign}${fmt(Math.abs(n))} ${unit}`;
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
	function take(id: LineId) {
		game = B.take(board, game, id);
	}
	function give(id: LineId) {
		game = B.give(board, game, id);
	}
	function keep() {
		game = B.keepDraft(board, game);
	}
	function undo() {
		game = B.undo(game);
	}
	function reset() {
		game = B.startBoard(board, mode);
	}
	function finish() {
		if (done) onfinish?.(game, board);
	}
	const startLabel = $derived(mode === 'draft' ? c.board.startDraft : c.board.startEmpty);
	const balanceText = $derived(
		done && Math.abs(P) < 0.5 ? c.board.balanced : done ? c.board.leftover(fmt(P)) : ''
	);
</script>

<section class="board" aria-labelledby="h-board" lang={app.locale}>
	<div class="purse" role="status" aria-live="polite">
		<p class="purse-label">{c.board.purse}</p>
		<p class="purse-value"><span aria-hidden="true" class="coins">{'■'.repeat(Math.min(12, Math.max(0, Math.round(P / (scaleMax / 60)))))}</span> {fmt(P)} {unit}</p>
		<p class="purse-note">{c.board.purseHint}</p>
		{#if balanceText}<p class="balance" class:ok={done && Math.abs(P) < 0.5}>{balanceText}</p>{/if}
	</div>

	<h2 id="h-board" class="title">{c.board.title}</h2>
	<p class="hint">{c.board.hint}</p>
	<p class="note">{c.board.startNote}</p>

	<div class="toolbar">
		<button type="button" class="quiet" onclick={() => (view = view === 'bars' ? 'table' : 'bars')} aria-pressed={view === 'table'}>{c.board.tableView}</button>
		<button type="button" class="quiet" onclick={undo} disabled={game.snapshots.length === 0}>{c.board.undo}</button>
		<button type="button" class="quiet" onclick={reset}>{startLabel}</button>
		<button type="button" class="quiet" onclick={keep} disabled={kept}>{c.board.keep}</button>
	</div>

	{#if view === 'bars'}
		<h3 class="sub">{c.board.systems}</h3>
		<ul class="systems">
			{#each rows as r (r.line.id)}
				<li class="system">
					<div class="system-head">
						<h4>{c.lines[r.line.id].name}</h4>
						<span class="delta">{fmtDelta(r.delta)} · {pctLabel(r.level)}</span>
					</div>
					<p class="system-note">{c.lines[r.line.id].note}</p>
					<div class="track" aria-hidden="true">
						<span class="fill" class:up={r.level > 20} class:down={r.level < 20} style:inline-size="{(r.amount / scaleMax) * 100}%"></span>
						<span class="tick" style:inset-inline-start="{(r.line.draft / scaleMax) * 100}%"></span>
					</div>
					<div class="actions">
						<button type="button" class="take" disabled={!r.takeOk} onclick={() => take(r.line.id)}>{c.board.take(fmt(r.step))}</button>
						<button type="button" class="give" disabled={r.giveReason !== null} onclick={() => give(r.line.id)}>{c.board.give(fmt(r.step))}</button>
					</div>
					{#if !r.takeOk}<p class="reason">{c.board.atZero}</p>{/if}
					{#if r.giveReason}<p class="reason">{r.level >= 40 ? c.board.atMax : c.board.notEnough(fmt(P), fmt(r.step))}</p>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="table-scroll">
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
							<th scope="row">{c.lines[r.line.id].name}</th>
							<td class="num">{fmt(r.line.draft)}</td>
							<td class="num">{fmt(r.amount)}</td>
							<td class="num">{fmtDelta(r.delta)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="locked">
		<h3 class="sub">{c.board.locked}</h3>
		<p>{c.board.lockedText(fmt(lockedTotal))}</p>
		<ul>
			{#each lines.locked as l (l.id)}
				<li>{c.lines[l.id].name}: {fmt(l.draft)} {unit}</li>
			{/each}
		</ul>
	</div>

	<div class="composition" aria-hidden="true">
		<span class="comp-label">{c.board.draft}</span>
		<div class="comp-bar">
			{#each rows as r (r.line.id)}
				<span style:inline-size="{(r.line.draft / lines.envelope) * 100}%"></span>
			{/each}
		</div>
		<span class="comp-label">{c.board.yours}</span>
		<div class="comp-bar yours">
			{#each rows as r (r.line.id)}
				<span style:inline-size="{(r.amount / lines.envelope) * 100}%"></span>
			{/each}
		</div>
	</div>

	<section class="ledger" aria-labelledby="h-ledger">
		<h3 id="h-ledger" class="sub">{c.board.ledger}</h3>
		<ol>
			{#each ledger as entry, i (i + '-' + game.log.length)}
				<li>{ledgerText(entry)}</li>
			{/each}
		</ol>
	</section>

	<div class="actions finish">
		<button type="button" class="cta" disabled={!done} onclick={finish}>{c.board.finish}</button>
	</div>
</section>

<style>
	.board {
		position: relative;
		max-inline-size: var(--measure);
		margin-inline: auto;
		padding-block: var(--s-4);
	}
	.purse {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--surface-base);
		padding-block: var(--s-3);
		border-block-end: var(--rule);
	}
	.purse-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	.purse-value {
		margin: 0;
		font-size: var(--step-2);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.coins {
		color: var(--accent);
		letter-spacing: -0.1em;
	}
	.purse-note,
	.note,
	.system-note {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--t-sm);
	}
	.balance {
		margin: var(--s-2) 0 0;
		font-weight: 600;
		color: var(--text-secondary);
	}
	.balance.ok {
		color: var(--accent);
	}
	.title {
		font-size: var(--step-2);
		margin: var(--s-6) 0 var(--s-2);
	}
	.hint {
		color: var(--text-secondary);
	}
	.sub {
		font-size: var(--t-sm);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin: var(--s-6) 0 var(--s-3);
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-block: var(--s-4);
	}
	.systems {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--s-4);
	}
	.system {
		padding: var(--s-4);
		background: var(--surface-raised);
		border: var(--rule);
		border-radius: var(--r-lg);
	}
	.system-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s-3);
	}
	.system-head h4 {
		margin: 0;
		font-size: var(--step-0);
	}
	.delta {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text-secondary);
	}
	.track {
		position: relative;
		block-size: var(--s-5);
		margin-block: var(--s-3);
		background: var(--surface-sunken);
		border-radius: var(--r-full);
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		background: var(--text-faint);
		transition: inline-size var(--dur-normal) var(--ease-out);
	}
	.fill.up {
		background: var(--accent);
	}
	.tick {
		position: absolute;
		inset-block: 0;
		inline-size: 2px;
		background: var(--text-primary);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}
	.actions button {
		min-block-size: var(--touch);
		min-inline-size: var(--touch);
	}
	.reason {
		margin: var(--s-2) 0 0;
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.locked {
		margin-block: var(--s-6);
		padding: var(--s-4);
		border: var(--rule);
		border-radius: var(--r-lg);
		background: var(--surface-sunken);
		color: var(--text-muted);
	}
	.locked p,
	.locked ul {
		margin: var(--s-2) 0 0;
	}
	.composition {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--s-2) var(--s-4);
		align-items: center;
		margin-block: var(--s-6);
	}
	.comp-label {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.comp-bar {
		display: flex;
		block-size: var(--s-5);
		border-radius: var(--r-full);
		overflow: hidden;
		background: var(--surface-sunken);
	}
	.comp-bar span {
		display: block;
		block-size: 100%;
		border-inline-end: 1px solid var(--surface-base);
		background: color-mix(in oklch, var(--text-faint) 60%, var(--surface-sunken));
	}
	.comp-bar.yours span {
		background: color-mix(in oklch, var(--accent) 70%, var(--surface-sunken));
	}
	.ledger ol {
		padding-inline-start: var(--s-6);
		margin: 0;
		color: var(--text-secondary);
	}
	.finish {
		margin-block: var(--s-6) var(--s-3);
	}
	.cta {
		min-block-size: var(--touch);
		padding: var(--s-3) var(--s-6);
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
		border-radius: var(--r-md);
		font-weight: 600;
		cursor: pointer;
	}
	button {
		font: inherit;
		min-block-size: var(--touch);
		padding: var(--s-2) var(--s-4);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		color: var(--text-primary);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.quiet {
		background: transparent;
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
	}
	.figures .num {
		text-align: end;
	}
	.sr-only {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
