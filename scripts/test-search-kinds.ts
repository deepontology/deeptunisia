/**
 * Search covers the right kinds in each mode.
 *
 * A reading page reads `static/search-index.json` and can only open people,
 * institutions and events, so that is all the file carries. An instrument page
 * holds the graph already, so its palette searches every kind the graph has:
 * connections, contracts, licences, declarations, education, places and regions
 * beside the three above.
 *
 * This counts both lists. A kind dropped from either side, or grown on the file's
 * side without the contract changing, fails here.
 *
 * Usage: `npx tsx scripts/test-search-kinds.ts`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let checks = 0;
let failures = 0;

function ok(name: string, pass: boolean, detail = '') {
	checks++;
	if (pass) console.log(`  ok    ${name}${detail ? ` - ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
	}
}

/** What a reading page can open, and therefore what the file may carry. */
const FILE_KINDS = ['person', 'institution', 'event'];

/** Every kind the graph holds and the instrument palette searches. */
const GRAPH_KINDS: Record<string, string> = {
	person: 'people',
	institution: 'institutions',
	event: 'events',
	relationship: 'relationships',
	contract: 'contracts',
	licence: 'licences',
	declaration: 'declarations',
	education: 'education',
	region: 'regions',
	place: 'places'
};

const dataset = JSON.parse(readFileSync(join(ROOT, 'src/generated/dataset.json'), 'utf8')) as Record<
	string,
	unknown[]
>;
const file = JSON.parse(readFileSync(join(ROOT, 'static/search-index.json'), 'utf8')) as {
	records: { kind: string }[];
};
const graphSource = readFileSync(join(ROOT, 'src/lib/search-graph.ts'), 'utf8');
const palette = readFileSync(join(ROOT, 'src/lib/components/SearchPalette.svelte'), 'utf8');

// --- The file: three kinds, every one of them present ----------------------

const fileCounts = new Map<string, number>();
for (const row of file.records) fileCounts.set(row.kind, (fileCounts.get(row.kind) ?? 0) + 1);
const fileKinds = [...fileCounts.keys()].sort();

ok(
	'the file carries the three kinds a reading page can open',
	fileKinds.join(',') === [...FILE_KINDS].sort().join(','),
	fileKinds.map((k) => `${k} ${fileCounts.get(k)}`).join(', ')
);
for (const kind of FILE_KINDS) {
	ok(`the file has at least one ${kind}`, (fileCounts.get(kind) ?? 0) > 0, String(fileCounts.get(kind)));
}

// --- The graph index: every kind the graph holds ---------------------------

const declared = [...graphSource.matchAll(/kind:\s*'([a-z-]+)'\s+as\s+const/g)].map((m) => m[1]);
const graphKinds = [...new Set(declared)].sort();

ok(
	'the graph index covers every kind, counted from its own source',
	graphKinds.join(',') === Object.keys(GRAPH_KINDS).sort().join(','),
	`${graphKinds.length} kinds: ${graphKinds.join(', ')}`
);
for (const [kind, collection] of Object.entries(GRAPH_KINDS)) {
	const rows = dataset[collection];
	ok(
		`the graph index has rows for ${kind}`,
		Array.isArray(rows) && rows.length > 0,
		`${collection}: ${Array.isArray(rows) ? rows.length : 0}`
	);
}
// One `kind: 'x' as const` per collection above; the count must be exactly that
// many, so a second index of the same kind is not silently added.
ok(
	'each graph kind is indexed once',
	declared.length === graphKinds.length,
	`${declared.length} declarations`
);

// --- The palette picks the mode from the page ------------------------------

ok(
	'the palette reads the small file',
	palette.includes("from '$lib/search.svelte'") && palette.includes('loadSearch'),
	'search.svelte'
);
ok(
	'the palette loads the graph index on demand',
	palette.includes("import('$lib/search-graph')") && palette.includes('searchGraph'),
	'dynamic import'
);
ok(
	'the palette decides by the page, not by what it finds loaded',
	palette.includes('isReadingPath(page.url.pathname)'),
	'isReadingPath'
);

console.log(
	`\n   ${checks - failures}/${checks} search-kind checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
if (failures) process.exit(1);
