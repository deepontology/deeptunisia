/**
 * Gate for the citizen budget landing copy.
 *
 * Checks that the three locales share a structure, that no string carries an em
 * or en dash or a banned phrase, and that the figure 91 appears exactly once per
 * locale, inside the approved sentence.
 */
import { landingCopy } from '../src/lib/budget-study/landing-copy';
import type { Locale } from '../src/lib/budget-study/landing-copy';

const LOCALES: Locale[] = ['en', 'fr', 'ar'];
const SECTION_IDS = ['question', 'board', 'figures', 'method', 'stored', 'cannot', 'record', 'take'];
const APPROVED_EN = '91 dinars in every 100 the state raises itself come from tax.';
const BANNED = ['tunisians want', 'the people\u2019s budget', "the people's budget", 'the public rejects'];

const failures: string[] = [];
const fail = (message: string) => {
	failures.push(message);
};

interface FoundString {
	path: string;
	text: string;
}

function collectStrings(value: unknown, path: string, out: FoundString[]): void {
	if (typeof value === 'string') {
		out.push({ path, text: value });
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) {
			const next = path ? `${path}.${key}` : key;
			collectStrings(item, next, out);
		}
	}
}

function compareShape(a: unknown, b: unknown, path: string, locale: Locale): void {
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) {
			fail(`${locale}: ${path} is an array in one locale only`);
			return;
		}
		if (a.length !== b.length) {
			fail(`${locale}: ${path} has ${b.length} entries, en has ${a.length}`);
			return;
		}
		a.forEach((item, index) => compareShape(item, b[index], `${path}[${index}]`, locale));
		return;
	}
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const keysA = Object.keys(a).sort();
		const keysB = Object.keys(b).sort();
		if (JSON.stringify(keysA) !== JSON.stringify(keysB)) {
			fail(`${locale}: ${path} has different keys from en`);
			return;
		}
		for (const key of keysA) {
			compareShape(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key],
				`${path}.${key}`,
				locale
			);
		}
	}
}

function checkNonEmpty(value: unknown, path: string, locale: Locale): void {
	if (value === null) {
		if (path !== 'interimNotice') fail(`${locale}: ${path} is null`);
		return;
	}
	if (typeof value === 'string') {
		if (!value.trim()) fail(`${locale}: ${path} is empty`);
		return;
	}
	if (Array.isArray(value)) {
		if (!value.length) fail(`${locale}: ${path} is an empty array`);
		value.forEach((item, index) => checkNonEmpty(item, `${path}[${index}]`, locale));
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) {
			checkNonEmpty(item, path ? `${path}.${key}` : key, locale);
		}
	}
}

const en = landingCopy.en;

// Same section ids, in the same order, in every locale.
en.sections.forEach((section, index) => {
	if (section.id !== SECTION_IDS[index]) {
		fail(`en: section ${index + 1} is ${section.id}, expected ${SECTION_IDS[index]}`);
	}
});
const enNums = en.sections.map((section) => section.num);
if (new Set(enNums).size !== enNums.length) fail('en: section numbers repeat');

for (const locale of LOCALES) {
	const copy = landingCopy[locale];
	const ids = copy.sections.map((section) => section.id);
	if (JSON.stringify(ids) !== JSON.stringify(SECTION_IDS)) {
		fail(`${locale}: section ids are ${ids.join(', ')}, expected ${SECTION_IDS.join(', ')}`);
	}

	// Same keys and array lengths as English.
	compareShape(en, copy, locale, locale);
	checkNonEmpty(copy, '', locale);

	// Record facts carry a label and a value in every row.
	copy.recordFacts.forEach((fact, index) => {
		if (!fact.label.trim() || !fact.value.trim()) {
			fail(`${locale}: recordFacts[${index}] has an empty label or value`);
		}
	});

	// English is not an interim draft; French and Arabic are.
	if (locale === 'en' && copy.interimNotice !== null) {
		fail('en: interimNotice must be null');
	}
	if (locale !== 'en' && !copy.interimNotice) {
		fail(`${locale}: interimNotice must carry the marked note`);
	}

	const strings: FoundString[] = [];
	collectStrings(copy, '', strings);
	let ninetyOne = 0;
	const carriers: FoundString[] = [];

	for (const entry of strings) {
		if (entry.text.includes('\u2014') || entry.text.includes('\u2013')) {
			fail(`${locale}: ${entry.path} contains an em or en dash`);
		}
		const lower = entry.text.toLowerCase();
		for (const phrase of BANNED) {
			if (lower.includes(phrase)) fail(`${locale}: ${entry.path} contains banned phrase "${phrase}"`);
		}
		const count = entry.text.split('91').length - 1;
		if (count > 0) {
			ninetyOne += count;
			carriers.push(entry);
		}
	}

	if (ninetyOne !== 1) {
		fail(`${locale}: "91" appears ${ninetyOne} times, expected exactly once`);
	} else if (carriers.length !== 1) {
		fail(`${locale}: "91" is spread across ${carriers.length} strings`);
	}

	if (locale === 'en') {
		if (!copy.hook.includes(APPROVED_EN)) {
			fail(`en: hook does not carry the approved sentence "${APPROVED_EN}"`);
		}
		if (carriers[0] && !carriers[0].text.includes(APPROVED_EN)) {
			fail('en: "91" sits outside the approved sentence');
		}
	} else if (carriers[0]) {
		const marker = locale === 'fr' ? 'dinars' : 'دينار';
		if (!carriers[0].text.includes(marker) || !carriers[0].text.includes('100')) {
			fail(`${locale}: "91" sits outside the translated approved sentence`);
		}
	}
}

if (failures.length) {
	for (const failure of failures) console.error(failure);
	process.exit(1);
}

console.log('ok');
