/**
 * Regression suite for the jurisdiction parameterisation (sprint v0.1.2, W2).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The portability claim ("a fork retargets Layer 1 by editing one file") is
 * only true if the validators actually READ the parameter file. A mutation
 * that re-hardcodes the Tunisia bbox, the JORT vocabulary or the 1956/2026
 * floor/cutoff would leave the default build byte-identical — `test-data.ts`
 * and every other emitted-graph suite would stay green — while silently
 * breaking every fork's ability to retarget. This suite closes that gap by
 * reconfiguring the modules with synthetic parameters and proving the
 * behaviour follows: a widened box accepts a coordinate the Tunisia box
 * rejects, a narrowed vocabulary stops matching "JORT", and the date
 * resolver's window/slack arithmetic tracks the configured values.
 *
 * The suite mutates module-level state (dates.ts's exported lets); the place box
 * and the gazette vocabulary are the deployment's, so those blocks build a
 * second engine instead. Every block that reconfigures restores the
 * shipped defaults, and a final block asserts the restoration itself — a test
 * that leaks its fixture state would poison every assertion after it.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { DEFAULT_PARAMETERS, loadParameters, type Parameters } from './parameters.ts';
import { createEngine } from 'deepepisteme';
import { deployment, engine } from './engine.ts';
import { PlaceSchema, reviewOverclaims } from './schema.ts';
import {
	configureTime,
	parseDateEdge,
	DATASET_FLOOR,
	DATASET_CUTOFF,
	APPROX_SLACK_DAYS,
	BEFORE_WINDOW_MS
} from './dates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

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

/**
 * A shipped place record (Port of Radès) with its coordinates replaced. The
 * coordinates are parsed by the place schema the build parses places with, so
 * the box under test is the one the pipeline applies, not a copy of it.
 */
const PLACE_FIXTURE = {
	kind: 'port',
	id: 'place-rades-port',
	name_en: 'Port of Radès',
	parent: 'gov-ben-arous',
	confidence: 'A',
	basis: 'documented',
	sources: ['wikidata-q11942395']
};

/** The rejection message the given place schema produces for a coordinate pair. */
function coordMessage(schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { message: string }[] } } }, input: [number, number]): string {
	const r = schema.safeParse({ ...PLACE_FIXTURE, coordinates: input });
	if (r.success) return '';
	return r.error?.issues.map((i) => i.message).find((m) => m.startsWith('coordinates must fall')) ?? '';
}

// ---------------------------------------------------------------------------
// 1. The canonical file IS the shipped default, value for value.
//    These pins exist so that a future "improvement" to the default values
//    cannot slip in as a parameter-file edit: the defaults are the project's
//    published contract (the paper's Table 5 references them), and changing
//    them is a release decision, not a data edit.
// ---------------------------------------------------------------------------
{
	const loaded = loadParameters(join(HERE, '..', 'data', 'parameters.yaml'));
	ok(
		'parameters.yaml deep-equals DEFAULT_PARAMETERS',
		isDeepStrictEqual(loaded, DEFAULT_PARAMETERS),
		'canonical file and shipped default are one value'
	);
	const b = DEFAULT_PARAMETERS.jurisdiction.bbox;
	ok('default bbox is the Tunisia box', b.lonMin === 8 && b.lonMax === 12 && b.latMin === 30 && b.latMax === 38, `lon ${b.lonMin}..${b.lonMax}, lat ${b.latMin}..${b.latMax}`);
	ok(
		'default gazette vocabulary',
		isDeepStrictEqual(DEFAULT_PARAMETERS.jurisdiction.gazette.vocabulary, ['jort', 'gazette', 'decree text', 'décret']),
		DEFAULT_PARAMETERS.jurisdiction.gazette.vocabulary.join(', ')
	);
	ok(
		'default gazette source prefixes',
		isDeepStrictEqual(DEFAULT_PARAMETERS.jurisdiction.gazette.sourcePrefixes, ['jort-', '9anoun', 'legislation-securite', 'iort-']),
		DEFAULT_PARAMETERS.jurisdiction.gazette.sourcePrefixes.join(', ')
	);
	ok('default floor is Tunisian independence', DEFAULT_PARAMETERS.time.floor === '1956-03-20', DEFAULT_PARAMETERS.time.floor);
	ok('default cutoff', DEFAULT_PARAMETERS.time.cutoff === '2026-11-27', DEFAULT_PARAMETERS.time.cutoff);
	ok('default before-window is 8 years', DEFAULT_PARAMETERS.time.beforeWindowYears === 8, `${DEFAULT_PARAMETERS.time.beforeWindowYears} years`);
	ok(
		'default approx slack',
		isDeepStrictEqual(DEFAULT_PARAMETERS.time.approxSlackDays, { year: 365, month: 92 }),
		`year ${DEFAULT_PARAMETERS.time.approxSlackDays.year}, month ${DEFAULT_PARAMETERS.time.approxSlackDays.month}`
	);
	ok(
		'default index discounts',
		isDeepStrictEqual(DEFAULT_PARAMETERS.index.discount, { documented: 1, reported: 0.55, inferred: 0.2, unsubstantiated: 0 }),
		`1 / 0.55 / 0.2 / 0, got ${JSON.stringify(DEFAULT_PARAMETERS.index.discount)}`
	);
}

// ---------------------------------------------------------------------------
// 2. Place coordinates under the shipped box: the place schema the build parses
//    places with rejects what lies outside Tunisia and accepts a shipped point.
// ---------------------------------------------------------------------------
{
	ok(
		'shipped place schema accepts a point inside the box',
		PlaceSchema.safeParse({ ...PLACE_FIXTURE, coordinates: [10.287201, 36.805401] }).success,
		'[10.287201, 36.805401] is inside lon 8..12, lat 30..38'
	);
	ok('default box rejects [2, 40]', coordMessage(PlaceSchema, [2, 40]) !== '', '[2, 40] is outside lon 8..12, lat 30..38');
	ok(
		'default rejection message names Tunisia and the box',
		coordMessage(PlaceSchema, [2, 40]).includes('Tunisia') && coordMessage(PlaceSchema, [2, 40]).includes('lon 8..12, lat 30..38'),
		coordMessage(PlaceSchema, [2, 40])
	);
}

// ---------------------------------------------------------------------------
// 3. The box is the deployment's, which reads the parameters, not a hardcoded
//    box. A second engine whose deployment carries a widened jurisdiction
//    accepts what Tunisia rejects, and its failure message names the new
//    jurisdiction. The one engine of the build is not touched.
// ---------------------------------------------------------------------------
{
	ok(
		'the deployment box is the parameter file box',
		isDeepStrictEqual(deployment.bbox, DEFAULT_PARAMETERS.jurisdiction.bbox),
		JSON.stringify(deployment.bbox)
	);
	const morocco = createEngine({
		...deployment,
		name: 'Morocco',
		bbox: { lonMin: -20, lonMax: 20, latMin: 20, latMax: 60 }
	});
	const widened = morocco.schemaOf('place');
	ok(
		'widened box accepts [2, 40] — the validator reads the deployment',
		widened.safeParse({ ...PLACE_FIXTURE, coordinates: [2, 40] }).success,
		'[2, 40] is inside the configured box'
	);
	const msg = coordMessage(widened, [-30, 80]);
	ok(
		'reconfigured rejection message names the new jurisdiction',
		msg.includes('Morocco') && msg.includes('lon -20..20, lat 20..60'),
		msg
	);
	ok(
		'the build engine still rejects [2, 40]',
		engine.schemaOf('place').safeParse({ ...PLACE_FIXTURE, coordinates: [2, 40] }).success === false,
		'the widened engine is a separate instance'
	);
}

// ---------------------------------------------------------------------------
// 4. The gazette-overclaim guard reads the deployment's vocabulary and source
//    prefixes.
// ---------------------------------------------------------------------------
{
	ok(
		'guard (defaults): gazette wording with no gazette source overclaims',
		reviewOverclaims('checked directly against the JORT decree text', ['tier3-article']) === true
	);
	ok(
		'guard (defaults): gazette wording with a gazette source does not overclaim',
		reviewOverclaims('checked directly against the JORT decree text', ['jort-2020-123']) === false
	);

	// The vocabulary is the deployment's: a second engine whose deployment names
	// another gazette word reads it, and the build engine is not touched.
	const bulletin = createEngine({
		...deployment,
		gazette: { ...deployment.gazette, vocabulary: ['bulletin'] }
	});
	ok(
		'guard: vocabulary comes from the deployment — "JORT" no longer claims a gazette',
		bulletin.envelope.reviewOverclaims('checked directly against the JORT decree text', ['tier3-article']) === false
	);
	ok(
		'guard: the configured vocabulary now matches "bulletin"',
		bulletin.envelope.reviewOverclaims('checked against the bulletin', ['tier3-article']) === true
	);
}

// ---------------------------------------------------------------------------
// 5. The date resolver reads the configured floor/cutoff/window/slack. The
//    BEFORE_WINDOW semantics (dates.ts): "in post by X, start unknown" opens
//    back at most `beforeWindowYears` from X's latest edge; "~Y" widens a
//    year-precision guess by `approxSlackDays.year` either side. A
//    non-day-precision floor is a build failure, not a guess. Restore
//    afterwards.
// ---------------------------------------------------------------------------
{
	configureTime({ floor: '1970-01-01', cutoff: '2030-01-01', beforeWindowYears: 5, approxSlackDays: { year: 100, month: 30 } });
	ok('DATASET_FLOOR reflects the configured floor', DATASET_FLOOR === Date.UTC(1970, 0, 1), new Date(DATASET_FLOOR).toISOString());
	ok('DATASET_CUTOFF reflects the configured cutoff', DATASET_CUTOFF === Date.UTC(2030, 0, 1), new Date(DATASET_CUTOFF).toISOString());

	const unknown = parseDateEdge('?');
	ok(
		'"?" spans the configured floor-to-cutoff',
		unknown.earliest === Date.UTC(1970, 0, 1) && unknown.latest === Date.UTC(2030, 0, 1),
		`earliest ${unknown.earliest}, latest ${unknown.latest}`
	);

	const before = parseDateEdge('<=2018-06-01');
	const baseLatest = Date.UTC(2018, 5, 1);
	ok(
		'"<=2018-06-01" opens back exactly the configured 5-year window',
		before.earliest === baseLatest - BEFORE_WINDOW_MS && before.latest === baseLatest,
		`earliest ${before.earliest}, latest ${before.latest}`
	);

	const approx = parseDateEdge('~2017');
	ok(
		'"~2017" widens by the configured year slack (±100 days, not ±365)',
		approx.earliest === Date.UTC(2017, 0, 1) - 100 * 86_400_000 &&
			approx.latest === Date.UTC(2017, 11, 31, 23, 59, 59) + 100 * 86_400_000,
		`slack ${APPROX_SLACK_DAYS.year} days; earliest ${approx.earliest}, latest ${approx.latest}`
	);

	let threw = false;
	let thrownMessage = '';
	try {
		configureTime({ floor: '1956-03', cutoff: '2030-01-01', beforeWindowYears: 5, approxSlackDays: { year: 100, month: 30 } });
	} catch (e) {
		threw = true;
		thrownMessage = (e as Error).message;
	}
	ok(
		'a month-precision floor is a build failure, not a guess',
		threw && thrownMessage.includes('day-precision'),
		thrownMessage || 'did not throw'
	);

	configureTime(DEFAULT_PARAMETERS.time);
}

// ---------------------------------------------------------------------------
// 6. Emitted parity: the build publishes the parameter file into dataset.json
//    meta, and the epoch constants it derives from it. The paper's Table 5
//    references these values; this pin is what keeps "published as data" true.
// ---------------------------------------------------------------------------
{
	const ds = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8'));
	const loaded = loadParameters(join(HERE, '..', 'data', 'parameters.yaml'));
	ok(
		'emitted meta.parameters deep-equals the canonical parameter file',
		isDeepStrictEqual(ds.meta.parameters, loaded),
		'metadata parity pin'
	);
	ok('emitted meta.floor is the epoch of 1956-03-20 UTC', ds.meta.floor === Date.UTC(1956, 2, 20), new Date(ds.meta.floor).toISOString());
	ok('emitted meta.cutoff is the epoch of 2026-11-27 UTC', ds.meta.cutoff === Date.UTC(2026, 10, 27), new Date(ds.meta.cutoff).toISOString());
}

// ---------------------------------------------------------------------------
// 7. State restoration: every block above reconfigured a module and restored
//    it. This block proves the restoration, so a leaked fixture cannot pass
//    the suite on the next run (and so the shipped defaults are the state
//    this file leaves behind).
// ---------------------------------------------------------------------------
{
	ok('the place schema still rejects [2, 40]', coordMessage(PlaceSchema, [2, 40]) !== '', coordMessage(PlaceSchema, [2, 40]));
	ok(
		'guard is restored to the default vocabulary',
		reviewOverclaims('checked directly against the JORT decree text', ['tier3-article']) === true &&
			reviewOverclaims('checked directly against the JORT decree text', ['jort-2020-123']) === false
	);
	ok('DATASET_FLOOR is restored to 1956-03-20', DATASET_FLOOR === Date.UTC(1956, 2, 20), new Date(DATASET_FLOOR).toISOString());
	ok('DATASET_CUTOFF is restored to 2026-11-27', DATASET_CUTOFF === Date.UTC(2026, 10, 27), new Date(DATASET_CUTOFF).toISOString());
	ok('approx slack is restored to ±365/±92 days', APPROX_SLACK_DAYS.year === 365 && APPROX_SLACK_DAYS.month === 92, JSON.stringify(APPROX_SLACK_DAYS));
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
