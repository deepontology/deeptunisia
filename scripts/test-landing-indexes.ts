/**
 * Assertions over the landing page's Indexes section.
 *
 * The section makes claims about studies, so each honest state is pinned here
 * with inline fixtures: no value without a valid published output, the latest
 * month wins, every translatable element has a dictionary key, and no data
 * derived string reaches the markup unescaped.
 */
import { renderIndexes, INDEX_STRINGS, type Locale } from './landing/indexes.ts';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail = '') {
	checks++;
	if (cond) console.log(`  ok    ${name}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const noAssets = (_path: string) => false;

function study(overrides: Record<string, unknown> = {}) {
	return {
		id: 'psi',
		slug: 'police',
		title_en: 'Police Satisfaction Index',
		title_fr: 'Indice de satisfaction envers la police',
		title_ar: 'مؤشر الرضا عن الشرطة',
		status: 'design',
		population_statement: null,
		fielding_window: null,
		outputs: [],
		...overrides
	};
}

const registry = (...studies: unknown[]) => ({ meta: {}, studies, instruments: {} });

function render(studies: unknown, locale: Locale = 'en', assetExists = noAssets) {
	return renderIndexes(studies, locale, assetExists);
}

// The text of the card-status span, without the card-cta that follows it.
function statusSegment(html: string): string {
	const start = html.indexOf('class="card-status">');
	const end = html.indexOf('class="card-cta"');
	return start < 0 || end < 0 ? '' : html.slice(start, end);
}

const validResult = { kind: 'results', id: 'psi-2026-10', published: true, month: '2026-10', value: 62, n: 812 };

console.log('\n  ── the section is absent unless there is a study to show ──\n');
{
	check('null → empty', render(null) === '');
	check('undefined → empty', render(undefined) === '');
	check('no studies array → empty', render({ studies: [] }) === '');
	check('empty studies array → empty', render(registry()) === '');
	check('garbage 42 → empty', render(42) === '');
	check('garbage {} → empty', render({}) === '');
	check('studies not an array → empty', render({ studies: 'x' }) === '');
	check('only unusable studies → empty', render(registry(study({ slug: 'Bad Slug' }))) === '');
}

console.log('\n  ── design, fielding, frozen and closed lines ──\n');
{
	const d = render(registry(study({ status: 'design' })));
	check('design: section present', d.startsWith('<section class="sec" id="indexes"'));
	check('design: shows the design line', d.includes('data-i18n="index.design"'));
	check('design: no value', !d.includes('idx-v') && !d.includes('/100') && !d.includes('n = '));
	const statusText = statusSegment(d).replace(/<[^>]*>/g, '');
	check('design: status text has no digits', !/\d/.test(statusText), statusText);
	check('design: data-status set', d.includes('data-status="design"'));

	for (const status of ['proposed', 'ethics-review']) {
		const html = render(registry(study({ status })));
		check(`${status}: design line`, html.includes('data-i18n="index.design"'));
	}

	const f = render(registry(study({ status: 'fielding', fielding_window: { start: '2026-11-01', end: null } })));
	check('fielding: shows the fielding line', f.includes('data-i18n="index.fielding"'));
	check('fielding: month in English', f.includes('November 2026') && f.includes('data-month="2026-11"'));
	check('fielding: no value', !f.includes('/100') && !f.includes('idx-v'));

	const noStart = render(registry(study({ status: 'fielding', fielding_window: null })));
	check('fielding without a start: line without a month', noStart.includes('index.fielding') && !noStart.includes('<time'));

	const frozen = render(registry(study({ status: 'frozen' })));
	check('frozen: frozen line', frozen.includes('data-i18n="index.frozen"') && !frozen.includes('index.design'));

	for (const status of ['closed', 'analyzed', 'published', 'archived']) {
		const html = render(registry(study({ status })));
		check(`${status}: closed line`, html.includes('data-i18n="index.closed"'));
	}
}

console.log('\n  ── a published monthly value ──\n');
{
	const v = render(registry(study({ status: 'design', outputs: [validResult] })));
	check('value: the number and the denominator', v.includes('<span class="idx-v">62</span>/100'));
	check('value: the sample size', v.includes('n = <span class="idx-n">812</span>'));
	check('value: the qualifier is always present', v.includes('data-i18n="index.among"') && v.includes('among respondents'));
	check('value: the value replaces the design line', !v.includes('index.design'));
	check('value: the short label', v.includes('<span class="idx-label">PSI</span>'));
	check('value: the month', v.includes('data-month="2026-10"') && v.includes('October 2026'));

	const later = { ...validResult, month: '2026-11', value: 70, n: 900 };
	const earlier = { ...validResult, month: '2026-09', value: 40, n: 300 };
	const two = render(registry(study({ outputs: [later, earlier] })));
	check('two months: the later one wins', two.includes('<span class="idx-v">70</span>') && !two.includes('idx-v">40<'));
	const twoRev = render(registry(study({ outputs: [earlier, later] })));
	check('two months, reversed order: the later one still wins', twoRev.includes('<span class="idx-v">70</span>'));

	const fielding = render(
		registry(study({ status: 'fielding', fielding_window: { start: '2026-11-01' }, outputs: [validResult] }))
	);
	check('value outranks fielding status', fielding.includes('idx-v') && !fielding.includes('index.fielding'));
}

console.log('\n  ── invalid outputs are never a value ──\n');
{
	const invalid: Record<string, unknown>[] = [
		{ ...validResult, published: false },
		{ ...validResult, published: 'true' },
		{ ...validResult, value: 101 },
		{ ...validResult, value: -1 },
		{ ...validResult, value: '62' },
		{ ...validResult, value: Number.NaN },
		{ ...validResult, n: undefined },
		{ ...validResult, n: 0 },
		{ ...validResult, n: 1.5 },
		{ ...validResult, month: '2026-13x' },
		{ ...validResult, month: '2026-13' },
		{ ...validResult, month: '2026-1' },
		{ ...validResult, kind: 'dataset' },
		{ ...validResult, kind: 'paper' }
	];
	for (const output of invalid) {
		const html = render(registry(study({ status: 'design', outputs: [output] })));
		check(
			`ignored: ${JSON.stringify(output)}`,
			!html.includes('idx-v') && !html.includes('/100') && html.includes('data-i18n="index.design"')
		);
	}

	const mixed = render(
		registry(study({ outputs: [{ ...validResult, month: '2026-12', value: 101 }, validResult] }))
	);
	check('an invalid later month does not hide a valid earlier one', mixed.includes('<span class="idx-v">62</span>'));
}

console.log('\n  ── the cover still ──\n');
{
	const none = render(registry(study()));
	check('no asset: no <img', !none.includes('<img'));

	const seen: string[] = [];
	const spy = (path: string) => {
		seen.push(path);
		return true;
	};
	const withAsset = render(registry(study()), 'en', spy);
	check(
		'asset present: plate image',
		withAsset.includes('<img class="plate" src="/research/media/psi-9-still.webp"'),
		withAsset.slice(0, 400)
	);
	check('asset present: checked the cover path', seen.length === 1 && seen[0] === '/research/media/psi-9-still.webp');

	const unmapped: string[] = [];
	const unmappedSpy = (path: string) => {
		unmapped.push(path);
		return true;
	};
	const other = render(registry(study({ slug: 'other' })), 'en', unmappedSpy);
	check('a slug with no COVER entry never calls assetExists', unmapped.length === 0);
	check('a slug with no COVER entry has no image', !other.includes('<img'));

	const proto: string[] = [];
	const protoSpy = (path: string) => {
		proto.push(path);
		return true;
	};
	const protoOut = render(registry(study({ slug: 'constructor' })), 'en', protoSpy);
	check('a prototype-named slug is not mistaken for a cover', proto.length === 0 && !protoOut.includes('<img'));
	check('a non-police slug falls back to its localized title as the label', render(registry(study({ slug: 'other', outputs: [validResult] }))).includes('<span class="idx-label" data-l10n-en="Police Satisfaction Index" data-l10n-fr="Indice de satisfaction envers la police"'));
	const translatedLabel = render(registry(study({ slug: 'other', title_fr: 'Indice de satisfaction', outputs: [validResult] })));
	check('a non-police label carries its French title for the language switch', translatedLabel.includes('data-l10n-fr="Indice de satisfaction"'));
	const frMonth = render(registry(study({ status: 'design', outputs: [validResult] })));
	check('the month carries every language for the language switch', frMonth.includes('data-l10n-fr="octobre 2026"') && frMonth.includes('data-l10n-en="October 2026"'));
}

console.log('\n  ── escaping ──\n');
{
	const html = render(registry(study({ title_en: 'A <b>&"', slug: 'escape', status: 'closed' })));
	check('title escaped in text', html.includes('>A &lt;b&gt;&amp;&quot;</span>'));
	check('title escaped in attribute', html.includes('data-l10n-en="A &lt;b&gt;&amp;&quot;"'));
	check('no raw title tag leaks', !html.includes('<b>&"'));

	const apos = render(registry(study({ title_en: "O'Brien", slug: 'apos', status: 'closed' })));
	check('apostrophe escaped', apos.includes('O&#39;Brien'));

	const hostile = render(registry(study({ slug: 'x', status: 'closed\"><script>' })));
	check('status is escaped in data-status', !hostile.includes('<script>') && hostile.includes('data-status="closed&quot;&gt;&lt;script&gt;"'));
}

console.log('\n  ── locales ──\n');
{
	const fr = render(
		registry(study({ status: 'fielding', fielding_window: { start: '2026-11-01' } })),
		'fr'
	);
	check('fr: French title as the text', fr.includes('>Indice de satisfaction envers la police</span>'));
	check('fr: French month', fr.includes('novembre 2026'));
	check('fr: all three title attributes', fr.includes('data-l10n-fr="Indice') && fr.includes('data-l10n-ar="'));

	const noFr = render(registry(study({ title_fr: null, title_ar: null })), 'fr');
	check('null French title: no data-l10n-fr attribute', !noFr.includes('data-l10n-fr') && !noFr.includes('data-l10n-ar'));
	check('null French title: falls back to English text', noFr.includes('>Police Satisfaction Index</span>'));

	const ar = render(registry(study()), 'ar');
	check('ar: Arabic title as the text', ar.includes('>مؤشر الرضا عن الشرطة</span>'));
}

console.log('\n  ── links, ordering and bad slugs ──\n');
{
	const html = render(
		registry(
			study({ slug: 'first', title_en: 'First', status: 'closed' }),
			study({ slug: 'Bad Slug', title_en: 'Bad', status: 'closed' }),
			study({ slug: '../escape', title_en: 'Escape', status: 'closed' }),
			study({ slug: '', title_en: 'Empty', status: 'closed' }),
			study({ slug: 'second', title_en: 'Second', status: 'closed' })
		)
	);
	check('bad slugs are skipped', !html.includes('Bad') && !html.includes('Escape') && !html.includes('Empty'));
	check('good slugs link to /research/<slug>', html.includes('href="/research/first"') && html.includes('href="/research/second"'));
	check('registry order is kept', html.indexOf('/research/first') < html.indexOf('/research/second'));
	check('one card per usable study', (html.match(/<li /g) ?? []).length === 2);
}

console.log('\n  ── every translatable element has a key, and no number is in one ──\n');
{
	const all = render(
		registry(
			study({ outputs: [validResult] }),
			study({ slug: 'f', status: 'fielding', fielding_window: { start: '2026-11-01' } }),
			study({ slug: 'g', status: 'frozen' }),
			study({ slug: 'h', status: 'closed' }),
			study({ slug: 'i', status: 'design' }),
			study({ slug: 'j', status: 'fielding', fielding_window: null })
		)
	);
	const keys = [...all.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
	check('keys are emitted', keys.length > 0);
	check(
		'every data-i18n key is in INDEX_STRINGS',
		keys.every((k) => Object.prototype.hasOwnProperty.call(INDEX_STRINGS, k)),
		keys.filter((k) => !(k in INDEX_STRINGS)).join(',')
	);
	check('no number sits inside a data-i18n element', !/data-i18n="[^"]+">[^<]*\d/.test(all));
	const used = new Set(keys);
	check(
		'every INDEX_STRINGS entry is used by some state',
		Object.keys(INDEX_STRINGS).every((k) => used.has(k)),
		Object.keys(INDEX_STRINGS).filter((k) => !used.has(k)).join(',')
	);
}

console.log('\n  ── determinism ──\n');
{
	const input = registry(
		study({ outputs: [validResult] }),
		study({ slug: 'f', status: 'fielding', fielding_window: { start: '2026-11-01' } })
	);
	const a = render(input, 'fr', () => true);
	const b = render(input, 'fr', () => true);
	check('same input, same bytes', a === b && a.length > 0);
}

console.log(`\n  test-landing-indexes: ${checks - failures}/${checks} passed`);
if (failures > 0) process.exit(1);
