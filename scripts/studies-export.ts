/**
 * Research response export (portal README §7, m2-contract §5).
 *
 * The first step of the offline release path: close the window, read the
 * study's rows out of the research store and write them to a working CSV on the
 * operator's machine. The build never reads the database, and nothing here
 * writes inside the canonical `data/` or `static/` trees; the CSV is working
 * material that is purged after release (backend.md §5).
 *
 * The store is opened through the same D1-shaped interface the server uses, so
 * this runs unchanged against a local SQLite file and, if the operator ever
 * needs it, against a D1 export in the same shape. Columns are written in the
 * order the contract fixes; `answers` and `maxdiff` travel as the JSON strings
 * the API stored, re-encoded by nothing.
 *
 * Usage:
 *   npx tsx scripts/studies-export.ts [--db .community/research.sqlite]
 *     [--study dt-research-001] [--out research/portal/study-001/data/responses.csv]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDb } from '../community/db-local.ts';
import type { Db } from '../community/db.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** Contract §5 order, and nothing else: an extra column is a schema leak. */
export const EXPORT_COLUMNS = [
	'receipt',
	'study_id',
	'instrument_id',
	'instrument_version',
	'instrument_hash',
	'locale',
	'channel',
	'consent_version',
	'started_at',
	'submitted_at',
	'completion_ms',
	'block_order',
	'scale_direction',
	'answers',
	'maxdiff',
	'created_at'
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
export type ExportRow = Record<ExportColumn, unknown>;

export const DEFAULT_DB = join(ROOT, '.community', 'research.sqlite');
export const DEFAULT_STUDY = 'dt-research-001';
export const DEFAULT_OUT = join(ROOT, 'research', 'portal', 'study-001', 'data', 'responses.csv');

/** RFC 4180: quote when the field holds a comma, quote, CR or LF. */
function csvField(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The CSV body, header included. Pure, so the tests can pin it. */
export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
	const lines = [EXPORT_COLUMNS.join(',')];
	for (const row of rows) {
		lines.push(EXPORT_COLUMNS.map((column) => csvField(row[column])).join(','));
	}
	return `${lines.join('\n')}\n`;
}

/**
 * The canonical trees are build inputs, not scratch space. A mistyped --out
 * that resolved inside data/ or static/ would have the release pipeline writing
 * over its own source, so it is refused before anything is opened.
 */
function assertOutsideCanonicalTrees(outPath: string) {
	const resolved = resolve(outPath);
	for (const tree of ['data', 'static']) {
		const dir = join(ROOT, tree);
		const rel = relative(dir, resolved);
		if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
			throw new Error(`refusing to write inside ${tree}/ (${outPath})`);
		}
	}
}

/**
 * Read one study's rows and write the working CSV. Returns the row count.
 * Throws on a missing table or an unreadable row, so the CLI can print the
 * honest cause instead of a truncated CSV.
 */
export async function exportResponses(db: Db, studyId: string, outPath: string): Promise<number> {
	assertOutsideCanonicalTrees(outPath);
	const rows = (
		await db
			.prepare(
				`SELECT ${EXPORT_COLUMNS.join(', ')} FROM research_responses
				 WHERE study_id = ? ORDER BY submitted_at, receipt`
			)
			.bind(studyId)
			.all<Record<string, unknown>>()
	).results;
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, rowsToCsv(rows), 'utf8');
	return rows.length;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
	const args = process.argv.slice(2);
	const dbPath = arg(args, '--db') ?? DEFAULT_DB;
	const studyId = arg(args, '--study') ?? DEFAULT_STUDY;
	const outPath = arg(args, '--out') ?? DEFAULT_OUT;

	if (dbPath !== ':memory:' && !existsSync(dbPath)) {
		console.error(`  export failed: no research database at ${dbPath}`);
		process.exit(1);
	}
	const db = localDb(dbPath);
	try {
		const rows = await exportResponses(db, studyId, outPath);
		console.log(`  exported ${rows} row(s) for ${studyId} to ${outPath}`);
	} catch (e) {
		console.error(`  export failed: ${(e as Error).message}`);
		process.exit(1);
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main();
}
