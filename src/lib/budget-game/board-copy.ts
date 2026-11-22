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
	/** The compared past year, named on the legend and in the row's aria label. */
	legendPast: (year: string) => string;
	legendPastNone: string;
	/** The trend chart sheet. */
	chartOpen: string;
	chartHeading: string;
	/** The label of the citizen's point on the chart: short enough for one column. */
	chartYou: string;
	chartHint: string;
	chartChange: (from: string, pct: string) => string;
	chartAria: (list: string) => string;
	/** The budget-wide tax dependence of the compared year, on the board and in the chart. */
	taxLine: (year: string, per100: string, covered: string) => string;
	taxDefinition: string;
	taxPage: (page: string) => string;
	/** The JORT audit of the compared cell: page citation and status, in words. */
	jort: (year: string, from: string, to: string | null) => string;
	verifiedCell: (label: string) => string;
	derivedCell: (label: string) => string;
	singleCell: (label: string) => string;
	verifiedTitle: string;
	verifiedWords: Record<'verified' | 'derived' | 'single', string>;
	singleNote: (year: string, name: string, amount: string, page: string) => string;
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
	historyAria: (year: string, amount: string, unit: string) => string;
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
	pageLabel: string;
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
	/**
	 * The how-to-play sheet. It explains the mechanics only. Whether an answer
	 * is collected is said on the About step, which reads the study state; this
	 * sheet points there and never says it itself.
	 */
	guide: GuideCopy;
}

export interface GuideCopy {
	open: string;
	heading: string;
	lead: string;
	purseTitle: string;
	purseBody: string;
	moveTitle: string;
	phoneLabel: string;
	keysLabel: string;
	limitsTitle: string;
	limitsBody: string;
	rowsTitle: string;
	rowsBody: string;
	undoTitle: string;
	undoBody: string;
	finishTitle: string;
	finishBody: (keepTick: string) => string;
	afterTitle: string;
	afterBody: string;
	figuresTitle: string;
	figuresBody: string;
	answerTitle: string;
	answerBody: string;
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
	legendPlan: '2027 draft',
	legendYours: 'Yours',
	legendPast: (year) => `${year} law`,
	legendPastNone: 'No past year',
	chartOpen: 'Year by year chart',
	chartHeading: 'Year by year',
	chartYou: 'You',
	chartHint: 'Choose a year to compare it in the rows.',
	chartChange: (from, pct) => `From ${from} to the 2027 draft: ${pct} (nominal)`,
	chartAria: (list) => `Year by year: ${list}.`,
	taxLine: (year, per100, covered) => `${year}: tax was ${per100} dinars of every 100 the state raised itself, and covered ${covered}% of spending.`,
	taxDefinition: 'Tax per 100 raised is tax receipts divided by tax plus non-tax receipts; grants and borrowing are not money the state raises itself. Spending covered by tax is tax receipts divided by the credits of the same law.',
	taxPage: (page) => `Article premier and Article 2, p. ${page}.`,
	jort: (year, from, to) => (to ? `JORT ${year}, pp. ${from} to ${to}` : `JORT ${year}, p. ${from}`),
	verifiedCell: (label) => `Verified against the law, ${label}.`,
	derivedCell: (label) => `Derived from verified figures, ${label}.`,
	singleCell: (label) => `Derived, one component read once, ${label}.`,
	verifiedTitle: 'Checked against the law',
	verifiedWords: { verified: 'verified', derived: 'derived from verified figures', single: 'one component read once' },
	singleNote: (year, name, amount, page) => `${year} · ${name}: ${amount} MD, p. ${page}, read once.`,
	scale: (max) => `One scale, 0 to ${max} MD`,
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
	historyAria: (year, amount, unit) => `${year} adopted law: ${amount} ${unit}.`,
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
	basketShort: 'The 2027 memo is a press total; past years are two programme lines.',
	historyDefinitions: 'Past years are the adopted laws. The 2027 memo is a press total; past years are two programme lines. If the 2027 memo sits wholly inside Industry and Trade, as assumed here, energy can only fall between 7,617.4 and 7,890.2 MD. The split between fuel and food is derived, not reported; the apportionment is within 177.6 MD of any split that keeps both lines non-negative.',
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
	pageLabel: 'p.',
	noProgrammes: 'The 2026 programme detail for this line has not been read yet.',
	setTo2024: 'Prototype aid: 2024 level',
	setToDraft: 'Set back to the draft',
	zeroLine: 'Set this line to zero',
	setTo: (amount, name) => `Set ${name} to ${amount} MD.`,
	setCapped: (wanted, cap) => `That level is ${wanted} MD; the 200% cap is ${cap} MD. Set to ${cap}.`,
	setRefused: (amount) => `The purse holds ${amount} MD. That change needs more.`,
	historyNominal: (pct) => `Since 2024: ${pct}% (nominal)`,
	howToPhone: 'Tap a system, then hold Take. Or drag one system onto another on a desk.',
	yearLegend: 'The vertical mark is the 2027 draft level. Every past year is checked against its law.',
	guide: {
		open: 'How to play',
		heading: 'How to play',
		lead: 'The board holds the 2027 draft budget, split into systems such as health, schools and the police. Share it the way you think it should be shared. The total stays the same: you move money between systems, you never add any. There is no right answer and no score.',
		purseTitle: 'The purse',
		purseBody: 'Money you take out of a system goes into the purse. From the purse you give it to another system. You cannot give what the purse does not hold.',
		moveTitle: 'Moving money',
		phoneLabel: 'On a phone:',
		keysLabel: 'With a keyboard:',
		limitsTitle: 'Limits',
		limitsBody: 'A system can go down to zero, and up to twice its plan. Debt interest and the unforeseen reserve are owed before you start, so they cannot be moved.',
		rowsTitle: 'Reading a row',
		rowsBody: 'Each row shows the 2027 draft (Plan), your amount (Yours) and the change. A third bar shows what a past finance law gave the same system; the year buttons above the rows choose which year. Choose a system and open Details to see what it is made of in the 2026 law, with the Journal Officiel pages. The chart button shows one system year by year; the table button shows every system as numbers.',
		undoTitle: 'Changing your mind',
		undoBody: 'Undo takes back your last move. Start again puts every system back on the draft.',
		finishTitle: 'Finishing',
		finishBody: (keepTick) => `Finish opens when every dinar is placed, or when what is left in the purse is under 0.5% of the budget. If you would change nothing, tick “${keepTick}”. That is a real answer, not a skip, and Finish opens.`,
		afterTitle: 'After the board',
		afterBody: 'Two short questions, then a result that sets your budget beside the draft and names your biggest rise and your biggest cut.',
		figuresTitle: 'About the figures',
		figuresBody: 'The 2027 figures are a draft reported by the press, not verified. Past years are the budgets as voted in each finance law, in dinars of each year, not adjusted for inflation.',
		answerTitle: 'What happens to your answer',
		answerBody: 'The About step, before the board, says whether answers are being collected, what is kept and how to withdraw.'
	}
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
	legendPlan: 'Projet 2027',
	legendYours: 'Le vôtre',
	legendPast: (year) => `Loi ${year}`,
	legendPastNone: 'Aucune année passée',
	chartOpen: 'Courbe année par année',
	chartHeading: 'Année par année',
	chartYou: 'Vous',
	chartHint: 'Choisissez une année pour la comparer dans les lignes.',
	chartChange: (from, pct) => `De ${from} au projet 2027 : ${pct} (nominal)`,
	chartAria: (list) => `Année par année : ${list}.`,
	taxLine: (year, per100, covered) => `${year} : l'impôt représentait ${per100} dinars sur 100 que l'État prélève lui-même, et couvrait ${covered} % des dépenses.`,
	taxDefinition: "L'impôt pour 100 prélevés est l'impôt divisé par l'impôt plus les recettes non fiscales ; les dons et l'emprunt ne sont pas de l'argent que l'État prélève lui-même. La part des dépenses couverte par l'impôt est l'impôt divisé par les crédits de la même loi.",
	taxPage: (page) => `Article premier et article 2, p. ${page}.`,
	jort: (year, from, to) => (to ? `JORT ${year}, p. ${from} à ${to}` : `JORT ${year}, p. ${from}`),
	verifiedCell: (label) => `Vérifié sur la loi, ${label}.`,
	derivedCell: (label) => `Dérivé de chiffres vérifiés, ${label}.`,
	singleCell: (label) => `Dérivé, un élément lu une seule fois, ${label}.`,
	verifiedTitle: 'Vérifié sur la loi',
	verifiedWords: { verified: 'vérifié', derived: 'dérivé de chiffres vérifiés', single: 'un élément lu une seule fois' },
	singleNote: (year, name, amount, page) => `${year} · ${name} : ${amount} MD, p. ${page}, lu une seule fois.`,
	scale: (m) => `Une échelle, de 0 à ${m} MD`,
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
	historyAria: (year, amount, unit) => `Loi adoptée de ${year} : ${amount} ${unit}.`,
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
	basketShort: "La note 2027 est un total de presse ; les années passées sont deux lignes de programme.",
	historyDefinitions: "Les années passées sont les lois adoptées. La note 2027 est un total de presse ; les années passées sont deux lignes de programme. Si la note 2027 se situe entièrement dans l'Industrie et le Commerce, comme on le suppose ici, l'énergie ne peut tomber qu'entre 7 617,4 et 7 890,2 MD. La répartition entre carburant et alimentation est dérivée, non publiée ; elle est à 177,6 MD près de toute répartition qui garde les deux lignes non négatives.",
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
	pageLabel: 'p.',
	noProgrammes: "Le détail des programmes 2026 de ce poste n'a pas encore été lu.",
	setTo2024: 'Aide au prototype : niveau 2024',
	setToDraft: 'Revenir au projet',
	zeroLine: 'Mettre ce poste à zéro',
	setTo: (amount, name) => `Mettre ${name} à ${amount} MD.`,
	setCapped: (wanted, cap) => `Ce niveau est ${wanted} MD ; le plafond de 200 % est ${cap} MD. Mis à ${cap}.`,
	setRefused: (amount) => `La bourse contient ${amount} MD. Ce changement en demande plus.`,
	historyNominal: (pct) => `Depuis 2024 : ${pct} % (nominal)`,
	howToPhone: 'Touchez un poste, puis maintenez Retirer. Ou glissez un poste sur un autre sur un ordinateur.',
	yearLegend: 'Le repère vertical est le niveau du projet 2027. Chaque année passée est vérifiée sur sa loi.',
	guide: {
		open: 'Comment jouer',
		heading: 'Comment jouer',
		lead: 'Le plateau contient le projet de budget 2027, réparti en postes comme la santé, l’école ou la police. Répartissez-le comme vous pensez qu’il devrait l’être. Le total ne change pas : vous déplacez de l’argent entre les postes, vous n’en ajoutez jamais. Il n’y a ni bonne réponse ni score.',
		purseTitle: 'La bourse',
		purseBody: 'L’argent que vous retirez d’un poste va dans la bourse. Depuis la bourse, vous le versez à un autre poste. Vous ne pouvez pas verser ce que la bourse ne contient pas.',
		moveTitle: 'Déplacer de l’argent',
		phoneLabel: 'Sur un téléphone :',
		keysLabel: 'Au clavier :',
		limitsTitle: 'Limites',
		limitsBody: 'Un poste peut descendre jusqu’à zéro et monter jusqu’au double de son projet. Les intérêts de la dette et la réserve pour imprévus sont dus avant de commencer : ils ne peuvent pas être déplacés.',
		rowsTitle: 'Lire une ligne',
		rowsBody: 'Chaque ligne montre le projet 2027 (Projet), votre montant (Le vôtre) et l’écart. Une troisième barre montre ce qu’une loi de finances passée a donné au même poste ; les boutons d’année au-dessus des lignes choisissent l’année. Choisissez un poste et ouvrez Détails pour voir de quoi il est fait dans la loi 2026, avec les pages du Journal officiel. Le bouton de courbe montre un poste année par année ; le bouton Tableau montre tous les postes en chiffres.',
		undoTitle: 'Changer d’avis',
		undoBody: 'Annuler reprend votre dernier mouvement. Recommencer remet chaque poste au projet.',
		finishTitle: 'Terminer',
		finishBody: (keepTick) => `Terminer s’ouvre quand chaque dinar est placé, ou quand ce qui reste dans la bourse est sous 0,5 % du budget. Si vous ne changeriez rien, cochez « ${keepTick} ». C’est une vraie réponse, pas un saut, et Terminer s’ouvre.`,
		afterTitle: 'Après le plateau',
		afterBody: 'Deux questions courtes, puis un résultat qui place votre budget à côté du projet et nomme votre plus forte hausse et votre plus forte baisse.',
		figuresTitle: 'À propos des chiffres',
		figuresBody: 'Les chiffres 2027 sont un projet rapporté par la presse, non vérifié. Les années passées sont les budgets votés dans chaque loi de finances, en dinars de chaque année, sans correction de l’inflation.',
		answerTitle: 'Ce que devient votre réponse',
		answerBody: 'L’étape Présentation, avant le plateau, indique si les réponses sont recueillies, ce qui est conservé et comment se retirer.'
	}
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
	legendPlan: 'مشروع 2027',
	legendYours: 'توزيعك',
	legendPast: (year) => `قانون ${year}`,
	legendPastNone: 'لا سنة ماضية',
	chartOpen: 'منحنى سنة بسنة',
	chartHeading: 'سنة بسنة',
	chartYou: 'أنت',
	chartHint: 'اختر سنة لمقارنتها في الأسطر.',
	chartChange: (from, pct) => `من ${from} إلى مشروع 2027: ${pct} (اسمي)`,
	chartAria: (list) => `سنة بسنة: ${list}.`,
	taxLine: (year, per100, covered) => `${year}: كانت الضريبة ${per100} دينارًا من كل 100 دينار تجمعها الدولة بنفسها، وغطّت ${covered}% من النفقات.`,
	taxDefinition: 'الضريبة من كل 100 دينار مجمّعة هي الضريبة مقسومة على الضريبة زائد الإيرادات غير الجبائية؛ والهبات والاقتراض ليست أموالًا تجمعها الدولة بنفسها. وحصة النفقات التي تغطيها الضريبة هي الضريبة مقسومة على اعتمادات القانون نفسه.',
	taxPage: (page) => `الفصل الأول والفصل 2، ص. ${page}.`,
	jort: (year, from, to) => (to ? `الرائد ${year}، ص. ${from} إلى ${to}` : `الرائد ${year}، ص. ${from}`),
	verifiedCell: (label) => `مُتحقَّق منه على القانون، ${label}.`,
	derivedCell: (label) => `مشتقّ من أرقام مُتحقَّق منها، ${label}.`,
	singleCell: (label) => `مشتقّ، عنصر واحد قُرئ مرة واحدة، ${label}.`,
	verifiedTitle: 'مُتحقَّق منه على القانون',
	verifiedWords: { verified: 'مُتحقَّق منه', derived: 'مشتقّ من أرقام مُتحقَّق منها', single: 'عنصر واحد قُرئ مرة واحدة' },
	singleNote: (year, name, amount, page) => `${year} · ${name}: ${amount} م.د، ص. ${page}، قُرئ مرة واحدة.`,
	scale: (m) => `سلّم واحد، من 0 إلى ${m} م.د`,
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
	historyAria: (year, amount, unit) => `قانون ${year} المصادق عليه: ${amount} ${unit}.`,
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
	basketShort: 'مذكرة 2027 رقم صحفي إجمالي؛ والسنوات الماضية بندان برنامجيان.',
	historyDefinitions: 'السنوات الماضية هي القوانين المصادق عليها. مذكرة 2027 رقم صحفي إجمالي؛ والسنوات الماضية بندان برنامجيان. إذا كانت مذكرة 2027 تقع بالكامل داخل الصناعة والتجارة، كما يُفترض هنا، فلا يمكن أن تقلّ الطاقة عن 7,617.4 ولا تتجاوز 7,890.2 م.د. والتقسيم بين المحروقات والغذاء مشتقّ وغير منشور؛ وأي تقسيم يُبقي البندين غير سالبين لا يبعد عن هذا التوزيع أكثر من 177.6 م.د.',
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
	pageLabel: 'ص.',
	noProgrammes: 'تفاصيل برامج 2026 لهذا البند لم تُقرأ بعد.',
	setTo2024: 'أداة نموذج أولي: مستوى 2024',
	setToDraft: 'أعد إلى المشروع',
	zeroLine: 'اجعل هذا البند صفرًا',
	setTo: (amount, name) => `اضبط ${name} على ${amount} م.د.`,
	setCapped: (wanted, cap) => `هذا المستوى ${wanted} م.د؛ وسقف 200% هو ${cap} م.د. ضُبط على ${cap}.`,
	setRefused: (amount) => `في المحفظة ${amount} م.د. هذا التغيير يحتاج أكثر.`,
	historyNominal: (pct) => `منذ 2024: ${pct}% (اسمي)`,
	howToPhone: 'اختر بندًا، ثم اضغط مطوّلًا على «خذ». أو اسحب بندًا على آخر على الحاسوب.',
	yearLegend: 'العلامة العمودية هي مستوى مشروع 2027. وكل سنة ماضية مُتحقَّق منها على قانونها.',
	guide: {
		open: 'طريقة اللعب',
		heading: 'طريقة اللعب',
		lead: 'تضمّ اللوحة مشروع ميزانية 2027 موزّعًا على قطاعات مثل الصحة والتعليم والأمن. وزّعها كما ترى أنه يجب أن تُوزَّع. يبقى المجموع كما هو: تنقل المال بين القطاعات ولا تضيف إليه شيئًا. لا توجد إجابة صحيحة ولا نقاط.',
		purseTitle: 'المحفظة',
		purseBody: 'المال الذي تأخذه من قطاع يذهب إلى المحفظة. ومن المحفظة تعطيه لقطاع آخر. لا يمكنك أن تعطي ما ليس في المحفظة.',
		moveTitle: 'نقل المال',
		phoneLabel: 'على الهاتف:',
		keysLabel: 'بلوحة المفاتيح:',
		limitsTitle: 'الحدود',
		limitsBody: 'يمكن أن ينزل القطاع إلى الصفر وأن يرتفع إلى ضعف مخصّصه في المشروع. فوائد الدين واحتياطي النفقات الطارئة مستحقّة قبل أن تبدأ، فلا يمكن نقلها.',
		rowsTitle: 'قراءة السطر',
		rowsBody: 'يُظهر كل سطر مشروع 2027 وتوزيعك والفرق بينهما. ويُظهر شريط ثالث ما منحه قانون مالية سابق للقطاع نفسه، وتختار أزرار السنوات فوق السطور أيّ سنة. اختر قطاعًا وافتح «التفاصيل» لترى مكوّناته في قانون 2026 مع صفحات الرائد الرسمي. زرّ المنحنى يُظهر قطاعًا واحدًا سنة بسنة، وزرّ «جدول» يُظهر كل القطاعات بالأرقام.',
		undoTitle: 'إذا غيّرت رأيك',
		undoBody: '«تراجع» يلغي آخر نقلة. و«ابدأ من جديد» يعيد كل القطاعات إلى المشروع.',
		finishTitle: 'الإنهاء',
		finishBody: (keepTick) => `يُتاح «إنهاء» عندما يوضع كل دينار في مكانه، أو عندما يكون ما بقي في المحفظة أقل من 0.5% من الميزانية. وإذا كنت لن تغيّر شيئًا، فأشّر على «${keepTick}». هذه إجابة حقيقية وليست تخطّيًا، ويُتاح «إنهاء».`,
		afterTitle: 'بعد اللوحة',
		afterBody: 'سؤالان قصيران، ثم نتيجة تضع ميزانيتك بجانب المشروع وتذكر أكبر زيادة وأكبر تخفيض قمت بهما.',
		figuresTitle: 'عن الأرقام',
		figuresBody: 'أرقام 2027 مشروع نقلته الصحافة ولم يُتحقَّق منه. والسنوات الماضية هي الميزانيات كما صودق عليها في كل قانون مالية، بدنانير كل سنة ودون احتساب التضخّم.',
		answerTitle: 'ماذا يحدث لإجابتك',
		answerBody: 'تذكر خطوة «تعريف»، قبل اللوحة، إن كانت الإجابات تُجمع، وما الذي يُحفظ، وكيف تنسحب.'
	}
};

const COPY: Record<Locale, BoardCopy> = { en, fr, ar };

export function boardCopyFor(locale: Locale): BoardCopy {
	return COPY[locale] ?? en;
}
