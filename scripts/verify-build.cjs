/* ============================================================================
   scripts/verify-build.cjs — does the thing we are about to upload actually work
   ============================================================================

       npm run build
       node scripts/verify-build.cjs

   Everything else in this repo tests the source. This tests the artefact: the
   contents of build/, served the way the platform will serve it, including the
   response headers from build/_headers.

   That distinction has teeth. The Content-Security-Policy exists only in that
   file, `npm run dev` never applies it, and a policy that breaks the app is
   invisible until it is live. So this script parses _headers, serves build/ with
   them, and fails on a single CSP violation.

   No API here — /api is the Worker, and this is the static half. Agora will
   report itself unavailable and that is the correct behaviour for a static
   preview; docs/DEPLOY.md checks the API against the real deployment.
   ============================================================================ */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const PORT = Number(process.env.PORT || 4820);
const OUT = (process.env.SHOT_DIR || path.join(require('node:os').tmpdir(), 'dt-build-shots')) + path.sep;
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(BUILD)) {
  console.error('\n  build/ does not exist — run `npm run build` first\n');
  process.exit(1);
}

/* ---------------------------------------------------------------------------
   _headers, parsed the way Cloudflare and Netlify read it: a path pattern in
   column 0, then indented `Name: value` lines until the next pattern.
   --------------------------------------------------------------------------- */
function parseHeaders(file) {
  const rules = [];
  let current = null;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(':');
      if (i > 0) current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const RULES = parseHeaders(path.join(BUILD, '_headers'));

function headersFor(pathname) {
  const out = [];
  for (const rule of RULES) {
    const re = new RegExp('^' + rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(pathname)) out.push(...rule.headers);
  }
  return out;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.csv': 'text/csv', '.txt': 'text/plain', '.png': 'image/png'
};

/* Resolves like a static host: exact file, then `<path>.html`, then
   `<path>/index.html`, then the 404 page. Same order Cloudflare Assets uses. */
function resolve(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const candidates =
    clean === '/'
      ? ['index.html']
      : [clean.slice(1), clean.slice(1) + '.html', path.join(clean.slice(1), 'index.html')];
  for (const c of candidates) {
    const f = path.join(BUILD, c);
    if (f.startsWith(BUILD) && fs.existsSync(f) && fs.statSync(f).isFile()) return { file: f, status: 200 };
  }
  return { file: path.join(BUILD, '404.html'), status: 404 };
}

const server = http.createServer((req, res) => {
  const { file, status } = resolve(req.url);
  const ext = path.extname(file);
  const head = { 'content-type': TYPES[ext] || 'application/octet-stream' };
  for (const [k, v] of headersFor(req.url.split('?')[0])) head[k] = v;
  res.writeHead(status, head);
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const BASE = `http://127.0.0.1:${PORT}`;
  console.log(`\n  serving build/ at ${BASE} with the headers from build/_headers\n`);

  const browser = await chromium.launch(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : undefined);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  let pass = 0, fail = 0;
  const ok = (c, n, d = '') => { c ? pass++ : (fail++, console.log('  FAIL: ' + n + (d ? ' — ' + d : ''))); };

  const csp = [];
  const offsite = [];
  const errors = [];
  page.on('console', (m) => {
    const text = m.text();
    if (/Content Security Policy|Refused to/i.test(text)) csp.push(text);
    else if (m.type() === 'error') errors.push(text);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== BASE && u.protocol !== 'data:') offsite.push(r.url());
  });

  // ---------- the landing page owns the root ----------
  const res = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok(res.status() === 200, '/ returns 200');
  const h = res.headers();
  ok(!!h['content-security-policy'], '/ carries a CSP');
  ok(h['x-content-type-options'] === 'nosniff', '/ carries nosniff');
  ok(h['referrer-policy'] === 'no-referrer', '/ carries a referrer policy');
  ok(/frame-ancestors 'none'/.test(h['content-security-policy'] || ''), 'CSP forbids framing');
  ok(/connect-src 'self'/.test(h['content-security-policy'] || ''), 'CSP pins connect-src to self');

  ok((await page.title()).startsWith('Deep Tunisia'), 'the root is the landing page', await page.title());
  // Four CTAs: the paper button joined the trio (1fff0bb carried the same
  // fix on the experiment branch; master needed it too).
  ok(await page.locator('a.enter').count() === 4, 'the landing page has its four CTAs');
  const fonts = await page.evaluate(() => document.fonts.size > 0);
  ok(fonts, 'the landing page loaded its self-hosted fonts');
  ok(await page.locator('#dots circle').count() === 2048, 'the entropy field drew');
  await page.screenshot({ path: OUT + 'B-landing.png' });

  // three languages still work in the built copy
  for (const l of ['fr', 'ar']) {
    await page.locator(`#locale button[data-loc="${l}"]`).click();
    await page.waitForTimeout(500);
    ok((await page.evaluate(() => document.documentElement.lang)) === l, `${l} switches in the built page`);
  }
  await page.locator('#locale button[data-loc="en"]').click();

  // ---------- the CTA reaches the atlas ----------
  await page.locator('a.enter').first().click();
  await page.waitForLoadState('networkidle');
  ok(new URL(page.url()).pathname === '/chronicle', 'the CTA lands on /chronicle', page.url());
  await page.waitForTimeout(2800);   // boot screen, then the tour
  ok(await page.locator('.menubar').count() === 1, 'the atlas shell rendered');
  ok(await page.locator('.chronicle svg').count() === 1, 'Chronicle drew');
  ok(await page.locator('.bar').count() > 20, 'Chronicle drew its tenures');
  ok(await page.locator('.card[role="dialog"]').count() === 1, 'the guided tour ran on a first visit');
  await page.screenshot({ path: OUT + 'B-atlas.png' });
  await page.locator('.card .skip').click();

  // The dock's evidence control is a cumulative Segmented floor now - one
  // button per basis. The old circular #dialsvg is long gone; this asserts
  // what the dock actually renders, after the tour has been dismissed.
  const evidenceBtns = await page.locator('[data-tour="evidence"] button').count();
  ok(evidenceBtns === 4, 'the dock renders the four-basis evidence floor', String(evidenceBtns));

  // ---------- every route in the build ----------
  const ROUTES = ['/chronicle', '/now', '/network', '/world', '/atlas', '/rankings',
                  '/investigate', '/evidence', '/methodology', '/corrections', '/data', '/about', '/agora', '/feed'];
  for (const r of ROUTES) {
    const resp = await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    ok(resp.status() === 200, `${r} is in the build`);
  }

  // ---------- 404 ----------
  const nf = await page.goto(BASE + '/no-such-record', { waitUntil: 'domcontentloaded' });
  ok(nf.status() === 404, 'an unknown path is a real 404', String(nf.status()));
  ok((await page.locator('h1').innerText()).length > 10, 'the 404 page renders');
  ok(await page.locator('a[href="/chronicle"]').count() >= 1, 'the 404 page offers a way back');
  await page.screenshot({ path: OUT + 'B-404.png' });

  // ---------- the two claims this project makes about itself ----------
  ok(offsite.length === 0, 'the built site makes zero cross-origin requests', offsite.slice(0, 4).join(', '));
  ok(csp.length === 0, 'nothing is blocked by the CSP', csp.slice(0, 3).join(' | '));

  // /api is the Worker's, so a static preview 404s it — that is correct here.
  const api = await page.goto(BASE + '/api/threads', { waitUntil: 'domcontentloaded' });
  ok(api.status() === 404, '/api is not answered by the static half (the Worker owns it)');

  const real = errors.filter((e) => !/api|community|Failed to load resource/i.test(e));
  ok(real.length === 0, 'no unexplained console errors', real.slice(0, 3).join(' | '));

  console.log(`\n  ${pass} passed, ${fail} failed`);
  console.log(`  screenshots → ${OUT}\n`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
