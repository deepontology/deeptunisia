/**
 * audit-probes.mjs — reproduce the independent review's compiler probes.
 *
 * Ported from the reviewer's `reproduce-probes.mjs` (9 September 2026) so the
 * whole audit runs from the repo root with one command:
 *
 *   npm run audit:probes
 *
 * What it does. It builds five deliberately corrupted copies of `data/` in a
 * scratch directory, runs the real compiler against each, and records whether
 * the malformed record was rejected (exit 1, no dataset) or accepted (exit 0).
 * It also resolves the temporal probe `{ start: "2020-01-01", end: "?" }` and
 * records `certainlyActive` / `possiblyActive` one day after the configured
 * cutoff, then writes `output/audit-baseline.json`.
 *
 * It never writes to `data/`, `src/generated/` or `static/`. Every probe build
 * is pointed at throwaway directories through DT_DATA_DIR / DT_OUT_DIR /
 * DT_STATIC_DIR.
 *
 * This is an observation tool, not a gate. Before the Phase 1 contract fixes
 * the probes are expected to pass through (the bypasses are open). After the
 * fixes they are expected to fail closed; the baseline diff is the evidence.
 *
 * Usage:
 *   npm run audit:probes                 # writes output/audit-baseline.json
 *   tsx scripts/audit-probes.mjs --out path/to/baseline.json
 *   tsx scripts/audit-probes.mjs --keep  # keep the scratch builds for inspection
 */

import {
	readFileSync,
	writeFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	existsSync,
	rmSync
} from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// --- args ---------------------------------------------------------------

let outPath = join(ROOT, 'output', 'audit-baseline.json');
let keepScratch = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--out') {
		outPath = isAbsolute(argv[i + 1]) ? argv[i + 1] : join(ROOT, argv[i + 1]);
		i++;
	} else if (argv[i].startsWith('--out=')) {
		const v = argv[i].slice('--out='.length);
		outPath = isAbsolute(v) ? v : join(ROOT, v);
	} else if (argv[i] === '--keep') {
		keepScratch = true;
	} else {
		console.error(`unknown argument: ${argv[i]}`);
		process.exit(2);
	}
}

// --- prerequisites ------------------------------------------------------

const datasetPath = join(ROOT, 'src', 'generated', 'dataset.json');
if (!existsSync(datasetPath)) {
	console.error(
		`missing ${datasetPath}\n  run: npm run data   (then npx svelte-kit sync for the tests)`
	);
	process.exit(1);
}

const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
if (!existsSync(TSX)) {
	console.error(`missing ${TSX}\n  run: npm ci --ignore-scripts`);
	process.exit(1);
}

const require = createRequire(join(ROOT, 'package.json'));
const yaml = require('yaml');

const ds = JSON.parse(readFileSync(datasetPath, 'utf8'));

const schema = await import(pathToFileURL(join(ROOT, 'scripts', 'schema.ts')).href);
const dates = await import(pathToFileURL(join(ROOT, 'scripts', 'dates.ts')).href);

if (ds.meta?.parameters?.time) dates.configureTime(ds.meta.parameters.time);

// --- scratch ------------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), 'dt-audit-'));

// --- probes -------------------------------------------------------------

function update(dir, file, fn) {
	const p = join(dir, file);
	const rows = yaml.parse(readFileSync(p, 'utf8'));
	fn(rows);
	writeFileSync(p, yaml.stringify(rows));
}

function build(name, mutate) {
	const dir = join(scratch, name);
	cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
	mutate(join(dir, 'data'));

	const b = spawnSync(TSX, [join(ROOT, 'scripts', 'build-data.ts')], {
		cwd: ROOT,
		env: {
			...process.env,
			DT_DATA_DIR: join(dir, 'data'),
			DT_OUT_DIR: join(dir, 'generated'),
			DT_STATIC_DIR: join(dir, 'static')
		},
		encoding: 'utf8',
		maxBuffer: 20e6
	});

	const log = (b.stdout || '') + (b.stderr || '');
	writeFileSync(join(dir, 'log.txt'), log);

	const emittedPath = join(dir, 'generated', 'dataset.json');
	const emitted = existsSync(emittedPath);
	let graph;
	if (emitted) {
		try {
			graph = JSON.parse(readFileSync(emittedPath, 'utf8'));
		} catch {
			graph = undefined;
		}
	}

	const errorLines = log
		.split('\n')
		.filter((l) => /error|fail|must|unknown|✗/i.test(l))
		.slice(0, 5)
		.map((l) => l.trim());

	return {
		exit: b.status,
		datasetEmitted: emitted,
		editorialQueueEmitted: existsSync(join(dir, 'static', 'editorial-queue.json')),
		errorLines
	};
}

const positionsFile = join(ROOT, 'data', 'positions.yaml');
const peopleFile = join(ROOT, 'data', 'people.yaml');
const pos0 = yaml.parse(readFileSync(positionsFile, 'utf8'))[0];
const person0 = yaml.parse(readFileSync(peopleFile, 'utf8'))[0];

const whitespace = {
	...pos0,
	confidence: 'C',
	verification: 'needs-primary-source',
	basis: 'inferred',
	attributed_to: ' ',
	reasoning: ' ',
	falsifiable_by: ' '
};
delete whitespace.review;

const override = {
	...pos0,
	confidence: 'C',
	verification: 'needs-primary-source',
	basis: 'documented',
	attributed_to: 'Example claimant'
};
delete override.review;
delete override.reasoning;
delete override.falsifiable_by;

const probes = [
	['whitespace', (dir) => update(dir, 'positions.yaml', (rows) => void (rows[0] = whitespace))],
	[
		'no-source',
		(dir) =>
			update(dir, 'people.yaml', (rows) => {
				rows[0].sources = [];
			})
	],
	['override', (dir) => update(dir, 'positions.yaml', (rows) => void (rows[0] = override))],
	[
		'nested-outcome',
		(dir) =>
			update(dir, 'positions.yaml', (rows) => {
				rows[0].review = {
					by: 'Example reviewer',
					date: '2026-09-09',
					method: 'source-check',
					outcome: 'refuted'
				};
			})
	],
	[
		'bad-reference',
		(dir) =>
			update(dir, 'positions.yaml', (rows) => {
				rows[0].sources = ['audit-nonexistent-source'];
			})
	]
];

const pipeline = {};
for (const [name, fn] of probes) {
	const result = build(name, fn);
	pipeline[name] = result;
}

// --- schema-level probe (no build) --------------------------------------

const nestedReview = schema.ReviewSchema.safeParse({
	by: 'Example reviewer',
	date: '2026-09-09',
	method: 'source-check',
	outcome: 'refuted'
});

const schemaProbes = {
	whitespaceInferenceAccepted: schema.PositionSchema.safeParse(whitespace).success,
	overrideWithoutReviewAccepted: schema.PositionSchema.safeParse(override).success,
	overrideDerivedBasis: schema.deriveBasis('C', 'needs-primary-source', 'documented'),
	unsourcedPersonAccepted: schema.PersonSchema.safeParse({ ...person0, sources: [] }).success,
	nestedReviewOutcomeAccepted: nestedReview.success,
	nestedReviewOutcomePreserved: nestedReview.success && Object.hasOwn(nestedReview.data, 'outcome')
};

// --- temporal probe -----------------------------------------------------

const interval = dates.resolveInterval({ start: '2020-01-01', end: '?' });
const queryDate = ds.meta.cutoff + 86_400_000;
const temporal = {
	interval,
	queryDate: new Date(queryDate).toISOString(),
	certain: dates.certainlyActive(interval, queryDate),
	possible: dates.possiblyActive(interval, queryDate)
};

// --- dataset shape snapshot --------------------------------------------

const unsourced = {};
for (const [kind, rows] of Object.entries(ds)) {
	if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== 'object') continue;
	const missing = rows
		.filter((x) => Object.hasOwn(x, 'sources') && !x.sources?.length)
		.map((x) => x.id);
	if (missing.length) unsourced[kind] = missing;
}

const counted = [
	...(ds.positions ?? []),
	...(ds.relationships ?? []),
	...(ds.events ?? []),
	...(ds.worldClaims ?? [])
];
const countedInferences = counted
	.filter((x) => x.basis === 'inferred')
	.map((x) => ({ id: x.id, attributed: !!x.attributed_to, review: !!x.review }));

// --- baseline -----------------------------------------------------------

function gitHead() {
	const g = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
	return (g.stdout || '').trim() || null;
}

const baseline = {
	schemaVersion: 1,
	generated: new Date().toISOString(),
	node: process.version,
	commit: gitHead(),
	dataset: {
		path: 'src/generated/dataset.json',
		counts: ds.meta?.counts ?? null,
		review: ds.meta?.review ?? null,
		cutoff: ds.meta?.cutoff ?? null
	},
	schemaProbes,
	pipeline,
	temporal,
	unsourced,
	countedInferences,
	note:
		'Synthetic edits are test fixtures, not historical assertions. Before the Phase 1 fixes these probes are expected to be accepted (bypasses open); after the fixes the same probes must fail closed.'
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');

if (!keepScratch) rmSync(scratch, { recursive: true, force: true });

console.log(`\n  audit baseline written: ${outPath}`);
console.log(`  node ${process.version} · commit ${baseline.commit ?? '?'}`);
console.log('  schema probes:');
for (const [k, v] of Object.entries(schemaProbes)) console.log(`    ${k}: ${v}`);
console.log('  pipeline probes:');
for (const [k, v] of Object.entries(pipeline)) {
	console.log(`    ${k}: exit=${v.exit} dataset=${v.datasetEmitted} queue=${v.editorialQueueEmitted}`);
}
console.log(
	`  temporal: certain=${temporal.certain} possible=${temporal.possible} at ${temporal.queryDate}`
);
if (keepScratch) console.log(`  scratch kept: ${scratch}`);
console.log('');
