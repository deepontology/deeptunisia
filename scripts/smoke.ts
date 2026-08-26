/**
 * Browser smoke test.
 *
 * SSR returning 200 proves nothing about whether the app actually runs: a
 * hydration crash produces a perfectly valid HTML response and a blank screen.
 * This drives a real browser, fails on ANY console error or uncaught exception,
 * and asserts that each view rendered the elements it is supposed to.
 *
 *   npx tsx scripts/smoke.ts [baseUrl]
 *
 * Screenshots land in .smoke/ for eyeballing light and dark.
 */
import { chromium, type ConsoleMessage, type Page } from 'playwright';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGORA_OPEN } from '../src/lib/agora-gate.ts';
import { translate } from '../src/lib/i18n.ts';
import { hasDoubleEncoding } from './encoding-guard.ts';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '.smoke');

/**
 * The emitted dataset stats — the same build output the /data coverage section
 * renders. Written by `npm run data`; reading the expected numbers from here
 * (rather than typing 3 and 8 into the assertion) is what makes a hand-typed
 * number in the page fail while every other gate stays green. The readFileSync
 * pattern is the one test-paper.ts uses for the same file.
 */
const STATS: Record<string, string> = JSON.parse(
	readFileSync(join(HERE, '..', 'src', 'generated', 'stats.json'), 'utf8')
);

/**
 * The world view is allowed to ship without a fetched measurement snapshot.  The
 * smoke test reads the emitted bundle only to decide which optional measurement
 * witness is meaningful; it never turns a fetched number into a UI expectation.
 * In particular, a flow edge is only required when this snapshot has a current
 * flow whose other end is a graph institution.
 */
const WORLD_SNAPSHOT = JSON.parse(
	readFileSync(join(HERE, '..', 'src', 'generated', 'world.json'), 'utf8')
) as {
	flows: {
		years: number[];
		partners: Record<string, { out: (number | null)[]; in: (number | null)[] }>;
	} | null;
	debt: {
		years: number[];
		creditors: Record<string, { stock: (number | null)[] }>;
		bodies: Record<string, { stock: (number | null)[] }>;
	} | null;
};
const GRAPH_SNAPSHOT = JSON.parse(
	readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8')
) as { institutions: { id: string; iso2?: string }[] };

/** The Network opens on the same 14 January 2011 instant as the application. */
const NETWORK_DEFAULT_YEAR = 2011;

function snapshotSlot(years: number[], year: number): number {
	let slot = -1;
	for (let i = 0; i < years.length; i++) {
		if (years[i] <= year) slot = i;
		else break;
	}
	return slot;
}

/**
 * Return graph-backed flow endpoints the Network is supposed to synthesise at
 * its default date.  This mirrors the view's top-20 cut, but deliberately does
 * not assert a particular country or value: either snapshot may be absent or
 * revised, and a graph may know none of the snapshot's current partners.
 */
function graphBackedFlowEndpoints(year: number): string[] {
	const graphByIso = new Map(
		GRAPH_SNAPSHOT.institutions
			.map((i) => [i.iso2, i.id] as const)
			.filter(([iso, id]) => Boolean(iso && id))
	);
	const ids = new Set<string>();
	const flows = WORLD_SNAPSHOT.flows;
	if (flows) {
		const i = snapshotSlot(flows.years, year);
		if (i >= 0) {
			const trade = Object.entries(flows.partners)
				.map(([iso2, row]) => ({
					iso2,
					total: (row.out[i] ?? 0) + (row.in[i] ?? 0)
				}))
				.filter((row) => row.total > 0)
				.sort((a, b) => b.total - a.total)
				.slice(0, 20);
			for (const row of trade) {
				const id = graphByIso.get(row.iso2);
				if (id) ids.add(id);
			}
		}
	}

	const debt = WORLD_SNAPSHOT.debt;
	if (debt) {
		const i = snapshotSlot(debt.years, year);
		if (i >= 0) {
			const creditors = Object.entries(debt.creditors)
				.map(([iso2, row]) => ({ iso2, stock: row.stock[i] }))
				.filter((row) => row.stock !== null)
				.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
				.slice(0, 20);
			for (const row of creditors) {
				const id = graphByIso.get(row.iso2);
				if (id) ids.add(id);
			}
			// Seated bodies are addressed by their institution id, not by the
			// country hosting their seat.  They are equally valid flow endpoints.
			const bodies = Object.entries(debt.bodies)
				.map(([id, row]) => ({ id, stock: row.stock[i] }))
				.filter((row) => row.stock !== null)
				.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
				.slice(0, 20);
			for (const row of bodies) {
				if (GRAPH_SNAPSHOT.institutions.some((inst) => inst.id === row.id)) ids.add(row.id);
			}
		}
	}
	return [...ids];
}

interface Check {
	path: string;
	name: string;
	/** CSS selectors that must be present, with a minimum count. */
	expect: [selector: string, min: number][];
	/**
	 * Box-level paint floor: [selector, minWidth, minHeight, minCount].
	 * Existence is not paint: the survival matrix spent months at 0x1px
	 * while every computed colour was perfectly correct, because a Tooltip
	 * wrapper had swallowed the grid slot. Count-based checks cannot see
	 * that class of bug; this one fails if ANY rendered element matching
	 * the selector is smaller than the floor.
	 */
	paint?: [selector: string, minW: number, minH: number, minCount: number][];
}

const CHECKS: Check[] = [
	{
		// The atlas's home. NOT '/' — the root belongs to the landing page in
		// production, and the dev-only redirect that used to answer '/' for the
		// app made this check a lie about what a reader on the deployed site sees.
		path: '/chronicle',
		name: 'chronicle',
		expect: [
			['.menubar', 1],
			// Tier one and tier two of the navigation. Two bubbles exactly: if a third
			// section ever appears here it is a decision to be made deliberately, not a
			// thing that should slip in.
			['.bubbles a', 2],
			['.subnav', 1],
			['.subnav .strip a', 6],
			['.dock', 1],
			['.track .playhead', 1],
			['.era-band', 7],
			['.chronicle svg', 1],
			['.bar', 20]
		],
		paint: [
			// Floor is NON-ZERO, not 'readable': a 5-month tenure is genuinely
			// ~2px wide at 4px/year, and zoom is the answer to reading it. What
			// this catches is the 0-height bar - a tenure that does not exist.
			['.bar', 1, 1, 20]
		]
	},
	{
		path: '/network',
		name: 'network',
		expect: [
			['.dock', 1],
			// Lane headers and names are HTML over the canvas now, not SVG text — see
			// src/lib/viz/labels.css. Asserting on .vlabel is what catches the label
			// placement pass silently suppressing everything, which would leave a
			// perfectly rendered graph with nothing named on it.
			['.vlane', 4],
			['.vlabel', 4],
			// Only live nodes are drawn at the overview now — the four hundred dormant
			// ones appear on zoom. 20 is well under the ~38 live at the default date and
			// still catches the view rendering nothing.
			['.node', 20],
			['.edge', 10],
			// Every reachable edge needs its fat invisible twin, or connections are
			// untappable on a phone.
			['.hit', 10],
			['.viewnav button', 3]
		],
		paint: [['.node', 3, 3, 20]]
	},
	{
		path: '/world',
		name: 'world',
		expect: [
			['.worldpage', 1],
			['.totals', 1],
			['.viewbar', 1],
			['.world', 1]
		]
	},
	{
		path: '/world/france',
		name: 'world-dossier',
		expect: [
			['.dossier', 1],
			['.dossier .hero', 1],
			['.dossier .metrics', 1],
			['.dossier .section', 3]
		]
	},
	{
		path: '/atlas',
		name: 'atlas',
		expect: [
			['.dock', 1],
			['figure svg', 7],
			['.m-row', 10],
			['table.cross', 1]
		],
		paint: [
			// The survival matrix's held cells collapsed to 0x1px for months
			// (Tooltip wrapper swallowed the grid slot). This floor is its tombstone.
			['.m-cell.held', 20, 8, 30]
		]
	},
	{
		path: '/rankings',
		name: 'rankings',
		expect: [
			['.dock', 1],
			['tbody tr', 5],
			['.lcard', 5]
		]
	},
	{
		path: '/investigate',
		name: 'investigate',
		expect: [
			['.dock', 1],
			['.presets button', 4],
			['.modes button', 3]
		]
	},
	{
		path: '/map',
		name: 'map',
		expect: [
			// The map shell renders immediately; the basemap and governorates arrive
			// with the client-side fetch. A hydrated map shows at least the 24
			// governorate polygons and the table alternative.
			['.map-view', 1],
			['.canvas', 1],
			['.table-alt', 1]
		]
	},
	// The three currency tiers must all render. Merging them would be the page's one
	// serious failure mode — it would present unverified security posts as confirmed —
	// so assert the tier headers exist rather than only counting rows.
	{ path: '/now', name: 'now', expect: [['.holders li', 20], ['.holders', 3], ['.silent li', 5]] },
	// The disclaimer is load-bearing, not decoration: it is the difference between a
	// link to somebody else's headline and a claim this project stands behind. Assert
	// it renders, alongside the items and the entity links.
	{ path: '/feed', name: 'feed', expect: [['.items li', 20], ['.notice', 1], ['.ent', 3]] },
	{ path: '/evidence', name: 'evidence', expect: [['.tabs button', 5], ['.hyp', 6], ['.bb', 4]] },
	// Turnover rows are derived, so the count moves with the data; 8 is well under the
	// 18 offices that currently qualify and still catches the panel silently emptying.
	{ path: '/atlas', name: 'atlas-turnover', expect: [['.turn li', 8], ['.t-notch', 8]] },
	{ path: '/methodology', name: 'method', expect: [['.base', 4], ['table.weights tr', 20]] },
	{
		path: '/about',
		name: 'about',
		expect: [
			['.status .stat', 6],
			['table.funders', 1],
			['table.review tbody tr', 5],
			// The coverage audit: one row per president. It is the page's least
			// flattering table, which is exactly why it should fail loudly if dropped.
			['table.coverage tbody tr', 6]
		]
	},
	// Generated from version control, so the row count is whatever the history holds.
	// Asserting >=1 entry catches the real failure — git unreachable at build time,
	// which silently empties the page — without pinning the test to a commit count.
	{
		path: '/corrections',
		name: 'corrections',
		expect: [['.entries .entry', 1], ['.filters button', 4]]
	},
	{ path: '/data', name: 'data', expect: [['.dl', 4], ['table.schema tr', 6]] },
	/*
	 * Agora is gated by the AGORA_OPEN flag in $lib/agora-gate.ts. Closed (the
	 * default): the page is a coming-soon banner, rendered statically, and the
	 * community API is deliberately not called — a reader is never asked to reach
	 * a service that is not accepting them. Open: the live client renders, whose
	 * data comes from /api answered by the community worker — which may not be
	 * running in CI, so only the privacy notice (present before anyone can type)
	 * is asserted. Either way the section shell must mount.
	 */
	{
		path: '/agora',
		name: 'agora',
		expect: AGORA_OPEN
			? [
					['.agora', 1],
					['.privacy', 1],
					['.privacy p', 4]
				]
			: [
					['.agora', 1],
					['.soon', 1]
				]
	},
	/*
	 * The guide (W1) — the orientation page. Two of its parts are rendered live
	 * from the same sources the rest of the interface reads, so drift there is a
	 * real drift: the four-basis legend comes from BASIS_ORDER and the views
	 * table from src/lib/views.ts (the exact list the caption line answers).
	 * The row counts are structural — 15 views, 4 bases — and the help entry is
	 * the door from every view into this page, so it must actually point at it.
	 */
	{
		path: '/guide',
		name: 'guide',
		expect: [
			['.page-head h1', 1],
			['table.views tbody tr', 15],
			['.bases .base', 4],
			['a.help', 1],
			['a.help[href="/guide"]', 1]
		]
	},

	/*
	 * Media surface — investigative reading.
	 * Three routes share one shell: the index, the gateway, and the article.
	 * Each must render its chrome in both themes and on phone, and in three
	 * locales (via LOCALE_ROUTES). The article's evidence markers and entity
	 * mentions are the instrument's prose-level claims: they must carry the
	 * accessibility contract (aria-expanded/controls, aria-label) and the
	 * ledger must be a real table, not a styled div.
	 */
	{
		path: '/media',
		name: 'media-index',
		expect: [
			['.page', 1],
			['.page-head h1', 1],
			['.card', 1]
		]
	},
	{
		path: '/media/chemical-century',
		name: 'media-gateway',
		expect: [
			['.page', 1],
			['.page-head h1', 1],
			['.primary-cta', 1],
			['.evidence-profile', 1],
			['.views-grid', 1]
		]
	},
	{
		path: '/media/chemical-century/article',
		name: 'media-article',
		expect: [
			['.article-layout', 1],
			['.article-col', 1],
			['.narrative', 1],
			['.sidebar', 1],
			['.ledger', 1],
			['.ledger table', 1],
			['.ledger th[scope]', 2],
			['button.indicator', 1],
			['button.mention', 1]
		]
	}
];

/** Noise we accept: browser-level requests we do not control. */
function isIgnorable(text: string) {
	return text.includes('favicon') || text.includes('Download the React DevTools');
}

/**
 * Every request the page makes must stay on this origin.
 *
 * This site loaded webfonts from fonts.googleapis.com and fonts.gstatic.com until
 * July 2026, which told Google every reader's IP, User-Agent and — through the
 * Referer header — which page they were reading. Opening a named official's entry
 * disclosed that you had opened it. The fonts are now served from static/fonts/.
 *
 * This assertion, not anybody's memory, is what stops that coming back — and it
 * generalises: no analytics, no CDN, no icon service, no map tiles, ever. Both
 * Google hosts used to sit in isIgnorable() above, which is precisely how a leak
 * hides in a green test suite.
 *
 * data: and blob: URLs are inlined by definition and reach nobody.
 */
function isCrossOrigin(url: string) {
	if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return false;
	try {
		return new URL(url).origin !== new URL(BASE).origin;
	} catch {
		return false;
	}
}

/**
 * Wait for the app to actually be interactive, rather than for a guessed duration.
 *
 * The boot screen covers the shell on first visit and every context here is a fresh
 * session, so it runs every time. Tests used a flat 2600ms, which was always a race:
 * it was quietly marginal, and the first startup work that pushed past it turned a
 * scrub test into a pointerdown delivered to `div.boot`. Waiting for the overlay to
 * detach is both correct and faster than the fixed sleep it replaces.
 */
async function settle(page: Page) {
	await page.waitForSelector('.boot', { state: 'detached', timeout: 15_000 }).catch(() => {});
	// A smoke run is a returning reader, not a first visit: dismiss the guided
	// tour the way a real returning session already has. Escape both closes it
	// and writes the seen-flag, which is the exact state this context should
	// have had — the tour's click-catcher swallows every interaction by design.
	if (await page.locator('.catch').count()) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(250);
	}
	// One frame for the view underneath to lay out after the overlay goes.
	await page.waitForTimeout(250);
}

const failures: string[] = [];
let checksRun = 0;

function ok(name: string, pass: boolean, detail = '') {
	checksRun++;
	if (pass) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures.push(name);
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// SMOKE_CHROMIUM: use a system browser instead of Playwright's bundled one
// (e.g. SMOKE_CHROMIUM=/usr/bin/chromium) — for machines where the ~174MB
// bundled download stalls. Unset = default bundled browser, unchanged.
const browser = await chromium.launch(
	process.env.SMOKE_CHROMIUM
		? { executablePath: process.env.SMOKE_CHROMIUM }
		: undefined,
);

for (const themeName of ['dark', 'light'] as const) {
	console.log(`\n  ── ${themeName} ──`);
	const context = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		colorScheme: themeName,
		reducedMotion: 'no-preference'
	});

	for (const check of CHECKS) {
		const page = await context.newPage();
		const problems: string[] = [];
		const offsite: string[] = [];

		page.on('request', (r) => {
			if (isCrossOrigin(r.url())) offsite.push(r.url());
		});
		page.on('console', (m: ConsoleMessage) => {
			if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
				problems.push(`[${m.type()}] ${m.text()}`);
			}
		});
		page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
		page.on('requestfailed', (r) => {
			if (!isIgnorable(r.url())) problems.push(`[404] ${r.url()}`);
		});

		try {
			await page.goto(BASE + check.path, { waitUntil: 'networkidle', timeout: 30_000 });
			// The boot screen runs on first visit; wait it out so we measure the app.
			await settle(page);

			// Did anything actually paint? A hydration crash leaves a blank body.
			const painted = await page.evaluate(() => {
				const el = document.querySelector('.os');
				if (!el) return { ok: false, why: 'no .os shell' };
				const r = el.getBoundingClientRect();
				const text = (document.body.innerText || '').trim().length;
				return { ok: r.height > 200 && text > 40, why: `h=${Math.round(r.height)} text=${text}` };
			});
			ok(`${themeName}/${check.name} rendered`, painted.ok, painted.why);

			for (const [selector, min] of check.expect) {
				const n = await page.locator(selector).count();
				ok(`${themeName}/${check.name} ${selector} >= ${min}`, n >= min, `found ${n}`);
			}

			for (const [selector, minW, minH, minCount] of check.paint ?? []) {
				const audit = await page.evaluate(
					([sel, w, h]) => {
						const els = [...document.querySelectorAll(sel)];
						let degenerate = 0;
						let first = '';
						for (const el of els) {
							const r = el.getBoundingClientRect();
							if (r.width < w || r.height < h) {
								degenerate += 1;
								if (!first)
									first = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`;
							}
						}
						return { total: els.length, degenerate, first };
					},
					[selector, minW, minH]
				);
				const pass = audit.total >= minCount && audit.degenerate === 0;
				ok(
					`${themeName}/${check.name} paint ${selector} >= ${minCount} @ ${minW}x${minH}`,
					pass,
										pass ? `${audit.total} ok` : `found ${audit.total}, degenerate ${audit.degenerate}${audit.first ? ` — first: ${audit.first}` : ''}`
				);
			}

			// Theme must actually be applied, and surfaces must differ between themes.
			const applied = await page.evaluate(() => ({
				attr: document.documentElement.dataset.theme,
				bg: getComputedStyle(document.body).backgroundColor
			}));
			ok(
				`${themeName}/${check.name} theme applied`,
				applied.attr === themeName,
				`data-theme=${applied.attr} bg=${applied.bg}`
			);

			ok(`${themeName}/${check.name} console clean`, problems.length === 0, problems.slice(0, 4).join(' | '));

			ok(
				`${themeName}/${check.name} no offsite requests`,
				offsite.length === 0,
				offsite.length ? offsite.slice(0, 3).join(' | ') : 'same-origin only'
			);

			await page.screenshot({ path: join(OUT, `${themeName}-${check.name}.png`), fullPage: false });
		} catch (e) {
			ok(`${themeName}/${check.name} loaded`, false, (e as Error).message.split('\n')[0]);
		}
		await page.close();
	}
	await context.close();
}

// --- World projections -------------------------------------------------------
/*
 * W0/W1/W2: the globe, ledger and dossier are one state with different
 * projections. The route sweep above proves the two route shells paint in both
 * themes; this block pins the URL-driven projection switch and the degradation
 * contract that matters on a fresh clone. A missing flows snapshot may remove
 * measurement rows, but it must not remove the totals strip, the real table, or
 * the agreement/empty-state explanation around it.
 */
console.log('\n  ── world projections ──');
{
	for (const themeName of ['dark', 'light'] as const) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			colorScheme: themeName
		});
		const problems: string[] = [];
		context.on('page', (p) => {
			p.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
			p.on('console', (m) => {
				if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
					problems.push(`[${m.type()}] ${m.text()}`);
				}
			});
		});

		{
			const page = await context.newPage();
			await page.goto(BASE + '/world?view=ledger', { waitUntil: 'networkidle', timeout: 30_000 });
			await settle(page);
			await page.waitForTimeout(300);
			const ledger = (await page.evaluate(`(() => ({
				url: location.search,
				ledger: document.querySelectorAll('.ledger').length,
				globe: document.querySelectorAll('.world').length,
				totals: document.querySelectorAll('.totals').length,
				table: document.querySelectorAll('.ledger table').length,
				totalsrow: document.querySelectorAll('.ledger .totalsrow').length,
				agreementOrEmpty: document.querySelectorAll('.ledger tbody tr.sectionhead, .ledger tbody tr.emptyrow').length,
				provenance: document.querySelectorAll('.ledger .prov').length
			}))()`)) as {
				url: string;
				ledger: number;
				globe: number;
				totals: number;
				table: number;
				totalsrow: number;
				agreementOrEmpty: number;
				provenance: number;
			};

			ok(
				`${themeName}/world?view=ledger consumes the query parameter`,
				ledger.url.includes('view=ledger') && ledger.ledger === 1 && ledger.globe === 0,
				JSON.stringify(ledger)
			);
			ok(`${themeName}/world ledger totals strip remains present`, ledger.totals === 1);
			ok(
				`${themeName}/world ledger is a real table with a totals row`,
				ledger.table === 1 && ledger.totalsrow === 1,
				`tables=${ledger.table}, totals rows=${ledger.totalsrow}`
			);
			ok(
				`${themeName}/world ledger keeps agreement/empty-state chrome`,
				ledger.agreementOrEmpty >= 1 && ledger.provenance === 1,
				`agreement/empty=${ledger.agreementOrEmpty}, provenance=${ledger.provenance}`
			);
			await page.close();
		}

		{
			const page = await context.newPage();
			await page.goto(BASE + '/world?view=globe', { waitUntil: 'networkidle', timeout: 30_000 });
			await settle(page);
			await page.waitForTimeout(300);
			const globe = (await page.evaluate(`(() => ({
				url: location.search,
				globe: document.querySelectorAll('.world').length,
				ledger: document.querySelectorAll('.ledger').length,
				totals: document.querySelectorAll('.totals').length
			}))()`)) as { url: string; globe: number; ledger: number; totals: number };
			ok(
				`${themeName}/world?view=globe returns the globe surface`,
				globe.url.includes('view=globe') && globe.globe === 1 && globe.ledger === 0,
				JSON.stringify(globe)
			);
			ok(`${themeName}/world globe keeps the totals strip`, globe.totals === 1);
			await page.close();
		}

		ok(`${themeName}/world projection console clean`, problems.length === 0, problems.slice(0, 3).join(' | '));
		await context.close();
	}

	/*
	 * Measure the shell, not document.scrollWidth. The app shell is fixed and
	 * overflow-hidden by design, so the document metric can never see a ledger
	 * that has stretched the viewport. The ledger's own .scroll container may be
	 * wider than the phone — that is the reachable table alternative, not shell
	 * overflow — while .os itself must remain exactly viewport width and unpanned.
	 */
	{
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
			colorScheme: 'dark'
		});
		const page = await context.newPage();
		await page.goto(BASE + '/world?view=ledger', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		const shell = (await page.evaluate(`(() => {
			const os = document.querySelector('.os');
			if (!os) return null;
			return {
				client: os.clientWidth,
				scroll: os.scrollWidth,
				scrollLeft: os.scrollLeft,
				ledger: document.querySelectorAll('.ledger').length,
				table: document.querySelectorAll('.ledger table').length
			};
		})()`)) as {
			client: number;
			scroll: number;
			scrollLeft: number;
			ledger: number;
			table: number;
		} | null;
		ok(
			'phone /world?view=ledger reads the ledger projection',
			Boolean(shell && shell.ledger === 1 && shell.table === 1),
			shell ? `${shell.ledger} ledger, ${shell.table} table` : 'no shell'
		);
		ok(
			'phone /world?view=ledger has no horizontal shell overflow',
			Boolean(shell && shell.scroll <= shell.client + 1),
			shell ? `${shell.scroll}px scroll width / ${shell.client}px client width` : 'no shell'
		);
		ok(
			'phone /world?view=ledger leaves the shell unpanned',
			Boolean(shell && shell.scrollLeft === 0),
			shell ? `scrollLeft=${shell.scrollLeft}` : 'no shell'
		);
		await page.close();
		await context.close();
	}
}

// --- Interaction: the things that make it an app rather than a page ---------

console.log('\n  ── interaction ──');
{
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	const page = await context.newPage();
	const problems: string[] = [];
	page.on('pageerror', (e) => problems.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !isIgnorable(m.text())) problems.push(m.text());
	});

	await page.goto(BASE + '/chronicle', { waitUntil: 'networkidle' });
	await settle(page);

	// Scrub the timeline and confirm the readout changed.
	const before = await page.locator('.readout .date').innerText();
	const box = await page.locator('.track').boundingBox();
	if (box) {
		await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 8 });
		await page.mouse.up();
	}
	await page.waitForTimeout(400);
	const after = await page.locator('.readout .date').innerText();
	ok('scrubbing the dock changes the date', before !== after, `${before} -> ${after}`);

	// Evidence threshold must actually change what is drawn.
	const barsBefore = await page.locator('.bar').count();
	await page.locator('.dial .steps button, .filters .seg button').first().click();
	await page.waitForTimeout(400);
	const barsAfter = await page.locator('.bar').count();
	ok(
		'raising the evidence threshold removes claims',
		barsAfter < barsBefore,
		`${barsBefore} -> ${barsAfter} bars`
	);

	// Selecting a person opens the inspector.
	await page.locator('.bar').first().click();
	await page.waitForTimeout(500);
	const inspector = await page.locator('.inspector').count();
	ok('clicking a tenure opens the inspector', inspector === 1);

	// The life ribbon: renders, caption carries the coverage counts, a mark
	// click opens the detail line, and the list alternative exists. The panel
	// body is scrolled by setting its own scrollTop - never scrollIntoView,
	// which pans the whole fixed shell (AGENTS.md trap).
	ok('entity timeline ribbon renders', (await page.locator('.etl .ribbon').count()) === 1);
	ok(
		'timeline caption carries kind counts',
		(await page.locator('.etl .caption .kc').count()) >= 1
	);
	await page.evaluate(() => {
		const etl = document.querySelector('.etl');
		const scroller = etl && etl.closest('.body');
		if (etl && scroller) {
			const dr = etl.getBoundingClientRect();
			const sr = scroller.getBoundingClientRect();
			scroller.scrollTop += dr.top - sr.top - 60;
		}
	});
	await page.waitForTimeout(200);
	await page.locator('.etl .hit').last().click();
	await page.waitForTimeout(200);
	ok('timeline mark click opens the detail line', (await page.locator('.etl .detail').count()) === 1);
	ok('timeline list alternative present', (await page.locator('.etl details.list').count()) === 1);
	// Paint floor for the ribbon's marks: existence is not paint. A mark at
	// under 3px in either axis is the 0x1px class of bug that kept the
	// survival matrix dark for months.
	const markPaint = await page.evaluate(() => {
		const marks = [...document.querySelectorAll('.etl .mark')];
		let degenerate = 0;
		for (const m of marks) {
			const r = m.getBoundingClientRect();
			if (r.width < 3 || r.height < 3) degenerate += 1;
		}
		return { total: marks.length, degenerate };
	});
	ok(
		'timeline marks have real boxes',
		markPaint.total >= 1 && markPaint.degenerate === 0,
		`${markPaint.total} marks, ${markPaint.degenerate} degenerate`
	);

	// Settings: themes and the accent both live behind the gear. A theme is one
	// complete look — mode and character together — so switching asserts BOTH
	// attributes move as a pair.
	await page.locator('.gear').click();
	await page.waitForTimeout(200);
	ok('gear opens settings', (await page.locator('.settings').count()) === 1);

	const LAYER_KEYS = ['--layer-security', '--layer-political', '--layer-economic', '--layer-media', '--layer-judicial', '--layer-civil', '--layer-foreign'];
	const pair = () =>
		page.evaluate(
			`(() => { const d = document.documentElement.dataset;
				return d.theme + '/' + (d.palette || 'none'); })()`
		);
	const readVals = () =>
		page.evaluate((keys) => {
			const rs = keys.map((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim());
			rs.push(getComputedStyle(document.documentElement).getPropertyValue('--bridge').trim());
			return rs;
		}, LAYER_KEYS);
	const surface = () =>
		page.evaluate(
			"getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim()"
		);

	const start = await pair();
	const startSurface = await surface();

	/*
	 * The analytical-colour invariant, stated once and used twice: no palette may
	 * retune what a claim IS (--layer-*) or what it RESTS ON (--basis-*, guarded
	 * by the same L/C pair) or move --bridge. It can only be asserted BETWEEN two
	 * palettes of the SAME mode — crossing modes changes those colours BY DESIGN
	 * (light carries darker, more chromatic analytical tones than dark), so a
	 * cross-mode comparison would fail against correct behaviour.
	 */
	const layersOnPaper = await readVals();

	await page.locator('.settings .theme', { hasText: 'Porcelain' }).click();
	await page.waitForTimeout(300);
	const porcelainPair = await pair();
	ok(
		'theme picker applies mode + palette together (Porcelain)',
		porcelainPair === 'light/porcelain',
		`${start} -> ${porcelainPair}`
	);
	const porcelainSurface = await surface();
	ok(
		'theme switch retints surfaces',
		porcelainSurface !== startSurface,
		`${startSurface} -> ${porcelainSurface}`
	);
	const layersOnPorcelain = await readVals();
	ok(
		'palettes of one mode leave every --layer-* and --bridge untouched',
		layersOnPaper.every((v, i) => v === layersOnPorcelain[i]),
		layersOnPaper.join(' | ')
	);

	// Crossing the mode boundary: both attributes flip as one pair. No layer
	// assertion here — light and dark analytical tones are meant to differ.
	await page.locator('.settings .theme', { hasText: 'Midnight' }).click();
	await page.waitForTimeout(300);
	const midnightPair = await pair();
	ok(
		'theme picker crosses to dark (Midnight)',
		midnightPair === 'dark/midnight',
		`${porcelainPair} -> ${midnightPair}`
	);

	// System resolves to what the emulated OS prefers. This context declares no
	// colorScheme, and Playwright's default is light, so system must mean Paper —
	// the exact look we started on, surfaces included.
	await page.locator('.settings .theme.system').click();
	await page.waitForTimeout(300);
	const systemPair = await pair();
	ok('system resolves to the OS preference (light here)', systemPair === 'light/paper', systemPair);
	ok(
		'system restores the resolved theme exactly',
		(await surface()) === startSurface,
		startSurface
	);

	/*
	 * The accent is the one colour the reader owns, so assert it actually moves —
	 * and, more importantly, that nothing else does. A regression that wired the
	 * picker to the layer hues would recolour the evidence encoding, which is the
	 * failure this feature was designed around. Captured and compared within one
	 * stable theme for the same reason the palette invariant above is.
	 */
	const beforeVals = await readVals();

		// Slider is the sole accent control (swatch presets removed).
	await page.locator('.settings input[type="range"]').evaluate((el) => {
			el.value = '205';
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		});
	await page.waitForTimeout(300);
	const hue = await page.evaluate(
		"getComputedStyle(document.documentElement).getPropertyValue('--accent-hue').trim()"
	);
	ok('accent slider changes the accent hue', hue === '205', `--accent-hue=${hue}`);
	const afterVals = await readVals();
	ok('accent does not touch the layer hues', beforeVals[0] === afterVals[0], `${beforeVals[0]} -> ${afterVals[0]}`);
	ok(
		'accent does not touch --bridge (pinned to ochre)',
		beforeVals[beforeVals.length - 1] === afterVals[afterVals.length - 1],
		`${beforeVals[beforeVals.length - 1]} -> ${afterVals[afterVals.length - 1]}`
	);
	// All layers untouched, not just security.
	const allLayersUntouched = beforeVals.slice(0, -1).every((v, i) => v === afterVals[i]);
	ok(
		'accent leaves every --layer-* untouched',
		allLayersUntouched,
		beforeVals.slice(0, -1).join(' | ')
	);

	// Eclipse, the strongest contrast statement, still flips both attributes as a
	// pair — then back to system so the rest of the suite runs on its natural theme.
	await page.locator('.settings .theme', { hasText: 'Eclipse' }).click();
	await page.waitForTimeout(300);
	const eclipsePair = await pair();
	ok('eclipse applies dark/eclipse', eclipsePair === 'dark/eclipse', eclipsePair);

	await page.locator('.settings .theme.system').click();
	await page.waitForTimeout(300);

	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);

	// Tier-one navigation: crossing to Agora and back is one click each way.
	await page.locator('.bubbles a', { hasText: 'Agora' }).click();
	await page.waitForTimeout(500);
	ok('bubble navigates to Agora', page.url().includes('/agora'), page.url());
	ok('Agora sub-nav replaces the Graph one', (await page.locator('.subnav .strip a').count()) === 4);

	// Search palette.
	await page.keyboard.press('/');
	await page.waitForTimeout(300);
	ok('slash opens search', (await page.locator('.palette input').count()) === 1);
	await page.keyboard.type('Akrout');
	await page.waitForTimeout(400);
	ok('search finds a person', (await page.locator('.palette li button').count()) > 0);
	await page.keyboard.press('Escape');

	ok('interaction console clean', problems.length === 0, problems.slice(0, 3).join(' | '));

	await page.screenshot({ path: join(OUT, 'interaction.png') });
	await context.close();
}

// --- The timeline -----------------------------------------------------------
/*
 * The dock is the app's primary control and its labels are the easiest thing to
 * break, because they are positioned by percentage against a track whose width
 * depends on everything else in the shell.
 */
console.log('\n  ── timeline ──');
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(BASE + '/chronicle', { waitUntil: 'networkidle' });
	await settle(page);

	/*
	 * No era name may extend past its own band. They were `nowrap` inside an
	 * `overflow: hidden` parent, which cut them at whatever character landed on the
	 * edge — "Presidential re-ce" — and that reads as a rendering fault rather than an
	 * abbreviation. Measuring the boxes is the only way to catch it; the text content
	 * is correct either way.
	 */
	const spill = (await page.evaluate(`(() => {
		const out = [];
		for (const el of document.querySelectorAll('.era-band')) {
			const name = el.querySelector('.era-name');
			if (!name) continue;
			const a = name.getBoundingClientRect();
			const b = el.getBoundingClientRect();
			if (a.right > b.right + 1 || a.left < b.left - 1) {
				out.push((name.textContent || '').trim().slice(0, 24));
			}
		}
		return out;
	})()`)) as string[];
	ok('era names stay inside their bands', spill.length === 0, spill.join(' | '));

	// Hovering the track answers "what is here" without going there.
	const box = (await page.locator('.track').boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
	await page.waitForTimeout(250);
	ok('hovering the track previews that date', (await page.locator('.preview').count()) === 1);
	const before = await page.evaluate('window.__t = document.querySelector(".head-year").textContent');
	ok('previewing does not move the playhead', typeof before === 'string' && before.length === 4, String(before));

	// Ruptures are the most useful points on the track; they must name themselves.
	await page.locator('.rupture').first().hover();
	await page.waitForTimeout(250);
	ok('a rupture names itself on hover', (await page.locator('.rupture-name').count()) === 1);

	// And clicking one goes there.
	await page.locator('.rupture').first().click();
	await page.waitForTimeout(400);
	const after = await page.locator('.head-year').textContent();
	ok('clicking a rupture jumps the playhead', after !== before, `${before} -> ${after}`);

	// The curve is the honesty signal — thin before 1987 because the archive is thin.
	// The marker is what attaches it to a number, so it has to actually track.
	const high = await page.evaluate(
		"parseFloat(getComputedStyle(document.querySelector('.coverage')).bottom)"
	);
	// The band surface is deliberately pointer-events:none — it tiles the whole track
	// and would swallow every scrub — so the label is the target. See AGENTS.md.
	await page.locator('.era-name').first().click();
	await page.waitForTimeout(500);
	const low = await page.evaluate(
		"parseFloat(getComputedStyle(document.querySelector('.coverage')).bottom)"
	);
	ok(
		'the coverage marker rides the density curve',
		Number.isFinite(high) && Number.isFinite(low) && high !== low,
		`${high}px -> ${low}px`
	);

	await page.screenshot({ path: join(OUT, 'timeline.png') });
	await context.close();
}

// --- Chronicle navigation ---------------------------------------------------
/*
 * The Chronicle was the last major view driving its own gestures, which is how it
 * ended up with no pinch support, no inertia, and a pan surface that had been dead
 * for some time — the rect carrying the pointer handlers also carried
 * `pointer-events: none`, so dragging the chart did nothing at all and nothing
 * caught it. It now shares the axis camera; these assert the verbs work.
 */
console.log('\n  ── chronicle navigation ──');
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto(BASE + '/chronicle', { waitUntil: 'networkidle' });
	await settle(page);

	const firstTick = () => page.locator('.plot .tick-label').first().textContent();
	const box = (await page.locator('.plot').boundingBox())!;
	const y = box.y + 120;

	/*
	 * Zoom before panning. At full range the domain already spans the entire record,
	 * so every pan is correctly clamped straight back — testing the drag first
	 * measures the clamp, not the gesture.
	 */
	await page.mouse.move(box.x + box.width / 2, y);
	await page.mouse.wheel(0, -600);
	await page.waitForTimeout(500);
	const zoomed = await page.getByRole('button', { name: /full range|toute la période|المدى/i }).count();
	ok('wheel-zoom narrows the window', zoomed >= 1);

	/*
	 * Selecting a person marks the tenures of everyone they are documented as
	 * connected to. This is the Chronicle's answer to the project's actual question —
	 * whether a relationship is genuinely continuous or reconstructed after a rupture —
	 * and it is only answerable on a view that shows when things overlapped.
	 *
	 * Bourguiba is the right subject, and picking it took two tries worth recording.
	 * Only person-to-person ties can mark anything, because institutions never hold a
	 * post and so never own a bar. Ben Ali's documented ties are all family who held
	 * no office, so he correctly marks nothing; Bourguiba's son was his foreign
	 * minister, which is exactly the overlap this view exists to show.
	 */
	await page.keyboard.press('/');
	await page.waitForTimeout(300);
	await page.keyboard.type('Habib Bourguiba');
	await page.waitForTimeout(500);
	await page.locator('.palette li button').first().click();
	await page.waitForTimeout(700);
	const tied = await page.locator('.bar.tied').count();
	ok('selecting a person marks their documented connections', tied > 0, `${tied} tenures marked`);
	ok(
		'and those are distinct from the selection',
		(await page.locator('.bar.focus').count()) > 0 &&
			(await page.locator('.bar.tied.focus').count()) === 0
	);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(400);

	/*
	 * Re-measured here, not reused from before the selection test above: opening the
	 * inspector takes 400px off the viewport, so a box captured earlier describes a
	 * plot that has since moved. Dragging against stale coordinates silently misses.
	 */
	const drag = (await page.locator('.plot').boundingBox())!;
	const dy = drag.y + 120;
	const before = await firstTick();
	await page.mouse.move(drag.x + drag.width * 0.7, dy);
	await page.mouse.down();
	await page.mouse.move(drag.x + drag.width * 0.35, dy, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(600);
	const after = await firstTick();
	ok('dragging the chronicle pans time', after !== before, `${before} -> ${after}`);

	await context.close();
}

// --- Connections are records ------------------------------------------------
/*
 * A relationship used to be a hover tooltip in the corner of the canvas: the only
 * object in the project you could see but not address. Since almost every contested
 * claim in this dataset is an edge rather than a node, that mattered — so the card,
 * and specifically its route into the Agora, is asserted rather than assumed.
 */
console.log('\n  ── connections ──');
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const problems: string[] = [];
	page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
	page.on('console', (m: ConsoleMessage) => {
		if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
			problems.push(`[${m.type()}] ${m.text()}`);
		}
	});

	await page.goto(BASE + '/network', { waitUntil: 'networkidle' });
	await settle(page);

	/*
	 * The camera must have measured itself.
	 *
	 * Its viewBox IS cam.vw/vh, so a 1×1 viewBox on a 1400px canvas means the camera
	 * never initialised — nodes still draw, but every lane header and label is culled
	 * as off-screen and the zoom readout is computed against a one-pixel viewport. It
	 * happened in a real browser and produced no error of any kind. Playwright's
	 * ResizeObserver fires reliably, so this assertion is unlikely to fail here; it is
	 * the written-down invariant, and it will catch a regression that stops fit()
	 * running at all.
	 */
	const cam = (await page.evaluate(`(() => {
		const svg = document.querySelector('.canvas svg');
		const box = document.querySelector('.canvas');
		if (!svg || !box) return null;
		const vb = (svg.getAttribute('viewBox') || '').split(/\\s+/).map(Number);
		return { vbW: vb[2] || 0, boxW: Math.round(box.getBoundingClientRect().width) };
	})()`)) as { vbW: number; boxW: number } | null;
	ok(
		'the camera measured its viewport',
		Boolean(cam && cam.boxW > 100 && Math.abs(cam.vbW - cam.boxW) <= 2),
		cam ? `viewBox ${Math.round(cam.vbW)} vs canvas ${cam.boxW}` : 'no canvas'
	);

	/*
	 * Measurements are derived at runtime, never authored in
	 * data/relationships.yaml.  Require the witness only when the committed
	 * snapshot has a positive top-20 flow and the same ISO2 already resolves to a
	 * graph institution.  A fresh clone, an old snapshot, or a snapshot whose
	 * partners have no graph record therefore degrades to a passing no-witness
	 * branch rather than forcing a machine-generated relationship into canonical
	 * data.  `.edge.measurement` is the DOM encoding of `id.startsWith('flow-')`
	 * (NetworkView's `isMeasurementEdge`), so this does not depend on a fabricated
	 * relationship id being added to the graph.
	 */
	const flowEndpoints = graphBackedFlowEndpoints(NETWORK_DEFAULT_YEAR);
	const measurementEdges = await page.locator('.edge.measurement').count();
	ok(
		'network renders a flow- edge only for a snapshot-backed graph endpoint',
		flowEndpoints.length === 0 || measurementEdges > 0,
		flowEndpoints.length
			? `${measurementEdges} measurement edges for ${flowEndpoints.slice(0, 3).join(', ')}`
			: 'no committed snapshot endpoint requires a flow edge'
	);

	/*
	 * Clicking a node on the canvas.
	 *
	 * Untested until now, and that gap hid a real defect: the gesture layer took
	 * pointer capture on pointerdown, and an active capture makes the browser retarget
	 * the compatibility `click` event to the capturing element — so every tap on a node
	 * was delivered to the container and the node itself never saw it. Capture is now
	 * deferred until the pointer has actually moved.
	 *
	 * The target cannot be `.first()`. The lane-header band is HTML over the canvas
	 * and overlays the first row of nodes in every lane — the four service
	 * institutions sit directly under the "Security" header, so the topmost node is
	 * unreachable by any pointer (Playwright's actionability check refuses, and a
	 * human click would hit the header too). Scan for the first node whose centre is
	 * clear of the header buttons and click its exact centre — the gesture layer
	 * measures from the real pointer position, so this exercises the same path as a
	 * tap on a reachable node.
	 */
	const nodeTarget = (await page.evaluate(`(() => {
		const nodes = Array.from(document.querySelectorAll('.node'));
		const lanes = Array.from(document.querySelectorAll('.vlane')).map(function (b) {
			const r = b.getBoundingClientRect();
			return { l: r.left, t: r.top, r: r.right, b: r.bottom };
		});
		const hit = function (x, y) {
			return lanes.some(function (l) { return x >= l.l && x <= l.r && y >= l.t && y <= l.b; });
		};
		for (const n of nodes) {
			const r = n.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue;
			const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
			if (!hit(cx, cy)) return { x: cx, y: cy };
		}
		return null;
	})()`)) as { x: number; y: number } | null;
	ok(
		'a canvas node is reachable by the pointer',
		Boolean(nodeTarget),
		nodeTarget ? `x=${Math.round(nodeTarget.x)} y=${Math.round(nodeTarget.y)}` : 'every node sits under a lane header'
	);
	if (nodeTarget) {
		await page.mouse.click(nodeTarget.x, nodeTarget.y);
		await page.waitForTimeout(700);
		ok('clicking a node on the canvas selects it', (await page.locator('.inspector').count()) === 1);
	}
	await page.keyboard.press('Escape');
	await page.waitForTimeout(300);

	// Driven from the table row rather than by hunting for a curve's pixels: that
	// button is also the keyboard route, so testing it covers both.
	await page.locator('.a11y summary').click();
	await page.waitForTimeout(200);
	await page.locator('.rowopen').first().click();
	await page.waitForTimeout(700);

	ok('a connection opens a card', (await page.locator('.edgecard .card').count()) === 1);
	ok('the card names both ends', (await page.locator('.edgecard .end').count()) === 2);
	ok('the pinned edge is marked on the map', (await page.locator('.edge.pinned').count()) >= 1);

	/*
	 * The card's community doors, gated like the rest of the Agora.
	 *
	 * Closed: the discuss/propose doors must be present, marked coming soon, and
	 * NOT navigate — an anchor with a working href would be a live door onto a
	 * room that does not exist yet. Open: they are the real links into /agora,
	 * and the relationship target must be in the discuss href.
	 */
	if (AGORA_OPEN) {
		const href = await page.locator('.edgecard a.cbtn').first().getAttribute('href');
		ok(
			'the card can be discussed as a relationship',
			Boolean(href && href.includes('target_type=relationship')),
			String(href)
		);
	} else {
		ok(
			'the card keeps both community doors, marked coming soon',
			(await page.locator('.edgecard .cbtn.soon').count()) >= 2,
			`${await page.locator('.edgecard .cbtn.soon').count()} doors`
		);
		ok(
			'the discuss door still names its record',
			(await page.locator('.edgecard [data-target="relationship"]').count()) >= 1,
			'the relationship target is carried on the door'
		);
		ok(
			'the closed doors do not navigate',
			(await page.locator('.edgecard a.cbtn').count()) === 0,
			'no live discuss/propose anchors'
		);
	}

	// Clicking an endpoint has to leave the card and select the person, or the card is
	// a dead end in a graph of three hundred nodes.
	await page.locator('.edgecard .end').first().click();
	await page.waitForTimeout(600);
	ok('an endpoint selects that entity', (await page.locator('.inspector').count()) === 1);
	ok('choosing an endpoint closes the card', (await page.locator('.edgecard').count()) === 0);

	/*
	 * A connection has to be citable, which means it has to have a URL. This is the
	 * round trip: the entity panel offers a link, and the Network honours it by
	 * opening that exact edge. Asserted rather than assumed, because a deep link that
	 * silently lands on the overview looks like it worked.
	 */
	const relLink = await page.locator('.r-act a').first().getAttribute('href');
	ok(
		'the entity panel links a relationship to the map',
		Boolean(relLink && relLink.startsWith('/network?rel=')),
		String(relLink)
	);

	await page.goto(BASE + relLink!, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2000);
	ok('that link opens the connection', (await page.locator('.edgecard .card').count()) === 1);
	ok('and marks it on the map', (await page.locator('.edge.pinned').count()) >= 1);

	/*
	 * Connections must be findable, not only clickable. They are the records people
	 * argue about, and until they were indexed the only way to reach one was to know
	 * where on the map it was drawn.
	 */
	await page.keyboard.press('/');
	await page.waitForTimeout(300);
	await page.keyboard.type('Trabelsi');
	await page.waitForTimeout(600);
	const kinds = await page.evaluate(
		"Array.from(document.querySelectorAll('.palette li')).map(function (l) { return l.textContent || ''; }).join('|')"
	);
	ok('search finds connections', String(kinds).includes('→'), String(kinds).slice(0, 90));
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);

	ok('connection console clean', problems.length === 0, problems.slice(0, 3).join(' | '));
	await page.screenshot({ path: join(OUT, 'connection.png') });
	await context.close();
}

// --- Deep-link round trips -------------------------------------------------
/*
 * W2: every selection is a URL. The five entity views consume `?id=` on
 * arrival (the Inspector opens because app.selected is global), and the layout
 * keeps the URL in step with the selection; the Map carries its own `?region=`.
 * The house pattern for a deep link is cold-goto, wait, then assert the thing
 * actually happened — a link that silently lands on the overview looks
 * identical to one that worked, and so does one that renders but drops the
 * parameter from the URL.
 *
 * The guided tour is pre-dismissed for the whole context. On a first visit its
 * dismiss-key Escape also reaches the layout's keydown handler, which clears
 * app.selected — so a cold goto made while the tour is running races the deep
 * link, and the first page in a fresh context loses the selection. A returning
 * reader (tour seen) is the state every one of these pages should be in, which
 * is exactly what marking the flag sets up — the same trick the locale sweep
 * uses to pin the reader's language.
 */
console.log('\n  ── deep-link round trips ──');
{
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	// The app itself treats storage-disabled contexts as "tour seen" (tour.svelte.ts);
	// the init script must tolerate the same — on about:blank (opaque origin)
	// localStorage access throws, and a pageerror on the blank document would be
	// caught by this section's console listener as if the app had crashed.
	await context.addInitScript(`(() => { try { localStorage.setItem('deeptunisia:tour', '1'); } catch {} })()`);
	const problems: string[] = [];
	context.on('page', (page) => {
		page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
		page.on('console', (m) => {
			/*
			 * The W2 write hook calls the raw history.replaceState instead of
			 * $app/navigation's, so SvelteKit's dev-mode advisory fires whenever a
			 * selection is written — this section's own assertions pin that defect
			 * (the map URL and first-load-write failures), and the connections
			 * section's console-clean is the canonical witness. It is DEV-only
			 * noise here, not an error in the flows under test.
			 */
			if (m.text().includes('Avoid using `history.pushState') ) return;
			if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
				problems.push(`[${m.type()}] ${m.text()}`);
			}
		});
	});

	// bourguiba is a real person id in data/people.yaml; each entity view must
	// open the Inspector on arrival and must not let the write hook strip the
	// parameter — a view that fails to consume ?id= leaves app.selected null,
	// which the write hook would delete from the URL. Network already consumed
	// ?id= before W2; the other four are the new consumers, kept as one loop so
	// a regression in the shared module fails on every route at once.
	for (const path of ['/chronicle', '/now', '/atlas', '/rankings', '/network']) {
		const page = await context.newPage();
		await page.goto(BASE + path + '?id=bourguiba', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		await page.waitForTimeout(1500);
		ok(
			`deep-link ${path}?id=bourguiba opens the inspector`,
			(await page.locator('.inspector').count()) === 1
		);
		ok(
			`deep-link ${path}?id=bourguiba keeps the selection in the URL`,
			page.url().includes('id=bourguiba'),
			page.url().replace(BASE, '')
		);
		await page.close();
	}

	/*
	 * The Map's selection is local to TunisiaMap and arrives with the async geo
	 * payload, so the card and the selected highlight can only appear after
	 * /geo.json + /tn-adm.geojson resolve. gov-tunis is a real governorate id
	 * from the build's geo.json, and the contract is that ?region= stays in the
	 * URL — the selection is supposed to BE the URL, not merely be shown.
	 */
	{
		const page = await context.newPage();
		await page.goto(BASE + '/map?region=gov-tunis', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		await page.waitForTimeout(2000);
		ok(
			'deep-link /map?region=gov-tunis renders the selected governorate',
			(await page.locator('path.selected').count()) === 1 &&
				(await page.locator('.gov-card').count()) === 1
		);
		ok(
			'deep-link /map?region=gov-tunis names it in the card',
			((await page.locator('.gov-card h2').innerText()) || '').includes('Tunis'),
			await page.locator('.gov-card h2').innerText()
		);
		ok(
			'deep-link /map?region=gov-tunis keeps the region in the URL',
			page.url().includes('region=gov-tunis'),
			page.url().replace(BASE, '')
		);
		await page.close();
	}

	/*
	 * The trap guard. /data does not consume entity links, so a deep link to it
	 * must not grow a selection: no Inspector, and the URL must be left exactly
	 * as the reader provided it. If the write hook ever ran on routes that do
	 * not consume ?id=, it would strip the parameter (nothing is selected on
	 * /data) — the URL assertion is what catches that.
	 */
	{
		const page = await context.newPage();
		await page.goto(BASE + '/data?id=bourguiba', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		await page.waitForTimeout(1000);
		ok(
			'deep-link /data?id=bourguiba does not open the inspector',
			(await page.locator('.inspector').count()) === 0
		);
		ok(
			'deep-link /data?id=bourguiba leaves the URL untouched',
			page.url().includes('id=bourguiba') && !page.url().includes('region='),
			page.url().replace(BASE, '')
		);
		await page.close();
	}

	/*
	 * The write half of the contract, driven through the palette on the very
	 * first page load: selecting a person must put ?id= into the URL, and it
	 * must do so with replaceState — the back button must never start walking
	 * through selection states. history.length is the direct witness: a
	 * replaceState leaves it untouched, a pushState grows it by one.
	 */
	{
		const page = await context.newPage();
		await page.goto(BASE + '/chronicle', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		const h0 = await page.evaluate('window.history.length');
		await page.keyboard.press('/');
		await page.waitForTimeout(300);
		await page.keyboard.type('Habib Bourguiba');
		await page.waitForTimeout(600);
		await page.locator('.palette li button').first().click();
		await page.waitForTimeout(800);
		const h1 = await page.evaluate('window.history.length');
		ok(
			'selecting on the first-loaded page does not grow history (replaceState, not pushState)',
			h1 === h0,
			`${h0} -> ${h1}`
		);
		ok(
			'selecting on the first-loaded page writes ?id= into the URL',
			page.url().includes('id=bourguiba'),
			page.url().replace(BASE, '')
		);
		await page.close();
	}

	/*
	 * And once across a client-side navigation, where the write hook provably
	 * re-runs: the URL must track the new selection, still without growing
	 * history. This is the meaningful replaceState witness — on the very first
	 * page load the write hook is dormant (W2 defect, reported separately), so
	 * history.length there would stay flat for the wrong reason.
	 */
	{
		const page = await context.newPage();
		await page.goto(BASE + '/chronicle', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		await page.locator('.subnav .strip a[href="/network"]').click();
		await page.waitForTimeout(1200);
		const h0 = await page.evaluate('window.history.length');
		await page.keyboard.press('/');
		await page.waitForTimeout(300);
		await page.keyboard.type('Habib Bourguiba');
		await page.waitForTimeout(600);
		await page.locator('.palette li button').first().click();
		await page.waitForTimeout(800);
		const h1 = await page.evaluate('window.history.length');
		ok(
			'a selection made after a client-side navigation writes ?id= into the URL',
			page.url().includes('id=bourguiba'),
			page.url().replace(BASE, '')
		);
		ok(
			'and does not grow history (replaceState, not pushState)',
			h1 === h0,
			`${h0} -> ${h1}`
		);
		await page.close();
	}

	ok('deep-link section console clean', problems.length === 0, problems.slice(0, 4).join(' | '));
	await context.close();
}

// --- Captions ---------------------------------------------------------------
/*
 * Every route in the views table answers one sentence: Viewport.svelte reads
 * answerKeyFor(pathname) and renders the .caption line, from the same
 * guide.<key>.answer keys the /guide table displays in full. A route outside
 * the table — /guide is the nearest non-view route that shares the shell
 * chrome — must have no caption at all.
 */
console.log('\n  ── captions ──');
{
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.addInitScript(`(() => { try { localStorage.setItem('deeptunisia:tour', '1'); } catch {} })()`);
	for (const path of ['/rankings', '/map']) {
		const page = await context.newPage();
		await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		const n = await page.locator('.caption').count();
		const text = n ? (await page.locator('.caption').innerText()).trim() : '';
		ok(
			`caption on ${path} is present and non-empty`,
			n === 1 && text.length > 0,
			JSON.stringify(text.slice(0, 60))
		);
		await page.close();
	}
	{
		const page = await context.newPage();
		await page.goto(BASE + '/guide', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		ok(
			'caption is absent on /guide (outside the views table)',
			(await page.locator('.caption').count()) === 0
		);
		await page.close();
	}
	await context.close();
}

/*
 * Arabic, and motion turned off.
 *
 * DESIGN.md has required RTL parity and reduced-motion support from the start, and
 * neither was ever asserted — the suite pinned `reducedMotion: 'no-preference'` and
 * never set a locale. A sprint that added a camera, momentum, sheets, floating
 * readouts and a screen-space label layer is exactly the wrong time for that to
 * still be true.
 *
 * RTL is the sharper of the two. Screen-space geometry must use physical properties,
 * because `inset-inline-start` flips in Arabic while `translate()` does not, so
 * mixing them inverts an element against its own anchor and throws it off the map.
 * That mistake was present in the label layer and in three of the dock's own
 * overrides; these runs are how it stops coming back.
 */
const MODES = [
	{ id: 'ltr', locale: null, motion: 'no-preference' as const },
	{ id: 'rtl', locale: 'ar', motion: 'no-preference' as const },
	{ id: 'still', locale: null, motion: 'reduce' as const }
] as const;

// --- Arabic, and motion turned off -----------------------------------------
console.log('\n  ── rtl + reduced motion ──');
for (const mode of MODES.filter((m) => m.id !== 'ltr')) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		colorScheme: 'dark',
		reducedMotion: mode.motion,
		locale: mode.locale === 'ar' ? 'ar' : 'en'
	});
	if (mode.locale) {
		await context.addInitScript(
			`localStorage.setItem('deeptunisia:locale', '${mode.locale}')`
		);
	}

	for (const path of ['/chronicle', '/network', '/investigate', '/atlas', '/evidence']) {
		const page = await context.newPage();
		const problems: string[] = [];
		page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
		page.on('console', (m: ConsoleMessage) => {
			if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
				problems.push(`[${m.type()}] ${m.text()}`);
			}
		});

		await page.goto(BASE + path, { waitUntil: 'networkidle' });
		await settle(page);
		const where = `${mode.id}${path}`;

		if (mode.locale === 'ar') {
			ok(`${where} document is rtl`, (await page.evaluate('document.documentElement.dir')) === 'rtl');
		}

		/*
		 * Nothing positioned in screen space may leave the window. This is the check
		 * that catches a logical property fighting a transform: in Arabic those
		 * elements do not merely shift, they land hundreds of pixels off the side.
		 */
		const escaped = (await page.evaluate(`(() => {
			const w = window.innerWidth, h = window.innerHeight;
			const out = [];
			for (const el of document.querySelectorAll('.vlabel, .vlane, .preview, .rupture-name, .head-year, .coverage, .edgecard, .playhead')) {
				const r = el.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) continue;
				if (r.right < -4 || r.left > w + 4 || r.bottom < -4 || r.top > h + 4) {
					out.push(
						el.tagName.toLowerCase() +
						'.' + String(el.getAttribute('class') || '').split(/\\s+/).filter(function (c) {
							return c && c.indexOf('svelte-') !== 0;
						}).join('.') +
						'@' + Math.round(r.left) + ',' + Math.round(r.top)
					);
				}
			}
			return out.slice(0, 6);
		})()`)) as string[];
		ok(`${where} screen-space elements stay on screen`, escaped.length === 0, escaped.join(' | '));

		if (path === '/network') {
			// The label layer is the thing most likely to be thrown off by direction,
			// so assert it is populated rather than merely not escaping.
			const n = await page.locator('.vlabel').count();
			ok(`${where} labels still render`, n >= 4, `${n} labels`);
		}

		/*
		 * The Segmented control's sliding indicator follows text flow, so its anchor
		 * is logical and the segment index travels the opposite direction in RTL. A
		 * physical `left` anchor with a mirrored transform used to throw the thumb
		 * out of the control in Arabic — it aligned with no segment. This asserts
		 * alignment on every route that carries the dock's zoom control. Routes
		 * without the control pass trivially (the dock is instrument-only).
		 */
		const seg = (await page.evaluate(`(() => {
			const s = document.querySelector('.seg');
			const ind = s && s.querySelector('.indicator');
			const sel = s && s.querySelector('button.selected');
			if (!ind || !sel) return null;
			const a = ind.getBoundingClientRect(), b = sel.getBoundingClientRect();
			const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
			return { overlap: Math.round(overlap), w: Math.round(b.width), sel: (sel.textContent || '').trim() };
		})()`)) as { overlap: number; w: number; sel: string } | null;
		ok(
			`${where} segmented indicator aligned with selection`,
			!seg || seg.overlap >= seg.w * 0.75,
			seg ? `overlap ${seg.overlap}/${seg.w} (${seg.sel})` : 'no segmented control'
		);

		ok(`${where} console clean`, problems.length === 0, problems.slice(0, 3).join(' | '));
		if (path === '/network') {
			await page.screenshot({ path: join(OUT, `${mode.id}-network.png`) });
		}
		await page.close();
	}
	await context.close();
}

/*
 * Every route, in every language.
 *
 * The suite has driven Arabic since the RTL sprint — but only `/` and `/network`, and
 * only to check that nothing flew off the side of the window. Meanwhile `/now` in
 * Arabic rendered `dir="rtl"` around a hundred and sixty-seven words of English and
 * had done for months, because a dictionary audit reports 244/244 while that is on
 * screen and the layout checks pass on prose in any language.
 *
 * So this sweep asks the one question neither of those could: is the page actually in
 * the language the reader chose?
 *
 * The Latin-sentence heuristic is deliberately crude and deliberately allowlisted.
 * Arabic pages legitimately contain Latin script — people's names in the dataset are
 * trilingual but institutions are often cited by their French acronym, decree numbers
 * are Latin digits, outlet names are brands. What is NOT legitimate is a run of
 * ordinary English function words, which is what prose looks like and what a name
 * never does.
 */
const PROSE_MARKERS =
	'\\b(the|and|with|that|which|these|those|from|their|there|where|when|what|this|have|has|been|were|are|not|but|for|into|than|then|would|could|should|about|between|through|after|before|every|each|other|more|most|some|only|also|because|while|during|under|over|against|without|within|whether|rather)\\b';

/* One page per route; duplicates in CHECKS visit the same path twice. */
const LOCALE_ROUTES = [...new Set(CHECKS.map((c) => c.path))];

console.log('\n  ── every route, in every language ──');
for (const locale of ['ar', 'fr'] as const) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		colorScheme: 'dark',
		locale
	});
	await context.addInitScript(`localStorage.setItem('deeptunisia:locale', '${locale}')`);
	let localeProse = 0;

	for (const path of LOCALE_ROUTES) {
		const page = await context.newPage();
		const problems: string[] = [];
		page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
		page.on('console', (m: ConsoleMessage) => {
			if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
				problems.push(`[${m.type()}] ${m.text()}`);
			}
		});

		await page.goto(BASE + path, { waitUntil: 'networkidle' });

		/*
		 * The boot screen is visible now, before settle() lets it detach — the
		 * only moment it exists. Its subtitle is a localized dictionary entry
		 * (boot.sub) and must render as itself, not as the double-encoded residue
		 * it shipped with for months (review-response sprint F2/F3). Asserted once
		 * per locale on the first route, since the boot runs once per session.
		 */
		if (path === LOCALE_ROUTES[0]) {
			const sub = (await page.evaluate(`(() => {
				const el = document.querySelector('.wordmark .sub');
				return el ? el.textContent : null;
			})()`)) as string | null;
			const expected = locale === 'ar' ? '١٩٥٦' : '1956–2026';
			ok(
				`${locale}/boot subtitle localized and uncorrupted`,
				sub !== null && sub.includes(expected) && !hasDoubleEncoding(sub).found,
				sub ? JSON.stringify(sub) : 'boot screen not present'
			);
		}

		await settle(page);
		const where = `${locale}${path}`;

		// A hydration crash serves a valid 200 and a blank screen; SSR proves nothing.
		ok(`${where} shell painted`, (await page.locator('.os').count()) === 1);
		ok(`${where} console clean`, problems.length === 0, problems.slice(0, 2).join(' | '));

		/*
		 * CHECKS supplies the theme sweep's structural expectations.  The locale
		 * sweep has its own question: did the route produce a substantive world
		 * surface in Arabic/French, rather than merely mounting the shared shell?
		 * Keep this selector- and length-based so the assertion is language-neutral;
		 * the prose ceiling below remains responsible for translation regressions.
		 */
		if (path === '/world' || path === '/world/france') {
			const worldSurface = (await page.evaluate(`(() => {
				const main = document.querySelector('main');
				const text = (main ? main.innerText : document.body.innerText || '').trim();
				return {
					page: document.querySelectorAll('.worldpage').length,
					dossier: document.querySelectorAll('.dossier').length,
					totals: document.querySelectorAll('.totals').length,
					sections: document.querySelectorAll('.dossier .section').length,
					text: text.length
				};
			})()`)) as {
				page: number;
				dossier: number;
				totals: number;
				sections: number;
				text: number;
			};
			const substantive =
				path === '/world'
					? worldSurface.page === 1 && worldSurface.totals === 1 && worldSurface.text > 40
					: worldSurface.dossier === 1 && worldSurface.sections >= 3 && worldSurface.text > 40;
			ok(`${where} substantive world surface`, substantive, JSON.stringify(worldSurface));
		}

		if (locale === 'ar') {
			ok(`${where} document is rtl`, (await page.evaluate('document.documentElement.dir')) === 'rtl');
		}

		/*
		 * The rendered-text mojibake sweep (review-response sprint W6). The
		 * source-level gate (test-encoding.ts) proves no file carries double-encoded
		 * residue; this proves no ROUTE RENDERS it — the boot subtitle shipped
		 * corrupted for months precisely because it was hard-coded markup, which the
		 * dictionary sweep cannot see and svelte-check does not read. A run of
		 * suspect characters in visible text is corruption, not typography.
		 */
		{
			const rendered = (await page.evaluate(`(() => {
				const main = document.querySelector('main');
				return (main ? main.innerText : document.body.innerText) || '';
			})()`)) as string;
			const r = hasDoubleEncoding(rendered);
			ok(`${where} no double-encoded residue on screen`, !r.found, r.detail ?? 'clean');
		}

		// A string expression, not an arrow with named inner functions — under tsx those
		// throw `__name is not defined` in the page. See the trap in AGENTS.md.
		const englishProse = (await page.evaluate(`(() => {
			const main = document.querySelector('main');
			if (!main) return 0;
			const m = (main.innerText || '').match(new RegExp(${JSON.stringify(PROSE_MARKERS)}, 'gi'));
			return m ? m.length : 0;
		})()`)) as number;

		/*
		 * A per-route RATCHET (UI pass W1), not a global target. Each route has
		 * its own ceiling: the measured worst of ar/fr at the last ratchet pass,
		 * plus a little headroom for legitimate Latin (names, decree numbers,
		 * outlet names). When a route's prose is translated, its ceiling is
		 * lowered in the same commit — a regression fails on the route that
		 * regressed, and progress is one number per route in this table.
		 * Routes absent from the table fall back to the backstop.
		 *
		 * /about landed 2026-08-13 (325 -> 15; residual = names and links).
		 * The rest are the 2026-08-13 measured worsts + 5, awaiting their
		 * landings. The old global ceiling (470) named /methodology (455) as the
		 * worst route — methodology has since been converted (54); this table
		 * replaces that stale story.
		 */
		const PROSE_CEILINGS: Record<string, number> = {
			// Ratcheted 2026-08-13 after landings 1-3 (about 325->0, data 109->3,
			// index descs: methodology 80->32, rankings 59->25).
			'/about': 10,
			'/now': 65,
			'/data': 10,
			'/atlas': 75,
			'/evidence': 75,
			// 2026-08-26: 50 -> 55. The three outbox merge passes added English-
			// titled records to the review queue this page renders (contracts,
			// board seats, chain extensions); measured 51. Reviewer-facing
			// worklist titles stay English by design - they name record ids -
			// so the residue is structural, not a missing translation.
			'/corrections': 55,
			'/rankings': 30,
			// Residue is third-party headline text (legitimate — the feed shows
			// what other outlets published; a few are English-language).
			'/feed': 30,
			// Residue is role-title title_en fallbacks in result rows.
			'/investigate': 27,
			'/chronicle': 29,
			// Residue is dataset content, not UI prose: role names whose title_ar
			// is not yet in the data (methodology), entity names and era formulas
			// (atlas), git commit subjects (corrections), hypothesis prose from
			// records lacking fr/ar (evidence). Ceilings fall as DATA translation
			// lands; the UI-chrome part of each landing is done.
			'/methodology': 37,
			'/map': 5,
			'/network': 5,
			// The guide is translated prose (guide.*.md + guide.* keys, same
			// landing as /about). Measured 0/0 in fr/ar on 2026-08-13; the
			// headroom is for the Latin brand mark and dataset names.
			'/guide': 5,
			// Media routes: index and gateway are largely chrome (5-15); the
			// article's narrative is currently English-only prose, so its
			// ceiling is the measured English function words in ar/fr plus
			// headroom for names/entities, awaiting translation of narrative.
			// 2026-08-26: 650 -> 725. Measured 718. Delta +94 is the four
			// interpretation panels (interpretations.yaml I1-I4), authored in
			// English like the rest of the narrative; labels around them are
			// localized. Ceiling falls in the same commit that lands human
			// AR/FR translations of the interpretations (research roadmap).
			'/media': 10,
			'/media/chemical-century': 15,
			'/media/chemical-century/article': 725,
			/*
			 * Agora, OPEN state: the ratchet counts what a reader sees, and an
			 * open discussion layer shows community-written thread titles in
			 * the language each author chose. That is content, not UI chrome —
			 * the same legitimate residue the feed's 30 accounts for. Closed
			 * state: the coming-soon banner is fully localized (~0). The
			 * ceiling is set for the OPEN state (the 2026-08-13 measured 7
			 * function words from test-authored English threads, plus
			 * headroom) and must not be lowered below the honest residue of
			 * community prose.
			 */
			'/agora': 20
		};
		const PROSE_BACKSTOP = 200;
		const proseCeiling = PROSE_CEILINGS[path] ?? PROSE_BACKSTOP;
		ok(
			`${where} English prose within ceiling`,
			englishProse <= proseCeiling,
			`${englishProse} English function words (ceiling ${proseCeiling})`
		);
		localeProse += englishProse;

		await page.close();
	}
	console.log(
		`     ${locale}: ${localeProse} English function words still on screen across ${LOCALE_ROUTES.length} routes`
	);
	await context.close();
}

// --- /data coverage section ------------------------------------------------
/*
 * W1.3 — the "what the map does not contain" section.
 *
 * Until sprint W1.2 the /data page called t() zero times: every string on it
 * was hard-coded English, and a dictionary audit reports 244/244 while the
 * screen is English, because hard-coded markup is invisible to a key count.
 * So the heading is asserted to be the exact localized sentence — a check that
 * merely counts headings would pass on the English string — and the whole
 * section is swept with the same function-word regex as the route sweep above.
 *
 * The kin cells are the build's own audit. stats.json is rewritten by
 * `npm run data` from the same principalCoverage object the page renders, so
 * asserting the rendered cell equals the emitted stat pins the product to its
 * build: a hand-typed number in the markup fails here while every other gate
 * stays green. That is exactly the drift the paper's §8.2 correction exists to
 * close.
 */
{
	const KIN_SAIED = Number(STATS['kin-kais-saied']);
	const KIN_BEN_ALI = Number(STATS['kin-ben-ali']);
	ok(
		'stats.json carries the kin keys the check depends on',
		Number.isFinite(KIN_SAIED) && Number.isFinite(KIN_BEN_ALI),
		`kin-kais-saied=${KIN_SAIED}, kin-ben-ali=${KIN_BEN_ALI}`
	);

	// EN: the section renders, and the two rows everyone cites carry the emitted numbers.
	{
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			colorScheme: 'dark'
		});
		const page = await context.newPage();
		await page.goto(BASE + '/data', { waitUntil: 'networkidle' });
		await settle(page);

		const cov = (await page.evaluate(`(() => {
			const title = ${JSON.stringify(translate('en', 'coverage.title'))};
			const hs = Array.from(document.querySelectorAll('h2'));
			const h = hs.find(function (el) { return (el.textContent || '').trim() === title; });
			if (!h) return { heading: false, h2: hs.map(function (el) { return (el.textContent || '').trim(); }) };
			let t = h.nextElementSibling;
			while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
			if (!t) return { heading: true, table: false };
			const rows = Array.from(t.querySelectorAll('tbody tr'));
			const kin = function (name) {
				const r = rows.find(function (row) {
					return (row.cells[0] ? row.cells[0].textContent || '' : '').trim() === name;
				});
				return r ? Number((r.cells[2] ? r.cells[2].textContent || '' : '').trim()) : null;
			};
			return {
				heading: true,
				table: true,
				rows: rows.length,
				saied: kin('Kais Saied'),
				benAli: kin('Zine El Abidine Ben Ali')
			};
		})()`)) as {
			heading?: boolean;
			table?: boolean;
			rows?: number;
			saied?: number | null;
			benAli?: number | null;
			h2?: string[];
		};

		ok('en//data coverage heading localized', cov.heading === true, cov.heading ? 'heading present' : `h2s: ${(cov.h2 || []).join(' | ')}`);
		ok(
			'en//data coverage table renders',
			cov.table === true && (cov.rows ?? 0) >= 6,
			cov.table ? `${cov.rows} principal rows` : 'no table after the heading'
		);
		ok(
			'en//data incumbent kin matches the emitted stat',
			cov.saied === KIN_SAIED,
			`rendered ${cov.saied}, stats ${KIN_SAIED}`
		);
		ok(
			'en//data ben ali kin matches the emitted stat',
			cov.benAli === KIN_BEN_ALI,
			`rendered ${cov.benAli}, stats ${KIN_BEN_ALI}`
		);
		await context.close();
	}

	/*
	 * FR + AR: the heading must be the localized sentence, and the section must not
	 * be English prose. The four section headings bound the sweep: the walk from the
	 * coverage title stops at the first h2 that is not one of them, so the English
	 * prose that follows ("Rebuilding it yourself") is out of scope by design while a
	 * reverted or untranslated heading anywhere inside the section ends the walk and
	 * fails the count.
	 */
	for (const locale of ['fr', 'ar'] as const) {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			colorScheme: 'dark',
			locale
		});
		await context.addInitScript(`localStorage.setItem('deeptunisia:locale', '${locale}')`);
		const page = await context.newPage();
		const problems: string[] = [];
		page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
		page.on('console', (m) => {
			if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) {
				problems.push(`[${m.type()}] ${m.text()}`);
			}
		});

		await page.goto(BASE + '/data', { waitUntil: 'networkidle' });
		await settle(page);

		const heads = [
			translate(locale, 'coverage.title'),
			translate(locale, 'coverage.cards'),
			translate(locale, 'coverage.queue'),
			translate(locale, 'coverage.reviewed')
		];

		const section = (await page.evaluate(`(() => {
			const heads = ${JSON.stringify(heads)};
			const hs = Array.from(document.querySelectorAll('h2'));
			const h = hs.find(function (el) { return (el.textContent || '').trim() === heads[0]; });
			if (!h) return { found: false, h2: hs.map(function (el) { return (el.textContent || '').trim(); }) };
			let n = h;
			let text = '';
			const seen = [];
			while (n) {
				if (n.tagName === 'H2') {
					const t = (n.textContent || '').trim();
					if (heads.indexOf(t) === -1) break; // past the section
					seen.push(t);
				}
				text += ' ' + (n.textContent || '');
				n = n.nextElementSibling;
			}
			const m = text.match(new RegExp(${JSON.stringify(PROSE_MARKERS)}, 'gi'));
			return { found: true, seen: seen, markers: m ? m.length : 0 };
		})()`)) as { found?: boolean; seen?: string[]; markers?: number; h2?: string[] };

		ok(
			`${locale}//data coverage heading localized`,
			section.found === true,
			section.found ? 'exact match' : `h2s: ${(section.h2 || []).join(' | ')}`
		);
		ok(
			`${locale}//data all coverage headings localized`,
			section.found === true && (section.seen || []).length === 4,
			`${(section.seen || []).length}/4 of: ${(section.seen || []).join(' | ')}`
		);
		ok(
			`${locale}//data coverage section has no English prose`,
			section.markers === 0,
			section.markers ? `${section.markers} function words` : 'clean'
		);
		ok(`${locale}//data console clean`, problems.length === 0, problems.slice(0, 3).join(' | '));

		await page.screenshot({ path: join(OUT, `${locale}-data-coverage.png`) });
		await context.close();
	}
}

// --- Phone chrome ----------------------------------------------------------
/*
 * The shell's dimensions are tokens so that the dock, the inspector sheet and any
 * view reserving space can never disagree about them. On a phone that guarantee is
 * load-bearing and easy to break: the dock used to wrap to whatever height its
 * contents needed while --dock-h still claimed 56px, so the inspector sheet — which
 * positions itself above the dock using that token — sat partly underneath it.
 *
 * Nothing about that failure is visible in a screenshot of a page with no record
 * selected, and no contrast or overflow check catches it. So it is measured.
 */
console.log('\n  ── phone chrome ──');
{
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		colorScheme: 'dark'
	});
	const page = await context.newPage();
	await page.goto(BASE + '/chronicle', { waitUntil: 'networkidle' });
	await settle(page);

	const dock = await page.evaluate(`(() => {
		const el = document.querySelector('.dock');
		const token = getComputedStyle(document.documentElement).getPropertyValue('--dock-h').trim();
		return { h: el ? Math.round(el.getBoundingClientRect().height) : -1, token: token };
	})()`) as { h: number; token: string };
	ok(
		'phone dock height matches --dock-h',
		dock.h === parseInt(dock.token, 10),
		`measured ${dock.h}px, token ${dock.token}`
	);

	// The layer palette lives behind a button here. All seven have to be reachable —
	// letting them overflow the dock hid four of them off the screen edge, which the
	// document-level overflow check cannot see because the document did not overflow.
	await page.locator('.filter-btn').click();
	await page.waitForTimeout(300);
	const chips = await page.locator('.filter-sheet .lchip').count();
	ok('phone filter sheet holds every layer', chips === 7, `${chips} chips`);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);

	// Selecting a record opens the sheet, and the timeline must stay usable beneath
	// it: keeping selection and time-travel simultaneous is the premise of the app.
	await page.locator('.bar').first().click();
	await page.waitForTimeout(600);
	const sheet = await page.evaluate(`(() => {
		const s = document.querySelector('.inspector');
		const d = document.querySelector('.dock');
		if (!s || !d) return null;
		const a = s.getBoundingClientRect();
		const b = d.getBoundingClientRect();
		return { overlap: Math.round(a.bottom - b.top), handle: !!s.querySelector('.handle') };
	})()`) as { overlap: number; handle: boolean } | null;

	/*
	 * The shell must never be scrolled sideways.
	 *
	 * `overflow: hidden` stops a user scrolling an element but leaves it scriptable, so
	 * anything calling scrollIntoView inside the shell can pan the entire fixed window
	 * — menu bar, viewport and all — with no scrollbar to hint at what happened. The
	 * sub-navigation did exactly this while revealing its active tab. The overflow
	 * check above cannot catch it, because scrollWidth is unchanged.
	 */
	const panned = (await page.evaluate(`(() => {
		const out = [];
		const all = document.querySelectorAll('*');
		for (const el of all) {
			if (el.scrollLeft !== 0) {
				out.push(
					el.tagName.toLowerCase() +
					'.' + String(el.getAttribute('class') || '').split(/\\s+/).filter(function (c) {
						return c && c.indexOf('svelte-') !== 0;
					}).join('.') +
					'=' + Math.round(el.scrollLeft) + 'px'
				);
			}
		}
		return out;
	})()`)) as string[];
	// Only chrome is asserted: a view with genuinely wide content is allowed, and
	// expected, to scroll its own scroll container.
	const chromePanned = panned.filter(
		(p) => /^(html|body)/.test(p) || p.includes('.os') || p.includes('.menubar') || p.includes('.viewport')
	);
	ok(
		'phone shell is not scrolled sideways',
		chromePanned.length === 0,
		panned.join(' | ') || 'nothing scrolled'
	);

	ok('phone inspector opens as a sheet', Boolean(sheet?.handle));
	ok(
		'phone inspector does not cover the dock',
		Boolean(sheet && sheet.overlap <= 1),
		sheet ? `${sheet.overlap}px into the dock` : 'no sheet'
	);

	await page.screenshot({ path: join(OUT, 'phone-inspector.png') });
	await context.close();
}

// --- Media ---------------------------------------------------------------
// The new investigative surface must be as accessible as the graph itself.
// ClaimIndicator is a button with aria-expanded + aria-controls (controls the
// ClaimExpansion region); EntityMention is a button with aria-label; the
// evidence ledger is a real <table> with <th scope>. This block pins those
// contracts in both themes and on phone, plus RTL for the article.
console.log('\n  ── media ──');
{
	for (const themeName of ['dark', 'light'] as const) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: themeName });
		const page = await context.newPage();
		const problems: string[] = [];
		page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
		page.on('console', (m: ConsoleMessage) => {
			if ((m.type() === 'error' || m.type() === 'warning') && !isIgnorable(m.text())) problems.push(`[${m.type()}] ${m.text()}`);
		});
		await page.goto(BASE + '/media/chemical-century/article', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		await page.waitForTimeout(400);

		const media = (await page.evaluate(`(() => {
			const indicators = Array.from(document.querySelectorAll('button.indicator'));
			const mentions = Array.from(document.querySelectorAll('button.mention'));
			const ledger = document.querySelector('.ledger table');
			const ledgerRows = ledger ? ledger.querySelectorAll('tbody tr').length : 0;
			const ledgerHeadScope = ledger ? ledger.querySelectorAll('th[scope]').length : 0;
			const ledgerIsTable = !!ledger && ledger.tagName === 'TABLE';
			return {
				indicatorCount: indicators.length,
				indicatorExpanded: indicators.map(function (b) { return b.getAttribute('aria-expanded'); }),
				indicatorControls: indicators.map(function (b) { return b.getAttribute('aria-controls'); }),
				mentionCount: mentions.length,
				mentionLabels: mentions.map(function (b) { return b.getAttribute('aria-label'); }),
				ledger: !!ledger,
				ledgerRows: ledgerRows,
				ledgerHeadScope: ledgerHeadScope,
				ledgerIsTable: ledgerIsTable
			};
		})()`)) as {
			indicatorCount: number;
			indicatorExpanded: (string | null)[];
			indicatorControls: (string | null)[];
			mentionCount: number;
			mentionLabels: (string | null)[];
			ledger: boolean;
			ledgerRows: number;
			ledgerHeadScope: number;
			ledgerIsTable: boolean;
		};

		ok(`${themeName}/media-article has ClaimIndicators`, media.indicatorCount >= 1, `${media.indicatorCount} indicators`);
		ok(
			`${themeName}/media-article ClaimIndicator has aria-expanded`,
			media.indicatorExpanded.every(function (v) { return v !== null; }),
			String(media.indicatorExpanded.slice(0, 3).join(', '))
		);
		ok(
			`${themeName}/media-article ClaimIndicator has aria-controls`,
			media.indicatorControls.every(function (v) { return typeof v === 'string' && v.length > 0; }),
			String(media.indicatorControls.slice(0, 3).join(', '))
		);
		ok(
			`${themeName}/media-article EntityMention has aria-label`,
			media.mentionCount === 0 || media.mentionLabels.every(function (v) { return typeof v === 'string' && v.length > 0; }),
			media.mentionCount + ' mentions'
		);
		ok(
			`${themeName}/media-article ledger is a real table`,
			media.ledger && media.ledgerIsTable && media.ledgerHeadScope >= 2,
			'ledger ' + media.ledger + ', table ' + media.ledgerIsTable + ', th[scope]=' + media.ledgerHeadScope
		);
		ok(`${themeName}/media-article ledger has rows`, media.ledgerRows >= 5, media.ledgerRows + ' rows');

		if (media.indicatorCount > 0) {
			await page.evaluate(() => {
				const btn = document.querySelector('button.indicator') as HTMLElement | null;
				if (btn) {
					btn.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
					btn.click();
				}
			});
			await page.waitForTimeout(600);
			const after = (await page.evaluate(`(() => {
				const btn = document.querySelector('button.indicator');
				const id = btn ? btn.getAttribute('aria-controls') : null;
				const target = id ? document.getElementById(id) : null;
				return { expanded: btn ? btn.getAttribute('aria-expanded') : null, target: !!target, targetId: id };
			})()`)) as { expanded: string | null; target: boolean; targetId: string | null };
			ok(`${themeName}/media-article ClaimIndicator toggles aria-expanded`, after.expanded === 'true', 'expanded ' + after.expanded);
			ok(
				`${themeName}/media-article ClaimIndicator controls target exists when expanded`,
				after.target,
				'controls ' + after.targetId
			);
		}

		ok(`${themeName}/media-article console clean`, problems.length === 0, problems.slice(0, 3).join(' | '));
		await page.close();
		await context.close();
	}

	// Phone: ledger must remain reachable via its own scroll container
	{
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
		const page = await context.newPage();
		await page.goto(BASE + '/media/chemical-century/article', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		const phone = (await page.evaluate(`(() => {
			const ledger = document.querySelector('.ledger table');
			const scroll = document.querySelector('.ledger-scroll');
			return {
				ledger: !!ledger,
				scrollWidth: scroll ? scroll.scrollWidth : 0,
				clientWidth: scroll ? scroll.clientWidth : 0
			};
		})()`)) as { ledger: boolean; scrollWidth: number; clientWidth: number };
		ok('phone/media-article ledger is present', phone.ledger);
		// Wide ledger must be scrollable, not clipped — .ledger-scroll handles it
		ok('phone/media-article ledger is reachable via scroll', phone.scrollWidth >= phone.clientWidth, 'scroll ' + phone.scrollWidth + ' client ' + phone.clientWidth);
		await page.close();
		await context.close();
	}

	// RTL: article still renders indicators, still rtl
	{
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'ar' });
		await context.addInitScript(`localStorage.setItem('deeptunisia:locale', 'ar')`);
		const page = await context.newPage();
		await page.goto(BASE + '/media/chemical-century/article', { waitUntil: 'networkidle', timeout: 30_000 });
		await settle(page);
		ok('ar/media-article document is rtl', (await page.evaluate('document.documentElement.dir')) === 'rtl');
		ok('ar/media-article ClaimIndicators still render', (await page.locator('button.indicator').count()) >= 1);
		ok('ar/media-article ledger still a table', (await page.locator('.ledger table').count()) === 1);
		await page.close();
		await context.close();
	}
}

// --- Layout audit ----------------------------------------------------------
// Catches the two things that break silently while restyling: content escaping
// the window horizontally, and text left unreadable against its own background.
//
// Run at two widths. The phone pass is not a nicety: horizontal overflow is the
// single most common way a dense instrument view breaks on a small screen, it is
// invisible at 1440px, and nobody discovers it by resizing a desktop browser
// because the interesting failures need a real touch context to reproduce.

const VIEWPORTS = [
	{ id: 'desktop', width: 1440, height: 900, touch: false },
	{ id: 'phone', width: 390, height: 844, touch: true }
] as const;


console.log('\n  ── layout ──');
for (const vp of VIEWPORTS) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
		isMobile: vp.touch,
		hasTouch: vp.touch
	});
	for (const themeName of ['dark', 'light'] as const) {
		for (const check of CHECKS) {
			const page = await context.newPage();
			await page.emulateMedia({ colorScheme: themeName });
			await page.goto(BASE + check.path, { waitUntil: 'networkidle' });
			await settle(page);

			/*
			 * Passed as a string, not a function. tsx compiles named inner functions
			 * with an esbuild `__name` helper that does not exist in the page context,
			 * so a normal `page.evaluate(() => …)` containing helper functions throws
			 * `__name is not defined`. A string expression is evaluated verbatim.
			 */
			const audit = (await page.evaluate(`(() => {
				const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

				/*
				 * Overflow INSIDE the shell.
				 *
				 * The document can never overflow here — .os is position:fixed with
				 * overflow:hidden — so the check above always passes and proves less than
				 * it looks. Content wider than the window still stretches the shell's own
				 * scroll width, and because overflow:hidden only stops a *user* from
				 * scrolling, anything that calls scrollIntoView or focuses an off-screen
				 * control then pans the entire application window sideways, menu bar and
				 * all, with no scrollbar to explain it.
				 *
				 * A view with genuinely wide content is supposed to put it in its own
				 * scroll container. This measures whether it did.
				 */
				const os = document.querySelector('.os');
				const shell = os ? os.scrollWidth - os.clientWidth : 0;

				const name = function (el) {
					return (
						el.tagName.toLowerCase() +
						'.' + String(el.getAttribute('class') || '').split(/\\s+/).filter(function (c) {
							return c && c.indexOf('svelte-') !== 0;
						}).join('.')
					);
				};

				// Name the widest offender, or the failure is a number with no lead.
				let worst = '';
				if (os && shell > 1) {
					let max = 0;
					for (const el of os.querySelectorAll('*')) {
						const r = el.getBoundingClientRect();
						if (r.width > max && r.right > os.clientWidth + 1) {
							max = r.width;
							worst = name(el) + ' (' + Math.round(r.width) + 'px)';
						}
					}
				}

				/*
				 * Wide content must be REACHABLE, not merely contained.
				 *
				 * The check above is satisfied either by a view that scrolls its wide
				 * content or by one that clips it out of existence, and those are opposite
				 * outcomes. So for every element wider than the window, walk up looking for
				 * an ancestor that actually scrolls horizontally. If there is none, that
				 * content cannot be got to on a phone by any means — which is worse than
				 * the overflow it replaced, and completely invisible in a screenshot.
				 *
				 * SVG canvases are exempt: the camera moves those, not a scrollbar.
				 */
				const stranded = [];
				if (os) {
					for (const el of os.querySelectorAll('table, thead, tbody, tr, ul, ol, div, p, h1, h2, h3')) {
						const r = el.getBoundingClientRect();
						if (r.width <= os.clientWidth + 2) continue;

						let n = el.parentElement;
						let ok = false;
						while (n && n !== document.body) {
							const cs = getComputedStyle(n);
							if (
								(cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
								n.scrollWidth > n.clientWidth + 1
							) { ok = true; break; }
							// Inside a pannable canvas the camera is the scroll mechanism.
							if (n.classList.contains('canvas') || n.classList.contains('plot')) { ok = true; break; }
							/*
							 * Inside a collapsed <details> nothing is on screen, so nothing is
							 * stranded. Worth stating why this exemption is needed rather than
							 * suspicious: Chromium still hands descendants of closed details a
							 * layout box, while the details' own scrollWidth excludes them — so
							 * the table alternatives looked simultaneously too wide AND
							 * unscrollable. They become scrollable when opened, which is the
							 * only moment a reader can see them.
							 */
							if (n.tagName === 'DETAILS' && !n.open) { ok = true; break; }
							n = n.parentElement;
						}
						if (!ok) stranded.push(name(el) + ' (' + Math.round(r.width) + 'px)');
					}
				}

				/*
				 * Resolve any CSS colour to sRGB through a canvas. getComputedStyle here
				 * returns oklch() verbatim rather than rgb(), so parsing the numbers as
				 * RGB channels silently produces nonsense — it reported every element as
				 * 1:1 contrast. The canvas does the colour-space conversion properly and
				 * works for any syntax the browser accepts.
				 */
				const cv = document.createElement('canvas');
				cv.width = 1;
				cv.height = 1;
				const ctx = cv.getContext('2d');

				const lum = function (c) {
					if (!c) return null;
					ctx.clearRect(0, 0, 1, 1);
					ctx.fillStyle = '#000000';
					ctx.fillStyle = c;
					ctx.fillRect(0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					const p = [d[0], d[1], d[2]].map(function (v) {
						const s = v / 255;
						return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
					});
					return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
				};

				/*
				 * Effective background, compositing every semi-transparent layer up the
				 * ancestor chain. Tinted chips here use color-mix(... , transparent), so
				 * taking the first non-transparent background and stopping reports the
				 * chip's own 13%-alpha wash as if it were opaque, which is meaningless.
				 */
				const toRgba = function (c) {
					ctx.clearRect(0, 0, 1, 1);
					ctx.fillStyle = '#000000';
					ctx.fillStyle = c;
					const parsed = ctx.fillStyle;
					ctx.fillRect(0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					// getImageData premultiplies against transparent black, so recover
					// alpha separately and un-premultiply.
					const a = d[3] / 255;
					if (a === 0) return [0, 0, 0, 0];
					return [d[0] / a, d[1] / a, d[2] / a, a];
				};

				/*
				 * Effective background — but only when it can be measured HONESTLY.
				 *
				 * Tinted chips here use color-mix(…, transparent) and the sliding segmented
				 * indicator paints from a sibling. Reconstructing either from computed
				 * styles produced confident nonsense, so instead of guessing, this returns
				 * null for anything involving alpha and those elements are counted as
				 * unmeasured rather than failed. An audit that cries wolf gets ignored,
				 * which is worse than an audit with a known blind spot.
				 */
				const bgOf = function (el) {
					let n = el;
					while (n) {
						const c = toRgba(getComputedStyle(n).backgroundColor);
						if (c[3] >= 0.999) {
							return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
						}
						if (c[3] > 0.001) return null; // translucent layer: not measurable
						n = n.parentElement;
					}
					return getComputedStyle(document.body).backgroundColor;
				};

				let unreadable = 0;
				let unmeasured = 0;
				const offenders = [];
				const nodes = Array.prototype.slice.call(
					document.querySelectorAll('p, span, td, th, li, a, h1, h2, h3, button'), 0, 700
				);
				for (const el of nodes) {
					const text = (el.textContent || '').trim();
					if (!text || text.length > 200 || el.children.length) continue;
					const cs = getComputedStyle(el);
					if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.3) continue;
					const bg = bgOf(el);
					if (bg === null) { unmeasured++; continue; }
					const lf = lum(cs.color);
					const lb = lum(bg);
					if (lf === null || lb === null) { unmeasured++; continue; }
					const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
					if (ratio < 2.4) {
						unreadable++;
						offenders.push({
							ratio: Number(ratio.toFixed(2)),
							text: text.slice(0, 28),
							sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
								? '.' + el.className.split(/\\s+/).filter(function (c) { return c && c.indexOf('svelte-') !== 0; }).join('.')
								: ''),
							fg: cs.color,
							bg: bg
						});
					}
				}
				offenders.sort(function (a, b) { return a.ratio - b.ratio; });
				return {
					overflow: overflow,
					shell: shell,
					worst: worst,
					stranded: stranded.slice(0, 5),
					unreadable: unreadable,
					unmeasured: unmeasured,
					offenders: offenders.slice(0, 6)
				};
			})()`)) as {
				overflow: number;
				shell: number;
				worst: string;
				stranded: string[];
				unreadable: number;
				unmeasured: number;
				offenders: { ratio: number; text: string; sel: string; fg: string; bg: string }[];
			};

			const where = `${vp.id}/${themeName}/${check.name}`;
			/*
			 * Assert the SHELL number, not the document one. The document can never
			 * overflow under the fixed shell, so the old doc-level check read 0px on
			 * every route forever while the menubar quietly overflowed .os by 36px at
			 * 390px — visible only because the world-projections block measured .os
			 * honestly. One tolerance for every viewport: an overflow is an overflow.
			 */
			ok(`${where} no h-overflow`, audit.shell <= 1, `${audit.shell}px shell / ${audit.overflow}px doc`);
			ok(
				`${where} nothing escapes the shell`,
				audit.shell <= (vp.id === 'phone' ? 40 : 1),
				audit.shell > (vp.id === 'phone' ? 40 : 1) ? `${audit.shell}px, widest: ${audit.worst}` : ''
			);
			ok(
				`${where} wide content is reachable`,
				audit.stranded.length === 0,
				audit.stranded.join(' | ')
			);
			ok(
				`${where} text readable`,
				audit.unreadable === 0,
				audit.unreadable ? `${audit.unreadable} low-contrast` : ''
			);
			if (audit.unreadable) {
				for (const o of audit.offenders) {
					console.error(`          ${o.ratio}:1  ${o.sel}  "${o.text}"  fg=${o.fg} bg=${o.bg}`);
				}
			}

			// One set of phone screenshots to eyeball, in the theme most readers see.
			if (vp.id === 'phone' && themeName === 'dark') {
				await page.screenshot({ path: join(OUT, `phone-${check.name}.png`) });
			}

			await page.close();
		}
	}
	await context.close();
}

await browser.close();

console.log(
	`\n  ${checksRun - failures.length}/${checksRun} checks passed${failures.length ? `, ${failures.length} FAILED` : ''}`
);
console.log(`  screenshots: .smoke/\n`);
process.exit(failures.length ? 1 : 0);
