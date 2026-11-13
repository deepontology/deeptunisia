/**
 * The shipped pre-check: it covers every source id, and the figures the build
 * publishes are the ones in the file.
 *
 * Two separate concerns, both over data rather than code:
 *
 *   1. coverage. Every source in `data/sources.yaml` has exactly one line in the
 *      newest dated file, and every line names a source that exists. A source
 *      added after the run may be missing, but only when the data carries the
 *      date it was added; today no source does, so a gap fails with both lists.
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

	const runDate = name.replace(/\.jsonl$/, '');
	const isNewer = (source: { added?: string }) =>
		Boolean(source.added && /^\d{4}-\d{2}-\d{2}$/.test(source.added) && source.added > runDate);
	const missing = sources.filter((s) => !seen.has(s.id) && !isNewer(s)).map((s) => s.id);
	const unknown = [...seen].filter((id) => !wanted.has(id));

	ok(
		'every source id has exactly one line in the newest file',
		missing.length === 0,
		missing.length ? `${missing.length} missing, first: ${missing.slice(0, 10).join(', ')}` : `${seen.size} ids, ${lines.length} lines`
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

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
