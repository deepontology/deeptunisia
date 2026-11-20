/**
 * The Treasury board: the game engine.
 *
 * Money is held in whole dinars (integers), so no move can lose or create a
 * fraction of a dinar. The envelope is the sum of the movable drafts. A line
 * holds from 0 to 200% of its draft. The purse is the envelope minus what the
 * lines hold. Nothing here scores or ranks.
 *
 * Two move rules, one engine (owner decision A or B, ticket 0015):
 *
 *   coin (A, the default): every move carries one coin of 100 MD, whatever the
 *     line. Moving a coin from one system to another leaves the purse as it
 *     was. The last coin out of a line, or into a line at its 200% cap, is
 *     short: it carries only what is left, so a line can reach exactly 0 or
 *     exactly 200% and the purse can always be emptied to the dinar. The board
 *     finishes when the purse is empty.
 *
 *   step (B): every move carries one step of 5% of that line's draft. Moving a
 *     step from a large line to a small one leaves the difference in the
 *     purse. The board finishes when the purse is within 0.5% of the envelope.
 *
 * States are immutable. Undo pops the last snapshot, so every move, including
 * a transfer between two systems, is taken back in one step.
 */
import { BALANCE_TOLERANCE, DRAFT_LEVEL, MAX_LEVEL, STEP_SHARE, type GameLine, type LineId, type Lines } from './lines';

export type StartMode = 'draft' | 'empty';
export type MoveRule = 'coin' | 'step';

/**
 * The default move rule. Option A, recommended in specs/budget-game/WISE-PASS-3.md.
 * The owner can switch: change this constant, or open the prototype with ?rule=step.
 */
export const DEFAULT_RULE: MoveRule = 'coin';
/** The coin of rule A, in MD. */
export const COIN_MD = 100;

/** Dinars in one MD (million dinars). */
const DINARS = 1_000_000;
const COIN = COIN_MD * DINARS;

export type Refusal = 'zero' | 'cap' | 'purse' | 'self';

export interface LogEntry {
	kind: 'take' | 'give' | 'move' | 'keep';
	/** The system money left (take, move). */
	from: LineId | null;
	/** The system money went to (give, move). */
	to: LineId | null;
	/** What left the source, in MD. */
	md: number;
	/** What reached the target, in MD. Equal to md except a step-rule move. */
	mdIn: number;
}

export interface BoardState {
	rule: MoveRule;
	mode: StartMode;
	/** Whole dinars held by each movable line. */
	held: Record<LineId, number>;
	/** Earlier holdings, newest last, so undo can step back. */
	snapshots: Record<LineId, number>[];
	/** What happened, newest last. */
	log: LogEntry[];
}

export interface Board {
	lines: Lines;
}

const draftCache = new WeakMap<GameLine, number>();

/** A line's draft in whole dinars. */
function draftD(line: GameLine): number {
	let d = draftCache.get(line);
	if (d === undefined) {
		d = Math.round(line.draft * DINARS);
		draftCache.set(line, d);
	}
	return d;
}

function capD(line: GameLine): number {
	return (draftD(line) * MAX_LEVEL) / DRAFT_LEVEL;
}

/** One step of rule B for a line, in whole dinars. */
function stepD(line: GameLine): number {
	return Math.round(draftD(line) * STEP_SHARE);
}

function envelopeD(board: Board): number {
	return board.lines.movable.reduce((s, l) => s + draftD(l), 0);
}

const md = (d: number) => d / DINARS;

export function findLine(board: Board, id: LineId): GameLine {
	const line = board.lines.movable.find((l) => l.id === id);
	if (!line) throw new Error(`no movable line "${id}"`);
	return line;
}

/** One step of rule B, in MD. */
export function stepMd(line: GameLine): number {
	return md(stepD(line));
}

export function startBoard(board: Board, mode: StartMode, rule: MoveRule = DEFAULT_RULE): BoardState {
	const held = {} as Record<LineId, number>;
	for (const l of board.lines.movable) held[l.id] = mode === 'draft' ? draftD(l) : 0;
	return { rule, mode, held, snapshots: [], log: [] };
}

/** What a line holds, in MD. */
export function heldMd(board: Board, state: BoardState, id: LineId): number {
	findLine(board, id);
	return md(state.held[id]);
}

function placedD(board: Board, state: BoardState): number {
	return board.lines.movable.reduce((s, l) => s + state.held[l.id], 0);
}

export function placed(board: Board, state: BoardState): number {
	return md(placedD(board, state));
}

function purseD(board: Board, state: BoardState): number {
	return envelopeD(board) - placedD(board, state);
}

/** Money not yet placed, in MD. */
export function purse(board: Board, state: BoardState): number {
	return md(purseD(board, state));
}

export function finished(board: Board, state: BoardState): boolean {
	const p = purseD(board, state);
	if (state.rule === 'coin') return p === 0;
	return Math.abs(p) <= envelopeD(board) * BALANCE_TOLERANCE;
}

/** True when every line holds its draft. */
export function atDraft(board: Board, state: BoardState): boolean {
	return board.lines.movable.every((l) => state.held[l.id] === draftD(l));
}

/** Dinars the next take from a line would move, or a refusal. */
function takeD(board: Board, state: BoardState, id: LineId): number | Refusal {
	const line = findLine(board, id);
	const h = state.held[id];
	if (h <= 0) return 'zero';
	if (state.rule === 'coin') return Math.min(COIN, h);
	return stepD(line);
}

/** Dinars the next give to a line would move, given money available, or a refusal. */
function giveD(board: Board, state: BoardState, id: LineId, available: number): number | Refusal {
	const line = findLine(board, id);
	const room = capD(line) - state.held[id];
	if (room <= 0) return 'cap';
	if (state.rule === 'coin') {
		if (available <= 0) return 'purse';
		return Math.min(COIN, room, available);
	}
	const s = stepD(line);
	if (room < s) return 'cap';
	if (available < s) return 'purse';
	return s;
}

/** Why a take is refused, or null when it is allowed. */
export function takeProblem(board: Board, state: BoardState, id: LineId): Refusal | null {
	const r = takeD(board, state, id);
	return typeof r === 'string' ? r : null;
}

/** Why a give from the purse is refused, or null when it is allowed. */
export function giveProblem(board: Board, state: BoardState, id: LineId): Refusal | null {
	const r = giveD(board, state, id, purseD(board, state));
	return typeof r === 'string' ? r : null;
}

/** MD the next take from this line would move (0 when refused). */
export function takeAmount(board: Board, state: BoardState, id: LineId): number {
	const r = takeD(board, state, id);
	return typeof r === 'string' ? 0 : md(r);
}

/** MD the next give to this line from the purse would move (0 when refused). */
export function giveAmount(board: Board, state: BoardState, id: LineId): number {
	const r = giveD(board, state, id, purseD(board, state));
	return typeof r === 'string' ? 0 : md(r);
}

function push(state: BoardState, held: Record<LineId, number>, entry: LogEntry): BoardState {
	return { ...state, held, snapshots: [...state.snapshots, state.held], log: [...state.log, entry] };
}

export function take(board: Board, state: BoardState, id: LineId): BoardState {
	const d = takeD(board, state, id);
	if (typeof d === 'string') return state;
	return push(state, { ...state.held, [id]: state.held[id] - d }, { kind: 'take', from: id, to: null, md: md(d), mdIn: 0 });
}

export function give(board: Board, state: BoardState, id: LineId): BoardState {
	const d = giveD(board, state, id, purseD(board, state));
	if (typeof d === 'string') return state;
	return push(state, { ...state.held, [id]: state.held[id] + d }, { kind: 'give', from: null, to: id, md: md(d), mdIn: md(d) });
}

/** Why a transfer from one system to another is refused, or null. */
export function transferProblem(board: Board, state: BoardState, from: LineId, to: LineId): Refusal | null {
	if (from === to) return 'self';
	const out = takeD(board, state, from);
	if (typeof out === 'string') return out;
	if (state.rule === 'coin') {
		const into = giveD(board, state, to, out);
		return typeof into === 'string' ? into : null;
	}
	const into = giveD(board, state, to, purseD(board, state) + out);
	return typeof into === 'string' ? into : null;
}

/**
 * Moves money from one system straight to another, as one move with one undo.
 *
 * Coin rule: one coin (or what fits) leaves the source and the same amount
 * reaches the target; the purse does not change. Step rule: one step of the
 * source leaves, one step of the target arrives, and the difference stays in
 * (or is paid from) the purse.
 */
export function transfer(board: Board, state: BoardState, from: LineId, to: LineId): BoardState {
	if (transferProblem(board, state, from, to)) return state;
	const out = takeD(board, state, from) as number;
	const into =
		state.rule === 'coin'
			? (giveD(board, state, to, out) as number)
			: (giveD(board, state, to, purseD(board, state) + out) as number);
	const outD = state.rule === 'coin' ? into : out;
	const held = { ...state.held, [from]: state.held[from] - outD, [to]: state.held[to] + into };
	return push(state, held, { kind: 'move', from, to, md: md(outD), mdIn: md(into) });
}

/** Sets every movable line to its draft. The log records it as a keep. */
export function keepDraft(board: Board, state: BoardState): BoardState {
	const held = {} as Record<LineId, number>;
	for (const l of board.lines.movable) held[l.id] = draftD(l);
	return push(state, held, { kind: 'keep', from: null, to: null, md: 0, mdIn: 0 });
}

export function undo(state: BoardState): BoardState {
	if (state.snapshots.length === 0) return state;
	return {
		...state,
		held: state.snapshots[state.snapshots.length - 1],
		snapshots: state.snapshots.slice(0, -1),
		log: state.log.slice(0, -1)
	};
}

/**
 * The answer: basis points per line (10000 is the draft), locked lines at
 * 10000, and kept_draft. Under the coin rule a share is rounded to the
 * nearest basis point; under the step rule it is a multiple of 500.
 */
export function toAllocation(board: Board, state: BoardState): Record<string, number | boolean> {
	const out: Record<string, number | boolean> = {};
	for (const l of board.lines.movable) out[l.id] = Math.round((state.held[l.id] * 10000) / draftD(l));
	for (const l of board.lines.locked) out[l.id] = 10000;
	out.kept_draft = atDraft(board, state);
	return out;
}

