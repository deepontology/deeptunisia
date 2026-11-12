/**
 * The full search index, over the graph the instrument pages already hold.
 *
 * A reading page fetches `static/search-index.json` and can find the kinds it can
 * open: people, institutions and events. An instrument page has the graph itself,
 * so there is nothing to fetch and nothing to leave out: a reader on Chronicle can
 * look up a connection, a contract, a licence, a declaration, an education record,
 * a place or a region as well.
 *
 * This module is loaded on demand, only from a page that is not a reading page.
 * The import is dynamic on purpose: a static edge from the palette would put the
 * graph behind every page of prose again, which is what the small file exists to
 * prevent. The ranking matches the file's index, so a name ranks the same way
 * wherever it is typed.
 */
import MiniSearch from 'minisearch';
import { ds, entityName, formatDate, REL_LABEL, type Layer } from './model';
import type { Hit, HitKind, SearchOptions } from './search.svelte';

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
		 * The index is built once at module load, where there is no reactive context
		 * and no locale to read, so a date baked in here would freeze in whatever
		 * language the app happened to start in. `date` is carried alongside and the
		 * palette prefers it.
		 */
		detail: formatDate(e.interval.startEarliest, 'month'),
		layer: 'political' as Layer,
		haystack: [e.title_en, e.title_fr, e.title_ar, e.summary, e.category].filter(Boolean).join(' '),
		date: e.interval.startEarliest
	})),
	/*
	 * Connections. A connection's haystack folds in both endpoint names, so
	 * "Trabelsi bank" finds the tie without the reader knowing either record's id.
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
		 * Entities outrank connections. A connection's name contains both endpoint
		 * names, so without this every tie involving a person scores as well as the
		 * person and pushes him down the list.
		 */
		boostDocument: (_id: string, _term: string, stored?: Record<string, unknown>) =>
			stored?.kind === 'relationship' ? 0.45 : 1
	}
});
mini.addAll(docs);

/** Drop the haystack: callers render the display fields, and it is large. */
function strip(d: Doc | Hit): Hit {
	const { id, kind, name, detail, layer, date } = d as Doc;
	return { id, kind, name, detail, layer, date };
}

const byId = new Map(docs.map((d) => [d.id, strip(d)]));

/**
 * An empty query returns people rather than nothing, so the palette opens with
 * something to arrow through. Same rule as the file's index.
 */
export function searchGraph(query: string, options: SearchOptions = {}): Hit[] {
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

/** Resolve an id to its display form. */
export function graphHitById(id: string): Hit | null {
	return byId.get(id) ?? null;
}
