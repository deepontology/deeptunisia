<script lang="ts">
	import { AxisCamera, navigableAxis } from '$lib/viz/axis.svelte';
	import { fits } from '$lib/viz/measure';
	import { relationshipsByEntity } from '$lib/model';
	import { app } from '$lib/state.svelte';
	import { applyEntityLink } from '$lib/deeplink.svelte';
	import { t, describeInterval, durationLabel, eventTitle, formatDate, nameOf} from '$lib/t.svelte';
	import { dateFormatter } from '$lib/i18n';
	import Button from '$lib/ui/Button.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { BASIS_COLOR, BASIS_SHORT } from '$lib/model';
	import {
		CUTOFF,
		DASH,
		FLOOR,
		LAYER_COLOR,
		BASIS_OPACITY,
		activity,
		ds,
		eventById,
		institutionById,
		meetsBasis,
		personById,
		roleById,
		type Confidence,
		type Basis,
		type EventRec,
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
	/**
	 * The events lane: one strip between the axis and the first group, sharing
	 * the camera domain and the gutter mapping. Dots are always drawn (visible,
	 * not readable, at full range); labels are tier-gated (see `tierLabels`).
	 */
	const LANE_H = 72;

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

	/**
	 * Must match `.ev-label` (10px JetBrains Mono, no tracking, no uppercase).
	 * Using ERA_LABEL_TYPE here measured at 9px uppercase+tracked and so
	 * under-estimated the rendered width — expanded labels overlapped the
	 * marks they were meant to sit beside.
	 */
	const EV_LABEL_TYPE = {
		size: 10,
		family: 'JetBrains Mono, monospace'
	};

	let tip = $state<{ x: number; y: number; pos: Position } | null>(null);

	/** Hover preview for the events lane, positioned in plot coordinates. */
	let evTip = $state<{ x: number; y: number; title: string; sub: string } | null>(null);

	/** A cluster badge's expanded list, positioned in plot coordinates. */
	let clusterPop = $state<{ x: number; y: number; members: EventRec[] } | null>(null);

	/** Expanded investigative mode: events dominate, stacked into labelled rows. */
	let expanded = $state(false);
	/** Categories switched off in the events view (empty set = all on). */
	let hiddenCats = $state<Set<string>>(new Set());
	let rupturesOnly = $state(false);

	/** The lane background rect: the ruler every lane click is measured against. */
	let laneBg = $state<SVGRectElement | null>(null);

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
		let y = PAD_T + laneH;

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

	// --- Events lane --------------------------------------------------------
	// Non-rupture events had no geometry on this view: only rupture:true drew.
	// The lane gives every event a mark on the shared time axis. Labels are a
	// function of zoom (tiers), never of importance: at full range the lane is
	// dots, and zooming in is what makes text appear.

	const LANE_TOP = PAD_T;
	/** Point/cluster track centre. */
	const POINT_MID = PAD_T + 24;
	/** Long-duration track centre, below the points so bars never occlude them. */
	const SPAN_MID = PAD_T + LANE_H - 12;
	/** Anchors closer than this on screen collapse into one cluster badge. */
	const CLUSTER_PX = 14;
	/** A rendered mark narrower than this is a point, not a span. */
	const DOT_PX = 7;
	const YEAR_MS = 365.2425 * 86_400_000;

	const eventsSorted = $derived(
		[...ds.events].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest)
	);

	const spanYears = $derived((domain[1] - domain[0]) / (365.2425 * 86_400_000));
	/** Tier 1: ruptures labeled. Tier 2: plus elections/constitutional. Tier 3: all. */
	const tier = $derived(spanYears > 20 ? 1 : spanYears > 3 ? 2 : 3);
	const MAJOR_EVENT_CATS = new Set(['election', 'constitutional']);

	function eventTiered(e: EventRec): boolean {
		if (tier === 3) return true;
		if (tier === 2) return e.rupture || MAJOR_EVENT_CATS.has(e.category);
		return e.rupture;
	}

	function eventPasses(e: EventRec): boolean {
		return meetsBasis(e.basis as Basis, app.basisFloor);
	}

	/**
	 * Domain test is interval overlap, not "start is inside": a long record
	 * that begins before the window (phosphate, 2011) must still draw while
	 * the reader is looking at 2026.
	 */
	function eventInDomain(e: EventRec): boolean {
		const s = e.interval.startEarliest;
		const en = e.interval.endLatest ?? e.interval.endEarliest ?? s;
		return en >= domain[0] && s <= domain[1];
	}

	/** Intrinsic duration in years — stable across zoom, unlike rendered width. */
	function intrinsicYears(e: EventRec): number {
		const s = e.interval.startEarliest;
		const en = e.interval.endLatest ?? e.interval.endEarliest ?? s;
		return (en - s) / YEAR_MS;
	}
	/**
	 * A genuinely long record goes on its own thin track. Only
	 * `phosphate-collapse` (2011–2021) qualifies today, but the rule is by
	 * duration, so no future long record can occlude the point marks.
	 */
	function isLongSpan(e: EventRec): boolean {
		return intrinsicYears(e) > 2;
	}

	/** Categories present in the graph, with counts, for the events filter row. */
	const allEventCats = $derived.by(() => {
		const m = new Map<string, number>();
		for (const e of ds.events) if (eventPasses(e)) m.set(e.category, (m.get(e.category) ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	});

	function eventPassesFilters(e: EventRec): boolean {
		return !hiddenCats.has(e.category) && (!rupturesOnly || e.rupture);
	}

	function toggleCat(c: string) {
		const next = new Set(hiddenCats);
		if (next.has(c)) next.delete(c);
		else next.add(c);
		hiddenCats = next;
	}

	const laneEvents = $derived(
		eventsSorted.filter((e) => eventPasses(e) && eventInDomain(e) && eventPassesFilters(e))
	);

	// --- Expanded investigative layout --------------------------------------
	// One linear time axis; overlapping events stack into rows, and events that
	// would fall within a few pixels of each other aggregate into a counted
	// cluster badge instead of smearing into an unreadable pile. Zooming splits
	// the clusters back into individual marks. The tenure rows follow below and
	// the whole plot scrolls.
	const EXP_ROW_H = 20;
	const EXP_PAD_T = 24;
	const EXP_PAD_B = 10;
	const EXP_MIN_W = 6;
	const EXP_CLUSTER_PX = 14;

	interface ExpItem {
		event: EventRec;
		x0: number;
		x1: number;
		y: number;
	}
	interface ExpCluster {
		members: EventRec[];
		x0: number;
		x1: number;
		y: number;
	}
	interface ExpLayout {
		items: ExpItem[];
		clusters: ExpCluster[];
		height: number;
		byEvent: Map<string, ExpItem>;
	}

	/** Greedy interval packing: each entry gets the first row it fits in. */
	function packRows(source: { id: string; x0: number; x1: number; occ: number }[]) {
		const rowEnds: number[] = [];
		const placed: { id: string; x0: number; x1: number; row: number }[] = [];
		for (const it of [...source].sort((a, b) => a.x0 - b.x0)) {
			let r = rowEnds.findIndex((end) => end + 4 <= it.x0);
			if (r === -1) {
				rowEnds.push(it.occ);
				r = rowEnds.length - 1;
			} else {
				rowEnds[r] = it.occ;
			}
			placed.push({ id: it.id, x0: it.x0, x1: it.x1, row: r });
		}
		return { placed, rows: Math.max(1, rowEnds.length) };
	}

	function eventXRange(e: EventRec, d0: number, d1: number): { x0: number; x1: number } {
		const span = d1 - d0 || 1;
		const x0 = ((e.interval.startEarliest - d0) / span) * plotW;
		const x1 = Math.max(
			x0 + EXP_MIN_W,
			(((e.interval.endLatest ?? e.interval.endEarliest ?? e.interval.startEarliest) - d0) / span) * plotW
		);
		return { x0, x1 };
	}

	/** Ruptures are the anchors of the record, so their label space is reserved. */
	function ruptureReserve(e: EventRec): number {
		return e.rupture ? Math.min(220, eventTitle(e).length * 6.2 + 16) : 0;
	}

	function clusterBadgeW(n: number): number {
		return Math.max(18, Math.min(38, 14 + String(n).length * 7));
	}

	/**
	 * Cluster events whose anchors fall within EXP_CLUSTER_PX on screen. Ruptures
	 * and long spans stay individual: they are the backbone and the duration.
	 */
	function clusterEvents(list: EventRec[]): ({ event: EventRec } | { members: EventRec[] })[ ] {
		const anchored = list
			.map((e) => {
				const { x0, x1 } = eventXRange(e, domain[0], domain[1]);
				return { event: e, x0, x1, anchor: (x0 + x1) / 2 };
			})
			.sort((a, b) => a.anchor - b.anchor);
		const out: ({ event: EventRec } | { members: EventRec[] })[] = [];
		let group: typeof anchored = [];
		const flush = () => {
			if (group.length === 1) out.push({ event: group[0].event });
			else if (group.length > 1) out.push({ members: group.map((g) => g.event) });
			group = [];
		};
		let lastAnchor = -Infinity;
		for (const m of anchored) {
			if (m.event.rupture || isLongSpan(m.event)) {
				flush();
				out.push({ event: m.event });
				lastAnchor = m.anchor;
				continue;
			}
			if (group.length && m.anchor - lastAnchor > EXP_CLUSTER_PX) flush();
			group.push(m);
			lastAnchor = m.anchor;
		}
		flush();
		return out;
	}

	/** Linear-axis layout: overlapping nodes stack into rows across the domain. */
	const expandedLayout = $derived.by((): ExpLayout => {
		const nodes = clusterEvents(laneEvents);
		const packable = nodes.map((n, idx) => {
			const id = 'n' + idx;
			if ('members' in n) {
				const xs = n.members.map((m) => {
					const { x0, x1 } = eventXRange(m, domain[0], domain[1]);
					return (x0 + x1) / 2;
				});
				const raw = xs.reduce((a, b) => a + b, 0) / xs.length;
				const w = clusterBadgeW(n.members.length);
				// Keep the badge inside the plot: a dense pile at the right edge
				// (2026) would otherwise be drawn half off the clip.
				const cx = Math.min(Math.max(raw, w / 2), Math.max(w / 2, plotW - w / 2));
				return { id, x0: cx - w / 2, x1: cx + w / 2, occ: cx + w / 2 };
			}
			const { x0, x1 } = eventXRange(n.event, domain[0], domain[1]);
			return { id, x0, x1, occ: x1 + ruptureReserve(n.event) };
		});
		const { placed, rows } = packRows(packable);
		const items: ExpItem[] = [];
		const clusters: ExpCluster[] = [];
		for (const p of placed) {
			const n = nodes[Number(p.id.slice(1))];
			const y = LANE_TOP + EXP_PAD_T + p.row * EXP_ROW_H + EXP_ROW_H / 2;
			if ('members' in n) clusters.push({ members: n.members, x0: p.x0, x1: p.x1, y });
			else items.push({ event: n.event, x0: p.x0, x1: p.x1, y });
		}
		const height = EXP_PAD_T + rows * EXP_ROW_H + EXP_PAD_B;
		return { items, clusters, height, byEvent: new Map(items.map((i) => [i.event.id, i])) };
	});

	/** Distinct lane centres, for the horizontal rules between rows. */
	const laneYs = $derived([
		...new Set([
			...expandedLayout.items.map((i) => Math.round(i.y)),
			...expandedLayout.clusters.map((c) => Math.round(c.y))
		])
	]);

	/** The band height: slim overview normally, the row stack when expanded. */
	const laneH = $derived(expanded ? expandedLayout.height : LANE_H);

	/** Labels in expanded mode: room-aware per lane; the selected event always reads. */
	const expLabels = $derived.by(() => {
		const out = new Map<string, { x: number; text: string }>();
		// Lanes hold both individual marks and cluster badges, so a label never
		// runs under a badge sitting beside it.
		interface LaneNode {
			x0: number;
			x1: number;
			y: number;
			event: EventRec | null;
		}
		const laneNodes: LaneNode[] = [
			...expandedLayout.items.map((i) => ({ x0: i.x0, x1: i.x1, y: i.y, event: i.event })),
			...expandedLayout.clusters.map((c) => ({ x0: c.x0, x1: c.x1, y: c.y, event: null }))
		];
		const byLane = new Map<number, LaneNode[]>();
		for (const it of laneNodes) {
			const key = Math.round(it.y);
			const list = byLane.get(key) ?? [];
			list.push(it);
			byLane.set(key, list);
		}
		for (const list of byLane.values()) {
			list.sort((a, b) => a.x0 - b.x0);
			for (let i = 0; i < list.length; i++) {
				const it = list[i];
				if (!it.event) continue;
				const start = it.x1 + 6;
				const next = i + 1 < list.length ? list[i + 1].x0 : plotW;
				let room = next - start - 6;
				const isSel = eventSelected?.id === it.event.id;
				if (isSel) room = Math.max(room, 180);
				if (room < 40) continue;
				const text = fitText(eventTitle(it.event), room, EV_LABEL_TYPE);
				if (text) out.set(it.event.id, { x: start, text });
			}
		}
		return out;
	});

	/** Longest prefix of `text` (plus an ellipsis) that fits in `room` px. */
	function fitText(text: string, room: number, m: { size: number; family?: string }): string {
		if (fits(text, room, m, 0)) return text;
		const ell = '…';
		let lo = 1;
		let hi = text.length;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (fits(text.slice(0, mid) + ell, room, m, 0)) lo = mid;
			else hi = mid - 1;
		}
		if (lo <= 1) return '';
		let cut = text.slice(0, lo).trimEnd();
		// Prefer a word boundary, unless dropping to it would waste most of the space.
		const sp = cut.lastIndexOf(' ');
		if (sp >= lo * 0.55) cut = cut.slice(0, sp);
		return cut + ell;
	}

	const TYPE = { size: 10, family: 'JetBrains Mono, monospace' };

	/** Switch between the slim timeline and the expanded events view. */
	function setView(v: string) {
		const want = v === 'events';
		if (want && !expanded) {
			// Land somewhere readable: the record is overwhelmingly post-2000, so a
			// full-range window would stack ~40 rows of pixels. Fit the last 25y.
			if (domain[1] - domain[0] > YEAR_MS * 25) {
				axis.setDomain(Math.max(FLOOR, CUTOFF - YEAR_MS * 25), CUTOFF);
			}
		}
		expanded = want;
	}

	function setRange(years: number | 'full') {
		if (years === 'full') axis.reset();
		else axis.setDomain(Math.max(FLOOR, CUTOFF - YEAR_MS * years), CUTOFF);
	}

	type LaneMark = { kind: 'mark'; event: EventRec; x: number };
	type LaneCluster = { kind: 'cluster'; members: EventRec[]; x: number };
	type LaneSpan = { kind: 'span'; event: EventRec; x0: number; x1: number };
	type LaneItem = LaneMark | LaneCluster | LaneSpan;

	/**
	 * What the lane draws, at the current zoom. Ruptures and long spans are
	 * always individual (they are the backbone and the duration track);
	 * everything else collapses into a cluster when its anchor sits within
	 * CLUSTER_PX of the previous one. At full range the 45 events of 2026 are
	 * one badge; zooming splits it. This is the difference between a legible
	 * overview and 45 indistinguishable pixels.
	 */
	const laneItems = $derived.by((): LaneItem[] => {
		const items: LaneItem[] = [];
		const clusters: { members: EventRec[]; anchor: number; lastX: number }[] = [];
		for (const e of laneEvents) {
			const ex = x(e.interval.startEarliest);
			if (isLongSpan(e)) {
				items.push({
					kind: 'span',
					event: e,
					x0: ex,
					x1: Math.max(ex + 4, x(e.interval.endLatest ?? e.interval.endEarliest ?? e.interval.startEarliest))
				});
				continue;
			}
			if (e.rupture) {
				items.push({ kind: 'mark', event: e, x: ex });
				continue;
			}
			const last = clusters[clusters.length - 1];
			if (last && ex - last.lastX <= CLUSTER_PX) {
				last.members.push(e);
				last.lastX = ex;
			} else {
				clusters.push({ members: [e], anchor: ex, lastX: ex });
			}
		}
		for (const c of clusters) {
			if (c.members.length === 1) items.push({ kind: 'mark', event: c.members[0], x: c.anchor });
			else {
				const cx = c.members.reduce((s, m) => s + x(m.interval.startEarliest), 0) / c.members.length;
				items.push({ kind: 'cluster', members: c.members, x: cx });
			}
		}
		return items.sort((a, b) => (a.kind === 'span' ? a.x0 : a.x) - (b.kind === 'span' ? b.x0 : b.x));
	});

	/**
	 * Label placement: greedy two-row stagger over the tier-granted individual
	 * marks only — clusters carry their count, and spans their own track.
	 * A tier grant is necessary but never sufficient; `fits()` decides.
	 */
	const laneLabels = $derived.by(() => {
		const placed = new Map<string, 0 | 1>();
		const marks = laneItems.filter((it): it is LaneMark => it.kind === 'mark');
		const ends = [-Infinity, -Infinity];
		for (let i = 0; i < marks.length; i++) {
			const e = marks[i].event;
			if (!eventTiered(e)) continue;
			const sx = marks[i].x;
			const title = eventTitle(e);
			// Latin-approx width for the stagger pass; fits() below measures
			// the real glyphs, so a wrong estimate only costs a row.
			const est = title.length * 6.1 + 14;
			const r = ends.findIndex((end) => end <= sx);
			if (r === -1) continue;
			const nx = i + 1 < marks.length ? marks[i + 1].x : plotW;
			if (!fits(title, Math.max(0, nx - sx - 10), EV_LABEL_TYPE)) continue;
			ends[r] = sx + est;
			placed.set(e.id, r as 0 | 1);
		}
		return placed;
	});

	// --- Event selection and chain ------------------------------------------
	// A lane click is app.select(eventId): toggle, Escape, and the Inspector
	// come free, and RecordPanel already renders the event card. The lane only
	// traces the causal chain; it designs no card.

	const eventSelected = $derived(
		app.selected ? (eventById.get(app.selected) ?? null) : null
	);

	/** Selecting an event must not dim the tenure rows: no holder matches. */
	const eventFocus = $derived(eventSelected !== null);

	const linkedEventIds = $derived.by(() => {
		const sel = eventSelected;
		const s = new Set<string>();
		if (!sel) return s;
		for (const e of ds.events) {
			if (e.id === sel.id) continue;
			if (
				e.consequences.includes(sel.id) ||
				sel.causes.includes(e.id) ||
				e.causes.includes(sel.id) ||
				sel.consequences.includes(e.id)
			)
				s.add(e.id);
		}
		return s;
	});

	/**
	 * One owner for pointer picking. Marks are `pointer-events: none`, so the
	 * lane background is the only pointer target and nothing can steal a click:
	 * a distance rule decides what the reader meant. Span bars score zero
	 * anywhere along their own track; points and clusters score by screen
	 * distance; empty space clears. Keyboard focus/Enter stays per mark.
	 */
	const PICK_R = 24;

	function lanePick(clientX: number, clientY: number): LaneItem | null {
		if (!laneBg) return null;
		const r = laneBg.getBoundingClientRect();
		const px = clientX - r.left;
		// Convert to SVG-local y: the lane rect starts at LANE_TOP, while the
		// track constants (POINT_MID/SPAN_MID) are measured from the SVG origin.
		const py = clientY - r.top + LANE_TOP;
		let best: LaneItem | null = null;
		let bestD = Infinity;
		for (const it of laneItems) {
			if (it.kind === 'span') {
				// In its own thin band and within its body: exact hit.
				if (py >= SPAN_MID - 7 && py <= SPAN_MID + 7 && px >= it.x0 - 4 && px <= it.x1 + 4) return it;
				const cx = Math.max(it.x0, Math.min(px, it.x1));
				const d = Math.hypot(px - cx, py - SPAN_MID);
				if (d < bestD) {
					bestD = d;
					best = it;
				}
			} else {
				const d = Math.hypot(px - it.x, py - POINT_MID);
				if (d < bestD) {
					bestD = d;
					best = it;
				}
			}
		}
		return bestD <= PICK_R ? best : null;
	}

	function onLaneClick(e: MouseEvent) {
		const it = lanePick(e.clientX, e.clientY);
		if (!it) {
			app.select(null);
			clusterPop = null;
			return;
		}
		if (it.kind === 'cluster') {
			openCluster(it.members, e.clientX, e.clientY);
			return;
		}
		clusterPop = null;
		app.select(it.event.id);
	}

	function onLaneMove(e: MouseEvent) {
		const it = lanePick(e.clientX, e.clientY);
		const r = plotEl?.getBoundingClientRect();
		if (!it || !r) {
			evTip = null;
			return;
		}
		if (it.kind === 'cluster') {
			evTip = {
				x: e.clientX - r.left,
				y: e.clientY - r.top,
				title: `${it.members.length} events`,
				sub: clusterRange(it.members)
			};
		} else {
			evTip = {
				x: e.clientX - r.left,
				y: e.clientY - r.top,
				title: eventTitle(it.event),
				sub: formatDate(it.event.interval.startEarliest, 'day')
			};
		}
	}

	function onLaneLeave() {
		evTip = null;
	}

	/** Expanded-mode hover preview: rows separate marks, so a per-mark hover works. */
	function showEvTip(me: MouseEvent, ev: EventRec) {
		const r = plotEl?.getBoundingClientRect();
		if (!r) return;
		evTip = {
			x: me.clientX - r.left,
			y: me.clientY - r.top,
			title: eventTitle(ev),
			sub: formatDate(ev.interval.startEarliest, 'day')
		};
	}

	function clusterRange(members: EventRec[]): string {
		const t0 = Math.min(...members.map((m) => m.interval.startEarliest));
		const t1 = Math.max(...members.map((m) => m.interval.startEarliest));
		const y0 = new Date(t0).getUTCFullYear();
		const y1 = new Date(t1).getUTCFullYear();
		return y0 === y1 ? String(y0) : `${y0}–${y1}`;
	}

	function openCluster(members: EventRec[], clientX: number, clientY: number) {
		const r = plotEl?.getBoundingClientRect();
		if (!r) return;
		clusterPop = {
			x: Math.max(8, Math.min(clientX - r.left, width - 300)),
			y: clientY - r.top + 14,
			members: [...members].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest)
		};
		evTip = null;
	}

	/** Fit the camera to a cluster so its members separate in place. */
	function zoomToCluster(members: EventRec[]) {
		const t0 = Math.min(...members.map((m) => m.interval.startEarliest));
		const t1 = Math.max(...members.map((m) => m.interval.startEarliest));
		const pad = Math.max((t1 - t0) * 0.6, YEAR_MS * 1.5);
		axis.setDomain(Math.max(FLOOR, t0 - pad), Math.min(CUTOFF, t1 + pad));
		clusterPop = null;
	}

	/** Split for connector styling: dashed back to causes, solid to consequences. */
	const chainLinks = $derived.by(() => {
		const sel = eventSelected;
		if (!sel) return { causes: [] as EventRec[], consequences: [] as EventRec[] };
		return {
			causes: ds.events.filter(
				(e) => e.id !== sel.id && (e.consequences.includes(sel.id) || sel.causes.includes(e.id))
			),
			consequences: ds.events.filter(
				(e) => e.id !== sel.id && (e.causes.includes(sel.id) || sel.consequences.includes(e.id))
			)
		};
	});

	function eventDim(e: EventRec): boolean {
		return Boolean(eventSelected && e.id !== eventSelected.id && !linkedEventIds.has(e.id));
	}

	/**
	 * Ticks adapt to the zoom: decades out to months, so the axis always says
	 * which time you are looking at rather than only the year.
	 */
	interface AxisTick {
		t: number;
		label: string;
		major: boolean;
	}
	const axisTicks = $derived.by((): AxisTick[] => {
		const out: AxisTick[] = [];
		const [d0, d1] = domain;
		const years = spanYears;
		if (years > 3) {
			const step = years > 55 ? 10 : years > 22 ? 5 : years > 9 ? 2 : 1;
			const y0 = Math.ceil(new Date(d0).getUTCFullYear() / step) * step;
			const y1 = new Date(d1).getUTCFullYear();
			for (let y = y0; y <= y1 && out.length < 200; y += step) {
				const t = Date.UTC(y, 0, 1);
				if (t < d0 || t > d1) continue;
				out.push({ t, label: String(y), major: true });
			}
			return out;
		}
		if (years > 0.35) {
			const stepMonths = years > 1 ? 3 : 1;
			const monthFmt = dateFormatter(app.locale, { month: 'short' });
			const yearFmt = dateFormatter(app.locale, { year: 'numeric' });
			const startM = Math.floor(new Date(d0).getUTCMonth() / stepMonths) * stepMonths;
			for (let k = 0; k < 200; k++) {
				const t = Date.UTC(new Date(d0).getUTCFullYear(), startM + k * stepMonths, 1);
				if (t > d1) break;
				if (t < d0) continue;
				const d = new Date(t);
				const jan = d.getUTCMonth() === 0;
				out.push({ t, label: jan ? `${monthFmt.format(d)} ${yearFmt.format(d)}` : monthFmt.format(d), major: jan });
			}
			return out;
		}
		const dayFmt = dateFormatter(app.locale, { day: 'numeric', month: 'short' });
		const step = 7 * 86_400_000;
		let t = Math.ceil(d0 / step) * step;
		for (let k = 0; k < 200 && t <= d1; k++, t += step) {
			out.push({ t, label: dayFmt.format(new Date(t)), major: false });
		}
		return out;
	});

	/** Date readout on the axis cursor, at a precision that matches the zoom. */
	const axisDateLabel = $derived(
		formatDate(app.t, spanYears > 20 ? 'year' : spanYears > 3 ? 'month' : 'day')
	);

	/** Playhead x, clamped so its date chip stays inside the plot. */
	const headX = $derived(Math.min(Math.max(x(app.t), 32), Math.max(32, plotW - 32)));

	/** The cursor is only drawn while the scrubbed date is inside the window. */
	const headInDomain = $derived(app.t >= domain[0] && app.t <= domain[1]);

	// The axis is a scrub surface too: drag anywhere along the top to move the
	// playhead, the way a timeline cursor works, without reaching for the dock.
	let scrubbing = $state(false);
	function axisTimeAt(clientX: number): number {
		const r = plotEl?.getBoundingClientRect();
		if (!r) return app.t;
		const local = clientX - r.left - GUTTER;
		return invX(Math.min(plotW, Math.max(0, local)));
	}
	function onAxisDown(e: PointerEvent) {
		scrubbing = true;
		app.playing = false;
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		app.setDate(axisTimeAt(e.clientX));
	}
	function onAxisMove(e: PointerEvent) {
		if (scrubbing) app.setDate(axisTimeAt(e.clientX));
	}
	function onAxisUp(e: PointerEvent) {
		scrubbing = false;
		const el = e.currentTarget as Element;
		// Capture may already be gone (lostpointercapture), so do not assume it.
		if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
	}

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

	{#if expanded}
		<!-- The events view's own controls: what is in scope, and where to look.
		     Category labels are the raw data slugs, matching how RecordPanel
		     already names an event's category; chrome comes from existing keys,
		     so this view adds no untranslated strings. -->
		<div class="events-bar">
			<button class="eb-chip on" onclick={() => setView('timeline')}>
				{t('chronicle.events.collapse')}
			</button>
			<span class="eb-sep"></span>
			<span class="eb-label mono">{t('record.category')}</span>
			<button class="eb-chip" class:on={hiddenCats.size === 0} onclick={() => (hiddenCats = new Set())}>
				{t('feed.all')}
			</button>
			{#each allEventCats as [cat, n] (cat)}
				<button
					class="eb-chip"
					class:off={hiddenCats.has(cat)}
					aria-pressed={!hiddenCats.has(cat)}
					onclick={() => toggleCat(cat)}
				>
					{cat} <span class="eb-n mono">{n}</span>
				</button>
			{/each}
			<span class="eb-sep"></span>
			<button
				class="eb-chip"
				class:on={rupturesOnly}
				aria-pressed={rupturesOnly}
				onclick={() => (rupturesOnly = !rupturesOnly)}
			>
				{t('record.rupture')}
			</button>
			<span class="eb-sep"></span>
			<button class="eb-chip" onclick={() => setRange('full')}>{t('chronicle.fullrange')}</button>
			<button class="eb-chip" onclick={() => setRange(15)}>2011–2026</button>
			<button class="eb-chip" onclick={() => setRange(5)}>2021–2026</button>
			<span class="eb-count mono">{laneEvents.length} / {eventsSorted.filter(eventPasses).length}</span>
		</div>
	{/if}

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
					<!--
						The same window, for the groups that carry BOTH a clip and a
						translate(GUTTER) transform. `clip-path` is resolved in the
						element's own user space, which that transform has already
						shifted — so `plot-clip` would clip at rendered x >= 2*GUTTER and
						hide everything before ~1970. Local origin, local width: correct
						after the shift. The untransformed row wrapper keeps `plot-clip`.
					-->
					<clipPath id="plot-clip-local">
						<rect x="0" y="0" width={plotW} height={layout.height} />
					</clipPath>
					<!-- Keeps row and group names inside the gutter. SVG text cannot
					     ellipsize, so containing it is the only way to stop a long title
					     from being drawn across the tenure bars it labels. -->
					<clipPath id="gutter-clip">
						<rect x="0" y="0" width={GUTTER - 6} height={layout.height} />
					</clipPath>
				</defs>

				<!-- Era bands -->
				<g clip-path="url(#plot-clip-local)" transform="translate({GUTTER},0)">
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

				<!-- Time axis. The ticks adapt to the zoom (decade → month → week),
				     and the strip is a scrub surface: drag it to move the playhead. -->
				<g clip-path="url(#plot-clip-local)" transform="translate({GUTTER},0)">
					{#each axisTicks as tk (tk.t)}
						<line x1={x(tk.t)} x2={x(tk.t)} y1={PAD_T - 8} y2={layout.height} class="grid" />
						<text x={x(tk.t) + 4} y={PAD_T - 4} class="tick-label" class:major={tk.major}>
							{tk.label}
						</text>
					{/each}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<rect
						class="axis-scrub"
						data-no-pan
						data-cursor="scrub"
						data-cursor-hint="drag to scrub"
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
				</g>

				<!-- Ruptures: vertical lines across every row -->
				<g clip-path="url(#plot-clip-local)" transform="translate({GUTTER},0)">
					{#each ruptures as ev (ev.id)}
						{@const rx = x(ev.interval.startEarliest)}
						<line x1={rx} x2={rx} y1={PAD_T - 10} y2={layout.height} class="rupture-line" />
						<g class="rupture-tag" transform="translate({rx},{PAD_T - 14})">
							<title>{formatDate(ev.interval.startEarliest, 'day')} — {nameOf(ev)}</title>
							<circle r="3" cy="0" class="rupture-dot" />
						</g>
					{/each}
				</g>

			{#if !expanded}
			<!-- Events lane. Two tracks: points and clusters on top, long spans on a
			     thin band below so duration never occludes a point. Marks carry
			     pointer-events:none and the background rect owns picking (lanePick),
			     which is what stops a wide bar swallowing every click along it. -->
			<g clip-path="url(#plot-clip-local)" transform="translate({GUTTER},0)">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<rect
					bind:this={laneBg}
					x="0"
					y={LANE_TOP}
					width={plotW}
					height={LANE_H}
					class="ev-lane-bg"
					role="presentation"
					onclick={onLaneClick}
					onmousemove={onLaneMove}
					onmouseleave={onLaneLeave}
				/>
				{#if eventSelected}
					{#each chainLinks.causes as l (l.id)}
						{@const sx = x(eventSelected.interval.startEarliest)}
						{@const lx = x(l.interval.startEarliest)}
						<path d="M {sx} {POINT_MID} Q {(sx + lx) / 2} {POINT_MID + 20} {lx} {POINT_MID}" class="ev-link-cause" />
					{/each}
					{#each chainLinks.consequences as l (l.id)}
						{@const sx = x(eventSelected.interval.startEarliest)}
						{@const lx = x(l.interval.startEarliest)}
						<path d="M {sx} {POINT_MID} Q {(sx + lx) / 2} {POINT_MID + 20} {lx} {POINT_MID}" class="ev-link-conseq" />
					{/each}
				{/if}
				{#each laneItems as it (it.kind === 'cluster' ? 'c-' + it.members[0].id : it.kind === 'span' ? 's-' + it.event.id : 'm-' + it.event.id)}
					{#if it.kind === 'mark'}
						{@const e = it.event}
						{@const isSel = eventSelected?.id === e.id}
						{@const w = Math.max(0, x(e.interval.endLatest ?? e.interval.endEarliest ?? e.interval.startEarliest) - it.x)}
						<g
							class="ev-mark"
							class:dim={eventDim(e)}
							role="button"
							tabindex="0"
							aria-label="{eventTitle(e)}, {formatDate(e.interval.startEarliest, 'day')}"
							onkeydown={(ke) => {
								if (ke.key === 'Enter' || ke.key === ' ') {
									ke.preventDefault();
									app.select(e.id);
								}
							}}
						>
							<title>{formatDate(e.interval.startEarliest, 'day')} — {eventTitle(e)}</title>
							{#if e.rupture}
								<rect
									x={it.x - 4.5}
									y={POINT_MID - 4.5}
									width="9"
									height="9"
									transform="rotate(45 {it.x} {POINT_MID})"
									class="ev-diamond"
									class:sel={isSel}
								/>
							{:else if w >= DOT_PX}
								<rect
									x={it.x}
									y={POINT_MID - 5}
									width={w}
									height="10"
									rx="5"
									class="ev-pill"
									class:sel={isSel}
									style:opacity={BASIS_OPACITY[e.basis]}
								/>
							{:else}
								<circle
									cx={it.x}
									cy={POINT_MID}
									r={isSel ? 5 : 3.5}
									class="ev-dot"
									class:sel={isSel}
									style:opacity={BASIS_OPACITY[e.basis]}
								/>
							{/if}
							{#if e.contested.length}
								<circle cx={it.x} cy={POINT_MID} r="6.5" class="ev-contested" />
							{/if}
							{#if isSel}
								<circle cx={it.x} cy={POINT_MID} r="9" class="ev-selring" />
							{/if}
							{#if laneLabels.has(e.id)}
								<text x={it.x + 10} y={laneLabels.get(e.id) === 0 ? POINT_MID - 6 : POINT_MID + 12} class="ev-label">
									{eventTitle(e)}
								</text>
							{/if}
						</g>
					{:else if it.kind === 'cluster'}
						{@const membersSel = it.members.some((m) => m.id === eventSelected?.id)}
						{@const w = Math.max(18, Math.min(36, 14 + String(it.members.length).length * 7))}
						<g
							class="ev-mark"
							class:dim={eventSelected !== null && !membersSel}
							role="button"
							tabindex="0"
							aria-label="{it.members.length} events, {clusterRange(it.members)}"
							onkeydown={(ke) => {
								if (ke.key === 'Enter' || ke.key === ' ') {
									ke.preventDefault();
									zoomToCluster(it.members);
								}
							}}
						>
							<title>{it.members.length} events, {clusterRange(it.members)}</title>
							<rect
								x={it.x - w / 2}
								y={POINT_MID - 8}
								width={w}
								height="16"
								rx="8"
								class="ev-cluster"
								class:sel={membersSel}
							/>
							<text x={it.x} y={POINT_MID + 3.5} class="ev-cluster-count">{it.members.length}</text>
						</g>
					{:else}
						{@const e = it.event}
						{@const isSel = eventSelected?.id === e.id}
						<g
							class="ev-mark"
							class:dim={eventDim(e)}
							role="button"
							tabindex="0"
							aria-label="{eventTitle(e)}, {formatDate(e.interval.startEarliest, 'day')}"
							onkeydown={(ke) => {
								if (ke.key === 'Enter' || ke.key === ' ') {
									ke.preventDefault();
									app.select(e.id);
								}
							}}
						>
							<title>{formatDate(e.interval.startEarliest, 'day')} — {eventTitle(e)}</title>
							<rect
								x={it.x0}
								y={SPAN_MID - 2}
								width={Math.max(4, it.x1 - it.x0)}
								height="4"
								rx="2"
								class="ev-spanbar"
								class:sel={isSel}
								style:opacity={BASIS_OPACITY[e.basis]}
							/>
						</g>
					{/if}
				{/each}
			</g>
			{:else}
				<!-- Expanded investigative timeline: each event gets its own row when
				     it needs one, so simultaneous events separate and can be read. The
				     filters above decide what is in scope; selection traces causal links
				     between rows. -->
				<g clip-path="url(#plot-clip-local)" transform="translate({GUTTER},0)">
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<rect
						x="0"
						y={LANE_TOP}
						width={plotW}
						height={laneH}
						class="ev-lane-bg"
						role="presentation"
						onclick={() => (app.selected = null)}
					/>
					{#each laneYs as ly (ly)}
						<line x1="0" x2={plotW} y1={ly - EXP_ROW_H / 2} y2={ly - EXP_ROW_H / 2} class="ev-row-line" />
					{/each}
					{#if eventSelected}
						{@const sel = expandedLayout.byEvent.get(eventSelected.id)}
						{#if sel}
							{#each chainLinks.causes as l (l.id)}
								{@const t2 = expandedLayout.byEvent.get(l.id)}
								{#if t2}
									<path
										class="ev-link-cause"
										d="M {sel.x0} {sel.y} C {sel.x0} {sel.y + 16}, {t2.x0} {t2.y - 16}, {t2.x0} {t2.y}"
									/>
								{/if}
							{/each}
							{#each chainLinks.consequences as l (l.id)}
								{@const t2 = expandedLayout.byEvent.get(l.id)}
								{#if t2}
									<path
										class="ev-link-conseq"
										d="M {sel.x0} {sel.y} C {sel.x0} {sel.y + 16}, {t2.x0} {t2.y - 16}, {t2.x0} {t2.y}"
									/>
								{/if}
							{/each}
						{/if}
					{/if}
					{#each expandedLayout.items as it (it.event.id)}
						{@const e = it.event}
						{@const cy = it.y}
						{@const isSel = eventSelected?.id === e.id}
						{@const w = Math.max(0, it.x1 - it.x0)}
						{@const lx = expLabels.get(e.id)}
						<g
							class="ev-mark clickable"
							class:dim={eventDim(e)}
							role="button"
							tabindex="0"
							aria-label="{eventTitle(e)}, {formatDate(e.interval.startEarliest, 'day')}"
							onclick={() => app.select(e.id)}
							onmouseenter={(me) => showEvTip(me, e)}
							onmouseleave={onLaneLeave}
							onkeydown={(ke) => {
								if (ke.key === 'Enter' || ke.key === ' ') {
									ke.preventDefault();
									app.select(e.id);
								}
							}}
						>
							<title>{formatDate(e.interval.startEarliest, 'day')} — {eventTitle(e)}</title>
							{#if e.rupture}
								<rect
									x={it.x0 - 4.5}
									y={cy - 4.5}
									width="9"
									height="9"
									transform="rotate(45 {it.x0} {cy})"
									class="ev-diamond"
									class:sel={isSel}
								/>
							{:else if isLongSpan(e)}
								<rect
									x={it.x0}
									y={cy - 2}
									width={w}
									height="4"
									rx="2"
									class="ev-spanbar"
									class:sel={isSel}
									style:opacity={BASIS_OPACITY[e.basis]}
								/>
							{:else if w >= DOT_PX}
								<rect
									x={it.x0}
									y={cy - 5}
									width={w}
									height="10"
									rx="5"
									class="ev-pill"
									class:sel={isSel}
									style:opacity={BASIS_OPACITY[e.basis]}
								/>
							{:else}
								<circle
									cx={it.x0}
									cy={cy}
									r={isSel ? 5 : 3.5}
									class="ev-dot"
									class:sel={isSel}
									style:opacity={BASIS_OPACITY[e.basis]}
								/>
							{/if}
							{#if e.contested.length}
								<circle cx={it.x0} cy={cy} r="6.5" class="ev-contested" />
							{/if}
							{#if isSel}
								<circle cx={it.x0} cy={cy} r="9" class="ev-selring" />
							{/if}
							{#if lx !== undefined}
								<text x={lx.x} y={cy + 3.5} class="ev-label">{lx.text}</text>
							{/if}
						</g>
					{/each}
					{#each expandedLayout.clusters as c (c.members[0].id)}
						{@const cx = (c.x0 + c.x1) / 2}
						{@const membersSel = c.members.some((m) => m.id === eventSelected?.id)}
						<g
							class="ev-mark clickable"
							class:dim={eventSelected !== null && !membersSel}
							role="button"
							tabindex="0"
							aria-label="{c.members.length} events, {clusterRange(c.members)}"
							onclick={(me) => openCluster(c.members, me.clientX, me.clientY)}
							onmouseenter={(me) => {
								const r = plotEl?.getBoundingClientRect();
								if (r)
									evTip = {
										x: me.clientX - r.left,
										y: me.clientY - r.top,
										title: `${c.members.length} events`,
										sub: clusterRange(c.members)
									};
							}}
							onmouseleave={onLaneLeave}
							onkeydown={(ke) => {
								if (ke.key === 'Enter' || ke.key === ' ') {
									ke.preventDefault();
									zoomToCluster(c.members);
								}
							}}
						>
							<title>{c.members.length} events, {clusterRange(c.members)}</title>
							<rect
								x={c.x0}
								y={c.y - 8}
								width={Math.max(16, c.x1 - c.x0)}
								height="16"
								rx="8"
								class="ev-cluster"
								class:sel={membersSel}
							/>
							<text x={cx} y={c.y + 3.5} class="ev-cluster-count">{c.members.length}</text>
						</g>
					{/each}
				</g>
			{/if}

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
										{@const dim = anyFocus && !eventFocus && !focus && !tied}
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
				<!-- The events layer's own header. It is the door to the expanded
				     view, so it is a control, not a caption: highlighted, sized to
				     the band, and carrying the count and an expand affordance. -->
				<g
					class="lane-head"
					data-no-pan
					role="button"
					tabindex="0"
					aria-label={expanded ? t('chronicle.events.collapse') : t('chronicle.events.expand')}
					onclick={() => setView(expanded ? 'timeline' : 'events')}
					onkeydown={(ke) => {
						if (ke.key === 'Enter' || ke.key === ' ') {
							ke.preventDefault();
							setView(expanded ? 'timeline' : 'events');
						}
					}}
				>
					<title>{expanded ? t('chronicle.events.collapse') : t('chronicle.events.expand')}</title>
					<rect x="4" y={LANE_TOP + 4} width={GUTTER - 10} height="30" rx="6" class="lane-head-bg" />
					<text x="13" y={LANE_TOP + 23} class="lane-head-label">{t('timeline.lane.event')}</text>
					<text x={GUTTER - 42} y={LANE_TOP + 23} class="lane-head-count" text-anchor="end">{laneEvents.length}</text>
					<g class="lane-head-icon" transform="translate({GUTTER - 22},{LANE_TOP + 11})">
						{#if expanded}
							<g transform="scale(0.66)">
								<polyline points="4 14 10 14 10 20" />
								<polyline points="20 10 14 10 14 4" />
								<line x1="14" y1="10" x2="21" y2="3" />
								<line x1="3" y1="21" x2="10" y2="14" />
							</g>
						{:else}
							<g transform="scale(0.66)">
								<polyline points="15 3 21 3 21 9" />
								<polyline points="9 21 3 21 3 15" />
								<line x1="21" y1="3" x2="14" y2="10" />
								<line x1="3" y1="21" x2="10" y2="14" />
							</g>
						{/if}
					</g>
				</g>
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

				{#if headInDomain}
					<g clip-path="url(#plot-clip-local)" transform="translate({GUTTER},0)">
						<line x1={x(app.t)} x2={x(app.t)} y1={PAD_T - 2} y2={layout.height} class="playhead" />
						<!-- The cursor: a date chip and grip on the axis, draggable there. -->
						<g class="axis-head" transform="translate({headX},0)">
							<rect class="axis-tag-bg" x="-31" y="1" width="62" height="13" rx="3" />
							<text class="axis-tag" x="0" y="10.5" text-anchor="middle">{axisDateLabel}</text>
							<path class="axis-grip" d="M -5 {PAD_T - 12} h 10 l -5 10 z" />
						</g>
					</g>
				{/if}

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

			{#if evTip}
				<div
					class="ev-tip"
					style:left="{Math.min(evTip.x + 12, Math.max(8, width - 240))}px"
					style:top="{evTip.y + 16}px"
				>
					<strong>{evTip.title}</strong>
					<span class="mono">{evTip.sub}</span>
				</div>
			{/if}

			{#if clusterPop}
				<div
					class="ev-pop"
					style:left="{clusterPop.x}px"
					style:top="{clusterPop.y}px"
					role="dialog"
					aria-label="Events in this group"
				>
					<div class="ev-pop-head">
						<span class="mono">{clusterPop.members.length} events</span>
						<button onclick={() => zoomToCluster(clusterPop?.members ?? [])}>Zoom in</button>
						<button class="ev-pop-x" onclick={() => (clusterPop = null)} aria-label="Close">×</button>
					</div>
					<ul>
						{#each clusterPop.members as m (m.id)}
							<li>
								<button
									class="ev-pop-row"
									onclick={() => {
										app.select(m.id);
										clusterPop = null;
									}}
								>
									<span class="ev-pop-d mono">{formatDate(m.interval.startEarliest, 'day')}</span>
									<span class="ev-pop-t">{eventTitle(m)}</span>
									<i class="ev-pop-b" style:--c={BASIS_COLOR[m.basis as Basis]} aria-hidden="true"></i>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>

	<details class="a11y">
		<summary>{t('chronicle.table')}</summary>
		<table>
			<caption>Officeholders by post, with the span each source actually supports.</caption>
			<thead>
				<tr><th>Post</th><th>Holder</th><th>Span</th><th>Duration</th><th>Evidence</th><th>Origins</th></tr>
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
							<td>{pos.origins ?? pos.independence ?? '?'}</td>
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
		<table>
			<caption>{t('timeline.lane.event')}</caption>
			<thead>
				<tr><th>Date</th><th>Event</th><th>Category</th><th>Rupture</th><th>Evidence</th><th>Origins</th></tr>
			</thead>
			<tbody>
				{#each eventsSorted.filter(eventPasses) as e (e.id)}
					<tr>
						<td>{formatDate(e.interval.startEarliest, 'day')}</td>
						<td>{eventTitle(e)}</td>
						<td>{e.category}</td>
						<td>{e.rupture ? 'yes' : 'no'}</td>
						<td>{e.confidence}</td>
						<td>{e.origins ?? e.independence ?? '?'}</td>
					</tr>
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
	/* The events view's filter row. Horizontal scroll on narrow screens, the
	   same pattern as the era chips. */
	.events-bar {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.events-bar::-webkit-scrollbar {
		display: none;
	}
	.eb-label {
		flex-shrink: 0;
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-inline-end: var(--s-1);
	}
	.eb-chip {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		padding: 2px 9px;
		font-size: var(--t-2xs);
		color: var(--text-secondary);
		background: var(--surface-raised);
		white-space: nowrap;
	}
	.eb-chip:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.eb-chip.on {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}
	.eb-chip.off {
		color: var(--text-faint);
		border-style: dashed;
	}
	.eb-n {
		color: var(--text-faint);
	}
	.eb-sep {
		flex-shrink: 0;
		width: 1px;
		height: 14px;
		background: var(--border-default);
		margin-inline: var(--s-2);
	}
	.eb-count {
		flex-shrink: 0;
		margin-inline-start: auto;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		padding-inline-start: var(--s-4);
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
		pointer-events: none;
	}
	.rupture-dot {
		fill: var(--rupture);
	}
	.rupture-tag {
		cursor: help;
	}

	/* Events lane. Marks reuse the basis language (opacity) and rupture red;
	   category never gets a hue. Connectors stay in the lane: solid accent
	   forward to consequences, dashed faint back to causes. */
	.lane-head {
		cursor: pointer;
	}
	.lane-head-bg {
		fill: color-mix(in oklch, var(--accent) 9%, var(--surface-raised));
		stroke: var(--accent-border);
		stroke-width: 1;
		transition:
			fill var(--dur-fast) var(--ease-out),
			stroke var(--dur-fast) var(--ease-out);
	}
	.lane-head:hover .lane-head-bg {
		fill: color-mix(in oklch, var(--accent) 16%, var(--surface-raised));
		stroke: var(--accent);
	}
	.lane-head:focus-visible .lane-head-bg {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.lane-head-label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		fill: var(--accent);
	}
	.lane-head-count {
		font-family: var(--font-mono);
		font-size: 9.5px;
		fill: var(--text-faint);
	}
	.lane-head-icon {
		color: var(--accent);
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ev-mark {
		/* Picking is owned by the lane background (lanePick), so a wide bar can
		   never swallow a click meant for a point beside it. */
		pointer-events: none;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	/* Expanded mode stacks rows, so each mark is unambiguous and can own its
	   click directly — no nearest-point needed there. */
	.ev-mark.clickable {
		pointer-events: auto;
		cursor: pointer;
	}
	.ev-row-line {
		stroke: var(--border-subtle);
		stroke-width: 1;
		pointer-events: none;
	}
	.ev-mark.dim {
		opacity: 0.3;
	}
	.ev-mark:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.ev-lane-bg {
		/* A quiet accent wash marks the events band as its own layer. */
		fill: color-mix(in oklch, var(--accent) 4%, transparent);
		cursor: pointer;
	}
	.ev-diamond {
		fill: var(--rupture);
	}
	.ev-diamond.sel {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.ev-dot {
		fill: var(--text-secondary);
	}
	.ev-dot.sel {
		fill: var(--accent);
	}
	.ev-pill {
		fill: var(--text-secondary);
	}
	.ev-pill.sel {
		fill: var(--accent);
	}
	.ev-contested {
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1;
		stroke-dasharray: 2 2;
	}
	.ev-selring {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	/* Cluster badge: an aggregate is a different thing from an event, so it
	   reads as a counted chip rather than a mark. */
	.ev-cluster {
		fill: var(--surface-overlay);
		stroke: var(--border-strong);
		stroke-width: 1;
	}
	.ev-cluster.sel {
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.ev-cluster-count {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 600;
		fill: var(--text-primary);
		text-anchor: middle;
	}
	/* Long-duration track: thinner than a mark and clearly off the point row. */
	.ev-spanbar {
		fill: var(--text-secondary);
	}
	.ev-spanbar.sel {
		fill: var(--accent);
		stroke: var(--accent);
		stroke-width: 2;
	}
	.ev-label {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--text-secondary);
	}
	.ev-link-conseq {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.ev-link-cause {
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1.4;
		stroke-dasharray: 4 3;
	}

	/* Lane hover preview and the cluster's list. Same surface language as the
	   tenure tooltip; the cluster popover is interactive, the preview is not. */
	.ev-tip {
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
	.ev-tip strong {
		font-weight: 500;
	}
	.ev-tip .mono {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.ev-pop {
		position: absolute;
		z-index: 30;
		width: 296px;
		max-height: 320px;
		overflow-y: auto;
		background: var(--surface-panel);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-md);
		box-shadow: var(--elev-3);
		padding: var(--s-3);
	}
	.ev-pop-head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: 0 var(--s-1) var(--s-2);
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.ev-pop-head button {
		margin-inline-start: auto;
		font-size: var(--t-2xs);
		color: var(--accent);
		border: 1px solid var(--accent-border);
		border-radius: var(--r-sm);
		padding: 2px 8px;
	}
	.ev-pop-head .ev-pop-x {
		margin-inline-start: 0;
		color: var(--text-faint);
		border-color: transparent;
		font-size: var(--t-lg);
		line-height: 1;
		padding: 0 6px;
	}
	.ev-pop ul {
		list-style: none;
		margin: var(--s-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.ev-pop-row {
		display: grid;
		grid-template-columns: 9ch 1fr auto;
		align-items: baseline;
		gap: var(--s-2);
		width: 100%;
		text-align: start;
		padding: var(--s-1) var(--s-2);
		border-radius: var(--r-sm);
	}
	.ev-pop-row:hover {
		background: var(--surface-hover);
	}
	.ev-pop-d {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.ev-pop-t {
		font-size: var(--t-sm);
		color: var(--text-secondary);
		line-height: var(--lh-snug);
	}
	.ev-pop-row:hover .ev-pop-t {
		color: var(--text-primary);
	}
	.ev-pop-b {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--c, var(--text-muted));
		align-self: center;
	}

	.playhead {
		stroke: var(--text-primary);
		stroke-width: 1.3;
		opacity: 0.85;
		pointer-events: none;
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
