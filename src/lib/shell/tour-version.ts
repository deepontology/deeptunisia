/**
 * The tour version and its storage key, in a plain module.
 *
 * `scripts/smoke.ts` has to seed the seen-flag so a run is a returning reader,
 * and it executes under tsx, where a `.svelte.ts` module's runes do not compile.
 * Keeping the version here means the harness cannot silently fall behind a bump
 * again: at v2 it still wrote `1`, so every smoke page loaded behind the tour
 * overlay and the Escape that dismissed it also cleared a flow pin placed by a
 * deep link — a failure that looked like a broken share link.
 */
export const TOUR_VERSION = 2;
export const TOUR_KEY = 'deeptunisia:tour';
