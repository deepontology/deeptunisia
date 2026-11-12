import { app } from './state.svelte';
import { translate, format as formatIn, type Locale } from './i18n';
import {
	CONFIDENCE_LABEL,
	LAYER_LABEL,
	REL_LABEL,
	type Basis,
	type Confidence,
	type IndexKey,
	type Layer
} from './vocab';

/**
 * Reactive translation helper. `t('nav.atlas')` re-renders when the locale changes
 * because it reads `app.locale` inside a rune-tracked scope.
 *
 * This module is deliberately free of the graph: it holds keys and label maps
 * only. Anything that reads a record lives in `names.svelte.ts`.
 */
export function t(key: string): string {
	return translate(app.locale, key);
}

/** Reactive translation with `{param}` interpolation, whole sentences only. */
export function tf(key: string, params: Record<string, string | number> = {}): string {
	return formatIn(app.locale, key, params);
}

export function localeName(): Locale {
	return app.locale;
}

export function basisLabel(b: Basis): string {
	return translate(app.locale, `basis.${b}`);
}

/** The full evidence description, from the dictionary, never BASIS_DESC directly. */
export function basisDesc(b: Basis): string {
	return translate(app.locale, `basis.desc.${b}`);
}

/** The index legend, from the dictionary. INDEX_META stays the EN fallback. */
export function indexMeta(k: IndexKey): { label: string; blurb: string; derived: string } {
	return {
		label: translate(app.locale, `index.${k}.label`),
		blurb: translate(app.locale, `index.${k}.blurb`),
		derived: translate(app.locale, `index.${k}.derived`)
	};
}

export function layerLabel(l: Layer): string {
	return translate(app.locale, `layer.${l}`) || LAYER_LABEL[l];
}

/*
 * `basis.*` and `layer.*` have been translated in all three locales since the
 * first i18n pass, and eleven call sites rendered the raw English maps from
 * model.ts instead, so the Arabic interface showed "Reported" and "ECONOMIC"
 * beside a perfectly good Arabic translation nobody was reading. Import the
 * reactive label, never the map.
 */
export function relLabel(type: string): string {
	// `translate` answers the key itself when no dictionary has it; a reader
	// must never see "rel.board", so a missing key falls through to the English
	// label and then to the type written as words.
	const key = `rel.${type}`;
	const v = translate(app.locale, key);
	return (v && v !== key ? v : '') || REL_LABEL[type] || type.replace(/-/g, ' ');
}

export function confidenceLabel(c: Confidence): string {
	return translate(app.locale, `confidence.${c}`) || CONFIDENCE_LABEL[c];
}
