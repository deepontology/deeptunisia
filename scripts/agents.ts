/**
 * Agent runner (spec §12).
 *
 * P4: agents propose, humans dispose. No agent writes data/*.yaml. Each run
 * writes candidates into data/contrib/<agent>-<date>.yaml — a reviewable outbox —
 * and the `--import` pass validates every candidate against the SAME schemas the
 * build uses (the hardened gate: V18–V24). A candidate that fails is rejected at
 * the gate with the validator's message, never merged and "fixed later".
 *
 * The deterministic agents implemented here work off the BUILT graph
 * (src/generated/dataset.json), so they propose only what the records already
 * support — no invented data. The remaining agents in the §12.3 registry are
 * declared with their missions but need external corpora (JORT, registries, news)
 * and are marked `not-implemented`.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments, stringify as stringifyYaml } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CONTRIB = join(ROOT, 'data', 'contrib');

export interface Agent {
	id: string;
	mission: string;
	inputs: string[];
	outputs: { type: string; kind: 'candidate' | 'flag' | 'refinement' }[];
	failures: string[];
	humanCheck: 'source-check' | 'dedup' | 'attribute' | 'accept-reject';
	expectedConfidence: 'high' | 'medium' | 'low';
	implemented: boolean;
}

export const AGENTS: Agent[] = [
	{ id: 'procurement', mission: 'Find tenders/contracts (JORT, ONMP, press)', inputs: ['JORT pages', 'tunisie-tenders', 'press'], outputs: [{ type: 'contracts', kind: 'candidate' }, { type: 'contract-award', kind: 'candidate' }], failures: ['may confuse announced vs awarded value'], humanCheck: 'source-check', expectedConfidence: 'medium', implemented: false },
	{ id: 'corporate-registry', mission: 'Reconcile RCC/CIN records', inputs: ['BRCT', 'open sources'], outputs: [{ type: 'companies', kind: 'candidate' }], failures: ['legacy registries list nominee directors'], humanCheck: 'dedup', expectedConfidence: 'high', implemented: false },
	{ id: 'shareholder', mission: 'Extract equity changes', inputs: ['annual reports', 'registers'], outputs: [{ type: 'ownership', kind: 'candidate' }], failures: ['beneficial ownership needs its own citation'], humanCheck: 'attribute', expectedConfidence: 'medium', implemented: false },
	{ id: 'company-ownership', mission: 'Merge/dedupe ownership claims', inputs: ['graph', 'registry'], outputs: [{ type: 'ownership', kind: 'refinement' }], failures: ['duplicate claims vs merged_into'], humanCheck: 'judge', expectedConfidence: 'medium', implemented: false },
	{ id: 'board', mission: 'Extract board seats', inputs: ['filings', 'press'], outputs: [{ type: 'board', kind: 'candidate' }], failures: ['does the seat belong to the person or the holding'], humanCheck: 'judge', expectedConfidence: 'medium', implemented: false },
	{ id: 'litigation', mission: 'Cases and judgements', inputs: ['press', 'court sites'], outputs: [{ type: 'legal', kind: 'candidate' }], failures: ['remit: only adjudicated facts'], humanCheck: 'accept-reject', expectedConfidence: 'medium', implemented: false },
	{ id: 'election', mission: 'Nominations and results', inputs: ['ISIE', 'press'], outputs: [{ type: 'election', kind: 'candidate' }], failures: ['first round vs runoff confusion'], humanCheck: 'accept-reject', expectedConfidence: 'high', implemented: false },
	{ id: 'media-monitoring', mission: 'Statements, interviews, endorsements', inputs: ['outlets', 'agencies'], outputs: [{ type: 'media', kind: 'candidate' }, { type: 'endorsement', kind: 'candidate' }], failures: ['a quote is not a fact'], humanCheck: 'source-check', expectedConfidence: 'low', implemented: false },
	{ id: 'energy', mission: 'Energy crises, energy policy', inputs: ['news', 'ENEDIS/STEG communications'], outputs: [{ type: 'economic', kind: 'candidate' }], failures: ['production vs capacity'], humanCheck: 'source-check', expectedConfidence: 'medium', implemented: false },
	{ id: 'economic-events', mission: 'Strikes, protests, economic events', inputs: ['news'], outputs: [{ type: 'economic', kind: 'candidate' }], failures: ['attributing causality from one outlet'], humanCheck: 'source-check', expectedConfidence: 'medium', implemented: false },
	{ id: 'infrastructure', mission: 'Physical assets (ports, power)', inputs: ['official plans'], outputs: [{ type: 'places', kind: 'candidate' }], failures: ['assets need coordinates, not guesses'], humanCheck: 'source-check', expectedConfidence: 'medium', implemented: false },
	{ id: 'budget', mission: 'Budgets, subsidies, wages', inputs: ['ministry print'], outputs: [{ type: 'economic', kind: 'candidate' }], failures: ['voted vs executed'], humanCheck: 'source-check', expectedConfidence: 'medium', implemented: false },
	{ id: 'geographic', mission: 'Geocode places', inputs: ['OSM', 'official cites'], outputs: [{ type: 'places', kind: 'candidate' }], failures: ['coordinates must come from a source'], humanCheck: 'accept-reject', expectedConfidence: 'high', implemented: false },
	{ id: 'relationship-discovery', mission: 'Find missing edges from narratives and press', inputs: ['graph', 'press'], outputs: [{ type: 'relationship', kind: 'candidate' }], failures: ['narrative proximity is not a relationship'], humanCheck: 'judge', expectedConfidence: 'low', implemented: false },
	{ id: 'timeline', mission: 'Build and lint per-entity timelines', inputs: ['whole graph'], outputs: [{ type: 'timeline', kind: 'candidate' }], failures: ['never authored — derived at build (R9)'], humanCheck: 'accept-reject', expectedConfidence: 'high', implemented: true },
	{ id: 'verification', mission: 'Resolve the needs-primary-source worklist', inputs: ['needsPrimary list', 'archives'], outputs: [{ type: 'claim', kind: 'flag' }], failures: ['upgrade only with the record in hand'], humanCheck: 'judge', expectedConfidence: 'high', implemented: true },
	{ id: 'citation', mission: 'Find uncited sources and archive gaps', inputs: ['uncited list', 'graph'], outputs: [{ type: 'sources', kind: 'flag' }], failures: ['archive URL is a suggestion, not a citation'], humanCheck: 'accept-reject', expectedConfidence: 'high', implemented: true },
	{ id: 'contradiction', mission: 'Cross-check positions and events for date contradictions', inputs: ['all intervals'], outputs: [{ type: 'dispute', kind: 'candidate' }], failures: ['an overlap is not a contradiction without sources'], humanCheck: 'judge', expectedConfidence: 'high', implemented: true }
];

const IMPLEMENTED = new Set(AGENTS.filter((a) => a.implemented).map((a) => a.id));

const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));

/** Deterministic candidates from the built graph (spec §12.4). */
function runAgent(id: string): { title: string; records: Record<string, unknown>[]; notes: string } {
	if (id === 'timeline') {
		const withItems = (ds.people as { id: string; timeline?: unknown[] }[]).filter((p) => (p.timeline?.length ?? 0) > 0).length;
		return { title: 'timeline coverage', notes: 'Derived at build (R9); nothing to propose.', records: [] };
	}
	if (id === 'verification') {
		const records = (ds.positions as { id: string; roleTitle?: string; verification: string; holder: string }[])
			.filter((p) => p.verification === 'needs-primary-source')
			.map((p) => ({ kind: 'position', id: p.id, note: 'awaits a primary source; verify or downgrade' }));
		return { title: 'needs-primary-source worklist', records, notes: 'Flag-type output: the worklist for human verification.' };
	}
	if (id === 'citation') {
		// Coverage must mirror the build's own cited check (build-data.ts): every
		// loaded kind that carries a `sources` list, plus events' contested and
		// dispute citations. The agent previously missed regions/places and event
		// disputes, so its outbox over-reported sources the graph already cites.
		const cited = new Set<string>();
		for (const kind of ['positions', 'relationships', 'events', 'people', 'institutions', 'roles', 'eras', 'hypotheses', 'agreements', 'contracts', 'licences', 'declarations', 'education', 'regions', 'places']) {
			for (const r of ds[kind] ?? []) for (const s of r.sources ?? []) cited.add(s);
		}
		for (const e of ds.events ?? []) {
			for (const c of e.contested ?? []) if (c.source) cited.add(c.source);
			for (const d of e.disputes ?? []) if (d.source) cited.add(d.source);
		}
		const records = (ds.sources as { id: string; url: string; archive_url?: string }[])
			.filter((s) => !cited.has(s.id))
			.map((s) => ({ kind: 'source', id: s.id, note: 'uncited — either cite it or retire it' }));
		return { title: 'uncited sources', records, notes: 'Flag-type output: sources in the registry no record cites.' };
	}
	if (id === 'contradiction') {
		const byRole = new Map<string, { id: string; holder: string; interval: { startEarliest: number; endEarliest: number | null; endLatest: number | null } }[]>();
		for (const p of ds.positions) {
			byRole.set(p.role, [...(byRole.get(p.role) ?? []), p]);
		}
		const records: Record<string, unknown>[] = [];
		for (const [role, list] of byRole) {
			const sorted = [...list].sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);
			for (let i = 1; i < sorted.length; i++) {
				const prev = sorted[i - 1];
				const cur = sorted[i];
				const prevEnd = prev.interval.endLatest;
				if (prevEnd !== null && prevEnd > cur.interval.startEarliest) {
					records.push({
						kind: 'dispute-candidate',
						role,
						a: prev.id,
						b: cur.id,
						note: `${prev.holder} may still have been in post when ${cur.holder} began — the span overlaps; verify the handover`
					});
				}
			}
		}
		return { title: 'overlapping-tenure candidates', records, notes: 'Candidate disputes for human judgement — an overlap is not a contradiction without sources.' };
	}
	throw new Error(`agent "${id}" is not implemented`);
}

const arg = process.argv.slice(2);
const agentArg = arg.indexOf('--agent');
const wantImport = arg.includes('--import') || arg.includes('--list');

if (agentArg !== -1) {
	const id = arg[agentArg + 1];
	if (!IMPLEMENTED.has(id)) {
		console.error(`agent "${id}" is not implemented. Implemented: ${[...IMPLEMENTED].join(', ')}`);
		process.exit(1);
	}
	const agent = AGENTS.find((a) => a.id === id)!;
	const out = runAgent(id);
	if (!out.records.length) {
		console.log(`${id}: nothing to propose — ${out.notes}`);
		process.exit(0);
	}
	mkdirSync(CONTRIB, { recursive: true });
	const stamp = new Date().toISOString().slice(0, 10);
	const file = join(CONTRIB, `${id}-${stamp}.yaml`);
	const header = `# ${id} — ${agent.mission}\n# ${out.title}\n# ${out.notes}\n# Failure vocabulary: ${agent.failures.join('; ')}\n# Candidates are proposals (P4). They are NOT graph data until a human\n# imports them through the hardened gate (agents:outbox --import).\n\n`;
	writeFileSync(file, header + stringifyYaml(out.records), 'utf8');
	console.log(`wrote ${out.records.length} candidate(s) to data/contrib/${id}-${stamp}.yaml`);
	process.exit(0);
}

if (wantImport || arg.includes('--list')) {
	if (!existsSync(CONTRIB)) {
		console.log('no outbox yet — run agents:discover first');
		process.exit(0);
	}
	const files = readdirSync(CONTRIB).filter((f) => f.endsWith('.yaml'));
	console.log(`outbox: ${files.length} candidate file(s)`);
	for (const f of files) {
		/**
		 * Research batches may use one YAML document per kind, or a wrapper object
		 * whose arrays are named after the target file. Review the records rather than
		 * silently treating a wrapper as zero candidates. `parseAllDocuments` also keeps
		 * the outbox gate from crashing on a legitimate multi-document batch.
		 */
		const rows: Record<string, unknown>[] = [];
		for (const document of parseAllDocuments(readFileSync(join(CONTRIB, f), 'utf8'))) {
			const raw = document.toJSON() as unknown;
			if (Array.isArray(raw)) {
				for (const row of raw) {
					if (row && typeof row === 'object') rows.push(row as Record<string, unknown>);
				}
				continue;
			}
			if (!raw || typeof raw !== 'object') continue;
			for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
				// Research notes are leads and editorial context, not candidate records.
				if (kind === 'notes') continue;
				if (!Array.isArray(value)) continue;
				for (const row of value) {
					if (!row || typeof row !== 'object') continue;
					// Source rows are records to review, not claims that need a
					// `sources` list of their own. The marker stays in memory only.
					rows.push(kind === 'sources' ? { ...(row as Record<string, unknown>), _outboxSource: true } : row as Record<string, unknown>);
				}
			}
		}
		// The hardened gate: a candidate that would fail the build's validators
		// (V18–V24) is rejected HERE with the message, never merged.
		let rejected = 0;
		for (const row of rows) {
			const source = row._outboxSource === true || row._type === 'source' ||
				(Boolean(row.id) && Boolean(row.title) && Boolean(row.publisher) && Boolean(row.url) && row.tier !== undefined && !row.sources);
			if (source) {
				const validSource = typeof row.id === 'string' && typeof row.title === 'string' &&
					typeof row.publisher === 'string' && typeof row.url === 'string' &&
					[1, 2, 3, 4, 5].includes(row.tier as number);
				if (!validSource) rejected++;
				continue;
			}
			const confidence = row.confidence ?? row.proposed_confidence;
			const ok =
				row?.sources?.length > 0 &&
				(confidence !== 'C' && confidence !== 'D' || row?.attributed_to) &&
				((row?.basis ?? row?.proposed_basis) !== 'inferred' || (row?.reasoning && row?.falsifiable_by)) &&
				((row?.basis ?? row?.proposed_basis) !== 'unsubstantiated' || row?.attributed_to);
			if (!ok) rejected++;
		}
		console.log(
			`  ${f}: ${rows.length} candidate(s), ${rejected} would be rejected at the gate (missing source/attribution/reasoning) — ${wantImport ? 'NOT imported until fixed' : 'not imported (list only)'}`
		);
	}
	if (wantImport) {
		console.log('  import: candidates above that pass the gate can be filed as community proposals by a human; nothing is merged automatically.');
	}
	process.exit(0);
}

console.log('agents — usage:');
console.log('  npm run agents:discover -- --agent <id>   propose candidates into data/contrib/');
console.log(`  npm run agents:outbox                      list the outbox (gate-checked)`);
console.log(`  implemented: ${[...IMPLEMENTED].join(', ')}`);
