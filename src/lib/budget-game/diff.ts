/**
 * The difference between the state's 2027 plan and the citizen's allocation.
 *
 * Both figures are in MD, built from the same draft figures file. A difference
 * under half a million dinars reads as "same": the board moves money in steps
 * of five per cent of a line, so anything smaller is rounding, not a decision.
 *
 * Pure numbers only. The board prints them; this file never formats.
 */

export type Direction = 'more' | 'less' | 'same';

export interface Difference {
	/** Citizen minus plan, in MD. Signed. */
	deltaMd: number;
	/** deltaMd as a share of the plan, one decimal. Signed. */
	deltaPct: number;
	direction: Direction;
}

const SAME_MD = 0.5;

/** One decimal, and never a negative zero on screen. */
function round1(n: number): number {
	const r = Math.round(n * 10) / 10;
	return r === 0 ? 0 : r;
}

function difference(planMd: number, citizenMd: number): Difference {
	const deltaMd = citizenMd - planMd;
	const deltaPct = planMd === 0 ? 0 : round1((deltaMd / planMd) * 100);
	const direction: Direction =
		Math.abs(deltaMd) < SAME_MD ? 'same' : deltaMd > 0 ? 'more' : 'less';
	return { deltaMd, deltaPct, direction };
}

/** One system line: the plan's draft against the citizen's amount. */
export function lineDifference(planMd: number, citizenMd: number): Difference {
	return difference(planMd, citizenMd);
}

/** The whole envelope: the sum of the plan's movable drafts against what the citizen placed. */
export function totalDifference(planMd: number, citizenMd: number): Difference {
	return difference(planMd, citizenMd);
}
