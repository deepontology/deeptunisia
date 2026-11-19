/**
 * Tests for scripts/deploy-preview.ts.
 *
 * The preview deploy is the one command that uploads the site to a Worker other
 * than production. If it ever passed the production config, or a config with a
 * database, a variable or a route, the preview would stop being a copy of the
 * site and nothing would say so. Every refusal is proven here with a temporary
 * config file, so a rule that stops working fails the test chain rather than a
 * deploy. Nothing in this file touches the network or runs wrangler.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	PREVIEW_CONFIG,
	PREVIEW_WORKER,
	formatCommand,
	planPreview,
	readConfig,
	type PreviewPlan
} from './deploy-preview.ts';
import {
	STAMP_FILE,
	gitFacts,
	parseStamp,
	renderStamp,
	stampRefusals,
	type BuildStamp
} from './build-stamp.ts';

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

const DIR = mkdtempSync(join(tmpdir(), 'dt-preview-'));

function configFile(name: string, text: string): string {
	const path = join(DIR, name);
	writeFileSync(path, text);
	return path;
}

/** A config that is the preview Worker and nothing else. */
const VALID = `name = "${PREVIEW_WORKER}"
compatibility_date = "2026-07-29"
workers_dev = true

[assets]
directory = "build"
not_found_handling = "404-page"
`;

function withLine(extra: string): string {
	return `${VALID}\n${extra}\n`;
}

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

/** A stamp for the commit checked out now, from a clean tree. */
const GOOD_STAMP: BuildStamp = { commit: HEAD, clean: true };

function refusalsOf(
	text: string,
	file = PREVIEW_CONFIG,
	buildExists = true,
	stamp: BuildStamp | null = GOOD_STAMP,
	head = HEAD,
	treeClean = true
): PreviewPlan {
	return planPreview({ configFile: file, configText: text, buildExists, stamp, head, treeClean });
}

/** True when exactly one refusal was produced and it names this thing. */
function onlyRefusal(plan: PreviewPlan, fragment: string): boolean {
	return plan.refusals.length === 1 && plan.refusals[0].includes(fragment);
}

// ---------------------------------------------------------------------------
// The refusals, each with a temporary config file
// ---------------------------------------------------------------------------

type Case = {
	name: string;
	file?: string;
	text: string;
	buildExists?: boolean;
	fragment: string;
	/** The case is expected to be the only reason for refusal. */
	only?: boolean;
};

const CASES: Case[] = [
	{
		name: 'a config named for another Worker is refused',
		text: VALID.replace(PREVIEW_WORKER, 'deeptunisia'),
		fragment: `not ${PREVIEW_WORKER}`,
		only: true
	},
	{
		name: 'a config with no name is refused',
		text: VALID.replace(/^name = .*\n/m, ''),
		fragment: 'names no Worker',
		only: true
	},
	{
		name: 'a config file that is not wrangler.preview.toml is refused',
		file: 'wrangler.toml',
		text: VALID,
		fragment: `not ${PREVIEW_CONFIG}`
	},
	{
		name: 'a d1_databases block is refused',
		text: withLine('[[d1_databases]]\nbinding = "DB"\ndatabase_name = "deeptunisia-db"'),
		fragment: 'the preview holds no data',
		only: true
	},
	{
		name: 'a vars block is refused',
		text: withLine('[vars]\nCOMMUNITY_MODE = "off"'),
		fragment: 'the preview declares no variables',
		only: true
	},
	{
		name: 'an empty vars block is refused too',
		text: withLine('[vars]'),
		fragment: 'the preview declares no variables',
		only: true
	},
	{
		name: 'a routes array is refused',
		text: withLine('routes = [\n  "preview.example.org/*",\n  "www.preview.example.org/*"\n]'),
		fragment: 'workers.dev address only',
		only: true
	},
	{
		name: 'a single route is refused',
		text: withLine('route = "preview.example.org/*"'),
		fragment: 'workers.dev address only',
		only: true
	},
	{
		name: 'a kv_namespaces block is refused',
		text: withLine('[[kv_namespaces]]\nbinding = "KV"\nid = "example"'),
		fragment: 'the preview binds no storage',
		only: true
	},
	{
		name: 'an r2_buckets block is refused',
		text: withLine('[[r2_buckets]]\nbinding = "BUCKET"\nbucket_name = "example"'),
		fragment: 'the preview binds no storage',
		only: true
	},
	{
		name: 'a main script is refused',
		text: VALID.replace('workers_dev = true\n', 'workers_dev = true\nmain = "community/worker.ts"\n'),
		fragment: 'static assets only',
		only: true
	},
	{
		name: 'a table this command does not allow is refused',
		text: withLine('[durable_objects]\nbindings = []'),
		fragment: 'allows only assets'
	},
	{
		name: 'a key this command does not allow is refused',
		text: VALID.replace('workers_dev = true\n', 'workers_dev = true\nsend_email = []\n'),
		fragment: 'allows only'
	},
	{
		name: 'assets served from another directory are refused',
		text: VALID.replace('directory = "build"', 'directory = "public"'),
		fragment: 'does not serve assets from build',
		only: true
	},
	{
		name: 'a config with no assets directory is refused',
		text: VALID.replace(/\n\[assets\][\s\S]*$/, '\n'),
		fragment: 'no assets.directory',
		only: true
	},
	{
		name: 'a missing build/ is refused',
		text: VALID,
		buildExists: false,
		fragment: 'build/ is missing',
		only: true
	}
];

for (const testCase of CASES) {
	const file = configFile(testCase.file ?? PREVIEW_CONFIG, testCase.text);
	const plan = refusalsOf(readFileSync(file, 'utf8'), basename(file), testCase.buildExists ?? true);
	ok(`${testCase.name}: refused`, !plan.ok);
	ok(
		`${testCase.name}: says why`,
		plan.refusals.some((r) => r.includes(testCase.fragment)),
		plan.refusals.join('; ')
	);
	if (testCase.only) {
		ok(`${testCase.name}: nothing else is wrong with it`, onlyRefusal(plan, testCase.fragment), plan.refusals.join('; '));
	}
}

// ---------------------------------------------------------------------------
// The build must be the commit being deployed
// ---------------------------------------------------------------------------

{
	const good = refusalsOf(VALID);
	ok('a build stamped with HEAD from a clean tree passes', good.ok, good.refusals.join('; '));

	const stale = refusalsOf(VALID, PREVIEW_CONFIG, true, { commit: OTHER, clean: true });
	ok('a build made from another commit is refused', !stale.ok);
	ok('the refusal names both commits', onlyRefusal(stale, `${OTHER.slice(0, 7)} but HEAD is ${HEAD.slice(0, 7)}`), stale.refusals.join('; '));
	ok('the refusal says to build again', stale.refusals[0]?.includes('npm run build') === true);
	ok('a stale build gives no command to run', stale.command.length === 0 || !stale.ok);

	const unstamped = refusalsOf(VALID, PREVIEW_CONFIG, true, null);
	ok('a build with no stamp is refused', onlyRefusal(unstamped, 'no build stamp'), unstamped.refusals.join('; '));

	const dirtyBuild = refusalsOf(VALID, PREVIEW_CONFIG, true, { commit: HEAD, clean: false });
	ok('a build made from a dirty tree is refused', onlyRefusal(dirtyBuild, 'uncommitted changes'), dirtyBuild.refusals.join('; '));

	const dirtyNow = refusalsOf(VALID, PREVIEW_CONFIG, true, GOOD_STAMP, HEAD, false);
	ok('a dirty tree now is refused even with a good stamp', onlyRefusal(dirtyNow, 'the working tree has uncommitted changes'), dirtyNow.refusals.join('; '));

	const both = refusalsOf(VALID, PREVIEW_CONFIG, true, { commit: OTHER, clean: false }, HEAD, false);
	ok('every stamp reason is reported, not only the first', both.refusals.length === 3, both.refusals.join('; '));

	// The stamp does not replace the other guards: the production config with a
	// perfect stamp is still refused, and a missing build is one refusal, not two.
	const production = refusalsOf(readFileSync(join(ROOT, 'wrangler.toml'), 'utf8'), 'wrangler.toml');
	ok('a good stamp does not rescue the production config', !production.ok && production.refusals.some((r) => r.includes('deeptunisia-preview')));
	const missing = refusalsOf(VALID, PREVIEW_CONFIG, false, null);
	ok('a missing build/ is one refusal, not a missing stamp as well', onlyRefusal(missing, 'build/ is missing'), missing.refusals.join('; '));

	// The stamp file's text.
	ok('a stamp round-trips through its file text', JSON.stringify(parseStamp(renderStamp(GOOD_STAMP))) === JSON.stringify(GOOD_STAMP));
	ok('no text is no stamp', parseStamp(null) === null);
	ok('text that is not JSON is no stamp', parseStamp('not json') === null);
	ok('a stamp with a short commit is no stamp', parseStamp('{"commit":"abc1234","clean":true}') === null);
	ok('a stamp with no clean flag is no stamp', parseStamp(`{"commit":"${HEAD}"}`) === null);
	ok('a stamp whose flag is a string is no stamp', parseStamp(`{"commit":"${HEAD}","clean":"yes"}`) === null);
	ok('stampRefusals agrees with the plan', stampRefusals(GOOD_STAMP, HEAD, true).length === 0 && stampRefusals(null, HEAD, true).length === 1);
}

// The same check on a real repository: a build stamped at one commit stops
// passing the moment HEAD moves, and a tracked edit makes the tree dirty.
{
	const repo = mkdtempSync(join(DIR, 'repo-'));
	const run = (...args: string[]) => {
		const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
		return result.status === 0 ? result.stdout.trim() : null;
	};
	const configured =
		run('init', '-q') !== null &&
		run('config', 'user.email', 'test@example.org') !== null &&
		run('config', 'user.name', 'Test') !== null &&
		run('config', 'commit.gpgsign', 'false') !== null;
	ok('a scratch repository can be made', configured);
	if (configured) {
		writeFileSync(join(repo, 'file.txt'), 'one\n');
		run('add', 'file.txt');
		run('commit', '-q', '-m', 'first');
		const first = gitFacts(repo);
		ok('a clean repository reports its HEAD and a clean tree', !!first && /^[0-9a-f]{40}$/.test(first.head) && first.clean);
		const stamp: BuildStamp = { commit: first!.head, clean: first!.clean };
		ok('the stamp passes at the commit it was made at', stampRefusals(stamp, first!.head, first!.clean).length === 0);

		writeFileSync(join(repo, 'file.txt'), 'two\n');
		const edited = gitFacts(repo);
		ok('a tracked edit makes the tree dirty', !!edited && !edited.clean);
		ok('the same stamp is refused over a dirty tree', stampRefusals(stamp, edited!.head, edited!.clean).length === 1);

		run('commit', '-q', '-am', 'second');
		const second = gitFacts(repo);
		ok('a new commit moves HEAD', !!second && second.head !== first!.head && second.clean);
		const refused = stampRefusals(stamp, second!.head, second!.clean);
		ok('the old stamp is refused at the new commit', refused.length === 1 && refused[0].includes(first!.head.slice(0, 7)), refused.join('; '));

		writeFileSync(join(repo, 'untracked.txt'), 'x');
		ok('an untracked file does not make the tree dirty (build outputs are ignored files)', gitFacts(repo)!.clean);
	}
	ok('outside a git checkout there are no facts', gitFacts(DIR) === null);
}

// ---------------------------------------------------------------------------
// The configs that exist
// ---------------------------------------------------------------------------

{
	const text = readFileSync(join(ROOT, PREVIEW_CONFIG), 'utf8');
	const plan = refusalsOf(text);
	ok('the committed preview config passes every check', plan.ok, plan.refusals.join('; '));
	ok('the committed preview config names the preview Worker', readConfig(text).name === PREVIEW_WORKER);
	ok('the committed preview config serves build/', readConfig(text).directory === 'build');
	ok(
		'the committed preview config declares no database, variable or route',
		!/(d1_databases|kv_namespaces|r2_buckets|\[vars\]|routes?\s*=|\bmain\s*=)/.test(text),
		'the shape check above is the proof; this is a second reader'
	);
}

{
	const text = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
	const plan = refusalsOf(text, 'wrangler.toml');
	ok('the production config is refused', !plan.ok, `${plan.refusals.length} refusals`);
	ok('the production config is refused for its name', plan.refusals.some((r) => r.includes('deeptunisia-preview')));
	ok('the production config is refused for its database', plan.refusals.some((r) => r.includes('d1_databases')));
	ok(
		'the production config is refused for its variables',
		plan.refusals.some((r) => r.includes('the preview declares no variables'))
	);
	ok('the production config is refused for its Worker script', plan.refusals.some((r) => r.includes('main entry')));
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

{
	const plan = refusalsOf(VALID);
	const printed = formatCommand(plan.command);
	ok('a passing plan runs wrangler deploy', plan.command[0] === 'wrangler' && plan.command[1] === 'deploy');
	ok('the command names wrangler.preview.toml', plan.command.includes(PREVIEW_CONFIG), printed);
	ok(
		'the command never names wrangler.toml',
		!plan.command.some((arg) => basename(arg) === 'wrangler.toml'),
		printed
	);
	ok('the printed command never names wrangler.toml', !printed.split(/\s+/).includes('wrangler.toml'), printed);
	ok(
		'the command names the preview Worker as well as the file',
		plan.command[plan.command.indexOf('--name') + 1] === PREVIEW_WORKER,
		printed
	);
	ok('the printed command is the argv in order', printed === 'wrangler deploy --config wrangler.preview.toml --name deeptunisia-preview');
}

// ---------------------------------------------------------------------------
// The parser: what it must not miss
// ---------------------------------------------------------------------------

{
	const facts = readConfig(`# a comment with = and [brackets] inside it
name = "${PREVIEW_WORKER}" # trailing comment

[[d1_databases]]
binding = "DB"

[assets]
directory = "build"
`);
	ok('a comment line declares nothing', facts.paths[0] === 'name', facts.paths.join(', '));
	ok('a trailing comment does not reach the value', facts.name === PREVIEW_WORKER, String(facts.name));
	ok('a [[table]] is recorded as a table', facts.tables.includes('d1_databases'), facts.tables.join(', '));
	ok('a key inside a table carries the table', facts.paths.includes('d1_databases.binding'), facts.paths.join(', '));
	ok('the assets directory is read as a value', facts.directory === 'build', String(facts.directory));
}

{
	const facts = readConfig('routes = [\n  "a.example/*",\n]\nvars = { A = "1" }\n');
	ok('a multi-line array does not become keys', !facts.paths.includes('"a.example/*"'), facts.paths.join(', '));
	ok('a multi-line array is one key', facts.paths.filter((p) => p === 'routes').length === 1, facts.paths.join(', '));
	ok('an inline table is one key', facts.paths.includes('vars'), facts.paths.join(', '));
}

/** The property: no forbidden fragment can slip through in a valid config. */
{
	const fragments = [
		'[[d1_databases]]',
		'[[kv_namespaces]]',
		'[[r2_buckets]]',
		'[vars]',
		'routes = ["x"]',
		'route = "x"',
		'main = "x.ts"',
		'[env.production]',
		'[[queues.producers]]'
	];
	let slipped = 0;
	for (const fragment of fragments) {
		const plan = refusalsOf(withLine(fragment));
		if (plan.ok) {
			slipped++;
			console.error(`  slipped: ${fragment}`);
		}
	}
	ok('every forbidden fragment makes the config refused', slipped === 0, `${slipped} slipped`);
}

// ---------------------------------------------------------------------------
// Source level: the scripts exist and the test chain runs this file
// ---------------------------------------------------------------------------

{
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
		scripts?: Record<string, string>;
	};
	const scripts = pkg.scripts ?? {};
	ok('deploy:preview runs the checked script', scripts['deploy:preview'] === 'tsx scripts/deploy-preview.ts --go', String(scripts['deploy:preview']));
	ok('deploy:preview:dry runs the checked script without --go', scripts['deploy:preview:dry'] === 'tsx scripts/deploy-preview.ts', String(scripts['deploy:preview:dry']));
	ok('the dry command comes before the real one in name and in risk', !String(scripts['deploy:preview:dry']).includes('--go'));
	ok('the test chain runs this file', typeof scripts.test === 'string' && scripts.test.includes('tsx scripts/test-deploy-preview.ts'));
	const build = String(scripts.build);
	ok('the build clears the stamp before it starts', build.startsWith('tsx scripts/build-stamp.ts --clear && '), build);
	ok('the build writes the stamp last, after every output exists', build.endsWith(' && tsx scripts/build-stamp.ts'), build);
	ok('the stamp is the last step and appears once as a write', build.split('tsx scripts/build-stamp.ts').length === 3, build);
	ok('the stamp file is ignored by git', readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).includes(STAMP_FILE));
	ok('the stamp is not inside build/, so it is never uploaded', !STAMP_FILE.includes('/') && !existsSync(join(ROOT, 'build', STAMP_FILE)));
	ok('no preview script calls wrangler directly', !/wrangler/.test(String(scripts['deploy:preview'])) && !/wrangler/.test(String(scripts['deploy:preview:dry'])));
}

// The preview is only safe to deploy while the shared headers file keeps every
// workers.dev address out of search results, and only those addresses.
{
	const lines = readFileSync(join(ROOT, 'static', '_headers'), 'utf8').split(/\r?\n/);
	const blocks: { selector: string; headers: string[] }[] = [];
	for (const line of lines) {
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		if (/^\s/.test(line)) blocks[blocks.length - 1]?.headers.push(line.trim().toLowerCase());
		else blocks.push({ selector: line.trim(), headers: [] });
	}
	const robots = blocks.filter((b) => b.headers.some((h) => h.startsWith('x-robots-tag:')));
	ok(
		'exactly one block of static/_headers sets X-Robots-Tag',
		robots.length === 1,
		robots.map((b) => b.selector).join(', ') || '(none)'
	);
	const block = robots[0];
	ok(
		'that block is scoped to workers.dev hosts and to nothing else',
		!!block && /^https:\/\/(:[a-z]+\.)+workers\.dev\/\*$/.test(block.selector),
		block?.selector ?? '(none)'
	);
	ok(
		'it says noindex and nofollow',
		!!block && block.headers.some((h) => /^x-robots-tag:\s*noindex,\s*nofollow$/.test(h)),
		block?.headers.join(' | ') ?? '(none)'
	);
	ok(
		'no block that reaches deeptunisia.org sets X-Robots-Tag',
		!blocks.some((b) => !b.selector.startsWith('https://') && b.headers.some((h) => h.startsWith('x-robots-tag:')))
	);
}

rmSync(DIR, { recursive: true, force: true });

console.log(`\n  ${checks - failures}/${checks} preview deploy checks passed\n`);
if (failures) process.exit(1);
