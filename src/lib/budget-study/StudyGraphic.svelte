<script lang="ts">
	/**
	 * The study in one glance, as a ledger: one line per system, each carrying
	 * the 2027 plan and the citizen's allocation on the same scale in dinars,
	 * the purse above the lines, and the money already spent below them.
	 *
	 * In playable mode each line moves one step (5% of that line's draft) into
	 * the purse, and back. Money is the only thing that moves; the bars carry
	 * the motion and the value beside each name carries the number.
	 */
	let {
		labels,
		systems,
		locked,
		envelopeLabel,
		playable = false,
		compact = false
	}: {
		labels: { draft: string; yours: string; locked: string; purse: string; systems: string; step: string };
		systems: { name: string; draft: number }[];
		locked: { name: string; draft: number }[];
		envelopeLabel: string;
		playable?: boolean;
		compact?: boolean;
	} = $props();

	/* One step is a twentieth of a system's draft, as in the board. */
	const STEP_SHARE = 0.05;

	let moved = $state<Record<number, boolean>>({});

	const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

	const maxDraft = $derived(Math.max(1, ...systems.map((s) => s.draft)));
	const totalLocked = $derived(locked.reduce((sum, l) => sum + l.draft, 0));
	const purseMd = $derived(systems.reduce((sum, s, i) => sum + (moved[i] ? s.draft * STEP_SHARE : 0), 0));

	/** Every line is drawn against the largest draft, so the scale never moves. */
	function barShare(value: number): string {
		return `${(value / maxDraft) * 100}%`;
	}

	function currentOf(i: number): number {
		return systems[i].draft - (moved[i] ? systems[i].draft * STEP_SHARE : 0);
	}

	function toggle(i: number) {
		moved = { ...moved, [i]: !moved[i] };
	}

	function onKey(event: KeyboardEvent, i: number) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggle(i);
		}
	}

	const rows = $derived(
		systems.map((s, i) => ({
			name: s.name,
			current: currentOf(i),
			pressed: moved[i] === true,
			planShare: barShare(s.draft),
			yoursShare: barShare(currentOf(i))
		}))
	);

	const lockShare = $derived(barShare(totalLocked));
</script>

<figure class="graphic" class:compact>
	<!-- Legend in one line above the board, purse set off at its end. -->
	<div class="head">
		<p class="legend">
			<span class="key">
				<span class="swatch plan" aria-hidden="true"></span>
				{labels.draft}
			</span>
			<span class="key">
				<span class="swatch yours" aria-hidden="true"></span>
				{labels.yours}
			</span>
		</p>
		<p class="purse">
			<span class="purse-label">{labels.purse}</span>
			<span class="purse-value">{fmt(purseMd)}</span>
		</p>
	</div>

	<div class="board" role="group" aria-label={envelopeLabel}>
		<p class="board-label">{envelopeLabel}</p>

		<div class="rows">
			{#each rows as row, i (i)}
				{#if playable}
					<div
						class="row"
						role="button"
						tabindex="0"
						aria-pressed={row.pressed}
						aria-label={`${labels.step} ${row.name}`}
						onclick={() => toggle(i)}
						onkeydown={(event) => onKey(event, i)}
					>
						<span class="row-head">
							<span class="row-name">{row.name}</span>
							<span class="row-value" dir="ltr">{fmt(row.current)}</span>
						</span>
						<span class="bars">
							<span class="bar plan" style:inline-size={row.planShare}></span>
							<span class="bar yours" style:inline-size={row.yoursShare}></span>
						</span>
					</div>
				{:else}
					<div class="row static">
						<span class="row-head">
							<span class="row-name">{row.name}</span>
							<span class="row-value" dir="ltr">{fmt(row.current)}</span>
						</span>
						<span class="bars">
							<span class="bar plan" style:inline-size={row.planShare}></span>
							<span class="bar yours" style:inline-size={row.yoursShare}></span>
						</span>
					</div>
				{/if}
			{/each}
		</div>

		<!-- Already spent, hatched in the warning colour. -->
		<div class="locked">
			<span class="row-head">
				<span class="row-name">{labels.locked}</span>
				<span class="row-value" dir="ltr">{fmt(totalLocked)}</span>
			</span>
			<span class="bars">
				<span class="bar lock" style:inline-size={lockShare}></span>
			</span>
		</div>
	</div>

	{#if playable}
		<figcaption class="hint">{labels.step}</figcaption>
	{/if}

	<table class="sr-only">
		<caption>{labels.systems}</caption>
		<thead>
			<tr>
				<th scope="col">{labels.systems}</th>
				<th scope="col" class="num">{labels.draft}</th>
				<th scope="col" class="num">{labels.yours}</th>
			</tr>
		</thead>
		<tbody>
			{#each systems as s, i (i)}
				<tr>
					<th scope="row">{s.name}</th>
					<td class="num">{fmt(s.draft)}</td>
					<td class="num">{fmt(currentOf(i))}</td>
				</tr>
			{/each}
			{#each locked as l, i (i)}
				<tr class="locked-row">
					<th scope="row">{l.name}</th>
					<td class="num">{fmt(l.draft)}</td>
					<td class="num">{fmt(l.draft)}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr>
				<th scope="row">{labels.purse}</th>
				<td></td>
				<td class="num">{fmt(purseMd)}</td>
			</tr>
		</tfoot>
	</table>
</figure>

<style>
	.graphic {
		display: block;
		margin: 0;
		inline-size: 100%;
	}

	/* Desktop: the graphic is the study's own instrument, so it fills the
	   reading measure rather than the narrower column the section hands it. */
	@media (min-width: 48rem) {
		.graphic {
			--graphic-w: min(calc(100cqw - 2 * var(--s-6)), var(--measure));
			inline-size: var(--graphic-w);
			margin-inline-start: calc((100% - var(--graphic-w)) / 2);
		}
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3) var(--s-5);
		margin-block-end: var(--s-4);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-5);
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.key {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}

	.swatch {
		display: block;
		inline-size: var(--s-4);
		block-size: var(--s-3);
		border-radius: var(--r-xs);
	}

	.swatch.plan {
		background: var(--text-muted);
	}

	.swatch.yours {
		background: var(--accent);
	}

	/* The purse: one clear block, set off by a single accent rule. */
	.purse {
		display: grid;
		gap: var(--s-1);
		margin: 0;
		padding-block: var(--s-2) var(--s-3);
		padding-inline: var(--s-4);
		border: var(--rule);
		border-inline-start: var(--s-1) solid var(--accent);
		border-radius: var(--r-sm);
		background: var(--surface-raised);
	}

	.purse-label {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.purse-value {
		font-family: var(--font-mono);
		font-size: var(--t-2xl);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
		color: var(--text-primary);
	}

	.board {
		padding: var(--s-4) var(--s-4) var(--s-5);
		border: var(--rule);
		border-radius: var(--r-md);
		background: var(--surface-raised);
	}

	.board-label {
		margin: 0 0 var(--s-4);
		padding-block-end: var(--s-3);
		border-block-end: var(--rule);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: grid;
		gap: var(--s-2);
		padding-block: var(--s-3);
		border-radius: var(--r-xs);
	}

	.row + .row {
		border-block-start: var(--rule);
	}

	.compact .row {
		padding-block: var(--s-2);
	}

	.row:not(.static) {
		cursor: pointer;
		outline: none;
	}

	.row:not(.static):hover {
		background: var(--surface-hover);
	}

	.row:focus-visible {
		outline: var(--s-1) solid var(--accent);
		outline-offset: var(--s-1);
	}

	.row-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-2);
		min-inline-size: 0;
	}

	/* The name is reading text, so it takes the body face; the number beside it
	   is an instrument reading and takes the mono face. */
	.row-name {
		flex: 1 1 auto;
		min-inline-size: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-family: var(--font-sans);
		font-size: var(--t-sm);
		letter-spacing: var(--track-tight);
		line-height: var(--lh-tight);
		color: var(--text-primary);
	}

	/* At the reading measure there is room for the name to set a size larger
	   and for the card to breathe. */
	@media (min-width: 48rem) {
		.board {
			padding: var(--s-4) var(--s-5) var(--s-5);
		}

		.row-name {
			font-size: var(--t-md);
		}
	}

	.row-value {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
		line-height: var(--lh-tight);
		color: var(--text-secondary);
	}

	.bars {
		display: grid;
		gap: var(--s-1);
	}

	.bar {
		display: block;
		block-size: var(--s-4);
		border-radius: var(--r-full);
	}

	.bar.plan {
		background: var(--text-muted);
	}

	.bar.yours {
		background: var(--accent);
		transition: inline-size var(--dur-normal) var(--ease-out);
	}

	.locked {
		display: grid;
		gap: var(--s-2);
		margin-block-start: var(--s-5);
		padding-block: var(--s-4) var(--s-1);
		border-block-start: var(--rule);
	}

	.locked .row-name {
		color: var(--text-muted);
	}

	.bar.lock {
		background: repeating-linear-gradient(
			45deg,
			var(--rupture) 0 var(--s-1),
			transparent var(--s-1) var(--s-3)
		);
	}

	.hint {
		margin-block-start: var(--s-3);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	.num {
		font-variant-numeric: tabular-nums;
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
		.bar.yours {
			transition: none;
		}
	}
</style>
