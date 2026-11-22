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
 * Three gates, each measured on its own page load and never averaged together:
 *
 *   tap      PRIMARY. The first time a tap on the first Chronicle tenure opens its
 *            record (the URL gains `?id=`). This is what a reader does on that page.
 *   text     The first time that record's text is on screen: its tagline or summary,
 *            which is a file of its own (`prose-en.json`) and not part of the page's
 *            graph. A tap that opens a record with no words in it is not a reader's
 *            answer, so this gate is read beside the tap gate, never instead of it.
 *   palette  SECONDARY. The first time pressing "/" opens the search palette with
 *            results in it. The index is built from the record text, so this gate
 *            includes the cost of fetching that text and building the index.
 *
 * The plan's 5-second line is judged against the tap gate. Bytes are what the
 * browser received over the wire (encoded) before the gate passed.
 *
 * --cpu-profile prints where the page spent its main-thread time on the first run of the tap
 * gate and of the text gate, by function: self time and inclusive time, for the whole run, for
 * the time before the record opened (the URL gained `?id=`) and for the time after it. Run it
 * against a build made with `npx vite build --minify false` to read function names.
 *
 * After the text row, a `relayouts` row says how many times the browser laid the whole built page
 * out again before the words were on screen (layouts that dirty over half of the page's layout
 * objects, after the first, which is the page being built), from traced runs of their own: the
 * count is the cause, the text gate is its symptom.
 *
 * Every row says how loaded the machine was while it ran: the 1-minute load average
 * (at the start of the row and at its end), the share of the processors that were busy
 * during it, and `LOADED` when the load average was over a quarter of the processors.
 * The processor throttle is relative to the machine's own speed, so a figure taken on a
 * busy machine is pessimistic and says so in its own row. `--enforce` does not give a
 * verdict on a loaded machine: it exits 3, "not taken on a quiet machine".
 *
 * This is a measurement, not a test: it needs a build and a browser, and it
 * asserts nothing unless `--enforce` is given, which fails when the 4G median of a
 * gate is over its line (`LINES`). It is not part of `npm test`.
 */
import { chromium, type CDPSession, type Page } from 'playwright';
import http from 'node:http';
import os from 'node:os';
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

type Gate = 'tap' | 'text' | 'palette';

interface Run {
	gate: Gate;
	firstPaint: number;
	usable: number | null;
	wireKB: number;
	/** Full-page relayouts before the gate passed; only on a traced run. */
	relayouts: { count: number; ms: number } | null;
}

const BUDGET_MS = 120_000;

/** Load above this share of the processors is not a quiet machine. */
const QUIET_LOAD_PER_CPU = 0.25;

function cpuTimes(): { idle: number; total: number } {
	let idle = 0;
	let total = 0;
	for (const c of os.cpus()) {
		idle += c.times.idle;
		total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
	}
	return { idle, total };
}
const load1 = () => os.loadavg()[0];
const isLoaded = (l: number) => l > os.cpus().length * QUIET_LOAD_PER_CPU;

/**
 * The lines, in milliseconds, on the 4G profile with the processor four times slower.
 * `tap` is the plan's 5-second line and is defined by the tap gate. `text` is the line for
 * "a record you can read": the open record's words on screen. They are separate promises
 * with separate numbers; neither stands in for the other. `--enforce` exits non-zero
 * when a median on that profile is over its line.
 */
const LINES: Record<string, Partial<Record<Gate, number>>> = {
	'4g-cpu4': { tap: 5_000, text: 7_000 }
};

/** True once the open record shows words: a tagline or a summary with text in it. */
async function recordText(page: Page): Promise<boolean> {
	return page
		.evaluate(() =>
			Array.from(document.querySelectorAll('.tagline, .summary')).some(
				(e) => ((e as HTMLElement).innerText ?? '').trim().length > 20
			)
		)
		.catch(() => false);
}

async function runOnce(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	base: string,
	route: string,
	profile: Profile,
	gate: Gate,
	cpuProfile: boolean,
	trace = false
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
	const traced: { ts: number; dur: number; ph: string; name: string; cat?: string; args?: { beginData?: { dirtyObjects: number; totalObjects: number } } }[] = [];
	let traceDone: Promise<void> | null = null;
	if (trace) {
		cdp.on('Tracing.dataCollected', (e) => {
			traced.push(...(e.value as typeof traced));
		});
		traceDone = new Promise<void>((resolve) => cdp.on('Tracing.tracingComplete', () => resolve()));
		await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' });
	}
	let profilerStartedAt = 0;
	if (cpuProfile) {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
		profilerStartedAt = Date.now();
		await cdp.send('Profiler.start');
	}

	const start = Date.now();
	let recordOpenedAt: number | null = null;
	await page.goto(base + route, { waitUntil: 'commit' });
	let usable: number | null = null;
	let wireAtGate = 0;
	while (Date.now() - start < BUDGET_MS) {
		if (gate === 'tap' || gate === 'text') {
			// A tap before hydration does nothing, so the first one that opens a record is the
			// answer. The tap is the page's own click on the first tenure, dispatched in the page:
			// a driver-side tap re-checks every one of the page's buttons for actionability on
			// each attempt and would measure itself.
			await page
				.evaluate(() => (document.querySelector('.tb') as HTMLElement | null)?.click())
				.catch(() => {});
			if (/[?&]id=/.test(page.url())) {
				recordOpenedAt ??= Date.now() - start;
				const words = gate === 'tap' ? true : await recordText(page);
				if (words) {
					usable = Date.now() - start;
					wireAtGate = wire;
					break;
				}
			}
		} else {
			// Once the palette is open a further "/" would be typed into its query.
			if ((await page.locator('.palette').count().catch(() => 0)) === 0) await page.keyboard.press('/').catch(() => {});
			if ((await page.locator('.palette li button').count().catch(() => 0)) > 0) {
				usable = Date.now() - start;
				wireAtGate = wire;
				break;
			}
		}
		await page.waitForTimeout(100);
	}
	if (cpuProfile) await printProfile(cdp, gate, recordOpenedAt === null ? null : recordOpenedAt + (start - profilerStartedAt));
	let relayouts: Run['relayouts'] = null;
	if (trace && traceDone) {
		await page.evaluate(() => performance.mark('GATE')).catch(() => {});
		await cdp.send('Tracing.end');
		await traceDone;
		const gateAt = traced.find((e) => e.name === 'GATE' && e.cat?.includes('user_timing'))?.ts ?? Infinity;
		const layouts = traced.filter((e) => e.ph === 'X' && e.name === 'Layout' && e.args?.beginData && e.ts < gateAt);
		const biggest = Math.max(0, ...layouts.map((e) => e.args!.beginData!.totalObjects));
		// Layouts of the built page that dirtied over half of it: the first is the page being built,
		// each one after it is the browser laying the whole page out again.
		const full = layouts
			.filter((e) => e.args!.beginData!.totalObjects >= biggest * 0.75 && e.args!.beginData!.dirtyObjects * 2 > e.args!.beginData!.totalObjects)
			.sort((x, y) => x.ts - y.ts)
			.slice(1);
		relayouts = { count: full.length, ms: Math.round(full.reduce((a, e) => a + e.dur, 0) / 1000) };
	}
	const firstPaint = await page.evaluate(() => (window as unknown as { __fcp: number | null }).__fcp ?? 0).catch(() => 0);
	await context.close();
	return { gate, firstPaint: Math.round(firstPaint), usable, wireKB: Math.round((usable === null ? wire : wireAtGate) / 1024), relayouts };
}

/**
 * Where the main thread spent its time, by function. `splitAtMs` is the moment the record
 * opened (the URL gained `?id=`), measured from when the profiler started: the profile is
 * printed whole, then for the time after that moment, which is the record panel's own render.
 */
async function printProfile(cdp: CDPSession, gate: Gate, splitAtMs: number | null): Promise<void> {
	const { profile } = await cdp.send('Profiler.stop');
	const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const parent = new Map<number, number>();
	for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
	const label = (id: number) => {
		const n = byId.get(id)!;
		return `${n.callFrame.functionName || '(anonymous)'}  ${n.callFrame.url.split('/').pop() ?? ''}:${n.callFrame.lineNumber}`;
	};
	const report = (title: string, from: number, to: number) => {
		const self = new Map<string, number>();
		const inclusive = new Map<string, number>();
		let at = 0;
		profile.samples?.forEach((id, i) => {
			const us = profile.timeDeltas?.[i] ?? 0;
			at += us;
			if (!byId.get(id) || at / 1000 < from || at / 1000 >= to) return;
			self.set(label(id), (self.get(label(id)) ?? 0) + us);
			// Inclusive time: every function on the stack of this sample, once.
			const seen = new Set<string>();
			for (let n: number | undefined = id; n !== undefined; n = parent.get(n)) {
				const key = label(n);
				if (seen.has(key)) continue;
				seen.add(key);
				inclusive.set(key, (inclusive.get(key) ?? 0) + us);
			}
		});
		const idle = self.get('(idle)  :-1') ?? 0;
		const total = [...self.values()].reduce((a, b) => a + b, 0);
		console.log(`\n  ${gate} gate, one run, ${title}: ${Math.round(total / 1000)} ms sampled, ${Math.round(idle / 1000)} ms idle (waiting)`);
		const show = (what: string, m: Map<string, number>) => {
			console.log(`  ${what}`);
			for (const [key, us] of [...m.entries()]
				.filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(root)'))
				.sort((a, b) => b[1] - a[1])
				.slice(0, 22)) {
				console.log(`    ${String(Math.round(us / 1000)).padStart(6)} ms  ${key}`);
			}
		};
		show('self time by function', self);
		show('inclusive time by function (a function and everything it called)', inclusive);
	};
	report('whole run', 0, Infinity);
	if (splitAtMs !== null) {
		report(`before the record opened (first ${Math.round(splitAtMs)} ms)`, 0, splitAtMs);
		report('after the record opened', splitAtMs, Infinity);
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
console.log('  primary gate: tap (the first tenure opens its record); text: that record shows its words; secondary: palette (search opens with results)\n');
console.log('  profile          gate     first paint   usable     wire before usable   line');
const profiled = new Set<Gate>();
let overLine = false;
let everLoaded = false;
console.log(`  machine: ${os.cpus().length} processors, 1-minute load average ${load1().toFixed(1)} at the start (quiet is under ${(os.cpus().length * QUIET_LOAD_PER_CPU).toFixed(0)})\n`);
for (const profile of PROFILES) {
	if (only && profile.name !== only) continue;
	if (remote && profile.local) continue;
	for (const gate of ['tap', 'text', 'palette'] as Gate[]) {
		const results: Run[] = [];
		const loadBefore = load1();
		const cpuBefore = cpuTimes();
		for (let i = 0; i < runs; i++) {
			const withProfile = cpuProfile && !profiled.has(gate) && gate !== 'palette' && i === 0;
			results.push(await runOnce(browser, base, route, profile, gate, withProfile));
			if (withProfile) profiled.add(gate);
		}
		const usable = median(results.map((r) => r.usable));
		const paint = median(results.map((r) => r.firstPaint));
		const wire = median(results.map((r) => r.wireKB));
		const sec = (ms: number | null) => (ms === null ? 'never' : `${(ms / 1000).toFixed(2)} s`);
		const cpuAfter = cpuTimes();
		const busy = Math.round((1 - (cpuAfter.idle - cpuBefore.idle) / (cpuAfter.total - cpuBefore.total)) * 100);
		const loadAfter = load1();
		const loaded = isLoaded(loadBefore) || isLoaded(loadAfter);
		if (loaded) everLoaded = true;
		const line = LINES[profile.name]?.[gate];
		const over = line !== undefined && (usable === null || usable > line);
		if (over) overLine = true;
		console.log(
			`  ${profile.name.padEnd(16)} ${gate.padEnd(8)} ${sec(paint).padEnd(13)} ${sec(usable).padEnd(10)} ${wire?.toLocaleString('en-US')} KB` +
				(line === undefined ? '' : `   line ${sec(line)}${over ? '  OVER' : ''}`) +
				`   load ${loadBefore.toFixed(1)}→${loadAfter.toFixed(1)}, ${busy}% busy${loaded ? '  LOADED' : ''}`
		);
		if (gate === 'text') {
			// The cause behind the text gate's time: how many times the browser laid the whole page
			// out again before the words were on screen. Traced runs of their own, so tracing does
			// not touch the figures above.
			const traced: Run[] = [];
			for (let i = 0; i < runs; i++) traced.push(await runOnce(browser, base, route, profile, 'text', false, true));
			const counts = traced.map((r) => r.relayouts?.count ?? null);
			const spent = traced.map((r) => r.relayouts?.ms ?? null);
			console.log(
				`  ${profile.name.padEnd(16)} relayouts: ${median(counts)} full-page relayouts of the built page before the words (runs: ${counts.join(', ')}), ${median(spent)} ms in them`
			);
		}
	}
}
console.log('');
await browser.close();
local?.close();
if (process.argv.includes('--enforce')) {
	if (everLoaded) {
		console.log('  --enforce: the machine was loaded during this run, so it gives no verdict. Run it again when it is quiet.\n');
		process.exit(3);
	}
	if (overLine) process.exit(1);
}
