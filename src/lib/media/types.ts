/**
 * Typed shapes for the media investigation bundles produced by build-media.ts.
 * These are the runtime structures the article pages consume — keep them in
 * sync with src/content/media/<slug>/*.yaml.
 */

export type LocaleString = Record<string, string>;

export interface InvestigationMeta {
	slug: string;
	version: string;
	title: LocaleString;
	subtitle: LocaleString;
	series?: { id: string; title: LocaleString; position: number };
	published: string;
	status: string;
	reading_time_minutes: number;
	overall_confidence: string;
	overall_confidence_reasoning: string;
	tags: string[];
	cover_image: string | null;
}

export interface InvestigationResearch {
	researcher: string;
	research_period: string;
	datasets_consulted: string[];
	records_created: string[];
	sources_consulted_count: number;
	primary_sources_count: number;
	entities_identified: number;
	claims_extracted: number;
	disputed_claims: number;
	unresolved_claims: number;
	documented_negatives: number;
}

export interface Claim {
	id: string;
	text: LocaleString;
	grade: string;
	sources: string[];
	entities: string[];
	sections: string[];
	disputed: boolean;
	dispute?: {
		description: string;
		positions: Array<{ claim: string; source: string; holder: string }>;
		adopted: string;
	};
	layer?: string;
	negative?: boolean;
	/** Reserved for a later pass; not rendered anywhere yet. */
	scope?: string;
}

export interface Source {
	id: string;
	citation: LocaleString;
	url: string | null;
	tier: number | null;
	date_consulted: string;
	access: string;
	archive_url: string | null;
	sections_referenced?: string[];
}

export interface TimelineEvent {
	id: string;
	date: string;
	end_date: string | null;
	description: LocaleString;
	source: string;
	entity: string | null;
	type: string;
	section: string;
	layer?: string;
}

export interface Entity {
	id: string;
	name: LocaleString;
	role: string;
	mention_count: number;
	graph_link: string;
	graph_id?: string | null;
	description: LocaleString;
}

export interface Exclusion {
	claim: string;
	reason: string;
	grade: string;
	sources: string[];
	category: string;
	layer?: string;
}

export interface ContentInline {
	t: string;
	v?: string;
	href?: string;
	label?: string;
	claim_id?: string;
	entity_id?: string;
	children?: ContentInline[];
}

/** A standalone "> [I#]" paragraph in the narrative: renders as an interpretation panel. */
export interface InterpBlock {
	t: 'interp';
	ref: string;
}

export type StandardBlock =
	| { t: 'h1' | 'h2' | 'h3' | 'p'; v?: ContentInline[] }
	| { t: 'ul' | 'ol'; items?: ContentInline[][] }
	| { t: 'section'; id?: string | null; title?: string; section_type?: string };

export type ContentBlock = StandardBlock | InterpBlock;

/**
 * One editor reading, from interpretations.yaml. Kept apart from graded
 * claims by construction: it names who makes the reading, states the
 * reasoning and carries the observable that would prove it wrong.
 */
export interface InterpretationRecord {
	id: string;
	section: string;
	statement: LocaleString;
	attributed_to: string;
	reasoning: LocaleString;
	falsifier: LocaleString;
}

export interface InvestigationBundle {
	slug: string;
	meta: InvestigationMeta;
	research: InvestigationResearch;
	editorial: unknown;
	components: { components: Array<{ type: string; required: boolean; config?: unknown }> };
	evidence: { claims: Claim[] };
	sources: { sources: Source[] };
	timeline: { events: TimelineEvent[] };
	entities: { entities: Entity[] };
	exclusions: { exclusions: Exclusion[] };
	interpretations: { interpretations: InterpretationRecord[] };
	narrative: Record<string, { sections: ContentBlock[] }>;
}

export interface InvestigationIndexEntry {
	slug: string;
	title: LocaleString;
	subtitle: LocaleString;
	series?: { id: string; title: LocaleString; position: number };
	published: string;
	reading_time_minutes: number;
	overall_confidence: string;
	tags: string[];
	claim_count: number;
	source_count: number;
	disputed_count: number;
	unresolved_count: number;
}
