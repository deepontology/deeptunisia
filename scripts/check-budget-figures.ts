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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { HISTORY_ROWS, LOCKED_ORDER, MOVABLE_ORDER, type LineId } from '../src/lib/budget-game/lines.ts';

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

/** PNG width and height, or null when the file is not a PNG. */
function pngSize(file: string): { w: number; h: number } | null {
	const b = readFileSync(file);
	if (b.length < 24 || b[0] !== 0x89 || b.toString('ascii', 1, 4) !== 'PNG') return null;
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
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
	let cropPages = 0;
	for (const [year, y] of years) {
		if (typeof y.source !== 'string' || typeof y.url !== 'string') failures.push(`history ${year}: source and url are required`);
		if (typeof y.pdf_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(y.pdf_sha256)) failures.push(`history ${year}: pdf_sha256 must be a lowercase SHA-256`);
		if (!y.crops || Object.keys(y.crops).length === 0) failures.push(`history ${year}: at least one kept page crop is required`);
		for (const [page, file] of Object.entries(y.crops ?? {})) {
			const full = join(STUDY, file);
			if (!existsSync(full) || statSync(full).size < 1000) {
				failures.push(`history ${year}: crop for page ${page} is missing or empty (${file})`);
				continue;
			}
			const size = pngSize(full);
			if (!size) failures.push(`history ${year}: crop for page ${page} is not a PNG (${file})`);
			else if (size.w < 700 || size.h < 1000) failures.push(`history ${year}: crop for page ${page} is not a full page (${size.w}x${size.h}); the footer with the JORT issue, date and page number must be visible`);
			else cropPages++;
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
	console.log(`  ok    ${cropPages} page crops are full pages; the JORT issue, date and page number are in frame`);

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

	/*
	 * Revenue: Article premier and Article 2 of each law. The two identities must hold
	 * to the thousand dinars, the spending total must be the same law's total the board
	 * already uses, and every figure must have its printed page and its kept crop.
	 */
	const revenuePath = join(STUDY, 'revenue-lf-2020-2026.yaml');
	interface RevYear {
		spending_md?: unknown;
		revenue_md?: unknown;
		tax_md?: unknown;
		non_tax_md?: unknown;
		grants_md?: unknown;
		deficit_md?: unknown;
		page?: unknown;
		crop?: unknown;
		tableau_a_page?: unknown;
		tableau_a_crop?: unknown;
		pdf_sha256?: unknown;
	}
	const revenue = parse(readFileSync(revenuePath, 'utf8')) as { years?: Record<string, RevYear> };
	const revYears = Object.entries(revenue.years ?? {});
	if (revYears.length === 0) failures.push('revenue: no years');
	for (const [year, r] of revYears) {
		const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
		const spending = n(r.spending_md);
		const total = n(r.revenue_md);
		const tax = n(r.tax_md);
		const nonTax = n(r.non_tax_md);
		const grants = n(r.grants_md);
		const deficit = n(r.deficit_md);
		if ([spending, total, tax, nonTax, grants, deficit].some((v) => Number.isNaN(v))) {
			failures.push(`revenue ${year}: spending, revenue, tax, non-tax, grants and deficit must all be numbers`);
			continue;
		}
		if (typeof r.pdf_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.pdf_sha256)) failures.push(`revenue ${year}: pdf_sha256 must be a lowercase SHA-256`);
		const lineSum = Math.round((tax + nonTax + grants) * 1000) / 1000;
		if (Math.abs(lineSum - total) > 0.0005) failures.push(`revenue ${year}: tax ${tax} + non-tax ${nonTax} + grants ${grants} = ${lineSum}, article 2 total ${total}`);
		if (Math.abs(spending - total - deficit) > 0.0005) failures.push(`revenue ${year}: spending ${spending} - revenue ${total} = ${Math.round((spending - total) * 1000) / 1000}, deficit ${deficit}`);
		const histTotal = history.years?.[year]?.total_md;
		if (typeof histTotal !== 'number') failures.push(`revenue ${year}: no spending side in the history file`);
		else if (Math.abs(spending - histTotal) > 0.0005) failures.push(`revenue ${year}: spending ${spending} differs from the history total ${histTotal}`);
		if (typeof r.page !== 'number') failures.push(`revenue ${year}: printed page is required`);
		for (const [what, file] of [
			['article page', r.crop],
			['tableau A page', r.tableau_a_crop]
		] as const) {
			if (typeof file !== 'string' || file.length === 0) {
				failures.push(`revenue ${year}: ${what} crop is required`);
				continue;
			}
			const full = join(STUDY, file);
			if (!existsSync(full) || statSync(full).size < 1000) {
				failures.push(`revenue ${year}: ${what} crop is missing or empty (${file})`);
				continue;
			}
			const size = pngSize(full);
			if (!size) failures.push(`revenue ${year}: ${what} crop is not a PNG (${file})`);
			else if (size.w < 700 || size.h < 1000) failures.push(`revenue ${year}: ${what} crop is not a full page (${size.w}x${size.h}); the footer with the issue, date and page number must be visible`);
		}
		const per100 = (tax / (tax + nonTax)) * 100;
		const covered = (tax / spending) * 100;
		if (!(per100 > 0 && per100 <= 100)) failures.push(`revenue ${year}: tax per 100 raised is ${per100.toFixed(1)}, outside 0 to 100`);
		if (!(covered > 0 && covered <= 100)) failures.push(`revenue ${year}: tax share of spending is ${covered.toFixed(1)}, outside 0 to 100`);
		console.log(`  ok    revenue ${year}: ${tax} tax + ${nonTax} non-tax + ${grants} grants = ${total} MD; tax ${per100.toFixed(1)} per 100 raised, ${covered.toFixed(1)}% of spending; page ${r.page}`);
	}
	for (const year of Object.keys(history.years ?? {})) {
		if (!revenue.years?.[year]) failures.push(`revenue: the history year ${year} has no revenue row`);
	}
	for (const year of Object.keys(revenue.years ?? {})) {
		if (!history.years?.[year]) failures.push(`revenue: ${year} is not a history year`);
	}
	console.log(`  ok    revenue: ${revYears.length} adopted laws, each with its page and its kept crop`);

	/*
	 * The JORT audit (ticket 0027): one record per printed row, with its page and its
	 * status. The stored amounts are pinned by a hash, so a figure cannot change
	 * without a new audit, and every board line must resolve to a record for every
	 * year: no cell may claim a verification the ledger does not carry.
	 */
	type RowStatus = 'verified' | 'derived' | 'single';
	interface AuditRow {
		page?: unknown;
		status?: unknown;
		basis?: unknown;
		note?: unknown;
	}
	interface AuditYear {
		pages?: unknown;
		values_sha256?: unknown;
		rows?: Record<string, AuditRow>;
	}
	const auditPath = join(STUDY, 'verification-lf-2020-2026.yaml');
	const audit = parse(readFileSync(auditPath, 'utf8')) as {
		summary?: { audited?: number; verified?: number; two_readers_agree?: number; resolved?: number; derived?: number; single_read?: number };
		years?: Record<string, AuditYear>;
	};
	const auditYears = Object.entries(audit.years ?? {});
	if (auditYears.length === 0) failures.push('audit: no years');
	let auditedRows = 0;
	let derivedRows = 0;
	let singleRows = 0;
	for (const [year, a] of auditYears) {
		const h = history.years?.[year];
		if (!h) {
			failures.push(`audit ${year}: not a history year`);
			continue;
		}
		const pages = Array.isArray(a.pages) ? (a.pages as unknown[]) : [];
		if (pages.length === 0) failures.push(`audit ${year}: pages must be a non-empty list`);
		const stored = new Set(Object.keys({ ...(h.missions ?? {}), ...(h.programmes ?? {}) }));
		const audited = new Set(Object.keys(a.rows ?? {}));
		for (const id of stored) if (!audited.has(id)) failures.push(`audit ${year}: the stored row "${id}" has no audit record`);
		for (const id of audited) if (!stored.has(id)) failures.push(`audit ${year}: the audit row "${id}" is not in the history file`);
		/* The hash covers the stored amounts the audit cleared, so a later edit breaks it. */
		const pairs: string[] = [];
		for (const [kind, entries] of [['missions', h.missions ?? {}], ['programmes', h.programmes ?? {}]] as const) {
			for (const [id, e] of Object.entries(entries)) pairs.push(`${id}\t${Number(e.amount_md).toFixed(6)}`);
		}
		const digest = createHash('sha256').update(pairs.sort().join('\n')).digest('hex');
		if (a.values_sha256 !== digest) failures.push(`audit ${year}: the stored amounts changed since the audit (hash ${String(a.values_sha256).slice(0, 8)} != ${digest.slice(0, 8)})`);
		for (const [id, r] of Object.entries(a.rows ?? {})) {
			auditedRows++;
			if (r.status !== 'verified' && r.status !== 'derived' && r.status !== 'single') failures.push(`audit ${year} ${id}: status must be verified, derived or single`);
			if (r.status === 'derived') derivedRows++;
			if (r.status === 'single') singleRows++;
			if (typeof r.page !== 'number' || !pages.includes(r.page)) failures.push(`audit ${year} ${id}: page ${String(r.page)} is not one of the year's audited pages`);
			if (typeof r.basis !== 'string' || r.basis.length === 0) failures.push(`audit ${year} ${id}: basis is required`);
			if (r.status === 'derived' && (typeof r.note !== 'string' || r.note.length === 0)) failures.push(`audit ${year} ${id}: a derived row must say what it is made of`);
		}
		/* Every board line, for every adopted year, must resolve. */
		for (const line of [...MOVABLE_ORDER, ...LOCKED_ORDER] as LineId[]) {
			const made = HISTORY_ROWS[line];
			const parts = [...(made.missions ?? []), ...(made.programmes ?? []), ...(made.minusProgrammes ?? [])];
			if (parts.length === 0) failures.push(`audit ${year} ${line}: the board line has no printed rows`);
			/* A mission a year's law does not print counts as zero on the line; only a row the
			   year does carry can sit unverified. */
			for (const id of parts) if (stored.has(id) && !a.rows?.[id]) failures.push(`audit ${year} ${line}: the board line needs the row "${id}", which the audit does not carry`);
		}
	}
	const summary = audit.summary ?? {};
	const verifiedRows = auditedRows - singleRows - derivedRows;
	if (summary.audited !== auditedRows) failures.push(`audit: summary says ${String(summary.audited)} audited, the file holds ${auditedRows}`);
	if (summary.verified !== verifiedRows) failures.push(`audit: summary says ${String(summary.verified)} verified, the file holds ${verifiedRows} (single read and derived excluded)`);
	if (summary.derived !== derivedRows) failures.push(`audit: summary says ${String(summary.derived)} derived, the file holds ${derivedRows}`);
	if (summary.single_read !== singleRows) failures.push(`audit: summary says ${String(summary.single_read)} single read, the file holds ${singleRows}`);
	if ((summary.two_readers_agree ?? 0) + (summary.resolved ?? 0) !== verifiedRows) failures.push('audit: the two-reader and resolved counts do not add up to the verified rows');
	if (singleRows !== 1) failures.push(`audit: ${singleRows} single-read rows, the page says one`);
	console.log(`  ok    audit: ${auditedRows} rows, ${verifiedRows} verified (${summary.two_readers_agree} by two readers, ${summary.resolved} resolved), ${derivedRows} derived, ${singleRows} single read; every board line resolves`);
}

if (warnings.length > 0) {
	if (strict) failures.push(`${warnings.length} press-reported rows still have no URL (--strict)`);
	else console.log(`  warn  ${warnings.length} press-reported rows have no URL yet; run with --strict to make that a failure`);
}
for (const f of failures) console.error(`  FAIL  ${f}`);
console.log(`\n  ${(doc.rows ?? []).length} rows, ${failures.length} failure(s), ${warnings.length} warning(s)\n`);
process.exit(failures.length > 0 ? 1 : 0);
