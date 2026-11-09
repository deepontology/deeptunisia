/**
 * Copy for the citizen budget game prototype.
 *
 * Every figure the screens show comes from lines.ts and is a placeholder. The
 * copy never names a press figure, a total or a ministry amount.
 *
 * Arabic and French are drafts. They are marked on screen as unreviewed until a
 * native reviewer has read them.
 */
import type { Locale } from '$lib/i18n';

export type LineId =
	| 'schools'
	| 'universities'
	| 'health'
	| 'social'
	| 'fuel'
	| 'food'
	| 'energy'
	| 'police'
	| 'army'
	| 'justice'
	| 'farming'
	| 'roads'
	| 'youth'
	| 'culture'
	| 'presidency'
	| 'government'
	| 'other'
	| 'debt'
	| 'reserve';

export interface LineCopy {
	name: string;
	note: string;
}

export interface Copy {
	prototype: string;
	unreviewed: string | null;
	title: string;
	status: string;
	stepLabels: { intro: string; frame: string; game: string; items: string; card: string };
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
	game: {
		title: string;
		hint: string;
		draft: string;
		yours: string;
		change: string;
		keepDraft: string;
		reset: string;
		envelope: string;
		spent: string;
		borrow: (amount: string) => string;
		leftover: (amount: string) => string;
		balanced: string;
		lockedWhy: string;
		sliderLabel: (line: string) => string;
		next: string;
		back: string;
		meterLabel: string;
		rowsLabel: string;
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
	prototype: 'Prototype · placeholder figures',
	unreviewed: null,
	title: 'Citizen budget game',
	status: 'Design prototype. Not fielded. Not collecting.',
	stepLabels: { intro: 'About', frame: 'Frame', game: 'Budget', items: 'Questions', card: 'Result' },
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
			'Every figure on these screens is a placeholder. None is checked against the official budget document. The real study will give the source and page for each line before it opens.',
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
		factsHeading: 'Three facts, all placeholders',
		fact1: (total) => `The 2027 spending total is about ${total} MD (placeholder).`,
		fact2: 'Where the money comes from: tax, other income and borrowing (placeholder split).',
		fact3: 'Most of every line is salaries (placeholder share).',
		placeholder: 'Placeholder, not verified',
		next: 'Open the budget',
		back: 'Back'
	},
	game: {
		title: 'Move the money',
		hint: 'Each line starts at the draft amount. Move any line from 0% to 200% of it. The meter must balance before you can go on.',
		draft: 'Draft',
		yours: 'Yours',
		change: 'Change',
		keepDraft: 'I would keep the draft as it is',
		reset: 'Reset to draft',
		envelope: 'Money for these lines',
		spent: 'You spend',
		borrow: (amount) => `You would borrow ${amount} MD to pay for this.`,
		leftover: (amount) => `${amount} MD is left unspent. Move it to a line.`,
		balanced: 'Balanced. You can go on.',
		lockedWhy: 'Locked, not up for change in this game.',
		sliderLabel: (line) => `Share of the draft for ${line}`,
		next: 'Go on',
		back: 'Back',
		meterLabel: 'Balance meter',
		rowsLabel: 'Lines and amounts'
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
		note: 'Placeholder figures, not verified. This prototype stops here: nothing is sent or stored.',
		total: 'Total',
		keptDraft: 'You kept the draft as it is.',
		restart: 'Start again',
		back: 'Change my budget',
		stop: 'In the prototype, the submit button stops at this card.'
	},
	unit: 'MD',
	lines: {
		schools: { name: 'Schools', note: 'Teachers, buildings and school meals.' },
		universities: { name: 'Universities and research', note: 'Universities, labs and research grants.' },
		health: { name: 'Health', note: 'Hospitals, clinics and medicines.' },
		social: { name: 'Social protection', note: 'Pensions, cash support and family help.' },
		fuel: { name: 'Fuel and electricity subsidies', note: 'Lower prices for fuel and power bills.' },
		food: { name: 'Basic food subsidies', note: 'Lower prices for bread, flour, oil and sugar.' },
		energy: { name: 'Energy and industry, without subsidies', note: 'Public firms and industry support, not price subsidies.' },
		police: { name: 'Police and internal security', note: 'Police, gendarmerie and internal security forces.' },
		army: { name: 'Army', note: 'Armed forces pay, equipment and training.' },
		justice: { name: 'Justice and prisons', note: 'Courts and prisons.' },
		farming: { name: 'Farming and water', note: 'Farmers, irrigation and water supply.' },
		roads: { name: 'Roads, housing and transport', note: 'Roads, public housing and transport.' },
		youth: { name: 'Youth and sports', note: 'Youth centres and sports.' },
		culture: { name: 'Culture and arts', note: 'Heritage, theatre, cinema and museums.' },
		presidency: { name: 'Presidency', note: 'The office of the President of the Republic.' },
		government: { name: 'Government, parliament and diplomacy', note: 'Government offices, parliament, elections and embassies.' },
		other: { name: 'Everything else', note: 'Every other ministry and body.' },
		debt: { name: 'Debt interest', note: 'Interest owed on existing debt. A cut would mean default.' },
		reserve: { name: 'Unforeseen reserve', note: 'Kept for costs nobody planned for.' }
	}
};

const fr: Copy = {
	prototype: 'Prototype · chiffres provisoires',
	unreviewed: 'Traduction française provisoire, pas encore relue par un locuteur natif.',
	title: 'Jeu du budget citoyen',
	status: 'Prototype de conception. Non lancé. Aucune collecte.',
	stepLabels: { intro: 'Présentation', frame: 'Cadre', game: 'Budget', items: 'Questions', card: 'Résultat' },
	intro: {
		whatWeAsk: 'Ce que nous demandons',
		whatWeAskBody:
			"Comment vous répartiriez l’argent entre les lignes du budget de l’État 2027, en tant que citoyen. Environ cinq minutes. Il n’y a pas de bonne réponse et pas de score.",
		stored: 'Ce qui est conservé',
		storedBody:
			"Dans ce prototype, rien. Dans l’étude réelle : votre budget sous forme de parts de chaque ligne, deux courtes réponses, la version de l’étude et la durée. Ni nom, ni courriel, ni adresse IP, ni données d’appareil.",
		who: 'Qui la mène',
		whoBody: "DeepTunisia. Ceci est un prototype de conception. L’étude n’a pas été approuvée et n’est pas ouverte.",
		figures: "D’où viennent les chiffres",
		figuresBody:
			"Chaque chiffre affiché est provisoire. Aucun n’est vérifié contre le document budgétaire officiel. L’étude réelle indiquera la source et la page de chaque ligne avant son ouverture.",
		sample: 'Ce que les réponses peuvent et ne peuvent pas dire',
		sampleBody:
			"Elles décrivent les personnes qui participent à une enquête en ligne ouverte et sans tirage au sort, auprès d’adultes. Elles ne décrivent pas les Tunisiens dans leur ensemble.",
		consentAge: "J’ai 18 ans ou plus.",
		consentPrototype: 'Je comprends que ce prototype ne conserve rien de ce que je saisis.',
		start: 'Commencer',
		under18: "Cette étude est réservée aux adultes. Rien de ce que vous avez saisi n’est conservé. Vous pouvez fermer cette page."
	},
	frame: {
		title: 'Répondez en tant que citoyen',
		body: "Pas en tant que ministre, économiste ou membre d’un parti. Il n’y a pas de bonne réponse et pas de score.",
		factsHeading: 'Trois faits, tous provisoires',
		fact1: (total) => `Le total des dépenses de l’État pour 2027 est d’environ ${total} MD (provisoire).`,
		fact2: "D’où vient l’argent : impôts, autres recettes et emprunts (répartition provisoire).",
		fact3: 'La plus grande part de chaque ligne sert à payer des salaires (chiffre provisoire).',
		placeholder: 'Provisoire, non vérifié',
		next: 'Ouvrir le budget',
		back: 'Retour'
	},
	game: {
		title: "Déplacez l’argent",
		hint: "Chaque ligne part du montant du projet. Réglez chaque ligne de 0 % à 200 % de ce montant. La jauge doit être équilibrée pour continuer.",
		draft: 'Projet',
		yours: 'Vous',
		change: 'Écart',
		keepDraft: 'Je garderais le projet tel quel',
		reset: 'Revenir au projet',
		envelope: 'Argent pour ces lignes',
		spent: 'Vous dépensez',
		borrow: (amount) => `Vous emprunteriez ${amount} MD pour payer cela.`,
		leftover: (amount) => `${amount} MD ne sont pas dépensés. Affectez-les à une ligne.`,
		balanced: 'Équilibrée. Vous pouvez continuer.',
		lockedWhy: 'Bloqué, non modifiable dans ce jeu.',
		sliderLabel: (line) => `Part du projet pour ${line}`,
		next: 'Continuer',
		back: 'Retour',
		meterLabel: "Jauge d’équilibre",
		rowsLabel: 'Lignes et montants'
	},
	items: {
		title: 'Deux courtes questions',
		q1: "Sachant que l’écart est financé par l’emprunt, les dépenses totales devraient-elles être plus basses, les mêmes, ou plus élevées ?",
		q1Lower: 'Plus basses',
		q1Same: 'Les mêmes',
		q1Higher: 'Plus élevées',
		q2: "Quel pouvoir les citoyens ont-ils aujourd’hui sur la façon dont le budget est dépensé ? 0 signifie aucun, 10 signifie beaucoup.",
		q2Low: 'Aucun',
		q2High: 'Beaucoup',
		submit: 'Soumettre mon budget',
		back: 'Retour'
	},
	card: {
		title: 'Votre budget à côté du projet',
		note: "Chiffres provisoires, non vérifiés. Ce prototype s’arrête ici : rien n’est envoyé ni conservé.",
		total: 'Total',
		keptDraft: 'Vous avez gardé le projet tel quel.',
		restart: 'Recommencer',
		back: 'Modifier mon budget',
		stop: 'Dans le prototype, le bouton de soumission s’arrête à cette fiche.'
	},
	unit: 'MD',
	lines: {
		schools: { name: 'Écoles', note: 'Enseignants, bâtiments et cantines.' },
		universities: { name: 'Universités et recherche', note: 'Universités, laboratoires et bourses de recherche.' },
		health: { name: 'Santé', note: 'Hôpitaux, dispensaires et médicaments.' },
		social: { name: 'Protection sociale', note: 'Retraites, aides en espèces et aide aux familles.' },
		fuel: { name: 'Subventions au carburant et à l’électricité', note: 'Prix plus bas pour le carburant et les factures d’électricité.' },
		food: { name: 'Subventions aux produits de base', note: 'Prix plus bas pour le pain, la farine, l’huile et le sucre.' },
		energy: { name: 'Énergie et industrie, hors subventions', note: "Entreprises publiques et soutien à l’industrie, sans subventions sur les prix." },
		police: { name: 'Police et sécurité intérieure', note: 'Police, gendarmerie et forces de sécurité intérieure.' },
		army: { name: 'Armée', note: 'Solde, équipements et formation des forces armées.' },
		justice: { name: 'Justice et prisons', note: 'Tribunaux et prisons.' },
		farming: { name: 'Agriculture et eau', note: 'Agriculteurs, irrigation et approvisionnement en eau.' },
		roads: { name: 'Routes, logement et transport', note: 'Routes, logement public et transports.' },
		youth: { name: 'Jeunesse et sport', note: 'Maisons de jeunes et sport.' },
		culture: { name: 'Culture et arts', note: 'Patrimoine, théâtre, cinéma et musées.' },
		presidency: { name: 'Présidence', note: 'La présidence de la République.' },
		government: { name: 'Gouvernement, parlement et diplomatie', note: 'Services du gouvernement, parlement, élections et ambassades.' },
		other: { name: 'Tout le reste', note: 'Tous les autres ministères et organismes.' },
		debt: { name: 'Intérêts de la dette', note: 'Intérêts dus sur la dette existante. Une baisse signifierait un défaut.' },
		reserve: { name: 'Réserve pour imprévus', note: 'Réservée aux dépenses que personne n’avait prévues.' }
	}
};

const ar: Copy = {
	prototype: 'نموذج أولي · أرقام مؤقتة',
	unreviewed: 'ترجمة عربية مبدئية، لم يراجعها بعد متحدث أصلي.',
	title: 'لعبة الميزانية للمواطن',
	status: 'نموذج تصميمي. لم يُطلق. لا يجمع أي بيانات.',
	stepLabels: { intro: 'تعريف', frame: 'الإطار', game: 'الميزانية', items: 'أسئلة', card: 'النتيجة' },
	intro: {
		whatWeAsk: 'ما الذي نسأل عنه',
		whatWeAskBody:
			'كيف تنقل الأموال بين بنود ميزانية الدولة لسنة 2027، بصفتك مواطنًا. نحو خمس دقائق. لا توجد إجابة صحيحة ولا نقاط.',
		stored: 'ما الذي يُحفظ',
		storedBody:
			'في هذا النموذج، لا شيء. في الدراسة الفعلية: ميزانيتك كنسب من كل بند، وإجابتان قصيرتان، ونسخة الدراسة، والمدة التي استغرقتها. لا اسم ولا بريد إلكتروني ولا عنوان IP ولا بيانات الجهاز.',
		who: 'من يديرها',
		whoBody: 'DeepTunisia. هذا نموذج تصميمي. لم تُعتمد الدراسة بعد ولم تُفتح.',
		figures: 'من أين جاءت الأرقام',
		figuresBody:
			'كل رقم على هذه الشاشات مؤقت. لم يُقارن أي منها بوثيقة الميزانية الرسمية. ستذكر الدراسة الفعلية المصدر والصفحة لكل بند قبل فتحها.',
		sample: 'ما الذي تستطيع الإجابات قوله وما الذي لا تستطيعه',
		sampleBody: 'تصف الإجابات الأشخاص الذين شاركوا في استطلاع إلكتروني مفتوح ذاتي الاختيار للبالغين. لا تصف التونسيين كافة.',
		consentAge: 'عمري 18 سنة أو أكثر.',
		consentPrototype: 'أفهم أن هذا النموذج لا يحفظ أي شيء أدخله.',
		start: 'ابدأ',
		under18: 'هذه الدراسة للبالغين فقط. لم يُحفظ أي شيء أدخلته. يمكنك إغلاق الصفحة.'
	},
	frame: {
		title: 'أجب بصفتك مواطنًا',
		body: 'لا بصفتك وزيرًا أو خبيرًا اقتصاديًا أو عضوًا في حزب. لا توجد إجابة صحيحة ولا نقاط.',
		factsHeading: 'ثلاث حقائق، كلها مؤقتة',
		fact1: (total) => `إجمالي إنفاق الدولة لسنة 2027 نحو ${total} مليون دينار (مؤقت).`,
		fact2: 'من أين يأتي المال: الضرائب والإيرادات الأخرى والاقتراض (التقسيم مؤقت).',
		fact3: 'أغلب كل بند رواتب (رقم مؤقت).',
		placeholder: 'مؤقت، لم يُتحقق منه',
		next: 'افتح الميزانية',
		back: 'رجوع'
	},
	game: {
		title: 'حرّك المال',
		hint: 'يبدأ كل بند من مبلغ المشروع. حرّك أي بند من 0% إلى 200% منه. يجب أن يتوازن المؤشر قبل المتابعة.',
		draft: 'المشروع',
		yours: 'أنت',
		change: 'التغيير',
		keepDraft: 'سأبقي المشروع كما هو',
		reset: 'العودة إلى المشروع',
		envelope: 'المال المخصص لهذه البنود',
		spent: 'تنفق',
		borrow: (amount) => `ستقترض ${amount} مليون دينار لتغطية هذا.`,
		leftover: (amount) => `${amount} مليون دينار لم يُنفق. ضع المبلغ في بند.`,
		balanced: 'متوازن. يمكنك المتابعة.',
		lockedWhy: 'مقفل، لا يمكن تغييره في هذه اللعبة.',
		sliderLabel: (line) => `نسبة ${line} من المشروع`,
		next: 'تابع',
		back: 'رجوع',
		meterLabel: 'مؤشر التوازن',
		rowsLabel: 'البنود والمبالغ'
	},
	items: {
		title: 'سؤالان قصيران',
		q1: 'مع العلم أن الفارق مُمول بالاقتراض، هل يجب أن يكون إجمالي الإنفاق أقل أم مساويًا أم أعلى؟',
		q1Lower: 'أقل',
		q1Same: 'مساويًا',
		q1Higher: 'أعلى',
		q2: 'ما مدى تأثير المواطنين اليوم على طريقة صرف الميزانية؟ 0 يعني لا تأثير، و10 يعني تأثيرًا كبيرًا.',
		q2Low: 'لا تأثير',
		q2High: 'تأثير كبير',
		submit: 'أرسل ميزانيتي',
		back: 'رجوع'
	},
	card: {
		title: 'ميزانيتك بجانب المشروع',
		note: 'أرقام مؤقتة لم يُتحقق منها. يتوقف هذا النموذج هنا: لا يُرسل شيء ولا يُحفظ.',
		total: 'المجموع',
		keptDraft: 'أبقيت المشروع كما هو.',
		restart: 'ابدأ من جديد',
		back: 'تعديل ميزانيتي',
		stop: 'في النموذج، يتوقف زر الإرسال عند هذه البطاقة.'
	},
	unit: 'م.د',
	lines: {
		schools: { name: 'المدارس', note: 'المعلمون والمباني والمطاعم المدرسية.' },
		universities: { name: 'الجامعات والبحث العلمي', note: 'الجامعات والمخابر والمنح البحثية.' },
		health: { name: 'الصحة', note: 'المستشفيات والمراكز الصحية والأدوية.' },
		social: { name: 'الحماية الاجتماعية', note: 'المعاشات والمساعدات النقدية ودعم الأسر.' },
		fuel: { name: 'دعم المحروقات والكهرباء', note: 'أسعار أقل للوقود وفواتير الكهرباء.' },
		food: { name: 'دعم المواد الغذائية الأساسية', note: 'أسعار أقل للخبز والدقيق والزيت والسكر.' },
		energy: { name: 'الطاقة والصناعة دون الدعم', note: 'المؤسسات العمومية ودعم الصناعة، دون دعم الأسعار.' },
		police: { name: 'الأمن الداخلي والشرطة', note: 'الشرطة والحرس الوطني وقوات الأمن الداخلي.' },
		army: { name: 'الجيش', note: 'رواتب القوات المسلحة وتجهيزها وتدريبها.' },
		justice: { name: 'العدل والسجون', note: 'المحاكم والسجون.' },
		farming: { name: 'الفلاحة والمياه', note: 'الفلاحون والري وتزويد المياه.' },
		roads: { name: 'الطرقات والسكن والنقل', note: 'الطرقات والسكن العمومي والنقل.' },
		youth: { name: 'الشباب والرياضة', note: 'دور الشباب والرياضة.' },
		culture: { name: 'الثقافة والفنون', note: 'التراث والمسرح والسينما والمتاحف.' },
		presidency: { name: 'رئاسة الجمهورية', note: 'مؤسسة رئيس الجمهورية.' },
		government: { name: 'الحكومة والبرلمان والدبلوماسية', note: 'مصالح الحكومة والبرلمان والانتخابات والسفارات.' },
		other: { name: 'كل ما عدا ذلك', note: 'كل الوزارات والهيئات الأخرى.' },
		debt: { name: 'فوائد الدين', note: 'فوائد الدين القائم. خفضها يعني التخلف عن السداد.' },
		reserve: { name: 'احتياطي النفقات غير المتوقعة', note: 'يُحتفظ به لتكاليف لم يخطط لها أحد.' }
	}
};

const COPY: Record<Locale, Copy> = { en, fr, ar };

export function copyFor(locale: Locale): Copy {
	return COPY[locale] ?? en;
}
