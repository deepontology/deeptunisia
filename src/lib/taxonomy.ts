/**
 * The vocabulary an untrusted proposal may use.
 *
 * The community API has to validate before it writes, and the graph schema
 * (`scripts/schema.ts`) is the authority for what a record may contain. This file
 * carries the subset of that vocabulary a public proposal may set, plus the enum
 * lists the forms offer.
 *
 * These are NOT a second source of truth on purpose: `scripts/test-proposals.ts`
 * asserts that every field here exists in the corresponding Zod schema, that
 * the required lists are subsets of the public lists, and that each enum list is
 * exactly the schema's. If the schema changes, that test fails rather than the
 * API silently accepting or refusing the wrong thing.
 */

import type { Layer } from './model';

export const LAYERS: Layer[] = [
	'security',
	'political',
	'economic',
	'media',
	'judicial',
	'civil',
	'foreign'
];

export const CONFIDENCE = ['A', 'B', 'C', 'D'];

export const BASIS = ['documented', 'reported', 'inferred', 'unsubstantiated'];

export const VERIFICATION = ['verified', 'needs-primary-source', 'disputed'];

export const RELATIONSHIP_TYPES = [
	'institutional',
	'appointment',
	'succession',
	'family',
	'business',
	'party',
	'security',
	'funding',
	'diplomatic',
	'political-alliance',
	'political-conflict',
	'prosecution',
	'reported-influence',
	'allegation',
	'dismissal',
	'ownership',
	'board',
	'shareholder',
	'sponsorship',
	'partnership',
	'franchise',
	'oversight',
	'regulatory-authority',
	'licence',
	'sanction',
	'coalition',
	'endorsement',
	'candidate-campaign',
	'influence',
	'advisory'
];

export const INSTITUTION_TYPES = [
	'presidency',
	'government',
	'ministry',
	'military',
	'police',
	'gendarmerie',
	'intelligence',
	'presidential-security',
	'party',
	'company',
	'family',
	'association',
	'media',
	'legislature',
	'judiciary',
	'foreign-state',
	'international-organisation',
	'ngo',
	'bank',
	'state-enterprise',
	'holding',
	'media-company',
	'foundation',
	'regulator',
	'sovereign-fund',
	'cooperative',
	'utility',
	'port-authority'
];

export const EVENT_CATEGORIES = [
	'political',
	'military',
	'security',
	'economic',
	'constitutional',
	'election',
	'protest',
	'legal',
	'award',
	'investigation',
	'media'
];

/**
 * The fields an addition proposal may set, per kind.
 *
 * Deliberately narrower than the schema: editor-only fields (`review`,
 * `evidence`, `supersedes`, `merged_into`, `basis_override_reason`) and
 * structured objects the text form cannot express (`equity`, `finance`,
 * `influence`) are not on the list. The test asserts every entry is a real
 * schema key, so a typo cannot smuggle in an invalid field.
 */
export const PUBLIC_FIELDS: Record<string, Set<string>> = {
	person: new Set([
		'id',
		'name_en',
		'name_fr',
		'name_ar',
		'aliases',
		'birth',
		'death',
		'nationality',
		'layers',
		'tagline',
		'summary',
		'trajectory',
		'confidence',
		'basis',
		'verification',
		'attributed_to',
		'reasoning',
		'falsifiable_by',
		'sources',
		'notes'
	]),
	institution: new Set([
		'id',
		'name_en',
		'name_fr',
		'name_ar',
		'abbr',
		'aliases',
		'type',
		'layer',
		'parent',
		'iso2',
		'seat',
		'summary',
		'confidence',
		'basis',
		'verification',
		'attributed_to',
		'reasoning',
		'falsifiable_by',
		'sources',
		'notes'
	]),
	event: new Set([
		'id',
		'date',
		'date_end',
		'title_en',
		'title_fr',
		'title_ar',
		'category',
		'subcategory',
		'location',
		'rupture',
		'summary',
		'actors',
		'institutions',
		'documents',
		'materials',
		'causes',
		'consequences',
		'confidence',
		'basis',
		'verification',
		'attributed_to',
		'reasoning',
		'falsifiable_by',
		'sources'
	]),
	relationship: new Set([
		'id',
		'from',
		'to',
		'type',
		'subtype',
		'start',
		'end',
		'description',
		'confidence',
		'basis',
		'verification',
		'attributed_to',
		'reasoning',
		'falsifiable_by',
		'sources',
		'notes'
	]),
	position: new Set([
		'id',
		'role',
		'holder',
		'start',
		'end',
		'acting',
		'predecessor',
		'confidence',
		'basis',
		'verification',
		'attributed_to',
		'reasoning',
		'falsifiable_by',
		'sources',
		'notes'
	])
};

/** Fields that must be present and non-empty for a new record of each kind. */
export const REQUIRED_FIELDS: Record<string, string[]> = {
	person: ['name_en', 'layers'],
	institution: ['name_en', 'type', 'layer'],
	event: ['title_en', 'date', 'category', 'summary'],
	relationship: ['from', 'to', 'type', 'description', 'confidence'],
	position: ['role', 'holder', 'start']
};

/** Enumerated fields, validated by value wherever a change sets them. */
export const ENUM_FIELDS: Record<string, readonly string[]> = {
	confidence: CONFIDENCE,
	basis: BASIS,
	verification: VERIFICATION,
	category: EVENT_CATEGORIES,
	layer: LAYERS
};

/** Fields that name another record, resolved against the graph where available. */
export const REFERENCE_FIELDS: Record<string, string[]> = {
	relationship: ['from', 'to'],
	position: ['role', 'holder']
};
