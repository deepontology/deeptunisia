/* ============================================================================
   scripts/verify-tour.cjs — browser checks for the guided tour
   ============================================================================

   Needs the app running, because the tour is a thing that happens to a real
   shell at a real size:

       npm run dev
       node scripts/verify-tour.cjs

   It asserts the behaviour the tour was asked for and the behaviour that makes
   it defensible: that it appears once and then never again, that clearing site
   data brings it back, that Skip is on every step and ends it immediately, that
   the app underneath is inert while it is up, that the spotlight actually moves,
   that ?tour=1 replays it and then removes itself from the URL, and that all of
   it exists in French and Arabic with the document flipped to RTL.

   Screenshots go to SHOT_DIR (default: the OS temp directory).
   ============================================================================ */
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const OUT = (process.env.SHOT_DIR || path.join(os.tmpdir(), 'dt-tour-shots')) + path.sep;
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : undefined);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const ok = (c, n, d = '') => { c ? pass++ : (fail++, console.log('FAIL: ' + n + (d ? ' — ' + d : ''))); };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);            // boot screen
  await page.waitForSelector('.card[role="dialog"]', { timeout: 12000 });
  ok(true, 'tour appears on a first visit');

  const steps = await page.evaluate(() => document.querySelectorAll('.dots i').length);
  console.log('steps:', steps);
  ok(steps === 9, 'nine steps at desktop width, got ' + steps);

  // walk it, screenshotting each step and checking the spotlight actually moves
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const spot = document.querySelector('.spot');
      const r = spot && !spot.classList.contains('flat') ? spot.getBoundingClientRect() : null;
      return {
        title: document.querySelector('.card h2').textContent,
        progress: document.querySelector('.card .progress').textContent,
        box: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
        skip: !!document.querySelector('.card .skip')
      };
    });
    boxes.push(s.box);
    ok(s.skip, 'step ' + (i + 1) + ' offers Skip');
    console.log(' ', s.progress, '|', s.title, '|', JSON.stringify(s.box));
    await page.screenshot({ path: OUT + 'T' + String(i + 1).padStart(2, '0') + '.png' });
    if (i < steps - 1) await page.locator('.card .go').click();
  }
  const spotted = boxes.filter(Boolean);
  ok(spotted.length === 7, 'seven steps spotlight a control, got ' + spotted.length);
  ok(new Set(spotted.map(String)).size === 7, 'the spotlight moves every time');

  /* The app underneath must be inert while the tour is up: a reader who scrubs
     the timeline mid-step reads a caption about a control that has moved. */
  const blocked = await page.evaluate(() => {
    const el = document.elementFromPoint(24, 22);
    return !!(el && el.classList.contains('catch'));
  });
  ok(blocked, 'the app underneath is inert while the tour is up');

  await page.locator('.card .go').click();     // final step -> finish
  await page.waitForTimeout(400);
  ok(await page.locator('.card[role="dialog"]').count() === 0, 'finishing closes it');

  // once per reader
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  ok(await page.locator('.card[role="dialog"]').count() === 0, 'does not return on a reload');
  await page.goto('http://localhost:5173/network', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(await page.locator('.card[role="dialog"]').count() === 0, 'does not return on navigation');

  // ?tour=1 replays it, and strips itself
  await page.goto('http://localhost:5173/?tour=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  ok(await page.locator('.card[role="dialog"]').count() === 1, '?tour=1 replays it');
  ok(!page.url().includes('tour='), '?tour=1 strips itself from the URL', page.url());

  // Skip on step 1 ends it
  await page.locator('.card .skip').click();
  await page.waitForTimeout(300);
  ok(await page.locator('.card[role="dialog"]').count() === 0, 'Skip ends it immediately');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  ok(await page.locator('.card[role="dialog"]').count() === 0, 'Skip counts as seen');

  // clearing storage brings it back — the stated requirement
  await ctx.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  ok(await page.locator('.card[role="dialog"]').count() === 1, 'clearing storage brings it back');
  ok(await page.locator('.card .skip').count() === 1, 'and it still offers Skip');

  // Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await page.locator('.card[role="dialog"]').count() === 0, 'Escape closes it');

  // three languages
  for (const [loc, dir] of [['fr','ltr'],['ar','rtl']]) {
    /* The language has to be set BEFORE the tour opens: while it is up the
       catcher swallows every click aimed at the app, which is the point. */
    await page.evaluate((l) => {
      localStorage.removeItem('deeptunisia:tour');
      localStorage.setItem('deeptunisia:locale', l);
    }, loc);
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const s = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      title: document.querySelector('.card h2').textContent,
      body: document.querySelector('.card .body').textContent.slice(0, 60),
      next: document.querySelector('.card .go').textContent.trim(),
      skip: document.querySelector('.card .skip').textContent.trim(),
      prog: document.querySelector('.card .progress').textContent.trim()
    }));
    console.log(loc, JSON.stringify(s));
    ok(s.dir === dir, loc + ' sets dir');
    ok(!/^You are inside/.test(s.title), loc + ' translates the step title', s.title);
    ok(!/^Next$/.test(s.next), loc + ' translates the buttons', s.next);
    ok(!/\{\w+\}/.test(s.prog), loc + ' substitutes the progress counter', s.prog);
    await page.locator('.card .go').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + 'T-' + loc + '.png' });
    await page.locator('.card .skip').click();
  }

  // mobile: the dial step must survive as the filters button
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await m.evaluate(() => localStorage.removeItem('deeptunisia:tour'));
  await m.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await m.waitForTimeout(2600);
  const mob = await m.locator('.card[role="dialog"]').count();
  ok(mob === 1, 'tour runs on a phone');
  if (mob) {
    const n = await m.evaluate(() => document.querySelectorAll('.dots i').length);
    console.log('mobile steps:', n);
    ok(n >= 7, 'mobile keeps at least seven steps, got ' + n);
    for (let i = 0; i < 4; i++) { await m.locator('.card .go').click(); await m.waitForTimeout(450); }
    await m.screenshot({ path: OUT + 'T-mobile.png' });
    const hasFilters = await m.evaluate(() => !!document.querySelector('[data-tour="filters"]'));
    ok(hasFilters, 'the filters button stands in for the dial on a phone');
  }

  ok(errs.length === 0, 'clean console', errs.join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
