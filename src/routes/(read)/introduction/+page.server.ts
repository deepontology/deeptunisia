import type { PageServerLoad } from './$types';
import stats from '$data/stats.json';
import dataset from '$data/dataset.json';
import studies from '$data/studies.json';

/**
 * The introduction is prerendered, so this runs once per build and only the
 * figures below reach the page. Every number the page prints comes from the
 * build that produced the site, so the page cannot drift from the record it
 * describes; nothing here is typed by hand.
 */
export const prerender = true;

type Stats = Record<string, string>;
type Hypothesis = { id: string; support?: string };
type Study = { id: string; status: string; fielding_window?: { start?: string | null } | null };

const n = (v: string | undefined) => Number.parseInt(v ?? '0', 10) || 0;

/** Supports a hypothesis can carry that mean it is not holding up. */
const FARES_BADLY = new Set(['insufficient', 'contradicted', 'weak']);

export const load: PageServerLoad = () => {
	const s = stats as Stats;
	const hypotheses = ((dataset as { hypotheses?: Hypothesis[] }).hypotheses ?? []) as Hypothesis[];
	const eras = ((dataset as { eras?: unknown[] }).eras ?? []).length;
	const failing = hypotheses.filter((h) => FARES_BADLY.has(h.support ?? ''));
	const psi = ((studies as { studies?: Study[] }).studies ?? []).find((x) => x.id === 'dt-research-002');

	return {
		people: n(s.people),
		institutions: n(s.institutions),
		positions: n(s.positions),
		relationships: n(s.relationships),
		sources: n(s.sources),
		events: n(s.events),
		questions: n(s.questions),
		hypotheses: hypotheses.length,
		hypothesesFailing: failing.length,
		deepStateFails: failing.some((h) => h.id === 'h1-continuous-deep-state'),
		contradictions: n(s.contradictions),
		successionGaps: n(s.successionGaps),
		needsPrimarySource: n(s.needsPrimarySource),
		checkedByPerson: n(s.reviewedHuman),
		passedByAgent: n(s.reviewedAgent),
		unstated: n(s.reviewedUnstated),
		reviewable: n(s.reviewable),
		independent: n(s.independent),
		eras,
		floorYear: (s.floor ?? '').slice(0, 4),
		cutoffYear: (s.cutoff ?? '').slice(0, 4),
		datasetHash: s.datasetHash ?? '',
		basis: {
			documented: n(s.documented),
			reported: n(s.reported),
			inferred: n(s.inferred),
			unsubstantiated: n(s.unsubstantiated)
		},
		psiOpen: psi?.status === 'fielding',
		psiSince: psi?.fielding_window?.start ?? null
	};
};
