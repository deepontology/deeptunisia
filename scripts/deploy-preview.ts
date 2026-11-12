/**
 * The preview deploy command.
 *
 * A second Worker, `deeptunisia-preview`, serves the same built site on its
 * workers.dev address so a change can be looked at before it is live. This
 * script refuses to deploy anything that is not that Worker built from that
 * config: the file name, the Worker name inside it, and the absence of every
 * binding, variable and route are checked before wrangler is asked to run.
 *
 *   npm run deploy:preview:dry   check and print the command
 *   npm run deploy:preview       the same checks, then deploy
 *
 * The checks are pure functions so scripts/test-deploy-preview.ts can prove
 * them with no network and no wrangler binary. The argv names this config and
 * `--name` names the preview, so even a config edited between the check and the
 * upload cannot write the production Worker.
 *
 * The response header that keeps the address out of search results is not in
 * this config: Workers Assets takes custom headers only from a `_headers` file
 * in the assets directory. It is the last block of `static/_headers`, scoped to
 * workers.dev hosts, and the test beside this script fails if it is missing.
 * After the first real deploy, check the header on the printed address.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The only config a preview deploy may pass. */
export const PREVIEW_CONFIG = 'wrangler.preview.toml';
/** The only Worker a preview deploy may write. */
export const PREVIEW_WORKER = 'deeptunisia-preview';

/** The keys a preview config may declare, as `table.key` or a bare top key. */
const ALLOWED: ReadonlySet<string> = new Set([
	'name',
	'compatibility_date',
	'compatibility_flags',
	'workers_dev',
	'assets.directory',
	'assets.not_found_handling',
	'observability.enabled'
]);

/** Table headers a preview config may contain. */
const ALLOWED_TABLES: ReadonlySet<string> = new Set(['assets', 'observability']);

export type PreviewPlan = {
	ok: boolean;
	refusals: string[];
	/** The exact argv the script runs, or prints when it rehearses. */
	command: string[];
};

export type PreviewInput = {
	/** The config file about to be passed, as named on disk. */
	configFile: string;
	configText: string;
	buildExists: boolean;
};

type ConfigFacts = {
	name: string | null;
	/** The assets directory the config serves, quoted value removed. */
	directory: string | null;
	/** Table headers, brackets removed (`[assets]` gives `assets`). */
	tables: string[];
	/** Every key with the table it sits in (`assets.directory`), or bare. */
	paths: string[];
};

/** A `#` outside a quoted string starts a comment. */
function stripComment(line: string): string {
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quote) {
			if (ch === '\\' && quote === '"') i++;
			else if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === '#') {
			return line.slice(0, i);
		}
	}
	return line;
}

/** Net bracket depth of a value, so a multi-line array is one value, not keys. */
function bracketDelta(text: string): number {
	let depth = 0;
	let quote: string | null = null;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			if (ch === '\\' && quote === '"') i++;
			else if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === '[' || ch === '{') {
			depth++;
		} else if (ch === ']' || ch === '}') {
			depth--;
		}
	}
	return depth;
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' || first === "'") && last === first) return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * What a wrangler config declares: its tables and its keys, in order. Values
 * are not interpreted beyond `name`, because the checks are about shape.
 */
export function readConfig(text: string): ConfigFacts {
	const facts: ConfigFacts = { name: null, directory: null, tables: [], paths: [] };
	let table: string | null = null;
	let depth = 0;

	for (const raw of text.split(/\r?\n/)) {
		const line = stripComment(raw).trim();
		if (!line) continue;

		if (depth > 0) {
			depth += bracketDelta(line);
			continue;
		}

		if (line.startsWith('[')) {
			const array = line.startsWith('[[');
			const close = line.indexOf(array ? ']]' : ']');
			if (close === -1) continue;
			table = line.slice(array ? 2 : 1, close).trim();
			facts.tables.push(table);
			continue;
		}

		const equals = line.indexOf('=');
		if (equals === -1) continue;
		const key = unquote(line.slice(0, equals));
		const value = line.slice(equals + 1);
		const path = table === null ? key : `${table}.${key}`;
		facts.paths.push(path);
		if (path === 'name') facts.name = unquote(value);
		if (path === 'assets.directory') facts.directory = unquote(value);
		depth += bracketDelta(value);
	}

	return facts;
}

/** One refusal per rule, whichever of the table and its keys reports it first. */
function note(refusals: string[], refusal: string): void {
	if (!refusals.includes(refusal)) refusals.push(refusal);
}

/** The refusal for one forbidden key, or null when the path carries none. */
function forbiddenRefusal(path: string): string | null {
	const segments = path.split('.');
	const last = segments[segments.length - 1];
	if (segments.includes('d1_databases')) return 'the config contains a d1_databases block; the preview holds no data';
	if (segments.includes('vars')) return 'the config contains a vars block; the preview declares no variables';
	if (last === 'route' || last === 'routes') {
		return `the config declares ${path}; the preview lives on its workers.dev address only`;
	}
	if (segments.includes('kv_namespaces')) return 'the config contains a kv_namespaces block; the preview binds no storage';
	if (segments.includes('r2_buckets')) return 'the config contains a r2_buckets block; the preview binds no storage';
	if (last === 'main') return 'the config has a main entry; the preview serves static assets only';
	return null;
}

/**
 * Every reason not to pass this config to wrangler. Empty means the config is
 * the preview Worker's and nothing else.
 */
export function checkPreviewConfig(configFile: string, configText: string): string[] {
	const refusals: string[] = [];

	if (basename(configFile) !== PREVIEW_CONFIG) {
		refusals.push(
			`the config file is ${basename(configFile)}, not ${PREVIEW_CONFIG}; a preview deploy passes only that file`
		);
	}

	const facts = readConfig(configText);

	for (const table of facts.tables) {
		const refusal = forbiddenRefusal(table);
		if (refusal) note(refusals, refusal);
		else if (!ALLOWED_TABLES.has(table)) {
			note(refusals, `the config contains a ${table} table; this command allows only assets, and nothing else`);
		}
	}

	for (const path of facts.paths) {
		const refusal = forbiddenRefusal(path);
		if (refusal) {
			note(refusals, refusal);
		} else if (!ALLOWED.has(path)) {
			note(
				refusals,
				`the config declares ${path}; this command allows only name, compatibility, assets and observability`
			);
		}
	}

	if (facts.name === null) {
		refusals.push('the config names no Worker; wrangler would deploy under whatever name it finds');
	} else if (facts.name !== PREVIEW_WORKER) {
		refusals.push(
			`the config names ${facts.name}, not ${PREVIEW_WORKER}; this command must not be able to write the production Worker`
		);
	}

	if (facts.directory !== 'build') {
		refusals.push(
			`the config does not serve assets from build (${facts.directory ?? 'no assets.directory'}); the preview shows the built site and nothing else`
		);
	}

	return refusals;
}

/** The plan: the refusals, and the one argv a passing plan runs. */
export function planPreview(input: PreviewInput): PreviewPlan {
	const refusals = checkPreviewConfig(input.configFile, input.configText);
	if (!input.buildExists) {
		note(refusals, 'build/ is missing; run npm run build first, then deploy the preview');
	}
	return {
		ok: refusals.length === 0,
		refusals,
		command: ['wrangler', 'deploy', '--config', PREVIEW_CONFIG, '--name', PREVIEW_WORKER]
	};
}

/** The command as it is printed, so the rehearsal shows exactly what would run. */
export function formatCommand(argv: string[]): string {
	return argv.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ');
}

// ---------------------------------------------------------------------------
// The runner. Everything above is pure; everything below reads a machine.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CONFIG_PATH = join(ROOT, PREVIEW_CONFIG);

const USAGE = `
  npm run deploy:preview:dry             check and print the command
  npm run deploy:preview                 the same checks, then deploy

  --go          deploy after the checks pass; without it nothing is uploaded
  --help        this text
`;

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function say(text = ''): void {
	console.log(text);
}

function main(argv: string[]): number {
	const unknown = argv.filter((arg) => arg !== '--go' && arg !== '--help' && arg !== '-h');
	if (unknown.length > 0) {
		console.error(`\n  unknown argument ${unknown.join(' ')}\n${USAGE}`);
		return 2;
	}
	if (argv.includes('--help') || argv.includes('-h')) {
		say(`\n  the preview deploy, checked before anything is uploaded\n${USAGE}`);
		return 0;
	}

	let configText: string;
	try {
		configText = readFileSync(CONFIG_PATH, 'utf8');
	} catch (error) {
		console.error(`\n  cannot read ${PREVIEW_CONFIG}: ${message(error)}\n`);
		return 2;
	}

	const buildExists = existsSync(join(ROOT, 'build'));
	const plan = planPreview({ configFile: basename(CONFIG_PATH), configText, buildExists });

	say(`\n  config ${PREVIEW_CONFIG}`);
	say(`    assets: ${buildExists ? 'build/ exists' : 'build/ is missing'}`);
	say(`    name:   ${readConfig(configText).name ?? 'none'}`);

	say('\n  plan');
	for (const refusal of plan.refusals) say(`    STOP  ${refusal}`);
	say(`    command: ${formatCommand(plan.command)}`);

	if (!plan.ok) {
		say('\n  refusing to deploy. Nothing was checked against wrangler and nothing was uploaded.\n');
		return 1;
	}

	if (!argv.includes('--go')) {
		say('\n  rehearsal only. The checks passed and nothing was uploaded.');
		say('  Run `npm run deploy:preview` (or add --go) to deploy.\n');
		return 0;
	}

	say(`\n  deploying: ${formatCommand(plan.command)}\n`);
	const deployed = spawnSync(plan.command[0], plan.command.slice(1), { cwd: ROOT, stdio: 'inherit' });
	if (deployed.status !== 0) {
		console.error('\n  the deploy failed. The production Worker and its address were not touched.\n');
		return 1;
	}

	say('\n  deployed. The address wrangler printed above is the preview, not the site.\n');
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
	process.exitCode = main(process.argv.slice(2));
}
