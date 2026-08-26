/**
 * Long-form UI prose as per-locale content files (i18n-spec §5, class D).
 *
 * Sentences a reader reads are content, not dictionary keys. Each view ships
 * `src/content/<view>.{en,fr,ar}.md` with frontmatter carrying
 * `translated_by` — human | machine-reviewed | machine — and this module loads
 * the right locale with the en file as fallback.
 *
 * The i18n-spec suggested reusing the Agora post parser for rendering. It
 * cannot: posts have no headings, lists or internal links, and documents are
 * mostly those. So a document-tree parser lives here BESIDE it, under the same
 * rule — a tree, never HTML, so there is one renderer to audit (Content.svelte)
 * rather than a raw-html escape hatch per page.
 *
 * Headings may carry an id (`## Heading {#id}`). Ids are locale-independent —
 * the same id in all three files — so a page can interleave live data tables
 * between prose sections without depending on translated heading text:
 * `load('about').section('review-note')` returns the blocks under that heading
 * in the reader's language.
 *
 * TRAP, inherited from the Agora parser: the inline regex is built per call,
 * never shared. A shared /g regex carries lastIndex, and a nested call rewinds
 * it — an infinite loop on the first bold span. See markdown.ts.
 */

export type ContentInline =
	| { t: 'text'; v: string }
	| { t: 'strong'; v: ContentInline[] }
	| { t: 'em'; v: ContentInline[] }
	| { t: 'code'; v: string }
	| { t: 'link'; href: string; label: string };

export type ContentBlock =
	| { t: 'h2' | 'h3'; v: ContentInline[]; id: string | null }
	| { t: 'p'; v: ContentInline[]; id: string | null }
	| { t: 'ul' | 'ol'; items: ContentInline[][]; id: string | null }
	| { t: 'quote'; v: ContentInline[]; id: string | null }
	| { t: 'hr'; id: string | null };

export interface ContentDoc {
	locale: string;
	/** Same tier vocabulary the dataset's translation coverage uses. */
	translatedBy: 'human' | 'machine-reviewed' | 'model-reviewed' | 'machine';
	blocks: ContentBlock[];
	/** Blocks under the heading carrying this id, up to the next id-carrying heading. */
	section: (id: string) => ContentBlock[];
}

// Only these link targets ever become anchors: absolute internal paths and
// https. Everything else — javascript:, data:, anything unschemed — stays the
// visible text it was authored as. Content files are written by this project,
// not the public, but the rule costs nothing and keeps one policy.
const LINK_TARGET = /^(\/|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/;

function inlineLinkSafe(href: string): boolean {
	if (href.startsWith('/')) return true;
	return /^https?:\/\//i.test(href);
}

const INLINE_SOURCE =
	'(\\[([^\\]\\n]{1,200})\\]\\(([^\\s)]{1,500})\\))' +
	'|(\\*\\*([^*\\n]{1,800})\\*\\*)' +
	'|(\\*([^*\\n]{1,800})\\*)' +
	'|(`([^`\\n]{1,800})`)';

function inlines(text: string): ContentInline[] {
	const out: ContentInline[] = [];
	let last = 0;
	const re = new RegExp(INLINE_SOURCE, 'g'); // per call, never shared — see the trap

	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
		if (m[1] && inlineLinkSafe(m[3])) {
			out.push({ t: 'link', href: m[3], label: m[2] });
		} else if (m[1]) {
			out.push({ t: 'text', v: m[2] }); // declined link target: keep the label
		} else if (m[4]) {
			out.push({ t: 'strong', v: inlines(m[5]) });
		} else if (m[6]) {
			out.push({ t: 'em', v: inlines(m[7]) });
		} else if (m[8]) {
			out.push({ t: 'code', v: m[9] });
		}
		last = m.index + m[0].length;
	}
	if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
	return out;
}

const HEADING = /^(#{2,3})\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/;
/** A first-line `{#id}` marker turns any block into a section anchor. */
const PARA_ID = /^\{#([a-z0-9-]+)\}\s*$/;

function parseDoc(md: string): ContentBlock[] {
	const lines = md.split(/\r?\n/);
	const blocks: ContentBlock[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		if (line.trim() === '') {
			i++;
			continue;
		}
		const h = HEADING.exec(line);
		if (h) {
			blocks.push({ t: h[1] === '##' ? 'h2' : 'h3', v: inlines(h[2].trim()), id: h[3] ?? null });
			i++;
			continue;
		}
		if (/^\s*---+\s*$/.test(line)) {
			blocks.push({ t: 'hr', id: null });
			i++;
			continue;
		}
		if (/^\s*>/.test(line)) {
			const quote: string[] = [];
			while (i < lines.length && /^\s*>/.test(lines[i])) {
				quote.push(lines[i].replace(/^\s*>\s?/, ''));
				i++;
			}
			blocks.push({ t: 'quote', v: inlines(quote.join(' ')), id: null });
			continue;
		}
		const listKind = /^\s*([-*])\s+/.test(line) ? 'ul' : /^\s*\d+\.\s+/.test(line) ? 'ol' : null;
		if (listKind) {
			const items: ContentInline[][] = [];
			while (i < lines.length) {
				const m = listKind === 'ul' ? /^\s*[-*]\s+(.*)$/.exec(lines[i]) : /^\s*\d+\.\s+(.*)$/.exec(lines[i]);
				if (!m) break;
				items.push(inlines(m[1].trim()));
				i++;
			}
			blocks.push({ t: listKind, items, id: null });
			continue;
		}
		// A paragraph: run of non-blank lines until a blank line or a block opener.
		// A first line of the form {#id} is a section anchor, not content.
		let paraId: string | null = null;
		const para: string[] = [];
		const idLine = PARA_ID.exec(line);
		if (idLine) {
			paraId = idLine[1];
			i++;
		} else {
			para.push(line);
			i++;
		}
		while (i < lines.length && lines[i].trim() !== '' && !HEADING.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*---+\s*$/.test(lines[i]) && !PARA_ID.test(lines[i])) {
			para.push(lines[i]);
			i++;
		}
		if (para.length) blocks.push({ t: 'p', v: inlines(para.join(' ')), id: paraId });
		else if (paraId) blocks.push({ t: 'p', v: [], id: paraId });
	}
	return blocks;
}

const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n/;

export function parseContent(raw: string, locale: string): ContentDoc {
	const fm = FRONTMATTER.exec(raw);
	let translatedBy: ContentDoc['translatedBy'] = 'machine';
	let body = raw;
	if (fm) {
		body = raw.slice(fm[0].length);
		const tier = /translated_by:\s*(human|machine-reviewed|model-reviewed|machine)/.exec(fm[1]);
		if (tier) translatedBy = tier[1] as ContentDoc['translatedBy'];
	}
	const blocks = parseDoc(body);
	const doc: ContentDoc = {
		locale,
		translatedBy,
		blocks,
		section: (id) => {
			// From the block carrying this id (inclusive — headings, and any
			// block marked {#id}) up to the next id-carrying block. A heading
			// with an empty body renders alone; the page puts its live table
			// after it.
			const out: ContentBlock[] = [];
			let started = false;
			for (const b of blocks) {
				if (b.id !== null) {
					if (started) break;
					if (b.id === id) started = true;
				}
				if (started) out.push(b);
			}
			return out;
		}
	};
	return doc;
}

// All content files, bundled as raw strings. import.meta.glob is build-time:
// adding a file means adding it here implicitly, and the en/fr/ar sibling checks
// in test-i18n.ts keep the set honest.
const FILES = import.meta.glob('../content/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<
	string,
	string
>;

const loaded: Record<string, Record<string, ContentDoc>> = {};
for (const [path, raw] of Object.entries(FILES)) {
	const name = path.match(/\/([^/]+)\.([a-z]{2})\.md$/);
	if (!name) continue;
	(loaded[name[1]] ??= {})[name[2]] = parseContent(raw, name[2]);
}

/** The available views, for tests and the smoke audit. */
export const CONTENT_VIEWS = Object.keys(loaded).sort();

/** A content document in the reader's locale, falling back to en. */
export function content(view: string, locale: string): ContentDoc {
	const set = loaded[view];
	if (!set) throw new Error(`no content files for view "${view}"`);
	return set[locale] ?? set.en;
}
