/**
 * Checks the Treasury board (src/lib/budget-game/board.ts) against the figures
 * file, the allocation validator and the instrument.
 *
 * Usage: npx tsx scripts/test-budget-board.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { linesFrom, MOVABLE_ORDER, LOCKED_ORDER, MAX_LEVEL, DRAFT_LEVEL } from '../src/lib/budget-game/lines.ts';
import {
	startBoard,
	take,
	give,
	undo,
	keepDraft,
	purse,
	placed,
	finished,
	toAllocation,
	giveProblem,
	atDraft,
	stepMd,
	type Board,
	type BoardState
} from '../src/lib/budget-game/board.ts';
import { transferState, isRefused, undoTransfer } from '../src/lib/budget-game/dragdrop.ts';
import { compileInstrument, validateSubmission, type InstrumentDocument } from '../community/research-contract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let checks = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = '') {
	checks++;
	if (!cond) failures++;
	console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail && !cond ? ` : ${detail}` : ''}`);
}

// Figures file: the same numbers the landing reads.
const figures = parse(readFileSync(join(ROOT, 'data/studies/dt-research-003/figures-2027.yaml'), 'utf8')) as {
	total_md: number;
	rows: { id: string; amount_md: number; memo?: boolean }[];
};
const rows = figures.rows.filter((r) => !r.memo);
const lines = linesFrom(figures.rows);
const board: Board = { lines };

ok('the game lines cover every row of the budget', Math.abs(lines.total - rows.reduce((s, r) => s + r.amount_md, 0)) < 0.001);
ok('the game total equals the stated draft total within 1 MD', Math.abs(lines.total - figures.total_md) <= 1, `${lines.total} vs ${figures.total_md}`);
ok('sixteen movable lines and two locked lines', lines.movable.length === 16 && lines.locked.length === 2);
ok('the subsidies line is the memo row', lines.movable.find((l) => l.id === 'subsidies')?.draft === 11846);
ok('no line is negative', [...lines.movable, ...lines.locked].every((l) => l.draft >= 0));

// Draft start and empty start.
const draftState = startBoard(board, 'draft');
ok('draft start: every line at the draft', atDraft(draftState));
ok('draft start: purse is empty', Math.abs(purse(board, draftState)) < 1e-6);
ok('draft start: finished', finished(board, draftState));
const emptyState = startBoard(board, 'empty');
ok('empty start: every line at zero', lines.movable.every((l) => emptyState.levels[l.id] === 0));
ok('empty start: purse holds the envelope', Math.abs(purse(board, emptyState) - lines.envelope) < 1e-6);
ok('empty start: not finished', !finished(board, emptyState));

// Refusals.
const zeroTake = take(board, emptyState, 'education');
ok('take at zero is refused', zeroTake === emptyState);
const giveOnce = give(board, emptyState, 'education');
ok('give moves one step from the purse', giveOnce.levels.education === 1 && Math.abs(purse(board, giveOnce) - (lines.envelope - lines.movable.find((l) => l.id === 'education')!.draft * 0.05)) < 1e-6);
let poor: BoardState = emptyState;
for (const l of lines.movable) {
	while (purse(board, poor) >= l.draft * 0.05 && poor.levels[l.id] < MAX_LEVEL) poor = give(board, poor, l.id);
}
const pricey = lines.movable.find((l) => l.id === 'subsidies')!;
ok('give is refused when the purse cannot pay one step', giveProblem(board, poor, pricey.id) !== null && give(board, poor, pricey.id) === poor, `purse ${purse(board, poor).toFixed(2)}`);

// Undo and keep draft.
const back = undo(giveOnce);
ok('undo returns to the earlier state', back.levels.education === 0 && back.log.length === 0);
const kept = keepDraft(board, giveOnce);
ok('keep draft sets every line to the draft and zeroes the purse', atDraft(kept) && Math.abs(purse(board, kept)) < 1e-6);
ok('keep draft is logged as a keep', kept.log[kept.log.length - 1].kind === 'keep');
ok('undo after keep draft restores the moved line', undo(kept).levels.education === 1);

// Ten thousand random moves: the invariant holds at every step.
let seed = 20261109;
const rand = () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 4294967296;
};
let invariantBroke = 0;
let levelBroke = 0;
let state: BoardState = startBoard(board, 'empty');
let rejected = 0;
for (let i = 0; i < 10_000; i++) {
	const l = lines.movable[Math.floor(rand() * lines.movable.length)];
	const before = state;
	const r = rand();
	if (r < 0.45) state = give(board, state, l.id);
	else if (r < 0.9) state = take(board, state, l.id);
	else state = undo(state);
	if (state === before) rejected++;
	if (Math.abs(placed(board, state) + purse(board, state) - lines.envelope) > 1e-6) invariantBroke++;
	for (const m of lines.movable) if (state.levels[m.id] < 0 || state.levels[m.id] > MAX_LEVEL) levelBroke++;
}
ok('10,000 random moves keep placed plus purse equal to the envelope', invariantBroke === 0, `${invariantBroke} broke`);
ok('no level leaves 0 to 200% of draft', levelBroke === 0, `${levelBroke} broke`);
ok('some moves were refused (the rules are exercised)', rejected > 0, `${rejected}`);

// Finished boards pass the allocation validator. Greedy fill from an empty start.
const doc: InstrumentDocument = {
	instrument: {
		id: 'it-board',
		study: 'dt-fixture',
		version: '1.0.0',
		source_locale: 'en',
		locales: ['en', 'fr', 'ar'],
		estimated_minutes: 5,
		completion_target_minutes_max: 15
	},
	modules: [{ id: 'mod-1', label: 'Fixture', items: ['consent_fix', 'alloc_fix'] }],
	items: [
		{ id: 'consent_fix', module: 'mod-1', tier: 'core', response: 'consent', required: true, text_en: 'I consent.', text_fr: null, text_ar: null },
		{
			id: 'alloc_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'allocation',
			required: true,
			text_en: 'Move money.',
			text_fr: null,
			text_ar: null,
			allocation: {
				envelope_md: lines.envelope,
				tolerance: 0.005,
				step_bp: 500,
				max_bp: 20000,
				categories: [
					...lines.movable.map((l) => ({ id: l.id, draft_md: l.draft, locked: false })),
					...lines.locked.map((l) => ({ id: l.id, draft_md: l.draft, locked: true }))
				]
			}
		}
	]
};
const compiled = compileInstrument(doc);
let greedy: BoardState = startBoard(board, 'empty');
let rot = 0;
while (purse(board, greedy) > lines.envelope * 0.005) {
	const l = lines.movable[rot % lines.movable.length];
	rot++;
	if (purse(board, greedy) >= l.draft * 0.05) greedy = give(board, greedy, l.id);
	if (rot > 100_000) break;
}
ok('a greedy fill from empty finishes inside the tolerance', finished(board, greedy), `purse ${purse(board, greedy).toFixed(2)}`);
const answer = toAllocation(board, greedy);
const v = validateSubmission(compiled, {
	instrumentHash: compiled.hash,
	locale: 'en',
	channel: 'test',
	consentVersion: 'consent-v1',
	startedAt: 1000,
	completionMs: 60000,
	answers: { consent_fix: true, alloc_fix: answer }
});
ok('a finished empty-start board is accepted by the allocation validator', v.ok, v.ok ? '' : v.error);

let accepted = 0;
let tried = 0;
let walk: BoardState = startBoard(board, 'draft');
for (let i = 0; i < 2_000; i++) {
	const l = lines.movable[Math.floor(rand() * lines.movable.length)];
	walk = rand() < 0.5 ? give(board, walk, l.id) : take(board, walk, l.id);
	if (finished(board, walk)) {
		tried++;
		const r = validateSubmission(compiled, {
			instrumentHash: compiled.hash,
			locale: 'en',
			channel: 'test',
			consentVersion: 'consent-v1',
			startedAt: 1000,
			completionMs: 60000,
			answers: { consent_fix: true, alloc_fix: toAllocation(board, walk) }
		});
		if (r.ok) accepted++;
	}
}
ok('every finished draft-start state along a random walk is accepted', tried > 0 && accepted === tried, `${accepted}/${tried}`);

// The draft start, kept, is the draft and is accepted as kept_draft.
const keptAnswer = toAllocation(board, kept);
ok('keep draft answers 10000 everywhere and kept_draft true', keptAnswer.kept_draft === true && lines.movable.every((l) => keptAnswer[l.id] === 10000));

// The instrument describes the same lines.
const inst = parse(readFileSync(join(ROOT, 'research/portal/study-003/instrument-v0.yaml'), 'utf8')) as {
	items: { id: string; allocation?: { envelope_md: number; categories: { id: string; draft_md: number; locked: boolean }[] } }[];
};
const alloc = inst.items.find((i) => i.id === 'alloc_budget')?.allocation;
ok('the instrument has the allocation item', !!alloc);
if (alloc) {
	const cats = new Map(alloc.categories.map((c) => [c.id, c]));
	const all = [...lines.movable, ...lines.locked];
	ok('the instrument lists every game line with the same draft', all.every((l) => cats.get(l.id) && Math.abs(cats.get(l.id)!.draft_md - l.draft) < 0.001));
	ok('the instrument envelope equals the game envelope', Math.abs(alloc.envelope_md - lines.envelope) < 0.001, `${alloc.envelope_md} vs ${lines.envelope}`);
	ok('the instrument locks exactly the two locked lines', alloc.categories.filter((c) => c.locked).length === 2);
}
ok('draft level is twenty steps and the maximum is forty', DRAFT_LEVEL === 20 && MAX_LEVEL === 40);
ok('the order lists match the line model', MOVABLE_ORDER.length === 16 && LOCKED_ORDER.length === 2);

// The owner's rules after the board rewrite.

// Every step is 5% of its line's draft.
ok(
	'every movable line steps by 5% of its draft',
	lines.movable.every((l) => Math.abs(stepMd(l) - l.draft * 0.05) <= 0.001),
	lines.movable.map((l) => `${l.id} ${stepMd(l).toFixed(3)}`).join(', ')
);

// The route default is the empty start; draft is only a hidden test flag.
const prototype = readFileSync(join(ROOT, 'src/routes/research/citizen-budget/prototype/+page.svelte'), 'utf8');
const initialStart = prototype.match(/let\s+start\s*=\s*\$state<StartMode>\('([a-z]+)'\)/)?.[1];
ok('the prototype route defaults to the empty start', initialStart === 'empty', `the route starts at "${initialStart}"`);
const queryStart = prototype.match(/get\('start'\)\s*===\s*'([a-z]+)'\s*\?\s*'([a-z]+)'\s*:\s*'([a-z]+)'/);
ok(
	'the prototype route reads draft only as the hidden ?start=draft flag',
	queryStart !== null && queryStart[2] === 'draft' && queryStart[3] === 'empty',
	queryStart ? `the route reads "${queryStart[1]}" and falls back to "${queryStart[3]}"` : 'no start query handling found'
);

// Take then give of the same line returns to the same levels and purse.
{
	const before = startBoard(board, 'draft');
	const out = give(board, give(board, take(board, take(board, before, 'education'), 'education'), 'education'), 'education');
	ok(
		'take then give of the same line returns to the same levels and purse',
		JSON.stringify(out.levels) === JSON.stringify(before.levels) && Math.abs(purse(board, out) - purse(board, before)) < 1e-6
	);
}
let takeGiveBroke = 0;
let takeGiveTried = 0;
let takeGiveState: BoardState = startBoard(board, 'draft');
for (let i = 0; i < 500; i++) {
	const l = lines.movable[Math.floor(rand() * lines.movable.length)];
	const taken = take(board, takeGiveState, l.id);
	if (taken === takeGiveState) continue;
	const returned = give(board, taken, l.id);
	if (returned === taken) continue;
	takeGiveTried++;
	if (JSON.stringify(returned.levels) !== JSON.stringify(takeGiveState.levels)) takeGiveBroke++;
	if (Math.abs(purse(board, returned) - purse(board, takeGiveState)) > 1e-6) takeGiveBroke++;
	takeGiveState = returned;
}
ok('take then give holds over a random walk', takeGiveTried > 0 && takeGiveBroke === 0, `${takeGiveTried} tried, ${takeGiveBroke} broke`);

// Undo is exact for every move kind, over 2,000 random sequences.
const undoKinds = new Map<string, number>();
let undoChecked = 0;
let undoBroke = 0;
let undoState: BoardState = startBoard(board, 'draft');
for (let i = 0; i < 2_000; i++) {
	const l = lines.movable[Math.floor(rand() * lines.movable.length)];
	const before = undoState;
	const r = rand();
	let next: BoardState;
	let kind: 'take' | 'give' | 'keep' | 'undo';
	if (r < 0.4) {
		next = take(board, undoState, l.id);
		kind = 'take';
	} else if (r < 0.8) {
		next = give(board, undoState, l.id);
		kind = 'give';
	} else if (r < 0.92) {
		next = keepDraft(board, undoState);
		kind = 'keep';
	} else {
		next = undo(undoState);
		kind = 'undo';
	}
	undoState = next;
	if (kind === 'undo' || next === before) continue;
	undoKinds.set(kind, (undoKinds.get(kind) ?? 0) + 1);
	undoChecked++;
	const back = undo(next);
	if (JSON.stringify(back.levels) !== JSON.stringify(before.levels)) undoBroke++;
	if (JSON.stringify(back.log) !== JSON.stringify(before.log)) undoBroke++;
	if (rand() < 0.5) undoState = back;
}
ok(
	'undo restores the levels and the log exactly over 2,000 random sequences',
	undoChecked >= 1_000 && undoBroke === 0,
	`${undoChecked} checked, ${undoBroke} broke`
);
ok(
	'the random sequences exercise take, give and keep before undo',
	(undoKinds.get('take') ?? 0) > 0 && (undoKinds.get('give') ?? 0) > 0 && (undoKinds.get('keep') ?? 0) > 0,
	JSON.stringify([...undoKinds])
);

// Keep draft from any state lands at the draft and undoes back to the previous levels.
let keepBroke = 0;
let keepUndoBroke = 0;
let keepFrom: BoardState = startBoard(board, 'empty');
for (let i = 0; i < 200; i++) {
	const l = lines.movable[Math.floor(rand() * lines.movable.length)];
	keepFrom = rand() < 0.6 ? give(board, keepFrom, l.id) : take(board, keepFrom, l.id);
	if (rand() < 0.2) keepFrom = undo(keepFrom);
	const beforeKeep = keepFrom;
	const keptAny = keepDraft(board, keepFrom);
	if (!atDraft(keptAny)) keepBroke++;
	if (Math.abs(purse(board, keptAny)) > 1e-6) keepBroke++;
	const restored = undo(keptAny);
	if (JSON.stringify(restored.levels) !== JSON.stringify(beforeKeep.levels)) keepUndoBroke++;
	if (restored.log.length !== beforeKeep.log.length) keepUndoBroke++;
	keepFrom = keptAny;
}
ok('keep draft from any state sets every line to the draft and empties the purse', keepBroke === 0, `${keepBroke} broke`);
ok('undo after keep draft restores the previous levels', keepUndoBroke === 0, `${keepUndoBroke} broke`);

// Finishing from empty requires placing the purse. A greedy fill marks the last
// state that still holds money and the state after the last placement.
let lastUnplaced: BoardState = startBoard(board, 'empty');
let filling = lastUnplaced;
let fillTurn = 0;
while (purse(board, filling) > lines.envelope * 0.005 && fillTurn <= lines.movable.length * 100) {
	const l = lines.movable[fillTurn % lines.movable.length];
	fillTurn++;
	if (purse(board, filling) + 1e-6 < stepMd(l)) continue;
	lastUnplaced = filling;
	filling = give(board, filling, l.id);
}
ok(
	'a purse above the tolerance is not finished',
	!finished(board, lastUnplaced) && purse(board, lastUnplaced) > lines.envelope * 0.005,
	`purse ${purse(board, lastUnplaced).toFixed(2)}`
);
ok('the same board after placing the last step is finished', finished(board, filling), `purse ${purse(board, filling).toFixed(2)}`);

// The log grows by exactly one per successful move and never for a refused move.
let logGrew = 0;
let logRefused = 0;
let logBroke = 0;
let logState: BoardState = startBoard(board, 'empty');
for (let i = 0; i < 5_000; i++) {
	const l = lines.movable[Math.floor(rand() * lines.movable.length)];
	const before = logState;
	const r = rand();
	logState = r < 0.4 ? take(board, logState, l.id) : r < 0.85 ? give(board, logState, l.id) : keepDraft(board, logState);
	if (logState === before) {
		logRefused++;
		if (logState.log.length !== before.log.length) logBroke++;
	} else if (logState.log.length === before.log.length + 1) {
		logGrew++;
	} else {
		logBroke++;
	}
}
ok('each successful move adds exactly one log entry', logGrew > 0 && logBroke === 0, `${logGrew} grew, ${logBroke} wrong`);
ok('a refused move leaves the log untouched', logRefused > 0, `${logRefused} refused`);

// An empty finished board is accepted, and answers not-kept-draft.
ok(
	'an empty finished board answers not-kept-draft and passes the allocation validator',
	answer.kept_draft === false && v.ok,
	v.ok ? '' : v.error
);

// Transfers: one atomic step from one system to another (the drag and drop path).
{
	const before = startBoard(board, 'draft');
	const moved = transferState(board, before, 'education', 'health');
	ok('a transfer from one system to another is accepted', !isRefused(moved));
	if (!isRefused(moved)) {
		ok(
			'a transfer moves one step between systems and leaves the total steps unchanged',
			Object.values(moved.levels).reduce((s, n) => s + n, 0) ===
				Object.values(before.levels).reduce((s, n) => s + n, 0)
		);
		ok(
			'the purse moves by exactly the price gap between the two steps',
			Math.abs(
				purse(board, moved) -
					purse(board, before) -
					(stepMd(lines.movable.find((l) => l.id === 'education')!) -
						stepMd(lines.movable.find((l) => l.id === 'health')!))
			) < 1e-6
		);
		ok(
			'a transfer takes one step out of the first system',
			moved.levels.education === before.levels.education - 1
		);
		ok(
			'a transfer gives one step to the second system',
			moved.levels.health === before.levels.health + 1
		);
		ok(
			'a transfer writes two log entries, a take then a give',
			moved.log.length === before.log.length + 2 &&
				moved.log.at(-2)?.kind === 'take' &&
				moved.log.at(-1)?.kind === 'give'
		);
		ok(
			'the two halves name the two systems',
			moved.log.at(-2)?.line === 'education' && moved.log.at(-1)?.line === 'health'
		);
		const back = undoTransfer(moved);
		ok(
			'one undo steps back over both entries of a transfer',
			JSON.stringify(back.levels) === JSON.stringify(before.levels) &&
				back.log.length === before.log.length &&
				back.snapshots.length === before.snapshots.length
		);
	}

	// A transfer into a system already at its 200% cap is refused.
	const capped = { ...before, levels: { ...before.levels, health: MAX_LEVEL } };
	const intoCap = transferState(board, capped, 'education', 'health');
	ok('a transfer into a system at 200% is refused', isRefused(intoCap));
	ok(
		'the refused transfer into the cap gives its reason in words',
		isRefused(intoCap) && /200%/.test(intoCap.refused)
	);

	// A transfer the purse after the take cannot pay is refused and changes nothing.
	const frozen = JSON.stringify(draftState);
	const shortPurse = transferState(board, draftState, 'culture', 'subsidies');
	ok('a transfer the purse cannot pay is refused', isRefused(shortPurse));
	ok(
		'the refused short-purse transfer says the purse is short',
		isRefused(shortPurse) && /purse/i.test(shortPurse.refused)
	);
	ok('a refused transfer leaves the state unchanged', JSON.stringify(draftState) === frozen);

	const self = transferState(board, draftState, 'education', 'education');
	ok('a transfer of a system into itself is refused', isRefused(self));
}

// Transfers hold the envelope over a random walk, and refusals never write.
let transferBroke = 0;
let transferAccepted = 0;
let transferRefused = 0;
let transferWalk: BoardState = startBoard(board, 'draft');
for (let i = 0; i < 500; i++) {
	const from = lines.movable[Math.floor(rand() * lines.movable.length)];
	const to = lines.movable[Math.floor(rand() * lines.movable.length)];
	if (from.id === to.id) continue;
	const source = transferWalk;
	const result = transferState(board, source, from.id, to.id);
	if (isRefused(result)) {
		transferRefused++;
		if (JSON.stringify(transferWalk) !== JSON.stringify(source)) transferBroke++;
		if (result.refused.length === 0) transferBroke++;
		continue;
	}
	transferAccepted++;
	const stepGap =
		stepMd(lines.movable.find((l) => l.id === from.id)!) -
		stepMd(lines.movable.find((l) => l.id === to.id)!);
	if (Math.abs(purse(board, result) - purse(board, source) - stepGap) > 1e-6) transferBroke++;
	if (
		Object.values(result.levels).reduce((s, n) => s + n, 0) !==
		Object.values(source.levels).reduce((s, n) => s + n, 0)
	)
		transferBroke++;
	if (result.log.length !== source.log.length + 2) transferBroke++;
	if (result.levels[from.id] !== source.levels[from.id] - 1) transferBroke++;
	if (result.levels[to.id] !== source.levels[to.id] + 1) transferBroke++;
	transferWalk = result;
}
ok('transfers hold one step in and one step out over a random walk', transferBroke === 0, `${transferBroke} broke`);
ok(
	'the random walk exercised both accepted and refused transfers',
	transferAccepted > 0 && transferRefused > 0,
	`${transferAccepted} accepted, ${transferRefused} refused`
);

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
