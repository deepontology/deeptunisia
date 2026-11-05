<script lang="ts">
	import AboutView from '$lib/shell/AboutView.svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { goto, replaceState } from '$app/navigation';
	import { seatedAt } from '$lib/civic';
	import { app } from '$lib/state.svelte';
	import { sheetDrag, type SheetDragParams } from '$lib/ui/sheet-drag';
	import { t, tf, formatDate, layerLabel, basisLabel, relLabel, entityName, nameOf } from '$lib/t.svelte';
	import { dirFor, format } from '$lib/i18n';
	import Chip from '$lib/ui/Chip.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import ConnectionCard from './ConnectionCard.svelte';
	import NetworkMatrix from './network/NetworkMatrix.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { Camera } from '$lib/viz/camera.svelte';
	import { navigable } from '$lib/viz/gestures';
	import NavControls from '$lib/viz/NavControls.svelte';
	import {
		BASIS_COLOR,
		BASIS_OPACITY,
		BASIS_ORDER,
		DASH,
		LAYERS,
		LAYER_COLOR,
		ds,
		institutionById,
		meetsBasis,
		personById,
		type Basis,
		type Layer,
		type Position
	} from '$lib/model';
	import { REL_TYPE_COLOR } from '$lib/viz/groups';
	import { tradeIn, debtIn } from '$lib/world/countries';
	import { moneyM } from '$lib/world/format';
	import { sceneAt, laneFrames, nameWidth, GEO, WIDEN_MAX, type FlowTie, type Tie, type Unit } from '$lib/network/scene';
	import { routeTies } from '$lib/network/route';
	import { dotsAt, DOT } from '$lib/network/dots';
	import {
		DEFAULT_FAMILIES,
		FAMILIES,
		familiesFromMode,
		familiesFromParam,
		familiesParam,
		familyOf,
		type Family
	} from '$lib/network/families';

	/**
	 * The Network: a seating chart of the state, with the ties between its seats.
	 *
	 * Each analytical layer keeps a lane, so a line that crosses lanes is still a
	 * bridge between layers of power. Inside a lane, an institution is a box and a
	 * person in post is a seat inside it. Holding office therefore costs no ink:
	 * the lines left are claims (who appointed, owns, prosecutes or is related to
	 * whom), drawn in the basis vocabulary every view shares. A chamber is one box
	 * with its seats counted by group; only a member a drawn tie names gets a seat.
	 * See src/lib/network/scene.ts for the rules and why they exist.
	 *
	 * PERFORMANCE
	 *
	 * Two things made the old map slow, and both are gone. It drew around 1,400
	 * nodes and 2,800 paths, and it recomputed every label's screen position and
	 * collision on every camera frame. Now the scene holds a few hundred seats,
	 * and all text lives in one HTML layer that shares the camera's transform: a
	 * pan or zoom writes one transform on three elements and nothing else. Text
	 * is set in world units, so it can never outgrow its row; it is hidden by
	 * zoom level (a class that changes only when a threshold is crossed) rather
	 * than placed by a solver.
	 */

	// --- Lenses: tie families, carried in the URL ------------------------------

	let families = $state<Set<Family>>(new Set(DEFAULT_FAMILIES));
	/** Set once a URL named the lens; a deep link then never overrides the reader's own choice. */
	let familiesLinked = false;

	/**
	 * Write the reader's lens or view into the address bar, through SvelteKit's
	 * `replaceState` (see the trap in deeplink.svelte.ts). That is shallow
	 * routing: `page.url` stays at the last navigation, so every write builds on
	 * the address bar itself, and the layout's `?id=` write does the same.
	 * A write from the first deep-link pass can come before the router is
	 * ready; it waits a task.
	 */
	function writeUrl(mutate: (u: URL) => void) {
		if (typeof history === 'undefined') return;
		const write = () => {
			const u = new URL(location.href);
			mutate(u);
			if (u.href !== location.href) replaceState(u, page.state);
		};
		try {
			write();
		} catch {
			setTimeout(write, 0);
		}
	}

	function syncFamiliesUrl() {
		writeUrl((u) => {
			u.searchParams.delete('mode');
			const v = familiesParam(families);
			if (v === null) u.searchParams.delete('ties');
			else u.searchParams.set('ties', v);
		});
	}

	function toggleFamily(f: Family) {
		const next = new Set(families);
		if (next.has(f)) next.delete(f);
		else next.add(f);
		families = next;
		syncFamiliesUrl();
	}

	/** Make sure a family is on, for a deep link that names a tie in it. */
	function ensureFamily(f: Family) {
		if (families.has(f) || familiesLinked) return;
		families = new Set([...families, f]);
		syncFamiliesUrl();
	}

	// --- View: the map, the dots, or the layer matrix ------------------------------

	/**
	 * Three readings of one scene. The map seats people in their institutions
	 * and draws only claims; the dots draw the same record as a node-link
	 * diagram, posts included; the matrix counts ties between layers.
	 *
	 * A phone holds one lane of the map at a time, so it opens on the matrix,
	 * which shows the whole picture at once; a wide screen opens on the map.
	 * Any can be chosen, and the choice travels in the URL.
	 */
	type View = 'map' | 'dots' | 'matrix';
	const VIEWS: View[] = ['map', 'dots', 'matrix'];
	let view = $state<View>('map');
	/** Map and dots share a canvas, a camera and every interaction. */
	const canvasView = $derived(view !== 'matrix');
	/**
	 * The stage renders once the client has chosen the view. The page is
	 * prerendered at desktop width, so choosing during render would hand a
	 * phone a map it immediately throws away (or a hydration mismatch).
	 */
	let ready = $state(false);
	let viewLinked = false;
	$effect(() => {
		if (viewLinked) return;
		const v = page.url.searchParams.get('view');
		untrack(() => {
			viewLinked = true;
			view = VIEWS.includes(v as View) ? (v as View) : compact.current ? 'matrix' : 'map';
			ready = true;
		});
	});
	function setView(v: View) {
		if (v === view) return;
		// Keep the reader's place when trading map for dots: the same point of
		// the world under the centre of the screen, at the same zoom.
		if (v !== 'matrix' && view !== 'matrix' && cam.vw > 2) {
			const c = cam.screenToWorld(cam.vw / 2, cam.vh / 2);
			keepAt = { x: c.x / Math.max(1, worldH()), y: c.y / Math.max(1, worldH()), fx: c.x };
		}
		view = v;
		writeUrl((u) => {
			const deflt = compact.current ? 'matrix' : 'map';
			if (v === deflt) u.searchParams.delete('view');
			else u.searchParams.set('view', v);
		});
	}

	// --- The scene ----------------------------------------------------------------

	const rtl = $derived(dirFor(app.locale) === 'rtl');

	/**
	 * Measured flows: Tunisia's top trade partners and creditors for the year
	 * on the clock, as synthesised lines. Only partners with a record on the map
	 * are eligible; an absent counterparty stays a gap in the World ledger rather
	 * than becoming an invented box here. Ids are namespaced `flow-` and never
	 * enter data/relationships.yaml.
	 */
	/** The year on the clock: flows are yearly, so they rebuild only when it changes. */
	const year = $derived(new Date(app.t).getUTCFullYear());
	const flows = $derived.by((): FlowTie[] => {
		const byIso = new Map(
			ds.institutions
				.map((i) => [(i as unknown as { iso2?: string }).iso2, i] as const)
				.filter(([iso]) => Boolean(iso))
		);
		const out: FlowTie[] = [];
		for (const f of tradeIn(year).slice(0, 20)) {
			const target = byIso.get(f.iso2);
			if (!target) continue;
			out.push({
				id: `flow-trade-${year}-${f.iso2}`,
				to: target.id,
				type: 'trade-flow',
				subtype: String(year),
				description: tf('network.flow.trade.description', { year, value: moneyM(f.total, app.locale) }),
				value: f.total
			});
		}
		for (const f of debtIn(year).slice(0, 20)) {
			const target = f.institutionId ? institutionById.get(f.institutionId) : byIso.get(f.iso2);
			if (!target || f.stock === null) continue;
			out.push({
				id: `flow-debt-${year}-${f.institutionId ?? f.iso2}`,
				to: target.id,
				type: 'debt-flow',
				subtype: String(year),
				description: tf('network.flow.debt.description', { year, value: moneyM(f.stock, app.locale) }),
				value: f.stock
			});
		}
		return out;
	});

	/**
	 * The scene, reused while the record is unchanged (see sceneAt): scrubbing
	 * between two dates on which nobody took or left a post hands the view the
	 * same object, so nothing downstream recomputes or re-renders.
	 */
	/**
	 * How much wider than the base the lanes are drawn on this screen.
	 *
	 * Fitting the base world to a wide window only magnifies it, so a 2,560
	 * pixel screen showed the same truncated names as a laptop, larger. Instead
	 * the lanes stretch until the fitted map sits at about its natural size, and
	 * the extra pixels become room for names. In eighths, so a window dragged a
	 * few pixels does not rebuild the scene.
	 */
	const widen = $derived.by(() => {
		if (compact.current || cam.vw < 2) return 1;
		const base = laneFrames(LAYERS.filter((l) => app.activeLayers.has(l)), 1).width;
		const w = (cam.vw - PADDING * 2) / (0.95 * base);
		return Math.min(WIDEN_MAX, Math.max(1, Math.floor(w * 8) / 8));
	});

	const scene = $derived(
		sceneAt({ t: app.t, floor: app.basisFloor, layers: app.activeLayers, families, flows, rtl, widen })
	);
	const routes = $derived(routeTies(scene));
	/** The dot view of the same scene, built only while it is on screen. */
	const dots = $derived(view === 'dots' ? dotsAt(scene, rtl) : null);
	/** Each tie's line in the view on screen: routed on the map, curved in dots. */
	const tiePaths = $derived(dots ? dots.paths : routes);
	/** Where an entity is drawn in the view on screen. */
	function pointOf(id: string): { x: number; y: number } | null {
		if (dots) {
			const p = dots.pos.get(id);
			return p ? { x: p.x, y: p.y } : null;
		}
		const a = scene.anchors.get(id);
		if (!a) return null;
		const unit = scene.unitOf.get(id);
		return { x: unit && unit.id === id ? unit.x + unit.w / 2 : (a.xl + a.xr) / 2, y: a.y };
	}
	const worldH = () => (dots ? dots.height : scene.height);
	const tieById = $derived(new Map(scene.ties.map((e) => [e.id, e])));

	/** Ties per family: drawn when the family is on, held back when it is off. */
	const familyCount = $derived.by(() => {
		const shown = new Map<Family, number>();
		for (const e of scene.ties) shown.set(e.family, (shown.get(e.family) ?? 0) + (e.bundle ?? 1));
		const out = new Map<Family, number>();
		for (const f of FAMILIES) out.set(f, families.has(f) ? (shown.get(f) ?? 0) : (scene.stats.notShown.get(f) ?? 0));
		return out;
	});
	const notShownTotal = $derived([...scene.stats.notShown.values()].reduce((a, n) => a + n, 0));

	// --- Camera -------------------------------------------------------------------

	const PADDING = 16;
	const cam = new Camera({ world: { w: 2000, h: 1600 }, minScale: 0.12, maxScale: 4, padding: PADDING });

	/**
	 * The world follows the scene, and "fit" means fit the width.
	 *
	 * The lanes are the structure, so the opening view shows all of them side by
	 * side and the reader travels down. On a phone a lane is the unit: fitting
	 * means one full lane across the screen, and the reader pans between lanes
	 * (or uses the matrix, which shows every pair at once).
	 */
	$effect(() => {
		const w = scene.width;
		const h = dots ? dots.height : scene.height;
		const vw = cam.vw;
		const phone = compact.current;
		untrack(() => {
			cam.world = { w, h };
			cam.fitFloor = phone
				? Math.min(1.2, Math.max(0.4, (vw - 24) / (GEO.LANE * 1.5 + GEO.GUT * 2)))
				: Math.min(1.1, Math.max(0.2, (vw - PADDING * 2) / w));
		});
	});

	/**
	 * Open on the top of the map once the canvas has been measured, then take
	 * any flight that was asked for before there was a map to fly over (a deep
	 * link, or "show on the map" from the matrix).
	 */
	let framed = false;
	/** Where the reader was when they switched between map and dots, as a share of the height. */
	let keepAt: { x: number; y: number; fx: number } | null = null;
	$effect(() => {
		if (cam.vw < 2 || !canvasView) return;
		void dots;
		untrack(() => {
			if (!framed) {
				framed = true;
				cam.fit();
				cam.alignTo(compact.current ? 0 : cam.world.w / 2, 0, compact.current ? 0 : 0.5, 0);
			} else if (keepAt) {
				const k = keepAt;
				keepAt = null;
				cam.alignTo(k.fx, k.y * worldH(), 0.5, 0.5);
			}
			flushPendingFly();
		});
	});

	/**
	 * Levels of detail, by screen size of the text: below a threshold a kind of
	 * text would draw too small to read, so it is hidden rather than left to
	 * smear. A class on the canvas, so crossing a threshold restyles once and
	 * panning restyles nothing.
	 */
	const lod = $derived(cam.k < 0.42 ? 0 : cam.k < 0.9 ? 1 : 2);

	// --- Focus, compare -------------------------------------------------------------

	const focus = $derived(app.selected ?? app.hovered);

	/** The focused entity and everything a drawn tie connects it to. */
	const near = $derived.by(() => {
		if (!focus || compare) return null;
		const s = new Set<string>([focus]);
		for (const e of scene.ties) {
			if (e.rel.from === focus) s.add(e.rel.to);
			else if (e.rel.to === focus) s.add(e.rel.from);
		}
		return s;
	});

	let compareId = $state<string | null>(null);
	const compare = $derived.by(() => {
		if (!app.selected || !compareId || app.selected === compareId) return null;
		const egoA = new Set<string>();
		const egoB = new Set<string>();
		for (const e of scene.ties) {
			if (e.rel.from === app.selected) egoA.add(e.rel.to);
			else if (e.rel.to === app.selected) egoA.add(e.rel.from);
			if (e.rel.from === compareId) egoB.add(e.rel.to);
			else if (e.rel.to === compareId) egoB.add(e.rel.from);
		}
		const common = new Set<string>();
		for (const id of egoA) if (id !== app.selected && id !== compareId && egoB.has(id)) common.add(id);
		return { a: app.selected, b: compareId, common, set: new Set([app.selected, compareId, ...common]) };
	});

	/** Whether an entity is pushed back by the current focus or comparison. */
	function dimmed(id: string | null): boolean {
		if (!id) return !!(near || compare);
		if (compare) return !compare.set.has(id);
		if (near) return !near.has(id);
		return false;
	}

	/** A box is lit when it, or anyone seated in it, is in the focused set. */
	function unitDimmed(u: Unit): boolean {
		if (!near && !compare) return false;
		if (u.id && !dimmed(u.id)) return false;
		return u.seats.every((s) => dimmed(s.person));
	}

	function incident(e: Tie): boolean {
		if (compare) return compare.set.has(e.rel.from) && compare.set.has(e.rel.to);
		return !!focus && (e.rel.from === focus || e.rel.to === focus);
	}

	// --- Edges ------------------------------------------------------------------------

	let hoverEdge = $state<string | null>(null);
	let pinnedId = $state<string | null>(null);
	const pinned = $derived(pinnedId ? (tieById.get(pinnedId) ?? null) : null);

	/** Ties drawn above the boxes: the focused ones, the hovered one and the pinned one. */
	const topTies = $derived(
		scene.ties.filter((e) => incident(e) || e.id === hoverEdge || e.id === pinnedId)
	);
	const topIds = $derived(new Set(topTies.map((e) => e.id)));

	const INFLUENCE_TYPES = new Set(['influence', 'reported-influence', 'advisory']);

	/**
	 * Stroke width. Authored influence strength widens an influence tie (a claim
	 * about a claim, stored on the edge); several ties between one pair thicken
	 * the line; a bundle of party ties and a measured flow scale with the square
	 * root of what they carry, so a ten-billion flow is not ten times a billion.
	 */
	function edgeWidth(e: Tie): number {
		if (e.measurement) return 1 + Math.min(2.6, Math.sqrt(Math.max(0, e.flowValue ?? 0)) / 30);
		if (e.bundle) return 1 + Math.min(5, Math.sqrt(e.bundle) * 0.55);
		const strength = INFLUENCE_TYPES.has(e.rel.type)
			? (e.rel as { influence?: { strength?: number } }).influence?.strength
			: undefined;
		const base = strength ? 0.8 + strength * 2.6 : 1.25;
		return base * (1 + 0.5 * Math.min(2, Math.max(1, e.multi) - 1));
	}

	function edgeDash(e: Tie): string | undefined {
		return e.measurement ? undefined : DASH[(e.rel.basis ?? 'documented') as Basis];
	}

	function edgeOpacity(e: Tie): number {
		return e.measurement ? 0.42 : BASIS_OPACITY[(e.rel.basis ?? 'documented') as Basis];
	}

	/**
	 * At rest a line wears its source layer's colour, or the bridge colour when
	 * it crosses layers. A focused tie recolours to its relationship type, so
	 * "who he appointed" and "his family" read apart; nothing else changes
	 * colour underneath the reader.
	 */
	function edgeColor(e: Tie, top: boolean): string {
		if (top && incident(e)) return REL_TYPE_COLOR[e.rel.type] ?? (e.crossLayer ? 'var(--bridge)' : LAYER_COLOR[e.a.layer]);
		if (e.measurement) return 'var(--text-muted)';
		return e.crossLayer ? 'var(--bridge)' : LAYER_COLOR[e.a.layer];
	}

	// --- Hover tips (pointer-placed, never per frame) ------------------------------

	let tipAt = $state<{ x: number; y: number } | null>(null);
	let canvasEl = $state<HTMLDivElement | null>(null);

	function pointerAt(e: PointerEvent | MouseEvent) {
		const r = canvasEl?.getBoundingClientRect();
		if (!r) return null;
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	/** Hover is delegated: one listener for every seat, chip and box title. */
	function onWorldOver(e: PointerEvent) {
		if (e.pointerType === 'touch') return;
		const el = (e.target as Element).closest?.('[data-id]') as HTMLElement | null;
		const id = el?.dataset.id ?? null;
		if (id !== app.hovered) app.hovered = id;
		tipAt = id ? pointerAt(e) : null;
	}
	function onWorldOut(e: PointerEvent) {
		const to = (e.relatedTarget as Element | null)?.closest?.('[data-id]');
		if (!to) {
			app.hovered = null;
			tipAt = null;
		}
	}

	function postTitle(p: Position): string {
		const x = p as Position & { roleTitleFr?: string; roleTitleAr?: string };
		if (app.locale === 'ar' && x.roleTitleAr) return x.roleTitleAr;
		if (app.locale === 'fr' && x.roleTitleFr) return x.roleTitleFr;
		return p.roleTitle;
	}

	/** What the hovered entity is doing on the map right now. */
	const hoverInfo = $derived.by(() => {
		const id = app.hovered;
		if (!id) return null;
		const unit = scene.unitOf.get(id);
		const seat = unit?.seats.find((s) => s.person === id && s.primary);
		let line = '';
		if (seat?.position) line = `${postTitle(seat.position)} · ${entityName(seat.position.institution)}`;
		else if (unit?.kind === 'chamber' && personById.has(id)) line = tf('network.tip.member', { chamber: entityName(unit.id!) });
		else if (unit?.kind === 'actors') line = t('network.tip.outside');
		else if (unit?.chamber) line = tf('network.chamber.named', { n: unit.chamber.named, seats: unit.chamber.seats });
		else if (unit) line = layerLabel(unit.layer);
		const ties = scene.ties.filter((e) => e.rel.from === id || e.rel.to === id).length;
		return { name: entityName(id), line, ties };
	});

	const hoveredTie = $derived(hoverEdge && !pinned ? (tieById.get(hoverEdge) ?? null) : null);

	// --- Long-press: the touch hover tier -----------------------------------------

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

	// --- Selecting and flying -------------------------------------------------------

	/**
	 * A selection made on the map flies gently (the reader is already looking at
	 * it); one made anywhere else (search, another view, a deep link, a card's
	 * endpoint) flies decisively, because that navigation must travel.
	 */
	let selectFly: 'gentle' | 'strong' = 'strong';
	function selectOnMap(id: string, e?: MouseEvent) {
		if (pressed) return;
		if (e?.shiftKey) {
			compareId = compareId === id ? null : id;
			return;
		}
		cam.skipResizePan = true;
		selectFly = 'gentle';
		app.select(id);
	}

	/** A flight requested before the map was measured (a deep link, the matrix's "show"). */
	let pendingFly: { x: number; y: number } | null = null;
	function flyToPoint(x: number, y: number, gentle = false) {
		if (cam.vw < 2 || !canvasView) {
			pendingFly = { x, y };
			return;
		}
		// On a phone the inspector is a bottom sheet: land in the upper third so
		// the subject is not underneath the card it just opened.
		const cy = compact.current ? cam.vh * 0.3 : undefined;
		if (gentle) {
			cam.flyTo(x, y, Math.max(cam.k, cam.fitScale * 1.4), 640, 'inout', undefined, cy);
		} else {
			cam.flyTo(x, y, Math.max(cam.k, Math.min(1.25, cam.fitScale * 2)), 560, 'out', undefined, cy);
		}
	}
	function flushPendingFly() {
		if (!pendingFly) return;
		const p = pendingFly;
		pendingFly = null;
		cam.flyTo(p.x, p.y, Math.max(cam.k, Math.min(1.25, cam.fitScale * 2)), 0, 'out', undefined, compact.current ? cam.vh * 0.3 : undefined);
	}

	/**
	 * Fly to whatever got selected. `untrack` is not optional: flyTo reads and
	 * writes the camera, and an effect that writes what it reads self-triggers
	 * and aborts the whole effect tree (see AGENTS.md history).
	 */
	$effect(() => {
		const id = app.selected;
		if (!id) return;
		untrack(() => {
			const mode = selectFly;
			selectFly = 'strong';
			const p = pointOf(id);
			if (!p) return;
			flyToPoint(p.x, p.y, mode === 'gentle');
		});
	});

	/** A selected entity the map cannot show at this date says so, rather than doing nothing. */
	const offMap = $derived(
		app.selected && !scene.anchors.has(app.selected) && (personById.has(app.selected) || institutionById.has(app.selected))
			? app.selected
			: null
	);

	// --- The pinned connection --------------------------------------------------------

	let pinnedClosing = $state(false);
	let pinnedCloseTimer: ReturnType<typeof setTimeout> | undefined;

	function closePinned() {
		if (pinnedId === null) return;
		clearTimeout(pinnedCloseTimer);
		if (!compact.current) {
			pinnedId = null;
			pinnedClosing = false;
			return;
		}
		pinnedClosing = true;
		pinnedCloseTimer = setTimeout(() => {
			pinnedId = null;
			pinnedClosing = false;
		}, 260);
	}
	$effect(() => {
		if (pinnedId !== null) {
			clearTimeout(pinnedCloseTimer);
			pinnedClosing = false;
		}
	});
	$effect(() => () => clearTimeout(pinnedCloseTimer));

	const edgeDragParams: SheetDragParams = {
		enabled: () => compact.current,
		detent: () => 'full',
		setDetent: () => {},
		hasPeek: () => false,
		handle: '.sheet-handle',
		dismiss: () => closePinned()
	};

	const CARD_W = 320;
	const CARD_H = 300;
	const cardAt = $derived.by(() => {
		if (!pinned) return null;
		if (view === 'matrix') return { x: Math.max(8, cam.vw - CARD_W - 16), y: 16 };
		const m = tiePaths.get(pinned.id)?.mid ?? { x: pinned.a.xr, y: pinned.a.y };
		const s = cam.worldToScreen(m.x, m.y);
		return {
			x: Math.max(8, Math.min(s.x + 16, cam.vw - CARD_W - 8)),
			y: Math.max(8, Math.min(s.y + 12, cam.vh - CARD_H - 8))
		};
	});

	/** The card's edge, in the shape ConnectionCard reads. */
	const cardEdge = $derived(pinned ? { ...pinned, active: true } : null);

	/** A tie opened from anywhere: a bundle of party ties opens its party; everything else its card. */
	function openTie(e: Tie, fly = false) {
		if (e.bundle) {
			app.selected = e.rel.to;
			return;
		}
		pinnedId = e.id;
		if (fly) {
			const m = tiePaths.get(e.id)?.mid;
			if (m) flyToPoint(m.x, m.y);
		}
	}

	function pick(id: string) {
		pinnedId = null;
		// Assign, never toggle: naming someone in a card is a request to go to them.
		app.selected = id;
	}

	// --- Deep links ---------------------------------------------------------------------

	/**
	 * `?id=` selects, `?rel=` pins a connection, `?flow=` pins a measurement,
	 * `?ties=` (or the older `?mode=`) names the lens, `?agreement=` and energy
	 * flows hand the reader to the World ledger that owns those records. Runs
	 * once; a link that names a tie in a family the lens has off turns that
	 * family on, unless the link also named the lens.
	 */
	let deepLinked = false;
	$effect(() => {
		if (deepLinked) return;
		const params = page.url.searchParams;
		untrack(() => {
			deepLinked = true;
			const agreement = params.get('agreement');
			if (agreement) {
				const u = new URL(page.url);
				u.pathname = '/world';
				u.search = new URLSearchParams({ agreement }).toString();
				void goto(u, { replaceState: true });
				return;
			}
			const flow = params.get('flow');
			if (flow?.startsWith('energy:')) {
				const u = new URL(page.url);
				u.pathname = '/world';
				u.search = new URLSearchParams({ flow }).toString();
				void goto(u, { replaceState: true });
				return;
			}

			const named = familiesFromParam(params.get('ties')) ?? familiesFromMode(params.get('mode'));
			if (named) {
				families = named;
				familiesLinked = true;
			}

			const entity = params.get('id');
			if (entity && (personById.has(entity) || institutionById.has(entity))) {
				app.selected = entity;
				return;
			}

			if (flow) {
				const parts = flow.split(':');
				if (parts.length !== 3) return;
				const [kind, yearStr, iso2] = parts;
				if ((kind !== 'trade' && kind !== 'debt') || !iso2 || !/^\d{4}$/.test(yearStr)) return;
				ensureFamily('flows');
				const prefix = `flow-${kind}-${yearStr}-`;
				const ofKind = scene.ties.filter((x) => x.id.startsWith(prefix));
				const isoOf = (id: string) => (institutionById.get(id) as { iso2?: string } | undefined)?.iso2;
				const seatOf = (id: string) => (institutionById.get(id) as { seat?: string } | undefined)?.seat;
				const e =
					ofKind.find((x) => x.id === `${prefix}${iso2}`) ??
					(kind === 'debt' ? ofKind.find((x) => isoOf(x.rel.to) === iso2) : undefined) ??
					ofKind.find((x) => x.rel.to === iso2 || seatOf(x.rel.to) === iso2);
				if (!e) {
					// Not on this map (outside the top 20, another year, a lane hidden):
					// the globe owns the card, so the link is never a dead end.
					const u = new URL(page.url);
					u.pathname = '/world';
					u.search = new URLSearchParams({ flow }).toString();
					void goto(u, { replaceState: true });
					return;
				}
				if (view === 'matrix') setView('map');
				openTie(e, true);
				return;
			}

			const want = params.get('rel');
			if (!want) return;
			const rel = ds.relationships.find((r) => r.id === want);
			if (!rel) return;
			const shown = meetsBasis(rel.basis as Basis, app.basisFloor);
			if (shown) ensureFamily(familyOf(rel.type));
			const e = shown ? (scene.ties.find((x) => x.rel.id === want) ?? bundleOf(rel)) : undefined;
			if (!e) {
				// Not drawn on this map (below the floor, a hidden layer, another
				// date): select its person, so the link lands on their card or the
				// off-map notice.
				const end = personById.has(rel.from) ? rel.from : personById.has(rel.to) ? rel.to : rel.from;
				if (personById.has(end) || institutionById.has(end)) app.selected = end;
				return;
			}
			if (view === 'matrix') setView('map');
			openTie(e, true);
		});
	});

	/**
	 * A chamber member's party tie is drawn inside its chamber's bundle, so a
	 * link to that tie opens the bundle that carries it.
	 */
	function bundleOf(rel: { type: string; from: string; to: string }): Tie | undefined {
		if (rel.type !== 'party') return undefined;
		const person = personById.has(rel.from) ? rel.from : rel.to;
		const party = person === rel.from ? rel.to : rel.from;
		return scene.ties.find((x) => {
			if (!x.bundle || x.rel.to !== party) return false;
			const term = scene.units.find((u) => u.id === x.rel.from)?.chamber?.term;
			return !!term && seatedAt(term, app.t, app.basisFloor).members.some((m) => m.position.holder === person);
		});
	}

	/** Escape closes the card (or compare) before the shell gets to clear the selection. */
	function onKeyCapture(e: KeyboardEvent) {
		if (e.key === 'Escape' && compareId) {
			compareId = null;
			e.stopPropagation();
			return;
		}
		if (e.key === 'Escape' && pinnedId) {
			closePinned();
			e.stopPropagation();
		}
	}

	// --- Lane headers and the minimap (screen space) -----------------------------------

	const laneHeaders = $derived.by(() =>
		scene.lanes
			.map((layer, i) => {
				const l = cam.worldToScreen(scene.laneX[i], 0).x;
				const r = cam.worldToScreen(scene.laneX[i] + scene.laneW[i], 0).x;
				return { layer, l, r, count: scene.stats.perLane.get(layer) ?? 0 };
			})
			.filter((h) => h.r > 44 && h.l < cam.vw - 8)
			.map((h) => ({
				...h,
				left: Math.max(8, Math.min(h.l + 6, cam.vw - 120)),
				maxWidth: Math.max(88, Math.min(h.r - h.l - 12, cam.vw - Math.max(8, h.l + 6) - 12))
			}))
	);
	const soloed = $derived(app.activeLayers.size === 1);

	const MINI_W = 110;
	const miniH = $derived(Math.min(150, (worldH() / scene.width) * MINI_W));
	/** What the minimap draws: the map's boxes, or the dots' cells. */
	const miniRects = $derived(
		dots
			? [
					...dots.clusters.map((c) => ({ key: c.key, x: c.cx - c.R, y: c.cy - c.R, w: 2 * c.R, h: 2 * c.R, layer: c.layer })),
					...dots.rows.map((r) => ({ key: r.key, x: r.x, y: r.y, w: r.w * 0.6, h: DOT.ROW - 4, layer: r.layer }))
				]
			: scene.units.map((u) => ({ key: u.key, x: u.x, y: u.y, w: u.w, h: u.h, layer: u.layer }))
	);
	const miniView = $derived.by(() => {
		const W = scene.width;
		const H = worldH();
		const wx = -cam.x / cam.k;
		const wy = -cam.y / cam.k;
		const x0 = Math.max(0, wx);
		const y0 = Math.max(0, wy);
		const w = Math.max(0, Math.min(W, wx + cam.vw / cam.k) - x0);
		const h = Math.max(0, Math.min(H, wy + cam.vh / cam.k) - y0);
		return { x: (x0 / W) * MINI_W, y: (y0 / H) * miniH, w: (w / W) * MINI_W, h: (h / H) * miniH };
	});
	let miniDragging = false;
	function miniJump(e: PointerEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return;
		const fx = (e.clientX - r.left) / r.width;
		const fy = (e.clientY - r.top) / r.height;
		cam.alignTo(Math.min(scene.width, Math.max(0, fx * scene.width)), Math.min(worldH(), Math.max(0, fy * worldH())), 0.5, 0.5);
	}

	/**
	 * The legend's open state is the reader's, and only the reader's.
	 *
	 * It was an `open` attribute computed from the screen width, and Svelte
	 * re-applies an element's attributes whenever anything else in that
	 * element's template changes, so a pan or zoom put back whatever the width
	 * said and undid the reader's click. It also opened over the first lane on
	 * any screen 1,800 pixels wide. Now it starts folded, remembers the
	 * reader's choice, and only a click moves it.
	 */
	const LEGEND_KEY = 'deeptunisia:network-legend';
	let legendOpen = $state(false);
	let legendInit = false;
	$effect(() => {
		if (legendInit) return;
		untrack(() => {
			legendInit = true;
			let saved: string | null = null;
			try {
				saved = localStorage.getItem(LEGEND_KEY);
			} catch {
				/* storage blocked: the legend starts folded */
			}
			legendOpen = saved === '1';
		});
	});
	function onLegendToggle(e: Event) {
		const open = (e.currentTarget as HTMLDetailsElement).open;
		if (open === legendOpen) return;
		legendOpen = open;
		try {
			localStorage.setItem(LEGEND_KEY, open ? '1' : '0');
		} catch {
			/* not remembered, still works */
		}
	}
	const LEGEND_REL_TYPES = ['appointment', 'family', 'business', 'prosecution', 'reported-influence', 'party'];

	// --- Click-away: one level of the stack per click ------------------------------------

	function onCanvasBgClick(e: MouseEvent) {
		const t = e.target as Element | null;
		if (t && t.closest('.node, .hit, .box, .vlane, .edgecard, .viewnav, .legend, .minimap, .offmap, .dlabel')) return;
		hoverEdge = null;
		app.hovered = null;
		if (pinnedId) pinnedId = null;
		else if (app.selected) {
			app.selected = null;
			compareId = null;
		}
	}

	// --- Display helpers -------------------------------------------------------------------

	function groupLabel(layer: Layer, group: string): string {
		if (!group) return t('network.outside');
		if (group === 'Other') return t('network.group.other');
		const h = (ds.meta as { groupHeaders?: Record<string, Record<string, { fr: string | null; ar: string | null }>> }).groupHeaders?.[layer]?.[group];
		if (app.locale === 'fr' && h?.fr) return h.fr;
		if (app.locale === 'ar' && h?.ar) return h.ar;
		return group;
	}

	/** Authored ties touching a foreign counterparty right now: the register row's load. */
	const tiesOf = $derived.by(() => {
		const m = new Map<string, number>();
		for (const e of scene.ties) {
			if (e.measurement) continue;
			m.set(e.rel.from, (m.get(e.rel.from) ?? 0) + 1);
			m.set(e.rel.to, (m.get(e.rel.to) ?? 0) + 1);
		}
		return m;
	});

	/** The chamber's three largest groups, named on the box; the rest are counted. */
	function chamberCaption(u: Unit): { name: string; n: number; color: string }[] {
		return (u.chamber?.groups ?? [])
			.filter((g) => g.id)
			.slice(0, 3)
			.map((g) => ({ name: entityName(g.id), n: g.n, color: g.color }));
	}

	/** A chamber's groups as arcs of its ring: start and share of the circle, largest first. */
	function donutArcs(ch: NonNullable<Unit['chamber']>, total: number): { key: string; color: string; start: number; share: number }[] {
		const out: { key: string; color: string; start: number; share: number }[] = [];
		let at = 0;
		for (const g of ch.groups) {
			const share = g.n / total;
			out.push({ key: g.id || 'none', color: g.color, start: at, share });
			at += share;
		}
		return out;
	}

	let tableOpen = $state(false);

	type ChamberCount = NonNullable<Unit['chamber']>;
	/**
	 * A chamber's "held/seats" caption. A chamber known only by its party split
	 * names nobody, but its seats are held: the split is the count. A star
	 * marks a count that leaves members out; the note says which.
	 */
	function chamberShort(c: ChamberCount): string {
		const held = c.split ? c.groups.reduce((a, g) => a + g.n, 0) : c.named;
		return tf('network.chamber.short', { n: held, seats: c.seats }) + (c.withheld || c.uncertain ? '*' : '');
	}
	/** The accessible name of a chamber's box: name, lane, count and what the count leaves out. */
	function chamberAria(id: string, layer: Layer, c: ChamberCount): string {
		const note = chamberNote(c);
		return `${entityName(id)} — ${layerLabel(layer)} — ${chamberShort(c).replace(/\*$/, '')}${note ? ', ' + note : ''}`;
	}

	/** Seats the count leaves out, in the hemicycle's words: below the floor, or dated only to the year. */
	function chamberNote(c: { withheld: number; uncertain: number }): string | undefined {
		const parts = [];
		if (c.uncertain) parts.push(tf('parl.uncertainShort', { n: c.uncertain }));
		if (c.withheld) parts.push(tf('parl.withheldShort', { n: c.withheld }));
		return parts.length ? parts.join(' · ') : undefined;
	}

	const BASIS_RANK: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	const tableTies = $derived(
		[...scene.ties].sort(
			(a, b) =>
				Number(b.crossLayer) - Number(a.crossLayer) ||
				BASIS_RANK.indexOf((a.rel.basis ?? 'documented') as Basis) - BASIS_RANK.indexOf((b.rel.basis ?? 'documented') as Basis) ||
				a.id.localeCompare(b.id)
		)
	);
</script>

<svelte:window onkeydowncapture={onKeyCapture} />

<div class="network" class:phone={compact.current}>
	<div class="toolbar">
		<div class="tb-row">
			<span class="eyebrow">{t('nav.network')}</span>
			<AboutView hint={t('network.hint')} />
		</div>
		<div class="tb-row controls">
			<Segmented
				options={[
					{ value: 'map', label: t('network.view.map'), title: t('network.view.map.hint') },
					{ value: 'dots', label: t('network.view.dots'), title: t('network.view.dots.hint') },
					{ value: 'matrix', label: t('network.view.matrix'), title: t('network.view.matrix.hint') }
				]}
				value={view}
				onchange={(v) => setView(v as View)}
				size="sm"
				label={t('network.view')}
			/>
			<div class="stats mono">
				<span>{tf('network.stat.office', { n: scene.stats.inOffice })}</span>
				<span>{tf('network.stat.ties', { n: scene.stats.ties })}</span>
				<span class="bridge">{tf('network.stat.cross', { n: scene.stats.crossLayer })}</span>
				{#if notShownTotal}
					<Tooltip content={t('network.notshown.hint')}>
						<span class="withheld">{tf('network.stat.notshown', { n: notShownTotal })}</span>
					</Tooltip>
				{/if}
			</div>
		</div>
		<div class="families" role="group" aria-label={t('network.families')}>
			<span class="fam-label">{t('network.families')}</span>
			{#each FAMILIES as f (f)}
				<button
					class="fam"
					class:on={families.has(f)}
					aria-pressed={families.has(f)}
					title={t('network.family.' + f + '.hint')}
					onclick={() => toggleFamily(f)}
				>
					<i class="fam-dot" aria-hidden="true"></i>
					{t('network.family.' + f)}
					<b class="mono">{familyCount.get(f) ?? 0}</b>
				</button>
			{/each}
		</div>
	</div>

	<div class="stage">
		{#if !ready}
			<!-- Prerendered and pre-hydration: the stage waits for the client to choose. -->
		{:else if view === 'matrix'}
			<NetworkMatrix
				{scene}
				onpick={(e) => openTie(e)}
				onshow={(e) => {
					setView('map');
					openTie(e, true);
				}}
			/>
		{:else}
			<!--
				The camera surface. role="application" because it answers its own keys
				(arrows, +/-, 0) once focused; every entity on it is a real button, and
				the table below is the complete text equivalent.
			-->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<div
				class="canvas lod-{lod}"
				class:dotsview={!!dots}
				class:moving={cam.moving}
				class:focusing={!!(near || compare)}
				bind:this={canvasEl}
				use:navigable={{ cam }}
				tabindex="0"
				role="application"
				aria-label="{t('nav.network')} — {t('view.hint')}"
				data-cursor="grab"
				onclick={onCanvasBgClick}
				oncontextmenu={(e) => e.preventDefault()}
			>
				<!-- Under the boxes: lanes, gutters, every tie at rest, and the hit twins. -->
				<svg class="layer under" viewBox="0 0 {cam.vw} {cam.vh}" role="presentation">
					<g transform={cam.transform}>
						<rect x="0" y="0" width={scene.width} height={worldH()} fill="transparent" class="bg" />
						{#each scene.lanes as layer, i (layer)}
							<rect
								x={scene.laneX[i] - 6}
								y="0"
								width={scene.laneW[i] + 12}
								height={worldH()}
								rx="10"
								class="lane-bg"
								style:--c={LAYER_COLOR[layer]}
							/>
						{/each}
						{#if dots}
							<!-- Posts: a spoke from each square to the people seated around it,
							     and a longer curve for a post held as well as a more senior one. -->
							<g class="spokes">
								{#each dots.spokes as sp (sp.key)}
									<path
										d={sp.d}
										class="spoke"
										class:secondary={sp.secondary}
										class:lit={!!near && (near.has(sp.person) || sp.inst === focus)}
										class:dim={!!(near || compare) && !(near && (near.has(sp.person) || sp.inst === focus))}
										stroke={LAYER_COLOR[sp.layer]}
										stroke-dasharray={sp.secondary ? '3 3' : DASH[sp.basis]}
									/>
								{/each}
							</g>
							<!-- A chamber's composition: its seat colours as a ring around its square. -->
							{#each dots.clusters as c (c.key)}
								{#if c.chamber}
									{@const total = c.chamber.seats || 1}
									{@const r = DOT.DONUT + DOT.DONUT_W / 2}
									{@const circ = 2 * Math.PI * r}
									<g class="donut" class:dim={dimmed(c.id)} transform="translate({c.cx},{c.cy}) rotate(-90)">
										<circle {r} class="donut-bg" stroke-width={DOT.DONUT_W} />
										{#each donutArcs(c.chamber, total) as arc (arc.key)}
											<circle
												{r}
												stroke={arc.color}
												stroke-width={DOT.DONUT_W}
												stroke-dasharray="{Math.max(0.6, arc.share * circ - 0.8)} {circ}"
												stroke-dashoffset={-arc.start * circ}
												fill="none"
											/>
										{/each}
									</g>
								{/if}
							{/each}
						{:else}
							{#each scene.gutters as gx, gi (gi)}
								<rect x={gx} y="0" width={GEO.GUT} height={scene.height} class="gutter-strip" />
							{/each}
						{/if}
						<g class="edges">
							{#each scene.ties as e (e.id)}
								{#if !topIds.has(e.id)}
									{@const r = tiePaths.get(e.id)}
									{#if r}
										<path
											d={r.d}
											class="edge"
											class:measurement={e.measurement}
											class:cross={e.crossLayer}
											class:bundle={!!e.bundle}
											class:dim={!!(near || compare)}
											stroke={edgeColor(e, false)}
											stroke-dasharray={edgeDash(e)}
											stroke-opacity={edgeOpacity(e)}
											stroke-width={edgeWidth(e)}
										/>
									{/if}
								{/if}
							{/each}
						</g>
						<!--
							Hit targets: a hairline is untouchable with a finger, so every tie
							gets a fat invisible twin. They sit under the boxes, so a tap on
							a seat always wins over a line passing behind it.
						-->
						<g class="hits">
							{#each scene.ties as e (e.id)}
								{@const r = tiePaths.get(e.id)}
								{#if r}
									<path
										d={r.d}
										class="hit"
										role="presentation"
										onmouseenter={(ev) => {
											hoverEdge = e.id;
											tipAt = pointerAt(ev);
										}}
										onmouseleave={() => (hoverEdge = null)}
										onpointerdown={() => startPress(() => (hoverEdge = e.id))}
										onpointerup={() => clearPress()}
										onpointerleave={() => clearPress()}
										onclick={() => {
											if (pressed) return;
											if (e.bundle) openTie(e);
											else pinnedId = pinnedId === e.id ? null : e.id;
										}}
									/>
								{/if}
							{/each}
						</g>
					</g>
				</svg>

				<!--
					The world: boxes, seats and chips, in one HTML layer that shares the
					camera's transform. Pointer events pass through the layer itself and
					land only on what it draws.
				-->
				<div
					class="world"
					class:rtl
					style:transform="translate({cam.x}px, {cam.y}px) scale({cam.k})"
					style:width="{scene.width}px"
					style:height="{worldH()}px"
					onpointerover={onWorldOver}
					onpointerout={onWorldOut}
					onpointerdown={(e) => {
						const el = (e.target as Element).closest?.('[data-id]') as HTMLElement | null;
						if (el?.dataset.id) startPress(() => (app.hovered = el.dataset.id!));
					}}
					onpointerup={clearPress}
					onpointercancel={clearPress}
					role="presentation"
				>
					{#if dots}
					{#each dots.heads as h (h.key)}
						<div
							class="ghead"
							class:outside={!h.group}
							style:transform="translate({h.x}px, {h.y}px)"
							style:width="{h.w}px"
							style:--c={LAYER_COLOR[h.layer]}
						>
							<span>{groupLabel(h.layer, h.group)}</span><i class="mono">{h.count}</i>
						</div>
					{/each}
					{#each dots.clusters as c (c.key)}
						<button
							class="node dsq"
							class:chamber={!!c.chamber}
							class:dim={dimmed(c.id)}
							class:focus={app.selected === c.id}
							class:hot={app.hovered === c.id}
							data-id={c.id}
							style:transform="translate({c.cx}px, {c.cy}px)"
							style:--c={LAYER_COLOR[c.layer]}
							aria-label={c.chamber ? chamberAria(c.id, c.layer, c.chamber) : `${entityName(c.id)} — ${layerLabel(c.layer)}`}
							onclick={(e) => selectOnMap(c.id, e)}
						></button>
						<button
							class="node dlabel"
							class:dim={dimmed(c.id)}
							class:hot={app.hovered === c.id}
							data-id={c.id}
							tabindex="-1"
							style:transform="translate({c.x}px, {c.cy + c.R + 4}px)"
							style:width="{c.w}px"
							onclick={(e) => selectOnMap(c.id, e)}
						>
							<span class="title">{entityName(c.id)}</span>
							<span class="count mono" title={c.chamber ? chamberNote(c.chamber) : undefined}>
								{#if c.chamber}
									{chamberShort(c.chamber)}
								{:else if c.posts > 1}
									{c.posts}
								{/if}
							</span>
						</button>
					{/each}
					{#each dots.rows as r (r.key)}
						{#if r.kind === 'outside'}
							<button
								class="node drow outside"
								class:dim={dimmed(r.person!)}
								class:focus={app.selected === r.person}
								class:hot={app.hovered === r.person}
								data-id={r.person}
								style:transform="translate({r.x}px, {r.y}px)"
								style:width="{r.w}px"
								style:--c={LAYER_COLOR[r.layer]}
								aria-label={entityName(r.person!)}
								onclick={(e) => selectOnMap(r.person!, e)}
							>
								<i class="ph"></i><span class="nm">{entityName(r.person!)}</span>
							</button>
						{:else}
							<button
								class="node drow k-{r.kind}"
								class:dim={dimmed(r.id)}
								class:focus={app.selected === r.id}
								class:hot={app.hovered === r.id}
								data-id={r.id}
								style:transform="translate({r.x}px, {r.y}px)"
								style:width="{r.w}px"
								style:--c={LAYER_COLOR[r.layer]}
								aria-label="{entityName(r.id!)} — {layerLabel(r.layer)}"
								onclick={(e) => selectOnMap(r.id!, e)}
							>
								<i class="sq" class:tied={(tiesOf.get(r.id!) ?? 0) > 0}></i>
								<span class="nm">{entityName(r.id!)}</span>
								{#if r.kind === 'register' && tiesOf.get(r.id!)}<b class="mono">{tiesOf.get(r.id!)}</b>{/if}
							</button>
						{/if}
					{/each}
					{#each dots.people as p (p.id)}
						{#if !p.outside}
							<button
								class="node dp b-{p.basis} side-{p.side}"
								class:named={tiesOf.has(p.id)}
								class:dim={dimmed(p.id)}
								class:lit={!!near?.has(p.id)}
								class:focus={app.selected === p.id}
								class:hot={app.hovered === p.id}
								data-id={p.id}
								style:transform="translate({p.x}px, {p.y}px)"
								style:--r="{p.r}px"
								style:--c={LAYER_COLOR[p.layer]}
								aria-label={entityName(p.id)}
								onclick={(e) => selectOnMap(p.id, e)}
							>
								<span class="nm">{entityName(p.id)}</span>
							</button>
						{/if}
					{/each}
					{:else}
					{#each scene.heads as h (h.key)}
						<div
							class="ghead"
							class:outside={!h.group}
							style:transform="translate({h.x}px, {h.y}px)"
							style:width="{scene.laneW[scene.lanes.indexOf(h.layer)]}px"
							style:--c={LAYER_COLOR[h.layer]}
						>
							<span>{groupLabel(h.layer, h.group)}</span><i class="mono">{h.count}</i>
						</div>
					{/each}

					{#each scene.units as u (u.key)}
						{#if u.kind === 'chip' || u.kind === 'register'}
							<button
								class="node chip k-{u.kind}"
								class:dim={dimmed(u.id)}
								class:focus={app.selected === u.id}
								class:hot={app.hovered === u.id}
								data-id={u.id}
								style:transform="translate({u.x}px, {u.y}px)"
								style:width="{u.w}px"
								style:height="{u.h}px"
								style:--c={LAYER_COLOR[u.layer]}
								aria-label="{entityName(u.id!)} — {layerLabel(u.layer)}"
								onclick={(e) => selectOnMap(u.id!, e)}
							>
								<i class="sq" class:tied={(tiesOf.get(u.id!) ?? 0) > 0}></i>
								<span class="nm">{entityName(u.id!)}</span>
								{#if u.kind === 'register' && tiesOf.get(u.id!)}<b class="mono">{tiesOf.get(u.id!)}</b>{/if}
							</button>
						{:else}
							<div
								class="box k-{u.kind}"
								class:dim={unitDimmed(u)}
								class:focus={!!u.id && app.selected === u.id}
								class:list={u.cols === 1 && u.kind === 'office'}
								style:transform="translate({u.x}px, {u.y}px)"
								style:width="{u.w}px"
								style:height="{u.h}px"
								style:--c={LAYER_COLOR[u.layer]}
							>
								{#if u.id}
									<button
										class="node boxhead"
										class:hot={app.hovered === u.id}
										data-id={u.id}
										aria-label={u.chamber ? chamberAria(u.id, u.layer, u.chamber) : `${entityName(u.id)} — ${layerLabel(u.layer)}`}
										onclick={(e) => selectOnMap(u.id!, e)}
									>
										<span class="title">{entityName(u.id)}</span>
										<span class="count mono" title={u.chamber ? chamberNote(u.chamber) : undefined}>
											{#if u.chamber}
												{chamberShort(u.chamber)}
											{:else if u.seats.length > 1}
												{u.seats.length}
											{/if}
										</span>
									</button>
								{/if}
								{#if u.chamber}
									<!-- The seat bar: the chamber's composition by group, largest first,
									     in the hemicycle's palette. Hollow where seats are not named. -->
									<div class="seatbar" title={chamberCaption(u).map((g) => `${g.name} ${g.n}`).join(' · ')}>
										<div class="bar">
											{#each u.chamber.groups as g (g.id || 'none')}
												<i style:flex-grow={g.n} style:background={g.color}></i>
											{/each}
											{#if u.chamber.seats > u.chamber.named && !u.chamber.split}
												<i class="unnamed" style:flex-grow={u.chamber.seats - u.chamber.named}></i>
											{/if}
										</div>
										<div class="bar-cap">
											{#each chamberCaption(u) as g (g.name)}
												<span><i style:background={g.color}></i>{g.name} <b class="mono">{g.n}</b></span>
											{/each}
										</div>
									</div>
								{/if}
								{#each u.seats as s (s.key)}
									{@const basis = (s.position?.basis ?? 'documented') as Basis}
									<button
										class="node seat b-{basis}"
										class:secondary={!s.primary}
										class:outside={!s.position && u.kind === 'actors'}
										class:dim={dimmed(s.person)}
										class:focus={app.selected === s.person}
										class:hot={app.hovered === s.person}
										data-id={s.person}
										style:transform="translate({s.x - u.x}px, {s.y - u.y}px)"
										style:width="{s.w}px"
										aria-label="{entityName(s.person)}{s.position ? ' — ' + postTitle(s.position) : ''}"
										onclick={(e) => selectOnMap(s.person, e)}
									>
										<i class="dot"></i>
										<span class="nm">{entityName(s.person)}</span>
										{#if s.position && u.cols === 1 && u.kind === 'office' && s.w - nameWidth(entityName(s.person)) >= 64}
											<span class="role">{postTitle(s.position)}</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					{/each}
					{/if}
				</div>

				<!-- Over the boxes: the ties the reader is looking at, never hidden by a box. -->
				<svg class="layer over" viewBox="0 0 {cam.vw} {cam.vh}" role="presentation" aria-hidden="true">
					<defs>
						<marker id="dt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse">
							<path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
						</marker>
					</defs>
					<g transform={cam.transform}>
						{#each topTies as e (e.id)}
							{@const r = tiePaths.get(e.id)}
							{#if r}
								<path d={r.d} class="halo-line" stroke-width={edgeWidth(e) + 3} />
								<path
									d={r.d}
									class="edge top"
									class:measurement={e.measurement}
									class:hot={hoverEdge === e.id}
									class:pinned={pinnedId === e.id}
									stroke={edgeColor(e, true)}
									stroke-dasharray={edgeDash(e)}
									stroke-opacity={Math.min(1, edgeOpacity(e) + 0.15)}
									stroke-width={edgeWidth(e) + (pinnedId === e.id || hoverEdge === e.id ? 0.8 : 0.3)}
									marker-end={lod > 0 && !e.measurement ? 'url(#dt-arrow)' : undefined}
								/>
							{/if}
						{/each}
					</g>
				</svg>

				<!-- Lane headers, pinned to the top of the canvas. -->
				<div class="vlayer" data-no-pan>
					{#each laneHeaders as h (h.layer)}
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
							{layerLabel(h.layer)}
							{#if h.count}<b>{h.count}</b>{/if}
						</button>
					{/each}
				</div>

				{#if hoverInfo && tipAt && !app.selected}
					<div class="node-tip" style:left="{Math.min(tipAt.x + 14, cam.vw - 240)}px" style:top="{Math.min(tipAt.y + 16, cam.vh - 70)}px" aria-hidden="true">
						<strong>{hoverInfo.name}</strong>
						{#if hoverInfo.line}<span class="tip-post">{hoverInfo.line}</span>{/if}
						{#if hoverInfo.ties}<span class="tip-ties mono">{tf('network.tip.ties', { n: hoverInfo.ties })}</span>{/if}
					</div>
				{/if}

				{#if hoveredTie && tipAt}
					<div class="edge-tip" style:left="{Math.min(tipAt.x + 14, cam.vw - 300)}px" style:top="{Math.min(tipAt.y + 16, cam.vh - 90)}px" aria-hidden="true">
						<span class="verb">{hoveredTie.bundle ? tf('network.bundle.label', { n: hoveredTie.bundle }) : relLabel(hoveredTie.rel.type)}</span>
						<strong>{entityName(hoveredTie.rel.from)} → {entityName(hoveredTie.rel.to)}</strong>
						<div class="tip-meta">
							{#if !hoveredTie.measurement}
								<Chip size="xs" dot tint="var(--basis-{hoveredTie.rel.basis ?? 'documented'})">
									{basisLabel((hoveredTie.rel.basis ?? 'documented') as Basis)}
								</Chip>
							{/if}
							{#if hoveredTie.crossLayer}
								<Chip variant="outline" size="xs" tint="var(--bridge)">{t('network.legend.crosses')}</Chip>
							{/if}
							<span class="tip-cta">{hoveredTie.bundle ? t('network.bundle.open') : t('network.clickopen')}</span>
						</div>
					</div>
				{/if}

				{#if compare}
					<div class="compare-banner" data-no-pan>
						<span class="cmp-title">
							{format(app.locale, 'network.compare.title', { a: entityName(compare.a), b: entityName(compare.b) })}
						</span>
						<span class="cmp-n">{format(app.locale, 'network.compare.common', { n: compare.common.size })}</span>
						<button class="cmp-exit mono" onclick={() => (compareId = null)}>{t('network.compare.exit')}</button>
					</div>
				{/if}

				{#if offMap}
					<div class="offmap" data-no-pan role="status">
						<span>{tf('network.offmap', { name: entityName(offMap), date: formatDate(app.t, 'day') })}</span>
						<button class="mono" onclick={() => (app.selected = null)}>{t('network.clear')}</button>
					</div>
				{/if}

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

				<details class="legend" data-no-pan open={legendOpen} ontoggle={onLegendToggle}>
					<summary aria-label={t('network.legend')}>
						<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"
							><path d="M2 4h10M2 7h10M2 10h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg
						>
						<span>{t('network.legend')}</span>
					</summary>

					<div class="lsec">{t('network.legend.reading')}</div>
					{#if dots}
						<div class="lgrid">
							<span class="lrow"><i class="lg-sq"></i>{t('network.legend.box')}</span>
							<span class="lrow"><i class="lg-dot"></i>{t('network.legend.dots.person')}</span>
							<span class="lrow"><i class="lg-dot hollow"></i>{t('network.legend.outside')}</span>
							<span class="lrow"><i class="lg-ring"></i>{t('network.legend.dots.ring')}</span>
							<span class="lrow">
								<svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--layer-political)" stroke-opacity="0.6" stroke-width="1" /></svg>
								{t('network.legend.dots.spoke')}
							</span>
							<span class="lrow">
								<svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--layer-political)" stroke-opacity="0.6" stroke-width="1" stroke-dasharray="3 3" /></svg>
								{t('network.legend.dots.spoke2')}
							</span>
						</div>
					{:else}
						<div class="lgrid">
							<span class="lrow"><i class="lg-box"></i>{t('network.legend.box')}</span>
							<span class="lrow"><i class="lg-dot"></i>{t('network.legend.seat')}</span>
							<span class="lrow"><i class="lg-dot hollow"></i>{t('network.legend.outside')}</span>
							<span class="lrow"><i class="lg-bar"></i>{t('network.legend.chamber')}</span>
							<span class="lrow"><i class="lg-chip"></i>{t('network.legend.chip')}</span>
						</div>
					{/if}

					<div class="lsec">{t('network.legend.basis')}</div>
					<div class="lgrid">
						{#each BASIS_ORDER as b (b)}
							<span class="lrow">
								<svg width="22" height="6" aria-hidden="true"
									><line x1="0" y1="3" x2="22" y2="3" stroke={BASIS_COLOR[b]} stroke-opacity={BASIS_OPACITY[b]} stroke-width="1.4" stroke-dasharray={DASH[b]} /></svg
								>
								{t('basis.' + b)}
							</span>
						{/each}
						<span class="lrow">
							<svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--bridge)" stroke-width="2" /></svg>
							{t('network.legend.crosses')}
						</span>
					</div>

					<div class="lsec">{t('network.legend.focused')}</div>
					<span class="lrow">
						<svg width="22" height="6" aria-hidden="true"
							><line x1="1" y1="3" x2="21" y2="3" stroke="var(--text-secondary)" stroke-width="1.4" marker-end="url(#dt-arrow)" /></svg
						>
						{t('network.legend.direction')}
					</span>
					<div class="lgrid types">
						{#each LEGEND_REL_TYPES as rt (rt)}
							<span class="lrow"><i class="rdot" style:--c={REL_TYPE_COLOR[rt]}></i>{relLabel(rt)}</span>
						{/each}
					</div>
				</details>

				{#if !compact.current}
					<div class="minimap" data-no-pan role="group" aria-label={t('network.minimap')}>
						<svg
							viewBox="0 0 {MINI_W} {miniH}"
							width={MINI_W}
							height={miniH}
							onpointerdown={(e) => {
								miniDragging = true;
								miniJump(e);
								(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
							}}
							onpointermove={(e) => miniDragging && miniJump(e)}
							onpointerup={() => (miniDragging = false)}
							onpointercancel={() => (miniDragging = false)}
							aria-hidden="true"
						>
							{#each miniRects as u (u.key)}
								<rect
									x={(u.x / scene.width) * MINI_W}
									y={(u.y / worldH()) * miniH}
									width={Math.max(0.6, (u.w / scene.width) * MINI_W)}
									height={Math.max(0.6, (u.h / worldH()) * miniH)}
									class="mm-unit"
									style:--c={LAYER_COLOR[u.layer]}
								/>
							{/each}
							<rect x={miniView.x} y={miniView.y} width={miniView.w} height={miniView.h} class="mm-view" />
						</svg>
					</div>
				{/if}
			</div>
		{/if}

		{#if cardEdge && cardAt}
			<div
				class="edgecard"
				class:sheet={compact.current}
				class:closing={pinnedClosing}
				style:left={compact.current ? undefined : `${cardAt.x}px`}
				style:top={compact.current ? undefined : `${cardAt.y}px`}
				use:sheetDrag={edgeDragParams}
				data-no-pan
			>
				<span class="sheet-handle" aria-hidden="true"><i class="sheet-grip"></i></span>
				<ConnectionCard edge={cardEdge} onclose={closePinned} onpick={pick} />
			</div>
		{/if}
	</div>

	<!--
		The text equivalent of the map. Every tie drawn above is a row, with the
		same names, relationship and basis, and a button that pins it on the map.
		Rendered only while open in the browser: it is the complete record of
		the view, and a closed table has no reason to cost the page its rows.
		The prerendered page always carries them, for readers without scripts.
	-->
	<details class="a11y" bind:open={tableOpen}>
		<summary>{t('network.table.summary')}</summary>
		{#if tableOpen || !browser}
			{#if focus && near}
				<h4 class="a11y-sub">{format(app.locale, 'network.table.focus', { name: entityName(focus) })}</h4>
				<table>
					<thead>
						<tr>
							<th>{t('network.table.other')}</th><th>{t('network.table.relationship')}</th><th>{t('network.table.basis')}</th><th>{t('network.table.crosses')}</th><th></th>
						</tr>
					</thead>
					<tbody>
						{#each scene.ties.filter((e) => e.rel.from === focus || e.rel.to === focus) as e (e.id)}
							<tr>
								<td>{entityName(e.rel.from === focus ? e.rel.to : e.rel.from)}</td>
								<td>{e.bundle ? tf('network.bundle.label', { n: e.bundle }) : relLabel(e.rel.type)}</td>
								<td>{e.measurement ? t('network.measurement') : basisLabel((e.rel.basis ?? 'documented') as Basis)}</td>
								<td>{e.crossLayer ? t('network.table.yes') : t('network.table.no')}</td>
								<td><button class="rowopen" onclick={() => openTie(e, true)}>{t('network.pick')}</button></td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			<table>
				<caption>
					{format(app.locale, 'network.table.caption', {
						date: formatDate(app.t, 'day'),
						mode: FAMILIES.filter((f) => families.has(f)).map((f) => t('network.family.' + f)).join(', ')
					})}
				</caption>
				<thead>
					<tr>
						<th>{t('network.table.from')}</th><th>{t('network.table.layer')}</th><th>{t('network.table.to')}</th><th>{t('network.table.layer')}</th><th>{t('network.table.relationship')}</th><th>{t('network.table.basis')}</th><th>{t('network.table.crosses')}</th><th></th>
					</tr>
				</thead>
				<tbody>
					{#each tableTies as e (e.id)}
						<tr>
							<td>{entityName(e.rel.from)}</td>
							<td>{layerLabel(e.a.layer)}</td>
							<td>{entityName(e.rel.to)}</td>
							<td>{layerLabel(e.b.layer)}</td>
							<td>{e.bundle ? tf('network.bundle.label', { n: e.bundle }) : relLabel(e.rel.type)}</td>
							<td>{e.measurement ? t('network.measurement') : basisLabel((e.rel.basis ?? 'documented') as Basis)}</td>
							<td>{e.crossLayer ? t('network.table.yes') : t('network.table.no')}</td>
							<td>
								<button
									class="rowopen"
									onclick={() => {
										if (view !== 'map') setView('map');
										openTie(e, true);
									}}>{t('network.pick')}</button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<table>
				<caption>{format(app.locale, 'network.table.seats', { date: formatDate(app.t, 'day') })}</caption>
				<thead>
					<tr><th>{t('network.table.layer')}</th><th>{t('network.table.institution')}</th><th>{t('network.table.person')}</th><th>{t('network.table.post')}</th></tr>
				</thead>
				<tbody>
					{#each scene.units.filter((u) => u.seats.length || u.chamber) as u (u.key)}
						{#if u.chamber}
							<tr>
								<td>{layerLabel(u.layer)}</td>
								<td>{entityName(u.id!)}</td>
								<td colspan="2">
									{tf('network.chamber.named', { n: u.chamber.named, seats: u.chamber.seats })}:
									{u.chamber.groups.map((g) => `${g.id ? entityName(g.id) : t('parl.unaffiliated')} ${g.n}`).join(', ')}{#if chamberNote(u.chamber)}{'. '}{chamberNote(u.chamber)}{/if}
								</td>
							</tr>
						{/if}
						{#each u.seats as s (s.key)}
							<tr>
								<td>{layerLabel(u.layer)}</td>
								<td>{u.id ? entityName(u.id) : t('network.outside')}</td>
								<td>{entityName(s.person)}</td>
								<td>{s.position ? postTitle(s.position) : u.kind === 'chamber' ? t('network.tip.membershort') : '—'}</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		{/if}
	</details>
</div>

<style>
	.network {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	/* --- Toolbar ------------------------------------------------------------ */

	.toolbar {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'about controls'
			'fams fams';
		align-items: center;
		gap: var(--s-3) var(--s-6);
		padding: var(--s-4) var(--s-6) var(--s-3);
		border-bottom: var(--rule);
	}
	.tb-row {
		display: flex;
		align-items: center;
		gap: var(--s-5);
		min-width: 0;
	}
	.tb-row:first-child {
		grid-area: about;
	}
	.controls {
		grid-area: controls;
		justify-content: flex-end;
	}
	.stats {
		display: flex;
		gap: var(--s-5);
		font-size: var(--t-xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
	}
	.stats .bridge {
		color: var(--bridge);
	}
	.stats .withheld {
		color: var(--text-faint);
		cursor: help;
		border-bottom: 1px dotted var(--border-strong);
	}
	.families {
		grid-area: fams;
		display: flex;
		align-items: center;
		gap: var(--s-2);
		overflow-x: auto;
		scrollbar-width: none;
		min-width: 0;
	}
	.families::-webkit-scrollbar {
		display: none;
	}
	.fam-label {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-inline-end: var(--s-3);
		white-space: nowrap;
	}
	.fam {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		height: 28px;
		padding: 0 var(--s-4);
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--t-xs);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.fam b {
		font-weight: 500;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	.fam-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1.5px solid currentColor;
	}
	.fam:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.fam.on {
		background: var(--surface-active);
		color: var(--text-primary);
		border-color: var(--accent);
	}
	.fam.on .fam-dot {
		background: var(--accent);
		border-color: var(--accent);
	}
	.fam.on b {
		color: var(--text-secondary);
	}
	.fam:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}

	@media (max-width: 900px) {
		.toolbar {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'about' 'controls' 'fams';
			padding: var(--s-3) var(--s-5);
			gap: var(--s-3);
		}
		.eyebrow {
			display: none;
		}
		.controls {
			justify-content: space-between;
		}
		.stats {
			gap: var(--s-4);
		}
		/* The phone keeps the two counts that describe the lines; the office
		   count and what is held back are on the family buttons and the table. */
		.stats > :first-child,
		.stats .withheld {
			display: none;
		}
		.fam-label {
			display: none;
		}
		.fam {
			height: 32px;
		}
	}

	/* --- Stage and canvas ----------------------------------------------------- */

	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.canvas {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--surface-base);
		touch-action: none;
		outline: none;
		cursor: grab;
	}
	.canvas.moving {
		cursor: grabbing;
	}
	.canvas:focus-visible {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	.layer.over {
		pointer-events: none;
		z-index: 2;
	}
	.lane-bg {
		fill: var(--c);
		fill-opacity: 0.035;
	}
	.gutter-strip {
		fill: var(--surface-sunken);
		fill-opacity: 0.35;
	}
	.edge {
		fill: none;
		vector-effect: non-scaling-stroke;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.edge.dim {
		opacity: 0.12;
	}
	.edge.top {
		filter: none;
	}
	.halo-line {
		fill: none;
		stroke: var(--surface-base);
		stroke-opacity: 0.85;
		vector-effect: non-scaling-stroke;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.hit {
		fill: none;
		stroke: transparent;
		stroke-width: 12px;
		vector-effect: non-scaling-stroke;
		pointer-events: stroke;
		cursor: pointer;
	}

	/* --- The world layer (world units: 1px here is one unit) ------------------ */

	.world {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		pointer-events: none;
		direction: ltr;
		z-index: 1;
		font-family: var(--font-sans);
		contain: layout style;
	}
	.canvas.moving .world {
		will-change: transform;
	}
	/* The layer's coordinates are physical (the scene mirrors the lanes for a
	   right-to-left reader); the text inside each box still reads in the
	   page's direction. */
	.world.rtl .box,
	.world.rtl .chip,
	.world.rtl .ghead {
		direction: rtl;
	}
	.world.rtl .box {
		box-shadow: inset -3px 0 0 var(--c);
	}
	.world > * {
		position: absolute;
		top: 0;
		left: 0;
	}
	.ghead {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 20px;
		padding-inline: 2px;
		font-size: 10.5px;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-subtle);
		transition: transform var(--dur-normal) var(--ease-out);
	}
	.ghead span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ghead i {
		font-style: normal;
		color: var(--text-faint);
		margin-inline-start: auto;
	}
	.ghead.outside {
		border-bottom-style: dashed;
	}
	.box {
		pointer-events: auto;
		background: var(--surface-raised);
		border: 1px solid var(--border-default);
		border-radius: 7px;
		box-shadow: inset 3px 0 0 var(--c);
		/* Moves and fades only: transform and opacity stay on the compositor.
		   A height transition would re-lay out the box every frame of playback.
		   Containment keeps a change inside one box from re-laying out the map. */
		contain: layout style;
		transition:
			transform var(--dur-normal) var(--ease-out),
			opacity var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
		animation: unit-in var(--dur-normal) var(--ease-out);
	}
	.box.k-actors {
		background: transparent;
		border-style: dashed;
		box-shadow: none;
	}
	.box.k-chamber {
		background: color-mix(in oklch, var(--surface-raised) 88%, var(--c));
	}
	.box.focus {
		border-color: var(--accent);
		box-shadow:
			inset 3px 0 0 var(--c),
			0 0 0 1px var(--accent);
	}
	.box.dim,
	.chip.dim {
		opacity: var(--dim);
	}
	@keyframes unit-in {
		from {
			opacity: 0;
		}
	}
	.box > * {
		position: absolute;
	}
	.node {
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		text-align: start;
		pointer-events: auto;
	}
	.node:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-radius: 3px;
	}
	.boxhead {
		top: 0;
		left: 0;
		right: 0;
		height: 30px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px 0 12px;
		border-radius: 7px 7px 0 0;
	}
	.boxhead:hover,
	.boxhead.hot {
		background: var(--surface-hover);
	}
	.boxhead .title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
	.boxhead .count {
		font-size: 10.5px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.seat {
		top: 0;
		left: 0;
		height: 22px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 4px;
		border-radius: 4px;
		transition:
			transform var(--dur-normal) var(--ease-out),
			opacity var(--dur-fast) var(--ease-out);
		animation: unit-in var(--dur-normal) var(--ease-out);
	}
	.seat:hover,
	.seat.hot {
		background: var(--surface-hover);
	}
	.seat.focus {
		background: var(--surface-active);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.seat.dim {
		opacity: var(--dim);
	}
	.seat .dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c);
		border: 1.5px solid var(--c);
	}
	/* What a post rests on: a documented post is a solid seat; a reported one a
	   dashed ring at the reported weight; weaker bases dotted and fainter. */
	.seat.b-reported .dot {
		background: transparent;
		border-style: dashed;
		opacity: 0.82;
	}
	.seat.b-inferred .dot {
		background: transparent;
		border-style: dotted;
		opacity: 0.6;
	}
	.seat.b-unsubstantiated .dot {
		background: transparent;
		border-style: dotted;
		opacity: 0.45;
	}
	.seat.outside .dot {
		background: transparent;
		border-color: var(--text-muted);
	}
	.seat.secondary .dot {
		background: transparent;
	}
	.seat.secondary .nm {
		color: var(--text-muted);
	}
	/* The name comes first: the post beside it takes what is left, and is only
	   set at all when the row has room for both. */
	.seat .nm {
		font-size: 11.5px;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 0 1 auto;
	}
	.seat .role {
		font-size: 10px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1 1 0;
		min-width: 0;
		text-align: end;
	}
	.seatbar {
		top: 30px;
		left: 12px;
		right: 10px;
		height: 32px;
	}
	.bar {
		display: flex;
		gap: 1.5px;
		height: 10px;
		border-radius: 3px;
		overflow: hidden;
	}
	.bar i {
		display: block;
		min-width: 1px;
	}
	.bar i.unnamed {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}
	.bar-cap {
		display: flex;
		gap: 10px;
		margin-top: 6px;
		font-size: 10px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
	}
	.bar-cap span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bar-cap i {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		flex: none;
	}
	.bar-cap b {
		font-weight: 500;
		color: var(--text-muted);
	}
	.chip {
		contain: layout style;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
		border-radius: 6px;
		border: 1px solid var(--border-subtle);
		background: color-mix(in oklch, var(--surface-base) 70%, var(--surface-raised));
		transition:
			transform var(--dur-normal) var(--ease-out),
			opacity var(--dur-fast) var(--ease-out);
		animation: unit-in var(--dur-normal) var(--ease-out);
	}
	.chip.k-register {
		border-color: transparent;
		background: transparent;
	}
	.chip:hover,
	.chip.hot {
		background: var(--surface-hover);
		border-color: var(--border-default);
	}
	.chip.focus {
		border-color: var(--accent);
	}
	.chip .sq {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		border: 1.5px solid var(--c);
	}
	.chip .sq.tied {
		background: var(--c);
	}
	.chip .nm {
		font-size: 11.5px;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
	.chip b {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
	}

	/* --- Dots --------------------------------------------------------------------- */

	.spoke {
		fill: none;
		stroke-width: 0.9px;
		stroke-opacity: 0.4;
		vector-effect: non-scaling-stroke;
		transition: stroke-opacity var(--dur-fast) var(--ease-out);
	}
	.spoke.secondary {
		stroke-opacity: 0.32;
	}
	.spoke.dim {
		stroke-opacity: 0.06;
	}
	.spoke.lit {
		stroke-opacity: 0.9;
		stroke-width: 1.4px;
	}
	.donut-bg {
		fill: none;
		stroke: var(--border-subtle);
	}
	.donut.dim {
		opacity: var(--dim);
	}
	.dsq {
		translate: -50% -50%;
		width: 12px;
		height: 12px;
		border-radius: 3px;
		background: var(--c);
		box-shadow: 0 0 0 2px var(--surface-base);
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.dsq.chamber {
		width: 13px;
		height: 13px;
		background: var(--surface-raised);
		border: 2px solid var(--c);
		box-shadow: none;
	}
	.dsq.hot,
	.dsq.focus {
		box-shadow:
			0 0 0 2px var(--surface-base),
			0 0 0 3.5px var(--accent);
	}
	.dlabel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 0 4px;
		text-align: center;
		border-radius: 4px;
	}
	/* Lines pass under labels in this view, so text wears a halo of the canvas. */
	.dlabel .title,
	.dlabel .count,
	.drow .nm,
	.drow b {
		text-shadow:
			0 0 3px var(--surface-base),
			0 0 2px var(--surface-base),
			0 0 1px var(--surface-base);
	}
	.dlabel .title {
		font-size: 10.5px;
		font-weight: 600;
		line-height: 1.2;
		color: var(--text-primary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.dlabel .count {
		font-size: 9.5px;
		color: var(--text-muted);
	}
	.dlabel.hot {
		background: var(--surface-hover);
	}
	.dp {
		translate: -50% -50%;
		width: calc(var(--r) * 2);
		height: calc(var(--r) * 2);
		border-radius: 50%;
		background: var(--c);
		border: 1.5px solid var(--c);
		box-shadow: 0 0 0 1.5px var(--surface-base);
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.dp.b-reported {
		background: var(--surface-base);
		border-style: dashed;
	}
	.dp.b-inferred,
	.dp.b-unsubstantiated {
		background: var(--surface-base);
		border-style: dotted;
		opacity: 0.7;
	}
	.dp.hot,
	.dp.focus {
		z-index: 2;
		box-shadow:
			0 0 0 1.5px var(--surface-base),
			0 0 0 3px var(--accent);
	}
	.dp.lit {
		z-index: 1;
	}
	.dp .nm {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
		white-space: nowrap;
		font-size: 10.5px;
		line-height: 1;
		color: var(--text-primary);
		pointer-events: none;
		visibility: hidden;
		text-shadow:
			0 0 3px var(--surface-base),
			0 0 2px var(--surface-base),
			0 0 1px var(--surface-base);
	}
	.dp.side-r .nm {
		left: calc(100% + 5px);
	}
	.dp.side-l .nm {
		right: calc(100% + 5px);
	}
	/* A dot is named when the reader is close enough and a tie names the
	   person, or whenever it is hovered, chosen, or tied to what is. */
	.lod-2 .dp.named .nm,
	.dp.hot .nm,
	.dp.focus .nm,
	.focusing .dp.lit .nm {
		visibility: visible;
	}
	.focusing .dp.lit .nm {
		font-weight: 600;
	}
	.drow {
		height: 20px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 4px;
		border-radius: 4px;
	}
	.drow:hover,
	.drow.hot {
		background: var(--surface-hover);
	}
	.drow.focus {
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.drow .sq {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		border: 1.5px solid var(--c);
	}
	.drow .sq.tied {
		background: var(--c);
	}
	.drow .ph {
		flex: none;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 1.5px solid var(--text-muted);
	}
	.drow .nm {
		font-size: 11px;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
	.drow.outside .nm {
		color: var(--text-primary);
	}
	.drow b {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
	}
	.world.rtl .drow,
	.world.rtl .dlabel {
		direction: rtl;
	}
	.dsq.dim,
	.dlabel.dim,
	.dp.dim,
	.drow.dim {
		opacity: var(--dim);
	}
	.lod-0 .dlabel,
	.lod-0 .drow .nm,
	.lod-0 .drow b {
		visibility: hidden;
	}
	.lod-1 .dlabel .count {
		visibility: hidden;
	}

	/* Levels of detail: text too small to read is hidden, never squeezed. */
	.lod-0 .seat .nm,
	.lod-0 .chip .nm,
	.lod-0 .chip b,
	.lod-0 .bar-cap,
	.lod-0 .ghead {
		visibility: hidden;
	}
	.lod-0 .seat,
	.lod-1 .seat {
		padding-inline: 2px;
	}
	.lod-0 .seat .role,
	.lod-1 .seat .role {
		display: none;
	}

	/* --- Screen-space chrome over the canvas ------------------------------------ */

	.vlayer {
		position: absolute;
		inset: 0 0 auto 0;
		height: 48px;
		overflow: visible;
		pointer-events: none;
		z-index: 3;
		direction: ltr;
	}
	.vlayer .vlane {
		pointer-events: auto;
	}
	.vlane {
		position: absolute;
		top: var(--s-4);
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		height: 24px;
		padding: 0 var(--s-4);
		border-radius: var(--r-full);
		border: 1px solid color-mix(in oklch, var(--c) 45%, transparent);
		background: color-mix(in oklch, var(--surface-base) 88%, var(--c));
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
		box-shadow: 0 1px 6px oklch(0% 0 0 / 0.25);
	}
	.vlane::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 2px;
		background: var(--c);
		flex: none;
	}
	.vlane b {
		font-weight: 500;
		color: var(--text-muted);
	}
	.node-tip,
	.edge-tip {
		position: absolute;
		z-index: 6;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 300px;
		padding: var(--s-4) var(--s-5);
		border-radius: var(--r-md);
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		box-shadow: var(--shadow-md, 0 6px 20px oklch(0% 0 0 / 0.35));
		font-size: var(--t-sm);
		color: var(--text-primary);
	}
	.tip-post {
		color: var(--text-secondary);
		font-size: var(--t-xs);
	}
	.tip-ties {
		color: var(--text-muted);
		font-size: var(--t-2xs);
	}
	.edge-tip .verb {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-muted);
	}
	.tip-meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-top: var(--s-2);
		flex-wrap: wrap;
	}
	.tip-cta {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.compare-banner,
	.offmap {
		position: absolute;
		top: 44px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		display: flex;
		align-items: center;
		gap: var(--s-5);
		max-width: calc(100% - 32px);
		padding: var(--s-3) var(--s-3) var(--s-3) var(--s-6);
		border-radius: var(--r-full);
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		font-size: var(--t-sm);
		color: var(--text-primary);
		box-shadow: var(--shadow-md, 0 6px 20px oklch(0% 0 0 / 0.35));
	}
	.cmp-n {
		color: var(--text-muted);
		font-size: var(--t-xs);
	}
	.cmp-exit,
	.offmap button {
		border: 1px solid var(--border-default);
		background: none;
		color: var(--text-secondary);
		border-radius: var(--r-full);
		padding: var(--s-2) var(--s-5);
		font-size: var(--t-2xs);
		cursor: pointer;
		white-space: nowrap;
	}
	.cmp-exit:hover,
	.offmap button:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.viewnav {
		position: absolute;
		top: 44px;
		inset-inline-end: var(--s-5);
		z-index: 4;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--s-4);
	}
	.clear-focus {
		border: 1px solid var(--border-default);
		background: var(--surface-overlay);
		color: var(--text-secondary);
		border-radius: var(--r-full);
		padding: var(--s-3) var(--s-5);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		cursor: pointer;
	}
	.clear-focus:hover {
		color: var(--text-primary);
	}

	.legend {
		position: absolute;
		inset-inline-start: var(--s-5);
		bottom: var(--s-5);
		z-index: 4;
		max-width: 230px;
		max-height: calc(100% - 140px);
		overflow: auto;
		padding: var(--s-3) var(--s-5);
		border-radius: var(--r-md);
		background: color-mix(in oklch, var(--surface-overlay) 94%, transparent);
		border: 1px solid var(--border-default);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		backdrop-filter: blur(6px);
	}
	.phone .legend {
		bottom: var(--s-5);
	}
	.legend summary {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		cursor: pointer;
		list-style: none;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-muted);
		min-height: 28px;
	}
	.legend summary::-webkit-details-marker {
		display: none;
	}
	.lsec {
		margin: var(--s-4) 0 var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.lgrid {
		display: grid;
		gap: var(--s-2);
	}
	.lrow {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		line-height: 1.3;
	}
	.lrow svg {
		flex: none;
	}
	.lg-box {
		flex: none;
		width: 18px;
		height: 12px;
		border-radius: 3px;
		border: 1px solid var(--border-strong);
		box-shadow: inset 2px 0 0 var(--layer-political);
		background: var(--surface-raised);
	}
	.lg-dot {
		flex: none;
		width: 8px;
		height: 8px;
		margin-inline: 5px;
		border-radius: 50%;
		background: var(--layer-political);
		border: 1.5px solid var(--layer-political);
	}
	.lg-dot.hollow {
		background: transparent;
		border-color: var(--text-muted);
	}
	.lg-bar {
		flex: none;
		width: 18px;
		height: 6px;
		border-radius: 2px;
		background: linear-gradient(90deg, var(--seat-1) 0 55%, var(--seat-2) 55% 80%, var(--seat-3) 80%);
	}
	.lg-sq {
		flex: none;
		width: 9px;
		height: 9px;
		margin-inline: 4.5px;
		border-radius: 2px;
		background: var(--layer-political);
	}
	.lg-ring {
		flex: none;
		width: 14px;
		height: 14px;
		margin-inline: 2px;
		border-radius: 50%;
		background: conic-gradient(var(--seat-1) 0 55%, var(--seat-2) 55% 80%, var(--seat-3) 80%);
		mask: radial-gradient(circle, transparent 3.5px, #000 4px);
	}
	.lg-chip {
		flex: none;
		width: 8px;
		height: 8px;
		margin-inline: 5px;
		border-radius: 2px;
		border: 1.5px solid var(--layer-economic);
	}
	.rdot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c);
		flex: none;
	}
	.lgrid.types {
		grid-template-columns: 1fr 1fr;
		margin-top: var(--s-2);
	}
	.minimap {
		position: absolute;
		inset-inline-end: var(--s-5);
		bottom: var(--s-5);
		z-index: 4;
		padding: 3px;
		border-radius: var(--r-sm);
		background: color-mix(in oklch, var(--surface-overlay) 92%, transparent);
		border: 1px solid var(--border-default);
		line-height: 0;
		direction: ltr;
	}
	.minimap svg {
		cursor: crosshair;
		touch-action: none;
	}
	.mm-unit {
		fill: var(--c);
		fill-opacity: 0.45;
	}
	.mm-view {
		fill: var(--accent);
		fill-opacity: 0.08;
		stroke: var(--accent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	/* --- The connection card ----------------------------------------------------- */

	.edgecard {
		position: absolute;
		z-index: 7;
		width: 320px;
		max-width: calc(100% - 16px);
	}
	.sheet-handle {
		display: none;
	}
	.edgecard.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(var(--dock-h, 44px) + var(--safe-bottom, 0px));
		width: auto;
		max-width: none;
		max-height: 70vh;
		overflow: auto;
		border-radius: var(--r-xl) var(--r-xl) 0 0;
		background: var(--surface-panel);
		border-top: 1px solid var(--border-default);
		box-shadow: 0 -10px 30px oklch(0% 0 0 / 0.35);
		animation: sheet-in var(--dur-normal) var(--ease-out);
	}
	.edgecard.sheet.closing {
		transform: translateY(100%);
		transition: transform var(--dur-normal) var(--ease-in-out);
	}
	.edgecard.sheet .sheet-handle {
		display: flex;
		justify-content: center;
		padding: var(--s-3) 0 0;
	}
	.sheet-grip {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--border-strong);
	}
	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
	}

	/* --- The table view ------------------------------------------------------------ */

	.a11y {
		border-top: var(--rule);
		padding: var(--s-3) var(--s-6);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		max-height: 40vh;
		overflow: auto;
	}
	.a11y summary {
		cursor: pointer;
		color: var(--text-muted);
		font-size: var(--t-xs);
		min-height: 28px;
		display: flex;
		align-items: center;
	}
	.a11y table {
		width: 100%;
		border-collapse: collapse;
		margin: var(--s-4) 0;
		font-size: var(--t-xs);
	}
	.a11y caption {
		text-align: start;
		color: var(--text-muted);
		padding-bottom: var(--s-3);
	}
	.a11y th,
	.a11y td {
		text-align: start;
		padding: var(--s-2) var(--s-4) var(--s-2) 0;
		border-bottom: var(--rule);
	}
	.a11y th {
		color: var(--text-muted);
		font-weight: 500;
	}
	.a11y-sub {
		margin: var(--s-5) 0 0;
		font-size: var(--t-sm);
		color: var(--text-primary);
	}
	.rowopen {
		background: none;
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		color: var(--text-secondary);
		padding: var(--s-1) var(--s-4);
		font-size: var(--t-2xs);
		cursor: pointer;
		white-space: nowrap;
	}
	.rowopen:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.phone .stage {
		min-height: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.box,
		.seat,
		.chip,
		.ghead {
			transition: none;
			animation: none;
		}
	}
</style>
