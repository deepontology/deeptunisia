/**
 * Fuzzy historical date resolution.
 *
 * Historical personnel records are rarely precise. A source may say a general was
 * "appointed 1 June 2018", or "in post by at least December 2025", or "around 2017".
 * Collapsing all of those into a single timestamp forces us to invent precision we
 * do not have, which is precisely the failure mode this project exists to avoid.
 *
 * So every date edge resolves to a RANGE (earliest, latest) plus a precision label,
 * and every interval carries a status describing what we actually know about its end.
 * The UI renders that uncertainty rather than hiding it.
 *
 * Accepted grammar
 * ----------------
 *   2018-06-01        exact day
 *   2018-06           some time in June 2018
 *   2018              some time in 2018
 *   ~2017             approximately 2017 (widened +/- 1 year)
 *   ~2017-06          approximately June 2017 (widened +/- 3 months)
 *   <=2018-06         no later than June 2018 (already in place by then, start unknown)
 *   >=1984            no earlier than 1984
 *   ongoing           still in place at the dataset cutoff, positively confirmed
 *   verified:2025-12  documented in place at this date; may have continued after
 *   ?                 unknown
 */

/** Research cutoff for the dataset. Nothing is asserted after this instant. */
export let DATASET_CUTOFF = Date.UTC(2026, 6, 26);
/** Floor used when a lower bound is genuinely unbounded (Tunisian independence). */
export let DATASET_FLOOR = Date.UTC(1956, 2, 20);

/**
 * How far back an open-ended "in post by X" bound is allowed to reach. Eight years
 * is a plausible ceiling for a senior Tunisian command tenure; the longest
 * documented run in this dataset is about seven and a half.
 */
export let BEFORE_WINDOW_YEARS = 8;
export let BEFORE_WINDOW_MS = BEFORE_WINDOW_YEARS * 365.2425 * 86_400_000;

/** "~2017" widens by a year; "~2017-06" by a quarter (in days). */
export let APPROX_SLACK_DAYS = { year: 365, month: 92 };

/**
 * Retarget the resolver to a jurisdiction's parameters (data/parameters.yaml).
 * The values above are the shipped Tunisia defaults; the build calls this once
 * at startup, before any date is parsed. The floor and cutoff must be
 * day-precision — an ambiguous floor is a build failure, not a guess.
 */
export function configureTime(p: {
	floor: string;
	cutoff: string;
	beforeWindowYears: number;
	approxSlackDays: { year: number; month: number };
}): void {
	const floor = parseBare(p.floor);
	const cutoff = parseBare(p.cutoff);
	if (floor.precision !== 'day' || cutoff.precision !== 'day') {
		throw new Error('parameters.time floor and cutoff must be day-precision dates');
	}
	DATASET_FLOOR = floor.earliest;
	DATASET_CUTOFF = cutoff.latest;
	BEFORE_WINDOW_YEARS = p.beforeWindowYears;
	BEFORE_WINDOW_MS = p.beforeWindowYears * 365.2425 * 86_400_000;
	APPROX_SLACK_DAYS = p.approxSlackDays;
}

export type Precision = 'day' | 'month' | 'year' | 'approx' | 'before' | 'after' | 'unknown';
export type IntervalStatus = 'ended' | 'ongoing' | 'last-verified' | 'unknown';

export interface ResolvedInterval {
	/** Earliest instant the interval may have begun. */
	startEarliest: number;
	/** Latest instant the interval may have begun. Equals startEarliest when exact. */
	startLatest: number;
	/** Earliest instant the interval may have ended. null = still open. */
	endEarliest: number | null;
	/** Latest instant the interval may have ended. null = still open. */
	endLatest: number | null;
	startPrecision: Precision;
	endPrecision: Precision;
	status: IntervalStatus;
	/** True when the envelope was clamped (V22) — published in interval-trims.json. */
	trimmed?: boolean;
	/** True when the fuzzy start window was clamped down to the end (V22). */
	startClamped?: boolean;
	/** Original strings, kept so the UI can show what the source actually said. */
	raw: { start: string | null; end: string | null };
}

interface Edge {
	earliest: number;
	latest: number;
	precision: Precision;
}

const YMD = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

function startOfYear(y: number) {
	return Date.UTC(y, 0, 1);
}
function endOfYear(y: number) {
	return Date.UTC(y, 11, 31, 23, 59, 59);
}
function startOfMonth(y: number, m: number) {
	return Date.UTC(y, m - 1, 1);
}
function endOfMonth(y: number, m: number) {
	return Date.UTC(y, m, 0, 23, 59, 59);
}

/** Parse a bare `YYYY`, `YYYY-MM` or `YYYY-MM-DD` token into a range. */
function parseBare(token: string): Edge {
	const m = YMD.exec(token);
	if (!m) throw new Error(`Unparseable date token: "${token}"`);
	const year = Number(m[1]);
	if (m[3] !== undefined) {
		const mo = Number(m[2]);
		const da = Number(m[3]);
		if (mo < 1 || mo > 12) throw new Error(`Invalid month in "${token}"`);
		const t = Date.UTC(year, mo - 1, da);
		// Calendar-valid dates only. Date.UTC rolls invalid days over (2018-02-31
		// becomes 2018-03-03); reject by round-trip instead of shipping a different
		// day in a project whose product is precise dates. (V21)
		const d = new Date(t);
		if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) {
			throw new Error(`Invalid calendar date: "${token}"`);
		}
		return { earliest: t, latest: t, precision: 'day' };
	}
	if (m[2] !== undefined) {
		const mo = Number(m[2]);
		if (mo < 1 || mo > 12) throw new Error(`Invalid month in "${token}"`);
		return { earliest: startOfMonth(year, mo), latest: endOfMonth(year, mo), precision: 'month' };
	}
	return { earliest: startOfYear(year), latest: endOfYear(year), precision: 'year' };
}

/** Parse any single date expression into an (earliest, latest) range. */
export function parseDateEdge(input: string): Edge {
	const token = input.trim();

	if (token === '?' || token === '') {
		return { earliest: DATASET_FLOOR, latest: DATASET_CUTOFF, precision: 'unknown' };
	}

	if (token.startsWith('~')) {
		const base = parseBare(token.slice(1).trim());
		// Widen: a year-precision guess gets a year of slack either side, a
		// month-precision guess gets a quarter. The day counts come from the
		// jurisdiction parameters, not from literals.
		const slack = base.precision === 'year' ? APPROX_SLACK_DAYS.year : APPROX_SLACK_DAYS.month;
		const ms = slack * 86_400_000;
		return { earliest: base.earliest - ms, latest: base.latest + ms, precision: 'approx' };
	}

	if (token.startsWith('<=')) {
		const base = parseBare(token.slice(2).trim());
		// "In post by 2013, start unknown" must NOT open the interval back to 1956.
		// Doing so silently places the officer in every earlier era and inflates any
		// survival metric computed from the span. Bound it to a plausible maximum
		// tenure for a senior post instead. This is a stated modelling assumption,
		// not a fact about the person, which is why the edge still renders hatched.
		return {
			earliest: Math.max(DATASET_FLOOR, base.latest - BEFORE_WINDOW_MS),
			latest: base.latest,
			precision: 'before'
		};
	}

	if (token.startsWith('>=')) {
		const base = parseBare(token.slice(2).trim());
		return {
			earliest: base.earliest,
			latest: Math.min(DATASET_CUTOFF, base.earliest + BEFORE_WINDOW_MS),
			precision: 'after'
		};
	}

	return parseBare(token);
}

/**
 * Resolve a `{ start, end }` pair from the YAML source into the four-field
 * interval the visualisations consume.
 */
export function resolveInterval(
	spec: { start?: string | null; end?: string | null },
	opts?: { allowEnvelopeTrim?: boolean }
): ResolvedInterval {
	const rawStart = spec.start ?? null;
	const rawEnd = spec.end ?? null;
	let trimmed = false;
	let startClamped = false;

	let start = rawStart
		? parseDateEdge(rawStart)
		: { earliest: DATASET_FLOOR, latest: DATASET_CUTOFF, precision: 'unknown' as Precision };

	let endEarliest: number | null;
	let endLatest: number | null;
	let endPrecision: Precision;
	let status: IntervalStatus;

	const endToken = (rawEnd ?? '?').trim();

	if (endToken === 'ongoing') {
		// Positively confirmed in place at the cutoff.
		endEarliest = null;
		endLatest = null;
		endPrecision = 'after';
		status = 'ongoing';
	} else if (endToken.startsWith('verified:')) {
		// Documented in place at this date. May well have continued; we do not know.
		const at = parseDateEdge(endToken.slice('verified:'.length));
		// "verified:2026-07" can resolve to the month's last day, past the dataset
		// cutoff; a verified-at bound beyond the cutoff would make endEarliest >
		// endLatest (an inverted core). Clamp the earliest-possible verification
		// to the cutoff. (V22)
		endEarliest = Math.min(at.latest, DATASET_CUTOFF);
		endLatest = DATASET_CUTOFF;
		endPrecision = at.precision;
		status = 'last-verified';
	} else if (endToken === '?') {
		endEarliest = null;
		endLatest = DATASET_CUTOFF;
		endPrecision = 'unknown';
		status = 'unknown';
	} else {
		const e = parseDateEdge(endToken);
		endEarliest = e.earliest;
		endLatest = e.latest;
		endPrecision = e.precision;
		status = 'ended';
	}

	// A genuine contradiction: the interval cannot possibly have ended before it
	// possibly began. A dispute may document the disagreement; arithmetic may not
	// resolve it. (V22)
	if (endLatest !== null && endLatest < start.earliest && !opts?.allowEnvelopeTrim) {
		throw new Error(`Interval ends before it begins: start="${rawStart}" end="${rawEnd}"`);
	}

	// Over-wide envelopes. A fuzzy start such as "~1986" or a missing start widens
	// `startLatest` past a precise end ("1987-10-02"), and a fuzzy end such as
	// "~2014" widens `endEarliest` before a known start ("2013-04"). Both are
	// uncertainty artifacts, not data errors, and each has exactly one correct
	// resolution: a fuzzy start cannot be later than the known end, and a fuzzy
	// end cannot be earlier than the known start. Clamp the envelope — never the
	// confident core — and publish every clamp in interval-trims.json so the
	// adjustment is never silent. (V22)
	//
	// The old code clamped only the end side, which for a record like
	// `start: "2010", end: "2010-01-14"` produced an inverted interval
	// (endEarliest > endLatest). The start-side clamp below prevents that class
	// entirely. Disputed spans are left raw so the dispute, not synthetic
	// arithmetic, explains them.
	if (endLatest !== null && start.latest > endLatest && !opts?.allowEnvelopeTrim) {
		start = { ...start, latest: endLatest };
		startClamped = true;
	}
	if (endEarliest !== null && endEarliest < start.latest && !opts?.allowEnvelopeTrim) {
		endEarliest = start.latest;
		trimmed = true;
	}

	return {
		startEarliest: start.earliest,
		startLatest: start.latest,
		endEarliest,
		endLatest,
		startPrecision: start.precision,
		endPrecision,
		status,
		...(trimmed ? { trimmed: true } : {}),
		...(startClamped ? { startClamped: true } : {}),
		raw: { start: rawStart, end: rawEnd }
	};
}

/** True when the interval is definitely active at `t` (inside the confident core). */
export function certainlyActive(iv: ResolvedInterval, t: number): boolean {
	if (t < iv.startLatest) return false;
	if (iv.endEarliest !== null && t > iv.endEarliest) return false;
	return true;
}

/** True when the interval may be active at `t` (inside the outer envelope). */
export function possiblyActive(iv: ResolvedInterval, t: number): boolean {
	if (t < iv.startEarliest) return false;
	if (iv.endLatest !== null && t > iv.endLatest) return false;
	return true;
}

/** Best-estimate duration in years, using midpoints of the fuzzy edges. */
export function durationYears(iv: ResolvedInterval): number {
	const startMid = (iv.startEarliest + iv.startLatest) / 2;
	const endMid =
		iv.endEarliest === null || iv.endLatest === null
			? DATASET_CUTOFF
			: (iv.endEarliest + iv.endLatest) / 2;
	return Math.max(0, (endMid - startMid) / (365.2425 * 86_400_000));
}
