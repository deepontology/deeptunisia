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
	};
	unit: string;
	lines: Record<LineId, LineCopy>;
}

const en: Copy = {
	prototype: 'Prototype · draft figures, not verified',
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
			'In this prototype, nothing. In the real study: your budget as shares of each line, two short answers, the version of the study and how long it took. No name, email, IP address or device details.',
		who: 'Who runs it',
		whoBody: 'DeepTunisia. This is a design prototype. The study has not been approved and has not opened.',
		figures: 'Where the figures come from',
		figuresBody:
			'Every figure on these screens is a draft figure reported by the press from the 2027 draft budget. None is checked against the official document. The real study will give the source and page for each line before it opens.',
		sample: 'What the answers can and cannot say',
		sampleBody:
			'They describe the people who take part in an open, self-selected online survey of adults. They do not describe Tunisians as a whole.',
		consentAge: 'I am 18 or older.',
		consentPrototype: 'I understand this prototype stores nothing I enter.',
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
		hint: 'Take money out of a system and it goes to the purse. Give from the purse to a system. Place every dinar before you finish. You cannot give what you do not hold.',
		purse: 'Purse',
		purseHint: 'Money you hold. Place it all to finish.',
		systems: 'Systems',
		locked: 'Already spent before you start',
		lockedText: (amount) => `${amount} MD. Debt interest and the unforeseen reserve are owed. They cannot be moved.`,
		draftMark: 'Draft',
		draft: 'Draft',
		yours: 'Yours',
		change: 'Change',
		take: (amount) => `Take ${amount} MD`,
		give: (amount) => `Give ${amount} MD`,
		atZero: 'This system is at zero. Nothing left to take.',
		atMax: 'This system is at 200% of its draft. Give elsewhere first.',
		notEnough: (purse, step) => `Your purse holds ${purse} MD. One step here costs ${step} MD. Take from another system first.`,
		leftover: (amount) => `${amount} MD left unplaced. You can finish, or place it.`,
		balanced: 'Every dinar is placed. You can finish.',
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
		coinLabel: 'Coins: one coin is about 1,000 MD of the envelope'
	},
	items: {
		title: 'Two short questions',
		q1: 'Knowing that the gap is borrowed, should total spending be lower, the same, or higher?',
		q1Lower: 'Lower',
		q1Same: 'The same',
		q1Higher: 'Higher',
		q2: 'How much say do citizens have today over how the budget is spent? 0 means none, 10 means a lot.',
		q2Low: 'None',
		q2High: 'A lot',
		submit: 'Submit my budget',
		back: 'Back'
	},
	card: {
		title: 'Your budget beside the draft',
		note: 'Draft figures, not verified. This prototype stops here: nothing is sent or stored.',
		total: 'Total',
		keptDraft: 'You kept the draft as it is.',
		restart: 'Start again',
		back: 'Change my budget',
		stop: 'In the prototype, the submit button stops at this card.'
	},
	unit: 'MD',
	lines: {
		education: { name: 'Education', note: 'Schools and the teachers who staff them.' },
		higher_education: { name: 'Higher education and research', note: 'Universities, laboratories and research.' },
		health: { name: 'Health', note: 'Hospitals, clinics and medicines.' },
		social: { name: 'Social protection and family', note: 'Pensions, cash support and family help.' },
		subsidies: { name: 'Subsidies: fuel, electricity and food', note: 'Lower prices for fuel, power and basic food. The split by type is not yet verified.' },
		energy_trade: { name: 'Energy, industry and trade, without subsidies', note: 'Public firms and industry and trade support, after subsidies are taken out.' },
		police: { name: 'Police and internal security', note: 'Police, gendarmerie and internal security forces.' },
		army: { name: 'Defence', note: 'Armed forces pay, equipment and training.' },
		justice: { name: 'Justice', note: 'Courts and prisons.' },
		farming: { name: 'Farming, water and fisheries', note: 'Farmers, irrigation and water supply.' },
		roads_housing: { name: 'Roads, housing and equipment', note: 'Roads, public housing and public buildings.' },
		youth_sports: { name: 'Youth and sports', note: 'Youth centres and sports.' },
		culture: { name: 'Culture and arts', note: 'Heritage, theatre, cinema and museums.' },
		presidency: { name: 'Presidency', note: 'The office of the President of the Republic.' },
		government: { name: 'Government, parliament, elections and diplomacy', note: 'Government offices, parliament, elections and embassies.' },
		other: { name: 'Everything else', note: 'Every other ministry and body, including tourism.' },
		debt: { name: 'Debt interest', note: 'Interest owed on existing debt.' },
		reserve: { name: 'Unforeseen reserve', note: 'Kept for costs nobody planned for.' }
	}
};

const fr: Copy = {
	...en,
	prototype: 'Prototype · chiffres du projet, non vérifiés',
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
			"Dans ce prototype, rien. Dans l'étude réelle : votre budget en parts de chaque ligne, deux courtes réponses, la version de l'étude et sa durée. Ni nom, ni e-mail, ni adresse IP, ni détails de l'appareil.",
		who: 'Qui la mène',
		whoBody:
			"DeepTunisia. Il s'agit d'un prototype de conception. L'étude n'a pas été approuvée et n'est pas ouverte.",
		figures: "D'où viennent les chiffres",
		figuresBody:
			"Chaque chiffre de ces écrans est un chiffre du projet rapporté par la presse pour le budget 2027. Aucun n'est vérifié sur le document officiel. L'étude réelle donnera la source et la page de chaque ligne avant son ouverture.",
		sample: 'Ce que les réponses peuvent dire et ne peuvent pas dire',
		sampleBody:
			"Elles décrivent les personnes qui participent à une enquête en ligne ouverte et auto-sélectionnée auprès d'adultes. Elles ne décrivent pas les Tunisiens dans leur ensemble.",
		consentAge: "J'ai 18 ans ou plus.",
		consentPrototype: 'Je comprends que ce prototype ne conserve rien de ce que je saisis.',
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
		hint: "Retirez de l'argent d'un poste et il va à la bourse. Versez de la bourse à un poste. Placez chaque dinar avant de terminer.",
		purse: 'Bourse',
		purseHint: 'Argent que vous détenez. Placez tout pour terminer.',
		systems: 'Postes',
		locked: 'Déjà dépensé avant le début',
		lockedText: (amount) => `${amount} MD. Les intérêts de la dette et la réserve sont dus. Ils ne peuvent pas être déplacés.`,
		draft: 'Projet',
		yours: 'Vous',
		change: 'Écart',
		take: (amount) => `Retirer ${amount} MD`,
		give: (amount) => `Verser ${amount} MD`,
		atZero: 'Ce poste est à zéro. Rien à retirer.',
		atMax: 'Ce poste est à 200 % de son projet. Retirez ailleurs d’abord.',
		notEnough: (purse, step) => `Votre bourse contient ${purse} MD. Un pas ici coûte ${step} MD. Retirez d'abord d'un autre poste.`,
		leftover: (amount) => `${amount} MD non placés. Vous pouvez terminer ou les placer.`,
		balanced: 'Chaque dinar est placé. Vous pouvez terminer.',
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
		coinLabel: 'Pièces : une pièce vaut environ 1 000 MD de l’enveloppe'
	},
	items: {
		...en.items,
		title: 'Deux courtes questions',
		q1: 'Sachant que le déficit est emprunté, la dépense totale devrait-elle être plus basse, identique ou plus haute ?',
		q1Lower: 'Plus basse',
		q1Same: 'Identique',
		q1Higher: 'Plus haute',
		q2: "Quelle influence les citoyens ont-ils aujourd'hui sur la façon dont le budget est dépensé ? 0 signifie aucune, 10 signifie beaucoup.",
		q2Low: 'Aucune',
		q2High: 'Beaucoup',
		submit: 'Soumettre mon budget',
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
		stop: "Dans le prototype, le bouton d'envoi s'arrête à cette carte."
	},
	unit: 'MD',
	lines: {
		education: { name: 'Éducation', note: 'Écoles et enseignants.' },
		higher_education: { name: 'Enseignement supérieur et recherche', note: 'Universités, laboratoires et recherche.' },
		health: { name: 'Santé', note: 'Hôpitaux, dispensaires et médicaments.' },
		social: { name: 'Protection sociale et famille', note: 'Retraites, aides en espèces et aide aux familles.' },
		subsidies: { name: 'Subventions : carburant, électricité et alimentation', note: 'Prix plus bas pour le carburant, l’électricité et les produits de base. La répartition n’est pas encore vérifiée.' },
		energy_trade: { name: 'Énergie, industrie et commerce, hors subventions', note: 'Entreprises publiques et soutien à l’industrie et au commerce, hors subventions.' },
		police: { name: 'Police et sécurité intérieure', note: 'Police, gendarmerie et forces de sécurité intérieure.' },
		army: { name: 'Défense', note: 'Solde, équipements et formation des forces armées.' },
		justice: { name: 'Justice', note: 'Tribunaux et prisons.' },
		farming: { name: 'Agriculture, eau et pêche', note: 'Agriculteurs, irrigation et approvisionnement en eau.' },
		roads_housing: { name: 'Routes, logement et équipements', note: 'Routes, logement public et bâtiments publics.' },
		youth_sports: { name: 'Jeunesse et sport', note: 'Maisons de jeunes et sport.' },
		culture: { name: 'Culture et arts', note: 'Patrimoine, théâtre, cinéma et musées.' },
		presidency: { name: 'Présidence', note: 'La présidence de la République.' },
		government: { name: 'Gouvernement, parlement, élections et diplomatie', note: 'Services du gouvernement, parlement, élections et ambassades.' },
		other: { name: 'Tout le reste', note: 'Tous les autres ministères et organismes, dont le tourisme.' },
		debt: { name: 'Intérêts de la dette', note: 'Intérêts dus sur la dette existante.' },
		reserve: { name: 'Réserve pour imprévus', note: 'Réservée aux dépenses que personne n’avait prévues.' }
	}
};

const ar: Copy = {
	...en,
	prototype: 'نموذج أولي · أرقام المشروع، لم يُتحقق منها',
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
			'في هذا النموذج الأوّلي، لا شيء. في الدراسة الحقيقية: ميزانيتك كنسب من كل بند، وإجابتان قصيرتان، ونسخة الدراسة ومدّتها. لا اسم، ولا بريد إلكتروني، ولا عنوان IP، ولا تفاصيل الجهاز.',
		who: 'من يشرف عليها',
		whoBody: 'DeepTunisia. هذا نموذج تصميمي. لم تُعتمد الدراسة ولم تُفتح.',
		figures: 'من أين تأتي الأرقام',
		figuresBody:
			'كل رقم في هذه الشاشات رقم مؤقّت نقله الصحافة عن مشروع ميزانية 2027. ولم يُتحقّق من أي منها في الوثيقة الرسمية. وستعطي الدراسة الحقيقية المصدر والصفحة لكل بند قبل فتحها.',
		sample: 'ما يمكن أن تقوله الإجابات وما لا يمكنها قوله',
		sampleBody:
			'تصف الأشخاص الذين يشاركون في استبيان إلكتروني مفتوح وقائم على الانتقاء الذاتي للبالغين. ولا تصف التونسيين في مجموعهم.',
		consentAge: 'عمري 18 سنة أو أكثر.',
		consentPrototype: 'أفهم أن هذا النموذج الأوّلي لا يحفظ شيئًا مما أدخله.',
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
		hint: 'أخرج المال من بند فيذهب إلى الخزانة. ومن الخزانة ادفع إلى بند. ضع كل دينار قبل أن تنهي.',
		purse: 'الخزانة',
		purseHint: 'المال الذي بيدك. ضعه كله لتنهي.',
		systems: 'البنود',
		locked: 'مُنفق بالفعل قبل البداية',
		lockedText: (amount) => `${amount} م.د. فوائد الدين والاحتياطي مستحقة. لا يمكن تحريكها.`,
		draft: 'المشروع',
		yours: 'أنت',
		change: 'التغيير',
		take: (amount) => `اسحب ${amount} م.د`,
		give: (amount) => `ادفع ${amount} م.د`,
		atZero: 'هذا البند صفر. لا شيء لسحبه.',
		atMax: 'هذا البند عند 200% من مشروعه. ادفع من بند آخر أولًا.',
		notEnough: (purse, step) => `تحتوي الخزانة على ${purse} م.د. خطوة هنا تكلف ${step} م.د. اسحب من بند آخر أولًا.`,
		leftover: (amount) => `${amount} م.د لم توضع بعد. يمكنك الإنهاء أو وضعها.`,
		balanced: 'وُضع كل دينار. يمكنك الإنهاء.',
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
		coinLabel: 'العملات: العملة الواحدة نحو 1,000 م.د من المظروف'
	},
	items: {
		...en.items,
		title: 'سؤالان قصيران',
		q1: 'مع العلم أن الفجوة تُقترض، هل ينبغي أن تكون النفقات الإجمالية أقل أم نفسها أم أعلى؟',
		q1Lower: 'أقل',
		q1Same: 'نفسها',
		q1Higher: 'أعلى',
		q2: 'ما مدى تأثير المواطنين اليوم في طريقة إنفاق الميزانية؟ 0 يعني لا تأثير، و10 يعني تأثيرًا كبيرًا.',
		q2Low: 'لا تأثير',
		q2High: 'تأثير كبير',
		submit: 'أرسل ميزانيتي',
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
		stop: 'في النموذج الأوّلي، يتوقف زر الإرسال عند هذه البطاقة.'
	},
	unit: 'م.د',
	lines: {
		education: { name: 'التعليم', note: 'المدارس والمعلمون.' },
		higher_education: { name: 'التعليم العالي والبحث', note: 'الجامعات والمخابر والبحث.' },
		health: { name: 'الصحة', note: 'المستشفيات والمراكز الصحية والأدوية.' },
		social: { name: 'الحماية الاجتماعية والأسرة', note: 'المعاشات والمساعدات النقدية ودعم الأسر.' },
		subsidies: { name: 'الدعم: المحروقات والكهرباء والغذاء', note: 'أسعار أقل للوقود والكهرباء والمواد الأساسية. التوزيع حسب النوع لم يُتحقق منه بعد.' },
		energy_trade: { name: 'الطاقة والصناعة والتجارة دون الدعم', note: 'المؤسسات العمومية ودعم الصناعة والتجارة بعد إخراج الدعم.' },
		police: { name: 'الأمن الداخلي والشرطة', note: 'الشرطة والحرس الوطني وقوات الأمن الداخلي.' },
		army: { name: 'الدفاع', note: 'رواتب القوات المسلحة وتجهيزها وتدريبها.' },
		justice: { name: 'العدالة', note: 'المحاكم والسجون.' },
		farming: { name: 'الفلاحة والمياه والصيد', note: 'الفلاحون والري وتزويد المياه.' },
		roads_housing: { name: 'الطرقات والسكن والتجهيزات', note: 'الطرقات والسكن العمومي والمباني العمومية.' },
		youth_sports: { name: 'الشباب والرياضة', note: 'دور الشباب والرياضة.' },
		culture: { name: 'الثقافة والفنون', note: 'التراث والمسرح والسينما والمتاحف.' },
		presidency: { name: 'رئاسة الجمهورية', note: 'مؤسسة رئيس الجمهورية.' },
		government: { name: 'الحكومة والبرلمان والانتخابات والدبلوماسية', note: 'مصالح الحكومة والبرلمان والانتخابات والسفارات.' },
		other: { name: 'كل ما عدا ذلك', note: 'كل الوزارات والهيئات الأخرى، بما فيها السياحة.' },
		debt: { name: 'فوائد الدين', note: 'فوائد الدين القائم.' },
		reserve: { name: 'احتياطي الطوارئ', note: 'يُحتفظ به لتكاليف لم يخطط لها أحد.' }
	}
};

const COPY: Record<Locale, Copy> = { en, fr, ar };

export function copyFor(locale: Locale): Copy {
	return COPY[locale] ?? en;
}
