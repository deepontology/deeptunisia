/**
 * Research portal schemas: study manifests, instruments and released aggregates.
 *
 * This module is deliberately separate from the knowledge-graph pipeline. The
 * graph holds graded claims about the world; a study holds observations about
 * respondents. Nothing here imports `schema.ts` or `build-data.ts`, and the
 * graph build does not import this module (asserted in `test-studies.ts`), so a
 * study record cannot drift into `dataset.json` or any graph statistic.
 *
 * Validators return every violation instead of throwing, so the study build can
 * report all problems at once the way `build-data.ts` does. The schemas are
 * strict: an undeclared key is a build error, not a silent drop.
 */
import { z } from 'zod';
import { computeInstrumentHash } from '../community/research-contract.ts';

/*
 * The hash and the runtime compiler live in community/research-contract.ts, which
 * the Worker can bundle because it imports nothing. Re-exported here so the
 * scripts keep importing from one place and build and API cannot drift.
 */
export { computeInstrumentHash };

/** A mandatory text field is satisfied only by a string with real content. */
function nonBlank(v: unknown): v is string {
	return typeof v === 'string' && v.trim().length > 0;
}

/**
 * A date string that is both ISO-shaped and a real calendar day. `Date.parse`
 * normalizes 2018-02-31 to March; the round-trip does not.
 */
function isCalendarDate(v: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
	if (!m) return false;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return (
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
	);
}

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
	.refine(isCalendarDate, 'date must be a real calendar day');

/** The instrument locales the platform administers. */
export const LocaleSchema = z.enum(['en', 'fr', 'ar']);
export type Locale = z.infer<typeof LocaleSchema>;

// ---------------------------------------------------------------------------
// Study manifest (portal README §3)
// ---------------------------------------------------------------------------

export const StudyStatusSchema = z.enum([
	'proposed',
	'design',
	'ethics-review',
	'frozen',
	'fielding',
	'closed',
	'analyzed',
	'published',
	'archived'
]);
export type StudyStatus = z.infer<typeof StudyStatusSchema>;

export const InstrumentVersionSchema = z.strictObject({
	id: z.string().min(1, 'an instrument version needs an id'),
	version: z.string().min(1, 'an instrument version needs a version string'),
	/**
	 * sha256 of the frozen instrument, or null while the instrument is a draft.
	 * Quote the value in YAML: a 64-char hex string of only digits parses as a
	 * number and fails the schema.
	 */
	hash: z.string().min(1, 'a content hash is either a sha256 hex string or null').nullable(),
	/** Repository-relative path to the instrument YAML. */
	source: z.string().min(1, 'an instrument version needs a source path'),
	frozen: z.boolean()
});
export type InstrumentVersion = z.infer<typeof InstrumentVersionSchema>;

/**
 * The fielding window is null until fielding is scheduled. `start` is required
 * to enter `fielding`; `end` is required once the study closes. Both are
 * nullable so an author can record the start before the end is known.
 */
export const FieldingWindowSchema = z.strictObject({
	start: isoDate.nullable().optional(),
	end: isoDate.nullable().optional()
});
export type FieldingWindow = z.infer<typeof FieldingWindowSchema>;

export const StudyOutputKindSchema = z.enum(['dataset', 'paper', 'preprint', 'results', 'code']);
export const StudyOutputSchema = z.strictObject({
	kind: StudyOutputKindSchema,
	id: z.string().min(1).nullable()
});
export type StudyOutput = z.infer<typeof StudyOutputSchema>;

export const StudySchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'study ids must be lowercase kebab-case'),
	slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'study slugs must be lowercase kebab-case'),
	title_en: z.string().min(1),
	title_fr: z.string().min(1).nullable(),
	title_ar: z.string().min(1).nullable(),
	status: StudyStatusSchema,
	design_type: z.string().min(1),
	population: z.string().min(1),
	population_statement: z.string().min(1).nullable(),
	locales: z.array(LocaleSchema).min(1, 'a study declares at least one locale'),
	ethics_review: z.string().min(1).nullable(),
	data_protection_review: z.string().min(1).nullable(),
	preregistration: z.string().min(1).nullable(),
	instrument_versions: z.array(InstrumentVersionSchema),
	fielding_window: FieldingWindowSchema.nullable(),
	target_n: z.number().int().positive().nullable(),
	realized_n: z.number().int().nonnegative().nullable(),
	weighting: z.string().min(1).nullable(),
	data_license: z.string().min(1),
	funding: z.string().min(1).nullable(),
	pi: z.string().min(1).nullable(),
	outputs: z.array(StudyOutputSchema),
	created: isoDate,
	updated: isoDate
});
export type Study = z.infer<typeof StudySchema>;

const LIFECYCLE_GATED: readonly StudyStatus[] = [
	'frozen',
	'fielding',
	'closed',
	'analyzed',
	'published',
	'archived'
];
const LIFECYCLE_CLOSED: readonly StudyStatus[] = ['closed', 'analyzed', 'published', 'archived'];

/**
 * The lifecycle gates from portal README §3, expressed as required fields per
 * status. Returns violations, never throws: the build reports them together.
 */
export function validateStudyLifecycle(study: Study): string[] {
	const violations: string[] = [];
	const status = study.status;

	if (LIFECYCLE_GATED.includes(status)) {
		if (!nonBlank(study.population_statement)) {
			violations.push(`status "${status}" requires a population_statement`);
		}
		if (!nonBlank(study.ethics_review)) {
			violations.push(`status "${status}" requires an ethics_review reference`);
		}
		if (!nonBlank(study.data_protection_review)) {
			violations.push(`status "${status}" requires a data_protection_review reference`);
		}
		if (!nonBlank(study.preregistration)) {
			violations.push(`status "${status}" requires a preregistration reference`);
		}
		if (study.instrument_versions.length === 0) {
			violations.push(`status "${status}" requires at least one frozen instrument_version`);
		}
		for (const instrument of study.instrument_versions) {
			if (!instrument.frozen) {
				violations.push(
					`status "${status}" requires instrument_version "${instrument.id}" to be frozen`
				);
			}
			if (!nonBlank(instrument.hash)) {
				violations.push(
					`status "${status}" requires instrument_version "${instrument.id}" to declare a content hash`
				);
			}
		}
	}

	if (status === 'fielding' && !nonBlank(study.fielding_window?.start)) {
		violations.push('status "fielding" requires fielding_window.start');
	}

	if (LIFECYCLE_CLOSED.includes(status)) {
		if (!nonBlank(study.fielding_window?.end)) {
			violations.push(`status "${status}" requires fielding_window.end`);
		}
		if (study.realized_n === null || study.realized_n === undefined) {
			violations.push(`status "${status}" requires realized_n`);
		}
	}

	if (status === 'published') {
		const dataset = study.outputs.some((output) => output.kind === 'dataset' && nonBlank(output.id));
		if (!dataset) {
			violations.push('status "published" requires at least one dataset output with an id');
		}
	}

	return violations;
}

// ---------------------------------------------------------------------------
// Instrument (portal README §4)
// ---------------------------------------------------------------------------

/**
 * Locale text is nullable in a draft and required in a frozen instrument. The
 * schemas keep the draft shape; `validateInstrument` holds the freeze rule.
 */
const itemText = z.string().nullable();

export const ItemSchema = z.strictObject({
	id: z.string().min(1),
	module: z.string().min(1),
	tier: z.enum(['core', 'extended', 'optional']),
	construct: z.string().min(1),
	provenance: z.string().min(1),
	text_en: itemText,
	text_fr: itemText,
	text_ar: itemText,
	response: z.string().min(1),
	required: z.boolean(),
	/** Present on a handful of items in the draft: routing, conditions, options. */
	routing: z.string().optional(),
	notes: z.string().optional(),
	options: z.array(z.string().min(1)).optional(),
	show_if: z.string().optional(),
	max_chars: z.number().int().positive().optional(),
	arms: z.array(z.string().min(1)).optional()
});
export type Item = z.infer<typeof ItemSchema>;

export const ModuleSchema = z.strictObject({
	id: z.string().min(1),
	label: z.string().min(1),
	/** Items this module presents; a module may instead reference a block. */
	items: z.array(z.string().min(1)).optional(),
	block: z.string().min(1).optional()
});
export type Module = z.infer<typeof ModuleSchema>;

/** One generated MaxDiff set: an id and its four item ids in presentation order. */
export const MaxDiffSetSchema = z.strictObject({
	id: z.string().min(1),
	items: z.array(z.string().min(1))
});
export type MaxDiffSet = z.infer<typeof MaxDiffSetSchema>;

export const MaxDiffBlockSchema = z.strictObject({
	id: z.string().min(1),
	task: z.string().min(1),
	items_per_set: z.number().int().positive(),
	sets: z.number().int().positive(),
	pool: z.array(z.string().min(1)),
	design: z.strictObject({
		status: z.string().min(1),
		constraints: z.array(z.string().min(1)),
		frozen_with_instrument: z.boolean(),
		/**
		 * The frozen sets, present once the design is generated (m2-contract §10).
		 * Each set names four pool items in the order the runner presents them.
		 */
		sets: z.array(MaxDiffSetSchema).optional()
	}),
	instruction_en: itemText,
	text_fr: itemText,
	text_ar: itemText
});
export type MaxDiffBlock = z.infer<typeof MaxDiffBlockSchema>;

export const GapBlockSchema = z.strictObject({
	id: z.string().min(1),
	response: z.string().min(1),
	instruction_en: itemText,
	text_fr: itemText,
	text_ar: itemText,
	items: z.array(z.string().min(1)),
	excluded_note: z.string().optional()
});
export type GapBlock = z.infer<typeof GapBlockSchema>;

export const ExperimentSchema = z.strictObject({
	id: z.string().min(1),
	factor: z.string().min(1),
	arms: z.array(z.string().min(1)),
	allocation: z.string().min(1),
	analysis: z.string().min(1)
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export const InstrumentMetaSchema = z.strictObject({
	id: z.string().min(1),
	study: z.string().min(1),
	version: z.string().min(1),
	status: z.string().min(1),
	frozen: z.boolean(),
	content_hash: z.string().nullable(),
	source_locale: LocaleSchema,
	locales: z.array(LocaleSchema).min(1, 'an instrument declares at least one locale'),
	estimated_minutes: z.number().positive(),
	completion_target_minutes_max: z.number().positive(),
	pretest_required: z.boolean(),
	response_scale_note: z.string().min(1)
});
export type InstrumentMeta = z.infer<typeof InstrumentMetaSchema>;

export const TranslationSchema = z.strictObject({
	policy: z.string().min(1),
	report: z.string().nullable(),
	/** Per-locale translation bookkeeping; the platform never reads it. */
	locales: z.record(z.string(), z.unknown())
});

/**
 * The whole instrument document. `maxdiff_priority`, `gap_block`, `experiments`
 * and `tiers` are optional: a draft instrument may declare none of them, and a
 * non-MaxDiff study never will.
 */
export const InstrumentSchema = z.strictObject({
	instrument: InstrumentMetaSchema,
	translation: TranslationSchema,
	response_types: z.record(z.string(), z.string()),
	modules: z.array(ModuleSchema),
	items: z.array(ItemSchema),
	maxdiff_priority: MaxDiffBlockSchema.optional(),
	gap_block: GapBlockSchema.optional(),
	experiments: z.array(ExperimentSchema).optional(),
	tiers: z.record(z.string(), z.string()).optional()
});
export type InstrumentDoc = z.infer<typeof InstrumentSchema>;

/**
 * Cross-field instrument rules (portal README §10, S2):
 *  - item ids are unique;
 *  - every item carries a construct and a provenance;
 *  - every module item reference, maxdiff pool entry and gap block entry
 *    resolves to an item id;
 *  - a generated maxdiff design has a non-empty sets list, four distinct pool
 *    items per set, unique set ids, and no unused pool item;
 *  - a frozen instrument has full locale text on displayed items and a non-null
 *    content hash.
 */
export function validateInstrument(doc: InstrumentDoc): string[] {
	const violations: string[] = [];
	const ids = new Set<string>();

	for (const item of doc.items) {
		if (ids.has(item.id)) violations.push(`duplicate item id "${item.id}"`);
		ids.add(item.id);
		if (!nonBlank(item.construct)) violations.push(`item "${item.id}" has no construct`);
		if (!nonBlank(item.provenance)) violations.push(`item "${item.id}" has no provenance`);
	}

	for (const module of doc.modules) {
		for (const ref of module.items ?? []) {
			if (!ids.has(ref)) {
				violations.push(`module "${module.id}" references unknown item "${ref}"`);
			}
		}
	}

	if (doc.maxdiff_priority) {
		for (const ref of doc.maxdiff_priority.pool) {
			if (!ids.has(ref)) {
				violations.push(`maxdiff pool references unknown item "${ref}"`);
			}
		}
		// A generated design carries its sets; a to-generate design carries none.
		const design = doc.maxdiff_priority.design;
		if (design.status === 'generated') {
			const sets = design.sets ?? [];
			if (sets.length === 0) {
				violations.push('generated maxdiff design requires a non-empty sets list');
			}
			const setIds = new Set<string>();
			const used = new Set<string>();
			for (const set of sets) {
				if (setIds.has(set.id)) violations.push(`maxdiff set id "${set.id}" is repeated`);
				setIds.add(set.id);
				if (set.items.length !== 4) {
					violations.push(`maxdiff set "${set.id}" holds ${set.items.length} items, expected 4`);
				}
				const distinct = new Set(set.items);
				if (distinct.size !== set.items.length) {
					violations.push(`maxdiff set "${set.id}" repeats an item`);
				}
				for (const item of set.items) {
					if (!doc.maxdiff_priority.pool.includes(item)) {
						violations.push(`maxdiff set "${set.id}" uses "${item}", not in the pool`);
					}
					used.add(item);
				}
			}
			for (const ref of doc.maxdiff_priority.pool) {
				if (!used.has(ref)) violations.push(`generated maxdiff design never uses pool item "${ref}"`);
			}
		}
	}

	if (doc.gap_block) {
		for (const ref of doc.gap_block.items) {
			if (!ids.has(ref)) {
				violations.push(`gap block references unknown item "${ref}"`);
			}
		}
	}

	if (doc.instrument.frozen) {
		if (!nonBlank(doc.instrument.content_hash)) {
			violations.push('frozen instrument requires a non-null content_hash');
		}
		for (const locale of doc.instrument.locales) {
			const key = `text_${locale}` as const;
			for (const item of doc.items) {
				// Platform-recorded items (`response: "auto"`) are never displayed:
				// locale, experiment arm and similar. They carry no text by design,
				// so the freeze rule applies only to displayed items.
				if (item.response === 'auto') continue;
				if (!nonBlank(item[key])) {
					violations.push(`frozen instrument item "${item.id}" has no ${locale} text`);
				}
			}
			// Block instructions name English `instruction_en`, not `text_en`.
			const instruction = (block: MaxDiffBlock | GapBlock) =>
				locale === 'en' ? block.instruction_en : locale === 'fr' ? block.text_fr : block.text_ar;
			if (doc.maxdiff_priority && !nonBlank(instruction(doc.maxdiff_priority))) {
				violations.push(`frozen instrument maxdiff block has no ${locale} instruction`);
			}
			if (doc.gap_block && !nonBlank(instruction(doc.gap_block))) {
				violations.push(`frozen instrument gap block has no ${locale} instruction`);
			}
		}
	}

	return violations;
}

/*
 * The canonical projection and its sha256 now live in
 * community/research-contract.ts (contract §2), re-exported at the top of this
 * file. `computeInstrumentHash` covers instrument id, version, source locale and
 * locales, per-item id, response, required and the three locale texts, plus the
 * maxdiff and gap blocks and the experiments; `translation`, per-item `notes`,
 * instrument `status` and `content_hash` are excluded.
 */

// ---------------------------------------------------------------------------
// Released aggregates (portal README §7)
// ---------------------------------------------------------------------------

export const ResultsInstrumentSchema = z.strictObject({
	id: z.string().min(1),
	version: z.string().min(1),
	hash: z.string().min(1)
});

/**
 * One published aggregate. The population statement is repeated on the block
 * itself, not inherited from the document: rule R2 says the qualifier travels
 * with the number, so a block lifted out of its document still carries it.
 */
export const ResultsBlockSchema = z.strictObject({
	id: z.string().min(1),
	label: z.string().min(1),
	metric: z.string().min(1),
	n: z.number().int().positive(),
	weighted: z.boolean(),
	values: z.record(z.string(), z.number()),
	suppression: z.string().nullable(),
	population_statement: z.string().nullable()
});
export type ResultsBlock = z.infer<typeof ResultsBlockSchema>;

/**
 * The exclusion counts protocol §8 requires to be published: rows excluded per
 * rule (a row may trip more than one, so these overlap) and the distinct
 * excluded rows per channel. Written by scripts/studies-aggregate.ts.
 */
export const ResultsExclusionsSchema = z.strictObject({
	rows_excluded: z.number().int().nonnegative(),
	rules: z.record(z.string(), z.number().int().nonnegative()),
	by_channel: z.record(z.string(), z.number().int().nonnegative())
});
export type ResultsExclusions = z.infer<typeof ResultsExclusionsSchema>;

export const StudyResultsSchema = z.strictObject({
	study_id: z.string().min(1),
	instrument: ResultsInstrumentSchema,
	n: z.number().int().positive(),
	weighting: z.string().min(1),
	population_statement: z.string().min(1),
	generated_at: z.string().min(1),
	blocks: z.array(ResultsBlockSchema),
	/** Optional for hand-written documents; the aggregate always emits it. */
	exclusions: ResultsExclusionsSchema.optional()
});
export type StudyResults = z.infer<typeof StudyResultsSchema>;

/**
 * The qualifier rule (R2): a results document without a population statement,
 * or a block without one, is a build failure rather than a style preference.
 * Every block also has to carry its own realized n.
 */
export function validateResults(results: StudyResults): string[] {
	const violations: string[] = [];
	if (!nonBlank(results.population_statement)) {
		violations.push('results require a non-blank population_statement');
	}
	if (!(results.n > 0)) {
		violations.push('results require a positive n');
	}
	for (const block of results.blocks) {
		if (!nonBlank(block.population_statement)) {
			violations.push(`results block "${block.id}" requires a population_statement`);
		}
		if (!(block.n > 0)) {
			violations.push(`results block "${block.id}" requires a positive n`);
		}
	}
	return violations;
}
