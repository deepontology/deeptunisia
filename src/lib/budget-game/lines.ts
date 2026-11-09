/**
 * Placeholder amounts for the prototype.
 *
 * Every number here is an invented round stub in millions of dinars (MD). None
 * is a press figure, a ministry amount or a total from any budget document.
 * The screens label them placeholder. The real study replaces this file from
 * the official document, with a page reference per line, before it opens.
 */
import type { LineId } from './copy';

export interface Line {
	id: LineId;
	/** Stub draft amount in MD. Placeholder, not verified. */
	draft: number;
	/** Locked lines are shown and summed but cannot be moved. */
	locked: boolean;
}

/** Movable lines, in official budget order (the order the screens use). */
export const MOVABLE: Line[] = [
	{ id: 'schools', draft: 4000, locked: false },
	{ id: 'universities', draft: 2000, locked: false },
	{ id: 'health', draft: 3000, locked: false },
	{ id: 'social', draft: 3500, locked: false },
	{ id: 'fuel', draft: 2500, locked: false },
	{ id: 'food', draft: 1500, locked: false },
	{ id: 'energy', draft: 1200, locked: false },
	{ id: 'police', draft: 2400, locked: false },
	{ id: 'army', draft: 2200, locked: false },
	{ id: 'justice', draft: 800, locked: false },
	{ id: 'farming', draft: 1300, locked: false },
	{ id: 'roads', draft: 2000, locked: false },
	{ id: 'youth', draft: 600, locked: false },
	{ id: 'culture', draft: 400, locked: false },
	{ id: 'presidency', draft: 200, locked: false },
	{ id: 'government', draft: 900, locked: false },
	{ id: 'other', draft: 1000, locked: false }
];

/** Locked lines: counted in the total, never moved. */
export const LOCKED: Line[] = [
	{ id: 'debt', draft: 3000, locked: true },
	{ id: 'reserve', draft: 500, locked: true }
];

/** Share of the draft a line may move to, in percent. */
export const MIN_PCT = 0;
export const MAX_PCT = 200;
export const STEP_PCT = 5;

/** Balanced when the gap is within this share of the envelope. */
export const BALANCE_TOLERANCE = 0.005;

export const DRAFT_ENVELOPE = MOVABLE.reduce((sum, l) => sum + l.draft, 0);
