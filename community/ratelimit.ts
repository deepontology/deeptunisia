/**
 * Rate limiting without retaining an identifier.
 *
 * Phase 2 needs per-network throttling; the naive implementation stores the client
 * IP and undoes the whole point of the design. Finding 3 of docs/anonymity-audit.md
 * is the alternative implemented here.
 *
 *   bucket = SHA-256( ip || daily_salt || pepper )
 *
 * The salt rotates every 24 hours, so yesterday's buckets cannot be correlated with
 * today's: the linkage window is bounded by construction rather than by a policy
 * somebody has to remember to enforce. The pepper is held outside the database, which
 * is what stops an attacker who obtains a dump from simply hashing all four billion
 * IPv4 addresses and reversing the lot — the address space is small enough that
 * without a secret this would be trivially reversible, and a hash that can be
 * reversed is just an IP with extra steps.
 *
 * Rows carry a counter and an expiry. Nothing accumulates.
 */

export interface Bucket {
	key: string;
	count: number;
	expires_at: number;
}

export class RateLimitError extends Error {
	constructor(
		message: string,
		readonly retryAfterMs: number
	) {
		super(message);
	}
}

const enc = new TextEncoder();

/** The salt for a given day. Rotating this is what bounds correlation. */
export function saltForDay(now: number): string {
	return String(Math.floor(now / 86_400_000));
}

/**
 * Bucket key for a client.
 *
 * `pepper` must come from the environment, never the database. If it is stored
 * alongside the buckets then obtaining the database obtains both, and the hash
 * protects nobody.
 */
export async function bucketKey(ip: string, pepper: string, now: number): Promise<string> {
	if (!pepper || pepper.length < 16) {
		throw new RateLimitError('rate-limit pepper is missing or too short', 0);
	}
	const material = `${ip}|${saltForDay(now)}|${pepper}`;
	const digest = await crypto.subtle.digest('SHA-256', enc.encode(material));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Limit {
	/** Maximum actions inside the window. */
	max: number;
	windowMs: number;
}

/**
 * Windows are per action, because the actions differ in cost to everyone else.
 *
 * Reading is unlimited and unmeasured: throttling readers would mean identifying
 * readers, and what someone reads here is the most sensitive thing about them.
 */
export const LIMITS: Record<string, Limit> = {
	comment: { max: 20, windowMs: 3_600_000 },
	thread: { max: 5, windowMs: 86_400_000 },
	vote: { max: 200, windowMs: 3_600_000 },
	report: { max: 10, windowMs: 3_600_000 },
	identity: { max: 5, windowMs: 86_400_000 },
	// Proposals cost a reviewer's attention, which is the scarcest thing here.
	pr: { max: 10, windowMs: 86_400_000 }
};

export interface BucketStore {
	get(key: string): Promise<Bucket | null>;
	put(bucket: Bucket): Promise<void>;
}

/**
 * Consume one unit, or throw with how long to wait.
 *
 * The counter is keyed by action as well as by client, so a flood of votes cannot
 * exhaust somebody's ability to report abuse.
 */
export async function consume(
	store: BucketStore,
	clientKey: string,
	action: keyof typeof LIMITS | string,
	now: number
): Promise<void> {
	const limit = LIMITS[action];
	if (!limit) throw new RateLimitError(`no rate limit defined for "${action}"`, 0);

	const key = `${action}:${clientKey}`;
	const existing = await store.get(key);

	if (!existing || existing.expires_at <= now) {
		await store.put({ key, count: 1, expires_at: now + limit.windowMs });
		return;
	}
	if (existing.count >= limit.max) {
		throw new RateLimitError(
			`too many ${action} actions — wait and try again`,
			existing.expires_at - now
		);
	}
	await store.put({ ...existing, count: existing.count + 1 });
}
