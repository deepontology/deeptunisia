/**
 * Write one page per record into build/e/, the way build-landing.ts writes the
 * landing page.
 *
 * A record is not a view. A journalist links to /e/<id> and gets a document: a
 * small head, one shared stylesheet, no app shell, no graph, nothing that needs
 * JavaScript. So the pages are generated here, after the data build and after
 * vite has copied static/ into build/, rather than added as a route that would
 * hydrate the whole instrument for one record.
 *
 * WHAT THIS REFUSES TO DO
 *
 *   - two records of different kinds sharing an id (the /e/ space is flat, so
 *     the second would silently overwrite the first)
 *   - write a page that links to an asset that is not in the build
 *   - index a kind the switch in config.ts keeps out of the index
 *
 * The dataset itself is read, never written. Nothing here changes the hash.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, INDEXING, SITE_URL, PAGES_DIR, type RecordKind } from './records/config.ts';
import { renderRecord, type Rec, type World } from './records/page.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const OUT = join(BUILD, PAGES_DIR);
const DATA = join(ROOT, 'src', 'generated', 'dataset.json');
const TOKENS = join(ROOT, 'src', 'lib', 'design', 'tokens.css');
const SITEMAP = join(BUILD, 'sitemap.xml');

function fail(message: string): never {
	console.error(`\n  build-records: ${message}\n`);
	process.exit(1);
}

if (!existsSync(BUILD)) fail('build/ does not exist. Run `npm run build` (vite build comes before this step)');
if (!existsSync(DATA)) fail('src/generated/dataset.json is missing. Run `npm run data` first');
if (!existsSync(join(BUILD, PAGES_DIR, 'record.css'))) fail('build/e/record.css is missing. static/e/ has not been copied');
if (!existsSync(join(BUILD, PAGES_DIR, 'record.js'))) fail('build/e/record.js is missing. static/e/ has not been copied');
if (!existsSync(TOKENS)) fail('src/lib/design/tokens.css is missing');

interface Dataset {
	meta: { datasetHash: string; generated?: string };
	people: Rec[];
	institutions: Rec[];
	events: Rec[];
	positions: Rec[];
	relationships: Rec[];
	sources: Rec[];
	places: Rec[];
	regions: Rec[];
}

const data = JSON.parse(readFileSync(DATA, 'utf8')) as Dataset;

/* The /e/ space is shared by every kind, so the build stops on a collision
   rather than letting one record replace another's page. */
const seen = new Map<string, RecordKind>();
const collisions: string[] = [];
for (const kind of KINDS) {
	const rows = kind === 'person' ? data.people : kind === 'institution' ? data.institutions : data.events;
	for (const row of rows) {
		const previous = seen.get(row.id);
		if (previous && previous !== kind) collisions.push(`${row.id} (${previous} and ${kind})`);
		seen.set(row.id, kind);
	}
}
if (collisions.length) {
	fail(`two records of different kinds share an id:\n    ${collisions.slice(0, 10).join('\n    ')}`);
}

/* Indexes the page needs. Built once, so a heavy record does not scan the graph. */
function add(map: Map<string, Rec[]>, key: string, value: Rec) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

const world: World = {
	people: new Map(data.people.map((r) => [r.id, r])),
	institutions: new Map(data.institutions.map((r) => [r.id, r])),
	events: new Map(data.events.map((r) => [r.id, r])),
	/* An event's location is a place or a governorate; both are named in the same map. */
	places: new Map([...data.places, ...(data.regions ?? [])].map((r) => [r.id, r])),
	sources: new Map(data.sources.map((r) => [r.id, r])),
	positionsByHolder: new Map(),
	positionsByInstitution: new Map(),
	relByEndpoint: new Map(),
	eventsByActor: new Map(),
	eventsByInstitution: new Map(),
	hash: data.meta.datasetHash,
	generated: new Date().toISOString().slice(0, 10)
};

for (const p of data.positions) {
	add(world.positionsByHolder, String(p.holder), p);
	add(world.positionsByInstitution, String(p.institution), p);
}
for (const r of data.relationships) {
	add(world.relByEndpoint, String(r.from), r);
	if (r.to !== r.from) add(world.relByEndpoint, String(r.to), r);
}
for (const e of data.events) {
	for (const id of (e.actors as string[] | undefined) ?? []) add(world.eventsByActor, id, e);
	for (const id of (e.institutions as string[] | undefined) ?? []) add(world.eventsByInstitution, id, e);
}

/* A rerun must not leave a page for a record that no longer exists. Only pages
   and twins are cleared; the stylesheet, the script and the tokens stay. */
mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) {
	if (file.endsWith('.html') || file.endsWith('.json')) rmSync(join(OUT, file));
}

const written: Record<RecordKind, number> = { person: 0, institution: 0, event: 0 };
for (const kind of KINDS) {
	const rows = kind === 'person' ? data.people : kind === 'institution' ? data.institutions : data.events;
	for (const rec of rows) {
		const { html, twin } = renderRecord(kind, rec, world);
		writeFileSync(join(OUT, `${rec.id}.html`), html, 'utf8');
		writeFileSync(join(OUT, `${rec.id}.json`), JSON.stringify(twin), 'utf8');
		written[kind]++;
	}
}

/* The stylesheet must be built from the design tokens, so the tokens travel with
   it. A verbatim copy minus its prose comments: the comments explain the token
   file to the people editing it and cost every reader of every record page. */
const tokens = readFileSync(TOKENS, 'utf8')
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/\n{3,}/g, '\n\n')
	.trim();
writeFileSync(
	join(OUT, 'tokens.css'),
	`/* Copy of src/lib/design/tokens.css, written by scripts/build-records.ts. Do not edit here. */\n${tokens}\n`,
	'utf8'
);

/* The sitemap lists record pages only for the kinds the switch allows. The data
   build owns the rest of the file; this step adds and refreshes only /e/. */
function writeSitemap() {
	if (!existsSync(SITEMAP)) return 0;
	const today = world.generated;
	const entries = KINDS.filter((kind) => INDEXING[kind]).flatMap((kind) => {
		const rows = kind === 'person' ? data.people : kind === 'institution' ? data.institutions : data.events;
		return rows.map((r) => `  <url><loc>${SITE_URL}/${PAGES_DIR}/${r.id}</loc><lastmod>${today}</lastmod></url>`);
	});
	const original = readFileSync(SITEMAP, 'utf8');
	const withoutRecords = original.replace(/\n?\s*<url><loc>[^<]*\/e\/[^<]*<\/loc>.*?<\/url>/g, '');
	if (!withoutRecords.includes('</urlset>')) fail('build/sitemap.xml has no closing </urlset>');
	writeFileSync(SITEMAP, withoutRecords.replace('</urlset>', `${entries.join('\n')}\n</urlset>`), 'utf8');
	return entries.length;
}

const sitemapEntries = writeSitemap();

const PLURALS: Record<RecordKind, [string, string]> = {
	person: ['person', 'people'],
	institution: ['institution', 'institutions'],
	event: ['event', 'events']
};
const counts = KINDS.map((kind) => {
	const [one, many] = PLURALS[kind];
	return `${written[kind]} ${written[kind] === 1 ? one : many}`;
}).join(', ');
const total = KINDS.reduce((n, kind) => n + written[kind], 0);
const catalogued = KINDS.filter((kind) => INDEXING[kind]).length;
console.log(
	`\n  records     ${counts} · ${total} pages and ${total} twins at /${PAGES_DIR}/ · ${sitemapEntries} in the sitemap · ${catalogued} of ${KINDS.length} kinds indexable`
);
