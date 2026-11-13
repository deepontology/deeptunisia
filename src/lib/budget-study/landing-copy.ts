/**
 * Landing copy for the citizen budget study, in English, French and Arabic.
 *
 * The structure follows the police index landing: a plate with the cover, a
 * count strip, numbered sections, and the study's honest states. English is
 * the source text. French and Arabic are interim drafts and say so.
 *
 * No amount is typed here: every figure on the page is computed from the
 * figures file at build time and set beside these words. The only sentence
 * allowed to carry the approved tax share is the approved one, in the hook.
 */

export type Locale = 'en' | 'fr' | 'ar';

export interface LandingSection {
	id: 'question' | 'board' | 'figures' | 'method' | 'questions' | 'stored' | 'cannot' | 'record' | 'take';
	num: string;
	label: string;
	heading: string;
	body: string[];
}

export type FactKey = 'locked' | 'subsidies' | 'largest' | 'zero';

export interface LandingCopy {
	kicker: string;
	title: string;
	hook: string;
	cover: string;
	status: string;
	notCollecting: string;
	ctaBoard: string;
	ctaNote: string;
	unit: string;
	tally: { total: string; locked: string; movable: string; systems: string; answers: string };
	field: {
		caption: (perDot: string) => string;
		idle: string;
		share: (pct: string) => string;
		lockedNote: string;
		hint: string;
		listLabel: string;
	};
	facts: { heading: string; items: { key: FactKey; title: string; body: string }[] };
	demo: {
		title: string;
		body: string;
		purse: string;
		reset: string;
		take: (name: string) => string;
		give: (name: string) => string;
		fullBoard: string;
	};
	example: {
		title: string;
		intro: string;
		stored: string;
		note: string;
		head: { system: string; plan: string; yours: string; change: string; storedAs: string };
	};
	figures: {
		system: string;
		draft: string;
		status: string;
		madeOf: string;
		less: string;
		chip: { 'draft-press': string; 'draft-derived': string; 'draft-plf': string; 'adopted-lf': string };
		sources: string;
		locked: string;
		total: string;
	};
	sections: LandingSection[];
	cannotSay: string[];
	recordFacts: { label: string; value: string }[];
	draftNotice: string;
	interimNotice: string | null;
	closing: [string, string];
	share: { button: string; heading: string; text: string };
	/** How each kind of answer is given, for the questions section. */
	answerKinds: Record<string, string>;
	optional: string;
}

export const landingCopy: Record<Locale, LandingCopy> = {
	en: {
		kicker: 'DeepTunisia research · 003 · budget study',
		title: 'Citizen budget 2027',
		hook: '91 dinars in every 100 the state raises itself come from tax. The rest of the budget is a set of choices. This study asks how you would make them.',
		cover: 'Divide the 2027 state budget yourself, on one board, with the draft figures. Every dinar you give one system, you take from another.',
		status: 'In design · not collecting',
		notCollecting: 'Not collecting answers yet. The question, the figures and the rules are published here first, so they can be checked before anyone answers.',
		ctaBoard: 'Try the board',
		ctaNote: 'Prototype. Draft figures. Nothing is sent or stored.',
		unit: 'MD',
		tally: {
			total: 'Draft spending, 2027',
			locked: 'Owed before any choice',
			movable: 'Yours to divide',
			systems: 'systems on the board',
			answers: 'answers collected'
		},
		field: {
			caption: (perDot) => `The 2027 draft, one dot for every ${perDot} MD. Touch a block to read it.`,
			idle: 'The whole draft budget',
			share: (pct) => `${pct}% of the draft`,
			lockedNote: 'Owed before any choice. It does not move.',
			hint: 'Draft figures, reported by the press, not verified.',
			listLabel: 'The draft budget, line by line'
		},
		facts: {
			heading: 'Why it is harder than it looks',
			items: [
				{ key: 'locked', title: 'Owed before any choice', body: 'Interest on past debt and a reserve for the unforeseen are paid first. Nobody can move them this year, so they sit apart on the board.' },
				{ key: 'subsidies', title: 'Subsidies sit inside ministries', body: 'Fuel, electricity and basic food subsidies are paid through the Industry and Trade budgets. The board cuts them out as their own line, so they can be seen and moved.' },
				{ key: 'largest', title: 'A few systems hold most of the money', body: 'The four largest systems hold this share of everything that can be moved. On one scale, the smallest are slivers.' },
				{ key: 'zero', title: 'Every dinar comes from somewhere', body: 'The total does not move. Give 100 MD to one system and you have taken 100 MD from another, or from the purse.' }
			]
		},
		demo: {
			title: 'Try it with three systems',
			body: 'Drag one system onto another, or use the buttons. These are the draft figures for three of the sixteen systems.',
			purse: 'Purse',
			reset: 'Put it back',
			take: (name) => `Take 100 MD from ${name}`,
			give: (name) => `Give 100 MD to ${name}`,
			fullBoard: 'Open the full board'
		},
		example: {
			title: 'A worked example',
			intro: 'Start from the plan and drag Defence onto Health three times. Three coins of 100 MD move. The purse stays empty, so the board can be finished.',
			stored: 'Stored as each line’s share of its plan, in basis points: 10,000 is the plan.',
			note: 'Draft figures. The choice is invented.',
			head: { system: 'System', plan: 'Plan', yours: 'Yours', change: 'Change', storedAs: 'Stored' }
		},
		figures: {
			system: 'Board line',
			draft: 'Draft, MD',
			status: 'Status',
			madeOf: 'Made of',
			less: 'less',
			chip: { 'draft-press': 'Press, not verified', 'draft-derived': 'Derived, not verified', 'draft-plf': 'Draft law', 'adopted-lf': 'Adopted law' },
			sources: 'Every row of the figures file, with its source',
			locked: 'Owed, does not move',
			total: 'Total'
		},
		sections: [
			{
				id: 'question',
				num: '01',
				label: 'The question',
				heading: 'If the budget were yours to divide',
				body: [
					'The study asks one thing: given the 2027 budget the state has drafted, where would you put the money? You answer on a board that holds the draft figures, and you finish when every dinar is placed.',
					'A budget is not a list of separate wishes. Money given to schools is money not given to hospitals, the army or fuel subsidies. The board makes that trade visible, and the study records the choices people make with it.'
				]
			},
			{
				id: 'board',
				num: '02',
				label: 'The board',
				heading: 'One board, one coin, no score',
				body: [
					'Each system shows two bars on one scale: the state’s 2027 plan, and yours. Drag one system onto another and a coin of 100 MD moves between them. Hold still to keep the money flowing. Money you take and have not placed waits in the purse, and you finish when the purse is empty.',
					'Nothing is scored or ranked. Keeping the plan as it is counts as an answer.'
				]
			},
			{
				id: 'figures',
				num: '03',
				label: 'The figures',
				heading: 'Draft figures, each with its status',
				body: [
					'Every amount here is a draft reported by the press during the budget hearings. None has been checked against the official document yet. The study will not open on a figure until it has a page reference in the adopted law.',
					'Some lines on the board join several ministries, and the subsidies line is cut out of two of them. The table says what each board line is made of.'
				]
			},
			{
				id: 'method',
				num: '04',
				label: 'Method',
				heading: 'How the answers will be read',
				body: [
					'For each line: the share of respondents who would give it more, the same, or less than its plan, and the median change with its interquartile range. The average budget submitted, with a bootstrap interval. A consensus measure. A result without the largest link channel.',
					'Results are shown only above 100 valid answers, and no cell under 20 is shown. Population: among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not the country as a whole.'
				]
			},
			{
				id: 'questions',
				num: '05',
				label: 'Questions',
				heading: 'Every question, as it will be asked',
				body: ['The whole instrument, in order. Nothing else is asked. The words are a draft until the study is frozen.']
			},
			{
				id: 'stored',
				num: '06',
				label: 'What is stored',
				heading: 'Only what the answers need',
				body: [
					'Stored per response: your budget as a share of each line, two short answers, optional region, the study version and locale, the channel that brought you, timings, and a random receipt code.',
					'Never stored: your name, email, IP address, device details, location beyond the optional region, or free text. The prototype stores nothing.'
				]
			},
			{
				id: 'cannot',
				num: '07',
				label: 'What it cannot say',
				heading: 'What these answers are not',
				body: ['The answers are a record of choices by the people who made them. They cannot stand in for a country.']
			},
			{
				id: 'record',
				num: '08',
				label: 'Record',
				heading: 'The status, stated plainly',
				body: ['The study is in design. Nothing is collected, and no review has cleared it.']
			},
			{
				id: 'take',
				num: '09',
				label: 'Take part',
				heading: 'Not open yet',
				body: [
					'There is nothing to submit yet. The board is open as a prototype: it uses the draft figures and stores nothing.',
					'The study opens only after the figures are checked against the adopted law and the reviews are complete.'
				]
			}
		],
		cannotSay: [
			'Not a picture of national preference, and not a national result. Taking part is open and self-selected.',
			'Not what the budget should be.',
			'Not whether any line is wasteful.',
			'Not a ranking of respondents, or of their choices.'
		],
		recordFacts: [
			{ label: 'Stage', value: 'Design. The study is not open.' },
			{ label: 'Ethics review', value: 'None has taken place.' },
			{ label: 'Data-protection review', value: 'None has taken place.' },
			{ label: 'Preregistration', value: 'Not registered.' },
			{ label: 'Principal investigator', value: 'Not named.' },
			{ label: 'Figures', value: 'Draft, press-reported, not verified.' },
			{ label: 'Translation', value: 'English only for now. French and Arabic are drafts pending review.' }
		],
		draftNotice: 'Every figure on this page is a press-reported draft, not a verified official figure.',
		interimNotice: null,
		closing: ['The total does not move.', 'Only where it goes does.'],
		answerKinds: { consent: 'Required tick', allocation: 'On the board', single_choice: 'One choice', scale_0_10: 'From 0 to 10' },
		optional: 'optional',
		share: {
			button: 'Copy link',
			heading: 'Share this page',
			text: 'In design, not collecting. The link opens the published landing page.'
		}
	},

	fr: {
		kicker: 'Recherche DeepTunisia · 003 · étude budgétaire',
		title: 'Budget citoyen 2027',
		hook: '91 dinars sur 100 que l’État prélève lui-même proviennent de l’impôt. Le reste du budget est un ensemble de choix. Cette étude demande comment vous les feriez.',
		cover: 'Répartissez vous-même le budget de l’État 2027, sur un seul plateau, avec les chiffres du projet. Chaque dinar donné à un poste est pris à un autre.',
		status: 'En conception · pas de collecte',
		notCollecting: 'Aucune réponse n’est collectée. La question, les chiffres et les règles sont publiés ici d’abord, pour être vérifiés avant que quiconque réponde.',
		ctaBoard: 'Essayer le plateau',
		ctaNote: 'Prototype. Chiffres du projet. Rien n’est envoyé ni conservé.',
		unit: 'MD',
		tally: {
			total: 'Dépenses du projet, 2027',
			locked: 'Dû avant tout choix',
			movable: 'À vous de répartir',
			systems: 'postes sur le plateau',
			answers: 'réponses collectées'
		},
		field: {
			caption: (perDot) => `Le projet 2027, un point pour ${perDot} MD. Touchez un bloc pour le lire.`,
			idle: 'Tout le projet de budget',
			share: (pct) => `${pct} % du projet`,
			lockedNote: 'Dû avant tout choix. Ne bouge pas.',
			hint: 'Chiffres du projet, rapportés par la presse, non vérifiés.',
			listLabel: 'Le projet de budget, ligne par ligne'
		},
		facts: {
			heading: 'Pourquoi c’est plus difficile qu’il n’y paraît',
			items: [
				{ key: 'locked', title: 'Dû avant tout choix', body: 'Les intérêts de la dette passée et une réserve pour imprévus sont payés d’abord. Personne ne peut les déplacer cette année, ils restent à part sur le plateau.' },
				{ key: 'subsidies', title: 'Les subventions sont dans les ministères', body: 'Les subventions aux carburants, à l’électricité et aux produits de base passent par les budgets de l’Industrie et du Commerce. Le plateau les isole en une ligne, pour qu’on les voie et qu’on puisse les déplacer.' },
				{ key: 'largest', title: 'Quelques postes tiennent l’essentiel', body: 'Les quatre plus grands postes tiennent cette part de tout ce qui peut bouger. Sur une même échelle, les plus petits sont des filets.' },
				{ key: 'zero', title: 'Chaque dinar vient de quelque part', body: 'Le total ne bouge pas. Donnez 100 MD à un poste et vous les avez pris à un autre, ou à la bourse.' }
			]
		},
		demo: {
			title: 'Essayez avec trois postes',
			body: 'Glissez un poste sur un autre, ou utilisez les boutons. Ce sont les chiffres du projet pour trois des seize postes.',
			purse: 'Bourse',
			reset: 'Remettre',
			take: (name) => `Retirer 100 MD de ${name}`,
			give: (name) => `Verser 100 MD à ${name}`,
			fullBoard: 'Ouvrir le plateau complet'
		},
		example: {
			title: 'Un exemple chiffré',
			intro: 'Partez du projet et glissez la Défense sur la Santé trois fois. Trois pièces de 100 MD se déplacent. La bourse reste vide, le plateau peut donc être terminé.',
			stored: 'Conservé comme la part de chaque ligne par rapport à son projet, en points de base : 10 000 est le projet.',
			note: 'Chiffres du projet. Le choix est inventé.',
			head: { system: 'Poste', plan: 'Projet', yours: 'Le vôtre', change: 'Écart', storedAs: 'Conservé' }
		},
		figures: {
			system: 'Ligne du plateau',
			draft: 'Projet, MD',
			status: 'Statut',
			madeOf: 'Composée de',
			less: 'moins',
			chip: { 'draft-press': 'Presse, non vérifié', 'draft-derived': 'Calculé, non vérifié', 'draft-plf': 'Projet de loi', 'adopted-lf': 'Loi adoptée' },
			sources: 'Chaque ligne du fichier des chiffres, avec sa source',
			locked: 'Dû, ne bouge pas',
			total: 'Total'
		},
		sections: [
			{
				id: 'question',
				num: '01',
				label: 'La question',
				heading: 'Si le budget était à vous de répartir',
				body: [
					'L’étude pose une seule question : avec le budget 2027 préparé par l’État, où mettriez-vous l’argent ? Vous répondez sur un plateau qui contient les chiffres du projet, et vous terminez quand chaque dinar est placé.',
					'Un budget n’est pas une liste de souhaits séparés. L’argent donné aux écoles n’est pas donné aux hôpitaux, à l’armée ou aux subventions. Le plateau rend cet arbitrage visible, et l’étude enregistre les choix que les gens font avec lui.'
				]
			},
			{
				id: 'board',
				num: '02',
				label: 'Le plateau',
				heading: 'Un plateau, une pièce, aucun score',
				body: [
					'Chaque poste montre deux barres sur une même échelle : le projet de l’État pour 2027, et le vôtre. Glissez un poste sur un autre et une pièce de 100 MD passe de l’un à l’autre. Restez immobile pour que l’argent continue de couler. L’argent retiré et pas encore placé attend dans la bourse, et vous terminez quand la bourse est vide.',
					'Rien n’est noté ni classé. Garder le projet tel quel est une réponse.'
				]
			},
			{
				id: 'figures',
				num: '03',
				label: 'Les chiffres',
				heading: 'Chiffres du projet, chacun avec son statut',
				body: [
					'Chaque montant ici est un chiffre du projet rapporté par la presse pendant les auditions budgétaires. Aucun n’a encore été vérifié sur le document officiel. L’étude n’ouvrira pas sur un chiffre sans référence de page dans la loi adoptée.',
					'Certaines lignes du plateau réunissent plusieurs ministères, et la ligne des subventions est découpée dans deux d’entre eux. Le tableau dit de quoi chaque ligne est faite.'
				]
			},
			{
				id: 'method',
				num: '04',
				label: 'Méthode',
				heading: 'Comment les réponses seront lues',
				body: [
					'Pour chaque ligne : la part des répondants qui lui donneraient plus, autant ou moins que son projet, et l’écart médian avec son intervalle interquartile. Le budget moyen soumis, avec un intervalle bootstrap. Une mesure de consensus. Un résultat sans le plus grand canal de lien.',
					'Les résultats ne sont affichés qu’au-dessus de 100 réponses valides, et aucune cellule de moins de 20 n’est montrée. Population : parmi les répondants à une enquête en ligne ouverte et auto-sélectionnée auprès d’adultes. Les résultats décrivent les personnes qui ont participé, pas le pays dans son ensemble.'
				]
			},
			{
				id: 'questions',
				num: '05',
				label: 'Questions',
				heading: 'Chaque question, telle qu’elle sera posée',
				body: ['Tout le questionnaire, dans l’ordre. Rien d’autre n’est demandé. Les mots restent un projet jusqu’au gel de l’étude.']
			},
			{
				id: 'stored',
				num: '06',
				label: 'Ce qui est conservé',
				heading: 'Seulement ce que les réponses exigent',
				body: [
					'Conservé par réponse : votre budget en part de chaque ligne, deux courtes réponses, la région facultative, la version et la langue de l’étude, le canal qui vous a amené, les durées, et un code de reçu aléatoire.',
					'Jamais conservés : votre nom, votre adresse e-mail, votre adresse IP, les détails de votre appareil, la localisation au-delà de la région facultative, ou le texte libre. Le prototype ne conserve rien.'
				]
			},
			{
				id: 'cannot',
				num: '07',
				label: 'Ce qu’elle ne peut pas dire',
				heading: 'Ce que ces réponses ne sont pas',
				body: ['Les réponses sont la trace des choix des personnes qui les ont faits. Elles ne peuvent pas tenir lieu de pays.']
			},
			{
				id: 'record',
				num: '08',
				label: 'Registre',
				heading: 'Le statut, dit simplement',
				body: ['L’étude est en conception. Rien n’est collecté, et aucune instance n’a validé le dispositif.']
			},
			{
				id: 'take',
				num: '09',
				label: 'Participer',
				heading: 'Pas encore ouvert',
				body: [
					'Il n’y a encore rien à soumettre. Le plateau est ouvert comme prototype : il utilise les chiffres du projet et ne conserve rien.',
					'L’étude n’ouvrira qu’après la vérification des chiffres sur la loi adoptée et la fin des examens.'
				]
			}
		],
		cannotSay: [
			'Pas une image de la préférence nationale, et pas un résultat national. La participation est ouverte et auto-sélectionnée.',
			'Pas ce que le budget devrait être.',
			'Pas si une ligne est gaspillée.',
			'Pas un classement des répondants, ni de leurs choix.'
		],
		recordFacts: [
			{ label: 'Étape', value: 'Conception. L’étude n’est pas ouverte.' },
			{ label: 'Examen éthique', value: 'Aucun n’a eu lieu.' },
			{ label: 'Examen de protection des données', value: 'Aucun n’a eu lieu.' },
			{ label: 'Préenregistrement', value: 'Non enregistré.' },
			{ label: 'Responsable de recherche', value: 'Non nommé.' },
			{ label: 'Chiffres', value: 'Provisoires, rapportés par la presse, non vérifiés.' },
			{ label: 'Traduction', value: 'Anglais seulement pour l’instant. Le français et l’arabe sont des brouillons en attente de relecture.' }
		],
		draftNotice: 'Chaque chiffre de cette page est un projet rapporté par la presse, non un chiffre officiel vérifié.',
		interimNotice: 'Traduction provisoire, non relue par une personne de langue maternelle.',
		closing: ['Le total ne bouge pas.', 'Seule sa répartition change.'],
		answerKinds: { consent: 'Case obligatoire', allocation: 'Sur le plateau', single_choice: 'Un seul choix', scale_0_10: 'De 0 à 10' },
		optional: 'facultatif',
		share: {
			button: 'Copier le lien',
			heading: 'Partager cette page',
			text: 'En conception, pas de collecte. Le lien ouvre la page publique publiée.'
		}
	},

	ar: {
		kicker: 'أبحاث DeepTunisia · 003 · دراسة الميزانية',
		title: 'الميزانية المواطنة 2027',
		hook: '91 دينارًا من كل 100 دينار تجمعها الدولة بنفسها تأتي من الضريبة. وما بقي من الميزانية مجموعة اختيارات. تسأل هذه الدراسة كيف كنت ستتّخذها.',
		cover: 'وزّع بنفسك ميزانية الدولة لسنة 2027، على لوحة واحدة، بأرقام المشروع. كلّ دينار تعطيه لقطاع تأخذه من قطاع آخر.',
		status: 'قيد التصميم · لا جمع للردود',
		notCollecting: 'لا تُجمع أيّ إجابة بعد. نُشرت السؤال والأرقام والقواعد هنا أوّلًا، ليمكن التحقّق منها قبل أن يجيب أحد.',
		ctaBoard: 'جرّب اللوحة',
		ctaNote: 'نموذج أوّلي. أرقام المشروع. لا يُرسل شيء ولا يُحفظ.',
		unit: 'م.د',
		tally: {
			total: 'نفقات المشروع، 2027',
			locked: 'واجب الدفع قبل أيّ اختيار',
			movable: 'لك أن توزّعه',
			systems: 'قطاعًا على اللوحة',
			answers: 'إجابة مجمّعة'
		},
		field: {
			caption: (perDot) => `مشروع 2027، نقطة لكلّ ${perDot} م.د. المس كتلة لتقرأها.`,
			idle: 'مشروع الميزانية كاملًا',
			share: (pct) => `${pct}% من المشروع`,
			lockedNote: 'واجب الدفع قبل أيّ اختيار. لا يتحرّك.',
			hint: 'أرقام المشروع، نقلتها الصحافة، غير متحقّق منها.',
			listLabel: 'مشروع الميزانية، بندًا بندًا'
		},
		facts: {
			heading: 'لماذا هو أصعب ممّا يبدو',
			items: [
				{ key: 'locked', title: 'واجب الدفع قبل أيّ اختيار', body: 'تُدفع فوائد الديون السابقة واحتياطي النفقات الطارئة أوّلًا. لا يستطيع أحد تحريكها هذه السنة، لذلك تبقى منفصلة على اللوحة.' },
				{ key: 'subsidies', title: 'الدعم مخفيّ داخل الوزارات', body: 'يُصرف دعم المحروقات والكهرباء والمواد الأساسية عبر ميزانيتي الصناعة والتجارة. تفصله اللوحة في بند خاصّ به، ليُرى ويمكن تحريكه.' },
				{ key: 'largest', title: 'قطاعات قليلة تحمل معظم المال', body: 'تحمل أكبر أربعة قطاعات هذه النسبة من كلّ ما يمكن تحريكه. وعلى سلّم واحد، تبدو أصغر القطاعات خيوطًا رفيعة.' },
				{ key: 'zero', title: 'كلّ دينار يأتي من مكان ما', body: 'المجموع لا يتغيّر. أعطِ قطاعًا 100 م.د وتكون قد أخذتها من قطاع آخر، أو من المحفظة.' }
			]
		},
		demo: {
			title: 'جرّب بثلاثة قطاعات',
			body: 'اسحب قطاعًا على آخر، أو استعمل الأزرار. هذه أرقام المشروع لثلاثة من القطاعات الستّة عشر.',
			purse: 'المحفظة',
			reset: 'أعدها كما كانت',
			take: (name) => `خذ 100 م.د من ${name}`,
			give: (name) => `أعطِ 100 م.د إلى ${name}`,
			fullBoard: 'افتح اللوحة كاملة'
		},
		example: {
			title: 'مثال محسوب',
			intro: 'ابدأ من المشروع واسحب الدفاع على الصحّة ثلاث مرّات. تنتقل ثلاث قطع من 100 م.د. تبقى المحفظة فارغة، فيمكن إنهاء اللوحة.',
			stored: 'يُحفظ كلّ بند كنسبة من مخصّصه في المشروع، بالنقاط الأساسية: 10000 هي المشروع.',
			note: 'أرقام المشروع. الاختيار مُتخيَّل.',
			head: { system: 'القطاع', plan: 'المشروع', yours: 'توزيعك', change: 'الفرق', storedAs: 'ما يُحفظ' }
		},
		figures: {
			system: 'بند اللوحة',
			draft: 'المشروع، م.د',
			status: 'الوضع',
			madeOf: 'يتكوّن من',
			less: 'ناقص',
			chip: { 'draft-press': 'الصحافة، غير متحقّق', 'draft-derived': 'محسوب، غير متحقّق', 'draft-plf': 'مشروع القانون', 'adopted-lf': 'القانون المصادق عليه' },
			sources: 'كلّ صفّ في ملفّ الأرقام، مع مصدره',
			locked: 'واجب، لا يتحرّك',
			total: 'المجموع'
		},
		sections: [
			{
				id: 'question',
				num: '01',
				label: 'السؤال',
				heading: 'لو كانت الميزانية بين يديك',
				body: [
					'تطرح الدراسة سؤالًا واحدًا: مع ميزانية 2027 التي أعدّتها الدولة، أين كنت ستضع المال؟ تجيب على لوحة تحمل أرقام المشروع، وتنهي حين يكون كلّ دينار في مكانه.',
					'الميزانية ليست قائمة أمنيات منفصلة. المال الذي يُعطى للمدارس لا يُعطى للمستشفيات أو الجيش أو دعم المحروقات. تجعل اللوحة هذه المقايضة مرئيّة، وتسجّل الدراسة اختيارات الناس بها.'
				]
			},
			{
				id: 'board',
				num: '02',
				label: 'اللوحة',
				heading: 'لوحة واحدة، قطعة واحدة، بلا نقاط',
				body: [
					'يُظهر كلّ قطاع شريطين على سلّم واحد: مشروع الدولة لسنة 2027، وتوزيعك. اسحب قطاعًا على آخر فتنتقل بينهما قطعة من 100 م.د. ابقَ ثابتًا ليستمرّ تدفّق المال. المال الذي تأخذه ولم تضعه بعد ينتظر في المحفظة، وتنهي حين تفرغ المحفظة.',
					'لا شيء يُنقَّط أو يُرتَّب. الإبقاء على المشروع كما هو إجابة مقبولة.'
				]
			},
			{
				id: 'figures',
				num: '03',
				label: 'الأرقام',
				heading: 'أرقام المشروع، كلّ منها بوضعه',
				body: [
					'كلّ مبلغ هنا رقم من المشروع نقلته الصحافة خلال جلسات الميزانية. لم يُتحقَّق من أيّ منها بعد في الوثيقة الرسمية. لن تُفتح الدراسة على رقم ليس له مرجع صفحة في القانون المصادق عليه.',
					'تجمع بعض بنود اللوحة عدّة وزارات، وبند الدعم مقتطع من اثنتين منها. يبيّن الجدول ممّا يتكوّن كلّ بند.'
				]
			},
			{
				id: 'method',
				num: '04',
				label: 'المنهج',
				heading: 'كيف ستُقرأ الإجابات',
				body: [
					'لكلّ بند: نسبة المستجيبين الذين سيعطونه أكثر أو مثله أو أقلّ من مشروعه، والتغيّر الوسيط مع مداه الربيعي. والميزانية المتوسّطة المقدَّمة، مع مجال ثقة بطريقة bootstrap. ومقياس توافق. ونتيجة دون أكبر قناة ربط.',
					'لا تُعرض النتائج إلّا فوق 100 إجابة صالحة، ولا تُعرض أيّ خليّة أقلّ من 20. المجتمع: بين المستجيبين لاستبيان إلكتروني مفتوح وقائم على الانتقاء الذاتي للبالغين. تصف النتائج الأشخاص الذين شاركوا، لا البلد في مجموعه.'
				]
			},
			{
				id: 'questions',
				num: '05',
				label: 'الأسئلة',
				heading: 'كلّ سؤال، كما سيُطرح',
				body: ['الاستبيان كاملًا، بالترتيب. لا يُسأل شيء غير ذلك. تبقى الصياغة مسودّة إلى أن تُثبَّت الدراسة.']
			},
			{
				id: 'stored',
				num: '06',
				label: 'ما يُحفظ',
				heading: 'فقط ما تحتاجه الإجابات',
				body: [
					'يُحفظ لكلّ ردّ: ميزانيتك كنسبة من كلّ بند، وإجابتان قصيرتان، والمنطقة الاختيارية، ونسخة الدراسة ولغتها، والقناة التي أوصلتك، والمدد، ورمز إيصال عشوائي.',
					'لا يُحفظ أبدًا: اسمك، أو بريدك الإلكتروني، أو عنوان IP، أو تفاصيل جهازك، أو موقع يتجاوز المنطقة الاختيارية، أو نصّ حرّ. النموذج الأوّلي لا يحفظ شيئًا.'
				]
			},
			{
				id: 'cannot',
				num: '07',
				label: 'ما لا تستطيع قوله',
				heading: 'ما ليست هذه الإجابات',
				body: ['الإجابات سجلّ لاختيارات من قاموا بها. ولا يمكنها أن تنوب عن بلد.']
			},
			{
				id: 'record',
				num: '08',
				label: 'السجل',
				heading: 'الوضع، مقولًا ببساطة',
				body: ['الدراسة قيد التصميم. لا يُجمع شيء، ولم تُقرّها أيّ مراجعة.']
			},
			{
				id: 'take',
				num: '09',
				label: 'المشاركة',
				heading: 'ليست مفتوحة بعد',
				body: [
					'لا شيء للإرسال بعد. اللوحة مفتوحة كنموذج أوّلي: تستعمل أرقام المشروع ولا تحفظ شيئًا.',
					'لن تُفتح الدراسة إلّا بعد التحقّق من الأرقام في القانون المصادق عليه واكتمال المراجعات.'
				]
			}
		],
		cannotSay: [
			'ليست صورة للتفضيل الوطني، وليست نتيجة وطنية. المشاركة مفتوحة وقائمة على الانتقاء الذاتي.',
			'ليست ما ينبغي أن تكون عليه الميزانية.',
			'ليست حكمًا على جدوى أيّ بند أو هدره.',
			'ليست ترتيبًا للمستجيبين ولا لاختياراتهم.'
		],
		recordFacts: [
			{ label: 'المرحلة', value: 'التصميم. الدراسة ليست مفتوحة.' },
			{ label: 'المراجعة الأخلاقية', value: 'لم تجرِ أيّ مراجعة.' },
			{ label: 'مراجعة حماية البيانات', value: 'لم تجرِ أيّ مراجعة.' },
			{ label: 'التسجيل المسبق', value: 'غير مسجّل.' },
			{ label: 'الباحث الرئيسي', value: 'غير مسمّى.' },
			{ label: 'الأرقام', value: 'مؤقّتة، نقلتها الصحافة، غير متحقّق منها.' },
			{ label: 'الترجمة', value: 'الإنجليزية فقط في الوقت الحالي. الفرنسية والعربية مسودّتان في انتظار المراجعة.' }
		],
		draftNotice: 'كلّ رقم في هذه الصفحة مشروع نقلته الصحافة، وليس رقمًا رسميًّا متحقّقًا منه.',
		interimNotice: 'ترجمة مؤقّتة، لم يراجعها متحدّث بالعربية كلغة أم.',
		closing: ['المجموع لا يتغيّر.', 'وحده توزيعه يتغيّر.'],
		answerKinds: { consent: 'خانة إلزامية', allocation: 'على اللوحة', single_choice: 'اختيار واحد', scale_0_10: 'من 0 إلى 10' },
		optional: 'اختياري',
		share: {
			button: 'انسخ الرابط',
			heading: 'شارك هذه الصفحة',
			text: 'قيد التصميم، لا جمع للردود. الرابط يفتح صفحة الهبوط المنشورة.'
		}
	}
};
