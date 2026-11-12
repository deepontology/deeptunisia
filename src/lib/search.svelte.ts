/**
 * The one search index, fetched on first use.
 *
 * It used to be built at module load from the whole graph, which meant every
 * page that could search paid 10 MB. It now reads `static/search-index.json`,
 * written by the data build from the same records, so a page of prose can offer
 * search without the graph. The file covers the kinds a reading page can open:
 * people, institutions, events. Names in this dataset arrive through three
 * scripts, and the index folds Arabic, French and English forms plus alias
 * spellings into one haystack, so searching "Hajjam" finds the officer filed
 * under "Hajem".
 *
 * The ranking is unchanged: names weigh three, entities outrank connections,
 * prefix matching and fuzzy 0.2. Agora's mention menus and the command palette
 * share this index, so a name typed in a post and a name typed in ⌘K rank the
 * same way.
 */
import MiniSearch from 'minisearch';
import { browser } from '$app/environment';
import type { Layer } from '$lib/model';

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

/** One row of the built search file. Empty fields are omitted by the build. */
interface Row {
	id: string;
	kind: HitKind;
	name: string;
	name_fr?: string;
	name_ar?: string;
	aliases?: string[];
	detail?: string;
	layer: Layer;
	date?: number;
	hay?: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

let mini: MiniSearch<Doc> | null = null;
let docs: Doc[] = [];
let byId = new Map<string, Hit>();
let loading: Promise<void> | null = null;
let status = $state<Status>('idle');
let failure = '';

/** For a palette that wants to say why it is empty. */
export function searchStatus(): Status {
	return status;
}

/** For a palette that wants to name the failure instead of an empty list. */
export function searchError(): string {
	return failure;
}

/**
 * Fetch and build the index once. Safe to call from anywhere, any number of
 * times: the first caller does the work and every later caller joins it.
 */
export function loadSearch(): Promise<void> {
	if (loading) return loading;
	if (!browser) return Promise.resolve();
	status = 'loading';
	loading = (async () => {
		try {
			const res = await fetch('/search-index.json');
			if (!res.ok) throw new Error(`search-index.json returned ${res.status}`);
			const payload = (await res.json()) as { records?: Row[] };
			const built = (payload.records ?? []).map(toDoc);
			const index = new MiniSearch<Doc>({
				fields: ['name', 'haystack'],
				storeFields: ['id', 'kind', 'name', 'detail', 'layer', 'date'],
				searchOptions: {
					boost: { name: 3 },
					prefix: true,
					fuzzy: 0.2,
					/*
					 * Entities outrank connections, for the day the file carries
					 * them again. A connection's name contains both endpoint
					 * names, so without this every tie involving a person scored
					 * as well as the person and pushed him down the list.
					 */
					boostDocument: (_id: string, _term: string, stored?: Record<string, unknown>) =>
						stored?.kind === 'relationship' ? 0.45 : 1
				}
			});
			index.addAll(built);
			mini = index;
			docs = built;
			byId = new Map(built.map((d) => [d.id, strip(d)]));
			status = 'ready';
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
			status = 'error';
			console.error('search index failed to load:', failure);
		}
	})();
	return loading;
}

function toDoc(row: Row): Doc {
	const haystack = [row.name, row.name_fr, row.name_ar, ...(row.aliases ?? []), row.detail, row.hay]
		.filter(Boolean)
		.join(' ');
	return {
		id: row.id,
		kind: row.kind,
		name: row.name,
		detail: row.detail ?? '',
		layer: row.layer,
		date: row.date,
		haystack
	};
}

export interface SearchOptions {
	limit?: number;
	/** Restrict to these kinds. Omit for everything. */
	kinds?: readonly HitKind[];
}

/**
 * An empty query returns people rather than nothing, so both the palette and the
 * mention menu open with something to arrow through. A menu that appears empty
 * reads as broken, and the reader has no way to tell it apart from one that is.
 *
 * Before the file arrives it returns an empty list and starts the load; callers
 * that render in an effect re-run when it lands, because the status is read here.
 */
export function search(query: string, options: SearchOptions = {}): Hit[] {
	void status;
	if (!mini) {
		if (status === 'idle') void loadSearch();
		return [];
	}
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

/** Resolve an id to its display form. Used when rendering a stored mention. */
export function hitById(id: string): Hit | null {
	void status;
	if (!mini && status === 'idle') void loadSearch();
	return byId.get(id) ?? null;
}
