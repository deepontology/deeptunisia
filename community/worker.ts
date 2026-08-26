/**
 * The Cloudflare Worker entry point.
 *
 * One deployment serves the whole product. Static assets — the prerendered atlas —
 * are served by the platform without invoking this function at all; only /api
 * reaches the handler. That is what keeps the thing inside a free tier: reading the
 * map is not a Worker request, and a person clicking through forty entity cards
 * costs nothing. Only Agora activity counts.
 *
 * It also means the atlas keeps working if this code throws. The map is files.
 *
 * `handle()` is the same function the local server runs and the same one 73
 * assertions exercise — nothing here is production-only logic, because
 * production-only logic is logic nobody tested.
 */
import { handle, type Env as ApiEnv } from './api.ts';
import type { Db, Prepared } from './db.ts';

interface WorkerEnv {
	/** D1 binding, configured in wrangler.toml. */
	DB: D1Database;
	/** Secret. Without it a leaked rate-limit table is reversible by brute force. */
	RATE_PEPPER: string;
	/** Secret: comma-separated public keys. Never a database flag a bug could set. */
	MODERATORS?: string;
	/** Static assets binding — the built atlas. */
	ASSETS: Fetcher;
}

/**
 * D1 already presents the interface db.ts declares, so this is a cast rather than
 * an adapter. That was the point of writing the local server against D1's shape
 * instead of the other way round.
 */
function asDb(d1: D1Database): Db {
	return d1 as unknown as Db;
}

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/')) {
			const apiEnv: ApiEnv = {
				DB: asDb(env.DB),
				RATE_PEPPER: env.RATE_PEPPER,
				MODERATORS: env.MODERATORS
				// ENTITY_IDS is deliberately absent here until an asset binding is
				// wired (spec §15.3 R4): typed thread targets are then accepted by
				// format only, and the client's own index check remains the guard.
			};
			return handle(request, apiEnv);
		}

		// Everything else is the static atlas. In practice the platform answers these
		// before the Worker runs; this is the fallback path.
		return env.ASSETS.fetch(request);
	}
};

// Minimal ambient types so this file compiles without pulling in @cloudflare/workers-types,
// which would be a dependency the rest of the project has no use for.
interface D1Database {
	prepare(sql: string): Prepared;
	exec(sql: string): Promise<unknown>;
	batch(statements: Prepared[]): Promise<unknown[]>;
}
interface Fetcher {
	fetch(request: Request): Promise<Response>;
}
