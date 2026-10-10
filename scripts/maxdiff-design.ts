/**
 * MaxDiff design generation (m2-contract §10).
 *
 * The prioritization block shows eight sets of four items drawn from a
 * fifteen-item pool. For the scores to be comparable across items the design has
 * to be balanced: each item appears two or three times, no pair of items ever
 * appears in more than one set, and within each item the four positions are used
 * as evenly as its appearances allow. This module builds such a design from a
 * seed and checks any design against those rules.
 *
 * Determinism is the point. The design is frozen into the instrument, and the
 * instrument hash covers it, so "regenerate with seed 20260915" has to produce
 * the same bytes on any machine. The generator therefore uses a local PRNG
 * (mulberry32) and restarts it deterministically; it never calls Math.random().
 *
 * Not wired into `npm run data`: the design is generated once at the freeze
 * step, printed by this script, and committed into the instrument by hand. The
 * weekly tests re-derive it and hold the committed file to the constraints.
 *
 * Usage: `npx tsx scripts/maxdiff-design.ts --seed 20260915`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export interface MaxDiffSet {
	id: string;
	/** Pool item ids, in the order shown (position 0..3). */
	items: string[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const INSTRUMENT = join(ROOT, 'research', 'portal', 'study-001', 'instrument-v0.yaml');

// ---------------------------------------------------------------------------
// Local PRNG. mulberry32 is small, fast and good enough for a design search:
// the output is checked by validateMaxDiffDesign, so the PRNG only has to be
// deterministic, not cryptographic.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher-Yates over a copy, driven by the seeded PRNG. */
function shuffled<T>(values: T[], rng: () => number): T[] {
	const out = [...values];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function pairKey(a: string, b: string): string {
	return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/**
 * The four positions of one set, tried in every order until one gives each item
 * a position it has not used yet.
 *
 * Position balance is exactly this condition when an item appears at most once
 * per position: with two appearances the counts are 1/1/0/0, with three they are
 * 1/1/1/0. An item that repeats a position has a count of two somewhere, so the
 * spread is at least two and the design fails validation.
 */
function validOrdering(items: string[], positionUse: Map<string, Set<number>>): string[] | null {
	if (items.length !== 4) return null;
	const order = [...items];
	const permute = (start: number): string[] | null => {
		if (start === order.length) return [...order];
		for (let i = start; i < order.length; i++) {
			[order[start], order[i]] = [order[i], order[start]];
			if (!positionUse.get(order[start])!.has(start)) {
				const found = permute(start + 1);
				if (found) return found;
			}
			[order[start], order[i]] = [order[i], order[start]];
		}
		return null;
	};
	return permute(0);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * A single attempt: quotas first, then a backtracking search for a set of four
 * items at a time. Items with the most remaining appearances are preferred, so
 * the search drains the scarce items before the abundant ones; backtracking
 * covers the choices that do not work out.
 */
function attemptBuild(
	pool: string[],
	setCount: number,
	perSet: number,
	rng: () => number
): string[][] | null {
	const order = shuffled(pool, rng);
	const total = setCount * perSet;
	const base = Math.floor(total / pool.length);
	const remainder = total % pool.length;
	if (base < 1) return null;

	const quota = new Map<string, number>();
	order.forEach((item, index) => quota.set(item, base + (index < remainder ? 1 : 0)));

	const usedPairs = new Set<string>();
	const positionUse = new Map<string, Set<number>>();
	for (const item of pool) positionUse.set(item, new Set());

	const sets: string[][] = [];

	/** Remaining appearance count, the search's ordering heuristic. */
	const weight = (combo: string[]) => combo.reduce((sum, item) => sum + (quota.get(item) ?? 0), 0);

	/** Every four-item combination still allowed by quotas and used pairs. */
	function combinations(): string[][] {
		const available = order.filter((item) => (quota.get(item) ?? 0) > 0);
		const out: string[][] = [];
		for (let a = 0; a < available.length; a++) {
			for (let b = a + 1; b < available.length; b++) {
				for (let c = b + 1; c < available.length; c++) {
					for (let d = c + 1; d < available.length; d++) {
						const combo = [available[a], available[b], available[c], available[d]];
						let compatible = true;
						for (let i = 0; i < perSet && compatible; i++) {
							for (let j = i + 1; j < perSet; j++) {
								if (usedPairs.has(pairKey(combo[i], combo[j]))) {
									compatible = false;
									break;
								}
							}
						}
						if (compatible) out.push(combo);
					}
				}
			}
		}
		out.sort((x, y) => weight(y) - weight(x));
		return out;
	}

	function apply(ordered: string[]) {
		sets.push(ordered);
		for (let i = 0; i < ordered.length; i++) {
			quota.set(ordered[i], quota.get(ordered[i])! - 1);
			positionUse.get(ordered[i])!.add(i);
		}
		for (let i = 0; i < ordered.length; i++) {
			for (let j = i + 1; j < ordered.length; j++) {
				usedPairs.add(pairKey(ordered[i], ordered[j]));
			}
		}
	}

	function undo(ordered: string[]) {
		sets.pop();
		for (let i = 0; i < ordered.length; i++) {
			quota.set(ordered[i], quota.get(ordered[i])! + 1);
			positionUse.get(ordered[i])!.delete(i);
		}
		for (let i = 0; i < ordered.length; i++) {
			for (let j = i + 1; j < ordered.length; j++) {
				usedPairs.delete(pairKey(ordered[i], ordered[j]));
			}
		}
	}

	function place(index: number): boolean {
		if (index === setCount) return true;
		for (const combo of combinations()) {
			const ordered = validOrdering(combo, positionUse);
			if (!ordered) continue;
			apply(ordered);
			if (place(index + 1)) return true;
			undo(ordered);
		}
		return false;
	}

	return place(0) ? sets : null;
}

/**
 * One design for `setCount` sets of `perSet` items from `pool`, deterministic in
 * `seed`. Each set gets an id `mds1`..`mdsN`; the array order inside a set is the
 * presentation order the position balance was computed for.
 */
export function generateMaxDiffDesign(
	pool: string[],
	setCount: number,
	perSet: number,
	seed: number
): MaxDiffSet[] {
	if (perSet !== 4) throw new Error(`this generator is written for four-item sets, got ${perSet}`);
	if (pool.length < perSet) throw new Error('the pool is smaller than one set');
	if (new Set(pool).size !== pool.length) throw new Error('the pool repeats an item');
	const total = setCount * perSet;
	if (total < pool.length) throw new Error('the design cannot give every pool item an appearance');

	// Restarts use the same seed plus a constant step, so a different seed walks
	// a different sequence and the same seed always walks the same one.
	for (let attempt = 0; attempt < 64; attempt++) {
		const rng = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
		const design = attemptBuild(pool, setCount, perSet, rng);
		if (design) return design.map((items, index) => ({ id: `mds${index + 1}`, items }));
	}
	throw new Error(`no MaxDiff design found for ${pool.length} items in ${setCount} sets of ${perSet}`);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Every rule the design has to satisfy, as a list of human-readable violations.
 * Empty means balanced. The rules are fixed at four positions per set because
 * the instrument's items_per_set is 4 and the balance story is written for it.
 */
export function validateMaxDiffDesign(pool: string[], sets: MaxDiffSet[]): string[] {
	const violations: string[] = [];
	const poolSet = new Set(pool);
	const setIds = new Set<string>();
	const pairSeen = new Map<string, string>(); // pair -> set id that used it
	const appearances = new Map<string, number>();
	const positionCounts = new Map<string, number[]>();
	for (const item of pool) {
		appearances.set(item, 0);
		positionCounts.set(item, [0, 0, 0, 0]);
	}

	for (const set of sets) {
		if (setIds.has(set.id)) violations.push(`duplicate set id "${set.id}"`);
		setIds.add(set.id);
		if (set.items.length !== 4) {
			violations.push(`set "${set.id}" holds ${set.items.length} items, expected 4`);
		}
		const members = new Set<string>();
		for (const item of set.items) {
			if (members.has(item)) violations.push(`set "${set.id}" repeats item "${item}"`);
			members.add(item);
			if (!poolSet.has(item)) violations.push(`set "${set.id}" uses "${item}", which is not in the pool`);
			appearances.set(item, (appearances.get(item) ?? 0) + 1);
		}
		for (let i = 0; i < set.items.length; i++) {
			const item = set.items[i];
			if (positionCounts.has(item) && i < 4) positionCounts.get(item)![i]++;
			for (let j = i + 1; j < set.items.length; j++) {
				const other = set.items[j];
				if (item === other) continue;
				const key = pairKey(item, other);
				if (pairSeen.has(key)) {
					violations.push(
						`pair "${item}" and "${other}" appears in sets "${pairSeen.get(key)}" and "${set.id}"`
					);
				} else {
					pairSeen.set(key, set.id);
				}
			}
		}
	}

	for (const item of pool) {
		const count = appearances.get(item) ?? 0;
		if (count < 2 || count > 3) violations.push(`item "${item}" appears ${count} time(s), expected 2 or 3`);
	}
	for (const item of pool) {
		const counts = positionCounts.get(item) ?? [0, 0, 0, 0];
		if (Math.max(...counts) - Math.min(...counts) > 1) {
			violations.push(`item "${item}" is position-imbalanced: [${counts.join(', ')}]`);
		}
	}

	return violations;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface BlockSource {
	id: string;
	itemsPerSet: number;
	setCount: number;
	pool: string[];
	constraints: string[];
	frozenWithInstrument: boolean;
}

/** Read the study's pool and set counts from the workshop instrument. */
function readBlock(): BlockSource {
	const doc = parseYaml(readFileSync(INSTRUMENT, 'utf8')) as {
		maxdiff_priority?: {
			id?: unknown;
			items_per_set?: unknown;
			sets?: unknown;
			pool?: unknown;
			design?: { constraints?: unknown; frozen_with_instrument?: unknown };
		};
	};
	const block = doc.maxdiff_priority;
	if (!block) throw new Error(`no maxdiff_priority block in ${INSTRUMENT}`);
	const pool = Array.isArray(block.pool) ? block.pool.filter((v): v is string => typeof v === 'string') : [];
	const itemsPerSet = typeof block.items_per_set === 'number' ? block.items_per_set : 4;
	const setCount = typeof block.sets === 'number' ? block.sets : 8;
	const constraints = Array.isArray(block.design?.constraints)
		? block.design.constraints.filter((v): v is string => typeof v === 'string')
		: [];
	return {
		id: typeof block.id === 'string' ? block.id : 'maxdiff_priority',
		itemsPerSet,
		setCount,
		pool,
		constraints,
		frozenWithInstrument: block.design?.frozen_with_instrument === true
	};
}

/** The YAML fragment to paste under `maxdiff_priority:`, indented to match the file. */
function yamlBlock(block: BlockSource, sets: MaxDiffSet[]): string {
	const lines: string[] = [];
	lines.push('  design:');
	lines.push('    status: generated');
	if (block.constraints.length) {
		lines.push('    constraints:');
		for (const constraint of block.constraints) lines.push(`      - ${constraint}`);
	}
	lines.push(`    frozen_with_instrument: ${block.frozenWithInstrument}`);
	lines.push('    sets:');
	for (const set of sets) {
		lines.push(`      - id: ${set.id}`);
		lines.push(`        items: [${set.items.join(', ')}]`);
	}
	return lines.join('\n');
}

function balanceSummary(pool: string[], sets: MaxDiffSet[]): string {
	const lines: string[] = [];
	const appearances = new Map<string, number>();
	const positions = new Map<string, number[]>();
	for (const item of pool) {
		appearances.set(item, 0);
		positions.set(item, [0, 0, 0, 0]);
	}
	for (const set of sets) {
		set.items.forEach((item, position) => {
			appearances.set(item, (appearances.get(item) ?? 0) + 1);
			if (position < 4) positions.get(item)![position]++;
		});
	}
	const byCount = new Map<number, number>();
	for (const count of appearances.values()) byCount.set(count, (byCount.get(count) ?? 0) + 1);
	lines.push(
		`  appearances: ${[...byCount.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([count, n]) => `${n} item(s) x${count}`)
			.join(', ')}`
	);
	lines.push('  positions per item (0..3):');
	const width = Math.max(...pool.map((item) => item.length));
	for (const item of pool) {
		lines.push(`    ${item.padEnd(width)}  ${appearances.get(item)}  [${positions.get(item)!.join(', ')}]`);
	}
	return lines.join('\n');
}

function main() {
	const args = process.argv.slice(2);
	const seedIndex = args.indexOf('--seed');
	const raw =
		seedIndex >= 0 ? args[seedIndex + 1] : args.find((arg) => arg.startsWith('--seed='))?.slice(7);
	if (!raw) {
		console.error('usage: npx tsx scripts/maxdiff-design.ts --seed <integer>');
		process.exit(1);
	}
	const seed = Number(raw);
	if (!Number.isInteger(seed)) {
		console.error(`--seed must be an integer, got "${raw}"`);
		process.exit(1);
	}

	const block = readBlock();
	const sets = generateMaxDiffDesign(block.pool, block.setCount, block.itemsPerSet, seed);
	const violations = validateMaxDiffDesign(block.pool, sets);
	if (violations.length) {
		console.error(`generated design failed validation:\n${violations.map((v) => `   x  ${v}`).join('\n')}`);
		process.exit(1);
	}

	console.log(`\n  MaxDiff design — seed ${seed}, ${block.pool.length} items, ${sets.length} sets of ${block.itemsPerSet}\n`);
	console.log(yamlBlock(block, sets));
	console.log('\n  balance\n');
	console.log(balanceSummary(block.pool, sets));
	console.log(`\n  validator: ${violations.length} violations\n`);
}

// `import.meta` is available under tsx and the ESM Worker toolchain alike. Only
// the CLI path runs when this file is the entry point; the exported functions
// stay importable from tests without printing anything.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	main();
}
