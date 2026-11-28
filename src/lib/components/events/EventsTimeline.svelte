<script lang="ts">
	import { browser } from '$app/environment';
	import { tick, untrack } from 'svelte';
	import { AxisCamera, navigableAxis } from '$lib/viz/axis.svelte';
	import { fits, textWidth } from '$lib/viz/measure';
	import { app } from '$lib/state.svelte';
	import { t, tf, formatDate } from '$lib/t.svelte';
	import { eventTitle, nameOf } from '$lib/names.svelte';
	import { BASIS_COLOR, BASIS_OPACITY, CUTOFF, ds, eventById, type Basis, type EventRec } from '$lib/model';
	import {
		axisTicks as ticksFor,
		chainOf,
		clusterRange,
		eventEnd,
		eventInDomain,
		fitText,
		isLongSpan,
		linkedIds
	} from '$lib/chronicle/events';
	import { DOMAIN_MIN, LAST_YEAR, ew, lensStart, type EventsView } from './view.svelte';

	/**
	 * The events timeline: every event on one linear time axis, one row each.
	 *
	 * This is the view the Chronicle used to open when its events band was
	 * expanded. It lives on its own page now, so it has the whole window: no
	 * tenure rows below it, and its own filters above. What it keeps is the
	 * reading model that made it useful there:
	 *
	 *   - one row per event or cluster, in date order, named in the gutter with
	 *     its date and title, so simultaneous events separate and can be read;
	 *   - events whose anchors fall within a few pixels of each other aggregate
	 *     into a counted badge, and zooming splits them back apart; ruptures and
	 *     long spans always stay individual, being the backbone and the duration;
	 *   - selection is the app's (`app.select`), so the Inspector opens the record
	 *     and a selected event traces its causes (dashed) and consequences (solid)
	 *     between rows;
	 *   - the axis camera is the shared one: wheel, pinch, drag and flick.
	 *
	 * The rows can run to a few thousand pixels at full range, so only the band
	 * inside the scroll container (plus a margin) is in the document, as on the
	 * Chronicle. Every row is still addressable by its `y`.
	 */

	let { view }: { view: EventsView } = $props();

	const ROW_H = 20;
	const PAD_T = 30;
	const ROWS_T = PAD_T + 14;
	const PAD_B = 16;
	const MIN_W = 6;
	const CLUSTER_PX = 14;
	const DOT_PX = 7;
	const GL_X = 14;
	const DAY = 86_400_000;

	/** Must match `.era-label`, or the fit test lies about the render. */
	const ERA_LABEL_TYPE = { size: 9, family: 'JetBrains Mono, monospace', tracking: 0.1, uppercase: true };
	/** Must match `.gl-title` (11px Inter). */
	const TITLE_TYPE = { size: 11, family: 'Inter, system-ui, -apple-system, sans-serif', weight: 400 };
	/** Must match `.gl-date` (10px JetBrains Mono). */
	const DATE_TYPE = { size: 10, family: 'JetBrains Mono, monospace' };

	let plotEl = $state<HTMLDivElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let width = $state(1100);

	const GUTTER = $derived(width < 640 ? Math.max(140, Math.round(width * 0.45)) : 300);
	const plotW = $derived(Math.max(200, width - GUTTER));

	/*
	 * The window. A month and a half is as far in as it goes: at that zoom the
	 * densest stretch of the record (2026) separates into single days.
	 */
	const axis = new AxisCamera({ min: DOMAIN_MIN, max: CUTOFF, minSpan: 45 * DAY });
	untrack(() => axis.setDomain(lensStart(view.lens), CUTOFF));

	/*
	 * A year preset moves the window; a pan or zoom moves the preset. The two
	 * directions are kept apart on purpose: the window follows `lensSeq`, which
	 * only a preset bumps, so writing the lens back from a pan never snaps the
	 * window to the first of January.
	 */
	let seenSeq = untrack(() => view.lensSeq);
	$effect(() => {
		const seq = view.lensSeq;
		if (seq === seenSeq) return;
		seenSeq = seq;
		const y = untrack(() => view.lens);
		axis.setDomain(lensStart(y), CUTOFF);
	});
	$effect(() => {
		const d0 = axis.d0;
		if (axis.moving) return;
		const y = Math.min(LAST_YEAR, new Date(d0).getUTCFullYear());
		untrack(() => {
			if (view.lens !== y) view.lens = y;
			view.atCutoff = axis.d1 >= CUTOFF - DAY;
		});
	});

	const domain = $derived<[number, number]>([axis.d0, axis.d1]);
	const span = $derived(Math.max(1, domain[1] - domain[0]));
	const x = $derived((tm: number) => ((tm - domain[0]) / span) * plotW);
	const invX = $derived((px: number) => domain[0] + (px / plotW) * span);

	// --- What is drawn --------------------------------------------------------

	const eventsSorted = [...ds.events].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);

	const passing = $derived(eventsSorted.filter((e) => view.passes(e, app.basisFloor)));
	const inWindow = $derived(passing.filter((e) => eventInDomain(e, domain[0], domain[1])));

	$effect(() => {
		const n = inWindow.length;
		untrack(() => {
			if (view.shown !== n) view.shown = n;
		});
	});

	interface Item {
		event: EventRec;
		x0: number;
		x1: number;
		y: number;
	}
	interface Cluster {
		members: EventRec[];
		x0: number;
		x1: number;
		y: number;
	}

	function xRange(e: EventRec): { x0: number; x1: number } {
		const x0 = x(e.interval.startEarliest);
		return { x0, x1: Math.max(x0 + MIN_W, x(eventEnd(e))) };
	}

	function badgeW(n: number): number {
		return Math.max(18, Math.min(38, 14 + String(n).length * 7));
	}

	/**
	 * Cluster, then lay out: one row per event or cluster, in date order. The
	 * gutter carries each row's label, so a row never holds two things to name.
	 */
	const layout = $derived.by(() => {
		const anchored = inWindow
			.map((e) => {
				const r = xRange(e);
				return { event: e, ...r, anchor: (r.x0 + r.x1) / 2 };
			})
			.sort((a, b) => a.anchor - b.anchor);
		const nodes: ({ event: EventRec; x0: number; x1: number } | { members: EventRec[]; x0: number; x1: number })[] = [];
		let group: typeof anchored = [];
		const flush = () => {
			if (group.length === 1) nodes.push({ event: group[0].event, x0: group[0].x0, x1: group[0].x1 });
			else if (group.length > 1) {
				const raw = group.reduce((s, g) => s + g.anchor, 0) / group.length;
				const w = badgeW(group.length);
				// Keep the badge inside the plot: a dense pile at the right edge
				// (the present) would otherwise be drawn half off the clip.
				const cx = Math.min(Math.max(raw, w / 2), Math.max(w / 2, plotW - w / 2));
				nodes.push({ members: group.map((g) => g.event), x0: cx - w / 2, x1: cx + w / 2 });
			}
			group = [];
		};
		let last = -Infinity;
		for (const m of anchored) {
			if (m.event.rupture || isLongSpan(m.event)) {
				flush();
				nodes.push({ event: m.event, x0: m.x0, x1: m.x1 });
				last = m.anchor;
				continue;
			}
			if (group.length && m.anchor - last > CLUSTER_PX) flush();
			group.push(m);
			last = m.anchor;
		}
		flush();
		nodes.sort((a, b) => a.x0 - b.x0);
		const items: Item[] = [];
		const clusters: Cluster[] = [];
		nodes.forEach((n, row) => {
			const y = ROWS_T + row * ROW_H + ROW_H / 2;
			if ('members' in n) clusters.push({ members: n.members, x0: n.x0, x1: n.x1, y });
			else items.push({ event: n.event, x0: n.x0, x1: n.x1, y });
		});
		return {
			items,
			clusters,
			rows: nodes.length,
			height: ROWS_T + Math.max(1, nodes.length) * ROW_H + PAD_B,
			byEvent: new Map(items.map((i) => [i.event.id, i])),
			clusterOf: new Map(clusters.flatMap((c) => c.members.map((m) => [m.id, c] as const)))
		};
	});

	/**
	 * Gutter labels, one per row: the date in mono, then the title shortened with
	 * "…" to what the gutter affords (measured, not estimated). The full title
	 * stays in the native tooltip and the spoken label.
	 */
	interface Label {
		key: string;
		y: number;
		date: string;
		title: string;
		/** The date's measured width, so the title starts just after it. */
		dateW: number;
		full: string;
		event: EventRec | null;
		members: EventRec[] | null;
	}
	const labels = $derived.by((): Label[] => {
		const precision = span / (365.2425 * DAY) > 3 ? 'month' : 'day';
		const dw = (date: string) => Math.ceil(textWidth(date, DATE_TYPE)) + 2;
		const room = (date: string) => GUTTER - GL_X - 10 - dw(date) - 8;
		const out: Label[] = [];
		for (const it of layout.items) {
			const date = formatDate(it.event.interval.startEarliest, precision);
			const full = eventTitle(it.event);
			out.push({ key: 'e-' + it.event.id, y: it.y, date, dateW: dw(date), title: fitText(full, room(date), TITLE_TYPE) || '…', full, event: it.event, members: null });
		}
		for (const c of layout.clusters) {
			const date = formatDate(Math.min(...c.members.map((m) => m.interval.startEarliest)), precision);
			const full = tf('chronicle.vertical.spine.cluster', { n: c.members.length, range: clusterRange(c.members) });
			out.push({ key: 'c-' + c.members[0].id, y: c.y, date, dateW: dw(date), title: fitText(full, room(date), TITLE_TYPE) || '…', full, event: null, members: c.members });
		}
		return out.sort((a, b) => a.y - b.y);
	});

	// --- The drawn window -----------------------------------------------------

	const WINDOW_MARGIN = 800;
	let win = $state({ top: 0, bottom: 1400 });

	const itemsInView = $derived(layout.items.filter((it) => it.y >= win.top && it.y <= win.bottom));
	const clustersInView = $derived(layout.clusters.filter((c) => c.y >= win.top && c.y <= win.bottom));
	const labelsInView = $derived(labels.filter((g) => g.y >= win.top && g.y <= win.bottom));

	$effect(() => {
		const el = scrollEl;
		if (!browser || !el) return;
		let queued = false;
		const measure = () => {
			queued = false;
			const top = Math.max(0, el.scrollTop - WINDOW_MARGIN);
			const bottom = el.scrollTop + el.clientHeight + WINDOW_MARGIN;
			const prev = untrack(() => win);
			if (top !== prev.top || bottom !== prev.bottom) win = { top, bottom };
		};
		const onScroll = () => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(measure);
		};
		measure();
		el.addEventListener('scroll', onScroll, { passive: true });
		const ro = new ResizeObserver(onScroll);
		ro.observe(el);
		return () => {
			el.removeEventListener('scroll', onScroll);
			ro.disconnect();
		};
	});

	/** The band around a y that must be drawn so a row can be focused. */
	function ensureDrawn(y: number) {
		if (y >= win.top + 160 && y <= win.bottom - 160) return;
		win = { top: Math.max(0, Math.min(win.top, y - WINDOW_MARGIN)), bottom: Math.max(win.bottom, y + WINDOW_MARGIN) };
	}

	// --- Selection, hover and the causal chain -------------------------------

	const selected = $derived(app.selected ? (eventById.get(app.selected) ?? null) : null);
	let hoverId = $state<string | null>(null);
	const linked = $derived(linkedIds(selected, ds.events));
	const chain = $derived(chainOf(selected, ds.events));

	/*
	 * A selected event outside the window, or swallowed by a cluster, cannot be
	 * seen; the reader picked it from a link, a search or the other face. Bring
	 * it into view once per selection: widen the window to its year if it lies
	 * before it, and scroll its row (or its cluster's row) to the middle.
	 */
	let broughtFor: string | null = null;
	$effect(() => {
		const sel = selected;
		if (!sel || sel.id === broughtFor || !scrollEl) return;
		broughtFor = sel.id;
		untrack(() => {
			if (!eventInDomain(sel, axis.d0, axis.d1)) {
				const y = new Date(sel.interval.startEarliest).getUTCFullYear();
				view.setLens(Math.min(y, view.lens));
			}
		});
		tick().then(() => {
			const row = layout.byEvent.get(sel.id) ?? layout.clusterOf.get(sel.id);
			const el = scrollEl;
			if (!row || !el) return;
			const top = row.y - el.clientHeight / 2;
			if (row.y < el.scrollTop + 40 || row.y > el.scrollTop + el.clientHeight - 40) {
				el.scrollTo({ top: Math.max(0, top) });
			}
		});
	});

	function dim(e: EventRec): boolean {
		if (selected) return e.id !== selected.id && !linked.has(e.id);
		return false;
	}

	/** Hover preview, positioned in plot coordinates. */
	let tip = $state<{ x: number; y: number; title: string; sub: string } | null>(null);

	function showTip(me: MouseEvent, title: string, sub: string) {
		const r = plotEl?.getBoundingClientRect();
		if (!r) return;
		tip = { x: me.clientX - r.left, y: me.clientY - r.top, title, sub };
	}

	function hideTip() {
		tip = null;
		hoverId = null;
	}

	// --- Clusters -------------------------------------------------------------

	let pop = $state<{ x: number; y: number; members: EventRec[] } | null>(null);
	const POP_W = 340;

	function openCluster(members: EventRec[], clientX: number, clientY: number) {
		const r = plotEl?.getBoundingClientRect();
		if (!r) return;
		pop = {
			x: Math.max(8, Math.min(clientX - r.left, width - POP_W - 8)),
			y: clientY - r.top + 14,
			members: [...members].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest)
		};
		tip = null;
	}

	/** Fit the window to a cluster so its members separate in place. */
	function zoomToCluster(members: EventRec[]) {
		const t0 = Math.min(...members.map((m) => m.interval.startEarliest));
		const t1 = Math.max(...members.map((m) => m.interval.startEarliest));
		const pad = Math.max((t1 - t0) * 0.6, 20 * DAY);
		axis.setDomain(Math.max(DOMAIN_MIN, t0 - pad), Math.min(CUTOFF, t1 + pad));
		pop = null;
	}

	/* The card closes on a press outside it, and on Escape (which it takes, so
	   the shell's Escape does not also close the open record). */
	$effect(() => {
		if (!pop) return;
		const away = (e: PointerEvent) => {
			const el = e.target as Element | null;
			if (el?.closest?.('.pop') || el?.closest?.('[data-cluster]')) return;
			pop = null;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				pop = null;
			}
		};
		document.addEventListener('pointerdown', away, true);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', away, true);
			document.removeEventListener('keydown', esc);
		};
	});

	function pick(row: Label, clientX: number, clientY: number) {
		if (row.event) app.select(row.event.id);
		else if (row.members) openCluster(row.members, clientX, clientY);
	}

	/*
	 * The gutter is the keyboard's way through: one row per stop, and the up and
	 * down arrows walk the rows (drawing the next band first when focus nears the
	 * edge of the drawn window). Enter opens an event or a group.
	 */
	async function onRowKey(ke: KeyboardEvent, row: Label) {
		if (ke.key === 'Enter' || ke.key === ' ') {
			ke.preventDefault();
			const r = (ke.currentTarget as Element).getBoundingClientRect();
			pick(row, r.left + r.width / 2, r.top + r.height / 2);
			return;
		}
		if (ke.key !== 'ArrowDown' && ke.key !== 'ArrowUp') return;
		ke.preventDefault();
		const i = labels.findIndex((l) => l.key === row.key);
		const next = labels[i + (ke.key === 'ArrowDown' ? 1 : -1)];
		if (!next) return;
		ensureDrawn(next.y);
		await tick();
		plotEl?.querySelector<SVGElement>(`[data-row="${next.key}"]`)?.focus();
	}

	function onFocusIn(e: FocusEvent) {
		const host = (e.target as Element | null)?.closest?.('[data-y]') as HTMLElement | null;
		if (host) ensureDrawn(Number(host.dataset.y));
	}

	// --- The axis -------------------------------------------------------------

	const ticks = $derived(ticksFor(domain[0], domain[1], app.locale));
	const spanYears = $derived(span / (365.2425 * DAY));
	const headLabel = $derived(formatDate(app.t, spanYears > 20 ? 'year' : spanYears > 3 ? 'month' : 'day'));
	const headX = $derived(Math.min(Math.max(x(app.t), 32), Math.max(32, plotW - 32)));
	const headIn = $derived(app.t >= domain[0] && app.t <= domain[1]);
	const ruptures = $derived(passing.filter((e) => e.rupture && eventInDomain(e, domain[0], domain[1])));

	let scrubbing = false;
	function timeAt(clientX: number): number {
		const r = plotEl?.getBoundingClientRect();
		if (!r) return app.t;
		return invX(Math.min(plotW, Math.max(0, clientX - r.left - GUTTER)));
	}
	function onAxisDown(e: PointerEvent) {
		scrubbing = true;
		app.playing = false;
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		app.setDate(timeAt(e.clientX));
	}
	function onAxisMove(e: PointerEvent) {
		if (scrubbing) app.setDate(timeAt(e.clientX));
	}
	function onAxisUp(e: PointerEvent) {
		scrubbing = false;
		const el = e.currentTarget as Element;
		if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
	}

	const H = $derived(layout.height);
	/** Arabic: the gutter's words hang from its right edge, and nothing is letter-spaced. */
	const rtl = $derived(app.locale === 'ar');
	/**
	 * A title in a Latin script, set in an Arabic run, keeps its own direction:
	 * first-strong isolation, so a trailing "…" stays at the end of the words it
	 * shortens instead of jumping to their other side.
	 */
	const FSI = String.fromCharCode(0x2068);
	const PDI = String.fromCharCode(0x2069);
	const isolate = (text: string) => FSI + text + PDI;
</script>

<div class="scroll" bind:this={scrollEl} onfocusin={onFocusIn}>
	<!-- The gesture surface, offset by the gutter so a pinch or a wheel anchors
	     on the date under the pointer. -->
	<div
		class="plot"
		bind:this={plotEl}
		bind:clientWidth={width}
		use:navigableAxis={{ axis, width: () => plotW, offset: () => GUTTER }}
		class:moving={axis.moving}
	>
		<svg {width} height={H} role="presentation">
			<defs>
				<clipPath id="ev-plot-clip">
					<rect x="0" y="0" width={plotW} height={H} />
				</clipPath>
				<clipPath id="ev-gutter-clip">
					<rect x="0" y="0" width={GUTTER - 6} height={H} />
				</clipPath>
			</defs>

			<g clip-path="url(#ev-plot-clip)" transform="translate({GUTTER},0)">
				<!-- Era bands, named only where the band can hold the name. -->
				{#each ds.eras as era (era.id)}
					{@const ex = x(era.interval.startEarliest)}
					{@const ew_ = x(era.interval.endLatest ?? CUTOFF) - ex}
					<rect x={ex} width={Math.max(0, ew_)} y="0" height={H} fill={era.accent} opacity="0.045" />
					{#if fits(nameOf(era), ew_, ERA_LABEL_TYPE)}
						<text
							x={ex + 6}
							y="13"
							class="era-label"
							class:joined={rtl}
							direction={rtl ? 'rtl' : 'ltr'}
							text-anchor={rtl ? 'end' : 'start'}
							fill={`color-mix(in srgb, ${era.accent} 42%, var(--text-primary))`}>
							{nameOf(era)}
						</text>
					{/if}
				{/each}

				<!-- Time axis: ticks adapt to the zoom, and the strip is a scrub surface. -->
				{#each ticks as tk (tk.t)}
					<line x1={x(tk.t)} x2={x(tk.t)} y1={PAD_T - 8} y2={H} class="grid" />
					<text x={x(tk.t) + 4} y={PAD_T - 4} class="tick-label" class:major={tk.major}>{tk.label}</text>
				{/each}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<rect
					class="axis-scrub"
					data-no-pan
					data-cursor="scrub"
					x="0"
					y="0"
					width={plotW}
					height={PAD_T - 2}
					onpointerdown={onAxisDown}
					onpointermove={onAxisMove}
					onpointerup={onAxisUp}
					onpointercancel={onAxisUp}
					onlostpointercapture={onAxisUp}
				/>

				<!-- One quiet line per rupture through the rows; the row's diamond is its marker. -->
				{#each ruptures as ev (ev.id)}
					<line x1={x(ev.interval.startEarliest)} x2={x(ev.interval.startEarliest)} y1={PAD_T - 10} y2={H} class="rupture-line" />
				{/each}

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<rect x="0" y={PAD_T} width={plotW} height={H - PAD_T} class="bg" role="presentation" onclick={() => app.select(null)} />

				{#each labelsInView as gl (gl.key)}
					<line x1="0" x2={plotW} y1={gl.y - ROW_H / 2} y2={gl.y - ROW_H / 2} class="row-line" />
				{/each}

				{#if selected}
					{@const from = layout.byEvent.get(selected.id)}
					{#if from}
						{#each chain.causes as l (l.id)}
							{@const to = layout.byEvent.get(l.id)}
							{#if to}
								<path class="link-cause" d="M {from.x0} {from.y} C {from.x0} {from.y + 16}, {to.x0} {to.y - 16}, {to.x0} {to.y}" />
							{/if}
						{/each}
						{#each chain.consequences as l (l.id)}
							{@const to = layout.byEvent.get(l.id)}
							{#if to}
								<path class="link-conseq" d="M {from.x0} {from.y} C {from.x0} {from.y + 16}, {to.x0} {to.y - 16}, {to.x0} {to.y}" />
							{/if}
						{/each}
					{/if}
				{/if}

				{#each itemsInView as it (it.event.id)}
					{@const e = it.event}
					{@const cy = it.y}
					{@const isSel = selected?.id === e.id}
					{@const w = Math.max(0, it.x1 - it.x0)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<g
						class="mark"
						class:dim={dim(e)}
						class:hot={hoverId === e.id}
						role="presentation"
						onclick={() => app.select(e.id)}
						onmouseenter={(me) => {
							hoverId = e.id;
							showTip(me, eventTitle(e), formatDate(e.interval.startEarliest, 'day'));
						}}
						onmouseleave={hideTip}
					>
						{#if e.rupture}
							<rect x={it.x0 - 4.5} y={cy - 4.5} width="9" height="9" transform="rotate(45 {it.x0} {cy})" class="diamond" class:sel={isSel} />
						{:else if isLongSpan(e)}
							<rect x={it.x0} y={cy - 2} width={w} height="4" rx="2" class="spanbar" class:sel={isSel} style:opacity={BASIS_OPACITY[e.basis]} />
						{:else if w >= DOT_PX + MIN_W}
							<rect x={it.x0} y={cy - 5} width={w} height="10" rx="5" class="pill" class:sel={isSel} style:opacity={BASIS_OPACITY[e.basis]} />
						{:else}
							<circle cx={it.x0} {cy} r={isSel ? 5 : 3.5} class="dot" class:sel={isSel} style:opacity={BASIS_OPACITY[e.basis]} />
						{/if}
						{#if e.contested.length}
							<circle cx={it.x0} {cy} r="6.5" class="contested" />
						{/if}
						{#if isSel}
							<circle cx={it.x0} {cy} r="9" class="selring" />
						{/if}
					</g>
				{/each}

				{#each clustersInView as c (c.members[0].id)}
					{@const cx = (c.x0 + c.x1) / 2}
					{@const holdsSel = c.members.some((m) => m.id === selected?.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<g
						class="mark"
						data-cluster
						class:dim={selected !== null && !holdsSel && !c.members.some((m) => linked.has(m.id))}
						role="presentation"
						onclick={(me) => openCluster(c.members, me.clientX, me.clientY)}
						onmouseenter={(me) => showTip(me, tf('chronicle.cluster.count', { n: c.members.length }), clusterRange(c.members))}
						onmouseleave={hideTip}
					>
						<rect x={c.x0} y={c.y - 8} width={Math.max(16, c.x1 - c.x0)} height="16" rx="8" class="cluster" class:sel={holdsSel} />
						<text x={cx} y={c.y + 3.5} class="cluster-count">{c.members.length}</text>
					</g>
				{/each}
			</g>

			<!-- The gutter: a mask, then one label per row. The label is the row's
			     keyboard stop and its spoken name. -->
			<rect x="0" y="0" width={GUTTER} height={H} class="gutter-mask" />
			<g clip-path="url(#ev-gutter-clip)">
				{#each labelsInView as gl (gl.key)}
					{@const sel = gl.event !== null && selected?.id === gl.event.id}
					<g
						class="gl"
						data-y={gl.y}
						data-row={gl.key}
						data-cluster={gl.members ? '' : undefined}
						class:sel
						class:rupture={gl.event?.rupture ?? false}
						class:dim={gl.event ? dim(gl.event) : false}
						data-no-pan
						role="button"
						tabindex="0"
						aria-label="{gl.full}, {gl.date}"
						onclick={(me) => pick(gl, me.clientX, me.clientY)}
						onmouseenter={() => (hoverId = gl.event?.id ?? null)}
						onmouseleave={() => (hoverId = null)}
						onkeydown={(ke) => onRowKey(ke, gl)}
					>
						<title>{gl.date} · {gl.full}</title>
						<rect x="2" y={gl.y - ROW_H / 2} width={GUTTER - 6} height={ROW_H} class="gl-hit" />
						<!-- Two runs, not two tspans of one: a date and a title in
						     different scripts would otherwise be reordered into each
						     other by the bidi algorithm. In Arabic both hang from the
						     gutter's right edge, next to the axis they name. -->
						<text x={rtl ? GUTTER - 10 : GL_X} y={gl.y + 3.5} class="gl-date" direction={rtl ? 'rtl' : 'ltr'}>{gl.date}</text>
						<text
							x={rtl ? GUTTER - 10 - gl.dateW - 8 : GL_X + gl.dateW + 8}
							y={gl.y + 3.5}
							class="gl-title"
							direction={rtl ? 'rtl' : 'ltr'}>{rtl ? isolate(gl.title) : gl.title}</text
						>
					</g>
				{/each}
			</g>
			<line x1={GUTTER} x2={GUTTER} y1="0" y2={H} class="gutter-edge" />

			{#if headIn}
				<g clip-path="url(#ev-plot-clip)" transform="translate({GUTTER},0)">
					<line x1={x(app.t)} x2={x(app.t)} y1={PAD_T - 2} y2={H} class="playhead" />
					<g class="axis-head" transform="translate({headX},0)">
						<rect class="axis-tag-bg" x="-31" y="1" width="62" height="13" rx="3" />
						<text class="axis-tag" x="0" y="10.5" text-anchor="middle">{headLabel}</text>
						<path class="axis-grip" d="M -5 {PAD_T - 12} h 10 l -5 10 z" />
					</g>
				</g>
			{/if}
		</svg>

		{#if layout.rows === 0}
			<p class="empty" style:top="{ROWS_T + 8}px" style:inset-inline-start="{GUTTER + 16}px">{ew('events.empty')}</p>
		{/if}

		{#if tip}
			<div class="tip" style:left="{Math.min(tip.x + 12, Math.max(8, width - 240))}px" style:top="{tip.y + 16}px">
				<strong>{tip.title}</strong>
				<span class="mono">{tip.sub}</span>
			</div>
		{/if}

		{#if pop}
			<!-- data-no-pan: the card scrolls its own rows, so its wheel must not zoom the chart. -->
			<div class="pop" data-no-pan style:left="{pop.x}px" style:top="{pop.y}px" role="dialog" aria-label={t('chronicle.cluster.group')}>
				<div class="pop-head">
					<span class="mono">{tf('chronicle.cluster.count', { n: pop.members.length })}</span>
					<button onclick={() => zoomToCluster(pop?.members ?? [])}>{t('view.zoomin')}</button>
					<button class="pop-x" onclick={() => (pop = null)} aria-label={t('ctl.close')}>×</button>
				</div>
				<ul>
					{#each pop.members as m (m.id)}
						<li>
							<button
								class="pop-row"
								onclick={() => {
									app.select(m.id);
									pop = null;
								}}
							>
								<span class="pop-d mono">{formatDate(m.interval.startEarliest, 'day')}</span>
								<span class="pop-t">{eventTitle(m)}</span>
								<i class="pop-b" style:--c={BASIS_COLOR[m.basis as Basis]} aria-hidden="true"></i>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		scrollbar-width: auto;
		scrollbar-color: var(--text-faint) transparent;
		scrollbar-gutter: stable;
	}
	.plot {
		position: relative;
		cursor: grab;
		/* Vertical scrolling stays the browser's; horizontal drag and pinch are ours. */
		touch-action: pan-y;
	}
	.plot.moving {
		cursor: grabbing;
	}
	svg {
		display: block;
		/* Time runs left to right in every language, as on the Chronicle. */
		direction: ltr;
	}
	.era-label {
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	/* Letter-spacing pulls joined scripts apart. */
	.era-label.joined {
		letter-spacing: 0;
	}
	.grid {
		stroke: var(--border-subtle);
		stroke-width: 1;
		pointer-events: none;
	}
	.tick-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		fill: var(--text-faint);
	}
	.tick-label.major {
		fill: var(--text-secondary);
	}
	.axis-scrub {
		fill: transparent;
		cursor: ew-resize;
	}
	.rupture-line {
		stroke: var(--rupture);
		stroke-width: 1;
		opacity: var(--dim);
		pointer-events: none;
	}
	.bg {
		fill: transparent;
	}
	.row-line {
		stroke: var(--border-subtle);
		stroke-width: 1;
		pointer-events: none;
	}
	.mark {
		cursor: pointer;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.mark.dim {
		opacity: 0.3;
	}
	.diamond {
		fill: var(--rupture);
	}
	.diamond.sel {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.dot,
	.pill,
	.spanbar {
		fill: var(--text-secondary);
	}
	.mark.hot .dot,
	.mark.hot .pill,
	.mark.hot .spanbar {
		fill: var(--text-primary);
	}
	.dot.sel,
	.pill.sel,
	.spanbar.sel {
		fill: var(--accent);
	}
	.contested {
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1;
		stroke-dasharray: 2 2;
	}
	.selring {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.cluster {
		fill: var(--surface-overlay);
		stroke: var(--border-strong);
		stroke-width: 1;
	}
	.cluster.sel {
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.cluster-count {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 600;
		fill: var(--text-primary);
		text-anchor: middle;
		pointer-events: none;
	}
	.link-conseq {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
		pointer-events: none;
	}
	.link-cause {
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1.4;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
	.gutter-mask {
		fill: var(--surface-base);
	}
	.gutter-edge {
		stroke: var(--border-subtle);
		stroke-width: 1;
	}
	.gl {
		cursor: pointer;
	}
	.gl:focus-visible {
		outline: none;
	}
	.gl-hit {
		fill: transparent;
	}
	.gl:hover .gl-hit,
	.gl:focus-visible .gl-hit {
		fill: var(--surface-hover);
	}
	.gl:focus-visible .gl-hit {
		stroke: var(--accent);
		stroke-width: 1;
	}
	.gl-date {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--text-faint);
	}
	.gl-title {
		font-size: 11px;
		fill: var(--text-secondary);
	}
	.gl.rupture .gl-title {
		fill: var(--text-primary);
		font-weight: 500;
	}
	.gl:hover .gl-title,
	.gl.sel .gl-title {
		fill: var(--text-primary);
	}
	.gl.sel .gl-date {
		fill: var(--accent);
	}
	.gl.dim {
		opacity: var(--dim);
	}
	.playhead {
		stroke: var(--text-primary);
		stroke-width: 1.3;
		opacity: 0.85;
		pointer-events: none;
	}
	.axis-head {
		pointer-events: none;
	}
	.axis-grip {
		fill: var(--text-primary);
		opacity: 0.85;
	}
	.axis-tag-bg {
		fill: var(--surface-overlay);
		stroke: var(--border-strong);
		stroke-width: 1;
	}
	.axis-tag {
		font-family: var(--font-mono);
		font-size: 9.5px;
		fill: var(--text-primary);
	}
	.empty {
		position: absolute;
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-faint);
	}
	.tip {
		position: absolute;
		z-index: 21;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 232px;
		padding: 7px 9px;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		box-shadow: var(--elev-3);
		pointer-events: none;
		font-size: var(--t-sm);
	}
	.tip strong {
		font-weight: 500;
	}
	.tip .mono {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.pop {
		position: absolute;
		z-index: 30;
		width: 340px;
		max-height: min(60vh, 480px);
		overflow-y: auto;
		background: var(--surface-panel);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-md);
		box-shadow: var(--elev-3);
		padding: var(--s-3);
	}
	.pop-head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: 0 var(--s-1) var(--s-2);
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.pop-head button {
		margin-inline-start: auto;
		font-size: var(--t-2xs);
		color: var(--accent);
		border: 1px solid var(--accent-border);
		border-radius: var(--r-sm);
		padding: 2px 8px;
	}
	.pop-head .pop-x {
		margin-inline-start: 0;
		color: var(--text-faint);
		border-color: transparent;
		font-size: var(--t-lg);
		line-height: 1;
		padding: 0 6px;
	}
	.pop ul {
		list-style: none;
		margin: var(--s-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.pop-row {
		display: grid;
		grid-template-columns: 9ch 1fr auto;
		align-items: baseline;
		gap: var(--s-2);
		width: 100%;
		text-align: start;
		padding: var(--s-1) var(--s-2);
		border-radius: var(--r-sm);
	}
	.pop-row:hover {
		background: var(--surface-hover);
	}
	.pop-d {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.pop-t {
		font-size: var(--t-sm);
		color: var(--text-secondary);
		line-height: var(--lh-snug);
	}
	.pop-row:hover .pop-t {
		color: var(--text-primary);
	}
	.pop-b {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--c, var(--text-muted));
		align-self: center;
	}
</style>
