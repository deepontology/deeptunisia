/**
 * Research aggregation (portal README §7, backend.md §5).
 *
 * The second offline step: read the working CSV, apply the pre-registered
 * exclusion rules mechanically, and write `data/studies/<study-id>/results.yaml`
 * as committed aggregates. The build validates that file (schema plus the R2
 * qualifier rule) and carries it into `src/generated/studies.json`; the renderer
 * is a later slice.
 *
 * What this script deliberately does not do:
 *  - it never reads the database (the export script does that);
 *  - it never invents a population: the registry's statement is used, or the
 *    clearly marked draft string when the study has none yet;
 *  - it never moves a threshold: the four rules are the ones in protocol §8 with
 *    the pre-registered numbers, and every excluded row is counted by rule and
 *    by channel so the release can report them.
 *
 * Exclusion rules (protocol §8, applied in this order only for reporting, never
 * for chaining: a row that trips any rule is out of the primary aggregates, and
 * a row may trip several):
 *  - incomplete: fewer than 80% of the displayed non-consent items answered;
 *  - straight-lining: at least 5 essentiality items answered and zero variance;
 *  - speed: completion_ms below 40% of estimatedMinutes * 60,000;
 *  - duplicates: same answer key set as an earlier row and at least 95% of the
 *    values equal; the later row is flagged, never the first.
 *
 * Determinism: map iteration follows insertion order, every record is built in
 * a fixed order (or sorted), and the only clock read is `generated_at`, which
 * the CLI can pin with `--now`.
 *
 * Usage:
 *   npx tsx scripts/studies-aggregate.ts [--study dt-research-001]
 *     [--in research/portal/study-001/data/responses.csv]
 *     [--out data/studies/dt-research-001/results.yaml] [--now <iso>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';
import {
	gapAnswerKey,
	type RuntimeInstrument,
	type RuntimeItem,
	type StudiesRegistry
} from '../community/research-contract.ts';
import {
	aggregateResponses as scoreAggregate,
	aggregateSeries,
	applyExclusions,
	applyPublicationFloor,
	periodOf
} from '../community/research-scoring.ts';
import { monthDigest, releaseRow } from '../community/research-commitment.ts';
import type { StudyResults } from './research-schema.ts';
import { EXPORT_COLUMNS } from './studies-export.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const DRAFT_POPULATION_STATEMENT =
	'DRAFT, not for publication: open, self-selected online sample; results describe the respondents, not the population.';

export const DEFAULT_STUDY = 'dt-research-001';
export const DEFAULT_IN = join(ROOT, 'research', 'portal', 'study-001', 'data', 'responses.csv');
export const DEFAULT_OUT_DIR = join(ROOT, 'data', 'studies');
export const DRAFT_WEIGHTING = 'unweighted-draft';

// ---------------------------------------------------------------------------
// CSV reading
// ---------------------------------------------------------------------------

export interface ParsedResponse {
	receipt: string;
	study_id: string;
	instrument_id: string;
	instrument_version: string;
	instrument_hash: string;
	locale: string;
	channel: string;
	consent_version: string;
	started_at: number;
	submitted_at: number;
	completion_ms: number;
	block_order: string | null;
	scale_direction: string | null;
	answers: Record<string, unknown>;
	maxdiff: Array<{ set: string; most: string; least: string }> | null;
	/** null, 'replaced', 'update' or 'same-device' (research-schema.sql). */
	revision: string | null;
	created_at: number;
}

const NUMERIC_COLUMNS = ['started_at', 'submitted_at', 'completion_ms', 'created_at'] as const;

/** One CSV table, quoted fields and embedded newlines included (RFC 4180). */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let index = 0;
	while (index < text.length) {
		const char = text[index];
		if (quoted) {
			if (char === '"') {
				if (text[index + 1] === '"') {
					field += '"';
					index += 2;
					continue;
				}
				quoted = false;
				index++;
				continue;
			}
			field += char;
			index++;
			continue;
		}
		if (char === '"' && field === '') {
			quoted = true;
			index++;
			continue;
		}
		if (char === ',') {
			row.push(field);
			field = '';
			index++;
			continue;
		}
		if (char === '\r' && text[index + 1] === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			index += 2;
			continue;
		}
		if (char === '\n' || char === '\r') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			index++;
			continue;
		}
		field += char;
		index++;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** Parse the working CSV into typed rows, refusing anything malformed. */
export function parseResponses(csv: string): ParsedResponse[] {
	const table = parseCsv(csv);
	if (!table.length) throw new Error('the working CSV is empty');
	const header = table[0];
	const missing = EXPORT_COLUMNS.filter((column) => !header.includes(column));
	if (missing.length) throw new Error(`the working CSV is missing column(s): ${missing.join(', ')}`);
	const at = new Map(header.map((name, index) => [name, index]));

	return table
		.slice(1)
		.filter((cells) => cells.some((cell) => cell !== ''))
		.map((cells) => {
			const get = (column: string) => cells[at.get(column)!] ?? '';
			const receipt = get('receipt');
			if (!receipt) throw new Error('a CSV row has no receipt');
			const numbers: Record<string, number> = {};
			for (const column of NUMERIC_COLUMNS) {
				const value = Number(get(column));
				if (!Number.isFinite(value)) throw new Error(`row ${receipt}: ${column} is not a number`);
				numbers[column] = value;
			}
			let answers: unknown = null;
			let maxdiff: unknown = null;
			try {
				answers = get('answers') ? JSON.parse(get('answers')) : null;
				maxdiff = get('maxdiff') ? JSON.parse(get('maxdiff')) : null;
			} catch {
				throw new Error(`row ${receipt}: answers or maxdiff is not JSON`);
			}
			if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
				throw new Error(`row ${receipt}: answers is not a JSON object`);
			}
			return {
				receipt,
				study_id: get('study_id'),
				instrument_id: get('instrument_id'),
				instrument_version: get('instrument_version'),
				instrument_hash: get('instrument_hash'),
				locale: get('locale'),
				channel: get('channel'),
				consent_version: get('consent_version'),
				started_at: numbers.started_at,
				submitted_at: numbers.submitted_at,
				completion_ms: numbers.completion_ms,
				block_order: get('block_order') || null,
				scale_direction: get('scale_direction') || null,
				answers: answers as Record<string, unknown>,
				maxdiff: Array.isArray(maxdiff) ? maxdiff : null,
				revision: get('revision') || null,
				created_at: numbers.created_at
			};
		});
}

// ---------------------------------------------------------------------------
// Exclusions (protocol §8)
// ---------------------------------------------------------------------------

export const EXCLUSION_RULE_IDS = ['incomplete', 'straight-lining', 'speed', 'duplicates'] as const;
export type ExclusionRuleId = (typeof EXCLUSION_RULE_IDS)[number];

export const INCOMPLETE_SHARE = 0.8;
export const SPEED_SHARE = 0.4;
export const DUPLICATE_SIMILARITY = 0.95;
export const STRAIGHT_LINE_MIN_ITEMS = 5;

export interface ExclusionOutcome {
	rules: Record<ExclusionRuleId, number>;
	byChannel: Record<string, number>;
	rowsExcluded: number;
	perRow: Map<string, ExclusionRuleId[]>;
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
	return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function tally(values: string[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return sortedRecord(counts);
}

function isAnswered(answers: Record<string, unknown>, key: string): boolean {
	return answers[key] !== undefined && answers[key] !== null;
}

function answerNumber(answers: Record<string, unknown>, itemId: string): number | null {
	const value = answers[itemId];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Same key set, and at least 95% of the values equal. `null` equals `null`:
 * an explicit skip in the same place on both rows is the same answer.
 */
function nearIdentical(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	const bSet = new Set(bKeys);
	if (!aKeys.every((key) => bSet.has(key))) return false;
	if (aKeys.length === 0) return true;
	let same = 0;
	for (const key of aKeys) {
		if (JSON.stringify(a[key]) === JSON.stringify(b[key])) same++;
	}
	return same / aKeys.length >= DUPLICATE_SIMILARITY;
}

/**
 * Every rule, for every row, independently. Duplicates compare against all
 * earlier rows in CSV order, which the export fixed as submitted_at, receipt.
 */
export function evaluateExclusions(rows: ParsedResponse[], instrument: RuntimeInstrument): ExclusionOutcome {
	// A study that registers its own exclusion rules in its scoring block (the
	// police index) is excluded by exactly those, through the same engine the
	// live results use, so the offline figures and the live ones agree. The
	// rules below are study 001's protocol §8.
	if (instrument.scoring?.exclusions) return scoringExclusions(rows, instrument);

	const displayed = instrument.items.filter((item) => item.displayed && item.response !== 'consent');
	const essentiality = instrument.items.filter((item) => item.response === 'scale_essential');
	// Each presence rating is a question of its own: it counts beside the item
	// questions, never in place of one.
	const presenceKeys = gapItems(instrument).map((item) => gapAnswerKey(item.id));
	const questionCount = displayed.length + presenceKeys.length;
	const speedFloor = instrument.estimatedMinutes * 60_000 * SPEED_SHARE;

	const rules: Record<ExclusionRuleId, number> = {
		incomplete: 0,
		'straight-lining': 0,
		speed: 0,
		duplicates: 0
	};
	const perRow = new Map<string, ExclusionRuleId[]>();

	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		const tripped: ExclusionRuleId[] = [];

		const answered =
			displayed.filter((item) => isAnswered(row.answers, item.id)).length +
			presenceKeys.filter((key) => isAnswered(row.answers, key)).length;
		if (answered < questionCount * INCOMPLETE_SHARE) tripped.push('incomplete');

		const scores = essentiality
			.map((item) => answerNumber(row.answers, item.id))
			.filter((value): value is number => value !== null);
		if (scores.length >= STRAIGHT_LINE_MIN_ITEMS && new Set(scores).size === 1) {
			tripped.push('straight-lining');
		}

		if (row.completion_ms < speedFloor) tripped.push('speed');

		if (rows.slice(0, index).some((earlier) => nearIdentical(earlier.answers, row.answers))) {
			tripped.push('duplicates');
		}

		for (const rule of tripped) rules[rule]++;
		perRow.set(row.receipt, tripped);
	}

	const byChannel: Record<string, number> = {};
	let rowsExcluded = 0;
	for (const row of rows) {
		if ((perRow.get(row.receipt) ?? []).length === 0) continue;
		rowsExcluded++;
		byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
	}

	return { rules, byChannel: sortedRecord(byChannel), rowsExcluded, perRow };
}

function scoringExclusions(rows: ParsedResponse[], instrument: RuntimeInstrument): ExclusionOutcome {
	const spec = instrument.scoring!;
	const rules: Record<ExclusionRuleId, number> = { incomplete: 0, 'straight-lining': 0, speed: 0, duplicates: 0 };
	const perRow = new Map<string, ExclusionRuleId[]>();
	const byChannel: Record<string, number> = {};
	let rowsExcluded = 0;
	for (const row of rows) {
		const one = applyExclusions(spec, [{ answers: row.answers, completionMs: row.completion_ms }]);
		const tripped = Object.entries(one.exclusions.rules)
			.filter(([, n]) => n > 0)
			.map(([rule]) => rule as ExclusionRuleId);
		for (const rule of tripped) rules[rule]++;
		perRow.set(row.receipt, tripped);
		if (tripped.length) {
			rowsExcluded++;
			byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
		}
	}
	return { rules, byChannel: sortedRecord(byChannel), rowsExcluded, perRow };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface AggregateOptions {
	/** The registry's population_statement, or null while it is unset. */
	populationStatement: string | null;
	/** Injected so the tests can pin the one thing that reads a clock. */
	generatedAt: string;
}

export interface AggregateOutcome {
	results: StudyResults;
	included: ParsedResponse[];
	/** Receipt to the rules it tripped, for the stdout report and the tests. */
	perRow: Map<string, ExclusionRuleId[]>;
	/** Rows set aside because they answered another questionnaire version. */
	otherVersions: number;
}

function round(value: number, digits = 2): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function moduleItems(instrument: RuntimeInstrument, moduleId: string): RuntimeItem[] {
	const byId = new Map(instrument.items.map((item) => [item.id, item]));
	const module = instrument.modules.find((entry) => entry.id === moduleId);
	if (!module) return instrument.items.filter((item) => item.module === moduleId);
	return module.items.map((id) => byId.get(id)).filter((item): item is RuntimeItem => Boolean(item));
}

function essentialityItems(instrument: RuntimeInstrument): RuntimeItem[] {
	return [
		...moduleItems(instrument, 'essentiality_core'),
		...moduleItems(instrument, 'essentiality_extended')
	];
}

function gapItems(instrument: RuntimeInstrument): RuntimeItem[] {
	const byId = new Map(instrument.items.map((item) => [item.id, item]));
	return (instrument.gap?.items ?? [])
		.map((id) => byId.get(id))
		.filter((item): item is RuntimeItem => Boolean(item));
}

function supportItems(instrument: RuntimeInstrument): RuntimeItem[] {
	return moduleItems(instrument, 'support_regime');
}

function resolvePopulation(declared: string | null | undefined): string {
	const text = (declared ?? '').trim();
	return text ? declared! : DRAFT_POPULATION_STATEMENT;
}

/** One published aggregate, with the qualifier attached (R2). */
function block(
	id: string,
	label: string,
	metric: string,
	n: number,
	values: Record<string, number>,
	population: string
) {
	return { id, label, metric, n, weighted: false, values, suppression: null, population_statement: population };
}

/**
 * Apply the exclusions, then aggregate the included rows. Pure: same input,
 * same output, with the clock passed in through `generatedAt`.
 */
export function aggregateResponses(
	rows: ParsedResponse[],
	instrument: RuntimeInstrument,
	options: AggregateOptions
): AggregateOutcome {
	// One questionnaire version per results document: the document is labelled
	// with this instrument's hash, and an answer to other wording is not an
	// answer to these questions. The export carries every version, so the rest
	// are set aside here and counted in the report.
	const otherVersions = rows.filter((row) => row.instrument_hash !== instrument.hash).length;
	rows = rows.filter((row) => row.instrument_hash === instrument.hash);
	if (!rows.length) {
		throw new Error(`no rows answered instrument ${instrument.hash.slice(0, 12)}; ${otherVersions} answered another version`);
	}
	const exclusions = evaluateExclusions(rows, instrument);
	const included = rows.filter((row) => (exclusions.perRow.get(row.receipt) ?? []).length === 0);
	if (!included.length) {
		throw new Error('no rows remain after exclusions; a results document needs a positive n');
	}

	const population = resolvePopulation(options.populationStatement);
	const blocks: ReturnType<typeof block>[] = [];

	// Essentiality: one block per item. Score percentages are over the people
	// who answered the item; percent_skipped is over every included row.
	for (const item of essentialityItems(instrument)) {
		const scores = included
			.map((row) => answerNumber(row.answers, item.id))
			.filter((value): value is number => value !== null);
		if (!scores.length) continue;
		const values: Record<string, number> = {
			mean: round(mean(scores)),
			percent_9_or_10: round((scores.filter((value) => value >= 9).length / scores.length) * 100),
			percent_skipped: round(((included.length - scores.length) / included.length) * 100)
		};
		// 0 is the explicit "against democracy" option, which only the
		// scale_essential wording carries.
		if (item.response === 'scale_essential') {
			values.percent_against = round((scores.filter((value) => value === 0).length / scores.length) * 100);
		}
		blocks.push(block(item.id, item.text.en ?? item.id, 'essentiality', scores.length, values, population));
	}

	// MaxDiff: one block per set, counts per item for most and least.
	if (instrument.maxdiff) {
		for (const set of instrument.maxdiff.sets) {
			const entries = included
				.map((row) => row.maxdiff?.find((entry) => entry && entry.set === set.id))
				.filter((entry): entry is { set: string; most: string; least: string } => Boolean(entry));
			if (!entries.length) continue;
			const values: Record<string, number> = {};
			for (const item of set.items) {
				values[`most:${item}`] = entries.filter((entry) => entry.most === item).length;
				values[`least:${item}`] = entries.filter((entry) => entry.least === item).length;
			}
			blocks.push(block(`maxdiff_${set.id}`, `MaxDiff set ${set.id}`, 'maxdiff', entries.length, values, population));
		}
	}

	// Gap presence: one block per item, mean over answerers. The presence
	// rating is stored under the block's own key, so it never stands in for the
	// item's essentiality rating read above.
	for (const item of gapItems(instrument)) {
		const scores = included
			.map((row) => answerNumber(row.answers, gapAnswerKey(item.id)))
			.filter((value): value is number => value !== null);
		if (!scores.length) continue;
		blocks.push(
			block(item.id, item.text.en ?? item.id, 'gap_presence', scores.length, { mean: round(mean(scores)) }, population)
		);
	}

	// Support and regime items: mean plus the full distribution over the item's
	// declared scale.
	for (const item of supportItems(instrument)) {
		const scores = included
			.map((row) => answerNumber(row.answers, item.id))
			.filter((value): value is number => value !== null);
		if (!scores.length) continue;
		const domain = item.response === 'agree_4' ? [1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const values: Record<string, number> = { mean: round(mean(scores)) };
		for (const value of domain) values[`count_${value}`] = scores.filter((score) => score === value).length;
		blocks.push(block(item.id, item.text.en ?? item.id, 'support', scores.length, values, population));
	}

	// Participation and completion, over every included row.
	blocks.push(block('count_by_locale', 'Responses by locale', 'count', included.length, tally(included.map((row) => row.locale)), population));
	blocks.push(block('count_by_channel', 'Responses by channel', 'count', included.length, tally(included.map((row) => row.channel)), population));
	const arms = tally(included.map((row) => `block_order:${row.block_order ?? 'none'}`));
	for (const [key, count] of Object.entries(tally(included.map((row) => `scale_direction:${row.scale_direction ?? 'none'}`)))) {
		arms[key] = count;
	}
	blocks.push(block('count_by_arm', 'Responses by experiment arm', 'count', included.length, sortedRecord(arms), population));
	blocks.push(
		block('completion_median', 'Completion time, median', 'median', included.length, {
			median_ms: median(included.map((row) => row.completion_ms))
		}, population)
	);

	const results: StudyResults = {
		study_id: instrument.study,
		instrument: { id: instrument.id, version: instrument.version, hash: instrument.hash },
		n: included.length,
		weighting: DRAFT_WEIGHTING,
		population_statement: population,
		generated_at: options.generatedAt,
		blocks,
		exclusions: {
			rows_excluded: exclusions.rowsExcluded,
			rules: { ...exclusions.rules },
			by_channel: exclusions.byChannel
		}
	};
	return { results, included, perRow: exclusions.perRow, otherVersions };
}

/** Parse the working CSV and aggregate it. */
export function aggregateCsv(csv: string, instrument: RuntimeInstrument, options: AggregateOptions): AggregateOutcome {
	return aggregateResponses(parseResponses(csv), instrument, options);
}

/** The results document as data YAML: CRLF, unlimited line width, stable order. */
export function resultsToYaml(results: StudyResults): string {
	return stringifyYaml(results, { lineWidth: 0 }).replace(/\r?\n/g, '\r\n');
}

// ---------------------------------------------------------------------------
// Scored studies (the police index)
//
// A study whose instrument carries a scoring block is released as exactly what
// the live endpoint publishes, recomputed from the export alone: the same
// exclusions, aggregates, monthly series and publication floors, from the same
// engine (community/research-scoring.ts). Link codes never leave: the link
// check publishes shares, and nothing here tallies channels. Each month also
// gets its released-row fingerprint, to be checked against its closed ledger
// entry (scripts/ledger-verify.ts).
// ---------------------------------------------------------------------------

export interface ScoredRelease {
	study: string;
	instrument: { id: string; version: string; hash: string };
	generated_at: string;
	/** Stored rows that answered this instrument, before exclusions. */
	received: number;
	/** Rows set aside because they answered another questionnaire version. */
	other_versions: number;
	exclusions: { rows_excluded: number; rules: Record<string, number> };
	published: ReturnType<typeof applyPublicationFloor>;
	/** Per month: the rows it holds and their fingerprint in released form. */
	fingerprints: Array<{ period: string; stored: number; digest: string }>;
}

export async function aggregateScored(
	rows: ParsedResponse[],
	instrument: RuntimeInstrument,
	options: { studyId: string; now: number; generatedAt: string; firstPeriod?: string }
): Promise<ScoredRelease> {
	const spec = instrument.scoring;
	if (!spec) throw new Error('this instrument has no scoring block; use the study 001 path');
	// Another study's export is refused, not released under this study's name.
	const foreign = rows.filter((row) => row.study_id !== options.studyId).length;
	if (foreign) throw new Error(`${foreign} row(s) belong to another study; export ${options.studyId} on its own`);
	const otherVersions = rows.filter((row) => row.instrument_hash !== instrument.hash).length;
	const own = rows.filter((row) => row.instrument_hash === instrument.hash);
	if (!own.length) {
		throw new Error(`no rows answered instrument ${instrument.hash.slice(0, 12)}; ${otherVersions} answered another version`);
	}
	const scoringRows = own.map((row) => ({
		answers: row.answers,
		completionMs: row.completion_ms,
		submittedAt: row.submitted_at,
		channel: row.channel,
		revision: row.revision
	}));
	const conditions = Object.fromEntries(
		instrument.items.filter((item) => item.showIf !== undefined).map((item) => [item.id, item.showIf!])
	);
	// The live endpoint's seed and resamples, so the intervals match it exactly.
	const aggregate = { seed: 20261007, resamples: 1000, conditions };
	const { kept, exclusions } = applyExclusions(spec, scoringRows);
	const published = applyPublicationFloor(
		spec,
		scoreAggregate(spec, kept, aggregate),
		aggregateSeries(spec, kept, { ...aggregate, now: options.now, firstPeriod: options.firstPeriod })
	);
	// Fingerprints are over every stored row of a month, whatever the version,
	// exactly as the ledger computes them.
	const offset = spec.series?.utc_offset_minutes ?? 60;
	const byPeriod = new Map<string, ReturnType<typeof releaseRow>[]>();
	for (const row of rows) {
		const period = periodOf(row.submitted_at, offset);
		const list = byPeriod.get(period) ?? [];
		list.push(
			releaseRow(spec, {
				period,
				instrument_hash: row.instrument_hash,
				locale: row.locale,
				revision: row.revision,
				completion_ms: row.completion_ms,
				answers: row.answers
			})
		);
		byPeriod.set(period, list);
	}
	const fingerprints = [];
	for (const period of [...byPeriod.keys()].sort()) {
		const list = byPeriod.get(period)!;
		fingerprints.push({ period, stored: list.length, digest: await monthDigest(list) });
	}
	return {
		study: options.studyId,
		instrument: { id: instrument.id, version: instrument.version, hash: instrument.hash },
		generated_at: options.generatedAt,
		received: own.length,
		other_versions: otherVersions,
		exclusions,
		published,
		fingerprints
	};
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface RegistryStudy {
	id: string;
	fielding_window?: { start?: string | null } | null;
	population_statement?: string | null;
	instrument_versions?: Array<{ id: string; version: string }>;
}

function arg(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

function report(studyId: string, outcome: AggregateOutcome, outPath: string) {
	const { results } = outcome;
	const excluded = results.exclusions!;
	const total = results.n + excluded.rows_excluded;
	console.log(`\n  studies aggregate: ${studyId}`);
	console.log(`  rows: ${total} read, ${excluded.rows_excluded} excluded, ${results.n} included`);
	if (outcome.otherVersions) {
		console.log(`  ${outcome.otherVersions} row(s) answered another questionnaire version and were set aside`);
	}
	console.log('  exclusions by rule (a row may trip more than one):');
	for (const rule of EXCLUSION_RULE_IDS) {
		console.log(`    ${rule.padEnd(16)} ${excluded.rules[rule] ?? 0}`);
	}
	console.log('  exclusions by channel:');
	for (const [channel, count] of Object.entries(excluded.by_channel)) {
		console.log(`    ${channel.padEnd(16)} ${count}`);
	}
	console.log(`  wrote ${outPath} (${results.blocks.length} blocks, generated ${results.generated_at})\n`);
}

async function main() {
	const args = process.argv.slice(2);
	const studyId = arg(args, '--study') ?? DEFAULT_STUDY;
	const inPath = arg(args, '--in') ?? DEFAULT_IN;
	const outPath = arg(args, '--out') ?? join(DEFAULT_OUT_DIR, studyId, 'results.yaml');
	const now = arg(args, '--now') ?? new Date().toISOString();

	const registryPath = join(ROOT, 'src', 'generated', 'studies.json');
	if (!existsSync(registryPath)) {
		console.error(`  aggregate failed: no registry at ${registryPath}: run npm run data first`);
		process.exit(1);
	}
	if (!existsSync(inPath)) {
		console.error(`  aggregate failed: no working CSV at ${inPath}: run studies:export first`);
		process.exit(1);
	}
	const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as StudiesRegistry;
	const study = registry.studies.find((entry) => (entry as RegistryStudy).id === studyId) as
		| RegistryStudy
		| undefined;
	if (!study) {
		console.error(`  aggregate failed: study ${studyId} is not in the registry`);
		process.exit(1);
	}
	const version = study.instrument_versions?.[0];
	const instrument = version ? registry.instruments[`${version.id}@${version.version}`] : undefined;
	if (!instrument) {
		console.error(`  aggregate failed: no compiled instrument for study ${studyId}`);
		process.exit(1);
	}

	if (instrument.scoring) {
		const scoredOut = arg(args, '--out') ?? join(DEFAULT_OUT_DIR, studyId, 'published.json');
		try {
			const release = await aggregateScored(parseResponses(readFileSync(inPath, 'utf8')), instrument, {
				studyId,
				now: Date.parse(now),
				generatedAt: now,
				firstPeriod: study.fielding_window?.start ? study.fielding_window.start.slice(0, 7) : undefined
			});
			mkdirSync(dirname(scoredOut), { recursive: true });
			writeFileSync(scoredOut, JSON.stringify(release, null, '\t') + '\n', 'utf8');
			console.log(`\n  studies aggregate (scored): ${studyId}`);
			console.log(`  rows: ${release.received} for this instrument, ${release.exclusions.rows_excluded} excluded, ${release.other_versions} from other versions set aside`);
			for (const f of release.fingerprints) console.log(`  ${f.period}  ${f.stored} rows  ${f.digest}`);
			console.log(`  wrote ${scoredOut}; check each closed month with scripts/ledger-verify.ts\n`);
		} catch (e) {
			console.error(`  aggregate failed: ${(e as Error).message}`);
			process.exit(1);
		}
		return;
	}

	try {
		const outcome = aggregateCsv(readFileSync(inPath, 'utf8'), instrument, {
			populationStatement: study.population_statement ?? null,
			generatedAt: now
		});
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, resultsToYaml(outcome.results), 'utf8');
		report(studyId, outcome, outPath);
	} catch (e) {
		console.error(`  aggregate failed: ${(e as Error).message}`);
		process.exit(1);
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main();
}
