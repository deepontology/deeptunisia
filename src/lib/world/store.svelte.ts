/**
 * World view state — one state, two projections.
 *
 * The globe and the ledger are the same information arranged two ways (see
 * docs/plans/world-rebuild-v2.md §1): the same year cursor, the same family and
 * the same inspected entity must survive the switch between them. This store is
 * what makes that true. `app` keeps owning selection, cursor and locale; this
 * store mirrors those for the world route only — it never forks them.
 *
 * Deliberately NOT persisted: it is a memory of this visit, not a preference,
 * and restoring it on a cold load would make a shared link open somewhere the
 * sender never was (the same reasoning as `lastPath` in nav.svelte.ts).
 */

export type WorldViewMode = 'globe' | 'parliament' | 'government' | 'ledger';

export type WorldFamily = 'trade' | 'energy' | 'debt';

class WorldState {
	view = $state<WorldViewMode>('globe');
	family = $state<WorldFamily>('trade');
	/**
	 * The entity the reader is inspecting across views — an institution id where
	 * the graph has a record, else an ISO 3166-1 alpha-2. Survives globe ↔ ledger
	 * so the switch opens the table with the selected row expanded.
	 */
	entity = $state<string | null>(null);
	/**
	 * A governorate the parliament view should bring forward, set when the
	 * reader comes from a province card: its seats stay lit and the rest dim.
	 */
	focusRegion = $state<string | null>(null);

	/**
	 * The two scales of the page. Outside is Tunisia among states: the globe at
	 * world scale and the ledger. Inside is the country itself: the governorate
	 * map (the globe zoomed into Tunisia), the parliament and the government.
	 * The globe reports which side of the zoom it is on; the other views are
	 * inside or outside by definition.
	 */
	globeInside = $state(false);
	get inside(): boolean {
		return this.view === 'parliament' || this.view === 'government' || (this.view === 'globe' && this.globeInside);
	}

	/** The governorate open on the map, for the trail. */
	region = $state<string | null>(null);

	/**
	 * A camera move the page asks the globe for: to the world, to the country,
	 * or to a point in it (the Bardo before the parliament opens, Carthage before
	 * the government). Consumed by the globe, which clears it.
	 */
	fly = $state<{ to: 'world' | 'tunisia' | 'point'; lon?: number; lat?: number; id: number } | null>(null);
	/** Open the globe already zoomed into the country, as when stepping back out of a lens. */
	openInside = $state(false);

	setView(view: WorldViewMode) {
		this.view = view;
	}

	/** Ask the globe for a camera move. */
	flyTo(to: 'world' | 'tunisia' | 'point', lon?: number, lat?: number) {
		this.fly = { to, lon, lat, id: Date.now() };
	}

	setFamily(family: WorldFamily) {
		this.family = family;
	}
}

export const world = new WorldState();
