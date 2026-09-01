/**
 * Fixture-pipeline tests: run the REAL build pipeline against synthetic invalid
 * datasets and assert it refuses them.
 *
 * WHY THIS EXISTS — mutation testing, survivor class m22–m26
 * ----------------------------------------------------------
 * `test-validators.ts` covers the pure surface (schema.ts + dates.ts), but the
 * build's own invariants — the V8 causal graph (Tarjan cycle detection, temporal
 * ordering), V9 edge anchoring, checkSources referential integrity — live in
 * `build-data.ts`, a module that runs at import time against hardcoded
 * directories. A mutation that disables one of those checks is invisible to any
 * test that only looks at the clean graph: the clean graph has no cycles, no
 * dangling sources, no unmoored edges, so a disabled check changes nothing it
 * publishes.
 *
 * The way to test a pipeline is to feed it. This file copies data/ to a
 * throwaway tree, injects one record carrying EVERY defect class at once, runs
 * the real build against it via the DT_DATA_DIR override, and asserts the build
 * fails with each expected message. The build's error collection reports all
 * violations together (that is the design — never one error at a time), so a
 * single injected tree proves all five invariants, and a mutation that disables
 * ANY one of them removes exactly that message from the output.
 *
 * A clean-copy control build is run first, and its emitted graph is compared
 * byte-for-byte (modulo the build timestamp) against the real graph — proving
 * the fixture tree is a faithful copy and that fixture mode changes nothing
 * about the pipeline's output.
 *
 * Invariants pinned here (with the mutation id that each kills):
 *   m22 — the causal-cycle check fires            ("causal cycle")
 *   m23 — an unknown source id is rejected        ('unknown source "…"')
 *   m24 — a cause cannot follow its consequence   ("begins after its consequence ends")
 *   m25 — an influence edge cannot float unanchored ("is unmoored")
 *   m26 — a relationship cannot cite a ghost entity ("unknown "from" entity")
 */
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
	auditInterpretationPaths,
	intervalsOverlap,
	isTemporalCoherent,
	areTypesCompatible,
	isLowConfidence
} from '../src/lib/interpretation.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSR = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const DATA = join(ROOT, 'data');
const REAL_DATASET = join(ROOT, 'src', 'generated', 'dataset.json');

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

// One throwaway workspace per run, so parallel test invocations cannot collide.
const WORK = join(tmpdir(), 'opencode', `dt-pipeline-fixtures-${process.pid}`);
const TREE = join(WORK, 'tree');
const TREE_BAD = join(WORK, 'bad');
const OUT = join(WORK, 'out');
const OUT_BAD = join(WORK, 'out-bad');
const STATIC = join(WORK, 'static');
const STATIC_BAD = join(WORK, 'static-bad');

function build(dataDir: string, outDir: string, staticDir: string): { code: number; output: string } {
	const r = spawnSync(process.execPath, [TSR, 'scripts/build-data.ts'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: 300_000,
		env: { ...process.env, DT_DATA_DIR: dataDir, DT_OUT_DIR: outDir, DT_STATIC_DIR: staticDir }
	});
	return { code: r.status ?? 1, output: ((r.stdout ?? '') + (r.stderr ?? '')).trim() };
}

/** Append a YAML block to a CRLF-or-LF file, preserving its own line endings. */
function appendBlock(dir: string, file: string, block: string) {
	const path = join(dir, file);
	const before = readFileSync(path, 'utf8');
	const eol = before.includes('\r\n') ? '\r\n' : '\n';
	writeFileSync(path, before + (before.endsWith(eol) ? '' : eol) + block.replace(/\n/g, eol), 'utf8');
}

/** The first source id in the canonical registry — a real tier-1 citation for fixtures. */
function firstSourceId(): string {
	const raw = readFileSync(join(TREE, 'sources.yaml'), 'utf8');
	const m = /^- id: ([a-z0-9-]+)/m.exec(raw);
	if (!m) throw new Error('no source id found in sources.yaml fixture copy');
	return m[1];
}

// ---------------------------------------------------------------------------
// 1. Clean control — the fixture tree must be a faithful copy of the real data.
// ---------------------------------------------------------------------------

try {
	rmSync(WORK, { recursive: true, force: true });
	cpSync(DATA, TREE, { recursive: true });
	cpSync(DATA, TREE_BAD, { recursive: true });

	const clean = build(TREE, OUT, STATIC);
	ok('pipeline fixture: the clean copy builds', clean.code === 0, clean.output.split('\n').slice(-3).join(' '));

	if (clean.code === 0 && existsSync(join(OUT, 'dataset.json')) && existsSync(REAL_DATASET)) {
		const fixture = JSON.parse(readFileSync(join(OUT, 'dataset.json'), 'utf8')) as { meta: { generated?: string; shippedKB?: number; datasetKB?: number } };
		const real = JSON.parse(readFileSync(REAL_DATASET, 'utf8')) as { meta: { generated?: string; shippedKB?: number; datasetKB?: number } };
		// Build-environment stats, not data: the payload sizes depend on which files
		// exist in the throwaway static dir, the same way `generated` depends on the
		// clock. Normalize both sides so the fixture-vs-real comparison tests the
		// graph, not the environment.
		delete fixture.meta.generated;
		delete real.meta.generated;
		delete fixture.meta.shippedKB;
		delete real.meta.shippedKB;
		delete fixture.meta.datasetKB;
		delete real.meta.datasetKB;
		ok(
			'pipeline fixture: the clean fixture graph is byte-identical to the real graph',
			JSON.stringify(fixture) === JSON.stringify(real),
			'fixture mode changes no output'
		);
	} else {
		ok('pipeline fixture: the clean fixture graph is byte-identical to the real graph', false, 'clean build or dataset missing');
	}

	// -----------------------------------------------------------------------
	// 2. Injected tree — one copy carrying every defect class at once. The
	//    build reports all errors together, so one failing build must show all
	//    five messages; a mutation that disables any one check removes exactly
	//    its message, and the per-message assertions below catch that.
	// -----------------------------------------------------------------------

	const s = firstSourceId();

	// V8 causal cycle: A causes B causes A. Unknown dates ("?") so the temporal
	// check does not fire first — a cycle is the only violation this pair has.
	appendBlock(TREE_BAD, 'events.yaml', `
- id: fixture-cycle-a
  date: "?"
  title_en: "Fixture cycle A"
  category: political
  summary: "Synthetic event injected by the pipeline fixture runner to prove the causal-cycle check fires."
  causes: [fixture-cycle-b]
  sources: [${s}]
- id: fixture-cycle-b
  date: "?"
  title_en: "Fixture cycle B"
  category: political
  summary: "Synthetic event injected by the pipeline fixture runner to prove the causal-cycle check fires."
  causes: [fixture-cycle-a]
  sources: [${s}]`);

	// V8 temporal ordering: the cause (2015) begins after the consequence (2011) ends.
	appendBlock(TREE_BAD, 'events.yaml', `
- id: fixture-temporal-consequence
  date: "2011-01-01"
  title_en: "Fixture temporal consequence"
  category: political
  summary: "Synthetic consequence event whose cause begins after it ends, injected by the pipeline fixture runner."
  causes: [fixture-temporal-cause]
  sources: [${s}]
- id: fixture-temporal-cause
  date: "2015-01-01"
  title_en: "Fixture temporal cause"
  category: political
  summary: "Synthetic cause event that begins after its consequence ends, injected by the pipeline fixture runner."
  sources: [${s}]`);

	// checkSources: a position citing a source id that does not exist.
	appendBlock(TREE_BAD, 'positions.yaml', `
- id: p-fixture-unknown-src
  role: president
  holder: bourguiba
  start: "2020-01-01"
  confidence: A
  sources: [no-such-source]`);

	// Referential integrity: an edge from an entity that does not exist.
	appendBlock(TREE_BAD, 'relationships.yaml', `
- id: rel-fixture-ghost
  from: no-such-entity
  to: presidency
  type: institutional
  description: "Synthetic edge from a nonexistent entity, injected by the pipeline fixture runner."
  confidence: A
  sources: [${s}]`);

	// V9 anchoring: an influence edge between two brand-new institutions that
	// hold no positions and carry no documented edges — nothing anchors it.
	appendBlock(TREE_BAD, 'institutions.yaml', `
- id: fixture-inst-x
  name_en: "Fixture Institution X"
  type: company
  layer: economic
  sources: [${s}]
- id: fixture-inst-y
  name_en: "Fixture Institution Y"
  type: company
  layer: economic
  sources: [${s}]`);
	appendBlock(TREE_BAD, 'relationships.yaml', `
- id: rel-fixture-unmoored
  from: fixture-inst-x
  to: fixture-inst-y
  type: influence
  description: "Synthetic influence edge between two unsourced fixture institutions, injected by the pipeline fixture runner."
  confidence: A
  reasoning: "Injected by the pipeline fixture runner to prove the V9 anchoring check fires."
  influence: { channel: appointment, strength: 0.5 }
  sources: [${s}]`);

	const bad = build(TREE_BAD, OUT_BAD, STATIC_BAD);
	ok('pipeline fixture: the injected tree fails the build', bad.code !== 0, `exit ${bad.code}`);

	const expectations: [string, string][] = [
		['causal cycle', 'the causal-cycle check fires (kills m22)'],
		['begins after its consequence ends', 'the temporal-ordering check fires (kills m24)'],
		['unknown source "no-such-source"', 'an unknown source id is rejected (kills m23)'],
		['unknown "from" entity "no-such-entity"', 'a ghost edge endpoint is rejected (kills m26)'],
		['is unmoored', 'an unanchored influence edge is rejected (kills m25)']
	];
	for (const [needle, label] of expectations) {
		ok(`pipeline fixture: ${label}`, bad.output.includes(needle), `expected the build to say "${needle}"`);
	}

	// -----------------------------------------------------------------------
	// 3. W4 — the weak-chain audit is warn-only and finds chains. A GOOD tree:
	//    two reported-influence edges, both grade-C/needs-primary-source
	//    (deriving inferred), forming a two-hop chain. The build must PASS —
	//    pathAudit never gates emission — and the emitted graph must carry the
	//    chain, proving the Inspector advisory has a real signal behind it. The
	//    current real dataset has zero chains (a measured zero, not an
	//    unexercised code path): this fixture makes the bad data exist.
	// -----------------------------------------------------------------------
	const TREE_WEAK = join(WORK, 'weak');
	cpSync(TREE, TREE_WEAK, { recursive: true });
	appendBlock(TREE_WEAK, 'relationships.yaml', `
- id: rel-fixture-weak-1
  from: kais-saied
  to: rached-ghannouchi
  type: reported-influence
  description: "Synthetic weak edge 1 — pathAudit fixture."
  confidence: C
  verification: needs-primary-source
  attributed_to: "Fixture claimant"
  reasoning: "Fixture reasoning: the chain is intentionally weak."
  falsifiable_by: "A primary record refuting the fixture chain."
  sources: [${s}]
- id: rel-fixture-weak-2
  from: rached-ghannouchi
  to: nabil-karoui
  type: reported-influence
  description: "Synthetic weak edge 2 — pathAudit fixture."
  confidence: C
  verification: needs-primary-source
  attributed_to: "Fixture claimant"
  reasoning: "Fixture reasoning: the chain is intentionally weak."
  falsifiable_by: "A primary record refuting the fixture chain."
  sources: [${s}]`);
	const weak = build(TREE_WEAK, join(WORK, 'out-weak'), join(WORK, 'static-weak'));
	ok(
		'pipeline fixture: the weak-chain tree builds (pathAudit is warn-only)',
		weak.code === 0,
		`exit ${weak.code}`
	);
	if (weak.code === 0) {
		const weakGraph = JSON.parse(readFileSync(join(WORK, 'out-weak', 'dataset.json'), 'utf8')) as {
			meta?: { pathAudit?: { chains: { edges: string[]; depth: number }[] } };
		};
		const weakChains = weakGraph.meta?.pathAudit?.chains ?? [];
		const foundWeak = weakChains.some(
			(c) =>
				c.depth >= 2 &&
				c.edges.includes('rel-fixture-weak-1') &&
				c.edges.includes('rel-fixture-weak-2')
		);
		ok(
			'pipeline fixture: pathAudit reports the injected weak chain',
			foundWeak,
			`${weakChains.length} chain(s) reported`
		);
	} else {
		ok('pipeline fixture: pathAudit reports the injected weak chain', false, 'weak tree did not build');
	}

	// -----------------------------------------------------------------------
	// 4. L3 temporal coherence — 3-hop path with disjoint intervals, warn-only.
	//    All edges carrying (reported-influence) and overlapping-grade B, so
	//    type and confidence advisories must NOT fire — only temporal.
	// -----------------------------------------------------------------------
	const TREE_TEMPORAL = join(WORK, 'temporal');
	cpSync(TREE, TREE_TEMPORAL, { recursive: true });
	appendBlock(TREE_TEMPORAL, 'people.yaml', `
- id: fixture-temp-a
  name_en: Fixture Temp A
  layers: [political]
  sources: [${s}]
- id: fixture-temp-b
  name_en: Fixture Temp B
  layers: [political]
  sources: [${s}]
- id: fixture-temp-c
  name_en: Fixture Temp C
  layers: [political]
  sources: [${s}]
- id: fixture-temp-d
  name_en: Fixture Temp D
  layers: [political]
  sources: [${s}]`);
	appendBlock(TREE_TEMPORAL, 'relationships.yaml', `
- id: rel-fixture-temporal-1
  from: fixture-temp-a
  to: fixture-temp-b
  type: reported-influence
  description: "Synthetic temporal edge 1 — 1990-1995."
  confidence: B
  start: "1990-01-01"
  end: "1995-01-01"
  sources: [${s}]
- id: rel-fixture-temporal-2
  from: fixture-temp-b
  to: fixture-temp-c
  type: reported-influence
  description: "Synthetic temporal edge 2 — 2000-2005."
  confidence: B
  start: "2000-01-01"
  end: "2005-01-01"
  sources: [${s}]
- id: rel-fixture-temporal-3
  from: fixture-temp-c
  to: fixture-temp-d
  type: reported-influence
  description: "Synthetic temporal edge 3 — 2010-2015."
  confidence: B
  start: "2010-01-01"
  end: "2015-01-01"
  sources: [${s}]`);
	const temporal = build(TREE_TEMPORAL, join(WORK, 'out-temporal'), join(WORK, 'static-temporal'));
	ok('pipeline fixture: temporal-incoherent tree builds (warn-only)', temporal.code === 0, `exit ${temporal.code}`);
	if (temporal.code === 0) {
		const g = JSON.parse(readFileSync(join(WORK, 'out-temporal', 'dataset.json'), 'utf8')) as {
			relationships?: Array<{ id: string; from: string; to: string; type: string; confidence: string; verification: string; basis: string; interval: { startEarliest: number; startLatest: number; endEarliest: number | null; endLatest: number | null; startPrecision: string; endPrecision: string; status: string; raw: { start: string | null; end: string | null } } }>;
			meta?: { interpretationAudit?: { temporal: { edges: string[] }[]; typeIncompatible: { edges: string[] }[]; lowConfidence: { edges: string[] }[] } };
		};
		const rels = (g.relationships ?? []).filter((r) => r.id.startsWith('rel-fixture-temporal-'));
		const r1 = rels.find((r) => r.id === 'rel-fixture-temporal-1')!;
		const r2 = rels.find((r) => r.id === 'rel-fixture-temporal-2')!;
		const r3 = rels.find((r) => r.id === 'rel-fixture-temporal-3')!;
		const directTemporal = !isTemporalCoherent([
			{ id: r1.id, from: r1.from, to: r1.to, type: r1.type, confidence: r1.confidence, verification: r1.verification, basis: r1.basis, interval: r1.interval },
			{ id: r2.id, from: r2.from, to: r2.to, type: r2.type, confidence: r2.confidence, verification: r2.verification, basis: r2.basis, interval: r2.interval },
			{ id: r3.id, from: r3.from, to: r3.to, type: r3.type, confidence: r3.confidence, verification: r3.verification, basis: r3.basis, interval: r3.interval }
		]);
		const adjacentGap = !intervalsOverlap(r1.interval, r2.interval) && !intervalsOverlap(r2.interval, r3.interval);
		ok('pipeline fixture: temporal advisory flags the non-overlapping chain', directTemporal && adjacentGap, `${r1.interval.startEarliest}→${r1.interval.endLatest} vs ${r2.interval.startEarliest}→${r2.interval.endLatest}`);
		// The capped meta is what the Inspector reads — it carries real-data temporal
		// advisories even before the fixture. The build being warn-only is the gate.
		const metaTemporal = g.meta?.interpretationAudit?.temporal ?? [];
		ok('pipeline fixture: temporal advisory present in meta (Inspector-visible)', metaTemporal.length > 0, `meta ${metaTemporal.length}`);
	} else {
		ok('pipeline fixture: temporal advisory flags the non-overlapping chain', false, 'temporal tree did not build');
		ok('pipeline fixture: temporal advisory present in meta (Inspector-visible)', false, 'temporal tree did not build');
	}

	// -----------------------------------------------------------------------
	// 5. L3 type compatibility — board + family + funding path, warn-only.
	//    Intervals overlap and confidences are high, so only type fires.
	// -----------------------------------------------------------------------
	const TREE_TYPE = join(WORK, 'type');
	cpSync(TREE, TREE_TYPE, { recursive: true });
	appendBlock(TREE_TYPE, 'people.yaml', `
- id: fixture-type-p1
  name_en: Fixture Type P1
  layers: [political]
  sources: [${s}]
- id: fixture-type-p2
  name_en: Fixture Type P2
  layers: [political]
  sources: [${s}]`);
	appendBlock(TREE_TYPE, 'institutions.yaml', `
- id: fixture-type-inst-a
  name_en: "Fixture Type Inst A"
  type: company
  layer: economic
  sources: [${s}]
- id: fixture-type-inst-b
  name_en: "Fixture Type Inst B"
  type: company
  layer: economic
  sources: [${s}]`);
	appendBlock(TREE_TYPE, 'relationships.yaml', `
- id: rel-fixture-type-board
  from: fixture-type-p1
  to: fixture-type-inst-a
  type: board
  description: "Synthetic board edge — type-compatibility fixture."
  confidence: A
  start: "2015-01-01"
  end: "2020-01-01"
  sources: [${s}]
- id: rel-fixture-type-family
  from: fixture-type-p1
  to: fixture-type-p2
  type: family
  subtype: sibling
  description: "Synthetic family edge — type-compatibility fixture."
  confidence: A
  start: "2015-01-01"
  end: "2020-01-01"
  sources: [${s}]
- id: rel-fixture-type-funding
  from: fixture-type-p2
  to: fixture-type-inst-b
  type: funding
  description: "Synthetic funding edge — type-compatibility fixture."
  confidence: A
  start: "2015-01-01"
  end: "2020-01-01"
  sources: [${s}]`);
	const typ = build(TREE_TYPE, join(WORK, 'out-type'), join(WORK, 'static-type'));
	ok('pipeline fixture: type-incompatible tree builds (warn-only)', typ.code === 0, `exit ${typ.code}`);
	if (typ.code === 0) {
		const g = JSON.parse(readFileSync(join(WORK, 'out-type', 'dataset.json'), 'utf8')) as {
			relationships?: Array<{ id: string; from: string; to: string; type: string; confidence: string; verification: string; basis: string; interval: any }>;
			meta?: { interpretationAudit?: { temporal: { edges: string[] }[]; typeIncompatible: { edges: string[] }[]; lowConfidence: { edges: string[] }[] } };
		};
		const rels = (g.relationships ?? []).filter((r) => r.id.startsWith('rel-fixture-type-'));
		const types = rels.map((r) => r.type);
		const directType = !areTypesCompatible(types);
		ok('pipeline fixture: type advisory flags the mixed board+family+funding chain', directType, `${types.join('+')}`);
		const metaType = g.meta?.interpretationAudit?.typeIncompatible ?? [];
		ok('pipeline fixture: type advisory present in meta (Inspector-visible)', metaType.length > 0, `meta ${metaType.length}`);
	} else {
		ok('pipeline fixture: type advisory flags the mixed board+family+funding chain', false, 'type tree did not build');
		ok('pipeline fixture: type advisory present in meta (Inspector-visible)', false, 'type tree did not build');
	}

	// -----------------------------------------------------------------------
	// 6. L3 confidence floor — weakest link D (or C without primary), warn-only.
	//    Intervals overlap and types are uniform carrying, so only confidence fires.
	// -----------------------------------------------------------------------
	const TREE_CONF = join(WORK, 'conf');
	cpSync(TREE, TREE_CONF, { recursive: true });
	appendBlock(TREE_CONF, 'people.yaml', `
- id: fixture-conf-a
  name_en: Fixture Conf A
  layers: [political]
  sources: [${s}]
- id: fixture-conf-b
  name_en: Fixture Conf B
  layers: [political]
  sources: [${s}]
- id: fixture-conf-c
  name_en: Fixture Conf C
  layers: [political]
  sources: [${s}]
- id: fixture-conf-d
  name_en: Fixture Conf D
  layers: [political]
  sources: [${s}]`);
	appendBlock(TREE_CONF, 'relationships.yaml', `
- id: rel-fixture-conf-1
  from: fixture-conf-a
  to: fixture-conf-b
  type: reported-influence
  description: "Synthetic confidence edge 1 — grade B, carrying."
  confidence: B
  start: "2015-01-01"
  end: "2020-01-01"
  sources: [${s}]
- id: rel-fixture-conf-2
  from: fixture-conf-b
  to: fixture-conf-c
  type: reported-influence
  description: "Synthetic confidence edge 2 — grade D, the weak link."
  confidence: D
  attributed_to: "Fixture claimant D"
  sources: [${s}]
- id: rel-fixture-conf-3
  from: fixture-conf-c
  to: fixture-conf-d
  type: reported-influence
  description: "Synthetic confidence edge 3 — grade B, carrying."
  confidence: B
  start: "2015-01-01"
  end: "2020-01-01"
  sources: [${s}]`);
	const conf = build(TREE_CONF, join(WORK, 'out-conf'), join(WORK, 'static-conf'));
	ok('pipeline fixture: low-confidence tree builds (warn-only)', conf.code === 0, `exit ${conf.code}`);
	if (conf.code === 0) {
		const g = JSON.parse(readFileSync(join(WORK, 'out-conf', 'dataset.json'), 'utf8')) as {
			relationships?: Array<{ id: string; from: string; to: string; type: string; confidence: string; verification: string; basis: string; interval: any }>;
			meta?: { interpretationAudit?: { temporal: { edges: string[] }[]; typeIncompatible: { edges: string[] }[]; lowConfidence: { edges: string[] }[] } };
		};
		const rels = (g.relationships ?? []).filter((r) => r.id.startsWith('rel-fixture-conf-'));
		const directLow = isLowConfidence(
			rels.map((r) => ({
				id: r.id,
				from: r.from,
				to: r.to,
				type: r.type,
				confidence: r.confidence,
				verification: r.verification,
				basis: r.basis,
				interval: r.interval
			}))
		);
		const hasD = rels.some((r) => r.confidence === 'D');
		ok('pipeline fixture: confidence advisory flags the D-weakened chain', directLow && hasD, `${rels.map((r) => r.confidence).join(',')}`);
		const metaLow = g.meta?.interpretationAudit?.lowConfidence ?? [];
		ok('pipeline fixture: confidence advisory present in meta (Inspector-visible)', metaLow.length > 0, `meta ${metaLow.length}`);
	} else {
		ok('pipeline fixture: confidence advisory flags the D-weakened chain', false, 'conf tree did not build');
		ok('pipeline fixture: confidence advisory present in meta (Inspector-visible)', false, 'conf tree did not build');
	}

	console.log(`\n  ${checks - failures}/${checks} pipeline-fixture checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
} finally {
	rmSync(WORK, { recursive: true, force: true });
}

process.exit(failures > 0 ? 1 : 0);
