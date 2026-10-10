/**
 * study-workbench-check — the rater workbench in a real browser.
 *
 * test-study.ts pins what reaches the page. This drives the page the way a
 * rater would and checks what leaves it: grading by keyboard, progress that
 * survives a reload, an export that study-kappa.ts reads without loss, an
 * import that refuses another instrument's rows, keyboard activation of the
 * controls, and a page that cannot make a network request. Like `npm run
 * smoke`, it needs a browser and is not part of `npm run test`.
 *
 * Usage:
 *   npx tsx scripts/study-workbench-check.ts
 *   SMOKE_CHROMIUM=/usr/bin/chromium npx tsx scripts/study-workbench-check.ts
 *   npx tsx scripts/study-workbench-check.ts --shots <dir>   # also save screenshots
 */
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildWorkbench } from './study-workbench.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = join(ROOT, 'research/study/dry-run/raters/rater-b.json');
const RUBRIC = join(ROOT, 'research/study/rubric-v2.md');
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx !== -1 ? process.argv[shotsIdx + 1] : undefined;

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const work = mkdtempSync(join(tmpdir(), 'dt-workbench-'));
const raw = JSON.parse(readFileSync(SAMPLE, 'utf8')) as { prompts: { study_id: string; claim: string; [k: string]: unknown }[] };
const built = buildWorkbench({ prompts: raw.prompts, rater: 'Rater B', rubricMd: readFileSync(RUBRIC, 'utf8') });
const page = join(work, 'rater-b.html');
writeFileSync(page, built.html);
const N = raw.prompts.length;
console.log(`Workbench check — ${N} records, instrument ${built.fingerprint}`);

const browser = await chromium.launch(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : undefined);
const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
const tab = await context.newPage();
const errors: string[] = [];
tab.on('pageerror', (e) => errors.push(String(e)));
tab.on('console', (m) => {
	if (m.type() === 'error' && !/Content Security Policy|Refused to connect/.test(m.text())) errors.push(m.text());
});
await tab.goto(pathToFileURL(page).href);

ok('the first record renders with its sources', (await tab.locator('#claim').innerText()).length > 10 && (await tab.locator('#sources li').count()) > 0);
ok('progress starts at zero', (await tab.locator('#count').innerText()) === `0 / ${N} graded`);

// A failed fetch alone proves nothing from file:// (CORS would refuse it too);
// the request must be stopped by the page's own policy, before it is sent.
const violation = await tab.evaluate(async () => {
	let directive = '';
	document.addEventListener('securitypolicyviolation', (e) => (directive = e.effectiveDirective));
	try {
		await fetch('https://example.org/');
	} catch {
		/* expected */
	}
	await new Promise((r) => setTimeout(r, 50));
	return directive;
});
ok('the page policy blocks every network request', violation === 'connect-src', violation || 'no violation reported');

// Grade every record by keyboard. Record 1 gets a note that exercises CSV quoting
// and Arabic; record 2 is marked unsure on confidence.
const CONF = ['A', 'B', 'C', 'D'];
const NOTE = 'Two lineages, "same wire"?, التعيين غير مؤكد\nsecond line';
for (let i = 0; i < N; i++) {
	if (i === 1) await tab.keyboard.press('x');
	else await tab.keyboard.press(CONF[i % 4].toLowerCase());
	await tab.keyboard.press(String((i % 4) + 1));
	if (i === 0) {
		await tab.keyboard.press('n');
		await tab.keyboard.type(NOTE);
		await tab.keyboard.press('Escape');
	}
	await tab.keyboard.press('ArrowRight');
}
ok('every record graded by keyboard', (await tab.locator('#count').innerText()) === `${N} / ${N} graded`);
ok('the completion banner shows', await tab.locator('#banner').isVisible());

if (SHOTS) {
	mkdirSync(SHOTS, { recursive: true });
	await tab.keyboard.press('ArrowLeft');
	await tab.screenshot({ path: join(SHOTS, 'desktop-light.png'), fullPage: false });
	await tab.emulateMedia({ colorScheme: 'dark' });
	await tab.screenshot({ path: join(SHOTS, 'desktop-dark.png'), fullPage: false });
	await tab.keyboard.press('r');
	await tab.waitForTimeout(250);
	await tab.screenshot({ path: join(SHOTS, 'rubric-dark.png'), fullPage: false });
	await tab.keyboard.press('Escape');
	await tab.emulateMedia({ colorScheme: 'light' });
}

await tab.reload();
ok('progress survives a reload', (await tab.locator('#count').innerText()) === `${N} / ${N} graded`);

// Keyboard access: Enter belongs to the focused control. On the Rubric button
// it opens the drawer; on the drawer's Close button it closes it. The page-wide
// Enter shortcut must not run instead.
await tab.locator('#open-rubric').focus();
await tab.keyboard.press('Enter');
await tab.waitForTimeout(100);
ok('Enter opens the rubric from its button', (await tab.locator('#drawer.open').count()) === 1);
await tab.keyboard.press('Enter');
await tab.waitForTimeout(100);
ok('Enter closes the rubric from its button', (await tab.locator('#drawer.open').count()) === 0);

const [download] = await Promise.all([tab.waitForEvent('download'), tab.click('#export')]);
const csvPath = join(work, download.suggestedFilename());
await download.saveAs(csvPath);
const csv = readFileSync(csvPath, 'utf8');
const lines = csv.trim().split('\n');
ok('the export is named for the rater and the instrument', download.suggestedFilename() === `rater-b-${built.fingerprint}.csv`, download.suggestedFilename());
ok('the export has a header and one row per record', lines[0] === 'study_id,kind,confidence,basis,notes,instrument' && lines.length === N + 1, `${lines.length} lines`);
ok('every exported row carries the page instrument fingerprint', lines.slice(1).every((l) => l.endsWith(',' + built.fingerprint)), built.fingerprint);
ok('a note with a newline stays on one row', !csv.includes('\nsecond line'));
ok('unsure is written as unsure', lines.some((l) => /^S\d+,[^,]+,unsure,/.test(l)));
ok('the export carries no record id', !raw.prompts.some((p) => csv.includes(String((p as Record<string, unknown>).id))));

// Enter on the focused Export button downloads; the shortcut must not move records.
let keyboardExport = '';
try {
	const [kbd] = await Promise.all([
		tab.waitForEvent('download', { timeout: 3000 }),
		(async () => { await tab.locator('#export').focus(); await tab.keyboard.press('Enter'); })()
	]);
	keyboardExport = kbd.suggestedFilename();
} catch {
	/* no download within the timeout: reported below */
}
ok('Enter activates the focused Export button', keyboardExport === `rater-b-${built.fingerprint}.csv`, keyboardExport || 'no download');

// A rebuilt page under a revised rubric must not restore grades made under the
// old one. Seed the revised page's storage with the old instrument's saved
// state, then load it: only a fingerprint that covers the rubric ignores it.
const revisedRubric = readFileSync(RUBRIC, 'utf8') + '\n\n**Revision for the check.**\n';
const revisedBuild = buildWorkbench({ prompts: raw.prompts, rater: 'Rater B', rubricMd: revisedRubric });
const revisedPage = join(work, 'rater-b-revised-rubric.html');
writeFileSync(revisedPage, revisedBuild.html);
const tab3 = await context.newPage();
await tab3.goto(pathToFileURL(revisedPage).href);
const oldState = await tab.evaluate((key) => localStorage.getItem(key), `dt-study:${built.fingerprint}:Rater B`);
await tab3.evaluate((s) => localStorage.setItem(s.key, s.value), { key: `dt-study:${built.fingerprint}:Rater B`, value: oldState ?? '' });
await tab3.reload();
ok('a revised rubric does not restore the old page\'s progress', (await tab3.locator('#count').innerText()) === `0 / ${N} graded`, (await tab3.locator('#count').innerText()));
await tab3.close();

// study-kappa reads it: run it on the export against a copy with one grade changed.
const other = join(work, 'other.csv');
writeFileSync(other, csv.replace(/^(S\d+,[^,]+,)A,/m, '$1B,'));
let kappaOut = '';
try {
	kappaOut = execFileSync('npx', ['tsx', join(ROOT, 'scripts/study-kappa.ts'), '--raters', `${csvPath},${other}`, '--out', join(work, 'kappa.json')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
	kappaOut = String((e as { stdout?: string }).stdout ?? e);
}
const kappa = JSON.parse(readFileSync(join(work, 'kappa.json'), 'utf8')) as Record<string, unknown>;
ok('study-kappa reads the export', /: 10 rows/.test(kappaOut) && kappa !== null, kappaOut.split('\n').find((l) => /rows/.test(l))?.trim());

// Import: another instrument's file is refused whole; this one's is applied.
await tab.evaluate((key) => localStorage.removeItem(key), `dt-study:${built.fingerprint}:Rater B`);
await tab.reload();
const foreign = join(work, 'foreign.csv');
writeFileSync(foreign, 'study_id,kind,confidence,basis,notes,instrument\nS999,position,A,documented,,0123456789ab\n');
await tab.setInputFiles('#import-file', foreign);
await tab.waitForTimeout(200);
ok('a CSV stamped with another instrument is refused', /refused/i.test(await tab.locator('#status').innerText()) && (await tab.locator('#count').innerText()) === `0 / ${N} graded`);

// An export from before the instrument column existed cannot be matched to any
// page, so it is refused rather than applied to whatever claims share its ids.
const legacy = join(work, 'legacy.csv');
writeFileSync(legacy, [lines[0].replace(',instrument', '')].concat(lines.slice(1).map((l) => l.replace(/,[0-9a-f]{12}$/, ''))).join('\n') + '\n');
await tab.setInputFiles('#import-file', legacy);
await tab.waitForTimeout(200);
ok('an export without the instrument column is refused', /refused/i.test(await tab.locator('#status').innerText()) && (await tab.locator('#count').innerText()) === `0 / ${N} graded`);

// Two different samples both start at S001, so their ids overlap; the
// fingerprint, not the ids, decides whether the grades belong to this page.
const otherPrompts = raw.prompts.map((p, i) => ({ ...p, claim: `Sample two, record ${i + 1}: ${p.claim}` }));
const built2 = buildWorkbench({ prompts: otherPrompts, rater: 'Rater B', rubricMd: readFileSync(RUBRIC, 'utf8') });
ok('two samples with the same study_ids are different instruments', built2.fingerprint !== built.fingerprint, `${built.fingerprint} vs ${built2.fingerprint}`);
const page2 = join(work, 'rater-b-sample-two.html');
writeFileSync(page2, built2.html);
const tab2 = await context.newPage();
await tab2.goto(pathToFileURL(page2).href);
await tab2.setInputFiles('#import-file', csvPath);
await tab2.waitForTimeout(200);
ok('an export from the overlapping sample is refused', /refused/i.test(await tab2.locator('#status').innerText()) && (await tab2.locator('#count').innerText()) === `0 / ${N} graded`);
await tab2.close();

// Enter still reaches the page shortcut when no control has focus.
await tab.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
await tab.keyboard.press('Enter');
await tab.waitForTimeout(100);
ok('Enter on the page moves to the next ungraded record', /^2 of /.test(await tab.locator('#position').innerText()), await tab.locator('#position').innerText());

await tab.setInputFiles('#import-file', csvPath);
await tab.waitForTimeout(200);
ok('the rater can resume from an exported CSV', (await tab.locator('#count').innerText()) === `${N} / ${N} graded`);
await tab.locator('#index-list button').first().click();
ok('the imported note is restored', (await tab.locator('#notes').inputValue()).startsWith('Two lineages, "same wire"?, التعيين'));

// Phone width: no horizontal scroll.
const phone = await browser.newContext({ viewport: { width: 375, height: 800 } });
const ptab = await phone.newPage();
await ptab.goto(pathToFileURL(page).href);
const overflow = await ptab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal scroll at phone width', overflow <= 0, `${overflow}px`);
if (SHOTS) await ptab.screenshot({ path: join(SHOTS, 'phone-light.png'), fullPage: true });

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();

console.log(`\n${checks - failures}/${checks} workbench checks passed`);
if (failures > 0) process.exit(1);
