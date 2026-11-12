/**
 * Vocabulary that is not data.
 *
 * The shell and the prose pages need names, colours and the two ends of the
 * research window, never the graph. These are literals, so they live in a
 * module with no records in it; `model.ts` re-exports the whole set so
 * instrument code keeps its imports unchanged.
 *
 * The window dates come from `src/generated/window.json`, a few bytes written
 * by the data build beside the dataset, because reading them from the dataset
 * would put 10 MB behind a two-number import.
 */
import type { Basis, Confidence, Layer } from '$data/index';
import windowDates from '$data/window.json';

export type { Basis, Confidence, Layer };

/** Research horizon and floor, written by `scripts/build-data.ts`. */
export const CUTOFF: number = windowDates.cutoff;
export const FLOOR: number = windowDates.floor;

// --- Epistemic basis -------------------------------------------------------

export const BASIS_ORDER: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];

/**
 * Basis colours. Unlike the layer hues these ARE a ranked ramp, green through
 * amber to red, because documented and unsubstantiated is a real ordering and
 * the colour should say so.
 */
export const BASIS_COLOR: Record<Basis, string> = {
	documented: 'var(--basis-documented)',
	reported: 'var(--basis-reported)',
	inferred: 'var(--basis-inferred)',
	unsubstantiated: 'var(--basis-unsubstantiated)'
};

/** SVG stroke-dasharray by basis, so the kind of claim is visible at a glance. */
export const DASH: Record<Basis, string> = {
	documented: '',
	reported: '5 3',
	inferred: '2 3',
	unsubstantiated: '1 3 6 3'
};

export const BASIS_OPACITY: Record<Basis, number> = {
	documented: 1,
	reported: 0.82,
	inferred: 0.6,
	unsubstantiated: 0.45
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
	A: 'Primary record',
	B: 'Multiple credible sources',
	C: 'Single source or estimate',
	D: 'No reliable evidence located'
};

// --- Layers ----------------------------------------------------------------

export const LAYERS: Layer[] = [
	'security',
	'political',
	'economic',
	'media',
	'judicial',
	'civil',
	'foreign'
];

export const LAYER_LABEL: Record<Layer, string> = {
	security: 'Security',
	political: 'Political',
	economic: 'Economic',
	media: 'Media',
	judicial: 'Judicial',
	civil: 'Civil society',
	foreign: 'Foreign & international'
};

/**
 * Layer colours resolve to design tokens, never literal hex.
 *
 * The tokens are defined in OKLCH with identical lightness and chroma so the seven
 * layers carry equal visual weight, and they re-resolve automatically when the
 * theme flips. See src/lib/design/tokens.css.
 */
export const LAYER_COLOR: Record<Layer, string> = {
	security: 'var(--layer-security)',
	political: 'var(--layer-political)',
	economic: 'var(--layer-economic)',
	media: 'var(--layer-media)',
	judicial: 'var(--layer-judicial)',
	civil: 'var(--layer-civil)',
	foreign: 'var(--layer-foreign)'
};

// --- Relationship types ----------------------------------------------------

export const REL_LABEL: Record<string, string> = {
	institutional: 'institutional tie',
	appointment: 'appointed',
	succession: 'succeeded',
	family: 'family tie',
	business: 'business tie',
	party: 'party tie',
	security: 'security link',
	funding: 'funded',
	diplomatic: 'diplomatic relationship with',
	'political-alliance': 'allied with',
	'political-conflict': 'in conflict with',
	prosecution: 'prosecuted',
	'reported-influence': 'reported influence over',
	allegation: 'claim circulates about'
};

// --- Power indices ---------------------------------------------------------

/**
 * The six indices and their default weights. They are choices, not data, so
 * the state module can read them without importing the graph that scores them.
 */
export const INDEX_KEYS = [
	'authority',
	'proximity',
	'survival',
	'brokerage',
	'reach',
	'influence'
] as const;
export type IndexKey = (typeof INDEX_KEYS)[number];

export const DEFAULT_WEIGHTS: Record<IndexKey, number> = {
	authority: 1,
	proximity: 1,
	survival: 1,
	brokerage: 1,
	reach: 1,
	influence: 1
};
