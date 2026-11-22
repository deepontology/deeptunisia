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
 * An expired date is a build failure.
 */
export const VERIFIED_EXCEPTIONS = {
	expires: '2026-12-31',
	reason: 'written before 1.0, to be sorted by a data change on main',
	ids: [] as readonly string[]
};
