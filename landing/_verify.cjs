/* ============================================================================
   landing/_verify.cjs - browser checks for the landing page
   ============================================================================

   Run it against the built site (`npx vite preview`) or a static server
   rooted at the repo:

       LANDING_URL=http://localhost:4173/ node landing/_verify.cjs
       py -3 -m http.server 4810 && node landing/_verify.cjs

   It asserts what would fail silently: the page fits about eight phone
   screens with the long read closed; the hero, its subline and the primary
   button are on the first screen; nothing overflows horizontally at 390, 820
   or 1440, in English or Arabic; the ribbon is drawn from DENSITY; a language
   switch keeps every figure; the default theme is dark and a choice persists;
   reduced motion runs no animation; and the page requests nothing from
   another origin.

   Screenshots go to SHOT_DIR (default: the OS temp directory) so they never
   land in the repo.
   ============================================================================ */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const OUT = (process.env.SHOT_DIR || path.join(os.tmpdir(), 'dt-landing-shots')) + path.sep;
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.LANDING_URL || 'http://localhost:4810/landing/index.html';
const ORIGIN = new globalThis.URL(URL).origin;

const PHONE = { width: 390, height: 844 };
const MAX_PHONE_HEIGHT = 7000;

let failures = 0;
let checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (cond) console.log('  ok    ' + name + (detail ? ' — ' + detail : ''));
  else {
    failures++;
    console.error('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
  }
}

async function open(browser, viewport, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: viewport, deviceScaleFactor: 1 }, opts || {}));
  const page = await ctx.newPage();
  const errs = [];
  const foreign = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && !u.startsWith(ORIGIN)) foreign.push(u);
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  return { ctx, page, errs, foreign };
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const browser = await chromium.launch();

  /* ---- phone, English, defaults ------------------------------------- */
  {
    const { ctx, page, errs, foreign } = await open(browser, PHONE, { locale: 'en-GB' });
    ok('default theme is dark', (await page.getAttribute('html', 'data-theme')) === 'dark');
    ok('the long read is closed on a phone', !(await page.evaluate(() => document.getElementById('long').open)));

    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    ok('the page is at most ' + MAX_PHONE_HEIGHT + 'px at 390 wide', h <= MAX_PHONE_HEIGHT, h + 'px, ' + (h / PHONE.height).toFixed(1) + ' screens');

    const fold = await page.evaluate(() => {
      const bottom = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().bottom : Infinity; };
      return { h1: bottom('.hero .display'), lede: bottom('.hero .lede'), cta: bottom('.hero .ctas .enter') };
    });
    ok('the title, subline and primary button are on the first screen', fold.h1 <= PHONE.height && fold.lede <= PHONE.height && fold.cta <= PHONE.height, JSON.stringify(fold));
    ok('no horizontal overflow at 390', (await overflow(page)) <= 0);

    const ribbon = await page.evaluate(() => {
      const poly = document.querySelector('#ribbon polygon');
      return { points: poly ? poly.getAttribute('points').trim().split(/\s+/).length : 0, ruptures: document.querySelectorAll('#ribbon .ribbon-rupture').length };
    });
    const density = await page.evaluate(() => {
      const m = document.documentElement.innerHTML.match(/var DENSITY = (\[[^\]]*\]);/);
      return m ? JSON.parse(m[1]).length : 0;
    });
    ok('the ribbon is drawn from DENSITY', density > 0 && ribbon.points === density * 2, ribbon.points + ' points for ' + density + ' years');
    ok('the ribbon marks the four ruptures', ribbon.ruptures === 4);

    ok('three doors, to the Chronicle, Now and Network', JSON.stringify(await page.$$eval('.door', (as) => as.map((a) => a.getAttribute('href')))) === JSON.stringify(['/chronicle', '/now', '/network']));
    ok('each door carries a drawn thumbnail', (await page.$$eval('.door svg.thumb', (s) => s.filter((x) => x.childElementCount > 0).length)) === 3);
    const idx = await page.$$eval('#indexes .index-card', (cs) => cs.map((c) => c.textContent));
    ok('the indexes section is absent or honest', idx.every((t) => !/\d+\/100/.test(t) || /among respondents/.test(t)), idx.length + ' card(s)');

    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('a, button, summary')]
        .filter((e) => e.offsetParent !== null && !e.closest('.longread, .colophon, .ribbon'))
        .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), h: e.getBoundingClientRect().height }))
        .filter((r) => r.h < 32)
    );
    ok('controls are at least 32px tall on a phone', targets.length === 0, JSON.stringify(targets));

    await page.screenshot({ path: OUT + 'phone-en-top.png' });
    await page.screenshot({ path: OUT + 'phone-en-full.png', fullPage: true });

    /* theme persists */
    await page.click('#theme');
    await page.reload({ waitUntil: 'networkidle' });
    ok('a theme choice persists', (await page.getAttribute('html', 'data-theme')) === 'light');
    await page.screenshot({ path: OUT + 'phone-light-full.png', fullPage: true });
    await page.click('#theme');

    /* the long read opens and the collapse control closes it */
    await page.click('#long summary');
    ok('the long read opens', await page.evaluate(() => document.getElementById('long').open));
    await page.click('#collapse');
    ok('Collapse closes it', !(await page.evaluate(() => document.getElementById('long').open)));

    ok('no console errors or failed requests', errs.length === 0, errs.join(' | '));
    ok('no request to another origin', foreign.length === 0, foreign.join(' '));
    await ctx.close();
  }

  /* ---- language switch keeps every figure ---------------------------- */
  for (const lang of ['fr', 'ar']) {
    const { ctx, page, errs } = await open(browser, PHONE, { locale: 'en-GB' });
    const before = await page.$$eval('[data-v]', (vs) => vs.map((v) => v.getAttribute('data-v') + '=' + v.textContent));
    await page.click('#locale button[data-loc="' + lang + '"]');
    await page.waitForTimeout(100);
    const after = await page.$$eval('[data-v]', (vs) => vs.map((v) => v.getAttribute('data-v') + '=' + v.textContent));
    ok(lang + ': every figure survives the switch', JSON.stringify(before) === JSON.stringify(after), after.length + ' figures');
    ok(lang + ': the document language follows', (await page.getAttribute('html', 'lang')) === lang);
    if (lang === 'ar') ok('ar: the page is right-to-left', (await page.getAttribute('html', 'dir')) === 'rtl');
    const missing = await page.evaluate((l) => {
      const keys = new Set();
      document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-tpl],[data-i18n-label]').forEach((n) => {
        keys.add(n.getAttribute('data-i18n') || n.getAttribute('data-i18n-html') || n.getAttribute('data-i18n-tpl') || n.getAttribute('data-i18n-label'));
      });
      /* DICT is private to the page script; the inline block is read instead. */
      const m = document.documentElement.innerHTML.match(/var DICT = (\{[\s\S]*?\});\s*\/\* ---- END/);
      const dict = m ? JSON.parse(m[1])[l] : {};
      return [...keys].filter((k) => dict[k] === undefined);
    }, lang);
    ok(lang + ': every key on the page is translated', missing.length === 0, missing.join(', '));
    ok(lang + ': no horizontal overflow at 390', (await overflow(page)) <= 0);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    ok(lang + ': at most ' + MAX_PHONE_HEIGHT + 'px at 390 wide', h <= MAX_PHONE_HEIGHT, h + 'px');
    await page.screenshot({ path: OUT + 'phone-' + lang + '-full.png', fullPage: true });
    ok(lang + ': no console errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ---- tablet and desktop -------------------------------------------- */
  for (const vp of [{ width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
    const { ctx, page } = await open(browser, vp);
    ok('no horizontal overflow at ' + vp.width, (await overflow(page)) <= 0);
    if (vp.width >= 900) ok('the long read is open at ' + vp.width, await page.evaluate(() => document.getElementById('long').open));
    await page.screenshot({ path: OUT + 'w' + vp.width + '-top.png' });
    await page.screenshot({ path: OUT + 'w' + vp.width + '-full.png', fullPage: true });
    await ctx.close();
  }

  /* ---- reduced motion -------------------------------------------------- */
  {
    const { ctx, page } = await open(browser, PHONE, { reducedMotion: 'reduce' });
    ok('reduced motion: no running animation', (await page.evaluate(() => document.getAnimations().length)) === 0);
    await ctx.close();
  }

  await browser.close();
  console.log('\nlanding verify: ' + (checks - failures) + '/' + checks + ' passed · screenshots in ' + OUT);
  if (failures) process.exit(1);
})();
