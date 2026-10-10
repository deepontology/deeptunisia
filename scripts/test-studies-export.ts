/**
 * Export and aggregation tests (portal README §7, protocol §8).
 *
 * The pipeline is exercised end to end but hermetically: an in-memory research
 * store is created from the same schema the server uses, rows are inserted
 * directly (the harness mirrors test-research-api.ts), the export runs as a
 * function and writes its CSV into a temp directory, and the aggregator runs
 * over that CSV as a function. Nothing here touches `.community/`, `data/` or
 * `research/portal/`.
 *
 * The crafted rows are one per exclusion rule, one that trips two rules, one
 * clean pair, and one near-identical pair whose difference stays under the
 * 95% threshold. Assertions cover CSV fidelity, every rule (fired and not
 * fired), duplicate later-row flagging, the schema and qualifier gates, CRLF
 * output, determinism, the channel breakdown, and the marked draft population
 * string when the registry has none.
 *
 * Usage: `npx tsx scripts/test-studies-export.ts`
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { localDb } from '../community/db-local.ts';
import type { Db } from '../community/db.ts';
import {
	gapAnswerKey,
	compileInstrument,
	type InstrumentDocument,
	type RuntimeInstrument
} from '../community/research-contract.ts';
import { StudyResultsSchema, validateResults } from './research-schema.ts';
import { EXPORT_COLUMNS, exportResponses } from './studies-export.ts';
import {
	aggregateCsv,
	DRAFT_POPULATION_STATEMENT,
	parseResponses,
	resultsToYaml,
	type ParsedResponse
} from './studies-aggregate.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RESEARCH_SCHEMA = readFileSync(join(ROOT, 'community', 'research-schema.sql'), 'utf8');
const NOW = '2026-09-15T12:00:00.000Z';
const DECLARED_POPULATION = 'Adults 18+ reached online in Tunisia and the diaspora.';

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

function bail(message: string): never {
	console.error(`  FAIL  ${message}`);
	console.error('\n  0/1 checks passed, 1 FAILED\n');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Fixture instrument: 20 displayed non-consent items, so 80% is 16 answered
// and 95% similarity needs 19 of 20 equal values.
// ---------------------------------------------------------------------------

const STUDY_ID = 'dt-export-001';

const fixtureDoc = (): InstrumentDocument => {
	const items: InstrumentDocument['items'] = [
		{
			id: 'consent_ok',
			module: 'consent',
			tier: 'core',
			response: 'consent',
			required: true,
			text_en: 'I consent.',
			text_fr: null,
			text_ar: null
		}
	];
	for (let i = 1; i <= 16; i++) {
		items.push({
			id: `e${i}`,
			module: i <= 8 ? 'essentiality_core' : 'essentiality_extended',
			tier: i <= 8 ? 'core' : 'extended',
			response: 'scale_essential',
			required: true,
			text_en: `Essential item ${i}.`,
			text_fr: null,
			text_ar: null
		});
	}	items.push(
		{
			id: 's1',
			module: 'support_regime',
			tier: 'core',
			response: 'agree_4',
			required: true,
			text_en: 'Support one.',
			text_fr: null,
			text_ar: null
		},
		{
			id: 's2',
			module: 'support_regime',
			tier: 'core',
			response: 'scale_0_10',
			required: true,
			text_en: 'Support two.',
			text_fr: null,
			text_ar: null
		}
	);

	return {
		instrument: {
			id: 'it-export',
			study: STUDY_ID,
			version: '1.0.0',
			source_locale: 'en',
			locales: ['en', 'fr', 'ar'],
			estimated_minutes: 5,
			completion_target_minutes_max: 15
		},
		modules: [
			{ id: 'consent', label: 'Consent', items: ['consent_ok'] },
			{ id: 'essentiality_core', label: 'Essentiality core', items: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'] },
			{
				id: 'essentiality_extended',
				label: 'Essentiality extended',
				items: ['e9', 'e10', 'e11', 'e12', 'e13', 'e14', 'e15', 'e16']
			},
			{ id: 'support_regime', label: 'Support', items: ['s1', 's2'] },
			{ id: 'presence_tunisia', label: 'Presence', block: 'gap_block' },
			{ id: 'maxdiff_priority', label: 'MaxDiff', block: 'maxdiff_priority' }
		],
		items,
		maxdiff_priority: {
			id: 'maxdiff_priority',
			items_per_set: 4,
			sets: 2,
			pool: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
			design: {
				status: 'generated',
				sets: [
					{ id: 'mds1', items: ['e1', 'e2', 'e3', 'e4'] },
					{ id: 'mds2', items: ['e5', 'e6', 'e7', 'e8'] }
				]
			},
			instruction_en: 'Pick the most and the least.',
			text_fr: null,
			text_ar: null
		},
		// The presence block re-asks two items the essentiality blocks already
		// asked, as the real instrument's does, so a row can hold both ratings
		// of one item and neither is lost.
		gap_block: {
			id: 'gap_block',
			response: 'scale_present',
			instruction_en: 'How present?',
			text_fr: null,
			text_ar: null,
			items: ['e1', 'e2']
		},
		experiments: []
	};
};

const fixtureInstrument: RuntimeInstrument = compileInstrument(fixtureDoc());

type FixtureRow = {
	receipt: string;
	channel: string;
	submitted_at: number;
	completion_ms: number;
	answers: Record<string, unknown>;
	maxdiff: Array<{ set: string; most: string; least: string }> | null;
};

/** 20 keys: consent, all 18 displayed items, and the two presence ratings. */
function completeAnswers(offset: number): Record<string, unknown> {
	const answers: Record<string, unknown> = { consent_ok: true };
	for (let i = 1; i <= 16; i++) answers[`e${i}`] = (i + offset) % 11;
	answers.s1 = 1 + (offset % 4);
	answers.s2 = (offset * 3) % 11;
	// The presence ratings of e1 and e2, under the presence block's own keys:
	// the same items the essentiality ratings above are keyed by.
	answers[gapAnswerKey('e1')] = (offset + 3) % 11;
	answers[gapAnswerKey('e2')] = (offset + 7) % 11;
	return answers;
}

const maxdiffA = [
	{ set: 'mds1', most: 'e1', least: 'e4' },
	{ set: 'mds2', most: 'e5', least: 'e8' }
];
const maxdiffB = [
	{ set: 'mds1', most: 'e2', least: 'e3' },
	{ set: 'mds2', most: 'e6', least: 'e7' }
];

const cleanA = completeAnswers(0);
const cleanB = completeAnswers(1);

// C: 12 keys, 12 of 18 displayed items answered (67%), all essentiality answers 5.
const incompleteStraight: Record<string, unknown> = { consent_ok: true };
for (let i = 1; i <= 11; i++) incompleteStraight[`e${i}`] = 5;
incompleteStraight.s1 = 2;
incompleteStraight.s2 = 3;

// D: complete, every essentiality answer 7.
const straightLining = completeAnswers(0);
for (let i = 1; i <= 16; i++) straightLining[`e${i}`] = 7;

// F: A with one value changed: 20 of 21 equal, above the 95% threshold.
const duplicateOfA = { ...cleanA, s2: ((cleanA.s2 as number) + 1) % 11 };

// G: B with two values changed: 19 of 21 equal, below the threshold.
const nearB = { ...cleanB, s1: 3, s2: 10 };

const rows: FixtureRow[] = [
	{ receipt: 'r-a', channel: 'organic', submitted_at: 1000, completion_ms: 300_000, answers: cleanA, maxdiff: maxdiffA },
	{ receipt: 'r-b', channel: 'ads', submitted_at: 2000, completion_ms: 310_000, answers: cleanB, maxdiff: maxdiffB },
	{ receipt: 'r-c', channel: 'organic', submitted_at: 3000, completion_ms: 305_000, answers: incompleteStraight, maxdiff: null },
	{ receipt: 'r-d', channel: 'ads', submitted_at: 4000, completion_ms: 306_000, answers: straightLining, maxdiff: null },
	{ receipt: 'r-e', channel: 'organic', submitted_at: 5000, completion_ms: 100_000, answers: completeAnswers(2), maxdiff: maxdiffB },
	{ receipt: 'r-f', channel: 'organic', submitted_at: 6000, completion_ms: 307_000, answers: duplicateOfA, maxdiff: maxdiffA },
	{ receipt: 'r-g', channel: 'ads', submitted_at: 7000, completion_ms: 308_000, answers: nearB, maxdiff: maxdiffA }
];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function researchDb(): Db {
	const db = localDb(':memory:');
	void db.exec(RESEARCH_SCHEMA);
	return db;
}

async function insertRow(db: Db, row: FixtureRow) {
	await db
		.prepare(
			`INSERT INTO research_responses
			 (receipt, study_id, instrument_id, instrument_version, instrument_hash,
			  locale, channel, consent_version, started_at, submitted_at, completion_ms,
			  block_order, scale_direction, answers, maxdiff, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			row.receipt,
			STUDY_ID,
			fixtureInstrument.id,
			fixtureInstrument.version,
			fixtureInstrument.hash,
			'en',
			row.channel,
			'consent-v1',
			row.submitted_at - 1000,
			row.submitted_at,
			row.completion_ms,
			'core_first',
			'ascending',
			JSON.stringify(row.answers),
			row.maxdiff ? JSON.stringify(row.maxdiff) : null,
			row.submitted_at
		)
		.run();
}

type RulesByReceipt = Map<string, string[]>;

function rulesFor(outcome: { perRow: RulesByReceipt }, receipt: string): string[] {
	return [...(outcome.perRow.get(receipt) ?? [])].sort();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

console.log('\n  ── the working CSV ──\n');

const workDir = mkdtempSync(join(tmpdir(), 'dt-studies-export-'));
const csvPath = join(workDir, 'responses.csv');

const db = researchDb();
for (const row of rows) await insertRow(db, row);
const exported = await exportResponses(db, STUDY_ID, csvPath);

ok('the export writes every row of the study', exported === rows.length, String(exported));

const csvText = readFileSync(csvPath, 'utf8');
const header = csvText.split(/\r?\n/, 1)[0].split(',');
ok(
	'the CSV carries exactly the contract columns, in order',
	JSON.stringify(header) === JSON.stringify([...EXPORT_COLUMNS]),
	header.join(',')
);

const parsed: ParsedResponse[] = parseResponses(csvText);
ok('the CSV parses back to the same number of rows', parsed.length === rows.length);

const rowA = parsed.find((row) => row.receipt === 'r-a');
ok(
	'answers survive as JSON, verbatim',
	JSON.stringify(rowA?.answers) === JSON.stringify(cleanA)
);
ok(
	'maxdiff survives as JSON, verbatim',
	JSON.stringify(rowA?.maxdiff) === JSON.stringify(maxdiffA)
);
ok(
	'a null maxdiff column stays null',
	parsed.find((row) => row.receipt === 'r-c')?.maxdiff === null
);
ok(
	'numbers come back as numbers',
	rowA?.completion_ms === 300_000 && rowA.submitted_at === 1000 && rowA.created_at === 1000
);

// The canonical trees are off limits for the working CSV.
let refusedData = false;
try {
	await exportResponses(db, STUDY_ID, join(ROOT, 'data', 'responses.csv'));
} catch {
	refusedData = true;
}
ok('the export refuses to write inside data/', refusedData);

let missingTable = false;
try {
	await exportResponses(localDb(':memory:'), STUDY_ID, join(workDir, 'empty.csv'));
} catch {
	missingTable = true;
}
ok('a missing table is an error, not an empty CSV', missingTable);

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

console.log('\n  ── the exclusion rules ──\n');

const outcome = aggregateCsv(csvText, fixtureInstrument, {
	populationStatement: null,
	generatedAt: NOW
});
const { results } = outcome;
const exclusions = results.exclusions!;

ok('the clean rows trip no rule', rulesFor(outcome, 'r-a').length === 0 && rulesFor(outcome, 'r-b').length === 0);
ok('the near-identical row below the threshold trips no rule', rulesFor(outcome, 'r-g').length === 0, rulesFor(outcome, 'r-g').join(','));
ok(
	'the incomplete row also straight-lines',
	JSON.stringify(rulesFor(outcome, 'r-c')) === JSON.stringify(['incomplete', 'straight-lining']),
	rulesFor(outcome, 'r-c').join(',')
);
ok(
	'the constant answer row is straight-lining only',
	JSON.stringify(rulesFor(outcome, 'r-d')) === JSON.stringify(['straight-lining'])
);
ok('the fast row is speed only', JSON.stringify(rulesFor(outcome, 'r-e')) === JSON.stringify(['speed']));
ok(
	'duplicates flag only the later row',
	rulesFor(outcome, 'r-f').includes('duplicates') && !rulesFor(outcome, 'r-a').includes('duplicates')
);
ok(
	'the per-rule counts are reported and may overlap',
	exclusions.rules.incomplete === 1 &&
		exclusions.rules['straight-lining'] === 2 &&
		exclusions.rules.speed === 1 &&
		exclusions.rules.duplicates === 1,
	JSON.stringify(exclusions.rules)
);
ok('distinct excluded rows are counted', exclusions.rows_excluded === 4, String(exclusions.rows_excluded));
ok(
	'the channel breakdown counts distinct excluded rows',
	exclusions.by_channel.organic === 3 && exclusions.by_channel.ads === 1,
	JSON.stringify(exclusions.by_channel)
);
ok('only included rows enter the aggregates', results.n === 3, String(results.n));

// ---------------------------------------------------------------------------
// The results document
// ---------------------------------------------------------------------------

console.log('\n  ── the results document ──\n');

const parsedResults = StudyResultsSchema.safeParse(results);
ok('the document passes StudyResultsSchema', parsedResults.success, parsedResults.success ? '' : parsedResults.error.issues[0]?.message ?? '');
ok('the document passes validateResults', validateResults(results).length === 0, validateResults(results).join('; '));
ok(
	'every block carries its population qualifier, a positive n and no weighting',
	results.blocks.every(
		(block) => block.population_statement && block.n > 0 && block.weighted === false && block.suppression === null
	)
);
ok(
	'the registry without a statement produces the marked draft string',
	results.population_statement === DRAFT_POPULATION_STATEMENT &&
		results.blocks.every((block) => block.population_statement === DRAFT_POPULATION_STATEMENT)
);
ok('weighting is marked as the unweighted draft', results.weighting === 'unweighted-draft');

const withStatement = aggregateCsv(csvText, fixtureInstrument, {
	populationStatement: DECLARED_POPULATION,
	generatedAt: NOW
});
ok(
	'a declared population statement is carried on the document and on every block',
	withStatement.results.population_statement === DECLARED_POPULATION &&
		withStatement.results.blocks.every((block) => block.population_statement === DECLARED_POPULATION)
);

const essentiality = results.blocks.find((block) => block.id === 'e1');
ok(
	'the essentiality block carries mean, 9/10, against and skipped',
	Boolean(essentiality) &&
		typeof essentiality!.values.mean === 'number' &&
		typeof essentiality!.values.percent_9_or_10 === 'number' &&
		typeof essentiality!.values.percent_against === 'number' &&
		typeof essentiality!.values.percent_skipped === 'number',
	JSON.stringify(essentiality?.values)
);

const support = results.blocks.find((block) => block.id === 's1');
ok(
	'the support block carries the mean and the full distribution',
	Boolean(support) &&
		support!.values.mean !== undefined &&
		support!.values.count_1 + support!.values.count_2 + support!.values.count_3 + support!.values.count_4 === support!.n
);

const maxdiffSet = results.blocks.find((block) => block.id === 'maxdiff_mds1');
ok(
	'the MaxDiff block counts most and least per item in the set',
	Boolean(maxdiffSet) &&
		['e1', 'e2', 'e3', 'e4'].every(
			(item) => typeof maxdiffSet!.values[`most:${item}`] === 'number' && typeof maxdiffSet!.values[`least:${item}`] === 'number'
		),
	JSON.stringify(maxdiffSet?.values)
);

{
	// The presence block re-asks e1 and e2, so one row carries both ratings and
	// the document can hold both: an aggregate that lost one of them could not
	// measure the gap between importance and reality.
	const presenceOf = (id: string) =>
		results.blocks.find((block) => block.id === id && block.metric === 'gap_presence');
	ok(
		'the presence blocks read the presence keys, one per re-asked item',
		['e1', 'e2'].every((id) => typeof presenceOf(id)?.values.mean === 'number'),
		['e1', 'e2'].map((id) => `${id}=${presenceOf(id)?.values.mean}`).join(' ')
	);
	const included = [cleanA, cleanB, nearB];
	const presenceMean = (id: string) => Number(presenceOf(id)!.values.mean);
	// The aggregate rounds to two decimals, so the expectation is rounded too.
	const expected = (id: string) =>
		Math.round((included.reduce((sum, answers) => sum + (answers[gapAnswerKey(id)] as number), 0) / included.length) * 100) / 100;
	ok(
		'the presence mean is the mean of the presence ratings',
		presenceMean('e1') === expected('e1') && presenceMean('e2') === expected('e2'),
		`e1 ${presenceMean('e1')} vs ${expected('e1')}, e2 ${presenceMean('e2')} vs ${expected('e2')}`
	);
	const essentialityMean = (id: string) =>
		results.blocks.find((block) => block.id === id && block.metric === 'essentiality')!.values.mean as number;
	ok(
		'the presence rating never stands in for the item\'s own rating',
		essentialityMean('e1') !== presenceMean('e1') && essentialityMean('e2') !== presenceMean('e2'),
		`e1 ${essentialityMean('e1')} vs ${presenceMean('e1')}, e2 ${essentialityMean('e2')} vs ${presenceMean('e2')}`
	);
	ok(
		'both ratings of the same item are published, each under its own metric',
		results.blocks.filter((block) => block.id === 'e1').length === 2 &&
			results.blocks.filter((block) => block.id === 'e1').map((block) => block.metric).join(',') ===
				'essentiality,gap_presence',
		results.blocks.filter((block) => block.id === 'e1').map((block) => block.metric).join(',')
	);
}

const channelBlock = results.blocks.find((block) => block.id === 'count_by_channel');
ok(
	'the channel breakdown appears as a block',
	channelBlock?.values.organic === 1 && channelBlock.values.ads === 2,
	JSON.stringify(channelBlock?.values)
);

const yaml = resultsToYaml(results);
const reparsed = StudyResultsSchema.safeParse(parseYaml(yaml));
ok('the emitted YAML parses and validates', reparsed.success && validateResults(reparsed.data!).length === 0);
ok('the YAML uses CRLF throughout', !/[^\r]\n/.test(yaml) && yaml.includes('\r\n'));
ok(
	'the YAML carries the exclusion report',
	/exclusions:/.test(yaml) &&
		yaml.includes('rows_excluded: 4') &&
		yaml.includes('incomplete: 1') &&
		yaml.includes('straight-lining: 2') &&
		yaml.includes('organic: 3') &&
		yaml.includes('ads: 1')
);

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

console.log('\n  ── determinism ──\n');

const first = aggregateCsv(csvText, fixtureInstrument, { populationStatement: DECLARED_POPULATION, generatedAt: NOW });
const second = aggregateCsv(csvText, fixtureInstrument, { populationStatement: DECLARED_POPULATION, generatedAt: NOW });
ok('two runs produce identical documents', JSON.stringify(first.results) === JSON.stringify(second.results));
ok('two runs produce byte-identical YAML', resultsToYaml(first.results) === resultsToYaml(second.results));

rmSync(workDir, { recursive: true, force: true });

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
