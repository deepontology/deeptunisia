/**
 * The posting budget.
 *
 * Implements docs/posting-limits.md. Every other limit in this codebase exists to
 * stop an attacker; this one does not. It exists because a post that took forty
 * seconds and a post that took forty minutes currently render identically, and the
 * whole project is an argument that things of different standing must never look the
 * same. It is therefore tuned against the reading experience, not against a bot, and
 * the anti-abuse benefit is a side effect that must never become the justification.
 *
 * TWO PROPERTIES THAT ARE NOT INCIDENTAL
 *
 * The budget falls on assertion, not on evidence: a contribution carrying a citation
 * costs half. An uncited assertion is a bill sent to the reader; a cited one comes
 * with its own receipt. That is the project's epistemology, in the rate limiter.
 *
 * And it is derived from the content tables, never from a counter. Counted rows
 * cannot drift — but more importantly `created_at` on a post is already public, so
 * deriving the budget from it stores no new fact about when an identity acted. A
 * `posts_this_week` column with a timestamp would be a last-seen field wearing a hat,
 * and Finding 4 of docs/anonymity-audit.md forbids one.
 */
import type { Db } from './db.ts';
import { TRUST } from './identity.ts';

export class BudgetError extends Error {
	constructor(
		message: string,
		readonly resetsInMs: number
	) {
		super(message);
	}
}

/**
 * A rolling week, not a calendar one.
 *
 * A daily budget manufactures a use-it-or-lose-it rush at midnight, which is exactly
 * the unconsidered posting this exists to prevent. A rolling window lets somebody
 * write when they have something to say and stay silent for four days without
 * forfeiting anything.
 */
export const WINDOW_MS = 7 * 86_400_000;

/**
 * How long a post waits between being submitted and being published.
 *
 * Not moderation, and nothing is reviewed in it. It is a pause, and it does the one
 * thing a budget cannot: it separates the decision to write from the decision to
 * publish. Most posts a person regrets are regretted within ten minutes.
 *
 * Nothing publishes them — visibility is derived from `created_at`, so there is no
 * scheduled job to fail and no `published_at` column that could disagree with it.
 */
export const HOLD_MS = 10 * 60_000;

/** A post shorter than this needs a citation to be worth everyone's attention. */
export const MIN_BODY = 280;

/**
 * Prices, in units.
 *
 * A thread costs roughly double a reply because it claims everyone's attention
 * rather than the attention of people already in the room — the same reasoning that
 * already puts proposals behind the tightest limit in `ratelimit.ts`.
 */
export const COST = {
	post: 2,
	postCited: 1,
	thread: 4,
	threadCited: 3
} as const;

export function costOf(kind: 'post' | 'thread', cited: boolean): number {
	if (kind === 'thread') return cited ? COST.threadCited : COST.thread;
	return cited ? COST.postCited : COST.post;
}

/**
 * Units per rolling week, by trust level.
 *
 * The top of the ladder is five times the bottom. It used to be twelve times — five
 * comments an hour against sixty. That compression is the point: standing should
 * unlock WHAT you may do, not how loudly you may do it. Links, threads, proposals
 * and moderation stay trust-gated in `capabilitiesFor`; only volume flattens.
 *
 * Configuration, not architecture. Expect to move these once real threads exist.
 */
export const ALLOWANCE: Record<number, number> = {
	[TRUST.NEW]: 4,
	[TRUST.BASIC]: 8,
	[TRUST.ESTABLISHED]: 14,
	[TRUST.TRUSTED]: 20
};

export function allowanceFor(trustLevel: number): number {
	return ALLOWANCE[trustLevel] ?? ALLOWANCE[TRUST.NEW];
}

export interface Spend {
	allowance: number;
	spent: number;
	remaining: number;
	/** When the oldest charge in the window falls out of it, freeing units. */
	resetsAt: number | null;
}

interface Charge {
	created_at: number;
	cost: number;
}

/**
 * What an identity has spent inside the window, read from what it actually wrote.
 *
 * Withdrawn posts are deleted rather than flagged, so a withdrawal refunds simply by
 * ceasing to be counted here. There is no refund path to get wrong.
 */
export async function spendFor(
	db: Db,
	pubkey: string,
	trustLevel: number,
	now: number
): Promise<Spend> {
	const since = now - WINDOW_MS;

	// Read separately rather than as one UNION: the two are priced differently, and a
	// union would have to carry a discriminator column purely so the sum could tell
	// them apart again.
	const posts = await db
		.prepare('SELECT created_at, cited FROM posts WHERE created_by = ? AND created_at > ?')
		.bind(pubkey, since)
		.all<{ created_at: number; cited: number }>();
	const threads = await db
		.prepare('SELECT created_at, cited FROM threads WHERE created_by = ? AND created_at > ?')
		.bind(pubkey, since)
		.all<{ created_at: number; cited: number }>();

	const charges: Charge[] = [
		...posts.results.map((r) => ({ created_at: r.created_at, cost: costOf('post', !!r.cited) })),
		...threads.results.map((r) => ({ created_at: r.created_at, cost: costOf('thread', !!r.cited) }))
	];

	const allowance = allowanceFor(trustLevel);
	const spent = charges.reduce((n, c) => n + c.cost, 0);
	const oldest = charges.length ? Math.min(...charges.map((c) => c.created_at)) : null;

	return {
		allowance,
		spent,
		remaining: Math.max(0, allowance - spent),
		resetsAt: oldest === null ? null : oldest + WINDOW_MS
	};
}

/**
 * Refuse, with the budget named rather than a throttle.
 *
 * `abuse.ts` already distinguishes "you may not do this" from "not so fast". This is
 * a third thing again and it is not a failure state: an identity told it is being
 * throttled will try again in a minute, and an identity told it has spent its week
 * will come back when it has something worth spending it on. Saying the wrong one
 * teaches the wrong behaviour.
 */
export function checkAffordable(spend: Spend, cost: number, now: number): void {
	if (spend.remaining >= cost) return;
	const resetsInMs = spend.resetsAt ? Math.max(0, spend.resetsAt - now) : WINDOW_MS;
	throw new BudgetError(
		spend.spent === 0
			? 'that is more than a week’s allowance in one go'
			: `that is your week — ${spend.spent} of ${spend.allowance} units used`,
		resetsInMs
	);
}

/**
 * Whether something counts as carrying evidence.
 *
 * Deliberately shallow: a well-formed http(s) URL, or an id shaped like one of the
 * graph's sources. It does NOT verify that the citation supports the claim, and it
 * must not — that is a language model, and the spec forbids one.
 *
 * Somebody will staple an irrelevant archive link to a reaction to halve its price.
 * They will, and the failure mode is a person producing cited posts. The citation is
 * stored and shown, so a bogus one is publicly visible and reportable, which is the
 * check that actually works.
 */
export function citationOf(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value) return null;
	if (value.length > 500) return null;
	if (/^[a-z][a-z0-9]*-[a-z0-9-]+$/i.test(value)) return value;
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

/** Whether a post has published yet. Derived, so nothing can disagree with it. */
export function isPublished(createdAt: number, now: number): boolean {
	return createdAt + HOLD_MS <= now;
}
