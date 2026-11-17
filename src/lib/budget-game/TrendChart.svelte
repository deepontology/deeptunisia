<script lang="ts">
	import type { BoardCopy } from './board-copy';
	import { fmtMd, signed } from './SystemRow.svelte';

	/**
	 * The trend chart: one line's amount in every adopted law and in the 2027
	 * draft, with the citizen's amount marked beside the draft.
	 *
	 * Drawn in a fixed 340 by 200 unit box, so the text keeps its size on a phone
	 * and simply grows on a desk. The year chips under it are the phone's way to
	 * choose the year the rows compare, since the board's chip row is hidden there.
	 * Nothing here computes a figure that is not printed: every point is a value
	 * handed in by the board.
	 */
	let {
		name,
		plan,
		yours,
		direction,
		years,
		draftYear,
		compared,
		words,
		unit,
		caveat = null,
		taxNote = null,
		onpick
	}: {
		name: string;
		plan: number;
		yours: number;
		direction: 'more' | 'less' | 'same';
		/** The chosen line in each adopted law, oldest first. */
		years: { year: number; md: number }[];
		draftYear: number;
		compared: number | null;
		words: BoardCopy;
		unit: string;
		/** What is different about this line's past years, if anything. */
		caveat?: string | null;
		/** The budget-wide tax share for the compared year, if it is known. */
		taxNote?: string | null;
		onpick: (year: number) => void;
	} = $props();

	const W = 340;
	const H = 200;
	const PAD = 6;
	const TOP = 20;
	const BASE = 168;
	const PLOT_H = BASE - TOP;

	/** Every point, left to right: the adopted laws, the 2027 draft, and yours. */
	const points = $derived([
		...years.map((y) => ({ key: String(y.year), md: y.md, kind: 'past' as const, year: y.year })),
		{ key: String(draftYear), md: plan, kind: 'draft' as const, year: draftYear },
		{ key: words.chartYou, md: yours, kind: 'mine' as const, year: draftYear }
	]);
	const slot = $derived((W - PAD * 2) / points.length);
	const x = (i: number) => PAD + slot * (i + 0.5);
	const top = $derived(Math.max(...points.map((p) => p.md), 1) * 1.12);
	const y = (md: number) => BASE - (Math.max(0, md) / top) * PLOT_H;

	const line = $derived(points.map((p, i) => `${x(i)},${y(p.md)}`).join(' '));
	const draftIndex = $derived(points.length - 2);
	/** On one scale, a citizen who kept the draft would print the same figure twice. */
	const sameLevel = $derived(Math.abs(y(plan) - y(yours)) < 10);
	const first = $derived(years[0] ?? null);
	/** The oldest year to the draft, as a share: the one number that answers "how did it move". */
	const change = $derived(first && first.md > 0 ? ((plan - first.md) / first.md) * 100 : null);
	const list = $derived(
		points
			.map((p, i) => `${p.kind === 'mine' ? words.yours : p.kind === 'draft' ? `${p.key} ${words.draftYear}` : p.key}: ${fmtMd(p.md)} ${unit}`)
			.join(', ')
	);
</script>

<div class="chart">
	<p class="head"><span class="name">{name}</span> <span class="title">{words.chartHeading}</span></p>

	<svg viewBox="0 0 {W} {H}" class="plot" role="img" aria-label={words.chartAria(list)}>
		<line class="base" x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} />
		<polyline class="trace" points={line} />
		<polyline
			class="move"
			points={`${x(draftIndex)},${y(plan)} ${x(draftIndex + 1)},${y(yours)}`}
			data-dir={direction}
		/>
		{#each points as p, i (p.kind + p.key)}
			{#if p.kind === 'mine'}
				<circle class="dot mine" cx={x(i)} cy={y(p.md)} r="4" data-dir={direction} />
			{:else if p.kind === 'draft'}
				<rect class="dot draft" x={x(i) - 3} y={y(p.md) - 3} width="6" height="6" />
			{:else}
				<circle class="dot past" class:chosen={compared === p.year} cx={x(i)} cy={y(p.md)} r={compared === p.year ? 4 : 2.6} />
			{/if}
			{#if !(p.kind === 'draft' && sameLevel)}
				<text class="val" class:mine={p.kind === 'mine'} x={x(i)} y={y(p.md) < TOP + 8 ? y(p.md) + 13 : y(p.md) - 6}>{fmtMd(p.md)}</text>
			{/if}
			<text class="year" class:chosen={p.kind === 'past' && compared === p.year} class:mine={p.kind === 'mine'} x={x(i)} y={H - 12}>
				{p.kind === 'mine' ? words.chartYou : p.key}
			</text>
		{/each}
	</svg>

	<div class="chips" role="group" aria-label={words.pastYears}>
		{#each years as y (y.year)}
			<button type="button" class="chip" aria-pressed={compared === y.year} onclick={() => onpick(y.year)}>{y.year}</button>
		{/each}
	</div>
	<p class="hint">{words.chartHint}</p>

	<p class="figure num">
		<span>{words.draftYear} {fmtMd(plan)} {unit}</span>
		<span>{words.yours} {fmtMd(yours)} {unit}</span>
		{#if direction !== 'same' && plan > 0}<span data-dir={direction}><bdi dir="ltr">{signed(yours - plan)} · {signed(((yours - plan) / plan) * 100, 1)}%</bdi></span>{/if}
	</p>
	{#if change !== null && first}
		<p class="change num">{words.chartChange(String(first.year), `${signed(change, 1)}%`)}</p>
	{/if}
	{#if taxNote}
		<p class="tax">{taxNote}</p>
	{/if}
	{#if caveat}
		<p class="note">{caveat}</p>
	{/if}
	<p class="note">{words.historyNote}</p>
	<p class="note">{words.nominalNote}</p>
</div>

<style>
	.chart {
		display: grid;
		gap: var(--s-3);
		min-block-size: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-2) var(--s-4);
		margin: 0;
	}
	.name {
		font-weight: 600;
		font-size: var(--t-md);
		color: var(--text-primary);
	}
	.title {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.plot {
		inline-size: 100%;
		max-inline-size: 42rem;
		block-size: auto;
		direction: ltr;
	}
	.base {
		stroke: var(--text-faint);
		stroke-width: 1;
		opacity: 0.6;
	}
	.trace {
		fill: none;
		stroke: var(--text-secondary);
		stroke-width: 1.6;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.move {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
		stroke-dasharray: 3 3;
		stroke-linecap: round;
	}
	.dot.past {
		fill: var(--text-secondary);
	}
	.dot.past.chosen {
		fill: var(--text-primary);
	}
	.dot.draft {
		fill: var(--surface-base);
		stroke: var(--text-primary);
		stroke-width: 1.4;
	}
	.dot.mine {
		fill: var(--accent);
	}
	.val {
		font-family: var(--font-mono);
		font-size: 8px;
		font-variant-numeric: tabular-nums;
		text-anchor: middle;
		fill: var(--text-muted);
	}
	.val.mine {
		fill: var(--accent);
		font-weight: 600;
	}
	.year {
		font-family: var(--font-mono);
		font-size: 9px;
		text-anchor: middle;
		fill: var(--text-faint);
	}
	.year.chosen {
		fill: var(--text-primary);
		font-weight: 600;
	}
	.year.mine {
		fill: var(--accent);
		font-weight: 600;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.chip {
		min-block-size: var(--s-9);
		min-inline-size: var(--s-9);
		padding-inline: var(--s-3);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-muted);
		font: 500 var(--t-xs) var(--font-mono);
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		background: var(--surface-raised);
		border-color: var(--text-muted);
		color: var(--text-primary);
	}
	.chip[aria-pressed='false'] {
		text-decoration: line-through;
	}
	.hint,
	.figure,
	.change,
	.tax,
	.note {
		margin: 0;
		font-size: var(--t-xs);
		line-height: 1.45;
		color: var(--text-muted);
	}
	.figure {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1) var(--s-5);
		color: var(--text-secondary);
	}
	.figure [data-dir='more'] {
		color: var(--text-primary);
	}
	.tax {
		color: var(--text-secondary);
	}
	@media (max-width: 720px) {
		.chip {
			min-block-size: var(--touch);
			min-inline-size: var(--touch);
		}
	}
</style>
