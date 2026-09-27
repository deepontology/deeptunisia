/**
 * The bridge from an accepted proposal to the graph.
 *
 *   npx tsx scripts/apply-proposals.ts            list what is waiting
 *   npx tsx scripts/apply-proposals.ts --apply    write them, and say so
 *
 * This is the last link in the loop the sprint describes: discover, discuss,
 * evidence, propose, review, graph update. Everything before this runs in the
 * community app; the graph is YAML in git on this machine, so the write has to
 * happen here.
 *
 * WHY IT IS A SEPARATE STEP RATHER THAN AUTOMATIC
 *
 * Accepting a proposal is a judgement about evidence. Writing it into the canonical
 * dataset is a change to a file that the whole site is built from. Keeping them
 * apart means a reviewer's click cannot, by itself, alter published data — and it
 * means the write goes through emit.ts and the build gate like every other edit,
 * so a stranger's contribution is validated by exactly the code a moderator's own
 * edit is.
 *
 * The community database is never trusted to describe the graph. It is asked what
 * was accepted; this script checks the record still says what the proposal claimed
 * before touching it, and refuses if it has moved.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { applyEdit, EmitError } from './emit.ts';
import { editsFor } from './proposal-edit.ts';
import { signAction, toB64u, fromB64u } from '../community/identity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * The repository the bridge writes into. Defaults to this checkout; overridable
 * so the whole apply path can be exercised against a throwaway copy without
 * touching canonical data.
 */
const ROOT = process.env.DT_APPLY_ROOT ?? join(HERE, '..');
/** Where the build scripts live. Same as ROOT unless a throwaway root is used. */
const REPO = join(HERE, '..');
const ORIGIN = process.env.COMMUNITY_ORIGIN ?? 'http://127.0.0.1:5200';
const KEY_PATH = join(ROOT, '.community', 'operator-key.json');

const APPLY = process.argv.includes('--apply');

/** Which file each target type lives in. */
const FILES: Record<string, string> = {
	person: 'people.yaml',
	institution: 'institutions.yaml',
	role: 'roles.yaml',
	position: 'positions.yaml',
	relationship: 'relationships.yaml',
	event: 'events.yaml',
	source: 'sources.yaml',
	// v0.0.2 record kinds (spec §13.1): the editorial workflow covers the same
	// kinds the review queues do.
	company: 'companies.yaml',
	contract: 'contracts.yaml',
	licence: 'licences.yaml',
	declaration: 'declarations.yaml',
	education: 'education.yaml',
	place: 'places.yaml',
	region: 'regions.yaml'
};

/**
 * The operator's key for talking back to the community app.
 *
 * Extractable and stored on disk, unlike a user's key, because this is a local
 * tool that has to reuse the same identity across runs. It lives in .community/,
 * which is gitignored. Its public half goes in COMMUNITY_MODERATORS.
 */
async function operatorKey(): Promise<{ pubkey: string; keys: CryptoKeyPair }> {
	if (existsSync(KEY_PATH)) {
		const stored = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
		const privateKey = await crypto.subtle.importKey('jwk', stored.jwk, { name: 'Ed25519' }, true, ['sign']);
		const publicKey = await crypto.subtle.importKey(
			'raw',
			fromB64u(stored.pubkey) as BufferSource,
			{ name: 'Ed25519' },
			true,
			['verify']
		);
		return { pubkey: stored.pubkey, keys: { privateKey, publicKey } };
	}

	const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
	const raw = await crypto.subtle.exportKey('raw', keys.publicKey);
	const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
	const pubkey = toB64u(new Uint8Array(raw));

	mkdirSync(dirname(KEY_PATH), { recursive: true });
	writeFileSync(KEY_PATH, JSON.stringify({ pubkey, jwk }, null, 2), 'utf8');
	console.log(`\n  Generated an operator key. Add its public half to the community server:\n`);
	console.log(`    COMMUNITY_MODERATORS=${pubkey}\n`);
	return { pubkey, keys };
}

async function post(path: string, data: unknown, key: Awaited<ReturnType<typeof operatorKey>>) {
	const action = await signAction(key.keys, key.pubkey, JSON.stringify({ path, data }));
	const res = await fetch(`${ORIGIN}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ action, data })
	});
	return { status: res.status, body: (await res.json()) as any };
}

/*
 * The mapping lives in proposal-edit.ts so the test suite can exercise it
 * without running this CLI or touching data/.
 */

/** git, with the repo root as cwd, returning stdout. */
function git(args: string[]): string {
	return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/**
 * The schema gate, run before anything is committed.
 *
 * `scripts/build-data.ts` validates every record against its Zod schema and the
 * cross-file references, and stages its output so a failed build publishes
 * nothing. Running it here is the difference between "a bad record entered a
 * commit and CI caught it later" and "the proposal went back to needs-evidence".
 */
function buildGate(): { ok: boolean; output: string } {
	try {
		execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-data.ts'], {
			cwd: REPO,
			env: {
				...process.env,
				// Validate the data the bridge is writing, which may be a throwaway
				// copy when DT_APPLY_ROOT is set.
				DT_DATA_DIR: join(ROOT, 'data'),
				DT_OUT_DIR: join(ROOT, '.community', 'build-gate-out'),
				DT_STATIC_DIR: join(ROOT, '.community', 'build-gate-static')
			},
			stdio: 'pipe'
		});
		return { ok: true, output: '' };
	} catch (e: any) {
		const out = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
		return { ok: false, output: String(out).trim() };
	}
}

/** The first few lines of a build failure, for the public review reason. */
function failureReason(output: string): string {
	const lines = output
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	const picked = lines.slice(-6).join(' | ');
	return `the build refused this proposal: ${picked.slice(0, 600)}`;
}

const res = await fetch(`${ORIGIN}/api/prs?status=accepted`).catch(() => null);
if (!res?.ok) {
	console.error(`\n  Could not reach the community app at ${ORIGIN}. Is \`npm run community\` running?\n`);
	process.exit(1);
}

const { items } = (await res.json()) as any;
if (!items.length) {
	console.log('\n  Nothing accepted and waiting.\n');
	process.exit(0);
}

console.log(`\n  ${items.length} accepted proposal(s) waiting to be written\n`);

const key = APPLY ? await operatorKey() : null;
let applied = 0;
let refused = 0;

for (const pr of items) {
	const file = FILES[pr.target_type];
	const label = `${pr.target_type}/${pr.target_id}`;
	console.log(`  ${label}`);
	console.log(`    ${pr.reason.slice(0, 90)}`);
	for (const c of pr.changes) console.log(`    ${c.field}: ${c.old_value ?? '(unset)'} -> ${c.new_value}`);
	console.log(`    evidence: ${pr.sources.length} source(s), author @${pr.author?.handle ?? 'unknown'}`);

	if (!file) {
		console.log(`    REFUSED: no file for target type "${pr.target_type}"\n`);
		refused++;
		continue;
	}

	try {
		const path = join(ROOT, 'data', file);
		const source = readFileSync(path, 'utf8');

		/*
		 * The file must be clean before we touch it. Otherwise a commit made here
		 * would carry unrelated in-progress edits, and the recorded SHA would
		 * describe a tree the reviewer never saw.
		 */
		const dirty = git(['status', '--porcelain', '--', `data/${file}`]).trim();
		if (dirty) throw new EmitError(`data/${file} already has uncommitted changes`);

		/*
		 * The record must still say what the proposal said it said.
		 *
		 * A proposal may have been filed weeks ago. If the field has changed since,
		 * writing the proposed value would silently overwrite whatever happened in
		 * between — and the reviewer approved a change from a value that no longer
		 * exists, so their judgement does not apply to the record as it stands.
		 *
		 * An addition inverts the check: the id must NOT be taken. A record created
		 * from another route after the proposal was accepted would be silently
		 * duplicated.
		 */
		const record = (parseYaml(source) as any[]).find((r) => r.id === pr.target_id);
		if (pr.operation === 'append-record') {
			if (record) throw new EmitError(`a record "${pr.target_id}" already exists in ${file}`);
		} else {
			if (!record) throw new EmitError(`no record "${pr.target_id}" in ${file}`);

			for (const c of pr.changes) {
				if (c.old_value != null && String(record[c.field] ?? '') !== String(c.old_value)) {
					throw new EmitError(
						`${c.field} now reads "${record[c.field]}", but the proposal was reviewed against "${c.old_value}" — it needs re-reviewing`
					);
				}
			}
		}

		/*
		 * Every change, folded over the source in order. The emitter's guard is
		 * single-region, so each edit is applied and re-parsed before the next.
		 */
		const edits = editsFor(pr);
		let text = source;
		for (const edit of edits) text = applyEdit(text, edit).text;

		if (!APPLY) {
			console.log(`    would apply ${edits.length} edit(s) (dry run)\n`);
			continue;
		}

		writeFileSync(path, text, 'utf8');

		// The gate runs before the commit, not after it.
		const gate = buildGate();
		if (!gate.ok) {
			writeFileSync(path, source, 'utf8');
			const reason = failureReason(gate.output);
			const sent = await post('/api/pr/review', { pr_id: pr.id, decision: 'needs-evidence', reason }, key!);
			console.log(`    REFUSED by the build; file restored.`);
			console.log(`    ${reason}`);
			console.log(
				sent.status === 200
					? `    proposal reopened as needs-evidence\n`
					: `    but the community app refused to reopen it: ${sent.body.error}\n`
			);
			refused++;
			continue;
		}

		git(['add', '--', `data/${file}`]);
		try {
			git([
				'commit',
				'-m',
				`Apply proposal: ${pr.reason.slice(0, 68)}`,
				'-m',
				`Proposed by @${pr.author?.handle ?? 'unknown'}, accepted after review.\nEvidence: ${pr.sources.map((s: any) => s.url || s.source_id).join(', ')}\nProposal ${pr.id}`,
				'--',
				`data/${file}`
			]);
		} catch (e) {
			// A commit that fails after the write must not leave the tree altered.
			writeFileSync(path, source, 'utf8');
			throw new Error(`git commit failed: ${(e as Error).message.split('\n')[0]}`);
		}
		const sha = git(['rev-parse', 'HEAD']).trim();

		const marked = await post('/api/pr/applied', { pr_id: pr.id, sha }, key!);
		if (marked.status !== 200) {
			console.log(`    written as ${sha.slice(0, 12)}, but the community app refused the mark: ${marked.body.error}\n`);
		} else {
			console.log(`    applied and committed as ${sha.slice(0, 12)}\n`);
		}
		applied++;
	} catch (e) {
		console.log(`    REFUSED: ${(e as Error).message}\n`);
		refused++;
	}
}

if (APPLY) {
	console.log(`  ${applied} applied, ${refused} refused`);
	console.log('  The build gate ran before each commit. Run `npm run test` before pushing.\n');
} else {
	console.log('  Dry run. Re-run with --apply to write them.\n');
}
