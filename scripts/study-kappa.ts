/**
 * study-kappa — Fleiss' κ and Krippendorff's α for the inter-annotator study.
 *
 * Takes 2+ rater CSVs (each: study_id, confidence, basis) and computes:
 *   - Fleiss' κ per field (confidence A-D, basis documented/reported/inferred/unsubstantiated)
 *   - Krippendorff's α (nominal) per field alongside
 *   - Per-kind breakdown if --sample key is given (maps study_id → kind)
 *   - Bootstrap 95% CI (1 000 resamples) for each κ/α
 *
 * Usage:
 *   npx tsx scripts/study-kappa.ts --raters research/study/dry-run/raters/rater-{a,b,c}.csv
 *   npx tsx scripts/study-kappa.ts --raters research/study/raters/rater-a.csv,research/study/raters/rater-b.csv,research/study/raters/rater-c.csv --out research/study/kappa-report.json
 *   npx tsx scripts/study-kappa.ts --raters "research/study/dry-run/raters/*.csv" --sample research/study/dry-run/sample-10-blinded.json --out research/study/dry-run/kappa-report.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
	const idx = process.argv.indexOf(`--${name}`);
	if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
		return process.argv[idx + 1];
	}
	return fallback;
}
function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

const RATERS_ARG = arg('raters', undefined);
const OUT = arg('out', undefined);
const SAMPLE = arg('sample', undefined) ?? arg('key', undefined) ?? arg('blinded', undefined);
const BOOTSTRAP_N = parseInt(arg('bootstrap', '1000')!, 10);
const TARGET_KAPPA_BASIS = 0.8;
const TARGET_KAPPA_CONF = 0.7;

if (!RATERS_ARG) {
	console.error('Usage: npx tsx scripts/study-kappa.ts --raters <csv1,csv2,csv3 or glob> [--sample <blinded.json>] [--out <report.json>]');
	console.error('  --raters  comma-separated list or glob (e.g. "raters/rater-{a,b,c}.csv" or "raters/*.csv")');
	console.error('  --sample  blinded sample JSON to map study_id → kind (for per-kind breakdown)');
	console.error('  --out     report JSON path (also writes .md beside it)');
	process.exit(1);
}

function expandBraces(pattern: string): string[] {
	// a{b,c}d → [abd, acd]
	const m = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);
	if (!m) return [pattern];
	const [, pre, inside, post] = m;
	const parts = inside.split(',');
	const out: string[] = [];
	for (const part of parts) {
		out.push(...expandBraces(`${pre}${part}${post}`));
	}
	return out;
}

let raterFiles: string[] = [];
{
	const raw = RATERS_ARG;
	const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
	const expanded: string[] = [];
	for (const part of parts) {
		const braced = expandBraces(part);
		for (const b of braced) {
			if (b.includes('*')) {
				const slash = b.lastIndexOf('/');
				const dirPart = slash !== -1 ? b.slice(0, slash) : '.';
				const basePat = slash !== -1 ? b.slice(slash + 1) : b;
				const [pre, suf] = basePat.split('*');
				let absDir: string;
				if (b.startsWith('/')) absDir = dirPart;
				else if (dirPart === '.' ) absDir = ROOT;
				else absDir = join(ROOT, dirPart);
				try {
					if (existsSync(absDir)) {
						const files = readdirSync(absDir);
						for (const f of files) {
							if (f.startsWith(pre ?? '') && f.endsWith(suf ?? '')) {
								expanded.push(join(absDir, f));
							}
						}
					}
				} catch {}
			} else {
				const cand = b.startsWith('/') ? b : join(ROOT, b);
				if (existsSync(cand)) expanded.push(cand);
				else if (existsSync(b)) expanded.push(b);
				else expanded.push(cand);
			}
		}
	}
	raterFiles = [...new Set(expanded)];
}

if (raterFiles.length === 0) {
	const cand = RATERS_ARG.includes('{') ? expandBraces(RATERS_ARG)[0] : RATERS_ARG;
	raterFiles = [cand];
}

const resolvedRaterFiles: string[] = [];
for (const f of raterFiles) {
	if (existsSync(f)) resolvedRaterFiles.push(f);
	else if (existsSync(join(ROOT, f))) resolvedRaterFiles.push(join(ROOT, f));
	else {
		console.error(`Rater file not found: ${f}`);
		process.exit(1);
	}
}
if (resolvedRaterFiles.length < 2) {
	console.error(`Need at least 2 rater files, got ${resolvedRaterFiles.length}: ${resolvedRaterFiles.join(', ')}`);
	process.exit(1);
}
raterFiles = resolvedRaterFiles;
console.log(`Raters: ${raterFiles.join(', ')}`);

// ---------------------------------------------------------------------------
// Load rater CSVs
// ---------------------------------------------------------------------------

type RaterRow = { study_id: string; confidence: string | null; basis: string | null; notes?: string };

function parseCSV(path: string): RaterRow[] {
	const text = readFileSync(path, 'utf8');
	const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
	if (lines.length < 2) return [];
	const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
	const idxStudy = header.indexOf('study_id');
	const idxConf = header.indexOf('confidence');
	const idxBasis = header.indexOf('basis');
	const idxNotes = header.indexOf('notes');
	if (idxStudy === -1) {
		console.error(`CSV ${path} missing study_id column (header: ${lines[0]})`);
		process.exit(1);
	}
	const rows: RaterRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		// Simple CSV: handle quoted claim field that may contain commas
		// Split respecting quotes
		const cols: string[] = [];
		let cur = '';
		let inQuotes = false;
		for (let c = 0; c < line.length; c++) {
			const ch = line[c];
			if (ch === '"' && line[c + 1] === '"') {
				cur += '"';
				c++;
			} else if (ch === '"') {
				inQuotes = !inQuotes;
			} else if (ch === ',' && !inQuotes) {
				cols.push(cur);
				cur = '';
			} else {
				cur += ch;
			}
		}
		cols.push(cur);
		const sid = (cols[idxStudy] ?? '').trim();
		if (!sid) continue;
		const norm = (v: string): string | null => {
			const t = v.trim();
			if (!t || t.toLowerCase() === 'unsure' || t === '-') return null;
			return t;
		};
		const conf = idxConf !== -1 ? norm(cols[idxConf] ?? '') : null;
		const basis = idxBasis !== -1 ? norm(cols[idxBasis] ?? '') : null;
		// Normalize confidence to uppercase, basis to lowercase
		const confNorm = conf ? conf.toUpperCase() : null;
		const basisNorm = basis ? basis.toLowerCase() : null;
		rows.push({
			study_id: sid,
			confidence: confNorm && ['A', 'B', 'C', 'D'].includes(confNorm) ? confNorm : conf,
			basis: basisNorm && ['documented', 'reported', 'inferred', 'unsubstantiated'].includes(basisNorm) ? basisNorm : basis,
			notes: idxNotes !== -1 ? (cols[idxNotes] ?? '').trim() : undefined,
		});
	}
	return rows;
}

const raterData: { file: string; name: string; rows: RaterRow[] }[] = raterFiles.map((f, i) => {
	const name = `Rater ${String.fromCharCode(65 + i)} (${f.split('/').pop()})`;
	const rows = parseCSV(f);
	console.log(`  ${name}: ${rows.length} rows`);
	return { file: f, name, rows };
});

// Collect all study_ids (union)
const allIds = new Set<string>();
for (const r of raterData) for (const row of r.rows) allIds.add(row.study_id);
console.log(`Total unique study_ids: ${allIds.size}`);

// Map study_id → kind if sample given
const kindById = new Map<string, string>();
if (SAMPLE && existsSync(SAMPLE)) {
	try {
		const sRaw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
		const prompts = (sRaw.prompts as unknown[]) ?? (sRaw.records as unknown[]) ?? [];
		const key = sRaw.key as Record<string, { kind?: string }> | undefined;
		if (key) {
			for (const [sid, v] of Object.entries(key)) {
				if (v.kind) kindById.set(sid, String(v.kind));
			}
		}
		for (const p of prompts as Record<string, unknown>[]) {
			const sid = String(p.study_id ?? '');
			const kind = String(p.kind ?? '');
			if (sid && kind && !kindById.has(sid)) kindById.set(sid, kind);
		}
		console.log(`  kind mapping: ${kindById.size} ids mapped`);
	} catch (e) {
		console.warn(`  warning: could not load sample for kind mapping: ${(e as Error).message}`);
	}
} else if (SAMPLE) {
	console.warn(`  warning: sample file not found for kind mapping: ${SAMPLE}`);
}

// ---------------------------------------------------------------------------
// Build per-field matrices
// ---------------------------------------------------------------------------

const CONF_CATS = ['A', 'B', 'C', 'D'];
const BASIS_CATS = ['documented', 'reported', 'inferred', 'unsubstantiated'];

type Field = 'confidence' | 'basis';

function buildMatrix(field: Field): {
	items: string[];
	cats: string[];
	matrix: number[][]; // items x cats counts
	observedCats: Set<string>;
} {
	const cats = field === 'confidence' ? CONF_CATS : BASIS_CATS;
	const catIndex = new Map(cats.map((c, i) => [c, i]));
	const items = [...allIds].sort();
	const matrix: number[][] = items.map(() => cats.map(() => 0));
	const observedCats = new Set<string>();

	for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
		const sid = items[itemIdx];
		for (const rater of raterData) {
			const row = rater.rows.find((rw) => rw.study_id === sid);
			const val = row ? (field === 'confidence' ? row.confidence : row.basis) : null;
			if (val == null) continue; // missing/unsure → not counted (pairwise deletion for Fleiss; alpha handles separately)
			// Normalize: for basis, map any unexpected to lowercased
			let norm = val;
			if (field === 'basis') norm = val.toLowerCase();
			else norm = val.toUpperCase();
			const ci = catIndex.get(norm);
			if (ci !== undefined) {
				matrix[itemIdx][ci]++;
				observedCats.add(norm);
			} else {
				// Unknown category — e.g. rater wrote "B+" or "doc" — treat as missing but warn
				console.warn(`  warning: unknown ${field} value "${val}" for ${sid} in ${rater.file} — treated as missing`);
			}
		}
	}

	// For Fleiss, items with <2 raters contributing are still included in N but contribute 0 to P_i? Actually P_i is undefined if n_i <2.
	// We will filter to items where at least 2 raters provided a grade for this field when computingkappa — that's the standard (pairable items)
	return { items, cats, matrix, observedCats };
}

// ---------------------------------------------------------------------------
// Fleiss' κ (Fleiss 1971) — for m raters, N items, k categories
// ---------------------------------------------------------------------------

function fleissKappa(matrix: number[][], cats: string[]): {
	n: number; // number of items with ≥2 ratings
	m: number; // raters per item (assumed constant for complete items; we use per-item m_i)
	P_bar: number;
	P_e: number;
	kappa: number;
	p_j: Record<string, number>;
	totalRatings: number;
} {
	const N = matrix.length;
	const k = cats.length;

	// For each item, m_i = sum_j n_ij (number of raters who graded this item)
	const m_i = matrix.map((row) => row.reduce((a, b) => a + b, 0));

	// Filter to items with at least 2 ratings (otherwise P_i undefined)
	const validIdx = m_i.map((m, i) => (m >= 2 ? i : -1)).filter((i) => i !== -1);
	const nValid = validIdx.length;

	if (nValid === 0) {
		return { n: 0, m: raterData.length, P_bar: NaN, P_e: NaN, kappa: NaN, p_j: {}, totalRatings: 0 };
	}

	// P_i for each valid item: (1/(m_i*(m_i-1))) * sum_j n_ij*(n_ij-1)
	const P_i: number[] = validIdx.map((idx) => {
		const row = matrix[idx];
		const m = m_i[idx];
		const sum = row.reduce((acc, n_ij) => acc + n_ij * (n_ij - 1), 0);
		return sum / (m * (m - 1));
	});

	const P_bar = P_i.reduce((a, b) => a + b, 0) / nValid;

	// p_j = (1/(N_valid * m_avg? Actually sum over valid items of n_ij) / total ratings
	// But standard Fleiss with varying m_i: p_j = (sum_i n_ij) / (sum_i m_i)
	const totalRatings = validIdx.reduce((acc, idx) => acc + m_i[idx], 0);
	const p_j: Record<string, number> = {};
	for (let j = 0; j < k; j++) {
		const sum_j = validIdx.reduce((acc, idx) => acc + matrix[idx][j], 0);
		p_j[cats[j]] = totalRatings > 0 ? sum_j / totalRatings : 0;
	}

	const P_e = cats.reduce((acc, c) => acc + (p_j[c] ?? 0) ** 2, 0);

	const kappa = P_e === 1 ? 1 : (P_bar - P_e) / (1 - P_e);

	// m for reporting is average raters per valid item
	const mAvg = totalRatings / nValid;

	return { n: nValid, m: Math.round(mAvg * 10) / 10, P_bar, P_e, kappa, p_j, totalRatings };
}

// ---------------------------------------------------------------------------
// Krippendorff's α (nominal) — observed vs expected disagreement
// ---------------------------------------------------------------------------

function krippendorffAlpha(matrix: number[][], cats: string[]): {
	alpha: number;
	Do: number;
	De: number;
	nPairs: number;
	nTotal: number;
} {
	const k = cats.length;
	const N = matrix.length;

	// Total pairable values: sum_i m_i (for expected) and sum_i C(m_i,2) for observed pairs
	let nTotal = 0;
	let nPairs = 0;
	const n_c = cats.map(() => 0); // total count per category across all valid items

	for (let i = 0; i < N; i++) {
		const row = matrix[i];
		const m = row.reduce((a, b) => a + b, 0);
		if (m < 2) continue;
		nTotal += m;
		nPairs += (m * (m - 1)) / 2;
		for (let j = 0; j < k; j++) n_c[j] += row[j];
	}

	if (nPairs === 0 || nTotal < 2) {
		return { alpha: NaN, Do: NaN, De: NaN, nPairs: 0, nTotal: 0 };
	}

	// Observed disagreement Do: for each item, count disagreeing pairs / total pairs
	let disagreePairs = 0;
	for (let i = 0; i < N; i++) {
		const row = matrix[i];
		const m = row.reduce((a, b) => a + b, 0);
		if (m < 2) continue;
		// Agreeing pairs = sum_j C(n_ij,2)
		const agree = row.reduce((acc, n_ij) => acc + (n_ij * (n_ij - 1)) / 2, 0);
		const total = (m * (m - 1)) / 2;
		disagreePairs += total - agree;
	}
	const Do = disagreePairs / nPairs;

	// Expected disagreement De: for nominal, probability two randomly drawn values (without replacement) differ
	// De = 1 - sum_j (n_c[j]/nTotal) * ((n_c[j]-1)/(nTotal-1))  — without replacement correction
	// Equivalent to: De = (nTotal^2 - sum n_c^2) / (nTotal*(nTotal-1))  ??? Let's derive:
	// Expected agreement if drawing without replacement: sum_j n_c[j]*(n_c[j]-1) / (nTotal*(nTotal-1))
	// So De = 1 - that.
	let expectedAgree = 0;
	for (let j = 0; j < k; j++) {
		if (nTotal > 1) expectedAgree += (n_c[j] * (n_c[j] - 1)) / (nTotal * (nTotal - 1));
	}
	const De = 1 - expectedAgree;

	// Edge: if De is 0 (only one category used), alpha is undefined (1 if Do also 0, else NaN)
	let alpha: number;
	if (De === 0) {
		alpha = Do === 0 ? 1 : NaN;
	} else {
		alpha = 1 - Do / De;
	}

	return { alpha, Do, De, nPairs, nTotal };
}

// ---------------------------------------------------------------------------
// Bootstrap CI (percentile, 95%)
// ---------------------------------------------------------------------------

function bootstrapCI(
	matrix: number[][],
	cats: string[],
	statFn: (m: number[][]) => number,
	B: number,
	seed: string,
): [number, number] {
	if (B <= 0) return [NaN, NaN];
	// Seeded RNG for reproducibility
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	const xmur3_h = (() => {
		let hh = h;
		return () => {
			hh = Math.imul(hh ^ (hh >>> 16), 2246822507);
			hh = Math.imul(hh ^ (hh >>> 13), 3266489909);
			hh ^= hh >>> 16;
			return hh >>> 0;
		};
	})();
	const s = xmur3_h();
	let a = s;
	const rng = () => {
		let t = (a += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	const N = matrix.length;
	const stats: number[] = [];
	for (let b = 0; b < B; b++) {
		const sample: number[][] = [];
		for (let i = 0; i < N; i++) {
			const idx = Math.floor(rng() * N);
			sample.push(matrix[idx]);
		}
		const v = statFn(sample);
		if (Number.isFinite(v)) stats.push(v);
	}
	if (stats.length === 0) return [NaN, NaN];
	stats.sort((x, y) => x - y);
	const lo = stats[Math.floor(0.025 * stats.length)] ?? NaN;
	const hi = stats[Math.floor(0.975 * stats.length)] ?? NaN;
	return [lo, hi];
}

// ---------------------------------------------------------------------------
// Per-kind breakdown helper
// ---------------------------------------------------------------------------

function perKindBreakdown(field: Field, cats: string[]): Record<string, unknown> {
	if (kindById.size === 0) return {};
	const kinds = [...new Set(kindById.values())].sort();
	const out: Record<string, unknown> = {};
	for (const kind of kinds) {
		const idsForKind = [...kindById.entries()].filter(([, k]) => k === kind).map(([id]) => id);
		if (idsForKind.length < 2) continue;
		// Build sub-matrix for this kind
		const subItems = idsForKind.sort();
		// Map study_id → matrix row index
		const allItems = [...allIds].sort();
		const itemIndex = new Map(allItems.map((id, i) => [id, i]));
		const fieldData = buildMatrix(field);
		const subMatrix: number[][] = subItems.map((sid) => {
			const idx = itemIndex.get(sid);
			if (idx === undefined) return cats.map(() => 0);
			return fieldData.matrix[idx] ?? cats.map(() => 0);
		});
		const fk = fleissKappa(subMatrix, cats);
		const ak = krippendorffAlpha(subMatrix, cats);
		out[kind] = {
			n: fk.n,
			kappa: Number.isFinite(fk.kappa) ? Math.round(fk.kappa * 1000) / 1000 : null,
			alpha: Number.isFinite(ak.alpha) ? Math.round(ak.alpha * 1000) / 1000 : null,
			P_bar: Number.isFinite(fk.P_bar) ? Math.round(fk.P_bar * 1000) / 1000 : null,
			items: subItems.length,
		};
	}
	return out;
}

// ---------------------------------------------------------------------------
// Compute per field
// ---------------------------------------------------------------------------

const results: Record<string, unknown> = {
	meta: {
		generatedAt: new Date().toISOString(),
		raters: raterFiles.length,
		raterFiles: raterFiles.map((f) => f.replace(ROOT + '/', '')),
		totalStudyIds: allIds.size,
		bootstrap: BOOTSTRAP_N,
		targets: { basis_kappa: TARGET_KAPPA_BASIS, confidence_kappa: TARGET_KAPPA_CONF },
		note: 'Targets are pre-specified conventions, not laws of nature. Round 2 deltas are reported whether targets are met or not (protocol §8.1).',
	},
};

for (const field of ['confidence', 'basis'] as Field[]) {
	const { matrix, cats } = buildMatrix(field);
	const fk = fleissKappa(matrix, cats);
	const ak = krippendorffAlpha(matrix, cats);

	const kappaCI = bootstrapCI(matrix, cats, (m) => fleissKappa(m, cats).kappa, BOOTSTRAP_N, `kappa-${field}`);
	const alphaCI = bootstrapCI(matrix, cats, (m) => krippendorffAlpha(m, cats).alpha, BOOTSTRAP_N, `alpha-${field}`);

	const perKind = perKindBreakdown(field, cats);

	// Missing/unsure counts
	const totalPossible = allIds.size * raterFiles.length;
	const totalObserved = fk.totalRatings;
	const missing = totalPossible - totalObserved;

	(results as Record<string, unknown>)[field] = {
		n: fk.n,
		totalStudyIds: allIds.size,
		categories: cats,
		p_j: Object.fromEntries(cats.map((c) => [c, fk.p_j[c] !== undefined ? Math.round(fk.p_j[c] * 1000) / 1000 : 0])),
		observedCats: [...new Set(matrix.flatMap((row, i) => row.map((n, j) => (n > 0 ? cats[j] : null)).filter(Boolean)))].sort(),
		fleiss: {
			kappa: Number.isFinite(fk.kappa) ? Math.round(fk.kappa * 1000) / 1000 : null,
			ci95: [Number.isFinite(kappaCI[0]) ? Math.round(kappaCI[0] * 1000) / 1000 : null, Number.isFinite(kappaCI[1]) ? Math.round(kappaCI[1] * 1000) / 1000 : null],
			P_bar: Number.isFinite(fk.P_bar) ? Math.round(fk.P_bar * 1000) / 1000 : null,
			P_e: Number.isFinite(fk.P_e) ? Math.round(fk.P_e * 1000) / 1000 : null,
			m_avg: fk.m,
		},
		krippendorff: {
			alpha: Number.isFinite(ak.alpha) ? Math.round(ak.alpha * 1000) / 1000 : null,
			ci95: [Number.isFinite(alphaCI[0]) ? Math.round(alphaCI[0] * 1000) / 1000 : null, Number.isFinite(alphaCI[1]) ? Math.round(alphaCI[1] * 1000) / 1000 : null],
			Do: Number.isFinite(ak.Do) ? Math.round(ak.Do * 1000) / 1000 : null,
			De: Number.isFinite(ak.De) ? Math.round(ak.De * 1000) / 1000 : null,
			nPairs: ak.nPairs,
		},
		missing: {
			totalPossible,
			totalObserved,
			missing,
			missingPct: totalPossible > 0 ? Math.round((missing / totalPossible) * 1000) / 10 : 0,
		},
		perKind,
	};

	// Terminal report
	const fkK = Number.isFinite(fk.kappa) ? fk.kappa.toFixed(3) : 'NaN';
	const akA = Number.isFinite(ak.alpha) ? ak.alpha.toFixed(3) : 'NaN';
	const ciK = `[${kappaCI[0]?.toFixed(3) ?? 'NaN'}, ${kappaCI[1]?.toFixed(3) ?? 'NaN'}]`;
	const ciA = `[${alphaCI[0]?.toFixed(3) ?? 'NaN'}, ${alphaCI[1]?.toFixed(3) ?? 'NaN'}]`;
	console.log(`\n${field.toUpperCase()}:`);
	console.log(`  Fleiss κ = ${fkK} 95%CI ${ciK}  (P_bar=${fk.P_bar?.toFixed(3) ?? 'NaN'} P_e=${fk.P_e?.toFixed(3) ?? 'NaN'} n=${fk.n} m_avg=${fk.m})`);
	console.log(`  Kripp α  = ${akA} 95%CI ${ciA}  (Do=${ak.Do?.toFixed(3) ?? 'NaN'} De=${ak.De?.toFixed(3) ?? 'NaN'} pairs=${ak.nPairs})`);
	console.log(`  p_j: ${cats.map((c) => `${c}=${(fk.p_j[c] ?? 0).toFixed(3)}`).join('  ')}`);
	if (missing > 0) console.log(`  missing/unsure: ${missing}/${totalPossible} (${((missing / totalPossible) * 100).toFixed(1)}%)`);
	if (Object.keys(perKind).length > 0) {
		console.log(`  per-kind κ:`);
		for (const [k, v] of Object.entries(perKind)) {
			const vv = v as { kappa: number | null; alpha: number | null; n: number };
			console.log(`    ${k}: κ=${vv.kappa ?? '—'} α=${vv.alpha ?? '—'} (n=${vv.n})`);
		}
	}
	const target = field === 'basis' ? TARGET_KAPPA_BASIS : TARGET_KAPPA_CONF;
	if (Number.isFinite(fk.kappa)) {
		if (fk.kappa >= target) console.log(`  target κ≥${target}: PASS`);
		else console.log(`  target κ≥${target}: below (finding, not failure — round 2 may revise)`);
	}
}

// ---------------------------------------------------------------------------
// Write reports
// ---------------------------------------------------------------------------

if (OUT) {
	const outPath = OUT.startsWith('/') ? OUT : join(ROOT, OUT);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
	console.log(`\nWrote JSON report: ${outPath}`);

	// Markdown report
	const mdOut = outPath.replace(/\.json$/i, '.md');
	const conf = results.confidence as Record<string, unknown>;
	const basis = results.basis as Record<string, unknown>;
	const fleissConf = (conf?.fleiss as Record<string, unknown>) ?? {};
	const fleissBasis = (basis?.fleiss as Record<string, unknown>) ?? {};
	const krippConf = (conf?.krippendorff as Record<string, unknown>) ?? {};
	const krippBasis = (basis?.krippendorff as Record<string, unknown>) ?? {};

	const md = `# Kappa / Alpha report

Generated ${new Date().toISOString()} — ${raterFiles.length} raters, ${allIds.size} study_ids, ${BOOTSTRAP_N} bootstrap resamples.

Targets (pre-specified, not acceptance standards): basis κ ≥ ${TARGET_KAPPA_BASIS}, confidence κ ≥ ${TARGET_KAPPA_CONF}.

| Field | Fleiss κ | 95% CI | Kripp α | 95% CI | P\_bar | P\_e | n | missing |
|---|---|---|---|---|---|---|---|---|
| confidence | ${String(fleissConf.kappa ?? '—')} | [${Array.isArray(fleissConf.ci95) ? (fleissConf.ci95 as unknown[]).join(', ') : '—'}] | ${String(krippConf.alpha ?? '—')} | [${Array.isArray(krippConf.ci95) ? (krippConf.ci95 as unknown[]).join(', ') : '—'}] | ${String(fleissConf.P_bar ?? '—')} | ${String(fleissConf.P_e ?? '—')} | ${String((conf as Record<string, unknown>).n ?? '—')} | ${String(((conf as Record<string, unknown>).missing as Record<string, unknown>)?.missingPct ?? '—')}% |
| basis | ${String(fleissBasis.kappa ?? '—')} | [${Array.isArray(fleissBasis.ci95) ? (fleissBasis.ci95 as unknown[]).join(', ') : '—'}] | ${String(krippBasis.alpha ?? '—')} | [${Array.isArray(krippBasis.ci95) ? (krippBasis.ci95 as unknown[]).join(', ') : '—'}] | ${String(fleissBasis.P_bar ?? '—')} | ${String(fleissBasis.P_e ?? '—')} | ${String((basis as Record<string, unknown>).n ?? '—')} | ${String(((basis as Record<string, unknown>).missing as Record<string, unknown>)?.missingPct ?? '—')}% |

## Category marginals (p\_j)

- confidence: ${JSON.stringify((conf as Record<string, unknown>).p_j ?? {})}
- basis: ${JSON.stringify((basis as Record<string, unknown>).p_j ?? {})}

## Per-kind breakdown

${(() => {
		const ck = (conf as Record<string, unknown>).perKind as Record<string, unknown> | undefined;
		const bk = (basis as Record<string, unknown>).perKind as Record<string, unknown> | undefined;
		const kinds = new Set([...Object.keys(ck ?? {}), ...Object.keys(bk ?? {})]);
		if (kinds.size === 0) return '_No kind mapping — pass --sample to enable._';
		let t = '| kind | confidence κ | basis κ | n |\n|---|---|---|---|\n';
		for (const k of [...kinds].sort()) {
			const cv = (ck?.[k] as { kappa?: number | null }) ?? {};
			const bv = (bk?.[k] as { kappa?: number | null }) ?? {};
			const n = (cv as { n?: number })?.n ?? (bv as { n?: number })?.n ?? '—';
			t += `| ${k} | ${String(cv.kappa ?? '—')} | ${String(bv.kappa ?? '—')} | ${String(n)} |\n`;
		}
		return t;
	})()}

## Interpretation

${(() => {
		const ck = Number((fleissConf as Record<string, unknown>).kappa);
		const bk = Number((fleissBasis as Record<string, unknown>).kappa);
		let s = '';
		if (Number.isFinite(bk)) {
			if (bk >= TARGET_KAPPA_BASIS) s += `- Basis κ ${bk.toFixed(3)} meets the pre-specified target (≥${TARGET_KAPPA_BASIS}).\n`;
			else s += `- Basis κ ${bk.toFixed(3)} is below the pre-specified target (≥${TARGET_KAPPA_BASIS}) — a finding about the rubric's ceiling, not a failure. Round 2 may revise where taxonomy finds rubric ambiguity.\n`;
		}
		if (Number.isFinite(ck)) {
			if (ck >= TARGET_KAPPA_CONF) s += `- Confidence κ ${ck.toFixed(3)} meets the pre-specified target (≥${TARGET_KAPPA_CONF}).\n`;
			else s += `- Confidence κ ${ck.toFixed(3)} is below the pre-specified target (≥${TARGET_KAPPA_CONF}) — see above.\n`;
		}
		s += `- Krippendorff α reported alongside κ as a complementary measure robust to uneven category use (D rare, A/B dominant).\n`;
		return s || '_No finite kappas to interpret._';
	})()}

---
*Generated by scripts/study-kappa.ts — Fleiss 1971, Krippendorff 2018 (nominal distance).*
`;

	writeFileSync(mdOut, md, 'utf8');
	console.log(`Wrote Markdown report: ${mdOut}`);
} else {
	console.log(`\nNo --out given — JSON not written (pass --out to save)`);
}

// Exit code: always 0 (kappa is a measurement, not a gate) — but warn if kappa is NaN
const allKappas = ['confidence', 'basis'].map((f) => (results[f] as { fleiss?: { kappa?: number | null } })?.fleiss?.kappa).filter((v) => typeof v === 'number');
if (allKappas.length === 0) {
	console.warn('\nWarning: no finite kappas — check rater files have valid categories');
}
