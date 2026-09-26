/**
 * The H1 network-continuity review CSV (v0.1.3 plan, milestone M2).
 *
 * The probe publishes how many paths link the 1987, 2011 and 2021 cohorts. That
 * count is arithmetic, not an editorial finding: it says the graph contains a
 * path, not that the path is real. The plan is explicit that "path existence
 * must not be rewritten as proof of institutional continuity", so every
 * surviving path is triaged by hand and the outcome is published beside the
 * number.
 *
 * This module owns the file `output/network-continuity-review.csv`, which
 * `docs/network-continuity.md` already describes as the human triage surface.
 * It is both the reader and the writer:
 *
 *   buildRows   one row per primary path, structural fields derived from the
 *               probe, review fields blank — this is the template a reviewer
 *               fills in.
 *   mergeRows   carries a reviewer's verdict across a rebuild, but only when
 *               the path's nodes and edges are still exactly as reviewed. If
 *               the probe starts emitting a different path, its row comes out
 *               blank, because a verdict attaches to a specific chain of edges
 *               and not to a name.
 *   summarize   the counts the interface publishes next to the null controls.
 *
 * The CSV is read back so the emitted JSON can carry the summary: the number,
 * the triage outcome and the null distribution belong together on the page, or
 * a reader gets a count with no indication that a human looked at it.
 */

export const REVIEW_COLUMNS = [
	'path_id',
	'cohort_pair',
	'index',
	'nodes',
	'edges',
	'edge_kinds',
	'edge_grades',
	'source_paths',
	'verdict',
	'reviewer',
	'review_date',
	'note'
] as const;

export type ReviewColumn = (typeof REVIEW_COLUMNS)[number];
export type ReviewRow = Record<ReviewColumn, string>;

export const VERDICTS = ['supported', 'refuted', 'unresolved'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface ReviewSummary {
	/** Rows carrying a verdict, over all primary paths. */
	reviewed: number;
	/** Primary paths the probe published. */
	total: number;
	supported: number;
	refuted: number;
	unresolved: number;
	/** Rows whose verdict the reviewer has not filled in yet. */
	unreviewed: number;
	/** The reviewer and date on the most recent verdict, for attribution. */
	reviewer?: string;
	review_date?: string;
	source: string;
}

// ---------------------------------------------------------------- CSV

function quote(value: string): string {
	// RFC 4180: quote anything containing a delimiter, a quote or a newline.
	// Every field is quoted unconditionally when any needs it, so a row stays
	// readable in a plain text editor.
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Parse one CSV record, honouring quoted fields that contain commas. */
function parseRecord(line: string): string[] {
	const out: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"' && line[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				quoted = false;
			} else {
				field += c;
			}
		} else if (c === '"') {
			quoted = true;
		} else if (c === ',') {
			out.push(field);
			field = '';
		} else {
			field += c;
		}
	}
	out.push(field);
	return out;
}

/** Read a review file. Returns [] when it is absent or has no data rows. */
export function parseReviewCsv(text: string): ReviewRow[] {
	const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length);
	if (lines.length < 2) return [];
	const header = parseRecord(lines[0]);
	if (header[0] !== 'path_id') return [];
	return lines.slice(1).map((line) => {
		const cells = parseRecord(line);
		const row = {} as ReviewRow;
		REVIEW_COLUMNS.forEach((c, i) => (row[c] = (cells[i] ?? '').trim()));
		return row;
	});
}

export function renderReviewCsv(rows: readonly ReviewRow[]): string {
	const lines = [REVIEW_COLUMNS.join(',')];
	for (const row of rows) lines.push(REVIEW_COLUMNS.map((c) => quote(row[c] ?? '')).join(','));
	return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- rows

interface StructuralRow {
	path_id: string;
	cohort_pair: string;
	index: string;
	nodes: string;
	edges: string;
	edge_kinds: string;
	edge_grades: string;
	source_paths: string;
}

/** Structural columns for every primary path, in probe order. */
export function buildRows(structural: readonly StructuralRow[]): ReviewRow[] {
	return structural.map((s) => ({
		path_id: s.path_id,
		cohort_pair: s.cohort_pair,
		index: s.index,
		nodes: s.nodes,
		edges: s.edges,
		edge_kinds: s.edge_kinds,
		edge_grades: s.edge_grades,
		source_paths: s.source_paths,
		verdict: '',
		reviewer: '',
		review_date: '',
		note: ''
	}));
}

/**
 * Carry review decisions across a rebuild.
 *
 * A verdict attaches to the exact chain that was reviewed, so the key is
 * `nodes` + `edges`. Anything else — a reordered path, a changed edge, a path
 * that no longer exists — loses its verdict and comes out blank, which is the
 * signal that it needs looking at again. Rows for paths the probe no longer
 * emits are dropped from the live list but returned separately, so a caller can
 * report them rather than losing them silently.
 */
export function mergeRows(
	current: readonly ReviewRow[],
	existing: readonly ReviewRow[]
): { rows: ReviewRow[]; dropped: ReviewRow[]; carried: number } {
	const key = (r: ReviewRow) => `${r.nodes}\u0000${r.edges}`;
	const byKey = new Map(existing.map((r) => [key(r), r]));
	const dropped = existing.filter((r) => !current.some((c) => key(c) === key(r)));
	let carried = 0;
	const rows = current.map((row) => {
		const prior = byKey.get(key(row));
		if (!prior) return row;
		const filled = (prior.verdict ?? '').trim().length > 0;
		if (filled) carried++;
		return { ...row, verdict: prior.verdict, reviewer: prior.reviewer, review_date: prior.review_date, note: prior.note, edge_grades: prior.edge_grades || row.edge_grades, source_paths: prior.source_paths || row.source_paths };
	});
	return { rows, dropped, carried };
}

/** Counts for the interface, and for the gate that reads them back. */
export function summarize(rows: readonly ReviewRow[], source: string): ReviewSummary {
	const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
	const reviewed = rows.filter((r) => (r.verdict ?? '').trim().length > 0);
	const dated = [...reviewed].sort((a, b) => (a.review_date < b.review_date ? 1 : -1));
	return {
		reviewed: reviewed.length,
		total: rows.length,
		supported: count('supported'),
		refuted: count('refuted'),
		unresolved: count('unresolved'),
		unreviewed: rows.length - reviewed.length,
		...(dated[0]?.reviewer ? { reviewer: dated[0].reviewer } : {}),
		...(dated[0]?.review_date ? { review_date: dated[0].review_date } : {}),
		source
	};
}

/** A verdict the vocabulary does not allow, or an empty one where one is required. */
export function invalidVerdicts(rows: readonly ReviewRow[]): string[] {
	return rows
		.filter((r) => (r.verdict ?? '').trim().length > 0 && !VERDICTS.includes(r.verdict.trim() as Verdict))
		.map((r) => `${r.path_id}: "${r.verdict}"`);
}

/** Rows that carry a verdict but no reviewer or date — an unattributed finding. */
export function unattributed(rows: readonly ReviewRow[]): string[] {
	return rows
		.filter((r) => (r.verdict ?? '').trim().length > 0 && (!r.reviewer?.trim() || !r.review_date?.trim()))
		.map((r) => r.path_id);
}
