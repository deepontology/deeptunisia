/**
 * One-shot migration: give every relationship an explicit, stable id.
 *
 *   npx tsx scripts/migrate-relationship-ids.ts --dry-run
 *   npx tsx scripts/migrate-relationship-ids.ts --write
 *
 * WHY
 *
 * relationships.yaml is the only data file whose records carry no id. Everything
 * downstream used `rel-<index>-<from>-<to>`, synthesised by build-data.ts from the
 * record's position in the array — so inserting one relationship silently
 * renumbered every relationship after it.
 *
 * That was survivable while the graph was only read. It stops being survivable in
 * Phase 2: a discussion thread attached to `rel-76-...`, or a Phase 3 proposed
 * change targeting it, would come back pointing at a different pair of named
 * people after any insertion. There is no way to detect that after the fact,
 * because both the old and new record are perfectly valid.
 *
 * Nothing could have depended on the old ids correctly, since they had already
 * been reshuffled by every insertion across previous sessions. That is the reason
 * no `legacy_id` is preserved: it would enshrine an identifier that was never
 * stable enough to cite.
 *
 * THE SCHEME
 *
 * `rel-<from>-<to>-<type>`, which is unique across all 161 records — `from`+`to`
 * alone collides three times. The type is always included rather than only when
 * needed, so the rule has no special cases.
 *
 * The id is authored into the file once and never recomputed. If a relationship's
 * type is later corrected, the id stays as written, which is the point: an id that
 * tracks its own fields is not an identifier, it is a summary.
 *
 * Every write goes through emit.ts, so the single-region guarantee and the
 * every-other-record-unchanged guard apply to all 161 edits.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, parseDocument } from 'yaml';
import { applyEdit } from './emit.ts';
import { RelationshipSchema } from './schema.ts';
import { z } from 'zod';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'data', 'relationships.yaml');

const write = process.argv.includes('--write');
if (!write && !process.argv.includes('--dry-run')) {
	console.error('  pass --dry-run or --write');
	process.exit(1);
}

const idFor = (r: { from: string; to: string; type: string }) => `rel-${r.from}-${r.to}-${r.type}`;

let source = readFileSync(FILE, 'utf8');
const original = source;
const records = parseYaml(source) as Array<Record<string, any>>;

// Refuse to run twice. A second pass would append a duplicate id field, and the
// emitter would reject it — but failing here says why.
const already = records.filter((r) => r.id).length;
if (already) {
	console.error(`  ${already} of ${records.length} relationships already carry an id — nothing to do`);
	process.exit(already === records.length ? 0 : 1);
}

// Collisions must be impossible, not unlikely. Checked before any write.
const ids = records.map(idFor);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) {
	console.error(`  scheme collides on ${duplicates.length}: ${[...new Set(duplicates)].join(', ')}`);
	process.exit(1);
}

console.log(`\n  ${records.length} relationships, ${new Set(ids).size} distinct ids\n`);

/*
 * Applied last-to-first.
 *
 * Each edit is computed against the text produced by the previous one, and the
 * target indices come from the original parse. Inserting into an earlier record
 * shifts the byte offsets of every later one; going backwards means every index
 * still ahead of the cursor is untouched when its turn comes.
 */
for (let i = records.length - 1; i >= 0; i--) {
	const record = records[i];
	const result = applyEdit(source, {
		op: 'add-field',
		target: { index: i, match: { from: record.from, to: record.to } },
		field: 'id',
		value: idFor(record),
		at: 'start'
	});
	source = result.text;
}

// The file must still satisfy the schema, and must still describe the same graph.
const reparsed = parseYaml(source) as Array<Record<string, any>>;
const parsedOk = z.array(RelationshipSchema).safeParse(reparsed);
if (!parsedOk.success) {
	console.error(`  schema rejected the result: ${parsedOk.error.issues[0]?.message}`);
	process.exit(1);
}

if (reparsed.length !== records.length) {
	console.error(`  record count changed: ${records.length} -> ${reparsed.length}`);
	process.exit(1);
}

for (let i = 0; i < records.length; i++) {
	const { id, ...rest } = reparsed[i];
	if (id !== idFor(records[i])) {
		console.error(`  #${i}: expected id ${idFor(records[i])}, got ${id}`);
		process.exit(1);
	}
	if (JSON.stringify(rest) !== JSON.stringify(records[i])) {
		console.error(`  #${i}: fields other than id changed`);
		process.exit(1);
	}
}

const addedLines = source.split('\n').length - original.split('\n').length;
if (addedLines !== records.length) {
	console.error(`  expected ${records.length} new lines, got ${addedLines}`);
	process.exit(1);
}

console.log('  verified: every record keeps its fields, only id was added');
console.log(`  +${addedLines} lines, ${original.length} -> ${source.length} bytes\n`);
console.log('  first three:');
for (const r of records.slice(0, 3)) console.log(`    ${idFor(r)}`);

if (!write) {
	console.log('\n  dry run — nothing written. Re-run with --write.\n');
	process.exit(0);
}

writeFileSync(FILE, source, 'utf8');
console.log('\n  written. Run `npm run data && npm run test`.\n');
