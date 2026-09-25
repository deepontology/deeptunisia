/**
 * Assertions over the community mode contract.
 *
 * The mode is the security boundary: it decides whether a stranger's request can
 * reach the database at all. This suite exercises the boundary directly, against
 * the same `handle()` the Worker runs, and it is written to prove the refusals
 * rather than the happy path.
 *
 * Three things must hold, and each is asserted by making the bad thing happen:
 *
 *   1. `off` is the default. An environment that forgets to set a mode is closed,
 *      and no route touches the database before the refusal.
 *   2. `off` and every refused route in `read-only` give the same 404 with
 *      `no-store`, so the response does not reveal which routes exist and a cache
 *      cannot serve a stale `200` after the mode closes.
 *   3. `read-only` serves the public reads and refuses every write and identity
 *      action. `beta` opens the signed API; the handler suites cover its
 *      behaviour, so this file only proves the gate opens.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDb } from '../community/db-local.ts';
import { handle, type Env } from '../community/api.ts';
import { resolveMode } from '../community/mode.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(HERE, '..', 'community', 'schema.sql'), 'utf8');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

/** Every route class the handler knows: the public reads, then the writes. */
const READS = ['/api/threads', '/api/mentions', '/api/posts', '/api/prs', '/api/queue', '/api/pr'];
const WRITES = [
	'/api/thread',
	'/api/post',
	'/api/vote',
	'/api/report',
	'/api/mention',
	'/api/name',
	'/api/whoami',
	'/api/pr',
	'/api/pr/review',
	'/api/pr/withdraw',
	'/api/pr/applied',
	'/api/moderate'
];
const ALL_ROUTES = [...READS, ...WRITES];

function memoryDb() {
	const db = localDb(':memory:');
	void db.exec(SCHEMA);
	return db;
}

function envFor(mode: unknown, db: unknown): Env {
	return { DB: db as Env['DB'], RATE_PEPPER: 'a-pepper-long-enough-for-tests', MODERATORS: '', mode: mode as Env['mode'] };
}

/** A database that fails loudly if anything touches it. */
const trapDb = {
	prepare() {
		throw new Error('D1 ACCESSED');
	},
	exec() {
		throw new Error('D1 ACCESSED');
	},
	batch() {
		throw new Error('D1 ACCESSED');
	}
};

async function request(env: Env, method: string, path: string, payload?: unknown) {
	try {
		// A GET with a body is a TypeError at the platform level, and swallowing
		// that would look like a database touch in the off-mode assertion.
		const send = method !== 'GET' ? payload : undefined;
		const res = await handle(
			new Request(`https://community.example${path}`, {
				method,
				headers: send === undefined ? undefined : { 'content-type': 'application/json' },
				body: send === undefined ? undefined : JSON.stringify(send)
			}),
			env
		);
		const text = await res.text();
		let body: any = null;
		try {
			body = JSON.parse(text);
		} catch {
			/* not json */
		}
		return {
			status: res.status,
			text,
			body,
			cache: res.headers.get('cache-control'),
			contentType: res.headers.get('content-type')
		};
	} catch (e) {
		return { status: -1, text: (e as Error).message, body: null, cache: '', contentType: '' };
	}
}

// ── the resolver ────────────────────────────────────────────────────────────

console.log('\n  ── an absent or unknown mode is closed ──\n');
{
	ok('absent resolves to off', resolveMode(undefined) === 'off', String(resolveMode(undefined)));
	ok('empty resolves to off', resolveMode('') === 'off');
	ok('null resolves to off', resolveMode(null) === 'off');
	ok('an unknown token resolves to off', resolveMode('open') === 'off', String(resolveMode('open')));
	ok('a prototype token is not a mode', resolveMode('prototype') === 'off');
	ok('read-only resolves to read-only', resolveMode('read-only') === 'read-only');
	ok('beta resolves to beta', resolveMode('beta') === 'beta');
	ok('case is not accepted silently', resolveMode('BETA') === 'off', String(resolveMode('BETA')));
}

// ── off ─────────────────────────────────────────────────────────────────────

console.log('\n  ── off: every route is the same 404, before the database ──\n');
{
	const env = envFor(undefined, trapDb);
	let touched = false;
	for (const path of ALL_ROUTES) {
		for (const method of READS.includes(path) ? ['GET', 'POST'] : ['POST', 'GET']) {
			const r = await request(env, method, path, {});
			// A trap that fires inside the handler is swallowed by its catch and
			// comes back as a 500, so anything that is not the uniform 404 counts
			// as a touch.
			if (r.status !== 404 || /D1 ACCESSED/.test(r.text)) touched = true;
		}
	}
	ok('no route reached the database in the default mode', !touched);

	const explicit = envFor('off', trapDb);
	const sample = await request(explicit, 'POST', '/api/whoami');
	const unknown = await request(explicit, 'GET', '/api/does-not-exist');
	const read = await request(explicit, 'GET', '/api/threads');
	ok('an identity action is refused', sample.status === 404, String(sample.status));
	ok('a public read is refused', read.status === 404, String(read.status));
	ok('an unknown route gives the same refusal', unknown.status === 404, String(unknown.status));
	ok('the refusal body is `not found`', sample.body?.error === 'not found', JSON.stringify(sample.body));
	ok('the refusal is not cached', sample.cache === 'no-store', sample.cache);
	ok('the refusal is json', /application\/json/.test(sample.contentType), sample.contentType);
	ok(
		'the three refusals are byte-identical',
		sample.text === unknown.text && sample.text === read.text,
		`${sample.text} / ${unknown.text} / ${read.text}`
	);
	ok('no refusal id is exposed in the headers', !sample.contentType.includes('thread'));
}

// ── read-only ───────────────────────────────────────────────────────────────

console.log('\n  ── read-only: public reads pass, every write is the same 404 ──\n');
{
	const env = envFor('read-only', memoryDb());

	const threads = await request(env, 'GET', '/api/threads');
	ok('the thread list is served', threads.status === 200, String(threads.status));
	ok('the thread list is a list', Array.isArray(threads.body?.items), JSON.stringify(threads.body)?.slice(0, 80));

	const mentions = await request(env, 'GET', '/api/mentions');
	ok('annotations are served', mentions.status === 200, String(mentions.status));

	const prs = await request(env, 'GET', '/api/prs');
	ok('the proposal register is served', prs.status === 200, String(prs.status));

	const queue = await request(env, 'GET', '/api/queue');
	ok('the moderation queue is readable', queue.status === 200, String(queue.status));

	// A read that needs a parameter reaches the handler and fails on the
	// parameter — proof the request passed the gate — rather than as a 404.
	const postsNoId = await request(env, 'GET', '/api/posts');
	ok('a read with a missing parameter is a normal error, not a mode refusal', postsNoId.status === 400, String(postsNoId.status));

	for (const path of WRITES) {
		const r = await request(env, 'POST', path);
		ok(`${path} is refused`, r.status === 404 && r.body?.error === 'not found', `${r.status} ${JSON.stringify(r.body)}`);
	}

	// A write attempted with GET is still refused: the mutating routes exist
	// without a method guard in the handler, so the allowlist is by path.
	const wrongMethod = await request(env, 'GET', '/api/thread');
	ok('a mutating route reached by GET is refused', wrongMethod.status === 404, String(wrongMethod.status));

	const refused = await request(env, 'POST', '/api/whoami');
	const unknown = await request(env, 'GET', '/api/does-not-exist');
	ok('the refusals are byte-identical', refused.text === unknown.text, `${refused.text} / ${unknown.text}`);
	ok('the refusals are not cached', refused.cache === 'no-store', refused.cache);
}

// ── beta ────────────────────────────────────────────────────────────────────

console.log('\n  ── beta: the gate opens ──\n');
{
	const env = envFor('beta', memoryDb());
	const threads = await request(env, 'GET', '/api/threads');
	ok('the thread list is served', threads.status === 200, String(threads.status));

	// An unsigned write now reaches the signature check instead of the mode
	// refusal: it must fail for the signature, not with the uniform 404.
	const unsigned = await request(env, 'POST', '/api/post', { action: {}, data: {} });
	ok('an unsigned write reaches the handler', unsigned.status !== 404, String(unsigned.status));
	ok('and is refused for the signature, not the mode', unsigned.body?.error !== 'not found', JSON.stringify(unsigned.body));
	ok('the refusal is an authentication failure', unsigned.status === 401, String(unsigned.status));
}

console.log(`\n  ${checks - failures}/${checks} mode-contract checks passed\n`);
if (failures) process.exit(1);
