/**
 * Transfers between systems on the Treasury board.
 *
 * A transfer is one atomic move: take one step out of the first system, then
 * give one step to the second. The engine (board.ts) stays the only place that
 * knows the rules; this module composes take and give and reports why a
 * composed move is refused. Nothing is mutated: the result is either a new
 * state or a refusal, so a refused transfer leaves the board exactly as it was.
 *
 * A transfer writes two log entries and two snapshots, one per half, so undo
 * has to step back twice. undoTransfer does that.
 */
import {
	give,
	giveProblem,
	take,
	takeProblem,
	undo,
	type Board,
	type BoardState
} from './board';
import type { LineId } from './lines';

export interface Refused {
	refused: string;
}

export type TransferResult = BoardState | Refused;

export function isRefused(result: TransferResult): result is Refused {
	return 'refused' in result;
}

/**
 * Moves one step from `fromId` to `toId`.
 *
 * The give is checked against the state after the take, so the step just taken
 * is already in the purse when the second half checks its price. If either half
 * would be refused, the whole transfer is refused and nothing is written.
 */
export function transferState(
	board: Board,
	state: BoardState,
	fromId: LineId,
	toId: LineId
): TransferResult {
	if (fromId === toId) return { refused: 'A system cannot receive its own step.' };

	const takeBad = takeProblem(state, fromId);
	if (takeBad) return { refused: takeBad };

	const taken = take(board, state, fromId);
	const giveBad = giveProblem(board, taken, toId);
	if (giveBad) return { refused: giveBad };

	return give(board, taken, toId);
}

/** Steps back over a transfer: both the give and the take that preceded it. */
export function undoTransfer(state: BoardState): BoardState {
	return undo(undo(state));
}
