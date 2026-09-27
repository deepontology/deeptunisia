/**
 * The mapping from a stored proposal to emitter edits.
 *
 * Extracted from `apply-proposals.ts` so the mapping can be tested without
 * running the CLI, fetching a database, or touching `data/`.
 *
 * TWO THINGS THIS GETS RIGHT THAT THE FIRST VERSION DID NOT
 *
 * 1. Every change is returned, not just the first. The API accepts up to twenty
 *    changes per proposal; applying one and marking the whole proposal applied
 *    was a silent partial write.
 * 2. Values are typed by field. The proposal is text all the way from the form,
 *    but the schema wants arrays and booleans in places. A slug list is split on
 *    commas; a prose list becomes one element (a note containing a comma is one
 *    note, not two); a boolean field is parsed.
 */
import { EmitError, type Edit } from './emit.ts';

/** Lists of identifiers, sent as comma-separated text by the form. */
export const SLUG_LIST_FIELDS = new Set([
	'sources',
	'layers',
	'aliases',
	'nationality',
	'trajectory',
	'location',
	'actors',
	'institutions',
	'consequences',
	'causes',
	'losers'
]);

/** Lists of prose, where a comma is part of the sentence, not a separator. */
export const PROSE_LIST_FIELDS = new Set([
	'notes',
	'notes_fr',
	'notes_ar',
	'documents',
	'materials',
	'activities',
	'parties',
	'contested'
]);

/** Booleans the change form can offer. */
export const BOOL_FIELDS = new Set(['acting', 'direct', 'beneficial', 'state_owned', 'rupture']);

/** Everything the emitter must write as a sequence. */
export const LIST_FIELDS = new Set([...SLUG_LIST_FIELDS, ...PROSE_LIST_FIELDS]);

/** Coerce a text value from the proposal into the type the field expects. */
export function typedValue(field: string, value: unknown): unknown {
	if (SLUG_LIST_FIELDS.has(field)) {
		return String(value ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	if (PROSE_LIST_FIELDS.has(field)) {
		const text = String(value ?? '').trim();
		return text ? [text] : [];
	}
	if (BOOL_FIELDS.has(field)) return String(value ?? '').trim().toLowerCase() === 'true';
	return value;
}

/**
 * Every edit a proposal needs, in order. A single-change proposal returns one;
 * a multi-change set returns one per field. `apply-proposals.ts` folds them over
 * the file sequentially, re-parsing between edits, because the emitter's
 * single-region guard rejects a combined splice.
 */
export function editsFor(pr: any): Edit[] {
	const changes = Array.isArray(pr.changes) ? pr.changes : [];
	if (!changes.length) throw new EmitError('proposal carries no change');

	const target = { id: pr.target_id as string };
	switch (pr.operation) {
		case 'set':
			return changes.map((c: any) => ({
				op: 'set' as const,
				target,
				field: c.field,
				value: typedValue(c.field, c.new_value)
			}));
		case 'add-field':
			return changes.map((c: any) => ({
				op: 'add-field' as const,
				target,
				field: c.field,
				value: typedValue(c.field, c.new_value)
			}));
		case 'append-to-list':
			return changes.map((c: any) => ({
				op: 'append-to-list' as const,
				target,
				field: c.field,
				item: String(c.new_value ?? '')
			}));
		case 'add-block':
			return [
				{
					op: 'add-block' as const,
					target,
					field: changes[0].field,
					entries: Object.fromEntries(changes.map((c: any) => [c.field, String(c.new_value ?? '')]))
				}
			];
		case 'append-record': {
			const record: Record<string, unknown> = {};
			for (const c of changes) record[c.field] = typedValue(c.field, c.new_value);
			return [{ op: 'append-record' as const, record }];
		}
		default:
			throw new EmitError(`"${pr.operation}" cannot be applied automatically — do it by hand`);
	}
}

/** The first edit. Kept for callers that only handle single-change proposals. */
export function editFor(pr: any): Edit {
	return editsFor(pr)[0];
}
