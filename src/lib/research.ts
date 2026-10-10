/**
 * The compiled studies registry, at build time.
 *
 * `npm run data` compiles `data/studies/` into `src/generated/studies.json`.
 * This module is the site's read-only view of it. The survey form renders from
 * the same compiled instrument the API validates submissions against, so the
 * hash a respondent submits under is the hash this build shipped. The build
 * never reads the response database; that separation is asserted in
 * `scripts/test-studies.ts`.
 */
import raw from '../generated/studies.json';
import type { RuntimeInstrument, StudiesRegistry } from '../../community/research-contract.ts';

export type { RuntimeInstrument, RuntimeItem, StudiesRegistry } from '../../community/research-contract.ts';

/** The fields the research pages render. Structural, not the validator's. */
export interface StudyRecord {
	id: string;
	slug: string;
	title_en: string;
	title_fr: string | null;
	title_ar: string | null;
	status: string;
	/**
	 * Whether the server is taking responses for this study right now. It
	 * arrives with a live study read, and is absent from the build-time
	 * registry: the submission gate and the storage are the server's to know,
	 * and the declared status does not carry them.
	 */
	accepting?: boolean;
	design_type: string;
	population: string;
	population_statement: string | null;
	locales: string[];
	ethics_review: string | null;
	data_protection_review: string | null;
	preregistration: string | null;
	instrument_versions: Array<{
		id: string;
		version: string;
		hash: string | null;
		source: string;
		frozen: boolean;
	}>;
	fielding_window: { start: string; end: string } | null;
	target_n: number | null;
	realized_n: number | null;
	weighting: string | null;
	data_license: string;
}

const registry = raw as unknown as StudiesRegistry;

export const studies: StudyRecord[] = (registry.studies ?? []) as StudyRecord[];

export const instruments: Record<string, RuntimeInstrument> = registry.instruments ?? {};

export function studyBySlug(slug: string): StudyRecord | undefined {
	return studies.find((s) => s.slug === slug);
}

/** The first declared instrument version, compiled. A study has one while in flight. */
export function instrumentFor(study: StudyRecord): RuntimeInstrument | undefined {
	const version = study.instrument_versions[0];
	if (!version) return undefined;
	return instruments[`${version.id}@${version.version}`];
}

/** Trilingual study title, falling back to the English source. */
export function titleOf(study: StudyRecord, locale: string): string {
	if (locale === 'fr') return study.title_fr ?? study.title_en;
	if (locale === 'ar') return study.title_ar ?? study.title_en;
	return study.title_en;
}
