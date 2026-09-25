/**
 * Claim-matrix gate (Phase 5).
 *
 * The matrix is a claim about the paper's claims, so it is checked like one:
 * `scripts/claim-matrix.ts` is the single source, `output/claim-matrix.csv` is
 * the published artifact, and this suite recomputes it. The pointer checks in
 * `validateMatrix` are what make "shipped+tested" mean something: a row that
 * names a function or an assertion which does not exist fails here, so the
 * matrix cannot decay into a document that says features were tested while the
 * pointers rot underneath it.
 *
 * The required-topic list is the Phase 5 minimum plus the capabilities the
 * successor release adds. A topic that loses its row fails by name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	CLAIM_MATRIX,
	claimMatrixCsv,
	matrixSummary,
	missingTopics,
	validateMatrix,
	REQUIRED_TOPICS
} from './claim-matrix.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = ''): void {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

console.log('\n  ── claim matrix: rows and pointers ──\n');

const errors = validateMatrix(CLAIM_MATRIX);
ok(
	'every matrix row has a valid shape, status and resolvable pointer',
	errors.length === 0,
	errors.length ? errors.slice(0, 4).join('; ') : `${CLAIM_MATRIX.length} rows`
);

for (const topic of REQUIRED_TOPICS) {
	ok(`the matrix covers ${topic.label}`, !missingTopics(CLAIM_MATRIX).includes(topic.label));
}

const summary = matrixSummary(CLAIM_MATRIX);
ok(
	'no row claims a passing test without naming one',
	CLAIM_MATRIX.filter((r) => r.status === 'shipped+tested').every((r) => r.test_pointer !== 'none'),
	`shipped+tested ${summary['shipped+tested']}`
);

console.log('\n  ── claim matrix: the published artifact ──\n');

const csvPath = join(ROOT, 'output', 'claim-matrix.csv');
if (!existsSync(csvPath)) {
	ok('output/claim-matrix.csv exists', false, 'run npm run claim:matrix');
} else {
	ok(
		'output/claim-matrix.csv recomputes from the matrix module',
		// Compare EOL-insensitively: the artifact is written LF, and a checkout
		// under core.autocrlf can hand back CRLF without any content change.
		readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n') === claimMatrixCsv(CLAIM_MATRIX),
		`${CLAIM_MATRIX.length} rows`
	);
}

console.log(
	`\n  ${checks - failures}/${checks} claim-matrix checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
