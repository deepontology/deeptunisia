/**
 * Phone layout gate for the citizen budget landing.
 *
 * At 390 by 844 the page must read edge to edge: one 16 px gutter on each
 * side, the ruler gone, every section the full content width, nothing wider
 * than the window, and no text cut off. The same checks run in en and ar,
 * because a right-to-left page wraps differently.
 *
 * Run against a built preview server: npx tsx scripts/check-landing-phone.ts
 * Exits 1 on the first failing group, after printing every check.
 */
import { chromium } from 'playwright';

/** The built preview by default; LANDING_URL lets a dev server be checked too. */
const BASE = process.env.LANDING_URL ?? 'http://localhost:4173/research/citizen-budget';
const VIEWPORT = { width: 390, height: 844 };
/** The one gutter: 16 px on each side. */
const GUTTER = 32;
/** A section may lose a little to the scrollbar, but not more than a tenth. */
const MIN_SHARE = 0.9;

const SECTIONS = [
	'sec-question',
	'sec-board',
	'sec-figures',
	'sec-method',
	'sec-questions',
	'sec-stored',
	'sec-cannot',
	'sec-record',
	'sec-take'
];

const LANGS = [
	{ lang: 'en', locale: 'en-US' },
	{ lang: 'ar', locale: 'ar-TN' }
];

let failed = false;

function pass(line: string) {
	console.log(`PASS  ${line}`);
}

function fail(line: string) {
	failed = true;
	console.log(`FAIL  ${line}`);
}

function report(ok: boolean, line: string) {
	if (ok) pass(line);
	else fail(line);
}

async function main() {
	const browser = await chromium.launch();

	for (const { lang, locale } of LANGS) {
		const context = await browser.newContext({ viewport: VIEWPORT, locale });
		const page = await context.newPage();

		await page.goto(BASE, { waitUntil: 'networkidle' });
		// The locale is restored on the client, so wait for the document to
		// carry it before measuring anything.
		await page
			.waitForFunction((want) => document.documentElement.lang === want, lang, { timeout: 10_000 })
			.catch(() => fail(`[${lang}] document lang never became "${lang}"`));
		await page.waitForSelector(`#${SECTIONS[0]}`, { state: 'attached' });

		const layout = await page.evaluate(
			({ ids, gutter, minShare }) => {
				const vw = window.innerWidth;
				const available = vw - gutter;
				const scroll = document.querySelector<HTMLElement>('.scroll');
				const scrollBox = scroll?.getBoundingClientRect();
				const textSelector =
					'p, h1, h2, h3, li, dt, dd, th, td, figcaption, .kicker, .formula, .note, .cover-title, .cover-hook, .cover-tagline, .cover-line, .cover-meta, .cover-kicker, .secbar-now, .share-btn, svg text';
				const seen = new Set<Element>();

				const sections = ids.map((id) => {
					const el = document.getElementById(id);
					if (!el) return { id, width: 0, right: 0 };
					const r = el.getBoundingClientRect();
					return { id, width: r.width, right: r.right };
				});

				const cover = document.querySelector<HTMLElement>('.cover');
				const coverWidth = cover?.getBoundingClientRect().width ?? 0;

				const clipped: string[] = [];
				const where =
					scrollBox ??
					({
						left: 0,
						right: vw
					} as DOMRect);
				for (const el of document.querySelectorAll<HTMLElement>(textSelector)) {
					if (seen.has(el)) continue;
					seen.add(el);
					if (el.closest('.sr-only') || el.getAttribute('aria-hidden') === 'true') continue;
					const rect = el.getBoundingClientRect();
					if (rect.width === 0 && rect.height === 0) continue;
					const overBox = el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
					const outOfView = rect.left < where.left - 1 || rect.right > where.right + 1;
					if (overBox || outOfView) {
						const tag = el.tagName.toLowerCase();
						const label = (el.textContent ?? '').trim().slice(0, 40);
						clipped.push(`${tag} "${label}"${overBox ? ' (overflows its box)' : ''}${outOfView ? ' (outside the page)' : ''}`);
					}
				}

				return {
					viewport: vw,
					available,
					minShare,
					docWidth: document.documentElement.scrollWidth,
					scrollWidth: scroll?.scrollWidth ?? 0,
					scrollClient: scroll?.clientWidth ?? 0,
					sections,
					coverWidth,
					checked: seen.size,
					clipped
				};
			},
			{ ids: SECTIONS, gutter: GUTTER, minShare: MIN_SHARE }
		);

		report(
			layout.docWidth <= layout.viewport,
			`[${lang}] document scrollWidth ${layout.docWidth} <= innerWidth ${layout.viewport}`
		);
		report(
			layout.scrollWidth <= layout.scrollClient + 1,
			`[${lang}] page scrollWidth ${layout.scrollWidth} <= clientWidth ${layout.scrollClient}`
		);

		const floor = layout.available * layout.minShare;
		for (const section of layout.sections) {
			report(
				section.width > 0 && section.width >= floor,
				`[${lang}] ${section.id} width ${Math.round(section.width)} >= ${Math.round(floor)} (90% of ${layout.available})`
			);
		}
		report(
			layout.coverWidth > 0 && layout.coverWidth >= floor,
			`[${lang}] cover width ${Math.round(layout.coverWidth)} >= ${Math.round(floor)}`
		);

		if (layout.clipped.length === 0) {
			report(true, `[${lang}] no text clipped (${layout.checked} text elements)`);
		} else {
			report(false, `[${lang}] ${layout.clipped.length} text element(s) clipped: ${layout.clipped.join('; ')}`);
		}

		await context.close();
	}

	await browser.close();
	process.exit(failed ? 1 : 0);
}

main().catch((error) => {
	fail(`could not run the check: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
