import { CUTOFF, type Basis, type Layer } from './model';

/**
 * Tenure statistics per office.
 *
 * Extracted so the Atlas turnover panel and the /now view compute this the same
 * way. They answer different questions from the same numbers — Atlas asks which
 * offices churn, /now asks whether the person currently in one is unusual for it —
 * and if the two drifted apart the second would quietly start lying.
 *
 * Everything here is derived from position intervals alone: no weighting, no
 * editorial table. That is what makes it the most defensible figure the project
 * publishes, and it is worth keeping that way.
 */

/** Below this an office has too few holders for a median to mean anything. */
export const MIN_HOLDERS = 4;

export interface TenureStats {
	role: string;
	title: string;
	layer: Layer;
	/** Distinct people recorded in the post. */
	holders: number;
	/** How many of those records are interim or acting appointments. */
	acting: number;
	median: number;
	shortest: number;
	longest: number;
}

interface PositionLike {
	role: string;
	roleTitle: string;
	holder: string;
	layer: string;
	years: number;
	acting: boolean;
	basis: string;
	interval: { startEarliest: number; endLatest: number | null };
}

/**
 * Median rather than mean, because a single forty-year holder drags a mean
 * somewhere useless and these offices genuinely have both — the Grand Vizierate
 * and the Interior Ministry sit in the same table.
 */
export function median(sorted: number[]): number {
	if (sorted.length === 0) return 0;
	const mid = sorted.length / 2;
	return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function tenureByRole(positions: PositionLike[]): Map<string, TenureStats> {
	const byRole = new Map<string, PositionLike[]>();
	for (const p of positions) {
		(byRole.get(p.role) ?? byRole.set(p.role, []).get(p.role)!).push(p);
	}

	const out = new Map<string, TenureStats>();
	for (const [role, posts] of byRole) {
		const holders = new Set(posts.map((p) => p.holder)).size;
		const tenures = posts
			.map((p) => p.years)
			.filter((y) => y > 0)
			.sort((a, b) => a - b);
		if (holders < MIN_HOLDERS || tenures.length < MIN_HOLDERS) continue;

		out.set(role, {
			role,
			title: posts[0].roleTitle,
			layer: posts[0].layer as Layer,
			holders,
			acting: posts.filter((p) => p.acting).length,
			median: median(tenures),
			shortest: tenures[0],
			longest: tenures[tenures.length - 1]
		});
	}
	return out;
}

/**
 * Years a still-open position has been running as of `asOf`.
 *
 * Deliberately measured from the EARLIEST possible start. An office-holder's
 * elapsed time is the one number on the /now page a reader might quote, so it
 * should be the conservative end of the range rather than the flattering one.
 */
export function elapsedYears(startEarliest: number, asOf: number = CUTOFF): number {
	return Math.max(0, (asOf - startEarliest) / (365.2425 * 86_400_000));
}

/**
 * How current a still-open position actually is.
 *
 * These three are NOT interchangeable and the /now view must never merge them.
 * `ongoing` means the records say the person still holds the post. `last-verified`
 * means someone confirmed it on a date and nobody has confirmed it since — the
 * holder may well have changed. `unknown` means no end information exists at all.
 *
 * The distinction matters most exactly where the dataset is weakest: nearly every
 * senior security post falls in `last-verified`, so a page that rendered all three
 * as "current" would be most confidently wrong about the security apparatus, which
 * is the part of this map people would most want to rely on.
 */
export type Currency = 'ongoing' | 'last-verified' | 'unknown';

export function currencyOf(p: { interval: { status: string } }): Currency | null {
	const s = p.interval.status;
	return s === 'ongoing' || s === 'last-verified' || s === 'unknown' ? s : null;
}

/** True when a position has no recorded end — i.e. it is a candidate for "now". */
export function isOpen(p: { interval: { status: string } }): boolean {
	return currencyOf(p) !== null;
}

/**
 * Months since a `verified:` date, or null when there isn't one. Rendered so a
 * reader can discount a row themselves rather than trusting it uniformly.
 */
export function monthsSince(iso: string | null | undefined, asOf: number = CUTOFF): number | null {
	if (!iso) return null;
	const m = /^verified:(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(iso);
	if (!m) return null;
	const t = Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1);
	return Math.max(0, Math.round((asOf - t) / (30.44 * 86_400_000)));
}

export type { Basis };
