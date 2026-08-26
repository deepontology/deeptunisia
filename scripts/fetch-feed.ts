/**
 * Fetches Tunisian news headlines into `feed/feed.json`.
 *
 * ── What this is not ──────────────────────────────────────────────────────────
 *
 * This is NOT project data and it never becomes project data. Nothing here is
 * written into `data/`, validated by `scripts/schema.ts`, read by
 * `scripts/build-data.ts`, or counted in any published statistic. A feed item is
 * a pointer to something somebody else published; the project makes no claim that
 * it is true, false, significant or corroborated.
 *
 * That is why a feed item carries no `basis`, no `confidence`, no `sources` and no
 * `review`. Those four fields mean something specific here — that a human graded a
 * claim against evidence — and attaching them to an unread headline would be a lie
 * told in the data model, which is a worse lie than one told in prose. The archive
 * is deliberately kept in `feed/`, a sibling of `data/` rather than a child of it,
 * so that the separation survives someone skimming the repository.
 *
 * `scripts/test-feed.ts` enforces all of the above.
 *
 * ── What is stored ────────────────────────────────────────────────────────────
 *
 * A stable id, the outlet's name and its institution id in the graph, the headline,
 * the link, the publication timestamp in ISO 8601 UTC, and the language.
 *
 * Nothing else. In particular **no article body, no `content:encoded`, and no
 * description or excerpt** — those are the outlets' copyright, and storing even a
 * teaser would let a reader form an impression without visiting the source, which
 * is precisely the behaviour a feed of other people's reporting should not
 * encourage. The parser below never reads those elements.
 *
 * Usage: `npx tsx scripts/fetch-feed.ts`
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FEED_DIR = join(ROOT, 'feed');
const FEED_FILE = join(FEED_DIR, 'feed.json');

/**
 * Identifies the project and points at it, so an administrator seeing this in a
 * log can find out who is asking and complain to a human if they want to.
 */
const USER_AGENT =
	'DeepTunisiaFeedBot/1.0 (+https://deeptunisia.org; news headline archive; contact via https://github.com/deeptunisia)';

/** The product token robots.txt groups are matched against. */
const UA_PRODUCT_TOKEN = 'DeepTunisiaFeedBot';

/** Long enough for a slow North African host on a bad day, short enough for CI. */
const FETCH_TIMEOUT_MS = 13_000;

/**
 * Hard ceiling on the archive. Oldest items age out.
 *
 * Measured at ~417 bytes per item as written, so 1200 items is a file of roughly
 * 490 KB, against a knowledge graph of about 905 KB. That ratio is the reason for
 * this number rather than a larger one: the graph is the project, and an archive
 * of unverified headlines growing to outweigh it would misrepresent what this
 * repository is, to anyone reading the directory listing rather than the prose.
 *
 * At the four feeds' observed rate — around 50 headlines a day between them — the
 * cap works out to roughly three and a half weeks of rolling history. Long enough
 * for the feed to have a memory; bounded, so a file committed by a scheduled job
 * six times a day cannot grow without limit.
 */
const ARCHIVE_CAP = 1200;

/** Fixed, human-readable notice carried inside the data file itself. */
const NOTICE =
	'Third-party news headlines. NOT DeepTunisia data: not verified, not graded, not sourced, ' +
	'and never merged into the knowledge graph. Feed items carry no epistemic basis and no ' +
	'confidence, because none has been assessed. Written by scripts/fetch-feed.ts.';

interface Outlet {
	/** Institution id in `src/generated/dataset.json`, so the UI can attribute properly. */
	id: string;
	name: string;
	feed: string;
	/**
	 * Language the outlet declares for this feed, used as the fallback when an
	 * item gives nothing better. See `detectLang`.
	 */
	declared: string;
	/**
	 * Regional feeds only: when present, a headline enters the archive only if
	 * it matches. Tunisia-specific feeds leave this unset and take everything.
	 */
	match?: RegExp;
}

/**
 * Two kinds of outlet live in this list.
 *
 * The four Tunisian outlets are institutions in the graph — that is why they
 * were chosen; their ids are `institutions.yaml` ids and
 * `scripts/test-feed.ts` asserts every outletId resolves to an institution.
 *
 * The three wires at the end (bbc, france24, al-jazeera, added 2026-08-25) are
 * deliberately NOT graph entities: a regional wire covering Tunisia reports
 * about the country, it does not exercise power inside it. They are exempted
 * by name in test-feed.ts, publish regional feeds rather than Tunisia feeds,
 * so each carries a `match` regex applied to the headline — an item enters the
 * archive only when it names Tunisia. Yield is low by design, a few headlines
 * a week between them, but it closes the blind spot of a purely local menu:
 * the August 2026 protest wave and the Zarzis sinking were carried
 * internationally days before (or without) local coverage reaching us.
 *
 * Considered and rejected for this list: Google News RSS queries
 * (news.google.com/rss/search?q=tunisia). High yield, wrong shape — items
 * arrive as aggregator redirects whose publisher lives inside the title text,
 * so attribution would be reconstructed from strings instead of declared, and
 * the link stored would be Google's, not the outlet's. It remains a research
 * instrument, used manually in sweeps, never an archive source.
 */
const OUTLETS: Outlet[] = [
	{ id: 'nawaat', name: 'Nawaat', feed: 'https://nawaat.org/feed/', declared: 'en' },
	{
		id: 'african-manager',
		name: 'African Manager',
		feed: 'https://africanmanager.com/feed/',
		declared: 'fr'
	},
	{ id: 'kapitalis', name: 'Kapitalis', feed: 'https://kapitalis.com/tunisie/feed/', declared: 'fr' },
	{ id: 'inkyfada', name: 'Inkyfada', feed: 'https://www.inkyfada.com/fr/feed/', declared: 'fr' },
	{
		id: 'bbc',
		name: 'BBC News',
		feed: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
		declared: 'en',
		match: /tunis/i
	},
	{
		id: 'france24',
		name: 'France 24',
		feed: 'https://www.france24.com/en/africa/rss',
		declared: 'en',
		match: /tunis/i
	},
	{
		id: 'al-jazeera',
		name: 'Al Jazeera',
		feed: 'https://www.aljazeera.com/xml/rss/all.xml',
		declared: 'en',
		match: /tunis/i
	}
];

/*
 * ── Deliberately excluded: businessnews.com.tn and tap.info.tn ────────────────
 *
 * Both are in the graph (`business-news`; TAP is the state news agency) and both
 * would be worth having — TAP especially, since a state wire service is exactly
 * the kind of source this project wants readers to be able to compare against
 * independent outlets. Neither is fetched, because both fail TLS certificate
 * verification:
 *
 *     https://www.businessnews.com.tn/feed  → UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *     https://www.tap.info.tn/fr/rss        → UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *
 * That error means the servers do not send a complete certificate chain, so the
 * intermediate cannot be verified against a trusted root. It is a server
 * misconfiguration, not a Node quirk.
 *
 * The fix that would "work" — `rejectUnauthorized: false`, or setting
 * NODE_TLS_REJECT_UNAUTHORIZED=0 — is not acceptable and must not be added. It
 * does not just skip a warning: it turns off authentication of the peer entirely,
 * so an automated job running in CI would accept content from anyone able to
 * intercept the connection, and publish it under an outlet's name. Ingesting
 * unverified content is the whole problem this project exists to work against;
 * doing it over an unauthenticated channel would be worse.
 *
 * Proper fixes, in order of preference:
 *   1. The outlets serve the full chain (they, or someone who can reach them,
 *      fix the server). Test with `openssl s_client -connect host:443 -showcerts`.
 *   2. Pin the specific intermediate certificate and pass it as an explicit CA,
 *      so verification still happens, against a chain we chose on purpose.
 *   3. Fetch through a trusted proxy that terminates TLS correctly.
 *
 * Until one of those exists, the feed is short two outlets and says so.
 */

/** One stored headline. No basis, no confidence, no sources, no review — by design. */
interface FeedItem {
	id: string;
	outlet: string;
	outletId: string;
	title: string;
	link: string;
	/** ISO 8601 UTC, seconds precision. */
	published: string;
	/** BCP 47 primary subtag, or `und` when it could not be determined. */
	lang: string;
}

interface FeedFile {
	notice: string;
	cap: number;
	items: FeedItem[];
}

interface FeedResult {
	outlet: Outlet;
	/** Items parsed out of the response. */
	fetched: number;
	/** Items that were not already in the archive. */
	added: number;
	/** Items dropped for a missing link, an unparseable date, or a non-https link. */
	skipped: number;
	status: 'ok' | 'failed' | 'robots';
	note: string;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	trimValues: true,
	parseTagValue: false,
	processEntities: true,
	// Numeric character references (&#8217;) are ubiquitous in WordPress titles and
	// are only decoded when this is on. Without it every apostrophe ships as mojibake.
	htmlEntities: true
});

const asArray = <T>(v: T | T[] | undefined | null): T[] =>
	v == null ? [] : Array.isArray(v) ? v : [v];

/** fast-xml-parser yields either a string or `{ '#text': …, '@_attr': … }`. */
function text(node: unknown): string {
	if (typeof node === 'string') return node;
	if (typeof node === 'number') return String(node);
	if (node && typeof node === 'object' && '#text' in node) {
		return String((node as Record<string, unknown>)['#text'] ?? '');
	}
	return '';
}

function attr(node: unknown, name: string): string {
	if (node && typeof node === 'object') {
		const v = (node as Record<string, unknown>)[`@_${name}`];
		if (v != null) return String(v);
	}
	return '';
}

/** Headlines occasionally arrive with stray markup. Strip it; never truncate. */
function cleanTitle(raw: string): string {
	return raw
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Canonical form of a link, used as the dedupe key and as the seed for the item
 * id. Only the key is canonicalised — the link stored in the archive is the one
 * the outlet published, unmodified.
 */
function canonicalLink(raw: string): string {
	const u = new URL(raw);
	u.protocol = 'https:';
	u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
	u.hash = '';
	for (const key of [...u.searchParams.keys()]) {
		if (/^(utm_|fbclid$|gclid$|mc_|ref$|source$)/i.test(key)) u.searchParams.delete(key);
	}
	u.pathname = u.pathname.replace(/\/+$/, '') || '/';
	return u.toString();
}

/**
 * Secondary dedupe key. Catches the case where an outlet republishes the same
 * story under a new URL — common when a live story is moved out of a "breaking"
 * path — which the link key alone would let through twice.
 */
function titleKey(outletId: string, title: string): string {
	const flat = title
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
	return `${outletId} ${flat}`;
}

/**
 * Item ids are namespaced with `feed:` and contain colons, which no entity id in
 * the graph does — graph ids are plain slugs. That makes a collision between a
 * headline and a person, institution or event structurally impossible rather than
 * merely unlikely, which matters because the two must never be confusable.
 *
 * The hash is taken over the canonical link, so an id is stable across runs and
 * across a cosmetic change to the URL.
 */
function itemId(outletId: string, canonical: string): string {
	const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
	return `feed:${outletId}:${hash}`;
}

/**
 * Best-effort language of a headline.
 *
 * This normalises metadata the feeds themselves get wrong — Nawaat declares
 * `en-US` for a channel that publishes Arabic, French and English side by side —
 * so taking the declared value at face value would file Arabic headlines as
 * English. It is not, and must not be read as, an assessment of anything: it is a
 * display hint for a list of links.
 *
 * In order of reliability: Arabic script is unambiguous; a locale segment in the
 * publisher's own URL is the publisher's own statement; French orthography is a
 * strong signal against English; otherwise the channel's declared language, and
 * `und` if there isn't one.
 */
const FRENCH_STOPWORDS = new Set([
	'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'et', 'en', 'dans',
	'sur', 'pour', 'par', 'avec', 'sans', 'sous', 'entre', 'contre', 'vers', 'chez',
	'est', 'sont', 'ont', 'qui', 'que', 'quoi', 'dont', 'ses', 'son', 'sa', 'leur',
	'leurs', 'cette', 'ces', 'plus', 'moins', 'ans', 'apres', 'avant', 'ne', 'pas'
]);

function detectLang(title: string, link: string, declared: string): string {
	if (/\p{Script=Arabic}/u.test(title)) return 'ar';

	const locale = /\/(ar|fr|en)(\/|$)/.exec(new URL(link).pathname);
	if (locale) return locale[1];

	const words = title
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.filter(Boolean);
	const hits = new Set(words.filter((w) => FRENCH_STOPWORDS.has(w)));
	const frenchDiacritic = /[éèêëàâäùûüçîïôöœ]/i.test(title);
	if (hits.size >= 2 || (frenchDiacritic && hits.size >= 1)) return 'fr';

	const primary = declared.split(/[-_]/)[0].toLowerCase();
	return /^[a-z]{2,3}$/.test(primary) ? primary : 'und';
}

// ── robots.txt ───────────────────────────────────────────────────────────────

interface RobotsRule {
	allow: boolean;
	pattern: string;
}

/**
 * Minimal RFC 9309 parser: group by user-agent, prefer the group naming us over
 * the wildcard group, then longest matching rule wins with allow breaking ties.
 * Supports `*` and `$` in paths, which the WordPress-generated robots.txt files
 * these outlets serve do use.
 */
function robotsRulesFor(body: string, product: string): RobotsRule[] {
	const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
	let current: { agents: string[]; rules: RobotsRule[] } | null = null;
	let expectingAgents = false;

	for (const line of body.split(/\r?\n/)) {
		const clean = line.split('#')[0].trim();
		if (!clean) continue;
		const idx = clean.indexOf(':');
		if (idx < 0) continue;
		const field = clean.slice(0, idx).trim().toLowerCase();
		const value = clean.slice(idx + 1).trim();

		if (field === 'user-agent') {
			if (!current || !expectingAgents) {
				current = { agents: [], rules: [] };
				groups.push(current);
				expectingAgents = true;
			}
			current.agents.push(value.toLowerCase());
		} else if (field === 'allow' || field === 'disallow') {
			if (!current) continue;
			expectingAgents = false;
			current.rules.push({ allow: field === 'allow', pattern: value });
		}
	}

	const token = product.toLowerCase();
	const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
	const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
	return chosen.flatMap((g) => g.rules);
}

function robotsAllows(rules: RobotsRule[], path: string): boolean {
	let best: { len: number; allow: boolean } | null = null;
	for (const rule of rules) {
		// An empty Disallow means "nothing is disallowed" and matches nothing.
		if (rule.pattern === '') continue;
		let pattern = rule.pattern;
		let anchorEnd = false;
		if (pattern.endsWith('$')) {
			pattern = pattern.slice(0, -1);
			anchorEnd = true;
		}
		const body = pattern.split('*').map(escapeRe).join('.*');
		if (!new RegExp(`^${body}${anchorEnd ? '$' : ''}`).test(path)) continue;
		const len = rule.pattern.length;
		if (!best || len > best.len || (len === best.len && rule.allow)) {
			best = { len, allow: rule.allow };
		}
	}
	return best ? best.allow : true;
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
	const res = await fetch(url, {
		redirect: 'follow',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml, text/xml, */*' }
	});
	// Read the body even on an error status; some hosts explain themselves there.
	const body = res.status === 204 ? '' : await res.text();
	return { status: res.status, body };
}

/**
 * RFC 9309: a 4xx means no restrictions; a 5xx or an unreachable robots.txt means
 * the crawler should assume a complete disallow. We follow that rather than the
 * convenient reading, and skip the feed for this run.
 */
async function checkRobots(feedUrl: string): Promise<{ allowed: boolean; note: string }> {
	const target = new URL(feedUrl);
	const robotsUrl = `${target.origin}/robots.txt`;
	try {
		const { status, body } = await fetchText(robotsUrl);
		if (status >= 400 && status < 500) return { allowed: true, note: 'robots.txt absent' };
		if (status >= 500) return { allowed: false, note: `robots.txt ${status}` };
		const rules = robotsRulesFor(body, UA_PRODUCT_TOKEN);
		const allowed = robotsAllows(rules, target.pathname + target.search);
		return { allowed, note: allowed ? 'robots.txt ok' : 'robots.txt disallows this path' };
	} catch (err) {
		return { allowed: false, note: `robots.txt unreachable (${errText(err)})` };
	}
}

function errText(err: unknown): string {
	if (err instanceof Error) {
		const cause = (err as { cause?: { code?: string; message?: string } }).cause;
		const detail = cause?.code ?? cause?.message;
		return detail ? `${err.message}: ${detail}` : err.message;
	}
	return String(err);
}

// ── Parsing ──────────────────────────────────────────────────────────────────

interface RawEntry {
	title: string;
	link: string;
	date: string;
}

/**
 * Pulls title / link / date out of RSS 2.0 or Atom. Deliberately reads no other
 * element: `description` and `content:encoded` are present in three of these four
 * feeds and are never touched.
 */
function extractEntries(xml: string): RawEntry[] {
	const doc = parser.parse(xml) as Record<string, unknown>;

	const rss = doc.rss as { channel?: unknown } | undefined;
	if (rss?.channel) {
		const channel = rss.channel as Record<string, unknown>;
		return asArray(channel.item as unknown).map((raw) => {
			const item = raw as Record<string, unknown>;
			const guid = item.guid;
			const guidUrl =
				attr(guid, 'isPermaLink') === 'false' ? '' : text(guid);
			return {
				title: cleanTitle(text(item.title)),
				link: text(item.link) || guidUrl,
				date: text(item.pubDate) || text(item['dc:date'])
			};
		});
	}

	const atom = doc.feed as Record<string, unknown> | undefined;
	if (atom?.entry) {
		return asArray(atom.entry as unknown).map((raw) => {
			const entry = raw as Record<string, unknown>;
			const links = asArray(entry.link as unknown);
			const alternate =
				links.find((l) => attr(l, 'rel') === 'alternate') ?? links.find((l) => attr(l, 'href'));
			return {
				title: cleanTitle(text(entry.title)),
				link: attr(alternate, 'href') || text(entry.link) || text(entry.id),
				date: text(entry.published) || text(entry.updated)
			};
		});
	}

	return [];
}

/** ISO 8601 UTC at seconds precision, or null when the feed's date is unusable. */
function toIso(raw: string): string | null {
	const ms = Date.parse(raw);
	if (Number.isNaN(ms)) return null;
	return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ── Merge ────────────────────────────────────────────────────────────────────

function readArchive(): FeedItem[] {
	if (!existsSync(FEED_FILE)) return [];
	try {
		const parsed = JSON.parse(readFileSync(FEED_FILE, 'utf8')) as Partial<FeedFile>;
		return Array.isArray(parsed.items) ? parsed.items : [];
	} catch (err) {
		// A corrupt archive is a reason to stop, not to silently start a new one:
		// overwriting it would destroy history that cannot be re-fetched.
		console.error(`  !  ${FEED_FILE} could not be read: ${errText(err)}`);
		process.exit(1);
	}
}

/** Fixed key order, so a re-run that changes nothing produces a byte-identical file. */
function orderItem(item: FeedItem): FeedItem {
	return {
		id: item.id,
		outlet: item.outlet,
		outletId: item.outletId,
		title: item.title,
		link: item.link,
		published: item.published,
		lang: item.lang
	};
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function fetchOutlet(outlet: Outlet, seen: { links: Set<string>; titles: Set<string> }) {
	const result: FeedResult = {
		outlet,
		fetched: 0,
		added: 0,
		skipped: 0,
		status: 'ok',
		note: ''
	};
	const fresh: FeedItem[] = [];

	const robots = await checkRobots(outlet.feed);
	if (!robots.allowed) {
		result.status = 'robots';
		result.note = robots.note;
		return { result, fresh };
	}

	// One request per feed per run. No retries, no pagination, no crawling.
	const { status, body } = await fetchText(outlet.feed);
	if (status !== 200) throw new Error(`HTTP ${status}`);

	const entries = extractEntries(body);
	if (entries.length === 0) throw new Error('no items found — feed malformed or shape unrecognised');
	result.fetched = entries.length;

	for (const entry of entries) {
		if (!entry.title || !entry.link) {
			result.skipped++;
			continue;
		}
		// Regional feeds name whole continents; the outlet-level match keeps only
		// items that name Tunisia. Skipped here means never a candidate, not
		// rejected after storage.
		if (outlet.match && !outlet.match.test(entry.title)) {
			result.skipped++;
			continue;
		}
		let canonical: string;
		try {
			const url = new URL(entry.link);
			// https only: the archive is committed to a public repo and read by a
			// browser, and an http link is one a reader cannot trust the origin of.
			if (url.protocol !== 'https:') {
				result.skipped++;
				continue;
			}
			canonical = canonicalLink(entry.link);
		} catch {
			result.skipped++;
			continue;
		}

		const published = toIso(entry.date);
		if (!published) {
			result.skipped++;
			continue;
		}

		const tKey = titleKey(outlet.id, entry.title);
		if (seen.links.has(canonical) || seen.titles.has(tKey)) continue;
		seen.links.add(canonical);
		seen.titles.add(tKey);

		fresh.push(
			orderItem({
				id: itemId(outlet.id, canonical),
				outlet: outlet.name,
				outletId: outlet.id,
				title: entry.title,
				link: entry.link,
				published,
				lang: detectLang(entry.title, entry.link, outlet.declared)
			})
		);
	}

	result.added = fresh.length;
	result.note = robots.note;
	return { result, fresh };
}

async function main() {
	const existing = readArchive();

	// Seed the dedupe sets from the archive first, so existing records win. The
	// archive is a record of what was published and when we saw it; rewriting an
	// entry because the outlet later retitled the piece would make it unfaithful.
	const seen = { links: new Set<string>(), titles: new Set<string>() };
	for (const item of existing) {
		try {
			seen.links.add(canonicalLink(item.link));
		} catch {
			seen.links.add(item.link);
		}
		seen.titles.add(titleKey(item.outletId, item.title));
	}

	const settled = await Promise.all(
		OUTLETS.map(async (outlet) => {
			try {
				return await fetchOutlet(outlet, seen);
			} catch (err) {
				return {
					result: {
						outlet,
						fetched: 0,
						added: 0,
						skipped: 0,
						status: 'failed' as const,
						note: errText(err)
					},
					fresh: [] as FeedItem[]
				};
			}
		})
	);

	const merged = [...existing.map(orderItem), ...settled.flatMap((s) => s.fresh)];
	merged.sort((a, b) =>
		a.published === b.published
			? a.id.localeCompare(b.id)
			: a.published < b.published
				? 1
				: -1
	);
	const capped = merged.slice(0, ARCHIVE_CAP);
	const dropped = merged.length - capped.length;

	const payload: FeedFile = { notice: NOTICE, cap: ARCHIVE_CAP, items: capped };
	mkdirSync(FEED_DIR, { recursive: true });
	writeFileSync(FEED_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

	// ── Summary ───────────────────────────────────────────────────────────────
	const pad = Math.max(...OUTLETS.map((o) => o.name.length));
	console.log('\n  DeepTunisia — news feed (not project data; not verified; not in the graph)\n');
	for (const { result } of settled) {
		const label = result.outlet.name.padEnd(pad);
		if (result.status === 'ok') {
			const skipped = result.skipped ? `, ${result.skipped} skipped` : '';
			console.log(
				`  ok      ${label}  fetched ${String(result.fetched).padStart(3)}   new ${String(result.added).padStart(3)}${skipped}`
			);
		} else if (result.status === 'robots') {
			console.log(`  skip    ${label}  ${result.note}`);
		} else {
			console.error(`  FAIL    ${label}  ${result.note}`);
		}
	}

	const okCount = settled.filter((s) => s.result.status === 'ok').length;
	const added = settled.reduce((n, s) => n + s.result.added, 0);
	const bytes = JSON.stringify(payload).length;
	console.log(
		`\n  ${capped.length} items in archive (cap ${ARCHIVE_CAP}${dropped ? `, ${dropped} aged out` : ''})   +${added} new   ${(bytes / 1024).toFixed(0)} KB`
	);
	const langs = new Map<string, number>();
	for (const item of capped) langs.set(item.lang, (langs.get(item.lang) ?? 0) + 1);
	console.log(
		`  languages: ${[...langs].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join('   ')}\n`
	);

	// Only a total blackout is an error. One outlet being down, slow or serving
	// junk must never fail the run or discard the archive.
	if (okCount === 0) {
		console.error('  every feed failed — exiting non-zero\n');
		process.exit(1);
	}
}

await main();
