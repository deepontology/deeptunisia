<script lang="ts">
	import { t, describeInterval, confidenceLabel, basisLabel } from '$lib/t.svelte';
	import { BASIS_COLOR, BASIS_OPACITY, FLOOR, CUTOFF, type Person } from '$lib/model';
	import Chip from '$lib/ui/Chip.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	/**
	 * The entity card's life ribbon.
	 *
	 * What this block owes the reader, in order: the ARC in three seconds
	 * (when active, how thick the record), a coverage inventory (kinds and
	 * counts — education and declarations appear nowhere else on the card),
	 * epistemic texture at mark scale, and honesty about the undated. It is
	 * an orientation widget; analysis lives in the Chronicle.
	 *
	 * Three rules the previous lane-per-kind mini-Gantt broke, now structural:
	 *
	 * 1. ONE axis, not five lanes. Five near-empty strips read as broken UI;
	 *    the arc is one object.
	 * 2. NEVER draw an unknown as a span. The interval resolver represents
	 *    "?" as the full FLOOR-CUTOFF envelope; drawing that envelope asserts
	 *    a 70-year span that no source states. Undated items therefore get no
	 *    geometry at all — they are counted, in words, in the caption, and
	 *    listed with a "?" in the list view.
	 * 3. Small visible marks, large invisible targets. Every mark carries a
	 *    padded hit twin (+12px each side, full ribbon height) so a 4px
	 *    tenure is still a 44px-class touch target.
	 *
	 * Kind is encoded by SHAPE (bar = tenure-like, dot = point-like), never by
	 * colour — the layer hues are data elsewhere and must not be borrowed as
	 * decoration here. Basis is encoded by fill: solid for documented, a quiet
	 * hatch for everything weaker (DESIGN.md: uncertainty renders as hatch).
	 * The dated list below the ribbon is the section's table alternative.
	 */

	type TlItem = NonNullable<Person['timeline']>[number];

	let { items }: { items: TlItem[] } = $props();

	let selected = $state<TlItem | null>(null);

	/* The card can switch entities while this component stays mounted (the
	   {#if timeline.length} around it stays true), so a selection from the
	   previous record must never render here: honour the selection only
	   while it is one of the CURRENT card's items. Derived, not an effect -
	   no ordering, no stale write, and a dataset reload is covered too. */
	const current = $derived.by(() => {
		if (selected === null) return null;
		const sel = selected;
		// Compare by ref, not identity: props and state each arrive wrapped in
		// their own reactive proxy, so includes() can miss on identity.
		return items.some((it) => it.ref.kind === sel.ref.kind && it.ref.id === sel.ref.id)
			? sel
			: null;
	});

	const ENVELOPE = CUTOFF - FLOOR;

	/** An item the record cannot place in time: its (clamped) interval covers
	 *  essentially the whole window — the resolver's shape for "?". */
	function isUndated(it: TlItem): boolean {
		const s = Math.max(FLOOR, it.interval.startEarliest);
		const e = Math.min(it.interval.endLatest ?? CUTOFF, CUTOFF);
		return (e - s) / ENVELOPE >= 0.98;
	}

	const isPoint = (it: TlItem) => it.interval.endEarliest === null && it.interval.endLatest === null;
	/** Below ~6 months a bar carries no readable duration at 4px/year - it is
	   a stub pretending to be a span. A one-day event and a five-month post
	   both read as a moment: render them as dots. (The tooltip, the detail
	   line and the list carry the exact dates either way.) */
	const SIX_MONTHS = 1000 * 60 * 60 * 24 * 182;
	const isMoment = (it: TlItem) => {
		if (isPoint(it)) return true;
		const spanMs = ((x1(it) - x0(it)) / 100) * ENVELOPE;
		return spanMs < SIX_MONTHS;
	};

	function x0(it: TlItem): number {
		return Math.max(0, Math.min(100, ((it.interval.startEarliest - FLOOR) / ENVELOPE) * 100));
	}
	function x1(it: TlItem): number {
		return Math.max(0, Math.min(100, (((it.interval.endLatest ?? CUTOFF) - FLOOR) / ENVELOPE) * 100));
	}
	const pct = (v: number) => `${v.toFixed(2)}%`;

	const dated = $derived(items.filter((it) => !isUndated(it)));
	const undatedCount = $derived(items.length - dated.length);

	/** Tenure-like spans, placed on one of two rows (greedy, by overlap). */
	const bars = $derived.by(() => {
		const sorted = dated
			.filter((it) => !isMoment(it))
			.sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);
		const rowEnds = [-Infinity, -Infinity];
		return sorted.map((it) => {
			let r = rowEnds.findIndex((end) => end <= it.interval.startEarliest);
			// Both rows busy: take the least-loaded one, so a dense life spreads
			// across two treads instead of stacking every overlap onto row 0.
			if (r === -1) r = rowEnds[0] <= rowEnds[1] ? 0 : 1;
			rowEnds[r] = Math.max(rowEnds[r], it.interval.endLatest ?? CUTOFF);
			return { it, row: r as 0 | 1 };
		});
	});

	/** Hit order: widest span first, so where hit twins overlap the pointer
	   lands on the narrowest, most specific mark - the network's
	   hits-under-nodes rule, along the time axis. */
	const hitOrder = $derived(
		[...bars].sort((a, b) => x1(b.it) - x0(b.it) - (x1(a.it) - x0(a.it)))
	);

	/** Moment-like dated items - events, declarations, short posts - as dots on the axis. */
	const dots = $derived(dated.filter((it) => isMoment(it)));

	/** Decade ticks: the anchor that makes a mark mean "when". */
	const ticks = $derived.by(() => {
		const out: number[] = [];
		const y0 = Math.ceil(new Date(FLOOR).getUTCFullYear() / 10) * 10;
		const y1 = new Date(CUTOFF).getUTCFullYear();
		for (let y = y0; y <= y1; y += 10) {
			const ms = Date.UTC(y, 0, 1);
			if (ms > FLOOR && ms < CUTOFF) out.push(((ms - FLOOR) / ENVELOPE) * 100);
		}
		return out;
	});

	const yearOf = (ms: number) => String(new Date(ms).getUTCFullYear());
	function listDate(it: TlItem): string {
		const s = yearOf(it.interval.startEarliest);
		if (isPoint(it)) return s;
		return it.interval.endLatest ? `${s}\u2013${yearOf(it.interval.endLatest)}` : `${s}\u2192`;
	}

	const KINDS = [
		'position',
		'relationship',
		'event',
		'education',
		'contract',
		'licence',
		'declaration'
	] as const;

	/** Caption: one chip per kind present, plus the undated count. */
	const caption = $derived(
		KINDS.map((k) => {
			const all = items.filter((it) => it.kind === k);
			return all.length ? { kind: k, count: all.length } : null;
		}).filter((c): c is { kind: (typeof KINDS)[number]; count: number } => c !== null)
	);

	/** The list alternative, grouped by kind. */
	const groups = $derived(
		KINDS.map((k) => ({ kind: k, items: items.filter((it) => it.kind === k) })).filter(
			(g) => g.items.length
		)
	);

	const pick = (it: TlItem) => (selected = it);
</script>

<div class="etl">
	<div class="ribbon" role="group" aria-label={t('panel.timeline')}>
		{#each ticks as tx (tx)}
			<i class="tick" style:left={pct(tx)} aria-hidden="true"></i>
		{/each}

		{#each hitOrder as b (b.it.ref.kind + b.it.ref.id)}
			<div class="hitbox" style:left={`calc(${pct(x0(b.it))} - 12px)`} style:width={`calc(${pct(x1(b.it) - x0(b.it))} + 24px)`}>
				<Tooltip content={b.it.title}>
					<button class="hit" aria-label={b.it.title} onclick={() => pick(b.it)}></button>
				</Tooltip>
			</div>
		{/each}
		{#each dots as d (d.ref.kind + d.ref.id)}
			<div class="hitbox dotbox" style:left={`calc(${pct(x0(d))} - 14px)`}>
				<Tooltip content={d.title}>
					<button class="hit" aria-label={d.title} onclick={() => pick(d)}></button>
				</Tooltip>
			</div>
		{/each}

		{#each bars as b (b.it.ref.kind + b.it.ref.id)}
			<i
				class="mark bar"
				class:hatch={b.it.basis !== 'documented'}
				class:r1={b.row === 1}
				class:sel={current === b.it}
				style:left={pct(x0(b.it))}
				style:width={pct(Math.max(0.4, x1(b.it) - x0(b.it)))}
				style:opacity={BASIS_OPACITY[b.it.basis]}
				aria-hidden="true"
			></i>
		{/each}
		{#each dots as d (d.ref.kind + d.ref.id)}
			<i
				class="mark dot"
				class:sel={current === d}
				style:left={pct(x0(d))}
				style:opacity={BASIS_OPACITY[d.basis]}
				aria-hidden="true"
			></i>
		{/each}
	</div>

	<div class="axis" dir="ltr" aria-hidden="true">
		<span>{yearOf(FLOOR)}</span>
		<span>{yearOf(CUTOFF)}</span>
	</div>

	<p class="caption">
		{#each caption as c (c.kind)}
			<span class="kc"><b>{c.count}</b> {t(`timeline.lane.${c.kind}`)}</span>
		{/each}
		{#if undatedCount}
			<span class="kc undated"><b>{undatedCount}</b> {t('timeline.undated')}</span>
		{/if}
	</p>

	{#if current}
		<div class="detail">
			<strong dir="auto">{current.title}</strong>
			<Chip variant="outline">{confidenceLabel(current.confidence)}</Chip>
			<Chip tint={BASIS_COLOR[current.basis] as string} dot>{basisLabel(current.basis)}</Chip>
			{#if current.disputed}
				<span class="contested">{t('timeline.contested')}</span>
			{/if}
			<span class="dates mono">{describeInterval(current.interval)}</span>
		</div>
	{/if}

	<details class="list">
		<summary>{t('timeline.viewlist')} <span class="cnt mono">{items.length}</span></summary>
		{#each groups as g (g.kind)}
			<h4>{t(`timeline.lane.${g.kind}`)}</h4>
			<ul>
				{#each g.items as it (it.ref.kind + it.ref.id)}
					<li>
						<button class="row" class:sel={current === it} onclick={() => pick(it)}>
							<span class="d mono">{isUndated(it) ? '?' : listDate(it)}</span>
							<span class="ttl" dir="auto">{it.title}</span>
							<i class="bdot" style:--c={BASIS_COLOR[it.basis] as string} aria-hidden="true"></i>
						</button>
					</li>
				{/each}
			</ul>
		{/each}
	</details>
</div>

<style>
	.etl {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		margin-top: var(--s-2);
	}

	/* --- the ribbon: one axis, marks, fat hit twins --- */

	.ribbon {
		position: relative;
		height: 32px;
		border-bottom: 1px solid var(--border-default);
	}
	.tick {
		position: absolute;
		bottom: 0;
		width: 1px;
		height: 5px;
		background: var(--border-default);
		pointer-events: none;
	}

	/* The invisible fat twin: +12px each side, full ribbon height. A 4px
	   tenure becomes a 44px-class target; the visible mark stays honest. */
	.hitbox {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	.hitbox.dotbox {
		top: auto;
		bottom: -14px;
		height: 28px;
		width: 28px;
	}
	/* The Tooltip wraps its trigger in a span - stretch it, or the button
	   inside collapses to 0x0 and the fat twin is fat but dead. */
	.hitbox :global(.tt-anchor) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.hit {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
	}
	.hit:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	/* Visible marks. Bars sit on the axis; dots straddle it. */
	.mark {
		position: absolute;
		pointer-events: none;
		border-radius: 2px 2px 0 0;
		background: var(--text-primary);
	}
	.mark.bar {
		bottom: 3px;
		height: 8px;
		min-width: 8px;
	}
	.mark.bar.r1 {
		bottom: 13px;
	}
	.mark.dot {
		bottom: -4px;
		width: 8px;
		height: 8px;
		min-width: 8px;
		border-radius: 50%;
		transform: translateX(-50%);
		/* a halo in the panel colour lifts the dot off the axis line */
		box-shadow: 0 0 0 2px var(--surface-panel);
	}
	.mark.hatch {
		background: repeating-linear-gradient(
			-45deg,
			color-mix(in oklch, var(--text-secondary) 70%, transparent) 0 2px,
			transparent 2px 4.5px
		);
	}
	.mark.sel {
		box-shadow:
			0 0 0 2px var(--surface-panel),
			0 0 0 3.5px var(--accent);
	}

	/* --- domain ends --- */

	.axis {
		display: flex;
		justify-content: space-between;
		margin-top: 2px;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	/* --- coverage caption --- */

	.caption {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1) var(--s-4);
		margin: 0;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.kc b {
		font-weight: 560;
		color: var(--text-secondary);
	}
	.kc.undated {
		border-bottom: 1px dashed var(--border-strong);
		/* the provisional mark, in words */
	}

	/* --- the selected item --- */

	.detail {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2) var(--s-3);
		padding: var(--s-2) 0 0;
		font-size: var(--t-sm);
	}
	.detail strong {
		font-weight: 500;
	}
	.contested {
		font-size: var(--t-2xs);
		font-weight: 600;
		color: var(--basis-inferred);
	}
	.dates {
		font-size: var(--t-2xs);
		color: var(--text-secondary);
	}

	/* --- the list alternative (also the table-equivalent for SR) --- */

	.list {
		font-size: var(--t-sm);
	}
	.list summary {
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
	}
	.list summary:hover {
		color: var(--text-primary);
	}
	.list .cnt {
		color: var(--text-faint);
	}
	.list h4 {
		margin: var(--s-3) 0 var(--s-1);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 400;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.list ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.row {
		display: grid;
		grid-template-columns: 9ch 1fr auto;
		align-items: baseline;
		gap: var(--s-3);
		width: 100%;
		padding: var(--s-1) var(--s-2);
		border-radius: var(--r-sm);
		text-align: start;
		font-size: var(--t-sm);
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.sel {
		background: var(--surface-active);
	}
	.row .d {
		color: var(--text-faint);
		font-size: var(--t-2xs);
		white-space: nowrap;
	}
	.row .ttl {
		color: var(--text-secondary);
		line-height: var(--lh-snug);
	}
	.row:hover .ttl,
	.row.sel .ttl {
		color: var(--text-primary);
	}
	.bdot {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--c, var(--text-muted));
		align-self: center;
	}
</style>
