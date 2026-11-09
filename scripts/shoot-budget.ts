/**
 * Mobile and one-screen check for the citizen budget study and prototype.
 *
 * Drives a real browser at desktop and phone size, in English and Arabic:
 * the prototype board must fit one screen with no page scroll, no horizontal
 * scroll, 44px buttons on a phone, and the empty start must hold the whole
 * envelope in the purse (?start=draft must hold zero). The study page must not
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
	await page.goto(`${BASE}/research/citizen-budget/prototype${query}`, { waitUntil: 'load' });
	const boxes = page.locator('.consent input[type="checkbox"]');
	await boxes.first().waitFor({ state: 'visible' });
	const count = await boxes.count();
	if (count !== 2) fail('board consent', `expected 2 consent boxes, found ${count}`);
	await boxes.nth(0).check();
	await boxes.nth(1).check();
	await page.locator('.consent button[type="submit"]').click();
	await page.locator('#h-frame').waitFor({ state: 'visible' });
	await page.locator('.game .actions button.cta').click();
	await page.locator('.board').waitFor({ state: 'visible' });
	await settle(page);
}

async function purseText(page: Page): Promise<string> {
	return (await page.locator('.board .purse-value').first().innerText()).trim();
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
		if (purse === ``) fail(`${name} empty start purse`, `no number in the purse value`);
		if (Math.abs(Number(purse) - ENVELOPE) > 1) {
			fail(`${name} empty start purse`, `purse ${purse} MD, expected ${ENVELOPE} MD within 1 MD`);
		}

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

		assertNoPageErrors(errors, name);
		ok(`${name}: board visible, no page scroll (${m.scrollHeight}/${m.innerHeight}), no h-scroll, purse ${purse} MD${touch}`);
	} finally {
		await context.close();
	}
}

/** The hidden testing flag must start with every system at the draft: nothing in the purse. */
async function checkDraftStart(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	size: Size,
	locale: Locale
): Promise<void> {
	const name = `board ${size.label} ${locale} ?start=draft`;
	const { context, page, errors } = await openPage(browser, size, locale);
	try {
		await openBoard(page, '?start=draft');
		const purse = digits(await purseText(page));
		if (purse === '' || Number(purse) !== 0) {
			fail(`${name} purse`, `purse ${purse === '' ? '(none)' : `${purse} MD`}, expected 0 MD`);
		}
		assertNoPageErrors(errors, name);
		ok(`${name}: purse 0 MD`);
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
		await page.locator('figure.graphic .purse-value:visible').first().waitFor({ state: 'visible' });
		await settle(page);
		await page.screenshot({ path: join(OUT, `landing-${size.label}-${locale}.png`) });

		await assertNoHorizontalScroll(page, name);

		const live = page.locator('figure.graphic [role="button"][tabindex="0"]');
		const candidates = await live.count();
		if (candidates === 0) {
			fail(`${name} touchable example`, 'no role="button" group or focusable element inside the graphic that shows the purse');
		}
		const first = live.first();
		const before = (await first.evaluate((el) => el.closest('figure.graphic')?.querySelector('.purse-value')?.textContent ?? '')).trim();
		await first.click();
		try {
			await page.waitForFunction(
				(previous) =>
					Array.from(document.querySelectorAll('figure.graphic .purse-value')).some(
						(el) => (el.textContent ?? '').trim() !== previous
					),
				before,
				{ timeout: 5000 }
			);
		} catch {
			fail(`${name} touchable example`, `purse text stayed "${before}" after clicking the live example`);
		}
		const after = (await first.evaluate((el) => el.closest('figure.graphic')?.querySelector('.purse-value')?.textContent ?? '')).trim();
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
				await checkDraftStart(browser, size, locale);
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
