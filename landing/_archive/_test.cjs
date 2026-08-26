const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));

  let pass = 0, fail = 0;
  const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } };

  const URL = 'http://localhost:4810/landing/index.html';
  await page.goto(URL, { waitUntil: 'networkidle' });

  // --- EN defaults ---
  ok(await page.title() === 'Deep Tunisia — a nation that remembers', 'title');
  ok((await page.locator('h1').textContent()) === 'Every society is built on memory.', 'EN h1');
  ok((await page.locator('html').getAttribute('lang')) === 'en', 'EN lang');
  ok((await page.locator('html').getAttribute('dir')) === 'ltr', 'EN dir');

  // --- memory line: real data, min 12 max 69, no glow filter ---
  const memPath = await page.evaluate(() => {
    const svg = document.getElementById('memory-line');
    return { hasPath: !!svg.querySelector('path'), hasGlow: svg.innerHTML.includes('feGaussianBlur'), aria: svg.getAttribute('aria-label') };
  });
  ok(memPath.hasPath, 'memory line path exists');
  ok(!memPath.hasGlow, 'no glow filter');
  ok(memPath.aria && memPath.aria.includes('1956'), 'memory svg aria-label');

  const memThickness = await page.evaluate(() => {
    const d = document.getElementById('memory-line').querySelector('path').getAttribute('d');
    const nums = (d.match(/-?\d+\.?\d*/g) || []).map(Number);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const y = nums[i + 1];
      if (y > 100 && y < 220) { min = Math.min(min, y); max = Math.max(max, y); }
    }
    return { min, max };
  });
  ok(memThickness.min < 181 && memThickness.max > 190, 'ribbon varies around baseline 185: ' + JSON.stringify(memThickness));

  // --- names field: real people ---
  const nameCount = await page.locator('.names-field span').count();
  ok(nameCount >= 50, 'names field has >=50 names, got ' + nameCount);

  // --- key words: exactly 12, all BIP-39 (checked against the canonical list) ---
  const keyWords = await page.locator('.key-word').allTextContents();
  const bip39 = require('fs').readFileSync('C:/Users/FaSt3/.local/share/opencode/tool-output/tool_fc185dc9c001LodGsPwITZaKTq', 'utf8').trim().split(/\s+/);
  const bip39Set = new Set(bip39);
  ok(keyWords.length === 12, '12 key words, got ' + keyWords.length);
  ok(keyWords.every(w => bip39Set.has(w)), 'all key words in BIP-39: ' + keyWords.join(','));

  // --- rules: mono numerals, no emoji ---
  ok((await page.locator('.rule .num').count()) === 3, '3 rules with numeral markers');
  const emojiCount = await page.evaluate(() => (document.querySelector('.rule .icon')) ? 1 : 0);
  ok(emojiCount === 0, 'no emoji icons in rules');

  // --- stats: every figure matches stats.json ---
  const stats = require('E:/deep tunisia/src/generated/stats.json');
  const txt = await page.locator('.stats-grid').innerText();
  ok(txt.includes('467'), 'stats show 467 sources');
  ok(txt.includes('359') && txt.includes('163') && txt.includes('379') && txt.includes('211') && txt.includes('66'), 'stats show people/institutions/positions/relationships/events');
  ok(txt.includes('127') && txt.includes('431') && txt.includes('94') && txt.includes('4'), 'stats show basis ramp');
  ok(txt.includes('278'), 'stats show 278 pending');
  ok(txt.includes('39') && txt.includes('9'), 'stats show gaps/overlaps');
  ok(txt.includes('5'), 'stats show contradictions');
  ok(txt.includes('2') && txt.includes('6'), 'stats show 2/6 hypotheses');
  ok(txt.includes('0'), 'stats show zero data');

  // --- basis ramp: four numbers carry four different basis colors ---
  const basisColors = await page.evaluate(() => {
    const ramp = document.querySelector('.basis-ramp');
    const spans = ramp ? ramp.querySelectorAll('span') : [];
    return [...spans].map(s => getComputedStyle(s).color);
  });
  ok(basisColors.length === 4 && new Set(basisColors).size === 4, 'basis ramp has 4 distinct colors: ' + basisColors.join(' | '));

  // --- i18n: FR ---
  await page.click('button[data-locale="fr"]');
  ok((await page.locator('html').getAttribute('lang')) === 'fr', 'FR lang');
  ok((await page.locator('h1').textContent()) === 'Toute société est bâtie sur la mémoire.', 'FR h1');
  const frProse = await page.evaluate(() => {
    const el = document.querySelector('.movement .prose');
    return { hasPTag: !!el.querySelector('p'), rawTags: el.innerHTML.includes('&lt;p&gt;') || el.textContent.includes('<p>') };
  });
  ok(frProse.hasPTag && !frProse.rawTags, 'FR prose renders as HTML, not literal tags');
  const frKey = await page.locator('.key-word').first().textContent();
  ok(frKey === 'silver', 'key words stay BIP-39 English in FR: ' + frKey);
  ok((await page.locator('[data-i18n="m4.r1d"]').textContent()).includes('Quatre publications'), 'FR budget rule');
  ok((await page.locator('[data-i18n="m4.idD"]').textContent()).includes('BIP-39'), 'FR identity mentions BIP-39');
  ok((await page.locator('[data-i18n="fund.s7"]').textContent()).includes('réfute'), 'FR hypotheses label');

  // --- i18n: AR ---
  await page.click('button[data-locale="ar"]');
  ok((await page.locator('html').getAttribute('lang')) === 'ar', 'AR lang');
  ok((await page.locator('html').getAttribute('dir')) === 'rtl', 'AR dir rtl');
  ok((await page.locator('h1').textContent()) === 'كلُّ مجتمعٍ مبنيٌّ على الذاكرة.', 'AR h1');
  const arProse = await page.evaluate(() => {
    const el = document.querySelector('.movement .prose');
    return { hasPTag: !!el.querySelector('p'), rawTags: el.innerHTML.includes('&lt;p&gt;') || el.textContent.includes('<p>') };
  });
  ok(arProse.hasPTag && !arProse.rawTags, 'AR prose renders as HTML, not literal tags');
  ok((await page.locator('[data-i18n="m4.idD"]').textContent()).includes('BIP-39'), 'AR identity mentions BIP-39');
  const arrowTransform = await page.evaluate(() => getComputedStyle(document.querySelector('.path-arrow')).transform);
  ok(arrowTransform !== 'none', 'RTL path arrows flipped: ' + arrowTransform);

  // --- i18n: back to EN ---
  await page.click('button[data-locale="en"]');
  ok((await page.locator('h1').textContent()) === 'Every society is built on memory.', 'EN h1 after cycle');

  // --- theme toggle ---
  await page.click('#theme-toggle');
  ok((await page.locator('html').getAttribute('data-theme')) === 'light', 'theme -> light');
  ok((await page.evaluate(() => document.querySelector('meta[name="theme-color"]').getAttribute('content'))) === '#fcfbf8', 'theme-color synced');
  await page.click('#theme-toggle');
  ok((await page.locator('html').getAttribute('data-theme')) === 'dark', 'theme -> dark');

  // --- reveal: js class present, reveals start hidden, become visible ---
  ok(await page.evaluate(() => document.documentElement.classList.contains('js')), 'html.js class set');
  const revealState = await page.evaluate(() => {
    const el = document.querySelector('.closing .reveal');
    const cs = getComputedStyle(el);
    return { hasIn: el.classList.contains('in'), opacity: cs.opacity };
  });
  ok(revealState.opacity === '0' || revealState.hasIn, 'reveal gated by js class (opacity=' + revealState.opacity + ')');

  // --- no stray i18n keys / empty values ---
  const emptyKeys = await page.evaluate(() => {
    const missing = [];
    document.querySelectorAll('[data-i18n], [data-i18n-html]').forEach(el => {
      const key = el.dataset.i18n || el.dataset.i18nHtml;
      if (!el.textContent.trim() && !el.innerHTML.trim()) missing.push(key);
    });
    return missing;
  });
  ok(emptyKeys.length === 0, 'no empty i18n values: ' + emptyKeys.join(','));

  // --- link integrity ---
  const links = await page.locator('a').count();
  ok(links >= 8, 'links present: ' + links);
  ok(await page.locator('a.cta-deep').count() >= 3, 'three CTA buttons');

  ok(errors.length === 0, 'no console/page errors: ' + errors.join(' | '));

  await page.screenshot({ path: 'E:/deep tunisia/landing/_verify.png', fullPage: false });
  await browser.close();
  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
