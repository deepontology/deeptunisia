/**
 * Additive migrations for databases that already exist.
 *
 * `schema.sql` is all `CREATE TABLE IF NOT EXISTS`, which is what lets it run on
 * every start — but it means a column added to that file never reaches a database
 * created before the column existed. On a local prototype that shows up as
 * "no such column"; on D1 after launch it would show up as an outage.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so each step asks the table what it has.
 * `PRAGMA table_info` works on both node:sqlite and D1, which keeps this file inside
 * the rule the rest of the layer follows: the code under test is the code deployed.
 *
 * Additive only, by design. A migration here may add a column or an index and may
 * never drop or rewrite one — this database holds text people wrote under a law that
 * imprisons them for it, and a destructive step that runs automatically on boot is
 * not something anyone should be able to trigger by deploying.
 */
import type { Db } from './db.ts';

interface Step {
	table: string;
	column: string;
	/** SQL type and constraints. Must be nullable or carry a default: the rows exist. */
	definition: string;
	why: string;
}

const STEPS: Step[] = [
	{
		table: 'identities',
		column: 'self_description',
		definition: 'TEXT',
		why: 'self-declared standing — "journalist", "worked there until 2014"'
	},
	{
		table: 'posts',
		column: 'author_name',
		definition: 'TEXT',
		why: 'the name as it stood when the post was written'
	},
	{ table: 'posts', column: 'author_note', definition: 'TEXT', why: 'ditto, for the description' },
	{ table: 'threads', column: 'author_name', definition: 'TEXT', why: 'as for posts' },
	{ table: 'threads', column: 'author_note', definition: 'TEXT', why: 'as for posts' },
	{ table: 'prs', column: 'author_name', definition: 'TEXT', why: 'as for posts' },
	{ table: 'prs', column: 'author_note', definition: 'TEXT', why: 'as for posts' }
];

async function columns(db: Db, table: string): Promise<Set<string>> {
	try {
		const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
		return new Set(rows.results.map((r) => r.name));
	} catch {
		// The table does not exist yet, which means schema.sql is about to create it
		// with the column already present. Nothing to do.
		return new Set();
	}
}

/** Run after `schema.sql`. Returns what it changed, so a caller can log it. */
export async function migrate(db: Db): Promise<string[]> {
	const applied: string[] = [];
	const seen = new Map<string, Set<string>>();

	for (const step of STEPS) {
		if (!seen.has(step.table)) seen.set(step.table, await columns(db, step.table));
		const have = seen.get(step.table)!;
		if (have.size === 0 || have.has(step.column)) continue;

		await db.exec(`ALTER TABLE ${step.table} ADD COLUMN ${step.column} ${step.definition}`);
		have.add(step.column);
		applied.push(`${step.table}.${step.column}`);
	}
	return applied;
}
