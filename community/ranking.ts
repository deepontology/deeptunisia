/**
 * Ranking.
 *
 * Section 15 of the spec, which is the load-bearing rule of the whole community
 * layer: downvotes affect position, never existence.
 *
 *   A coordinated group could otherwise mass-downvote legitimate investigative
 *   journalism.
 *
 * That is not hypothetical for a site about Tunisian officials. So there is no
 * threshold at which a post disappears, no score below which it stops being served,
 * and no automatic hiding of any kind. Reports route to a human queue; votes only
 * order a list. Keeping those two mechanisms apart is the difference between a
 * ranking system and a censorship weapon.
 *
 * Time-decay of the Hacker News family: a post's score is divided by its age raised
 * to a gravity exponent, so unpopular things sink rather than vanish and nothing has
 * to be deleted for the front page to stay current.
 */

export interface Rankable {
	created_at: number;
	upvotes: number;
	downvotes: number;
}

/** Higher sinks faster. 1.8 gives roughly a day of visibility to a well-received post. */
export const GRAVITY = 1.8;

/**
 * Two hours of grace before decay starts to bite, so a post is not buried by the
 * clock before anyone has had a chance to see it.
 */
export const AGE_OFFSET_HOURS = 2;

/**
 * The floor is the point of this function.
 *
 * Net score is clamped so that no amount of downvoting can drive a post arbitrarily
 * far down: a brigade can push something off the first page, which is a legitimate
 * expression of collective disinterest, but cannot bury it beyond reach. Without the
 * clamp, twenty accounts could make a sourced investigation unfindable while leaving
 * it technically undeleted, which is the same outcome dressed as a ranking.
 */
export const MIN_EFFECTIVE_SCORE = -5;

export function score(item: Rankable, now: number): number {
	const net = Math.max(item.upvotes - item.downvotes, MIN_EFFECTIVE_SCORE);
	const ageHours = Math.max(0, (now - item.created_at) / 3_600_000);
	return net / Math.pow(ageHours + AGE_OFFSET_HOURS, GRAVITY);
}

export type Sort = 'trending' | 'recent' | 'top';

export function rank<T extends Rankable>(items: T[], sort: Sort, now: number): T[] {
	const copy = [...items];
	if (sort === 'recent') return copy.sort((a, b) => b.created_at - a.created_at);
	if (sort === 'top') {
		return copy.sort((a, b) => b.upvotes - b.downvotes - (a.upvotes - a.downvotes));
	}
	return copy.sort((a, b) => score(b, now) - score(a, now));
}

/**
 * Report pressure, for ordering the moderation queue only.
 *
 * Weighted by how many DISTINCT identities reported, not how many reports arrived:
 * one person filing fourteen reports is one person's opinion, and treating it as
 * fourteen would hand any single user a hide button. It orders human attention and
 * nothing else — no threshold here hides, removes or downranks anything.
 */
export function reportPressure(reports: { identity: string; created_at: number }[]): number {
	return new Set(reports.map((r) => r.identity)).size;
}
