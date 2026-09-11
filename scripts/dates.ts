/**
 * scripts/dates.ts — DeepTunisia's binding to the DeepEpisteme time module.
 *
 * The interval resolver and the activity predicates are owned by the
 * DeepEpisteme engine (pinned in package.json). This file used to carry its own
 * copy of both; the copies drifted, and a duplicated predicate is a predicate
 * with two answers. The bodies now live in `deepepisteme/time` and are
 * re-exported here, with the jurisdiction's parameters applied through
 * configureTime() before any date is parsed.
 *
 * Token semantics — including the certainty horizon (`lastObserved`), the
 * month-only observation rule and the `ongoing` confirmation window — are
 * documented at the top of the engine's time module and covered by the engine's
 * generated property tests plus scripts/test-engine-conformance.ts, which fails
 * DeepTunisia CI on a bad engine bump.
 */
import {
	configureTime as engineConfigureTime,
	resolveInterval,
	certainlyActive,
	possiblyActive,
	durationYears,
	parseDateEdge,
	applyOngoingObservation,
	ONGOING_CONFIRMATION_DAYS,
	getCutoff,
	getFloor,
	getBeforeWindowYears,
	getApproxSlackDays,
	type ResolvedInterval,
	type Precision,
	type IntervalStatus
} from 'deepepisteme/time';

export {
	resolveInterval,
	certainlyActive,
	possiblyActive,
	durationYears,
	parseDateEdge,
	applyOngoingObservation,
	ONGOING_CONFIRMATION_DAYS,
	type ResolvedInterval,
	type Precision,
	type IntervalStatus
};

/**
 * Research cutoff for the dataset. Nothing is asserted after this instant.
 * Live bindings: configureTime() refreshes them from the engine.
 */
export let DATASET_CUTOFF = getCutoff();
/** Floor used when a lower bound is genuinely unbounded (Tunisian independence). */
export let DATASET_FLOOR = getFloor();

/**
 * How far back an open-ended "in post by X" bound is allowed to reach, and how
 * far "~YYYY" widens. Kept as live bindings for the sensitivity analysis.
 */
export let BEFORE_WINDOW_YEARS = getBeforeWindowYears();
export let BEFORE_WINDOW_MS = BEFORE_WINDOW_YEARS * 365.2425 * 86_400_000;
export let APPROX_SLACK_DAYS = getApproxSlackDays();

/**
 * Retarget the engine to a jurisdiction's parameters (data/parameters.yaml).
 * The build calls this once at startup, before any date is parsed. The floor
 * and cutoff must be day-precision — an ambiguous floor is a build failure,
 * not a guess.
 */
export function configureTime(p: {
	floor: string;
	cutoff: string;
	beforeWindowYears: number;
	approxSlackDays: { year: number; month: number };
}): void {
	engineConfigureTime(p);
	DATASET_CUTOFF = getCutoff();
	DATASET_FLOOR = getFloor();
	BEFORE_WINDOW_YEARS = getBeforeWindowYears();
	BEFORE_WINDOW_MS = BEFORE_WINDOW_YEARS * 365.2425 * 86_400_000;
	APPROX_SLACK_DAYS = getApproxSlackDays();
}
