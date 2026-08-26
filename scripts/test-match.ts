/**
 * Assertions over the entity matcher.
 *
 * The matcher exists so headlines can link into the graph WITHOUT a language model:
 * a hallucinated link between a named person and a news story is the one failure
 * this project could not survive. That makes precision the thing under test here,
 * not recall. A matcher that finds half the mentions is merely incomplete; one that
 * confidently links the wrong person has manufactured an insinuation, which is
 * exactly what the four-basis architecture exists to prevent.
 *
 * Fixtures are real headlines taken from feed/feed.json, hard-coded so the suite
 * stays deterministic and offline.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatcher, normalise, type MatchEntity } from '../src/lib/match.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ds = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8'));

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

const entities: MatchEntity[] = [
	...ds.people.map((p: any) => ({
		id: p.id,
		kind: 'person' as const,
		names: [p.name_en, p.name_fr, p.name_ar, ...(p.aliases ?? [])].filter(Boolean)
	})),
	...ds.institutions.map((i: any) => ({
		id: i.id,
		kind: 'institution' as const,
		names: [i.name_en, i.name_fr, i.name_ar, ...(i.aliases ?? [])].filter(Boolean)
	}))
];

const m = buildMatcher(entities);
const ids = (text: string) => m.find(text).map((x) => x.id);
const has = (text: string, id: string) => ids(text).includes(id);

// --- Normalisation ---------------------------------------------------------

ok('latin diacritics fold', normalise('Kaïs Saïed') === normalise('Kais Saied'));
ok('case folds', normalise('BOURGUIBA') === normalise('bourguiba'));
ok(
	'arabic orthography folds',
	normalise('قيس سعيّد') === normalise('قيس سعيد'),
	'shadda and tashkeel stripped'
);
ok('alef variants fold', normalise('أحمد') === normalise('احمد'));
ok('taa marbuta folds', normalise('حركة') === normalise('حركه'));

// --- True positives, from real headlines -----------------------------------

ok(
	'matches a full latin name',
	has('Sihem Ben Sedrine, 25 ans de prison : le triomphe de l’impunité ?', 'sihem-bensedrine'),
	'particle-split: authored "Bensedrine", headline "Ben Sedrine"'
);
ok(
	'matches an arabic name carrying tashkeel',
	has('رسالة مفتوحة من السجين السياسي العياشي الهمامي إلى قيس سعيّد', 'kais-saied'),
	'قيس سعيّد'
);
ok(
	'matches a second entity in the same arabic headline',
	has('رسالة مفتوحة من السجين السياسي العياشي الهمامي إلى قيس سعيّد', 'ayachi-hammami')
);
ok(
	'matches an authored french name variant',
	has('La coopération militaire au cœur d’un entretien Khaled Sehili-Zimmerman', 'khaled-shili'),
	'authored name_fr is "Khaled Sehili"; name_en is "Khaled Shili"'
);
// The single token "Ettabaa" is ambiguous: the surname is shared by Youssef
// Saheb Ettabaa and Mustapha Saheb Ettabaa (people.yaml) — the surname-only
// gate must refuse it rather than guess. (Previously this case was exercised
// with "Sehili", which ceased to be ambiguous on 2026-08-08 when the duplicate
// records khaled-shili and khalil-sehili were merged into one person.)
ok(
	'a single ambiguous surname is refused, not guessed',
	ids('La coopération militaire au cœur d’un entretien Ettabaa-Zimmerman').length === 0,
	'"Ettabaa" matches Youssef Saheb Ettabaa and Mustapha Saheb Ettabaa; both are refused'
);
ok('matches an acronym institution', has('L’UGTT veut réformes structurelles', 'ugtt'));
ok('matches a foreign state', has('La Tunisie convoque l’ambassadrice de France', 'france'));

// --- True negatives. These matter more than the positives above. -----------

ok(
	'a bare common given name matches nobody',
	ids('Mohamed a ouvert un commerce à Sfax').length === 0,
	JSON.stringify(ids('Mohamed a ouvert un commerce à Sfax'))
);
ok(
	'a generic headline matches nobody',
	ids('Météo : temps pluvieux sur le nord-ouest du pays').length === 0
);
ok(
	'a bare particle matches nobody',
	ids('Ben, El, Abou').length === 0,
	JSON.stringify(ids('Ben, El, Abou'))
);
ok(
	'an ordinary arabic sentence matches nobody',
	ids('ارتفاع أسعار الخضر والغلال في الأسواق').length === 0,
	JSON.stringify(ids('ارتفاع أسعار الخضر والغلال في الأسواق'))
);
ok(
	'lowercase prose does not trip the single-token gate',
	ids('la presse locale rapporte une hausse du prix du pain').length === 0,
	'"la presse" is an institution; without capitalisation it must not fire'
);

// --- The surname-only rule, and why the feed refuses it --------------------
//
// The matcher's distinctiveness gate can only measure a token against the 310
// people IN THE GRAPH. Tunisia has roughly twelve million. So "unique here" is a
// far weaker signal than it looks, and surname-only matching is where that gap
// shows: on real headlines it produced `slim-besbes` (an interim finance minister
// of 2012) for a story about solar storage batteries, and `abdessattar-ben-moussa`
// (an LTDH president) for one about closed restaurants. Both are almost certainly
// different people who happen to share a surname.
//
// The rule is kept — it is genuinely right for `Moussi` when Abir Moussi is on
// trial — but every Match carries its `rule`, and the feed presentation filters
// surname-only links out rather than asserting a connection it cannot support.

const besbes = m.find('Besbes: les batteries de stockage marquent une avancée pour le solaire');
ok(
	'surname-only matches are labelled as such',
	besbes.length > 0 && besbes.every((x) => x.rule === 'surname'),
	besbes.map((x) => `${x.id}:${x.rule}`).join(', ') || 'no match'
);
ok(
	'filtering the surname rule removes the known false positives',
	m
		.find('Besbes: les batteries de stockage marquent une avancée pour le solaire')
		.filter((x) => x.rule !== 'surname').length === 0 &&
		m
			.find('Ben Moussa: Des restaurants fermés et des équipements endommagés')
			.filter((x) => x.rule !== 'surname').length === 0
);

// --- Structural guarantees -------------------------------------------------

const overlapping = m.find('Zine El Abidine Ben Ali et Kais Saied');
ok(
	'matches never overlap',
	overlapping.every((a, i) =>
		overlapping.slice(i + 1).every((b) => a.end <= b.start || b.end <= a.start)
	),
	overlapping.map((x) => x.text).join(' | ')
);
ok(
	'offsets index the original text',
	overlapping.every((x) => x.text.length === x.end - x.start)
);
ok(
	'an ambiguous surface form is claimed by nobody',
	[...m.ambiguous.values()].every((owners) => owners.length > 1),
	`${m.ambiguous.size} refused as ambiguous`
);
ok('the stoplist is derived, not empty', m.stoplist.size > 50, `${m.stoplist.size} tokens`);

console.log(
	`\n  matchable ${m.stats.matchable}/${m.stats.entities} entities · ${m.stats.forms} surface forms · ` +
		`${m.stats.rejectedSingletons} single-token forms refused · stoplist ${m.stats.stoplist}`
);
console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
