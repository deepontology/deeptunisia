/**
 * Assertions over the landing page's "Start here" doors.
 *
 * The thumbnails and the figures under them are computed, so the test does not
 * trust the module's own helpers: every expected number is re-derived here with a
 * plain loop over the dataset, and the rendered SVG is counted against it. A
 * hand-built fixture then proves the output follows the data rather than constants.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDoors, doorFigures, DOOR_STRINGS, type Dataset } from './landing/doors.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const MONTH_MS = 30.44 * 86_400_000;
const VERIFIED = /^verified:(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;
const IN_POST = new Set(['ongoing', 'last-verified', 'unknown']);
const HEADS = new Set(['president', 'prime-minister']);

/* Independent re-derivation: plain loops, no helpers from the module or src/lib/tenure. */
function expected(ds: Dataset) {
	let inPost = 0;
	let recent = 0;
	for (const p of ds.positions) {
		if (!IN_POST.has(p.interval.status)) continue;
		inPost++;
		const m = VERIFIED.exec(p.interval.raw?.end ?? '');
		if (!m) continue;
		const t = Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1);
		const months = Math.max(0, Math.round((ds.meta.cutoff - t) / MONTH_MS));
		if (months <= 12) recent++;
	}
	const heads = ds.positions.filter((p) => HEADS.has(p.role)).length;

	const deg = new Map<string, number>();
	for (const r of ds.relationships) {
		if (!r.from || !r.to) continue;
		deg.set(r.from, (deg.get(r.from) ?? 0) + 1);
		deg.set(r.to, (deg.get(r.to) ?? 0) + 1);
	}
	const known = new Set(ds.people.map((p) => p.id));
	const ranked = [...deg.entries()]
		.filter(([id]) => known.has(id))
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
	const top = new Set(ranked.slice(0, 24).map(([id]) => id));
	const lines = ds.relationships.filter((r) => top.has(r.from) && top.has(r.to)).length;
	return { inPost, recent, heads, nodes: Math.min(24, ranked.length), lines };
}

/* Splits the rendered markup into its three doors. */
function doorsOf(html: string) {
	const out: { href: string; body: string }[] = [];
	for (const m of html.matchAll(/<a class="door" href="([^"]+)">([\s\S]*?)<\/a>/g)) {
		out.push({ href: m[1], body: m[2] });
	}
	return out;
}

function svgOf(body: string): string {
	return body.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
}

function count(s: string, re: RegExp): number {
	return (s.match(re) ?? []).length;
}

function runAll(ds: Dataset, label: string) {
	console.log(`\n  ${label}`);
	const html = renderDoors(ds);
	const doors = doorsOf(html);
	const want = expected(ds);

	/* determinism */
	check(`${label}: renders identically twice`, renderDoors(ds) === html);
	const clone = structuredClone(ds) as Dataset;
	check(`${label}: renders identically for a deep clone`, renderDoors(clone) === html);

	/* figures match the independent derivation */
	const fig = doorFigures(ds);
	check(`${label}: doorFigures agrees with the independent count`, fig.inPost === want.inPost && fig.inPostRecent === want.recent, `${fig.inPost} / ${fig.inPostRecent}`);
	const stat = (key: string) => html.match(new RegExp(`<!--stat:${key}-->(\\d+)<!--/stat-->`))?.[1];
	check(`${label}: <!--stat:inPost--> is ${want.inPost}`, stat('inPost') === String(want.inPost), `got ${stat('inPost')}`);
	check(`${label}: <!--stat:inPostRecent--> is ${want.recent}`, stat('inPostRecent') === String(want.recent), `got ${stat('inPostRecent')}`);

	/* three doors, in order */
	const hrefs = doors.map((d) => d.href);
	check(`${label}: three doors /chronicle, /now, /network`, hrefs.length === 3 && hrefs[0] === '/chronicle' && hrefs[1] === '/now' && hrefs[2] === '/network', hrefs.join(' '));
	check(`${label}: exactly three <a class="door"`, count(html, /<a class="door"/g) === 3);

	const [chron, now, net] = doors.map((d) => svgOf(d.body));

	/* Now: one circle per in-post position, filled exactly for the recent ones */
	const circles = count(now, /<circle\b/g);
	const filled = count(now, /<circle\b[^>]*fill="currentColor"/g);
	check(`${label}: Now SVG has ${want.inPost} circles`, circles === want.inPost, `got ${circles}`);
	check(`${label}: Now SVG has ${want.recent} filled circles`, filled === want.recent, `got ${filled}`);

	/* Chronicle: min(12, heads of state and government) bars */
	const bars = count(chron, /<rect\b/g);
	check(`${label}: Chronicle SVG has min(12, ${want.heads}) bars`, bars === Math.min(12, want.heads), `got ${bars}`);

	/* Network: up to 24 nodes, one line per relationship among them */
	const nodes = count(net, /<circle\b/g);
	const lines = count(net, /<line\b/g);
	check(`${label}: Network SVG has ${want.nodes} nodes`, nodes === want.nodes, `got ${nodes}`);
	check(`${label}: Network SVG has ${want.lines} lines`, lines === want.lines, `got ${lines}`);

	/* no colour literals, no text, no data strings */
	check(`${label}: no hex colours`, !/#[0-9a-f]{3,6}\b/i.test(html));
	check(`${label}: no rgb(`, !html.includes('rgb('));
	check(`${label}: no <text`, !html.includes('<text'));

	/* every translatable key is known, and no number sits inside one */
	const keyed = [...html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)];
	check(`${label}: every data-i18n key is in DOOR_STRINGS`, keyed.length > 0 && keyed.every((m) => m[1] in DOOR_STRINGS));
	check(`${label}: no digits inside a data-i18n element`, keyed.every((m) => !/\d/.test(m[2])));
	check(`${label}: the three door questions are keyed`, ['door.chronicle', 'door.now', 'door.network'].every((k) => html.includes(`data-i18n="${k}"`)));
	const tpl = html.match(/data-i18n-tpl="([^"]+)"/)?.[1];
	check(`${label}: the Now figure line is a known template`, tpl === 'door.now.fig' && tpl in DOOR_STRINGS);
	check(
		`${label}: every slot in the template has a data-v value`,
		[...DOOR_STRINGS['door.now.fig'].matchAll(/\{(\w+)\}/g)].every((m) => html.includes(`data-v="${m[1]}"`))
	);
}

// ── the real dataset ───────────────────────────────────────────────────────

const ds = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8')) as Dataset;
runAll(ds, 'real dataset');

const real = expected(ds);
console.log(`\n  real dataset figures: inPost ${real.inPost}, inPostRecent ${real.recent}`);

// ── a hand-built fixture: the numbers must come from the data ──────────────

const CUT = Date.UTC(2026, 9, 10);

function iv(startEarliest: number, status: string, end: string | null, endLatest: number | null = null) {
	return { startEarliest, endLatest, status, raw: { start: null, end } };
}

const synthetic = {
	meta: { cutoff: CUT },
	positions: [
		// in post, no verified date: counted, not recent
		{ id: 'a', role: 'president', holder: 'x1', interval: iv(Date.UTC(2020, 0, 1), 'ongoing', 'ongoing') },
		// in post, verified recently: counted and recent
		{ id: 'b', role: 'prime-minister', holder: 'x2', interval: iv(Date.UTC(2025, 0, 1), 'last-verified', 'verified:2026-06') },
		// in post, verified long ago: counted, not recent
		{ id: 'c', role: 'speaker', holder: 'x3', interval: iv(Date.UTC(2019, 0, 1), 'unknown', 'verified:2024-01-01') },
		// ended: not counted at all
		{ id: 'd', role: 'president', holder: 'x4', interval: iv(Date.UTC(2000, 0, 1), 'ended', 'verified:2026-09', Date.UTC(2026, 8, 1)) },
		// in post, verified exactly twelve months before the cutoff: recent (boundary)
		{ id: 'e', role: 'prime-minister', holder: 'x5', interval: iv(Date.UTC(2024, 0, 1), 'last-verified', `verified:2025-10-${String(10).padStart(2, '0')}`) }
	],
	people: [
		{ id: 'px', layers: ['political'] },
		{ id: 'py', layers: ['security'] },
		{ id: 'pz', layers: ['economic'] }
	],
	relationships: [
		{ from: 'px', to: 'py', basis: 'documented' },
		{ from: 'py', to: 'pz', basis: 'reported' }
	]
} as unknown as Dataset;

console.log('');
const fixtureFig = doorFigures(synthetic);
check('fixture: inPost is 4 (ended excluded)', fixtureFig.inPost === 4, `got ${fixtureFig.inPost}`);
check('fixture: inPostRecent is 2 (boundary at 12 months included)', fixtureFig.inPostRecent === 2, `got ${fixtureFig.inPostRecent}`);

const fixtureHtml = renderDoors(synthetic);
const fixtureDoors = doorsOf(fixtureHtml);
const [, fixtureNow, fixtureNet] = fixtureDoors.map((d) => svgOf(d.body));
check('fixture: Now SVG has 4 circles, 2 filled', count(fixtureNow, /<circle\b/g) === 4 && count(fixtureNow, /<circle\b[^>]*fill="currentColor"/g) === 2);
check('fixture: Chronicle draws the 4 head-of-state/government tenures', count(svgOf(fixtureDoors[0].body), /<rect\b/g) === 4);
check('fixture: Network has 3 nodes and 2 lines', count(fixtureNet, /<circle\b/g) === 3 && count(fixtureNet, /<line\b/g) === 2);
check('fixture: dashed line only for the reported edge', count(fixtureNet, /stroke-dasharray="5 3"/g) === 1);
check('fixture: documented edge carries no dasharray', count(fixtureNet, /<line\b(?![^>]*stroke-dasharray)[^>]*>/g) === 1);

const nothing = { meta: { cutoff: CUT }, positions: [], people: [], relationships: [] } as unknown as Dataset;
const emptyHtml = renderDoors(nothing);
check('empty dataset: renders the three doors with zero figures', doorsOf(emptyHtml).length === 3 && emptyHtml.includes('<!--stat:inPost-->0<!--/stat-->'));

console.log(`\ntest-landing-doors: ${checks - failures}/${checks} passed`);
if (failures > 0) process.exit(1);
