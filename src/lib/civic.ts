import { ds, roleById, institutionById, relationshipsByEntity, activity, type Institution, type Position, type Role } from './model';

/**
 * Who held public office over a piece of territory, at a date.
 *
 * Everything here is a slice of position records by the shared time cursor;
 * nothing is authored per view. A governor is any holder of a role whose
 * `region` is the governorate, so the full succession on that governorate's
 * role is the history, and the holder at the cursor is the present. A member
 * of a legislative term sits in a seated role, and the seat's constituency
 * says where on the map it belongs.
 *
 * `activity` answers 2 when a record certainly covers the date and 1 when its
 * fuzzy edges only might: the panel keeps that distinction rather than
 * rounding "possibly in post" up to "in post".
 */

export interface Holding {
	position: Position;
	role: Role;
	/** 2 = certainly in post at the date, 1 = possibly (the dates are fuzzy). */
	at: 1 | 2;
}

const byStart = (a: Position, b: Position) => a.interval.startEarliest - b.interval.startEarliest;

/** Territorial roles per region id, built once. */
const territorial = (() => {
	const out = new Map<string, Role[]>();
	for (const r of ds.roles) {
		if (!r.region) continue;
		(out.get(r.region) ?? out.set(r.region, []).get(r.region)!).push(r);
	}
	return out;
})();

/** Every recorded holder of a territorial office over the region, oldest first. */
export function officesOver(region: string): Position[] {
	const roles = new Set((territorial.get(region) ?? []).map((r) => r.id));
	return ds.positions.filter((p) => roles.has(p.role)).sort(byStart);
}

/** Holders of the region's territorial offices at time `t`. */
export function officesAt(region: string, t: number): Holding[] {
	const out: Holding[] = [];
	for (const p of officesOver(region)) {
		const at = activity(p.interval, t);
		if (at) out.push({ position: p, role: roleById.get(p.role)!, at });
	}
	return out;
}

/** Whether the dataset has a territorial office for the region at all. */
export function hasOffice(region: string): boolean {
	return territorial.has(region);
}

/** Seated roles (legislative terms) whose institution sat at time `t`. */
export function termsAt(t: number): Role[] {
	const institutions = new Map(ds.institutions.map((i) => [i.id, i]));
	return ds.roles.filter((r) => {
		if (!r.seats) return false;
		const inst = institutions.get(r.institution);
		return !!inst && (inst.parent === 'legislature' || UPPER.has(inst.id)) && activity(inst.interval, t) > 0;
	});
}

/** Members sitting for constituencies in the region at time `t`, per term. */
export function seatsAt(region: string, t: number): { role: Role; members: Holding[] }[] {
	return termsAt(t).map((role) => ({
		role,
		members: ds.positions
			.filter((p) => p.role === role.id && p.constituency?.region === region)
			.map((p) => ({ position: p, role, at: activity(p.interval, t) }))
			.filter((h): h is Holding => h.at > 0)
			.sort((a, b) => (a.position.constituency!.name_en < b.position.constituency!.name_en ? -1 : 1))
	}));
}

/** Creation of a governorate, from the gazetteer: the raw token and its window. */
export interface Created {
	token: string;
	earliest: number;
	latest: number;
}

const createdById = new Map<string, Created>(
	ds.regions
		.filter((r) => r.created && r.createdEarliest !== undefined)
		.map((r) => [r.id, { token: r.created!, earliest: r.createdEarliest!, latest: r.createdLatest ?? r.createdEarliest! }])
);

export function createdOf(region: string): Created | undefined {
	return createdById.get(region);
}

/** True when the date certainly falls before the governorate existed. */
export function notYet(region: string, t: number): boolean {
	const c = createdById.get(region);
	return !!c && t < c.earliest;
}

// ---------------------------------------------------------------------------
// Chambers: legislative terms, their members and how each member is grouped
// ---------------------------------------------------------------------------

export interface Term {
	role: Role;
	institution: Institution;
	seats: number;
	/** The lower chamber is the legislature's own sequence; the upper one sits beside it. */
	chamber: 'lower' | 'upper';
}

/**
 * Second chambers sit beside the legislature rather than inside its sequence
 * of terms: the Chamber of Advisors (2005-2011) and the National Council of
 * Regions and Districts (2024-).
 */
const UPPER = new Set(['chambre-conseillers-2005', 'cnrd']);

/** Every legislative term the dataset holds, oldest first. */
export const terms: Term[] = ds.roles
	.filter((r) => r.seats)
	.map((r) => ({
		role: r,
		institution: institutionById.get(r.institution)!,
		seats: r.seats!,
		chamber: (UPPER.has(r.institution) ? 'upper' : 'lower') as 'lower' | 'upper'
	}))
	// Terms of the one legislature, and the second chambers beside it.
	.filter((x) => x.institution && (x.institution.parent === 'legislature' || x.chamber === 'upper'))
	.sort((a, b) => a.institution.interval.startEarliest - b.institution.interval.startEarliest);

/**
 * The term sitting at `t`. Where two touch (an outgoing chamber's last day is
 * the incoming one's first), the later one wins: it is the chamber in session.
 */
export function termAt(t: number, chamber: 'lower' | 'upper' = 'lower'): Term | null {
	let found: Term | null = null;
	for (const term of terms) if (term.chamber === chamber && activity(term.institution.interval, t) > 0) found = term;
	return found;
}

/** Members of a term at `t`, sitting or possibly sitting. */
export function membersAt(term: Term, t: number): Holding[] {
	return ds.positions
		.filter((p) => p.role === term.role.id)
		.map((p) => ({ position: p, role: term.role, at: activity(p.interval, t) }))
		.filter((h): h is Holding => h.at > 0);
}

/**
 * What colours a seat: the member's parliamentary group at `t` when the record
 * has one, otherwise the party list they were elected on. A group is an
 * institution whose parent is the term; a list is a party tie whose subtype is
 * "elected on the list, <term role id>". Neither is inferred from anything else.
 */
export function affiliation(person: string, term: Term, t: number): { id: string; kind: 'group' | 'list' } | null {
	const ties = (relationshipsByEntity.get(person) ?? []).filter((r) => r.from === person);
	for (const r of ties) {
		const inst = institutionById.get(r.to);
		if (inst?.type === 'parliamentary-group' && inst.parent === term.institution.id && activity(r.interval, t) > 0) {
			return { id: r.to, kind: 'group' };
		}
	}
	for (const r of ties) {
		if (r.type === 'party' && r.subtype === `elected on the list, ${term.role.id}`) {
			return { id: r.to, kind: 'list' };
		}
	}
	return null;
}

/**
 * The tag a tenure carries on a dated view. An open tenure whose newest source
 * is older than the cutoff is "last verified" on that source's month, which is
 * what the reader needs; "dates uncertain" is kept for spans whose edges are
 * genuinely fuzzy. A tenure with no recorded end at all says so.
 */
export function tenureTag(p: Position, at: number): { key: 'verified' | 'unknownEnd' | 'possibly'; date?: number } | null {
	const s = p.interval.status;
	if (s === 'last-verified') return { key: 'verified', date: p.interval.lastObserved ?? undefined };
	if (s === 'unknown') return { key: 'unknownEnd' };
	if (s === 'ongoing') return null;
	return at === 1 ? { key: 'possibly' } : null;
}
