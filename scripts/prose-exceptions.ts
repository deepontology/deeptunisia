/**
 * English left on a translated page that is data waiting for translation, not
 * interface, and when the exception expires.
 *
 * The prose ceilings in `scripts/smoke.ts` count English function words on
 * each route in each language. A ceiling is a ratchet: it falls as translations
 * land and is never raised to fit a measurement. This is the one place a route
 * may stand above its ceiling, for a stated reason, a counted amount of debt and
 * a date.
 *
 * `/methodology` lists the roles of the graph. All 198 roles carry a `title_ar`
 * in `data/roles.yaml`, so the Arabic page shows no English role titles and
 * stands at its ordinary ceiling of 37. The exception stays as the register
 * `scripts/build-data.ts` checks: a role added without a title, or a title that
 * goes missing, fails the build against the stated count.
 *
 * `scripts/build-data.ts` fails when the date passes with a role still
 * untranslated, and when the number below no longer matches the data (a new role
 * without a title, or titles that landed and left the number stale). `scripts/smoke.ts`
 * holds the route to `ceiling` until the date, and to its ordinary ceiling after.
 */
export const ARABIC_TITLE_EXCEPTION = {
	route: '/methodology',
	locale: 'ar',
	expires: '2026-12-31',
	reason: 'roles whose title_ar is not yet in data/roles.yaml',
	/** Roles with no `title_ar` today, of `rolesTotal`. Zero: every title is in. */
	rolesWithoutTitleAr: 0,
	rolesTotal: 198,
	/** The route's ceiling; with no titles missing it is the ordinary one. */
	ceiling: 37,
	/** The route's ordinary ceiling once the titles are in. */
	baseCeiling: 37
};

/** True until the day after `expires`, in UTC. */
export function arabicTitleExceptionActive(today = new Date().toISOString().slice(0, 10)): boolean {
	return today <= ARABIC_TITLE_EXCEPTION.expires;
}
