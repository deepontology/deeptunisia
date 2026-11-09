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
	type Board,
	type BoardState
} from '../src/lib/budget-game/board.ts';
import { compileInstrument, validateSubmission, type InstrumentDocument } from '../community/research-contract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let checks = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = '') {
	checks++;
	if (!cond) failures++;
	console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail && !cond ? ` — ${detail}` : ''}`);
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

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
