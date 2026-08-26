/**
 * Which fields of a record a proposal may address, and what they currently say.
 *
 * WHY THIS EXISTS
 *
 * The proposal form used to ask for a field path as free text, next to an
 * operation picked from `['set','add-field','append-to-list','add-block']`. That is
 * the editorial tool's vocabulary wearing a public form's clothes: it asks a
 * citizen who noticed a wrong date to already know the shape of the YAML, and it
 * asks them to type the current value from memory into `old_value` — the one field
 * whose entire purpose is to let a reviewer detect that the record moved underneath
 * the proposal. A value typed by hand cannot do that job.
 *
 * Offering the record's real fields with their real values makes `old_value`
 * correct by construction, which is the actual point.
 *
 * The list is curated rather than derived from the schema. Not every field should
 * be publicly proposable: `basis` and `confidence` are conclusions the project
 * draws from evidence rather than facts a reader can assert, and `sources` is
 * handled by the evidence section of the form. A proposal to change a grade is a
 * proposal to change the reasoning, and that belongs in a discussion first.
 */
import { ds } from '$lib/model';

export interface EditableField {
	/** Path as the emitter understands it. */
	path: string;
	label: string;
	current: string;
	/** Long prose wants a textarea. */
	multiline?: boolean;
	hint?: string;
}

const PERSON: [string, string, boolean?][] = [
	['name_en', 'Name (English)'],
	['name_fr', 'Name (French)'],
	['name_ar', 'Name (Arabic)'],
	['birth', 'Born'],
	['death', 'Died'],
	['tagline', 'One-line description'],
	['summary', 'Summary', true]
];

const INSTITUTION: [string, string, boolean?][] = [
	['name_en', 'Name (English)'],
	['name_fr', 'Name (French)'],
	['name_ar', 'Name (Arabic)'],
	['abbr', 'Abbreviation'],
	['founded', 'Founded'],
	['dissolved', 'Dissolved'],
	['summary', 'Summary', true]
];

const POSITION: [string, string, boolean?][] = [
	['start', 'Start date'],
	['end', 'End date'],
	['acting', 'Acting'],
	['notes', 'Notes', true]
];

const RELATIONSHIP: [string, string, boolean?][] = [
	['type', 'Type'],
	['subtype', 'Subtype'],
	['start', 'Start date'],
	['end', 'End date'],
	['description', 'Description', true]
];

const EVENT: [string, string, boolean?][] = [
	['title_en', 'Title (English)'],
	['title_fr', 'Title (French)'],
	['title_ar', 'Title (Arabic)'],
	['date', 'Date'],
	['summary', 'Summary', true]
];

function render(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (Array.isArray(v)) return v.join('\n');
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	return String(v);
}

function find(type: string, id: string): Record<string, unknown> | null {
	const table: Record<string, { id: string }[]> = {
		person: ds.people,
		institution: ds.institutions,
		position: ds.positions,
		relationship: ds.relationships,
		event: ds.events,
		role: ds.roles,
		source: ds.sources
	};
	const rows = table[type];
	return (rows?.find((r) => r.id === id) as Record<string, unknown>) ?? null;
}

/**
 * The fields on offer for a record, with what they say today.
 *
 * A field that is currently empty is still offered — "nobody recorded a death
 * date" is one of the most useful things a reader can fix, and hiding empty fields
 * would hide exactly the gaps the project publishes counts of.
 */
export function editableFields(type: string, id: string): EditableField[] {
	const rec = find(type, id);
	if (!rec) return [];

	const spec =
		type === 'person'
			? PERSON
			: type === 'institution'
				? INSTITUTION
				: type === 'position'
					? POSITION
					: type === 'relationship'
						? RELATIONSHIP
						: type === 'event'
							? EVENT
							: [];

	return spec.map(([path, label, multiline]) => ({
		path,
		label,
		current: render(rec[path]),
		multiline
	}));
}

/** True when we can offer a structured form rather than a free-text field path. */
export function isStructured(type: string, id: string | null): boolean {
	return !!id && editableFields(type, id).length > 0;
}
