/**
 * Freeze an instrument for fielding (portal README §3, rule R4).
 *
 *   npm run studies:freeze -- --study dt-research-002 --version 1.0.0 \
 *     --open 2026-11-01 [--close 2027-10-31] [--dry-run]
 *
 * `--close` is required for a one-off wave. An instrument with a monthly series
 * (scoring.series) fields continuously, so its close is optional: without one
 * the window is recorded open-ended, and its first month must start on the 1st.
 *
 * Freezing is the moment an instrument's content stops being a draft and
 * becomes the thing respondents answer. One command does every part of it, so
 * no part can be forgotten or done against a different text:
 *
 *   1. validates the draft as if it were frozen (every displayed text, anchor,
 *      option label, module label and intro present in every declared locale);
 *   2. writes the frozen copy to data/studies/<study>/<instrument>-v<version>.yaml
 *      with the version, `frozen: true` and its content hash. The draft in the
 *      workshop is left as it is;
 *   3. points the registry's instrument_version at the frozen copy, records the
 *      hash and the fielding window;
 *   4. fills the pre-registration's RECORDED AT FREEZE fields with the same
 *      version, hash, window and date.
 *
 * Edits are textual, key by key, so the comments in the YAML survive; the
 * result is then re-parsed and re-hashed, and the command fails if what was
 * written does not hash to what was recorded. `--dry-run` reports every change
 * and writes nothing. It never changes a study's status: moving to `fielding`
 * is a separate, deliberate edit, checked by the study build (validator S3).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { compileInstrument } from '../community/research-contract.ts';
import { InstrumentSchema, validateInstrument, type InstrumentDoc } from './research-schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'data', 'studies', 'studies.yaml');

function arg(name: string): string | null {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const dryRun = process.argv.includes('--dry-run');
const studyId = arg('study');
const version = arg('version');
const open = arg('open');
const close = arg('close');

function die(message: string): never {
	console.error(`\n  FREEZE REFUSED — ${message}\n`);
	process.exit(1);
}

if (!studyId || !version || !open) {
	die('usage: --study <id> --version <x.y.z> --open <YYYY-MM-DD> [--close <YYYY-MM-DD>] [--dry-run]');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) die(`version "${version}" is not x.y.z; a frozen version carries no draft suffix`);
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
if (!isDate(open) || (close !== null && !isDate(close))) die('--open and --close must be real YYYY-MM-DD dates');
if (close !== null && close <= open) die('the fielding window closes before it opens');

// ---- registry: find the study and its draft instrument ---------------------

/** Read a file keeping its line endings, so the write-back matches the repo's. */
function readText(path: string): { text: string; eol: string } {
	const raw = readFileSync(path, 'utf8');
	return { text: raw.replace(/\r\n/g, '\n'), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}

const registry = readText(REGISTRY);
const studies = parseYaml(registry.text) as Array<Record<string, any>>;
const study = studies.find((s) => s.id === studyId);
if (!study) die(`no study "${studyId}" in data/studies/studies.yaml`);
if (study.status !== 'design' && study.status !== 'ethics-review') {
	die(`study is "${study.status}"; only a study in design or review is frozen`);
}
const draftRef = study.instrument_versions?.[0];
if (!draftRef || draftRef.frozen) die('the study has no draft instrument version to freeze');

const draftPath = join(ROOT, draftRef.source);
if (!existsSync(draftPath)) die(`instrument source ${draftRef.source} does not exist`);
const draft = readText(draftPath);

// ---- the frozen text --------------------------------------------------------

/** Replace one `  key: value` line inside the top-level `instrument:` block. */
function setInstrumentKey(text: string, key: string, value: string): string {
	const block = /^instrument:\n((?: {2}.*\n)+)/m.exec(text);
	if (!block) die('the instrument file has no top-level instrument: block');
	const line = new RegExp(`^  ${key}: .*$`, 'm');
	if (!line.test(block[1])) die(`the instrument block has no ${key}: line`);
	const replaced = block[1].replace(line, `  ${key}: ${value}`);
	return text.slice(0, block.index) + 'instrument:\n' + replaced + text.slice(block.index + block[0].length);
}

let frozenText = draft.text;
frozenText = setInstrumentKey(frozenText, 'version', version);
frozenText = setInstrumentKey(frozenText, 'status', 'frozen');
frozenText = setInstrumentKey(frozenText, 'frozen', 'true');

// Validate the frozen form before hashing: the freeze rules (every locale
// complete) only apply once `frozen: true`, so this is the first time they run.
function parseInstrument(text: string, label: string): InstrumentDoc {
	const parsed = InstrumentSchema.safeParse(parseYaml(text));
	if (!parsed.success) {
		die(`${label} does not parse: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
	}
	return parsed.data;
}
const preHash = parseInstrument(setInstrumentKey(frozenText, 'content_hash', '"pending"'), 'the frozen instrument');
const monthly = (preHash as { scoring?: { series?: unknown } }).scoring?.series !== undefined;
if (!monthly && close === null) die('a one-off wave needs --close; only a monthly series may be open-ended');
if (monthly && !open.endsWith('-01')) die('a monthly series opens on the 1st, so its first month is a whole month');
const violations = validateInstrument(preHash).filter((v) => !v.includes('content_hash'));
if (violations.length) die(`the instrument is not ready to freeze:\n    - ${violations.join('\n    - ')}`);

// The hash excludes content_hash and status by construction, so computing it on
// the frozen text with any placeholder gives the hash of the final file.
const hash = compileInstrument(preHash as never).hash;
frozenText = setInstrumentKey(frozenText, 'content_hash', `"${hash}"`);

// Re-parse what will be written and prove it hashes to what is recorded.
const check = compileInstrument(parseInstrument(frozenText, 'the written instrument') as never);
if (check.hash !== hash) die(`the written instrument hashes to ${check.hash}, not ${hash}`);

const instrumentId: string = preHash.instrument.id;
const frozenRel = `data/studies/${studyId}/${instrumentId}-v${version}.yaml`;
const frozenPath = join(ROOT, frozenRel);
if (existsSync(frozenPath)) die(`${frozenRel} already exists; a frozen version is never overwritten`);

// ---- registry edits, inside this study's block only -------------------------

const start = registry.text.search(new RegExp(`^- id: ${studyId}$`, 'm'));
if (start === -1) die('could not locate the study block in the registry text');
const nextStudy = registry.text.slice(start + 1).search(/^- id: /m);
const end = nextStudy === -1 ? registry.text.length : start + 1 + nextStudy;
let block = registry.text.slice(start, end);
const today = new Date().toISOString().slice(0, 10);

function setBlock(re: RegExp, replacement: string, what: string) {
	if (!re.test(block)) die(`the registry block has no ${what}`);
	block = block.replace(re, replacement);
}
setBlock(/^( {6}version: ).*$/m, `$1${version}`, 'instrument version line');
setBlock(/^( {6}hash: ).*$/m, `$1"${hash}"`, 'instrument hash line');
setBlock(/^( {6}source: ).*$/m, `$1${frozenRel}`, 'instrument source line');
setBlock(/^( {6}frozen: ).*$/m, '$1true', 'instrument frozen line');
setBlock(/^( {2}fielding_window: ).*$/m, `$1{ start: ${open}, end: ${close ?? 'null'} }`, 'fielding_window line');
setBlock(/^( {2}updated: ).*$/m, `$1${today}`, 'updated line');
const registryText = registry.text.slice(0, start) + block + registry.text.slice(end);

// ---- pre-registration -------------------------------------------------------

const preregPath = join(dirname(draftPath), 'preregistration.md');
let prereg: { text: string; eol: string } | null = existsSync(preregPath) ? readText(preregPath) : null;
let preregText: string | null = null;
if (prereg) {
	const marker = 'RECORDED AT FREEZE';
	if (!prereg.text.includes(marker)) die('the pre-registration has no RECORDED AT FREEZE fields left; it was already frozen');
	preregText = prereg.text
		.replace(/(\*\*Version:\*\* )recorded at freeze/, `$1${version}`)
		.replace(/(\*\*Instrument hash \(sha256\):\*\* )`RECORDED AT FREEZE`/, `$1\`${hash}\``)
		.replace(
			/(\*\*Fielding window:\*\* )`RECORDED AT FREEZE` \(opens\) to `RECORDED AT FREEZE` \(closes\)/,
			`$1${open} (opens) to ${close ?? 'no fixed date; monthly until a later version replaces it'} (closes)`
		)
		.replace(/(\*\*Registered:\*\* )`RECORDED AT FREEZE`/, `$1${today}`);
	if (preregText.includes(marker)) die('a RECORDED AT FREEZE field in the pre-registration was not recognised');
}

// ---- report, then write -----------------------------------------------------

console.log(`\n  ${dryRun ? 'DRY RUN — nothing written' : 'FREEZING'}  ${studyId}`);
console.log(`  instrument   ${instrumentId}@${version}`);
console.log(`  hash         ${hash}`);
console.log(`  window       ${open} → ${close ?? 'open-ended (monthly series)'}`);
console.log(`  frozen copy  ${frozenRel}`);
console.log(`  registry     instrument_versions[0] → frozen, hash, source; fielding_window; updated ${today}`);
console.log(`  prereg       ${preregText ? 'version, hash, window and date filled' : 'none found next to the draft'}`);
console.log(`  status       unchanged (${study.status}); moving to fielding is a separate edit\n`);

if (!dryRun) {
	mkdirSync(dirname(frozenPath), { recursive: true });
	writeFileSync(frozenPath, frozenText.replace(/\n/g, draft.eol));
	writeFileSync(REGISTRY, registryText.replace(/\n/g, registry.eol));
	if (prereg && preregText) writeFileSync(preregPath, preregText.replace(/\n/g, prereg.eol));
	console.log('  done. Run npm run data to validate the frozen instrument against the registry.\n');
}
