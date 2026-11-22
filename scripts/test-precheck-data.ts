/**
 * The shipped pre-check: it covers every source id, and the figures the build
 * publishes are the ones in the file.
 *
 * Two separate concerns, both over data rather than code:
 *
 *   1. coverage. Every line of the newest dated file names a source that exists
 *      and no source is named twice. A source added after the run has no line;
 *      those are counted and published, and may be at most 5% of the sources.
 *   2. the published numbers. `src/generated/stats.json` is recounted here from
 *      the JSONL by this file's own code, so a build that miscounts cannot agree
 *      with a test that asks the build to count again.
 *
 * Usage: `npx tsx scripts/test-precheck-data.ts`
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { precheckStats } from './desk.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PRECHECK_DIR = join(ROOT, 'research', 'desk', 'precheck');

interface Line {
	id: string;
	url: string;
	status: string;
	http: number | null;
	snapshot_url: string | null;
	excerpt: string;
}

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	}
}

console.log('\n  -- the shipped pre-check --\n');

const files = existsSync(PRECHECK_DIR)
	? readdirSync(PRECHECK_DIR)
			.filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
			.sort()
	: [];
ok('a dated pre-check file exists', files.length > 0, files[files.length - 1] ?? 'none');

const name = files[files.length - 1] ?? '';
const lines: Line[] = name
	? readFileSync(join(PRECHECK_DIR, name), 'utf8')
			.split('\n')
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line) as Line)
	: [];

// --- Coverage ---------------------------------------------------------------

let newerCount = 0;

{
	const sources = (existsSync(join(ROOT, 'data', 'sources.yaml'))
		? parseYaml(readFileSync(join(ROOT, 'data', 'sources.yaml'), 'utf8'))
		: []) as { id: string; added?: string }[];
	const wanted = new Set(sources.map((s) => s.id));
	const seen = new Set<string>();
	const repeated: string[] = [];
	for (const line of lines) {
		if (seen.has(line.id)) repeated.push(line.id);
		seen.add(line.id);
	}

	// A source added after the run has no line yet. The data carries no date
	// for when a source was added, so the allowance is a count, not a date: the
	// sources the run did not see are published as `precheckNewer`, and they may
	// be at most 5% of the sources. A run that missed more than that is stale
	// and fails here, so the published block cannot drift far from the data.
	const missing = sources.filter((s) => !seen.has(s.id)).map((s) => s.id);
	newerCount = missing.length;
	const unknown = [...seen].filter((id) => !wanted.has(id));
	const allowed = Math.ceil(sources.length * 0.05);

	ok(
		'the run names almost every source id, once',
		missing.length <= allowed,
		`${seen.size} ids, ${lines.length} lines, ${missing.length} added since the run (limit ${allowed})`
	);
	ok(
		'every line names a source id that exists',
		unknown.length === 0,
		unknown.length ? `${unknown.length} unknown, first: ${unknown.slice(0, 10).join(', ')}` : `${lines.length} lines`
	);
	ok(
		'no source id is recorded twice',
		repeated.length === 0,
		repeated.length ? `${repeated.length} repeated, first: ${repeated.slice(0, 10).join(', ')}` : `${lines.length} distinct ids`
	);
}

// --- The published figures, recounted here ----------------------------------

{
	const count = (test: (line: Line) => boolean) => lines.filter(test).length;
	// Written out again rather than shared with the build: two independent
	// derivations from one file are what makes an agreement mean something.
	const expected: Record<string, string> = {
		precheckDate: name.replace(/\.jsonl$/, ''),
		precheckSources: String(lines.length),
		precheckAlive: String(
			lines.filter((line) => line.status === 'alive' || line.status === 'redirected').length
		),
		precheckDead: String(count((line) => line.status === 'dead')),
		precheckUncheckable: String(
			lines.filter((line) => line.status === 'blocked' || line.status === 'timeout').length
		),
		precheckSnapshot: String(count((line) => line.snapshot_url !== null && line.snapshot_url !== '')),
		precheckWithExcerpt: String(count((line) => line.excerpt !== 'no-excerpt')),
		precheckNewer: String(newerCount),
		precheckExcerptFound: String(
			lines.filter((line) => line.excerpt === 'found-live' || line.excerpt === 'found-snapshot').length
		)
	};

	const statsPath = join(ROOT, 'src', 'generated', 'stats.json');
	const published = existsSync(statsPath)
		? (JSON.parse(readFileSync(statsPath, 'utf8')) as Record<string, string>)
		: {};
	for (const [key, value] of Object.entries(expected)) {
		ok(
			`the published ${key} is the file's own count`,
			published[key] === value,
			`published ${JSON.stringify(published[key])}, file ${JSON.stringify(value)}`
		);
	}
}

// --- Sources newer than the run ---------------------------------------------

{
	const row = (id: string) =>
		JSON.stringify({ id, url: 'https://example.org/' + id, status: 'alive', http: 200, final_url: null, snapshot_url: null, snapshot_timestamp: null, excerpt: 'no-excerpt' });
	const text = [row('a'), row('b')].join('\n') + '\n';
	const stats = precheckStats('2026-01-01.jsonl', text, ['a', 'b', 'c', 'd']);
	ok('two sources the run never named are counted as newer', stats.newer === '2', `newer ${JSON.stringify(stats.newer)}`);
	ok('with no source list the newer count is empty, not zero', precheckStats('2026-01-01.jsonl', text).newer === '');
}

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
