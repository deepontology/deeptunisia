/**
 * The Network scene: who sits where at one instant, and which ties connect them.
 *
 * CONTAINMENT, NOT A HAIRBALL
 *
 * The map used to draw every person as a free node and every post as a line to
 * its institution. That was readable at a few hundred records and collapsed
 * when the record grew to full parliament rosters and every governor: on
 * 14 January 2011 the default lens drew 349 lines, and 317 of them only said
 * "held office in", 214 of those into one chamber.
 *
 * Here an institution is a box and a person in post is a seat inside it. Being
 * inside the box is what "held office in" means, so that fact costs no ink at
 * all, and the lines that remain are the claims the map exists to show: who
 * appointed, owns, prosecutes or is related to whom.
 *
 * Three further rules keep the map honest at any size:
 *
 * - A chamber is one box. Its members are counted by group on a seat bar (the
 *   same composition the World view's hemicycle draws, from civic.ts). Only a
 *   member who is party to a drawn tie gets a seat of their own, because only
 *   then does the map need somewhere to attach the line.
 * - A person outside office who is party to a drawn tie sits in their lane's
 *   "outside office" section. Nobody else outside office is drawn: they are in
 *   the table and the search, and a map of absences is not a map.
 * - Party ties from a chamber's rank and file are bundled into one line from
 *   the chamber to the party, carrying a count. Individual party ties are
 *   drawn only for people the map already shows.
 *
 * DETERMINISM
 *
 * Everything below is a pure function of (date, evidence floor, layers, tie
 * families, direction). There is no force simulation and no randomness, so a
 * link always opens on the same picture and scrubbing the date changes only
 * what changed in the record. Institutions keep their authored order inside
 * their group, so a box that appears or leaves moves its neighbours, never
 * reshuffles them.
 *
 * This module has no Svelte runes in it and resolves no display names, so the
 * test scripts can run it directly.
 */

import {
	ds,
	institutionById,
	personById,
	possiblyActive,
	meetsBasis,
	LAYERS,
	type Basis,
	type Institution,
	type Layer,
	type Position,
	type Relationship
} from '../model';
import { terms, termAt, seatedAt, seatGroups, type SeatGroup, type Term } from '../civic';
import { familyOf, type Family } from './families';

// --- Geometry (world units) ---------------------------------------------------

/**
 * World-unit sizes. Text is set in world units too, so a row is always tall
 * enough for its name at any zoom: the camera scales both together, and the
 * view hides text that would draw too small to read instead of letting it
 * collide. That replaces a per-frame collision solver with a layout guarantee.
 */
export const GEO = {
	/** Base lane width; each layer scales it by its weight. */
	LANE: 240,
	/** Width of a gutter: the channel between lanes (and the margins outside the first and last). */
	GUT: 44,
	/** Space at the top of every lane, under the pinned lane header. */
	TOP: 56,
	BOTTOM: 48,
	/** A box's title strip. */
	HEAD: 30,
	/** One seat. */
	ROW: 22,
	PAD: 8,
	BOX_GAP: 10,
	/** A group's caption above its boxes. */
	GROUP: 24,
	GROUP_GAP: 18,
	/** A box with no seat: an institution drawn because a tie needs it. */
	CHIP: 26,
	CHIP_GAP: 6,
	/** The register row in the foreign lane. */
	REG: 22,
	/** A chamber's seat bar block: the bar and its caption. */
	BAR: 38,
	/** Up to this many seats a box is a one-column list that also names each post. */
	LIST: 6,
	/** The narrowest a seat column may get before a box stops adding columns. */
	COL_MIN: 110
} as const;

/**
 * Lane widths, as weights on GEO.LANE.
 *
 * Fixed per layer rather than fitted to each date, so a lane never changes
 * width while the reader scrubs. The weights follow how much of the record
 * each layer holds across the whole period: the political and economic lanes
 * carry the cabinet, the chambers and the business families and get room for
 * three seat columns; the judicial and civil lanes rarely hold more than a
 * handful of people.
 */
export const LANE_WEIGHT: Record<Layer, number> = {
	security: 1.2,
	political: 1.5,
	economic: 1.5,
	media: 1,
	judicial: 0.85,
	civil: 0.85,
	foreign: 0.95
};

export function laneWidth(layer: Layer): number {
	return Math.round(GEO.LANE * LANE_WEIGHT[layer]);
}

/** Seat columns for `n` seats in a lane of width `w`. */
function seatCols(n: number, w: number): number {
	if (n <= GEO.LIST) return 1;
	const max = Math.max(1, Math.floor((w - GEO.PAD * 2) / GEO.COL_MIN));
	return Math.max(1, Math.min(max, Math.ceil(n / GEO.LIST)));
}

/** Lane rectangles and gutter edges for an ordered set of lanes. */
export function laneFrames(lanes: Layer[]): { x: number[]; w: number[]; gutters: number[]; width: number } {
	const x: number[] = [];
	const w: number[] = [];
	const gutters: number[] = [];
	let cursor = 0;
	for (const l of lanes) {
		gutters.push(cursor);
		cursor += GEO.GUT;
		x.push(cursor);
		w.push(laneWidth(l));
		cursor += laneWidth(l);
	}
	gutters.push(cursor);
	cursor += GEO.GUT;
	return { x, w, gutters, width: cursor };
}

// --- Scene types ----------------------------------------------------------------

export interface Anchor {
	/** The entity the line belongs to. */
	id: string;
	/** The lane the entity is drawn in, which is not always its home layer. */
	layer: Layer;
	/** Spatial lane index (mirrored in right-to-left reading). */
	lane: number;
	/** Left and right borders of the thing the line meets. */
	xl: number;
	xr: number;
	y: number;
}

export interface Seat {
	key: string;
	person: string;
	/** The post that seats them; null for someone drawn outside office. */
	position: Position | null;
	/**
	 * A person holding several posts sits in each box, but lines attach to one
	 * seat only: the most senior post. The others are drawn as secondary seats.
	 */
	primary: boolean;
	x: number;
	y: number;
	w: number;
}

export type UnitKind = 'office' | 'chamber' | 'chip' | 'actors' | 'register';

export interface ChamberInfo {
	term: Term;
	seats: number;
	named: number;
	groups: SeatGroup[];
	byList: boolean;
	split: boolean;
	withheld: number;
	uncertain: number;
}

export interface Unit {
	key: string;
	kind: UnitKind;
	/** The institution, or null for a lane's outside-office section. */
	id: string | null;
	layer: Layer;
	group: string;
	x: number;
	y: number;
	w: number;
	h: number;
	seats: Seat[];
	cols: number;
	chamber?: ChamberInfo;
}

export interface GroupHead {
	key: string;
	layer: Layer;
	/** The group id (its English header), or '' for the outside-office section. */
	group: string;
	x: number;
	y: number;
	count: number;
}

/** The shape every tie carries, authored or synthesised. ConnectionCard reads it. */
export interface TieRel {
	id: string;
	from: string;
	to: string;
	type: string;
	subtype?: string;
	basis?: string;
	description?: string;
	confidence?: string;
	attributed_to?: string;
	sources?: string[];
	interval?: Relationship['interval'];
}

export interface Tie {
	id: string;
	rel: TieRel;
	family: Family;
	a: Anchor;
	b: Anchor;
	crossLayer: boolean;
	/** A trade or debt measurement: no basis, never an authored claim. */
	measurement: boolean;
	flowValue?: number;
	/** Party ties bundled from a chamber's rank and file: how many. */
	bundle?: number;
	/** How many drawn ties share this directed pair (1–3, capped). */
	multi: number;
}

/** A measured flow from the Tunisian State to a counterparty, built by the caller. */
export interface FlowTie {
	id: string;
	to: string;
	type: 'trade-flow' | 'debt-flow';
	subtype: string;
	description: string;
	value: number;
}

export interface SceneInput {
	t: number;
	floor: Basis;
	layers: ReadonlySet<Layer>;
	families: ReadonlySet<Family>;
	flows?: FlowTie[];
	rtl?: boolean;
}

export interface Scene {
	lanes: Layer[];
	/** Left edge and width of each drawn lane, in drawn order. */
	laneX: number[];
	laneW: number[];
	/** Left edge of each gutter: gutter k sits left of lane k, the last one is the right margin. */
	gutters: number[];
	width: number;
	height: number;
	units: Unit[];
	heads: GroupHead[];
	ties: Tie[];
	/** Every drawn entity's anchor: seats (primary), boxes, chips, register rows. */
	anchors: Map<string, Anchor>;
	/** Unit that draws an entity (for flying to it). */
	unitOf: Map<string, Unit>;
	stats: {
		/** Distinct people holding any post at the instant, chambers included. */
		inOffice: number;
		/** People per drawn lane, seats and outside-office actors. */
		perLane: Map<Layer, number>;
		/** Authored relationships drawn (a bundle counts each tie it carries). */
		ties: number;
		crossLayer: number;
		/** Ties above the floor and in play, held back because their family is off. */
		notShown: Map<Family, number>;
	};
}

// --- Static indexes (built once) ---------------------------------------------

/** Legislative terms, whose members are counted on a chamber box rather than seated one by one. */
const termInstitutions = new Set(terms.map((x) => x.institution.id));
const rosterRoles = new Set(ds.roles.filter((r) => r.seats).map((r) => r.id));
const isParliamentaryGroup = (id: string) => institutionById.get(id)?.type === 'parliamentary-group';

/**
 * When each entity came into play: the earliest dated anchor across every
 * record kind that involves it. Undated records are skipped, so a relationship
 * with no date never pulls an entity back to 1956. An entity with no dated
 * anchor at all is structural and always in play.
 */
const appearDates = (() => {
	const map = new Map<string, number>();
	const note = (id: string | undefined, t: number) => {
		if (!id || Number.isNaN(t)) return;
		const cur = map.get(id);
		if (cur === undefined || t < cur) map.set(id, t);
	};
	for (const p of ds.positions) {
		if (p.interval.raw.start === null) continue;
		note(p.holder, p.interval.startEarliest);
		note(p.institution, p.interval.startEarliest);
	}
	for (const r of ds.relationships) {
		if (r.interval.raw.start === null) continue;
		note(r.from, r.interval.startEarliest);
		note(r.to, r.interval.startEarliest);
	}
	for (const ev of ds.events) {
		const t = Date.parse(ev.date);
		for (const a of ev.actors) note(a, t);
	}
	for (const c of ds.companies) if (c.founded) note(c.id, Date.parse(c.founded));
	for (const c of ds.contracts) {
		const t = c.interval?.startEarliest ?? (c.start ? Date.parse(c.start) : NaN);
		if (t) note(c.institution, t);
	}
	for (const l of ds.licences) {
		if (!l.grant) continue;
		const t = Date.parse(l.grant);
		note(l.holder, t);
		note(l.issuer, t);
	}
	for (const dec of ds.declarations) note(dec.declarer, Date.parse(dec.date));
	return map;
})();

export function hasAppeared(id: string, t: number): boolean {
	const at = appearDates.get(id);
	return at === undefined || t >= at;
}

/**
 * Does a foreign counterparty exist at the instant? Its own authored interval
 * is the rule: a state whose first recorded tie is 2010 has still existed
 * since independence. Only an entity with no start falls back to appearance.
 */
function foreignExists(inst: Institution, t: number): boolean {
	if (inst.interval.raw.start !== null) return t >= inst.interval.startEarliest;
	return hasAppeared(inst.id, t);
}

/** Group order per layer, from groups.yaml; an unlisted group sorts by name before "Other". */
function groupRank(layer: Layer): (g: string) => number {
	const order = ds.meta.groupOrder?.[layer] ?? [];
	return (g: string) => {
		if (g === 'Other') return 10_000;
		const i = order.indexOf(g);
		return i >= 0 ? i : 5_000;
	};
}

const byInstitutionOrder = (a: Institution, b: Institution) =>
	(a.order ?? 999) - (b.order ?? 999) || a.name_en.localeCompare(b.name_en);

// --- The scene ----------------------------------------------------------------

/**
 * What a scene depends on, as one number.
 *
 * Playback and scrubbing move the clock every frame, but the record changes
 * only when a post or a tie starts or ends, or an entity first appears. The
 * signature hashes exactly those inputs (every post and tie in play at the
 * instant, every entity that has appeared, and the reader's lens), so a frame
 * whose signature matches the previous one reuses the previous scene object
 * and the view has nothing to update. It costs one pass over the record,
 * which is a small fraction of building a scene.
 */
function signature(input: SceneInput): number {
	const { t, floor, layers, families } = input;
	let h = 2166136261;
	const mix = (s: string) => {
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		h ^= 124;
		h = Math.imul(h, 16777619);
	};
	mix(floor);
	mix([...layers].sort().join(','));
	mix([...families].sort().join(','));
	mix(input.rtl ? 'rtl' : 'ltr');
	for (const f of input.flows ?? []) mix(f.id + f.description);
	for (const p of ds.positions) if (possiblyActive(p.interval, t) && meetsBasis(p.basis as Basis, floor)) mix(p.id);
	for (const r of ds.relationships) {
		if (r.interval.raw.start !== null && !possiblyActive(r.interval, t)) continue;
		if (!meetsBasis(r.basis as Basis, floor)) continue;
		if (hasAppeared(r.from, t) && hasAppeared(r.to, t)) mix(r.id);
	}
	for (const which of ['lower', 'upper'] as const) mix(termAt(t, which)?.role.id ?? '-');
	for (const inst of ds.institutions) if (inst.layer === 'foreign' && foreignExists(inst, t)) mix(inst.id);
	return h >>> 0;
}

let memo: { sig: number; scene: Scene } | null = null;

/**
 * The scene at an instant, reused while nothing in the record has changed.
 * Same inputs, same object: a view keyed on it re-renders only when the map
 * would actually look different.
 */
export function sceneAt(input: SceneInput): Scene {
	const sig = signature(input);
	if (memo && memo.sig === sig) return memo.scene;
	const scene = buildScene(input);
	memo = { sig, scene };
	return scene;
}

export function buildScene(input: SceneInput): Scene {
	const { t, floor, layers, families } = input;
	const lanes = LAYERS.filter((l) => layers.has(l));
	if (input.rtl) lanes.reverse();
	const laneOf = new Map(lanes.map((l, i) => [l, i]));
	const frames = laneFrames(lanes);

	// 1. Who is in post. Chamber membership is read through civic.ts so the
	//    chamber box seats exactly who the hemicycle seats.
	const posts = new Map<string, Position[]>();
	const holders = new Set<string>();
	for (const p of ds.positions) {
		if (!possiblyActive(p.interval, t)) continue;
		if (!meetsBasis(p.basis as Basis, floor)) continue;
		holders.add(p.holder);
		if (rosterRoles.has(p.role) || termInstitutions.has(p.institution)) continue;
		const inst = institutionById.get(p.institution);
		if (!inst || !laneOf.has(inst.layer as Layer)) continue;
		(posts.get(p.holder) ?? posts.set(p.holder, []).get(p.holder)!).push(p);
	}
	// The most senior post is where a person's lines attach.
	const primaryOf = new Map<string, Position>();
	for (const [person, list] of posts) {
		list.sort((a, b) => b.authority - a.authority || a.interval.startEarliest - b.interval.startEarliest || a.id.localeCompare(b.id));
		primaryOf.set(person, list[0]);
	}

	const chambers: { term: Term; info: ChamberInfo; members: Set<string> }[] = [];
	const chamberOfMember = new Map<string, Term>();
	for (const which of ['lower', 'upper'] as const) {
		const term = termAt(t, which);
		if (!term || !laneOf.has(term.institution.layer as Layer)) continue;
		const s = seatedAt(term, t, floor);
		const g = seatGroups(term, s.members, t);
		const members = new Set(s.members.map((m) => m.position.holder));
		for (const m of members) if (!chamberOfMember.has(m)) chamberOfMember.set(m, term);
		chambers.push({
			term,
			members,
			info: {
				term,
				seats: term.seats,
				named: s.members.length,
				groups: g.groups,
				byList: g.byList,
				split: g.split,
				withheld: s.withheld,
				uncertain: s.uncertain
			}
		});
	}
	const sittingTerm = new Map(chambers.map((c) => [c.term.institution.id, c]));

	// 2. Where an entity would be drawn, if a tie needs it. A person in post sits
	//    in their primary post's lane; anyone else in their home lane.
	const personLane = (id: string): Layer | null => {
		const p = primaryOf.get(id);
		if (p) return institutionById.get(p.institution)!.layer as Layer;
		const term = chamberOfMember.get(id);
		if (term) return term.institution.layer as Layer;
		const person = personById.get(id);
		const home = person?.layers[0] as Layer | undefined;
		return home && laneOf.has(home) ? home : null;
	};
	const entityLane = (id: string): Layer | null => {
		if (personById.has(id)) return personLane(id);
		const inst = institutionById.get(id);
		if (!inst) return null;
		// A past chamber is not on the map; the sitting one is its box.
		if (termInstitutions.has(id) && !sittingTerm.has(id)) return null;
		const l = inst.layer as Layer;
		return laneOf.has(l) ? l : null;
	};

	// 3. The ties in play. Party ties come second: they may attach to anyone
	//    the other ties put on the map, but never put anyone there themselves.
	const notShown = new Map<Family, number>();
	const drawnRels: { rel: TieRel; family: Family; measurement: boolean; flowValue?: number; bundle?: number }[] = [];
	const endpoints = new Set<string>();
	const partyRels: Relationship[] = [];

	for (const rel of ds.relationships) {
		if (!meetsBasis(rel.basis as Basis, floor)) continue;
		if (rel.interval.raw.start !== null && !possiblyActive(rel.interval, t)) continue;
		if (isParliamentaryGroup(rel.from) || isParliamentaryGroup(rel.to)) continue; // drawn by the seat bar
		if (!hasAppeared(rel.from, t) || !hasAppeared(rel.to, t)) continue;
		if (!entityLane(rel.from) || !entityLane(rel.to)) continue;
		const family = familyOf(rel.type);
		if (family === 'party') {
			partyRels.push(rel);
			continue;
		}
		if (!families.has(family)) {
			notShown.set(family, (notShown.get(family) ?? 0) + 1);
			continue;
		}
		drawnRels.push({ rel: rel as TieRel, family, measurement: false });
		endpoints.add(rel.from);
		endpoints.add(rel.to);
	}

	if (input.flows?.length && laneOf.has(institutionById.get('etat-tunisien')?.layer as Layer)) {
		for (const f of input.flows) {
			if (!entityLane(f.to)) continue;
			if (!families.has('flows')) {
				notShown.set('flows', (notShown.get('flows') ?? 0) + 1);
				continue;
			}
			drawnRels.push({
				rel: { id: f.id, from: 'etat-tunisien', to: f.to, type: f.type, subtype: f.subtype, description: f.description, sources: [] },
				family: 'flows',
				measurement: true,
				flowValue: f.value
			});
			endpoints.add('etat-tunisien');
			endpoints.add(f.to);
		}
	}

	// A person is on the map if they hold a (non-chamber) post or a drawn tie names them.
	const onMap = (id: string) => primaryOf.has(id) || endpoints.has(id) || !personById.has(id);
	const bundles = new Map<string, { term: Term; party: string; n: number; basis: Basis }>();
	const BASIS_RANK: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	for (const rel of partyRels) {
		const person = personById.has(rel.from) ? rel.from : personById.has(rel.to) ? rel.to : null;
		const party = person === rel.from ? rel.to : rel.from;
		const direct = person === null || onMap(person);
		const term = person ? chamberOfMember.get(person) : undefined;
		if (!direct && !term) continue; // a past member: not in play
		if (!families.has('party')) {
			notShown.set('party', (notShown.get('party') ?? 0) + 1);
			continue;
		}
		if (direct) {
			drawnRels.push({ rel: rel as TieRel, family: 'party', measurement: false });
			endpoints.add(rel.from);
			endpoints.add(rel.to);
			continue;
		}
		// The rank and file: one line per chamber and party, carrying the count
		// and the weakest basis among the ties it bundles.
		const key = term!.institution.id + '|' + party;
		const b = bundles.get(key) ?? { term: term!, party, n: 0, basis: 'documented' as Basis };
		b.n++;
		if (BASIS_RANK.indexOf(rel.basis as Basis) > BASIS_RANK.indexOf(b.basis)) b.basis = rel.basis as Basis;
		bundles.set(key, b);
	}
	for (const [key, b] of bundles) {
		const id = 'bundle-' + key.replace('|', '--');
		drawnRels.push({
			rel: { id, from: b.term.institution.id, to: b.party, type: 'party', subtype: 'bundle', basis: b.basis, sources: [] },
			family: 'party',
			measurement: false,
			bundle: b.n
		});
		endpoints.add(b.term.institution.id);
		endpoints.add(b.party);
	}

	// 4. The units of each lane.
	const units: Unit[] = [];
	const heads: GroupHead[] = [];
	const anchors = new Map<string, Anchor>();
	const unitOf = new Map<string, Unit>();
	const perLane = new Map<Layer, number>();
	let height = 0;

	for (const layer of lanes) {
		const li = laneOf.get(layer)!;
		const x0 = frames.x[li];
		const LW = frames.w[li];
		const rank = groupRank(layer);

		// Office boxes: institutions in this lane with someone in post.
		const office = new Map<string, Position[]>();
		for (const list of posts.values()) {
			for (const p of list) {
				const inst = institutionById.get(p.institution)!;
				if (inst.layer !== layer) continue;
				(office.get(inst.id) ?? office.set(inst.id, []).get(inst.id)!).push(p);
			}
		}
		const lanesChambers = chambers.filter((c) => c.term.institution.layer === layer);
		const boxed = new Set<string>([...office.keys(), ...lanesChambers.map((c) => c.term.institution.id)]);

		// Chips: institutions a drawn tie needs that no box draws. The foreign
		// lane is a register: every counterparty that exists, tied or not.
		const chips = new Set<string>();
		for (const id of endpoints) {
			const inst = institutionById.get(id);
			if (!inst || inst.layer !== layer || boxed.has(id)) continue;
			if (termInstitutions.has(id) && !sittingTerm.has(id)) continue;
			chips.add(id);
		}
		if (layer === 'foreign') {
			for (const inst of ds.institutions) {
				if (inst.layer === 'foreign' && !boxed.has(inst.id) && foreignExists(inst, t)) chips.add(inst.id);
			}
		}

		// Group everything, in the authored order.
		const groups = new Map<string, Institution[]>();
		for (const id of [...boxed, ...chips]) {
			const inst = institutionById.get(id)!;
			(groups.get(inst.group) ?? groups.set(inst.group, []).get(inst.group)!).push(inst);
		}
		const groupOrder = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

		let y = GEO.TOP;
		let people = 0;
		for (const group of groupOrder) {
			const insts = groups.get(group)!.sort(byInstitutionOrder);
			const boxes = insts.filter((i) => boxed.has(i.id));
			const chipList = insts.filter((i) => !boxed.has(i.id));
			heads.push({ key: layer + ':' + group, layer, group, x: x0, y, count: insts.length });
			y += GEO.GROUP;

			// Seats per box first, so boxes can be sized before they are placed.
			const filled = boxes.map((inst) => {
				const chamber = sittingTerm.get(inst.id);
				let seated: { person: string; position: Position | null }[];
				if (chamber) {
					// Only members a drawn tie names get a seat of their own.
					seated = [...chamber.members]
						.filter((m) => endpoints.has(m) && !primaryOf.has(m))
						.sort((a, b) => (personById.get(b)?.peakAuthority ?? 0) - (personById.get(a)?.peakAuthority ?? 0) || a.localeCompare(b))
						.map((person) => ({ person, position: null }));
				} else {
					seated = office
						.get(inst.id)!
						.sort((a, b) => b.authority - a.authority || a.roleTitle.localeCompare(b.roleTitle) || a.interval.startEarliest - b.interval.startEarliest || a.id.localeCompare(b.id))
						.map((p) => ({ person: p.holder, position: p }));
				}
				return { inst, chamber, seated };
			});

			const place = (f: (typeof filled)[number], bx: number, by: number, bw: number): Unit => {
				const { inst, chamber, seated } = f;
				const cols = seatCols(seated.length, bw);
				const rows = Math.ceil(seated.length / cols);
				const top = by + GEO.HEAD + (chamber ? GEO.BAR : 0);
				const h = GEO.HEAD + (chamber ? GEO.BAR : 0) + rows * GEO.ROW + (rows || chamber ? GEO.PAD : 0);
				const colW = (bw - GEO.PAD * 2) / cols;
				const unit: Unit = {
					key: 'box:' + inst.id,
					kind: chamber ? 'chamber' : 'office',
					id: inst.id,
					layer,
					group,
					x: bx,
					y: by,
					w: bw,
					h,
					cols,
					seats: seated.map((s, i) => {
						const col = Math.floor(i / Math.max(1, rows));
						const row = i % Math.max(1, rows);
						const primary = s.position ? primaryOf.get(s.person)?.id === s.position.id : true;
						return {
							key: (s.position?.id ?? 'member') + ':' + s.person,
							person: s.person,
							position: s.position,
							primary,
							x: bx + GEO.PAD + col * colW,
							y: top + row * GEO.ROW,
							w: colW
						};
					}),
					chamber: chamber?.info
				};
				units.push(unit);
				unitOf.set(inst.id, unit);
				anchors.set(inst.id, { id: inst.id, layer, lane: li, xl: bx, xr: bx + bw, y: by + GEO.HEAD / 2 });
				for (const s of unit.seats) {
					if (!s.primary) continue;
					people++;
					anchors.set(s.person, { id: s.person, layer, lane: li, xl: bx, xr: bx + bw, y: s.y + GEO.ROW / 2 });
					unitOf.set(s.person, unit);
				}
				return unit;
			};

			// Large boxes (a chamber, the cabinet, the governors) span the lane.
			// Small ones, a ministry with its minister or a bank with its governor,
			// share a row where the lane is wide enough: a column of one-seat boxes
			// stacked full width was most of the old political lane's height.
			const SMALL = 2;
			for (const f of filled.filter((f) => f.chamber || f.seated.length > SMALL)) {
				y += place(f, x0, y, LW).h + GEO.BOX_GAP;
			}
			const small = filled.filter((f) => !f.chamber && f.seated.length <= SMALL);
			if (small.length) {
				const perRow = Math.max(1, Math.floor(LW / 140));
				const cw = (LW - GEO.CHIP_GAP * (perRow - 1)) / perRow;
				for (let i = 0; i < small.length; i += perRow) {
					let rowH = 0;
					small.slice(i, i + perRow).forEach((f, j) => {
						rowH = Math.max(rowH, place(f, x0 + j * (cw + GEO.CHIP_GAP), y, cw).h);
					});
					y += rowH + GEO.CHIP_GAP;
				}
				y += GEO.BOX_GAP - GEO.CHIP_GAP;
			}

			if (chipList.length) {
				const register = layer === 'foreign';
				const perRow = register ? 1 : Math.max(1, Math.floor(LW / 120));
				const pitch = register ? GEO.REG + 2 : GEO.CHIP + GEO.CHIP_GAP;
				const ch = register ? GEO.REG : GEO.CHIP;
				const cw = (LW - GEO.CHIP_GAP * (perRow - 1)) / perRow;
				chipList.forEach((inst, i) => {
					const cx = x0 + (i % perRow) * (cw + GEO.CHIP_GAP);
					const cy = y + Math.floor(i / perRow) * pitch;
					const unit: Unit = {
						key: 'chip:' + inst.id,
						kind: register ? 'register' : 'chip',
						id: inst.id,
						layer,
						group,
						x: cx,
						y: cy,
						w: cw,
						h: ch,
						cols: 1,
						seats: []
					};
					units.push(unit);
					unitOf.set(inst.id, unit);
					anchors.set(inst.id, { id: inst.id, layer, lane: li, xl: cx, xr: cx + cw, y: cy + ch / 2 });
				});
				y += Math.ceil(chipList.length / perRow) * pitch - (register ? 2 : GEO.CHIP_GAP) + GEO.BOX_GAP;
			}
			y += GEO.GROUP_GAP - GEO.BOX_GAP;
		}

		// Outside office: people a drawn tie names who hold no post and sit in no chamber.
		const outside = [...endpoints]
			.filter((id) => personById.has(id) && !primaryOf.has(id) && !chamberOfMember.has(id) && personLane(id) === layer)
			.sort((a, b) => (personById.get(b)!.peakAuthority ?? 0) - (personById.get(a)!.peakAuthority ?? 0) || a.localeCompare(b));
		if (outside.length) {
			heads.push({ key: layer + ':outside', layer, group: '', x: x0, y, count: outside.length });
			y += GEO.GROUP;
			const cols = Math.max(1, Math.floor((LW - GEO.PAD * 2) / GEO.COL_MIN));
			const rows = Math.ceil(outside.length / cols);
			const colW = (LW - GEO.PAD * 2) / cols;
			const h = rows * GEO.ROW + GEO.PAD * 2;
			const unit: Unit = {
				key: 'actors:' + layer,
				kind: 'actors',
				id: null,
				layer,
				group: '',
				x: x0,
				y,
				w: LW,
				h,
				cols,
				seats: outside.map((person, i) => ({
					key: 'out:' + person,
					person,
					position: null,
					primary: true,
					x: x0 + GEO.PAD + Math.floor(i / rows) * colW,
					y: y + GEO.PAD + (i % rows) * GEO.ROW,
					w: colW
				}))
			};
			units.push(unit);
			for (const s of unit.seats) {
				people++;
				anchors.set(s.person, { id: s.person, layer, lane: li, xl: x0, xr: x0 + LW, y: s.y + GEO.ROW / 2 });
				unitOf.set(s.person, unit);
			}
			y += h + GEO.GROUP_GAP;
		}
		perLane.set(layer, people);
		height = Math.max(height, y);
	}

	// A right-to-left reader gets the lanes mirrored (above) and, inside each
	// lane, the card grid and the seat columns mirrored too, so the first card
	// and the first column sit where reading starts. Anchors follow.
	if (input.rtl) {
		for (const u of units) {
			const li = laneOf.get(u.layer)!;
			const lx = frames.x[li];
			const lw = frames.w[li];
			const ox = u.x;
			u.x = lx + lw - (u.x - lx) - u.w;
			for (const s of u.seats) s.x = u.x + u.w - (s.x - ox) - s.w;
		}
		for (const u of units) {
			if (u.id) {
				const a = anchors.get(u.id);
				if (a) {
					a.xl = u.x;
					a.xr = u.x + u.w;
				}
			}
			for (const s of u.seats) {
				const a = anchors.get(s.person);
				if (a && s.primary) {
					a.xl = u.x;
					a.xr = u.x + u.w;
				}
			}
		}
	}

	// 5. Ties with both ends on the map.
	const ties: Tie[] = [];
	for (const d of drawnRels) {
		const a = anchors.get(d.rel.from);
		const b = anchors.get(d.rel.to);
		if (!a || !b || a === b) continue;
		ties.push({
			id: d.rel.id,
			rel: d.rel,
			family: d.family,
			a,
			b,
			crossLayer: a.layer !== b.layer,
			measurement: d.measurement,
			flowValue: d.flowValue,
			bundle: d.bundle,
			multi: 1
		});
	}
	const pairCount = new Map<string, number>();
	for (const e of ties) {
		const k = e.rel.from + '→' + e.rel.to;
		pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
	}
	for (const e of ties) e.multi = Math.min(3, pairCount.get(e.rel.from + '→' + e.rel.to) ?? 1);

	let tieCount = 0;
	let cross = 0;
	for (const e of ties) {
		if (e.measurement) continue;
		tieCount += e.bundle ?? 1;
		if (e.crossLayer) cross += e.bundle ?? 1;
	}

	return {
		lanes,
		laneX: frames.x,
		laneW: frames.w,
		gutters: frames.gutters,
		width: frames.width,
		height: Math.max(height, GEO.TOP + 200) + GEO.BOTTOM,
		units,
		heads,
		ties,
		anchors,
		unitOf,
		stats: { inOffice: holders.size, perLane, ties: tieCount, crossLayer: cross, notShown }
	};
}

// --- The layer matrix -----------------------------------------------------------

export interface MatrixCell {
	/** Row and column layers, in canonical LAYERS order (row index >= column index). */
	row: Layer;
	col: Layer;
	/** Authored ties between the two layers (a bundle counts each tie it carries). */
	count: number;
	ties: Tie[];
}

/**
 * Which pairs of layers exchange ties, as a lower-triangular matrix.
 *
 * This is the question the lanes were built to answer ("which parts of the
 * state reach into which"), asked directly: one cell per pair, the diagonal
 * holding ties inside a layer. Measurements are left out, because a trade
 * figure is not a tie between two layers of power.
 */
export function layerMatrix(scene: Scene): { cells: MatrixCell[]; max: number; layers: Layer[] } {
	const layers = LAYERS.filter((l) => scene.lanes.includes(l));
	const idx = new Map(layers.map((l, i) => [l, i]));
	const cells = new Map<string, MatrixCell>();
	for (let r = 0; r < layers.length; r++) {
		for (let c = 0; c <= r; c++) {
			cells.set(layers[r] + '|' + layers[c], { row: layers[r], col: layers[c], count: 0, ties: [] });
		}
	}
	for (const e of scene.ties) {
		if (e.measurement) continue;
		const ia = idx.get(e.a.layer)!;
		const ib = idx.get(e.b.layer)!;
		const [r, c] = ia >= ib ? [ia, ib] : [ib, ia];
		const cell = cells.get(layers[r] + '|' + layers[c])!;
		cell.count += e.bundle ?? 1;
		cell.ties.push(e);
	}
	const list = [...cells.values()];
	return { cells: list, max: Math.max(1, ...list.map((c) => c.count)), layers };
}
