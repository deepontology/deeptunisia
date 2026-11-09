/**
 * Checks the citizen budget game rounds (src/lib/budget-game/rounds.ts).
 *
 * Every response must net to zero dinars, move only whole 5% steps, and leave
 * each line within 0% to 200% of its draft over any path through the game.
 * Usage: npx tsx scripts/test-budget-rounds.ts
 */
import { ROUNDS, netMd, addedMd, cutMd, MAX_STEPS, stepMd } from '../src/lib/budget-game/rounds.ts';
import { MOVABLE } from '../src/lib/budget-game/lines.ts';

let checks = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = '') {
	checks++;
	if (!cond) failures++;
	console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail && !cond ? ` — ${detail}` : ''}`);
}

const movable = new Set(MOVABLE.map((l) => l.id));
ok('five rounds', ROUNDS.length === 5);

// Each round's pressure: the funded responses must add exactly the amount asked.
for (const r of ROUNDS) {
	ok(`round ${r.id} has three responses`, r.responses.length === 3);
	for (const resp of r.responses) {
		const tag = `round ${r.id} ${resp.id}`;
		ok(`${tag} nets to zero dinars`, netMd(resp) === 0, `net ${netMd(resp)}`);
		ok(`${tag} moves only movable lines`, resp.moves.every((m) => movable.has(m.line)));
		ok(`${tag} has whole steps and no zero move`, resp.moves.every((m) => Number.isInteger(m.steps) && m.steps !== 0));
		ok(`${tag} has a consequence line`, resp.consequence.length > 0);
		if (resp.moves.length > 0 && r.amountMd > 0 && resp.id !== 'c') {
			ok(`${tag} adds the amount the round asks`, addedMd(resp) === r.amountMd, `adds ${addedMd(resp)}, asks ${r.amountMd}`);
		}
		if (resp.moves.length > 0 && r.amountMd < 0 && resp.id !== 'c') {
			ok(`${tag} saves the amount the round offers`, cutMd(resp) === -r.amountMd, `cuts ${cutMd(resp)}, offers ${-r.amountMd}`);
		}
	}
}

// Worst case over any path: the most a line can move, summed over the five
// rounds, must stay within 0% to 200% of its draft.
const worst = new Map<string, { min: number; max: number }>();
for (const line of movable) worst.set(line, { min: 0, max: 0 });
for (const r of ROUNDS) {
	for (const line of movable) {
		let lo = Infinity;
		let hi = -Infinity;
		for (const resp of r.responses) {
			const s = resp.moves.filter((m) => m.line === line).reduce((t, m) => t + m.steps, 0);
			lo = Math.min(lo, s);
			hi = Math.max(hi, s);
		}
		const w = worst.get(line)!;
		w.min += lo;
		w.max += hi;
	}
}
for (const [line, w] of worst) {
	ok(`${line}: worst case stays within 0% to 200% of draft`, w.min >= -MAX_STEPS && w.max <= MAX_STEPS, `${w.min}..${w.max}`);
}
ok('step sizes are whole dinars', [...movable].every((l) => Number.isInteger(stepMd(l as never))));

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
