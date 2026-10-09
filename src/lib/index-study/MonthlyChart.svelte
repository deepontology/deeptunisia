<script lang="ts">
	import { t, tf } from '$lib/t.svelte';
	import type { MonthAggregate, ScoringBand } from '../../../community/research-scoring.ts';

	/**
	 * The monthly index as a line, like a market index: one published level per
	 * month, its 95% band, and beside it each month's own mean, so a reader sees
	 * both what was published and what that month alone said.
	 *
	 * The y axis is the whole 0–100 range with the five bands behind it. A
	 * cropped axis would turn a two-point wobble into a cliff. Time runs left to
	 * right in every locale, and the axis always has at least six slots so the
	 * first months read as the start of a series, not a finished one.
	 */
	let {
		months,
		bands,
		selected,
		onselect,
		monthLabel,
		fmt
	}: {
		months: MonthAggregate[];
		bands: ScoringBand[];
		selected: string | null;
		onselect: (period: string) => void;
		monthLabel: (period: string, short?: boolean) => string;
		fmt: (v: number | null | undefined, digits?: number) => string;
	} = $props();

	const MIN_SLOTS = 6;
	const slots = $derived(Math.max(MIN_SLOTS, months.length));
	/** x of slot i as a percentage, with half a slot of margin at each end. */
	const x = (i: number) => ((i + 0.5) / slots) * 100;
	const y = (v: number) => 100 - v;

	/** The published line, broken where a month has no level. */
	const segments = $derived.by(() => {
		const out: { i: number; v: number }[][] = [];
		let run: { i: number; v: number }[] = [];
		months.forEach((m, i) => {
			if (m.index.level === null) {
				if (run.length) out.push(run);
				run = [];
			} else run.push({ i, v: m.index.level });
		});
		if (run.length) out.push(run);
		return out;
	});
	const path = (run: { i: number; v: number }[]) =>
		run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ');
	/** The 95% band as a closed shape: upper edge forward, lower edge back. */
	const area = (run: { i: number; v: number }[]) => {
		const upper = run.map((p) => `${x(p.i)},${y(months[p.i].index.ci95[1] ?? p.v)}`);
		const lower = [...run].reverse().map((p) => `${x(p.i)},${y(months[p.i].index.ci95[0] ?? p.v)}`);
		return `M${upper.join(' L')} L${lower.join(' L')} Z`;
	};
	/** The closed line is solid; the step into the month in progress is dashed. */
	/** At most about eight labels fit a phone; the chosen month is always labelled. */
	const labelEvery = $derived(Math.ceil(slots / 8));
	const lastClosed = $derived(months.findLastIndex((m) => m.closed && m.index.level !== null));
	const live = $derived(months.length ? months[months.length - 1] : null);

	function onkey(event: KeyboardEvent, i: number) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const next = Math.max(0, Math.min(months.length - 1, i + step));
		onselect(months[next].period);
		(event.currentTarget as HTMLElement).parentElement
			?.querySelectorAll<HTMLButtonElement>('button.point')
			[next]?.focus();
	}
</script>

<div class="chart" dir="ltr">
	<div class="plot" role="group" aria-label={tf('index.series.aria', { n: months.length })}>
		<!-- The bands behind the line, from police state at the bottom. -->
		<div class="bands" aria-hidden="true">
			{#each bands as b, i (b.id)}
				<span style:bottom="{b.min}%" style:height="{b.max - b.min}%" style:--c="var(--index-band-{i + 1})"></span>
			{/each}
		</div>
		<div class="ticks" aria-hidden="true">
			{#each [0, 20, 40, 60, 80, 100] as v (v)}
				<span class="tick mono" style:bottom="{v}%">{v}</span>
			{/each}
		</div>

		<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
			{#each segments as run, k (k)}
				<path class="ci" d={area(run)} />
				{#if run.length > 1}
					{@const solid = run.filter((p) => p.i <= lastClosed)}
					{@const tail = run.filter((p) => p.i >= lastClosed)}
					{#if solid.length > 1}<path class="line" d={path(solid)} />{/if}
					{#if tail.length > 1 && live && !live.closed}<path class="line provisional" d={path(tail)} />{/if}
				{/if}
			{/each}
		</svg>

		<!-- Points are buttons, so a month can be chosen by touch, mouse or keys. -->
		{#each months as m, i (m.period)}
			{@const level = m.index.level}
			{@const own = m.results.index.mean}
			{#if own !== null && m.results.n > 0}
				<span class="own" style:left="{x(i)}%" style:bottom="{own}%" aria-hidden="true"></span>
			{/if}
			<button
				type="button"
				class="point"
				class:on={selected === m.period}
				class:provisional={!m.closed}
				class:empty={level === null}
				style:left="{x(i)}%"
				style:bottom="{level ?? 0}%"
				tabindex={selected === m.period ? 0 : -1}
				aria-pressed={selected === m.period}
				aria-label={tf('index.series.pointAria', {
					month: monthLabel(m.period),
					value: level === null ? t('index.series.noLevel') : fmt(level)
				})}
				onclick={() => onselect(m.period)}
				onkeydown={(e) => onkey(e, i)}
			>
				<span class="dot"></span>
			</button>
		{/each}
	</div>

	<div class="months" aria-hidden="true">
		{#each Array.from({ length: slots }, (_, i) => i) as i (i)}
			{@const m = months[i]}
			<span class="month mono" class:on={m && selected === m.period} class:future={!m} style:left="{x(i)}%">
				{m && (i % labelEvery === 0 || selected === m.period) ? monthLabel(m.period, true) : ''}
			</span>
		{/each}
	</div>

	<p class="key">
		<span><i class="k-line"></i>{t('index.series.levelKey')}</span>
		<span><i class="k-own"></i>{t('index.series.ownKey')}</span>
		<span><i class="k-ci"></i>{t('index.series.ciKey')}</span>
	</p>
</div>

<style>
	.chart {
		--plot-h: clamp(11rem, 42vw, 17rem);
		padding-inline-start: 1.75rem;
	}
	.plot {
		position: relative;
		height: var(--plot-h);
		border-radius: 0.5rem;
		background: var(--surface-sunken);
		box-shadow: inset 0 0 0 1px var(--border-subtle);
	}
	.bands span {
		position: absolute;
		inset-inline: 0;
		background: color-mix(in oklch, var(--c) 9%, transparent);
		border-top: 1px dashed color-mix(in oklch, var(--c) 30%, transparent);
	}
	.bands span:last-child {
		border-top: 0;
	}
	.ticks .tick {
		position: absolute;
		left: -1.75rem;
		width: 1.4rem;
		text-align: end;
		transform: translateY(50%);
		font-size: 0.625rem;
		color: var(--text-faint);
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.ci {
		fill: color-mix(in oklch, var(--accent) 16%, transparent);
	}
	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2.5;
		stroke-linejoin: round;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.line.provisional {
		stroke-dasharray: 5 5;
	}
	.own {
		position: absolute;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--text-faint);
		transform: translate(-50%, 50%);
		pointer-events: none;
	}
	.point {
		position: absolute;
		width: 2.75rem;
		height: 2.75rem;
		transform: translate(-50%, 50%);
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.point.empty {
		opacity: 0;
	}
	.point.empty:focus-visible {
		opacity: 1;
	}
	.dot {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 3px var(--surface-sunken);
		transition: transform 160ms ease;
	}
	.point.provisional .dot {
		background: var(--surface-sunken);
		box-shadow: inset 0 0 0 2.5px var(--accent), 0 0 0 3px var(--surface-sunken);
	}
	.point.on .dot {
		transform: scale(1.45);
		box-shadow: 0 0 0 3px var(--surface-sunken), 0 0 0 5px color-mix(in oklch, var(--accent) 45%, transparent);
	}
	.point.provisional.on .dot {
		box-shadow: inset 0 0 0 2.5px var(--accent), 0 0 0 3px var(--surface-sunken),
			0 0 0 5px color-mix(in oklch, var(--accent) 45%, transparent);
	}
	@media (hover: hover) {
		.point:hover .dot {
			transform: scale(1.3);
		}
	}
	.point:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -0.4rem;
		border-radius: 50%;
	}
	.months {
		position: relative;
		height: 1.6rem;
	}
	.month {
		position: absolute;
		top: 0.4rem;
		transform: translateX(-50%);
		font-size: 0.6875rem;
		color: var(--text-faint);
		white-space: nowrap;
	}
	.month.on {
		color: var(--text-primary);
		font-weight: 600;
	}
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.key span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.key i {
		display: inline-block;
	}
	.k-line {
		width: 1.1rem;
		height: 2.5px;
		background: var(--accent);
	}
	.k-own {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--text-faint);
	}
	.k-ci {
		width: 1.1rem;
		height: 0.6rem;
		background: color-mix(in oklch, var(--accent) 16%, transparent);
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			transition: none;
		}
	}
</style>
