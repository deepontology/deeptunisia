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
 *     object exists — a maintainer or agent looked. `independently_checked`
 *     means a record in `data/verifications.yaml` exists, which is a second
 *     human, blinded to the project's own grade, applying the study rubric.
 *     Independence is therefore never inferred from a reviewer's name or from
 *     an editorial note: the count comes from the separate record type or it
 *     stays zero. Support, refutation and resolution stay at zero because
 *     `review.outcome` is deliberately not in the schema until governance
 *     defines it (Phase 1C); the verification records carry their own outcome
 *     enum instead.
 *   * THE THREE POPULATIONS ARE NEVER SUMMED. Editorial review notes, the
 *     editorial queue and independent verifications answer different questions,
 *     each with its own denominator. The markdown says so, and the CSV keeps
 *     them in separate columns.
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
	/** Present on graph records; used to attach verification records to a cell. */
	id?: string;
	kind: ReviewKind;
	basis?: string;
	attributed_to?: string;
	review?: unknown;
	disputes?: unknown[] | null;
}

/** An independent verification record — see VerificationSchema in scripts/schema.ts. */
export interface VerificationInput {
	/** `kind:id`, pointing at the record that was checked. */
	claim: string;
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
	/** Independent verifications that resolved to a graph claim. Separate population. */
	independentlyChecked: number;
	/** Every independent verification record, resolved or not. Its own denominator. */
	verifications: number;
	/** `kind:id` values pointing at no record — reported, never dropped silently. */
	unmatchedVerifications: string[];
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

export function summariseReview(rows: ReviewInput[], verifications: VerificationInput[] = []): ReviewSummary {
	const flags = emptyCounts(REVIEW_FLAGS);
	const byKind = emptyCounts(REVIEW_KINDS);
	const byBasis: Record<string, ReviewCount> = {};
	const coverageMap = new Map<string, CoverageRow>();
	// `kind:id` → the coverage cell the record sits in, so an independent
	// verification increments a count instead of being a flag someone can set.
	const cellByClaim = new Map<string, CoverageRow>();
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
		if (row.id) cellByClaim.set(`${row.kind}:${row.id}`, cell);
	}

	/*
	 * Independent verification is counted from its own records, never from the
	 * editorial `review` object: an editorial note can never raise this number,
	 * because the two populations live in different files with different
	 * schemas. A verification pointing at nothing is reported rather than
	 * discarded — a count that quietly skips unresolvable rows would flatter
	 * itself.
	 */
	let independentlyChecked = 0;
	const unmatchedVerifications: string[] = [];
	for (const v of verifications) {
		const cell = cellByClaim.get(v.claim);
		if (!cell) {
			unmatchedVerifications.push(v.claim);
			continue;
		}
		cell.independentlyChecked++;
		independentlyChecked++;
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

	return {
		reviewed,
		reviewable: rows.length,
		independentlyChecked,
		verifications: verifications.length,
		unmatchedVerifications,
		flags,
		byKind,
		byBasis,
		coverage
	};
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
- \`independently_checked\`: records with an **independent verification record**
  of their own — \`data/verifications.yaml\`, a second human blinded to the
  project's grade, applying the study rubric. **Zero everywhere today**: that
  file holds ${summary.verifications} record(s), because the v0.2 study has not run.
  An editorial note cannot raise this number, which is why the record type is
  separate.
- \`supported\`, \`refuted\`, \`unresolved\`: review outcomes. **Zero everywhere
  today** for the same reason: \`review.outcome\` is deliberately not in the
  schema until governance defines it (Phase 1C).
- \`disputed\`: records carrying at least one recorded source disagreement. This
  is a graph fact, not a review outcome.

## Three populations, never summed

| Population | Where it lives | Denominator |
|---|---|---|
| editorial review notes | a \`review\` object on a record | ${summary.reviewed} of ${summary.reviewable} |
| the editorial queue | \`static/editorial-queue.json\` | its own count, never derived from the two above |
| independent verifications | \`data/verifications.yaml\` | ${summary.independentlyChecked} of ${summary.verifications} |

They answer different questions and are never added together, multiplied or
substituted for one another.

## Flags overlap

The risk flags are not a partition: a record carries every flag true of it, so
the flag totals sum to more than the record count. An inferred claim that names
its source is both \`inferred\` and \`attributed\`. Headline: ${summary.reviewed} of
${summary.reviewable} records carry a review note.

${flagLines.join('\n')}
`;
}
