/* ============================================================================
   landing/_i18n-extract.cjs — assign data-i18n keys and pull the English out
   ============================================================================

   Run once (or again after the English copy changes):

       py -3 -m http.server 4810
       node landing/_i18n-extract.cjs

   It walks the page in a real browser, stamps a stable `data-i18n` (or
   `data-i18n-html`, where the string carries inline markup) onto every
   translatable element, writes the file back, and dumps the English into
   landing/_strings.en.json for translation.

   Keys are `<section>.<n>` in document order. Deliberately positional rather
   than derived from the text: a key built from the English would change every
   time a word changes, silently orphaning both translations.

   RE-RUNNING IS SAFE. Elements that already carry a key keep it, so existing
   translations stay attached; only new elements are assigned.
   ============================================================================ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'index.html');
const URL = process.env.LANDING_URL || 'http://localhost:4810/landing/index.html';

/* Everything the reader reads. Ordered roughly as it appears, but the walk is
   done per section so a new paragraph in the middle only shifts its own
   section's numbering. Excluded on purpose: the numerals in .limit .v and
   .rung .amt (figures, identical in every language), .basis .spec (drawings),
   and anything the tour scripts write into at runtime. */
const SELECTORS = [
  '.skip',
  '.threshold nav a',
  '.hero .eyebrow', '.hero .display', '.hero .lede', '.ghostlink', '.scrollcue .micro',
  '.ledger .k',
  '.mark .micro',
  '.statement', '.sub', '.aphorism',
  '.prose > p', 'p.prose',
  '.figcap',
  '.step h4', '.step p', '.step .hard',
  '.basis .name', '.basis .def', '.basis .count',
  '.instrument .head .t', '.instrument .head .micro',
  '.dialbar .lbl', '.dialsteps button',
  '.limit .d',
  '.stop h4', '.stop .say', '.stop p', '.stop .soon',
  '.entropy .cap', '.chip', '.keybar .note', '.word .w0',
  '.spend .act', '.spend .cost',
  '.rung .lv', '.rung .how',
  '.card .tag', '.card h4', '.card p',
  '.neg',
  '.creed .line > span', '.final',
  'footer h5', 'footer p', 'footer li',
  '.colophon .micro', '.colophon a'
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  const result = await page.evaluate((sels) => {
    /* which named region an element sits in, for the key prefix */
    function region(el) {
      const s = el.closest('section, footer, header');
      if (!s) return 'misc';
      if (s.tagName === 'FOOTER') return 'foot';
      if (s.tagName === 'HEADER') return 'top';
      if (s.id) return s.id;
      if (s.classList.contains('ledger')) return 'ledger';
      if (s.classList.contains('closing')) return 'end';
      return 'misc';
    }

    const seen = new Set();
    const counters = {};
    const strings = {};
    const nodes = [];

    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        /* never key an element that contains another keyed one */
        if (el.querySelector('[data-i18n],[data-i18n-html]')) continue;
        if (!el.textContent.trim()) continue;
        seen.add(el);
        nodes.push(el);
      }
    }
    /* document order, so the numbering reads down the page */
    nodes.sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );

    for (const el of nodes) {
      let key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-html');
      if (!key) {
        const r = region(el);
        counters[r] = (counters[r] || 0) + 1;
        key = r + '.' + counters[r];
      }
      /* inline markup (<strong>, <em>, <span class="lit">, <br>) has to survive,
         so those become -html and the translator gets the tags */
      const rich = /<[a-z]/i.test(el.innerHTML);
      const attr = rich ? 'data-i18n-html' : 'data-i18n';
      el.removeAttribute('data-i18n');
      el.removeAttribute('data-i18n-html');
      el.setAttribute(attr, key);

      strings[key] = rich
        ? el.innerHTML.replace(/\s+/g, ' ').trim()
        : el.textContent.replace(/\s+/g, ' ').trim();
    }

    return { strings, count: nodes.length };
  }, SELECTORS);

  /* Serialising <body> is what writes the attributes back, so everything the
     page GENERATES at runtime has to be torn out first — otherwise 2,048 <circle>
     elements, 46 network nodes and a drawn ribbon get baked into the source. */
  const bodyHTML = await page.evaluate(() => {
    ['#stratumbody', '#dialsvg', '#dots', '#words', '#units', '#diallive', '#budgetleft', '#refusal']
      .forEach((s) => { const n = document.querySelector(s); if (n) n.innerHTML = ''; });
    document.querySelectorAll('[data-count]').forEach((n) => (n.textContent = '0'));
    document.querySelectorAll('.rv, .curtain, .era-band').forEach((n) => n.classList.remove('in', 'on'));
    document.querySelectorAll('[style*="transition-delay"]').forEach((n) => (n.style.transitionDelay = ''));
    /* the dial leaves lane <line>/<text> siblings on the svg too */
    const dial = document.getElementById('dialsvg');
    if (dial) [...dial.children].forEach((c) => c.remove());
    return document.body.innerHTML;
  });
  const src = fs.readFileSync(FILE, 'utf8');
  const a = src.indexOf('<body>') + '<body>'.length;
  const b = src.lastIndexOf('</body>');
  fs.writeFileSync(FILE, src.slice(0, a) + '\n' + bodyHTML + '\n' + src.slice(b), 'utf8');

  fs.writeFileSync(
    path.join(__dirname, '_strings.en.json'),
    JSON.stringify(result.strings, null, 2),
    'utf8'
  );
  console.log('keyed ' + result.count + ' elements');
  await browser.close();
})();
