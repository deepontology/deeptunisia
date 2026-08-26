import { CUTOFF, FLOOR, LAYERS, type Basis, type Layer } from './model';
import { DEFAULT_WEIGHTS, type IndexKey } from './indices';
import { type Locale } from './i18n';

/**
 * One shared reactive state object drives every view. Selecting a person in the
 * network highlights them on the Chronicle and in the rankings; moving the date
 * updates all three. Coordination is the whole point of the three-view design, so
 * the state lives in one place rather than being threaded through props.
 */

const DEFAULT_DATE = Date.UTC(2011, 0, 14); // 14 January 2011

/**
 * The stored language, resolved synchronously on the client. The inline script in
 * app.html has already painted the same decision onto the document before this
 * module evaluates; this exists so the layout's first dir effect carries the
 * stored choice instead of starting from 'en' and reverting the document to ltr
 * until the deferred restore resolves — the flash app.html is there to kill.
 */
function initialLocale(): Locale {
	if (typeof localStorage === 'undefined') return 'en';
	const stored = localStorage.getItem('deeptunisia:locale');
	if (stored === 'ar' || stored === 'fr' || stored === 'en') return stored;
	const sys = (navigator.language ?? '').toLowerCase();
	return sys.startsWith('ar') ? 'ar' : sys.startsWith('fr') ? 'fr' : 'en';
}

class AppState {
	/** Scrubbed instant. Every view is a projection of this. */
	t = $state(DEFAULT_DATE);

	/**
	 * Evidence threshold, on the epistemic-basis axis. Defaults to documented plus
	 * reported. Moving it is the single most informative interaction on the site: the
	 * network visibly thins as the standard rises, and admitting the unsubstantiated
	 * tier shows how much of the popular account rests on nothing.
	 */
	basisFloor = $state<Basis>('reported');

	/**
	 * UI language. Entity names carry Arabic and French forms in the data.
	 *
	 * Persisted, unlike most of this state. The rest of the app's state is a view
	 * onto the data and is fine to reset, but language is a property of the reader:
	 * losing it on reload means someone shares a link and the Arabic reader gets
	 * English. Restored before first paint by the inline script in app.html.
	 */
	locale = $state<Locale>(initialLocale());

	setLocale(locale: Locale) {
		this.locale = locale;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('deeptunisia:locale', locale);
		}
	}

	activeLayers = $state<Set<Layer>>(new Set(LAYERS));

	/**
	 * Quiet mode: the map as a filter, not a dump. When on, dormant edges and
	 * dimmed nodes are withheld entirely instead of being drawn at reduced
	 * strength, so the reader sees only the live graph at this instant. This is the
	 * intensity dial — "too much" is not a bug, it is a setting.
	 */
	quiet = $state(false);

	/** Currently selected entity id, person or institution. */
	selected = $state<string | null>(null);

	/** Hovered entity, for cross-view highlighting without committing a selection. */
	hovered = $state<string | null>(null);

	/** Rankings: whether indices reflect one instant or the whole timeline. */
	allTime = $state(false);

	/** Reader-adjustable composite weights, so the ranking's assumptions are visible. */
	weights = $state<Record<IndexKey, number>>({ ...DEFAULT_WEIGHTS });

	playing = $state(false);
	playSpeed = $state(1);

	searchOpen = $state(false);

	toggleLayer(layer: Layer) {
		const next = new Set(this.activeLayers);
		if (next.has(layer)) {
			// Never allow an empty selection: an empty graph teaches nothing.
			if (next.size > 1) next.delete(layer);
		} else {
			next.add(layer);
		}
		this.activeLayers = next;
	}

	soloLayer(layer: Layer) {
		this.activeLayers = new Set([layer]);
	}

	allLayers() {
		this.activeLayers = new Set(LAYERS);
	}

	select(id: string | null) {
		this.selected = this.selected === id ? null : id;
	}

	setDate(t: number) {
		this.t = Math.min(CUTOFF, Math.max(FLOOR, t));
	}

	nudge(years: number) {
		this.setDate(this.t + years * 365.2425 * 86_400_000);
	}

	reset() {
		this.t = DEFAULT_DATE;
		this.basisFloor = 'reported';
		this.activeLayers = new Set(LAYERS);
		this.selected = null;
		this.weights = { ...DEFAULT_WEIGHTS };
		this.quiet = false;
	}
}

export const app = new AppState();

/** Drives the play/pause animation of the time scrubber. */
export function startPlayback() {
	if (typeof window === 'undefined') return () => {};
	let raf = 0;
	let last = performance.now();

	const tick = (now: number) => {
		const dt = now - last;
		last = now;
		if (app.playing) {
			// Roughly two years of history per second at 1x.
			const advance = (dt / 1000) * 2 * app.playSpeed * 365.2425 * 86_400_000;
			const next = app.t + advance;
			if (next >= CUTOFF) {
				app.setDate(CUTOFF);
				app.playing = false;
			} else {
				app.setDate(next);
			}
		}
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);
	return () => cancelAnimationFrame(raf);
}
