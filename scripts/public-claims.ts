/**
 * The public-claim registry (v0.1.3 plan, milestone M3).
 *
 * Every mutable public figure and product-status statement gets one declaration
 * (`data/public-claims.yaml`), one typed resolver, one owning surface and one
 * verification state. The registry proves that the published wording resolves to
 * the declared source; it does not replace the evidence and review rules for
 * historical claims, and it is deliberately NOT part of the canonical Tunisia
 * evidence graph. It describes the product and its evidence state.
 *
 * THREE RULES, ENFORCED HERE RATHER THAN DOCUMENTED:
 *
 *   1. RESOLVERS ARE CLOSED. A declaration names a source from a fixed
 *      allowlist and a key that source implements. It cannot execute code, read
 *      an arbitrary path, or fall back to a hand-typed literal. An unknown key
 *      is a build failure, never a silent default.
 *
 *   2. POPULATIONS ARE EXPLICIT. The editorial review notes, the editorial
 *      queue, the independent verifications, the data-prose strings, the content
 *      pages and the landing dictionaries are different populations with
 *      different denominators. Nothing here sums them or renames one as another.
 *
 *   3. LIFECYCLE IS DECLARED. `current` claims must resolve and match their
 *      surfaces; `historical` and `planning` claims are preserved as history and
 *      checked for the state that makes them historical or planned; `superseded`
 *      claims must NOT still appear on a live surface — that is the retired
 *      check, and it is the difference between recording history and shipping it.
 *
 * The build fails on an unresolved, stale, duplicated, missing, malformed or
 * retired-still-published claim. Negative fixtures for each live in
 * `fixtures/public-claims/` and are exercised by `scripts/test-public-claims.ts`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const RESOLVER_SOURCES = [
	'stats',
	'dataset',
	'review',
	'editorial-queue',
	'media',
	'world',
	'release',
	'deployment-manifest',
	'content-translation',
	'data-translation',
	'study'
] as const;
export type ResolverSource = (typeof RESOLVER_SOURCES)[number];

export const CLAIM_KINDS = [
	'metric',
	'epistemic-state',
	'feature-state',
	'deployment-state',
	'release-state',
	'translation-state'
] as const;

export const CLAIM_FORMATS = [
	'plain',
	'comma',
	'space',
	'ar-comma',
	'text',
	'mb1',
	'mb1-fr',
	'mb1-ar',
	'percent',
	'iso-date',
	'version',
	'word',
	'word-cap'
] as const;
export type ClaimFormat = (typeof CLAIM_FORMATS)[number];

export const CLAIM_LIFECYCLES = ['current', 'historical', 'planning', 'superseded'] as const;
export const CLAIM_LOCALES = ['en', 'fr', 'ar', 'all'] as const;
export const CLAIM_AUTHORITIES = [
	'canonical-data',
	'compiler',
	'generated-artifact',
	'signed-decision'
] as const;
export const CLAIM_ASSURANCES = ['compiled', 'editorial', 'independent'] as const;
export const CLAIM_VALIDITIES = [
	'current-build',
	'cutoff-bound',
	'release-pinned',
	'deployment-pinned'
] as const;

/** Which authority a resolver source may claim. A hand-recorded file can never
 * present itself as compiler output, and a compiler artifact cannot present
 * itself as a signed decision. */
export const AUTHORITY_BY_SOURCE: Record<ResolverSource, readonly string[]> = {
	stats: ['compiler', 'generated-artifact'],
	dataset: ['canonical-data', 'compiler', 'generated-artifact'],
	review: ['compiler', 'generated-artifact', 'canonical-data'],
	'editorial-queue': ['compiler', 'generated-artifact'],
	media: ['canonical-data', 'compiler', 'generated-artifact'],
	world: ['canonical-data', 'compiler', 'generated-artifact'],
	release: ['signed-decision', 'generated-artifact'],
	'deployment-manifest': ['signed-decision', 'generated-artifact'],
	'content-translation': ['canonical-data', 'compiler'],
	'data-translation': ['compiler', 'generated-artifact'],
	study: ['canonical-data', 'compiler']
};

/** Assurance a resolver source may claim. Only the study population may be
 * called independent; an editorial note may not, and a compiled metric may not
 * present itself as either. */
export const ASSURANCE_BY_SOURCE: Record<ResolverSource, readonly string[]> = {
	stats: ['compiled'],
	dataset: ['compiled'],
	review: ['editorial', 'compiled'],
	'editorial-queue': ['editorial'],
	media: ['editorial', 'compiled'],
	world: ['compiled'],
	release: ['compiled'],
	'deployment-manifest': ['compiled'],
	'content-translation': ['editorial', 'compiled'],
	'data-translation': ['compiled'],
	study: ['independent']
};

export const INVENTORY_RULES = [
	/** A template with generated or generated-adjacent values; scanned for unregistered figures. */
	'generated-template',
	/** Authored prose that states current product/dataset figures; scanned. */
	'authored-prose',
	/** The active release paper: only `<!--stat:-->` spans and its current-state summary are governed. */
	'release-paper',
	/** Superseded history: kept, never a live claim surface. */
	'historical-prose',
	/** A generated artifact bound to another surface; never hand-edited. */
	'generated-artifact',
	/** A canonical record or manifest that resolvers read; not a public surface itself. */
	'resolver-input'
] as const;
export type InventoryRule = (typeof INVENTORY_RULES)[number];

const SurfaceSchema = z
	.object({
		path: z.string().min(1),
		locator: z.string().min(1),
		/** Optional per-surface rendering (locale typography). The value still comes from one resolver. */
		format: z.enum(CLAIM_FORMATS).optional()
	})
	.strict();

const ClaimSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'claim ids are lowercase slugs'),
		kind: z.enum(CLAIM_KINDS),
		claim: z.string().min(1),
		surfaces: z.array(SurfaceSchema),
		resolver: z.object({ source: z.enum(RESOLVER_SOURCES), key: z.string().min(1) }).strict(),
		format: z.enum(CLAIM_FORMATS),
		population: z.string().min(1),
		lifecycle: z.enum(CLAIM_LIFECYCLES),
		locale: z.enum(CLAIM_LOCALES),
		owner: z.string().min(1),
		authority: z.enum(CLAIM_AUTHORITIES),
		assurance: z.enum(CLAIM_ASSURANCES),
		validity: z.enum(CLAIM_VALIDITIES)
	})
	.strict()
	.superRefine((claim, ctx) => {
		const authorities = AUTHORITY_BY_SOURCE[claim.resolver.source];
		if (!authorities.includes(claim.authority)) {
			ctx.addIssue({
				code: 'custom',
				message: `authority "${claim.authority}" is not possible for source "${claim.resolver.source}" (${authorities.join(' | ')})`
			});
		}
		const assurances = ASSURANCE_BY_SOURCE[claim.resolver.source];
		if (!assurances.includes(claim.assurance)) {
			ctx.addIssue({
				code: 'custom',
				message: `assurance "${claim.assurance}" is not possible for source "${claim.resolver.source}" (${assurances.join(' | ')})`
			});
		}
		if (claim.assurance === 'independent' && claim.resolver.source !== 'study') {
			ctx.addIssue({ code: 'custom', message: 'only the study population may claim independent assurance' });
		}
	});

const InventorySchema = z
	.object({
		path: z.string().min(1),
		rule: z.enum(INVENTORY_RULES),
		note: z.string().min(1),
		/** Narrow reviewed exclusions (regex), for dates, citations and historical quotations. */
		exclude: z.array(z.string().min(1)).default([])
	})
	.strict();

const PublicClaimsFileSchema = z
	.object({
		schemaVersion: z.literal(1),
		inventory: z.array(InventorySchema).min(1),
		claims: z.array(ClaimSchema).min(1)
	})
	.strict();

export type Claim = z.infer<typeof ClaimSchema>;
export type ClaimSurface = z.infer<typeof SurfaceSchema>;
export type InventoryEntry = z.infer<typeof InventorySchema>;
export type PublicClaimsFile = z.infer<typeof PublicClaimsFileSchema>;

export function parsePublicClaims(text: string): PublicClaimsFile {
	return PublicClaimsFileSchema.parse(parseYaml(text));
}

export function loadPublicClaims(path: string): PublicClaimsFile {
	if (!existsSync(path)) throw new ClaimError('MISSING_DECLARATION', `declaration file not found: ${path}`);
	return parsePublicClaims(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------
// Errors and issues
// ---------------------------------------------------------------------------

export class ClaimError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
	}
}

export interface ClaimIssue {
	code: string;
	detail: string;
	claimId?: string;
}

// ---------------------------------------------------------------------------
// Context: the typed state every resolver reads
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function readJson(path: string): Json {
	if (!existsSync(path)) throw new ClaimError('MISSING_STATE', `generated state missing: ${path} — run npm run data`);
	return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

function readYamlFile(path: string): unknown {
	if (!existsSync(path)) throw new ClaimError('MISSING_STATE', `state missing: ${path}`);
	return parseYaml(readFileSync(path, 'utf8'));
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

export interface ClaimContext {
	root: string;
	stats: Record<string, string>;
	dataset: Json;
	editorialQueue: Json;
	mediaIndex: Json[];
	flowsManifest: Json;
	world: Json;
	worldClaims: unknown[];
	releaseBaseline: Json;
	sensitivity: Json;
	networkContinuity: Json;
	verifications: unknown[];
	sourceExceptions: unknown[];
	contentFiles: { path: string; translatedBy: string | null }[];
	landingStrings: Record<'en' | 'fr' | 'ar', Record<string, string>>;
	wrangler: string;
}

export function loadClaimContext(root: string): ClaimContext {
	const j = (rel: string) => readJson(join(root, rel));
	const y = (rel: string) => readYamlFile(join(root, rel));
	const arr = (v: unknown) => (Array.isArray(v) ? v : []);
	const contentDir = join(root, 'src', 'content');
	const contentFiles = walk(contentDir)
		.filter((p) => p.endsWith('.md'))
		.map((p) => {
			const text = readFileSync(p, 'utf8');
			const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
			const fm = m ? (parseYaml(m[1]) as Record<string, unknown>) : {};
			return {
				path: p.slice(root.length + 1).split('\\').join('/'),
				translatedBy: typeof fm?.translated_by === 'string' ? fm.translated_by : null
			};
		});
	const strings = (rel: string): Record<string, string> => {
		const p = join(root, rel);
		if (!existsSync(p)) throw new ClaimError('MISSING_STATE', `landing dictionary missing: ${rel}`);
		return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
	};
	const wranglerPath = join(root, 'wrangler.toml');
	return {
		root,
		stats: JSON.parse(readFileSync(join(root, 'src', 'generated', 'stats.json'), 'utf8')) as Record<string, string>,
		dataset: j('src/generated/dataset.json'),
		editorialQueue: j('static/editorial-queue.json'),
		mediaIndex: arr(j('src/generated/media/index.json')) as Json[],
		flowsManifest: j('flows/manifest.json'),
		world: j('src/generated/world.json'),
		worldClaims: arr(y('data/world-claims.yaml')),
		releaseBaseline: j('output/release-baseline.json'),
		sensitivity: j('static/sensitivity.json'),
		networkContinuity: j('src/generated/network-continuity.json'),
		verifications: arr(y('data/verifications.yaml')),
		sourceExceptions: arr(y('data/source-exceptions.yaml')),
		contentFiles,
		landingStrings: {
			en: strings('landing/_strings.en.json'),
			fr: strings('landing/_strings.fr.json'),
			ar: strings('landing/_strings.ar.json')
		},
		wrangler: existsSync(wranglerPath) ? readFileSync(wranglerPath, 'utf8') : ''
	};
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface Resolved {
	/** The raw typed value: a number for metrics, a string for states. */
	value: number | string;
	/** Where the value came from, printed in the review table and the export. */
	basis: string;
	/** Optional as-of date the value belongs to. */
	asOf?: string;
}

type Resolver = (key: string, ctx: ClaimContext) => Resolved;

function dotted(obj: unknown, path: string): unknown {
	let cur: unknown = obj;
	for (const part of path.split('.')) {
		if (cur === null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

function num(v: unknown, what: string): number {
	const n = typeof v === 'number' ? v : Number(v);
	if (!Number.isFinite(n)) throw new ClaimError('UNRESOLVED', `${what} is not a finite number: ${JSON.stringify(v)}`);
	return n;
}

function flagTotal(ctx: ClaimContext, flag: string): number {
	return num(dotted(ctx.dataset, `meta.review.flags.${flag}.total`), `review flag ${flag}`);
}

function countExceptions(ctx: ClaimContext, rule: string): number {
	return ctx.sourceExceptions.filter((e) => (e as Json)?.rule === rule).length;
}

/** Is `module` imported by any runtime file under community/ (the server and
 * worker), as opposed to by tests or docs? This is how a "specified but not
 * wired" feature claim is resolved from the code rather than hand-typed. */
function wiredInRuntime(ctx: ClaimContext, module: string): boolean {
	const dir = join(ctx.root, 'community');
	for (const file of walk(dir)) {
		const base = file.split('/').pop() ?? '';
		if (base === `${module}.ts` || base.endsWith('.test.ts')) continue;
		const text = readFileSync(file, 'utf8');
		if (new RegExp(`from\\s+['"]\\./${module}(\\.ts)?['"]`).test(text)) return true;
	}
	return false;
}

const RESOLVERS: Record<ResolverSource, Resolver> = {
	stats(key, ctx) {
		if (!(key in ctx.stats)) throw new ClaimError('UNRESOLVED', `stats.json has no key "${key}"`);
		return { value: ctx.stats[key], basis: `src/generated/stats.json#${key}`, asOf: ctx.stats.cutoff || undefined };
	},

	dataset(key, ctx) {
		if (key.startsWith('meta.')) {
			const v = dotted(ctx.dataset, key);
			if (v === undefined) throw new ClaimError('UNRESOLVED', `dataset.json has no path "${key}"`);
			return { value: typeof v === 'object' ? JSON.stringify(v) : (v as number | string), basis: `src/generated/dataset.json#${key}` };
		}
		const special: Record<string, () => Resolved> = {
			'source-tier-1': () => tier(ctx, 1),
			'source-tier-2': () => tier(ctx, 2),
			'source-tier-3': () => tier(ctx, 3),
			'source-tier-4': () => tier(ctx, 4),
			'source-tier-5': () => tier(ctx, 5),
			'contested-about-people': () => {
				const people = new Set(((ctx.dataset.people as Json[]) ?? []).map((p) => p.id));
				const contested = new Set(['reported', 'inferred', 'unsubstantiated']);
				const n = ((ctx.dataset.relationships as Json[]) ?? []).filter(
					(r) => contested.has(String(r.basis)) && (people.has(r.from) || people.has(r.to))
				).length;
				return {
					value: n,
					basis:
						'src/generated/dataset.json relationships whose basis is reported, inferred or unsubstantiated ' +
						'and whose endpoints include at least one person'
				};
			},
			'sensitivity.indices': () => ({
				value: Object.keys(dotted(ctx.sensitivity, 'counts.scoredByKey') as object).length,
				basis: 'static/sensitivity.json#counts.scoredByKey',
				asOf: String(ctx.sensitivity.generated ?? '')
			}),
			'sensitivity.people-scored-influence': () => ({
				value: num(dotted(ctx.sensitivity, 'counts.scoredInfluence'), 'sensitivity scoredInfluence'),
				basis: 'static/sensitivity.json#counts.scoredInfluence',
				asOf: String(ctx.sensitivity.generated ?? '')
			}),
			'sensitivity.people-total': () => ({
				value: num(dotted(ctx.sensitivity, 'counts.totalPeople'), 'sensitivity totalPeople'),
				basis: 'static/sensitivity.json#counts.totalPeople',
				asOf: String(ctx.sensitivity.generated ?? '')
			}),
			'sensitivity.sparse-threshold': () => ({
				value: num(dotted(ctx.sensitivity, 'thresholds.sparseScored'), 'sensitivity sparseScored'),
				basis: 'static/sensitivity.json#thresholds.sparseScored'
			}),
			'network-continuity.cohort-dates': () => ({
				value: ((dotted(ctx.networkContinuity, 'parameters.cohortDates') as string[]) ?? []).length,
				basis: 'src/generated/network-continuity.json#parameters.cohortDates'
			}),
			'network-continuity.paths-primary': () => ({
				value: (((dotted(ctx.networkContinuity, 'paths.cohort1to2.primary') as unknown[]) ?? []).length),
				basis: 'src/generated/network-continuity.json#paths.cohort1to2.primary'
			}),
			'network-continuity.triage-reviewed': () => ({
				value: num(dotted(ctx.networkContinuity, 'review.reviewed'), 'continuity triage reviewed'),
				basis: 'src/generated/network-continuity.json#review.reviewed',
				asOf: String(dotted(ctx.networkContinuity, 'review.review_date') ?? '')
			}),
			'network-continuity.triage-refuted': () => ({
				value: num(dotted(ctx.networkContinuity, 'review.refuted'), 'continuity triage refuted'),
				basis: 'src/generated/network-continuity.json#review.refuted'
			}),
			'network-continuity.null-trials': () => ({
				value: num(dotted(ctx.networkContinuity, 'nullControls.shuffledCohorts.trials'), 'null trials'),
				basis: 'src/generated/network-continuity.json#nullControls.shuffledCohorts.trials'
			}),
			'network-continuity.null-at-least-real': () => ({
				value: num(dotted(ctx.networkContinuity, 'nullControls.shuffledCohorts.atLeastReal'), 'null atLeastReal'),
				basis: 'src/generated/network-continuity.json#nullControls.shuffledCohorts.atLeastReal'
			})
		};
		const s = special[key];
		if (!s) throw new ClaimError('UNRESOLVED', `dataset resolver has no key "${key}"`);
		return s();
	},

	review(key, ctx) {
		const meta = dotted(ctx.dataset, 'meta.review') as Json;
		const keys: Record<string, Resolved> = {
			'editorial-notes': {
				value: num(meta?.reviewed, 'review.reviewed'),
				basis: 'src/generated/dataset.json#meta.review.reviewed'
			},
			'editorial-notes-denominator': {
				value: num(meta?.reviewable, 'review.reviewable'),
				basis: 'src/generated/dataset.json#meta.review.reviewable'
			},
			'flag-unsubstantiated': { value: flagTotal(ctx, 'unsubstantiated'), basis: 'dataset meta.review.flags.unsubstantiated.total' },
			'flag-attributed': { value: flagTotal(ctx, 'attributed'), basis: 'dataset meta.review.flags.attributed.total' },
			'flag-inferred': { value: flagTotal(ctx, 'inferred'), basis: 'dataset meta.review.flags.inferred.total' },
			'exceptions-total': {
				value: ctx.sourceExceptions.length,
				basis: 'data/source-exceptions.yaml (overlapping categories, never summed)'
			},
			'exceptions-basis-override': {
				value: countExceptions(ctx, 'basis-override'),
				basis: 'data/source-exceptions.yaml#rule=basis-override'
			},
			'exceptions-no-source': {
				value: countExceptions(ctx, 'no-source'),
				basis: 'data/source-exceptions.yaml#rule=no-source'
			},
			'exceptions-grade-a-primary': {
				value: countExceptions(ctx, 'grade-a-primary'),
				basis: 'data/source-exceptions.yaml#rule=grade-a-primary'
			}
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `review resolver has no key "${key}"`);
		return s;
	},

	'editorial-queue': (key, ctx) => {
		const map: Record<string, string> = { total: 'total', reviewed: 'reviewed', generated: 'generated' };
		if (!(key in map)) throw new ClaimError('UNRESOLVED', `editorial-queue resolver has no key "${key}"`);
		const v = ctx.editorialQueue[map[key]];
		if (typeof v === 'number') return { value: v, basis: `static/editorial-queue.json#${map[key]}` };
		return { value: String(v), basis: `static/editorial-queue.json#${map[key]}` };
	},

	media(key, ctx) {
		const idx = ctx.mediaIndex;
		const research = walk(join(ctx.root, 'src', 'content', 'media'))
			.filter((p) => p.endsWith('research.yaml'))
			.map((p) => parseYaml(readFileSync(p, 'utf8')) as Json);
		const datasets = (dotted(ctx.flowsManifest, 'datasets') as Json[]) ?? [];
		const keys: Record<string, () => Resolved> = {
			'shipped-index': () => ({ value: idx.length, basis: 'src/generated/media/index.json (shipped index population)' }),
			published: () => ({
				value: idx.filter((i) => i.status === 'published').length,
				basis: 'src/generated/media/index.json#status=published'
			}),
			drafts: () => ({
				value: idx.filter((i) => i.status === 'draft').length,
				basis: 'src/generated/media/index.json#status=draft'
			}),
			'research-ledger-sources': () => ({
				value: research.reduce((n, r) => n + num(r.sources_consulted_count ?? 0, 'sources_consulted_count'), 0),
				basis: 'src/content/media/*/research.yaml#sources_consulted_count (research ledger population)'
			}),
			'shipped-claims': () => ({
				value: idx.reduce((n, i) => n + num(i.claim_count ?? 0, 'claim_count'), 0),
				basis: 'src/generated/media/index.json#claim_count (shipped claims, never the consulted ledger)'
			}),
			'shipped-sources': () => ({
				value: idx.reduce((n, i) => n + num(i.source_count ?? 0, 'source_count'), 0),
				basis: 'src/generated/media/index.json#source_count'
			}),
			'manifest-datasets': () => ({
				value: datasets.length,
				basis: 'flows/manifest.json#datasets',
				asOf: String(ctx.flowsManifest.generated ?? '')
			}),
			'bot-farm-status': () => {
				const it = idx.find((i) => i.slug === 'bot-farm');
				if (!it) throw new ClaimError('UNRESOLVED', 'media index has no bot-farm investigation');
				return { value: String(it.status), basis: 'src/generated/media/index.json#slug=bot-farm.status', asOf: String(it.published ?? '') };
			}
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `media resolver has no key "${key}"`);
		return s();
	},

	world(key, ctx) {
		const datasets = (dotted(ctx.flowsManifest, 'datasets') as Json[]) ?? [];
		const keys: Record<string, () => Resolved> = {
			claims: () => ({ value: ctx.worldClaims.length, basis: 'data/world-claims.yaml' }),
			'snapshot-generated': () => ({
				value: String(ctx.world.generated ?? ''),
				basis: 'src/generated/world.json#generated'
			}),
			'manifest-datasets': () => ({
				value: datasets.length,
				basis: 'flows/manifest.json#datasets',
				asOf: String(ctx.flowsManifest.generated ?? '')
			})
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `world resolver has no key "${key}"`);
		return s();
	},

	release(key, ctx) {
		const rel = (ctx.releaseBaseline.release ?? {}) as Json;
		const keys: Record<string, () => Resolved> = {
			'current-tag': () => ({ value: String(rel.currentTag ?? ''), basis: 'output/release-baseline.json#release.currentTag' }),
			'target-version': () => ({ value: String(rel.targetVersion ?? ''), basis: 'output/release-baseline.json#release.targetVersion' }),
			'package-version': () => ({ value: String(rel.packageVersion ?? ''), basis: 'output/release-baseline.json#release.packageVersion' }),
			recorded: () => ({
				value: String(ctx.releaseBaseline.recordedAt ?? ''),
				basis: 'output/release-baseline.json#recordedAt'
			}),
			'milestone': () => ({ value: String(ctx.releaseBaseline.milestone ?? ''), basis: 'output/release-baseline.json#milestone' })
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `release resolver has no key "${key}"`);
		return s();
	},

	'deployment-manifest': (key, ctx) => {
		const dep = (ctx.releaseBaseline.deployment ?? {}) as Json;
		const auth = (dep.verification ?? {}) as Json;
		const bindings = (dep.bindings ?? {}) as Json;
		const configMode = ctx.wrangler.match(/COMMUNITY_MODE\s*=\s*"([a-z-]+)"/)?.[1] ?? '';
		const keys: Record<string, () => Resolved> = {
			'deployed-version': () => ({ value: String(dep.versionId ?? ''), basis: 'output/release-baseline.json#deployment.versionId' }),
			'deployed-at': () => ({ value: String(dep.deployedAt ?? ''), basis: 'output/release-baseline.json#deployment.deployedAt' }),
			'deployed-commit': () => ({ value: String(dep.commit ?? ''), basis: 'output/release-baseline.json#deployment.commit' }),
			'deployed-mode': () => ({
				value: String(dep.effectiveMode ?? bindings.COMMUNITY_MODE ?? ''),
				basis: 'output/release-baseline.json#deployment.effectiveMode'
			}),
			'config-mode': () => ({ value: configMode, basis: 'wrangler.toml#vars.COMMUNITY_MODE' }),
			'verification-passed': () => ({
				value: num(auth.passed ?? 0, 'deployment verification passed'),
				basis: 'output/release-baseline.json#deployment.verification.passed',
				asOf: String(dep.deployedAt ?? '')
			}),
			'rollback-version': () => ({
				value: String(dotted(dep, 'rollback.versionId') ?? ''),
				basis: 'output/release-baseline.json#deployment.rollback.versionId'
			}),
			'feature-budget': () => ({
				value: wiredInRuntime(ctx, 'budget') ? 'wired' : 'specified-not-wired',
				basis: 'community runtime import graph'
			}),
			'feature-hold': () => {
				const hold = /export\s+(?:const\s+)?HOLD_MS/.test(readFileSync(join(ctx.root, 'community', 'budget.ts'), 'utf8'));
				return {
					value: hold && wiredInRuntime(ctx, 'budget') ? 'wired' : 'specified-not-wired',
					basis: 'community/budget.ts HOLD_MS + community runtime import graph'
				};
			},
			'feature-petitions': () => ({
				value: readFileSync(join(ctx.root, 'community', 'api.ts'), 'utf8').includes('petition') ? 'wired' : 'specified-not-wired',
				basis: 'community/api.ts'
			})
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `deployment-manifest resolver has no key "${key}"`);
		return s();
	},

	'content-translation': (key, ctx) => {
		const pages = ctx.contentFiles;
		const byLocale = (loc: string) => pages.filter((p) => p.path.endsWith(`.${loc}.md`));
		const countBy = (loc: string, tier: string) => byLocale(loc).filter((p) => p.translatedBy === tier).length;
		const dir = join(ctx.root, 'landing');
		const keys: Record<string, () => Resolved> = {
			'pages-en': () => ({ value: byLocale('en').length, basis: 'src/content/**/*.en.md' }),
			'pages-fr': () => ({ value: byLocale('fr').length, basis: 'src/content/**/*.fr.md' }),
			'pages-ar': () => ({ value: byLocale('ar').length, basis: 'src/content/**/*.ar.md' }),
			'human-en': () => ({ value: countBy('en', 'human'), basis: 'src/content frontmatter translated_by=human' }),
			'human-fr': () => ({ value: countBy('fr', 'human'), basis: 'src/content frontmatter translated_by=human' }),
			'human-ar': () => ({ value: countBy('ar', 'human'), basis: 'src/content frontmatter translated_by=human' }),
			'model-reviewed-fr': () => ({ value: countBy('fr', 'model-reviewed'), basis: 'src/content frontmatter translated_by=model-reviewed' }),
			'model-reviewed-ar': () => ({ value: countBy('ar', 'model-reviewed'), basis: 'src/content frontmatter translated_by=model-reviewed' }),
			'landing-en-keys': () => ({
				value: Object.keys(ctx.landingStrings.en).length,
				basis: 'landing/_strings.en.json key count (landing dictionary population)'
			}),
			'landing-fr-keys': () => ({
				value: Object.keys(ctx.landingStrings.fr).length,
				basis: 'landing/_strings.fr.json key count (landing dictionary population)'
			}),
			'landing-ar-keys': () => ({
				value: Object.keys(ctx.landingStrings.ar).length,
				basis: 'landing/_strings.ar.json key count (landing dictionary population)'
			}),
			'dictionary-missing-fr': () => ({
				value: Object.keys(ctx.landingStrings.en).filter((k) => !(k in ctx.landingStrings.fr)).length,
				basis: 'landing/_strings.fr.json against the English key set'
			}),
			'dictionary-missing-ar': () => ({
				value: Object.keys(ctx.landingStrings.en).filter((k) => !(k in ctx.landingStrings.ar)).length,
				basis: 'landing/_strings.ar.json against the English key set'
			})
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `content-translation resolver has no key "${key}"`);
		return s();
	},

	'data-translation': (key, ctx) => {
		const t = dotted(ctx.dataset, 'meta.translation') as Json;
		const path: Record<string, string> = {
			'fr-total': 'fr.total',
			'fr-done': 'fr.done',
			'fr-human': 'fr.tiers.human',
			'fr-model-reviewed': 'fr.tiers.model-reviewed',
			'ar-total': 'ar.total',
			'ar-done': 'ar.done',
			'ar-human': 'ar.tiers.human',
			'ar-model-reviewed': 'ar.tiers.model-reviewed'
		};
		const p = path[key];
		if (!p) throw new ClaimError('UNRESOLVED', `data-translation resolver has no key "${key}"`);
		return { value: num(dotted(t, p), `translation ${p}`), basis: `src/generated/dataset.json#meta.translation.${p}` };
	},

	study(key, ctx) {
		const v = ctx.verifications as Json[];
		const keys: Record<string, () => Resolved> = {
			'verification-records': () => ({ value: v.length, basis: 'data/verifications.yaml' }),
			'independent-checks': () => ({ value: v.length, basis: 'data/verifications.yaml (the only independent population)' }),
			supported: () => ({ value: v.filter((r) => r.outcome === 'supported').length, basis: 'data/verifications.yaml#outcome=supported' }),
			refuted: () => ({ value: v.filter((r) => r.outcome === 'refuted').length, basis: 'data/verifications.yaml#outcome=refuted' })
		};
		const s = keys[key];
		if (!s) throw new ClaimError('UNRESOLVED', `study resolver has no key "${key}"`);
		return s();
	}
};

function tier(ctx: ClaimContext, n: number): Resolved {
	const sources = (ctx.dataset.sources as Json[]) ?? [];
	return { value: sources.filter((s) => s.tier === n).length, basis: `src/generated/dataset.json#sources.tier=${n}` };
}

export function resolveClaim(claim: Claim, ctx: ClaimContext): Resolved {
	return RESOLVERS[claim.resolver.source](claim.resolver.key, ctx);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const WORDS = [
	'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
	'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'
];

function group(n: number, sep: string): string {
	return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function displayValue(value: number | string, format: ClaimFormat): string {
	if (format === 'text' || format === 'iso-date' || format === 'version') return String(value);
	const n = typeof value === 'number' ? value : Number(value);
	switch (format) {
		case 'plain':
			return String(value);
		case 'comma':
			return group(n, ',');
		case 'space':
			return group(n, ' ');
		case 'ar-comma':
			return group(n, '\u066C');
		case 'mb1':
			return (n / 1024).toFixed(1);
		case 'mb1-fr':
			return (n / 1024).toFixed(1).replace('.', ',');
		case 'mb1-ar':
			return (n / 1024).toFixed(1).replace('.', '\u066B');
		case 'percent':
			return `${Math.round(n)}%`;
		case 'word':
			return WORDS[n] ?? String(n);
		case 'word-cap': {
			const w = WORDS[n] ?? String(n);
			return w.charAt(0).toUpperCase() + w.slice(1);
		}
		default:
			return String(value);
	}
}

export function displayFor(claim: Claim, resolved: Resolved, surface?: ClaimSurface): string {
	return displayValue(resolved.value, surface?.format ?? claim.format);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function countCaptureGroups(locator: string): number {
	let count = 0;
	let escaped = false;
	let inClass = false;
	for (let i = 0; i < locator.length; i++) {
		const c = locator[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (c === '\\') escaped = true;
		else if (c === '[') inClass = true;
		else if (c === ']') inClass = false;
		else if (c === '(' && !inClass && locator[i + 1] !== '?') count++;
	}
	return count;
}

function lineOf(text: string, index: number): number {
	return text.slice(0, index).split('\n').length;
}

function isDirectory(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory();
}

function inventoryCovers(inventory: InventoryEntry[], surfacePath: string): boolean {
	return inventory.some((e) => surfacePath === e.path || surfacePath.startsWith(e.path.endsWith('/') ? e.path : `${e.path}/`));
}

export interface ValidationResult {
	issues: ClaimIssue[];
	resolved: Map<string, Resolved>;
}

/**
 * Validate the declaration against the repository. Never throws for claim
 * problems — it collects them, so a test can assert on codes and a build can
 * print every failure at once.
 */
export function validateClaims(file: PublicClaimsFile, root: string, ctx = loadClaimContext(root)): ValidationResult {
	const issues: ClaimIssue[] = [];
	const resolved = new Map<string, Resolved>();

	// --- duplicates and reserved id shapes ---------------------------------
	const seenIds = new Set<string>();
	const seenLocators = new Set<string>();
	for (const claim of file.claims) {
		if (seenIds.has(claim.id)) issues.push({ code: 'DUPLICATE_ID', detail: `claim id "${claim.id}" is declared twice`, claimId: claim.id });
		seenIds.add(claim.id);
		for (const surface of claim.surfaces) {
			const key = `${surface.path}\u0000${surface.locator}`;
			if (seenLocators.has(key)) {
				issues.push({ code: 'DUPLICATE_LOCATOR', detail: `${surface.path} has two claims matching the same locator`, claimId: claim.id });
			}
			seenLocators.add(key);
			if (!inventoryCovers(file.inventory, surface.path)) {
				issues.push({ code: 'UNINVENTORIED_SURFACE', detail: `${surface.path} is not listed in the inventory`, claimId: claim.id });
			}
		}
		if (claim.assurance === 'independent' && claim.resolver.source !== 'study') {
			issues.push({ code: 'MALFORMED', detail: `claim "${claim.id}" claims independent assurance from ${claim.resolver.source}`, claimId: claim.id });
		}
	}

	// --- inventory paths must exist ----------------------------------------
	for (const entry of file.inventory) {
		if (!existsSync(join(root, entry.path))) {
			issues.push({ code: 'MISSING_INVENTORY_PATH', detail: `inventory path does not exist: ${entry.path}` });
		}
	}

	// --- resolution + surfaces ---------------------------------------------
	for (const claim of file.claims) {
		let r: Resolved;
		try {
			r = resolveClaim(claim, ctx);
		} catch (e) {
			const err = e as ClaimError;
			issues.push({ code: err.code === 'UNRESOLVED' ? 'UNRESOLVED' : 'MISSING_STATE', detail: `${claim.resolver.source}:${claim.resolver.key} — ${err.message}`, claimId: claim.id });
			continue;
		}
		resolved.set(claim.id, r);

		for (const surface of claim.surfaces) {
			const path = join(root, surface.path);
			if (!existsSync(path)) {
				issues.push({ code: 'MISSING_SURFACE', detail: `${surface.path} does not exist`, claimId: claim.id });
				continue;
			}
			const text = readFileSync(path, 'utf8');
			if (countCaptureGroups(surface.locator) !== 1) {
				issues.push({ code: 'MALFORMED_LOCATOR', detail: `${surface.path}: locator needs exactly one capture group`, claimId: claim.id });
				continue;
			}
			let matches: RegExpMatchArray[];
			try {
				matches = [...text.matchAll(new RegExp(surface.locator, 'gm'))];
			} catch (e) {
				issues.push({ code: 'MALFORMED_LOCATOR', detail: `${surface.path}: ${(e as Error).message}`, claimId: claim.id });
				continue;
			}
			if (claim.lifecycle === 'superseded') {
				if (matches.length > 0) {
					issues.push({
						code: 'RETIRED_STILL_PUBLISHED',
						detail: `${surface.path}:${lineOf(text, matches[0].index ?? 0)} still publishes the superseded value "${matches[0][1]}"`,
						claimId: claim.id
					});
				}
				continue;
			}
			if (matches.length === 0) {
				issues.push({ code: 'STALE_SURFACE', detail: `${surface.path}: locator no longer matches — the prose was edited or removed`, claimId: claim.id });
				continue;
			}
			if (matches.length > 1) {
				issues.push({ code: 'DUPLICATE_MATCH', detail: `${surface.path}: locator matches ${matches.length} times — make it specific`, claimId: claim.id });
				continue;
			}
			const published = matches[0][1];
			if (claim.lifecycle === 'historical' || claim.lifecycle === 'planning') continue;
			if (claim.validity === 'release-pinned' || claim.validity === 'deployment-pinned') {
				if (!r.asOf && claim.resolver.source === 'stats') {
					issues.push({ code: 'UNVERIFIABLE', detail: `claim "${claim.id}" is ${claim.validity} but resolves without an as-of date`, claimId: claim.id });
				}
			}
			const expected = displayFor(claim, r, surface);
			if (published !== expected) {
				issues.push({
					code: 'STALE',
					detail: `${surface.path}:${lineOf(text, matches[0].index ?? 0)} publishes "${published}" but ${claim.resolver.source}:${claim.resolver.key} resolves "${expected}"`,
					claimId: claim.id
				});
			}
		}
	}

	return { issues, resolved };
}

/**
 * The `<!--stat:key-->value<!--/stat-->` spans in governed documents are a
 * second resolution channel (scripts/build-data.ts rewrites them). Every span
 * must be bound to exactly one declared `stats` claim, and its printed value
 * must equal the raw resolved value.
 */
export function checkStatSpans(file: PublicClaimsFile, root: string, ctx = loadClaimContext(root)): ClaimIssue[] {
	const issues: ClaimIssue[] = [];
	const byKey = new Map<string, Claim[]>();
	for (const claim of file.claims) {
		if (claim.resolver.source !== 'stats') continue;
		byKey.set(claim.resolver.key, [...(byKey.get(claim.resolver.key) ?? []), claim]);
	}
	const governed = file.inventory.filter((e) => e.rule === 'generated-template' || e.rule === 'authored-prose');
	for (const entry of governed) {
		const p = join(root, entry.path);
		if (!existsSync(p) || isDirectory(p)) continue;
		const text = readFileSync(p, 'utf8');
		for (const m of text.matchAll(/<!--stat:([A-Za-z][A-Za-z0-9-]*)-->([\s\S]*?)<!--\/stat-->/g)) {
			const [, key, shown] = m;
			const claims = byKey.get(key);
			if (!claims) {
				issues.push({ code: 'UNREGISTERED_STAT', detail: `${entry.path}: stat "${key}" has no declared claim` });
				continue;
			}
			for (const claim of claims) {
				const r = resolveClaim(claim, ctx);
				if (shown !== String(r.value)) {
					issues.push({
						code: 'STALE_STAT',
						detail: `${entry.path}: stat "${key}" shows "${shown}" but resolves "${r.value}"`,
						claimId: claim.id
					});
				}
			}
			if (claims.length > 1) {
				issues.push({ code: 'DUPLICATE_STAT', detail: `${entry.path}: stat "${key}" is bound to ${claims.length} claims` });
			}
		}
	}
	return issues;
}

/**
 * The unregistered-mutable-figure scan.
 *
 * Governed templates must not carry a current product figure that no declaration
 * covers. The patterns are deliberately narrow — a figure attached to a stat
 * noun, a payload size — and the reviewed exclusions in the inventory entry are
 * where dates, citations and historical quotations are named one by one. A hit
 * here means either a declaration is missing or an exclusion needs review.
 *
 * Returns one issue per uncovered match. `superseded` claims' locators cover
 * nothing; their retired check is the point, not their value.
 */
export function scanUnregistered(file: PublicClaimsFile, root: string): ClaimIssue[] {
	const issues: ClaimIssue[] = [];
	const PATTERNS = [
		/\b\d(?:[\d,]*\d)?\s+(?:claims?|records?|sources?|people|persons?|positions?|relationships?|events?|institutions?|offices?|strings?|reviews?|indices|investigations?|datasets?|verifications?|exceptions?|gaps?|overlaps?|contradictions?)\b/gi,
		/\b\d+(?:[.,]\d+)?\s?(?:MB|KB|GB)\b/gi,
		// A ratio with a two-digit side, so CSS values like `0 / 0` are not figures.
		/\b\d{2,}[\d,]*\s*\/\s*\d[\d,]*\b|\b\d[\d,]*\s*\/\s*\d{2,}[\d,]*\b/g,
		// A COUNT attached to an independence phrase. A qualitative sentence ("no
		// note yet records an independent check") is not a mutable figure; a count
		// is, and it must resolve through the study population.
		/\b\d[\d,]*\b[^.\n]{0,80}\bindependent(?:ly)?\s+(?:human\s+)?(?:review|reviews|check|checks|verification|verifications|verified|reviewed)\b/gi,
		/\bindependent(?:ly)?\s+(?:human\s+)?(?:review|reviews|check|checks|verification|verifications|verified|reviewed)\b[^.\n]{0,80}\b\d[\d,]*\b/gi
	];
	const claimsByPath = new Map<string, ClaimSurface[]>();
	for (const claim of file.claims) {
		if (claim.lifecycle === 'superseded') continue;
		for (const surface of claim.surfaces) {
			claimsByPath.set(surface.path, [...(claimsByPath.get(surface.path) ?? []), surface]);
		}
	}
	const scan = (entry: InventoryEntry, path: string, text: string) => {
		// The inline landing dictionaries are generated from the external locale
		// files (landing/_strings.{fr,ar}.json) at build time. Those files are
		// scanned directly; scanning the generated copy too would double-report
		// every figure and make the locators ambiguous.
		const generated = text.replace(
			/\/\* ---- BEGIN GENERATED DICTIONARIES[\s\S]*?---- END GENERATED DICTIONARIES ---- \*\//,
			(m) => ' '.repeat(m.length)
		);
		const covered: [number, number][] = [];
		for (const surface of claimsByPath.get(path) ?? []) {
			for (const m of generated.matchAll(new RegExp(surface.locator, 'gm'))) {
				const start = (m.index ?? 0) + m[0].indexOf(m[1]);
				covered.push([start, start + m[1].length]);
			}
		}
		// `<!--stat:key-->value<!--/stat-->` spans resolve through build-data.
		for (const m of generated.matchAll(/<!--stat:[A-Za-z][A-Za-z0-9-]*-->([\s\S]*?)<!--\/stat-->/g)) {
			const start = (m.index ?? 0) + m[0].indexOf(m[1]);
			covered.push([start, start + m[1].length]);
		}
		const overlaps = (a: number, b: number) => covered.some(([s, e]) => a < e && b > s);
		// Exclusions are matched against the LINE the figure sits on, because the
		// reviewed reasons are contextual: "tier-1/2 source" and "v0.0.2 record
		// kinds" are version and tier tokens, not counts.
		const exclusions = entry.exclude.map((r) => new RegExp(r, 'i'));
		const lineAt = (index: number) => {
			const start = text.lastIndexOf('\n', index) + 1;
			const end = text.indexOf('\n', index);
			return text.slice(start, end === -1 ? text.length : end);
		};
		for (const pattern of PATTERNS) {
			for (const m of generated.matchAll(pattern)) {
				const start = m.index ?? 0;
				const end = start + m[0].length;
				if (overlaps(start, end)) continue;
				if (exclusions.some((re) => re.test(lineAt(start)))) continue;
				issues.push({
					code: 'UNREGISTERED_FIGURE',
					detail: `${path}:${lineOf(text, start)} "${m[0]}" is not covered by a declaration`
				});
			}
		}
	};
	for (const entry of file.inventory) {
		if (
			entry.rule === 'historical-prose' ||
			entry.rule === 'generated-artifact' ||
			entry.rule === 'resolver-input' ||
			entry.rule === 'release-paper'
		) {
			continue;
		}
		const p = join(root, entry.path);
		if (!existsSync(p)) continue;
		if (isDirectory(p)) {
			// A more specific inventory entry owns the files beneath it. That is
			// how `src/content/` (page prose) and `src/content/media/` (investigation
			// evidence, a resolver input) stay separate: the evidence YAML is data
			// for the media resolvers, not a product-claim surface.
			const nested = file.inventory.filter((e) => e.path !== entry.path && e.path.startsWith(entry.path));
			for (const f of walk(p)) {
				if (!/\.(md|txt|html|json|ts|svelte|yaml)$/.test(f)) continue;
				const rel = f.slice(root.length + 1).split('\\').join('/');
				if (nested.some((e) => rel.startsWith(e.path))) continue;
				scan(entry, rel, readFileSync(f, 'utf8'));
			}
		} else {
			scan(entry, entry.path, readFileSync(p, 'utf8'));
		}
	}
	return issues;
}

// ---------------------------------------------------------------------------
// Generated outputs
// ---------------------------------------------------------------------------

export interface ResolvedClaimOutput {
	id: string;
	kind: string;
	claim: string;
	value: number | string;
	display: string;
	format: ClaimFormat;
	population: string;
	lifecycle: string;
	locale: string;
	owner: string;
	authority: string;
	assurance: string;
	validity: string;
	resolver: { source: ResolverSource; key: string };
	basis: string;
	asOf: string | null;
	surfaces: { path: string; locator: string; format: ClaimFormat }[];
}

export function buildResolvedRegistry(file: PublicClaimsFile, ctx: ClaimContext) {
	const claims: ResolvedClaimOutput[] = [];
	for (const claim of file.claims) {
		const r = resolveClaim(claim, ctx);
		claims.push({
			id: claim.id,
			kind: claim.kind,
			claim: claim.claim,
			value: r.value,
			display: displayValue(r.value, claim.format),
			format: claim.format,
			population: claim.population,
			lifecycle: claim.lifecycle,
			locale: claim.locale,
			owner: claim.owner,
			authority: claim.authority,
			assurance: claim.assurance,
			validity: claim.validity,
			resolver: { ...claim.resolver },
			basis: r.basis,
			asOf: r.asOf ?? null,
			surfaces: claim.surfaces.map((s) => ({ path: s.path, locator: s.locator, format: s.format ?? claim.format }))
		});
	}
	return {
		schemaVersion: 1 as const,
		generatedAt: new Date().toISOString(),
		cutoff: String((dotted(ctx.dataset, 'meta.parameters.time.cutoff') as string | undefined) ?? ctx.stats.cutoff ?? ''),
		counts: {
			claims: claims.length,
			current: claims.filter((c) => c.lifecycle === 'current').length,
			historical: claims.filter((c) => c.lifecycle === 'historical').length,
			planning: claims.filter((c) => c.lifecycle === 'planning').length,
			superseded: claims.filter((c) => c.lifecycle === 'superseded').length
		},
		claims
	};
}

export type ResolvedRegistry = ReturnType<typeof buildResolvedRegistry>;

/**
 * The public, non-secret build manifest. Deployment and freshness resolvers read
 * it; it is written to `static/build-manifest.json` and is deliberately not part
 * of the canonical Tunisia evidence graph.
 */
export function buildManifest(ctx: ClaimContext, registry: ResolvedRegistry) {
	const review = (dotted(ctx.dataset, 'meta.review') as Json) ?? {};
	const translation = (dotted(ctx.dataset, 'meta.translation') as Json) ?? {};
	const counts = (dotted(ctx.dataset, 'meta.counts') as Json) ?? {};
	const dep = (ctx.releaseBaseline.deployment ?? {}) as Json;
	return {
		schemaVersion: 1 as const,
		project: 'deeptunisia',
		origin: 'https://deeptunisia.org',
		license: 'CC-BY-4.0',
		generatedAt: registry.generatedAt,
		release: {
			packageVersion: String((ctx.releaseBaseline.release as Json)?.packageVersion ?? ''),
			currentTag: String((ctx.releaseBaseline.release as Json)?.currentTag ?? ''),
			targetVersion: String((ctx.releaseBaseline.release as Json)?.targetVersion ?? '')
		},
		build: {
			commit: process.env.DT_RELEASE_SHA ?? '',
			node: process.version
		},
		graph: {
			datasetHash: String((dotted(ctx.dataset, 'meta.datasetHash') as string | undefined) ?? ''),
			generated: String((dotted(ctx.dataset, 'meta.generated') as string | undefined) ?? ''),
			cutoff: String((dotted(ctx.dataset, 'meta.parameters.time.cutoff') as string | undefined) ?? ''),
			floor: String((dotted(ctx.dataset, 'meta.parameters.time.floor') as string | undefined) ?? ''),
			graphKB: Number(ctx.stats.graphKB ?? 0),
			shippedKB: Number(ctx.stats.shippedKB ?? 0),
			counts: {
				sources: Number(counts.sources ?? 0),
				people: Number(counts.people ?? 0),
				positions: Number(counts.positions ?? 0),
				relationships: Number(counts.relationships ?? 0),
				events: Number(counts.events ?? 0)
			}
		},
		populations: {
			review: {
				editorialNotes: Number(review.reviewed ?? 0),
				reviewable: Number(review.reviewable ?? 0),
				independentChecks: ctx.verifications.length,
				editorialQueue: Number(ctx.editorialQueue.total ?? 0),
				note: 'separate populations, never summed'
			},
			translation: {
				dataProse: translation,
				contentPages: {
					en: ctx.contentFiles.filter((f) => f.path.endsWith('.en.md')).length,
					fr: ctx.contentFiles.filter((f) => f.path.endsWith('.fr.md')).length,
					ar: ctx.contentFiles.filter((f) => f.path.endsWith('.ar.md')).length
				},
				landingDictionary: {
					en: Object.keys(ctx.landingStrings.en).length,
					fr: Object.keys(ctx.landingStrings.fr).length,
					ar: Object.keys(ctx.landingStrings.ar).length
				}
			},
			media: {
				shipped: ctx.mediaIndex.length,
				published: ctx.mediaIndex.filter((i) => i.status === 'published').length,
				drafts: ctx.mediaIndex.filter((i) => i.status === 'draft').length
			},
			world: {
				claims: ctx.worldClaims.length,
				datasets: ((dotted(ctx.flowsManifest, 'datasets') as Json[]) ?? []).length
			}
		},
		community: {
			mode: ctx.wrangler.match(/COMMUNITY_MODE\s*=\s*"([a-z-]+)"/)?.[1] ?? '',
			deployedMode: String(dep.effectiveMode ?? '')
		},
		claims: {
			count: registry.counts.claims,
			export: '/public-claims.json',
			note: 'Resolved declarations, not historical evidence; see data/public-claims.yaml.'
		}
	};
}
