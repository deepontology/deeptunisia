/**
 * Click cost of two representative reallocations on the Treasury board.
 *
 * The board moves money one step at a time, and a step is 5% of a line's draft,
 * so the number of clicks depends on which two lines a respondent trades
 * between. This script measures the cheapest finished route for two plausible
 * moves and compares it with the instrument's six-minute estimate. It does not
 * simulate a person; it counts the moves the rules allow.
 *
 * Fails when either task needs more than 20 clicks, or when filling the board
 * from the empty view costs anything other than 320 give clicks.
 *
 * Usage: npx tsx scripts/measure-budget-clicks.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { linesFrom, MAX_LEVEL, DRAFT_LEVEL, type LineId } from '../src/lib/budget-game/lines.ts';
import { startBoard, take, give, finished, purse, stepMd, type Board, type BoardState } from '../src/lib/budget-game/board.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const figures = parse(readFileSync(join(ROOT, 'data/studies/dt-research-003/figures-2027.yaml'), 'utf8')) as {
	rows: { id: string; amount_md: number }[];
};
const board: Board = { lines: linesFrom(figures.rows) };
const toleranceMd = board.lines.envelope * 0.005;

function lineOf(id: LineId) {
	const line = board.lines.movable.find((l) => l.id === id);
	if (!line) throw new Error(`no movable line "${id}"`);
	return line;
}

/** Lines to give into, target first, then the smallest affordable step. */
function giveOrder(to: LineId): LineId[] {
	return [to, ...[...board.lines.movable].sort((a, b) => stepMd(a) - stepMd(b)).map((l) => l.id)];
}

/**
 * Take about `amountMd` from `from`, then give into `to` until the purse is
 * inside the finish band, falling back to the smallest affordable line. Returns
 * the clicks and the money left unplaced.
 */
function shift(from: LineId, to: LineId, amountMd: number): { clicks: number; leftoverMd: number } {
	let state: BoardState = startBoard(board, 'draft');
	let clicks = 0;
	const steps = Math.max(1, Math.round(amountMd / stepMd(lineOf(from))));
	for (let i = 0; i < steps; i++) {
		state = take(board, state, from);
		clicks++;
	}
	let guard = 0;
	while (!finished(board, state)) {
		const next = giveOrder(to).find((id) => stepMd(lineOf(id)) <= purse(board, state) + 1e-6 && state.levels[id] < MAX_LEVEL);
		if (!next) throw new Error(`cannot finish the ${from} to ${to} move`);
		state = give(board, state, next);
		clicks++;
		if (++guard > 500) throw new Error(`no finish after ${clicks} clicks`);
	}
	return { clicks, leftoverMd: purse(board, state) };
}

const tasks: { name: string; from: LineId; to: LineId; amountMd: number }[] = [
	{ name: '10% of Education into Health', from: 'education', to: 'health', amountMd: 918.45 },
	{ name: '10% of the subsidy line into Social protection', from: 'subsidies', to: 'social', amountMd: 1184.6 }
];

let failures = 0;
console.log(`  finish band: ${toleranceMd.toFixed(2)} MD (0.5% of ${board.lines.envelope.toFixed(3)})`);
for (const task of tasks) {
	const result = shift(task.from, task.to, task.amountMd);
	const pass = result.clicks <= 20;
	if (!pass) failures++;
	console.log(
		`  ${pass ? 'ok  ' : 'FAIL'}  ${task.name}: ${result.clicks} clicks, ${result.leftoverMd.toFixed(2)} MD left unplaced`
	);
}

// The empty view has every line at zero and 20 levels to fill per line.
const emptyFill = board.lines.movable.length * DRAFT_LEVEL;
const emptyPass = emptyFill === 320;
if (!emptyPass) failures++;
console.log(`  ${emptyPass ? 'ok  ' : 'FAIL'}  filling the empty view to the draft: ${emptyFill} give clicks`);

console.log(`\n  ${tasks.length + 1} checks, ${failures} failure(s)\n`);
process.exit(failures > 0 ? 1 : 0);
