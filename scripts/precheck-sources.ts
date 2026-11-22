/**
 * Source pre-check, no language model.
 *
 * For every source in `data/sources.yaml`, once: fetch its URL and record whether
 * it is alive, redirected, dead, blocked or timed out; ask the Wayback
 * availability service for the closest snapshot; and look for the record's
 * excerpt in the live page text, then in the snapshot text.
 *
 * The output is one JSON line per source, written to `--out` when given. It is
 * data: "not found" is a flag for a person, not a verdict, because an excerpt may
 * be a translation.
 *
 * Requests are spaced at one a second per host by default, the user agent names
 * the project, and network errors get at most two retries. A page that cannot be
 * read is recorded as unreadable, not as dead.
 *
 * Usage:
 *   npx tsx scripts/precheck-sources.ts --limit 20 --out /tmp/precheck.jsonl
 *   npx tsx scripts/precheck-sources.ts --ids one,two --delay-ms 1000
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { normalise } from '../src/lib/match.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DEFAULT_DATA = join(ROOT, 'data', 'sources.yaml');

export const USER_AGENT = 'deeptunisia-precheck (+https://deeptunisia.org)';
export const WAYBACK_API = 'https://archive.org/wayback/available';
export const DEFAULT_DELAY_MS = 1000;
export const DEFAULT_TIMEOUT_MS = 15000;
/** Two retries after the first attempt, on network errors only. */
export const MAX_RETRIES = 2;
/** A body larger than this is not a page a person could read in one sitting. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Pure parts
// ---------------------------------------------------------------------------

export type LinkStatus = 'alive' | 'redirected' | 'dead' | 'blocked' | 'timeout';
export type ExcerptStatus =
	| 'found-live'
	| 'found-snapshot'
	| 'not-found'
	| 'unreadable'
	| 'no-excerpt';

export interface SourceRow {
	id: string;
	url: string;
	excerpt?: string;
}

export interface PrecheckLine {
	id: string;
	url: string;
	status: LinkStatus;
	http: number | null;
	final_url: string | null;
	snapshot_url: string | null;
	snapshot_timestamp: string | null;
	excerpt: ExcerptStatus;
}

export interface Snapshot {
	url: string;
	timestamp: string;
}

/**
 * Fold page text for excerpt matching: strip scripts, styles and tags, decode
 * the entities that carry meaning, then apply the project's shared character
 * folding (case, Latin and Arabic diacritics, Arabic letter forms, whitespace).
 *
 * Reusing `normalise` keeps this check on the same folding as entity matching,
 * so a page that matches a name also matches a quote written the same way.
 */
export function foldPageText(html: string): string {
	const withoutBlocks = html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ');
	const text = withoutBlocks.replace(/<[^>]+>/g, ' ');
	return normalise(decodeEntities(text));
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	deg: '°',
	middot: '·',
	times: '×',
	euro: '€',
	pound: '£',
	copy: '©',
	reg: '®',
	ndash: '-',
	mdash: '-',
	hellip: '...',
	laquo: '"',
	raquo: '"',
	rsquo: "'",
	lsquo: "'",
	ldquo: '"',
	rdquo: '"',
	// Latin letters used in French, Spanish and German page text.
	agrave: 'à',
	aacute: 'á',
	acirc: 'â',
	atilde: 'ã',
	auml: 'ä',
	aring: 'å',
	aelig: 'æ',
	ccedil: 'ç',
	egrave: 'è',
	eacute: 'é',
	ecirc: 'ê',
	euml: 'ë',
	igrave: 'ì',
	iacute: 'í',
	icirc: 'î',
	iuml: 'ï',
	ntilde: 'ñ',
	ograve: 'ò',
	oacute: 'ó',
	ocirc: 'ô',
	otilde: 'õ',
	ouml: 'ö',
	oslash: 'ø',
	ugrave: 'ù',
	uacute: 'ú',
	ucirc: 'û',
	uuml: 'ü',
	yacute: 'ý',
	yuml: 'ÿ',
	szlig: 'ß'
};

/** Decode the common named entities and every numeric reference. */
export function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
		if (body.startsWith('#')) {
			const hex = body[1] === 'x' || body[1] === 'X';
			const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
			if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
			try {
				return String.fromCodePoint(code);
			} catch {
				return whole;
			}
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
	});
}

/** Fold one excerpt the same way as page text. */
export function foldExcerpt(excerpt: string): string {
	return normalise(excerpt);
}

/** Does the folded excerpt occur in the folded page text? */
export function matchExcerpt(excerpt: string, pageText: string): boolean {
	const needle = foldExcerpt(excerpt);
	if (needle.length < 3) return false;
	return foldPageText(pageText).includes(needle);
}

/** URL form used only to decide whether a redirect happened. */
export function normalizeUrlForCompare(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
			parsed.pathname = parsed.pathname.slice(0, -1);
		}
		return parsed.toString().toLowerCase();
	} catch {
		return url.trim().toLowerCase();
	}
}

/**
 * Classify one fetch. 401, 403 and 429 are blocks, not deaths: the page exists
 * and a person may still reach it. Any other 4xx or 5xx is dead. A network
 * failure with no HTTP status is dead (DNS failure, refused connection).
 */
export function classifyLink(input: {
	httpStatus: number | null;
	originalUrl: string;
	finalUrl: string | null;
	timedOut?: boolean;
}): LinkStatus {
	if (input.timedOut) return 'timeout';
	const code = input.httpStatus;
	if (code === null) return 'dead';
	if (code === 401 || code === 403 || code === 429) return 'blocked';
	if (code >= 300 && code < 400) {
		return input.finalUrl &&
			normalizeUrlForCompare(input.finalUrl) !== normalizeUrlForCompare(input.originalUrl)
			? 'redirected'
			: 'dead';
	}
	if (code >= 200 && code < 300) {
		return input.finalUrl &&
			normalizeUrlForCompare(input.finalUrl) !== normalizeUrlForCompare(input.originalUrl)
			? 'redirected'
			: 'alive';
	}
	return 'dead';
}

/**
 * Classify the excerpt check. A source with no excerpt has nothing to look for.
 * A source whose page could not be read at all is unreadable, which is a
 * statement about the check, not about the source.
 */
export function classifyExcerpt(
	excerpt: string | null | undefined,
	liveText: string | null,
	snapshotText: string | null
): ExcerptStatus {
	if (typeof excerpt !== 'string' || excerpt.trim() === '') return 'no-excerpt';
	if (liveText !== null && matchExcerpt(excerpt, liveText)) return 'found-live';
	if (snapshotText !== null && matchExcerpt(excerpt, snapshotText)) return 'found-snapshot';
	if (liveText === null && snapshotText === null) return 'unreadable';
	return 'not-found';
}

/** Requested wait before the next request to a host. */
export function nextDelay(lastAt: number, now: number, delayMs: number): number {
	return Math.max(0, delayMs - (now - lastAt));
}

export interface LimiterOptions {
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

/**
 * One request a second per host, with requests to one host queued. Different
 * hosts wait independently, so the whole run is not serialised by one slow host.
 */
export function createHostLimiter(
	delayMs: number,
	options: LimiterOptions = {}
): (host: string) => Promise<void> {
	const now = options.now ?? (() => Date.now());
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const lastAt = new Map<string, number>();
	const queues = new Map<string, Promise<void>>();

	return async function limit(host: string): Promise<void> {
		const previous = queues.get(host) ?? Promise.resolve();
		const run = previous.then(async () => {
			const last = lastAt.get(host);
			if (last !== undefined) {
				const wait = nextDelay(last, now(), delayMs);
				if (wait > 0) await sleep(wait);
			}
			lastAt.set(host, now());
		});
		queues.set(host, run.catch(() => undefined));
		await run;
	};
}

/**
 * Read the closest snapshot out of a Wayback availability reply.
 * Anything unexpected yields null: a failed lookup never fails the source.
 */
export function parseWayback(json: unknown): Snapshot | null {
	if (typeof json !== 'object' || json === null) return null;
	const closest = (json as { archived_snapshots?: { closest?: unknown } }).archived_snapshots
		?.closest;
	if (typeof closest !== 'object' || closest === null) return null;
	const row = closest as { available?: unknown; url?: unknown; timestamp?: unknown };
	if (row.available !== true) return null;
	if (typeof row.url !== 'string' || row.url === '') return null;
	return { url: row.url, timestamp: typeof row.timestamp === 'string' ? row.timestamp : '' };
}

export interface CliOptions {
	dataFile: string;
	limit: number | null;
	ids: string[] | null;
	out: string | null;
	delayMs: number;
	timeoutMs: number;
}

function positiveInt(flag: string, raw: string): number {
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${flag} needs a positive integer, got "${raw}"`);
	}
	return value;
}

/** Parse the command line. Unknown flags are an error, not ignored. */
export function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		dataFile: DEFAULT_DATA,
		limit: null,
		ids: null,
		out: null,
		delayMs: DEFAULT_DELAY_MS,
		timeoutMs: DEFAULT_TIMEOUT_MS
	};
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag === '--help' || flag === '-h') {
			options.ids = [];
			return options;
		}
		if (value === undefined) throw new Error(`${flag} needs a value`);
		switch (flag) {
			case '--limit':
				options.limit = positiveInt(flag, value);
				break;
			case '--ids': {
				const ids = value
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				if (ids.length === 0) throw new Error('--ids needs at least one id');
				options.ids = ids;
				break;
			}
			case '--out':
				options.out = resolve(value);
				break;
			case '--data':
				options.dataFile = resolve(value);
				break;
			case '--delay-ms':
				options.delayMs = positiveInt(flag, value);
				break;
			case '--timeout-ms':
				options.timeoutMs = positiveInt(flag, value);
				break;
			default:
				throw new Error(`unknown option ${flag}`);
		}
		i++;
	}
	if (options.delayMs < 1) throw new Error('--delay-ms must be at least 1');
	return options;
}

/**
 * Take the rows to check, in file order. `--ids` wins over `--limit` for
 * selection but `--limit` still caps the number checked. An unknown id is an
 * error: a typo must not silently check nothing.
 */
export function selectSources(
	sources: SourceRow[],
	options: { ids?: string[] | null; limit?: number | null }
): SourceRow[] {
	let rows = sources;
	if (options.ids && options.ids.length > 0) {
		const byId = new Map(sources.map((s) => [s.id, s]));
		const missing = options.ids.filter((id) => !byId.has(id));
		if (missing.length > 0) {
			throw new Error(`unknown source id${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
		}
		rows = options.ids.map((id) => byId.get(id)!);
	}
	if (options.limit !== null && options.limit !== undefined) rows = rows.slice(0, options.limit);
	return rows;
}

/** Count rows by one field, for the printed summary. */
export function countBy(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const value = String(row[key]);
		counts[value] = (counts[value] ?? 0) + 1;
	}
	return counts;
}

// ---------------------------------------------------------------------------
// Network parts
// ---------------------------------------------------------------------------

function hostOf(url: string): string {
	try {
		return new URL(url).host.toLowerCase();
	} catch {
		return '';
	}
}

function isTextual(contentType: string | null): boolean {
	if (!contentType) return true;
	const value = contentType.toLowerCase();
	return (
		value.includes('text/') ||
		value.includes('html') ||
		value.includes('xml') ||
		value.includes('json')
	);
}

interface FetchResult {
	httpStatus: number | null;
	finalUrl: string | null;
	body: string | null;
	timedOut: boolean;
}

/**
 * Fetch one URL with the project user agent. Network errors get at most two
 * retries; HTTP status codes are answers, not failures, and are not retried.
 */
async function fetchOnce(
	url: string,
	limit: (host: string) => Promise<void>,
	timeoutMs: number
): Promise<FetchResult> {
	let lastTimedOut = false;
	let last: FetchResult | null = null;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await limit(hostOf(url));
		try {
			const response = await fetch(url, {
				redirect: 'follow',
				headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
				signal: AbortSignal.timeout(timeoutMs)
			});
			const finalUrl = response.url || url;
			let body: string | null = null;
			if (isTextual(response.headers.get('content-type'))) {
				try {
					body = (await response.text()).slice(0, MAX_BODY_BYTES);
				} catch {
					body = null;
				}
			} else {
				await response.body?.cancel().catch(() => undefined);
			}
			last = { httpStatus: response.status, finalUrl, body, timedOut: false };
			return last;
		} catch (error) {
			const name = (error as Error).name;
			lastTimedOut = name === 'TimeoutError' || name === 'AbortError';
			last = { httpStatus: null, finalUrl: null, body: null, timedOut: lastTimedOut };
			if (lastTimedOut) return last;
		}
	}
	return last ?? { httpStatus: null, finalUrl: null, body: null, timedOut: lastTimedOut };
}

/** Ask the Wayback availability service for the closest snapshot. */
async function waybackLookup(
	url: string,
	limit: (host: string) => Promise<void>,
	timeoutMs: number
): Promise<Snapshot | null> {
	await limit(hostOf(WAYBACK_API));
	try {
		const response = await fetch(`${WAYBACK_API}?url=${encodeURIComponent(url)}`, {
			redirect: 'follow',
			headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!response.ok) {
			await response.body?.cancel().catch(() => undefined);
			return null;
		}
		const json: unknown = await response.json();
		return parseWayback(json);
	} catch {
		return null;
	}
}

/** Fetch snapshot text, or null when it cannot be read. */
async function fetchText(
	url: string,
	limit: (host: string) => Promise<void>,
	timeoutMs: number
): Promise<string | null> {
	const result = await fetchOnce(url, limit, timeoutMs);
	if (result.httpStatus === null || result.httpStatus >= 400) return null;
	return result.body;
}

export async function checkSource(
	source: SourceRow,
	limit: (host: string) => Promise<void>,
	timeoutMs: number
): Promise<PrecheckLine> {
	const live = await fetchOnce(source.url, limit, timeoutMs);
	const status = classifyLink({
		httpStatus: live.httpStatus,
		originalUrl: source.url,
		finalUrl: live.finalUrl,
		timedOut: live.timedOut
	});

	const snapshot = await waybackLookup(source.url, limit, timeoutMs);

	// The snapshot is only read when there is an excerpt and the live page did
	// not settle it, so a resolved source costs one request plus one lookup.
	const excerpt = typeof source.excerpt === 'string' && source.excerpt.trim() !== '' ? source.excerpt : null;
	const foundLive = excerpt !== null && live.body !== null && matchExcerpt(excerpt, live.body);
	let snapshotText: string | null = null;
	if (excerpt !== null && !foundLive && snapshot) {
		snapshotText = await fetchText(snapshot.url, limit, timeoutMs);
	}

	const excerptStatus = classifyExcerpt(excerpt, live.body, snapshotText);

	return {
		id: source.id,
		url: source.url,
		status,
		http: live.httpStatus,
		final_url: live.finalUrl,
		snapshot_url: snapshot?.url ?? null,
		snapshot_timestamp: snapshot?.timestamp ?? null,
		excerpt: excerptStatus
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadSources(file: string): SourceRow[] {
	if (!existsSync(file)) throw new Error(`no data file at ${file}`);
	const raw: unknown = parseYaml(readFileSync(file, 'utf8'));
	if (!Array.isArray(raw)) throw new Error(`${file} is not a top-level YAML list`);
	return raw.map((entry, i) => {
		if (typeof entry !== 'object' || entry === null) {
			throw new Error(`${file}: entry ${i + 1} is not a mapping`);
		}
		const row = entry as Record<string, unknown>;
		if (typeof row.id !== 'string' || row.id === '') {
			throw new Error(`${file}: entry ${i + 1} has no id`);
		}
		if (typeof row.url !== 'string' || row.url === '') {
			throw new Error(`${file}: source ${row.id} has no url`);
		}
		return {
			id: row.id,
			url: row.url,
			excerpt: typeof row.excerpt === 'string' ? row.excerpt : undefined
		};
	});
}

export function summarize(rows: PrecheckLine[]): string {
	const asRecords = rows as unknown as Array<Record<string, unknown>>;
	const links = countBy(asRecords, 'status');
	const excerpts = countBy(asRecords, 'excerpt');
	const order = (counts: Record<string, number>, keys: string[]) => {
		const known = keys.map((key) => `${key} ${counts[key] ?? 0}`);
		const extra = Object.keys(counts)
			.filter((key) => !keys.includes(key))
			.map((key) => `${key} ${counts[key]}`);
		return [...known, ...extra].join(', ');
	};
	const withSnapshot = rows.filter((row) => row.snapshot_url !== null).length;
	return [
		`precheck: ${rows.length} sources, ${withSnapshot} with a snapshot`,
		`link: ${order(links, ['alive', 'redirected', 'dead', 'blocked', 'timeout'])}`,
		`excerpt: ${order(excerpts, ['found-live', 'found-snapshot', 'not-found', 'unreadable', 'no-excerpt'])}`
	].join('\n');
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.ids && options.ids.length === 0) {
		console.log(
			'Usage: npx tsx scripts/precheck-sources.ts [--limit N] [--ids a,b] [--out FILE] [--delay-ms N] [--timeout-ms N]'
		);
		return;
	}

	const all = loadSources(options.dataFile);
	const selected = selectSources(all, options);
	if (selected.length === 0) throw new Error('no sources selected');

	console.error(
		`precheck: ${selected.length} of ${all.length} sources, ${options.delayMs} ms per host, ${options.timeoutMs} ms timeout`
	);

	const limit = createHostLimiter(options.delayMs);
	const lines: PrecheckLine[] = [];
	for (const [i, source] of selected.entries()) {
		const line = await checkSource(source, limit, options.timeoutMs);
		lines.push(line);
		console.error(
			`[${i + 1}/${selected.length}] ${source.id} ${line.status} ${line.http ?? '-'} ${line.excerpt}`
		);
	}

	const jsonl = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
	if (options.out) {
		mkdirSync(dirname(options.out), { recursive: true });
		writeFileSync(options.out, jsonl);
	} else {
		process.stdout.write(jsonl);
	}
	console.log(`\n${summarize(lines)}`);
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) {
	main().catch((error: unknown) => {
		console.error(`precheck failed: ${(error as Error).message}`);
		process.exit(1);
	});
}
