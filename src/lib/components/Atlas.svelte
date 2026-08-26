<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { applyEntityLink } from '$lib/deeplink.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Content from '$lib/ui/Content.svelte';
	import { format } from '$lib/i18n';
	import {
		CUTOFF,
		LAYER_COLOR,
		LAYER_LABEL,
		LAYERS,
		ds,
		institutionById,
		meetsBasis,
		overlaps,
		personById,
		type Basis,
		type Confidence,
		type Layer
	} from '$lib/model';
	import { durationLabel, nameOf, t} from '$lib/t.svelte';
	import { MIN_HOLDERS, tenureByRole } from '$lib/tenure';

	/**
	 * The bird's-eye view.
	 *
	 * Not one everything-at-once hairball, which defeats the eye. Four
	 * complementary compressions instead:
	 *
	 *   1. Small multiples — one panel per era, IDENTICAL node positions in every
	 *      panel, so the eye compares structure across time effortlessly.
	 *   2. Survival matrix — people against eras. The most direct visual test of the
	 *      continuity hypothesis, and the one chart that answers the question the
	 *      whole project starts from.
	 *   3. Institution crossing matrix — who served in both of any two institutions.
	 *      Bright cells are the career pipelines: military into intelligence into
	 *      the presidency.
	 *   4. Turnover by office — median tenure per post. Derived from intervals alone,
	 *      and the one panel here that answers an open question rather than
	 *      illustrating a hypothesis.
	 */

	const eras = $derived(ds.eras);

	/**
	 * W2 deep link: `?id=` selects a person on arrival — the survival matrix rows
	 * and the small-multiple nodes all highlight from the global selection.
	 * One-shot, like the Network's deepLinked.
	 */
	let deepLinked = false;
	$effect(() => {
		if (!deepLinked && applyEntityLink()) deepLinked = true;
	});

	const visiblePositions = $derived(
		ds.positions.filter(
			(p) =>
				meetsBasis(p.basis as Basis, app.basisFloor) &&
				app.activeLayers.has(p.layer as Layer)
		)
	);

	// =========================================================================
	// 1. SMALL MULTIPLES — institutions per era, fixed positions
	// =========================================================================

	const PANEL_W = 300;
	const PANEL_H = 190;

	/** Institution positions, computed once and reused in every panel. */
	const instLayout = $derived.by(() => {
		const lanes = LAYERS.filter((l) => app.activeLayers.has(l));
		const map = new Map<string, { x: number; y: number; layer: Layer; name: string }>();
		const byLayer = new Map<Layer, typeof ds.institutions>();
		for (const inst of ds.institutions) {
			const l = inst.layer as Layer;
			if (!lanes.includes(l)) continue;
			const list = byLayer.get(l) ?? [];
			list.push(inst);
			byLayer.set(l, list);
		}
		// Arrange each layer as a vertical band; institutions spread horizontally.
		const bandH = (PANEL_H - 22) / Math.max(1, lanes.length);
		lanes.forEach((layer, li) => {
			const list = (byLayer.get(layer) ?? []).sort((a, b) => a.order - b.order);
			const gap = PANEL_W / (list.length + 1);
			list.forEach((inst, i) => {
				map.set(inst.id, {
					x: gap * (i + 1),
					y: 18 + bandH * li + bandH / 2,
					layer,
					name: nameOf(inst)
				});
			});
		});
		return map;
	});

	interface Panel {
		era: (typeof ds.eras)[number];
		nodes: { id: string; x: number; y: number; layer: Layer; r: number; holders: number }[];
		links: { a: string; b: string; weight: number }[];
	}

	const panels = $derived.by((): Panel[] =>
		eras.map((era) => {
			const from = era.interval.startEarliest;
			const to = era.interval.endLatest ?? CUTOFF;
			const inEra = visiblePositions.filter((p) => overlaps(p.interval, from, to));

			const holdersByInst = new Map<string, Set<string>>();
			const instsByPerson = new Map<string, Set<string>>();
			for (const p of inEra) {
				if (!p.institution) continue;
				(holdersByInst.get(p.institution) ?? holdersByInst.set(p.institution, new Set()).get(p.institution)!).add(
					p.holder
				);
				(instsByPerson.get(p.holder) ?? instsByPerson.set(p.holder, new Set()).get(p.holder)!).add(
					p.institution
				);
			}

			const nodes = [];
			for (const [instId, holders] of holdersByInst) {
				const pos = instLayout.get(instId);
				if (!pos) continue;
				nodes.push({
					id: instId,
					x: pos.x,
					y: pos.y,
					layer: pos.layer,
					r: 2 + Math.min(6, Math.sqrt(holders.size) * 1.9),
					holders: holders.size
				});
			}

			// A link means at least one person held posts in both institutions in this era.
			const linkCount = new Map<string, number>();
			for (const insts of instsByPerson.values()) {
				const arr = [...insts].sort();
				for (let i = 0; i < arr.length; i++) {
					for (let j = i + 1; j < arr.length; j++) {
						const key = `${arr[i]}|${arr[j]}`;
						linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
					}
				}
			}
			const links = [...linkCount.entries()]
				.map(([key, weight]) => {
					const [a, b] = key.split('|');
					return { a, b, weight };
				})
				.filter((l) => instLayout.has(l.a) && instLayout.has(l.b));

			return { era, nodes, links };
		})
	);

	// =========================================================================
	// 2. SURVIVAL MATRIX — people against eras
	// =========================================================================

	interface SurvivalRow {
		id: string;
		name: string;
		layer: Layer;
		cells: { era: string; held: boolean; authority: number; roles: string[] }[];
		erasCount: number;
		years: number;
	}

	const survival = $derived.by((): SurvivalRow[] => {
		const rows: SurvivalRow[] = [];
		for (const person of ds.people) {
			const held = visiblePositions.filter((p) => p.holder === person.id);
			if (held.length === 0) continue;
			const cells = eras.map((era) => {
				const from = era.interval.startEarliest;
				const to = era.interval.endLatest ?? CUTOFF;
				const inEra = held.filter((p) => overlaps(p.interval, from, to));
				return {
					era: era.id,
					held: inEra.length > 0,
					authority: inEra.reduce((m, p) => Math.max(m, p.authority), 0),
					roles: inEra.map((p) => p.roleTitle)
				};
			});
			const erasCount = cells.filter((c) => c.held).length;
			rows.push({
				id: person.id,
				name: nameOf(person),
				layer: person.layers[0] as Layer,
				cells,
				erasCount,
				years: held.reduce((s, p) => s + p.years, 0)
			});
		}
		// Sort by breadth of survival first: the people at the top of this list are
		// the answer to "who outlasts regimes".
		return rows.sort((a, b) => b.erasCount - a.erasCount || b.years - a.years);
	});

	let showAllSurvival = $state(false);
	const survivalShown = $derived(showAllSurvival ? survival : survival.slice(0, 26));

	// =========================================================================
	// 3. INSTITUTION CROSSING MATRIX
	// =========================================================================

	const crossing = $derived.by(() => {
		const insts = ds.institutions
			.filter((i) => app.activeLayers.has(i.layer as Layer))
			.filter((i) => visiblePositions.some((p) => p.institution === i.id))
			.sort((a, b) => a.order - b.order);

		const byPerson = new Map<string, Set<string>>();
		for (const p of visiblePositions) {
			if (!p.institution) continue;
			(byPerson.get(p.holder) ?? byPerson.set(p.holder, new Set()).get(p.holder)!).add(p.institution);
		}

		const counts = new Map<string, string[]>();
		for (const [personId, set] of byPerson) {
			const arr = [...set];
			for (let i = 0; i < arr.length; i++) {
				for (let j = i + 1; j < arr.length; j++) {
					const key = [arr[i], arr[j]].sort().join('|');
					(counts.get(key) ?? counts.set(key, []).get(key)!).push(personId);
				}
			}
		}

		const max = Math.max(1, ...[...counts.values()].map((v) => v.length));
		return { insts, counts, max };
	});

	let hoverCell = $state<{ a: string; b: string; people: string[] } | null>(null);

	function crossKey(a: string, b: string) {
		return [a, b].sort().join('|');
	}

	// =========================================================================
	// 4. TURNOVER BY OFFICE
	//
	// questions.yaml calls the turnover asymmetry "the most striking pattern the
	// data produces on its own" — the National Guard command changing hands roughly
	// every two years while the Land Army chief of staff holds for five — and until
	// now no view showed it. It is derived purely from position intervals, which
	// makes it the most defensible thing on this page: no weighting, no editorial
	// table, just how long people actually stay.
	//
	// Median rather than mean, because a single forty-year holder drags a mean
	// somewhere useless, and offices here genuinely have both.
	// =========================================================================

	// Fastest churn first: the question this answers is which offices do not keep
	// their holders, so those belong at the top rather than buried under stable ones.
	// The statistics themselves live in $lib/tenure so the /now view measures its
	// current officeholders against exactly the same numbers this panel draws.
	const turnover = $derived(
		[...tenureByRole(visiblePositions).values()].sort((a, b) => a.median - b.median)
	);

	const turnoverMax = $derived(Math.max(1, ...turnover.map((r) => r.longest)));
</script>

<div class="atlas">
	<div class="toolbar">
		<span class="eyebrow">{t('atlas.eyebrow')}</span>
		<p class="hint">
			Four compressions of the whole dataset. All four respond to the evidence threshold and layer
			filters above.
		</p>
	</div>

	<div class="scroll">
		<!-- ============================ SMALL MULTIPLES ==================== -->
		<section>
			<header>
				<h2>{t('atlas.byera')}</h2>
				<p>
					One panel per era. Node positions are identical in every panel, so only the structure
					changes: circle size is the number of people holding posts in that institution, and a line
					means at least one person held posts in both. Watch the security cluster thicken after 1991
					and again after 2021.
				</p>
			</header>
			<div class="panels-wrap">
				<div class="panels">
					{#each panels as panel, i (panel.era.id)}
					<figure style:--enter-delay={i * 80 + 'ms'}>
						<svg viewBox="0 0 {PANEL_W} {PANEL_H}" role="img" aria-label={nameOf(panel.era)}>
							<rect x="0" y="0" width={PANEL_W} height={PANEL_H} class="panel-bg" />
							{#each panel.links as l (l.a + l.b)}
								{@const a = instLayout.get(l.a)!}
								{@const b = instLayout.get(l.b)!}
								<line
									x1={a.x}
									y1={a.y}
									x2={b.x}
									y2={b.y}
									stroke={a.layer === b.layer ? LAYER_COLOR[a.layer] : 'var(--accent)'}
									stroke-width={Math.min(2.4, 0.5 + l.weight * 0.5)}
									stroke-opacity={a.layer === b.layer ? 0.28 : 0.6}
								/>
							{/each}
							{#each panel.nodes as n (n.id)}
								<circle
									cx={n.x}
									cy={n.y}
									r={n.r}
									fill={LAYER_COLOR[n.layer]}
									fill-opacity="0.85"
									stroke={LAYER_COLOR[n.layer]}
									stroke-width="0.8"
								class="pnode"
								role="button"
								tabindex="0"
								aria-label={format(app.locale, 'atlas.holders', { name: nameOf(institutionById.get(n.id)), n: n.holders })}
								onclick={() => app.select(n.id)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										app.select(n.id);
									}
								}}
							>
								<title>{format(app.locale, 'atlas.holders', { name: nameOf(institutionById.get(n.id)), n: n.holders })}</title>
								</circle>
							{/each}
						</svg>
						<figcaption>
							<span class="cap-label" style:--c={panel.era.accent}>
								<i></i>{nameOf(panel.era)}
							</span>
							<span class="cap-formula">{panel.era.formula ?? ''}</span>
							<span class="cap-count mono">{format(app.locale, 'atlas.capCount', { n: panel.nodes.length, m: panel.links.length })}</span>
						</figcaption>
					</figure>
				{/each}
				</div>
			</div>
		</section>

		<!-- ============================ SURVIVAL MATRIX ==================== -->
		<section>
			<header>
				<h2>{t('atlas.outlast')}</h2>
				<Content view="atlas" section="outlast" />
			</header>

			<div class="matrix">
				<div class="m-head">
					<span class="m-name"></span>
					{#each eras as era (era.id)}
						<Tooltip content={era.thesis}>
							<span class="m-col" style:--c={era.accent}>{nameOf(era)}</span>
						</Tooltip>
					{/each}
					<span class="m-num">{t('atlas.mEras')}</span>
					<span class="m-num">{t('atlas.mTenure')}</span>
				</div>
				{#each survivalShown as row, ri (row.id)}
					<button
						class="m-row"
						class:sel={app.selected === row.id}
						style:--enter-delay={ri * 18 + 'ms'}
						onclick={() => app.select(row.id)}
						onmouseenter={() => (app.hovered = row.id)}
						onmouseleave={() => (app.hovered = null)}
					>
						<span class="m-name">
							<i style:background={LAYER_COLOR[row.layer]}></i>{row.name}
						</span>
						{#each row.cells as cell (cell.era)}
							{#if cell.held}
								<Tooltip content={cell.roles.join(', ')}>
									<span
										class="m-cell"
										class:held={cell.held}
										style:--a={cell.authority / 100}
										style:--c={LAYER_COLOR[row.layer]}
									></span>
								</Tooltip>
							{:else}
								<span
									class="m-cell"
									class:held={cell.held}
									style:--a={cell.authority / 100}
									style:--c={LAYER_COLOR[row.layer]}
								></span>
							{/if}
						{/each}
						<span class="m-num mono">{row.erasCount}</span>
						<span class="m-num mono">{durationLabel(row.years)}</span>
					</button>
				{/each}
			</div>
			{#if survival.length > survivalShown.length || showAllSurvival}
				<div class="more-wrap">
					<Button variant="outline" size="xs" onclick={() => (showAllSurvival = !showAllSurvival)}>
						{showAllSurvival
							? t('atlas.showFewer')
							: format(app.locale, 'atlas.showAll', { n: survival.length })}
					</Button>
				</div>
			{/if}
		</section>

		<!-- ======================= INSTITUTION CROSSINGS ==================== -->
		<section>
			<header>
				<h2>{t('atlas.crossings')}</h2>
				<Content view="atlas" section="crossings" />
			</header>

			<div class="cross-wrap">
				<table class="cross">
					<thead>
						<tr>
							<th class="corner"></th>
							{#each crossing.insts as inst (inst.id)}
								<th class="vert"><span>{inst.abbr ?? nameOf(inst)}</span></th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each crossing.insts as rowInst (rowInst.id)}
							<tr>
								<th class="rowhead" style:--c={LAYER_COLOR[rowInst.layer as Layer]}>
									<i></i>{nameOf(rowInst)}
								</th>
								{#each crossing.insts as colInst (colInst.id)}
									{@const same = rowInst.id === colInst.id}
									{@const people = same ? [] : (crossing.counts.get(crossKey(rowInst.id, colInst.id)) ?? [])}
									<td
										class:diag={same}
										class:filled={people.length > 0}
										style:--v={people.length / crossing.max}
										style:--c={LAYER_COLOR[rowInst.layer as Layer]}
										onmouseenter={() =>
											(hoverCell = people.length ? { a: rowInst.id, b: colInst.id, people } : null)}
										onmouseleave={() => (hoverCell = null)}
									>
										{#if people.length}<span>{people.length}</span>{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>

				{#if hoverCell}
					<div class="cross-tip">
						<strong
							>{nameOf(institutionById.get(hoverCell.a))} ↔ {nameOf(institutionById.get(hoverCell.b))}</strong
						>
						<ul>
							{#each hoverCell.people as p (p)}
								<li>{nameOf(personById.get(p))}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		</section>

		<!-- ============================ TURNOVER =========================== -->
		<section>
			<header>
				<h2>{t('atlas.tenure')}</h2>
				<p>
					Median tenure per office, shortest first, for the {turnover.length} offices with at least
					{MIN_HOLDERS} recorded holders. The bar spans the shortest to the longest tenure on record and
					the notch marks the median. This is computed from position intervals alone — no weighting and
					no editorial judgement — which makes the asymmetry at the top of this list the clearest
					pattern the dataset produces without being asked.
				</p>
			</header>

			{#if turnover.length === 0}
				<p class="empty-note">
					No office has {MIN_HOLDERS} recorded holders at this evidence threshold. Lower it to see
					turnover.
				</p>
			{:else}
				<ol class="turn">
					{#each turnover as r (r.role)}
						<li>
							<span class="t-name" style:--c={LAYER_COLOR[r.layer]}><i></i>{r.title}</span>
							<span class="t-n" title="{r.holders} recorded holders">
								{r.holders}{#if r.acting}<Tooltip content={format(app.locale, 'now.acting.who', { who: r.acting })}><em>*</em></Tooltip>{/if}
							</span>
							<span class="t-med">{durationLabel(r.median)}</span>
							<span
								class="t-bar"
								role="img"
								aria-label="{r.title}: {r.holders} holders, median tenure {durationLabel(
									r.median
								)}, range {durationLabel(r.shortest)} to {durationLabel(r.longest)}"
							>
								<span
									class="t-range"
									style:--start="{(r.shortest / turnoverMax) * 100}%"
									style:--width="{((r.longest - r.shortest) / turnoverMax) * 100}%"
									style:--c={LAYER_COLOR[r.layer]}
								></span>
								<span
									class="t-notch"
									style:--at="{(r.median / turnoverMax) * 100}%"
									style:--c={LAYER_COLOR[r.layer]}
								></span>
							</span>
						</li>
					{/each}
				</ol>

				<p class="turn-note">
					Turnover is not evidence of instability, purge or hidden control, and this dataset offers no
					explanation for the spread — the question is open and recorded as such on the
					<a href="/evidence">evidence page</a>. Interim and acting appointments are counted as holders
					and marked <em>*</em>, which inflates the churn of offices that use them. Tenures drawn from
					uncertain dates carry that uncertainty into the median.
				</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.atlas {
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
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--s-4) var(--s-6) var(--s-11);
	}

	section {
		margin-top: var(--s-9);
		padding-top: var(--s-7);
		border-top: 1px solid var(--border-subtle);
	}
	section:first-child {
		border-top: none;
	}
	section > header {
		max-width: 82ch;
		margin-bottom: var(--s-6);
	}
	section h2 {
		font-family: var(--font-serif);
		font-size: var(--t-xl);
		font-weight: 550;
		margin-bottom: var(--s-2);
		letter-spacing: var(--track-tight);
	}
	section header p {
		margin: 0;
		font-size: var(--t-base);
		line-height: var(--lh-normal);
		color: var(--text-secondary);
	}

	/* --- Small multiples --- */
	.panels-wrap {
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
		scroll-snap-type: x proximity;
		-webkit-overflow-scrolling: touch;
	}
	.panels {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: var(--s-5);
		min-height: 220px;
	}
	figure {
		scroll-snap-align: start;
		min-height: 220px;
		margin: 0;
		animation: fig-fade var(--dur-slower) var(--ease-out) both;
		animation-delay: var(--enter-delay, 0ms);
	}
	@keyframes fig-fade {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		figure {
			animation: none;
		}
	}
	.panels svg {
		width: 100%;
		height: auto;
		min-height: 190px;
		display: block;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
	}
	.panel-bg {
		fill: var(--surface-sunken);
	}
	.pnode {
		cursor: pointer;
		transition: stroke var(--dur-fast) var(--ease-out);
	}
	.pnode:hover {
		stroke: var(--text-primary);
		stroke-width: 1.6;
	}
	figcaption {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-3) var(--s-1) 0;
	}
	.cap-label {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-base);
		font-weight: 550;
	}
	.cap-label i {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		background: var(--c);
		flex-shrink: 0;
	}
	.cap-formula {
		font-size: var(--t-xs);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		line-height: var(--lh-snug);
	}
	.cap-count {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	/* --- Survival matrix --- */
	.matrix {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		overflow: hidden;
	}
	.m-head,
	.m-row {
		display: grid;
		grid-template-columns: minmax(190px, 1.6fr) repeat(7, minmax(52px, 1fr)) 46px 62px;
		align-items: stretch;
		width: 100%;
		text-align: start;
	}
	.m-head {
		background: var(--surface-panel);
		border-bottom: 1px solid var(--border-subtle);
	}
	.m-col {
		font-size: 9.5px;
		font-family: var(--font-mono);
		letter-spacing: 0.03em;
		color: var(--text-secondary);
		padding: 6px 5px;
		border-inline-start: 1px solid var(--border-subtle);
		border-top: 2px solid var(--c);
		line-height: 1.2;
		cursor: help;
	}
	.m-num {
		font-size: 9px;
		color: var(--text-faint);
		padding: 6px 5px;
		border-inline-start: 1px solid var(--border-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-align: end;
	}
	.m-row {
		border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent);
		animation: row-fade var(--dur-slow) var(--ease-out) both;
		animation-delay: var(--enter-delay, 0ms);
	}
	@keyframes row-fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.m-row {
			animation: none;
		}
	}
	.m-row:hover {
		background: color-mix(in srgb, var(--text-primary) 4%, transparent);
	}
	.m-row.sel {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.m-name {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		padding: 4px 8px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.m-name i {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	/* A cell must FILL its grid slot. The held ones are wrapped in a Tooltip,
	   whose anchor span becomes the grid item - an inline span with no
	   content collapses to 0x1px and the matrix went dark for months while
	   every computed colour was perfectly correct. Block + 100% in both
	   axes makes wrapped and bare cells identical. */
	.m-cell {
		display: block;
		width: 100%;
		height: 100%;
		border-inline-start: 1px solid var(--border-subtle);
		background: transparent;
	}
	.m-cell.held {
		background: color-mix(in srgb, var(--c) calc(22% + var(--a) * 62%), transparent);
	}
	/* Reading across a row is the matrix's whole question - brighten that
	   person's held cells on hover so the eye can trace one career. */
	.m-row:hover .m-cell.held {
		background: color-mix(in srgb, var(--c) calc(34% + var(--a) * 66%), transparent);
	}
	.m-row .m-num {
		border-inline-start: 1px solid var(--border-subtle);
		font-size: 10.5px;
		color: var(--text-secondary);
		padding: 4px 7px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		text-transform: none;
	}
	.more-wrap {
		margin-top: 10px;
	}

	/* --- Crossing matrix --- */
	.cross-wrap {
		position: relative;
		overflow-x: auto;
		/* Scroll affordance: subtle edge fade when content overflows horizontally */
		scrollbar-width: thin;
	}
	table.cross {
		border-collapse: separate;
		border-spacing: 0;
		font-size: 10px;
	}
	.cross th,
	.cross td {
		border: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
	}
	.cross .corner {
		min-width: 180px;
		position: sticky;
		left: 0;
		top: 0;
		z-index: 4;
		background: var(--surface-panel);
	}
	.cross th.vert {
		height: 118px;
		width: 21px;
		padding: 0;
		vertical-align: bottom;
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface-panel);
	}
	.cross th.vert span {
		display: block;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-weight: 400;
		font-size: 9.5px;
		color: var(--text-secondary);
		padding: 4px 0;
		white-space: nowrap;
		max-height: 112px;
		overflow: hidden;
	}
	.cross th.rowhead {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-weight: 400;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		text-align: start;
		padding: var(--s-2) var(--s-4);
		white-space: nowrap;
		position: sticky;
		left: 0;
		z-index: 3;
		background: var(--surface-base);
		border-right: 1px solid var(--border-default);
	}
	.cross th.rowhead i {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--c);
		flex-shrink: 0;
	}
	.cross td {
		width: 21px;
		height: 21px;
		text-align: center;
		color: var(--text-faint);
	}
	.cross td.diag {
		background: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 2px,
			var(--border-subtle) 2px,
			var(--border-subtle) 3px
		);
	}
	.cross td.filled {
		background: color-mix(in srgb, var(--c) calc(18% + var(--v) * 70%), transparent);
		color: var(--text-primary);
		font-weight: 500;
		cursor: help;
	}
	.cross-tip {
		position: sticky;
		left: 0;
		margin-top: var(--s-4);
		padding: var(--s-4) var(--s-5);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		width: fit-content;
		max-width: min(420px, 90vw);
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		box-shadow: var(--elev-1);
	}
	.cross-tip strong {
		font-weight: 500;
		font-size: 12px;
	}
	.cross-tip ul {
		list-style: none;
		margin: 5px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 3px 10px;
	}
	.cross-tip li {
		font-size: 11px;
		color: var(--text-secondary);
	}

	/* --- Turnover by office ------------------------------------------------ */

	.turn {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 980px;
		display: grid;
		gap: 2px;
	}
	.turn li {
		display: grid;
		grid-template-columns: minmax(160px, 34ch) 3.5ch 6ch 1fr;
		align-items: center;
		gap: var(--s-4);
		padding-block: 3px;
	}
	.t-name {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.t-name i {
		inline-size: 6px;
		block-size: 6px;
		border-radius: 2px;
		background: var(--c);
		flex-shrink: 0;
	}
	.t-n,
	.t-med {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		text-align: end;
		white-space: nowrap;
	}
	.t-med {
		color: var(--text-secondary);
	}
	.t-n em {
		font-style: normal;
		color: var(--basis-inferred);
	}

	/* The bar is a range, not a value: a single length would hide that some offices
	   have both a six-month holder and a twenty-year one. The notch is the median. */
	.t-bar {
		position: relative;
		block-size: 12px;
		border-radius: var(--r-full);
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		transition: border-color var(--dur-fast) var(--ease-out);
	}
	.t-range {
		position: absolute;
		inset-block: 1px;
		inset-inline-start: var(--start);
		inline-size: var(--width);
		min-inline-size: 2px;
		background: color-mix(in oklch, var(--c) 42%, transparent);
		border-radius: var(--r-full);
		transition: background var(--dur-fast) var(--ease-out);
	}
	.t-notch {
		position: absolute;
		inset-block: -2px;
		inset-inline-start: var(--at);
		inline-size: 3px;
		background: var(--c);
		border-radius: var(--r-full);
		box-shadow: 0 0 0 2px var(--surface-base);
	}
	.turn li:hover .t-bar {
		border-color: color-mix(in oklch, var(--c) 35%, var(--border-subtle));
	}
	.turn li:hover .t-range {
		background: color-mix(in oklch, var(--c) 52%, transparent);
	}
	@media (pointer: coarse) {
		.t-bar { block-size: 14px; }
	}

	.turn-note,
	.empty-note {
		max-width: 82ch;
		margin-block-start: var(--s-5);
		font-size: var(--t-2xs);
		line-height: 1.65;
		color: var(--text-muted);
	}
	.turn-note em {
		font-style: normal;
		color: var(--basis-inferred);
	}
</style>
