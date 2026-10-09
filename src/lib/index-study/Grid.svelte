<script lang="ts">
	import { t, tf } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';

	/**
	 * Trust against grip, as a grid you can read square by square.
	 *
	 * Trust runs across, grip runs up; every square is one cell of the published
	 * 10×10 density, lit in the reader's accent by how many respondents sit in
	 * it. The pointer sends a soft ripple through the squares around it, the
	 * active row and column light their totals in the margins, and the readout
	 * beside the grid states the square in words. On a phone the same is a tap.
	 *
	 * Nothing is finer than the published grid: the readout reports a square's
	 * count, its share and its row and column totals, all from the aggregate.
	 *
	 * Motion, kept apart on purpose: the entrance animates the individual
	 * `translate`/`opacity` properties and releases them when it ends; the ripple
	 * and the selection use `transform`. Two systems on one property fought each
	 * other in the first version, and squares snapped instead of easing.
	 *
	 * Accessibility: the squares are buttons with a roving tab stop (one in the
	 * tab order, arrow keys move it) and full spoken labels. The table under the
	 * grid carries every non-empty cell.
	 */
	let {
		grid,
		meanX = null,
		meanY = null,
		you = null,
		emptyNote = null
	}: {
		grid: number[][] | null;
		meanX?: number | null;
		meanY?: number | null;
		/** The reader's own trust and grip (0..1), computed in their browser: their square is marked. */
		you?: { x: number; y: number } | null;
		/** Said where the crowd would be, when there is no crowd to show yet. */
		emptyNote?: string | null;
	} = $props();

	const N = 10;
	const counts = $derived(grid ?? Array.from({ length: N }, () => new Array<number>(N).fill(0)));
	const total = $derived(counts.flat().reduce((a, b) => a + b, 0));
	const max = $derived(Math.max(1, ...counts.flat()));
	const colTotals = $derived(counts.map((col) => col.reduce((a, b) => a + b, 0)));
	const rowTotals = $derived(Array.from({ length: N }, (_, y) => counts.reduce((a, col) => a + col[y], 0)));
	const colMax = $derived(Math.max(1, ...colTotals));
	const rowMax = $derived(Math.max(1, ...rowTotals));

	/** The fullest square: what the readout shows before anyone touches the grid. */
	const densest = $derived.by(() => {
		let best = { x: 4, y: 5, n: -1 };
		counts.forEach((col, x) => col.forEach((n, y) => n > best.n && (best = { x, y, n })));
		return { x: best.x, y: best.y };
	});
	let picked = $state<{ x: number; y: number } | null>(null);
	let hovered = $state<{ x: number; y: number } | null>(null);
	/** True once the reader has pointed at, tapped or focused a square. */
	const engaged = $derived(picked !== null || hovered !== null);
	const youCell = $derived(
		you ? { x: Math.max(0, Math.min(N - 1, Math.floor(you.x * N))), y: Math.max(0, Math.min(N - 1, Math.floor(you.y * N))) } : null
	);
	const active = $derived(hovered ?? picked ?? youCell ?? densest);

	// Ripple: the pointer position in grid units, read by every square in CSS.
	let px = $state(-100);
	let py = $state(-100);
	let plot: HTMLDivElement | undefined = $state();
	function move(e: PointerEvent) {
		if (!plot || e.pointerType === 'touch') return;
		const r = plot.getBoundingClientRect();
		px = ((e.clientX - r.left) / r.width) * N;
		py = ((e.clientY - r.top) / r.height) * N;
	}
	function leave() {
		px = -100;
		py = -100;
		hovered = null;
	}

	const quadrant = (x: number, y: number) =>
		x < 5 ? (y >= 5 ? 'policeState' : 'absent') : y >= 5 ? 'strongState' : 'guardian';
	const range = (i: number) => `${i * 10}–${i * 10 + 10}`;
	const fmt = (v: number) => new Intl.NumberFormat(app.locale === 'ar' ? 'ar-TN-u-nu-latn' : app.locale).format(v);
	const pctOf = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

	// Keyboard: one square in the tab order; arrows move it in the visual grid.
	let buttons: Record<string, HTMLButtonElement> = {};
	function key(e: KeyboardEvent, x: number, y: number) {
		const step: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, 1],
			ArrowDown: [0, -1]
		};
		const d = step[e.key];
		if (!d) return;
		e.preventDefault();
		const nx = Math.max(0, Math.min(N - 1, x + d[0]));
		const ny = Math.max(0, Math.min(N - 1, y + d[1]));
		picked = { x: nx, y: ny };
		buttons[`${nx}:${ny}`]?.focus();
	}

	/** Squares in reading order: the top row is the highest grip. */
	const cells = $derived(
		Array.from({ length: N * N }, (_, i) => {
			const x = i % N;
			const y = N - 1 - Math.floor(i / N);
			return { x, y, n: counts[x][y] };
		})
	);
	const centre = $derived(meanX !== null && meanY !== null ? { x: meanX * 100, y: (1 - meanY) * 100 } : null);
	const a = $derived({ ...active, n: counts[active.x][active.y], q: quadrant(active.x, active.y) });
</script>

<div class="field">
	<!-- A numeric chart: its geometry is left to right in every locale; the
	     labels inside it still shape and read in their own script. -->
	<div class="stage" dir="ltr">
		<span class="quad tl" aria-hidden="true">{t('index.quadrant.policeState')}</span>
		<span class="quad tr" aria-hidden="true">{t('index.quadrant.strongState')}</span>

		<!-- Trust margin: how many respondents at each level of trust. -->
		<div class="margin top" aria-hidden="true">
			{#each colTotals as c, x (x)}
				<span class:on={engaged && x === a.x}><i style:height="{(c / colMax) * 100}%"></i></span>
			{/each}
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="plot"
			bind:this={plot}
			onpointermove={move}
			onpointerleave={leave}
			style:--px={px}
			style:--py={py}
			role="group"
			aria-label={t('index.plane.aria')}
		>
			<span class="mid v" aria-hidden="true"></span>
			<span class="mid h" aria-hidden="true"></span>
			{#each cells as c (`${c.x}:${c.y}`)}
				{@const on = c.x === a.x && c.y === a.y}
				<button
					bind:this={buttons[`${c.x}:${c.y}`]}
					class="tile q-{quadrant(c.x, c.y)}"
					class:on={engaged && on}
					class:rest={!engaged && on}
					class:line={engaged && (c.x === a.x || c.y === a.y)}
					class:zero={c.n === 0}
					class:you={youCell?.x === c.x && youCell?.y === c.y}
					style:--cx={c.x + 0.5}
					style:--cy={N - c.y - 0.5}
					style:--w={c.n / max}
					style:--i={c.x + (N - 1 - c.y)}
					tabindex={on ? 0 : -1}
					aria-label={tf('index.grid.tileAria', { t: range(c.x), g: range(c.y), n: fmt(c.n) })}
					aria-pressed={picked?.x === c.x && picked?.y === c.y}
					onpointerenter={(e) => e.pointerType !== 'touch' && (hovered = { x: c.x, y: c.y })}
					onclick={() => (picked = { x: c.x, y: c.y })}
					onkeydown={(e) => key(e, c.x, c.y)}
					onfocus={() => (picked = { x: c.x, y: c.y })}
				>
					<span class="n mono">{c.n}</span>
				</button>
			{/each}
			{#if centre && total > 0}
				<span class="centre" style:left="{centre.x}%" style:top="{centre.y}%" aria-hidden="true"></span>
			{/if}
			{#if youCell}
				<span
					class="you-mark mono"
					style:left="{((youCell.x + 0.5) / N) * 100}%"
					style:top="{((N - youCell.y - 0.5) / N) * 100}%"
					aria-hidden="true">{t('index.grid.you')}</span
				>
			{/if}
			{#if total === 0 && !youCell}
				<span class="empty">{emptyNote ?? t('index.plane.empty')}</span>
			{/if}
		</div>

		<!-- Grip margin: how many respondents at each level of grip. -->
		<div class="margin side" aria-hidden="true">
			{#each [...rowTotals].reverse() as r, i (i)}
				<span class:on={engaged && N - 1 - i === a.y}><i style:width="{(r / rowMax) * 100}%"></i></span>
			{/each}
		</div>

		<span class="quad bl" aria-hidden="true">{t('index.quadrant.absent')}</span>
		<span class="quad br" aria-hidden="true">{t('index.quadrant.guardian')}</span>
		<span class="axis x mono" aria-hidden="true">{t('index.plane.xAxis')} →</span>
		<span class="axis y mono" aria-hidden="true">{t('index.plane.yAxis')} →</span>
	</div>

	<!-- The readout: the active square in words. -->
	<aside class="readout" aria-live="polite">
		{#if total === 0 && youCell}
			<!-- No crowd yet: the reader's own square, in words. -->
			<p class="tag q-{a.q}"><i></i>{t(`index.quadrant.${a.q}`)}</p>
			<p class="big mono">{t('index.grid.you')}</p>
			<dl class="coords">
				<div><dt>{t('index.plane.xAxis')}</dt><dd class="mono"><bdi dir="ltr">{range(a.x)}</bdi></dd></div>
				<div><dt>{t('index.plane.yAxis')}</dt><dd class="mono"><bdi dir="ltr">{range(a.y)}</bdi></dd></div>
			</dl>
			<p class="desc">{t(`index.quadrant.${a.q}.desc`)}</p>
			{#if emptyNote}<p class="hint">{emptyNote}</p>{/if}
		{:else if total === 0}
			<p class="desc">{emptyNote ?? t('index.plane.empty')}</p>
		{:else}
			<p class="tag q-{a.q}"><i></i>{t(`index.quadrant.${a.q}`)}</p>
			<p class="big mono">{fmt(a.n)}<small>{t('index.grid.people')}</small></p>
			<p class="share mono">{tf('index.grid.share', { p: fmt(pctOf(a.n)) })}</p>
			<dl class="coords">
				<div><dt>{t('index.plane.xAxis')}</dt><dd class="mono"><bdi dir="ltr">{range(a.x)}</bdi></dd></div>
				<div><dt>{t('index.plane.yAxis')}</dt><dd class="mono"><bdi dir="ltr">{range(a.y)}</bdi></dd></div>
			</dl>
			<p class="desc">{t(`index.quadrant.${a.q}.desc`)}</p>
			<p class="totals mono">
				{tf('index.grid.col', { n: fmt(colTotals[a.x]) })}<br />{tf('index.grid.row', { n: fmt(rowTotals[a.y]) })}
			</p>
			{#if !engaged}<p class="hint">{t('index.grid.hint')}</p>{/if}
		{/if}
	</aside>
</div>

{#if total > 0}
	<details class="tbl">
		<summary>{t('index.table.show')}</summary>
		<table>
			<thead>
				<tr><th>{t('index.plane.xAxis')}</th><th>{t('index.plane.yAxis')}</th><th>{t('index.table.count')}</th></tr>
			</thead>
			<tbody>
				{#each cells.filter((c) => c.n > 0) as c (`${c.x}:${c.y}`)}
					<tr><td class="mono" dir="ltr">{range(c.x)}</td><td class="mono" dir="ltr">{range(c.y)}</td><td class="mono">{c.n}</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
{/if}

<style>
	/* The v1 plot well: one sunken panel, the grid and its readout inside it. */
	.field {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15rem;
		gap: 2rem;
		align-items: center;
		background: var(--surface-sunken);
		padding: 1.4rem 1.6rem 1.2rem;
	}

	/* ---- stage: labels, margins, plot ------------------------------------ */
	.stage {
		--m: 2rem; /* margin bar depth */
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--m) 0.9rem;
		grid-template-rows: auto var(--m) auto auto auto;
		column-gap: 6px;
		row-gap: 6px;
		width: min(100%, 30rem);
		justify-self: center;
	}
	/* Each corner name has its half of the width and wraps inside it, so two
	   names on one edge never run into each other on a narrow screen. */
	.quad {
		max-width: 48%;
		font-size: 0.6rem;
		line-height: 1.35;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.quad.tl,
	.quad.tr {
		grid-row: 1;
		grid-column: 1;
		align-self: end;
	}
	.quad.tr {
		justify-self: end;
		text-align: end;
	}
	.quad.bl,
	.quad.br {
		grid-row: 4;
		grid-column: 1;
		align-self: start;
	}
	.quad.br {
		justify-self: end;
		text-align: end;
	}
	.quad.tl {
		color: var(--index-band-1);
		font-weight: 600;
	}
	.quad.br {
		color: var(--index-band-5);
		font-weight: 600;
	}
	:global(.rtl) .quad,
	:global(.rtl) .axis {
		letter-spacing: 0;
	}

	/* Margins: thin bars on the same tracks as the squares, so each bar sits
	   exactly over its column or beside its row. */
	.margin {
		display: grid;
		gap: 3px;
	}
	.margin.top {
		grid-row: 2;
		grid-column: 1;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		align-items: end;
	}
	.margin.side {
		grid-row: 3;
		grid-column: 2;
		grid-template-rows: repeat(10, minmax(0, 1fr));
	}
	.margin span {
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		height: 100%;
	}
	.margin.side span {
		align-items: center;
		justify-content: flex-start;
	}
	.margin i {
		display: block;
		width: 6px;
		min-height: 1px;
		border-radius: 1px;
		background: var(--border-strong);
		transition: background 0.2s;
	}
	.margin.side i {
		width: auto;
		height: 6px;
		min-width: 1px;
	}
	.margin span.on i {
		background: var(--accent);
	}

	.plot {
		position: relative;
		grid-row: 3;
		grid-column: 1;
		aspect-ratio: 1;
		display: grid;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		grid-template-rows: repeat(10, minmax(0, 1fr));
		gap: 3px;
		touch-action: manipulation;
	}
	.mid {
		position: absolute;
		z-index: 2;
		pointer-events: none;
		border: 0 dashed var(--text-faint);
	}
	.mid.v {
		top: -3px;
		bottom: -3px;
		left: 50%;
		border-left-width: 1px;
		transform: translateX(-0.5px);
	}
	.mid.h {
		left: -3px;
		right: -3px;
		top: 50%;
		border-top-width: 1px;
		transform: translateY(-0.5px);
	}

	/*
	 * A square. Its fill is its count in the reader's accent. The ripple is the
	 * distance from the pointer, computed in CSS from the plot's two variables:
	 * one style write per pointer move, no per-square script.
	 */
	.tile {
		--dist: hypot(calc(var(--px) - var(--cx)), calc(var(--py) - var(--cy)));
		--lift: max(0, calc(1 - var(--dist) / 2.2));
		position: relative;
		border: 0;
		padding: 0;
		border-radius: 2px;
		cursor: pointer;
		background: color-mix(in oklab, var(--accent) calc(10% + var(--w) * 90%), var(--surface-base));
		transform: scale(calc(1 + var(--lift) * 0.1));
		filter: brightness(calc(1 + var(--lift) * 0.15));
		transition:
			transform 0.2s ease-out,
			filter 0.2s ease-out,
			outline-color 0.15s;
		outline: 1px solid transparent;
		outline-offset: 1px;
		/* Entrance: individual properties, released when it ends (no fill
		   forwards), so the transform above is never held by the animation. */
		animation: enter 0.45s ease-out backwards;
		animation-delay: calc(var(--i) * 18ms);
	}
	.tile.zero {
		background: var(--surface-base);
	}
	.tile.q-policeState.zero {
		background: color-mix(in oklab, var(--index-band-1) 8%, var(--surface-base));
	}
	.tile.q-guardian.zero {
		background: color-mix(in oklab, var(--index-band-5) 8%, var(--surface-base));
	}
	.tile.line {
		outline-color: var(--border-strong);
	}
	.tile.rest {
		outline-color: var(--text-faint);
	}
	.tile.on {
		z-index: 3;
		outline: 2px solid var(--text-primary);
		transform: scale(1.14);
	}
	.tile:focus-visible {
		outline: 2px solid var(--accent);
	}
	.tile .n {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: clamp(0.55rem, 1.6vw, 0.74rem);
		font-weight: 700;
		color: var(--accent-text);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.tile.zero .n {
		color: var(--text-faint);
	}
	.tile.on .n {
		opacity: 1;
	}
	@keyframes enter {
		from {
			opacity: 0;
			translate: 0 6px;
		}
	}

	/* The wave's centre: mean trust and mean grip, a ring that breathes. */
	.centre {
		position: absolute;
		z-index: 4;
		width: 1.1rem;
		height: 1.1rem;
		margin: -0.55rem 0 0 -0.55rem;
		border: 2px solid var(--text-primary);
		border-radius: 50%;
		pointer-events: none;
		animation: breathe 2.6s ease-in-out infinite;
	}
	@keyframes breathe {
		0%,
		100% {
			box-shadow: 0 0 0 2px color-mix(in oklab, var(--text-primary) 18%, transparent);
		}
		50% {
			box-shadow: 0 0 0 6px color-mix(in oklab, var(--text-primary) 0%, transparent);
		}
	}
	.empty {
		position: absolute;
		inset: 45% 0 auto;
		text-align: center;
		color: var(--text-faint);
		font-size: 0.86rem;
	}

	.axis {
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.axis.x {
		grid-row: 5;
		grid-column: 1;
		justify-self: center;
	}
	.axis.y {
		grid-row: 3;
		grid-column: 3;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		justify-self: center;
		align-self: center;
	}

	/* ---- the readout ----------------------------------------------------- */
	.readout {
		border-top: 2px solid var(--text-primary);
		padding-top: 0.8rem;
		align-self: center;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-secondary);
		margin: 0 0 0.5rem;
	}
	.tag i {
		width: 0.6rem;
		height: 0.6rem;
		background: var(--index-band-3);
	}
	.tag.q-policeState i {
		background: var(--index-band-1);
	}
	.tag.q-guardian i {
		background: var(--index-band-5);
	}
	.big {
		font-size: clamp(2.8rem, 6vw, 3.8rem);
		line-height: 0.9;
		letter-spacing: -0.04em;
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.big small {
		font-family: var(--font-sans);
		font-size: 0.24em;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin-inline-start: 0.4rem;
		color: var(--text-faint);
	}
	.share {
		font-size: 0.76rem;
		color: var(--accent);
		margin: 0.35rem 0 0.8rem;
	}
	.coords {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		margin: 0 0 0.8rem;
	}
	.coords div {
		background: var(--surface-base);
		padding: 0.45rem 0.6rem;
	}
	.coords dt {
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.coords dd {
		margin: 0.1rem 0 0;
		font-size: 1rem;
	}
	.desc {
		font-size: 0.86rem;
		line-height: 1.45;
		color: var(--text-secondary);
		margin: 0 0 0.7rem;
	}
	.totals {
		font-size: 0.7rem;
		line-height: 1.7;
		color: var(--text-faint);
		margin: 0;
	}
	.hint {
		font-size: 0.7rem;
		color: var(--text-faint);
		margin: 0.7rem 0 0;
	}

	.tbl {
		margin-top: 0.4rem;
		font-size: 0.82rem;
	}
	.tbl summary {
		cursor: pointer;
		color: var(--text-secondary);
	}
	.tbl table {
		border-collapse: collapse;
		margin-top: 0.4rem;
	}
	.tbl th,
	.tbl td {
		text-align: start;
		padding: 0.2rem 0.9rem 0.2rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}

	/* ---- narrow: grid first, readout under it ----------------------------- */
	@media (max-width: 980px) {
		.field {
			grid-template-columns: 1fr;
			gap: 1.2rem;
			padding: 1.1rem 0.9rem 1rem;
		}
		.stage {
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tile,
		.centre {
			animation: none;
			transition: none;
		}
		.tile {
			transform: none;
			filter: none;
		}
	}
	/* The reader's own square: ringed in the accent, labelled above. */
	.tile.you {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		z-index: 2;
	}
	.you-mark {
		position: absolute;
		transform: translate(-50%, -165%);
		padding: 0.1rem 0.35rem;
		font-size: 0.5625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: var(--accent);
		color: var(--accent-text);
		pointer-events: none;
		z-index: 3;
		white-space: nowrap;
	}
</style>
