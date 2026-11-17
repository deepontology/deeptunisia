/**
 * The citizen budget board's submission path, without a browser.
 *
 * Ticket 0029: the board's finish card must post the answers it holds to
 * /api/studies/citizen-budget/submit, show a real receipt when the server stores
 * one, and say the honest thing when the study is in design or not collecting.
 *
 * This file proves the client half against the same compiled instrument the
 * server validates against:
 *   1. a finished board's answers pass validateSubmission;
 *   2. the payload carries exactly the fields the submit route parses;
 *   3. submitResponse reads 200, 403, 409, 400 and a network failure correctly;
 *   4. the component uses the state captions and the real receipt, and the
 *      police runner's own submit path is untouched.
 *
 * The server half is scripts/test-research-budget-storage.ts, which writes and
 * reads the rows on a local database.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { keepDraft, startBoard, toAllocation, type Board } from '../src/lib/budget-game/board.ts';
import { linesFrom } from '../src/lib/budget-game/lines.ts';
import { copyFor } from '../src/lib/budget-game/copy.ts';
import { landingCopy } from '../src/lib/budget-study/landing-copy.ts';
import {
	budgetAnswers,
	channelFromLocation,
	submissionPayload,
	submitResponse,
	tunisiaMonth
} from '../src/lib/research-submit.ts';
import { validateSubmission, type RuntimeInstrument, type StudiesRegistry } from '../community/research-contract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let checks = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = '') {
	checks++;
	if (!cond) failures++;
	console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail && !cond ? `: ${detail}` : ''}`);
}

function bail(message: string): never {
	console.error(`\n  ${message}\n`);
	process.exit(1);
}

const registryPath = join(ROOT, 'src', 'generated', 'studies.json');
let registry: StudiesRegistry;
try {
	registry = JSON.parse(readFileSync(registryPath, 'utf8')) as StudiesRegistry;
} catch {
	bail('src/generated/studies.json is missing — run `npm run data` (or `npm run build`) first');
}
const key = Object.keys(registry.instruments).find((k) => k.startsWith('dt003-citizen-budget@'));
if (!key) bail('the compiled registry carries no citizen budget instrument');
const instrument: RuntimeInstrument = registry.instruments[key];

const figures = parse(readFileSync(join(ROOT, 'data/studies/dt-research-003/figures-2027.yaml'), 'utf8')) as {
	rows: { id: string; amount_md: number }[];
};
const board: Board = { lines: linesFrom(figures.rows) };
/** The default study start: every line at its draft, the purse empty, the explicit keep-draft tick. */
const kept = keepDraft(board, startBoard(board, 'draft', 'coin'));
const allocation = toAllocation(board, kept);

console.log('\n  ── a finished board is a valid submission ──\n');

{
	ok('the board allocates every category, locked lines at the draft', Object.keys(allocation).length === instrument.items.find((i) => i.response === 'allocation')!.allocation!.categories.length + 1);
	const answers = budgetAnswers({ readInfo: true, withdrawal: true, adult: true, allocation, q1: 'same', q2: 5 });
	const result = validateSubmission(instrument, {
		instrumentHash: instrument.hash,
		locale: 'en',
		channel: 'direct',
		consentVersion: `${instrument.version}+${instrument.hash.slice(0, 12)}`,
		startedAt: 1_000,
		completionMs: 300_000,
		answers
	});
	ok('a keep-draft answer passes the server validator', result.ok, result.ok ? '' : result.error);

	const skipped = budgetAnswers({ readInfo: true, withdrawal: true, adult: true, allocation, q1: 'skip', q2: null });
	const skippedResult = validateSubmission(instrument, {
		instrumentHash: instrument.hash,
		locale: 'en',
		channel: 'direct',
		consentVersion: `${instrument.version}+${instrument.hash.slice(0, 12)}`,
		startedAt: 1_000,
		completionMs: 300_000,
		answers: skipped
	});
	ok('skipping both optional questions still validates', skippedResult.ok, skippedResult.ok ? '' : skippedResult.error);
	ok('a skipped question is omitted, not sent as the UI word "skip"', !('q_spending' in skipped) && !('q_say' in skipped));
}

console.log('\n  ── the payload is the shape the submit route parses ──\n');

{
	const answers = budgetAnswers({ readInfo: true, withdrawal: true, adult: true, allocation, q1: 'lower', q2: 3 });
	const payload = submissionPayload({
		instrument,
		locale: 'en',
		channel: 'instagram',
		startedAt: 1_700_000_000_000,
		completionMs: 240_000,
		answers,
		assignment: { blockOrder: 'core_first', scaleDirection: 'ascending', token: 'signed' },
		pow: { salt: 'a', nonce: 1 },
		turnstileToken: 'token',
		revision: 'same-device'
	});
	ok('the instrument hash is the compiled one', payload.instrumentHash === instrument.hash);
	ok('the consent version is the instrument version and the hash prefix', payload.consentVersion === `${instrument.version}+${instrument.hash.slice(0, 12)}`);
	ok('locale, channel and timings travel', payload.locale === 'en' && payload.channel === 'instagram' && payload.startedAt === 1_700_000_000_000 && payload.completionMs === 240_000);
	ok('the assignment, the proof of work and the human-check token travel', payload.assignment !== undefined && payload.pow !== undefined && payload.turnstileToken === 'token');
	ok('the repeat marker travels', payload.revision === 'same-device');
	ok('an update carries the replaced receipt only with update', submissionPayload({ instrument, locale: 'en', channel: 'direct', startedAt: 1, completionMs: 2, answers, revision: 'update', replaces: 'r' }).replaces === 'r' && !('replaces' in payload));
	ok('an absent optional field is absent, not null', !('assignment' in submissionPayload({ instrument, locale: 'en', channel: 'direct', startedAt: 1, completionMs: 2, answers })));

	ok('a listed source maps to its channel', channelFromLocation('?start=draft&src=instagram') === 'instagram');
	ok('an unlisted source maps to other', channelFromLocation('?src=a-partner') === 'other');
	ok('no source maps to direct', channelFromLocation('') === 'direct');
	ok('the month is a calendar month', /^\d{4}-\d{2}$/.test(tunisiaMonth()));
}

console.log('\n  ── the server answer becomes one state ──\n');

{
	const payload = submissionPayload({ instrument, locale: 'en', channel: 'direct', startedAt: 1, completionMs: 2, answers: {} });
	const fake = (status: number, body: unknown, throws = false) =>
		(async () => {
			if (throws) throw new Error('offline');
			return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
		}) as unknown as typeof fetch;

	const sent = await submitResponse('citizen-budget', payload, fake(200, { receipt: '3f1d0f4e-0000-4000-8000-000000000001' }));
	ok('200 with a receipt is a stored answer', sent.ok && sent.receipt === '3f1d0f4e-0000-4000-8000-000000000001');

	const closed = await submitResponse('citizen-budget', payload, fake(403, { error: 'submissions are closed' }));
	ok('403 submissions are closed is the gate refusal', !closed.ok && closed.status === 403 && closed.error === 'submissions are closed');

	const design = await submitResponse('citizen-budget', payload, fake(409, { error: 'this study is not accepting responses' }));
	ok('409 is the study-not-open refusal', !design.ok && design.status === 409);

	const invalid = await submitResponse('citizen-budget', payload, fake(400, { error: 'invalid-answer: expected an integer' }));
	ok('400 is a failed send, not a gate refusal', !invalid.ok && invalid.status === 400);

	const offline = await submitResponse('citizen-budget', payload, fake(0, {}, true));
	ok('a network failure is status 0', !offline.ok && offline.status === 0);
}

console.log('\n  ── the page uses the states and the police path is untouched ──\n');

{
	const game = readFileSync(join(ROOT, 'src/lib/budget-game/BudgetGame.svelte'), 'utf8');
	ok('the board posts the budget study through the shared submit path', game.includes("submitResponse('citizen-budget'"));
	ok('the board builds the answers with the instrument keys', game.includes('budgetAnswers({'));
	ok('the board never shows a fake prototype receipt', !game.includes('CB-PROTO'));
	ok('the stored state links to the real withdrawal page', game.includes('href="/research/citizen-budget/withdraw"'));
	ok('the closed states have their own captions', game.includes('c.study.refused') && game.includes('c.study.notOpen') && game.includes('c.study.failed'));
	ok('the empty-start view is labelled a prototype', game.includes('c.study.prototypeView'));
	const sendHead = game.slice(game.indexOf('async function send()'), game.indexOf('const allocation = result'));
	ok(
		'the design state returns before the network call and says not open',
		/if \(design\)/.test(sendHead) && /phase = 'not-open'/.test(sendHead)
	);
	ok(
		'the completion floor has its own caption and a send-again control',
		game.includes("'the completion time is below the study minimum'") &&
			game.includes("phase = 'too-fast'") &&
			game.includes('c.study.tooFast') &&
			game.includes('c.study.sendAgain'),
	);

	const copy = readFileSync(join(ROOT, 'src/lib/budget-game/copy.ts'), 'utf8');
	ok('the copy keeps the state captions in one place', copy.includes('statusPaused') && copy.includes('statusAccepting'));
	for (const locale of ['en', 'fr', 'ar'] as const) {
		const state = copyFor(locale).study;
		const missing = [
			'chip',
			'statusPaused',
			'statusAccepting',
			'storedBody',
			'whoBody',
			'consentWithdrawal',
			'consentNote',
			'submit',
			'sending',
			'sent',
			'refused',
			'notOpen',
			'failed',
			'tooFast',
			'sendAgain',
			'prototypeView',
			'cardNote',
			'receiptTitle',
			'receiptNote',
			'receiptLink'
		].filter((field) => {
			const value = (state as unknown as Record<string, unknown>)[field];
			return typeof value !== 'string' || value.trim().length === 0;
		});
		ok(`the ${locale} state copy is complete`, missing.length === 0, missing.join(', '));
	}

	const landing = landingCopy;
	for (const locale of ['en', 'fr', 'ar'] as const) {
		const one = landing[locale];
		const missing = ['statusLive', 'statusPaused', 'countUnknown', 'pausedNote', 'ctaNoteLive'].filter(
			(field) => typeof (one as unknown as Record<string, unknown>)[field] !== 'string'
		);
		ok(`the ${locale} landing states are complete`, missing.length === 0 && one.countNote(1).length > 0 && one.countNote(2).length > 0, missing.join(', '));
		ok(`the ${locale} draft chip names the 2027 draft`, /2027/.test(one.figures.chip['draft-press']) && /2027/.test(one.figures.status), `${one.figures.chip['draft-press']} / ${one.figures.status}`);
		ok(`the ${locale} audit legend is present`, one.figures.auditLegend.length > 40, one.figures.auditLegend);
		ok(`the ${locale} board chip names the 2027 draft`, /2027/.test(copyFor(locale).prototype), copyFor(locale).prototype);
	}

	const studyPage = readFileSync(join(ROOT, 'src/lib/budget-study/BudgetStudy.svelte'), 'utf8');
	ok('the landing reads the live study and the stored count', studyPage.includes('/api/studies/citizen-budget') && studyPage.includes('/count') && studyPage.includes('countNote'));
	ok('the landing uses the live and paused labels, not only the design one', studyPage.includes('statusLive') && studyPage.includes('statusPaused'));

	const police = readFileSync(join(ROOT, 'src/routes/research/[slug]/participate/+page.svelte'), 'utf8');
	ok('the police runner keeps its own submit call', police.includes('fetch(`/api/studies/${study.slug}/submit`'));
	ok('the police runner does not import the budget submit module', !police.includes('research-submit'));
	ok('the police runner still sends the same payload fields', ['instrumentHash:', 'consentVersion:', 'startedAt:', 'completionMs:', 'answers:', 'assignment', 'pow'].every((f) => police.includes(f)));
}

console.log(`\n  ${checks - failures}/${checks} budget submit checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures > 0 ? 1 : 0);
