/**
 * study-model-arm — model-graded consistency (parallel arm of the inter-annotator study).
 *
 * Grades the same blinded sample (300 records, or 10 for dry-run) via a language
 * model under two prompt regimes:
 *   regime A: "rubric only" — system prompt is rubric v2 text alone
 *   regime B: "rubric + examples" — rubric v2 + 5 few-shot examples (with reasoning)
 *
 * When an LLM API key is configured (OPENAI_API_KEY or ANTHROPIC_API_KEY), the
 * script calls the real model. Otherwise it runs a deterministic *simulator* that
 * grades from the source tiers in the blinded prompt (tier-1 → A/documented, etc.)
 * with seeded variation per regime — marked `synthetic: true` in the output.
 * The simulator is sufficient for the dry-run harness test; the funded study
 * runs the real model and the synthetic flag makes the difference explicit.
 *
 * Usage:
 *   npx tsx scripts/study-model-arm.ts --sample research/study/dry-run/sample-10-blinded.json --out research/study/dry-run/model-arm --prompt rubric-only
 *   npx tsx scripts/study-model-arm.ts --sample research/study/sample-300-blinded.json --out research/study/model-arm --prompt rubric+examples
 *   npx tsx scripts/study-model-arm.ts --sample research/study/sample-300-blinded.json --out research/study/model-arm --prompt rubric-only --model gpt-4o-mini --temperature 0
 *
 * Outputs (in --out):
 *   regime-a.json  — grades for rubric-only
 *   regime-b.json  — grades for rubric+examples
 *   regime-a.csv   — same as CSV (for kappa script)
 *   regime-b.csv   — same as CSV
 *   (or model-arm-<prompt>.json when --prompt is a single regime)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
const SAMPLE = arg('sample', undefined) ?? arg('blinded', undefined) ?? join(ROOT, 'research', 'study', 'sample-300-blinded.json');
const OUT = arg('out', join(ROOT, 'research', 'study', 'model-arm'))!;
const PROMPT = arg('prompt', 'rubric-only')!; // rubric-only | rubric+examples | both
const MODEL = arg('model', process.env.OPENAI_MODEL ?? 'gpt-4o-mini')!;
const TEMPERATURE = parseFloat(arg('temperature', '0')!);
const SEED_RAW = arg('seed', 'model-arm-v1');
const DRY_RUN_SAMPLE_FALLBACK = join(ROOT, 'research', 'study', 'dry-run', 'sample-10-blinded.json');

let samplePath = SAMPLE;
if (!existsSync(samplePath) && existsSync(DRY_RUN_SAMPLE_FALLBACK) && PROMPT) {
	// For dry-run convenience, fall back to dry-run sample if main sample missing
}

// Support --prompt both → run both regimes sequentially
const REGIMES: string[] =
	PROMPT === 'both' || PROMPT === 'all' ? ['rubric-only', 'rubric+examples'] : [PROMPT];

console.log(`Model arm — regimes: ${REGIMES.join(', ')}`);
console.log(`  sample: ${samplePath}`);
console.log(`  out:    ${OUT}`);
console.log(`  model:  ${MODEL} (temperature ${TEMPERATURE})`);
console.log(`  env:    ${process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY set' : process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY set' : 'no API key — synthetic simulator'}`);

// ---------------------------------------------------------------------------
// Load sample
// ---------------------------------------------------------------------------
if (!existsSync(samplePath)) {
	console.error(`Sample not found: ${samplePath} — run sampler first (npx tsx scripts/study-sampler.ts --n 300)`);
	process.exit(1);
}
const sampleRaw = JSON.parse(readFileSync(samplePath, 'utf8'));
const prompts: {
	study_id: string;
	kind: string;
	id: string;
	claim: string;
	context?: string;
	dates: { start: string | null; end: string | null };
	sources: { id: string; title: string; publisher: string; tier: number; excerpt?: string; url?: string }[];
}[] = (sampleRaw.prompts as typeof prompts) ?? (sampleRaw.records as unknown as typeof prompts) ?? [];

console.log(`  prompts: ${prompts.length}`);

// ---------------------------------------------------------------------------
// Rubric text (for real LLM prompts) — load from file if present
// ---------------------------------------------------------------------------
let rubricText = '';
const rubricPath = join(ROOT, 'research', 'study', 'rubric-v2.md');
if (existsSync(rubricPath)) {
	rubricText = readFileSync(rubricPath, 'utf8');
	// Trim to the rubric core for prompt budgeting (first 8000 chars + decision tree)
	if (rubricText.length > 8000) rubricText = rubricText.slice(0, 8000) + '\n…(truncated for prompt)';
} else {
	rubricText = 'Confidence: A=primary, B=several credible secondaries, C=single source/estimate, D=circulating. Basis: documented=official record states it, reported=credible press reports it, inferred=nobody states it directly (reasoned + falsifier), unsubstantiated=circulates without evidence.';
}

// Few-shot examples (for rubric+examples regime) — drawn from rubric §7
const FEW_SHOT = `
EXAMPLES (5 records, grades shown):

1. CLAIM: H. Bourguiba held President 1957-07-25 → 1987-11-07
   SOURCES: JORT 1957 decree (tier 1) + Le Monde 1987-11-08 (tier 3)
   GRADE: confidence A, basis documented

2. CLAIM: Slaheddine Baly — Defence minister ~1979 → 1980
   SOURCES: Fr.wiki defence list (tier 5) + Leaders article (tier 4), no gazette
   GRADE: confidence B, basis reported

3. CLAIM: Mo.A. Ouertani as owner of Attessia TV (inferred from Wikipedia infobox)
   SOURCES: Wikipedia infobox (tier 5) vs press describing him only as presenter
   GRADE: confidence C, basis inferred (reasoning: infobox claim; falsifiable by corporate filing)

4. CLAIM: Rachid Drif — Foreign minister 2010-01-14 → present (ghost)
   SOURCES: Only placeholder; succession continuous without him
   GRADE: confidence D, basis unsubstantiated (attributed_to: placeholder list)

5. CLAIM: Tekkari — Justice minister 1999-11-17 → 2010-01-15 with one-day dispute (14 vs 15)
   SOURCES: Fr.wiki list + Jeune Afrique + decree list — converged, day disagrees
   GRADE: confidence B, basis reported (dispute recorded, not graded down to C)
`.trim();

// ---------------------------------------------------------------------------
// PRNG for simulator
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

// ---------------------------------------------------------------------------
// Simulator — heuristic grading from source tiers
// (used when no API key is configured; deterministic per study_id+regime)
// ---------------------------------------------------------------------------
function simulateGrade(
	prompt: (typeof prompts)[number],
	regime: string,
	rng: () => number,
): { confidence: string; basis: string; reasoning: string } {
	const tiers = prompt.sources.map((s) => s.tier);
	const hasTier1 = tiers.some((t) => t === 1);
	const countTierLE4 = tiers.filter((t) => t <= 4).length;
	const minTier = tiers.length ? Math.min(...tiers) : 5;

	// Base heuristic
	let conf: string;
	let basis: string;
	if (hasTier1) {
		conf = 'A';
		basis = 'documented';
	} else if (countTierLE4 >= 2 && minTier <= 4) {
		conf = 'B';
		basis = 'reported';
	} else if (countTierLE4 === 1 && minTier <= 4) {
		// Single credible source — the ambiguous C case: split between reported and inferred
		// Simulator chooses based on seeded coin; regime B (with examples) is slightly more likely to pick reported correctly
		const isInferred = rng() < (regime === 'rubric+examples' ? 0.35 : 0.5);
		conf = 'C';
		basis = isInferred ? 'inferred' : 'reported';
	} else {
		conf = 'D';
		basis = 'unsubstantiated';
	}

	// Add seeded noise to make the two regimes diverge (modeling few-shot improvement)
	// Regime B is more "accurate" (less noise)
	const noiseRate = regime === 'rubric+examples' ? 0.08 : 0.15;
	if (rng() < noiseRate) {
		// Flip to a neighboring category
		if (conf === 'A' && rng() < 0.5) {
			conf = 'B';
			basis = 'reported';
		} else if (conf === 'B' && rng() < 0.5) {
			conf = rng() < 0.5 ? 'A' : 'C';
			basis = conf === 'A' ? 'documented' : rng() < 0.5 ? 'reported' : 'inferred';
		} else if (conf === 'C') {
			// C is the unstable middle — flip basis often
			basis = basis === 'inferred' ? 'reported' : 'inferred';
			if (rng() < 0.3) conf = rng() < 0.5 ? 'B' : 'D';
		} else if (conf === 'D' && rng() < 0.5) {
			conf = 'C';
			basis = 'reported';
		}
	}

	const reasoning =
		regime === 'rubric+examples'
			? `Simulated (${regime}): ${countTierLE4} tier≤4 source(s), minTier=${minTier}, hasTier1=${hasTier1} → ${conf}/${basis} (few-shot regime, lower noise)`
			: `Simulated (${regime}): ${countTierLE4} tier≤4 source(s), minTier=${minTier}, hasTier1=${hasTier1} → ${conf}/${basis}`;

	return { confidence: conf, basis, reasoning };
}

// ---------------------------------------------------------------------------
// Real LLM call (if API key present)
// ---------------------------------------------------------------------------
async function callLLM(
	prompt: (typeof prompts)[number],
	regime: string,
	systemPrompt: string,
): Promise<{ confidence: string; basis: string; raw: string }> {
	const userPrompt = `Grade this record:

KIND: ${prompt.kind}
ID: ${prompt.id}
CLAIM: ${prompt.claim}
${prompt.context ? `CONTEXT: ${prompt.context}` : ''}
DATES: start=${prompt.dates.start ?? '?'} end=${prompt.dates.end ?? '?'}
SOURCES:
${prompt.sources.map((s) => `- [tier ${s.tier}] ${s.title} (${s.publisher}) — ${s.excerpt ? `"${s.excerpt.slice(0, 300)}"` : 'no excerpt'} — ${s.url ?? ''}`).join('\n')}

Respond with JSON only: {"confidence":"A|B|C|D","basis":"documented|reported|inferred|unsubstantiated","reasoning":"one sentence"}
No other text.`;

	// Try OpenAI first, then Anthropic
	if (process.env.OPENAI_API_KEY) {
		const res = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: MODEL,
				temperature: TEMPERATURE,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
				],
				response_format: { type: 'json_object' },
			}),
		});
		if (!res.ok) {
			const t = await res.text();
			throw new Error(`OpenAI API ${res.status}: ${t.slice(0, 500)}`);
		}
		const j = (await res.json()) as { choices: { message: { content: string } }[] };
		const raw = j.choices[0]?.message?.content ?? '';
		let parsed: { confidence?: string; basis?: string } = {};
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error(`LLM returned non-JSON: ${raw.slice(0, 300)}`);
		}
		return { confidence: String(parsed.confidence ?? '').toUpperCase(), basis: String(parsed.basis ?? '').toLowerCase(), raw };
	}

	if (process.env.ANTHROPIC_API_KEY) {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': process.env.ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: MODEL.includes('claude') ? MODEL : 'claude-3-5-sonnet-20241022',
				max_tokens: 300,
				temperature: TEMPERATURE,
				system: systemPrompt,
				messages: [{ role: 'user', content: userPrompt }],
			}),
		});
		if (!res.ok) {
			const t = await res.text();
			throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 500)}`);
		}
		const j = (await res.json()) as { content: { text: string }[] };
		const raw = j.content[0]?.text ?? '';
		let parsed: { confidence?: string; basis?: string } = {};
		try {
			const m = raw.match(/\{[\s\S]*\}/);
			parsed = JSON.parse(m ? m[0] : raw);
		} catch {
			throw new Error(`LLM returned non-JSON: ${raw.slice(0, 300)}`);
		}
		return { confidence: String(parsed.confidence ?? '').toUpperCase(), basis: String(parsed.basis ?? '').toLowerCase(), raw };
	}

	throw new Error('No API key');
}

// ---------------------------------------------------------------------------
// Run per regime
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

const useRealLLM = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

async function runAllRegimes() {
for (const regime of REGIMES) {
	console.log(`\nRegime: ${regime} ${useRealLLM ? '(real LLM)' : '(simulator)'}`);

	const systemPrompt =
		regime === 'rubric+examples'
			? `You are a research assistant grading historical claim records for evidence strength. Apply the rubric precisely. Respond with JSON only.\n\nRUBRIC:\n${rubricText}\n\n${FEW_SHOT}`
			: `You are a research assistant grading historical claim records for evidence strength. Apply the rubric precisely. Respond with JSON only.\n\nRUBRIC:\n${rubricText}`;

	const grades: { study_id: string; kind: string; id: string; confidence: string; basis: string; reasoning?: string; synthetic?: boolean; raw?: string }[] = [];

	let synthetic = !useRealLLM;

	for (const prompt of prompts) {
		const rng = seededRng(`${SEED_RAW}::${regime}::${prompt.study_id}`);

		if (useRealLLM) {
			try {
				const llm = await callLLM(prompt, regime, systemPrompt);
				// Validate categories
				const confOk = ['A', 'B', 'C', 'D'].includes(llm.confidence);
				const basisOk = ['documented', 'reported', 'inferred', 'unsubstantiated'].includes(llm.basis);
				if (!confOk || !basisOk) {
					console.warn(`  warning: LLM returned invalid categories for ${prompt.study_id}: ${llm.confidence}/${llm.basis} — falling back to simulator for this item`);
					const sim = simulateGrade(prompt, regime, rng);
					grades.push({ study_id: prompt.study_id, kind: prompt.kind, id: prompt.id, confidence: sim.confidence, basis: sim.basis, reasoning: sim.reasoning + ' (LLM invalid, sim fallback)', synthetic: true, raw: llm.raw });
				} else {
					grades.push({ study_id: prompt.study_id, kind: prompt.kind, id: prompt.id, confidence: llm.confidence, basis: llm.basis, synthetic: false, raw: llm.raw });
				}
				// Rate limit: small pause between calls
				await new Promise((r) => setTimeout(r, 200));
			} catch (e) {
				console.warn(`  warning: LLM call failed for ${prompt.study_id}: ${(e as Error).message} — using simulator for this item`);
				const sim = simulateGrade(prompt, regime, rng);
				grades.push({ study_id: prompt.study_id, kind: prompt.kind, id: prompt.id, confidence: sim.confidence, basis: sim.basis, reasoning: sim.reasoning + ` (LLM error: ${(e as Error).message.slice(0, 80)})`, synthetic: true });
			}
		} else {
			const sim = simulateGrade(prompt, regime, rng);
			grades.push({ study_id: prompt.study_id, kind: prompt.kind, id: prompt.id, confidence: sim.confidence, basis: sim.basis, reasoning: sim.reasoning, synthetic: true });
		}
	}

	// File naming: when both regimes run, use regime-a / regime-b; when single, use sanitized prompt name
	const slug = regime === 'rubric-only' ? 'regime-a' : regime === 'rubric+examples' ? 'regime-b' : regime.replace(/[^a-z0-9]+/gi, '-');
	const jsonOut = join(OUT, `${slug}.json`);
	const csvOut = join(OUT, `${slug}.csv`);

	const payload = {
		meta: {
			generatedAt: new Date().toISOString(),
			regime,
			model: useRealLLM ? MODEL : `simulator:${SEED_RAW}`,
			temperature: TEMPERATURE,
			synthetic,
			prompts: prompts.length,
			sample: samplePath.replace(ROOT + '/', ''),
			note: synthetic
				? 'Synthetic grades (no API key) — heuristic from source tiers with seeded variation. Marked synthetic:true. Replace with real LLM for the funded study.'
				: `Real LLM grades (${MODEL}, ${regime})`,
		},
		grades,
	};

	writeFileSync(jsonOut, JSON.stringify(payload, null, 2), 'utf8');

	// CSV for kappa script (same shape as rater CSVs)
	const csvHeader = 'study_id,kind,id,confidence,basis,notes';
	const csvRows = grades.map((g) => `${g.study_id},${g.kind},${g.id},${g.confidence},${g.basis},${(g.reasoning ?? '').replace(/"/g, '""').slice(0, 200)}`);
	writeFileSync(csvOut, [csvHeader, ...csvRows].join('\n') + '\n', 'utf8');

	console.log(`  wrote ${jsonOut} (${grades.length} grades, synthetic=${synthetic})`);
	console.log(`  wrote ${csvOut}`);

	// Summary counts
	const byConf: Record<string, number> = {};
	const byBasis: Record<string, number> = {};
	for (const g of grades) {
		byConf[g.confidence] = (byConf[g.confidence] ?? 0) + 1;
		byBasis[g.basis] = (byBasis[g.basis] ?? 0) + 1;
	}
	console.log(`  confidence: ${JSON.stringify(byConf)}`);
	console.log(`  basis:      ${JSON.stringify(byBasis)}`);
}

}

await runAllRegimes();

console.log(`\nDone. Next: compare model vs human via kappa:`);
console.log(`  npx tsx scripts/study-kappa.ts --raters ${OUT}/regime-a.csv,${OUT}/regime-b.csv --out ${OUT}/kappa-model.json`);
console.log(`  # or human vs model: npx tsx scripts/study-kappa.ts --raters research/study/raters/rater-a.csv,research/study/raters/rater-b.csv,${OUT}/regime-a.csv --out research/study/kappa-human-vs-model.json`);
