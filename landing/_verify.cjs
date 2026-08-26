/* ============================================================================
   landing/_verify.cjs - browser checks for the landing page
   ============================================================================

   Run it against any static server rooted at the repo:

       py -3 -m http.server 4810
       node landing/_verify.cjs

   It asserts the things that would fail silently: that the stratum is drawn
   from the real DENSITY array, that the evidence dial actually removes edges
   and isolates people as the floor rises, that the budget prices match
   docs/posting-limits.md and that a refusal names the budget rather than
   scolding, that the phrase is twelve words from the real BIP-39 list, and
   that nothing overflows horizontally at 390 / 820 / 1440.

   Screenshots go to SHOT_DIR (default: the OS temp directory) so they never
   land in the repo.
   ============================================================================ */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const OUT = (process.env.SHOT_DIR || path.join(os.tmpdir(), 'dt-landing-shots')) + path.sep;
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.LANDING_URL || 'http://localhost:4810/landing/index.html';

(async () => {
  const pre = [];
  /* the default theme is asserted before the first ok(), so it gets its own check */
  const ok0 = (got, want) => { if (got !== want) pre.push('FAIL: default theme is ' + got + ', expected ' + want); };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.removeItem('dt-theme'); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  ok0(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  await page.waitForTimeout(600);

  // force every reveal in so nothing screenshots blank
  await page.evaluate(() => {
    document.querySelectorAll('.rv, .curtain').forEach(e => e.classList.add('in'));
    document.querySelectorAll('.era-band').forEach(e => e.classList.add('on'));
    document.querySelectorAll('[data-count]').forEach(e => e.textContent = e.getAttribute('data-count'));
  });
  await page.waitForTimeout(900);

  const H = await page.evaluate(() => document.body.scrollHeight);
  console.log('page height', H, 'viewport 1440x900');

  const shots = [
    ['01-hero', 0],
    ['02-ledger-memory', 900],
    ['03-stratum', 1750],
    ['04-connection', 2650],
    ['05-pipeline', 3700],
    ['06-bases', 4900],
    ['07-dial', 5800],
    ['08-limits', 7000],
    ['09-agora', 8600],
    ['10-identity', 10000],
    ['11-key', 10900],
    ['12-budget', 12200],
    ['13-budget-cards', 13300],
    ['14-standard', 14400],
    ['15-support', 15400],
    ['16-closing', 17200],
    ['17-footer', H - 900]
  ];
  for (const [name, y] of shots) {
    await page.evaluate(v => window.scrollTo(0, v), y);
    await page.waitForTimeout(360);
    await page.screenshot({ path: OUT + name + '.png' });
  }

  // ---------- assertions ----------
  let pass = 0, fail = 0;
  pre.forEach(m => { fail++; console.log(m); });
  const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL: ' + n)); };

  ok(await page.title() === 'Deep Tunisia — where memory fades, power escapes', 'title');
  ok((await page.locator('h1').innerText()).includes('Where memory fades'), 'h1');
  ok(await page.locator('a.enter').count() === 4, 'four CTAs');
  ok((await page.locator('a.enter').first().innerText()).includes('Enter the atlas'), 'CTA wording');

  // stratum: real data — a plausible peak (the build regenerates the array, so
  // the exact value moves with the graph), both axis endpoints, the ribbon shape
  const strat = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#stratumbody text')].map(n => n.textContent);
    const nums = t.map(s => +((s.match(/\d+/) || [])[0])).filter(n => Number.isFinite(n) && n >= 10 && n <= 999);
    return { peak: Math.max(...nums), y1956: t.some(s => s.includes('1956')), y2026: t.some(s => s.includes('2026')), paths: document.querySelectorAll('#stratumbody path').length, bands: document.querySelectorAll('.era-band').length, rups: document.querySelectorAll('.rup').length };
  });
  ok(strat.peak >= 40, 'stratum has a real peak (' + strat.peak + ')');
  ok(strat.y1956 && strat.y2026, 'stratum axis endpoints');
  ok(strat.paths === 3, 'stratum ribbon + 2 edges, got ' + strat.paths);
  ok(strat.bands === 3, 'alternating era bands, got ' + strat.bands);
  ok(strat.rups === 4, 'four rupture markers, got ' + strat.rups);

  // dial: filtering actually removes edges and isolates people
  const dial = [];
  for (const f of [0, 2, 3]) {
    await page.locator(`.dialsteps button[data-floor="${f}"]`).click();
    await page.waitForTimeout(520);
    /* the three numbers now live inside one translated sentence */
    dial.push(await page.evaluate(() => {
      const b = [...document.querySelectorAll('#diallive b')].map((n) => +n.textContent);
      return { shown: b[0], total: b[1], iso: b[2] };
    }));
  }
  console.log('dial', JSON.stringify(dial));
  ok(dial[0].shown === 46, 'floor 0 shows all 46 edges');
  ok(dial[2].shown < dial[1].shown && dial[1].shown < dial[0].shown, 'raising the floor removes edges monotonically');
  ok(dial[2].iso > dial[0].iso, 'raising the floor isolates people');
  /* Floor 0 isolates exactly the nodes whose connections all lie outside the
     top-46 slice — a property of the real graph, not a constant. Assert the
     live counter agrees with what the drawing actually dims. */
  await page.locator('.dialsteps button[data-floor="0"]').click();
  await page.waitForTimeout(450);
  const iso0 = await page.evaluate(() => ({
    dim: document.querySelectorAll('#dialsvg .node.dim').length,
    total: document.querySelectorAll('#dialsvg .node').length
  }));
  ok(dial[0].iso === iso0.dim && iso0.total === 46, 'floor 0 counter matches the drawn state (' + iso0.dim + ' of ' + iso0.total + ' dimmed)');
  await page.locator('.dialsteps button[data-floor="3"]').click();
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('evidence').scrollIntoView());
  await page.evaluate(() => window.scrollBy(0, 1900));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '07b-dial-documented.png' });
  await page.locator('.dialsteps button[data-floor="0"]').click();

  // key: 12 real BIP-39 words, 12 dots lit of 2048, reroll changes them
  const k1 = await page.locator('.word .w').allTextContents();
  ok(k1.length === 12, '12 words');
  ok(await page.locator('#dots circle').count() === 2048, '2048 dots');
  ok(await page.locator('#dots circle.on').count() === 12, '12 dots lit');
  await page.locator('#reroll').click();
  await page.waitForTimeout(900);
  const k2 = await page.locator('.word .w').allTextContents();
  ok(k1.join() !== k2.join(), 'reroll produces a different phrase');
  await page.locator('#forget').click();
  await page.waitForTimeout(500);
  ok(await page.locator('.words.forgotten').count() === 1, 'forget blurs the phrase');
  await page.locator('#forget').click();

  // budget: prices, depletion, refusal names the budget
  const spend = async i => { await page.locator('#spend button').nth(i).click(); await page.waitForTimeout(220); };
  const left = async () =>
    (await page.locator('#budgetleft b').first().innerText()).trim();
  ok(await left() === '4', 'starts at 4');
  await spend(1);                                  // uncited reply, 2
  ok(await left() === '2', 'uncited reply costs 2, got ' + await left());
  await spend(0);                                  // cited reply, 1
  ok(await left() === '1', 'cited reply costs 1, got ' + await left());
  ok(await page.locator('#spend button').nth(3).isDisabled(), 'unaffordable thread is disabled');
  await spend(0);
  ok(await left() === '0', 'spent out');
  const refusal = await page.locator('#refusal').innerText();
  ok(/that is your week/i.test(refusal), 'refusal names the budget: ' + refusal);
  ok(!/slow down|rate limit/i.test(refusal), 'refusal does not scold');
  await page.locator('#refusal button').click();
  await page.waitForTimeout(200);
  ok(await left() === '4', 'reset restores the week');
  await page.screenshot({ path: OUT + '12b-budget-spent.png' });

  // theme
  await page.locator('#theme').click();
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'dark by default, toggles to light');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '18-light-hero.png' });
  await page.evaluate(() => window.scrollTo(0, 5800));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '19-light-dial.png' });
  await page.locator('#theme').click();

  // no horizontal overflow at three widths
  for (const w of [390, 820, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!over, 'no horizontal overflow at ' + w);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: OUT + '20-mobile-hero.png' });
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '21-mobile-mid.png' });


  // ======================= three languages =======================
  console.log('\n  -- languages --');

  const strings = {
    en: require('./_strings.en.json'),
    fr: require('./_strings.fr.json'),
    ar: require('./_strings.ar.json')
  };

  /* A key present in English and absent from a translation renders as English
     with no marker, which tells the reader the page is complete when it is not.
     Same rule scripts/test-i18n.ts applies to the instrument's dictionary. */
  for (const l of ['fr', 'ar']) {
    const missing = Object.keys(strings.en).filter((k) => strings[l][k] === undefined);
    ok(missing.length === 0, `${l} covers every English key`, missing.slice(0, 5).join(', '));
  }

  /* A value identical to its English source is a copy-paste someone meant to
     come back to: it inflates coverage while changing nothing. Exempt are the
     strings that are correctly identical — an address, a domain, a name. */
  /* Correctly identical: proper nouns, an address, and five words French
     spells exactly as English does. Exempted one by one rather than by
     loosening the rule, because the rule is what catches real copy-paste. */
  const IDENTICAL_IS_FINE = new Set([
    'foot.14', 'foot.16',
    'top.3', 'ledger.3', 'ledger.5', 'speech.27', 'support.19'
  ]);
  for (const l of ['fr', 'ar']) {
    const same = Object.keys(strings.en).filter(
      (k) => !IDENTICAL_IS_FINE.has(k) && strings[l][k] === strings.en[k]
    );
    ok(same.length === 0, `${l} translations are translations`, same.slice(0, 5).join(', '));
  }

  /* Whole-sentence templates must keep their placeholders in every language —
     a French copy that drops {total} renders "22 connexions visibles sur". */
  const TEMPLATES = { 'dial.live': ['iso', 'n', 'total'], 'bud.left': ['n', 'total'] };
  for (const [key, wanted] of Object.entries(TEMPLATES)) {
    for (const l of ['fr', 'ar']) {
      const got = [...(strings[l][key] || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      ok(String(got) === String(wanted), `${l} ${key} keeps every placeholder`, String(got));
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));

  for (const [l, dir] of [['fr', 'ltr'], ['ar', 'rtl'], ['en', 'ltr']]) {
    await page.locator(`#locale button[data-loc="${l}"]`).click();
    await page.waitForTimeout(650);

    const st = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.title,
      h1: document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(),
      lanes: [...document.querySelectorAll('#dialsvg .lanelabel')].map((n) => n.textContent),
      eras: [...document.querySelectorAll('#stratumbody .eralabel')].map((n) => n.textContent),
      links: document.querySelectorAll('#dialsvg .link').length,
      nodes: document.querySelectorAll('#dialsvg .node').length,
      live: document.getElementById('diallive').textContent,
      budget: document.getElementById('budgetleft').textContent,
      // any placeholder that survived to the screen
      leftovers: (document.body.innerText.match(/\{\w+\}/g) || []).slice(0, 4),
      // anything the switch failed to translate
      untouched: [...document.querySelectorAll('[data-i18n],[data-i18n-html]')].filter(
        (n) => !n.textContent.trim()
      ).length
    }));

    ok(st.lang === l, `${l} sets lang`, st.lang);
    ok(st.dir === dir, `${l} sets dir`, st.dir);
    ok(l === 'en' || st.title === strings[l]['doc.title'], `${l} translates the document title`, st.title);
    ok(st.h1.length > 10, `${l} renders a headline`, st.h1);
    ok(st.leftovers.length === 0, `${l} substitutes every placeholder`, st.leftovers.join(' '));
    ok(st.untouched === 0, `${l} leaves no keyed element empty`, String(st.untouched));

    // the charts are rebuilt, not restyled, so they must come back intact
    ok(st.links === 46 && st.nodes === 46, `${l} redraws the network intact`, st.links + '/' + st.nodes);
    ok(st.lanes.length === 6, `${l} redraws six lanes`, st.lanes.join(','));
    ok(st.eras.length >= 2, `${l} redraws the era labels`, st.eras.join(','));
    if (l !== 'en') {
      ok(!st.lanes.includes('political'), `${l} translates the lane labels`, st.lanes.join(','));
      ok(st.live !== '' && !/connections visible/.test(st.live), `${l} translates the live counter`, st.live);
      ok(st.budget !== '' && !/units left/.test(st.budget), `${l} translates the budget counter`, st.budget);
    }

    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!over, `${l} does not overflow horizontally`);

    if (l !== 'en') {
      await page.evaluate(() => {
        document.querySelectorAll('.rv, .curtain').forEach((e) => e.classList.add('in'));
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: OUT + `L-${l}-hero.png` });
      await page.evaluate(() => {
        const r = document.querySelector('.instrument').getBoundingClientRect();
        window.scrollTo(0, window.scrollY + r.top - 90);
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: OUT + `L-${l}-dial.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    }
  }

  /* The language must survive a reload, or the switch is a toy. */
  await page.locator('#locale button[data-loc="ar"]').click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ok(
    (await page.evaluate(() => document.documentElement.dir)) === 'rtl',
    'the chosen language survives a reload'
  );

  ok(errs.length === 0, 'clean console: ' + errs.join(' | '));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
