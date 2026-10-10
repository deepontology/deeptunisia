/**
 * Assertions for the research portal pipeline: study and instrument schemas,
 * lifecycle gates, instrument-hash stability and the separation between the
 * study store and the knowledge graph.
 *
 * The graph's whole value is that every record is traceable and graded. A study
 * is a different kind of object — observations about respondents, not claims
 * about the world — and the two are only compatible if the separation is
 * structural. So this file asserts it: the registry and the workshop instrument
 * validate, the lifecycle gates fire, a text change moves the instrument hash,
 * and the graph build can neither read nor contain a study record.
 *
 * Run after `npm run data` — the separation check needs the built graph.
 * Usage: `npx tsx scripts/test-studies.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
	InstrumentSchema,
	StudyResultsSchema,
	StudySchema,
	computeInstrumentHash,
	validateInstrument,
	validateResults,
	validateStudyLifecycle,
	type Study
} from './research-schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

function bail(message: string): never {
	console.error(`  FAIL  ${message}`);
	console.error('\n  0/1 checks passed, 1 FAILED\n');
	process.exit(1);
}

type SchemaLike = {
	safeParse(input: unknown): {
		success: boolean;
		error?: { issues: { path: PropertyKey[]; message: string }[] };
	};
};

function issueText(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
	return error.issues
		.map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
		.join('; ');
}

function accepts(schema: SchemaLike, input: unknown, name: string) {
	const r = schema.safeParse(input);
	ok(name, r.success, r.success ? 'accepted' : issueText(r.error!));
}

function rejects(schema: SchemaLike, input: unknown, name: string) {
	const r = schema.safeParse(input);
	ok(name, !r.success, r.success ? 'accepted — expected rejection' : 'rejected');
}

/** Reject AND prove why: a fixture failing for the wrong reason tests nothing. */
function rejectsWith(schema: SchemaLike, input: unknown, name: string, needle: string) {
	const r = schema.safeParse(input);
	const text = r.success ? '' : issueText(r.error!);
	ok(name, !r.success && text.includes(needle), r.success ? 'accepted — expected rejection' : text);
}

function acceptsLifecycle(study: Study, name: string) {
	const violations = validateStudyLifecycle(study);
	ok(name, violations.length === 0, violations.join('; '));
}

function rejectsLifecycle(study: Study, name: string, needle: string) {
	const violations = validateStudyLifecycle(study);
	ok(
		name,
		violations.some((violation) => violation.includes(needle)),
		violations.length ? violations.join('; ') : 'accepted — expected rejection'
	);
}

function acceptsInstrument(doc: unknown, name: string) {
	const parsed = InstrumentSchema.safeParse(doc);
	if (!parsed.success) {
		ok(name, false, issueText(parsed.error));
		return;
	}
	const violations = validateInstrument(parsed.data);
	ok(name, violations.length === 0, violations.join('; '));
}

function rejectsInstrument(doc: unknown, name: string, needle: string) {
	const parsed = InstrumentSchema.safeParse(doc);
	if (!parsed.success) {
		const text = issueText(parsed.error);
		ok(name, text.includes(needle), text);
		return;
	}
	const violations = validateInstrument(parsed.data);
	ok(
		name,
		violations.some((violation) => violation.includes(needle)),
		violations.length ? violations.join('; ') : 'accepted — expected rejection'
	);
}

function acceptsResults(doc: unknown, name: string) {
	const parsed = StudyResultsSchema.safeParse(doc);
	if (!parsed.success) {
		ok(name, false, issueText(parsed.error));
		return;
	}
	const violations = validateResults(parsed.data);
	ok(name, violations.length === 0, violations.join('; '));
}

function rejectsResults(doc: unknown, name: string, needle: string) {
	const parsed = StudyResultsSchema.safeParse(doc);
	if (!parsed.success) {
		const text = issueText(parsed.error);
		ok(name, text.includes(needle), text);
		return;
	}
	const violations = validateResults(parsed.data);
	ok(
		name,
		violations.some((violation) => violation.includes(needle)),
		violations.length ? violations.join('; ') : 'accepted — expected rejection'
	);
}

/** Same comment-stripping as test-feed: prose about a rule must not satisfy it. */
function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split(/\r?\n/)
		.filter((line) => !/^\s*(\/\/|\*)/.test(line))
		.join('\n');
}

// ---------------------------------------------------------------------------
// Fixtures — minimal VALID records. Referential integrity is build-studies'
// job; the validator suites below override one field at a time.
// ---------------------------------------------------------------------------

const item = (over: Record<string, unknown> = {}) => ({
	id: 'it-1',
	module: 'mod-1',
	tier: 'core',
	construct: 'fixture-construct',
	provenance: 'project',
	text_en: 'A fixture item.',
	text_fr: null,
	text_ar: null,
	response: 'scale_0_10',
	required: true,
	...over
});

const instrumentMeta = (over: Record<string, unknown> = {}) => ({
	id: 'it-fixture',
	study: 'dt-fixture-001',
	version: '0.0.1-draft',
	status: 'draft',
	frozen: false,
	content_hash: null,
	source_locale: 'en',
	locales: ['en', 'fr', 'ar'],
	estimated_minutes: 5,
	completion_target_minutes_max: 15,
	pretest_required: false,
	response_scale_note: 'Fixture scale note.',
	...over
});

const maxdiff = (over: Record<string, unknown> = {}) => ({
	id: 'maxdiff_fixture',
	task: 'most_and_least',
	items_per_set: 4,
	sets: 2,
	pool: ['it-1'],
	design: {
		status: 'to-generate',
		constraints: ['each item appears in two sets'],
		frozen_with_instrument: true
	},
	instruction_en: 'Choose the most and least essential.',
	text_fr: null,
	text_ar: null,
	...over
});

const gap = (over: Record<string, unknown> = {}) => ({
	id: 'gap_fixture',
	response: 'scale_0_10',
	instruction_en: 'How present is it in Tunisia today?',
	text_fr: null,
	text_ar: null,
	items: ['it-1'],
	excluded_note: 'Fixture note.',
	...over
});

const instrumentFixture = (over: Record<string, unknown> = {}) => ({
	instrument: instrumentMeta(),
	translation: {
		policy: 'Fixture translation policy.',
		report: null,
		locales: { en: { status: 'source' } }
	},
	response_types: { scale_0_10: 'integer 0-10 plus skip' },
	modules: [{ id: 'mod-1', label: 'Fixture module', items: ['it-1'] }],
	items: [item()],
	maxdiff_priority: maxdiff(),
	gap_block: gap(),
	experiments: [
		{
			id: 'exp-1',
			factor: 'fixture factor',
			arms: ['a', 'b'],
			allocation: 'simple randomization, 50/50',
			analysis: 'section 1'
		}
	],
	tiers: { core: 'always fielded' },
	...over
});

const studyFixture = (over: Record<string, unknown> = {}): Study =>
	({
		id: 'dt-fixture-001',
		slug: 'fixture',
		title_en: 'Fixture Study',
		title_fr: null,
		title_ar: null,
		status: 'design',
		design_type: 'cross-sectional-online',
		population: 'open-online-18-plus',
		population_statement: null,
		locales: ['en', 'fr', 'ar'],
		ethics_review: null,
		data_protection_review: null,
		preregistration: null,
		instrument_versions: [
			{ id: 'it-fixture', version: '0.0.1-draft', hash: null, source: 'fixtures/instrument.yaml', frozen: false }
		],
		fielding_window: null,
		target_n: 1500,
		realized_n: null,
		weighting: 'raking-ins-2024',
		data_license: 'CC-BY-4.0',
		funding: null,
		pi: null,
		outputs: [],
		created: '2026-09-14',
		updated: '2026-09-14',
		...over
	}) as unknown as Study;

/** A study at fielding-or-later with every gate satisfied; overrides reopen one. */
const gatedStudy = (over: Record<string, unknown> = {}): Study =>
	studyFixture({
		status: 'fielding',
		population_statement: 'Adults 18+ reached online in Tunisia and the diaspora.',
		ethics_review: 'ethics-2026-01',
		data_protection_review: 'dpa-2026-01',
		preregistration: 'osf.io/fixture',
		instrument_versions: [
			{ id: 'it-fixture', version: '1.0.0', hash: 'a'.repeat(64), source: 'fixtures/instrument.yaml', frozen: true }
		],
		fielding_window: { start: '2026-10-01' },
		...over
	});

const resultsBlock = (over: Record<string, unknown> = {}) => ({
	id: 'block-1',
	label: 'Fixture block',
	metric: 'mean',
	n: 1200,
	weighted: true,
	values: { essential: 7.2 },
	suppression: null,
	population_statement: 'Adults 18+ reached online in Tunisia and the diaspora.',
	...over
});

const resultsFixture = (over: Record<string, unknown> = {}) => ({
	study_id: 'dt-fixture-001',
	instrument: { id: 'it-fixture', version: '1.0.0', hash: 'a'.repeat(64) },
	n: 1200,
	weighting: 'raking-ins-2024',
	population_statement: 'Adults 18+ reached online in Tunisia and the diaspora.',
	generated_at: '2026-09-14T00:00:00Z',
	blocks: [resultsBlock()],
	...over
});

// ---------------------------------------------------------------------------
// The real registry and the real workshop instrument
// ---------------------------------------------------------------------------

console.log('\n  ── study registry ──\n');

const STUDIES_FILE = join(ROOT, 'data', 'studies', 'studies.yaml');
if (!existsSync(STUDIES_FILE)) {
	ok('registry: data/studies/studies.yaml exists', false, 'file missing');
} else {
	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(STUDIES_FILE, 'utf8'));
	} catch (e) {
		ok('registry: data/studies/studies.yaml parses as YAML', false, (e as Error).message);
		raw = undefined;
	}
	if (raw !== undefined) {
		ok(
			'registry: the document is a list with at least one study',
			Array.isArray(raw) && raw.length > 0,
			Array.isArray(raw) ? `${raw.length} entries` : typeof raw
		);
		if (Array.isArray(raw)) {
			for (const entry of raw) {
				const label =
					entry && typeof entry === 'object' && 'id' in entry
						? String((entry as { id: unknown }).id)
						: 'entry';
				const result = StudySchema.safeParse(entry);
				ok(
					`registry: study ${label} parses`,
					result.success,
					result.success ? 'accepted' : issueText(result.error!)
				);
				if (result.success) {
					const violations = validateStudyLifecycle(result.data);
					ok(
						`registry: study ${label} passes the lifecycle gate`,
						violations.length === 0,
						violations.join('; ')
					);
				}
			}
		}
	}
}

const WORKSHOP_INSTRUMENT = join(ROOT, 'research', 'portal', 'study-001', 'instrument-v0.yaml');
if (!existsSync(WORKSHOP_INSTRUMENT)) {
	console.log('  skip  workshop instrument not present at research/portal/study-001/instrument-v0.yaml');
} else {
	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(WORKSHOP_INSTRUMENT, 'utf8'));
	} catch (e) {
		ok('workshop instrument: the draft parses as YAML', false, (e as Error).message);
		raw = undefined;
	}
	if (raw !== undefined) {
		accepts(InstrumentSchema, raw, 'workshop instrument: the draft matches the instrument schema');
		const parsed = InstrumentSchema.safeParse(raw);
		if (parsed.success) {
			const violations = validateInstrument(parsed.data);
			ok(
				'workshop instrument: validateInstrument reports no violations',
				violations.length === 0,
				violations.join('; ')
			);
			ok(
				'workshop instrument: computeInstrumentHash returns a sha256 hex',
				/^[0-9a-f]{64}$/.test(computeInstrumentHash(parsed.data))
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Instrument schema and validator — negative fixtures at both layers
// ---------------------------------------------------------------------------

console.log('\n  ── instrument schema and validator ──\n');

accepts(InstrumentSchema, instrumentFixture(), 'instrument: a draft with null locale text parses');
acceptsInstrument(instrumentFixture(), 'instrument: the same draft passes validateInstrument');

{
	const missingConstruct: Record<string, unknown> = { ...item() };
	delete missingConstruct.construct;
	rejectsWith(
		InstrumentSchema,
		instrumentFixture({ items: [missingConstruct] }),
		'instrument: an item without a construct is rejected',
		'construct'
	);
}
{
	const missingProvenance: Record<string, unknown> = { ...item() };
	delete missingProvenance.provenance;
	rejectsWith(
		InstrumentSchema,
		instrumentFixture({ items: [missingProvenance] }),
		'instrument: an item without a provenance is rejected',
		'provenance'
	);
}
rejectsInstrument(
	instrumentFixture({ items: [item(), item()] }),
	'instrument: a duplicate item id is rejected',
	'duplicate item id'
);
rejectsInstrument(
	instrumentFixture({ modules: [{ id: 'mod-1', label: 'Fixture module', items: ['it-1', 'it-missing'] }] }),
	'instrument: a module reference to an unknown item is rejected',
	'it-missing'
);
rejectsInstrument(
	instrumentFixture({ maxdiff_priority: maxdiff({ pool: ['it-1', 'it-missing'] }) }),
	'instrument: a maxdiff pool reference to an unknown item is rejected',
	'it-missing'
);
rejectsInstrument(
	instrumentFixture({ gap_block: gap({ items: ['it-missing'] }) }),
	'instrument: a gap block reference to an unknown item is rejected',
	'it-missing'
);

acceptsInstrument(
	instrumentFixture({
		instrument: instrumentMeta({ frozen: true, content_hash: 'c'.repeat(64) }),
		items: [item({ text_fr: 'Texte fr', text_ar: 'Texte ar' })],
		maxdiff_priority: maxdiff({ text_fr: 'Texte fr', text_ar: 'Texte ar' }),
		gap_block: gap({ text_fr: 'Texte fr', text_ar: 'Texte ar' })
	}),
	'instrument: a fully localized frozen instrument passes'
);
acceptsInstrument(
	instrumentFixture({
		instrument: instrumentMeta({ frozen: true, content_hash: 'b'.repeat(64) }),
		items: [
			item({ text_fr: 'Texte fr', text_ar: 'Texte ar' }),
			item({ id: 'it-auto', response: 'auto', text_en: null, text_fr: null, text_ar: null })
		],
		maxdiff_priority: maxdiff({ text_fr: 'Texte fr', text_ar: 'Texte ar' }),
		gap_block: gap({ text_fr: 'Texte fr', text_ar: 'Texte ar' })
	}),
	'instrument: a frozen instrument with a platform-recorded item and null text passes'
);
rejectsInstrument(
	instrumentFixture({
		instrument: instrumentMeta({ frozen: true, content_hash: 'a'.repeat(64) }),
		maxdiff_priority: maxdiff({ text_fr: 'Texte fr', text_ar: 'Texte ar' }),
		gap_block: gap({ text_fr: 'Texte fr', text_ar: 'Texte ar' })
	}),
	'instrument: a frozen instrument with a null locale text is rejected',
	'item "it-1" has no fr text'
);
rejectsInstrument(
	instrumentFixture({
		instrument: instrumentMeta({ frozen: true, content_hash: null }),
		items: [item({ text_fr: 'Texte fr', text_ar: 'Texte ar' })],
		maxdiff_priority: maxdiff({ text_fr: 'Texte fr', text_ar: 'Texte ar' }),
		gap_block: gap({ text_fr: 'Texte fr', text_ar: 'Texte ar' })
	}),
	'instrument: a frozen instrument without a content hash is rejected',
	'content_hash'
);

// ---------------------------------------------------------------------------
// Instrument hash — immutability of what a respondent saw
// ---------------------------------------------------------------------------

console.log('\n  ── instrument hash ──\n');

{
	const base = InstrumentSchema.parse(instrumentFixture());
	const hash = computeInstrumentHash(base);
	ok('hash: the same document hashes identically twice', computeInstrumentHash(InstrumentSchema.parse(instrumentFixture())) === hash, hash.slice(0, 12));
	ok(
		'hash: a changed item text moves the hash',
		computeInstrumentHash(
			InstrumentSchema.parse(instrumentFixture({ items: [item({ text_en: 'A different fixture item.' })] }))
		) !== hash
	);
	ok(
		'hash: notes, status, content_hash and translation are excluded',
		computeInstrumentHash(
			InstrumentSchema.parse(
				instrumentFixture({
					instrument: instrumentMeta({ status: 'review', content_hash: 'f'.repeat(64) }),
					items: [item({ notes: 'An excluded note.' })],
					translation: { policy: 'A different policy.', report: 'report.md', locales: { en: { status: 'source' } } }
				})
			)
		) === hash
	);
}

// ---------------------------------------------------------------------------
// Study lifecycle gates
// ---------------------------------------------------------------------------

console.log('\n  ── study lifecycle ──\n');

accepts(StudySchema, studyFixture(), 'study: a design-status manifest parses');
acceptsLifecycle(studyFixture(), 'study: a design-status manifest passes the lifecycle gate');
acceptsLifecycle(gatedStudy(), 'study: a complete fielding gate passes');

rejectsLifecycle(
	gatedStudy({ preregistration: null }),
	'study: fielding without a preregistration is rejected',
	'preregistration'
);
rejectsLifecycle(
	gatedStudy({ fielding_window: null }),
	'study: fielding without a window start is rejected',
	'fielding_window.start'
);
rejectsLifecycle(
	gatedStudy({
		instrument_versions: [
			{ id: 'it-fixture', version: '1.0.0', hash: 'a'.repeat(64), source: 'fixtures/instrument.yaml', frozen: false }
		]
	}),
	'study: fielding with an unfrozen instrument version is rejected',
	'to be frozen'
);

const closedStudy = gatedStudy({
	status: 'closed',
	fielding_window: { start: '2026-10-01', end: '2026-12-01' },
	realized_n: 1100
});
acceptsLifecycle(closedStudy, 'study: closed with a window end and a realized n passes');
rejectsLifecycle(
	{ ...closedStudy, realized_n: null } as Study,
	'study: closed without a realized n is rejected',
	'realized_n'
);

const publishedNoDataset = gatedStudy({
	status: 'published',
	fielding_window: { start: '2026-10-01', end: '2026-12-01' },
	realized_n: 1100,
	outputs: [{ kind: 'paper', id: 'doi:10.0000/fixture' }]
});
rejectsLifecycle(
	publishedNoDataset,
	'study: published without a dataset output id is rejected',
	'dataset'
);
acceptsLifecycle(
	{
		...publishedNoDataset,
		outputs: [
			{ kind: 'dataset', id: 'doi:10.5281/fixture' },
			{ kind: 'paper', id: null }
		]
	} as Study,
	'study: published with a dataset output id passes'
);

// ---------------------------------------------------------------------------
// Released aggregates — the population qualifier travels with the number (R2)
// ---------------------------------------------------------------------------

console.log('\n  ── results blocks ──\n');

accepts(StudyResultsSchema, resultsFixture(), 'results: a complete document parses');
acceptsResults(resultsFixture(), 'results: a complete document passes validateResults');
rejectsResults(
	resultsFixture({ blocks: [resultsBlock({ population_statement: null })] }),
	'results: a block with a null population statement is rejected',
	'population_statement'
);

// ---------------------------------------------------------------------------
// Graph separation — output and source level
// ---------------------------------------------------------------------------

console.log('\n  ── graph separation ──\n');

const DATASET_FILE = join(ROOT, 'src', 'generated', 'dataset.json');
if (!existsSync(DATASET_FILE)) {
	bail('src/generated/dataset.json is missing — run `npm run data` (or `npm run build`) first');
}
const datasetRaw = readFileSync(DATASET_FILE, 'utf8');
{
	const dataset = JSON.parse(datasetRaw) as Record<string, unknown>;
	ok(
		'dataset.json carries no studies collection',
		!Object.prototype.hasOwnProperty.call(dataset, 'studies')
	);
}
ok(
	'dataset.json contains no study id strings',
	!datasetRaw.includes('dt-research-001') && !datasetRaw.includes('dt001-democracy'),
	`${(datasetRaw.length / 1024).toFixed(0)} KB scanned`
);
{
	const buildSrc = stripComments(readFileSync(join(HERE, 'build-data.ts'), 'utf8'));
	ok(
		'build-data.ts does not import research-schema.ts or build-studies.ts',
		!/research-schema|build-studies/.test(buildSrc)
	);
}
{
	const studiesSrc = stripComments(readFileSync(join(HERE, 'build-studies.ts'), 'utf8'));
	ok(
		'build-studies.ts does not import the graph build',
		!/from '\.\/(build-data|schema)\.ts'/.test(studiesSrc)
	);
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
