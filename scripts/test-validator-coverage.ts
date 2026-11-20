/**
 * Goal 3, as a test: every validator the register calls enforced has a code site
 * that exists and an assertion that names it.
 *
 * The code site is checked by test-paper.ts (the register's anchor must be found
 * in the named file). This file checks the other half. An enforced id must be
 * named, as a word, inside a string literal of at least one assertion in the
 * test files, so a rule that is enforced with nothing that fails when it stops
 * biting cannot sit in the register unnoticed. A comment does not count: a rule
 * mentioned only in prose has no test.
 *
 * This proves a test names the rule, not that the test bites; bite is what
 * `npm run mutation` and the injected fixtures in test-pipeline.ts prove. The
 * ids that are specified or reserved are held to the opposite: no test file may
 * name them in an assertion that claims they run.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALIDATOR_REGISTER } from './validator-register.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
	}
}

/** The string literals of a source file, with comments removed first. */
export function stringLiterals(source: string): string[] {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
	const literals: string[] = [];
	const pattern = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
	for (const m of code.matchAll(pattern)) literals.push(m[1] ?? m[2] ?? m[3] ?? '');
	return literals;
}

export function namesRule(literals: readonly string[], id: string): boolean {
	const word = new RegExp(`(^|[^A-Za-z0-9])${id}([^0-9]|$)`);
	return literals.some((l) => word.test(l));
}

// The unit check: comments do not count, strings do, and V1 is not V12.
{
	const source = `// V7: only a comment\n/* V8 in a block */\nok('V9: a real assertion', true);\nok("(V12)", true);`;
	const literals = stringLiterals(source);
	ok('a comment does not name a rule', !namesRule(literals, 'V7') && !namesRule(literals, 'V8'));
	ok('a string literal names a rule', namesRule(literals, 'V9') && namesRule(literals, 'V12'));
	ok('V1 is not named by V12 or V10', !namesRule(literals, 'V1') && !namesRule(literals, 'V1' + '0'));
}

const tests = readdirSync(HERE).filter((f) => /^test-.*\.ts$/.test(f) && f !== 'test-validator-coverage.ts');
const literals = tests.flatMap((f) => stringLiterals(readFileSync(join(HERE, f), 'utf8')));

const enforced = VALIDATOR_REGISTER.filter((v) => v.status === 'enforced');
const unnamed = enforced.filter((v) => !namesRule(literals, v.id));
ok(
	`every enforced validator is named by a test assertion (${enforced.length} ids)`,
	unnamed.length === 0,
	unnamed.length ? `no assertion names ${unnamed.map((v) => v.id).join(', ')}` : `${tests.length} test files read`
);

const notEnforced = VALIDATOR_REGISTER.filter((v) => v.status !== 'enforced');
ok('the register still has specified and reserved ids to hold to the other half', notEnforced.length > 0, `${notEnforced.length} ids`);

console.log(`\n  ${checks - failures}/${checks} validator coverage checks passed\n`);
if (failures) process.exit(1);
