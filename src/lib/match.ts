/**
 * Deterministic entity linking for headlines.
 *
 * The matcher is engine code: `deepepisteme/match` links a headline to a person
 * or an institution by string matching over surface forms derived from the
 * dataset's own name fields, with no language model anywhere in the path. This
 * module binds it to Tunisia, which is the one thing that is ours: the word
 * lists in `./match-words.ts` (nasab particles, grammatical words, splittable
 * prefixes, surname heads).
 *
 * It does not import the dataset: callers pass entities in. The browser imports
 * it through `$lib`; Node scripts import it by relative path after reading
 * `src/generated/dataset.json`. Same code, same results, no bundler
 * assumptions, and nothing from the engine beyond the matcher reaches the page.
 *
 * Design bias, unchanged: precision over recall. Where a surface form is
 * ambiguous it is dropped rather than resolved, because resolving it would be an
 * inference, and an inference may never become a fact.
 */
import { createMatcher, normalise } from 'deepepisteme/match';
import type { Match, MatchEntity, Matcher, MatcherOptions, MatcherStats, RuleName } from 'deepepisteme/match';
import { MATCHER_WORDS } from './match-words';

export { normalise };
export type { Match, MatchEntity, Matcher, MatcherOptions, MatcherStats, RuleName };

export function buildMatcher(entities: readonly MatchEntity[], options: MatcherOptions = {}): Matcher {
	return createMatcher(entities, MATCHER_WORDS, options);
}
