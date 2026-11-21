/**
 * Mobile and one-screen check for the citizen budget study and prototype.
 *
 * Drives a real browser at desktop and phone size, in English, French and Arabic:
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
	{ label: '1024x768', width: 1024, height: 768, dpr: 1 },
	{ label: '820x1180', width: 820, height: 1180, dpr: 1 },
	{ label: '390x844', width: 390, height: 844, dpr: 2 }
];
const LOCALES = ['en', 'fr', 'ar'] as const;
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

		if (size.width === 390) {
			const basket = page.locator('.board .basket-short');
			if (!(await basket.isVisible())) fail(`${name} basket caveat`, 'the basket sentence is not visible at 390');
			const hint = page.locator('.board .keep-hint');
			if (!(await hint.isVisible())) fail(`${name} keep hint`, 'the phone does not say what the tick does');
			if (!(await page.locator('.board .derived-short').isVisible())) fail(`${name} derived note`, 'the short derived note is not visible on a phone');
		} else {
			if (await page.locator('.board .derived-short').isVisible()) fail(`${name} derived note`, 'the short derived note duplicates the full definitions on desk');
			if (!(await page.locator('.board .legend-definitions').isVisible())) fail(`${name} derived note`, 'the full definitions are not visible on desk');
			const spans = (await page.locator('.board .legend-notes > span:visible').allInnerTexts())
				.map((s) => s.trim())
				.filter(Boolean);
			for (const a of spans) for (const b of spans) {
				if (a !== b && b.includes(a)) fail(`${name} legend repeat`, `"${a}" is printed inside another visible note`);
			}
			const deskLegend = (await page.locator('.board .legend-notes').innerText()).replace(/\s+/g, ' ');
			if (/change of basket|changement de panier|تغيّر السلة/i.test(deskLegend)) fail(`${name} basket claim`, 'the legend still claims a change of basket');
			/* French copy writes its own decimal comma and thin space grouping. */
			const bound = locale === 'fr' ? /7\s?617,4/ : /7,617\.4/;
			const worst = locale === 'fr' ? /177,6/ : /177\.6/;
			if (!bound.test(deskLegend)) fail(`${name} containment`, 'the desk legend does not state the containment bound');
			if (!worst.test(deskLegend)) fail(`${name} containment`, 'the desk legend does not state the 177.6 MD worst case');
			const conditional =
				locale === 'ar' ? /إذا كانت مذكرة/.test(deskLegend) : locale === 'fr' ? /si la note 2027 se situe/i.test(deskLegend) : /if the 2027 memo sits/i.test(deskLegend);
			if (!conditional) fail(`${name} containment`, 'the desk legend states containment as a fact, not an assumption');
		}

		const legendText = (await page.locator('.board .legend-notes').innerText()).replace(/\s+/g, ' ');
		const derivedWord = locale === 'ar' ? /مشتق/g : locale === 'fr' ? /dériv/gi : /derived/gi;
		const derivedCount = (legendText.match(derivedWord) ?? []).length;
		if (derivedCount !== 1) fail(`${name} derived note`, `the legend states the derived split ${derivedCount} times, not once`);

		// The explicit keep-draft control: Finish is disabled until a move or the tick.
		const finish = page.locator('.board .finish');
		if (!(await finish.isDisabled())) fail(`${name} keep gate`, 'Finish is enabled at the draft without a move or a tick');
		const keep = page.locator('.board .keep-choice input');
		await keep.check();
		if (await finish.isDisabled()) fail(`${name} keep gate`, 'Finish is still disabled after the keep-draft tick');
		await keep.uncheck();
		if (!(await finish.isDisabled())) fail(`${name} keep gate`, 'Finish is enabled after the keep-draft tick is cleared');

		if (size.width > 720) {
			await page.locator('.board [data-drop="education"]').click();
			await page.locator('.board .moves-buttons .take').click();
			await keep.check();
			await page.locator('.board .ghost').first().click();
			if (await keep.isChecked()) fail(`${name} undo keep`, 'the keep tick survives Undo after moves return');
		}

		// The detail panel: a subsidy line opens its 2026 programmes and can be set to 2024.
		await page.locator('.board [data-drop="subsidies_energy"]').click();
		const beforeSet = amount(await page.locator('.board [data-drop="subsidies_energy"] .yours').innerText());
		await page.locator('.board .details-toggle').click();
		await page.locator('.board .detail').waitFor({ state: 'visible' });
		const programmeRows = await page.locator('.board .detail-mission').count();
		if (programmeRows < 1) fail(`${name} detail`, 'the subsidy detail panel has no 2026 programme rows');
		const firstAction = (await page.locator('.board .detail-action:visible').first().innerText()).trim();
		const aidWord = locale === 'ar' ? /أداة نموذج أولي/ : locale === 'fr' ? /aide au prototype/i : /prototype aid/i;
		if (!aidWord.test(firstAction)) {
			fail(`${name} 2024 aid`, `the 2024 action reads "${firstAction}", not a prototype aid`);
		}
		if (locale === 'ar') {
			const pageRef = page.locator('.board .detail-page:visible').first();
			const pageText = (await pageRef.innerText()).trim();
			if (!pageText.startsWith('ص.')) fail(`${name} page label`, `the Arabic page reference is "${pageText}", not "ص."`);
		}
		if (size.label === '1280x800' || size.label === '1024x768') {
			const heading = page.locator('.board .detail-title:visible').first();
			const action = page.locator('.board .detail-action:visible').first();
			await heading.waitFor({ state: 'visible' });
			await action.waitFor({ state: 'visible' });
			const vp = page.viewportSize()!;
			const hb = await heading.boundingBox();
			const ab = await action.boundingBox();
			const inside = (b: { x: number; y: number; width: number; height: number } | null) =>
				!!b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1;
			if (!inside(hb) || !inside(ab)) {
				fail(`${name} detail in view`, `heading ${JSON.stringify(hb)} action ${JSON.stringify(ab)} viewport ${vp.width}x${vp.height}`);
			}
		}
		await page.locator('.board .detail-action').first().click();
		const afterSet = amount(await page.locator('.board [data-drop="subsidies_energy"] .yours').innerText());
		if (afterSet === beforeSet) fail(`${name} detail`, `set to 2024 left the line at ${beforeSet} MD`);
		const setMessage = (await page.locator('.board .message').innerText()).trim();
		if (!setMessage.includes('7,209.3')) fail(`${name} set message`, `the status says "${setMessage}", not the target level`);
		await page.locator('.board .details-toggle').click();

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

		// Past years: one compared year as a real bar in every row, three bars per
		// row, and the chart icon opens the trajectory. The dots are gone.
		const rowsShown = await page.locator('.board [data-drop]:not([data-drop="purse"])').count();
		const pastBars = await page.locator('.board .slot .bar.year').count();
		if (rowsShown !== 27 || pastBars !== 27) fail(`${name} past years`, `${rowsShown} systems, ${pastBars} past bars, expected 27 systems and one compared bar each`);
		if ((await page.locator('.board .slot .past-dot').count()) !== 0) fail(`${name} past years`, 'the old dots are still drawn');
		const legendKeys = (await page.locator('.board .legend .key').allInnerTexts()).map((s) => s.trim());
		if (legendKeys.length !== 3) fail(`${name} legend`, `${legendKeys.length} legend keys, expected three: the past year, the 2027 draft, yours`);
		if (!legendKeys.some((k) => /20\d\d/.test(k))) fail(`${name} legend`, `no legend key names the compared year: ${legendKeys.join(' | ')}`);
		// The chart: the chosen line across every adopted year and the draft, plus yours.
		const chartButton = size.width <= 720 ? page.locator('.board .years-tool') : page.locator('.board .chart-btn');
		await chartButton.click();
		const sheet = page.locator('.board .chart-overlay');
		await sheet.waitFor({ state: 'visible' });
		const points = await sheet.locator('.plot .dot').count();
		const chips = await sheet.locator('.chips .chip').count();
		if (points !== 8 || chips !== 6) fail(`${name} chart`, `${points} points and ${chips} year chips, expected 8 points (six laws, the draft, yours) and 6 chips`);
		const figure = (await sheet.locator('.figure').innerText()).replace(/\s+/g, ' ');
		const chartAudit = (await sheet.locator('.verify').innerText()).replace(/\s+/g, ' ');
		if (!/JORT|الرائد/.test(chartAudit)) fail(`${name} chart`, `the chart carries no JORT page: "${chartAudit}"`);
		if ((await sheet.locator('.plot .val.mine').count()) !== 1) fail(`${name} chart`, 'the citizen point has no value label');
		const mineLabel = ((await sheet.locator('.plot .val.mine').textContent()) ?? '').trim();
		if (!/\d/.test(mineLabel)) fail(`${name} chart`, 'the citizen point label carries no number');
		if (!figure.includes(mineLabel)) fail(`${name} chart`, `the summary "${figure}" does not carry the citizen's amount ${mineLabel}`);
		// A phone picks the compared year inside the chart; a desk switches it on the chip row.
		const pick = size.width <= 720 ? sheet.locator('.chips .chip').nth(0) : page.locator('.board .legend .year').nth(0);
		const beforePick = await page.locator('.board .slot .bar.year').count();
		if (size.width <= 720) {
			await pick.click();
			await sheet.locator('.detail-close').click();
			await sheet.waitFor({ state: 'hidden' });
			if ((await page.locator('.board .slot .bar.year').count()) !== beforePick) fail(`${name} past years`, 'picking a year in the chart dropped the row bars');
		} else {
			await page.locator('.board .chart-overlay .detail-close').click();
			await sheet.waitFor({ state: 'hidden' });
			const firstYear = page.locator('.board .legend .year').nth(0);
			if ((await firstYear.getAttribute('aria-pressed')) === 'true') {
				await firstYear.click();
				if ((await page.locator('.board .slot .bar.year').count()) !== 0) fail(`${name} past years`, 'clearing the compared year left bars behind');
				await firstYear.click();
			}
			if ((await page.locator('.board .slot .bar.year').count()) !== beforePick) fail(`${name} past years`, 'switching the year dropped the row bars');
		}
		// The JORT audit: every compared cell names its page, and a derived cell says it is derived.
		const jortWord = locale === 'ar' ? 'الرائد' : 'JORT';
		const derivedWording = locale === 'ar' ? 'مشتقّ' : locale === 'fr' ? 'Dérivé' : 'Derived';
		const educationAria = (await page.locator('#sys-education').getAttribute('aria-label')) ?? '';
		if (!educationAria.includes(jortWord)) fail(`${name} audit`, `the row aria carries no JORT page: "${educationAria}"`);
		const pageMark = locale === 'ar' ? 'ص.' : 'p.';
		if (!educationAria.includes(pageMark)) fail(`${name} audit`, `the row aria carries no page number: "${educationAria}"`);
		const restAria = (await page.locator('#sys-rest').getAttribute('aria-label')) ?? '';
		if (!restAria.includes(derivedWording)) fail(`${name} audit`, `the derived line does not say it is derived: "${restAria}"`);
		if (!restAria.includes(jortWord)) fail(`${name} audit`, `the derived line carries no JORT page: "${restAria}"`);
		const barTitle = (await page.locator('#sys-education .bars').getAttribute('title')) ?? '';
		if (!barTitle.includes(jortWord)) fail(`${name} audit`, `the compared bar's hover label carries no JORT page: "${barTitle}"`);
		// The one single read, named in the detail panel, at desk width where the chips are reachable.
		if (size.width > 720) {
			await page.locator('.board .legend .year', { hasText: '2024' }).click();
			await page.locator('.board [data-drop="rest"]').click();
			await page.locator('.board .details-toggle').click();
			await page.locator('.board .detail-verify').waitFor({ state: 'visible' });
			const verify = (await page.locator('.board .detail-verify').innerText()).replace(/\s+/g, ' ');
			const singleWord = locale === 'ar' ? 'مرة واحدة' : locale === 'fr' ? 'une seule fois' : 'read once';
			if (!verify.includes(singleWord)) fail(`${name} audit`, `the 2024 remainder does not say one read once: "${verify.slice(0, 160)}"`);
			if (!/Constitution|الدستورية/.test(verify)) fail(`${name} audit`, `the single read is not named: "${verify.slice(0, 160)}"`);
			await page.locator('.board .detail-close').click();
			await page.locator('.board .legend .year', { hasText: '2026' }).click();
		}

		// Names: no mid-word break and no more than two lines at any tested width.
		const nameIssues = await page.evaluate(() => {
			const out: string[] = [];
			for (const el of Array.from(document.querySelectorAll<HTMLElement>('.board .slot .name'))) {
				const cs = getComputedStyle(el);
				const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.15;
				const lines = el.clientHeight / lineHeight;
				const label = (el.textContent ?? '').trim();
				if (lines > 2.1) out.push(`${label}: ${lines.toFixed(1)} lines`);
				const meas = document.createElement('span');
				meas.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit;';
				el.appendChild(meas);
				let widest = 0;
				for (const word of label.split(/\s+/)) {
					meas.textContent = word;
					widest = Math.max(widest, meas.getBoundingClientRect().width);
				}
				meas.remove();
				if (widest > el.clientWidth + 1) out.push(`${label}: word ${widest.toFixed(1)}px > box ${el.clientWidth}px`);
			}
			return out;
		});
		if (nameIssues.length > 0) fail(`${name} names`, nameIssues.join(' | '));

		assertNoPageErrors(errors, name);
		ok(`${name}: board visible, no page scroll (${m.scrollHeight}/${m.innerHeight}), no h-scroll, purse ${purse} MD${touch}, 27 systems with a compared year bar, a chart of 8 points, names at most 2 lines and no mid-word breaks`);
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
		const receiptHref = await page.locator('.game .receipt-link').getAttribute('href');
		if (!receiptHref?.startsWith('/research/citizen-budget#')) {
			fail(`${name} receipt link`, `the prototype receipt links to ${receiptHref}, not a static study-page section`);
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

		const method = (await page.locator('#sec-method').innerText()).replace(/\s+/g, ' ');
		const floorPending =
			locale === 'ar'
				? /تعديل مقترح/.test(method) && /بانتظار تأكيد/.test(method) && /الحدّ الأدنى/.test(method) && !/سقف 300/.test(method)
				: locale === 'fr'
					? /amendement proposé/i.test(method) && /attente de la confirmation/i.test(method)
					: /proposed amendment/i.test(method) && /pending the owner/i.test(method);
		if (!floorPending) fail(`${name} floor status`, 'the method does not mark the 300 floor as a proposed amendment pending the owner');

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

		// The figures table: adopted cells carry their page, and the 2024 remainder is marked 1.
		await page.locator('#sec-figures table.figures').scrollIntoViewIfNeeded();
		const cellTitle = (await page.locator('#sec-figures table.figures tbody tr td.past').first().getAttribute('title')) ?? '';
		if (!/JORT|الرائد/.test(cellTitle)) fail(`${name} figures audit`, `an adopted cell carries no JORT page: "${cellTitle}"`);
		if (size.width > 640) {
			const marked = await page.locator('#sec-figures table.figures td.past .ck-single').count();
			if (marked !== 1) fail(`${name} figures audit`, `${marked} cells carry the single-read mark, expected one`);
			const derivedCells = await page.locator('#sec-figures table.figures td.past[data-check="derived"]').count();
			if (derivedCells !== 13) fail(`${name} figures audit`, `${derivedCells} derived cells, expected 13`);
		}
		const auditNote = (await page.locator('#sec-figures p.note').allInnerTexts()).join(' ');
		if (!/215/.test(auditNote) || !/212/.test(auditNote)) fail(`${name} figures audit`, 'the figures table does not state the audit counts');

		assertNoPageErrors(errors, name);
		ok(`${name}: no h-scroll, live example moved the purse ${before} -> ${after}, figures table carries the audit`);
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
