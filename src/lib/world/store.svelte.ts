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

export type WorldViewMode = 'globe' | 'ledger';

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

	setView(view: WorldViewMode) {
		this.view = view;
	}

	setFamily(family: WorldFamily) {
		this.family = family;
	}
}

export const world = new WorldState();
