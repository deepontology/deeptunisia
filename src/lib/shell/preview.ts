/**
 * Pages that write their own preview tags.
 *
 * The share shells, the police study page and the introduction set a title and a
 * card in their own markup. Everywhere else the frame supplies the default card.
 * A path test, so the frame that decides costs no data.
 */
export function ownsPreviewTags(pathname: string): boolean {
	return /^\/(share\/|research\/police\/?$|introduction\/?$)/.test(pathname);
}
