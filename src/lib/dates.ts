/**
 * Date rendering, free of the graph.
 *
 * `locale` is an explicit parameter rather than something read from app state,
 * because several callers are not components: `search.ts` builds its index once
 * at module load, where there is no reactive context to read. The reactive
 * wrappers live in `t.svelte.ts`, the same split `translate`/`t` already uses.
 *
 * Years render bare in every locale: a year is a number, and wrapping it in
 * locale chrome would make the Chronicle's axis labels different widths per
 * language.
 */
import { dateFormatter, format, translate, type Locale } from './i18n';
import { CUTOFF } from './vocab';
import type { Interval } from '$data/index';

export function formatDate(
	t: number,
	precision: 'day' | 'month' | 'year' = 'day',
	locale: Locale = 'en'
): string {
	const d = new Date(t);
	if (precision === 'year') return String(d.getUTCFullYear());
	if (precision === 'month') return dateFormatter(locale, { month: 'short', year: 'numeric' }).format(d);
	return dateFormatter(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/**
 * Renders an interval the way the sources actually support it, rather than
 * inventing precision. "in post by June 2018", "around 2017", "documented
 * through Dec 2025 and possibly later" are all different statements and the
 * reader should be able to tell them apart at a glance.
 */
export function describeInterval(iv: Interval, locale: Locale = 'en'): string {
	const start = describeEdge(iv.startEarliest, iv.startLatest, iv.startPrecision, iv.raw.start, locale);
	if (iv.status === 'ongoing') return format(locale, 'interval.ongoing', { start });
	if (iv.status === 'unknown') return format(locale, 'interval.unknown', { start });
	/*
	 * The one that matters most, and the easiest to lose in translation: it says the
	 * officeholding was CONFIRMED to a date, not that it ended there. `/now` splits its
	 * entire display on that distinction, so it is a whole sentence in the dictionary
	 * rather than a phrase assembled from parts.
	 */
	if (iv.status === 'last-verified') {
		return format(locale, 'interval.lastVerified', {
			start,
			date: formatDate(iv.endEarliest ?? CUTOFF, 'month', locale)
		});
	}
	const end = describeEdge(iv.endEarliest ?? CUTOFF, iv.endLatest ?? CUTOFF, iv.endPrecision, iv.raw.end, locale);
	return format(locale, 'interval.range', { start, end });
}

function describeEdge(
	earliest: number,
	latest: number,
	precision: string,
	raw: string | null,
	locale: Locale
): string {
	switch (precision) {
		case 'day':
			return formatDate(earliest, 'day', locale);
		case 'month':
			return formatDate(earliest, 'month', locale);
		case 'year':
			return formatDate(earliest, 'year', locale);
		// The three below are epistemic statements, not date formats. Each says something
		// different about what the sources support, and each is its own sentence.
		case 'approx':
			return format(locale, 'edge.approx', { year: formatDate((earliest + latest) / 2, 'year', locale) });
		case 'before':
			return format(locale, 'edge.before', { date: formatDate(latest, 'month', locale) });
		case 'after':
			return format(locale, 'edge.after', { year: formatDate(earliest, 'year', locale) });
		default:
			return raw ?? translate(locale, 'edge.unknown');
	}
}

export function durationLabel(years: number, locale: Locale = 'en'): string {
	if (years < 1) {
		// Rounds up to a whole year just below the boundary — 0.97y is 12 months, and
		// "12 mo" is not a duration anyone writes.
		const months = Math.max(1, Math.round(years * 12));
		return months >= 12
			? format(locale, 'duration.y', { y: 1 })
			: format(locale, 'duration.m', { m: months });
	}
	let y = Math.floor(years);
	let m = Math.round((years - y) * 12);
	// Same boundary one level up: 2.99y rounded the remainder to 12 and printed
	// "2y 12m". Carry it instead.
	if (m >= 12) {
		y += 1;
		m = 0;
	}
	return m > 0 ? format(locale, 'duration.ym', { y, m }) : format(locale, 'duration.y', { y });
}

