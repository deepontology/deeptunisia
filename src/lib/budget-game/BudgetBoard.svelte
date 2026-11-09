<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { FIGURES } from '$lib/budget-study/figures';
	import { copyFor } from './copy';
	import { linesFrom, type LineId } from './lines';
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
	 * One screen, two shapes: on a desk the purse and totals sit in a left
	 * column and the systems fill a dense grid on the right; on a phone the
	 * purse is a sticky bar and the systems are a list of rows with 44px
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
	let notice = $state('');

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

	/** The last five moves, newest first, for the desk ledger strip. */
	const ledger = $derived(game.log.slice(-5).reverse());
	const lockedTotal = lines.locked.reduce((s, l) => s + l.draft, 0);

	/** Coin marks: one per 1/18 of the envelope still held in the purse. */
	const COIN_SLOTS = Array.from({ length: 18 }, (_, i) => i);
	const coins = $derived(
		Math.round(Math.max(0, Math.min(1, P / lines.envelope)) * COIN_SLOTS.length)
	);
	/** Take drops a coin from a system into the purse; give lifts one out. */
	const coinDir = $derived(
		game.log.length === 0
			? 0
			: game.log[game.log.length - 1].kind === 'take'
				? 1
				: game.log[game.log.length - 1].kind === 'give'
					? -1
					: 0
	);

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
	function take(id: LineId) {
		if (!B.takeProblem(game, id)) {
			game = B.take(board, game, id);
			notice = '';
			return;
		}
		notice = c.board.atZero;
	}
	function give(id: LineId) {
		if (!B.giveProblem(board, game, id)) {
			game = B.give(board, game, id);
			notice = '';
			return;
		}
		notice =
			game.levels[id] >= 40
				? c.board.atMax
				: c.board.notEnough(fmt(P), fmt(B.stepMd(B.findLine(board, id))));
	}
	function keep() {
		game = B.keepDraft(board, game);
		notice = '';
	}
	function undo() {
		game = B.undo(game);
		notice = '';
	}
	function reset() {
		game = B.startBoard(board, mode);
		notice = '';
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
		<p class="purse-value">
			{#key coins}
				<span class="coins" class:drop={coinDir > 0} class:lift={coinDir < 0} aria-hidden="true">
					{#each COIN_SLOTS as i (i)}
						<span class="coin" class:on={i < coins} style:--i={i}></span>
					{/each}
				</span>
			{/key}
			<span class="amount">{fmt(P)} <span class="unit">{unit}</span></span>
		</p>
	</div>

	<div class="side">
		<div class="totals">
			<div><span>{c.board.yours}</span><strong>{fmt(placedMd)} {unit}</strong></div>
			<div><span>{c.board.draft}</span><strong>{fmt(lines.envelope)} {unit}</strong></div>
			<div><span>{c.board.change}</span><strong>{fmtDelta(placedMd - lines.envelope)}</strong></div>
		</div>

		<p class="notice" class:is-refusal={notice !== ''} role="status" aria-live="polite">{notice || c.board.purseHint}</p>

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
			<ul class="systems">
				{#each rows as r (r.line.id)}
					<li class="system">
						<div class="system-head">
							<h4 title={c.lines[r.line.id].name}>{c.lines[r.line.id].name}</h4>
							<span class="delta">{fmtDelta(r.delta)} · {pctLabel(r.level)}</span>
						</div>
						<div class="tank" aria-hidden="true">
							<span class="fill" class:up={r.level > 20} class:down={r.level < 20} style:inline-size="{(r.amount / scaleMax) * 100}%"></span>
							<span class="tick" style:inset-inline-start="{(r.line.draft / scaleMax) * 100}%"></span>
						</div>
						<div class="actions">
							<button type="button" class="take" class:refused={!r.takeOk} onclick={() => take(r.line.id)}>{c.board.take(fmt(r.step))}</button>
							<button type="button" class="give" class:refused={!r.giveOk} onclick={() => give(r.line.id)}>{c.board.give(fmt(r.step))}</button>
						</div>
						<span class="sr-only">{c.lines[r.line.id].name}: {fmt(r.amount)} {unit}, {pctLabel(r.level)}. {r.takeOk ? '' : c.board.atZero}</span>
					</li>
				{/each}
			</ul>
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

		{#if balanceText}
			<span class="stamp" aria-hidden="true">{balanceText}</span>
		{/if}
	</div>
</section>

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
		gap: var(--s-1);
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
	.purse-value {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--step-1);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
	}
	.amount {
		white-space: nowrap;
	}
	.unit {
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-muted);
	}
	.coins {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1);
		flex: 1;
		max-inline-size: 9rem;
	}
	.coin {
		inline-size: var(--s-3);
		block-size: var(--s-3);
		border: var(--rule);
		border-radius: var(--r-full);
		background: var(--surface-sunken);
	}
	.coin.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.coins.drop .coin.on {
		animation: coin-drop var(--dur-fast) var(--ease-out) both;
		animation-delay: calc(var(--dur-instant) * var(--i) / 12);
	}
	.coins.lift .coin.on {
		animation: coin-lift var(--dur-fast) var(--ease-out) both;
		animation-delay: calc(var(--dur-instant) * var(--i) / 12);
	}
	.side {
		grid-area: side;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		min-block-size: 0;
		overflow: hidden;
	}
	.totals {
		display: grid;
		gap: var(--s-1);
		padding: var(--s-3) var(--s-4);
		background: var(--surface-sunken);
		border: var(--rule);
		border-radius: var(--r-md);
		font-variant-numeric: tabular-nums;
	}
	.totals div {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.totals span {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
		color: var(--text-muted);
	}
	.totals strong {
		font-size: var(--t-sm);
		font-weight: 600;
	}
	.notice {
		margin: 0;
		min-block-size: var(--s-8);
		font-size: var(--t-sm);
		color: var(--text-muted);
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
		list-style: none;
		padding: 0;
		margin: 0;
		flex: 1;
		min-block-size: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-template-rows: repeat(4, minmax(0, 1fr));
		gap: var(--s-3);
	}
	.system {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--s-2);
		min-block-size: 0;
		overflow: hidden;
		padding: var(--s-3);
		background: var(--surface-raised);
		border: var(--rule);
		border-radius: var(--r-md);
	}
	.system-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s-2);
	}
	h4 {
		margin: 0;
		font-size: var(--t-sm);
		line-height: var(--lh-tight);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
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
		gap: var(--s-2);
	}
	.actions button {
		flex: 1;
		min-block-size: var(--tap);
		padding-inline: var(--s-2);
		font-size: var(--t-xs);
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
	.sr-only {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@keyframes coin-drop {
		from {
			opacity: 0;
			transform: translateY(calc(var(--s-3) * -1));
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes coin-lift {
		0% {
			transform: translateY(0);
		}
		40% {
			transform: translateY(calc(var(--s-2) * -1));
		}
		100% {
			transform: translateY(0);
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
			flex-direction: row;
			align-items: center;
			gap: var(--s-3);
			block-size: var(--s-9);
			padding: var(--s-1) var(--s-3);
			background: var(--surface-base);
			border: 0;
			border-block-end: var(--rule);
			border-radius: 0;
		}
		.purse-value {
			font-size: var(--t-lg);
		}
		.coins {
			flex: 0 1 auto;
			flex-wrap: nowrap;
			max-inline-size: none;
			overflow: hidden;
		}
		.unit {
			font-size: var(--t-2xs);
		}
		.side {
			display: contents;
		}
		.totals,
		.ledger {
			display: none;
		}
		.notice {
			position: absolute;
			inset-block-end: var(--s-6);
			inset-inline: var(--s-4);
			z-index: 5;
			min-block-size: 0;
			padding: var(--s-2) var(--s-3);
			background: var(--surface-overlay);
			border: var(--rule);
			border-radius: var(--r-md);
			pointer-events: none;
		}
		.notice:not(.is-refusal) {
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
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: repeat(16, minmax(0, 1fr));
			gap: 0;
			border-block-start: var(--rule);
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
		h4 {
			position: relative;
			z-index: 1;
			display: block;
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
		.coins.drop .coin.on,
		.coins.lift .coin.on,
		.stamp {
			animation: none;
		}
	}
</style>
