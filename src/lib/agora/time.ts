/**
 * How a post says when it was written.
 *
 * THIS IS A PRIVACY DECISION, NOT A FORMATTING ONE
 *
 * The page used to print `new Date(created_at).toLocaleString()` beside every
 * post — the exact minute, on every post, forever. This project's own threat
 * model names posting hours as one of the ways a persistent pseudonym leaks
 * through its own corpus, and `docs/anon-identity.md` says so in as many words.
 * Publishing a precise timestamp on every post builds that corpus for anyone who
 * wants it, at no cost to them, and the reader gains nothing from the seconds.
 *
 * So: relative while it is recent and a reader might care about ordering, then a
 * bare date, and never a clock time. The rounding is deliberately coarse at the
 * top of the scale for the same reason — "3 hours ago" narrows a poster's waking
 * hours far less than "14:07 does".
 *
 * The precise value is not exposed in a tooltip either. That would be the same
 * disclosure behind one more gesture.
 */
import type { Locale } from '$lib/i18n';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function relativeTime(at: number, locale: Locale, now = Date.now()): string {
	const delta = now - at;

	// A clock skewed forward would otherwise render "in 3 minutes" on a post that
	// has just been written, which reads as a bug rather than as a clock problem.
	if (delta < MIN) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');

	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	if (delta < HOUR) return rtf.format(-Math.floor(delta / MIN), 'minute');
	if (delta < DAY) return rtf.format(-Math.floor(delta / HOUR), 'hour');
	if (delta < 7 * DAY) return rtf.format(-Math.floor(delta / DAY), 'day');

	// Past a week the ordering no longer matters and the date is more useful. Day
	// precision, never time of day.
	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(at);
}
