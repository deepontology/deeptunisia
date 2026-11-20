/**
 * What the browser's copy of the graph leaves out, and where it goes.
 *
 * The build writes the full graph to `static/dataset.json` and its hash to
 * `meta.datasetHash`. The browser does not load that file: it loads a smaller
 * copy, because the copy is parsed on every instrument page and most readers
 * are on phones. Each thing the copy leaves out is either fetched when it is
 * needed or never shown, and the lists below are the one place that says which.
 * `scripts/build-data.ts` writes the copy from them and `scripts/test-graph-copy.ts`
 * reads the copy back against the published file from the same lists.
 */

/** Collections whose records the copy trims. */
export const CLIENT_COLLECTIONS = ['people', 'institutions', 'positions', 'relationships', 'events', 'sources'] as const;

/** Prose fields whose French and Arabic forms ship in `static/prose-<lang>.json`. */
export const SPLIT_PROSE = new Set(['summary', 'notes', 'reasoning', 'falsifiable_by', 'tagline', 'description']);

/** Translations the site never shows: source excerpts and title glosses, career trajectories. Left out of the copy. */
export const UNSHOWN_TRANSLATION = new Set(['excerpt', 'title_gloss', 'trajectory']);

/** Counts the build derives and the site never reads. Left out of the copy. */
export const BUILD_ONLY = new Set(['erasSpanned', 'seniorYears', 'layerCount', 'basis_derived', 'source_relation', 'tier_note']);

/**
 * Fields that leave the copy and ship in a file of their own, fetched the first
 * time a panel shows a source's excerpt (`static/sources-prose.json`,
 * `src/lib/source-prose.svelte.ts`). The citation itself (id, title, publisher,
 * date, url, archive_url, tier, lang) stays in the copy, so a record's sources
 * are checkable without the file. Every field is still in the published dataset.
 */
export const FETCHED_FIELDS = { sources: ['excerpt'] } as const;

/**
 * Fields no panel, search or export of the site reads from the graph the browser
 * loads, so that graph leaves them out and nothing fetches them. A source's `note`
 * and `notes` are editorial remarks in `data/sources.yaml`. `static/dataset.json`
 * keeps them, and so does `src/generated/dataset.json`, which the build scripts
 * read; `static/sources.csv` never carried them.
 */
export const UNREAD_IN_BROWSER = { sources: ['note', 'notes'] } as const;

/**
 * Fields the copy adds for the browser. Not in the published dataset; the test
 * that reads the copy back against it removes them first.
 * `hasExcerpt` lets a source whose excerpt is still on its way (or unreachable)
 * say so, and a source with no excerpt say nothing.
 */
export const COPY_ADDED = { sources: ['hasExcerpt'] } as const;
