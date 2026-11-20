/**
 * The release workflow runs two ways: a signed tag push publishes, a manual run is a
 * dry run. The second only means something if nothing that publishes can run in it,
 * so this test reads .github/workflows/release.yml and fails when:
 *
 *   - the workflow loses either trigger (tag push or manual run),
 *   - the step that creates the GitHub Release is not limited to a tag push,
 *   - a manual run can reach the deposit script without --dry-run,
 *   - another step creates or deletes a release or calls the deposit script,
 *   - the tag signature check is not limited to a tag ref,
 *   - the dry-run asset list names different files from the real one.
 *
 * The release run must also write the commit into the documents between the build and
 * the test gate (the build no longer does), or the gate fails on every run; the first
 * dry run of this workflow found that.
 *
 * It proves the guards are in the file, not that GitHub honours them; the workflow's
 * own dry run on a release candidate is what proves that.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'release.yml');

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` - ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
	}
}

type Step = { name?: string; if?: string; run?: string; env?: Record<string, string> };

const PUSH_ONLY = "github.event_name == 'push'";

/** Every way the workflow text breaks the dry-run promise, as sentences. */
export function releaseGuardProblems(text: string): string[] {
	const problems: string[] = [];
	const doc = parse(text) as { on?: Record<string, unknown>; jobs?: Record<string, { steps?: Step[] }> };
	const on = doc.on ?? {};
	const tags = (on.push as { tags?: string[] } | undefined)?.tags ?? [];
	if (!tags.includes('v*')) problems.push('the workflow no longer runs on a v* tag push');
	if (!('workflow_dispatch' in on)) problems.push('the workflow has no manual trigger, so it has no dry run');

	const steps = Object.values(doc.jobs ?? {}).flatMap((j) => j.steps ?? []);
	const label = (s: Step) => s.name ?? '(unnamed step)';

	for (const s of steps) {
		const run = s.run ?? '';
		if (/gh release (create|delete|upload|edit)/.test(run) && s.if?.trim() !== PUSH_ONLY) {
			problems.push(`step "${label(s)}" touches a release but is not limited to a tag push`);
		}
		if (/deposit-zenodo/.test(run)) {
			// Every line that calls the script outside the dispatch branch is the live call.
			let inDispatch = false;
			let sawDispatchCall = false;
			for (const line of run.split('\n')) {
				if (/GITHUB_EVENT_NAME.*=.*"workflow_dispatch"/.test(line)) inDispatch = true;
				else if (/^\s*else\b/.test(line)) inDispatch = false;
				else if (/^\s*fi\b/.test(line)) inDispatch = false;
				if (/deposit-zenodo\.ts/.test(line) && /npx|tsx/.test(line)) {
					if (inDispatch) {
						sawDispatchCall = true;
						if (!/--dry-run/.test(line)) problems.push(`step "${label(s)}" runs the deposit script in a manual run without --dry-run`);
					}
				}
			}
			if (!sawDispatchCall) problems.push(`step "${label(s)}" has no separate --dry-run call for a manual run`);
		}
	}

	// The build no longer writes the documents: a release run must write the commit
	// into them after the build and before the gate that compares them.
	const at = (re: RegExp) => steps.findIndex((s) => re.test(s.run ?? ''));
	const buildAt = at(/npm run build/);
	const writeAt = at(/npm run stats:write/);
	const testAt = at(/npm run test/);
	if (writeAt === -1) problems.push('no step writes the commit into the documents (npm run stats:write)');
	else if (!(buildAt < writeAt && writeAt < testAt)) problems.push('stats:write does not run between the build and the test gate');
	else if (!steps[writeAt].env?.DT_RELEASE_SHA) {
		problems.push('the stats:write step does not carry DT_RELEASE_SHA');
	}

	const verify = steps.find((s) => /git tag -v/.test(s.run ?? '') && /Verify tag/i.test(label(s)));
	if (!verify) problems.push('the tag signature step is missing');
	else if (verify.if?.trim() !== "github.ref_type == 'tag'") {
		problems.push('the tag signature step is not limited to a tag ref, so a branch run would fail it');
	}

	const loopOf = (s: Step | undefined) => (s?.run ?? '').match(/for f in [^\n]*; do/)?.[0] ?? '';
	const real = steps.find((s) => /gh release create/.test(s.run ?? ''));
	const dry = steps.find((s) => /dry run: no GitHub Release is created/.test(s.run ?? ''));
	if (!dry) problems.push('the dry-run asset list step is missing');
	else if (dry.if?.trim() !== "github.event_name == 'workflow_dispatch'") problems.push('the dry-run asset list is not limited to a manual run');
	if (real && dry && loopOf(real) !== loopOf(dry)) problems.push('the dry-run asset list and the real release name different files');
	return problems;
}

const text = readFileSync(WORKFLOW, 'utf8');
const problems = releaseGuardProblems(text);
ok('the release workflow keeps every dry-run guard', problems.length === 0, problems.join('; ') || 'no problems');

// Bite: each guard, removed from a copy, is named.
const mutants: [string, string, RegExp][] = [
	['the release step loses its tag-push guard', text.replace(/(\n\s*# Only a tag push publishes[^\n]*\n)\s*if: github\.event_name == 'push'/, '$1'), /not limited to a tag push/],
	['a manual run reaches the live deposit call', text.replace('deposit-zenodo.ts --dry-run', 'deposit-zenodo.ts'), /without --dry-run/],
	['the tag check runs on a branch', text.replace("if: github.ref_type == 'tag'", "if: always()"), /not limited to a tag ref/],
	['the stats:write step is dropped', text.replace('run: npm run stats:write', 'run: echo skipped'), /no step writes the commit/],
	['the manual trigger is removed', text.replace('workflow_dispatch: {}', ''), /no manual trigger/],
	['the dry-run list drifts from the real one', text.replace('static/geo.json static/world-topo.json', 'static/geo.json'), /different files/]
];
for (const [name, mutated, expect] of mutants) {
	ok(`bite: ${name}`, mutated !== text && releaseGuardProblems(mutated).some((p) => expect.test(p)));
}

console.log(`\n  ${checks - failures}/${checks} release workflow checks passed\n`);
if (failures) process.exit(1);
