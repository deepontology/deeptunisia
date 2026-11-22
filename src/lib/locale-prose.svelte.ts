/**
 * The long prose of the graph, fetched when a panel needs it.
 *
 * The bundled graph carries every name and title in all three languages, and the
 * ids, dates, intervals, sources and links of every record. It does not carry the
 * longer prose (summaries, notes, reasoning, falsifiable-by, descriptions,
 * taglines): that is about a quarter of the graph and none of the first screen.
 * scripts/build-data.ts writes it to `static/prose-en.json` (English) and
 * `static/prose-<lang>.json` (French, Arabic); this module fetches the files once
 * and merges them into the same records the rest of the site reads, and bumps
 * `localeProse.version` so every `prose()` read redraws. The types of the
 * records the browser holds do not have these fields, so a read that does not go
 * through `prose()` does not compile.
 *
 * English is fetched as soon as anything asks for a prose field, and once the
 * instrument shell is idle. A French or Arabic reader fetches that language's
 * file as well; until it lands the English original is shown, marked as untranslated,
 * which is what an untranslated record already does.
 *
 * Offline: the browser's HTTP cache keeps the file after the first read and
 * `fetchKept` falls back to it when the network fails. A reader who has not read it
 * gets `englishProse.status === 'error'`; there is no service worker.
 */
import { browser } from '$app/environment';
import { fetchKept } from './fetch-kept';
import { ds, personById, institutionById, positionById, sourceById, relationshipById, eventById } from './model';

type Lang = 'en' | 'fr' | 'ar';
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

/** Where the English prose is: a panel that shows a prose field can say it is on its way or out of reach. */
export const englishProse = $state<{ status: 'idle' | 'loading' | 'ready' | 'error' }>({ status: 'idle' });

const pending = new Map<Lang, Promise<void>>();

/** Fetch and merge the English prose, once. */
export function ensureEnglishProse(): Promise<void> {
	return ensureLocaleProse('en');
}

/**
 * Ask for the English prose from inside a read. A read runs while a component renders,
 * where state may not be written, so the request is queued rather than made.
 */
export function wantEnglishProse(): void {
	if (browser && englishProse.status === 'idle') queueMicrotask(() => void ensureEnglishProse());
}

/** Fetch and merge a language's prose, once. */
export function ensureLocaleProse(locale: string): Promise<void> {
	if (locale !== 'en' && locale !== 'fr' && locale !== 'ar') return Promise.resolve();
	const lang = locale as Lang;
	let p = pending.get(lang);
	if (!p) {
		if (lang === 'en') englishProse.status = 'loading';
		// The graph hash names the build, so a new dataset never meets old prose in a cache.
		const v = encodeURIComponent((ds.meta as { datasetHash?: string }).datasetHash ?? '');
		p = fetchKept(`/prose-${lang}.json?v=${v}`)
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
				if (lang === 'en') englishProse.status = 'ready';
			})
			.catch(() => {
				// Offline or missing: stay on English, and try again next time it is asked for.
				pending.delete(lang);
				if (lang === 'en') englishProse.status = 'error';
			});
		pending.set(lang, p);
	}
	return p;
}
