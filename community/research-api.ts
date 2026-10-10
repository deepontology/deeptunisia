/**
 * The research submission API.
 *
 * Handles everything under /api/studies (contract §4), routed here by api.ts
 * before that module's other branches. Reads — the registry, a study, an
 * instrument, a count — are unauthenticated and unlimited, for the same reason
 * the community reads are: throttling readers means identifying readers, and
 * what a person is willing to tell a survey about their politics is the most
 * sensitive thing they will hand this site.
 *
 * Submissions follow the refusal ladder in contract §4, in order: parse (capped)
 * → study exists → study fielding → RESEARCH_OPEN → storage → honeypot → bot
 * challenge → rate limit → assignment → completion floor → validateSubmission →
 * receipt → insert. Each refusal is the honest one for its cause; the order
 * matters because a caller acts differently on "not open yet" than on "you
 * answered wrong".
 *
 * LOCAL DEVELOPMENT ONLY. RESEARCH_DEV_STUDY (read in community/server.ts) names
 * one study by slug or id: the API treats it as fielding and accepts its
 * submissions without a bot challenge, so the runner can be answered end to end
 * before the canonical registry leaves `design`. The Worker never reads the
 * variable, so production cannot take the branch. The response carries the
 * effective status and nothing else about the override.
 *
 * THE ADDRESS RULE. The client address reaches this module as an opaque string,
 * is used for exactly two things — the rate-limit bucket and the injected
 * verifier's argument — and is never logged, never stored, and never sent to the
 * Turnstile siteverify endpoint. Nothing in research-schema.sql could hold it.
 */
import type { Env } from './api.ts';
import type { Db } from './db.ts';
import { bucketKey, consume, RateLimitError, type BucketStore } from './ratelimit.ts';
import { checkHoneypot, AbuseError } from './abuse.ts';
import {
	validateSubmission,
	type RuntimeInstrument,
	type StudiesRegistry
} from './research-contract.ts';
import { aggregateResponses, aggregateSeries, applyExclusions, applyPublicationFloor, periodOf } from './research-scoring.ts';

/** What the research handler needs from its caller, per request. */
export interface ResearchContext {
	/** Opaque client address; consumed by the rate limiter only. */
	clientAddress: string;
	/** Where rate-limit buckets live (the community DB). */
	bucketStore: BucketStore;
	now: number;
}

const MAX_BODY = 20_000;
const MAX_RECEIPT = 64;

class ResearchError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
	});

// ---------------------------------------------------------------------------
// Live results (study 002 runs fully live; index-spec §7).
//
// Aggregates only: no row, receipt, locale or timestamp finer than an hour
// leaves this function. The `src` link codes are read and never sent: they are
// counted into the three shares of the link check (research-scoring.ts) and the
// codes themselves stay here. Rows are read for the instrument hash the study
// currently fields, so a wave is exactly one instrument version. The bootstrap
// seed is fixed, so the same rows always give the same interval and a reader
// refreshing the page never sees the numbers jitter without new data.
// ---------------------------------------------------------------------------

const LIVE_STATUSES = new Set(['fielding', 'closed', 'analyzed', 'published']);
const LIVE_MAX_AGE_SECONDS = 30;
const LIVE_SEED = 20261007;
const LIVE_RESAMPLES = 1000;
const HOUR_MS = 3_600_000;
const SERIES_HOURS = 72;

async function liveResults(db: Db, study: StudySummary, instrument: RuntimeInstrument, now: number) {
	const spec = instrument.scoring!;
	const { results } = await db
		.prepare(
			`SELECT answers, completion_ms, submitted_at, channel FROM research_responses
			 WHERE study_id = ? AND instrument_hash = ?`
		)
		.bind(study.id, instrument.hash)
		.all<{ answers: string; completion_ms: number; submitted_at: number; channel: string }>();

	const conditions = Object.fromEntries(
		instrument.items.filter((item) => item.showIf !== undefined).map((item) => [item.id, item.showIf!])
	);
	const aggregate = { seed: LIVE_SEED, resamples: LIVE_RESAMPLES, conditions };
	const rows = (results ?? []).map((r) => ({
		answers: safeAnswers(r.answers),
		completionMs: r.completion_ms,
		submittedAt: r.submitted_at,
		// Read by the link check, which returns shares and never a code.
		channel: r.channel
	}));
	const { kept, exclusions } = applyExclusions(spec, rows);

	// Submissions per hour, every row (excluded ones too), so a flood is visible
	// to every reader whether or not the rules caught it.
	const firstHour = Math.floor(now / HOUR_MS) - (SERIES_HOURS - 1);
	const perHour = new Array<number>(SERIES_HOURS).fill(0);
	for (const row of rows) {
		const slot = Math.floor(row.submittedAt / HOUR_MS) - firstHour;
		if (slot >= 0 && slot < SERIES_HOURS) perHour[slot] += 1;
	}

	return {
		study: study.id,
		instrument: { id: instrument.id, version: instrument.version, hash: instrument.hash },
		generated_at: new Date(now).toISOString(),
		received: rows.length,
		exclusions,
		submissions_per_hour: { start: new Date(firstHour * HOUR_MS).toISOString(), counts: perHour },
		// Everything is computed, then the publication floor decides what leaves:
		// below it only counts do (research-scoring.ts, applyPublicationFloor).
		...applyPublicationFloor(
			spec,
			aggregateResponses(spec, kept, aggregate),
			// The monthly index: every month from the first month of fielding to
			// this one, each with its own figures and the filtered level.
			aggregateSeries(spec, kept, {
				...aggregate,
				now,
				firstPeriod: study.fielding_start ? study.fielding_start.slice(0, 7) : undefined
			})
		)
	};
}

/** A stored answers column that fails to parse counts as an empty response. */
function safeAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// Registry reading. The registry is build output (contract §3); these guards
// keep a malformed entry from reaching a respondent instead of assuming it.
// ---------------------------------------------------------------------------

interface StudySummary {
	id: string;
	slug: string;
	status: string;
	title_en: string;
	instrument_versions: Array<{ id: string; version: string }>;
	/** First day of fielding (YYYY-MM-DD), when the registry records one. */
	fielding_start: string | null;
}

function asStudy(value: unknown): StudySummary | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const s = value as Record<string, unknown>;
	if (typeof s.id !== 'string' || typeof s.slug !== 'string' || typeof s.status !== 'string') {
		return null;
	}
	const versions = Array.isArray(s.instrument_versions)
		? s.instrument_versions.filter(
				(v): v is { id: string; version: string } => {
					if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
					const r = v as Record<string, unknown>;
					return typeof r.id === 'string' && typeof r.version === 'string';
				}
			)
		: [];
	return {
		id: s.id,
		slug: s.slug,
		status: s.status,
		title_en: typeof s.title_en === 'string' ? s.title_en : s.id,
		instrument_versions: versions,
		fielding_start: fieldingStart(s.fielding_window)
	};
}

function fieldingStart(window: unknown): string | null {
	if (!window || typeof window !== 'object' || Array.isArray(window)) return null;
	const start = (window as Record<string, unknown>).start;
	if (start instanceof Date) return start.toISOString().slice(0, 10);
	return typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null;
}

function findStudy(registry: StudiesRegistry, slug: string): StudySummary | null {
	for (const entry of registry.studies) {
		const study = asStudy(entry);
		if (study && study.slug === slug) return study;
	}
	return null;
}

function instrumentFor(registry: StudiesRegistry, study: StudySummary): RuntimeInstrument | null {
	const first = study.instrument_versions[0];
	if (!first) return null;
	return registry.instruments[`${first.id}@${first.version}`] ?? null;
}

/**
 * Is the local dev fielding override pointed at this study?
 *
 * RESEARCH_DEV_STUDY is set only by the local server (community/server.ts),
 * which warns at startup; the Worker does not read it. Matching on slug or id
 * lets an operator name the study the same way the site or the registry does.
 */
function isDevFielding(env: Env, study: StudySummary): boolean {
	const dev = env.RESEARCH_DEV_STUDY;
	return Boolean(dev) && (dev === study.slug || dev === study.id);
}

/**
 * The status this API acts on. Normally the declared status; under the local
 * dev override, `fielding` for the one study named. The registry entry itself
 * is never rewritten, and no response says why the status differs.
 */
function effectiveStatus(env: Env, study: StudySummary): string {
	return isDevFielding(env, study) ? 'fielding' : study.status;
}

/** Parse and cap the body once, for every route that takes one (contract §4). */
async function readBody(request: Request): Promise<Record<string, unknown>> {
	const raw = await request.arrayBuffer();
	if (raw.byteLength > MAX_BODY) {
		throw new ResearchError(`the request body is larger than ${MAX_BODY} bytes`, 400);
	}
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('not an object');
		}
		return parsed as Record<string, unknown>;
	} catch {
		throw new ResearchError('the request body is not a JSON object', 400);
	}
}

/**
 * The bot challenge (contract §4).
 *
 * True = verified, false = failed, null = nothing configured. The injected
 * verifier (tests) receives the address because its contract says so; the real
 * siteverify call sends the token and the secret alone, so the address never
 * leaves this process either way.
 */
async function verifyHuman(env: Env, token: string, address: string): Promise<boolean | null> {
	if (env.TURNSTILE_VERIFY) return env.TURNSTILE_VERIFY(token, address);
	if (env.TURNSTILE_SECRET) {
		if (!token) return false;
		try {
			const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token })
			});
			const out = (await res.json()) as { success?: boolean };
			return out.success === true;
		} catch {
			return false;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// The first-party bot check (contract §4)
//
// Study pages make no third-party requests (research/portal/README.md §8), so
// the default challenge is a hash puzzle the client solves in a worker rather
// than a CAPTCHA script fetched from another origin. Turnstile remains the path
// when a secret is configured (verifyHuman above); this is what runs when one
// is not. The puzzle costs a bot about 131k hashes per response, paid in
// advance of the request, and costs a human one solve in the background while
// they read the first question.
// ---------------------------------------------------------------------------

/**
 * The difficulty, in leading zero bits of `sha256(salt + ':' + nonce)`.
 *
 * 17 bits is 2^17 ≈ 131,000 hashes on average: roughly one to three seconds on
 * a mid-range phone, in a worker, while the respondent is still reading. The
 * number is a constant rather than configuration, because a difficulty knob is
 * a tool for turning the cost down to zero at exactly the moment it matters.
 */
const POW_DIFFICULTY = 17;
/** How long a challenge stays valid: long enough for the slowest reader. */
const POW_TTL_MS = 2 * 60 * 60 * 1000;
const POW_SALT_BYTES = 16;

/** A fresh random salt, hex, from the platform CSPRNG. */
function powSalt(): string {
	const bytes = new Uint8Array(POW_SALT_BYTES);
	crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The number of leading zero bits in a digest: the proof-of-work score. */
function leadingZeroBits(bytes: Uint8Array): number {
	let bits = 0;
	for (const byte of bytes) {
		if (byte === 0) {
			bits += 8;
			continue;
		}
		bits += Math.clz32(byte) - 24;
		break;
	}
	return bits;
}

/**
 * Constant-time comparison of two hex strings.
 *
 * The signature is derived from a secret, so how many leading characters match
 * must not be readable through timing. The length check is not constant time
 * and does not need to be: the digest is always 64 hex characters, so a length
 * mismatch is a malformed value, never a near-miss.
 */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * Verify the proof of work and spend its salt.
 *
 * Every failure is the same 403 and the same sentence: a caller learns that the
 * check did not pass, never which of the checks noticed. The salt is inserted
 * in this same request, before the response row, so a spent challenge can never
 * back a second response; the primary key is what makes that atomic under
 * concurrent submissions.
 */
async function verifyProofOfWork(
	env: Env,
	study: StudySummary,
	value: unknown,
	db: Db,
	now: number
): Promise<void> {
	if (!isRecord(value)) throw new ResearchError('the bot check failed', 403);
	const { salt, difficulty, expires, sig, nonce } = value;
	if (
		typeof salt !== 'string' ||
		!/^[0-9a-f]{32}$/.test(salt) ||
		typeof difficulty !== 'number' ||
		!Number.isInteger(difficulty) ||
		typeof expires !== 'number' ||
		!Number.isFinite(expires) ||
		typeof sig !== 'string' ||
		typeof nonce !== 'number' ||
		!Number.isInteger(nonce) ||
		nonce < 0
	) {
		throw new ResearchError('the bot check failed', 403);
	}
	const expected = await hmacHex(
		env.ASSIGNMENT_SECRET ?? env.RATE_PEPPER,
		`${study.id}|${salt}|${difficulty}|${expires}`
	);
	if (!constantTimeEqual(sig, expected)) throw new ResearchError('the bot check failed', 403);
	if (!(expires > now)) throw new ResearchError('the bot check failed', 403);
	if (difficulty < POW_DIFFICULTY) throw new ResearchError('the bot check failed', 403);
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${nonce}`))
	);
	if (leadingZeroBits(digest) < difficulty) throw new ResearchError('the bot check failed', 403);
	// Expired salts are swept on the next insert, one cheap statement; the table
	// is a set of live challenges, not a log.
	await db.prepare('DELETE FROM research_pow_used WHERE expires < ?').bind(now).run();
	try {
		await db
			.prepare('INSERT INTO research_pow_used (salt, expires) VALUES (?, ?)')
			.bind(salt, expires)
			.run();
	} catch {
		// The salt's primary key already exists: this challenge has been spent.
		throw new ResearchError('the bot check failed', 403);
	}
}

// ---------------------------------------------------------------------------
// Arm assignment (contract §10)
//
// The instrument reads hand out the block order and scale direction with an
// HMAC token; submit echoes the token and both values, the server verifies
// them, and the row stores the arms. The client is never trusted to randomize:
// the assignment must be fixed before the respondent sees the first block, so
// assigning at submit time could not control presentation.
// ---------------------------------------------------------------------------

const BLOCK_ORDERS = ['core_first', 'extended_first'] as const;
const SCALE_DIRECTIONS = ['ascending', 'descending'] as const;

type BlockOrder = (typeof BLOCK_ORDERS)[number];
type ScaleDirection = (typeof SCALE_DIRECTIONS)[number];

/** What the runner receives at instrument fetch and sends back at submit. */
export interface RuntimeAssignment {
	blockOrder: BlockOrder;
	scaleDirection: ScaleDirection;
	token: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** HMAC-SHA256 hex over WebCrypto, so the same code runs on Workers and Node. */
async function hmacHex(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 50/50 via the platform CSPRNG; the low bit of one byte is a fair coin. */
function randomBit(): number {
	const bytes = new Uint8Array(1);
	crypto.getRandomValues(bytes);
	return bytes[0] & 1;
}

function assignmentToken(
	env: Env,
	study: StudySummary,
	blockOrder: BlockOrder,
	scaleDirection: ScaleDirection
): Promise<string> {
	return hmacHex(
		env.ASSIGNMENT_SECRET ?? env.RATE_PEPPER,
		`${study.id}|${blockOrder}|${scaleDirection}`
	);
}

/** A fresh assignment for an instrument read. */
async function makeAssignment(
	env: Env,
	study: StudySummary,
	instrument: RuntimeInstrument
): Promise<RuntimeAssignment> {
	// An arm is randomized only when the instrument declares that experiment.
	// Otherwise every respondent gets the control arm, which is what they are
	// actually shown, so the stored row never records an experiment that did
	// not run.
	const declares = (id: string) => instrument.experiments.some((e) => e.id === id);
	const blockOrder = declares('exp_block_order') ? BLOCK_ORDERS[randomBit()] : BLOCK_ORDERS[0];
	const scaleDirection = declares('exp_scale_direction') ? SCALE_DIRECTIONS[randomBit()] : SCALE_DIRECTIONS[0];
	return {
		blockOrder,
		scaleDirection,
		token: await assignmentToken(env, study, blockOrder, scaleDirection)
	};
}

/**
 * The arms a submission claims, verified against the token.
 *
 * Absent is a 400 in production and null arms on the local dev path. A supplied
 * assignment is verified either way: a value outside the two arms and a token
 * that does not match are both 400, because a client that picks its own arms is
 * exactly what the server-side assignment exists to prevent.
 */
async function verifyAssignment(
	env: Env,
	study: StudySummary,
	value: unknown
): Promise<{ blockOrder: string | null; scaleDirection: string | null }> {
	if (value === undefined) {
		if (!isDevFielding(env, study)) {
			throw new ResearchError('an assignment is required for this study', 400);
		}
		return { blockOrder: null, scaleDirection: null };
	}
	if (!isRecord(value)) throw new ResearchError('the assignment is malformed', 400);
	const blockOrder = value.blockOrder;
	const scaleDirection = value.scaleDirection;
	const token = value.token;
	if (
		typeof blockOrder !== 'string' ||
		!(BLOCK_ORDERS as readonly string[]).includes(blockOrder) ||
		typeof scaleDirection !== 'string' ||
		!(SCALE_DIRECTIONS as readonly string[]).includes(scaleDirection) ||
		typeof token !== 'string'
	) {
		throw new ResearchError('the assignment is malformed', 400);
	}
	const expected = await assignmentToken(
		env,
		study,
		blockOrder as BlockOrder,
		scaleDirection as ScaleDirection
	);
	if (token !== expected) throw new ResearchError('the assignment does not verify', 400);
	return { blockOrder, scaleDirection };
}

export async function handleResearch(
	request: Request,
	env: Env,
	ctx: ResearchContext
): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, '') || '/';
	const parts = path.split('/').filter(Boolean);
	// parts: ['api', 'studies'] | ['api', 'studies', slug] | ['api', 'studies', slug, action]
	const slug = parts.length > 2 ? parts[2] : null;
	const action = parts.length > 3 ? parts[3] : '';

	try {
		// ---- reads: unauthenticated, unlimited, nothing recorded -------------

		if (request.method === 'GET' && !slug) {
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const studies = env.STUDIES.studies.map(asStudy).filter((s): s is StudySummary => s !== null);
			return json({
				studies: studies.map((s) => ({ id: s.id, slug: s.slug, status: s.status, title_en: s.title_en }))
			});
		}

		if (request.method === 'GET' && slug && action === 'instrument') {
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			const instrument = instrumentFor(env.STUDIES, study);
			if (!instrument) throw new ResearchError('no instrument is published for this study', 404);
			// The arms travel with the instrument: they must be fixed before the
			// respondent sees the first block, so the server assigns them here.
			return json({ instrument, assignment: await makeAssignment(env, study, instrument) });
		}

		if (request.method === 'GET' && slug && !action) {
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			const instrument = instrumentFor(env.STUDIES, study);
			if (!instrument) throw new ResearchError('no instrument is published for this study', 404);
			// The raw entry goes back as it is, with one field replaced by the status
			// this API acts on. findStudy and the lookup below share the same
			// predicate, so the cast is safe, and the registry object is never
			// modified: a copy is what goes out.
			const raw = env.STUDIES.studies.find((entry) => asStudy(entry)?.slug === slug) as
				| Record<string, unknown>
				| undefined;
			return json({
				study: raw ? { ...raw, status: effectiveStatus(env, study) } : null,
				instrument,
				assignment: await makeAssignment(env, study, instrument)
			});
		}

		if (request.method === 'GET' && slug && action === 'count') {
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			if (!env.RESEARCH_DB) throw new ResearchError('research storage is not configured', 503);
			const row = await env.RESEARCH_DB.prepare(
				'SELECT COUNT(*) AS n FROM research_responses WHERE study_id = ?'
			)
				.bind(study.id)
				.first<{ n: number }>();
			return json({ count: row?.n ?? 0 });
		}

		if (request.method === 'GET' && slug && action === 'challenge') {
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			// A puzzle is served only while the study accepts responses: work for
			// a closed study would be work for nothing.
			if (effectiveStatus(env, study) !== 'fielding') {
				throw new ResearchError('this study is not accepting responses', 409);
			}
			const salt = powSalt();
			const expires = ctx.now + POW_TTL_MS;
			const sig = await hmacHex(
				env.ASSIGNMENT_SECRET ?? env.RATE_PEPPER,
				`${study.id}|${salt}|${POW_DIFFICULTY}|${expires}`
			);
			return json({ salt, difficulty: POW_DIFFICULTY, expires, sig });
		}

		if (request.method === 'GET' && slug && action === 'live') {
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			const instrument = instrumentFor(env.STUDIES, study);
			if (!instrument?.scoring) throw new ResearchError('this study publishes no live results', 404);
			// Live results exist only once responses can exist: a study in design
			// has nothing real to show, and a dev override shows its test rows.
			const status = effectiveStatus(env, study);
			if (!LIVE_STATUSES.has(status)) throw new ResearchError('this study is not collecting responses', 409);
			if (!env.RESEARCH_DB) throw new ResearchError('research storage is not configured', 503);
			return json(await liveResults(env.RESEARCH_DB, study, instrument, ctx.now), 200, {
				'cache-control': `public, max-age=${LIVE_MAX_AGE_SECONDS}`
			});
		}

		// ---- submissions ------------------------------------------------------

		if (request.method === 'POST' && slug && action === 'submit') {
			// 1. parse, capped at 20,000 bytes.
			const payload = await readBody(request);
			// 2. the study exists.
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			// 3. the study is fielding. Under the local dev override the one study
			//    named is treated as fielding; the registry keeps its declared status.
			if (effectiveStatus(env, study) !== 'fielding') {
				throw new ResearchError('this study is not accepting responses', 409);
			}
			// 4. the gate is open; anything but '1' is closed.
			if (env.RESEARCH_OPEN !== '1') {
				throw new ResearchError('submissions are closed', 403);
			}
			// 5. somewhere to put the response.
			const db: Db | undefined = env.RESEARCH_DB;
			if (!db) throw new ResearchError('research storage is not configured', 503);
			// 6. the honeypot: silent trap, and it costs a human nothing.
			try {
				checkHoneypot(payload);
			} catch (e) {
				if (e instanceof AbuseError) {
					throw new ResearchError('this submission looks automated', 400);
				}
				throw e;
			}
			// 7. the bot challenge. When Turnstile is configured its verifier runs
			//    exactly as before. Otherwise the first-party proof of work is
			//    required (portal README §8: a study page makes no third-party
			//    request), and the puzzle the runner solved in the background is
			//    spent here. The local dev path skips the check entirely: the
			//    runner has to be answerable without a challenge while the study
			//    is being fielded locally. The Worker does not read
			//    RESEARCH_DEV_STUDY, so this branch cannot exist in production,
			//    and every other check still runs.
			if (!isDevFielding(env, study)) {
				if (env.TURNSTILE_VERIFY || env.TURNSTILE_SECRET) {
					const token = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : '';
					const human = await verifyHuman(env, token, ctx.clientAddress);
					if (human === null) {
						throw new ResearchError('the bot challenge is not configured', 503);
					}
					if (!human) throw new ResearchError('the bot challenge failed', 403);
				} else {
					await verifyProofOfWork(env, study, payload.pow, db, ctx.now);
				}
			}
			// 8. five responses an hour per address, counted from a salted hash.
			const key = await bucketKey(ctx.clientAddress, env.RATE_PEPPER, ctx.now);
			await consume(ctx.bucketStore, key, 'response', ctx.now);
			// 9. the compiled instrument, needed by the assignment and completion
			//    gates below and by validation after them.
			const instrument = instrumentFor(env.STUDIES, study);
			if (!instrument) throw new ResearchError('no instrument is published for this study', 404);
			// 10. the arm assignment (contract §10): signed at the instrument read,
			//     verified here, stored with the response. The dev override accepts an
			//     absent assignment with null arms; a supplied assignment is verified
			//     either way.
			const arms = await verifyAssignment(env, study, payload.assignment);
			// 11. minimum completion time: a floor against straight-through bots,
			//     not a data-quality rule. A study that pre-registers a speed
			//     exclusion (its scoring block) is refused at the door only below
			//     half of that threshold: a fast human who clears the door is kept
			//     and counted in the published exclusion instead of being shown an
			//     error after answering everything. Other studies keep the
			//     provisional 40% of the estimated completion until a pretest
			//     median exists. The dev override waives it because manual testing
			//     cannot spend minutes per submission.
			const completionMs = payload.completionMs;
			const speedRule = instrument.scoring?.exclusions?.min_completion_seconds;
			const minimumCompletion =
				typeof speedRule === 'number' ? speedRule * 0.5 * 1000 : instrument.estimatedMinutes * 0.4 * 60_000;
			if (
				!isDevFielding(env, study) &&
				typeof completionMs === 'number' &&
				Number.isFinite(completionMs) &&
				completionMs < minimumCompletion
			) {
				throw new ResearchError('the completion time is below the study minimum', 400);
			}
			// 12. the payload against the compiled instrument. The local dev override
			//     also lets the named study omit its MaxDiff block while the design is
			//     `to-generate`; production passes false and stays strict.
			const result = validateSubmission(instrument, payload, {
				allowMissingMaxdiff: isDevFielding(env, study)
			});
			if (!result.ok) {
				// A design that was never generated is a study-state problem, not a
				// mistake the respondent could fix, so it is 409 (contract §4).
				if (result.code === 'maxdiff-not-generated') {
					throw new ResearchError(result.error, 409);
				}
				throw new ResearchError(`${result.code}: ${result.error}`, 400);
			}
			// 13. a receipt nobody chose, for a row that names nobody.
			const receipt = crypto.randomUUID();
			try {
				await db
					.prepare(
						`INSERT INTO research_responses
						 (receipt, study_id, instrument_id, instrument_version, instrument_hash,
						  locale, channel, consent_version, started_at, submitted_at, completion_ms,
						  block_order, scale_direction, answers, maxdiff, created_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.bind(
						receipt,
						study.id,
						instrument.id,
						instrument.version,
						instrument.hash,
						String(payload.locale),
						String(payload.channel),
						String(payload.consentVersion),
						payload.startedAt,
						ctx.now,
						payload.completionMs,
						// The arms verified at step 10; null on the local dev path, where
						// an absent assignment is allowed, and never client-chosen in
						// production.
						arms.blockOrder,
						arms.scaleDirection,
						JSON.stringify(result.answers),
						result.maxdiff ? JSON.stringify(result.maxdiff) : null,
						ctx.now
					)
					.run();
			} catch (e) {
				console.error(`  research: insert failed — ${(e as Error).message}`);
				throw new ResearchError('the response could not be stored', 503);
			}
			return json({ receipt });
		}

		if (request.method === 'POST' && slug && action === 'withdraw') {
			const payload = await readBody(request);
			const receipt = payload.receipt;
			if (
				typeof receipt !== 'string' ||
				receipt.trim().length === 0 ||
				receipt.length > MAX_RECEIPT
			) {
				throw new ResearchError('a receipt code is required', 400);
			}
			if (!env.STUDIES) throw new ResearchError('the studies registry is not available', 503);
			const study = findStudy(env.STUDIES, slug);
			if (!study) throw new ResearchError('no such study', 404);
			// Deletion exists only while the study is open: after it closes the
			// dataset is frozen, and the consent text says exactly that. The local
			// dev override makes a study it names open here as well.
			if (effectiveStatus(env, study) !== 'fielding') {
				throw new ResearchError('this study is not open, so a response cannot be deleted', 409);
			}
			if (!env.RESEARCH_DB) throw new ResearchError('research storage is not configured', 503);
			// In a monthly series a month's index is published when the month
			// ends, and it never changes afterwards, so an answer can be deleted
			// only during the month it was given in. The consent text says so.
			const instrument = instrumentFor(env.STUDIES, study);
			const series = instrument?.scoring?.series;
			if (series) {
				const row = await env.RESEARCH_DB.prepare(
					'SELECT submitted_at FROM research_responses WHERE receipt = ? AND study_id = ?'
				)
					.bind(receipt, study.id)
					.first<{ submitted_at: number }>();
				if (!row) return json({ deleted: false });
				const offset = series.utc_offset_minutes;
				if (periodOf(row.submitted_at, offset) !== periodOf(ctx.now, offset)) {
					throw new ResearchError('that month has closed, so its answers can no longer be deleted', 409);
				}
			}
			const out = await env.RESEARCH_DB.prepare(
				'DELETE FROM research_responses WHERE receipt = ? AND study_id = ?'
			)
				.bind(receipt, study.id)
				.run();
			return json({ deleted: out.meta.changes > 0 });
		}

		return json({ error: 'not found' }, 404);
	} catch (e) {
		if (e instanceof ResearchError) return json({ error: e.message }, e.status);
		if (e instanceof RateLimitError) {
			return json({ error: e.message, retry_after_ms: e.retryAfterMs }, 429);
		}
		if (e instanceof AbuseError) return json({ error: e.message }, 400);
		return json({ error: (e as Error).message }, 500);
	}
}
