/**
 * Which offices a chronicle event can be read against.
 *
 * An event names actors and institutions; a person holds posts; every post
 * carries a role that hangs off an institution. This module is the join. It
 * gives each event the roles that were in play when it happened, so the
 * Chronicle can answer "who held which office at this point" without every
 * view deriving the same join its own way.
 *
 * Two reverse indices answer the question from the other end — for a role or
 * a person, which events reference them — sorted by date, because that is
 * the order a reader wants.
 *
 * Pure by construction: no Svelte, no dataset import, no module state. The
 * caller passes the five tables, so one function serves the browser, the
 * build, and the fixture suite.
 */

/**
 * A time window whose end may be unknown. `null` and absent both mean "no
 * end recorded"; the join treats that as running to the dataset horizon.
 */
export interface LinkInterval {
	startEarliest: number;
	endEarliest?: number | null;
	endLatest?: number | null;
}

/** The slice of an event this module reads. */
export interface LinkEvent {
	id: string;
	actors?: string[];
	institutions?: string[];
	interval: LinkInterval;
}

/** The slice of a role this module reads. */
export interface LinkRole {
	id: string;
	institution: string;
}

/** The slice of a position this module reads. */
export interface LinkPosition {
	role: string;
	holder: string;
	interval: LinkInterval;
	/** Present on real records; only used to rule a reference out as unresolved. */
	id?: string;
}

/** The five tables the join needs, and nothing more. */
export interface EventLinkTables {
	events: LinkEvent[];
	roles: LinkRole[];
	positions: LinkPosition[];
	people: { id: string }[];
	institutions: { id: string }[];
	/** The dataset cutoff (`ds.meta.cutoff`). When absent, it is inferred from the tables. */
	cutoff?: number;
}

/** What an event links to, in both directions. */
export interface EventLinks {
	institutionIds: Set<string>;
	roleIds: Set<string>;
	personIds: Set<string>;
}

/**
 * The join, returned by reference. Built once per dataset, so callers treat
 * it as read-only.
 */
export interface EventLinkIndex {
	byEvent: Map<string, EventLinks>;
	eventsByRole: Map<string, string[]>;
	eventsByPerson: Map<string, string[]>;
	unresolved: { eventId: string; id: string }[];
}

/**
 * The dataset horizon, read from the data itself.
 *
 * The signature takes the five tables and nothing else — no meta, no build
 * constants — so an interval with no recorded end has to be given an end
 * from within the data. The latest end anywhere in the dataset is that
 * horizon: in the shipped graph the last dated record runs to the day of
 * the cutoff, so this reproduces it exactly. An open post therefore counts
 * as held through the horizon; a closed one stops at its own end.
 */
function datasetHorizon(tables: EventLinkTables): number {
	let horizon = 0;
	const track = (iv: LinkInterval) => {
		const end = iv.endLatest ?? iv.endEarliest;
		if (end != null && end > horizon) horizon = end;
	};
	for (const ev of tables.events) track(ev.interval);
	for (const pos of tables.positions) track(pos.interval);
	return horizon;
}

/**
 * Inclusive overlap, reading each window at its widest. Touching intervals
 * count as overlapping: a post that ends the day an event begins was in
 * office when the event's window opened. This is the same conjunct
 * `overlaps()` in model.ts uses on the timeline, derived here from the
 * passed tables so this module stays pure.
 */
function overlaps(a: LinkInterval, b: LinkInterval, horizon: number): boolean {
	const endOf = (iv: LinkInterval) => iv.endLatest ?? iv.endEarliest ?? horizon;
	return a.startEarliest <= endOf(b) && b.startEarliest <= endOf(a);
}

function append(index: Map<string, string[]>, key: string, id: string): void {
	const list = index.get(key);
	if (list) list.push(id);
	else index.set(key, [id]);
}

/** Event ids by date. The id breaks ties, so the order is deterministic. */
function sortByDate(index: Map<string, string[]>, startOf: Map<string, number>): void {
	for (const ids of index.values()) {
		ids.sort((a, b) => (startOf.get(a) ?? 0) - (startOf.get(b) ?? 0) || (a < b ? -1 : 1));
	}
}

export function buildEventLinks(ds: EventLinkTables): EventLinkIndex {
	const peopleIds = new Set(ds.people.map((p) => p.id));
	const institutionIds = new Set(ds.institutions.map((i) => i.id));
	const roleIds = new Set(ds.roles.map((r) => r.id));
	const positionIds = new Set(
		ds.positions.map((p) => p.id).filter((id): id is string => id != null)
	);

	// Rule (a): every role of an institution, looked up once per institution.
	const rolesByInstitution = new Map<string, string[]>();
	for (const role of ds.roles) append(rolesByInstitution, role.institution, role.id);

	// Rule (b): the posts of a person, looked up once per holder.
	const positionsByHolder = new Map<string, LinkPosition[]>();
	for (const pos of ds.positions) {
		const list = positionsByHolder.get(pos.holder);
		if (list) list.push(pos);
		else positionsByHolder.set(pos.holder, [pos]);
	}

	const horizon = ds.cutoff ?? datasetHorizon(ds);

	const byEvent = new Map<string, EventLinks>();
	const eventsByRole = new Map<string, string[]>();
	const eventsByPerson = new Map<string, string[]>();
	const unresolved: { eventId: string; id: string }[] = [];
	const startOf = new Map<string, number>();

	for (const ev of ds.events) {
		startOf.set(ev.id, ev.interval.startEarliest);

		const eventInstitutions = new Set(ev.institutions ?? []);
		const eventPeople = new Set<string>();
		for (const actor of ev.actors ?? []) {
			if (peopleIds.has(actor)) eventPeople.add(actor);
			else if (institutionIds.has(actor)) eventInstitutions.add(actor);
		}

		const eventRoles = new Set<string>();
		for (const instId of eventInstitutions) {
			for (const roleId of rolesByInstitution.get(instId) ?? []) eventRoles.add(roleId);
		}
		for (const personId of eventPeople) {
			for (const pos of positionsByHolder.get(personId) ?? []) {
				if (overlaps(ev.interval, pos.interval, horizon)) eventRoles.add(pos.role);
			}
		}

		byEvent.set(ev.id, {
			institutionIds: eventInstitutions,
			roleIds: eventRoles,
			personIds: eventPeople
		});

		for (const roleId of eventRoles) append(eventsByRole, roleId, ev.id);
		for (const personId of eventPeople) append(eventsByPerson, personId, ev.id);

		/*
		 * References that land in no table at all — an actor or an
		 * institution id the dataset does not contain. Counted, never dropped
		 * silently: a chronicle row pointing at a record the graph does not
		 * have is a data bug, and the suite asserts the shipped graph has
		 * none. An id that IS in the roles or positions table is not
		 * unresolved; it is a record, just one that is neither a person nor
		 * an institution, so it contributes no link.
		 */
		for (const actor of ev.actors ?? []) {
			if (
				!peopleIds.has(actor) &&
				!institutionIds.has(actor) &&
				!roleIds.has(actor) &&
				!positionIds.has(actor)
			) {
				unresolved.push({ eventId: ev.id, id: actor });
			}
		}
		for (const instId of ev.institutions ?? []) {
			if (!institutionIds.has(instId)) unresolved.push({ eventId: ev.id, id: instId });
		}
	}

	sortByDate(eventsByRole, startOf);
	sortByDate(eventsByPerson, startOf);

	return { byEvent, eventsByRole, eventsByPerson, unresolved };
}
