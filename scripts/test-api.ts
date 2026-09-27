/**
 * Assertions over the community API, against a real database.
 *
 * community/api.ts is the only thing between a stranger on the internet and a
 * dataset about named Tunisian officials, so what is tested here is mostly what it
 * REFUSES. The happy paths are a handful of lines; the refusals are the product.
 *
 * The database is node:sqlite in memory, driven through the same D1-shaped interface
 * the deployed Worker will use, so these tests exercise the code that will run in
 * production rather than a local variant of it.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDb } from '../community/db-local.ts';
import { handle, localRequest, moderationQueue, type Env } from '../community/api.ts';
import { createIdentity, handleFor, signAction, type SignedAction } from '../community/identity.ts';

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

function freshEnv(moderators = ''): Env {
	const db = localDb(':memory:');
	// exec resolves immediately in the local adapter, so the schema is in place
	// before the first request without needing an async factory here.
	void db.exec(SCHEMA);
	// `beta` is explicit: the default is `off`, and these suites exercise the
	// open handler. The mode contract itself is asserted in test-modes.ts.
	return { DB: db, RATE_PEPPER: 'a-pepper-long-enough-for-tests', MODERATORS: moderators, mode: 'beta' };
}

/** Sign and send, exactly as the browser client will. `ip` simulates a distinct
 * client address (cf-connecting-ip) for rate-limit scenarios. */
async function call(
	env: Env,
	keys: CryptoKeyPair,
	pubkey: string,
	path: string,
	data: unknown = {},
	tamper?: (a: SignedAction) => SignedAction,
	ip?: string
) {
	let action = await signAction(keys, pubkey, JSON.stringify({ path, data }));
	if (tamper) action = tamper(action);
	const res = await handle(
		new Request(`https://community.example${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(ip ? { 'cf-connecting-ip': ip } : {})
			},
			body: JSON.stringify({ action, data })
		}),
		env
	);
	return { status: res.status, body: (await res.json()) as any };
}

async function get(env: Env, path: string) {
	const res = await handle(new Request(`https://community.example${path}`), env);
	return { status: res.status, body: (await res.json()) as any };
}

const alice = await createIdentity();
const mallory = await createIdentity();

console.log('\n  ── an identity appears by posting, not by signing up ──\n');

{
	const env = freshEnv();
	const who = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('a first request creates the identity', who.status === 200);
	ok('the handle is derived, not chosen', /^anon-/.test(who.body.handle), who.body.handle);
	ok('a new identity starts at trust 0', who.body.trust_level === 0);
	ok('a new identity may comment, vote and report', who.body.can.comment && who.body.can.vote && who.body.can.report);
	// It may open ONE a day. Nought made the forum impossible to start: every identity
	// is level 0 on day one, promotion needs five posts, and posts need a thread.
	ok('a new identity may open a thread', who.body.can.createThread === true);
	ok('but is held to one a day', who.body.can.threadsPerDay === 1);

	const row = await env.DB.prepare('SELECT * FROM identities').first<any>();
	ok('no address is stored with the identity', !JSON.stringify(row).includes('local'));
}

console.log('\n  ── forgery and replay ──\n');

{
	const env = freshEnv();

	const tampered = await call(env, alice.keys, alice.pubkey, '/api/whoami', {}, (a) => ({
		...a,
		body: JSON.stringify({ path: '/api/whoami', data: { elevated: true } })
	}));
	ok('a tampered body is refused', tampered.status === 401, tampered.body.error);

	const impostor = await call(env, alice.keys, alice.pubkey, '/api/whoami', {}, (a) => ({
		...a,
		pubkey: mallory.pubkey
	}));
	ok('another key cannot claim an action', impostor.status === 401, impostor.body.error);

	// A signature captured from one endpoint must not authorise a different one.
	const swapped = await signAction(alice.keys, alice.pubkey, JSON.stringify({ path: '/api/whoami', data: {} }));
	const reused = await handle(
		new Request('https://community.example/api/name', {
			method: 'POST',
			body: JSON.stringify({ action: swapped, data: {} })
		}),
		env
	);
	ok('a signature from one path does not work on another', reused.status === 400, (await reused.json() as any).error);

	// Replay: the identical request sent twice must not be accepted twice.
	const action = await signAction(alice.keys, alice.pubkey, JSON.stringify({ path: '/api/whoami', data: {} }));
	const send = () =>
		handle(
			new Request('https://community.example/api/whoami', {
				method: 'POST',
				body: JSON.stringify({ action, data: {} })
			}),
			env
		);
	const first = await send();
	const second = await send();
	ok('the first use of a nonce succeeds', first.status === 200);
	ok('the second use of the same nonce is refused', second.status === 401, (await second.json() as any).error);

	const unsigned = await handle(
		new Request('https://community.example/api/post', { method: 'POST', body: '{}' }),
		env
	);
	ok('an unsigned write is refused', unsigned.status === 400);
}

console.log('\n  ── one key, one identity ──\n');

/*
 * Base64url is not canonical: padding variants and alphabet aliases decode to the
 * same 32 bytes while remaining different strings, so keying rows by the submitted
 * text let one key present several identities and multiply its allowances.
 * Decode, re-encode once, key on that.
 */
{
	const env = freshEnv();

	// A genuine action by the same key, submitted padded. The signature covers the
	// padded string, so this is not a forgery with a different encoding.
	const padded = alice.pubkey + '='.repeat((4 - (alice.pubkey.length % 4)) % 4);
	const first = await call(env, alice.keys, padded, '/api/whoami');
	ok('a padded encoding of a key authenticates', first.status === 200, first.body.error ?? '');

	const canonical = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	const identities = await env.DB.prepare('SELECT COUNT(*) AS n FROM identities').first<any>();
	ok('padding did not mint a second identity', identities.n === 1, `${identities.n} row(s)`);
	ok(
		'the padded and canonical encodings resolve to one handle',
		first.body.handle === canonical.body.handle,
		`${first.body.handle} / ${canonical.body.handle}`
	);

	// The standard alphabet (+/ instead of -_) is the same bytes too.
	const alias = alice.pubkey.replace(/-/g, '+').replace(/_/g, '/');
	const viaAlias = await call(env, alice.keys, alias, '/api/whoami');
	const afterAlias = await env.DB.prepare('SELECT COUNT(*) AS n FROM identities').first<any>();
	ok(
		'an aliased encoding is the same key, not a second identity',
		viaAlias.status === 200 && afterAlias.n === 1,
		`${viaAlias.status} ${viaAlias.body.error ?? ''}, ${afterAlias.n} row(s)`
	);
}

console.log('\n  ── capability gates ──\n');

{
	const env = freshEnv();

	const first = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'bourguiba',
		title: 'The one thread a new identity gets today'
	});
	ok('a new identity opens its first thread', first.status === 200, first.body.error ?? '');

	// The daily allowance is what does the work now, not a capability gate.
	const second = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'bourguiba',
		title: 'And is refused a second one the same day'
	});
	ok('a second thread the same day is refused', second.status === 429, second.body.error);

	// Promote by hand to the level the gate wants, which is what real use would earn.
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	// The floor between consecutive actions is intended; move the earlier thread
	// back so this call tests the capability, not the clock.
	await env.DB.prepare('UPDATE threads SET created_at = ? WHERE created_by = ?')
		.bind(Date.now() - 10_000, alice.pubkey)
		.run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'bourguiba',
		title: 'Was the 1957 date ever confirmed against the gazette?'
	});
	ok('an established identity can open a thread', thread.status === 200 && Boolean(thread.body.id));

	const badTarget = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'wormhole',
		title: 'A thread attached to nothing real'
	});
	ok('an unknown target type is refused', badTarget.status === 400, badTarget.body.error);

	// Links are the spam vector, so level 0 cannot post them.
	await env.DB.prepare('UPDATE identities SET trust_level = 0 WHERE pubkey = ?').bind(mallory.pubkey).run();
	const link = await call(env, mallory.keys, mallory.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'look at this https://example.com/spam'
	});
	ok('a new identity cannot post links', link.status === 403, link.body.error);

	const plain = await call(env, mallory.keys, mallory.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'The decree number is cited in the gazette index for that month.'
	});
	ok('a new identity can still comment', plain.status === 200, plain.body.error ?? '');

	const nowhere = await call(env, mallory.keys, mallory.pubkey, '/api/post', {
		thread_id: 'no-such-thread',
		body: 'a reply to nothing'
	});
	ok('a post to a missing thread is refused', nowhere.status === 404);
}

console.log('\n  ── opening a thread carries the post guards too ──\n');

/*
 * A thread is the most visible thing anyone writes here, and it now runs the same
 * honeypot, the same four-second floor between actions, and a duplicate-title
 * check. A key that opens four identical threads in a minute is the cheapest abuse
 * on the surface.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	// The per-day thread allowance is not what is under test: give room for more.
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const first = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A title worth repeating'
	});
	ok('the first thread is opened', first.status === 200, first.body.error ?? '');

	const trap = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A thread a bot filled in',
		website: 'x'
	});
	ok(
		'a thread carrying the honeypot field is refused 429',
		trap.status === 429,
		`${trap.status} ${trap.body.error ?? ''}`
	);
	const afterTrap = await env.DB.prepare('SELECT COUNT(*) AS n FROM threads').first<any>();
	ok('the honeypot refusal writes no thread', afterTrap.n === 1, `${afterTrap.n} row(s)`);

	const quick = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A second thread straight after the first'
	});
	ok(
		'a second thread inside the four-second floor is refused',
		quick.status === 429 && /slow down/.test(quick.body.error ?? ''),
		`${quick.status} ${quick.body.error ?? ''}`
	);

	// Past the floor, the repeated title is still refused.
	await env.DB.prepare('UPDATE threads SET created_at = created_at - 10000 WHERE created_by = ?')
		.bind(alice.pubkey)
		.run();
	const dupe = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A title worth repeating'
	});
	ok(
		'a second thread with the same title is refused',
		dupe.status === 400 && dupe.body.error === 'you have just opened a thread with this title',
		`${dupe.status} ${dupe.body.error ?? ''}`
	);
	const afterDupe = await env.DB.prepare('SELECT COUNT(*) AS n FROM threads').first<any>();
	ok('the duplicate refusal writes no thread', afterDupe.n === 1, `${afterDupe.n} row(s)`);
}

console.log('\n  ── votes rank, they do not delete ──\n');

{
	const env = freshEnv();
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'ben-ali',
		title: 'Evidence thread'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A document that supports the disputed date.'
	});

	// A brigade: many identities, all downvoting. Each gets its own address — the
	// identity mint limit (spec §15.3 R1) makes 30 mints from one address in a day
	// a refusenik, and the scenario here is about a distributed brigade hiding a
	// post, not one address.
	for (let i = 0; i < 30; i++) {
		const voter = await createIdentity();
		await call(env, voter.keys, voter.pubkey, '/api/vote', {
			target_type: 'post',
			target_id: post.body.id,
			value: -1
		}, undefined, `198.51.100.${i + 1}`);
	}

	const after = await get(env, `/api/posts?thread_id=${thread.body.id}`);
	const item = after.body.items.find((p: any) => p.id === post.body.id);
	ok('a heavily downvoted post is still returned', Boolean(item), `${item?.downvotes} downvotes`);
	ok('its body is still readable', typeof item.body === 'string' && item.body.length > 0);
	ok('it is not marked removed', item.removed === false);

	// Voting twice the same way changes nothing; flipping moves one vote, not two.
	const voter = await createIdentity();
	const v1 = await call(env, voter.keys, voter.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 1
	}, undefined, '198.51.100.99');
	const v2 = await call(env, voter.keys, voter.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 1
	});
	ok('a repeated identical vote is a no-op', v1.status === 200 && v2.body.unchanged === true);

	await call(env, voter.keys, voter.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: -1
	});
	const counted = await env.DB.prepare('SELECT upvotes, downvotes FROM posts WHERE id = ?')
		.bind(post.body.id)
		.first<any>();
	ok('flipping a vote moves it rather than adding one', counted.upvotes === 0, `up ${counted.upvotes}`);

	const votes = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes').first<any>();
	ok('one row per identity per target', votes.n === 31, `${votes.n} vote rows`);
}

console.log('\n  ── a vote can be taken back (B7) ──\n');

{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'ben-ali',
		title: 'A vote worth taking back'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A comment somebody may change their mind about.'
	});

	const up = await call(env, alice.keys, alice.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 1
	});
	ok('an upvote is recorded', up.status === 200 && up.body.ok === true, up.body.error ?? '');
	let row = await env.DB.prepare('SELECT value FROM votes WHERE target_type = ? AND target_id = ?')
		.bind('post', post.body.id)
		.first<any>();
	ok('the row carries the value the voter chose', row?.value === 1, `value ${row?.value}`);
	let counts = await env.DB.prepare('SELECT upvotes, downvotes FROM posts WHERE id = ?')
		.bind(post.body.id)
		.first<any>();
	ok('the counter follows the vote', counts.upvotes === 1 && counts.downvotes === 0, `up ${counts.upvotes} down ${counts.downvotes}`);

	const retract = await call(env, alice.keys, alice.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 0
	});
	ok('0 removes the vote', retract.status === 200 && retract.body.removed === true, retract.body.error ?? '');
	row = await env.DB.prepare('SELECT value FROM votes WHERE target_type = ? AND target_id = ?')
		.bind('post', post.body.id)
		.first<any>();
	ok('the row is deleted, not zeroed', !row, row ? `still value ${row.value}` : 'no row');
	counts = await env.DB.prepare('SELECT upvotes, downvotes FROM posts WHERE id = ?')
		.bind(post.body.id)
		.first<any>();
	ok('the counter comes back down by the vote that was there', counts.upvotes === 0 && counts.downvotes === 0, `up ${counts.upvotes} down ${counts.downvotes}`);

	// The same path for a downvote: the decrement is by the prior value, which the
	// row above no longer holds, so this is the case a naive delete would get wrong.
	await call(env, alice.keys, alice.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: -1
	});
	await call(env, alice.keys, alice.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 0
	});
	counts = await env.DB.prepare('SELECT upvotes, downvotes FROM posts WHERE id = ?')
		.bind(post.body.id)
		.first<any>();
	ok('a retracted downvote is subtracted from the down counter', counts.upvotes === 0 && counts.downvotes === 0, `up ${counts.upvotes} down ${counts.downvotes}`);

	// Retracting nothing must not go through the delete path at all — it is the
	// no-op case, and `unchanged` is what tells the client so.
	const nothing = await call(env, alice.keys, alice.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 0
	});
	ok('retracting a vote that is not there changes nothing', nothing.status === 200 && nothing.body.unchanged === true);

	const bad = await call(env, alice.keys, alice.pubkey, '/api/vote', {
		target_type: 'post',
		target_id: post.body.id,
		value: 2
	});
	ok(
		'a value that is not 1, -1 or 0 is refused with the retraction wording',
		bad.status === 400 && bad.body.error === 'a vote is 1 or -1, or 0 to remove it',
		bad.body.error
	);

	const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes').first<any>();
	ok('refused and no-op votes leave no rows behind', rows.n === 0, `${rows.n} rows`);
}

console.log('\n  ── vote counters are derived, not remembered ──\n');

/*
 * The vote row and the post's counters move in one batch, and the counters are
 * recomputed from the votes table rather than adjusted by a remembered delta.
 * A brigade followed by a retraction is the case a read-modify-write can get
 * wrong: the stored numbers must equal the counts in `votes`.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A tally that must not drift'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A post with an unpopular opinion attached.'
	});

	// A brigade, then one of the brigade changes their mind.
	const voters: { keys: CryptoKeyPair; pubkey: string }[] = [];
	for (let i = 0; i < 12; i++) {
		const voter = await createIdentity();
		voters.push(voter);
		await call(
			env,
			voter.keys,
			voter.pubkey,
			'/api/vote',
			{ target_type: 'post', target_id: post.body.id, value: -1 },
			undefined,
			`198.51.100.${i + 1}`
		);
	}
	// One supporter, so both counters have a vote to move.
	const supporter = await createIdentity();
	await call(
		env,
		supporter.keys,
		supporter.pubkey,
		'/api/vote',
		{ target_type: 'post', target_id: post.body.id, value: 1 },
		undefined,
		'198.51.100.101'
	);
	await call(
		env,
		voters[0].keys,
		voters[0].pubkey,
		'/api/vote',
		{ target_type: 'post', target_id: post.body.id, value: 0 },
		undefined,
		'198.51.100.1'
	);

	const counted = () =>
		env.DB.prepare(
			`SELECT
			   (SELECT COUNT(*) FROM votes WHERE target_type = 'post' AND target_id = ? AND value = 1) AS up,
			   (SELECT COUNT(*) FROM votes WHERE target_type = 'post' AND target_id = ? AND value = -1) AS down`
		)
			.bind(post.body.id, post.body.id)
			.first<any>();

	const stored = await env.DB.prepare('SELECT upvotes, downvotes FROM posts WHERE id = ?')
		.bind(post.body.id)
		.first<any>();
	const inVotes = await counted();
	ok(
		'the stored counters equal the votes table after a brigade and a retraction',
		stored.upvotes === inVotes.up && stored.downvotes === inVotes.down,
		`stored ${stored.upvotes}/${stored.downvotes}, votes ${inVotes.up}/${inVotes.down}`
	);
	ok(
		'the retraction moved the down counter rather than a remembered delta',
		stored.upvotes === 1 && stored.downvotes === 11,
		`up ${stored.upvotes} down ${stored.downvotes}`
	);

	// A flip is the other delta a remembered counter gets wrong.
	await call(
		env,
		voters[1].keys,
		voters[1].pubkey,
		'/api/vote',
		{ target_type: 'post', target_id: post.body.id, value: 1 },
		undefined,
		'198.51.100.2'
	);
	const flipped = await env.DB.prepare('SELECT upvotes, downvotes FROM posts WHERE id = ?')
		.bind(post.body.id)
		.first<any>();
	const afterFlip = await counted();
	ok(
		'a flip leaves the counters equal to the votes table too',
		flipped.upvotes === afterFlip.up &&
			flipped.downvotes === afterFlip.down &&
			flipped.upvotes === 2 &&
			flipped.downvotes === 10,
		`up ${flipped.upvotes} down ${flipped.downvotes}, votes up ${afterFlip.up} down ${afterFlip.down}`
	);
}

console.log('\n  ── reports queue, they do not hide ──\n');

{
	const env = freshEnv();
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'saied',
		title: 'Investigation'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'An inconvenient but sourced finding.'
	});

	// One person reporting repeatedly is one opinion.
	//
	// Kept under the per-hour report limit on purpose. An earlier version filed
	// fourteen, of which the last four were refused by the rate limiter — so the row
	// count was right while the assertion was measuring the wrong mechanism. The
	// UNIQUE constraint is what is under test here, not the throttle.
	let accepted = 0;
	for (let i = 0; i < 8; i++) {
		const r = await call(env, mallory.keys, mallory.pubkey, '/api/report', {
			target_type: 'post',
			target_id: post.body.id,
			reason: 'misinformation'
		});
		if (r.status === 200) accepted++;
	}
	ok('every one of those reports was accepted, not throttled', accepted === 8, `${accepted}/8`);
	const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<any>();
	ok('eight reports from one identity store once', rows.n === 1, `${rows.n} rows`);

	const queue = await moderationQueue(env.DB);
	ok('the queue weighs distinct reporters', queue[0].pressure === 1, `pressure ${queue[0].pressure}`);

	const still = await get(env, `/api/posts?thread_id=${thread.body.id}`);
	ok('a reported post stays visible', still.body.items[0].removed === false);
	ok('its body is untouched', typeof still.body.items[0].body === 'string');

	// From a fresh identity, so a 429 cannot masquerade as a validation refusal.
	const other = await createIdentity();
	const bogus = await call(env, other.keys, other.pubkey, '/api/report', {
		target_type: 'post',
		target_id: post.body.id,
		reason: 'i-dislike-it'
	});
	ok('an unknown report reason is refused', bogus.status === 400, bogus.body.error);
}

console.log('\n  ── the honeypot guards every public write door ──\n');

/*
 * checkHoneypot is not only on /api/post: a report or a proposal filled in by a
 * script must be refused and must not leave a row behind. The field is invisible
 * to a human, so any value in it is the automation answering.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'Honeypot target'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A post that exists so the refusal is the trap, not the missing target.'
	});

	const trappedReport = await call(env, mallory.keys, mallory.pubkey, '/api/report', {
		target_type: 'post',
		target_id: post.body.id,
		reason: 'spam',
		website: 'x'
	});
	ok(
		'a report carrying the honeypot field is refused 429',
		trappedReport.status === 429 && trappedReport.body.error === 'this submission looks automated',
		`${trappedReport.status} ${trappedReport.body.error ?? ''}`
	);
	const reportRows = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<any>();
	ok('the trapped report writes no row', reportRows.n === 0, `${reportRows.n} row(s)`);

	await env.DB.prepare('UPDATE identities SET trust_level = 2 WHERE pubkey = ?').bind(alice.pubkey).run();
	const trappedPr = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'set',
		reason: 'A change no person filed.',
		changes: [{ field: 'start', old_value: '1957-07-25', new_value: '1957-07-26' }],
		website: 'x'
	});
	ok(
		'a proposal carrying the honeypot field is refused 429',
		trappedPr.status === 429 && trappedPr.body.error === 'this submission looks automated',
		`${trappedPr.status} ${trappedPr.body.error ?? ''}`
	);
	const prRows = await env.DB.prepare('SELECT COUNT(*) AS n FROM prs').first<any>();
	ok('the trapped proposal writes no row', prRows.n === 0, `${prRows.n} row(s)`);
}

console.log('\n  ── moderation is a person, with a reason, and reversible ──\n');

{
	const env = freshEnv(alice.pubkey);
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'General'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'spam spam spam'
	});

	const notMod = await call(env, mallory.keys, mallory.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'remove',
		reason: 'because I feel like it'
	});
	ok('a non-moderator cannot remove', notMod.status === 403);

	// A moderation row about a missing post is a decision about nothing, and the
	// audit log is append-only, so the refusal has to happen before the write.
	const missing = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: 'no-such-post',
		action: 'remove',
		reason: 'a decision about nothing'
	});
	ok('moderation against a missing target is 404', missing.status === 404, `${missing.status} ${missing.body.error ?? ''}`);
	const orphanActions = await env.DB.prepare(
		"SELECT COUNT(*) AS n FROM moderation_actions WHERE target_id = 'no-such-post'"
	).first<any>();
	ok('and the missing target writes no audit row', orphanActions.n === 0, `${orphanActions.n} row(s)`);

	const noReason = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'remove'
	});
	ok('removal without a reason is refused', noReason.status === 400);

	const removed = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'remove',
		reason: 'unsolicited commercial spam'
	});
	ok('a moderator can remove with a reason', removed.status === 200);

	const view = await get(env, `/api/posts?thread_id=${thread.body.id}`);
	ok('a removed post keeps its place in the thread', view.body.items.length === 1);
	ok('its body is withheld', view.body.items[0].body === null);
	ok('the reason is published', view.body.items[0].removed_reason === 'unsolicited commercial spam');

	const log = await env.DB.prepare('SELECT * FROM moderation_actions').first<any>();
	ok('the action is logged with actor and reason', log.moderator === alice.pubkey && Boolean(log.reason));

	const restored = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'restore',
		reason: 'on review this was a quotation, not an advert'
	});
	ok('removal is reversible', restored.status === 200);
	const back = await get(env, `/api/posts?thread_id=${thread.body.id}`);
	ok('the post returns intact', typeof back.body.items[0].body === 'string');

	const logs = await env.DB.prepare('SELECT COUNT(*) AS n FROM moderation_actions').first<any>();
	ok('both actions are in the log', logs.n === 2);
}

console.log('\n  ── a report is resolved, not left open forever ──\n');

/*
 * Closing a report is the other half of the loop. Without it the queue only grows,
 * and `reports_upheld` cannot move, which makes the promotion guard that reads it
 * decorative. Upheld charges the reported author; rejected charges each reporter.
 */
{
	const env = freshEnv(alice.pubkey);
	await call(env, alice.keys, alice.pubkey, '/api/whoami');

	const author = await createIdentity();
	const reporter = await createIdentity();
	await call(env, author.keys, author.pubkey, '/api/whoami');
	await call(env, reporter.keys, reporter.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(author.pubkey).run();

	const thread = await call(env, author.keys, author.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A post somebody reports'
	});
	const post = await call(env, author.keys, author.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'The post at the centre of the report.'
	});

	const filed = await call(env, reporter.keys, reporter.pubkey, '/api/report', {
		target_type: 'post',
		target_id: post.body.id,
		reason: 'spam'
	});
	ok('the report is filed and left open', filed.status === 200 && filed.body.queued === true, filed.body.error ?? '');

	const queue = await moderationQueue(env.DB);
	ok('the report is in the moderator queue', queue.length === 1 && queue[0].reports === 1, `${queue.length} target(s)`);

	const upheld = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'resolve',
		decision: 'upheld',
		reason: 'the post is what the report says it is'
	});
	ok('a moderator upholds the report', upheld.status === 200, upheld.body.error ?? '');

	const drained = await moderationQueue(env.DB);
	ok('upholding closes the queue for that target', drained.length === 0, `${drained.length} left open`);

	const reportRow = await env.DB.prepare('SELECT status FROM reports WHERE target_id = ?').bind(post.body.id).first<any>();
	ok('the report itself reads upheld', reportRow?.status === 'upheld', reportRow?.status);

	const authorRow = await env.DB.prepare('SELECT reports_upheld, reports_rejected FROM identities WHERE pubkey = ?')
		.bind(author.pubkey)
		.first<any>();
	ok('the reported author carries the upheld count', authorRow.reports_upheld === 1, `upheld ${authorRow.reports_upheld}`);
	ok('and is not charged with a rejected report', authorRow.reports_rejected === 0, `rejected ${authorRow.reports_rejected}`);

	const reporterRow = await env.DB.prepare('SELECT reports_upheld, reports_rejected FROM identities WHERE pubkey = ?')
		.bind(reporter.pubkey)
		.first<any>();
	ok('the reporter is not charged when the report held', reporterRow.reports_rejected === 0, `rejected ${reporterRow.reports_rejected}`);

	const upheldLog = await env.DB.prepare("SELECT action, reason FROM moderation_actions WHERE action = 'uphold-report'").first<any>();
	ok('the resolution is logged under its own action name', upheldLog?.action === 'uphold-report' && Boolean(upheldLog.reason));

	// Re-resolving a target with nothing open is a conflict, not a second charge
	// against the author: the queue already holds the decision.
	const again = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'resolve',
		decision: 'upheld',
		reason: 'nothing left to resolve'
	});
	ok('resolving a target with nothing open is 409', again.status === 409, `${again.status} ${again.body.error ?? ''}`);

	const authorAfter = await env.DB.prepare('SELECT reports_upheld FROM identities WHERE pubkey = ?').bind(author.pubkey).first<any>();
	ok('a refused re-resolve does not move the count again', authorAfter.reports_upheld === 1, `upheld ${authorAfter.reports_upheld}`);
}

/*
 * Rejected moves the other way: every distinct reporter is charged once, and the
 * author is not. Its own env because a report whose status is no longer 'open'
 * cannot be reopened by filing it again: the UNIQUE upsert only rewrites the
 * reason, so a second target is needed, and a second post by the same author
 * would trip MIN_INTERVAL_MS.
 */
{
	const env = freshEnv(alice.pubkey);
	await call(env, alice.keys, alice.pubkey, '/api/whoami');

	const author = await createIdentity();
	const first = await createIdentity();
	const second = await createIdentity();
	for (const who of [author, first, second]) await call(env, who.keys, who.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(author.pubkey).run();

	const thread = await call(env, author.keys, author.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A post two people report'
	});
	const post = await call(env, author.keys, author.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'Not actually a problem.'
	});

	await call(env, first.keys, first.pubkey, '/api/report', {
		target_type: 'post',
		target_id: post.body.id,
		reason: 'misinformation'
	});
	await call(env, second.keys, second.pubkey, '/api/report', {
		target_type: 'post',
		target_id: post.body.id,
		reason: 'off-topic'
	});

	const queue = await moderationQueue(env.DB);
	ok('the queue weighs two distinct reporters', queue.length === 1 && queue[0].pressure === 2, `pressure ${queue[0]?.pressure ?? 'no entry'}`);

	const rejected = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		target_type: 'post',
		target_id: post.body.id,
		action: 'resolve',
		decision: 'rejected',
		reason: 'the objection does not hold'
	});
	ok('a moderator rejects the reports', rejected.status === 200, rejected.body.error ?? '');

	const statuses = (
		await env.DB.prepare('SELECT status FROM reports WHERE target_id = ?').bind(post.body.id).all<any>()
	).results;
	ok('every open report on the target is closed as rejected', statuses.length === 2 && statuses.every((r: any) => r.status === 'rejected'));

	for (const [name, who] of [
		['first', first],
		['second', second]
	] as const) {
		const row = await env.DB.prepare('SELECT reports_rejected FROM identities WHERE pubkey = ?').bind(who.pubkey).first<any>();
		ok(`the ${name} reporter carries the rejected count`, row.reports_rejected === 1, `rejected ${row.reports_rejected}`);
	}

	const authorRow = await env.DB.prepare('SELECT reports_upheld, reports_rejected FROM identities WHERE pubkey = ?')
		.bind(author.pubkey)
		.first<any>();
	ok(
		'the reported author is not charged when the report is rejected',
		authorRow.reports_upheld === 0 && authorRow.reports_rejected === 0
	);

	const rejectedLog = await env.DB.prepare("SELECT action FROM moderation_actions WHERE action = 'reject-report'").first<any>();
	ok('the rejection is logged as reject-report', rejectedLog?.action === 'reject-report');

	const drain = await moderationQueue(env.DB);
	ok('the rejected reports leave the queue too', drain.length === 0, `${drain.length} left open`);
}

console.log('\n  ── closing a report needs an explicit decision ──\n');

/*
 * Resolve used to default to upheld, so a missing or misspelled decision silently
 * backed the reporter. The decision is now exactly "upheld" or "rejected", and a
 * refusal leaves the report open and writes no audit row.
 */
{
	const env = freshEnv(alice.pubkey);
	await call(env, alice.keys, alice.pubkey, '/api/whoami');

	const author = await createIdentity();
	const reporter = await createIdentity();
	await call(env, author.keys, author.pubkey, '/api/whoami');
	await call(env, reporter.keys, reporter.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(author.pubkey).run();

	const thread = await call(env, author.keys, author.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'A report with an open decision'
	});
	const post = await call(env, author.keys, author.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'The post a decision must name.'
	});
	await call(env, reporter.keys, reporter.pubkey, '/api/report', {
		target_type: 'post',
		target_id: post.body.id,
		reason: 'spam'
	});

	const base = {
		target_type: 'post',
		target_id: post.body.id,
		action: 'resolve',
		reason: 'which way did this go'
	};
	const wording = 'a resolve decision is "upheld" or "rejected"';

	const absent = await call(env, alice.keys, alice.pubkey, '/api/moderate', base);
	ok(
		'a resolve with no decision is refused with the exact wording',
		absent.status === 400 && absent.body.error === wording,
		`${absent.status} ${absent.body.error ?? ''}`
	);
	const misspelled = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		...base,
		decision: 'uphold'
	});
	ok(
		'a misspelled decision is refused with the same wording',
		misspelled.status === 400 && misspelled.body.error === wording,
		`${misspelled.status} ${misspelled.body.error ?? ''}`
	);

	const reportRow = await env.DB.prepare('SELECT status FROM reports WHERE target_id = ?')
		.bind(post.body.id)
		.first<any>();
	ok('the refusals leave the report open', reportRow?.status === 'open', reportRow?.status);
	const audit = await env.DB.prepare('SELECT COUNT(*) AS n FROM moderation_actions').first<any>();
	ok('the refusals write no audit row', audit.n === 0, `${audit.n} row(s)`);

	// The accepted half: the exact word resolves it, so the branch under test is
	// not one that refuses everything.
	const resolved = await call(env, alice.keys, alice.pubkey, '/api/moderate', {
		...base,
		decision: 'upheld'
	});
	ok('the exact word resolves the report', resolved.status === 200, resolved.body.error ?? '');
}

console.log('\n  ── what the API gives out ──\n');

{
	const env = freshEnv();
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'bourguiba',
		title: 'A thread'
	});
	await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A comment'
	});

	const posts = await get(env, `/api/posts?thread_id=${thread.body.id}`);
	const serialised = JSON.stringify(posts.body);

	// Publishing the key would let anyone correlate every post by an identity across
	// the whole site in a single pass — the fingerprinting problem made trivial.
	ok('a public key never appears in a response', !serialised.includes(alice.pubkey));
	ok('the author is a derived handle', /^anon-/.test(posts.body.items[0].author.handle));

	const threads = await get(env, '/api/threads?target_type=person&target_id=bourguiba');
	ok('threads filter by graph target', threads.body.items.length === 1);
	ok('no key leaks through the thread list', !JSON.stringify(threads.body).includes(alice.pubkey));

	/*
	 * A chosen name is allowed, and the interface warns it is a correlation risk.
	 *
	 * Two things must hold, and the second is the one that stops impersonation: the
	 * name is carried ALONGSIDE the handle rather than in place of it, and taking a
	 * name now does not reach back and re-label what was written before.
	 */
	await call(env, alice.keys, alice.pubkey, '/api/name', { display_name: 'a chosen name' });
	const named = await get(env, `/api/posts?thread_id=${thread.body.id}`);
	ok(
		'a name taken later does not re-label an existing post',
		named.body.items[0].author.name === null
	);
	ok(
		'and that post still carries its derived handle',
		/^anon-/.test(named.body.items[0].author.handle)
	);

	// The converse — a post written while a name is set carries it — is asserted in
	// the snapshot block below, which can post without tripping MIN_INTERVAL_MS.
}

console.log('\n  ── rate limiting ──\n');

{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'Flood test'
	});

	let refusedAt = -1;
	for (let i = 0; i < 25; i++) {
		const r = await call(env, alice.keys, alice.pubkey, '/api/post', {
			thread_id: thread.body.id,
			body: `comment number ${i}`
		});
		if (r.status === 429) {
			refusedAt = i;
			break;
		}
	}
	ok('a flood of comments is throttled', refusedAt > 0 && refusedAt <= 20, `refused at ${refusedAt}`);

	// Reading is never throttled: rate-limiting readers means identifying readers.
	let readsOk = true;
	for (let i = 0; i < 50; i++) {
		const r = await get(env, `/api/posts?thread_id=${thread.body.id}`);
		if (r.status !== 200) readsOk = false;
	}
	ok('reading is never throttled', readsOk);

	const buckets = (await env.DB.prepare('SELECT key FROM rate_buckets').all<any>()).results;
	ok('bucket keys are hashes, not addresses', buckets.every((b: any) => /^[0-9a-f]{64}$/.test(b.key.split(':')[1])));
}

console.log('\n  ── the per-identity hourly allowance ──\n');

/*
 * capabilitiesFor has published commentsPerHour since the first version; the
 * address bucket was the only thing enforcing anything, so the ladder was
 * decoration. A level-0 identity is five an hour, and promotion has to raise that
 * rather than leave the number in a payload nothing reads.
 */
{
	const env = freshEnv();
	const who = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('the allowance published to a level-0 identity is five an hour', who.body.can.commentsPerHour === 5, `${who.body.can.commentsPerHour}`);
	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'Counting against the identity, not the address'
	});
	ok(
		'a level-0 identity opens the thread the allowance is counted on',
		thread.status === 200,
		thread.body.error ?? ''
	);

	// Each comment is moved past the four-second floor but stays inside the hour,
	// so the number that refuses the sixth is the identity's allowance and not
	// MIN_INTERVAL_MS.
	const backdate = (ms: number) =>
		env.DB.prepare('UPDATE posts SET created_at = created_at - ? WHERE created_by = ?')
			.bind(ms, alice.pubkey)
			.run();

	let allowed = 0;
	for (let i = 0; i < 5; i++) {
		const r = await call(env, alice.keys, alice.pubkey, '/api/post', {
			thread_id: thread.body.id,
			body: `A level-zero comment numbered ${i}, long enough to be its own sentence.`
		});
		if (r.status === 200) allowed++;
		await backdate(5000);
	}
	ok('a level-0 identity may post exactly five comments in an hour', allowed === 5, `${allowed}/5`);

	const sixth = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A sixth comment inside the same hour.'
	});
	ok(
		'the sixth is refused by the identity allowance',
		sixth.status === 429 &&
			sixth.body.error ===
				'you have posted 5 times this hour — the limit for your trust level, and it resets within the hour',
		`${sixth.status} ${sixth.body.error ?? ''}`
	);

	// The window is an hour, not a lifetime: a post older than it does not count.
	await backdate(3_700_000);
	const again = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A comment written once the hour has passed.'
	});
	ok('the same identity posts again once its window has passed', again.status === 200, again.body.error ?? '');

	// Promotion raises the ceiling: level 1 is twenty an hour, not five. Distinct
	// addresses keep the per-address bucket out of the measurement.
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	const atOne = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('level 1 publishes twenty an hour', atOne.body.can.commentsPerHour === 20, `${atOne.body.can.commentsPerHour}`);
	await backdate(3_700_000);
	let twenty = 0;
	for (let i = 0; i < 20; i++) {
		const r = await call(
			env,
			alice.keys,
			alice.pubkey,
			'/api/post',
			{ thread_id: thread.body.id, body: `A level-one comment numbered ${i}, its own sentence.` },
			undefined,
			`203.0.113.${i + 1}`
		);
		if (r.status === 200) twenty++;
		await backdate(5000);
	}
	ok('a level-1 identity may post twenty comments in an hour', twenty === 20, `${twenty}/20`);

	const twentyFirst = await call(
		env,
		alice.keys,
		alice.pubkey,
		'/api/post',
		{ thread_id: thread.body.id, body: 'The twenty-first level-one comment.' },
		undefined,
		'203.0.113.99'
	);
	ok(
		'the twenty-first is refused by the raised allowance',
		twentyFirst.status === 429 && /20 times this hour/.test(twentyFirst.body.error ?? ''),
		`${twentyFirst.status} ${twentyFirst.body.error ?? ''}`
	);

	// The top of the ladder, so the mapping cannot quietly flatten to 20: level 2
	// and above publish sixty, and that is the number the check would enforce.
	await env.DB.prepare('UPDATE identities SET trust_level = 2 WHERE pubkey = ?').bind(alice.pubkey).run();
	const atTwo = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('level 2 publishes sixty an hour', atTwo.body.can.commentsPerHour === 60, `${atTwo.body.can.commentsPerHour}`);
}

console.log('\n  ── proposed changes ──\n');

{
	const env = freshEnv(alice.pubkey);
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await call(env, mallory.keys, mallory.pubkey, '/api/whoami');

	// Proposing needs an established identity: it costs a reviewer's attention.
	const early = await call(env, mallory.keys, mallory.pubkey, '/api/pr', {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'set',
		reason: 'The gazette gives a different date.',
		changes: [{ field: 'start', old_value: '1957-07-25', new_value: '1957-07-26' }]
	});
	ok('a new identity cannot propose a change', early.status === 403, early.body.error);

	await env.DB.prepare('UPDATE identities SET trust_level = 2 WHERE pubkey = ?').bind(alice.pubkey).run();
	await env.DB.prepare('UPDATE identities SET trust_level = 2 WHERE pubkey = ?').bind(mallory.pubkey).run();

	const empty = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'set',
		reason: 'Something is wrong here.',
		changes: []
	});
	ok('a proposal must say what should change', empty.status === 400, empty.body.error);

	const badOp = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'delete-everything',
		reason: 'A change the emitter could never apply.',
		changes: [{ field: 'start', new_value: 'x' }]
	});
	ok('an operation the emitter cannot apply is refused', badOp.status === 400, badOp.body.error);

	// Filed without evidence: allowed, because discussing it is how evidence arrives.
	const unsourced = await call(env, mallory.keys, mallory.pubkey, '/api/pr', {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'set',
		reason: 'I am fairly sure the date is a day out.',
		changes: [{ field: 'start', old_value: '1957-07-25', new_value: '1957-07-26' }]
	});
	ok('a proposal with no evidence can still be filed', unsourced.status === 200);

	// ...but accepting it would queue an unsourced claim for the graph, which the
	// build would reject. Rule 2 of AGENTS.md, enforced where it can be explained.
	const premature = await call(env, alice.keys, alice.pubkey, '/api/pr/review', {
		pr_id: unsourced.body.id,
		decision: 'accept',
		reason: 'looks right to me'
	});
	ok('an unsourced proposal cannot be accepted', premature.status === 400, premature.body.error);

	const asked = await call(env, alice.keys, alice.pubkey, '/api/pr/review', {
		pr_id: unsourced.body.id,
		decision: 'needs-evidence',
		reason: 'Cite the decree and this can go in.'
	});
	ok('a reviewer can ask for evidence instead', asked.status === 200 && asked.body.status === 'needs-evidence');

	// A sourced one.
	const sourced = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'set',
		reason: 'The appointment decree gives 26 July.',
		changes: [{ field: 'start', old_value: '1957-07-25', new_value: '1957-07-26' }],
		sources: [{ url: 'https://www.iort.gov.tn/example', title: 'Décret du 26 juillet 1957' }]
	});
	ok('a sourced proposal is filed', sourced.status === 200);

	const notReviewer = await call(env, mallory.keys, mallory.pubkey, '/api/pr/review', {
		pr_id: sourced.body.id,
		decision: 'accept',
		reason: 'I approve of my own work'
	});
	ok('a non-reviewer cannot decide', notReviewer.status === 403);

	const accepted = await call(env, alice.keys, alice.pubkey, '/api/pr/review', {
		pr_id: sourced.body.id,
		decision: 'accept',
		reason: 'Checked against the gazette index; the decree is dated 26 July.'
	});
	ok('a sourced proposal can be accepted', accepted.status === 200 && accepted.body.status === 'accepted');

	const credited = await env.DB.prepare('SELECT prs_accepted FROM identities WHERE pubkey = ?')
		.bind(alice.pubkey)
		.first<any>();
	ok('acceptance credits the author', credited.prs_accepted === 1);

	// Public while pending, and the whole history is readable.
	const listed = await get(env, '/api/prs');
	ok('proposals are readable without an identity', listed.status === 200 && listed.body.items.length === 2);
	const one = listed.body.items.find((p: any) => p.id === sourced.body.id);
	ok('the change is published', one.changes[0].new_value === '1957-07-26');
	ok('the old value is kept alongside', one.changes[0].old_value === '1957-07-25');
	ok('the evidence is published', one.sources.length === 1);
	ok('the reviewer decision and reasoning are published', one.reviews[0].reason.includes('gazette index'));
	ok('no key leaks through a proposal', !JSON.stringify(listed.body).includes(alice.pubkey));

	// Applying is a separate step, done by the editorial tool after the emitter and
	// git have actually run. Accepting does not change the graph.
	const tooEarly = await call(env, alice.keys, alice.pubkey, '/api/pr/applied', {
		pr_id: unsourced.body.id,
		sha: 'deadbeef'
	});
	ok('only an accepted proposal can be marked applied', tooEarly.status === 400);

	const applied = await call(env, alice.keys, alice.pubkey, '/api/pr/applied', {
		pr_id: sourced.body.id,
		sha: 'abc1234'
	});
	ok('an accepted proposal can be marked applied', applied.status === 200);

	const frozen = await call(env, alice.keys, alice.pubkey, '/api/pr/review', {
		pr_id: sourced.body.id,
		decision: 'reject',
		reason: 'changed my mind after it was already in the graph'
	});
	ok('an applied proposal cannot be re-decided', frozen.status === 400, frozen.body.error);

	// Withdrawal belongs to the author, not the reviewer.
	const notMine = await call(env, alice.keys, alice.pubkey, '/api/pr/withdraw', { pr_id: unsourced.body.id });
	ok('only the author can withdraw', notMine.status === 403);
	const mine = await call(env, mallory.keys, mallory.pubkey, '/api/pr/withdraw', { pr_id: unsourced.body.id });
	ok('the author can withdraw', mine.status === 200);
}

console.log('\n  ── a proposal source is a web address (B6) ──\n');

/*
 * Proposal sources are rendered as links by ProposalView, so the server must
 * refuse anything that is not http/https before it reaches a reader. The client
 * parser already refuses javascript: and data: inside post markdown
 * (scripts/test-markup.ts); this covers the field the parser never sees.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 2 WHERE pubkey = ?').bind(alice.pubkey).run();

	const base = {
		target_type: 'position',
		target_id: 'p-pres-bourguiba',
		operation: 'set',
		reason: 'Checking what the source field will accept.',
		changes: [{ field: 'start', old_value: '1957-07-25', new_value: '1957-07-26' }]
	};

	/*
	 * A refused source must be refused BEFORE the first insert.
	 *
	 * The check used to run inside the insert loop, after the `prs` and
	 * `pr_changes` rows were written, so a `javascript:` source left a pending
	 * proposal with no evidence attached behind it; a reviewer could accept a
	 * proposal whose sources never existed. The three tables are asserted
	 * separately because a partial write would leave exactly one behind.
	 */
	const prCounts = async () => ({
		prs: (await env.DB.prepare('SELECT COUNT(*) AS n FROM prs').first<any>()).n,
		changes: (await env.DB.prepare('SELECT COUNT(*) AS n FROM pr_changes').first<any>()).n,
		sources: (await env.DB.prepare('SELECT COUNT(*) AS n FROM pr_sources').first<any>()).n
	});
	const empty = await prCounts();
	ok('the proposal tables start empty', empty.prs === 0 && empty.changes === 0 && empty.sources === 0, JSON.stringify(empty));

	const script = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		...base,
		sources: [{ url: 'javascript:alert(1)', title: 'not a source' }]
	});
	ok(
		'a javascript: source URL is refused',
		script.status === 400 && script.body.error === 'a source URL must be an http or https web address',
		script.body.error
	);

	const afterScript = await prCounts();
	ok('a refused javascript: source leaves no prs row', afterScript.prs === empty.prs, `prs ${empty.prs} -> ${afterScript.prs}`);
	ok('nor a pr_changes row', afterScript.changes === empty.changes, `pr_changes ${empty.changes} -> ${afterScript.changes}`);
	ok('nor a pr_sources row', afterScript.sources === empty.sources, `pr_sources ${empty.sources} -> ${afterScript.sources}`);

	const data = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		...base,
		sources: [{ url: 'data:text/html,<script>alert(1)</script>', title: 'also not a source' }]
	});
	ok('a data: source URL is refused too', data.status === 400, data.body.error);

	const afterData = await prCounts();
	ok(
		'and the second refusal leaves the same clean slate',
		afterData.prs === empty.prs && afterData.changes === empty.changes && afterData.sources === empty.sources,
		JSON.stringify(afterData)
	);

	// The accepted half of the same rule, so tightening it to http-only or
	// refusing every URL in this field would fail here rather than pass silently.
	const https = await call(env, alice.keys, alice.pubkey, '/api/pr', {
		...base,
		sources: [{ url: 'https://www.iort.gov.tn/decret/1957-07-26', title: 'Décret du 26 juillet 1957' }]
	});
	ok('an https source URL is accepted', https.status === 200 && Boolean(https.body.id), https.body.error ?? '');
	const stored = await env.DB.prepare('SELECT url FROM pr_sources WHERE pr_id = ?').bind(https.body.id).first<any>();
	ok('the accepted URL is stored', stored?.url === 'https://www.iort.gov.tn/decret/1957-07-26', stored?.url);
}

console.log('\n  ── a new record is shaped before it is filed ──\n');

/*
 * `append-record` carries a whole record, so the server checks its shape before
 * the first insert: an appendable kind, a slug id, no collision with the graph,
 * and the fields that kind cannot exist without. A refused addition must leave no
 * prs row behind — the same defect the source-URL check above fixed, where a
 * partial write left a pending proposal with no evidence attached.
 *
 * The limiter for `pr` is 10/day per address; each call here comes from a
 * different test address so this section is about validation, not throttling
 * (which is covered on its own).
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 2 WHERE pubkey = ?').bind(alice.pubkey).run();

	const prCounts = async () => ({
		prs: (await env.DB.prepare('SELECT COUNT(*) AS n FROM prs').first<any>()).n,
		changes: (await env.DB.prepare('SELECT COUNT(*) AS n FROM pr_changes').first<any>()).n,
		sources: (await env.DB.prepare('SELECT COUNT(*) AS n FROM pr_sources').first<any>()).n
	});
	const clean = await prCounts();
	ok('the addition tables start empty', clean.prs === 0 && clean.changes === 0 && clean.sources === 0, JSON.stringify(clean));

	let address = 0;
	const file = (payload: unknown) =>
		call(env, alice.keys, alice.pubkey, '/api/pr', payload, undefined, `198.51.100.${++address}`);

	/** Refuse with `status` and `error`, and leave no prs row behind. */
	const refuses = async (name: string, payload: unknown, status: number, error: string) => {
		const r = await file(payload);
		const after = await prCounts();
		ok(
			name,
			r.status === status && r.body.error === error && after.prs === clean.prs,
			`${r.status} "${r.body.error ?? ''}" | prs ${clean.prs} -> ${after.prs}`
		);
	};

	const addition = (target_type: string, target_id: string, changes: { field: string; new_value: string }[]) => ({
		target_type,
		target_id,
		operation: 'append-record',
		reason: 'A record the graph does not hold yet.',
		changes,
		sources: [{ url: 'https://example.com/evidence' }]
	});

	// A kind the addition path does not offer. `role` is a real target type
	// everywhere else; the restriction is about the shape of an addition.
	await refuses(
		'"role" records are not added by proposal',
		addition('role', 'test-new-role', [
			{ field: 'id', new_value: 'test-new-role' },
			{ field: 'title_en', new_value: 'Test Role' }
		]),
		400,
		'"role" records are not added by proposal'
	);

	// The id becomes a URL and a filename before it becomes anything else.
	await refuses(
		'a new id with a space is refused',
		addition('person', 'New Person', [
			{ field: 'id', new_value: 'New Person' },
			{ field: 'name_en', new_value: 'New Person' },
			{ field: 'layers', new_value: 'political' }
		]),
		400,
		'a new record needs a lowercase id like "name-of-record"'
	);
	await refuses(
		'a one-character id is refused',
		addition('person', 'x', [
			{ field: 'id', new_value: 'x' },
			{ field: 'name_en', new_value: 'X' },
			{ field: 'layers', new_value: 'political' }
		]),
		400,
		'a new record needs a lowercase id like "name-of-record"'
	);

	// The id change field is what the emitter writes into the record; if it
	// disagreed with target_id, the reviewer would approve one record and the
	// apply step would create another.
	await refuses(
		'the id field must match the proposed id',
		addition('person', 'test-new-person', [
			{ field: 'id', new_value: 'someone-else' },
			{ field: 'name_en', new_value: 'Test New Person' },
			{ field: 'layers', new_value: 'political' }
		]),
		400,
		'the proposed id and the id field must agree'
	);

	// The local server knows every id in the built graph; an addition that would
	// collide with one is refused before it can be filed.
	env.ENTITY_IDS = new Set(['test-new-person']);
	await refuses(
		'an id already in the graph is refused',
		addition('person', 'test-new-person', [
			{ field: 'id', new_value: 'test-new-person' },
			{ field: 'name_en', new_value: 'Test New Person' },
			{ field: 'layers', new_value: 'political' }
		]),
		409,
		'a record with that id already exists'
	);
	delete env.ENTITY_IDS;

	// Every kind's required fields, one missing case at a time. A record that is
	// missing a field the build requires must be refused here, not queued for a
	// reviewer and then rejected by the emitter. The list is the taxonomy's
	// REQUIRED_FIELDS; `event` carries `summary` because the record IS the summary.
	const required: Record<string, string[]> = {
		person: ['name_en', 'layers'],
		institution: ['name_en', 'type', 'layer'],
		event: ['title_en', 'date', 'category', 'summary'],
		relationship: ['from', 'to', 'type', 'description', 'confidence'],
		position: ['role', 'holder', 'start']
	};
	const complete: Record<string, Record<string, string>> = {
		person: { name_en: 'Test New Person', layers: 'political' },
		institution: { name_en: 'Test New Institution', type: 'ministry', layer: 'political' },
		event: {
			title_en: 'Test New Event',
			date: '1957-07-26',
			category: 'political',
			summary: 'A summary the schema requires.'
		},
		relationship: {
			from: 'bourguiba',
			to: 'ben-ali',
			type: 'institutional',
			description: 'A tie.',
			confidence: 'B'
		},
		position: { role: 'president', holder: 'bourguiba', start: '1957-07-26' }
	};
	for (const [kind, fields] of Object.entries(required)) {
		for (const missing of fields) {
			const id = `test-new-${kind}`;
			const present = Object.entries(complete[kind])
				.filter(([field]) => field !== missing)
				.map(([field, new_value]) => ({ field, new_value }));
			await refuses(
				`a new ${kind} without "${missing}" is refused`,
				addition(kind, id, [{ field: 'id', new_value: id }, ...present]),
				400,
				`a new ${kind} needs a "${missing}"`
			);
		}
	}

	/*
	 * The vocabulary is taxonomy-driven (src/lib/taxonomy.ts), and
	 * test-proposals.ts pins that file against the schema. An unknown field is
	 * refused BY NAME: a silent drop would queue a record the emitter cannot write,
	 * and a silent pass would write a field the schema does not have.
	 */
	await refuses(
		'a field the kind does not have is refused by name',
		addition('person', 'test-new-person', [
			{ field: 'id', new_value: 'test-new-person' },
			{ field: 'name_en', new_value: 'Test New Person' },
			{ field: 'layers', new_value: 'political' },
			{ field: 'editorial_note', new_value: 'not a public field' }
		]),
		400,
		'a new person cannot set "editorial_note"'
	);
	await refuses(
		'an unknown field on another kind is named in the refusal too',
		addition('event', 'test-new-event', [
			{ field: 'id', new_value: 'test-new-event' },
			{ field: 'title_en', new_value: 'Test New Event' },
			{ field: 'date', new_value: '1957-07-26' },
			{ field: 'category', new_value: 'political' },
			{ field: 'summary', new_value: 'A summary.' },
			{ field: 'latitude', new_value: '36.8' }
		]),
		400,
		'a new event cannot set "latitude"'
	);

	/*
	 * Enumerated values are checked by value on every operation, not only on
	 * additions: a hand-crafted change cannot write an enum the schema rejects.
	 */
	await refuses(
		'an invalid confidence is refused by value',
		addition('person', 'test-new-person', [
			{ field: 'id', new_value: 'test-new-person' },
			{ field: 'name_en', new_value: 'Test New Person' },
			{ field: 'layers', new_value: 'political' },
			{ field: 'confidence', new_value: 'Z' }
		]),
		400,
		'"Z" is not a valid confidence'
	);
	await refuses(
		'an invalid layer is refused by value',
		addition('institution', 'test-new-institution', [
			{ field: 'id', new_value: 'test-new-institution' },
			{ field: 'name_en', new_value: 'Test New Institution' },
			{ field: 'type', new_value: 'ministry' },
			{ field: 'layer', new_value: 'spatial' }
		]),
		400,
		'"spatial" is not a valid layer'
	);
	await refuses(
		'an invalid event category is refused by value',
		addition('event', 'test-new-event', [
			{ field: 'id', new_value: 'test-new-event' },
			{ field: 'title_en', new_value: 'Test New Event' },
			{ field: 'date', new_value: '1957-07-26' },
			{ field: 'category', new_value: 'gossip' },
			{ field: 'summary', new_value: 'A summary.' }
		]),
		400,
		'"gossip" is not a valid category'
	);
	// The relationship kind carries its own enum in the addition shape.
	await refuses(
		'an invalid relationship type is refused by value',
		addition('relationship', 'test-new-tie', [
			{ field: 'id', new_value: 'test-new-tie' },
			{ field: 'from', new_value: 'bourguiba' },
			{ field: 'to', new_value: 'ben-ali' },
			{ field: 'type', new_value: 'friend-of' },
			{ field: 'description', new_value: 'A tie.' },
			{ field: 'confidence', new_value: 'B' }
		]),
		400,
		'"friend-of" is not a valid relationship type'
	);

	// Present but blank is the same as missing: the build would reject the empty
	// value, so the reviewer should never be asked to look at it.
	await refuses(
		'a required field that is only whitespace is refused',
		addition('person', 'test-new-person', [
			{ field: 'id', new_value: 'test-new-person' },
			{ field: 'name_en', new_value: '   ' },
			{ field: 'layers', new_value: 'political' }
		]),
		400,
		'a new person needs a "name_en"'
	);

	// Rule 4: below grade B the claim must name who is making it.
	await refuses(
		'a grade C relationship without attribution is refused',
		addition('relationship', 'test-new-tie', [
			{ field: 'id', new_value: 'test-new-tie' },
			{ field: 'from', new_value: 'bourguiba' },
			{ field: 'to', new_value: 'ben-ali' },
			{ field: 'type', new_value: 'institutional' },
			{ field: 'description', new_value: 'A reported tie.' },
			{ field: 'confidence', new_value: 'C' }
		]),
		400,
		'a grade C or D claim must name who is making it'
	);

	// The rule names both grades and the implementation is an `||`, so grade D
	// has to be refused by the same branch, on a kind whose required fields do
	// not include confidence at all.
	await refuses(
		'a grade D position without attribution is refused',
		addition('position', 'test-new-position', [
			{ field: 'id', new_value: 'test-new-position' },
			{ field: 'role', new_value: 'president' },
			{ field: 'holder', new_value: 'bourguiba' },
			{ field: 'start', new_value: '1957-07-26' },
			{ field: 'confidence', new_value: 'D' }
		]),
		400,
		'a grade C or D claim must name who is making it'
	);

	/*
	 * When the local server knows every graph id (env.ENTITY_IDS), a relationship
	 * or position whose ends do not resolve is refused before it can be filed: a
	 * reviewer should never be asked to accept a tie to a record that is not there.
	 */
	env.ENTITY_IDS = new Set(['bourguiba', 'ben-ali', 'president']);
	await refuses(
		'a relationship whose "from" is not in the graph is refused 404',
		addition('relationship', 'test-new-tie', [
			{ field: 'id', new_value: 'test-new-tie' },
			{ field: 'from', new_value: 'not-in-graph' },
			{ field: 'to', new_value: 'ben-ali' },
			{ field: 'type', new_value: 'institutional' },
			{ field: 'description', new_value: 'A tie.' },
			{ field: 'confidence', new_value: 'B' }
		]),
		404,
		'no record "not-in-graph" in the graph for "from"'
	);
	await refuses(
		'a relationship whose "to" is not in the graph is refused 404',
		addition('relationship', 'test-new-tie', [
			{ field: 'id', new_value: 'test-new-tie' },
			{ field: 'from', new_value: 'bourguiba' },
			{ field: 'to', new_value: 'not-in-graph' },
			{ field: 'type', new_value: 'institutional' },
			{ field: 'description', new_value: 'A tie.' },
			{ field: 'confidence', new_value: 'B' }
		]),
		404,
		'no record "not-in-graph" in the graph for "to"'
	);
	await refuses(
		'a position whose "role" is not in the graph is refused 404',
		addition('position', 'test-new-position', [
			{ field: 'id', new_value: 'test-new-position' },
			{ field: 'role', new_value: 'not-in-graph' },
			{ field: 'holder', new_value: 'bourguiba' },
			{ field: 'start', new_value: '1957-07-26' }
		]),
		404,
		'no record "not-in-graph" in the graph for "role"'
	);
	await refuses(
		'a position whose "holder" is not in the graph is refused 404',
		addition('position', 'test-new-position', [
			{ field: 'id', new_value: 'test-new-position' },
			{ field: 'role', new_value: 'president' },
			{ field: 'holder', new_value: 'not-in-graph' },
			{ field: 'start', new_value: '1957-07-26' }
		]),
		404,
		'no record "not-in-graph" in the graph for "holder"'
	);
	// The accepted half, so a rule that refused every reference would fail here.
	const linked = await file(
		addition('relationship', 'test-new-linked-tie', [
			{ field: 'id', new_value: 'test-new-linked-tie' },
			{ field: 'from', new_value: 'bourguiba' },
			{ field: 'to', new_value: 'ben-ali' },
			{ field: 'type', new_value: 'institutional' },
			{ field: 'description', new_value: 'A tie between two records that exist.' },
			{ field: 'confidence', new_value: 'B' }
		])
	);
	ok('a relationship whose ends resolve is filed', linked.status === 200, linked.body.error ?? '');
	delete env.ENTITY_IDS;

	// The accepted half: naming the claimant clears the rule, so a tightening
	// that refused every C/D record would fail here rather than pass silently.
	const attributed = await file(
		addition('relationship', 'test-new-attributed-tie', [
			{ field: 'id', new_value: 'test-new-attributed-tie' },
			{ field: 'from', new_value: 'bourguiba' },
			{ field: 'to', new_value: 'ben-ali' },
			{ field: 'type', new_value: 'institutional' },
			{ field: 'description', new_value: 'A reported tie.' },
			{ field: 'confidence', new_value: 'C' },
			{ field: 'attributed_to', new_value: 'Tunisian press, 1987' }
		])
	);
	ok('a grade C relationship that names its claimant is filed', attributed.status === 200, attributed.body.error ?? '');
	const attributedFields = (await env.DB.prepare('SELECT field FROM pr_changes WHERE pr_id = ?').bind(attributed.body.id).all<any>())
		.results.map((c: any) => c.field)
		.sort();
	ok('the attribution is stored with the claim', attributedFields.includes('attributed_to'), attributedFields.join(','));

	// A complete position is appendable: its three required fields pass the shape
	// check without a confidence, since none is required for this kind.
	const position = await file(
		addition('position', 'test-new-position', [
			{ field: 'id', new_value: 'test-new-position' },
			{ field: 'role', new_value: 'president' },
			{ field: 'holder', new_value: 'bourguiba' },
			{ field: 'start', new_value: '1957-07-26' }
		])
	);
	ok('a complete position is filed', position.status === 200, position.body.error ?? '');

	// A padded target_id and id change are trimmed once on the way in, so the row,
	// the change and the reviewer's record all carry the same string. Storing the
	// raw padding would make the proposal disagree with the id it was filed under.
	const padded = await file(
		addition('person', ' test-new-padded ', [
			{ field: 'id', new_value: ' test-new-padded ' },
			{ field: 'name_en', new_value: 'Test New Padded' },
			{ field: 'layers', new_value: 'political' }
		])
	);
	ok('a padded id is accepted after trimming', padded.status === 200, padded.body.error ?? '');
	const paddedRow = await env.DB.prepare('SELECT target_id FROM prs WHERE id = ?').bind(padded.body.id).first<any>();
	const paddedId = await env.DB.prepare("SELECT new_value FROM pr_changes WHERE pr_id = ? AND field = 'id'")
		.bind(padded.body.id)
		.first<any>();
	ok(
		'the stored proposal and the id change both carry the trimmed id',
		paddedRow?.target_id === 'test-new-padded' && paddedId?.new_value === 'test-new-padded',
		`${paddedRow?.target_id} / ${paddedId?.new_value}`
	);

	// The accepted half: a well-formed addition is filed with its changes and
	// sources, all three tables moving together.
	const before = await prCounts();
	const filed = await file({
		target_type: 'person',
		target_id: 'test-new-person',
		operation: 'append-record',
		reason: 'A person the graph does not hold, with evidence.',
		changes: [
			{ field: 'id', new_value: 'test-new-person' },
			{ field: 'name_en', new_value: 'Test New Person' },
			{ field: 'layers', new_value: 'security, political' }
		],
		sources: [{ source_id: 'jort-2022-546' }, { url: 'https://example.com/evidence' }]
	});
	ok('a well-formed addition is filed', filed.status === 200 && Boolean(filed.body.id), filed.body.error ?? '');

	const after = await prCounts();
	ok('the addition stores one proposal', after.prs === before.prs + 1, `prs ${before.prs} -> ${after.prs}`);
	ok('its three changes are stored', after.changes === before.changes + 3, `pr_changes ${before.changes} -> ${after.changes}`);
	ok('both sources are stored', after.sources === before.sources + 2, `pr_sources ${before.sources} -> ${after.sources}`);

	const row = await env.DB.prepare('SELECT operation, target_type, target_id FROM prs WHERE id = ?')
		.bind(filed.body.id)
		.first<any>();
	ok(
		'the stored proposal is an append-record for the named kind and id',
		row?.operation === 'append-record' && row?.target_type === 'person' && row?.target_id === 'test-new-person',
		JSON.stringify(row)
	);
	const storedFields = (await env.DB.prepare('SELECT field FROM pr_changes WHERE pr_id = ?').bind(filed.body.id).all<any>())
		.results.map((c: any) => c.field)
		.sort();
	ok('the whole proposed record is stored', storedFields.join(',') === 'id,layers,name_en', storedFields.join(','));
}

console.log('\n  ── entity mentions ──\n');

{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', { target_type: 'open', title: 'Mentions' });
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'Ben Ali appointed him after the 1987 transfer.'
	});

	const linked = await call(env, alice.keys, alice.pubkey, '/api/mention', {
		post_id: post.body.id, entity_id: 'ben-ali', entity_type: 'person', start_offset: 0, end_offset: 7
	});
	ok('a human can link a mention to a graph entity', linked.status === 200);

	const orphan = await call(env, alice.keys, alice.pubkey, '/api/mention', {
		post_id: 'no-such-post', entity_id: 'ben-ali', entity_type: 'person'
	});
	ok('a mention on a missing post is refused', orphan.status === 404);

	const back = await get(env, '/api/mentions?posts=' + post.body.id);
	ok('confirmed mentions read back', back.body.items.length === 1 && back.body.items[0].entity_id === 'ben-ali');

	// Stored as confirmed-by-a-human, which is what a future suggester gets measured
	// against. Nothing is ever linked automatically.
	const row = await env.DB.prepare('SELECT confirmed, created_by FROM post_entities').first();
	ok('the link records that a human confirmed it', row.confirmed === 1 && row.created_by === alice.pubkey);

	/*
	 * The offsets are part of the read.
	 *
	 * Without them a mention says only that a post refers to Ben Ali somewhere, and
	 * the renderer cannot mark which words — so the feature silently degrades to
	 * plain prose, which looks exactly like it was never wired up. It shipped that
	 * way once for precisely that reason: the failure is invisible.
	 */
	ok(
		'a mention reads back with the span it covers',
		back.body.items[0].start === 0 && back.body.items[0].end === 7
	);
}

/*
 * Mentions arriving with the post.
 *
 * Filing them as separate calls charged one `comment` rate-limit unit each, so a
 * new identity — five comments an hour — was throttled by writing a single
 * sentence naming four people, and told to slow down rather than told the truth.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', { target_type: 'open', title: 'Inline' });

	const body = 'Ben Ali and Bourguiba both held it.';
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body,
		mentions: [
			{ entity_id: 'ben-ali', start: 0, end: 7 },
			{ entity_id: 'bourguiba', start: 12, end: 21 },
			// Refused spans, mixed in with the good ones on purpose.
			{ entity_id: 'x', start: 5, end: 2 },
			{ entity_id: 'y', start: 0, end: 9999 },
			{ entity_id: '', start: 1, end: 2 }
		]
	});
	ok('a post carries its mentions in one call', post.status === 200);

	const back = await get(env, '/api/mentions?posts=' + post.body.id);
	const got = back.body.items;
	ok('both well-formed mentions are stored', got.length === 2, `${got.length} stored`);
	ok(
		'a reversed span, an out-of-range span and an empty id are all dropped',
		!got.some((m: any) => ['x', 'y', ''].includes(m.entity_id))
	);
	ok(
		'the spans index the body the author wrote',
		body.slice(got[0].start, got[0].end) === 'Ben Ali' &&
			body.slice(got[1].start, got[1].end) === 'Bourguiba'
	);

}

/*
 * The post must survive its annotations being unusable. The body is what the author
 * wrote; a span we cannot parse is our problem to drop, not a reason to lose their
 * text.
 *
 * Its own env, because MIN_INTERVAL_MS puts a four-second floor between two posts
 * by one identity — writing this as a second post in the block above measured the
 * flood guard and reported it as a mention failure.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await env.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', { target_type: 'open', title: 'Junk' });

	const junk = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'A post whose annotations are unusable.',
		mentions: [{ entity_id: 'ben-ali', start: 'nonsense', end: null }]
	});
	ok('a post with only malformed mentions is still accepted', junk.status === 200, junk.body.error ?? '');

	const back = await get(env, '/api/mentions?posts=' + junk.body.id);
	ok('and stores none of them', back.body.items.length === 0);
}

console.log('\n  ── chosen names ──\n');

/*
 * The impersonation hole this closes.
 *
 * `publicAuthor` returned `display_name ?? handle`, so a chosen name REPLACED the
 * derived one. Setting yours to `anon-dp5d` made you that person; setting it to
 * "DeepTunisia Moderator" made you us. One field update, from any identity, at trust
 * level zero, with no moderation step in between.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');

	const named = await call(env, alice.keys, alice.pubkey, '/api/name', {
		display_name: 'Amira',
		self_description: 'journalist'
	});
	ok('a name and a self-description can be set', named.status === 200);

	const me = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('the derived handle survives a chosen name', me.body.handle.startsWith('anon-'));
	ok('the chosen name is returned beside it, never instead', me.body.name === 'Amira');
	ok('the self-description comes back as its own field', me.body.note === 'journalist');

	for (const [what, value] of [
		['a handle-shaped name', 'anon-dp5d'],
		['a name claiming moderation', 'Site Moderator'],
		['a name claiming verification', 'Verified journalist'],
		['a name claiming to be the project', 'DeepTunisia staff'],
		['an Arabic claim of moderation', 'مشرف الموقع']
	] as const) {
		const bad = await call(env, alice.keys, alice.pubkey, '/api/name', { display_name: value });
		ok(`${what} is refused`, bad.status !== 200, bad.body.error ?? 'accepted!');
	}

	/*
	 * Bidi overrides matter more here than anywhere else in the product: this
	 * interface is Arabic-first and RTL by default, so an embedded override changes
	 * how a name renders without changing what is stored.
	 */
	const bidi = await call(env, alice.keys, alice.pubkey, '/api/name', {
		display_name: 'Amira‮reversed'
	});
	ok('a name containing a bidi override is refused', bidi.status !== 200);

	const zero = await call(env, alice.keys, alice.pubkey, '/api/name', {
		display_name: 'Ami​ra'
	});
	ok('a name containing a zero-width character is refused', zero.status !== 200);

	const empty = await call(env, alice.keys, alice.pubkey, '/api/name', { display_name: '...' });
	ok('a name with no letters at all is refused', empty.status !== 200);

	const cleared = await call(env, alice.keys, alice.pubkey, '/api/name', {
		display_name: null,
		self_description: null
	});
	ok('a name can always be given up', cleared.status === 200 && cleared.body.name === null);
}

/*
 * The snapshot.
 *
 * Reading labels live means renaming yourself to "lawyer" silently re-labels every
 * post you have ever written, back to the first one — re-weighting arguments people
 * have already read and answered. What somebody claimed to be when they said it is
 * part of what they said.
 */
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	await call(env, alice.keys, alice.pubkey, '/api/name', {
		display_name: 'Amira',
		self_description: 'reader'
	});

	const thread = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'Before the rename'
	});
	const post = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: thread.body.id,
		body: 'Said while calling myself a reader.'
	});
	ok('a post records the labels in force when it was written', post.status === 200);

	const before = await get(env, '/api/posts?thread_id=' + thread.body.id);
	ok('a post written under a name carries it', before.body.items[0].author.name === 'Amira');
	ok(
		'and the derived handle beside it, never instead of it',
		/^anon-/.test(before.body.items[0].author.handle)
	);

	await call(env, alice.keys, alice.pubkey, '/api/name', {
		display_name: 'Amira',
		self_description: 'lawyer'
	});

	const posts = await get(env, '/api/posts?thread_id=' + thread.body.id);
	ok(
		'renaming does not retroactively re-label an existing post',
		posts.body.items[0].author.note === 'reader',
		`got "${posts.body.items[0].author.note}"`
	);
	const threads = await get(env, '/api/threads');
	ok(
		'nor an existing thread',
		threads.body.items[0].author.note === 'reader',
		`got "${threads.body.items[0].author.note}"`
	);
	ok(
		'and the handle is on the post too, not only the name',
		posts.body.items[0].author.handle.startsWith('anon-')
	);

	// The identity itself did change — it is only what was already written that is fixed.
	const now = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('the identity itself carries the new description', now.body.note === 'lawyer');
}

/*
 * Cold start. Every identity is level 0 on day one, so a forum where level 0 cannot
 * open a thread can never have a first thread: promotion needs five posts, and posts
 * need somewhere to go.
 */
{
	const env = freshEnv();
	const me = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('a brand-new identity is level 0', me.body.trust_level === 0);
	ok('and may still open a thread', me.body.can.createThread === true);
	ok('but only one a day', me.body.can.threadsPerDay === 1);

	const first = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'The first thread on the site'
	});
	ok('the first thread on an empty site can be opened', first.status === 200, first.body.error ?? '');
}

console.log('\n  ── spec §15: handle width, mention confirmation, trust boundary ──\n');

// 15.1 — the handle is 96 bits and a 100k mint cannot collide.
{
	const seen = new Set<string>();
	let collided = 0;
	const BATCH = 500;
	for (let base = 0; base < 100_000; base += BATCH) {
		const digests = await Promise.all(
			Array.from({ length: BATCH }, (_, j) => handleFor(`pubkey-${base + j}-${j % 7}`))
		);
		for (const h of digests) {
			if (seen.has(h)) collided++;
			seen.add(h);
		}
	}
	ok('100,000 minted handles do not collide', collided === 0, `${collided} collision(s)`);
	ok('a handle carries 96 bits of digest (anon- + 16 base64url chars)', /^anon-[A-Za-z0-9_-]{16}$/.test(await handleFor(alice.pubkey)), await handleFor(alice.pubkey));
}

// 15.2 — confirmation is author/moderator only; a stranger cannot clobber.
{
	const env = freshEnv();
	const bob = await createIdentity();
	const t = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'ben-ali',
		title: 'mention thread'
	});
	const p = await call(env, alice.keys, alice.pubkey, '/api/post', {
		thread_id: t.body.id,
		body: 'A body with a name to annotate.'
	});

	const suggest = async (spanEnd: number) =>
		call(env, bob.keys, bob.pubkey, '/api/mention', {
			post_id: p.body.id,
			entity_id: 'ben-ali',
			entity_type: 'person',
			start_offset: 0,
			end_offset: spanEnd
		});

	const s1 = await suggest(4);
	ok('a stranger suggestion is recorded unconfirmed', s1.status === 200 && s1.body.confirmed === 0, s1.body.error);
	ok('a stranger cannot confirm their own suggestion', (await suggest(4)).body.confirmed === 0);

	const auth = await call(env, alice.keys, alice.pubkey, '/api/mention', {
		post_id: p.body.id,
		entity_id: 'ben-ali',
		entity_type: 'person',
		start_offset: 0,
		end_offset: 4
	});
	ok('the post author can confirm a mention', auth.status === 200 && auth.body.confirmed === 1, auth.body.error);

	const clob = await suggest(9);
	ok('a stranger cannot overwrite a confirmed span', clob.status === 409, clob.body.error);
	const row = await env.DB.prepare('SELECT end_offset, created_by, confirmed FROM post_entities WHERE post_id = ?')
		.bind(p.body.id)
		.first<any>();
	ok('the confirmed span is intact after the attempt', row?.end_offset === 4 && row?.confirmed === 1 && row?.created_by === alice.pubkey);
}

// R1 — identity minting is rate limited per address.
{
	const env = freshEnv();
	for (let i = 0; i < 5; i++) {
		const k = await createIdentity();
		const r = await call(env, k.keys, k.pubkey, '/api/whoami', {}, undefined, '198.51.100.10');
		ok(`identity ${i + 1} mints freely from one address`, r.status === 200, r.body.error);
	}
	const sixth = await createIdentity();
	const r6 = await call(env, sixth.keys, sixth.pubkey, '/api/whoami', {}, undefined, '198.51.100.10');
	ok('the sixth mint from one address in a day is refused', r6.status === 429, r6.body.error);
	const other = await createIdentity();
	const rOther = await call(env, other.keys, other.pubkey, '/api/whoami', {}, undefined, '198.51.100.11');
	ok('a different address is not throttled', rOther.status === 200, rOther.body.error);
}

// R2 — the local trust boundary ignores forwarded headers.
{
	const r = localRequest(
		'http://127.0.0.1:5200/x',
		{ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': 'spoofed' } },
		'127.0.0.1'
	);
	ok('localRequest drops a spoofed x-forwarded-for', r.headers.get('x-forwarded-for') === null);
	ok('localRequest keeps only the socket address', r.headers.get('cf-connecting-ip') === '127.0.0.1');
}

// R4 — write targets must resolve to something real.
{
	const env = freshEnv();
	const t = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'person',
		target_id: 'ben-ali',
		title: 'targets'
	});
	const p = await call(env, alice.keys, alice.pubkey, '/api/post', { thread_id: t.body.id, body: 'body' });

	ok('a vote on a missing post is refused', (await call(env, mallory.keys, mallory.pubkey, '/api/vote', { target_type: 'post', target_id: 'no-such-post', value: 1 })).status === 404);
	ok('a vote on a missing thread is refused', (await call(env, mallory.keys, mallory.pubkey, '/api/vote', { target_type: 'thread', target_id: 'no-such-thread', value: 1 })).status === 404);
	ok('a report on a missing post is refused', (await call(env, mallory.keys, mallory.pubkey, '/api/report', { target_type: 'post', target_id: 'no-such-post', reason: 'spam' })).status === 404);
	ok('a reply to a missing parent is refused', (await call(env, mallory.keys, mallory.pubkey, '/api/post', { thread_id: t.body.id, body: 'orphan', parent_id: 'no-such-parent' })).status === 404);

	const t2 = await call(env, mallory.keys, mallory.pubkey, '/api/thread', { target_type: 'open', title: 'other' });
	const cross = await call(env, mallory.keys, mallory.pubkey, '/api/post', { thread_id: t2.body.id, body: 'cross', parent_id: p.body.id });
	ok('a reply cannot cross threads', cross.status === 400, cross.body.error);

	const envIndexed = freshEnv();
	envIndexed.ENTITY_IDS = new Set(['ben-ali']);
	await call(envIndexed, alice.keys, alice.pubkey, '/api/whoami');
	// Two threads need more than the level-0 allowance of one.
	await envIndexed.DB.prepare('UPDATE identities SET trust_level = 1 WHERE pubkey = ?').bind(alice.pubkey).run();
	ok('a thread pinned to a real entity passes the index', (await call(envIndexed, alice.keys, alice.pubkey, '/api/thread', { target_type: 'person', target_id: 'ben-ali', title: 'real' })).status === 200);
	ok('a thread pinned to a missing entity is refused', (await call(envIndexed, alice.keys, alice.pubkey, '/api/thread', { target_type: 'person', target_id: 'not-in-graph', title: 'fake' })).status === 404);
}

// R5 — thread reads are paginated with an opaque cursor.
{
	const env = freshEnv();
	const t = await call(env, alice.keys, alice.pubkey, '/api/thread', { target_type: 'open', title: 'big' });
	const insert = env.DB.prepare(
		`INSERT INTO posts (id, thread_id, parent_id, body, created_at, created_by, author_name, author_note)
		 VALUES (?, ?, NULL, ?, ?, ?, 'Alice', '')`
	);
	for (let i = 0; i < 205; i++) {
		await insert.bind(`pg-post-${i}`, t.body.id, `body ${i}`, 1_700_000_000_000 + i * 1000, alice.pubkey).run();
	}
	const page1 = await get(env, `/api/posts?thread_id=${t.body.id}`);
	ok('a page is bounded', page1.body.items.length === 200, `${page1.body.items.length} items`);
	ok('the first page carries a cursor', typeof page1.body.next_cursor === 'string');
	const page2 = await get(env, `/api/posts?thread_id=${t.body.id}&cursor=${encodeURIComponent(page1.body.next_cursor)}`);
	ok('the second page holds the rest', page2.body.items.length === 5 && page2.body.next_cursor === null, `${page2.body.items.length} items`);
	const ids = [...page1.body.items, ...page2.body.items].map((x: any) => x.id);
	ok('no post is skipped or repeated across pages', ids.length === 205 && ids.length === new Set(ids).size);
}

// R5 — every list read is a bounded page, and one thread has a permalink.
{
	const env = freshEnv();
	await call(env, alice.keys, alice.pubkey, '/api/whoami');

	// One thread opened through the API, so the single-thread read is tested
	// against a row the write path actually made.
	const only = await call(env, alice.keys, alice.pubkey, '/api/thread', {
		target_type: 'open',
		title: 'The one thread the permalink resolves'
	});
	const single = await get(env, `/api/thread?id=${only.body.id}`);
	ok(
		'GET /api/thread returns the thread by id',
		single.status === 200 &&
			single.body.id === only.body.id &&
			single.body.title === 'The one thread the permalink resolves',
		`${single.status}`
	);
	const missingThread = await get(env, '/api/thread?id=no-such-thread');
	ok(
		'GET /api/thread 404s for a thread that is not there',
		missingThread.status === 404 && missingThread.body.error === 'no such thread',
		`${missingThread.status} ${missingThread.body.error ?? ''}`
	);

	// 205 rows seeded directly, plus the API thread: two pages, 200 then 6.
	const insertThread = env.DB.prepare(
		`INSERT INTO threads (id, target_type, target_id, title, created_at, created_by, author_name, author_note, kind)
		 VALUES (?, 'open', NULL, ?, ?, ?, NULL, NULL, 'discussion')`
	);
	for (let i = 0; i < 205; i++) {
		await insertThread
			.bind(`pg-thread-${i}`, `Paged thread ${i}`, 1_700_000_000_000 + i * 1000, alice.pubkey)
			.run();
	}
	const threads1 = await get(env, '/api/threads');
	ok('a thread page is capped at 200', threads1.body.items.length === 200, `${threads1.body.items.length} items`);
	ok('the first thread page carries a cursor', typeof threads1.body.next_cursor === 'string');
	const threads2 = await get(env, `/api/threads?cursor=${encodeURIComponent(threads1.body.next_cursor)}`);
	ok(
		'the second thread page holds the rest',
		threads2.body.items.length === 6 && threads2.body.next_cursor === null,
		`${threads2.body.items.length} items`
	);
	const threadIds = [...threads1.body.items, ...threads2.body.items].map((t: any) => t.id);
	ok(
		'no thread is skipped or repeated across the thread pages',
		threadIds.length === 206 && threadIds.length === new Set(threadIds).size,
		`${threadIds.length} ids`
	);

	// 55 proposals: 50 then 5.
	const insertPr = env.DB.prepare(
		`INSERT INTO prs (id, created_by, author_name, author_note, created_at, updated_at, target_type, target_id, operation, reason)
		 VALUES (?, ?, NULL, NULL, ?, ?, 'position', 'p-pres-bourguiba', 'set', 'a paged proposal')`
	);
	for (let i = 0; i < 55; i++) {
		await insertPr
			.bind(`pg-pr-${i}`, alice.pubkey, 1_700_000_000_000 + i * 1000, 1_700_000_000_000 + i * 1000)
			.run();
	}
	const prs1 = await get(env, '/api/prs');
	ok('a proposal page is capped at 50', prs1.body.items.length === 50, `${prs1.body.items.length} items`);
	ok('the first proposal page carries a cursor', typeof prs1.body.next_cursor === 'string');
	const prs2 = await get(env, `/api/prs?cursor=${encodeURIComponent(prs1.body.next_cursor)}`);
	ok(
		'the second proposal page holds the rest',
		prs2.body.items.length === 5 && prs2.body.next_cursor === null,
		`${prs2.body.items.length} items`
	);
	const prIds = [...prs1.body.items, ...prs2.body.items].map((p: any) => p.id);
	ok(
		'no proposal is skipped or repeated across the proposal pages',
		prIds.length === 55 && prIds.length === new Set(prIds).size,
		`${prIds.length} ids`
	);

	/*
	 * The moderation queue is bounded twice: at most 500 open reports considered,
	 * at most 100 grouped targets returned. One hundred and five reported posts
	 * with a report each must come back as one hundred entries.
	 */
	const insertPost = env.DB.prepare(
		`INSERT INTO posts (id, thread_id, parent_id, body, created_at, created_by, author_name, author_note)
		 VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL)`
	);
	const insertReport = env.DB.prepare(
		`INSERT INTO reports (id, target_type, target_id, reporter, reason, details, status, created_at)
		 VALUES (?, 'post', ?, ?, 'spam', NULL, 'open', ?)`
	);
	for (let i = 0; i < 105; i++) {
		const at = 1_700_000_000_000 + i * 1000;
		await insertPost.bind(`q-post-${i}`, only.body.id, `Queue body ${i}`, at, alice.pubkey).run();
		await insertReport.bind(`q-report-${i}`, `q-post-${i}`, alice.pubkey, at).run();
	}
	const queue = await get(env, '/api/queue');
	ok(
		'the moderation queue returns at most 100 grouped targets',
		queue.body.items.length === 100,
		`${queue.body.items.length} entries`
	);
}

// R6 — the advertised capability matches authorization.
{
	const env = freshEnv(alice.pubkey);
	await call(env, alice.keys, alice.pubkey, '/api/whoami');
	const who = await call(env, alice.keys, alice.pubkey, '/api/whoami');
	ok('a listed moderator is advertised as one', who.body.can.moderate === true);

	const env2 = freshEnv(alice.pubkey);
	await call(env2, mallory.keys, mallory.pubkey, '/api/whoami');
	await env2.DB.prepare('UPDATE identities SET trust_level = 3 WHERE pubkey = ?').bind(mallory.pubkey).run();
	const whoM = await call(env2, mallory.keys, mallory.pubkey, '/api/whoami');
	ok('an unlisted high-trust identity is not advertised as a moderator', whoM.body.can.moderate === false);
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}
`);
if (failures) process.exit(1);
