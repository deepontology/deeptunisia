/**
 * card-inventory.ts — emit the full research backlog as docs/card-inventory.md.
 *
 * Reads the built dataset and buckets every card by research leverage:
 *   0  failures        — people with no sources at all (rule-2 violation)
 *   1  upgrade         — entities flagged needs-primary-source
 *   2  position-gaps   — positions flagged needs-primary-source
 *   3  relationship    — relationships needs-primary-source or unsubstantiated
 *   4  grade-c         — grade-C positions (attributed, need corroboration)
 *   5  verified        — cards already carrying primary records (count only)
 *
 * Run: npx tsx scripts/card-inventory.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'src', 'generated', 'dataset.json');
const OUT = join(HERE, '..', 'docs', 'card-inventory.md');

const d = JSON.parse(readFileSync(DATA, 'utf8')) as {
	people: any[];
	institutions: any[];
	positions: any[];
	relationships: any[];
	events: any[];
};

const line = (r: any, extra = '') =>
	`| ${r.id} | ${String(r.name_en ?? r.holder ?? '').replace(/\|/g, '\\|')} | ${r.confidence ?? ''} | ${r.verification ?? ''} | ${(r.sources ?? []).length} | ${String(r.basis ?? '').slice(0, 14)} ${extra} |`;

const buckets: string[] = [];
let counts = '';

// ── bucket 0: people with zero sources ─────────────────────────────────────
const noSources = d.people.filter((p) => !p.sources || p.sources.length === 0);
buckets.push(`## Bucket 0 — people with no sources (${noSources.length})\n\nBuild rule 2 requires a source on every claim. Fix these first.\n\n| id | name | conf | verification | sources | basis |\n|---|---|---|---|---|---|\n` + noSources.map((p) => line(p)).join('\n'));

// ── bucket 1: entities flagged needs-primary-source ────────────────────────
const entGap = [...d.people, ...d.institutions].filter((e) => e.verification === 'needs-primary-source');
buckets.push(`## Bucket 1 — entities needing primary source (${entGap.length})\n\nTarget: find the gazette decree or a tier-1 record. AI research can narrow candidates; humans confirm.\n\n| id | name | conf | verification | sources | basis |\n|---|---|---|---|---|---|\n` + entGap.map((e) => line(e)).join('\n'));

// ── bucket 2: positions flagged ────────────────────────────────────────────
const posGap = d.positions.filter((p) => p.verification === 'needs-primary-source');
buckets.push(`## Bucket 2 — positions needing primary source (${posGap.length})\n\nEach row is a (holder, role, span) claim. Research goal: corroborate dates or locate the decree.\n\n| id | role/holder | conf | verification | sources | basis |\n|---|---|---|---|---|---|\n` + posGap.map((p) => line(p)).join('\n'));

// ── bucket 3: relationships ────────────────────────────────────────────────
const relGap = d.relationships.filter((r) => r.verification === 'needs-primary-source' || r.basis === 'unsubstantiated');
buckets.push(`## Bucket 3 — relationships needing work (${relGap.length})\n\nUnsubstantiated = circulates with no reliable evidence; needs-primary-source = sourced but unverified.\n\n| id | summary | conf | verification | sources | basis |\n|---|---|---|---|---|---|\n` + relGap.map((r) => line(r, r.summary ? r.summary.slice(0, 40) : '')).join('\n'));

// ── bucket 4: grade-C positions ────────────────────────────────────────────
const gradeC = d.positions.filter((p) => p.confidence === 'C');
buckets.push(`## Bucket 4 — grade-C positions (${gradeC.length})\n\nSingle-source assessments with attribution. Research goal: corroborate with a second credible outlet → upgrade to B.\n\n| id | role/holder | conf | verification | sources | basis |\n|---|---|---|---|---|---|\n` + gradeC.map((p) => line(p)).join('\n'));

// ── bucket 5: verified entities (count only) ───────────────────────────────
const verified = d.people.filter((p) => p.verification === 'verified').length + d.institutions.filter((i) => i.verification === 'verified').length;
counts = `| bucket | count | action |\n|---|---|---|\n` +
	`| 0 — no sources | ${noSources.length} | add sources or remove |\n` +
	`| 1 — entities need primary | ${entGap.length} | find tier-1 record |\n` +
	`| 2 — positions need primary | ${posGap.length} | corroborate dates |\n` +
	`| 3 — relationships | ${relGap.length} | source or attribute |\n` +
	`| 4 — grade-C positions | ${gradeC.length} | second source → B |\n` +
	`| 5 — verified entities | ${verified} | check for new material only |\n` +
	`| **totals** | ${d.people.length + d.institutions.length} cards, ${d.positions.length} positions, ${d.relationships.length} relationships | |`;

const md = `# Card inventory — research backlog

Generated ${new Date().toISOString().slice(0, 10)} by scripts/card-inventory.ts.

Working document for the research pass. **Nothing here changes the graph.** Findings land in
data/ yaml (multi-source, high-confidence) or docs/research-log.md (single-source / contested).

## Buckets

${counts}

---
${buckets.join('\n\n---\n')}
`;

writeFileSync(OUT, md, 'utf8');
console.log(`wrote ${OUT}`);
console.log(counts);
