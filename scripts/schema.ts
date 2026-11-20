import { z } from 'zod';
import { DEFAULT_PARAMETERS, type Parameters } from './parameters';
import {
	Basis,
	Confidence,
	DisputeSchema,
	RELATION_ALLOWED,
	REQUIRED_SOURCE_KINDS,
	ReviewActor,
	ReviewMethod,
	SourceRelation,
	TRANSLATION_TIERS,
	TranslatedBy,
	Verification as VerificationStatus,
	createReviewSchema,
	deriveBasis,
	isBasisUpgrade,
	nonBlank,
	reviewerLabelPattern,
	slug,
	withClaimEnvelope as engineClaimEnvelope,
	NarrativeReferenceSchema,
	type HypothesisRecord,
	type QuestionRecord,
	type SourceRelationValue,
	type SourceRecord,
	type VerificationRecord
} from 'deepepisteme/kernel';
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
	RelationshipType
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

/**
 * Is this archive URL a snapshot, or a lookup that resolves to one later?
 *
 * Only web.archive.org URLs are checked, because that is where the review found
 * generated links. `/web/2026/` and `/web/20230605/` are lookups: the Wayback
 * Machine resolves them to whichever capture is nearest, which is not evidence
 * that the page was ever read. A real capture carries the full 14-digit
 * timestamp, optionally with the replay modifier suffix (`if_`, `id_`). (V29)
 */
export function isArchiveSnapshot(url: string): boolean {
	if (!/^https?:\/\/(www\.)?web\.archive\.org\//i.test(url)) return true;
	return /^https?:\/\/(www\.)?web\.archive\.org\/web\/\d{14}(?:[a-z_]+)?\//i.test(url);
}

/**
 * CLAIM-LEVEL EVIDENCE (V29) — the passage, not the bibliography.
 *
 * `sources` says which records carry a claim; it does not say where in them, or
 * whether the cited page was ever captured. An evidence entry binds the claim to
 * an exact passage and a locator, and requires either a real capture or a dated
 * promise to make one. `lineage` names the originating report and each
 * republishing step, so two outlets sharing one wire count as one origin.
 */
export const EvidenceSchema = z
	.strictObject({
		passage_type: z.enum(['quote', 'paraphrase']),
		/** Verbatim for `quote`; a close reading, marked as such, for `paraphrase`. */
		passage: z
			.string()
			.refine((v) => nonBlank(v, 10), 'a passage must be at least 10 non-blank characters'),
		/** Page, article section or timestamp: where in the source the passage sits. */
		locator: z
			.string()
			.refine((v) => nonBlank(v, 2), 'evidence needs a locator (page, section or timestamp)'),
		retrieved_at: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'retrieved_at must be an ISO date (YYYY-MM-DD)'),
		/** A real snapshot, never a generated archive lookup. */
		capture_url: z
			.string()
			.url()
			.refine(
				isArchiveSnapshot,
				'capture_url must be an actual snapshot (timestamped), not a year-only or date-only archive lookup (V29)'
			)
			.optional(),
		/** When no capture exists yet, the date a retry is owed. */
		capture_missing: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'capture_missing must be an ISO retry date (YYYY-MM-DD)')
			.optional(),
		/** Originating report plus each republishing step, in order. */
		lineage: z
			.array(z.strictObject({ publisher: z.string().min(2), url: z.string().url().optional() }))
			.default([])
	})
	.superRefine((e, ctx) => {
		if (!e.capture_url && !e.capture_missing) {
			ctx.addIssue({
				code: 'custom',
				message: 'evidence needs a capture_url, or capture_missing with the retry date (V29)'
			});
		}
	});

const claimAxes = {
	/** How the cited sources relate to the claim itself (V26). */
	source_relation: SourceRelation.optional(),
	/**
	 * Count of independent origin groups behind the claim, never a count of
	 * URLs. Two outlets republishing one wire are one origin.
	 */
	independence: z.number().int().min(1).optional()
};

/** The locales a prose field may carry beyond the English original. */
export const TRANSLATED_LOCALES = ['fr', 'ar'] as const;

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
 * The vocabulary and source prefixes come from data/parameters.yaml (configured
 * by the build), not from literals — "the gazette" is a jurisdiction concept.
 */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function reviewOverclaims(method: string | undefined, sources: string[]): boolean {
	const gazette = jurisdictionParams.jurisdiction.gazette;
	const claimsGazette = new RegExp(
		`\\b(${gazette.vocabulary.map(escapeRegex).join('|')})\\b`,
		'i'
	);
	const gazetteSource = new RegExp(`^(${gazette.sourcePrefixes.map(escapeRegex).join('|')})`);
	if (!method || !claimsGazette.test(method)) return false;
	// "NOT verified against a JORT decree" is an honest disclaimer, not a claim.
	if (/\bnot\b[^.]{0,40}\b(verified|checked)\b/i.test(method)) return false;
	return !sources.some((s) => gazetteSource.test(s));
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

const dateToken = z
	.string()
	.regex(
		/^(?:~|<=|>=)?\d{4}(?:-\d{2}(?:-\d{2})?)?$|^(?:\?|ongoing|verified:\d{4}(?:-\d{2}(?:-\d{2})?)?)$/,
		'date token must be YYYY, YYYY-MM, YYYY-MM-DD, ~YYYY[-MM], <=YYYY[-MM], >=YYYY[-MM], ?, ongoing, or verified:YYYY-MM[-DD] (V21)'
	);

const intervalSpec = z.strictObject({
	start: dateToken.optional(),
	end: dateToken.optional()
});

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

export const InstitutionSchema = withClaimEnvelope(
	'institution',
	z.strictObject({
	id: slug,
	name_en: z.string().min(2),
	name_fr: z.string().optional(),
	name_ar: z.string().optional(),
	abbr: z.string().optional(),
	/**
	 * How the seats of a legislative term divide between parties where the
	 * members are not named: the party's institution id and its seat count.
	 * The members' own records replace it wherever they exist.
	 */
	seat_split: z.array(z.strictObject({ party: slug, seats: z.number().int().positive() })).optional(),
	aliases: z.array(z.string()).default([]),
	notes: z.array(z.string()).default([]),
	...translatable('notes', 'list'),
	type: InstitutionType,
	layer: Layer,
	/** Parent institution id, for the command-chain tree. */
	parent: slug.nullable().default(null),
	/**
	 * ISO 3166-1 alpha-2 for a foreign-state institution, so the world view can
	 * place its record on the globe and link trade/debt flows to the graph entity.
	 */
	iso2: z
		.string()
		.regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code')
		.optional(),
	/** ISO 3166-1 alpha-2 host country for an international organisation's seat. */
	seat: z
		.string()
		.regex(/^[A-Z]{2}$/, 'seat must be an ISO 3166-1 alpha-2 host country code')
		.optional(),
	active: intervalSpec.default({}),
	/** Display order within its layer on the Chronicle rows. */
	order: z.number().int().default(100),
	summary: z.string().optional(),
	confidence: Confidence.default('A'),
	basis: Basis.optional(),
	verification: VerificationStatus.default('unflagged'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims. (V18) */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	/**
	 * V27 — why the authored `basis` overrides the basis the grade implies. Min
	 * 10 non-blank characters when present; required for every new override.
	 */
	basis_override_reason: z.string().optional(),
	...claimAxes,
	evidence: z.array(EvidenceSchema).optional(),
	disputes: z.array(DisputeSchema).default([]),
	review: ReviewSchema.optional(),
	sources: z.array(slug).default([]),
	...translatable('summary')
	})
);

// ---------------------------------------------------------------------------
// Role  (a canonical office, held over time by different people)
// ---------------------------------------------------------------------------

export const RoleSchema = z.strictObject({
	id: slug,
	title_en: z.string().min(2),
	title_fr: z.string().optional(),
	title_ar: z.string().optional(),
	institution: slug,
	/**
	 * Formal authority weight, 0-100. This is an explicit editorial judgement, not a
	 * computed value, and it is published in the methodology page so readers can
	 * disagree with it. It exists so "formal authority" can be ranked without
	 * pretending the ranking is objective.
	 */
	authority: z.number().min(0).max(100),
	/**
	 * The region or governorate the office covers, for territorial offices such
	 * as a governor. One role per governorate keeps successions derivable per
	 * territory with no extra machinery. Must resolve in regions.yaml.
	 */
	region: slug.optional(),
	/**
	 * Concurrent seats in a collegial body (a legislative term). Holders of a
	 * seated role do not succeed one another, so no succession chain is derived
	 * for it: 161 members sitting at once is not 160 overlaps.
	 */
	seats: z.number().int().min(2).optional(),
	/** Chronicle row grouping; defaults to the institution. */
	row: slug.optional(),
	summary: z.string().optional(),
	sources: z.array(slug).default([]),
	...translatable('summary')
});

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------

export const PersonSchema = withClaimEnvelope(
	'person',
	z.strictObject({
	id: slug,
	name_en: z.string().min(2),
	name_fr: z.string().optional(),
	name_ar: z.string().optional(),
	/**
	 * Alternative transliterations. Essential here: the same officer appears as
	 * "Hajem" and "El Hajjam" across sources, and near-identical names belong to
	 * genuinely different people (Chokri Rahali versus Chokri Riahi).
	 */
	aliases: z.array(z.string()).default([]),
	birth: dateToken.optional(),
	death: dateToken.optional(),
	/** Place of birth — a places.yaml id once the gazetteer ships (R8). */
	birthplace: slug.optional(),
	/** ISO alpha-2 citizenships; feeds the flow layer. */
	nationality: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
	layers: z.array(Layer).min(1),
	/** One-line identification shown in tooltips. */
	tagline: z.string().optional(),
	summary: z.string().optional(),
	/** Career arc in short hops, e.g. ["Military", "Intelligence", "Presidency"]. */
	trajectory: z.array(z.string()).default([]),
	confidence: Confidence.default('B'),
	basis: Basis.optional(),
	verification: VerificationStatus.default('unflagged'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims. (V18) */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	/** V27 — why the authored `basis` overrides the grade-implied basis. */
	basis_override_reason: z.string().optional(),
	...claimAxes,
	evidence: z.array(EvidenceSchema).optional(),
	disputes: z.array(DisputeSchema).default([]),
	review: ReviewSchema.optional(),
	notes: z.array(z.string()).default([]),
	sources: z.array(slug).default([]),
	...translatable('tagline'),
	...translatable('summary'),
	...translatable('trajectory', 'list'),
	...translatable('notes', 'list'),
	...translatable('reasoning'),
	...translatable('falsifiable_by')
	})
);

// ---------------------------------------------------------------------------
// Position  (the join between a person, a role and a span of time)
// ---------------------------------------------------------------------------

export const PositionSchema = withClaimEnvelope(
	'position',
	z.strictObject({
	id: slug,
	role: slug,
	holder: slug,
	start: dateToken.optional(),
	end: dateToken.optional(),
	/** Interim/acting appointment, rendered differently on the Chronicle. */
	acting: z.boolean().default(false),
	/**
	 * The seat this position fills, for a role with `seats`. `id` names the
	 * constituency within the term; `region` places it on the map. An abroad
	 * constituency carries no region.
	 */
	constituency: z
		.strictObject({
			id: slug,
			name_en: z.string().min(2),
			name_fr: z.string().optional(),
			name_ar: z.string().optional(),
			region: slug.optional(),
			abroad: z.boolean().default(false)
		})
		.optional(),
	/** Explicit predecessor override. Otherwise derived from the role's sequence. */
	predecessor: slug.nullable().optional(),
	/** This position supersedes another record of the same kind (spec §13.4). */
	supersedes: slug.optional(),
	confidence: Confidence.default('B'),
	/** Overrides the basis derived from `confidence`. */
	basis: Basis.optional(),
	verification: VerificationStatus.default('unflagged'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims: why this is reasoned, and what would refute it. */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	/** V27 — why the authored `basis` overrides the grade-implied basis. */
	basis_override_reason: z.string().optional(),
	...claimAxes,
	evidence: z.array(EvidenceSchema).optional(),
	/** Competing versions of the same span, recorded rather than silently resolved. */
	disputes: z.array(DisputeSchema).default([]),
	/** This record was merged into another (V16 escape, spec §13.3). */
	merged_into: slug.optional(),
	review: ReviewSchema.optional(),
	notes: z.array(z.string()).default([]),
	sources: z.array(slug).min(1, 'every position needs at least one source'),
	...translatable('reasoning'),
	...translatable('falsifiable_by'),
	...translatable('notes', 'list')
	})
);

// ---------------------------------------------------------------------------
// Relationship
// ---------------------------------------------------------------------------

export const RelationshipSchema = withClaimEnvelope(
	'relationship',
	z.strictObject({
		/**
		 * Required, since July 2026.
		 *
		 * Relationships had no id for most of this project's life, and build-data.ts
		 * synthesised `rel-<index>-<from>-<to>` from the record's array position — so
		 * inserting one relationship renumbered every relationship after it. That was
		 * tolerable while the graph was only read, and became untenable the moment
		 * anything could reference a relationship: a discussion thread or a proposed
		 * change pinned to an id would silently re-point at a different pair of named
		 * people after the next insertion, with both records perfectly valid.
		 *
		 * Optional would leave the door open to a new relationship inheriting a
		 * positional id and reintroducing the whole problem for one record.
		 */
		id: slug,
		from: slug,
		to: slug,
		type: RelationshipType,
		/** Free-text qualifier, e.g. "son-in-law", "51% shareholder". */
		subtype: z.string().optional(),
		start: dateToken.optional(),
		end: dateToken.optional(),
		description: z.string().min(4),
		confidence: Confidence,
		/** Overrides the basis derived from `confidence`. */
		basis: Basis.optional(),
		verification: VerificationStatus.default('unflagged'),
		/** Whose claim this is, mandatory for anything below grade B. */
		attributed_to: z.string().optional(),
		/** Required for inferred claims. */
		reasoning: z.string().optional(),
		falsifiable_by: z.string().optional(),
		/** V27 — why the authored `basis` overrides the grade-implied basis. */
		basis_override_reason: z.string().optional(),
		...claimAxes,
		evidence: z.array(EvidenceSchema).optional(),
		disputes: z.array(DisputeSchema).default([]),
		/** This record was merged into another (V16 escape, spec §13.3). */
		merged_into: slug.optional(),
		/** This relationship supersedes another record of the same kind (§13.4). */
		supersedes: slug.optional(),
		review: ReviewSchema.optional(),
		sources: z.array(slug).default([]),
		...translatable('description'),
		...translatable('reasoning'),
		...translatable('falsifiable_by'),
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		// v0.0.2 rich edge surface (spec §5.3)
		equity: z
			.strictObject({
				pct: z.number().min(0).max(100),
				direct: z.boolean().default(true),
				beneficial: z.boolean().default(false),
				class: z.string().optional()
			})
			.optional(),
		finance: z
			.strictObject({
				amount: z.number().nonnegative(),
				currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code'),
				year: z.number().int().min(1956).max(2030)
			})
			.optional(),
		/**
		 * Influence metadata: allowed only on the influence families, and `strength`
		 * is an editorial judgment that must state its reasoning (V9) — the same
		 * contract as the `authority` weight on roles.
		 */
		influence: z
			.strictObject({
				channel: z.enum(INFLUENCE_CHANNELS),
				strength: z.number().min(0.3).max(1)
			})
			.optional()
	})
).refine((r) => !(r.type === 'allegation' && r.sources.length === 0), {
		message: 'an allegation must carry a source showing the claim circulates'
	})
	.refine((r) => !r.influence || ['influence', 'reported-influence', 'advisory'].includes(r.type), {
		message: 'influence metadata is allowed only on influence-family edges (influence, reported-influence, advisory) — V9'
	})
	.refine((r) => !(r.influence && !r.reasoning), {
		message: 'an influence strength is an editorial judgment and must state its reasoning (V9)'
	})
	.refine((r) => !(r.finance && !['funding', 'sponsorship', 'ownership'].includes(r.type)), {
		message: 'finance metadata is allowed only on funding, sponsorship and ownership edges (V13)'
	});

// ---------------------------------------------------------------------------
// Groups  (subsection definitions for the network view)
// ---------------------------------------------------------------------------

/** A single membership rule — an entity matches if ANY rule in the list matches. */
const MembershipRule = z.strictObject({
	role: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	role_prefix: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	type: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	members: z.array(z.string()).min(1).optional()
}).refine((r) => r.role || r.role_prefix || r.type || r.members, {
	message: 'membership rule must have at least one of: role, role_prefix, type, members'
});

const GroupDefSchema = z.strictObject({
	header_en: z.string().min(1),
	header_fr: z.string().optional(),
	header_ar: z.string().optional(),
	membership: MembershipRule
});

export const GroupLayerSchema = z.strictObject({
	layer: Layer,
	subsections: z.array(GroupDefSchema).min(1)
});

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export const EventSchema = withClaimEnvelope(
	'event',
	z.strictObject({
	id: slug,
	date: dateToken,
	/** Optional end for events that span time (a trial, an uprising). */
	date_end: dateToken.optional(),
	title_en: z.string().min(3),
	title_fr: z.string().optional(),
	title_ar: z.string().optional(),
	category: z.enum([
		'political',
		'military',
		'security',
		'economic',
		'constitutional',
		'election',
		'protest',
		'legal',
		// v0.0.2 (spec §6): award, investigation, media (major interviews / publications)
		'award',
		'investigation',
		'media'
	]),
	/** Finer cut than category, for the timeline lanes (spec §6). */
	subcategory: z.string().optional(),
	/** Place ids — validated once the places gazetteer ships (R8). */
	location: z.array(slug).default([]),
	/** Which layers the event moved, when the record can say so. */
	impact: z.strictObject({ layer: z.array(Layer).default([]) }).optional(),
	/** External references the event rests on (JORT decree ids, URLs). */
	documents: z.array(z.string()).default([]),
	materials: z.array(z.string()).default([]),
	/** Event-to-event edges (spec §6): a cause precedes its consequence (V8). */
	causes: z.array(slug).default([]),
	consequences: z.array(slug).default([]),
	/** Ruptures draw a labelled vertical line across every Chronicle row. */
	rupture: z.boolean().default(false),
	summary: z.string().min(10),
	actors: z.array(slug).default([]),
	institutions: z.array(slug).default([]),
	confidence: Confidence.default('A'),
	basis: Basis.optional(),
	verification: VerificationStatus.default('unflagged'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims. (V18) */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	/** V27 — why the authored `basis` overrides the grade-implied basis. */
	basis_override_reason: z.string().optional(),
	...claimAxes,
	evidence: z.array(EvidenceSchema).optional(),
	/** Competing characterisations, shown side by side rather than adjudicated. */
	contested: z
		.array(z.strictObject({ framing: z.string(), held_by: z.string(), source: slug.optional() }))
		.default([]),
	disputes: z.array(DisputeSchema).default([]),
	review: ReviewSchema.optional(),
	sources: z.array(slug).min(1, 'every event needs at least one source'),
	...translatable('summary')
	})
);

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
export const AgreementSchema = withClaimEnvelope(
	'agreement',
	z.strictObject({
		id: slug,
		title_en: z.string().min(3),
		title_fr: z.string().optional(),
		title_ar: z.string().optional(),
		kind: AgreementKind,
		parties: z
			.array(
				z
					.string()
					.regex(
						/^(?:[A-Z]{2}|[a-z0-9][a-z0-9-]*)$/,
						'a party is an ISO alpha-2 state code or an institution id'
					)
			)
			.min(1, 'an agreement needs at least one party'),
		signed: dateToken.optional(),
		in_force: dateToken.optional(),
		text_url: z.string().url().optional(),
		summary: z.string().min(10),
		confidence: Confidence,
		/** Overrides the basis derived from `confidence`. */
		basis: Basis.optional(),
		verification: VerificationStatus.default('unflagged'),
		/** Whose claim this is, mandatory for anything below grade B. */
		attributed_to: z.string().optional(),
		reasoning: z.string().optional(),
		falsifiable_by: z.string().optional(),
		/** V27 — why the authored `basis` overrides the grade-implied basis. */
		basis_override_reason: z.string().optional(),
		...claimAxes,
		evidence: z.array(EvidenceSchema).optional(),
		disputes: z.array(DisputeSchema).default([]),
		review: ReviewSchema.optional(),
		sources: z.array(slug).min(1, 'every agreement needs at least one source'),
		...translatable('summary')
	})
);

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
export const WorldClaimSchema = withClaimEnvelope(
	'world-claim',
	z.strictObject({
		id: slug,
		/** Graph institution id, or null when the claim is about Tunisia itself. */
		entity: slug.nullable().default(null),
		claim: z.string().min(10),
		/** What the evidence shows — the counter or the boundary, stated. */
		assessment: z.string().min(10),
		confidence: Confidence.default('C'),
		/** Overrides the basis derived from `confidence`. */
		basis: Basis.optional(),
		verification: VerificationStatus.default('unflagged'),
		/** Whose claim this is, mandatory for anything below grade B. */
		attributed_to: z.string().optional(),
		reasoning: z.string().optional(),
		falsifiable_by: z.string().optional(),
		/** V27 — why the authored `basis` overrides the grade-implied basis. */
		basis_override_reason: z.string().optional(),
		...claimAxes,
		evidence: z.array(EvidenceSchema).optional(),
		disputes: z.array(DisputeSchema).default([]),
		review: ReviewSchema.optional(),
		notes: z.array(z.string()).default([]),
		sources: z.array(slug).min(1, 'every world claim needs at least one source'),
		...translatable('claim'),
		...translatable('assessment'),
		...translatable('notes', 'list')
	})
);

// ---------------------------------------------------------------------------
// v0.0.2 record kinds (spec §4): company, contract, licence, declaration,
// education. Every one composes the claim envelope (ClaimBodyV2) via
// withClaimEnvelope, so V18–V20 (derived-inferred completeness, C/D attribution,
// unsubstantiated attribution) apply from day one — and they all run in strict
// mode, so an undocumented key is a build error, not a silent drop (H2/V19).
// The kinds ship empty: the pipeline accepts zero records, so the schema itself
// is the feature gate and no invented data enters the graph (rule 8).
// ---------------------------------------------------------------------------

/** The nine-field claim envelope, shared by every new kind. `sources` ≥ 1. */
const claimFields = {
	confidence: Confidence.default('B'),
	/** Overrides the basis derived from `confidence`. */
	basis: Basis.optional(),
	verification: VerificationStatus.default('unflagged'),
	/** Whose claim this is, mandatory for anything below grade B (V20). */
	attributed_to: z.string().optional(),
	/** Required for inferred claims (V18). */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	/** V27 — why the authored `basis` overrides the grade-implied basis. */
	basis_override_reason: z.string().optional(),
	...claimAxes,
	disputes: z.array(DisputeSchema).default([]),
	review: ReviewSchema.optional(),
	sources: z.array(slug).min(1, 'every claim record needs at least one source')
};

/**
 * Company records — a corporate identity keyed by an institution id, so the graph
 * node and the corporate record can never desync (spec §4.2).
 */
export const CompanySchema = withClaimEnvelope(
	'company',
	z.strictObject({
		id: slug, // MUST be the id of an institution of a company-like type (checked in build-data)
		legal_name_en: z.string().optional(),
		legal_name_fr: z.string().optional(),
		legal_name_ar: z.string().optional(),
		legal_form: z.string().optional(),
		registration: z
			.strictObject({
				/** The registry this number belongs to — one of the jurisdiction's listed registries. */
				registry: slug.refine(
					(r) => jurisdictionParams.jurisdiction.registry.registries.includes(r),
					{
						message: () =>
							`registry must be one of the jurisdiction's registries: ${jurisdictionParams.jurisdiction.registry.registries.join(', ')} (parameters.jurisdiction.registry.registries)`
					}
				),
				number: z.string().min(1),
				date: dateToken
			})
			.optional(),
		/** Tunisian "registre de commerce" CIN — exact identifier. */
		cin: z.string().optional(),
		status: z
			.enum(['active', 'dissolved', 'liquidated', 'dormant', 'confiscated', 'delisted'])
			.default('active'),
		founded: dateToken.optional(),
		/** Capital is a claim about a balance-sheet date (P7): numbers never float free. */
		capital: z.strictObject({ tnd: z.number().positive(), date: dateToken }).optional(),
		state_owned: z.boolean().default(false),
		activities: z.array(z.string()).default([]),
		/** Place id — validated once the places gazetteer ships (R8). */
		headquarters: slug.optional(),
		/** Free-text editorial context (registry gaps, flag resolution, capital mechanics). */
		notes: z.array(z.string()).default([]),
		/** Machine-reviewed translations of the notes (provenance carried by the _by field). */
		notes_fr: z.array(z.string()).optional(),
		notes_ar: z.array(z.string()).optional(),
		notes_fr_by: z.string().optional(),
		notes_ar_by: z.string().optional(),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
	})
);

/** Procurement / PPP / concession records (spec §4.4). */
export const ContractSchema = withClaimEnvelope(
	'contract',
	z.strictObject({
		id: slug,
		title_en: z.string().min(2),
		title_fr: z.string().optional(),
		title_ar: z.string().optional(),
		/** The buying institution in the graph. */
		institution: slug,
		kind: z.enum(['procurement', 'ppp', 'concession', 'privatisation', 'service', 'construction']),
		procurement: z
			.strictObject({ mechanism: z.string().min(1), advertised: dateToken })
			.optional(),
		/**
		 * Attributed value — a fuzzy token like "~400000000". There is no "value
		 * filled from memory"; a contract with an `award` must either name who
		 * reports the figure or draw on a primary source (V4/V5).
		 */
		award: z
			.strictObject({
				value: z.string().min(1),
				currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code'),
				year: z.number().int().min(1956).max(2030)
			})
			.optional(),
		winner: slug.optional(),
		losers: z.array(slug).default([]),
		financing: z.strictObject({ type: z.string().min(1), lender: slug.nullable() }).optional(),
		status: z.enum(['advertised', 'awarded', 'signed', 'annulled', 'finished', 'cancelled', 'sued', 'unknown']),
		start: dateToken.optional(),
		end: dateToken.optional(),
		location: z.array(slug).default([]),
		/** Free-text editorial context (announced-vs-awarded notes, negative findings). */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
	})
);

/** Time-bound rights between an operating company and a state body (spec A4.5). */
export const LicenceSchema = withClaimEnvelope(
	'licence',
	z.strictObject({
		id: slug,
		holder: slug,
		issuer: slug,
		kind: z.enum(['spectrum', 'banking', 'mineral', 'media', 'import-export']),
		grant: dateToken,
		term: z.strictObject({ years: z.number().int().positive() }).optional(),
		scope: z
			.strictObject({ frequency: z.string().optional(), region: z.string().min(1) })
			.optional(),
		fees: z
			.strictObject({
				amount: z.number().nonnegative(),
				currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code'),
				year: z.number().int().min(1956).max(2030)
			})
			.optional(),
		status: z.enum(['active', 'expired', 'suspended', 'revoked']).default('active'),
		/** Free-text editorial context (decree references, licence chains). */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
	})
);

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
export const VacancySchema = withClaimEnvelope(
	'vacancy',
	z.strictObject({
		id: slug,
		/** The office that stood empty. Must be a known, non-seated role (V32). */
		role: slug,
		/** When the last titular holder left. */
		start: dateToken,
		/** When the next titular holder took office; `ongoing` while still vacant. */
		end: dateToken,
		/** Free-text editorial context (who managed the office meanwhile, gazette checks). */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...translatable('reasoning'),
		...translatable('falsifiable_by'),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
	})
);

/**
 * Declarations are records ABOUT documents, not about the world (spec §4.6):
 * the record captures that a document exists and what it says; it never asserts
 * the declared values are true.
 */
export const DeclarationSchema = withClaimEnvelope(
	'declaration',
	z.strictObject({
		id: slug,
		/** Person id; null for regime/class records (a legal regime, a class of declarants). */
		declarer: slug.nullable(),
		date: dateToken,
		kind: z.enum(['asset-declaration', 'income', 'member-of-something', 'dgi-file']),
		jurisdiction: slug,
		/** Institution holding the document, when it is a graph entity. */
		body: slug.nullable(),
		summary: z.string().min(1),
		...translatable('summary'),
		status: z.enum(['available', 'referred', 'sealed', 'destroyed']).default('available'),
		/** Free-text editorial context (filing history, verification status). */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
	})
);

/** Education records let multiple timelines overlap (spec §4.7). */
export const EducationSchema = withClaimEnvelope(
	'education',
	z.strictObject({
		id: slug,
		person: slug,
		/** Graph institution when extant; null when the school has no record. */
		institution: slug.nullable(),
		degree_en: z.string().min(1),
		degree_fr: z.string().optional(),
		degree_ar: z.string().optional(),
		field: z.string().optional(),
		...translatable('field'),
		kind: z.enum(['phd', 'masters', 'licence', 'baccalaureate', 'certificate', 'other']),
		start: dateToken.optional(),
		end: dateToken.optional(),
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
	})
);

// ---------------------------------------------------------------------------
// Era
// ---------------------------------------------------------------------------

export const EraSchema = z.strictObject({
	id: slug,
	label_en: z.string().min(2),
	label_fr: z.string().optional(),
	label_ar: z.string().optional(),
	start: dateToken,
	end: dateToken,
	/** The analytical claim about how power was distributed in this era. */
	thesis: z.string().min(10),
	/** Compact power-distribution formula, e.g. "Presidency + Interior > Military". */
	formula: z.string().optional(),
	accent: z.string().regex(/^#[0-9a-f]{6}$/i),
	sources: z.array(slug).default([]),
	// P2 #17 — eras are analytical theses; the source-attachment pass (2026-08-13)
	// grades them like any claim: confidence, whose synthesis it is, the reasoning
	// that supports the thesis, and what would falsify it.
	confidence: Confidence.optional(),
	verification: VerificationStatus.optional(),
	attributed_to: z.string().optional(),
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	...translatable('thesis'),
	...translatable('reasoning'),
	...translatable('falsifiable_by')
});

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

/**
 * V18/V20/V27: the shared claim-envelope refines, applied to every claim-bearing
 * record kind so no future kind can forget them. The inferred/unsubstantiated
 * checks run on the DERIVED basis (deriveBasis) rather than the authored one, so
 * an explicit `basis` may override the derivation but a derived `inferred` with
 * no reasoning or falsifier fails exactly like an authored one.
 *
 * Mandatory prose is checked with `nonBlank`, not truthiness: a string of spaces
 * is a missing field, and the review that found the bypass is the regression
 * fixture.
 *
 * A basis stronger than the grade implies is an override (V27). It requires a
 * review object, reasoning, a falsifier when an inference is involved, at least
 * one source and `basis_override_reason`. Overrides that pre-date the rule are
 * enumerated in `data/source-exceptions.yaml` with an owner and a deadline; they
 * are exempt from the requirement, never from visibility: the build still emits
 * `basis_derived` beside the authored `basis`.
 */
function withClaimEnvelope<S extends z.ZodObject<z.ZodRawShape>>(kind: string, schema: S) {
	// The refines live in the engine kernel. The exception sets arrive through a
	// getter, so configureSchema() can replace them between parses, and the two
	// texts below keep every message this tree has always published.
	return engineClaimEnvelope(kind, schema, () => schemaExceptions, {
		exceptionFile: 'data/source-exceptions.yaml',
		basisOverrideRule: 'V27'
	});
}

export type Source = Omit<SourceRecord, 'lang'> & { lang: SourceLanguage };
export type Institution = z.infer<typeof InstitutionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type EventRec = z.infer<typeof EventSchema>;
export type Agreement = z.infer<typeof AgreementSchema>;
export type WorldClaim = z.infer<typeof WorldClaimSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type Contract = z.infer<typeof ContractSchema>;
export type Licence = z.infer<typeof LicenceSchema>;
export type Vacancy = z.infer<typeof VacancySchema>;
export type Declaration = z.infer<typeof DeclarationSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Era = z.infer<typeof EraSchema>;
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

/** WGS84 longitude/latitude, within the jurisdiction's bounding box (V10).
 *
 * The box comes from data/parameters.yaml via configureSchema() — the build
 * calls it before any record is parsed. A fork retargeting the framework edits
 * the parameter file, not this validator. The default is the shipped Tunisia
 * box, byte-identical to the literal it replaced.
 */
let jurisdictionParams = DEFAULT_PARAMETERS;

export function configureSchema(p: Parameters, exceptions: SchemaExceptions = {}): void {
	jurisdictionParams = p;
	schemaExceptions = exceptions;
}

/**
 * Configure only the exception sets, leaving the jurisdiction parameters at
 * their current values. Used by tests and tooling that do not load a
 * jurisdiction parameter file.
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

export const Coordinates = z
	.array(z.number())
	.length(2)
	.refine(
		([lon, lat]) => {
			const b = jurisdictionParams.jurisdiction.bbox;
			return lon >= b.lonMin && lon <= b.lonMax && lat >= b.latMin && lat <= b.latMax;
		},
		{
			message: () => {
				const b = jurisdictionParams.jurisdiction.bbox;
				return `coordinates must fall inside ${jurisdictionParams.jurisdiction.name} (lon ${b.lonMin}..${b.lonMax}, lat ${b.latMin}..${b.latMax})`;
			}
		}
	);

export const PlaceSchema = withClaimEnvelope(
	'place',
	z.strictObject({
		id: slug,
		kind: PlaceKind,
		name_en: z.string().min(2),
		name_fr: z.string().optional(),
		name_ar: z.string().optional(),
		/** Region/governorate this place belongs to (V10: chain must terminate). */
		parent: slug.optional(),
		/** [lon, lat] WGS84 — mandatory for point classes (V10). */
		coordinates: Coordinates.optional(),
		/** Strategic asset flag: feeds the economic layer (spec §7.1). */
		asset: z.boolean().default(false),
		/** Graph entity (institution/person) that owns or operates it, when known. */
		owner: slug.optional(),
		...claimFields,
		evidence: z.array(EvidenceSchema).optional(),
		/**
		 * Source-backed notes (English base; `_fr`/`_ar` siblings via the
		 * translatable spread below). The base key was omitted when the schema
		 * shipped empty; every other claim-bearing kind carries it, and the
		 * first place records (2026-08-08 merge) carry registry cross-checks
		 * and selection flags that must not be dropped (strict mode otherwise
		 * rejects plain `notes`).
		 */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list')
	})
);

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


