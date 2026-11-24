/**
 * The `verified` values written by hand before release 1.0, and when the
 * exception expires.
 *
 * These records state `verification: verified` in the data and carry no review
 * that V33 accepts. They are not evidence that a person checked anything; they
 * are values the word carried before the rule existed. A data change on `main`
 * sorts each one: the value stays where a human source check is recorded, and
 * the line is removed otherwise. Removing the line changes nothing there,
 * because `main` still defaults to `verified`; on this branch it becomes
 * `unflagged`.
 *
 * The list is empty: the data change on `main` sorted every record, so no
 * record states `verified` without a review V33 accepts. The mechanism stays so
 * a future exception has a place to be written down, with a date it expires.
 * `verifiedExceptionsExpired` is the rule the build applies: an exception that
 * still lists an id past its date is a build failure. An empty list has nothing
 * to expire, so its date is inert and the build does not fail on 2027-01-01.
 */
export const VERIFIED_EXCEPTIONS = {
	expires: '2026-12-31',
	reason: 'written before 1.0, to be sorted by a data change on main',
	ids: [] as readonly string[]
};

/**
 * True when `ids` still holds an exception and `expires` has passed. The last
 * day of the exception is still inside it, matching the Arabic title exception.
 */
export function verifiedExceptionsExpired(
	today: string,
	ids: readonly string[] = VERIFIED_EXCEPTIONS.ids,
	expires: string = VERIFIED_EXCEPTIONS.expires
): boolean {
	return ids.length > 0 && expires < today;
}
