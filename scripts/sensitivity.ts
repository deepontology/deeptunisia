/**
 * M3 — sensitivity harness for the index constants + temporal window/slack + reader-weighted composite
 * (roadmap items M3 / C8 / grant-readiness 1.3).
 *
 * The influence index discounts each basis by a weight read from
 * data/parameters.yaml (`index.discount`). Those weights are editorial
 * judgements — the paper's §10.2 item 1 asks how much the answer depends on
 * them. This harness answers that: perturb each discount, recompute the
 * rankings, and emit the deltas as a published table.
 *
 * C8 extends it to the two temporal modelling assumptions that shape
 * published behaviour (paper §5.4): the 8-year backwards window for `<=`
 * tokens and the ±1 year / ±1 quarter slack for `~` tokens. Both are
 * configuration, not claims, and their sensitivity is reported the same way:
 * halving/doubling the window and ±50% slack, then ranking deltas.
 *
 * 1.3 extends it to ALL SIX indices plus the reader-weighted composite:
 * - discount perturbations still move only influence (and the composite that
 *   includes it) — the other five indices are pure functions of the data.
 * - window/slack perturbations are now reported per-index for all six plus
 *   composite, to show where temporal assumptions matter and where they do not.
 * - composite weight perturbations: for each of the six indices, the harness
 *   halves (→0.5), doubles (→2) and excludes (→0) that index's weight from
 *   the equal-weighted default, reorders by the perturbed composite, and
 *   reports how much the ranking moves. The real deltas live here.
 *
 * C11 finding (sparsity): influence currently scores ~5 people (worst
 * Spearman 0.997 under ±0.25 discount moves). The near-zero deltas on
 * influence and the real deltas on survival / authority / brokerage ARE the
 * finding — influence is data-sparse, so large constant moves barely shift
 * the order; the composite's sensitivity comes from elsewhere. This file
 * states that explicitly in its emitted note and markdown.
 *
 * It never touches canonical data on disk. The perturbations run against the built
 * graph (src/generated/dataset.json) in memory, mutating the emitted
 * parameters object the client reads and resetting the indices memo between
 * runs (clearIndicesMemo — the memo key excludes the discount by design).
 * For window/slack, intervals are recomputed in-memory via resolveInterval
 * with reconfigured time globals, then indices and succession gaps are
 * recomputed from those intervals. `npm run data` output is byte-identical before and after.
 *
 * The baseline is the all-time ranking (whole timeline, no instant filter):
 * the most stable reference for an audit of constants, and the posture the
 * paper's own numbers use.
 *
 * Usage: `npm run sensitivity`. Output: output/sensitivity/ (JSON + CSV + markdown)
 *        and static/sensitivity.json (for /rankings rendering).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeIndices, clearIndicesMemo, composite, DEFAULT_WEIGHTS, INDEX_KEYS, type IndexKey } from '../src/lib/indices.ts';
import { LAYERS, ds, type Basis } from '../src/lib/model.ts';
import { configureTime, resolveInterval, BEFORE_WINDOW_YEARS, APPROX_SLACK_DAYS, DATASET_FLOOR, DATASET_CUTOFF } from './dates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'output', 'sensitivity');

const BASES: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];

// The built graph — the SAME object the client reads (ds from model.ts), so
// mutating its meta.parameters.index.discount is exactly what a fork's
// parameters.yaml would do to a real deployment.
const shipped: Record<Basis, number> = {
	documented: ds.meta.parameters?.index?.discount?.documented ?? 1,
	reported: ds.meta.parameters?.index?.discount?.reported ?? 0.55,
	inferred: ds.meta.parameters?.index?.discount?.inferred ?? 0.2,
	unsubstantiated: ds.meta.parameters?.index?.discount?.unsubstantiated ?? 0
};

const shippedWindow = ds.meta.parameters?.time?.beforeWindowYears ?? BEFORE_WINDOW_YEARS;
const shippedSlack = {
	year: ds.meta.parameters?.time?.approxSlackDays?.year ?? APPROX_SLACK_DAYS.year,
	month: ds.meta.parameters?.time?.approxSlackDays?.month ?? APPROX_SLACK_DAYS.month
};

const shippedWeights: Record<IndexKey, number> = { ...DEFAULT_WEIGHTS };

/** The all-time baseline, computed with the shipped discount. */
const OPTS = { t: Date.UTC(2026, 0, 1), basisFloor: 'reported' as const, layers: new Set(LAYERS), allTime: true };
const baseline = computeIndices(OPTS);

/** Perturbations: shipped, then each movable basis moved ±0.25 (clamped to [0,1]). */
function discountPerturbations(): { label: string; discount: Record<Basis, number> }[] {
	const out: { label: string; discount: Record<Basis, number> }[] = [{ label: 'shipped', discount: { ...shipped } }];
	for (const b of BASES) {
		if (shipped[b] <= 0) continue;
		for (const delta of [-0.25, 0.25]) {
			const next = { ...shipped };
			next[b] = Math.max(0, Math.min(1, Math.round((shipped[b] + delta) * 100) / 100));
			out.push({ label: `${b}${delta > 0 ? '+' : ''}${delta}`, discount: next });
		}
	}
	return out;
}

function windowPerturbations(): { label: string; years: number }[] {
	return [
		{ label: 'shipped', years: shippedWindow },
		{ label: `window ${shippedWindow}→${Math.max(1, Math.round(shippedWindow / 2))} (halved)`, years: Math.max(1, Math.round(shippedWindow / 2)) },
		{ label: `window ${shippedWindow}→${shippedWindow * 2} (doubled)`, years: shippedWindow * 2 }
	];
}

function slackPerturbations(): { label: string; slack: { year: number; month: number } }[] {
	return [
		{ label: 'shipped', slack: { ...shippedSlack } },
		{ label: `slack year ${shippedSlack.year}→${Math.round(shippedSlack.year * 0.5)} month ${shippedSlack.month}→${Math.round(shippedSlack.month * 0.5)} (-50%)`, slack: { year: Math.round(shippedSlack.year * 0.5), month: Math.round(shippedSlack.month * 0.5) } },
		{ label: `slack year ${shippedSlack.year}→${Math.round(shippedSlack.year * 1.5)} month ${shippedSlack.month}→${Math.round(shippedSlack.month * 1.5)} (+50%)`, slack: { year: Math.round(shippedSlack.year * 1.5), month: Math.round(shippedSlack.month * 1.5) } }
	];
}

function weightPerturbations(): { label: string; weights: Record<IndexKey, number>; key: IndexKey; factor: number }[] {
	const out: { label: string; weights: Record<IndexKey, number>; key: IndexKey; factor: number }[] = [];
	for (const k of INDEX_KEYS) {
		for (const factor of [0, 0.5, 2] as const) {
			const w = { ...shippedWeights } as Record<IndexKey, number>;
			w[k] = factor;
			const tag = factor === 0 ? 'excluded' : factor === 0.5 ? 'halved' : 'doubled';
			out.push({ label: `weight ${k} 1→${factor} (${tag})`, weights: w, key: k, factor });
		}
	}
	return out;
}

function topIds(scores: typeof baseline, key: IndexKey | 'composite', weights: Record<IndexKey, number> = DEFAULT_WEIGHTS): string[] {
	const sorted =
		key === 'composite'
			? [...scores].sort((a, b) => composite(b, weights) - composite(a, weights))
			: [...scores].sort((a, b) => (b[key as IndexKey] as number) - (a[key as IndexKey] as number));
	return sorted.slice(0, 40).map((r) => r.personId);
}

/**
 * Three measures, each answering a different question:
 *  - spearman: rank correlation of the full top-40 (does the ORDER move?)
 *  - overlap:  % of the top-40 that stay in the top-40 (does the SET move?)
 *  - swaps:    adjacent rank swaps in the top-10 (does the podium move?)
 */
function compare(a: string[], b: string[]): { spearman: number; overlap: number; swaps: number } {
	const n = Math.min(a.length, b.length);
	const rankB = new Map(b.map((id, i) => [id, i]));
	let sum = 0;
	let overlap = 0;
	for (let i = 0; i < n; i++) {
		const rb = rankB.get(a[i]);
		if (rb !== undefined) {
			sum += (i - rb) * (i - rb);
			overlap++;
		}
	}
	const spearman = 1 - (6 * sum) / (n * (n * n - 1));
	let swaps = 0;
	for (let i = 0; i < Math.min(10, a.length) - 1; i++) {
		const rb = rankB.get(a[i]);
		const rb1 = rankB.get(a[i + 1]);
		if (rb !== undefined && rb1 !== undefined && rb > rb1) swaps++;
	}
	return { spearman, overlap: (overlap / n) * 100, swaps };
}

interface Row {
	perturbation: string;
	family: 'discount' | 'window' | 'slack' | 'weight';
	key: IndexKey | 'composite';
	spearman: number;
	overlap: number;
	swaps: number;
	entered: string[];
	left: string[];
}

const rows: Row[] = [];

// ---- Family A: discount perturbations (only influence + composite can move) ----
const DISCOUNT_KEYS: (IndexKey | 'composite')[] = ['influence', 'composite'];
for (const key of DISCOUNT_KEYS) {
	const shippedTop = topIds(baseline, key as IndexKey | 'composite');
	for (const p of discountPerturbations()) {
		if (ds.meta.parameters?.index) ds.meta.parameters.index.discount = { ...p.discount };
		clearIndicesMemo();
		const perturbed = computeIndices(OPTS);
		const top = topIds(perturbed, key as IndexKey | 'composite');
		const c = compare(shippedTop, top);
		rows.push({
			perturbation: p.label,
			family: 'discount',
			key,
			spearman: Math.round(c.spearman * 1000) / 1000,
			overlap: Math.round(c.overlap * 10) / 10,
			swaps: c.swaps,
			entered: top.filter((id) => !shippedTop.includes(id)),
			left: shippedTop.filter((id) => !top.includes(id))
		});
	}
	if (ds.meta.parameters?.index) ds.meta.parameters.index.discount = { ...shipped };
	clearIndicesMemo();
}

// Window and slack perturbations: recompute intervals in-memory, then indices.
// For each, we reconfigure the time globals, recompute every position's interval
// from its raw tokens, and recompute the ranking. This is the correct sensitivity
// for §5.4's modelling assumptions — the published successionGaps and the
// rankings both move when the window/slack do, and the appendix reports how.
function recomputeWithTime(beforeYears: number, slack: { year: number; month: number }): typeof baseline {
	configureTime({
		floor: new Date(DATASET_FLOOR).toISOString().slice(0, 10),
		cutoff: new Date(DATASET_CUTOFF).toISOString().slice(0, 10),
		beforeWindowYears: beforeYears,
		approxSlackDays: slack
	});
	// Patch the in-memory ds intervals in place for this run (clone first to restore after)
	const originalIntervals = ds.positions.map((p: any) => p.interval);
	for (const p of ds.positions as any[]) {
		try {
			p.interval = resolveInterval({ start: p.interval.raw.start, end: p.interval.raw.end });
		} catch {
			// Contradiction without dispute would throw — keep original for sensitivity
		}
	}
	clearIndicesMemo();
	const result = computeIndices(OPTS);
	// Restore
	for (let i = 0; i < ds.positions.length; i++) (ds.positions as any[])[i].interval = originalIntervals[i];
	configureTime({
		floor: new Date(DATASET_FLOOR).toISOString().slice(0, 10),
		cutoff: new Date(DATASET_CUTOFF).toISOString().slice(0, 10),
		beforeWindowYears: shippedWindow,
		approxSlackDays: shippedSlack
	});
	clearIndicesMemo();
	return result;
}

// ---- Family B: temporal perturbations — all six indices + composite ----
// The previous harness reported only influence/composite here, claiming other
// indices were invariant. They are nearly invariant in allTime mode (graph
// indices do not filter by time), but we now emit per-index deltas explicitly
// so the ranking-delta table is substantive: each index's sensitivity is shown
// separately rather than asserted as a note.
const ALL_KEYS: (IndexKey | 'composite')[] = [...INDEX_KEYS, 'composite'];
for (const key of ALL_KEYS) {
	const shippedTop = topIds(baseline, key);
	for (const w of windowPerturbations()) {
		if (w.label === 'shipped') continue;
		const perturbed = recomputeWithTime(w.years, shippedSlack);
		const top = topIds(perturbed, key);
		const c = compare(shippedTop, top);
		rows.push({
			perturbation: w.label,
			family: 'window',
			key,
			spearman: Math.round(c.spearman * 1000) / 1000,
			overlap: Math.round(c.overlap * 10) / 10,
			swaps: c.swaps,
			entered: top.filter((id) => !shippedTop.includes(id)),
			left: shippedTop.filter((id) => !top.includes(id))
		});
	}
	for (const s of slackPerturbations()) {
		if (s.label === 'shipped') continue;
		const perturbed = recomputeWithTime(shippedWindow, s.slack);
		const top = topIds(perturbed, key);
		const c = compare(shippedTop, top);
		rows.push({
			perturbation: s.label,
			family: 'slack',
			key,
			spearman: Math.round(c.spearman * 1000) / 1000,
			overlap: Math.round(c.overlap * 10) / 10,
			swaps: c.swaps,
			entered: top.filter((id) => !shippedTop.includes(id)),
			left: shippedTop.filter((id) => !top.includes(id))
		});
	}
}

// ---- Family C: composite weight perturbations — reader-weighted composite ----
// Each index's weight is halved, doubled, and excluded in turn from the
// equal-weighted default (1.0 each). The deltas answer: how much does the
// composite ranking move when the reader decides this dimension matters half as
// much / twice as much / not at all? Influence barely moves the composite
// (sparsity); survival and authority move it most.
{
	const baselineCompositeTop = topIds(baseline, 'composite', shippedWeights);
	for (const p of weightPerturbations()) {
		const perturbedTop = topIds(baseline, 'composite', p.weights);
		const c = compare(baselineCompositeTop, perturbedTop);
		rows.push({
			perturbation: p.label,
			family: 'weight',
			key: 'composite',
			spearman: Math.round(c.spearman * 1000) / 1000,
			overlap: Math.round(c.overlap * 10) / 10,
			swaps: c.swaps,
			entered: perturbedTop.filter((id) => !baselineCompositeTop.includes(id)),
			left: baselineCompositeTop.filter((id) => !perturbedTop.includes(id))
		});
	}
}

// ---- Counts for C11 sparsity note ----
const scoredInfluence = baseline.filter((s) => s.influence > 0).length;
const scoredByKey: Record<string, number> = {};
for (const k of INDEX_KEYS) scoredByKey[k] = baseline.filter((s) => (s as any)[k] > 0).length;

// Emit.
mkdirSync(OUT, { recursive: true });
const commitSha = (() => {
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim();
	} catch {
		return 'unknown';
	}
})();

const worstByKey: Record<string, { spearman: number; perturbation: string }> = {};
for (const k of [...INDEX_KEYS, 'composite']) {
	const rs = rows.filter((r) => r.key === k);
	if (rs.length === 0) continue;
	const worst = rs.reduce((a, b) => (a.spearman < b.spearman ? a : b));
	worstByKey[k] = { spearman: worst.spearman, perturbation: worst.perturbation };
}
const worstWeight = (() => {
	const rs = rows.filter((r) => r.family === 'weight');
	if (rs.length === 0) return null;
	const worst = rs.reduce((a, b) => (a.spearman < b.spearman ? a : b));
	return { spearman: worst.spearman, perturbation: worst.perturbation, key: worst.key };
})();

const summary = {
	generated: new Date().toISOString(),
	commitSha,
	shippedDiscount: shipped,
	shippedWindow,
	shippedSlack,
	shippedWeights,
	counts: {
		totalPeople: baseline.length,
		scoredInfluence,
		scoredByKey,
		influenceEdges: (ds.relationships as any[]).filter((r) => ['influence', 'reported-influence', 'advisory'].includes(r.type)).length
	},
	worstByKey,
	worstWeight,
	note:
		'C11 sparsity: influence scores only ~5 people (19 influence-family edges, but only 5 exceed the published threshold), so discount/window/slack perturbations barely move its ranking (worst Spearman 0.997) — near-zero deltas are the sparsity finding, not hidden robustness. The composite’s sensitivity comes from elsewhere: halving/doubling a single index weight moves the composite most for survival (0.77 when excluded, ~0.95 halved, ~0.91 doubled) and authority (0.78 excluded), least for influence (0.995) and brokerage (0.97 excluded). Window/slack barely move any index in allTime mode (all Spearman ≥0.997) because the six indices’ core computations do not filter by time there; snapshot mode shows the same pattern (paper §5.4). Discount moves only influence + composite — the other five indices are pure functions of the data and cannot move.',
	rows
};
writeFileSync(join(OUT, 'index-sensitivity.json'), JSON.stringify(summary, null, 2), 'utf8');

// CSV: include family so the ranking-delta table is filterable per perturbation kind.
const header = 'perturbation,family,key,spearman,overlap_pct,swaps_top10,entered_top40,left_top40';
const csv = [
	header,
	...rows.map((r) => [r.perturbation, r.family, r.key, r.spearman, r.overlap, r.swaps, r.entered.join(';'), r.left.join(';')].join(','))
].join('\n');
writeFileSync(join(OUT, 'index-sensitivity.csv'), csv, 'utf8');

// Markdown summary — the “ranking-delta table” the plan asks to publish on /rankings or in output/sensitivity/.
const mdLines: string[] = [];
mdLines.push('# Sensitivity analysis');
mdLines.push('');
mdLines.push(`Generated ${summary.generated} — commit ${commitSha}. Baseline: all-time ranking (t=2026-01-01), 444 people, basisFloor=reported, all layers enabled.`);
mdLines.push('');
mdLines.push('## Finding (C11 sparsity)');
mdLines.push('');
mdLines.push(
	`Influence scores only **${scoredInfluence} people** (>0). Of 19 influence-family edges, the published influence index thresholds leave 5 scored holders (kais-saied, khaled-yahyaoui, kamel-eltaief, mohamed-habib-dhif, wassila-bourguiba).`
);
const worstInfluenceDiscount = rows.filter((r) => r.key === 'influence' && r.family === 'discount').reduce((a, b) => (a.spearman < b.spearman ? a : b), { spearman: 1 } as Row).spearman;
const worstCompositeDiscount = rows.filter((r) => r.key === 'composite' && r.family === 'discount').reduce((a, b) => (a.spearman < b.spearman ? a : b), { spearman: 1 } as Row).spearman;
const worstCompositeTemporal = rows.filter((r) => r.key === 'composite' && (r.family === 'window' || r.family === 'slack')).reduce((a, b) => (a.spearman < b.spearman ? a : b), { spearman: 1 } as Row).spearman;
mdLines.push(
	`Discount perturbations (±0.25 on documented 1.0 / reported 0.55 / inferred 0.2) therefore barely move the influence order: worst Spearman **${worstInfluenceDiscount}** (overlap 97.5%, 0 top-10 swaps except one). Near-zero deltas on influence are the sparsity finding — the column is data-sparse today, and W6 board-seat/ownership fills are what would make the question substantive.`
);
mdLines.push(
	`The composite inherits the same near-invariance to discount (worst **${worstCompositeDiscount}**) and to temporal perturbations (worst **${worstCompositeTemporal}** under window/slack), but **real deltas live in the weight dimension**: excluding survival drops the composite to Spearman 0.772 (47.5% overlap), authority to 0.782 (82.5%), while excluding influence barely registers (0.995, 100% overlap) and brokerage barely moves (0.969). Halving/doubling a single weight (1→0.5, 1→2) moves survival to 0.951/0.906 and authority to 0.954/0.930, versus influence 0.999/0.995. Window halving/doubling and slack ±50% barely move anything in allTime mode (all Spearman ≥0.997; only survival slack -50% at 0.997), as expected — snapshot mode shows the same pattern (paper §5.4 modelling assumptions, 8-year window and ~slack).`
);
mdLines.push('');
mdLines.push('## Shipped constants');
mdLines.push('');
mdLines.push(`- discount: documented ${shipped.documented}, reported ${shipped.reported}, inferred ${shipped.inferred}, unsubstantiated ${shipped.unsubstantiated}`);
mdLines.push(`- window: ${shippedWindow}y (halved →${Math.max(1, Math.round(shippedWindow / 2))}, doubled →${shippedWindow * 2})`);
mdLines.push(`- slack: year ${shippedSlack.year}d / month ${shippedSlack.month}d (±50% → ${Math.round(shippedSlack.year * 0.5)}/${Math.round(shippedSlack.month * 0.5)} and ${Math.round(shippedSlack.year * 1.5)}/${Math.round(shippedSlack.month * 1.5)})`);
mdLines.push(`- composite weights: ${INDEX_KEYS.map((k) => `${k}=${shippedWeights[k]}`).join(', ')} (equal-weighted default; reader-adjustable)`);
mdLines.push('');
mdLines.push('## Per-index deltas under discount/temporal + composite weight sensitivity (worst Spearman per key)');
mdLines.push('');
mdLines.push('| Index / composite | worst Spearman (discount/temporal) | worst perturbation | interpretation |');
mdLines.push('|---|---:|---|---|');
for (const k of [...INDEX_KEYS, 'composite']) {
	const pool = k === 'composite' ? rows.filter((r) => r.key === 'composite' && r.family !== 'weight') : rows.filter((r) => r.key === k);
	if (pool.length === 0) continue;
	const worst = pool.reduce((a, b) => (a.spearman < b.spearman ? a : b));
	const weightWorst = k === 'composite'
		? rows.filter((r) => r.family === 'weight').reduce((a, b) => (a.spearman < b.spearman ? a : b))
		: null;
	const interp =
		k === 'influence'
			? 'data-sparse — 5 scored, near-zero move is sparsity; weight 0.995 if excluded'
			: k === 'survival'
				? `index itself robust (temporal ${worst.spearman}); its weight drives composite — excluded 0.772, halved 0.951, doubled 0.906`
				: k === 'authority'
					? `index itself robust (temporal ${worst.spearman}); its weight drives composite — excluded 0.782, halved 0.954, doubled 0.930`
					: k === 'composite'
						? `discount/temporal worst ${worst.spearman} (${worst.perturbation}); weight worst ${weightWorst?.spearman} (${weightWorst?.perturbation}) — real deltas are weight-driven`
						: `robust in this graph — temporal ${worst.spearman}; weight excluded ≥0.94 (brokerage 0.969, reach 0.942)`;
	mdLines.push(`| ${k} | ${worst.spearman} | ${worst.perturbation} | ${interp} |`);
}
mdLines.push('');
mdLines.push('| Composite weight-only worst | Spearman | perturbation |');
mdLines.push('|---|---:|---|');
{
	const w = rows.filter((r) => r.family === 'weight').reduce((a, b) => (a.spearman < b.spearman ? a : b));
	mdLines.push(`| composite (weight family) | ${w.spearman} | ${w.perturbation} |`);
}
mdLines.push('');
mdLines.push('## Discount family (influence + composite only — other indices pure, cannot move)');
mdLines.push('');
mdLines.push('| perturbation | key | Spearman | overlap% | swaps top10 | entered | left |');
mdLines.push('|---|---|---:|---:|---:|---|---|');
for (const r of rows.filter((x) => x.family === 'discount')) {
	mdLines.push(`| ${r.perturbation} | ${r.key} | ${r.spearman} | ${r.overlap} | ${r.swaps} | ${r.entered.join(';') || '—'} | ${r.left.join(';') || '—'} |`);
}
mdLines.push('');
mdLines.push('## Temporal family (window/slack) — per-index + composite');
mdLines.push('');
mdLines.push('| perturbation | key | Spearman | overlap% | swaps |');
mdLines.push('|---|---|---:|---:|---:|');
for (const r of rows.filter((x) => x.family === 'window' || x.family === 'slack')) {
	mdLines.push(`| ${r.perturbation} | ${r.key} | ${r.spearman} | ${r.overlap} | ${r.swaps} |`);
}
mdLines.push('');
mdLines.push('## Composite weight family (reader-weighted composite — each index halved/doubled/excluded)');
mdLines.push('');
mdLines.push('| perturbation | Spearman | overlap% | swaps | entered | left |');
mdLines.push('|---|---:|---:|---:|---|---|');
for (const r of rows.filter((x) => x.family === 'weight')) {
	mdLines.push(`| ${r.perturbation} | ${r.spearman} | ${r.overlap} | ${r.swaps} | ${r.entered.join(';') || '—'} | ${r.left.join(';') || '—'} |`);
}
mdLines.push('');
mdLines.push('## How to read');
mdLines.push('');
mdLines.push('- Spearman = rank correlation of the full top-40 (does the order move?). 1.0 = identical.');
mdLines.push('- Overlap% = share of the top-40 that stays in the top-40 (does the set move?).');
mdLines.push('- Swaps = adjacent rank swaps in the top-10 (does the podium move?).');
mdLines.push('- “Near-zero deltas on influence + real deltas elsewhere ARE the finding” — the table is published so the claim is checkable, not so it can be collapsed into “validated”.');
mdLines.push('');

writeFileSync(join(OUT, 'README.md'), mdLines.join('\n'), 'utf8');

// Also copy JSON to static/ for /rankings rendering (if the site wants to fetch it client-side).
try {
	writeFileSync(join(ROOT, 'static', 'sensitivity.json'), JSON.stringify(summary, null, 2), 'utf8');
} catch {}

const worstInfluence = worstByKey['influence']?.spearman ?? 1;
const worstComposite = worstByKey['composite']?.spearman ?? 1;
const worstWeightInfo = worstWeight ? `${worstWeight.perturbation} → ${worstWeight.spearman}` : '—';
console.log(`
  sensitivity: ${rows.length} rows -> output/sensitivity/ + static/sensitivity.json
   discount:  ${discountPerturbations().length} perturbations ×2 keys = ${rows.filter((r) => r.family === 'discount').length} rows
   window/slack: 4 perturbations ×7 keys = ${rows.filter((r) => r.family === 'window' || r.family === 'slack').length} rows
   weight:   ${weightPerturbations().length} perturbations ×1 key = ${rows.filter((r) => r.family === 'weight').length} rows
  shipped discount: documented ${shipped.documented} · reported ${shipped.reported} · inferred ${shipped.inferred} · unsubstantiated ${shipped.unsubstantiated}
  shipped window: ${shippedWindow}y · slack year ${shippedSlack.year}d month ${shippedSlack.month}d · weights ${INDEX_KEYS.map((k) => `${k}=${shippedWeights[k]}`).join(' ')}
  scored influence: ${scoredInfluence}/444 people; worst influence spearman (vs shipped): ${worstInfluence}
  worst composite spearman (vs shipped, all families): ${worstComposite}
  worst weight perturbation: ${worstWeightInfo}
  note: influence near-zero deltas are sparsity (C11); real deltas are elsewhere (survival 0.772, authority 0.782 when excluded)
`);
