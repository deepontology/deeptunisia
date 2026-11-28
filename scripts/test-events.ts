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
ok('the route exists in the instrument group', existsSync(join(ROOT, 'src', 'routes', '(instrument)', 'events', '+page.svelte')));

const nav = readFileSync(join(ROOT, 'src', 'lib', 'shell', 'nav.svelte.ts'), 'utf8');
ok('the menu entry for /events is an app link', /\{\s*href:\s*'\/events',\s*key:\s*'events'\s*\}/.test(nav), 'no document flag');
const shellFiles = walk(join(ROOT, 'src', 'lib', 'shell'), (n) => n.endsWith('.svelte') || n.endsWith('.ts'));
const external = shellFiles.filter((f) => /item\.document/.test(readFileSync(f, 'utf8')));
ok('no menu renders a link as an external document', external.length === 0, external.map((f) => f.slice(ROOT.length + 1)).join(', '));

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
ok('the ledger stylesheet and script are not in the build', !existsSync(join(BUILD, 'events.css')) && !existsSync(join(BUILD, 'events.js')));

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
