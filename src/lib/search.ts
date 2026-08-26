/**
 * The one search index over the graph.
 *
 * It used to live inside SearchPalette.svelte as module-level code, which meant the
 * only way to search the graph was to open the palette. The mention autocomplete in
 * Agora needs the same index and the same ranking — and if it built its own, typing
 * a name in a post and typing it in ⌘K would return different orders, which is the
 * kind of inconsistency that makes an instrument feel unreliable even when both
 * answers are defensible.
 *
 * Names in this dataset arrive through three scripts. The index deliberately folds
 * Arabic, French and English forms plus alias spellings into one haystack, so
 * searching "Hajjam" finds the officer filed under "Hajem".
 */
import MiniSearch from 'minisearch';
import { ds, entityName, formatDate, REL_LABEL, type Layer } from '$lib/model';

export type HitKind = 'person' | 'institution' | 'event' | 'relationship' | 'contract' | 'licence' | 'declaration' | 'education' | 'place' | 'region';

export interface Hit {
	id: string;
	kind: HitKind;
	name: string;
	detail: string;
	layer: Layer;
	date?: number;
}

interface Doc extends Hit {
	haystack: string;
}

const docs: Doc[] = [
	...ds.people.map((p) => ({
		id: p.id,
		kind: 'person' as const,
		name: p.name_en,
		detail: p.tagline ?? '',
		layer: p.layers[0] as Layer,
		haystack: [p.name_en, p.name_fr, p.name_ar, ...p.aliases, p.tagline, ...p.trajectory]
			.filter(Boolean)
			.join(' ')
	})),
	...ds.institutions.map((i) => ({
		id: i.id,
		kind: 'institution' as const,
		name: i.name_en,
		detail: i.abbr ?? i.type.replace('-', ' '),
		layer: i.layer as Layer,
		haystack: [i.name_en, i.name_fr, i.name_ar, i.abbr, i.type].filter(Boolean).join(' ')
	})),
	...ds.events.map((e) => ({
		id: e.id,
		kind: 'event' as const,
		name: e.title_en,
		/*
		 * Formatted here in English on purpose, and superseded at render time.
		 *
		 * This index is built once at module load, where there is no reactive context
		 * and no locale to read — so a date baked in here would be frozen in whatever
		 * language the app happened to start in. `date` is carried alongside, and the
		 * two consumers prefer it: see the `hit.date` branch in SearchPalette and
		 * EntityMenu. This value is the fallback for a hit that has no timestamp.
		 */
		detail: formatDate(e.interval.startEarliest, 'month'),
		layer: 'political' as Layer,
		haystack: [e.title_en, e.title_fr, e.title_ar, e.summary, e.category].filter(Boolean).join(' '),
		date: e.interval.startEarliest
	})),
	/*
	 * Connections.
	 *
	 * They became addressable records with their own card and URL, but the palette
	 * still indexed only the things that hold offices — so the one kind of claim
	 * people actually argue about was the one kind you could not look up. The
	 * haystack folds in both endpoint names, so "Trabelsi bank" finds the tie
	 * without the reader knowing either record's id.
	 */
	...ds.relationships.map((r) => ({
		id: r.id,
		kind: 'relationship' as const,
		name: `${entityName(r.from)} → ${entityName(r.to)}`,
		detail: REL_LABEL[r.type] ?? r.type,
		layer: 'political' as Layer,
		haystack: [
			entityName(r.from),
			entityName(r.to),
			REL_LABEL[r.type] ?? r.type,
			r.subtype,
			r.description,
			r.attributed_to
		]
			.filter(Boolean)
			.join(' ')
	})),
	// v0.0.2 record kinds (spec §4/§8): the palette and Agora mentions index the
	// same things the graph holds — a contract you cannot look up may as well
	// not exist. Contracts carry their fuzzy value in the haystack.
	...ds.contracts.map((c) => ({
		id: c.id,
		kind: 'contract' as const,
		name: c.title_en,
		detail: `${c.kind} · ${c.institution}`,
		layer: 'economic' as Layer,
		haystack: [c.title_en, c.title_fr, c.title_ar, c.kind, c.institution, c.winner, c.award?.value]
			.filter(Boolean)
			.join(' '),
		date: c.interval?.startEarliest
	})),
	...ds.licences.map((l) => ({
		id: l.id,
		kind: 'licence' as const,
		name: `${l.kind} — ${entityName(l.holder)}`,
		detail: l.issuer ?? '',
		layer: 'economic' as Layer,
		haystack: [l.kind, l.holder, l.issuer, l.grant].filter(Boolean).join(' ')
	})),
	...ds.declarations.map((d) => ({
		id: d.id,
		kind: 'declaration' as const,
		name: `${d.kind} — ${entityName(d.declarer)}`,
		detail: d.date ?? '',
		layer: 'judicial' as Layer,
		haystack: [d.kind, d.declarer, d.jurisdiction, d.summary].filter(Boolean).join(' ')
	})),
	...ds.education.map((e) => ({
		id: e.id,
		kind: 'education' as const,
		name: e.degree_en,
		detail: entityName(e.person),
		layer: 'civil' as Layer,
		haystack: [e.degree_en, e.degree_fr, e.degree_ar, e.person, e.field, e.institution ?? '']
			.filter(Boolean)
			.join(' '),
		date: e.interval?.startEarliest
	})),
	...ds.regions.map((r) => ({
		id: r.id,
		kind: 'region' as const,
		name: r.name_en,
		detail: r.kind,
		layer: 'political' as Layer,
		haystack: [r.name_en, r.name_fr, r.name_ar, r.kind, r.code].filter(Boolean).join(' ')
	})),
	...ds.places.map((p) => ({
		id: p.id,
		kind: 'place' as const,
		name: p.name_en,
		detail: p.kind,
		layer: 'economic' as Layer,
		haystack: [p.name_en, p.name_fr, p.name_ar, p.kind, p.parent ?? ''].filter(Boolean).join(' ')
	}))
];

const mini = new MiniSearch<Doc>({
	fields: ['name', 'haystack'],
	storeFields: ['id', 'kind', 'name', 'detail', 'layer', 'date'],
	searchOptions: {
		boost: { name: 3 },
		prefix: true,
		fuzzy: 0.2,
		/*
		 * Entities outrank connections.
		 *
		 * A connection's name contains both endpoint names, so without this every tie
		 * involving Bourguiba scores as well as Bourguiba himself and pushes him down
		 * the list. Typing a person's name is overwhelmingly a request for that person;
		 * the ties are what you find when you search for the *claim*.
		 */
		boostDocument: (_id: string, _term: string, stored?: Record<string, unknown>) =>
			stored?.kind === 'relationship' ? 0.45 : 1
	}
});
mini.addAll(docs);

export interface SearchOptions {
	limit?: number;
	/** Restrict to these kinds. Omit for everything. */
	kinds?: readonly HitKind[];
}

/**
 * An empty query returns people rather than nothing, so both the palette and the
 * mention menu open with something to arrow through. A menu that appears empty
 * reads as broken, and the reader has no way to tell it apart from one that is.
 */
export function search(query: string, options: SearchOptions = {}): Hit[] {
	const { limit = 24, kinds } = options;
	const allowed = kinds ? new Set<HitKind>(kinds) : null;
	const permitted = (d: { kind: HitKind }) => !allowed || allowed.has(d.kind);

	if (!query.trim()) {
		return docs
			.filter((d) => (allowed ? permitted(d) : d.kind === 'person'))
			.slice(0, limit)
			.map(strip);
	}
	return (mini.search(query) as unknown as Doc[]).filter(permitted).slice(0, limit).map(strip);
}

/** Drop the haystack — callers render the display fields, and it is large. */
function strip(d: Doc | Hit): Hit {
	const { id, kind, name, detail, layer, date } = d as Doc;
	return { id, kind, name, detail, layer, date };
}

const byId = new Map(docs.map((d) => [d.id, strip(d)]));

/** Resolve an id to its display form. Used when rendering a stored mention. */
export function hitById(id: string): Hit | null {
	return byId.get(id) ?? null;
}
