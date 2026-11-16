/**
 * Mobile and one-screen check for the citizen budget study and prototype.
 *
 * Drives a real browser at desktop and phone size, in English and Arabic:
 * the prototype board must fit one screen with no page scroll, no horizontal
 * scroll, 44px buttons on a phone, and the default draft start must hold zero
 * in the purse (?start=empty must hold the whole envelope). The study page must not
 * scroll sideways and its live example must actually move the purse.
 *
 * Fails on any page error or console error, screenshots each state to
 * output/citizen-budget/, and prints one line per check plus a final ok.
 *
 *   npx tsx scripts/shoot-budget.ts
 *
 * The build in build/ is served separately (default http://localhost:4173).
 */
import { chromium, type ConsoleMessage, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE ?? 'http://localhost:4173';
const OUT = join(process.cwd(), 'output', 'citizen-budget');
const ENVELOPE = 59932;
const MIN_TOUCH = 44;

interface Size {
	label: string;
	width: number;
	height: number;
	dpr: number;
}

const SIZES: Size[] = [
	{ label: '1280x800', width: 1280, height: 800, dpr: 1 },
	{ label: '820x1180', width: 820, height: 1180, dpr: 1 },
	{ label: '390x844', width: 390, height: 844, dpr: 2 }
];
const LOCALES = ['en', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

class Failure extends Error {}

function fail(name: string, detail: string): never {
	throw new Failure(`${name}: ${detail}`);
}

function ok(line: string): void {
	console.log(`ok ${line}`);
}

/** A decimal amount: "59,932.4 MD" reads as 59932.4; separators and bidi marks drop out. */
function amount(text: string | null | undefined): string {
	return (text ?? '').replace(/[٫]/g, '.').replace(/[^0-9.]/g, '').replace(/\.$/, '');
}

/** Digits only: "59,932 MD" reads as 59932, and any bidi marks drop out. */
function digits(text: string | null | undefined): string {
	return (text ?? '').replace(/[^0-9]/g, '');
}

async function openPage(browser: Awaited<ReturnType<typeof chromium.launch>>, size: Size, locale: Locale) {
	const context = await browser.newContext({
		viewport: { width: size.width, height: size.height },
		deviceScaleFactor: size.dpr
	});
	await context.addInitScript((value: string) => {
		try {
			localStorage.setItem('deeptunisia:locale', value);
		} catch {
			/* storage can be denied; the page then falls back to its default */
		}
	}, locale);
	const page = await context.newPage();
	page.setDefaultTimeout(20000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
	page.on('console', (message: ConsoleMessage) => {
		if (message.type() === 'error') errors.push(`console: ${message.text()}`);
	});
	return { context, page, errors };
}

function assertNoPageErrors(errors: string[], name: string): void {
	if (errors.length > 0) fail(`${name} page errors`, errors.join(' | '));
}

/** Layout can move once webfonts settle; measure after that, not before. */
async function settle(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready.then(() => true));
	await page.waitForTimeout(150);
}

async function layout(page: Page) {
	return page.evaluate(() => ({
		scrollHeight: document.documentElement.scrollHeight,
		innerHeight: window.innerHeight,
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth
	}));
}

async function assertNoHorizontalScroll(page: Page, name: string): Promise<void> {
	const m = await layout(page);
	if (m.scrollWidth > m.innerWidth + 1) {
		fail(`${name} horizontal scroll`, `scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}`);
	}
}

async function assertNoPageScroll(page: Page, name: string) {
	const m = await layout(page);
	if (m.scrollHeight > m.innerHeight + 1) {
		fail(`${name} page scroll`, `scrollHeight ${m.scrollHeight} > innerHeight ${m.innerHeight}`);
	}
	return m;
}

/** Consent, submit, and the frame step, which is where the board starts. */
async function openBoard(page: Page, query = ''): Promise<void> {
	await page.goto(`${BASE}/research/citizen-budget/prototype${query}`, { waitUntil: 'networkidle' });
	const boxes = page.locator('.consent input[type="checkbox"]');
	await boxes.first().waitFor({ state: 'visible' });
	const count = await boxes.count();
	if (count !== 3) fail('board consent', `expected 3 consent boxes, found ${count}`);
	await boxes.nth(0).check();
	await boxes.nth(1).check();
	await boxes.nth(2).check();
	await page.locator('.consent button[type="submit"]').click();
	await page.locator('#h-frame').waitFor({ state: 'visible' });
	await page.locator('.game .actions button.cta').click();
	await page.locator('.board').waitFor({ state: 'visible' });
	await settle(page);
}

async function purseText(page: Page): Promise<string> {
	return (await page.locator('.board .purse-amount').first().innerText()).trim();
}

async function checkBoard(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	size: Size,
	locale: Locale
): Promise<void> {
	const name = `board ${size.label} ${locale}`;
	const { context, page, errors } = await openPage(browser, size, locale);
	try {
		await openBoard(page);
		await page.screenshot({ path: join(OUT, `board-${size.label}-${locale}.png`) });

		const board = page.locator('.board');
		const visible = await board.isVisible();
		const box = await board.boundingBox();
		if (!visible || !box || box.width <= 0 || box.height <= 0) {
			fail(`${name} board visible`, `visible ${visible}, box ${JSON.stringify(box)}`);
		}

		const m = await assertNoPageScroll(page, name);
		await assertNoHorizontalScroll(page, name);

		const purse = digits(await purseText(page));
		if (purse === ``) fail(`${name} draft start purse`, `no number in the purse value`);
		if (Number(purse) !== 0) {
			fail(`${name} draft start purse`, `purse ${purse} MD, expected 0 MD`);
		}

		// The explicit keep-draft control: Finish is disabled until a move or the tick.
		const finish = page.locator('.board .finish');
		if (!(await finish.isDisabled())) fail(`${name} keep gate`, 'Finish is enabled at the draft without a move or a tick');
		const keep = page.locator('.board .keep-choice input');
		await keep.check();
		if (await finish.isDisabled()) fail(`${name} keep gate`, 'Finish is still disabled after the keep-draft tick');
		await keep.uncheck();
		if (!(await finish.isDisabled())) fail(`${name} keep gate`, 'Finish is enabled after the keep-draft tick is cleared');

		// The detail panel: a subsidy line opens its 2026 programmes and can be set to 2024.
		await page.locator('.board [data-drop="subsidies_energy"]').click();
		const beforeSet = amount(await page.locator('.board [data-drop="subsidies_energy"] .yours').innerText());
		await page.locator('.board .details-toggle').click();
		await page.locator('.board .detail').waitFor({ state: 'visible' });
		const programmeRows = await page.locator('.board .detail-mission').count();
		if (programmeRows < 1) fail(`${name} detail`, 'the subsidy detail panel has no 2026 programme rows');
		await page.locator('.board .detail-action').first().click();
		const afterSet = amount(await page.locator('.board [data-drop="subsidies_energy"] .yours').innerText());
		if (afterSet === beforeSet) fail(`${name} detail`, `set to 2024 left the line at ${beforeSet} MD`);

		let touch = '';
		if (size.width <= 480) {
			/* Hidden buttons (the reset control is display:none on a phone) are not
			 * touch targets, so only visible boxes are measured. */
			const small = await page.evaluate(() =>
				Array.from(document.querySelectorAll('.board button'))
					.filter((button) => button.getClientRects().length > 0)
					.map((button) => ({
						label: (button.textContent ?? '').trim().slice(0, 40),
						height: button.getBoundingClientRect().height
					}))
					.filter((entry) => entry.height < 44)
			);
			if (small.length > 0) {
				const detail = small.map((entry) => `"${entry.label}" ${entry.height.toFixed(1)}px`).join(', ');
				fail(`${name} touch targets`, `buttons under 44px: ${detail}`);
			}
			touch = ', all board buttons >= 44px';
		}

		// Past years: thin bars on every system, on by default, and the switches change them.
		const rowsShown = await page.locator('.board [data-drop]:not([data-drop="purse"])').count();
		const pastBars = await page.locator('.board .slot .past-dot').count();
		if (rowsShown !== 27 || pastBars !== 27 * 6) fail(`${name} past years`, `${rowsShown} systems, ${pastBars} past dots, expected 27 systems and 162 dots`);
		const before = pastBars;
		const yearSwitch = size.width <= 720 ? page.locator('.board .years-tool') : page.locator('.board .year').first();
		await yearSwitch.click();
		const after = await page.locator('.board .slot .past-dot').count();
		if (!(after < before)) fail(`${name} past years`, `switching a year off left ${after} of ${before} bars`);
		await yearSwitch.click();
		if (size.label === '820x1180') {
			const clipped = await page.evaluate(() =>
				Array.from(document.querySelectorAll('.board .slot .name'))
					.filter((el) => el.scrollWidth > el.clientWidth + 1)
					.map((el) => (el.textContent ?? '').trim())
			);
			if (clipped.length > 0) fail(`${name} names`, `clipped names: ${clipped.join(' | ')}`);
		}

		assertNoPageErrors(errors, name);
		ok(`${name}: board visible, no page scroll (${m.scrollHeight}/${m.innerHeight}), no h-scroll, purse ${purse} MD${touch}, 27 systems with past years`);
	} finally {
		await context.close();
	}
}

/** The prototype view must start with every system at zero and the whole envelope in the purse. */
async function checkEmptyStart(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	size: Size,
	locale: Locale
): Promise<void> {
	const name = `board ${size.label} ${locale} ?start=empty`;
	const { context, page, errors } = await openPage(browser, size, locale);
	try {
		await openBoard(page, '?start=empty');
		const purse = amount(await purseText(page));
		if (purse === '' || Math.abs(Number(purse) - ENVELOPE) > 1) {
			fail(`${name} purse`, `purse ${purse === '' ? '(none)' : `${purse} MD`}, expected ${ENVELOPE} MD within 1 MD`);
		}
		assertNoPageErrors(errors, name);
		ok(`${name}: purse ${ENVELOPE} MD`);
	} finally {
		await context.close();
	}
}

/**
 * Play, finish, go back from the questions, and finish again: the board must
 * keep every move, and the result must show exactly the systems that changed.
 * Keys drive it so the check reads the same in every language.
 */
async function checkRoundTrip(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	size: Size,
	locale: Locale
): Promise<void> {
	const name = `round trip ${size.label} ${locale}`;
	const { context, page, errors } = await openPage(browser, size, locale);
	try {
		await openBoard(page);
		await page.locator('.board [data-drop="education"]').click();
		for (let i = 0; i < 3; i++) await page.locator('.board .moves-buttons .take').click();
		await page.locator('.board [data-drop="health"]').click();
		for (let i = 0; i < 3; i++) await page.locator('.board .moves-buttons .give').click();
		const healthBefore = amount(await page.locator('.board [data-drop="health"] .yours').first().innerText());
		if (Number(digits(await purseText(page))) !== 0) fail(`${name} play`, 'purse not empty after 3 takes and 3 gives');

		await page.locator('.board .finish').click();
		await page.locator('.game .q').first().waitFor({ state: 'visible' });
		await page.locator('.game .actions button.quiet').click();
		await page.locator('.board').waitFor({ state: 'visible' });
		const healthAfter = amount(await page.locator('.board [data-drop="health"] .yours').first().innerText());
		if (healthAfter !== healthBefore) {
			fail(`${name} back keeps the board`, `Health was ${healthBefore} MD, after Back it is ${healthAfter} MD`);
		}

		await page.locator('.board .finish').click();
		await page.locator('.game .q').first().waitFor({ state: 'visible' });
		await page.locator('.game .actions button.cta').click();
		await page.locator('.game .diverge').waitFor({ state: 'visible' });
		const bars = await page.locator('.game .diverge li').count();
		if (bars !== 2) fail(`${name} result`, `expected 2 changed systems on the result, found ${bars}`);
		const summary = await page.locator('.game .summary').innerText();
		if (!/(^|[^0-9])300([^0-9]|$)/.test(summary.replace(/[^0-9 .]/g, ' '))) {
			fail(`${name} result`, `summary "${summary}" does not say 300 MD moved`);
		}
		await page.screenshot({ path: join(OUT, `result-${size.label}-${locale}.png`), fullPage: true });
		await assertNoHorizontalScroll(page, name);

		assertNoPageErrors(errors, name);
		ok(`${name}: Back kept Health at ${healthAfter} MD, result shows 2 changed systems and 300 MD moved`);
	} finally {
		await context.close();
	}
}

/** The landing page: no sideways scroll, and its live example moves the purse. */
async function checkLanding(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	size: Size,
	locale: Locale
): Promise<void> {
	const name = `landing ${size.label} ${locale}`;
	const { context, page, errors } = await openPage(browser, size, locale);
	try {
		await page.goto(`${BASE}/research/citizen-budget`, { waitUntil: 'load' });
		await page.locator('[data-testid="try-board"] .purse-value:visible').first().waitFor({ state: 'visible' });
		await settle(page);
		await page.screenshot({ path: join(OUT, `landing-${size.label}-${locale}.png`) });

		await assertNoHorizontalScroll(page, name);

		const live = page.locator('[data-testid="try-board"] .rows button:not([disabled])');
		const candidates = await live.count();
		if (candidates === 0) {
			fail(`${name} touchable example`, 'no enabled take or give button on the try board');
		}
		const first = live.first();
		const before = (await first.evaluate((el) => el.closest('[data-testid="try-board"]')?.querySelector('.purse-value')?.textContent ?? '')).trim();
		await first.click();
		try {
			await page.waitForFunction(
				(previous) =>
					Array.from(document.querySelectorAll('[data-testid="try-board"] .purse-value')).some(
						(el) => (el.textContent ?? '').trim() !== previous
					),
				before,
				{ timeout: 5000 }
			);
		} catch {
			fail(`${name} touchable example`, `purse text stayed "${before}" after clicking the live example`);
		}
		const after = (await first.evaluate((el) => el.closest('[data-testid="try-board"]')?.querySelector('.purse-value')?.textContent ?? '')).trim();
		if (after === before) {
			fail(`${name} touchable example`, `purse text stayed "${before}" after clicking the live example`);
		}

		assertNoPageErrors(errors, name);
		ok(`${name}: no h-scroll, live example moved the purse ${before} -> ${after}`);
	} finally {
		await context.close();
	}
}

async function main(): Promise<void> {
	mkdirSync(OUT, { recursive: true });
	const browser = await chromium.launch();
	try {
		for (const locale of LOCALES) {
			for (const size of SIZES) {
				await checkBoard(browser, size, locale);
				await checkEmptyStart(browser, size, locale);
				await checkRoundTrip(browser, size, locale);
				await checkLanding(browser, size, locale);
			}
		}
	} finally {
		await browser.close();
	}
	console.log('ok');
}

main().catch((error: unknown) => {
	if (error instanceof Failure) {
		console.error(`FAIL ${error.message}`);
	} else {
		console.error('FAIL unexpected:', error);
	}
	process.exitCode = 1;
});
