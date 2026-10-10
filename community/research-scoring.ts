/**
 * The study scoring engine.
 *
 * WHY THIS FILE EXISTS. Three callers have to agree on one formula: the build
 * validates a scoring block (scripts/research-schema.ts), the runner shows a
 * respondent their own result (index-spec.md §9), and the live results endpoint
 * aggregates submissions (index-spec.md §5 and §7). The formula lives here once.
 * Like research-contract.ts this module is dependency-free, uses no node:
 * builtins and is pure, so it runs unchanged in a Cloudflare Worker, in Node
 * during the build and in the browser.
 *
 * The scoring block is instrument content and is covered by the content hash
 * (computeInstrumentHash in research-contract.ts): the formula cannot change
 * without the hash moving. The human-readable statement is index-spec.md §3–§6.
 *
 * Every component value is a number in [0, 1] or null when it is missing.
 * Missing is not zero: a skip is not an answer. A blend decides for itself
 * whether a missing part drops out (renormalising the remaining weights) or
 * takes the whole blend with it (when the part is listed in `requires`).
 */

// ---------------------------------------------------------------------------
// The scoring block, as parsed from the instrument YAML
// ---------------------------------------------------------------------------

export interface ScoringPart {
	ref: string;
	weight: number;
	/** Score this part as `1 - value`; the grip and harm parts pull the index down. */
	invert?: boolean;
}

export interface ScoringCase {
	/** `always` or `<item> == <value>`: the show_if grammar, evaluated here. */
	when: string;
	ref: string;
}

export interface MeanComponent {
	id: string;
	kind: 'mean';
	items: string[];
	/** Items keyed in the opposite direction; each is scored `1 - v / scale_max`. */
	reverse?: string[];
	min_answered: number;
}

export interface ScaleComponent {
	id: string;
	kind: 'scale';
	item: string;
	reverse?: boolean;
}

export interface CountComponent {
	id: string;
	kind: 'count';
	item: string;
	/** Options that are not the construct (`none`); ticking only these scores zero. */
	ignore?: string[];
	saturate: number;
}

export interface BlendComponent {
	id: string;
	kind: 'blend';
	parts: ScoringPart[];
	/** Refs that must be non-null for the blend to exist at all. */
	requires?: string[];
}

export interface CasesComponent {
	id: string;
	kind: 'cases';
	cases: ScoringCase[];
}

export type ScoringComponent =
	| MeanComponent
	| ScaleComponent
	| CountComponent
	| BlendComponent
	| CasesComponent;

/**
 * The index: a blend scaled to 0–100. `requires` names the components the
 * headline cannot do without; everything else may drop out and renormalise.
 */
export interface ScoringIndex {
	id: string;
	kind: 'blend';
	scale: number;
	requires?: string[];
	parts: ScoringPart[];
}

export interface ScoringBand {
	id: string;
	min: number;
	max: number;
	label_en?: string;
	label_fr?: string;
	label_ar?: string;
	description_en?: string;
	description_fr?: string;
	description_ar?: string;
}

/**
 * Optional regional split. The region item is optional for the respondent, and
 * only these groups are ever published, each under the cell floor.
 */
export interface ScoringRegions {
	item: string;
	groups: Record<string, string[]>;
}

/**
 * The monthly series (index-spec.md §8). Responses are grouped by calendar
 * month in a fixed UTC offset, and the published index for a month is the
 * level of a local-level model filtered through that month: every past month's
 * answers count, each weighted by how much it actually tells us.
 */
export interface ScoringSeries {
	period: 'month';
	/** Minutes east of UTC that month boundaries are drawn in (Tunisia: +60, no DST). */
	utc_offset_minutes: number;
	/** SD, in index points, of how far the true level may move in one month. */
	process_sd: number;
	/** A month with fewer scored respondents carries the previous level forward. */
	min_month_n: number;
	/**
	 * The rolling window, in months, read beside the headline: every kept answer
	 * from this month and the window_months - 1 before it, counted equally.
	 */
	window_months?: number;
	/**
	 * The publication floor for the first figure: until this many valid, scored
	 * answers exist in total, only counts are published. After it, a month's own
	 * figures still need min_month_n answers in that month.
	 */
	first_figure_n?: number;
}

/**
 * Pre-registered exclusions (index-spec.md §6). They are part of the hashed
 * formula and are applied before any aggregate; the aggregation surface in this
 * module is deliberately downstream of them.
 */
export interface ScoringExclusions {
	min_completion_seconds: number;
	straightline_items: string[];
}

export interface ScoringSpec {
	id: string;
	scale_max: number;
	components: ScoringComponent[];
	index: ScoringIndex;
	plane: { x: string; y: string };
	anchors: Record<string, Record<string, number>>;
	bands: ScoringBand[];
	regions?: ScoringRegions;
	cell_floor: number;
	series?: ScoringSeries;
	exclusions?: ScoringExclusions;
	/** Scale items published as distributions alongside the index, never scored. */
	report_items?: string[];
}

// ---------------------------------------------------------------------------
// Conditions — the show_if grammar, shared with the submission validator
// ---------------------------------------------------------------------------

interface Condition {
	/** Null for `always`. */
	item: string | null;
	value: string | null;
}

const CONDITION_PATTERN = /^([a-z0-9_]+)\s*==\s*([a-z0-9_]+)$/;

/** Parse without throwing, so validateScoringSpec can report what the engine rejects. */
function parseCondition(expr: string): Condition | null {
	const trimmed = expr.trim();
	if (trimmed === 'always') return { item: null, value: null };
	const match = CONDITION_PATTERN.exec(trimmed);
	if (match === null) return null;
	return { item: match[1], value: match[2] };
}

/**
 * Evaluate a display condition against a response's answers.
 *
 * Exported because the submission validator shares the grammar: an answer to an
 * item whose condition does not hold was never shown, so it cannot be accepted.
 * The grammar is deliberately tiny; an expression outside it is a build error,
 * and guessing at its meaning would hide the mistake, so it throws.
 */
export function evaluateCondition(expr: string, answers: Record<string, unknown>): boolean {
	const condition = parseCondition(expr);
	if (condition === null) {
		throw new Error(`condition "${expr}" is not "always" or "<item> == <value>"`);
	}
	if (condition.item === null) return true;
	const answer = answers[condition.item];
	if (answer === undefined || answer === null) return false;
	if (Array.isArray(answer)) return answer.includes(condition.value);
	return answer === condition.value;
}

// ---------------------------------------------------------------------------
// Scoring one response
// ---------------------------------------------------------------------------

export interface ResponseScore {
	/** One entry per declared component, in list order; null when missing. */
	components: Record<string, number | null>;
	/** The index times `index.scale` (0–100), unrounded; null when required parts are missing. */
	index: number | null;
	band: string | null;
	plane: { x: number; y: number } | null;
}

function isScaleValue(value: unknown, scaleMax: number): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= scaleMax
	);
}

/** The band whose [min, max) contains the index; the top band's max is closed. */
function bandOf(bands: ScoringBand[], index: number): string | null {
	let top: ScoringBand | null = null;
	for (const band of bands) {
		if (index >= band.min && index < band.max) return band.id;
		if (top === null || band.max > top.max) top = band;
	}
	// 100 sits on the top band's closed edge; every other edge opens.
	return top !== null && index === top.max ? top.id : null;
}

/**
 * Score one response against one specification.
 *
 * Components may reference components declared later, so resolution is a
 * memoised walk by id. A reference cycle and an unknown id are spec bugs, not
 * data conditions, and they throw: the build's validateScoringSpec refuses both,
 * so a spec that reaches a running worker is already known to resolve.
 */
export function scoreResponse(spec: ScoringSpec, answers: Record<string, unknown>): ResponseScore {
	const byId = new Map<string, ScoringComponent>();
	for (const component of spec.components) byId.set(component.id, component);

	const memo = new Map<string, number | null>();
	const inProgress = new Set<string>();

	function resolveBlend(parts: ScoringPart[], requires: string[]): number | null {
		// A required component that is missing takes the whole blend with it; an
		// optional missing part only leaves the weighted mean and renormalises.
		for (const id of requires) {
			if (resolve(id) === null) return null;
		}
		let weighted = 0;
		let total = 0;
		for (const part of parts) {
			const value = resolve(part.ref);
			if (value === null) continue;
			weighted += part.weight * (part.invert ? 1 - value : value);
			total += part.weight;
		}
		return total === 0 ? null : weighted / total;
	}

	function evaluate(component: ScoringComponent): number | null {
		switch (component.kind) {
			case 'mean': {
				const reverse = component.reverse ?? [];
				let sum = 0;
				let answered = 0;
				for (const item of component.items) {
					const value = answers[item];
					if (!isScaleValue(value, spec.scale_max)) continue;
					const unit = value / spec.scale_max;
					sum += reverse.includes(item) ? 1 - unit : unit;
					answered++;
				}
				return answered >= component.min_answered ? sum / answered : null;
			}
			case 'scale': {
				const value = answers[component.item];
				if (!isScaleValue(value, spec.scale_max)) return null;
				const unit = value / spec.scale_max;
				return component.reverse ? 1 - unit : unit;
			}
			case 'count': {
				const value = answers[component.item];
				// An empty selection is a skip; a selection of only ignored options
				// ("none") is an answer, and it scores zero.
				if (!Array.isArray(value) || value.length === 0) return null;
				const ignore = new Set(component.ignore ?? []);
				let ticked = 0;
				for (const option of value) {
					if (typeof option === 'string' && !ignore.has(option)) ticked++;
				}
				return Math.min(1, ticked / component.saturate);
			}
			case 'blend':
				return resolveBlend(component.parts, component.requires ?? []);
			case 'cases': {
				for (const clause of component.cases) {
					if (evaluateCondition(clause.when, answers)) return resolve(clause.ref);
				}
				return null;
			}
			default:
				throw new Error(`scoring "${spec.id}": unknown component kind`);
		}
	}

	function resolve(id: string): number | null {
		if (memo.has(id)) return memo.get(id) as number | null;
		if (inProgress.has(id)) {
			throw new Error(`scoring "${spec.id}": reference cycle at component "${id}"`);
		}
		const component = byId.get(id);
		if (component === undefined) {
			throw new Error(`scoring "${spec.id}": unknown component "${id}"`);
		}
		inProgress.add(id);
		let value: number | null;
		try {
			value = evaluate(component);
		} finally {
			inProgress.delete(id);
		}
		memo.set(id, value);
		return value;
	}

	const components: Record<string, number | null> = {};
	for (const component of spec.components) components[component.id] = resolve(component.id);

	const unitIndex = resolveBlend(spec.index.parts, spec.index.requires ?? []);
	const index = unitIndex === null ? null : unitIndex * spec.index.scale;
	const band = index === null ? null : bandOf(spec.bands, index);
	const x = resolve(spec.plane.x);
	const y = resolve(spec.plane.y);

	return {
		components,
		index,
		band,
		plane: x === null || y === null ? null : { x, y }
	};
}

// ---------------------------------------------------------------------------
// Validating a specification
//
// The scoring block is the one part of the instrument that reaches the build
// without a Zod shape (research-schema.ts types it as a record of unknowns), so
// this function checks both the shape and every cross-reference, and reports
// instead of throwing: one bad reference should not hide the other nine.
// ---------------------------------------------------------------------------

export interface ScoringItemMeta {
	response: string;
	options?: string[];
}

const SCALE_RESPONSE = 'scale_0_10';
const MULTI_RESPONSE = 'multi_choice';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringList(value: unknown): string[] | null {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return null;
	return value as string[];
}

/**
 * Every way the study-002 spec could stop being scorable, as sentences.
 *
 * It is used by the build, where a violation fails the instrument, so it never
 * throws on malformed input: a missing list is a violation too. The anchors are
 * the one rule it does not check generically; the test builds the answers each
 * anchor implies and scores them against the spec.
 */
export function validateScoringSpec(
	spec: ScoringSpec,
	itemIds: Set<string>,
	items: Map<string, ScoringItemMeta>
): string[] {
	const violations: string[] = [];
	if (!isRecord(spec)) return ['scoring is not an object'];
	const root = spec as unknown as Record<string, unknown>;

	// Pass one: ids, so a forward reference is still resolvable below.
	const rawComponents = Array.isArray(root.components) ? (root.components as unknown[]) : null;
	if (rawComponents === null) violations.push('components is not a list');
	const entries = (rawComponents ?? []).filter(isRecord);
	if (rawComponents !== null && entries.length !== rawComponents.length) {
		violations.push('a component is not an object');
	}
	const byId = new Map<string, Record<string, unknown>>();
	for (const component of entries) {
		if (typeof component.id !== 'string' || component.id.length === 0) {
			violations.push('a component has no id');
			continue;
		}
		if (byId.has(component.id)) violations.push(`duplicate component id "${component.id}"`);
		byId.set(component.id, component);
	}
	const componentIds = new Set(byId.keys());

	function checkItem(owner: string, id: string, response: string): void {
		if (!itemIds.has(id)) {
			violations.push(`${owner} references unknown item "${id}"`);
			return;
		}
		const meta = items.get(id);
		if (meta !== undefined && meta.response !== response) {
			violations.push(`${owner} item "${id}" has response "${meta.response}", expected "${response}"`);
		}
	}

	function partRefs(owner: string, rawParts: unknown): string[] {
		if (!Array.isArray(rawParts)) {
			violations.push(`${owner} has no parts list`);
			return [];
		}
		const refs: string[] = [];
		for (const part of rawParts) {
			if (!isRecord(part) || typeof part.ref !== 'string' || part.ref.length === 0) {
				violations.push(`${owner} has a part without a ref`);
				continue;
			}
			refs.push(part.ref);
			if (typeof part.weight !== 'number' || !(part.weight > 0)) {
				violations.push(`${owner} part "${part.ref}" does not have a positive weight`);
			}
		}
		return refs;
	}

	function requiresRefs(owner: string, rawRequires: unknown): string[] {
		if (rawRequires === undefined) return [];
		const refs = asStringList(rawRequires);
		if (refs === null) {
			violations.push(`${owner} has a malformed requires list`);
			return [];
		}
		return refs;
	}

	function caseRefs(owner: string, rawCases: unknown): string[] {
		if (!Array.isArray(rawCases) || rawCases.length === 0) {
			violations.push(`${owner} has no cases`);
			return [];
		}
		const refs: string[] = [];
		for (const clause of rawCases) {
			if (!isRecord(clause) || typeof clause.when !== 'string' || typeof clause.ref !== 'string') {
				violations.push(`${owner} has a case without a when and a ref`);
				continue;
			}
			refs.push(clause.ref);
			const condition = parseCondition(clause.when);
			if (condition === null) {
				violations.push(`${owner} case condition "${clause.when}" is not "always" or "<item> == <value>"`);
			} else if (condition.item !== null && !itemIds.has(condition.item)) {
				violations.push(`${owner} case condition "${clause.when}" names unknown item "${condition.item}"`);
			}
		}
		return refs;
	}

	// Pass two: each component's shape and references.
	const edges = new Map<string, string[]>();
	for (const [id, component] of byId) {
		const owner = `component "${id}"`;
		const refs: string[] = [];
		switch (component.kind) {
			case 'mean': {
				const list = asStringList(component.items);
				if (list === null || list.length === 0) violations.push(`${owner} has no items list`);
				for (const item of list ?? []) checkItem(owner, item, SCALE_RESPONSE);
				if (component.reverse !== undefined && asStringList(component.reverse) === null) {
					violations.push(`${owner} has a malformed reverse list`);
				}
				if (typeof component.min_answered !== 'number') {
					violations.push(`${owner} has no numeric min_answered`);
				}
				break;
			}
			case 'scale': {
				if (typeof component.item !== 'string') violations.push(`${owner} has no item`);
				else checkItem(owner, component.item, SCALE_RESPONSE);
				break;
			}
			case 'count': {
				if (typeof component.item !== 'string') violations.push(`${owner} has no item`);
				else {
					checkItem(owner, component.item, MULTI_RESPONSE);
					const declared = new Set(items.get(component.item)?.options ?? []);
					const ignore = asStringList(component.ignore);
					if (component.ignore !== undefined && ignore === null) {
						violations.push(`${owner} has a malformed ignore list`);
					}
					for (const option of ignore ?? []) {
						if (!declared.has(option)) {
							violations.push(`${owner} ignores "${option}", which is not an option of "${component.item}"`);
						}
					}
				}
				if (typeof component.saturate !== 'number' || !(component.saturate > 0)) {
					violations.push(`${owner} has no positive saturate`);
				}
				break;
			}
			case 'blend': {
				refs.push(...partRefs(owner, component.parts));
				refs.push(...requiresRefs(owner, component.requires));
				break;
			}
			case 'cases': {
				refs.push(...caseRefs(owner, component.cases));
				break;
			}
			default:
				violations.push(`${owner} has unknown kind "${String(component.kind)}"`);
		}
		for (const ref of refs) {
			if (!componentIds.has(ref)) violations.push(`${owner} references unknown component "${ref}"`);
		}
		edges.set(id, refs.filter((ref) => componentIds.has(ref)));
	}

	// Cycles, reported once per component on the loop. Only components form
	// edges: the index may read a component, but a component cannot read the
	// index, so no cycle passes through it.
	const state = new Map<string, 'visiting' | 'done'>();
	const reported = new Set<string>();
	function visit(id: string): void {
		const current = state.get(id);
		if (current === 'done') return;
		if (current === 'visiting') {
			if (!reported.has(id)) {
				violations.push(`component "${id}" participates in a reference cycle`);
				reported.add(id);
			}
			return;
		}
		state.set(id, 'visiting');
		for (const next of edges.get(id) ?? []) visit(next);
		state.set(id, 'done');
	}
	for (const id of componentIds) visit(id);

	// The index.
	const rawIndex = root.index;
	if (!isRecord(rawIndex)) {
		violations.push('index is not an object');
	} else {
		if (rawIndex.kind !== 'blend') violations.push('index is not a blend');
		if (typeof rawIndex.scale !== 'number' || !Number.isFinite(rawIndex.scale)) {
			violations.push('index has no numeric scale');
		}
		if (typeof rawIndex.id === 'string' && componentIds.has(rawIndex.id)) {
			violations.push(`index id "${rawIndex.id}" repeats a component id`);
		}
		const indexRefs = partRefs('index', rawIndex.parts);
		indexRefs.push(...requiresRefs('index', rawIndex.requires));
		for (const ref of indexRefs) {
			if (!componentIds.has(ref)) violations.push(`index references unknown component "${ref}"`);
		}
	}

	// The plane names two components.
	const rawPlane = root.plane;
	if (!isRecord(rawPlane)) {
		violations.push('plane is not an object');
	} else {
		for (const axis of ['x', 'y'] as const) {
			const ref = rawPlane[axis];
			if (typeof ref !== 'string') violations.push(`plane.${axis} is not a component id`);
			else if (!componentIds.has(ref)) violations.push(`plane.${axis} references unknown component "${ref}"`);
		}
	}

	// The bands tile 0 to 100 exactly once.
	const rawBands = root.bands;
	if (!Array.isArray(rawBands)) {
		violations.push('bands is not a list');
	} else {
		const bands: Array<{ id: string; min: number; max: number }> = [];
		for (const band of rawBands) {
			if (!isRecord(band) || typeof band.id !== 'string' || band.id.length === 0) {
				violations.push('a band has no id');
				continue;
			}
			if (
				typeof band.min !== 'number' ||
				typeof band.max !== 'number' ||
				!Number.isFinite(band.min) ||
				!Number.isFinite(band.max)
			) {
				violations.push(`band "${band.id}" has no numeric min and max`);
				continue;
			}
			bands.push({ id: band.id, min: band.min, max: band.max });
		}
		if (bands.length === 0) {
			violations.push('bands is empty');
		} else {
			const sorted = [...bands].sort((a, b) => a.min - b.min);
			if (sorted[0].min !== 0) violations.push(`bands start at ${sorted[0].min}, not 0`);
			for (let i = 0; i < sorted.length; i++) {
				if (!(sorted[i].min < sorted[i].max)) {
					violations.push(`band "${sorted[i].id}" has min ${sorted[i].min} not below max ${sorted[i].max}`);
				}
				if (i > 0 && sorted[i].min !== sorted[i - 1].max) {
					violations.push(
						`bands "${sorted[i - 1].id}" and "${sorted[i].id}" have a gap or overlap between ${sorted[i - 1].max} and ${sorted[i].min}`
					);
				}
			}
			const last = sorted[sorted.length - 1];
			if (last.max !== 100) violations.push(`bands end at ${last.max}, not 100`);
		}
	}

	// Pre-registered exclusions: the two stored-row rules must be answerable.
	const rawExclusions = root.exclusions;
	if (rawExclusions !== undefined) {
		if (!isRecord(rawExclusions)) {
			violations.push('exclusions is not an object');
		} else {
			const seconds = rawExclusions.min_completion_seconds;
			if (typeof seconds !== 'number' || !(seconds > 0)) {
				violations.push('exclusions has no positive min_completion_seconds');
			}
			const straightline = asStringList(rawExclusions.straightline_items);
			if (straightline === null || straightline.length === 0) {
				violations.push('exclusions has no straightline_items list');
			} else {
				for (const item of straightline) checkItem('exclusions', item, SCALE_RESPONSE);
			}
		}
	}

	// Report-only items are published as 0-to-10 distributions, so they must be
	// scale items, and never one the index already scores (it would be counted
	// as context and as evidence at once).
	if (root.report_items !== undefined) {
		const reported = asStringList(root.report_items);
		if (reported === null) {
			violations.push('report_items is not a list of item ids');
		} else {
			const scored = new Set<string>();
			for (const component of entries) {
				if (component.kind === 'mean') for (const item of asStringList(component.items) ?? []) scored.add(item);
				if (component.kind === 'scale' && typeof component.item === 'string') scored.add(component.item);
			}
			for (const item of reported) {
				checkItem('report_items', item, SCALE_RESPONSE);
				if (scored.has(item)) violations.push(`report_items lists "${item}", which the index scores`);
			}
		}
	}

	// Regions: every grouped option is a declared option of the region item, and
	// an option belongs to exactly one group.
	const rawRegions = root.regions;
	if (rawRegions === undefined) {
		// No regional split: nothing to check.
	} else if (!isRecord(rawRegions)) {
		violations.push('regions is not an object');
	} else {
		const regionItem = rawRegions.item;
		if (typeof regionItem !== 'string' || regionItem.length === 0) {
			violations.push('regions has no item');
		} else if (!itemIds.has(regionItem)) {
			violations.push(`regions references unknown item "${regionItem}"`);
		}
		const declared = new Set<string>(
			typeof regionItem === 'string' ? items.get(regionItem)?.options ?? [] : []
		);
		const rawGroups = rawRegions.groups;
		if (!isRecord(rawGroups)) {
			violations.push('regions.groups is not an object');
		} else {
			const placement = new Map<string, string>();
			for (const [group, rawOptions] of Object.entries(rawGroups)) {
				const options = asStringList(rawOptions);
				if (options === null) {
					violations.push(`regions group "${group}" is not a list of options`);
					continue;
				}
				for (const option of options) {
					if (!declared.has(option)) {
						violations.push(
							`regions group "${group}" contains "${option}", which is not an option of "${String(regionItem)}"`
						);
					}
					const other = placement.get(option);
					if (other !== undefined) {
						violations.push(`option "${option}" sits in both region groups "${other}" and "${group}"`);
					} else {
						placement.set(option, group);
					}
				}
			}
		}
	}

	// The monthly series: every setting is a positive number the filter can use.
	const rawSeries = root.series;
	if (rawSeries !== undefined) {
		if (!isRecord(rawSeries)) {
			violations.push('series is not an object');
		} else {
			if (rawSeries.period !== 'month') violations.push('series.period must be "month"');
			const offset = rawSeries.utc_offset_minutes;
			if (typeof offset !== 'number' || !Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
				violations.push('series.utc_offset_minutes is not a whole number of minutes within ±14 h');
			}
			if (typeof rawSeries.process_sd !== 'number' || !(rawSeries.process_sd > 0)) {
				violations.push('series.process_sd is not a positive number');
			}
			const minN = rawSeries.min_month_n;
			if (typeof minN !== 'number' || !Number.isInteger(minN) || minN < 2) {
				violations.push('series.min_month_n is not a whole number of at least 2');
			}
			const firstFigure = rawSeries.first_figure_n;
			if (
				firstFigure !== undefined &&
				(typeof firstFigure !== 'number' || !Number.isInteger(firstFigure) || firstFigure < 1)
			) {
				violations.push('series.first_figure_n is not a whole number of at least 1');
			}
			const windowMonths = rawSeries.window_months;
			if (
				windowMonths !== undefined &&
				(typeof windowMonths !== 'number' || !Number.isInteger(windowMonths) || windowMonths < 1 || windowMonths > 60)
			) {
				violations.push('series.window_months is not a whole number of months between 1 and 60');
			}
		}
	}

	return violations;
}

// ---------------------------------------------------------------------------
// Aggregating a wave
// ---------------------------------------------------------------------------

export interface AggregateRow {
	answers: Record<string, unknown>;
	/**
	 * The link the respondent arrived from, as the `?src=` code was stored;
	 * `organic` when there was none. Only ever read as a count (the link check
	 * below), never returned.
	 */
	channel?: string;
}

export interface AggregateOptions {
	seed: number;
	resamples: number;
	/**
	 * Display conditions by item id (the instrument's show_if). A respondent
	 * whose answers fail an item's condition never saw it, and is counted as
	 * not shown rather than as a skip: "skipped" means declined, not unasked.
	 */
	conditions?: Record<string, string>;
}

export interface SplitCell {
	/** Null for a suppressed cell, so its size is never revealed. */
	n: number | null;
	mean: number | null;
	suppressed: boolean;
}

export interface ComponentSummary {
	mean: number | null;
	n: number;
}

export interface ItemSummary {
	/** Scale items only: `histogram[v]` counts answers of v, for v in 0..scale_max. */
	histogram?: number[];
	/** Count items only: option id → number of respondents who selected it. */
	counts?: Record<string, number>;
	/**
	 * Respondents who answered the item: a valid scale value, or a non-empty
	 * selection. It counts people, not ticks, so on a count item it is not the
	 * sum of `counts` (a respondent may tick several). It is the denominator a
	 * per-option or per-range share is taken against.
	 */
	answered: number;
	/** Respondents who saw the item and skipped it (absent, null or an empty selection). */
	skipped: number;
	/** Respondents the item was never shown to, because its condition did not hold. */
	not_shown: number;
}

export interface WaveAggregate {
	n: number;
	n_total: number;
	index: {
		mean: number | null;
		median: number | null;
		/** Sample SD of the respondent indices; null below two respondents. */
		sd: number | null;
		ci95: [number | null, number | null];
	};
	components: Record<string, ComponentSummary>;
	bands: Record<string, number>;
	/** `plane[xBin][yBin]`, counts over (x, y) with bin = min(9, floor(v * 10)). */
	plane: number[][];
	items: Record<string, ItemSummary>;
	splits: {
		/** Present only when the spec declares an optional regional split. */
		regions?: Record<string, SplitCell>;
		contact: Record<string, SplitCell>;
	};
}

// ---------------------------------------------------------------------------
// Pre-registered exclusions (index-spec.md §6)
//
// Exclusions run before any aggregate, so every published number is over the
// same kept set. Honeypot and rate-limit refusals never reach storage, so only
// the two stored-row rules are applied here: speed and straight-lining. A row
// trips a rule on its own, and may trip both.
// ---------------------------------------------------------------------------

export interface ExcludableRow extends AggregateRow {
	/** Completion time in milliseconds; absent when the caller does not store it. */
	completionMs?: number;
}

export interface ExclusionSummary {
	/** Distinct rows excluded by at least one rule. */
	rows_excluded: number;
	/** Excluded rows per rule id; a row may count under more than one rule. */
	rules: Record<string, number>;
}

export interface ExclusionOutcome<T extends ExcludableRow> {
	kept: T[];
	exclusions: ExclusionSummary;
}


/**
 * Split stored rows into kept and excluded for the live results surface.
 *
 * The rule ids are the ones scripts/studies-aggregate.ts already uses for the
 * exported waves, so the live page and the frozen wave report the same rules.
 * The speed floor is the spec's pre-registered `min_completion_seconds`, not a
 * share of the estimated completion time.
 */
export function applyExclusions<T extends ExcludableRow>(
	spec: ScoringSpec,
	rows: T[]
): ExclusionOutcome<T> {
	const rules = spec.exclusions;
	if (rules === undefined) {
		return { kept: [...rows], exclusions: { rows_excluded: 0, rules: {} } };
	}
	const floorMs = typeof rules.min_completion_seconds === 'number' ? rules.min_completion_seconds * 1000 : Infinity;
	const straightline = Array.isArray(rules.straightline_items) ? rules.straightline_items : [];
	const counts: Record<string, number> = { speed: 0, 'straight-lining': 0 };
	const kept: T[] = [];
	let rowsExcluded = 0;
	for (const row of rows) {
		const tripped: string[] = [];
		if (typeof row.completionMs === 'number' && row.completionMs < floorMs) {
			tripped.push('speed');
		}
		const answers = straightline
			.map((id) => row.answers[id])
			.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
		// The published rule is "the same answer on every listed item": a row
		// that skips any of them is not a straight line, whatever the rest says.
		if (straightline.length > 0 && answers.length === straightline.length && new Set(answers).size === 1) {
			tripped.push('straight-lining');
		}
		if (tripped.length === 0) {
			kept.push(row);
			continue;
		}
		rowsExcluded++;
		for (const rule of tripped) counts[rule]++;
	}
	return { kept, exclusions: { rows_excluded: rowsExcluded, rules: counts } };
}

function mean(values: number[]): number {
	let sum = 0;
	for (const value of values) sum += value;
	return sum / values.length;
}

function sampleSd(values: number[]): number {
	const m = mean(values);
	let sum = 0;
	for (const value of values) sum += (value - m) ** 2;
	return Math.sqrt(sum / (values.length - 1));
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** mulberry32: a small deterministic PRNG, so a seed makes the CI reproducible. */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function bootstrapCi95(values: number[], options: AggregateOptions): [number, number] {
	const random = mulberry32(options.seed);
	const means = new Array<number>(options.resamples);
	for (let i = 0; i < options.resamples; i++) {
		let sum = 0;
		for (let j = 0; j < values.length; j++) {
			sum += values[Math.floor(random() * values.length)];
		}
		means[i] = sum / values.length;
	}
	means.sort((a, b) => a - b);
	const low = means[Math.min(means.length - 1, Math.floor(0.025 * means.length))];
	const high = means[Math.min(means.length - 1, Math.floor(0.975 * means.length))];
	return [low, high];
}

function push(buckets: Map<string, number[]>, key: string, value: number): void {
	const bucket = buckets.get(key);
	if (bucket) bucket.push(value);
	else buckets.set(key, [value]);
}

function cells(buckets: Map<string, number[]>, keys: string[], floor: number): Record<string, SplitCell> {
	const out: Record<string, SplitCell> = {};
	for (const key of keys) {
		const values = buckets.get(key) ?? [];
		out[key] =
			values.length < floor
				? { n: null, mean: null, suppressed: true }
				: { n: values.length, mean: mean(values), suppressed: false };
	}
	return out;
}

/** The item the contact split reads: the first cases component's first when item. */
function contactItemOf(spec: ScoringSpec): string | null {
	for (const component of spec.components) {
		if (component.kind !== 'cases' || component.cases.length === 0) continue;
		const condition = parseCondition(component.cases[0].when);
		return condition === null ? null : condition.item;
	}
	return null;
}

/**
 * Aggregate a wave for the live results endpoint (index-spec.md §7).
 *
 * The per-respondent work is scoreResponse, so the results page and the
 * respondent's own result cannot disagree. The CI is a percentile bootstrap
 * with a seeded PRNG: identical rows, seed and resample count return identical
 * numbers, which is what lets the endpoint cache or recompute freely.
 *
 * Suppression is a floor, not a footnote: a cell below `cell_floor` reports
 * nulls and a flag, and never its n.
 */
export function aggregateResponses(
	spec: ScoringSpec,
	rows: AggregateRow[],
	options: AggregateOptions
): WaveAggregate {
	const scored = rows.map((row) => scoreResponse(spec, row.answers));
	const indices = scored
		.map((score) => score.index)
		.filter((value): value is number => value !== null);

	// The plane axes plus every part of the index: the components the headline
	// is read against (index-spec.md §5).
	const declared = new Set(spec.components.map((component) => component.id));
	const summaryIds: string[] = [];
	for (const id of [spec.plane.x, spec.plane.y, ...spec.index.parts.map((part) => part.ref)]) {
		if (declared.has(id) && !summaryIds.includes(id)) summaryIds.push(id);
	}
	const components: Record<string, ComponentSummary> = {};
	for (const id of summaryIds) {
		const values = scored
			.map((score) => score.components[id])
			.filter((value): value is number => typeof value === 'number');
		components[id] = { mean: values.length ? mean(values) : null, n: values.length };
	}

	const bands: Record<string, number> = {};
	for (const band of spec.bands) bands[band.id] = 0;
	for (const score of scored) {
		if (score.band === null) continue;
		bands[score.band] = (bands[score.band] ?? 0) + 1;
	}

	const plane: number[][] = Array.from({ length: 10 }, () => new Array<number>(10).fill(0));
	for (const score of scored) {
		if (score.plane === null) continue;
		const x = Math.max(0, Math.min(9, Math.floor(score.plane.x * 10)));
		const y = Math.max(0, Math.min(9, Math.floor(score.plane.y * 10)));
		plane[x][y]++;
	}

	// Per item: the raw distribution, not the keyed one. A skip is counted, not
	// guessed at.
	const scaleItems = new Set<string>();
	const countItems = new Set<string>();
	for (const component of spec.components) {
		if (component.kind === 'mean') for (const item of component.items) scaleItems.add(item);
		else if (component.kind === 'scale') scaleItems.add(component.item);
		else if (component.kind === 'count') countItems.add(component.item);
	}
	// Items reported for context only: distributed like any scale item, never scored.
	for (const item of spec.report_items ?? []) scaleItems.add(item);
	const conditions = options.conditions ?? {};
	const shown = (id: string, answers: Record<string, unknown>) =>
		conditions[id] === undefined || evaluateCondition(conditions[id], answers);
	const items: Record<string, ItemSummary> = {};
	for (const id of scaleItems) {
		const histogram = new Array<number>(spec.scale_max + 1).fill(0);
		let skipped = 0;
		let notShown = 0;
		for (const row of rows) {
			if (!shown(id, row.answers)) {
				notShown++;
				continue;
			}
			const value = row.answers[id];
			if (isScaleValue(value, spec.scale_max)) histogram[value]++;
			else skipped++;
		}
		items[id] = {
			histogram,
			answered: histogram.reduce((sum, count) => sum + count, 0),
			skipped,
			not_shown: notShown
		};
	}
	for (const id of countItems) {
		if (scaleItems.has(id)) continue;
		const counts: Record<string, number> = {};
		let answered = 0;
		let skipped = 0;
		let notShown = 0;
		for (const row of rows) {
			if (!shown(id, row.answers)) {
				notShown++;
				continue;
			}
			const value = row.answers[id];
			if (!Array.isArray(value) || value.length === 0) {
				skipped++;
				continue;
			}
			// One respondent who ticks several options is one answer, not several.
			answered++;
			for (const option of value) {
				if (typeof option === 'string') counts[option] = (counts[option] ?? 0) + 1;
			}
		}
		items[id] = { counts, answered, skipped, not_shown: notShown };
	}

	// Splits: contact through the item the first cases branch reads, and region
	// through the spec's grouping when it declares one. Only scored respondents
	// enter a cell; a respondent who skipped the optional region question is in
	// no region cell.
	const regionOf = new Map<string, string>();
	for (const [group, options] of Object.entries(spec.regions?.groups ?? {})) {
		for (const option of options) regionOf.set(option, group);
	}
	const contactItem = contactItemOf(spec);
	const regionBuckets = new Map<string, number[]>();
	const contactBuckets = new Map<string, number[]>();
	for (let i = 0; i < rows.length; i++) {
		const index = scored[i].index;
		if (index === null) continue;
		if (spec.regions) {
			const region = rows[i].answers[spec.regions.item];
			const group = typeof region === 'string' ? regionOf.get(region) : undefined;
			if (group !== undefined) push(regionBuckets, group, index);
		}
		if (contactItem !== null) {
			const value = rows[i].answers[contactItem];
			if (typeof value === 'string') push(contactBuckets, value, index);
		}
	}
	const ci95: [number | null, number | null] = indices.length
		? bootstrapCi95(indices, options)
		: [null, null];

	return {
		n: indices.length,
		n_total: rows.length,
		index: {
			mean: indices.length ? mean(indices) : null,
			median: indices.length ? median(indices) : null,
			sd: indices.length > 1 ? sampleSd(indices) : null,
			ci95
		},
		components,
		bands,
		plane,
		items,
		splits: {
			...(spec.regions
				? { regions: cells(regionBuckets, Object.keys(spec.regions.groups), spec.cell_floor) }
				: {}),
			contact: cells(contactBuckets, [...contactBuckets.keys()], spec.cell_floor)
		}
	};
}

// ---------------------------------------------------------------------------
// The link check
//
// An open index on a charged topic is a target, and the cheapest way to move it
// is for one group to mass-answer through a single shared link. The row records
// the `?src=` code the respondent arrived from, so a window of kept answers can
// be asked how much of it one link brought, and what the index is without it.
//
// The codes themselves are never published. A code is free text anyone can
// invent, and one handed out to a few people could point at them, so what leaves
// this module is three shares and a counterfactual figure, and no name. The
// counterfactual answers to the cell floor as well as the first-figure floor:
// it would otherwise hand a small group's own mean to anyone with the published
// window mean. Nothing here excludes a row or moves a published number: it is a
// check a reader can apply to their own judgement (index-spec.md §6).
// ---------------------------------------------------------------------------

/** The channel a respondent with no `?src=` code is stored under. */
const ORGANIC_CHANNEL = 'organic';

/**
 * The number of answers a figure needs before it may be published: the first
 * figure floor, falling back to the month floor when the spec sets none.
 */
function firstFigureN(spec: ScoringSpec): number {
	return spec.series?.first_figure_n ?? spec.series?.min_month_n ?? 0;
}

export interface LinkCheck {
	/** Share of the rows that arrived through a shared link rather than directly. */
	linked_share: number;
	/** Share of the rows from the single largest shared link; 0 when there is none. */
	largest_link_share: number;
	/**
	 * The mean index with that one link's rows taken out, computed by the same
	 * aggregate over the same rows; null when there is no link channel, when
	 * that link holds fewer scored answers than the cell floor, or when fewer
	 * than first_figure_n rows would remain to publish a figure.
	 */
	index_without_largest: number | null;
}

export function linkCheck(spec: ScoringSpec, rows: AggregateRow[], options: AggregateOptions): LinkCheck {
	const perChannel = new Map<string, number>();
	const scoredPerChannel = new Map<string, number>();
	for (const row of rows) {
		const channel = row.channel ?? ORGANIC_CHANNEL;
		if (channel === ORGANIC_CHANNEL) continue;
		perChannel.set(channel, (perChannel.get(channel) ?? 0) + 1);
		// Counted in scored answers, not rows: the counterfactual below is over
		// scored answers, so the floor is in the unit of what it removes.
		if (scoreResponse(spec, row.answers).index !== null) {
			scoredPerChannel.set(channel, (scoredPerChannel.get(channel) ?? 0) + 1);
		}
	}
	const linked = [...perChannel.values()].reduce((sum, count) => sum + count, 0);
	let largest = 0;
	let largestChannel: string | null = null;
	for (const [channel, count] of perChannel) {
		if (count > largest) {
			largest = count;
			// Held only to filter the rows below: the name is a key into this
			// local map and is never a field of the returned object.
			largestChannel = channel;
		}
	}

	// Two floors stand between this figure and a small group's own mean. The link
	// itself must be big enough to describe, at the cell floor every published
	// group answers to: a counterfactual read beside the window mean would let
	// anyone solve out the mean of the answers it removed, and one link written
	// for one person would publish that person's score. And enough answers must
	// remain to publish a figure at all, the window's own first-figure floor.
	// The first floor is answered in scored answers, the denominator the
	// published mean and its count share, so a link that carried consent-only
	// submissions through twenty rows publishes nothing from what it removed.
	let indexWithoutLargest: number | null = null;
	if (largestChannel !== null && (scoredPerChannel.get(largestChannel) ?? 0) >= (spec.cell_floor ?? 20)) {
		const without = aggregateResponses(
			spec,
			rows.filter((row) => (row.channel ?? ORGANIC_CHANNEL) !== largestChannel),
			options
		);
		indexWithoutLargest = without.n >= firstFigureN(spec) ? without.index.mean : null;
	}

	return {
		linked_share: rows.length ? linked / rows.length : 0,
		largest_link_share: rows.length ? largest / rows.length : 0,
		index_without_largest: indexWithoutLargest
	};
}

// ---------------------------------------------------------------------------
// The monthly series (index-spec.md §8)
//
// A month's own mean is noisy in proportion to how few people answered it. The
// published index is therefore the level of a local-level model: the true level
// drifts by a random step each month (SD = process_sd), and each month's mean
// is a measurement of it with variance sd² / n. A Kalman filter combines the
// two, so a month of 1,000 answers moves the index almost all the way to its
// own mean, and a month of 200 moves it part of the way, the rest carried from
// every earlier month. It filters forward only: a month's published value uses
// that month and the months before it, and never changes once the month closes.
//
// What it does not do: correct for WHO answered. A month that draws a different
// crowd moves the index as if opinion had changed. The instrument asks nothing
// about who respondents are, so there is nothing to reweight against; the page
// publishes each month's n and gain so a reader can see how much a month rests on.
// ---------------------------------------------------------------------------

/** One month's measurement: its mean and sampling variance, or none. */
export interface SeriesObservation {
	mean: number | null;
	/** Sampling variance of the mean (sd² / n); null when the month is not observed. */
	variance: number | null;
}

export interface SeriesLevel {
	/** The filtered level, clamped to the index range for display. */
	level: number | null;
	/** Variance of the filtered level. */
	variance: number | null;
	/** The weight this month's own mean received, 0..1; null when not observed. */
	gain: number | null;
}

/**
 * The local-level Kalman filter. The first observed month starts the series at
 * its own mean (a diffuse start); a month with no observation carries the level
 * forward and lets its uncertainty grow by one month of drift.
 */
export function localLevelFilter(observations: SeriesObservation[], processSd: number): SeriesLevel[] {
	const q = processSd * processSd;
	const out: SeriesLevel[] = [];
	let level: number | null = null;
	let variance: number | null = null;
	for (const obs of observations) {
		const observed = obs.mean !== null && obs.variance !== null && obs.variance >= 0;
		if (level === null || variance === null) {
			if (!observed) {
				out.push({ level: null, variance: null, gain: null });
				continue;
			}
			level = obs.mean!;
			variance = obs.variance!;
			out.push({ level: clampIndex(level), variance, gain: 1 });
			continue;
		}
		const predicted: number = variance + q;
		if (!observed) {
			variance = predicted;
			out.push({ level: clampIndex(level), variance, gain: null });
			continue;
		}
		const gain = predicted === 0 && obs.variance === 0 ? 1 : predicted / (predicted + obs.variance!);
		level = level + gain * (obs.mean! - level);
		variance = (1 - gain) * predicted;
		out.push({ level: clampIndex(level), variance, gain });
	}
	return out;
}

function clampIndex(value: number): number {
	return Math.max(0, Math.min(100, value));
}

/** "YYYY-MM" of a timestamp, with month boundaries drawn at the given UTC offset. */
export function periodOf(ms: number, utcOffsetMinutes: number): string {
	const shifted = new Date(ms + utcOffsetMinutes * 60_000);
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Every "YYYY-MM" from `first` to `last` inclusive, so an empty month still has a slot. */
export function periodsBetween(first: string, last: string): string[] {
	const out: string[] = [];
	let [year, month] = first.split('-').map(Number);
	const [lastYear, lastMonth] = last.split('-').map(Number);
	while (year < lastYear || (year === lastYear && month <= lastMonth)) {
		out.push(`${year}-${String(month).padStart(2, '0')}`);
		month++;
		if (month > 12) {
			month = 1;
			year++;
		}
	}
	return out;
}

export interface SeriesRow extends AggregateRow {
	submittedAt: number;
}

export interface MonthAggregate {
	period: string;
	/** False for the month still being collected: its figures are provisional. */
	closed: boolean;
	/** The published index for the month: the filtered level and its 95% interval. */
	index: { level: number | null; ci95: [number | null, number | null]; band: string | null; gain: number | null };
	/** The month taken on its own. */
	results: WaveAggregate;
}

export interface SeriesAggregate {
	settings: ScoringSeries;
	months: MonthAggregate[];
	/**
	 * The rolling window: every kept answer from `first` to `last` (this month)
	 * pooled and counted equally. Null when the spec sets no window_months.
	 */
	window: {
		first: string;
		last: string;
		months: number;
		results: WaveAggregate;
		/** The link check over exactly the window's rows. */
		links: LinkCheck;
	} | null;
}

/**
 * Aggregate kept rows month by month and run the filter across the months.
 * `firstPeriod` pins the start (the fielding window's first month), so a quiet
 * opening month is a visible gap rather than a silently shorter series.
 */
export function aggregateSeries(
	spec: ScoringSpec,
	rows: SeriesRow[],
	options: AggregateOptions & { now: number; firstPeriod?: string }
): SeriesAggregate | null {
	const settings = spec.series;
	if (settings === undefined) return null;
	const offset = settings.utc_offset_minutes;
	const current = periodOf(options.now, offset);
	const byPeriod = new Map<string, SeriesRow[]>();
	for (const row of rows) {
		const period = periodOf(row.submittedAt, offset);
		if (period > current) continue;
		const bucket = byPeriod.get(period);
		if (bucket) bucket.push(row);
		else byPeriod.set(period, [row]);
	}
	const seen = [...byPeriod.keys()].sort();
	const first = options.firstPeriod ?? seen[0] ?? current;
	const periods = periodsBetween(first < current ? first : current, current);

	const results = periods.map((period) => aggregateResponses(spec, byPeriod.get(period) ?? [], options));
	const filtered = localLevelFilter(
		results.map((month) =>
			month.n >= settings.min_month_n && month.index.mean !== null && month.index.sd !== null
				? { mean: month.index.mean, variance: (month.index.sd * month.index.sd) / month.n }
				: { mean: null, variance: null }
		),
		settings.process_sd
	);
	// The rolling window: this month and the window_months - 1 before it. It is
	// not clipped to the first fielding month; a young series simply has fewer
	// months inside it.
	let window: SeriesAggregate['window'] = null;
	if (typeof settings.window_months === 'number') {
		const span = settings.window_months;
		const [y, m] = current.split('-').map(Number);
		const startIndex = y * 12 + (m - 1) - (span - 1);
		const first = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, '0')}`;
		const inside = rows.filter((row) => {
			const period = periodOf(row.submittedAt, offset);
			return period >= first && period <= current;
		});
		window = {
			first,
			last: current,
			months: span,
			results: aggregateResponses(spec, inside, options),
			links: linkCheck(spec, inside, options)
		};
	}

	return {
		settings,
		window,
		months: periods.map((period, i) => {
			const { level, variance, gain } = filtered[i];
			const half = variance === null ? null : 1.96 * Math.sqrt(variance);
			return {
				period,
				closed: period < current,
				index: {
					level,
					ci95:
						level === null || half === null
							? [null, null]
							: [clampIndex(level - half), clampIndex(level + half)],
					band: level === null ? null : bandOf(spec.bands, level),
					gain
				},
				results: results[i]
			};
		})
	};
}

// ---------------------------------------------------------------------------
// The publication floor (index-spec.md §7)
//
// Every aggregate above is computed in full; this is the one place that
// decides what leaves the server. A figure computed from a handful of people
// is noise, the easiest number to push and the one most likely to be quoted,
// and a small grid can point at the people in it. So:
//
//   - below first_figure_n valid answers in total, only counts are published:
//     how many answers, per month and in all, and nothing computed from them;
//   - after it, a month's own figures need min_month_n answers in that month,
//     and the rolling window needs first_figure_n answers inside it.
//
// The filtered monthly level is published once the floor is reached, because
// a quiet month's level is the earlier months carried forward, not a figure
// from that month's few answers.
// ---------------------------------------------------------------------------

export interface PublishedMonth {
	period: string;
	closed: boolean;
	/** Valid, scored answers in the month. Always published. */
	n: number;
	index: MonthAggregate['index'];
	/** The month on its own; null below the month floor or the first-figure floor. */
	results: WaveAggregate | null;
}

export interface PublishedSeries {
	settings: ScoringSeries;
	months: PublishedMonth[];
	window: {
		first: string;
		last: string;
		months: number;
		n: number;
		results: WaveAggregate | null;
		/** The link check, published beside the figures it qualifies. */
		links: LinkCheck | null;
	} | null;
}

export interface PublicationFloor {
	/** Valid, scored answers in total. */
	n: number;
	first_figure_n: number;
	month_n: number;
	/** True once n has reached first_figure_n: figures are published. */
	reached: boolean;
}

export interface Published {
	floor: PublicationFloor;
	/** Every valid answer pooled; null until the floor is reached. */
	results: WaveAggregate | null;
	series: PublishedSeries | null;
}

const NO_LEVEL: MonthAggregate['index'] = { level: null, ci95: [null, null], band: null, gain: null };

export function applyPublicationFloor(
	spec: ScoringSpec,
	all: WaveAggregate,
	series: SeriesAggregate | null
): Published {
	const monthN = spec.series?.min_month_n ?? 0;
	const firstN = firstFigureN(spec);
	const floor: PublicationFloor = { n: all.n, first_figure_n: firstN, month_n: monthN, reached: all.n >= firstN };
	if (series === null) return { floor, results: floor.reached ? all : null, series: null };
	return {
		floor,
		results: floor.reached ? all : null,
		series: {
			settings: series.settings,
			months: series.months.map((m) => ({
				period: m.period,
				closed: m.closed,
				n: m.results.n,
				index: floor.reached ? m.index : NO_LEVEL,
				results: floor.reached && m.results.n >= monthN ? m.results : null
			})),
		window: series.window && {
			first: series.window.first,
			last: series.window.last,
			months: series.window.months,
			n: series.window.results.n,
			// The link check rides with the window's own figures: it is read
			// against that mean, so it says nothing below the floor either.
			results: floor.reached && series.window.results.n >= firstN ? series.window.results : null,
			links: floor.reached && series.window.results.n >= firstN ? series.window.links : null
		}
		}
	};
}
