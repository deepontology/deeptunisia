/* ============================================================================
   scripts/verify-deploy.cjs — the gate, run against the live deployment
   ============================================================================

       node scripts/verify-deploy.cjs https://deeptunisia.org

   Everything else verifies something we control. This verifies the thing the
   public will actually get: real DNS, real TLS, real headers from the real
   platform, and the Worker actually talking to a real D1 database.

   It is written to be run by whoever deploys, immediately, before telling
   anybody the site is up — and again after any change to wrangler.toml,
   community/schema.sql or the worker, because those are the three things that
   can be green locally and broken in production.

   It writes nothing and posts nothing. The one write it exercises is a
   deliberately invalid one, to confirm the signature check rejects it.
   ============================================================================ */
const { chromium } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const ORIGIN = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(ORIGIN)) {
  console.error('\n  usage: node scripts/verify-deploy.cjs https://your-domain\n');
  process.exit(2);
}
const OUT = (process.env.SHOT_DIR || path.join(os.tmpdir(), 'dt-deploy-shots')) + path.sep;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  let pass = 0, fail = 0, warn = 0;
  const ok = (c, n, d = '') => { c ? pass++ : (fail++, console.log('  FAIL   ' + n + (d ? ' — ' + d : ''))); };
  const should = (c, n, d = '') => { c ? pass++ : (warn++, console.log('  WARN   ' + n + (d ? ' — ' + d : ''))); };

  console.log(`\n  ── ${ORIGIN} ──\n`);

  // ---------------------------------------------------------------- headers
  const root = await fetch(ORIGIN + '/', { redirect: 'follow' });
  ok(root.ok, 'the site answers', String(root.status));
  ok(root.url.startsWith('https://'), 'served over HTTPS', root.url);

  const h = (n) => root.headers.get(n) || '';
  ok(h('content-security-policy').length > 0, 'a Content-Security-Policy is served');
  ok(/frame-ancestors 'none'/.test(h('content-security-policy')), 'CSP forbids framing');
  ok(/connect-src 'self'/.test(h('content-security-policy')), 'CSP pins connect-src to self');
  ok(h('x-content-type-options') === 'nosniff', 'nosniff is set');
  ok(h('referrer-policy') === 'no-referrer', 'referrer policy is no-referrer');
  ok(/max-age=\d{7,}/.test(h('strict-transport-security')), 'HSTS is set', h('strict-transport-security'));
  should(!h('server') || !/express|nginx\/\d/i.test(h('server')), 'no server version disclosed', h('server'));

  const body = await root.text();
  ok(/Deep Tunisia/.test(body), 'the root is the landing page');
  ok(!/\.\.\/static\//.test(body), 'the landing font path was rewritten for the build');

  // ---------------------------------------------------------------- the API
  const threads = await fetch(ORIGIN + '/api/threads');
  ok(threads.status === 200, '/api/threads answers 200 — the Worker and D1 are wired', String(threads.status));
  ok(/application\/json/.test(threads.headers.get('content-type') || ''), '/api/threads returns JSON');
  let parsed = null;
  try { parsed = await threads.json(); } catch { /* handled below */ }
  ok(parsed !== null, '/api/threads returns parseable JSON');
  ok(parsed && Array.isArray(parsed.items ?? parsed), '/api/threads returns a list', JSON.stringify(parsed).slice(0, 120));

  /* An unsigned write must be refused. If this ever returns 2xx the signature
     check has been bypassed and the deployment must come down. */
  const unsigned = await fetch(ORIGIN + '/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'verify-deploy probe — this must never be accepted' })
  });
  ok(unsigned.status >= 400 && unsigned.status < 500, 'an unsigned write is refused', String(unsigned.status));
  ok(unsigned.status !== 500, 'the refusal is a refusal, not a crash', String(unsigned.status));

  // ---------------------------------------------------------------- routes
  for (const r of ['/chronicle', '/now', '/network', '/world', '/atlas', '/rankings',
                   '/investigate', '/evidence', '/methodology', '/corrections', '/data', '/about', '/agora', '/feed', '/guide']) {
    const res = await fetch(ORIGIN + r);
    ok(res.status === 200, `${r} is served`, String(res.status));
  }
  for (const f of ['/robots.txt', '/llms.txt', '/favicon.svg', '/fonts/fonts.css', '/dataset.json']) {
    const res = await fetch(ORIGIN + f);
    ok(res.status === 200, `${f} is served`, String(res.status));
  }
  const exports = await fetch(ORIGIN + '/dataset.json');
  should(exports.headers.get('access-control-allow-origin') === '*', 'the published export allows CORS');

  const missing = await fetch(ORIGIN + '/no-such-record-' + Date.now());
  ok(missing.status === 404, 'an unknown path is a 404', String(missing.status));
  ok(/There is no record/.test(await missing.text()), 'the 404 page is the project’s own');

  // ---------------------------------------------------------------- browser
  const browser = await chromium.launch(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : undefined);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const offsite = [], csp = [], errors = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(ORIGIN).origin && u.protocol !== 'data:') offsite.push(r.url());
  });
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text());
    else if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  ok(await page.locator('a.enter').count() === 4, 'the landing page rendered');
  /*
   * The dial is generated at runtime from the graph arrays the build embeds,
   * so the edge count grows with the data and a hardcoded count goes stale on
   * every outbox merge (it read 46 when the graph had 46 edges; it draws 57
   * now). What must be pinned is that the dial DREW: the node count matches
   * the number named in the aria-label (also generated), and the link layer
   * rendered at all.
   */
  const dialNodes = await page.locator('#dialsvg .node').count();
  const dialLinks = await page.locator('#dialsvg .link').count();
  const dialLabel = ((await page.locator('#dialsvg').getAttribute('aria-label')) || '').match(/(\d+) most-connected/);
  ok(
    dialNodes > 0 && dialLinks > 0 && dialLabel && Number(dialLabel[1]) === dialNodes,
    'the evidence dial drew',
    `${dialLinks} links / ${dialNodes} nodes / label ${dialLabel ? dialLabel[1] : '?'}`
  );
  await page.screenshot({ path: OUT + 'D-landing.png' });

  await page.locator('a.enter').first().click();
  await page.waitForLoadState('networkidle');
  ok(new URL(page.url()).pathname === '/chronicle', 'the CTA reaches the atlas', page.url());
  await page.waitForTimeout(3200);
  ok(await page.locator('.menubar').count() === 1, 'the atlas shell rendered');
  ok(await page.locator('.bar').count() > 20, 'Chronicle drew its tenures');
  ok(await page.locator('.card[role="dialog"]').count() === 1, 'the guided tour runs for a new reader');
  await page.screenshot({ path: OUT + 'D-atlas.png' });
  await page.locator('.card .skip').click();

  await page.goto(ORIGIN + '/agora', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // The Agora is gated by AGORA_OPEN at build time. Either state is a working
  // page: the coming-soon banner, or the live client's privacy notice.
  const soon = await page.locator('.agora .soon').count();
  const privacy = await page.locator('.agora .privacy').count();
  ok(soon === 1 || privacy >= 1, 'the Agora page renders (banner or live client)',
     `soon=${soon} privacy=${privacy}`);
  await page.screenshot({ path: OUT + 'D-agora.png' });

  /*
   * The zero-cross-origin promise is "no THIRD PARTY learns about a reader".
   * Cloudflare — the host itself — injects its own Web Analytics beacon into
   * every served HTML page. It is not a third party, but it IS a cross-origin
   * request, and the CSP (script-src 'self') correctly blocks it, so the
   * browser refuses the beacon before it loads. Both checks therefore allow
   * that one host's beacon while still failing on any real third party. The
   * CSP-block message for the beacon is the CSP working, not a violation.
   * (Alternative: disable Web Analytics in the Cloudflare dashboard; the
   * check tolerates either state.)
   */
  const CF_BEACON = /static\.cloudflareinsights\.com\/beacon/;
  const offsiteOther = offsite.filter((u) => !CF_BEACON.test(u));
  const cspOther = csp.filter((m) => !CF_BEACON.test(m));
  ok(offsiteOther.length === 0, 'no third-party cross-origin requests', offsiteOther.slice(0, 5).join(', '));
  ok(cspOther.length === 0, 'nothing third-party is blocked by the CSP', cspOther.slice(0, 3).join(' | '));
  ok(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n  ${pass} passed, ${fail} failed, ${warn} warnings`);
  console.log(`  screenshots → ${OUT}\n`);
  if (fail) console.log('  DO NOT ANNOUNCE THE SITE until these are green.\n');
  process.exit(fail ? 1 : 0);
})();
