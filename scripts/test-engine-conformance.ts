/**
 * Engine-conformance gate.
 *
 * DeepTunisia consumes the DeepEpisteme engine module by module, pinned by tag
 * in package.json. The pinned engine is the source of truth for the time
 * predicates and the claim envelope, so DeepTunisia CI must fail when a bump
 * changes the contract it depends on. This suite runs the installed engine
 * through that contract:
 *
 *   * whitespace does not satisfy mandatory prose
 *   * an authored basis override needs provenance, or a live exception
 *   * an unknown nested key fails instead of being stripped
 *   * certain implies possible for every interval and boundary
 *   * the local time binding is the engine, not a second copy
 *
 * It reads the engine from node_modules; a failed install fails here first.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	PositionSchema,
	ReviewSchema,
	configureClaimExceptions,
	isBasisUpgrade
} from 'deepepisteme/claim';
import {
	resolveInterval as engineResolveInterval,
	certainlyActive as engineCertainlyActive,
	possiblyActive as enginePossiblyActive,
	applyOngoingObservation,
	configureTime as engineConfigureTime,
	getCutoff,
	getFloor
} from 'deepepisteme/time';
import * as localDates from './dates.ts';
import { loadParameters } from './parameters.ts';

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

// --- the pin itself ---------------------------------------------------------

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const installed = JSON.parse(
	readFileSync(new URL('../node_modules/deepepisteme/package.json', import.meta.url), 'utf8')
);
const spec: string = pkg.dependencies?.deepepisteme ?? '';
ok(
	'the engine dependency is pinned to an exact tag',
	/#v\d+\.\d+\.\d+$/.test(spec),
	`${spec} installed ${installed.version}`
);

// --- one implementation -----------------------------------------------------

ok(
	'DeepTunisia re-exports the engine resolver, not a second copy',
	localDates.resolveInterval === engineResolveInterval
);
ok(
	'DeepTunisia re-exports the engine predicates, not a second copy',
	localDates.certainlyActive === engineCertainlyActive &&
		localDates.possiblyActive === enginePossiblyActive
);

// --- claim envelope ---------------------------------------------------------

{
	const base = {
		id: 'p-fixture',
		role: 'r-fixture',
		holder: 'h-fixture',
		start: '2020-01-01',
		confidence: 'C',
		verification: 'needs-primary-source',
		sources: ['s-fixture']
	};
	for (const blank of [' ', '\t\n ', '']) {
		ok(
			`engine: whitespace attribution ${JSON.stringify(blank)} is rejected`,
			!PositionSchema.safeParse({
				...base,
				attributed_to: blank,
				reasoning: 'Reasoned.',
				falsifiable_by: 'A falsifier.'
			}).success
		);
		ok(
			`engine: whitespace reasoning ${JSON.stringify(blank)} is rejected`,
			!PositionSchema.safeParse({
				...base,
				attributed_to: 'Some Observer',
				reasoning: blank,
				falsifiable_by: 'A falsifier.'
			}).success
		);
	}
	const override = {
		...base,
		attributed_to: 'Some Observer',
		reasoning: 'Reasoned.',
		falsifiable_by: 'A falsifier.',
		basis: 'documented'
	};
	ok('engine: an override without review is rejected', !PositionSchema.safeParse(override).success);
	ok(
		'engine: an unknown review key is rejected, not stripped',
		!ReviewSchema.safeParse({
			by: 'Example reviewer',
			date: '2026-09-09',
			method: 'source-check',
			outcome: 'refuted'
		}).success
	);
	configureClaimExceptions({
		basisOverrides: new Set(['position:p-fixture:inferred>documented'])
	});
	ok('engine: a live exception lets the override parse', PositionSchema.safeParse(override).success);
	configureClaimExceptions({});
	ok('engine: removing the exception fails the override again', !PositionSchema.safeParse(override).success);
	ok(
		'engine: isBasisUpgrade ranks documented over reported',
		isBasisUpgrade('documented', 'reported') && !isBasisUpgrade('reported', 'documented')
	);
}

// --- temporal contract ------------------------------------------------------

const parameters = loadParameters(fileURLToPath(new URL('../data/parameters.yaml', import.meta.url)));
engineConfigureTime(parameters.time);
ok(
	'engine: the cutoff follows the configured parameters',
	getCutoff() === Date.parse(parameters.time.cutoff)
);
ok('engine: the floor follows the configured parameters', getFloor() === Date.parse(parameters.time.floor));

{
	const cutoff = getCutoff();
	const probe = engineResolveInterval({ start: '2020-01-01', end: '?' });
	const after = cutoff + 86_400_000;
	ok('engine: unknown end is not certain past the cutoff', !engineCertainlyActive(probe, after));
	ok(
		'engine: unknown end never violates certain implies possible',
		!engineCertainlyActive(probe, after) || enginePossiblyActive(probe, after)
	);

	const starts = ['2018-06-01', '2018-06', '2018', '~2017', '<=2018-06', '>=1984', '?'];
	const ends = ['2020-06-01', '2020-06', '2020', '~2020', 'ongoing', 'verified:2020-06', '?'];
	const boundaries = [
		getFloor(),
		cutoff - 86_400_000,
		cutoff,
		cutoff + 86_400_000,
		Date.UTC(2020, 1, 29),
		Date.UTC(2024, 1, 29)
	];
	const violations: string[] = [];
	for (const s of starts) {
		for (const e of ends) {
			let iv;
			try {
				iv = engineResolveInterval({ start: s, end: e });
			} catch {
				continue;
			}
			const settled = applyOngoingObservation(iv, cutoff);
			if (settled.startEarliest > settled.startLatest) violations.push(`ordering ${s}/${e}`);
			for (const t of boundaries) {
				if (engineCertainlyActive(settled, t) && !enginePossiblyActive(settled, t)) {
					violations.push(`certain without possible ${s}/${e}`);
				}
				if (t > cutoff && (engineCertainlyActive(settled, t) || enginePossiblyActive(settled, t))) {
					violations.push(`assertion past cutoff ${s}/${e}`);
				}
			}
		}
	}
	ok(
		'engine: certain implies possible and nothing is asserted past cutoff across the token grid',
		violations.length === 0,
		violations[0] ?? `${starts.length * ends.length} combinations`
	);
}

console.log(
	`\n  ${checks - failures}/${checks} engine-conformance checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
