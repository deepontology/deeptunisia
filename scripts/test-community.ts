/**
 * Assertions over the community layer.
 *
 * Modelled on scripts/test-feed.ts, which asserts that third-party headlines never
 * become project data. This does the same job for a larger and more dangerous body of
 * content: things strangers wrote about named Tunisian officials.
 *
 * Two families of check, and the first matters more.
 *
 * THE WALL. Community content is not evidence. It carries no basis, no confidence
 * grade and no source, because none has been assessed; it is counted in no published
 * statistic; and the graph build must never read it. A post is somebody's opinion
 * until a human turns it into a sourced claim through the PR workflow.
 *
 * THE RULES THAT PROTECT PEOPLE. Downvotes must not be able to bury a post. Reports
 * must not be able to hide one. A replayed signature must not count twice. A rate
 * limiter must not retain what it is rate-limiting. Each of these is asserted by
 * making the bad thing happen and checking it is refused — an assertion that has only
 * ever seen the good case is not an assertion, which this repository has already
 * learned twice.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	createIdentity,
	signAction,
	verifyAction,
	handleFor,
	capabilitiesFor,
	earnedLevel,
	payloadOf,
	TRUST,
	IdentityError,
	type Identity
} from '../community/identity.ts';
import { bucketKey, consume, saltForDay, RateLimitError, type Bucket } from '../community/ratelimit.ts';
import { score, rank, reportPressure, MIN_EFFECTIVE_SCORE } from '../community/ranking.ts';
import { checkHoneypot, checkInterval, checkLinkCount, countLinks, isDuplicate } from '../community/abuse.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

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

async function rejects(name: string, fn: () => Promise<unknown>, expect: string) {
	checks++;
	try {
		await fn();
		failures++;
		console.error(`  FAIL  ${name} — expected a refusal, got none`);
	} catch (e) {
		const message = (e as Error).message;
		if (message.includes(expect)) console.log(`  ok    ${name} — ${message}`);
		else {
			failures++;
			console.error(`  FAIL  ${name} — wrong error: ${message}`);
		}
	}
}

console.log('\n  ── the wall ──\n');

{
	/*
	 * Strip comments before checking.
	 *
	 * The schema's own comments say what it deliberately does NOT store, so grepping
	 * the raw file for "fingerprint" matched the sentence promising there is no
	 * fingerprint column. The assertion must read the DDL, not the documentation
	 * about the DDL — otherwise explaining a rule is enough to violate it.
	 */
	const schema = read('community/schema.sql')
		.split('\n')
		.filter((l) => !l.trim().startsWith('--'))
		.join('\n');

	// A column that graded community content would let a post render as evidence.
	for (const forbidden of ['basis', 'confidence', 'falsifiable_by', 'attributed_to']) {
		ok(
			`the schema has no "${forbidden}" column`,
			!new RegExp(`^\\s*${forbidden}\\s`, 'im').test(schema),
			'community content is not graded'
		);
	}

	// The identifiers the audit forbids storing.
	for (const forbidden of ['ip_address', 'user_agent', 'fingerprint', 'last_seen']) {
		ok(`the schema stores no "${forbidden}"`, !new RegExp(forbidden, 'i').test(schema));
	}

	// The graph build must not know this directory exists.
	const build = read('scripts/build-data.ts');
	ok('the graph build never reads community/', !/community\//.test(build));
	ok('the graph build never reads the community schema', !/schema\.sql/.test(build));

	// ...and the community layer must not import the graph's build or schema.
	for (const file of ['community/identity.ts', 'community/ranking.ts', 'community/ratelimit.ts']) {
		const src = read(file);
		ok(
			`${file} does not reach into the graph`,
			!/\.\.\/(scripts|data|src)\//.test(src),
			'community code stands alone'
		);
	}

	// Removal must be an act by a person, with a reason.
	ok('removals record who and why', /removed_by/.test(schema) && /removed_reason/.test(schema));
	ok('moderation actions are logged with a reason', /moderation_actions/.test(schema) && /reason\s+TEXT NOT NULL/.test(schema));
}

console.log('\n  ── downvotes cannot bury, reports cannot hide ──\n');

{
	const now = Date.now();
	const hour = 3_600_000;

	// Spec section 15. A brigade may push something down the page; it may not push it
	// out of reach. Without the floor, twenty accounts make an investigation
	// unfindable while leaving it technically undeleted.
	const brigaded = { created_at: now - hour, upvotes: 5, downvotes: 500 };
	const ignored = { created_at: now - hour, upvotes: 0, downvotes: 0 };
	const floored = { created_at: now - hour, upvotes: 5, downvotes: 50_000 };

	ok(
		'a brigaded post keeps a finite score',
		Number.isFinite(score(brigaded, now)) && score(brigaded, now) > -Infinity
	);
	ok(
		'more downvotes stop making it worse past the floor',
		Math.abs(score(brigaded, now) - score(floored, now)) < 1e-9,
		`clamped at ${MIN_EFFECTIVE_SCORE}`
	);
	ok('a brigaded post still ranks below an ignored one', score(brigaded, now) < score(ignored, now));

	// Age sinks things; nothing removes them.
	const fresh = { created_at: now, upvotes: 10, downvotes: 0 };
	const old = { created_at: now - 48 * hour, upvotes: 10, downvotes: 0 };
	ok('older posts sink', score(old, now) < score(fresh, now));
	ok('an old post still has a score at all', score(old, now) > 0);

	const ordered = rank([old, brigaded, fresh], 'trending', now);
	ok('nothing is dropped from a ranking', ordered.length === 3);

	// Reports order human attention. They do not hide.
	const many = Array.from({ length: 14 }, () => ({ identity: 'one-person', created_at: now }));
	ok('fourteen reports from one identity count once', reportPressure(many) === 1);
	ok(
		'reports from distinct identities count separately',
		reportPressure([
			{ identity: 'a', created_at: now },
			{ identity: 'b', created_at: now }
		]) === 2
	);
}

console.log('\n  ── identity ──\n');

{
	const now = Date.now();
	const seen = new Set<string>();
	const notSeen = () => false;

	const { pubkey, keys } = await createIdentity();
	const action = await signAction(keys, pubkey, 'a post about a named official');

	await verifyAction(action, now, notSeen);
	ok('a signed action verifies', true);

	// Replay: the same signature presented twice must not be accepted twice. Signature
	// verification alone does not prevent this, and a replayed vote is a free vote.
	seen.add(action.nonce);
	await rejects('a replayed action is refused', () => verifyAction(action, now, (n) => seen.has(n)), 'replay');

	await rejects(
		'a stale action is refused',
		() => verifyAction(action, now + 10 * 60 * 1000, notSeen),
		'stale'
	);

	// Tampering with the body must invalidate the signature — otherwise anyone can
	// rewrite what somebody else is recorded as having said.
	await rejects(
		'a tampered body is refused',
		() => verifyAction({ ...action, body: 'something else entirely' }, now, notSeen),
		'signature does not match'
	);
	await rejects(
		'another key cannot claim this action',
		async () => {
			const other = await createIdentity();
			return verifyAction({ ...action, pubkey: other.pubkey }, now, notSeen);
		},
		'signature does not match'
	);

	ok('the signed payload covers nonce and timestamp', (() => {
		const p = payloadOf(action);
		return p.includes(action.nonce) && p.includes(String(action.issued_at));
	})());

	const handle = await handleFor(pubkey);
	// 96 bits of digest — 16 base64url characters (spec §15.1).
	ok('a handle is derived from the key', /^anon-[a-z0-9_-]{16}$/.test(handle), handle);
	ok('the same key gives the same handle', handle === (await handleFor(pubkey)));

	const otherHandle = await handleFor((await createIdentity()).pubkey);
	ok('a different key gives a different handle', handle !== otherHandle);
}

console.log('\n  ── trust levels ──\n');

{
	const now = Date.now();
	const base: Identity = {
		pubkey: 'k',
		created_at: now,
		trust_level: TRUST.NEW,
		posts_count: 0,
		reports_upheld: 0,
		reports_rejected: 0,
		prs_accepted: 0,
		banned_at: null,
		banned_reason: null
	};

	const fresh = capabilitiesFor(base);
	ok('a new identity may read, vote, comment and report', fresh.comment && fresh.vote && fresh.report);
	// One a day, not none. Nought meant a new site could never get its first thread:
	// every identity is level 0 on day one, and promotion to BASIC needs five posts.
	ok('a new identity may open a thread', fresh.createThread);
	ok('a new identity is held to one thread a day', fresh.threadsPerDay === 1);
	ok('a new identity may not post links', !fresh.postLinks);
	ok('a new identity may not propose graph changes', !fresh.createPr);

	// This is the whole anti-abuse story: banning is trivial to evade, so evasion is
	// made worthless rather than prevented.
	const banned = capabilitiesFor({ ...base, banned_at: now });
	ok('a banned identity can do nothing', !banned.comment && !banned.vote && !banned.report);
	/*
	 * Evasion returns you to the bottom, where the allowance is one thread a day and
	 * links and proposals are still closed. It cannot be prevented — minting a key is
	 * free — so the design makes it worthless rather than impossible, and "worthless"
	 * survives the gate being lowered from none to one.
	 */
	const returning = capabilitiesFor({ ...base, trust_level: TRUST.NEW });
	ok(
		'ban evasion returns to the bottom',
		returning.threadsPerDay === 1 && !returning.postLinks && !returning.createPr
	);

	const day = 86_400_000;
	ok(
		'sustained good behaviour earns level 1',
		earnedLevel({ ...base, created_at: now - 3 * day, posts_count: 6 }, now) === TRUST.BASIC
	);
	ok(
		'an upheld report blocks promotion',
		earnedLevel({ ...base, created_at: now - 3 * day, posts_count: 6, reports_upheld: 1 }, now) === TRUST.NEW
	);
	ok(
		'age alone does not promote',
		earnedLevel({ ...base, created_at: now - 90 * day, posts_count: 0 }, now) === TRUST.NEW
	);
	ok(
		'moderation is never granted automatically',
		earnedLevel(
			{ ...base, created_at: now - 3650 * day, posts_count: 100_000, trust_level: TRUST.ESTABLISHED, prs_accepted: 500 },
			now
		) < TRUST.TRUSTED
	);
}

console.log('\n  ── rate limiting without keeping an address ──\n');

{
	const now = Date.now();
	const pepper = 'a-pepper-long-enough-to-be-secret';
	const ip = '197.0.0.1';

	const key = await bucketKey(ip, pepper, now);
	ok('the bucket key does not contain the address', !key.includes(ip));
	ok('the same address gives the same key within a day', key === (await bucketKey(ip, pepper, now + 1000)));

	// The rotation is what bounds correlation: yesterday's buckets cannot be matched
	// to today's, by construction rather than by a retention policy.
	const tomorrow = now + 86_400_000;
	ok('the key changes when the salt rotates', key !== (await bucketKey(ip, pepper, tomorrow)));
	ok('the salt is per day', saltForDay(now) !== saltForDay(tomorrow));

	// Without the pepper the space is small enough to enumerate, so a leaked table
	// would be reversible and the hash would protect nobody.
	ok('a different pepper gives a different key', key !== (await bucketKey(ip, 'another-pepper-entirely!', now)));
	await rejects('a missing pepper is refused', async () => bucketKey(ip, '', now), 'pepper');

	const store = new Map<string, Bucket>();
	const backing = {
		get: async (k: string) => store.get(k) ?? null,
		put: async (b: Bucket) => void store.set(b.key, b)
	};

	for (let i = 0; i < 20; i++) await consume(backing, key, 'comment', now);
	await rejects('the limit is enforced', () => consume(backing, key, 'comment', now), 'too many');

	// A flood of one action must not exhaust the ability to report abuse.
	await consume(backing, key, 'report', now);
	ok('limits are per action', true);

	// The window expires rather than accumulating.
	await consume(backing, key, 'comment', now + 3_600_001);
	ok('the window resets', store.get(`comment:${key}`)!.count === 1);

	ok('buckets carry an expiry', [...store.values()].every((b) => b.expires_at > now));

	// Reading is unmeasured on purpose: throttling readers means identifying readers,
	// and what someone reads here is the most sensitive thing about them.
	await rejects('there is no limit on reading', () => consume(backing, key, 'read', now), 'no rate limit defined');
}

console.log('\n  ── anti-abuse layers ──\n');

{
	// Section 13: layered, and none of it visible to somebody writing a comment.
	const caught = (fn: () => unknown) => {
		try {
			fn();
			return '';
		} catch (e) {
			return (e as Error).message;
		}
	};

	ok('a filled honeypot is refused', caught(() => checkHoneypot({ website: 'http://spam' })).includes('automated'));
	ok('an empty honeypot passes', caught(() => checkHoneypot({ website: '' })) === '');
	ok('no honeypot field at all passes', caught(() => checkHoneypot({})) === '');

	// Whitespace and case changes are the usual way of making one advert look like
	// twenty posts.
	ok('the same text twice is a duplicate', isDuplicate('Buy cheap things now at my shop', ['buy   CHEAP things now at my shop!!']));
	ok('a link change does not evade it', isDuplicate('see https://a.example now friends', ['see https://b.example now friends']));
	ok('different text is not a duplicate', !isDuplicate('The decree is dated 26 July', ['Something else entirely here']));
	ok('a short repeat is not treated as abuse', !isDuplicate('thanks', ['thanks']));

	ok('posting twice in a second is refused', caught(() => checkInterval(Date.now() - 500, Date.now())).includes('slow down'));
	ok('a normal gap passes', caught(() => checkInterval(Date.now() - 30_000, Date.now())) === '');
	ok('a first post has no interval to check', caught(() => checkInterval(null, Date.now())) === '');

	// Whether links are ALLOWED is a capability, checked in the API so it returns
	// forbidden rather than throttled. Only the ceiling lives here.
	ok('links are counted', countLinks('see https://a.example and https://b.example') === 2);
	ok('a body with no links counts zero', countLinks('no links here at all') === 0);
	ok('a wall of links is refused', caught(() => checkLinkCount(Array(9).fill('https://a.example').join(' '))).includes('too many links'));
	ok('a few links pass', caught(() => checkLinkCount('see https://a.example')) === '');
}

{
	// Spec §15.3 R3: moderator keys live in the secret store, never the tree. A
	// private key in the working copy is one backup leak away from being a
	// moderator; the check makes its reappearance a test failure.
	ok(
		'no moderator keypair sits in the working tree',
		!existsSync(join(HERE, '..', 'moderator-key.pem')) && !existsSync(join(HERE, '..', 'moderator-pub.pem'))
	);
}


console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}
`);
if (failures) process.exit(1);
