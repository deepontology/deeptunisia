/**
 * The community HTTP API.
 *
 * A Workers-style `fetch(request, env)` handler, so the same function runs under
 * Cloudflare Workers and under the local node adapter in server.ts. Nothing here
 * imports node built-ins; the only capabilities used are Request/Response,
 * crypto.subtle and the Db interface, all of which exist in both places.
 *
 * WHAT THE HANDLER GUARANTEES, IN ORDER
 *
 * 1. Every write is signed by the identity making it, and the signature covers a
 *    nonce and a timestamp so it cannot be replayed.
 * 2. Every write is rate limited against a hash of the caller's address that is
 *    never stored in reversible form and rotates daily.
 * 3. Capability is checked against trust level before anything is written.
 * 4. Reads are unauthenticated, unmeasured and unlimited, because throttling
 *    readers means identifying readers and what a person reads here is the most
 *    sensitive thing about them.
 *
 * The client address is used for exactly one thing — deriving a rate-limit bucket —
 * and is never written to any table. See docs/anonymity-audit.md.
 */
import type { Db } from './db.ts';
import {
	verifyAction,
	capabilitiesFor,
	cleanLabel,
	earnedLevel,
	handleFor,
	IdentityError,
	type Identity,
	type SignedAction
} from './identity.ts';
import { bucketKey, consume, RateLimitError, type Bucket, type BucketStore } from './ratelimit.ts';
import { rank, reportPressure, type Sort } from './ranking.ts';
import { checkHoneypot, checkInterval, checkLinkCount, countLinks, isDuplicate, AbuseError } from './abuse.ts';

export interface Env {
	DB: Db;
	/** Held outside the database. Without it a leaked bucket table is reversible. */
	RATE_PEPPER: string;
	/** Public keys allowed to moderate. Deliberately a list, never a database flag. */
	MODERATORS?: string;
	/**
	 * The built entity index (id → kind) used to validate thread graph targets.
	 * The local server loads it from src/generated/dataset.json; absent on the
	 * Worker until an asset binding is wired, typed targets are then accepted by
	 * format only (spec §15.3 R4).
	 */
	ENTITY_IDS?: Set<string>;
}

const REPORT_REASONS = [
	'spam',
	'harassment',
	'hate',
	'manipulation',
	'misinformation',
	'off-topic',
	'duplicate',
	'illegal',
	'other'
];
const THREAD_KINDS = [
	'discussion',
	'opinion',
	'news',
	'investigation',
	'evidence',
	'question',
	'correction'
];
const TARGET_TYPES = [
	'person',
	'institution',
	'role',
	'position',
	'relationship',
	'event',
	'source',
	'open',
	// v0.0.2 record kinds — each record is an addressable claim, so each can be
	// the target of a thread or a proposed change.
	'company',
	'contract',
	'licence',
	'declaration',
	'education'
];

/** Mirrors the emitter's operations, so a proposal cannot describe an unappliable change. */
const PR_OPERATIONS = ['set', 'add-field', 'append-to-list', 'add-block', 'append-record'];
const PR_DECISIONS = ['accept', 'reject', 'needs-evidence', 'under-review'];

const MAX_BODY = 20_000;
const MAX_TITLE = 200;

class ApiError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	});

const id = () => crypto.randomUUID();

/** True when the public key is in the MODERATORS list. Never a database flag. */
function isModerator(env: Env, pubkey: string): boolean {
	return (env.MODERATORS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.includes(pubkey);
}

/**
 * Build the request the rate limiter will see (spec §15.3 R2).
 *
 * The LOCAL server calls this with the socket address. Forwarded headers are never
 * trusted on loopback: a client could spoof `x-forwarded-for` and reset its own rate
 * buckets. The socket address is the only truth, and it is set as cf-connecting-ip
 * so clientAddress() (api.ts) reads it the same way Cloudflare's is read. On
 * Cloudflare the platform sets cf-connecting-ip and strips the rest, so the same
 * handler runs on both sides of the trust boundary.
 */
export function localRequest(
	url: string,
	init: { method: string; headers: HeadersInit; body?: BodyInit },
	socketAddress: string
): Request {
	const headers = new Headers(init.headers);
	headers.delete('x-forwarded-for');
	headers.delete('cf-connecting-ip');
	headers.set('cf-connecting-ip', socketAddress || 'local');
	return new Request(url, { ...init, headers });
}

/** Buckets live in the database; the address that produced them does not. */
function bucketStore(db: Db): BucketStore {
	return {
		async get(key) {
			return db
				.prepare('SELECT key, count, expires_at FROM rate_buckets WHERE key = ?')
				.bind(key)
				.first<Bucket>();
		},
		async put(bucket) {
			await db
				.prepare(
					`INSERT INTO rate_buckets (key, count, expires_at) VALUES (?, ?, ?)
					 ON CONFLICT(key) DO UPDATE SET count = excluded.count, expires_at = excluded.expires_at`
				)
				.bind(bucket.key, bucket.count, bucket.expires_at)
				.run();
		}
	};
}

/**
 * The client address, used only to derive a rate-limit bucket.
 *
 * Returned as a value that is hashed immediately and never stored. If the header is
 * absent — as it is for a local request — everything falls into one shared bucket,
 * which is the safe direction to fail: it throttles more, not less.
 */
function clientAddress(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'local';
}

async function limit(env: Env, request: Request, action: string, now: number) {
	const key = await bucketKey(clientAddress(request), env.RATE_PEPPER, now);
	await consume(bucketStore(env.DB), key, action, now);
}

/**
 * Verify the signature, reject replays, and return the identity — creating it on
 * first sight.
 *
 * Registration is implicit: a key that signs a valid action for the first time gets
 * a row. There is nothing to sign up for and nothing to confirm, which is the point.
 */
async function authenticate(env: Env, request: Request, action: SignedAction, now: number): Promise<Identity> {
	await verifyAction(action, now, async (nonce) => {
		const row = await env.DB.prepare('SELECT nonce FROM used_nonces WHERE nonce = ?')
			.bind(nonce)
			.first();
		return row !== null;
	});

	await env.DB.prepare('INSERT INTO used_nonces (nonce, expires_at) VALUES (?, ?)')
		.bind(action.nonce, now + 15 * 60 * 1000)
		.run();

	let identity = await env.DB.prepare('SELECT * FROM identities WHERE pubkey = ?')
		.bind(action.pubkey)
		.first<Identity>();

	if (!identity) {
		// A new identity is a mint: a flooder holding many keys is exactly what the
		// per-address identity bucket costs. The limit applies only when a row is
		// actually created, so an existing identity is never throttled by its own
		// history. (spec §15.3 R1 — LIMITS.identity was dead config before this.)
		await limit(env, request, 'identity', now);
		await env.DB.prepare('INSERT INTO identities (pubkey, created_at) VALUES (?, ?)')
			.bind(action.pubkey, now)
			.run();
		identity = await env.DB.prepare('SELECT * FROM identities WHERE pubkey = ?')
			.bind(action.pubkey)
			.first<Identity>();
	}

	if (!identity) throw new ApiError('identity could not be created', 500);

	// Promotion is evaluated on write rather than by a scheduled job, so there is no
	// background task to forget to run.
	const earned = earnedLevel(identity, now);
	if (earned !== identity.trust_level) {
		await env.DB.prepare('UPDATE identities SET trust_level = ? WHERE pubkey = ?')
			.bind(earned, identity.pubkey)
			.run();
		identity.trust_level = earned;
	}

	if (identity.banned_at) throw new ApiError('this identity is banned', 403);
	return identity;
}

/** Expired nonces and buckets are swept opportunistically; neither is a log. */
async function sweep(db: Db, now: number) {
	await db.prepare('DELETE FROM used_nonces WHERE expires_at < ?').bind(now).run();
	await db.prepare('DELETE FROM rate_buckets WHERE expires_at < ?').bind(now).run();
}

function requireString(value: unknown, field: string, max: number): string {
	if (typeof value !== 'string' || !value.trim()) throw new ApiError(`${field} is required`);
	if (value.length > max) throw new ApiError(`${field} is longer than ${max} characters`);
	return value.trim();
}

/**
 * A row as the public sees it.
 *
 * The author's full public key never leaves the server: it goes out as a derived
 * handle, or the display name they chose. Publishing the key would let anyone
 * correlate every post by that identity across the whole site in one pass, which is
 * the fingerprinting problem made trivial.
 */
/**
 * How an author is described to everyone else.
 *
 * THE HANDLE IS ALWAYS PRESENT. This used to return `display_name ?? handle`, so a
 * chosen name REPLACED the derived one — which made impersonation a single field
 * update from any identity at trust zero: set your name to `anon-dp5d` and you are
 * that person, set it to "DeepTunisia Moderator" and you are us.
 *
 * The handle is derived from a public key. It cannot be claimed, cannot collide, and
 * is the only part of this that is true rather than asserted. So it is returned
 * alongside the name rather than under it, and the interface shows both. Two people
 * who choose the same name are still visibly two people.
 *
 * `name` and `note` are claims, and the caller is expected to render them as claims.
 */
/** The author's own labels, read at write time so they can be snapshotted. */
async function selfLabels(db: Db, pubkey: string) {
	const row = await db
		.prepare('SELECT display_name, self_description FROM identities WHERE pubkey = ?')
		.bind(pubkey)
		.first<{ display_name: string | null; self_description: string | null }>();
	return { name: row?.display_name ?? null, note: row?.self_description ?? null };
}

async function publicAuthor(
	db: Db,
	pubkey: string,
	snapshot?: { name?: string | null; note?: string | null }
) {
	const handle = await handleFor(pubkey);
	if (snapshot) {
		return { handle, name: snapshot.name ?? null, note: snapshot.note ?? null };
	}
	const row = await db
		.prepare('SELECT display_name, self_description FROM identities WHERE pubkey = ?')
		.bind(pubkey)
		.first<{ display_name: string | null; self_description: string | null }>();
	return { handle, name: row?.display_name ?? null, note: row?.self_description ?? null };
}

/**
 * A proposal with everything a reviewer, or anyone else, needs to judge it.
 *
 * The author is a handle, never a key — the same rule as posts. The review history
 * is included in full rather than just the latest decision, because "rejected once,
 * accepted on appeal with this reasoning" is the part that makes the process
 * auditable rather than merely public.
 */
async function expandPr(db: Db, pr: any) {
	const [changes, sources, reviews] = await Promise.all([
		db.prepare('SELECT field, old_value, new_value FROM pr_changes WHERE pr_id = ?').bind(pr.id).all<any>(),
		db.prepare('SELECT source_id, url, title, note FROM pr_sources WHERE pr_id = ?').bind(pr.id).all<any>(),
		db.prepare('SELECT reviewer, decision, reason, created_at FROM pr_reviews WHERE pr_id = ? ORDER BY created_at').bind(pr.id).all<any>()
	]);

	return {
		id: pr.id,
		status: pr.status,
		operation: pr.operation,
		target_type: pr.target_type,
		target_id: pr.target_id,
		reason: pr.reason,
		created_at: pr.created_at,
		updated_at: pr.updated_at,
		applied_at: pr.applied_at,
		applied_sha: pr.applied_sha,
		from_thread: pr.from_thread,
		author: await publicAuthor(db, pr.created_by, {
			name: pr.author_name,
			note: pr.author_note
		}),
		changes: changes.results,
		sources: sources.results.filter((s: any) => s.source_id || s.url),
		reviews: await Promise.all(
			reviews.results.map(async (r: any) => ({
				decision: r.decision,
				reason: r.reason,
				created_at: r.created_at,
				reviewer: await publicAuthor(db, r.reviewer)
			}))
		)
	};
}

export async function handle(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, '') || '/';
	const now = Date.now();

	try {
		// ---- reads: no identity, no rate limit, nothing recorded -------------

		if (request.method === 'GET' && path === '/api/threads') {
			const targetType = url.searchParams.get('target_type');
			const targetId = url.searchParams.get('target_id');
			const sort = (url.searchParams.get('sort') ?? 'trending') as Sort;

			const where = targetType && targetId ? 'WHERE target_type = ? AND target_id = ?' : '';
			const stmt = env.DB.prepare(
				`SELECT t.*, (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id) AS post_count,
					(SELECT COUNT(*) FROM votes v WHERE v.target_type = 'thread' AND v.target_id = t.id AND v.value = 1) AS upvotes,
					(SELECT COUNT(*) FROM votes v WHERE v.target_type = 'thread' AND v.target_id = t.id AND v.value = -1) AS downvotes
				 FROM threads t ${where}`
			);
			const rows = (await (where ? stmt.bind(targetType, targetId) : stmt).all<any>()).results;

			const items = await Promise.all(
				rows.map(async (t) => ({
					id: t.id,
					title: t.title,
					kind: t.kind,
					target_type: t.target_type,
					target_id: t.target_id,
					created_at: t.created_at,
					author: await publicAuthor(env.DB, t.created_by, {
						name: t.author_name,
						note: t.author_note
					}),
					post_count: t.post_count,
					upvotes: t.upvotes,
					downvotes: t.downvotes,
					removed: Boolean(t.removed_at),
					removed_reason: t.removed_reason ?? null
				}))
			);
			return json({ items: rank(items as any, sort, now) });
		}

		if (request.method === 'GET' && path === '/api/mentions') {
			const postIds = (url.searchParams.get('posts') ?? '').split(',').filter(Boolean).slice(0, 100);
			if (!postIds.length) return json({ items: [] });
			const placeholders = postIds.map(() => '?').join(',');
			/*
			 * The offsets are part of the answer, not an internal detail.
			 *
			 * A mention is an annotation over a span of the body — that is the whole
			 * storage model, and it is why the post text stays plain prose that reads
			 * correctly to anything which never loads this table. Returning the link
			 * without the span told the renderer that a post mentions Bourguiba
			 * somewhere and left it to guess where, so the client could only ever
			 * render the body unannotated.
			 */
			const rows = (
				await env.DB.prepare(
					`SELECT post_id, entity_id, entity_type, start_offset AS start, end_offset AS end
					 FROM post_entities
					 WHERE post_id IN (${placeholders}) AND confirmed = 1
					 ORDER BY post_id, start_offset`
				)
					.bind(...postIds)
					.all<any>()
			).results;
			return json({ items: rows });
		}

		if (request.method === 'GET' && path === '/api/posts') {
			const threadId = url.searchParams.get('thread_id');
			if (!threadId) throw new ApiError('thread_id is required');

			// R5: bounded page + opaque keyset cursor. Reads are deliberately
			// unthrottled, so an unbounded response was a free amplification vector;
			// a page cap keeps any single fetch small and the client walks the
			// cursor. Cursor = base64url(created_at:id), so it stays stable while
			// new posts arrive and nothing is skipped.
			const PAGE = 200;
			const cursorRaw = url.searchParams.get('cursor');
			let after = { created_at: 0, id: '' };
			if (cursorRaw) {
				const [c, i] = Buffer.from(cursorRaw, 'base64url').toString('utf8').split(':');
				after = { created_at: Number(c) || 0, id: i ?? '' };
			}

			const rows = (
				await env.DB.prepare(
					`SELECT * FROM posts
					 WHERE thread_id = ? AND (created_at > ? OR (created_at = ? AND id > ?))
					 ORDER BY created_at, id LIMIT ?`
				)
					.bind(threadId, after.created_at, after.created_at, after.id, PAGE + 1)
					.all<any>()
			).results;
			const hasMore = rows.length > PAGE;
			const page = hasMore ? rows.slice(0, PAGE) : rows;
			const last = page[page.length - 1];
			const next_cursor =
				hasMore && last ? Buffer.from(`${last.created_at}:${last.id}`).toString('base64url') : null;

			const items = await Promise.all(
				page.map(async (p) => ({
					id: p.id,
					parent_id: p.parent_id,
					// A removed post keeps its place in the thread. Replies to it would
					// otherwise become unreadable, and a silent gap is indistinguishable
					// from censorship to everyone reading afterwards.
					body: p.removed_at ? null : p.body,
					removed: Boolean(p.removed_at),
					removed_reason: p.removed_reason ?? null,
					created_at: p.created_at,
					author: await publicAuthor(env.DB, p.created_by, {
						name: p.author_name,
						note: p.author_note
					}),
					upvotes: p.upvotes,
					downvotes: p.downvotes
				}))
			);
			return json({ items, next_cursor });
		}

		/*
		 * Proposals are public while pending, per section 8 of the spec. What is
		 * being changed, why, on what evidence, and who decided — all readable
		 * without an identity. Private identity, public process.
		 */
		if (request.method === 'GET' && path === '/api/prs') {
			const status = url.searchParams.get('status');
			const targetId = url.searchParams.get('target_id');

			const clauses: string[] = [];
			const binds: unknown[] = [];
			if (status) {
				clauses.push('status = ?');
				binds.push(status);
			}
			if (targetId) {
				clauses.push('target_id = ?');
				binds.push(targetId);
			}
			const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

			const stmt = env.DB.prepare(`SELECT * FROM prs ${where} ORDER BY created_at DESC`);
			const rows = (await (binds.length ? stmt.bind(...binds) : stmt).all<any>()).results;

			const items = await Promise.all(rows.map((pr) => expandPr(env.DB, pr)));
			return json({ items });
		}

		/*
		 * The moderation queue, ordered by how many DISTINCT people objected.
		 *
		 * Readable by anyone. A queue that only moderators can see is a queue nobody
		 * can audit, and on a site whose subject is what powerful people did quietly,
		 * a private list of what is being considered for removal is the wrong shape.
		 * It exposes what was reported and why — not who reported it.
		 */
		if (request.method === 'GET' && path === '/api/queue') {
			const items = await moderationQueue(env.DB);
			const enriched = await Promise.all(
				items.map(async (q) => {
					const [type, id] = q.target.split(':');
					const row =
						type === 'post'
							? await env.DB.prepare('SELECT body, removed_at, thread_id FROM posts WHERE id = ?').bind(id).first<any>()
							: await env.DB.prepare('SELECT title AS body, removed_at FROM threads WHERE id = ?').bind(id).first<any>();
					return {
						...q,
						target_type: type,
						target_id: id,
						excerpt: row?.removed_at ? null : (row?.body ?? '').slice(0, 240),
						removed: Boolean(row?.removed_at),
						thread_id: row?.thread_id ?? id
					};
				})
			);
			return json({ items: enriched });
		}

		if (request.method === 'GET' && path === '/api/pr') {
			const prId = url.searchParams.get('id');
			if (!prId) throw new ApiError('id is required');
			const pr = await env.DB.prepare('SELECT * FROM prs WHERE id = ?').bind(prId).first<any>();
			if (!pr) throw new ApiError('no such proposal', 404);
			return json(await expandPr(env.DB, pr));
		}

		// ---- writes: signed, rate limited, capability checked ----------------

		if (request.method !== 'POST') return json({ error: 'not found' }, 404);

		const payload = (await request.json()) as { action?: SignedAction; data?: any };
		if (!payload?.action) throw new ApiError('this action must be signed');

		await sweep(env.DB, now);
		const identity = await authenticate(env, request, payload.action, now);
		const can = capabilitiesFor(identity);
		// R6: the trust-level flag once advertised `moderate` to identities the
		// server would 403 on sight. Moderation is authorized by the MODERATORS key
		// list and by nothing else; the capability must say so.
		can.moderate = isModerator(env, identity.pubkey);
		const data = payload.data ?? {};

		// The signed body binds the signature to what is being asked for. Without
		// this a signature captured from one action could authorise a different one.
		if (payload.action.body !== JSON.stringify({ path, data })) {
			throw new ApiError('the signature does not cover this request');
		}

		if (path === '/api/thread') {
			if (!can.createThread) throw new ApiError('this identity cannot open threads', 403);
			await limit(env, request, 'thread', now);

			/*
			 * The per-identity daily allowance, which nothing used to enforce.
			 *
			 * `capabilitiesFor` has published `threadsPerDay` since the first version and
			 * no code read it: the only limit was `LIMITS.thread`, keyed by a hash of the
			 * client address and identical for everybody. So the capability object told
			 * the interface one thing while the server did another, and lowering the gate
			 * for new identities would have handed every one of them five a day.
			 *
			 * Both limits earn their place and neither replaces the other. The address
			 * bucket is what costs a flooder holding many keys; this is what costs one
			 * key. Counted from the threads themselves rather than a counter, because a
			 * counter can drift and the rows cannot.
			 */
			const allowance = can.threadsPerDay;
			const since = now - 86_400_000;
			const mine = await env.DB.prepare(
				'SELECT COUNT(*) AS n FROM threads WHERE created_by = ? AND created_at > ?'
			)
				.bind(identity.pubkey, since)
				.first<{ n: number }>();
			if ((mine?.n ?? 0) >= allowance) {
				throw new RateLimitError(
					allowance === 1
						? 'a new identity may open one thread a day — reply to an existing one, or come back tomorrow'
						: `that is ${allowance} threads today — come back tomorrow`,
					86_400_000
				);
			}

			const targetType = requireString(data.target_type, 'target_type', 40);
			if (!TARGET_TYPES.includes(targetType)) throw new ApiError('unknown target_type');
			// R4: a thread pinned to the graph must name a real entity. The local
			// server validates against the built index (env.ENTITY_IDS); without it
			// (the Worker until an asset binding is wired) typed targets are accepted
			// by format only and the client's own index check is the guard.
			if (targetType !== 'open' && env.ENTITY_IDS) {
				const target = requireString(data.target_id, 'target_id', 120);
				if (!env.ENTITY_IDS.has(target)) {
					throw new ApiError(`no such ${targetType} in the graph`, 404);
				}
			}
			const kind = data.kind ?? 'discussion';
			if (!THREAD_KINDS.includes(kind)) throw new ApiError('unknown kind');

			const threadId = id();
			const who = await selfLabels(env.DB, identity.pubkey);
			await env.DB.prepare(
				`INSERT INTO threads (id, target_type, target_id, title, created_at, created_by, author_name, author_note, kind)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(
					threadId,
					targetType,
					data.target_id ?? null,
					requireString(data.title, 'title', MAX_TITLE),
					now,
					identity.pubkey,
					who.name,
					who.note,
					kind
				)
				.run();

			return json({ id: threadId });
		}

		if (path === '/api/post') {
			// Layered, per section 13: none of these is relied on alone, and none of
			// them is visible to somebody writing an ordinary comment.
			checkHoneypot(data);
			await limit(env, request, 'comment', now);
			const body = requireString(data.body, 'body', MAX_BODY);

			// Capability before throttling: "you may not do this" and "not so fast" are
			// different answers, and a caller acts differently on each.
			if (countLinks(body) > 0 && !can.postLinks) {
				throw new ApiError('new identities cannot post links yet', 403);
			}
			checkLinkCount(body);

			/*
			 * The target is validated before the flood checks.
			 *
			 * Otherwise a post to a thread that does not exist comes back as "slow
			 * down" whenever the caller happened to post recently, which sends them
			 * off fixing the wrong problem. Rate limiting has already run, so this
			 * costs a flooder nothing they had not already paid for.
			 */
			const thread = await env.DB.prepare('SELECT id FROM threads WHERE id = ?')
				.bind(data.thread_id)
				.first();
			if (!thread) throw new ApiError('no such thread', 404);

			const recent = (
				await env.DB.prepare(
					'SELECT body, created_at FROM posts WHERE created_by = ? ORDER BY created_at DESC LIMIT 5'
				)
					.bind(identity.pubkey)
					.all<any>()
			).results;

			// A floor between consecutive posts, distinct from the hourly limit, which
			// allows a burst inside its window. Nobody composes two sentences about a
			// decree in the same second.
			checkInterval(recent[0]?.created_at ?? null, now);

			if (isDuplicate(body, recent.map((r: any) => r.body))) {
				throw new ApiError('you have just posted this');
			}

			const postId = id();
			/*
			 * The author's labels are copied onto the post, not looked up when it is
			 * read. Reading them live means renaming yourself to "lawyer" silently
			 * re-labels everything you have ever written, back to the first post —
			 * re-weighting arguments people have already read and answered. What
			 * somebody claimed to be when they said it is part of what they said.
			 */
			const who = await selfLabels(env.DB, identity.pubkey);
			// R4: a reply must point at a post in the SAME thread. A cross-thread
			// parent would render a reply whose lineage leaves the room it is in.
			if (data.parent_id) {
				const parent = await env.DB.prepare('SELECT thread_id FROM posts WHERE id = ?')
					.bind(data.parent_id)
					.first<{ thread_id: string }>();
				if (!parent) throw new ApiError('no such parent post', 404);
				if (parent.thread_id !== data.thread_id) throw new ApiError('a reply must stay in its thread', 400);
			}
			await env.DB.prepare(
				`INSERT INTO posts (id, thread_id, parent_id, body, created_at, created_by, author_name, author_note)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(
					postId,
					data.thread_id,
					data.parent_id ?? null,
					body,
					now,
					identity.pubkey,
					who.name,
					who.note
				)
				.run();

			/*
			 * Mentions arrive with the post, not after it.
			 *
			 * They were briefly a follow-up call per mention, which is wrong twice
			 * over. Each one consumed a `comment` rate-limit unit, so a new identity —
			 * five comments an hour — was throttled by writing one sentence that named
			 * four people, and the refusal named the wrong cause. And a post whose
			 * annotations failed separately would sit in the thread with some of its
			 * links and not others, with nothing recording which.
			 *
			 * One signed action, one rate-limit unit, one outcome. `/api/mention`
			 * remains for what it was built for: a human confirming a suggested link
			 * on a post that already exists, which genuinely is a later, separate act.
			 */
			const spans = Array.isArray(data.mentions) ? data.mentions.slice(0, 32) : [];
			for (const m of spans) {
				const entityId = typeof m?.entity_id === 'string' ? m.entity_id.slice(0, 120) : '';
				const start = Number(m?.start);
				const end = Number(m?.end);
				// Silently skip a malformed span rather than refusing the post. The body
				// is what the author wrote; an annotation that will not parse is our
				// problem to drop, not a reason to lose their text.
				if (!entityId || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
					continue;
				}
				if (start < 0 || end > body.length) continue;
				await env.DB.prepare(
					`INSERT OR REPLACE INTO post_entities
					 (post_id, entity_id, entity_type, start_offset, end_offset, confirmed, created_by, created_at)
					 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
				)
					.bind(postId, entityId, 'graph', start, end, identity.pubkey, now)
					.run();
			}

			await env.DB.prepare('UPDATE identities SET posts_count = posts_count + 1 WHERE pubkey = ?')
				.bind(identity.pubkey)
				.run();

			return json({ id: postId });
		}

		if (path === '/api/vote') {
			await limit(env, request, 'vote', now);
			const value = data.value === 1 ? 1 : data.value === -1 ? -1 : null;
			if (value === null) throw new ApiError('a vote is 1 or -1');
			const targetType = data.target_type === 'thread' ? 'thread' : 'post';

			// R4: a vote must point at something that exists. An orphan vote row is
			// harmless to the tally but is a link that resolves nowhere — the same
			// shape of broken as a query parameter nothing reads.
			const target =
				targetType === 'thread'
					? await env.DB.prepare('SELECT id FROM threads WHERE id = ?').bind(data.target_id).first()
					: await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(data.target_id).first();
			if (!target) throw new ApiError(`no such ${targetType}`, 404);

			// One vote per identity per target, enforced by the primary key rather
			// than by remembering to check.
			const existing = await env.DB.prepare(
				'SELECT value FROM votes WHERE target_type = ? AND target_id = ? AND identity = ?'
			)
				.bind(targetType, data.target_id, identity.pubkey)
				.first<{ value: number }>();

			if (existing?.value === value) return json({ ok: true, unchanged: true });

			await env.DB.prepare(
				`INSERT INTO votes (target_type, target_id, identity, value, created_at)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(target_type, target_id, identity) DO UPDATE SET value = excluded.value`
			)
				.bind(targetType, data.target_id, identity.pubkey, value, now)
				.run();

			if (targetType === 'post') {
				const up = value === 1 ? 1 : 0;
				const down = value === -1 ? 1 : 0;
				const undoUp = existing?.value === 1 ? 1 : 0;
				const undoDown = existing?.value === -1 ? 1 : 0;
				await env.DB.prepare(
					'UPDATE posts SET upvotes = upvotes + ? - ?, downvotes = downvotes + ? - ? WHERE id = ?'
				)
					.bind(up, undoUp, down, undoDown, data.target_id)
					.run();
			}
			return json({ ok: true });
		}

		if (path === '/api/report') {
			await limit(env, request, 'report', now);
			const reason = requireString(data.reason, 'reason', 40);
			if (!REPORT_REASONS.includes(reason)) throw new ApiError('unknown report reason');
			const targetType = data.target_type === 'thread' ? 'thread' : 'post';

			// R4: a report must name an existing post or thread.
			const target =
				targetType === 'thread'
					? await env.DB.prepare('SELECT id FROM threads WHERE id = ?').bind(data.target_id).first()
					: await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(data.target_id).first();
			if (!target) throw new ApiError(`no such ${targetType}`, 404);

			// One report per identity per target: filing fourteen is one opinion, and
			// treating it as fourteen would hand any single user a hide button.
			await env.DB.prepare(
				`INSERT INTO reports (id, target_type, target_id, reporter, reason, details, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(target_type, target_id, reporter) DO UPDATE SET reason = excluded.reason`
			)
				.bind(
					id(),
					data.target_type === 'thread' ? 'thread' : 'post',
					data.target_id,
					identity.pubkey,
					reason,
					typeof data.details === 'string' ? data.details.slice(0, 2000) : null,
					now
				)
				.run();

			// Nothing is hidden here. The report enters a queue a human reads.
			return json({ ok: true, queued: true });
		}

		/*
		 * Confirmed entity mentions (Phase 4).
		 *
		 * A human confirms; nothing is linked automatically. `confirmed` and
		 * `created_by` exist so a future suggester can be MEASURED against human
		 * decisions rather than trusted — the data model supports automation without
		 * anyone having paid for it yet.
		 *
		 * The suggestions themselves come from src/lib/match.ts, which is
		 * deterministic and has no model behind it. Its refusal to match on a surname
		 * alone matters more than anything it does match: that rule exists because a
		 * surname-only match once linked a finance minister to a story about solar
		 * batteries, and a confidently wrong link between a named person and an
		 * allegation is manufactured insinuation.
		 */
		if (path === '/api/mention') {
			await limit(env, request, 'comment', now);
			const postId = requireString(data.post_id, 'post_id', 64);
			const entityId = requireString(data.entity_id, 'entity_id', 120);

			// The post must exist before anything else is judged — a mention of a
			// missing post is "no such post", whatever its offsets claim.
			const post = await env.DB.prepare('SELECT created_by FROM posts WHERE id = ?').bind(postId).first<any>();
			if (!post) throw new ApiError('no such post', 404);

			const start = Number(data.start_offset ?? 0);
			const end = Number(data.end_offset ?? 0);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
				throw new ApiError('a mention needs valid offsets', 400);
			}

			// Only the post's author or a moderator may CONFIRM a mention (spec
			// §15.2). Everyone else proposes: their span is recorded unconfirmed and
			// surfaced to the author as a suggestion. `confirmed` once meant "the
			// writer of this call clicked it", which is what a human-confirmation
			// flag must never mean.
			const canConfirm = post.created_by === identity.pubkey || isModerator(env, identity.pubkey);
			const existing = await env.DB.prepare(
				'SELECT confirmed FROM post_entities WHERE post_id = ? AND entity_id = ? AND start_offset = ?'
			)
				.bind(postId, entityId, start)
				.first<{ confirmed: number }>();

			// A confirmed span is a human decision; nobody else may clobber it.
			if (existing?.confirmed === 1 && !canConfirm) {
				throw new ApiError(
					'this mention is already confirmed — only the post author or a moderator can change it',
					409
				);
			}

			// Deterministic upsert: for unconfirmed spans the newest writer wins
			// (ordered by created_at, then creator); a confirmed span is replaced
			// only by the author or a moderator. INSERT OR REPLACE never runs here —
			// it used to overwrite a confirmed span with a stranger's row.
			await env.DB.prepare(
				`INSERT INTO post_entities
				 (post_id, entity_id, entity_type, start_offset, end_offset, confirmed, created_by, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(post_id, entity_id, start_offset) DO UPDATE SET
				   entity_type = excluded.entity_type,
				   end_offset = excluded.end_offset,
				   confirmed = excluded.confirmed,
				   created_by = excluded.created_by,
				   created_at = excluded.created_at`
			)
				.bind(
					postId,
					entityId,
					requireString(data.entity_type, 'entity_type', 40),
					start,
					end,
					canConfirm ? 1 : 0,
					identity.pubkey,
					now
				)
				.run();

			return json({ ok: true, confirmed: canConfirm ? 1 : 0 });
		}

		/*
		 * A chosen name and a self-declared standing.
		 *
		 * Both optional, both a correlation risk the interface states before either is
		 * set, and both refusable — `cleanLabel` rejects anything that would let a
		 * claim pass as something this site granted. What it cannot do is make the
		 * claim true, which is why neither field ever renders where the derived handle
		 * belongs. See the note on `publicAuthor`.
		 *
		 * Changing these does not change anything already written: posts, threads and
		 * proposals carry the labels that were in force when they were made.
		 */
		if (path === '/api/name') {
			const name = cleanLabel(data.display_name, 'name');
			const note = cleanLabel(data.self_description, 'note');
			await env.DB.prepare(
				'UPDATE identities SET display_name = ?, self_description = ? WHERE pubkey = ?'
			)
				.bind(name, note, identity.pubkey)
				.run();
			return json({
				ok: true,
				handle: await handleFor(identity.pubkey),
				name,
				note
			});
		}

		if (path === '/api/whoami') {
			const me = await publicAuthor(env.DB, identity.pubkey);
			return json({
				handle: me.handle,
				name: me.name,
				note: me.note,
				trust_level: identity.trust_level,
				can
			});
		}

		// ---- proposed changes ------------------------------------------------

		if (path === '/api/pr') {
			if (!can.createPr) throw new ApiError('proposing graph changes needs an established identity', 403);
			await limit(env, request, 'pr', now);

			const operation = requireString(data.operation, 'operation', 40);
			if (!PR_OPERATIONS.includes(operation)) throw new ApiError('unknown operation');
			const reason = requireString(data.reason, 'reason', 2000);
			const targetType = requireString(data.target_type, 'target_type', 40);
			if (!TARGET_TYPES.includes(targetType)) throw new ApiError('unknown target_type');

			const changes = Array.isArray(data.changes) ? data.changes : [];
			if (!changes.length) throw new ApiError('a proposal must say what should change');
			if (changes.length > 20) throw new ApiError('too many changes in one proposal — split it');

			const prId = id();
			const prAuthor = await selfLabels(env.DB, identity.pubkey);
			await env.DB.prepare(
				`INSERT INTO prs (id, created_by, author_name, author_note, created_at, updated_at, target_type, target_id, operation, reason, from_thread)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(
					prId,
					identity.pubkey,
					prAuthor.name,
					prAuthor.note,
					now,
					now,
					targetType,
					data.target_id ?? null,
					operation,
					reason,
					data.from_thread ?? null
				)
				.run();

			for (const c of changes) {
				await env.DB.prepare(
					'INSERT INTO pr_changes (id, pr_id, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
				)
					.bind(
						id(),
						prId,
						requireString(c.field, 'field', 80),
						typeof c.old_value === 'string' ? c.old_value.slice(0, 4000) : null,
						typeof c.new_value === 'string' ? c.new_value.slice(0, 4000) : null
					)
					.run();
			}

			for (const s of Array.isArray(data.sources) ? data.sources.slice(0, 20) : []) {
				if (!s?.source_id && !s?.url) continue;
				await env.DB.prepare(
					'INSERT OR IGNORE INTO pr_sources (pr_id, source_id, url, title, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
				)
					.bind(
						prId,
						s.source_id ?? '',
						s.url ?? '',
						typeof s.title === 'string' ? s.title.slice(0, 300) : null,
						typeof s.note === 'string' ? s.note.slice(0, 1000) : null,
						now
					)
					.run();
			}

			return json({ id: prId });
		}

		if (path === '/api/pr/review') {
			if (!isModerator(env, identity.pubkey)) throw new ApiError('not a reviewer', 403);

			const decision = requireString(data.decision, 'decision', 40);
			if (!PR_DECISIONS.includes(decision)) throw new ApiError('unknown decision');
			const reason = requireString(data.reason, 'reason', 2000);

			const pr = await env.DB.prepare('SELECT * FROM prs WHERE id = ?').bind(data.pr_id).first<any>();
			if (!pr) throw new ApiError('no such proposal', 404);
			if (pr.status === 'applied') throw new ApiError('this proposal has already been written into the graph');

			/*
			 * Rule 2 of AGENTS.md: every claim carries a source. A proposal with no
			 * evidence may be filed and discussed, but accepting it would queue an
			 * unsourced claim for the graph, which the build would reject anyway. Better
			 * to refuse it here, where the reason can be explained to the person who
			 * filed it.
			 */
			if (decision === 'accept') {
				const evidence = await env.DB.prepare('SELECT COUNT(*) AS n FROM pr_sources WHERE pr_id = ?')
					.bind(pr.id)
					.first<any>();
				if (!evidence?.n) {
					throw new ApiError('this proposal cites no evidence — ask for it rather than accepting');
				}
			}

			const status =
				decision === 'accept' ? 'accepted' : decision === 'reject' ? 'rejected' : decision === 'needs-evidence' ? 'needs-evidence' : 'under-review';

			await env.DB.prepare('UPDATE prs SET status = ?, updated_at = ? WHERE id = ?')
				.bind(status, now, pr.id)
				.run();
			await env.DB.prepare(
				'INSERT INTO pr_reviews (id, pr_id, reviewer, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
				.bind(id(), pr.id, identity.pubkey, decision, reason, now)
				.run();

			// An accepted proposal is credit to whoever filed it, which is what moves
			// them toward being able to file more.
			if (decision === 'accept') {
				await env.DB.prepare('UPDATE identities SET prs_accepted = prs_accepted + 1 WHERE pubkey = ?')
					.bind(pr.created_by)
					.run();
			}

			return json({ ok: true, status });
		}

		if (path === '/api/pr/withdraw') {
			const pr = await env.DB.prepare('SELECT * FROM prs WHERE id = ?').bind(data.pr_id).first<any>();
			if (!pr) throw new ApiError('no such proposal', 404);
			if (pr.created_by !== identity.pubkey) throw new ApiError('only the author can withdraw a proposal', 403);
			if (pr.status === 'applied') throw new ApiError('this has already been written into the graph');

			await env.DB.prepare("UPDATE prs SET status = 'withdrawn', updated_at = ? WHERE id = ?")
				.bind(now, pr.id)
				.run();
			return json({ ok: true });
		}

		/**
		 * Marking a proposal as written into the graph.
		 *
		 * Called by the editorial tool after the emitter has applied it and git has
		 * the commit. The community database never edits the graph; it records that
		 * the graph now agrees with this proposal, and the commit sha is what lets
		 * anyone check that claim.
		 */
		if (path === '/api/pr/applied') {
			if (!isModerator(env, identity.pubkey)) throw new ApiError('not a reviewer', 403);

			const pr = await env.DB.prepare('SELECT * FROM prs WHERE id = ?').bind(data.pr_id).first<any>();
			if (!pr) throw new ApiError('no such proposal', 404);
			if (pr.status !== 'accepted') throw new ApiError('only an accepted proposal can be applied');

			await env.DB.prepare("UPDATE prs SET status = 'applied', applied_at = ?, applied_sha = ?, updated_at = ? WHERE id = ?")
				.bind(now, requireString(data.sha, 'sha', 64), now, pr.id)
				.run();
			return json({ ok: true });
		}

		// ---- moderation ------------------------------------------------------

		if (path === '/api/moderate') {
			if (!isModerator(env, identity.pubkey)) throw new ApiError('not a moderator', 403);

			const action = requireString(data.action, 'action', 40);
			const reason = requireString(data.reason, 'reason', 500);
			const targetType = data.target_type === 'thread' ? 'threads' : 'posts';

			if (action === 'remove' || action === 'restore') {
				const removing = action === 'remove';
				await env.DB.prepare(
					`UPDATE ${targetType} SET removed_at = ?, removed_by = ?, removed_reason = ? WHERE id = ?`
				)
					.bind(removing ? now : null, removing ? identity.pubkey : null, removing ? reason : null, data.target_id)
					.run();
			} else {
				throw new ApiError(`unknown moderation action "${action}"`);
			}

			// Every moderator action is logged, with a reason, append-only.
			await env.DB.prepare(
				`INSERT INTO moderation_actions (id, target_type, target_id, moderator, action, reason, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(id(), data.target_type ?? 'post', data.target_id, identity.pubkey, action, reason, now)
				.run();

			return json({ ok: true });
		}

		return json({ error: 'not found' }, 404);
	} catch (e) {
		if (e instanceof ApiError) return json({ error: e.message }, e.status);
		if (e instanceof IdentityError) return json({ error: e.message }, 401);
		if (e instanceof AbuseError) return json({ error: e.message }, 429);
		if (e instanceof RateLimitError) {
			return json({ error: e.message, retry_after_ms: e.retryAfterMs }, 429);
		}
		return json({ error: (e as Error).message }, 500);
	}
}

/** The moderation queue, ordered by distinct reporters. Reads nothing it should not. */
export async function moderationQueue(db: Db) {
	const rows = (
		await db.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY created_at").all<any>()
	).results;

	const grouped = new Map<string, any[]>();
	for (const r of rows) {
		const key = `${r.target_type}:${r.target_id}`;
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key)!.push(r);
	}

	return [...grouped.entries()]
		.map(([key, reports]) => ({
			target: key,
			pressure: reportPressure(reports.map((r) => ({ identity: r.reporter, created_at: r.created_at }))),
			reasons: [...new Set(reports.map((r) => r.reason))],
			reports: reports.length
		}))
		.sort((a, b) => b.pressure - a.pressure);
}
