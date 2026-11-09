/**
 * The Treasury board: the game engine.
 *
 * The envelope is the sum of the movable drafts. Each line holds a level from 0
 * to 40 steps. One step is 5% of its draft and the draft is 20 steps. The purse
 * is the envelope minus what the lines hold. Taking moves a step out of a line
 * into the purse. Giving moves a step from the purse into a line. The board
 * finishes when the purse is within the tolerance. Nothing here scores or ranks.
 *
 * States are immutable. Undo pops the last snapshot, so every move can be taken back.
 */
import { BALANCE_TOLERANCE, DRAFT_LEVEL, MAX_LEVEL, MOVABLE_ORDER, STEP_SHARE, type GameLine, type LineId, type Lines } from './lines';

export type StartMode = 'draft' | 'empty';

export interface LogEntry {
	kind: 'take' | 'give' | 'keep';
	line: LineId | null;
	md: number;
}

export interface BoardState {
	mode: StartMode;
	levels: Record<LineId, number>;
	/** Earlier level sets, newest last, so undo can step back. */
	snapshots: Record<LineId, number>[];
	/** What happened, newest last. The ledger strip shows the last few. */
	log: LogEntry[];
}

export interface Board {
	lines: Lines;
}

const EPS = 1e-6;

export function stepMd(line: GameLine): number {
	return line.draft * STEP_SHARE;
}

/** Dinars a level holds for a line. */
export function amountOf(line: GameLine, level: number): number {
	return (line.draft * level) / DRAFT_LEVEL;
}

export function findLine(board: Board, id: LineId): GameLine {
	const line = board.lines.movable.find((l) => l.id === id);
	if (!line) throw new Error(`no movable line "${id}"`);
	return line;
}

export function startBoard(board: Board, mode: StartMode): BoardState {
	const levels = {} as Record<LineId, number>;
	for (const l of board.lines.movable) levels[l.id] = mode === 'draft' ? DRAFT_LEVEL : 0;
	return { mode, levels, snapshots: [], log: [] };
}

export function placed(board: Board, state: BoardState): number {
	return board.lines.movable.reduce((s, l) => s + amountOf(l, state.levels[l.id]), 0);
}

/** Money not yet placed. Positive: the purse holds money. Negative: over-placed. */
export function purse(board: Board, state: BoardState): number {
	return board.lines.envelope - placed(board, state);
}

export function finished(board: Board, state: BoardState): boolean {
	return Math.abs(purse(board, state)) <= board.lines.envelope * BALANCE_TOLERANCE + EPS;
}

/** True when every line is at the draft. */
export function atDraft(state: BoardState): boolean {
	return MOVABLE_ORDER.every((id) => state.levels[id] === DRAFT_LEVEL);
}

/** Why a take is refused, or null when it is allowed. */
export function takeProblem(state: BoardState, id: LineId): string | null {
	return state.levels[id] <= 0 ? 'This system is already at zero.' : null;
}

/** Why a give is refused, or null when it is allowed. Money is checked against the purse by the caller. */
export function giveProblem(board: Board, state: BoardState, id: LineId): string | null {
	if (state.levels[id] >= MAX_LEVEL) return 'This system is already at 200% of its draft.';
	const step = stepMd(findLine(board, id));
	if (purse(board, state) + EPS < step) return 'The purse does not hold enough for one step.';
	return null;
}

function push(state: BoardState, levels: Record<LineId, number>, entry: LogEntry): BoardState {
	return { ...state, levels, snapshots: [...state.snapshots, state.levels], log: [...state.log, entry] };
}

export function take(board: Board, state: BoardState, id: LineId): BoardState {
	if (takeProblem(state, id)) return state;
	const md = stepMd(findLine(board, id));
	return push(state, { ...state.levels, [id]: state.levels[id] - 1 }, { kind: 'take', line: id, md });
}

export function give(board: Board, state: BoardState, id: LineId): BoardState {
	if (giveProblem(board, state, id)) return state;
	const md = stepMd(findLine(board, id));
	return push(state, { ...state.levels, [id]: state.levels[id] + 1 }, { kind: 'give', line: id, md });
}

/** Sets every movable line to the draft. The log records it as a keep. */
export function keepDraft(board: Board, state: BoardState): BoardState {
	const levels = {} as Record<LineId, number>;
	for (const l of board.lines.movable) levels[l.id] = DRAFT_LEVEL;
	return push(state, levels, { kind: 'keep', line: null, md: 0 });
}

export function undo(state: BoardState): BoardState {
	if (state.snapshots.length === 0) return state;
	const previous = state.snapshots[state.snapshots.length - 1];
	return {
		...state,
		levels: previous,
		snapshots: state.snapshots.slice(0, -1),
		log: state.log.slice(0, -1)
	};
}

/** Basis points per line (10000 is the draft), locked lines at 10000, and kept_draft. */
export function toAllocation(board: Board, state: BoardState): Record<string, number | boolean> {
	const out: Record<string, number | boolean> = {};
	for (const l of board.lines.movable) out[l.id] = state.levels[l.id] * 500;
	for (const l of board.lines.locked) out[l.id] = 10000;
	out.kept_draft = atDraft(state);
	// kept_draft is true exactly when every line is at the draft, which the validator also requires.
	return out;
}
