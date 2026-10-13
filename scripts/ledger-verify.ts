/**
 * Check the public ledger, and a released month against it.
 *
 * The ledger (`ledger/<study>.jsonl`) is one line a day, copied from the live
 * endpoint by the scheduled job: this month's counters and fingerprint, and last
 * month's final ones (community/research-commitment.ts). This script checks
 * what anyone can check without our database:
 *
 *   1. every entry balances: stored = received - withdrawn - replaced;
 *   2. within a month, received, withdrawn and replaced never go down;
 *   3. a closed month is recorded the same way every time it appears;
 *   4. with --release, the released rows of a closed month give exactly its
 *      recorded fingerprint and row count.
 *
 * Usage:
 *   npx tsx scripts/ledger-verify.ts --ledger ledger/police-index.jsonl
 *   npx tsx scripts/ledger-verify.ts --ledger ledger/police-index.jsonl \
 *       --release police-index-2026-11.jsonl --period 2026-11
 *
 * A release file is JSON lines, one released row per line, in the form
 * `releaseRow` produces.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { monthDigest, type MonthCommitment, type ReleaseRow } from '../community/research-commitment.ts';

export interface LedgerEntry {
	recorded_at: string;
	study: string;
	current: MonthCommitment;
	previous: MonthCommitment;
}

export function parseLedger(text: string): LedgerEntry[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as LedgerEntry);
}

/** Problems found in the ledger itself; empty when it is consistent. */
export function verifyLedger(entries: LedgerEntry[]): string[] {
	const problems: string[] = [];
	const lastOpen = new Map<string, MonthCommitment>();
	const closed = new Map<string, MonthCommitment>();
	const sorted = [...entries].sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));
	for (const entry of sorted) {
		for (const month of [entry.current, entry.previous]) {
			const sum = month.received - month.withdrawn - month.replaced;
			if (sum !== month.stored) {
				problems.push(
					`${entry.recorded_at} ${month.period}: stored ${month.stored} but received - withdrawn - replaced = ${sum}`
				);
			}
			if (month.closed) {
				const seen = closed.get(month.period);
				const fields = ['received', 'withdrawn', 'replaced', 'stored', 'digest', 'balanced'] as const;
				if (seen && fields.some((field) => seen[field] !== month[field])) {
					problems.push(`${entry.recorded_at} ${month.period}: a closed month was recorded differently than before`);
				}
				if (!seen) {
					// The closing entry continues the open ones: no counter may fall
					// across the close any more than within the month.
					const before = lastOpen.get(month.period);
					if (before) {
						for (const counter of ['received', 'withdrawn', 'replaced'] as const) {
							if (month[counter] < before[counter]) {
								problems.push(
									`${entry.recorded_at} ${month.period}: ${counter} fell from ${before[counter]} to ${month[counter]} when the month closed`
								);
							}
						}
					}
					closed.set(month.period, month);
				}
			} else {
				if (closed.has(month.period)) {
					problems.push(`${entry.recorded_at} ${month.period}: recorded as open after it was recorded closed`);
				}
				const before = lastOpen.get(month.period);
				if (before) {
					for (const counter of ['received', 'withdrawn', 'replaced'] as const) {
						if (month[counter] < before[counter]) {
							problems.push(`${entry.recorded_at} ${month.period}: ${counter} went down from ${before[counter]} to ${month[counter]}`);
						}
					}
				}
				lastOpen.set(month.period, month);
			}
		}
	}
	return problems;
}

/** The final, closed entry for a month, if the ledger has one. */
export function closedEntry(entries: LedgerEntry[], period: string): MonthCommitment | null {
	for (const entry of entries) {
		for (const month of [entry.current, entry.previous]) {
			if (month.closed && month.period === period) return month;
		}
	}
	return null;
}

/** Problems found comparing released rows with a closed month's entry. */
export async function verifyRelease(rows: ReleaseRow[], entry: MonthCommitment): Promise<string[]> {
	const problems: string[] = [];
	const inMonth = rows.filter((row) => row.period === entry.period);
	if (inMonth.length !== rows.length) {
		problems.push(`${rows.length - inMonth.length} released rows belong to another month`);
	}
	if (inMonth.length !== entry.stored) {
		problems.push(`${inMonth.length} rows released for ${entry.period}, ${entry.stored} recorded`);
	}
	const digest = await monthDigest(inMonth);
	if (digest !== entry.digest) {
		problems.push(`fingerprint of the released rows ${digest} differs from the recorded ${entry.digest}`);
	}
	return problems;
}

async function main() {
	const args = process.argv.slice(2);
	const flag = (name: string) => {
		const i = args.indexOf(name);
		return i >= 0 ? args[i + 1] : undefined;
	};
	const ledgerPath = flag('--ledger');
	if (!ledgerPath) {
		console.error('usage: ledger-verify --ledger <file> [--release <file> --period YYYY-MM]');
		process.exit(2);
	}
	const entries = parseLedger(readFileSync(ledgerPath, 'utf8'));
	const problems = verifyLedger(entries);
	const releasePath = flag('--release');
	const period = flag('--period');
	if (releasePath) {
		if (!period) {
			console.error('--release needs --period');
			process.exit(2);
		}
		const entry = closedEntry(entries, period);
		if (!entry) {
			problems.push(`the ledger has no closed entry for ${period}`);
		} else {
			const rows = parseLedgerRows(readFileSync(releasePath, 'utf8'));
			problems.push(...(await verifyRelease(rows, entry)));
		}
	}
	if (problems.length) {
		for (const problem of problems) console.log(`  x  ${problem}`);
		process.exit(1);
	}
	console.log(`  ok  ${entries.length} ledger entries consistent${releasePath ? `; ${period} matches its release` : ''}`);
}

function parseLedgerRows(text: string): ReleaseRow[] {
	return text
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as ReleaseRow);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main();
}
