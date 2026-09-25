/**
 * The Agora operating mode.
 *
 * The discussion layer is implemented, but the public client must not be the
 * thing that closes it. A constant in `src/lib/agora-gate.ts` can hide the tab;
 * it cannot stop `POST /api/whoami` from minting an identity against the live
 * database. The server enforces the mode, and the client only reports it.
 *
 * Three modes, and the default is the closed one:
 *
 *   off        every `/api/*` route returns the same 404 before any database
 *              access, signature check, nonce write, or moderation action.
 *              This is the production mode for v0.1.3.
 *   read-only  the public GET reads are served; every write and every identity
 *              action is refused with the same 404. No new data is created.
 *   beta       the current signed API. The posting budget, ten-minute hold and
 *              petitions remain specified but unwired; public text must say so.
 *
 * An absent or unrecognised value resolves to `off`. Configuration is a runtime
 * decision — the Worker binding, or the local environment — never a built
 * constant, because a constant cannot be changed when a deployment needs to
 * close.
 */

export type CommunityMode = 'off' | 'read-only' | 'beta';

/**
 * The routes a reader may call in `read-only`. These are the public reads the
 * API already serves without identity: a thread list, annotations, posts, the
 * proposal register and the moderation queue. Everything else either writes or
 * mints an identity, and `POST /api/thread` and `POST /api/post` are reached
 * without a method guard in the handler, so the allowlist is by path and method
 * rather than "anything that is a GET".
 */
export const PUBLIC_READ_ROUTES: ReadonlySet<string> = new Set([
	'/api/threads',
	'/api/mentions',
	'/api/posts',
	'/api/prs',
	'/api/queue',
	'/api/pr'
]);

/** Resolve a raw configuration value. Absent or unrecognised is `off`. */
export function resolveMode(raw: unknown): CommunityMode {
	return raw === 'read-only' || raw === 'beta' ? raw : 'off';
}

/** True when the mode permits this exact public read. */
export function isPublicRead(method: string, path: string): boolean {
	return method === 'GET' && PUBLIC_READ_ROUTES.has(path);
}

/**
 * The one response `off` gives, and the one every refused route gives in
 * `read-only`. It is deliberately identical for every path and method: a
 * different body for a real route than for a missing one would tell a prober
 * which routes exist, and `no-store` keeps a cache from serving a stale 200
 * after the mode closes.
 */
export function modeUnavailable(): Response {
	return new Response(JSON.stringify({ error: 'not found' }), {
		status: 404,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}
