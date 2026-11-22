/**
 * The two switches that decide what the record pages do.
 *
 * KINDS is what the generator writes. A template that has not landed yet stays
 * out of this list, so the build never links to a page it cannot write.
 *
 * INDEXING is the answer to "may a search engine keep this page". It is the only
 * place the question is answered: the page's robots meta, the sitemap and the
 * test all read it from here. Person pages stay out of the index until counsel
 * has answered (owner decision 3), so the switch for them is off.
 *
 * Do not spread either decision into the template.
 */

export type RecordKind = 'person' | 'institution' | 'event';

/** The kinds the generator writes, in the order the build reports them. */
export const KINDS: RecordKind[] = ['person', 'institution', 'event'];

/** One entry per kind. The only switch for robots meta and sitemap. */
export const INDEXING: Record<RecordKind, boolean> = {
	person: false,
	institution: true,
	event: true
};

/** The address a record page answers on, used in canonical, citation, twin. */
export const SITE_URL = 'https://deeptunisia.org';

export const PAGES_DIR = 'e';
