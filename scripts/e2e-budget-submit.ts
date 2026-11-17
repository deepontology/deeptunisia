/**
 * End to end: the board submits, the local D1 stores, the receipt withdraws.
 *
 * Ticket 0029. This is the proof the unit tests cannot give: a real browser
 * plays the board, the real page calls the real handler, and the receipt is used
 * on the real withdrawal page. It runs against the local API server and the local
 * D1 stand-in only.
 *
 * Start the pair first, from the checkout:
 *   RESEARCH_OPEN=1 RESEARCH_ACCEPT=police,citizen-budget \
 *     RESEARCH_DEV_STUDY=citizen-budget PORT=5321 npx tsx community/server.ts
 *   DT_API_PORT=5321 npx vite dev --host 127.0.0.1 --port 5320 --strictPort
 *
 * Then:
 *   npx tsx scripts/e2e-budget-submit.ts
 *
 * The dev override makes the design study fielding for the accepting and paused
 * runs and skips the bot check, exactly as research/portal/backend.md describes.
 * The canonical registry is never rewritten. The three states:
 *
 *   accepting  RESEARCH_DEV_STUDY=citizen-budget RESEARCH_ACCEPT=police,citizen-budget
 *   paused     RESEARCH_DEV_STUDY=citizen-budget RESEARCH_ACCEPT=police
 *   design     no RESEARCH_DEV_STUDY                RESEARCH_ACCEPT=police,citizen-budget
 *
 * Pass BUDGET_E2E_EXPECT to match:
 *   BUDGET_E2E_EXPECT=paused npx tsx scripts/e2e-budget-submit.ts
 *
 * BASE can point at another pair:
 *   BUDGET_E2E_BASE=http://127.0.0.1:5320 npx tsx scripts/e2e-budget-submit.ts
 */
import { chromium } from 'playwright';

const BASE = (process.env.BUDGET_E2E_BASE ?? 'http://127.0.0.1:5320').replace(/\/$/, '');
const EXPECT = (process.env.BUDGET_E2E_EXPECT ?? 'accepting') as 'accepting' | 'paused' | 'design';

let checks = 0;
let failures = 0;
function ok(name: string, cond: boolean, detail = '') {
	checks++;
	if (!cond) failures++;
	console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail && !cond ? `: ${detail}` : ''}`);
}

async function count(request: import('playwright').APIRequestContext): Promise<number> {
	const res = await request.get(`${BASE}/api/studies/citizen-budget/count`);
	if (!res.ok()) throw new Error(`count answered ${res.status()}`);
	const body = (await res.json()) as { count?: number };
	return body.count ?? 0;
}

/** The line the card must carry in each closed state. */
const CLOSED = {
	paused: { header: /not collecting answers right now/i, card: /not collecting answers right now/i },
	design: { header: /design prototype|not fielding/i, card: /not open for answers yet/i }
} as const;

/**
 * The landing page follows the server too: its status tag and its one live
 * figure must say the state and the count the API holds, not the build-time
 * "in design" text once the server has answered.
 */
async function landing(label: RegExp, stored: number) {
	await page.goto(`${BASE}/research/citizen-budget`, { waitUntil: 'networkidle' });
	await page.waitForFunction(
		(source) => {
			const el = document.querySelector('.plate .tag.mono');
			return el ? new RegExp(source, 'i').test(el.textContent ?? '') : false;
		},
		label.source,
		{ timeout: 15_000 }
	);
	const tag = await page.locator('.plate .tag.mono').innerText();
	ok(`the landing says ${label}`, label.test(tag), tag);
	await page.waitForFunction(
		(n) => {
			const el = document.querySelector('.strip-note');
			return el ? (el.textContent ?? '').includes(String(n)) : false;
		},
		stored,
		{ timeout: 15_000 }
	);
	const note = await page.locator('.strip-note').innerText();
	ok(`the landing shows ${stored} stored`, note.includes(String(stored)), note);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
	const before = await count(context.request);
	console.log(`\n  state ${EXPECT}, stored answers before: ${before}\n`);

	await landing(EXPECT === 'accepting' ? /In the field · collecting/i : EXPECT === 'paused' ? /In the field · not collecting right now/i : /In design · not collecting/i, before);

	await page.goto(`${BASE}/research/citizen-budget/prototype?src=direct`, { waitUntil: 'networkidle' });

	const status = await page.locator('.game .status').innerText();
	if (EXPECT === 'accepting') ok('the page shows the accepting state', /collecting answers/i.test(status), status);
	else ok(`the page shows the ${EXPECT} state`, CLOSED[EXPECT].header.test(status), status);

	// Consent: the three real instrument items, then the frame.
	const boxes = page.locator('.consent input[type="checkbox"]');
	await boxes.nth(0).check();
	await boxes.nth(1).check();
	await boxes.nth(2).check();
	await page.locator('.consent button[type="submit"]').click();
	await page.locator('.game .actions button.cta').click();

	// The default start is the draft. Keep it explicitly, which is a valid answer.
	await page.locator('.board .keep-choice input').check();
	await page.locator('.board .finish').click();
	await page.locator('.game .q').first().waitFor({ state: 'visible' });

	// The result card is the submission step.
	await page.locator('.game .actions button.cta').click();

	if (EXPECT === 'accepting') {
		await page.locator('.game .receipt-code').waitFor({ state: 'visible', timeout: 30_000 });
		const receipt = (await page.locator('.game .receipt-code').innerText()).trim();
		ok('the card shows a real receipt, not the prototype code', /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(receipt), receipt);

		const afterSubmit = await count(context.request);
		ok('one answer was stored', afterSubmit === before + 1, `${before} then ${afterSubmit}`);

		const link = await page.locator('.game .receipt-link').getAttribute('href');
		ok('the receipt links to the real withdrawal page', link === '/research/citizen-budget/withdraw', String(link));

		await landing(/In the field · collecting/i, afterSubmit);

		await page.goto(`${BASE}/research/citizen-budget/withdraw`, { waitUntil: 'networkidle' });
		await page.locator('.wrap input').fill(receipt);
		await page.locator('.wrap button[type="submit"]').click();
		await page.locator('.done').waitFor({ state: 'visible', timeout: 30_000 });
		const done = await page.locator('.done').innerText();
		ok('the withdrawal page says the answer was deleted', /deleted|supprim|حذف/i.test(done), done);

		const afterWithdraw = await count(context.request);
		ok('the row is gone', afterWithdraw === before, `${afterSubmit} then ${afterWithdraw}`);

		await landing(/In the field · collecting/i, afterWithdraw);
	} else {
		await page.locator('.game .block p[role="status"]').last().waitFor({ state: 'visible', timeout: 30_000 });
		const outcome = await page.locator('.game .block p[role="status"]').last().innerText();
		ok(`the card says the ${EXPECT} study stored nothing`, CLOSED[EXPECT].card.test(outcome), outcome);
		ok('no receipt code is shown', (await page.locator('.game .receipt-code').count()) === 0);
		const afterSubmit = await count(context.request);
		ok('no answer was stored', afterSubmit === before, `${before} then ${afterSubmit}`);
		await landing(EXPECT === 'paused' ? /In the field · not collecting right now/i : /In design · not collecting/i, before);
	}

	ok('the page raised no uncaught error', errors.length === 0, errors.join('; '));
} catch (e) {
	failures++;
	console.error(`  FAIL  ${(e as Error).message}`);
} finally {
	await browser.close();
}

console.log(`\n  ${checks - failures}/${checks} end-to-end checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures > 0 ? 1 : 0);
