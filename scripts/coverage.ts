/**
 * Coverage by slice (Phase 10A).
 *
 * The ranking tables are read as if every institution, era, office and source
 * family carried the same evidence. They do not, and a slice whose "effective"
 * count is two records should say so rather than render as a league table.
 *
 * This module publishes one CSV with a row per slice and the counts that make a
 * slice's weight visible:
 *
 *   records           records in the slice (denominator)
 *   with_sources      records carrying at least one cited source
 *   reviewed          records carrying a human review note
 *   with_evidence     records carrying passage-level evidence (V29)
 *   origins_known     records whose independent-origin count is derived
 *   nonzero           records with passage-level support, i.e. evidence or a
 *                     derived origin count. This is the "effective nonzero
 *                     sample size": a slice with two of them is sparse
 *                     whatever its nominal record count.
 *   distinct_sources  distinct source ids backing the slice
 *   sparse            1 when nonzero is under the published threshold
 *
 * Dimensions overlap by design where the material does: a record can sit in
 * more than one era and back more than one institution, and the source-family
 * and language dimensions count sources rather than claims. The CSV is a
 * coverage table, not a partition.
 */
import { normalisePublisher } from './origins.ts';

export const SPARSE_THRESHOLD = 3;

export const COVERAGE_DIMENSIONS = [
	'institution',
	'era',
	'source_family',
	'language',
	'office'
] as const;
export type CoverageDimension = (typeof COVERAGE_DIMENSIONS)[number];

interface Interval {
	startEarliest: number;
	endEarliest: number | null;
	endLatest: number | null;
}

interface ClaimRecord {
	interval?: Interval;
	sources?: string[];
	review?: unknown;
	evidence?: unknown[];
	origins?: number;
}

export interface CoverageDataset {
	meta: { cutoff: number };
	institutions: { id: string }[];
	roles: { id: string; institution: string }[];
	positions: ({ id: string; role: string } & ClaimRecord)[];
	relationships: ({ id: string; from: string; to: string } & ClaimRecord)[];
	events: ({ id: string } & ClaimRecord)[];
	eras: ({ id: string } & ClaimRecord)[];
	sources: { id: string; publisher: string; lang?: string; tier: number }[];
}

export interface CoverageRow {
	dimension: CoverageDimension;
	value: string;
	records: number;
	withSources: number;
	reviewed: number;
	withEvidence: number;
	originsKnown: number;
	nonzero: number;
	distinctSources: number;
	sparse: boolean;
}

interface Accumulator {
	records: number;
	withSources: number;
	reviewed: number;
	withEvidence: number;
	originsKnown: number;
	nonzero: number;
	sources: Set<string>;
}

function emptyAcc(): Accumulator {
	return { records: 0, withSources: 0, reviewed: 0, withEvidence: 0, originsKnown: 0, nonzero: 0, sources: new Set() };
}

function at(accs: Map<string, Accumulator>, key: string): Accumulator {
	const existing = accs.get(key);
	if (existing) return existing;
	const fresh = emptyAcc();
	accs.set(key, fresh);
	return fresh;
}

function addRecord(acc: Accumulator, rec: ClaimRecord): void {
	acc.records++;
	if ((rec.sources?.length ?? 0) > 0) acc.withSources++;
	if (rec.review !== undefined && rec.review !== null) acc.reviewed++;
	const hasEvidence = (rec.evidence?.length ?? 0) > 0;
	const hasOrigins = rec.origins !== undefined;
	if (hasEvidence) acc.withEvidence++;
	if (hasOrigins) acc.originsKnown++;
	if (hasEvidence || hasOrigins) acc.nonzero++;
	for (const s of rec.sources ?? []) acc.sources.add(s);
}

function overlap(a: Interval | undefined, era: Interval | undefined, cutoff: number): boolean {
	if (!a || !era) return false;
	return a.startEarliest <= era.endLatest! && (a.endLatest ?? cutoff) >= era.startEarliest;
}

function rowsFrom(accs: Map<string, Accumulator>, dimension: CoverageDimension): CoverageRow[] {
	return [...accs.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([value, acc]) => ({
			dimension,
			value,
			records: acc.records,
			withSources: acc.withSources,
			reviewed: acc.reviewed,
			withEvidence: acc.withEvidence,
			originsKnown: acc.originsKnown,
			nonzero: acc.nonzero,
			distinctSources: acc.sources.size,
			sparse: acc.nonzero < SPARSE_THRESHOLD
		}));
}

export function buildCoverage(ds: CoverageDataset): CoverageRow[] {
	const rows: CoverageRow[] = [];
	const cutoff = ds.meta.cutoff;
	const roleInstitution = new Map(ds.roles.map((r) => [r.id, r.institution]));

	// institution: positions in the institution's roles + relationships touching it.
	{
		const accs = new Map<string, Accumulator>();
		const institutionIds = new Set(ds.institutions.map((i) => i.id));
		for (const pos of ds.positions) {
			const inst = roleInstitution.get(pos.role);
			if (inst) addRecord(at(accs, inst), pos);
		}
		for (const rel of ds.relationships) {
			if (institutionIds.has(rel.from)) addRecord(at(accs, rel.from), rel);
			if (institutionIds.has(rel.to)) addRecord(at(accs, rel.to), rel);
		}
		rows.push(...rowsFrom(accs, 'institution'));
	}

	// era: claim records whose interval overlaps the era.
	{
		const accs = new Map<string, Accumulator>();
		for (const era of ds.eras) {
			const acc = emptyAcc();
			for (const rec of [...ds.positions, ...ds.relationships, ...ds.events]) {
				if (overlap(rec.interval, era.interval, cutoff)) addRecord(acc, rec);
			}
			accs.set(era.id, acc);
		}
		rows.push(...rowsFrom(accs, 'era'));
	}

	// source_family and language: source rows; nonzero here is the cited count.
	{
		const byFamily = new Map<string, { sources: typeof ds.sources; cited: Set<string> }>();
		const byLang = new Map<string, { sources: typeof ds.sources; cited: Set<string> }>();
		const cited = new Set<string>();
		for (const rec of [...ds.positions, ...ds.relationships, ...ds.events, ...ds.eras]) {
			for (const s of rec.sources ?? []) cited.add(s);
		}
		for (const source of ds.sources) {
			const key = normalisePublisher(source.publisher) || source.publisher;
			const bucket = byFamily.get(key) ?? { sources: [], cited: new Set() };
			bucket.sources.push(source);
			if (cited.has(source.id)) bucket.cited.add(source.id);
			byFamily.set(key, bucket);
			const lang = source.lang ?? 'en';
			const langBucket = byLang.get(lang) ?? { sources: [], cited: new Set() };
			langBucket.sources.push(source);
			if (cited.has(source.id)) langBucket.cited.add(source.id);
			byLang.set(lang, langBucket);
		}
		for (const [key, bucket] of byFamily) {
			rows.push({
				dimension: 'source_family',
				value: key,
				records: bucket.sources.length,
				withSources: bucket.cited.size,
				reviewed: 0,
				withEvidence: 0,
				originsKnown: 0,
				nonzero: bucket.cited.size,
				distinctSources: bucket.sources.length,
				sparse: bucket.cited.size < SPARSE_THRESHOLD
			});
		}
		for (const [lang, bucket] of byLang) {
			rows.push({
				dimension: 'language',
				value: lang,
				records: bucket.sources.length,
				withSources: bucket.cited.size,
				reviewed: 0,
				withEvidence: 0,
				originsKnown: 0,
				nonzero: bucket.cited.size,
				distinctSources: bucket.sources.length,
				sparse: bucket.cited.size < SPARSE_THRESHOLD
			});
		}
	}

	// office: one row per role.
	{
		const accs = new Map<string, Accumulator>();
		for (const pos of ds.positions) addRecord(at(accs, pos.role), pos);
		rows.push(...rowsFrom(accs, 'office'));
	}

	const rank: Record<CoverageDimension, number> = {
		institution: 0,
		era: 1,
		source_family: 2,
		language: 3,
		office: 4
	};
	return rows.sort((a, b) => rank[a.dimension] - rank[b.dimension] || a.value.localeCompare(b.value));
}

const CSV_COLUMNS = [
	'dimension',
	'value',
	'records',
	'with_sources',
	'reviewed',
	'with_evidence',
	'origins_known',
	'nonzero',
	'distinct_sources',
	'sparse'
] as const;

export function coverageCsv(rows: CoverageRow[]): string {
	const lines = [CSV_COLUMNS.join(',')];
	for (const row of rows) {
		lines.push(
			[
				row.dimension,
				row.value,
				row.records,
				row.withSources,
				row.reviewed,
				row.withEvidence,
				row.originsKnown,
				row.nonzero,
				row.distinctSources,
				row.sparse ? 1 : 0
			].join(',')
		);
	}
	return lines.join('\n') + '\n';
}

export function coverageMarkdown(rows: CoverageRow[]): string {
	const sparse = rows.filter((r) => r.sparse);
	const byDimension = COVERAGE_DIMENSIONS.map((d) => {
		const list = rows.filter((r) => r.dimension === d);
		return `- \`${d}\`: ${list.length} slice(s), ${list.filter((r) => r.sparse).length} sparse`;
	});
	return `# Coverage by slice

Generated by \`scripts/build-data.ts\` from the built graph. Do not edit by hand.

## Columns

- \`records\`: records in the slice. The denominator.
- \`with_sources\`: records carrying a cited source.
- \`reviewed\`: records carrying a human review note.
- \`with_evidence\`: records carrying passage-level evidence (V29).
- \`origins_known\`: records whose independent-origin count is derived.
- \`nonzero\`: the effective nonzero sample size: records with evidence or a
  derived origin count. A slice with fewer than ${SPARSE_THRESHOLD} of them is
  marked \`sparse\`, whatever its nominal record count.
- \`distinct_sources\`: distinct source ids backing the slice.
- \`sparse\`: 1 when \`nonzero\` is under the published threshold (${SPARSE_THRESHOLD}).

The dimensions overlap by design where the material does: a record can sit in
more than one era and back more than one institution, and the source-family and
language dimensions count sources rather than claims. This is a coverage table,
not a partition.

${byDimension.join('\n')}

${sparse.length} sparse slice(s) of ${rows.length}.
`;
}
