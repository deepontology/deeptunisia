/**
 * Engine-conformance gate.
 *
 * DeepTunisia consumes the DeepEpisteme engine through one instance, pinned by
 * commit in package.json. The pinned engine is the source of truth for the time
 * model and the claim envelope, so DeepTunisia CI must fail when a bump changes
 * the contract it depends on. This suite runs the installed engine through that
 * contract:
 *
 *   * whitespace does not satisfy mandatory prose
 *   * an authored basis override needs provenance, or a live exception
 *   * an unknown nested key fails instead of being stripped
 *   * certain implies possible for every interval and boundary
 *   * the local time binding is the engine, not a second copy
 *   * the review schema that ships here is the stricter one, and stays so
 *
 * The engine is built from DeepTunisia's own parameters and vocabulary, so a
 * deployment value that only works elsewhere fails here. It reads the engine
 * from node_modules; a failed install fails here first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { nonBlank } from 'deepepisteme/kernel';
import * as localDates from './dates.ts';
import { engine, parameters } from './engine.ts';
import { ReviewSchema as DeeptunisiaReviewSchema } from './schema.ts';

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
	'the engine dependency is pinned to an exact tag or commit',
	/#v\d+\.\d+\.\d+$/.test(spec) || /#[0-9a-f]{40}$/.test(spec),
	`${spec} installed ${installed.version}`
);

// --- the deployment and the engine ------------------------------------------

/**
 * The engine under test is the one instance this repository builds
 * (scripts/engine.ts), configured from data/parameters.yaml and the
 * vocabularies scripts/schema.ts declares. The canonical hash and the splicer
 * are reached through the same instance, so this gate covers the engine the
 * build and the editorial tool actually use, not a second one built here.
 */

/** Point the local binding at the same parameters the build uses. */
localDates.configureTime(parameters.time);

// --- one implementation -----------------------------------------------------
//
// The local binding is not allowed to compute dates itself. It holds one Time
// object built from the same parameters this engine holds, so the two must
// answer every question identically. A second copy in dates.ts drifts on the
// first token either side handles differently.

{
	const run = (fn: () => unknown) => {
		try {
			return JSON.stringify(fn());
		} catch {
			return 'threw';
		}
	};
	const starts = [
		'2018-06-01',
		'2018-06',
		'2018',
		'~2017',
		'<=2018-06',
		'>=1984',
		'?',
		'ongoing',
		'verified:2025-12',
		'2030-01-01'
	];
	const ends = ['2021-06-01', '2021-06', '2021', '~2021', 'ongoing', 'verified:2021-06', '?', '<=2021'];

	const intervalDrift: string[] = [];
	const intervals = [];
	for (const start of starts) {
		for (const end of ends) {
			const local = run(() => localDates.resolveInterval({ start, end }));
			const reference = run(() => engine.time.resolveInterval(start, end));
			if (local !== reference) intervalDrift.push(`${start}/${end}`);
			else if (local !== 'threw') intervals.push(engine.time.resolveInterval(start, end));
		}
	}
	ok(
		'DeepTunisia resolves intervals through the engine, not a second copy',
		intervalDrift.length === 0,
		intervalDrift[0] ?? `${starts.length * ends.length} token pairs`
	);

	const probes = [Date.UTC(2019, 5, 1), Date.UTC(2021, 6, 1), Date.UTC(2026, 10, 8), Date.UTC(2027, 0, 1)];
	const predicateDrift: string[] = [];
	for (const iv of intervals) {
		for (const t of probes) {
			const local = run(() => [
				localDates.certainlyActive(iv, t),
				localDates.possiblyActive(iv, t),
				localDates.durationYears(iv)
			]);
			const reference = run(() => [
				engine.time.certainlyActive(iv, t),
				engine.time.possiblyActive(iv, t),
				engine.time.durationYears(iv)
			]);
			if (local !== reference) predicateDrift.push(`${iv.raw.start}/${iv.raw.end}@${t}`);
		}
	}
	ok(
		'DeepTunisia predicates are the engine predicates, not a second copy',
		predicateDrift.length === 0,
		predicateDrift[0] ?? `${intervals.length * probes.length} probes`
	);
}

// --- claim envelope ---------------------------------------------------------

/**
 * A claim record's shape, as the envelope sees it: the fields it reads, each
 * mandatory prose field refusing whitespace through the kernel's own `nonBlank`.
 */
const text = (min = 1) => z.string().refine((v) => nonBlank(v, min), 'a mandatory text field must not be blank');

const claimFixture = z.strictObject({
	id: z.string().min(1),
	role: z.string(),
	holder: z.string(),
	start: z.string(),
	confidence: engine.envelope.Confidence,
	verification: engine.envelope.Verification,
	basis: engine.envelope.Basis.optional(),
	attributed_to: text(2).optional(),
	reasoning: text(),
	falsifiable_by: text(),
	sources: z.array(z.string()).default([]),
	basis_override_reason: text(10).optional(),
	review: engine.envelope.ReviewSchema.optional()
});

/** Exceptions are a live argument, so a register can change between parses. */
let liveExceptions = { ...engine.envelope.exceptions };
const positionSchema = engine.envelope.withClaimEnvelope('position', claimFixture, () => liveExceptions);

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
			!positionSchema.safeParse({
				...base,
				attributed_to: blank,
				reasoning: 'Reasoned.',
				falsifiable_by: 'A falsifier.'
			}).success
		);
		ok(
			`engine: whitespace reasoning ${JSON.stringify(blank)} is rejected`,
			!positionSchema.safeParse({
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
	ok('engine: an override without review is rejected', !positionSchema.safeParse(override).success);
	ok(
		'engine: an unknown review key is rejected, not stripped',
		!engine.envelope.ReviewSchema.safeParse({
			by: 'Example reviewer',
			date: '2026-09-09',
			method: 'source-check',
			outcome: 'refuted'
		}).success
	);
	liveExceptions = { basisOverrides: new Set(['position:p-fixture:inferred>documented']) };
	ok('engine: a live exception lets the override parse', positionSchema.safeParse(override).success);
	liveExceptions = {};
	ok('engine: removing the exception fails the override again', !positionSchema.safeParse(override).success);
	ok(
		'engine: isBasisUpgrade ranks documented over reported',
		engine.envelope.isBasisUpgrade('documented', 'reported') &&
			!engine.envelope.isBasisUpgrade('reported', 'documented')
	);
	// The review schema is built by the engine from this deployment's labels, so
	// the engine and this tree take and refuse the same signers, dates and keys.
	const signers = [
		'Example reviewer',
		'maintainer',
		'Initial compilation',
		'JORT verification pass',
		'Research pass 2026-09-09',
		'Research pass 2026-02-31x',
		'reviewer-7',
		'reviewer-'
	];
	const reviewBase = { date: '2026-09-09', method: 'source-check' };
	const sameVerdict = signers.every(
		(by) => engine.envelope.ReviewSchema.safeParse({ ...reviewBase, by }).success === DeeptunisiaReviewSchema.safeParse({ ...reviewBase, by }).success
	);
	ok('review: the engine and this tree take and refuse the same signers', sameVerdict);
	ok(
		'review: a signer that is a name is refused, a role label is accepted',
		!engine.envelope.ReviewSchema.safeParse({ ...reviewBase, by: 'Example reviewer' }).success &&
			engine.envelope.ReviewSchema.safeParse({ ...reviewBase, by: 'JORT verification pass' }).success &&
			engine.envelope.ReviewSchema.safeParse({ ...reviewBase, by: 'Research pass 2026-09-09' }).success
	);
}

// --- temporal contract ------------------------------------------------------

ok(
	'engine: the cutoff follows the configured parameters',
	engine.time.cutoff === Date.parse(parameters.time.cutoff)
);
ok('engine: the floor follows the configured parameters', engine.time.floor === Date.parse(parameters.time.floor));

{
	const cutoff = engine.time.cutoff;
	const probe = engine.time.resolveInterval('2020-01-01', '?');
	const after = cutoff + 86_400_000;
	ok('engine: unknown end is not certain past the cutoff', !engine.time.certainlyActive(probe, after));
	ok(
		'engine: unknown end never violates certain implies possible',
		!engine.time.certainlyActive(probe, after) || engine.time.possiblyActive(probe, after)
	);

	const starts = ['2018-06-01', '2018-06', '2018', '~2017', '<=2018-06', '>=1984', '?'];
	const ends = ['2020-06-01', '2020-06', '2020', '~2020', 'ongoing', 'verified:2020-06', '?'];
	const boundaries = [
		engine.time.floor,
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
				iv = engine.time.resolveInterval(s, e);
			} catch {
				continue;
			}
			const settled = engine.time.applyOngoingObservation(iv, cutoff);
			if (settled.startEarliest > settled.startLatest) violations.push(`ordering ${s}/${e}`);
			for (const t of boundaries) {
				if (engine.time.certainlyActive(settled, t) && !engine.time.possiblyActive(settled, t)) {
					violations.push(`certain without possible ${s}/${e}`);
				}
				if (t > cutoff && (engine.time.certainlyActive(settled, t) || engine.time.possiblyActive(settled, t))) {
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

// --- the deployment accepts the real data ----------------------------------
// The engine's own parse is run over every record in data/ with the dated
// exception register, the way `deepepisteme check` reads a data directory. A
// deployment value that is narrower than the schema this repository ships (a
// source language, a vocabulary entry) makes records the build accepts fail
// here, so the two cannot drift apart unseen.
{
	const dir = join(import.meta.dirname, '..', 'data');
	const entries = (parseYaml(readFileSync(join(dir, 'source-exceptions.yaml'), 'utf8')) ?? []) as {
		rule: string;
		kind: string;
		id: string;
		deadline: string;
		reason: string;
		implied?: string;
		authored?: string;
	}[];
	const sourceExceptions = new Map<string, { rule: string; expires: string; reason: string }>();
	const basisOverrides = new Map<string, { reason: string; source: string }>();
	for (const e of entries) {
		if (e.rule === 'basis-override' && e.implied && e.authored) {
			basisOverrides.set(`${e.kind}:${e.id}:${e.implied}>${e.authored}`, { reason: e.reason, source: e.deadline });
		} else {
			sourceExceptions.set(`${e.kind}:${e.id}`, { rule: e.rule, expires: e.deadline, reason: e.reason });
		}
	}
	const raw: Record<string, unknown[]> = {};
	for (const def of engine.kinds.values()) {
		const path = join(dir, def.file);
		if (!existsSync(path)) continue;
		const parsed = parseYaml(readFileSync(path, 'utf8'));
		raw[def.kind] = Array.isArray(parsed) ? parsed : [];
	}
	const { records, findings } = engine.parse(raw, { sourceExceptions, basisOverrides });
	const total = Object.values(records).reduce((n, list) => n + list.length, 0);
	const sample = findings.slice(0, 3).map((f) => `${f.rule} ${f.record?.kind} ${f.record?.id}: ${f.message}`);
	ok(
		'engine: the deployment parses every record in data/ without a finding',
		findings.length === 0 && total > 0,
		findings.length ? `${findings.length} findings; ${sample.join(' | ')}` : `${total} records, 0 findings`
	);
}

console.log(
	`\n  ${checks - failures}/${checks} engine-conformance checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
