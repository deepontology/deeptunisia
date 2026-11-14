/**
 * Move cost of two representative reallocations on the Treasury board.
 *
 * Under rule A (the default) one move is one coin of 100 MD: a drag from one
 * system to another, a tap of a take or give button, or one tick of money
 * flowing while a drag is held still over a target. Under rule B one move is 5%
 * of a line's draft, so the cost depends on which two lines are traded and the
 * gap stays in the purse. This script counts the moves the rules allow for two
 * plausible reallocations, from the draft start, and checks the board finishes.
 * It does not simulate a person.
 *
 * Fails when either task does not finish, needs more than 20 moves under rule
 * A, or leaves anything in the purse under rule A.
 *
 * Usage: npx tsx scripts/measure-budget-clicks.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { linesFrom, type LineId } from '../src/lib/budget-game/lines.ts';
import { COIN_MD, startBoard, transfer, give, finished, purse, stepMd, giveProblem, type Board, type BoardState, type MoveRule } from '../src/lib/budget-game/board.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const figures = parse(readFileSync(join(ROOT, 'data/studies/dt-research-003/figures-2027.yaml'), 'utf8')) as {
	rows: { id: string; amount_md: number }[];
};
const board: Board = { lines: linesFrom(figures.rows) };

function lineOf(id: LineId) {
	const line = board.lines.movable.find((l) => l.id === id);
	if (!line) throw new Error(`no movable line "${id}"`);
	return line;
}

/**
 * Move about `amountMd` from `from` to `to` by transfers, then give whatever the
 * purse holds (rule B leaves the step gap there) until the board finishes.
 */
function shift(rule: MoveRule, from: LineId, to: LineId, amountMd: number): { moves: number; leftoverMd: number } {
	let state: BoardState = startBoard(board, 'draft', rule);
	let moves = 0;
	const unit = rule === 'coin' ? COIN_MD : stepMd(lineOf(from));
	const n = Math.max(1, Math.round(amountMd / unit));
	for (let i = 0; i < n; i++) {
		const next = transfer(board, state, from, to);
		if (next === state) throw new Error(`${rule}: transfer ${from} to ${to} refused at move ${i + 1}`);
		state = next;
		moves++;
	}
	let guard = 0;
	while (!finished(board, state)) {
		const order = [to, ...[...board.lines.movable].sort((a, b) => stepMd(a) - stepMd(b)).map((l) => l.id)];
		const id = order.find((x) => giveProblem(board, state, x) === null);
		if (!id) throw new Error(`${rule}: cannot finish the ${from} to ${to} move`);
		state = give(board, state, id);
		moves++;
		if (++guard > 500) throw new Error(`${rule}: no finish after ${moves} moves`);
	}
	return { moves, leftoverMd: purse(board, state) };
}

const tasks: { name: string; from: LineId; to: LineId; amountMd: number }[] = [
	{ name: '10% of Education into Health', from: 'education', to: 'health', amountMd: 918.45 },
	{ name: '10% of the subsidy line into Social protection', from: 'subsidies', to: 'social', amountMd: 1184.6 }
];

let failures = 0;
let checks = 0;
for (const rule of ['coin', 'step'] as const) {
	console.log(`  rule ${rule}`);
	for (const task of tasks) {
		checks++;
		let line: string;
		let pass: boolean;
		try {
			const r = shift(rule, task.from, task.to, task.amountMd);
			pass = rule === 'coin' ? r.moves <= 20 && Math.abs(r.leftoverMd) < 1e-9 : true;
			line = `${task.name}: ${r.moves} moves, ${r.leftoverMd.toFixed(2)} MD left in the purse`;
		} catch (e) {
			pass = false;
			line = `${task.name}: ${(e as Error).message}`;
		}
		if (!pass) failures++;
		console.log(`    ${pass ? 'ok  ' : 'FAIL'}  ${line}`);
	}
}

// The empty view (not a study arm): every coin of every draft has to be given.
const emptyCoins = board.lines.movable.reduce((s, l) => s + Math.ceil(l.draft / COIN_MD - 1e-9), 0);
console.log(`  info  filling the empty view to the draft under rule A: ${emptyCoins} coins (why the draft start is the study arm)`);

console.log(`\n  ${checks} checks, ${failures} failure(s)\n`);
process.exit(failures > 0 ? 1 : 0);
