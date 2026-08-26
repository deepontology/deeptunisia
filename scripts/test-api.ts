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
	return { DB: db, RATE_PEPPER: 'a-pepper-long-enough-for-tests', MODERATORS: moderators };
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
	ok('a new identity can still comment', plain.status === 200);

	const nowhere = await call(env, mallory.keys, mallory.pubkey, '/api/post', {
		thread_id: 'no-such-thread',
		body: 'a reply to nothing'
	});
	ok('a post to a missing thread is refused', nowhere.status === 404);
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
