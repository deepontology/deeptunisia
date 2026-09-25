/**
 * Claim-to-code-to-test matrix (Phase 5).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The release paper makes claims about the build. Some of them are enforced by
 * code and pinned by a test; some are measured but not gated; some are designs
 * that are not implemented. A reader checking the paper needs one artifact that
 * says, claim by claim, which of the three it is, where the code lives and which
 * assertion proves it. `output/claim-matrix.csv` is that artifact.
 *
 * The matrix is generated, not hand-written, for the same reason the paper's
 * numbers are stat tags: a hand-maintained claim list drifts. `npm run
 * claim:matrix` emits the CSV; `scripts/test-claim-matrix.ts` recomputes it from
 * this module and checks the pointers:
 *
 *   * every shipped+tested row names a real file and a substring that occurs in
 *     it, for both the code pointer and the test pointer;
 *   * every shipped+untested row names no test pointer and says how it is
 *     verified (a command or an artifact), so "untested" is not silent;
 *   * every proposed row is not allowed to carry a passing-test pointer.
 *
 * Status vocabulary (spec Phase 5):
 *   shipped+tested      in the build, pinned by an assertion in `npm run test`
 *   shipped+untested    in the build or emitted as an artifact, no assertion
 *   proposed            stated design, not implemented; must not render as enforced
 *   externally evaluated  evaluation performed outside the project (none yet)
 *
 * Pointers use the form `path :: substring`. Multiple pointers are separated by
 * `; `. The substring is the function, constant or assertion name a reader can
 * search for; the validator checks it actually occurs.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const STATUSES = [
	'shipped+tested',
	'shipped+untested',
	'proposed',
	'externally evaluated'
] as const;
export type MatrixStatus = (typeof STATUSES)[number];

export interface MatrixRow {
	/** Paper section, table or figure the claim comes from. */
	paper_ref: string;
	/** The claim, in the paper's terms, short enough to check. */
	claim_text: string;
	status: MatrixStatus;
	/** file :: function/constant; `none` when the claim is not code. */
	code_pointer: string;
	/** suite :: assertion name; `none` when no assertion pins the claim. */
	test_pointer: string;
	/** How it is verified when untested, and what a reader must know. */
	notes: string;
}

export const CLAIM_MATRIX: MatrixRow[] = [
	// -----------------------------------------------------------------------
	// The stat-tag machinery
	// -----------------------------------------------------------------------
	{
		paper_ref: '§1, §8.2, Appendix (stat tags)',
		claim_text:
			'Every dataset number in the paper is a stat tag rewritten by the build at every `npm run data`; a hand-edit fails the suite.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: const STAT_DOCS; scripts/build-data.ts :: const stats',
		test_pointer:
			'scripts/test-paper.ts :: every stat tag in every gated paper matches the emitted stats.json; scripts/test-paper.ts :: every required stat key is tagged in',
		notes:
			'The v0.1.2 source carries 48 unique keys against a 46-key required list (commitSha and roles tag separately). `npm run data` rewrites the tag and `npm run test` fails on drift in any gated paper.'
	},
	{
		paper_ref: '§3, Table 2 (kind counts)',
		claim_text:
			'The scale table reports the live count of every claim kind it lists (agreements, questions, hypotheses, companies, contracts, licences, declarations, education, regions, places), not a snapshot.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: agreements: String(agreements.length)',
		test_pointer: 'scripts/test-paper.ts :: every required stat key is tagged in',
		notes:
			'C13 of the successor: these rows were hand-typed and had drifted (agreements 7 vs 23, companies 8 vs 25, places 12 vs 44). They are emitted stats now, and the successor gate requires the keys.'
	},
	{
		paper_ref: 'Table 5, §5.4 (constants)',
		claim_text:
			'The dataset floor and cutoff the paper quotes are the values in the parameter file, and the paper tags them rather than restating them.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: cutoff: parameters.time.cutoff; data/parameters.yaml :: time:',
		test_pointer:
			'scripts/test-parameters.ts :: emitted meta.floor is the epoch of 1956-03-20 UTC; scripts/test-paper.ts :: every required stat key is tagged in',
		notes:
			'C12 of the successor: the prose quoted 2026-07-26 after the parameter file had advanced to 2026-09-10, because the value was published as data but not as a tag.'
	},
	{
		paper_ref: '§8.2, Appendix (stat tags)',
		claim_text:
			'A hand-edit of a published stat fails the test suite, not only for the paper but for every document the build rewrites.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: const STAT_DOCS',
		test_pointer:
			'scripts/test-data.ts :: published statistics match the graph; scripts/test-data.ts :: static/llms.txt',
		notes:
			'The v0.1.1 gate covered only the paper, while STAT_DOCS also rewrites README, AGENTS, DESIGN and static/llms.txt. The successor release extended the existing test-data assertion to llms.txt and added the paper sources to test-paper, so the §8.2 promise holds for the whole set.'
	},
	{
		paper_ref: 'Appendix (gate-required stat tags)',
		claim_text:
			'The appendix lists every required stat key and the gate requires each one to be tagged with the emitted value.',
		status: 'shipped+tested',
		code_pointer: 'scripts/test-paper.ts :: REQUIRED_KEYS',
		test_pointer:
			'scripts/test-paper.ts :: the stat-tag appendix lists every required key in',
		notes:
			'The appendix heading says "all N keys"; the assertion pins N to REQUIRED_KEYS.length and requires one appendix tag per key in the newest gated paper, so the appendix cannot fall behind the list. The successor added claimRecords and intervalTrims (34 keys).'
	},

	// -----------------------------------------------------------------------
	// The evidence envelope and its derivation
	// -----------------------------------------------------------------------
	{
		paper_ref: '§5.2, Table 4',
		claim_text:
			'Every claim-bearing kind composes the same nine-field envelope through one schema function; no kind can carry less metadata.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: withClaimEnvelope; scripts/build-data.ts :: claimKindRegistry',
		test_pointer:
			'scripts/test-validators.ts :: V18/20: a clean position parses; scripts/test-validators.ts :: whitespace attributed_to',
		notes:
			'15 kinds in claimKindRegistry; the fail-path reaches the build through the schema on every parse.'
	},
	{
		paper_ref: '§5.2, Table 4',
		claim_text:
			'`basis` is derived from confidence and verification by a published, deterministic mapping; an author cannot upgrade a claim by omitting a field.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: deriveBasis',
		test_pointer:
			'scripts/test-data.ts :: the deriveBasis truth table is pinned — every input combination',
		notes:
			'15 input combinations (12 confidence × verification pairs plus 3 explicit-override cases) match the published table in §5.2.'
	},
	{
		paper_ref: '§5.2, §5.5, §7 (H1)',
		claim_text:
			'A stronger authored basis is an override and requires review, reasoning, a falsifier for inferred targets, at least one source, and a stated reason; both the authored and derived basis are emitted.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: withClaimEnvelope; scripts/build-data.ts :: basisFields',
		test_pointer:
			'scripts/test-validators.ts :: V27: a reported-over-inferred override without review is rejected; scripts/test-pipeline.ts :: the override probe fails and names the record (1B)',
		notes:
			'`output/basis-overrides.csv` is the work list; live legacy escapes are in `data/source-exceptions.yaml` with an owner and deadline, and the emitted record carries `basis_derived` beside `basis`.'
	},
	{
		paper_ref: '§5.2, §6, §7 (H2)',
		claim_text:
			'An undocumented key anywhere in a claim-bearing record, including nested review, dispute and interval objects, fails the build instead of being silently stripped.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: ReviewSchema; scripts/schema.ts :: strictObject',
		test_pointer:
			'scripts/test-validators.ts :: V28: an unknown review key (outcome) fails instead of being stripped; scripts/test-pipeline.ts :: the nested-outcome probe fails and names the record (1C)',
		notes:
			'V28 covers review, dispute, interval, equity, finance, influence, registration, capital, award, fees and impact objects plus every top-level claim schema.'
	},

	// -----------------------------------------------------------------------
	// Table 7: the seven hardening rows (V18–V24)
	// -----------------------------------------------------------------------
	{
		paper_ref: 'Table 7 (H1), §6 (V18)',
		claim_text:
			'An inference never ships without reasoning and a falsifier, checked on the derived basis for every claim kind.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: withClaimEnvelope; scripts/schema.ts :: nonBlank',
		test_pointer:
			'scripts/test-validators.ts :: whitespace reasoning; scripts/test-data.ts :: every inferred claim states a falsifier',
		notes:
			'The whitespace fixture runs over all 13 envelope kinds; the graph sweep checks the built positions.'
	},
	{
		paper_ref: 'Table 7 (H2), §6 (V19)',
		claim_text:
			'A field written in the source file reaches the reader; silent stripping is impossible.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: strictObject',
		test_pointer:
			'scripts/test-validators.ts :: V28: an unknown person key fails; scripts/test-validators.ts :: V28: an unknown nested dispute key fails',
		notes:
			'V19 is the strict-schema audit; V28 is its recursive extension to nested objects. One rule, two numbers in the register.'
	},
	{
		paper_ref: 'Table 7 (H3), §6 (V20)',
		claim_text: 'Grade C/D claims name who is making them, on every claim kind.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: withClaimEnvelope',
		test_pointer:
			'scripts/test-validators.ts :: V20: grade C without attributed_to is rejected; scripts/test-data.ts :: every C/D evidence finding names who makes the claim (V20)',
		notes: 'The envelope refine is shared by all claim kinds; the graph sweep covers hypotheses and relations.'
	},
	{
		paper_ref: 'Table 7 (H4), §5.4, §6 (V21)',
		claim_text:
			'A date that cannot exist fails the build; `2018-02-31` is rejected, not rolled over to a different day.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: date token must be; scripts/dates.ts :: parseDateEdge',
		test_pointer:
			'scripts/test-validators.ts :: V21: 2018-02-31 is rejected by the date parser (m15); scripts/test-data.ts :: V21: no calendar-rollover date in the dataset',
		notes: 'Regex grammar at the schema boundary plus a calendar round-trip in the parser.'
	},
	{
		paper_ref: 'Table 7 (H5), §5.4, §6 (V22)',
		claim_text:
			'Contradictory intervals fail unless disputed; envelope clamps are computed by one rule and every clamp is published.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: intervalTrims; scripts/build-data.ts :: safeInterval',
		test_pointer:
			'scripts/test-data.ts :: V22: every clamped interval of the current graph appears in the published trims report; scripts/test-data.ts :: V22: no interval has an inverted core',
		notes:
			'The freshness check closes mutation m02: a stale `interval-trims.json` cannot mask a disabled publication.'
	},
	{
		paper_ref: 'Table 7 (H6), §6 (V23)',
		claim_text:
			'Human review is real: a review date must be a calendar-valid day and a method must be an enum value, and the published statistic cannot count a substance-free review object.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: ReviewSchema; scripts/review-coverage.ts :: summariseReview',
		test_pointer:
			'scripts/test-validators.ts :: V23: 2026-02-31 is rejected — not a real day (m10); scripts/test-data.ts :: V23: every review has a calendar-valid date and an enum method',
		notes:
			'Method enum: source-check, dedup, attribute, accept-reject, judge. The review-denominator rule is in `scripts/review-coverage.ts` and in §8.2 of the paper.'
	},
	{
		paper_ref: '§7 (H6 extension), §8.2',
		claim_text:
			'The published "reviewed" statistic was itself a first-match partition: an inferred claim that named its claimant was counted under `attributed`, so the published inferred bucket read 0/0 while 32 inferred claims existed. Found, published and fixed.',
		status: 'shipped+tested',
		code_pointer: 'scripts/review-coverage.ts :: reviewFlagsOf; scripts/review-coverage.ts :: summariseReview',
		test_pointer:
			'scripts/test-validators.ts :: Phase 8: an inferred claim that names its source carries both flags; scripts/test-data.ts :: the published risk flags overlap rather than partition',
		notes:
			'The same class as the H6 row: a statistic that passed its shape check while hiding the records it claimed to count. Mutation m49 pins the regression to a first-match chain.'
	},
	{
		paper_ref: 'Table 7 (H7), §5.5, §6 (V24)',
		claim_text:
			'Successions are derived, thresholds are published as data, and the published gap and overlap counts are reproducible from the emitted constants.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: successionMeta',
		test_pointer:
			'scripts/test-data.ts :: V24: succession gaps reproducible from the emitted constants',
		notes: 'Unknown-end exemptions surface as open items rather than being silently exempt.'
	},

	// -----------------------------------------------------------------------
	// Citation guarantee, grade-A primary, kind versus strength
	// -----------------------------------------------------------------------
	{
		paper_ref: '§5.2, §5.10, Table 4',
		claim_text:
			'Grade A means a primary record: every `confidence: A` claim cites a tier-1 or tier-2 source, or carries a live, dated exception.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: grade A must cite at least one tier-1 or tier-2 source',
		test_pointer:
			'scripts/test-pipeline.ts :: a grade-A record without a tier-1/2 source fails and names the record (V25); scripts/test-data.ts :: every grade-A record without a tier-1/2 source is on the exception register (V25)',
		notes:
			'Exceptions live in `data/source-exceptions.yaml` with owner and deadline; an expired deadline fails the build. The register currently holds the legacy grade-A escapes.'
	},
	{
		paper_ref: '§5.2, §5.10 (R(D)), Table 4',
		claim_text:
			'Every claim record cites at least one source, and legacy kinds that predate the envelope are pinned by a ratchet rather than exempt.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: claimKindRegistry; scripts/build-data.ts :: checkSources',
		test_pointer:
			'scripts/test-validators.ts :: V18: a position with zero sources is rejected; scripts/test-data.ts :: every unsourced claim record is on the exception register (rule 2)',
		notes:
			'The unowned ceiling from the v0.1.1 mutation pass is now the exception register plus this graph assertion: an unsourced record fails the build unless a named, dated no-source entry holds it, and an expired entry fails. The graph-side half proves the published graph and the register agree.'
	},
	{
		paper_ref: '§3, §5.2 (kind versus strength)',
		claim_text:
			'Explicit `source_relation` and `independence` cannot contradict each other or the basis: a single-report documented claim fails, and an origin count above the cited sources fails.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: SourceRelation; scripts/schema.ts :: claimAxes',
		test_pointer:
			'scripts/test-validators.ts :: V26: more independent origins than cited sources is rejected; scripts/test-pipeline.ts :: an incompatible source relation fails and names the record (V26)',
		notes:
			'V26 shipped in the kind-versus-strength migration (`output/kind-migration.csv`, 40 applied rows each with a reviewer). Appendix A in the v0.1.1 source stops at V24; the successor paper extends it through V29.'
	},

	// -----------------------------------------------------------------------
	// V29: claim-level evidence and derived origins
	// -----------------------------------------------------------------------
	{
		paper_ref: 'successor §8.4, §9 (archive snapshots)',
		claim_text:
			'A high-risk claim links to an exact passage and a locator, plus either a real timestamped capture or a dated retry promise; a generated archive lookup is not a capture.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: EvidenceSchema; scripts/schema.ts :: isArchiveSnapshot',
		test_pointer:
			'scripts/test-validators.ts :: V29: a position with a captured passage parses; scripts/test-validators.ts :: V29: evidence without a capture or a retry date is rejected',
		notes:
			'8 records carry evidence today (2 positions, 3 relationships, 3 events); 4 evidence entries carry `capture_missing` retry dates. No capture-missing CSV is published yet; the matrix flags that as a gap.'
	},
	{
		paper_ref: 'successor §8.4 (origins)',
		claim_text:
			'Origin counts come from evidence lineage, not URLs: only the first lineage step is an origin, publisher and host are deduplicated, and a wire republished by ten outlets counts once.',
		status: 'shipped+tested',
		code_pointer: 'scripts/origins.ts :: countOrigins; scripts/build-data.ts :: withOrigins',
		test_pointer:
			'scripts/test-validators.ts :: V29 origins: a wire republished by different outlets is one origin; scripts/test-validators.ts :: V29 origins: a shared host collapses a renamed publisher',
		notes:
			'The derived `origins` count renders beside the authored `independence`; the UI chip and its note are pinned in test-ui (`the origins chip composes the ui primitives`) and test-i18n (`origins chip pair`).'
	},
	{
		paper_ref: '§9 (archive snapshots), successor §8.4',
		claim_text:
			'A source URL is a fetchable http(s) link and a Wayback archive URL must carry a full capture timestamp, not a year-only or date-only lookup.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: isArchiveSnapshot; scripts/schema.ts :: a source URL must be http(s)',
		test_pointer:
			'scripts/test-validators.ts :: V29 source: a year-only archive lookup is rejected; scripts/test-validators.ts :: V29 source: a non-http(s) source URL is rejected',
		notes:
			'Schema-side only: the register does not yet require an archive URL on every source, and the paper says so in §8.3 item 5.'
	},
	{
		paper_ref: 'successor Appendix A (V30 note)',
		claim_text:
			'Grade-B corroboration (two sources or attribution) is reserved as V30 and is not implemented.',
		status: 'proposed',
		code_pointer: 'scripts/schema.ts :: Numbering note: the pre-submission grant draft used',
		test_pointer: 'none',
		notes:
			'Deliberately proposed, with the number reserved, so the rule is not rendered as enforced. If implemented it must arrive with fixtures and a pipeline probe.'
	},

	// -----------------------------------------------------------------------
	// Time
	// -----------------------------------------------------------------------
	{
		paper_ref: '§5.4 (query semantics)',
		claim_text:
			'Two published predicates define activity: `certainlyActive` is the confident core, `possiblyActive` the outer envelope, and certainty never outruns possibility.',
		status: 'shipped+tested',
		code_pointer: 'src/lib/model.ts :: certainlyActive; scripts/dates.ts :: resolveInterval',
		test_pointer:
			'scripts/test-validators.ts :: temporal: generated sweep upholds the invariants; scripts/test-engine-conformance.ts :: engine: unknown end is not certain past the cutoff',
		notes:
			'The predicates are owned by the pinned engine and imported once; the property suite asserts certain implies possible, envelope ordering, monotonicity and cutoff clamping over 1,000 generated cases.'
	},
	{
		paper_ref: '§5.4, Table 5',
		claim_text:
			'`last-verified` is not `ended`: month-only and verified tokens clamp to the observed instant and render distinctly in every locale.',
		status: 'shipped+tested',
		code_pointer: 'scripts/dates.ts :: resolveInterval; src/lib/i18n.ts :: interval.lastVerified',
		test_pointer:
			'scripts/test-i18n.ts :: epistemic distinctions survive translation; scripts/test-validators.ts :: possiblyActive: false outside the envelope, true at its edges',
		notes:
			'm33/m34 pin the no-assertion-past-cutoff rule in the engine time module; the four statuses render distinctly in all three locales.'
	},

	// -----------------------------------------------------------------------
	// Emission, determinism, publication
	// -----------------------------------------------------------------------
	{
		paper_ref: '§5.8, §5.10, §8.1 (operational facts)',
		claim_text:
			'On a failed build nothing new is published: no dataset, no editorial queue, no staging tree is promoted.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: promoteDirectory',
		test_pointer:
			'scripts/test-pipeline.ts :: a failed build promotes no dataset; scripts/test-pipeline.ts :: a failed build promotes no editorial queue',
		notes: 'Atomic staging was Phase 3a; the probe family also covers the staging tree itself.'
	},
	{
		paper_ref: '§5.1, §5.10 (checkable by construction)',
		claim_text:
			'The same data directory produces the same graph, byte for byte under DT_CANONICAL=1, and the dataset hash recomputes from the emitted graph.',
		status: 'shipped+tested',
		code_pointer: 'scripts/canonical.ts :: canonicalBytes; scripts/build-data.ts :: computeDatasetHash',
		test_pointer:
			'scripts/test-pipeline.ts :: canonical bytes can be regenerated with no drift; scripts/test-data.ts :: the emitted datasetHash recomputes from the emitted graph',
		notes: 'Mutation m39 targets canonical byte equality.'
	},
	{
		paper_ref: '§1, §5.10 (non-guarantee)',
		claim_text:
			'Axiom A1: the compiler verifies that a record conforms to its declared contract; it does not determine whether the underlying judgment is correct.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: deriveBasis; scripts/schema.ts :: withClaimEnvelope',
		test_pointer:
			'scripts/test-data.ts :: the deriveBasis truth table is pinned — every input combination',
		notes:
			'Axiom, not an assertion: its force is that basis is computed rather than authored and no validator inspects truth. The matrix records it so the boundary is not read as an untested feature.'
	},

	// -----------------------------------------------------------------------
	// Review coverage, denominators, self-measurement
	// -----------------------------------------------------------------------
	{
		paper_ref: '§8.2 (review coverage)',
		claim_text:
			'Review coverage is reported as overlapping risk flags, not one bucket: a record carries every flag true of it, so an inferred claim that names its source is visible under both.',
		status: 'shipped+tested',
		code_pointer: 'scripts/review-coverage.ts :: reviewFlagsOf; scripts/review-coverage.ts :: reviewRiskOf',
		test_pointer:
			'scripts/test-validators.ts :: Phase 8: flag totals overlap rather than partition; scripts/test-data.ts :: the published risk flags overlap rather than partition',
		notes:
			'Headline today: 46 of 1715 records carry a review note; the flags sum to more than the record count by construction. The queue ordering key is separate and remains most-damaging-first.'
	},
	{
		paper_ref: '§8.2 (denominators)',
		claim_text:
			'Every claim kind that can be reviewed gets a denominator, not only the headline kinds.',
		status: 'shipped+tested',
		code_pointer: 'scripts/review-coverage.ts :: REVIEW_KINDS; scripts/review-coverage.ts :: summariseReview',
		test_pointer:
			'scripts/test-validators.ts :: Phase 8: every claim kind gets a denominator, including the empty ones; scripts/test-data.ts :: the published per-kind denominators match the graph',
		notes:
			'13 kinds from institution to place; the old aggregation covered four and ignored people, institutions, agreements and the newer kinds.'
	},
	{
		paper_ref: '§8.2 (denominators)',
		claim_text:
			'`examined` is not `independently_checked`: a review object means someone looked; independence is not inferred from a reviewer name.',
		status: 'shipped+tested',
		code_pointer: 'scripts/review-coverage.ts :: CoverageRow; scripts/review-coverage.ts :: reviewCoverageCsv',
		test_pointer:
			'scripts/test-validators.ts :: Phase 8: examined never implies independently checked; scripts/test-data.ts :: output/review-coverage.csv recomputes from the emitted graph',
		notes:
			'Independence and outcome columns are 0 with a note: "not recorded", not "not done". Mutation m51 pins that examined never implies independence.'
	},
	{
		paper_ref: '§5.8, §8.2 (queue)',
		claim_text:
			'The editorial queue is published and risk-ordered; the research queue and open questions surface rather than vanishing into console output.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: editorial-queue.json; scripts/review-coverage.ts :: reviewRiskOf',
		test_pointer:
			'scripts/test-data.ts :: R11: the editorial queue is published and risk-ordered',
		notes:
			'The queue is stamped with the build time and counts; ordering uses the most-damaging flag while the published coverage keeps every flag.'
	},
	{
		paper_ref: 'successor §8.4 (coverage by slice)',
		claim_text:
			'Coverage is published by institution, era, source family, language and office, with an effective nonzero sample and a sparse flag; a thin slice cannot render as a league table.',
		status: 'shipped+tested',
		code_pointer: 'scripts/coverage.ts :: buildCoverage; scripts/coverage.ts :: SPARSE_THRESHOLD',
		test_pointer:
			'scripts/test-data.ts :: output/coverage.csv recomputes from the emitted graph; scripts/test-data.ts :: the coverage table marks sparse slices rather than hiding them',
		notes:
			'588 slices, 531 sparse at threshold 3. Mutations m55/m56 pin the sparse and nonzero logic.'
	},
	{
		paper_ref: '§8.2 (translation)',
		claim_text:
			'Translation coverage is per-tier and never summed: `human` is the only tier that means a person read the language.',
		status: 'shipped+tested',
		code_pointer: 'scripts/schema.ts :: TRANSLATION_TIERS',
		test_pointer:
			'scripts/test-i18n.ts :: model-reviewed sits below the human-checked tiers',
		notes: 'The `translatedHuman` stat tag is separately gated by test-paper.'
	},
	{
		paper_ref: '§8.2 (absence is measured)',
		claim_text:
			'The build publishes what the map does not contain, including the family-coverage asymmetry around the incumbent president.',
		status: 'shipped+tested',
		code_pointer: 'scripts/build-data.ts :: kinNetwork; scripts/build-data.ts :: directCoverage',
		test_pointer: 'scripts/smoke.ts :: stats.json carries the kin keys the check depends on; scripts/test-paper.ts :: kin-kais-saied',
		notes:
			'C1 of the corrections release fixed the V0.1 sentence that said the incumbent had no family edges; the V0.1.1 source still carried it in the §8.2 bullet, which C11 of the successor corrects. The sentence is now stat-tagged (familyEdges 26, kin-ben-ali 8, kin-kais-saied 3), and the smoke suite asserts the rendered numbers match the emitted keys.'
	},

	// -----------------------------------------------------------------------
	// Network continuity (Phase 10D)
	// -----------------------------------------------------------------------
	{
		paper_ref: 'successor §8.5 (H1 network)',
		claim_text:
			'The personnel reading of H1 still holds: no individual is certainly in post at all three rupture dates.',
		status: 'shipped+tested',
		code_pointer: 'scripts/network-continuity.ts :: computeNetworkContinuity',
		test_pointer:
			'scripts/test-network-continuity.ts :: personnel: no individual is certainly in post at all three rupture dates',
		notes:
			'Cohorts are resolved with the certain predicate only; possible-only holders go to a secondary watch list. H1-personnel stays `contradicted` on the current graph.'
	},
	{
		paper_ref: 'successor §8.5 (H1 network)',
		claim_text:
			'Paths between cohorts are graded and time-ordered: every step must pass the grade gate, the allowed-edge list and the fuzzy time predicates, and a weak or backwards chain is rejected.',
		status: 'shipped+tested',
		code_pointer: 'scripts/network-continuity.ts :: computeNetworkContinuity; scripts/network-continuity.ts :: MIN_AUTHORITY',
		test_pointer:
			'scripts/test-network-continuity.ts :: fixture: a time-ordered chain of graded successions counts as a primary bridge; scripts/test-network-continuity.ts :: fixture: a chain whose steps run backwards in time is rejected',
		notes:
			'Hand-worked fixtures also prove an inferred-only chain is demoted to secondary, an unsubstantiated path is excluded, and a family tie is not an allowed edge. Mutations m52/m53/m54 target these.'
	},
	{
		paper_ref: 'successor §8.5 (null controls)',
		claim_text:
			'Every continuity count is published beside degree-preserving shuffled-cohort and random-date null controls.',
		status: 'shipped+tested',
		code_pointer: 'scripts/network-continuity.ts :: nullControls',
		test_pointer:
			'scripts/test-network-continuity.ts :: null controls: the real count is published beside its null distribution; scripts/test-network-continuity.ts :: output/network-continuity.json matches the recompute',
		notes:
			'200 trials per control, seed 20260911. Current result: 4 primary paths 1987→2011, 0 for 2011→2021, with 2/200 and 0/200 null trials at or above the real count.'
	},
	{
		paper_ref: 'successor §8.5 (H1 card)',
		claim_text:
			'The dashboard H1 card shows both readings: the personnel snapshot test and the network path test, with denominators and thresholds.',
		status: 'shipped+tested',
		code_pointer: 'src/routes/evidence/+page.svelte :: nullControls.shuffledCohorts',
		test_pointer:
			'scripts/test-ui.ts :: the null-control comparison travels with the counts; scripts/test-ui.ts :: the continuity card resolves in',
		notes: 'Every chart keeps a table alternative per DESIGN.'
	},

	// -----------------------------------------------------------------------
	// Sensitivity and rankings honesty (Phase 10A)
	// -----------------------------------------------------------------------
	{
		paper_ref: '§5.4, §5.6, §10.2 item 1',
		claim_text:
			'The published rankings are tested against discount, window and slack perturbations of the stated constants; the finding is sparsity, not robustness.',
		status: 'shipped+untested',
		code_pointer: 'scripts/sensitivity.ts :: discountPerturbations; scripts/sensitivity.ts :: weightPerturbations',
		test_pointer: 'none',
		notes:
			'`npm run sensitivity` emits `output/sensitivity/` and `static/sensitivity.json`. No assertion recomputes the Spearman figures, so the numbers are published, not gated. Current worst influence Spearman 0.997 on a 5-person scored column; composite weight family worst 0.772 (survival excluded).'
	},
	{
		paper_ref: 'successor §8.6 (removal and snapshots)',
		claim_text:
			'Edge removal, source-family removal and time snapshots are included in the sensitivity families; the ranking is a function of the instant and the sources it can lose.',
		status: 'shipped+untested',
		code_pointer: 'scripts/sensitivity.ts :: edge-removal; scripts/sensitivity.ts :: snapshot',
		test_pointer: 'none',
		notes:
			'`npm run sensitivity`. Worst rows today: remove prosecution moves brokerage to 0.782; remove tier-3 established journalism moves authority to 0.637; the 2010 snapshot moves survival to 0.543. No assertion pins these numbers.'
	},
	{
		paper_ref: 'successor §8.6 (rankings banner)',
		claim_text:
			'A sparse or unstable ranking renders with a limitation banner and a link to the underlying method and data; no bare league table for thin slices.',
		status: 'shipped+tested',
		code_pointer: 'src/lib/components/Rankings.svelte :: sensitivity.json',
		test_pointer:
			'scripts/test-ui.ts :: the rankings page fetches the published sensitivity summary; scripts/test-ui.ts :: the banner names both the sparse case and the unstable case',
		notes:
			'The banner threshold and copy resolve in all three locales; test-ui also pins the link to /sensitivity.json.'
	},
	{
		paper_ref: 'successor §8.6 (thresholds)',
		claim_text:
			'The banner thresholds (sparse scored count, unstable Spearman) are published with the sensitivity summary rather than living in the view.',
		status: 'shipped+tested',
		code_pointer: 'scripts/sensitivity.ts :: thresholds:',
		test_pointer:
			'scripts/test-ui.ts :: the limitation copy resolves in',
		notes:
			'Published thresholds today: sparseScored 10, unstableSpearman 0.9. The view consumes them; the assertion pins the UI consumption in every locale, not the constants themselves.'
	},
	{
		paper_ref: '§5.7, Table 6',
		claim_text:
			'The product computes six structural indices and refuses to emit a default composite; the reader supplies the weights.',
		status: 'shipped+untested',
		code_pointer: 'src/lib/indices.ts :: computeIndices; src/lib/indices.ts :: INDEX_KEYS',
		test_pointer: 'none',
		notes:
			'The computation ships and drives the rankings and the sensitivity probe, but no assertion pins the index maths on a fixture. Flagged as a real coverage gap; a hand-worked index fixture is the next test to add.'
	},

	// -----------------------------------------------------------------------
	// Mutation testing
	// -----------------------------------------------------------------------
	{
		paper_ref: '§8.1 (first and second pass)',
		claim_text:
			'The historical campaign detected 3 of 12 hardening mutations in its first pass and 20 of 23 after synthetic fixtures, and the permanent closes it earned (deriveBasis truth table, interval-trims freshness, V23 calendar round-trip, rule-2 ratchet) are in the suite.',
		status: 'shipped+untested',
		code_pointer: 'scripts/mutation-test.ts :: const MUTATIONS',
		test_pointer: 'none',
		notes:
			'Historical result, kept labelled as such. The permanent closes are individually tested and have their own matrix rows; the historical rates themselves are not recomputed by `npm run test`.'
	},
	{
		paper_ref: 'successor §8.1 (current report)',
		claim_text:
			'The current committed mutation report holds 56 counted mutants: 54 killed, 2 known latent, 0 silent drift, 0 invalid (96%).',
		status: 'shipped+untested',
		code_pointer: 'scripts/mutation-test.ts :: output/mutation-report.json',
		test_pointer: 'none',
		notes:
			'`output/mutation-report.json` (generated 2026-09-14 at ba2ba8c). `npm run mutation` re-runs the campaign and rewrites the report; no suite pins the counts, so a stale report is possible and the paper must not present the number as gate-enforced. The two latent survivors are m07 (sources minimum, redundant with the envelope) and m09 (review-date format, redundant with the calendar round-trip).'
	},
	{
		paper_ref: '§8.1 (verdict taxonomy)',
		claim_text:
			'A mutation is classified as killed, silent drift, latent or invalid; invalid mutants are not kills and silent drift must become a test.',
		status: 'shipped+tested',
		code_pointer: 'scripts/mutation-test.ts :: type Verdict',
		test_pointer: 'scripts/test-pipeline.ts :: canonical bytes can be regenerated with no drift',
		notes:
			'The taxonomy is implemented and the harness exits non-zero on drift or invalid mutants; the campaign itself is run manually. The test pointer is the drift-detection mechanism the taxonomy depends on.'
	},

	// -----------------------------------------------------------------------
	// Community layer (Sybil and budget boundaries)
	// -----------------------------------------------------------------------
	{
		paper_ref: '§5.9, §9 (blast radius, identity)',
		claim_text:
			'Identity is key-controlled: Ed25519 keypairs in the browser, handles derived from the key, no address or device columns, and signatures are verified without the private key ever reaching the server.',
		status: 'shipped+tested',
		code_pointer: 'community/identity.ts :: handle; community/ratelimit.ts :: bucketKey',
		test_pointer:
			'scripts/test-community.ts :: a handle is derived from the key; scripts/test-community.ts :: the bucket key does not contain the address',
		notes:
			'The residual risk is stated in the paper and threat matrix: signatures prove key control, one person can hold many keys. No public surface claims Sybil-proof identity.'
	},
	{
		paper_ref: '§5.9 (budget, pause, floor)',
		claim_text:
			'The posting budget, ten-minute pause and four-second pace floor are specified, not wired; no hold is enforced.',
		status: 'proposed',
		code_pointer: 'community/budget.ts :: HOLD_MS',
		test_pointer: 'none',
		notes:
			'Deliberately proposed. The paper says "as specified, not yet wired" in each place these mechanisms appear, and no public surface may claim the budget or the hold is enforced (AGENTS.md).'
	},
	{
		paper_ref: '§5.8, §5.9 (community isolation, proposal path)',
		claim_text:
			'The community layer holds no graph data, and a proposed change reaches the dataset only through the same build gate as any edit.',
		status: 'shipped+tested',
		code_pointer: 'community/db.ts :: export interface Db; scripts/apply-proposals.ts :: const APPLY',
		test_pointer:
			'scripts/test-community.ts :: the graph build never reads community/; scripts/test-community.ts :: the graph build never reads the community schema',
		notes:
			'The isolation assertions read the actual build and schema files, not documentation. The proposal path is exercised by `scripts/test-community.ts` and `scripts/test-api.ts`.'
	},

	// -----------------------------------------------------------------------
	// Proposed work the paper names
	// -----------------------------------------------------------------------
	{
		paper_ref: '§9, §10.2 item 6 (portability)',
		claim_text:
			'The enforcement layer is jurisdiction-agnostic and a second deployment can retain it unchanged.',
		status: 'proposed',
		code_pointer: 'scripts/parameters.ts :: DEFAULT_PARAMETERS',
		test_pointer: 'none',
		notes:
			'Marked planned, not demonstrated: there is no runnable second-jurisdiction corpus under fixtures/. The paper says the "unchanged" claim is untested and scopes the demonstration to the comparative-atlas item. The per-test-provenance fixture is the smallest first step.'
	},
	{
		paper_ref: '§10.1 (inter-annotator study)',
		claim_text:
			'A two-round, three-rater study measures whether the grading rubric is applied consistently across independent raters.',
		status: 'proposed',
		code_pointer: 'scripts/study-sampler.ts :: stratified sampler; scripts/study-kappa.ts :: Fleiss',
		test_pointer: 'none',
		notes:
			'The instruments exist and have a dry-run command, but no raters have been recruited and no kappa has been computed. Human item, listed as known-open.'
	},
	{
		paper_ref: '§4, Table 3, §10.2 item 2',
		claim_text:
			'The Table 3 novelty claim is grade C until an external literature review corroborates or refutes it.',
		status: 'proposed',
		code_pointer: 'none',
		test_pointer: 'none',
		notes: 'The internal prior-art study is the current basis; the external review is named future work and not claimed as done.'
	},
	{
		paper_ref: '§8.3 item 2, §10.2 item 1',
		claim_text:
			'The six indices have not been validated against an independent external measure of influence.',
		status: 'proposed',
		code_pointer: 'src/lib/indices.ts :: computeIndices',
		test_pointer: 'none',
		notes: 'Paper states this as an absence, not a result. The sensitivity analysis is the internal companion and is emitted.'
	},
	{
		paper_ref: '§5.10, §10.2 item 3',
		claim_text:
			'A machine-checkable specification of the validator layer (Datalog fragment or SMT encoding) is future work; the mutation campaign covers the empirical half.',
		status: 'proposed',
		code_pointer: 'scripts/mutation-test.ts :: const MUTATIONS',
		test_pointer: 'none',
		notes: 'Not implemented; the paper scopes it explicitly as future work and does not render it as enforced.'
	},
	{
		paper_ref: '§8.3 item 6, §10.2 item 5',
		claim_text:
			'Interpretation-level validators (path coherence, chain compatibility, confidence floors) are future work; record validity is not graph-interpretation validity.',
		status: 'proposed',
		code_pointer: 'scripts/build-data.ts :: interpretation advisories (warn-only, L3)',
		test_pointer: 'none',
		notes:
			'The warn-only tree is exercised by the pipeline suite (`the weak-chain tree builds (pathAudit is warn-only)`), so the shipped advisories are tested. Proposed status refers to the fail-level promise, which does not exist; the paper scopes it as future work.'
	},
	{
		paper_ref: '§9 (ethics and legal posture)',
		claim_text:
			'The legal analysis is an internal brief and requires verification against primary statutory text and external legal review before any figure is relied upon.',
		status: 'proposed',
		code_pointer: 'none',
		test_pointer: 'none',
		notes: 'Human item, listed as known-open. A legal-verification appendix is promised for submission and does not exist yet.'
	}
];

/** Split a pointer into `path :: needle` segments. */
function pointerSegments(pointer: string): { path: string; needle: string }[] {
	if (!pointer || pointer === 'none') return [];
	return pointer
		.split('; ')
		.filter(Boolean)
		.map((segment) => {
			const [path, ...rest] = segment.split(' :: ');
			return { path: path ?? '', needle: rest.join(' :: ') };
		});
}

/**
 * A pointer is valid when its file exists under the repo root and the needle
 * occurs in that file. This is what keeps the matrix from naming a function or
 * an assertion that has been renamed or deleted.
 */
export function pointerErrors(pointer: string): string[] {
	const errors: string[] = [];
	for (const { path, needle } of pointerSegments(pointer)) {
		if (!path || !needle) {
			errors.push(`malformed pointer segment "${path} :: ${needle}"`);
			continue;
		}
		if (!existsSync(join(ROOT, path))) {
			errors.push(`missing file ${path}`);
			continue;
		}
		if (!readFileSync(join(ROOT, path), 'utf8').includes(needle)) {
			errors.push(`${path} does not contain "${needle}"`);
		}
	}
	return errors;
}

/**
 * Required coverage. Each pattern must appear in at least one row (the whole
 * row is serialised for matching). This is the Phase 5 minimum list plus the
 * capabilities the successor release adds; a topic that loses its row fails
 * here before the paper can claim it.
 */
export const REQUIRED_TOPICS: { label: string; pattern: RegExp }[] = [
	{ label: 'stat-tag machinery', pattern: /stat tag/i },
	{ label: 'V18 inferred completeness', pattern: /V18/ },
	{ label: 'V19 strict fields', pattern: /V19/ },
	{ label: 'V20 attribution', pattern: /V20/ },
	{ label: 'V21 calendar validity', pattern: /V21/ },
	{ label: 'V22 interval contradiction', pattern: /V22/ },
	{ label: 'V23 review provenance', pattern: /V23/ },
	{ label: 'V24 succession sanity', pattern: /V24/ },
	{ label: 'V25 grade-A primary', pattern: /V25/ },
	{ label: 'V26 kind versus strength', pattern: /V26/ },
	{ label: 'V27 override provenance', pattern: /V27/ },
	{ label: 'V28 recursive strictness', pattern: /V28/ },
	{ label: 'V29 claim-level evidence', pattern: /V29/ },
	{ label: 'temporal predicates', pattern: /certainlyActive/ },
	{ label: 'citation guarantee / rule 2', pattern: /rule-2|rule 2|citation/i },
	{ label: 'mutation report provenance', pattern: /mutation-report\.json/ },
	{ label: 'review coverage flags', pattern: /flags overlap|overlapping risk flags/i },
	{ label: 'review denominators', pattern: /denominator/i },
	{ label: 'continuity probe', pattern: /continuity/i },
	{ label: 'continuity null controls', pattern: /null control/i },
	{ label: 'sensitivity families', pattern: /sensitivity/i },
	{ label: 'removal and snapshot sensitivity', pattern: /edge removal|snapshot/i },
	{ label: 'rankings limitation banner', pattern: /limitation banner/i },
	{ label: 'origins from lineage', pattern: /lineage/i },
	{ label: 'coverage by slice', pattern: /coverage\.csv|coverage is published|coverage by slice/i },
	{ label: 'sparse flag', pattern: /sparse/i },
	{ label: 'inferred queue', pattern: /editorial queue|research queue/i },
	{ label: 'Sybil defenses', pattern: /Sybil/i },
	{ label: 'Ruritania portability', pattern: /portability|second deployment|second-jurisdiction/i }
];

export function missingTopics(rows: MatrixRow[]): string[] {
	const haystack = rows
		.map((r) => `${r.paper_ref} ${r.claim_text} ${r.code_pointer} ${r.test_pointer} ${r.notes}`)
		.join('\n');
	return REQUIRED_TOPICS.filter((topic) => !topic.pattern.test(haystack)).map((t) => t.label);
}

export function validateMatrix(rows: MatrixRow[]): string[] {
	const errors: string[] = [];
	const seenClaims = new Map<string, number>();
	rows.forEach((row, i) => {
		const where = `row ${i + 1} (${row.paper_ref || 'no ref'})`;
		if (!row.paper_ref.trim()) errors.push(`${where}: empty paper_ref`);
		if (row.claim_text.trim().length < 20) errors.push(`${where}: claim_text too short`);
		if (!row.notes.trim()) errors.push(`${where}: empty notes`);
		if (!STATUSES.includes(row.status)) errors.push(`${where}: unknown status "${row.status}"`);
		if (row.status !== 'shipped+tested' && pointerSegments(row.test_pointer).length > 0) {
			errors.push(`${where}: ${row.status} rows must not name a passing-test pointer`);
		}
		if (row.status === 'shipped+tested' && pointerSegments(row.test_pointer).length === 0) {
			errors.push(`${where}: shipped+tested needs a test pointer`);
		}
		if (row.status === 'shipped+tested' && pointerSegments(row.code_pointer).length === 0) {
			errors.push(`${where}: shipped+tested needs a code pointer`);
		}
		if (row.status === 'shipped+untested' && !/(npm run|output\/|manual|no assertion|not gated)/i.test(row.notes)) {
			errors.push(`${where}: shipped+untested must say how it is verified (command or artifact)`);
		}
		for (const e of pointerErrors(row.code_pointer)) errors.push(`${where} code: ${e}`);
		for (const e of pointerErrors(row.test_pointer)) errors.push(`${where} test: ${e}`);
		const key = row.paper_ref + '|' + row.claim_text;
		seenClaims.set(key, (seenClaims.get(key) ?? 0) + 1);
	});
	for (const [key, n] of seenClaims) {
		if (n > 1) errors.push(`duplicate claim row: ${key}`);
	}
	for (const topic of missingTopics(rows)) errors.push(`required topic missing: ${topic}`);
	return errors;
}

function csvCell(value: string): string {
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function claimMatrixCsv(rows: MatrixRow[]): string {
	const columns: (keyof MatrixRow)[] = ['paper_ref', 'claim_text', 'status', 'code_pointer', 'test_pointer', 'notes'];
	return (
		columns.join(',') +
		'\n' +
		rows.map((row) => columns.map((c) => csvCell(String(row[c]))).join(',')).join('\n') +
		'\n'
	);
}

export function matrixSummary(rows: MatrixRow[]): Record<MatrixStatus, number> {
	const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<MatrixStatus, number>;
	for (const row of rows) out[row.status]++;
	return out;
}

// CLI: emit the CSV after validating it. A broken pointer fails here, so the
// artifact cannot be regenerated in a state the test would reject.
const invokedDirectly = process.argv[1] && join(process.argv[1]) === join(fileURLToPath(import.meta.url));
if (invokedDirectly) {
	const errors = validateMatrix(CLAIM_MATRIX);
	if (errors.length) {
		console.error(`claim matrix invalid (${errors.length}):`);
		for (const e of errors) console.error(`  - ${e}`);
		process.exit(1);
	}
	const outPath = join(ROOT, 'output', 'claim-matrix.csv');
	writeFileSync(outPath, claimMatrixCsv(CLAIM_MATRIX), 'utf8');
	const summary = matrixSummary(CLAIM_MATRIX);
	console.log(
		`claim matrix: ${CLAIM_MATRIX.length} rows -> ${outPath}\n` +
			`  shipped+tested ${summary['shipped+tested']} · shipped+untested ${summary['shipped+untested']} · ` +
			`proposed ${summary.proposed} · externally evaluated ${summary['externally evaluated']}`
	);
}
