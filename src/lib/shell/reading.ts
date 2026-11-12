/**
 * Which addresses are pages of prose.
 *
 * A reading page renders a document: it scrolls, it has no time controls and no
 * Inspector. An instrument page is a view over the graph and keeps all three.
 * Two callers need the same answer — the frame decides what to mount, and the
 * search palette decides where a hit opens (a record page here, the Inspector
 * there), so the list lives in one place.
 */
const READING_PAGES = [
	'/about',
	'/guide',
	'/methodology',
	'/colophon',
	'/data',
	'/corrections',
	'/introduction',
	'/evidence'
];

/** Prefixes whose child routes are documents too: media articles, studies. */
const READING_PREFIXES = ['/media', '/research'];

export function isReadingPath(pathname: string): boolean {
	return (
		READING_PAGES.includes(pathname) ||
		READING_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}
