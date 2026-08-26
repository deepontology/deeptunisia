import data from '$data/index';
import { dateFormatter, format, translate, type Locale } from './i18n';
import type {
	Company,
	Confidence,
	Contract,
	Dataset,
	Declaration,
	Education,
	Era,
	EventRec,
	Hypothesis,
	Institution,
	Interval,
	Layer,
	Licence,
	Person,
	Position,
	Question,
	Relationship,
	Role,
	Source
} from '$data/index';

export type {
	Confidence,
	Era,
	EventRec,
	Institution,
	Interval,
	Layer,
	Person,
	Position,
	Relationship,
	Role,
	Source,
	Question,
	Hypothesis,
	Company,
	Contract,
	Licence,
	Declaration,
	Education
};

export const ds: Dataset = data;
export const CUTOFF = ds.meta.cutoff;
export const FLOOR = ds.meta.floor;

// --- Lookups ---------------------------------------------------------------

export const personById = new Map(ds.people.map((p) => [p.id, p]));
export const institutionById = new Map(ds.institutions.map((i) => [i.id, i]));
export const roleById = new Map(ds.roles.map((r) => [r.id, r]));
export const positionById = new Map(ds.positions.map((p) => [p.id, p]));
export const sourceById = new Map(ds.sources.map((s) => [s.id, s]));

export const positionsByHolder = groupBy(ds.positions, (p) => p.holder);
export const positionsByRole = groupBy(ds.positions, (p) => p.role);
export const relationshipsByEntity = (() => {
	const map = new Map<string, Relationship[]>();
	for (const rel of ds.relationships) {
		for (const key of [rel.from, rel.to]) {
			const list = map.get(key) ?? [];
			list.push(rel);
			map.set(key, list);
		}
	}
	return map;
})();
export const eventsByEntity = (() => {
	const map = new Map<string, EventRec[]>();
	for (const ev of ds.events) {
		for (const a of [...(ev.actors ?? []), ...(ev.institutions ?? [])]) {
			const list = map.get(a) ?? [];
			list.push(ev);
			map.set(a, list);
		}
	}
	return map;
})();

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const map = new Map<K, T[]>();
	for (const row of rows) {
		const k = key(row);
		const list = map.get(k) ?? [];
		list.push(row);
		map.set(k, list);
	}
	return map;
}

// --- Entity abstraction ----------------------------------------------------
// Selections can land on a person or an institution, so the detail panel needs
// one shape covering both.

export type EntityKind = 'person' | 'institution';

export interface EntityRef {
	kind: EntityKind;
	id: string;
	name: string;
	layers: Layer[];
}

export function resolveEntity(id: string): EntityRef | null {
	const person = personById.get(id);
	if (person) {
		return { kind: 'person', id, name: person.name_en, layers: person.layers as Layer[] };
	}
	const inst = institutionById.get(id);
	if (inst) {
		return { kind: 'institution', id, name: inst.name_en, layers: [inst.layer as Layer] };
	}
	return null;
}

export function entityName(id: string): string {
	return resolveEntity(id)?.name ?? id;
}

export const relationshipById = new Map(ds.relationships.map((r) => [r.id, r]));
export const eventById = new Map(ds.events.map((e) => [e.id, e]));
export const companyById = new Map(ds.companies.map((c) => [c.id, c]));
export const contractById = new Map(ds.contracts.map((c) => [c.id, c]));
export const licenceById = new Map(ds.licences.map((l) => [l.id, l]));
export const declarationById = new Map(ds.declarations.map((d) => [d.id, d]));
export const educationById = new Map(ds.education.map((e) => [e.id, e]));

/** The v0.0.2 record kinds a selection can land on (companies resolve as institutions). */
export const RECORD_KINDS = ['contract', 'licence', 'declaration', 'education', 'event'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/**
 * A human name for anything the Agora can hang a thread on.
 *
 * Relationships became addressable when they got their own card, which meant thread
 * targets started arriving as ids like `rel-leila-trabelsi-ben-ali-family`. Rendering
 * that raw is a small betrayal of the whole point: the reader is being asked to
 * discuss a claim, and the claim should be legible without decoding a slug.
 *
 * Falls back to the id, deliberately. A target this build does not recognise — an
 * older thread, a record since renamed — should still show *something* addressable
 * rather than an empty chip, and the id is at least a thing you can search for.
 */
export function targetName(type: string, id: string): string {
	if (type === 'relationship') {
		const rel = relationshipById.get(id);
		if (rel) return `${entityName(rel.from)} → ${entityName(rel.to)}`;
		return id;
	}
	return entityName(id);
}

// --- Time ------------------------------------------------------------------


export function certainlyActive(iv: Interval, t: number): boolean {
	if (t < iv.startLatest) return false;
	if (iv.endEarliest !== null && t > iv.endEarliest) return false;
	return true;
}

export function possiblyActive(iv: Interval, t: number): boolean {
	if (t < iv.startEarliest) return false;
	if (iv.endLatest !== null && t > iv.endLatest) return false;
	return true;
}

/** 0 = not active, 1 = possibly active, 2 = certainly active. */
export function activity(iv: Interval, t: number): 0 | 1 | 2 {
	if (certainlyActive(iv, t)) return 2;
	if (possiblyActive(iv, t)) return 1;
	return 0;
}

export function overlaps(iv: Interval, from: number, to: number): boolean {
	const end = iv.endLatest ?? CUTOFF;
	return iv.startEarliest <= to && end >= from;
}

export function yearOf(t: number): number {
	return new Date(t).getUTCFullYear();
}

export function eraAt(t: number): Era | null {
	return ds.eras.find((e) => t >= e.interval.startEarliest && t <= (e.interval.endLatest ?? CUTOFF)) ?? null;
}

/**
 * Dates, in the reader's language.
 *
 * `locale` is an explicit parameter rather than something read from app state, because
 * this module is pure and several callers are not components — `search.ts` builds its
 * index once at module load, where there is no reactive context to read. The reactive
 * wrappers live in `t.svelte.ts`, which is the same split `translate`/`t` already uses.
 *
 * Years render bare in every locale: a year is a number, and wrapping it in locale
 * chrome would make the Chronicle's axis labels different widths per language.
 */
export function formatDate(
	t: number,
	precision: 'day' | 'month' | 'year' = 'day',
	locale: Locale = 'en'
): string {
	const d = new Date(t);
	if (precision === 'year') return String(d.getUTCFullYear());
	if (precision === 'month') return dateFormatter(locale, { month: 'short', year: 'numeric' }).format(d);
	return dateFormatter(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/**
 * Renders an interval the way the sources actually support it, rather than
 * inventing precision. "in post by June 2018", "around 2017", "documented
 * through Dec 2025 and possibly later" are all different statements and the
 * reader should be able to tell them apart at a glance.
 */
export function describeInterval(iv: Interval, locale: Locale = 'en'): string {
	const start = describeEdge(iv.startEarliest, iv.startLatest, iv.startPrecision, iv.raw.start, locale);
	if (iv.status === 'ongoing') return format(locale, 'interval.ongoing', { start });
	if (iv.status === 'unknown') return format(locale, 'interval.unknown', { start });
	/*
	 * The one that matters most, and the easiest to lose in translation: it says the
	 * officeholding was CONFIRMED to a date, not that it ended there. `/now` splits its
	 * entire display on that distinction, so it is a whole sentence in the dictionary
	 * rather than a phrase assembled from parts.
	 */
	if (iv.status === 'last-verified') {
		return format(locale, 'interval.lastVerified', {
			start,
			date: formatDate(iv.endEarliest ?? CUTOFF, 'month', locale)
		});
	}
	const end = describeEdge(iv.endEarliest ?? CUTOFF, iv.endLatest ?? CUTOFF, iv.endPrecision, iv.raw.end, locale);
	return format(locale, 'interval.range', { start, end });
}

function describeEdge(
	earliest: number,
	latest: number,
	precision: string,
	raw: string | null,
	locale: Locale
): string {
	switch (precision) {
		case 'day':
			return formatDate(earliest, 'day', locale);
		case 'month':
			return formatDate(earliest, 'month', locale);
		case 'year':
			return formatDate(earliest, 'year', locale);
		// The three below are epistemic statements, not date formats. Each says something
		// different about what the sources support, and each is its own sentence.
		case 'approx':
			return format(locale, 'edge.approx', { year: formatDate((earliest + latest) / 2, 'year', locale) });
		case 'before':
			return format(locale, 'edge.before', { date: formatDate(latest, 'month', locale) });
		case 'after':
			return format(locale, 'edge.after', { year: formatDate(earliest, 'year', locale) });
		default:
			return raw ?? translate(locale, 'edge.unknown');
	}
}

export function durationLabel(years: number, locale: Locale = 'en'): string {
	if (years < 1) {
		// Rounds up to a whole year just below the boundary — 0.97y is 12 months, and
		// "12 mo" is not a duration anyone writes.
		const months = Math.max(1, Math.round(years * 12));
		return months >= 12
			? format(locale, 'duration.y', { y: 1 })
			: format(locale, 'duration.m', { m: months });
	}
	let y = Math.floor(years);
	let m = Math.round((years - y) * 12);
	// Same boundary one level up: 2.99y rounded the remainder to 12 and printed
	// "2y 12m". Carry it instead.
	if (m >= 12) {
		y += 1;
		m = 0;
	}
	return m > 0 ? format(locale, 'duration.ym', { y, m }) : format(locale, 'duration.y', { y });
}

// --- Epistemic basis -------------------------------------------------------
//
// The primary axis of the whole site. Not "how sure are we" but "what kind of
// claim is this", which is the more useful question and the harder one to fake.

export type Basis = 'documented' | 'reported' | 'inferred' | 'unsubstantiated';

export const BASIS_ORDER: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];

export const BASIS_LABEL: Record<Basis, string> = {
	documented: 'Documented',
	reported: 'Reported',
	inferred: 'Inferred',
	unsubstantiated: 'Unsubstantiated'
};

export const BASIS_SHORT: Record<Basis, string> = {
	documented: 'DOC',
	reported: 'REP',
	inferred: 'INF',
	unsubstantiated: 'UNS'
};

export const BASIS_DESC: Record<Basis, string> = {
	documented:
		'An official record, decree, gazette entry or primary document states this directly.',
	reported:
		'One or more credible publications report it, with attribution. Not independently checked against a primary record.',
	inferred:
		'Nobody states this directly. It is reasoned from documented structure, and carries both the reasoning and what would falsify it.',
	unsubstantiated:
		'A claim that circulates without reliable evidence. Recorded so it can be examined, never presented as evidence.'
};

/**
 * Basis colours. Unlike the layer hues these ARE a ranked ramp — green through
 * amber to red — because documented and unsubstantiated is a real ordering and the
 * colour should say so.
 */
export const BASIS_COLOR: Record<Basis, string> = {
	documented: 'var(--basis-documented)',
	reported: 'var(--basis-reported)',
	inferred: 'var(--basis-inferred)',
	unsubstantiated: 'var(--basis-unsubstantiated)'
};

export function meetsBasis(b: Basis, floor: Basis): boolean {
	return BASIS_ORDER.indexOf(b) <= BASIS_ORDER.indexOf(floor);
}

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

// --- Confidence (authoring shorthand, kept visible for auditability) --------

export const CONFIDENCE_ORDER: Confidence[] = ['A', 'B', 'C', 'D'];

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
 * layers carry equal visual weight — no layer looks more important because its hue
 * happens to be brighter — and they re-resolve automatically when the theme flips.
 * See src/lib/design/tokens.css.
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

/**
 * The critical distinction in the whole project. Documented ties, reported
 * influence and allegations must never render identically, or the visualisation
 * silently converts speculation into apparent fact.
 */
export const REL_KIND: Record<string, 'documented' | 'reported' | 'alleged'> = {
	institutional: 'documented',
	appointment: 'documented',
	succession: 'documented',
	family: 'documented',
	business: 'documented',
	party: 'documented',
	security: 'documented',
	funding: 'documented',
	diplomatic: 'documented',
	'political-alliance': 'documented',
	'political-conflict': 'documented',
	prosecution: 'documented',
	'reported-influence': 'reported',
	allegation: 'alleged'
};

export const REL_LABEL: Record<string, string> = {
	institutional: 'held office in',
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

export function relKind(type: string) {
	return REL_KIND[type] ?? 'reported';
}

// --- Slicing ---------------------------------------------------------------

export interface SliceOptions {
	t: number;
	basisFloor: Basis;
	layers: Set<Layer>;
}

export interface Slice {
	positions: Position[];
	relationships: Relationship[];
	/** Person ids active at this instant. */
	activePeople: Set<string>;
}

/**
 * The single core query. Every view is a projection of this, which is what keeps
 * the three views genuinely coordinated instead of merely adjacent.
 */
export function sliceAt({ t, basisFloor, layers }: SliceOptions): Slice {
	const positions = ds.positions.filter(
		(p) =>
			possiblyActive(p.interval, t) &&
			meetsBasis(p.basis as Basis, basisFloor) &&
			layers.has(p.layer as Layer)
	);
	const activePeople = new Set(positions.map((p) => p.holder));
	const relationships = ds.relationships.filter((r) => {
		if (!meetsBasis(r.basis as Basis, basisFloor)) return false;
		if (!possiblyActive(r.interval, t) && r.interval.raw.start !== null) return false;
		const a = resolveEntity(r.from);
		const b = resolveEntity(r.to);
		if (!a || !b) return false;
		return a.layers.some((l) => layers.has(l)) && b.layers.some((l) => layers.has(l));
	});
	return { positions, relationships, activePeople };
}

export function positionsFor(personId: string, t?: number): Position[] {
	const list = positionsByHolder.get(personId) ?? [];
	if (t === undefined) return list;
	return list.filter((p) => possiblyActive(p.interval, t));
}

/** All sources cited by a record, resolved and sorted best-tier-first. */
export function sourcesFor(ids: string[]): Source[] {
	return ids
		.map((id) => sourceById.get(id))
		.filter((s): s is Source => Boolean(s))
		.sort((a, b) => a.tier - b.tier);
}

/** Wayback lookup for a source URL. Tunisian media and JORT links rot fast. */
export function archiveLookup(source: Source): string {
	return source.archive_url ?? `https://web.archive.org/web/2026/${source.url}`;
}

