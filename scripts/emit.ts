/**
 * YAML patch emitter — the write path for the admin panel.
 *
 * This module edits `data/*.yaml`, which is the canonical dataset. Everything the
 * site publishes comes from these files, and git is the revision history. So the
 * one property that matters more than any feature here is:
 *
 *   AN EDIT CHANGES EXACTLY ONE CONTIGUOUS REGION OF THE FILE. NOTHING ELSE MOVES.
 *
 * That is not a stylistic preference. A moderator reviewing a proposed change has
 * to be able to read the diff, and a diff that reflows nine hundred unrelated
 * lines is not reviewable — it is a rubber stamp with extra steps. The standing
 * trap in AGENTS.md is that bulk edits have already silently corrupted seven files
 * in this repository.
 *
 * WHY NOT parse -> modify -> stringify, which would be far less code:
 *
 * Because it does not round-trip. Measured on the real data, 29 July 2026: the
 * yaml library re-emits `[political]` as `[ political ]` and re-folds every block
 * scalar to its own width, producing 4,268 changed lines in people.yaml for an
 * edit of one field. No stringify option fixes it, because the files are not
 * uniformly wrapped — prose is hand-wrapped near 100 columns while flow sequences
 * run to 394. There is no width that reproduces both.
 *
 * So this module never calls doc.toString(). It parses only to locate byte offsets,
 * then splices the original string. Every byte outside the spliced region is the
 * original byte, by construction rather than by care.
 *
 * Line endings are preserved for the same reason: the source string is spliced as
 * it was read, CRLF and all, and inserted text adopts the file's prevailing ending.
 */
import { parseDocument, stringify, isMap, isSeq, isScalar, type YAMLMap } from 'yaml';

/**
 * How to find the record being edited.
 *
 * `id` is the normal case and should be preferred wherever a record has one.
 *
 * The index form exists because relationships.yaml carried no id field until July
 * 2026, when every record was given one and the schema made it required. Targeting
 * by position is what made that migration possible: there was no id to target by.
 *
 * It is kept for the general case of a file whose records are not yet keyed, and
 * because `match` is the safer primitive it looks like — an index-targeted edit
 * states what it expects to find there and is refused if the record has moved.
 * Without that, a stale index writes onto whichever record happens to occupy the
 * slot, silently, and in this dataset that means about a different pair of named
 * people.
 */
export type Target = { id: string } | { index: number; match?: Record<string, string> };

/** A single change to one record. Each maps to one contiguous splice. */
export type Edit =
	| { op: 'set'; target: Target; field: string; value: unknown }
	| { op: 'add-field'; target: Target; field: string; value: unknown; at?: 'start' | 'end' }
	| { op: 'append-to-list'; target: Target; field: string; item: string }
	| { op: 'add-block'; target: Target; field: string; entries: Record<string, string> }
	| { op: 'append-record'; record: Record<string, unknown> };

const describe = (t: Target) => ('id' in t ? `"${t.id}"` : `#${t.index}`);

export class EmitError extends Error {}

/** The region a splice touched, so callers can render or assert on it. */
export interface Splice {
	text: string;
	start: number;
	end: number;
	replaced: string;
}

export interface EmitResult {
	text: string;
	splice: Splice;
}

// ---------------------------------------------------------------------------
// Locating
// ---------------------------------------------------------------------------

type Doc = ReturnType<typeof parseDocument> & { contents: { items: unknown[] } };
type Records = Array<Record<string, unknown>>;

/**
 * Parse once and thread the result through.
 *
 * Parsing a 150 KB file costs ~80 ms, and an earlier version of this module did it
 * four times per edit — once to find the record, once to re-validate, twice more
 * inside the guard — which put a single field change at 333 ms and a full-corpus
 * test sweep at three and a half minutes. Two parses is the floor: the source, and
 * the result.
 */
function docOf(source: string): Doc {
	const doc = parseDocument(source);
	if (doc.errors.length) {
		throw new EmitError(`source does not parse: ${doc.errors[0].message}`);
	}
	if (!isSeq(doc.contents)) {
		throw new EmitError('expected a top-level sequence of records');
	}
	return doc as Doc;
}

function recordOf(doc: Doc, target: Target): YAMLMap {
	if ('id' in target) {
		for (const item of doc.contents.items) {
			if (isMap(item) && item.get('id') === target.id) return item;
		}
		throw new EmitError(`no record with id "${target.id}"`);
	}

	const item = doc.contents.items[target.index];
	if (!isMap(item)) throw new EmitError(`no record at index ${target.index}`);

	// A positional target must prove it still points at what the caller meant.
	for (const [field, expected] of Object.entries(target.match ?? {})) {
		const actual = item.get(field);
		if (actual !== expected) {
			throw new EmitError(
				`record #${target.index} has ${field}="${actual}", expected "${expected}" — ` +
					`the file has changed under this edit`
			);
		}
	}
	return item;
}

function pairOf(record: YAMLMap, field: string) {
	const pair = record.items.find((p) => isScalar(p.key) && p.key.value === field);
	return pair;
}

/**
 * Byte range of a node's value, excluding any trailing comment.
 *
 * yaml gives [start, value-end, node-end]; node-end swallows trailing comments and
 * the newline, so splicing to it would eat a moderator's note.
 */
function valueRange(node: unknown): [number, number] {
	const range = (node as { range?: [number, number, number] })?.range;
	if (!range) throw new EmitError('node carries no source range');
	return [range[0], range[1]];
}

// ---------------------------------------------------------------------------
// Serialising
// ---------------------------------------------------------------------------

/**
 * Render one value as inline YAML.
 *
 * lineWidth: 0 disables folding — an inserted value must never introduce a wrap,
 * because a wrap is a second changed line and the splice stops being minimal.
 */
function inlineValue(value: unknown): string {
	/*
	 * collectionStyle 'flow' is not cosmetic. The default is block, so a list came
	 * out as "- a" on the same line as its key — `sources: - carnegie` — which is
	 * not valid YAML. A single-element list contains no newline, so it sailed past
	 * the one-line check below and only a multi-element one was ever caught.
	 *
	 * flowCollectionPadding false matches how these files are already written:
	 * `[a, b]`, not `[ a, b ]`.
	 */
	const out = stringify(value, {
		lineWidth: 0,
		collectionStyle: 'flow',
		flowCollectionPadding: false
	}).trimEnd();
	if (out.includes('\n')) {
		throw new EmitError(`value does not fit on one line: ${JSON.stringify(value)}`);
	}
	/*
	 * U+FFFD is the replacement character: it means some earlier step decoded bytes
	 * it could not read and gave up, silently. It is never a character anyone
	 * intended to write.
	 *
	 * This dataset is Arabic, French and English, so mojibake is not a hypothetical
	 * — a cp1252 request body once put "D�cret" into a source title here, which
	 * was valid YAML, passed the schema, and would have sat in the file indefinitely.
	 * Callers should reject bad input at the door; this is the backstop for the paths
	 * that forget.
	 */
	if (out.includes('�')) {
		throw new EmitError(
			`value contains U+FFFD, the replacement character — its text was decoded from ` +
				`the wrong encoding somewhere upstream: ${JSON.stringify(out.slice(0, 60))}`
		);
	}

	/*
	 * Quote scalars whose meaning depends on which YAML the reader implements.
	 *
	 * `1957-07-26` is a string under YAML 1.2's core schema and a timestamp under
	 * 1.1, so written unquoted it reads back differently depending on the parser.
	 * These files are a published open-data export that other people parse with
	 * other libraries. The dataset already quotes every date token — "2004",
	 * "~1995", "?" — and leaves plain words like `ongoing` bare, so this follows a
	 * convention rather than inventing one.
	 *
	 * The first test written for this asserted only that the value parsed back as a
	 * string. It did — with the same library that wrote it. That is not the property
	 * that matters; the emitted text is.
	 */
	if (typeof value === 'string' && /^[\d~<>?]/.test(value) && !out.startsWith('"')) {
		return JSON.stringify(value);
	}
	return out;
}

/** The file's prevailing line ending, so inserted lines match what is already there. */
function lineEnding(source: string): string {
	return source.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Whitespace that puts a new line in the same column as `offset`.
 *
 * Not simply the leading whitespace of the line: a record's first key sits on the
 * `- id: x` line, where the leading whitespace is empty but the key's column is 2.
 * Taking the prefix and blanking its non-whitespace turns `- ` into `  `, which is
 * where the record's other keys actually are.
 */
function indentAt(source: string, offset: number): string {
	const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
	return source.slice(lineStart, offset).replace(/[^\t ]/g, ' ');
}

/**
 * Offset just past a record's last field, and the indentation its keys sit at.
 *
 * Insertion happens here rather than at the record's end range, because the end
 * range includes the blank line separating records — inserting past it would put
 * the new field inside the *next* record.
 */
function endOfFields(source: string, record: YAMLMap): { at: number; indent: string } {
	let last = -1;
	for (const pair of record.items) {
		const node = pair.value ?? pair.key;
		const [, end] = valueRange(node);
		if (end > last) last = end;
	}
	if (last < 0) throw new EmitError('record has no fields');

	// Carry past a trailing comment on the same line, so we insert below it.
	const nextNewline = source.indexOf('\n', last);
	const restOfLine = source.slice(last, nextNewline === -1 ? source.length : nextNewline);
	if (restOfLine.trimStart().startsWith('#')) last = nextNewline === -1 ? source.length : nextNewline;

	const firstKey = record.items[0].key;
	const [keyStart] = valueRange(firstKey);
	return { at: last, indent: indentAt(source, keyStart) };
}

function splice(source: string, start: number, end: number, text: string): EmitResult {
	return {
		text: source.slice(0, start) + text + source.slice(end),
		splice: { text, start, end, replaced: source.slice(start, end) }
	};
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function opSet(source: string, doc: Doc, target: Target, field: string, value: unknown): EmitResult {
	const record = recordOf(doc, target);
	const pair = pairOf(record, field);
	if (!pair) throw new EmitError(`record ${describe(target)} has no field "${field}" — use add-field`);
	if (!pair.value) throw new EmitError(`field "${field}" on ${describe(target)} has no value to replace`);

	const [start, end] = valueRange(pair.value);
	return splice(source, start, end, inlineValue(value));
}

function opAddField(
	source: string,
	doc: Doc,
	target: Target,
	field: string,
	value: unknown,
	where: 'start' | 'end' = 'end'
): EmitResult {
	const record = recordOf(doc, target);
	if (pairOf(record, field)) throw new EmitError(`record ${describe(target)} already has "${field}" — use set`);

	const eol = lineEnding(source);

	if (where === 'start') {
		// Insert ahead of the first key, on the `- ` line. Every other data file puts
		// `id` first, and a record whose id is buried at the bottom reads as an
		// afterthought rather than the record's name.
		const [keyStart] = valueRange(record.items[0].key);
		const indent = indentAt(source, keyStart);
		return splice(source, keyStart, keyStart, `${field}: ${inlineValue(value)}${eol}${indent}`);
	}

	const { at, indent } = endOfFields(source, record);
	// When the last field's value range ends at the start of the next record's
	// `- id:` line (no blank line between records), `at` sits on a `-` rather
	// than a newline.  Without a trailing eol the new field concatenates with
	// the next record's dash on the same line, producing invalid YAML.
	const trail = at < source.length && source[at] !== '\n' && source[at] !== '\r' ? eol : '';
	return splice(source, at, at, `${eol}${indent}${field}: ${inlineValue(value)}${trail}`);
}

function opAppendToList(source: string, doc: Doc, target: Target, field: string, item: string): EmitResult {
	const record = recordOf(doc, target);
	const pair = pairOf(record, field);
	if (!pair?.value) throw new EmitError(`record ${describe(target)} has no list "${field}"`);
	if (!isSeq(pair.value)) throw new EmitError(`field "${field}" on ${describe(target)} is not a list`);

	const seq = pair.value;
	if (seq.items.some((i) => isScalar(i) && i.value === item)) {
		throw new EmitError(`"${item}" is already in ${describe(target)}.${field}`);
	}

	const [start, end] = valueRange(seq);
	const text = source.slice(start, end);

	if (text.trimStart().startsWith('[')) {
		// Flow sequence: insert before the closing bracket, preserving its spacing.
		const close = text.lastIndexOf(']');
		const inner = text.slice(0, close).trimEnd();
		const empty = inner.replace('[', '').trim() === '';
		const at = start + close;
		return splice(source, at, at, empty ? item : `, ${item}`);
	}

	// Block sequence: a new "- item" line at the dash column.
	const lastItem = seq.items[seq.items.length - 1];
	const [itemStart, itemEnd] = valueRange(lastItem);
	const dash = source.lastIndexOf('-', itemStart);
	const indent = indentAt(source, dash);
	const eol = lineEnding(source);
	return splice(source, itemEnd, itemEnd, `${eol}${indent}- ${item}`);
}

/**
 * A nested block of scalars — `review:` above all, which is the cheapest way to
 * move the review-coverage number that HANDOFF.md names as the top priority.
 */
function opAddBlock(
	source: string,
	doc: Doc,
	target: Target,
	field: string,
	entries: Record<string, string>
): EmitResult {
	const record = recordOf(doc, target);
	if (pairOf(record, field)) throw new EmitError(`record ${describe(target)} already has "${field}"`);
	if (Object.keys(entries).length === 0) throw new EmitError(`block "${field}" is empty`);

	const { at, indent } = endOfFields(source, record);
	const eol = lineEnding(source);
	const inner = indent + '  ';
	const lines = Object.entries(entries).map(([k, v]) => `${eol}${inner}${k}: ${inlineValue(v)}`);
	const trail = at < source.length && source[at] !== '\n' && source[at] !== '\r' ? eol : '';
	return splice(source, at, at, `${eol}${indent}${field}:` + lines.join('') + trail);
}

/**
 * A new record at the end of the file.
 *
 * Appending rather than inserting into a themed section is deliberate: the section
 * comments are editorial, and guessing where a record belongs would move it under a
 * heading that may not describe it. A human can move it; a human cannot easily
 * notice that it was silently filed wrong.
 */
function opAppendRecord(source: string, doc: Doc, record: Record<string, unknown>): EmitResult {
	if (typeof record.id !== 'string' || !record.id) {
		throw new EmitError('a new record needs a string id');
	}
	for (const item of doc.contents.items) {
		if (isMap(item) && item.get('id') === record.id) {
			throw new EmitError(`record "${record.id}" already exists`);
		}
	}

	const eol = lineEnding(source);
	const body = Object.entries(record)
		.map(([k, v], i) => `${i === 0 ? '- ' : '  '}${k}: ${inlineValue(v)}`)
		.join(eol);

	// Append after the file's existing trailing newline, separated by a blank line.
	const trimmed = source.replace(/[\r\n]+$/, '');
	return splice(source, trimmed.length, source.length, `${eol}${eol}${body}${eol}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Apply one edit. Returns the new file text and the region that changed.
 *
 * The single-contiguous-region property is asserted, not assumed: if an operation
 * ever produced a scattered change, this throws rather than writing the file. A
 * silent whole-file rewrite is the failure this module exists to prevent, so it
 * must not be possible to ship one even through a bug in this module.
 */
export function applyEdit(source: string, edit: Edit): EmitResult {
	const doc = docOf(source);
	const result = (() => {
		switch (edit.op) {
			case 'set':
				return opSet(source, doc, edit.target, edit.field, edit.value);
			case 'add-field':
				return opAddField(source, doc, edit.target, edit.field, edit.value, edit.at);
			case 'append-to-list':
				return opAppendToList(source, doc, edit.target, edit.field, edit.item);
			case 'add-block':
				return opAddBlock(source, doc, edit.target, edit.field, edit.entries);
			case 'append-record':
				return opAppendRecord(source, doc, edit.record);
		}
	})();

	// The result must still be YAML. Schema validation is the caller's job — it
	// needs the whole file set to check cross-file references — but a file that no
	// longer parses must never reach disk.
	const reparsed = parseDocument(result.text);
	if (reparsed.errors.length) {
		throw new EmitError(`edit produced invalid YAML: ${reparsed.errors[0].message}`);
	}

	// Both sides are already parsed here; hand the guard the trees rather than the
	// strings so it does not parse a third and fourth time.
	const before = doc.toJS() as Records;

	/*
	 * The guard keys records by id, falling back to position. So the target's key
	 * has to be read off the RECORD, not off the form of the target: an index-
	 * targeted edit to a record that has an id is keyed by that id, and only a
	 * record with no id is keyed by its position.
	 *
	 * Deriving it from the target form instead meant an index-targeted edit to a
	 * keyed record looked to the guard like damage to an unrelated record — the
	 * target was never exempted, because the guard was looking for "#0" and the
	 * record was called something else.
	 */
	let targetKey: string | null = null;
	if (edit.op !== 'append-record') {
		if ('id' in edit.target) targetKey = edit.target.id;
		else {
			const existing = before[edit.target.index]?.id;
			targetKey = typeof existing === 'string' ? existing : `#${edit.target.index}`;
		}
	}

	assertOnlyTargetChanged(before, reparsed.toJS() as Records, targetKey);

	return result;
}

/**
 * Verify that no record except the target came out different.
 *
 * This is the guard that matters, and it has to work semantically rather than
 * textually. An earlier version of it compared common prefix and suffix lengths
 * and concluded that a change was "contiguous" — which is true of *any* pair of
 * strings, so it accepted a file with two separate edits in it and reported green.
 * A test that cannot fail is not a test; the same trap is recorded in AGENTS.md
 * about hypothesis falsifiers.
 *
 * Parsing both sides costs a few milliseconds on a 150 KB file. That is nothing
 * against the cost of writing a corrupted record into the canonical dataset, which
 * has already happened here once.
 *
 * `targetId` is null for an append, where every pre-existing record must survive
 * untouched and exactly one new one may appear.
 */
export function assertOnlyTargetChanged(
	before: string | Records,
	after: string | Records,
	targetId: string | null
): void {
	const index = (source: string | Records) => {
		const parsed = typeof source === 'string' ? (parseDocument(source).toJS() as Records) : source;
		const map = new Map<string, string>();
		const order: string[] = [];
		parsed.forEach((record, i) => {
			// Records without an id are keyed by position. Skipping them — as an earlier
			// version did — made this guard silently vacuous across the whole of
			// relationships.yaml, which then had no ids at all: the one file where a
			// misplaced edit is hardest to notice, because the records look alike.
			const key = typeof record?.id === 'string' ? record.id : `#${i}`;
			map.set(key, JSON.stringify(record));
			order.push(key);
		});
		return { map, order };
	};

	const a = index(before);
	const b = index(after);

	for (const [id, value] of a.map) {
		if (id === targetId) continue;
		if (!b.map.has(id)) throw new EmitError(`edit deleted unrelated record "${id}"`);
		if (b.map.get(id) !== value) throw new EmitError(`edit altered unrelated record "${id}"`);
	}

	const expected = targetId === null ? a.order.length + 1 : a.order.length;
	if (b.order.length !== expected) {
		throw new EmitError(`record count went ${a.order.length} -> ${b.order.length}, expected ${expected}`);
	}

	// Order is meaning here: records sit under editorial section comments, so a
	// reordering would silently refile a person under the wrong heading.
	//
	// One slot may legitimately change key: the target's. A record with no id is
	// keyed by position, so giving it an id — which is exactly what the relationship
	// migration does — changes its key without moving it. Only that slot is exempt,
	// and only when it is the slot being edited.
	const exempt = targetId === null ? -1 : a.order.indexOf(targetId);
	for (let i = 0; i < a.order.length; i++) {
		if (i === exempt) continue;
		if (a.order[i] !== b.order[i]) {
			throw new EmitError(`edit reordered records at position ${i}: ${a.order[i]} -> ${b.order[i]}`);
		}
	}
}
