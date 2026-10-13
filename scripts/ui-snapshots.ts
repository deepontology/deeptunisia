/**
 * Screenshot harness for the static build.
 *
 * A redesign is judged with the eyes, and the eyes need evidence: every route,
 * every viewport, every theme, as PNGs a reviewer can lay side by side. This
 * serves `build/` over plain HTTP — no dev server, no framework in the way —
 * drives a real browser through the matrix, and fails the run on the two
 * things a screenshot exists to catch: a page that throws, and a page wider
 * than the window it is supposed to fit.
 *
 *   npx tsx scripts/ui-snapshots.ts
 *
 * SMOKE_CHROMIUM: use a system browser instead of Playwright's bundled one
 * (e.g. SMOKE_CHROMIUM=/usr/bin/chromium), the same escape hatch smoke.ts
 * offers for machines where the bundled download stalls.
 *
 * Images land in `.smoke/snapshots/<timestamp>/`. Each context is seeded as a
 * returning reader before it loads anything — boot already seen, tour already
 * read — because a first-visit overlay in every frame is a screenshot of the
 * welcome mat, not of the work.
 */
import { chromium, type Page } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUR_KEY, TOUR_VERSION } from '../src/lib/shell/tour-version.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, '..', 'build');

/** One directory per run, so a previous run's evidence is never overwritten. */
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(HERE, '..', '.smoke', 'snapshots', STAMP);

const PORT = Number(process.env.UI_SNAPSHOTS_PORT ?? 4173);

if (!existsSync(join(BUILD, 'index.html'))) {
	console.error('build/ is missing — run `npm run build` first');
	process.exit(1);
}

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.csv': 'text/csv; charset=utf-8',
	'.pdf': 'application/pdf',
	'.txt': 'text/plain; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8'
};

/**
 * Map a URL path onto a file in build/, the way a static host does:
 * `/x` is `x.html` when it exists, else `x/index.html`, else the file itself
 * (assets keep their extension). Anything else is the site's own 404 page.
 *
 * The join is normalized before it is used and then checked against the build
 * root, so a `..` in a decoded path cannot escape the directory being served.
 */
function resolveBuildFile(urlPath: string): string | null {
	let rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
	if (rel.endsWith('/')) rel += 'index.html';
	const candidates = [rel, `${rel}.html`, `${rel}/index.html`];
	for (const candidate of candidates) {
		const file = normalize(join(BUILD, candidate));
		if (file !== BUILD && !file.startsWith(BUILD + sep)) continue;
		if (existsSync(file) && statSync(file).isFile()) return file;
	}
	return null;
}

const server = createServer((req, res) => {
	const file = resolveBuildFile(req.url ?? '/');
	if (file) {
		res.writeHead(200, {
			'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
		});
		res.end(readFileSync(file));
		return;
	}
	// Rendered by the site itself, so a wrong route is evidence, not a browser
	// error page with no information in it.
	const notFound = join(BUILD, '404.html');
	if (existsSync(notFound)) {
		res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
		res.end(readFileSync(notFound));
	} else {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('404');
	}
});

await new Promise<void>((resolve, reject) => {
	server.once('error', reject);
	server.listen(PORT, '127.0.0.1', resolve);
});
const BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

/**
 * A returning reader: the boot sequence has run and the tour has been read.
 * Seeded through an init script so it is true on the first paint of every
 * navigation, exactly as it would be in a session that has already been
 * through both — the seeding values are the app's own constants, so a version
 * bump cannot leave this harness behind.
 */
const RETURNING_VISITOR = `(() => {
	try { sessionStorage.setItem('deeptunisia:booted', '1'); } catch (e) {}
	try { localStorage.setItem(${JSON.stringify(TOUR_KEY)}, ${JSON.stringify(String(TOUR_VERSION))}); } catch (e) {}
})()`;

const ROUTES: { path: string; id: string }[] = [
	{ path: '/', id: 'home' },
	{ path: '/chronicle', id: 'chronicle' },
	{ path: '/now', id: 'now' },
	{ path: '/network', id: 'network' },
	{ path: '/atlas', id: 'atlas' },
	{ path: '/investigate', id: 'investigate' },
	{ path: '/guide', id: 'guide' }
];
// The research route is only part of the build once its wave has landed.
if (existsSync(join(BUILD, 'research.html'))) ROUTES.push({ path: '/research', id: 'research' });

/**
 * The matrix: two viewports (phone carries touch, desktop does not) crossed
 * with the two colour schemes, at the sizes the design targets.
 */
const VIEWPORTS = [
	{ id: 'desktop', width: 1440, height: 900, mobile: false },
	{ id: 'phone', width: 390, height: 844, mobile: true }
] as const;
const THEMES = ['light', 'dark'] as const;

/**
 * Wait for the page to actually be there: overlays gone, fonts resolved, one
 * frame of layout. The boot selector is waited on in the detached state, which
 * resolves at once when the element was never mounted — the seeded contexts
 * never show it, and the landing page does not have it at all.
 */
async function settle(page: Page) {
	await page.waitForSelector('.boot', { state: 'detached', timeout: 15_000 }).catch(() => {});
	await page
		.evaluate(() => document.fonts.ready.then(() => undefined))
		.catch(() => {});
	await page.waitForTimeout(250);
}

/**
 * Horizontal overflow, as a string rather than a function: tsx compiles named
 * inner functions with an esbuild `__name` helper that does not exist in the
 * page context, so an evaluated string is the safe carrier.
 *
 * Both surfaces are measured. The document cannot overflow here — the shell is
 * fixed and clips it — so a document-only check would pass forever while
 * content wider than the window still pans the whole app sideways inside the
 * shell. The shell's own scroll width is where that shows up.
 */
const OVERFLOW = `(() => {
	const doc = document.documentElement;
	const os = document.querySelector('.os');
	return {
		doc: doc.scrollWidth - doc.clientWidth,
		shell: os ? os.scrollWidth - os.clientWidth : 0
	};
})()`;

async function overflowProblems(page: Page, label: string): Promise<string[]> {
	const audit = (await page.evaluate(OVERFLOW)) as { doc: number; shell: number };
	const problems: string[] = [];
	if (audit.doc > 0) problems.push(`${label} document overflows horizontally by ${audit.doc}px`);
	if (audit.shell > 0) problems.push(`${label} shell overflows horizontally by ${audit.shell}px`);
	return problems;
}

const browser = await chromium.launch(
	process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : undefined
);

mkdirSync(OUT, { recursive: true });
console.log(`\n  serving build/ at ${BASE}`);
console.log(`  images → ${OUT}`);

let images = 0;
const failures: string[] = [];

/**
 * One viewport crossed with one theme, as its own browser context so the two
 * colour schemes never share storage. The four cells run concurrently: the
 * matrix is dozens of page loads and a serial pass spends most of its time
 * waiting on the network, while a screenshot only needs the page settled.
 */
async function captureCell(vp: (typeof VIEWPORTS)[number], theme: (typeof THEMES)[number]) {
	const context = await browser.newContext({
		viewport: { width: vp.width, height: vp.height },
		isMobile: vp.mobile,
		hasTouch: vp.mobile,
		colorScheme: theme,
		reducedMotion: 'no-preference'
	});
	await context.addInitScript(RETURNING_VISITOR);

	for (const route of ROUTES) {
		const label = `${route.id}/${vp.id}/${theme}`;
		const page = await context.newPage();
		const problems: string[] = [];
		page.on('pageerror', (e) => problems.push(`${label} [pageerror] ${e.message}`));

		try {
			await page.goto(BASE + route.path, { waitUntil: 'networkidle', timeout: 30_000 });
			await settle(page);

			const shot = async (kind: string, fullPage: boolean) => {
				const file = join(OUT, `${route.id}-${vp.id}-${theme}-${kind}.png`);
				await page.screenshot({ path: file, fullPage });
				images += 1;
				console.log(`  shot  ${label} ${kind}`);
			};

			// What a reader sees on arrival.
			await shot('viewport', false);
			// The whole page, below the fold included — the part a viewport
			// shot silently drops.
			await shot('fullpage', true);

			problems.push(...(await overflowProblems(page, label)));

			/*
			 * The same arrival with the OS asking for less motion. Motion is
			 * a graded surface in this design, and reduced motion is a hard
			 * requirement, but no still of the animated state can show
			 * whether it was honoured — so it gets its own frame.
			 */
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
			await settle(page);
			await shot('reduced', false);
			problems.push(...(await overflowProblems(page, `${label} (reduced)`)));
		} catch (e) {
			problems.push(`${label} [load] ${(e as Error).message.split('\n')[0]}`);
		}

		for (const problem of problems) failures.push(problem);
		await page.close();
	}

	await context.close();
}

await Promise.all(
	VIEWPORTS.flatMap((vp) => THEMES.map((theme) => captureCell(vp, theme)))
);

await browser.close();
server.closeAllConnections();
server.close();

console.log(`\n  ${images} images in .smoke/snapshots/${STAMP}`);

if (failures.length) {
	console.error(`\n  ${failures.length} FAILURES`);
	for (const failure of failures) console.error(`    ${failure}`);
	console.error('');
	process.exit(1);
}
console.log('  no page errors, no horizontal overflow\n');
process.exit(0);
