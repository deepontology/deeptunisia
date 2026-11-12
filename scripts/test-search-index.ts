/**
 * The search file holds every record a reading page can open.
 *
 * Search on a page of prose reads `static/search-index.json` instead of the
 * graph. If the file loses a record, that record becomes unfindable on exactly
 * the pages that cannot fall back to the graph, and nothing else in the build
 * would notice: the palette simply returns fewer rows. This compares the file
 * with the dataset by id, both directions, for people, institutions and events,
 * and looks three of them up by id.
 *
 * Usage: `npx tsx scripts/test-search-index.ts`
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

interface Row {
	id: string;
	kind: string;
	name: string;
	name_fr?: string;
	name_ar?: string;
	detail?: string;
	layer?: string;
	date?: number;
}

const KINDS = [
	{ kind: 'person', collection: 'people' },
	{ kind: 'institution', collection: 'institutions' },
	{ kind: 'event', collection: 'events' }
] as const;

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

let file: { datasetHash?: string; records?: Row[] } = {};
let dataset: { meta?: { datasetHash?: string }; people?: unknown[]; institutions?: unknown[]; events?: unknown[] } = {};
try {
	file = JSON.parse(readFileSync(join(ROOT, 'static/search-index.json'), 'utf8'));
	dataset = JSON.parse(readFileSync(join(ROOT, 'src/generated/dataset.json'), 'utf8'));
} catch (err) {
	ok('search-index.json and the dataset are readable', false, String(err));
	console.log(`\n   ${checks - failures}/${checks} search-index checks passed, ${failures} FAILED\n`);
	process.exit(1);
}

const rows = file.records ?? [];

ok('the file is an array of records', Array.isArray(file.records) && rows.length > 0, `${rows.length} rows`);
ok(
	'the file was built from this graph',
	file.datasetHash === dataset.meta?.datasetHash,
	`${file.datasetHash ?? 'no hash'}`
);

const ids = new Set(rows.map((r) => r.id));
ok('no record appears twice', ids.size === rows.length, `${rows.length} rows, ${ids.size} ids`);

for (const { kind, collection } of KINDS) {
	const source = (dataset[collection] ?? []) as { id: string }[];
	const sourceIds = new Set(source.map((r) => r.id));
	const inFile = rows.filter((r) => r.kind === kind);
	const fileIds = new Set(inFile.map((r) => r.id));
	const missing = [...sourceIds].filter((id) => !fileIds.has(id));
	const extra = [...fileIds].filter((id) => !sourceIds.has(id));
	ok(
		`one ${kind} row for every ${kind} in the dataset`,
		inFile.length === source.length && missing.length === 0 && extra.length === 0,
		`${inFile.length} of ${source.length}${missing.length ? `, missing ${missing.slice(0, 3).join(', ')}` : ''}${extra.length ? `, unknown ${extra.slice(0, 3).join(', ')}` : ''}`
	);
	ok(
		`every ${kind} row carries a name and a layer`,
		inFile.every((r) => typeof r.name === 'string' && r.name.length > 0 && typeof r.layer === 'string'),
		`${inFile.length} rows`
	);
}

/* Three lookups by id, one per kind, through the same fields the search UI
   renders. A count can be right while the row that matters is empty. */
const samples = [
	{ kind: 'person', collection: 'people', nameKey: 'name_en', extraKey: 'name_ar' },
	{ kind: 'institution', collection: 'institutions', nameKey: 'name_en', extraKey: 'name_ar' },
	{ kind: 'event', collection: 'events', nameKey: 'title_en', extraKey: 'title_ar' }
] as const;

for (const sample of samples) {
	const source = ((dataset[sample.collection] ?? []) as Record<string, unknown>[]).find(
		(rec) => typeof rec[sample.extraKey] === 'string' && (rec[sample.extraKey] as string).length > 0
	);
	if (!source) {
		ok(`a ${sample.kind} sample exists in the dataset`, false);
		continue;
	}
	const id = String(source.id);
	const row = rows.find((r) => r.id === id && r.kind === sample.kind);
	const name = String(source[sample.nameKey] ?? '');
	const localised = String(source[sample.extraKey] ?? '');
	ok(
		`lookup by id finds the ${sample.kind}`,
		Boolean(row) && row!.name === name && (row!.name_ar ?? row!.name_fr ?? '') === localised,
		`${id}: ${row?.name ?? 'missing'}`
	);
}

const bytes = statSync(join(ROOT, 'static/search-index.json')).size;
console.log(`\n   ${rows.length} rows, ${bytes.toLocaleString('en-US')} bytes uncompressed`);
console.log(`   ${checks - failures}/${checks} search-index checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
