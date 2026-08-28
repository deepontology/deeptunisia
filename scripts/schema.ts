import { z } from 'zod';
import { DEFAULT_PARAMETERS, type Parameters } from './parameters';

/**
 * Validation schema for the DeepTunisia knowledge graph.
 *
 * The build fails on any violation. That is deliberate: the credibility of this
 * project rests entirely on every claim being traceable, so "a fact with no source"
 * or "an edge pointing at nobody" must be a build error, not a runtime surprise.
 */

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids must be lowercase kebab-case');

/**
 * Confidence grading, retained as authoring shorthand.
 *   A  primary/official record
 *   B  several credible secondary sources agree
 *   C  single credible source, or a reasoned estimate
 *   D  circulating claim with no reliable evidence located
 */
export const Confidence = z.enum(['A', 'B', 'C', 'D']);

/**
 * EPISTEMIC BASIS — the user-facing axis, and the most important field in the
 * whole schema.
 *
 * Confidence answers "how strong is this?". Basis answers the more useful
 * question: "what KIND of claim is this?". A reasoned inference and a thinly
 * sourced report are both weak, but they are weak in completely different ways,
 * and collapsing them is how a research project quietly becomes a rumour mill.
 *
 *   documented       An official record, decree, gazette entry or primary document
 *                    states this.
 *   reported         One or more credible publications report it. Attributed, not
 *                    independently verified against a primary record.
 *   inferred         Nobody states this directly. It is reasoned from documented
 *                    structure, and must carry both the reasoning and what would
 *                    falsify it.
 *   unsubstantiated  A claim that circulates without reliable evidence. Recorded
 *                    rather than deleted, because pretending widely-believed claims
 *                    do not exist is its own distortion — but never rendered as
 *                    though it were evidence.
 *
 * Derived from `confidence` at build time unless stated explicitly.
 */
export const Basis = z.enum(['documented', 'reported', 'inferred', 'unsubstantiated']);

/** Where a claim sits in the research pipeline. Drives the open-questions page. */
export const Verification = z.enum(['verified', 'needs-primary-source', 'disputed']);

/**
 * WHO PRODUCED A TRANSLATION — the basis field, applied to language.
 *
 * A translation is a claim about what the original says, so it carries its standing
 * the same way every other claim here does. The four values are ordered, and each
 * says exactly what happened and no more:
 *
 *   machine           a model produced it in one pass; nothing checked it
 *   model-reviewed    a model produced it, and a separate model pass checked it
 *                     against the source. NO HUMAN HAS READ IT.
 *   machine-reviewed  a model produced it, and a human who reads both languages
 *                     approved it
 *   human             a person wrote it in that language
 *
 * `model-reviewed` exists because the alternative was worse. The agent doing this
 * work reviews its own output, which is a real and useful step — but filing that as
 * `machine-reviewed` would assert a human check that never happened, across tens of
 * thousands of words, in a project whose entire architecture is that an unverified
 * claim never wears the clothes of a verified one. A model checking a model is
 * simply not the same act, so it gets its own name and its own tier.
 *
 * Coverage is reported per tier and never summed into one percentage — see
 * `docs/i18n-spec.md` §4.4. A single "translated" number would let unreviewed text
 * read as finished work, which is the overstatement the human-review statistic
 * already exists to prevent.
 */
export const TranslatedBy = z.enum(['machine', 'model-reviewed', 'machine-reviewed', 'human']);
export type TranslatedByValue = z.infer<typeof TranslatedBy>;

export const TRANSLATION_TIERS = ['machine', 'model-reviewed', 'machine-reviewed', 'human'] as const;

/** The locales a prose field may carry beyond the English original. */
export const TRANSLATED_LOCALES = ['fr', 'ar'] as const;

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

/**
 * Provenance of the human check. The eventual ingestion pipeline proposes; a human
 * verifies. Recording who and when is what keeps that promise auditable instead of
 * rhetorical.
 */
export const ReviewMethod = z.enum(['source-check', 'dedup', 'attribute', 'accept-reject', 'judge']);

export const ReviewSchema = z.object({
	by: z.string().min(2),
	/** Calendar-valid ISO date. (V23) */
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'review date must be an ISO date (YYYY-MM-DD)')
		.refine(
			(d) => {
				// The regex is format-only: "2026-02-31" matches it and Date.UTC silently
				// rolls the impossible day over to 2026-03-03. The same round-trip the date
				// parser applies to interval tokens (V21) is applied here, or the strongest
				// human-check label on the site would accept dates that do not exist.
				const [y, mo, da] = d.split('-').map(Number);
				const t = new Date(Date.UTC(y, mo - 1, da));
				return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
			},
			'review date must be a calendar-valid date (V23)'
		),
	/** What kind of human check this was. (V23 — was free text, which the gazette guard read) */
	method: ReviewMethod,
	/**
	 * Free text describing what was actually checked. The method is now an enum;
	 * free-text claims such as "checked directly against the JORT decree text"
	 * live here so reviewOverclaims() can still read them.
	 */
	note: z.string().optional()
});

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
 * A competing claim about the same fact. When two sources disagree on a date, the
 * dataset records the disagreement rather than silently picking a winner.
 */
export const DisputeSchema = z.object({
	claim: z.string().min(3),
	held_by: z.string().min(2),
	source: slug.optional(),
	/** Why this dataset does or does not adopt this version. */
	assessment: z.string().optional(),
	/**
	 * Resolution state (spec §13.4): open (disagreement recorded, no decision),
	 * adopted (the dataset took one side and says so), rejected (the other
	 * version won). A dispute without a status is open by default.
	 */
	status: z.enum(['open', 'adopted', 'rejected']).optional(),
	/** Who resolved it, when, with what reasoning — the audit trail. */
	resolved_by: z.string().optional(),
	resolved_at: z.string().optional()
});

/**
 * Analytical layers. A person or institution can belong to several; those that
 * belong to several are exactly the "bridge" nodes the research is looking for.
 */
export const Layer = z.enum([
	'security', // military, police, national guard, intelligence, presidential security
	'political', // presidents, ministers, parties, parliament
	'economic', // business families, conglomerates, banks
	'media', // broadcasters, press, media-owner politicians
	'judicial', // courts, prosecutions
	'civil', // unions, associations, civil society
	'foreign' // foreign states, international organisations, external funders
]);

export const InstitutionType = z.enum([
	'presidency',
	'government',
	'ministry',
	'military',
	'police',
	'gendarmerie',
	'intelligence',
	'presidential-security',
	'party',
	'company',
	'family',
	'association',
	'media',
	'legislature',
	'judiciary',
	'foreign-state',
	'international-organisation',
	'ngo',
	// v0.0.2 — additive refinements (spec §4.1)
	'bank',
	'state-enterprise',
	'holding',
	'media-company',
	'foundation',
	'regulator',
	'sovereign-fund',
	'cooperative',
	'utility',
	'port-authority'
]);

export const RelationshipType = z.enum([
	'institutional', // held office within an institution
	'appointment', // A appointed B
	'succession', // A replaced B in a post
	'family', // documented family or marriage tie
	'business', // documented ownership or shareholding
	'party', // party membership or leadership
	'security', // documented military/police/intelligence working relationship
	'funding', // documented financial support between entities
	'diplomatic', // state-to-state or state-to-organisation relationship
	'political-alliance',
	'political-conflict',
	'prosecution', // the state prosecuted this person
	'reported-influence', // credible reporting claims influence; causality not established
	'allegation', // accusation requiring explicit labelling
	// v0.0.2 — additive (spec §5.1)
	'dismissal', // dismissing authority → person removed (a claim, not a position property)
	'ownership', // owner → owned entity
	'board', // person (or entity seat) → board of entity
	'shareholder', // shareholder → company
	'sponsorship', // sponsor → sponsored
	'partnership', // symmetric business partnership
	'franchise', // franchisor → franchisee
	'oversight', // overseer (state body) → institution
	'regulatory-authority', // regulator → regulated
	'licence', // issuer → holder; the licences.yaml record is authoritative
	'sanction', // issuer → target
	'coalition', // symmetric political coalition
	'endorsement', // endorser → endorsed
	'candidate-campaign', // candidate → campaign/party
	'influence', // documented influence with a stated channel
	'advisory' // advisor → advised
]);

/**
 * Edge direction semantics (spec §5.2). `directed` means from→to is the claim and
 * reversing it makes a different claim (V14); `symmetric` means the edge is its own
 * reverse; `contextual` means the type does not fix the orientation — the record's
 * description does.
 */
export type DirectionKind = 'directed' | 'symmetric' | 'contextual';

export const EDGE_DIRECTION: Record<z.infer<typeof RelationshipType>, DirectionKind> = {
	institutional: 'contextual',
	appointment: 'directed', // appointer → appointee
	succession: 'directed', // predecessor → successor
	dismissal: 'directed', // dismissing authority → person removed
	family: 'symmetric',
	business: 'contextual',
	party: 'contextual',
	security: 'contextual',
	funding: 'directed', // funder → funded
	diplomatic: 'symmetric',
	'political-alliance': 'symmetric',
	'political-conflict': 'symmetric',
	prosecution: 'directed', // prosecuting body → prosecuted person
	'reported-influence': 'contextual', // reporting direction is not the causal claim
	allegation: 'contextual', // who alleges whom is the record's business
	ownership: 'directed', // owner → owned entity
	board: 'directed', // person (or entity seat) → board of entity
	shareholder: 'directed', // shareholder → company
	sponsorship: 'directed', // sponsor → sponsored
	partnership: 'symmetric',
	franchise: 'directed', // franchisor → franchisee
	oversight: 'directed', // overseer (state body) → institution
	'regulatory-authority': 'directed', // regulator → regulated
	licence: 'directed', // issuer → holder; the licences.yaml record is authoritative
	sanction: 'directed', // issuer → target
	coalition: 'symmetric',
	endorsement: 'directed', // endorser → endorsed
	'candidate-campaign': 'directed', // candidate → campaign/party
	influence: 'directed', // influencer → influenced
	advisory: 'directed' // advisor → advised
};

/** The influence channel vocabulary (spec §5.3). */
export const INFLUENCE_CHANNELS = [
	'appointment',
	'advice-relationship',
	'money',
	'publicity',
	'marriage',
	'secret',
	''
] as const;

const dateToken = z
	.string()
	.regex(
		/^(?:~|<=|>=)?\d{4}(?:-\d{2}(?:-\d{2})?)?$|^(?:\?|ongoing|verified:\d{4}(?:-\d{2}(?:-\d{2})?)?)$/,
		'date token must be YYYY, YYYY-MM, YYYY-MM-DD, ~YYYY[-MM], <=YYYY[-MM], >=YYYY[-MM], ?, ongoing, or verified:YYYY-MM[-DD] (V21)'
	);

const intervalSpec = z.object({
	start: dateToken.optional(),
	end: dateToken.optional()
});

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export const SourceSchema = z.object({
	id: slug,
	title: z.string().min(3),
	publisher: z.string().min(2),
	/** Publication date, ISO. Optional only for undated primary records. */
	date: z.string().optional(),
	url: z.string().url(),
	/**
	 * Snapshot URL. Tunisian media and gazette links rot fast, so a source-backed
	 * site whose sources 404 in two years is worthless.
	 */
	archive_url: z.string().url().optional(),
	/**
	 * 1 official/primary (gazette, decrees, government portals)
	 * 2 institutional or peer-reviewed research
	 * 3 established international journalism
	 * 4 reputable regional media
	 * 5 lead requiring corroboration; never sufficient on its own
	 */
	tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
	lang: z.enum(['ar', 'fr', 'en', 'it', 'de']).default('en'),
	/** Short quotation supporting the claims that cite this source. */
	excerpt: z.string().optional(),

	// The original `excerpt` stays primary (quoted material). `excerpt_fr`/`excerpt_ar`
	// are AI-produced reading aids carried at the `machine` tier — the admission that
	// a model produced them and nothing checked them (i18n-spec §2.2 amendment). They
	// render subordinate, never in place of the original quote.
	...translatable('excerpt'),

	// docs/i18n-spec.md §2.1: a source title is part of the citation and always
	// displays in its original language. `title_gloss_fr`/`title_gloss_ar` are a
	// reading aid that renders BESIDE the original — never in place of it, never in
	// a citation string, never in the CSV export's title column.
	...translatable('title_gloss')
});

// ---------------------------------------------------------------------------
// Institution
// ---------------------------------------------------------------------------

export const InstitutionSchema = withClaimEnvelope(
	z.strictObject({
	id: slug,
	name_en: z.string().min(2),
	name_fr: z.string().optional(),
	name_ar: z.string().optional(),
	abbr: z.string().optional(),
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
	verification: Verification.default('verified'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims. (V18) */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	sources: z.array(slug).default([]),
	...translatable('summary')
	})
);

// ---------------------------------------------------------------------------
// Role  (a canonical office, held over time by different people)
// ---------------------------------------------------------------------------

export const RoleSchema = z.object({
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
	verification: Verification.default('verified'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims. (V18) */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
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
	z.strictObject({
	id: slug,
	role: slug,
	holder: slug,
	start: dateToken.optional(),
	end: dateToken.optional(),
	/** Interim/acting appointment, rendered differently on the Chronicle. */
	acting: z.boolean().default(false),
	/** Explicit predecessor override. Otherwise derived from the role's sequence. */
	predecessor: slug.nullable().optional(),
	/** This position supersedes another record of the same kind (spec §13.4). */
	supersedes: slug.optional(),
	confidence: Confidence.default('B'),
	/** Overrides the basis derived from `confidence`. */
	basis: Basis.optional(),
	verification: Verification.default('verified'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims: why this is reasoned, and what would refute it. */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
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
		verification: Verification.default('verified'),
		/** Whose claim this is, mandatory for anything below grade B. */
		attributed_to: z.string().optional(),
		/** Required for inferred claims. */
		reasoning: z.string().optional(),
		falsifiable_by: z.string().optional(),
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
			.object({
				pct: z.number().min(0).max(100),
				direct: z.boolean().default(true),
				beneficial: z.boolean().default(false),
				class: z.string().optional()
			})
			.optional(),
		finance: z
			.object({
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
			.object({
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
const MembershipRule = z.object({
	role: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	role_prefix: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	type: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
	members: z.array(z.string()).min(1).optional()
}).refine((r) => r.role || r.role_prefix || r.type || r.members, {
	message: 'membership rule must have at least one of: role, role_prefix, type, members'
});

const GroupDefSchema = z.object({
	header_en: z.string().min(1),
	header_fr: z.string().optional(),
	header_ar: z.string().optional(),
	membership: MembershipRule
});

export const GroupLayerSchema = z.object({
	layer: Layer,
	subsections: z.array(GroupDefSchema).min(1)
});

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export const EventSchema = withClaimEnvelope(
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
	impact: z.object({ layer: z.array(Layer).default([]) }).optional(),
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
	verification: Verification.default('verified'),
	/** Whose claim this is, mandatory below grade B. (V20) */
	attributed_to: z.string().optional(),
	/** Required for inferred claims. (V18) */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	/** Competing characterisations, shown side by side rather than adjudicated. */
	contested: z
		.array(z.object({ framing: z.string(), held_by: z.string(), source: slug.optional() }))
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

export const AgreementKind = z.enum([
	'association',
	'accession',
	'free-trade',
	'customs-union',
	'investment',
	'double-taxation',
	'other'
]);

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
		verification: Verification.default('verified'),
		/** Whose claim this is, mandatory for anything below grade B. */
		attributed_to: z.string().optional(),
		reasoning: z.string().optional(),
		falsifiable_by: z.string().optional(),
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
		verification: Verification.default('verified'),
		/** Whose claim this is, mandatory for anything below grade B. */
		attributed_to: z.string().optional(),
		reasoning: z.string().optional(),
		falsifiable_by: z.string().optional(),
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
	verification: Verification.default('verified'),
	/** Whose claim this is, mandatory for anything below grade B (V20). */
	attributed_to: z.string().optional(),
	/** Required for inferred claims (V18). */
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	disputes: z.array(DisputeSchema).default([]),
	review: ReviewSchema.optional(),
	sources: z.array(slug).min(1, 'every claim record needs at least one source')
};

/**
 * Company records — a corporate identity keyed by an institution id, so the graph
 * node and the corporate record can never desync (spec §4.2).
 */
export const CompanySchema = withClaimEnvelope(
	z.strictObject({
		id: slug, // MUST be the id of an institution of a company-like type (checked in build-data)
		legal_name_en: z.string().optional(),
		legal_name_fr: z.string().optional(),
		legal_name_ar: z.string().optional(),
		legal_form: z.string().optional(),
		registration: z
			.object({
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
		capital: z.object({ tnd: z.number().positive(), date: dateToken }).optional(),
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
		...claimFields
	})
);

/** Procurement / PPP / concession records (spec §4.4). */
export const ContractSchema = withClaimEnvelope(
	z.strictObject({
		id: slug,
		title_en: z.string().min(2),
		title_fr: z.string().optional(),
		title_ar: z.string().optional(),
		/** The buying institution in the graph. */
		institution: slug,
		kind: z.enum(['procurement', 'ppp', 'concession', 'privatisation', 'service', 'construction']),
		procurement: z
			.object({ mechanism: z.string().min(1), advertised: dateToken })
			.optional(),
		/**
		 * Attributed value — a fuzzy token like "~400000000". There is no "value
		 * filled from memory"; a contract with an `award` must either name who
		 * reports the figure or draw on a primary source (V4/V5).
		 */
		award: z
			.object({
				value: z.string().min(1),
				currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code'),
				year: z.number().int().min(1956).max(2030)
			})
			.optional(),
		winner: slug.optional(),
		losers: z.array(slug).default([]),
		financing: z.object({ type: z.string().min(1), lender: slug.nullable() }).optional(),
		status: z.enum(['advertised', 'awarded', 'signed', 'annulled', 'finished', 'cancelled', 'sued', 'unknown']),
		start: dateToken.optional(),
		end: dateToken.optional(),
		location: z.array(slug).default([]),
		/** Free-text editorial context (announced-vs-awarded notes, negative findings). */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...claimFields
	})
);

/** Time-bound rights between an operating company and a state body (spec A4.5). */
export const LicenceSchema = withClaimEnvelope(
	z.strictObject({
		id: slug,
		holder: slug,
		issuer: slug,
		kind: z.enum(['spectrum', 'banking', 'mineral', 'media', 'import-export']),
		grant: dateToken,
		term: z.object({ years: z.number().int().positive() }).optional(),
		scope: z.object({ frequency: z.string().optional(), region: z.string().min(1) }).optional(),
		fees: z
			.object({
				amount: z.number().nonnegative(),
				currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code'),
				year: z.number().int().min(1956).max(2030)
			})
			.optional(),
		status: z.enum(['active', 'expired', 'suspended', 'revoked']).default('active'),
		/** Free-text editorial context (decree references, licence chains). */
		notes: z.array(z.string()).default([]),
		...translatable('notes', 'list'),
		...claimFields
	})
);

/**
 * Declarations are records ABOUT documents, not about the world (spec §4.6):
 * the record captures that a document exists and what it says; it never asserts
 * the declared values are true.
 */
export const DeclarationSchema = withClaimEnvelope(
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
		...claimFields
	})
);

/** Education records let multiple timelines overlap (spec §4.7). */
export const EducationSchema = withClaimEnvelope(
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
		...claimFields
	})
);

// ---------------------------------------------------------------------------
// Era
// ---------------------------------------------------------------------------

export const EraSchema = z.object({
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
	verification: Verification.optional(),
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

export const QuestionSchema = z.object({
	id: slug,
	question: z.string().min(10),
	kind: z.enum(['verification', 'analytical']),
	status: z.enum(['open', 'partial', 'answered']).default('open'),
	/** Entities this question bears on, so the UI can surface it in context. */
	relates_to: z.array(slug).default([]),
	notes: z.string().optional(),
	/**
	 * P2 #18 — a sourced answer. An answer is a claim like any other: it carries
	 * its own basis/confidence/verification/attribution/reasoning/falsifier and
	 * at least one source, and renders with that standing, never as a fact.
	 * Questions themselves stay deliberately unsourced scaffolding (test-data
	 * excludes them from the zero-source ratchet); only the answer is a claim.
	 */
	answer: z.string().optional(),
	basis: Basis.optional(),
	confidence: Confidence.optional(),
	verification: Verification.optional(),
	attributed_to: z.string().optional(),
	reasoning: z.string().optional(),
	falsifiable_by: z.string().optional(),
	sources: z.array(slug).default([]),
	...translatable('question'),
	...translatable('notes'),
	...translatable('answer')
});

// ---------------------------------------------------------------------------
// Hypothesis
// ---------------------------------------------------------------------------

/**
 * One evidence finding tested against a hypothesis's falsifier clause (P2 #19).
 * A finding is itself a claim: it states which falsifier part was tested, the
 * direction of the result, the evidence prose (translated), the claim fields,
 * and the falsifier progress the finding makes. The generic TRANSLATABLE_FIELDS
 * loop cannot see nested prose, so test-data.ts enforces its `evidence_*`
 * provenance directly, the same way test-i18n treats sources.excerpt.
 */
const HypothesisEvidenceSchema = withClaimEnvelope(
	z.strictObject({
		/** Which clause of the hypothesis's `falsifiable_by` this finding tests. */
		falsifier_part: z.string().optional(),
		/** Direction of the finding: does the evidence support or refute the falsifier clause? */
		finding: z.enum(['supports', 'contradicts', 'neutral']),
		evidence: z.string().min(10),
		...translatable('evidence'),
		falsifier_progress: z.string().optional(),
		...translatable('falsifier_progress'),
		note: z.string().optional(),
		...translatable('note'),
		...claimFields
	})
);

export const HypothesisSchema = z.object({
	id: slug,
	label: z.string().min(3),
	statement: z.string().min(10),
	/** How well the current dataset supports it. */
	support: z.enum(['strong', 'moderate', 'insufficient', 'contradicted']),
	reasoning: z.string().min(10),
	/**
	 * What evidence would overturn the verdict above. Mandatory. A claim that cannot be
	 * falsified is not a hypothesis, it is a belief, and this project has no business
	 * publishing beliefs as findings.
	 *
	 * Note the field is anchored to `support`, not to `statement`. Where the verdict is
	 * `strong` the two coincide. Where it is `insufficient` or `contradicted` they do
	 * not, and the honest commitment is to name what would move the project to the
	 * opposite finding — otherwise a negative verdict is unfalsifiable, which is the
	 * exact failure this field exists to prevent.
	 *
	 * Must be specific to its own hypothesis. `test-data.ts` rejects duplicates: a
	 * falsifier shared between two hypotheses is a falsifier for neither.
	 */
	falsifiable_by: z.string().min(10),
	sources: z.array(slug).default([]),
	/** Evidence findings tested against the falsifier clauses (P2 #19). */
	evidence: z.array(HypothesisEvidenceSchema).default([]),
	...translatable('label'),
	...translatable('statement'),
	...translatable('reasoning'),
	...translatable('falsifiable_by')
});

/**
 * Derives epistemic basis from the authoring shorthand.
 *
 * Note carefully what basis describes: THE CLAIM ITSELF, not its dates. A position
 * record actually bundles two separable claims — "this person held this post" and
 * "between these two dates" — and they routinely have different standing. A
 * presidential security chief whose office is well reported but whose start date
 * nobody has published is a *reported* officeholding with an *inferred* span.
 *
 * So basis covers the officeholding, and the span carries its own uncertainty
 * through the four-field fuzzy interval plus the `datesInferred` flag. Merging the
 * two would make every imprecisely-dated fact look like speculation.
 */
export function deriveBasis(
	confidence: 'A' | 'B' | 'C' | 'D',
	verification: 'verified' | 'needs-primary-source' | 'disputed',
	explicit?: 'documented' | 'reported' | 'inferred' | 'unsubstantiated'
): 'documented' | 'reported' | 'inferred' | 'unsubstantiated' {
	if (explicit) return explicit;
	if (confidence === 'A') return 'documented';
	if (confidence === 'D') return 'unsubstantiated';
	// Grade C with no primary source is a reasoned estimate rather than a report.
	if (confidence === 'C' && verification === 'needs-primary-source') return 'inferred';
	return 'reported';
}

/**
 * V18/V20: the shared claim-envelope refines, applied to every claim-bearing
 * record kind so no future kind can forget them. The inferred/unsubstantiated
 * checks run on the DERIVED basis (deriveBasis) rather than the authored one, so
 * an explicit `basis` may override the derivation but a derived `inferred` with
 * no reasoning or falsifier fails exactly like an authored one.
 */
function withClaimEnvelope<S extends z.ZodObject<z.ZodRawShape>>(schema: S) {
	return schema
		.refine((r: any) => !((r.confidence === 'C' || r.confidence === 'D') && !r.attributed_to), {
			message: 'grade C/D claims must name who is making the claim (attributed_to)'
		})
		.refine(
			(r: any) =>
				!(deriveBasis(r.confidence, r.verification, r.basis) === 'inferred' &&
					(!r.reasoning || !r.falsifiable_by)),
			{ message: 'an inferred claim must state its reasoning and what would falsify it' }
		)
		.refine(
			(r: any) =>
				!(deriveBasis(r.confidence, r.verification, r.basis) === 'unsubstantiated' && !r.attributed_to),
			{ message: 'an unsubstantiated claim must name where the claim circulates' }
		);
}

export type Source = z.infer<typeof SourceSchema>;
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
export type Declaration = z.infer<typeof DeclarationSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Era = z.infer<typeof EraSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type Dispute = z.infer<typeof DisputeSchema>;
export type Review = z.infer<typeof ReviewSchema>;

// ---------------------------------------------------------------------------
// Regions  — the administrative gazetteer (spec §8.1)
// ---------------------------------------------------------------------------

export const RegionKind = z.enum(['region', 'governorate', 'delegation', 'municipality']);

export const RegionSchema = z.object({
	id: slug,
	kind: RegionKind,
	name_en: z.string().min(2),
	name_fr: z.string().optional(),
	name_ar: z.string().optional(),
	/** Parent region/governorate; the chain must terminate at a region (V10). */
	parent: slug.optional(),
	/** Official code where one exists (governorates: ISO 3166-2:TN, e.g. "TN-11"). */
	code: z.string().optional(),
	confidence: Confidence.default('A'),
	verification: Verification.default('verified'),
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

export const PlaceKind = z.enum([
	'port',
	'airport',
	'military-base',
	'power-plant',
	'pipeline',
	'water',
	'desalination',
	'road',
	'rail',
	'industrial-zone',
	'free-zone',
	'resource-field',
	'embassy',
	'palace',
	'town',
	'quarter'
]);

/** WGS84 longitude/latitude, within the jurisdiction's bounding box (V10).
 *
 * The box comes from data/parameters.yaml via configureSchema() — the build
 * calls it before any record is parsed. A fork retargeting the framework edits
 * the parameter file, not this validator. The default is the shipped Tunisia
 * box, byte-identical to the literal it replaced.
 */
let jurisdictionParams = DEFAULT_PARAMETERS;

export function configureSchema(p: Parameters): void {
	jurisdictionParams = p;
}

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


