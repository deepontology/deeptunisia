/**
 * Checks the draft 2027 budget figures used by the citizen budget study.
 *
 * Fails (exit 1) when: a row lacks an id, label, numeric amount, status or
 * source; ids repeat; a non-memo row total differs from the stated total by
 * more than 1 MD; or a row claims adopted-lf without a URL and a page.
 * Warns (exit 0) when a draft-press row has no URL. Warnings are the gap that
 * the official document must close before freezing.
 *
 * Usage: npx tsx scripts/check-budget-figures.ts [path]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] ?? join(HERE, '..', 'data', 'studies', 'dt-research-003', 'figures-2027.yaml');

const STATUSES = new Set(['draft-press', 'draft-derived', 'draft-plf', 'adopted-lf']);
const TOLERANCE_MD = 1;

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
	if (row.memo !== true) sum += row.amount_md;
}

if (typeof doc.total_md === 'number') {
	const gap = sum - doc.total_md;
	if (Math.abs(gap) > TOLERANCE_MD) failures.push(`rows sum to ${sum.toFixed(3)}, total is ${doc.total_md}: off by ${gap.toFixed(3)} MD`);
	else console.log(`  ok    rows sum to ${sum.toFixed(3)} MD, total ${doc.total_md} MD (gap ${gap.toFixed(3)})`);
}

/*
 * The adopted 2024 to 2026 budgets (history file): every year's missions must add up
 * to the law's stated total to the thousand dinars, every mission and programme needs a
 * printed JORT page, and each year needs its source and url. Skipped when a path is given.
 */
if (!process.argv[2]) {
	const historyPath = join(HERE, '..', 'data', 'studies', 'dt-research-003', 'history-lf-2024-2026.yaml');
	interface Entry { amount_md?: unknown; page?: unknown; label?: unknown }
	interface Year { total_md?: unknown; source?: unknown; url?: unknown; missions?: Record<string, Entry>; programmes?: Record<string, Entry> }
	const history = parse(readFileSync(historyPath, 'utf8')) as { years?: Record<string, Year> };
	const years = Object.entries(history.years ?? {});
	if (years.length === 0) failures.push('history: no years');
	for (const [year, y] of years) {
		if (typeof y.source !== 'string' || typeof y.url !== 'string') failures.push(`history ${year}: source and url are required`);
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
}

for (const w of warnings) console.log(`  warn  ${w}`);
for (const f of failures) console.error(`  FAIL  ${f}`);
console.log(`\n  ${(doc.rows ?? []).length} rows, ${failures.length} failure(s), ${warnings.length} warning(s)\n`);
process.exit(failures.length > 0 ? 1 : 0);
