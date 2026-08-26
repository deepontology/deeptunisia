import { translate, type Locale } from '$lib/i18n';

/**
 * Millions of USD → a localized compact string.
 *
 * One implementation, shared by the globe's arc titles, FlowCard, the totals
 * strip and the ledger — a third private copy of the bn/mn logic would drift
 * and two renderings of one number would disagree, which in this project is
 * the one failure mode that is also a lie.
 *
 * An unobserved year renders as an em dash, never as zero: the IMF/Comtrade
 * series have real gaps, and "0" would assert that trade was measured and
 * found to be none.
 */
export function moneyM(m: number | null, locale: Locale): string {
	if (m === null) return '—';
	const bn = m / 1000;
	if (bn >= 1) {
		return `${bn.toLocaleString(locale, { maximumFractionDigits: 1 })} ${translate(locale, 'world.bn')}`;
	}
	/*
	 * A positive amount never prints as "0". Rounding to whole millions turned
	 * real half-million-dollar flows into "bought 0 mn USD", which reads as
	 * "none" when it means "a little" — and the em dash already says "none"
	 * honestly elsewhere. Two different things must not print the same string.
	 */
	if (m > 0 && m < 0.5) return `<1 ${translate(locale, 'world.mn')}`;
	return `${m.toLocaleString(locale, { maximumFractionDigits: 0 })} ${translate(locale, 'world.mn')}`;
}
