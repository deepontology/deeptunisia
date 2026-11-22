/**
 * The JORT verification of the adopted years, read from the committed audit record.
 *
 * Ticket 0027 read every mission and programme line of the six adopted laws twice
 * from its kept page crop, and resolved the disagreements by a third reader or by
 * the programme arithmetic. The record here carries, per printed row, its page and
 * its status; the amounts stay in history-lf-2020-2026.yaml, and the record pins them
 * with a hash so a figure cannot change without a new audit.
 *
 * A board line is built from one or more printed rows (HISTORY_ROWS). Its cell is:
 *
 *   verified  one printed row, verified. It can be labelled with its page as printed.
 *   derived   a sum, a subtraction, or an adjusted row. Every component is verified,
 *             but the figure itself is not a printed cell and never says "as printed".
 *   single    a component was read once only. The cell says so and stays unverified.
 */
import { parse } from 'yaml';
import verificationRaw from '../../../data/studies/dt-research-003/verification-lf-2020-2026.yaml?raw';
import { HISTORY_ROWS, type LineId } from '../budget-game/lines';
import type { BoardCopy } from '../budget-game/board-copy';

export type RowStatus = 'verified' | 'derived' | 'single';
export type CellStatus = RowStatus;

export interface RowCheck {
	page: number;
	status: RowStatus;
	basis: string;
	note?: string;
	arithmetic_override?: boolean;
}

interface YearCheck {
	pages: number[];
	values_sha256: string;
	rows: Record<string, RowCheck>;
}

export interface CellPart {
	id: string;
	kind: 'mission' | 'programme';
	page: number;
	status: RowStatus;
	note?: string;
}

export interface CellCheck {
	year: number;
	line: LineId;
	status: CellStatus;
	/** Every printed page the components sit on, ascending and deduplicated. */
	pages: number[];
	/** The printed rows the line is built from, so a panel can name them. */
	parts: CellPart[];
}

interface VerificationDoc {
	study: string;
	audit: string;
	checked: string;
	summary: { audited: number; verified: number; two_readers_agree: number; resolved: number; single_read: number };
	years: Record<string, YearCheck>;
}

export const VERIFICATION: VerificationDoc = parse(verificationRaw) as VerificationDoc;

const yearChecks = new Map<number, YearCheck>(
	Object.entries(VERIFICATION.years).map(([year, check]) => [Number(year), check])
);

/** Every adopted year the audit covers, oldest first. */
export const VERIFIED_YEARS: number[] = [...yearChecks.keys()].sort((a, b) => a - b);

export function rowCheck(year: number, id: string): RowCheck | null {
	return yearChecks.get(year)?.rows[id] ?? null;
}

/**
 * The verification of one board line in one adopted year, or null when the audit
 * record has no row for a component (which the check script makes a failure).
 */
export function cellCheck(year: number, line: LineId): CellCheck | null {
	const made = HISTORY_ROWS[line];
	const parts: CellPart[] = [];
	for (const [kind, ids] of [
		['mission', made.missions ?? []],
		['programme', [...(made.programmes ?? []), ...(made.minusProgrammes ?? [])]]
	] as const) {
		for (const id of ids) {
			const check = rowCheck(year, id);
			/* A mission a year's law does not print counts as zero on the line. It is not a
			   claim, so it needs no record; every row the year does print is audited. */
			if (!check) continue;
			parts.push({ id, kind, page: check.page, status: check.status, note: check.note });
		}
	}
	if (parts.length === 0) return null;
	const status: CellStatus = parts.some((p) => p.status === 'single')
		? 'single'
		: parts.length > 1 || parts.some((p) => p.status === 'derived')
			? 'derived'
			: 'verified';
	const pages = [...new Set(parts.map((p) => p.page))].sort((a, b) => a - b);
	return { year, line, status, pages, parts };
}

/** The one row status that is not verified, for a panel that must name it. */
export function singleParts(check: CellCheck): CellPart[] {
	return check.parts.filter((p) => p.status === 'single');
}

/** "JORT 2026, p. 3375", or a range when the line is built from rows on several pages. */
export function jortLabel(check: CellCheck, copy: BoardCopy): string {
	const from = String(check.pages[0] ?? '');
	const to = check.pages.length > 1 ? String(check.pages[check.pages.length - 1]) : null;
	return copy.jort(String(check.year), from, to);
}

/** The audit phrase of one cell: verified, derived from verified rows, or one read once. */
export function checkPhrase(check: CellCheck, copy: BoardCopy): string {
	const label = jortLabel(check, copy);
	return check.status === 'single' ? copy.singleCell(label) : check.status === 'derived' ? copy.derivedCell(label) : copy.verifiedCell(label);
}
