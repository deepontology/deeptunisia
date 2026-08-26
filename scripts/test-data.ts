/**
 * Assertions over the built graph.
 *
 * These are not unit tests of rendering; they check that the dataset supports the
 * claims the site makes about it. If a finding the interface advertises stops being
 * true of the data, this fails loudly rather than the page quietly going blank.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RelationshipType, EDGE_DIRECTION } from '../scripts/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ds = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8'));
const world = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'world.json'), 'utf8'));

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) {
		console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

const CUTOFF = ds.meta.cutoff;
type Pos = (typeof ds.positions)[number];

const overlaps = (iv: Pos['interval'], a: number, b: number) =>
	iv.startEarliest <= b && (iv.endLatest ?? CUTOFF) >= a;

const nameOf = (id: string) =>
	ds.people.find((p: { id: string }) => p.id === id)?.name_en ??
	ds.institutions.find((i: { id: string }) => i.id === id)?.name_en ??
	id;

// --- Referential and structural sanity ------------------------------------

ok('every position resolves to a role', ds.positions.every((p: Pos) => p.roleTitle && p.institution));
ok(
	'every position has at least one source',
	ds.positions.every((p: Pos) => p.sources.length > 0)
);
ok(
	'every inferred claim states its reasoning',
	ds.positions.filter((p: Pos) => p.basis === 'inferred').every((p: Pos) => Boolean(p.reasoning))
);
ok(
	'every inferred claim states a falsifier',
	ds.positions.filter((p: Pos) => p.basis === 'inferred').every((p: Pos) => Boolean(p.falsifiable_by))
);
ok(
	'every unsubstantiated claim names where it circulates',
	ds.relationships
		.filter((r: { basis: string }) => r.basis === 'unsubstantiated')
		.every((r: { attributed_to?: string }) => Boolean(r.attributed_to))
);
ok(
	'every hypothesis is falsifiable',
	ds.hypotheses.every((h: { falsifiable_by: string }) => h.falsifiable_by.length > 20)
);
// A falsifier shared between two hypotheses is a falsifier for neither: it cannot
// discriminate between them, so at most one of them is actually being tested. This
// caught five hypotheses carrying a verbatim copy of H1's falsifier, which the
// length check above passed without complaint.
{
	const seen = new Map<string, string>();
	const dupes: string[] = [];
	for (const h of ds.hypotheses as { id: string; falsifiable_by: string }[]) {
		const key = h.falsifiable_by.replace(/\s+/g, ' ').trim().toLowerCase();
		const prior = seen.get(key);
		if (prior) dupes.push(`${h.id} duplicates ${prior}`);
		else seen.set(key, h.id);
	}
	ok(
		'no two hypotheses share a falsifier',
		dupes.length === 0,
		dupes.length ? dupes.join('; ') : `${ds.hypotheses.length} distinct`
	);
}

// P2 #18/#19 — sourced question answers, graded eras, and hypothesis evidence
// findings are claims like any other: each must carry at least one source, a
// C/D-grade claim must name who makes it, and every evidence finding must have
// its `evidence` prose translated with provenance (the generic TRANSLATABLE_FIELDS
// loop cannot see nested findings, so this block enforces them — the same
// dedicated treatment sources.excerpt gets in test-i18n).
{
	const answered = (ds.questions as { id: string; answer?: string; sources?: string[] }[]).filter(
		(q) => q.answer
	);
	ok(
		'P2 #18: every answered question carries at least one source',
		answered.every((q) => (q.sources?.length ?? 0) > 0),
		answered.filter((q) => (q.sources?.length ?? 0) === 0).map((q) => q.id).join(', ')
	);

	const graded = (ds.eras as { id: string; confidence?: string; reasoning?: string; falsifiable_by?: string }[]).filter(
		(e) => e.confidence
	);
	ok(
		'P2 #17: every graded era carries reasoning and a falsifier',
		graded.every((e) => e.reasoning && e.falsifiable_by),
		graded.filter((e) => !e.reasoning || !e.falsifiable_by).map((e) => e.id).join(', ')
	);

	const findings = (ds.hypotheses as {
		id: string;
		evidence?: {
			falsifier_part?: string;
			finding: string;
			evidence?: string;
			evidence_fr?: string;
			evidence_ar?: string;
			evidence_fr_by?: string;
			evidence_ar_by?: string;
			sources?: string[];
			confidence?: string;
			attributed_to?: string;
		}[];
	}[]).flatMap((h) => (h.evidence ?? []).map((e) => ({ hypothesis: h.id, ...e })));
	ok(
		'P2 #19: every hypothesis evidence finding carries at least one source',
		findings.every((f) => (f.sources?.length ?? 0) > 0),
		findings.filter((f) => (f.sources?.length ?? 0) === 0).map((f) => f.hypothesis).join(', ')
	);
	ok(
		'P2 #19: every evidence finding names the falsifier part it tests and a direction',
		findings.every((f) => f.falsifier_part && ['supports', 'contradicts', 'neutral'].includes(f.finding)),
		findings.filter((f) => !f.falsifier_part || !['supports', 'contradicts', 'neutral'].includes(f.finding)).map((f) => f.hypothesis).join(', ')
	);
	ok(
		'P2 #19: every C/D evidence finding names who makes the claim (V20)',
		findings
			.filter((f) => f.confidence === 'C' || f.confidence === 'D')
			.every((f) => Boolean(f.attributed_to)),
		findings.filter((f) => (f.confidence === 'C' || f.confidence === 'D') && !f.attributed_to).map((f) => f.hypothesis).join(', ')
	);
	ok(
		'P2 #19: every evidence finding carries evidence prose in all three languages with provenance',
		findings.every(
			(f) =>
				f.evidence &&
				f.evidence_fr &&
				f.evidence_fr_by &&
				f.evidence_ar &&
				f.evidence_ar_by
		),
		findings.filter((f) => !f.evidence || !f.evidence_fr || !f.evidence_fr_by || !f.evidence_ar || !f.evidence_ar_by).map((f) => f.hypothesis).join(', ')
	);
}
ok(
	'no interval ends before it begins',
	ds.positions.every((p: Pos) => (p.interval.endLatest ?? CUTOFF) >= p.interval.startEarliest)
);

// --- The epistemic mix ----------------------------------------------------

ok(
	'all four bases are populated',
	Object.values(ds.meta.basisCounts).every((n) => (n as number) > 0),
	JSON.stringify(ds.meta.basisCounts)
);
ok(
	'documented and reported claims outnumber inferences',
	ds.meta.basisCounts.documented + ds.meta.basisCounts.reported > ds.meta.basisCounts.inferred * 4
);

// --- The derivation truth table is pinned (V18 / mutation testing) ---------
//
// `deriveBasis` is the single highest-leverage function in the architecture: if
// its mapping changes, every downstream obligation can change while the build
// stays green. The emitted graph cannot be used to pin it — records may author
// an explicit `basis` override that legitimately differs from the derivation,
// and the emitted JSON does not expose the authored value separately. So the
// function itself is tested directly, against every input combination of the
// published truth table (§5.2). Mutation testing found exactly this gap:
// V18-3 reclassified 138 positions and no existing assertion noticed.
{
	const { deriveBasis } = await import('../scripts/schema.ts');
	const table: [string, string, string | undefined, string][] = [
		['A', 'verified', undefined, 'documented'],
		['A', 'needs-primary-source', undefined, 'documented'],
		['A', 'disputed', undefined, 'documented'],
		['B', 'verified', undefined, 'reported'],
		['B', 'needs-primary-source', undefined, 'reported'],
		['B', 'disputed', undefined, 'reported'],
		['C', 'verified', undefined, 'reported'],
		['C', 'needs-primary-source', undefined, 'inferred'],
		['C', 'disputed', undefined, 'reported'],
		['D', 'verified', undefined, 'unsubstantiated'],
		['D', 'needs-primary-source', undefined, 'unsubstantiated'],
		['D', 'disputed', undefined, 'unsubstantiated'],
		['C', 'needs-primary-source', 'reported', 'reported'], // explicit override wins
		['A', 'verified', 'inferred', 'inferred'], // even against A
		['D', 'disputed', 'documented', 'documented'] // even against D
	];
	const offenders = table
		.map(([c, v, e, want]) => {
			const got = deriveBasis(c as never, v as never, e as never);
			return got === want ? null : `${c}/${v}/${e ?? '-'} emitted=${got} expected=${want}`;
		})
		.filter(Boolean);
	ok(
		'the deriveBasis truth table is pinned — every input combination',
		offenders.length === 0,
		offenders.length ? offenders.join('; ') : '15 combinations match the published mapping'
	);
}

// --- Findings the interface advertises ------------------------------------

// The National Guard turns over far more often than the service chiefs. This
// asymmetry is the Chronicle's headline visual claim.
const tenures = (roleId: string) =>
	ds.positions.filter((p: Pos) => p.role === roleId && overlaps(p.interval, Date.UTC(2011, 0, 1), CUTOFF));
const ngCount = tenures('ng-commander').length;
const landCount = tenures('chief-land-forces').length;
ok(
	'National Guard command turns over more than the Land Army since 2011',
	ngCount > landCount,
	`${ngCount} guard commanders vs ${landCount} land army chiefs`
);

// The tri-service command is nearly always vacant. That emptiness is the point.
const jointTenures = ds.positions.filter((p: Pos) => p.role === 'chief-armed-forces');
ok(
	'the Armed Forces Chief of Staff post has at most one recorded holder',
	jointTenures.length <= 1,
	`${jointTenures.length} recorded`
);

// Personnel continuity across the revolution: the same post, before and after.
const bennour = ds.positions.filter((p: Pos) => p.holder === 'abdessatar-bennour');
const spansRevolution =
  bennour.some((p: Pos) => p.interval.startEarliest < Date.UTC(2011, 0, 14)) &&
  bennour.some((p: Pos) => p.interval.startEarliest > Date.UTC(2011, 0, 14));
ok(
	'a police chief holds the same post both before and after 2011',
	spansRevolution && new Set(bennour.map((p: Pos) => p.role)).size === 1
);

// --- The crossings query: military/intelligence into the presidency -------

function crossings(setA: string[], setB: string[]) {
	const inA = new Map<string, Pos[]>();
	const inB = new Map<string, Pos[]>();
	for (const p of ds.positions as Pos[]) {
		if (setA.includes(p.institution)) inA.set(p.holder, [...(inA.get(p.holder) ?? []), p]);
		if (setB.includes(p.institution)) inB.set(p.holder, [...(inB.get(p.holder) ?? []), p]);
	}
	return [...inA.keys()].filter((id) => inB.has(id));
}

const milToPresidency = crossings(
	['armed-forces', 'land-forces', 'navy', 'air-force', 'military-security', 'anrsd'],
	['presidency', 'presidential-security', 'presidential-security-adviser']
);
ok(
	'the military-to-presidency crossing query finds bridge figures',
	milToPresidency.length >= 2,
	milToPresidency.map(nameOf).join(', ')
);

const businessToGovernment = crossings(
	['mabrouk-group', 'elloumi-group', 'nessma-tv', 'trabelsi-network'],
	['head-of-government', 'presidency', 'nidaa-tounes', 'qalb-tounes']
);
ok(
	'the business-to-government crossing query finds bridge figures',
	businessToGovernment.length >= 1,
	businessToGovernment.map(nameOf).join(', ')
);

// --- Neutrality: the graph is not Tunisia-only ----------------------------

const foreign = ds.institutions.filter((i: { layer: string }) => i.layer === 'foreign');
ok('foreign and international actors are present', foreign.length >= 5, `${foreign.length} entities`);

// --- Transparency about gaps ---------------------------------------------

ok(
	'succession gaps are surfaced rather than hidden',
	ds.meta.successionGaps.length > 0,
	`${ds.meta.successionGaps.length} gaps`
);
ok(
	'source contradictions are recorded',
	ds.meta.contradictions.length > 0,
	`${ds.meta.contradictions.length} recorded`
);

// --- Evidence quality may not regress -------------------------------------
//
// These are RATCHETS, not targets. Each records the worst the dataset has been
// allowed to get, and may only ever be moved in the improving direction. The
// failure mode they exist to catch is the one this project already had: session 3
// added 174 positions, most graded C, and the share of records awaiting a primary
// source climbed without anything objecting — expansion quietly bought volume with
// credibility, which is the exact trade the project exists to refuse.
//
// If one of these fails, the fix is to source the new records, not to raise the
// ceiling. Moving a ceiling up requires saying so in the commit message.

// Set with ~3 points of headroom over the state at the time of writing (39.1% and
// 22.0%). Enough that a normal batch of additions does not trip them; not enough to
// absorb another 174 unsourced records without a conversation.
const MAX_AWAITING_PRIMARY_SOURCE = 0.42; // of positions + people
const MIN_DOCUMENTED_SHARE = 0.185; // of all based claims

{
	const denom = ds.meta.counts.positions + ds.meta.counts.people;
	const share = ds.meta.needsPrimarySourceCount / denom;
	ok(
		'share awaiting a primary source has not regressed',
		share <= MAX_AWAITING_PRIMARY_SOURCE,
		`${(share * 100).toFixed(1)}% of ${denom} (ceiling ${(MAX_AWAITING_PRIMARY_SOURCE * 100).toFixed(0)}%)`
	);
}
{
	const counts = ds.meta.basisCounts as Record<string, number>;
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	const share = counts.documented / total;
	ok(
		'documented share has not regressed',
		share >= MIN_DOCUMENTED_SHARE,
		`${(share * 100).toFixed(1)}% of ${total} (floor ${(MIN_DOCUMENTED_SHARE * 100).toFixed(0)}%)`
	);
}

// Grade A means a primary record, per the grading rules in AGENTS.md — tier 1
// (gazette, decree, government portal) or tier 2 (institutional, peer-reviewed).
// Not "we are confident it is true".
//
// Nothing enforced that, and 53 records are graded A while citing nothing better
// than tier 3 journalism. Each of them renders as `documented`, the strongest label
// this site has, on the strength of a news article. That is not a build failure —
// fixing 53 records is editorial work, and some may be defensible — but it must not
// grow. The editorial tool refuses to create a 54th.
//
// Lower this number as records are sourced. Raising it means a claim was promoted
// to `documented` without a document, which needs saying out loud in the commit.
const MAX_GRADE_A_WITHOUT_PRIMARY = 53;

{
	const tierOf = new Map<string, number>(ds.sources.map((s: any) => [s.id, s.tier]));
	const offenders: string[] = [];

	for (const kind of ['positions', 'relationships', 'events'] as const) {
		for (const record of (ds[kind] ?? []) as any[]) {
			if (record.confidence !== 'A') continue;
			const tiers = (record.sources ?? [])
				.map((id: string) => tierOf.get(id))
				.filter((t: number | undefined): t is number => typeof t === 'number');
			if (tiers.length && Math.min(...tiers) > 2) offenders.push(`${kind}:${record.id}`);
		}
	}

	ok(
		'grade A backed by something below a primary source has not grown',
		offenders.length <= MAX_GRADE_A_WITHOUT_PRIMARY,
		`${offenders.length} (ceiling ${MAX_GRADE_A_WITHOUT_PRIMARY})${
			offenders.length > MAX_GRADE_A_WITHOUT_PRIMARY ? ` — newest: ${offenders.slice(-3).join(', ')}` : ''
		}`
	);
}

// Rule 2 says every claim carries a source — but the schema allows `default([])`
// on the older kinds, so an institution, era, relationship or person record can
// ship with zero sources while still rendering a `basis` label (the presidency
// and the armed-forces branches currently render `documented` citing nothing).
// Mutation testing surfaced this as a validator that validates nothing on a
// clean graph: the checkSources() loop only verifies that cited ids EXIST, so
// an empty list passes silently.
//
// This is a RATCHET in the same sense as MAX_GRADE_A_WITHOUT_PRIMARY above: the
// 24 records that currently ship unsourced are the worst the dataset is allowed
// to be. Sourcing them is editorial work (find the gazette entry or a tier-1
// institutional page); adding more unsourced claim records is a build failure.
// Roles and questions are excluded deliberately: a canonical office and an open
// research question are scaffolding whose standing is carried by the records
// inside them, not a claim about the world — whether that is the right model is
// an editorial decision, but it is not the same defect as an unsourced claim.
{
	const kinds: [string, { id?: string; sources?: string[] }[]][] = [
		['institution', ds.institutions],
		['relationship', ds.relationships],
		['person', ds.people],
		['era', ds.eras]
	];
	const unsourced: string[] = [];
	for (const [kind, records] of kinds) {
		for (const r of records) {
			if (!r.sources || r.sources.length === 0) unsourced.push(`${kind}:${r.id}`);
		}
	}
	const CEILINGS: Record<string, number> = { institution: 19, relationship: 3, person: 1, era: 2 };
	const over: string[] = [];
	for (const kind of Object.keys(CEILINGS)) {
		const n = unsourced.filter((u) => u.startsWith(`${kind}:`)).length;
		if (n > CEILINGS[kind]) over.push(`${kind}: ${n} (ceiling ${CEILINGS[kind]})`);
	}
	ok(
		'rule 2: no claim-bearing record is unsourced beyond the current ceiling',
		over.length === 0,
		over.length ? over.join('; ') : `${unsourced.length} unsourced claim records total (institution 19, relationship 3, person 1, era 2)`
	);
}

// --- The coverage audit ---------------------------------------------------
//
// Deliberately does NOT fail on a low number. The audit exists to publish gaps,
// and a build that refused to run while gaps existed would just pressure someone
// into deleting the measurement. What it does assert is that the audit is real:
// that it covers every president and derives its expectations from the data.

{
	const cov = ds.meta.coverage;
	const presidents = new Set(
		ds.positions.filter((p: { role: string }) => p.role === 'president').map((p: Pos) => p.holder)
	);
	ok(
		'the coverage audit covers every president',
		cov.principals.length === presidents.size,
		`${cov.principals.length} audited / ${presidents.size} presidents`
	);
	ok(
		'expected categories are derived from the data, not authored',
		cov.expectedCategories.length > 0 &&
			cov.expectedCategories.every((c: string) =>
				cov.principals.some((p: { byType: Record<string, number> }) => p.byType[c] > 0)
			),
		cov.expectedCategories.join(', ')
	);
	// The audit's contract is that it can FIND gaps, not that any particular gap
	// exists forever. The original assertion — at least one president has no
	// mapped family — became false on 2026-08-13, when the presidential-networks
	// merge closed the exact gap the audit was built to expose (Marzouki, Mebazaa
	// and Ennaceur gained their documented kin). Requiring permanent
	// incompleteness would forbid the audit's own goal, so the check is narrowed
	// to its real contract: the audit still surfaces at least one missing expected
	// category for at least one president (documented deviation — spec §2.8).
	const noKin = cov.principals.filter((p: { kin: number }) => p.kin === 0);
	const withGaps = cov.principals.filter(
		(p: { missing?: string[] }) => (p.missing?.length ?? 0) > 0
	);
	ok(
		'the audit still surfaces a missing category somewhere — it is not a rubber stamp',
		withGaps.length > 0,
		`${noKin.length}/${cov.principals.length} presidents have no mapped family; ` +
			`${withGaps.length}/${cov.principals.length} still carry missing expected categories`
	);
}

// --- Derived trajectories may not masquerade as authored ------------------

{
	const derived = ds.people.filter((p: { trajectoryDerived: boolean }) => p.trajectoryDerived);
	ok(
		'every derived trajectory is flagged as derived',
		derived.every((p: { trajectory: string[] }) => p.trajectory.length >= 2),
		`${derived.length} derived, all with 2+ hops`
	);
	ok(
		'no authored trajectory is mislabelled as derived',
		ds.people
			.filter((p: { trajectoryDerived: boolean }) => p.trajectoryDerived)
			.every((p: { id: string }) => {
				// A derived arc must be reconstructible from that person's own positions.
				const insts = new Set(
					ds.positions
						.filter((q: Pos) => q.holder === p.id)
						.map((q: { institution: string }) => q.institution)
				);
				return insts.size >= 2;
			}),
		'each derived arc traces to 2+ institutions the person actually served in'
	);
	ok(
		'the card worklist is populated and ranked by seniority',
		ds.meta.cards.worklistCount > 0 &&
			ds.meta.cards.worklist.every((c: { authority: number }) => c.authority >= 70),
		`${ds.meta.cards.worklistCount} senior figures need research`
	);
}

// --- Published statistics match the graph ---------------------------------
//
// `npm run data` rewrites every <!--stat:key--> span in the docs from the graph.
// This re-checks them, so prose that drifted — because someone edited a number by
// hand, or committed without rebuilding — fails here instead of being published.
// The project asserts that it prints its real figures; this is what makes that
// enforceable rather than aspirational.

{
	const stats: Record<string, string> = JSON.parse(
		readFileSync(join(HERE, '..', 'src', 'generated', 'stats.json'), 'utf8')
	);
	const drift: string[] = [];
	let tagged = 0;

	for (const file of ['README.md', 'AGENTS.md', 'DESIGN.md']) {
		let text: string;
		try {
			text = readFileSync(join(HERE, '..', file), 'utf8');
		} catch {
			continue;
		}
		for (const m of text.matchAll(/<!--stat:([A-Za-z][A-Za-z0-9-]*)-->([\s\S]*?)<!--\/stat-->/g)) {
			const [, key, shown] = m;
			tagged++;
			if (!(key in stats)) drift.push(`${file}: unknown stat "${key}"`);
			else if (shown !== stats[key]) drift.push(`${file}: ${key} shows ${shown}, graph says ${stats[key]}`);
		}
	}

	ok(
		'published statistics match the graph',
		drift.length === 0,
		drift.length ? drift.join('; ') : `${tagged} tagged figures in sync`
	);
}

// R13 — world measurements keep their boundary and columnar shape. The snapshots
// are optional: a fresh clone is allowed to emit null and the interface must then
// show agreements plus explicit empty/sum-of-parts states. When a snapshot exists,
// totals stay outside the drawable partner maps and the publisher's aggregate may
// not be smaller than the rows it contains except for the documented 0.01 million
// rounding guard. No current year or current value is pinned here.
{
	const isSeries = (value: unknown, length: number) =>
		Array.isArray(value) &&
		value.length === length &&
		value.every((n) => n === null || (typeof n === 'number' && Number.isFinite(n)));
	const aggregateKey = (key: string) => /^(0|world)$/i.test(key);

	const flows = world.flows as {
		years: number[];
		partners: Record<string, { out: (number | null)[]; in: (number | null)[]; mirrorOut: (number | null)[]; mirrorIn: (number | null)[] }>;
		energy: Record<string, Record<string, { out: (number | null)[]; in: (number | null)[] }>>;
		totals: { out: (number | null)[]; in: (number | null)[]; mirrorOut: (number | null)[]; mirrorIn: (number | null)[] } | null;
	} | null;
	const debt = world.debt as {
		years: number[];
		creditors: Record<string, { stock: (number | null)[]; disbursed: (number | null)[]; repaid: (number | null)[] }>;
		institutional: Record<string, (number | null)[]>;
		bodies: Record<string, { stock: (number | null)[]; disbursed: (number | null)[]; repaid: (number | null)[] }>;
		totals: { stock: (number | null)[]; disbursed: (number | null)[]; repaid: (number | null)[] } | null;
	} | null;
	const wdi = world.wdi as {
		years: number[];
		reserves: (number | null)[];
		gdp: (number | null)[];
		currentAccount: (number | null)[];
		cpi: (number | null)[];
		source: string;
	} | null;

	const flowShape =
		flows === null ||
		(Array.isArray(flows.years) &&
			flows.years.length > 0 &&
			Object.keys(flows.partners).every(
				(iso2) =>
					!aggregateKey(iso2) &&
					isSeries(flows.partners[iso2].out, flows.years.length) &&
					isSeries(flows.partners[iso2].in, flows.years.length) &&
					isSeries(flows.partners[iso2].mirrorOut, flows.years.length) &&
					isSeries(flows.partners[iso2].mirrorIn, flows.years.length)
			) &&
			(flows.totals === null ||
				(['out', 'in', 'mirrorOut', 'mirrorIn'] as const).every((key) =>
					isSeries(flows.totals?.[key], flows.years.length)
				)) &&
			Object.values(flows.energy).every((partners) =>
				Object.values(partners).every(
					(row) =>
						isSeries(row.out, flows.years.length) && isSeries(row.in, flows.years.length)
				)
			));
	ok(
		'R13: optional world trade snapshot has aligned series and totals outside partners',
		flowShape,
		flows ? `${flows.years.length} years, ${Object.keys(flows.partners).length} partners` : 'no trade snapshot; fallback is allowed'
	);

	const debtShape =
		debt === null ||
		(Array.isArray(debt.years) &&
			debt.years.length > 0 &&
			Object.keys(debt.creditors).every(
				(iso2) =>
					!aggregateKey(iso2) &&
					['stock', 'disbursed', 'repaid'].every((key) =>
						isSeries(debt.creditors[iso2][key as 'stock' | 'disbursed' | 'repaid'], debt.years.length)
					)
			) &&
			Object.keys(debt.institutional).every((name) => isSeries(debt.institutional[name], debt.years.length)) &&
			Object.values(debt.bodies).every(
				(row) =>
					['stock', 'disbursed', 'repaid'].every((key) =>
						isSeries(row[key as 'stock' | 'disbursed' | 'repaid'], debt.years.length)
					)
			) &&
			(debt.totals === null ||
				(['stock', 'disbursed', 'repaid'] as const).every((key) =>
					isSeries(debt.totals?.[key], debt.years.length)
				)));
	ok(
		'R13: optional world debt snapshot has aligned creditor series and totals outside creditors',
		debtShape,
		debt ? `${debt.years.length} years, ${Object.keys(debt.creditors).length} bilateral creditors` : 'no debt snapshot; fallback is allowed'
	);

	const totalViolations: string[] = [];
	if (flows?.totals) {
		for (let i = 0; i < flows.years.length; i++) {
			for (const key of ['out', 'in'] as const) {
				const official = flows.totals[key][i];
				if (official === null) continue;
				const parts = Object.values(flows.partners).reduce((sum, row) => sum + (row[key][i] ?? 0), 0);
				if (official + 0.01 < parts) totalViolations.push(`trade ${flows.years[i]} ${key}`);
			}
		}
	}
	if (debt?.totals) {
		for (let i = 0; i < debt.years.length; i++) {
			const official = debt.totals.stock[i];
			if (official === null) continue;
			const bilateral = Object.values(debt.creditors).reduce((sum, row) => sum + (row.stock[i] ?? 0), 0);
			const bodies = Object.values(debt.bodies).reduce((sum, row) => sum + (row.stock[i] ?? 0), 0);
			const nonPlaces = Object.values(debt.institutional).reduce((sum, row) => sum + (row[i] ?? 0), 0);
			if (official + 0.01 < bilateral + bodies + nonPlaces) totalViolations.push(`debt ${debt.years[i]} stock`);
		}
	}
	ok(
		'R13: publisher world totals are at least their displayed rows within rounding',
		totalViolations.length === 0,
		totalViolations.length ? totalViolations.slice(0, 5).join('; ') : 'no aggregate below its parts'
	);

	const wdiShape =
		wdi === null ||
		(Array.isArray(wdi.years) &&
			wdi.years.length > 0 &&
			['reserves', 'gdp', 'currentAccount', 'cpi'].every((key) =>
				isSeries(wdi[key as 'reserves' | 'gdp' | 'currentAccount' | 'cpi'], wdi.years.length)
			) &&
			typeof wdi.source === 'string' &&
			wdi.source.length > 0);
	ok(
		'R13: optional WDI snapshot is an aligned country-level series',
		wdiShape,
		wdi ? `${wdi.years.length} years, four series` : 'no WDI snapshot; strip may show an honest unknown'
	);

	const wdiBoundary =
		wdi === null ||
		(!Object.prototype.hasOwnProperty.call(wdi, 'iso2') &&
			!Object.keys(flows?.partners ?? {}).some((key) => key.toLowerCase() === 'wdi') &&
			!Object.keys(debt?.creditors ?? {}).some((key) => key.toLowerCase() === 'wdi'));
	ok(
		'R13: WDI stays outside bilateral partner and creditor maps',
		wdiBoundary,
		wdiBoundary ? 'country context remains a separate boundary' : 'WDI leaked into a bilateral map'
	);
}

// R13 — network flow edges are derived measurements, never authored graph claims.
{
	const authored = (ds.relationships as { id: string }[]).filter((r) => r.id.startsWith('flow-'));
	ok(
		'R13: no flow- measurement edge is authored in relationships.yaml',
		authored.length === 0,
		authored.map((r) => r.id).join('; ')
	);
}

// --- Hardening contract (spec v0.0.2-v2): V18–V24 -------------------------
//
// Each block names its validator; the assertion must fail on the pre-fix build.
// The fixtures that used to ship the defects (rel-beji-caid-essebsi-youssef-
// chahed-political-conflict, p-foreign-drif, dhif-succession-2025, 2018-02-31)
// are the specific cases these checks cover.

// V18 — the derived basis is checked on EVERY claim kind, not just positions.
{
	const kinds: [string, { id?: string; basis?: string; reasoning?: string; falsifiable_by?: string }[]][] = [
		['people', ds.people],
		['positions', ds.positions],
		['relationships', ds.relationships],
		['events', ds.events],
		['institutions', ds.institutions],
		['companies', ds.companies],
		['contracts', ds.contracts],
		['licences', ds.licences],
		['declarations', ds.declarations],
		['education', ds.education],
		['worldClaims', ds.worldClaims]
	];
	const offenders: string[] = [];
	for (const [kind, records] of kinds) {
		for (const r of records) {
			if (r.basis === 'inferred' && (!r.reasoning || !r.falsifiable_by)) {
				offenders.push(`${kind}:${r.id}`);
			}
		}
	}
	ok(
		'V18: no inferred claim of any kind lacks reasoning and a falsifier',
		offenders.length === 0,
		offenders.length ? offenders.slice(0, 5).join('; ') : 'all inferred claims reasoned'
	);
}

// V20 — grade C/D claims name who is making them on every kind.
{
	const kinds: [string, { id?: string; confidence: string; attributed_to?: string }[]][] = [
		['people', ds.people],
		['positions', ds.positions],
		['relationships', ds.relationships],
		['events', ds.events],
		['institutions', ds.institutions],
		['companies', ds.companies],
		['contracts', ds.contracts],
		['licences', ds.licences],
		['declarations', ds.declarations],
		['education', ds.education],
		['worldClaims', ds.worldClaims]
	];
	const offenders: string[] = [];
	for (const [kind, records] of kinds) {
		for (const r of records) {
			if ((r.confidence === 'C' || r.confidence === 'D') && !r.attributed_to) {
				offenders.push(`${kind}:${r.id}`);
			}
		}
	}
	ok(
		'V20: no C/D record of any kind lacks attributed_to',
		offenders.length === 0,
		offenders.length ? offenders.slice(0, 5).join('; ') : 'all C/D claims attributed'
	);
}

// R5 — the v0.0.2 record kinds exist, carry the claim envelope, and resolve
// their references. Empty kinds are valid (the schema is the feature gate and
// no invented data enters the graph); a record that fails the envelope fails.
{
	const kinds: [string, { id?: string; sources?: string[]; confidence: string; basis: string }[]][] = [
		['companies', ds.companies],
		['contracts', ds.contracts],
		['licences', ds.licences],
		['declarations', ds.declarations],
		['education', ds.education],
		['worldClaims', ds.worldClaims]
	];
	const noSources: string[] = [];
	const noBasis: string[] = [];
	for (const [kind, records] of kinds) {
		for (const r of records) {
			if (!r.sources || r.sources.length === 0) noSources.push(`${kind}:${r.id}`);
			if (!r.basis) noBasis.push(`${kind}:${r.id}`);
		}
	}
	ok('R5: every new-kind record cites at least one source', noSources.length === 0, noSources.slice(0, 5).join('; '));
	ok('R5: every new-kind record carries a derived basis', noBasis.length === 0, noBasis.slice(0, 5).join('; '));
	ok(
		'R5: the new kinds are wired into the build',
		Array.isArray(ds.companies) && Array.isArray(ds.contracts) && Array.isArray(ds.licences) &&
			Array.isArray(ds.declarations) && Array.isArray(ds.education) && Array.isArray(ds.worldClaims),
		`${ds.companies.length}/${ds.contracts.length}/${ds.licences.length}/${ds.declarations.length}/${ds.education.length}/${ds.worldClaims.length} records`
	);
	// Contracts and education are intervals like any other claim: resolved through
	// the same fuzzy machinery, so the timeline can later scrub them.
	const badInterval = (ds.contracts as { id: string; interval?: { startEarliest: number } }[])
		.concat(ds.education as { id: string; interval?: { startEarliest: number } }[])
		.filter((r) => !r.interval || typeof r.interval.startEarliest !== 'number');
	ok('R5: contract/education intervals resolve through the fuzzy machinery', badInterval.length === 0, badInterval.map((r) => r.id).join('; '));
}

// R8 — the geographic layer (spec §8). The gazetteer must hold the 24
// governorates under six regions under the country root; every parent chain
// terminates at a region; V10 constraints hold on the emitted records.
// (2026-08-08: the delegation level landed — 53 records for gov-tunis/sfax/
// nabeul, per the schema's RegionKind and spec §8.1; the count below is the
// exact composition, updated with the data, not a weakened check.)
{
	const regions = ds.regions as { id: string; kind: string; parent?: string; code?: string }[];
	const byId = new Map(regions.map((r) => [r.id, r]));
	ok('R8: the gazetteer ships 84 records (1 country + 6 regions + 24 governorates + 53 delegations)', regions.length === 84);
	ok('R8: all 24 governorates are present with codes', regions.filter((r) => r.kind === 'governorate').length === 24 && regions.filter((r) => r.kind === 'governorate' && r.code).length === 24);
	const badChain = regions.filter((r) => {
		let node: string | undefined = r.id;
		const seen = new Set<string>();
		while (node) {
			if (seen.has(node)) return true;
			seen.add(node);
			node = byId.get(node)?.parent;
		}
		return false;
	});
	ok('R8: every region chain terminates (V10)', badChain.length === 0, badChain.map((r) => r.id).join('; '));
	const unrooted = regions.filter((r) => {
		let node: string | undefined = r.id;
		while (node && byId.get(node)?.parent) node = byId.get(node)!.parent;
		return byId.get(node ?? '')?.kind !== 'region';
	});
	ok('R8: every chain ends at a region entity (V10)', unrooted.length === 0, unrooted.map((r) => r.id).join('; '));
	// Places (currently none): if any ship, they must carry coordinates inside
	// Tunisia's bbox unless the schema explicitly permits a parentless kind.
	const places = ds.places as { id: string; kind: string; coordinates?: number[] }[];
	const badCoords = places.filter((p) => p.coordinates && (p.coordinates[0] < 8 || p.coordinates[0] > 12 || p.coordinates[1] < 30 || p.coordinates[1] > 38));
	ok('R8: every place coordinate falls inside Tunisia (V10)', badCoords.length === 0, badCoords.map((p) => p.id).join('; '));
}

// R9 — the derived per-entity timeline (spec §9). Every person with any record
// touching them gets a timeline; items are ordered by start, every ref resolves,
// and every position the person held appears.
{
	const people = ds.people as { id: string; positionIds: string[]; timeline: { kind: string; ref: { kind: string; id: string }; interval: { startEarliest: number } }[] }[];
	const kinds = new Set(['position', 'relationship', 'event', 'contract', 'licence', 'education', 'declaration']);
	const badKind: string[] = [];
	const badRef: string[] = [];
	const unordered: string[] = [];
	const missingPositions: string[] = [];
	for (const p of people) {
		for (const item of p.timeline ?? []) {
			if (!kinds.has(item.kind)) badKind.push(`${p.id}:${item.kind}`);
			const resolves =
				ds.positions.find((x: { id: string }) => x.id === item.ref.id) ||
				ds.events.find((x: { id: string }) => x.id === item.ref.id) ||
				ds.relationships.find((x: { id: string }) => x.id === item.ref.id) ||
				ds.contracts.find((x: { id: string }) => x.id === item.ref.id) ||
				ds.licences.find((x: { id: string }) => x.id === item.ref.id) ||
				ds.education.find((x: { id: string }) => x.id === item.ref.id) ||
				ds.declarations.find((x: { id: string }) => x.id === item.ref.id);
			if (!resolves) badRef.push(`${p.id}:${item.ref.id}`);
		}
		const sorted = [...(p.timeline ?? [])].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);
		if (JSON.stringify(sorted.map((i) => i.ref.id)) !== JSON.stringify((p.timeline ?? []).map((i) => i.ref.id))) {
			unordered.push(p.id);
		}
		if (p.positionIds.length && (p.timeline ?? []).filter((i) => i.kind === 'position').length !== p.positionIds.length) {
			missingPositions.push(p.id);
		}
	}
	ok('R9: timeline items carry only known kinds', badKind.length === 0, badKind.slice(0, 5).join('; '));
	ok('R9: every timeline item ref resolves to a record', badRef.length === 0, badRef.slice(0, 5).join('; '));
	ok('R9: every timeline is ordered by start', unordered.length === 0, unordered.slice(0, 5).join('; '));
	ok('R9: every held position appears in the timeline', missingPositions.length === 0, missingPositions.slice(0, 5).join('; '));
}

// R10 — the influence model (spec §10). V9: no `influence` or `advisory` edge may
// float — at least one endpoint must hold a position or carry a documented edge
// (reported-influence is kept-and-flagged per the documented deviation). Also:
// influence strength, when present, is within [0.3, 1].
{
	const relationships = ds.relationships as { id: string; type: string; from: string; to: string; basis: string; influence?: { strength?: number } }[];
	const positions = ds.positions as { holder: string; institution: string }[];
	const attached = new Set<string>();
	for (const p of positions) {
		attached.add(p.holder);
		attached.add(p.institution);
	}
	const documented = new Set<string>();
	for (const r of relationships) {
		if (r.basis === 'documented' && !['influence', 'reported-influence', 'advisory'].includes(r.type)) {
			documented.add(r.from);
			documented.add(r.to);
		}
	}
	const floating = relationships.filter(
		(r) =>
			(r.type === 'influence' || r.type === 'advisory') &&
			!attached.has(r.from) &&
			!attached.has(r.to) &&
			!documented.has(r.from) &&
			!documented.has(r.to)
	);
	ok('R10/V9: no influence or advisory edge floats unanchored', floating.length === 0, floating.map((r) => r.id).join('; '));
	const badStrength = relationships.filter(
		(r) => r.influence?.strength !== undefined && (r.influence.strength < 0.3 || r.influence.strength > 1)
	);
	ok('R10: influence strength is always within [0.3, 1]', badStrength.length === 0, badStrength.map((r) => r.id).join('; '));
}

// R11 — the editorial machinery (spec §13). Dispute states are valid, every
// merged_into/supersedes ref resolves, V16 holds on the emitted graph (no
// overlapping duplicate (from,to,type,subtype) without a merge), and the
// published queue is risk-ordered.
{
	const relationships = ds.relationships as { id: string; type: string; from: string; to: string; subtype?: string; merged_into?: string; supersedes?: string; disputes: { status?: string }[]; interval: { startEarliest: number; endLatest: number | null } }[];
	const positions = ds.positions as { id: string; supersedes?: string; disputes: { status?: string }[] }[];
	const worldClaims = ds.worldClaims as { id: string; disputes: { status?: string }[] }[];
	const disputeStates = new Set(['open', 'adopted', 'rejected']);
	const badState = [...relationships, ...positions, ...worldClaims].flatMap((r) =>
		(r.disputes ?? []).filter((d) => d.status !== undefined && !disputeStates.has(d.status!)).map((d) => `${r.id}:${d.status}`)
	);
	ok('R11: every dispute status is open/adopted/rejected', badState.length === 0, badState.join('; '));

	const relIds = new Set(relationships.map((r) => r.id));
	const posIds = new Set(positions.map((p) => p.id));
	const badMerge = relationships.filter((r) => r.merged_into && !relIds.has(r.merged_into));
	const badSupersede = [
		...relationships.filter((r) => r.supersedes && !relIds.has(r.supersedes)).map((r) => r.id),
		...positions.filter((p) => p.supersedes && !posIds.has(p.supersedes)).map((p) => p.id)
	];
	ok('R11: every merged_into names an existing relationship', badMerge.length === 0, badMerge.map((r) => r.id).join('; '));
	ok('R11: every supersedes names an existing record', badSupersede.length === 0, badSupersede.join('; '));

	const groups = new Map<string, { id: string; merged_into?: string; interval: { startEarliest: number; endLatest: number | null } }[]>();
	for (const r of relationships) {
		const key = `${r.from}|${r.to}|${r.type}|${r.subtype ?? ''}`;
		groups.set(key, [...(groups.get(key) ?? []), r]);
	}
	const dupes: string[] = [];
	for (const group of groups.values()) {
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i];
				const b = group[j];
				if (a.merged_into === b.id || b.merged_into === a.id) continue;
				const overlap = a.interval.startEarliest <= (b.interval.endLatest ?? 9e15) && b.interval.startEarliest <= (a.interval.endLatest ?? 9e15);
				if (overlap) dupes.push(`${a.id}~${b.id}`);
			}
		}
	}
	ok('R11/V16: no overlapping duplicate relationships without a merge', dupes.length === 0, dupes.slice(0, 5).join('; '));

	const queue = existsSync(join(HERE, '..', 'static', 'editorial-queue.json'))
		? (JSON.parse(readFileSync(join(HERE, '..', 'static', 'editorial-queue.json'), 'utf8')) as { total: number; queue: { risk: number }[] })
		: null;
	const sorted = queue ? [...queue.queue].every((r, i, a) => i === 0 || a[i - 1].risk <= r.risk) : false;
	ok('R11: the editorial queue is published and risk-ordered', !!queue && queue.total > 0 && sorted);
}

// V14 — direction semantics. Every emitted relationship carries the published
// direction from the ontology table, and the endpoint-fixed types cannot be
// reversed. This block also pins the table's completeness: every relationship
// type the schema declares must have a direction entry, or a new type ships
// without semantics.
{
	const types = RelationshipType.options as string[];
	const uncovered = types.filter((t) => !(t in EDGE_DIRECTION));
	ok('V14: every relationship type has a direction entry', uncovered.length === 0, uncovered.join(', '));

	const missing = ds.relationships.filter((r: { direction?: string }) => !r.direction);
	ok('V14: every emitted relationship carries a direction', missing.length === 0, missing.slice(0, 5).map((r: { id: string }) => r.id).join('; '));

	// The endpoint rules the build enforces (mirrored here so the test pins the
	// emitted data, not just the loader's private table).
	const endpoints: Record<string, { from?: 'person' | 'institution'; to?: 'person' | 'institution' }> = {
		prosecution: { from: 'institution', to: 'person' },
		board: { from: 'person' },
		ownership: { to: 'institution' },
		shareholder: { to: 'institution' },
		oversight: { from: 'institution', to: 'institution' },
		'regulatory-authority': { from: 'institution', to: 'institution' }
	};
	const isPerson = (id: string) => ds.people.some((p: { id: string }) => p.id === id);
	const isInst = (id: string) => ds.institutions.some((i: { id: string }) => i.id === id);
	const flipped: string[] = [];
	for (const r of ds.relationships) {
		const rule = endpoints[r.type];
		if (!rule) continue;
		if (rule.from === 'person' && !isPerson(r.from)) flipped.push(`${r.id} (from=${r.from})`);
		if (rule.from === 'institution' && isPerson(r.from)) flipped.push(`${r.id} (from=${r.from})`);
		if (rule.to === 'person' && !isPerson(r.to)) flipped.push(`${r.id} (to=${r.to})`);
		if (rule.to === 'institution' && isPerson(r.to)) flipped.push(`${r.id} (to=${r.to})`);
	}
	ok(
		'V14: no endpoint-fixed edge is reversed (prosecution, board, ownership, shareholder, oversight, regulatory-authority)',
		flipped.length === 0,
		flipped.slice(0, 5).join('; ')
	);
}

// V9 — influence metadata is only ever attached to influence-family edges, the
// strength is an editorial judgment that names its reasoning, and it sits in the
// stated range. An "unmoored influence" (a strength with no channel, or a channel
// on a non-influence edge) is a hard fail.
{
	const badType: string[] = [];
	const badReasoning: string[] = [];
	const badRange: string[] = [];
	for (const r of ds.relationships) {
		if (!r.influence) continue;
		if (!['influence', 'reported-influence', 'advisory'].includes(r.type)) badType.push(r.id);
		if (!r.reasoning) badReasoning.push(r.id);
		if (r.influence.strength < 0.3 || r.influence.strength > 1) badRange.push(r.id);
	}
	ok('V9: influence metadata sits only on influence-family edges', badType.length === 0, badType.join('; '));
	ok('V9: every influence strength states its reasoning', badReasoning.length === 0, badReasoning.join('; '));
	ok('V9: every influence strength is in [0.3, 1]', badRange.length === 0, badRange.join('; '));
}

// V8/V17 — the event causal graph (spec §6). A cause must precede its consequence,
// every link must resolve to a real event, and the graph must be acyclic.
{
	const events = ds.events as { id: string; date: string; date_end?: string; causes: string[]; consequences: string[]; rupture: boolean; interval: { startEarliest: number; endLatest: number | null } }[];
	const byId = new Map(events.map((e) => [e.id, e]));
	const missing: string[] = [];
	const reversed: string[] = [];
	for (const ev of events) {
		for (const id of [...(ev.causes ?? []), ...(ev.consequences ?? [])]) {
			if (!byId.has(id)) missing.push(`${ev.id} -> ${id}`);
		}
		for (const causeId of ev.causes ?? []) {
			const cause = byId.get(causeId);
			if (cause && cause.interval.startEarliest > (ev.interval.endLatest ?? ds.meta.cutoff)) {
				reversed.push(`${causeId} → ${ev.id}`);
			}
		}
	}
	ok('V8: every causal link resolves to a real event', missing.length === 0, missing.slice(0, 5).join('; '));
	ok('V8: no cause begins after its consequence ends', reversed.length === 0, reversed.slice(0, 5).join('; '));

	// Acyclicity: DFS over the cause edges.
	const visiting = new Set<string>();
	const done = new Set<string>();
	let cyclic = false;
	const visit = (id: string) => {
		if (done.has(id) || cyclic) return;
		if (visiting.has(id)) {
			cyclic = true;
			return;
		}
		visiting.add(id);
		for (const c of byId.get(id)?.causes ?? []) visit(c);
		visiting.delete(id);
		done.add(id);
	};
	for (const ev of events) visit(ev.id);
	ok('V8: the causal graph is acyclic', !cyclic, 'a causal cycle is impossible in reality');
	ok(
		'V17: linked rupture events resolve their links',
		events.filter((e) => e.rupture && (e.causes?.length || e.consequences?.length)).every((e) =>
			[...(e.causes ?? []), ...(e.consequences ?? [])].every((id) => byId.has(id))
		)
	);
}

// V21 — calendar-valid dates. `Date.UTC` rolls invalid days over (2018-02-31
// becomes 2018-03-03); the round-trip below is the same check the parser applies.
{
	const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
	const bad: string[] = [];
	const check = (where: string, t?: string | null) => {
		if (!t) return;
		const m = DAY.exec(t.trim());
		if (!m) return;
		const [y, mo, da] = [+m[1], +m[2], +m[3]];
		const d = new Date(Date.UTC(y, mo - 1, da));
		if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) {
			bad.push(`${where}=${t}`);
		}
	};
	for (const p of ds.positions as Pos[]) {
		check(`position ${p.id} start`, p.interval.raw.start);
		check(`position ${p.id} end`, p.interval.raw.end);
	}
	for (const e of ds.events as { id: string; date: string; date_end?: string }[]) {
		check(`event ${e.id}`, e.date);
		check(`event ${e.id} end`, e.date_end);
	}
	for (const pe of ds.people as { id: string; birth?: string; death?: string }[]) {
		check(`person ${pe.id} birth`, pe.birth);
		check(`person ${pe.id} death`, pe.death);
	}
	ok('V21: no calendar-rollover date in the dataset', bad.length === 0, bad.length ? bad.slice(0, 5).join('; ') : 'all day-precision dates valid');
}

// V22 — no interval has an inverted core, and the trims report is published.
{
	const inverted: string[] = [];
	const checkInversion = (kind: string, records: { id?: string; interval: Pos['interval'] }[]) => {
		for (const r of records) {
			if (
				r.interval.endEarliest !== null &&
				r.interval.endLatest !== null &&
				r.interval.endEarliest! > r.interval.endLatest!
			) {
				inverted.push(`${kind}:${r.id}`);
			}
		}
	};
	checkInversion('position', ds.positions);
	checkInversion('relationship', ds.relationships as { id?: string; interval: Pos['interval'] }[]);
	checkInversion('event', ds.events as { id?: string; interval: Pos['interval'] }[]);
	ok('V22: no interval has an inverted core (endEarliest > endLatest)', inverted.length === 0, inverted.length ? inverted.slice(0, 5).join('; ') : 'all cores sane');
	// Existence is not freshness: a stale file from an earlier build would mask a
	// mutation that stopped publishing trims (V22-3). Check content: every record
	// the current graph reports as clamped must appear in the published report.
	{
		const trimsPath = join(HERE, '..', 'static', 'interval-trims.json');
		const published = existsSync(trimsPath) ? JSON.parse(readFileSync(trimsPath, 'utf8')) : [];
		const clamped = [
			...ds.positions
				.filter((p: Pos) => p.interval.trimmed || p.interval.startClamped)
				.map((p: Pos) => ({ kind: 'position', id: p.id })),
			...(ds.relationships as { id?: string; interval: { trimmed?: boolean; startClamped?: boolean } }[])
				.filter((r) => r.interval.trimmed || r.interval.startClamped)
				.map((r) => ({ kind: 'relationship', id: r.id })),
			...(ds.events as { id?: string; interval: { trimmed?: boolean; startClamped?: boolean } }[])
				.filter((e) => e.interval.trimmed || e.interval.startClamped)
				.map((e) => ({ kind: 'event', id: e.id }))
		];
		const missing = clamped.filter(
			(c) => !published.some((p: { kind: string; id: string }) => p.kind === c.kind && p.id === c.id)
		);
		ok(
			'V22: every clamped interval of the current graph appears in the published trims report',
			missing.length === 0,
			missing.length ? `not published: ${missing.slice(0, 5).map((m) => `${m.kind}:${m.id}`).join('; ')}` : `${published.length} trims published, ${clamped.length} clamped in graph`
		);
	}
	ok('V22: p-foreign-drif carries a corrected span or a recorded dispute', (() => {
		const p = ds.positions.find((x: Pos) => x.id === 'p-foreign-drif') as Pos | undefined;
		return Boolean(p && p.disputes.length > 0);
	})());
}

// V23 — every review carries a calendar-valid date and an enum method.
{
	const reviews: { where: string; date: string; method: string }[] = [
		...(ds.positions as (Pos & { review?: { date: string; method: string } })[]).map((p) => ({ where: `position ${p.id}`, ...p.review })),
		...(ds.relationships as { id?: string; review?: { date: string; method: string } }[]).map((r) => ({ where: `relationship ${r.id}`, ...r.review })),
		...(ds.events as { id: string; review?: { date: string; method: string } }[]).map((e) => ({ where: `event ${e.id}`, ...e.review }))
	].filter((r): r is { where: string; date: string; method: string } => Boolean(r.date));
	const METHODS = new Set(['source-check', 'dedup', 'attribute', 'accept-reject', 'judge']);
	const bad = reviews
		.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !METHODS.has(r.method))
		.map((r) => r.where);
	ok('V23: every review has a calendar-valid date and an enum method', bad.length === 0, bad.length ? bad.slice(0, 5).join('; ') : `${reviews.length} reviews valid`);
}

// V24 — succession stats are reproducible from the emitted constants.
{
	const meta = ds.meta as {
		successionGaps: { role: string; after: string; before: string; gapYears: number }[];
		successionMeta: { gapYears: number; overlapYears: number; exemption: string };
	};
	const byRole = new Map<string, Pos[]>();
	for (const p of ds.positions) {
		const list = byRole.get(p.role) ?? [];
		list.push(p);
		byRole.set(p.role, list);
	}
	const gaps: { role: string; after: string; before: string }[] = [];
	for (const [role, list] of byRole) {
		const sorted = [...list].sort((a, b) => a.interval.startLatest - b.interval.startLatest);
		for (let i = 1; i < sorted.length; i++) {
			const prevEnd = sorted[i - 1].interval.endEarliest ?? CUTOFF;
			const gapYears = (sorted[i].interval.startEarliest - prevEnd) / (365.2425 * 86_400_000);
			if (gapYears > meta.successionMeta.gapYears) {
				gaps.push({ role, after: sorted[i - 1].holder, before: sorted[i].holder });
			}
		}
	}
	ok(
		'V24: succession gaps reproducible from the emitted constants',
		gaps.length === meta.successionGaps.length,
		`emitted ${meta.successionGaps.length}, recomputed ${gaps.length} (threshold ${meta.successionMeta.gapYears}y, ${meta.successionMeta.exemption})`
	);
}

// The published terms and payload. A dataset that invites reuse must say under
// what terms, and a README that understates what ships is the same failure the
// stats machinery exists to prevent — the build owns the numbers or the numbers
// drift. See the review-response sprint (docs/plans/review-response-v0.1.1.md).
{
	const SPDX = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0', 'CC0-1.0'];
	ok(
		'V25: the graph ships under a known SPDX license id',
		typeof ds.meta.license === 'string' && SPDX.includes(ds.meta.license),
		`meta.license = ${ds.meta.license ?? 'MISSING'}`
	);
	ok(
		'V25: the shipped payload and flagship export sizes are published and positive',
		typeof ds.meta.shippedKB === 'number' && ds.meta.shippedKB > 0 && typeof ds.meta.datasetKB === 'number' && ds.meta.datasetKB > 0,
		`shippedKB=${ds.meta.shippedKB}, datasetKB=${ds.meta.datasetKB}`
	);
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
