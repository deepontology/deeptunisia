/**
 * The hash-ledger exemption: who may move the dataset hash without a ledger line.
 *
 * The CI workflow used to skip the comparison for `sync/*` alone. A desk session
 * moves the hash on purpose too, but only when its pull request carries nothing
 * beyond the session: the data files it edited, its line in
 * `research/desk/sessions.tsv`, and the documents `npm run stats:write` refreshes
 * because their counts changed.
 *
 * The table below is the rule, and the last block runs the real command line so
 * the workflow's `if` sees the exit status it expects.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { STATS_WRITE_FILES, ledgerExemption } from './ledger-exempt.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` - ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
	}
}

console.log('\n  ── the branch and the changed files decide ──\n');

{
	const cases: { branch: string; files: string[]; exempt: boolean; name: string; names?: string }[] = [
		{
			branch: 'sync/2026-11-13',
			files: ['data/positions.yaml', 'scripts/desk.ts'],
			exempt: true,
			name: 'a sync branch is exempt, as it was before'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['data/positions.yaml', 'data/events.yaml', 'data/relationships.yaml'],
			exempt: true,
			name: 'a desk branch with only data files is exempt'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['data/positions.yaml', 'scripts/desk.ts'],
			exempt: false,
			name: 'a desk branch that changes scripts/desk.ts is not exempt',
			names: 'scripts/desk.ts'
		},
		{
			branch: 'data/desk-x',
			files: ['.github/workflows/ci.yml'],
			exempt: false,
			name: 'a desk branch that changes the workflow is not exempt',
			names: '.github/workflows/ci.yml'
		},
		{
			branch: 'r1/anything',
			files: ['data/positions.yaml'],
			exempt: false,
			name: 'any other branch is not exempt, even with data only'
		},
		{
			branch: 'data/other',
			files: ['data/positions.yaml'],
			exempt: false,
			name: 'a data branch that is not a desk branch is not exempt'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: [
				'data/positions.yaml',
				'research/desk/sessions.tsv',
				'landing/index.html',
				'README.md',
				'AGENTS.md',
				'DESIGN.md',
				'output/deeptunisia-release-paper-v1.0.0.md',
				'landing/_strings.en.json',
				'landing/_strings.fr.json',
				'landing/_strings.ar.json'
			],
			exempt: true,
			name: 'a desk branch with the session line and the stats:write documents is exempt'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: [],
			exempt: false,
			name: 'a desk branch with no changed files is not exempt'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['a', 'b', 'c', 'd', 'e', 'f', 'data/positions.yaml'].map((f) =>
				f.startsWith('data/') ? f : `src/${f}.ts`
			),
			exempt: false,
			name: 'more than five outside files are counted, and five are named',
			names: 'and 1 more'
		},
		{
			branch: 'sync',
			files: ['data/positions.yaml'],
			exempt: false,
			name: 'a branch named sync without the slash is not a sync branch'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['data/positions.yaml', 'datafile.txt'],
			exempt: false,
			name: 'a path that only looks like data/ is not under data/'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['data/positions.yaml', 'data/parameters.yaml'],
			exempt: false,
			name: 'a desk branch that changes the parameters is not exempt, they set the time window',
			names: 'data/parameters.yaml'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['data/positions.yaml', 'data/source-exceptions.yaml'],
			exempt: false,
			name: 'a desk branch that changes the exception register is not exempt',
			names: 'data/source-exceptions.yaml'
		},
		{
			branch: 'data/desk-2026-11-14',
			files: ['data/positions.yaml', 'data/people.yaml'],
			exempt: false,
			name: 'a desk branch that changes a kind the desk cannot verify is not exempt',
			names: 'data/people.yaml'
		}
	];

	for (const c of cases) {
		const verdict = ledgerExemption(c.branch, c.files);
		ok(c.name, verdict.exempt === c.exempt, verdict.reason);
		if (c.names) ok(`   the reason names ${c.names}`, verdict.reason.includes(c.names), verdict.reason);
	}
}

console.log('\n  ── the stats:write list matches the script it describes ──\n');

{
	const source = readFileSync(join(ROOT, 'scripts', 'write-stats.ts'), 'utf8');
	const docs = source.match(/const DOCS = \[([\s\S]*?)\];/)?.[1] ?? '';
	const named = [...docs.matchAll(/'([^']+)'/g)].map((m) => m[1]);
	ok('the DOCS array in write-stats.ts is readable', named.length >= 4, `${named.length} names`);
	const missing = named.filter((f) => !(STATS_WRITE_FILES as readonly string[]).includes(f));
	ok('every document stats:write rewrites is on the exemption list', missing.length === 0, missing.join(', '));
	ok(
		'the landing source and the three string files are on the list',
		['landing/index.html', 'landing/_strings.en.json', 'landing/_strings.fr.json', 'landing/_strings.ar.json'].every(
			(f) => (STATS_WRITE_FILES as readonly string[]).includes(f)
		)
	);
}

console.log('\n  ── the command line the workflow calls ──\n');

{
	const dir = mkdtempSync(join(tmpdir(), 'dt-ledger-exempt-'));
	const run = (branch: string, files: string[]) => {
		const list = join(dir, `files-${branch.replace(/[^a-z0-9]/gi, '-')}.txt`);
		writeFileSync(list, files.join('\n') + '\n', 'utf8');
		try {
			const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/ledger-exempt.ts', '--branch', branch, '--files-from', list], {
				cwd: ROOT,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			});
			return { status: 0, out, err: '' };
		} catch (e: any) {
			return { status: e.status as number, out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
		}
	};

	const exempt = run('data/desk-2026-11-14', ['data/positions.yaml', 'landing/index.html']);
	ok('an exempt branch exits 0', exempt.status === 0, String(exempt.status));
	ok('an exempt branch prints a notice for the workflow log', exempt.out.includes('::notice::') && /desk session/.test(exempt.out), exempt.out.trim());

	const blocked = run('data/desk-2026-11-14', ['data/positions.yaml', 'scripts/desk.ts']);
	ok('a blocked branch exits 1 so the comparison runs', blocked.status === 1, String(blocked.status));
	ok('the failed call says what stopped it', /desk branch but changes/.test(blocked.err) && blocked.err.includes('scripts/desk.ts'), blocked.err.trim());

	const usage = run('data/desk-x', ['data/positions.yaml']);
	ok('a desk branch with only data is exempt from the command line too', usage.status === 0, String(usage.status));

	rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${checks - failures}/${checks} checks passed\n`);
if (failures) process.exit(1);
