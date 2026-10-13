/**
 * Local D1 stand-in, over Node's built-in SQLite.
 *
 * Used by the local server and the tests so the whole community layer can be built
 * and exercised before a Cloudflare account exists. It presents the same interface
 * D1 does, so the code under test is the code that will be deployed.
 *
 * Never imported by the Worker bundle: node:sqlite has no equivalent there, and the
 * separation is why db.ts carries the types alone.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Db, Prepared } from './db.ts';

export function localDb(path = ':memory:'): Db {
	const db = new DatabaseSync(path);
	db.exec('PRAGMA foreign_keys = ON');
	/** The batch running now, so the next one waits for it (see batch below). */
	let queue: Promise<unknown> = Promise.resolve();

	const prepare = (sql: string): Prepared => {
		let bound: unknown[] = [];
		const self: Prepared = {
			bind(...values: unknown[]) {
				// node:sqlite rejects booleans and undefined; D1 accepts both. Normalise
				// here so callers can write the same code against either.
				bound = values.map((v) => {
					if (typeof v === 'boolean') return v ? 1 : 0;
					if (v === undefined) return null;
					return v;
				});
				return self;
			},
			async first<T>() {
				const rows = db.prepare(sql).all(...(bound as never[]));
				return (rows[0] as T) ?? null;
			},
			async all<T>() {
				return { results: db.prepare(sql).all(...(bound as never[])) as T[] };
			},
			async run() {
				const out = db.prepare(sql).run(...(bound as never[]));
				return { success: true, meta: { changes: Number(out.changes ?? 0) } };
			}
		};
		return self;
	};

	return {
		prepare,
		async exec(sql: string) {
			db.exec(sql);
		},
		batch(statements: Prepared[]) {
			// node:sqlite has no batch; a transaction provides the atomicity callers
			// actually depend on. Batches are queued one after another, as D1 runs
			// them: two overlapping requests would otherwise try to open a second
			// transaction inside the first.
			const run = async () => {
				db.exec('BEGIN');
				try {
					const out = [];
					for (const s of statements) out.push(await s.run());
					db.exec('COMMIT');
					return out;
				} catch (e) {
					db.exec('ROLLBACK');
					throw e;
				}
			};
			const next = queue.then(run, run);
			queue = next.catch(() => undefined);
			return next;
		}
	};
}
