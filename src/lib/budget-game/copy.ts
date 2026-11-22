/**
 * Copy for the citizen budget board (prototype).
 *
 * Every amount on screen is a draft figure from data/studies/dt-research-003/
 * figures-2027.yaml and is labelled "draft, not verified". The copy never
 * names a total or a ministry amount itself.
 *
 * French and Arabic are interim drafts, marked unreviewed on screen.
 */
import type { Locale } from '$lib/i18n';
import type { LineId } from './lines';

export type { LineId } from './lines';

export interface LineCopy {
	name: string;
	note: string;
}

export interface Copy {
	prototype: string;
	unreviewed: string | null;
	title: string;
	status: string;
	stepLabels: { intro: string; frame: string; board: string; items: string; card: string };
	intro: {
		whatWeAsk: string;
		whatWeAskBody: string;
		stored: string;
		storedBody: string;
		who: string;
		whoBody: string;
		figures: string;
		figuresBody: string;
		sample: string;
		sampleBody: string;
		consentAge: string;
		consentPrototype: string;
		consentRead: string;
		consentWithdrawal: string;
		consentNote: string;
		start: string;
		under18: string;
	};
	frame: {
		title: string;
		body: string;
		factsHeading: string;
		fact1: (total: string) => string;
		fact2: string;
		fact3: string;
		placeholder: string;
		next: string;
		back: string;
	};
	board: {
		title: string;
		hint: string;
		purse: string;
		purseHint: string;
		systems: string;
		locked: string;
		lockedText: (amount: string) => string;
		draftMark: string;
		draft: string;
		yours: string;
		change: string;
		planLabel: string;
		yoursLabel: string;
		moreThanPlan: string;
		lessThanPlan: string;
		sameAsPlan: string;
		take: (amount: string) => string;
		give: (amount: string) => string;
		atZero: string;
		atMax: string;
		notEnough: (purse: string, step: string) => string;
		leftover: (amount: string) => string;
		balanced: string;
		ledger: string;
		tookFrom: (amount: string, line: string) => string;
		gaveTo: (amount: string, line: string) => string;
		kept: string;
		keep: string;
		undo: string;
		reset: string;
		startDraft: string;
		startEmpty: string;
		startNote: string;
		tableView: string;
		finish: string;
		meter: string;
		groups: { people: string; state: string; economy: string };
		purseProgress: (placed: string, total: string) => string;
		reasonAtZero: string;
		reasonAtMax: string;
		reasonNoPurse: (purse: string) => string;
		hintToggle: string;
		hintClose: string;
		noteTitle: string;
		largestChange: (name: string, amount: string, pct: string) => string;
		coinLabel: string;
	};
	items: {
		title: string;
		q1: string;
		q1Lower: string;
		q1Same: string;
		q1Higher: string;
		q2: string;
		q2Low: string;
		q2High: string;
		optional: string;
		/** The optional governorate question; its options come from the instrument. */
		q3: string;
		q3Pick: string;
		q3Note: string;
		skip: string;
		submit: string;
		back: string;
	};
	card: {
		title: string;
		note: string;
		total: string;
		keptDraft: string;
		restart: string;
		back: string;
		stop: string;
		/** One sentence: how much money moved, between how many systems. */
		summary: (moved: string, moves: number, systems: number) => string;
		/** Shown only when the citizen's total equals the draft's. */
		totalSame: string;
		rise: string;
		cut: string;
		chartTitle: string;
		chartNote: string;
		unchanged: (names: string) => string;
		unchangedCount: (n: number) => string;
		tableToggle: string;
		receiptTitle: string;
		receiptNote: string;
		receiptLink: string;
	};
	/**
	 * The live state of the study and the submission it can take. The design
	 * strings above stay the prototype's; these are used once the registry says
	 * the study is fielding, and the page says which of the two it is.
	 */
	study: {
		chip: string;
		statusPaused: string;
		statusAccepting: string;
		storedBody: string;
		whoBody: string;
		consentWithdrawal: string;
		consentNote: string;
		submit: string;
		sending: string;
		sent: string;
		refused: string;
		notOpen: string;
		failed: string;
		tooFast: string;
		sendAgain: string;
		prototypeView: string;
		cardNote: string;
		receiptTitle: string;
		receiptNote: string;
		receiptLink: string;
	};
	unit: string;
	lines: Record<LineId, LineCopy>;
}

const en: Copy = {
	prototype: 'Prototype · 2027 draft figures, not verified',
	unreviewed: null,
	title: 'Citizen budget board',
	status: 'Design prototype. Not fielded. Not collecting.',
	stepLabels: { intro: 'About', frame: 'Frame', board: 'Board', items: 'Questions', card: 'Result' },
	intro: {
		whatWeAsk: 'What we ask',
		whatWeAskBody:
			'How you would move money between the lines of the 2027 state budget, as a citizen. About five minutes. There is no right answer and no score.',
		stored: 'What is stored',
		storedBody:
			'In this prototype, nothing. In the real study: your budget as shares of each line, two short answers, your governorate if you give it, the version of the study and how long it took. No name, email, IP address or device details.',
		who: 'Who runs it',
		whoBody: 'DeepTunisia. This is a design prototype. The study has not been approved and has not opened.',
		figures: 'Where the figures come from',
		figuresBody:
			'Every 2027 figure on these screens is a draft figure reported by the press from the 2027 draft budget. None is checked against the official document. The real study will give the source and page for each line before it opens. The past years are the budgets as voted, read from the finance laws in the Journal Officiel.',
		sample: 'What the answers can and cannot say',
		sampleBody:
			'They describe the people who take part in an open, self-selected online survey of adults. They do not describe Tunisians as a whole.',
		consentAge: 'I confirm that I am 18 years old or older.',
		consentPrototype: 'I understand this prototype stores nothing I enter.',
		consentRead: 'I have read the study information and what happens to my answers.',
		consentWithdrawal:
			'I understand that I will receive a receipt code, and that I can withdraw my answers with it until the study window closes. In this prototype nothing is stored and no code is issued.',
		consentNote: 'These are the real consent items. The receipt and withdrawal step is rehearsed at the end.',
		start: 'Start',
		under18: 'This study is for adults only. Nothing you entered is stored. You can close this page.'
	},
	frame: {
		title: 'Answer as yourself, as a citizen',
		body: 'Not as a minister, an economist or a party member. There is no right answer and no score.',
		factsHeading: 'Three facts, all draft figures',
		fact1: (total) => `The draft plans to spend about ${total} MD in 2027, excluding debt principal (not verified).`,
		fact2: 'Tax is most of what the state raises itself. The rest of spending is covered by other income and borrowing.',
		fact3: 'A large part of the budget is salaries. The split by line is not yet verified.',
		placeholder: 'Draft figures, reported by the press, not verified',
		next: 'Open the board',
		back: 'Back'
	},
	board: {
		title: 'The Treasury board',
		hint: 'Take money out of a system and it goes to the purse. Give from the purse to a system. Finish when the purse is within 0.5% of the envelope. You cannot give what you do not hold.',
		purse: 'Purse',
		purseHint: 'Money you hold. It must be within 0.5% of the envelope to finish.',
		systems: 'Systems',
		locked: 'Already spent before you start',
		lockedText: (amount) => `${amount} MD. Debt interest and the unforeseen reserve are owed. They cannot be moved.`,
		draftMark: 'Draft',
		draft: 'Draft',
		yours: 'Yours',
		change: 'Change',
		planLabel: 'State plan 2027 (draft, not verified)',
		yoursLabel: 'Your allocation',
		moreThanPlan: 'more than plan',
		lessThanPlan: 'less than plan',
		sameAsPlan: 'same as plan',
		take: (amount) => `Take ${amount} MD`,
		give: (amount) => `Give ${amount} MD`,
		atZero: 'This system is at zero. Nothing left to take.',
		atMax: 'This system is at 200% of its draft. Give elsewhere first.',
		notEnough: (purse, step) => `Your purse holds ${purse} MD. One step here costs ${step} MD. Take from another system first.`,
		leftover: (amount) => `${amount} MD left unplaced. You can finish, or place it.`,
		balanced: 'The purse is inside the finish band. You can finish.',
		ledger: 'Last moves',
		tookFrom: (amount, line) => `Took ${amount} MD from ${line}.`,
		gaveTo: (amount, line) => `Gave ${amount} MD to ${line}.`,
		kept: 'Kept the draft.',
		keep: 'I would keep the draft',
		undo: 'Undo',
		reset: 'Reset',
		startDraft: 'Start from the draft',
		startEmpty: 'Start from an empty purse',
		startNote: 'The draft start has every system at its draft and an empty purse.',
		tableView: 'Show as a table',
		finish: 'Finish',
		meter: 'Purse',
		groups: {
			people: 'People and services',
			state: 'State and security',
			economy: 'Economy and territory'
		},
		purseProgress: (placed, total) => `Placed ${placed} of ${total} MD`,
		reasonAtZero: 'This system is at zero.',
		reasonAtMax: 'This system is at its 200% cap.',
		reasonNoPurse: (purse) => `Your purse holds ${purse} MD.`,
		hintToggle: 'Rules',
		hintClose: 'Close',
		noteTitle: 'Note on this system',
		largestChange: (name, amount, pct) => `Largest change: ${name}, ${amount} MD, ${pct}%.`,
		coinLabel: 'Coins: one coin is 100 MD'
	},
	items: {
		title: 'Three short questions',
		q1: 'Knowing that the gap is borrowed, should total spending be lower, the same, or higher?',
		q1Lower: 'Lower',
		q1Same: 'The same',
		q1Higher: 'Higher',
		q2: 'How much say do citizens have today over how the budget is spent? 0 means none, 10 means a lot.',
		q2Low: 'None',
		q2High: 'A lot',
		optional: 'Optional. You can skip any question.',
		q3: 'Which governorate do you live in?',
		q3Pick: 'Choose, or leave it',
		q3Note: 'Published only as one of seven regions, and only where at least 20 people answered.',
		skip: 'Prefer not to say',
		submit: 'See my result',
		back: 'Back'
	},
	card: {
		title: 'Your budget beside the draft',
		note: 'Draft figures, not verified. This prototype stops here: nothing is sent or stored.',
		total: 'Total',
		keptDraft: 'You kept the draft as it is.',
		restart: 'Start again',
		back: 'Change my budget',
		stop: 'In the prototype, this is where the real study would submit. Nothing is sent or stored.',
		summary: (moved, moves, gaining) => `You moved ${moved} MD into ${gaining} ${gaining === 1 ? 'system' : 'systems'}, in ${moves} moves.`,
		totalSame: 'The total is the same as the draft: what one system gains, another gives.',
		rise: 'Biggest rise',
		cut: 'Biggest cut',
		chartTitle: 'What you changed',
		chartNote: 'Each bar is your change from the draft, in MD. Bars to the right are more money, bars to the left are less.',
		unchanged: (names) => `Not changed: ${names}.`,
		unchangedCount: (n) => `${n} systems not changed`,
		tableToggle: 'Every system, as a table',
		receiptTitle: 'Prototype receipt',
		receiptNote:
			'In the real study this code would be your receipt and the only way to withdraw. Nothing was sent, so this code does nothing.',
		receiptLink: 'What withdrawal would look like'
	},
	study: {
		chip: 'Study · fielding',
		statusPaused: 'The study is fielding, but it is not collecting answers right now.',
		statusAccepting: 'The study is fielding and collecting answers.',
		storedBody:
			'Your budget as shares of each line, two short answers, your governorate if you give it, the version of the study and how long it took. No name, email, IP address or device details.',
		whoBody:
			'DeepTunisia. The study is fielding. The answers describe the people who take part in an open, self-selected online survey of adults.',
		consentWithdrawal:
			'I understand that I will receive a receipt code, and that I can withdraw my answers with it until the study window closes.',
		consentNote: 'A receipt is shown at the end. Keep it: it is the only way to withdraw your answer while the study is open.',
		submit: 'Send my answer',
		sending: 'Sending your answer.',
		sent: 'Your answer was stored.',
		refused: 'The study is not collecting answers right now. Nothing was sent.',
		notOpen: 'This study is not open for answers yet. Nothing was sent.',
		failed: 'The answer could not be sent. Nothing was stored.',
		tooFast: "You finished faster than the study's minimum time. Nothing was stored. Wait a moment and send again.",
		sendAgain: 'Send again',
		prototypeView: 'This empty-start view is a prototype. The study starts from the draft. Nothing was sent.',
		cardNote: 'Draft figures, not verified.',
		receiptTitle: 'Your receipt',
		receiptNote: 'Keep this code. It is the only way to withdraw your answer while the study is open.',
		receiptLink: 'Withdraw this answer'
	},
	unit: 'MD',
	lines: {
		parliament: { name: 'Parliament', note: 'The Assembly of the People’s Representatives: members, staff and the institution.' },
		presidency: { name: 'Presidency', note: 'The office of the President of the Republic: national security and foreign relations, presidential security, and support.' },
		government_offices: { name: 'Government offices', note: 'The Presidency of the Government: supervision, control, information and support services.' },
		police: { name: 'Police and internal security', note: 'National security, the National Guard, civil protection and local affairs.' },
		justice: { name: 'Justice', note: 'Courts, prisons and rehabilitation.' },
		foreign_affairs: { name: 'Foreign affairs', note: 'Embassies, consulates and diplomacy.' },
		army: { name: 'Defence', note: 'Intervention forces, logistics, support for service members and military administration.' },
		finance: { name: 'Finance: tax, customs, treasury', note: 'Customs, tax offices, public accounting and budget services. Debt interest is not here: it is spent before you start.' },
		economy: { name: 'Economy and regional development', note: 'Mostly regional development programmes. Also statistics, international cooperation and investment support.' },
		farming: { name: 'Farming, water and fisheries', note: 'Farmers, irrigation and water supply.' },
		subsidies_energy: { name: 'Subsidies: fuel and electricity', note: 'Lower prices for fuel and electricity. The 2027 split of the 11,846 MD subsidy memo between fuel and food is derived from the two ministry lines that contain it; the split by type is not reported.' },
		subsidies_food: { name: 'Subsidies: basic food', note: 'Lower prices for basic food. The 2027 split of the 11,846 MD subsidy memo between fuel and food is derived from the two ministry lines that contain it; the split by type is not reported.' },
		energy_trade: { name: 'Industry and trade, net (derived)', note: 'Public firms and industry and trade support, after both subsidy lines are taken out. This is a derived line: the two ministry lines minus the 11,846 MD subsidy memo. It is not a ministry budget.' },
		tourism: { name: 'Tourism and crafts', note: 'Tourism promotion and handicrafts.' },
		roads_housing: { name: 'Roads, housing and equipment', note: 'Roads, public housing and public buildings.' },
		environment: { name: 'Environment', note: 'Waste, pollution and sanitation, and sustainable development.' },
		transport: { name: 'Transport', note: 'Mostly land transport: buses, metro and trains. Also ports and civil aviation.' },
		culture: { name: 'Culture and arts', note: 'Heritage, theatre, cinema and museums.' },
		youth_sports: { name: 'Youth and sports', note: 'Youth centres and sports.' },
		family: { name: 'Family, women, children and seniors', note: 'Family and equality programmes, childhood, and older people.' },
		health: { name: 'Health', note: 'Basic care, hospitals, university hospital research and support.' },
		social_affairs: { name: 'Social affairs', note: 'Social security, social promotion and employment relations.' },
		education: { name: 'Education', note: 'Primary, preparatory and secondary schools and support.' },
		higher_education: { name: 'Higher education and research', note: 'Universities, laboratories and research.' },
		employment: { name: 'Jobs and vocational training', note: 'Training centres, job programmes and help to start a business.' },
		rest: { name: 'Religion, digital, state lands, courts (derived)', note: 'Religious Affairs, Communication Technologies, State Domains, the Court of Accounts, the National Council of Regions and Districts and two councils. Their 2027 drafts are not yet reported one by one, so this line is the total less every other line. In 2026 they came to 565 MD.' },
		elections: { name: 'Elections (ISIE)', note: 'The Independent High Authority for Elections.' },
		debt: { name: 'Debt interest', note: 'Interest owed on existing debt.' },
		reserve: { name: 'Unforeseen reserve', note: 'Kept for costs nobody planned for.' }
	}
};

const fr: Copy = {
	...en,
	prototype: 'Prototype · chiffres du projet 2027, non vérifiés',
	unreviewed: 'Traduction française provisoire, pas encore relue. Les nouveaux textes (groupes, aide, note de poste, plus grand écart) sont des brouillons intermédiaires.',
	title: 'Plateau budgétaire du citoyen',
	status: 'Prototype de conception. Non lancé. Aucune collecte.',
	stepLabels: { intro: 'Présentation', frame: 'Cadre', board: 'Plateau', items: 'Questions', card: 'Résultat' },
	intro: {
		whatWeAsk: 'Ce que nous demandons',
		whatWeAskBody:
			"Comment vous déplaceriez l'argent entre les lignes du budget de l'État 2027, en tant que citoyen. Environ cinq minutes. Il n'y a pas de bonne réponse et pas de score.",
		stored: 'Ce qui est conservé',
		storedBody:
			"Dans ce prototype, rien. Dans l'étude réelle : votre budget en parts de chaque ligne, deux courtes réponses, votre gouvernorat si vous le donnez, la version de l'étude et sa durée. Ni nom, ni e-mail, ni adresse IP, ni détails de l'appareil.",
		who: 'Qui la mène',
		whoBody:
			"DeepTunisia. Il s'agit d'un prototype de conception. L'étude n'a pas été approuvée et n'est pas ouverte.",
		figures: "D'où viennent les chiffres",
		figuresBody:
			"Chaque chiffre 2027 de ces écrans est un chiffre du projet rapporté par la presse pour le budget 2027. Aucun n'est vérifié sur le document officiel. L'étude réelle donnera la source et la page de chaque ligne avant son ouverture. Les années passées sont les budgets votés, lus dans les lois de finances au Journal officiel.",
		sample: 'Ce que les réponses peuvent dire et ne peuvent pas dire',
		sampleBody:
			"Elles décrivent les personnes qui participent à une enquête en ligne ouverte et auto-sélectionnée auprès d'adultes. Elles ne décrivent pas les Tunisiens dans leur ensemble.",
		consentAge: "Je confirme avoir 18 ans ou plus.",
		consentPrototype: 'Je comprends que ce prototype ne conserve rien de ce que je saisis.',
		consentRead:
			"J'ai lu les informations de l'étude et ce qu'il advient de mes réponses.",
		consentWithdrawal:
			"Je comprends que je recevrai un code de reçu et que je pourrai retirer mes réponses avec ce code jusqu'à la fermeture de l'étude. Dans ce prototype, rien n'est conservé et aucun code n'est délivré.",
		consentNote: 'Ce sont les vrais items de consentement. L’étape du reçu et du retrait est répétée à la fin.',
		start: 'Commencer',
		under18:
			"Cette étude est réservée aux adultes. Rien de ce que vous avez saisi n'est conservé. Vous pouvez fermer cette page."
	},
	frame: {
		...en.frame,
		title: 'Répondez en tant que citoyen',
		body: "Pas en tant que ministre, économiste ou membre d'un parti. Il n'y a pas de bonne réponse et pas de score.",
		factsHeading: 'Trois faits, tous des chiffres provisoires',
		fact1: (total) =>
			`Le projet prévoit de dépenser environ ${total} MD en 2027, hors principal de la dette (non vérifié).`,
		fact2:
			"L'impôt constitue l'essentiel de ce que l'État prélève lui-même. Le reste des dépenses est couvert par d'autres recettes et par l'emprunt.",
		fact3:
			"Une grande partie du budget est constituée de salaires. La répartition par ligne n'est pas encore vérifiée.",
		placeholder: 'Chiffres provisoires rapportés par la presse, non vérifiés',
		next: 'Ouvrir le plateau',
		back: 'Retour'
	},
	board: {
		...en.board,
		title: 'Le plateau du Trésor',
		hint: "Retirez de l'argent d'un poste et il va à la bourse. Versez de la bourse à un poste. Terminez quand la bourse est à 0,5 % ou moins de l'enveloppe. Vous ne pouvez pas donner ce que vous ne détenez pas.",
		purse: 'Bourse',
		purseHint: "Argent que vous détenez. Il doit être à 0,5 % ou moins de l'enveloppe pour terminer.",
		systems: 'Postes',
		locked: 'Déjà dépensé avant le début',
		lockedText: (amount) => `${amount} MD. Les intérêts de la dette et la réserve sont dus. Ils ne peuvent pas être déplacés.`,
		draft: 'Projet',
		yours: 'Vous',
		change: 'Écart',
		planLabel: "Projet de l'État 2027 (provisoire, non vérifié)",
		yoursLabel: 'Votre répartition',
		moreThanPlan: 'plus que le projet',
		lessThanPlan: 'moins que le projet',
		sameAsPlan: 'comme le projet',
		take: (amount) => `Retirer ${amount} MD`,
		give: (amount) => `Verser ${amount} MD`,
		atZero: 'Ce poste est à zéro. Rien à retirer.',
		atMax: 'Ce poste est à 200 % de son projet. Retirez ailleurs d’abord.',
		notEnough: (purse, step) => `Votre bourse contient ${purse} MD. Un pas ici coûte ${step} MD. Retirez d'abord d'un autre poste.`,
		leftover: (amount) => `${amount} MD non placés. Vous pouvez terminer ou les placer.`,
		balanced: "La bourse est dans la marge de fin. Vous pouvez terminer.",
		ledger: 'Derniers mouvements',
		tookFrom: (amount, line) => `Retiré ${amount} MD de ${line}.`,
		gaveTo: (amount, line) => `Versé ${amount} MD à ${line}.`,
		kept: 'Projet conservé.',
		keep: 'Je garderais le projet',
		undo: 'Annuler',
		reset: 'Réinitialiser',
		startDraft: 'Partir du projet',
		startEmpty: 'Partir d’une bourse vide',
		startNote: 'Le départ au projet place chaque poste à son projet et la bourse à zéro.',
		tableView: 'Afficher en tableau',
		finish: 'Terminer',
		meter: 'Bourse',
		draftMark: 'Projet',
		groups: {
			people: 'Personnes et services',
			state: 'État et sécurité',
			economy: 'Économie et territoire'
		},
		purseProgress: (placed, total) => `Placé : ${placed} MD sur ${total} MD`,
		reasonAtZero: 'Ce poste est à zéro.',
		reasonAtMax: 'Ce poste atteint son maximum.',
		reasonNoPurse: (purse) => `Votre bourse contient ${purse} MD.`,
		hintToggle: 'Règles',
		hintClose: 'Fermer',
		noteTitle: 'Note sur ce poste',
		largestChange: (name, amount, pct) => `Plus grand écart : ${name}, ${amount} MD, ${pct} %.`,
		coinLabel: 'Pièces : une pièce vaut 100 MD'
	},
	items: {
		...en.items,
		title: 'Trois courtes questions',
		q1: 'Sachant que le déficit est emprunté, la dépense totale devrait-elle être plus basse, identique ou plus haute ?',
		q1Lower: 'Plus basse',
		q1Same: 'Identique',
		q1Higher: 'Plus haute',
		q2: "Quelle influence les citoyens ont-ils aujourd'hui sur la façon dont le budget est dépensé ? 0 signifie aucune, 10 signifie beaucoup.",
		q2Low: 'Aucune',
		q2High: 'Beaucoup',
		optional: 'Facultatif. Vous pouvez sauter n’importe quelle question.',
		q3: 'Dans quel gouvernorat vivez-vous ?',
		q3Pick: 'Choisir, ou laisser vide',
		q3Note: 'Publié seulement comme l’une de sept régions, et seulement là où au moins 20 personnes ont répondu.',
		skip: 'Préfère ne pas répondre',
		submit: 'Voir mon résultat',
		back: 'Retour'
	},
	card: {
		...en.card,
		title: 'Votre budget à côté du projet',
		note: "Chiffres provisoires, non vérifiés. Ce prototype s'arrête ici : rien n'est envoyé ni conservé.",
		total: 'Total',
		keptDraft: 'Vous avez gardé le projet tel quel.',
		restart: 'Recommencer',
		back: 'Modifier mon budget',
		stop: "Dans le prototype, c'est ici que la vraie étude enverrait. Rien n'est envoyé ni conservé.",
		summary: (moved, moves, gaining) => `Vous avez déplacé ${moved} MD vers ${gaining} ${gaining === 1 ? 'poste' : 'postes'}, en ${moves} mouvements.`,
		totalSame: "Le total est celui du projet : ce qu'un poste gagne, un autre le cède.",
		rise: 'Plus forte hausse',
		cut: 'Plus forte baisse',
		chartTitle: 'Ce que vous avez changé',
		chartNote: "Chaque barre est votre écart avec le projet, en MD. Vers la droite, plus d'argent ; vers la gauche, moins.",
		unchanged: (names) => `Inchangés : ${names}.`,
		unchangedCount: (n) => `${n} postes inchangés`,
		tableToggle: 'Tous les postes, en tableau',
		receiptTitle: 'Reçu du prototype',
		receiptNote:
			"Dans l'étude réelle, ce code serait votre reçu et le seul moyen de retirer vos réponses. Rien n'a été envoyé, donc ce code ne fait rien.",
		receiptLink: 'À quoi ressemblerait le retrait'
	},
	study: {
		chip: 'Étude · en cours',
		statusPaused: "L'étude est en cours, mais elle ne collecte pas de réponses pour le moment.",
		statusAccepting: "L'étude est en cours et collecte des réponses.",
		storedBody:
			'Votre budget en parts de chaque ligne, deux réponses courtes, votre gouvernorat si vous le donnez, la version de l’étude et sa durée. Aucun nom, courriel, adresse IP ni détail d’appareil.',
		whoBody:
			'DeepTunisia. L’étude est en cours. Les réponses décrivent les personnes qui participent à une enquête en ligne ouverte et auto-sélectionnée auprès d’adultes.',
		consentWithdrawal:
			'Je comprends que je recevrai un code de reçu et que je pourrai retirer mes réponses avec ce code jusqu’à la clôture de l’étude.',
		consentNote:
			'Un reçu s’affiche à la fin. Conservez-le : c’est le seul moyen de retirer votre réponse pendant que l’étude est ouverte.',
		submit: 'Envoyer ma réponse',
		sending: 'Envoi de votre réponse.',
		sent: 'Votre réponse a été enregistrée.',
		refused: "L'étude ne collecte pas de réponses pour le moment. Rien n'a été envoyé.",
		notOpen: "Cette étude n'est pas encore ouverte aux réponses. Rien n'a été envoyé.",
		failed: "La réponse n'a pas pu être envoyée. Rien n'a été enregistré.",
		tooFast: "Vous avez terminé plus vite que le temps minimum de l'étude. Rien n'a été conservé. Attendez un instant et renvoyez.",
		sendAgain: 'Renvoyer',
		prototypeView: "Cette vue avec une bourse vide est un prototype. L'étude part du projet. Rien n'a été envoyé.",
		cardNote: 'Chiffres du projet, non vérifiés.',
		receiptTitle: 'Votre reçu',
		receiptNote: 'Conservez ce code. C’est le seul moyen de retirer votre réponse pendant que l’étude est ouverte.',
		receiptLink: 'Retirer cette réponse'
	},
	unit: 'MD',
	lines: {
		parliament: { name: 'Parlement', note: "L'Assemblée des représentants du peuple : membres, personnel et institution." },
		presidency: { name: 'Présidence', note: 'La présidence de la République : sécurité nationale et relations extérieures, sécurité présidentielle et appui.' },
		government_offices: { name: 'Services du gouvernement', note: 'La présidence du Gouvernement : tutelle, contrôle, information et appui.' },
		police: { name: 'Police et sécurité intérieure', note: 'Sécurité nationale, Garde nationale, protection civile et affaires locales.' },
		justice: { name: 'Justice', note: 'Tribunaux, prisons et rééducation.' },
		foreign_affairs: { name: 'Affaires étrangères', note: 'Ambassades, consulats et diplomatie.' },
		army: { name: 'Défense', note: 'Forces d’intervention, logistique, assistance aux militaires et administration.' },
		finance: { name: 'Finances : impôts, douane, trésor', note: "Douane, services fiscaux, comptabilité publique et services budgétaires. Les intérêts de la dette n'y sont pas : ils sont dépensés avant de commencer." },
		economy: { name: 'Économie et développement régional', note: "Surtout les programmes de développement régional. Aussi la statistique, la coopération internationale et l'appui à l'investissement." },
		farming: { name: 'Agriculture, eau et pêche', note: 'Agriculteurs, irrigation et approvisionnement en eau.' },
		subsidies_energy: { name: 'Subventions : carburant et électricité', note: 'Prix plus bas pour le carburant et l’électricité. La répartition 2027 des 11 846 MD de subventions entre carburant et alimentation est dérivée des deux lignes ministérielles qui la contiennent ; la répartition par type n’est pas publiée.' },
		subsidies_food: { name: 'Subventions : alimentation de base', note: 'Prix plus bas pour les produits de base. La répartition 2027 des 11 846 MD de subventions entre carburant et alimentation est dérivée des deux lignes ministérielles qui la contiennent ; la répartition par type n’est pas publiée.' },
		energy_trade: { name: 'Industrie et commerce, net (dérivée)', note: 'Entreprises publiques et soutien à l’industrie et au commerce, après déduction des deux lignes de subventions. Ligne dérivée : les deux lignes ministérielles moins les 11 846 MD de subventions, pas un budget ministériel.' },
		tourism: { name: 'Tourisme et artisanat', note: 'Promotion du tourisme et artisanat.' },
		roads_housing: { name: 'Routes, logement et équipements', note: 'Routes, logement public et bâtiments publics.' },
		environment: { name: 'Environnement', note: 'Déchets, dépollution et assainissement, et développement durable.' },
		transport: { name: 'Transport', note: "Surtout le transport terrestre : bus, métro et trains. Aussi les ports et l'aviation civile." },
		culture: { name: 'Culture et arts', note: 'Patrimoine, théâtre, cinéma et musées.' },
		youth_sports: { name: 'Jeunesse et sport', note: 'Maisons de jeunes et sport.' },
		family: { name: 'Famille, femmes, enfance et personnes âgées', note: 'Programmes famille et égalité, enfance et personnes âgées.' },
		health: { name: 'Santé', note: 'Soins de base, hôpitaux, recherche hospitalo-universitaire et appui.' },
		social_affairs: { name: 'Affaires sociales', note: 'Sécurité sociale, promotion sociale et relations du travail.' },
		education: { name: 'Éducation', note: 'Écoles primaires, préparatoires et secondaires, et appui.' },
		higher_education: { name: 'Enseignement supérieur et recherche', note: 'Universités, laboratoires et recherche.' },
		employment: { name: 'Emploi et formation professionnelle', note: "Centres de formation, programmes d'emploi et aide à la création d'entreprise." },
		rest: { name: 'Culte, numérique, domaines, contrôle (dérivée)', note: "Affaires religieuses, Technologies de la communication, Domaines de l'État, Cour des comptes, Conseil national des régions et des districts et deux conseils. Leurs montants 2027 ne sont pas encore publiés un par un : cette ligne est le total moins toutes les autres. En 2026, ils faisaient 565 MD." },
		elections: { name: 'Élections (ISIE)', note: "L'Instance supérieure indépendante pour les élections." },
		debt: { name: 'Intérêts de la dette', note: 'Intérêts dus sur la dette existante.' },
		reserve: { name: 'Réserve pour imprévus', note: 'Réservée aux dépenses que personne n’avait prévues.' }
	}
};

const ar: Copy = {
	...en,
	prototype: 'نموذج أولي · أرقام مشروع 2027، لم يُتحقق منها',
	unreviewed: 'ترجمة عربية مبدئية، لم يراجعها بعد متحدث أصلي. والنصوص الجديدة (المجموعات، والمساعدة، وملاحظة البند، وأكبر تغيير) مسودّات مبدئية.',
	title: 'لوحة الخزينة للمواطن',
	status: 'نموذج تصميمي. لم يُطلق. لا يجمع أي بيانات.',
	stepLabels: { intro: 'تعريف', frame: 'الإطار', board: 'اللوحة', items: 'أسئلة', card: 'النتيجة' },
	intro: {
		whatWeAsk: 'ما نطلبه',
		whatWeAskBody:
			'كيف ستنقل المال بين بنود ميزانية الدولة لسنة 2027، كمواطن. نحو خمس دقائق. لا توجد إجابة صحيحة ولا نقاط.',
		stored: 'ما يُحفظ',
		storedBody:
			'في هذا النموذج الأوّلي، لا شيء. في الدراسة الحقيقية: ميزانيتك كنسب من كل بند، وإجابتان قصيرتان، وولايتك إن ذكرتها، ونسخة الدراسة ومدّتها. لا اسم، ولا بريد إلكتروني، ولا عنوان IP، ولا تفاصيل الجهاز.',
		who: 'من يشرف عليها',
		whoBody: 'DeepTunisia. هذا نموذج تصميمي. لم تُعتمد الدراسة ولم تُفتح.',
		figures: 'من أين تأتي الأرقام',
		figuresBody:
			'كل رقم لسنة 2027 في هذه الشاشات رقم مؤقّت نقلته الصحافة عن مشروع ميزانية 2027. ولم يُتحقّق من أي منها في الوثيقة الرسمية. وستعطي الدراسة الحقيقية المصدر والصفحة لكل بند قبل فتحها. أمّا السنوات الماضية فهي الميزانيات كما صودق عليها، مأخوذة من قوانين المالية في الرائد الرسمي.',
		sample: 'ما يمكن أن تقوله الإجابات وما لا يمكنها قوله',
		sampleBody:
			'تصف الأشخاص الذين يشاركون في استبيان إلكتروني مفتوح وقائم على الانتقاء الذاتي للبالغين. ولا تصف التونسيين في مجموعهم.',
		consentAge: 'أؤكّد أن عمري 18 سنة أو أكثر.',
		consentPrototype: 'أفهم أن هذا النموذج الأوّلي لا يحفظ شيئًا مما أدخله.',
		consentRead: 'قرأت معلومات الدراسة وما يحدث بإجاباتي.',
		consentWithdrawal:
			'أفهم أنني سأحصل على رمز إيصال، وأنه يمكنني سحب إجاباتي به حتى إغلاق الدراسة. في هذا النموذج الأوّلي لا يُحفظ شيء ولا يُسلَّم أي رمز.',
		consentNote: 'هذه هي بنود الموافقة الحقيقية. وتُعاد خطوة الإيصال والسحب في النهاية.',
		start: 'ابدأ',
		under18:
			'هذه الدراسة للبالغين فقط. لا يُحفظ شيء مما أدخلته. يمكنك إغلاق هذه الصفحة.'
	},
	frame: {
		...en.frame,
		title: 'أجب بصفتك مواطنًا',
		body: 'لا بصفتك وزيرًا أو خبيرًا اقتصاديًا أو عضوًا في حزب. لا توجد إجابة صحيحة ولا نقاط.',
		factsHeading: 'ثلاثة حقائق، كلها أرقام مؤقّتة',
		fact1: (total) =>
			`يخطط المشروع لإنفاق نحو ${total} م.د في 2027، دون أصل الدين (غير متحقّق منه).`,
		fact2:
			'الضريبة هي معظم ما تجمعه الدولة بنفسها. والباقي من النفقات تغطّيه إيرادات أخرى والاقتراض.',
		fact3: 'جزء كبير من الميزانية رواتب. والتوزيع حسب البند لم يُتحقق منه بعد.',
		placeholder: 'أرقام مؤقّتة نقلتها الصحافة، غير متحقّق منها',
		next: 'افتح اللوحة',
		back: 'رجوع'
	},
	board: {
		...en.board,
		title: 'لوحة الخزينة',
		hint: 'أخرج المال من بند فيذهب إلى الخزانة. ومن الخزانة ادفع إلى بند. أنهِ عندما تكون الخزانة داخل 0.5% من الغلاف. لا يمكنك أن تعطي ما لا تملك.',
		purse: 'الخزانة',
		purseHint: 'المال الذي بيدك. يجب أن يكون داخل 0.5% من الغلاف لتُنهي.',
		systems: 'البنود',
		locked: 'مُنفق بالفعل قبل البداية',
		lockedText: (amount) => `${amount} م.د. فوائد الدين والاحتياطي مستحقة. لا يمكن تحريكها.`,
		draft: 'المشروع',
		yours: 'أنت',
		change: 'التغيير',
		planLabel: 'مشروع الدولة 2027 (مؤقّت، غير متحقّق منه)',
		yoursLabel: 'توزيعك',
		moreThanPlan: 'أكثر من المشروع',
		lessThanPlan: 'أقل من المشروع',
		sameAsPlan: 'مثل المشروع',
		take: (amount) => `اسحب ${amount} م.د`,
		give: (amount) => `ادفع ${amount} م.د`,
		atZero: 'هذا البند صفر. لا شيء لسحبه.',
		atMax: 'هذا البند عند 200% من مشروعه. ادفع من بند آخر أولًا.',
		notEnough: (purse, step) => `تحتوي الخزانة على ${purse} م.د. خطوة هنا تكلف ${step} م.د. اسحب من بند آخر أولًا.`,
		leftover: (amount) => `${amount} م.د لم توضع بعد. يمكنك الإنهاء أو وضعها.`,
		balanced: 'الخزانة داخل هامش الإنهاء. يمكنك الإنهاء.',
		ledger: 'آخر الحركات',
		tookFrom: (amount, line) => `سُحب ${amount} م.د من ${line}.`,
		gaveTo: (amount, line) => `دُفع ${amount} م.د إلى ${line}.`,
		kept: 'أُبقي على المشروع.',
		keep: 'أبقي على المشروع',
		undo: 'تراجع',
		reset: 'إعادة ضبط',
		startDraft: 'ابدأ من المشروع',
		startEmpty: 'ابدأ بخزانة فارغة',
		startNote: 'البداية من المشروع: كل بند على مشروعه والخزانة صفر.',
		tableView: 'اعرض كجدول',
		finish: 'أنهِ',
		meter: 'الخزانة',
		draftMark: 'المشروع',
		groups: {
			people: 'الأشخاص والخدمات',
			state: 'الدولة والأمن',
			economy: 'الاقتصاد والتراب'
		},
		purseProgress: (placed, total) => `وُضع ${placed} من ${total} م.د`,
		reasonAtZero: 'هذا البند صفر.',
		reasonAtMax: 'هذا البند عند سقف 200%.',
		reasonNoPurse: (purse) => `تحتوي خزانتك على ${purse} م.د.`,
		hintToggle: 'القواعد',
		hintClose: 'إغلاق',
		noteTitle: 'ملاحظة عن هذا البند',
		largestChange: (name, amount, pct) => `أكبر تغيير: ${name}، ${amount} م.د، ${pct}%.`,
		coinLabel: 'العملات: العملة الواحدة 100 م.د'
	},
	items: {
		...en.items,
		title: 'ثلاثة أسئلة قصيرة',
		q1: 'مع العلم أن الفجوة تُقترض، هل ينبغي أن تكون النفقات الإجمالية أقل أم نفسها أم أعلى؟',
		q1Lower: 'أقل',
		q1Same: 'نفسها',
		q1Higher: 'أعلى',
		q2: 'ما مدى تأثير المواطنين اليوم في طريقة إنفاق الميزانية؟ 0 يعني لا تأثير، و10 يعني تأثيرًا كبيرًا.',
		q2Low: 'لا تأثير',
		q2High: 'تأثير كبير',
		optional: 'اختياري. يمكنك تخطّي أي سؤال.',
		q3: 'في أيّ ولاية تقيم؟',
		q3Pick: 'اختر، أو اتركه فارغًا',
		q3Note: 'يُنشر فقط كواحد من سبعة أقاليم، وفقط حيث أجاب 20 شخصًا على الأقل.',
		skip: 'أفضّل عدم الإجابة',
		submit: 'اعرض نتيجتي',
		back: 'رجوع'
	},
	card: {
		...en.card,
		title: 'ميزانيتك بجانب المشروع',
		note: 'أرقام مؤقّتة، غير متحقّق منها. يتوقف هذا النموذج الأوّلي هنا: لا يُرسَل شيء ولا يُحفظ.',
		total: 'المجموع',
		keptDraft: 'أبقيت على المشروع كما هو.',
		restart: 'ابدأ من جديد',
		back: 'تعديل ميزانيتي',
		stop: 'في النموذج الأوّلي، هنا تُرسل الدراسة الحقيقية. لا يُرسَل شيء ولا يُحفظ.',
		summary: (moved, moves, gaining) => `نقلت ${moved} م.د إلى ${gaining === 1 ? 'بند واحد' : `${gaining} من البنود`}، في ${moves} حركات.`,
		totalSame: 'المجموع هو مجموع المشروع نفسه: ما يكسبه بند يتنازل عنه بند آخر.',
		rise: 'أكبر زيادة',
		cut: 'أكبر تخفيض',
		chartTitle: 'ما غيّرته',
		chartNote: 'كل شريط هو الفرق بين ميزانيتك والمشروع، بالمليون دينار. نحو اليسار مال أكثر، ونحو اليمين مال أقل.',
		unchanged: (names) => `لم تتغيّر: ${names}.`,
		unchangedCount: (n) => `${n} بنود لم تتغيّر`,
		tableToggle: 'كل البنود في جدول',
		receiptTitle: 'إيصال النموذج الأوّلي',
		receiptNote: 'في الدراسة الحقيقية سيكون هذا الرمز إيصالك والطريق الوحيد لسحب إجاباتك. لم يُرسل شيء، فهذا الرمز لا يفعل شيئًا.',
		receiptLink: 'كيف سيكون السحب'
	},
	study: {
		chip: 'دراسة · قيد الميدان',
		statusPaused: 'الدراسة قيد الميدان، لكنها لا تجمع إجابات الآن.',
		statusAccepting: 'الدراسة قيد الميدان وتجمع الإجابات.',
		storedBody:
			'ميزانيتك كنسب من كل بند، وإجابتان قصيرتان، وولايتك إن ذكرتها، ونسخة الدراسة ومدتها. لا اسم ولا بريد إلكتروني ولا عنوان IP ولا تفاصيل جهاز.',
		whoBody:
			'DeepTunisia. الدراسة قيد الميدان. تصف الإجابات الأشخاص الذين شاركوا في استبيان مفتوح عبر الإنترنت يختار المشاركون أنفسهم، بين بالغين.',
		consentWithdrawal: 'أفهم أنني سأحصل على رمز إيصال، وأنه يمكنني سحب إجاباتي به حتى إغلاق نافذة الدراسة.',
		consentNote: 'يظهر الإيصال في النهاية. احتفظ به: إنه الطريقة الوحيدة لسحب إجابتك أثناء بقاء الدراسة مفتوحة.',
		submit: 'أرسل إجابتي',
		sending: 'جارٍ إرسال إجابتك.',
		sent: 'تم تخزين إجابتك.',
		refused: 'الدراسة لا تجمع إجابات الآن. لم يُرسل شيء.',
		notOpen: 'هذه الدراسة ليست مفتوحة للإجابات بعد. لم يُرسل شيء.',
		failed: 'تعذّر إرسال الإجابة. لم يُخزَّن شيء.',
		tooFast: 'أنهيت أسرع من الحدّ الأدنى لوقت الدراسة. لم يُخزَّن شيء. انتظر قليلًا ثم أرسل مرة أخرى.',
		sendAgain: 'أرسل مرة أخرى',
		prototypeView: 'هذا العرض ببداية فارغة نموذج أوّلي. تبدأ الدراسة من المشروع. لم يُرسل شيء.',
		cardNote: 'أرقام المشروع، لم يُتحقق منها.',
		receiptTitle: 'إيصالك',
		receiptNote: 'احتفظ بهذا الرمز. إنه الطريقة الوحيدة لسحب إجابتك أثناء بقاء الدراسة مفتوحة.',
		receiptLink: 'اسحب هذه الإجابة'
	},
	unit: 'م.د',
	lines: {
		parliament: { name: 'البرلمان', note: 'مجلس نوّاب الشعب: الأعضاء والموظفون والمؤسسة.' },
		presidency: { name: 'رئاسة الجمهورية', note: 'مؤسسة رئيس الجمهورية: الأمن الوطني والعلاقات الخارجية، والأمن الرئاسي، والدعم.' },
		government_offices: { name: 'مصالح الحكومة', note: 'رئاسة الحكومة: الإشراف والرقابة والإعلام والدعم.' },
		police: { name: 'الأمن الداخلي والشرطة', note: 'الأمن الوطني والحرس الوطني والحماية المدنية والشؤون المحلية.' },
		justice: { name: 'العدالة', note: 'المحاكم والسجون وإعادة التأهيل.' },
		foreign_affairs: { name: 'الشؤون الخارجية', note: 'السفارات والقنصليات والدبلوماسية.' },
		army: { name: 'الدفاع', note: 'قوات التدخل واللوجستيك ومساعدة العسكريين والإدارة العسكرية.' },
		finance: { name: 'المالية: الجباية والديوانة والخزينة', note: 'الديوانة والمصالح الجبائية والمحاسبة العمومية والمصالح الميزانياتية. فوائد الدين ليست هنا: تُصرف قبل أن تبدأ.' },
		economy: { name: 'الاقتصاد والتنمية الجهوية', note: 'أساسًا برامج التنمية الجهوية. وكذلك الإحصاء والتعاون الدولي ودعم الاستثمار.' },
		farming: { name: 'الفلاحة والمياه والصيد', note: 'الفلاحون والري وتزويد المياه.' },
		subsidies_energy: { name: 'الدعم: المحروقات والكهرباء', note: 'أسعار أقل للمحروقات والكهرباء. تقسيم 2027 لدعم 11,846 م.د بين المحروقات والغذاء مشتقّ من بندي الوزارتين اللذين يحتويانه، والتقسيم حسب النوع غير منشور.' },
		subsidies_food: { name: 'الدعم: المواد الغذائية الأساسية', note: 'أسعار أقل للمواد الغذائية الأساسية. تقسيم 2027 لدعم 11,846 م.د بين المحروقات والغذاء مشتقّ من بندي الوزارتين اللذين يحتويانه، والتقسيم حسب النوع غير منشور.' },
		energy_trade: { name: 'الصناعة والتجارة، صافٍ (مشتقّ)', note: 'المؤسسات العمومية ودعم الصناعة والتجارة بعد إخراج بندي الدعم. بند مشتقّ: بندا الوزارتين ناقص 11,846 م.د من الدعم، وليس ميزانية وزارة.' },
		tourism: { name: 'السياحة والصناعات التقليدية', note: 'الترويج السياحي والصناعات التقليدية.' },
		roads_housing: { name: 'الطرقات والسكن والتجهيزات', note: 'الطرقات والسكن العمومي والمباني العمومية.' },
		environment: { name: 'البيئة', note: 'النفايات ومكافحة التلوّث والتطهير، والتنمية المستدامة.' },
		transport: { name: 'النقل', note: 'أساسًا النقل البرّي: الحافلات والمترو والقطارات. وكذلك الموانئ والطيران المدني.' },
		culture: { name: 'الثقافة والفنون', note: 'التراث والمسرح والسينما والمتاحف.' },
		youth_sports: { name: 'الشباب والرياضة', note: 'دور الشباب والرياضة.' },
		family: { name: 'الأسرة والمرأة والطفولة وكبار السن', note: 'برامج الأسرة والمساواة والطفولة وكبار السن.' },
		health: { name: 'الصحة', note: 'العلاج الأساسي والمستشفيات والبحث الاستشفائي الجامعي والدعم.' },
		social_affairs: { name: 'الشؤون الاجتماعية', note: 'الضمان الاجتماعي والنهوض الاجتماعي وعلاقات العمل.' },
		education: { name: 'التعليم', note: 'المدارس الابتدائية والإعدادية والثانوية والدعم.' },
		higher_education: { name: 'التعليم العالي والبحث', note: 'الجامعات والمخابر والبحث.' },
		employment: { name: 'التشغيل والتكوين المهني', note: 'مراكز التكوين وبرامج التشغيل والمساعدة على بعث المؤسسات.' },
		rest: { name: 'الشؤون الدينية، الرقمنة، أملاك الدولة، الرقابة (مشتقّ)', note: 'الشؤون الدينية، وتكنولوجيات الاتصال، وأملاك الدولة، ومحكمة المحاسبات، والمجلس الوطني للجهات والأقاليم، ومجلسان آخران. أرقامها لسنة 2027 لم تُنشر بعدُ واحدًا واحدًا، فهذا البند هو المجموع ناقص كل البنود الأخرى. في 2026 بلغت 565 م.د.' },
		elections: { name: 'الانتخابات (الهيئة)', note: 'الهيئة العليا المستقلة للانتخابات.' },
		debt: { name: 'فوائد الدين', note: 'فوائد الدين القائم.' },
		reserve: { name: 'احتياطي الطوارئ', note: 'يُحتفظ به لتكاليف لم يخطط لها أحد.' }
	}
};

const COPY: Record<Locale, Copy> = { en, fr, ar };

export function copyFor(locale: Locale): Copy {
	return COPY[locale] ?? en;
}
