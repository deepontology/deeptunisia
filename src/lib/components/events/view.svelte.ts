/**
 * What the events page holds while the reader switches faces.
 *
 * The page draws one set of records in more than one face. Whatever the reader
 * narrowed in one face must still be narrowed in the next: the categories they
 * switched off, "ruptures only", the person or institution they are following,
 * and the years they are looking at. The selected event is the app's own
 * selection (`app.selected`), so the Inspector and every face already share it.
 *
 * One instance per page visit, created by the route and handed to the faces.
 * Nothing here is persisted: the URL carries the face, a followed person or
 * institution and the selected event, which is what a shared link needs.
 */
import { CUTOFF, ds, meetsBasis, personById, institutionById, type Basis, type EventRec } from '$lib/model';
import { app } from '$lib/state.svelte';
import { eventWord } from './words';

/** A word of the events page in the reader's language, with `{param}` filled. Reactive on the locale. */
export function ew(key: string, params: Record<string, string | number> = {}): string {
	return eventWord(app.locale, key, params);
}

export type Face = 'timeline' | 'rings';
/** The faces this page offers, in switch order. The first is the default. */
export const FACES: Face[] = ['rings', 'timeline'];

export function parseFace(value: string | null): Face {
	return FACES.find((f) => f === value) ?? FACES[0];
}

export interface Thread {
	kind: 'actor' | 'institution';
	id: string;
}

/** Read `?actor=` or `?institution=`, accepting only an id the graph knows. */
export function parseThread(params: URLSearchParams): Thread | null {
	const actor = params.get('actor');
	if (actor && (personById.has(actor) || institutionById.has(actor))) return { kind: 'actor', id: actor };
	const inst = params.get('institution');
	if (inst && (institutionById.has(inst) || personById.has(inst))) return { kind: 'institution', id: inst };
	return null;
}

const yearOfT = (t: number) => new Date(t).getUTCFullYear();

/** The first and last year the record holds an event in. */
export const FIRST_YEAR = Math.min(...ds.events.map((e) => yearOfT(e.interval.startEarliest)));
export const LAST_YEAR = yearOfT(CUTOFF);

/**
 * The year presets, shared by every face: everything, the revolution on, the
 * present era on, and the current year. A preset is a start year; every window
 * it names runs to the cutoff.
 */
export const LENS_PRESETS: number[] = [FIRST_YEAR, 2011, 2021, LAST_YEAR].filter(
	(y, i, all) => y >= FIRST_YEAR && y <= LAST_YEAR && all.indexOf(y) === i
);
/** Where the page opens: the present era, where most of the record is. */
export const DEFAULT_LENS = 2021;

/** The axis starts at the earliest recorded event, which can predate the Chronicle's floor. */
export const DOMAIN_MIN = Math.min(Date.UTC(FIRST_YEAR, 0, 1), ...ds.events.map((e) => e.interval.startEarliest));

/** The instant a lens starts at. */
export function lensStart(year: number): number {
	return year <= FIRST_YEAR ? DOMAIN_MIN : Date.UTC(year, 0, 1);
}

export class EventsView {
	face = $state<Face>(FACES[0]);
	/** Categories switched off (empty set = all on). */
	hiddenCats = $state<Set<string>>(new Set());
	rupturesOnly = $state(false);
	thread = $state<Thread | null>(null);
	/** The first year of the window the reader is looking at; the window runs to the cutoff. */
	lens = $state(DEFAULT_LENS);
	/**
	 * Bumped only when the reader picks a preset (or a face asks for a wider
	 * window). A face moves its window when this changes; it writes `lens` back
	 * from its own pans without bumping it, so the two never chase each other.
	 */
	lensSeq = $state(0);
	/** True while the face's window ends at the cutoff, so a preset can show as current. */
	atCutoff = $state(true);
	/** How many events the current face shows, for the count beside the filters. */
	shown = $state(0);

	setLens(year: number) {
		this.lens = Math.max(FIRST_YEAR, Math.min(LAST_YEAR, year));
		this.lensSeq++;
	}

	toggleCat(c: string) {
		const next = new Set(this.hiddenCats);
		if (next.has(c)) next.delete(c);
		else next.add(c);
		this.hiddenCats = next;
	}

	/**
	 * True when an event passes the reader's filters (not the years: each face
	 * windows on its own). `anyCategory` skips the category test, for counting
	 * what a switched-off category would bring back.
	 */
	passes(e: EventRec, basisFloor: Basis, anyCategory = false): boolean {
		if (!meetsBasis(e.basis as Basis, basisFloor)) return false;
		if (!anyCategory && this.hiddenCats.has(e.category)) return false;
		if (this.rupturesOnly && !e.rupture) return false;
		const th = this.thread;
		if (th && !(e.actors ?? []).includes(th.id) && !(e.institutions ?? []).includes(th.id)) return false;
		return true;
	}

	get filtered(): boolean {
		return this.hiddenCats.size > 0 || this.rupturesOnly || this.thread !== null;
	}

	clear() {
		this.hiddenCats = new Set();
		this.rupturesOnly = false;
		this.thread = null;
	}
}
