/**
 * The vocabularies this deployment declares: the lists the engine's record
 * kinds validate against. They live apart from scripts/schema.ts so that
 * scripts/engine.ts can read them to build the deployment while schema.ts
 * takes its record schemas from the engine, with no import cycle.
 */
import { z } from 'zod';

/**
 * A reviewer is recorded as a role or a named pass, never as a person: the record
 * says what kind of check was made and when, which is what a reader can audit.
 * A reviewer outside the maintainer group signs as `reviewer-<n>`, which carries no name.
 */
export const REVIEWER_LABELS = ['Initial compilation', 'JORT verification pass', 'Research pass YYYY-MM-DD'] as const;
/**
 * Analytical layers. A person or institution can belong to several; those that
 * belong to several are exactly the "bridge" nodes the research is looking for.
 */
export const Layer = z.enum([
	'security', // military, police, national guard, intelligence, presidential security
	'political', // presidents, ministers, parties, parliament
	'economic', // business families, conglomerates, banks
	'media', // broadcasters, press, media-owner politicians
	'judicial', // courts, prosecutions
	'civil', // unions, associations, civil society
	'foreign' // foreign states, international organisations, external funders
]);

export const InstitutionType = z.enum([
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
	// v0.0.2 — additive refinements (spec §4.1)
	'bank',
	'state-enterprise',
	'holding',
	'media-company',
	'foundation',
	'regulator',
	'sovereign-fund',
	'cooperative',
	'utility',
	'port-authority',
	// a caucus inside one legislative term; its parent is the term
	'parliamentary-group'
]);

export const RelationshipType = z.enum([
	'institutional', // held office within an institution
	'appointment', // A appointed B
	'succession', // A replaced B in a post
	'family', // documented family or marriage tie
	'business', // documented ownership or shareholding
	'party', // party membership or leadership
	'security', // documented military/police/intelligence working relationship
	'funding', // documented financial support between entities
	'diplomatic', // state-to-state or state-to-organisation relationship
	'political-alliance',
	'political-conflict',
	'prosecution', // the state prosecuted this person
	'reported-influence', // credible reporting claims influence; causality not established
	'allegation', // accusation requiring explicit labelling
	// v0.0.2 — additive (spec §5.1)
	'dismissal', // dismissing authority → person removed (a claim, not a position property)
	'ownership', // owner → owned entity
	'board', // person (or entity seat) → board of entity
	'shareholder', // shareholder → company
	'sponsorship', // sponsor → sponsored
	'partnership', // symmetric business partnership
	'franchise', // franchisor → franchisee
	'oversight', // overseer (state body) → institution
	'regulatory-authority', // regulator → regulated
	'licence', // issuer → holder; the licences.yaml record is authoritative
	'sanction', // issuer → target
	'coalition', // symmetric political coalition
	'endorsement', // endorser → endorsed
	'candidate-campaign', // candidate → campaign/party
	'influence', // documented influence with a stated channel
	'advisory' // advisor → advised
]);

/**
 * Edge direction semantics (spec §5.2). `directed` means from→to is the claim and
 * reversing it makes a different claim (V14); `symmetric` means the edge is its own
 * reverse; `contextual` means the type does not fix the orientation — the record's
 * description does.
 */
export type DirectionKind = 'directed' | 'symmetric' | 'contextual';

export const EDGE_DIRECTION: Record<z.infer<typeof RelationshipType>, DirectionKind> = {
	institutional: 'contextual',
	appointment: 'directed', // appointer → appointee
	succession: 'directed', // predecessor → successor
	dismissal: 'directed', // dismissing authority → person removed
	family: 'symmetric',
	business: 'contextual',
	party: 'contextual',
	security: 'contextual',
	funding: 'directed', // funder → funded
	diplomatic: 'symmetric',
	'political-alliance': 'symmetric',
	'political-conflict': 'symmetric',
	prosecution: 'directed', // prosecuting body → prosecuted person
	'reported-influence': 'contextual', // reporting direction is not the causal claim
	allegation: 'contextual', // who alleges whom is the record's business
	ownership: 'directed', // owner → owned entity
	board: 'directed', // person (or entity seat) → board of entity
	shareholder: 'directed', // shareholder → company
	sponsorship: 'directed', // sponsor → sponsored
	partnership: 'symmetric',
	franchise: 'directed', // franchisor → franchisee
	oversight: 'directed', // overseer (state body) → institution
	'regulatory-authority': 'directed', // regulator → regulated
	licence: 'directed', // issuer → holder; the licences.yaml record is authoritative
	sanction: 'directed', // issuer → target
	coalition: 'symmetric',
	endorsement: 'directed', // endorser → endorsed
	'candidate-campaign': 'directed', // candidate → campaign/party
	influence: 'directed', // influencer → influenced
	advisory: 'directed' // advisor → advised
};

/** The influence channel vocabulary (spec §5.3). */
export const INFLUENCE_CHANNELS = [
	'appointment',
	'advice-relationship',
	'money',
	'publicity',
	'marriage',
	'secret',
	''
] as const;

export const AgreementKind = z.enum([
	'association',
	'accession',
	'free-trade',
	'customs-union',
	'investment',
	'double-taxation',
	'other'
]);

export const RegionKind = z.enum(['region', 'governorate', 'delegation', 'municipality']);

export const PlaceKind = z.enum([
	'port',
	'airport',
	'military-base',
	'power-plant',
	'pipeline',
	'water',
	'desalination',
	'road',
	'rail',
	'industrial-zone',
	'free-zone',
	'resource-field',
	'embassy',
	'palace',
	'town',
	'quarter'
]);

/** The languages a source may be written in. The engine's source kind validates against this list. */
export const SOURCE_LANGUAGES = ['ar', 'fr', 'en', 'it', 'de'] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];
