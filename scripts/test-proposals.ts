/**
 * Assertions over the proposal-to-edit mapping.
 *
 * apply-proposals.ts is the last link in the loop: a reviewer accepts a proposal,
 * a human runs the bridge, and emit.ts writes the canonical dataset. The mapping
 * in between decides which field, which record and which value the emitter is
 * asked for — if it is wrong, the emitter writes the wrong thing correctly.
 *
 * The mapping is tested here directly, without the CLI or a database, so the
 * write path can be exercised without touching data/. The end-to-end companion
 * is test-api.ts, which covers what the server refuses to file.
 *
 * The list fields arrive from the form as comma-separated text. A record's
 * schema wants arrays, so the mapping splits them; the assertions below pin the
 * split, the trim, and that applying the edit to YAML round-trips.
 */
import { parse } from 'yaml';
import { applyEdit, EmitError } from './emit.ts';
import { editFor, editsFor, LIST_FIELDS, typedValue } from './proposal-edit.ts';
import {
	EventSchema,
	InstitutionSchema,
	PersonSchema,
	PositionSchema,
	RelationshipSchema,
	Layer,
	Confidence,
	Basis,
	Verification,
	RelationshipType,
	InstitutionType
} from './schema.ts';
import {
	PUBLIC_FIELDS,
	REQUIRED_FIELDS,
	LAYERS,
	CONFIDENCE,
	BASIS,
	VERIFICATION,
	RELATIONSHIP_TYPES,
	INSTITUTION_TYPES,
	EVENT_CATEGORIES
} from '../src/lib/taxonomy.ts';

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

/**
 * The mapping throws rather than returning a broken edit. `expect` names the
 * message fragment, so an edit that fails for the wrong reason does not pass.
 */
function rejects(name: string, fn: () => unknown, expect: string) {
	checks++;
	try {
		fn();
		failures++;
		console.error(`  FAIL  ${name} — expected an error, got none`);
	} catch (e) {
		const message = (e as Error).message;
		if (e instanceof EmitError && message.includes(expect)) console.log(`  ok    ${name} — ${message}`);
		else {
			failures++;
			console.error(`  FAIL  ${name} — wrong error: ${message}`);
		}
	}
}

const records = (text: string) => parse(text) as Array<Record<string, any>>;

console.log('\n  ── a proposal maps to one emitter edit ──\n');

// --- set ---------------------------------------------------------------------

{
	const edit = editFor({
		target_type: 'person',
		target_id: 'bourguiba',
		operation: 'set',
		changes: [{ field: 'tagline', old_value: 'The first president', new_value: 'The first president of Tunisia' }]
	});

	ok(
		'a set proposal maps to a set edit on the target field',
		edit.op === 'set' &&
			edit.target.id === 'bourguiba' &&
			edit.field === 'tagline' &&
			edit.value === 'The first president of Tunisia',
		JSON.stringify(edit)
	);

	// The mapped edit applied to a fixture changes the target field and nothing
	// else. applyEdit's own guard enforces this, so a mapping that pointed at the
	// wrong record or the wrong field would surface here.
	const FIXTURE = `- id: bourguiba
  name_en: Habib Bourguiba
  tagline: The first president
- id: ben-ali
  name_en: Zine El Abidine Ben Ali
`;
	const before = records(FIXTURE);
	const after = records(applyEdit(FIXTURE, edit).text);
	const targetBefore = before.find((r) => r.id === 'bourguiba')!;
	const targetAfter = after.find((r) => r.id === 'bourguiba')!;
	const changed = Object.keys(targetAfter).filter(
		(k) => JSON.stringify(targetBefore[k]) !== JSON.stringify(targetAfter[k])
	);
	ok('applying it changes exactly the target field', changed.length === 1 && changed[0] === 'tagline', changed.join(','));
	ok('the new value reads back from the YAML', targetAfter.tagline === 'The first president of Tunisia');
	ok(
		'the neighbouring record is untouched',
		JSON.stringify(after.find((r) => r.id === 'ben-ali')) === JSON.stringify(before.find((r) => r.id === 'ben-ali'))
	);
}

// --- append-record -----------------------------------------------------------

{
	const pr = {
		target_type: 'person',
		target_id: 'test-new-person',
		operation: 'append-record',
		changes: [
			{ field: 'id', new_value: 'test-new-person' },
			{ field: 'name_en', new_value: 'Test New Person' },
			{ field: 'layers', new_value: ' security , political ' },
			{ field: 'sources', new_value: ' jort-2022-546 ' }
		]
	};
	const edit = editFor(pr);
	const record: Record<string, any> = edit.op === 'append-record' ? edit.record : {};
	ok('an addition maps to an append-record edit', edit.op === 'append-record', JSON.stringify(edit));
	ok('the proposed id is the record id', record.id === 'test-new-person', String(record.id));
	ok('a scalar field stays a string', record.name_en === 'Test New Person', String(record.name_en));
	ok(
		'a comma-separated layers value becomes a trimmed array',
		Array.isArray(record.layers) &&
			JSON.stringify(record.layers) === JSON.stringify(['security', 'political']),
		JSON.stringify(record.layers)
	);
	ok(
		'a one-item list becomes a one-item array, trimmed',
		Array.isArray(record.sources) && JSON.stringify(record.sources) === JSON.stringify(['jort-2022-546']),
		JSON.stringify(record.sources)
	);

	/*
	 * The half that matters: the mapped edit actually writes the record. A fixture
	 * with one existing record stands in for a data file, and the new record must
	 * read back with the same values the proposal carried.
	 */
	const FIXTURE = `- id: existing-person
  name_en: Existing Person
`;
	const { text } = applyEdit(FIXTURE, edit);
	const after = records(text);
	const added = after.find((r) => r.id === 'test-new-person');
	ok('the applied edit parses back to YAML', after.length === 2 && Boolean(added), `${after.length} records`);
	ok(
		'the new record keeps the trimmed list values',
		JSON.stringify(added?.layers) === JSON.stringify(['security', 'political']) &&
			JSON.stringify(added?.sources) === JSON.stringify(['jort-2022-546']),
		JSON.stringify({ layers: added?.layers, sources: added?.sources })
	);
	ok(
		'the pre-existing record survives the append',
		after[0]?.id === 'existing-person' && after[0]?.name_en === 'Existing Person'
	);
}

// --- refusals ----------------------------------------------------------------

{
	rejects(
		'an operation the emitter cannot apply is refused',
		() =>
			editFor({
				target_type: 'person',
				target_id: 'bourguiba',
				operation: 'delete-everything',
				changes: [{ field: 'tagline', new_value: 'x' }]
			}),
		'cannot be applied automatically'
	);
	rejects(
		'a proposal with no changes is refused',
		() => editFor({ target_type: 'person', target_id: 'bourguiba', operation: 'set', changes: [] }),
		'proposal carries no change'
	);
}

// --- list fields -------------------------------------------------------------

{
	ok(
		'LIST_FIELDS holds the list-valued fields',
		LIST_FIELDS.has('sources') && LIST_FIELDS.has('layers') && LIST_FIELDS.has('notes'),
		[...LIST_FIELDS].join(', ')
	);
	ok(
		'a scalar field is not list-valued',
		!LIST_FIELDS.has('name_en') && !LIST_FIELDS.has('id'),
		`name_en ${LIST_FIELDS.has('name_en')}, id ${LIST_FIELDS.has('id')}`
	);
}

// --- every change, and typed values ------------------------------------------

{
	/*
	 * A multi-change proposal used to apply only its first change and then mark
	 * the whole proposal applied. The API accepts twenty; the mapping now returns
	 * all of them.
	 */
	const edits = editsFor({
		target_type: 'person',
		target_id: 'bourguiba',
		operation: 'set',
		changes: [
			{ field: 'tagline', new_value: 'A corrected tagline' },
			{ field: 'summary', new_value: 'A corrected summary' }
		]
	});
	ok(
		'a multi-change set returns one edit per change',
		edits.length === 2 && edits[0].field === 'tagline' && edits[1].field === 'summary',
		`${edits.length} edits`
	);

	const FIXTURE = `- id: bourguiba
  name_en: Habib Bourguiba
  tagline: The first president
  summary: An old summary
`;
	let text = FIXTURE;
	for (const edit of edits) text = applyEdit(text, edit).text;
	const after = records(text)[0];
	ok(
		'folding the edits over the file applies both',
		after.tagline === 'A corrected tagline' && after.summary === 'A corrected summary',
		JSON.stringify(after)
	);

	ok(
		'a prose list value stays one element, comma and all',
		JSON.stringify(typedValue('notes', 'One note, with a comma')) === JSON.stringify(['One note, with a comma']),
		JSON.stringify(typedValue('notes', 'One note, with a comma'))
	);
	ok(
		'a boolean field is parsed, not stringified',
		typedValue('acting', 'true') === true && typedValue('acting', 'false') === false
	);
}

// --- the taxonomy mirrors the schema -----------------------------------------

{
	const shapeOf = (schema: any): Record<string, any> => {
		let cur = schema;
		while (cur?._def?.schema && !cur?._def?.shape) cur = cur._def.schema;
		return cur._def.shape;
	};
	const SCHEMAS: Record<string, any> = {
		person: PersonSchema,
		institution: InstitutionSchema,
		event: EventSchema,
		relationship: RelationshipSchema,
		position: PositionSchema
	};

	ok('LAYERS mirrors the schema layer enum', JSON.stringify(LAYERS) === JSON.stringify(Layer.options));
	ok('CONFIDENCE mirrors the schema', JSON.stringify(CONFIDENCE) === JSON.stringify(Confidence.options));
	ok('BASIS mirrors the schema', JSON.stringify(BASIS) === JSON.stringify(Basis.options));
	ok('VERIFICATION mirrors the schema', JSON.stringify(VERIFICATION) === JSON.stringify(Verification.options));
	ok(
		'RELATIONSHIP_TYPES mirrors the schema',
		JSON.stringify(RELATIONSHIP_TYPES) === JSON.stringify(RelationshipType.options)
	);
	ok(
		'INSTITUTION_TYPES mirrors the schema',
		JSON.stringify(INSTITUTION_TYPES) === JSON.stringify(InstitutionType.options)
	);
	ok(
		'EVENT_CATEGORIES mirrors the schema',
		JSON.stringify(EVENT_CATEGORIES) === JSON.stringify(shapeOf(EventSchema).category.options)
	);

	for (const [kind, schema] of Object.entries(SCHEMAS)) {
		const keys = new Set(Object.keys(shapeOf(schema)));
		const unknown = [...PUBLIC_FIELDS[kind]].filter((field) => !keys.has(field));
		ok(`every public ${kind} field exists in the schema`, unknown.length === 0, unknown.join(', '));

		const required = REQUIRED_FIELDS[kind] ?? [];
		const notPublic = required.filter((field) => !PUBLIC_FIELDS[kind].has(field));
		ok(`every required ${kind} field is a public field`, notPublic.length === 0, notPublic.join(', '));
	}
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
