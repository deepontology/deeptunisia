import { z } from 'zod';
import {
	Basis,
	Confidence,
	DisputeSchema,
	REQUIRED_SOURCE_KINDS,
	ReviewActor,
	ReviewMethod,
	SourceRelation,
	TRANSLATION_TIERS,
	TranslatedBy,
	Verification as VerificationStatus,
	createReviewSchema,
	dateToken,
	deriveBasis,
	isBasisUpgrade,
	nonBlank,
	reviewerLabelPattern,
	slug,
	EvidenceSchema,
	NarrativeReferenceSchema,
	isArchiveSnapshot,
	type ExceptionRegister,
	type HypothesisRecord,
	type QuestionRecord,
	type SourceRelationValue,
	type SourceRecord,
	type VerificationRecord
} from 'deepepisteme/kernel';
import type {
	agreementSchema,
	companySchema,
	contractSchema,
	declarationSchema,
	educationSchema,
	eraSchema,
	eventSchema,
	groupLayerSchema,
	institutionSchema,
	licenceSchema,
	personSchema,
	placeSchema,
	positionSchema,
	relationshipSchema,
	roleSchema,
	vacancySchema,
	worldClaimSchema
} from 'deepepisteme/atlas';
import { engine } from './engine.ts';
import {
	AgreementKind,
	type DirectionKind,
	EDGE_DIRECTION,
	INFLUENCE_CHANNELS,
	InstitutionType,
	Layer,
	PlaceKind,
	REVIEWER_LABELS,
	RegionKind,
	RelationshipType,
	TRANSLATED_LOCALES,
	type SourceLanguage
} from './vocabulary.ts';

/**
 * The schema the engine parses a kind with, typed as the record this module
 * declares for it. Kinds whose record type the engine does not carry statically
 * are narrowed here, on the deployment side.
 */
function kernelSchema<Out>(kind: string): z.ZodType<Out> {
	return engine.schemaOf(kind) as unknown as z.ZodType<Out>;
}

/** A record type with the named fields narrowed to the deployment's vocabularies. */
type Narrow<T, N> = Omit<T, keyof N> & N;

/** The record a kind factory builds a schema for. */
type AtlasRecord<F extends (...args: never[]) => z.ZodType> = z.infer<ReturnType<F>>;

/**
 * The schema the engine parses an atlas kind with, closed over the exception
 * sets the build configures (`configureSchemaExceptions`). The sets are read at every
 * parse, so a schema built here at load time answers with the sets as they
 * stand when a record is parsed. Entries carry no deadline in this module: the
 * build checks the dated register itself, so every configured entry counts.
 */
function atlasSchema<Out>(kind: string): z.ZodType<Out> {
	return engine.schemaOf(kind, configuredRegister) as unknown as z.ZodType<Out>;
}


/** The vocabularies, re-exported under the names this module has always used. */
export {
	AgreementKind,
	EDGE_DIRECTION,
	INFLUENCE_CHANNELS,
	InstitutionType,
	Layer,
	PlaceKind,
	REVIEWER_LABELS,
	RegionKind,
	RelationshipType,
	TRANSLATED_LOCALES
};
export type { DirectionKind };

/**
 * KERNEL-OWNED SYMBOLS, RE-EXPORTED
 * ---------------------------------------------------------------------------
 * The grade ladder (Confidence, Basis, Verification), the translation ladder
 * (TranslatedBy, TRANSLATION_TIERS), the review method enum (ReviewMethod),
 * the dispute shape (DisputeSchema), the id and prose guards (slug,
 * nonBlank) and the basis derivation (deriveBasis, isBasisUpgrade) are
 * defined once by the engine kernel and imported above, so this schema and
 * the engine cannot drift apart on them.
 * They are re-exported under the names this module has always used, so no
 * importer changes. The `Verification` name stays overloaded exactly as
 * before: the value is the pipeline-status enum, the type (below, at
 * VerificationSchema) is the independent-verification record.
 */
export {
	Basis,
	Confidence,
	DisputeSchema,
	REQUIRED_SOURCE_KINDS,
	ReviewActor,
	ReviewMethod,
	SourceRelation,
	TRANSLATION_TIERS,
	TranslatedBy,
	VerificationStatus as Verification,
	deriveBasis,
	isBasisUpgrade,
	nonBlank
};
export type { SourceRelationValue };

/**
 * Validation schema for the DeepTunisia knowledge graph.
 *
 * The build fails on any violation. That is deliberate: the credibility of this
 * project rests entirely on every claim being traceable, so "a fact with no source"
 * or "an edge pointing at nobody" must be a build error, not a runtime surprise.
 *
 * VALIDATOR REGISTER
 * ---------------------------------------------------------------------------
 * The canonical list of validator ids, their status and the code that enforces
 * each one is `scripts/validator-register.ts`. This comment does not restate
 * that list: a range written here drifts as soon as a rule changes status. The
 * register marks V1, V2, V3, V6, V7 and V11 as specified only and V30 as
 * reserved; every other id is enforced in this tree. `scripts/test-paper.ts`
 * fails if this header claims a shipped range that includes a specified id.
 *
 * V25      grade-A primary source (Phase 1D): every `confidence: A` claim record
 *          cites at least one tier-1 or tier-2 source, or carries an explicit,
 *          unexpired entry in `data/source-exceptions.yaml`.
 * V26      kind versus strength cross-field compatibility (Phase 6): a source
 *          relation and an independence count that cannot both be true with the
 *          record's basis fail the build, and an excepted grade-A record whose
 *          derived kind is `reported` warns.
 * V27      basis-override provenance (Phase 1B): an authored basis stronger than
 *          the grade-implied basis requires a review object, non-blank reasoning,
 *          a falsifier for inferred targets, at least one source, and a
 *          `basis_override_reason`; legacy overrides are listed in
 *          `data/source-exceptions.yaml` with an owner and a deadline.
 * V28      recursive strictness (Phase 1C): an undeclared key anywhere in a
 *          claim-bearing record, including inside review, dispute and nested
 *          objects, fails instead of being silently stripped.
 * V29      claim-level evidence (Phase 7): a support/refute passage carries a
 *          type (quote or marked paraphrase), a locator, a retrieval date, and
 *          either a real timestamped capture or a dated retry promise. A
 *          generated year-only or date-only archive lookup is not a capture.
 *          Source records get the same treatment: a fetchable http(s) URL, and
 *          a web.archive.org snapshot URL that carries its full capture
 *          timestamp. The build derives each claim's `origins` count from
 *          evidence lineage - unique origin publishers/hosts, never a URL
 *          count - and keeps the authored `independence` where no evidence
 *          exists.
 * V32      documented vacancy (decision 0007): a vacancy names a known,
 *          non-seated role and carries a source; it may not certainly overlap
 *          a titular position in the same role, nor another vacancy of that
 *          role. Acting positions may sit inside it.
 * V33      verified means a person checked it (release 1.0): a record whose
 *          `verification` is `verified` carries a review whose `actor` is
 *          `human` and whose `method` is `source-check`. The 82 `verified`
 *          values written before the rule are listed with an expiry in
 *          `scripts/verified-exceptions.ts`; the list must be empty before
 *          release.
 *
 * Numbering note: the pre-submission grant draft used "V25" for the grade-B
 * corroboration rule (confidence B needs two sources or `attributed_to`). That
 * rule is renumbered V30 and is not implemented in this pass; this tree reserves
 * V25 for the grade-A primary-source rule, per the review-hardening spec. One
 * number names one rule.
 */

/**
 * KIND VERSUS STRENGTH — the second and third axes of a claim (V26).
 *
 * `basis` answers "what KIND of claim is this". It is regularly derived from
 * the grade, which is the tangle the September review identified: a newspaper
 * reporting an appointment stays a report however confident the editor is, and
 * a careful inference from decrees stays an inference however strong the
 * documents. These fields make the source relationship and the number of
 * independent origins explicit, and V26 rejects combinations that cannot both
 * be true. They are optional on every claim kind, but required together once
 * either is present.
 *
 *   direct-record          the cited source is the record itself (decree, gazette)
 *   direct-report          a source states the claim in its own voice
 *   corroborated-report    two or more independent reports agree
 *   single-report          one report carries the claim alone
 *   inference-from-records nobody states it; it is reasoned from records
 *   circulating-claim      the claim circulates without reliable evidence
 */

export { isArchiveSnapshot };

/**
 * CLAIM-LEVEL EVIDENCE (V29) — the passage, not the bibliography.
 *
 * `sources` says which records carry a claim; it does not say where in them, or
 * whether the cited page was ever captured. An evidence entry binds the claim to
 * an exact passage and a locator, and requires either a real capture or a dated
 * promise to make one. `lineage` names the originating report and each
 * republishing step, so two outlets sharing one wire count as one origin.
 */
export { EvidenceSchema };


/** The provenance value a `_by` sibling carries (kernel: TranslatedBy). */
export type TranslatedByValue = z.infer<typeof TranslatedBy>;

/**
 * The `_fr` / `_ar` / `_by` siblings for one prose field.
 *
 * Spread into a schema: `...translatable('summary')`. Generated rather than written
 * out because there are eleven such fields across six record types, and four keys
 * each hand-written is forty-four chances to typo one into silence — a misspelled
 * `summary_ar` is not a validation error, it is an unknown key that Zod strips and
 * nobody ever sees again.
 */
export function translatable(name: string, kind: 'string' | 'list' = 'string') {
	const value = kind === 'list' ? z.array(z.string()) : z.string();
	return Object.fromEntries(
		TRANSLATED_LOCALES.flatMap((loc) => [
			[`${name}_${loc}`, value.optional()],
			[`${name}_${loc}_by`, TranslatedBy.optional()]
		])
	) as Record<string, z.ZodTypeAny>;
}

/**
 * Every prose field that carries translations, by record type.
 *
 * One list, used by the schemas, the build's coverage counter and the tests, so the
 * three cannot disagree about what "translated" covers. Adding a field here and to
 * the schema is the whole cost of making it translatable.
 */
export const TRANSLATABLE_FIELDS: Record<string, { name: string; kind: 'string' | 'list' }[]> = {
	people: [
		{ name: 'tagline', kind: 'string' },
		{ name: 'summary', kind: 'string' },
		{ name: 'trajectory', kind: 'list' },
		{ name: 'notes', kind: 'list' }
	],
	institutions: [
		{ name: 'summary', kind: 'string' },
		{ name: 'notes', kind: 'list' }
	],
	roles: [{ name: 'summary', kind: 'string' }],
	events: [{ name: 'summary', kind: 'string' }],
	relationships: [
		{ name: 'description', kind: 'string' },
		{ name: 'reasoning', kind: 'string' },
		{ name: 'falsifiable_by', kind: 'string' }
	],
	positions: [
		{ name: 'reasoning', kind: 'string' },
		{ name: 'falsifiable_by', kind: 'string' },
		{ name: 'notes', kind: 'list' }
	],
	// `label` is absent on purpose: an era already carries label_en/_fr/_ar under the
	// name convention the trilingual entity fields use, so it needs no `_by` sibling.
	eras: [
		{ name: 'thesis', kind: 'string' },
		{ name: 'reasoning', kind: 'string' },
		{ name: 'falsifiable_by', kind: 'string' }
	],
	questions: [
		{ name: 'question', kind: 'string' },
		{ name: 'notes', kind: 'string' },
		{ name: 'answer', kind: 'string' }
	],
	hypotheses: [
		{ name: 'label', kind: 'string' },
		{ name: 'statement', kind: 'string' },
		{ name: 'reasoning', kind: 'string' },
		{ name: 'falsifiable_by', kind: 'string' }
	],
	agreements: [{ name: 'summary', kind: 'string' }],
	worldClaims: [
		{ name: 'claim', kind: 'string' },
		{ name: 'assessment', kind: 'string' },
		{ name: 'notes', kind: 'list' }
	],
	regions: [{ name: 'notes', kind: 'list' }],
	places: [{ name: 'notes', kind: 'list' }],
	companies: [{ name: 'notes', kind: 'list' }],
	contracts: [{ name: 'notes', kind: 'list' }],
	licences: [{ name: 'notes', kind: 'list' }],
	vacancies: [
		{ name: 'reasoning', kind: 'string' },
		{ name: 'falsifiable_by', kind: 'string' },
		{ name: 'notes', kind: 'list' }
	],
	declarations: [{ name: 'summary', kind: 'string' }, { name: 'notes', kind: 'list' }],
	education: [{ name: 'field', kind: 'string' }, { name: 'notes', kind: 'list' }],
	// Sources stay out of the authored-prose counter on purpose. Source excerpts
	// carry `excerpt_fr`/`excerpt_ar` reading aids at the `machine` tier only (the
	// admission that a model produced them and nothing checked them, i18n-spec §2.2
	// exception) — but counting quoted-material AI translations in the data-prose
	// figure would mix them into authored prose and show false "missing" gaps for
	// the per-language rule (a French excerpt needs no excerpt_fr). The excerpt
	// discipline is enforced by test-i18n's dedicated excerpt block instead.
	// `title_gloss` likewise stays out: glosses render beside the title.
	sources: []
};

/**
 * Records whose prose argues for the project's own trustworthiness.
 *
 * A mistranslated falsifier is a false claim about what would refute a hypothesis,
 * and an era thesis mistranslated is the frame every record inside it is read
 * through. These may not ship at `machine` — the build refuses it.
 *
 * They additionally require `human` or `machine-reviewed` before PUBLIC LAUNCH,
 * which is deliberately a launch gate rather than a build failure: the work has to
 * be able to proceed at `model-reviewed` without a red build for its whole duration.
 * See `docs/i18n-spec.md` §4.2.
 */
export const NO_RAW_MACHINE = new Set(['hypotheses', 'eras']);

export const REVIEWER_LABEL = reviewerLabelPattern(REVIEWER_LABELS);

/**
 * The strict review object is built by the engine from the labels above, so the
 * engine and this tree sign reviews with the same pattern and the same messages.
 * `actor` is optional so every review written before the field existed stays
 * valid; a `verified` record must name a human actor (V33).
 */
export const ReviewSchema = createReviewSchema(REVIEWER_LABELS);

/**
 * A review note may not claim a verification the record cannot support.
 *
 * `review.method` is free text, so the one field asserting that a human actually
 * checked something is the one field the schema cannot constrain. Two positions —
 * including the sitting president's — once carried "Checked directly against the
 * JORT decree text" while citing no gazette source at all.
 *
 * This lives here, rather than in build-data.ts where it began, because the
 * editorial tool needs the same predicate to warn before writing. Two copies of a
 * rule drift, and a warning that disagrees with the build is worse than none: it
 * teaches the operator to ignore it.
 *
 * The rule is the engine's; the vocabulary and source prefixes are the
 * deployment's, which reads data/parameters.yaml.
 */
export function reviewOverclaims(method: string | undefined, sources: string[]): boolean {
	return engine.envelope.reviewOverclaims(method, sources);
}

/**
 * V33: a record may say `verified` only when a person opened its source and
 * confirmed it. The review that carries the check must name a human actor and
 * the `source-check` method; an agent pass, a review of another method, or no
 * review at all cannot make a record verified. The rule is true of the word
 * everywhere, so it lives here where the editorial tool can read it too.
 */
export function verifiedGrounded(record: {
	verification?: string;
	review?: { actor?: string; method?: string };
}): boolean {
	if (record.verification !== 'verified') return true;
	return record.review?.actor === 'human' && record.review?.method === 'source-check';
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * A citation record. The engine owns the kind: this is the schema its `parse`
 * reads sources with, narrowed to the languages this deployment declares.
 */
export const SourceSchema = kernelSchema<Source>('source');

// ---------------------------------------------------------------------------
// Institution
// ---------------------------------------------------------------------------

export const InstitutionSchema = atlasSchema<Institution>('institution');

// ---------------------------------------------------------------------------
// Role  (a canonical office, held over time by different people)
// ---------------------------------------------------------------------------

export const RoleSchema = atlasSchema<Role>('role');

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------

export const PersonSchema = atlasSchema<Person>('person');

// ---------------------------------------------------------------------------
// Position  (the join between a person, a role and a span of time)
// ---------------------------------------------------------------------------

export const PositionSchema = atlasSchema<Position>('position');

// ---------------------------------------------------------------------------
// Relationship
// ---------------------------------------------------------------------------

export const RelationshipSchema = atlasSchema<Relationship>('relationship');

// ---------------------------------------------------------------------------
// Groups  (subsection definitions for the network view)
// ---------------------------------------------------------------------------

export type GroupLayer = Narrow<AtlasRecord<typeof groupLayerSchema>, { layer: z.infer<typeof Layer> }>;
export const GroupLayerSchema = atlasSchema<GroupLayer>('group-layer');

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export const EventSchema = atlasSchema<EventRec>('event');

// ---------------------------------------------------------------------------
// Agreement  (a treaty or accession binding Tunisia to other states or bodies)
// ---------------------------------------------------------------------------

/**
 * A treaty or accession Tunisia is party to — a claim in the full sense of this
 * project, with the whole apparatus: a confidence, a basis, sources, disputes.
 * Trade quantities are NOT this; they are measurements and live in `flows/`
 * (see the header of data/agreements.yaml for the argument).
 *
 * `parties` names every other party. Tunisia is deliberately never listed — the
 * selection criterion of the file is that Tunisia is party to each one, so
 * naming it per record would be one more chance to omit it and have an arc
 * silently disappear. A party is either an alpha-2 state code or the id of an
 * institution record (an international organisation); build-data.ts checks the
 * latter against the graph and build-world.ts checks the former against the
 * globe's gazetteer.
 */
export const AgreementSchema = atlasSchema<Agreement>('agreement');

// ---------------------------------------------------------------------------
// World claims — the dossier's shelf (docs/plans/world-rebuild-v2.md §2.7/§4.4)
//
// Two shapes of claim about Tunisia's external relations, one record kind:
//   - AGGREGATES the measured families cannot cover (total public debt incl.
//     domestic, tourism receipts) — authored, tier-graded, boundary-stated.
//   - CONTESTED circulating claims (rule 6: kept, never deleted) — what the
//     popular account says about a counterparty, graded D with attribution,
//     beside the measured reality in `assessment`.
//
// `entity` is the graph institution id the claim is about, or null when the
// claim is about Tunisia itself. A claim is NEVER a measurement: it carries
// the full envelope and must carry at least one source.
// ---------------------------------------------------------------------------
export const WorldClaimSchema = atlasSchema<WorldClaim>('world-claim');

// ---------------------------------------------------------------------------
// v0.0.2 record kinds (spec §4): company, contract, licence, declaration,
// education. Every one composes the claim envelope (ClaimBodyV2) via
// withClaimEnvelope, so V18–V20 (derived-inferred completeness, C/D attribution,
// unsubstantiated attribution) apply from day one — and they all run in strict
// mode, so an undocumented key is a build error, not a silent drop (H2/V19).
// The kinds ship empty: the pipeline accepts zero records, so the schema itself
// is the feature gate and no invented data enters the graph (rule 8).
// ---------------------------------------------------------------------------

/**
 * Company records — a corporate identity keyed by an institution id, so the graph
 * node and the corporate record can never desync (spec §4.2).
 */
export const CompanySchema = atlasSchema<Company>('company');

/** Procurement / PPP / concession records (spec §4.4). */
export const ContractSchema = atlasSchema<Contract>('contract');

/** Time-bound rights between an operating company and a state body (spec A4.5). */
export const LicenceSchema = atlasSchema<Licence>('licence');

/**
 * A documented vacancy: an interval in which an office had no titular holder
 * (decision 0007). Without it the record shows a vacancy the same way it shows
 * an unknown, as a missing row, and the reader cannot tell "nobody held the
 * office, per this source" from "the record has no row".
 *
 * Vacant means no titular holder. An acting holder (a position with
 * `acting: true`) may sit inside the interval, which is how an interim reads:
 * the office is vacant and someone manages it. A titular position overlapping
 * a vacancy in the same role is a contradiction, and V32 fails the build.
 */
export const VacancySchema = atlasSchema<Vacancy>('vacancy');

/**
 * Declarations are records ABOUT documents, not about the world (spec §4.6):
 * the record captures that a document exists and what it says; it never asserts
 * the declared values are true.
 */
export const DeclarationSchema = atlasSchema<Declaration>('declaration');

/** Education records let multiple timelines overlap (spec §4.7). */
export const EducationSchema = atlasSchema<Education>('education');

// ---------------------------------------------------------------------------
// Era
// ---------------------------------------------------------------------------

export const EraSchema = atlasSchema<Era>('era');

// ---------------------------------------------------------------------------
// Open research question
// ---------------------------------------------------------------------------

/**
 * A typed narrative reference (v0.1.3 M2): the machine-checkable half of a
 * sentence that names a person in a post on a date. The engine owns the schema;
 * `scripts/consistency.ts` compares each reference against the canonical
 * positions and their intervals.
 */
export { NarrativeReferenceSchema };
export type NarrativeReference = z.infer<typeof NarrativeReferenceSchema>;

/**
 * Independent verification (v0.1.3 plan, milestone M2): a second human, blinded
 * to the project's own grade, assessed the same record under the study rubric.
 * Deliberately its own record type, not a flag on the editorial `review`, so the
 * populations are never added together. The engine owns the schema.
 */
export const VerificationSchema = kernelSchema<Verification>('verification');
export type Verification = VerificationRecord;

export const QuestionSchema = kernelSchema<Question>('question');

// ---------------------------------------------------------------------------
// Hypothesis
// ---------------------------------------------------------------------------

export const HypothesisSchema = kernelSchema<Hypothesis>('hypothesis');

/** Exceptions the build configures into the schema before parsing any record. */
export interface SchemaExceptions {
	/** `${kind}:${id}` whose empty `sources` list is an explicit, unexpired escape. */
	emptySources?: Set<string>;
	/** `${kind}:${id}:${derived}>${authored}` basis overrides awaiting review provenance. */
	basisOverrides?: Set<string>;
}

let schemaExceptions: SchemaExceptions = {};

let registerFor: { source: SchemaExceptions; register: ExceptionRegister } | undefined;

/** The configured exception sets, as the register the engine's schemas read. */
function configuredRegister(): ExceptionRegister {
	if (registerFor?.source === schemaExceptions) return registerFor.register;
	const sourceExceptions = new Map<string, { rule: 'no-source'; expires: string; reason: string }>();
	for (const key of schemaExceptions.emptySources ?? []) {
		sourceExceptions.set(key, { rule: 'no-source', expires: '9999-12-31', reason: 'configured by the build' });
	}
	const basisOverrides = new Map<string, { reason: string; source: string }>();
	for (const key of schemaExceptions.basisOverrides ?? []) {
		basisOverrides.set(key, { reason: 'configured by the build', source: 'data/source-exceptions.yaml' });
	}
	const register: ExceptionRegister = { sourceExceptions, basisOverrides };
	registerFor = { source: schemaExceptions, register };
	return register;
}

export type Source = Omit<SourceRecord, 'lang'> & { lang: SourceLanguage };
export type Institution = Narrow<
	AtlasRecord<typeof institutionSchema>,
	{ type: z.infer<typeof InstitutionType>; layer: z.infer<typeof Layer> }
>;
export type Role = AtlasRecord<typeof roleSchema>;
export type Person = Narrow<AtlasRecord<typeof personSchema>, { layers: z.infer<typeof Layer>[] }>;
export type Position = AtlasRecord<typeof positionSchema>;
type RelationshipRecord = AtlasRecord<typeof relationshipSchema>;
export type Relationship = Narrow<
	RelationshipRecord,
	{
		type: z.infer<typeof RelationshipType>;
		influence?: Narrow<NonNullable<RelationshipRecord['influence']>, { channel: (typeof INFLUENCE_CHANNELS)[number] }>;
	}
>;
type EventRecord = AtlasRecord<typeof eventSchema>;
export type EventRec = Narrow<
	EventRecord,
	{ impact?: { layer: z.infer<typeof Layer>[] } }
>;
export type Agreement = Narrow<AtlasRecord<typeof agreementSchema>, { kind: z.infer<typeof AgreementKind> }>;
export type WorldClaim = AtlasRecord<typeof worldClaimSchema>;
export type Company = AtlasRecord<typeof companySchema>;
export type Contract = AtlasRecord<typeof contractSchema>;
export type Licence = AtlasRecord<typeof licenceSchema>;
export type Vacancy = AtlasRecord<typeof vacancySchema>;
export type Declaration = AtlasRecord<typeof declarationSchema>;
export type Education = AtlasRecord<typeof educationSchema>;
export type Era = AtlasRecord<typeof eraSchema>;
export type Question = QuestionRecord;
export type Hypothesis = HypothesisRecord;
export type Dispute = z.infer<typeof DisputeSchema>;
export type Review = z.infer<typeof ReviewSchema>;

// ---------------------------------------------------------------------------
// Regions  — the administrative gazetteer (spec §8.1)
// ---------------------------------------------------------------------------

export const RegionSchema = z.strictObject({
	id: slug,
	kind: RegionKind,
	name_en: z.string().min(2),
	name_fr: z.string().optional(),
	name_ar: z.string().optional(),
	/** Parent region/governorate; the chain must terminate at a region (V10). */
	parent: slug.optional(),
	/** Official code where one exists (governorates: ISO 3166-2:TN, e.g. "TN-11"). */
	code: z.string().optional(),
	/**
	 * When the unit came into existence. Governorates were created over decades
	 * (14 in 1956, 24 by 2000), so an office over one cannot predate this date
	 * and the map shows the territory as not yet a governorate before it.
	 */
	created: dateToken.optional(),
	confidence: Confidence.default('A'),
	verification: VerificationStatus.default('unflagged'),
	sources: z.array(slug).min(1, 'every region needs at least one source'),
	/**
	 * Source-backed notes (English base; `_fr`/`_ar` siblings via the
	 * translatable spread below). The base key must exist or a non-strict
	 * z.object strips it on parse and the notes vanish from the graph.
	 */
	notes: z.array(z.string()).default([]),
	...translatable('notes', 'list')
});

// ---------------------------------------------------------------------------
// Places  — point features with coordinates (spec §8.2)
// ---------------------------------------------------------------------------

/**
 * Configure the exception sets the schemas read at every parse. The build and
 * the editorial tool call this before parsing any record.
 */
export function configureSchemaExceptions(exceptions: SchemaExceptions): void {
	schemaExceptions = exceptions;
}

// ---------------------------------------------------------------------------
// Explicit escapes
//
// The build must fail on every new violation, and it must not pretend that
// legacy violations do not exist. `data/source-exceptions.yaml` is the register:
// one entry per known record, each naming an owner, a deadline and a reason.
// An exception that has passed its deadline is a build failure, so the register
// cannot quietly become permanent. (V25/V27)
// ---------------------------------------------------------------------------

export const SourceExceptionRule = z.enum(['no-source', 'grade-a-primary', 'basis-override']);

export const SourceExceptionSchema = z
	.strictObject({
		rule: SourceExceptionRule,
		/** Record kind, matching the build's kind name (e.g. "person", "event"). */
		kind: z.string().min(1),
		id: slug,
		/** Who owns the work of removing the exception. */
		owner: z
			.string()
			.refine((v) => nonBlank(v, 2), 'owner must be at least 2 non-blank characters'),
		/** ISO date after which the exception stops working and the build fails. */
		deadline: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'deadline must be an ISO date (YYYY-MM-DD)')
			.refine((d) => {
				const [y, mo, da] = d.split('-').map(Number);
				const t = new Date(Date.UTC(y, mo - 1, da));
				return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
			}, 'deadline must be a calendar-valid date'),
		reason: z
			.string()
			.refine(
				(v) => nonBlank(v, 10),
				'reason must state, in at least 10 non-blank characters, why the exception exists'
			),
		/** basis-override entries only: the grade-implied baseline. */
		implied: Basis.optional(),
		/** basis-override entries only: the authored basis. */
		authored: Basis.optional()
	})
	.superRefine((e, ctx) => {
		if (e.rule === 'basis-override') {
			if (!e.implied || !e.authored) {
				ctx.addIssue({
					code: 'custom',
					message: 'a basis-override exception must name implied and authored bases'
				});
			} else if (!isBasisUpgrade(e.authored, e.implied)) {
				ctx.addIssue({
					code: 'custom',
					message: `basis-override exception is not an upgrade: "${e.implied}" → "${e.authored}"`
				});
			}
		} else if (e.implied || e.authored) {
			ctx.addIssue({
				code: 'custom',
				message: `implied/authored are only valid on basis-override entries (rule "${e.rule}")`
			});
		}
	});

export type SourceException = z.infer<typeof SourceExceptionSchema>;

export type Place = Narrow<AtlasRecord<typeof placeSchema>, { kind: z.infer<typeof PlaceKind> }>;
export const PlaceSchema = atlasSchema<Place>('place');

/**
 * data/countries.yaml — the world gazetteer crosswalk.
 *
 * Not a claim file: country identity is a lookup, and the file's own header says
 * why it deliberately carries no basis/confidence/sources (dressing "MM is
 * Myanmar" in the graded-claim apparatus would cheapen it everywhere else).
 * What this schema asserts instead is the crosswalk's shape and that every
 * alpha-2 code it names is well-formed — the identifications themselves are
 * printed and checked by build-world.ts rather than validated blindly.
 *
 * Strict: an undocumented key is a build failure, the same rule every other
 * data file obeys.
 */
const alpha2 = z.string().regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code');
const coordinate = z.tuple([z.number(), z.number()]);

export const CountriesFileSchema = z
	.object({
		/** Natural Earth feature name → ISO alpha-2 (the topology crosswalk). */
		aliases: z.record(z.string(), alpha2),
		/** World Bank creditor name → ISO alpha-2. */
		creditor_aliases: z.record(z.string(), alpha2),
		/** World Bank creditor name → graph institution id (a seat, not a dot). */
		creditor_institutions: z.record(z.string(), slug),
		/** Creditor names that are markets or syndicates, never a place. */
		creditor_not_places: z.array(z.string()),
		/** Anchor overrides for countries the 1:110m topology does not draw. */
		points: z.record(z.string(), coordinate)
	})
	.strict();


