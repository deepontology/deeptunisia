/**
 * Compiles investigation YAML + markdown into JSON bundles for the media section.
 *
 * Reads from src/content/media/<slug>/ (YAML + narrative/*.md)
 * Writes to:
 *   src/generated/media/<slug>.json — pre-compiled investigation bundle
 *   src/generated/media/index.json — list of all investigations
 *   static/media/<slug>/ — public CSV exports
 *
 * Validates referential integrity: every [C...] and @entity in the narrative
 * must resolve; [I...] references resolve against interpretations.yaml and
 * every interpretation must be referenced exactly somewhere; claim grades come
 * from a fixed vocabulary; and the absolutes lint requires any long paragraph
 * asserting a number or a universal ("never", "only", "every", ...) to carry
 * at least one claim reference. Build fails on any violation.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// Fixture overrides (same convention as build-data.ts's DT_DATA_DIR): the
// mutation suites copy src/content/media to a throwaway tree and point the
// builder at it, so a validator can be fed a defect without ever touching the
// real source files. Unset — the normal build — behaves exactly as before.
const MEDIA_DIR = process.env.DT_MEDIA_DIR ?? join(ROOT, 'src', 'content', 'media');
const OUT_DIR = process.env.DT_MEDIA_OUT_DIR ?? join(ROOT, 'src', 'generated', 'media');
const STATIC_DIR = process.env.DT_MEDIA_STATIC_DIR ?? join(ROOT, 'static', 'media');

// ── YAML parser ─────────────────────────────────────────────────────────────

function loadYaml<T = unknown>(filePath: string): T {
	const raw = readFileSync(filePath, 'utf-8');
	return parseYaml(raw) as T;
}

function loadOptionalYaml<T = unknown>(filePath: string, fallback: T): T {
	if (!existsSync(filePath)) return fallback;
	return loadYaml<T>(filePath);
}

// ── Markdown narrative parser ───────────────────────────────────────────────

interface ContentInline {
	t: 'text' | 'strong' | 'em' | 'code' | 'link' | 'claim_ref' | 'entity_ref';
	v?: string;
	href?: string;
	label?: string;
	claim_id?: string;
	entity_id?: string;
	children?: ContentInline[];
}

interface ContentBlock {
	t: 'h1' | 'h2' | 'h3' | 'p' | 'section' | 'interp';
	id?: string;
	title?: string;
	section_type?: string;
	v?: ContentInline[];
	items?: ContentInline[][];
	ref?: string;
}

function parseInline(text: string): ContentInline[] {
	const nodes: ContentInline[] = [];
	// Match: **bold**, *italic*, [C048], @entity-id, [text](url), or plain text
	const re = /(\*\*(.+?)\*\*|\*(.+?)\*|\[([A-Z]\d+)\]|@([a-z0-9-]+)|\[([^\]]+)\]\(([^)]+)\))/g;
	let lastIdx = 0;
	let m: RegExpExecArray | null;

	while ((m = re.exec(text)) !== null) {
		// Plain text before match
		if (m.index > lastIdx) {
			nodes.push({ t: 'text', v: text.slice(lastIdx, m.index) });
		}

		if (m[2]) {
			// Bold
			nodes.push({ t: 'strong', children: [{ t: 'text', v: m[2] }] });
		} else if (m[3]) {
			// Italic
			nodes.push({ t: 'em', children: [{ t: 'text', v: m[3] }] });
		} else if (m[4]) {
			// Claim reference [C048]
			nodes.push({ t: 'claim_ref', claim_id: m[4] });
		} else if (m[5]) {
			// Entity mention @entity-id
			nodes.push({ t: 'entity_ref', entity_id: m[5] });
		} else if (m[6] && m[7]) {
			// Link [text](url)
			nodes.push({ t: 'link', href: m[7], label: m[6] });
		}

		lastIdx = m.index + m[0].length;
	}

	// Remaining text
	if (lastIdx < text.length) {
		nodes.push({ t: 'text', v: text.slice(lastIdx) });
	}

	return nodes;
}

function parseNarrative(
	markdown: string,
	onMalformedInterp?: (raw: string) => void
): ContentBlock[] {
	const blocks: ContentBlock[] = [];
	// Strip \r from CRLF line endings before splitting
	const lines = markdown.replace(/\r/g, '').split('\n');
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		// Interpretation reference block: a paragraph whose lines ALL begin with
		// "> ". These are markers like "> [I3]" pointing into interpretations.yaml,
		// not quoted prose, so they must resolve to an [I#] token — anything else
		// in this shape is a mistake the build refuses to guess at.
		if (trimmed.startsWith('>')) {
			const quoteLines: string[] = [];
			while (i < lines.length && lines[i].trim().startsWith('>')) {
				quoteLines.push(lines[i]);
				i++;
			}
			const stripped = quoteLines.map((l) => l.trim().replace(/^>\s?/, '')).join(' ').trim();
			const ref = stripped.match(/\[(I\d+)\]/);
			if (ref) {
				blocks.push({ t: 'interp', ref: ref[1] });
			} else if (onMalformedInterp) {
				onMalformedInterp(stripped);
			}
			continue;
		}

		// First frontmatter block (YAML between --- pairs at the very start)
		if (trimmed === '---' && i === 0) {
			i++;
			const fm: Record<string, string> = {};
			while (i < lines.length && lines[i].trim() !== '---') {
				const kv = lines[i].match(/^(\w+):\s*"?([^"]*)"?$/);
				if (kv) fm[kv[1]] = kv[2];
				i++;
			}
			i++; // skip closing ---
			if (fm.section_id) {
				blocks.push({
					t: 'section',
					id: fm.section_id,
					title: fm.title || '',
					section_type: fm.type || 'narrative'
				});
			}
			continue;
		}

		// Section separator: --- followed by <section_id: ...> tag
		if (trimmed === '---') {
			i++;
			// Skip empty lines between --- and the section tag
			while (i < lines.length && lines[i].trim() === '') {
				i++;
			}
			// Check if next line contains a section tag (with or without angle brackets)
			if (i < lines.length) {
				const nextTrimmed = lines[i].trim();
				const tagMatch = nextTrimmed.match(/(?:<)?section_id:\s*(\w+)(?:>)?/);
				if (tagMatch) {
					const sectionId = tagMatch[1];
					i++; // skip the tag line
					// Read title and type from following lines until ---
					let title = '';
					let sectionType = 'narrative';
					while (i < lines.length && lines[i].trim() !== '---') {
						const kv = lines[i].trim().match(/^(\w+):\s*"?([^"]*)"?$/);
						if (kv) {
							if (kv[1] === 'title') title = kv[2];
							if (kv[1] === 'type') sectionType = kv[2];
						}
						i++;
					}
					if (i < lines.length) i++; // skip closing ---
					blocks.push({
						t: 'section',
						id: sectionId,
						title,
						section_type: sectionType
					});
					continue;
				}
			}
			// Plain --- separator (not a section tag)
			continue;
		}

		// Headings
		const h3 = trimmed.match(/^### (.+)$/);
		const h2 = trimmed.match(/^## (.+)$/);
		const h1 = trimmed.match(/^# (.+)$/);

		if (h3) {
			blocks.push({ t: 'h3', v: parseInline(h3[1]) });
			i++;
			continue;
		}
		if (h2) {
			blocks.push({ t: 'h2', v: parseInline(h2[1]) });
			i++;
			continue;
		}
		if (h1) {
			blocks.push({ t: 'h1', v: parseInline(h1[1]) });
			i++;
			continue;
		}

		// Unordered list
		if (trimmed.match(/^[-*] /)) {
			const items: ContentInline[][] = [];
			while (i < lines.length && lines[i].trim().match(/^[-*] /)) {
				const itemText = lines[i].trim().replace(/^[-*] /, '');
				items.push(parseInline(itemText));
				i++;
			}
			blocks.push({ t: 'ul', items });
			continue;
		}

		// Ordered list
		if (trimmed.match(/^\d+\.\s/)) {
			const items: ContentInline[][] = [];
			while (i < lines.length && lines[i].trim().match(/^\d+\.\s/)) {
				const itemText = lines[i].trim().replace(/^\d+\.\s/, '');
				items.push(parseInline(itemText));
				i++;
			}
			blocks.push({ t: 'ol', items });
			continue;
		}

		// Empty line
		if (trimmed === '') {
			i++;
			continue;
		}

		// Paragraph — collect lines until empty line, heading, list, quote or
		// section separator (a "> " line starts an interpretation block above)
		const paraLines: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== '' &&
			!lines[i].trim().startsWith('>') &&
			!lines[i].trim().match(/^#{1,3} /) &&
			lines[i].trim() !== '---' &&
			!lines[i].trim().match(/^[-*] /) &&
			!lines[i].trim().match(/^\d+\.\s/)
		) {
			paraLines.push(lines[i]);
			i++;
		}
		if (paraLines.length > 0) {
			const text = paraLines.join(' ').trim();
			if (text) {
				blocks.push({ t: 'p', v: parseInline(text) });
			}
		}
	}

	return blocks;
}

// ── Validation ──────────────────────────────────────────────────────────────

interface ValidationIssue {
	slug: string;
	type:
		| 'missing_claim'
		| 'missing_entity'
		| 'bad_grade'
		| 'missing_interpretation'
		| 'orphaned_interpretation'
		| 'interp_section_unknown'
		| 'absolutes_without_claim';
	detail: string;
}

/**
 * The grades a media claim may carry. `disputed`, `negative`, `layer` and
 * `text_note` are optional FIELDS on a claim, not grades. Anything outside
 * this set means the ledger is grading in a vocabulary no renderer can colour,
 * so the build refuses rather than quietly painting the claim as documented.
 */
const CLAIM_GRADES = new Set(['documented', 'reported', 'unsubstantiated']);

/**
 * Absolutes lint: prose that asserts a number or a universal ("never",
 * "only", "every", ...) is exactly the prose most likely to be read as fact.
 * In a paragraph long enough to carry real information, such an assertion
 * must point at graded evidence via a [C…] reference. Short asides are exempt;
 * there is no allowlist — if this fires, fix the prose or cite the claim.
 */
const ABSOLUTE_RE = /\b(?:never|only|largest|smallest|first|last|every|always|none)\b/i;

/** Plain text of an inline node list: markdown syntax stripped, entity IDs and
 *  claim markers contribute nothing; every claim_ref is counted instead. */
function inlinePlain(nodes: ContentInline[]): { text: string; claimRefs: number } {
	let text = '';
	let claimRefs = 0;
	const walk = (list: ContentInline[]) => {
		for (const n of list) {
			if (n.t === 'claim_ref') {
				claimRefs++;
				continue;
			}
			if (n.t === 'entity_ref') continue; // an ID token, not prose
			if (n.children) {
				walk(n.children);
				continue;
			}
			text += n.t === 'link' ? n.label ?? '' : n.v ?? '';
		}
	};
	walk(nodes);
	return { text, claimRefs };
}

/** Interpretation section ids arrive unpadded from the source file (S4) while
 *  narrative markers are zero-padded (S04) — same normalization the timeline
 *  events get, so one honest id is not rejected for its shape. */
function normalizeSectionId(raw: string): string {
	return raw.replace(/^([A-Za-z])(\d+)$/, (_m, l: string, d: string) => `${l.toUpperCase()}${d.padStart(2, '0')}`);
}

function validate(
	slug: string,
	narrativeEn: string,
	sections: ContentBlock[],
	claims: Array<{ id: string }>,
	entities: Array<{ id: string }>,
	interpretations: Array<Record<string, unknown>>
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const claimIds = new Set(claims.map((c) => c.id));
	const entityIds = new Set(entities.map((e) => e.id));

	const sectionIds = new Set<string>();
	for (const b of sections) {
		if (b.t === 'section' && b.id) sectionIds.add(b.id);
	}

	// Check [C...] / [I...] references in narrative
	for (const m of narrativeEn.matchAll(/\[([A-Z]\d+)\]/g)) {
		const ref = m[1];
		if (/^I\d+$/.test(ref)) {
			if (!interpretations.some((r) => String(r.id ?? '') === ref)) {
				issues.push({ slug, type: 'missing_interpretation', detail: `Narrative references [${ref}] but no such interpretation in interpretations.yaml` });
			}
		} else if (!claimIds.has(ref)) {
			issues.push({ slug, type: 'missing_claim', detail: `Narrative references [${ref}] but no such claim in evidence.yaml` });
		}
	}

	// Check @entity references in narrative
	for (const m of narrativeEn.matchAll(/@([a-z0-9-]+)/g)) {
		if (!entityIds.has(m[1])) {
			issues.push({ slug, type: 'missing_entity', detail: `Narrative references @${m[1]} but no such entity in entities.yaml` });
		}
	}

	// Grade vocabulary: an unknown grade would silently borrow a colour it has
	// not earned (the renderer's default is deliberately neutral now).
	for (const c of claims) {
		const g = typeof (c as Record<string, unknown>).grade === 'string' ? ((c as Record<string, unknown>).grade as string) : '';
		if (!CLAIM_GRADES.has(g)) {
			issues.push({ slug, type: 'bad_grade', detail: `Claim ${c.id} carries unknown grade "${g}" — allowed: documented, reported, unsubstantiated` });
		}
	}

	// Interpretation integrity: every record referenced, every reference
	// resolvable, every section marker real.
	const narrated = new Set<string>();
	for (const m of narrativeEn.matchAll(/\[(I\d+)\]/g)) narrated.add(m[1]);
	for (const rec of interpretations) {
		const id = String(rec.id ?? '');
		if (!narrated.has(id)) {
			issues.push({ slug, type: 'orphaned_interpretation', detail: `Interpretation ${id} exists in interpretations.yaml but no [${id}] reference appears in the narrative` });
		}
		const rawSection = String(rec.section ?? '');
		const padded = normalizeSectionId(rawSection);
		if (!sectionIds.has(padded)) {
			issues.push({ slug, type: 'interp_section_unknown', detail: `Interpretation ${id} names section "${rawSection}" (normalized "${padded}") but the narrative has no such section marker` });
		}
	}

	// Absolutes lint over parsed paragraphs (interp blocks excluded — they are
	// the editors' readings by construction and carry their own attribution).
	let currentSection: string | null = null;
	for (const block of sections) {
		if (block.t === 'section') {
			currentSection = block.id ?? null;
			continue;
		}
		if (block.t !== 'p') continue;
		const { text, claimRefs } = inlinePlain(block.v ?? []);
		if (text.length < 120) continue;
		if (!/\d/.test(text) && !ABSOLUTE_RE.test(text)) continue;
		if (claimRefs > 0) continue;
		const where = currentSection ? ` [${currentSection}]` : '';
		issues.push({
			slug,
			type: 'absolutes_without_claim',
			detail: `${slug}${where} absolutes lint: long paragraph states a figure or absolute with no claim reference: "${text.slice(0, 80)}"`
		});
	}

	return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────

interface InvestigationIndex {
	slug: string;
	title: Record<string, string>;
	subtitle: Record<string, string>;
	series?: { id: string; title: Record<string, string>; position: number };
	published: string;
	reading_time_minutes: number;
	overall_confidence: string;
	tags: string[];
	claim_count: number;
	source_count: number;
	disputed_count: number;
	unresolved_count: number;
}

function buildInvestigation(slug: string): { bundle: Record<string, unknown>; index: InvestigationIndex } {
	const dir = join(MEDIA_DIR, slug);
	console.log(`  Building ${slug}...`);

	// Load YAML files
	const meta = loadYaml<Record<string, unknown>>(join(dir, 'meta.yaml'));
	const research = loadOptionalYaml(join(dir, 'research.yaml'), {});
	const editorial = loadOptionalYaml(join(dir, 'editorial.yaml'), {});
	const components = loadOptionalYaml(join(dir, 'components.yaml'), { components: [] });
	const evidence = loadYaml<{ claims: Array<Record<string, unknown>> }>(join(dir, 'evidence.yaml'));
	const sources = loadYaml<{ sources: Array<Record<string, unknown>> }>(join(dir, 'sources.yaml'));
	const timeline = loadOptionalYaml(join(dir, 'timeline.yaml'), { events: [] });
	// Normalize timeline section references: the narrative section markers are
	// zero-padded (S01…S10) while the timeline file uses the source's own ids
	// (S1…S10). One canonical form or clicking a timeline event finds a marker
	// that does not exist and highlighting never fires.
	for (const ev of timeline.events ?? []) {
		if (typeof ev.section === 'string') {
			ev.section = ev.section.replace(/^([A-Z])(\d+)$/, (_m, l: string, d: string) => `${l}${d.padStart(2, '0')}`);
		}
	}
	const entities = loadOptionalYaml(join(dir, 'entities.yaml'), { entities: [] });
	const exclusions = loadOptionalYaml(join(dir, 'exclusions.yaml'), { exclusions: [] });
	// The interpretive layer. Absent file is normal — an investigation with no
	// editor readings simply carries an empty list, not a failure.
	const interpretations = loadOptionalYaml<{ interpretations: Array<Record<string, unknown>> }>(
		join(dir, 'interpretations.yaml'),
		{ interpretations: [] }
	);

	const problems: string[] = [];
	const reportProblem = (detail: string) => {
		console.error(`  ❌ ${detail}`);
		problems.push(detail);
	};

	// Load and parse narrative
	const narrativeDir = join(dir, 'narrative');
	const narrative: Record<string, { sections: ContentBlock[] }> = {};

	if (existsSync(narrativeDir)) {
		for (const file of readdirSync(narrativeDir)) {
			if (!file.endsWith('.md')) continue;
			const locale = file.replace('.md', '');
			const md = readFileSync(join(narrativeDir, file), 'utf-8');
			narrative[locale] = {
				sections: parseNarrative(md, (raw) => {
					reportProblem(`${slug}: malformed interpretation block — a ">"-prefixed paragraph with no [I#] reference: "${raw.slice(0, 60)}"`);
				})
			};

			// Validate referential integrity for English
			if (locale === 'en') {
				const issues = validate(
					slug,
					md,
					narrative[locale].sections,
					evidence.claims,
					entities.entities ?? [],
					interpretations.interpretations
				);
				for (const issue of issues) {
					reportProblem(issue.detail);
				}
			}
		}
	}

	if (problems.length > 0) {
		process.exit(1);
	}

	// Build the bundle
	const bundle: Record<string, unknown> = {
		slug,
		meta,
		research,
		editorial,
		components,
		evidence,
		sources,
		timeline,
		entities,
		exclusions,
		interpretations,
		narrative
	};

	// Build index entry
	const metaTyped = meta as Record<string, Record<string, string> & string>;
	const title = typeof metaTyped.title === 'object' ? metaTyped.title : { en: String(metaTyped.title ?? slug) };
	const subtitle = typeof metaTyped.subtitle === 'object' ? metaTyped.subtitle : { en: String(metaTyped.subtitle ?? '') };

	const index: InvestigationIndex = {
		slug,
		title,
		subtitle,
		series: (meta as Record<string, unknown>).series as InvestigationIndex['series'],
		published: String((meta as Record<string, unknown>).published ?? ''),
		reading_time_minutes: Number((meta as Record<string, unknown>).reading_time_minutes ?? 0),
		overall_confidence: String((meta as Record<string, unknown>).overall_confidence ?? ''),
		tags: ((meta as Record<string, unknown>).tags as string[]) ?? [],
		claim_count: evidence.claims.length,
		source_count: sources.sources.length,
		disputed_count: evidence.claims.filter((c) => c.disputed === true).length,
		unresolved_count: evidence.claims.filter((c) => c.grade === 'unsubstantiated').length
	};

	return { bundle, index };
}

// ── Entry point ─────────────────────────────────────────────────────────────

function main() {
	console.log('Building media investigations...');

	if (!existsSync(MEDIA_DIR)) {
		console.log('No media directory found, skipping.');
		return;
	}

	mkdirSync(OUT_DIR, { recursive: true });
	mkdirSync(STATIC_DIR, { recursive: true });

	const slugs = readdirSync(MEDIA_DIR).filter((entry) => {
		const full = join(MEDIA_DIR, entry);
		return statSync(full).isDirectory() && existsSync(join(full, 'meta.yaml'));
	});

	const indices: InvestigationIndex[] = [];

	for (const slug of slugs) {
		const { bundle, index } = buildInvestigation(slug);

		// Write bundle
		const outPath = join(OUT_DIR, `${slug}.json`);
		writeFileSync(outPath, JSON.stringify(bundle, null, 2));
		console.log(`  ✓ ${outPath}`);

		// Copy CSV files to static
		const dataDir = join(MEDIA_DIR, slug, 'data');
		if (existsSync(dataDir)) {
			const staticSlugDir = join(STATIC_DIR, slug);
			mkdirSync(staticSlugDir, { recursive: true });
			for (const file of readdirSync(dataDir)) {
				const src = join(dataDir, file);
				const dest = join(staticSlugDir, file);
				writeFileSync(dest, readFileSync(src));
			}
		}

		indices.push(index);
	}

	// Write index
	const indexPath = join(OUT_DIR, 'index.json');
	writeFileSync(indexPath, JSON.stringify(indices, null, 2));
	console.log(`  ✓ ${indexPath}`);

	console.log(`Built ${slugs.length} investigation(s).`);
}

main();
