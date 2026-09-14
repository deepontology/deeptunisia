/**
 * Human-review coverage (Phase 8).
 *
 * The original aggregation published a first-match partition over four kinds, so
 * an inferred record that named its source was counted under `attributed` and
 * never under `inferred` — the published `inferred` bucket read 0/0 while the
 * graph held 32 inferred claims — and the headline denominator ignored people,
 * institutions, agreements and every newer claim kind.
 *
 * This module replaces that with three separate statements, none of which can be
 * read as another:
 *
 *   * FLAGS OVERLAP. A record carries every flag that is true of it
 *     (`unsubstantiated`, `attributed`, `inferred`, `reported`, `documented`),
 *     so the flag totals sum to more than the record count. That is the point:
 *     a reviewer must be able to see that an inferred claim also names a source.
 *   * EVERY CLAIM KIND GETS A DENOMINATOR. Any kind whose schema carries a
 *     `review` field is counted, not only the three headline kinds.
 *   * `examined` IS NOT `independently_checked`. `examined` means a review
 *     object exists. Independence, support, refutation and resolution are not
 *     expressed by the schema yet, so they are reported as zero rather than
 *     inferred from a reviewer's name — a zero here means "not recorded", not
 *     "not done", and the coverage note says so.
 */

export const REVIEW_KINDS = [
	'institution',
	'person',
	'position',
	'relationship',
	'event',
	'agreement',
	'world-claim',
	'company',
	'contract',
	'licence',
	'declaration',
	'education',
	'place'
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** Most damaging first. A record carries every flag true of it. */
export const REVIEW_FLAGS = [
	'unsubstantiated',
	'attributed',
	'inferred',
	'reported',
	'documented'
] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

/** Basis order used in the coverage rows and the CSV. */
export const REVIEW_BASIS = ['documented', 'reported', 'inferred', 'unsubstantiated'] as const;

export interface ReviewInput {
	kind: ReviewKind;
	basis?: string;
	attributed_to?: string;
	review?: unknown;
	disputes?: unknown[] | null;
}

export interface ReviewCount {
	reviewed: number;
	total: number;
}

export interface CoverageRow {
	kind: ReviewKind;
	basis: string;
	total: number;
	examined: number;
	independentlyChecked: number;
	supported: number;
	refuted: number;
	disputed: number;
	unresolved: number;
}

export interface ReviewSummary {
	reviewed: number;
	reviewable: number;
	flags: Record<ReviewFlag, ReviewCount>;
	byKind: Record<ReviewKind, ReviewCount>;
	byBasis: Record<string, ReviewCount>;
	coverage: CoverageRow[];
}

/**
 * Every flag true of one record, most damaging first. `unsubstantiated` is a
 * basis; `attributed` is orthogonal (a record of any basis may name its
 * claimant), which is exactly why the two belong in the same list and not in a
 * first-match chain.
 */
export function reviewFlagsOf(r: { basis?: string; attributed_to?: string }): ReviewFlag[] {
	const out: ReviewFlag[] = [];
	if (r.basis === 'unsubstantiated') out.push('unsubstantiated');
	if (r.attributed_to) out.push('attributed');
	if (r.basis === 'inferred') out.push('inferred');
	if (r.basis === 'reported') out.push('reported');
	if (r.basis === 'documented') out.push('documented');
	return out;
}

/**
 * Single ordering key for the editorial queue: the most damaging flag true of
 * the record. The published coverage still uses every flag; this only decides
 * which record a reviewer sees first.
 */
export function reviewRiskOf(r: { basis?: string; attributed_to?: string }): ReviewFlag {
	return reviewFlagsOf(r)[0] ?? 'documented';
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, ReviewCount> {
	return Object.fromEntries(keys.map((k) => [k, { reviewed: 0, total: 0 }])) as Record<K, ReviewCount>;
}

export function summariseReview(rows: ReviewInput[]): ReviewSummary {
	const flags = emptyCounts(REVIEW_FLAGS);
	const byKind = emptyCounts(REVIEW_KINDS);
	const byBasis: Record<string, ReviewCount> = {};
	const coverageMap = new Map<string, CoverageRow>();
	let reviewed = 0;

	for (const row of rows) {
		const isReviewed = row.review !== undefined && row.review !== null;
		if (isReviewed) reviewed++;
		const basis = row.basis ?? 'unknown';

		byKind[row.kind].total++;
		if (isReviewed) byKind[row.kind].reviewed++;
		byBasis[basis] ??= { reviewed: 0, total: 0 };
		byBasis[basis].total++;
		if (isReviewed) byBasis[basis].reviewed++;

		for (const flag of reviewFlagsOf(row)) {
			flags[flag].total++;
			if (isReviewed) flags[flag].reviewed++;
		}

		const key = `${row.kind}|${basis}`;
		const cell =
			coverageMap.get(key) ??
			({
				kind: row.kind,
				basis,
				total: 0,
				examined: 0,
				independentlyChecked: 0,
				supported: 0,
				refuted: 0,
				disputed: 0,
				unresolved: 0
			} satisfies CoverageRow);
		cell.total++;
		if (isReviewed) cell.examined++;
		if ((row.disputes?.length ?? 0) > 0) cell.disputed++;
		coverageMap.set(key, cell);
	}

	const basisRank = new Map<string, number>(REVIEW_BASIS.map((b, i) => [b, i]));
	const coverage = [...coverageMap.values()]
		.filter((c) => c.total > 0)
		.sort(
			(a, b) =>
				REVIEW_KINDS.indexOf(a.kind) - REVIEW_KINDS.indexOf(b.kind) ||
				(basisRank.get(a.basis) ?? 99) - (basisRank.get(b.basis) ?? 99) ||
				a.basis.localeCompare(b.basis)
		);

	return { reviewed, reviewable: rows.length, flags, byKind, byBasis, coverage };
}

const CSV_COLUMNS = [
	'kind',
	'basis',
	'total',
	'examined',
	'independently_checked',
	'supported',
	'refuted',
	'disputed',
	'unresolved'
] as const;

export function reviewCoverageCsv(summary: ReviewSummary): string {
	const lines = [CSV_COLUMNS.join(',')];
	for (const row of summary.coverage) {
		lines.push(
			[
				row.kind,
				row.basis,
				row.total,
				row.examined,
				row.independentlyChecked,
				row.supported,
				row.refuted,
				row.disputed,
				row.unresolved
			].join(',')
		);
	}
	return lines.join('\n') + '\n';
}

export function reviewCoverageMarkdown(summary: ReviewSummary): string {
	const flagLines = REVIEW_FLAGS.map(
		(f) => `- \`${f}\`: ${summary.flags[f].reviewed} of ${summary.flags[f].total} carry a review note`
	);
	return `# Review coverage

Generated by \`scripts/build-data.ts\` from \`data/*.yaml\`. Do not edit by hand.

## What the columns mean

- \`total\`: records of this kind and basis in the graph. The denominator.
- \`examined\`: records carrying a \`review\` object — someone looked at them.
- \`independently_checked\`: records whose review records that the reviewer was
  independent of the compilation. **Zero everywhere today**: the schema has no
  independence field, so the build reports what the data expresses and does not
  infer it from a reviewer's name. Zero means "not recorded", not "not done".
- \`supported\`, \`refuted\`, \`unresolved\`: review outcomes. **Zero everywhere
  today** for the same reason: \`review.outcome\` is deliberately not in the
  schema until governance defines it (Phase 1C).
- \`disputed\`: records carrying at least one recorded source disagreement. This
  is a graph fact, not a review outcome.

## Flags overlap

The risk flags are not a partition: a record carries every flag true of it, so
the flag totals sum to more than the record count. An inferred claim that names
its source is both \`inferred\` and \`attributed\`. Headline: ${summary.reviewed} of
${summary.reviewable} records carry a review note.

${flagLines.join('\n')}
`;
}
