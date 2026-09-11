/**
 * Mutation-testing harness for the validator layer.
 *
 * WHY THIS EXISTS
 * ---------------
 * The first mutation pass (3/12 killed, 25%) was done by hand: someone edited a
 * validator, ran the suite, reverted. The findings died with the session. This
 * makes that loop a repeatable tool: apply one mutation to a source file, run
 * the build and the test suites against it, restore the file, and classify what
 * survived and why.
 *
 * Targets are the files DeepTunisia owns (scripts/schema.ts,
 * scripts/build-data.ts, scripts/canonical.ts) and the pinned engine the time
 * predicates live in (node_modules/deepepisteme/src/time.ts). Mutating the
 * engine copy is deliberate: it simulates a bad engine bump, which is the
 * failure mode the pinned dependency and the conformance suite exist to catch.
 *
 * CLASSIFICATION
 * --------------
 *   killed          the build failed at the validation gate, or a test suite
 *                   failed while the mutation was in place
 *   survived-latent the mutation changed nothing observable: build and tests
 *                   all pass and the emitted graph is unchanged. The invariant
 *                   it weakened is invisible on the current dataset.
 *   survived-drift  build and tests pass BUT the emitted graph changed. This is
 *                   the dangerous class: a validator change silently rewrites
 *                   published data with nothing objecting (the V18-3 story —
 *                   a reclassification of 138 positions no assertion noticed).
 *   invalid-mutant  the pattern is absent, or the build broke for a reason
 *                   unrelated to the invariant (a transform or runtime error,
 *                   not a validation failure). Invalid mutants are not kills.
 *
 * Usage:
 *   npm run mutation                  full run, writes output/mutation-report.json
 *   npm run mutation -- --check       pattern self-check only (no builds)
 *   npm run mutation -- --only=m04,m10   run a subset
 *   npm run mutation -- --list           list mutations without running
 *   npm run mutation -- --no-validators  simulate the pre-synthetic-fixture
 *                                        suite (no test-validators.ts, no
 *                                        test-pipeline.ts, no conformance), to
 *                                        see what the added fixtures are worth
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSR = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const DATASET = join(ROOT, 'src', 'generated', 'dataset.json');
const S = (f: string) => join(HERE, f);
const ENGINE_TIME = '../node_modules/deepepisteme/src/time.ts';

const hash = (p: string) => {
	if (!existsSync(p)) return 'missing';
	const raw = readFileSync(p, 'utf8');
	// meta.generated is a build timestamp — it differs on EVERY build, so hashing
	// it raw would classify every mutation as silent drift. Exclude it.
	try {
		const parsed = JSON.parse(raw) as { meta?: { generated?: string } };
		if (parsed && typeof parsed === 'object' && parsed.meta) {
			const { generated: _drop, ...meta } = parsed.meta;
			return createHash('sha1').update(JSON.stringify({ ...parsed, meta })).digest('hex').slice(0, 12);
		}
	} catch {
		/* not JSON — hash raw */
	}
	return createHash('sha1').update(raw).digest('hex').slice(0, 12);
};

interface Mutation {
	id: string;
	/** Relative to scripts/; `../node_modules/...` reaches the pinned engine. */
	file: string;
	label: string;
	from: string;
	to: string;
	/** What should catch it — written before running, so the report is honest. */
	expect: string;
	/** Known survivor: the invariant cannot be exercised from the pure surface. */
	known?: string;
}

const MUTATIONS: Mutation[] = [
	// --- schema.ts: deriveBasis -------------------------------------------------
	{
		id: 'm01', file: 'schema.ts', expect: 'test-data deriveBasis truth table (rows 14-15)',
		label: 'deriveBasis ignores the explicit override',
		from: 'if (explicit) return explicit;',
		to: "if (explicit) return 'reported';"
	},
	{
		id: 'm02', file: 'schema.ts', expect: 'test-data deriveBasis truth table (row C/nps)',
		label: 'C + needs-primary-source no longer derives inferred',
		from: "if (confidence === 'C' && verification === 'needs-primary-source') return 'inferred';",
		to: "if (false && confidence === 'C' && verification === 'needs-primary-source') return 'inferred';"
	},
	{
		id: 'm03', file: 'schema.ts', expect: 'test-data deriveBasis truth table (D rows)',
		label: 'grade D no longer derives unsubstantiated',
		from: "if (confidence === 'D') return 'unsubstantiated';",
		to: "if (false && confidence === 'D') return 'unsubstantiated';"
	},
	// --- schema.ts: the claim envelope (V18/V20, now nonBlank) -------------------
	{
		id: 'm04', file: 'schema.ts', expect: 'test-validators V20 (C/D attribution)',
		label: 'envelope stops requiring attributed_to on C/D',
		from: "(r: any) => !((r.confidence === 'C' || r.confidence === 'D') && !nonBlank(r.attributed_to))",
		to: '(r: any) => true'
	},
	{
		id: 'm05', file: 'schema.ts', expect: 'test-validators V18 (inferred completeness)',
		label: 'envelope stops requiring reasoning/falsifier on inferred',
		from: "\t\t\t(r: any) => {\n\t\t\t\tconst derived = deriveBasis(r.confidence, r.verification, r.basis);\n\t\t\t\treturn !(derived === 'inferred' && (!nonBlank(r.reasoning) || !nonBlank(r.falsifiable_by)));\n\t\t\t}",
		to: '(r: any) => true'
	},
	{
		id: 'm06', file: 'schema.ts', expect: 'test-validators V18 (explicit unsubstantiated)',
		label: 'envelope stops requiring attribution on unsubstantiated',
		from: "(r: any) =>\n\t\t\t\t!(deriveBasis(r.confidence, r.verification, r.basis) === 'unsubstantiated' &&\n\t\t\t\t\t!nonBlank(r.attributed_to)),",
		to: '(r: any) => true,'
	},
	{
		id: 'm07', file: 'schema.ts', expect: 'latent — redundant with the envelope, documented below',
		label: 'claim envelope drops the sources minimum',
		from: "sources: z.array(slug).min(1, 'every claim record needs at least one source')",
		to: 'sources: z.array(slug),',
		known: 'by design after the required-source rule: the envelope refine rejects an empty sources list for every kind that carries it (company, contract, licence, declaration, education, place), so the field minimum no longer changes acceptance — only the error message.'
	},
	// --- schema.ts: review guard (V23) ------------------------------------------
	{
		id: 'm08', file: 'schema.ts', expect: 'test-validators V23 (method enum)',
		label: 'review method becomes free text',
		from: 'method: ReviewMethod,',
		to: 'method: z.string(),'
	},
	{
		id: 'm09', file: 'schema.ts', expect: 'latent — by design, documented below',
		label: 'review date loses its ISO format check',
		from: "\t\t.regex(/^\\d{4}-\\d{2}-\\d{2}$/, 'review date must be an ISO date (YYYY-MM-DD)')",
		to: '',
		known: 'by design: the V23 calendar round-trip (m10) already rejects any non-calendar date — "26/07/2026" splits to a single NaN segment, "2026-31-07" rolls over and fails the round-trip — so the format regex is redundant defense-in-depth that only improves the error message.'
	},
	{
		id: 'm10', file: 'schema.ts', expect: 'test-validators V23 (calendar round-trip)',
		label: 'review date loses its calendar round-trip (2026-02-31 accepted)',
		from: "return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;\n\t\t\t},\n\t\t\t'review date must be a calendar-valid date (V23)'",
		to: "return true;\n\t\t\t},\n\t\t\t'review date must be a calendar-valid date (V23)'"
	},
	{
		id: 'm11', file: 'schema.ts', expect: 'test-validators V23-guard (disclaimer clause)',
		label: 'reviewOverclaims stops honouring the "not verified" disclaimer',
		from: 'if (/\\bnot\\b[^.]{0,40}\\b(verified|checked)\\b/i.test(method)) return false;',
		to: ''
	},
	// --- schema.ts: dispute status (R11) -----------------------------------------
	{
		id: 'm12', file: 'schema.ts', expect: 'test-validators R11 (dispute status enum)',
		label: 'dispute status becomes free text',
		from: "status: z.enum(['open', 'adopted', 'rejected']).optional(),",
		to: 'status: z.string().optional(),'
	},
	// --- schema.ts: non-blank mandatory text and override provenance --------------
	{
		id: 'm27', file: 'schema.ts', expect: 'test-validators whitespace fixtures (V18/V20)',
		label: 'nonBlank stops trimming, so a space passes for prose',
		from: "\treturn typeof v === 'string' && v.trim().length >= min;",
		to: "\treturn typeof v === 'string' && v.length > 0;"
	},
	{
		id: 'm28', file: 'schema.ts', expect: 'test-validators V23 (whitespace reviewer name)',
		label: 'reviewer names stop being trimmed before the minimum',
		from: "\tby: z.string().refine((v) => nonBlank(v, 2), 'reviewer name must be at least 2 non-blank characters (V23)'),",
		to: '\tby: z.string().min(2),'
	},
	{
		id: 'm29', file: 'schema.ts', expect: 'the build gate (legacy override register)',
		label: 'legacy basis-override exception register stops being consulted',
		from: '\t\t\tif (schemaExceptions.basisOverrides?.has(overrideKey(kind, r))) return;',
		to: '\t\t\tif (false) return;'
	},
	{
		id: 'm30', file: 'schema.ts', expect: 'test-validators V27 (override review requirement)',
		label: 'override review requirement stops issuing',
		from: "\t\t\tif (!r.review) issue('a basis override requires a review object with a date and method');",
		to: "\t\t\tif (false) issue('a basis override requires a review object with a date and method');"
	},
	{
		id: 'm40', file: 'schema.ts', expect: 'test-validators V26 (incompatible relation)',
		label: 'source relations stop being checked against the authored kind',
		from: 'if (!allowed.includes(r.source_relation)) {',
		to: 'if (false && !allowed.includes(r.source_relation)) {'
	},
	{
		id: 'm41', file: 'schema.ts', expect: 'test-validators V26 (relation needs independence)',
		label: 'a source relation no longer requires an origin count',
		from: 'if (r.independence === undefined) {',
		to: 'if (false && r.independence === undefined) {'
	},
	// --- build-data.ts: the pipeline ---------------------------------------------
	{
		id: 'm21', file: 'build-data.ts', expect: 'test-data V14 (direction on every edge)',
		label: 'emitted relationships stop carrying a direction',
		from: '\t\tdirection: EDGE_DIRECTION[rel.type],\n',
		to: ''
	},
	{
		id: 'm22', file: 'build-data.ts', expect: 'test-pipeline (injected causal cycle)',
		label: 'causal-cycle detection disabled (V8/Tarjan)',
		from: 'if (low.get(v) === index.get(v)) {',
		to: 'if (false && low.get(v) === index.get(v)) {'
	},
	{
		id: 'm23', file: 'build-data.ts', expect: 'test-pipeline (injected unknown source id)',
		label: 'unknown-source detection disabled (checkSources)',
		from: 'if (!sourceById.has(id)) fail(where, `unknown source "${id}"`);',
		to: 'if (false && !sourceById.has(id)) fail(where, `unknown source "${id}"`);'
	},
	{
		id: 'm24', file: 'build-data.ts', expect: 'test-pipeline (injected cause-after-consequence)',
		label: 'cause-after-consequence ordering disabled (V8 temporal)',
		from: 'if (cause && cause.interval.startEarliest > ends) {',
		to: 'if (false && cause && cause.interval.startEarliest > ends) {'
	},
	{
		id: 'm25', file: 'build-data.ts', expect: 'test-pipeline (injected unmoored influence edge)',
		label: 'unmoored-influence rejection disabled (V9 anchoring)',
		from: 'if (!attached) {',
		to: 'if (false && !attached) {'
	},
	{
		id: 'm26', file: 'build-data.ts', expect: 'test-pipeline (injected ghost edge endpoint)',
		label: 'ghost relationship endpoint detection disabled (referential integrity)',
		from: 'if (!entityIds.has(rel.from)) fail(`relationship ${label}`, `unknown "from" entity "${rel.from}"`);',
		to: 'if (false && !entityIds.has(rel.from)) fail(`relationship ${label}`, `unknown "from" entity "${rel.from}"`);'
	},
	{
		id: 'm31', file: 'build-data.ts', expect: 'the build gate (grade-A primary rule)',
		label: 'grade-A records no longer checked for a tier-1/2 source',
		from: '\t\tif (tiers.some((t) => t <= 2)) continue;',
		to: '\t\tif (false) continue;'
	},
	{
		id: 'm32', file: 'build-data.ts', expect: 'the build gate (no-source exception register)',
		label: 'no-source exception register stops being consulted',
		from: '\t\tif (emptySourceKeys.has(`${kind}:${record.id}`)) continue;',
		to: '\t\tif (false) continue;'
	},
	// --- engine time.ts: fuzzy grammar (V21/V22) and the certainty horizon -------
	{
		id: 'm13', file: ENGINE_TIME, expect: 'test-validators V22 (~ widening, engine target)',
		label: '"~" widening reduced to zero slack',
		from: "    const slack = base.precision === 'year' ? APPROX_SLACK_DAYS.year : APPROX_SLACK_DAYS.month;",
		to: '    const slack = 0;'
	},
	{
		id: 'm14', file: ENGINE_TIME, expect: 'test-validators V22 (<= floor clamp, engine target)',
		label: '"<=" bound no longer clamps to the dataset floor',
		from: 'earliest: Math.max(DATASET_FLOOR, base.latest - BEFORE_WINDOW_MS),',
		to: 'earliest: base.latest - BEFORE_WINDOW_MS,'
	},
	{
		id: 'm15', file: ENGINE_TIME, expect: 'test-validators V21 (calendar round-trip, engine target)',
		label: 'calendar-valid day check removed (2018-02-31 accepted)',
		from: '    const d = new Date(t);\n    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) {\n      throw new Error(`Invalid calendar date: "${token}"`);\n    }',
		to: ''
	},
	{
		id: 'm16', file: ENGINE_TIME, expect: 'test-validators V22 (inversion rejection, engine target)',
		label: 'inverted intervals no longer rejected',
		from: 'if (endLatest !== null && endLatest < start.earliest && !opts?.allowEnvelopeTrim) {',
		to: 'if (false && endLatest !== null && endLatest < start.earliest && !opts?.allowEnvelopeTrim) {'
	},
	{
		id: 'm17', file: ENGINE_TIME, expect: 'test-validators V22 (start clamp, engine target)',
		label: 'over-wide fuzzy start no longer clamped down',
		from: 'if (endLatest !== null && start.latest > endLatest && !opts?.allowEnvelopeTrim) {',
		to: 'if (false && endLatest !== null && start.latest > endLatest && !opts?.allowEnvelopeTrim) {'
	},
	{
		id: 'm18', file: ENGINE_TIME, expect: 'test-validators V22 (verified-at cutoff clamp, engine target)',
		label: 'verified-at bound no longer clamped to the dataset cutoff',
		from: 'endEarliest = Math.min(at.latest, DATASET_CUTOFF);',
		to: 'endEarliest = at.latest;'
	},
	{
		id: 'm19', file: ENGINE_TIME, expect: 'test-validators (certainlyActive boundary, engine target)',
		label: 'certainlyActive exclusive at the lower core edge',
		from: 'if (t < iv.startLatest) return false;',
		to: 'if (t <= iv.startLatest) return false;'
	},
	{
		id: 'm20', file: ENGINE_TIME, expect: 'test-validators (open-ended duration, engine target)',
		label: 'open-ended durations measured from the epoch instead of the cutoff',
		from: '? DATASET_CUTOFF\n      : (iv.endEarliest + iv.endLatest) / 2;',
		to: '? 0\n      : (iv.endEarliest + iv.endLatest) / 2;'
	},
	{
		id: 'm33', file: ENGINE_TIME, expect: 'test-validators (no assertion past cutoff, engine target)',
		label: 'certainlyActive loses its cutoff clamp',
		from: 'if (t > DATASET_CUTOFF) return false;\n  if (t < iv.startLatest) return false;',
		to: 'if (t < iv.startLatest) return false;'
	},
	{
		id: 'm34', file: ENGINE_TIME, expect: 'test-validators (no assertion past cutoff, engine target)',
		label: 'possiblyActive loses its cutoff clamp',
		from: 'if (t > DATASET_CUTOFF) return false;\n  if (t < iv.startEarliest) return false;',
		to: 'if (t < iv.startEarliest) return false;'
	},
	{
		id: 'm35', file: ENGINE_TIME, expect: 'test-validators (unknown-end certainty horizon, engine target)',
		label: 'certainty no longer stops at the last observation',
		from: 'if (coreEnd !== null && t > coreEnd) return false;',
		to: 'if (false && coreEnd !== null && t > coreEnd) return false;'
	},
	{
		id: 'm36', file: ENGINE_TIME, expect: 'test-validators (month-midpoint rule, engine target)',
		label: 'month-only verification is certain through the whole month',
		from: "const instant = at.precision === 'month' ? Math.floor((at.earliest + at.latest) / 2) : at.latest;",
		to: 'const instant = at.latest;'
	},
	{
		id: 'm37', file: ENGINE_TIME, expect: 'test-validators (ongoing confirmation window, engine target)',
		label: 'ongoing is always treated as recently confirmed',
		from: 'lastObservation !== null &&\n    lastObservation >= cutoff - ONGOING_CONFIRMATION_DAYS * 86_400_000;',
		to: 'true;'
	},
	{
		id: 'm38', file: ENGINE_TIME, expect: 'test-validators (unknown-end observation, engine target)',
		label: 'unknown ends borrow the cutoff as their observation',
		from: "else if (status === 'unknown') lastObserved = start.latest;",
		to: "else if (status === 'unknown') lastObserved = endLatest;"
	},
	// --- canonical.ts: byte reproducibility --------------------------------------
	{
		id: 'm39', file: 'canonical.ts', expect: 'test-pipeline (canonical byte equality)',
		label: 'canonical bytes keep the wall-clock generated timestamp',
		from: '\tcopy.meta.generated = CANONICAL_GENERATED;\n',
		to: ''
	},
	// --- review-coverage.ts: overlapping flags and honest columns (Phase 8) ------
	{
		id: 'm49', file: 'review-coverage.ts', expect: 'test-validators Phase 8 (inferred + attributed flags)',
		label: 'review flags revert to a first-match partition (inferred hidden by attributed)',
		from: "\tif (r.basis === 'inferred') out.push('inferred');",
		to: "\tif (r.basis === 'inferred' && out.length === 0) out.push('inferred');"
	},
	{
		id: 'm50', file: 'review-coverage.ts', expect: 'test-validators Phase 8 (unsubstantiated + attributed overlap)',
		label: 'an unsubstantiated record stops carrying its attributed flag',
		from: "\tif (r.attributed_to) out.push('attributed');",
		to: "\tif (r.attributed_to && r.basis !== 'unsubstantiated') out.push('attributed');"
	},
	{
		id: 'm51', file: 'review-coverage.ts', expect: 'test-validators Phase 8 (examined is not independent)',
		label: 'the coverage CSV reports every examined record as independently checked',
		from: '\t\t\t\tindependentlyChecked: 0,',
		to: '\t\t\t\tindependentlyChecked: isReviewed ? 1 : 0,'
	}
];

/** Which suites exercise which target. Order is the attribution order. */
const SUITES_FOR: Record<string, string[]> = {
	'schema.ts': ['test-data.ts', 'test-validators.ts'],
	'build-data.ts': ['test-data.ts', 'test-validators.ts', 'test-pipeline.ts'],
	'canonical.ts': ['test-data.ts', 'test-pipeline.ts'],
	'review-coverage.ts': ['test-data.ts', 'test-validators.ts', 'test-emit.ts'],
	[ENGINE_TIME]: ['test-validators.ts', 'test-engine-conformance.ts']
};
const SYNTHETIC_SUITES = new Set(['test-validators.ts', 'test-pipeline.ts', 'test-engine-conformance.ts']);

function run(label: string, args: string[]): { code: number; output: string } {
	const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
	const output = ((r.stdout ?? '') + (r.stderr ?? '')).trim();
	if (r.error) return { code: 2, output: `${label}: ${r.error.message}` };
	if (r.status !== 0) {
		const tail = output.split('\n').slice(-8).map((l) => `      ${l}`).join('\n');
		console.log(`  ! ${label} exited ${r.status}\n${tail}`);
	}
	return { code: r.status ?? 1, output };
}

/** CRLF discipline: target files are CRLF on disk; mutation literals are written LF. */
function withEol(text: string, file: string): string {
	return readFileSync(S(file), 'utf8').includes('\r\n') ? text.replace(/\n/g, '\r\n') : text;
}

function occurrenceCount(file: string, from: string): number {
	if (!existsSync(S(file))) return -1;
	const before = readFileSync(S(file), 'utf8');
	return before.split(withEol(from, file)).length - 1;
}

function lineHint(file: string, from: string): string {
	if (!existsSync(S(file))) return 'file missing';
	const lines = readFileSync(S(file), 'utf8').replace(/\r\n/g, '\n').split('\n');
	const probe = from.replace(/\r\n/g, '\n').split('\n')[0].trim().slice(0, 48);
	const at = lines.findIndex((l) => l.includes(probe));
	return at >= 0 ? `line ${at + 1}` : 'not found';
}

function applyMutation(file: string, from: string, to: string) {
	const path = S(file);
	const before = readFileSync(path, 'utf8');
	const needle = withEol(from, file);
	const replacement = withEol(to, file);
	const count = before.split(needle).length - 1;
	if (count !== 1) throw new Error(`mutation: "${file}" pattern appears ${count} times, expected exactly 1`);
	writeFileSync(path, before.replace(needle, replacement), 'utf8');
}

type Verdict = 'killed' | 'survived-latent' | 'survived-drift' | 'invalid-mutant';

interface Result {
	id: string;
	label: string;
	file: string;
	verdict: Verdict;
	by: string;
	outputChanged: boolean;
	expect: string;
}

function main() {
	const args = process.argv.slice(2);
	const only = new Set(
		args.filter((a) => a.startsWith('--only=')).flatMap((a) => a.slice(7).split(',').map((s) => s.trim()).filter(Boolean))
	);
	const withValidators = !args.includes('--no-validators');
	const selected = MUTATIONS.filter((m) => !only.size || only.has(m.id));

	if (args.includes('--list')) {
		for (const m of selected) {
			console.log(`  ${m.id.padEnd(6)} ${m.file.padEnd(34)} ${m.label.padEnd(64)} expect: ${m.expect}`);
		}
		return;
	}

	// -------------------------------------------------------------------------
	// Pattern self-check. A mutation whose `from` is absent or ambiguous is an
	// invalid mutant, not a kill; report every one with a file and line hint
	// before the campaign runs, so a stale harness cannot masquerade as coverage.
	// -------------------------------------------------------------------------
	console.log('\n  ── pattern self-check ──');
	const runnable: Mutation[] = [];
	const invalid: Result[] = [];
	for (const m of selected) {
		const count = occurrenceCount(m.file, m.from);
		if (count === 1) {
			runnable.push(m);
			console.log(`    ok    ${m.id.padEnd(5)} ${m.file.padEnd(40)} ${lineHint(m.file, m.from)}`);
		} else {
			const reason =
				count < 0 ? 'target file not found' : count === 0 ? 'pattern not found in target' : `pattern appears ${count} times`;
			invalid.push({
				id: m.id,
				label: m.label,
				file: m.file,
				verdict: 'invalid-mutant',
				by: `${reason} (${lineHint(m.file, m.from)})`,
				outputChanged: false,
				expect: m.expect
			});
			console.log(`    MISS  ${m.id.padEnd(5)} ${m.file.padEnd(40)} ${reason} — ${lineHint(m.file, m.from)}`);
		}
	}
	if (args.includes('--check')) {
		console.log(`\n    ${runnable.length}/${selected.length} patterns resolvable, ${invalid.length} invalid\n`);
		process.exit(invalid.length ? 1 : 0);
	}

	// -------------------------------------------------------------------------
	// Snapshot everything a mutated build can touch, so one mutation cannot leak
	// into the next. Keys are absolute paths.
	// -------------------------------------------------------------------------
	const targets = [...new Set(runnable.map((m) => m.file))];
	const snapshots = new Map<string, string>();
	const snapshot = (p: string) => {
		if (!existsSync(p)) return;
		if (statSync(p).isDirectory()) {
			for (const entry of readdirSync(p)) snapshot(join(p, entry));
			return;
		}
		snapshots.set(p, readFileSync(p, 'utf8'));
	};
	for (const f of targets) snapshot(S(f));
	snapshot(join(ROOT, 'src', 'generated'));
	snapshot(join(ROOT, 'static'));
	snapshot(join(ROOT, 'README.md'));
	snapshot(join(ROOT, 'AGENTS.md'));
	snapshot(join(ROOT, 'DESIGN.md'));
	snapshot(join(ROOT, 'output', 'basis-overrides.csv'));

	const restore = () => {
		for (const [p, content] of snapshots) {
			if (!existsSync(p)) continue;
			const current = readFileSync(p, 'utf8');
			if (current !== content) writeFileSync(p, content, 'utf8');
		}
	};
	process.on('SIGINT', () => {
		restore();
		console.log('\n  interrupted — sources and build outputs restored');
		process.exit(130);
	});
	process.on('exit', () => {
		try {
			restore();
		} catch {
			/* last-resort path — nothing more to do */
		}
	});

	const beforeHash = hash(DATASET);
	const results: Result[] = [...invalid];

	try {
		for (const m of runnable) {
			process.stdout.write(`\n  ▸ ${m.id} ${m.label} … `);
			try {
				applyMutation(m.file, m.from, m.to);

				const build = run(`build`, [TSR, 'scripts/build-data.ts']);
				const outputChanged = hash(DATASET) !== beforeHash;
				const validationFailure = /DATA VALIDATION FAILED|translation errors/.test(build.output);

				const suites = (SUITES_FOR[m.file] ?? ['test-data.ts', 'test-validators.ts']).filter(
					(s) => withValidators || !SYNTHETIC_SUITES.has(s)
				);
				const failures: { suite: string; output: string }[] = [];
				if (build.code === 0) {
					for (const suite of suites) {
						const r = run(suite, [TSR, `scripts/${suite}`]);
						if (r.code !== 0) {
							failures.push({ suite, output: r.output });
							break;
						}
					}
				}

				if (build.code !== 0 && !validationFailure) {
					const firstError =
						build.output.split('\n').find((l) => /error|Error/.test(l))?.trim() ?? 'build failed without a validation message';
					results.push({
						id: m.id, label: m.label, file: m.file, verdict: 'invalid-mutant',
						by: `build error outside the validation gate: ${firstError.slice(0, 120)}`,
						outputChanged, expect: m.expect
					});
					console.log('INVALID — build broke for a reason unrelated to the invariant');
				} else if (build.code !== 0) {
					results.push({ id: m.id, label: m.label, file: m.file, verdict: 'killed', by: 'build gate', outputChanged, expect: m.expect });
					console.log('KILLED — build gate');
				} else if (failures.length) {
					results.push({ id: m.id, label: m.label, file: m.file, verdict: 'killed', by: failures[0].suite.replace('.ts', ''), outputChanged, expect: m.expect });
					console.log(`KILLED — ${failures[0].suite.replace('.ts', '')}`);
				} else if (outputChanged) {
					results.push({ id: m.id, label: m.label, file: m.file, verdict: 'survived-drift', by: 'none — graph changed silently', outputChanged, expect: m.expect });
					console.log('SURVIVED — silent drift (graph changed, no assertion noticed)');
				} else {
					results.push({ id: m.id, label: m.label, file: m.file, verdict: 'survived-latent', by: m.known ? 'known limitation (documented)' : 'none — latent on clean graph', outputChanged, expect: m.expect });
					console.log(`SURVIVED — latent${m.known ? ' (known limitation)' : ' (graph unchanged)'}`);
				}
			} catch (e) {
				results.push({
					id: m.id, label: m.label, file: m.file, verdict: 'invalid-mutant',
					by: `harness error: ${(e as Error).message}`, outputChanged: false, expect: m.expect
				});
				console.log(`INVALID — ${(e as Error).message}`);
			} finally {
				restore();
			}
		}
	} finally {
		restore();
	}

	// One final verification that the restored sources build cleanly, then
	// restore again to neutralise the timestamp churn that verification produced.
	console.log('\n  verifying restored sources build cleanly…');
	const verify = run(`clean rebuild check`, [TSR, 'scripts/build-data.ts']);
	restore();
	if (verify.code !== 0) {
		console.error('  FAIL: restored sources do not build — the harness left the repo broken');
		process.exit(1);
	}

	// Report
	const killed = results.filter((r) => r.verdict === 'killed');
	const latent = results.filter((r) => r.verdict === 'survived-latent');
	const drift = results.filter((r) => r.verdict === 'survived-drift');
	const broken = results.filter((r) => r.verdict === 'invalid-mutant');
	const known = latent.filter((r) => r.by.startsWith('known limitation'));
	const counted = killed.length + latent.length + drift.length;
	const rate = counted ? Math.round((killed.length / counted) * 100) : 0;

	console.log(`\n  Mutation report — ${killed.length}/${counted} killed (${rate}%)`);
	console.log(`  run with synthetic validator fixtures: ${withValidators ? 'YES' : 'NO'}`);
	for (const r of results) {
		console.log(
			`    ${r.verdict === 'killed' ? '✗ killed' : r.verdict === 'invalid-mutant' ? '! invalid' : '○ ' + r.verdict.padEnd(15)} ${r.id.padEnd(5)} ${r.label.padEnd(62)} ${r.by}`
		);
	}
	console.log(
		`\n    ${killed.length} killed   ${latent.length} latent (${known.length} known)   ${drift.length} silent-drift   ${broken.length} invalid`
	);
	if (drift.length) {
		console.log('\n  SILENT DRIFT — graph-changing mutations nothing noticed:');
		for (const r of drift) console.log(`    ${r.id} ${r.label}`);
	}
	if (broken.length) {
		console.log('\n  INVALID MUTANTS — patterns or builds broken for unrelated reasons:');
		for (const r of broken) console.log(`    ${r.id} ${r.label} — ${r.by}`);
	}
	if (known.length) {
		console.log('\n  KNOWN LATENT — documented survivors, accepted deliberately:');
		for (const r of known) {
			const m = MUTATIONS.find((x) => x.id === r.id);
			console.log(`    ${r.id} ${r.label} — ${m?.known ?? ''}`);
		}
	}

	const report = {
		generated: new Date().toISOString(),
		commit: (() => {
			const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
			return (r.stdout || '').trim() || null;
		})(),
		withValidators,
		summary: {
			counted,
			killed: killed.length,
			latent: latent.length,
			knownLatent: known.length,
			drift: drift.length,
			invalid: broken.length,
			rate
		},
		results
	};
	mkdirSync(join(ROOT, 'output'), { recursive: true });
	writeFileSync(join(ROOT, 'output', 'mutation-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
	console.log(`\n  report written to output/mutation-report.json`);

	// A campaign that leaves invalid mutants or silent drift is not green: drift
	// must become a new assertion, and stale patterns must be repaired.
	process.exit(broken.length || drift.length ? 1 : 0);
}

main();
