/**
 * Assertions over the media-investigation build (scripts/build-media.ts).
 *
 * The investigations are a second build product beside the graph, with their
 * own validators: the closed grade vocabulary, interpretation referential
 * integrity ([I#] resolvable, no orphan records, real section markers), the
 * refusal of malformed ">"-prefixed blocks, and the absolutes lint. A
 * validator documented but never exercised is not a validator, so each rule
 * is pinned from both sides:
 *
 *   §1–§3  the clean bundle carries exactly the shape the rules promise;
 *   §4     injected defects actually stop the real builder (exit 1, named
 *          message), run against throwaway copies via the DT_MEDIA_* path
 *          overrides — the real source files are never touched. The fixture
 *          technique is test-pipeline.ts's, pointed at the media corpus.
 *
 * Component logic (ClaimIndicator's grade-to-tint switch) is checked at the
 * source level, the way test-ui.ts checks component logic it cannot import.
 */
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSR = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let failures = 0;
let checks = 0;
function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

// ── §1: the built bundle — the interpretive layer is complete ───────────────

const BUNDLE_PATH = join(ROOT, 'src', 'generated', 'media', 'chemical-century.json');
const BUNDLE = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8')) as {
	slug: string;
	interpretations?: { interpretations?: Array<Record<string, unknown>> };
	evidence?: { claims?: Array<{ id: string; grade?: string }> };
	narrative?: Record<string, { sections?: Array<Record<string, unknown>> }>;
};

console.log('\n  ── media: the interpretive layer in the built bundle ──\n');

// House rule 1 for the interpretive layer: a reading is not a fact. Each
// record must stand on its own four legs (what, who, why, what would break
// it), because InterpretationPanel renders exactly those fields.
const interps = BUNDLE.interpretations?.interpretations ?? [];
const interpIds = interps.map((r) => String(r.id ?? '')).sort();
ok(
	'the bundle carries exactly interpretations I1–I4',
	JSON.stringify(interpIds) === JSON.stringify(['I1', 'I2', 'I3', 'I4']),
	interpIds.join(', ')
);
{
	const incomplete = interps.filter((r) => {
		const s = r.statement as Record<string, string> | undefined;
		const rs = r.reasoning as Record<string, string> | undefined;
		const f = r.falsifier as Record<string, string> | undefined;
		return (
			!(s?.en ?? '').trim() ||
			!(rs?.en ?? '').trim() ||
			!(f?.en ?? '').trim() ||
			!String(r.attributed_to ?? '').trim()
		);
	});
	ok(
		'every interpretation states, attributes, reasons and falsifies',
		incomplete.length === 0,
		incomplete.length ? `incomplete: ${incomplete.map((r) => r.id).join(', ')}` : `${interps.length} complete records`
	);
}

// The claim ledger behind the readings: C066 (the 99.998% state share) is the
// figure I4's reasoning leans on, and the closed vocabulary holds across the
// whole ledger — disputed/negative/layer are fields, never grades.
{
	const claims = BUNDLE.evidence?.claims ?? [];
	const c066 = claims.find((c) => c.id === 'C066');
	ok('claim C066 exists and is graded documented', Boolean(c066) && c066?.grade === 'documented', c066 ? `grade ${c066.grade}` : 'missing');
	const ALLOWED = new Set(['documented', 'reported', 'unsubstantiated']);
	const offVocab = claims.filter((c) => !ALLOWED.has(c.grade ?? ''));
	ok(
		'every claim grade sits in the closed vocabulary',
		offVocab.length === 0,
		offVocab.length ? offVocab.map((c) => `${c.id}=${c.grade}`).join(', ') : `${claims.length} claims`
	);
}

// ── §2: the narrative — interp blocks resolve, removed superlatives stay gone ──

console.log('\n  ── media: the en narrative blocks ──\n');

/** Plain text of the inline node lists: markup syntax contributes nothing. */
function inlineText(nodes: Array<Record<string, unknown>>): string {
	let s = '';
	for (const n of nodes ?? []) {
		if (Array.isArray(n.children)) {
			s += inlineText(n.children as Array<Record<string, unknown>>);
			continue;
		}
		if (typeof n.v === 'string') s += n.v;
		else if (n.t === 'link' && typeof n.label === 'string') s += n.label;
	}
	return s;
}

const en = BUNDLE.narrative?.en?.sections ?? [];
{
	const interpBlocks = en.filter((b) => b.t === 'interp').map((b) => String((b as { ref?: string }).ref));
	ok(
		'the en narrative has exactly four interp blocks referencing I1–I4',
		JSON.stringify(interpIds.slice().sort()) === JSON.stringify(interpBlocks.slice().sort()) && interpBlocks.length === 4,
		interpBlocks.join(', ')
	);
	const known = new Set(interps.map((r) => String(r.id)));
	ok('every interp block resolves to a record', interpBlocks.every((r) => known.has(r)));

	// Section markers: each record's section id must name a real marker after
	// zero-pad normalization (S4 in the source file, S04 in the narrative —
	// the same id honestly written two ways).
	const normalize = (raw: string) =>
		raw.replace(/^([A-Za-z])(\d+)$/, (_m, l: string, d: string) => `${l.toUpperCase()}${d.padStart(2, '0')}`);
	const sectionIds = new Set(en.filter((b) => b.t === 'section').map((b) => String((b as { id?: string }).id)));
	const unknownSections = interps.filter((r) => !sectionIds.has(normalize(String(r.section ?? ''))));
	ok(
		'every interpretation names a real narrative section (zero-pad normalized)',
		unknownSections.length === 0,
		unknownSections.length
			? unknownSections.map((r) => `${r.id}→${r.section}`).join(', ')
			: [...sectionIds].length + ' markers'
	);
}

// The removed superlative: S10 used to close on the editors' "largest
// externality" framing. That sentence asserted a superlative no ledger entry
// grades, so it was cut; if it ever reappears in any block — including inside
// bold/italic children — the article again asserts what the evidence table
// does not back.
{
	const rawAll = JSON.stringify(en);
	ok('the removed superlative "largest externality" appears nowhere in the en narrative', !rawAll.includes('largest externality'));
	let inS10 = false;
	let s10Paras = 0;
	let s10Superlatives = 0;
	for (const b of en) {
		if (b.t === 'section') {
			inS10 = String((b as { id?: string }).id) === 'S10';
			continue;
		}
		if (!inS10 || b.t !== 'p') continue;
		s10Paras++;
		if (/\blargest\b/i.test(inlineText((b as { v?: Array<Record<string, unknown>> }).v ?? []))) s10Superlatives++;
	}
	ok('S10 carries prose to scan (the check is not vacuous)', s10Paras >= 4, `${s10Paras} paragraphs`);
	ok('no S10 paragraph asserts a "largest" superlative', s10Superlatives === 0);
}

// The panel wiring stays connected end to end: layout branch → lookup → panel.
{
	const LAYOUT = readFileSync(join(ROOT, 'src', 'lib', 'components', 'media', 'ArticleLayout.svelte'), 'utf8');
	ok(
		'interp blocks route to InterpretationPanel through the bundle records',
		LAYOUT.includes('block.t === \'interp\'') &&
			LAYOUT.includes('InterpretationPanel') &&
			LAYOUT.includes('interpretations?.interpretations'),
		'ArticleLayout.svelte'
	);
}

// ── §3: ClaimIndicator — an unknown grade never borrows the documented colour ──

console.log('\n  ── media: the ClaimIndicator grade→tint mapping ──\n');

{
	const SRC = readFileSync(join(ROOT, 'src', 'lib', 'components', 'media', 'ClaimIndicator.svelte'), 'utf8');
	// Parse the tint switch straight out of the source so the assertion reads
	// the mapping the component actually ships, not a copy of it.
	const body = SRC.match(/switch \(grade\) \{([\s\S]*?)\n\t\t\}/)?.[1];
	const cases = new Map<string, string>();
	if (body) {
		for (const m of body.matchAll(/case\s+'([^']+)'\s*:\s*return\s+'([^']+)'/g)) cases.set(m[1], m[2]);
	}
	const fallback = body?.match(/default\s*:\s*return\s+'([^']+)'/)?.[1];

	ok(
		'the tint switch was found and parsed (update the parser if the structure changed)',
		Boolean(body) && cases.size > 0 && Boolean(fallback),
		body ? `${cases.size} graded cases` : 'switch body not found'
	);
	ok(
		'every graded case maps to its own basis colour token',
		[...cases.entries()].every(([, v]) => v.startsWith('var(--basis-')),
		[...cases.entries()].map(([k, v]) => `${k}→${v}`).join(', ')
	);
	ok(
		'an unknown grade falls to neutral ink, not any basis colour',
		fallback === 'var(--text-faint)',
		`default → ${fallback}`
	);
	// The core regression: the renderer used to default unknown grades to the
	// documented green, lending ungraded claims the strongest standing in the
	// vocabulary. Only the literal documented grade may resolve to that token.
	const documentedSources = [...cases.entries()].filter(([, v]) => v === 'var(--basis-documented)').map(([k]) => k);
	ok(
		'only grade "documented" resolves to var(--basis-documented)',
		JSON.stringify(documentedSources) === JSON.stringify(['documented']) && fallback !== 'var(--basis-documented)'
	);
}

// ── §4: the validators refuse injected defects (fixture builds, temp copies) ──

console.log('\n  ── media: mutation fixtures against the real builder ──\n');

const WORK = join(tmpdir(), 'opencode', `dt-media-fixtures-${process.pid}`);
const TREE = join(WORK, 'clean', 'chemical-century');
const BAD_TREE = join(WORK, 'bad', 'chemical-century');
const CONTENT = join(ROOT, 'src', 'content', 'media');

function buildMedia(contentDir: string, outDir: string, staticDir: string): { code: number; output: string } {
	const r = spawnSync(process.execPath, [TSR, 'scripts/build-media.ts'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: 300_000,
		env: { ...process.env, DT_MEDIA_DIR: contentDir, DT_MEDIA_OUT_DIR: outDir, DT_MEDIA_STATIC_DIR: staticDir }
	});
	return { code: r.status ?? 1, output: ((r.stdout ?? '') + (r.stderr ?? '')).trim() };
}

/** Append a block to a CRLF-or-LF file, preserving the file's prevailing endings. */
function appendBlock(dir: string, file: string, block: string) {
	const path = join(dir, file);
	const before = readFileSync(path, 'utf8');
	const eol = before.includes('\r\n') ? '\r\n' : '\n';
	writeFileSync(path, before + (before.endsWith(eol) ? '' : eol) + block.replace(/\n/g, eol), 'utf8');
}

try {
	rmSync(WORK, { recursive: true, force: true });
	mkdirSync(join(WORK, 'clean'), { recursive: true });
	mkdirSync(join(WORK, 'bad'), { recursive: true });
	cpSync(CONTENT, join(WORK, 'clean'), { recursive: true });

	// Clean control: the throwaway copy must build, and build identically to
	// the shipped bundle — proving the fixture harness changes nothing about
	// the product, so every failure below is attributable to its injection.
	const clean = buildMedia(join(WORK, 'clean'), join(WORK, 'out-clean'), join(WORK, 'static-clean'));
	ok('fixture control: the clean copy builds', clean.code === 0, `exit ${clean.code}`);
	const cleanBundle = JSON.parse(readFileSync(join(WORK, 'out-clean', 'chemical-century.json'), 'utf8'));
	ok(
		'fixture control: the clean bundle is identical to the shipped bundle',
		JSON.stringify(cleanBundle) === JSON.stringify(BUNDLE)
	);

	// One defect tree carrying every refusal class at once — the builder
	// collects and prints all issues before exiting, so a mutation that
	// disables any check removes exactly its message from this output.
	cpSync(join(WORK, 'clean'), join(WORK, 'bad'), { recursive: true });

	// (a) Closed grade vocabulary: an off-vocabulary grade on C066.
	{
		const p = join(BAD_TREE, 'evidence.yaml');
		const text = readFileSync(p, 'utf8');
		const anchor = text.indexOf('- id: C066');
		const gradeAt = text.indexOf('grade: documented', anchor);
		if (anchor < 0 || gradeAt < 0) throw new Error('fixture: could not locate C066 grade in evidence.yaml copy');
		writeFileSync(p, text.slice(0, gradeAt) + 'grade: verified' + text.slice(gradeAt + 'grade: documented'.length), 'utf8');
	}

	// (b) An [I9] reference nothing answers to, (c) a malformed ">" block, and
	// (d) a long absolute-bearing paragraph with no claim reference. Separate
	// blank lines between the ">" blocks: adjacent quote lines merge into one.
	appendBlock(
		BAD_TREE,
		join('narrative', 'en.md'),
		[
			'',
			'The operator has never published a continuous account of what leaves its stacks, and the figures that circulate through the city instead rest on one campaign carried out decades ago by consultants the company itself hired.',
			'',
			'> [I9]',
			'',
			'> A passage kept in the shape of a pull-quote, carrying no interpretation token at all.'
		].join('\n')
	);

	// (e) An orphaned interpretation record: full fields, real section id
	//     (S1 normalizes to S01), simply never referenced by the narrative.
	appendBlock(
		BAD_TREE,
		'interpretations.yaml',
		[
			'',
			'  - id: I5',
			'    section: S1',
			'    statement:',
			'      en: "Fixture reading injected by the media suite to prove orphaned interpretation records are refused."',
			'    attributed_to: "DeepTunisia editors"',
			'    reasoning:',
			'      en: "Fixture reasoning for the orphan-record injection."',
			'    falsifier:',
			'      en: "A primary record contradicting the fixture reading."'
		].join('\n')
	);

	const bad = buildMedia(join(WORK, 'bad'), join(WORK, 'out-bad'), join(WORK, 'static-bad'));
	ok('fixtures: the injected tree fails the build', bad.code !== 0, `exit ${bad.code}`);

	const expectations: [string, string][] = [
		['unknown grade "verified"', 'an off-vocabulary claim grade is rejected'],
		['Narrative references [I9] but no such interpretation', 'an unresolvable [I#] reference is rejected'],
		['Interpretation I5 exists in interpretations.yaml but no [I5] reference', 'an unreferenced interpretation record is rejected'],
		['malformed interpretation block', 'a ">"-prefixed paragraph without [I#] is fatal'],
		['absolutes lint', 'a long absolute-bearing paragraph without a claim reference is rejected']
	];
	for (const [needle, label] of expectations) {
		ok(`fixtures: ${label}`, bad.output.includes(needle), `expected "${needle.slice(0, 48)}…"`);
	}
} finally {
	rmSync(WORK, { recursive: true, force: true });
}

console.log(`\n  ${checks - failures}/${checks} media checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures > 0 ? 1 : 0);
