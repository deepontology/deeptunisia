/**
 * Assertions over the study instrument's blinding.
 *
 * The inter-annotator study measures whether humans apply the rubric
 * consistently. It measures nothing if a rater can read the project's grade, so
 * what is pinned here is that the grade cannot reach a rater: not as a field,
 * not as a sentence in the project's own notes, not through markup injection on
 * the workbench page.
 *
 * The leak fixtures are phrases found in the 2026-09-02 300-record sample, where
 * 14 prompts stated or implied the grade in free text that the field-level
 * check passed. The negative fixtures are the false positives an earlier
 * pattern produced ("Precision upgrade", an event that "downgrades the role of
 * parliament"): evidence about the world must survive redaction.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGradeLeaks, redactGradeLeaks, REDACTION_MARK } from './study-leaks.ts';
import { auditPayload, buildWorkbench, projectPrompts, renderMarkdown, WorkbenchError } from './study-workbench.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

console.log('\nstudy — free-text grade leaks');

const LEAKS = [
	'unchanged this run. No upgrade possible.',
	'(existing family edge rel-x, confidence B). The influence is reported',
	'Confidence A retained: the law is the primary record.',
	'A start change would be C-grade only; the end is firm.',
	'Keep verification: needs-primary-source.',
	'so the record stays B / needs-primary-source.',
	'D-grade dispute re-confirmed 2026-08-08',
	'graded C on a single outlet',
	'downgraded to inferred after review',
	'basis: reported',
	'settled as A/documented'
];
for (const t of LEAKS) ok(`flags "${t.slice(0, 48)}"`, findGradeLeaks(t).length > 0);

const CLEAN = [
	'Precision upgrade 2026-08-11: day-level dates from the en.wikipedia list.',
	'The amendment eliminates the constitutional court requirement, and downgrades the role of parliament.',
	'Reasoning: The channel is documented: she was married to the president.',
	'Reuters reported the appointment on 3 March.',
	'He attended a grade school in Sfax.',
	'Plan B was never adopted; Category A licences went to three operators.',
	'The inferred span rests on the succession.',
	'وزير الداخلية'
];
for (const t of CLEAN) ok(`leaves "${t.slice(0, 48)}"`, findGradeLeaks(t).length === 0);

{
	const src = 'Both ends rest on the air chief list. No upgrade possible. | Second note stands.\nSummary line.';
	const r = redactGradeLeaks(src);
	ok('redaction withholds only the sentence that names a grade', r.redacted === 1 && r.text.includes('air chief list.') && r.text.includes('Second note stands.') && r.text.includes('Summary line.') && r.text.includes(REDACTION_MARK) && !/upgrade/i.test(r.text), JSON.stringify(r.text));
	ok('redaction of clean text is the identity', redactGradeLeaks(CLEAN[0]).text === CLEAN[0]);
}

console.log('\nstudy — workbench projection');

const fixture = [
	{
		study_id: 'S001',
		kind: 'position',
		id: 'p-secret-record',
		claim: 'X held Minister of Y between 2001 and 2004',
		context: 'Notes: one decree located. Confidence A retained: the decree is primary.',
		dates: { start: '2001-03-01', end: '2004', verification: 'verified' },
		confidence: 'A',
		bucket: 'tail',
		smuggled: 'should not survive',
		sources: [{ id: 'src-secret', title: 'Décret 2001-1', publisher: 'JORT', tier: 1, excerpt: 'Nomination de X.', url: 'https://example.org/d', tierNote: 'x' }]
	},
	{
		study_id: 'S002',
		kind: 'event',
		claim: 'An event </script><script>window.pwned=1</script> & <b>bold</b>',
		sources: []
	}
];

{
	const { prompts, redacted } = projectPrompts(fixture);
	const flat = JSON.stringify(prompts);
	ok('record id never reaches the page', !flat.includes('p-secret-record'));
	ok('source id never reaches the page', !flat.includes('src-secret'));
	ok('grade fields and unknown fields are dropped', !/"(confidence|bucket|smuggled|verification|tierNote)"/.test(flat), flat.slice(0, 120));
	ok('evidence the rubric needs survives (tier, excerpt, url, span)', prompts[0].sources[0].tier === 1 && prompts[0].sources[0].excerpt === 'Nomination de X.' && prompts[0].sources[0].url === 'https://example.org/d' && prompts[0].dates.start === '2001-03-01');
	ok('the grade-naming sentence in context is withheld', redacted === 1 && !/Confidence A/.test(flat));
	ok('the audit passes a clean projection', auditPayload(prompts).length === 0);
	ok('the audit catches a leak if one is reintroduced', auditPayload([{ ...prompts[0], context: 'No upgrade possible.' }]).length === 1);
}

{
	let refused = false;
	try {
		projectPrompts([{ study_id: 'S001', kind: 'position', claim: 'X held Y — C-grade only', sources: [] }]);
	} catch (e) {
		refused = e instanceof WorkbenchError;
	}
	ok('a claim that names its grade is refused, never redacted', refused);
}

console.log('\nstudy — workbench page');

const rubric = '# Rubric\n\n| a | b |\n|---|---|\n| <img src=x onerror=alert(1)> | `code` |\n\n```\n1. tree <x>\n```\n\n- **bold** item\n';
{
	const r = buildWorkbench({ prompts: fixture, rater: 'Rater A', rubricMd: rubric });
	const html = r.html;
	ok('the page forbids every network connection', /Content-Security-Policy[^>]+connect-src 'none'/.test(html) && /default-src 'none'/.test(html));
	ok('the page loads nothing from outside itself', !/<script[^>]+src=|<link[^>]+href=|@import|url\(http/i.test(html));
	ok('a claim cannot close the data block', !html.includes('</script><script>window.pwned') && (html.match(/<script/g) ?? []).length === 2);
	ok('rubric markup is escaped', html.includes('&lt;img src=x onerror=alert(1)&gt;') && !html.includes('<img src=x'));
	ok('rubric tables, code and lists render', html.includes('<table>') && html.includes('<pre><code>1. tree &lt;x&gt;') && html.includes('<li><strong>bold</strong> item</li>'));
	ok('the record id is absent from the whole page', !html.includes('p-secret-record'));
	const again = buildWorkbench({ prompts: fixture, rater: 'Rater A', rubricMd: rubric });
	const other = buildWorkbench({ prompts: fixture, rater: 'Rater B', rubricMd: rubric });
	ok('the instrument fingerprint is deterministic and per rater', again.fingerprint === r.fingerprint && other.fingerprint !== r.fingerprint, r.fingerprint);
}

ok('renderMarkdown escapes headings too', renderMarkdown('## a <script>').includes('&lt;script&gt;'));

// The committed sample is the one raters would receive. If it is present, the
// workbench must build from it with nothing left that names a grade.
const SAMPLE = join(ROOT, 'research/study/sample-300-blinded.json');
const RUBRIC = join(ROOT, 'research/study/rubric-v2.md');
if (existsSync(SAMPLE) && existsSync(RUBRIC)) {
	console.log('\nstudy — committed 300-record sample');
	const raw = JSON.parse(readFileSync(SAMPLE, 'utf8')) as { prompts: unknown[] };
	const r = buildWorkbench({ prompts: raw.prompts, rater: 'Rater A', rubricMd: readFileSync(RUBRIC, 'utf8') });
	ok('the workbench builds from the committed sample', r.count === raw.prompts.length, `${r.count} records`);
	ok('every grade-naming sentence in it is withheld', r.redacted >= 14, `${r.redacted} withheld`);
}

console.log(`\n${checks - failures}/${checks} study checks passed`);
if (failures > 0) process.exit(1);
