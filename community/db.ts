/**
 * Database access, written against Cloudflare D1's shape.
 *
 * The application code never learns which engine it is talking to. D1 is SQLite with
 * a `prepare().bind().first()/all()/run()` surface, so this file declares exactly
 * that and nothing else — no dependency, no ORM, and no second dialect to keep in
 * step. Switching to the real database is a change at server startup, not a rewrite.
 *
 * TYPES ONLY, DELIBERATELY. The local adapter lives in db-local.ts because it
 * imports node:sqlite, which does not exist under Workers. Keeping it out of this
 * file means the deployed bundle can import the interface without dragging a Node
 * built-in in behind it.
 */

export interface Prepared {
	bind(...values: unknown[]): Prepared;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	run(): Promise<{ success: boolean; meta: { changes: number } }>;
}

export interface Db {
	prepare(sql: string): Prepared;
	exec(sql: string): Promise<void>;
	batch(statements: Prepared[]): Promise<unknown[]>;
}
