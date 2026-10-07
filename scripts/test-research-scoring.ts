/**
 * Assertions over the study scoring engine, community/research-scoring.ts.
 *
 * The engine is the one place the index formula is implemented; the build, the
 * runner and the live results endpoint all read it, so what is tested here is
 * that the study-002 specification scores its own anchors, that a hand-computed
 * response matches to 1e-9, that missing answers propagate as designed, that the
 * validator catches the mistakes the build must reject, and that the wave
 * aggregate is deterministic and suppresses small cells.
 *
 * Usage: `npx tsx scripts/test-research-scoring.ts`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
	aggregateResponses,
	applyExclusions,
	evaluateCondition,
	scoreResponse,
	validateScoringSpec,
	type BlendComponent,
	type CasesComponent,
	type CountComponent,
	type MeanComponent,
	type ScoringSpec
} from '../community/research-scoring.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

interface InstrumentItem {
	id: string;
	response: string;
	options?: string[];
}

const INSTRUMENT = join(ROOT, 'research', 'portal', 'study-002', 'instrument-v0.yaml');
const document = parseYaml(readFileSync(INSTRUMENT, 'utf8')) as {
	items: InstrumentItem[];
	scoring: ScoringSpec;
};
const spec = document.scoring;
const itemIds = new Set(document.items.map((item) => item.id));
const itemMeta = new Map(
	document.items.map((item) => [item.id, { response: item.response, options: item.options }])
);

// ---------------------------------------------------------------------------
// The real spec loads and validates
// ---------------------------------------------------------------------------

console.log('\n  ── the study-002 scoring block ──\n');

{
	const violations = validateScoringSpec(spec, itemIds, itemMeta);
	ok('the scoring block is the study index', spec.id === 'pti' && spec.scale_max === 10);
	ok('the real spec validates clean', violations.length === 0, violations.join('; '));
	const componentIds = spec.components.map((component) => component.id).sort().join(',');
	ok('the spec declares the expected components', componentIds === 'D,D_abuse,D_treat,G,H,H_contact,T,V', componentIds);
	ok('the plane is (T, G)', spec.plane.x === 'T' && spec.plane.y === 'G');
}

// ---------------------------------------------------------------------------
// The anchors: the answers the anchor values imply, scored back
// ---------------------------------------------------------------------------

console.log('\n  ── anchors ──\n');

{
	// Guardian (index-spec.md §4): T = 1 means every T item 10; G = 0 means every
	// G item 0 except the reverse-keyed G2, which is 10; H = 0 with no contact and
	// an E5 of "none", so V = 0.
	const guardian = scoreResponse(spec, {
		pti_t1: 10,
		pti_t2: 10,
		pti_t3: 10,
		pti_t4: 10,
		pti_t5: 10,
		pti_g1: 0,
		pti_g2: 10,
		pti_g3: 0,
		pti_g4: 0,
		pti_g5: 0,
		pti_e1: 'no',
		pti_e5: ['none']
	});
	ok('guardian: T = 1', guardian.components.T === 1);
	ok('guardian: G = 0', guardian.components.G === 0);
	ok('guardian: H = 0', guardian.components.H === 0);
	ok('guardian: I = 100', Math.abs((guardian.index ?? NaN) - 100) < 1e-9, String(guardian.index));
	ok('guardian: band = guardian', guardian.band === 'guardian');
	ok(
		'guardian: scoreResponse reproduces the anchor record',
		spec.anchors.guardian.I === 100 &&
			guardian.components.T === spec.anchors.guardian.T &&
			guardian.components.G === spec.anchors.guardian.G &&
			guardian.components.H === spec.anchors.guardian.H
	);

	// Police state: T = 0 means every T item 0; G = 1 means every G item 10
	// except G2 = 0; H = 1 with contact, E3 = 0 (reverse-keyed treatment),
	// three abuses in E4 and three in E5.
	const policeState = scoreResponse(spec, {
		pti_t1: 0,
		pti_t2: 0,
		pti_t3: 0,
		pti_t4: 0,
		pti_t5: 0,
		pti_g1: 10,
		pti_g2: 0,
		pti_g3: 10,
		pti_g4: 10,
		pti_g5: 10,
		pti_e1: 'yes',
		pti_e3: 0,
		pti_e4: ['money', 'insult', 'threat'],
		pti_e5: ['money', 'insult', 'threat']
	});
	ok('police state: T = 0', policeState.components.T === 0);
	ok('police state: G = 1', policeState.components.G === 1);
	ok('police state: H = 1', policeState.components.H === 1);
	ok('police state: I = 0', Math.abs((policeState.index ?? NaN) - 0) < 1e-9, String(policeState.index));
	ok('police state: band = police_state', policeState.band === 'police_state');
	ok(
		'police state: scoreResponse reproduces the anchor record',
		spec.anchors.police_state.I === 0 &&
			policeState.components.T === spec.anchors.police_state.T &&
			policeState.components.G === spec.anchors.police_state.G &&
			policeState.components.H === spec.anchors.police_state.H
	);
}

// ---------------------------------------------------------------------------
// A hand-computed mixed case
// ---------------------------------------------------------------------------

console.log('\n  ── hand-computed case ──\n');

{
	// T: t1 = 8, t2 = 6, t3 = 7 (3 of 5 answered)
	//    T = (8/10 + 6/10 + 7/10) / 3 = 21/30 = 0.7
	// G: g1 = 4, g2 = 6 (reverse), g3 = 2
	//    G = (4/10 + (1 - 6/10) + 2/10) / 3 = 10/30 = 1/3
	// H: contact, E3 = 3, E4 = [money, insult], E5 = [threat]
	//    D_treat = 1 - 3/10 = 0.7
	//    D_abuse = 2/3 (two abuses)
	//    D       = (0.7 + 2/3) / 2 = 41/60
	//    V       = 1/3
	//    H       = (2 * 41/60 + 1/3) / 3 = 17/30
	// I = 100 * (0.7 + (1 - 1/3) + (1 - 17/30)) / 3
	//   = 100 * (21/30 + 20/30 + 13/30) / 3 = 60
	const mixed = scoreResponse(spec, {
		pti_t1: 8,
		pti_t2: 6,
		pti_t3: 7,
		pti_g1: 4,
		pti_g2: 6,
		pti_g3: 2,
		pti_e1: 'yes',
		pti_e3: 3,
		pti_e4: ['money', 'insult'],
		pti_e5: ['threat']
	});
	ok('mixed: T = 0.7', Math.abs((mixed.components.T ?? NaN) - 0.7) < 1e-9);
	ok('mixed: G = 1/3', Math.abs((mixed.components.G ?? NaN) - 1 / 3) < 1e-9);
	ok('mixed: H = 17/30', Math.abs((mixed.components.H ?? NaN) - 17 / 30) < 1e-9);
	ok('mixed: I = 60', Math.abs((mixed.index ?? NaN) - 60) < 1e-9);
	ok('mixed: D = 41/60', Math.abs((mixed.components.D ?? NaN) - 41 / 60) < 1e-9);
}

// ---------------------------------------------------------------------------
// Missing answers, min_answered and the renormalising blend
// ---------------------------------------------------------------------------

console.log('\n  ── missing answers ──\n');

{
	// No contact: H is V, with no treatment or direct-abuse parts in the blend.
	const noContact = scoreResponse(spec, {
		pti_e1: 'no',
		pti_e5: ['money', 'insult']
	});
	ok('no contact: H equals V = 2/3', Math.abs((noContact.components.H ?? NaN) - 2 / 3) < 1e-9);

	// Two of five T items is below min_answered 3, so T is missing; T is in the
	// index's `requires`, so the index goes missing with it.
	const shortT = scoreResponse(spec, {
		pti_t1: 5,
		pti_t2: 5,
		pti_g1: 5,
		pti_g2: 5,
		pti_g3: 5,
		pti_g4: 5,
		pti_g5: 5,
		pti_e1: 'no'
	});
	ok('2 of 5 T items: T is null', shortT.components.T === null);
	ok('2 of 5 T items: the index is null', shortT.index === null);

	// E5 skipped and no contact makes H missing; H is not required by the index,
	// so the T and G weights renormalise: I = 100 * (0.5 + 0.5) / 2 = 50.
	const noHarm = scoreResponse(spec, {
		pti_t1: 5,
		pti_t2: 5,
		pti_t3: 5,
		pti_t4: 5,
		pti_t5: 5,
		pti_g1: 5,
		pti_g2: 5,
		pti_g3: 5,
		pti_g4: 5,
		pti_g5: 5,
		pti_e1: 'no'
	});
	ok('missing H: H is null', noHarm.components.H === null);
	ok('missing H: the index renormalises over T and G', Math.abs((noHarm.index ?? NaN) - 50) < 1e-9);
}

// ---------------------------------------------------------------------------
// The condition grammar, shared with the submission validator
// ---------------------------------------------------------------------------

console.log('\n  ── conditions ──\n');

{
	ok('always is true', evaluateCondition('always', {}) === true);
	ok('a string answer compares by equality', evaluateCondition('pti_e1 == yes', { pti_e1: 'yes' }) === true);
	ok('a different string is false', evaluateCondition('pti_e1 == yes', { pti_e1: 'no' }) === false);
	ok('whitespace around == is optional', evaluateCondition('pti_e1==yes', { pti_e1: 'yes' }) === true);
	ok(
		'an array answer compares by membership',
		evaluateCondition('pti_e2 == protest', { pti_e2: ['checkpoint', 'protest'] }) === true
	);
	ok(
		'an array without the value is false',
		evaluateCondition('pti_e2 == protest', { pti_e2: ['checkpoint'] }) === false
	);
	ok('a missing answer is false', evaluateCondition('pti_e1 == yes', {}) === false);
	ok('a null answer is false', evaluateCondition('pti_e1 == yes', { pti_e1: null }) === false);

	let threw = false;
	try {
		evaluateCondition('pti_e1 != yes', {});
	} catch {
		threw = true;
	}
	ok('any other expression throws', threw);

	let threwToo = false;
	try {
		evaluateCondition('pti_e1 == yes == no', {});
	} catch {
		threwToo = true;
	}
	ok('a double comparison throws', threwToo);
}

// ---------------------------------------------------------------------------
// Spec validation: the real spec is clean, mutations are caught
// ---------------------------------------------------------------------------

console.log('\n  ── spec validation ──\n');

{
	const has = (violations: string[], needle: string) => violations.some((v) => v.includes(needle));

	const withCycle = structuredClone(spec);
	const cycleTarget = withCycle.components.find((component) => component.id === 'D') as BlendComponent;
	cycleTarget.parts[0] = { ref: 'H_contact', weight: 1 };
	const cycleViolations = validateScoringSpec(withCycle, itemIds, itemMeta);
	ok('a reference cycle is reported', has(cycleViolations, 'cycle'), cycleViolations.join('; '));

	const withUnknownRef = structuredClone(spec);
	const unknownTarget = withUnknownRef.components.find((component) => component.id === 'D') as BlendComponent;
	unknownTarget.parts[0] = { ref: 'NOPE', weight: 1 };
	const unknownViolations = validateScoringSpec(withUnknownRef, itemIds, itemMeta);
	ok(
		'an unknown component ref is reported',
		has(unknownViolations, 'unknown component "NOPE"'),
		unknownViolations.join('; ')
	);

	const withUnknownItem = structuredClone(spec);
	const itemTarget = withUnknownItem.components.find((component) => component.id === 'T') as MeanComponent;
	itemTarget.items[0] = 'pti_nope';
	const itemViolations = validateScoringSpec(withUnknownItem, itemIds, itemMeta);
	ok(
		'an unknown item ref is reported',
		has(itemViolations, 'unknown item "pti_nope"'),
		itemViolations.join('; ')
	);

	const withWrongResponse = structuredClone(spec);
	const responseTarget = withWrongResponse.components.find(
		(component) => component.id === 'D_abuse'
	) as CountComponent;
	responseTarget.item = 'pti_e3';
	const responseViolations = validateScoringSpec(withWrongResponse, itemIds, itemMeta);
	ok(
		'a count on a scale item is reported',
		has(responseViolations, 'expected "multi_choice"'),
		responseViolations.join('; ')
	);

	const withBadIgnore = structuredClone(spec);
	const ignoreTarget = withBadIgnore.components.find((component) => component.id === 'D_abuse') as CountComponent;
	ignoreTarget.ignore = ['nope'];
	const ignoreViolations = validateScoringSpec(withBadIgnore, itemIds, itemMeta);
	ok(
		'an ignored non-option is reported',
		has(ignoreViolations, 'ignores "nope"'),
		ignoreViolations.join('; ')
	);

	const withBadWhen = structuredClone(spec);
	const whenTarget = withBadWhen.components.find((component) => component.id === 'H') as CasesComponent;
	whenTarget.cases[0].when = 'pti_e1 != yes';
	const whenViolations = validateScoringSpec(withBadWhen, itemIds, itemMeta);
	ok('a case condition outside the grammar is reported', has(whenViolations, 'is not "always"'), whenViolations.join('; '));

	const withUnknownWhenItem = structuredClone(spec);
	const whenItemTarget = withUnknownWhenItem.components.find(
		(component) => component.id === 'H'
	) as CasesComponent;
	whenItemTarget.cases[0].when = 'pti_nope == yes';
	const whenItemViolations = validateScoringSpec(withUnknownWhenItem, itemIds, itemMeta);
	ok(
		'a case condition naming an unknown item is reported',
		has(whenItemViolations, 'names unknown item "pti_nope"'),
		whenItemViolations.join('; ')
	);

	// Shrink the band that ends at 60 to end at 59 instead, whatever its name:
	// the next band still starts at 60, so 59–60 is now unclaimed.
	const withBandGap = structuredClone(spec);
	withBandGap.bands = withBandGap.bands.map((band) => (band.max === 60 ? { ...band, max: 59 } : band));
	const gapViolations = validateScoringSpec(withBandGap, itemIds, itemMeta);
	ok('a band gap is reported', has(gapViolations, 'gap'), gapViolations.join('; '));

	const withRegionTwice = structuredClone(spec);
	withRegionTwice.regions.groups.north_east = [...withRegionTwice.regions.groups.north_east, 'tunis'];
	const regionViolations = validateScoringSpec(withRegionTwice, itemIds, itemMeta);
	ok(
		'an option in two region groups is reported',
		has(regionViolations, 'sits in both region groups'),
		regionViolations.join('; ')
	);

	const withZeroWeight = structuredClone(spec);
	withZeroWeight.index.parts[0].weight = 0;
	const weightViolations = validateScoringSpec(withZeroWeight, itemIds, itemMeta);
	ok('a non-positive weight is reported', has(weightViolations, 'positive weight'), weightViolations.join('; '));

	const malformed = validateScoringSpec({} as ScoringSpec, itemIds, itemMeta);
	ok('a malformed block reports instead of throwing', malformed.length > 0, malformed.join('; '));
}

// ---------------------------------------------------------------------------
// Pre-registered exclusions
// ---------------------------------------------------------------------------

console.log('\n  ── exclusions ──\n');

{
	const flat = {
		pti_t1: 5,
		pti_t2: 5,
		pti_t3: 5,
		pti_t4: 5,
		pti_t5: 5,
		pti_g1: 5,
		pti_g2: 5,
		pti_g3: 5,
		pti_g4: 5,
		pti_g5: 5
	};
	const rows = [
		{ answers: { ...flat }, completionMs: 120_000 }, // straight-lining
		{ answers: { ...flat, pti_t1: 1 }, completionMs: 30_000 }, // speed
		{ answers: { ...flat, pti_t1: 1 }, completionMs: 120_000 }, // kept
		{ answers: { pti_t1: 5, pti_t2: 5, pti_t3: 5 }, completionMs: 120_000 }, // too few to read
		{ answers: { ...flat }, completionMs: 10_000 } // both rules
	];
	const { kept, exclusions } = applyExclusions(spec, rows);
	ok(
		'speed and straight-lining are counted per rule',
		exclusions.rules.speed === 2 && exclusions.rules['straight-lining'] === 2,
		JSON.stringify(exclusions.rules)
	);
	ok('rows_excluded counts distinct rows', exclusions.rows_excluded === 3, String(exclusions.rows_excluded));
	ok('the kept rows are the clean ones', kept.length === 2 && kept[0].completionMs === 120_000);

	// The published rule is "the same answer on all ten": nine identical answers
	// and one skip is not a straight line, and the row is kept.
	const nine = { ...flat, pti_g5: null };
	const boundary = applyExclusions(spec, [{ answers: nine, completionMs: 120_000 }]);
	ok('nine identical answers and a skip are not straight-lining', boundary.kept.length === 1, JSON.stringify(boundary.exclusions.rules));
}

// ---------------------------------------------------------------------------
// Wave aggregation
// ---------------------------------------------------------------------------

console.log('\n  ── wave aggregation ──\n');

{
	// Twenty scored rows in Grand Tunis with contact, three scored rows in Sfax
	// with no contact, and one row too sparse to score: one region cell at the
	// floor of 20, several below it, and a row that contributes no index.
	const rows: Array<{ answers: Record<string, unknown> }> = [];
	for (let i = 0; i < 20; i++) {
		const t = 4 + (i % 5);
		const g = 3 + (i % 4);
		rows.push({
			answers: {
				pti_t1: t,
				pti_t2: t,
				pti_t3: t,
				pti_t4: t,
				pti_t5: t,
				pti_g1: g,
				pti_g2: g,
				pti_g3: g,
				pti_g4: g,
				pti_g5: g,
				pti_e1: 'yes',
				pti_e3: 5,
				pti_e4: ['none'],
				pti_e5: ['none'],
				demo_governorate: 'tunis'
			}
		});
	}
	for (let i = 0; i < 3; i++) {
		rows.push({
			answers: {
				pti_t1: 5,
				pti_t2: 5,
				pti_t3: 5,
				pti_t4: 5,
				pti_t5: 5,
				pti_g1: 5,
				pti_g2: 5,
				pti_g3: 5,
				pti_g4: 5,
				pti_g5: 5,
				pti_e1: 'no',
				demo_governorate: 'sfax'
			}
		});
	}
	rows.push({
		answers: {
			pti_t1: 5,
			pti_t2: 5,
			pti_g1: 5,
			pti_g2: 5,
			pti_g3: 5,
			pti_g4: 5,
			pti_g5: 5,
			pti_e1: 'yes',
			demo_governorate: 'tunis'
		}
	});

	const first = aggregateResponses(spec, rows, { seed: 20261007, resamples: 2000 });
	const second = aggregateResponses(spec, rows, { seed: 20261007, resamples: 2000 });

	ok('n counts scored rows, n_total every row', first.n === 23 && first.n_total === 24, `${first.n}/${first.n_total}`);
	ok('the same seed returns the same aggregate', JSON.stringify(first) === JSON.stringify(second));
	ok(
		'the CI brackets the mean',
		first.index.mean !== null &&
			first.index.ci95[0] !== null &&
			first.index.ci95[1] !== null &&
			first.index.ci95[0] <= first.index.mean &&
			first.index.mean <= first.index.ci95[1],
		String(first.index.ci95)
	);
	ok(
		'components carry T, G and H with their own counts',
		first.components.T?.n === 23 && first.components.G?.n === 24 && first.components.H?.n === 20,
		`T ${first.components.T?.n}, G ${first.components.G?.n}, H ${first.components.H?.n}`
	);
	ok(
		'bands count every scored row',
		Object.values(first.bands).reduce((sum, count) => sum + count, 0) === first.n
	);
	ok(
		'the plane holds every scored row',
		first.plane.flat().reduce((sum, count) => sum + count, 0) === first.n
	);
	ok(
		'a scale histogram plus its skips is every row',
		(first.items.pti_t3.histogram ?? []).reduce((sum, count) => sum + count, 0) +
			first.items.pti_t3.skipped ===
			first.n_total
	);
	ok(
		'a count item tallies its options',
		first.items.pti_e4.counts?.none === 20 && first.items.pti_e4.skipped === 4
	);
	ok(
		'a region cell at the floor is shown',
		first.splits.regions.grand_tunis.n === 20 && first.splits.regions.grand_tunis.suppressed === false
	);
	ok(
		'a region cell below the floor is suppressed and hides n',
		first.splits.regions.centre_east.suppressed === true &&
			first.splits.regions.centre_east.n === null &&
			first.splits.regions.centre_east.mean === null
	);
	ok(
		'contact splits by the cases item',
		first.splits.contact.yes.n === 20 && first.splits.contact.no.suppressed === true
	);

	// With the instrument's display conditions, a respondent who had no contact
	// never saw the abuse checklist: counted as not shown, never as a skip.
	const conditions = { pti_e3: 'pti_e1 == yes', pti_e4: 'pti_e1 == yes' };
	const conditioned = aggregateResponses(spec, rows, { seed: 7, resamples: 200, conditions });
	const e4 = conditioned.items.pti_e4;
	const e4Total = Object.values(e4.counts ?? {}).reduce((a, b) => a + b, 0);
	ok(
		'an item hidden by its condition counts as not shown, not skipped',
		e4.not_shown > 0 && e4.skipped === first.items.pti_e4.skipped - e4.not_shown,
		JSON.stringify({ skipped: e4.skipped, not_shown: e4.not_shown })
	);
	ok(
		'answered, skipped and not shown together cover every row',
		e4Total + e4.skipped + e4.not_shown === conditioned.n_total,
		`${e4Total} + ${e4.skipped} + ${e4.not_shown} vs ${conditioned.n_total}`
	);
	ok(
		'report-only items are distributed but never scored',
		Array.isArray(conditioned.items.pti_c1?.histogram) &&
			!spec.components.some((c: { items?: string[]; item?: string }) =>
				(c.items ?? []).includes('pti_c1') || c.item === 'pti_c1'
			)
	);
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
