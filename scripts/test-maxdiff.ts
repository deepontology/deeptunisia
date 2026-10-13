/**
 * MaxDiff design tests (m2-contract §10).
 *
 * Three things are asserted, in the order they matter:
 *
 *  1. The committed design in the workshop instrument is balanced: eight sets of
 *     four, every item two or three times, no repeated unordered pair, and
 *     per-item position counts that differ by at most one. This is the artifact
 *     the runner will show, and it is read from the real YAML, not a copy.
 *  2. The generator with the frozen seed reproduces exactly that design. If the
 *     algorithm changes, the frozen file has to be regenerated deliberately, and
 *     the hash with it.
 *  3. The verifier actually refuses the failures it claims to catch, one
 *     mutation per rule.
 *
 * Usage: `npx tsx scripts/test-maxdiff.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
	generateMaxDiffDesign,
	validateMaxDiffDesign,
	type MaxDiffSet
} from './maxdiff-design.ts';
import { InstrumentSchema, validateInstrument } from './research-schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const INSTRUMENT = join(ROOT, 'research', 'portal', 'study-001', 'instrument-v0.yaml');
const SEED = 20260915;

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

function bail(message: string): never {
	console.error(`  FAIL  ${message}`);
	console.error('\n  0/1 checks passed, 1 FAILED\n');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// The committed design
// ---------------------------------------------------------------------------

console.log('\n  ── the frozen design ──\n');

if (!existsSync(INSTRUMENT)) bail(`${INSTRUMENT} is missing`);

const parsed = InstrumentSchema.safeParse(parseYaml(readFileSync(INSTRUMENT, 'utf8')));
if (!parsed.success) {
	bail(`the instrument does not parse: ${parsed.error.issues[0]?.message ?? 'unknown error'}`);
}
const doc = parsed.data;
const block = doc.maxdiff_priority;
if (!block) bail('the instrument has no maxdiff_priority block');

const pool = block.pool;
const sets = (block.design.sets ?? []) as MaxDiffSet[];

ok('the committed design is generated', block.design.status === 'generated', block.design.status);
ok(
	'the design declares eight sets of four',
	block.sets === 8 && block.items_per_set === 4 && sets.length === 8
);
ok(
	'the instrument cross-field rules pass',
	validateInstrument(doc).length === 0,
	validateInstrument(doc).join('; ')
);
const frozenViolations = validateMaxDiffDesign(pool, sets);
ok('every balance rule holds', frozenViolations.length === 0, frozenViolations.join('; '));

// ---------------------------------------------------------------------------
// Reproduction and determinism
// ---------------------------------------------------------------------------

console.log('\n  ── the generator ──\n');

const generated = generateMaxDiffDesign(pool, block.sets, block.items_per_set, SEED);
ok(
	`seed ${SEED} reproduces the committed sets`,
	JSON.stringify(generated) === JSON.stringify(sets)
);
ok(
	'the generated design passes every balance rule',
	validateMaxDiffDesign(pool, generated).length === 0
);
ok(
	'the same seed gives the same design',
	JSON.stringify(generateMaxDiffDesign(pool, 8, 4, SEED)) === JSON.stringify(generated)
);
ok(
	'a different seed gives a different design',
	JSON.stringify(generateMaxDiffDesign(pool, 8, 4, SEED + 1)) !== JSON.stringify(generated)
);

// ---------------------------------------------------------------------------
// The verifier refuses broken designs
// ---------------------------------------------------------------------------

console.log('\n  ── the verifier refuses ──\n');

const clone = (): MaxDiffSet[] => sets.map((set) => ({ id: set.id, items: [...set.items] }));

{
	// A set with the same item twice.
	const broken = clone();
	broken[0].items[1] = broken[0].items[0];
	const found = validateMaxDiffDesign(pool, broken);
	ok('a duplicated item is refused', found.some((v) => v.includes('repeats item')), found[0] ?? '');
}

{
	// A pool item that no set uses: pass an enlarged pool to the verifier.
	const found = validateMaxDiffDesign([...pool, 'ess_ghost'], clone());
	ok(
		'an unused pool item is refused',
		found.some((v) => v.includes('"ess_ghost" appears 0')),
		found.find((v) => v.includes('ess_ghost')) ?? ''
	);
}

{
	// An item pushed to four appearances: one more set that did not contain it.
	const broken = clone();
	const counts = new Map<string, number>(pool.map((id) => [id, 0]));
	for (const set of broken) for (const item of set.items) counts.set(item, (counts.get(item) ?? 0) + 1);
	const heavy = [...counts.entries()].find(([, count]) => count === 3)?.[0];
	if (!heavy) {
		ok('an item appearing four times is refused', false, 'the frozen design has no three-appearance item to push');
	} else {
		const target = broken.find((set) => !set.items.includes(heavy))!;
		target.items[3] = heavy;
		const found = validateMaxDiffDesign(pool, broken);
		ok(
			'an item appearing four times is refused',
			found.some((v) => v.includes(`"${heavy}" appears 4`)),
			found.find((v) => v.includes('appears 4')) ?? ''
		);
	}
}

{
	// A pair from the first set planted whole into a set that did not contain
	// either item.
	const broken = clone();
	const [a, b] = broken[0].items.slice(0, 2);
	const target = broken.slice(1).find((set) => !set.items.includes(a) && !set.items.includes(b));
	if (!target) {
		ok('a repeated pair is refused', false, 'no set free of both pair items');
	} else {
		target.items[2] = a;
		target.items[3] = b;
		const found = validateMaxDiffDesign(pool, broken);
		ok(
			'a repeated pair is refused',
			found.some((v) => v.includes('appears in sets')),
			found.find((v) => v.includes('appears in sets')) ?? ''
		);
	}
}

{
	// An item's two occurrences moved onto the same position.
	const broken = clone();
	const occurrences = new Map<string, Array<{ set: number; pos: number }>>();
	broken.forEach((set, s) => {
		set.items.forEach((item, pos) => {
			if (!occurrences.has(item)) occurrences.set(item, []);
			occurrences.get(item)!.push({ set: s, pos });
		});
	});
	const picked = [...occurrences.entries()].find(
		([, list]) => list.length >= 2 && list[0].pos !== list[1].pos
	);
	if (!picked) {
		ok('a repeated position is refused', false, 'the frozen design has no item to move');
	} else {
		const [item, list] = picked;
		const first = list[0];
		const second = list[1];
		// Swap the second occurrence to the position the first one already uses.
		// Membership does not change, so only the position rule is broken.
		const displaced = broken[second.set].items[first.pos];
		broken[second.set].items[first.pos] = broken[second.set].items[second.pos];
		broken[second.set].items[second.pos] = displaced;
		const found = validateMaxDiffDesign(pool, broken);
		ok(
			'a repeated position is refused',
			found.some((v) => v.includes(`"${item}" is position-imbalanced`)),
			found.find((v) => v.includes(item)) ?? ''
		);
	}
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
