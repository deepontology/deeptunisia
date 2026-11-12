/**
 * scripts/dates.ts — DeepTunisia's binding to the DeepEpisteme time kernel.
 *
 * The interval resolver and the activity predicates are owned by the
 * DeepEpisteme engine (pinned in package.json). This file used to carry its own
 * copy of both; the copies drifted, and a duplicated predicate is a predicate
 * with two answers. The bodies now live in `deepepisteme/kernel/time` and this
 * file holds one Time object built from the jurisdiction's parameters.
 *
 * There is no module state in the engine. The object below is this file's only
 * configuration holder: configureTime() replaces it, and every export delegates
 * to the object that is current at the call. Import order no longer decides
 * which parameters a date is parsed with.
 *
 * Token semantics — including the certainty horizon (`lastObserved`), the
 * month-only observation rule and the `ongoing` confirmation window — are
 * documented at the top of the engine's time module and covered by the engine's
 * generated property tests plus scripts/test-engine-conformance.ts, which fails
 * DeepTunisia CI on a bad engine bump.
 */
import {
	createTime,
	ONGOING_CONFIRMATION_DAYS,
	type IntervalStatus,
	type Precision,
	type ResolveOptions,
	type ResolvedInterval,
	type Time,
	type TimeParameters
} from 'deepepisteme/kernel/time';
import { DEFAULT_PARAMETERS } from './parameters.ts';

export {
	ONGOING_CONFIRMATION_DAYS,
	type ResolvedInterval,
	type Precision,
	type IntervalStatus,
	type TimeParameters
};

/**
 * The shipped parameters, so a module that never calls configureTime() reads
 * the same floor and cutoff it read before. configureTime() replaces the object.
 */
let time: Time = createTime(DEFAULT_PARAMETERS.time);

/**
 * Research cutoff for the dataset. Nothing is asserted after this instant.
 * Live bindings: configureTime() refreshes them from the Time object.
 */
export let DATASET_CUTOFF = time.cutoff;
/** Floor used when a lower bound is genuinely unbounded (Tunisian independence). */
export let DATASET_FLOOR = time.floor;

/**
 * How far back an open-ended "in post by X" bound is allowed to reach, and how
 * far "~YYYY" widens. Kept as live bindings for the sensitivity analysis.
 */
export let BEFORE_WINDOW_YEARS = time.beforeWindowYears;
export let BEFORE_WINDOW_MS = BEFORE_WINDOW_YEARS * 365.2425 * 86_400_000;
export let APPROX_SLACK_DAYS = time.approxSlackDays;

export function parseDateEdge(input: string) {
	return time.parseDateEdge(input);
}

export function resolveInterval(
	spec: { start?: string | null; end?: string | null },
	opts?: ResolveOptions
): ResolvedInterval {
	return time.resolveInterval(spec.start ?? undefined, spec.end ?? undefined, opts);
}

export function applyOngoingObservation(
	iv: ResolvedInterval,
	lastObservation: number | null
): ResolvedInterval {
	return time.applyOngoingObservation(iv, lastObservation);
}

export function certainlyActive(iv: ResolvedInterval, t: number): boolean {
	return time.certainlyActive(iv, t);
}

export function possiblyActive(iv: ResolvedInterval, t: number): boolean {
	return time.possiblyActive(iv, t);
}

export function durationYears(iv: ResolvedInterval): number {
	return time.durationYears(iv);
}

/**
 * Retarget the engine to a jurisdiction's parameters (data/parameters.yaml).
 * The build calls this once at startup, before any date is parsed. The floor
 * and cutoff must be day-precision — an ambiguous floor is a build failure,
 * not a guess.
 */
export function configureTime(p: TimeParameters): void {
	time = createTime(p);
	DATASET_CUTOFF = time.cutoff;
	DATASET_FLOOR = time.floor;
	BEFORE_WINDOW_YEARS = time.beforeWindowYears;
	BEFORE_WINDOW_MS = BEFORE_WINDOW_YEARS * 365.2425 * 86_400_000;
	APPROX_SLACK_DAYS = time.approxSlackDays;
}
