/**
 * Assertions that the news feed is separate from the knowledge graph.
 *
 * The feed exists because readers want to know what is being reported now. The
 * project's whole value is that everything in it carries an epistemic basis, a
 * source and a confidence grade. Those two things are only compatible if the feed
 * is structurally incapable of being mistaken for project data — not merely
 * labelled differently in the interface, where a label can be lost in a redesign,
 * a screenshot or an export.
 *
 * So this file asserts the separation rather than trusting it: that no feed item
 * carries a field implying it was assessed, that the archive is well formed, that
 * a headline id can never be confused with an entity id, and that the graph build
 * neither reads nor contains any of it.
 *
 * Run after `npm run data` — the collision check needs the built graph.
 * Usage: `npx tsx scripts/test-feed.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

function bail(message: string): never {
	console.error(`  FAIL  ${message}`);
	console.error('\n  0/1 checks passed, 1 FAILED\n');
	process.exit(1);
}

// ── Load ──────────────────────────────────────────────────────────────────────

const FEED_FILE = join(ROOT, 'feed', 'feed.json');
if (!existsSync(FEED_FILE)) bail('feed/feed.json is missing — run `npx tsx scripts/fetch-feed.ts`');

let feed: { notice?: unknown; cap?: unknown; items?: unknown };
try {
	feed = JSON.parse(readFileSync(FEED_FILE, 'utf8'));
} catch (err) {
	bail(`feed/feed.json is not valid JSON — ${err instanceof Error ? err.message : String(err)}`);
}

const DATASET_FILE = join(ROOT, 'src', 'generated', 'dataset.json');
if (!existsSync(DATASET_FILE)) bail('src/generated/dataset.json is missing — run `npm run data` first');
const dsRaw = readFileSync(DATASET_FILE, 'utf8');
const ds = JSON.parse(dsRaw) as Record<string, { id?: string }[] | Record<string, unknown>>;

if (!Array.isArray(feed.items)) bail('feed/feed.json has no `items` array');
const items = feed.items as Record<string, unknown>[];

// ── The separation the owner asked for ────────────────────────────────────────
//
// These four fields are the project's epistemic vocabulary. `basis` says how a
// claim is known, `confidence` how well, `sources` on whose authority, `review`
// whether a human checked it. Attaching any of them to an unread headline would
// not be sloppy labelling — it would assert an assessment that never happened,
// inside the data model, where downstream code would believe it.

const GRADING_FIELDS = ['basis', 'confidence', 'sources', 'review'] as const;
{
	const offenders = items
		.map((item, i) => {
			const found = GRADING_FIELDS.filter((f) => f in item);
			return found.length ? `#${i} carries ${found.join(', ')}` : null;
		})
		.filter(Boolean);
	ok(
		'no feed item carries basis, confidence, sources or review',
		offenders.length === 0,
		offenders.length ? offenders.slice(0, 5).join('; ') : `${items.length} items clean`
	);
}

// An allow-list rather than a deny-list: a deny-list only forbids the four names
// somebody already thought of, and would happily admit `verification`, `grade` or
// `excerpt` tomorrow.
const ALLOWED_FIELDS = ['id', 'outlet', 'outletId', 'title', 'link', 'published', 'lang'];
{
	const extras = new Set<string>();
	const missing = new Set<string>();
	for (const item of items) {
		for (const key of Object.keys(item)) if (!ALLOWED_FIELDS.includes(key)) extras.add(key);
		for (const key of ALLOWED_FIELDS) {
			if (typeof item[key] !== 'string' || !(item[key] as string).length) missing.add(key);
		}
	}
	ok(
		'feed items carry exactly the seven permitted fields',
		extras.size === 0 && missing.size === 0,
		extras.size || missing.size
			? `unexpected: ${[...extras].join(', ') || 'none'}; missing/empty: ${[...missing].join(', ') || 'none'}`
			: ALLOWED_FIELDS.join(', ')
	);
}

// No article body, no `content:encoded`, no excerpt — the outlets' copyright, and
// a teaser lets a reader form an impression without visiting the source.
{
	const MAX_TITLE = 400;
	const bodyish = items.filter((item) => {
		const title = String(item.title ?? '');
		return title.length > MAX_TITLE || /<[a-z!/]/i.test(title);
	});
	ok(
		'no feed item stores body text or markup',
		bodyish.length === 0,
		bodyish.length
			? bodyish.slice(0, 3).map((i) => String(i.title).slice(0, 60)).join(' | ')
			: `longest title ${Math.max(0, ...items.map((i) => String(i.title ?? '').length))} chars (limit ${MAX_TITLE})`
	);
}

// ── The archive is well formed ────────────────────────────────────────────────

ok(
	'the archive states in the file that it is not project data',
	typeof feed.notice === 'string' && /NOT DeepTunisia data/i.test(feed.notice),
	typeof feed.notice === 'string' ? `${feed.notice.length} chars` : 'missing'
);

ok(
	'the archive is bounded',
	typeof feed.cap === 'number' && feed.cap > 0 && items.length <= feed.cap,
	`${items.length} items, cap ${String(feed.cap)}`
);

{
	const bad = items.filter((item) => {
		const raw = String(item.published ?? '');
		const ms = Date.parse(raw);
		// Round-tripping catches a timestamp that parses but was never normalised —
		// a local-time or offset-bearing string that would sort wrongly against the rest.
		return Number.isNaN(ms) || new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') !== raw;
	});
	ok(
		'every timestamp is a parseable ISO 8601 UTC instant',
		bad.length === 0,
		bad.length ? bad.slice(0, 3).map((i) => String(i.published)).join(', ') : `${items.length} timestamps`
	);
}

{
	const bad = items.filter((item) => {
		try {
			return new URL(String(item.link)).protocol !== 'https:';
		} catch {
			return true;
		}
	});
	ok(
		'every link is an absolute https URL',
		bad.length === 0,
		bad.length ? bad.slice(0, 3).map((i) => String(i.link)).join(', ') : `${items.length} links`
	);
}

{
	const ids = new Set(items.map((i) => String(i.id)));
	const links = new Set(items.map((i) => String(i.link)));
	ok(
		'no duplicate ids or links survive the merge',
		ids.size === items.length && links.size === items.length,
		`${ids.size} ids / ${links.size} links / ${items.length} items`
	);
}

{
	// Deterministic ordering is what lets CI commit the file without producing a
	// diff that reshuffles unchanged records.
	let sorted = true;
	for (let i = 1; i < items.length; i++) {
		const a = String(items[i - 1].published);
		const b = String(items[i].published);
		if (a < b || (a === b && String(items[i - 1].id) > String(items[i].id))) sorted = false;
	}
	ok('the archive is sorted newest first, deterministically', sorted);
}

{
	const outletIds = new Set(items.map((i) => String(i.outletId)));
	const institutions = new Set(
		(ds.institutions as { id?: string }[]).map((r) => String(r.id))
	);
	// Two kinds of outlet live in the archive. Tunisian media outlets are actors
	// in the story the atlas tells, so they must exist as institution records —
	// that is what this check originally guarded. Wire services (bbc, france24,
	// al-jazeera, added 2026-08-25) are only pointers to other people's reporting:
	// they get NO institution record, because a regional wire covering Tunisia is
	// reporting about the country, not power inside it. The exemption is a
	// hand-curated list on purpose — adding to it means deciding that a source
	// belongs in the daily sweep despite not being a Tunisian power actor.
	const feedOnlyWires = new Set(['bbc', 'france24', 'al-jazeera']);
	const unknown = [...outletIds].filter(
		(id) => !institutions.has(id) && !feedOnlyWires.has(id)
	);
	ok(
		'every outlet resolves to an institution in the graph',
		unknown.length === 0,
		unknown.length ? unknown.join(', ') : [...outletIds].sort().join(', ')
	);
	const polluted = [...feedOnlyWires].filter((id) => institutions.has(id));
	ok(
		'feed-only wires stay out of the institution graph',
		polluted.length === 0,
		polluted.length ? polluted.join(', ') : 'no wire has crept into data/'
	);
}

// ── The graph is untouched ────────────────────────────────────────────────────

const GRAPH_COLLECTIONS = [
	'sources',
	'eras',
	'institutions',
	'roles',
	'people',
	'positions',
	'relationships',
	'events',
	'questions',
	'hypotheses',
	'agreements',
	'worldClaims',
	// v0.0.2 record kinds (spec §4) — declared-but-empty; the allowlist must stay
	// in lockstep with what build-data actually emits, or a feed item could hide.
	'companies',
	'contracts',
	'licences',
	'declarations',
	'education',
	// R8 — the geographic layer (spec §8). Region ids are graph ids the same way
	// institution ids are; places too, once authored.
	'regions',
	'places'
];

const graphIds = new Set<string>();
for (const key of GRAPH_COLLECTIONS) {
	for (const record of (ds[key] ?? []) as { id?: string }[]) {
		if (record?.id) graphIds.add(String(record.id));
	}
}

{
	const collisions = items.filter((i) => graphIds.has(String(i.id)));
	ok(
		'no feed item id collides with an entity id',
		collisions.length === 0,
		`${items.length} feed ids against ${graphIds.size} entity ids`
	);
}

{
	// The reason a collision is impossible rather than merely absent: entity ids are
	// slugs and feed ids are namespaced with a colon. If either half of that ever
	// stops being true, the guarantee downgrades to luck, so assert both halves.
	const unnamespaced = items.filter((i) => !String(i.id).startsWith('feed:'));
	const colonised = [...graphIds].filter((id) => id.includes(':'));
	ok(
		'feed ids are namespaced and entity ids are not',
		unnamespaced.length === 0 && colonised.length === 0,
		unnamespaced.length || colonised.length
			? `${unnamespaced.length} un-namespaced feed ids; ${colonised.length} entity ids with a colon`
			: 'feed:* vs plain slugs'
	);
}

{
	const unexpected = Object.keys(ds).filter(
		(key) => key !== 'meta' && !GRAPH_COLLECTIONS.includes(key)
	);
	ok(
		'the dataset has no collection beyond what is built from',
		unexpected.length === 0,
		unexpected.length ? unexpected.join(', ') : GRAPH_COLLECTIONS.length + ' collections'
	);
}

{
	// Deliberately checks ids, not URLs. A source in `data/sources.yaml` may quite
	// properly cite a Nawaat or Inkyfada article — that is a human reading the feed
	// and doing the work, which is the intended path from headline to record. What
	// must never appear is a feed *record*: an id, an outletId key, a whole item.
	const leaked = items.filter((i) => dsRaw.includes(String(i.id)));
	const feedShaped = /"outletId"|"feed:[a-z-]+:/.test(dsRaw);
	ok(
		'the built graph contains no feed record',
		leaked.length === 0 && !feedShaped,
		leaked.length ? `${leaked.length} ids found in dataset.json` : `${(dsRaw.length / 1024).toFixed(0)} KB scanned`
	);
}

{
	const counts = ((ds.meta as Record<string, unknown>)?.counts ?? {}) as Record<string, number>;
	const stats = existsSync(join(ROOT, 'src', 'generated', 'stats.json'))
		? readFileSync(join(ROOT, 'src', 'generated', 'stats.json'), 'utf8')
		: '{}';
	const tainted = Object.keys(counts).filter((k) => /feed|news|headline/i.test(k));
	ok(
		'no published statistic counts feed items',
		tainted.length === 0 && !/feed|headline/i.test(stats),
		tainted.length ? tainted.join(', ') : `${Object.keys(counts).length} counts, ${JSON.parse(stats) ? Object.keys(JSON.parse(stats)).length : 0} published stats`
	);
}

// ── The pipeline itself keeps them apart ──────────────────────────────────────
//
// Source-level checks. The three above prove the current output is clean; these
// prove the code cannot produce a dirty one next week, which is the part that
// survives a contributor who has not read this file.

/** Strips block comments and whole-line `//` comments. Prose about a rule must not satisfy it. */
function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split(/\r?\n/)
		.filter((line) => !/^\s*(\/\/|\*)/.test(line))
		.join('\n');
}

const fetcher = stripComments(readFileSync(join(HERE, 'fetch-feed.ts'), 'utf8'));

{
	const writes = [...fetcher.matchAll(/writeFileSync\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
	ok(
		'the fetcher writes to exactly one path, the feed archive',
		writes.length === 1 && writes[0] === 'FEED_FILE',
		writes.length ? writes.join(', ') : 'no writeFileSync found'
	);
}

{
	const escapes = /rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|checkServerIdentity/.test(fetcher);
	ok(
		'the fetcher never disables TLS certificate verification',
		!escapes,
		escapes ? 'certificate verification is being bypassed' : 'no bypass present'
	);
}

{
	// The feed must be invisible to the graph build. If `build-data.ts` ever learns
	// the word, the two halves have started to merge.
	const offenders: string[] = [];
	for (const file of ['build-data.ts', 'schema.ts', 'test-data.ts']) {
		const src = readFileSync(join(HERE, file), 'utf8');
		if (/feed\/feed\.json|fetch-feed|feed\.json/.test(src)) offenders.push(file);
	}
	ok(
		'the graph build never reads the feed archive',
		offenders.length === 0,
		offenders.length ? offenders.join(', ') : 'build-data.ts, schema.ts, test-data.ts'
	);
}

{
	// And the graph's own sources must be invisible to the fetcher: it may not read
	// data/ at all, in either direction.
	const touchesData = /['"`]data['"`]|data\/[a-z]+\.yaml|src[/\\]generated/.test(fetcher);
	ok(
		'the fetcher never reads or writes data/ or src/generated/',
		!touchesData,
		touchesData ? 'fetcher references project data' : 'feed/ only'
	);
}

// ── Summary ───────────────────────────────────────────────────────────────────

{
	const byOutlet = new Map<string, number>();
	const byLang = new Map<string, number>();
	for (const item of items) {
		byOutlet.set(String(item.outlet), (byOutlet.get(String(item.outlet)) ?? 0) + 1);
		byLang.set(String(item.lang), (byLang.get(String(item.lang)) ?? 0) + 1);
	}
	const fmt = (m: Map<string, number>) =>
		[...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
	console.log(`\n  archive: ${items.length} items — ${fmt(byOutlet)}`);
	console.log(`  languages: ${fmt(byLang)}`);
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
