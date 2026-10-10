/**
 * study-workbench — one self-contained grading page per rater.
 *
 * A rater grading 300 records from a spreadsheet sees a claim truncated to 200
 * characters and has to look every source up. The blinded JSON already carries
 * what the rubric says a rater reads (claim, span, context, every cited source
 * with tier, publisher and excerpt). This puts it on one page, one record at a
 * time, with the rubric beside it, and exports the CSV study-kappa.ts reads.
 *
 * Blinding is enforced here, not trusted:
 *   - prompts are projected through an allowlist, so the record id field (a
 *     direct address of the public record, and so its grade), source ids and
 *     any grade field never reach the page. Claim prose can still name a subject
 *     the public site can be searched for; that part of blinding rests on raters
 *     not consulting the site;
 *   - sentences in context, titles and excerpts that name a grade are withheld
 *     with a visible marker (study-leaks.ts); a claim that names one fails;
 *   - the finished page is scanned again and the build fails on any leak.
 *
 * The page makes no network request (its Content-Security-Policy forbids it).
 * Progress stays in the rater's browser; grades leave only as the CSV the
 * rater downloads and sends to the coordinator.
 *
 * Usage:
 *   npx tsx scripts/study-workbench.ts --sample research/study/raters/rater-a.json --out research/study/workbench/rater-a.html
 *   npx tsx scripts/study-workbench.ts --sample research/study/dry-run/raters/rater-b.json --out /tmp/rater-b.html --rater "Rater B"
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { findGradeLeaks, redactGradeLeaks, stringsIn, REDACTION_MARK } from './study-leaks.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TEMPLATE = join(HERE, 'study-workbench.template.html');

export type WorkbenchSource = { title: string; publisher: string; tier: number; excerpt?: string; url?: string };
export type WorkbenchPrompt = {
	study_id: string;
	kind: string;
	claim: string;
	context?: string;
	dates: { start: string | null; end: string | null };
	sources: WorkbenchSource[];
};

/** Keys a blinded prompt must never carry onto the page, at any depth. */
const FORBIDDEN_KEYS = ['id', 'confidence', 'basis', 'verification', 'attributed_to', 'reasoning', 'falsifiable_by', 'bucket'];

export class WorkbenchError extends Error {}

function str(v: unknown): string | undefined {
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Allowlist projection plus redaction. Anything not named here is dropped, so a
 * field added to the sampler later cannot reach a rater by default.
 */
export function projectPrompts(raw: unknown[]): { prompts: WorkbenchPrompt[]; redacted: number } {
	let redacted = 0;
	const withheld = (t: string | undefined) => {
		if (t === undefined) return undefined;
		const r = redactGradeLeaks(t);
		redacted += r.redacted;
		return r.text;
	};
	const prompts = raw.map((value, i) => {
		const p = value as Record<string, unknown>;
		const studyId = str(p.study_id);
		if (!studyId || !/^S\d{3,}$/.test(studyId)) throw new WorkbenchError(`prompt ${i} has no study_id of the form S001`);
		const claim = str(p.claim);
		if (!claim) throw new WorkbenchError(`${studyId} has no claim text`);
		const claimLeaks = findGradeLeaks(claim);
		if (claimLeaks.length > 0) {
			throw new WorkbenchError(`${studyId} claim names a grade (${claimLeaks[0].pattern}: "${claimLeaks[0].match}"). Fix the record or the sampler; a claim is never redacted.`);
		}
		const dates = (p.dates ?? {}) as Record<string, unknown>;
		const sources = Array.isArray(p.sources) ? (p.sources as Record<string, unknown>[]) : [];
		return {
			study_id: studyId,
			kind: str(p.kind) ?? 'record',
			claim,
			context: withheld(str(p.context)),
			dates: { start: str(dates.start) ?? null, end: str(dates.end) ?? null },
			sources: sources.map((s) => ({
				title: withheld(str(s.title)) ?? 'Untitled source',
				publisher: str(s.publisher) ?? 'unknown',
				tier: Number.isInteger(s.tier) ? (s.tier as number) : 5,
				excerpt: withheld(str(s.excerpt)),
				url: str(s.url)
			}))
		};
	});
	const ids = new Set(prompts.map((p) => p.study_id));
	if (ids.size !== prompts.length) throw new WorkbenchError('duplicate study_ids in the sample');
	return { prompts, redacted };
}

/** Every reason this payload would unblind a rater. Empty means safe to ship. */
export function auditPayload(prompts: WorkbenchPrompt[]): string[] {
	const problems: string[] = [];
	const walk = (v: unknown, path: string) => {
		if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
		else if (v && typeof v === 'object') {
			for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
				if (FORBIDDEN_KEYS.includes(k)) problems.push(`${path}.${k} is a forbidden key`);
				walk(x, `${path}.${k}`);
			}
		}
	};
	prompts.forEach((p) => walk(p, p.study_id));
	for (const p of prompts) {
		for (const s of stringsIn(p)) {
			for (const l of findGradeLeaks(s.text)) problems.push(`${p.study_id}.${s.path} names a grade (${l.pattern}: "${l.match}")`);
		}
	}
	return problems;
}

// ---------------------------------------------------------------------------
// Rubric: a small markdown renderer for one trusted file. Everything is escaped
// first; only the constructs rubric-v2.md uses are recognised.
// ---------------------------------------------------------------------------

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inline(s: string): string {
	return esc(s)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
}
function cells(row: string): string[] {
	return row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function renderMarkdown(md: string): string {
	const lines = md.replace(/\r\n/g, '\n').split('\n');
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.startsWith('```')) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
			i++;
			out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
			continue;
		}
		const h = /^(#{1,4})\s+(.*)$/.exec(line);
		if (h) {
			out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
			i++;
			continue;
		}
		if (/^---+\s*$/.test(line)) {
			out.push('<hr>');
			i++;
			continue;
		}
		if (line.trim().startsWith('|')) {
			const rows: string[] = [];
			while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
			const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
			const [head, ...rest] = body;
			out.push(
				'<table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
					rest.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
					'</tbody></table>'
			);
			continue;
		}
		if (line.startsWith('>')) {
			const body: string[] = [];
			while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
			out.push(`<blockquote>${body.map(inline).join('<br>')}</blockquote>`);
			continue;
		}
		if (/^\s*[-*]\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || (lines[i].trim() === '' && /^\s*[-*]\s+/.test(lines[i + 1] ?? '')))) {
				if (lines[i].trim()) items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
				i++;
			}
			out.push('<ul>' + items.map((it) => `<li>${inline(it)}</li>`).join('') + '</ul>');
			continue;
		}
		if (line.trim() === '') {
			i++;
			continue;
		}
		const para: string[] = [];
		while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\||---+\s*$)/.test(lines[i])) para.push(lines[i++]);
		out.push(`<p>${inline(para.join(' '))}</p>`);
	}
	return out.join('\n');
}

// ---------------------------------------------------------------------------
// Page assembly
// ---------------------------------------------------------------------------

export function buildWorkbench(opts: { prompts: unknown[]; rater: string; rubricMd: string; template?: string }): {
	html: string;
	fingerprint: string;
	redacted: number;
	count: number;
} {
	const { prompts, redacted } = projectPrompts(opts.prompts);
	const problems = auditPayload(prompts);
	if (problems.length > 0) throw new WorkbenchError(`blinding would break:\n  ${problems.slice(0, 20).join('\n  ')}`);

	const fingerprint = createHash('sha256').update(JSON.stringify({ rater: opts.rater, prompts })).digest('hex').slice(0, 12);
	const data = { rater: opts.rater, fingerprint, withheldMark: REDACTION_MARK, prompts };
	// Inside <script type="application/json"> only "</" can end the element; escape every "<".
	const json = JSON.stringify(data).replace(/</g, '\\u003c');
	const template = opts.template ?? readFileSync(TEMPLATE, 'utf8');
	if (!template.includes('/*DATA*/') || !template.includes('<!--RUBRIC-->')) throw new WorkbenchError('template is missing its DATA or RUBRIC placeholder');
	const html = template.replace('<!--RUBRIC-->', () => renderMarkdown(opts.rubricMd)).replace('/*DATA*/', () => json);

	// Scan the finished page's data block once more: what ships is what is checked.
	const block = /<script id="study-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
	if (!block) throw new WorkbenchError('assembled page has no data block');
	const shipped = JSON.parse(block[1]) as typeof data;
	const after = auditPayload(shipped.prompts);
	if (after.length > 0) throw new WorkbenchError(`the assembled page leaks:\n  ${after.slice(0, 20).join('\n  ')}`);

	return { html, fingerprint, redacted, count: prompts.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const sample = arg('sample');
	const out = arg('out');
	const rubric = arg('rubric') ?? join(ROOT, 'research/study/rubric-v2.md');
	if (!sample || !out) {
		console.error('Usage: npx tsx scripts/study-workbench.ts --sample <rater-x.json | sample-N-blinded.json> --out <page.html> [--rater "Rater A"] [--rubric rubric-v2.md]');
		process.exit(1);
	}
	for (const f of [sample, rubric]) {
		if (!existsSync(f)) {
			console.error(`not found: ${f}`);
			process.exit(1);
		}
	}
	const raw = JSON.parse(readFileSync(sample, 'utf8')) as { meta?: Record<string, unknown>; prompts?: unknown[] };
	if (!Array.isArray(raw.prompts) || raw.prompts.length === 0) {
		console.error(`${sample} has no prompts`);
		process.exit(1);
	}
	const rater = arg('rater') ?? str(raw.meta?.rater);
	if (!rater) {
		console.error('No rater pseudonym: pass --rater "Rater A", or use a per-rater file from study-blinding.ts --build');
		process.exit(1);
	}
	try {
		const r = buildWorkbench({ prompts: raw.prompts, rater, rubricMd: readFileSync(rubric, 'utf8') });
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, r.html, 'utf8');
		console.log(`Workbench for ${rater}: ${r.count} records, instrument ${r.fingerprint}`);
		console.log(`  withheld ${r.redacted} sentence(s) that named a grade`);
		console.log(`  record id, source id and grade fields: not on the page (claim prose may still name its subject)`);
		console.log(`  wrote ${out} (${Math.round(r.html.length / 1024)} KB)`);
		console.log(`\nSend the rater this one file, never the key. Their export is <rater>-${r.fingerprint}.csv.`);
	} catch (e) {
		if (e instanceof WorkbenchError) {
			console.error(`  FAIL  ${e.message}`);
			process.exit(1);
		}
		throw e;
	}
}
