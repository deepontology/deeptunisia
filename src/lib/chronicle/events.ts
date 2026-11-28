/**
 * Event geometry shared by the Chronicle's events lane and the events page.
 *
 * Both draw the same records on the same kind of time axis: the Chronicle as a
 * slim lane above the tenures, /events as one row per event. What an event's
 * extent is, when it counts as a long span, which events a selection chains
 * to, and how the axis is ticked at a given zoom are one answer each, written
 * here once so the two views cannot drift.
 *
 * Pure by construction: no Svelte, no dataset import. The caller passes the
 * records and the locale.
 */
import { dateFormatter, type Locale } from '../i18n';
import { fits, type TextMetrics } from '../viz/measure';

export const YEAR_MS = 365.2425 * 86_400_000;

/** The slice of an event this module reads. */
export interface AxisEvent {
	id: string;
	rupture?: boolean;
	causes: string[];
	consequences: string[];
	interval: {
		startEarliest: number;
		endEarliest?: number | null;
		endLatest?: number | null;
	};
}

/** The latest the record says the event may have run to; its start when it has no end. */
export function eventEnd(e: AxisEvent): number {
	return e.interval.endLatest ?? e.interval.endEarliest ?? e.interval.startEarliest;
}

/**
 * Domain test by interval overlap, not "start is inside": a long record that
 * begins before the window (phosphate, 2011) still draws while the reader is
 * looking at 2026.
 */
export function eventInDomain(e: AxisEvent, d0: number, d1: number): boolean {
	return eventEnd(e) >= d0 && e.interval.startEarliest <= d1;
}

/** Intrinsic duration in years, stable across zoom, unlike rendered width. */
export function intrinsicYears(e: AxisEvent): number {
	return (eventEnd(e) - e.interval.startEarliest) / YEAR_MS;
}

/**
 * A genuinely long record goes on its own thin track. The rule is by duration,
 * so no future long record can occlude the point marks.
 */
export function isLongSpan(e: AxisEvent): boolean {
	return intrinsicYears(e) > 2;
}

/** The years a group of events covers, as a label: "2026", or "2021–2026". */
export function clusterRange(members: AxisEvent[]): string {
	const t0 = Math.min(...members.map((m) => m.interval.startEarliest));
	const t1 = Math.max(...members.map((m) => m.interval.startEarliest));
	const y0 = new Date(t0).getUTCFullYear();
	const y1 = new Date(t1).getUTCFullYear();
	return y0 === y1 ? String(y0) : `${y0}–${y1}`;
}

/**
 * The events a selection chains to, split for connector styling: dashed back
 * to its causes, solid forward to its consequences. Either side of the record
 * may name the link, so both are read.
 */
export function chainOf<E extends AxisEvent>(sel: E | null, events: E[]): { causes: E[]; consequences: E[] } {
	if (!sel) return { causes: [], consequences: [] };
	return {
		causes: events.filter((e) => e.id !== sel.id && (e.consequences.includes(sel.id) || sel.causes.includes(e.id))),
		consequences: events.filter((e) => e.id !== sel.id && (e.causes.includes(sel.id) || sel.consequences.includes(e.id)))
	};
}

/** Every event a selection chains to, in either direction. */
export function linkedIds(sel: AxisEvent | null, events: AxisEvent[]): Set<string> {
	const { causes, consequences } = chainOf(sel, events);
	return new Set([...causes, ...consequences].map((e) => e.id));
}

/** Longest prefix of `text` (plus an ellipsis) that fits in `room` px. */
export function fitText(text: string, room: number, m: TextMetrics): string {
	if (fits(text, room, m, 0)) return text;
	const ell = '…';
	let lo = 1;
	let hi = text.length;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (fits(text.slice(0, mid) + ell, room, m, 0)) lo = mid;
		else hi = mid - 1;
	}
	if (lo <= 1) return '';
	let cut = text.slice(0, lo).trimEnd();
	// Prefer a word boundary, unless dropping to it would waste most of the space.
	const sp = cut.lastIndexOf(' ');
	if (sp >= lo * 0.55) cut = cut.slice(0, sp);
	return cut + ell;
}

export interface AxisTick {
	t: number;
	label: string;
	major: boolean;
}

/**
 * Ticks that adapt to the zoom: decades out to months and weeks, so the axis
 * always says which time the reader is looking at rather than only the year.
 */
export function axisTicks(d0: number, d1: number, locale: Locale): AxisTick[] {
	const out: AxisTick[] = [];
	const years = (d1 - d0) / YEAR_MS;
	if (years > 3) {
		const step = years > 55 ? 10 : years > 22 ? 5 : years > 9 ? 2 : 1;
		const y0 = Math.ceil(new Date(d0).getUTCFullYear() / step) * step;
		const y1 = new Date(d1).getUTCFullYear();
		for (let y = y0; y <= y1 && out.length < 200; y += step) {
			const t = Date.UTC(y, 0, 1);
			if (t < d0 || t > d1) continue;
			out.push({ t, label: String(y), major: true });
		}
		return out;
	}
	if (years > 0.35) {
		const stepMonths = years > 1 ? 3 : 1;
		const monthFmt = dateFormatter(locale, { month: 'short' });
		const yearFmt = dateFormatter(locale, { year: 'numeric' });
		const startM = Math.floor(new Date(d0).getUTCMonth() / stepMonths) * stepMonths;
		for (let k = 0; k < 200; k++) {
			const t = Date.UTC(new Date(d0).getUTCFullYear(), startM + k * stepMonths, 1);
			if (t > d1) break;
			if (t < d0) continue;
			const d = new Date(t);
			const jan = d.getUTCMonth() === 0;
			out.push({ t, label: jan ? `${monthFmt.format(d)} ${yearFmt.format(d)}` : monthFmt.format(d), major: jan });
		}
		return out;
	}
	const dayFmt = dateFormatter(locale, { day: 'numeric', month: 'short' });
	const step = 7 * 86_400_000;
	let t = Math.ceil(d0 / step) * step;
	for (let k = 0; k < 200 && t <= d1; k++, t += step) {
		out.push({ t, label: dayFmt.format(new Date(t)), major: false });
	}
	return out;
}
