/**
 * The Treasury board engine, under both move rules.
 *
 *   npx tsx scripts/test-budget-board.ts
 *
 * Rule A (coin, the default): every move carries 100 MD, a transfer between
 * systems leaves the purse unchanged, and the board finishes at an empty purse.
 * Rule B (step): every move carries 5% of the line's draft, a transfer leaves
 * the step gap in the purse, and the board finishes within 0.5%.
 *
 * Both: money is conserved to the dinar over random walks, no line leaves 0 to
 * 200% of its draft, undo is exact, refusals never write, and every finished
 * board passes the allocation validator of the submission contract with the
 * instrument as committed.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { linesFrom, MOVABLE_ORDER, LOCKED_ORDER, type LineId } from '../src/lib/budget-game/lines.ts';
import {
	COIN_MD,
	DEFAULT_RULE,
	atDraft,
	finished,
	give,
	giveAmount,
	heldMd,
	keepDraft,
	placed,
	purse,
	startBoard,
	stepMd,
	take,
	takeAmount,
	toAllocation,
	transfer,
	transferProblem,
	undo,
	type Board,
	type BoardState,
	type MoveRule
} from '../src/lib/budget-game/board.ts';
import { compileInstrument, validateSubmission, type InstrumentDocument } from '../community/research-contract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let checks = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = '') {
	checks++;
	if (!cond) failures++;
	console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail && !cond ? `: ${detail}` : ''}`);
}

const figures = parse(readFileSync(join(ROOT, 'data/studies/dt-research-003/figures-2027.yaml'), 'utf8')) as {
	rows: { id: string; amount_md: number; memo?: boolean }[];
};
const lines = linesFrom(figures.rows);
const board: Board = { lines };
const ids = lines.movable.map((l) => l.id);

let seed = 20271;
const rand = () => {
	seed = (seed * 1103515245 + 12345) % 2147483648;
	return seed / 2147483648;
};
const pick = (): LineId => ids[Math.floor(rand() * ids.length)];
const sameHeld = (a: BoardState, b: BoardState) => JSON.stringify(a.held) === JSON.stringify(b.held);

// The instrument, as committed, is the validator every finished board must pass.
const inst = parse(readFileSync(join(ROOT, 'research/portal/study-003/instrument-v0.yaml'), 'utf8')) as InstrumentDocument;
const allocItem = inst.items.find((i) => i.id === 'alloc_budget');
ok('the instrument has the allocation item', !!allocItem?.allocation);
const alloc = allocItem!.allocation!;
{
	const cats = new Map(alloc.categories.map((c) => [c.id, c]));
	const all = [...lines.movable, ...lines.locked];
	ok('the instrument lists every game line with the same draft', all.every((l) => cats.get(l.id) && Math.abs(cats.get(l.id)!.draft_md - l.draft) < 0.001));
	ok('the instrument envelope equals the game envelope', Math.abs(alloc.envelope_md - lines.envelope) < 0.001, `${alloc.envelope_md} vs ${lines.envelope}`);
	ok('the instrument locks exactly the two locked lines', alloc.categories.filter((c) => c.locked).length === 2);
	ok('the instrument accepts any whole basis point, so both rules validate', alloc.step_bp === 1 && alloc.max_bp === 20000);
}
ok('the order lists match the line model', MOVABLE_ORDER.length === 16 && LOCKED_ORDER.length === 2);
ok('the default rule is the coin (option A)', DEFAULT_RULE === 'coin' && COIN_MD === 100);
ok('every draft splits into 20 whole-dinar steps, so rule B lands on the draft', lines.movable.every((l) => Math.round(l.draft * 1e6) % 20 === 0));

// A minimal instrument built on the committed allocation block (consent plus the allocation item).
const doc: InstrumentDocument = {
	instrument: { id: 'it-board', study: 'dt-fixture', version: '1.0.0', source_locale: 'en', locales: ['en', 'fr', 'ar'], estimated_minutes: 5, completion_target_minutes_max: 15 },
	modules: [{ id: 'mod-1', label: 'Fixture', items: ['consent_fix', 'alloc_fix'] }],
	items: [
		{ id: 'consent_fix', module: 'mod-1', tier: 'core', response: 'consent', required: true, text_en: 'I consent.', text_fr: null, text_ar: null },
		{ id: 'alloc_fix', module: 'mod-1', tier: 'core', response: 'allocation', required: true, text_en: 'Move money.', text_fr: null, text_ar: null, allocation: alloc }
	]
} as InstrumentDocument;
const compiled = compileInstrument(doc);
const validate = (state: BoardState) =>
	validateSubmission(compiled, {
		instrumentHash: compiled.hash,
		locale: 'en',
		channel: 'test',
		consentVersion: 'consent-v1',
		startedAt: 1000,
		completionMs: 60000,
		answers: { consent_fix: true, alloc_fix: toAllocation(board, state) }
	});

function suite(rule: MoveRule) {
	console.log(`\n  rule ${rule}`);
	const draft = startBoard(board, 'draft', rule);
	const empty = startBoard(board, 'empty', rule);
	ok(`${rule}: draft start holds the drafts and an empty purse`, Math.abs(purse(board, draft)) < 1e-9 && atDraft(board, draft) && finished(board, draft));
	ok(`${rule}: empty start holds the whole envelope in the purse`, Math.abs(purse(board, empty) - lines.envelope) < 1e-6 && !finished(board, empty));
	ok(`${rule}: take from a line at zero is refused`, take(board, empty, 'education') === empty);
	ok(`${rule}: give from an empty purse is refused`, give(board, draft, 'education') === draft);

	// The size of one move.
	const edu = lines.movable.find((l) => l.id === 'education')!;
	const expected = rule === 'coin' ? COIN_MD : stepMd(edu);
	ok(`${rule}: one take from Education moves ${rule === 'coin' ? '100 MD' : '5% of its draft'}`, Math.abs(takeAmount(board, draft, 'education') - expected) < 1e-9);
	const t1 = take(board, draft, 'education');
	ok(`${rule}: the take lands in the purse`, Math.abs(purse(board, t1) - expected) < 1e-9);
	ok(`${rule}: the move is logged with its amount`, t1.log.at(-1)?.kind === 'take' && Math.abs(t1.log.at(-1)!.md - expected) < 1e-9);

	// Transfers.
	const moved = transfer(board, draft, 'education', 'health');
	ok(`${rule}: a transfer between two systems is one move`, moved.log.length === 1 && moved.log[0].kind === 'move');
	if (rule === 'coin') {
		ok('coin: a transfer moves exactly 100 MD and leaves the purse empty', Math.abs(heldMd(board, moved, 'health') - heldMd(board, draft, 'health') - 100) < 1e-9 && Math.abs(purse(board, moved)) < 1e-9);
	} else {
		const gap = stepMd(edu) - stepMd(lines.movable.find((l) => l.id === 'health')!);
		ok('step: a transfer leaves the step gap in the purse', Math.abs(purse(board, moved) - gap) < 1e-6, `${purse(board, moved)} vs ${gap}`);
	}
	ok(`${rule}: one undo takes back a whole transfer`, sameHeld(undo(moved), draft) && undo(moved).log.length === 0);
	ok(`${rule}: a transfer into itself is refused`, transferProblem(board, draft, 'health', 'health') === 'self' && transfer(board, draft, 'health', 'health') === draft);
	const atZero = { ...draft, held: { ...draft.held, culture: 0 } };
	ok(`${rule}: a transfer out of a line at zero is refused as zero`, transferProblem(board, atZero, 'culture', 'health') === 'zero');
	const health = lines.movable.find((l) => l.id === 'health')!;
	const atCap = { ...draft, held: { ...draft.held, health: Math.round(health.draft * 2e6) } };
	ok(`${rule}: a transfer into a line at 200% is refused as cap`, transferProblem(board, atCap, 'education', 'health') === 'cap');

	if (rule === 'coin') {
		// The short coin: Presidency empties to exactly zero, and its purse can be placed to the dinar.
		let s = draft;
		let n = 0;
		while (takeAmount(board, s, 'presidency') > 0 && n < 100) {
			s = take(board, s, 'presidency');
			n++;
		}
		const pres = lines.movable.find((l) => l.id === 'presidency')!;
		ok('coin: a small line empties to exactly zero, the last coin short', heldMd(board, s, 'presidency') === 0 && Math.abs(purse(board, s) - pres.draft) < 1e-9 && n === Math.ceil(pres.draft / 100), `${n} takes`);
		while (giveAmount(board, s, 'health') > 0) s = give(board, s, 'health');
		ok('coin: the purse can always be placed to the dinar', purse(board, s) === 0 && finished(board, s));
		ok('coin: that board passes the allocation validator', validate(s).ok, (() => { const r = validate(s); return r.ok ? '' : r.error; })());
	} else {
		const small = transferProblem(board, draft, 'culture', 'subsidies');
		ok('step: a transfer the purse cannot pay is refused as purse', small === 'purse');
	}

	// Random walk: money is conserved, bounds hold, refusals never write, undo is exact.
	let state = startBoard(board, rand() < 0.5 ? 'draft' : 'empty', rule);
	let conserved = 0;
	let bounds = 0;
	let refusedWrote = 0;
	let undoBroke = 0;
	let refused = 0;
	let finishedSeen = 0;
	let finishedValid = 0;
	for (let i = 0; i < 20_000; i++) {
		const before = state;
		const r = rand();
		const a = pick();
		if (r < 0.3) state = take(board, state, a);
		else if (r < 0.6) state = give(board, state, a);
		else if (r < 0.92) state = transfer(board, state, a, pick());
		else if (r < 0.94) state = keepDraft(board, state);
		else state = undo(state);
		if (state === before && r < 0.94) refused++;
		if (state === before && JSON.stringify(state) !== JSON.stringify(before)) refusedWrote++;
		if (state !== before && r < 0.94) {
			const back = undo(state);
			if (!sameHeld(back, before) || back.log.length !== before.log.length) undoBroke++;
		}
		const sum = lines.movable.reduce((s, l) => s + state.held[l.id], 0);
		if (sum + Math.round(purse(board, state) * 1e6) !== Math.round(lines.envelope * 1e6)) conserved++;
		if (Math.abs(placed(board, state) + purse(board, state) - lines.envelope) > 1e-6) conserved++;
		for (const l of lines.movable) {
			const h = state.held[l.id];
			if (!Number.isInteger(h) || h < 0 || h > Math.round(l.draft * 2e6)) bounds++;
		}
		if (finished(board, state)) {
			finishedSeen++;
			if (validate(state).ok) finishedValid++;
		}
	}
	ok(`${rule}: 20,000 random moves conserve money to the dinar`, conserved === 0, `${conserved} broke`);
	ok(`${rule}: no line leaves 0 to 200% of its draft`, bounds === 0, `${bounds} broke`);
	ok(`${rule}: refused moves write nothing`, refused > 0 && refusedWrote === 0, `${refused} refused, ${refusedWrote} wrote`);
	ok(`${rule}: undo restores the holdings and the log exactly`, undoBroke === 0, `${undoBroke} broke`);
	ok(`${rule}: every finished board on the walk passes the validator`, finishedSeen > 0 && finishedValid === finishedSeen, `${finishedValid}/${finishedSeen}`);

	// Greedy fill from empty finishes and validates.
	let g = startBoard(board, 'empty', rule);
	// Lean on Health first, so the greedy board is not the draft.
	for (let i = 0; i < 30; i++) g = give(board, g, 'health');
	for (let i = 0; i < 10_000 && !finished(board, g); i++) {
		const next = give(board, g, ids[i % ids.length]);
		g = next;
	}
	ok(`${rule}: a greedy fill from empty finishes`, finished(board, g), `purse ${purse(board, g).toFixed(3)}`);
	ok(`${rule}: and passes the validator, not as kept_draft`, validate(g).ok && toAllocation(board, g).kept_draft === false);

	// Keep the draft from anywhere.
	const k = keepDraft(board, g);
	const ka = toAllocation(board, k);
	ok(`${rule}: keep the draft answers 10000 everywhere and kept_draft true`, ka.kept_draft === true && ids.every((id) => ka[id] === 10000) && validate(k).ok);
	ok(`${rule}: undo after keep returns to the board before`, sameHeld(undo(k), g));
	if (rule === 'step') {
		ok('step: every share is a multiple of 500 basis points', ids.every((id) => (toAllocation(board, g)[id] as number) % 500 === 0));
	}
}

suite('coin');
suite('step');

// The prototype route: draft start by default (owner decision D2), ?start=empty and ?rule=step as flags.
const route = readFileSync(join(ROOT, 'src/routes/research/citizen-budget/prototype/+page.svelte'), 'utf8');
ok('the prototype route defaults to the draft start', /let\s+start\s*=\s*\$state<StartMode>\('draft'\)/.test(route));
ok('the prototype route reads ?start=empty', /get\('start'\)\s*===\s*'empty'/.test(route));
ok('the prototype route reads ?rule=step', /get\('rule'\)\s*===\s*'step'/.test(route));

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
