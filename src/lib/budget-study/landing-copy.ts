/**
 * Landing copy for the citizen budget study, in English, French and Arabic.
 *
 * The structure follows the police index landing: a kicker, a cover line, a
 * numbered set of sections, and the study's honest states. English is the
 * reviewed text. French and Arabic are interim drafts and say so.
 *
 * Every amount is a press-reported draft figure. The only sentence allowed to
 * carry the approved tax share is the approved one, and it appears in the hook.
 */

export type Locale = 'en' | 'fr' | 'ar';

export interface LandingSection {
	id: 'question' | 'board' | 'figures' | 'method' | 'stored' | 'cannot' | 'record' | 'take';
	num: string;
	label: string;
	heading: string;
	body: string[];
}

export interface LandingCopy {
	kicker: string;
	title: string;
	cover: string;
	hook: string;
	status: string;
	notCollecting: string;
	ctaPrototype: string;
	ctaNote: string;
	sections: LandingSection[];
	whyItMatters: string;
	intricacy: string;
	cannotSay: string[];
	stored: string;
	recordFacts: { label: string; value: string }[];
	figuresNote: string;
	draftNotice: string;
	graphicLabels: {
		draft: string;
		yours: string;
		locked: string;
		purse: string;
		systems: string;
		step: string;
	};
	interimNotice: string | null;
	hookTagline: [string, string];
	tally: { draftTotal: string; locked: string; movable: string };
	example: {
		title: string;
		formula: string;
		intro: string;
		step: (name: string, draft: string, stepMd: string) => string;
		invented: string;
		result: string;
	};
	share: { button: string; heading: string; text: string };
	sectionReadout: string;
}

export const landingCopy: Record<Locale, LandingCopy> = {
	en: {
		kicker: 'DeepTunisia research · 003 · budget study',
		title: 'Citizen budget 2027',
		cover:
			'Rebuild the 2027 state budget as a citizen. See what each choice gives up. Nothing you do is scored.',
		hook: '91 dinars in every 100 the state raises itself come from tax. The rest of the budget is a set of choices. This study asks how you would make them.',
		status: 'In design · not collecting',
		notCollecting:
			'Not collecting responses yet. The question, the figures and the rules are published below.',
		ctaPrototype: 'Open the prototype',
		ctaNote: 'Placeholder figures. Nothing is sent or stored.',
		sections: [
			{
				id: 'question',
				num: '01',
				label: 'The question',
				heading: 'How would you move money, as a citizen?',
				body: [
					'The study asks how you would move money between the lines of the 2027 state budget, and how far that changes what the state gives up elsewhere. You do it on a board, in a few minutes, until the purse is inside the finish band.',
					'A budget is not a list of separate wishes. Every dinar in one line is a dinar not in another. The study makes that constraint visible.'
				]
			},
			{
				id: 'board',
				num: '02',
				label: 'The board',
				heading: 'One budget, one board, no score',
				body: [
					'The purse starts empty and every system starts at its draft. Every system is drawn to the same scale in dinars, so the largest line is long and the smallest is a sliver. Taking money from a system moves it to the purse. Giving from the purse moves it into a system. You cannot give what you do not hold. Finish when the purse is within 0.5% of the envelope. The purse is never over-placed, so up to 0.5% may stay unspent, and the report shows that shortfall.',
					'Debt interest and the unforeseen reserve, 8,963 MD, are shown first, as already spent. The movable part, 59,932 MD, is spread across sixteen systems. Nothing here is scored or ranked.'
				]
			},
			{
				id: 'figures',
				num: '03',
				label: 'The figures',
				heading: 'Draft figures, with their status',
				body: [
					'Every amount below is a draft. Most are press-reported; two are derived from the total and are labelled so. None has been checked against the official document. The study will not freeze on a figure until it has a page reference in the adopted law.',
					'The draft 2027 spending total is 68,895 MD, excluding debt principal. Debt interest and the unforeseen reserve, 8,963 MD, are spent before the start. The movable part is 59,932 MD across sixteen systems. A subsidies row of 11,846 MD sits inside the Industry and Trade lines, so it is not added again. What remains of those two lines after the subsidies, 272.8 MD, is a derived line, not a ministry budget.'
				]
			},
			{
				id: 'method',
				num: '04',
				label: 'Method',
				heading: 'How the answers will be read',
				body: [
					'For each line: the share of respondents who would give it more, the same, or less than its draft, and the median change with its interquartile range. The average budget submitted, with a bootstrap interval. A consensus measure. A result without the largest link channel.',
					'Results are shown only above 100 valid answers, and no cell under 20 is shown. Population: among respondents to an open, self-selected online survey of adults. Results describe the people who took part, not the country as a whole.'
				]
			},
			{
				id: 'stored',
				num: '05',
				label: 'What is stored',
				heading: 'Only what the answers need',
				body: [
					'Stored per response: your budget as a share of each line, two short answers, optional region, the study version and locale, the channel that brought you, timings, and a random receipt code.',
					'Never stored: your name, email, IP address, device details, location beyond the optional region, or free text. The prototype stores nothing.'
				]
			},
			{
				id: 'cannot',
				num: '06',
				label: 'What it cannot say',
				heading: 'What these answers are not',
				body: [
					'The answers are a record of choices by the people who made them. They cannot stand in for a country.'
				]
			},
			{
				id: 'record',
				num: '07',
				label: 'Record',
				heading: 'The status, stated plainly',
				body: [
					'The study is in design. Nothing is collected, and no review has cleared it.'
				]
			},
			{
				id: 'take',
				num: '08',
				label: 'Take part',
				heading: 'Not open yet',
				body: [
					'There is nothing to submit. You can try the prototype, which stores nothing and uses placeholder figures.',
					'The study opens only after the figures are checked against the adopted law and the reviews are complete.'
				]
			}
		],
		whyItMatters:
			'The budget decides what the state can do. Reading it as a set of choices, with a fixed total, shows what each choice gives up.',
		intricacy:
			'Sixteen systems share one fixed envelope. A step is a fixed share of a system\u2019s draft, takes and gives move money one way, and the board is complete when the purse is within 0.5% of that envelope.',
		cannotSay: [
			'Not a picture of national preference, and not a national result. Taking part is open and self-selected.',
			'Not what the budget should be.',
			'Not whether any line is wasteful.',
			'Not a ranking of respondents, or of their choices.'
		],
		stored:
			'Your budget as a share of each line, two short answers, optional region, the study version and locale, the channel that brought you, timings, and a random receipt code. Nothing else.',
		recordFacts: [
			{ label: 'Stage', value: 'Design. The study is not open.' },
			{ label: 'Ethics review', value: 'None has taken place.' },
			{ label: 'Data-protection review', value: 'None has taken place.' },
			{ label: 'Preregistration', value: 'Not registered.' },
			{ label: 'Principal investigator', value: 'Not named.' },
			{ label: 'Figures', value: 'Draft, press-reported, not verified.' },
			{
				label: 'Translation',
				value: 'English only for now. French and Arabic are drafts pending review.'
			}
		],
		figuresNote: 'Press-reported draft figures. Not verified.',
		draftNotice: 'Every figure on this page is a press-reported draft, not a verified official figure.',
		graphicLabels: {
			draft: 'Draft',
			yours: 'Yours',
			locked: 'Locked, spent before the start',
			purse: 'Purse',
			systems: 'Systems',
			step: 'One step'
		},
		interimNotice: null,
		hookTagline: ['The total does not move.', 'Only where it goes does.'],
		tally: {
			draftTotal: 'Draft total',
			locked: 'Locked before the start',
			movable: 'Movable'
		},
		example: {
			title: 'A worked example',
			formula: 'purse = envelope − placed',
			intro: 'In this example the envelope is 100 MD and the starting draft is 40 MD. The numbers are invented.',
			step: (name, draft, stepMd) => `${name} is at ${draft} MD, and one step is ${stepMd} MD.`,
			invented: 'Invented for illustration. Not a figure from the budget.',
			result: 'After one step the purse holds the step, and the line sits that much below its draft.'
		},
		share: {
			button: 'Copy link',
			heading: 'Share this page',
			text: 'In design, not collecting. The link opens the published landing page.'
		},
		sectionReadout: 'You are in'
	},

	fr: {
		kicker: 'Recherche DeepTunisia · 003 · étude budgétaire',
		title: 'Budget citoyen 2027',
		cover:
			'Reconstruisez le budget de l\u2019État 2027 en tant que citoyen. Voyez ce que chaque choix coûte ailleurs. Rien de ce que vous faites n\u2019est noté.',
		hook: '91 dinars sur 100 que l\u2019État prélève lui-même proviennent de l\u2019impôt. Le reste du budget est un ensemble de choix. Cette étude demande comment vous les feriez.',
		status: 'En conception · pas de collecte',
		notCollecting:
			'Aucune réponse n\u2019est collectée pour l\u2019instant. La question, les chiffres et les règles sont publiés ci-dessous.',
		ctaPrototype: 'Ouvrir le prototype',
		ctaNote: 'Chiffres provisoires. Rien n\u2019est envoyé ni conservé.',
		sections: [
			{
				id: 'question',
				num: '01',
				label: 'La question',
				heading: 'Comment déplaceriez-vous l\u2019argent, en tant que citoyen\u00A0?',
				body: [
					'L\u2019étude demande comment vous déplaceriez l\u2019argent entre les lignes du budget de l\u2019État 2027, et dans quelle mesure cela change ce que l\u2019État abandonne ailleurs. Vous le faites sur un plateau, en quelques minutes, jusqu\u2019à ce que la cagnotte entre dans la marge de fin.',
					'Un budget n\u2019est pas une liste de souhaits séparés. Chaque dinar mis dans une ligne est un dinar qui n\u2019est pas dans une autre. L\u2019étude rend cette contrainte visible.'
				]
			},
			{
				id: 'board',
				num: '02',
				label: 'Le plateau',
				heading: 'Un budget, un plateau, aucun score',
				body: [
					'La cagnotte part vide et chaque système part à son projet. Chaque système est dessiné à la même échelle en dinars\u00A0: la ligne la plus grande est longue, la plus petite n\u2019est qu\u2019un trait. Prendre de l\u2019argent à un système le déplace vers la cagnotte. Donner depuis la cagnotte le place dans un système. Vous ne pouvez pas donner ce que vous ne détenez pas. Terminez quand la cagnotte est à moins de 0,5 % de l\u2019enveloppe. La cagnotte ne peut pas être dépassée\u00A0: jusqu\u2019à 0,5 % peut rester non placé, et le rapport indique ce reliquat.',
					'Les intérêts de la dette et la réserve pour imprévus, 8\u202F963 MD, sont montrés d\u2019abord, comme déjà dépensés. La part mobile, 59\u202F932 MD, se répartit sur seize systèmes. Rien ici n\u2019est noté ni classé.'
				]
			},
			{
				id: 'figures',
				num: '03',
				label: 'Les chiffres',
				heading: 'Des chiffres provisoires, avec leur statut',
				body: [
					'Chaque montant ci-dessous est provisoire. La plupart sont tirés de la presse\u00A0; deux sont dérivés du total et signalés comme tels. Aucun n\u2019a été vérifié sur le document officiel. L\u2019étude ne figera un chiffre qu\u2019une fois qu\u2019il aura une référence de page dans la loi adoptée.',
					'Le total provisoire des dépenses 2027 est de 68\u202F895 MD, hors principal de la dette. Les intérêts de la dette et la réserve pour imprévus, 8\u202F963 MD, sont dépensés avant le début. La part mobile est de 59\u202F932 MD sur seize systèmes. Une ligne de subventions de 11\u202F846 MD se trouve dans les lignes de l\u2019Industrie et du Commerce\u00A0; elle n\u2019est donc pas ajoutée. Ce qui reste de ces deux lignes après les subventions, 272,8 MD, est une ligne dérivée, non un budget ministériel.'
				]
			},
			{
				id: 'method',
				num: '04',
				label: 'Méthode',
				heading: 'Comment les réponses seront lues',
				body: [
					'Pour chaque ligne\u00A0: la part des répondants qui lui donneraient plus, autant ou moins que son projet, et l\u2019écart médian avec son intervalle interquartile. Le budget moyen soumis, avec un intervalle bootstrap. Une mesure de consensus. Un résultat sans le plus grand canal de lien.',
					'Les résultats ne sont affichés qu\u2019au-dessus de 100 réponses valides, et aucune cellule de moins de 20 n\u2019est montrée. Population\u00A0: parmi les répondants à une enquête en ligne ouverte et auto-sélectionnée auprès d\u2019adultes. Les résultats décrivent les personnes qui ont participé, pas le pays dans son ensemble.'
				]
			},
			{
				id: 'stored',
				num: '05',
				label: 'Ce qui est conservé',
				heading: 'Seulement ce que les réponses exigent',
				body: [
					'Conservé par réponse\u00A0: votre budget en part de chaque ligne, deux courtes réponses, la région facultative, la version et la langue de l\u2019étude, le canal qui vous a amené, les durées, et un code de reçu aléatoire.',
					'Jamais conservés\u00A0: votre nom, votre adresse e-mail, votre adresse IP, les détails de votre appareil, la localisation au-delà de la région facultative, ou le texte libre. Le prototype ne conserve rien.'
				]
			},
			{
				id: 'cannot',
				num: '06',
				label: 'Ce qu\u2019elle ne peut pas dire',
				heading: 'Ce que ces réponses ne sont pas',
				body: [
					'Les réponses sont la trace des choix des personnes qui les ont faits. Elles ne peuvent pas tenir lieu de pays.'
				]
			},
			{
				id: 'record',
				num: '07',
				label: 'Registre',
				heading: 'Le statut, dit simplement',
				body: [
					'L\u2019étude est en conception. Rien n\u2019est collecté, et aucune instance n\u2019a validé le dispositif.'
				]
			},
			{
				id: 'take',
				num: '08',
				label: 'Participer',
				heading: 'Pas encore ouvert',
				body: [
					'Il n\u2019y a rien à envoyer. Vous pouvez essayer le prototype, qui ne conserve rien et utilise des chiffres provisoires.',
					'L\u2019étude n\u2019ouvrira qu\u2019après la vérification des chiffres sur la loi adoptée et l\u2019achèvement des examens.'
				]
			}
		],
		whyItMatters:
			'Le budget décide de ce que l\u2019État peut faire. Le lire comme un ensemble de choix, à total fixe, montre ce que chaque choix coûte.',
		intricacy:
			'Seize systèmes partagent une seule enveloppe fixe. Un pas est une part fixe du projet d\u2019un système, les prises et les dons déplacent l\u2019argent dans un sens, et le plateau est terminé quand la cagnotte est à moins de 0,5 % de cette enveloppe.',
		cannotSay: [
			'Pas une image de la préférence nationale, et pas un résultat national. La participation est ouverte et auto-sélectionnée.',
			'Pas ce que le budget devrait être.',
			'Pas si une ligne est gaspillée.',
			'Pas un classement des répondants, ni de leurs choix.'
		],
		stored:
			'Votre budget en part de chaque ligne, deux courtes réponses, la région facultative, la version et la langue de l\u2019étude, le canal qui vous a amené, les durées, et un code de reçu aléatoire. Rien d\u2019autre.',
		recordFacts: [
			{ label: 'Étape', value: 'Conception. L\u2019étude n\u2019est pas ouverte.' },
			{ label: 'Examen éthique', value: 'Aucun n\u2019a eu lieu.' },
			{ label: 'Examen de protection des données', value: 'Aucun n\u2019a eu lieu.' },
			{ label: 'Préenregistrement', value: 'Non enregistré.' },
			{ label: 'Responsable de recherche', value: 'Non nommé.' },
			{ label: 'Chiffres', value: 'Provisoires, rapportés par la presse, non vérifiés.' },
			{
				label: 'Traduction',
				value:
					'Anglais seulement pour l\u2019instant. Le français et l\u2019arabe sont des brouillons en attente de relecture.'
			}
		],
		figuresNote: 'Chiffres provisoires rapportés par la presse. Non vérifiés.',
		draftNotice:
			'Chaque chiffre de cette page est un projet rapporté par la presse, non un chiffre officiel vérifié.',
		graphicLabels: {
			draft: 'Projet',
			yours: 'Le vôtre',
			locked: 'Verrouillé, dépensé avant le début',
			purse: 'Cagnotte',
			systems: 'Systèmes',
			step: 'Un pas'
		},
		interimNotice: 'Traduction provisoire, non relue par une personne de langue maternelle. Les nouveaux textes sont des brouillons intermédiaires.',
		hookTagline: ['Le total ne bouge pas.', 'Seulement l’endroit où il va.'],
		tally: {
			draftTotal: 'Total du projet',
			locked: 'Verrouillé avant le début',
			movable: 'Mobile'
		},
		example: {
			title: 'Un exemple chiffré',
			formula: 'cagnotte = enveloppe − placé',
			intro: 'Dans cet exemple, l’enveloppe est de 100 MD et le projet de départ de 40 MD. Les chiffres sont inventés.',
			step: (name, draft, stepMd) => `${name} est à ${draft} MD, et un pas vaut ${stepMd} MD.`,
			invented: 'Inventé pour l’illustration. Ce n’est pas un chiffre du budget.',
			result: 'Après un pas, la cagnotte détient le pas, et la ligne descend d’autant sous son projet.'
		},
		share: {
			button: 'Copier le lien',
			heading: 'Partager cette page',
			text: 'En conception, pas de collecte. Le lien ouvre la page publique publiée.'
		},
		sectionReadout: 'Vous êtes dans'
	},

	ar: {
		kicker: 'أبحاث DeepTunisia · 003 · دراسة الميزانية',
		title: 'الميزانية المواطنة 2027',
		cover:
			'أعِد بناء ميزانية الدولة لسنة 2027 كمواطن. انظر ما يتخلّى عنه كلّ اختيار. لا شيء ممّا تفعله يُقيَّم.',
		hook: '91 دينارًا من كل 100 دينار تجمعها الدولة بنفسها تأتي من الضريبة. وما بقي من الميزانية مجموعة اختيارات. تسأل هذه الدراسة كيف كنت ستتّخذها.',
		status: 'قيد التصميم · لا جمع للردود',
		notCollecting: 'لا تُجمع أي ردود بعد. السؤال والأرقام والقواعد منشورة أدناه.',
		ctaPrototype: 'افتح النموذج الأوّلي',
		ctaNote: 'أرقام مؤقّتة. لا يُرسَل شيء ولا يُحفظ.',
		sections: [
			{
				id: 'question',
				num: '01',
				label: 'السؤال',
				heading: 'كيف ستنقل المال، كمواطن؟',
				body: [
					'تسأل الدراسة كيف ستنقل المال بين بنود ميزانية الدولة لسنة 2027، وإلى أي حدّ يغيّر ذلك ما تتخلّى عنه الدولة في مكان آخر. تفعل ذلك على لوحة، في بضع دقائق، حتى تدخل المحفظة هامش الإنهاء.',
					'الميزانية ليست قائمة رغبات منفصلة. كلّ دينار في بند هو دينار ليس في بند آخر. تُظهر الدراسة هذا القيد.'
				]
			},
			{
				id: 'board',
				num: '02',
				label: 'اللوحة',
				heading: 'ميزانية واحدة، لوحة واحدة، بلا تنقيط',
				body: [
					'تبدأ المحفظة فارغة ويبدأ كلّ نظام عند مشروعه. يُرسم كلّ نظام بالمقياس نفسه بالدينار، فيكون أكبر بند طويلًا وأصغرها خيطًا رفيعًا. الأخذ من نظام ينقل المال إلى المحفظة. والعطاء من المحفظة يضعه في نظام. لا يمكنك أن تعطي ما لا تملك. تنتهي عندما تكون المحفظة داخل 0.5% من الغلاف. لا يمكن تجاوز الغلاف، وقد يبقى حتى 0.5% غير موضوع، ويُظهر التقرير هذا الفارق.',
					'تُعرض فوائد الدين واحتياطي الطوارئ، 8,963 م.د، أولًا، بوصفها أُنفقت قبل البداية. أمّا الجزء القابل للتحريك، 59,932 م.د، فيتوزّع على ستة عشر نظامًا. لا شيء هنا يُقيَّم أو يُرتَّب.'
				]
			},
			{
				id: 'figures',
				num: '03',
				label: 'الأرقام',
				heading: 'أرقام مؤقّتة، مع وضعها',
				body: [
					'كلّ مبلغ أدناه مؤقّت. معظمه مأخوذ من تقارير الصحافة، واثنان مشتقّان من الإجمالي ومُعلَّمان بذلك. ولم يُتحقّق من أيّ منه في الوثيقة الرسمية. لن تُثبّت الدراسة أيّ رقم قبل أن يكون له مرجع صفحة في القانون المعتمد.',
					'إجمالي نفقات 2027 المؤقّت هو 68,895 م.د، دون أصل الدين. تُنفق فوائد الدين واحتياطي الطوارئ، 8,963 م.د، قبل البداية. والجزء القابل للتحريك 59,932 م.د على ستة عشر نظامًا. ويقع بند دعم بـ 11,846 م.د داخل بنود الصناعة والتجارة، لذلك لا يُضاف مرّة أخرى. وما يبقى من هذين البندين بعد الدعم، 272.8 م.د، بند مشتقّ وليس ميزانية وزارة.'
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
				id: 'stored',
				num: '05',
				label: 'ما يُحفظ',
				heading: 'فقط ما تحتاجه الإجابات',
				body: [
					'يُحفظ لكلّ ردّ: ميزانيتك كنسبة من كلّ بند، وإجابتان قصيرتان، والمنطقة الاختيارية، ونسخة الدراسة ولغتها، والقناة التي أوصلتك، والمدد، ورمز إيصال عشوائي.',
					'لا يُحفظ أبدًا: اسمك، أو بريدك الإلكتروني، أو عنوان IP، أو تفاصيل جهازك، أو موقع يتجاوز المنطقة الاختيارية، أو نصّ حرّ. النموذج الأوّلي لا يحفظ شيئًا.'
				]
			},
			{
				id: 'cannot',
				num: '06',
				label: 'ما لا تستطيع قوله',
				heading: 'ما ليست هذه الإجابات',
				body: [
					'الإجابات سجلّ لاختيارات من قاموا بها. ولا يمكنها أن تنوب عن بلد.'
				]
			},
			{
				id: 'record',
				num: '07',
				label: 'السجل',
				heading: 'الوضع، مقولًا ببساطة',
				body: [
					'الدراسة قيد التصميم. لا يُجمع شيء، ولم تُقرّها أيّ مراجعة.'
				]
			},
			{
				id: 'take',
				num: '08',
				label: 'المشاركة',
				heading: 'ليست مفتوحة بعد',
				body: [
					'لا يوجد ما يُرسَل. يمكنك تجربة النموذج الأوّلي، وهو لا يحفظ شيئًا ويستخدم أرقامًا مؤقّتة.',
					'لن تُفتح الدراسة إلّا بعد التحقق من الأرقام في القانون المعتمد واستكمال المراجعات.'
				]
			}
		],
		whyItMatters:
			'الميزانية تحدّد ما تستطيع الدولة فعله. وقراءتها كمجموعة اختيارات ضمن مجموع ثابت تُظهر ما يكلّفه كلّ اختيار.',
		intricacy:
			'ستة عشر نظامًا تتقاسم مظروفًا واحدًا ثابتًا. الخطوة حصّة ثابتة من مشروع النظام، والأخذ والعطاء ينقلان المال في اتجاه واحد، وتكتمل اللوحة عندما تكون المحفظة داخل 0.5% من ذلك المظروف.',
		cannotSay: [
			'ليست صورة للتفضيل الوطني، وليست نتيجة وطنية. المشاركة مفتوحة وقائمة على الانتقاء الذاتي.',
			'ليست ما ينبغي أن تكون عليه الميزانية.',
			'ليست حكمًا على جدوى أيّ بند أو هدره.',
			'ليست ترتيبًا للمستجيبين ولا لاختياراتهم.'
		],
		stored:
			'ميزانيتك كنسبة من كلّ بند، وإجابتان قصيرتان، والمنطقة الاختيارية، ونسخة الدراسة ولغتها، والقناة التي أوصلتك، والمدد، ورمز إيصال عشوائي. لا شيء غير ذلك.',
		recordFacts: [
			{ label: 'المرحلة', value: 'التصميم. الدراسة ليست مفتوحة.' },
			{ label: 'المراجعة الأخلاقية', value: 'لم تجرِ أيّ مراجعة.' },
			{ label: 'مراجعة حماية البيانات', value: 'لم تجرِ أيّ مراجعة.' },
			{ label: 'التسجيل المسبق', value: 'غير مسجّل.' },
			{ label: 'الباحث الرئيسي', value: 'غير مسمّى.' },
			{ label: 'الأرقام', value: 'مؤقّتة، نقلتها الصحافة، غير متحقّق منها.' },
			{
				label: 'الترجمة',
				value:
					'الإنجليزية فقط في الوقت الحالي. الفرنسية والعربية مسودّتان في انتظار المراجعة.'
			}
		],
		figuresNote: 'أرقام مؤقّتة نقلتها الصحافة. غير متحقّق منها.',
		draftNotice:
			'كلّ رقم في هذه الصفحة مشروع نقلته الصحافة، وليس رقمًا رسميًّا متحقّقًا منه.',
		graphicLabels: {
			draft: 'المشروع',
			yours: 'ميزانيتك',
			locked: 'مقفل، أُنفق قبل البداية',
			purse: 'المحفظة',
			systems: 'الأنظمة',
			step: 'خطوة واحدة'
		},
		interimNotice: 'ترجمة مؤقّتة، لم يراجعها متحدّث بالعربية كلغة أم. والنصوص الجديدة مسودّات مبدئية.',
		hookTagline: ['المجموع لا يتحرّك.', 'بل يتحرّك مكان إنفاقه فقط.'],
		tally: {
			draftTotal: 'إجمالي المشروع',
			locked: 'مقفل قبل البداية',
			movable: 'قابل للتحريك'
		},
		example: {
			title: 'مثال محسوب',
			formula: 'المحفظة = المظروف − الموضوع',
			intro: 'في هذا المثال المظروف 100 م.د والمشروع الأولي 40 م.د. الأرقام مخترعة.',
			step: (name, draft, stepMd) => `${name} عند ${draft} م.د، والخطوة ${stepMd} م.د.`,
			invented: 'مخترع للتوضيح. ليس رقمًا من الميزانية.',
			result: 'بعد خطوة، تحتفظ المحفظة بالخطوة، وينزل البند بهذا القدر تحت مشروعه.'
		},
		share: {
			button: 'انسخ الرابط',
			heading: 'شارك هذه الصفحة',
			text: 'قيد التصميم، لا جمع للردود. الرابط يفتح صفحة الهبوط المنشورة.'
		},
		sectionReadout: 'أنت في'
	}
};
