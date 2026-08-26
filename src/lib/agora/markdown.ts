/**
 * The constrained markup a post may carry, parsed to a tree the renderer walks.
 *
 * WHY A TREE AND NOT A STRING OF HTML
 *
 * Nothing here ever produces markup for `{@html}`. This is the one surface in the
 * project that renders text written by the public, under a law that makes what
 * appears on the page the operator's problem, and an escaping bug in a
 * hand-rolled markdown-to-HTML pass is the most ordinary way a site like this gets
 * turned into a delivery mechanism for something else. A tree of tagged nodes
 * rendered by Svelte cannot inject anything, because no branch of it can emit a
 * tag the template does not already contain.
 *
 * WHAT IS SUPPORTED, AND WHY SO LITTLE
 *
 * Bold, italic, inline code, blockquote, links. That is the whole list.
 *
 * Blockquote is the one that earns its place: this is an evidence project, and
 * quoting what a source actually said is the single most common thing a person
 * will want to do in a thread about whether a record is right.
 *
 * Headings, images and tables are deliberately absent. Headings let one post
 * shout over its neighbours in a flat list; images are an unbounded moderation
 * surface and a way to serve content the operator never sees; tables invite the
 * forum to start reproducing the graph, which is precisely the register
 * separation the two navigation bubbles exist to protect.
 */

export interface MentionSpan {
	/** Graph record id. */
	id: string;
	start: number;
	end: number;
}

export type Inline =
	| { t: 'text'; v: string }
	| { t: 'strong'; v: Inline[] }
	| { t: 'em'; v: Inline[] }
	| { t: 'code'; v: string }
	| { t: 'link'; href: string; label: string; host: string }
	/** Resolved against the graph at render time — see `PostBody`. */
	| { t: 'mention'; id: string; raw: string };

export type Block = { t: 'p' | 'quote'; v: Inline[] };

/**
 * Only these schemes are ever turned into a link.
 *
 * `javascript:` is the obvious one, but `data:` is the one people forget: a
 * data URL can carry a whole HTML document, and a reader who follows it is on a
 * page of the author's design that still looks like it came from here.
 */
const SAFE_SCHEME = /^https?:\/\//i;

/**
 * Bare URLs, `[label](url)`, `**bold**`, `*italic*`, `` `code` ``.
 *
 * A SOURCE STRING, AND A FRESH REGEX PER CALL — DO NOT "OPTIMISE" THIS
 *
 * `inlines()` recurses, to parse the contents of a bold or italic run. A single
 * shared `/g` regex carries `lastIndex` as mutable state, so the inner call
 * rewinds it and the outer loop then rescans text it had already consumed —
 * matching the same span forever. That is an infinite loop inside a render, which
 * takes the tab with it: no error, no console output, just a page that stops.
 *
 * It reproduced on the first post containing bold text. Constructing the regex per
 * call costs nothing measurable against a post-sized string and makes the
 * recursion safe by construction.
 */
const INLINE_SOURCE =
	'(\\[([^\\]\\n]{1,120})\\]\\((https?:\\/\\/[^\\s)]{1,500})\\))' +
	'|(\\*\\*([^*\\n]{1,500})\\*\\*)' +
	'|(\\*([^*\\n]{1,500})\\*)' +
	'|(`([^`\\n]{1,500})`)' +
	'|(https?:\\/\\/[^\\s<>"\']{1,500})';

export function hostOf(url: string): string {
	try {
		return new URL(url).host.replace(/^www\./, '');
	} catch {
		return '';
	}
}

function safe(url: string): boolean {
	return SAFE_SCHEME.test(url) && hostOf(url) !== '';
}

/** Inline pass over a run of plain text containing no mentions. */
function inlines(text: string): Inline[] {
	const out: Inline[] = [];
	let last = 0;
	// Per call, never shared — see INLINE_SOURCE.
	const re = new RegExp(INLINE_SOURCE, 'g');

	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });

		if (m[1] && safe(m[3])) {
			out.push({ t: 'link', href: m[3], label: m[2], host: hostOf(m[3]) });
		} else if (m[4]) {
			out.push({ t: 'strong', v: inlines(m[5]) });
		} else if (m[6]) {
			out.push({ t: 'em', v: inlines(m[7]) });
		} else if (m[8]) {
			out.push({ t: 'code', v: m[9] });
		} else if (m[10] && safe(m[10])) {
			out.push({ t: 'link', href: m[10], label: m[10], host: hostOf(m[10]) });
		} else {
			// A match we decline to transform — an unsafe scheme, most often. It stays
			// visible as the text the author typed rather than vanishing, because a
			// disappearing link looks like censorship and a defanged one does not.
			out.push({ t: 'text', v: m[0] });
		}
		last = m.index + m[0].length;
	}

	if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
	return out;
}

/**
 * Parse a post body into blocks, splicing in the mentions recorded against it.
 *
 * Mentions arrive as offsets into the raw body rather than as markup, because the
 * graph is canonical and mutable: a record can be renamed or merged, and a post
 * that baked the name into its own text would drift away from the record it is
 * about and never come back. Resolving at render time means a rename propagates
 * everywhere it was ever mentioned, and a record that no longer exists degrades to
 * the plain words the author actually wrote.
 *
 * Blocks are split before mentions are applied, so a span is only ever consulted
 * inside the paragraph it falls in — which is also why an offset that has drifted
 * can garble one paragraph but never shift the rest of the post.
 */
export function parse(body: string, mentions: MentionSpan[] = []): Block[] {
	const blocks: Block[] = [];
	const spans = [...mentions]
		.filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start)
		.sort((a, b) => a.start - b.start);

	let cursor = 0;
	for (const raw of body.split(/\n{2,}/)) {
		const start = body.indexOf(raw, cursor);
		const offset = start === -1 ? cursor : start;
		cursor = offset + raw.length;

		const quote = /^\s*>/.test(raw);
		const text = quote ? raw.replace(/^[ \t]*>[ \t]?/gm, '') : raw;
		// Stripping the marker moves every offset in the block. Rather than track
		// that, mentions are skipped inside quotes: quoted text is somebody else's
		// words, which is the one place an automatic link into our own graph would be
		// putting our reading into their mouth.
		const within = quote
			? []
			: spans.filter((s) => s.start >= offset && s.end <= offset + raw.length);

		const parts: Inline[] = [];
		let at = 0;
		for (const s of within) {
			const rel = { start: s.start - offset, end: s.end - offset };
			if (rel.start < at) continue; // overlapping spans: first one wins
			if (rel.start > at) parts.push(...inlines(text.slice(at, rel.start)));
			parts.push({ t: 'mention', id: s.id, raw: text.slice(rel.start, rel.end) });
			at = rel.end;
		}
		if (at < text.length) parts.push(...inlines(text.slice(at)));

		if (parts.length) blocks.push({ t: quote ? 'quote' : 'p', v: parts });
	}

	return blocks;
}

/** Count links the way the server does, so the composer can warn before it refuses. */
export function countLinks(body: string): number {
	return body.match(/https?:\/\//gi)?.length ?? 0;
}
