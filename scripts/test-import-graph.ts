/**
 * The graph is not allowed behind the shell's small modules.
 *
 * `vocab.ts`, `t.svelte.ts`, the theme and the state module are imported by
 * every page. They may import literals and each other, but one static edge to
 * the generated dataset puts 10 MB on a page of prose. This walks the import
 * graph from those files and from the reading pages that must stay free, and
 * fails on the first edge to `src/generated/dataset.json` or
 * `src/generated/index.ts`.
 *
 * Type-only imports are erased by the compiler and are not edges. Dynamic
 * imports are not either: they are a deliberate later load, not part of the
 * page's cost.
 *
 * Usage: `npx tsx scripts/test-import-graph.ts`
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const ENTRIES = [
	'src/lib/vocab.ts',
	'src/lib/t.svelte.ts',
	'src/lib/design/theme.svelte.ts',
	'src/lib/state.svelte.ts',
	// Search and its palette are fetched on demand and read a small file, never
	// the graph, so a keystroke cannot pull 10 MB into a reading page.
	'src/lib/search.svelte.ts',
	'src/lib/components/SearchPalette.svelte',
	// Reading pages that must not pull the graph through their own imports.
	'src/routes/(read)/+layout.svelte',
	'src/routes/(read)/corrections/+page.svelte',
	'src/routes/(read)/guide/+page.svelte',
	'src/routes/(read)/colophon/+page.svelte',
	'src/routes/(read)/about/+page.svelte'
];

const FORBIDDEN = ['src/generated/dataset.json', 'src/generated/index.ts'];

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

/** One static import or re-export: its module and whether it exists at runtime. */
function edges(file: string): { spec: string; runtime: boolean }[] {
	const src = readFileSync(file, 'utf8');
	const found: { spec: string; runtime: boolean }[] = [];
	const statement = /^[ \t]*(import|export)\s+([\s\S]*?)from\s+['"]([^'"]+)['"]/gm;
	for (const match of src.matchAll(statement)) {
		const [, keyword, clause, spec] = match;
		const trimmed = clause.trim();
		if (/^type\b/.test(trimmed)) continue;
		const braces = /\{([\s\S]*)\}/.exec(trimmed)?.[1];
		if (braces !== undefined) {
			const parts = braces
				.split(',')
				.map((p) => p.trim())
				.filter(Boolean);
			if (parts.length && parts.every((p) => p.startsWith('type '))) continue;
		}
		found.push({ spec, runtime: keyword === 'import' || keyword === 'export' });
	}
	// Side-effect imports (`import './app.css'`) have no `from`.
	for (const match of src.matchAll(/^[ \t]*import\s+['"]([^'"]+)['"]/gm)) {
		found.push({ spec: match[1], runtime: true });
	}
	return found;
}

/** The file a specifier points at, or null for a package or an app virtual module. */
function resolveSpec(from: string, spec: string): string | null {
	let base: string;
	if (spec.startsWith('$lib/')) base = join(ROOT, 'src/lib', spec.slice(5));
	else if (spec.startsWith('$data/')) base = join(ROOT, 'src/generated', spec.slice(6));
	else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
	else return null;

	const candidates = [
		base,
		`${base}.ts`,
		`${base}.svelte`,
		`${base}.js`,
		join(base, 'index.ts'),
		join(base, 'index.js')
	];
	for (const candidate of candidates) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

function walk(entry: string): { visited: string[]; hits: string[] } {
	const visited = new Set<string>();
	const hits: string[] = [];
	const queue = [join(ROOT, entry)];
	while (queue.length) {
		const file = queue.pop()!;
		const rel = relative(ROOT, file);
		if (visited.has(rel)) continue;
		visited.add(rel);
		if (FORBIDDEN.includes(rel)) {
			hits.push(rel);
			continue;
		}
		for (const edge of edges(file)) {
			if (!edge.runtime) continue;
			const next = resolveSpec(file, edge.spec);
			if (next) queue.push(next);
		}
	}
	return { visited: [...visited], hits };
}

for (const entry of ENTRIES) {
	const { visited, hits } = walk(entry);
	ok(
		`${entry} reaches no dataset`,
		hits.length === 0,
		hits.length ? `reaches ${hits.join(', ')}` : `${visited.length} modules`
	);
}

console.log(`\n   ${checks - failures}/${checks} import-graph checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
