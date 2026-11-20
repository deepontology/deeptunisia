<script lang="ts">
	import { onMount } from 'svelte';
	import * as B from '$lib/budget-game/board';
	import type { GameLine, LineId } from '$lib/budget-game/lines';
	import { lineDifference } from '$lib/budget-game/diff';
	import { dragMoney, flyCoin } from '$lib/budget-game/drag';
	import SystemRow, { fmtMd } from '$lib/budget-game/SystemRow.svelte';

	/**
	 * Three systems of the real board, with the same engine, rows, coin and
	 * drag. The page around it scrolls, so on touch the rows let the page pan
	 * and the buttons move the money; with a mouse or pen, rows drag.
	 */
	let {
		lines,
		names,
		words
	}: {
		lines: GameLine[];
		names: Record<string, string>;
		words: {
			purse: string;
			reset: string;
			take: (name: string) => string;
			give: (name: string) => string;
			plan: string;
			yours: string;
			more: string;
			less: string;
			same: string;
			legendPlan: string;
			legendYours: string;
			unit: string;
			took: (amount: string, name: string) => string;
			gave: (amount: string, name: string) => string;
			moved: (amount: string, from: string, to: string) => string;
		};
	} = $props();

	const board: B.Board = $derived({
		lines: { movable: lines, locked: [], envelope: lines.reduce((s, l) => s + l.draft, 0), total: lines.reduce((s, l) => s + l.draft, 0) }
	});
	let game = $state<B.BoardState | null>(null);
	const cur = $derived(game ?? B.startBoard(board, 'draft', 'coin'));
	const scale = $derived(Math.ceil((Math.max(...lines.map((l) => l.draft)) * 1.5) / 2000) * 2000);
	const P = $derived(B.purse(board, cur));
	let over = $state<string | null>(null);
	let carrying = $state<string | null>(null);
	let last = $state('');
	let root = $state<HTMLElement | undefined>(undefined);

	function move(from: string, to: string): boolean {
		let next: B.BoardState;
		if (from === 'purse') next = B.give(board, cur, to as LineId);
		else if (to === 'purse') next = B.take(board, cur, from as LineId);
		else next = B.transfer(board, cur, from as LineId, to as LineId);
		if (next === cur) return false;
		const e = next.log[next.log.length - 1];
		flyCoin(root?.querySelector(`[data-drop="${from}"]`) ?? null, root?.querySelector(`[data-drop="${to}"]`) ?? null, fmtMd(e.md));
		game = next;
		const a = fmtMd(e.md);
		last = from === 'purse' ? words.gave(a, names[to]) : to === 'purse' ? words.took(a, names[from]) : words.moved(a, names[from], names[to]);
		return true;
	}

	onMount(() => {
		if (!root) return;
		return dragMoney(root, {
			canStart: (id) => (id === 'purse' ? P > 0 : true),
			onStart: (id) => (carrying = id),
			onOver: (id) => (over = id),
			onDrop: (from, to) => move(from, to),
			onTap: () => {},
			onEnd: () => {
				carrying = null;
				over = null;
			},
			label: () => `100 ${words.unit}`
		});
	});
</script>

<div class="try" bind:this={root} data-testid="try-board">
	<div class="top">
		<div class="purse" class:target={over === 'purse'} class:full={P > 0} data-drop="purse">
			<span class="label">{words.purse}</span>
			<span class="value num purse-value">{fmtMd(P)} {words.unit}</span>
		</div>
		<span class="legend"><span class="sw plan" aria-hidden="true"></span>{words.legendPlan}</span>
		<span class="legend"><span class="sw mine" aria-hidden="true"></span>{words.legendYours}</span>
		<button type="button" class="reset" onclick={() => ((game = null), (last = ''))} disabled={!game || game.log.length === 0}>{words.reset}</button>
	</div>
	<ul class="rows">
		{#each lines as l (l.id)}
			{@const yours = B.heldMd(board, cur, l.id)}
			{@const d = lineDifference(l.draft, yours)}
			<li>
				<div class="row-wrap">
					<SystemRow
						id={l.id}
						name={names[l.id]}
						plan={l.draft}
						{yours}
						{scale}
						deltaMd={d.deltaMd}
						deltaPct={d.deltaPct}
						direction={d.direction}
						words={{ plan: words.plan, yours: words.yours, more: words.more, less: words.less, same: words.same }}
						target={over === l.id}
						source={carrying === l.id}
						pan
					/>
				</div>
				<div class="btns">
					<button type="button" aria-label={words.take(names[l.id])} disabled={B.takeAmount(board, cur, l.id) === 0} onclick={() => move(l.id, 'purse')}>−</button>
					<button type="button" aria-label={words.give(names[l.id])} disabled={B.giveAmount(board, cur, l.id) === 0} onclick={() => move('purse', l.id)}>+</button>
				</div>
			</li>
		{/each}
	</ul>
	<p class="last" aria-live="polite">{last}</p>
</div>

<style>
	.try {
		display: grid;
		gap: var(--s-4);
		padding: var(--s-6);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-raised);
		font-family: var(--font-sans);
	}
	.num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-3) var(--s-6);
	}
	.purse {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-4);
		min-block-size: var(--touch);
		align-items: center;
		padding-inline: var(--s-5);
		border-radius: var(--r-md);
		background: var(--plate-bg);
		color: var(--plate-ink);
		cursor: grab;
		transition: box-shadow var(--dur-fast) var(--ease-out);
	}
	.purse.target {
		box-shadow: 0 0 0 3px var(--accent);
	}
	.purse.full .value {
		color: var(--accent);
	}
	.label {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.75;
	}
	.value {
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-secondary);
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
	.reset {
		margin-inline-start: auto;
		min-block-size: var(--touch);
		padding-inline: var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.reset:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
	}
	.rows li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--s-4);
		border-block-end: var(--rule);
	}
	.row-wrap {
		min-inline-size: 0;
	}
	.btns {
		display: flex;
		gap: var(--s-2);
	}
	.btns button {
		inline-size: var(--touch);
		block-size: var(--touch);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-md);
		background: var(--surface-base);
		color: var(--text-primary);
		font: 600 var(--t-xl) var(--font-mono);
		cursor: pointer;
	}
	.btns button:last-child {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.btns button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	button:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
	.last {
		min-block-size: 1.4em;
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
</style>
