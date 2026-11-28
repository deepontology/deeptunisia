<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { formatDate, t } from '$lib/t.svelte';
	import { eventTitle } from '$lib/names.svelte';
	import { BASIS_COLOR, BASIS_OPACITY, DASH, ds, type EventRec } from '$lib/model';
	import { eventEnd } from '$lib/chronicle/events';
	import { ew, lensStart, type EventsView } from './view.svelte';

	/**
	 * The events page on a phone: the record as a list, newest first, grouped by
	 * year. A 390px screen cannot hold a time axis with a row per event and a
	 * readable title beside it, so the phone gets the titles and the dates, each
	 * with the basis mark the timeline draws. A tap opens the record in the
	 * Inspector, as everywhere else in the app.
	 */

	let { view }: { view: EventsView } = $props();

	const newestFirst = [...ds.events].sort((a, b) => b.interval.startEarliest - a.interval.startEarliest);

	const rows = $derived.by(() => {
		const from = lensStart(view.lens);
		return newestFirst.filter((e) => eventEnd(e) >= from && view.passes(e, app.basisFloor));
	});

	const years = $derived.by(() => {
		const out: { year: number; events: EventRec[] }[] = [];
		for (const e of rows) {
			const y = new Date(e.interval.startEarliest).getUTCFullYear();
			const last = out[out.length - 1];
			if (last && last.year === y) last.events.push(e);
			else out.push({ year: y, events: [e] });
		}
		return out;
	});

	$effect(() => {
		const n = rows.length;
		untrack(() => {
			if (view.shown !== n) view.shown = n;
			view.atCutoff = true;
		});
	});
</script>

{#if years.length === 0}
	<p class="empty">{ew('events.empty')}</p>
{:else}
	<div class="list">
		{#each years as group (group.year)}
			<section aria-labelledby="ev-y{group.year}">
				<h2 class="year mono" id="ev-y{group.year}">{group.year}</h2>
				<ul>
					{#each group.events as e (e.id)}
						<li>
							<button
								type="button"
								class="row"
								class:sel={app.selected === e.id}
								class:rupture={e.rupture}
								aria-current={app.selected === e.id ? 'true' : undefined}
								onclick={() => app.select(e.id)}
							>
								<svg class="basis" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
									<circle
										cx="6"
										cy="6"
										r="4"
										fill="none"
										stroke={BASIS_COLOR[e.basis]}
										stroke-opacity={BASIS_OPACITY[e.basis]}
										stroke-width="1.6"
										stroke-dasharray={DASH[e.basis]}
									/>
								</svg>
								<span class="date mono">{formatDate(e.interval.startEarliest, 'day')}</span>
								<span class="title" dir="auto">{eventTitle(e)}</span>
								{#if e.rupture}
									<span class="rmark" title={t('record.rupture')} aria-label={t('record.rupture')}></span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}

<style>
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 var(--s-2) var(--s-8);
	}
	.year {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0;
		padding: var(--s-3) var(--s-3) var(--s-2);
		background: var(--surface-base);
		border-bottom: var(--rule);
		font-size: var(--t-xs);
		font-weight: 500;
		letter-spacing: var(--track-wide);
		color: var(--text-muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: var(--s-1) 0 var(--s-3);
	}
	.row {
		display: grid;
		grid-template-columns: 10px auto 1fr auto;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		min-height: var(--tap);
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		text-align: start;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.sel {
		background: var(--accent-muted);
	}
	.date {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.title {
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.row.rupture .title,
	.row.sel .title,
	.row:hover .title {
		color: var(--text-primary);
	}
	.rmark {
		width: 7px;
		height: 7px;
		transform: rotate(45deg);
		background: var(--rupture);
	}
	.empty {
		margin: var(--s-6) var(--s-4);
		font-size: var(--t-sm);
		color: var(--text-faint);
	}
</style>
