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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function refusalsOf(text: string, file = PREVIEW_CONFIG, buildExists = true): PreviewPlan {
	return planPreview({ configFile: file, configText: text, buildExists });
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
