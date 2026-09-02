<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { applyEntityLink } from '$lib/deeplink.svelte';
	import { t, nameOf, layerLabel } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { INDEX_KEYS, composite, computeIndices, type IndexKey } from '$lib/indices';
	import { LAYER_COLOR, personById, roleById, type Layer } from '$lib/model';
	import { durationLabel, formatDate, indexMeta } from '$lib/t.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Chip from '$lib/ui/Chip.svelte';

	/**
	 * Six indices, side by side, never summed by default.
	 *
	 * Any single "power score" would be read as truth, and it would not be. So the
	 * reader gets six separately-derived columns and a set of weight sliders. Moving
	 * the sliders reorders the board, and the reader discovers for themselves that
	 * "most powerful" is a function of what you decide to measure. That discovery is
	 * the argument, delivered as an interaction rather than a disclaimer.
	 */

	let sortKey = $state<IndexKey | 'composite'>('composite');
	let showWeights = $state(false);

	/**
	 * W2 deep link: `?id=` selects a ranked person on arrival. The row's `.sel`
	 * highlight and the Inspector both follow from the global selection; this
	 * only applies the id. One-shot, like the Network's deepLinked.
	 */
	let deepLinked = false;
	$effect(() => {
		if (!deepLinked && applyEntityLink()) deepLinked = true;
	});

	const scores = $derived(
		computeIndices({
			t: app.t,
			basisFloor: app.basisFloor,
			layers: app.activeLayers,
			allTime: app.allTime
		})
	);

	const ranked = $derived.by(() => {
		const rows = scores.map((s) => ({ ...s, composite: composite(s, app.weights) }));
		rows.sort((a, b) => {
			const key = sortKey;
			return (b[key] as number) - (a[key] as number);
		});
		return rows.slice(0, 40);
	});

	const maxComposite = $derived(Math.max(1, ...ranked.map((r) => r.composite)));

	function resetWeights() {
		app.weights = { authority: 1, proximity: 1, survival: 1, brokerage: 1, reach: 1, influence: 1 };
	}
</script>

<div class="rankings">
	<div class="toolbar">
		<span class="eyebrow">{t('rankings.eyebrow')}</span>
		<p class="hint">{t('rankings.hint')}</p>
		<div class="modes">
			<Button variant="outline" size="xs" active={!app.allTime} onclick={() => (app.allTime = false)}>
				{format(app.locale, 'rankings.asof', { date: formatDate(app.t, 'year') })}
			</Button>
			<Button variant="outline" size="xs" active={app.allTime} onclick={() => (app.allTime = true)}>{t('rankings.alltime')}</Button>
			<Button variant="outline" size="xs" active={showWeights} onclick={() => (showWeights = !showWeights)}>
				{t('rankings.weights')}
			</Button>
		</div>
	</div>

	{#if showWeights}
		<div class="weights">
			<p class="w-intro">{t('rankings.weightsIntro')}</p>
			<div class="w-grid">
				{#each INDEX_KEYS as key (key)}
					<label>
						<span class="w-label">{t('rankings.' + key)}</span>
						<input type="range" min="0" max="3" step="0.25" bind:value={app.weights[key]} />
						<span class="w-val mono">{app.weights[key].toFixed(2)}</span>
					</label>
				{/each}
			</div>
			<Button variant="ghost" size="xs" onclick={resetWeights}>{t('rankings.reset')}</Button>
		</div>
	{/if}

	<!--
		What the six columns measure.

		Open on a wide screen, where the cards sit in one row and are the explanation
		you read before the table. Folded on a phone, where the same grid collapses to a
		single column and pushes the ranking itself — the thing the page is for — some
		450px below the fold.
	-->
	<details class="legend-wrap" open={!compact.current}>
		<summary>{t('rankings.what')}</summary>
		<div class="legend">
			{#each INDEX_KEYS as key (key)}
				<div class="lcard">
					<h3>{indexMeta(key).label}</h3>
					<p>{indexMeta(key).blurb}</p>
					<p class="derived">{indexMeta(key).derived}</p>
				</div>
			{/each}
		</div>
	</details>

	<div class="table-scroll">
		{#if ranked.length === 0}
			<p class="empty">{format(app.locale, 'rankings.empty', { date: formatDate(app.t, 'day') })}</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th class="rank">#</th>
						<th>{t('rankings.person')}</th>
						<th class="role-col">{t('rankings.role')}</th>
						{#each INDEX_KEYS as key (key)}
							<th class="num" class:sorted={sortKey === key}>
								<Tooltip content={indexMeta(key).blurb}>
									<Button variant="ghost" size="xs" onclick={() => (sortKey = key)}>
										{t('rankings.' + key)}
									</Button>
								</Tooltip>
							</th>
						{/each}
						<th class="num comp" class:sorted={sortKey === 'composite'}>
							<Button variant="ghost" size="xs" onclick={() => (sortKey = 'composite')}>{t('rankings.combined')}</Button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each ranked as row, i (row.personId)}
						{@const person = personById.get(row.personId)}
						<tr
							class:sel={app.selected === row.personId}
							onmouseenter={() => (app.hovered = row.personId)}
							onmouseleave={() => (app.hovered = null)}
						>
							<td class="rank mono">{i + 1}</td>
							<td class="who">
								<button onclick={() => app.select(row.personId)}>
									<i style:background={LAYER_COLOR[(person?.layers[0] ?? 'political') as Layer]}></i>
									<span>{nameOf(person)}</span>
								</button>
								{#if row.detail.layers.length > 1}
									<Tooltip content={t('rankings.multilayer')}>
										<Chip variant="outline" size="xs" tint="var(--accent)">{row.detail.layers.length}L</Chip>
									</Tooltip>
								{/if}
							</td>
							<td class="role-col">
								{row.detail.topRoleId ? nameOf(roleById.get(row.detail.topRoleId)) || row.detail.topRole : (row.detail.topRole ?? '—')}
							</td>

							{#each INDEX_KEYS as key (key)}
								<td class="num">
									<span class="bar" style:--v="{row[key]}%" style:--c={LAYER_COLOR[(person?.layers[0] ?? 'political') as Layer]}></span>
									<span class="v mono">{Math.round(row[key])}</span>
								</td>
							{/each}

							<td class="num comp">
								<span
									class="bar strong"
									style:--v="{(row.composite / maxComposite) * 100}%"
									style:--c="var(--accent)"
								></span>
								<span class="v mono">{Math.round(row.composite)}</span>
							</td>
						</tr>
						{#if app.selected === row.personId}
							<tr class="why">
								<td></td>
								<td colspan={INDEX_KEYS.length + 3}>
									<div class="why-grid">
										<div>
											<span class="eyebrow">{t('rankings.authority')}</span>
											<p>
												{#if row.detail.topRoleId}
													{format(app.locale, 'rankings.detail.authority', {
														role: nameOf(roleById.get(row.detail.topRoleId)) || row.detail.topRole || '',
														weight: row.authority
													})}
												{:else}
													{t('rankings.detail.nopost')} · weight {row.authority}
												{/if}
											</p>
										</div>
										<div>
											<span class="eyebrow">{t('rankings.proximity')}</span>
											<p>
												{row.detail.hops === null
													? t('rankings.detail.nopath')
													: format(app.locale, 'rankings.detail.hops', { n: row.detail.hops })}
											</p>
										</div>
										<div>
											<span class="eyebrow">{t('rankings.survival')}</span>
											<p>
												{format(app.locale, 'rankings.detail.survival', {
													duration: durationLabel(row.detail.years),
													n: row.detail.rupturesSurvived
												})}
											</p>
										</div>
										<div>
											<span class="eyebrow">{t('rankings.brokerage')}</span>
											<p>{format(app.locale, 'rankings.detail.brokerage', { n: row.detail.bridgePaths })}</p>
										</div>
										<div>
											<span class="eyebrow">{t('rankings.reach')}</span>
											<p>{row.detail.layers.map((l) => layerLabel(l as Layer)).join(', ')}</p>
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<p class="caveat">{t('rankings.caveat')}</p>

	<details class="sensitivity">
		<summary>{t('rankings.sensitivityTitle')}</summary>
		<div class="sens">
			<p>{t('rankings.sensitivityBody')}</p>
			<p class="sens-links mono"><a href="/sensitivity.json" target="_blank" rel="noopener">sensitivity.json</a> · <span>{t('rankings.sensitivityNote')}</span></p>
		</div>
	</details>
</div>

<style>
	.rankings {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--s-6);
		padding: var(--s-4) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}
	.hint {
		margin: 0;
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
		max-width: 68ch;
	}
	.modes {
		display: flex;
		gap: var(--s-2);
		margin-inline-start: auto;
	}


	.weights {
		padding: var(--s-5) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--surface-raised);
	}
	.w-intro {
		margin: 0 0 var(--s-4);
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
		max-width: 72ch;
	}
	.w-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: var(--s-4) var(--s-7);
	}
	.w-grid label {
		display: grid;
		grid-template-columns: 74px 1fr 38px;
		align-items: center;
		gap: var(--s-4);
		font-size: var(--t-xs);
	}
	.w-label {
		color: var(--text-secondary);
	}
	.w-val {
		font-size: var(--t-xs);
		color: var(--text-faint);
		text-align: end;
	}
	input[type='range'] {
		accent-color: var(--accent);
		height: 3px;
	}
	.legend-wrap {
		border-bottom: 1px solid var(--border-subtle);
	}
	.legend-wrap summary {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-4) var(--s-6);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		cursor: pointer;
		list-style: none;
	}
	.legend-wrap summary::-webkit-details-marker {
		display: none;
	}
	.legend-wrap summary::before {
		content: '▸';
		font-size: 9px;
		transition: transform var(--dur-fast) var(--ease-out);
	}
	.legend-wrap[open] summary::before {
		transform: rotate(90deg);
	}
	.legend-wrap summary:hover {
		color: var(--text-primary);
	}
	.legend {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
		gap: 1px;
		background: var(--border-subtle);
		border-top: 1px solid var(--border-subtle);
	}
	.lcard {
		background: var(--surface-base);
		padding: var(--s-4) var(--s-5) var(--s-5);
	}
	.lcard h3 {
		font-size: var(--t-sm);
		font-weight: 550;
		margin-bottom: var(--s-2);
		color: var(--text-primary);
	}
	.lcard p {
		margin: 0;
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.lcard .derived {
		margin-top: var(--s-3);
		color: var(--text-faint);
		font-style: italic;
	}

	.table-scroll {
		flex: 1;
		min-height: 0;
		overflow-x: auto;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		mask-image: linear-gradient(to right, black 90%, transparent);
		-webkit-mask-image: linear-gradient(to right, black 90%, transparent);
		box-shadow: inset -12px 0 10px -10px color-mix(in srgb, var(--border-strong) 28%, transparent);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface-panel);
		border-bottom: 1px solid var(--border-default);
		font-weight: 400;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		text-align: start;
		padding: 7px 10px;
		white-space: nowrap;
	}
	thead th.sorted {
		color: var(--accent);
	}
	th.num,
	td.num {
		text-align: end;
		width: 92px;
	}
	th.rank,
	td.rank {
		width: 40px;
		text-align: end;
		color: var(--text-faint);
		font-size: 10.5px;
	}
	.role-col {
		color: var(--text-secondary);
		font-size: 11.5px;
		max-width: 250px;
	}

	tbody tr {
		border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
	}
	tbody tr:hover {
		background: color-mix(in srgb, var(--text-primary) 3.5%, transparent);
	}
	tbody tr.sel {
		background: color-mix(in srgb, var(--accent) 9%, transparent);
	}
	td {
		padding: 5px 10px;
		vertical-align: middle;
	}
	.who button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-weight: 500;
		text-align: start;
	}
	.who button:hover span {
		text-decoration: underline;
		text-decoration-color: var(--accent);
	}
	.who i {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	td.num {
		position: relative;
	}
	.bar {
		position: absolute;
		left: 10px;
		right: 34px;
		bottom: 3px;
		height: 2.5px;
		border-radius: 2px;
		background: linear-gradient(
			to right,
			var(--c) 0,
			var(--c) var(--v),
			color-mix(in srgb, var(--text-primary) 8%, transparent) var(--v)
		);
		opacity: 0.75;
	}
	.bar.strong {
		height: 3.5px;
		opacity: 1;
	}
	.v {
		font-size: 11px;
		color: var(--text-secondary);
	}
	td.comp .v {
		color: var(--text-primary);
		font-weight: 500;
	}

	tr.why td {
		padding: 4px 10px 12px;
		background: var(--surface-sunken);
	}
	.why-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 10px 20px;
	}
	.why-grid p {
		margin: 2px 0 0;
		font-size: 11.5px;
		color: var(--text-secondary);
		line-height: 1.45;
	}

	.caveat {
		margin: 0;
		padding: var(--s-5) var(--s-6) var(--s-6);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-sm);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
		max-width: 100ch;
	}
	.sensitivity {
		border-top: 1px solid var(--border-subtle);
	}
	.sensitivity summary {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-4) var(--s-6);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		cursor: pointer;
		list-style: none;
	}
	.sensitivity summary::-webkit-details-marker {
		display: none;
	}
	.sensitivity summary::before {
		content: '▸';
		font-size: 9px;
		transition: transform var(--dur-fast) var(--ease-out);
	}
	.sensitivity[open] summary::before {
		transform: rotate(90deg);
	}
	.sensitivity summary:hover {
		color: var(--text-primary);
	}
	.sens {
		padding: 0 var(--s-6) var(--s-5);
		max-width: 100ch;
	}
	.sens p {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}
	.sens-links {
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.sens-links a {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.empty {
		padding: var(--s-11) var(--s-6);
		font-size: var(--t-md);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
		max-width: 60ch;
	}
</style>
