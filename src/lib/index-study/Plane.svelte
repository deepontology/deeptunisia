<script lang="ts">
	import { t, tf } from '$lib/t.svelte';

	/**
	 * Trust against grip: every respondent as a point, drawn as a 10×10 density.
	 *
	 * Sequential encoding, one hue: a cell's opacity says how many respondents
	 * sit there, nothing else. Opacity over the panel rather than a mix with the
	 * surface colour, so the ramp stays one hue on a warm or a cold theme. The
	 * four quadrants are named in text at the corners, so the reading never
	 * depends on colour. Police state is top left (low trust, high grip);
	 * guardian is bottom right. The plot stays left to right in every locale
	 * because its axes are numeric scales, not text; the labels are inside the
	 * drawing so they cannot drift away from the axis they name.
	 *
	 * The table under the chart carries every non-empty cell.
	 */
	let { grid }: { grid: number[][] | null } = $props();

	const max = $derived(grid ? Math.max(1, ...grid.flat()) : 1);
	const cells = $derived(
		grid ? grid.flatMap((col, x) => col.map((n, y) => ({ x, y, n }))).filter((c) => c.n > 0) : []
	);
	const range = (i: number) => `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`;
</script>

<div class="plane-wrap">
	<svg class="plane" viewBox="-9 -2 111 113" role="img" aria-label={t('index.plane.aria')} style="direction: ltr">
		<rect x="0" y="0" width="100" height="100" class="ground" />
		<line x1="50" y1="0" x2="50" y2="100" class="mid" />
		<line x1="0" y1="50" x2="100" y2="50" class="mid" />
		{#each cells as c (`${c.x}:${c.y}`)}
			<rect
				x={c.x * 10 + 0.5}
				y={(9 - c.y) * 10 + 0.5}
				width="9"
				height="9"
				rx="0.8"
				class="cell"
				fill-opacity={0.12 + (c.n / max) * 0.88}
			>
				<title>{tf('index.plane.cell', { n: c.n, t: range(c.x), g: range(c.y) })}</title>
			</rect>
		{/each}
		<text x="2" y="5" class="q">{t('index.quadrant.policeState')}</text>
		<text x="98" y="5" class="q" text-anchor="end">{t('index.quadrant.strongState')}</text>
		<text x="2" y="97.5" class="q">{t('index.quadrant.absent')}</text>
		<text x="98" y="97.5" class="q" text-anchor="end">{t('index.quadrant.guardian')}</text>

		<!-- Axes: 0 and 1 at the ends, the name along the side it measures. -->
		<text x="0" y="105" class="tick">0</text>
		<text x="100" y="105" class="tick" text-anchor="end">1</text>
		<text x="50" y="108.5" class="axis" text-anchor="middle">{t('index.plane.xAxis')} →</text>
		<text x="-2" y="100" class="tick" text-anchor="end">0</text>
		<text x="-2" y="3" class="tick" text-anchor="end">1</text>
		<text class="axis" text-anchor="middle" transform="translate(-5 50) rotate(-90)">{t('index.plane.yAxis')} →</text>
	</svg>
	{#if !grid || cells.length === 0}
		<p class="empty">{t('index.plane.empty')}</p>
	{/if}
</div>
{#if cells.length}
	<details class="table-alt">
		<summary>{t('index.table.show')}</summary>
		<table>
			<thead>
				<tr><th>{t('index.plane.xAxis')}</th><th>{t('index.plane.yAxis')}</th><th>{t('index.table.count')}</th></tr>
			</thead>
			<tbody>
				{#each cells as c (`${c.x}:${c.y}`)}
					<tr><td class="mono">{range(c.x)}</td><td class="mono">{range(c.y)}</td><td class="mono">{c.n}</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
{/if}

<style>
	/* The wide panel from the reference: the plot sits centred in a well that
	   spans the column, the way the photograph spans the card. */
	.plane-wrap {
		position: relative;
		background: var(--surface-sunken);
		padding: 1.2rem 1rem 0.8rem;
	}
	.plane {
		display: block;
		width: 100%;
		height: auto;
		max-height: 31rem;
	}
	.ground {
		fill: none;
		stroke: var(--border-default);
		stroke-width: 0.3;
	}
	.mid {
		stroke: var(--border-default);
		stroke-width: 0.25;
		stroke-dasharray: 1 1;
	}
	.cell {
		fill: var(--index-band-5);
	}
	.q {
		font-size: 2.5px;
		letter-spacing: 0.3px;
		text-transform: uppercase;
		fill: var(--text-secondary);
	}
	.tick {
		font-size: 2.4px;
		fill: var(--text-faint);
		font-family: var(--font-mono);
	}
	.axis {
		font-size: 2.6px;
		letter-spacing: 0.3px;
		text-transform: uppercase;
		fill: var(--text-secondary);
	}
	.empty {
		position: absolute;
		inset: 45% 0 auto;
		text-align: center;
		color: var(--text-faint);
		font-size: 0.86rem;
	}
	.table-alt {
		margin-top: 0.4rem;
		font-size: 0.82rem;
	}
	.table-alt summary {
		cursor: pointer;
		color: var(--text-secondary);
	}
	table {
		border-collapse: collapse;
	}
	th,
	td {
		text-align: start;
		padding: 0.2rem 0.9rem 0.2rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}
</style>
