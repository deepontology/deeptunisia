import { prefersReducedMotion } from 'svelte/motion';
import { BASIS_ORDER, LAYERS, type Basis, type Layer } from '$lib/model';
import { type Locale } from '$lib/i18n';

/**
 * Theme state.
 *
 * A THEME is one complete look: its own lightness AND its own character. There
 * is no separate light/dark switch — Paper, Porcelain and Daylight are light
 * themes; Midnight, Ember and Eclipse are dark ones. Choosing one sets both
 * attributes at once: `data-theme` carries the mode's structural tokens,
 * `data-palette` its character (see tokens.css §2c).
 *
 * `system` follows the OS and keeps following it: Paper while the system is
 * light, Midnight while it is dark. An explicit choice pins one theme.
 */

export type ThemeMode = 'light' | 'dark';

/** The six real looks — everything `system` resolves to excepted. */
export type ThemeId = 'paper' | 'porcelain' | 'daylight' | 'midnight' | 'ember' | 'eclipse';

/** What the reader picks: follow the OS, or pin one of the six. */
export type ThemeChoice = 'system' | ThemeId;

const STORAGE_KEY = 'deeptunisia:theme';
const ACCENT_KEY = 'deeptunisia:accent';
/** Pre-unification key: a tint-only appearance stored beside a bare mode. */
const LEGACY_PALETTE_KEY = 'deeptunisia:appearance';

export interface ThemeDef {
	id: ThemeId;
	mode: ThemeMode;
	labelKey: string;
}

/**
 * The six looks, light block first. They are deliberately distinct in more than
 * hue — Paper/Porcelain/Daylight differ in warmth and contrast, and so do
 * Midnight/Ember/Eclipse — because four tints over one ramp taught us that a
 * hue nudge nobody can see is not an option, it is noise. Values live in the
 * palette blocks of tokens.css.
 */
export const THEMES: ThemeDef[] = [
	{ id: 'paper', mode: 'light', labelKey: 'set.appearance.paper' },
	{ id: 'porcelain', mode: 'light', labelKey: 'set.appearance.porcelain' },
	{ id: 'daylight', mode: 'light', labelKey: 'set.appearance.daylight' },
	{ id: 'midnight', mode: 'dark', labelKey: 'set.appearance.midnight' },
	{ id: 'ember', mode: 'dark', labelKey: 'set.appearance.ember' },
	{ id: 'eclipse', mode: 'dark', labelKey: 'set.appearance.eclipse' }
];

/** What `system` means while the OS prefers light. */
export const DEFAULT_LIGHT_THEME: ThemeId = 'paper';
/** What `system` means while the OS prefers dark. */
export const DEFAULT_DARK_THEME: ThemeId = 'midnight';

function isThemeId(v: string | null | undefined): v is ThemeId {
	return (
		v === 'paper' ||
		v === 'porcelain' ||
		v === 'daylight' ||
		v === 'midnight' ||
		v === 'ember' ||
		v === 'eclipse'
	);
}

function themeById(id: ThemeId): ThemeDef {
	return THEMES.find((t) => t.id === id)!;
}

/**
 * One-place migration from the pre-unification scheme (a bare light/dark mode
 * plus a tint-only appearance): each old pair maps to the new theme closest to
 * what the reader was actually looking at, so nobody's chrome jumps on upgrade.
 * Mirrored inline in app.html, which cannot import modules before first paint.
 */
function migrateLegacy(mode: string | null, palette: string | null): ThemeId {
	const m = mode === 'dark' ? 'dark' : 'light';
	switch (palette) {
		case 'slate':
			return m === 'dark' ? 'midnight' : 'porcelain';
		case 'graphite':
			return m === 'dark' ? 'eclipse' : 'porcelain';
		case 'sepia':
			return m === 'dark' ? 'ember' : 'paper';
		case 'ink':
		default:
			return m === 'dark' ? 'ember' : 'paper';
	}
}

/** Ochre. Matches the political layer, because the project's spine is institutions. */
export const DEFAULT_ACCENT = 85;

/**
 * The offered accents.
 *
 * Six of the seven are the analytical layer hues. That is not a shortcut: the
 * palette already proved those seven are mutually distinguishable at equal visual
 * weight, so any of them is a safe accent, and picking one makes the chrome agree
 * with a lane the reader already reads as a colour. Free hue entry is available
 * underneath for anyone who wants it.
 */
export const ACCENTS: { id: string; hue: number; label: string }[] = [
	{ id: 'ochre', hue: DEFAULT_ACCENT, label: 'Ochre' },
	{ id: 'rust', hue: 32, label: 'Rust' },
	{ id: 'jade', hue: 155, label: 'Jade' },
	{ id: 'teal', hue: 205, label: 'Teal' },
	{ id: 'azure', hue: 245, label: 'Azure' },
	{ id: 'violet', hue: 300, label: 'Violet' },
	{ id: 'magenta', hue: 350, label: 'Magenta' }
];

class ThemeState {
	choice = $state<ThemeChoice>('system');
	systemIsDark = $state(true);

	/**
	 * Accent hue in degrees. Only the hue: lightness and chroma are fixed in
	 * tokens.css so no choice can fail contrast, and the layer and basis hues are
	 * untouchable because they encode data rather than taste.
	 */
	accent = $state(DEFAULT_ACCENT);

	/** The mode showing right now, whatever produced it. */
	get resolved(): ThemeMode {
		if (this.choice === 'system') return this.systemIsDark ? 'dark' : 'light';
		return themeById(this.choice).mode;
	}

	/** The concrete theme showing right now — what `system` currently means. */
	get resolvedTheme(): ThemeDef {
		if (this.choice === 'system') {
			return themeById(this.systemIsDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME);
		}
		return themeById(this.choice);
	}

	get reduceMotion(): boolean {
		return prefersReducedMotion.current;
	}

	set(choice: ThemeChoice) {
		this.choice = choice;
		if (typeof localStorage !== 'undefined') {
			if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, choice);
		}
		applyTheme(choice);
	}

	/**
	 * Keyboard affordance (`d`), not the primary control — that is the grid in
	 * Settings. Cycles system → the flagship of the opposite mode → the other
	 * flagship → system. Deliberately not a fixed rotation: whatever the OS
	 * prefers, the first press must land somewhere visibly different from what
	 * is on screen, or the shortcut reads as broken.
	 */
	cycle() {
		const systemDefault = this.systemIsDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
		if (this.choice === 'system') {
			this.set(systemDefault === DEFAULT_DARK_THEME ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME);
		} else if (this.choice === (this.systemIsDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME)) {
			this.set('system');
		} else {
			this.set(systemDefault);
		}
	}

	/**
	 * Applied to the document directly rather than through a `$effect`.
	 *
	 * An effect that reads theme state and writes the DOM would be fine, but the
	 * inline script in app.html has to do the same job before hydration anyway,
	 * so having one plain function both callers share keeps the two paths from
	 * drifting.
	 */
	setAccent(hue: number) {
		const h = ((Math.round(hue) % 360) + 360) % 360;
		this.accent = h;
		applyAccent(h);
		if (typeof localStorage !== 'undefined') {
			if (h === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_KEY);
			else localStorage.setItem(ACCENT_KEY, String(h));
		}
	}
}

export const theme = new ThemeState();

function applyAccent(hue: number) {
	if (typeof document === 'undefined') return;
	document.documentElement.style.setProperty('--accent-hue', String(hue));
}

/**
 * Write both attributes the cascade hangs off. Always set both: app.html always
 * sets both too, so an absent attribute never becomes a second source of truth.
 */
function applyTheme(choice: ThemeChoice) {
	if (typeof document === 'undefined') return;
	const def =
		choice === 'system'
			? themeById(
					window.matchMedia('(prefers-color-scheme: dark)').matches
						? DEFAULT_DARK_THEME
						: DEFAULT_LIGHT_THEME
				)
			: themeById(choice);
	document.documentElement.dataset.theme = def.mode;
	document.documentElement.dataset.palette = def.id;
}

/**
 * Restore the reader's language choice. Lives here rather than in state.svelte.ts
 * to keep the import direction one-way: state does not depend on design.
 */
function restoreLocale() {
	let stored = localStorage.getItem('deeptunisia:locale');
	if (stored !== 'ar' && stored !== 'fr' && stored !== 'en') {
		// No stored choice: follow the system, matching what the inline script in
		// app.html has already painted. The landing writes this same key, so a
		// choice made there carries straight through.
		const sys = (navigator.language ?? '').toLowerCase();
		stored = sys.startsWith('ar') ? 'ar' : sys.startsWith('fr') ? 'fr' : 'en';
	}
	// Imported lazily; the app state module owns the value.
	void import('$lib/state.svelte').then(({ app }) => {
		app.locale = stored as Locale;
	});
}

/**
 * Wire the theme to the document and the OS. Call once from the root layout.
 * Returns a teardown function.
 */
export function initTheme(): () => void {
	if (typeof window === 'undefined') return () => {};

	// Migrate a pre-unification install before reading, so the old pair becomes
	// one stored theme id and the tint key goes away entirely.
	const legacyTint = localStorage.getItem(LEGACY_PALETTE_KEY);
	if (legacyTint !== null) {
		localStorage.setItem(
			STORAGE_KEY,
			migrateLegacy(localStorage.getItem(STORAGE_KEY), legacyTint)
		);
		localStorage.removeItem(LEGACY_PALETTE_KEY);
	}

	const stored = localStorage.getItem(STORAGE_KEY);
	if (isThemeId(stored)) theme.choice = stored;

	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	theme.systemIsDark = mq.matches;

	// app.html has already painted with these values; writing them again from
	// state keeps the settings control agreeing with what is on screen through
	// the one apply function rather than a parallel copy of its logic.
	applyTheme(theme.choice);

	// And keep following the OS while `system` is the choice — the pre-paint
	// script cannot listen, so this listener is what makes system mean "keeps
	// following" rather than "matched once at load".
	const onChange = (e: MediaQueryListEvent) => {
		theme.systemIsDark = e.matches;
		if (theme.choice === 'system') applyTheme('system');
	};
	mq.addEventListener('change', onChange);

	const accent = Number(localStorage.getItem(ACCENT_KEY));
	if (Number.isFinite(accent) && accent > 0) theme.accent = accent;
	applyAccent(theme.accent);

	restoreLocale();

	return () => mq.removeEventListener('change', onChange);
}

/**
 * Token accessors.
 *
 * SVG cannot inherit a CSS custom property through `fill` in every engine we care
 * about, and canvas needs real colour strings, so visualisation code resolves
 * tokens to computed values. These are the ONLY sanctioned way to get a colour
 * into a chart — never hardcode a hex in a component.
 */
export function cssVar(name: string, fallback = '#888'): string {
	if (typeof window === 'undefined') return fallback;
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

/*
 * NOTE for anyone adding a canvas-based visualisation.
 *
 * There is deliberately no resolved-colour map here. `LAYER_COLOR` and `BASIS_COLOR`
 * in model.ts return `var(--layer-*)` / `var(--basis-*)`, so every current chart
 * follows the theme through CSS with no JavaScript involved. Canvas cannot read a
 * CSS variable, so if you add one, call `cssVar()` above inside the draw call — do
 * not cache the result, and above all do not add a reactive counter to invalidate
 * it. An earlier version did exactly that: incrementing an `epoch` inside the theme
 * effect read and wrote the same state, which self-triggers, and Svelte aborted the
 * whole effect tree — the app rendered blank with only a cryptic `get_first_child`
 * error to go on.
 */
