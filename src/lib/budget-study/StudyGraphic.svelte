<script lang="ts" module>
	let seq = 0;
</script>

<script lang="ts">
	/**
	 * The study in one glance: a fixed envelope holding systems drawn to one
	 * scale in dinars, a purse that takes a step from one system and gives it
	 * to another, and a hatched block for the money already spent.
	 *
	 * Geometry is computed from the draft values; the largest system sets the
	 * scale. In playable mode each system row is a button that moves one step
	 * (5% of that system's draft) into the purse, and back.
	 */
	let {
		labels,
		systems,
		locked,
		envelopeLabel,
		playable = false
	}: {
		labels: { draft: string; yours: string; locked: string; purse: string; systems: string; step: string };
		systems: { name: string; draft: number }[];
		locked: { name: string; draft: number }[];
		envelopeLabel: string;
		playable?: boolean;
	} = $props();

	const titleId = `study-graphic-title-${++seq}`;

	/* One step is a twentieth of a system's draft, as in the board. */
	const STEP_SHARE = 0.05;

	/* Layout in viewBox units. Geometry only; no data lives here. */
	const W = 540;
	const ENV_X = 20;
	const ENV_Y = 64;
	const ENV_W = 320;
	const BAR_X = 148;
	const BAR_MAX = 172;
	const NAME_X = BAR_X - 12;
	const BAR_H = 18;
	const BAR_GAP = 12;
	const BARS_TOP = ENV_Y + 52;
	const PURSE_X = 372;
	const PURSE_W = 132;
	const PURSE_H = 100;

	let moved = $state<Record<number, boolean>>({});

	const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

	const maxDraft = $derived(Math.max(1, ...systems.map((s) => s.draft)));
	const totalLocked = $derived(locked.reduce((sum, l) => sum + l.draft, 0));
	const purseMd = $derived(systems.reduce((sum, s, i) => sum + (moved[i] ? s.draft * STEP_SHARE : 0), 0));

	function barWidth(value: number): number {
		return (value / maxDraft) * BAR_MAX;
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
			draft: s.draft,
			current: currentOf(i),
			pressed: moved[i] === true,
			y: BARS_TOP + i * (BAR_H + BAR_GAP),
			draftW: barWidth(s.draft),
			curW: barWidth(currentOf(i))
		}))
	);

	const barsH = $derived(Math.max(systems.length, 1) * (BAR_H + BAR_GAP));
	const lockedY = $derived(BARS_TOP + barsH + 20);
	const envH = $derived(52 + barsH + 60);
	const viewH = $derived(ENV_Y + envH + 36);
	const purseY = $derived(ENV_Y + envH / 2 - PURSE_H / 2);
	const lockW = $derived(Math.min(BAR_MAX, barWidth(totalLocked)));

	const heroIndex = $derived(
		systems.length === 0 ? -1 : systems.reduce((best, s, i, all) => (s.draft > all[best].draft ? i : best), 0)
	);
</script>

<figure class="figure">
	<svg
		class="graphic"
		viewBox={`0 0 ${W} ${viewH}`}
		role="img"
		aria-labelledby={titleId}
		preserveAspectRatio="xMidYMid meet"
		style="direction: ltr"
	>
		<title id={titleId}>{labels.systems}</title>

		<defs>
			<marker
				id={`${titleId}-receive`}
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
			</marker>
			<marker
				id={`${titleId}-give`}
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
			</marker>
			<pattern
				id={`${titleId}-hatch`}
				width="8"
				height="8"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<line x1="0" y1="0" x2="0" y2="8" stroke="var(--rupture)" stroke-width="2" />
			</pattern>
		</defs>

		<!-- The fixed envelope. -->
		<rect
			class="envelope"
			x={ENV_X}
			y={ENV_Y}
			width={ENV_W}
			height={envH}
			rx="8"
			fill="var(--surface-raised)"
			stroke="var(--border-subtle)"
		/>
		<text class="envelope-label" x={ENV_X + 16} y={ENV_Y + 26}>{envelopeLabel}</text>

		<!-- Legend: filled is yours, outlined is the draft. -->
		<rect x={ENV_X + 176} y={ENV_Y + 17} width="10" height="10" rx="2" fill="var(--accent)" />
		<text class="legend" x={ENV_X + 192} y={ENV_Y + 26}>{labels.yours}</text>
		<rect
			x={ENV_X + 246}
			y={ENV_Y + 17}
			width="10"
			height="10"
			rx="2"
			fill="none"
			stroke="var(--border-subtle)"
		/>
		<text class="legend" x={ENV_X + 262} y={ENV_Y + 26}>{labels.draft}</text>

		{#each rows as row, i (i)}
			{#if playable}
				<g
					class="bar-row"
					role="button"
					tabindex="0"
					aria-pressed={row.pressed}
					aria-label={`${labels.step} ${row.name}`}
					onclick={() => toggle(i)}
					onkeydown={(event) => onKey(event, i)}
				>
					<rect class="hit-area" x={ENV_X + 8} y={row.y - 4} width={BAR_X + BAR_MAX - ENV_X - 4} height={BAR_H + 8} />
					<rect
						class="focus-ring"
						x={BAR_X - 4}
						y={row.y - 4}
						width={BAR_MAX + 8}
						height={BAR_H + 8}
						rx="5"
					/>
					<text class="system-name" x={NAME_X} y={row.y + BAR_H - 4}>{row.name}</text>
					<rect
						class="bar-track"
						x={BAR_X}
						y={row.y}
						width={row.draftW}
						height={BAR_H}
						rx="3"
						fill="none"
						stroke="var(--border-subtle)"
					/>
					<rect
						class="bar-fill"
						x={BAR_X}
						y={row.y}
						width={row.curW}
						height={BAR_H}
						rx="3"
						fill="var(--accent)"
						style:width={`${row.curW}px`}
					/>
				</g>
			{:else}
				<g class="bar-row static">
					<text class="system-name" x={NAME_X} y={row.y + BAR_H - 4}>{row.name}</text>
					<rect
						class="bar-track"
						x={BAR_X}
						y={row.y}
						width={row.draftW}
						height={BAR_H}
						rx="3"
						fill="none"
						stroke="var(--border-subtle)"
					/>
					<rect class="bar-fill" x={BAR_X} y={row.y} width={row.curW} height={BAR_H} rx="3" fill="var(--accent)" />
				</g>
			{/if}
		{/each}

		<!-- Already spent, hatched in the warning colour. -->
		<text class="locked-label" x={BAR_X} y={lockedY - 8}>{`${labels.locked} ${fmt(totalLocked)}`}</text>
		<rect
			class="locked-block"
			x={BAR_X}
			y={lockedY}
			width={lockW}
			height={BAR_H}
			rx="3"
			fill={`url(#${titleId}-hatch)`}
			stroke="var(--rupture)"
		/>

		<!-- The purse, and the two flows it carries. -->
		{#if systems.length > 0}
			<path
				class="flow receive"
				d={`M ${BAR_X + rows[heroIndex].draftW + 6} ${rows[heroIndex].y + BAR_H / 2} C ${BAR_X + rows[heroIndex].draftW + 34} ${rows[heroIndex].y + BAR_H / 2} ${PURSE_X - 34} ${purseY + 24} ${PURSE_X - 2} ${purseY + 30}`}
				fill="none"
				stroke="var(--accent)"
				stroke-width="2"
				marker-end={`url(#${titleId}-receive)`}
			/>
			<path
				class="flow give"
				d={`M ${PURSE_X - 2} ${purseY + PURSE_H - 26} C ${PURSE_X - 26} ${purseY + PURSE_H - 12} ${ENV_X + ENV_W + 30} ${purseY + PURSE_H - 26} ${ENV_X + ENV_W + 2} ${purseY + PURSE_H - 26}`}
				fill="none"
				stroke="var(--text-muted)"
				stroke-width="2"
				stroke-dasharray="5 4"
				marker-end={`url(#${titleId}-give)`}
			/>
		{/if}

		<path
			class="purse-handle"
			d={`M ${PURSE_X + 34} ${purseY + 3} Q ${PURSE_X + PURSE_W / 2} ${purseY - 32} ${PURSE_X + PURSE_W - 34} ${purseY + 3}`}
			fill="none"
			stroke="var(--accent)"
			stroke-width="4"
			stroke-linecap="round"
		/>
		<rect
			class="purse-body"
			x={PURSE_X}
			y={purseY}
			width={PURSE_W}
			height={PURSE_H}
			rx="12"
			fill="var(--surface-raised)"
			stroke="var(--border-subtle)"
		/>
		<text class="purse-label" x={PURSE_X + PURSE_W / 2} y={purseY + 36}>{labels.purse}</text>
		<text class="purse-amount" x={PURSE_X + PURSE_W / 2} y={purseY + 68}>{fmt(purseMd)}</text>
	</svg>

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
	.figure {
		margin: 0;
	}

	.graphic {
		display: block;
		inline-size: 100%;
		block-size: auto;
		font-family: var(--font-mono);
	}

	.envelope-label {
		fill: var(--text-muted);
		font-size: 14px;
		letter-spacing: 0.02em;
	}

	.legend {
		fill: var(--text-muted);
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.system-name {
		fill: var(--text-muted);
		font-size: 13px;
		text-anchor: end;
	}

	.bar-fill {
		transition: width var(--dur-normal) var(--ease-out);
	}

	.hit-area {
		fill: none;
		pointer-events: all;
	}

	.focus-ring {
		fill: none;
		stroke: var(--accent);
		stroke-width: 0;
		pointer-events: none;
	}

	.bar-row {
		outline: none;
		cursor: pointer;
	}

	.bar-row:focus-visible .focus-ring {
		stroke-width: 2;
	}

	.bar-row.static {
		cursor: default;
	}

	.locked-label {
		fill: var(--rupture);
		font-size: 12px;
		letter-spacing: 0.02em;
	}

	.purse-label {
		fill: var(--text-muted);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-anchor: middle;
		text-transform: uppercase;
	}

	.purse-amount {
		fill: var(--accent);
		font-size: 22px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-anchor: middle;
	}

	.hint {
		margin-block-start: var(--s-3);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
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
		.bar-fill {
			transition: none;
		}
	}

	/* The viewBox scales with the figure, so small screens need larger
	   user units to keep the labels legible. */
	@media (max-width: 480px) {
		.envelope-label {
			font-size: 15px;
		}

		.legend {
			font-size: 12.5px;
		}

		.system-name {
			font-size: 15px;
		}

		.locked-label {
			font-size: 13px;
		}

		.purse-label {
			font-size: 12px;
		}
	}
</style>
