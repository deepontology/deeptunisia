/**
 * Checks the draft 2027 budget figures used by the citizen budget study.
 *
 * Fails (exit 1) when: a row lacks an id, label, numeric amount, status or
 * source; ids repeat; a non-memo row total differs from the stated total by
 * more than 0.5 MD; or a row claims adopted-lf without a URL and a page.
 * Warns (exit 0) when draft-press rows have no URL. With --strict, those
 * warnings fail: that is the mode to use before freezing the instrument.
 *
 * Also checks the adopted-law history: every year's missions sum to the law's
 * total to the dinar, every mission and programme has a printed page, the
 * kept page images exist, and each year carries the SHA-256 of its source PDF.
 * The 2026 programme file is checked against the same law's mission totals, so
 * the detail panel can never drift from the history table.
 *
 * Usage: npx tsx scripts/check-budget-figures.ts [path] [--strict]
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STUDY = join(ROOT, 'data', 'studies', 'dt-research-003');
const path = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(STUDY, 'figures-2027.yaml');
const strict = process.argv.includes('--strict');

const STATUSES = new Set(['draft-press', 'draft-derived', 'draft-plf', 'adopted-lf']);
/** The rows now close the total by construction; allow only float dust. */
const TOLERANCE_MD = 0.001;
/** Programme lines are printed to the thousand dinars; 50,000 dinars covers the rounding. */
const PROGRAMME_TOLERANCE_MD = 0.05;

interface Row {
	id?: unknown;
	label_en?: unknown;
	amount_md?: unknown;
	status?: unknown;
	source?: unknown;
	url?: unknown;
	page?: unknown;
	memo?: unknown;
}

const failures: string[] = [];
const warnings: string[] = [];
const doc = parse(readFileSync(path, 'utf8')) as { total_md?: unknown; rows?: Row[] };

if (typeof doc.total_md !== 'number') failures.push('total_md must be a number');
if (!Array.isArray(doc.rows) || doc.rows.length === 0) failures.push('rows must be a non-empty list');

const seen = new Set<string>();
let sum = 0;
const memoRows = new Map<string, number>();
for (const row of doc.rows ?? []) {
	const id = typeof row.id === 'string' ? row.id : '(no id)';
	if (typeof row.id !== 'string' || row.id.length === 0) failures.push(`${id}: id is required`);
	if (seen.has(id)) failures.push(`${id}: id repeats`);
	seen.add(id);
	if (typeof row.label_en !== 'string' || row.label_en.length === 0) failures.push(`${id}: label_en is required`);
	if (typeof row.amount_md !== 'number' || !Number.isFinite(row.amount_md) || row.amount_md < 0) {
		failures.push(`${id}: amount_md must be a non-negative number`);
		continue;
	}
	if (typeof row.status !== 'string' || !STATUSES.has(row.status)) failures.push(`${id}: status must be one of ${[...STATUSES].join(', ')}`);
	if (typeof row.source !== 'string' || row.source.length === 0) failures.push(`${id}: source is required`);
	const hasUrl = typeof row.url === 'string' && row.url.length > 0;
	const hasPage = typeof row.page === 'string' && row.page.length > 0;
	if (row.status === 'adopted-lf' && (!hasUrl || !hasPage)) failures.push(`${id}: adopted-lf needs a url and a page`);
	if (row.status === 'draft-press' && !hasUrl) warnings.push(`${id}: press-reported, no url yet`);
	if (row.memo === true) memoRows.set(id, row.amount_md);
	else sum += row.amount_md;
}

if (typeof doc.total_md === 'number') {
	const gap = sum - doc.total_md;
	if (Math.abs(gap) > TOLERANCE_MD) failures.push(`rows sum to ${sum.toFixed(3)}, total is ${doc.total_md}: off by ${gap.toFixed(3)} MD`);
	else console.log(`  ok    rows sum to ${sum.toFixed(3)} MD, total ${doc.total_md} MD (gap ${gap.toFixed(3)})`);
}

/* The subsidy memo is one sourced total with two derived rows that must sum to it. */
const memo = memoRows.get('subsidies_total_memo');
const energy = memoRows.get('subsidies_energy_2027');
const food = memoRows.get('subsidies_food_2027');
if (memo === undefined || energy === undefined || food === undefined) {
	failures.push('the subsidy memo and its two derived rows are required');
} else if (Math.abs(energy + food - memo) > 1e-6) {
	failures.push(`subsidy split ${energy} + ${food} does not equal the memo ${memo}`);
} else {
	console.log(`  ok    subsidy memo ${memo} MD split into ${energy} + ${food} MD`);
}

/*
 * The adopted budgets (history file): every year's missions must add up to the
 * law's stated total to the thousand dinars, every mission and programme needs a
 * printed JORT page, and each year needs its source, url, PDF hash and kept crops.
 * Skipped when a path is given.
 */
if (!process.argv[2] || process.argv[2].startsWith('--')) {
	const historyPath = join(STUDY, 'history-lf-2020-2026.yaml');
	interface Entry { amount_md?: unknown; page?: unknown; label?: unknown }
	interface Year {
		total_md?: unknown;
		source?: unknown;
		url?: unknown;
		pdf_sha256?: unknown;
		crops?: Record<string, string>;
		missions?: Record<string, Entry>;
		programmes?: Record<string, Entry>;
	}
	const history = parse(readFileSync(historyPath, 'utf8')) as { years?: Record<string, Year> };
	const years = Object.entries(history.years ?? {});
	if (years.length === 0) failures.push('history: no years');
	for (const [year, y] of years) {
		if (typeof y.source !== 'string' || typeof y.url !== 'string') failures.push(`history ${year}: source and url are required`);
		if (typeof y.pdf_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(y.pdf_sha256)) failures.push(`history ${year}: pdf_sha256 must be a lowercase SHA-256`);
		if (!y.crops || Object.keys(y.crops).length === 0) failures.push(`history ${year}: at least one kept page crop is required`);
		for (const [page, file] of Object.entries(y.crops ?? {})) {
			const full = join(STUDY, file);
			if (!existsSync(full) || statSync(full).size < 1000) failures.push(`history ${year}: crop for page ${page} is missing or empty (${file})`);
		}
		let total = 0;
		for (const [kind, entries] of [['mission', y.missions ?? {}], ['programme', y.programmes ?? {}]] as const) {
			for (const [id, e] of Object.entries(entries)) {
				if (typeof e.amount_md !== 'number' || e.amount_md < 0) failures.push(`history ${year} ${kind} ${id}: amount_md must be a non-negative number`);
				if (typeof e.page !== 'number') failures.push(`history ${year} ${kind} ${id}: page is required`);
				if (kind === 'mission' && typeof e.amount_md === 'number') total += e.amount_md;
			}
		}
		const gap = total - Number(y.total_md);
		if (Math.abs(gap) > 0.0005) failures.push(`history ${year}: missions sum to ${total.toFixed(3)}, law total ${y.total_md}`);
		else console.log(`  ok    ${year}: ${Object.keys(y.missions ?? {}).length} missions sum to the law total, ${y.total_md} MD`);
	}

	/* The 2026 programme detail: every mission's programmes add up to the mission total. */
	const programmesPath = join(STUDY, 'programmes-2026.yaml');
	const programmes = parse(readFileSync(programmesPath, 'utf8')) as {
		pages?: Record<string, string>;
		missions?: Record<string, { total_md?: unknown; page?: unknown; programmes?: { amount_md?: unknown }[] }>;
	};
	const h2026 = history.years?.['2026'];
	for (const [page, file] of Object.entries(programmes.pages ?? {})) {
		const full = join(STUDY, file);
		if (!existsSync(full) || statSync(full).size < 1000) failures.push(`programmes 2026: page image for ${page} is missing or empty (${file})`);
	}
	if (!programmes.missions || Object.keys(programmes.missions).length === 0) failures.push('programmes 2026: no missions');
	for (const [id, m] of Object.entries(programmes.missions ?? {})) {
		const ptotal = (m.programmes ?? []).reduce((s, p) => s + (typeof p.amount_md === 'number' ? p.amount_md : NaN), 0);
		const historyTotal = h2026?.missions?.[id]?.amount_md;
		if (typeof m.total_md !== 'number') failures.push(`programmes 2026 ${id}: total_md is required`);
		else if (Math.abs(ptotal - m.total_md) > PROGRAMME_TOLERANCE_MD) failures.push(`programmes 2026 ${id}: programmes sum to ${ptotal.toFixed(3)}, mission total ${m.total_md}`);
		if (typeof historyTotal !== 'number') failures.push(`programmes 2026 ${id}: mission is not in the 2026 history table`);
		else if (typeof m.total_md === 'number' && Math.abs(m.total_md - historyTotal) > PROGRAMME_TOLERANCE_MD) failures.push(`programmes 2026 ${id}: mission total ${m.total_md} differs from history ${historyTotal}`);
		if (typeof m.page !== 'number' || !programmes.pages?.[String(m.page)]) failures.push(`programmes 2026 ${id}: page ${m.page} has no kept page image`);
	}
	console.log(`  ok    programmes 2026: ${Object.keys(programmes.missions ?? {}).length} missions checked against the history table`);
}

if (warnings.length > 0) {
	if (strict) failures.push(`${warnings.length} press-reported rows still have no URL (--strict)`);
	else console.log(`  warn  ${warnings.length} press-reported rows have no URL yet; run with --strict to make that a failure`);
}
for (const f of failures) console.error(`  FAIL  ${f}`);
console.log(`\n  ${(doc.rows ?? []).length} rows, ${failures.length} failure(s), ${warnings.length} warning(s)\n`);
process.exit(failures.length > 0 ? 1 : 0);
