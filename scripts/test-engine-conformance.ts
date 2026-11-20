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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { nonBlank } from 'deepepisteme/kernel';
import * as localDates from './dates.ts';
import { deployment, engine, parameters } from './engine.ts';
import * as vocabulary from './vocabulary.ts';
import * as schemaModule from './schema.ts';
import { ReviewSchema as DeeptunisiaReviewSchema } from './schema.ts';

function isEqualList(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

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

	// --- the schemas this repository exports are the schemas parse uses -------
	//
	// A schema kept in scripts/ after its kind moved to the engine still passes
	// every test that imports it, while parse no longer uses it: green tests,
	// zero coverage. So every engine kind must have exactly one export in
	// scripts/schema.ts, built through engine.schemaOf and nothing else, the
	// only other schemas in the file are the ones that name no engine kind, and
	// each export answers like the schema parse resolves for its kind.
	const source = readFileSync(join(import.meta.dirname, 'schema.ts'), 'utf8');
	const exportsByKind = new Map<string, string[]>();
	for (const m of source.matchAll(/^export const (\w+) = (?:kernelSchema|atlasSchema)<\w+>\('([a-z-]+)'\);$/gm)) {
		exportsByKind.set(m[2], [...(exportsByKind.get(m[2]) ?? []), m[1]]);
	}
	const kinds = [...engine.kinds.keys()].sort();
	ok(
		'every engine kind has exactly one consumer schema, built through engine.schemaOf',
		kinds.every((k) => exportsByKind.get(k)?.length === 1) &&
			[...exportsByKind.keys()].every((k) => engine.kinds.has(k)),
		`${kinds.length} kinds, ${exportsByKind.size} exports`
	);
	const constructed = [...source.matchAll(/^export const (\w+) = (?!kernelSchema|atlasSchema)(?:z\s*\.|create\w+\()/gm)]
		.map((m) => m[1])
		.sort();
	ok(
		'no consumer schema is constructed for an engine kind',
		isEqualList(constructed, ['CountriesFileSchema', 'RegionSchema', 'ReviewSchema', 'SourceExceptionRule', 'SourceExceptionSchema']),
		constructed.join(', ')
	);
	const mod = schemaModule as Record<string, z.ZodType>;
	const wrong: string[] = [];
	for (const kind of kinds) {
		const exported = mod[exportsByKind.get(kind)?.[0] ?? ''];
		const direct = engine.schemaOf(kind);
		const candidates = (raw[kind] ?? []).slice(0, 25);
		const accepted = candidates.find((r) => direct.safeParse(r).success);
		const probes: unknown[] = [{}, ...(accepted ? [accepted, { ...(accepted as object), stranger_key: 1 }] : [])];
		for (const probe of probes) {
			const a = exported?.safeParse(probe);
			const b = direct.safeParse(probe);
			const same =
				!!a &&
				a.success === b.success &&
				(a.success || JSON.stringify(a.error.issues.map((i) => i.message)) === JSON.stringify((b as { error: z.ZodError }).error.issues.map((i) => i.message)));
			if (!same) wrong.push(`${kind} ${JSON.stringify(probe).slice(0, 40)}`);
		}
		if (accepted && exported?.safeParse({ ...(accepted as object), stranger_key: 1 }).success) wrong.push(`${kind} accepts an unknown key`);
	}
	ok(
		'each consumer schema answers like the schema parse resolves for its kind',
		wrong.length === 0,
		wrong.length ? wrong.join('; ') : `${kinds.length} kinds, accepted record, stranger key and empty record each agree`
	);

	// --- scripts/vocabulary.ts is the one place a vocabulary list lives -------
	//
	// The deployment reads the lists, the consumer narrows its types from them,
	// and the engine's kinds validate against them. A list copied elsewhere is
	// how a vocabulary ends up accepted in one place and refused in another.
	const lists: Record<string, readonly string[]> = {
		layers: vocabulary.Layer.options,
		institutionTypes: vocabulary.InstitutionType.options,
		relationshipTypes: vocabulary.RelationshipType.options,
		influenceChannels: vocabulary.INFLUENCE_CHANNELS,
		agreementKinds: vocabulary.AgreementKind.options,
		placeKinds: vocabulary.PlaceKind.options,
		regionKinds: vocabulary.RegionKind.options,
		reviewerLabels: vocabulary.REVIEWER_LABELS,
		sourceLanguages: vocabulary.SOURCE_LANGUAGES
	};
	const dv = deployment as unknown as Record<string, unknown>;
	const dvVocabulary = dv.vocabulary as Record<string, unknown>;
	const declared: Record<string, unknown> = { ...dvVocabulary, reviewerLabels: dv.reviewerLabels, sourceLanguages: dv.sourceLanguages };
	ok(
		'the deployment carries exactly the lists scripts/vocabulary.ts declares',
		Object.entries(lists).every(([name, list]) => isEqualList([...(declared[name] as string[])], [...list])) &&
			isEqualList(Object.keys(dvVocabulary as object).sort(), [...Object.keys(lists).filter((n) => n !== 'reviewerLabels' && n !== 'sourceLanguages'), 'edgeDirection'].sort()) &&
			isEqualList(
				Object.keys(dvVocabulary.edgeDirection as object).sort(),
				[...vocabulary.RelationshipType.options].sort()
			),
		Object.keys(lists).join(', ')
	);

	/** A record of the kind the engine accepts, so a probe differs from it in one field only. */
	const base = (kind: string, where?: (r: Record<string, unknown>) => boolean): Record<string, unknown> | undefined =>
		(raw[kind] as Record<string, unknown>[] | undefined)?.find((r) => engine.schemaOf(kind).safeParse(r).success && (where?.(r) ?? true));
	/** Whether the schema refuses a value at the given field, whatever else it says about the record. */
	const refusesAt = (kind: string, record: Record<string, unknown>, path: string[]): boolean => {
		const r = mod[exportsByKind.get(kind)![0]].safeParse(record);
		return !r.success && r.error.issues.some((i) => path.every((p, n) => i.path[n] === p));
	};
	const cases: { kind: string; field: string; path: string[]; list: readonly string[]; make: (r: Record<string, unknown>, v: string) => Record<string, unknown>; need?: (r: Record<string, unknown>) => boolean }[] = [
		{ kind: 'institution', field: 'institution.type', path: ['type'], list: lists.institutionTypes, make: (r, v) => ({ ...r, type: v }) },
		{ kind: 'institution', field: 'institution.layer', path: ['layer'], list: lists.layers, make: (r, v) => ({ ...r, layer: v }) },
		{ kind: 'person', field: 'person.layers', path: ['layers'], list: lists.layers, make: (r, v) => ({ ...r, layers: [v] }) },
		{ kind: 'relationship', field: 'relationship.type', path: ['type'], list: lists.relationshipTypes, make: (r, v) => ({ ...r, type: v }) },
		{
			kind: 'relationship',
			field: 'relationship.influence.channel',
			path: ['influence', 'channel'],
			list: lists.influenceChannels,
			make: (r, v) => ({ ...r, influence: { ...(r.influence as object), channel: v } }),
			need: (r) => !!r.influence
		},
		{ kind: 'group-layer', field: 'group-layer.layer', path: ['layer'], list: lists.layers, make: (r, v) => ({ ...r, layer: v }) },
		{ kind: 'event', field: 'event.impact.layer', path: ['impact', 'layer'], list: lists.layers, make: (r, v) => ({ ...r, impact: { layer: [v] } }) },
		{ kind: 'agreement', field: 'agreement.kind', path: ['kind'], list: lists.agreementKinds, make: (r, v) => ({ ...r, kind: v }) },
		{ kind: 'place', field: 'place.kind', path: ['kind'], list: lists.placeKinds, make: (r, v) => ({ ...r, kind: v }) },
		{ kind: 'source', field: 'source.lang', path: ['lang'], list: lists.sourceLanguages, make: (r, v) => ({ ...r, lang: v }) }
	];
	const vocabularyFaults: string[] = [];
	for (const c of cases) {
		const record = base(c.kind, c.need);
		if (!record) {
			vocabularyFaults.push(`${c.field}: no shipped record to probe with`);
			continue;
		}
		for (const v of c.list) if (refusesAt(c.kind, c.make(record, v), c.path)) vocabularyFaults.push(`${c.field} refuses its own entry "${v}"`);
		if (!refusesAt(c.kind, c.make(record, 'not-in-the-vocabulary'), c.path)) vocabularyFaults.push(`${c.field} accepts a stranger`);
	}
	ok(
		'every vocabulary entry parses where it is used, and a stranger does not',
		vocabularyFaults.length === 0,
		vocabularyFaults.length ? vocabularyFaults.join('; ') : `${cases.length} fields, ${cases.reduce((n, c) => n + c.list.length, 0)} entries`
	);

	// A complete copy of a list anywhere else in the tree is a second place for
	// it to change. The browser's copies cannot import this module, so each is
	// named here and compared to it; any other complete copy fails.
	const root = join(import.meta.dirname, '..');
	const sourceFiles = (dir: string): string[] =>
		readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
			e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(ts|svelte)$/.test(e.name) && !/^(test-|mutation-)/.test(e.name) ? [join(dir, e.name)] : []
		);
	const copies: string[] = [];
	for (const file of [...sourceFiles('scripts'), ...sourceFiles('src'), ...sourceFiles('community')]) {
		if (file === join('scripts', 'vocabulary.ts')) continue;
		const text = readFileSync(join(root, file), 'utf8');
		for (const m of text.matchAll(/(?:'[^'\n]*'|"[^"\n]*")(?:\s*,\s*(?:\/\/[^\n]*\n\s*)?(?:'[^'\n]*'|"[^"\n]*")){2,}/g)) {
			const entries = [...m[0].matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((x) => x[1] ?? x[2]);
			for (const [name, list] of Object.entries(lists)) {
				if (list.length >= 3 && entries.length === list.length && list.every((e) => entries.includes(e))) copies.push(`${file} (${name})`);
			}
		}
	}
	const mirrored = ['src/lib/taxonomy.ts (layers)', 'src/lib/taxonomy.ts (institutionTypes)', 'src/lib/taxonomy.ts (relationshipTypes)', 'src/lib/viz/groups.ts (layers)', 'src/lib/vocab.ts (layers)'];
	ok(
		'no complete copy of a vocabulary list lives outside scripts/vocabulary.ts, apart from the browser mirrors named here',
		isEqualList([...new Set(copies)].sort(), mirrored.sort()),
		[...new Set(copies)].sort().join(', ')
	);
	/** The strings of the first list literal after a marker in a browser source file. */
	const listAfter = (file: string, marker: string): string[] => {
		const text = readFileSync(join(root, file), 'utf8');
		const at = text.indexOf(marker);
		const open = at < 0 ? -1 : text.indexOf('= [', at);
		const body = open < 0 ? '' : text.slice(open, text.indexOf(']', open));
		return [...body.matchAll(/'([^']*)'/g)].map((m) => m[1]);
	};
	ok(
		'the browser layer lists are the vocabulary, in its order',
		isEqualList(listAfter('src/lib/vocab.ts', 'export const LAYERS'), [...lists.layers]) &&
			isEqualList(listAfter('src/lib/viz/groups.ts', 'const layerOrder'), [...lists.layers]),
		'src/lib/vocab.ts, src/lib/viz/groups.ts'
	);
}

console.log(
	`\n  ${checks - failures}/${checks} engine-conformance checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
