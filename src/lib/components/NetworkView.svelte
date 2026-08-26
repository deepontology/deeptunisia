<script lang="ts">
import { untrack } from 'svelte';
import { page } from '$app/state';
import { app } from '$lib/state.svelte';
import Tooltip from '$lib/ui/Tooltip.svelte';
import { t, tf, formatDate, nameOf, layerLabel, basisLabel, relLabel } from '$lib/t.svelte';
import { format } from '$lib/i18n';
import Chip from '$lib/ui/Chip.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import ConnectionCard from './ConnectionCard.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { Camera } from '$lib/viz/camera.svelte';
	import { navigable } from '$lib/viz/gestures';
	import { placeLabels, type LabelDir } from '$lib/viz/place';
	import NavControls from '$lib/viz/NavControls.svelte';
	import {
		BASIS_COLOR,
		BASIS_OPACITY,
		BASIS_ORDER,
		CUTOFF,
		DASH,
		FLOOR,
		LAYER_COLOR,
		LAYERS,
		ds,
		institutionById,
		meetsBasis,
		personById,
		positionsByHolder,
		possiblyActive,
		relKind,
		resolveEntity,
		type Basis,
		type Layer,
		type Position
	} from '$lib/model';
	import { GROUPS, REL_TYPE_COLOR, groupOf } from '$lib/viz/groups';
	import { tradeIn, debtIn } from '$lib/world/countries';
	import { moneyM } from '$lib/world/format';

	/**
	 * Layered network.
	 *
	 * Deliberately NOT a force-directed layout. Free force layouts are pretty,
	 * unreadable, and different on every page load — all three are disqualifying for
	 * a research artifact. Instead each analytical layer gets a fixed lane, so the
	 * cross-layer bridges the project is hunting become literally the edges that
	 * cross lanes.
	 *
	 * Node positions are computed once over the whole dataset and never recomputed.
	 * That means scrubbing the date fades nodes in and out of a stable map rather
	 * than reshuffling it, so change is perceptible instead of disorienting.
	 */

	/*
	 * The world.
	 *
	 * Deliberately larger than any screen. Before the camera existed these numbers
	 * had to be a compromise with the smallest viewport that would ever see them,
	 * which is why nodes were drawn at three pixels with most labels suppressed —
	 * the map was sized to be survivable at a glance rather than readable up close.
	 * Now the reader moves over it, so it can be sized for reading.
	 */
	const W = 2600;
	const H = 1700;
	const PAD_TOP = 72;
	const PAD_BOTTOM = 48;
	const NODE_GAP = 42;

	/**
	 * Gutter channel width, in world units.
	 *
	 * Cross-layer edges do not cross a lane boundary at an arbitrary point: they
	 * leave their source lane, travel vertically in the channel between the two
	 * lanes, and enter the target lane. The gutter is the finding made visible —
	 * "which pairs of analytical layers actually exchange people and money" is a
	 * question the layout answers structurally instead of by counting strokes.
	 */
	const GUTTER_W = 56;

	/** Lane width with gutters absorbed: every lane shares the gutter cost equally. */
	const FULL_LANE_W = (W - GUTTER_W * (LAYERS.length - 1)) / LAYERS.length;

	let hoverEdge = $state<string | null>(null);

	/** A lane narrower than this cannot carry its own name, so fitting never goes there. */
	const MIN_LANE_PX = 132;

	const cam = new Camera({
		world: { w: W, h: H },
		minScale: 0.12,
		maxScale: 6,
		padding: 20,
		// Seven lanes across W minus six gutters: the scale at which one lane is
		// still nameable. On a phone this is what stops "fit" from producing seven
		// 55px columns that can only be read by zooming back in immediately.
		fitFloor: MIN_LANE_PX / FULL_LANE_W
	});

	/**
	 * Which labels are worth drawing right now.
	 *
	 * At the overview only the heaviest names fit without colliding; as the reader
	 * moves in, the threshold drops and more of the map names itself. This is the
	 * substitute for a collision solver, and it is a better one for a fixed layout:
	 * the answer is stable and identical on every load.
	 */
	const labelFloor = $derived(Math.max(0, 60 - cam.zoomProgress * 60));

	interface Node {
		id: string;
		kind: 'person' | 'institution';
		name: string;
		layer: Layer;
		group: string;
		weight: number;
		/** Institution subtype (e.g. 'foreign-state', 'international-organisation'), people have none. */
		type?: string;
		x: number;
		y: number;
		r: number;
	}

	interface GroupBand {
		layer: Layer;
		group: string;
		/** Top of the reserved header strip. */
		headerY: number;
		/** Where nodes begin (below the header). */
		contentTop: number;
		contentBottom: number;
		memberCount: number;
	}

	// --- Stable global layout -------------------------------------------------

	/**
	 * Height of the header strip at the top of each group band. Nodes never enter it.
	 *
	 * Deliberately generous. The header text is HTML at a fixed screen size (~17px
	 * box, glyphs ~13px), while the strip is world units the camera scales. At the
	 * fit floor (k≈0.355) the nearest node's top edge must stay below the glyphs even
	 * at minimum radius (3.5px), so the band has to cover text + a node of slack:
	 * (13 + 4 + 4)px ÷ 0.355 ≈ 59 world units. Smaller than that and the first row
	 * of nodes collides with the very title meant to organise them; this is the
	 * exact failure the redesign set out to fix.
	 */
	const HEADER_H = 60;
	const GROUP_GAP = 26;

	const layout = $derived.by(() => {
		const lanes = LAYERS.filter((l) => app.activeLayers.has(l));
		// Each lane gives up half of each neighbouring gutter, so the world always
		// sums to W: lanes + gutters tile it exactly.
		const laneW = lanes.length > 1 ? (W - GUTTER_W * (lanes.length - 1)) / lanes.length : W;
		const usableH = H - PAD_TOP - PAD_BOTTOM;
		const nodes = new Map<string, Node>();
		const groupBands: GroupBand[] = [];

		for (const [li, layer] of lanes.entries()) {
			const members: { id: string; kind: 'person' | 'institution'; name: string; group: string; weight: number; type?: string }[] = [];

			for (const p of ds.people) {
				if ((p.layers[0] as Layer) !== layer) continue;
				members.push({ id: p.id, kind: 'person', name: nameOf(p), group: p.group, weight: p.peakAuthority });
			}
			for (const i of ds.institutions) {
				if ((i.layer as Layer) !== layer) continue;
				members.push({ id: i.id, kind: 'institution', name: nameOf(i), group: i.group, weight: 62, type: i.type });
			}

			// Group members by their group field
			const groupMap = new Map<string, typeof members>();
			for (const m of members) {
				if (!groupMap.has(m.group)) groupMap.set(m.group, []);
				groupMap.get(m.group)!.push(m);
			}

			// Determine group order: use defined order from GROUPS if available,
			// then alphabetical, with "Other" always last.
			const layerGroups = GROUPS.find((g) => g.layer === layer);
			const groupOrder: string[] = [];
			if (layerGroups) {
				for (const sg of layerGroups.subsections) {
					if (groupMap.has(sg.id)) groupOrder.push(sg.id);
				}
			}
			// Add any groups not in the definition (shouldn't happen, but safety)
			for (const g of groupMap.keys()) {
				if (!groupOrder.includes(g)) groupOrder.push(g);
			}
			// Ensure "Other" is last
			const otherIdx = groupOrder.indexOf('Other');
			if (otherIdx >= 0) {
				groupOrder.splice(otherIdx, 1);
				groupOrder.push('Other');
			}

		// Present groups only (some defined groups may have zero members)
		const present = groupOrder.filter((g) => (groupMap.get(g) ?? []).length > 0);
		const totalCount = members.length;
		if (totalCount === 0 || present.length === 0) continue;

		// Reserve one header strip per present group, plus inter-group gaps.
		// The remainder is split between the groups proportionally to member count,
		// so a four-person subsection does not stretch to the same height as a forty-person one.
		const headerSpace = present.length * HEADER_H;
		const gapSpace = (present.length - 1) * GROUP_GAP;
		const contentH = usableH - headerSpace - gapSpace;

		let cursor = PAD_TOP;

		for (const groupName of present) {
			const groupMembers = groupMap.get(groupName)!;
			// Sort within group by weight descending
			groupMembers.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

			// The group's own vertical slice, proportional to how many members it holds.
			// Foreign lane's two groups (States vs International Organisations, 30 vs
			// 15) would otherwise give the Organisations strip half the height and a
			// cramped 8-row grid that truncates labels as "Internati…". Split that
			// lane evenly so both groups breathe.
			const sliceH =
				layer === 'foreign' && present.length === 2
					? contentH / present.length
					: (groupMembers.length / totalCount) * contentH;
			const contentTop = cursor + HEADER_H;
			const contentBottom = contentTop + sliceH;

			groupBands.push({
				layer,
				group: groupName,
				headerY: cursor,
				contentTop,
				contentBottom,
				memberCount: groupMembers.length
			});

			// Arrange members in a grid inside the content zone only —
			// the header strip stays empty so titles are never covered.
			const perCol = Math.max(1, Math.floor(sliceH / NODE_GAP));
			const cols = Math.max(1, Math.ceil(groupMembers.length / perCol));
			const rows = Math.ceil(groupMembers.length / cols);
			const colGap = laneW / (cols + 1);
			const rowGap = sliceH / (rows + 1);

			groupMembers.forEach((m, idx) => {
				const col = idx % cols;
				const row = Math.floor(idx / cols);
				nodes.set(m.id, {
					...m,
					layer,
					x: laneX(li, laneW) + colGap * (col + 1),
					y: contentTop + rowGap * (row + 1),
					r: m.kind === 'institution' ? 8 : 5.2 + (m.weight / 100) * 8
				});
			});

			cursor = contentBottom + GROUP_GAP;
		}
		}

		return { nodes, lanes, laneW, groupBands };
	});

	// --- Slice ----------------------------------------------------------------

	const slice = $derived.by(() => {
		const activePositions = ds.positions.filter(
			(p) =>
				possiblyActive(p.interval, app.t) &&
				meetsBasis(p.basis as Basis, app.basisFloor) &&
				app.activeLayers.has(p.layer as Layer)
		);
		const live = new Set<string>();
		for (const p of activePositions) {
			live.add(p.holder);
			if (p.institution) live.add(p.institution);
		}

		const edges = [];
		// relCandidates: authored relationships that would render in 'all' mode.
		// relShown: what the current mode actually keeps. The difference is the
		// honesty count the toolbar reports — hidden edges are named, not silent.
		let relCandidates = 0;
		let relShown = 0;
		for (const rel of ds.relationships) {
			if (!meetsBasis(rel.basis as Basis, app.basisFloor)) continue;
			const a = layout.nodes.get(rel.from);
			const b = layout.nodes.get(rel.to);
			if (!a || !b) continue;
			relCandidates++;
			// Minimal influence map (spec §10/§13): filter the edges down to a layer
			// of interest — influence-family + ownership + appointment, or the
			// corporate ownership graph (ownership/board/shareholder/funding) — so
			// the routes read alone instead of under the full graph.
			if (mode === 'influence' && !INFLUENCE_TYPES.has(rel.type) && rel.type !== 'ownership' && rel.type !== 'appointment') continue;
			if (mode === 'ownership' && !['ownership', 'board', 'shareholder', 'funding'].includes(rel.type)) continue;
			relShown++;
			// Undated structural ties (a family relationship, a business holding)
			// persist; dated ties only appear inside their span.
                // Undated structural ties (family, business, ownership) persist
                // regardless of whether either endpoint holds an active position.
                // Dated ties (appointments, prosecutions) only show when their
                // interval overlaps app.t AND at least one endpoint is live.
                const dated = rel.interval.raw.start !== null;
                const timeOk = !dated || possiblyActive(rel.interval, app.t);
                edges.push({
                    id: rel.id,
                    rel,
                    a,
                    b,
                    active: timeOk && (!dated || live.has(rel.from) || live.has(rel.to)),
				crossLayer: a.layer !== b.layer,
				kind: relKind(rel.type)
			});
		}

		/*
		 * Derived measurements: the network finally shows that a flow is a
		 * relationship without pretending it is an authored claim. Only pairs for
		 * which the graph already has a node are eligible; an absent foreign-state
		 * record remains a visible gap in the World ledger rather than becoming a
		 * fabricated node here. The edge id is deliberately namespaced `flow-` and
		 * never enters data/relationships.yaml.
		 */
		const tunisia = layout.nodes.get('etat-tunisien');
		if (tunisia) {
			const year = new Date(app.t).getUTCFullYear();
			const byIso = new Map(
				ds.institutions
					.map((i) => [(i as unknown as { iso2?: string }).iso2, i] as const)
					.filter(([iso]) => Boolean(iso))
			);
			for (const flow of tradeIn(year).slice(0, 20)) {
				const target = byIso.get(flow.iso2);
				const b = target ? layout.nodes.get(target.id) : undefined;
				if (!b) continue;
				const id = `flow-trade-${year}-${flow.iso2}`;
				edges.push({
					id,
					rel: {
						id,
						from: 'etat-tunisien',
						to: target!.id,
						type: 'trade-flow',
						subtype: String(year),
						description: tf('network.flow.trade.description', {
							year,
							value: moneyM(flow.total, app.locale)
						}),
						sources: []
					} as never,
					a: tunisia,
					b,
					active: true,
					crossLayer: tunisia.layer !== b.layer,
					kind: 'documented' as const,
					measurement: true,
					flowValue: flow.total
				});
			}
			for (const flow of debtIn(year).slice(0, 20)) {
				const target = flow.institutionId
					? ds.institutions.find((i) => i.id === flow.institutionId)
					: byIso.get(flow.iso2);
				const b = target ? layout.nodes.get(target.id) : undefined;
				if (!b || flow.stock === null) continue;
				const id = `flow-debt-${year}-${flow.institutionId ?? flow.iso2}`;
				edges.push({
					id,
					rel: {
						id,
						from: 'etat-tunisien',
						to: target!.id,
						type: 'debt-flow',
						subtype: String(year),
						description: tf('network.flow.debt.description', {
							year,
							value: moneyM(flow.stock, app.locale)
						}),
						sources: []
					} as never,
					a: tunisia,
					b,
					active: true,
					crossLayer: tunisia.layer !== b.layer,
					kind: 'documented' as const,
					measurement: true,
					flowValue: flow.stock
				});
			}
		}

		// Parallel cross-layer edges between the same two endpoints share one
		// gutter; spread them a few world units so a bundle reads as a bundle
		// instead of one stroke. Deterministic: it depends only on the edge list.
		const crossPairs = new Map<string, (typeof edges)[number][]>();
		for (const e of edges) {
			if (!e.crossLayer) continue;
			const key = e.rel.from < e.rel.to ? e.rel.from + '|' + e.rel.to : e.rel.to + '|' + e.rel.from;
			const list = crossPairs.get(key) ?? [];
			list.push(e);
			crossPairs.set(key, list);
		}
		for (const list of crossPairs.values()) {
			const n = list.length;
			list.forEach((e, i) => {
				(e as { gxOff?: number }).gxOff = (i - (n - 1) / 2) * 5;
			});
		}

		// Edge multiplicity: how many authored relationships share one directed
		// pair (e.g. family + business + prosecution between the same two
		// entities). A thick edge is a DENSE relationship, not a longer line —
		// the width multiplies, capped so a triple tie does not shout.
		const pairCount = new Map<string, number>();
		for (const e of edges) {
			const key = e.rel.from + '\u2192' + e.rel.to;
			pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
		}
		for (const e of edges) {
			(e as { multi?: number }).multi = Math.min(3, pairCount.get(e.rel.from + '\u2192' + e.rel.to) ?? 1);
		}

		// Institutional membership edges: person -> institution while in post.
		for (const p of activePositions) {
			const a = layout.nodes.get(p.holder);
			const b = layout.nodes.get(p.institution);
			if (!a || !b) continue;
			edges.push({
				id: 'pos-' + p.id,
				rel: {
					id: 'pos-' + p.id,
					from: p.holder,
					to: p.institution,
					type: 'institutional',
					confidence: p.confidence,
					description: p.roleTitle,
					subtype: p.roleTitle,
					attributed_to: undefined,
					sources: p.sources
				} as never,
				a,
				b,
				active: true,
				crossLayer: a.layer !== b.layer,
				kind: 'documented' as const
			});
		}

		return { live, edges, relCandidates, relShown };
	});

	/**
	 * Fly to whatever got selected, including selections made in another view or from
	 * the search palette. Travelling there is what tells the reader the map moved
	 * rather than changed; a jump cut leaves them re-reading the lanes to work out
	 * where they are.
	 *
	 * A selection made by CLICKING the map flies GENTLY: the reader is already
	 * looking at that node, so the flight eases in and out to a slight zoom
	 * (1.5× of fit, never zooming out), centred in the visible map area — the
	 * canvas already excludes the docked inspector, so the centre is clear of the
	 * card. The resize-pan is suppressed so the inspector docking does not lurch
	 * the map a moment before the flight starts. Every other path (Chronicle,
	 * search, deep links, connection-card endpoints) flies strong, because that
	 * navigation must travel.
	 *
	 * `untrack` is not optional. `flyTo` reads cam.k, cam.fitScale and the viewport
	 * size and writes cam.x/y/k — inside a tracked scope that is an effect writing
	 * state it also reads, which self-triggers and makes Svelte abort the entire
	 * effect tree. That failure renders the app blank with only a `get_first_child`
	 * error to go on, and it has already cost this project a debugging session once.
	 * See AGENTS.md.
	 */
	let selectFly: 'gentle' | 'strong' = 'strong';
	$effect(() => {
		const id = app.selected;
		if (!id) return;
		untrack(() => {
			const mode = selectFly;
			selectFly = 'strong';
			const n = layout.nodes.get(id);
			if (!n) return;
			if (mode === 'gentle') {
				// On a phone the inspector is a bottom sheet: centre above it so the
				// node does not land underneath the card. Desktop cx/cy stay live
				// (undefined) so a mid-flight resize moves the destination smoothly.
				cam.flyTo(
					n.x,
					n.y,
					Math.max(cam.k, cam.fitScale * 1.5),
					640,
					'inout',
					undefined,
					compact.current ? cam.vh * 0.35 : undefined
				);
			} else {
				cam.flyTo(n.x, n.y, Math.max(cam.k, cam.fitScale * 2.2));
			}
		});
	});

	/**
	 * Opening framing.
	 *
	 * Whenever the world is wider than the window — always on a phone, because of
	 * fitFloor — centring lands the reader on the boundary between two lanes with the
	 * dense end off-screen. Security and political hold most of the record, so the
	 * camera starts there and the reader pans right into the thinner layers.
	 *
	 * `framed` is a plain `let`, not `$state`: an effect that wrote state it also read
	 * would self-trigger. `cam.vw` is read tracked, which is what fires this once the
	 * element has actually been measured; the writes go inside `untrack`.
	 */
	let framed = false;
	$effect(() => {
		if (framed || cam.vw < 2) return;
		framed = true;
		untrack(() => {
			if (W * cam.fitScale > cam.vw + 1) cam.alignTo(0, H / 2, 0.03, 0.5);
		});
	});

	const focus = $derived(app.selected ?? app.hovered);

	// Attention rings replace the old binary neighbours set; see the `rings`
	// derivation further down (it must sit after the slice, which builds it on).

	/**
	 * x position of the left edge of lane i, gutters between lanes.
	 * The world is tiled lanes + gutters with no dead space: lane 0 spans
	 * [0, laneW), gutter 0 spans [laneW, laneW + GUTTER_W), lane 1 follows.
	 */
	function laneX(i: number, laneW: number) {
		return i * (laneW + GUTTER_W);
	}

	/** Centre of the gutter channel between lane k and lane k+1. */
	function gutterCenter(k: number, laneW: number) {
		return laneX(k + 1, laneW) - GUTTER_W / 2;
	}

	/**
	 * The control point of an edge's curve.
	 *
	 * Factored out because two things need it and they must never disagree: the path
	 * itself, and the point the connection card is anchored to. A card that opens
	 * somewhere the line does not pass through reads as a bug in the data.
	 */
	function control(a: Node, b: Node) {
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		// Bow perpendicular to the connection so parallel edges separate. The side
		// is a strict function of vertical direction — downward edges bow one
		// way, upward the other — which reads as a weak direction cue, but the
		// real direction is the arrowhead on focus. (An axial "lean toward the
		// target" was tried and withdrawn: the probe proved its side flipped
		// within a direction class depending on edge length, which made the cue
		// contradict itself.)
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const bow = Math.min(90, len * 0.14);
		return { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
	}

	interface Route {
		/** The visible path, trimmed to the nodes' edges so an arrowhead is not buried. */
		d: string;
		/** The untrimmed centre-to-centre path for the fat invisible hit twin. */
		dh: string;
		kind: 'same' | 'cross';
		mid: { x: number; y: number };
	}

	/**
	 * The path an edge actually draws.
	 *
	 * Same-layer edges keep the perpendicular bow that separates parallel curves.
	 * Cross-layer edges travel in the gutter: they leave the source node toward the
	 * channel between the two lanes, run vertically inside it, and enter the target
	 * node — so the crossing happens in the channel, not at an arbitrary point of
	 * the map. `gutterOff` spreads parallel edges between the same two endpoints so
	 * a bundle reads as a bundle instead of one stroke.
	 *
	 * The cubic midpoint (t = 0.5) is where the connection card anchors; the card
	 * and the line it describes can therefore never disagree.
	 */
	function routeEdge(a: Node, b: Node, laneW: number, gutterOff = 0): Route {
		const ra = Math.max(a.r, 3);
		const rb = Math.max(b.r, 3);
		const ia = layout.lanes.indexOf(a.layer);
		const ib = layout.lanes.indexOf(b.layer);
		if (ia >= 0 && ib >= 0 && ia !== ib) {
			// The gutter adjacent to the source lane in the direction of travel:
			// right of the source lane when the target is to the right, left when
			// the target is to the left.
			const k = ib > ia ? ia : ia - 1;
			const gx = gutterCenter(k, laneW) + gutterOff;
			const c1 = { x: gx, y: a.y };
			const c2 = { x: gx, y: b.y };
			// The curve leaves the node horizontally and enters horizontally, so
			// trimming is a straight nudge along the lane axis. The hit twin keeps
			// the full span so a click near the node edge still catches the line.
			const sx = Math.sign(gx - a.x) || 1;
			const ex = Math.sign(b.x - gx) || 1;
			const a2 = { x: a.x + sx * ra, y: a.y };
			const b2 = { x: b.x - ex * rb, y: b.y };
			return {
				d: `M${a2.x},${a2.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b2.x},${b2.y}`,
				dh: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`,
				kind: 'cross',
				mid: {
					x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
					y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8
				}
			};
		}
		const c = control(a, b);
		const start = trimAlong(a, c, ra);
		const end = trimAlong(b, c, rb, true);
		return {
			d: `M${start.x},${start.y} Q${c.x},${c.y} ${end.x},${end.y}`,
			dh: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`,
			kind: 'same',
			mid: {
				x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x,
				y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y
			}
		};
	}

	/** A point a few units along the line (node → control), or (control → node) when reversed. */
	function trimAlong(
		p: { x: number; y: number },
		toward: { x: number; y: number },
		dist: number,
		reversed = false
	) {
		const dx = toward.x - p.x;
		const dy = toward.y - p.y;
		const len = Math.hypot(dx, dy) || 1;
		const f = reversed ? dist : -dist;
		return { x: p.x - (dx / len) * f, y: p.y - (dy / len) * f };
	}

	/** Every edge's path and card anchor, recomputed only when the layout or slice changes. */
	const routes = $derived.by(() => {
		const m = new Map<string, Route>();
		for (const e of slice.edges) {
			m.set(e.id, routeEdge(e.a, e.b, layout.laneW, (e as { gxOff?: number }).gxOff ?? 0));
		}
		return m;
	});

	const INFLUENCE_TYPES = new Set(['influence', 'reported-influence', 'advisory']);
	let mode = $state<'all' | 'influence' | 'ownership'>('influence');

	/** One-shot: `?mode=` on arrival selects a lens, exactly like `?id=`/`?rel=` select a subject. */
	let modeLinked = false;
	function syncModeUrl(m: typeof mode) {
		if (typeof history === 'undefined') return;
		const u = new URL(page.url.href);
		if (m === 'influence') u.searchParams.delete('mode');
		else u.searchParams.set('mode', m);
		history.replaceState(null, '', u);
	}

	/**
	 * Spec §10: influence-family edges render at width ∝ authored strength
	 * (0.8–4), everything else at the default. The width is a claim about a
	 * claim — strength is an editorial judgement stored on the edge.
	 *
	 * Multiplicity multiplies: N relationships between the same directed pair
	 * render at ×(1 + 0.5(N−1)), capped at ×2. Density reads as thickness.
	 */
	function influenceWidth(rel: { type: string; influence?: { strength?: number } }, multi = 1): number {
		const strength = INFLUENCE_TYPES.has(rel.type) ? rel.influence?.strength : undefined;
		const base = strength ? 0.8 + strength * 3.2 : 1.4;
		return base * (1 + 0.5 * Math.min(2, Math.max(1, multi) - 1));
	}

	/** Flow edges are measurements, not claims: no basis dash or opacity ramp. */
	function isMeasurementEdge(e: { id: string }): boolean {
		return e.id.startsWith('flow-');
	}

	function edgeDash(e: { id: string; rel: { basis?: Basis } }): string | undefined {
		return isMeasurementEdge(e) ? undefined : DASH[e.rel.basis as Basis];
	}

	function edgeOpacity(e: { id: string; rel: { basis?: Basis } }, multiplier = 1): number {
		return isMeasurementEdge(e) ? 0.56 * multiplier : BASIS_OPACITY[e.rel.basis as Basis] * multiplier;
	}

	function edgeWidth(e: { id: string; rel: { type: string; influence?: { strength?: number } }; flowValue?: number }, multi = 1): number {
		if (!isMeasurementEdge(e)) return influenceWidth(e.rel, multi);
		// Flow values are USD millions. Sqrt keeps a ten-billion stream from
		// becoming ten times as thick as a one-billion stream, while still making
		// magnitude visible in the network.
		return 1.1 + Math.min(4.8, Math.sqrt(Math.max(0, e.flowValue ?? 0)) / 22);
	}

	/**
	 * The staged edge colour language.
	 *
	 * At rest, an edge is coloured by its source layer (or `--bridge` when it
	 * crosses layers) — the map reads by analytical layer. The moment a node is
	 * focused, ONLY the edges touching it recolor to their relationship type; every
	 * other edge stays in layer mode. One language, two scopes, and the map does
	 * not change colour underneath the reader.
	 */
	function edgeColor(e: {
		rel: { type: string; from: string; to: string };
		a: Node;
		b: Node;
		crossLayer: boolean;
	}): string {
		if (focus && (e.rel.from === focus || e.rel.to === focus)) {
			return REL_TYPE_COLOR[e.rel.type] ?? LAYER_COLOR[e.a.layer];
		}
		if (e.crossLayer) return 'var(--bridge)';
		return LAYER_COLOR[e.a.layer];
	}

	/**
	 * How strongly an edge is emphasised, as a multiplier on its basis opacity.
	 *
	 * Distance from the focus, not a binary on/off: incident edges read at full
	 * strength, one-hop edges at half, two-hop at a third, everything else at a
	 * trace. Without a focus, active edges are full and idle ones are context.
	 */
	function edgeEmphasis(e: { rel: { from: string; to: string }; active: boolean; a: Node; b: Node }): number {
		if (!focus) return e.active ? 1 : 0.16;
		const inc = e.rel.from === focus || e.rel.to === focus;
		if (inc) return 1;
		if (rings && rings.one.has(e.rel.from) && rings.one.has(e.rel.to)) return 0.55;
		if (rings && rings.two.has(e.rel.from) && rings.two.has(e.rel.to)) return 0.3;
		return 0.14;
	}

	/**
	 * Attention rings — the graduated focus model.
	 *
	 * `one` is the ego plus its direct neighbours; `two` is the neighbours of
	 * neighbours. Everything else is "rest". Distance is encoded by opacity and
	 * label weight only, never by colour: colour is the reserved vocabulary of
	 * layer, basis and relationship type. Rings compose with the existing semantic
	 * zoom — two-hop emphasis only kicks in once the camera is close enough that
	 * the roster itself is drawn.
	 */
	const rings = $derived.by(() => {
		if (compare) return null; // compare mode owns the emphasis; rings stand down
		if (!focus) return null;
		const one = new Set<string>([focus]);
		const two = new Set<string>();
		for (const e of slice.edges) {
			if (e.rel.from === focus) one.add(e.rel.to);
			else if (e.rel.to === focus) one.add(e.rel.from);
		}
		// Structural relevance for the two-ring, not raw adjacency. A node earns
		// a place if it CONVERGES with the ego-network (ties to >= 2 distinct
		// one-ring members — it is a meeting point) or is itself notable (high
		// peak authority, or any institution, which anchors a whole structure).
		// A hub's sprawling fan — dozens of nodes whose only relevance is
		// "connected to the hub" — stays out, so two-hop emphasis shows
		// structure, not adjacency noise.
		const oneCount = new Map<string, number>();
		for (const e of slice.edges) {
			const aIn = one.has(e.rel.from) && e.rel.from !== focus;
			const bIn = one.has(e.rel.to) && e.rel.to !== focus;
			if (aIn && e.rel.to !== focus) oneCount.set(e.rel.to, (oneCount.get(e.rel.to) ?? 0) + 1);
			if (bIn && e.rel.from !== focus) oneCount.set(e.rel.from, (oneCount.get(e.rel.from) ?? 0) + 1);
		}
		for (const [id, count] of oneCount) {
			const n = layout.nodes.get(id);
			if (!n || one.has(id)) continue;
			if (count >= 2 || n.kind === 'institution' || (n.weight ?? 0) >= 45) two.add(id);
		}
		return { one, two };
	});

	/**
	 * Node emphasis as a class name: the ring a node sits in, or `dormant` when
	 * nothing is focused and it is not live at the current instant.
	 */
	function nodeRingClass(n: { id: string }): string {
		if (compare) return ''; // compare mode draws everything at full strength
		if (!focus) return slice.live.has(n.id) ? '' : 'dormant';
		if (rings!.one.has(n.id)) return 'r-one';
		if (rings!.two.has(n.id)) return 'r-two';
		return 'r-rest';
	}

	/** Smoothstep 0→1 across [lo, hi]: the crossfade helper for semantic zoom. */
	function smoothStep(v: number, lo: number, hi: number): number {
		const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
		return t * t * (3 - 2 * t);
	}

	const stats = $derived.by(() => {
		const visible = shownEdges.filter((e) => e.active);
		// Dormant = nodes in their temporal interval but not holding a position at
		// this instant.  Nodes outside their interval are not drawn and not counted:
		// "in play" is the honest description of what the number represents.
		const dormant = [...layout.nodes.values()].filter((n) => {
			if (!hasAppeared(n.id)) return false;
			return !slice.live.has(n.id);
		}).length;
		return {
			nodes: slice.live.size,
			dormant,
			edges: visible.length,
			bridges: visible.filter((e) => e.crossLayer).length,
			reported: visible.filter((e) => e.kind !== 'documented').length,
			withheld: Math.max(0, slice.relCandidates - slice.relShown)
		};
	});

	/**
	 * Which nodes are drawn.
	 *
	 * Every entity in the dataset used to be rendered at every instant — around 450
	 * circles, of which some forty were live. The other four hundred were a dot matrix
	 * behind the graph: most of the ink on screen, and none of the information, because
	 * "this layer contains other people who held nothing in 1987" is a fact about the
	 * dataset rather than about the moment being shown.
	 *
	 * So it is semantic zoom. At the overview, only what is live and what the reader has
	 * focused; move in past the threshold and the full roster reappears in the same
	 * fixed positions it always occupied. Nothing is hidden — the lane headers count the
	 * live nodes, the toolbar counts the dormant ones, and the table lists everything.
	 */
	const showAll = $derived(cam.zoomProgress > 0.45);

	/**
	 * Roster crossfade. The full roster used to pop into the DOM at a zoom
	 * threshold — half the map appearing in one frame reads as a jump, not a
	 * zoom. Instead the roster enters the DOM once the fade starts and rides
	 * `--rf` (0→1) over 32%–55% of the way in, so zooming eases it into view.
	 * Below the window the roster is NOT in the DOM, so --rf must be 1 — the
	 * live nodes render at full strength; only the entering roster fades.
	 * The same factor multiplies the ring dims when focused.
	 */
	const rosterFade = $derived(
		cam.zoomProgress <= 0.32 ? 1 : smoothStep(cam.zoomProgress, 0.32, 0.55)
	);
	/** Group headers fade in slightly earlier, over 10%–30%. */
	const headerFade = $derived(smoothStep(cam.zoomProgress, 0.1, 0.3));

	/**
	 * Minimum node radius in world units so nodes are never invisible.
	 * At the overview zoom (cam.k ~0.55), a person node (r=5.2) renders as ~2.9px
	 * radius — too small next to 1.1px non-scaling-stroke edges. This floor ensures
	 * every node is at least 3.5 screen-pixels radius regardless of zoom level.
	 */
	const minWorldR = $derived(3.5 / cam.k);

	const visibleNodes = $derived.by(() => {
		/**
		 * A node is drawn once it has appeared; before its start date it does not
		 * exist at all. The one-sided lifecycle: showing up is an event, going
		 * quiet is a state — a retired figure stays hollow and clickable forever.
		 * The 1-year buffer makes the appearance a fade rather than a cut.
		 */
		const all = [...layout.nodes.values()].filter((n) => hasAppeared(n.id));
		// Compare mode: only the two anchors and their shared neighbours.
		if (compare && compareSet) {
			return all.filter((n) => compareSet.has(n.id));
		}
		// Quiet mode is the live graph only: no dormant scaffolding at all.
		if (app.quiet && !showAll) {
			const edgeNodes = new Set<string>();
			for (const e of slice.edges.filter((e) => e.active)) {
				edgeNodes.add(e.rel.from);
				edgeNodes.add(e.rel.to);
			}
			return all.filter((n) => slice.live.has(n.id) || edgeNodes.has(n.id));
		}
		// The roster enters once its fade starts; --rf carries the opacity.
		if (cam.zoomProgress > 0.32) return all;
		// Include any node that has at least one edge in the current slice,
		// so edges never terminate at an invisible point.
		const edgeNodes = new Set<string>();
		for (const e of slice.edges) {
			edgeNodes.add(e.rel.from);
			edgeNodes.add(e.rel.to);
		}
		if (rings) {
			// Focus pulls its ego-network forward: the one-ring is always drawn,
			// the two-ring only once the camera is in (it is part of the roster).
			return all.filter(
				(n) => rings.one.has(n.id) || (showAll && rings.two.has(n.id)) || slice.live.has(n.id) || edgeNodes.has(n.id)
			);
		}
		return all.filter((n) => slice.live.has(n.id) || edgeNodes.has(n.id));
	});

	const hovered = $derived(hoverEdge ? slice.edges.find((e) => e.id === hoverEdge) : null);

	// --- The hover power-card ------------------------------------------------
	//
	// Hovering a node names it without committing to a selection: the reader gets
	// the two-line "power card" — who, and what they hold at this instant — before
	// deciding whether to click. The post line is the most authoritative ACTIVE
	// post at the current time (same slice the map draws), so the card follows
	// the clock exactly like the nodes do.

	const hoveredNode = $derived(app.hovered ? (layout.nodes.get(app.hovered) ?? null) : null);

	const hoverPost = $derived.by(() => {
		if (!app.hovered) return null;
		const list = positionsByHolder.get(app.hovered) ?? [];
		const active = list
			.filter((p) => possiblyActive(p.interval, app.t) && meetsBasis(p.basis as Basis, app.basisFloor))
			.sort((a, b) => b.authority - a.authority);
		if (!active.length) return null;
		const best = active[0];
		const inst = institutionById.get(best.institution);
		return {
			role: best.roleTitle,
			inst: inst ? nameOf(inst) : best.institution
		};
	});

	const hoverTipAt = $derived.by(() => {
		if (!hoveredNode) return null;
		const s = cam.worldToScreen(hoveredNode.x, hoveredNode.y);
		// Under, not over: the tip must never cover the node it names.
		// Flip above only when the node sits hard against the bottom edge.
		const below = s.y + 18;
		const above = s.y - 56;
		const y = below + 60 > cam.vh - 8 ? above : below;
		return {
			x: Math.max(8, Math.min(s.x + 14, cam.vw - 220)),
			y: Math.max(8, Math.min(y, cam.vh - 60))
		};
	});

	const hoverName = $derived.by(() => {
		if (!app.hovered) return '';
		const p = personById.get(app.hovered);
		if (p) return nameOf(p);
		const i = institutionById.get(app.hovered);
		if (i) return nameOf(i);
		return app.hovered;
	});

	// --- The pinned connection ------------------------------------------------

	let pinnedId = $state<string | null>(null);
	const pinned = $derived(pinnedId ? slice.edges.find((e) => e.id === pinnedId) : null);

	/**
	 * Where the card sits.
	 *
	 * Anchored to the midpoint of the curve it describes, clamped inside the canvas so
	 * it never opens half off-screen. On a phone it ignores this and docks to the
	 * bottom instead — a 320px card positioned near a tapped line on a 390px screen
	 * covers the very thing the reader tapped to look at.
	 */
	const CARD_W = 320;
	const CARD_H = 300;
	const cardAt = $derived.by(() => {
		if (!pinned) return null;
		// The card anchors to the midpoint of the actual curve — same helper the
		// path came from, so they can never disagree even inside the gutter.
		const m = routes.get(pinned.id)?.mid ?? { x: pinned.a.x, y: pinned.a.y };
		const s = cam.worldToScreen(m.x, m.y);
		return {
			x: Math.max(8, Math.min(s.x + 16, cam.vw - CARD_W - 8)),
			y: Math.max(8, Math.min(s.y + 12, cam.vh - CARD_H - 8))
		};
	});

	function pick(id: string) {
		pinnedId = null;
		/*
		 * Assign, do not toggle.
		 *
		 * `app.select` is a toggle, which is right for clicking a node on the map —
		 * clicking the selected one again clears it. It is wrong here: naming a person
		 * in a connection card is a request to go to that person, and if they happened
		 * to be selected already the toggle silently deselected them and closed the
		 * inspector instead, leaving the reader on an empty map wondering what they hit.
		 */
		app.selected = id;
	}

	/**
	 * A connection arriving by URL: /network?rel=<relationship id>.
	 *
	 * This is what makes an edge citable. Somebody disputing "his brother-in-law
	 * controlled that bank" can link to the exact claim rather than describing where
	 * on the graph to look for it, and the entity panel's relationship rows use the
	 * same route.
	 *
	 * Runs once, guarded by a plain `let` — an effect writing state it also reads
	 * self-triggers. `cam.vw` is read tracked so this waits until the element has been
	 * measured; flying to a point before the viewport is known lands nowhere.
	 */
	let deepLinked = false;
	$effect(() => {
		/*
		 * `?mode=` selects a lens on arrival. The mode is a reading of the map, not
		 * a property of the reader, so it travels in the URL like the subject it
		 * frames; `?id=`/`?rel=` name who, `?mode=` names how.
		 */
		const m = page.url.searchParams.get('mode');
		if (!modeLinked && (m === 'influence' || m === 'ownership' || m === 'all')) {
			modeLinked = true;
			mode = m;
		}

		/*
		 * `?id=` selects a person or institution, the way `?rel=` pins a connection.
		 *
		 * A node was the one addressable thing on this map with no address — which
		 * only became a defect when Agora started rendering mentions, because every
		 * `@Bourguiba` in a post pointed at `/network?id=bourguiba` and nothing read
		 * it. The link resolved, the page loaded, and nothing happened: the worst
		 * shape of broken, since it looks like the feature simply does not do much.
		 */
		const entity = page.url.searchParams.get('id');
		if (entity && !deepLinked && (personById.has(entity) || institutionById.has(entity))) {
			deepLinked = true;
			untrack(() => {
				app.selected = entity;
				const n = layout.nodes.get(entity);
				if (n && cam.vw >= 2) cam.flyTo(n.x, n.y);
			});
			return;
		}

		const want = page.url.searchParams.get('rel');
		if (!want || deepLinked || cam.vw < 2) return;
		deepLinked = true;
		untrack(() => {
			const e = slice.edges.find((x) => x.rel.id === want || x.id === want);
			// A relationship below the current evidence threshold is genuinely not on
			// this map. Silently doing nothing is right: raising the threshold is the
			// reader's decision, and moving it for them would misrepresent the view.
			if (!e) return;
			pinnedId = e.id;
			const m = routes.get(e.id)?.mid ?? { x: e.a.x, y: e.a.y };
			cam.flyTo(m.x, m.y);
		});
	});

	/**
	 * Escape closes the card before the shell gets a chance to clear the selection.
	 *
	 * Captured, because the layout's window handler also answers Escape by dropping
	 * `app.selected`. Without stopping it there, one press would both close this card
	 * and deselect the person the reader was reading — two undos from one key.
	 */
	function onKeyCapture(e: KeyboardEvent) {
		if (e.key === 'Escape' && compareId) {
			compareId = null;
			e.stopPropagation();
			return;
		}
		if (e.key === 'Escape' && pinnedId) {
			pinnedId = null;
			e.stopPropagation();
		}
	}
	// --- Labels ---------------------------------------------------------------
	//
	// Names are HTML over the canvas rather than SVG text, and which ones survive is
	// decided by a deterministic priority pass. See src/lib/viz/labels.css and
	// place.ts for why both of those are the way they are.

	const labelCandidates = $derived.by(() => {
		// Nodes that are endpoints of any edge (active or not) — these deserve
		// labels even if they have no active position at the current time.
		// This ensures foreign states, international orgs, and dormant entities
		// that are connected to something visible still get named.
		const edgeEndpointNodes = new Set<string>();
		for (const e of slice.edges) {
			edgeEndpointNodes.add(e.rel.from);
			edgeEndpointNodes.add(e.rel.to);
		}

		// Foreign states and international organisations are persistent anchors:
		// they sit over any time span, hold no office, yet name the whole contest.
		// They get a fixed high priority so they clear the overview floor and take
		// a slot whenever space is free — but being non-pinned, they still yield to
		// a genuinely overlapping label, exactly as a colliding name should.
		const isPersistent = (n: Node) =>
			n.kind === 'institution' && (n.type === 'foreign-state' || n.type === 'international-organisation');
		// Ranked below a focused node's neighbours: reading who surrounds the focus
		// matters more than an anchor label in the same corner. Ranked well above
		// every plain person/institution so an anchor is never starved of a slot.
		const PERSISTENT_PRIO = 4_000;

		const out = [];
		for (const n of layout.nodes.values()) {
			if (compare && compareSet && !compareSet.has(n.id)) continue;
			// The focus PLATE belongs to the SELECTED node only. Hovering used to
			// promote the hovered node to focus too, so it rendered the plate AND
			// the hover power-card — two popups saying the same name. Hover gets
			// the card; selection gets the plate.
			const isFocus = app.selected === n.id;
			if (!isFocus && app.hovered === n.id) continue;
			const persistent = isPersistent(n);
			// Hop distance from the focus, for the label modifier that marks who
			// surrounds the reader's subject. 0 = not in any ring.
			const hop = rings
				? rings.one.has(n.id)
					? 1
					: rings.two.has(n.id)
						? 2
						: 0
				: 0;
			if (!isFocus) {
				// Persons are labelled only while they hold a position at the current
				// time — a name must follow the clock, never trail it. Institutions are
				// the exception: they are anchors that name the whole contest whether or
				// not anyone currently holds office in them, so an institution that is
				// even connected to the slice still earns its title. Foreign states and
				// international organisations are persistent by construction — always
				// eligible, never gated on a current connection.
				const inOffice = slice.live.has(n.id);
				const anchored = n.kind === 'institution' && (edgeEndpointNodes.has(n.id) || persistent);
				if (!inOffice && !anchored) continue;
				// When something is focused, only its ego-network is labelled: the
				// one-ring always, the two-ring once the roster itself is drawn.
				if (rings && !rings.one.has(n.id) && !(showAll && rings.two.has(n.id))) continue;
			}
			out.push({
				id: n.id,
				x: n.x,
				y: n.y,
				text: n.name,
				// Anchor preference (see place.ts): interior lanes read right-first,
				// with vertical slots to break dense columns; the RIGHTMOST lane
				// anchors LEFT first — a right-anchored label for a foreign state
				// falls off the world edge, the viewport check suppresses it, and
				// the title never appears even though the node is live. Left pulls
				// it back inside the map.
				dirs: (layout.lanes.indexOf(n.layer) === layout.lanes.length - 1
					? (['left', 'above', 'below', 'right'] as LabelDir[])
					: (['right', 'above', 'below', 'left'] as LabelDir[])),
				// Institutions sit a little below people of the same weight: when the two
				// contest a slot, the person is the more informative name.
				//
				// A neighbour of the focused node is always worth a name: the whole
				// point of focusing is to read who surrounds a person. Give it enough
				// weight to beat the label collisions it would otherwise lose to.
				priority: isFocus
					? 10_000
					: persistent
						? PERSISTENT_PRIO
						: rings && rings.one.has(n.id)
							? 5_000 + (n.weight - (n.kind === 'institution' ? (n.layer === 'foreign' ? 15 : 5) : 0))
							: n.weight - (n.kind === 'institution' ? (n.layer === 'foreign' ? 15 : 5) : 0),
				pinned: isFocus,
				r: n.r,
				data: { layer: n.layer, kind: n.kind, hop }
			});
		}
		return out;
	});

	const labels = $derived(
		placeLabels(labelCandidates, cam, { floor: labelFloor, majorAt: 66, limit: 100 })
	);

	/**
	 * Lane headers, pinned in screen space.
	 *
	 * Computed outside the camera transform so they stay at the top of the viewport
	 * while the reader pans down a lane. Seven columns of near-identical shape are
	 * genuinely hard to tell apart once the header has scrolled off the top, and the
	 * lanes are the only structure in this view that never moves — so the label for
	 * them should not move either.
	 */
	const laneHeaders = $derived.by(() => {
		const live = new Map<Layer, number>();
		for (const id of slice.live) {
			const n = layout.nodes.get(id);
			if (n) live.set(n.layer, (live.get(n.layer) ?? 0) + 1);
		}

		return layout.lanes
			.map((layer, i) => {
				const l = cam.worldToScreen(laneX(i, layout.laneW), 0).x;
				const r = cam.worldToScreen(laneX(i + 1, layout.laneW), 0).x;
				return { layer, l, r, count: live.get(layer) ?? 0 };
			})
			// A lane scrolled off the side gets no header; one only partly on screen
			// keeps its header clamped to the edge it is still visible at.
			.filter((h) => h.r > 44 && h.l < cam.vw - 8)
			.map((h) => ({
				layer: h.layer,
				count: h.count,
				left: Math.max(8, Math.min(h.l + 10, cam.vw - 120)),
				maxWidth: Math.max(88, Math.min(h.r - h.l - 20, cam.vw - Math.max(8, h.l + 10) - 12))
			}));
	});

	const soloed = $derived(app.activeLayers.size === 1);
	const wide = $derived(!compact.current);

	/**
	 * Group headers, positioned in world space but lifted into the overlay so they
	 * always sit above nodes and edges. The SVG band behind them stays faint — the
	 * text is the structure, and a header that a node can cover is not structure.
	 *
	 * Zoom-gated: a subsection title is meaningless while its nodes are still dots,
	 * and at the overview the seven lanes' worth of them pile up (measured: 42
	 * headers at the fit floor). They appear only once the camera is close enough
	 * that the roster they organise is drawn.
	 */
	const showGroupHeaders = $derived(headerFade > 0);
	const groupHeaders = $derived(
		layout.groupBands.map((band) => {
			const laneIdx = layout.lanes.indexOf(band.layer);
			const p = cam.worldToScreen(laneX(laneIdx, layout.laneW) + 10, band.headerY);
			return {
				key: band.layer + ':' + band.group,
				layer: band.layer,
				group: band.group,
				memberCount: band.memberCount,
				x: p.x,
				y: p.y
			};
		})
	);

	/** The vertical gutter strips between lanes — where cross-layer traffic runs. */
	const gutters = $derived(Array.from({ length: Math.max(0, layout.lanes.length - 1) }));

	/** Cross-layer edge count per gutter, for the traffic labels. */
	/**
	 * Cross-layer edge counts per gutter, split by direction of travel.
	 * `fwd` = edges running left → right, `rev` = right → left. The label shows
	 * net flow, so a corridor reads as a narrative: who is reaching into whom.
	 */
	const gutterTraffic = $derived.by(() => {
		const n = Math.max(0, layout.lanes.length - 1);
		const counts = new Array(n).fill(0);
		const fwd = new Array(n).fill(0);
		const rev = new Array(n).fill(0);
		for (const e of slice.edges) {
			if (!e.crossLayer) continue;
			const ia = layout.lanes.indexOf(e.a.layer);
			const ib = layout.lanes.indexOf(e.b.layer);
			if (ia < 0 || ib < 0 || ia === ib) continue;
			const k = ib > ia ? ia : ia - 1;
			if (k < 0 || k >= n) continue;
			counts[k]++;
			if (ib > ia) fwd[k]++;
			else rev[k]++;
		}
		return { counts, fwd, rev };
	});

	/**
	 * Gutter volume: how busy each channel is, normalized against the busiest.
	 * The strip's fill intensity scales with it, so a corridor reads as a
	 * thermometer — dense lane-pairs glow, quiet ones stay near the surface.
	 */
	const gutterVolume = $derived.by(() => {
		const counts = gutterTraffic.counts;
		const max = Math.max(1, ...counts);
		return counts.map((c) => 0.06 + 0.3 * (c / max));
	});

	/**
	 * Gutter traffic labels appear only once a gutter is wide enough on screen to
	 * carry a vertical label — at the fit floor a 26px channel cannot.
	 */
	const showGutterLabels = $derived(cam.zoomProgress > 0.35);

	// --- Tenure strips: sparklines and ghost arcs -----------------------------
	//
	// A node's time-in-office (sparkline) and its last-held institution (ghost
	// arc) both derive from positions. Institutions are "active" whenever anyone
	// holds a post in them, so their strip is the union of their holders' spans.

	/** People: their own posts. Institutions: the posts held in them. */
	const positionsByInstitution = (() => {
		const map = new Map<string, Position[]>();
		for (const p of ds.positions) {
			if (!p.institution) continue;
			const list = map.get(p.institution) ?? [];
			list.push(p);
			map.set(p.institution, list);
		}
		return map;
	})();

	/** Entity id → sparkline segments, on the 1956→2026 axis. Time-invariant. */
	const SPARK_W = 26;

	/**
	 * Has an entity appeared by the current time? The lifecycle is ONE-SIDED:
	 * before its earliest date a node does not exist at all (not even as a dot),
	 * but once it has appeared it stays forever — hollow when inactive, never
	 * unclickable. A retired minister or a dissolved company remains on the map
	 * as structure; only the not-yet-born are absent.
	 */
	const hasAppeared = (id: string) => {
		const t = appearDates.get(id);
		if (t === undefined) return true; // no dated anchor → structural, always in play
		return app.t >= t;
	};

	/**
	 * When each entity came into play: the earliest DATED anchor across every
	 * record kind that involves it — positions (holder and institution),
	 * relationships (both endpoints), events (actors), company founding dates,
	 * contracts, licences and declarations. Undated records are skipped: a
	 * relationship with no date must not pull an entity back to 1956.
	 * Entities with no dated anchor at all (structural institutions) are
	 * absent from the map and default to always-visible.
	 */
	const appearDates = (() => {
		const map = new Map<string, number>();
		const note = (id: string | undefined, t: number) => {
			if (!id) return;
			const cur = map.get(id);
			if (cur === undefined || t < cur) map.set(id, t);
		};
		// Positions: the post-holder and the institution appear when the post starts.
		for (const p of ds.positions) {
			if (p.interval.raw.start === null) continue;
			note(p.holder, p.interval.startEarliest);
			note(p.institution, p.interval.startEarliest);
		}
		// Relationships: both endpoints appear when the tie starts.
		for (const r of ds.relationships) {
			if (r.interval.raw.start === null) continue;
			note(r.from, r.interval.startEarliest);
			note(r.to, r.interval.startEarliest);
		}
		// Events: actors appear at the event date.
		for (const ev of ds.events) {
			const t = Date.parse(ev.date);
			if (Number.isNaN(t)) continue;
			for (const a of ev.actors) note(a, t);
		}
		// Companies: founded date.
		for (const c of ds.companies) {
			if (!c.founded) continue;
			const t = Date.parse(c.founded);
			if (Number.isNaN(t)) continue;
			note(c.id, t);
		}
		// Contracts: the institution appears when the contract starts.
		for (const c of ds.contracts) {
			const t = c.interval?.startEarliest ?? (c.start ? Date.parse(c.start) : NaN);
			if (t && !Number.isNaN(t)) note(c.institution, t);
		}
		// Licences: holder and issuer appear at grant.
		for (const l of ds.licences) {
			if (!l.grant) continue;
			const t = Date.parse(l.grant);
			if (Number.isNaN(t)) continue;
			note(l.holder, t);
			note(l.issuer, t);
		}
		// Declarations: the declarer appears at the declaration date.
		for (const dec of ds.declarations) {
			const t = Date.parse(dec.date);
			if (Number.isNaN(t)) continue;
			note(dec.declarer, t);
		}
		return map;
	})();
	const sparkSegments = (() => {
		const map = new Map<string, { x: number; w: number }[]>();
		const span = CUTOFF - FLOOR;
		const segsFor = (list: Position[]) => {
			const segs: { x: number; w: number }[] = [];
			for (const p of list) {
				const x0 = Math.max(0, ((p.interval.startEarliest - FLOOR) / span) * SPARK_W);
				const x1 = Math.min(SPARK_W, (((p.interval.endLatest ?? CUTOFF) - FLOOR) / span) * SPARK_W);
				if (x1 - x0 >= 0.4) segs.push({ x: x0, w: x1 - x0 });
			}
			return segs;
		};
		for (const p of ds.people) map.set(p.id, segsFor(positionsByHolder.get(p.id) ?? []));
		for (const i of ds.institutions) map.set(i.id, segsFor(positionsByInstitution.get(i.id) ?? []));
		return map;
	})();

	/** Sparklines render once the roster is in and there is room to read them. */
	const showSparklines = $derived(cam.zoomProgress > 0.35);

	/**
	 * Ghost arcs: for each dormant person, a faint tie to the institution they
	 * last held. The map must show not only who is out of office now, but where
	 * they left the structure. An overview feature: suppressed while focused
	 * (rings own the map), in quiet mode (which withholds the dormant
	 * scaffolding by definition), and once the reader has zoomed in (the roster
	 * is up; the scaffolding's job is done).
	 */
	const ghostArcs = $derived.by(() => {
		const arcs: { a: Node; b: Node }[] = [];
		if (focus || app.quiet || cam.zoomProgress > 0.3) return arcs;
		for (const [id, list] of positionsByHolder) {
			if (slice.live.has(id)) continue;
			// Only show ghosts for people who have appeared — the ghost arc traces
			// where they left the structure, and the not-yet-born have no
			// structure to trace.
			if (!hasAppeared(id)) continue;
			const from = layout.nodes.get(id);
			if (!from) continue;
			let best: Position | null = null;
			for (const p of list) {
				if (!p.institution || !layout.nodes.has(p.institution)) continue;
				if (!best || (p.interval.endLatest ?? CUTOFF) > (best.interval.endLatest ?? CUTOFF)) best = p;
			}
			if (best) arcs.push({ a: from, b: layout.nodes.get(best.institution)! });
		}
		return arcs;
	});

	// --- Compare mode: the intersection of two ego-networks -------------------
	//
	// Shift-click a second node to answer "what is common between X and Y?" —
	// the shared neighbours render at full strength, everything else leaves the
	// map. The layout never moves: the intersection is a filter over the fixed
	// positions, not a new drawing of them.

	let compareId = $state<string | null>(null);

	const compare = $derived.by(() => {
		if (!app.selected || !compareId || app.selected === compareId) return null;
		const egoA = new Set<string>([app.selected]);
		const egoB = new Set<string>([compareId]);
		for (const e of slice.edges) {
			if (e.rel.from === app.selected) egoA.add(e.rel.to);
			else if (e.rel.to === app.selected) egoA.add(e.rel.from);
			if (e.rel.from === compareId) egoB.add(e.rel.to);
			else if (e.rel.to === compareId) egoB.add(e.rel.from);
		}
		const common = new Set<string>();
		for (const id of egoA) {
			if (id !== app.selected && id !== compareId && egoB.has(id)) common.add(id);
		}
		return { a: app.selected, b: compareId, common };
	});

	/** The full compare set: both anchors plus their shared neighbours. */
	const compareSet = $derived(
		compare ? new Set<string>([compare.a, compare.b, ...compare.common]) : null
	);

	/** The edge subset the current mode actually draws. */
	const shownEdges = $derived.by(() => {
		/**
		 * Edges to nodes that have not appeared yet are not drawn — the node does
		 * not exist, so the connection cannot either. Once the node has appeared
		 * its edges stay (each edge still obeys its own interval via `active`).
		 */
		const inTime = hasAppeared;
		if (compare && compareSet) {
			return slice.edges.filter(
				(e) =>
					(!('measurement' in e) || mode === 'all') &&
					compareSet.has(e.rel.from) &&
					compareSet.has(e.rel.to) &&
					inTime(e.rel.from) &&
					inTime(e.rel.to)
			);
		}
		return slice.edges.filter(
			(e) => (!('measurement' in e) || mode === 'all') && inTime(e.rel.from) && inTime(e.rel.to)
		);
	});

	// --- The minimap ----------------------------------------------------------
	//
	// The world is 2600×1700 and the window shows a slice of it; the minimap is
	// the "where am I" that panning alone cannot answer. A click or drag centres
	// the map on the tapped point. The viewport rectangle is the live answer to
	// "where am I", so it reads as a control and a readout at once.
	const MINI_W = 100;
	const MINI_H = (H / W) * MINI_W;

	const miniView = $derived.by(() => {
		const wx = -cam.x / cam.k;
		const wy = -cam.y / cam.k;
		const ww = cam.vw / cam.k;
		const wh = cam.vh / cam.k;
		const x0 = Math.max(0, wx);
		const y0 = Math.max(0, wy);
		/*
		 * Clamp the viewport indicator to non-negative size. Mid-fly (and at the
		 * first paint after a deep-linked flyTo, before the camera has settled)
		 * the camera can legitimately sit past a world edge, which makes
		 * (min(W, wx+ww) - x0) negative; SVG then throws "<rect> attribute
		 * height: A negative value is not valid" — a console error on a real
		 * user flow (cold /network?id=...). The rect should clamp, not throw.
		 */
		const w = Math.max(0, Math.min(W, wx + ww) - x0);
		const h = Math.max(0, Math.min(H, wy + wh) - y0);
		return {
			x: (x0 / W) * MINI_W,
			y: (y0 / H) * MINI_H,
			w: (w / W) * MINI_W,
			h: (h / H) * MINI_H
		};
	});

	let miniDragging = false;
	function miniJump(e: PointerEvent) {
		const svg = e.currentTarget as SVGSVGElement;
		const r = svg.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return;
		const fx = (e.clientX - r.left) / r.width;
		const fy = (e.clientY - r.top) / r.height;
		cam.alignTo(Math.min(W, Math.max(0, fx * W)), Math.min(H, Math.max(0, fy * H)), 0.5, 0.5);
	}
	function miniDown(e: PointerEvent) {
		miniDragging = true;
		miniJump(e);
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
	}
	function miniMove(e: PointerEvent) {
		if (miniDragging) miniJump(e);
	}
	function miniUp() {
		miniDragging = false;
	}

	/**
	 * The legend's relationship-type swatches: what a focused node's edges wear.
	 * A curated subset of REL_TYPE_COLOR, so the legend stays compact — every
	 * swatch is still rendered from the constant it describes.
	 */
	const LEGEND_REL_TYPES = ['institutional', 'appointment', 'family', 'business', 'prosecution', 'reported-influence'];

	// --- The dismissal machine ------------------------------------------------
	//
	// One interaction stack: hover (transient) < selected node (persistent,
	// opens the Inspector) < pinned edge (persistent, opens the ConnectionCard).
	// Clicking the canvas background pops the TOP of the stack — one level per
	// click, the same two-step semantics Escape already has, now true for the
	// pointer too. Nothing closes something below the top unless the gesture
	// directly targets it.
	function onCanvasBgClick(e: MouseEvent) {
		const t = e.target as Element | null;
		// A click that landed on something with its own behaviour is not a
		// dismissal: nodes, edge hit-twins, lane header buttons, the card, the
		// nav controls and the legend all swallow it. Without this guard the very
		// node the reader just clicked would be deselected by the background.
		if (t && t.closest('.node, .hit, .vlane, .edgecard, .viewnav, .legend')) return;
		hoverEdge = null;
		app.hovered = null;
		if (pinnedId) pinnedId = null;
		else if (app.selected) {
			app.selected = null;
			compareId = null;
		}
	}

	// --- Long-press: the touch equivalent of hover ---------------------------
	//
	// Hover is a mouse-only tier; a phone has nothing between "nothing" and a
	// full tap that commits. A 500ms press on a node focuses it transiently
	// (hovered, not selected — no Inspector), and on an edge shows the edge tip.
	// The click that follows the release is suppressed so a press never also
	// selects.
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	let pressed = false;
	function startPress(cb: () => void) {
		pressed = false;
		pressTimer = setTimeout(() => {
			pressed = true;
			cb();
		}, 500);
	}
	function clearPress() {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
	}
</script>

<svelte:window onkeydowncapture={onKeyCapture} />

<div class="network">
	<div class="toolbar">
		<span class="eyebrow">{t('nav.network')}</span>
		<p class="hint">{t('network.hint')}</p>
		<div class="stats mono">
			<span>{stats.nodes} {t('network.live')}</span>
			<!--
				The dormant count is the honest replacement for the dot matrix. Dropping
				four hundred inactive nodes from the overview makes the map readable; not
				saying they exist would make it a different map.
			-->
			{#if stats.dormant && cam.zoomProgress <= 0.32}
				<Tooltip content={t('network.dormant.hint')}>
					<span class="dormant">
						{stats.dormant} {t('network.dormant')}
					</span>
				</Tooltip>
			{/if}
			<span>{stats.edges} {t('network.edges')}</span>
			<span class="bridge">{stats.bridges} {t('network.cross')}</span>
			{#if stats.reported}<span class="rep">{stats.reported} {t('network.reported')}</span>{/if}
			{#if stats.withheld > 0}
				<Tooltip content={t('network.withheld.hint')}>
					<span class="withheld">
						{stats.withheld} {t('network.withheld')}
					</span>
				</Tooltip>
			{/if}
		</div>
		<div class="modes">
			<!--
				Quiet is the intensity dial. The map defaults to showing everything it can,
				which is honest and can be a lot; one toggle withholds the dormant
				scaffolding so the live graph reads alone.
			-->
			<Tooltip content={t('network.quiet.hint')}>
				<button
					class="quiet"
					class:on={app.quiet}
					aria-pressed={app.quiet}
					onclick={() => (app.quiet = !app.quiet)}
				>
					<span class="dot" aria-hidden="true"></span>
					{t('network.quiet')}
				</button>
			</Tooltip>
			<!--
				Edge modes (spec §10/§13): all edges, the influence routes, or the
				corporate ownership graph. Influence is the default lens: the full
				graph (60 live + 296 dormant nodes, 157 edges) overwhelms on first
				sight, while the influence routes are the finding the Network exists
				to show. Quiet stays as a secondary dimmer, not a headline control.
			-->
			<Segmented
				options={[
					{ value: 'all', label: t('network.mode.all'), title: t('network.mode.all.hint') },
					{ value: 'influence', label: t('network.mode.influence'), title: t('network.mode.influence.hint') },
					{ value: 'ownership', label: t('network.mode.ownership'), title: t('network.mode.ownership.hint') }
				]}
				value={mode}
				onchange={(v) => {
					mode = v as typeof mode;
					syncModeUrl(mode);
				}}
				size="sm"
			/>
		</div>
	</div>

	<!--
		The camera surface.

		tabindex + role="application" because this is a navigable space, not a picture:
		once focused it answers arrows, +/- and 0. The nodes inside keep their own focus
		and labels, and the table below remains the complete non-visual equivalent —
		none of that is replaced by making the canvas movable.

		The lint rules below object to a focusable element with a non-interactive role
		and to its click listener, and they are wrong here: "application" is the ARIA
		role for a widget that handles its own keys, and it is useless without being
		focusable. The click is the dismissal gesture; its keyboard equivalent is
		Escape (handled in onKeyCapture and the shell), so nothing keyboard-only
		loses. The alternative is to leave arrow-key panning and click-away to mouse
		users only, which is a worse outcome than a suppressed warning.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<div
		class="canvas"
		use:navigable={{ cam }}
		tabindex="0"
		role="application"
		aria-label="{t('nav.network')} — {t('view.hint')}"
		data-cursor="grab"
		class:moving={cam.moving}
		onclick={onCanvasBgClick}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<svg viewBox="0 0 {cam.vw} {cam.vh}" role="presentation">
			<defs>
				<!-- Direction arrowhead. Painted with context-stroke so it inherits
				     whatever colour the edge carries; sized in strokeWidth units so it
				     stays proportional to the hairline it rides on. -->
				<marker
					id="dt-arrow"
					viewBox="0 0 8 8"
					refX="7"
					refY="4"
					markerWidth="3.2"
					markerHeight="3.2"
					orient="auto-start-reverse"
				>
					<path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
				</marker>
			</defs>
			<g transform={cam.transform}>
			<!--
				The dismissal surface: a full-canvas transparent rect under everything.
				Only a click that reaches it is a click-away. Nodes, hit twins and the
				HTML overlays sit above it, so they keep their own behaviour; this rect
				receives exactly the clicks that hit nothing.
			-->
			<rect x="0" y="0" width={W} height={H} fill="transparent" class="bg" />

			<!-- Gutter channels: the vertical strips where cross-layer traffic runs. -->
			{#each gutters as _, gi (gi)}
				<rect
					x={laneX(gi + 1, layout.laneW) - GUTTER_W}
					y="0"
					width={GUTTER_W}
					height={H}
					class="gutter-strip"
				/>
				<!-- The volume thermometer: left half wears the left lane's hue,
				     right half the right lane's, opacity scaled by traffic — the
				     pair is identified by colour, the density by glow. -->
				<rect
					x={laneX(gi + 1, layout.laneW) - GUTTER_W}
					y="0"
					width={GUTTER_W / 2}
					height={H}
					fill={LAYER_COLOR[layout.lanes[gi]]}
					opacity={gutterVolume[gi]}
				/>
				<rect
					x={laneX(gi + 1, layout.laneW) - GUTTER_W / 2}
					y="0"
					width={GUTTER_W / 2}
					height={H}
					fill={LAYER_COLOR[layout.lanes[gi + 1]]}
					opacity={gutterVolume[gi]}
				/>
				<line
					x1={gutterCenter(gi, layout.laneW)}
					x2={gutterCenter(gi, layout.laneW)}
					y1="0"
					y2={H}
					class="gutter-line"
				/>
			{/each}

			<!-- Lane backgrounds and headers -->
			{#each layout.lanes as layer, i (layer)}
				<g>
					<rect
						x={laneX(i, layout.laneW)}
						y="0"
						width={layout.laneW}
						height={H}
						fill={LAYER_COLOR[layer]}
						opacity={layer === 'foreign' ? 0.048 : 0.028}
					/>
					<line
						x1={laneX(i, layout.laneW)}
						x2={laneX(i, layout.laneW)}
						y1="0"
						y2={H}
						stroke="var(--border-subtle)"
						stroke-width="1"
					/>
				</g>
			{/each}

			<!-- Group band backgrounds -->
			{#each layout.groupBands as band (band.layer + band.group)}
				{@const laneIdx = layout.lanes.indexOf(band.layer)}
				{#if laneIdx >= 0}
					<!-- Subtle band background spanning header + content -->
					<rect
						x={laneX(laneIdx, layout.laneW) + 4}
						y={band.headerY - 6}
						width={layout.laneW - 8}
						height={band.contentBottom - band.headerY + 8}
						fill={LAYER_COLOR[band.layer]}
						opacity="0.035"
						rx="5"
					/>
					<!-- The zone's top hairline: a band is a section of the lane,
					     and sections have rules. -->
					<line
						x1={laneX(laneIdx, layout.laneW) + 4}
						x2={laneX(laneIdx, layout.laneW) + layout.laneW - 4}
						y1={band.headerY - 5}
						y2={band.headerY - 5}
						class="band-line"
						style:--c={LAYER_COLOR[band.layer]}
					/>
				{/if}
			{/each}

			<!-- Edges: inactive first so active ones sit on top -->
			<g class="edges">
				{#each shownEdges.filter((e) => !e.active && !app.quiet) as e (e.id)}
					{@const r = routes.get(e.id)}
					{#if r}
						{#if !focus}
							<path d={r.d} class="edge idle" />
						{:else if rings && rings.one.has(e.rel.from) && rings.one.has(e.rel.to)}
							<path
								d={r.d}
								class="edge"
								class:measurement={isMeasurementEdge(e)}
								class:cross={e.crossLayer}
								class:reported={e.kind === 'reported'}
								class:alleged={e.kind === 'alleged'}
								class:hot={hoverEdge === e.id}
								class:pinned={pinnedId === e.id}
								class:arrow={focus && cam.zoomProgress > 0.25}
								stroke={edgeColor(e)}
								stroke-dasharray={edgeDash(e)}
								stroke-opacity={edgeOpacity(e, 0.5)}
							/>
						{/if}
					{/if}
				{/each}

				{#each shownEdges.filter((e) => e.active) as e (e.id)}
					{@const r = routes.get(e.id)}
					{#if r}
						<!-- The source-layer hairline: a bridge's identity tag. The
						     bridge colour says "crosses layers"; the hairline says which
						     pair. Only outside the focused scope — a focused edge already
						     recolours to its relationship type. -->
						{#if e.crossLayer && !isMeasurementEdge(e) && !(focus && (e.rel.from === focus || e.rel.to === focus))}
							<path
								d={r.d}
								class="hairline"
								stroke={LAYER_COLOR[e.a.layer]}
								stroke-opacity={BASIS_OPACITY[e.rel.basis as Basis] * edgeEmphasis(e) * 0.5}
							/>
						{/if}
						<path
							d={r.d}
							class="edge"
							class:measurement={isMeasurementEdge(e)}
							class:cross={e.crossLayer}
							class:reported={e.kind === 'reported'}
							class:alleged={e.kind === 'alleged'}
							class:hot={hoverEdge === e.id}
							class:pinned={pinnedId === e.id}
							class:arrow={focus && (e.rel.from === focus || e.rel.to === focus) && cam.zoomProgress > 0.25}
							stroke={edgeColor(e)}
							stroke-dasharray={edgeDash(e)}
							stroke-opacity={edgeOpacity(e, edgeEmphasis(e))}
							stroke-width={edgeWidth(e, (e as { multi?: number }).multi)}
						/>
					{/if}
				{/each}
			</g>

			<!--
				Ghost arcs: dormant people tied faintly to their last-held
				institution. "Who is out of office, and where they left the
				structure" — the scaffolding the overview keeps honest.
			-->
			<g class="ghosts">
				{#each ghostArcs as arc (arc.a.id)}
					{@const r = routeEdge(arc.a, arc.b, layout.laneW)}
					<path d={r.d} class="ghost" />
				{/each}
			</g>

			<!--
				Hit targets.

				A 1.1px stroke is a pointer-precision target and effectively untouchable
				with a finger, so every reachable edge gets an invisible fat twin. These sit
				above the visible edges and below the nodes: a node under a line must still
				win the tap, because the node is the more specific thing the reader aimed at.
			-->
			<g class="hits">
				{#each shownEdges.filter((e) => e.active || (focus && (e.rel.from === focus || e.rel.to === focus))) as e (e.id)}
					{@const r = routes.get(e.id)}
					{#if r}
						<path
							d={r.dh}
							class="hit"
							onmouseenter={() => (hoverEdge = e.id)}
							onmouseleave={() => (hoverEdge = null)}
							onpointerdown={() => startPress(() => (hoverEdge = e.id))}
							onpointerup={() => clearPress()}
							onpointerleave={() => clearPress()}
							onclick={() => {
								if (pressed) return;
								pinnedId = pinnedId === e.id ? null : e.id;
							}}
							role="presentation"
						/>
					{/if}
				{/each}
			</g>

			<!-- Nodes -->
			<g class="nodes">
				{#each visibleNodes as n (n.id)}
					{@const live = slice.live.has(n.id)}
					{@const isFocus = focus === n.id}
					{@const ringClass = nodeRingClass(n)}
					{@const isAnchor = n.kind === 'institution' && (n.type === 'foreign-state' || n.type === 'international-organisation')}
					{@const connected = focus ? (rings?.one.has(n.id) ?? false) : live}
					{@const rr = Math.max(n.r, minWorldR)}
				<g
					class="node"
					class:focus={isFocus}
					class:r-one={ringClass === 'r-one'}
					class:r-two={ringClass === 'r-two'}
					class:r-rest={ringClass === 'r-rest'}
					class:dormant={ringClass === 'dormant'}
					class:anchor={isAnchor && !live}
					transform="translate({n.x},{n.y})"
						style:--enter-delay={n.y * 0.35 + 'ms'}
						style:--rf={isFocus || ringClass === 'r-one' ? 1 : rosterFade}
						role="button"
						tabindex={live ? 0 : -1}
						aria-label="{n.name} — {layerLabel(n.layer)}"
						onpointerdown={() => startPress(() => (app.hovered = n.id))}
						onpointerup={() => clearPress()}
						onpointerleave={() => clearPress()}
						onclick={(e) => {
							if (pressed) {
								e.preventDefault();
								return;
							}
							// Shift-click sets the compare target — additive, never a
							// replacement of the primary selection. Shift-clicking the
							// same node again exits compare.
							if (e.shiftKey) {
								compareId = compareId === n.id ? null : n.id;
								return;
							}
							// A map click is a selection the reader is already looking
							// at: fly gently (see the fly effect), and let the flight
							// own the resize instead of the keep-centre pan.
							cam.skipResizePan = true;
							selectFly = 'gentle';
							app.select(n.id);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								app.select(n.id);
							}
						}}
						onmouseenter={() => (app.hovered = n.id)}
						onmouseleave={() => (app.hovered = null)}
						oncontextmenu={(e) => e.preventDefault()}
					>
					{#if isFocus}
						<!-- The focus halo: the one thing that may sit under the node
						     itself, so the reader can find their subject in a sea of
						     five hundred without it being covered by anything. -->
						{#if n.kind === 'institution'}
							<rect
								x={-rr - 5}
								y={-rr - 5}
								width={(rr + 5) * 2}
								height={(rr + 5) * 2}
								rx="3"
								class="halo"
								vector-effect="non-scaling-stroke"
							/>
						{:else}
							<circle r={rr + 5} class="halo" vector-effect="non-scaling-stroke" />
						{/if}
					{/if}
					{#if n.kind === 'institution'}
						<rect
							x={-rr}
							y={-rr}
							width={rr * 2}
							height={rr * 2}
							rx="1.5"
							fill={connected ? LAYER_COLOR[n.layer] : 'var(--surface-panel)'}
							stroke={LAYER_COLOR[n.layer]}
							stroke-width={isFocus ? 2 : 1.2}
							vector-effect="non-scaling-stroke"
						/>
					{:else}
						<circle
							r={rr}
							fill={connected ? LAYER_COLOR[n.layer] : 'var(--surface-panel)'}
							stroke={LAYER_COLOR[n.layer]}
							stroke-width={isFocus ? 2 : 1.2}
							vector-effect="non-scaling-stroke"
						/>
						{/if}
					{#if showSparklines && live}
						<!-- The tenure strip: when this entity held office, on the
						     1956→2026 axis. Time-invariant — it is the object's history,
						     not its state at the playhead. -->
						{@const segs = sparkSegments.get(n.id) ?? []}
						{#if segs.length}
							<g class="spark" transform="translate({-SPARK_W / 2},{rr + 4})">
								<!-- Index key, not coordinates: two positions with the
								     same clamped span would otherwise collide and
								     Svelte's keyed-each duplicate check aborts the
								     whole render pass. Segments are static per node. -->
								{#each segs as seg, si (si)}
									<rect
										x={seg.x}
										y="0"
										width={seg.w}
										height="3"
										rx="1"
										fill={LAYER_COLOR[n.layer]}
										opacity="0.75"
									/>
								{/each}
							</g>
						{/if}
					{/if}
					</g>
				{/each}
			</g>
			</g>
		</svg>

		<!--
			Hover names the connection; clicking opens the record.

			Two levels rather than one, because hovering a line while tracing it should
			not throw a 320px panel over the map. The tip is deliberately thin — who to
			who, and on what basis — and suppressed once a card is open, where it would
			just repeat it.
		-->
		{#if hoveredNode && hoverTipAt && !app.selected}
			<!-- The hover power-card: who the pointer is over, and what they hold
			     at this instant. Transient — reading it commits to nothing; the
			     selection that opens the inspector is a click away. -->
			<div class="node-tip" style:left="{hoverTipAt.x}px" style:top="{hoverTipAt.y}px" aria-hidden="true">
				<strong>{hoverName}</strong>
				{#if hoverPost}
					<span class="tip-post">{hoverPost.role}<i> · </i>{hoverPost.inst}</span>
				{:else}
					<span class="tip-post muted">{t('network.notnow')}</span>
				{/if}
			</div>
		{/if}

		{#if hovered && !pinned}
			<div class="edge-tip">
				<span class="verb">{relLabel(hovered.rel.type)}</span>
				<strong>{resolveEntity(hovered.rel.from)?.name} → {resolveEntity(hovered.rel.to)?.name}</strong>
				<div class="tip-meta">
					<Chip size="xs" dot tint="var(--basis-{hovered.rel.basis})">
						{basisLabel(hovered.rel.basis as Basis)}
					</Chip>
					{#if hovered.crossLayer}
						<Chip variant="outline" size="xs" tint="var(--bridge)">
							{t('network.legend.crosses')}
						</Chip>
					{/if}
					<span class="tip-cta">{t('network.clickopen')}</span>
				</div>
			</div>
		{/if}

		{#if pinned && cardAt}
			<div
				class="edgecard"
				class:sheet={compact.current}
				style:left={compact.current ? undefined : `${cardAt.x}px`}
				style:top={compact.current ? undefined : `${cardAt.y}px`}
				data-no-pan
			>
				<ConnectionCard edge={pinned} onclose={() => (pinnedId = null)} onpick={pick} />
			</div>
		{/if}

		{#if compare}
			<!-- Compare mode banner: the intersection query in plain words, with an
			     explicit exit. The map underneath has already answered — the banner
			     says what question was asked. -->
			<div class="compare-banner" data-no-pan>
				<span class="cmp-title">
					{format(app.locale, 'network.compare.title', {
						a: nameOf(personById.get(compare.a) ?? institutionById.get(compare.a) ?? {}),
						b: nameOf(personById.get(compare.b) ?? institutionById.get(compare.b) ?? {})
					})}
				</span>
				<span class="cmp-n">{format(app.locale, 'network.compare.common', { n: compare.common.size })}</span>
				<button class="cmp-exit mono" onclick={() => (compareId = null)}>
					{t('network.compare.exit')}
				</button>
			</div>
		{/if}

		<!--
			Names and lane headers, in HTML over the canvas.

			aria-hidden because the SVG nodes underneath already carry their own
			accessible names and the table below is the complete equivalent. Announcing
			these too would read every entity out twice.
		-->
		<div class="vlayer" aria-hidden="true">
			{#each laneHeaders as h (h.layer)}
				<!--
					tabindex -1 because this whole layer is aria-hidden, and a focusable
					control inside a hidden subtree is a trap: a keyboard user would land
					on something a screen reader refuses to announce. Isolating a layer is
					a pointer shortcut for what the dock's layer chips already do with a
					proper label and keyboard access.
				-->
				<button
					class="vlane"
					class:solo={soloed}
					tabindex="-1"
					style:left="{h.left}px"
					style:max-width="{h.maxWidth}px"
					style:--c={LAYER_COLOR[h.layer]}
					title="{layerLabel(h.layer)} — {soloed ? t('network.lane.all') : t('network.lane.solo')}"
					onclick={() => (soloed ? app.allLayers() : app.soloLayer(h.layer))}
				>
					{h.layer === 'foreign' ? t('layer.foreign.short') : layerLabel(h.layer)}
					{#if h.count}<b>{h.count}</b>{/if}
				</button>
			{/each}

			{#if showGutterLabels}
				<!-- Gutter traffic labels: how many cross-layer edges run in each
				     channel, written vertically down the strip once it is wide
				     enough to carry a label. The glyph shows net flow — ↓ is
				     mostly left→right, ↑ mostly right→left, ↕ balanced. -->
				{#each gutters as _, gi (gi)}
					{@const gx = cam.worldToScreen(gutterCenter(gi, layout.laneW), 0).x}
					{@const net = gutterTraffic.fwd[gi] > gutterTraffic.rev[gi] ? '↓' : gutterTraffic.rev[gi] > gutterTraffic.fwd[gi] ? '↑' : '↕'}
					<span class="vgutter mono" style:left="{gx}px" style:--c="var(--bridge)">
						{net} {gutterTraffic.counts[gi]} {t('network.gutter.short')}
					</span>
				{/each}
			{/if}

			{#if showGroupHeaders}
				{#each groupHeaders as h (h.key)}
					<span
						class="vgroup"
						style:transform="translate({h.x}px, {h.y}px)"
						style:opacity={headerFade}
						style:--c={LAYER_COLOR[h.layer]}
					>
						{h.group}
						<i>{h.memberCount}</i>
					</span>
				{/each}
			{/if}

			{#each labels as l (l.id)}
				<span
					class="vlabel t-{l.tier} l-{l.dir}"
					class:is-institution={l.data?.kind === 'institution'}
					class:hop-one={l.data?.hop === 1}
					style:transform="translate({l.sx}px, {l.sy}px)"
					style:--c={LAYER_COLOR[l.data!.layer]}
					title={l.text}
				>
					{l.text}
				</span>
			{/each}
		</div>

		<div class="viewnav">
			<NavControls {cam} label={t('nav.network')} />
			{#if focus}
				<button
					class="clear-focus mono"
					data-no-pan
					onclick={() => {
						pinnedId = null;
						app.hovered = null;
						app.selected = null;
					}}
				>
					{t('network.clear')}
				</button>
			{/if}
		</div>

		<!--
			The legend is a reference, not a control, so on a small screen it folds away
			rather than covering a third of the map. Open by default on a wide one, where
			there is room and where a reader meeting dashed lines for the first time
			needs to be told what they mean without hunting for a toggle.
		-->
		<details class="legend" open={wide}>
			<summary aria-label={t('network.legend')}>
				<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
					<path d="M2 4h10M2 7h10M2 10h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
				</svg>
				<span>{t('network.legend')}</span>
			</summary>

			<div class="lsec">{t('network.legend.basis')}</div>
			<!-- The four real bases, in order, with the dash that encodes each on the
			     edges. Rendered from the model so the legend cannot drift from the
			     strokes it explains (spec §14.1). -->
			<div class="lgrid">
				{#each BASIS_ORDER as b (b)}
					<span class="lrow">
						<svg width="22" height="6" aria-hidden="true"
							><line
								x1="0"
								y1="3"
								x2="22"
								y2="3"
								stroke={BASIS_COLOR[b]}
								stroke-opacity={BASIS_OPACITY[b]}
								stroke-width="1.4"
								stroke-dasharray={DASH[b]}
							/></svg
						>
						{t('basis.' + b)}
					</span>
				{/each}
				<span class="lrow">
					<svg width="22" height="6" aria-hidden="true"
						><line x1="0" y1="3" x2="22" y2="3" stroke="var(--bridge)" stroke-width="2" /></svg
					>
					{t('network.legend.crosses')}
				</span>
			</div>

			<div class="lsec">{t('network.legend.focused')}</div>
			<span class="lrow">
				<svg width="22" height="6" aria-hidden="true"
					><line
						x1="1"
						y1="3"
						x2="21"
						y2="3"
						stroke="var(--text-secondary)"
						stroke-width="1.4"
						marker-end="url(#dt-arrow)"
					/></svg
				>
				{t('network.legend.direction')}
			</span>
			<div class="lgrid types">
				{#each LEGEND_REL_TYPES as rt (rt)}
					<span class="lrow"><i class="rdot" style:--c={REL_TYPE_COLOR[rt]}></i>{relLabel(rt)}</span>
				{/each}
			</div>

			<div class="lsec">{t('network.legend.bridges')}</div>
			<div class="lgrid">
				<span class="lrow">
					<svg width="22" height="8" aria-hidden="true"
						><line x1="0" y1="6" x2="22" y2="6" stroke="var(--bridge)" stroke-width="2" /><line
							x1="0"
							y1="2"
							x2="22"
							y2="2"
							stroke="var(--layer-political)"
							stroke-width="0.7"
							opacity="0.7"
						/></svg
					>
					{t('network.legend.hairline')}
				</span>
				<span class="lrow">
					<svg width="22" height="8" aria-hidden="true"
						><rect
							x="8.5"
							y="0"
							width="5"
							height="8"
							fill="var(--surface-sunken)"
							stroke="var(--border-subtle)"
						/><line x1="11" y1="0" x2="11" y2="8" stroke="var(--bridge)" stroke-width="1.4" /></svg
					>
					{t('network.legend.gutter')}
				</span>
			</div>
		</details>

		<!--
			The minimap: a miniature of the world — lanes, gutters, and the live
			viewport rectangle. Clicking or dragging centres the map on the tapped
			point; the rectangle is the honest answer to "where am I" on a world
			larger than the window. Hidden on a phone, where the map IS the screen.
		-->
		<div class="minimap" data-no-pan role="group" aria-label={t('network.minimap')}>
			<svg
				viewBox="0 0 {MINI_W} {MINI_H}"
				preserveAspectRatio="none"
				onpointerdown={miniDown}
				onpointermove={miniMove}
				onpointerup={miniUp}
				onpointercancel={miniUp}
				aria-hidden="true"
			>
				{#each layout.lanes as layer, i (layer)}
					<rect
						x={(laneX(i, layout.laneW) / W) * MINI_W}
						y="0"
						width={(layout.laneW / W) * MINI_W}
						height="100%"
						class="mm-lane"
						style:--c={LAYER_COLOR[layer]}
					/>
				{/each}
				{#each gutters as _, gi (gi)}
					<rect
						x={((laneX(gi + 1, layout.laneW) - GUTTER_W) / W) * MINI_W}
						y="0"
						width={(GUTTER_W / W) * MINI_W}
						height="100%"
						class="mm-gutter"
					/>
				{/each}
				<rect
					x={miniView.x}
					y={miniView.y}
					width={miniView.w}
					height={miniView.h}
					class="mm-view"
				/>
			</svg>
		</div>

	</div>

	<!--
		Accessible equivalent of the graph. Every chart in this project owes one — a
		network drawn in SVG is unreadable to a screen reader no matter how many
		aria-labels the nodes carry, because the information IS the set of edges.
		Cross-layer bridges are listed first, since those are the finding.
	-->
	<details class="a11y">
		<summary>{t('network.table.summary')}</summary>
		<!-- The focused ego-network, when there is one: the highlight state, as a
		     table. The emphasis the map gives a focused node's connections is the
		     most informative part of the view, so it cannot exist only for eyes. -->
		{#if focus && rings}
			<h4 class="a11y-sub">{format(app.locale, 'network.table.focus', { name: resolveEntity(focus)?.name ?? focus })}</h4>
			<table>
				<thead>
					<tr>
						<th>{t('network.table.other')}</th><th>{t('network.table.group')}</th><th>{t('network.table.relationship')}</th><th>{t('network.table.basis')}</th><th>{t('network.table.crosses')}</th><th></th>
					</tr>
				</thead>
				<tbody>
					{#each slice.edges.filter((e) => e.rel.from === focus || e.rel.to === focus) as e (e.id)}
						{@const otherId = e.rel.from === focus ? e.rel.to : e.rel.from}
						<tr>
							<td>{resolveEntity(otherId)?.name ?? otherId}</td>
							<td>{groupOf(otherId)}</td>
							<td>{relLabel(e.rel.type)}</td>
							<td>{basisLabel(e.rel.basis as Basis)}</td>
							<td>{e.crossLayer ? t('network.table.yes') : t('network.table.no')}</td>
							<td>
								<button
									class="rowopen"
									onclick={() => {
										pinnedId = e.id;
										const m = routes.get(e.id)?.mid ?? { x: e.a.x, y: e.a.y };
										cam.flyTo(m.x, m.y);
									}}
								>
									{t('network.pick')}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
		<table>
			<caption>
				{format(app.locale, 'network.table.caption', { date: formatDate(app.t, 'day'), mode: t('network.mode.' + mode) })}
			</caption>
			<thead>
				<tr>
					<th>{t('network.table.from')}</th><th>{t('network.table.group')}</th><th>{t('network.table.to')}</th><th>{t('network.table.group')}</th><th>{t('network.table.relationship')}</th><th>{t('network.table.basis')}</th><th>{t('network.table.crosses')}</th><th></th>
				</tr>
			</thead>
			<tbody>
				{#each slice.edges
					.filter((e) => e.active)
					.sort((a, b) => Number(b.crossLayer) - Number(a.crossLayer)) as e (e.id)}
					<tr>
						<td>{resolveEntity(e.rel.from)?.name}</td>
						<td>{groupOf(e.rel.from)}</td>
						<td>{resolveEntity(e.rel.to)?.name}</td>
						<td>{groupOf(e.rel.to)}</td>
						<td>{relLabel(e.rel.type)}</td>
						<td>{basisLabel(e.rel.basis as Basis)}</td>
						<td>{e.crossLayer ? t('network.table.yes') : t('network.table.no')}</td>
						<td>
							<button
								class="rowopen"
								onclick={() => {
									pinnedId = e.id;
									const m = routes.get(e.id)?.mid ?? { x: e.a.x, y: e.a.y };
									cam.flyTo(m.x, m.y);
								}}
							>
								{t('network.pick')}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	.network {
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
	.stats {
		display: flex;
		gap: var(--s-5);
		margin-inline-start: auto;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.stats .bridge {
		color: var(--bridge);
	}
	.stats .rep {
		color: var(--basis-inferred);
	}
	.stats .dormant {
		color: var(--text-faint);
		cursor: help;
		border-bottom: 1px dotted var(--border-strong);
	}

	.quiet {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-4) var(--s-2) var(--s-3);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		cursor: pointer;
		opacity: 0.82;
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			opacity var(--dur-fast) var(--ease-out);
	}
	.quiet .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-faint);
		opacity: 0.7;
		transition: background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
	}
	.quiet:hover {
		color: var(--text-secondary);
		border-color: var(--border-default);
		background: color-mix(in oklch, var(--surface-panel) 70%, transparent);
		opacity: 1;
	}
	.quiet:hover .dot {
		opacity: 1;
	}
	.quiet.on {
		color: var(--text-primary);
		border-color: color-mix(in oklch, var(--accent) 45%, transparent);
		background: color-mix(in oklch, var(--accent) 10%, var(--surface-panel));
		opacity: 1;
	}
	.quiet.on .dot {
		background: var(--accent);
		opacity: 1;
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 25%, transparent);
	}

	/* The lens switcher + quiet dimmer are a single control group. The graph
	   defaults to Influence, which is sparser and the point of the view; the
	   panel's surface + border makes the group readable as a control rather
	   than as metadata that can be skipped, which it was when it sat as two
	   naked pills at the far right of the bar. */
	.modes {
		display: inline-flex;
		align-items: center;
		gap: var(--s-4);
		padding: 4px;
		background: var(--surface-raised);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		box-shadow: var(--elev-1);
	}

	@media (max-width: 900px) {
		.toolbar {
			gap: var(--s-4);
			padding: var(--s-3) var(--s-4);
		}
		.stats {
			gap: var(--s-3);
			font-size: 9px;
			flex-wrap: wrap;
		}
		.modes {
			width: 100%;
			justify-content: space-between;
			padding: 3px;
		}
		.quiet {
			padding: var(--s-1) var(--s-3);
			font-size: 9px;
		}
	}

	.canvas {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		/* The browser must not claim the gestures we handle: without this, a one-finger
		   drag scrolls the page on touch and a pinch zooms the whole document. */
		touch-action: none;
		cursor: grab;
		overflow: hidden;
	}
	.canvas.moving {
		cursor: grabbing;
	}
	.canvas:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	/* The graph canvas fills its surface. A DIRECT child selector, not `.canvas
	   svg`: the legend and minimap live inside the canvas div too, and an
	   unscoped `svg { width: 100% }` — or a scoped-but-ancestor one — stretched
	   every one of them, turning the legend's 12×12 icons into full-width
	   blocks and its swatch dashes into wall-to-wall lines. `> svg` hits only
	   the graph itself. */
	.canvas > svg {
		width: 100%;
		height: 100%;
	}

	.edge {
		fill: none;
		/* Stroke widths are screen pixels, not world units. A hairline that thickens
		   as you zoom turns a dense graph into a solid mat exactly when the reader is
		   trying to trace one line through it. */
		vector-effect: non-scaling-stroke;
		stroke-width: 1.1;
		transition: stroke-opacity 0.18s;
		/* Hit testing belongs to the fat invisible twins in .hits, so the visible line
		   never competes with them for a pointer. */
		pointer-events: none;
		stroke-linecap: round;
	}

	.hit {
		fill: none;
		stroke: transparent;
		/* Screen pixels, so the target stays a comfortable ~11px wide band at every
		   zoom level rather than shrinking to nothing as the reader pulls back. */
		vector-effect: non-scaling-stroke;
		stroke-width: 11;
		stroke-linecap: round;
		pointer-events: stroke;
		cursor: pointer;
	}
	.edge.idle {
		stroke: var(--border-subtle);
		/* Idle edges are context, not content: faint enough that the active graph
		   reads first and the dormant spiderweb only registers as texture. The map
		   is overwhelming exactly when every arc competes for the eye, and nothing
		   competes harder than a stroke sitting at half-strength. */
		stroke-opacity: 0.16;
		stroke-width: 0.6;
		pointer-events: none;
	}
	.edge.cross {
		stroke-width: 1.7;
	}
	/* The basis is encoded by dash and opacity alone (see DASH/BASIS_OPACITY in
	   model.ts). The old override forced reported AND allegation edges to one amber
	   hue regardless of their actual basis, which made two distinct bases render
	   identically — exactly what the legend must never claim. (spec §14.1) */
	.edge.hot {
		stroke-width: 2.6;
		stroke-opacity: 1 !important;
	}
	/* The connection whose card is open. Thicker than hover and undashed-looking, so
	   the reader can see which of forty crossing lines they are reading about. */
	.edge.pinned {
		stroke-width: 3.4;
		stroke-opacity: 1 !important;
		filter: drop-shadow(0 0 6px color-mix(in oklch, var(--accent) 55%, transparent));
	}

	.group-header {
		font-family: var(--font-sans);
		text-transform: uppercase;
		pointer-events: none;
	}

	.node {
		cursor: pointer;
		/* --rf is the roster crossfade (0→1 over the semantic-zoom window); every
		   emphasis state below multiplies it, so the roster fades in AND respects
		   the ring it sits in. */
		opacity: var(--rf, 1);
		transition: opacity 0.18s;
		animation: node-fade var(--dur-slow) var(--ease-out) both;
		animation-delay: var(--enter-delay, 0ms);
	}
	@keyframes node-fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.node {
			animation: none;
		}
	}
	.node.dormant {
		opacity: calc(var(--rf, 1) * 0.52);
	}
	/* A persistent structural anchor (foreign state / intl org) that is dormant
	   but labelled: brighter than generic dormant so it reads as "intentional
	   structure", not "extra fake node." */
	.node.anchor {
		opacity: calc(var(--rf, 1) * 0.76);
	}
	.node.r-one {
		opacity: calc(var(--rf, 1));
	}
	.node.r-two {
		opacity: calc(var(--rf, 1) * 0.55);
	}
	.node.r-rest {
		opacity: calc(var(--rf, 1) * 0.24);
	}
	.node.focus {
		opacity: calc(var(--rf, 1));
	}
	/* The focus halo is a node of its own inside the group; the subject's own
	   shape keeps the text-primary emphasis, and the halo must not inherit it. */
	.node.focus circle:not(.halo),
	.node.focus rect:not(.halo) {
		stroke: var(--text-primary);
		stroke-width: 2;
	}
	.node .halo {
		fill: none;
		stroke: color-mix(in oklch, var(--accent) 55%, transparent);
		stroke-width: 2.5;
	}
	/* The cross-layer edge's identity tag: a thin second stroke in the source
	   layer's hue, so a bridge says which pair of layers it joins without the
	   bridge colour (pinned ochre) ever pretending to be a layer colour. */
	.hairline {
		fill: none;
		stroke-width: 0.8;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	/* A group band's top rule: the zone boundary, in the zone's own hue. */
	.band-line {
		stroke: var(--c);
		stroke-width: 1;
		opacity: 0.32;
		pointer-events: none;
	}
	/* Ghost arcs: dormant people to their last-held institution. The faintest
	   class of line on the map — scaffolding, named as such by being almost
	   invisible until you look for it. */
	.ghost {
		fill: none;
		stroke: var(--border-default);
		stroke-width: 0.6;
		stroke-dasharray: 1 4;
		opacity: 0.5;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	/* The tenure strip under a node: when it held office, on the 1956→2026 axis. */
	.spark rect {
		pointer-events: none;
	}
	/* Compare mode banner: the intersection query, stated in words. */
	.compare-banner {
		position: absolute;
		top: 44px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		display: flex;
		align-items: center;
		gap: var(--s-4);
		max-width: min(560px, calc(100vw - var(--s-8)));
		padding: var(--s-3) var(--s-4);
		background: color-mix(in oklch, var(--surface-overlay) 92%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		box-shadow: var(--elev-2);
		backdrop-filter: blur(8px);
		font-size: var(--t-xs);
	}
	.compare-banner .cmp-title {
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.compare-banner .cmp-n {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.compare-banner .cmp-exit {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-secondary);
		padding: 2px 8px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.compare-banner .cmp-exit:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.edge.arrow {
		marker-end: url(#dt-arrow);
	}
	/* The dismissal surface: transparent, painted, under everything. */
	.bg {
		pointer-events: all;
	}
	/* The gutter channel between lanes — where cross-layer traffic runs. */
	.gutter-strip {
		fill: var(--surface-sunken);
	}
	/* The centreline: the channel's spine, dotted so a reader can trace it
	   without mistaking it for an edge. */
	.gutter-line {
		stroke: var(--border-subtle);
		stroke-width: 1;
		stroke-dasharray: 2 6;
	}

	/* The minimap: a miniature of the world with the live viewport rectangle.
	   A reference and a control at once — click or drag to centre the map. */
	.minimap {
		position: absolute;
		inset-inline-start: var(--s-6);
		bottom: var(--s-6);
		z-index: 2;
		width: 132px;
		padding: 3px;
		background: color-mix(in oklch, var(--surface-panel) 88%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		backdrop-filter: blur(8px);
		box-shadow: var(--elev-2);
		cursor: crosshair;
	}
	.minimap svg {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
	}
	.mm-lane {
		fill: var(--c);
		opacity: 0.1;
	}
	.mm-gutter {
		fill: var(--surface-sunken);
	}
	.mm-view {
		fill: color-mix(in oklch, var(--accent) 14%, transparent);
		stroke: var(--accent);
		stroke-width: 1;
	}

	/* Clear focus: the explicit dismissal, for readers who do not know that
	   click-away and Escape both pop the stack. */
	.clear-focus {
		padding: 4px 10px;
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in oklch, var(--surface-panel) 88%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		backdrop-filter: blur(8px);
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.clear-focus:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
		background: color-mix(in oklch, var(--surface-overlay) 88%, transparent);
	}

	/* Gutter traffic labels, written vertically down each channel. */
	.vgutter {
		position: absolute;
		top: 34px;
		left: 0;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		color: color-mix(in oklch, var(--bridge) 72%, var(--text-primary));
		text-shadow:
			0 0 3px var(--surface-base),
			0 0 3px var(--surface-base),
			1px 1px 0 var(--surface-base),
			-1px -1px 0 var(--surface-base);
		writing-mode: vertical-rl;
		pointer-events: none;
	}
	.stats .withheld {
		color: color-mix(in oklch, var(--text-faint) 85%, transparent);
		cursor: help;
		border-bottom: 1px dotted color-mix(in oklch, var(--border-strong) 70%, transparent);
		opacity: 0.9;
		font-size: calc(var(--t-xs) - 0.5px);
	}
	.a11y-sub {
		margin: var(--s-5) 0 var(--s-3);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 560;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.a11y table + table {
		margin-top: var(--s-6);
	}
	.viewnav {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--s-3);
		position: absolute;
		inset-inline-end: var(--s-6);
		top: var(--s-6);
		/* Above the legend: the open legend is tall enough (its rows stretch
		   because the component svg rule sizes every svg to its container) to
		   reach up beside this cluster on a wide screen. Interactive chrome must
		   stay reachable over a reference panel; still below the edgecard (4)
		   and the Inspector sheet (45). */
		z-index: 3;
	}

	.edge-tip {
		position: absolute;
		/* Centred so it never sits on the minimap (bottom-left) or the legend
		   (bottom-right); centring is symmetric, so this is safe in RTL too. */
		left: 50%;
		transform: translateX(-50%);
		bottom: var(--s-6);
		z-index: 2;
		max-width: 330px;
		padding: var(--s-4) var(--s-5);
		background: color-mix(in oklch, var(--surface-panel) 90%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		box-shadow: var(--elev-3);
		backdrop-filter: blur(8px);
		pointer-events: none;
		animation: fade-in var(--dur-instant) var(--ease-out);
	}

	/* The hover power-card: names a node and its current post without committing.
	   A smaller sibling of the edge-tip, anchored near the node it describes. */
	.node-tip {
		position: absolute;
		z-index: 2;
		max-width: 220px;
		padding: var(--s-3) var(--s-4);
		background: color-mix(in oklch, var(--surface-panel) 92%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		box-shadow: var(--elev-2);
		backdrop-filter: blur(8px);
		pointer-events: none;
		animation: fade-in var(--dur-instant) var(--ease-out);
	}
	.node-tip strong {
		display: block;
		font-size: var(--t-sm);
		font-weight: 560;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.node-tip .tip-post {
		display: block;
		margin-top: 2px;
		font-size: var(--t-2xs);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.node-tip .tip-post i {
		font-style: normal;
		color: var(--text-faint);
	}
	.node-tip .muted {
		color: var(--text-faint);
	}
	.edge-tip .verb {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
		margin-bottom: var(--s-1);
	}
	.edge-tip strong {
		display: block;
		font-weight: 520;
		font-size: var(--t-base);
		line-height: var(--lh-tight);
	}
	.tip-meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-top: var(--s-4);
	}
	.tip-cta {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	.edgecard {
		position: absolute;
		z-index: 4;
	}
	/* On a phone the card docks to the bottom instead of chasing the tapped line: a
	   320px panel placed near a tap on a 390px screen covers what was tapped. */
	.edgecard.sheet {
		inset: auto var(--s-4) var(--s-4) var(--s-4);
	}

	.a11y {
		border-top: 1px solid var(--border-subtle);
		padding: var(--s-5) var(--s-6);
		font-size: var(--t-base);
		color: var(--text-secondary);
		max-height: 40vh;
		/* Both axes. The five-column table is wider than a phone, and this is the
		   accessible equivalent of the whole graph — content that cannot be scrolled to
		   is content the table does not actually provide. */
		overflow: auto;
		flex-shrink: 0;
	}
	.a11y summary {
		cursor: pointer;
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.a11y table {
		width: 100%;
		border-collapse: collapse;
		margin-top: var(--s-5);
		font-size: var(--t-sm);
	}
	.a11y caption {
		text-align: start;
		color: var(--text-faint);
		font-size: var(--t-xs);
		padding-bottom: var(--s-4);
		max-width: 90ch;
		line-height: var(--lh-snug);
	}
	.a11y th,
	.a11y td {
		text-align: start;
		padding: var(--s-2) var(--s-6) var(--s-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.a11y th {
		color: var(--text-faint);
		font-weight: 400;
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-wide);
	}
	.rowopen {
		font-size: var(--t-xs);
		color: var(--accent);
		white-space: nowrap;
		border-bottom: 1px solid var(--accent-border);
	}
	.rowopen:hover {
		color: var(--accent-hover);
	}

	.legend {
		position: absolute;
		inset-inline-end: var(--s-6);
		bottom: var(--s-6);
		z-index: 2;
		/* Compact by design: a reference strip, not a panel. The content is the
		   same (basis strokes, focused-state colours, bridges) but at instrument
		   density — two-column swatch grids and 9.5px labels. */
		max-width: 244px;
		padding: var(--s-3) var(--s-4);
		background: color-mix(in oklch, var(--surface-panel) 88%, transparent);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-sm);
		backdrop-filter: blur(8px);
		box-shadow: var(--elev-2);
	}
	.legend summary {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		cursor: pointer;
		list-style: none;
	}
	.legend summary::-webkit-details-marker {
		display: none;
	}
	.legend summary:hover {
		color: var(--text-primary);
	}
	/* Closed, the summary IS the control, so it needs no bottom margin. Open, it is a
	   heading over the rows and does. */
	.legend[open] summary {
		margin-bottom: var(--s-3);
		padding-bottom: var(--s-2);
		border-bottom: 1px solid var(--border-subtle);
	}
	.legend .lsec {
		margin: var(--s-3) 0 var(--s-1);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.legend .lsec:first-of-type {
		margin-top: 0;
	}
	.lrow {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
		font-size: var(--t-2xs);
		line-height: 1.9;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.lsec + .lrow {
		margin-top: var(--s-1);
	}
	/* The two-column swatch grids: basis strokes, relationship types, bridges. */
	.lgrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: var(--s-4);
		margin-top: var(--s-1);
	}
	.lgrid .lrow {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lgrid svg {
		flex-shrink: 0;
	}
	/* A relationship-type swatch: a dot in the type colour, not a full-width
	   line — the legend is a key, not a chart of its own. */
	.rdot {
		flex-shrink: 0;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--c, var(--text-muted));
	}

	/* --- compact ----------------------------------------------------------- */

	@media (max-width: 900px) {
		/*
			The canvas is the view; on a phone everything else is overhead. The standing
			explanation of what fixed lanes mean is the first thing to go — it is a
			sentence you read once, and it is still in the aria-label and on the wide
			layout.
		*/
		.hint {
			display: none;
		}
		.toolbar {
			gap: var(--s-5);
			padding: var(--s-4) var(--s-5);
		}
		.stats {
			font-size: var(--t-2xs);
			gap: var(--s-4);
		}
		.legend {
			inset-inline-end: var(--s-4);
			bottom: var(--s-4);
			padding: var(--s-3) var(--s-4);
		}
		/* On a phone the map IS the screen; a minimap over it is a second map. */
		.minimap {
			display: none;
		}
		.viewnav {
			inset-inline-end: var(--s-4);
			/* Clear of the pinned lane headers, which occupy the top strip. */
			top: auto;
			bottom: calc(var(--s-4) + 44px);
		}
		.a11y {
			max-height: none;
		}
	}
</style>
