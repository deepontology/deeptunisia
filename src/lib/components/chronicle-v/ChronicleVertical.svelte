<script lang="ts">
	/* =========================================================================
	   The vertical Chronicle. Skeleton and scale.

	   WHAT THIS FILE IS

	   Below the compact breakpoint the Chronicle turns: time runs down the
	   screen, oldest at the top, one column per post in a single layer, and the
	   reader scrolls the canvas instead of zooming an axis. This file owns that
	   layout, the zoom ladder, and the four pieces of state the children read.
	   The children themselves are built by their own waves; each is rendered
	   through the imports below and is a placeholder until then.

	   THE CHILDREN'S CONTRACTS — implement these, nothing else

	     LayerTabs   { layers: { id: Layer; label: string; count: number; marked: boolean }[];
	                  active: Layer; onchange(l: Layer): void }
	                 One layer at a time here, not the chart's multi-select.
	                 `marked` = while an event is focused, this (inactive) layer
	                 holds a post linked to it. `count` = posts in the layer. The tabs are the
	                 parent's standing head, above the scroller; only the column
	                 headers move with the canvas.

	     ColumnStrip { children: Snippet }
	                 The horizontal track of columns. The parent's scroller
	                 (`.cv-strip`) is the scroll container for both axes and is the
	                 element handed to ReadingLine as `scroller`; nothing inside the
	                 strip may become a scroll container of its own, or the sticky
	                 column headers would stick to it instead of to the top of the
	                 canvas. The root must be `width: max-content` so the columns
	                 overflow the scroller. The canvas height arrives as the `--cv-h`
	                 custom property, set by the parent on its stage element.

	     Column      { row: ChronRow; scale: VScale; focus: 'none' | 'linked' | 'dim';
	                  basisFloor: Basis; onselect(personId: string): void }
	                 One post. `focus` is the event cross-highlight: while an event
	                 is focused, 'linked' when the event links to this post
	                 (`buildEventLinks`), 'dim' otherwise. With no event focused, a
	                 person selected or hovered anywhere plays the same part. 'none'
	                 when nothing is focused. Its sticky header must paint above the reading
	                 line — a z-index token above `--z-view` does it.

	     Spine       { scale: VScale; events: EventRec[]; onpick(eventIds: string[]): void }
	                 The year ruler, pinned to the inline-start edge. Ticks come
	                 from `scale.ticks()`. `events` is every event clearing the
	                 reader's evidence floor, oldest first, for the marks the spine
	                 carries.

	     RuptureRule { event: EventRec; scale: VScale; onpick(eventIds: string[]): void }
	                 One rupture, spanning the whole strip, at the date its sources
	                 give it. Colour comes from the rupture token.

	     ReadingLine { scale: VScale; scroller: HTMLElement }
	                 The instant at 40% of the scroller's height. It is the two-way
	                 link between scroll position and `app.t`: scrolling moves the
	                 shared date, a change to the shared date moves the scroll.
	                 `scroller` is the element the parent scrolls, not the page.

	     TenureList  { groups: ChronGroup[]; basisFloor: Basis }
	                 The chart's table alternative, chronological, for a reader who
	                 is not reading a chart. The canvas is not a substitute for it.

	   EPISTEMICS. Basis is never flattened: the four tiers keep their own colour,
	   dash and opacity, and the reader's `app.basisFloor` decides which postings
	   and events reach the canvas at all. The children import DASH, BASIS_COLOR,
	   BASIS_OPACITY and meetsBasis from model.ts; so does anything added here.
	   ========================================================================= */

	import { app } from '$lib/state.svelte';
	import { applyEntityLink } from '$lib/deeplink.svelte';
	import AboutView from '$lib/shell/AboutView.svelte';
	import Popover from '$lib/ui/Popover.svelte';
	import { layerLabel, nameOf, t, tf } from '$lib/t.svelte';
	import {
		CUTOFF,
		LAYERS,
		ds,
		eventById,
		meetsBasis,
		type EventRec,
		type Layer
	} from '$lib/model';
	import { buildGroups, type ChronGroup, type ChronRow } from '$lib/chronicle/rows';
	import { buildEventLinks } from '$lib/chronicle/links';
	import { V_DEFAULT, makeVScale, stepLevel, type VScale } from '$lib/chronicle/vscale';
	import LayerTabs from '$lib/components/chronicle-v/LayerTabs.svelte';
	import ColumnStrip from '$lib/components/chronicle-v/ColumnStrip.svelte';
	import Column from '$lib/components/chronicle-v/Column.svelte';
	import Spine from '$lib/components/chronicle-v/Spine.svelte';
	import RuptureRule from '$lib/components/chronicle-v/RuptureRule.svelte';
	import ReadingLine from '$lib/components/chronicle-v/ReadingLine.svelte';
	import TenureList from '$lib/components/chronicle-v/TenureList.svelte';

	/** The reading line rides this far into the scroller's height. */
	const LINE_AT = 0.4;

	/**
	 * The domain: the first era to the dataset's own horizon. Both ends come from
	 * the build, so the canvas can never claim a range the data does not cover.
	 */
	const FIRST_ERA_START = Math.min(...ds.eras.map((e) => e.interval.startEarliest));
	const domain: [number, number] = [FIRST_ERA_START, CUTOFF];

	/**
	 * Rows by layer, from the tested grouping. `buildGroups` groups by institution
	 * and orders institutions by their own `order`, so the columns come out in the
	 * dataset's order rather than in whatever order the roles file happens to list.
	 */
	const rowsByLayer = $derived.by(() => {
		const groups = buildGroups({
			institutions: ds.institutions,
			roles: ds.roles,
			positions: ds.positions,
			activeLayers: app.activeLayers,
			nameOf
		});
		const m = new Map<Layer, { groups: ChronGroup[]; rows: ChronRow[] }>();
		for (const g of groups) {
			const entry = m.get(g.layer) ?? { groups: [], rows: [] };
			entry.groups.push(g);
			entry.rows.push(...g.rows);
			m.set(g.layer, entry);
		}
		return m;
	});


	/** The layer the canvas opens on. The effect below moves off it if it has no post. */
	let layer = $state<Layer>('political');
	/** Pixels per year, one of `V_LEVELS`. */
	let pxPerYear = $state(V_DEFAULT);
	/*
	 * The focused event is the open record, when the open record is an event. Following
	 * a cause or consequence moves the record, so the highlight moves with it. Closing the
	 * sheet or opening a person ends the focus, with no separate state to clear.
	 */
	const focusEventId = $derived(app.selected && eventById.has(app.selected) ? app.selected : null);
	/** The chart is a chart; the list is its table alternative. */
	let listMode = $state(false);

	/** Event to post links, built once from the dataset. */
	const links = buildEventLinks({
		events: ds.events,
		roles: ds.roles,
		positions: ds.positions,
		people: ds.people,
		institutions: ds.institutions,
		cutoff: CUTOFF
	});

	/** The posts the focused event links to, or null when no event is focused. */
	const focusRoles = $derived<Set<string> | null>(
		focusEventId ? (links.byEvent.get(focusEventId)?.roleIds ?? new Set<string>()) : null
	);

	/**
	 * Layers other than the open one that hold a post linked to the focused event.
	 * The view shows one layer at a time, so the tab is where the reader learns
	 * the event reaches a layer they are not looking at.
	 */
	const markedLayers = $derived.by(() => {
		const s = new Set<Layer>();
		if (!focusRoles) return s;
		for (const [l, entry] of rowsByLayer) {
			if (l !== layer && entry.rows.some((r) => focusRoles.has(r.roleId))) s.add(l);
		}
		return s;
	});

	const tabLayers = $derived(
		LAYERS.filter((l) => rowsByLayer.has(l)).map((l) => ({
			id: l,
			label: layerLabel(l),
			count: rowsByLayer.get(l)!.rows.length,
			marked: markedLayers.has(l)
		}))
	);

	const rows = $derived(rowsByLayer.get(layer)?.rows ?? []);
	const layerGroups = $derived(rowsByLayer.get(layer)?.groups ?? []);

	/** The stage's height. The canvas runs on past both ends of the domain by the
	 *  room the reading line needs to reach the first and last instants. */
	let stageH = $state(0);
	const vscale = $derived<VScale>(
		makeVScale(domain, pxPerYear, { before: stageH * LINE_AT, after: stageH * (1 - LINE_AT) })
	);

	/** Every event clearing the reader's evidence floor, oldest first. */
	const spineEvents = $derived(
		[...ds.events]
			.filter((e) => meetsBasis(e.basis, app.basisFloor))
			.sort((a, b) => a.interval.startEarliest - b.interval.startEarliest)
	);
	const ruptureEvents = $derived(spineEvents.filter((e) => e.rupture));
	const focusEvent = $derived<EventRec | null>(
		focusEventId ? eventById.get(focusEventId) ?? null : null
	);

	let stripEl = $state<HTMLDivElement | null>(null);
	let anchor = $state<number | null>(null);
	let centred = false;

	/**
	 * A layer with no post to draw cannot stay open — the reader would be looking
	 * at a blank canvas with no way to tell why. Move to one that has posts.
	 */
	$effect(() => {
		const next = rowsByLayer.get(layer);
		if (next !== undefined && next.rows.length > 0) return;
		const fallback = [...rowsByLayer.entries()].find(([, v]) => v.rows.length > 0);
		if (fallback && fallback[0] !== layer) layer = fallback[0];
	});

	/**
	 * Climb the ladder with the reading-line date held still on screen. Without it,
	 * zooming moves the instant out from under the reader's eye and the control
	 * reads as a jump rather than a zoom.
	 */
	function zoom(dir: 1 | -1) {
		const next = stepLevel(pxPerYear, dir);
		if (next === pxPerYear) return;
		anchor = vscale.y(app.t) - (stripEl?.scrollTop ?? 0);
		pxPerYear = next;
	}

	$effect(() => {
		if (!stripEl) return;
		const a = anchor;
		if (a !== null) {
			// The new scale is already in the DOM, so the mapping is the new one.
			stripEl.scrollTop = Math.max(0, vscale.y(app.t) - a);
			anchor = null;
			return;
		}
		if (!centred) {
			// Open with the reading line on the shared date rather than at the top of
			// the canvas, so this view starts in agreement with the rest of the app.
			stripEl.scrollTop = Math.max(0, vscale.y(app.t) - stripEl.clientHeight * LINE_AT);
			centred = true;
		}
	});

	/** A picked event is opened in the record panel, which focuses it here. */
	function pickEvents(ids: string[]) {
		if (ids.length !== 1) return;
		app.select(ids[0]);
	}

	/*
	 * A shared link (`/chronicle?id=…`) opens its record here as it does on the
	 * wide chart. An event link also focuses the event and brings its date under
	 * the reading line, so the reader lands where the link points.
	 */
	let deepLinked = false;
	$effect(() => {
		if (deepLinked || !applyEntityLink()) return;
		deepLinked = true;
		const ev = app.selected ? eventById.get(app.selected) : undefined;
		if (ev) app.t = ev.interval.startEarliest;
	});

	/** View options: about, scale and the list. One button on the standing row. */
	let optionsOpen = $state(false);

	function focusFor(row: ChronRow): 'none' | 'linked' | 'dim' {
		if (focusRoles) return focusRoles.has(row.roleId) ? 'linked' : 'dim';
		const key = app.selected ?? app.hovered;
		if (!key) return 'none';
		return row.positions.some((p) => p.holder === key) ? 'linked' : 'dim';
	}
</script>

<div class="cv">
	<!-- The standing head. The tabs do not scroll away, because they are the
	     reader's only way through the layer they are in. -->
	<div class="cv-head">
		<div class="cv-tabs">
			<LayerTabs layers={tabLayers} active={layer} onchange={(l) => (layer = l)} />
		</div>
		<div class="anchor">
			<button
				type="button"
				class="cv-btn cv-opts"
				class:on={listMode}
				aria-label={t('chronicle.vertical.options')}
				aria-expanded={optionsOpen}
				onclick={() => (optionsOpen = !optionsOpen)}
			>
				<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
					<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
					<circle cx="5" cy="4" r="1.6" fill="var(--surface-sunken)" stroke="currentColor" stroke-width="1.3" />
					<circle cx="11" cy="8" r="1.6" fill="var(--surface-sunken)" stroke="currentColor" stroke-width="1.3" />
					<circle cx="7" cy="12" r="1.6" fill="var(--surface-sunken)" stroke="currentColor" stroke-width="1.3" />
				</svg>
			</button>
			<Popover bind:open={optionsOpen} onclose={() => (optionsOpen = false)} label={t('chronicle.vertical.options')}>
				<div class="cv-sheet">
					<AboutView hint={t('chronicle.hint')} expanded />
					<div class="cv-sheet-row">
						<span class="cv-sheet-label">{t('chronicle.vertical.scale')}</span>
						<div class="cv-zoom" role="group" aria-label={tf('chronicle.vertical.level', { n: pxPerYear })}>
							<button
								type="button"
								class="cv-btn cv-num"
								aria-label={t('view.zoomout')}
								disabled={listMode || stepLevel(pxPerYear, -1) === pxPerYear}
								onclick={() => zoom(-1)}
							>
								&#8722;
							</button>
							<span class="cv-level mono">{tf('chronicle.vertical.level', { n: pxPerYear })}</span>
							<button
								type="button"
								class="cv-btn cv-num"
								aria-label={t('view.zoomin')}
								disabled={listMode || stepLevel(pxPerYear, 1) === pxPerYear}
								onclick={() => zoom(1)}
							>
								+
							</button>
						</div>
					</div>
					<button
						type="button"
						class="cv-btn cv-toggle"
						aria-pressed={listMode}
						onclick={() => {
							listMode = !listMode;
							optionsOpen = false;
						}}
					>
						{t('timeline.viewlist')}
					</button>
				</div>
			</Popover>
		</div>
	</div>

	{#if listMode}
		<div class="cv-list">
			<TenureList groups={layerGroups} basisFloor={app.basisFloor} events={spineEvents} />
		</div>
	{:else}
		<div class="cv-stage" style:--cv-h="{vscale.height}px" style:--cv-n={rows.length} bind:clientHeight={stageH}>
			<div class="cv-strip" bind:this={stripEl}>
				<ColumnStrip>
					<Spine scale={vscale} events={spineEvents} onpick={pickEvents} />
					{#if focusEvent}
						<div class="cv-focus" style:top="{vscale.y(focusEvent.interval.startEarliest)}px"></div>
					{/if}
					{#each ruptureEvents as ev (ev.id)}
						<RuptureRule event={ev} scale={vscale} />
					{/each}
					{#each rows as row (row.roleId)}
						<Column
							{row}
							scale={vscale}
							focus={focusFor(row)}
							basisFloor={app.basisFloor}
							onselect={(id) => app.select(id)}
						/>
					{/each}
				</ColumnStrip>
			</div>
			<div class="cv-line">
				<ReadingLine scale={vscale} scroller={stripEl} events={spineEvents} />
			</div>
		</div>
	{/if}
</div>

<style>
	.cv {
		/* Its own stacking context: the spine, headers and rules layer among
		   themselves and never above the app's sheets and dock. */
		isolation: isolate;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		/* The canvas owns its scroll; the page never gains one. */
		overflow: hidden;
	}

	/* One standing row: the layers, and one button for everything else. */
	.cv-head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-2) calc(var(--s-3) + var(--safe-r)) var(--s-2) calc(var(--s-3) + var(--safe-l));
		border-bottom: var(--rule);
		background: var(--surface-base);
	}
	.cv-tabs {
		flex: 1;
		min-width: 0;
	}
	.anchor {
		position: relative;
		flex: 0 0 auto;
	}
	.cv-opts.on {
		color: var(--accent);
		border-color: var(--accent-border);
	}

	.cv-sheet {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: var(--s-2) var(--s-1) var(--s-4);
	}
	.cv-sheet-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.cv-sheet-label {
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}

	.cv-zoom {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
	}

	.cv-btn {
		min-width: var(--tap);
		min-height: var(--tap);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--r-md);
		border: var(--rule);
		color: var(--text-secondary);
		background: var(--surface-sunken);
		transition:
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}
	.cv-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	.cv-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.cv-num {
		font-size: var(--t-lg);
		line-height: 1;
	}
	.cv-toggle {
		padding-inline: var(--s-4);
		font-size: var(--t-sm);
	}
	.cv-toggle[aria-pressed='true'] {
		color: var(--accent);
		border-color: var(--accent-border);
		background: var(--accent-muted);
	}

	.cv-level {
		min-width: 7.5em;
		display: inline-flex;
		align-items: baseline;
		justify-content: center;
		padding-block: var(--s-2);
		border-radius: var(--r-md);
		border: var(--rule);
		background: var(--surface-sunken);
		font-size: var(--t-sm);
		color: var(--text-primary);
	}

	.cv-stage {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		/*
		   The width of every column together, for the lines that cross them all
		   (ruptures, the focused event). The track is only one window wide and the
		   columns run past it, so "100%" would stop a line at the window's edge.
		   Same formula as ColumnStrip's columns; the percentage resolves where the
		   property is used, against the track.
		*/
		--cv-track-w: calc(var(--cv-spine-w) + var(--cv-n, 0) * max(var(--cv-col-min), (100% - var(--cv-spine-w)) / 3));
	}

	.cv-strip {
		position: absolute;
		inset: 0;
		overflow: auto;
		/* Columns come to rest on their own edge, beside the sticky spine. */
		scroll-snap-type: x mandatory;
		scroll-padding-inline-start: var(--cv-spine-w);
		overscroll-behavior: contain;
	}

	/*
	   The line is a sibling of the scroller rather than a child of it, so it can
	   sit at 40% of the scroller's HEIGHT. A sticky child inside the canvas cannot
	   express that: its containing block is the whole track, and a percentage
	   there is a percentage of 2,800 pixels rather than of the window.
	 */
	.cv-line {
		position: absolute;
		inset-inline: 0;
		top: 40%;
		z-index: var(--z-view);
		pointer-events: none;
	}

	/*
	   The rupture rule the reader picked, drawn over the canvas so the pick is
	   visible without opening anything. The rule itself belongs to its own
	   component; this is only the state being shown.
	 */
	.cv-focus {
		position: absolute;
		inset-inline-start: 0;
		width: max(100%, var(--cv-track-w));
		height: 2px;
		z-index: var(--z-sheet);
		background: var(--accent);
		pointer-events: none;
	}

	.cv-list {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	@media (prefers-reduced-motion: reduce) {
		.cv-btn {
			transition: none;
		}
	}
</style>
