/**
 * One safe deploy command.
 *
 * A plain `wrangler deploy` resets the Worker's variables to what wrangler.toml
 * says. RESEARCH_OPEN is set outside the repository while a study is fielding,
 * so that reset closes submissions without changing a line of code. This script
 * reads the live state first, builds the deploy around it, and verifies the
 * result afterwards. With no flags it rehearses: it checks the tree, builds,
 * dry-runs and stops before anything is deployed.
 *
 *   npm run deploy:dry   rehearse
 *   npm run deploy       deploy and verify
 *
 * The decisions are pure functions so scripts/test-deploy.ts can prove the
 * rules with no network and no wrangler binary. The runner is the thin part.
 *
 * It does not replace scripts/verify-deploy.cjs: that verifies the public
 * surface (headers, routes, the Agora mode, the browser). This verifies only
 * that the deploy did not close a study or ship a stale changelog.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_HOST = 'https://deeptunisia.org';

export type GitState = {
	branch: string;
	/** Nothing modified, staged or untracked. */
	clean: boolean;
	/** Commits in HEAD that origin/main does not have. */
	ahead: number;
	/** Commits on origin/main that HEAD does not have. */
	behind: number;
};

export type LiveStudy = {
	slug: string;
	/** true: taking answers. false: closed. null: could not be read. */
	accepting: boolean | null;
};

export type ChangelogEntry = {
	hash?: string;
	date?: string;
	subject?: string;
};

export type LiveState = {
	studies: LiveStudy[];
	/** Newest published entry, or null when it could not be read. */
	changelogNewest: ChangelogEntry | null;
	/** Set when the live state was not read at all. */
	error?: string | null;
};

export type Flags = {
	allowBranch?: boolean;
	researchOpen?: 0 | 1 | null;
};

export type Plan = {
	ok: boolean;
	refusals: string[];
	warnings: string[];
	/** True when the plan deploys a branch other than main. */
	allowBranch: boolean;
	/** The RESEARCH_OPEN value the plan passes, or null when it passes none. */
	researchVar: 'RESEARCH_OPEN:1' | 'RESEARCH_OPEN:0' | null;
	dryRun: string[];
	deploy: string[];
};

export type PlanInput = {
	git: GitState;
	live: LiveState;
	flags?: Flags;
};

/**
 * `--keep-vars` is in every argv this module produces, for the dry run and the
 * real run. That flag is the whole reason the script exists: without it the
 * deploy drops the live RESEARCH_OPEN and closes a fielding study.
 */
function argvFor(researchVar: Plan['researchVar'], dryRun: boolean): string[] {
	const argv = ['wrangler', 'deploy'];
	if (dryRun) argv.push('--dry-run');
	argv.push('--keep-vars');
	if (researchVar) argv.push('--var', researchVar);
	return argv;
}

export function planDeploy(input: PlanInput): Plan {
	const { git, live } = input;
	const flags = input.flags ?? {};
	const allowBranch = flags.allowBranch === true;
	const explicit = flags.researchOpen === 0 || flags.researchOpen === 1 ? flags.researchOpen : null;

	const refusals: string[] = [];
	const warnings: string[] = [];

	// Checked before the build on purpose: the build rewrites tracked generated
	// files, so a check after it would pass on a tree that was dirty at the start.
	if (!git.clean) {
		refusals.push('the tree has uncommitted changes; commit or stash them before deploying');
	}

	if (git.branch !== 'main') {
		const reason = `on branch ${git.branch}, not main`;
		if (allowBranch) warnings.push(`branch rule overridden with --allow-branch: ${reason}`);
		else refusals.push(`${reason}; deploy from main, or pass --allow-branch to record a deliberate exception`);
	}

	if (git.ahead !== 0 || git.behind !== 0) {
		const reason = `main is not equal to origin/main (${git.ahead} ahead, ${git.behind} behind)`;
		if (allowBranch) warnings.push(`sync rule overridden with --allow-branch: ${reason}`);
		else refusals.push(`${reason}; run git fetch origin main and merge before deploying`);
	}

	// An unreadable live state is treated as a reason to stop, not as closed:
	// guessing "closed" would deploy without the flag and close a fielding study.
	const unreadable = live.studies.filter((s) => s.accepting !== true && s.accepting !== false);
	if (live.error || unreadable.length > 0) {
		const what = live.error ?? unreadable.map((s) => s.slug).join(', ');
		if (explicit === null) {
			refusals.push(
				`the live study state could not be read (${what}); pass --research-open=1 or --research-open=0 to state it explicitly`
			);
		} else {
			warnings.push(`live study state could not be read (${what}); using --research-open=${explicit}`);
		}
	}

	let researchVar: Plan['researchVar'] = null;
	if (explicit === 1) {
		researchVar = 'RESEARCH_OPEN:1';
	} else if (explicit === 0) {
		researchVar = 'RESEARCH_OPEN:0';
		warnings.push(
			'WARNING: submissions will close. --research-open=0 deploys with RESEARCH_OPEN:0, so every study stops accepting answers.'
		);
	} else if (live.studies.some((s) => s.accepting !== false)) {
		// A study that is accepting, or one whose state was not read, keeps the gate open.
		researchVar = 'RESEARCH_OPEN:1';
	}

	return {
		ok: refusals.length === 0,
		refusals,
		warnings,
		allowBranch,
		researchVar,
		dryRun: argvFor(researchVar, true),
		deploy: argvFor(researchVar, false)
	};
}

/**
 * The dry-run output lists the vars the deploy would set. If the plan passes
 * RESEARCH_OPEN and the output does not name it, wrangler did not accept the
 * flag and the real run would close the study.
 */
export function checkDryRun(output: string, plan: Plan): string[] {
	const reasons: string[] = [];
	if (plan.researchVar) {
		if (!output.includes('RESEARCH_OPEN')) {
			reasons.push(`the dry-run output does not mention RESEARCH_OPEN; ${plan.researchVar} would not reach the Worker`);
		} else if (!output.includes(plan.researchVar)) {
			reasons.push(`the dry-run output does not carry ${plan.researchVar}; a different value would be deployed`);
		}
	}
	return reasons;
}

export type LocalBuild = {
	changelogNewest: ChangelogEntry | null;
	/** True when the deploy passes --research-open=0, so a study may close. */
	closingSubmissions?: boolean;
};

function entryKey(entry: ChangelogEntry | null): string {
	if (!entry) return '';
	return [entry.hash ?? '', entry.date ?? '', entry.subject ?? ''].join('|');
}

/**
 * What must be true after the deploy. Called with the live state read before
 * and after, plus the newest local changelog entry the build produced.
 */
export function verifyAfter(before: LiveState, after: LiveState, local: LocalBuild): string[] {
	const reasons: string[] = [];
	const afterBySlug = new Map(after.studies.map((s) => [s.slug, s]));

	for (const study of before.studies) {
		if (study.accepting !== true) continue;
		if (local.closingSubmissions) continue;
		const now = afterBySlug.get(study.slug);
		if (!now) {
			reasons.push(`study ${study.slug} was accepting before the deploy and is missing afterwards`);
		} else if (now.accepting !== true) {
			const state = now.accepting === null ? 'unreadable' : 'closed';
			reasons.push(`study ${study.slug} was accepting before the deploy and is ${state} afterwards`);
		}
	}

	if (after.error) {
		reasons.push(`the live state could not be read after the deploy: ${after.error}`);
	}

	if (!local.changelogNewest) {
		reasons.push('the build produced no changelog entry, so the live changelog cannot be matched');
	} else if (!after.changelogNewest) {
		reasons.push('the live changelog could not be read after the deploy');
	} else if (entryKey(after.changelogNewest) !== entryKey(local.changelogNewest)) {
		reasons.push(
			`the live changelog newest entry (${entryKey(after.changelogNewest)}) is not the build's newest entry (${entryKey(local.changelogNewest)})`
		);
	}

	return reasons;
}

// ---------------------------------------------------------------------------
// The runner. Everything above is pure; everything below reads a machine.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

type Options = {
	go: boolean;
	allowBranch: boolean;
	researchOpen: 0 | 1 | null;
	host: string;
	wait: number;
	help: boolean;
};

function parseArgs(argv: string[]): Options {
	const opts: Options = { go: false, allowBranch: false, researchOpen: null, host: DEFAULT_HOST, wait: 20, help: false };
	for (const arg of argv) {
		if (arg === '--go') opts.go = true;
		else if (arg === '--allow-branch') opts.allowBranch = true;
		else if (arg === '--research-open=1') opts.researchOpen = 1;
		else if (arg === '--research-open=0') opts.researchOpen = 0;
		else if (arg === '--help' || arg === '-h') opts.help = true;
		else if (arg.startsWith('--host=')) {
			const host = arg.slice('--host='.length).trim();
			if (!/^https?:\/\//.test(host)) throw new Error(`--host must start with http:// or https://, got ${host}`);
			opts.host = host;
		} else if (arg.startsWith('--wait=')) {
			const seconds = Number(arg.slice('--wait='.length));
			if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`--wait wants seconds, got ${arg}`);
			opts.wait = seconds;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	return opts;
}

const USAGE = `
  npm run deploy:dry                     rehearse: check, build, dry run, stop
  npm run deploy                         the same, then deploy and verify

  --allow-branch        deploy from a branch other than main, or with main
                        ahead or behind origin/main; the plan records it
  --research-open=1     force RESEARCH_OPEN:1 when the live state is unreadable
  --research-open=0     close submissions; prints a warning, then closes them
  --host=<origin>       read the live state from another origin
  --wait=<seconds>      wait between deploy and verification (default 20)
`;

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function gitState(): GitState {
	const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
	if (branch.status !== 0) throw new Error('this is not a git checkout, or git is not on PATH');
	// A stale origin/main would make an out-of-date checkout look current.
	const fetched = spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: ROOT, encoding: 'utf8' });
	if (fetched.status !== 0) throw new Error(`git fetch origin main failed: ${fetched.stderr.trim()}`);
	const status =spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
	if (status.status !== 0) throw new Error(`git status failed: ${status.stderr.trim()}`);
	const count = spawnSync('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD'], {
		cwd: ROOT,
		encoding: 'utf8'
	});
	if (count.status !== 0) throw new Error('origin/main is not known here; run git fetch origin main first');
	const [behind, ahead] = count.stdout.trim().split(/\s+/).map(Number);
	if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
		throw new Error(`could not read the ahead/behind count: ${count.stdout.trim()}`);
	}
	return { branch: branch.stdout.trim(), clean: status.stdout.trim() === '', ahead, behind };
}

async function jsonAt(url: string): Promise<unknown> {
	const res = await fetch(url, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(15000)
	});
	if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
	return res.json();
}

async function fetchLive(host: string): Promise<LiveState> {
	const base = host.replace(/\/$/, '');
	let studies: LiveStudy[] = [];
	let error: string | null = null;
	try {
		const list = (await jsonAt(`${base}/api/studies`)) as { studies?: unknown };
		const entries = Array.isArray(list.studies) ? list.studies : [];
		const slugs = entries
			.map((entry) =>
				entry && typeof entry === 'object' && typeof (entry as { slug?: unknown }).slug === 'string'
					? (entry as { slug: string }).slug
					: null
			)
			.filter((slug): slug is string => slug !== null);
		studies = await Promise.all(
			slugs.map(async (slug) => {
				try {
					const one = (await jsonAt(`${base}/api/studies/${encodeURIComponent(slug)}`)) as {
						study?: { accepting?: unknown };
					};
					const accepting =
						one.study && typeof one.study.accepting === 'boolean' ? one.study.accepting : null;
					return { slug, accepting };
				} catch {
					return { slug, accepting: null };
				}
			})
		);
	} catch (e) {
		error = message(e);
	}

	let changelogNewest: ChangelogEntry | null = null;
	try {
		const changelog = await jsonAt(`${base}/changelog.json`);
		if (Array.isArray(changelog) && changelog.length > 0 && changelog[0] && typeof changelog[0] === 'object') {
			changelogNewest = changelog[0] as ChangelogEntry;
		}
	} catch {
		changelogNewest = null;
	}

	return { studies, changelogNewest, error };
}

function localChangelog(): ChangelogEntry | null {
	for (const rel of ['build/changelog.json', 'static/changelog.json']) {
		const file = join(ROOT, rel);
		if (!existsSync(file)) continue;
		try {
			const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
			if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object') {
				return parsed[0] as ChangelogEntry;
			}
		} catch {
			continue;
		}
	}
	return null;
}

function say(text = ''): void {
	console.log(text);
}

function printLive(live: LiveState): void {
	say('  live state');
	if (live.error) say(`    unreadable: ${live.error}`);
	for (const study of live.studies) {
		const state = study.accepting === true ? 'accepting' : study.accepting === false ? 'closed' : 'unreadable';
		say(`    ${study.slug}: ${state}`);
	}
	say(
		`    changelog: ${
			live.changelogNewest
				? `${live.changelogNewest.hash ?? '?'} ${live.changelogNewest.date ?? ''} ${live.changelogNewest.subject ?? ''}`.trim()
				: 'unreadable'
		}`
	);
}

function run(argv: string[]): { status: number | null; output: string } {
	const result = spawnSync(argv[0], argv.slice(1), { cwd: ROOT, encoding: 'utf8' });
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	return { status: result.status, output };
}

async function main(argv: string[]): Promise<number> {
	let opts: Options;
	try {
		opts = parseArgs(argv);
	} catch (e) {
		console.error(`\n  ${message(e)}\n${USAGE}`);
		return 2;
	}
	if (opts.help) {
		say(`\n  one safe deploy, with a rehearsal by default\n${USAGE}`);
		return 0;
	}

	// Before the build: the build rewrites tracked generated files, so the
	// cleanliness check has to happen while the tree is still untouched.
	let git: GitState;
	try {
		git = gitState();
	} catch (e) {
		console.error(`\n  ${message(e)}\n`);
		return 2;
	}
	say(`\n  branch ${git.branch}, ${git.clean ? 'clean' : 'dirty'}, ${git.ahead} ahead, ${git.behind} behind origin/main`);

	const live = await fetchLive(opts.host);
	printLive(live);

	const plan = planDeploy({
		git,
		live,
		flags: { allowBranch: opts.allowBranch, researchOpen: opts.researchOpen }
	});

	say('\n  plan');
	for (const warning of plan.warnings) say(`    WARN  ${warning}`);
	for (const refusal of plan.refusals) say(`    STOP  ${refusal}`);
	say(`    dry run: ${plan.dryRun.join(' ')}`);
	say(`    deploy:  ${plan.deploy.join(' ')}`);

	if (!plan.ok) {
		say('\n  refusing to deploy. Nothing was built or uploaded.\n');
		return 1;
	}

	say('\n  building');
	const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
	if (build.status !== 0) {
		console.error(`\n  the build failed; nothing was uploaded\n`);
		return 1;
	}

	say(`\n  dry run: ${plan.dryRun.join(' ')}\n`);
	const dry = run(plan.dryRun);
	say(dry.output.trimEnd());
	if (dry.status !== 0) {
		console.error(`\n  the dry run failed; nothing was uploaded\n`);
		return 1;
	}
	const dryReasons = checkDryRun(dry.output, plan);
	if (dryReasons.length > 0) {
		for (const reason of dryReasons) console.error(`  STOP  ${reason}`);
		console.error('\n  the dry run did not show what the plan expects; nothing was uploaded\n');
		return 1;
	}

	if (!opts.go) {
		say('\n  rehearsal only. The dry run passed and nothing was uploaded.');
		say('  Run `npm run deploy` (or add --go) to deploy and verify.\n');
		return 0;
	}

	say(`\n  deploying: ${plan.deploy.join(' ')}\n`);
	const deployed = spawnSync(plan.deploy[0], plan.deploy.slice(1), { cwd: ROOT, stdio: 'inherit' });
	if (deployed.status !== 0) {
		console.error('\n  the deploy failed. Verify by hand before announcing anything.\n');
		return 1;
	}

	if (opts.wait > 0) {
		say(`\n  waiting ${opts.wait}s for the Worker to answer with the new build`);
		await new Promise((done) => setTimeout(done, opts.wait * 1000));
	}

	say('\n  verifying');
	const after = await fetchLive(opts.host);
	printLive(after);
	const reasons = verifyAfter(live, after, {
		changelogNewest: localChangelog(),
		closingSubmissions: plan.researchVar === 'RESEARCH_OPEN:0'
	});
	if (reasons.length > 0) {
		for (const reason of reasons) console.error(`  FAIL  ${reason}`);
		console.error('\n  the deploy does not match the plan. Do not announce the site until this is explained.\n');
		return 1;
	}

	say('\n  deployed and verified: no study closed, the live changelog is this build.');
	say('  Next, the public gate: node scripts/verify-deploy.cjs ' + opts.host + ' off\n');
	return 0;
}

const invokedDirectly = (() => {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
})();

if (invokedDirectly) {
	process.exitCode = await main(process.argv.slice(2));
}
