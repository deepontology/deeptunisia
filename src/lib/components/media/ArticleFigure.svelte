<script lang="ts">
	import type { Snippet } from 'svelte';
	import ClaimIndicator from './ClaimIndicator.svelte';
	import type { Claim, ContentInline, Figure, TenureBar } from '$lib/media/types';

	/**
	 * ArticleFigure — evidence drawn as a picture, with the same standing as
	 * the prose: every bar and every cell points at the ledger through claim
	 * chips, and the tenure chart carries its own table so the data does not
	 * live only in colour and position.
	 *
	 * Two kinds. `tenure`: horizontal lanes of dated holders on one shared time
	 * axis. `compare`: a table that sets two eras side by side.
	 */
	interface Props {
		figure: Figure;
		findClaim: (id: string) => Claim | undefined;
		expandedClaim: string | null;
		toggleClaim: (id: string) => void;
		/** Renders one inline node (claim chips, entity mentions, links) the way the prose does. */
		inline: Snippet<[ContentInline]>;
	}

	let { figure, findClaim, expandedClaim, toggleClaim, inline }: Props = $props();

	const ms = (iso: string) => Date.parse(iso.length === 4 ? `${iso}-01-01` : iso.length === 7 ? `${iso}-01` : iso);
	const fmt = (iso: string | null) =>
		iso
			? new Date(ms(iso)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', day: iso.length > 7 ? 'numeric' : undefined })
			: 'in post at last check';

	const tenure = $derived(figure.kind === 'tenure' ? figure : null);
	const t0 = $derived(tenure ? ms(tenure.domain[0]) : 0);
	const t1 = $derived(tenure ? ms(tenure.domain[1]) : 1);
	const pct = (t: number) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));

	function geom(b: TenureBar) {
		const left = pct(ms(b.start));
		const right = pct(b.end ? ms(b.end) : t1);
		return { left, width: Math.max(right - left, 0.7) };
	}

	const years = $derived.by(() => {
		if (!tenure) return [] as number[];
		const y0 = new Date(t0).getUTCFullYear();
		const y1 = new Date(t1).getUTCFullYear();
		const out: number[] = [];
		for (let y = y0 + 1; y <= y1; y++) out.push(y);
		return out;
	});

	const figureClaims = $derived.by(() => {
		if (!tenure) return [] as string[];
		const set: string[] = [];
		for (const l of tenure.lanes) for (const b of l.bars) for (const c of b.claims) if (!set.includes(c)) set.push(c);
		return set;
	});
</script>

<figure class="fig" data-figure={figure.id}>
	<figcaption class="head">
		<span class="title">{figure.title}</span>
	</figcaption>

	{#if tenure}
		<div class="chart" role="img" aria-label={`${tenure.title}. The same data is in the table below.`}>
			<div class="axis" aria-hidden="true">
				{#each years as y (y)}
					<span class="tick" style:left={`${pct(Date.UTC(y, 0, 1))}%`}>{y}</span>
				{/each}
			</div>
			{#each tenure.lanes as lane, li (li)}
				<div class="lane">
					<div class="lane-label">{lane.label}</div>
					<div class="track" aria-hidden="true">
						{#each years as y (y)}
							<span class="gridline" style:left={`${pct(Date.UTC(y, 0, 1))}%`}></span>
						{/each}
						{#each lane.bars as bar, bi (bi)}
							{@const g = geom(bar)}
							<span
								class="bar"
								class:alt={bi % 2 === 1}
								class:open={!bar.end}
								class:weak={bar.weak}
								style:left={`${g.left}%`}
								style:width={`${g.width}%`}
								title={`${bar.holder}, ${fmt(bar.start)} to ${fmt(bar.end)}`}
							>
								{#if g.width > 9}<span class="bar-name">{bar.holder}</span>{/if}
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		<details class="data">
			<summary>The same data as a table</summary>
			<div class="table-scroll">
				<table>
					<thead>
						<tr><th scope="col">Post</th><th scope="col">Holder</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Evidence</th></tr>
					</thead>
					<tbody>
						{#each tenure.lanes as lane (lane.label)}
							{#each lane.bars as bar, bi (bi)}
								<tr>
									{#if bi === 0}<th scope="row" rowspan={lane.bars.length}>{lane.label}</th>{/if}
									<td>{bar.holder}{bar.weak ? ' (one report)' : ''}</td>
									<td>{fmt(bar.start)}</td>
									<td>{fmt(bar.end)}</td>
									<td class="chips">
										{#each bar.claims as cid (cid)}
											{@const claim = findClaim(cid)}
											{#if claim}<ClaimIndicator {claim} expanded={expandedClaim === cid} onclick={() => toggleClaim(cid)} />{/if}
										{/each}
									</td>
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{:else if figure.kind === 'compare'}
		<div class="table-scroll">
			<table class="compare">
				<thead>
					<tr>
						<td></td>
						{#each figure.columns as col (col)}<th scope="col">{col}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each figure.rows as row (row.label)}
						<tr>
							<th scope="row">{row.label}</th>
							{#each row.cells as cell, ci (ci)}
								<td data-label={figure.columns[ci]}>{#each cell as node, ni (ni)}{@render inline(node)}{/each}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="caption">{figure.caption}</p>
</figure>

<style>
	.fig {
		margin: var(--s-6) 0;
		padding: var(--s-4);
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-2, 8px);
	}
	.head {
		margin-bottom: var(--s-4);
	}
	.title {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--accent);
	}
	.caption {
		margin: var(--s-4) 0 0;
		font-size: var(--t-xs);
		line-height: 1.6;
		color: var(--text-muted);
	}
	.chart {
		position: relative;
	}
	.axis {
		position: relative;
		height: 1.2em;
		margin-bottom: var(--s-2);
	}
	.tick {
		position: absolute;
		transform: translateX(-50%);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.lane {
		margin-bottom: var(--s-3);
	}
	.lane-label {
		font-size: var(--t-xs);
		color: var(--text-secondary);
		margin-bottom: 3px;
	}
	.track {
		position: relative;
		height: 28px;
		background: var(--surface-base);
		border-radius: 4px;
		overflow: hidden;
	}
	.gridline {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border-subtle);
	}
	.bar {
		position: absolute;
		top: 3px;
		bottom: 3px;
		display: flex;
		align-items: center;
		padding: 0 6px;
		box-sizing: border-box;
		min-width: 3px;
		border-radius: 3px;
		background: color-mix(in oklch, var(--accent) 38%, var(--surface-raised));
		border-right: 2px solid var(--surface-base);
		overflow: hidden;
	}
	.bar.alt {
		background: color-mix(in oklch, var(--accent) 22%, var(--surface-raised));
	}
	.bar.open {
		-webkit-mask-image: linear-gradient(to right, #000 80%, transparent);
		mask-image: linear-gradient(to right, #000 80%, transparent);
	}
	.bar.weak {
		background: repeating-linear-gradient(135deg, color-mix(in oklch, var(--accent) 45%, var(--surface-raised)) 0 4px, var(--surface-raised) 4px 8px);
	}
	.bar-name {
		font-size: var(--t-2xs);
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.data {
		margin-top: var(--s-3);
	}
	.data summary {
		cursor: pointer;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-xs);
		margin-top: var(--s-2);
	}
	th,
	td {
		text-align: start;
		vertical-align: top;
		padding: var(--s-2) var(--s-3) var(--s-2) 0;
		border-bottom: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		line-height: 1.55;
	}
	thead th,
	thead td {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		font-weight: 500;
	}
	tbody th {
		color: var(--text-primary);
		font-weight: 600;
		min-width: 7rem;
	}
	.compare td {
		min-width: 12rem;
	}
	.chips {
		white-space: nowrap;
	}
	/* On a phone each row becomes a small card: the era label travels with the cell. */
	@media (max-width: 640px) {
		.compare,
		.compare tbody,
		.compare tr,
		.compare th,
		.compare td {
			display: block;
		}
		.compare thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.compare tr {
			padding: var(--s-3) 0;
			border-bottom: 1px solid var(--border-subtle);
		}
		.compare th,
		.compare td {
			border: 0;
			padding: 2px 0;
			min-width: 0;
		}
		.compare tbody th {
			margin-bottom: var(--s-1);
		}
		.compare td::before {
			content: attr(data-label);
			display: block;
			font-family: var(--font-mono);
			font-size: var(--t-2xs);
			letter-spacing: var(--track-caps);
			text-transform: uppercase;
			color: var(--text-faint);
			margin-top: var(--s-2);
		}
	}
	:global([dir='rtl']) .title,
	:global([dir='rtl']) thead th {
		letter-spacing: 0;
	}
</style>
