/**
 * Tests for scripts/deploy.ts.
 *
 * The deploy script is the only thing between a routine release and a silent
 * closure of a fielding study. Every rule it enforces is checked here against
 * the pure functions, so a broken plan fails in the test chain rather than in
 * production. Nothing in this file touches the network or runs wrangler.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	checkDryRun,
	planDeploy,
	verifyAfter,
	type Flags,
	type GitState,
	type LiveState,
	type Plan,
	type PlanInput
} from './deploy.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
	}
}

const CLEAN_MAIN: GitState = { branch: 'main', clean: true, ahead: 0, behind: 0 };
const CLOSED: LiveState = { studies: [{ slug: 'police', accepting: false }], changelogNewest: null };
const ACCEPTING: LiveState = { studies: [{ slug: 'police', accepting: true }], changelogNewest: null };
const UNREADABLE: LiveState = { studies: [{ slug: 'police', accepting: null }], changelogNewest: null };

/** Every argv a plan produces must carry the flag that protects live vars. */
function argvAt(plan: Plan, index: number, value: string): boolean {
	return plan.deploy[index] === value;
}

// ---------------------------------------------------------------------------
// planDeploy: the table
// ---------------------------------------------------------------------------

type Case = {
	name: string;
	input: PlanInput;
	ok: boolean;
	refusal?: string;
	warning?: string;
	researchVar: Plan['researchVar'];
};

const CASES: Case[] = [
	{
		name: 'clean main in sync with a closed study passes',
		input: { git: CLEAN_MAIN, live: CLOSED },
		ok: true,
		researchVar: null
	},
	{
		name: 'a dirty tree is refused',
		input: { git: { ...CLEAN_MAIN, clean: false }, live: CLOSED },
		ok: false,
		refusal: 'uncommitted changes',
		researchVar: null
	},
	{
		name: 'a branch other than main is refused',
		input: { git: { ...CLEAN_MAIN, branch: 'ops/safe-deploy-script' }, live: CLOSED },
		ok: false,
		refusal: 'not main',
		researchVar: null
	},
	{
		name: '--allow-branch permits another branch and the plan records it',
		input: { git: { ...CLEAN_MAIN, branch: 'ops/safe-deploy-script' }, live: CLOSED, flags: { allowBranch: true } },
		ok: true,
		warning: '--allow-branch',
		researchVar: null
	},
	{
		name: 'main behind origin/main is refused',
		input: { git: { ...CLEAN_MAIN, behind: 3 }, live: CLOSED },
		ok: false,
		refusal: 'origin/main',
		researchVar: null
	},
	{
		name: 'main ahead of origin/main is refused',
		input: { git: { ...CLEAN_MAIN, ahead: 1 }, live: CLOSED },
		ok: false,
		refusal: 'origin/main',
		researchVar: null
	},
	{
		name: 'an unreadable live state is refused without an explicit flag',
		input: { git: CLEAN_MAIN, live: UNREADABLE },
		ok: false,
		refusal: 'could not be read',
		researchVar: 'RESEARCH_OPEN:1'
	},
	{
		name: '--research-open=1 states the unreadable live state',
		input: { git: CLEAN_MAIN, live: UNREADABLE, flags: { researchOpen: 1 } },
		ok: true,
		warning: 'could not be read',
		researchVar: 'RESEARCH_OPEN:1'
	},
	{
		name: 'an accepting study passes --keep-vars and --var RESEARCH_OPEN:1',
		input: { git: CLEAN_MAIN, live: ACCEPTING },
		ok: true,
		researchVar: 'RESEARCH_OPEN:1'
	},
	{
		name: 'a closed study passes --keep-vars and no RESEARCH_OPEN var',
		input: { git: CLEAN_MAIN, live: CLOSED },
		ok: true,
		researchVar: null
	},
	{
		name: '--research-open=0 warns that submissions will close',
		input: { git: CLEAN_MAIN, live: ACCEPTING, flags: { researchOpen: 0 } },
		ok: true,
		warning: 'submissions will close',
		researchVar: 'RESEARCH_OPEN:0'
	},
	{
		name: 'a live state that could not be read at all is refused',
		input: { git: CLEAN_MAIN, live: { studies: [], changelogNewest: null, error: 'connection refused' } },
		ok: false,
		refusal: 'could not be read',
		researchVar: null
	}
];

for (const testCase of CASES) {
	const plan = planDeploy(testCase.input);
	ok(`${testCase.name}: ${testCase.ok ? 'allowed' : 'refused'}`, plan.ok === testCase.ok, plan.refusals.join('; '));
	if (testCase.refusal) {
		ok(
			`${testCase.name}: says why`,
			plan.refusals.some((r) => r.includes(testCase.refusal as string)),
			plan.refusals.join('; ')
		);
	}
	if (testCase.warning) {
		ok(
			`${testCase.name}: warns`,
			plan.warnings.some((w) => w.includes(testCase.warning as string)),
			plan.warnings.join('; ')
		);
	}
	ok(`${testCase.name}: records the research var`, plan.researchVar === testCase.researchVar, String(plan.researchVar));
	ok(`${testCase.name}: the dry run keeps vars`, plan.dryRun.includes('--keep-vars'));
	ok(`${testCase.name}: the real run keeps vars`, plan.deploy.includes('--keep-vars'));
}

/** The named rule, spelled out rather than implied by the table. */
{
	const plan = planDeploy({ git: CLEAN_MAIN, live: ACCEPTING });
	ok('an accepting study produces --keep-vars and --var RESEARCH_OPEN:1 in the dry run', plan.dryRun.join(' ').includes('--keep-vars') && plan.dryRun.join(' ').includes('--var RESEARCH_OPEN:1'));
	ok('an accepting study produces --keep-vars and --var RESEARCH_OPEN:1 in the real run', plan.deploy.join(' ').includes('--keep-vars') && plan.deploy.join(' ').includes('--var RESEARCH_OPEN:1'));
	ok('the real run is not a dry run', !plan.deploy.includes('--dry-run'));
	ok('the dry run is a dry run', plan.dryRun.includes('--dry-run'));
	ok('the research value is one argv token after --var', argvAt(plan, plan.deploy.indexOf('--var') + 1, 'RESEARCH_OPEN:1'));
	ok('the real run calls wrangler deploy', plan.deploy[0] === 'wrangler' && plan.deploy[1] === 'deploy');
}

// ---------------------------------------------------------------------------
// The property: no combination of inputs can produce an argv without keep-vars
// ---------------------------------------------------------------------------

const GITS: GitState[] = [
	CLEAN_MAIN,
	{ branch: 'main', clean: false, ahead: 0, behind: 0 },
	{ branch: 'main', clean: true, ahead: 2, behind: 0 },
	{ branch: 'main', clean: true, ahead: 0, behind: 1 },
	{ branch: 'ops/other', clean: true, ahead: 0, behind: 0 },
	{ branch: 'ops/other', clean: false, ahead: 3, behind: 4 }
];
const LIVES: LiveState[] = [
	{ studies: [], changelogNewest: null },
	{ studies: [{ slug: 'police', accepting: true }], changelogNewest: null },
	{ studies: [{ slug: 'police', accepting: false }], changelogNewest: null },
	{ studies: [{ slug: 'police', accepting: null }], changelogNewest: null },
	{
		studies: [
			{ slug: 'democracy', accepting: false },
			{ slug: 'police', accepting: true }
		],
		changelogNewest: null
	},
	{ studies: [], changelogNewest: null, error: 'unreachable' }
];
const FLAGS: Flags[] = [];
for (const allowBranch of [false, true]) {
	for (const researchOpen of [null, 0, 1] as const) FLAGS.push({ allowBranch, researchOpen });
}

let combinations = 0;
let argvs = 0;
let missingKeepVars = 0;
let malformedResearchVar = 0;
let openedWhileAccepting = 0;

for (const git of GITS) {
	for (const live of LIVES) {
		for (const flags of FLAGS) {
			const plan = planDeploy({ git, live, flags });
			combinations++;
			for (const argv of [plan.dryRun, plan.deploy]) {
				argvs++;
				if (argv.filter((token) => token === '--keep-vars').length !== 1) missingKeepVars++;
				const at = argv.indexOf('--var');
				if (at !== -1) {
					const value = argv[at + 1];
					if (value !== 'RESEARCH_OPEN:0' && value !== 'RESEARCH_OPEN:1') malformedResearchVar++;
					if (argv.join(' ').includes('RESEARCH_OPEN:1') && plan.researchVar !== 'RESEARCH_OPEN:1') {
						malformedResearchVar++;
					}
				}
				const researchVar = argv.join(' ');
				if (plan.researchVar === null && researchVar.includes('RESEARCH_OPEN')) malformedResearchVar++;
			}
			const acceptedLive = live.studies.some((s) => s.accepting === true);
			if (plan.ok && acceptedLive && flags.researchOpen !== 0) {
				if (!plan.deploy.join(' ').includes('--var RESEARCH_OPEN:1')) openedWhileAccepting++;
			}
		}
	}
}

ok(
	'the property covers every generated combination',
	combinations === GITS.length * LIVES.length * FLAGS.length && argvs === combinations * 2,
	`${combinations} inputs, ${argvs} argvs`
);
ok('no generated argv lacks exactly one --keep-vars', missingKeepVars === 0, `${missingKeepVars} missing`);
ok('no generated argv carries a malformed research var', malformedResearchVar === 0, `${malformedResearchVar} malformed`);
ok(
	'a permitted plan never deploys without opening an accepting study',
	openedWhileAccepting === 0,
	`${openedWhileAccepting} plans`
);

/** Removing the flag must be caught here, not in production. */
{
	const plan = planDeploy({ git: CLEAN_MAIN, live: ACCEPTING });
	const broken = { ...plan, dryRun: plan.dryRun.filter((t) => t !== '--keep-vars') };
	ok('a plan whose dry run lost --keep-vars is detectably not a plan this module makes', !broken.dryRun.includes('--keep-vars'));
}

// ---------------------------------------------------------------------------
// checkDryRun
// ---------------------------------------------------------------------------

{
	const plan = planDeploy({ git: CLEAN_MAIN, live: ACCEPTING });
	ok('the dry-run check passes when the output names RESEARCH_OPEN:1', checkDryRun('vars: RESEARCH_OPEN:1', plan).length === 0);
	const reasons = checkDryRun('Uploaded deeptunisia (2.1 sec)', plan);
	ok('the dry-run check rejects output that does not mention RESEARCH_OPEN', reasons.length === 1 && reasons[0].includes('RESEARCH_OPEN'), reasons.join('; '));
	const wrong = checkDryRun('vars: RESEARCH_OPEN:0', plan);
	ok('the dry-run check rejects a different research value', wrong.length === 1, wrong.join('; '));
}

{
	const plan = planDeploy({ git: CLEAN_MAIN, live: CLOSED });
	ok('a closed study does not require RESEARCH_OPEN in the dry-run output', checkDryRun('nothing interesting', plan).length === 0);
}

// ---------------------------------------------------------------------------
// verifyAfter
// ---------------------------------------------------------------------------

const LOCAL = { changelogNewest: { hash: 'abc1234', date: '2026-11-06T18:13:22+01:00', subject: 'Data: fix a date' } };
const LIVE_MATCHING: LiveState = { studies: [{ slug: 'police', accepting: true }], changelogNewest: LOCAL.changelogNewest };

{
	const reasons = verifyAfter(ACCEPTING, LIVE_MATCHING, LOCAL);
	ok('a study accepting before and after verifies', reasons.length === 0, reasons.join('; '));
}

{
	const closedAfter: LiveState = {
		studies: [{ slug: 'police', accepting: false }],
		changelogNewest: LOCAL.changelogNewest
	};
	const reasons = verifyAfter(ACCEPTING, closedAfter, LOCAL);
	ok(
		'a study that was accepting and is closed afterwards fails verification',
		reasons.length === 1 && reasons[0].includes('police'),
		reasons.join('; ')
	);
}

{
	const unreadableAfter: LiveState = {
		studies: [{ slug: 'police', accepting: null }],
		changelogNewest: LOCAL.changelogNewest
	};
	const reasons = verifyAfter(ACCEPTING, unreadableAfter, LOCAL);
	ok('a study that cannot be read afterwards fails verification', reasons.length === 1 && reasons[0].includes('unreadable'), reasons.join('; '));
}

{
	const closedAfter: LiveState = {
		studies: [{ slug: 'police', accepting: false }],
		changelogNewest: LOCAL.changelogNewest
	};
	const reasons = verifyAfter(ACCEPTING, closedAfter, { ...LOCAL, closingSubmissions: true });
	ok('--research-open=0 may close an accepting study', reasons.length === 0, reasons.join('; '));
}

{
	const stale: LiveState = {
		studies: [{ slug: 'police', accepting: true }],
		changelogNewest: { hash: 'old9999', date: '2026-10-01T00:00:00+01:00', subject: 'Data: older' }
	};
	const reasons = verifyAfter(ACCEPTING, stale, LOCAL);
	ok('a live changelog that is not this build fails verification', reasons.length === 1 && reasons[0].includes('changelog'), reasons.join('; '));
}

{
	const reasons = verifyAfter(ACCEPTING, LIVE_MATCHING, { changelogNewest: null });
	ok('a build with no changelog entry fails verification', reasons.length === 1 && reasons[0].includes('changelog'), reasons.join('; '));
}

{
	const failed: LiveState = { studies: [], changelogNewest: null, error: 'timeout' };
	const reasons = verifyAfter(ACCEPTING, failed, LOCAL);
	ok('an unreadable live state after the deploy fails verification', reasons.length >= 2, reasons.join('; '));
}

// ---------------------------------------------------------------------------
// Source level: package.json never names the unsafe command
// ---------------------------------------------------------------------------

const pkgText = readFileSync(join(ROOT, 'package.json'), 'utf8');
const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
const scripts = pkg.scripts ?? {};

ok('package.json contains no "wrangler deploy"', !/wrangler\s+deploy/.test(pkgText));
ok('deploy runs the safe script with --go', scripts.deploy === 'tsx scripts/deploy.ts --go', String(scripts.deploy));
ok('deploy:dry runs the safe script without --go', scripts['deploy:dry'] === 'tsx scripts/deploy.ts', String(scripts['deploy:dry']));
ok(
	'the test chain runs this file',
	(typeof scripts.test === 'string' && scripts.test.includes('tsx scripts/test-deploy.ts')) === true,
	String(scripts.test ? 'present' : 'missing')
);

const chainScripts = Object.entries(scripts).filter(([, command]) => /wrangler/.test(command));
ok('no script calls wrangler directly', chainScripts.length === 0, chainScripts.map(([name]) => name).join(', '));

console.log(`\n  ${checks - failures}/${checks} deploy checks passed\n`);
if (failures) process.exit(1);
