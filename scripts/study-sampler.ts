/**
 * study-sampler — stratified sampler for the inter-annotator study.
 *
 * Reads the built graph (src/generated/dataset.json) and samples N records
 * stratified by risk bucket (oversampled to C/D, inferred, disputed) and by
 * kind. Produces blinded prompts (no grades) and a private answer key.
 *
 * Usage:
 *   npx tsx scripts/study-sampler.ts --n 300
 *   npx tsx scripts/study-sampler.ts --n 10 --out research/study/dry-run --seed 20260902
 *   npx tsx scripts/study-sampler.ts --n 300 --dataset src/generated/dataset.json --out research/study
 *
 * Outputs (in --out):
 *   sample-<n>.json          — full sample with project grades (recomputable snapshot)
 *   sample-<n>-blinded.json  — what raters see (grades stripped, study_ids S001…)
 *   sample-<n>-key.json      — answer key: study_id → project grade
 *   rater-template.csv       — blinded CSV template (study_id, kind, id, title, confidence, basis, notes)
 *
 * Deterministic: same commit + same seed → byte-identical sample (mulberry32 PRNG).
 * The seed defaults to a stable hash of the commit SHA, so re-sampling after data
 * changes produces a new meta.sampledAt / meta.commitSha binding.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

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
	if (fallback !== undefined) return fallback;
	return undefined;
}
function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

const N = parseInt(arg('n', '300')!, 10);
const OUT = arg('out', join(ROOT, 'research', 'study'))!;
const SEED_RAW = arg('seed', undefined);
const DATASET = arg('dataset', join(ROOT, 'src', 'generated', 'dataset.json'))!;

if (!Number.isFinite(N) || N <= 0 || N > 1000) {
	console.error(`--n must be 1..1000, got ${N}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// PRNG — mulberry32 + xmur3 seed hash (deterministic, no deps)
// ---------------------------------------------------------------------------

function xmur3(str: string): () => number {
	let h = 1779033703 ^ str.length;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return h >>> 0;
	};
}
function mulberry32(a: number): () => number {
	return () => {
		let t = (a += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function seededRng(seed: string): () => number {
	const h = xmur3(seed)();
	return mulberry32(h);
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

// ---------------------------------------------------------------------------
// Load dataset
// ---------------------------------------------------------------------------

if (!existsSync(DATASET)) {
	console.error(`Dataset not found at ${DATASET} — run npm run data first`);
	process.exit(1);
}
const ds = JSON.parse(readFileSync(DATASET, 'utf8'));
// Commit SHA lives in stats.json (and in paper's reproducibility block), not in dataset.json meta.
// Try stats.json, then git, then fallback.
let commitSha = 'unknown';
try {
	const statsPath = join(ROOT, 'src', 'generated', 'stats.json');
	if (existsSync(statsPath)) {
		const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
		commitSha = stats.commitSha ?? stats.commit ?? commitSha;
	}
} catch {}
if (commitSha === 'unknown') {
	try {
		commitSha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim() || 'unknown';
	} catch {}
	if (!commitSha || commitSha === 'unknown') {
		commitSha = (ds.meta as Record<string, unknown>)?.commitSha as string ?? (ds.meta as Record<string, unknown>)?.commit as string ?? 'unknown';
	}
}
const seedStr = SEED_RAW ?? (commitSha !== 'unknown' ? commitSha : 'study-v1');
const rng = seededRng(`${seedStr}::sampler`);

// ---------------------------------------------------------------------------
// Build pool of claim-bearing records
// ---------------------------------------------------------------------------

type PoolRecord = {
	kind: string;
	id: string;
	confidence: string;
	basis: string;
	verification: string;
	disputes: unknown[];
	sources: string[];
	title?: string;
	name_en?: string;
	roleTitle?: string;
	holder?: string;
	interval?: unknown;
	start?: string | null;
	end?: string | null;
	date?: string | null;
	summary?: string;
	description?: string;
	raw: unknown;
};

function poolFor(kind: string, arr: unknown[]): PoolRecord[] {
	if (!Array.isArray(arr)) return [];
	return arr.map((r: unknown) => {
		const o = r as Record<string, unknown>;
		return {
			kind,
			id: String(o.id ?? o.from ?? 'unknown'),
			confidence: String((o.confidence as string) ?? 'B'),
			basis: String((o.basis as string) ?? 'reported'),
			verification: String((o.verification as string) ?? 'verified'),
			disputes: (o.disputes as unknown[]) ?? [],
			sources: (o.sources as string[]) ?? [],
			title: (o.title_en as string) ?? (o.title as string) ?? (o.name_en as string) ?? undefined,
			name_en: o.name_en as string | undefined,
			roleTitle: o.roleTitle as string | undefined,
			holder: o.holder as string | undefined,
			interval: o.interval,
			start: (o.start as string) ?? (o.date as string) ?? null,
			end: (o.end as string) ?? (o.date_end as string) ?? null,
			date: (o.date as string) ?? null,
			summary: (o.summary as string) ?? (o.description as string) ?? undefined,
			description: o.description as string | undefined,
			raw: r,
		};
	});
}

// Collect pools — claim-bearing kinds only (the study population)
const pools: PoolRecord[] = [
	...poolFor('position', ds.positions),
	...poolFor('relationship', ds.relationships),
	...poolFor('event', ds.events),
	...poolFor('company', ds.companies),
	...poolFor('contract', ds.contracts),
	...poolFor('licence', ds.licences),
	...poolFor('declaration', ds.declarations),
	...poolFor('education', ds.education),
	// Include world-claims and agreements if present (v0.0.2+)
	...poolFor('worldClaim', ds.worldClaims),
	...poolFor('agreement', ds.agreements),
];

// Filter to records that actually have a basis (some scaffolding may lack)
const pool = pools.filter((r) => r.basis && r.confidence);
console.log(`Pool: ${pool.length} claim-bearing records across ${new Set(pool.map((r) => r.kind)).size} kinds`);
console.log(`  kinds: ${[...new Set(pool.map((r) => r.kind))].join(', ')}`);
const basisCounts: Record<string, number> = {};
const confCounts: Record<string, number> = {};
for (const r of pool) {
	basisCounts[r.basis] = (basisCounts[r.basis] ?? 0) + 1;
	confCounts[r.confidence] = (confCounts[r.confidence] ?? 0) + 1;
}
console.log(`  basis: ${JSON.stringify(basisCounts)}`);
console.log(`  confidence: ${JSON.stringify(confCounts)}`);
console.log(`  disputed (disputes>0 or verification=disputed): ${pool.filter((r) => r.disputes.length > 0 || r.verification === 'disputed').length}`);

// ---------------------------------------------------------------------------
// Buckets — mutually exclusive by priority
// ---------------------------------------------------------------------------

type Bucket = 'unsubstantiated' | 'inferred' | 'disputed' | 'attributed' | 'reported' | 'documented';

function bucketOf(r: PoolRecord): Bucket {
	if (r.basis === 'unsubstantiated') return 'unsubstantiated';
	if (r.basis === 'inferred') return 'inferred';
	if (r.disputes.length > 0 || r.verification === 'disputed') return 'disputed';
	if (r.confidence === 'C' || r.confidence === 'D') return 'attributed';
	if (r.basis === 'reported') return 'reported';
	if (r.basis === 'documented') return 'documented';
	return 'reported';
}

const BUCKET_ORDER: Bucket[] = ['unsubstantiated', 'inferred', 'disputed', 'attributed', 'reported', 'documented'];

// Fraction targets tuned to protocol §3.2 table for N=300; scaled for arbitrary N.
const FRACTIONS: Record<Bucket, number> = {
	unsubstantiated: 0.04,
	inferred: 0.0667,
	disputed: 0.1667,
	attributed: 0.2,
	reported: 0.3333,
	documented: 0.1933,
};

function computeTargets(n: number, populationByBucket: Record<string, number>): Record<Bucket, number> {
	// Initial proportional targets
	const raw: Record<string, number> = {};
	let sum = 0;
	for (const b of BUCKET_ORDER) {
		raw[b] = Math.round(n * FRACTIONS[b]);
		sum += raw[b];
	}
	// For small-n dry runs (n ≤ 20), ensure every non-empty bucket gets at least 1
	// so the tail is visible in the 10-record demonstration (protocol §3.4, §9).
	if (n <= 20) {
		for (const b of BUCKET_ORDER) {
			if ((populationByBucket[b] ?? 0) > 0 && (raw[b] ?? 0) === 0) {
				raw[b] = 1;
				sum++;
			}
		}
		// Re-adjust to exactly n after flooring
		let drift2 = n - sum;
		const orderByFracSmall = [...BUCKET_ORDER].sort((a, b) => FRACTIONS[b] - FRACTIONS[a]);
		let j = 0;
		while (drift2 !== 0) {
			const b = orderByFracSmall[j % orderByFracSmall.length];
			if (drift2 > 0) {
				raw[b]!++;
				drift2--;
			} else if ((raw[b] ?? 0) > 1) {
				// Don't drop below the floor of 1 for non-empty buckets
				raw[b]!--;
				drift2++;
			} else {
				// Try next bucket
			}
			j++;
			if (j > 2000) break;
			if (drift2 < 0 && BUCKET_ORDER.every((x) => (raw[x] ?? 0) <= 1 || (populationByBucket[x] ?? 0) === 0)) break;
		}
		sum = BUCKET_ORDER.reduce((s, b) => s + (raw[b] ?? 0), 0);
	}
	// Adjust rounding drift to exactly n
	let drift = n - sum;
	const orderByFrac = [...BUCKET_ORDER].sort((a, b) => FRACTIONS[b] - FRACTIONS[a]);
	let idx = 0;
	while (drift !== 0) {
		const b = orderByFrac[idx % orderByFrac.length];
		if (drift > 0) {
			raw[b]++;
			drift--;
		} else if (raw[b] > 0) {
			raw[b]--;
			drift++;
		}
		idx++;
		if (idx > 1000) break;
	}
	// Cap at population; redistribute deficit to available buckets
	for (const b of BUCKET_ORDER) {
		if (raw[b] > (populationByBucket[b] ?? 0)) {
			const excess = raw[b] - (populationByBucket[b] ?? 0);
			raw[b] = populationByBucket[b] ?? 0;
			// Redistribute excess to buckets with remaining headroom, in priority order (reported/documented first)
			const recipients = [...BUCKET_ORDER].filter((x) => (raw[x] ?? 0) < (populationByBucket[x] ?? 0));
			// Prefer reported/documented for redistribution (least scarce)
			recipients.sort((a, b) => {
				const prio: Record<string, number> = { reported: 0, documented: 1, attributed: 2, disputed: 3, inferred: 4, unsubstantiated: 5 };
				return (prio[a] ?? 9) - (prio[b] ?? 9);
			});
			let left = excess;
			for (const r of recipients) {
				if (left <= 0) break;
				const headroom = (populationByBucket[r] ?? 0) - (raw[r] ?? 0);
				const take = Math.min(headroom, left);
				raw[r]! += take;
				left -= take;
			}
			// If still left (population < n), we undershoot n — that's correct (can't invent records)
			if (left > 0) {
				console.warn(`  warning: population smaller than requested n; bucket ${b} capped, ${left} unassigned (pool < n)`);
			}
		}
	}
	// Final drift after capping
	const finalSum = BUCKET_ORDER.reduce((s, b) => s + (raw[b] ?? 0), 0);
	if (finalSum < n) {
		console.warn(`  warning: population ${pool.length} < requested n=${n}; sample will be ${finalSum}`);
	}
	return raw as Record<Bucket, number>;
}

// Bucket populations
const byBucket = new Map<Bucket, PoolRecord[]>();
for (const b of BUCKET_ORDER) byBucket.set(b, []);
for (const r of pool) {
	byBucket.get(bucketOf(r))!.push(r);
}
const popByBucket: Record<string, number> = {};
for (const b of BUCKET_ORDER) popByBucket[b] = byBucket.get(b)!.length;
console.log(`  bucket populations: ${JSON.stringify(popByBucket)}`);

const targets = computeTargets(N, popByBucket);
console.log(`  bucket targets (n=${N}): ${JSON.stringify(targets)}`);

// ---------------------------------------------------------------------------
// Within-bucket stratified draw (by kind)
// ---------------------------------------------------------------------------

function drawBucket(bucket: Bucket, target: number, records: PoolRecord[], bucketRng: () => number): PoolRecord[] {
	if (target <= 0 || records.length === 0) return [];
	if (target >= records.length) {
		// Take all, shuffled
		return shuffle(records, bucketRng);
	}
	// Stratify by kind: allocate target proportionally to kind composition, floor 1 per kind present if target allows
	const byKind = new Map<string, PoolRecord[]>();
	for (const r of records) {
		const k = r.kind;
		byKind.set(k, [...(byKind.get(k) ?? []), r]);
	}
	const kinds = [...byKind.keys()];
	// Proportional allocation
	const allocations = new Map<string, number>();
	let allocated = 0;
	for (const k of kinds) {
		const share = byKind.get(k)!.length / records.length;
		const n = Math.floor(share * target);
		// Floor 1 if the kind is present and target is at least kinds.length
		const withFloor = target >= kinds.length ? Math.max(1, n) : n;
		allocations.set(k, withFloor);
		allocated += withFloor;
	}
	// Adjust for rounding (allocations may exceed or undershoot target due to floors)
	// Sort kinds by fractional remainder descending for fair adjustment
	const remainders = kinds
		.map((k) => {
			const share = byKind.get(k)!.length / records.length;
			return { k, frac: share * target - Math.floor(share * target) };
		})
		.sort((a, b) => b.frac - a.frac);
	while (allocated > target) {
		// Take 1 from the smallest-remainder kind that has >1
		const candidates = [...remainders].reverse().filter(({ k }) => (allocations.get(k) ?? 0) > 1);
		if (candidates.length === 0) break;
		const victim = candidates[0].k;
		allocations.set(victim, (allocations.get(victim) ?? 0) - 1);
		allocated--;
	}
	while (allocated < target) {
		for (const { k } of remainders) {
			if (allocated >= target) break;
			const headroom = byKind.get(k)!.length - (allocations.get(k) ?? 0);
			if (headroom > 0) {
				allocations.set(k, (allocations.get(k) ?? 0) + 1);
				allocated++;
			}
		}
		if (allocated < target) break; // no headroom
	}

	// Draw per kind
	const out: PoolRecord[] = [];
	for (const k of kinds) {
		const need = allocations.get(k) ?? 0;
		const group = shuffle(byKind.get(k)!, bucketRng);
		out.push(...group.slice(0, need));
	}
	// Shuffle the bucket's output so kind is not clustered
	return shuffle(out, bucketRng);
}

const bucketSamples = new Map<Bucket, PoolRecord[]>();
for (const b of BUCKET_ORDER) {
	const bRng = seededRng(`${seedStr}::bucket:${b}`);
	const drawn = drawBucket(b, targets[b] ?? 0, byBucket.get(b) ?? [], bRng);
	bucketSamples.set(b, drawn);
	console.log(`  bucket ${b}: population ${popByBucket[b] ?? 0} → sample ${drawn.length} ${drawn.length ? `(kinds: ${JSON.stringify(Object.fromEntries([...new Set(drawn.map((r) => r.kind))].map((k) => [k, drawn.filter((r) => r.kind === k).length])) )})` : ''}`);
}

// Combine and globally shuffle (presentation order must not leak bucket)
let combined: PoolRecord[] = [];
for (const b of BUCKET_ORDER) combined.push(...(bucketSamples.get(b) ?? []));
const finalRng = seededRng(`${seedStr}::final-shuffle`);
combined = shuffle(combined, finalRng);

// If we have fewer than N due to population cap, combined.length < N — that's expected; do not pad.
if (combined.length !== N && pool.length >= N) {
	console.warn(`Sample size ${combined.length} != requested ${N} — check targets vs population`);
}

// Deduplicate check
const seen = new Set<string>();
for (const r of combined) {
	const key = `${r.kind}:${r.id}`;
	if (seen.has(key)) {
		console.error(`Duplicate record in sample: ${key}`);
		process.exit(1);
	}
	seen.add(key);
}

// ---------------------------------------------------------------------------
// Build outputs
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

// Helper: source lookup for blinded prompts
const sourceById = new Map<string, unknown>();
for (const s of (ds.sources as unknown[]) ?? []) {
	const o = s as Record<string, unknown>;
	if (o.id) sourceById.set(String(o.id), o);
}
const personById = new Map<string, unknown>();
for (const p of (ds.people as unknown[]) ?? []) {
	const o = p as Record<string, unknown>;
	if (o.id) personById.set(String(o.id), o);
}
const institutionById = new Map<string, unknown>();
for (const i of (ds.institutions as unknown[]) ?? []) {
	const o = i as Record<string, unknown>;
	if (o.id) institutionById.set(String(o.id), o);
}
const roleById = new Map<string, unknown>();
for (const r of (ds.roles as unknown[]) ?? []) {
	const o = r as Record<string, unknown>;
	if (o.id) roleById.set(String(o.id), o);
}

function resolveSources(ids: string[]): { id: string; title: string; publisher: string; tier: number; excerpt?: string; url?: string }[] {
	return ids.map((id) => {
		const s = sourceById.get(id) as Record<string, unknown> | undefined;
		if (!s) return { id, title: id, publisher: 'unknown', tier: 5 as number, url: '' };
		return {
			id: String(s.id),
			title: String(s.title ?? id),
			publisher: String(s.publisher ?? 'unknown'),
			tier: Number(s.tier ?? 5),
			excerpt: s.excerpt ? String(s.excerpt).slice(0, 600) : undefined,
			url: s.url ? String(s.url) : undefined,
		};
	});
}

function buildBlindedPrompt(r: PoolRecord, studyId: string) {
	const raw = r.raw as Record<string, unknown>;
	// Build a human-readable claim description per kind
	let claimText = '';
	let contextText = '';
	switch (r.kind) {
		case 'position': {
			const role = roleById.get(String(raw.role)) as Record<string, unknown> | undefined;
			const holder = personById.get(String(raw.holder)) as Record<string, unknown> | undefined;
			const roleTitle = (role?.title_en as string) ?? String(raw.role);
			const holderName = (holder?.name_en as string) ?? String(raw.holder);
			const inst = role ? (institutionById.get(String(role.institution)) as Record<string, unknown> | undefined) : undefined;
			const instName = (inst?.name_en as string) ?? String(role?.institution ?? '');
			claimText = `${holderName} held ${roleTitle} (${instName})`;
			if (raw.start || raw.end) claimText += ` between ${String(raw.start ?? '?')} and ${String(raw.end ?? '?')}`;
			if (holder?.summary) contextText = String(holder.summary).slice(0, 500);
			if (raw.notes && Array.isArray(raw.notes) && raw.notes.length) contextText += `\nNotes: ${(raw.notes as string[]).join(' | ').slice(0, 600)}`;
			break;
		}
		case 'relationship': {
			const fromName =
				(personById.get(String(raw.from)) as Record<string, unknown> | undefined)?.name_en ??
				(institutionById.get(String(raw.from)) as Record<string, unknown> | undefined)?.name_en ??
				String(raw.from);
			const toName =
				(personById.get(String(raw.to)) as Record<string, unknown> | undefined)?.name_en ??
				(institutionById.get(String(raw.to)) as Record<string, unknown> | undefined)?.name_en ??
				String(raw.to);
			claimText = `${String(fromName)} —[${String(raw.type)}]→ ${String(toName)} — ${String(raw.description ?? raw.subtype ?? '')}`;
			if (raw.reasoning) contextText = `Reasoning: ${String(raw.reasoning).slice(0, 500)}`;
			if (raw.falsifiable_by) contextText += `\nFalsifiable by: ${String(raw.falsifiable_by).slice(0, 300)}`;
			if (raw.disputes && Array.isArray(raw.disputes) && (raw.disputes as unknown[]).length) {
				contextText += `\nDisputes: ${JSON.stringify(raw.disputes).slice(0, 600)}`;
			}
			break;
		}
		case 'event': {
			claimText = `${String(raw.title_en ?? raw.id)} — ${String(raw.summary ?? '').slice(0, 400)}`;
			if (raw.date) claimText += ` (date: ${String(raw.date)}${raw.date_end ? ` → ${String(raw.date_end)}` : ''})`;
			break;
		}
		case 'company': {
			claimText = `Company ${String(raw.id)} — ${String((raw as Record<string, unknown>).legal_name_en ?? (raw as Record<string, unknown>).legal_name_fr ?? raw.id)}`;
			break;
		}
		case 'contract': {
			claimText = `Contract ${String(raw.id)} — ${String(raw.title_en ?? raw.id)} (${String(raw.institution ?? '')} → ${String(raw.winner ?? 'no winner')})`;
			break;
		}
		case 'licence': {
			claimText = `Licence ${String(raw.id)} — ${String(raw.kind ?? '')} holder ${String(raw.holder ?? '')} issuer ${String(raw.issuer ?? '')} grant ${String(raw.grant ?? '')}`;
			break;
		}
		case 'declaration': {
			claimText = `Declaration ${String(raw.id)} — ${String(raw.kind ?? '')} by ${String(raw.declarer ?? 'regime')} ${String(raw.date ?? '')}`;
			break;
		}
		case 'education': {
			claimText = `Education ${String(raw.id)} — ${String(raw.person ?? '')} ${String(raw.degree_en ?? '')} at ${String(raw.institution ?? 'unknown')}`;
			break;
		}
		default: {
			claimText = `${r.kind} ${r.id}`;
			if (raw.summary) claimText += ` — ${String(raw.summary).slice(0, 300)}`;
		}
	}

	const sources = resolveSources(r.sources);
	return {
		study_id: studyId,
		kind: r.kind,
		id: r.id,
		claim: claimText,
		context: contextText || undefined,
		dates: { start: r.start ?? null, end: r.end ?? null, verification: r.verification },
		sources,
		// Explicitly NO confidence/basis/verification grade fields beyond dates.verification (which is structural, not graded — but per protocol, raters do NOT grade verification; showing it is debated whether to hide)
		// For strict blinding, we hide verification too — but the rubric needs it to decide inferred vs reported for C. We keep verification visible as it is not graded, but note it.
		// Protocol §5 says blinded has no confidence/basis/verification shown to raters. We'll honor that: strip verification from blinded dates, keep only start/end.
	};
}

function buildKeyEntry(r: PoolRecord, studyId: string) {
	return {
		study_id: studyId,
		kind: r.kind,
		id: r.id,
		confidence: r.confidence,
		basis: r.basis,
		verification: r.verification,
		disputes: r.disputes,
		bucket: bucketOf(r),
	};
}

// Assign study_ids
const studyIds = combined.map((_, i) => `S${String(i + 1).padStart(3, '0')}`);

const fullRecords = combined.map((r, i) => ({
	...buildKeyEntry(r, studyIds[i]),
	sources: r.sources,
	title: r.title,
	interval: r.interval,
	raw: r.raw,
}));

const blindedPrompts = combined.map((r, i) => {
	const p = buildBlindedPrompt(r, studyIds[i]);
	// Strip verification from blinded dates per protocol strict blinding — keep only start/end for the claim
	return {
		study_id: p.study_id,
		kind: p.kind,
		id: p.id,
		claim: p.claim,
		context: p.context,
		dates: { start: p.dates.start, end: p.dates.end }, // no verification
		sources: p.sources,
	};
});

const keyMap: Record<string, { kind: string; id: string; confidence: string; basis: string; verification: string; bucket: string }> = {};
combined.forEach((r, i) => {
	const key = buildKeyEntry(r, studyIds[i]);
	keyMap[studyIds[i]] = { kind: key.kind, id: key.id, confidence: key.confidence, basis: key.basis, verification: key.verification, bucket: key.bucket };
});

const meta = {
	sampledAt: new Date().toISOString(),
	commitSha,
	seed: seedStr,
	n: combined.length,
	requestedN: N,
	dataset: {
		path: DATASET,
		counts: ds.meta?.counts ?? null,
		basisCounts: ds.meta?.basisCounts ?? basisCounts,
		confidenceCounts: ds.meta?.confidenceCounts ?? confCounts,
	},
	population: pool.length,
	bucketPopulations: popByBucket,
	bucketTargets: targets,
	bucketActuals: Object.fromEntries(BUCKET_ORDER.map((b) => [b, bucketSamples.get(b)?.length ?? 0])),
	kindTargets: 'stratified within bucket, floor 1 per kind present',
	notes: 'Mutually exclusive buckets by priority: unsubstantiated > inferred > disputed > attributed > reported > documented. See protocol §3.2.',
};

const sampleOut = join(OUT, `sample-${combined.length}.json`);
const blindedOut = join(OUT, `sample-${combined.length}-blinded.json`);
const keyOut = join(OUT, `sample-${combined.length}-key.json`);
const templateOut = join(OUT, `rater-template.csv`);

writeFileSync(sampleOut, JSON.stringify({ meta, records: fullRecords }, null, 2), 'utf8');
writeFileSync(blindedOut, JSON.stringify({ meta: { ...meta, blinded: true, note: 'No confidence/basis/verification grades — for rater distribution. Key is in sample-<n>-key.json (do not distribute to raters).' }, prompts: blindedPrompts }, null, 2), 'utf8');
writeFileSync(keyOut, JSON.stringify({ meta, key: keyMap }, null, 2), 'utf8');

// Rater template CSV
const templateHeader = 'study_id,kind,id,claim,confidence,basis,notes';
const templateRows = blindedPrompts.map((p) => {
	const safeClaim = `"${String(p.claim).replace(/"/g, '""').slice(0, 200)}"`;
	return `${p.study_id},${p.kind},${p.id},${safeClaim},,,`;
});
writeFileSync(templateOut, [templateHeader, ...templateRows].join('\n') + '\n', 'utf8');

// Also write canonical 300-named copies when N=300 (the protocol's expected names)
if (combined.length === 300) {
	writeFileSync(join(OUT, 'sample-300.json'), JSON.stringify({ meta, records: fullRecords }, null, 2), 'utf8');
	writeFileSync(join(OUT, 'sample-300-blinded.json'), JSON.stringify({ meta: { ...meta, blinded: true, note: 'No confidence/basis/verification grades — for rater distribution. Key is in sample-300-key.json (do not distribute to raters).' }, prompts: blindedPrompts }, null, 2), 'utf8');
	writeFileSync(join(OUT, 'sample-300-key.json'), JSON.stringify({ meta, key: keyMap }, null, 2), 'utf8');
}

console.log(`\nWrote:`);
console.log(`  ${sampleOut} (${fullRecords.length} records)`);
console.log(`  ${blindedOut} (${blindedPrompts.length} prompts, grades stripped)`);
console.log(`  ${keyOut} (${Object.keys(keyMap).length} keys)`);
console.log(`  ${templateOut}`);
console.log(`\nMeta: ${JSON.stringify(meta, null, 2)}`);
console.log(`\nNext:`);
console.log(`  1. Verify blinding:  npx tsx scripts/study-blinding.ts --verify --sample ${blindedOut} --key ${keyOut}`);
console.log(`  2. Build per-rater views: npx tsx scripts/study-blinding.ts --build --sample ${blindedOut} --key ${keyOut} --out ${OUT}/raters`);
console.log(`  3. Rater dry run: fill rater CSVs, then  npx tsx scripts/study-kappa.ts --raters ${OUT}/raters/rater-{a,b,c}.csv`);
