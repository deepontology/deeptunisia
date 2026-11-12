/**
 * The published dataset layout.
 *
 * `static/dataset.json` ships one record per line, so a reader can open it and
 * read a record without a pretty-printer, and a change to one record is one
 * changed line in git. `meta` stays indented because it is the build's own
 * facts. This checks the layout a reader actually downloads, not a copy the
 * build could have written some other way.
 *
 * Usage: `npx tsx scripts/test-published-layout.ts`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FILE = join(ROOT, 'static', 'dataset.json');

let checks = 0;
const failures: string[] = [];

function ok(name: string, pass: boolean, detail = '') {
	checks++;
	if (pass) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures.push(name);
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const raw = readFileSync(FILE, 'utf8');

let dataset: Record<string, unknown>;
try {
	dataset = JSON.parse(raw);
	ok('the published dataset parses', true, `${(raw.length / 1024).toFixed(0)} KB`);
} catch (e) {
	console.error(`  FAIL  the published dataset parses — ${(e as Error).message}\n`);
	console.log(`\n   0/${checks + 1} layout checks passed, 1 FAILED\n`);
	process.exit(1);
}

/**
 * The lines of a top-level array value, found by its own key at two-space
 * indent, so the slice is the block the writer emits and not a guess.
 */
function block(key: string): string[] | null {
	const open = `\n  ${JSON.stringify(key)}: [\n`;
	const start = raw.indexOf(open);
	if (start === -1) return null;
	const from = start + open.length;
	const end = raw.indexOf('\n  ]', from);
	if (end === -1) return null;
	return raw.slice(from, end).split('\n');
}

// The contract the published file makes to a reader: one record, one line. An
// element is compact when the line minus its comma is itself valid JSON.
for (const [key, value] of Object.entries(dataset)) {
	if (!Array.isArray(value)) continue;
	const lines = block(key);
	if (value.length === 0) {
		ok(`${key} is empty and takes one line`, raw.includes(`\n  ${JSON.stringify(key)}: []`));
		continue;
	}
	if (!lines) {
		ok(`${key} is written one record per line`, false, 'no block found at two-space indent');
		continue;
	}
	ok(`${key} is written one record per line`, lines.length === value.length, `${lines.length} lines for ${value.length} records`);
	const broken = lines.findIndex((line) => {
		const body = line.endsWith(',') ? line.slice(0, -1) : line;
		try {
			JSON.parse(body);
			return false;
		} catch {
			return true;
		}
	});
	ok(`${key} carries a whole record on every line`, broken === -1, broken === -1 ? `first line: ${lines[0].slice(0, 60)}…` : `line ${broken + 1} is not a record: ${lines[broken].slice(0, 60)}…`);
}

// The one block the job names, stated on its own so a failure says "people".
const people = dataset.people as unknown[];
const peopleBlock = block('people');
ok(
	'the people block has one line per person',
	Boolean(peopleBlock) && peopleBlock!.length === people.length,
	`${peopleBlock?.length ?? 0} lines for ${people.length} people`
);

ok('the meta block stays indented', /\n  "meta": \{\n {4}"/.test(raw));

console.log(`\n   ${checks - failures.length}/${checks} layout checks passed${failures.length ? `, ${failures.length} FAILED` : ''}\n`);
if (failures.length) process.exit(1);
