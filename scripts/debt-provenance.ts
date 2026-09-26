/**
 * Provenance and freshness rules for the IDS debt snapshot.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The debt figures ship: scripts/fetch-debt.ts writes
 * flows/worldbank/tunisia-debt.json, scripts/build-world.ts joins it into
 * src/generated/world.json, and the world view draws public debt from that.
 * A public figure with no stated origin is the situation M2 exists to close,
 * so the snapshot now travels with a manifest entry in flows/manifest.json
 * under the id `ids-debt`: the API actually called, the licence and its
 * terms, the retrieval timestamp, and this file's freshness policy.
 *
 * `verifyDebtProvenance` is what makes the entry more than documentation.
 * The build (through build-world.ts's loadDebt) refuses to ship a debt claim
 * whose manifest entry or licence is missing, whose manifest and snapshot
 * disagree about when the data was retrieved, or whose snapshot is past the
 * fail threshold. It only warns past the warn threshold, because a snapshot
 * that is a little old is a reason to refetch, not a reason to delete a
 * true claim.
 *
 * ── The thresholds, and where they come from ─────────────────────────────────
 *
 * The policy is declared in the manifest entry itself (`freshness`), not
 * hard-coded here, so changing it is a reviewed data change rather than a
 * code change. As written: warn at 90 days, fail at 365.
 *
 *   warn_days: 90. The World Bank states that IDS is "updated annually with
 *     the IDR release and in December and April each year as needed", so the
 *     gaps between publisher refreshes run about three to four months. A
 *     snapshot 90 days old has probably let one refresh window pass.
 *   fail_days: 365. Past one annual cycle the snapshot is at least one full
 *     release behind, and the view would present it as current anyway. That
 *     is a stale claim wearing fresh clothes, so it fails the build.
 *
 * The refetch is manual (`npm run fetch:debt`), and this repository's
 * snapshot has been fetched once, on 2026-08-16. The thresholds are set to
 * the publisher's cadence rather than to that single observation: one fetch
 * in the repo's history is not a cadence, and a policy derived from it would
 * be a guess dressed as a rule.
 *
 * ── A recorded disagreement, not a resolved one ──────────────────────────────
 *
 * data/world-claims.yaml's `agg-public-debt-external-2024` assessment cites
 * "World Bank IDS, retrieved 2026-08-02", while the shipped snapshot says
 * `retrieved: 2026-08-16T20:25:57.775Z`. Both dates are recorded here
 * because they disagree: the claim text points at an earlier retrieval than
 * the file the claim now rests on. Whoever owns that record should settle it
 * against the file history; nothing in this module picks a winner.
 */

/** The dataset id the manifest uses for this snapshot. */
export const DEBT_MANIFEST_ID = 'ids-debt';

export interface DebtFreshness {
	warn_days?: number;
	fail_days?: number;
	policy?: string;
}

export interface DebtManifestEntry {
	id?: string;
	licence?: string;
	retrieved?: string;
	freshness?: DebtFreshness;
}

export interface FreshnessResult {
	/** Whole days between the retrieval timestamp and `now`. */
	ageDays: number;
	/** True when the snapshot is older than `warn_days` but still shippable. */
	warn: boolean;
	/** The policy that was applied, so the caller can quote it. */
	failDays: number;
	warnDays: number;
}

const DAY_MS = 86_400_000;

/**
 * Check the manifest entry against the snapshot that actually ships.
 *
 * Throws on every state that must stop the build, each message naming the
 * file to fix and the command that fixes it. Returns only when the debt
 * claim may ship, with the age so the caller can warn loudly at the soft
 * threshold.
 *
 * `now` is a parameter so the tests can pin the clock; production callers
 * pass nothing.
 */
export function verifyDebtProvenance(
	entry: DebtManifestEntry | undefined,
	snapshotRetrieved: string | undefined,
	now: Date = new Date()
): FreshnessResult {
	if (!entry) {
		throw new Error(
			`flows/manifest.json records no "${DEBT_MANIFEST_ID}" dataset while the debt snapshot exists; ` +
				`add the entry (source, licence, retrieved, freshness), or drop flows/worldbank/tunisia-debt.json ` +
				`so the claim does not ship`
		);
	}
	if (!entry.licence || !entry.licence.trim()) {
		throw new Error(`flows/manifest.json records no licence for the ${DEBT_MANIFEST_ID} dataset`);
	}
	const manifestRetrieved = entry.retrieved;
	if (!manifestRetrieved || !Number.isFinite(Date.parse(manifestRetrieved))) {
		throw new Error(
			`flows/manifest.json records no readable retrieval date for the ${DEBT_MANIFEST_ID} dataset ` +
				`(retrieved: ${JSON.stringify(entry.retrieved)})`
		);
	}
	if (!snapshotRetrieved || !Number.isFinite(Date.parse(snapshotRetrieved))) {
		throw new Error(
			`the debt snapshot carries no readable \`retrieved\` timestamp (got ${JSON.stringify(snapshotRetrieved)}); ` +
				`re-run npm run fetch:debt`
		);
	}
	if (manifestRetrieved !== snapshotRetrieved) {
		// Not a rounding difference to paper over: one of the two records is
		// wrong about when this data was fetched, and freshness can only be
		// measured from a retrieval date both halves agree on.
		throw new Error(
			`flows/manifest.json says the debt snapshot was retrieved ${manifestRetrieved} while the snapshot ` +
				`says ${snapshotRetrieved}; re-run npm run fetch:debt so both record the same retrieval`
		);
	}
	const { warn_days: warnDays, fail_days: failDays } = entry.freshness ?? {};
	if (
		typeof warnDays !== 'number' ||
		typeof failDays !== 'number' ||
		!Number.isFinite(warnDays) ||
		!Number.isFinite(failDays) ||
		warnDays <= 0 ||
		failDays <= warnDays
	) {
		throw new Error(
			`flows/manifest.json freshness policy for ${DEBT_MANIFEST_ID} must state positive warn_days < fail_days ` +
				`(got warn_days: ${JSON.stringify(warnDays)}, fail_days: ${JSON.stringify(failDays)})`
		);
	}

	const ageDays = Math.floor((now.getTime() - Date.parse(snapshotRetrieved)) / DAY_MS);
	if (ageDays > failDays) {
		throw new Error(
			`the debt snapshot retrieved ${snapshotRetrieved} is ${ageDays} days old, past the ${failDays}-day ` +
				`fail threshold in flows/manifest.json: run npm run fetch:debt (the manifest entry is updated ` +
				`with it), or state a different freshness policy deliberately`
		);
	}
	return { ageDays, warn: ageDays > warnDays, warnDays, failDays };
}
