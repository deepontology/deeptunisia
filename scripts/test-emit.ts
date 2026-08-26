/**
 * Assertions over the YAML patch emitter.
 *
 * emit.ts writes the canonical dataset, so the assertion that matters is not "did
 * the edit work" but "did anything ELSE change". A patch emitter that quietly
 * reformats the file it touches would put an unreviewable diff in front of a
 * moderator and, sooner or later, corrupt data nobody was looking at. Seven files
 * in this repository have already been silently corrupted once by a bulk edit.
 *
 * So most of what follows checks the file OUTSIDE the edit. The tests that assert
 * a change landed are the easy half; the tests that assert 148,000 other bytes are
 * still byte-for-byte identical are the ones worth having.
 *
 * Fixtures are the real data files, read from disk and never written back.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { applyEdit, assertOnlyTargetChanged, EmitError, type Edit } from './emit.ts';
import { riskOf } from './admin.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(HERE, '..', 'data', f), 'utf8');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

function throws(name: string, fn: () => unknown, expect: string) {
	checks++;
	try {
		fn();
		failures++;
		console.error(`  FAIL  ${name} — expected an error, got none`);
	} catch (e) {
		const message = (e as Error).message;
		const right = e instanceof EmitError && message.includes(expect);
		if (right) console.log(`  ok    ${name} — ${message}`);
		else {
			failures++;
			console.error(`  FAIL  ${name} — wrong error: ${message}`);
		}
	}
}

/**
 * The core assertion. Everything before and after the changed region must be the
 * original bytes, and the change must be one contiguous run.
 */
function untouchedOutside(before: string, after: string, start: number, end: number, added: string) {
	return (
		before.slice(0, start) === after.slice(0, start) &&
		before.slice(end) === after.slice(start + added.length) &&
		after.slice(start, start + added.length) === added
	);
}

const people = read('people.yaml');
const positions = read('positions.yaml');

console.log('\n  ── the file outside the edit ──\n');

// --- set -------------------------------------------------------------------

{
	const before = people;
	const { text, splice } = applyEdit(before, {
		op: 'set',
		target: { id: 'bourguiba' },
		field: 'tagline',
		value: 'Changed for the test'
	});

	ok(
		'set: only the spliced region differs',
		untouchedOutside(before, text, splice.start, splice.end, splice.text)
	);
	ok('set: the rest of the file is the same length', before.length - splice.replaced.length === text.length - splice.text.length);
	ok(
		'set: new value reads back',
		(parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba').tagline ===
			'Changed for the test'
	);
	ok(
		'set: neighbouring records are identical',
		(parseDocument(text).toJS() as any[]).find((r) => r.id === 'ben-ali').tagline ===
			(parseDocument(before).toJS() as any[]).find((r) => r.id === 'ben-ali').tagline
	);
	ok('set: one line changed', text.split('\n').length === before.split('\n').length);
}

// --- add-field -------------------------------------------------------------

{
	const before = people;
	const { text, splice } = applyEdit(before, {
		op: 'add-field',
		target: { id: 'bourguiba' },
		field: 'verification',
		value: 'needs-primary-source'
	});

	ok(
		'add-field: only the spliced region differs',
		untouchedOutside(before, text, splice.start, splice.end, splice.text)
	);
	ok('add-field: adds exactly one line', text.split('\n').length === before.split('\n').length + 1);
	ok(
		'add-field: value reads back',
		(parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba').verification ===
			'needs-primary-source'
	);
	ok(
		'add-field: record keeps every prior field',
		Object.keys((parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba')).length ===
			Object.keys((parseDocument(before).toJS() as any[]).find((r) => r.id === 'bourguiba')).length + 1
	);
}

// --- append-to-list --------------------------------------------------------

{
	const before = people;
	const { text, splice } = applyEdit(before, {
		op: 'append-to-list',
		target: { id: 'bourguiba' },
		field: 'sources',
		item: 'jort-1957-01'
	});

	ok(
		'append-to-list: only the spliced region differs',
		untouchedOutside(before, text, splice.start, splice.end, splice.text)
	);
	ok('append-to-list: no new lines', text.split('\n').length === before.split('\n').length);

	const after = (parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba').sources;
	ok('append-to-list: item appended last', after[after.length - 1] === 'jort-1957-01');
	ok('append-to-list: existing entries survive', after.includes('carnegie-quiet-revolution'));

	// Flow style must survive: rewriting [a, b] as a block list would be a
	// whole-record reformat dressed up as an append.
	ok('append-to-list: stays a flow sequence', /sources: \[.*jort-1957-01\]/.test(text));
}

// --- add-block (the review lever) ------------------------------------------

{
	const before = positions;
	const first = (parseDocument(before).toJS() as any[])[0];
	const { text, splice } = applyEdit(before, {
		op: 'add-block',
		target: { id: first.id },
		field: 'review',
		entries: { by: 'test', date: '2026-07-29', method: 'checked against the gazette' }
	});

	ok(
		'add-block: only the spliced region differs',
		untouchedOutside(before, text, splice.start, splice.end, splice.text)
	);
	ok('add-block: adds four lines', text.split('\n').length === before.split('\n').length + 4);

	const written = (parseDocument(text).toJS() as any[]).find((r) => r.id === first.id).review;
	ok('add-block: nests correctly', written?.by === 'test' && written?.date === '2026-07-29');
	ok('add-block: optional entry lands', written?.method === 'checked against the gazette');
}

// --- append-record ---------------------------------------------------------

{
	// Lists must serialise in flow style. The default is block, which put "- x" on
	// the same line as its key — `sources: - carnegie` — and a ONE-element list has
	// no newline in it, so it slipped past the fits-on-one-line check and produced
	// invalid YAML. Only multi-element lists were ever caught.
	const one = applyEdit(people, {
		op: 'append-record',
		record: { id: 'test-one-source', name_en: 'One', confidence: 'C', sources: ['carnegie-quiet-revolution'] }
	});
	ok('append-record: a one-item list is flow style', /sources: \[carnegie-quiet-revolution\]/.test(one.text));
	ok(
		'append-record: a one-item list parses back as a list',
		Array.isArray((parseDocument(one.text).toJS() as any[]).find((r) => r.id === 'test-one-source').sources)
	);

	const many = applyEdit(people, {
		op: 'append-record',
		record: { id: 'test-two-sources', name_en: 'Two', confidence: 'C', layers: ['political', 'security'] }
	});
	ok('append-record: a multi-item list is flow style', /layers: \[political, security\]/.test(many.text));

	const before = people;
	const { text, splice } = applyEdit(before, {
		op: 'append-record',
		record: { id: 'test-person', name_en: 'Test Person', confidence: 'C' }
	});

	ok(
		'append-record: only the spliced region differs',
		untouchedOutside(before, text, splice.start, splice.end, splice.text)
	);
	ok('append-record: the whole prior file is a prefix', text.startsWith(before.replace(/[\r\n]+$/, '')));

	const records = parseDocument(text).toJS() as any[];
	ok('append-record: record count grows by one', records.length === (parseDocument(before).toJS() as any[]).length + 1);
	ok('append-record: appended last', records[records.length - 1].id === 'test-person');
	ok('append-record: fields land', records[records.length - 1].name_en === 'Test Person');
}

console.log('\n  ── line endings, quoting, formatting ──\n');

{
	// The data files are mostly CRLF but not uniformly — people.yaml carries 32 bare
	// LFs among 4,092 CRLFs, from past hand edits. So the test is not "the file is
	// all CRLF"; that would assert the file's history rather than the emitter. It is
	// that the emitter adds lines in the prevailing style and disturbs no existing
	// ending. Normalising the file would show every line as changed in git, which is
	// the unreviewable diff this module exists to prevent.
	const count = (s: string, re: RegExp) => (s.match(re) || []).length;
	const before = people;
	const { text } = applyEdit(before, {
		op: 'add-block',
		target: { id: 'bourguiba' },
		field: 'review',
		entries: { by: 'test', date: '2026-07-29' }
	});

	const addedLines = text.split('\n').length - before.split('\n').length;
	ok('inserted lines use the prevailing CRLF', count(text, /\r\n/g) === count(before, /\r\n/g) + addedLines, `+${addedLines}`);
	ok('pre-existing bare LFs are untouched', count(text, /[^\r]\n/g) === count(before, /[^\r]\n/g), `${count(before, /[^\r]\n/g)} of them`);
}

{
	// A date must stay a string. YAML would read 1903-08-03 unquoted as a date, and
	// the schema expects a string — this is exactly the silent type change that a
	// naive emitter introduces.
	const { text } = applyEdit(people, {
		op: 'set',
		target: { id: 'bourguiba' },
		field: 'birth',
		value: '1903-08-04'
	});
	const value = (parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba').birth;
	ok('dates stay strings', typeof value === 'string', `got ${typeof value}: ${value}`);

	// Asserting the round-trip is not enough: it passes with the same library that
	// wrote the file. Unquoted `1903-08-04` is a string under YAML 1.2 and a
	// timestamp under 1.1, and these files are a published export others parse.
	ok('dates are written quoted', text.includes('birth: "1903-08-04"'));

	for (const token of ['2004', '~1995', '?', '<=1987-06']) {
		const out = applyEdit(people, {
			op: 'set',
			target: { id: 'bourguiba' },
			field: 'birth',
			value: token
		});
		ok(`fuzzy token ${token} is quoted`, out.text.includes(`birth: ${JSON.stringify(token)}`));
	}

	// ...but a bare keyword is not, because the file does not quote those.
	const ongoing = applyEdit(people, {
		op: 'set',
		target: { id: 'bourguiba' },
		field: 'death',
		value: 'ongoing'
	});
	ok('a plain keyword stays unquoted', ongoing.text.includes('death: ongoing'));
}

{
	// Long prose must not be folded into extra lines by the emitter.
	const long = 'A tagline long enough that any default folding width would wrap it across two lines or more.';
	const { text } = applyEdit(people, { op: 'set', target: { id: 'bourguiba' }, field: 'tagline', value: long });
	ok('long values are not folded', text.split('\n').length === people.split('\n').length);
}

{
	// A value carrying a colon would break the file if written bare.
	const { text } = applyEdit(people, {
		op: 'set',
		target: { id: 'bourguiba' },
		field: 'tagline',
		value: 'First president: architect of the party-state'
	});
	const value = (parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba').tagline;
	ok('values needing quotes are quoted', value === 'First president: architect of the party-state');
}

console.log('\n  ── refusals ──\n');

throws('unknown record id', () => applyEdit(people, { op: 'set', target: { id: 'nobody' }, field: 'tagline', value: 'x' }), 'no record with id');
throws('set on a missing field', () => applyEdit(people, { op: 'set', target: { id: 'bourguiba' }, field: 'nope', value: 'x' }), 'use add-field');
throws('add-field over an existing field', () => applyEdit(people, { op: 'add-field', target: { id: 'bourguiba' }, field: 'tagline', value: 'x' }), 'use set');
throws('duplicate list item', () => applyEdit(people, { op: 'append-to-list', target: { id: 'bourguiba' }, field: 'sources', item: 'carnegie-quiet-revolution' }), 'already in');
throws('append-to-list on a non-list', () => applyEdit(people, { op: 'append-to-list', target: { id: 'bourguiba' }, field: 'tagline', item: 'x' }), 'not a list');
throws('duplicate record id', () => applyEdit(people, { op: 'append-record', record: { id: 'bourguiba' } }), 'already exists');
throws('record without an id', () => applyEdit(people, { op: 'append-record', record: { name_en: 'x' } }), 'needs a string id');
throws('add-block over an existing field', () => applyEdit(people, { op: 'add-block', target: { id: 'bourguiba' }, field: 'sources', entries: { a: 'b' } }), 'already has');
throws('empty block', () => applyEdit(people, { op: 'add-block', target: { id: 'bourguiba' }, field: 'review', entries: {} }), 'is empty');
throws('multi-line value', () => applyEdit(people, { op: 'set', target: { id: 'bourguiba' }, field: 'tagline', value: 'one\ntwo' }), 'does not fit on one line');
// Mojibake must not reach canonical data. This exact string — a cp1252 body decoded
// as UTF-8 — was written into sources.yaml before the check existed.
throws(
	'value carrying the replacement character',
	() => applyEdit(people, { op: 'set', target: { id: 'bourguiba' }, field: 'tagline', value: 'D�cret' }),
	'U+FFFD'
);
// The real characters must still go through untouched, or the check is worse than
// the bug: this dataset is a third Arabic.
{
	const { text } = applyEdit(people, {
		op: 'set',
		target: { id: 'bourguiba' },
		field: 'tagline',
		value: 'Décret — الحبيب بورقيبة'
	});
	ok(
		'accented and Arabic text survives',
		(parseDocument(text).toJS() as any[]).find((r) => r.id === 'bourguiba').tagline ===
			'Décret — الحبيب بورقيبة'
	);
}

console.log('\n  ── the guard itself ──\n');

{
	// The guard must fail on damage it is supposed to catch, or it is decoration.
	// Its predecessor compared prefix and suffix lengths, which can never go
	// negative for equal-length strings, so it passed a file with two separate
	// edits in it. These cases are hand-built corruption, checked directly.
	const caught = (fn: () => void) => {
		try {
			fn();
			return '';
		} catch (e) {
			return (e as Error).message;
		}
	};

	const base = '- id: a\n  v: 1\n\n- id: b\n  v: 2\n\n- id: c\n  v: 3\n';

	ok(
		'guard catches an unrelated record being altered',
		caught(() => assertOnlyTargetChanged(base, base.replace('v: 3', 'v: 9'), 'a')).includes('altered unrelated record "c"')
	);
	ok(
		'guard catches an unrelated record being deleted',
		caught(() => assertOnlyTargetChanged(base, '- id: a\n  v: 1\n\n- id: c\n  v: 3\n', 'a')).includes('deleted unrelated record "b"')
	);
	ok(
		'guard catches reordering',
		caught(() => assertOnlyTargetChanged(base, '- id: b\n  v: 2\n\n- id: a\n  v: 1\n\n- id: c\n  v: 3\n', 'a')).includes('reordered')
	);
	ok(
		'guard catches an unexpected extra record',
		caught(() => assertOnlyTargetChanged(base, base + '\n- id: d\n  v: 4\n', 'a')).includes('record count went')
	);
	ok(
		'guard allows the target to change',
		caught(() => assertOnlyTargetChanged(base, base.replace('v: 1', 'v: 9'), 'a')) === ''
	);
	ok(
		'guard allows exactly one append',
		caught(() => assertOnlyTargetChanged(base, base + '\n- id: d\n  v: 4\n', null)) === ''
	);
}

console.log('\n  ── every record, every file ──\n');

{
	// The invariant must hold across record SHAPES, not just the hand-picked records
	// above, which were chosen because they work.
	//
	// Exhaustively sweeping every record cost 93 seconds and still covered only two
	// of the ten files, because each edit re-parses the whole file and the two big
	// ones dominate. Shape diversity is what actually finds bugs here — a nested map,
	// a folded block scalar, a record with one field, the last record in a file — so
	// this samples for shape across ALL ten files instead. Broader coverage, a
	// fraction of the time.
	const FILES = [
		'people.yaml', 'positions.yaml', 'sources.yaml', 'relationships.yaml',
		'institutions.yaml', 'events.yaml', 'roles.yaml', 'eras.yaml',
		'hypotheses.yaml', 'questions.yaml'
	];
	const CAP = 12;

	/** Indices chosen for shape: the edges, the extremes, then an even spread. */
	function sample(records: any[]): number[] {
		const withId = records.map((r, i) => [r, i] as const).filter(([r]) => typeof r?.id === 'string');
		if (!withId.length) return [];

		const fieldCount = ([r]: readonly [any, number]) => Object.keys(r).length;
		const nested = ([r]: readonly [any, number]) =>
			Object.values(r).some((v) => v && typeof v === 'object' && !Array.isArray(v));
		const prose = ([r]: readonly [any, number]) =>
			Object.values(r).some((v) => typeof v === 'string' && v.length > 200);

		const picks = new Set<number>();
		const take = (entry?: readonly [any, number]) => entry && picks.add(entry[1]);

		take(withId[0]);
		take(withId[1]);
		take(withId[withId.length - 1]);
		take(withId[withId.length - 2]);
		take([...withId].sort((a, b) => fieldCount(b) - fieldCount(a))[0]);
		take([...withId].sort((a, b) => fieldCount(a) - fieldCount(b))[0]);
		take(withId.find(nested));
		take(withId.find(prose));

		const stride = Math.max(1, Math.floor(withId.length / CAP));
		for (let i = 0; i < withId.length && picks.size < CAP; i += stride) take(withId[i]);
		return [...picks];
	}

	let bad = 0;
	let swept = 0;
	let worst = '';

	for (const name of FILES) {
		const source = read(name);
		const records = parseDocument(source).toJS() as any[];
		for (const index of sample(records)) {
			const record = records[index];
			swept++;
			try {
				const edit: Edit = { op: 'add-field', target: { id: record.id }, field: 'zz_probe', value: 'probe' };
				const { text, splice } = applyEdit(source, edit);
				if (!untouchedOutside(source, text, splice.start, splice.end, splice.text)) {
					bad++;
					if (!worst) worst = `${name}:${record.id}`;
				}
			} catch (e) {
				bad++;
				if (!worst) worst = `${name}:${record.id} threw ${(e as Error).message}`;
			}
		}
	}

	ok(`sweep: ${swept} records across ${FILES.length} files splice cleanly`, bad === 0, bad ? `${bad} bad, first ${worst}` : '');
}

console.log('\n  ── records with no id ──\n');

{
	// Positional targeting is how relationships were migrated: until July 2026
	// relationships.yaml had no id field, so there was nothing else to target by.
	// It stays supported, and it is only safe because it verifies what it landed on
	// — a stale index would otherwise write a review about one pair of named people
	// onto a different pair.
	const rels = read('relationships.yaml');
	const parsed = parseDocument(rels).toJS() as any[];
	const first = parsed[0];

	ok(
		'the migration held: every relationship carries an id',
		parsed.every((r) => typeof r.id === 'string' && r.id.length > 0),
		`${parsed.length} records, ${new Set(parsed.map((r) => r.id)).size} distinct ids`
	);

	const { text, splice } = applyEdit(rels, {
		op: 'add-block',
		target: { index: 0, match: { from: first.from, to: first.to } },
		field: 'review',
		entries: { by: 'test', date: '2026-07-29' }
	});
	ok(
		'index target: only the spliced region differs',
		untouchedOutside(rels, text, splice.start, splice.end, splice.text)
	);
	ok(
		'index target: the review lands on the intended record',
		(parseDocument(text).toJS() as any[])[0].review?.by === 'test'
	);
	ok(
		'index target: the next record is untouched',
		JSON.stringify((parseDocument(text).toJS() as any[])[1]) === JSON.stringify(parsed[1])
	);

	throws(
		'stale index is refused',
		() =>
			applyEdit(rels, {
				op: 'add-block',
				target: { index: 0, match: { from: 'somebody-else', to: first.to } },
				field: 'review',
				entries: { by: 'test', date: '2026-07-29' }
			}),
		'the file has changed under this edit'
	);
	throws(
		'index past the end is refused',
		() =>
			applyEdit(rels, {
				op: 'add-block',
				target: { index: 99999 },
				field: 'review',
				entries: { by: 'test', date: '2026-07-29' }
			}),
		'no record at index'
	);

	// The guard keys id-less records by position. Skipping them, as it first did,
	// made it silently vacuous across the whole of relationships.yaml when that file
	// had no ids. A synthetic fixture keeps testing that property now the real file
	// is keyed — otherwise this assertion would quietly start passing for the wrong
	// reason, which is how the original blind spot survived in the first place.
	const idless = '- from: a\n  v: 1\n\n- from: b\n  v: 2\n';
	let caught = '';
	try {
		assertOnlyTargetChanged(idless, '- from: a\n  v: 9\n\n- from: b\n  v: 8\n', '#0');
	} catch (e) {
		caught = (e as Error).message;
	}
	ok('guard covers records that have no id', caught.includes('altered unrelated record "#1"'), caught);
}

console.log('\n  ── inserting a field first ──\n');

{
	// `id` belongs at the top of a record, as it is in every other data file. The
	// relationship migration depends on this.
	const before = read('relationships.yaml');
	const parsed = parseDocument(before).toJS() as any[];
	const { text, splice } = applyEdit(before, {
		op: 'add-field',
		target: { index: 0, match: { from: parsed[0].from } },
		field: 'zz_first',
		value: 'probe',
		at: 'start'
	});

	ok(
		'at start: only the spliced region differs',
		untouchedOutside(before, text, splice.start, splice.end, splice.text)
	);
	ok('at start: adds one line', text.split('\n').length === before.split('\n').length + 1);
	ok('at start: the new field is the first key', /^- zz_first: probe$/m.test(text));
	ok(
		'at start: it lands on the dash line, not inside the previous record',
		text.indexOf('- zz_first: probe') < text.indexOf(`id: ${parsed[0].id}`)
	);

	const after = (parseDocument(text).toJS() as any[])[0];
	const { zz_first, ...rest } = after;
	ok('at start: no other field is disturbed', JSON.stringify(rest) === JSON.stringify(parsed[0]));

	// The exemption that makes this possible must not blunt the reorder check.
	const base = '- v: 1\n\n- v: 2\n\n- v: 3\n';
	const caught = (fn: () => void) => {
		try {
			fn();
			return '';
		} catch (e) {
			return (e as Error).message;
		}
	};
	// Swapping two id-less records is invisible to the ORDER check, because their
	// keys are their positions and the positions are unchanged. It is the content
	// comparison that catches it, reported as an alteration rather than a reorder.
	// Both are refusals; asserting the specific wording here would be asserting an
	// implementation detail rather than the property that matters.
	ok(
		'guard still catches a swap elsewhere while the target gains an id',
		caught(() => assertOnlyTargetChanged(base, '- id: x\n  v: 1\n\n- v: 3\n\n- v: 2\n', '#0')) !== ''
	);
	// A reorder of records that DO have ids is caught as a reorder.
	const keyed = '- id: a\n\n- id: b\n\n- id: c\n';
	ok(
		'guard catches a reorder of id-carrying records',
		caught(() => assertOnlyTargetChanged(keyed, '- id: a\n\n- id: c\n\n- id: b\n', 'a')).includes('reordered')
	);
	ok(
		'guard permits the target alone to gain an id',
		caught(() => assertOnlyTargetChanged(base, '- id: x\n  v: 1\n\n- v: 2\n\n- v: 3\n', '#0')) === ''
	);
}

console.log('\n  ── the editorial tool agrees with the build ──\n');

{
	// admin.ts keeps its own copy of the risk classification, because build-data.ts
	// is a script with side effects and cannot be imported. A copy that drifts would
	// order the review queue by one definition while /about published another — the
	// queue would say a record is the most dangerous unreviewed thing in the dataset
	// while the coverage table counted it somewhere else entirely.
	//
	// So compare the copy against the published table rather than trusting it.
	const ds = JSON.parse(
		readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8')
	);
	const published = ds.meta.review.byRisk as Record<string, { reviewed: number; total: number }>;

	const mine: Record<string, { reviewed: number; total: number }> = {};
	for (const key of Object.keys(published)) mine[key] = { reviewed: 0, total: 0 };
	for (const kind of ['positions', 'relationships', 'events', 'worldClaims'] as const) {
		for (const record of ds[kind] ?? []) {
			const bucket = mine[riskOf(record)];
			bucket.total++;
			if (record.review) bucket.reviewed++;
		}
	}

	for (const [risk, expected] of Object.entries(published)) {
		ok(
			`risk bucket "${risk}" matches the published table`,
			mine[risk].total === expected.total && mine[risk].reviewed === expected.reviewed,
			`build ${expected.reviewed}/${expected.total}, admin ${mine[risk].reviewed}/${mine[risk].total}`
		);
	}
}

console.log(`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`);
if (failures) process.exit(1);
