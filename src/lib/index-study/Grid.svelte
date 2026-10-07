<script lang="ts">
	import { t, tf } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';

	/**
	 * The field, as an instrument you can touch.
	 *
	 * A 10×10 grid: trust across, grip up, every square a cell of the published
	 * density. A square's light is how many respondents sit in it (one hue,
	 * sequential). The pointer sends a ripple through the squares around it, the
	 * hovered row and column light up with their totals in the margins, and the
	 * panel reads the square out in words. On a phone the same thing is a tap.
	 *
	 * Nothing here is finer than the published grid: a square is the smallest
	 * unit the API returns, and the panel reports only its count, its share and
	 * the totals of its row and column.
	 *
	 * Accessibility: the squares are buttons with a roving tab stop (one in the
	 * tab order, arrow keys move it), each with a full spoken label. The table
	 * under the grid carries every non-empty cell.
	 */
	let {
		grid,
		meanX = null,
		meanY = null
	}: { grid: number[][] | null; meanX?: number | null; meanY?: number | null } = $props();

	const N = 10;
	const counts = $derived(grid ?? Array.from({ length: N }, () => new Array<number>(N).fill(0)));
	const total = $derived(counts.flat().reduce((a, b) => a + b, 0));
	const max = $derived(Math.max(1, ...counts.flat()));
	const colTotals = $derived(counts.map((col) => col.reduce((a, b) => a + b, 0)));
	const rowTotals = $derived(Array.from({ length: N }, (_, y) => counts.reduce((a, col) => a + col[y], 0)));
	const colMax = $derived(Math.max(1, ...colTotals));
	const rowMax = $derived(Math.max(1, ...rowTotals));

	/** The densest square: what the panel reads before anyone touches the grid. */
	const densest = $derived.by(() => {
		let best = { x: 4, y: 5, n: -1 };
		counts.forEach((col, x) => col.forEach((n, y) => n > best.n && (best = { x, y, n })));
		return { x: best.x, y: best.y };
	});
	let picked = $state<{ x: number; y: number } | null>(null);
	let hovered = $state<{ x: number; y: number } | null>(null);
	const active = $derived(hovered ?? picked ?? densest);

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

	const cells = $derived(
		Array.from({ length: N * N }, (_, i) => {
			const row = Math.floor(i / N); // 0 = top of the grid = highest grip
			const x = i % N;
			const y = N - 1 - row;
			return { x, y, n: counts[x][y] };
		})
	);
	const centre = $derived(meanX !== null && meanY !== null ? { x: meanX * 100, y: (1 - meanY) * 100 } : null);
	const a = $derived({ ...active, n: counts[active.x][active.y], q: quadrant(active.x, active.y) });
</script>

<div class="field" class:empty={total === 0}>
	<div class="inner">
		<header class="head">
			<p class="kick mono">{t('index.grid.kicker')}</p>
			<h2>{t('index.grid.title')}</h2>
			<p class="lede">{t('index.grid.lede')}</p>
		</header>

		<!-- A numeric chart: its geometry is left to right in every locale; the
		     labels inside it still shape and read in their own script. -->
		<div class="stage" dir="ltr">
			<!-- Column margin: how trust is distributed, the active column lit. -->
			<div class="margin top" aria-hidden="true">
				{#each colTotals as c, x (x)}
					<span class:on={x === a.x}><i style:height="{(c / colMax) * 100}%"></i></span>
				{/each}
			</div>
			<div class="corner" aria-hidden="true"></div>

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
				<span class="quad tl" aria-hidden="true">{t('index.quadrant.policeState')}</span>
				<span class="quad tr" aria-hidden="true">{t('index.quadrant.strongState')}</span>
				<span class="quad bl" aria-hidden="true">{t('index.quadrant.absent')}</span>
				<span class="quad br" aria-hidden="true">{t('index.quadrant.guardian')}</span>
				<!-- The quadrant boundaries: trust 50 and grip 50, drawn in the gaps. -->
				<span class="mid v" aria-hidden="true"></span>
				<span class="mid h" aria-hidden="true"></span>
				{#each cells as c (`${c.x}:${c.y}`)}
					<button
						bind:this={buttons[`${c.x}:${c.y}`]}
						class="tile q-{quadrant(c.x, c.y)}"
						class:on={c.x === a.x && c.y === a.y}
						class:line={c.x === a.x || c.y === a.y}
						class:zero={c.n === 0}
						style:--cx={c.x + 0.5}
						style:--cy={N - c.y - 0.5}
						style:--w={c.n / max}
						style:--i={c.x + (N - 1 - c.y)}
						tabindex={c.x === a.x && c.y === a.y ? 0 : -1}
						aria-label={tf('index.grid.tileAria', { t: range(c.x), g: range(c.y), n: fmt(c.n) })}
						aria-pressed={picked?.x === c.x && picked?.y === c.y}
						onpointerenter={(e) => e.pointerType !== 'touch' && (hovered = { x: c.x, y: c.y })}
						onclick={() => (picked = { x: c.x, y: c.y })}
						onkeydown={(e) => key(e, c.x, c.y)}
						onfocus={() => (picked = { x: c.x, y: c.y })}
					>
						<span class="n mono">{c.n || ''}</span>
					</button>
				{/each}
				{#if centre && total > 0}
					<span class="centre" style:left="{centre.x}%" style:top="{centre.y}%" aria-hidden="true">
						<em class="mono">{t('index.grid.centre')}</em>
					</span>
				{/if}
			</div>

			<!-- Row margin: how grip is distributed, the active row lit. -->
			<div class="margin side" aria-hidden="true">
				{#each [...rowTotals].reverse() as r, i (i)}
					<span class:on={N - 1 - i === a.y}><i style:width="{(r / rowMax) * 100}%"></i></span>
				{/each}
			</div>

			<p class="axis x mono">{t('index.plane.xAxis')} 0 → 100</p>
			<p class="axis y mono">{t('index.plane.yAxis')} 0 → 100</p>
		</div>

		<!-- The readout: the active square in words. -->
		<aside class="panel" aria-live="polite">
			{#if total === 0}
				<p class="big">—</p>
				<p class="desc">{t('index.plane.empty')}</p>
			{:else}
				<p class="tag q-{a.q}"><i></i>{t(`index.quadrant.${a.q}`)}</p>
				<p class="big">{fmt(a.n)}<small>{t('index.grid.people')}</small></p>
				<p class="share mono">{tf('index.grid.share', { p: fmt(pctOf(a.n)) })}</p>
				<dl class="coords">
					<div><dt>{t('index.plane.xAxis')}</dt><dd class="mono"><bdi dir="ltr">{range(a.x)}</bdi></dd></div>
					<div><dt>{t('index.plane.yAxis')}</dt><dd class="mono"><bdi dir="ltr">{range(a.y)}</bdi></dd></div>
				</dl>
				<p class="desc">{t(`index.quadrant.${a.q}.desc`)}</p>
				<p class="totals mono">
					{tf('index.grid.col', { n: fmt(colTotals[a.x]) })}<br />{tf('index.grid.row', { n: fmt(rowTotals[a.y]) })}
				</p>
				<p class="hint">{t('index.grid.hint')}</p>
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
</div>

<style>
	/*
	 * Set in the page's own register (surfaces, rules, the reader's accent), so
	 * the grid follows the theme: the squares are lit in the accent the reader
	 * chose, on the sunken surface of whichever palette is active.
	 */
	.field {
		border-top: 1px solid var(--border-default);
		margin-top: 2rem;
		padding-top: 1.4rem;
	}
	.inner {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 19rem;
		grid-template-areas:
			'head head'
			'stage panel';
		gap: 1.2rem 2.6rem;
		align-items: start;
	}
	.head {
		grid-area: head;
	}
	.kick {
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--text-faint);
		margin: 0 0 0.3rem;
	}
	.head h2 {
		font-size: 1.1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 0.4rem;
	}
	.lede {
		color: var(--text-faint);
		font-size: 0.86rem;
		max-width: 44rem;
		margin: 0;
	}

	/* ---- the stage: margins, plot, axes ------------------------------------ */
	.stage {
		grid-area: stage;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 3rem;
		grid-template-rows: var(--mtop) auto auto;
		gap: 0.5rem;
		padding: 2.6rem 1.2rem 1rem;
		background: var(--surface-sunken);
		--mtop: 3rem;
	}
	.margin {
		display: grid;
		gap: 3px;
	}
	.margin.top {
		grid-template-columns: repeat(10, 1fr);
		align-items: end;
	}
	.margin.side {
		grid-template-rows: repeat(10, 1fr);
		grid-row: 2;
		grid-column: 2;
	}
	.margin span {
		display: flex;
		align-items: flex-end;
		height: 100%;
	}
	.margin.side span {
		align-items: center;
	}
	.margin i {
		display: block;
		width: 100%;
		background: var(--border-strong);
		transition: background 0.25s;
	}
	.margin.side i {
		height: 70%;
	}
	.margin span.on i {
		background: var(--accent);
	}

	.plot {
		position: relative;
		grid-row: 2;
		grid-column: 1;
		aspect-ratio: 1;
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 4px;
		touch-action: manipulation;
	}
	.quad {
		position: absolute;
		z-index: 2;
		font-size: 0.62rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--text-secondary);
		pointer-events: none;
		white-space: nowrap;
	}
	/* The top labels sit above the trust margin, clear of its bars. */
	.quad.tl {
		top: calc(-1 * (var(--mtop) + 0.5rem + 1.5rem));
		left: 0;
		color: var(--index-band-1);
		font-weight: 600;
	}
	.quad.tr {
		top: calc(-1 * (var(--mtop) + 0.5rem + 1.5rem));
		right: 0;
	}
	.quad.bl {
		bottom: -1.4rem;
		left: 0;
	}
	.quad.br {
		bottom: -1.4rem;
		right: 0;
		color: var(--index-band-5);
		font-weight: 600;
	}
	:global(.rtl) .quad {
		letter-spacing: 0;
	}

	.mid {
		position: absolute;
		z-index: 2;
		pointer-events: none;
		border: 0 dashed var(--text-faint);
	}
	.mid.v {
		top: -0.4rem;
		bottom: -0.4rem;
		left: 50%;
		border-left-width: 1px;
		transform: translateX(-0.5px);
	}
	.mid.h {
		left: -0.4rem;
		right: -0.4rem;
		top: 50%;
		border-top-width: 1px;
		transform: translateY(-0.5px);
	}

	/*
	 * A square. Its fill is its count, in the reader's accent; its lift is the
	 * ripple: the distance from the pointer, computed in CSS from the two
	 * variables the plot sets, so a pointer move is one style write and no
	 * per-square script.
	 */
	.tile {
		--dist: hypot(calc(var(--px) - var(--cx)), calc(var(--py) - var(--cy)));
		--lift: max(0, calc(1 - var(--dist) / 2.6));
		position: relative;
		border: 0;
		padding: 0;
		border-radius: 3px;
		cursor: pointer;
		background: color-mix(in oklch, var(--accent) calc(14% + var(--w) * 86%), var(--surface-base));
		transform: translateY(calc(var(--lift) * -3px)) scale(calc(1 + var(--lift) * 0.12));
		filter: saturate(calc(1 + var(--lift) * 0.5)) brightness(calc(1 + var(--lift) * 0.12));
		box-shadow: 0 calc(var(--lift) * 8px) calc(var(--lift) * 18px) -6px color-mix(in oklch, var(--accent) 60%, transparent);
		transition:
			transform 0.18s ease-out,
			filter 0.18s ease-out,
			box-shadow 0.18s ease-out,
			outline-color 0.2s;
		outline: 1px solid transparent;
		outline-offset: 2px;
		animation: rise 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: calc(var(--i) * 30ms);
	}
	.tile.zero {
		background: var(--surface-base);
		box-shadow: none;
	}
	.tile.q-policeState.zero {
		background: color-mix(in oklch, var(--index-band-1) 7%, var(--surface-base));
	}
	.tile.q-guardian.zero {
		background: color-mix(in oklch, var(--index-band-5) 7%, var(--surface-base));
	}
	.tile.line {
		outline-color: var(--border-strong);
	}
	.tile.on {
		outline: 2px solid var(--text-primary);
		z-index: 3;
		transform: scale(1.12);
	}
	.tile:focus-visible {
		outline: 2px solid var(--accent);
	}
	.tile .n {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: clamp(0.55rem, 1.4vw, 0.78rem);
		font-weight: 700;
		color: var(--accent-text);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.tile.on .n,
	.plot:hover .tile.line .n {
		opacity: 1;
	}
	.tile.zero .n {
		color: var(--text-faint);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.6);
		}
	}

	/* The wave's centre: mean trust and mean grip, as a ring that breathes. */
	.centre {
		position: absolute;
		z-index: 4;
		width: 1.5rem;
		height: 1.5rem;
		margin: -0.75rem 0 0 -0.75rem;
		border: 2px solid var(--text-primary);
		border-radius: 50%;
		pointer-events: none;
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--text-primary) 15%, transparent);
		animation: breathe 2.6s ease-in-out infinite;
	}
	.centre em {
		position: absolute;
		left: calc(100% + 0.4rem);
		top: 50%;
		transform: translateY(-50%);
		font-style: normal;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-primary);
		white-space: nowrap;
		background: var(--surface-sunken);
		padding: 0.1rem 0.3rem;
	}
	@keyframes breathe {
		50% {
			box-shadow: 0 0 0 9px color-mix(in oklch, var(--text-primary) 0%, transparent);
		}
	}

	.axis {
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-faint);
		margin: 1.5rem 0 0;
	}
	.axis.x {
		grid-row: 3;
		grid-column: 1;
		text-align: center;
	}
	.axis.y {
		display: none;
	}

	/* ---- the panel ------------------------------------------------------- */
	.panel {
		grid-area: panel;
		position: sticky;
		top: 1rem;
		border-top: 2px solid var(--text-primary);
		padding-top: 0.9rem;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--text-secondary);
		margin: 0 0 0.6rem;
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
		font-family: var(--font-mono);
		font-size: clamp(3.4rem, 8vw, 5.2rem);
		line-height: 0.9;
		letter-spacing: -0.04em;
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.big small {
		font-family: var(--font-sans);
		font-size: 0.18em;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin-inline-start: 0.5rem;
		color: var(--text-faint);
	}
	.share {
		font-size: 0.8rem;
		color: var(--accent);
		margin: 0.4rem 0 0.9rem;
	}
	.coords {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		margin: 0 0 0.9rem;
	}
	.coords div {
		background: var(--surface-sunken);
		padding: 0.5rem 0.7rem;
	}
	.coords dt {
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.coords dd {
		margin: 0.15rem 0 0;
		font-size: 1.1rem;
	}
	.desc {
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--text-secondary);
		margin: 0 0 0.8rem;
	}
	.totals {
		font-size: 0.72rem;
		line-height: 1.7;
		color: var(--text-faint);
		margin: 0 0 0.9rem;
	}
	.hint {
		font-size: 0.72rem;
		color: var(--text-faint);
		border-top: 1px solid var(--border-subtle);
		padding-top: 0.6rem;
	}

	.tbl {
		margin-top: 0.8rem;
		font-size: 0.82rem;
	}
	.tbl summary {
		cursor: pointer;
		color: var(--text-secondary);
	}
	.tbl table {
		border-collapse: collapse;
		margin-top: 0.5rem;
	}
	.tbl th,
	.tbl td {
		text-align: start;
		padding: 0.2rem 1rem 0.2rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}

	/* ---- phone: the grid is the screen ------------------------------------ */
	@media (max-width: 900px) {
		.inner {
			grid-template-columns: 1fr;
			grid-template-areas: 'head' 'stage' 'panel';
		}
		.stage {
			--mtop: 2.2rem;
			grid-template-columns: minmax(0, 1fr) 2rem;
			padding: 2.3rem 0.6rem 0.8rem;
			margin-inline: -0.4rem;
		}
		.plot {
			gap: 3px;
		}
		.panel {
			position: static;
		}
		.hint {
			display: none;
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
</style>
