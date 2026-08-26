/**
 * Validator-invariant tests on the pure surface (schema.ts + dates.ts).
 *
 * WHY THIS FILE EXISTS — mutation testing
 * ---------------------------------------
 * `test-data.ts` asserts over the *emitted graph*: it reads the built dataset
 * and checks the interface's advertised claims are true of it. That suite
 * cannot see a validator that was weakened, because the real dataset is clean —
 * every record satisfies every invariant, so a check that stopped checking
 * changes nothing about the output. A mutation that removes "an inferred claim
 * must carry reasoning" survives a suite of graph assertions, and the first
 * mutation run showed exactly that: a 25% kill rate, with the survivors latent
 * on a clean graph.
 *
 * This file closes that gap by testing the validator INVARIANTS directly, with
 * synthetic inputs — both negative fixtures (data the validator must reject)
 * and positive ones (data it must accept, and derivations it must produce).
 * The schemas and date machinery are pure modules; they are imported here
 * without running the build. A mutation that weakens any of these checks fails
 * here even though the real graph is clean.
 *
 * Every block names the validator (V-number) it pins and, where relevant, the
 * mutation class it exists to kill (m-ids from scripts/mutation-test.ts).
 */
import {
	PositionSchema,
	RelationshipSchema,
	CompanySchema,
	DisputeSchema,
	ReviewSchema,
	reviewOverclaims
} from './schema.ts';
import {
	parseDateEdge,
	resolveInterval,
	certainlyActive,
	possiblyActive,
	durationYears,
	DATASET_CUTOFF,
	DATASET_FLOOR
} from './dates.ts';

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

function accepts(schema: { safeParse(input: unknown): { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, input: unknown, name: string) {
	const r = schema.safeParse(input);
	ok(name, r.success, r.success ? 'accepted' : r.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
}

function rejects(schema: { safeParse(input: unknown): { success: boolean } }, input: unknown, name: string) {
	const r = schema.safeParse(input);
	ok(name, !r.success, r.success ? 'accepted — expected rejection' : 'rejected');
}

function throws(fn: () => unknown, name: string, detail = '') {
	try {
		fn();
		ok(name, false, detail || 'did not throw');
	} catch {
		ok(name, true, detail);
	}
}

// ---------------------------------------------------------------------------
// Fixture builders — minimal VALID records per kind. Referential integrity is
// build-data's job; the schema only cares about shape and the claim envelope.
// ---------------------------------------------------------------------------

const pos = (over: Record<string, unknown> = {}) => ({
	id: 'p-fixture',
	role: 'r-fixture',
	holder: 'h-fixture',
	start: '2018-06-01',
	end: '2020-06-01',
	confidence: 'A',
	verification: 'verified',
	sources: ['s-fixture'],
	...over
});

const rel = (over: Record<string, unknown> = {}) => ({
	id: 'rel-fixture',
	from: 'a-entity',
	to: 'b-entity',
	type: 'family',
	description: 'fixture edge between two fixture entities',
	confidence: 'A',
	sources: ['s-fixture'],
	...over
});

const co = (over: Record<string, unknown> = {}) => ({
	id: 'co-fixture',
	sources: ['s-fixture'],
	...over
});

// ---------------------------------------------------------------------------
// V18/V20 — the claim envelope: C/D attribution, inferred completeness,
// unsubstantiated attribution, explicit-override semantics, source minimum.
// Kills m4, m5, m6, m7. The graph-level sweep exists in test-data; this pins
// the ENVELOPE itself, which clean data cannot distinguish from a disabled one.
// ---------------------------------------------------------------------------

// Positive controls — the envelope must not reject honest records.
accepts(PositionSchema, pos(), 'V18/20: a clean position parses');
accepts(PositionSchema, pos({ confidence: 'C', attributed_to: 'Some Observer' }), 'V18/20: grade C with attributed_to parses');
accepts(
	PositionSchema,
	pos({ confidence: 'C', verification: 'needs-primary-source', attributed_to: 'Some Observer', reasoning: 'r', falsifiable_by: 'f' }),
	'V18: a complete inferred claim parses'
);
accepts(
	PositionSchema,
	pos({ confidence: 'C', verification: 'needs-primary-source', basis: 'reported', attributed_to: 'Some Observer' }),
	'V18: explicit basis override exempts the inferred obligations (reported beats C/nps)'
);
accepts(
	PositionSchema,
	pos({ confidence: 'D', verification: 'disputed', basis: 'documented', attributed_to: 'Some Observer' }),
	'V18: explicit documented basis on D parses (override beats the D derivation)'
);

// Negative fixtures — the exact records the envelope exists to reject.
rejects(PositionSchema, pos({ confidence: 'C' }), 'V20: grade C without attributed_to is rejected');
rejects(PositionSchema, pos({ confidence: 'D' }), 'V20: grade D without attributed_to is rejected');
rejects(
	PositionSchema,
	pos({ confidence: 'C', verification: 'needs-primary-source', attributed_to: 'Some Observer' }),
	'V18: inferred claim without reasoning is rejected'
);
rejects(
	PositionSchema,
	pos({ confidence: 'C', verification: 'needs-primary-source', attributed_to: 'Some Observer', reasoning: 'r' }),
	'V18: inferred claim without a falsifier is rejected'
);
// The third refine (unsubstantiated attribution) is independently reachable only
// through an explicit `basis: 'unsubstantiated'` override on a non-C/D record:
// grade D trips the first refine too, so it cannot isolate this one.
rejects(
	PositionSchema,
	pos({ confidence: 'A', basis: 'unsubstantiated' }),
	'V18: an explicit unsubstantiated basis without attributed_to is rejected (m6)'
);
accepts(
	PositionSchema,
	pos({ confidence: 'A', basis: 'unsubstantiated', attributed_to: 'a circulating rumour' }),
	'V18: an explicit unsubstantiated basis with attributed_to parses'
);
rejects(PositionSchema, pos({ sources: [] }), 'V18: a position with zero sources is rejected');
accepts(PositionSchema, pos({ sources: ['s-fixture', 's-fixture-2'] }), 'V18: multiple sources parse');

// The v0.0.2 kinds compose the same envelope (spec §4) — prove it on one of them.
accepts(CompanySchema, co(), 'V18/20: a clean company record parses');
rejects(CompanySchema, co({ confidence: 'C' }), 'V20: company grade C without attributed_to is rejected');
rejects(
	CompanySchema,
	co({ confidence: 'C', verification: 'needs-primary-source', attributed_to: 'Some Observer' }),
	'V18: company inferred claim without reasoning is rejected'
);
rejects(CompanySchema, co({ sources: [] }), 'V18: a company with zero sources is rejected');

// ---------------------------------------------------------------------------
// V9/V13 — relationship-only invariants: allegations need a circulating source,
// influence metadata only on influence-family edges and always reasoned,
// finance metadata only on funding/sponsorship/ownership.
// ---------------------------------------------------------------------------

accepts(RelationshipSchema, rel(), 'V9: a clean family edge parses');
rejects(RelationshipSchema, rel({ type: 'allegation', sources: [] }), 'V9: an allegation without any source is rejected');
accepts(RelationshipSchema, rel({ type: 'allegation', sources: ['s-fixture'] }), 'V9: an allegation with a source parses');
rejects(
	RelationshipSchema,
	rel({ type: 'family', influence: { channel: 'appointment', strength: 0.5 }, reasoning: 'r' }),
	'V9: influence metadata on a non-influence edge is rejected'
);
rejects(
	RelationshipSchema,
	rel({ type: 'influence', influence: { channel: 'appointment', strength: 0.5 } }),
	'V9: an influence strength with no reasoning is rejected'
);
accepts(
	RelationshipSchema,
	rel({ type: 'influence', influence: { channel: 'appointment', strength: 0.5 }, reasoning: 'documented chain' }),
	'V9: a reasoned influence edge parses'
);
rejects(
	RelationshipSchema,
	rel({ type: 'family', finance: { amount: 100, currency: 'TND', year: 2020 } }),
	'V13: finance metadata on a non-funding edge is rejected'
);
accepts(
	RelationshipSchema,
	rel({ type: 'funding', finance: { amount: 100, currency: 'TND', year: 2020 } }),
	'V13: finance metadata on a funding edge parses'
);

// ---------------------------------------------------------------------------
// V23 — every review carries a calendar-valid ISO date and an enum method.
// Kills m8, m9, m10. Note the shape: the review DATE is not a dateToken; it is
// its own field, and its regex is format-only — "2026-02-31" matches the shape
// and is not a real day. The round-trip below (same technique as V21) is what
// makes "calendar-valid" true rather than aspirational.
// ---------------------------------------------------------------------------

const review = (over: Record<string, unknown> = {}) => ({ by: 'reviewer', date: '2026-07-26', method: 'source-check', ...over });
accepts(ReviewSchema, review(), 'V23: a well-formed review parses');
accepts(ReviewSchema, review({ method: 'dedup' }), 'V23: every enum method parses');
accepts(ReviewSchema, review({ date: '2026-02-28' }), 'V23: a leap-safe February date parses');
rejects(ReviewSchema, review({ date: '2026-02-31' }), 'V23: 2026-02-31 is rejected — not a real day (m10)');
rejects(ReviewSchema, review({ date: '2018-02-29' }), 'V23: 2018-02-29 is rejected — 2018 is not a leap year (m10)');
accepts(ReviewSchema, review({ date: '2020-02-29' }), 'V23: 2020-02-29 parses — leap year');
rejects(ReviewSchema, review({ method: 'guessed-it' }), 'V23: a free-text method is rejected (m8)');
rejects(ReviewSchema, review({ date: '26/07/2026' }), 'V23: a non-ISO date is rejected (m9)');
rejects(PositionSchema, pos({ review: review({ date: '2026-02-31' }) }), 'V23: a position carrying an impossible review date is rejected');

// ---------------------------------------------------------------------------
// V23 gate — the review guard on gazette claims (reviewOverclaims).
// Kills m11.
// ---------------------------------------------------------------------------

ok(
	'V23-guard: a gazette claim backed by a gazette source is fine',
	reviewOverclaims('checked directly against the JORT decree text', ['jort-2020-123']) === false
);
ok(
	'V23-guard: a gazette claim with no gazette source is flagged',
	reviewOverclaims('checked directly against the JORT decree text', ['tier3-article']) === true
);
ok(
	'V23-guard: an explicit "not verified against JORT" disclaimer is NOT a claim',
	reviewOverclaims('NOT verified against a JORT decree — corroborated in the press only', []) === false
);
ok(
	'V23-guard: a review that claims nothing about a gazette is fine',
	reviewOverclaims('reviewed the press coverage of the handover', ['tier3-article']) === false
);
ok('V23-guard: an undefined method is never a claim', reviewOverclaims(undefined, []) === false);

// ---------------------------------------------------------------------------
// R11 — dispute status is a closed enum. Kills m12.
// ---------------------------------------------------------------------------

accepts(DisputeSchema, { claim: 'a competing account of the date', held_by: 'somebody' }, 'R11: a dispute without status defaults to open');
rejects(
	DisputeSchema,
	{ claim: 'a competing account of the date', held_by: 'somebody', status: 'settled' },
	'R11: a dispute with a non-enum status is rejected (m12)'
);
accepts(DisputeSchema, { claim: 'a competing account of the date', held_by: 'somebody', status: 'adopted' }, 'R11: an adopted dispute parses');

// ---------------------------------------------------------------------------
// V21 — calendar-valid day tokens. Kills m15.
// ---------------------------------------------------------------------------

throws(() => parseDateEdge('2018-02-31'), 'V21: 2018-02-31 is rejected by the date parser (m15)');
throws(() => parseDateEdge('2018-02-29'), 'V21: 2018-02-29 is rejected — not a leap year (m15)');
ok(
	'V21: 2020-02-29 parses — leap year',
	(() => {
		const e = parseDateEdge('2020-02-29');
		return e.precision === 'day' && e.earliest === e.latest;
	})()
);
ok(
	'V21: the day parser round-trips exact days',
	(() => {
		const e = parseDateEdge('2018-06-01');
		return e.precision === 'day' && e.earliest === e.latest;
	})()
);

// ---------------------------------------------------------------------------
// V22 — the fuzzy-date grammar: ~ widening, <=/> = windows, envelope clamps,
// and the inverted-core rejection. Kills m13, m14, m16, m17, m18.
// ---------------------------------------------------------------------------

ok(
	'V22: ~2017 widens a year by roughly one year either side (m13)',
	(() => {
		const e = parseDateEdge('~2017');
		return e.precision === 'approx' && e.earliest === Date.UTC(2016, 0, 2) && e.latest === Date.UTC(2018, 11, 31, 23, 59, 59);
	})()
);
ok(
	'V22: <=2018-06 bounds the start to a plausible prior window',
	(() => {
		const e = parseDateEdge('<=2018-06');
		return (
			e.precision === 'before' &&
			e.latest === Date.UTC(2018, 5, 30, 23, 59, 59) &&
			e.earliest >= DATASET_FLOOR &&
			e.earliest >= Date.UTC(2010, 5, 1) &&
			e.earliest <= Date.UTC(2010, 6, 30)
		);
	})()
);
ok(
	'V22: <=1956 clamps the earliest bound to the dataset floor, never to 1948 (m14)',
	parseDateEdge('<=1956').earliest === DATASET_FLOOR
);
ok(
	'V22: >=1984 opens a forward window, never past the cutoff',
	(() => {
		const e = parseDateEdge('>=1984');
		return e.precision === 'after' && e.earliest === Date.UTC(1984, 0, 1) && e.latest <= DATASET_CUTOFF;
	})()
);
ok(
	'V22: "?" spans the whole dataset floor..cutoff as unknown',
	(() => {
		const e = parseDateEdge('?');
		return e.precision === 'unknown' && e.earliest === DATASET_FLOOR && e.latest === DATASET_CUTOFF;
	})()
);

throws(
	() => resolveInterval({ start: '2020-01-01', end: '2018-01-01' }),
	'V22: an interval that ends before it begins is rejected (m16)',
	'start 2020-01-01 / end 2018-01-01'
);

ok(
	'V22: an over-wide fuzzy start is clamped down to the known end and flagged (m17)',
	(() => {
		const iv = resolveInterval({ start: '~1986', end: '1987-10-02' });
		return iv.startClamped === true && iv.startLatest === Date.UTC(1987, 9, 2) && iv.startEarliest === Date.UTC(1985, 0, 1);
	})()
);
ok(
	'V22: an over-wide fuzzy end is clamped up to the known start and flagged (m17)',
	(() => {
		const iv = resolveInterval({ start: '2013-04', end: '~2014' });
		return iv.trimmed === true && iv.endEarliest === iv.startLatest;
	})()
);
ok(
	'V22: a verified-at bound past the cutoff is clamped to the cutoff (m18)',
	(() => {
		const iv = resolveInterval({ end: 'verified:2026-07' });
		return iv.status === 'last-verified' && iv.endEarliest === DATASET_CUTOFF;
	})()
);

// ---------------------------------------------------------------------------
// Active-window semantics — the confident core vs the outer envelope, and the
// open-ended duration. Kills m19, m20.
// ---------------------------------------------------------------------------

const fixed = resolveInterval({ start: '2018-06-01', end: '2020-06-01' });

ok(
	'certainlyActive: inclusive at both core edges (m19)',
	certainlyActive(fixed, Date.UTC(2018, 5, 1)) && certainlyActive(fixed, Date.UTC(2020, 5, 1))
);
ok(
	'certainlyActive: false just outside the core',
	!certainlyActive(fixed, Date.UTC(2018, 4, 31, 23, 59, 59)) && !certainlyActive(fixed, Date.UTC(2020, 5, 2))
);
ok(
	'possiblyActive: false outside the envelope, true at its edges',
	!possiblyActive(fixed, Date.UTC(2018, 4, 31)) &&
		possiblyActive(fixed, Date.UTC(2018, 5, 1)) &&
		possiblyActive(fixed, Date.UTC(2020, 5, 1)) &&
		!possiblyActive(fixed, Date.UTC(2020, 5, 2))
);
ok(
	'an open-ended interval measures its duration against the cutoff (m20)',
	(() => {
		const open = resolveInterval({ start: '2020-01-01' });
		const years = durationYears(open);
		// startMid is the exact day (2020-01-01); the cutoff is 2026-07-26 ≈ 6.57y.
		return years > 6.4 && years < 6.7;
	})()
);

console.log(
	`\n  ${checks - failures}/${checks} validator-invariant checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
