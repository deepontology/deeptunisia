/**
 * The words only the events page prints.
 *
 * They load with the /events route and with nothing else. The three main
 * dictionaries in `$lib/i18n` are part of the frame every page preloads, so a
 * phrase that one page alone shows is cheaper here: no reading page pays for it.
 * Words the rest of the app already has (category names, "Rupture", the cluster
 * sentence, "Zoom in") are read from the main dictionaries, never copied here.
 *
 * `scripts/test-i18n.ts` holds this table to the same rules as the dictionaries:
 * every key in all three languages, the English placeholders kept, nothing
 * empty, no em dash, no key that also exists in a main dictionary, and every
 * key a component asks for present.
 */
import type { Locale } from '$lib/i18n';

export const eventWords: Record<Locale, Record<string, string>> = {
	en: {
		'events.hint':
			'Every recorded event on one time axis, one row each, newest at the bottom. Scroll or pinch to zoom, drag to pan. Events a few pixels apart gather into a counted group; zoom in to separate them. Select an event to open its record and trace what caused it and what followed.',
		'events.hint.compact': 'Every recorded event, newest first. Tap one to open its record.',
		'events.face': 'Face',
		'events.face.timeline': 'Timeline',
		'events.lens': 'Years shown',
		'events.lens.all': 'All years',
		'events.lens.since': 'Since {year}',
		'events.filters': 'Filters',
		'events.thread.actor': 'Person: {name}',
		'events.thread.institution': 'Institution: {name}',
		'events.thread.remove': 'Remove the filter {name}',
		'events.shown': '{shown} of {total}',
		'events.empty': 'No event matches these filters in the years shown.',
		'events.reset': 'Show everything'
	},
	fr: {
		'events.hint':
			'Chaque événement enregistré sur un même axe du temps, une ligne chacun, le plus récent en bas. Faites défiler ou pincez pour zoomer, glissez pour vous déplacer. Les événements à quelques pixels les uns des autres forment un groupe compté ; zoomez pour les séparer. Choisissez un événement pour ouvrir sa fiche et suivre ce qui l’a causé et ce qui a suivi.',
		'events.hint.compact': 'Chaque événement enregistré, du plus récent au plus ancien. Touchez-en un pour ouvrir sa fiche.',
		'events.face': 'Vue',
		'events.face.timeline': 'Chronologie',
		'events.lens': 'Années affichées',
		'events.lens.all': 'Toutes les années',
		'events.lens.since': 'Depuis {year}',
		'events.filters': 'Filtres',
		'events.thread.actor': 'Personne : {name}',
		'events.thread.institution': 'Institution : {name}',
		'events.thread.remove': 'Retirer le filtre {name}',
		'events.shown': '{shown} sur {total}',
		'events.empty': 'Aucun événement ne correspond à ces filtres pour les années affichées.',
		'events.reset': 'Tout afficher'
	},
	ar: {
		'events.hint':
			'كل حدث مسجّل على محور زمني واحد، لكل حدث سطر، والأحدث في الأسفل. مرّر أو اقرص للتكبير، واسحب للتنقل. الأحداث المتقاربة ببضع نقاط تتجمع في مجموعة معدودة؛ كبّر لفصلها. اختر حدثاً لفتح سجله وتتبّع ما سبّبه وما تلاه.',
		'events.hint.compact': 'كل حدث مسجّل، من الأحدث إلى الأقدم. المس حدثاً لفتح سجله.',
		'events.face': 'العرض',
		'events.face.timeline': 'الخط الزمني',
		'events.lens': 'السنوات المعروضة',
		'events.lens.all': 'كل السنوات',
		'events.lens.since': 'منذ {year}',
		'events.filters': 'المرشّحات',
		'events.thread.actor': 'شخص: {name}',
		'events.thread.institution': 'مؤسسة: {name}',
		'events.thread.remove': 'إزالة المرشّح {name}',
		'events.shown': '{shown} من {total}',
		'events.empty': 'لا حدث يطابق هذه المرشّحات في السنوات المعروضة.',
		'events.reset': 'عرض الكل'
	}
};

/** A word of this page in a language, with `{param}` filled. Pure, so the tests can read it. */
export function eventWord(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
	const text = eventWords[locale]?.[key] ?? eventWords.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
