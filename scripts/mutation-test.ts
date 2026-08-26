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
 * CLASSIFICATION
 * --------------
 *   killed          the build crashed or a test failed while the mutation was
 *                   in place
 *   survived-latent the mutation changed nothing observable: build and tests
 *                   all pass and the emitted graph is byte-identical. The
 *                   invariant it weakened is invisible on a clean dataset.
 *   survived-drift  build and tests pass BUT the emitted graph changed. This is
 *                   the dangerous class: a validator change silently rewrites
 *                   published data with nothing objecting (the V18-3 story —
 *                   a reclassification of 138 positions no assertion noticed).
 *
 * Usage:
 *   npm run mutation                  full run
 *   npm run mutation -- --only=m04,m10   run a subset
 *   npm run mutation -- --list           list mutations without running
 *   npm run mutation -- --no-validators  simulate the pre-synthetic-fixture
 *                                        suite (no test-validators.ts, no
 *                                        test-pipeline.ts), to see what the
 *                                        added fixtures are worth
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSR = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const DATASET = join(ROOT, 'src', 'generated', 'dataset.json');
const S = (f: string) => join(HERE, f);

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
	file: string; // relative to scripts/
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
	// --- schema.ts: the claim envelope (V18/V20) --------------------------------
	{
		id: 'm04', file: 'schema.ts', expect: 'test-validators V20 (C/D attribution)',
		label: 'envelope stops requiring attributed_to on C/D',
		from: "(r: any) => !((r.confidence === 'C' || r.confidence === 'D') && !r.attributed_to)",
		to: '(r: any) => true'
	},
	{
		id: 'm05', file: 'schema.ts', expect: 'test-validators V18 (inferred completeness)',
		label: 'envelope stops requiring reasoning/falsifier on inferred',
		from: "!(deriveBasis(r.confidence, r.verification, r.basis) === 'inferred' &&\n\t\t\t\t\t(!r.reasoning || !r.falsifiable_by))",
		to: 'true'
	},
	{
		id: 'm06', file: 'schema.ts', expect: 'test-validators V18 (explicit unsubstantiated)',
		label: 'envelope stops requiring attribution on unsubstantiated',
		from: "!(deriveBasis(r.confidence, r.verification, r.basis) === 'unsubstantiated' && !r.attributed_to)",
		to: 'true'
	},
	{
		id: 'm07', file: 'schema.ts', expect: 'test-validators V18 (company zero sources)',
		label: 'claim envelope drops the sources minimum',
		from: "sources: z.array(slug).min(1, 'every claim record needs at least one source')",
		to: 'sources: z.array(slug),'
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
		from: 'return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;',
		to: 'return true;'
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
	// --- dates.ts: fuzzy grammar (V22) and calendar validity (V21) ---------------
	{
		id: 'm13', file: 'dates.ts', expect: 'test-validators V22 (~ widening)',
		label: '"~" widening reduced to zero slack',
		from: "const slack = base.precision === 'year' ? 365 : 92;",
		to: 'const slack = 0;'
	},
	{
		id: 'm14', file: 'dates.ts', expect: 'test-validators V22 (<= floor clamp)',
		label: '"<=" bound no longer clamps to the dataset floor',
		from: 'earliest: Math.max(DATASET_FLOOR, base.latest - BEFORE_WINDOW_MS),',
		to: 'earliest: base.latest - BEFORE_WINDOW_MS,'
	},
	{
		id: 'm15', file: 'dates.ts', expect: 'test-validators V21 (calendar round-trip)',
		label: 'calendar-valid day check removed (2018-02-31 accepted)',
		from: '\t\tconst d = new Date(t);\n\t\tif (d.getUTCFullYear() !== year || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) {\n\t\t\tthrow new Error(`Invalid calendar date: "${token}"`);\n\t\t}',
		to: ''
	},
	{
		id: 'm16', file: 'dates.ts', expect: 'test-validators V22 (inversion rejection)',
		label: 'inverted intervals no longer rejected',
		from: 'if (endLatest !== null && endLatest < start.earliest && !opts?.allowEnvelopeTrim) {',
		to: 'if (false && endLatest !== null && endLatest < start.earliest && !opts?.allowEnvelopeTrim) {'
	},
	{
		id: 'm17', file: 'dates.ts', expect: 'test-data V22 inversion check and/or test-validators',
		label: 'over-wide fuzzy start no longer clamped down',
		from: 'if (endLatest !== null && start.latest > endLatest && !opts?.allowEnvelopeTrim) {',
		to: 'if (false && endLatest !== null && start.latest > endLatest && !opts?.allowEnvelopeTrim) {'
	},
	{
		id: 'm18', file: 'dates.ts', expect: 'test-validators V22 (verified-at cutoff clamp)',
		label: 'verified-at bound no longer clamped to the dataset cutoff',
		from: 'endEarliest = Math.min(at.latest, DATASET_CUTOFF);',
		to: 'endEarliest = at.latest;'
	},
	{
		id: 'm19', file: 'dates.ts', expect: 'test-validators (certainlyActive boundary)',
		label: 'certainlyActive exclusive at the lower core edge',
		from: 'if (t < iv.startLatest) return false;',
		to: 'if (t <= iv.startLatest) return false;'
	},
	{
		id: 'm20', file: 'dates.ts', expect: 'test-validators (open-ended duration)',
		label: 'open-ended durations measured from the epoch instead of the cutoff',
		from: '? DATASET_CUTOFF\n\t\t\t: (iv.endEarliest + iv.endLatest) / 2;',
		to: '? 0\n\t\t\t: (iv.endEarliest + iv.endLatest) / 2;'
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
	}
];

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
function applyMutation(file: string, from: string, to: string) {
	const path = S(file);
	const before = readFileSync(path, 'utf8');
	const needle = before.includes('\r\n') ? from.replace(/\n/g, '\r\n') : from;
	const replacement = before.includes('\r\n') ? to.replace(/\n/g, '\r\n') : to;
	const count = before.split(needle).length - 1;
	if (count !== 1) throw new Error(`mutation: "${file}" pattern appears ${count} times, expected exactly 1`);
	writeFileSync(path, before.replace(needle, replacement), 'utf8');
}

interface Result {
	id: string;
	label: string;
	file: string;
	verdict: 'killed' | 'survived-latent' | 'survived-drift' | 'error';
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

	if (args.includes('--list')) {
		for (const m of MUTATIONS) {
			console.log(`  ${m.id.padEnd(6)} ${m.file.padEnd(14)} ${m.label.padEnd(62)} expect: ${m.expect}`);
		}
		return;
	}

	const targets = [...new Set(MUTATIONS.map((m) => m.file))];
	const snapshots = new Map<string, string>();

	/**
	 * `npm run data` rewrites the whole public surface — src/generated/, static/
	 * (dataset.json, the CSV exports, interval-trims.json, editorial-queue.json,
	 * geo.json, regions.geojson) and the <!--stat:--> tags in the three docs —
	 * and a mutated build can change any of it. Restoring only the source file
	 * would leak one mutation's emitted graph into the next mutation's hash
	 * comparison (and its test runs). Snapshot everything the build touches.
	 * Keys are ABSOLUTE paths: restore must not have to guess whether a file
	 * lives in scripts/ or the repo root.
	 */
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
		// Best effort: even a hard crash mid-loop must not leave the tree mutated.
		// (readFileSync/writeFileSync are synchronous, so this runs on normal exit
		// paths; nothing can help against a SIGKILL, which is why the loop also
		// restores after every single mutation.)
		try {
			restore();
		} catch {
			/* last-resort path — nothing more to do */
		}
	});

	// A target file that no longer matches its mutation patterns means the tree
	// was left mutated by a previous interrupted run. Never stack mutations.
	const dirty = MUTATIONS.filter((m) => {
		if (only.size && !only.has(m.id)) return false;
		const before = readFileSync(S(m.file), 'utf8');
		const needle = before.includes('\r\n') ? m.from.replace(/\n/g, '\r\n') : m.from;
		return before.split(needle).length - 1 !== 1;
	});
	if (dirty.length) {
		console.error(
			`\n  ABORT: the working tree is already mutated — restore the source files first:\n` +
				dirty.map((m) => `    ${m.id} ${m.label} (pattern missing from ${m.file})`).join('\n') +
				'\n  (run: git checkout -- scripts/schema.ts scripts/dates.ts scripts/build-data.ts, then rebuild)'
		);
		process.exit(2);
	}

	const beforeHash = hash(DATASET);
	const results: Result[] = [];

	try {
		for (const m of MUTATIONS) {
			if (only.size && !only.has(m.id)) continue;
			process.stdout.write(`\n  ▸ ${m.id} ${m.label} … `);

			applyMutation(m.file, m.from, m.to);

			const build = run(`build`, [TSR, 'scripts/build-data.ts']);
			const outputChanged = hash(DATASET) !== beforeHash;

			let testData = { code: 0, output: '' };
			let testVal = { code: 0, output: '' };
			let testPipeline = { code: 0, output: '' };
			if (build.code === 0) {
				testData = run(`test-data`, [TSR, 'scripts/test-data.ts']);
				if (withValidators) testVal = run(`test-validators`, [TSR, 'scripts/test-validators.ts']);
				// build-data mutations can only be exercised through the pipeline
				// itself: run the fixture trees (clean + injected) against it.
				if (withValidators && m.file === 'build-data.ts') testPipeline = run(`test-pipeline`, [TSR, 'scripts/test-pipeline.ts']);
			}

			restore();

			if (build.code !== 0) {
				results.push({ id: m.id, label: m.label, file: m.file, verdict: 'killed', by: 'build crashed', outputChanged, expect: m.expect });
				console.log(`KILLED — build crashed`);
			} else if (testData.code !== 0) {
				results.push({ id: m.id, label: m.label, file: m.file, verdict: 'killed', by: 'test-data', outputChanged, expect: m.expect });
				console.log(`KILLED — test-data`);
			} else if (withValidators && testVal.code !== 0) {
				results.push({ id: m.id, label: m.label, file: m.file, verdict: 'killed', by: 'test-validators', outputChanged, expect: m.expect });
				console.log(`KILLED — test-validators`);
			} else if (m.file === 'build-data.ts' && testPipeline.code !== 0) {
				results.push({ id: m.id, label: m.label, file: m.file, verdict: 'killed', by: 'test-pipeline', outputChanged, expect: m.expect });
				console.log(`KILLED — test-pipeline`);
			} else if (outputChanged) {
				results.push({ id: m.id, label: m.label, file: m.file, verdict: 'survived-drift', by: 'none — graph changed silently', outputChanged, expect: m.expect });
				console.log(`SURVIVED — silent drift (graph changed, no assertion noticed)`);
			} else {
				results.push({ id: m.id, label: m.label, file: m.file, verdict: 'survived-latent', by: m.known ? 'known limitation (documented)' : 'none — latent on clean graph', outputChanged, expect: m.expect });
				console.log(`SURVIVED — latent${m.known ? ' (known limitation)' : ' (graph unchanged)'}`);
			}
		}
	} catch (e) {
		restore();
		console.error(`\n  harness error: ${(e as Error).message}`);
		process.exit(1);
	} finally {
		restore();
	}

	// The per-mutation restores already return everything byte-exact. One final
	// verification that the restored sources build cleanly, then restore again to
	// neutralise the timestamp churn that verification itself produced.
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
	const known = latent.filter((r) => r.by.startsWith('known limitation'));
	const rate = results.length ? Math.round((killed.length / results.length) * 100) : 0;

	console.log(`\n  Mutation report — ${killed.length}/${results.length} killed (${rate}%)`);
	console.log(`  run with synthetic validator fixtures: ${withValidators ? 'YES' : 'NO'}`);
	for (const r of results) {
		console.log(
			`    ${r.verdict === 'killed' ? '✗ killed' : '○ ' + r.verdict.padEnd(15)} ${r.id.padEnd(5)} ${r.label.padEnd(60)} ${r.by}`
		);
	}
	console.log(`\n    ${killed.length} killed   ${latent.length} latent (${known.length} known limitations)   ${drift.length} silent-drift`);
	if (drift.length) {
		console.log('\n  SILENT DRIFT — graph-changing mutations nothing noticed:');
		for (const r of drift) console.log(`    ${r.id} ${r.label}`);
	}
	if (known.length) {
		console.log('\n  KNOWN LATENT — documented survivors, accepted deliberately:');
		for (const r of known) {
			const m = MUTATIONS.find((x) => x.id === r.id);
			console.log(`    ${r.id} ${r.label} — ${m?.known ?? ''}`);
		}
	}

	// Persist a JSON artifact next to the last-run state so sessions can compare.
	try {
		const outDir = join(tmpdir(), 'opencode', 'deeptunisia-mutation');
		mkdirSync(outDir, { recursive: true });
		writeFileSync(
			join(outDir, `report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`),
			JSON.stringify({ withValidators, rate, killed: killed.length, latent: latent.length, drift: drift.length, results }, null, 2),
			'utf8'
		);
		console.log(`\n  report written to ${outDir}`);
	} catch {
		/* temp-dir write failure is not a harness failure */
	}
}

main();
