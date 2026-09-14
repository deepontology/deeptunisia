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
	ContractSchema,
	DeclarationSchema,
	DisputeSchema,
	EducationSchema,
	EventSchema,
	AgreementSchema,
	EraSchema,
	HypothesisSchema,
	InstitutionSchema,
	LicenceSchema,
	PersonSchema,
	PlaceSchema,
	QuestionSchema,
	ReviewSchema,
	SourceSchema,
	WorldClaimSchema,
	configureSchemaExceptions,
	isBasisUpgrade,
	nonBlank,
	reviewOverclaims
} from './schema.ts';
import {
	parseDateEdge,
	resolveInterval,
	certainlyActive,
	possiblyActive,
	durationYears,
	applyOngoingObservation,
	DATASET_CUTOFF,
	DATASET_FLOOR
} from './dates.ts';
import { configureTime } from './dates.ts';
import { loadParameters } from './parameters.ts';
import { countOrigins } from './origins.ts';
import { fileURLToPath } from 'node:url';

// The engine ships neutral example defaults; the fixtures below assert the
// jurisdiction's floor and cutoff, so install data/parameters.yaml first.
configureTime(loadParameters(fileURLToPath(new URL('../data/parameters.yaml', import.meta.url))).time);

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

/**
 * Reject AND prove why. A fixture that fails for the wrong reason (a missing
 * required sibling field, a typo) passes `rejects` while testing nothing, so
 * gate-critical fixtures name the message fragment they exist to pin.
 */
function rejectsWith(
	schema: { safeParse(input: unknown): { success: boolean; error?: { issues: { message: string }[] } } },
	input: unknown,
	name: string,
	needle: string
) {
	const r = schema.safeParse(input);
	const messages = r.success ? [] : (r.error?.issues ?? []).map((i) => i.message);
	ok(
		name,
		!r.success && messages.some((m) => m.includes(needle)),
		r.success ? 'accepted — expected rejection' : messages.join('; ')
	);
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

/** A well-formed review; the V23/V28 suites override one field at a time. */
const review = (over: Record<string, unknown> = {}) => ({
	by: 'reviewer',
	date: '2026-07-26',
	method: 'source-check',
	...over
});

// ---------------------------------------------------------------------------
// V18/V20/V27 — the claim envelope: C/D attribution, inferred completeness,
// unsubstantiated attribution, basis-override provenance, source minimum.
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
// V27 — a stronger authored basis is an override, and an override needs
// provenance. The reviewer's probe wrote `basis: documented` on a grade-C
// needs-primary-source record and the build accepted it with no review.
rejects(
	PositionSchema,
	pos({ confidence: 'C', verification: 'needs-primary-source', basis: 'reported', attributed_to: 'Some Observer' }),
	'V27: a reported-over-inferred override without review is rejected'
);
rejects(
	PositionSchema,
	pos({ confidence: 'D', verification: 'disputed', basis: 'documented', attributed_to: 'Some Observer' }),
	'V27: a documented-over-unsubstantiated override without review is rejected'
);
rejectsWith(
	PositionSchema,
	pos({
		confidence: 'D',
		verification: 'disputed',
		basis: 'documented',
		attributed_to: 'Some Observer',
		basis_override_reason: 'The decree text is primary evidence for the officeholding.',
		review: { by: 'fixture reviewer', date: '2026-09-10', method: 'source-check' }
	}),
	'V27: an override missing required reasoning fails and names the rule',
	'V27'
);
accepts(
	PositionSchema,
	pos({
		confidence: 'D',
		verification: 'disputed',
		basis: 'documented',
		attributed_to: 'Some Observer',
		reasoning: 'The decree establishes the office; the D grade covered the earlier circulating account.',
		basis_override_reason: 'The decree text is primary; the D grade reflected the pre-decree reporting.',
		review: { by: 'fixture reviewer', date: '2026-09-10', method: 'source-check' }
	}),
	'V27: a documented-over-unsubstantiated override with review, reasoning and reason parses'
);
rejectsWith(
	PositionSchema,
	pos({
		confidence: 'C',
		verification: 'needs-primary-source',
		basis: 'documented',
		attributed_to: 'Some Observer',
		reasoning: 'Reasoned from the decree structure.',
		falsifiable_by: 'A later decree reversing the structure.',
		review: { by: 'fixture reviewer', date: '2026-09-10', method: 'source-check' }
	}),
	'V27: an inferred-to-documented override without basis_override_reason is rejected',
	'basis_override_reason'
);
rejectsWith(
	PositionSchema,
	pos({
		confidence: 'C',
		verification: 'needs-primary-source',
		basis: 'documented',
		attributed_to: 'Some Observer',
		reasoning: 'Reasoned from the decree structure.',
		falsifiable_by: 'A later decree reversing the structure.',
		basis_override_reason: 'The primary decree is the claim; the grade reflects the missing secondary literature.'
	}),
	'V27: an override without a review object is rejected even with the full envelope',
	'review object'
);
accepts(
	PositionSchema,
	pos({
		confidence: 'C',
		verification: 'needs-primary-source',
		basis: 'documented',
		attributed_to: 'Some Observer',
		reasoning: 'Reasoned from the decree structure.',
		falsifiable_by: 'A later decree reversing the structure.',
		basis_override_reason: 'The primary decree is the claim; the grade reflects the missing secondary literature.',
		review: { by: 'fixture reviewer', date: '2026-09-10', method: 'source-check' }
	}),
	'V27: a full inferred-to-documented override parses'
);

// The explicit escape register: a listed legacy override parses without the
// provenance it is still owed, and stops parsing the moment its entry is gone.
{
	const legacyOverride = pos({
		confidence: 'C',
		verification: 'needs-primary-source',
		basis: 'documented',
		attributed_to: 'Some Observer'
	});
	configureSchemaExceptions({
		basisOverrides: new Set(['position:p-fixture:inferred>documented'])
	});
	accepts(
		PositionSchema,
		legacyOverride,
		'V27: a live exception-register entry lets a legacy override parse'
	);
	configureSchemaExceptions({});
	rejects(
		PositionSchema,
		legacyOverride,
		'V27: the same record fails once its exception entry is removed'
	);
}

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
// V26 — kind versus strength. The source relationship and the independent-origin
// count are separate axes from the authored kind; incompatible combinations
// fail, and the two fields stand or fall together.
// ---------------------------------------------------------------------------

accepts(
	PositionSchema,
	pos({ confidence: 'A', source_relation: 'direct-record', independence: 1 }),
	'V26: documented with a direct-record relation and one origin parses'
);
accepts(
	PositionSchema,
	pos({
		confidence: 'B',
		sources: ['s-fixture', 's-fixture-2'],
		source_relation: 'corroborated-report',
		independence: 2
	}),
	'V26: reported with a corroborated relation and two origins parses'
);
rejectsWith(
	PositionSchema,
	pos({ confidence: 'A', source_relation: 'single-report', independence: 1 }),
	'V26: a documented claim with a single-report relation is rejected',
	'incompatible with basis'
);
rejectsWith(
	PositionSchema,
	pos({
		confidence: 'C',
		verification: 'needs-primary-source',
		basis: 'inferred',
		attributed_to: 'Some Observer',
		reasoning: 'Reasoned from the records.',
		falsifiable_by: 'A record contradicting the reading.',
		source_relation: 'single-report',
		independence: 1
	}),
	'V26: an inferred claim with a report relation is rejected',
	'incompatible with basis'
);
rejectsWith(
	PositionSchema,
	pos({ confidence: 'D', attributed_to: 'a circulating account', source_relation: 'direct-record', independence: 1 }),
	'V26: an unsubstantiated claim with a direct-record relation is rejected',
	'incompatible with basis'
);
rejectsWith(
	PositionSchema,
	pos({ confidence: 'A', source_relation: 'direct-record' }),
	'V26: a source relation without an origin count is rejected',
	'requires independence'
);
rejectsWith(
	PositionSchema,
	pos({ confidence: 'B', source_relation: 'corroborated-report', independence: 3 }),
	'V26: more independent origins than cited sources is rejected',
	'exceeds the'
);
accepts(
	PositionSchema,
	pos({ confidence: 'B', independence: 1 }),
	'V26: an origin count without a relation parses (the axes are optional)'
);

// ---------------------------------------------------------------------------
// V29 — claim-level evidence: a passage, a locator, and a real capture (or a
// dated promise to make one). A generated year-only archive lookup is not a
// capture; two publishers in the lineage are one origin's worth of evidence.
// ---------------------------------------------------------------------------

const evidence = (over: Record<string, unknown> = {}) => ({
	passage_type: 'quote',
	passage: 'A passage long enough to be evidence.',
	locator: 'p. 6',
	retrieved_at: '2026-09-11',
	capture_url: 'https://web.archive.org/web/20260911000000/https://example.org/a',
	lineage: [{ publisher: 'Example Press' }],
	...over
});
accepts(PositionSchema, pos({ evidence: [evidence()] }), 'V29: a position with a captured passage parses');
accepts(
	PositionSchema,
	pos({ evidence: [evidence({ passage_type: 'paraphrase', capture_url: undefined, capture_missing: '2026-10-01' })] }),
	'V29: a paraphrase with a dated capture retry parses'
);
rejectsWith(
	PositionSchema,
	pos({ evidence: [evidence({ locator: ' ' })] }),
	'V29: evidence without a real locator is rejected',
	'locator'
);
rejectsWith(
	PositionSchema,
	pos({ evidence: [evidence({ capture_url: undefined, capture_missing: undefined })] }),
	'V29: evidence without a capture or a retry date is rejected',
	'capture'
);
rejectsWith(
	PositionSchema,
	pos({ evidence: [evidence({ capture_url: 'https://web.archive.org/web/2026/https://example.org/a' })] }),
	'V29: a year-only archive lookup is not a capture',
	'actual snapshot'
);
rejectsWith(
	PositionSchema,
	pos({ evidence: [evidence({ capture_url: 'https://web.archive.org/web/20230605/https://example.org/a' })] }),
	'V29: a date-only archive lookup is not a capture',
	'actual snapshot'
);

// ---------------------------------------------------------------------------
// V29 source-side — a source URL is a fetchable web link, and a registered
// archive URL is a snapshot, not a lookup that resolves to one later.
// ---------------------------------------------------------------------------

const sourceRec = (over: Record<string, unknown> = {}) => ({
	id: 's-fixture',
	title: 'Fixture source',
	publisher: 'Fixture Press',
	url: 'https://example.org/a',
	tier: 3,
	...over
});
accepts(SourceSchema, sourceRec(), 'V29 source: an http(s) source URL parses');
accepts(
	SourceSchema,
	sourceRec({ archive_url: 'https://web.archive.org/web/20260911000000/https://example.org/a' }),
	'V29 source: a timestamped snapshot parses'
);
rejectsWith(
	SourceSchema,
	sourceRec({ url: 'ftp://example.org/a' }),
	'V29 source: a non-http(s) source URL is rejected',
	'http(s)'
);
rejectsWith(
	SourceSchema,
	sourceRec({ archive_url: 'https://web.archive.org/web/2026/https://example.org/a' }),
	'V29 source: a year-only archive lookup is rejected',
	'actual snapshot'
);
rejectsWith(
	SourceSchema,
	sourceRec({ archive_url: 'https://web.archive.org/web/20230605/https://example.org/a' }),
	'V29 source: a date-only archive lookup is rejected',
	'actual snapshot'
);

// ---------------------------------------------------------------------------
// V29 origins — independent evidence groups, never a URL count. Only the first
// lineage step is an origin, so a wire republished by different outlets is one
// origin; the same publisher twice is one; a shared URL host is a second
// identity key that collapses a renamed publisher.
// ---------------------------------------------------------------------------

const lineage = (publisher: string, url?: string) => ({ lineage: [{ publisher, ...(url ? { url } : {}) }] });
ok(
	'V29 origins: the same publisher twice is one origin',
	countOrigins([lineage('Reuters'), lineage('Reuters')]) === 1
);
ok(
	'V29 origins: two different publishers are two origins',
	countOrigins([
		lineage('Deutsche Welle', 'https://www.dw.com/a'),
		lineage('BBC News', 'https://www.bbc.com/b')
	]) === 2
);
ok(
	'V29 origins: a wire republished by different outlets is one origin',
	countOrigins([
		{ lineage: [{ publisher: 'Reuters' }, { publisher: 'Arab News', url: 'https://www.arabnews.com/x' }] },
		{ lineage: [{ publisher: 'Reuters' }, { publisher: 'Al Jazeera', url: 'https://www.aljazeera.com/y' }] }
	]) === 1
);
ok(
	'V29 origins: a shared host collapses a renamed publisher',
	countOrigins([
		lineage('TAP', 'https://www.tap.info.tn/a'),
		lineage('Tunis Afrique Presse', 'https://www.tap.info.tn/b')
	]) === 1
);
ok(
	'V29 origins: no evidence leaves the authored independence alone',
	countOrigins([]) === undefined && countOrigins(undefined) === undefined
);
rejectsWith(
	PositionSchema,
	pos({ evidence: [evidence({ passage_type: 'summary' })] }),
	'V29: a passage must be a quote or a marked paraphrase',
	'Invalid option'
);
rejectsWith(
	PositionSchema,
	pos({ evidence: [evidence({ extra: 'x' })] }),
	'V29: unknown evidence keys fail instead of being stripped',
	'Unrecognized key'
);

// ---------------------------------------------------------------------------
// 1A — nonBlank across every claim kind. The reviewer replaced a position's
// reasoning, falsifier and attribution with whitespace and the build accepted
// it. Each kind tries " ", "\t\n " and "" on each mandatory envelope field.
// ---------------------------------------------------------------------------

const personRec = (over: Record<string, unknown> = {}) => ({
	id: 'p-person-fixture',
	name_en: 'Fixture Person',
	layers: ['political'],
	sources: ['s-fixture'],
	...over
});
const institutionRec = (over: Record<string, unknown> = {}) => ({
	id: 'i-fixture',
	name_en: 'Fixture Institution',
	type: 'ministry',
	layer: 'political',
	sources: ['s-fixture'],
	...over
});
const eventRec = (over: Record<string, unknown> = {}) => ({
	id: 'e-fixture',
	date: '2020-01-01',
	title_en: 'Fixture Event',
	category: 'political',
	summary: 'A fixture summary long enough.',
	sources: ['s-fixture'],
	...over
});
const agreementRec = (over: Record<string, unknown> = {}) => ({
	id: 'a-fixture',
	title_en: 'Fixture Agreement',
	kind: 'other',
	parties: ['FR'],
	summary: 'A fixture summary long enough.',
	confidence: 'A',
	sources: ['s-fixture'],
	...over
});
const worldClaimRec = (over: Record<string, unknown> = {}) => ({
	id: 'w-fixture',
	claim: 'A fixture claim long enough.',
	assessment: 'A fixture assessment long enough.',
	sources: ['s-fixture'],
	...over
});
const contractRec = (over: Record<string, unknown> = {}) => ({
	id: 'c-fixture',
	title_en: 'Fixture Contract',
	institution: 'i-fixture',
	kind: 'procurement',
	status: 'awarded',
	sources: ['s-fixture'],
	...over
});
const licenceRec = (over: Record<string, unknown> = {}) => ({
	id: 'l-fixture',
	holder: 'i-fixture',
	issuer: 'i-fixture',
	kind: 'media',
	grant: '2020-01-01',
	sources: ['s-fixture'],
	...over
});
const declarationRec = (over: Record<string, unknown> = {}) => ({
	id: 'd-fixture',
	declarer: null,
	body: null,
	date: '2020-01-01',
	kind: 'asset-declaration',
	jurisdiction: 'tn',
	summary: 'Fixture declaration.',
	sources: ['s-fixture'],
	...over
});
const educationRec = (over: Record<string, unknown> = {}) => ({
	id: 'ed-fixture',
	person: 'p-person-fixture',
	institution: null,
	degree_en: 'PhD',
	kind: 'phd',
	sources: ['s-fixture'],
	...over
});
const placeRec = (over: Record<string, unknown> = {}) => ({
	id: 'pl-fixture',
	kind: 'port',
	name_en: 'Fixture Port',
	sources: ['s-fixture'],
	...over
});
const eraRec = (over: Record<string, unknown> = {}) => ({
	id: 'era-fixture',
	label_en: 'Fixture Era',
	start: '2000',
	end: '2010',
	thesis: 'A fixture thesis long enough.',
	accent: '#112233',
	...over
});
const questionRec = (over: Record<string, unknown> = {}) => ({
	id: 'q-fixture',
	question: 'A fixture question long enough?',
	kind: 'analytical',
	...over
});
const hypothesisRec = (over: Record<string, unknown> = {}) => ({
	id: 'h-fixture',
	label: 'Fixture Hypothesis',
	statement: 'A fixture statement long enough.',
	support: 'insufficient',
	reasoning: 'A fixture reasoning long enough.',
	falsifiable_by: 'A fixture falsifier long enough.',
	...over
});

ok('nonBlank: a single space is not content', nonBlank(' ') === false);
ok('nonBlank: tab, newline and space are not content', nonBlank('\t\n ') === false);
ok('nonBlank: the empty string is not content', nonBlank('') === false);
ok(
	'nonBlank: the minimum applies after trimming',
	nonBlank('  x  ', 2) === false && nonBlank('  xy  ', 2) === true
);
ok('isBasisUpgrade: documented over reported is an upgrade', isBasisUpgrade('documented', 'reported'));
ok('isBasisUpgrade: reported over documented is not', !isBasisUpgrade('reported', 'documented'));

const envelopeFixtures: [string, any, (over?: any) => any][] = [
	['position', PositionSchema, pos],
	['relationship', RelationshipSchema, rel],
	['event', EventSchema, eventRec],
	['agreement', AgreementSchema, agreementRec],
	['world claim', WorldClaimSchema, worldClaimRec],
	['company', CompanySchema, co],
	['contract', ContractSchema, contractRec],
	['licence', LicenceSchema, licenceRec],
	['declaration', DeclarationSchema, declarationRec],
	['education', EducationSchema, educationRec],
	['person', PersonSchema, personRec],
	['institution', InstitutionSchema, institutionRec],
	['place', PlaceSchema, placeRec]
];

for (const [kind, schema, base] of envelopeFixtures) {
	for (const blank of [' ', '\t\n ', '']) {
		const label = JSON.stringify(blank);
		rejectsWith(
			schema,
			base({
				confidence: 'C',
				verification: 'needs-primary-source',
				attributed_to: blank,
				reasoning: 'Reasoned from the record.',
				falsifiable_by: 'A source contradicting the record.'
			}),
			`V20: ${kind} whitespace attributed_to ${label} is rejected`,
			'non-blank'
		);
		rejectsWith(
			schema,
			base({
				confidence: 'C',
				verification: 'needs-primary-source',
				attributed_to: 'Some Observer',
				reasoning: blank,
				falsifiable_by: 'A source contradicting the record.'
			}),
			`V18: ${kind} whitespace reasoning ${label} is rejected`,
			'non-blank'
		);
		rejectsWith(
			schema,
			base({
				confidence: 'C',
				verification: 'needs-primary-source',
				attributed_to: 'Some Observer',
				reasoning: 'Reasoned from the record.',
				falsifiable_by: blank
			}),
			`V18: ${kind} whitespace falsifiable_by ${label} is rejected`,
			'non-blank'
		);
	}
	rejectsWith(
		schema,
		base({ confidence: 'D', attributed_to: ' ' }),
		`V20: ${kind} grade D whitespace attribution is rejected`,
		'non-blank'
	);
}

// ---------------------------------------------------------------------------
// 1C — recursive strictness. ReviewSchema and DisputeSchema were plain
// z.object, so an extra key vanished and the record still counted as reviewed.
// The reviewer's exact probe: a valid review carrying `outcome: refuted`.
// ---------------------------------------------------------------------------

rejectsWith(
	ReviewSchema,
	review({ outcome: 'refuted' }),
	'V28: an unknown review key (outcome) fails instead of being stripped',
	'Unrecognized key'
);
rejectsWith(
	PositionSchema,
	pos({ review: review({ outcome: 'refuted' }) }),
	'V28: a nested review outcome fails the whole record',
	'Unrecognized key'
);
rejectsWith(
	DisputeSchema,
	{ claim: 'a competing account of the date', held_by: 'somebody', kind: 'settled' },
	'V28: an unknown dispute key fails',
	'Unrecognized key'
);
rejectsWith(
	PositionSchema,
	pos({ disputes: [{ claim: 'a competing account of the date', held_by: 'somebody', extra: 'x' }] }),
	'V28: an unknown nested dispute key fails',
	'Unrecognized key'
);
rejectsWith(
	InstitutionSchema,
	institutionRec({ active: { start: '2020', end: '2021', extra: 'x' } }),
	'V28: an unknown interval key fails',
	'Unrecognized key'
);
rejectsWith(
	RelationshipSchema,
	rel({ equity: { pct: 50, direct: true, beneficial: false, extra: 'x' } }),
	'V28: an unknown equity key fails',
	'Unrecognized key'
);
rejectsWith(
	RelationshipSchema,
	rel({ type: 'funding', finance: { amount: 1, currency: 'TND', year: 2020, extra: 'x' } }),
	'V28: an unknown finance key fails',
	'Unrecognized key'
);
rejectsWith(
	RelationshipSchema,
	rel({ type: 'influence', reasoning: 'r', influence: { channel: 'appointment', strength: 0.5, extra: 'x' } }),
	'V28: an unknown influence key fails',
	'Unrecognized key'
);
rejectsWith(
	CompanySchema,
	co({ registration: { registry: 'registre-de-commerce', number: '1', date: '2020-01-01', extra: 'x' } }),
	'V28: an unknown registration key fails',
	'Unrecognized key'
);
rejectsWith(
	CompanySchema,
	co({ capital: { tnd: 100, date: '2020-01-01', extra: 'x' } }),
	'V28: an unknown capital key fails',
	'Unrecognized key'
);
rejectsWith(
	ContractSchema,
	contractRec({ award: { value: '~100', currency: 'TND', year: 2020, extra: 'x' } }),
	'V28: an unknown award key fails',
	'Unrecognized key'
);
rejectsWith(
	LicenceSchema,
	licenceRec({ fees: { amount: 1, currency: 'TND', year: 2020, extra: 'x' } }),
	'V28: an unknown fees key fails',
	'Unrecognized key'
);
rejectsWith(
	EventSchema,
	eventRec({ impact: { layer: ['political'], extra: 'x' } }),
	'V28: an unknown impact key fails',
	'Unrecognized key'
);
rejectsWith(
	EventSchema,
	eventRec({ contested: [{ framing: 'x', held_by: 'y', extra: 'z' }] }),
	'V28: an unknown contested key fails',
	'Unrecognized key'
);
rejectsWith(EraSchema, eraRec({ extra: 'x' }), 'V28: an unknown top-level era key fails', 'Unrecognized key');
rejectsWith(
	QuestionSchema,
	questionRec({ extra: 'x' }),
	'V28: an unknown top-level question key fails',
	'Unrecognized key'
);
rejectsWith(
	HypothesisSchema,
	hypothesisRec({ extra: 'x' }),
	'V28: an unknown top-level hypothesis key fails',
	'Unrecognized key'
);
rejectsWith(PersonSchema, personRec({ extra: 'x' }), 'V28: an unknown person key fails', 'Unrecognized key');
rejectsWith(
	InstitutionSchema,
	institutionRec({ extra: 'x' }),
	'V28: an unknown institution key fails',
	'Unrecognized key'
);

// V23 — whitespace reviewer names and dispute fields are missing fields too.
rejectsWith(ReviewSchema, review({ by: ' ' }), 'V23: a whitespace reviewer name is rejected', 'non-blank');
rejectsWith(ReviewSchema, review({ by: '\t\n ' }), 'V23: a tab/newline reviewer name is rejected', 'non-blank');
rejectsWith(ReviewSchema, review({ by: '' }), 'V23: an empty reviewer name is rejected', 'non-blank');
rejectsWith(
	DisputeSchema,
	{ claim: ' ', held_by: 'somebody' },
	'V23: a whitespace dispute claim is rejected',
	'non-blank'
);
rejectsWith(
	DisputeSchema,
	{ claim: 'a competing account of the date', held_by: '\t\n ' },
	'V23: a whitespace dispute holder is rejected',
	'non-blank'
);

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
		const expected = (DATASET_CUTOFF - Date.UTC(2020, 0, 1)) / (365.2425 * 86_400_000);
		return Math.abs(durationYears(open) - expected) < 0.01;
	})()
);

// ---------------------------------------------------------------------------
// Temporal invariants — the certainty horizon, the month-only observation, the
// ongoing confirmation window, and a generated sweep over token combinations
// and boundary dates. The engine owns the predicates; this suite proves the
// pinned engine upholds the contract DeepTunisia publishes.
// ---------------------------------------------------------------------------

ok(
	'temporal: an unknown end is never certain past the cutoff',
	!certainlyActive(resolveInterval({ start: '2020-01-01', end: '?' }), DATASET_CUTOFF + 86_400_000)
);
{
	const unknownEnd = resolveInterval({ start: '2020-01-01', end: '?' });
	ok(
		'temporal: an unknown end is certain only at its one observation',
		certainlyActive(unknownEnd, unknownEnd.startLatest) &&
			!certainlyActive(unknownEnd, unknownEnd.startLatest + 86_400_000)
	);
}
{
	// A bound past the cutoff is clamped, so the core can never invert and the
	// algebra never asserts after the horizon. Without this fixture a mutation
	// that drops the clamp is invisible: the missing-start trim happens to hide
	// it, and every end token in the sweep sits before the cutoff.
	const futureVerified = resolveInterval({ start: '2020-01-01', end: 'verified:2027-01' });
	ok(
		'temporal: a verified bound past the cutoff is clamped to the cutoff',
		futureVerified.status === 'last-verified' &&
			futureVerified.endEarliest === DATASET_CUTOFF &&
			futureVerified.endEarliest <= (futureVerified.endLatest ?? 0)
	);
	ok(
		'temporal: a known end beyond the cutoff asserts nothing past it',
		(() => {
			const futureEnd = resolveInterval({ start: '2019-01-01', end: '2030-01-01' });
			return (
				possiblyActive(futureEnd, DATASET_CUTOFF) &&
				!certainlyActive(futureEnd, DATASET_CUTOFF + 86_400_000) &&
				!possiblyActive(futureEnd, DATASET_CUTOFF + 86_400_000)
			);
		})()
	);
}
{
	const monthVerified = resolveInterval({ start: '2019-01-01', end: 'verified:2020-06' });
	const midpoint = Math.floor((Date.UTC(2020, 5, 1) + Date.UTC(2020, 5, 30, 23, 59, 59)) / 2);
	ok(
		'temporal: a month-only verification is certain at the month midpoint',
		certainlyActive(monthVerified, midpoint)
	);
	ok(
		'temporal: a month-only verification is not certain on the last day',
		!certainlyActive(monthVerified, Date.UTC(2020, 5, 30, 23, 59, 59))
	);
}
{
	const openEnded = resolveInterval({ start: '2022-01-01', end: 'ongoing' });
	const confirmed = applyOngoingObservation(openEnded, DATASET_CUTOFF - 10 * 86_400_000);
	ok(
		'temporal: a recent observation keeps an ongoing interval ongoing',
		confirmed.status === 'ongoing'
	);
	ok(
		'temporal: ongoing certainty stops at the confirming observation',
		!certainlyActive(confirmed, DATASET_CUTOFF)
	);
	const stale = applyOngoingObservation(openEnded, Date.UTC(2024, 0, 1));
	ok(
		'temporal: a stale observation downgrades ongoing to last-verified',
		stale.status === 'last-verified' &&
			stale.lastObserved === Date.UTC(2024, 0, 1) &&
			!certainlyActive(stale, DATASET_CUTOFF)
	);
}

{
	const starts = ['2018-06-01', '2018-06', '2018', '~2017', '~2017-06', '<=2018-06', '>=1984', '?'];
	const ends = ['2020-06-01', '2020-06', '2020', '~2020', 'ongoing', 'verified:2020-06', 'verified:2020-06-15', '?', '2030-01-01', 'verified:2027-01'];
	const queries = [
		DATASET_FLOOR - 86_400_000,
		DATASET_FLOOR,
		DATASET_CUTOFF - 86_400_000,
		DATASET_CUTOFF,
		DATASET_CUTOFF + 86_400_000,
		Date.UTC(2020, 1, 29),
		Date.UTC(2024, 1, 29),
		Date.UTC(2017, 0, 1),
		Date.UTC(2018, 5, 15),
		Date.UTC(2020, 5, 15),
		Date.UTC(2021, 5, 15)
	];
	let seed = 20260910;
	const rand = () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};
	const pool = starts.flatMap((s) => ends.map((e) => [s, e] as const));
	const failures: string[] = [];
	const check = (cond: boolean, msg: string) => {
		if (!cond && failures.length < 5) failures.push(msg);
	};
	let cases = 0;
	for (let i = 0; i < 1000; i++) {
		const [s, e] = i < pool.length ? pool[i] : pool[Math.floor(rand() * pool.length)];
		let iv;
		try {
			iv = resolveInterval({ start: s, end: e });
		} catch {
			continue;
		}
		cases++;
		const settled = applyOngoingObservation(
			iv,
			i % 3 === 0 ? DATASET_CUTOFF - 1000 * 86_400_000 : DATASET_CUTOFF - 10 * 86_400_000
		);
		check(settled.startEarliest <= settled.startLatest, `start ordering ${s}/${e}`);
		check(
			settled.endEarliest === null || settled.endLatest === null || settled.endEarliest <= settled.endLatest,
			`end ordering ${s}/${e}`
		);
		if (settled.status !== 'ongoing') {
			check(settled.lastObserved !== null, `missing certainty horizon ${s}/${e}`);
		}
		for (const t of queries) {
			check(
				!certainlyActive(settled, t) || possiblyActive(settled, t),
				`certain without possible ${s}/${e} @ ${new Date(t).toISOString()}`
			);
			check(
				!(t > DATASET_CUTOFF && (certainlyActive(settled, t) || possiblyActive(settled, t))),
				`assertion past cutoff ${s}/${e} @ ${new Date(t).toISOString()}`
			);
		}
	}
	ok(
		`temporal: generated sweep upholds the invariants (${cases} cases)`,
		cases === 1000 && failures.length === 0,
		failures[0] ?? `${cases} cases`
	);
}

console.log(
	`\n  ${checks - failures}/${checks} validator-invariant checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
