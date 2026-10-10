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
import { resolveMode } from './mode.ts';
import type { StudiesRegistry } from './research-contract.ts';


const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.PORT ?? 5200);
const DATA_DIR = join(ROOT, '.community');
const DB_PATH = join(DATA_DIR, 'community.sqlite');
const RESEARCH_DB_PATH = join(DATA_DIR, 'research.sqlite');

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
 * Research responses live in their own database file, for the same reason they
 * get their own D1 binding in production: they are personal data of a different
 * kind and sensitivity from the community layer, and the research schema —
 * with no identifier column of any kind — is applied on every start, exactly
 * like the community schema above.
 */
const researchDb = localDb(RESEARCH_DB_PATH);
await researchDb.exec(readFileSync(join(HERE, 'research-schema.sql'), 'utf8'));

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

/*
 * The research gate. '1' opens submissions; anything else — including an unset
 * variable — is closed. Fail closed, and say so at startup so an operator who
 * meant to open the study notices before respondents do.
 */
const RESEARCH_OPEN = process.env.RESEARCH_OPEN === '1' ? '1' : '0';

/*
 * LOCAL DEVELOPMENT ONLY: the dev fielding override.
 *
 * When set to a study's slug or id, the API treats that study as fielding and
 * accepts its submissions without a bot challenge, so the runner can be
 * answered end to end before the canonical registry leaves `design`. Nothing
 * in production sets it: the Worker never reads the variable, and this server
 * prints a warning at startup whenever it is on. Unset is the deployed state.
 */
const RESEARCH_DEV_STUDY = process.env.RESEARCH_DEV_STUDY;

const env: Env = {
	DB: db,
	RATE_PEPPER: pepper,
	// Locally, whoever is testing is the moderator. In production this is a secret
	// holding a list of public keys — never a database flag that a bug could set.
	MODERATORS: process.env.COMMUNITY_MODERATORS ?? '',
	// The same runtime switch the Worker reads. There is no local default beyond
	// `off`: a developer who wants the client must say `COMMUNITY_MODE=beta`, and
	// `npm start` sets that explicitly for the dev loop. Closing is never a build.
	mode: resolveMode(process.env.COMMUNITY_MODE),
	// The built entity index, used to validate thread graph targets (spec §15.3 R4).
	// Absent on the Worker until an asset binding is wired; locally it is the real
	// dataset the site is built from.
	ENTITY_IDS: loadEntityIds(),
	// Research (contract §6): the compiled registry, the response store, and the
	// gate. TURNSTILE_SECRET stays unwired locally — with the gate open and no
	// challenge configured, submissions are refused 503 rather than let through,
	// except for the one study RESEARCH_DEV_STUDY names.
	RESEARCH_DB: researchDb,
	RESEARCH_OPEN,
	RESEARCH_DEV_STUDY,
	// The assignment secret (contract §10). Falls back to the pepper inside the
	// API when unset; both are local secrets a restarted server keeps.
	ASSIGNMENT_SECRET: process.env.ASSIGNMENT_SECRET,
	STUDIES: loadStudies()
};

/**
 * The compiled studies registry from the studies build. A missing or unreadable
 * file takes the research endpoints down, not the server: the community API
 * must not fall over because a study build has not run.
 */
function loadStudies(): StudiesRegistry | undefined {
	try {
		return JSON.parse(
			readFileSync(join(ROOT, 'src', 'generated', 'studies.json'), 'utf8')
		) as StudiesRegistry;
	} catch {
		console.log('  research: no studies registry at src/generated/studies.json — study endpoints will report it missing');
		return undefined;
	}
}

/**
 * Ids of every graph entity, from the built dataset. Failure to read it (a build
 * that has not run) disables typed-target validation rather than the server —
 * the client's own index check still guards the happy path.
 */
function loadEntityIds(): Set<string> | undefined {
	try {
		const ds = JSON.parse(readFileSync(join(ROOT, 'src/generated/dataset.json'), 'utf8'));
		const ids = new Set<string>();
		for (const kind of ['people', 'institutions', 'roles', 'positions', 'relationships', 'events', 'sources', 'companies', 'contracts', 'licences', 'declarations', 'education', 'regions', 'places', 'agreements', 'worldClaims']) {
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
	console.log(`  mode:     ${env.mode}${env.mode === 'off' ? ' (the API answers 404; set COMMUNITY_MODE=beta to use the client)' : ''}`);
	console.log(
		env.MODERATORS
			? `  moderators: ${env.MODERATORS.split(',').length} key(s)`
			: '  no moderators configured — set COMMUNITY_MODERATORS to your public key'
	);
	console.log('  research database: .community/research.sqlite');
	console.log(
		RESEARCH_OPEN === '1'
			? '  research: submissions OPEN (RESEARCH_OPEN=1)'
			: '  research: submissions closed (RESEARCH_OPEN=0)'
	);
	if (RESEARCH_DEV_STUDY) {
		console.log('');
		console.log('  ============================================================');
		console.log('  !!! DEV FIELDING OVERRIDE ACTIVE !!!');
		console.log(`  study: ${RESEARCH_DEV_STUDY}`);
		console.log('  submissions are accepted without a bot challenge');
		console.log('  LOCAL DEVELOPMENT ONLY. Never set RESEARCH_DEV_STUDY in production.');
		console.log('  ============================================================');
		console.log('');
	}
	console.log('\n  This is the local stand-in. The same handler runs on Workers.\n');
});
