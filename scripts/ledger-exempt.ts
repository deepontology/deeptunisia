/**
 * Which pull requests may move the dataset hash without a ledger line.
 *
 * The rule in `.github/workflows/ci.yml` was one line of shell: only `sync/*`
 * branches skip the comparison. A desk session is the second legitimate mover:
 * it writes `review:` blocks and `verification:` values under `data/`, and it
 * commits the documents `npm run stats:write` refreshes because those carry the
 * counts the session changed. That is a narrow exemption, and it belongs in a
 * function a test can call, not in a shell condition nobody can run.
 *
 *   npx tsx scripts/ledger-exempt.ts --branch <head branch> --files-from <file>
 *
 * The file is a newline separated list of changed paths, as
 * `git diff --name-only <base>...HEAD` writes it. Exit 0 when exempt, with a
 * `::notice::` line for the workflow log. Exit 1 when the comparison must run,
 * with the reason. A usage error also exits 1, so a broken call fails closed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { REVIEWABLE } from './desk.ts';

/**
 * The documents `npm run stats:write` rewrites, and nothing else. The four
 * stat-tagged documents come from the DOCS array in scripts/write-stats.ts; the
 * landing source is refreshed by build-landing.ts --write-source, which
 * stats:write runs last. The three string files are read by that refresh and
 * are named here so a session that touches them is still a desk session.
 *
 * A test checks the first four against scripts/write-stats.ts, so this list
 * cannot drift from the script it describes.
 */
export const STATS_WRITE_FILES = [
	'README.md',
	'AGENTS.md',
	'DESIGN.md',
	'output/deeptunisia-release-paper-v0.1.2.md',
	'landing/index.html',
	'landing/_strings.en.json',
	'landing/_strings.fr.json',
	'landing/_strings.ar.json'
] as const;

export interface Exemption {
	exempt: boolean;
	reason: string;
}

/**
 * The data files a desk session writes: the kinds the desk can verify, taken
 * from the desk itself so this list cannot drift from it. Every other file
 * under `data/` can move the hash without a review behind it (the parameters
 * set the time window, the exception register excuses a rule), so a branch that
 * touches one is compared like any other.
 */
export const DESK_DATA_FILES: readonly string[] = Object.values(REVIEWABLE).map(
	(kind) => `data/${kind.file}`
);

/** A file a desk session may change: a reviewable data file, its own line in the session file, or a document stats:write rewrites. */
export function deskSessionFile(file: string): boolean {
	if (DESK_DATA_FILES.includes(file)) return true;
	if (file === 'research/desk/sessions.tsv') return true;
	return (STATS_WRITE_FILES as readonly string[]).includes(file);
}

/**
 * The decision CI makes before comparing hashes.
 *
 * `sync/*` is unchanged from the previous shell rule: a sync brings data from
 * main on purpose, and only code is ledgered. `data/desk-*` is exempt only when
 * the pull request changes nothing a desk session cannot produce. Everything
 * else runs the comparison.
 */
export function ledgerExemption(branch: string, files: readonly string[]): Exemption {
	if (branch.startsWith('sync/')) {
		return {
			exempt: true,
			reason: `head branch ${branch} is a sync: the hash comparison is skipped because it carries new data`
		};
	}

	if (branch.startsWith('data/desk-')) {
		const changed = files.map((f) => f.trim()).filter(Boolean);
		if (!changed.length) {
			return {
				exempt: false,
				reason: `head branch ${branch} is a desk branch but names no changed files, so the exemption cannot be checked`
			};
		}
		const outside = changed.filter((f) => !deskSessionFile(f));
		if (!outside.length) {
			return {
				exempt: true,
				reason: `head branch ${branch} is a desk session: every changed file is data, the session line, or a document stats:write rewrites`
			};
		}
		const named = outside.slice(0, 5).join(', ');
		const rest = outside.length > 5 ? ` and ${outside.length - 5} more` : '';
		return {
			exempt: false,
			reason: `head branch ${branch} is a desk branch but changes ${outside.length} file(s) a desk session does not: ${named}${rest}`
		};
	}

	return {
		exempt: false,
		reason: `head branch ${branch} is not a sync or desk branch: the hash comparison runs`
	};
}

function main(argv: string[]): number {
	const branchAt = argv.indexOf('--branch');
	const filesAt = argv.indexOf('--files-from');
	if (branchAt === -1 || filesAt === -1 || !argv[branchAt + 1] || !argv[filesAt + 1]) {
		console.error('  FAIL  usage: tsx scripts/ledger-exempt.ts --branch <name> --files-from <file>');
		return 1;
	}
	const branch = argv[branchAt + 1];
	const listPath = argv[filesAt + 1];
	if (!existsSync(listPath)) {
		console.error(`  FAIL  the changed-files list ${listPath} does not exist`);
		return 1;
	}
	const files = readFileSync(listPath, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
	const verdict = ledgerExemption(branch, files);
	if (verdict.exempt) {
		console.log(`::notice::${verdict.reason}`);
		return 0;
	}
	console.error(`  not exempt  ${verdict.reason}`);
	return 1;
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) process.exit(main(process.argv.slice(2)));
