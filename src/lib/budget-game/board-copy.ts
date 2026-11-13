/**
 * Words on the Treasury board, in English, French and Arabic.
 *
 * English is the source. French and Arabic are interim drafts, marked as such
 * on screen, to be replaced by the human translation the protocol requires.
 * Amounts arrive formatted; this file never computes a figure.
 */
import type { Locale } from '$lib/i18n';
import type { Refusal, MoveRule } from './board';

export interface BoardCopy {
	interim: string | null;
	title: string;
	badge: string;
	rule: Record<MoveRule, string>;
	purse: string;
	purseEmpty: string;
	purseToPlace: string;
	purseLeftover: string;
	coinNote: Record<MoveRule, string>;
	lockedTitle: string;
	lockedBody: (debt: string, reserve: string) => string;
	legendPlan: string;
	legendYours: string;
	scale: (max: string) => string;
	howTo: Record<MoveRule, string>;
	keys: string;
	pick: string;
	plan: string;
	yours: string;
	change: string;
	more: string;
	less: string;
	same: string;
	take: (amount: string) => string;
	give: (amount: string) => string;
	takeAria: (amount: string, name: string) => string;
	giveAria: (amount: string, name: string) => string;
	rowAria: (name: string, plan: string, yours: string, change: string) => string;
	refusal: (why: Refusal, name: string, purse: string, step: string) => string;
	took: (amount: string, name: string) => string;
	gave: (amount: string, name: string) => string;
	moved: (amount: string, from: string, to: string) => string;
	movedStep: (out: string, into: string, from: string, to: string) => string;
	kept: string;
	carrying: (amount: string, name: string) => string;
	carryingPurse: (amount: string) => string;
	dropHere: string;
	undo: string;
	reset: string;
	keep: string;
	table: string;
	bars: string;
	finish: string;
	finishNeeds: (amount: string) => string;
	ready: string;
	/** Rule B: finished inside the 0.5% band with money still in the purse. */
	readyBand: string;
	moves: string;
	noMoves: string;
	th: { system: string; plan: string; yours: string; md: string; pct: string };
	total: string;
	unit: string;
	back: string;
}

const en: BoardCopy = {
	interim: null,
	title: 'Your 2027 budget',
	badge: 'Prototype · draft figures · nothing is sent',
	rule: { coin: 'Rule A: coins of 100 MD (default)', step: 'Rule B: steps of 5% (owner test)' },
	purse: 'Purse',
	purseEmpty: 'Empty. Every dinar is placed.',
	purseToPlace: 'to place before you finish',
	purseLeftover: 'left over, inside the 0.5% you may leave',
	coinNote: { coin: 'One coin is 100 MD.', step: 'One step is 5% of a system’s plan.' },
	lockedTitle: 'Spent before you start',
	lockedBody: (debt, reserve) => `Debt interest ${debt} MD and the unforeseen reserve ${reserve} MD are owed. They cannot be moved.`,
	legendPlan: 'State plan 2027 (draft)',
	legendYours: 'Yours',
	scale: (max) => `One scale for every system, 0 to ${max} MD`,
	howTo: {
		coin: 'Drag one system onto another to move 100 MD. Keep holding to keep money flowing. Or choose a system and use Take and Give.',
		step: 'Drag one system onto another to move one step. The difference between the two steps stays in the purse.'
	},
	keys: 'Keys: arrows choose a system, minus takes, plus gives, Enter picks up money to move, Escape puts it back.',
	pick: 'Choose a system, or drag one onto another.',
	plan: 'Plan',
	yours: 'Yours',
	change: 'Change',
	more: 'more than the plan',
	less: 'less than the plan',
	same: 'same as the plan',
	take: (a) => `Take ${a}`,
	give: (a) => `Give ${a}`,
	takeAria: (a, n) => `Take ${a} MD from ${n} into the purse`,
	giveAria: (a, n) => `Give ${a} MD from the purse to ${n}`,
	rowAria: (n, p, y, c) => `${n}. Plan ${p} MD. Yours ${y} MD. ${c}.`,
	refusal: (why, n, purse, step) =>
		why === 'zero'
			? `${n} is at zero. There is nothing left to take.`
			: why === 'cap'
				? `${n} is at 200% of its plan. Give somewhere else.`
				: why === 'self'
					? 'Drop the money on a different system.'
					: step
						? `The purse holds ${purse} MD and one step of ${n} is ${step} MD. Take from another system first.`
						: 'The purse is empty. Take from a system first, or drag one system onto another.',
	took: (a, n) => `Took ${a} MD from ${n}.`,
	gave: (a, n) => `Gave ${a} MD to ${n}.`,
	moved: (a, f, t) => `Moved ${a} MD from ${f} to ${t}.`,
	movedStep: (o, i, f, t) => `${o} MD left ${f}, ${i} MD reached ${t}.`,
	kept: 'Back to the plan.',
	carrying: (a, n) => `Carrying ${a} MD from ${n}`,
	carryingPurse: (a) => `Carrying ${a} MD from the purse`,
	dropHere: 'Drop on a system, or on the purse',
	undo: 'Undo',
	reset: 'Start again',
	keep: 'Keep the plan',
	table: 'Table',
	bars: 'Board',
	finish: 'Finish',
	finishNeeds: (a) => `Place ${a} MD to finish`,
	ready: 'Every dinar is placed. You can finish.',
	readyBand: 'The purse is inside the 0.5% band. You can finish; what is left stays unplaced.',
	moves: 'Moves',
	noMoves: 'No moves yet.',
	th: { system: 'System', plan: 'Plan, MD', yours: 'Yours, MD', md: 'Change, MD', pct: 'Change, %' },
	total: 'Total',
	unit: 'MD',
	back: 'Back to the study page'
};

const fr: BoardCopy = {
	interim: 'Traduction provisoire, non relue.',
	title: 'Votre budget 2027',
	badge: 'Prototype · chiffres provisoires · rien n’est envoyé',
	rule: { coin: 'Règle A : pièces de 100 MD (par défaut)', step: 'Règle B : pas de 5 % (essai)' },
	purse: 'Bourse',
	purseEmpty: 'Vide. Chaque dinar est placé.',
	purseToPlace: 'à placer avant de terminer',
	purseLeftover: 'de reste, dans les 0,5 % permis',
	coinNote: { coin: 'Une pièce vaut 100 MD.', step: 'Un pas vaut 5 % du projet du poste.' },
	lockedTitle: 'Dépensé avant de commencer',
	lockedBody: (d, r) => `Les intérêts de la dette (${d} MD) et la réserve pour imprévus (${r} MD) sont dus. Ils ne bougent pas.`,
	legendPlan: 'Projet de l’État 2027',
	legendYours: 'Le vôtre',
	scale: (m) => `Une seule échelle pour tous les postes, de 0 à ${m} MD`,
	howTo: {
		coin: 'Glissez un poste sur un autre pour déplacer 100 MD. Maintenez pour continuer. Ou choisissez un poste et utilisez Retirer et Verser.',
		step: 'Glissez un poste sur un autre pour déplacer un pas. L’écart entre les deux pas reste dans la bourse.'
	},
	keys: 'Clavier : flèches pour choisir, moins retire, plus verse, Entrée prend l’argent à déplacer, Échap le repose.',
	pick: 'Choisissez un poste, ou glissez-en un sur un autre.',
	plan: 'Projet',
	yours: 'Le vôtre',
	change: 'Écart',
	more: 'plus que le projet',
	less: 'moins que le projet',
	same: 'comme le projet',
	take: (a) => `Retirer ${a}`,
	give: (a) => `Verser ${a}`,
	takeAria: (a, n) => `Retirer ${a} MD de ${n} vers la bourse`,
	giveAria: (a, n) => `Verser ${a} MD de la bourse à ${n}`,
	rowAria: (n, p, y, c) => `${n}. Projet ${p} MD. Le vôtre ${y} MD. ${c}.`,
	refusal: (why, n, purse, step) =>
		why === 'zero'
			? `${n} est à zéro. Il n’y a plus rien à retirer.`
			: why === 'cap'
				? `${n} est à 200 % de son projet. Versez ailleurs.`
				: why === 'self'
					? 'Déposez l’argent sur un autre poste.'
					: step
						? `La bourse contient ${purse} MD et un pas de ${n} vaut ${step} MD. Retirez d’abord d’un autre poste.`
						: 'La bourse est vide. Retirez d’abord d’un poste, ou glissez un poste sur un autre.',
	took: (a, n) => `${a} MD retirés de ${n}.`,
	gave: (a, n) => `${a} MD versés à ${n}.`,
	moved: (a, f, t) => `${a} MD déplacés de ${f} vers ${t}.`,
	movedStep: (o, i, f, t) => `${o} MD sortis de ${f}, ${i} MD arrivés à ${t}.`,
	kept: 'Retour au projet.',
	carrying: (a, n) => `${a} MD en main, depuis ${n}`,
	carryingPurse: (a) => `${a} MD en main, depuis la bourse`,
	dropHere: 'Déposez sur un poste, ou sur la bourse',
	undo: 'Annuler',
	reset: 'Recommencer',
	keep: 'Garder le projet',
	table: 'Tableau',
	bars: 'Plateau',
	finish: 'Terminer',
	finishNeeds: (a) => `Placez ${a} MD pour terminer`,
	ready: 'Chaque dinar est placé. Vous pouvez terminer.',
	readyBand: 'La bourse est dans la marge de 0,5 %. Vous pouvez terminer ; le reste n’est pas placé.',
	moves: 'Mouvements',
	noMoves: 'Aucun mouvement.',
	th: { system: 'Poste', plan: 'Projet, MD', yours: 'Le vôtre, MD', md: 'Écart, MD', pct: 'Écart, %' },
	total: 'Total',
	unit: 'MD',
	back: 'Retour à la page de l’étude'
};

const ar: BoardCopy = {
	interim: 'ترجمة مؤقتة، لم تُراجع بعد.',
	title: 'ميزانيتك لسنة 2027',
	badge: 'نموذج أولي · أرقام مؤقتة · لا يُرسل شيء',
	rule: { coin: 'القاعدة أ: قطع من 100 مليون دينار (الافتراضية)', step: 'القاعدة ب: خطوات من 5% (تجربة)' },
	purse: 'المحفظة',
	purseEmpty: 'فارغة. كل دينار في مكانه.',
	purseToPlace: 'يجب توزيعها قبل الإنهاء',
	purseLeftover: 'متبقية، ضمن نسبة 0.5% المسموح بها',
	coinNote: { coin: 'القطعة الواحدة تساوي 100 مليون دينار.', step: 'الخطوة تساوي 5% من مخصص القطاع في المشروع.' },
	lockedTitle: 'مصروف قبل أن تبدأ',
	lockedBody: (d, r) => `فوائد الدين (${d} م.د) والاحتياطي للنفقات الطارئة (${r} م.د) واجبة الدفع. لا يمكن تحريكها.`,
	legendPlan: 'مشروع الدولة 2027',
	legendYours: 'توزيعك',
	scale: (m) => `سلّم واحد لكل القطاعات، من 0 إلى ${m} م.د`,
	howTo: {
		coin: 'اسحب قطاعًا وأفلته على قطاع آخر لنقل 100 م.د. واصل الضغط ليستمر النقل. أو اختر قطاعًا واستعمل «خذ» و«أعطِ».',
		step: 'اسحب قطاعًا وأفلته على قطاع آخر لنقل خطوة واحدة. يبقى الفرق بين الخطوتين في المحفظة.'
	},
	keys: 'لوحة المفاتيح: الأسهم لاختيار قطاع، الناقص يأخذ، الزائد يعطي، Enter يحمل المال لنقله، Escape يعيده.',
	pick: 'اختر قطاعًا، أو اسحب قطاعًا على آخر.',
	plan: 'المشروع',
	yours: 'توزيعك',
	change: 'الفرق',
	more: 'أكثر من المشروع',
	less: 'أقل من المشروع',
	same: 'مثل المشروع',
	take: (a) => `خذ ${a}`,
	give: (a) => `أعطِ ${a}`,
	takeAria: (a, n) => `خذ ${a} م.د من ${n} إلى المحفظة`,
	giveAria: (a, n) => `أعطِ ${a} م.د من المحفظة إلى ${n}`,
	rowAria: (n, p, y, c) => `${n}. المشروع ${p} م.د. توزيعك ${y} م.د. ${c}.`,
	refusal: (why, n, purse, step) =>
		why === 'zero'
			? `${n} عند الصفر. لم يبق شيء لتأخذه.`
			: why === 'cap'
				? `${n} بلغ 200% من مخصصه في المشروع. أعطِ قطاعًا آخر.`
				: why === 'self'
					? 'أفلت المال على قطاع آخر.'
					: step
						? `في المحفظة ${purse} م.د، وخطوة ${n} تساوي ${step} م.د. خذ من قطاع آخر أولًا.`
						: 'المحفظة فارغة. خذ من قطاع أولًا، أو اسحب قطاعًا على آخر.',
	took: (a, n) => `أخذت ${a} م.د من ${n}.`,
	gave: (a, n) => `أعطيت ${a} م.د إلى ${n}.`,
	moved: (a, f, t) => `نقلت ${a} م.د من ${f} إلى ${t}.`,
	movedStep: (o, i, f, t) => `خرج ${o} م.د من ${f}، ووصل ${i} م.د إلى ${t}.`,
	kept: 'عدت إلى المشروع.',
	carrying: (a, n) => `تحمل ${a} م.د من ${n}`,
	carryingPurse: (a) => `تحمل ${a} م.د من المحفظة`,
	dropHere: 'أفلت على قطاع، أو على المحفظة',
	undo: 'تراجع',
	reset: 'ابدأ من جديد',
	keep: 'أبقِ المشروع',
	table: 'جدول',
	bars: 'اللوحة',
	finish: 'إنهاء',
	finishNeeds: (a) => `وزّع ${a} م.د لتنهي`,
	ready: 'كل دينار في مكانه. يمكنك الإنهاء.',
	readyBand: 'المحفظة داخل هامش 0.5%. يمكنك الإنهاء، وما تبقّى يبقى غير موضوع.',
	moves: 'الحركات',
	noMoves: 'لا حركة بعد.',
	th: { system: 'القطاع', plan: 'المشروع، م.د', yours: 'توزيعك، م.د', md: 'الفرق، م.د', pct: 'الفرق، %' },
	total: 'المجموع',
	unit: 'م.د',
	back: 'العودة إلى صفحة الدراسة'
};

const COPY: Record<Locale, BoardCopy> = { en, fr, ar };

export function boardCopyFor(locale: Locale): BoardCopy {
	return COPY[locale] ?? en;
}
