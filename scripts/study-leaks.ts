/**
 * study-leaks — free-text grade leakage in blinded study prompts.
 *
 * The blinding harness strips grade *fields* from a prompt, but the prompt also
 * carries free text the project wrote about the record: holder summaries,
 * research-pass notes, relationship reasoning, source excerpts. That prose
 * sometimes states the grade outright ("confidence B", "Confidence A retained",
 * "a start change would be C-grade only", "No upgrade possible"). A rater who
 * reads that sentence is no longer blind, whatever the field-level check says.
 *
 * The patterns are deliberately narrow. Words such as "documented" or "reported"
 * occur naturally in claims and excerpts and are evidence, not a grade, so they
 * are not matched on their own; only phrasing that names a confidence letter, an
 * upgrade/downgrade, or a grading-field label is.
 *
 * Redaction works per sentence and leaves a visible marker, so a rater can see
 * that text was withheld and the coordinator can count how much.
 */

export const GRADE_LEAK_PATTERNS: { name: string; re: RegExp }[] = [
	// "confidence B", "Confidence A retained", "confidence: C", "confidence of D"
	{ name: 'confidence-letter', re: /\b[Cc]onfidence\s*(?:of\s+|[:=]\s*|\(\s*)?[ABCD]\b/ },
	// "C-grade", "B grade", "A-graded"
	{ name: 'letter-grade', re: /\b[ABCD][- ]grade[ds]?\b/ },
	// "grade B", "graded C"
	{ name: 'grade-letter', re: /\bgrade[ds]?\s+[ABCD]\b/i },
	// "No upgrade possible", "downgraded to inferred", "upgrade to A". Not "a
	// precision upgrade" (dates refined) and not an event that "downgrades the
	// role of parliament" — those are about the world, not the record's grade.
	{
		name: 'up-downgrade',
		re: /\bno (?:up|down)grade\b|\b(?:up|down)grad(?:e|ed|es|ing)\s+(?:to|from)\s+(?:[ABCD]\b|documented|reported|inferred|unsubstantiated)/i
	},
	// the verification token that drives the basis derivation
	{ name: 'needs-primary-source', re: /\bneeds-primary-source\b/i },
	// "basis: inferred", "verification = verified"
	{ name: 'field-label', re: /\b(?:basis|verification)\s*[:=]/i },
	// "B/reported", "documented / A"
	{ name: 'grade-pair', re: /\b[ABCD]\s*\/\s*(?:documented|reported|inferred|unsubstantiated)\b|\b(?:documented|reported|inferred|unsubstantiated)\s*\/\s*[ABCD]\b/ }
];

export const REDACTION_MARK = '[withheld: names a grade]';

export type Leak = { pattern: string; match: string };

export function findGradeLeaks(text: string): Leak[] {
	const leaks: Leak[] = [];
	for (const { name, re } of GRADE_LEAK_PATTERNS) {
		const m = re.exec(text);
		if (m) leaks.push({ pattern: name, match: m[0] });
	}
	return leaks;
}

/**
 * Replace every sentence that names a grade. Returns the text and the count.
 * Research notes join entries with " | " and summaries with newlines, so both
 * count as boundaries alongside sentence-final punctuation.
 */
export function redactGradeLeaks(text: string): { text: string; redacted: number } {
	if (findGradeLeaks(text).length === 0) return { text, redacted: 0 };
	let redacted = 0;
	const lines = text.split('\n').map((line) => {
		const parts = line.split(/(?<=[.!?;])\s+|\s\|\s/);
		return parts
			.map((s) => {
				if (findGradeLeaks(s).length === 0) return s;
				redacted++;
				return REDACTION_MARK;
			})
			.join(' ');
	});
	return { text: lines.join('\n'), redacted };
}

/** Every string inside a JSON-like value, with its path, for scanning whole prompts. */
export function stringsIn(value: unknown, path = ''): { path: string; text: string }[] {
	if (typeof value === 'string') return [{ path, text: value }];
	if (Array.isArray(value)) return value.flatMap((v, i) => stringsIn(v, `${path}[${i}]`));
	if (value && typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => stringsIn(v, path ? `${path}.${k}` : k));
	}
	return [];
}
