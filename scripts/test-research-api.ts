/**
 * Integration tests over the research endpoints, run through the community
 * handler exactly as a request arrives: handle() routes /api/studies to
 * handleResearch, so the routing itself is under test, not just the handler.
 *
 * Hermetic by construction: the community DB and the research DB are both
 * node:sqlite in memory under the D1-shaped interface the Worker will use, the
 * bot challenge is an injected verifier, and the fixture registry is a compiled
 * instrument with a study at fielding. The one thing read from disk is the real
 * src/generated/studies.json, whose study is asserted to be in design — so a
 * submit against it proves the status gate fires on the real registry too.
 *
 * What is tested here is mostly refusals, in the contract §4 order, plus the
 * anonymity property that outranks every happy path: a distinctive client
 * address is sent with a valid submission and must appear nowhere in the stored
 * row.
 *
 * Run after `npm run data` — the real-registry check needs the built registry.
 * Usage: `npx tsx scripts/test-research-api.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, type Env } from '../community/api.ts';
import { localDb } from '../community/db-local.ts';
import {
	compileInstrument,
	type InstrumentDocument,
	type RuntimeInstrument,
	type StudiesRegistry
} from '../community/research-contract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMUNITY_SCHEMA = readFileSync(join(HERE, '..', 'community', 'schema.sql'), 'utf8');
const RESEARCH_SCHEMA = readFileSync(join(HERE, '..', 'community', 'research-schema.sql'), 'utf8');

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

function bail(message: string): never {
	console.error(`  FAIL  ${message}`);
	console.error('\n  0/1 checks passed, 1 FAILED\n');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Fixture: a compiled instrument and a registry holding it on one study at
// fielding and one at design.
// ---------------------------------------------------------------------------

const fixtureDoc = (): InstrumentDocument => ({
	instrument: {
		id: 'it-fixture',
		study: 'dt-fixture-001',
		version: '1.0.0',
		source_locale: 'en',
		locales: ['en', 'fr', 'ar'],
		estimated_minutes: 5,
		completion_target_minutes_max: 15
	},
	modules: [
		{ id: 'mod-1', label: 'Fixture module', items: ['consent_fix', 'scale_fix', 'choice_fix', 'text_fix', 'auto_fix'] }
	],
	items: [
		{
			id: 'consent_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'consent',
			required: true,
			text_en: 'I consent.',
			text_fr: null,
			text_ar: null
		},
		{
			id: 'scale_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'scale_0_10',
			required: true,
			text_en: 'Scale from 0 to 10.',
			text_fr: null,
			text_ar: null
		},
		{
			id: 'choice_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'single_choice',
			required: false,
			text_en: 'Pick one.',
			text_fr: null,
			text_ar: null,
			options: ['alpha', 'beta']
		},
		{
			id: 'text_fix',
			module: 'mod-1',
			tier: 'extended',
			response: 'text_short',
			required: false,
			text_en: 'Say something.',
			text_fr: null,
			text_ar: null,
			max_chars: 40
		},
		{
			id: 'auto_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'auto',
			required: true,
			text_en: null,
			text_fr: null,
			text_ar: null
		}
	],
	maxdiff_priority: null,
	gap_block: null,
	experiments: []
});

const fixtureInstrument: RuntimeInstrument = compileInstrument(fixtureDoc());

/**
 * The same instrument with a MaxDiff block whose design is still `to-generate`:
 * the state the real draft instrument is in until the freeze step generates it.
 */
const maxdiffFixtureDoc = (): InstrumentDocument => ({
	...fixtureDoc(),
	instrument: { ...fixtureDoc().instrument, id: 'it-fixture-maxdiff' },
	maxdiff_priority: {
		id: 'md-fixture',
		items_per_set: 2,
		sets: 2,
		pool: ['pool_a', 'pool_b', 'pool_c', 'pool_d'],
		design: { status: 'to-generate' },
		instruction_en: 'Pick the most and the least.',
		text_fr: null,
		text_ar: null
	}
});

const maxdiffFixtureInstrument: RuntimeInstrument = compileInstrument(maxdiffFixtureDoc());

/**
 * The same block with its design generated: the state the real instrument
 * reaches at freeze, where the runner sends one entry per set and the API must
 * store the choices rather than only validate them.
 */
const maxdiffGeneratedDoc = (): InstrumentDocument => {
	const base = maxdiffFixtureDoc();
	return {
		...base,
		instrument: { ...base.instrument, id: 'it-fixture-maxdiff-generated' },
		maxdiff_priority: {
			...base.maxdiff_priority!,
			items_per_set: 4,
			sets: 2,
			pool: ['pool_a', 'pool_b', 'pool_c', 'pool_d', 'pool_e', 'pool_f', 'pool_g', 'pool_h'],
			design: {
				status: 'generated',
				sets: [
					{ id: 'mds1', items: ['pool_a', 'pool_b', 'pool_c', 'pool_d'] },
					{ id: 'mds2', items: ['pool_e', 'pool_f', 'pool_g', 'pool_h'] }
				]
			}
		}
	};
};

const maxdiffGeneratedInstrument: RuntimeInstrument = compileInstrument(maxdiffGeneratedDoc());

const study = (
	slug: string,
	status: string,
	id = 'dt-fixture-001',
	instrument: RuntimeInstrument = fixtureInstrument
) => ({
	id,
	slug,
	title_en: 'Fixture Study',
	status,
	instrument_versions: [{ id: instrument.id, version: instrument.version }]
});

const FIXTURE_REGISTRY: StudiesRegistry = {
	meta: { generated: 'fixture', count: 5, schemaVersion: 1 },
	studies: [
		study('fixture', 'fielding'),
		// A distinct id: the dev override matches a study by slug or id, so the
		// two plain fixture studies must be separable by either.
		study('fixture-design', 'design', 'dt-fixture-002'),
		// A to-generate MaxDiff block on a fielding study: strict submissions are
		// refused at the block gate, not the status gate.
		study('fixture-maxdiff', 'fielding', 'dt-fixture-003', maxdiffFixtureInstrument),
		// The same block on a design study: the local override has to clear the
		// status gate and the block gate for the runner to be answerable.
		study('fixture-maxdiff-design', 'design', 'dt-fixture-004', maxdiffFixtureInstrument),
		// A generated block on a fielding study: the payload must carry every set
		// and the choices have to reach storage.
		study('fixture-maxdiff-generated', 'fielding', 'dt-fixture-005', maxdiffGeneratedInstrument)
	],
	instruments: {
		[`${fixtureInstrument.id}@${fixtureInstrument.version}`]: fixtureInstrument,
		[`${maxdiffFixtureInstrument.id}@${maxdiffFixtureInstrument.version}`]: maxdiffFixtureInstrument,
		[`${maxdiffGeneratedInstrument.id}@${maxdiffGeneratedInstrument.version}`]: maxdiffGeneratedInstrument
	}
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** A distinctive address: if any storage path leaks it, this string finds it. */
const ADDRESS = '203.0.113.77-deeptunisia-canary';

function researchEnv(over: Partial<Env> = {}): Env {
	const db = localDb(':memory:');
	void db.exec(COMMUNITY_SCHEMA);
	const researchDb = localDb(':memory:');
	void researchDb.exec(RESEARCH_SCHEMA);
	return {
		DB: db,
		RATE_PEPPER: 'a-pepper-long-enough-for-the-research-tests',
		MODERATORS: '',
		RESEARCH_DB: researchDb,
		RESEARCH_OPEN: '1',
		STUDIES: FIXTURE_REGISTRY,
		TURNSTILE_VERIFY: async () => true,
		...over
	};
}

const submitPayload = (over: Record<string, unknown> = {}) => ({
	instrumentHash: fixtureInstrument.hash,
	locale: 'en',
	channel: 'test',
	consentVersion: 'consent-v1',
	startedAt: Date.now() - 60_000,
	// The fixture instrument estimates five minutes, so the completion floor is
	// 120,000 ms; this payload clears it and the floor tests override it.
	completionMs: 150_000,
	answers: { consent_fix: true, scale_fix: 7 },
	...over
});

async function post(env: Env, path: string, data: unknown, ip = ADDRESS) {
	const res = await handle(
		new Request(`https://community.example${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
			body: JSON.stringify(data)
		}),
		env
	);
	return { status: res.status, body: (await res.json()) as any };
}

async function get(env: Env, path: string, ip = ADDRESS) {
	const res = await handle(
		new Request(`https://community.example${path}`, {
			headers: { 'cf-connecting-ip': ip }
		}),
		env
	);
	return { status: res.status, body: (await res.json()) as any };
}

async function allRows(env: Env) {
	return (await env.RESEARCH_DB!.prepare('SELECT * FROM research_responses').all<any>()).results;
}

/** A live assignment from the study's instrument read, as the runner gets it. */
async function assignmentFor(env: Env, slug: string) {
	const read = await get(env, `/api/studies/${slug}/instrument`);
	return read.body.assignment as { blockOrder: string; scaleDirection: string; token: string };
}

/** POST a submission whose payload carries a live assignment from this env. */
async function submitAssigned(env: Env, slug: string, over: Record<string, unknown> = {}) {
	const assignment = await assignmentFor(env, slug);
	const result = await post(env, `/api/studies/${slug}/submit`, submitPayload({ assignment, ...over }));
	return { ...result, assignment };
}

// ---- proof-of-work helpers -------------------------------------------------

/** The leading zero bits of a SHA-256 digest: the proof-of-work score. */
function leadingZeroBits(bytes: Uint8Array): number {
	let bits = 0;
	for (const byte of bytes) {
		if (byte === 0) {
			bits += 8;
			continue;
		}
		bits += Math.clz32(byte) - 24;
		break;
	}
	return bits;
}

/** Solve a challenge the way the browser worker does. */
async function solve(salt: string, difficulty: number): Promise<number> {
	const encoder = new TextEncoder();
	for (let nonce = 0; ; nonce++) {
		const digest = new Uint8Array(
			await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${nonce}`))
		);
		if (leadingZeroBits(digest) >= difficulty) return nonce;
	}
}

/** A nonce that does NOT clear the difficulty, for the wrong-nonce refusal. */
async function failSolve(salt: string, difficulty: number): Promise<number> {
	const encoder = new TextEncoder();
	for (let nonce = 0; ; nonce++) {
		const digest = new Uint8Array(
			await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${nonce}`))
		);
		if (leadingZeroBits(digest) < difficulty) return nonce;
	}
}

/** A fresh 16-byte salt in hex, matching the server's. */
function randomSalt(): string {
	return [...crypto.getRandomValues(new Uint8Array(16))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Sign a challenge exactly as the server does. Used to forge the one challenge
 * the endpoint refuses to issue itself: a valid signature over a difficulty
 * below the production constant, so the difficulty gate alone can refuse it.
 */
function signChallenge(env: Env, studyId: string, salt: string, difficulty: number, expires: number): string {
	return createHmac('sha256', env.ASSIGNMENT_SECRET ?? env.RATE_PEPPER)
		.update(`${studyId}|${salt}|${difficulty}|${expires}`)
		.digest('hex');
}

console.log('\n  ── reads: unauthenticated, unlimited ──\n');

{
	const env = researchEnv();
	const list = await get(env, '/api/studies');
	ok('the registry lists studies', list.status === 200 && Array.isArray(list.body.studies) && list.body.studies.length === 5);
	ok('a study reads as id, slug, status, title_en', JSON.stringify(list.body.studies[0]) === JSON.stringify({ id: 'dt-fixture-001', slug: 'fixture', status: 'fielding', title_en: 'Fixture Study' }));

	const one = await get(env, '/api/studies/fixture');
	ok('a study page reads with its instrument', one.status === 200 && one.body.study.slug === 'fixture' && one.body.instrument.id === fixtureInstrument.id);

	const instrument = await get(env, '/api/studies/fixture/instrument');
	ok('the instrument read returns the compiled hash', instrument.status === 200 && instrument.body.instrument.hash === fixtureInstrument.hash);

	// Both reads hand out the arm assignment the runner sends back at submit
	// (contract §10): one block order, one scale direction, one HMAC token.
	const assignmentShape = (a: any) =>
		a &&
		['core_first', 'extended_first'].includes(a.blockOrder) &&
		['ascending', 'descending'].includes(a.scaleDirection) &&
		/^[0-9a-f]{64}$/.test(a.token ?? '');
	ok('a study page returns an assignment', assignmentShape(one.body.assignment));
	ok('the instrument read returns an assignment', assignmentShape(instrument.body.assignment));

	const missing = await get(env, '/api/studies/no-such-study/instrument');
	ok('an unknown study is 404 on the instrument read', missing.status === 404);

	const none = researchEnv({ STUDIES: undefined });
	ok('a missing registry is 503 on reads', (await get(none, '/api/studies')).status === 503);
}

console.log('\n  ── the refusal ladder, in order ──\n');

{
	const env = researchEnv({ RESEARCH_OPEN: '0' });
	const closed = await post(env, '/api/studies/fixture/submit', submitPayload());
	ok('submissions are refused 403 while RESEARCH_OPEN is off', closed.status === 403);

	const design = await post(researchEnv(), '/api/studies/fixture-design/submit', submitPayload());
	ok('a study in design is refused 409', design.status === 409);

	const noStorage = researchEnv({ RESEARCH_DB: undefined });
	const stored = await post(noStorage, '/api/studies/fixture/submit', submitPayload());
	ok('a submission without research storage is refused 503', stored.status === 503);

	const trap = await post(researchEnv(), '/api/studies/fixture/submit', submitPayload({ website: 'http://spam.example' }));
	ok('a filled honeypot is refused 400', trap.status === 400);

	const noChallenge = researchEnv({ TURNSTILE_VERIFY: undefined });
	const bots = await post(noChallenge, '/api/studies/fixture/submit', submitPayload());
	ok('a submission without a proof of work is refused 403', bots.status === 403);

	const failedChallenge = researchEnv({ TURNSTILE_VERIFY: async () => false });
	const robot = await post(failedChallenge, '/api/studies/fixture/submit', submitPayload());
	ok('a failed bot challenge is refused', robot.status === 403);

	const unknownItem = await submitAssigned(researchEnv(), 'fixture', { answers: { consent_fix: true, scale_fix: 7, no_such_item: 3 } });
	ok('an unknown item id is refused 400', unknownItem.status === 400);

	const noConsent = await submitAssigned(researchEnv(), 'fixture', { answers: { scale_fix: 7 } });
	ok('a missing consent answer is refused 400', noConsent.status === 400);

	const stale = await submitAssigned(researchEnv(), 'fixture', { instrumentHash: '0'.repeat(64) });
	ok('a submission against another instrument version is refused 400', stale.status === 400);

	const oversized = await handle(
		new Request('https://community.example/api/studies/fixture/submit', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(submitPayload({ pad: 'x'.repeat(21_000) }))
		}),
		researchEnv()
	);
	ok('a body over 20,000 bytes is refused 400', oversized.status === 400);
}

console.log('\n  ── a valid submission is stored, and names nobody ──\n');

{
	const env = researchEnv();
	const sent = await submitAssigned(env, 'fixture');
	ok('a valid submission is accepted with a receipt', sent.status === 200 && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(sent.body.receipt ?? ''), sent.body.error ?? '');

	const rows = await allRows(env);
	ok('exactly one row was written', rows.length === 1);
	const row = rows[0];
	const rowText = JSON.stringify(row);
	ok('the stored row contains no trace of the client address', !rowText.includes(ADDRESS) && !rowText.includes('203.0.113') && !rowText.includes('canary'));
	// The contract §5 table, column for column — anything else in here would be
	// an identifier column smuggled past the schema.
	const expectedColumns = [
		'receipt', 'study_id', 'instrument_id', 'instrument_version', 'instrument_hash',
		'locale', 'channel', 'consent_version', 'started_at', 'submitted_at',
		'completion_ms', 'block_order', 'scale_direction', 'answers', 'maxdiff', 'created_at'
	];
	ok('the row carries exactly the contract columns and no identifier column', JSON.stringify(Object.keys(row)) === JSON.stringify(expectedColumns), Object.keys(row).join(', '));
	ok('the row records the study, instrument and hash', row.study_id === 'dt-fixture-001' && row.instrument_id === fixtureInstrument.id && row.instrument_hash === fixtureInstrument.hash);
	ok('the row records locale, channel and consent version', row.locale === 'en' && row.channel === 'test' && row.consent_version === 'consent-v1');
	ok(
		'the row records the assigned arms',
		row.block_order === sent.assignment.blockOrder && row.scale_direction === sent.assignment.scaleDirection,
		`${row.block_order} / ${row.scale_direction}`
	);
	ok('the answers are stored as accepted', JSON.parse(row.answers).scale_fix === 7 && !('auto_fix' in JSON.parse(row.answers)));

	// And the community DB, where the rate buckets live, holds only the hash.
	const buckets = (await env.DB.prepare('SELECT * FROM rate_buckets').all<any>()).results;
	const bucketKey0 = buckets[0]?.key.split(':') ?? [];
	ok('the rate bucket is a hash, not an address', buckets.length === 1 && bucketKey0[0] === 'response' && /^[0-9a-f]{64}$/.test(bucketKey0[1] ?? '') && !JSON.stringify(buckets).includes('203.0.113'));
}

console.log('\n  ── withdraw, count ──\n');

{
	const env = researchEnv();
	const sent = await submitAssigned(env, 'fixture');
	const receipt = sent.body.receipt as string;

	const counted = await get(env, '/api/studies/fixture/count');
	ok('the count reads one response', counted.status === 200 && counted.body.count === 1);

	const first = await post(env, '/api/studies/fixture/withdraw', { receipt });
	ok('withdraw with the receipt deletes the response', first.status === 200 && first.body.deleted === true);
	const second = await post(env, '/api/studies/fixture/withdraw', { receipt });
	ok('a second withdraw with the same receipt reports false', second.status === 200 && second.body.deleted === false);

	const after = await get(env, '/api/studies/fixture/count');
	ok('the count falls back to zero', after.body.count === 0);

	const notOpen = await post(env, '/api/studies/fixture-design/withdraw', { receipt });
	ok('withdraw is refused 409 when the study is not fielding', notOpen.status === 409);

	const badBody = await post(env, '/api/studies/fixture/withdraw', {});
	ok('withdraw without a receipt is refused 400', badBody.status === 400);
}

console.log('\n  ── the arm assignment ──\n');

{
	// The assignment from the instrument read verifies at submit and is stored.
	const env = researchEnv();
	const sent = await submitAssigned(env, 'fixture');
	ok('an assignment from the instrument read verifies and is accepted', sent.status === 200, sent.body.error ?? '');

	// The study read issues its own assignment; it verifies too.
	const detailEnv = researchEnv();
	const detail = await get(detailEnv, '/api/studies/fixture');
	const viaDetail = await post(
		detailEnv,
		'/api/studies/fixture/submit',
		submitPayload({ assignment: detail.body.assignment })
	);
	ok('an assignment from the study read verifies too', viaDetail.status === 200, viaDetail.body.error ?? '');

	// A token bound to other values, or a value outside the two arms, is refused.
	const tampered = {
		...sent.assignment,
		token: `${sent.assignment.token.slice(0, -1)}${sent.assignment.token.endsWith('0') ? '1' : '0'}`
	};
	const badToken = await post(
		researchEnv(),
		'/api/studies/fixture/submit',
		submitPayload({ assignment: tampered })
	);
	ok('a tampered token is refused 400', badToken.status === 400, badToken.body.error ?? '');

	const badValue = await post(
		researchEnv(),
		'/api/studies/fixture/submit',
		submitPayload({ assignment: { ...sent.assignment, blockOrder: 'sideways' } })
	);
	ok('an assignment value outside the two arms is refused 400', badValue.status === 400, badValue.body.error ?? '');

	// Absent: 400 while fielding in production, accepted with null arms under the
	// local dev override.
	const absent = await post(researchEnv(), '/api/studies/fixture/submit', submitPayload());
	ok('an absent assignment is refused 400 without the override', absent.status === 400, absent.body.error ?? '');

	const devEnv = researchEnv({ RESEARCH_DEV_STUDY: 'fixture', TURNSTILE_VERIFY: undefined });
	const waived = await post(devEnv, '/api/studies/fixture/submit', submitPayload());
	ok('an absent assignment is accepted under the override', waived.status === 200, waived.body.error ?? '');
	const devRow = (await allRows(devEnv))[0];
	ok(
		'the dev-path row stores null arms',
		Boolean(devRow) && devRow.block_order === null && devRow.scale_direction === null,
		`${devRow?.block_order} / ${devRow?.scale_direction}`
	);
}

console.log('\n  ── minimum completion time ──\n');

{
	// The fixture estimates five minutes, so the floor is 120,000 ms.
	const fastEnv = researchEnv();
	const fast = await submitAssigned(fastEnv, 'fixture', { completionMs: 119_999 });
	ok('a completion below the floor is refused 400', fast.status === 400, fast.body.error ?? '');

	const floorEnv = researchEnv();
	const atFloor = await submitAssigned(floorEnv, 'fixture', { completionMs: 120_000 });
	ok('a completion at the floor is accepted', atFloor.status === 200, atFloor.body.error ?? '');

	const devEnv = researchEnv({ RESEARCH_DEV_STUDY: 'fixture', TURNSTILE_VERIFY: undefined });
	const waived = await post(devEnv, '/api/studies/fixture/submit', submitPayload({ completionMs: 1 }));
	ok('the dev override waives the floor', waived.status === 200, waived.body.error ?? '');

	// A study that pre-registers a speed exclusion (40 s) is refused at the door
	// only below half of it. A fast human between the two is stored and counted
	// by the published exclusion, instead of being shown an error at the end.
	const scored = {
		...fixtureInstrument,
		scoring: { exclusions: { min_completion_seconds: 40, straightline_items: [] } }
	} as unknown as typeof fixtureInstrument;
	const scoredRegistry: StudiesRegistry = {
		...FIXTURE_REGISTRY,
		instruments: { ...FIXTURE_REGISTRY.instruments, [`${fixtureInstrument.id}@${fixtureInstrument.version}`]: scored }
	};
	const bot = await submitAssigned(researchEnv({ STUDIES: scoredRegistry }), 'fixture', { completionMs: 19_999 });
	ok('a scored study refuses below half its speed rule', bot.status === 400, bot.body.error ?? '');
	const human = await submitAssigned(researchEnv({ STUDIES: scoredRegistry }), 'fixture', { completionMs: 25_000 });
	ok('a fast human above that is accepted, for the published exclusion to count', human.status === 200, human.body.error ?? '');
}

console.log('\n  ── the dev fielding override (local only) ──\n');

{
	// A design study, no challenge configured at all, override naming it: the
	// runner must be answerable end to end. The address rate limit, honeypot,
	// storage and validation stay on, and nothing in the response says why.
	const dev = researchEnv({ RESEARCH_DEV_STUDY: 'fixture-design', TURNSTILE_VERIFY: undefined });

	const read = await get(dev, '/api/studies/fixture-design');
	ok(
		'a design study reads as fielding under the override',
		read.status === 200 && read.body.study.status === 'fielding',
		read.body.study?.status
	);
	ok(
		'the override does not rewrite the registry entry',
		(FIXTURE_REGISTRY.studies[1] as { status: string }).status === 'design'
	);

	const sent = await post(dev, '/api/studies/fixture-design/submit', submitPayload());
	ok(
		'a submit succeeds with no challenge configured',
		sent.status === 200 && typeof sent.body.receipt === 'string',
		sent.body.error ?? ''
	);

	const rows = await allRows(dev);
	ok(
		'the row is stored against the design study',
		rows.length === 1 && rows[0].study_id === 'dt-fixture-002'
	);

	const counted = await get(dev, '/api/studies/fixture-design/count');
	ok('the count reflects the stored response', counted.status === 200 && counted.body.count === 1);

	const withdrawn = await post(dev, '/api/studies/fixture-design/withdraw', {
		receipt: sent.body.receipt
	});
	ok(
		'withdraw works under the override',
		withdrawn.status === 200 && withdrawn.body.deleted === true,
		withdrawn.body.error ?? ''
	);

	const after = await get(dev, '/api/studies/fixture-design/count');
	ok('the count falls back to zero', after.status === 200 && after.body.count === 0);

	// The override names a study by slug or id.
	const byId = researchEnv({ RESEARCH_DEV_STUDY: 'dt-fixture-002', TURNSTILE_VERIFY: undefined });
	const viaId = await post(byId, '/api/studies/fixture-design/submit', submitPayload());
	ok('the override names a study by id as well as slug', viaId.status === 200, viaId.body.error ?? '');

	const elsewhere = researchEnv({ RESEARCH_DEV_STUDY: 'fixture', TURNSTILE_VERIFY: undefined });
	const refused = await post(elsewhere, '/api/studies/fixture-design/submit', submitPayload());
	ok('an override naming another study does not open this one', refused.status === 409, refused.body.error ?? '');

	const declared = await get(researchEnv(), '/api/studies/fixture-design');
	ok(
		'without the override the study reads by its declared status',
		declared.status === 200 && declared.body.study.status === 'design',
		declared.body.study?.status
	);

	// Every other gate still applies under the override.
	const closed = await post(
		researchEnv({
			RESEARCH_DEV_STUDY: 'fixture-design',
			RESEARCH_OPEN: '0',
			TURNSTILE_VERIFY: undefined
		}),
		'/api/studies/fixture-design/submit',
		submitPayload()
	);
	ok('RESEARCH_OPEN still gates an overridden study', closed.status === 403);

	const trap = await post(
		dev,
		'/api/studies/fixture-design/submit',
		submitPayload({ website: 'http://spam.example' })
	);
	ok('the honeypot still refuses under the override', trap.status === 400);

	const limited = researchEnv({ RESEARCH_DEV_STUDY: 'fixture-design', TURNSTILE_VERIFY: undefined });
	const codes: number[] = [];
	for (let i = 0; i < 6; i++) {
		const r = await post(
			limited,
			'/api/studies/fixture-design/submit',
			submitPayload({ channel: `dev${i}` })
		);
		codes.push(r.status);
	}
	ok(
		'the response rate limit still applies under the override',
		codes.slice(0, 5).every((s) => s === 200) && codes[5] === 429,
		codes.join(',')
	);
}

console.log('\n  ── an ungenerated MaxDiff design ──\n');

{
	// Strict: a fielding study whose block has not been generated refuses the
	// submission at the block gate. The injected challenge passes first and the
	// assignment verifies, so the refusal can only be about the MaxDiff design.
	const strict = researchEnv();
	const strictAssignment = await assignmentFor(strict, 'fixture-maxdiff');
	const refused = await post(strict, '/api/studies/fixture-maxdiff/submit', {
		...submitPayload({ assignment: strictAssignment }),
		instrumentHash: maxdiffFixtureInstrument.hash
	});
	ok(
		'without the dev option a to-generate design is refused 409',
		refused.status === 409 &&
			refused.body.error === 'the MaxDiff design has not been generated for this instrument',
		refused.body.error ?? ''
	);

	// The local dev path: the override names the design study, no challenge is
	// configured, and the payload omits the block the runner cannot render.
	const dev = researchEnv({
		RESEARCH_DEV_STUDY: 'fixture-maxdiff-design',
		TURNSTILE_VERIFY: undefined
	});
	const accepted = await post(dev, '/api/studies/fixture-maxdiff-design/submit', {
		...submitPayload(),
		instrumentHash: maxdiffFixtureInstrument.hash
	});
	ok(
		'a dev-override submit that omits the block succeeds',
		accepted.status === 200 && typeof accepted.body.receipt === 'string',
		accepted.body.error ?? ''
	);

	// The same study without the override: the declared status gate refuses it.
	const designed = await post(researchEnv(), '/api/studies/fixture-maxdiff-design/submit', {
		...submitPayload(),
		instrumentHash: maxdiffFixtureInstrument.hash
	});
	ok('without the override the same submit is refused 409', designed.status === 409, designed.body.error ?? '');

	// The override does not make an ungenerated design scoreable: supplying a
	// block is still refused, exactly as it is in production.
	const supplied = await post(
		researchEnv({ RESEARCH_DEV_STUDY: 'fixture-maxdiff', TURNSTILE_VERIFY: undefined }),
		'/api/studies/fixture-maxdiff/submit',
		{ ...submitPayload(), instrumentHash: maxdiffFixtureInstrument.hash, maxdiff: [] }
	);
	ok(
		'the override still refuses a supplied block on a to-generate design',
		supplied.status === 409 &&
			supplied.body.error === 'the MaxDiff design has not been generated for this instrument',
		supplied.body.error ?? ''
	);
}

console.log('\n  ── a generated MaxDiff design stores its choices ──\n');

{
	const env = researchEnv({ RESEARCH_DEV_STUDY: 'fixture-maxdiff-generated', TURNSTILE_VERIFY: undefined });
	const assignment = await assignmentFor(env, 'fixture-maxdiff-generated');
	const submitted = await post(env, '/api/studies/fixture-maxdiff-generated/submit', {
		...submitPayload({ assignment }),
		instrumentHash: maxdiffGeneratedInstrument.hash,
		maxdiff: [
			{ set: 'mds1', most: 'pool_a', least: 'pool_d' },
			{ set: 'mds2', most: 'pool_e', least: 'pool_h' }
		]
	});
	ok(
		'a generated design accepts a complete block',
		submitted.status === 200 && typeof submitted.body.receipt === 'string',
		submitted.body.error ?? ''
	);
	const rows = await allRows(env);
	const stored = rows.length ? JSON.parse(String(rows[0].maxdiff ?? 'null')) : null;
	ok(
		'the MaxDiff choices are stored as JSON, not dropped',
		Array.isArray(stored) &&
			stored.length === 2 &&
			stored[0].set === 'mds1' &&
			stored[0].most === 'pool_a' &&
			stored[0].least === 'pool_d',
		JSON.stringify(stored)
	);
}

console.log('\n  ── the response rate limit ──\n');

{
	const env = researchEnv();
	const assignment = await assignmentFor(env, 'fixture');
	const statuses: number[] = [];
	for (let i = 0; i < 6; i++) {
		const r = await post(env, '/api/studies/fixture/submit', submitPayload({ assignment, channel: `wave${i}` }));
		statuses.push(r.status);
	}
	ok('five submissions from one address pass inside the window', statuses.slice(0, 5).every((s) => s === 200), statuses.join(','));
	ok('the sixth is refused 429', statuses[5] === 429);

	// The limit is per action, so the same address can still withdraw.
	const receipt = (await allRows(env))[0].receipt as string;
	const clean = await post(env, '/api/studies/fixture/withdraw', { receipt });
	ok('the response limit does not block withdraw', clean.status === 200 && clean.body.deleted === true);
}

console.log('\n  ── the real registry ──\n');

{
	const REGISTRY = join(HERE, '..', 'src', 'generated', 'studies.json');
	if (!existsSync(REGISTRY)) {
		bail('src/generated/studies.json is missing — run `npm run data` (or `npm run build`) first');
	}
	const real = JSON.parse(readFileSync(REGISTRY, 'utf8')) as StudiesRegistry;
	const realStudy = real.studies[0] as { slug: string; status: string };
	ok('the real study is in design', realStudy.status === 'design', realStudy.slug);

	const env = researchEnv({ STUDIES: real, TURNSTILE_VERIFY: async () => true });
	const refused = await post(env, `/api/studies/${realStudy.slug}/submit`, submitPayload());
	ok('a submit against the real registry is refused 409', refused.status === 409, refused.body.error ?? '');
}

console.log('\n  ── the first-party proof of work ──\n');

{
	// No Turnstile verifier in these envs: the proof-of-work path is the one
	// under test. The production difficulty is the one exercised — the tests
	// solve it for real, because lowering it here would be testing a different
	// gate from the one that ships.
	const env = researchEnv({ TURNSTILE_VERIFY: undefined });

	const challenge = await get(env, '/api/studies/fixture/challenge');
	ok(
		'a fielding study issues a challenge',
		challenge.status === 200 &&
			/^[0-9a-f]{32}$/.test(challenge.body.salt ?? '') &&
			challenge.body.difficulty === 17 &&
			/^[0-9a-f]{64}$/.test(challenge.body.sig ?? ''),
		challenge.body.error ?? ''
	);
	ok(
		'the challenge expires about two hours out',
		challenge.body.expires > Date.now() + 7_000_000 &&
			challenge.body.expires < Date.now() + 7_400_000,
		String(challenge.body.expires)
	);

	const missing = await get(env, '/api/studies/no-such-study/challenge');
	ok('an unknown study has no challenge', missing.status === 404);
	const notFielding = await get(env, '/api/studies/fixture-design/challenge');
	ok('a study not fielding has no challenge', notFielding.status === 409);

	// The issued challenge verifies: solve it and submit with a live assignment.
	const assignment = await assignmentFor(env, 'fixture');
	const nonce = await solve(challenge.body.salt, challenge.body.difficulty);
	const pow = { ...challenge.body, nonce };
	const accepted = await post(env, '/api/studies/fixture/submit', submitPayload({ assignment, pow }));
	ok('a solved challenge is accepted', accepted.status === 200, accepted.body.error ?? '');

	const spent = await env.RESEARCH_DB!.prepare('SELECT * FROM research_pow_used').all<any>();
	const spentRow = spent.results[0];
	ok(
		'the spent salt is recorded, and the table keeps nothing about a person',
		spent.results.length === 1 &&
			spentRow?.salt === challenge.body.salt &&
			JSON.stringify(Object.keys(spentRow ?? {})) === JSON.stringify(['salt', 'expires']),
		Object.keys(spentRow ?? {}).join(', ')
	);

	// The same solved challenge again, on another channel so the row would
	// differ: the salt is spent, so it is refused before a second row exists.
	const replayed = await post(
		env,
		'/api/studies/fixture/submit',
		submitPayload({ assignment, pow, channel: 'replay' })
	);
	ok(
		'a replayed salt is refused 403',
		replayed.status === 403 && replayed.body.error === 'the bot check failed',
		replayed.body.error ?? ''
	);

	// A wrong nonce under an otherwise valid challenge.
	const wrongEnv = researchEnv({ TURNSTILE_VERIFY: undefined });
	const wrongChallenge = await get(wrongEnv, '/api/studies/fixture/challenge');
	const wrongNonce = await failSolve(wrongChallenge.body.salt, wrongChallenge.body.difficulty);
	const wrong = await post(
		wrongEnv,
		'/api/studies/fixture/submit',
		submitPayload({ pow: { ...wrongChallenge.body, nonce: wrongNonce } })
	);
	ok(
		'a wrong nonce is refused 403',
		wrong.status === 403 && wrong.body.error === 'the bot check failed',
		wrong.body.error ?? ''
	);

	// A tampered signature over an issued challenge.
	const sigEnv = researchEnv({ TURNSTILE_VERIFY: undefined });
	const sigChallenge = await get(sigEnv, '/api/studies/fixture/challenge');
	const sig = sigChallenge.body.sig as string;
	const tampered = `${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`;
	const badSig = await post(
		sigEnv,
		'/api/studies/fixture/submit',
		submitPayload({ pow: { ...sigChallenge.body, sig: tampered, nonce: 0 } })
	);
	ok(
		'a tampered signature is refused 403',
		badSig.status === 403 && badSig.body.error === 'the bot check failed',
		badSig.body.error ?? ''
	);

	// An expired challenge, signed with the same secret but past its expiry.
	const expiredEnv = researchEnv({ TURNSTILE_VERIFY: undefined });
	const expiredSalt = randomSalt();
	const expiredAt = Date.now() - 1;
	const expired = await post(
		expiredEnv,
		'/api/studies/fixture/submit',
		submitPayload({
			pow: {
				salt: expiredSalt,
				difficulty: 17,
				expires: expiredAt,
				sig: signChallenge(expiredEnv, 'dt-fixture-001', expiredSalt, 17, expiredAt),
				nonce: 0
			}
		})
	);
	ok(
		'an expired challenge is refused 403',
		expired.status === 403 && expired.body.error === 'the bot check failed',
		expired.body.error ?? ''
	);

	// A difficulty lowered by the client: the test signs a challenge at 16 the
	// way the server signs its own, so only the difficulty gate can refuse it.
	const loweredEnv = researchEnv({ TURNSTILE_VERIFY: undefined });
	const loweredSalt = randomSalt();
	const loweredExpires = Date.now() + 3_600_000;
	const loweredNonce = await solve(loweredSalt, 16);
	const lowered = await post(
		loweredEnv,
		'/api/studies/fixture/submit',
		submitPayload({
			pow: {
				salt: loweredSalt,
				difficulty: 16,
				expires: loweredExpires,
				sig: signChallenge(loweredEnv, 'dt-fixture-001', loweredSalt, 16, loweredExpires),
				nonce: loweredNonce
			}
		})
	);
	ok(
		'a client-lowered difficulty is refused 403',
		lowered.status === 403 && lowered.body.error === 'the bot check failed',
		lowered.body.error ?? ''
	);
}

console.log('\n  ── Turnstile and the dev override are unchanged ──\n');

{
	// An injected verifier is still the challenge that runs: no proof of work is
	// sent, and the submission is accepted because the verifier said so.
	let verified = 0;
	const env = researchEnv({
		TURNSTILE_VERIFY: async () => {
			verified++;
			return true;
		}
	});
	const sent = await submitAssigned(env, 'fixture');
	ok(
		'the injected Turnstile verifier is still used',
		sent.status === 200 && verified === 1,
		sent.body.error ?? ''
	);

	// The local override skips the challenge entirely, exactly as before.
	const dev = researchEnv({ RESEARCH_DEV_STUDY: 'fixture', TURNSTILE_VERIFY: undefined });
	const waived = await post(dev, '/api/studies/fixture/submit', submitPayload());
	ok('the dev override still skips the check', waived.status === 200, waived.body.error ?? '');
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
