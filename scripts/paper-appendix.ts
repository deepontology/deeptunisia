/**
 * Appendix A of the release paper, generated from the validator register.
 *
 * `scripts/validator-register.ts` is the one place that says whether a
 * numbered rule runs. The paper's Appendix A used to be typed by hand and
 * drifted from it more than once, so the table is now produced here and
 * `scripts/test-paper.ts` fails when the paper's copy differs.
 *
 *   npm run paper:appendix          rewrite the block in the newest paper
 *   npx tsx scripts/paper-appendix.ts --check   exit 1 if the paper differs
 *
 * The block sits between two comment markers so the rest of the paper stays
 * authored text.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALIDATOR_REGISTER, type ValidatorEntry } from './validator-register.ts';

export const APPENDIX_BEGIN = '<!--appendix-a:begin-->';
export const APPENDIX_END = '<!--appendix-a:end-->';

const ENGINE_PREFIX = 'node_modules/deepepisteme/';

function behaviour(entry: ValidatorEntry): string {
	if (entry.status === 'specified') return 'specified, not enforced';
	if (entry.status === 'reserved') return 'reserved, not implemented';
	if (entry.gate === 'fail') return '**fail**';
	if (entry.gate === 'warn') return '**warn**';
	return '**fail** or **warn**, by branch';
}

function enforcedIn(entry: ValidatorEntry): string {
	if (!entry.site) return '—';
	const file = entry.site.file.startsWith(ENGINE_PREFIX)
		? `deepepisteme/${entry.site.file.slice(ENGINE_PREFIX.length)}`
		: entry.site.file;
	return `\`${file}\``;
}

/** The text of the block, markers included, with no trailing newline. */
export function renderAppendixA(register: ValidatorEntry[] = VALIDATOR_REGISTER): string {
	const numbers = register.map((v) => Number(v.id.slice(1)));
	const reserved = register.filter((v) => v.status === 'reserved').map((v) => v.id);
	const range = `V${Math.min(...numbers)}–V${Math.max(...numbers)}`;
	const heading = `## Appendix A — Validator table (${range}${reserved.length ? `, ${reserved.join(', ')} reserved` : ''})`;
	const rows = register.map((v) => `| ${v.id} | ${v.rule} | ${enforcedIn(v)} | ${behaviour(v)} |`);
	return [
		APPENDIX_BEGIN,
		heading,
		'',
		'This table is generated from `scripts/validator-register.ts` by `npm run paper:appendix`, and `scripts/test-paper.ts` fails when it differs from the register. A row reads `specified, not enforced` when no code runs the rule and `reserved, not implemented` when the number is held for a rule that does not exist yet. "Enforced in" names the file that runs the rule; a file under `deepepisteme/` belongs to the engine dependency, which the consumer pins by commit. **fail** stops the build, **warn** publishes a finding without stopping it, and a rule marked both has branches of each kind. A rule enforced by the test suite rather than the build is named by its test file.',
		'',
		'| ID | Validator | Enforced in | Behaviour |',
		'|---|---|---|---|',
		...rows,
		APPENDIX_END
	].join('\n');
}

/** The block as it stands in a paper, or null when the markers are absent. */
export function extractAppendixA(text: string): string | null {
	const start = text.indexOf(APPENDIX_BEGIN);
	const end = text.indexOf(APPENDIX_END);
	if (start === -1 || end === -1 || end < start) return null;
	return text.slice(start, end + APPENDIX_END.length);
}

export function newestPaper(output: string): string {
	const names = readdirSync(output)
		.filter((f) => /^deeptunisia-release-paper-v.+\.md$/.test(f))
		.filter((f) => readFileSync(join(output, f), 'utf8').includes('<!--stat:'))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	if (!names.length) throw new Error('no release paper source with stat tags found under output/');
	return join(output, names[names.length - 1]);
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const path = newestPaper(join(root, 'output'));
	if (!existsSync(path)) throw new Error(`paper source not found: ${path}`);
	const text = readFileSync(path, 'utf8');
	const current = extractAppendixA(text);
	if (current === null) {
		console.error(`\n  paper:appendix: ${path} has no ${APPENDIX_BEGIN} ... ${APPENDIX_END} block\n`);
		process.exit(1);
	}
	const generated = renderAppendixA();
	if (process.argv.includes('--check')) {
		if (current !== generated) {
			console.error('\n  paper:appendix: Appendix A differs from the validator register; run `npm run paper:appendix`\n');
			process.exit(1);
		}
		console.log('\n  paper:appendix: Appendix A matches the validator register\n');
	} else if (current === generated) {
		console.log('\n  paper:appendix: Appendix A already matches the validator register\n');
	} else {
		writeFileSync(path, text.replace(current, () => generated), 'utf8');
		console.log(`\n  paper:appendix: Appendix A rewritten from the validator register (${path.split('/').pop()})\n`);
	}
}
