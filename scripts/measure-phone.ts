/**
 * Phone load measurement.
 *
 * The weight lane (spec 4, C3) is aimed by one question: how long before a
 * reader on a phone can use a page. This script answers it for one route, with
 * the numbers the plan names, and prints them so a claim about load time can be
 * reproduced rather than remembered.
 *
 *   npx tsx scripts/measure-phone.ts [--url <base>] [--route /chronicle]
 *                                    [--runs 3] [--profile <name>] [--cpu-profile]
 *
 * Without --url it serves the built site (`build/`) from a local server that
 * answers with brotli, as the Worker does; with --url it measures that address
 * as it is. Running both and comparing isolates edge latency from the rest.
 *
 * The browser is a 390x844 mobile device (touch, device pixel ratio 3) with the
 * cache off. Network and CPU are throttled through the browser's own emulation,
 * so the throttle applies to a local server too; a profile named "loopback"
 * has no network throttle and measures CPU alone.
 *
 * Two gates, each measured on its own page load and never averaged together:
 *
 *   tap      PRIMARY. The first time a tap on the first Chronicle tenure opens its
 *            record (the URL gains `?id=`). This is what a reader does on that page.
 *   palette  SECONDARY. The first time pressing "/" opens the search palette.
 *            Opening it asks for the full search index, so this gate includes the
 *            cost of building that index.
 *
 * The plan's 5-second line is judged against the tap gate. Bytes are what the
 * browser received over the wire (encoded) before the gate passed.
 *
 * --cpu-profile prints where the page spent its main-thread time before the tap
 * gate passed, by function, for the first profile run.
 *
 * This is a measurement, not a test: it needs a build and a browser, and it
 * makes no assertion. It is not part of `npm test`.
 */
import { chromium, type CDPSession } from 'playwright';
import http from 'node:http';
import zlib from 'node:zlib';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'build');

interface Profile {
	name: string;
	/** Bytes per second, or -1 for no network throttle. */
	down: number;
	up: number;
	/** Round-trip latency in milliseconds. */
	latency: number;
	/** CPU slowdown factor; 1 is unthrottled. */
	cpu: number;
	/** Whether the profile means anything against a remote address. */
	local?: boolean;
}

const PROFILES: Profile[] = [
	{ name: '4g-cpu4', down: 9_000_000 / 8, up: 1_500_000 / 8, latency: 170, cpu: 4 },
	{ name: 'slow4g-cpu4', down: (1_600_000 / 8) * 0.9, up: (750_000 / 8) * 0.9, latency: 150, cpu: 4 },
	{ name: '4g-cpu1', down: 9_000_000 / 8, up: 1_500_000 / 8, latency: 170, cpu: 1 },
	{ name: 'loopback-cpu4', down: -1, up: -1, latency: 0, cpu: 4, local: true },
	{ name: 'loopback-cpu1', down: -1, up: -1, latency: 0, cpu: 1, local: true }
];

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.woff2': 'font/woff2',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon'
};

function arg(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? process.argv[at + 1] : undefined;
}

/** The built site, served as the Worker serves it: brotli where the browser accepts it. */
function serveBuild(): Promise<{ base: string; close: () => void }> {
	const cache = new Map<string, Buffer>();
	const server = http.createServer((req, res) => {
		const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
		let file = join(BUILD, path);
		if (!existsSync(file) || statSync(file).isDirectory()) {
			file = existsSync(`${file}.html`) ? `${file}.html` : join(BUILD, path, 'index.html');
		}
		if (!existsSync(file)) {
			res.writeHead(404);
			res.end();
			return;
		}
		const type = TYPES[extname(file)] ?? 'application/octet-stream';
		const compressible = /^(text|application\/json|image\/svg)/.test(type);
		let body = readFileSync(file);
		let encoding: string | null = null;
		if (compressible && /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
			if (!cache.has(file)) {
				cache.set(file, zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }));
			}
			body = cache.get(file)!;
			encoding = 'br';
		}
		res.writeHead(200, {
			'content-type': type,
			'cache-control': 'no-store',
			...(encoding ? { 'content-encoding': encoding } : {})
		});
		res.end(body);
	});
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			resolve({ base: `http://127.0.0.1:${port}`, close: () => server.close() });
		});
	});
}

type Gate = 'tap' | 'palette';

interface Run {
	gate: Gate;
	firstPaint: number;
	usable: number | null;
	wireKB: number;
}

const BUDGET_MS = 120_000;

async function runOnce(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	base: string,
	route: string,
	profile: Profile,
	gate: Gate,
	cpuProfile: boolean
): Promise<Run> {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
		userAgent:
			'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
	});
	const page = await context.newPage();
	const cdp: CDPSession = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: profile.latency,
		downloadThroughput: profile.down,
		uploadThroughput: profile.up
	});
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
	let wire = 0;
	cdp.on('Network.loadingFinished', (e) => {
		wire += e.encodedDataLength;
	});
	await page.addInitScript(() => {
		const w = window as unknown as { __fcp: number | null };
		w.__fcp = null;
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') w.__fcp = e.startTime;
		}).observe({ type: 'paint', buffered: true });
	});
	if (cpuProfile) {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
		await cdp.send('Profiler.start');
	}

	const start = Date.now();
	await page.goto(base + route, { waitUntil: 'commit' });
	let usable: number | null = null;
	let wireAtGate = 0;
	while (Date.now() - start < BUDGET_MS) {
		if (gate === 'tap') {
			// A tap before hydration does nothing, so the first one that opens a record is the
			// answer. The tap is the page's own click on the first tenure, dispatched in the page:
			// a driver-side tap re-checks every one of the page's buttons for actionability on
			// each attempt and would measure itself.
			await page
				.evaluate(() => (document.querySelector('.tb') as HTMLElement | null)?.click())
				.catch(() => {});
			if (/[?&]id=/.test(page.url())) {
				usable = Date.now() - start;
				wireAtGate = wire;
				break;
			}
		} else {
			await page.keyboard.press('/').catch(() => {});
			if ((await page.locator('.palette').count().catch(() => 0)) > 0) {
				usable = Date.now() - start;
				wireAtGate = wire;
				break;
			}
		}
		await page.waitForTimeout(100);
	}
	if (cpuProfile) await printProfile(cdp);
	const firstPaint = await page.evaluate(() => (window as unknown as { __fcp: number | null }).__fcp ?? 0).catch(() => 0);
	await context.close();
	return { gate, firstPaint: Math.round(firstPaint), usable, wireKB: Math.round((usable === null ? wire : wireAtGate) / 1024) };
}

async function printProfile(cdp: CDPSession): Promise<void> {
	const { profile } = await cdp.send('Profiler.stop');
	const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const self = new Map<string, number>();
	profile.samples?.forEach((id, i) => {
		const n = byId.get(id);
		if (!n) return;
		const key = `${n.callFrame.functionName || '(anonymous)'}  ${n.callFrame.url.split('/').pop() ?? ''}:${n.callFrame.lineNumber}`;
		self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0));
	});
	const total = [...self.values()].reduce((a, b) => a + b, 0);
	console.log(`\n  main-thread time before the gate passed: ${Math.round(total / 1000)} ms (self time by function)`);
	for (const [key, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
		console.log(`    ${String(Math.round(us / 1000)).padStart(6)} ms  ${key}`);
	}
}

function median(values: (number | null)[]): number | null {
	const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
	return v.length ? v[Math.floor(v.length / 2)] : null;
}

const route = arg('route') ?? '/chronicle';
const runs = Number(arg('runs') ?? 3);
const only = arg('profile');
const cpuProfile = process.argv.includes('--cpu-profile');
const remote = arg('url');

const local = remote ? null : await serveBuild();
const base = remote ?? local!.base;
if (!remote && !existsSync(BUILD)) {
	console.error('No build/ directory: run `npm run build` first, or pass --url.');
	process.exit(2);
}
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ['--no-sandbox']
});

console.log(`\n  ${route} on ${remote ?? 'the local build'} — 390x844 mobile, cache off, median of ${runs}`);
console.log('  primary gate: tap (the first tenure opens its record); secondary: palette (search opens)\n');
console.log('  profile          gate     first paint   usable     wire before usable');
let profiled = false;
for (const profile of PROFILES) {
	if (only && profile.name !== only) continue;
	if (remote && profile.local) continue;
	for (const gate of ['tap', 'palette'] as Gate[]) {
		const results: Run[] = [];
		for (let i = 0; i < runs; i++) {
			const withProfile = cpuProfile && !profiled && gate === 'tap' && i === 0;
			results.push(await runOnce(browser, base, route, profile, gate, withProfile));
			if (withProfile) profiled = true;
		}
		const usable = median(results.map((r) => r.usable));
		const paint = median(results.map((r) => r.firstPaint));
		const wire = median(results.map((r) => r.wireKB));
		const sec = (ms: number | null) => (ms === null ? 'never' : `${(ms / 1000).toFixed(1)} s`);
		console.log(
			`  ${profile.name.padEnd(16)} ${gate.padEnd(8)} ${sec(paint).padEnd(13)} ${sec(usable).padEnd(10)} ${wire?.toLocaleString('en-US')} KB`
		);
	}
}
console.log('');
await browser.close();
local?.close();
