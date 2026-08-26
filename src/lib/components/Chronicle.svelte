<script lang="ts">
	import { AxisCamera, navigableAxis } from '$lib/viz/axis.svelte';
	import { fits } from '$lib/viz/measure';
	import { relationshipsByEntity } from '$lib/model';
	import { app } from '$lib/state.svelte';
	import { applyEntityLink } from '$lib/deeplink.svelte';
	import { t, describeInterval, durationLabel, formatDate, nameOf} from '$lib/t.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { BASIS_COLOR, BASIS_SHORT } from '$lib/model';
	import {
		CUTOFF,
		DASH,
		FLOOR,
		LAYER_COLOR,
		activity,
		ds,
		institutionById,
		meetsBasis,
		personById,
		roleById,
		type Confidence,
		type Basis,
		type Layer,
		type Position
	} from '$lib/model';

	/**
	 * A layered Gantt of officeholding, 1956-2026.
	 *
	 * The design decision that matters: bar length equals tenure, and rows are
	 * grouped by institution. That makes the dataset's sharpest finding legible
	 * pre-attentively rather than as prose — the National Guard row is chopped into
	 * seven short bars while the three service-chief rows are long unbroken slabs.
	 * You can see it in half a second without reading a word.
	 *
	 * Fuzzy dates render as hatched extensions beyond the solid core, so an
	 * estimated span never masquerades as a documented one.
	 */

	const ROW_H = 24;
	const GROUP_H = 26;
	const PAD_T = 30;
	const PAD_B = 8;

	let plotEl = $state<HTMLDivElement | null>(null);
	let width = $state(1000);

	/**
	 * The time window.
	 *
	 * Driven by the shared axis camera rather than by hand-rolled handlers, so this
	 * chart gains pinch-zoom and momentum and answers the same gestures as the
	 * Network. It is not the 2-D `Camera`: rows must stay put and the label gutter
	 * must stay stuck to the left, so only time moves. See src/lib/viz/axis.svelte.ts.
	 */
	const axis = new AxisCamera({
		min: FLOOR,
		max: CUTOFF,
		// Eighteen months is about as far in as this chart stays meaningful; below it
		// most tenures are wider than the window and the bars lose their shape.
		minSpan: 365.2425 * 86_400_000 * 1.5
	});

	const domain = $derived<[number, number]>([axis.d0, axis.d1]);

	/** Must match the `.era-label` rule below, or the fit test lies about the render. */
	const ERA_LABEL_TYPE = {
		size: 9,
		family: 'JetBrains Mono, monospace',
		tracking: 0.1,
		uppercase: true
	};

	/** Must match `.row-label` (11px Inter) so the truncation decision is honest. */
	const ROW_LABEL_TYPE = {
		size: 11,
		family: 'Inter, system-ui, -apple-system, sans-serif',
		weight: 400
	};

	let tip = $state<{ x: number; y: number; pos: Position } | null>(null);

	/**
	 * W2 deep link: `?id=` selects a person or institution on arrival. The
	 * selection is global (app.selected), so the Inspector opens and the row
	 * highlights on its own; this effect only applies the id. One-shot, like the
	 * Network's `deepLinked` — the URL is a door, not a state that keeps
	 * re-applying.
	 */
	let deepLinked = false;
	$effect(() => {
		if (!deepLinked && applyEntityLink()) deepLinked = true;
	});

	/**
	 * The label gutter.
	 *
	 * A fixed 264px is right on a desktop and absurd on a phone: at 390px it left
	 * 126px for the chart, so two thirds of the screen was role names and the tenures
	 * they describe were a sliver. Below 640px it becomes a fraction of the width
	 * instead, floored so the names do not vanish entirely.
	 *
	 * Long names are clipped rather than allowed to spill — see `gutter-clip`. Clipping
	 * loses the tail of a few titles, which is recoverable by rotating the phone or
	 * opening the table below; overlapping the chart with text is not recoverable at all.
	 */
	const GUTTER = $derived(width < 640 ? Math.max(112, Math.round(width * 0.42)) : 264);

	/**
	 * Ellipsize a gutter label so it sits inside GUTTER - 30px without clipping
	 * mid-word. SVG <text> cannot `text-overflow: ellipsis` — it clips — so we
	 * measure with the same canvas helper the era bands use and shorten with "…"
	 * when the string is wider than the gutter affords. The full title remains
	 * reachable via the <title> tooltip inside the <text>.
	 * When the gutter is narrow (<200px) a character-count heuristic (≈32 chars)
	 * gates the measurement so very long titles are shortened early.
	 */
	function gutterLabel(title: string): string {
		const avail = GUTTER - 30;
		if (avail <= 24) return title;
		// Fast path for narrow gutters: long titles are guaranteed to clip.
		if (GUTTER < 200 && title.length > 32) {
			let cand = title.slice(0, 32).trimEnd() + '…';
			if (!fits(cand, avail, ROW_LABEL_TYPE)) {
				for (let n = 31; n > 0; n--) {
					cand = title.slice(0, n).trimEnd() + '…';
					if (fits(cand, avail, ROW_LABEL_TYPE)) return cand;
				}
				return '…';
			}
			// Try to use more of the space if 32 was conservative
			for (let n = 33; n < title.length; n++) {
				const wider = title.slice(0, n).trimEnd() + '…';
				if (!fits(wider, avail, ROW_LABEL_TYPE)) return cand;
				cand = wider;
			}
			return cand.length < title.length ? cand : title;
		}
		if (fits(title, avail, ROW_LABEL_TYPE)) return title;
		const ellipsis = '…';
		for (let len = title.length - 1; len > 0; len--) {
			const cand = title.slice(0, len).trimEnd() + ellipsis;
			if (fits(cand, avail, ROW_LABEL_TYPE)) return cand;
		}
		return ellipsis;
	}

	const plotW = $derived(Math.max(200, width - GUTTER));
	const x = $derived((t: number) => ((t - domain[0]) / (domain[1] - domain[0])) * plotW);
	const invX = $derived((px: number) => domain[0] + (px / plotW) * (domain[1] - domain[0]));

	// --- Rows -----------------------------------------------------------------
	// Rows are filtered by layer only, never by confidence. Keeping the layout
	// stable while the evidence dial moves is what lets the reader perceive edges
	// appearing and vanishing instead of watching the whole chart reflow.

	interface Row {
		kind: 'row';
		roleId: string;
		title: string;
		layer: Layer;
		authority: number;
		positions: Position[];
		y: number;
	}
	interface Group {
		kind: 'group';
		id: string;
		label: string;
		layer: Layer;
		y: number;
	}

	const layout = $derived.by(() => {
		const items: (Row | Group)[] = [];
		let y = PAD_T;

		const insts = [...ds.institutions]
			.filter((i) => app.activeLayers.has(i.layer as Layer))
			.sort((a, b) => a.order - b.order);

		for (const inst of insts) {
			const roles = ds.roles.filter((r) => r.institution === inst.id);
			const rows: Row[] = [];
			for (const role of roles) {
				const positions = ds.positions.filter((p) => p.role === role.id);
				if (positions.length === 0) continue;
				rows.push({
					kind: 'row',
					roleId: role.id,
					title: nameOf(role),
					layer: inst.layer as Layer,
					authority: role.authority,
					positions,
					y: 0
				});
			}
			if (rows.length === 0) continue;
			rows.sort((a, b) => b.authority - a.authority);

			items.push({
				kind: 'group',
				id: inst.id,
				label: nameOf(inst),
				layer: inst.layer as Layer,
				y
			});
			y += GROUP_H;
			for (const row of rows) {
				row.y = y;
				items.push(row);
				y += ROW_H;
			}
			y += 6;
		}
		return { items, height: y + PAD_B };
	});

	const ruptures = ds.events.filter((e) => e.rupture);

	const decadeTicks = $derived.by(() => {
		const span = domain[1] - domain[0];
		const years = span / (365.2425 * 86_400_000);
		const stepYears = years > 55 ? 10 : years > 22 ? 5 : years > 9 ? 2 : 1;
		const startYear = new Date(domain[0]).getUTCFullYear();
		const endYear = new Date(domain[1]).getUTCFullYear();
		const out: number[] = [];
		for (let yr = Math.ceil(startYear / stepYears) * stepYears; yr <= endYear; yr += stepYears) {
			out.push(Date.UTC(yr, 0, 1));
		}
		return out;
	});

	// --- Bar geometry ---------------------------------------------------------

	interface Bar {
		coreX: number;
		coreW: number;
		leadX: number;
		leadW: number;
		tailX: number;
		tailW: number;
	}

	function barGeometry(pos: Position): Bar {
		const iv = pos.interval;
		const endEarly = iv.endEarliest ?? CUTOFF;
		const endLate = iv.endLatest ?? CUTOFF;
		const coreStart = x(iv.startLatest);
		const coreEnd = x(Math.max(iv.startLatest, endEarly));
		const leadStart = x(iv.startEarliest);
		const tailEnd = x(Math.max(endEarly, endLate));
		return {
			coreX: coreStart,
			coreW: Math.max(1.5, coreEnd - coreStart),
			leadX: leadStart,
			leadW: Math.max(0, coreStart - leadStart),
			tailX: coreEnd,
			tailW: Math.max(0, tailEnd - coreEnd)
		};
	}

	function visible(pos: Position) {
		return meetsBasis(pos.basis as Basis, app.basisFloor);
	}

	function isFocused(pos: Position) {
		return app.selected === pos.holder || app.hovered === pos.holder;
	}

	const anyFocus = $derived(Boolean(app.selected || app.hovered));

	/**
	 * Everyone the focused person is documented as connected to.
	 *
	 * WHY THIS IS ON THE CHRONICLE AT ALL
	 *
	 * Selecting a person used to dim everything else, which made their connections
	 * invisible on the one view that shows *when* things overlapped. That is the
	 * project's actual question — which relationships are genuinely continuous rather
	 * than reconstructed after each rupture — and it is answered by seeing whether two
	 * people were in post at the same time, which only a timeline can show.
	 *
	 * Deliberately NOT drawn as edges. Routing curves between bars scattered across a
	 * seventy-row Gantt chart produces spaghetti that obscures the tenures underneath,
	 * and the connection itself is already a first-class record with its own card. A
	 * third emphasis state says the same thing without covering the data.
	 *
	 * Only `documented` ties count here. A reported influence claim rendered in the
	 * same weight as a gazette-recorded appointment would be exactly the collapse this
	 * project exists to prevent — the Network and the entity card are where the weaker
	 * tiers are shown, with their basis attached.
	 */
	const connected = $derived.by(() => {
		const who = app.selected ?? app.hovered;
		if (!who) return null;
		const set = new Set<string>();
		for (const rel of relationshipsByEntity.get(who) ?? []) {
			if (rel.basis !== 'documented') continue;
			set.add(rel.from === who ? rel.to : rel.from);
		}
		set.delete(who);
		return set.size ? set : null;
	});

	function isConnected(pos: Position) {
		return Boolean(connected?.has(pos.holder));
	}

	// --- Interaction ----------------------------------------------------------

	function zoomToEra(id: string) {
		const era = ds.eras.find((e) => e.id === id);
		if (!era) return;
		const pad = (era.interval.endLatest ?? CUTOFF) - era.interval.startEarliest;
		axis.setDomain(
			Math.max(FLOOR, era.interval.startEarliest - pad * 0.05),
			Math.min(CUTOFF, (era.interval.endLatest ?? CUTOFF) + pad * 0.05)
		);
	}

	function showTip(e: MouseEvent, pos: Position) {
		const rect = plotEl?.getBoundingClientRect();
		if (!rect) return;
		tip = { x: e.clientX - rect.left, y: e.clientY - rect.top, pos };
	}

	const zoomed = $derived(domain[0] > FLOOR + 1 || domain[1] < CUTOFF - 1);
</script>

<div class="chronicle">
	<div class="toolbar">
		<span class="eyebrow">{t('nav.chronicle')}</span>
		<p class="hint">{t('chronicle.hint')}</p>
		<div class="era-jump">
			<!-- These zoom the horizontal DOMAIN, which is a different action from the
			     dock's era labels: those move the date, these change what span is
			     visible. Both are useful and they are deliberately not merged. -->
			{#each ds.eras as era (era.id)}
				<Tooltip content={era.thesis}>
					<Button size="xs" variant="outline" tint={era.accent} onclick={() => zoomToEra(era.id)}>
						<i class="era-swatch" style:background={era.accent}></i>
						{nameOf(era)}
					</Button>
				</Tooltip>
			{/each}
			{#if zoomed}
				<Button size="xs" variant="soft" onclick={() => axis.reset()}>
					{t('chronicle.fullrange')}
				</Button>
			{/if}
		</div>
	</div>

	<div class="plot-scroll">
		<!--
			The gesture surface. Offset by the gutter so a pinch or a wheel-zoom anchors
			on the date actually under the pointer rather than on one shifted left by the
			width of the row labels.
		-->
		<div
			class="plot"
			bind:this={plotEl}
			bind:clientWidth={width}
			use:navigableAxis={{ axis, width: () => plotW, offset: () => GUTTER }}
			class:moving={axis.moving}
		>
			<svg {width} height={layout.height} role="presentation">
				<defs>
					<!-- Uncertainty hatch: used for every fuzzy date edge in the chart, so
					     estimated spans are never mistaken for documented ones. -->
					<pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
						<line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-width="1.6" opacity="0.55" />
					</pattern>
					<clipPath id="plot-clip">
						<rect x={GUTTER} y="0" width={plotW} height={layout.height} />
					</clipPath>
					<!-- Keeps row and group names inside the gutter. SVG text cannot
					     ellipsize, so containing it is the only way to stop a long title
					     from being drawn across the tenure bars it labels. -->
					<clipPath id="gutter-clip">
						<rect x="0" y="0" width={GUTTER - 6} height={layout.height} />
					</clipPath>
				</defs>

				<!-- Era bands -->
				<g clip-path="url(#plot-clip)" transform="translate({GUTTER},0)">
					{#each ds.eras as era (era.id)}
						{@const ex = x(era.interval.startEarliest)}
						{@const ew = x(era.interval.endLatest ?? CUTOFF) - ex}
						<rect
							{...{ x: ex, width: Math.max(0, ew) }}
							y="0"
							height={layout.height}
							fill={era.accent}
							opacity="0.045"
						/>
						<!--
							Named only when the band is wide enough to hold the name.

							SVG text cannot ellipsise, so at the default zoom seven era labels
							were drawn overlapping one another into an unreadable smear across
							the top of the chart. Suppressing the ones that do not fit is the
							only honest option here: the era stays identifiable from the band's
							tint and from the era chips in the toolbar, and zooming in brings
							the name back the moment there is room for it.

							Measured rather than estimated — the metrics below must match the
							.era-label rule. See src/lib/viz/measure.ts.
						-->
					{#if fits(nameOf(era), ew, ERA_LABEL_TYPE)}
							<text
								x={ex + 6}
								y="13"
								class="era-label"
								fill={`color-mix(in srgb, ${era.accent} 42%, var(--text-primary))`}
							>
								{nameOf(era)}
							</text>
						{/if}
					{/each}
				</g>

				<!-- Time axis -->
				<g clip-path="url(#plot-clip)" transform="translate({GUTTER},0)">
					{#each decadeTicks as t (t)}
						<line x1={x(t)} x2={x(t)} y1={PAD_T - 8} y2={layout.height} class="grid" />
						<text x={x(t) + 4} y={PAD_T - 12} class="tick-label">
							{new Date(t).getUTCFullYear()}
						</text>
					{/each}
				</g>

				<!-- Ruptures: vertical lines across every row -->
				<g clip-path="url(#plot-clip)" transform="translate({GUTTER},0)">
					{#each ruptures as ev (ev.id)}
						{@const rx = x(ev.interval.startEarliest)}
						<line x1={rx} x2={rx} y1={PAD_T - 10} y2={layout.height} class="rupture-line" />
						<g class="rupture-tag" transform="translate({rx},{PAD_T - 14})">
							<title>{formatDate(ev.interval.startEarliest, 'day')} — {nameOf(ev)}</title>
							<circle r="3" cy="0" class="rupture-dot" />
						</g>
					{/each}
				</g>

				<!-- Rows -->
				{#each layout.items as item (item.kind === 'group' ? 'g-' + item.id : 'r-' + item.roleId)}
					{#if item.kind === 'group'}
						<g transform="translate(0,{item.y})">
							<rect x="0" y="0" width={width} height={GROUP_H} class="group-bg" />
						</g>
					{:else}
						{@const focusedRow = item.positions.some(isFocused)}
						{@const tiedRow = !focusedRow && item.positions.some(isConnected)}
						<!-- Stagger keyed to vertical position so the chart assembles top-down.
						     Derived from y rather than an index because rows are interleaved
						     with group headers, and y is what the eye actually tracks. -->
						<g
							transform="translate(0,{item.y})"
							class="row"
							class:row-focus={focusedRow}
							class:row-tied={tiedRow}
							style:--enter-delay="{Math.min(420, item.y * 0.45)}ms"
						>
							<rect x="0" y="0" width={width} height={ROW_H} class="row-bg" />

							<g clip-path="url(#plot-clip)">
								<g transform="translate({GUTTER},0)">
									{#each item.positions.filter(visible) as pos (pos.id)}
										{@const b = barGeometry(pos)}
										{@const act = activity(pos.interval, app.t)}
										{@const focus = isFocused(pos)}
										{@const tied = !focus && isConnected(pos)}
										{@const dim = anyFocus && !focus && !tied}
										<g
											class="bar"
											class:dim
											class:focus
											class:tied
											style:color={LAYER_COLOR[item.layer]}
											role="button"
											tabindex="0"
											aria-label="{nameOf(personById.get(pos.holder))}, {item.title}, {describeInterval(
												pos.interval
											)}{tied ? ' — documented connection' : ''}"
											onclick={() => app.select(pos.holder)}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													app.select(pos.holder);
												}
											}}
											onmouseenter={(e) => {
												app.hovered = pos.holder;
												showTip(e, pos);
											}}
											onmousemove={(e) => showTip(e, pos)}
											onmouseleave={() => {
												app.hovered = null;
												tip = null;
											}}
										>
											<!--
												Marks a tenure held by someone the selected person is
												documented as connected to. Drawn under the bar so it can
												never obscure the tenure or its hatched, uncertain ends,
												which are the data.
											-->
											{#if tied}
												<line
													x1={b.coreX}
													x2={b.coreX + b.coreW}
													y1={ROW_H - 3}
													y2={ROW_H - 3}
													class="tie-mark"
												/>
											{/if}

											<!-- Uncertainty envelope, before the documented core -->
											{#if b.leadW > 0.6}
												<rect
													x={b.leadX}
													y="6"
													width={b.leadW}
													height={ROW_H - 12}
													fill="url(#hatch)"
													class="fuzz"
												/>
											{/if}
											<!-- Documented core -->
											<rect
												x={b.coreX}
												y="5"
												width={b.coreW}
												height={ROW_H - 10}
												rx="2"
												fill="currentColor"
												fill-opacity={pos.confidence === 'A' ? 0.92 : pos.confidence === 'B' ? 0.7 : 0.45}
												stroke="currentColor"
												stroke-opacity={act === 2 ? 1 : 0.35}
												stroke-width={act === 2 ? 1.4 : 0.8}
												stroke-dasharray={DASH[pos.basis as Basis]}
											/>
											{#if pos.acting}
												<rect
													x={b.coreX}
													y="5"
													width={b.coreW}
													height={ROW_H - 10}
													rx="2"
													fill="url(#hatch)"
													class="acting"
												/>
											{/if}
											<!-- Uncertainty envelope, after the documented core -->
											{#if b.tailW > 0.6}
												<rect
													x={b.tailX}
													y="6"
													width={b.tailW}
													height={ROW_H - 12}
													fill="url(#hatch)"
													class="fuzz"
												/>
											{/if}
											<!-- Name label, only when the bar is wide enough to hold it -->
											{#if b.coreW > 54}
												<text x={b.coreX + 6} y={ROW_H / 2 + 3.5} class="bar-label">
													{nameOf(personById.get(pos.holder)).split(' ').slice(-2).join(' ')}
												</text>
											{/if}
										</g>
									{/each}
								</g>
							</g>
						</g>
					{/if}
				{/each}

				<!-- Gutter mask and playhead -->
				<rect x="0" y="0" width={GUTTER} height={layout.height} class="gutter-mask" />
				<g clip-path="url(#gutter-clip)">
					{#each layout.items as item (item.kind === 'group' ? 'lg-' + item.id : 'lr-' + item.roleId)}
						{#if item.kind === 'group'}
							<g transform="translate(0,{item.y})">
								<rect x="0" y="0" width="3" height={GROUP_H} fill={LAYER_COLOR[item.layer]} opacity="0.8" />
								<text x="14" y={GROUP_H / 2 + 4} class="group-label">{item.label}</text>
							</g>
						{:else}
							{@const focusedRow = item.positions.some(isFocused)}
							{@const tiedRow = !focusedRow && item.positions.some(isConnected)}
							<!-- The single label pass: after the gutter mask, with the row's
							     own stagger and focus/tied colours applied directly (they used
							     to be drawn twice — once under the mask, once above — and the
							     visible copy carried none of this). spec §14.3
							     Truncated with `gutterLabel()` so SVG text never clips mid-word;
							     full title reachable via native <title> tooltip. -->
							<text
								x="24"
								y={item.y + ROW_H / 2 + 4}
								class="row-label"
								class:row-label-focus={focusedRow}
								class:row-label-tied={tiedRow}
								style:--enter-delay="{Math.min(420, item.y * 0.45)}ms"
							><title>{item.title}</title>{gutterLabel(item.title)}</text>
						{/if}
					{/each}
				</g>
				<line x1={GUTTER} x2={GUTTER} y1="0" y2={layout.height} class="gutter-edge" />

				<g clip-path="url(#plot-clip)" transform="translate({GUTTER},0)">
					<line x1={x(app.t)} x2={x(app.t)} y1={PAD_T - 18} y2={layout.height} class="playhead" />
				</g>

			</svg>

			{#if tip}
				{@const person = personById.get(tip.pos.holder)}
				{@const role = roleById.get(tip.pos.role)}
				<div
					class="tooltip"
					style:left="{Math.min(tip.x + 14, width - 300)}px"
					style:top="{tip.y + 16}px"
				>
					<strong>{nameOf(person)}</strong>
					<span class="t-role">{nameOf(role)}</span>
					<span class="t-span mono">{describeInterval(tip.pos.interval)}</span>
					<span class="t-meta">
						<!-- Basis, not the raw confidence letter. What kind of claim this is
						     matters more to a reader than an internal grading code. -->
						<Chip tint={BASIS_COLOR[tip.pos.basis as Basis]} dot>
							{BASIS_SHORT[tip.pos.basis as Basis]}
						</Chip>
						<span class="mono">{durationLabel(tip.pos.years)}</span>
						{#if tip.pos.datesInferred}
							<span class="warn-flag">dates estimated</span>
						{/if}
					</span>
					{#if tip.pos.notes.length}
						<span class="t-note">{tip.pos.notes[0]}</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<details class="a11y">
		<summary>{t('chronicle.table')}</summary>
		<table>
			<caption>Officeholders by post, with the span each source actually supports.</caption>
			<thead>
				<tr><th>Post</th><th>Holder</th><th>Span</th><th>Duration</th><th>Evidence</th></tr>
			</thead>
			<tbody>
				{#each layout.items.filter((i) => i.kind === 'row') as row (row.roleId)}
					{#each (row as Row).positions.filter(visible) as pos (pos.id)}
						<tr>
							<td>{(row as Row).title}</td>
							<td>{nameOf(personById.get(pos.holder))}</td>
							<td>{describeInterval(pos.interval)}</td>
							<td>{durationLabel(pos.years)}</td>
							<td>{pos.confidence}</td>
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	.chronicle {
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
		max-width: 52ch;
	}
	.era-swatch {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.era-jump {
		display: flex;
		gap: var(--s-2);
		margin-inline-start: auto;
		flex-wrap: wrap;
	}
	@media (max-width: 600px) {
		.era-jump {
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			-ms-overflow-style: none;
			padding-bottom: 2px;
		}
		.era-jump::-webkit-scrollbar {
			display: none;
		}
	}
	/* Era-jump buttons are <Button> components now; their appearance lives in the
	   primitive, which is the point of having one. */

	.plot-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.plot {
		position: relative;
		cursor: grab;
		/*
		   `pan-y`, not `none`.

		   The browser keeps vertical scrolling, which this chart needs because it is
		   far taller than the window; everything else — horizontal drag and pinch — is
		   ours. `touch-action: none` would claim the vertical axis too and trap a phone
		   reader inside the plot with no way to reach the rows below it.
		*/
		touch-action: pan-y;
	}
	.plot.moving {
		cursor: grabbing;
	}
	svg {
		display: block;
	}

	.group-bg {
		fill: var(--surface-panel);
	}
	.group-label {
		font-size: 11px;
		font-weight: 500;
		fill: var(--text-primary);
		letter-spacing: 0.02em;
	}
	.row-bg {
		fill: transparent;
	}
	.row:hover .row-bg,
	.row-focus .row-bg {
		fill: color-mix(in srgb, var(--text-primary) 3.5%, transparent);
	}
	/* A row containing a connected tenure stays legible while the rest of the chart
	   recedes, so the reader can read the office as well as see the bar. */
	/* Labels are drawn once, after the gutter mask, so focus/tied styling is
	   applied via a class of their own rather than a .row ancestor. */
	.row-label {
		font-size: 11px;
		fill: var(--text-secondary);
		animation: row-enter var(--dur-slow) var(--ease-out) both;
		animation-delay: var(--enter-delay, 0ms);
	}
	.row-label-tied {
		fill: var(--text-secondary);
	}
	.row-label-focus {
		fill: var(--text-primary);
	}

	.grid {
		stroke: var(--border-subtle);
		stroke-width: 1;
	}
	.tick-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		fill: var(--text-faint);
	}
	.era-label {
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.rupture-line {
		stroke: var(--rupture);
		stroke-width: 1;
		stroke-dasharray: 2 4;
		opacity: 0.5;
	}
	.rupture-dot {
		fill: var(--rupture);
	}
	.rupture-tag {
		cursor: help;
	}

	.playhead {
		stroke: var(--text-primary);
		stroke-width: 1.3;
		opacity: 0.85;
	}

	/* Rows fade up in sequence on mount. The view is keyed on the route, so this
	   plays once on arrival and never re-runs while filtering — a chart that
	   re-animates every time you move a control is unusable. */
	.row {
		animation: row-enter var(--dur-slow) var(--ease-out) both;
		animation-delay: var(--enter-delay, 0ms);
	}
	/* Opacity only. These groups position themselves with a `transform` ATTRIBUTE,
	   and a CSS transform overrides it — animating translate here would collapse
	   every row to the top of the chart. */
	@keyframes row-enter {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.row,
		.row-label {
			animation: none;
		}
	}

	.bar {
		cursor: pointer;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.bar.dim {
		opacity: 0.24;
	}
	.bar.focus {
		opacity: 1;
	}
	/*
	   The third state: someone the selected person is documented as connected to.

	   It has to read as clearly between focused and dimmed, and it must not be
	   mistakable for the selection itself — so it keeps its own layer colour and full
	   opacity but is marked rather than highlighted. The dotted underline is the mark;
	   it sits below the bar so it never obscures the tenure or its hatched, uncertain
	   ends, which are the data.
	*/
	.bar.tied {
		opacity: 0.92;
	}
	.tie-mark {
		stroke: var(--text-primary);
		stroke-width: 1.2;
		stroke-dasharray: 1.5 2;
		opacity: 0.75;
	}
	.bar .fuzz {
		pointer-events: none;
	}
	.bar .acting {
		opacity: 0.5;
		pointer-events: none;
	}
	.bar-label {
		font-size: 10px;
		fill: var(--accent-text);
		font-weight: 500;
		pointer-events: none;
	}
	.bar.dim .bar-label {
		fill: var(--text-primary);
	}

	.gutter-mask {
		fill: var(--surface-base);
	}
	.gutter-edge {
		stroke: var(--border-subtle);
		stroke-width: 1;
	}

	.tooltip {
		position: absolute;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 3px;
		width: 288px;
		padding: 9px 11px;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		box-shadow: var(--elev-3);
		pointer-events: none;
		font-size: var(--t-sm);
	}
	.tooltip strong {
		font-weight: 500;
		font-size: var(--t-base);
	}
	.t-role {
		color: var(--text-secondary);
		font-size: var(--t-sm);
	}
	.t-span {
		font-size: var(--t-xs);
		color: var(--accent);
	}
	.t-meta {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: var(--t-xs);
		color: var(--text-faint);
		margin-top: 2px;
	}
	.t-note {
		margin-top: 4px;
		padding-top: 5px;
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		line-height: 1.45;
	}

	.a11y {
		border-top: 1px solid var(--border-subtle);
		padding: 10px 18px;
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.a11y summary {
		cursor: pointer;
		font-size: var(--t-sm);
	}
	.a11y table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 10px;
		font-size: var(--t-sm);
	}
	.a11y caption {
		text-align: start;
		color: var(--text-faint);
		font-size: var(--t-xs);
		padding-bottom: 6px;
	}
	.a11y th,
	.a11y td {
		text-align: start;
		padding: 3px 10px 3px 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.a11y th {
		color: var(--text-faint);
		font-weight: 400;
		font-size: var(--t-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
</style>
