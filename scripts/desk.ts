/**
 * The verification desk: evidence packets, verdict writes, session records.
 *
 * This module holds the parts of the desk that can be tested without a browser:
 * the packet a reviewer reads, the write each verdict makes, the timing rule, and
 * the session line the build reads for its published figure. `scripts/admin.ts`
 * puts them behind the local HTTP tool and renders them as its fourth tab.
 *
 * WHAT EACH VERDICT WRITES
 *
 *   1  the source says it          a review (actor human, method source-check) and
 *                                  verification: verified
 *   2  the source says part of it  a review with a required note; start, end or
 *                                  confidence may change; verification unchanged
 *   3  the source does not say it  verification: needs-primary-source and a review
 *                                  with a required note
 *   4  the source cannot be read   nothing on the record; it is counted and left
 *                                  for the sourcing tab
 *   5  this is contested           the dispute, and verification: disputed
 *   s  skip                        nothing, and the packet is not timed
 *   u  undo the last verdict       the last write is inverted through the splicer
 *
 * Every write goes through `applyEdit` in scripts/emit.ts, the same path the other
 * tabs use. A packet is one record: a review replaces the record's existing review
 * because the schema allows one, and that is stated in the packet.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { resolveInterval } from './dates.ts';
import { applyEdit, EmitError, type Edit } from './emit.ts';
import {
	PositionSchema,
	RelationshipSchema,
	EventSchema,
	REVIEWER_LABEL,
	SourceExceptionSchema,
	configureSchema,
	verifiedGrounded
} from './schema.ts';
import { DEFAULT_PARAMETERS, loadParameters, type Parameters } from './parameters.ts';

/** The kinds a reviewer can verify. They are the kinds that carry `review:` and `sources:`. */
export const REVIEWABLE = {
	positions: { file: 'positions.yaml', schema: PositionSchema },
	relationships: { file: 'relationships.yaml', schema: RelationshipSchema },
	events: { file: 'events.yaml', schema: EventSchema }
} as const;
export type Kind = keyof typeof REVIEWABLE;

/**
 * The fields a verdict may change on a record. Same list the Review queue uses:
 * dates are the thing most often wrong, and grade and verification are what the
 * sourcing work moves.
 */
export const EDITABLE: Record<Kind, string[]> = {
	positions: ['start', 'end', 'confidence', 'verification', 'acting'],
	relationships: ['start', 'end', 'confidence', 'verification'],
	events: ['date', 'confidence', 'verification']
};

/**
 * Idle time over five minutes on one packet is capped at five.
 *
 * The page records the seconds from a packet being shown to its verdict. A reviewer
 * who walks away, or leaves a tab open overnight, must not turn that into a claim
 * about how long a check takes: the cap keeps the published median about the check.
 */
export const MAX_IDLE_SECONDS = 300;

export function verdictSeconds(shownAt: number, judgedAt: number): number {
	const seconds = (judgedAt - shownAt) / 1000;
	if (!Number.isFinite(seconds) || seconds < 0) return 0;
	return Math.min(Math.round(seconds), MAX_IDLE_SECONDS);
}

/** Median of a list, or null when it is empty. Even counts average the two middles. */
export function median(values: readonly number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// The packet
// ---------------------------------------------------------------------------

export interface PrecheckLine {
	id: string;
	url: string;
	status: string;
	http: number | null;
	final_url: string | null;
	snapshot_url: string | null;
	snapshot_timestamp: string | null;
	excerpt: string;
}

export interface PacketSource {
	id: string;
	title: string | null;
	publisher: string | null;
	tier: number | null;
	lang: string | null;
	url: string | null;
	archive_url: string | null;
	excerpt: string | null;
	/**
	 * Stored excerpts are mostly English reading aids written over French or Arabic
	 * pages, so an excerpt is a summary until a pre-check finds it on the page. The
	 * reviewer is told which it is, because reading a summary as a quote is exactly
	 * how a source check turns into a false confirmation.
	 */
	excerptLabel: string | null;
	/** The latest pre-check line for this source, or null when none has ever run. */
	precheck: PrecheckLine | null;
}

export interface Packet {
	kind: Kind;
	id: string;
	label: string;
	claim: string;
	standing: {
		basis: string | null;
		grade: string | null;
		verification: string | null;
		origins: number | null;
		encyclopediaOnly: boolean;
		disputes: string[];
		/** True when the record already carries a review, which verdict 1 replaces. */
		hasReview: boolean;
	};
	sources: PacketSource[];
	/** The folded decision tree from the rubric, or null when the file is absent. */
	rule: string | null;
}

const dateAt = (raw: unknown, precision: unknown): string =>
	raw
		? `${String(raw)} (${String(precision ?? 'unknown')} precision)`
		: `no recorded date (${String(precision ?? 'unknown')} precision)`;

/**
 * One sentence saying who, what and when, with the dates as written and their
 * precision. The precision is not decoration: a year is a different claim from a
 * day, and a reviewer checking the source needs to know which one is on the record.
 */
export function claimSentence(kind: Kind, record: any, name: (id: string) => string): string {
	const interval = record.interval ?? {};
	const raw = interval.raw ?? {};
	if (kind === 'positions') {
		return `${name(record.holder)} held ${record.roleTitle ?? name(record.role)} from ${dateAt(
			raw.start,
			interval.startPrecision
		)} to ${dateAt(raw.end, interval.endPrecision)}.`;
	}
	if (kind === 'relationships') {
		const type = record.subtype ? `${record.type} (${record.subtype})` : record.type;
		return `${name(record.from)} and ${name(record.to)} are recorded as ${type}, from ${dateAt(
			raw.start,
			interval.startPrecision
		)} to ${dateAt(raw.end, interval.endPrecision)}.`;
	}
	const actors = (record.actors ?? []).map((a: string) => name(a));
	const who = actors.length ? ` and involved ${actors.join(', ')}` : '';
	return `${record.title_en ?? record.id} took place on ${dateAt(raw.start, interval.startPrecision)}${who}.`;
}

/** Ids to the name a reader knows. Falls back to the id, never to a guess. */
export function nameIndex(dataset: any): (id: string) => string {
	const map = new Map<string, string>();
	const put = (rows: any[] | undefined, field: string) => {
		for (const row of rows ?? []) if (row?.id && row[field]) map.set(row.id, row[field]);
	};
	put(dataset.people, 'name_en');
	put(dataset.institutions, 'name_en');
	put(dataset.roles, 'title_en');
	put(dataset.companies, 'legal_name_fr');
	put(dataset.places, 'name_en');
	put(dataset.events, 'title_en');
	return (id: string) => map.get(id) ?? id;
}

/**
 * The latest pre-check file under research/desk/precheck, by filename. One dated
 * file per run; the newest one is the current statement about a source.
 */
export function readPrecheck(root: string): Map<string, PrecheckLine> {
	const dir = join(root, 'research', 'desk', 'precheck');
	const out = new Map<string, PrecheckLine>();
	if (!existsSync(dir)) return out;
	const files = readdirSync(dir)
		.filter((f) => f.endsWith('.jsonl'))
		.sort();
	if (!files.length) return out;
	for (const line of readFileSync(join(dir, files[files.length - 1]), 'utf8').split('\n')) {
		if (!line.trim()) continue;
		try {
			const row = JSON.parse(line) as PrecheckLine;
			if (row?.id) out.set(row.id, row);
		} catch {
			// A malformed line is one source without a result, not a failed packet.
		}
	}
	return out;
}

/** The decision tree, section 6 of the rubric, folded to one block for the packet. */
export function rubricTree(root: string): string | null {
	const path = join(root, 'research', 'study', 'rubric-v2.md');
	if (!existsSync(path)) return null;
	const text = readFileSync(path, 'utf8');
	const start = text.indexOf('## 6.');
	if (start === -1) return null;
	const rest = text.slice(start);
	const end = rest.search(/\n---\n|\n## 7\./);
	return (end === -1 ? rest : rest.slice(0, end)).trim();
}

export function excerptLabel(excerpt: string | null, precheck: PrecheckLine | null): string | null {
	if (!excerpt) return null;
	if (precheck && (precheck.excerpt === 'found-live' || precheck.excerpt === 'found-snapshot')) {
		return 'quote found on the page';
	}
	return 'summary, not a quote';
}

export interface PacketContext {
	sources: Map<string, any>;
	names: (id: string) => string;
	precheck: Map<string, PrecheckLine>;
	rule: string | null;
}

export function buildPacket(
	kind: Kind,
	record: any,
	label: string,
	context: PacketContext
): Packet {
	const sources: PacketSource[] = (record.sources ?? []).map((id: string) => {
		const source = context.sources.get(id);
		const check = context.precheck.get(id) ?? null;
		const excerpt = source?.excerpt ?? null;
		return {
			id,
			title: source?.title ?? null,
			publisher: source?.publisher ?? null,
			tier: typeof source?.tier === 'number' ? source.tier : null,
			lang: source?.lang ?? null,
			url: source?.url ?? null,
			archive_url: source?.archive_url ?? null,
			excerpt,
			excerptLabel: excerptLabel(excerpt, check),
			precheck: check
		};
	});

	return {
		kind,
		id: record.id,
		label,
		claim: claimSentence(kind, record, context.names),
		standing: {
			basis: record.basis ?? null,
			grade: record.confidence ?? null,
			verification: record.verification ?? null,
			origins: typeof record.restsOnOrigins === 'number' ? record.restsOnOrigins : null,
			encyclopediaOnly: record.encyclopediaOnly === true,
			disputes: (record.disputes ?? []).map(
				(d: any) => `${d.claim} Held by ${d.held_by}.`
			),
			hasReview: Boolean(record.review)
		},
		sources,
		rule: context.rule
	};
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

interface Inverse {
	field: string;
	had: boolean;
	before: unknown;
}

interface Step {
	(record: any): Edit | null;
}

const dataPath = (root: string, kind: Kind) => join(root, 'data', REVIEWABLE[kind].file);

/**
 * The schema reads the jurisdiction parameters and the explicit exception register
 * from the data folder, exactly as the build does. Without this, a record listed in
 * source-exceptions.yaml looks like a rule violation to the tool and a legitimate
 * edit is refused. Re-run per write: the register is data and can change between
 * requests.
 */
let configuredRoot: string | null = null;
export function configureDeskSchema(root: string, force = false): void {
	if (configuredRoot === root && !force) return;
	let parameters: Parameters = DEFAULT_PARAMETERS;
	try {
		parameters = loadParameters(join(root, 'data', 'parameters.yaml'));
	} catch {
		// A copy without the parameter file validates against the shipped Tunisia box.
	}
	const emptySources = new Set<string>();
	const basisOverrides = new Set<string>();
	const path = join(root, 'data', 'source-exceptions.yaml');
	if (existsSync(path)) {
		const rows = parseYaml(readFileSync(path, 'utf8'));
		const today = new Date().toISOString().slice(0, 10);
		for (const entry of Array.isArray(rows) ? rows : []) {
			const parsed = SourceExceptionSchema.safeParse(entry);
			if (!parsed.success || parsed.data.deadline < today) continue;
			const ex = parsed.data;
			if (ex.rule === 'no-source') emptySources.add(`${ex.kind}:${ex.id}`);
			if (ex.rule === 'basis-override' && ex.implied && ex.authored) {
				basisOverrides.add(`${ex.kind}:${ex.id}:${ex.implied}>${ex.authored}`);
			}
		}
	}
	configureSchema(parameters, { emptySources, basisOverrides });
	configuredRoot = root;
}

function applySteps(
	root: string,
	kind: Kind,
	id: string,
	steps: Step[]
): { file: string; inverse: Inverse[]; wrote: string[] } {
	configureDeskSchema(root);
	const path = dataPath(root, kind);
	const file = REVIEWABLE[kind].file;
	const schema = REVIEWABLE[kind].schema;
	let text = readFileSync(path, 'utf8');
	const inverse: Inverse[] = [];
	const wrote: string[] = [];

	for (const step of steps) {
		const record = (parseYaml(text) as any[]).find((r) => r.id === id);
		if (!record) throw new EmitError(`no ${kind} with id "${id}"`);
		const edit = step(record);
		if (!edit) continue;
		const field = (edit as { field: string }).field;
		inverse.push({ field, had: Object.prototype.hasOwnProperty.call(record, field), before: record[field] });
		text = applyEdit(text, edit).text;
		wrote.push(field);
	}

	const parsed = z.array(schema).safeParse(parseYaml(text));
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new EmitError(`edit fails the schema: ${issue.path.join('.')} ${issue.message}`);
	}
	const after = (parseYaml(text) as any[]).find((r) => r.id === id);
	if (after && !verifiedGrounded(after)) {
		throw new EmitError('V33: a record may say verified only with a human source-check review');
	}

	writeFileSync(path, text, 'utf8');
	return { file, inverse, wrote };
}

function reviewEdit(review: Record<string, string>): Step {
	return (record) =>
		record.review
			? { op: 'set', target: { id: record.id }, field: 'review', value: review }
			: { op: 'add-block', target: { id: record.id }, field: 'review', entries: review };
}

function verificationEdit(value: string): Step {
	return (record) =>
		'verification' in record
			? { op: 'set', target: { id: record.id }, field: 'verification', value }
			: { op: 'add-field', target: { id: record.id }, field: 'verification', value };
}

/**
 * Check a field change before any byte is written. Dates go through the same
 * grammar the build uses: an unparseable token becomes an unknown interval, which
 * drops the record off the timeline without failing anything.
 */
export function checkField(root: string, kind: Kind, id: string, field: string, raw: string): void {
	if (!EDITABLE[kind].includes(field)) {
		throw new EmitError(`"${field}" is not editable here: allowed ${EDITABLE[kind].join(', ')}`);
	}
	const record = (parseYaml(readFileSync(dataPath(root, kind), 'utf8')) as any[]).find((r) => r.id === id);
	if (!record) throw new EmitError(`no ${kind} with id "${id}"`);
	if (['start', 'end', 'date'].includes(field) && raw) {
		try {
			const spec = field === 'end' ? { start: record.start, end: raw } : { start: raw, end: record.end };
			const interval = resolveInterval(spec);
			if (interval.status === 'unknown' && raw !== '?') {
				throw new Error(`"${raw}" is not a date this grammar understands`);
			}
		} catch (e) {
			throw new EmitError(`dates: ${(e as Error).message}`);
		}
	}
}

/** Change one editable field on an existing record, validated, through the splicer. */
export function editField(root: string, kind: Kind, id: string, field: string, raw: string) {
	configureDeskSchema(root);
	checkField(root, kind, id, field, raw);
	const path = dataPath(root, kind);
	const before = readFileSync(path, 'utf8');
	const existing = (parseYaml(before) as any[]).find((r) => r.id === id);
	const value: unknown = field === 'acting' ? raw === 'true' : raw;
	const op = field in existing ? 'set' : 'add-field';
	const { text, splice } = applyEdit(before, { op, target: { id }, field, value } as Edit);
	const parsed = z.array(REVIEWABLE[kind].schema).safeParse(parseYaml(text));
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new EmitError(`edit fails the schema: ${issue.path.join('.')} ${issue.message}`);
	}
	writeFileSync(path, text, 'utf8');
	return { file: REVIEWABLE[kind].file, was: splice.replaced, now: splice.text };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const SESSIONS_DIR = join('research', 'desk');
export const SESSIONS_FILE = join(SESSIONS_DIR, 'sessions.tsv');
export const SESSIONS_HEADER =
	'date\trecords_seen\tverified\tpartly\tnot_said\tunreadable\tcontested\tskipped\tmedian_seconds\tsigned_by';

export const VERDICT_KEYS = ['1', '2', '3', '4', '5'] as const;
export type VerdictKey = (typeof VERDICT_KEYS)[number];

export interface SessionLine {
	date: string;
	seen: number;
	verified: number;
	partly: number;
	notSaid: number;
	unreadable: number;
	contested: number;
	skipped: number;
	/** Seconds per verified claim: the median within the session, capped at 300. */
	medianSeconds: number | null;
	by: string;
}

export function formatSessionLine(line: SessionLine): string {
	return [
		line.date,
		line.seen,
		line.verified,
		line.partly,
		line.notSaid,
		line.unreadable,
		line.contested,
		line.skipped,
		line.medianSeconds === null ? '' : String(line.medianSeconds),
		line.by
	].join('\t');
}

export function parseSessions(text: string): SessionLine[] {
	const lines: SessionLine[] = [];
	const rows = text.split('\n').filter((l) => l.trim().length > 0);
	for (const row of rows) {
		if (row === SESSIONS_HEADER || row.startsWith('date\t')) continue;
		const cells = row.split('\t');
		if (cells.length < 10) continue;
		const num = (v: string) => Number(v) || 0;
		const medianSeconds = cells[8] === '' ? null : Number(cells[8]);
		lines.push({
			date: cells[0],
			seen: num(cells[1]),
			verified: num(cells[2]),
			partly: num(cells[3]),
			notSaid: num(cells[4]),
			unreadable: num(cells[5]),
			contested: num(cells[6]),
			skipped: num(cells[7]),
			medianSeconds: Number.isFinite(medianSeconds) ? medianSeconds : null,
			by: cells[9]
		});
	}
	return lines;
}

/**
 * The published figure: median minutes per verified claim, and the claims behind it.
 *
 * A session line carries its own median and its verified count, not per-claim
 * timings, so the figure is the median of the session medians. That is stated on
 * the page's method note rather than presented as a pooled median.
 */
export function deskFigure(lines: readonly SessionLine[]): {
	sessions: number;
	claims: number;
	minutes: number | null;
} {
	const claims = lines.reduce((n, l) => n + l.verified, 0);
	const medians = lines
		.filter((l) => l.verified > 0 && l.medianSeconds !== null)
		.map((l) => l.medianSeconds as number);
	const centre = median(medians);
	return {
		sessions: lines.length,
		claims,
		minutes: centre === null ? null : Math.round((centre / 60) * 10) / 10
	};
}

export function readSessions(root: string): SessionLine[] {
	const path = join(root, SESSIONS_FILE);
	if (!existsSync(path)) return [];
	return parseSessions(readFileSync(path, 'utf8'));
}

export function deskStatsText(text: string): { deskSessions: string; deskClaims: string; deskMinutes: string } {
	const figure = deskFigure(parseSessions(text));
	return {
		deskSessions: String(figure.sessions),
		deskClaims: String(figure.claims),
		deskMinutes: figure.minutes === null ? '' : figure.minutes.toFixed(1)
	};
}

export function commitSession(
	root: string,
	line: SessionLine,
	touched: readonly string[]
): { branch: string; sha: string; previous: string; files: string[] } {
	const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	let previous = '';
	try {
		previous = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
	} catch {
		throw new EmitError('the verification desk commits through git, and this folder is not a git repository');
	}

	const branch = `data/desk-${line.date}`;
	try {
		git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
		throw new EmitError(`branch ${branch} already exists; finish that session before starting another`);
	} catch (e) {
		if (e instanceof EmitError) throw e;
		// not found: the normal case
	}

	git(['checkout', '-b', branch]);

	const sessionsPath = join(root, SESSIONS_FILE);
	mkdirSync(join(root, SESSIONS_DIR), { recursive: true });
	if (!existsSync(sessionsPath)) appendFileSync(sessionsPath, SESSIONS_HEADER + '\n', 'utf8');
	appendFileSync(sessionsPath, formatSessionLine(line) + '\n', 'utf8');

	const files = [...new Set([...touched, SESSIONS_FILE.replace(/\\/g, '/')])];
	git(['add', '--', ...files]);
	git([
		'-c',
		'user.name=DeepOntology Collective',
		'-c',
		'user.email=contact@deepontology.org',
		'commit',
		'-m',
		`Desk: record a verification session, ${line.date}`,
		'-m',
		`${line.verified} verified of ${line.seen} records seen.`
	]);
	const sha = git(['rev-parse', '--short', 'HEAD']).trim();
	return { branch, sha, previous, files };
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/** What the desk needs from an entry of the review queue. */
export interface DeskQueueItem {
	kind: Kind;
	id: string;
	label: string;
}

export interface DeskOptions {
	root: string;
	now?: () => number;
	/** The review queue, in the order the tool already shows it. */
	queue: () => DeskQueueItem[];
}

export interface VerdictInput {
	kind: Kind;
	id: string;
	key: VerdictKey;
	/** The role label the review is signed with. Defaults to maintainer. */
	by?: string;
	note?: string;
	fields?: Record<string, string>;
	dispute?: { claim: string; held_by: string; source?: string; assessment?: string };
}

export interface SessionState {
	seen: number;
	judged: number;
	skipped: number;
	verdicts: Record<VerdictKey, number>;
	/** Seconds per verified claim in this session. */
	medianSeconds: number | null;
	claims: number;
}

interface Judged {
	kind: Kind;
	id: string;
	key: VerdictKey;
	seconds: number | null;
	file: string | null;
	inverse: Inverse[];
}

export class DeskSession {
	readonly root: string;
	private now: () => number;
	private queue: () => DeskQueueItem[];
	private dataset: any;
	private sources: Map<string, any>;
	private names: (id: string) => string;
	private precheck: Map<string, PrecheckLine>;
	private rule: string | null;
	private shown = new Map<string, number>();
	private skipped = new Set<string>();
	private judged: Judged[] = [];
	private touched = new Set<string>();
	private finished: { branch: string; sha: string; previous: string; files: string[]; line: SessionLine } | null =
		null;

	constructor(options: DeskOptions) {
		this.root = options.root;
		this.now = options.now ?? Date.now;
		this.queue = options.queue;
		this.dataset = JSON.parse(readFileSync(join(this.root, 'src', 'generated', 'dataset.json'), 'utf8'));
		this.sources = new Map((this.dataset.sources ?? []).map((s: any) => [s.id, s]));
		this.names = nameIndex(this.dataset);
		this.precheck = readPrecheck(this.root);
		this.rule = rubricTree(this.root);
	}

	private key(kind: Kind, id: string): string {
		return `${kind}:${id}`;
	}

	private date(): string {
		return new Date(this.now()).toISOString().slice(0, 10);
	}

	/** The record as the generated dataset has it. Names and sources are stable. */
	private record(kind: Kind, id: string): any {
		return (this.dataset[kind] ?? []).find((r: any) => r.id === id);
	}

	next(): Packet | null {
		for (const item of this.queue()) {
			const key = this.key(item.kind, item.id);
			if (this.judged.some((j) => this.key(j.kind, j.id) === key)) continue;
			if (this.skipped.has(key)) continue;
			const record = this.record(item.kind, item.id);
			if (!record) continue;
			if (!this.shown.has(key)) this.shown.set(key, this.now());
			return buildPacket(item.kind, record, item.label, {
				sources: this.sources,
				names: this.names,
				precheck: this.precheck,
				rule: this.rule
			});
		}
		return null;
	}

	packet(kind: Kind, id: string): Packet | null {
		const item = this.queue().find((q) => q.kind === kind && q.id === id);
		const record = this.record(kind, id);
		if (!record) return null;
		const key = this.key(kind, id);
		if (!this.shown.has(key)) this.shown.set(key, this.now());
		return buildPacket(kind, record, item?.label ?? id, {
			sources: this.sources,
			names: this.names,
			precheck: this.precheck,
			rule: this.rule
		});
	}

	private requireShown(kind: Kind, id: string): number {
		const key = this.key(kind, id);
		if (!this.shown.has(key)) this.shown.set(key, this.now());
		return this.shown.get(key) as number;
	}

	judge(input: VerdictInput): {
		state: SessionState;
		wrote: string[];
		file: string | null;
		last: { kind: Kind; id: string; key: VerdictKey; seconds: number };
	} {
		const key = input.key;
		if (!VERDICT_KEYS.includes(key)) throw new EmitError(`"${key}" is not a verdict key`);
		const record = this.record(input.kind, input.id);
		if (!record) throw new EmitError(`no ${input.kind} with id "${input.id}"`);

		const shownAt = this.requireShown(input.kind, input.id);
		const seconds = verdictSeconds(shownAt, this.now());
		const by = input.by ?? 'maintainer';
		if (!REVIEWER_LABEL.test(by)) throw new EmitError('a reviewer signs with a role label, not a name');
		const date = this.date();
		const note = (input.note ?? '').trim();

		let file: string | null = null;
		let inverse: Inverse[] = [];
		let wrote: string[] = [];

		if (key === '1') {
			const review: Record<string, string> = { by, date, method: 'source-check', actor: 'human' };
			if (note) review.note = note;
			const result = applySteps(this.root, input.kind, input.id, [
				reviewEdit(review),
				verificationEdit('verified')
			]);
			file = result.file;
			inverse = result.inverse;
			wrote = result.wrote;
		} else if (key === '2') {
			if (!note) throw new EmitError('verdict 2 needs a note saying which part the source supports');
			for (const [field, value] of Object.entries(input.fields ?? {})) {
				if (!EDITABLE[input.kind].includes(field)) {
					throw new EmitError(`"${field}" is not editable here: allowed ${EDITABLE[input.kind].join(', ')}`);
				}
				checkField(this.root, input.kind, input.id, field, String(value));
			}
			const review: Record<string, string> = { by, date, method: 'source-check', actor: 'human', note };
			const steps: Step[] = [reviewEdit(review)];
			for (const [field, value] of Object.entries(input.fields ?? {})) {
				steps.push((r) =>
					field in r
						? { op: 'set', target: { id: r.id }, field, value: String(value) }
						: { op: 'add-field', target: { id: r.id }, field, value: String(value) }
				);
			}
			const result = applySteps(this.root, input.kind, input.id, steps);
			file = result.file;
			inverse = result.inverse;
			wrote = result.wrote;
		} else if (key === '3') {
			if (!note) throw new EmitError('verdict 3 needs a note saying what the source does say, or does not');
			const review: Record<string, string> = { by, date, method: 'source-check', actor: 'human', note };
			const result = applySteps(this.root, input.kind, input.id, [
				reviewEdit(review),
				verificationEdit('needs-primary-source')
			]);
			file = result.file;
			inverse = result.inverse;
			wrote = result.wrote;
		} else if (key === '4') {
			// Nothing on the record. The record is counted and left for the sourcing tab.
		} else {
			const dispute = input.dispute;
			if (!dispute || !dispute.claim?.trim() || !dispute.held_by?.trim()) {
				throw new EmitError('verdict 5 needs the disputed claim and who holds it');
			}
			const entry: Record<string, unknown> = {
				claim: dispute.claim.trim(),
				held_by: dispute.held_by.trim()
			};
			if (dispute.source?.trim()) entry.source = dispute.source.trim();
			if (dispute.assessment?.trim()) entry.assessment = dispute.assessment.trim();
			const result = applySteps(this.root, input.kind, input.id, [
				(record) => {
					const existing = Array.isArray(record.disputes) ? record.disputes : [];
					return 'disputes' in record
						? {
								op: 'set',
								target: { id: record.id },
								field: 'disputes',
								value: [...existing, entry]
							}
						: {
								op: 'add-field',
								target: { id: record.id },
								field: 'disputes',
								value: [entry]
							};
				},
				verificationEdit('disputed')
			]);
			file = result.file;
			inverse = result.inverse;
			wrote = result.wrote;
		}

		this.judged.push({ kind: input.kind, id: input.id, key, seconds, file, inverse });
		this.shown.delete(this.key(input.kind, input.id));
		if (file) this.touched.add(`data/${file}`);
		return {
			state: this.state(),
			wrote,
			file,
			last: { kind: input.kind, id: input.id, key, seconds }
		};
	}

	skip(kind: Kind, id: string): SessionState {
		const key = this.key(kind, id);
		this.skipped.add(key);
		this.shown.delete(key);
		return this.state();
	}

	undo(): { undone: { kind: Kind; id: string; key: VerdictKey } | null; state: SessionState } {
		const last = this.judged.pop();
		if (!last) return { undone: null, state: this.state() };
		if (last.inverse.length) {
			const steps: Step[] = [...last.inverse].reverse().map((inv) => (record) => {
				if (!inv.had) {
					return inv.field in record
						? { op: 'remove-field', target: { id: record.id }, field: inv.field }
						: null;
				}
				return { op: 'set', target: { id: record.id }, field: inv.field, value: inv.before };
			});
			applySteps(this.root, last.kind, last.id, steps);
		}
		return { undone: { kind: last.kind, id: last.id, key: last.key }, state: this.state() };
	}

	state(): SessionState {
		const verdicts = Object.fromEntries(VERDICT_KEYS.map((k) => [k, 0])) as Record<VerdictKey, number>;
		for (const j of this.judged) verdicts[j.key]++;
		const timed = this.judged
			.filter((j) => j.key === '1' && j.seconds !== null)
			.map((j) => j.seconds as number);
		return {
			seen: this.judged.length + this.skipped.size,
			judged: this.judged.length,
			skipped: this.skipped.size,
			verdicts,
			medianSeconds: median(timed),
			claims: verdicts['1']
		};
	}

	finish(by: string): {
		branch: string;
		sha: string;
		line: SessionLine;
		commands: { push: string; pr: string };
		files: string[];
	} {
		if (!REVIEWER_LABEL.test(by)) throw new EmitError('a reviewer signs with a role label, not a name');
		if (this.finished) throw new EmitError(`this session was already committed on ${this.finished.branch}`);
		if (!this.judged.length && !this.skipped.size) throw new EmitError('nothing has been seen in this session yet');

		const state = this.state();
		const line: SessionLine = {
			date: this.date(),
			seen: state.seen,
			verified: state.verdicts['1'],
			partly: state.verdicts['2'],
			notSaid: state.verdicts['3'],
			unreadable: state.verdicts['4'],
			contested: state.verdicts['5'],
			skipped: state.skipped,
			medianSeconds: state.medianSeconds === null ? null : Math.round(state.medianSeconds),
			by
		};
		const committed = commitSession(this.root, line, [...this.touched]);
		const commands = this.commands(committed.branch, committed.previous, line);
		this.finished = { ...committed, line };
		return { ...committed, line, commands };
	}

	private commands(branch: string, base: string, line: SessionLine) {
		const subject = `Desk: verification session ${line.date}`;
		const body = `${line.verified} verified of ${line.seen} records seen. Recorded through the local verification desk.`;
		return {
			push: `git push -u origin ${branch}`,
			pr: `gh pr create --head ${branch} --base ${base} --title "${subject}" --body "${body}"`
		};
	}

	/** Run the two commands. Only ever reached from the button, never on finish. */
	publish(): { push: string; pr: string } {
		if (!this.finished) throw new EmitError('finish the session before publishing it');
		const commands = this.commands(this.finished.branch, this.finished.previous, this.finished.line);
		const run = (cmd: string, args: string[]) =>
			execFileSync(cmd, args, { cwd: this.root, encoding: 'utf8' });
		run('git', ['push', '-u', 'origin', this.finished.branch]);
		run('gh', [
			'pr',
			'create',
			'--head',
			this.finished.branch,
			'--base',
			this.finished.previous,
			'--title',
			`Desk: verification session ${this.finished.line.date}`,
			'--body',
			`${this.finished.line.verified} verified of ${this.finished.line.seen} records seen. Recorded through the local verification desk.`
		]);
		return commands;
	}
}
