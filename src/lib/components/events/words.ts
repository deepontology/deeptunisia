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
		'events.reset': 'Show everything',
		'events.face.rings': 'Rings',
		'events.hint.rings': 'One ring per year, January at the top, the bark is today. A ring is as thick as its year\'s record, and a rupture carries a ring of its own and a scar. Drag the strip above the figure or pick a preset to move the lens; the years before it fold toward the centre. In the figure, the arrow keys walk the events, Enter opens one, plus and minus move the lens, Escape clears.',
		'events.hint.rings.compact': 'One ring per year, the bark is today. Drag the strip to move the lens, tap a mark to open its record.',
		'events.rings.label': '{n} events over {years} years, one ring per year, January at the top. The bark is today. A rupture carries a ring and a scar.',
		'events.rings.side': 'In the lens, newest first',
		'events.rings.follow': 'Follow',
		'events.rings.grow': 'Watch it grow',
		'events.rings.stop': 'Stop',
		'events.rings.today': 'Today',
		'events.rings.fresh': '{n} in the last {days} days',
		'events.rings.lensRange': '{from} to today: {n} events',
		'events.rings.asOf': '{from} to {to}: {n} events',
		'events.timeline.jumpHead': 'Playhead: {date}',
		'events.count': '{n} events',
		'events.countOne': 'one event',
		'events.years': '{start} to {end}'
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
		'events.reset': 'Tout afficher',
		'events.face.rings': 'Anneaux',
		'events.hint.rings': 'Un anneau par an, janvier en haut, l’écorce c’est aujourd’hui. Un anneau est aussi épais que les événements de son année, et une rupture porte son propre anneau et une cicatrice. Faites glisser la bande au-dessus de la figure ou choisissez un préréglage pour déplacer la lentille ; les années d’avant se replient vers le centre. Dans la figure, les flèches parcourent les événements, Entrée en ouvre un, plus et moins bougent la lentille, Échap efface.',
		'events.hint.rings.compact': 'Un anneau par an, l’écorce c’est aujourd’hui. Faites glisser la bande pour déplacer la lentille, touchez une marque pour ouvrir sa fiche.',
		'events.rings.label': '{n} événements sur {years} ans, un anneau par an, janvier en haut. L’écorce, c’est aujourd’hui. Une rupture porte un anneau et une cicatrice.',
		'events.rings.side': 'Dans le champ, du plus récent au plus ancien',
		'events.rings.follow': 'Suivre',
		'events.rings.grow': 'Voir la croissance',
		'events.rings.stop': 'Arrêter',
		'events.rings.today': 'Aujourd’hui',
		'events.rings.fresh': '{n} sur les {days} derniers jours',
		'events.rings.lensRange': 'De {from} à aujourd’hui : {n} événements',
		'events.rings.asOf': 'De {from} au {to} : {n} événements',
		'events.timeline.jumpHead': 'Curseur : {date}',
		'events.count': '{n} événements',
		'events.countOne': 'un événement',
		'events.years': 'de {start} à {end}'
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
		'events.reset': 'عرض الكل',
		'events.face.rings': 'الحلقات',
		'events.hint.rings': 'حلقة لكل سنة، ويناير في الأعلى، واللحاء هو اليوم. سُمك الحلقة بقدر أحداث سنتها، والانقطاع يحمل حلقة خاصة به وأثرًا. اسحب الشريط فوق الشكل أو اختر أحد الخيارات الجاهزة لتحريك النطاق، فتنطوي السنوات السابقة نحو المركز. داخل الشكل، الأسهم تتنقل بين الأحداث، وEnter يفتح حدثًا، والزائد والناقص يحركان النطاق، وEsc يمسح.',
		'events.hint.rings.compact': 'حلقة لكل سنة، واللحاء هو اليوم. اسحب الشريط لتحريك النطاق، والمس علامة لفتح سجلها.',
		'events.rings.label': '{n} حدثًا على مدى {years} سنة، حلقة لكل سنة، ويناير في الأعلى. اللحاء هو اليوم. الانقطاع يحمل حلقة وأثرًا.',
		'events.rings.side': 'داخل النطاق، الأحدث أولًا',
		'events.rings.follow': 'تتبّع',
		'events.rings.grow': 'شاهدها تنمو',
		'events.rings.stop': 'إيقاف',
		'events.rings.today': 'اليوم',
		'events.rings.fresh': '{n} خلال آخر {days} يومًا',
		'events.rings.lensRange': 'من {from} إلى اليوم: {n} حدثًا',
		'events.rings.asOf': 'من {from} إلى {to}: {n} حدثًا',
		'events.timeline.jumpHead': 'المؤشّر: {date}',
		'events.count': '{n} حدثاً',
		'events.countOne': 'حدث واحد',
		'events.years': 'من {start} إلى {end}'
	}
};

/** A word of this page in a language, with `{param}` filled. Pure, so the tests can read it. */
export function eventWord(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
	const text = eventWords[locale]?.[key] ?? eventWords.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
