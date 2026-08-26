/**
 * Typed access to the news feed archive.
 *
 * ── Read this before using it ─────────────────────────────────────────────────
 *
 * **This is not project data and it carries no epistemic standing.** Everything in
 * `src/generated/` has been through the graph build: it has a source, a basis
 * (`documented` / `reported` / `inferred` / `unsubstantiated`) and a confidence
 * grade, and the build fails if any of those is missing. None of that is true of
 * anything here.
 *
 * A `FeedItem` is a headline somebody else published and a link to it. The project
 * has not read it, checked it, corroborated it or graded it, and makes no claim
 * that it is true or that it is false. It is not evidence for anything, it is not
 * counted in any published statistic, and it must never be rendered in a way that
 * lets a reader mistake it for a claim the project stands behind.
 *
 * The type below has no `basis` and no `confidence` field, and it is not an
 * oversight to add later: giving an unread headline the vocabulary of an assessed
 * claim would assert a judgement that was never made.
 *
 * Written by `scripts/fetch-feed.ts`; the separation is asserted by
 * `scripts/test-feed.ts`.
 */
import archive from '../../feed/feed.json';

/** One third-party headline. Ungraded, unsourced, unverified — by design. */
export interface FeedItem {
	/** Namespaced `feed:<outlet>:<hash>`. Never collides with an entity id. */
	id: string;
	/** Outlet display name, e.g. `Nawaat`. */
	outlet: string;
	/** The outlet's institution id in the graph, for attribution and linking. */
	outletId: string;
	/** The headline as published. No body text, no excerpt — deliberately. */
	title: string;
	/** Absolute https URL to the original. The only place the article can be read. */
	link: string;
	/** Publication instant, ISO 8601 UTC at seconds precision. */
	published: string;
	/** BCP 47 primary subtag (`ar`, `fr`, `en`), or `und` when undetermined. */
	lang: string;
}

/** Plain-language statement of what this is, carried inside the data file itself. */
export const feedNotice: string = archive.notice;

/** Hard ceiling on the archive; older items age out of it. */
export const feedCap: number = archive.cap;

/** The archive, newest first. */
export const feedItems: FeedItem[] = archive.items as FeedItem[];
