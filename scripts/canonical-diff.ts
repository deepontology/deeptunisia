/**
 * What two dataset files differ by, over the canonical projection the hash
 * covers.
 *
 * Usage: `npx tsx scripts/canonical-diff.ts before.json after.json`
 *
 * Prints every path whose value differs, grouped by the last key name. Scalar
 * changes are counted per (key, old value, new value); added and removed leaves
 * are counted per key. The output is a summary, not a patch: enough to say what
 * moved and no further.
 */
import { readFileSync } from 'node:fs';
import { canonicalProjection } from './canonical.ts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface Change {
	path: string;
	key: string;
	old: Json;
	new: Json;
}

function lastKey(path: string): string {
	const tail = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path;
	return tail.replace(/\[\d+\]/g, '') || '(root)';
}

function walk(a: Json, b: Json, path: string, out: Change[]): void {
	if (a === b) return;
	const arrayA = Array.isArray(a);
	const arrayB = Array.isArray(b);
	if (arrayA && arrayB) {
		const len = Math.max(a.length, b.length);
		for (let i = 0; i < len; i++) {
			const child = `${path}[${i}]`;
			if (i >= a.length) out.push({ path: child, key: lastKey(path), old: null, new: b[i] });
			else if (i >= b.length) out.push({ path: child, key: lastKey(path), old: a[i], new: null });
			else walk(a[i], b[i], child, out);
		}
		return;
	}
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const key of keys) {
			const child = path ? `${path}.${key}` : key;
			if (!(key in a)) out.push({ path: child, key, old: null, new: (b as Record<string, Json>)[key] });
			else if (!(key in b)) out.push({ path: child, key, old: (a as Record<string, Json>)[key], new: null });
			else walk((a as Record<string, Json>)[key], (b as Record<string, Json>)[key], child, out);
		}
		return;
	}
	out.push({ path, key: lastKey(path), old: a, new: b });
}

const show = (value: Json): string => JSON.stringify(value) ?? 'null';

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
	console.error('usage: canonical-diff.ts <before.json> <after.json>');
	process.exit(2);
}

const before = canonicalProjection(JSON.parse(readFileSync(beforePath, 'utf8')));
const after = canonicalProjection(JSON.parse(readFileSync(afterPath, 'utf8')));

const changes: Change[] = [];
walk(before as Json, after as Json, '', changes);

const byKey = new Map<string, Change[]>();
for (const change of changes) {
	const list = byKey.get(change.key) ?? [];
	list.push(change);
	byKey.set(change.key, list);
}

const lines: string[] = [];
for (const [key, list] of [...byKey].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))) {
	const scalar = new Map<string, number>();
	const added: string[] = [];
	const removed: string[] = [];
	for (const change of list) {
		if (change.old === null) added.push(change.path);
		else if (change.new === null) removed.push(change.path);
		else {
			const label = `${show(change.old)} -> ${show(change.new)}`;
			scalar.set(label, (scalar.get(label) ?? 0) + 1);
		}
	}
	lines.push(`${key}: ${list.length}`);
	for (const [label, count] of [...scalar].sort((x, y) => y[1] - x[1])) lines.push(`  ${count}x ${label}`);
	if (added.length) lines.push(`  added ${added.length}: ${added[0]}${added.length > 1 ? ` (+${added.length - 1} more)` : ''}`);
	if (removed.length) lines.push(`  removed ${removed.length}: ${removed[0]}${removed.length > 1 ? ` (+${removed.length - 1} more)` : ''}`);
}

if (!changes.length) {
	console.log('no differences in the canonical projection');
	process.exit(0);
}

console.log(lines.join('\n'));
console.log(`\n${changes.length} changed path${changes.length === 1 ? '' : 's'} across ${byKey.size} key${byKey.size === 1 ? '' : 's'}`);
