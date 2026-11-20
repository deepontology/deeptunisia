/**
 * Tunisia's naming conventions, as the data the engine's name matcher is built
 * from. The matcher itself is engine code (`deepepisteme/match`); which words
 * are particles, grammatical words, splittable prefixes and surname heads is a
 * property of the country's names, so it is written here and nowhere in the
 * engine.
 *
 * This file holds nothing else and imports nothing, so the browser bundle that
 * links headlines to entities carries the lists and the matcher and no more.
 * `scripts/engine.ts` reads the same lists for the engine's deployment.
 */

/**
 * Nasab particles: the connective tissue of Arabic names. They may never match
 * alone, but unlike grammatical words they carry distinguishing weight inside a
 * phrase: `Ben Ali` is not `Ali`. Treating them as noise would throw away the
 * authored alias "Ben Ali", which is exactly the kind of human judgement the
 * alias table exists to record.
 */
export const NASAB_PARTICLES: readonly string[] = [
	'ben',
	'bin',
	'bel',
	'bou',
	'abou',
	'abu',
	'abd',
	'ould',
	'bent',
	'el',
	'al',
	'بن', // بن
	'ابن', // ابن
	'ابو', // ابو
	'بو', // بو
	'بل', // بل
	'عبد', // عبد
	'ولد', // ولد
	'بنت' // بنت
];

/**
 * Grammatical words. These narrow nothing: `Le Temps` is distinctive only to the
 * extent that `Temps` is, so it is treated as a single-content-token form and
 * gated accordingly.
 */
export const FUNCTION_WORDS: readonly string[] = [
	'la',
	'le',
	'les',
	'de',
	'des',
	'du',
	'da',
	'di',
	'van',
	'von',
	'of',
	'the',
	'and',
	'et',
	'for',
	'a',
	'aux',
	'ال', // ال
	'و' // و
];

/** Prefixes recoverable from a written-together surname: Bensedrine -> Ben Sedrine. */
export const SPLITTABLE_PREFIXES: readonly string[] = ['ben', 'bin', 'bel', 'bou', 'abou', 'abu', 'abd', 'el'];

/** Particles that may head a surname block: "Ben Ali", "Caid Essebsi", "Abd Essalem". */
export const SURNAME_HEADS: readonly string[] = [
	'ben',
	'bin',
	'bel',
	'bou',
	'abou',
	'abu',
	'abd',
	'ould',
	'el',
	'al',
	'caid',
	'بن',
	'ابن',
	'ابو',
	'بو',
	'عبد',
	'قايد' // قايد (قائد folds to this)
];

export const MATCHER_WORDS = {
	particles: NASAB_PARTICLES,
	functionWords: FUNCTION_WORDS,
	splittablePrefixes: SPLITTABLE_PREFIXES,
	surnameHeads: SURNAME_HEADS
};
