/**
 * The citizen budget study's answers fit the research store.
 *
 * Ticket 0029 asks one question the API tests do not answer directly: can the
 * research D1 hold this study's rows? The registry decides that the study
 * exists, the monthly tally row and the response row are what the API writes.
 * This file runs the real handler against the real compiled registry and the
 * real instrument, with a local SQLite database opened through the same
 * D1-shaped interface the Worker uses, and reads the rows back.
 *
 * The study is still `design` in the canonical registry. `RESEARCH_DEV_STUDY`
 * is the local-only override that makes it fielding for this run, exactly as
 * `research/portal/backend.md` describes; nothing here sets it in production.
 *
 * What it proves, in order:
 *   1. a valid citizen budget response is accepted and stored;
 *   2. the response row carries the contract's columns, the study and
 *      instrument ids, the instrument hash and a receipt, and no identifier;
 *   3. one monthly period row exists for the study, with received = 1;
 *   4. the withdrawal deletes the row and raises the month's withdrawn count;
 *   5. a per-study allowlist that omits the study refuses before any row.
 *
 * Run: npx tsx scripts/test-research-budget-storage.ts
 * The same path runs in `npm run test`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, type Env } from '../community/api.ts';
import { localDb } from '../community/db-local.ts';
import type { Db } from '../community/db.ts';
import type { StudiesRegistry, RuntimeInstrument } from '../community/research-contract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const COMMUNITY_SCHEMA = readFileSync(join(ROOT, 'community', 'schema.sql'), 'utf8');
const RESEARCH_SCHEMA = readFileSync(join(ROOT, 'community', 'research-schema.sql'), 'utf8');

const ADDRESS = '203.0.113.29-deeptunisia-budget-canary';
const STUDY = 'dt-research-003';
const SLUG = 'citizen-budget';

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
	}
}

function bail(message: string): never {
	console.error(`\n  ${message}\n`);
	process.exit(1);
}

const registryPath = join(ROOT, 'src', 'generated', 'studies.json');
let registry: StudiesRegistry;
try {
	registry = JSON.parse(readFileSync(registryPath, 'utf8')) as StudiesRegistry;
} catch {
	bail('src/generated/studies.json is missing — run `npm run data` (or `npm run build`) first');
}

const instrumentKey = Object.keys(registry.instruments).find((key) => key.startsWith('dt003-citizen-budget@'));
if (!instrumentKey) bail('the compiled registry carries no citizen budget instrument');
const instrument: RuntimeInstrument = registry.instruments[instrumentKey];
const allocation = instrument.items.find((item) => item.response === 'allocation')?.allocation;
if (!allocation) bail('the citizen budget instrument carries no allocation block');

/** A complete, valid response: every consent true, the draft kept, two answers. */
function submitPayload() {
	const shares: Record<string, number> = {};
	for (const category of allocation!.categories) shares[category.id] = 10000;
	shares.kept_draft = true;
	return {
		instrumentHash: instrument.hash,
		locale: 'en',
		channel: 'direct',
		consentVersion: 'consent-v1',
		startedAt: Date.now() - 600_000,
		completionMs: 600_000,
		answers: {
			consent_read: true,
			consent_withdrawal: true,
			consent_age: true,
			alloc_budget: shares,
			q_spending: 'same',
			q_say: 5,
			demo_governorate: 'tunis'
		}
	};
}

async function env(over: Partial<Env> = {}): Promise<Env> {
	const db = localDb(':memory:');
	await db.exec(COMMUNITY_SCHEMA);
	const researchDb = localDb(':memory:');
	await researchDb.exec(RESEARCH_SCHEMA);
	return {
		DB: db,
		RATE_PEPPER: 'a-pepper-long-enough-for-the-budget-storage-test',
		RESEARCH_DB: researchDb,
		RESEARCH_OPEN: '1',
		RESEARCH_ACCEPT: `police,${SLUG}`,
		// The local-only fielding override: the canonical registry stays `design`.
		RESEARCH_DEV_STUDY: SLUG,
		STUDIES: registry,
		...over
	};
}

async function post(env: Env, path: string, data: unknown) {
	const res = await handle(
		new Request(`https://community.example${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'cf-connecting-ip': ADDRESS },
			body: JSON.stringify(data)
		}),
		env
	);
	return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function get(env: Env, path: string) {
	const res = await handle(new Request(`https://community.example${path}`), env);
	return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function responseRows(db: Db, receipt?: string) {
	const sql = receipt
		? 'SELECT * FROM research_responses WHERE receipt = ?'
		: 'SELECT * FROM research_responses WHERE study_id = ?';
	const prepared = db.prepare(sql);
	return (await (receipt ? prepared.bind(receipt) : prepared.bind(STUDY)).all<Record<string, any>>()).results;
}

async function tallyRows(db: Db) {
	return (await db.prepare('SELECT * FROM research_tally WHERE study_id = ?').bind(STUDY).all<Record<string, any>>()).results;
}

console.log('\n  ── the citizen budget study has a row to land in ──\n');

{
	const e = await env();
	const read = await get(e, `/api/studies/${SLUG}`);
	ok(
		'the compiled registry carries the study and its instrument',
		read.status === 200 && read.body.study?.id === STUDY && read.body.instrument?.id === instrument.id,
		`${read.status} ${read.body.study?.id ?? ''} ${read.body.instrument?.id ?? ''}`
	);
	ok('the study page can read the instrumental facts it publishes', Array.isArray(read.body.instrument?.items) && read.body.instrument.items.length > 0, String(read.body.instrument?.items?.length ?? 0));
}

console.log('\n  ── a valid response is stored, names nobody, and counts the month ──\n');

const stored = await (async () => {
	const e = await env();
	const sent = await post(e, `/api/studies/${SLUG}/submit`, submitPayload());
	ok(
		'a complete citizen budget response is accepted with a receipt',
		sent.status === 200 && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(sent.body.receipt ?? ''),
		`${sent.status} ${sent.body.error ?? sent.body.receipt ?? ''}`
	);
	const receipt = sent.body.receipt as string | undefined;

	const rows = await responseRows(e.RESEARCH_DB!);
	ok('exactly one response row is stored for the study', rows.length === 1, String(rows.length));
	const row = rows[0];
	if (!row) bail('no response row was stored; the rest of this file would report nothing');

	ok('the row is the study it says it is', row.study_id === STUDY && row.instrument_id === instrument.id, `${row.study_id} ${row.instrument_id}`);
	ok('the row records the draft instrument version and its hash', row.instrument_version === instrument.version && row.instrument_hash === instrument.hash, `${row.instrument_version} ${String(row.instrument_hash).slice(0, 12)}…`);
	ok('the row carries the receipt it handed back', row.receipt === receipt, String(row.receipt).slice(0, 8));
	ok(
		'the row carries exactly the contract columns and no identifier',
		JSON.stringify(Object.keys(row)) ===
			JSON.stringify([
				'receipt', 'study_id', 'instrument_id', 'instrument_version', 'instrument_hash',
				'locale', 'channel', 'consent_version', 'started_at', 'submitted_at', 'completion_ms',
				'block_order', 'scale_direction', 'answers', 'maxdiff', 'revision', 'created_at'
			]),
		Object.keys(row).join(', ')
	);
	ok('the row contains no trace of the client address', !JSON.stringify(row).includes(ADDRESS) && !JSON.stringify(row).includes('canary'));
	const answers = JSON.parse(row.answers) as Record<string, any>;
	ok('the allocation is stored as basis points, with the keep-draft answer', answers.alloc_budget?.kept_draft === true && answers.alloc_budget?.[allocation!.categories[0].id] === 10000);
	ok('the two short answers are stored with it', answers.q_spending === 'same' && answers.q_say === 5);
	ok('the consent answers are stored as accepted', answers.consent_read === true && answers.consent_withdrawal === true && answers.consent_age === true);

	const tallies = await tallyRows(e.RESEARCH_DB!);
	ok('one monthly period row exists for the study', tallies.length === 1, String(tallies.length));
	const tally = tallies[0];
	if (!tally) bail('no monthly tally row was stored; the ledger invariant would not hold');
	ok('the period row is keyed by the study and a calendar month', tally.study_id === STUDY && /^\d{4}-\d{2}$/.test(String(tally.period)), `${tally.study_id} ${tally.period}`);
	ok('the period row counts one received answer', tally.received === 1 && tally.withdrawn === 0 && tally.replaced === 0, `${tally.received}/${tally.withdrawn}/${tally.replaced}`);

	const count = await get(e, `/api/studies/${SLUG}/count`);
	ok('the count read sees the stored answer', count.status === 200 && count.body.count === 1, `${count.status} ${count.body.count}`);

	return { receipt, e, row, tally };
})();

console.log('\n  ── the withdrawal deletes the row and keeps the month balanced ──\n');

{
	const { receipt, e } = stored;
	const withdrawn = await post(e, `/api/studies/${SLUG}/withdraw`, { receipt });
	ok('the receipt deletes the answer', withdrawn.status === 200 && withdrawn.body.deleted === true, `${withdrawn.status} ${withdrawn.body.deleted}`);

	const rows = await responseRows(e.RESEARCH_DB!);
	ok('no response row remains', rows.length === 0, String(rows.length));
	const tallies = await tallyRows(e.RESEARCH_DB!);
	const tally = tallies[0];
	ok('the period row now says one received and one withdrawn', tally?.received === 1 && tally?.withdrawn === 1 && tally?.replaced === 0, `${tally?.received}/${tally?.withdrawn}/${tally?.replaced}`);
	ok('the month still balances: stored = received - withdrawn - replaced', (tally?.received ?? 0) - (tally?.withdrawn ?? 0) - (tally?.replaced ?? 0) === rows.length);
}

console.log('\n  ── a gate that does not name the study writes nothing ──\n');

{
	const e = await env({ RESEARCH_ACCEPT: 'police' });
	const refused = await post(e, `/api/studies/${SLUG}/submit`, submitPayload());
	ok(
		'an allowlist that omits the study refuses 403',
		refused.status === 403 && refused.body.error === 'submissions are closed',
		`${refused.status} ${refused.body.error ?? ''}`
	);
	const rows = await responseRows(e.RESEARCH_DB!);
	const tallies = await tallyRows(e.RESEARCH_DB!);
	ok('the refusal wrote no response row and no period row', rows.length === 0 && tallies.length === 0, `${rows.length} rows, ${tallies.length} periods`);
}

console.log('\n  ── naming the study opens it and leaves the police study alone ──\n');

{
	const e = await env({ RESEARCH_ACCEPT: `police,${SLUG}` });
	const police = await get(e, '/api/studies/police');
	const budget = await get(e, `/api/studies/${SLUG}`);
	ok('the police study is still accepting in the same environment', police.status === 200 && police.body.study?.accepting === true, `${police.status} ${police.body.study?.accepting}`);
	ok('the budget study is accepting under the local fielding override', budget.status === 200 && budget.body.study?.accepting === true, `${budget.status} ${budget.body.study?.accepting}`);
}

console.log(`\n  ${checks - failures}/${checks} budget storage checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures > 0 ? 1 : 0);
