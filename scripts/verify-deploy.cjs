/* ============================================================================
   scripts/verify-deploy.cjs — the gate, run against the live deployment
   ============================================================================

       node scripts/verify-deploy.cjs https://deeptunisia.org off <dataset-hash>

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
  console.error('\n  usage: node scripts/verify-deploy.cjs https://your-domain [off|read-only|beta] <dataset-hash>\n');
  process.exit(2);
}
/*
 * The mode is an argument, and the default is the closed one. Verification must
 * never proceed against the mode somebody hoped for: if the deployment runs
 * `off` and this asks for `beta`, the checks fail, and that is the point.
 */
const MODE = (process.argv[3] || 'off').replace(/[^a-z-]/g, '');
if (!['off', 'read-only', 'beta'].includes(MODE)) {
  console.error('\n  mode must be off, read-only or beta\n');
  process.exit(2);
}
/*
 * The release surface is checked against a hash somebody states, never one the
 * script reads from the site it is checking: a deployment cannot vouch for
 * itself. Eight hex characters or more; the run fails without it.
 */
const EXPECTED_HASH = (process.argv[4] || '').toLowerCase();
/** A record the release surface is read through: its page and its share address. */
const KNOWN_RECORD = 'bourguiba';
/** The address Cloudflare gives the Worker; it must stay out of search indexes. */
const WORKERS_DEV = 'https://deeptunisia.deeptunisia.workers.dev';
const RELEASE_PAPER = '/deeptunisia-release-paper-v1.0.0.pdf';
const RELEASE_PAPER_TITLE = '/Title (deeptunisia-release-paper-v1.0.0)';
const OUT = (process.env.SHOT_DIR || path.join(os.tmpdir(), 'dt-deploy-shots')) + path.sep;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  /*
   * Every check belongs to a group, and the summary at the end is printed from
   * the groups' own counters. Nothing in the output is a number somebody
   * counted: copy the summary, do not retype it.
   */
  const groups = [];
  let current = null;
  const group = (name) => { current = { name, pass: 0, fail: 0, warn: 0 }; groups.push(current); console.log('\n  ── ' + name + ' ──\n'); };
  const ok = (c, n, d = '') => { c ? current.pass++ : (current.fail++, console.log('  FAIL   ' + n + (d ? ' — ' + d : ''))); };
  const should = (c, n, d = '') => { c ? current.pass++ : (current.warn++, console.log('  WARN   ' + n + (d ? ' — ' + d : ''))); };

  console.log(`\n  ── ${ORIGIN} ──\n`);
  console.log(`  expected community mode: ${MODE}\n`);

  // ---------------------------------------------------------------- headers
  group('headers and landing');
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

  // ---------------------------------------------------------------- the mode
  /*
   * The community API is enforced by the server, so this is where the mode
   * contract is verified against a real deployment rather than a test harness.
   * `off` must refuse every route identically, before it touches D1; a single
   * 200, a 500, or a body that names a route means the boundary is not there.
   */
  const apiGet = async (p) => {
    const res = await fetch(ORIGIN + p);
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, text, body, cache: res.headers.get('cache-control'), ct: res.headers.get('content-type') };
  };
  const apiPost = async (p, payload) => {
    const res = await fetch(ORIGIN + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload === undefined ? {} : payload)
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, text, body, cache: res.headers.get('cache-control'), ct: res.headers.get('content-type') };
  };

  group('community API, mode ' + MODE);
  const threads = await apiGet('/api/threads');
  const identity = await apiPost('/api/whoami', {});
  const write = await apiPost('/api/posts', { body: 'verify-deploy probe — this must never be accepted' });
  const missingRoute = await apiGet('/api/does-not-exist-verify-probe');
  const otherReads = await Promise.all(['/api/mentions', '/api/prs', '/api/queue'].map(apiGet));

  if (MODE === 'off') {
    const probes = [
      ['the thread list', threads],
      ['the identity action', identity],
      ['an unsigned write', write],
      ['an unknown route', missingRoute],
      ...otherReads.map((r, i) => [`a public read ${['/api/mentions', '/api/prs', '/api/queue'][i]}`, r])
    ];
    for (const [label, r] of probes) {
      ok(r.status === 404, `off: ${label} is the uniform 404`, String(r.status));
      ok(r.body && r.body.error === 'not found', `off: ${label} refuses with the uniform body`, r.text.slice(0, 80));
      ok(r.cache === 'no-store', `off: ${label} refusal is not cacheable`, String(r.cache));
      ok(/application\/json/.test(r.ct || ''), `off: ${label} refusal is json`, String(r.ct));
    }
    ok(probes.every(([, r]) => r.text === threads.text), 'off: every route refuses identically');
    ok(probes.every(([, r]) => r.status === 404), 'off: no route answered anything else');
  }

  if (MODE === 'read-only') {
    ok(threads.status === 200, 'read-only: the thread list is served', String(threads.status));
    ok(Array.isArray(threads.body && threads.body.items), 'read-only: it is a list', JSON.stringify(threads.body || {}).slice(0, 80));
    ok(otherReads.every((r) => r.status === 200), 'read-only: the other public reads are served', otherReads.map((r) => r.status).join(','));
    ok(identity.status === 404, 'read-only: no identity may be minted', String(identity.status));
    ok(write.status === 404, 'read-only: an unsigned write is refused', String(write.status));
    ok(missingRoute.status === 404, 'read-only: an unknown route is the uniform 404', String(missingRoute.status));
    ok(
      [identity, write, missingRoute].every((r) => r.text === identity.text),
      'read-only: every refusal is uniform',
      [identity.text, write.text, missingRoute.text].join(' | ').slice(0, 120)
    );
    ok([identity, write].every((r) => r.cache === 'no-store'), 'read-only: refusals are not cacheable');
  }

  if (MODE === 'beta') {
    ok(threads.status === 200, 'beta: the thread list is served', String(threads.status));
    ok(Array.isArray(threads.body && threads.body.items), 'beta: it is a list', JSON.stringify(threads.body || {}).slice(0, 80));
    ok(write.status >= 400 && write.status < 500, 'beta: an unsigned write is refused', String(write.status));
    ok(write.status !== 500, 'beta: the refusal is a refusal, not a crash', String(write.status));
    ok(identity.status !== 404, 'beta: the API is reachable, not closed', String(identity.status));
  }

  // ---------------------------------------------------------------- routes
  group('public routes');
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
  group('browser: landing and atlas');
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
  ok(await page.locator('a.enter').count() === 6, 'the landing page rendered');
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
  await page.locator('.card button.skip').click();

  group('browser: Agora client, mode ' + MODE);
  await page.goto(ORIGIN + '/agora', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  /*
   * The client's build-time mode and the server's runtime mode must agree, and
   * this is where that agreement is checked: a build compiled with `beta`
   * pointed at an `off` server would show a live client whose every request
   * 404s, and an `off` build on a `beta` server would hide working software
   * behind a banner. Either way the reader is being told something untrue.
   */
  const soon = await page.locator('.agora .soon').count();
  const privacy = await page.locator('.agora .privacy').count();
  if (MODE === 'beta') {
    ok(soon === 0, 'beta: the client is not behind a closed banner', `soon=${soon}`);
    ok(privacy >= 1, 'beta: the live client rendered its privacy notice', `privacy=${privacy}`);
  } else {
    ok(soon === 1, `${MODE}: the client renders the closed banner`, `soon=${soon} privacy=${privacy}`);
    ok(privacy === 0, `${MODE}: the live client is not rendered`, `privacy=${privacy}`);
  }
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
  group('browser: third parties and console');
  const CF_BEACON = /static\.cloudflareinsights\.com\/beacon/;
  const offsiteOther = offsite.filter((u) => !CF_BEACON.test(u));
  const cspOther = csp.filter((m) => !CF_BEACON.test(m));
  ok(offsiteOther.length === 0, 'no third-party cross-origin requests', offsiteOther.slice(0, 5).join(', '));
  ok(cspOther.length === 0, 'nothing third-party is blocked by the CSP', cspOther.slice(0, 3).join(' | '));
  ok(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));

  await browser.close();

  // ---------------------------------------------------------------- release surface
  /*
   * What a reader of the release gets: the dataset the tag names, a record page
   * and its share address, the release paper, the study that is fielding, and a
   * search-engine policy that differs between the real domain and the Worker's
   * own address. Each is read from outside, through the same public addresses.
   */
  group('release surface');
  ok(/^[0-9a-f]{8,64}$/.test(EXPECTED_HASH), 'the expected dataset hash was given as the third argument', EXPECTED_HASH || 'none');
  const datasetRes = await fetch(ORIGIN + '/dataset.json');
  let servedHash = '';
  try { servedHash = String(((await datasetRes.json()).meta || {}).datasetHash || '').toLowerCase(); } catch { /* not json */ }
  ok(/^[0-9a-f]{8,64}$/.test(EXPECTED_HASH) && servedHash.startsWith(EXPECTED_HASH), 'the served dataset hash is the expected one', `served ${servedHash.slice(0, 8) || 'none'}, expected ${EXPECTED_HASH.slice(0, 8) || 'none'}`);

  const recordRes = await fetch(ORIGIN + '/e/' + KNOWN_RECORD);
  ok(recordRes.status === 200, `/e/${KNOWN_RECORD} is served`, String(recordRes.status));
  const shareRes = await fetch(ORIGIN + '/share/entity/' + KNOWN_RECORD, { redirect: 'manual' });
  const shareTo = shareRes.headers.get('location') || '';
  ok(shareRes.status === 301 && new URL(shareTo, ORIGIN).pathname === '/e/' + KNOWN_RECORD, `/share/entity/${KNOWN_RECORD} answers 301 to /e/${KNOWN_RECORD}`, `${shareRes.status} ${shareTo}`);

  const paperRes = await fetch(ORIGIN + RELEASE_PAPER);
  const paperBytes = Buffer.from(await paperRes.arrayBuffer());
  ok(paperRes.status === 200 && /application\/pdf/.test(paperRes.headers.get('content-type') || ''), 'the release paper is served as a PDF', `${paperRes.status} ${paperRes.headers.get('content-type')}`);
  ok(paperBytes.subarray(0, 5).toString() === '%PDF-' && paperBytes.includes(RELEASE_PAPER_TITLE), 'the release paper carries its V1.0.0 title', `${paperBytes.length} bytes`);

  const studiesRes = await fetch(ORIGIN + '/api/studies');
  let studies = [];
  try { studies = (await studiesRes.json()).studies || []; } catch { /* not json */ }
  const police = studies.find((st) => st.slug === 'police');
  ok(Boolean(police) && police.status === 'fielding', 'the police study is fielding', police ? police.status : 'not listed');

  const indexed = async (url) => {
    const res = await fetch(url);
    const header = res.headers.get('x-robots-tag') || '';
    const meta = /<meta[^>]*name=["']robots["'][^>]*noindex/i.test(await res.text());
    return { noindexed: /noindex/i.test(header) || meta, header };
  };
  const onWorkers = new URL(ORIGIN).hostname.endsWith('.workers.dev');
  const origin = await indexed(ORIGIN + '/');
  ok(onWorkers ? origin.noindexed : !origin.noindexed, onWorkers ? 'the Workers address is noindex' : 'the custom domain is not noindex', origin.header || 'no x-robots-tag');
  const workers = await indexed(WORKERS_DEV + '/');
  ok(workers.noindexed, 'the Workers address is noindex', workers.header || 'no x-robots-tag');

  // ---------------------------------------------------------------- summary
  const total = groups.reduce((t, g) => ({ pass: t.pass + g.pass, fail: t.fail + g.fail, warn: t.warn + g.warn }), { pass: 0, fail: 0, warn: 0 });
  const width = Math.max(...groups.map((g) => g.name.length), 5);
  console.log('\n  ── summary ──\n');
  for (const g of groups) console.log(`  ${g.name.padEnd(width)}  ${g.pass} passed, ${g.fail} failed, ${g.warn} warnings`);
  console.log(`  ${'total'.padEnd(width)}  ${total.pass} passed, ${total.fail} failed, ${total.warn} warnings`);
  console.log(`\n  screenshots → ${OUT}\n`);
  if (total.fail) console.log('  DO NOT ANNOUNCE THE SITE until these are green.\n');
  process.exit(total.fail ? 1 : 0);
})();
