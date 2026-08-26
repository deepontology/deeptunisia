/**
 * Compiles the YAML source files into a single validated JSON bundle, generated
 * TypeScript types, and the public data exports.
 *
 * The build is intentionally strict. It fails on a dangling reference, a missing
 * source, an unattributed low-confidence claim, an inference with no stated
 * reasoning or falsifier, or an impossible date range. A project whose entire value
 * is traceability cannot afford to discover those at runtime.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import {
	SourceSchema,
	InstitutionSchema,
	RoleSchema,
	PersonSchema,
	PositionSchema,
	RelationshipSchema,
	EventSchema,
	EraSchema,
	QuestionSchema,
	HypothesisSchema,
	AgreementSchema,
	WorldClaimSchema,
	CompanySchema,
	ContractSchema,
	LicenceSchema,
	DeclarationSchema,
	EducationSchema,
	RegionSchema,
	PlaceSchema,
	GroupLayerSchema,
	EDGE_DIRECTION,
	deriveBasis,
	reviewOverclaims,
	configureSchema,
	TRANSLATABLE_FIELDS,
	TRANSLATED_LOCALES,
	TRANSLATION_TIERS,
	NO_RAW_MACHINE,
	type Review,
	type WorldClaim,
	type Layer
} from './schema.ts';
import {
	resolveInterval,
	durationYears,
	DATASET_CUTOFF,
	DATASET_FLOOR,
	configureTime,
	type ResolvedInterval
} from './dates.ts';
import { loadParameters, type Parameters } from './parameters.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * Fixture-pipeline mode (test-pipeline.ts / mutation testing): point the build
 * at a throwaway data directory so the validators can be exercised against
 * synthetic invalid datasets without touching the real graph. When DT_DATA_DIR
 * is set, all outputs go to the fixture dirs and the doc-stat rewriting is
 * skipped — otherwise a fixture build would edit README/AGENTS/DESIGN at the
 * repo root with fixture-derived numbers. Nothing else changes: the validation
 * and derivation code paths are identical.
 */
const FIXTURE_MODE = Boolean(process.env.DT_DATA_DIR);
const DATA_DIR = process.env.DT_DATA_DIR ?? join(ROOT, 'data');
const OUT_DIR = process.env.DT_OUT_DIR ?? join(ROOT, 'src', 'generated');
const STATIC_DIR = process.env.DT_STATIC_DIR ?? join(ROOT, 'static');

// ---------------------------------------------------------------------------
// Jurisdiction parameters. Loaded first, configured into every layer, emitted
// into dataset.json meta.parameters — the schema, the date resolver and the
// index layer all read from here, so a fork retargets the framework by editing
// one file. The load throws (build fails) on a missing file or a schema
// violation: an unstated jurisdiction is not a runnable build.
// ---------------------------------------------------------------------------

const parameters: Parameters = loadParameters(join(DATA_DIR, 'parameters.yaml'));
configureTime(parameters.time);
configureSchema(parameters);

// The queue report (editorial-queue.json) is written long before the later
// mkdirs, so in fixture mode — where STATIC_DIR may not exist yet — this must
// happen up front. Idempotent in normal mode.
mkdirSync(STATIC_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Error collection: report every problem at once rather than one per run.
// ---------------------------------------------------------------------------

const errors: string[] = [];
const warnings: string[] = [];

function fail(where: string, message: string) {
	errors.push(`${where}: ${message}`);
}
function warn(where: string, message: string) {
	warnings.push(`${where}: ${message}`);
}

function loadYaml<T>(file: string, schema: z.ZodType<T>): T[] {
	const path = join(DATA_DIR, file);
	if (!existsSync(path)) {
		fail(file, 'file not found');
		return [];
	}
	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(path, 'utf8'));
	} catch (e) {
		fail(file, `YAML parse error: ${(e as Error).message}`);
		return [];
	}
	// A file of nothing but comments parses to `null`: that IS zero records, and
	// the v0.0.2 kinds are declared-but-empty by design (the schema is the feature
	// gate). A missing file still fails above; a non-list document still fails below.
	if (raw === null || raw === undefined) return [];
	if (!Array.isArray(raw)) {
		fail(file, 'expected a top-level YAML list');
		return [];
	}
	const out: T[] = [];
	raw.forEach((entry, i) => {
		const result = schema.safeParse(entry);
		if (!result.success) {
			const label =
				entry && typeof entry === 'object' && 'id' in entry
					? String((entry as { id: unknown }).id)
					: `index ${i}`;
			for (const issue of result.error.issues) {
				const p = issue.path.length ? issue.path.join('.') : '(root)';
				fail(`${file} [${label}]`, `${p} — ${issue.message}`);
			}
			return;
		}
		out.push(result.data);
	});
	return out;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const sources = loadYaml('sources.yaml', SourceSchema);
const eras = loadYaml('eras.yaml', EraSchema);
const institutions = loadYaml('institutions.yaml', InstitutionSchema);
const roles = loadYaml('roles.yaml', RoleSchema);
const people = loadYaml('people.yaml', PersonSchema);
const positions = loadYaml('positions.yaml', PositionSchema);
const relationships = loadYaml('relationships.yaml', RelationshipSchema);
const events = loadYaml('events.yaml', EventSchema);
const questions = loadYaml('questions.yaml', QuestionSchema);
const hypotheses = loadYaml('hypotheses.yaml', HypothesisSchema);
const agreements = loadYaml('agreements.yaml', AgreementSchema);

// v0.0.2 record kinds (spec §4). Empty files are valid: the schema is the feature
// gate, and no invented data enters the graph. The loaders and validators are live
// so the first real record is checked from day one.
const companies = loadYaml('companies.yaml', CompanySchema);
const contracts = loadYaml('contracts.yaml', ContractSchema);
const licences = loadYaml('licences.yaml', LicenceSchema);
const declarations = loadYaml('declarations.yaml', DeclarationSchema);
const education = loadYaml('education.yaml', EducationSchema);
const regions = loadYaml('regions.yaml', RegionSchema);
const places = loadYaml('places.yaml', PlaceSchema);
// World claims (docs/plans/world-rebuild-v2.md §2.7): the dossier's shelf —
// aggregates the measured families cannot cover, and the circulating claims
// kept per rule 6. Empty file is valid; the schema is the gate.
const worldClaims = loadYaml('world-claims.yaml', WorldClaimSchema);

// Groups are optional — a missing file means no subsection grouping.
const groupLayers: { layer: Layer; subsections: { header_en: string; header_fr?: string; header_ar?: string; membership: Record<string, unknown> }[] }[] =
	existsSync(join(DATA_DIR, 'groups.yaml'))
		? (() => {
				const doc = parseYaml(readFileSync(join(DATA_DIR, 'groups.yaml'), 'utf8'));
				if (!Array.isArray(doc)) {
					fail('groups.yaml', 'expected a top-level YAML list');
					return [];
				}
				return doc.map((entry, i) => {
					const result = GroupLayerSchema.safeParse(entry);
					if (!result.success) {
						fail('groups.yaml', `index ${i}: ${result.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(', ')}`);
						return null;
					}
					return result.data;
				}).filter(Boolean) as typeof groupLayers;
			})()
		: [];

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

function indexById<T extends { id: string }>(rows: T[], label: string): Map<string, T> {
	const map = new Map<string, T>();
	for (const row of rows) {
		if (map.has(row.id)) fail(label, `duplicate id "${row.id}"`);
		map.set(row.id, row);
	}
	return map;
}

const sourceById = indexById(sources, 'sources.yaml');
const institutionById = indexById(institutions, 'institutions.yaml');
const roleById = indexById(roles, 'roles.yaml');
const personById = indexById(people, 'people.yaml');
indexById(positions, 'positions.yaml');
const eventById = indexById(events, 'events.yaml');
const eraById = indexById(eras, 'eras.yaml');

/** Anything that can be the endpoint of a relationship. */
const entityIds = new Set<string>([
	...personById.keys(),
	...institutionById.keys(),
	...roleById.keys()
]);

// ---------------------------------------------------------------------------
// Group resolution
//
// Resolves groups.yaml rules into a per-entity group assignment. Each entity
// gets exactly one group (first matching rule wins). Unmatched entities get
// "Other".
// ---------------------------------------------------------------------------

function matchesMembership(
	rule: Record<string, unknown>,
	entityId: string,
	entityType: 'person' | 'institution',
	entityRoles: Set<string>,
	entityTypeStr: string | undefined
): boolean {
	// role check (person only)
	if (rule.role !== undefined && entityType === 'person') {
		const r = rule.role;
		const ids = Array.isArray(r) ? r : [r];
		if (ids.some((id) => entityRoles.has(id))) return true;
	}
	// role_prefix check (person only)
	if (rule.role_prefix !== undefined && entityType === 'person') {
		const pfx = rule.role_prefix;
		const prefixes = Array.isArray(pfx) ? pfx : [pfx];
		if (prefixes.some((p) => [...entityRoles].some((r) => r.startsWith(p)))) return true;
	}
	// type check (institution only)
	if (rule.type !== undefined && entityType === 'institution' && entityTypeStr) {
		const t = rule.type;
		const types = Array.isArray(t) ? t : [t];
		if (types.includes(entityTypeStr)) return true;
	}
	// members check (both)
	if (rule.members !== undefined && Array.isArray(rule.members)) {
		if ((rule.members as string[]).includes(entityId)) return true;
	}
	return false;
}

/** Resolve group membership for all entities. Returns a Map<entityId, groupHeaderEn>. */
function resolveGroups(): Map<string, string> {
	const out = new Map<string, string>();
	// Build a map of person → set of role ids they hold
	const personRoles = new Map<string, Set<string>>();
	for (const p of positions) {
		if (!personRoles.has(p.holder)) personRoles.set(p.holder, new Set());
		personRoles.get(p.holder)!.add(p.role);
	}

	for (const layer of groupLayers) {
		const layerInsts = institutions.filter((i) => i.layer === layer.layer);
		const layerPeople = people.filter((p) => (p.layers[0] as Layer) === layer.layer);

		for (const sub of layer.subsections) {
			const header = sub.header_en;
			const rule = sub.membership as Record<string, unknown>;
			// Check institutions
			for (const inst of layerInsts) {
				if (!out.has(inst.id) && matchesMembership(rule, inst.id, 'institution', new Set(), inst.type)) {
					out.set(inst.id, header);
				}
			}
			// Check people
			for (const person of layerPeople) {
				if (!out.has(person.id) && matchesMembership(rule, person.id, 'person', personRoles.get(person.id) ?? new Set(), undefined)) {
					out.set(person.id, header);
				}
			}
		}

		// Assign "Other" to unmatched entities in this layer
		for (const inst of layerInsts) {
			if (!out.has(inst.id)) out.set(inst.id, 'Other');
		}
		for (const person of layerPeople) {
			if (!out.has(person.id)) out.set(person.id, 'Other');
		}
	}

	return out;
}

const groupMap = resolveGroups();

function checkSources(where: string, ids: string[]) {
	for (const id of ids) {
		if (!sourceById.has(id)) fail(where, `unknown source "${id}"`);
	}
}

for (const inst of institutions) {
	checkSources(`institution ${inst.id}`, inst.sources);
	if (inst.parent && !institutionById.has(inst.parent)) {
		fail(`institution ${inst.id}`, `unknown parent "${inst.parent}"`);
	}
}
for (const role of roles) {
	checkSources(`role ${role.id}`, role.sources);
	if (!institutionById.has(role.institution)) {
		fail(`role ${role.id}`, `unknown institution "${role.institution}"`);
	}
}
for (const person of people) {
	checkSources(`person ${person.id}`, person.sources);
}
for (const pos of positions) {
	checkSources(`position ${pos.id}`, pos.sources);
	if (!roleById.has(pos.role)) fail(`position ${pos.id}`, `unknown role "${pos.role}"`);
	if (!personById.has(pos.holder)) fail(`position ${pos.id}`, `unknown holder "${pos.holder}"`);
	if (pos.predecessor && !personById.has(pos.predecessor)) {
		fail(`position ${pos.id}`, `unknown predecessor "${pos.predecessor}"`);
	}
	for (const d of pos.disputes) {
		if (d.source && !sourceById.has(d.source)) {
			fail(`position ${pos.id}`, `dispute cites unknown source "${d.source}"`);
		}
	}
}
for (const [i, rel] of relationships.entries()) {
	const label = rel.id ?? `${rel.from} -> ${rel.to} (#${i})`;
	checkSources(`relationship ${label}`, rel.sources);
	if (!entityIds.has(rel.from)) fail(`relationship ${label}`, `unknown "from" entity "${rel.from}"`);
	if (!entityIds.has(rel.to)) fail(`relationship ${label}`, `unknown "to" entity "${rel.to}"`);
	if (rel.from === rel.to) fail(`relationship ${label}`, 'self-referential edge');
}
for (const ev of events) {
	checkSources(`event ${ev.id}`, ev.sources);
	for (const a of ev.actors) {
		if (!personById.has(a)) fail(`event ${ev.id}`, `unknown actor "${a}"`);
	}
	for (const inst of ev.institutions) {
		if (!institutionById.has(inst)) fail(`event ${ev.id}`, `unknown institution "${inst}"`);
	}
	for (const c of ev.contested) {
		if (c.source && !sourceById.has(c.source)) {
			fail(`event ${ev.id}`, `contested framing cites unknown source "${c.source}"`);
		}
	}
	for (const d of ev.disputes) {
		if (d.source && !sourceById.has(d.source)) {
			fail(`event ${ev.id}`, `dispute cites unknown source "${d.source}"`);
		}
	}
}
for (const era of eras) checkSources(`era ${era.id}`, era.sources);
for (const h of hypotheses) {
	checkSources(`hypothesis ${h.id}`, h.sources);
	for (const f of h.evidence ?? []) {
		checkSources(`hypothesis ${h.id} evidence`, f.sources);
		if ((f.confidence === 'C' || f.confidence === 'D') && !f.attributed_to) {
			fail(`hypothesis ${h.id} evidence`, 'C/D evidence finding must name who makes the claim (V20)');
		}
	}
}
for (const q of questions) {
	for (const r of q.relates_to) {
		if (!entityIds.has(r) && !eventById.has(r) && !eraById.has(r)) {
			warn(`question ${q.id}`, `relates_to "${r}" matches no known entity`);
		}
	}
	if ((q.sources?.length ?? 0) > 0) checkSources(`question ${q.id}`, q.sources);
}
for (const ag of agreements) {
	checkSources(`agreement ${ag.id}`, ag.sources);
	for (const p of ag.parties) {
		// A body (anything that is not an alpha-2 state code) must be a graph record
		// so the world view can address it as a party; build-world.ts checks the
		// state codes against the globe's gazetteer. This is the check the comment
		// in build-world.ts's verifyGraph promises this file already made.
		if (!/^[A-Z]{2}$/.test(p) && !institutionById.has(p)) {
			fail(`agreement ${ag.id}`, `unknown party institution "${p}"`);
		}
	}
	for (const d of ag.disputes) {
		if (d.source && !sourceById.has(d.source)) {
			fail(`agreement ${ag.id}`, `dispute cites unknown source "${d.source}"`);
		}
	}
}

// ---------------------------------------------------------------------------
// v0.0.2 kinds — reference validation (spec §4). Every ref resolves to a graph
// entity or a known source; a company id must be a company-like institution.
// ---------------------------------------------------------------------------

const COMPANY_TYPES = new Set([
	'company',
	'bank',
	'state-enterprise',
	'holding',
	'media-company',
	'foundation',
	'sovereign-fund',
	'cooperative',
	'utility',
	'port-authority'
]);

for (const co of companies) {
	checkSources(`company ${co.id}`, co.sources);
	const inst = institutionById.get(co.id);
	if (!inst) {
		fail(`company ${co.id}`, `no institution "${co.id}" — the company record is keyed by institution id`);
	} else if (!COMPANY_TYPES.has(inst.type)) {
		fail(`company ${co.id}`, `institution "${co.id}" is type "${inst.type}", not a company-like type`);
	}
}
for (const c of contracts) {
	checkSources(`contract ${c.id}`, c.sources);
	if (!entityIds.has(c.institution)) fail(`contract ${c.id}`, `unknown institution "${c.institution}"`);
	if (c.winner && !entityIds.has(c.winner)) fail(`contract ${c.id}`, `unknown winner "${c.winner}"`);
	for (const l of c.losers) if (!entityIds.has(l)) fail(`contract ${c.id}`, `unknown loser "${l}"`);
	if (c.financing?.lender && !entityIds.has(c.financing.lender)) {
		fail(`contract ${c.id}`, `unknown lender "${c.financing.lender}"`);
	}
	for (const d of c.disputes) if (d.source && !sourceById.has(d.source)) {
		fail(`contract ${c.id}`, `dispute cites unknown source "${d.source}"`);
	}
}
for (const l of licences) {
	checkSources(`licence ${l.id}`, l.sources);
	if (!entityIds.has(l.holder)) fail(`licence ${l.id}`, `unknown holder "${l.holder}"`);
	if (!institutionById.has(l.issuer)) fail(`licence ${l.id}`, `unknown issuer "${l.issuer}"`);
}
for (const d of declarations) {
	checkSources(`declaration ${d.id}`, d.sources);
	if (d.declarer && !personById.has(d.declarer)) {
		fail(`declaration ${d.id}`, `unknown declarer "${d.declarer}"`);
	}
	if (d.body && !institutionById.has(d.body)) fail(`declaration ${d.id}`, `unknown body "${d.body}"`);
}
for (const e of education) {
	checkSources(`education ${e.id}`, e.sources);
	if (!personById.has(e.person)) fail(`education ${e.id}`, `unknown person "${e.person}"`);
	if (e.institution && !institutionById.has(e.institution)) {
		fail(`education ${e.id}`, `unknown institution "${e.institution}"`);
	}
}
for (const wc of worldClaims) {
	checkSources(`world claim ${wc.id}`, wc.sources);
	// null is Tunisia itself; anything else must be a real graph institution.
	if (wc.entity && !institutionById.has(wc.entity)) {
		fail(`world claim ${wc.id}`, `unknown entity "${wc.entity}"`);
	}
	for (const d of wc.disputes) {
		if (d.source && !sourceById.has(d.source)) {
			fail(`world claim ${wc.id}`, `dispute cites unknown source "${d.source}"`);
		}
	}
}

// Every person should hold a position or appear somewhere, otherwise they are an
// orphan node nobody can reach.
const peopleInPositions = new Set(positions.map((p) => p.holder));
const peopleInRelationships = new Set(relationships.flatMap((r) => [r.from, r.to]));
const peopleInEvents = new Set(events.flatMap((e) => e.actors));
for (const person of people) {
	if (
		!peopleInPositions.has(person.id) &&
		!peopleInRelationships.has(person.id) &&
		!peopleInEvents.has(person.id)
	) {
		warn(`person ${person.id}`, 'orphan: holds no position and appears in no relationship or event');
	}
}
/**
 * Sources defined but backing no claim.
 *
 * Kept rather than deleted — they are staged reading, and a source someone went to
 * the trouble of finding is worth more in the file than in a git history nobody
 * reads. But they must not be counted as evidence: a headline "307 sources" implies
 * 307 citations holding the graph up, and 21 of them hold up nothing. So the cited
 * count is tracked separately and is what the site publishes.
 *
 * Coverage: every loaded kind that carries a `sources` list — including the
 * geography kinds (regions, places), which were omitted when the check first
 * shipped and silently under-counted the cited set (P0 #5).
 */
const uncitedSources: string[] = [];

/**
 * A review note may not claim a verification the record cannot support.
 *
 * Two positions — including the sitting president's — carried the review method
 * "Checked directly against the JORT decree text" while citing no gazette source
 * at all. That is the most corrosive error available to this project. Every other
 * claim here is constrained by the schema, but `review.method` is free text, so
 * the one field that asserts a human actually verified something was the one field
 * nothing checked. A review that overstates what it verified is worse than no
 * review, because it converts an unknown into a false certainty and consumes the
 * budget that would have caught it.
 *
 * Enforced as a hard failure rather than a warning: an unverifiable verification
 * claim should stop a build the way a missing falsifier does.
 */
// The predicate lives in schema.ts so the editorial tool can warn using the same
// rule. It applies to every record type that can carry a review — this loop
// checked positions alone for two sessions, which left relationships and events
// free to claim a gazette verification they could not support. The rule was never
// about positions; it was about review notes.
for (const [kind, records] of [
	['position', positions],
	['relationship', relationships],
	['event', events],
	['company', companies],
	['contract', contracts],
	['licence', licences],
	['declaration', declarations],
	['education', education],
	['world-claim', worldClaims]
] as const) {
	for (const record of records as {
		id?: string;
		from?: string;
		to?: string;
		review?: Review;
		sources: string[];
	}[]) {
		// The method is now an enum (V23); the free-text claim of what was checked
		// lives in `note`, so the gazette-overclaim guard must read note ?? method.
		const claim = record.review?.note ?? record.review?.method;
		if (!reviewOverclaims(claim, record.sources)) continue;
		// Relationships carry no id, so name them the way a human can find them.
		const where = record.id ?? (record.from ? `${record.from} -> ${record.to}` : '(unnamed)');
		fail(
			`${kind} ${where}`,
			`review claims a gazette check ("${claim!.slice(0, 60)}…") but cites no gazette source. ` +
				`Cite the decree, or state plainly what was actually checked.`
		);
	}
}

for (const source of sources) {
	const cited =
		[...institutions, ...roles, ...people, ...positions, ...eras, ...hypotheses, ...agreements, ...worldClaims, ...companies, ...contracts, ...licences, ...declarations, ...education, ...regions, ...places].some(
			(r) => r.sources.includes(source.id)
		) ||
		relationships.some((r) => r.sources.includes(source.id)) ||
		events.some(
			(e) => e.sources.includes(source.id) || e.contested.some((c) => c.source === source.id)
		) ||
		positions.some((p) => p.disputes.some((d) => d.source === source.id)) ||
		events.some((e) => e.disputes.some((d) => d.source === source.id)) ||
		worldClaims.some((wc) => wc.disputes.some((d) => d.source === source.id));
	if (!cited) {
		uncitedSources.push(source.id);
		warn(`source ${source.id}`, 'defined but never cited');
	}
}

// ---------------------------------------------------------------------------
// Resolve intervals
// ---------------------------------------------------------------------------

function safeInterval(
	where: string,
	spec: { start?: string | null; end?: string | null },
	opts?: { allowEnvelopeTrim?: boolean }
): ResolvedInterval {
	try {
		return resolveInterval(spec, opts);
	} catch (e) {
		fail(where, (e as Error).message);
		return resolveInterval({}, opts);
	}
}

const resolvedPositions = positions.map((pos) => {
	const interval = safeInterval(
		`position ${pos.id}`,
		{ start: pos.start, end: pos.end },
		// V22: an over-wide envelope may only be trimmed when the record itself
		// records the disagreement as a dispute; otherwise the span is a failure.
		{ allowEnvelopeTrim: (pos.disputes?.length ?? 0) > 0 }
	);
	const role = roleById.get(pos.role);
	const basis = deriveBasis(pos.confidence, pos.verification, pos.basis);
	// Hard failure, not a warning. An inference with no stated reasoning is
	// indistinguishable from a guess, and the site presents inferences to readers as
	// reasoned. If that promise can be broken silently it is not a promise.
	if (basis === 'inferred' && !pos.reasoning) {
		fail(`position ${pos.id}`, 'inferred claim with no stated reasoning');
	}
	if (basis === 'inferred' && !pos.falsifiable_by) {
		fail(`position ${pos.id}`, 'inferred claim with no stated falsifier');
	}
	return {
		...pos,
		basis,
		/**
		 * True when the officeholding is accepted but the span is an estimate. The
		 * Chronicle draws these with hatched edges; keeping it separate from `basis`
		 * stops an imprecisely-dated fact from looking like speculation.
		 */
		datesInferred:
			pos.verification === 'needs-primary-source' ||
			interval.startPrecision === 'approx' ||
			interval.startPrecision === 'before' ||
			interval.startPrecision === 'unknown',
		interval,
		years: durationYears(interval),
		roleTitle: role?.title_en ?? pos.role,
		roleTitleFr: role?.title_fr,
		roleTitleAr: role?.title_ar,
		institution: role?.institution ?? '',
		authority: role?.authority ?? 0,
		layer: role ? (institutionById.get(role.institution)?.layer ?? 'political') : 'political',
		row: role?.row ?? role?.institution ?? '',
		predecessorDerived: null as string | null,
		successorDerived: null as string | null
	};
});

// --- Derive successions -----------------------------------------------------
// Successions come from the data rather than being hand-listed, so a gap or an
// overlap in a command chain surfaces instead of being papered over.

// V24: the succession thresholds are published data, not hidden code. A handover
// is a *gap* only when no one plausibly held the post for more than a year —
// shorter spans are treated as possible continuity within date uncertainty. The
// exemption keeps records whose end is simply unknown, or whose interval is still
// open, from manufacturing overlaps. These constants are emitted into the dataset
// (`successionMeta`) so every published gap/overlap count is reproducible.
const SUCCESSION_GAP_YEARS = 1;
const SUCCESSION_OVERLAP_YEARS = 1;
const SUCCESSION_EXEMPTION = 'unknown-end and open-ended intervals are excluded from overlap detection';

const byRole = new Map<string, typeof resolvedPositions>();
for (const pos of resolvedPositions) {
	const list = byRole.get(pos.role) ?? [];
	list.push(pos);
	byRole.set(pos.role, list);
}

const successionGaps: { role: string; after: string; before: string; gapYears: number }[] = [];
const successionOverlaps: { role: string; a: string; b: string; overlapYears: number }[] = [];

for (const [roleId, list] of byRole) {
	list.sort((a, b) => a.interval.startLatest - b.interval.startLatest);
	for (let i = 0; i < list.length; i++) {
		const cur = list[i];
		const prev = list[i - 1];
		const next = list[i + 1];
		if (prev && !cur.predecessor) cur.predecessorDerived = prev.holder;
		if (cur.predecessor) cur.predecessorDerived = cur.predecessor;
		if (next) cur.successorDerived = next.holder;

		if (prev) {
			const prevEnd = prev.interval.endEarliest ?? DATASET_CUTOFF;
			const gap = (cur.interval.startEarliest - prevEnd) / (365.2425 * 86_400_000);
			if (gap > SUCCESSION_GAP_YEARS) {
				successionGaps.push({
					role: roleId,
					after: prev.holder,
					before: cur.holder,
					gapYears: Math.round(gap * 10) / 10
				});
			}
			const prevLatestEnd = prev.interval.endLatest ?? DATASET_CUTOFF;
			const overlap = (prevLatestEnd - cur.interval.startLatest) / (365.2425 * 86_400_000);
			if (overlap > SUCCESSION_OVERLAP_YEARS && prev.interval.status === 'ended' && cur.interval.status !== 'unknown') {
				successionOverlaps.push({
					role: roleId,
					a: prev.holder,
					b: cur.holder,
					overlapYears: Math.round(overlap * 10) / 10
				});
			}
		}
	}
}

const resolvedRelationships = relationships.map((rel) => {
	const basis = deriveBasis(rel.confidence, rel.verification, rel.basis);
	return {
		...rel,
		// The `rel.id ?? \`rel-${i}-...\`` fallback that used to sit here derived an
		// id from the array index, so inserting one relationship renumbered every
		// later one. Ids are authored in the file now and the schema requires them.
		basis,
		// V14: the published direction semantics, so a reader and an editor see the
		// same orientation contract the validator enforces.
		direction: EDGE_DIRECTION[rel.type],
		interval: safeInterval(
			`relationship ${rel.from}->${rel.to}`,
			{ start: rel.start, end: rel.end },
			{ allowEnvelopeTrim: (rel.disputes?.length ?? 0) > 0 }
		)
	};
});

// V9 — unmoored influence (spec §10.3). An influence-family edge must be
// attached to something: at least one endpoint must hold a position or carry a
// documented edge of a formal kind (appointment, ownership, board, prosecution,
// …). An influence edge between two nodes that nothing else connects is a bare
// assertion — "X influences Y" with no evidenced route — and fails.
{
	const INFLUENCE_TYPES = new Set(['influence', 'reported-influence', 'advisory']);
	const positionsByEntity = new Map<string, number>();
	for (const p of resolvedPositions) {
		// "Holds a position" includes institutions that employ one: a party with
		// a leader recorded, a TV station with a director — that record is the
		// evidenced route the influence edge must not float without.
		positionsByEntity.set(p.holder, (positionsByEntity.get(p.holder) ?? 0) + 1);
		positionsByEntity.set(p.institution, (positionsByEntity.get(p.institution) ?? 0) + 1);
	}

	const documentedNeighbours = new Map<string, Set<string>>();
	for (const r of resolvedRelationships) {
		if (INFLUENCE_TYPES.has(r.type)) continue;
		if (r.basis !== 'documented') continue;
		documentedNeighbours.set(r.from, new Set([...(documentedNeighbours.get(r.from) ?? []), r.to]));
		documentedNeighbours.set(r.to, new Set([...(documentedNeighbours.get(r.to) ?? []), r.from]));
	}

	for (const r of resolvedRelationships) {
		if (!INFLUENCE_TYPES.has(r.type)) continue;
		const attached =
			(positionsByEntity.get(r.from) ?? 0) > 0 ||
			(positionsByEntity.get(r.to) ?? 0) > 0 ||
			(documentedNeighbours.get(r.from)?.size ?? 0) > 0 ||
			(documentedNeighbours.get(r.to)?.size ?? 0) > 0;
		if (!attached) {
			// A documented- or advisory-influence edge must be attached — it asserts
			// standing, so it fails. A reported-influence edge asserts only that
			// sources report the chain; it is kept and flagged (rule 6 — the popular
			// account is exactly what the map must show, anchored or not). Documented
			// deviation from the V9 row: fail for influence/advisory, warn for
			// reported-influence.
			const message = `${r.type} edge ${r.from} → ${r.to} is unmoored — neither endpoint has a position or a documented edge (V9)`;
			if (r.type === 'reported-influence') warn(`relationship ${r.id}`, message);
			else fail(`relationship ${r.id}`, message);
		}
	}
}

// ---------------------------------------------------------------------------
// pathAudit (UI pass W4; the paper's §10.2 item 5, first slice) — warn-only.
//
// The compiler guarantees every edge is locally valid and sourced; it does not
// guarantee that the graph they compose is narratively honest. Five locally
// valid weak edges A→B→C→D→E can present as a path of influence when every
// edge rests on inference or rumour. This audit finds the connected
// components of the weak influence subgraph — influence-family edges whose
// basis is inferred or unsubstantiated — that genuinely span more than one
// hop, and emits them as `meta.pathAudit` so the Inspector can say, for a
// selected person, "this chain rests on inferred edges" instead of letting
// the chain pass as a path.
//
// WARN-ONLY, by construction: this never gates emission. A dataset can ship
// with weak chains; the point is that the product says so where they render.
// ---------------------------------------------------------------------------
const pathAudit: { chains: { entities: string[]; edges: string[]; depth: number }[] } = (() => {
	const INFLUENCE_FAMILY = new Set(['influence', 'reported-influence', 'advisory']);
	const WEAK_BASES = new Set(['inferred', 'unsubstantiated']);
	const weakEdges = resolvedRelationships.filter(
		(r) => INFLUENCE_FAMILY.has(r.type) && WEAK_BASES.has(r.basis)
	);

	const adj = new Map<string, Set<string>>();
	for (const r of weakEdges) {
		const a = adj.get(r.from) ?? new Set<string>();
		a.add(r.to);
		adj.set(r.from, a);
		const b = adj.get(r.to) ?? new Set<string>();
		b.add(r.from);
		adj.set(r.to, b);
	}

	const seen = new Set<string>();
	const chains: { entities: string[]; edges: string[]; depth: number }[] = [];

	for (const start of adj.keys()) {
		if (seen.has(start)) continue;
		// Flood the component.
		const members: string[] = [];
		const stack = [start];
		seen.add(start);
		while (stack.length) {
			const at = stack.pop()!;
			members.push(at);
			for (const nb of adj.get(at) ?? []) {
				if (!seen.has(nb)) {
					seen.add(nb);
					stack.push(nb);
				}
			}
		}
		// Is it genuinely multi-hop? BFS depth from the first member.
		const depthMap = new Map<string, number>([[start, 0]]);
		const queue = [start];
		let maxDepth = 0;
		while (queue.length) {
			const at = queue.shift()!;
			const d = depthMap.get(at) ?? 0;
			for (const nb of adj.get(at) ?? []) {
				if (!depthMap.has(nb)) {
					depthMap.set(nb, d + 1);
					maxDepth = Math.max(maxDepth, d + 1);
					queue.push(nb);
				}
			}
		}
		if (maxDepth < 2) continue; // a star of weak edges is not a chain
		const memberSet = new Set(members);
		const edgeIds = weakEdges
			.filter((r) => memberSet.has(r.from) && memberSet.has(r.to))
			.map((r) => r.id);
		chains.push({ entities: members, edges: edgeIds, depth: maxDepth });
	}

	// Cap for emission; the count is exact, the detail is bounded for display.
	const CHAIN_CAP = 50;
	const ENTITY_CAP = 12;
	return {
		chains: chains
			.sort((a, b) => b.depth - a.depth || b.entities.length - a.entities.length)
			.slice(0, CHAIN_CAP)
			.map((c) => ({
				entities: c.entities.slice(0, ENTITY_CAP),
				edges: c.edges,
				depth: c.depth
			}))
	};
})();

// V14 — direction semantics. `directed` means from→to is the claim and reversing
// it makes a different claim; for the types whose orientation is fixed by the
// ontology (a board seat is held by a person, a prosecution is aimed at a person,
// an ownership points at an entity), the build checks the endpoints' kinds so a
// reversed edge cannot land silently. `appointment`/`succession`/`dismissal` are
// directed but endpoint-flexible in the legacy data — "appointed BY" (appointer →
// appointee) and "appointed TO" (person → body) are both legitimate uses, told
// apart by description and subtype, not by the type alone — so they carry no
// endpoint rule, only the direction in the published table.
const DIRECTION_ENDPOINTS: Record<string, { from?: 'person' | 'institution'; to?: 'person' | 'institution' }> = {
	prosecution: { from: 'institution', to: 'person' },
	board: { from: 'person' },
	ownership: { to: 'institution' },
	shareholder: { to: 'institution' },
	oversight: { from: 'institution', to: 'institution' },
	'regulatory-authority': { from: 'institution', to: 'institution' }
};

for (const rel of resolvedRelationships) {
	const rule = DIRECTION_ENDPOINTS[rel.type];
	if (!rule) continue;
	const fromPerson = personById.has(rel.from);
	const toPerson = personById.has(rel.to);
	if (rule.from === 'person' && !fromPerson) {
		fail(`relationship ${rel.id}`, `${rel.type} is directed: "from" must be a person, got "${rel.from}" (V14)`);
	}
	if (rule.from === 'institution' && fromPerson) {
		fail(`relationship ${rel.id}`, `${rel.type} is directed: "from" must be an institution, got "${rel.from}" (V14)`);
	}
	if (rule.to === 'person' && !toPerson) {
		fail(`relationship ${rel.id}`, `${rel.type} is directed: "to" must be a person, got "${rel.to}" (V14)`);
	}
	if (rule.to === 'institution' && toPerson) {
		fail(`relationship ${rel.id}`, `${rel.type} is directed: "to" must be an institution, got "${rel.to}" (V14)`);
	}
}

const resolvedEvents = events.map((ev) => ({
	...ev,
	basis: deriveBasis(ev.confidence, ev.verification, ev.basis),
	interval: safeInterval(
		`event ${ev.id}`,
		{ start: ev.date, end: ev.date_end ?? ev.date },
		{ allowEnvelopeTrim: (ev.disputes?.length ?? 0) > 0 }
	)
}));

// V16 — duplicate relationships (spec §12): the same (from,to,type,subtype) with
// overlapping intervals is a duplicate and fails, unless one of the two records
// carries `merged_into` naming the survivor (spec §13.3 — the merge escape).
// `merged_into` and `supersedes` refs must also resolve.
{
	const relById = new Map(resolvedRelationships.map((r) => [r.id, r]));
	const posById = new Map(resolvedPositions.map((p) => [p.id, p]));
	for (const r of resolvedRelationships) {
		if (r.merged_into && !relById.has(r.merged_into)) {
			fail(`relationship ${r.id}`, `merged_into names unknown relationship "${r.merged_into}" (V16)`);
		}
		if (r.supersedes && !relById.has(r.supersedes)) {
			fail(`relationship ${r.id}`, `supersedes names unknown relationship "${r.supersedes}"`);
		}
	}
	for (const p of resolvedPositions) {
		if (p.supersedes && !posById.has(p.supersedes)) {
			fail(`position ${p.id}`, `supersedes names unknown position "${p.supersedes}"`);
		}
	}
	const groups = new Map<string, typeof resolvedRelationships>();
	for (const r of resolvedRelationships) {
		const key = `${r.from}|${r.to}|${r.type}|${r.subtype ?? ''}`;
		groups.set(key, [...(groups.get(key) ?? []), r]);
	}
	for (const [key, group] of groups) {
		if (group.length < 2) continue;
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i];
				const b = group[j];
				if (a.merged_into === b.id || b.merged_into === a.id) continue;
				const aEnd = a.interval.endLatest ?? DATASET_CUTOFF;
				const bEnd = b.interval.endLatest ?? DATASET_CUTOFF;
				const overlap = a.interval.startEarliest <= bEnd && b.interval.startEarliest <= aEnd;
				if (overlap) {
					fail(
						`relationship ${a.id}`,
						`duplicate of ${b.id} (${key}) with an overlapping interval — merge one into the other (merged_into) or record the conflict (V16)`
					);
				}
			}
		}
	}
}

// Editorial queue (spec §13.1): every unreviewed claim record across ALL kinds,
// V8/V17 — the event causal graph (spec §6).
//
// `causes` and `consequences` are event-to-event edges. A cause must precede its
// consequence (V8, hard), a causal cycle is impossible in reality and fails
// (V8/Tarjan), and a rupture event that floats — linked to nothing — is a gap
// the reviewer should see (V17, warn).

// resolved-events index for the causal graph (the raw-file index at line 177 is
// for the pre-resolution ref-checks).
const causalEventById = new Map(resolvedEvents.map((ev) => [ev.id, ev]));

for (const ev of resolvedEvents) {
	for (const id of [...ev.causes, ...ev.consequences]) {
		if (!causalEventById.has(id)) {
			fail(`event ${ev.id}`, `unknown linked event "${id}" (causes/consequences must be event ids)`);
		}
	}
	for (const d of ev.disputes) {
		if (d.source && !sourceById.has(d.source)) {
			fail(`event ${ev.id}`, `dispute cites unknown source "${d.source}"`);
		}
	}
}

// V8 — temporal ordering: the cause cannot begin after the consequence is over.
for (const ev of resolvedEvents) {
	for (const causeId of ev.causes) {
		const cause = causalEventById.get(causeId);
		const consequence = ev;
		const ends = consequence.interval.endLatest ?? DATASET_CUTOFF;
		if (cause && cause.interval.startEarliest > ends) {
			if ((consequence.disputes?.length ?? 0) === 0) {
				fail(
					`event ${ev.id}`,
					`cause "${causeId}" (${cause.date}) begins after its consequence ends — reorder or record a dispute (V8)`
				);
			}
		}
	}
}

// V8 — a causal cycle is impossible: Tarjan's SCC over the cause edges.
{
	const adj = new Map<string, string[]>();
	for (const ev of resolvedEvents) adj.set(ev.id, [...ev.causes]);
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	let counter = 0;
	const cycles: string[][] = [];
	const strong = (v: string) => {
		index.set(v, counter);
		low.set(v, counter);
		counter++;
		stack.push(v);
		onStack.add(v);
		for (const w of adj.get(v) ?? []) {
			if (!causalEventById.has(w)) continue; // unknown ids already failed above
			if (!index.has(w)) {
				strong(w);
				low.set(v, Math.min(low.get(v)!, low.get(w)!));
			} else if (onStack.has(w)) {
				low.set(v, Math.min(low.get(v)!, index.get(w)!));
			}
		}
		if (low.get(v) === index.get(v)) {
			const scc: string[] = [];
			let w: string;
			do {
				w = stack.pop()!;
				onStack.delete(w);
				scc.push(w);
			} while (w !== v);
			if (scc.length > 1) cycles.push(scc);
		}
	};
	for (const ev of resolvedEvents) if (!index.has(ev.id)) strong(ev.id);
	for (const cycle of cycles) {
		fail('event-causal-graph', `causal cycle: ${cycle.join(' → ')} (V8)`);
	}
}

// V17 — a rupture that links to nothing is a flagged gap, not a failure.
for (const ev of resolvedEvents) {
	if (ev.rupture && ev.causes.length === 0 && ev.consequences.length === 0) {
		warn(`event ${ev.id}`, `rupture event is not linked into the causal graph (V17)`);
	}
}

const resolvedEras = eras.map((era) => ({
	...era,
	interval: safeInterval(`era ${era.id}`, { start: era.start, end: era.end })
}));

const resolvedAgreements = agreements.map((ag) => ({
	...ag,
	basis: deriveBasis(ag.confidence, ag.verification, ag.basis)
}));

const resolvedWorldClaims = worldClaims.map((wc) => ({
	...wc,
	basis: deriveBasis(wc.confidence, wc.verification, wc.basis)
}));

// v0.0.2 kinds: resolve their interval tokens through the same fuzzy machinery as
// every other claim, and publish the derived basis.
const resolvedCompanies = companies.map((co) => ({
	...co,
	basis: deriveBasis(co.confidence, co.verification, co.basis)
}));
const resolvedContracts = contracts.map((c) => ({
	...c,
	basis: deriveBasis(c.confidence, c.verification, c.basis),
	interval: resolveInterval({ start: c.start ?? null, end: c.end ?? null })
}));
const resolvedLicences = licences.map((l) => ({
	...l,
	basis: deriveBasis(l.confidence, l.verification, l.basis)
}));
const resolvedDeclarations = declarations.map((d) => ({
	...d,
	basis: deriveBasis(d.confidence, d.verification, d.basis)
}));
const resolvedEducation = education.map((e) => ({
	...e,
	basis: deriveBasis(e.confidence, e.verification, e.basis),
	interval: resolveInterval({ start: e.start ?? null, end: e.end ?? null })
}));

// Editorial queue (spec §13.1): every unreviewed claim record across ALL kinds,
// ordered by risk (unsubstantiated → attributed → inferred → reported →
// documented) so the reviewer sees the weakest evidence first. This is the
// "new queues" deliverable as data; the admin surface consumes it and the
// community proposal flow is the interaction layer.
{
	const riskOf = (basis: string, confidence: string): number => {
		if (basis === 'unsubstantiated') return 0;
		if (confidence === 'C' || confidence === 'D') return 1;
		if (basis === 'inferred') return 2;
		if (basis === 'reported') return 3;
		return 4;
	};
	type QueueRow = {
		kind: string;
		id: string;
		confidence: string;
		basis: string;
		risk: number;
		sources: number;
		reviewed: boolean;
		title: string;
	};
	const queue: QueueRow[] = [];
	const push = (kind: string, rows: { id: string; confidence: string; basis: string; sources: string[]; review?: unknown; title: string }[]) => {
		for (const r of rows) {
			queue.push({
				kind,
				id: r.id,
				confidence: r.confidence,
				basis: r.basis,
				risk: riskOf(r.basis, r.confidence),
				sources: r.sources.length,
				reviewed: !!r.review,
				title: r.title
			});
		}
	};
	push(
		'position',
		resolvedPositions.map((p) => ({ ...p, title: `${p.roleTitle} — ${personById.get(p.holder)?.name_en ?? p.holder}` }))
	);
	push('relationship', resolvedRelationships.map((r) => ({ ...r, title: `${r.type}: ${r.from} → ${r.to}` })));
	push('event', resolvedEvents.map((e) => ({ ...e, title: e.title_en })));
	push('contract', resolvedContracts.map((c) => ({ ...c, title: c.title_en })));
	push('licence', resolvedLicences.map((l) => ({ ...l, title: `${l.kind} — ${l.holder}` })));
	push('declaration', resolvedDeclarations.map((d) => ({ ...d, title: `${d.kind} — ${d.declarer ?? 'regime'}` })));
	push('education', resolvedEducation.map((e) => ({ ...e, title: `${e.degree_en} — ${e.person}` })));
	queue.sort((a, b) => a.risk - b.risk || b.sources - a.sources || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
	writeFileSync(join(STATIC_DIR, 'editorial-queue.json'), JSON.stringify({ generated: new Date().toISOString(), total: queue.length, reviewed: queue.filter((q) => q.reviewed).length, queue }, null, 2), 'utf8');
}

// V4/V5: a contract value is attributed — there is no "value filled from memory".
// A contract carrying `award` must either name who reports the figure or draw on
// a primary source (tier 1/2). The check runs on the derived claim like every
// other epistemic rule, so a C-grade figure with attribution but no primary
// source passes only while its attribution is present.
for (const c of resolvedContracts) {
	if (!c.award) continue;
	const primary = c.sources.some((s) => (sourceById.get(s)?.tier ?? 9) <= 2);
	if (!primary && !c.attributed_to) {
		fail(
			`contract ${c.id}`,
			'award.value must be attributed or backed by a primary source (tier ≤ 2) — numbers never float free (V4/V5)'
		);
	}
}

// V10 — the geographic hierarchy (spec §8). A place's `parent` chain must
// terminate at a region; point-class places must carry coordinates inside
// Tunisia's bounding box; coordinates and owner refs must resolve.
const regionById = new Map(regions.map((r) => [r.id, r]));
for (const p of places) {
	if (!p.parent) {
		if (p.kind !== 'quarter' && p.kind !== 'town') {
			fail(`place ${p.id}`, 'every place needs a parent region/governorate (V10)');
		}
		continue;
	}
	if (!regionById.has(p.parent)) {
		fail(`place ${p.id}`, `unknown parent region "${p.parent}" (V10)`);
		continue;
	}
	if (p.owner && !entityIds.has(p.owner)) {
		fail(`place ${p.id}`, `unknown owner "${p.owner}" (must be a graph entity)`);
	}
	if (!p.coordinates) {
		warn(`place ${p.id}`, 'no coordinates — the map cannot place it (V10)');
	}
}
// The hierarchy must be acyclic and rooted: walk every chain to its top.
for (const r of regions) {
	let node: string | undefined = r.id;
	const seen = new Set<string>();
	while (node) {
		if (seen.has(node)) {
			fail(`region ${r.id}`, `parent cycle through ${node} (V10)`);
			break;
		}
		seen.add(node);
		const parent = regionById.get(node)?.parent;
		if (parent && !regionById.has(parent)) {
			fail(`region ${r.id}`, `unknown parent "${parent}" (V10)`);
			break;
		}
		node = parent;
	}
}

const resolvedInstitutions = institutions.map((inst) => ({
	...inst,
	interval: safeInterval(`institution ${inst.id}`, inst.active),
	group: groupMap.get(inst.id) ?? 'Other',
	// Spec §9: company-like entities get a derived timeline too.
	timeline: COMPANY_TYPES.has(inst.type) ? buildTimeline(inst.id) : []
}));

/**
 * Career arc, derived from position records when nobody has authored one.
 *
 * 107 people held sourced posts but carried no trajectory, so their cards showed
 * a name and little else. The arc is not new information — it is the institutions
 * they already have sourced positions in, put in order — so deriving it adds no
 * claim the dataset did not already make. This is the same move the project makes
 * with successions: computed from the records rather than asserted alongside them.
 *
 * It is flagged as derived rather than silently merged with the authored ones. An
 * authored trajectory can say "Exile" or "2019 campaign" — phases that never
 * appear in an appointment record — and a derived one structurally cannot. Letting
 * the two render identically would quietly overstate what the second kind knows.
 */
function deriveTrajectory(held: typeof resolvedPositions): string[] {
	const ordered = [...held].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);
	const arc: string[] = [];
	for (const p of ordered) {
		const inst = institutionById.get(p.institution);
		const label = inst?.abbr ?? inst?.name_en ?? p.roleTitle;
		// Consecutive repeats are a re-appointment, not a move.
		if (label && arc[arc.length - 1] !== label) arc.push(label);
	}
	// A single institution is not an arc — it just restates the post the card
	// already lists below. Derived trajectories need at least two points to say
	// anything the rest of the panel does not.
	if (arc.length < 2) return [];
	// Long enough to show a shape, short enough to stay a chip row.
	return arc.length > 6 ? [...arc.slice(0, 3), '…', ...arc.slice(-2)] : arc;
}

// ---------------------------------------------------------------------------
// TimelineBuilder (spec §9) — a derived, never-authored timeline per entity.
//
// Every person (and company-like institution) gets a timeline computed from the
// records that touch it: positions, relationships (either end), events (as actor
// or institution), contracts, licences, education, declarations. Items are ordered
// by interval.startEarliest and each carries its own confidence, basis, disputed
// flag and a ref back to the underlying record. The build never picks a winning
// date silently (H5/V22): a disputed item keeps its fuzzy interval and is flagged,
// and the record card opens from the item.
// ---------------------------------------------------------------------------

interface TimelineItem {
	title: string;
	kind: 'position' | 'relationship' | 'event' | 'contract' | 'licence' | 'education' | 'declaration';
	confidence: string;
	basis: string;
	disputed: boolean;
	ref: { kind: string; id: string };
	interval: {
		startEarliest: number;
		startLatest: number;
		endEarliest: number | null;
		endLatest: number | null;
		startPrecision: string;
		endPrecision: string;
		status: string;
		raw: { start: string | null; end: string | null };
	};
}

function buildTimeline(entityId: string): TimelineItem[] {
	const name = (id: string): string => personById.get(id)?.name_en ?? institutionById.get(id)?.name_en ?? id;
	const items: TimelineItem[] = [];
	for (const p of resolvedPositions) {
		if (p.holder !== entityId) continue;
		items.push({
			title: `${p.roleTitle} · ${name(p.institution)}`,
			kind: 'position',
			confidence: p.confidence,
			basis: p.basis,
			disputed: p.disputes.length > 0,
			ref: { kind: 'position', id: p.id },
			interval: p.interval
		});
	}
	for (const r of resolvedRelationships) {
		const other = r.from === entityId ? r.to : r.to === entityId ? r.from : null;
		if (!other) continue;
		items.push({
			title: `${r.type} — ${name(other)}`,
			kind: 'relationship',
			confidence: r.confidence,
			basis: r.basis,
			disputed: r.disputes.length > 0,
			ref: { kind: 'relationship', id: r.id },
			interval: r.interval
		});
	}
	for (const e of resolvedEvents) {
		const touches = e.actors.includes(entityId) || e.institutions.includes(entityId);
		if (!touches) continue;
		items.push({
			title: e.title_en,
			kind: 'event',
			confidence: e.confidence,
			basis: e.basis,
			disputed: e.disputes.length > 0,
			ref: { kind: 'event', id: e.id },
			interval: e.interval
		});
	}
	for (const c of resolvedContracts) {
		const touches = c.institution === entityId || c.winner === entityId;
		if (!touches) continue;
		items.push({
			title: `${c.title_en} (${c.kind})`,
			kind: 'contract',
			confidence: c.confidence,
			basis: c.basis,
			disputed: (c.disputes?.length ?? 0) > 0,
			ref: { kind: 'contract', id: c.id },
			interval: c.interval
		});
	}
	for (const l of resolvedLicences) {
		if (l.holder !== entityId) continue;
		items.push({
			title: `${l.kind} licence — ${name(l.issuer ?? '')}`,
			kind: 'licence',
			confidence: l.confidence,
			basis: l.basis,
			disputed: (l.disputes?.length ?? 0) > 0,
			ref: { kind: 'licence', id: l.id },
			interval: safeInterval(`licence ${l.id}`, { start: l.grant, end: null })
		});
	}
	for (const e of resolvedEducation) {
		if (e.person !== entityId) continue;
		const degree = e.degree_en ?? '';
		const school = e.institution ? name(e.institution) : '';
		items.push({
			title: `${degree}${school ? ' · ' + school : ''}`,
			kind: 'education',
			confidence: e.confidence,
			basis: e.basis,
			disputed: (e.disputes?.length ?? 0) > 0,
			ref: { kind: 'education', id: e.id },
			interval: e.interval
		});
	}
	for (const d of resolvedDeclarations) {
		if (d.declarer !== entityId) continue;
		items.push({
			title: `${d.kind} (${d.date ?? '?'})`,
			kind: 'declaration',
			confidence: d.confidence,
			basis: d.basis,
			disputed: (d.disputes?.length ?? 0) > 0,
			ref: { kind: 'declaration', id: d.id },
			interval: {
				startEarliest: d.date ? new Date(d.date).getTime() : DATASET_FLOOR,
				startLatest: d.date ? new Date(d.date).getTime() : DATASET_CUTOFF,
				endEarliest: null,
				endLatest: null,
				startPrecision: 'day',
				endPrecision: 'unknown',
				status: 'unknown',
				raw: { start: d.date ?? null, end: null }
			}
		});
	}
	return items.sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);
}

const resolvedPeople = people.map((person) => {
	const held = resolvedPositions.filter((p) => p.holder === person.id);
	const institutionsTouched = [...new Set(held.map((p) => p.institution).filter(Boolean))];
	const seniorYears = held.reduce((sum, p) => sum + p.years, 0);
	const erasSpanned = resolvedEras
		.filter((era) =>
			held.some(
				(p) =>
					p.interval.startEarliest <= (era.interval.endLatest ?? DATASET_CUTOFF) &&
					(p.interval.endLatest ?? DATASET_CUTOFF) >= era.interval.startEarliest
			)
		)
		.map((e) => e.id);
	const authoredTrajectory = person.trajectory.length > 0;
	const trajectory = authoredTrajectory ? person.trajectory : deriveTrajectory(held);

	return {
		...person,
		trajectory,
		/** True when the arc was computed from positions rather than written by hand. */
		trajectoryDerived: !authoredTrajectory && trajectory.length > 0,
		basis: deriveBasis(person.confidence, person.verification, person.basis),
		birthResolved: person.birth
			? safeInterval(`person ${person.id} birth`, { start: person.birth })
			: null,
		deathResolved: person.death
			? safeInterval(`person ${person.id} death`, { start: person.death })
			: null,
		positionIds: held.map((p) => p.id),
		institutionsTouched,
		layerCount: person.layers.length,
		seniorYears: Math.round(seniorYears * 10) / 10,
		erasSpanned,
		peakAuthority: held.reduce((max, p) => Math.max(max, p.authority), 0),
		group: groupMap.get(person.id) ?? 'Other',
		timeline: buildTimeline(person.id)
	};
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (errors.length) {
	console.error(`\n  DATA VALIDATION FAILED — ${errors.length} error(s)\n`);
	for (const e of errors) console.error(`   x  ${e}`);
	console.error('');
	process.exit(1);
}

if (warnings.length) {
	console.warn(`\n  ${warnings.length} warning(s)`);
	for (const w of warnings) console.warn(`   !  ${w}`);
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

const confidenceCounts = { A: 0, B: 0, C: 0, D: 0 };
for (const p of resolvedPositions) confidenceCounts[p.confidence]++;
for (const r of resolvedRelationships) confidenceCounts[r.confidence]++;
for (const wc of resolvedWorldClaims) confidenceCounts[wc.confidence]++;

const basisCounts = { documented: 0, reported: 0, inferred: 0, unsubstantiated: 0 };
for (const p of resolvedPositions) basisCounts[p.basis]++;
for (const r of resolvedRelationships) basisCounts[r.basis]++;
for (const e of resolvedEvents) basisCounts[e.basis]++;
for (const wc of resolvedWorldClaims) basisCounts[wc.basis]++;

/**
 * Every recorded disagreement between sources, collected in one place. The point of
 * the dataset is not to arbitrate these; it is to make sure a reader can see that
 * the disagreement exists.
 */
const contradictions = [
	...resolvedPositions
		.filter((p) => p.disputes.length > 0)
		.map((p) => ({
			kind: 'position' as const,
			id: p.id,
			subject: `${p.roleTitle} — ${personById.get(p.holder)?.name_en ?? p.holder}`,
			adopted: `${p.interval.raw.start ?? '?'} → ${p.interval.raw.end ?? '?'}`,
			disputes: p.disputes
		})),
	...resolvedRelationships
		.filter((r) => r.disputes.length > 0)
		.map((r) => ({
			kind: 'relationship' as const,
			id: r.id,
			subject: `${r.from} → ${r.to}`,
			adopted: r.description,
			disputes: r.disputes
		})),
	...resolvedEvents
		.filter((e) => e.disputes.length > 0)
		.map((e) => ({
			kind: 'event' as const,
			id: e.id,
			subject: e.title_en,
			adopted: e.date,
			disputes: e.disputes
		})),
	...resolvedWorldClaims
		.filter((wc) => wc.disputes.length > 0)
		.map((wc) => ({
			kind: 'world-claim' as const,
			id: wc.id,
			subject: wc.claim,
			adopted: wc.assessment,
			disputes: wc.disputes
		}))
];

/** Human-review coverage: the honest denominator for "machines propose, humans verify". */
const reviewed =
	resolvedPositions.filter((p) => p.review).length +
	resolvedRelationships.filter((r) => r.review).length +
	resolvedEvents.filter((e) => e.review).length;
const reviewable = resolvedPositions.length + resolvedRelationships.length + resolvedEvents.length;

/**
 * Review coverage broken out by how much damage an unreviewed record could do.
 *
 * A single aggregate percentage is the wrong instrument here, because it treats
 * verifying a gazette-dated appointment as interchangeable with verifying an
 * unsubstantiated allegation about a named living person. Those are not the same
 * risk, and averaging them lets the number look identical whether review effort
 * went somewhere useful or somewhere safe.
 *
 * Buckets are ordered most-damaging first and assigned first-match, so every
 * record lands in exactly one. If the top buckets read 0, review is being spent
 * on the claims that least need it — which is exactly what this dataset showed
 * when the breakdown was first computed.
 */
const REVIEW_RISK = ['unsubstantiated', 'attributed', 'inferred', 'reported', 'documented'] as const;
type ReviewRisk = (typeof REVIEW_RISK)[number];

function reviewRiskOf(r: { basis?: string; attributed_to?: string }): ReviewRisk {
	if (r.basis === 'unsubstantiated') return 'unsubstantiated';
	if (r.attributed_to) return 'attributed';
	if (r.basis === 'inferred') return 'inferred';
	if (r.basis === 'reported') return 'reported';
	return 'documented';
}

const reviewByRisk = Object.fromEntries(
	REVIEW_RISK.map((k) => [k, { reviewed: 0, total: 0 }])
) as Record<ReviewRisk, { reviewed: number; total: number }>;

for (const rec of [
	...resolvedPositions,
	...resolvedRelationships,
	...resolvedEvents,
	...resolvedWorldClaims
] as { basis?: string; attributed_to?: string; review?: unknown }[]) {
	const bucket = reviewByRisk[reviewRiskOf(rec)];
	bucket.total++;
	if (rec.review) bucket.reviewed++;
}

/* ---------------------------------------------------------------------------
 * Translation coverage.
 *
 * Counted from the raw records rather than the resolved graph, because the question
 * is how much of what this project WROTE exists in three languages — a field that
 * gets dropped during resolution was still authored, and hiding it would flatter the
 * number.
 *
 * Reported per tier and never summed into one percentage. A single "translated"
 * figure would let tens of thousands of unreviewed words read as finished work,
 * which is precisely the overstatement the human-review statistic above exists to
 * prevent. `human` is the only column that means somebody who reads the language has
 * seen it, and today it is zero everywhere — which is the honest state and is meant
 * to be visible.
 * ------------------------------------------------------------------------- */
type Tier = (typeof TRANSLATION_TIERS)[number];

const translation = {
	fr: { total: 0, done: 0, tiers: {} as Record<Tier, number> },
	ar: { total: 0, done: 0, tiers: {} as Record<Tier, number> }
};
for (const loc of TRANSLATED_LOCALES) {
	for (const tier of TRANSLATION_TIERS) translation[loc].tiers[tier] = 0;
}

const RAW_BY_TYPE: Record<string, Record<string, unknown>[]> = {
	people: people as unknown as Record<string, unknown>[],
	institutions: institutions as unknown as Record<string, unknown>[],
	roles: roles as unknown as Record<string, unknown>[],
	events: events as unknown as Record<string, unknown>[],
	relationships: relationships as unknown as Record<string, unknown>[],
	positions: positions as unknown as Record<string, unknown>[],
	eras: eras as unknown as Record<string, unknown>[],
	questions: questions as unknown as Record<string, unknown>[],
	hypotheses: hypotheses as unknown as Record<string, unknown>[],
	agreements: agreements as unknown as Record<string, unknown>[],
	worldClaims: worldClaims as unknown as Record<string, unknown>[],
	regions: regions as unknown as Record<string, unknown>[],
	places: places as unknown as Record<string, unknown>[],
	companies: companies as unknown as Record<string, unknown>[],
	contracts: contracts as unknown as Record<string, unknown>[],
	licences: licences as unknown as Record<string, unknown>[],
	declarations: declarations as unknown as Record<string, unknown>[],
	education: education as unknown as Record<string, unknown>[],
	// Sources stay out of the authored-prose counter: `excerpt` is quoted material
	// whose machine-tier AI reading aids (i18n-spec §2.2 exception) are enforced by
	// test-i18n's dedicated excerpt block, not by the data-prose coverage figure.
};

const translationProblems: string[] = [];

for (const [type, fields] of Object.entries(TRANSLATABLE_FIELDS)) {
	const rows = RAW_BY_TYPE[type];
	if (!rows) continue;
	for (const row of rows) {
		for (const field of fields) {
			const original = row[field.name];
			// Only fields that actually carry English prose count towards the denominator.
			// Counting empty ones would make the coverage number improve by deleting text.
			const populated = Array.isArray(original)
				? original.length > 0
				: typeof original === 'string' && original.trim().length > 0;
			if (!populated) continue;

			for (const loc of TRANSLATED_LOCALES) {
				translation[loc].total++;
				const value = row[`${field.name}_${loc}`];
				const by = row[`${field.name}_${loc}_by`] as Tier | undefined;
				const has = Array.isArray(value)
					? value.length > 0
					: typeof value === 'string' && value.trim().length > 0;
				const id = String(row.id ?? '?');

				if (!has) {
					// Provenance without a translation is a bookkeeping error, and it would
					// otherwise sit in the file looking like progress.
					if (by) translationProblems.push(`${type} ${id}: ${field.name}_${loc}_by with no translation`);
					continue;
				}
				if (!by) {
					translationProblems.push(`${type} ${id}: ${field.name}_${loc} has no provenance`);
					continue;
				}
				if (by === 'machine' && NO_RAW_MACHINE.has(type)) {
					translationProblems.push(
						`${type} ${id}: ${field.name}_${loc} is unreviewed machine output, which this record type may not carry`
					);
					continue;
				}
				// An exact copy of the English inflates coverage while changing nothing.
				if (!Array.isArray(value) && String(value).trim() === String(original).trim()) {
					translationProblems.push(`${type} ${id}: ${field.name}_${loc} is identical to the English`);
					continue;
				}
				translation[loc].done++;
				translation[loc].tiers[by]++;
			}
		}
	}
}

if (translationProblems.length) {
	console.error(`\n  translation errors (${translationProblems.length}):`);
	for (const p of translationProblems.slice(0, 25)) console.error(`   ✗  ${p}`);
	if (translationProblems.length > 25) console.error(`   … and ${translationProblems.length - 25} more`);
	process.exit(1);
}

const needsPrimary = [
	...resolvedPositions.filter((p) => p.verification === 'needs-primary-source').map((p) => p.id),
	...resolvedPeople.filter((p) => p.verification === 'needs-primary-source').map((p) => p.id)
];

/**
 * Coverage audit: what the map does not contain.
 *
 * Every other measure in this build reports on the QUALITY of records that exist —
 * how many await a primary source, how many have been reviewed, where sources
 * disagree. None of them can see a record that was never entered, because you
 * cannot flag the absence of a row. Succession gaps are the one existing exception,
 * and they work only because roles.yaml declares an expected sequence to check
 * against. This does the same thing for the shape of a leader's network.
 *
 * The problem it was built to expose: of twelve family relationships in the entire
 * dataset, eight are Ben Ali's. The incumbent president has none. That asymmetry is
 * not random — the dataset is dense exactly where evidence became public after a
 * regime fell, and thin where it is contemporary and contested. Left unmeasured it
 * reads as a political claim the project never intended to make, that the deposed
 * were corrupt and the sitting are clean. It also quietly contaminates the
 * hypotheses: H1 rates continuity `insufficient`, and "insufficient" must not be
 * allowed to mean "nobody looked".
 *
 * The expectation slate is DERIVED, not authored. A category counts as expected
 * once the project has mapped it for any one president — the standard is simply
 * "this project has shown it can do this, and here it has not". That keeps the
 * audit from encoding an opinion about what a leader's network ought to contain.
 */

interface PrincipalCoverage {
	id: string;
	name: string;
	/** Eras in which this person held the presidency. */
	eras: string[];
	/** Relationship counts by type, for edges incident to this person. */
	byType: Record<string, number>;
	total: number;
	/** People reachable through family edges alone. Zero means no mapped family. */
	kin: number;
	/** Expected categories with nothing recorded. The finding. */
	missing: string[];
}

const principalIds = [
	...new Set(resolvedPositions.filter((p) => p.role === 'president').map((p) => p.holder))
];

/**
 * Two measures, because one number cannot answer the question.
 *
 * A neighbourhood radius is the obvious approach and both settings of it are wrong.
 * Counting only edges with BOTH ends adjacent to the principal drops Belhassen
 * Trabelsi, who reaches Ben Ali solely through Leila — the brother-in-law vanishes
 * from an audit built to notice missing family. Counting every edge touching ANY
 * neighbour leaks the opposite way: an appointee's own relatives get credited to the
 * president, and Kais Saied stops looking short of family coverage because someone
 * he appointed has a brother on file.
 *
 * So: direct edges answer "which kinds of tie has anyone recorded for this person",
 * and a kin walk over family edges alone answers "is their family network mapped".
 * The second is the one this audit exists for, and it cannot be faked by proximity
 * to somebody else's relatives.
 */
const directCoverage = (principal: string): Record<string, number> => {
	const counts: Record<string, number> = {};
	for (const r of resolvedRelationships) {
		if (r.from !== principal && r.to !== principal) continue;
		counts[r.type] = (counts[r.type] ?? 0) + 1;
	}
	return counts;
};

/** People reachable from the principal through `family` edges only, at any depth. */
const kinNetwork = (principal: string): number => {
	const seen = new Set([principal]);
	const queue = [principal];
	while (queue.length) {
		const at = queue.shift()!;
		for (const r of resolvedRelationships) {
			if (r.type !== 'family') continue;
			const other = r.from === at ? r.to : r.to === at ? r.from : null;
			if (other && !seen.has(other)) {
				seen.add(other);
				queue.push(other);
			}
		}
	}
	return seen.size - 1;
};

const rawCoverage = principalIds.map((id) => ({ id, byType: directCoverage(id) }));

/** Derived expectation: any category this project has managed for any president. */
const expectedCategories = [
	...new Set(rawCoverage.flatMap((c) => Object.keys(c.byType)))
].sort();

const principalCoverage: PrincipalCoverage[] = rawCoverage
	.map(({ id, byType }) => {
		const eras = resolvedEras
			.filter((e) =>
				resolvedPositions.some(
					(p) =>
						p.holder === id &&
						p.role === 'president' &&
						p.interval.startEarliest <= (e.interval.endLatest ?? DATASET_CUTOFF) &&
						(p.interval.endLatest ?? DATASET_CUTOFF) >= e.interval.startEarliest
				)
			)
			.map((e) => e.id);
		return {
			id,
			name: personById.get(id)?.name_en ?? id,
			eras,
			byType,
			total: Object.values(byType).reduce((a, b) => a + b, 0),
			kin: kinNetwork(id),
			missing: expectedCategories.filter((c) => !byType[c])
		};
	})
	.sort((a, b) => b.total - a.total);

/**
 * Card completeness.
 *
 * Every entity card is rendered by one component, so how rich a card looks is
 * purely a function of how many fields its record carries. One person of 311
 * currently has all six sections. Ninety-two have two. Nothing anywhere said so,
 * because thinness is only visible by clicking a card and noticing the absence.
 *
 * Weighted by seniority on purpose: a one-line record for a sitting head of
 * government matters more than one for a figure who appears once in 1962. The
 * output is a worklist — where research pays — not a score anybody should defend.
 */
const CARD_SECTIONS = ['summary', 'trajectory', 'notes', 'relationships', 'corroborated'] as const;

const relCountByEntity = new Map<string, number>();
for (const r of resolvedRelationships) {
	relCountByEntity.set(r.from, (relCountByEntity.get(r.from) ?? 0) + 1);
	relCountByEntity.set(r.to, (relCountByEntity.get(r.to) ?? 0) + 1);
}

const cardCompleteness = resolvedPeople.map((p) => {
	const present: string[] = [];
	if (p.summary) present.push('summary');
	if (p.trajectory.length) present.push('trajectory');
	if (p.notes.length) present.push('notes');
	if (relCountByEntity.get(p.id)) present.push('relationships');
	if (p.sources.length >= 2) present.push('corroborated');
	return {
		id: p.id,
		name: p.name_en,
		authority: p.peakAuthority,
		filled: present.length,
		missing: CARD_SECTIONS.filter((s) => !present.includes(s))
	};
});

const cardHistogram: Record<number, number> = {};
for (const c of cardCompleteness) cardHistogram[c.filled] = (cardHistogram[c.filled] ?? 0) + 1;

/** Senior figures with the least on file. The actual research queue. */
const cardWorklist = cardCompleteness
	.filter((c) => c.authority >= 70 && c.filled <= 2)
	.sort((a, b) => b.authority - a.authority || a.filled - b.filled);

const dataset = {
	meta: {
		generated: new Date().toISOString(),
		cutoff: DATASET_CUTOFF,
		floor: DATASET_FLOOR,
		// The terms under which the graph may be reused. The code that builds
		// and displays it is MIT (see LICENSE at the repo root); the data
		// itself — the compilation, translations and analytical framing — is
		// CC BY 4.0 (see data/LICENSE). A dataset that invites reuse must say
		// under what terms, and npm run test refuses to ship one that does not.
		license: 'CC-BY-4.0',
		// The jurisdiction parameters every derived number below depends on —
		// bbox, gazette vocabulary, floor/cutoff, tenure windows, index discounts.
		// Loaded from data/parameters.yaml before anything else runs; emitted so a
		// reader can recompute, and a fork can prove what it changed. This is the
		// repair for the paper's §9 claim that "nothing in Layer 1 names Tunisia":
		// the names now live here, in data, and the layer reads them.
		parameters,
		counts: {
			sources: sources.length,
			/** Sources that actually back a claim. The honest evidentiary base. */
			sourcesCited: sources.length - uncitedSources.length,
			institutions: institutions.length,
			roles: roles.length,
			people: people.length,
			positions: positions.length,
			relationships: relationships.length,
			events: events.length,
			questions: questions.length,
			hypotheses: hypotheses.length,
			agreements: agreements.length,
			worldClaims: worldClaims.length,
			companies: companies.length,
			contracts: contracts.length,
			licences: licences.length,
			declarations: declarations.length,
			education: education.length,
			regions: regions.length,
			places: places.length
		},
		confidenceCounts,
		basisCounts,
		needsPrimarySourceCount: needsPrimary.length,
		successionGaps,
		successionOverlaps,
		// V24: the thresholds and exemption that produced the counts above, so a
		// reader can recompute them and a reviewer can disagree with them.
		successionMeta: {
			gapYears: SUCCESSION_GAP_YEARS,
			overlapYears: SUCCESSION_OVERLAP_YEARS,
			exemption: SUCCESSION_EXEMPTION
		},
		contradictions,
		review: { reviewed, reviewable, byRisk: reviewByRisk },
		translation,
		coverage: { expectedCategories, principals: principalCoverage },
		// W4: chains of all-weak influence edges (inferred/unsubstantiated),
		// warn-only — the Inspector names them instead of letting them pass.
		pathAudit,
		cards: {
			sections: [...CARD_SECTIONS],
			histogram: cardHistogram,
			worklistCount: cardWorklist.length,
			worklist: cardWorklist.slice(0, 40)
		},
		// Subsection display order per layer, apex to periphery, from groups.yaml.
		// "Other" is appended last for layers that had unmatched entities. Emitted
		// as meta because it is dataset structure, not a collection of records.
		groupOrder: Object.fromEntries(
			groupLayers.map((l) => [l.layer, [...l.subsections.map((s) => s.header_en), 'Other']])
		)
	},
	sources,
	eras: resolvedEras,
	institutions: resolvedInstitutions,
	roles,
	people: resolvedPeople,
	positions: resolvedPositions,
	relationships: resolvedRelationships,
	events: resolvedEvents,
	questions,
	hypotheses,
	agreements: resolvedAgreements,
	worldClaims: resolvedWorldClaims,
	companies: resolvedCompanies,
	contracts: resolvedContracts,
	licences: resolvedLicences,
	declarations: resolvedDeclarations,
	education: resolvedEducation,
	regions,
	places
};

// V22: trims are never silent. Every envelope clamp is published with the record,
// its original span and its resolved interval, so a reader can see what the model
// decided and an editor can fix the span instead of the report growing.
const intervalTrims = [
	...resolvedPositions
		.filter((p) => p.interval.trimmed || p.interval.startClamped)
		.map((p) => ({ kind: 'position', id: p.id, start: p.start, end: p.end, interval: p.interval })),
	...resolvedRelationships
		.filter((r) => r.interval.trimmed || r.interval.startClamped)
		.map((r) => ({ kind: 'relationship', id: r.id, start: r.start, end: r.end, interval: r.interval })),
	...resolvedEvents
		.filter((e) => e.interval.trimmed || e.interval.startClamped)
		.map((e) => ({ kind: 'event', id: e.id, start: e.date, end: e.date_end ?? e.date, interval: e.interval }))
];
writeFileSync(join(STATIC_DIR, 'interval-trims.json'), JSON.stringify(intervalTrims, null, 2), 'utf8');
if (intervalTrims.length) {
	warn('interval-trims', `${intervalTrims.length} interval(s) envelope-clamped (V22) — see static/interval-trims.json`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'dataset.json'), JSON.stringify(dataset), 'utf8');

// The world geometry (src/generated/world.json + static/world-topo.json) is
// compiled by scripts/build-world.ts from Natural Earth + data/countries.yaml.
// It needs the graph (build-world's verifyGraph checks its identifications
// against the dataset this build just wrote, and loadDebt reads creditor
// seats from it), so it runs here — after the dataset, before the exports
// that count world.json's bytes. build-world's comment claims it is "chained
// into npm run data"; this is that chain, made real.
if (!FIXTURE_MODE) {
	try {
		execFileSync(
			process.execPath,
			[join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'scripts', 'build-world.ts')],
			{ cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }
		);
	} catch {
		fail('world', 'build-world.ts failed — the world view cannot build without its geometry');
	}
}

// ---------------------------------------------------------------------------
// Public exports
//
// The knowledge graph is the product; the website is a window onto it. A power map
// nobody can check is just an assertion with better typography, so everything ships
// as downloadable data alongside the site.
// ---------------------------------------------------------------------------

mkdirSync(STATIC_DIR, { recursive: true });
writeFileSync(join(STATIC_DIR, 'dataset.json'), JSON.stringify(dataset, null, 2), 'utf8');

// GIS exports (spec §8.3): the gazetteer as GeoJSON for the map view and for
// external tooling. Places carry Point geometry from their coordinates; regions
// carry null geometry plus the hierarchy in properties (their polygons live in
// the sourced basemap static/tn-adm.geojson, not derived here).
{
	const regionFeatures = regions.map((r) => ({
		type: 'Feature',
		properties: {
			id: r.id,
			kind: r.kind,
			name_en: r.name_en,
			name_fr: r.name_fr ?? null,
			name_ar: r.name_ar ?? null,
			parent: r.parent ?? null,
			code: r.code ?? null
		},
		geometry: null
	}));
	const placeFeatures = places.map((p) => ({
		type: 'Feature',
		properties: {
			id: p.id,
			kind: p.kind,
			name_en: p.name_en,
			name_fr: p.name_fr ?? null,
			name_ar: p.name_ar ?? null,
			parent: p.parent ?? null,
			asset: p.asset
		},
		geometry: p.coordinates ? { type: 'Point', coordinates: p.coordinates } : null
	}));
	const geo = {
		type: 'FeatureCollection',
		generated: new Date().toISOString(),
		features: [...regionFeatures, ...placeFeatures]
	};
	writeFileSync(join(STATIC_DIR, 'geo.json'), JSON.stringify(geo), 'utf8');
	// Same payload under the §8.3 path for GIS tooling.
	mkdirSync(join(STATIC_DIR, 'tn'), { recursive: true });
	writeFileSync(join(STATIC_DIR, 'tn', 'regions.geojson'), JSON.stringify(geo), 'utf8');
}

function csvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	const s = Array.isArray(value) ? value.join('; ') : String(value);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
	const head = columns.join(',');
	const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(','));
	return [head, ...body].join('\n') + '\n';
}

const isoDay = (t: number | null) => (t === null ? '' : new Date(t).toISOString().slice(0, 10));

writeFileSync(
	join(STATIC_DIR, 'positions.csv'),
	toCsv(
		resolvedPositions.map((p) => ({
			id: p.id,
			holder: p.holder,
			holder_name: personById.get(p.holder)?.name_en ?? '',
			role: p.role,
			role_title: p.roleTitle,
			institution: p.institution,
			layer: p.layer,
			authority: p.authority,
			basis: p.basis,
			confidence: p.confidence,
			dates_inferred: p.datesInferred,
			verification: p.verification,
			start_raw: p.interval.raw.start,
			end_raw: p.interval.raw.end,
			start_earliest: isoDay(p.interval.startEarliest),
			start_latest: isoDay(p.interval.startLatest),
			end_earliest: isoDay(p.interval.endEarliest),
			end_latest: isoDay(p.interval.endLatest),
			status: p.interval.status,
			years: Math.round(p.years * 100) / 100,
			acting: p.acting,
			predecessor: p.predecessorDerived,
			successor: p.successorDerived,
			reasoning: p.reasoning ?? '',
			falsifiable_by: p.falsifiable_by ?? '',
			dispute_count: p.disputes.length,
			reviewed_by: p.review?.by ?? '',
			sources: p.sources
		})),
		[
			'id',
			'holder',
			'holder_name',
			'role',
			'role_title',
			'institution',
			'layer',
			'authority',
			'basis',
			'confidence',
			'dates_inferred',
			'verification',
			'start_raw',
			'end_raw',
			'start_earliest',
			'start_latest',
			'end_earliest',
			'end_latest',
			'status',
			'years',
			'acting',
			'predecessor',
			'successor',
			'reasoning',
			'falsifiable_by',
			'dispute_count',
			'reviewed_by',
			'sources'
		]
	),
	'utf8'
);

writeFileSync(
	join(STATIC_DIR, 'relationships.csv'),
	toCsv(
		resolvedRelationships.map((r) => ({
			id: r.id,
			from: r.from,
			from_name: personById.get(r.from)?.name_en ?? institutionById.get(r.from)?.name_en ?? '',
			to: r.to,
			to_name: personById.get(r.to)?.name_en ?? institutionById.get(r.to)?.name_en ?? '',
			type: r.type,
			subtype: r.subtype ?? '',
			direction: r.direction,
			basis: r.basis,
			confidence: r.confidence,
			attributed_to: r.attributed_to ?? '',
			start_raw: r.interval.raw.start,
			end_raw: r.interval.raw.end,
			description: r.description,
			reasoning: r.reasoning ?? '',
			falsifiable_by: r.falsifiable_by ?? '',
			sources: r.sources
		})),
		[
			'id',
			'from',
			'from_name',
			'to',
			'to_name',
			'type',
			'subtype',
			'direction',
			'basis',
			'confidence',
			'attributed_to',
			'start_raw',
			'end_raw',
			'description',
			'reasoning',
			'falsifiable_by',
			'sources'
		]
	),
	'utf8'
);

writeFileSync(
	join(STATIC_DIR, 'sources.csv'),
	toCsv(
		sources.map((s) => ({
			id: s.id,
			tier: s.tier,
			title: s.title,
			publisher: s.publisher,
			date: s.date ?? '',
			lang: s.lang,
			url: s.url,
			archive: s.archive_url ?? `https://web.archive.org/web/2026/${s.url}`,
			excerpt: s.excerpt ?? ''
		})),
		['id', 'tier', 'title', 'publisher', 'date', 'lang', 'url', 'archive', 'excerpt']
	),
	'utf8'
);

// v0.0.2 kinds — the same downloadable-data contract (P3). Empty kinds ship a
// header row only; the first record populates the row, not the schema.
writeFileSync(
	join(STATIC_DIR, 'companies.csv'),
	toCsv(
		resolvedCompanies.map((c) => ({
			id: c.id,
			legal_name_fr: c.legal_name_fr ?? '',
			legal_name_ar: c.legal_name_ar ?? '',
			legal_form: c.legal_form ?? '',
			cin: c.cin ?? '',
			status: c.status,
			founded: c.founded ?? '',
			capital_tnd: c.capital ? String(c.capital.tnd) : '',
			capital_date: c.capital?.date ?? '',
			state_owned: String(c.state_owned),
			basis: c.basis,
			confidence: c.confidence
		})),
		['id', 'legal_name_fr', 'legal_name_ar', 'legal_form', 'cin', 'status', 'founded', 'capital_tnd', 'capital_date', 'state_owned', 'basis', 'confidence']
	),
	'utf8'
);
writeFileSync(
	join(STATIC_DIR, 'contracts.csv'),
	toCsv(
		resolvedContracts.map((c) => ({
			id: c.id,
			title_en: c.title_en,
			institution: c.institution,
			kind: c.kind,
			status: c.status,
			award_value: c.award?.value ?? '',
			award_currency: c.award?.currency ?? '',
			award_year: c.award?.year ?? '',
			winner: c.winner ?? '',
			start: c.start ?? '',
			end: c.end ?? '',
			basis: c.basis,
			confidence: c.confidence,
			attributed_to: c.attributed_to ?? ''
		})),
		['id', 'title_en', 'institution', 'kind', 'status', 'award_value', 'award_currency', 'award_year', 'winner', 'start', 'end', 'basis', 'confidence', 'attributed_to']
	),
	'utf8'
);
writeFileSync(
	join(STATIC_DIR, 'licences.csv'),
	toCsv(
		resolvedLicences.map((l) => ({
			id: l.id,
			holder: l.holder,
			issuer: l.issuer,
			kind: l.kind,
			grant: l.grant,
			status: l.status,
			basis: l.basis,
			confidence: l.confidence
		})),
		['id', 'holder', 'issuer', 'kind', 'grant', 'status', 'basis', 'confidence']
	),
	'utf8'
);
writeFileSync(
	join(STATIC_DIR, 'declarations.csv'),
	toCsv(
		resolvedDeclarations.map((d) => ({
			id: d.id,
			declarer: d.declarer,
			date: d.date,
			kind: d.kind,
			jurisdiction: d.jurisdiction,
			body: d.body ?? '',
			status: d.status,
			basis: d.basis,
			confidence: d.confidence
		})),
		['id', 'declarer', 'date', 'kind', 'jurisdiction', 'body', 'status', 'basis', 'confidence']
	),
	'utf8'
);
writeFileSync(
	join(STATIC_DIR, 'education.csv'),
	toCsv(
		resolvedEducation.map((e) => ({
			id: e.id,
			person: e.person,
			institution: e.institution ?? '',
			degree_en: e.degree_en,
			kind: e.kind,
			start: e.start ?? '',
			end: e.end ?? '',
			basis: e.basis,
			confidence: e.confidence
		})),
		['id', 'person', 'institution', 'degree_en', 'kind', 'start', 'end', 'basis', 'confidence']
	),
	'utf8'
);

// ---------------------------------------------------------------------------
// Generated types
//
// Explicit interfaces rather than `typeof dataset`. Inferring from the JSON produces
// an enormous union of per-record literal types, which is slow to check and breaks
// assignability wherever a nullable field happens to be null in every record of one
// source file.
// ---------------------------------------------------------------------------

const types = `// GENERATED by scripts/build-data.ts — do not edit.
import raw from './dataset.json';
import changelogRaw from './changelog.json';

/** One commit touching data/. See readChangelog() in scripts/build-data.ts. */
export interface ChangeEntry {
	hash: string;
	date: string;
	subject: string;
	/** What the commit did to existing lines: added only, rewrote, or net-deleted. */
	kind: 'expansion' | 'revision' | 'retraction';
	added: number;
	removed: number;
	files: { file: string; added: number; removed: number }[];
}

/** Dataset history, newest first. Empty when the build ran without git. */
export const changelog = changelogRaw as ChangeEntry[];

export type Confidence = 'A' | 'B' | 'C' | 'D';
export type Basis = 'documented' | 'reported' | 'inferred' | 'unsubstantiated';
export type Verification = 'verified' | 'needs-primary-source' | 'disputed';
export type Layer =
	| 'security'
	| 'political'
	| 'economic'
	| 'media'
	| 'judicial'
	| 'civil'
	| 'foreign';
export type Precision = 'day' | 'month' | 'year' | 'approx' | 'before' | 'after' | 'unknown';
export type IntervalStatus = 'ended' | 'ongoing' | 'last-verified' | 'unknown';

export interface Review {
	by: string;
	date: string;
	method?: string;
}

export interface Dispute {
	claim: string;
	held_by: string;
	source?: string;
	assessment?: string;
}

export interface Interval {
	startEarliest: number;
	startLatest: number;
	endEarliest: number | null;
	endLatest: number | null;
	startPrecision: Precision;
	endPrecision: Precision;
	status: IntervalStatus;
	raw: { start: string | null; end: string | null };
}

export interface Source {
	id: string;
	title: string;
	publisher: string;
	date?: string;
	url: string;
	archive_url?: string;
	tier: number;
	lang: string;
	excerpt?: string;
}

export interface Era {
	id: string;
	label_en: string;
	label_fr?: string;
	label_ar?: string;
	start: string;
	end: string;
	thesis: string;
	formula?: string;
	accent: string;
	sources: string[];
	/** P2 #17 — eras are graded theses: confidence, whose synthesis, reasoning, falsifier. */
	confidence?: Confidence;
	verification?: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	interval: Interval;
}

export interface Institution {
	id: string;
	name_en: string;
	name_fr?: string;
	name_ar?: string;
	abbr?: string;
	type: string;
	layer: Layer;
	parent: string | null;
	/** ISO alpha-2 host country for a sourced international-organisation seat. */
	seat?: string;
	order: number;
	summary?: string;
	confidence: Confidence;
	verification: Verification;
	sources: string[];
	interval: Interval;
	group: string;
	/** Derived per-entity timeline for company-like institutions (spec §9). */
	timeline: TimelineItem[];
}

export interface Role {
	id: string;
	title_en: string;
	title_fr?: string;
	title_ar?: string;
	institution: string;
	authority: number;
	row?: string;
	summary?: string;
	sources: string[];
}

export interface Person {
	id: string;
	name_en: string;
	name_fr?: string;
	name_ar?: string;
	aliases: string[];
	birth?: string;
	death?: string;
	layers: Layer[];
	tagline?: string;
	summary?: string;
	trajectory: string[];
	/** True when the arc was computed from position records, not authored. */
	trajectoryDerived: boolean;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	review?: Review;
	notes: string[];
	sources: string[];
	birthResolved: Interval | null;
	deathResolved: Interval | null;
	positionIds: string[];
	institutionsTouched: string[];
	layerCount: number;
	seniorYears: number;
	erasSpanned: string[];
	peakAuthority: number;
	group: string;
	/** Derived per-entity timeline (spec §9) — positions, ties, events, records. */
	timeline: TimelineItem[];
}

export interface TimelineItem {
	title: string;
	kind: 'position' | 'relationship' | 'event' | 'contract' | 'licence' | 'education' | 'declaration';
	confidence: Confidence;
	basis: Basis;
	disputed: boolean;
	ref: { kind: string; id: string };
	interval: Interval;
}

export interface Position {
	id: string;
	role: string;
	holder: string;
	start?: string;
	end?: string;
	acting: boolean;
	predecessor?: string | null;
	confidence: Confidence;
	basis: Basis;
	datesInferred: boolean;
	verification: Verification;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	notes: string[];
	sources: string[];
	interval: Interval;
	years: number;
	roleTitle: string;
	roleTitleFr?: string;
	roleTitleAr?: string;
	institution: string;
	authority: number;
	layer: Layer;
	row: string;
	predecessorDerived: string | null;
	successorDerived: string | null;
}

export interface Relationship {
	id: string;
	from: string;
	to: string;
	type: string;
	subtype?: string;
	start?: string;
	end?: string;
	description: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	sources: string[];
	interval: Interval;
}

export interface ContestedFraming {
	framing: string;
	held_by: string;
	source?: string;
}

export interface EventRec {
	id: string;
	date: string;
	date_end?: string;
	title_en: string;
	title_fr?: string;
	title_ar?: string;
	category: string;
	/** Finer cut than category (spec §6). */
	subcategory?: string;
	/** Place ids (R8). */
	location: string[];
	impact?: { layer: string[] };
	documents: string[];
	materials: string[];
	/** Event-to-event edges: a cause precedes its consequence (V8). */
	causes: string[];
	consequences: string[];
	rupture: boolean;
	summary: string;
	actors: string[];
	institutions: string[];
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	contested: ContestedFraming[];
	disputes: Dispute[];
	review?: Review;
	sources: string[];
	interval: Interval;
}

export interface Question {
	id: string;
	question: string;
	kind: 'verification' | 'analytical';
	status: 'open' | 'partial' | 'answered';
	relates_to: string[];
	notes?: string;
	/** P2 #18 — a sourced answer is a claim: basis, confidence, reasoning, falsifier, sources. */
	answer?: string;
	basis?: Basis;
	confidence?: Confidence;
	verification?: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	sources?: string[];
}

export interface HypothesisEvidence {
	falsifier_part?: string;
	finding: 'supports' | 'contradicts' | 'neutral';
	evidence: string;
	evidence_fr?: string;
	evidence_ar?: string;
	confidence: Confidence;
	basis: Basis;
	verification?: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	falsifier_progress?: string;
	note?: string;
	sources: string[];
}

export interface Hypothesis {
	id: string;
	label: string;
	statement: string;
	support: 'strong' | 'moderate' | 'insufficient' | 'contradicted';
	reasoning: string;
	falsifiable_by: string;
	sources: string[];
	/** P2 #19 — evidence findings tested against the falsifier clauses. */
	evidence?: HypothesisEvidence[];
}

export interface Contradiction {
	kind: 'position' | 'relationship' | 'event';
	id: string;
	subject: string;
	adopted: string;
	disputes: Dispute[];
}

export interface DatasetMeta {
	generated: string;
	cutoff: number;
	floor: number;
	/** SPDX id of the terms the graph ships under. See data/LICENSE. */
	license: string;
	/** The jurisdiction parameters (data/parameters.yaml), loaded and validated. */
	parameters: {
		jurisdiction: {
			name: string;
			bbox: { lonMin: number; lonMax: number; latMin: number; latMax: number };
			gazette: { vocabulary: string[]; sourcePrefixes: string[] };
			registry: { label: string; idLabel: string; registries: string[] };
		};
		time: {
			floor: string;
			cutoff: string;
			beforeWindowYears: number;
			approxSlackDays: { year: number; month: number };
		};
		index: {
			discount: {
				documented: number;
				reported: number;
				inferred: number;
				unsubstantiated: number;
			};
		};
	};
	/** What the public payload weighs on disk, KB. Patched after emit; see the note at the counter. */
	shippedKB: number;
	/** The flagship dataset.json export on its own, KB. */
	datasetKB: number;
	counts: Record<string, number>;
	confidenceCounts: Record<Confidence, number>;
	basisCounts: Record<Basis, number>;
	needsPrimarySourceCount: number;
	/**
	 * Subsection display order per layer, emitted from groups.yaml — apex to
	 * periphery, "Other" always last. The network view's lanes stack groups
	 * top-to-bottom in this order; alphabetical was the bug that put Presidents
	 * at the bottom of the political lane.
	 */
	groupOrder: Record<string, string[]>;
	successionGaps: { role: string; after: string; before: string; gapYears: number }[];
	successionOverlaps: { role: string; a: string; b: string; overlapYears: number }[];
	contradictions: Contradiction[];
	/** Per locale and per provenance tier. Never summed - see the note at the counter. */
	translation: Record<
		'fr' | 'ar',
		{ total: number; done: number; tiers: Record<'machine' | 'model-reviewed' | 'machine-reviewed' | 'human', number> }
	>;
	review: {
		reviewed: number;
		reviewable: number;
		/** Coverage per risk bucket, most-damaging first. See reviewRiskOf in build-data.ts. */
		byRisk: Record<
			'unsubstantiated' | 'attributed' | 'inferred' | 'reported' | 'documented',
			{ reviewed: number; total: number }
		>;
	};
	/** Card completeness: how much each record actually carries. A worklist. */
	cards: {
		sections: string[];
		histogram: Record<string, number>;
		worklistCount: number;
		worklist: { id: string; name: string; authority: number; filled: number; missing: string[] }[];
	};
	/** What the map does not contain. See the coverage audit in build-data.ts. */
	coverage: {
		/** Derived: any relationship category mapped for at least one president. */
		expectedCategories: string[];
		principals: {
			id: string;
			name: string;
			eras: string[];
			byType: Record<string, number>;
			total: number;
			/** People reachable through family edges alone. Zero means no mapped family. */
			kin: number;
			missing: string[];
		}[];
	};
	/** W4 warn-only: all-weak influence chains (inferred/unsubstantiated). */
	pathAudit: {
		chains: { entities: string[]; edges: string[]; depth: number }[];
	};
}

export interface Agreement {
	id: string;
	title_en: string;
	title_fr?: string;
	title_ar?: string;
	kind: string;
	/**
	 * Every other party. Tunisia is never listed: it is the selection criterion of
	 * the whole file, and naming it per record would be one more chance to omit it
	 * and have an arc silently disappear.
	 */
	parties: string[];
	/** Signed at. ISO date string when known. */
	signed?: string;
	/** Binding from. ISO date string when known. */
	in_force?: string;
	text_url?: string;
	summary: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	/** Whose claim this is — mandatory for anything below grade B. */
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	sources: string[];
}

/**
 * A claim about Tunisia's external relations that is NOT a measurement
 * (docs/plans/world-rebuild-v2.md §2.7): an aggregate the flow families cannot
 * cover (total debt incl. domestic, tourism) or a circulating claim kept per
 * rule 6. 'entity' is the graph institution id, or null for Tunisia itself.
 */
export interface WorldClaim {
	id: string;
	entity: string | null;
	claim: string;
	/** What the evidence shows — the counter or the boundary, stated. */
	assessment: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	/** Whose claim this is — mandatory below grade B. */
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	notes: string[];
	sources: string[];
}

// --- v0.0.2 record kinds (spec §4) -------------------------------------------

/** Corporate record, keyed by institution id (spec §4.2). */
export interface Company {
	id: string;
	legal_name_en?: string;
	legal_name_fr?: string;
	legal_name_ar?: string;
	legal_form?: string;
	registration?: { registry: string; number: string; date: string };
	cin?: string;
	status: string;
	founded?: string;
	capital?: { tnd: number; date: string };
	state_owned: boolean;
	activities: string[];
	headquarters?: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	sources: string[];
}

/** Procurement / PPP / concession record (spec §4.4). */
export interface Contract {
	id: string;
	title_en: string;
	title_fr?: string;
	title_ar?: string;
	institution: string;
	kind: string;
	procurement?: { mechanism: string; advertised: string };
	award?: { value: string; currency: string; year: number };
	winner?: string;
	losers: string[];
	financing?: { type: string; lender: string | null };
	status: string;
	start?: string;
	end?: string;
	location: string[];
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	notes: string[];
	disputes: Dispute[];
	review?: Review;
	sources: string[];
	interval: Interval;
}

/** Time-bound right between an operating company and a state body (spec §4.5). */
export interface Licence {
	id: string;
	holder: string;
	issuer: string;
	kind: string;
	grant: string;
	term?: { years: number };
	scope?: { frequency?: string; region: string };
	fees?: { amount: number; currency: string; year: number };
	status: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	notes: string[];
	disputes: Dispute[];
	review?: Review;
	sources: string[];
}

/** A record about a document, not about the world (spec §4.6). */
export interface Declaration {
	id: string;
	declarer: string;
	date: string;
	kind: string;
	jurisdiction: string;
	body: string | null;
	summary: string;
	status: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	notes: string[];
	disputes: Dispute[];
	review?: Review;
	sources: string[];
}

/** Education record (spec §4.7). */
export interface Education {
	id: string;
	person: string;
	institution: string | null;
	degree_en: string;
	degree_fr?: string;
	degree_ar?: string;
	field?: string;
	kind: string;
	start?: string;
	end?: string;
	notes: string[];
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	sources: string[];
	interval: Interval;
}

export interface Dataset {
	meta: DatasetMeta;
	sources: Source[];
	eras: Era[];
	institutions: Institution[];
	roles: Role[];
	people: Person[];
	positions: Position[];
	relationships: Relationship[];
	events: EventRec[];
	questions: Question[];
	hypotheses: Hypothesis[];
	agreements: Agreement[];
	worldClaims: WorldClaim[];
	companies: Company[];
	contracts: Contract[];
	licences: Licence[];
	declarations: Declaration[];
	education: Education[];
	regions: RegionRec[];
	places: PlaceRec[];
}

export interface RegionRec {
	id: string;
	kind: 'region' | 'governorate' | 'delegation' | 'municipality';
	name_en: string;
	name_fr?: string;
	name_ar?: string;
	parent?: string;
	code?: string;
	confidence: Confidence;
	verification: Verification;
	sources: string[];
}

export interface PlaceRec {
	id: string;
	kind: string;
	name_en: string;
	name_fr?: string;
	name_ar?: string;
	parent?: string;
	coordinates?: [number, number];
	asset: boolean;
	owner?: string;
	confidence: Confidence;
	basis: Basis;
	verification: Verification;
	attributed_to?: string;
	reasoning?: string;
	falsifiable_by?: string;
	disputes: Dispute[];
	review?: Review;
	sources: string[];
}

export const dataset = raw as unknown as Dataset;
export default dataset;
`;
writeFileSync(join(OUT_DIR, 'index.ts'), types, 'utf8');

const size = (JSON.stringify(dataset).length / 1024).toFixed(0);

// ---------------------------------------------------------------------------
// Published statistics
//
// Every number this project states about itself in prose has to come from the
// graph, because the project's whole claim is that it publishes the real figure
// including when the real figure is unflattering. Hand-maintained counts drift:
// the README spent several sessions advertising 14 succession gaps and 5-of-208
// human review while the actual graph held 36 and 24-of-531 — understating its
// own backlog on the front page of a project about not doing that.
//
// So the build owns them. Prose tags a span as
//     <!--stat:successionGaps-->36<!--/stat-->
// and this rewrites the contents in place, leaving the sentence around it alone.
// HTML comments are invisible in rendered Markdown. `npm run test` then re-checks
// the files, so a hand-edit or a commit made without rebuilding fails the suite
// rather than shipping.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dataset changelog
//
// /about promises that corrections are published rather than quietly applied.
// Nothing published them. The record already existed — the dataset is plain text
// under version control, so every factual change is a dated, attributable diff —
// it was simply never surfaced, which makes the promise unverifiable by exactly
// the people it is addressed to.
//
// So the history of data/*.yaml is extracted at build time. Commits are classified
// by what they did to existing lines, because that is the distinction a reader
// cares about: adding records is expansion, rewriting them is where corrections
// live, and net deletion is a retraction.
//
// Degrades to an empty list without git (a tarball, a shallow CI clone). The page
// says so rather than rendering an empty table that implies nothing ever changed.
// ---------------------------------------------------------------------------

interface ChangeFile {
	file: string;
	added: number;
	removed: number;
}
interface ChangeEntry {
	hash: string;
	date: string;
	subject: string;
	kind: 'expansion' | 'revision' | 'retraction';
	added: number;
	removed: number;
	files: ChangeFile[];
}

function readChangelog(): ChangeEntry[] {
	let raw: string;
	try {
		raw = execFileSync(
			'git',
			['log', '--no-merges', '--format=%x00%H|%aI|%s', '--numstat', '--', 'data/'],
			{ cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
		);
	} catch {
		return [];
	}

	const entries: ChangeEntry[] = [];
	for (const block of raw.split('\0')) {
		if (!block.trim()) continue;
		const [header, ...rest] = block.split('\n');
		const sep = header.indexOf('|');
		const sep2 = header.indexOf('|', sep + 1);
		if (sep < 0 || sep2 < 0) continue;

		const files: ChangeFile[] = [];
		for (const line of rest) {
			const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
			if (!m) continue;
			// Binary files report "-". Nothing under data/ is binary, but a rename or a
			// future asset would be, and counting "-" as 0 beats crashing the build.
			files.push({
				file: m[3],
				added: m[1] === '-' ? 0 : Number(m[1]),
				removed: m[2] === '-' ? 0 : Number(m[2])
			});
		}
		if (files.length === 0) continue;

		const added = files.reduce((s, f) => s + f.added, 0);
		const removed = files.reduce((s, f) => s + f.removed, 0);

		entries.push({
			hash: header.slice(0, sep).slice(0, 9),
			date: header.slice(sep + 1, sep2),
			subject: header.slice(sep2 + 1),
			kind: removed === 0 ? 'expansion' : removed > added ? 'retraction' : 'revision',
			added,
			removed,
			files
		});
	}
	return entries;
}

// Bounded so the file cannot grow without limit as the project accumulates history.
// The full record stays in git; this is the published window onto it.
const changelog = readChangelog().slice(0, 250);

// The commit the build runs from — the paper's reproducibility block tags it,
// so "built from the then-current graph" names a state, not a date.
function readCommitSha(): string {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return '';
	}
}

writeFileSync(join(OUT_DIR, 'changelog.json'), JSON.stringify(changelog), 'utf8');

// ---------------------------------------------------------------------------
// What the public data payload actually weighs on disk.
//
// `size` above measures the in-memory bundle. `shippedKB` measures what leaves
// the building: the pretty-printed public dataset, the CSV exports, the
// geographic layers, the changelog and the world topology. The two disagree by
// design — the exports are formats, not facts — and the README must not sell
// the smaller number as the larger promise. Rounded to the nearest 10 KB like
// graphKB so a one-commit churn does not rewrite the published figure.
// ---------------------------------------------------------------------------

let shippedBytes = 0;
for (const rel of [
	'dataset.json',
	'positions.csv',
	'relationships.csv',
	'sources.csv',
	'companies.csv',
	'contracts.csv',
	'licences.csv',
	'declarations.csv',
	'education.csv',
	'geo.json',
	'interval-trims.json',
	'editorial-queue.json',
	join('tn', 'regions.geojson')
]) {
	const p = join(STATIC_DIR, rel);
	if (existsSync(p)) shippedBytes += statSync(p).size;
}
for (const rel of ['changelog.json', 'world.json']) {
	const p = join(OUT_DIR, rel);
	if (existsSync(p)) shippedBytes += statSync(p).size;
}
// world-topo.json ships to static (the runtime-fetched globe geometry, W3).
for (const rel of ['world-topo.json']) {
	const p = join(STATIC_DIR, rel);
	if (existsSync(p)) shippedBytes += statSync(p).size;
}
const shippedKB = Math.round(shippedBytes / 1024 / 10) * 10;

// The flagship export on its own, so /data can label the card honestly instead of
// guessing at a proportion of the total.
const datasetKB = Math.round(statSync(join(STATIC_DIR, 'dataset.json')).size / 1024);

// meta.shippedKB is a derived stat, and the payload sizes are only final after
// every export is written — so patch the emitted bundle rather than hoist the
// CSV generation above the dataset object. The patch runs in fixture mode too;
// test-pipeline normalizes it away the same way it normalizes `generated`.
{
	const bundled = JSON.parse(readFileSync(join(OUT_DIR, 'dataset.json'), 'utf8'));
	bundled.meta.shippedKB = shippedKB;
	bundled.meta.datasetKB = datasetKB;
	writeFileSync(join(OUT_DIR, 'dataset.json'), JSON.stringify(bundled), 'utf8');
	writeFileSync(join(STATIC_DIR, 'dataset.json'), JSON.stringify(bundled, null, 2), 'utf8');
}

// The audits the product publishes: family edges (the coverage audit's kin walk
// and the paper's §8.2 both cite this), the research queue, and the risk-bucketed
// review counts. Computed once, emitted to stats.json, and tagged into the paper
// by the same STAT_TAG mechanism as every other published figure — the product,
// the paper and the console block can never disagree because they share one value.
const familyEdges = resolvedRelationships.filter((r) => r.type === 'family').length;

const stats: Record<string, string> = {
	sources: String(sources.length),
	sourcesCited: String(sources.length - uncitedSources.length),
	sourcesUncited: String(uncitedSources.length),
	institutions: String(institutions.length),
	roles: String(roles.length),
	people: String(people.length),
	positions: String(positions.length),
	relationships: String(relationships.length),
	events: String(events.length),
	documented: String(basisCounts.documented),
	reported: String(basisCounts.reported),
	inferred: String(basisCounts.inferred),
	unsubstantiated: String(basisCounts.unsubstantiated),
	needsPrimarySource: String(needsPrimary.length),
	successionGaps: String(successionGaps.length),
	successionOverlaps: String(successionOverlaps.length),
	contradictions: String(contradictions.length),
	reviewed: String(reviewed),
	reviewable: String(reviewable),
	// Translation coverage, published for the same reason the review numbers are: a
	// commitment nobody can see the shortfall in does not mean anything. `human` is
	// the only tier that means a person who reads the language has looked at it.
	translatable: String(translation.fr.total),
	translatedFr: String(translation.fr.done),
	translatedAr: String(translation.ar.done),
	translatedHuman: String(translation.fr.tiers.human + translation.ar.tiers.human),
	// Rounded to the nearest 10 KB. The exact byte count shifts on almost every data
	// edit, and a README that churns by one kilobyte per commit buries the changes
	// that matter in noise. The prose keeps a "~" in front of it.
	graphKB: String(Math.round(Number(size) / 10) * 10),
	// What the public exports weigh — see the shippedKB note above. The README says
	// both numbers so the internal bundle and the shipped payload cannot be
	// mistaken for each other.
	shippedKB: String(shippedKB),
	// The coverage-audit figures, flat for the stat-tag channel (the structured
	// audit travels in dataset.json meta.coverage / meta.cards / meta.review).
	// Keyed by principal id so the paper can pin a claim about any president to
	// the emitted number — the §8.2 family sentence is tagged kin-kais-saied.
	familyEdges: String(familyEdges),
	researchQueue: String(cardWorklist.length),
	intervalTrims: String(intervalTrims.length),
	...Object.fromEntries(
		principalCoverage.flatMap((p) => [
			[`edges-${p.id}`, String(p.total)],
			[`kin-${p.id}`, String(p.kin)]
		])
	),
	...Object.fromEntries(
		REVIEW_RISK.flatMap((k) => [
			[`reviewed-${k}`, String(reviewByRisk[k].reviewed)],
			[`reviewable-${k}`, String(reviewByRisk[k].total)]
		])
	),
	// The commit the build ran from, so a tagged paper can name its state.
	commitSha: readCommitSha()
};

writeFileSync(join(OUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');

// Sitemap for the static site. Generated, never hand-maintained: every route
// in this list is a real prerendered page (adapter-static, strict mode fails
// on a route that does not exist). The domain is the deployed apex; a fork
// that retargets the jurisdiction edits its own deploy, not this list.
if (!FIXTURE_MODE) {
	const SITE_URL = process.env.DT_SITE_URL ?? 'https://deeptunisia.org';
	// Top-level pages in load order. Query-parameter views (agora tabs) are
	// entry points, not pages: the SPA renders them from the same HTML, so
	// the crawler needs only the root.
	const SITEMAP_ROUTES = [
		'/',
		'/now',
		'/network',
		'/atlas',
		'/world',
		'/rankings',
		'/investigate',
		'/map',
		'/agora',
		'/feed',
		'/evidence',
		'/methodology',
		'/corrections',
		'/data',
		'/about',
		'/guide'
	];
	const lastmod = new Date().toISOString().slice(0, 10);
	const sitemap =
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		SITEMAP_ROUTES.map((r) => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') +
		'\n</urlset>\n';
	writeFileSync(join(STATIC_DIR, 'sitemap.xml'), sitemap, 'utf8');
}

if (!FIXTURE_MODE) {
	const STAT_TAG = /<!--stat:([A-Za-z][A-Za-z0-9-]*)-->([\s\S]*?)<!--\/stat-->/g;
	const STAT_DOCS = [
		'README.md',
		'AGENTS.md',
		'DESIGN.md',
		'static/llms.txt',
		'output/deeptunisia-release-paper-v0.1.1.md'
	];

	const statUpdates: string[] = [];
	for (const file of STAT_DOCS) {
		const path = join(ROOT, file);
		if (!existsSync(path)) continue;
		const before = readFileSync(path, 'utf8');
		let replaced = 0;
		let unknown: string[] = [];
		const after = before.replace(STAT_TAG, (whole, key: string, current: string) => {
			const value = stats[key];
			if (value === undefined) {
				unknown.push(key);
				return whole;
			}
			if (current !== value) replaced++;
			return `<!--stat:${key}-->${value}<!--/stat-->`;
		});
		for (const key of unknown) console.log(`   !  ${file}: unknown stat key "${key}"`);
		if (after !== before) {
			writeFileSync(path, after, 'utf8');
			statUpdates.push(`${file} (${replaced})`);
		}
	}
	if (statUpdates.length) console.log(`   ↻  published stats refreshed: ${statUpdates.join(', ')}`);
}

console.log(`
  DeepTunisia — knowledge graph built  (${size} KB)

    ${String(sources.length - uncitedSources.length).padStart(4)}  sources cited${uncitedSources.length ? `  (+${uncitedSources.length} defined but backing no claim)` : ''}
    ${String(institutions.length).padStart(4)}  institutions
    ${String(roles.length).padStart(4)}  roles
    ${String(people.length).padStart(4)}  people
    ${String(positions.length).padStart(4)}  positions
    ${String(relationships.length).padStart(4)}  relationships
    ${String(events.length).padStart(4)}  events

    basis   documented ${basisCounts.documented}   reported ${basisCounts.reported}   inferred ${basisCounts.inferred}   unsubstantiated ${basisCounts.unsubstantiated}
    flagged for primary-source verification: ${needsPrimary.length}
    succession gaps: ${successionGaps.length}   overlaps: ${successionOverlaps.length}   recorded contradictions: ${contradictions.length}
    human-reviewed: ${reviewed}/${reviewable}
${REVIEW_RISK.map(
	(k) => `      ${k.padEnd(16)} ${String(reviewByRisk[k].reviewed).padStart(4)}/${String(reviewByRisk[k].total).padEnd(4)}`
).join('\n')}

    translation coverage        fr        ar
      data prose         ${`${translation.fr.done}/${translation.fr.total}`.padStart(9)} ${`${translation.ar.done}/${translation.ar.total}`.padStart(9)}
${TRANSLATION_TIERS.map(
	(tier) =>
		`      ${tier.padEnd(17)} ${String(translation.fr.tiers[tier]).padStart(9)} ${String(translation.ar.tiers[tier]).padStart(9)}`
).join('\n')}

    card completeness (of ${CARD_SECTIONS.length} sections)
${Object.keys(cardHistogram)
	.sort()
	.map((k) => `      ${k}/${CARD_SECTIONS.length}  ${String(cardHistogram[Number(k)]).padStart(4)} people`)
	.join('\n')}
      research queue: ${cardWorklist.length} senior figures at 2 sections or fewer

    presidential network coverage      edges  kin
${principalCoverage
	.map(
		(p) =>
			`      ${p.name.padEnd(26)} ${String(p.total).padStart(5)} ${String(p.kin).padStart(4)}` +
			(p.missing.length ? `   no: ${p.missing.join(', ')}` : '   all categories present')
	)
	.join('\n')}

    weak influence chains (warn-only, W4): ${pathAudit.chains.length} — see Inspector
`);
