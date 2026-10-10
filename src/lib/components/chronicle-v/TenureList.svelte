<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { BASIS_COLOR, BASIS_OPACITY, CUTOFF, DASH, personById, type Basis, type Position } from '$lib/model';
	import { basisLabel, describeInterval, durationLabel, nameOf, t } from '$lib/t.svelte';
	import { visiblePositions, type ChronGroup } from '$lib/chronicle/rows';

	/**
	 * The vertical Chronicle's table alternative: every tenure the canvas draws for
	 * the open layer, oldest first, as one ordered list a screen reader can walk.
	 *
	 * It reads the same rows and the same evidence floor as the canvas
	 * (`visiblePositions`), so the list and the chart can never disagree about
	 * what is shown. Each row names the post, the holder, the span and how long it
	 * ran, and carries the basis as a word beside its line sample; tapping a row
	 * opens the holder, as tapping a block does.
	 */
	interface Props {
		groups: ChronGroup[];
		basisFloor: Basis;
	}

	let { groups, basisFloor }: Props = $props();

	const YEAR_MS = 365.2425 * 24 * 3600 * 1000;

	interface Entry {
		pos: Position;
		role: string;
		institution: string;
		holder: string;
	}

	const entries = $derived.by<Entry[]>(() => {
		const out: Entry[] = [];
		for (const g of groups) {
			for (const row of g.rows) {
				for (const pos of visiblePositions(row, basisFloor)) {
					out.push({
						pos,
						role: row.title,
						institution: row.institutionName,
						holder: nameOf(personById.get(pos.holder))
					});
				}
			}
		}
		return out.sort(
			(a, b) =>
				a.pos.interval.startEarliest - b.pos.interval.startEarliest ||
				a.role.localeCompare(b.role)
		);
	});

	function years(pos: Position): number {
		const iv = pos.interval;
		return ((iv.endLatest ?? CUTOFF) - iv.startEarliest) / YEAR_MS;
	}
</script>

{#if entries.length === 0}
	<p class="tl-empty">{t('chronicle.vertical.list.empty')}</p>
{:else}
	<ol class="tl" aria-label={t('chronicle.vertical.list.caption')}>
		{#each entries as e (e.pos.id)}
			{@const b = e.pos.basis as Basis}
			<li>
				<button
					type="button"
					class="tl-row"
					class:selected={app.selected === e.pos.holder}
					onclick={() => app.select(e.pos.holder)}
				>
					<span class="tl-role">
						{e.role}
						<span class="tl-inst mono">{e.institution}</span>
					</span>
					<span class="tl-holder">{e.holder}</span>
					<span class="tl-span mono">
						{describeInterval(e.pos.interval)}
						<span class="tl-dur">{durationLabel(years(e.pos))}</span>
					</span>
					<span class="tl-basis" style:color={BASIS_COLOR[b]}>
						<svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true">
							<line
								x1="1"
								y1="3"
								x2="21"
								y2="3"
								stroke="currentColor"
								stroke-width="2"
								stroke-opacity={BASIS_OPACITY[b]}
								stroke-dasharray={DASH[b]}
							/>
						</svg>
						<span class="tl-basis-word">{basisLabel(b)}</span>
					</span>
				</button>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.tl {
		margin: 0;
		padding: 0 0 var(--s-8);
		list-style: none;
	}
	.tl li {
		border-bottom: var(--rule);
	}

	.tl-row {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'role basis'
			'holder holder'
			'span span';
		gap: var(--s-1) var(--s-3);
		width: 100%;
		min-height: var(--touch);
		margin: 0;
		padding: var(--s-3) calc(var(--s-4) + var(--safe-r)) var(--s-3) calc(var(--s-4) + var(--safe-l));
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}
	.tl-row:hover {
		background: var(--surface-hover);
	}
	.tl-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.tl-row.selected {
		background: var(--accent-muted);
	}

	.tl-role {
		grid-area: role;
		min-width: 0;
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.tl-inst {
		display: block;
		margin-top: 1px;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.tl-holder {
		grid-area: holder;
		font-size: var(--t-md);
		font-weight: 500;
		color: var(--text-primary);
	}
	.tl-span {
		grid-area: span;
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1) var(--s-3);
		font-size: var(--t-2xs);
		color: var(--text-muted);
	}
	.tl-dur {
		color: var(--text-faint);
	}

	.tl-basis {
		grid-area: basis;
		align-self: start;
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-2xs);
		white-space: nowrap;
	}
	.tl-basis-word {
		color: var(--text-secondary);
	}

	.tl-empty {
		margin: 0;
		padding: var(--s-6) var(--s-4);
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
</style>
