/**
 * Local API server for Agora.
 *
 *   npm run community        →  http://127.0.0.1:5200
 *
 * Serves the API and nothing else. The interface lives in the atlas at /agora,
 * which reaches this through Vite's proxy so the browser only ever sees one
 * origin — see the comment in vite.config.ts for why that matters more than
 * tidiness.
 *
 * Runs the exact Workers-style handler from api.ts over Node's http server, backed
 * by a file-on-disk SQLite database. Nothing here ships: on Cloudflare the same
 * `handle()` is the Worker's fetch export and the same schema is a D1 binding. This
 * file exists so the whole thing can be built, used and corrected before an account
 * is provisioned.
 *
 * The database file lives in .community/, which is gitignored. It holds posts by
 * real people once this is deployed, and committing it would publish exactly what
 * the design exists to protect — see docs/capacity.md on why backups must never go
 * to the repository.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDb } from './db-local.ts';
import { migrate } from './migrate.ts';
import { handle, localRequest, type Env } from './api.ts';


const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 5200;
const DATA_DIR = join(ROOT, '.community');
const DB_PATH = join(DATA_DIR, 'community.sqlite');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

/*
 * Apply the schema on every start, not only on first creation.
 *
 * Every statement is CREATE ... IF NOT EXISTS, so this is idempotent and it is
 * what makes adding a table a matter of editing schema.sql. Running it only for a
 * brand-new file meant an existing database silently never got the proposal
 * tables, and the first attempt to file a proposal failed with "no such table" —
 * from the UI, long after the code looked finished.
 *
 * The same applies on Cloudflare: D1 needs the schema applied to the real database
 * before the Worker serves a request that touches a new table.
 */
const fresh = !existsSync(DB_PATH);
const db = localDb(DB_PATH);
await db.exec(readFileSync(join(HERE, 'schema.sql'), 'utf8'));
if (fresh) console.log('  created a new database at .community/community.sqlite');

/*
 * `CREATE TABLE IF NOT EXISTS` cannot add a column to a table that already exists,
 * so a field added to schema.sql never reaches a database made before it. Locally
 * that is "no such column"; on D1 after launch it is an outage. See migrate.ts —
 * additive only, and it asks each table what it already has.
 */
const applied = await migrate(db);
if (applied.length) console.log(`  migrated: ${applied.join(', ')}`);

/*
 * The pepper is what stops a leaked bucket table being reversed by hashing every
 * IPv4 address. In production it is an environment secret. Locally it is generated
 * once and kept next to the database, because a hard-coded default is the kind of
 * thing that survives into production and quietly nullifies the protection.
 */
const PEPPER_PATH = join(DATA_DIR, 'pepper');
let pepper: string;
if (existsSync(PEPPER_PATH)) {
	pepper = readFileSync(PEPPER_PATH, 'utf8').trim();
} else {
	pepper = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
	const { writeFileSync } = await import('node:fs');
	writeFileSync(PEPPER_PATH, pepper, 'utf8');
	console.log('  generated a rate-limit pepper in .community/pepper');
}

const env: Env = {
	DB: db,
	RATE_PEPPER: pepper,
	// Locally, whoever is testing is the moderator. In production this is a secret
	// holding a list of public keys — never a database flag that a bug could set.
	MODERATORS: process.env.COMMUNITY_MODERATORS ?? '',
	// The built entity index, used to validate thread graph targets (spec §15.3 R4).
	// Absent on the Worker until an asset binding is wired; locally it is the real
	// dataset the site is built from.
	ENTITY_IDS: loadEntityIds()
};

/**
 * Ids of every graph entity, from the built dataset. Failure to read it (a build
 * that has not run) disables typed-target validation rather than the server —
 * the client's own index check still guards the happy path.
 */
function loadEntityIds(): Set<string> | undefined {
	try {
		const ds = JSON.parse(readFileSync(join(ROOT, 'src/generated/dataset.json'), 'utf8'));
		const ids = new Set<string>();
		for (const kind of ['people', 'institutions', 'roles', 'positions', 'relationships', 'events', 'sources']) {
			for (const r of ds[kind] ?? []) {
				if (r?.id) ids.add(r.id);
			}
		}
		return ids;
	} catch {
		return undefined;
	}
}

const server = createServer(async (req, res) => {
	// Every request is the Worker handler, unchanged — except the trust boundary.
	// Forwarded headers are never trusted on loopback: a client could spoof
	// x-forwarded-for and reset its own rate buckets. The socket address is the
	// only truth (spec §15.3 R2); localRequest() sets it as cf-connecting-ip so
	// clientAddress() reads it exactly as it reads Cloudflare's.
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);

	const request = localRequest(
		`http://127.0.0.1:${PORT}${req.url}`,
		{
			method: req.method,
			headers: req.headers as Record<string, string>,
			body: chunks.length ? Buffer.concat(chunks) : undefined
		},
		req.socket.remoteAddress ?? 'local'
	);

	const response = await handle(request, env);
	res.writeHead(response.status, Object.fromEntries(response.headers));
	res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`\n  Deep Tunisia community — http://127.0.0.1:${PORT}`);
	console.log(`  database: .community/community.sqlite`);
	console.log(
		env.MODERATORS
			? `  moderators: ${env.MODERATORS.split(',').length} key(s)`
			: '  no moderators configured — set COMMUNITY_MODERATORS to your public key'
	);
	console.log('\n  This is the local stand-in. The same handler runs on Workers.\n');
});
