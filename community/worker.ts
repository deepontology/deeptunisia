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
import { resolveMode } from './mode.ts';
import type { Db, Prepared } from './db.ts';
import type { StudiesRegistry } from './research-contract.ts';
import studiesJson from '../src/generated/studies.json';

interface WorkerEnv {
	/** D1 binding, configured in wrangler.toml. */
	DB: D1Database;
	/** Secret. Without it a leaked rate-limit table is reversible by brute force. */
	RATE_PEPPER: string;
	/** Secret: comma-separated public keys. Never a database flag a bug could set. */
	MODERATORS?: string;
	/**
	 * The enforced community mode, a plain Worker variable in wrangler.toml.
	 * Absent or unrecognised resolves to `off`. Production v0.1.3 runs `off`.
	 */
	COMMUNITY_MODE?: string;
	/** Static assets binding — the built atlas. */
	ASSETS: Fetcher;
	/**
	 * Separate D1 binding for research responses (contract §5). Created by the
	 * operator and wired in wrangler.toml; until then, research endpoints that
	 * need storage answer 503.
	 */
	RESEARCH_DB?: D1Database;
	/** Worker var. '1' opens research submissions; absent or anything else fails closed. */
	RESEARCH_OPEN?: string;
	/** Turnstile secret for the research bot challenge (contract §4). */
	TURNSTILE_SECRET?: string;
}

/**
 * The compiled studies registry, bundled at build time. `npm run build` always
 * runs the studies build first, so a deploy cannot ship without it. The JSON
 * module's inferred type cannot express the runtime unions in
 * RuntimeInstrument, so the registry is asserted once here — the shape itself
 * is validated by scripts/build-studies.ts before the file is emitted.
 */
const studies = studiesJson as unknown as StudiesRegistry;

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
				MODERATORS: env.MODERATORS,
				mode: resolveMode(env.COMMUNITY_MODE),
				// Research (contract §6). No RESEARCH_DB binding → storage endpoints
				// answer 503; no RESEARCH_OPEN var, or anything but '1' → submissions
				// are closed. Both absences are the safe direction.
				RESEARCH_DB: env.RESEARCH_DB ? asDb(env.RESEARCH_DB) : undefined,
				RESEARCH_OPEN: env.RESEARCH_OPEN,
				STUDIES: studies,
				TURNSTILE_SECRET: env.TURNSTILE_SECRET
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
