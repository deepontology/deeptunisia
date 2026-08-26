/**
 * Assertions over the three languages.
 *
 * WHY THIS SUITE EXISTS, GIVEN THE OLD CHECK PASSED
 *
 * Key coverage was 244/244 in all three locales and had been for months. Meanwhile
 * `/now` rendered `dir="rtl"` around a hundred and sixty-seven words of English, every
 * date on the site was English in all three languages, and `formatDate` did not take a
 * locale parameter at all. None of that is visible to a dictionary audit, because none
 * of it is in the dictionary.
 *
 * So this suite deliberately checks the things a key count cannot see:
 *
 *  - generated sentences, which are assembled at runtime and appear in no file
 *  - parameters, because a template that silently drops one produces a plausible
 *    half-sentence rather than an error
 *  - translations identical to their English source, which inflate coverage while
 *    changing nothing
 *  - the epistemic distinctions the interval templates carry, which a translator
 *    working phrase-by-phrase will flatten without noticing
 *
 * The last one is the reason this file is worth its length. `interval.lastVerified`
 * means "confirmed up to this date", not "ended on this date", and `/now` divides its
 * whole display on that difference. A translation that loses it makes a false claim
 * about the dataset without touching the dataset.
 */
import { LOCALES, translate, format, type Locale } from '../src/lib/i18n.ts';
import {
	TRANSLATABLE_FIELDS,
	TRANSLATED_LOCALES,
	TRANSLATION_TIERS,
	NO_RAW_MACHINE
} from './schema.ts';

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const locales = LOCALES.map((l) => l.id);

/*
 * The dictionaries are not exported — deliberately, so nothing outside i18n.ts can
 * reach past `translate`. Read the source instead, which also means this suite sees
 * exactly what a reviewer reads in the file rather than a processed copy of it.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'lib', 'i18n.ts'), 'utf8');

function keysOf(locale: Locale): string[] {
	const start = SRC.indexOf(`const ${locale}: Dict = {`);
	if (start === -1) return [];
	const body = SRC.slice(start).split('\n};')[0];
	return [...body.matchAll(/^\t['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]);
}

console.log('\n  ── dictionary parity ──\n');

const dicts = Object.fromEntries(locales.map((l) => [l, keysOf(l)])) as Record<Locale, string[]>;

for (const l of locales) {
	ok(`${l} has keys`, dicts[l].length > 200, `${dicts[l].length}`);
	const dupes = dicts[l].filter((k, i) => dicts[l].indexOf(k) !== i);
	// A duplicate key is not a syntax error in an object literal — the last one silently
	// wins, so a translation can be overwritten by a stale copy with no warning anywhere.
	ok(`${l} has no duplicate keys`, dupes.length === 0, dupes.slice(0, 3).join(', '));
}

const en = new Set(dicts.en);
for (const l of locales.filter((x) => x !== 'en')) {
	const missing = [...en].filter((k) => !dicts[l].includes(k));
	const extra = dicts[l].filter((k) => !en.has(k));
	ok(`${l} covers every English key`, missing.length === 0, missing.slice(0, 5).join(', '));
	ok(`${l} defines nothing English lacks`, extra.length === 0, extra.slice(0, 5).join(', '));
}

console.log('\n  ── every parameterised string, in every locale ──\n');

/*
 * Derived from the dictionary rather than listed by hand.
 *
 * The `TEMPLATES` table below is hand-maintained, and hand-maintained lists rot: a
 * batch of parameterised strings for the posting budget and identity recovery went in
 * with `{n}`, `{word}` and `{handle}` placeholders and nothing checked them, because
 * adding a string does not remind anybody to add a test. A French translation that
 * drops `{n}` renders "apparaît dans environ min"; an Arabic one renders "تظهر بعد نحو
 * دقيقة". Both are grammatical, neither crashes, and nobody files a bug about a
 * missing number they never knew was supposed to be there.
 *
 * So: whatever placeholders the English string uses, every other locale must use the
 * same set. This covers every string that exists now and every one added later.
 */
const placeholdersIn = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

let parameterised = 0;
for (const key of dicts.en) {
	const wanted = placeholdersIn(translate('en', key));
	if (!wanted.size) continue;
	parameterised++;

	for (const l of locales.filter((x) => x !== 'en')) {
		const got = placeholdersIn(translate(l, key));
		const missing = [...wanted].filter((p) => !got.has(p));
		const unknown = [...got].filter((p) => !wanted.has(p));
		ok(
			`${l} ${key} keeps every placeholder`,
			missing.length === 0,
			missing.length ? `dropped {${missing.join('}, {')}}` : ''
		);
		// An invented placeholder is worse than a dropped one: it renders literally,
		// as a brace-wrapped word sitting in the middle of a sentence.
		ok(
			`${l} ${key} invents none`,
			unknown.length === 0,
			unknown.length ? `unexpected {${unknown.join('}, {')}}` : ''
		);
	}
}
ok('there are parameterised strings to check', parameterised > 5, `${parameterised} keys`);

console.log('\n  ── generated sentences ──\n');

/*
 * Every combination the interval renderer can produce. These strings appear in no
 * source file: they are assembled at runtime from a template plus a formatted date,
 * which is exactly why a dictionary audit cannot see them.
 */
const TEMPLATES: [string, Record<string, string>][] = [
	['interval.range', { start: '1957', end: '1987' }],
	['interval.ongoing', { start: '1957' }],
	['interval.unknown', { start: '1957' }],
	['interval.lastVerified', { start: '2018', date: 'Dec 2025' }],
	['edge.approx', { year: '1987' }],
	['edge.before', { date: 'Jun 2018' }],
	['edge.after', { year: '2011' }],
	['duration.y', { y: '3' }],
	['duration.ym', { y: '3', m: '4' }],
	['duration.m', { m: '7' }]
];

for (const l of locales) {
	for (const [key, params] of TEMPLATES) {
		const out = format(l, key, params);
		ok(`${l} ${key} renders`, out.length > 0 && out !== key);
		// A leftover placeholder means the translation used a different parameter name.
		// It reads as a plausible sentence with `{start}` in it, which is worse than a
		// crash because nobody reports it.
		ok(`${l} ${key} substitutes every parameter`, !/\{\w+\}/.test(out), out);
		// Every parameter must actually appear. A translation that drops one produces a
		// grammatical sentence missing a date, which no automated render check catches.
		for (const v of Object.values(params)) {
			ok(`${l} ${key} keeps "${v}"`, out.includes(v), out);
		}
	}
}

console.log('\n  ── epistemic distinctions survive translation ──\n');

/*
 * The six statements below make DIFFERENT claims about what the sources support. If
 * any two render identically in a locale, that locale has collapsed a distinction the
 * dataset depends on — and it will do so silently, because both strings are valid
 * sentences in that language.
 */
for (const l of locales) {
	const rendered = [
		format(l, 'interval.range', { start: 'X', end: 'Y' }),
		format(l, 'interval.ongoing', { start: 'X' }),
		format(l, 'interval.unknown', { start: 'X' }),
		format(l, 'interval.lastVerified', { start: 'X', date: 'Y' })
	];
	ok(
		`${l} keeps the four interval statuses distinct`,
		new Set(rendered).size === 4,
		rendered.join(' | ')
	);

	const edges = [
		format(l, 'edge.approx', { year: 'Y' }),
		format(l, 'edge.before', { date: 'Y' }),
		format(l, 'edge.after', { year: 'Y' })
	];
	ok(`${l} keeps approx, before and after distinct`, new Set(edges).size === 3, edges.join(' | '));

	/*
	 * "Confirmed through 2025" and "ended 2025" are the pair most likely to be
	 * conflated, and /now splits its entire display on it: 12 of its 37 rows are
	 * last-verified. The check is that the last-verified sentence is not simply the
	 * range sentence with a date in it.
	 */
	const lastVerified = format(l, 'interval.lastVerified', { start: 'X', date: 'Y' });
	const range = format(l, 'interval.range', { start: 'X', end: 'Y' });
	ok(
		`${l} does not render "confirmed through" as a plain range`,
		lastVerified !== range && lastVerified.length > range.length,
		lastVerified
	);
}

console.log('\n  ── translations are translations ──\n');

/*
 * A value identical to its English source is almost always a copy-paste that someone
 * meant to come back to. It inflates the coverage statistic while changing nothing,
 * which is the specific failure this project's review-coverage number exists to avoid.
 *
 * Exempt: strings that are correctly identical everywhere — a bare template of
 * punctuation and parameters, proper nouns, and the letters of the language switch.
 */
const IDENTICAL_IS_FINE = new Set([
	'interval.range',
	'brand.name',
	'agora.title',
	'agora.reason.spam',
	'locale.en',
	'locale.fr',
	'locale.ar',
	// Genuinely the same word in French. Exempted explicitly rather than by raising the
	// length threshold, because the threshold is what catches real copy-paste and every
	// character it loses is a real omission it stops seeing.
	'ev.tab.contra',
	// A proper noun: the basemap's dataset name, identical in every language
	// by design (the map credits the same source everywhere).
	'map.basemap'
]);

for (const l of locales.filter((x) => x !== 'en')) {
	const same = dicts.en.filter((k) => {
		if (IDENTICAL_IS_FINE.has(k)) return false;
		const a = translate('en', k);
		const b = translate(l, k);
		// Very short values are often legitimately identical across languages.
		return a === b && a.length > 12;
	});
	ok(`${l} has no untranslated copies of the English`, same.length === 0, same.slice(0, 6).join(', '));
}

console.log('\n  ── no key escapes as its own name ──\n');

for (const l of locales) {
	// `translate` falls back to the key itself when nothing matches. A key rendered in
	// the interface looks like a bug to a reader and like nothing at all to a test that
	// only counts keys.
	const raw = dicts.en.filter((k) => translate(l, k) === k && k.includes('.'));
	ok(`${l} resolves every key to a string`, raw.length === 0, raw.slice(0, 5).join(', '));
}

console.log('\n  ── data prose: schema and provenance ──\n');

/*
 * The schema half of the contract. The build already refuses a translation with no
 * provenance, an unreviewed machine translation on a hypothesis, and a value copied
 * verbatim from the English — these check the shape those rules depend on, so a
 * refactor that silently drops a `_by` sibling fails here rather than by quietly
 * ceasing to validate anything.
 */
const built = JSON.parse(
	readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8')
) as Record<string, Record<string, unknown>[]>;

ok(
	'the four provenance tiers are ordered weakest first',
	TRANSLATION_TIERS[0] === 'machine' && TRANSLATION_TIERS[TRANSLATION_TIERS.length - 1] === 'human'
);
ok(
	'model-reviewed sits below the human-checked tiers',
	TRANSLATION_TIERS.indexOf('model-reviewed') < TRANSLATION_TIERS.indexOf('machine-reviewed'),
	// It exists precisely so a model checking a model cannot be filed as a human check.
	TRANSLATION_TIERS.join(' < ')
);

for (const [type, fields] of Object.entries(TRANSLATABLE_FIELDS)) {
	const rows = built[type];
	if (!rows || !fields.length) continue;
	for (const field of fields) {
		for (const loc of TRANSLATED_LOCALES) {
			const orphans = rows.filter((r) => r[`${field.name}_${loc}`] && !r[`${field.name}_${loc}_by`]);
			ok(
				`${type}.${field.name}_${loc} always carries provenance`,
				orphans.length === 0,
				orphans.slice(0, 3).map((r) => String(r.id)).join(', ')
			);

			const copies = rows.filter((r) => {
				const a = r[field.name];
				const b = r[`${field.name}_${loc}`];
				return typeof a === 'string' && typeof b === 'string' && a.trim() === b.trim();
			});
			ok(
				`${type}.${field.name}_${loc} is never a copy of the English`,
				copies.length === 0,
				copies.slice(0, 3).map((r) => String(r.id)).join(', ')
			);
		}
	}
}

// docs/i18n-spec.md §2.1: `title_gloss_fr`/`title_gloss_ar` are a reading aid that
// renders BESIDE a source title — they cannot exist where the title itself does.
// A gloss without a title would float next to nothing and, worse, could be
// mistaken for the citation it is forbidden to replace. `title_gloss` is absent
// from TRANSLATABLE_FIELDS (glosses render beside, not as translated prose), so
// the check above cannot see them; this one is written against the built sources
// directly. (`excerpt`, by contrast, is quoted material whose machine-tier AI
// reading aids are ALSO absent from TRANSLATABLE_FIELDS — the authored-prose
// counter must not mix them in — so this block and the excerpt block below are
// written against the built sources directly too.)
console.log('\n  ── source title glosses ──\n');

const sourceRows = (built.sources ?? []) as Record<string, unknown>[];
for (const loc of TRANSLATED_LOCALES) {
	const glossWithoutTitle = sourceRows.filter(
		(r) => r[`title_gloss_${loc}`] !== undefined && (r.title === undefined || String(r.title).trim() === '')
	);
	ok(
		`sources.title_gloss_${loc} never appears without title`,
		glossWithoutTitle.length === 0,
		glossWithoutTitle.slice(0, 3).map((r) => String(r.id)).join(', ')
	);
	const glossOrphan = sourceRows.filter(
		(r) => r[`title_gloss_${loc}`] !== undefined && r[`title_gloss_${loc}_by`] === undefined
	);
	ok(
		`sources.title_gloss_${loc} always carries provenance`,
		glossOrphan.length === 0,
		glossOrphan.slice(0, 3).map((r) => String(r.id)).join(', ')
	);
}

// docs/i18n-spec.md §2.2 amendment: quoted source excerpts carry
// `excerpt_fr`/`excerpt_ar` as subordinate reading aids, produced by a model in
// one pass and checked by nobody. The `machine` tier is the visible admission
// of that — a future pass must not silently upgrade these to `model-reviewed`
// (which would claim a check that never happened) or drop the `_by` marker.
// The generic TRANSLATABLE_FIELDS loop cannot see `sources.excerpt` (deliberately
// absent from the authored-prose counter), so this block enforces BOTH the
// provenance and the tier itself.
console.log('\n  ── source excerpt reading aids are admitted machine output ──\n');

for (const loc of TRANSLATED_LOCALES) {
	const excerptOrphan = sourceRows.filter(
		(r) => r[`excerpt_${loc}`] !== undefined && r[`excerpt_${loc}_by`] === undefined
	);
	ok(
		`sources.excerpt_${loc} always carries provenance`,
		excerptOrphan.length === 0,
		excerptOrphan.slice(0, 3).map((r) => String(r.id)).join(', ')
	);
	const notMachine = sourceRows.filter((r) => r[`excerpt_${loc}`] !== undefined && r[`excerpt_${loc}_by`] !== 'machine');
	ok(
		`sources.excerpt_${loc} is never upgraded out of the machine admission tier`,
		notMachine.length === 0,
		notMachine.slice(0, 3).map((r) => String(r.id)).join(', ')
	);
}

for (const type of NO_RAW_MACHINE) {
	const rows = built[type] ?? [];
	const raw = rows.filter((r) =>
		TRANSLATED_LOCALES.some((loc) =>
			(TRANSLATABLE_FIELDS[type] ?? []).some((f) => r[`${f.name}_${loc}_by`] === 'machine')
		)
	);
	// These are the records that argue for the project's own trustworthiness. A
	// mistranslated falsifier is a false claim about what would refute a hypothesis.
	ok(
		`${type} carries no unreviewed machine translation`,
		raw.length === 0,
		raw.slice(0, 3).map((r) => String(r.id)).join(', ')
	);
}

// The dictionary audit cannot see a page that renders hard-coded English, but it
// CAN see every t()/format() key the views call: a key used by a view and missing
// from one locale is the same broken rendering, just caught at the source.
console.log('\n  ── every key the views call exists in every locale ──\n');

import { readdirSync, statSync } from 'node:fs';

function walkSvelte(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walkSvelte(full));
		else if (full.endsWith('.svelte') || full.endsWith('.ts')) out.push(full);
	}
	return out;
}

const viewFiles = [
	...walkSvelte(join(HERE, '..', 'src', 'lib', 'components')),
	...walkSvelte(join(HERE, '..', 'src', 'lib', 'agora')),
	...walkSvelte(join(HERE, '..', 'src', 'routes'))
].filter((f) => !f.includes('generated'));

const usedKeys = new Set<string>();
for (const file of viewFiles) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/\b(?:t|format|translate)\(\s*(?:app\.locale\s*,\s*)?'([^']+)'/g)) {
		const key = m[1];
		// `t('basis.' + b)` concatenates; the literal is not a key.
		if (key.endsWith('.') || key.includes('.' + "'")) continue;
		usedKeys.add(key);
	}
}

for (const l of locales) {
	const missing = [...usedKeys].filter((k) => !dicts[l].includes(k));
	ok(
		`every key the views call exists in ${l}`,
		missing.length === 0,
		missing.length ? missing.slice(0, 6).join(', ') : `${usedKeys.size} keys in use`
	);
}

// --- Long-form content files (UI pass W1, i18n-spec §5) -------------------
//
// Sentences a reader reads live in src/content/<view>.<locale>.md, not in the
// dictionary — a dictionary audit cannot see them either, so the suite checks
// the files themselves: every EN file needs fr/ar siblings, every section id
// must match across locales (they are the anchors pages interleave around),
// provenance tiers must be in the permitted set, and a translation byte-
// identical to its source is a copy-paste, not a translation.

console.log('\n  ── content files ──\n');

{
	const CONTENT_DIR = join(HERE, '..', 'src', 'content');
	const enFiles = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.en.md'));

	for (const enFile of enFiles) {
		const view = enFile.replace(/\.en\.md$/, '');
		const enRaw = readFileSync(join(CONTENT_DIR, enFile), 'utf8');
		const enIds = [...enRaw.matchAll(/^\{#([a-z0-9-]+)\}|^#{2,3}\s+.+?\{#([a-z0-9-]+)\}\s*$/gm)]
			.map((m) => m[1] ?? m[2])
			.sort();

		for (const l of ['fr', 'ar'] as const) {
			const path = join(CONTENT_DIR, `${view}.${l}.md`);
			if (!existsSync(path)) {
				ok(`${view}.${l} exists`, false, path);
				continue;
			}
			const raw = readFileSync(path, 'utf8');
			ok(
				`${view}.${l} frontmatter tier is permitted`,
				/translated_by:\s*(human|machine-reviewed|model-reviewed|machine)\s*$/.test(raw.split('\n')[1] ?? ''),
				(raw.match(/translated_by:\s*(\S+)/) ?? [])[1]
			);
			const ids = [...raw.matchAll(/^\{#([a-z0-9-]+)\}|^#{2,3}\s+.+?\{#([a-z0-9-]+)\}\s*$/gm)]
				.map((m) => m[1] ?? m[2])
				.sort();
			ok(
				`${view}.${l} section ids match en`,
				JSON.stringify(ids) === JSON.stringify(enIds),
				`${ids.length} vs ${enIds.length}`
			);
			// A translation identical to the source is a copy-paste: it silently
			// inflates the coverage statistic while changing nothing (i18n-spec §6.5).
			const bare = (s: string) => s.replace(/^---[\s\S]*?---\s*\n/, '').trim();
			ok(`${view}.${l} is a translation, not a copy`, bare(raw) !== bare(enRaw), `${bare(raw).length} chars`);
		}
	}
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
