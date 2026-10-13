/**
 * The runtime research contract.
 *
 * WHY THIS FILE EXISTS. The build (scripts/) validates instruments with Zod, but
 * the deployed Worker must not bundle Zod and must not import from scripts/. This
 * module is the single definition of what an instrument looks like at runtime and
 * what a submission may contain, and it is dependency-free so both sides can
 * import it: `scripts/research-schema.ts` re-exports the hash, and
 * `community/research-api.ts` validates every submission against it.
 *
 * NO NODE BUILTINS. The Worker bundle cannot carry node:crypto, and the hash has
 * to be synchronous because the build computes it inside a synchronous validation
 * pass. So sha256 is implemented here directly, over the canonical projection
 * frozen in research/portal/m2-contract.md §2. The projection names its fields
 * instead of deleting them, so a future instrument key enters the hash only by a
 * deliberate edit here, and a text or response change always moves the hash.
 */
import { evaluateCondition, CHANNEL_PATTERN, type ScoringSpec } from './research-scoring.ts';

export type Locale = 'en' | 'fr' | 'ar';

export interface RuntimeText {
	en: string | null;
	fr: string | null;
	ar: string | null;
}

export interface RuntimeItem {
	id: string;
	module: string;
	tier: 'core' | 'extended' | 'optional';
	response: string;
	required: boolean;
	/** `response !== 'auto'`; a platform-recorded item is never shown. */
	displayed: boolean;
	text: RuntimeText;
	options?: string[];
	maxChars?: number;
	showIf?: string;
	/** Labelled scale endpoints per locale; the generic scale note is the fallback. */
	anchors?: Partial<Record<Locale, ScaleAnchors>>;
	/** Option code → display text, per locale. Codes are what is stored. */
	optionLabels?: Partial<Record<Locale, Record<string, string>>>;
	/** multi_choice options that cannot be combined with any other ("none"). */
	exclusive?: string[];
	/** A short explanation shown under the question, per locale. */
	help?: RuntimeText;
}

export interface ScaleAnchors {
	low: string;
	high: string;
	mid?: string;
}

export interface RuntimeModule {
	id: string;
	label: string;
	/** Translated headings; absent locales fall back to `label`. */
	labels: RuntimeText;
	/** Optional lead text shown above the module's first item. */
	intro: RuntimeText | null;
	items: string[];
	block?: string;
}

export interface RuntimeMaxDiffSet {
	id: string;
	/** Four pool item ids, in presentation order. */
	items: string[];
}

export interface RuntimeMaxDiff {
	id: string;
	instruction: RuntimeText;
	pool: string[];
	setCount: number;
	itemsPerSet: number;
	designStatus: string;
	sets: RuntimeMaxDiffSet[];
}

export interface RuntimeGap {
	id: string;
	instruction: RuntimeText;
	items: string[];
	response: string;
}

/**
 * The prefix a presence answer's key carries, and the key itself.
 *
 * An instrument's presence block re-asks items an earlier block already asked,
 * so its answers are stored under a key of their own: one `answers` map keyed
 * by item id can hold one rating per item, and the presence rating overwriting
 * the essentiality one leaves nothing to measure a gap against. The runner
 * builds the key with `gapAnswerKey`, the server accepts the same keys here,
 * and the aggregation reads them (scripts/studies-aggregate.ts).
 */
export const GAP_ANSWER_PREFIX = 'gap:';

export function gapAnswerKey(itemId: string): string {
	return `${GAP_ANSWER_PREFIX}${itemId}`;
}

/**
 * The item and response type a presence answer key refers to, or null when the
 * key is not one this instrument declares: the block's own response type is
 * what the value is checked against, not the item's.
 */
function presenceAnswer(
	instrument: RuntimeInstrument,
	key: string
): { item: RuntimeItem; response: string } | null {
	if (!key.startsWith(GAP_ANSWER_PREFIX)) return null;
	const id = key.slice(GAP_ANSWER_PREFIX.length);
	const item = instrument.items.find((i) => i.id === id);
	if (!item || !item.displayed || !instrument.gap?.items.includes(id)) return null;
	return { item, response: instrument.gap.response };
}

export interface RuntimeInstrument {
	id: string;
	study: string;
	version: string;
	hash: string;
	sourceLocale: Locale;
	locales: Locale[];
	estimatedMinutes: number;
	completionTargetMinutesMax: number;
	modules: RuntimeModule[];
	items: RuntimeItem[];
	maxdiff: RuntimeMaxDiff | null;
	gap: RuntimeGap | null;
	/**
	 * The study's scoring specification, passed through whole so the runner can
	 * show a respondent their own score with the same engine the results use
	 * (community/research-scoring.ts). Null for a study that does not score.
	 */
	scoring: ScoringSpec | null;
	experiments: Array<{
		id: string;
		factor: string;
		arms: string[];
		allocation: string;
		analysis: string;
	}>;
}

export interface StudiesRegistry {
	meta: { generated: string; count: number; schemaVersion: number };
	/** StudySchema output. Read through guards in research-api.ts. */
	studies: unknown[];
	/** Keyed `${id}@${version}`. */
	instruments: Record<string, RuntimeInstrument>;
}

// ---------------------------------------------------------------------------
// Structural input shapes
//
// `compileInstrument` takes a parsed instrument document, not a Zod value: the
// schema's output is assignable to these shapes and the API never needs Zod.
// ---------------------------------------------------------------------------

export interface MaxDiffSetDocument {
	id: string;
	items: string[];
}

export interface MaxDiffBlockDocument {
	id: string;
	items_per_set: number;
	sets: number;
	pool: string[];
	design: { status: string; sets?: MaxDiffSetDocument[] };
	instruction_en: string | null;
	text_fr: string | null;
	text_ar: string | null;
}

export interface GapBlockDocument {
	id: string;
	response: string;
	instruction_en: string | null;
	text_fr: string | null;
	text_ar: string | null;
	items: string[];
}

export interface ExperimentDocument {
	id: string;
	factor: string;
	arms: string[];
	allocation: string;
	analysis: string;
}

export interface InstrumentDocument {
	instrument: {
		id: string;
		study: string;
		version: string;
		source_locale: Locale;
		locales: Locale[];
		estimated_minutes: number;
		completion_target_minutes_max: number;
	};
	modules: Array<{
		id: string;
		label: string;
		label_fr?: string;
		label_ar?: string;
		intro_en?: string;
		intro_fr?: string;
		intro_ar?: string;
		items?: string[];
		block?: string;
	}>;
	items: Array<{
		id: string;
		module: string;
		tier: 'core' | 'extended' | 'optional';
		response: string;
		required: boolean;
		text_en: string | null;
		text_fr: string | null;
		text_ar: string | null;
		options?: string[];
		show_if?: string;
		max_chars?: number;
		anchors?: Partial<Record<Locale, ScaleAnchors>>;
		option_labels?: Partial<Record<Locale, Record<string, string>>>;
		exclusive?: string[];
		help_en?: string;
		help_fr?: string;
		help_ar?: string;
	}>;
	maxdiff_priority?: MaxDiffBlockDocument | null;
	gap_block?: GapBlockDocument | null;
	experiments?: ExperimentDocument[] | null;
	scoring?: ScoringSpec | null;
}

// ---------------------------------------------------------------------------
// sha256 — dependency-free and synchronous
//
// FIPS 180-4. This is deliberately not node:crypto (absent from the Worker
// bundle) and not crypto.subtle (async, and the build calls the hash inside a
// synchronous pass). scripts/test-research-contract.ts pins a fixture hash, so a
// change to this implementation or to the projection below fails a test rather
// than silently invalidating declared instrument hashes.
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotateRight(value: number, bits: number): number {
	return (value >>> bits) | (value << (32 - bits));
}

/** sha256 hex of the UTF-8 encoding of `input`. */
function sha256Hex(input: string): string {
	const bytes = new TextEncoder().encode(input);

	// 0x80, then zero padding, then the 64-bit big-endian bit length.
	const padded = new Uint8Array((((bytes.length + 9) + 63) >> 6) << 6);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setBigUint64(padded.length - 8, BigInt(bytes.length * 8), false);

	const state = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	]);
	const schedule = new Uint32Array(64);

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) schedule[i] = view.getUint32(offset + i * 4, false);
		for (let i = 16; i < 64; i++) {
			const s0 =
				rotateRight(schedule[i - 15], 7) ^ rotateRight(schedule[i - 15], 18) ^ (schedule[i - 15] >>> 3);
			const s1 =
				rotateRight(schedule[i - 2], 17) ^ rotateRight(schedule[i - 2], 19) ^ (schedule[i - 2] >>> 10);
			schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0;
		}

		let a = state[0];
		let b = state[1];
		let c = state[2];
		let d = state[3];
		let e = state[4];
		let f = state[5];
		let g = state[6];
		let h = state[7];

		for (let i = 0; i < 64; i++) {
			const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choose = (e & f) ^ (~e & g);
			const temp1 = (h + sum1 + choose + SHA256_K[i] + schedule[i]) >>> 0;
			const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (sum0 + majority) >>> 0;

			h = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}

		state[0] = (state[0] + a) >>> 0;
		state[1] = (state[1] + b) >>> 0;
		state[2] = (state[2] + c) >>> 0;
		state[3] = (state[3] + d) >>> 0;
		state[4] = (state[4] + e) >>> 0;
		state[5] = (state[5] + f) >>> 0;
		state[6] = (state[6] + g) >>> 0;
		state[7] = (state[7] + h) >>> 0;
	}

	let hex = '';
	for (const word of state) hex += word.toString(16).padStart(8, '0');
	return hex;
}

/** Deep key sort. Arrays keep their authored order. */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

/**
 * sha256 of the instrument's canonical projection (contract §2): what a
 * respondent was shown and how it was scored. Excluded by construction:
 * `translation`, per-item `notes`, instrument `status` and `content_hash` itself
 * — the hash cannot cover itself, and the translation report is a process
 * record, not content.
 */
export function computeInstrumentHash(doc: InstrumentDocument): string {
	const projection = {
		instrument: {
			id: doc.instrument.id,
			version: doc.instrument.version,
			source_locale: doc.instrument.source_locale,
			locales: [...doc.instrument.locales]
		},
		items: doc.items.map((item) => {
			const projected: Record<string, unknown> = {
				id: item.id,
				response: item.response,
				required: item.required,
				text_en: item.text_en,
				text_fr: item.text_fr,
				text_ar: item.text_ar
			};
			// Shown content that only some items carry. Each key enters the
			// projection only when the item declares it, so an instrument that
			// uses none of them keeps the hash it had before they existed.
			if (item.options !== undefined) projected.options = item.options;
			if (item.option_labels !== undefined) projected.option_labels = item.option_labels;
			if (item.anchors !== undefined) projected.anchors = item.anchors;
			if (item.show_if !== undefined) projected.show_if = item.show_if;
			if (item.exclusive !== undefined) projected.exclusive = item.exclusive;
			// A text answer is capped here, so the limit decides what the
			// instrument accepts rather than only how it reads.
			if (item.max_chars !== undefined) projected.max_chars = item.max_chars;
			// An explanation is shown text: it changes what a respondent reads.
			if (item.help_en !== undefined || item.help_fr !== undefined || item.help_ar !== undefined) {
				projected.help = { en: item.help_en ?? null, fr: item.help_fr ?? null, ar: item.help_ar ?? null };
			}
			return projected;
		}),
		// Module headings, intros and block assignments are shown text, and the
		// item order inside a module is the order the respondent answers them,
		// so the modules are projected whole whether or not they are translated
		// yet: an instrument that carries none of this still declares its
		// modules, and an edit to either has to move the hash.
		modules: doc.modules.map((m) => ({
			id: m.id,
			label: m.label,
			label_fr: m.label_fr ?? null,
			label_ar: m.label_ar ?? null,
			intro_en: m.intro_en ?? null,
			intro_fr: m.intro_fr ?? null,
			intro_ar: m.intro_ar ?? null,
			items: m.items ?? [],
			block: m.block ?? null
		})),
		// How a response is scored is instrument content: the formula cannot
		// change without the hash moving.
		...(doc.scoring ? { scoring: doc.scoring } : {}),
		// The MaxDiff block travels whole, generated sets included: what the
		// respondent was shown is instrument content, so the hash covers it.
		maxdiff_priority: doc.maxdiff_priority ?? null,
		gap_block: doc.gap_block ?? null,
		experiments: doc.experiments ?? []
	};
	return sha256Hex(JSON.stringify(sortKeys(projection), null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

/** Assemble the runtime instrument from a parsed document. Structural only. */
export function compileInstrument(doc: InstrumentDocument): RuntimeInstrument {
	const text = (en: string | null, fr: string | null, ar: string | null): RuntimeText => ({
		en,
		fr,
		ar
	});

	const items: RuntimeItem[] = doc.items.map((item) => {
		const compiled: RuntimeItem = {
			id: item.id,
			module: item.module,
			tier: item.tier,
			response: item.response,
			required: item.required,
			// Platform-recorded items are recorded, not shown. This flag is the
			// one the submission validator reads, so it is derived, never trusted.
			displayed: item.response !== 'auto',
			text: text(item.text_en, item.text_fr, item.text_ar)
		};
		if (item.options) compiled.options = [...item.options];
		if (item.max_chars !== undefined) compiled.maxChars = item.max_chars;
		if (item.show_if !== undefined) compiled.showIf = item.show_if;
		if (item.anchors !== undefined) compiled.anchors = structuredClone(item.anchors);
		if (item.option_labels !== undefined) compiled.optionLabels = structuredClone(item.option_labels);
		if (item.exclusive !== undefined) compiled.exclusive = [...item.exclusive];
		if (item.help_en !== undefined || item.help_fr !== undefined || item.help_ar !== undefined) {
			compiled.help = text(item.help_en ?? null, item.help_fr ?? null, item.help_ar ?? null);
		}
		return compiled;
	});

	const maxdiffDoc = doc.maxdiff_priority ?? null;
	const gapDoc = doc.gap_block ?? null;

	return {
		id: doc.instrument.id,
		study: doc.instrument.study,
		version: doc.instrument.version,
		hash: computeInstrumentHash(doc),
		sourceLocale: doc.instrument.source_locale,
		locales: [...doc.instrument.locales],
		estimatedMinutes: doc.instrument.estimated_minutes,
		completionTargetMinutesMax: doc.instrument.completion_target_minutes_max,
		modules: doc.modules.map((module) => {
			const hasIntro = module.intro_en ?? module.intro_fr ?? module.intro_ar;
			const compiled: RuntimeModule = {
				id: module.id,
				label: module.label,
				labels: text(module.label, module.label_fr ?? null, module.label_ar ?? null),
				intro: hasIntro
					? text(module.intro_en ?? null, module.intro_fr ?? null, module.intro_ar ?? null)
					: null,
				items: module.items ? [...module.items] : []
			};
			if (module.block !== undefined) compiled.block = module.block;
			return compiled;
		}),
		items,
		maxdiff: maxdiffDoc
			? {
					id: maxdiffDoc.id,
					instruction: text(maxdiffDoc.instruction_en, maxdiffDoc.text_fr, maxdiffDoc.text_ar),
					pool: [...maxdiffDoc.pool],
					setCount: maxdiffDoc.sets,
					itemsPerSet: maxdiffDoc.items_per_set,
					designStatus: maxdiffDoc.design.status,
					// A to-generate design has no sets; the compiled shape always
					// carries the array so consumers never branch on undefined.
					sets: (maxdiffDoc.design.sets ?? []).map((set) => ({ id: set.id, items: [...set.items] }))
				}
			: null,
		gap: gapDoc
			? {
					id: gapDoc.id,
					instruction: text(gapDoc.instruction_en, gapDoc.text_fr, gapDoc.text_ar),
					items: [...gapDoc.items],
					response: gapDoc.response
				}
			: null,
		experiments: (doc.experiments ?? []).map((experiment) => ({
			id: experiment.id,
			factor: experiment.factor,
			arms: [...experiment.arms],
			allocation: experiment.allocation,
			analysis: experiment.analysis
		})),
		scoring: doc.scoring ? structuredClone(doc.scoring) : null
	};
}

// ---------------------------------------------------------------------------
// Submission validation
//
// Codes are part of the answer, not a log line: the interface tells a respondent
// what to fix, and a caller can branch without parsing prose.
//
// invalid-body          payload is not a JSON object, or a field has the wrong shape
// hash-mismatch         built against a different instrument version
// locale-not-declared   locale the instrument does not administer
// bad-channel           channel outside [a-z0-9_-]{1,32}
// bad-consent-version   consent version missing or blank
// bad-timestamp         startedAt is not a finite number
// bad-completion        completionMs is not a finite number
// bad-answers           answers is not an object
// unknown-item          an answer key is not a displayed item (includes `auto`)
// missing-consent       a consent item is absent
// consent-not-given     a consent item is present but not `true`
// invalid-answer        a value fails its response type's rule
// invalid-maxdiff       the MaxDiff block is missing, malformed or incomplete
// maxdiff-not-generated the block's design has not been generated yet (refused
//                       even where SubmissionOptions allows an omitted block)
//
// Missing keys are skips, never errors; only consent has to be present. The
// presence block's answers arrive under their own `gap:` keys alongside the
// item's own, so one submission carries both ratings the protocol measures.
// ---------------------------------------------------------------------------

export type SubmissionResult =
	| {
			ok: true;
			answers: Record<string, unknown>;
			/** The validated MaxDiff choices, normalized, or null when the block does not apply. */
			maxdiff: Array<{ set: string; most: string; least: string }> | null;
	  }
	| { ok: false; code: string; error: string };

/**
 * Local-development exceptions to the submission rules.
 *
 * Every field defaults to strict, which is the only mode production uses. The
 * local server sets one of these from RESEARCH_DEV_STUDY (community/server.ts);
 * the Worker never constructs the options at all.
 */
export interface SubmissionOptions {
	/**
	 * Accept a payload that omits the MaxDiff block while the instrument's
	 * design is still `to-generate`. The runner has no block to render, so it
	 * sends none. A payload that supplies a block is refused as usual: a design
	 * that was never generated cannot be scored. Default false.
	 */
	allowMissingMaxdiff?: boolean;
}

const DEFAULT_MAX_CHARS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(code: string, error: string): SubmissionResult {
	return { ok: false, code, error };
}

/** Why a value is not acceptable for its item, or null when it is. */
function answerProblem(item: RuntimeItem, value: unknown, response = item.response): string | null {
	switch (response) {
		case 'scale_essential':
		case 'scale_present':
		case 'scale_0_10':
			if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10) {
				return 'expected an integer from 0 to 10';
			}
			return null;
		case 'agree_4':
			if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 4) {
				return 'expected an integer from 1 to 4';
			}
			return null;
		case 'single_choice': {
			const options = item.options ?? [];
			if (typeof value !== 'string' || !options.includes(value)) {
				return options.length ? `expected one of ${options.join(', ')}` : 'expected an option';
			}
			return null;
		}
		case 'multi_choice': {
			const options = item.options ?? [];
			if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && options.includes(v))) {
				return 'expected an array of declared options';
			}
			if (new Set(value).size !== value.length) return 'an option is repeated';
			// "None of these" next to an abuse is a contradiction, and the score
			// would count the abuse while the respondent also denied it.
			const exclusive = (item.exclusive ?? []).filter((o) => value.includes(o));
			if (exclusive.length && value.length > 1) {
				return `"${exclusive[0]}" cannot be combined with another option`;
			}
			return null;
		}
		case 'text_short': {
			const max = item.maxChars ?? DEFAULT_MAX_CHARS;
			if (typeof value !== 'string' || value.length > max) {
				return `expected a string of at most ${max} characters`;
			}
			return null;
		}
		default:
			return `response type "${item.response}" does not accept a submitted answer`;
	}
}

/**
 * Validate one submission against the compiled instrument (contract §2).
 *
 * Pure and total: it never throws and never touches storage. The returned
 * answers object carries only keys this function accepted. Options only widen
 * the rules for the local dev path; absent options are the strict production
 * behavior, unchanged.
 */
export function validateSubmission(
	instrument: RuntimeInstrument,
	payload: unknown,
	options?: SubmissionOptions
): SubmissionResult {
	if (!isRecord(payload)) return invalid('invalid-body', 'the submission must be a JSON object');

	if (payload.instrumentHash !== instrument.hash) {
		return invalid('hash-mismatch', 'the submission was built against a different instrument version');
	}
	const locale = payload.locale;
	if (typeof locale !== 'string' || !(instrument.locales as string[]).includes(locale)) {
		return invalid('locale-not-declared', `locale "${String(locale)}" is not declared by this instrument`);
	}
	const channel = payload.channel;
	if (typeof channel !== 'string' || !CHANNEL_PATTERN.test(channel)) {
		return invalid('bad-channel', 'channel must match [a-z0-9_-]{1,32}');
	}
	const consentVersion = payload.consentVersion;
	if (typeof consentVersion !== 'string' || consentVersion.trim().length === 0) {
		return invalid('bad-consent-version', 'consentVersion must be a non-empty string');
	}
	if (typeof payload.startedAt !== 'number' || !Number.isFinite(payload.startedAt)) {
		return invalid('bad-timestamp', 'startedAt must be a finite number');
	}
	if (typeof payload.completionMs !== 'number' || !Number.isFinite(payload.completionMs)) {
		return invalid('bad-completion', 'completionMs must be a finite number');
	}
	if (!isRecord(payload.answers)) {
		return invalid('bad-answers', 'answers must be an object keyed by item id');
	}
	const answers = payload.answers;

	const byId = new Map<string, RuntimeItem>();
	for (const item of instrument.items) byId.set(item.id, item);

	// Consent gates the submission, so it is settled before anything else is read.
	for (const item of instrument.items) {
		if (item.response !== 'consent') continue;
		if (!(item.id in answers)) return invalid('missing-consent', `consent item "${item.id}" is missing`);
		if (answers[item.id] !== true) return invalid('consent-not-given', `consent item "${item.id}" must be true`);
	}

	// A design that has not been generated is not a design to answer against.
	// The one exception is the local dev path: with allowMissingMaxdiff and no
	// maxdiff in the payload, the block does not exist for this respondent, so
	// nothing is shown and nothing is scored. A supplied block is still refused
	// for the same reason it always was: there is no generated design to check
	// it against or to score it with.
	const ungenerated = instrument.maxdiff?.designStatus === 'to-generate';
	const omitted = ungenerated && options?.allowMissingMaxdiff === true && payload.maxdiff === undefined;
	if (ungenerated && !omitted) {
		return invalid('maxdiff-not-generated', 'the MaxDiff design has not been generated for this instrument');
	}

	for (const key of Object.keys(answers)) {
		// A presence answer is a second rating of an item the respondent already
		// rated, so it keeps its own key and is checked against the presence
		// block's response type.
		const presence = presenceAnswer(instrument, key);
		if (presence) {
			const value = answers[key];
			if (value === null) continue; // an explicit skip is always allowed
			const problem = answerProblem(presence.item, value, presence.response);
			if (problem) return invalid('invalid-answer', `"${key}": ${problem}`);
			continue;
		}
		const item = byId.get(key);
		if (!item || !item.displayed) {
			return invalid('unknown-item', `"${key}" is not a displayed item on this instrument`);
		}
		if (item.response === 'consent') continue; // already verified true
		const value = answers[key];
		if (value === null) continue; // an explicit skip is always allowed
		const problem = answerProblem(item, value);
		if (problem) return invalid('invalid-answer', `"${key}": ${problem}`);
		// An item hidden by its condition was never shown, so it cannot have
		// been answered. Accepting a value would store an answer to a question
		// nobody saw, and the scoring would read it as real.
		if (item.showIf !== undefined && !evaluateCondition(item.showIf, answers)) {
			return invalid('hidden-item-answered', `"${key}" was not shown, because "${item.showIf}" does not hold`);
		}
	}

	// `omitted` is true only for an ungenerated design whose payload left the
	// block out under the local dev option; every other case still validates the
	// block here: one entry per generated set, keyed by the set's id.
	const normalizedMaxdiff: Array<{ set: string; most: string; least: string }> = [];
	if (instrument.maxdiff && !omitted) {
		const entries = payload.maxdiff;
		const block = instrument.maxdiff;
		if (!Array.isArray(entries)) {
			return invalid('invalid-maxdiff', 'this instrument has a MaxDiff block, so maxdiff must be an array');
		}
		if (entries.length !== block.sets.length) {
			return invalid('invalid-maxdiff', `maxdiff must carry exactly ${block.sets.length} entries, one per set`);
		}
		const bySetId = new Map(block.sets.map((set) => [set.id, set]));
		const seen = new Set<string>();
		for (const entry of entries) {
			if (!isRecord(entry)) return invalid('invalid-maxdiff', 'each maxdiff entry must be an object');
			const setId = entry.set;
			if (typeof setId !== 'string' || !bySetId.has(setId)) {
				return invalid('invalid-maxdiff', 'each maxdiff entry must name a set id declared by the instrument');
			}
			if (seen.has(setId)) return invalid('invalid-maxdiff', `set "${setId}" appears more than once`);
			seen.add(setId);
			const set = bySetId.get(setId)!;
			const most = entry.most;
			const least = entry.least;
			if (typeof most !== 'string' || !set.items.includes(most)) {
				return invalid('invalid-maxdiff', `set "${setId}": most must be an item in that set`);
			}
			if (typeof least !== 'string' || !set.items.includes(least)) {
				return invalid('invalid-maxdiff', `set "${setId}": least must be an item in that set`);
			}
			if (most === least) return invalid('invalid-maxdiff', `set "${setId}": most and least must differ`);
			normalizedMaxdiff.push({ set: setId, most, least });
		}
	}

	// Copy the accepted keys so a caller cannot smuggle anything else into storage.
	const accepted: Record<string, unknown> = {};
	for (const key of Object.keys(answers)) accepted[key] = answers[key];
	return { ok: true, answers: accepted, maxdiff: normalizedMaxdiff.length ? normalizedMaxdiff : null };
}
