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
	studyPage: string;
	/** Past years: the adopted laws of 2024 to 2026, shown beside the 2027 draft. */
	pastYears: string;
	pastYearsToggle: string;
	yearByYear: string;
	draftYear: string;
	since: (year: string) => string;
	historyNote: string;
	historyAria: (list: string) => string;
	/** Lines whose past years are built differently from 2027, and why. */
	historyCaveat: Partial<Record<'subsidies_energy' | 'subsidies_food' | 'energy_trade' | 'rest' | 'police' | 'environment', string>>;
	/** Visible text under the legend: past years are nominal dinars and the 2027 subsidy split is derived. */
	nominalNote: string;
	derivedShort: string;
	basketShort: string;
	historyDefinitions: string;
	/** The explicit keep-draft control. */
	keepTick: string;
	keepTickNote: string;
	keepTickHint: string;
	finishNeedsChoice: string;
	readyChoice: string;
	nominalShort: string;
	/** Detail panel. */
	details: string;
	detailsClose: string;
	madeOf: string;
	programmes2026: string;
	programmesNote: string;
	noProgrammes: string;
	setTo2024: string;
	setToDraft: string;
	zeroLine: string;
	setTo: (amount: string, name: string) => string;
	setCapped: (wanted: string, cap: string) => string;
	setRefused: (amount: string) => string;
	historyNominal: (pct: string) => string;
	/** Phone-first instruction. */
	howToPhone: string;
	yearLegend: string;
}

const en: BoardCopy = {
	interim: null,
	title: 'Your 2027 budget',
	badge: 'Prototype · draft figures · nothing is sent',
	rule: { coin: 'Rule A: coins of 100 MD (default)', step: 'Rule B: steps of 5% (owner test)' },
	purse: 'Purse',
	purseEmpty: 'Empty. Nothing is waiting.',
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
	kept: 'The draft is kept. Finish is open.',
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
	back: 'Back to the study page',
	studyPage: 'Study page',
	pastYears: 'Past years',
	pastYearsToggle: 'Show past years',
	yearByYear: 'Year by year',
	draftYear: '2027 draft',
	since: (y) => `Since ${y}:`,
	historyNote: 'Past years are the budgets as voted in each finance law (Journal Officiel, tableau C). Dinars of each year, not adjusted for inflation.',
	historyAria: (l) => `Past years: ${l}.`,
	historyCaveat: {
		subsidies_energy: 'Past years count the energy programme of Industry, Mines and Energy, which holds most fuel and electricity subsidies. The 2027 split between fuel and food is derived, not reported.',
		subsidies_food: 'Past years count the domestic trade programme of Commerce, which holds most basic food subsidies. The 2027 split between fuel and food is derived, not reported.',
		energy_trade: 'Past years: the Industry and Commerce missions less their energy and domestic trade programmes.',
		rest: 'Past years add up the same missions from each law.',
		police: '2020 counts local affairs here, moved from the 2020 environment mission, so the police series matches 2022 to 2026. The 2020 source is page 4445.',
		environment: '2020 keeps only the environment programme. The 2020 law put local affairs in the same mission; it is counted under police here to match 2022 to 2026.'
	},
	nominalNote: 'Dinars of each year, not adjusted for inflation.',
	derivedShort: '2027 subsidy split is derived.',
	basketShort: 'The 2027 memo is all subsidy types; past years are the two programmes that hold most of them.',
	historyDefinitions: 'Past years are the adopted laws. The 2027 memo covers all subsidy types; the past years count the two programmes that hold most of them, so the 2026 to 2027 step is a change of basket, not only a policy change. The 2027 split between fuel and food is derived from the two ministry lines that contain the memo; the split by type has not been reported.',
	keepTick: 'I would keep the draft exactly as it is',
	keepTickNote: 'This is a real answer, not a skip. Ticking it puts every line back on the draft; Finish then opens.',
	keepTickHint: 'Puts every line back.',
	finishNeedsChoice: 'Move money, or tick that you would keep the draft',
	readyChoice: 'The draft is fully placed. Move money, or tick that you would keep it.',
	nominalShort: '(nominal)',
	details: 'Details',
	detailsClose: 'Close',
	madeOf: 'Made of',
	programmes2026: 'In the 2026 adopted law',
	programmesNote: 'Printed programme labels from the French translation.',
	noProgrammes: 'The 2026 programme detail for this line has not been read yet.',
	setTo2024: 'Set to the 2024 level',
	setToDraft: 'Set back to the draft',
	zeroLine: 'Set this line to zero',
	setTo: (amount, name) => `Set ${name} to ${amount} MD.`,
	setCapped: (wanted, cap) => `That level is ${wanted} MD; the 200% cap is ${cap} MD. Set to ${cap}.`,
	setRefused: (amount) => `The purse holds ${amount} MD. That change needs more.`,
	historyNominal: (pct) => `Since 2024: ${pct}% (nominal)`,
	howToPhone: 'Tap a system, then hold Take. Or drag one system onto another on a desk.',
	yearLegend: 'Dots: past years, oldest first. The mark is the 2027 draft.'
};

const fr: BoardCopy = {
	interim: 'Traduction provisoire, non relue.',
	title: 'Votre budget 2027',
	badge: 'Prototype · chiffres provisoires · rien n’est envoyé',
	rule: { coin: 'Règle A : pièces de 100 MD (par défaut)', step: 'Règle B : pas de 5 % (essai)' },
	purse: 'Bourse',
	purseEmpty: 'Vide. Rien n’attend.',
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
	kept: 'Le projet est conservé. Terminer est ouvert.',
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
	back: 'Retour à la page de l’étude',
	studyPage: 'Page de l’étude',
	pastYears: 'Années passées',
	pastYearsToggle: 'Afficher les années passées',
	yearByYear: 'Année par année',
	draftYear: 'Projet 2027',
	since: (y) => `Depuis ${y} :`,
	historyNote: "Les années passées sont les budgets votés dans chaque loi de finances (Journal officiel, tableau C). Dinars de chaque année, sans correction de l'inflation.",
	historyAria: (l) => `Années passées : ${l}.`,
	historyCaveat: {
		subsidies_energy: "Pour les années passées : le programme énergie de l'Industrie, des Mines et de l'Énergie, qui porte l'essentiel du soutien au carburant et à l'électricité. La répartition 2027 entre carburant et alimentation est dérivée, non publiée.",
		subsidies_food: "Pour les années passées : le programme commerce intérieur du Commerce, qui porte l'essentiel du soutien alimentaire. La répartition 2027 entre carburant et alimentation est dérivée, non publiée.",
		energy_trade: 'Pour les années passées : les missions Industrie et Commerce moins leurs programmes énergie et commerce intérieur.',
		rest: 'Pour les années passées : la somme des mêmes missions dans chaque loi.',
		police: '2020 compte ici les affaires locales, déplacées de la mission environnement de 2020, pour que la série police corresponde à 2022-2026. Source : page 4445.',
		environment: '2020 ne garde que le programme environnement. La loi de 2020 mettait les affaires locales dans la même mission ; elles sont comptées sous police ici pour correspondre à 2022-2026.'
	},
	nominalNote: 'Dinars de chaque année, sans correction de l’inflation.',
	derivedShort: 'La répartition 2027 des subventions est dérivée.',
	basketShort: "La note 2027 couvre tous les types de subventions ; les années passées sont les deux programmes qui en portent l'essentiel.",
	historyDefinitions: "Les années passées sont les lois adoptées. La note 2027 couvre tous les types de subventions ; les années passées comptent les deux programmes qui en portent l'essentiel, donc le saut de 2026 à 2027 est un changement de panier, pas seulement de politique. La répartition 2027 entre carburant et alimentation est dérivée des deux lignes ministérielles qui contiennent la note ; la répartition par type n'est pas publiée.",
	keepTick: 'Je garderais le projet exactement tel quel',
	keepTickNote: "C'est une vraie réponse, pas un saut. La cocher remet chaque poste au projet ; Terminer s'ouvre alors.",
	keepTickHint: 'Remet chaque poste au projet.',
	finishNeedsChoice: 'Déplacez de l’argent, ou cochez que vous garderiez le projet',
	readyChoice: 'Le projet est entièrement placé. Déplacez de l’argent, ou cochez que vous le garderiez.',
	nominalShort: '(nominal)',
	details: 'Détails',
	detailsClose: 'Fermer',
	madeOf: 'Composé de',
	programmes2026: 'Dans la loi adoptée de 2026',
	programmesNote: 'Libellés imprimés de la traduction française.',
	noProgrammes: "Le détail des programmes 2026 de ce poste n'a pas encore été lu.",
	setTo2024: 'Mettre au niveau de 2024',
	setToDraft: 'Revenir au projet',
	zeroLine: 'Mettre ce poste à zéro',
	setTo: (amount, name) => `Mettre ${name} à ${amount} MD.`,
	setCapped: (wanted, cap) => `Ce niveau est ${wanted} MD ; le plafond de 200 % est ${cap} MD. Mis à ${cap}.`,
	setRefused: (amount) => `La bourse contient ${amount} MD. Ce changement en demande plus.`,
	historyNominal: (pct) => `Depuis 2024 : ${pct} % (nominal)`,
	howToPhone: 'Touchez un poste, puis maintenez Retirer. Ou glissez un poste sur un autre sur un ordinateur.',
	yearLegend: 'Points : années passées, de la plus ancienne à la plus récente. Le repère est le projet 2027.'
};

const ar: BoardCopy = {
	interim: 'ترجمة مؤقتة، لم تُراجع بعد.',
	title: 'ميزانيتك لسنة 2027',
	badge: 'نموذج أولي · أرقام مؤقتة · لا يُرسل شيء',
	rule: { coin: 'القاعدة أ: قطع من 100 مليون دينار (الافتراضية)', step: 'القاعدة ب: خطوات من 5% (تجربة)' },
	purse: 'المحفظة',
	purseEmpty: 'فارغة. لا شيء ينتظر.',
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
	kept: 'أُبقي على المشروع. الإنهاء متاح.',
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
	back: 'العودة إلى صفحة الدراسة',
	studyPage: 'صفحة الدراسة',
	pastYears: 'السنوات الماضية',
	pastYearsToggle: 'إظهار السنوات الماضية',
	yearByYear: 'سنة بسنة',
	draftYear: 'مشروع 2027',
	since: (y) => `منذ ${y}:`,
	historyNote: 'السنوات الماضية هي الميزانيات كما صودق عليها في كل قانون مالية (الرائد الرسمي، جدول نفقات ميزانية الدولة). بدنانير كل سنة، دون احتساب التضخّم.',
	historyAria: (l) => `السنوات الماضية: ${l}.`,
	historyCaveat: {
		subsidies_energy: 'للسنوات الماضية: برنامج الطاقة في وزارة الصناعة والمناجم والطاقة، وفيه معظم دعم المحروقات والكهرباء. تقسيم 2027 بين المحروقات والغذاء مشتقّ وغير منشور.',
		subsidies_food: 'للسنوات الماضية: برنامج التجارة الداخلية في وزارة التجارة، وفيه معظم الدعم الغذائي. تقسيم 2027 بين المحروقات والغذاء مشتقّ وغير منشور.',
		energy_trade: 'للسنوات الماضية: مهمّتا الصناعة والتجارة ناقص برنامجي الطاقة والتجارة الداخلية.',
		rest: 'للسنوات الماضية: مجموع المهام نفسها في كل قانون.',
		police: 'تحسب 2020 الشؤون المحلية هنا، وقد نُقلت من مهمة البيئة لسنة 2020، لتطابق سلسلة الشرطة سنوات 2022 إلى 2026. المصدر: صفحة 4445.',
		environment: 'تحتفظ 2020 ببرنامج البيئة فقط. قانون 2020 وضع الشؤون المحلية في المهمة نفسها؛ وتُحسب هنا تحت الشرطة لتطابق 2022 إلى 2026.'
	},
	nominalNote: 'بدنانير كل سنة، دون احتساب التضخّم.',
	derivedShort: 'تقسيم 2027 للدعم مشتقّ.',
	basketShort: 'مذكرة 2027 تشمل كل أنواع الدعم؛ والسنوات الماضية هي البرنامجان اللذان يحملان معظمه.',
	historyDefinitions: 'السنوات الماضية هي القوانين المصادق عليها. مذكرة 2027 تشمل كل أنواع الدعم؛ والسنوات الماضية تحسب البرنامجين اللذين يحملان معظمه، فقفزة 2026 إلى 2027 تغيّر السلة وليست تغيّر سياسة فقط. تقسيم 2027 بين المحروقات والغذاء مشتقّ من بندي الوزارتين اللذين يحتويان المذكرة؛ والتقسيم حسب النوع لم يُنشر.',
	keepTick: 'أبقي على المشروع كما هو تمامًا',
	keepTickNote: 'هذه إجابة حقيقية، ليست تخطّيًا. تأشيرها يعيد كل بند إلى المشروع، ثم يُتاح الإنهاء.',
	keepTickHint: 'يعيد كل بند إلى المشروع.',
	finishNeedsChoice: 'حرّك المال، أو أشّر أنك ستبقي المشروع',
	readyChoice: 'المشروع موضوع بالكامل. حرّك المال، أو أشّر أنك ستبقيه.',
	nominalShort: '(اسمي)',
	details: 'التفاصيل',
	detailsClose: 'إغلاق',
	madeOf: 'يتكوّن من',
	programmes2026: 'في قانون 2026 المصادق عليه',
	programmesNote: 'عناوين البرامج كما وردت في الترجمة الفرنسية.',
	noProgrammes: 'تفاصيل برامج 2026 لهذا البند لم تُقرأ بعد.',
	setTo2024: 'اضبط على مستوى 2024',
	setToDraft: 'أعد إلى المشروع',
	zeroLine: 'اجعل هذا البند صفرًا',
	setTo: (amount, name) => `اضبط ${name} على ${amount} م.د.`,
	setCapped: (wanted, cap) => `هذا المستوى ${wanted} م.د؛ وسقف 200% هو ${cap} م.د. ضُبط على ${cap}.`,
	setRefused: (amount) => `في المحفظة ${amount} م.د. هذا التغيير يحتاج أكثر.`,
	historyNominal: (pct) => `منذ 2024: ${pct}% (اسمي)`,
	howToPhone: 'اختر بندًا، ثم اضغط مطوّلًا على «خذ». أو اسحب بندًا على آخر على الحاسوب.',
	yearLegend: 'نقاط: السنوات الماضية، من الأقدم إلى الأحدث. العلامة هي مشروع 2027.'
};

const COPY: Record<Locale, BoardCopy> = { en, fr, ar };

export function boardCopyFor(locale: Locale): BoardCopy {
	return COPY[locale] ?? en;
}
