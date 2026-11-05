/**
 * French and Arabic prose, fetched for the reader's language.
 *
 * The bundled graph carries every name and title in all three languages but
 * the longer prose (summaries, notes, reasoning, descriptions) in English
 * only: the translations are a third of the graph and a reader sees one
 * language. scripts/build-data.ts writes each language's prose to
 * static/prose-<lang>.json; this module fetches the reader's file once and
 * merges it into the same records the rest of the site reads, so every
 * `prose()` call site works unchanged. Until it lands, prose falls back to
 * English, which is what an untranslated record already does.
 */
import { ds, personById, institutionById, positionById, sourceById, relationshipById, eventById } from './model';

type Lang = 'fr' | 'ar';
type Overlay = { datasetHash?: string } & Record<string, Record<string, Record<string, unknown>>>;

const byCollection: Record<string, Map<string, object>> = {
	people: personById,
	institutions: institutionById,
	positions: positionById,
	sources: sourceById,
	relationships: relationshipById,
	events: eventById
};

/** Bumped when a language's prose has been merged; `prose()` reads it to re-render. */
export const localeProse = $state({ version: 0 });

const pending = new Map<Lang, Promise<void>>();

/** Fetch and merge a language's prose, once. English needs nothing. */
export function ensureLocaleProse(locale: string): Promise<void> {
	if (locale !== 'fr' && locale !== 'ar') return Promise.resolve();
	const lang = locale as Lang;
	let p = pending.get(lang);
	if (!p) {
		// The graph hash names the build, so a new dataset never meets old prose in a cache.
		const v = encodeURIComponent((ds.meta as { datasetHash?: string }).datasetHash ?? '');
		p = fetch(`/prose-${lang}.json?v=${v}`)
			.then((r) => (r.ok ? (r.json() as Promise<Overlay>) : null))
			.then((overlay) => {
				if (!overlay) throw new Error('no prose');
				for (const [collection, records] of Object.entries(overlay)) {
					const index = byCollection[collection];
					if (!index || typeof records !== 'object') continue;
					for (const [id, fields] of Object.entries(records)) {
						const rec = index.get(id);
						if (rec) Object.assign(rec, fields);
					}
				}
				localeProse.version++;
			})
			.catch(() => {
				// Offline or missing: stay on English, and try again next time it is asked for.
				pending.delete(lang);
			});
		pending.set(lang, p);
	}
	return p;
}
