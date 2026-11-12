<script lang="ts">
	import { tick } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { t, tf, layerLabel, relLabel, basisLabel, entityName, formatDate } from '$lib/t.svelte';
	import { basisLineText } from '$lib/ui/BasisLine.svelte';
	import { LAYER_COLOR, BASIS_COLOR, BASIS_OPACITY, DASH, BASIS_ORDER, type Basis, type Layer } from '$lib/model';
	import { layerMatrix, type MatrixCell, type Scene, type Tie } from '$lib/network/scene';

	/**
	 * Which layers of power exchange ties, as a matrix.
	 *
	 * The map answers "who sits where and who is tied to whom". This answers the
	 * question the lanes were always built for, directly: which parts of the
	 * state reach into which. One cell per pair of layers, the diagonal holding
	 * ties inside a layer, filled by a single-hue ramp so a darker cell is
	 * simply more. It is the phone's way in, because a phone holds one lane of
	 * the map at a time and this whole picture at once.
	 *
	 * The grid is an HTML table, so it is also its own text alternative: every
	 * number on screen is a cell a screen reader can walk. Choosing a cell lists
	 * the ties it counts, and each of those opens its record.
	 */

	let {
		scene,
		onpick,
		onshow
	}: {
		scene: Scene;
		/** Open a tie's record. */
		onpick: (tie: Tie) => void;
		/** Show a tie on the map. */
		onshow: (tie: Tie) => void;
	} = $props();

	const matrix = $derived(layerMatrix(scene));
	const cellOf = $derived(new Map(matrix.cells.map((c) => [c.row + '|' + c.col, c])));

	/** The busiest pair across layers, so the list below is never empty on arrival. */
	const busiest = $derived.by(() => {
		const cross = matrix.cells.filter((c) => c.row !== c.col && c.count > 0);
		const pool = cross.length ? cross : matrix.cells.filter((c) => c.count > 0);
		return pool.sort((a, b) => b.count - a.count)[0] ?? null;
	});

	let picked = $state<string | null>(null);
	/**
	 * What a screen reader hears, set only when the reader picks a cell. The
	 * pair panel itself is not a live region: it follows the scene, and a date
	 * scrub would announce it on every frame.
	 */
	let announce = $state('');
	function pickCell(key: string) {
		picked = key;
		const c = cellOf.get(key);
		if (!c) return;
		// Cleared first, so picking the same pair again is announced again.
		announce = '';
		const text = `${pairLabel(c)}: ${tf('network.matrix.count', { n: c.count })}`;
		void tick().then(() => (announce = text));
	}
	/** A picked pair the lens has since emptied gives way to the busiest one. */
	const current = $derived.by<MatrixCell | null>(() => {
		const c = picked ? cellOf.get(picked) : undefined;
		return c && c.count > 0 ? c : busiest;
	});

	/**
	 * Five steps on a square-root scale, set by the busiest pair ACROSS layers.
	 * The diagonal (ties inside one layer: an owner and their company) runs to
	 * far larger counts, and letting it set the scale painted every bridge, the
	 * thing this view exists to show, in the faintest step. A diagonal cell
	 * above the cross-layer maximum holds at the top step, and its number says
	 * how far above.
	 */
	const crossMax = $derived(Math.max(1, ...matrix.cells.filter((c) => c.row !== c.col).map((c) => c.count)));
	function step(n: number): number {
		if (n <= 0) return 0;
		return Math.max(1, Math.min(5, Math.ceil(Math.sqrt(n / crossMax) * 5)));
	}

	const BASIS_RANK: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	const ties = $derived(
		current
			? [...current.ties].sort(
					(a, b) =>
						BASIS_RANK.indexOf((a.rel.basis ?? 'documented') as Basis) - BASIS_RANK.indexOf((b.rel.basis ?? 'documented') as Basis) ||
						a.rel.type.localeCompare(b.rel.type) ||
						a.id.localeCompare(b.id)
				)
			: []
	);

	/** Per-basis counts for a cell, in the model's order: what each number rests on. */
	function basisMix(c: MatrixCell): { b: Basis; n: number }[] {
		const m = new Map<Basis, number>();
		for (const e of c.ties) {
			const b = (e.rel.basis ?? 'documented') as Basis;
			m.set(b, (m.get(b) ?? 0) + (e.bundle ?? 1));
		}
		return BASIS_ORDER.filter((b) => m.has(b)).map((b) => ({ b, n: m.get(b)! }));
	}

	function pairLabel(c: MatrixCell): string {
		return c.row === c.col
			? tf('network.matrix.within', { layer: layerLabel(c.row) })
			: tf('network.matrix.between', { a: layerLabel(c.row), b: layerLabel(c.col) });
	}

	function cellLabel(c: MatrixCell): string {
		const mix = basisMix(c)
			.map((x) => `${basisLabel(x.b)} ${x.n}`)
			.join(', ');
		return `${pairLabel(c)}: ${tf('network.matrix.count', { n: c.count })}${mix ? ' (' + mix + ')' : ''}`;
	}

	const totalCross = $derived(matrix.cells.filter((c) => c.row !== c.col).reduce((a, c) => a + c.count, 0));
</script>

<div class="matrix-view">
	<section class="mx">
		<header class="mx-head">
			<h3>{t('network.matrix.title')}</h3>
			<p class="mono">
				{tf('network.matrix.summary', { date: formatDate(app.t, 'day'), n: totalCross })}
			</p>
		</header>

		<table class="grid" style:--n={matrix.layers.length}>
			<caption class="sr">{t('network.matrix.caption')}</caption>
			<thead>
				<tr>
					<td class="corner"></td>
					{#each matrix.layers as col (col)}
						<th scope="col" class="colh">
							<span class="colh-text" style:--c={LAYER_COLOR[col]}>{layerLabel(col)}</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each matrix.layers as row, ri (row)}
					<tr>
						<th scope="row" class="rowh" style:--c={LAYER_COLOR[row]}>
							<i class="sw" aria-hidden="true"></i>{layerLabel(row)}
						</th>
						{#each matrix.layers as col, ci (col)}
							{#if ci <= ri}
								{@const c = cellOf.get(row + '|' + col)!}
								{@const s = step(c.count)}
								<td class="cell-td">
									<button
										class="cell s{s}"
										class:diag={ri === ci}
										class:on={current === c}
										disabled={c.count === 0}
										aria-pressed={picked === row + '|' + col && current === c}
										aria-label={cellLabel(c)}
										title={cellLabel(c)}
										onclick={() => pickCell(row + '|' + col)}
									>
										{#if c.count}<span class="n mono">{c.count}</span>{/if}
									</button>
								</td>
							{:else}
								<td class="cell-td void" aria-hidden="true"></td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<!-- The ramp's key: what the five steps mean, in words. -->
		<div class="key" aria-hidden="true">
			<span class="mono">{t('network.matrix.fewer')}</span>
			{#each [1, 2, 3, 4, 5] as s (s)}<i class="s{s}"></i>{/each}
			<span class="mono">{t('network.matrix.more')}</span>
			<span class="key-diag"><i class="diag-sw"></i>{t('network.matrix.diagonal')}</span>
		</div>
	</section>

	<p class="sr-only" role="status">{announce}</p>
	<section class="pair">
		{#if current}
			<header class="pair-head">
				<span class="pair-sw" aria-hidden="true">
					<i style:--c={LAYER_COLOR[current.row]}></i>{#if current.col !== current.row}<i style:--c={LAYER_COLOR[current.col]}></i>{/if}
				</span>
				<h3>{pairLabel(current)}</h3>
				<span class="pair-n mono">{tf('network.matrix.count', { n: current.count })}</span>
			</header>
			<div class="mix">
				{#each basisMix(current) as x (x.b)}
					<span class="mix-item">
						<svg width="18" height="6" aria-hidden="true"
							><line x1="0" y1="3" x2="18" y2="3" stroke={BASIS_COLOR[x.b]} stroke-opacity={BASIS_OPACITY[x.b]} stroke-width="1.6" stroke-dasharray={DASH[x.b]} /></svg
						>
						{basisLabel(x.b)} <b class="mono">{x.n}</b>
					</span>
				{/each}
			</div>
			<ul class="ties">
				{#each ties as e (e.id)}
					<li>
						<button class="tie-row" onclick={() => onpick(e)}>
							<span class="ends">
								<span class="end" style:--c={LAYER_COLOR[e.a.layer as Layer]}>{entityName(e.rel.from)}</span>
								<span class="arrow" aria-hidden="true">→</span>
								<span class="end" style:--c={LAYER_COLOR[e.b.layer as Layer]}>{entityName(e.rel.to)}</span>
							</span>
							<span class="meta">
								<span class="verb">{e.bundle ? tf('network.bundle.label', { n: e.bundle }) : relLabel(e.rel.type)}</span>
								<svg width="16" height="6" aria-hidden="true"
									><line
										x1="0"
										y1="3"
										x2="16"
										y2="3"
										stroke={BASIS_COLOR[(e.rel.basis ?? 'documented') as Basis]}
										stroke-opacity={BASIS_OPACITY[(e.rel.basis ?? 'documented') as Basis]}
										stroke-width="1.6"
										stroke-dasharray={DASH[(e.rel.basis ?? 'documented') as Basis]}
									/></svg
								>
								<span class="basis">{basisLineText(e.rel.basis ? e.rel : { basis: 'documented' })}</span>
							</span>
						</button>
						<button class="show mono" onclick={() => onshow(e)} aria-label={t('network.matrix.show')} title={t('network.matrix.show')}>
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
								><path d="M2 8h9M8 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg
							>
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">{t('network.matrix.empty')}</p>
		{/if}
	</section>
</div>

<style>
	.matrix-view {
		display: grid;
		grid-template-columns: minmax(0, auto) minmax(0, 1fr);
		gap: var(--s-8);
		padding: var(--s-6) var(--s-7);
		overflow: auto;
		flex: 1;
		min-height: 0;
		align-items: start;
	}
	@media (max-width: 900px) {
		.matrix-view {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--s-6);
			padding: var(--s-5) var(--s-5) var(--s-8);
		}
	}
	h3 {
		margin: 0;
		font-size: var(--t-md);
		font-weight: 600;
		color: var(--text-primary);
	}
	.mx-head p {
		margin: var(--s-2) 0 var(--s-5);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.grid {
		border-collapse: separate;
		border-spacing: 2px;
		/* The cell size follows the space available: seven cells and a label
		   column fit a 390px phone without scrolling sideways. */
		--cell: clamp(30px, calc((100vw - 136px) / var(--n)), 56px);
	}
	.corner {
		width: 1px;
	}
	.colh {
		vertical-align: bottom;
		padding: 0 0 var(--s-2);
		font-weight: 500;
	}
	.colh-text {
		display: inline-block;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		white-space: nowrap;
		max-height: 96px;
		overflow: hidden;
		text-overflow: ellipsis;
		border-inline-end: 2px solid var(--c);
		padding-inline-end: 3px;
	}
	.rowh {
		text-align: start;
		font-weight: 500;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		white-space: nowrap;
		padding-inline-end: var(--s-3);
	}
	@media (max-width: 900px) {
		/* A long layer name wraps under its swatch instead of pushing the last
		   column off a phone's screen. */
		.rowh {
			white-space: normal;
			max-width: 84px;
			line-height: 1.2;
		}
	}
	.sw {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--c);
		margin-inline-end: var(--s-3);
		vertical-align: -0.5px;
	}
	.cell-td {
		padding: 0;
		width: var(--cell);
		height: var(--cell);
	}
	.cell {
		width: var(--cell);
		height: var(--cell);
		display: grid;
		place-items: center;
		border: none;
		border-radius: var(--r-xs);
		cursor: pointer;
		background: var(--seq-0);
		transition:
			background-color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.cell:disabled {
		cursor: default;
		background: var(--seq-0);
		box-shadow: inset 0 0 0 1px var(--border-subtle);
	}
	.cell .n {
		font-size: var(--t-xs);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.cell.s1 { background: var(--seq-1); color: var(--seq-ink-1); }
	.cell.s2 { background: var(--seq-2); color: var(--seq-ink-2); }
	.cell.s3 { background: var(--seq-3); color: var(--seq-ink-3); }
	.cell.s4 { background: var(--seq-4); color: var(--seq-ink-4); }
	.cell.s5 { background: var(--seq-5); color: var(--seq-ink-5); }
	/* Inside one layer: the same ramp, marked by a corner notch so the diagonal
	   reads as a different question (ties within) from the cells around it. */
	.cell.diag {
		background-image: linear-gradient(135deg, var(--border-strong) 0 5px, transparent 5px);
	}
	.cell:not(:disabled):hover {
		box-shadow: inset 0 0 0 1px var(--text-primary);
	}
	.cell.on {
		box-shadow:
			0 0 0 2px var(--surface-base),
			0 0 0 4px var(--accent);
	}
	.cell:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
	.void {
		background: none;
	}
	.key {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-top: var(--s-5);
		font-size: var(--t-2xs);
		color: var(--text-muted);
		flex-wrap: wrap;
	}
	.key span.mono {
		margin-inline: var(--s-2);
	}
	.key i {
		width: 16px;
		height: 10px;
		border-radius: 2px;
	}
	.key i.s1 { background: var(--seq-1); }
	.key i.s2 { background: var(--seq-2); }
	.key i.s3 { background: var(--seq-3); }
	.key i.s4 { background: var(--seq-4); }
	.key i.s5 { background: var(--seq-5); }
	.key-diag {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		margin-inline-start: var(--s-5);
	}
	.diag-sw {
		background: var(--seq-2) linear-gradient(135deg, var(--border-strong) 0 4px, transparent 4px);
	}

	.pair {
		min-width: 0;
	}
	.pair-head {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		padding-bottom: var(--s-4);
		border-bottom: var(--rule);
	}
	.pair-sw {
		display: inline-flex;
		gap: 2px;
	}
	.pair-sw i {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: var(--c);
	}
	.pair-n {
		margin-inline-start: auto;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.mix {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3) var(--s-6);
		padding: var(--s-4) 0;
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	.mix-item {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
	}
	.mix b {
		color: var(--text-primary);
		font-weight: 600;
	}
	.ties {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ties li {
		display: flex;
		align-items: stretch;
		border-bottom: var(--rule);
	}
	.tie-row {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4) var(--s-2);
		background: none;
		border: none;
		text-align: start;
		cursor: pointer;
		color: inherit;
		min-height: var(--touch, 44px);
	}
	.tie-row:hover,
	.show:hover {
		background: var(--surface-hover);
	}
	.ends {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-primary);
		min-width: 0;
	}
	.end {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-bottom: 1.5px solid var(--c);
		padding-bottom: 1px;
	}
	.arrow {
		color: var(--text-faint);
		flex: none;
	}
	:global([dir='rtl']) .arrow {
		transform: scaleX(-1);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.show {
		flex: none;
		width: var(--touch, 44px);
		display: grid;
		place-items: center;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	:global([dir='rtl']) .show svg {
		transform: scaleX(-1);
	}
	.empty {
		color: var(--text-muted);
		font-size: var(--t-sm);
	}
</style>
