/**
 * Links from a record into Agora.
 *
 * This is the binding the whole extension exists for: every node and every
 * relationship is independently addressable, and each one carries a way to discuss
 * it and a way to propose changing it. Without it the discussion is a separate
 * site that happens to share a subject, which `docs/prior-art.md` concluded is
 * exactly what no existing forum platform gets right.
 *
 * Agora is a tab in this app, so these are ordinary internal routes. They were
 * briefly links to a second origin, which worked but made the two feel like
 * different products — and would have meant a second server learning which record
 * each reader was looking at.
 */

/** Graph objects that can carry a discussion. Mirrors the API's target_type check. */
export type CommunityTarget =
	| 'person'
	| 'institution'
	| 'role'
	| 'position'
	| 'relationship'
	| 'event'
	| 'source'
	// v0.0.2 record kinds — each record is an addressable claim, so each can be
	// the target of a thread or a proposed change (mirrors TARGET_TYPES in the API).
	| 'company'
	| 'contract'
	| 'licence'
	| 'declaration'
	| 'education';

function link(type: CommunityTarget, id: string, label?: string, propose = false): string {
	const params = new URLSearchParams({ target_type: type, target_id: id });
	if (label) params.set('label', label);
	if (propose) params.set('propose', '1');
	return `/agora?${params}`;
}

/** "What do people think or know about this?" */
export function discussUrl(type: CommunityTarget, id: string, label?: string): string {
	return link(type, id, label);
}

/**
 * "Should the knowledge graph change?"
 *
 * A separate destination on purpose. The two share identity, moderation and
 * provenance, but conflating them is how a forum thread becomes a source.
 */
export function proposeUrl(type: CommunityTarget, id: string, label?: string): string {
	return link(type, id, label, true);
}

/* ---------------------------------------------------------------------------
 * The shapes the API actually returns.
 *
 * These were `any` in the route, which meant `npm run check` — 0 errors, 0
 * warnings, enforced — was passing vacuously over the entire community client.
 * The strictest codebase in this repo had exactly one unchecked module, and it
 * was the one taking input from the public.
 *
 * Kept here rather than imported from `community/` because that directory is the
 * Worker: importing it into the atlas bundle would drag the server handler, its
 * Db interface and its SQL into a static site that must never depend on any of
 * them. This is a hand-maintained mirror, and `scripts/test-api.ts` is what keeps
 * it honest.
 * ------------------------------------------------------------------------- */

/** What kind of contribution a thread is. Not a truth claim. */
export type ThreadKind =
	| 'discussion'
	| 'question'
	| 'news'
	| 'investigation'
	| 'evidence'
	| 'correction'
	| 'opinion';

export type PrStatus =
	| 'pending'
	| 'under-review'
	| 'needs-evidence'
	| 'accepted'
	| 'rejected'
	| 'superseded'
	| 'withdrawn'
	| 'applied';

/**
 * How an author appears to everyone else.
 *
 * `handle` is derived from a public key and is always present: it cannot be claimed
 * by anyone else and two identities can never share one. `name` and `note` are
 * chosen, unchecked, and must never render where the handle belongs — the API used
 * to return the chosen name INSTEAD of the handle, which made impersonation a
 * single field update. See `agora/Author.svelte`.
 *
 * On a post, thread or proposal these are the values that were in force when it was
 * written, not the author's current ones.
 */
export interface AuthorRef {
	handle: string;
	name: string | null;
	note: string | null;
}

export interface Thread {
	id: string;
	title: string;
	kind: ThreadKind;
	target_type: CommunityTarget | 'open';
	target_id: string | null;
	created_at: number;
	author: AuthorRef;
	post_count: number;
	upvotes: number;
	downvotes: number;
	removed: boolean;
	removed_reason: string | null;
}

export interface Post {
	id: string;
	parent_id: string | null;
	/** Null when removed — the post keeps its place so replies stay readable. */
	body: string | null;
	removed: boolean;
	removed_reason: string | null;
	created_at: number;
	author: AuthorRef;
	upvotes: number;
	downvotes: number;
}

/**
 * A confirmed link from a span of a post to a record in the graph.
 *
 * `start`/`end` index the post body. They are the whole point: without them a
 * mention says only that a post refers to Bourguiba somewhere, and the renderer
 * cannot mark which words.
 */
export interface Mention {
	post_id: string;
	entity_id: string;
	entity_type: string;
	start: number;
	end: number;
}

export interface PrChange {
	field: string;
	old_value: string | null;
	new_value: string | null;
}

export interface PrSource {
	source_id: string | null;
	url: string | null;
	title: string | null;
	note: string | null;
}

export interface PrReview {
	decision: string;
	reason: string;
	created_at: number;
	/** Live, not a snapshot: a moderator is an office, so the current holder is the
	 * useful answer. Contributions snapshot; moderator actions do not. */
	reviewer: AuthorRef;
}

export interface Pr {
	id: string;
	status: PrStatus;
	operation: string;
	target_type: string;
	target_id: string | null;
	reason: string;
	created_at: number;
	updated_at: number;
	applied_at: number | null;
	applied_sha: string | null;
	from_thread: string | null;
	author: AuthorRef;
	changes: PrChange[];
	sources: PrSource[];
	reviews: PrReview[];
}

/** A reported item awaiting a moderator, ordered by pressure. */
export interface QueueItem {
	target: string;
	target_type: 'thread' | 'post';
	pressure: number;
	reasons: string[];
	removed: boolean;
	/** Null when the item is already removed. */
	excerpt: string | null;
}

export interface Capabilities {
	comment: boolean;
	vote: boolean;
	report: boolean;
	createThread: boolean;
	postLinks: boolean;
	createPr: boolean;
	moderate: boolean;
	commentsPerHour: number;
	threadsPerDay: number;
}

export interface ListResponse<T> {
	items: T[];
	/** Present when more items follow; base64url keyset cursor for /api/posts. */
	next_cursor?: string | null;
}
