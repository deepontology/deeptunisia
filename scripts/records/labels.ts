/**
 * Labels for the record pages.
 *
 * The page is one document in three languages: every interface phrase is printed
 * three times, each copy tagged with its language, and record.css shows the copy
 * that matches the page's lang attribute. That is why the template calls tri()
 * instead of writing a word.
 *
 * The words themselves live in src/lib/i18n.ts under rec.*, the same dictionary
 * the app reads. Nothing here chooses wording.
 */
import { translate, type Locale } from '../../src/lib/i18n.ts';

const LANGS: Locale[] = ['en', 'fr', 'ar'];

export interface Line {
	key: string;
	params?: Record<string, string | number>;
}

export interface Params {
	[key: string]: string | number;
}

/** Escape for HTML text and attribute values. Every data value passes through this. */
export function esc(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function fill(text: string, params?: Params): string {
	if (!params) return text;
	return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * One phrase, in each of the three languages.
 *
 * The Arabic copy carries lang and dir so it sets right to left even while the
 * surrounding page is in English, which is the state a reader without script
 * gets when their browser asked for Arabic.
 */
export function tri(key: string, params?: Params): string {
	return LANGS.map((locale) => {
		const text = esc(fill(translate(locale, key), params));
		const extra = locale === 'ar' ? ' lang=ar dir=rtl' : '';
		return `<b data-l=${locale}${extra}>${text}</b>`;
	}).join('');
}

/** One phrase already written in each language, e.g. from the app's own date renderer. */
export function triRaw(values: Record<string, string>): string {
	return LANGS.filter((locale) => values[locale])
		.map((locale) => {
			const extra = locale === 'ar' ? ' lang=ar dir=rtl' : '';
			return `<b data-l=${locale}${extra}>${esc(values[locale])}</b>`;
		})
		.join('');
}

/** The same phrase in one language, for a place that cannot hold three (a meta tag). */
export function one(locale: Locale, key: string, params?: Params): string {
	return fill(translate(locale, key), params);
}

/** A translation with no interface copy of its own, e.g. a data value. */
export function loc(locale: Locale, key: string): string {
	return translate(locale, key);
}
