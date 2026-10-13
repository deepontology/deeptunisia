/**
 * The daily commitment (index-spec.md §7a).
 *
 * The live page shows counts and figures the project computes from rows nobody
 * else can see, so on its own it is the project auditing itself. This module is
 * what lets a reader hold it to its numbers afterwards. For each calendar month
 * it publishes three counters and one fingerprint:
 *
 *   - received, withdrawn and replaced: every answer that arrived, every one a
 *     respondent deleted with their receipt, and every one an update replaced.
 *     The rows stored for the month must equal received - withdrawn - replaced,
 *     so a row that disappeared without a withdrawal shows as a broken sum;
 *   - the fingerprint: a SHA-256 over the month's stored rows, each in the form
 *     it will be released in. Rows are reduced to that form first, so the
 *     fingerprint can be recomputed from the released data alone, and no
 *     receipt, link code or timestamp finer than the month goes into it.
 *
 * A scheduled job copies the commitment into the public repository once a day
 * (`ledger/`), where git history dates every entry. A closed month can no longer
 * change (withdrawal ends with the month, and new answers belong to the new
 * one), so the entry written the night a month closes is final: when that
 * month's data is released, anyone can recompute its fingerprint and counters
 * and see whether a single row was added, removed or altered since.
 *
 * What it cannot prove, and the page says so: that the rows stored as they
 * arrived came from real people. It fixes the record in place; it does not
 * vouch for what entered it.
 */

import type { ScoringSpec } from './research-scoring.ts';

/** The form one stored row is released in, and the only thing fingerprinted. */
export interface ReleaseRow {
	period: string;
	instrument_hash: string;
	locale: string;
	revision: string | null;
	/** Whole seconds: enough to re-run the speed exclusion, nothing finer. */
	completion_s: number;
	answers: Record<string, unknown>;
}

export interface StoredRowForRelease {
	period: string;
	instrument_hash: string;
	locale: string;
	revision: string | null;
	completion_ms: number;
	answers: Record<string, unknown>;
}

/**
 * Reduce one stored row to its released form. The optional region answer is
 * replaced by its published group (the governorate never leaves), and an answer
 * outside every group — "outside Tunisia", "prefer not to answer" — is kept as
 * given, because those options name no place inside the country.
 */
export function releaseRow(spec: ScoringSpec | undefined, row: StoredRowForRelease): ReleaseRow {
	const answers = { ...row.answers };
	const regions = spec?.regions;
	if (regions) {
		const value = answers[regions.item];
		if (typeof value === 'string') {
			for (const [group, options] of Object.entries(regions.groups)) {
				if (options.includes(value)) {
					answers[regions.item] = group;
					break;
				}
			}
		}
	}
	return {
		period: row.period,
		instrument_hash: row.instrument_hash,
		locale: row.locale,
		revision: row.revision ?? null,
		completion_s: Math.floor(row.completion_ms / 1000),
		answers
	};
}

/** JSON with object keys sorted at every depth, so equal rows serialise equally. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

async function sha256Hex(text: string): Promise<string> {
	const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The fingerprint of one released row. */
export function rowDigest(row: ReleaseRow): Promise<string> {
	return sha256Hex(canonicalJson(row));
}

/**
 * The fingerprint of a month: SHA-256 over the sorted row fingerprints, one per
 * line. Sorting makes it independent of storage order, and identical rows keep
 * their multiplicity, so two equal answers fingerprint differently from one.
 */
export async function monthDigest(rows: ReleaseRow[]): Promise<string> {
	const digests = await Promise.all(rows.map(rowDigest));
	digests.sort();
	return sha256Hex(digests.join('\n'));
}

export interface MonthCommitment {
	period: string;
	/** True once the month has ended: its rows and counters can no longer change. */
	closed: boolean;
	received: number;
	withdrawn: number;
	replaced: number;
	/** Rows stored for the month right now. */
	stored: number;
	/** received - withdrawn - replaced === stored. */
	balanced: boolean;
	digest: string;
}

export interface Tally {
	received: number;
	withdrawn: number;
	replaced: number;
}

export async function commitMonth(
	period: string,
	closed: boolean,
	tally: Tally,
	rows: ReleaseRow[]
): Promise<MonthCommitment> {
	return {
		period,
		closed,
		received: tally.received,
		withdrawn: tally.withdrawn,
		replaced: tally.replaced,
		stored: rows.length,
		balanced: tally.received - tally.withdrawn - tally.replaced === rows.length,
		digest: await monthDigest(rows)
	};
}

/** The month before a "YYYY-MM" period. */
export function previousPeriod(period: string): string {
	const [year, month] = period.split('-').map(Number);
	return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** The first millisecond of a "YYYY-MM" period, with its boundary at the given UTC offset. */
export function periodStart(period: string, utcOffsetMinutes: number): number {
	const [year, month] = period.split('-').map(Number);
	return Date.UTC(year, month - 1, 1) - utcOffsetMinutes * 60_000;
}
