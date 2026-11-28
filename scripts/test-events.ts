/**
 * Assertions over the events page, build/events.html, and the links to it.
 *
 * The events page is an instrument route: the same shell as every view (menu
 * bar, sections, Inspector, theme), prerendered by SvelteKit. What it promises
 * is checked here rather than trusted:
 *
 *   - build/events.html is the prerendered route, not a hand-built document:
 *     it boots the app, and its menu link is an ordinary in-app link
 *   - the static ledger is gone: no build script, no stylesheet, no script,
 *     nothing in the build that only the old page used
 *   - the page's own code and words load with /events and with no other page:
 *     every chunk that carries an events-page word is preloaded by /events only
 *   - the prerendered page states its title and draws the filters
 *   - the record pages link to it by the event's id, or by the person or
 *     institution whose events it should show, and every such id is real
 *   - the sitemap lists it
 *   - the growth-rings geometry (`components/events/rings.ts`) keeps its
 *     promises: ring weight 0.5 + n^0.75, the pith and the bark where they
 *     belong, the lens squeezing only the years before it, the core fold, marks
 *     inside their own ring, a mirrored figure for a right-to-left reader, and
 *     a growth clock that runs from the first year to the cutoff
 *   - the words only the record pages print (`documentWords`) keep the
 *     dictionary's rules and stay out of the app chunks
 *
 * Reads the built site, so it runs after `npm run build`. A tree that was never
 * built is skipped; a build without the page is a failure.
 * Usage: `npx tsx scripts/test-events.ts`
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentWords, translate as appTranslate } from '../src/lib/i18n.ts';
import { C, R, R0, angle, baseWeight, geometry, growthClock, layout, point, startOfYear } from '../src/lib/components/events/rings.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const PAGE = join(BUILD, 'events.html');
const DATASET = join(ROOT, 'src', 'generated', 'dataset.json');
const SITEMAP = join(BUILD, 'sitemap.xml');
const WORDS = join(ROOT, 'src', 'lib', 'components', 'events', 'words.ts');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	}
}

const sample = (list: string[]) => list.slice(0, 3).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');

/** Every script a page asks for before hydration: modulepreload links and inline imports. */
function preloads(html: string): string[] {
	const files = new Set<string>();
	for (const tag of html.match(/<link[^>]*>/g) ?? []) {
		if (!/rel="modulepreload"/.test(tag)) continue;
		const href = /href="([^"]+)"/.exec(tag)?.[1];
		if (href?.endsWith('.js')) files.add(href.replace(/^\.?\//, '').replace(/^(\.\.\/)+/, ''));
	}
	for (const match of html.matchAll(/import\("([^"]+\.js)"\)/g)) files.add(match[1].replace(/^\.?\//, '').replace(/^(\.\.\/)+/, ''));
	return [...files];
}

function walk(dir: string, keep: (name: string) => boolean, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path, keep, out);
		else if (keep(entry.name)) out.push(path);
	}
	return out;
}

console.log('\n  -- events page --\n');

/* ---------------------------------------------------------------------------
   The static ledger is retired, in the tree as in the build
   --------------------------------------------------------------------------- */

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
ok('the build no longer runs a ledger script', !/build-events/.test(pkg.scripts.build));
ok('the ledger build script is gone', !existsSync(join(ROOT, 'scripts', 'build-events.ts')));
ok('the ledger stylesheet and script are gone', !existsSync(join(ROOT, 'static', 'events.css')) && !existsSync(join(ROOT, 'static', 'events.js')));
ok('the standalone rings script is gone (the rings are an app component)', !existsSync(join(ROOT, 'static', 'events-rings.js')));
ok('the route exists in the instrument group', existsSync(join(ROOT, 'src', 'routes', '(instrument)', 'events', '+page.svelte')));

const nav = readFileSync(join(ROOT, 'src', 'lib', 'shell', 'nav.svelte.ts'), 'utf8');
ok('the menu entry for /events is an app link', /\{\s*href:\s*'\/events',\s*key:\s*'events'\s*\}/.test(nav), 'no document flag');
const shellFiles = walk(join(ROOT, 'src', 'lib', 'shell'), (n) => n.endsWith('.svelte') || n.endsWith('.ts'));
const external = shellFiles.filter((f) => /item\.document/.test(readFileSync(f, 'utf8')));
ok('no menu renders a link as an external document', external.length === 0, external.map((f) => f.slice(ROOT.length + 1)).join(', '));

/* ---------------------------------------------------------------------------
   The rings geometry, checked as numbers (no build needed)
   --------------------------------------------------------------------------- */

{
	const years = Array.from({ length: 2026 - 1955 + 1 }, (_, k) => 1955 + k);
	/* A record shaped like the real one: thin for decades, then busy. */
	const counts = years.map((y) => (y >= 2025 ? 60 : y >= 2021 ? 12 : y === 2011 ? 9 : y % 7 === 0 ? 1 : 0));
	ok('a ring weighs 0.5 + n^0.75', baseWeight(0) === 0.5 && baseWeight(16) === 8.5 && Math.abs(baseWeight(60) - (0.5 + 60 ** 0.75)) < 1e-9);

	const G = geometry(years, counts, 2021, null, 4);
	const steps = G.inner.every((r, i) => r <= G.outer[i] && (i === 0 || Math.abs(r - G.outer[i - 1]) < 1e-9));
	ok('rings run from the pith to the bark without gaps', Math.abs(G.inner[0] - R0) < 1e-9 && Math.abs(G.bark - R) < 1e-9 && steps);
	const width = (g: typeof G, y: number) => g.outer[y - 1955] - g.inner[y - 1955];
	const share = (y: number) => width(G, y) / baseWeight(counts[y - 1955]);
	ok(
		'the lens keeps every year from 2021 on at its own weight',
		[2021, 2022, 2025, 2026].every((y) => Math.abs(share(y) - share(2021)) < 1e-9)
	);
	ok('years before the lens are squeezed, the oldest most', share(2020) < share(2021) && share(2000) < share(2020) && share(1960) < share(2000));
	ok('the run of years too thin to hold a mark folds into the core', G.coreEnd !== null && G.coreEnd < 2021 && Math.abs(G.rc - G.outer[G.coreEnd - 1955]) < 1e-9, `core to ${G.coreEnd}`);
	const all = geometry(years, counts, 1955, null, 4);
	ok('with every year in the lens nothing is folded', all.coreEnd === null && all.rc === 0);

	const growDay = Date.UTC(2011, 6, 1) / 86_400_000;
	const grown = geometry(years, counts, 1955, growDay, 4);
	ok(
		'while growing, the years not lived yet have no width and the scale holds',
		width(grown, 2012) === 0 && width(grown, 2026) === 0 && Math.abs(grown.inner[1960 - 1955] - all.inner[1960 - 1955]) < 1e-9 && width(grown, 2011) < width(all, 2011)
	);

	const evs = [
		{ i: 0, day: Date.UTC(2021, 0, 1) / 86_400_000 },
		{ i: 1, day: Date.UTC(2021, 3, 15) / 86_400_000 },
		{ i: 2, day: Date.UTC(2025, 6, 1) / 86_400_000 },
		{ i: 3, day: Date.UTC(2025, 6, 2) / 86_400_000 },
		{ i: 4, day: Date.UTC(1981, 9, 9) / 86_400_000 }
	];
	const P = layout(evs, years, G, 4, 1);
	const inside = evs.every((e) => {
		const p = P[e.i]!;
		const y = new Date(e.day * 86_400_000).getUTCFullYear();
		return p.y === y && p.r >= G.inner[y - 1955] && p.r <= G.outer[y - 1955];
	});
	ok('every mark sits inside its own year\'s ring', inside);
	ok('January 1 is at the top', Math.abs(P[0]!.a - angle(0, 1)) < 1e-9 && Math.abs(point(100, P[0]!.a)[0] - C) < 1e-6);
	ok('a mark in a folded year says so', P[4]!.cored === true && P[0]!.cored === false);
	ok('two marks a day apart take different lanes when the ring has room', P[2]!.r !== P[3]!.r);
	const mirrored = layout(evs, years, G, 4, -1);
	ok(
		'a right-to-left reader gets the mirrored figure',
		evs.every((e) => {
			const a = point(P[e.i]!.r, P[e.i]!.a);
			const b = point(mirrored[e.i]!.r, mirrored[e.i]!.a);
			return Math.abs(a[0] - C + (b[0] - C)) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
		})
	);

	const cutoff = Date.UTC(2026, 10, 27) / 86_400_000;
	const clock = growthClock(1955, cutoff, evs.map((e) => e.day));
	const samples = Array.from({ length: 21 }, (_, k) => clock(k / 20));
	ok(
		'the growth clock runs from the first January to the cutoff, never backwards',
		samples[0] === startOfYear(1955) && samples[20] === cutoff && samples.every((t, k) => k === 0 || t >= samples[k - 1])
	);
}

if (!existsSync(BUILD)) {
	console.log('  note  build/ is missing: run `npm run build` to check the built page\n');
	console.log(`  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
	process.exit(failures ? 1 : 0);
}

ok('build/events.html exists', existsSync(PAGE));
if (!existsSync(PAGE)) {
	console.log(`\n  ${checks - failures}/${checks} checks passed, ${failures} FAILED\n`);
	process.exit(1);
}
ok(
	'the ledger stylesheet and scripts are not in the build',
	!existsSync(join(BUILD, 'events.css')) && !existsSync(join(BUILD, 'events.js')) && !existsSync(join(BUILD, 'events-rings.js'))
);

const html = readFileSync(PAGE, 'utf8');
const data = JSON.parse(readFileSync(DATASET, 'utf8')) as { events: { id: string }[]; people: { id: string }[]; institutions: { id: string }[] };

/* ---------------------------------------------------------------------------
   It is the prerendered app route
   --------------------------------------------------------------------------- */

ok('it boots the app', /__sveltekit_/.test(html) && /kit\.start\(/.test(html));
ok('it preloads the app modules', preloads(html).length > 0, `${preloads(html).length} files`);
ok('it states its title', /<title>Events · DeepTunisia<\/title>/.test(html));
ok('it carries a description', /<meta name="description" content="[^"]+"/.test(html));
const navLink = [...html.matchAll(/<a\b[^>]*href="\/events"[^>]*>/g)].map((m) => m[0]);
ok('the menu links to /events in the app', navLink.length > 0 && navLink.every((a) => !/rel="external"/.test(a)), `${navLink.length} link(s)`);
ok('the menu marks /events as the current page', navLink.some((a) => /aria-current="page"/.test(a)));

const eventWordsSrc = readFileSync(WORDS, 'utf8');
const englishBlock = eventWordsSrc.slice(eventWordsSrc.indexOf('en: {'), eventWordsSrc.indexOf('fr: {'));
const ownKeys = [...englishBlock.matchAll(/'(events\.[\w.]+)':/g)].map((m) => m[1]);
const englishOf = (key: string) => (new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']*)'`).exec(englishBlock) ?? [])[1] ?? '';
ok('the page words are listed', ownKeys.length > 0, `${ownKeys.length} keys`);
ok('the prerendered page draws the filters', html.includes(englishOf('events.lens.all')) && html.includes('aria-label="' + englishOf('events.filters') + '"'));

/* ---------------------------------------------------------------------------
   The page's code and words load with /events only
   --------------------------------------------------------------------------- */

{
	const chunks = walk(join(BUILD, '_app', 'immutable'), (n) => n.endsWith('.js'));
	const carrying = chunks
		.filter((path) => {
			const js = readFileSync(path, 'utf8');
			return ownKeys.some((key) => js.includes(`"${key}"`) || js.includes(`'${key}'`));
		})
		.map((path) => path.slice(BUILD.length + 1));
	ok('the page words are in the build', carrying.length > 0, `${carrying.length} chunk(s)`);
	const eventsPreloads = new Set(preloads(html));
	ok('the events page preloads its own words', carrying.some((c) => eventsPreloads.has(c)));
	const others = walk(BUILD, (n) => n.endsWith('.html')).filter((p) => p !== PAGE);
	const leaks: string[] = [];
	for (const page of others) {
		const pre = preloads(readFileSync(page, 'utf8'));
		for (const c of carrying) if (pre.includes(c)) leaks.push(`${page.slice(BUILD.length + 1)} preloads ${c}`);
	}
	ok('no other page preloads the events page code', leaks.length === 0, leaks.length ? sample(leaks) : `${others.length} pages`);
}

{
	/* The rings component writes its scar gradients under this id; the chunk that holds it is the rings code. */
	const chunks = walk(join(BUILD, '_app', 'immutable'), (n) => n.endsWith('.js'));
	const rings = chunks.filter((path) => readFileSync(path, 'utf8').includes('ev-scar-')).map((path) => path.slice(BUILD.length + 1));
	ok('the rings face is in the build', rings.length > 0, `${rings.length} chunk(s)`);
	const pre = new Set(preloads(html));
	ok('the events page preloads the rings', rings.some((c) => pre.has(c)));
	const elsewhere = walk(BUILD, (n) => n.endsWith('.html'))
		.filter((p) => p !== PAGE)
		.flatMap((p) => (rings.some((c) => preloads(readFileSync(p, 'utf8')).includes(c)) ? [p.slice(BUILD.length + 1)] : []));
	ok('no other page preloads the rings', elsewhere.length === 0, elsewhere.length ? sample(elsewhere) : 'clean');
}

/* ---------------------------------------------------------------------------
   Links in: the record pages
   --------------------------------------------------------------------------- */

{
	const eventIds = new Set(data.events.map((e) => e.id));
	const actorIds = new Set([...data.people.map((p) => p.id), ...data.institutions.map((i) => i.id)]);
	const recordPages = walk(BUILD, (n) => n.endsWith('.html')).filter((p) => /\/(e|p|i)\//.test(p.slice(BUILD.length)));
	const bad: string[] = [];
	let byId = 0;
	let byThread = 0;
	for (const page of recordPages) {
		const text = readFileSync(page, 'utf8');
		for (const m of text.matchAll(/href="\/events([^"]*)"/g)) {
			const q = m[1].replace(/&amp;/g, '&');
			if (q.startsWith('#')) {
				bad.push(`${page.slice(BUILD.length + 1)} links to an anchor ${q}`);
				continue;
			}
			const params = new URLSearchParams(q.replace(/^\?/, ''));
			const id = params.get('id');
			const thread = params.get('actor') ?? params.get('institution');
			if (id !== null) {
				byId++;
				if (!eventIds.has(id)) bad.push(`${page.slice(BUILD.length + 1)} names unknown event ${id}`);
			} else if (thread !== null) {
				byThread++;
				if (!actorIds.has(thread)) bad.push(`${page.slice(BUILD.length + 1)} names unknown thread ${thread}`);
			} else bad.push(`${page.slice(BUILD.length + 1)} links to /events${q}`);
		}
	}
	ok('every event record links to its own event on the events page', byId === data.events.length, `${byId} of ${data.events.length}`);
	ok('the person and institution records link to their events', byThread > 0, `${byThread} links`);
	ok('every record link to /events names a real event, person or institution', bad.length === 0, bad.length ? sample(bad) : 'clean');
}

if (existsSync(SITEMAP)) {
	const sitemap = readFileSync(SITEMAP, 'utf8');
	ok('the sitemap lists /events', /<loc>https:\/\/deeptunisia\.org\/events<\/loc>/.test(sitemap));
} else {
	ok('the sitemap lists /events', false, 'build/sitemap.xml is missing');
}

/* ---------------------------------------------------------------------------
   The document words: held to the dictionary's rules, and out of the app chunk
   --------------------------------------------------------------------------- */

{
	const english = Object.keys(documentWords.en);
	const placeholdersIn = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
	const parity: string[] = [];
	for (const locale of ['fr', 'ar'] as const) {
		const keys = Object.keys(documentWords[locale]);
		for (const key of english) if (!(key in documentWords[locale])) parity.push(`${locale} lacks ${key}`);
		for (const key of keys) if (!(key in documentWords.en)) parity.push(`${locale} adds ${key}`);
	}
	ok('every document word exists in all three languages', parity.length === 0, parity.length ? sample(parity) : `${english.length} words`);

	const shape: string[] = [];
	for (const locale of ['en', 'fr', 'ar'] as const) {
		for (const [key, value] of Object.entries(documentWords[locale])) {
			if (!value.trim()) shape.push(`${locale} ${key} is empty`);
			if (value.includes('—')) shape.push(`${locale} ${key} has an em dash`);
			if (locale !== 'en' && key in documentWords.en && placeholdersIn(value) !== placeholdersIn(documentWords.en[key])) {
				shape.push(`${locale} ${key} placeholders {${placeholdersIn(value)}} vs {${placeholdersIn(documentWords.en[key])}}`);
			}
		}
	}
	ok('every document word is filled, keeps the English placeholders and has no em dash', shape.length === 0, shape.length ? sample(shape) : 'clean');

	/* A key in both places would let two copies drift; the table wins in the build. */
	const shadowed = english.filter((key) => appTranslate('en', key) !== key);
	ok('no document word is also an app dictionary key', shadowed.length === 0, sample(shadowed));

	/* Every document word is printed by a record page; a word nothing prints is dead weight. */
	const records = readFileSync(join(ROOT, 'scripts', 'records', 'page.ts'), 'utf8');
	const unused = english.filter((key) => !records.includes(`'${key}'`));
	ok('every document word is printed by a record page', unused.length === 0, unused.length ? sample(unused) : `${english.length} words`);

	const chunkFiles = walk(join(BUILD, '_app', 'immutable'), (n) => n.endsWith('.js'));
	const leaked = new Set<string>();
	for (const path of chunkFiles) {
		const js = readFileSync(path, 'utf8');
		for (const key of english) if (js.includes(`"${key}"`) || js.includes(`'${key}'`)) leaked.add(key);
	}
	ok('the app chunks carry no document word', chunkFiles.length > 0 && leaked.size === 0, chunkFiles.length ? (leaked.size ? sample([...leaked]) : `${chunkFiles.length} chunks`) : 'no app chunks built');
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
