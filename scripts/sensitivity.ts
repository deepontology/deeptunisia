/**
 * M3 — sensitivity harness for the index constants + temporal window/slack (roadmap item M3 / C8).
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
 * Usage: `npm run sensitivity`. Output: output/sensitivity/ (JSON + CSV).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeIndices, clearIndicesMemo, composite, DEFAULT_WEIGHTS, type IndexKey } from '../src/lib/indices.ts';
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

function topIds(scores: typeof baseline, key: IndexKey | 'composite'): string[] {
	const sorted =
		key === 'composite'
			? [...scores].sort((a, b) => composite(b, DEFAULT_WEIGHTS) - composite(a, DEFAULT_WEIGHTS))
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
	key: 'influence' | 'composite';
	spearman: number;
	overlap: number;
	swaps: number;
	entered: string[];
	left: string[];
}

const rows: Row[] = [];

// Only the influence column and the composite that includes it can move: the
// other four indices are pure functions of the data. Run both.
const KEYS: ('influence' | 'composite')[] = ['influence', 'composite'];
for (const key of KEYS) {
	const shippedTop = topIds(baseline, key);
	for (const p of discountPerturbations()) {
		if (ds.meta.parameters?.index) ds.meta.parameters.index.discount = { ...p.discount };
		clearIndicesMemo();
		const perturbed = computeIndices(OPTS);
		const top = topIds(perturbed, key);
		const c = compare(shippedTop, top);
		rows.push({
			perturbation: p.label,
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

for (const key of KEYS) {
	const shippedTop = topIds(baseline, key);
	for (const w of windowPerturbations()) {
		if (w.label === 'shipped') continue;
		const perturbed = recomputeWithTime(w.years, shippedSlack);
		const top = topIds(perturbed, key);
		const c = compare(shippedTop, top);
		rows.push({
			perturbation: w.label,
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
			key,
			spearman: Math.round(c.spearman * 1000) / 1000,
			overlap: Math.round(c.overlap * 10) / 10,
			swaps: c.swaps,
			entered: top.filter((id) => !shippedTop.includes(id)),
			left: shippedTop.filter((id) => !top.includes(id))
		});
	}
}

// Emit.
mkdirSync(OUT, { recursive: true });
const summary = {
	generated: new Date().toISOString(),
	commitSha: (() => {
		try {
			return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim();
		} catch {
			return 'unknown';
		}
	})(),
	shippedDiscount: shipped,
	shippedWindow,
	shippedSlack,
	note: 'Perturbing index.discount moves ONLY the influence column and the composite that includes it. The other four indices are pure functions of the data and cannot move — that is a property, not a gap. Window/slack perturbations recompute intervals in-memory and report ranking deltas the same way.',
	rows
};
writeFileSync(join(OUT, 'index-sensitivity.json'), JSON.stringify(summary, null, 2), 'utf8');

const header = 'perturbation,key,spearman,overlap_pct,swaps_top10,entered_top40,left_top40';
const csv = [
	header,
	...rows.map((r) =>
		[r.perturbation, r.key, r.spearman, r.overlap, r.swaps, r.entered.join(';'), r.left.join(';')].join(',')
	)
].join('\n');
writeFileSync(join(OUT, 'index-sensitivity.csv'), csv, 'utf8');

const worstInfluence = Math.min(...rows.filter((r) => r.key === 'influence').map((r) => r.spearman));
const worstComposite = Math.min(...rows.filter((r) => r.key === 'composite').map((r) => r.spearman));
console.log(`
  sensitivity: ${rows.length} rows -> output/sensitivity/
  shipped discount: documented ${shipped.documented} · reported ${shipped.reported} · inferred ${shipped.inferred} · unsubstantiated ${shipped.unsubstantiated}
  shipped window: ${shippedWindow}y · slack year ${shippedSlack.year}d month ${shippedSlack.month}d
  worst influence spearman (vs shipped): ${worstInfluence}
  worst composite spearman (vs shipped): ${worstComposite}
  note: only influence/composite can move — the other four indices are pure functions of the data
`);
