/**
 * The graph the browser loads equals the published graph, minus what is declared.
 *
 * `static/dataset.json` is the graph: its canonical hash is `meta.datasetHash`.
 * The browser does not load it. It loads `src/generated/graph.json`, which trims
 * some fields, and fetches the rest from `static/prose-<lang>.json`,
 * `static/timelines.json` and `static/sources-prose.json` when a panel needs them. Both halves of that are
 * declared in `scripts/client-copy.ts`. This test puts the pieces back together
 * and compares every record with the published one, so a field that falls out of
 * the copy without being declared fails here and not in a reader's panel.
 *
 * It also holds the published file to its own hash in the same run, so a copy
 * cannot agree with a file that no longer matches the hash it states.
 *
 * Usage: `npx tsx scripts/test-graph-copy.ts` (after `npm run data`)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDatasetHash } from './canonical.ts';
import {
	BUILD_ONLY,
	CLIENT_COLLECTIONS,
	COPY_ADDED,
	FETCHED_FIELDS,
	SPLIT_PROSE,
	UNREAD_IN_BROWSER,
	UNSHOWN_TRANSLATION
} from './client-copy.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

type Rec = Record<string, unknown> & { id: string };
type Dataset = { meta: { datasetHash: string } } & Record<string, unknown>;
type Overlay = { datasetHash?: string } & Record<string, Record<string, Record<string, unknown>>>;

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

const PATHS = {
	full: 'static/dataset.json',
	graph: 'src/generated/graph.json',
	fr: 'static/prose-fr.json',
	ar: 'static/prose-ar.json',
	fetched: 'static/sources-prose.json',
	timelines: 'static/timelines.json'
};
for (const rel of Object.values(PATHS)) {
	if (!existsSync(join(ROOT, rel))) {
		console.error(`  FAIL  ${rel} is missing; run \`npm run data\` first`);
		process.exit(1);
	}
}
const read = <T>(rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;

const full = read<Dataset>(PATHS.full);
const graph = read<Dataset>(PATHS.graph);
const overlays = { fr: read<Overlay>(PATHS.fr), ar: read<Overlay>(PATHS.ar) };
const fetched = read<Overlay>(PATHS.fetched);
const timelines = read<Record<string, unknown[]>>(PATHS.timelines);

// 1. The published file is its own hash.
ok(
	'the published graph hashes to its stated datasetHash',
	computeDatasetHash(full) === full.meta.datasetHash,
	full.meta.datasetHash.slice(0, 12)
);

// 2. Every file that goes with the copy names the same build.
ok('the copy carries the published hash', graph.meta.datasetHash === full.meta.datasetHash);
for (const [name, file] of Object.entries({ 'prose-fr': overlays.fr, 'prose-ar': overlays.ar, 'sources-prose': fetched })) {
	ok(`${name}.json carries the published hash`, file.datasetHash === full.meta.datasetHash);
}

// 3. What the copy declares it leaves out of a record of the published file.
const declaredOmission = (key: string): boolean => {
	if (BUILD_ONLY.has(key)) return true;
	const m = /^(.+)_(fr|ar)(_by)?$/.exec(key);
	return !!m && UNSHOWN_TRANSLATION.has(m[1]);
};

/** Stable text for a value, with object keys in sorted order. */
function stable(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
	if (v && typeof v === 'object') {
		const o = v as Record<string, unknown>;
		return `{${Object.keys(o)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
			.join(',')}}`;
	}
	return JSON.stringify(v);
}

const clientCollections = new Set<string>(CLIENT_COLLECTIONS);

// 4. Collections the copy does not touch are the published collections.
for (const key of Object.keys(full)) {
	if (clientCollections.has(key) || key === 'meta') continue;
	ok(`${key} is the published collection`, stable(graph[key]) === stable(full[key]));
}
ok(
	'the copy has no collection the published file lacks',
	Object.keys(graph).every((k) => k in full)
);

// 5. Put each client collection back together and compare record by record.
for (const c of CLIENT_COLLECTIONS) {
	const published = full[c] as Rec[];
	const copy = graph[c] as Rec[];
	ok(
		`${c}: same records in the same order`,
		published.length === copy.length && published.every((r, i) => r.id === copy[i].id),
		`${copy.length}`
	);

	const added = (COPY_ADDED as Record<string, readonly string[]>)[c] ?? [];
	const moved = (FETCHED_FIELDS as Record<string, readonly string[]>)[c] ?? [];
	const unread = (UNREAD_IN_BROWSER as Record<string, readonly string[]>)[c] ?? [];
	let mismatched = 0;
	let first = '';
	let overlaid = 0;
	let fetchedFields = 0;
	for (let i = 0; i < published.length; i++) {
		const want: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(published[i])) if (!declaredOmission(k) && !unread.includes(k)) want[k] = v;

		const got: Record<string, unknown> = { ...copy[i] };
		for (const k of added) delete got[k];
		for (const lang of ['fr', 'ar'] as const) {
			const fields = overlays[lang][c]?.[copy[i].id];
			if (!fields) continue;
			for (const [k, v] of Object.entries(fields)) {
				const m = /^(.+)_(fr|ar)(_by)?$/.exec(k);
				if (!m || !SPLIT_PROSE.has(m[1]) || m[2] !== lang || k in got) {
					mismatched++;
					first ||= `${c}/${copy[i].id}: overlay field ${k} is not a declared split`;
				}
				got[k] = v;
				overlaid++;
			}
		}
		const extra = fetched[c]?.[copy[i].id];
		if (extra) {
			for (const [k, v] of Object.entries(extra)) {
				if (!moved.includes(k) || k in got) {
					mismatched++;
					first ||= `${c}/${copy[i].id}: fetched field ${k} is not declared`;
				}
				got[k] = v;
				fetchedFields++;
			}
		}
		// The copy keeps an empty `timeline`; the card fetches the real one from timelines.json.
		if ('timeline' in got && timelines[copy[i].id]) {
			if (!Array.isArray(got.timeline) || got.timeline.length !== 0) {
				mismatched++;
				first ||= `${c}/${copy[i].id}: the copy's timeline is not empty`;
			}
			got.timeline = timelines[copy[i].id];
		}
		// A declared flag must be true exactly when the field is fetched.
		for (const k of added) {
			const flagged = copy[i][k] === true;
			const present = k === 'hasExcerpt' ? extra?.excerpt !== undefined : false;
			if (flagged !== present) {
				mismatched++;
				first ||= `${c}/${copy[i].id}: ${k} is ${flagged} but the fetched file ${present ? 'has' : 'lacks'} the field`;
			}
		}
		if (stable(got) !== stable(want)) {
			mismatched++;
			const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
			const bad = [...keys].find((k) => stable(got[k]) !== stable(want[k]));
			first ||= `${c}/${copy[i].id}: field ${bad} differs`;
		}
	}
	ok(
		`${c}: the copy plus its side files equals the published records, less the declared omissions`,
		mismatched === 0,
		mismatched === 0 ? `${overlaid} overlay fields, ${fetchedFields} fetched fields` : first
	);
}

// 6. Nothing is in a side file that has no record to land on.
for (const [name, file] of Object.entries({ fr: overlays.fr, ar: overlays.ar, fetched })) {
	let orphans = 0;
	for (const [c, records] of Object.entries(file)) {
		if (c === 'datasetHash') continue;
		const ids = new Set((full[c] as Rec[] | undefined)?.map((r) => r.id));
		for (const id of Object.keys(records)) if (!ids.has(id)) orphans++;
	}
	ok(`${name}: every record in the side file exists in the published graph`, orphans === 0, orphans ? `${orphans} orphan(s)` : '');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
