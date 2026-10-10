/**
 * Study registry build.
 *
 * Separate pipeline, separate product: this script reads `data/studies/`,
 * validates the study manifest and every instrument it references, and writes
 * `src/generated/studies.json`. It never imports `build-data.ts` or `schema.ts`,
 * and the graph build never imports it (asserted in `test-studies.ts`). A
 * missing `data/studies/` directory emits an empty studies list, so the repo
 * builds before Study 001 freezes.
 *
 * Like `build-data.ts`, nothing is written until every check passes, and the
 * write itself is atomic: stage to `studies.json.tmp`, then rename.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
	compileInstrument,
	type RuntimeInstrument
} from '../community/research-contract.ts';
import {
	InstrumentSchema,
	StudyResultsSchema,
	StudySchema,
	validateInstrument,
	validateResults,
	validateStudyLifecycle,
	type InstrumentVersion,
	type Study,
	type StudyResults
} from './research-schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STUDIES_FILE = join(ROOT, 'data', 'studies', 'studies.yaml');
const OUT_FILE = join(ROOT, 'src', 'generated', 'studies.json');
const TMP_FILE = `${OUT_FILE}.tmp`;
const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Error collection: report every problem at once rather than one per run.
// ---------------------------------------------------------------------------

const errors: string[] = [];
function fail(where: string, message: string) {
	errors.push(`${where}: ${message}`);
}

/**
 * Compiled runtime instruments, keyed `${id}@${version}`. The API reads this map
 * from src/generated/studies.json; an instrument that fails its checks never
 * reaches it because nothing is written when `errors` is non-empty.
 */
const instruments = new Map<string, RuntimeInstrument>();

// ---------------------------------------------------------------------------
// Registry load
// ---------------------------------------------------------------------------

const registry: Study[] = [];
if (!existsSync(STUDIES_FILE)) {
	console.log('  data/studies/studies.yaml not found — emitting an empty studies list');
} else {
	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(STUDIES_FILE, 'utf8'));
	} catch (e) {
		fail('data/studies/studies.yaml', `YAML parse error: ${(e as Error).message}`);
	}
	// A file of nothing but comments parses to `null`: that is zero studies.
	if (raw !== null && raw !== undefined) {
		if (!Array.isArray(raw)) {
			fail('data/studies/studies.yaml', 'expected a top-level YAML list');
		} else {
			raw.forEach((entry, index) => {
				const label =
					entry && typeof entry === 'object' && 'id' in entry
						? String((entry as { id: unknown }).id)
						: `index ${index}`;
				const result = StudySchema.safeParse(entry);
				if (!result.success) {
					for (const issue of result.error.issues) {
						const path = issue.path.length ? issue.path.join('.') : '(root)';
						fail(`data/studies/studies.yaml [${label}]`, `${path} — ${issue.message}`);
					}
					return;
				}
				registry.push(result.data);
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Study-level gates and instrument sources
// ---------------------------------------------------------------------------

function resolveInstrumentPath(source: string): string {
	return isAbsolute(source) ? source : join(ROOT, source);
}

/**
 * Read the instrument at the registry's `source` and hold it to the instrument
 * rules. `validateInstrument` owns the cross-field checks; the hash comparison
 * covers the freeze: a declared hash that does not match the content is a lie
 * whether or not the instrument is marked frozen, and a frozen version may not
 * omit one.
 */
function checkInstrument(study: Study, instrument: InstrumentVersion): void {
	const where = `data/studies/studies.yaml [${study.id}] instrument ${instrument.source}`;
	const path = resolveInstrumentPath(instrument.source);
	if (!existsSync(path)) {
		fail(where, 'instrument source not found');
		return;
	}

	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(path, 'utf8'));
	} catch (e) {
		fail(where, `YAML parse error: ${(e as Error).message}`);
		return;
	}

	const parsed = InstrumentSchema.safeParse(raw);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const p = issue.path.length ? issue.path.join('.') : '(root)';
			fail(where, `${p} — ${issue.message}`);
		}
		return;
	}
	const doc = parsed.data;

	for (const violation of validateInstrument(doc)) fail(where, violation);

	const compiled = compileInstrument(doc);
	const key = `${compiled.id}@${compiled.version}`;

	// The registry entry and the document must agree on what is keyed where: the
	// API looks instruments up by the registry's id@version, so a mismatch would
	// emit a key nothing can reach.
	if (instrument.id !== compiled.id || instrument.version !== compiled.version) {
		fail(
			where,
			`instrument_version declares ${instrument.id}@${instrument.version} but the document is ${compiled.id}@${compiled.version}`
		);
	}

	const frozen = instrument.frozen || doc.instrument.frozen;
	if (frozen && !instrument.hash) {
		fail(where, 'frozen instrument_version declares no content hash');
	}
	// A declared hash that does not match the content is a lie whether it sits in
	// the registry or in the instrument document.
	if (instrument.hash && instrument.hash !== compiled.hash) {
		fail(
			where,
			`declared content hash ${instrument.hash} does not match the instrument's computed hash ${compiled.hash}`
		);
	}
	if (doc.instrument.content_hash && doc.instrument.content_hash !== compiled.hash) {
		fail(
			where,
			`instrument content_hash ${doc.instrument.content_hash} does not match the computed hash ${compiled.hash}`
		);
	}

	const existing = instruments.get(key);
	if (existing && existing.hash !== compiled.hash) {
		fail(where, `instrument ${key} is already emitted with a different content hash`);
		return;
	}
	instruments.set(key, compiled);
}

{
	const seenIds = new Set<string>();
	const seenSlugs = new Set<string>();
	for (const study of registry) {
		const where = `data/studies/studies.yaml [${study.id}]`;
		if (seenIds.has(study.id)) fail(where, `duplicate study id "${study.id}"`);
		seenIds.add(study.id);
		if (seenSlugs.has(study.slug)) fail(where, `duplicate study slug "${study.slug}"`);
		seenSlugs.add(study.slug);

		for (const violation of validateStudyLifecycle(study)) fail(where, violation);
		for (const instrument of study.instrument_versions) checkInstrument(study, instrument);
	}
}

// ---------------------------------------------------------------------------
// Released aggregates. A results file beside the study is optional; when it
// exists it is published data and gets the same collected-failure treatment as
// the instruments. The build never computes it: scripts/studies-aggregate.ts
// does, from the working CSV, and commits the output.
// ---------------------------------------------------------------------------

const resultsByStudy = new Map<string, StudyResults>();
for (const study of registry) {
	const path = join(ROOT, 'data', 'studies', study.id, 'results.yaml');
	if (!existsSync(path)) continue;
	const where = `data/studies/${study.id}/results.yaml`;
	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(path, 'utf8'));
	} catch (e) {
		fail(where, `YAML parse error: ${(e as Error).message}`);
		continue;
	}
	const parsed = StudyResultsSchema.safeParse(raw);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const p = issue.path.length ? issue.path.join('.') : '(root)';
			fail(where, `${p} — ${issue.message}`);
		}
		continue;
	}
	for (const violation of validateResults(parsed.data)) fail(where, violation);
	resultsByStudy.set(study.id, parsed.data);
}

// ---------------------------------------------------------------------------
// Emit. Validation first; the file is staged and renamed, so a reader never
// sees a partial write and a failed build leaves the previous one in place.
// ---------------------------------------------------------------------------

if (errors.length > 0) {
	console.error(`\n  STUDIES VALIDATION FAILED — ${errors.length} error(s)\n`);
	for (const e of errors) console.error(`   x  ${e}`);
	console.error('');
	process.exit(1);
}

const payload = {
	meta: {
		generated: new Date().toISOString(),
		count: registry.length,
		schemaVersion: SCHEMA_VERSION
	},
	// A study with a validated results.yaml carries it; the rest stay as they
	// are parsed from the registry.
	studies: registry.map((study) => {
		const results = resultsByStudy.get(study.id);
		return results ? { ...study, results } : study;
	}),
	// Keyed `${id}@${version}`; the API reads these, the graph build never does.
	instruments: Object.fromEntries(instruments)
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(TMP_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
renameSync(TMP_FILE, OUT_FILE);

console.log(
	`  studies.json written — ${payload.meta.count} stud${payload.meta.count === 1 ? 'y' : 'ies'}, ${instruments.size} instrument${instruments.size === 1 ? '' : 's'}`
);
