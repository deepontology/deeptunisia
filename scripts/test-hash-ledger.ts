/**
 * The hash ledger: every deliberate change to `meta.datasetHash` since the
 * release branch was cut.
 *
 * `meta.datasetHash` (scripts/canonical.ts) is the fingerprint of the data as
 * published. Release code must not move it by accident. When a change moves it
 * on purpose, the same pull request adds one line to docs/hash-ledger.tsv with
 * the hash before, the hash after and a sentence a reader of the dataset
 * understands. This script is the gate.
 *
 *   tsx scripts/test-hash-ledger.ts
 *     The ledger itself: header, six fields per line, hash formats, the chain
 *     (each line's hash_before is the previous line's hash_after), dates valid
 *     and not decreasing, a real reason on every line after the baseline.
 *     Runs the comparison unit tests too.
 *
 *   tsx scripts/test-hash-ledger.ts --base <hash> --head <hash>
 *     The rule: equal hashes pass. Different hashes pass only when the last
 *     ledger line records exactly that change. Anything else exits 1 with one
 *     sentence saying what the pull request has to add.
 *
 * The comparison is a pure function so the five cases below are tested on the
 * same code CI runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const LEDGER = join(ROOT, 'docs', 'hash-ledger.tsv');

export const LEDGER_COLUMNS = ['date', 'data_commit', 'hash_before', 'hash_after', 'pull_request', 'reason'] as const;

const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_REASON = 20;

export interface LedgerLine {
	date: string;
	dataCommit: string;
	hashBefore: string;
	hashAfter: string;
	pullRequest: string;
	reason: string;
}

export interface Comparison {
	ok: boolean;
	message: string;
}

/** Real calendar date in ISO form, not just a shaped string. */
function isDate(value: string): boolean {
	if (!DATE.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Parse and validate the ledger. Returns the lines it could read and every
 * rule broken, so the failure names all problems in one run.
 */
export function parseLedger(text: string): { lines: LedgerLine[]; errors: string[] } {
	const errors: string[] = [];
	const lines: LedgerLine[] = [];
	const raw = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
	if (raw.length === 0 || raw[0].trim() === '') {
		return { lines, errors: ['the ledger is empty: the header line is missing'] };
	}
	const header = raw[0].split('\t');
	if (header.join('\t') !== LEDGER_COLUMNS.join('\t')) {
		errors.push(`line 1: header is "${raw[0]}" instead of "${LEDGER_COLUMNS.join('\t')}"`);
	}
	if (raw.length < 2) errors.push('the ledger has no baseline line');

	for (let i = 1; i < raw.length; i++) {
		const row = i + 1;
		const fields = raw[i].split('\t');
		if (fields.length !== LEDGER_COLUMNS.length) {
			errors.push(`line ${row}: ${fields.length} fields, expected ${LEDGER_COLUMNS.length}`);
			continue;
		}
		const [date, dataCommit, hashBefore, hashAfter, pullRequest, reason] = fields;
		const baseline = lines.length === 0;
		if (!isDate(date)) errors.push(`line ${row}: date "${date}" is not a real YYYY-MM-DD date`);
		if (!COMMIT.test(dataCommit)) errors.push(`line ${row}: data_commit is not 40 lowercase hex characters`);
		if (!HASH.test(hashAfter)) errors.push(`line ${row}: hash_after is not 64 lowercase hex characters`);
		if (baseline) {
			if (hashBefore !== '') errors.push(`line ${row}: the baseline's hash_before must be empty`);
		} else if (!HASH.test(hashBefore)) {
			errors.push(`line ${row}: hash_before is not 64 lowercase hex characters`);
		}
		if (!baseline && pullRequest.trim() === '') errors.push(`line ${row}: pull_request is empty`);
		if (!baseline && reason.trim().length < MIN_REASON) {
			errors.push(`line ${row}: reason is shorter than ${MIN_REASON} characters`);
		}
		if (baseline && reason.trim() === '') errors.push(`line ${row}: reason is empty`);
		const previous = lines[lines.length - 1];
		if (previous && hashBefore !== previous.hashAfter) {
			errors.push(`line ${row}: hash_before does not equal line ${row - 1}'s hash_after`);
		}
		if (previous && isDate(date) && isDate(previous.date) && date < previous.date) {
			errors.push(`line ${row}: date ${date} is earlier than the line above (${previous.date})`);
		}
		lines.push({ date, dataCommit, hashBefore, hashAfter, pullRequest, reason });
	}
	return { lines, errors };
}

/**
 * The rule CI applies. Equal hashes need no line. Different hashes need the
 * last line to record exactly this move.
 */
export function compareHashes(base: string, head: string, lines: LedgerLine[]): Comparison {
	if (base === head) return { ok: true, message: `datasetHash unchanged at ${base}` };
	const last = lines[lines.length - 1];
	if (last && last.hashBefore === base && last.hashAfter === head) {
		const record = last.pullRequest ? `pull request ${last.pullRequest}` : 'no pull request';
		return { ok: true, message: `datasetHash changed ${base} to ${head}, recorded by the last ledger line (${last.date}, ${record})` };
	}
	const what = `hash_before ${base} and hash_after ${head}`;
	if (!last) {
		return {
			ok: false,
			message: `datasetHash changed ${base} to ${head} and the ledger has no line: add a line dated today with ${what}, the pull request number and a reason of at least ${MIN_REASON} characters.`
		};
	}
	const why =
		last.hashBefore !== base && last.hashAfter !== head
			? 'its hash_before and hash_after are both different from this change'
			: last.hashBefore !== base
				? `its hash_before is ${last.hashBefore}, not the base hash`
				: `its hash_after is ${last.hashAfter}, not the head hash`;
	return {
		ok: false,
		message: `datasetHash changed ${base} to ${head} and the last ledger line (${last.date}) does not record it: ${why}. Add a line with ${what}, the pull request number and a reason of at least ${MIN_REASON} characters.`
	};
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function line(before: string, after: string): LedgerLine {
	return {
		date: '2026-11-12',
		dataCommit: 'd'.repeat(40),
		hashBefore: before,
		hashAfter: after,
		pullRequest: '#41',
		reason: 'a reason long enough to pass the check'
	};
}

/** The five cases the rule must get right, run on every no-argument run. */
export function runComparisonCases(): { name: string; passed: boolean; detail: string }[] {
	const cases: { name: string; base: string; head: string; lines: LedgerLine[]; ok: boolean }[] = [
		{ name: 'equal hashes need no line', base: HASH_A, head: HASH_A, lines: [], ok: true },
		{ name: 'changed hashes with a matching last line', base: HASH_B, head: HASH_C, lines: [line(HASH_A, HASH_B), line(HASH_B, HASH_C)], ok: true },
		{ name: 'changed hashes with no line', base: HASH_B, head: HASH_C, lines: [], ok: false },
		{ name: 'changed hashes, last line has the wrong before', base: HASH_B, head: HASH_C, lines: [line(HASH_A, HASH_C)], ok: false },
		{ name: 'changed hashes, last line has the wrong after', base: HASH_B, head: HASH_C, lines: [line(HASH_B, HASH_A)], ok: false },
		{ name: 'changed hashes, last line is older than the change', base: HASH_B, head: HASH_C, lines: [line(HASH_A, HASH_B)], ok: false }
	];
	return cases.map((c) => {
		const result = compareHashes(c.base, c.head, c.lines);
		return { name: c.name, passed: result.ok === c.ok && result.message.length > 0, detail: result.message };
	});
}

function readLedger(): { lines: LedgerLine[]; errors: string[] } {
	if (!existsSync(LEDGER)) return { lines: [], errors: ['docs/hash-ledger.tsv is missing'] };
	return parseLedger(readFileSync(LEDGER, 'utf8'));
}

function report(name: string, passed: boolean, detail = ''): number {
	if (passed) {
		console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
		return 1;
	}
	console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	return 0;
}

function main(argv: string[]): number {
	const baseAt = argv.indexOf('--base');
	const headAt = argv.indexOf('--head');
	const comparing = baseAt !== -1 || headAt !== -1;
	const { lines, errors } = readLedger();

	if (comparing) {
		const base = baseAt === -1 ? '' : (argv[baseAt + 1] ?? '');
		const head = headAt === -1 ? '' : (argv[headAt + 1] ?? '');
		if (!HASH.test(base) || !HASH.test(head)) {
			console.error('  FAIL  --base and --head each need a 64 character lowercase hex hash');
			return 1;
		}
		if (errors.length) {
			console.error(`  FAIL  the ledger does not parse:\n    ${errors.join('\n    ')}`);
			return 1;
		}
		const result = compareHashes(base, head, lines);
		console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.message}`);
		return result.ok ? 0 : 1;
	}

	let checks = 0;
	let passed = 0;
	console.log('\n  ── hash ledger ──\n');
	checks++;
	passed += report('the ledger parses, every line has six fields, the hashes chain, the dates hold, every line has a reason', errors.length === 0, errors.join('; '));

	const cases = runComparisonCases();
	for (const c of cases) {
		checks++;
		passed += report(`comparison: ${c.name}`, c.passed);
	}

	console.log(`\n  ${passed}/${checks} checks passed${passed === checks ? '' : `, ${checks - passed} FAILED`}\n`);
	return passed === checks ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
