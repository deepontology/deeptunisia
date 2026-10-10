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
	aggregateSeries,
	applyExclusions,
	applyPublicationFloor,
	linkCheck,
	localLevelFilter,
	periodOf,
	periodsBetween,
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
	required?: boolean;
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
	ok('the spec declares the expected components', componentIds === 'D,G,H,H_contact,S,S_contact,S_good,S_handled,S_seen,S_treat,S_view,T,V', componentIds);
	ok('the plane is (T, G)', spec.plane.x === 'T' && spec.plane.y === 'G');
	ok(
		'the index reads T, S, G and H, with G and H against it',
		spec.index.parts.map((part) => `${part.ref}${part.invert ? '-' : '+'}${part.weight}`).join(' ') === 'T+1 S+1 G-1 H-1'
	);
}

// ---------------------------------------------------------------------------
// The anchors: the answers the anchor values imply, scored back
// ---------------------------------------------------------------------------

console.log('\n  ── anchors ──\n');

{
	// Guardian (index-spec.md §4): T = 1 means every T item 10; S = 1 means S1-S3
	// at 10, the reverse-keyed S4 at 0 and at least two good moments (no contact,
	// so there is no contact part); G = 0 means every G item 0 except the
	// reverse-keyed G2, which is 10; H = 0 with no contact and an E5 of "none",
	// so V = 0.
	const guardian = scoreResponse(spec, {
		pti_t1: 10,
		pti_t2: 10,
		pti_t3: 10,
		pti_t4: 10,
		pti_t5: 10,
		pti_s1: 10,
		pti_s2: 10,
		pti_s3: 10,
		pti_s4: 0,
		pti_s6: ['helped', 'respectful'],
		pti_g1: 0,
		pti_g2: 10,
		pti_g3: 0,
		pti_g4: 0,
		pti_g6: 0,
		pti_g5: 0,
		pti_e1: 'no',
		pti_e5: ['none']
	});
	ok('guardian: T = 1', guardian.components.T === 1);
	ok('guardian: S = 1', guardian.components.S === 1);
	ok('guardian: G = 0', guardian.components.G === 0);
	ok('guardian: H = 0', guardian.components.H === 0);
	ok('guardian: I = 100', Math.abs((guardian.index ?? NaN) - 100) < 1e-9, String(guardian.index));
	ok('guardian: band = guardian', guardian.band === 'guardian');
	ok(
		'guardian: scoreResponse reproduces the anchor record',
		spec.anchors.guardian.I === 100 &&
			guardian.components.T === spec.anchors.guardian.T &&
			guardian.components.S === spec.anchors.guardian.S &&
			guardian.components.G === spec.anchors.guardian.G &&
			guardian.components.H === spec.anchors.guardian.H
	);

	// Police state: T = 0 means every T item 0; S = 0 means S1-S3 at 0, S4 at
	// 10, a contact treated 0 and handled 0, and no good moment; G = 1 means
	// every G item 10 except G2 = 0; H = 1 with contact, three abuses in E4 and
	// three in E5.
	const policeState = scoreResponse(spec, {
		pti_t1: 0,
		pti_t2: 0,
		pti_t3: 0,
		pti_t4: 0,
		pti_t5: 0,
		pti_s1: 0,
		pti_s2: 0,
		pti_s3: 0,
		pti_s4: 10,
		pti_s5: 0,
		pti_s6: ['none'],
		pti_g1: 10,
		pti_g2: 0,
		pti_g3: 10,
		pti_g4: 10,
		pti_g6: 10,
		pti_g5: 10,
		pti_e1: 'yes',
		pti_e3: 0,
		pti_e4: ['money', 'insult', 'threat'],
		pti_e5: ['money', 'insult', 'threat']
	});
	ok('police state: T = 0', policeState.components.T === 0);
	ok('police state: S = 0', policeState.components.S === 0);
	ok('police state: G = 1', policeState.components.G === 1);
	ok('police state: H = 1', policeState.components.H === 1);
	ok('police state: I = 0', Math.abs((policeState.index ?? NaN) - 0) < 1e-9, String(policeState.index));
	ok('police state: band = police_state', policeState.band === 'police_state');
	ok(
		'police state: scoreResponse reproduces the anchor record',
		spec.anchors.police_state.I === 0 &&
			policeState.components.T === spec.anchors.police_state.T &&
			policeState.components.S === spec.anchors.police_state.S &&
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
	// G: g1 = 4, g2 = 6 (reverse), g3 = 2, g4 = 3, g6 = 3, g5 = 4 (all six)
	//    G = (4/10 + (1 - 6/10) + 2/10 + 3/10 + 3/10 + 4/10) / 6 = 2/6 = 1/3
	// S: s1 = 6, s2 = 4, s3 = 5 (3 of 4 answered)
	//    S_view    = (0.6 + 0.4 + 0.5) / 3 = 0.5
	//    contact, E3 = 3, S5 = 5
	//    S_contact = (0.3 + 0.5) / 2 = 0.4
	//    S_good    = 1/2 (one good moment, saturating at two)
	//    S         = (3 * 0.5 + 2 * 0.4 + 1 * 0.5) / 6 = 7/15
	// H: contact, E4 = [money, insult], E5 = [threat]
	//    D = 2/3 (two abuses), V = 1/3
	//    H = (2 * 2/3 + 1/3) / 3 = 5/9
	// I = 100 * (0.7 + 7/15 + (1 - 1/3) + (1 - 5/9)) / 4
	//   = 100 * (63/90 + 42/90 + 60/90 + 40/90) / 4 = 100 * 205/360 = 1025/18
	const mixed = scoreResponse(spec, {
		pti_t1: 8,
		pti_t2: 6,
		pti_t3: 7,
		pti_s1: 6,
		pti_s2: 4,
		pti_s3: 5,
		pti_s5: 5,
		pti_s6: ['respectful'],
		pti_g1: 4,
		pti_g2: 6,
		pti_g3: 2,
		pti_g4: 3,
		pti_g6: 3,
		pti_g5: 4,
		pti_e1: 'yes',
		pti_e3: 3,
		pti_e4: ['money', 'insult'],
		pti_e5: ['threat']
	});
	ok('mixed: T = 0.7', Math.abs((mixed.components.T ?? NaN) - 0.7) < 1e-9);
	ok('mixed: G = 1/3', Math.abs((mixed.components.G ?? NaN) - 1 / 3) < 1e-9);
	ok('mixed: S = 7/15', Math.abs((mixed.components.S ?? NaN) - 7 / 15) < 1e-9);
	ok('mixed: S_contact = 0.4', Math.abs((mixed.components.S_contact ?? NaN) - 0.4) < 1e-9);
	ok('mixed: H = 5/9', Math.abs((mixed.components.H ?? NaN) - 5 / 9) < 1e-9);
	ok('mixed: D = 2/3, treatment no longer counts as harm', Math.abs((mixed.components.D ?? NaN) - 2 / 3) < 1e-9);
	ok('mixed: I = 1025/18', Math.abs((mixed.index ?? NaN) - 1025 / 18) < 1e-9, String(mixed.index));
	const threeGrip = scoreResponse(spec, { pti_t1: 5, pti_t2: 5, pti_t3: 5, pti_g1: 4, pti_g2: 6, pti_g3: 2 });
	ok('grip needs four of its six answers', threeGrip.components.G === null && threeGrip.index === null);
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
	ok('missing H and S: the index renormalises over T and G', Math.abs((noHarm.index ?? NaN) - 50) < 1e-9);
}

// ---------------------------------------------------------------------------
// Service: the view, the contact, and good moments
// ---------------------------------------------------------------------------

console.log('\n  ── service ──\n');

{
	const view = { pti_s1: 8, pti_s2: 8, pti_s3: 8, pti_s4: 2 };

	// No contact: no contact part, so S = (3 * view + good) / 4.
	const noContact = scoreResponse(spec, { ...view, pti_e1: 'no', pti_s6: ['none'] });
	ok('no contact: S_contact is missing', noContact.components.S_contact === null);
	ok('no contact, no good moment: S = 3 * 0.8 / 4 = 0.6', Math.abs((noContact.components.S ?? NaN) - 0.6) < 1e-9);

	// A good moment raises S and leaves H alone.
	const base = { ...view, pti_e1: 'yes', pti_e3: 5, pti_s5: 5, pti_e4: ['insult'], pti_e5: ['none'] };
	const without = scoreResponse(spec, { ...base, pti_s6: ['none'] });
	const withGood = scoreResponse(spec, { ...base, pti_s6: ['helped', 'came_quickly'] });
	ok('good moments raise S', (withGood.components.S ?? 0) > (without.components.S ?? 1));
	ok('good moments do not offset harm', withGood.components.H === without.components.H && withGood.components.H !== null);
	ok('two good moments saturate', withGood.components.S_good === 1);

	// A treatment answer left over after contact was changed to "no" is not read.
	const stale = scoreResponse(spec, { ...view, pti_e1: 'no', pti_e3: 0, pti_s5: 0 });
	ok('contact answers count only with contact', stale.components.S_contact === null);

	// Two of four view items is below min_answered: S is missing, even with good
	// moments ticked, and the index renormalises without it.
	const thin = scoreResponse(spec, { pti_s1: 9, pti_s2: 9, pti_s6: ['helped', 'respectful'] });
	ok('2 of 4 view items: S is missing', thin.components.S === null);

	// S4 (asking for money or favours) is keyed against the job.
	const honest = scoreResponse(spec, { pti_s1: 5, pti_s2: 5, pti_s3: 5, pti_s4: 0 });
	const corrupt = scoreResponse(spec, { pti_s1: 5, pti_s2: 5, pti_s3: 5, pti_s4: 10 });
	ok('S4 is reverse-keyed', (honest.components.S_view ?? 0) > (corrupt.components.S_view ?? 1));
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
	const cycleTarget = withCycle.components.find((component) => component.id === 'H_contact') as BlendComponent;
	cycleTarget.parts[0] = { ref: 'H', weight: 1 };
	const cycleViolations = validateScoringSpec(withCycle, itemIds, itemMeta);
	ok('a reference cycle is reported', has(cycleViolations, 'cycle'), cycleViolations.join('; '));

	const withUnknownRef = structuredClone(spec);
	const unknownTarget = withUnknownRef.components.find((component) => component.id === 'H_contact') as BlendComponent;
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
		(component) => component.id === 'D'
	) as CountComponent;
	responseTarget.item = 'pti_e3';
	const responseViolations = validateScoringSpec(withWrongResponse, itemIds, itemMeta);
	ok(
		'a count on a scale item is reported',
		has(responseViolations, 'expected "multi_choice"'),
		responseViolations.join('; ')
	);

	const withBadIgnore = structuredClone(spec);
	const ignoreTarget = withBadIgnore.components.find((component) => component.id === 'D') as CountComponent;
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

	const withBadSeries = structuredClone(spec);
	withBadSeries.series = { ...withBadSeries.series!, process_sd: 0, min_month_n: 1 };
	const seriesViolations = validateScoringSpec(withBadSeries, itemIds, itemMeta);
	ok(
		'a series with no drift or a one-person month floor is reported',
		has(seriesViolations, 'process_sd') && has(seriesViolations, 'min_month_n'),
		seriesViolations.join('; ')
	);
	const withRegionTwice = structuredClone(spec);
	withRegionTwice.regions!.groups.north_east = [...withRegionTwice.regions!.groups.north_east, 'tunis'];
	const regionViolations = validateScoringSpec(withRegionTwice, itemIds, itemMeta);
	ok(
		'an option in two region groups is reported',
		has(regionViolations, 'sits in both region groups'),
		regionViolations.join('; ')
	);
	const withoutRegions = structuredClone(spec);
	delete withoutRegions.regions;
	ok('a spec with no regional split is valid', validateScoringSpec(withoutRegions, itemIds, itemMeta).length === 0);
	ok(
		'the only question about the respondent is the optional governorate',
		[...itemIds].filter((id) => id.startsWith('demo_')).join() === 'demo_governorate' &&
			document.items.find((item) => item.id === 'demo_governorate')?.required === false
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
		pti_s1: 5,
		pti_s2: 5,
		pti_s3: 5,
		pti_s4: 5,
		pti_g1: 5,
		pti_g2: 5,
		pti_g3: 5,
		pti_g4: 5,
		pti_g6: 5,
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

	// The published rule is "the same answer on all fifteen": fourteen
	// identical answers and one skip is not a straight line, and the row is kept.
	const ten = { ...flat, pti_g5: null };
	const boundary = applyExclusions(spec, [{ answers: ten, completionMs: 120_000 }]);
	ok('fourteen identical answers and a skip are not straight-lining', boundary.kept.length === 1, JSON.stringify(boundary.exclusions.rules));
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
				pti_e5: ['none']
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
				pti_e1: 'no'
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
			pti_e1: 'yes'
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
		'a scale answered is the histogram total',
		first.items.pti_t3.answered === (first.items.pti_t3.histogram ?? []).reduce((sum, count) => sum + count, 0),
		String(first.items.pti_t3.answered)
	);
	ok(
		'a count item tallies its options',
		first.items.pti_e4.counts?.none === 20 && first.items.pti_e4.skipped === 4
	);
	ok(
		'a contact cell at the floor is shown',
		first.splits.contact.yes.n === 20 && first.splits.contact.yes.suppressed === false
	);
	ok(
		'a contact cell below the floor is suppressed and hides n',
		first.splits.contact.no.suppressed === true &&
			first.splits.contact.no.n === null &&
			first.splits.contact.no.mean === null
	);
	ok(
		'nobody answered the optional region, so every region cell is suppressed',
		Object.values(first.splits.regions ?? {}).every((cell) => cell.suppressed && cell.n === null)
	);
	const withRegion = rows.map((row, i) => ({ answers: { ...row.answers, ...(i < 20 ? { demo_governorate: i % 2 ? 'tunis' : 'ariana' } : {}) } }));
	const regional = aggregateResponses(spec, withRegion, { seed: 1, resamples: 50 });
	ok(
		'governorates are counted only as their region, shown once it reaches the floor',
		regional.splits.regions?.grand_tunis.n === 20 && regional.splits.regions?.centre_east.suppressed === true
	);
	ok('the index carries its SD', first.index.sd !== null && first.index.sd > 0, String(first.index.sd));

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
	// The multi-choice share denominator counts people, not ticks: one person who
	// ticks two options is one respondent, so `answered` stays below the sum of the
	// counts. A share taken against the total instead would understate every option.
	const multi = aggregateResponses(
		spec,
		[
			{ answers: { pti_e1: 'yes', pti_e4: ['money', 'insult'] } },
			{ answers: { pti_e1: 'yes', pti_e4: ['threat'] } },
			{ answers: { pti_e1: 'yes' } },
			{ answers: { pti_e1: 'no' } }
		],
		{ seed: 1, resamples: 50, conditions: { pti_e4: 'pti_e1 == yes' } }
	);
	const multiE4 = multi.items.pti_e4;
	const multiTicks = Object.values(multiE4.counts ?? {}).reduce((a, b) => a + b, 0);
	ok(
		'a count answered is people, not ticks',
		multiE4.answered === 2 && multiTicks === 3,
		`answered ${multiE4.answered}, ticks ${multiTicks}`
	);
	ok(
		'answered, skipped and not shown cover every row for the counts too',
		multiE4.answered + multiE4.skipped + multiE4.not_shown === multi.n_total,
		`${multiE4.answered} + ${multiE4.skipped} + ${multiE4.not_shown} vs ${multi.n_total}`
	);
	ok(
		'report-only items are distributed but never scored',
		Array.isArray(conditioned.items.pti_c1?.histogram) &&
			!spec.components.some((c: { items?: string[]; item?: string }) =>
				(c.items ?? []).includes('pti_c1') || c.item === 'pti_c1'
			)
	);
}

// ---------------------------------------------------------------------------
// The link check: one shared link driving the window, and never its code
// ---------------------------------------------------------------------------

console.log('\n  ── the link check ──\n');

{
	// A scored row with the channel it arrived from. T is the mean of five items
	// at t; G is six items at 5, so the reverse-keyed G2 keeps it at 5; there is
	// no contact, so S is missing, H is V = 0, and
	// I = 100 · (t/10 + 0.5 + 1) / 3.
	const row = (t: number, channel?: string) => ({
		answers: {
			pti_t1: t, pti_t2: t, pti_t3: t, pti_t4: t, pti_t5: t,
			pti_g1: 5, pti_g2: 5, pti_g3: 5, pti_g4: 5, pti_g6: 5, pti_g5: 5,
			pti_e1: 'no', pti_e5: ['none']
		},
		channel
	});
	const options = { seed: 20261007, resamples: 200 };

	// No link rows: nothing arrived through a shared link, so there is no
	// largest one and no index to remove.
	const organic = Array.from({ length: 12 }, () => row(8, 'organic'));
	const none = linkCheck(spec, organic, options);
	ok('no link rows: both shares are zero', none.linked_share === 0 && none.largest_link_share === 0);
	ok('no link rows: there is no index without one', none.index_without_largest === null);

	// A floor low enough to publish a figure from what would remain: ten
	// answers direct, twenty through one link and five through another, all of
	// the linked ones at the same trust. The floor is the spec's own
	// first_figure_n, lowered here so the check can be read on 35 rows.
	const lowFloor = structuredClone(spec);
	lowFloor.series = { ...lowFloor.series!, first_figure_n: 10 };
	const rows = [
		...Array.from({ length: 10 }, () => row(8, 'organic')),
		...Array.from({ length: 20 }, () => row(2, 'wave')),
		...Array.from({ length: 5 }, () => row(2, 'clip'))
	];
	const check = linkCheck(lowFloor, rows, options);
	ok(
		'the linked share counts every answer that came through a link',
		Math.abs(check.linked_share - 25 / 35) < 1e-12,
		String(check.linked_share)
	);
	ok(
		'the largest link share counts that link alone, not the links together',
		Math.abs(check.largest_link_share - 20 / 35) < 1e-12,
		String(check.largest_link_share)
	);
	const withoutWave = aggregateResponses(lowFloor, rows.filter((r) => r.channel !== 'wave'), options).index.mean;
	ok(
		'the index without the largest link is the aggregate over the rows that remain',
		check.index_without_largest === withoutWave,
		String(check.index_without_largest)
	);
	ok(
		'and it sits above the window mean: the link was holding the index down',
		(check.index_without_largest ?? 0) > (aggregateResponses(lowFloor, rows, options).index.mean ?? 1),
		`${check.index_without_largest} vs ${aggregateResponses(lowFloor, rows, options).index.mean}`
	);
	ok(
		'the check returns three shares and nothing else',
		Object.keys(check).join() === 'linked_share,largest_link_share,index_without_largest',
		Object.keys(check).join()
	);
	ok(
		'no channel name appears anywhere in the returned object',
		!JSON.stringify(check).includes('wave') && !JSON.stringify(check).includes('clip'),
		JSON.stringify(check)
	);

	// At the instrument's own floor of 100, removing 25 of 35 rows leaves fewer
	// than first_figure_n behind, so no figure is published from what is left.
	const floored = linkCheck(spec, rows, options);
	ok(
		'a removal that would leave fewer than first_figure_n rows publishes no figure',
		floored.index_without_largest === null,
		String(floored.index_without_largest)
	);
	ok(
		'the shares still come back: the publication floor decides what leaves',
		floored.linked_share === check.linked_share && floored.largest_link_share === check.largest_link_share
	);

	// A row stored with no channel is a direct arrival, exactly as the writer
	// stores one.
	const unchannelled = rows.map((r) => ({ answers: r.answers }));
	ok('a row with no channel counts as organic', linkCheck(lowFloor, unchannelled, options).linked_share === 0);

	// The link itself has to be big enough to describe. A counterfactual read
	// beside the window mean would give away the mean of the answers it removed,
	// so a link under the cell floor (20 here) publishes no figure at all: thirty
	// direct answers would still be plenty to compute one from.
	const atCellFloor = (size: number) =>
		linkCheck(
			lowFloor,
			[
				...Array.from({ length: 30 }, () => row(8, 'organic')),
				...Array.from({ length: size }, () => row(2, 'wave'))
			],
			options
		);
	const belowCellFloor = atCellFloor((spec.cell_floor ?? 20) - 1);
	ok(
		'a largest link under the cell floor publishes no counterfactual',
		belowCellFloor.index_without_largest === null,
		`${belowCellFloor.largest_link_share} of the window, cell floor ${spec.cell_floor}`
	);
	ok(
		'but its shares are still published',
		belowCellFloor.linked_share === 19 / 49 && belowCellFloor.largest_link_share === 19 / 49
	);
	ok(
		'a largest link at the cell floor publishes one',
		atCellFloor(spec.cell_floor ?? 20).index_without_largest !== null,
		String(atCellFloor(spec.cell_floor ?? 20).index_without_largest)
	);

	// The window's own check, and the floor that decides what leaves the server.
	const dated = rows.map((r, i) => ({ ...r, submittedAt: Date.UTC(2027, 0, 2) + i }));
	const now = Date.UTC(2027, 0, 3);
	const lowSeries = aggregateSeries(lowFloor, dated, { ...options, now });
	ok(
		'the window carries the link check over its own rows',
		lowSeries?.window?.links.linked_share === check.linked_share,
		String(lowSeries?.window?.links.linked_share)
	);
	const lowPublished = applyPublicationFloor(
		lowFloor,
		aggregateResponses(lowFloor, dated, options),
		lowSeries!
	);
	ok(
		'the window publishes the link check beside its own figures',
		lowPublished.series?.window?.links !== null && lowPublished.series?.window?.results !== null
	);
	const highSeries = aggregateSeries(spec, dated, { ...options, now });
	const highPublished = applyPublicationFloor(spec, aggregateResponses(spec, dated, options), highSeries!);
	ok(
		'below the window floor the link check is withheld with the figures',
		highPublished.series?.window?.links === null && highPublished.series?.window?.results === null,
		JSON.stringify(highPublished.series?.window?.links)
	);
}

// ---------------------------------------------------------------------------
// The monthly series
// ---------------------------------------------------------------------------
{
	console.log('\n  ── monthly series ──\n');

	// The filter, by hand: 50 then 60, each with variance 4, drift SD 2.5.
	// Predicted variance 4 + 6.25 = 10.25, gain 10.25 / 14.25.
	const two = localLevelFilter(
		[
			{ mean: 50, variance: 4 },
			{ mean: 60, variance: 4 }
		],
		2.5
	);
	const gain = 10.25 / 14.25;
	ok('the first observed month starts the series at its own mean', two[0].level === 50 && two[0].gain === 1);
	ok(
		'the next month moves by its gain toward its own mean',
		Math.abs((two[1].level ?? 0) - (50 + gain * 10)) < 1e-9 && Math.abs((two[1].gain ?? 0) - gain) < 1e-9,
		`${two[1].level} gain ${two[1].gain}`
	);
	ok('the filtered variance shrinks below the prediction', Math.abs((two[1].variance ?? 0) - (1 - gain) * 10.25) < 1e-9);

	// The point of the filter: a big month moves the index further than a small one.
	const big = localLevelFilter([{ mean: 50, variance: 0.4 }, { mean: 60, variance: 0.4 }], 2.5)[1];
	const small = localLevelFilter([{ mean: 50, variance: 0.4 }, { mean: 60, variance: 2 }], 2.5)[1];
	ok(
		'a month of 1,000 answers counts for more than a month of 200',
		(big.gain ?? 0) > (small.gain ?? 0) && (big.level ?? 0) > (small.level ?? 0),
		`gain ${big.gain?.toFixed(3)} vs ${small.gain?.toFixed(3)}`
	);

	const gap = localLevelFilter(
		[
			{ mean: null, variance: null },
			{ mean: 40, variance: 1 },
			{ mean: null, variance: null },
			{ mean: 44, variance: 1 }
		],
		2.5
	);
	ok('months before the first observation have no level', gap[0].level === null && gap[0].gain === null);
	ok(
		'an unobserved month carries the level and widens its uncertainty',
		gap[2].level === 40 && gap[2].gain === null && Math.abs((gap[2].variance ?? 0) - (1 + 6.25)) < 1e-9
	);
	ok('the level is clamped to the index range', localLevelFilter([{ mean: 104, variance: 1 }], 2.5)[0].level === 100);

	ok(
		'months are drawn in Tunisia time: 23:30 UTC on 31 October is November',
		periodOf(Date.UTC(2026, 9, 31, 23, 30), 60) === '2026-11' && periodOf(Date.UTC(2026, 9, 31, 22, 30), 60) === '2026-10'
	);
	ok(
		'the month list crosses a year and keeps every month',
		periodsBetween('2026-11', '2027-02').join() === '2026-11,2026-12,2027-01,2027-02'
	);

	// A series from rows: two closed months and the current one. November is
	// big, December is below the month floor, January is the month in progress.
	const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
	const answersFor = (t: number, g: number) => ({
		pti_t1: t, pti_t2: t, pti_t3: t, pti_t4: t, pti_t5: t,
		pti_g1: g, pti_g2: 10 - g, pti_g3: g, pti_g4: g, pti_g5: g,
		pti_e1: 'no', pti_e5: ['none']
	});
	const seriesRows = [
		...Array.from({ length: 60 }, (_, i) => ({ submittedAt: at(2026, 11, 1 + (i % 28)), answers: answersFor(3 + (i % 3), 6 + (i % 3)) })),
		...Array.from({ length: 10 }, (_, i) => ({ submittedAt: at(2026, 12, 1 + i), answers: answersFor(8, 2) })),
		...Array.from({ length: 40 }, (_, i) => ({ submittedAt: at(2027, 1, 1 + (i % 9)), answers: answersFor(5 + (i % 2), 5) }))
	];
	const now = at(2027, 1, 10);
	const series = aggregateSeries(spec, seriesRows, { seed: 1, resamples: 200, now, firstPeriod: '2026-10' });
	ok('a spec with a series block aggregates a series', series !== null);
	if (series) {
		const months = series.months;
		ok(
			'the series runs from the first fielding month to this one, empty months included',
			months.map((m) => m.period).join() === '2026-10,2026-11,2026-12,2027-01',
			months.map((m) => m.period).join()
		);
		ok('past months are closed and this one is provisional', months.map((m) => m.closed).join() === 'true,true,true,false');
		ok('a month before any answer has no level', months[0].index.level === null);
		ok(
			'the first observed month publishes its own mean',
			months[1].results.n === 60 && Math.abs((months[1].index.level ?? 0) - (months[1].results.index.mean ?? -1)) < 1e-9
		);
		ok(
			'a month under the floor carries the level forward, its own figures still shown',
			months[2].results.n === 10 && months[2].index.gain === null && months[2].index.level === months[1].index.level
		);
		ok(
			'the current month is filtered on what has arrived so far',
			months[3].results.n === 40 && months[3].index.gain !== null && months[3].index.gain < 1
		);
		ok(
			'each month carries a band and an interval around its level',
			months.slice(1).every(
				(m) => m.index.band !== null && m.index.ci95[0]! <= m.index.level! && m.index.level! <= m.index.ci95[1]!
			)
		);
		const later = aggregateSeries(spec, [...seriesRows, { submittedAt: at(2027, 1, 9), answers: answersFor(10, 0) }], {
			seed: 1, resamples: 200, now, firstPeriod: '2026-10'
		});
		ok(
			'a new answer this month never changes a closed month',
			JSON.stringify(later?.months.slice(0, 3)) === JSON.stringify(months.slice(0, 3))
		);
		const future = aggregateSeries(spec, [{ submittedAt: at(2027, 3, 1), answers: answersFor(5, 5) }], {
			seed: 1, resamples: 50, now, firstPeriod: '2027-01'
		});
		ok('a row dated after now is not counted', future?.months.length === 1 && future.months[0].results.n_total === 0);
	}
	// The rolling window: a 2-month window on 10 January 2027 holds December
	// and January, and leaves November out.
	const windowed = structuredClone(spec);
	windowed.series = { ...windowed.series!, window_months: 2 };
	const w = aggregateSeries(windowed, seriesRows, { seed: 1, resamples: 50, now, firstPeriod: '2026-10' })?.window;
	ok(
		'the window runs back window_months from this month',
		w?.first === '2026-12' && w?.last === '2027-01' && w?.months === 2,
		`${w?.first}..${w?.last}`
	);
	ok('the window pools every kept answer inside it, counted equally', w?.results.n_total === 50, String(w?.results.n_total));
	const wide = structuredClone(spec);
	wide.series = { ...wide.series!, window_months: 12 };
	ok(
		'a window longer than the series holds everything so far',
		aggregateSeries(wide, seriesRows, { seed: 1, resamples: 50, now })?.window?.results.n_total === seriesRows.length
	);
	const noWindow = structuredClone(spec);
	delete noWindow.series!.window_months;
	ok('a series without window_months has no window', aggregateSeries(noWindow, seriesRows, { seed: 1, resamples: 50, now })?.window === null);
	const badWindow = structuredClone(spec);
	badWindow.series = { ...badWindow.series!, window_months: 0 };
	ok(
		'a window of zero months is reported',
		validateScoringSpec(badWindow, itemIds, itemMeta).some((v) => v.includes('window_months'))
	);

	// The publication floor: below first_figure_n only counts leave.
	const floored = structuredClone(spec);
	floored.series = { ...floored.series!, first_figure_n: 200 };
	const full = aggregateSeries(floored, seriesRows, { seed: 1, resamples: 50, now, firstPeriod: '2026-10' });
	const allRows = aggregateResponses(floored, seriesRows, { seed: 1, resamples: 50 });
	const below = applyPublicationFloor(floored, allRows, full);
	ok(
		'below the first-figure floor nothing computed is published',
		below.floor.reached === false &&
			below.results === null &&
			below.series!.months.every((m) => m.results === null && m.index.level === null)
	);
	ok('but every month keeps its count', below.series!.months.map((m) => m.n).join() === '0,60,10,40');
	floored.series.first_figure_n = 100;
	const above = applyPublicationFloor(floored, allRows, full);
	ok('at the floor the figures are published', above.floor.reached === true && above.results?.n === allRows.n);
	ok(
		'a month under min_month_n keeps its level but not its own figures',
		above.series!.months[2].n === 10 && above.series!.months[2].results === null && above.series!.months[2].index.level !== null
	);
	ok('a month over it publishes its own figures', above.series!.months[1].results?.n === 60);
	const badFloor = structuredClone(spec);
	badFloor.series = { ...badFloor.series!, first_figure_n: 0 };
	ok('a first-figure floor of zero is reported', validateScoringSpec(badFloor, itemIds, itemMeta).some((v) => v.includes('first_figure_n')));

	const noSeries = structuredClone(spec);
	delete noSeries.series;
	ok('a spec without a series block returns none', aggregateSeries(noSeries, seriesRows, { seed: 1, resamples: 10, now }) === null);
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
