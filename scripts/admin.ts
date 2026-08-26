/**
 * Local editorial tool.
 *
 *   npm run admin        →  http://127.0.0.1:5199
 *
 * Phase 1 of docs/community-sprint.md: ordinary graph maintenance should not
 * require a coding agent. This is the smallest thing that achieves that.
 *
 * WHY IT IS LOCAL, AND WHY THAT IS THE WHOLE SECURITY MODEL
 *
 * The sprint assumed the admin panel would run on a server, which implied
 * accounts, sessions, a GitHub App with commit rights, and a set of credentials
 * that can leak. None of that is needed to edit files on the operator's own
 * machine. This binds to 127.0.0.1, so it is reachable only from this computer,
 * and it writes data/*.yaml directly — the operator commits with git exactly as
 * before, which means git remains the revision history with no new machinery.
 *
 * A login form here would be security theatre: anyone who can reach this port can
 * already edit the files with a text editor. Authentication becomes real when the
 * panel is remote and multi-user, and that is when to build it — not before.
 *
 * For the same reason there is no separate audit log. Git already records who
 * changed what, when, and why. A parallel log would be a second copy of the truth
 * that can disagree with the first. `review.by` carries the attribution that git
 * cannot infer.
 *
 * WHAT IT DOES FIRST
 *
 * The review queue, because HANDOFF.md names it the highest-value work available:
 * the records most capable of harming a named person — the unsubstantiated ones,
 * then those carrying attributed_to, then the inferences — have had no second pair
 * of eyes, while every review to date landed on the best-evidenced records. This
 * orders the queue by that risk and makes recording a review one action.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { resolveInterval } from './dates.ts';
import { z } from 'zod';
import { applyEdit, EmitError, type Target } from './emit.ts';
import {
	PositionSchema,
	RelationshipSchema,
	EventSchema,
	SourceSchema,
	reviewOverclaims
} from './schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 5199;

/** Only these three carry `review:` in the schema. They also carry `sources:`. */
const REVIEWABLE = {
	positions: { file: 'positions.yaml', schema: PositionSchema },
	relationships: { file: 'relationships.yaml', schema: RelationshipSchema },
	events: { file: 'events.yaml', schema: EventSchema }
} as const;
type Kind = keyof typeof REVIEWABLE;

const SOURCES_FILE = 'sources.yaml';

/**
 * Grade A means a primary record, per the grading rules in AGENTS.md — not
 * "we are confident". Tiers 1 and 2 are the primary and institutional ones.
 *
 * Nothing in the build enforces this today, and 53 records are already graded A
 * while citing nothing better than tier 3. The tool will not add a 54th: it can
 * refuse a bad upgrade without touching what is already there, which is the only
 * intervention available that is both safe and immediate. test-data.ts carries a
 * ratchet so the existing 53 can only shrink.
 */
const PRIMARY_TIERS = [1, 2];

/**
 * Risk order, copied deliberately from build-data.ts rather than imported.
 *
 * If the two ever diverge, the queue would order by one definition while the
 * published coverage table reports another — so test-emit.ts asserts they agree.
 */
const RISK = ['unsubstantiated', 'attributed', 'inferred', 'reported', 'documented'] as const;
type Risk = (typeof RISK)[number];

export function riskOf(r: { basis?: string; attributed_to?: string }): Risk {
	if (r.basis === 'unsubstantiated') return 'unsubstantiated';
	if (r.attributed_to) return 'attributed';
	if (r.basis === 'inferred') return 'inferred';
	if (r.basis === 'documented') return 'documented';
	return 'reported';
}

const dataPath = (file: string) => join(ROOT, 'data', file);
const readData = (file: string) => readFileSync(dataPath(file), 'utf8');

interface QueueItem {
	kind: Kind;
	id: string;
	label: string;
	risk: Risk;
	basis?: string;
	attributed_to?: string;
	sources: string[];
	reviewed: boolean;
	/**
	 * How to find this record in its YAML file.
	 *
	 * Every reviewable record carries a real id since relationships were migrated in
	 * July 2026, so this is always an id target. It stays a `Target` rather than a
	 * bare string because the emitter also supports positional targeting, which is
	 * what any future unkeyed file would need.
	 */
	target: Target;
}

function loadQueue(): { items: QueueItem[]; coverage: Record<Risk, { reviewed: number; total: number }> } {
	const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));

	const label = (kind: Kind, r: any): string => {
		if (kind === 'positions') return `${r.roleTitle ?? r.role} — ${r.holder}`;
		if (kind === 'relationships') return `${r.from} → ${r.to} (${r.type})`;
		return r.title ?? r.id;
	};

	const items: QueueItem[] = [];
	const coverage = Object.fromEntries(RISK.map((k) => [k, { reviewed: 0, total: 0 }])) as Record<
		Risk,
		{ reviewed: number; total: number }
	>;

	for (const kind of Object.keys(REVIEWABLE) as Kind[]) {
		for (const record of (ds[kind] ?? []) as any[]) {
			const risk = riskOf(record);
			const reviewed = Boolean(record.review);
			coverage[risk].total++;
			if (reviewed) coverage[risk].reviewed++;

			const target: Target = { id: record.id };

			items.push({
				kind,
				id: record.id,
				target,
				label: label(kind, record),
				risk,
				basis: record.basis,
				attributed_to: record.attributed_to,
				sources: record.sources ?? [],
				reviewed
			});
		}
	}

	// Unreviewed first, then by risk. The point of the tool is what is missing.
	items.sort((a, b) => {
		if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1;
		return RISK.indexOf(a.risk) - RISK.indexOf(b.risk);
	});

	return { items, coverage };
}

/**
 * Apply a review block, validate, write.
 *
 * Validation runs against the file's own schema before anything reaches disk. It
 * does not replace `npm run data`, which additionally resolves dates and checks
 * cross-file references — the caller is told to run it.
 */
function recordReview(kind: Kind, target: Target, review: { by: string; date: string; method?: string }) {
	const { file, schema } = REVIEWABLE[kind];
	const source = readData(file);

	const entries: Record<string, string> = { by: review.by, date: review.date };
	if (review.method?.trim()) entries.method = review.method.trim();

	const { text, splice } = applyEdit(source, { op: 'add-block', target, field: 'review', entries });

	const parsed = z.array(schema).safeParse(parseYaml(text));
	if (!parsed.success) {
		throw new EmitError(`edit fails the schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
	}

	writeFileSync(dataPath(file), text, 'utf8');
	return { file, added: splice.text.trim() };
}

/**
 * A review that overstates what it verified is worse than no review: it converts
 * an unknown into a false certainty, and consumes the budget that would have
 * caught it. The predicate is imported from schema.ts so this warning and the
 * build's hard failure cannot disagree.
 */
function gazetteWarning(method: string, sources: string[]): string | null {
	if (!reviewOverclaims(method, sources)) return null;
	return 'This review claims a gazette check but the record cites no gazette source. The build will reject it — cite the decree, or say plainly what you actually checked.';
}

// ---------------------------------------------------------------------------
// Editing an existing record
// ---------------------------------------------------------------------------

/**
 * Fields this tool will change on an existing record, and nothing else.
 *
 * Deliberately short. Dates are the timeline's backbone and the thing most often
 * wrong; grade and verification are what the sourcing work moves. Prose, ids and
 * cross-references are absent — changing an id silently breaks every reference to
 * the record, and there is no reason to make that a two-click action.
 */
const EDITABLE: Record<Kind, string[]> = {
	positions: ['start', 'end', 'confidence', 'verification', 'acting'],
	relationships: ['start', 'end', 'confidence', 'verification'],
	events: ['date', 'confidence', 'verification']
};

function editField(kind: Kind, id: string, field: string, raw: string) {
	if (!EDITABLE[kind].includes(field)) {
		throw new EmitError(`"${field}" is not editable here — allowed: ${EDITABLE[kind].join(', ')}`);
	}

	const { file, schema } = REVIEWABLE[kind];
	const before = readData(file);
	const target = { id };

	const existing = (parseYaml(before) as any[]).find((r) => r.id === id);
	if (!existing) throw new EmitError(`no ${kind} with id "${id}"`);

	const value: unknown = field === 'acting' ? raw === 'true' : raw;

	// Dates go through the same grammar the build uses. A token it cannot read
	// resolves to an `unknown` interval, which drops the record off the timeline
	// without failing anything — the worst kind of error this dataset can have.
	if (['start', 'end', 'date'].includes(field) && raw) {
		try {
			const spec = field === 'end' ? { start: existing.start, end: raw } : { start: raw, end: existing.end };
			const interval = resolveInterval(spec);
			if (interval.status === 'unknown' && raw !== '?') {
				throw new Error(`"${raw}" is not a date this grammar understands`);
			}
		} catch (e) {
			throw new EmitError(`dates: ${(e as Error).message}`);
		}
	}

	const op = field in existing ? 'set' : 'add-field';
	const { text, splice } = applyEdit(before, { op, target, field, value } as any);

	const parsed = z.array(schema).safeParse(parseYaml(text));
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new EmitError(`edit fails the schema: ${issue.path.join('.')} ${issue.message}`);
	}

	writeFileSync(dataPath(file), text, 'utf8');
	return { file, was: splice.replaced, now: splice.text };
}

// ---------------------------------------------------------------------------
// Committing
// ---------------------------------------------------------------------------

const git = (args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function pendingChanges() {
	/*
	 * Do NOT trim the porcelain output as a whole.
	 *
	 * Each line carries a two-character status field then a space, and for an
	 * unstaged modification the first character is itself a space: " M data/x".
	 * Trimming the whole string strips that leading space from the FIRST line only,
	 * so slice(3) then ate a character and reported "ata/positions.yaml" — a bug
	 * visible on exactly one line of any listing, which is how it survives a glance.
	 */
	const lines = git(['status', '--porcelain', '--', 'data/'])
		.split('\n')
		.filter((l) => l.trim().length > 0);
	if (!lines.length) return { files: [], diffstat: '' };
	return {
		files: lines.map((l) => l.slice(3)),
		diffstat: git(['diff', '--stat', '--', 'data/']).trim()
	};
}

/**
 * Commit the pending data changes, after proving they build.
 *
 * This is the local form of the merge gate the sprint describes: `build-data.ts`
 * runs the whole epistemic contract — every claim sourced, every inference
 * carrying reasoning and a falsifier, every low-confidence claim attributed — and
 * a commit that cannot pass it should not exist. Catching it here matters because
 * otherwise the failure is discovered by whoever pulls next.
 */
function commitChanges(message: string) {
	const pending = pendingChanges();
	if (!pending.files.length) throw new EmitError('nothing to commit in data/');
	if (message.trim().length < 12) throw new EmitError('write a real commit message — what changed, and why');

	/*
	 * Spawned as `node --import tsx`, not `npx tsx`.
	 *
	 * On Windows npx is npx.cmd, which execFileSync cannot launch without a shell:
	 * it fails to SPAWN rather than running and failing. That is indistinguishable
	 * from a rejected build at a glance — status null, no output — so the gate
	 * appeared strict while actually refusing every commit including the valid
	 * ones, and reporting an empty reason. A guard that blocks everything is not a
	 * strict guard, it is a broken one.
	 */
	try {
		execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-data.ts'], {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: 'pipe'
		});
	} catch (e: any) {
		const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
		const lines = out.split('\n').filter((l) => /x\s|FAILED/.test(l)).slice(0, 5);
		if (!lines.length) {
			throw new EmitError(
				`could not run the build, so nothing was committed. Raw output:\n${
					out.slice(-400) || '(none — the build could not be started at all)'
				}`
			);
		}
		throw new EmitError(`the build rejects this, nothing committed:\n${lines.join('\n')}`);
	}

	git(['add', '--', 'data/']);
	git(['commit', '-m', message.trim(), '-m', 'Recorded through the local editorial tool.']);
	return { sha: git(['rev-parse', '--short', 'HEAD']).trim(), files: pending.files };
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/**
 * People who hold no position.
 *
 * A position is `(role, holder, interval)` — the join that makes the whole
 * timeline answerable. A person with none is in the dataset but not on the map:
 * you cannot ask who held power in 1994 from a list of people, only from a set of
 * intervals. HANDOFF.md lists filling these as the work after review, naming the
 * Bourguiba-era foreign ministers specifically.
 */
function loadPositionGap() {
	const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));
	const held = new Set(ds.positions.map((p: any) => p.holder));

	const orphans = ds.people
		.filter((p: any) => !held.has(p.id))
		.map((p: any) => ({
			id: p.id,
			name: p.name_en ?? p.id,
			tagline: p.tagline ?? '',
			layers: p.layers ?? [],
			trajectory: p.trajectory ?? []
		}));

	return {
		orphans,
		roles: ds.roles.map((r: any) => ({ id: r.id, title: r.title_en ?? r.id, authority: r.authority })),
		sources: ds.sources.map((s: any) => ({ id: s.id, title: s.title, tier: s.tier })),
		positionIds: ds.positions.map((p: any) => p.id)
	};
}

/**
 * Create a position.
 *
 * Everything the build would reject is checked here first, because the build
 * rejects the whole dataset — a bad position written from this tool would leave
 * `npm run data` failing for every other piece of work until someone found it.
 */
function createPosition(input: Record<string, any>) {
	const parsed = PositionSchema.safeParse(input);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new EmitError(`${issue.path.join('.') || 'position'}: ${issue.message}`);
	}
	const position = parsed.data;

	/*
	 * Zod strips keys the schema does not declare, silently. So a field the caller
	 * believed it was saving — `attributed_to`, which positions do not have, since
	 * they attribute through their sources — would simply vanish, and the operator
	 * would have no way to know their work was discarded.
	 *
	 * Refusing is the honest response: either the field belongs in the schema or it
	 * does not belong in the request.
	 */
	const dropped = Object.keys(input).filter((k) => !(k in position));
	if (dropped.length) {
		throw new EmitError(
			`a position has no field ${dropped.map((d) => `"${d}"`).join(', ')} — ` +
				`nothing was saved. Positions attribute through their sources.`
		);
	}

	// Referential integrity. build-data.ts fails on a dangling reference, so a
	// mistyped holder here would break the build rather than this request.
	const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));
	const has = (list: any[], id: string) => list.some((x: any) => x.id === id);

	if (!has(ds.roles, position.role)) throw new EmitError(`no role "${position.role}"`);
	if (!has(ds.people, position.holder)) throw new EmitError(`no person "${position.holder}"`);
	if (has(ds.positions, position.id)) throw new EmitError(`position "${position.id}" already exists`);
	for (const s of position.sources) {
		if (!has(ds.sources, s)) throw new EmitError(`no source "${s}"`);
	}

	// Dates use the four-field fuzzy grammar; an unparseable token becomes an
	// `unknown` interval that silently drops the position off the timeline.
	try {
		const interval = resolveInterval({ start: position.start, end: position.end });
		if (position.start && interval.status === 'unknown') {
			throw new Error(`"${position.start}" is not a date this grammar understands`);
		}
	} catch (e) {
		throw new EmitError(`dates: ${(e as Error).message}`);
	}

	const record: Record<string, unknown> = {
		id: position.id,
		role: position.role,
		holder: position.holder
	};
	if (position.start) record.start = position.start;
	if (position.end) record.end = position.end;
	if (position.acting) record.acting = true;
	record.confidence = position.confidence;
	if (position.verification !== 'verified') record.verification = position.verification;
	if (position.attributed_to) record.attributed_to = position.attributed_to;
	if (position.reasoning) record.reasoning = position.reasoning;
	if (position.falsifiable_by) record.falsifiable_by = position.falsifiable_by;
	record.sources = position.sources;

	const { text } = applyEdit(readData('positions.yaml'), { op: 'append-record', record });
	writeFileSync(dataPath('positions.yaml'), text, 'utf8');
	return position;
}

// ---------------------------------------------------------------------------
// Sourcing
// ---------------------------------------------------------------------------

interface SourcingItem {
	kind: Kind;
	id: string;
	label: string;
	confidence: string;
	basis?: string;
	sources: { id: string; tier: number; title: string }[];
	bestTier: number | null;
}

/**
 * Records that say, in the data, that they are waiting for a primary source.
 *
 * This is the JORT verification sprint's queue: 193 of the 197 are positions,
 * whose appointment decrees exist in the gazette and would fix both the grade and
 * the dates. Ordered worst-sourced first, so effort lands where the gap is widest.
 */
function loadSourcing(): { items: SourcingItem[]; sources: any[] } {
	const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));
	const byId = new Map<string, any>(ds.sources.map((s: any) => [s.id, s]));

	const label = (kind: Kind, r: any): string => {
		if (kind === 'positions') return `${r.roleTitle ?? r.role} — ${r.holder}`;
		if (kind === 'relationships') return `${r.from} → ${r.to} (${r.type})`;
		return r.title ?? r.id;
	};

	const items: SourcingItem[] = [];
	for (const kind of Object.keys(REVIEWABLE) as Kind[]) {
		for (const record of (ds[kind] ?? []) as any[]) {
			if (record.verification !== 'needs-primary-source') continue;
			const sources = (record.sources ?? [])
				.map((id: string) => byId.get(id))
				.filter(Boolean)
				.map((s: any) => ({ id: s.id, tier: s.tier, title: s.title }));
			const tiers = sources.map((s: { tier: number }) => s.tier);
			items.push({
				kind,
				id: record.id,
				label: label(kind, record),
				confidence: record.confidence,
				basis: record.basis,
				sources,
				bestTier: tiers.length ? Math.min(...tiers) : null
			});
		}
	}

	items.sort((a, b) => (b.bestTier ?? 9) - (a.bestTier ?? 9));
	return {
		items,
		sources: ds.sources.map((s: any) => ({
			id: s.id,
			title: s.title,
			publisher: s.publisher,
			tier: s.tier,
			date: s.date
		}))
	};
}

/** Create a source record. Validated, then appended to sources.yaml. */
function createSource(input: Record<string, unknown>) {
	const parsed = SourceSchema.safeParse(input);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new EmitError(`${issue.path.join('.') || 'source'}: ${issue.message}`);
	}
	const source = parsed.data;

	const before = readData(SOURCES_FILE);
	// Field order matters only for readability, but a source that reads like the
	// ones around it is a source someone will actually check.
	const record: Record<string, unknown> = {
		id: source.id,
		title: source.title,
		publisher: source.publisher
	};
	if (source.date) record.date = source.date;
	record.url = source.url;
	if (source.archive_url) record.archive_url = source.archive_url;
	record.tier = source.tier;
	record.lang = source.lang;
	if (source.excerpt) record.excerpt = source.excerpt;

	const { text } = applyEdit(before, { op: 'append-record', record });
	writeFileSync(dataPath(SOURCES_FILE), text, 'utf8');
	return source;
}

/**
 * Attach a source to a record, and optionally raise its grade.
 *
 * The upgrade is where the epistemic damage would happen, so it is checked
 * against the sources the record will actually have — including the one being
 * attached in the same action.
 */
function attachSource(
	kind: Kind,
	id: string,
	sourceId: string,
	upgrade?: { confidence?: string; verification?: string }
) {
	const { file, schema } = REVIEWABLE[kind];
	const sources = parseYaml(readData(SOURCES_FILE)) as any[];
	const source = sources.find((s) => s.id === sourceId);
	if (!source) throw new EmitError(`no source with id "${sourceId}"`);

	let text = readData(file);
	const target = { id };

	text = applyEdit(text, { op: 'append-to-list', target, field: 'sources', item: sourceId }).text;

	if (upgrade?.confidence) {
		const record = (parseYaml(text) as any[]).find((r) => r.id === id);
		const tiers = (record.sources ?? [])
			.map((sid: string) => sources.find((s) => s.id === sid)?.tier)
			.filter((t: number | undefined): t is number => typeof t === 'number');

		if (upgrade.confidence === 'A' && !tiers.some((t: number) => PRIMARY_TIERS.includes(t))) {
			throw new EmitError(
				`grade A means a primary record, but this cites nothing above tier ${Math.min(...tiers)}. ` +
					`Cite the decree or the institutional source, or grade it B.`
			);
		}
		text = applyEdit(text, { op: 'set', target, field: 'confidence', value: upgrade.confidence }).text;
	}

	if (upgrade?.verification) {
		text = applyEdit(text, { op: 'set', target, field: 'verification', value: upgrade.verification }).text;
	}

	const parsed = z.array(schema).safeParse(parseYaml(text));
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new EmitError(`edit fails the schema: ${issue.path.join('.')} ${issue.message}`);
	}

	writeFileSync(dataPath(file), text, 'utf8');
	return { file };
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Deep Tunisia — editorial</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root { color-scheme: dark light; --bg:#0f1115; --fg:#e6e8ec; --dim:#9aa3b2; --line:#242833; --card:#161922; --accent:#7aa2f7; }
@media (prefers-color-scheme: light) { :root { --bg:#fbfbfd; --fg:#1a1d23; --dim:#5b6472; --line:#e2e5ea; --card:#fff; --accent:#2f5fd0; } }
* { box-sizing:border-box }
body { margin:0; font:15px/1.5 ui-sans-serif,system-ui,sans-serif; background:var(--bg); color:var(--fg) }
header { padding:20px 24px; border-bottom:1px solid var(--line) }
h1 { margin:0; font-size:16px; font-weight:600; letter-spacing:.02em }
.sub { color:var(--dim); font-size:13px; margin-top:4px }
main { padding:24px; max-width:1000px }
table.cov { border-collapse:collapse; margin-bottom:28px; font-variant-numeric:tabular-nums }
table.cov td { padding:3px 14px 3px 0 }
table.cov td:first-child { color:var(--dim) }
.bar { display:inline-block; height:8px; background:var(--accent); border-radius:2px; vertical-align:middle }
.item { border:1px solid var(--line); background:var(--card); border-radius:8px; padding:12px 14px; margin-bottom:10px }
.item h3 { margin:0 0 4px; font-size:14px; font-weight:600 }
.meta { color:var(--dim); font-size:12px; display:flex; gap:12px; flex-wrap:wrap }
.tag { border:1px solid var(--line); border-radius:99px; padding:1px 8px; font-size:11px }
.tag.unsubstantiated { color:#f7768e; border-color:#f7768e66 }
.tag.attributed { color:#e0af68; border-color:#e0af6866 }
.tag.inferred { color:#7aa2f7; border-color:#7aa2f766 }
form { margin-top:10px; display:none; gap:8px; flex-wrap:wrap; align-items:flex-start }
form.open { display:flex }
input, button { font:inherit; padding:6px 10px; border-radius:6px; border:1px solid var(--line); background:var(--bg); color:var(--fg) }
input.method { flex:1; min-width:260px }
button { cursor:pointer; border-color:var(--accent); color:var(--accent) }
button.plain { border-color:var(--line); color:var(--dim) }
.warn { color:#e0af68; font-size:12px; width:100% }
.done { color:var(--dim); font-size:12px }
.note { color:var(--dim); font-size:12px; margin:18px 0 0; border-top:1px solid var(--line); padding-top:14px }
nav { display:flex; gap:4px; margin-top:14px }
nav button { border-color:transparent; color:var(--dim); padding:5px 12px }
nav button.on { border-color:var(--line); color:var(--fg); background:var(--card) }
.tier { font-variant-numeric:tabular-nums }
.tier.t1, .tier.t2 { color:#9ece6a }
.tier.t4, .tier.t5 { color:#e0af68 }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; width:100% }
.grid input, .grid select { width:100% }
.grid .wide { grid-column:1 / -1 }
label { display:block; font-size:11px; color:var(--dim); margin-bottom:3px }
.err { color:#f7768e; font-size:12px; width:100% }
</style></head><body>
<header><h1>Deep Tunisia — editorial</h1>
<div class="sub">Local tool. Writes data/*.yaml directly; commit with git as usual. Run <code>npm run data &amp;&amp; npm run test</code> after editing.</div>
<nav><button data-tab="review" class="on">Review queue</button><button data-tab="sourcing">Sourcing</button><button data-tab="positions">Position gaps</button></nav></header>
<main><div id="pending"></div><div id="app">Loading…</div></main>
<script type="module">
const app = document.getElementById('app');
const pendingEl = document.getElementById('pending');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// --- uncommitted work -------------------------------------------------------

async function refreshPending() {
  const p = await (await fetch('/api/changes')).json();
  if (!p.files.length) { pendingEl.innerHTML = ''; return; }

  pendingEl.innerHTML = \`<div class="item">
    <h3>\${p.files.length} file\${p.files.length === 1 ? '' : 's'} changed and not committed</h3>
    <div class="meta"><span>\${esc(p.diffstat.split('\\n').pop() || '')}</span></div>
    <form>
      <input name="msg" class="method" placeholder="what changed, and why — this becomes the commit message">
      <button type="submit">Build and commit</button>
      <div class="err" hidden></div>
    </form>
  </div>\`;

  pendingEl.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = form.querySelector('.err');
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Building…';
    err.hidden = true;

    const res = await fetch('/api/commit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: form.msg.value })
    });
    const out = await res.json();
    btn.disabled = false;
    btn.textContent = 'Build and commit';

    if (!res.ok) {
      err.hidden = false;
      err.style.whiteSpace = 'pre-wrap';
      err.textContent = out.error;
      return;
    }
    pendingEl.innerHTML = '<div class="item"><h3>Committed ' + esc(out.sha) + '</h3></div>';
    setTimeout(refreshPending, 2500);
  };
}
let state = null;
let sourcing = null;
let tab = 'review';

for (const b of document.querySelectorAll('nav button')) {
  b.onclick = () => {
    tab = b.dataset.tab;
    for (const o of document.querySelectorAll('nav button')) o.classList.toggle('on', o === b);
    load();
  };
}

let gaps = null;

async function load() {
  refreshPending();
  app.textContent = 'Loading…';
  if (tab === 'review') {
    state = await (await fetch('/api/queue')).json();
    render();
  } else if (tab === 'sourcing') {
    sourcing = await (await fetch('/api/sourcing')).json();
    renderSourcing();
  } else {
    gaps = await (await fetch('/api/positions')).json();
    renderGaps();
  }
}

function render() {
  const { items, coverage } = state;
  const pending = items.filter((i) => !i.reviewed);
  const rows = Object.entries(coverage).map(([risk, c]) => {
    const pct = c.total ? Math.round((c.reviewed / c.total) * 100) : 0;
    return \`<tr><td>\${risk}</td><td>\${c.reviewed} / \${c.total}</td>
      <td><span class="bar" style="width:\${Math.max(2, pct)}px"></span> \${pct}%</td></tr>\`;
  }).join('');

  app.innerHTML = \`<table class="cov"><tbody>\${rows}</tbody></table>
    <div class="sub" style="margin-bottom:14px">\${pending.length} unreviewed, highest risk first</div>
    \${pending.slice(0, 60).map(card).join('')}
    <p class="note">Showing the first 60. A review records who checked it and how —
    write what you actually verified, not what the record claims.</p>\`;

  wireToggles();
  for (const form of app.querySelectorAll('form')) form.onsubmit = submit;
}

function wireToggles() {
  for (const el of app.querySelectorAll('[data-open]')) {
    el.onclick = () => el.closest('.item').querySelector('form').classList.toggle('open');
  }
}

// --- sourcing ---------------------------------------------------------------

function renderSourcing() {
  const { items, sources } = sourcing;
  const worst = items.filter((i) => i.bestTier === null || i.bestTier >= 3).length;

  app.innerHTML = \`
    <div class="sub" style="margin-bottom:14px">
      \${items.length} records say they are waiting for a primary source.
      \${worst} of them cite nothing above tier 3.
      Grade A means a primary record — tier 1 or 2 — not "we are sure".
    </div>
    \${items.slice(0, 40).map(sourceCard).join('')}
    <p class="note">Showing the first 40, worst-sourced first. Creating a source writes
    to sources.yaml and attaching it writes to the record's file; both go through the
    same emitter as everything else.</p>\`;

  wireToggles();
  for (const sel of app.querySelectorAll('select[name=existing]')) {
    sel.innerHTML = '<option value="">— attach an existing source —</option>' +
      sources.map((s) => \`<option value="\${esc(s.id)}">[\${s.tier}] \${esc(s.title.slice(0, 70))}</option>\`).join('');
  }
  for (const form of app.querySelectorAll('form')) form.onsubmit = submitSource;
}

function sourceCard(i) {
  const cited = i.sources.length
    ? i.sources.map((s) => \`<span class="tier t\${s.tier}">[\${s.tier}] \${esc(s.id)}</span>\`).join(' ')
    : '<span class="tier t5">no sources</span>';

  return \`<div class="item" data-kind="\${i.kind}" data-id="\${esc(i.id)}">
    <h3>\${esc(i.label)}</h3>
    <div class="meta">
      <span class="tag">grade \${esc(i.confidence)}</span>
      <span>\${esc(i.kind)} · \${esc(i.id)}</span>
      \${cited}
      <button class="plain" data-open type="button">Add source</button>
    </div>
    <form>
      <div class="grid">
        <div class="wide">
          <label>Attach a source already in the file</label>
          <select name="existing"></select>
        </div>
        <div class="wide"><label>— or record a new one —</label></div>
        <div><label>id</label><input name="sid" placeholder="jort-2016-034-decree"></div>
        <div><label>tier</label><select name="tier">
          <option value="1">1 — gazette, decree, government portal</option>
          <option value="2">2 — institutional or peer-reviewed</option>
          <option value="3">3 — established international journalism</option>
          <option value="4">4 — reputable regional media</option>
          <option value="5">5 — lead, needs corroboration</option>
        </select></div>
        <div class="wide"><label>title</label><input name="title" placeholder="Décret n° … portant nomination de …"></div>
        <div><label>publisher</label><input name="publisher" placeholder="Journal Officiel de la République Tunisienne"></div>
        <div><label>date</label><input name="sdate" placeholder="2016-08-27"></div>
        <div class="wide"><label>url</label><input name="url" placeholder="https://…"></div>
        <div class="wide"><label>archive url (optional, but links here rot)</label><input name="archive" placeholder="https://web.archive.org/…"></div>
        <div><label>language</label><select name="lang">
          <option value="fr">fr</option><option value="ar">ar</option><option value="en">en</option>
        </select></div>
        <div><label>excerpt (optional)</label><input name="excerpt" placeholder="the line that supports the claim"></div>
        <div class="wide">
          <label>then set the record to</label>
          <select name="upgrade">
            <option value="">leave the grade alone</option>
            <option value="A">A — verified, primary record cited</option>
            <option value="B">B — verified, several credible outlets</option>
          </select>
        </div>
      </div>
      <button type="submit">Save</button>
      <div class="err" hidden></div>
    </form>
  </div>\`;
}

// --- position gaps ----------------------------------------------------------

function renderGaps() {
  const { orphans, roles, sources } = gaps;

  app.innerHTML = \`
    <div class="sub" style="margin-bottom:14px">
      \${orphans.length} people hold no position. A position is (role, holder, interval) —
      the join the timeline is built from, so a person without one is in the dataset
      but not on the map.
    </div>
    \${orphans.map(gapCard).join('')}
    <p class="note">Dates use the fuzzy grammar: 1987-11-07, 1987-11, 1987, ~1987,
    &lt;=1987, ongoing, ? — an unparseable token would drop the position off the
    timeline silently, so it is checked before writing.</p>\`;

  wireToggles();
  for (const sel of app.querySelectorAll('select[name=role]')) {
    sel.innerHTML = roles
      .slice().sort((a, b) => (b.authority ?? 0) - (a.authority ?? 0))
      .map((r) => \`<option value="\${esc(r.id)}">\${esc(r.title)}</option>\`).join('');
  }
  for (const sel of app.querySelectorAll('select[name=src]')) {
    sel.innerHTML = sources
      .map((s) => \`<option value="\${esc(s.id)}">[\${s.tier}] \${esc(s.title.slice(0, 70))}</option>\`).join('');
  }
  for (const form of app.querySelectorAll('form')) form.onsubmit = submitPosition;
}

function gapCard(p) {
  return \`<div class="item" data-holder="\${esc(p.id)}">
    <h3>\${esc(p.name)}</h3>
    <div class="meta">
      <span>\${esc(p.id)}</span>
      \${p.layers.map((l) => '<span class="tag">' + esc(l) + '</span>').join('')}
      \${p.tagline ? '<span>' + esc(p.tagline.slice(0, 80)) + '</span>' : ''}
      <button class="plain" data-open type="button">Add position</button>
    </div>
    \${p.trajectory.length ? '<div class="meta"><span>trajectory: ' + esc(p.trajectory.join(' → ')) + '</span></div>' : ''}
    <form>
      <div class="grid">
        <div><label>role</label><select name="role"></select></div>
        <div><label>position id</label><input name="pid" placeholder="p-foreign-mokaddem"></div>
        <div><label>start</label><input name="start" placeholder="1964 or 1964-11-07 or ~1964"></div>
        <div><label>end</label><input name="end" placeholder="1970, ongoing, or leave blank"></div>
        <div><label>confidence</label><select name="confidence">
          <option value="A">A — primary record cited</option>
          <option value="B" selected>B — several credible outlets</option>
          <option value="C">C — single outlet, or reasoned estimate</option>
          <option value="D">D — circulating without evidence</option>
        </select></div>
        <div><label>verification</label><select name="verification">
          <option value="verified">verified</option>
          <option value="needs-primary-source" selected>needs-primary-source</option>
          <option value="disputed">disputed</option>
        </select></div>
        <div class="wide"><label>sources (ctrl-click for several)</label><select name="src" multiple size="4"></select></div>
        <div class="wide"><label>reasoning (required if this ends up inferred — grade C plus needs-primary-source)</label><input name="reasoning" placeholder="why this is the reasoned conclusion"></div>
        <div class="wide"><label>falsifiable by (required with reasoning)</label><input name="falsifiable" placeholder="what evidence would overturn it"></div>
      </div>
      <button type="submit">Create</button>
      <div class="err" hidden></div>
    </form>
  </div>\`;
}

async function submitPosition(e) {
  e.preventDefault();
  const form = e.target;
  const item = form.closest('.item');
  const err = form.querySelector('.err');
  const fail = (m) => { err.hidden = false; err.textContent = m; };

  const chosen = [...form.src.selectedOptions].map((o) => o.value);
  if (!chosen.length) return fail('every position needs at least one source');
  if (!form.pid.value.trim()) return fail('give the position an id');

  const position = {
    id: form.pid.value.trim(),
    role: form.role.value,
    holder: item.dataset.holder,
    confidence: form.confidence.value,
    verification: form.verification.value,
    sources: chosen
  };
  if (form.start.value.trim()) position.start = form.start.value.trim();
  if (form.end.value.trim()) position.end = form.end.value.trim();
  if (form.reasoning.value.trim()) position.reasoning = form.reasoning.value.trim();
  if (form.falsifiable.value.trim()) position.falsifiable_by = form.falsifiable.value.trim();

  const res = await fetch('/api/position', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ position })
  });
  const out = await res.json();
  if (!res.ok) return fail(out.error);

  item.querySelector('.meta').insertAdjacentHTML('beforeend', '<span class="done">created ' + out.id + '</span>');
  form.remove();
  refreshPending();
}

async function submitSource(e) {
  e.preventDefault();
  const form = e.target;
  const item = form.closest('.item');
  const err = form.querySelector('.err');
  const fail = (m) => { err.hidden = false; err.textContent = m; };

  const attachTo = { kind: item.dataset.kind, id: item.dataset.id };
  const upgrade = form.upgrade.value
    ? { confidence: form.upgrade.value, verification: 'verified' }
    : undefined;

  let res, out;
  if (form.existing.value) {
    res = await fetch('/api/attach', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...attachTo, sourceId: form.existing.value, upgrade })
    });
  } else {
    if (!form.sid.value.trim()) return fail('give the source an id, or pick an existing one');
    const source = {
      id: form.sid.value.trim(),
      title: form.title.value.trim(),
      publisher: form.publisher.value.trim(),
      url: form.url.value.trim(),
      tier: Number(form.tier.value),
      lang: form.lang.value
    };
    if (form.sdate.value.trim()) source.date = form.sdate.value.trim();
    if (form.archive.value.trim()) source.archive_url = form.archive.value.trim();
    if (form.excerpt.value.trim()) source.excerpt = form.excerpt.value.trim();

    res = await fetch('/api/source', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, attachTo, upgrade })
    });
  }

  out = await res.json();
  if (!res.ok) return fail(out.error);

  item.querySelector('.meta').insertAdjacentHTML('beforeend', '<span class="done">saved</span>');
  form.remove();
  refreshPending();
}

function card(i) {
  return \`<div class="item" data-kind="\${i.kind}" data-id="\${esc(i.id)}">
    <h3>\${esc(i.label)}</h3>
    <div class="meta">
      <span class="tag \${i.risk}">\${i.risk}</span>
      <span>\${esc(i.kind)} · \${esc(i.id)}</span>
      \${i.attributed_to ? '<span>claimed by ' + esc(i.attributed_to) + '</span>' : ''}
      <span>\${i.sources.length} source\${i.sources.length === 1 ? '' : 's'}</span>
      <button class="plain" data-open type="button">Record review</button>
    </div>
    <form>
      <input name="by" placeholder="your name" required value="\${esc(localStorage.getItem('admin:by') || '')}">
      <input name="date" type="date" required value="\${new Date().toISOString().slice(0,10)}">
      <input name="method" class="method" placeholder="what you actually checked, and against what">
      <button type="submit">Save</button>
      <div class="warn" hidden></div>
    </form>
  </div>\`;
}

async function submit(e) {
  e.preventDefault();
  const form = e.target;
  const item = form.closest('.item');
  const body = {
    kind: item.dataset.kind,
    id: item.dataset.id,
    by: form.by.value.trim(),
    date: form.date.value,
    method: form.method.value
  };
  localStorage.setItem('admin:by', body.by);

  const res = await fetch('/api/review', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const out = await res.json();
  const warn = form.querySelector('.warn');

  if (!res.ok) { warn.hidden = false; warn.textContent = out.error; return; }
  if (out.warning) { warn.hidden = false; warn.textContent = out.warning + ' (saved anyway — fix or revert)'; }
  item.querySelector('.meta').insertAdjacentHTML('beforeend', '<span class="done">saved to ' + out.file + '</span>');
  form.remove();
  refreshPending();
}

load();
</script></body></html>`;

const json = (res: any, code: number, body: unknown) => {
	res.writeHead(code, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
};

/**
 * Read a JSON body, refusing anything that is not valid UTF-8.
 *
 * `Buffer.toString('utf8')` never fails: it replaces every malformed sequence with
 * U+FFFD and returns happily. A client that posted cp1252 therefore had "Décret"
 * silently written into sources.yaml as "D�cret" — valid YAML, valid schema,
 * permanently wrong, and in a dataset that is a third Arabic exactly the kind of
 * damage nobody notices until much later.
 *
 * TextDecoder with fatal:true throws instead, which turns silent corruption into a
 * refusal the caller can see.
 */
async function readBody(req: any): Promise<any> {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
	} catch {
		throw new EmitError('request body is not valid UTF-8 — send UTF-8 encoded JSON');
	}
	return JSON.parse(text);
}

const server = createServer(async (req, res) => {
	try {
		if (req.method === 'GET' && req.url === '/') {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			return res.end(PAGE);
		}

		if (req.method === 'GET' && req.url === '/api/queue') {
			return json(res, 200, loadQueue());
		}

		if (req.method === 'GET' && req.url === '/api/changes') {
			return json(res, 200, pendingChanges());
		}

		if (req.method === 'POST' && req.url === '/api/commit') {
			const body = await readBody(req);
			const out = commitChanges(String(body.message ?? ''));
			console.log(`  commit  ${out.sha}  ${out.files.join(', ')}`);
			return json(res, 200, out);
		}

		if (req.method === 'POST' && req.url === '/api/edit') {
			const body = await readBody(req);
			const out = editField(body.kind, body.id, body.field, String(body.value ?? ''));
			console.log(`  edit    ${body.kind}/${body.id} ${body.field}: ${out.was} -> ${out.now}`);
			return json(res, 200, out);
		}

		if (req.method === 'GET' && req.url === '/api/positions') {
			return json(res, 200, loadPositionGap());
		}

		if (req.method === 'POST' && req.url === '/api/position') {
			const body = await readBody(req);
			const position = createPosition(body.position);
			console.log(`  position ${position.id} (${position.role} / ${position.holder})`);
			return json(res, 200, { id: position.id });
		}

		if (req.method === 'GET' && req.url === '/api/sourcing') {
			return json(res, 200, loadSourcing());
		}

		if (req.method === 'POST' && req.url === '/api/source') {
			const body = await readBody(req);
			const source = createSource(body.source);
			let attached: string | null = null;

			// Creating a source and attaching it are one action for the user, and two
			// writes to two files. The source goes first: if the attach then fails, the
			// result is an uncited source, which the project already tolerates and
			// excludes from its published count. The reverse order would leave a record
			// citing a source that does not exist, which fails the build.
			if (body.attachTo) {
				attachSource(body.attachTo.kind, body.attachTo.id, source.id, body.upgrade);
				attached = body.attachTo.id;
			}

			console.log(`  source  ${source.id} (tier ${source.tier})${attached ? ` → ${attached}` : ''}`);
			return json(res, 200, { id: source.id, attached });
		}

		if (req.method === 'POST' && req.url === '/api/attach') {
			const body = await readBody(req);
			attachSource(body.kind, body.id, body.sourceId, body.upgrade);
			console.log(`  attach  ${body.sourceId} → ${body.kind}/${body.id}`);
			return json(res, 200, { ok: true });
		}

		if (req.method === 'POST' && req.url === '/api/review') {
			const body = await readBody(req);

			if (!REVIEWABLE[body.kind as Kind]) return json(res, 400, { error: `unknown kind "${body.kind}"` });
			if (!body.by || body.by.length < 2) return json(res, 400, { error: 'a review needs a name' });
			if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) return json(res, 400, { error: 'date must be YYYY-MM-DD' });

			const item = loadQueue().items.find((i) => i.kind === body.kind && i.id === body.id);
			if (!item) return json(res, 404, { error: `no ${body.kind} with id "${body.id}"` });

			const { file, added } = recordReview(body.kind, item.target, body);
			const warning = body.method ? gazetteWarning(body.method, item.sources) : null;

			console.log(`  review  ${body.kind}/${body.id} by ${body.by}${warning ? '  ⚠ ' + warning : ''}`);
			return json(res, 200, { file, added, warning });
		}

		res.writeHead(404).end('not found');
	} catch (e) {
		const message = (e as Error).message;
		console.error(`  error   ${message}`);
		json(res, e instanceof EmitError ? 400 : 500, { error: message });
	}
});

/**
 * Only listen when run directly.
 *
 * test-emit.ts imports riskOf() from here to check it against the coverage table
 * the build publishes; importing a module must not start a server.
 */
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// 127.0.0.1, never 0.0.0.0. This binding is the access control — see the header.
if (runDirectly) server.listen(PORT, '127.0.0.1', () => {
	const { items, coverage } = loadQueue();
	const pending = items.filter((i) => !i.reviewed).length;
	console.log(`\n  Deep Tunisia editorial tool — http://127.0.0.1:${PORT}`);
	console.log(`  ${pending} unreviewed of ${items.length}`);
	for (const risk of RISK) {
		const c = coverage[risk];
		if (c.total) console.log(`    ${risk.padEnd(16)} ${String(c.reviewed).padStart(4)} / ${c.total}`);
	}
	console.log('\n  Writes data/*.yaml. Run `npm run data && npm run test` before committing.\n');
});
