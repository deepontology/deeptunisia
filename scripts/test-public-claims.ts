/**
 * Assertions over the public-claim registry (M3).
 *
 * The registry exists to make one property enforceable: every mutable public
 * figure resolves to typed state, and nothing that looks like a figure escapes
 * the declaration. These tests check that property in four directions:
 *
 *   1. the checked-in declaration validates and every surface matches;
 *   2. the generated outputs are not stale relative to the declaration;
 *   3. the governed templates carry no unregistered figure;
 *   4. the negative cases actually fail — missing, retired, unresolved, stale,
 *      duplicated and malformed declarations are exercised as fixtures, because
 *      a check that cannot fail is not a check.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	loadPublicClaims,
	loadClaimContext,
	validateClaims,
	checkStatSpans,
	scanUnregistered,
	buildResolvedRegistry,
	resolveClaim,
	parsePublicClaims,
	type ClaimIssue,
	type PublicClaimsFile
} from './public-claims.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

function expectIssues(name: string, issues: ClaimIssue[], code: string) {
	const hit = issues.find((i) => i.code === code);
	ok(name, Boolean(hit), hit ? hit.detail : `expected ${code}, got ${issues.map((i) => i.code).join(', ') || 'none'}`);
}

const declarationPath = join(ROOT, 'data', 'public-claims.yaml');
let file: PublicClaimsFile;
try {
	file = loadPublicClaims(declarationPath);
	ok('the declaration parses against the strict schema', true, `${file.claims.length} claims, ${file.inventory.length} inventory entries`);
} catch (e) {
	ok('the declaration parses against the strict schema', false, (e as Error).message);
	console.log(`\n${checks} checks, ${failures + 1} failure(s)\n`);
	process.exit(1);
}

const ctx = loadClaimContext(ROOT);
const { issues, resolved } = validateClaims(file, ROOT, ctx);

// --- 1. declaration, surfaces, inventory ------------------------------------
{
	const codes = new Map<string, number>();
	for (const i of issues) codes.set(i.code, (codes.get(i.code) ?? 0) + 1);
	ok(
		'every declared surface matches its resolver',
		issues.length === 0,
		issues.length ? [...codes].map(([c, n]) => `${c}:${n}`).join(' ') : `${file.claims.length} claims checked`
	);
	const current = file.claims.filter((c) => c.lifecycle === 'current');
	ok(
		'every current claim resolves to typed state',
		current.every((c) => resolved.has(c.id)),
		`${current.filter((c) => !resolved.has(c.id)).map((c) => c.id).join(', ') || `${current.length} current claims resolved`}`
	);
	const withSurfaces = file.claims.filter((c) => c.surfaces.length > 0);
	ok(
		'every published claim has at least one inventoried surface',
		withSurfaces.every((c) => c.surfaces.every((s) => file.inventory.some((e) => s.path === e.path || s.path.startsWith(e.path)))),
		`${withSurfaces.length} published claims`
	);
}

// --- 2. stat-tag channel ----------------------------------------------------
{
	const statIssues = checkStatSpans(file, ROOT, ctx);
	ok(
		'every <!--stat:--> span in a governed document is bound to a declared stats claim',
		statIssues.length === 0,
		statIssues.length ? statIssues.map((i) => `${i.code}:${i.detail}`).join(' | ') : 'all spans declared'
	);
}

// --- 3. unregistered figures ------------------------------------------------
{
	const scan = scanUnregistered(file, ROOT);
	ok(
		'governed templates carry no unregistered mutable figure',
		scan.length === 0,
		scan.length ? scan.map((i) => i.detail).join(' | ') : 'no uncovered figures'
	);
}

// --- 4. generated outputs are current ---------------------------------------
{
	const appPath = join(ROOT, 'src', 'generated', 'public-claims.json');
	if (!existsSync(appPath)) {
		ok('the resolved registry is generated', false, 'src/generated/public-claims.json missing — run npm run data');
	} else {
		const emitted = JSON.parse(readFileSync(appPath, 'utf8'));
		const fresh = buildResolvedRegistry(file, ctx);
		const sameCount = emitted.claims.length === fresh.claims.length;
		const drift = fresh.claims.filter((c) => {
			const e = emitted.claims.find((x: { id: string }) => x.id === c.id);
			return !e || e.display !== c.display || e.basis !== c.basis || e.lifecycle !== c.lifecycle;
		});
		ok('the emitted registry matches a fresh resolution', sameCount && drift.length === 0, drift.map((c) => c.id).join(', ') || `${fresh.claims.length} claims`);
	}
	const publicPath = join(ROOT, 'static', 'public-claims.json');
	if (!existsSync(publicPath)) {
		ok('the stable public export is generated', false, 'static/public-claims.json missing — run npm run data');
	} else {
		const pub = JSON.parse(readFileSync(publicPath, 'utf8'));
		ok(
			'the public export carries its licence and provenance',
			pub.license === 'CC-BY-4.0' && pub.project === 'deeptunisia' && Array.isArray(pub.claims),
			`${pub.claims.length} claims`
		);
	}
	const manifestPath = join(ROOT, 'static', 'build-manifest.json');
	if (!existsSync(manifestPath)) {
		ok('the public build manifest is generated', false, 'static/build-manifest.json missing — run npm run data');
	} else {
		const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
		const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));
		ok('the build manifest carries the graph hash', m.graph?.datasetHash === ds.meta.datasetHash, String(m.graph?.datasetHash).slice(0, 16));
		ok(
			'the build manifest keeps the review populations separate',
			m.populations?.review?.editorialNotes !== undefined &&
				m.populations?.review?.independentChecks !== undefined &&
				m.populations?.review?.editorialQueue !== undefined &&
				m.populations.review.note.includes('never summed'),
			`notes ${m.populations?.review?.editorialNotes} · queue ${m.populations?.review?.editorialQueue} · independent ${m.populations?.review?.independentChecks}`
		);
		ok(
			'the build manifest keeps the translation populations separate',
			m.populations?.translation?.dataProse &&
				m.populations?.translation?.contentPages &&
				m.populations?.translation?.landingDictionary,
			'data prose, content pages and landing dictionary are separate objects'
		);
	}
}

// --- 5. population consistency ----------------------------------------------
{
	const resolve = (source: string, key: string) =>
		resolveClaim({ resolver: { source, key } } as never, ctx).value;
	const asNum = (source: string, key: string) => Number(resolve(source, key));
	ok(
		'the stats and study channels agree on independent checks',
		asNum('stats', 'independent') === asNum('study', 'independent-checks'),
		`stats ${resolve('stats', 'independent')} · study ${resolve('study', 'independent-checks')}`
	);
	ok(
		'the independent count is zero until the study records real checks',
		asNum('study', 'independent-checks') === 0,
		String(resolve('study', 'independent-checks'))
	);
	ok(
		'no declared claim presents an editorial population as independently assured',
		file.claims.every((c) => c.assurance !== 'independent' || c.resolver.source === 'study'),
		file.claims.filter((c) => c.assurance === 'independent').map((c) => c.id).join(', ')
	);
	ok(
		'the stats and review channels agree on editorial notes',
		asNum('stats', 'reviewed') === asNum('review', 'editorial-notes') &&
			asNum('stats', 'reviewable') === asNum('review', 'editorial-notes-denominator'),
		`${resolve('stats', 'reviewed')} of ${resolve('stats', 'reviewable')}`
	);
	ok(
		'the emitted translation total and the data-prose population agree',
		asNum('stats', 'translatable') === asNum('data-translation', 'fr-total'),
		String(resolve('stats', 'translatable'))
	);
	ok(
		'the human translation count is the French population plus the Arabic population, named separately',
		asNum('stats', 'translatedHuman') ===
			asNum('data-translation', 'fr-human') + asNum('data-translation', 'ar-human'),
		`${resolve('data-translation', 'fr-human')} + ${resolve('data-translation', 'ar-human')}`
	);
	ok(
		'the media research ledger and the shipped index are different populations',
		asNum('media', 'research-ledger-sources') > 0 &&
			asNum('media', 'shipped-sources') > 0 &&
			asNum('media', 'research-ledger-sources') !== asNum('media', 'shipped-sources'),
		`ledger ${resolve('media', 'research-ledger-sources')} · shipped ${resolve('media', 'shipped-sources')}`
	);
	ok(
		'the editorial queue and the independent population are never equal by construction',
		asNum('editorial-queue', 'total') > 0 && asNum('study', 'independent-checks') === 0,
		`queue ${resolve('editorial-queue', 'total')} · independent 0`
	);
	ok(
		'the source-exception categories overlap and are not compressed into 0/0/0',
		asNum('review', 'exceptions-total') > 0 &&
			asNum('review', 'exceptions-total') > asNum('review', 'exceptions-basis-override'),
		`total ${resolve('review', 'exceptions-total')} · basis-override ${resolve('review', 'exceptions-basis-override')}`
	);
	ok(
		'the source-exception categories are published separately',
		['exceptions-basis-override', 'exceptions-no-source', 'exceptions-grade-a-primary'].every(
			(k) => file.claims.some((c) => c.resolver.source === 'review' && c.resolver.key === k)
		),
		'each rule has its own claim'
	);
	{
		const registry = buildResolvedRegistry(file, ctx);
		const partition =
			registry.counts.current + registry.counts.historical + registry.counts.planning + registry.counts.superseded;
		ok(
			'every claim declares exactly one lifecycle',
			partition === registry.counts.claims,
			`${registry.counts.current} current · ${registry.counts.historical} historical · ${registry.counts.planning} planning · ${registry.counts.superseded} superseded`
		);
	}
}

// --- 6. negative fixtures ---------------------------------------------------
{
	const dir = join(ROOT, 'fixtures', 'public-claims');
	const fixtures: [string, string, string][] = [
		['malformed.yaml', 'MALFORMED', 'schema'],
		['duplicate.yaml', 'DUPLICATE_ID', 'validate'],
		['duplicate-locator.yaml', 'DUPLICATE_LOCATOR', 'validate'],
		['missing-surface.yaml', 'MISSING_SURFACE', 'validate'],
		['unresolved.yaml', 'UNRESOLVED', 'validate'],
		['stale.yaml', 'STALE', 'validate'],
		['retired.yaml', 'RETIRED_STILL_PUBLISHED', 'validate']
	];
	for (const [name, code, kind] of fixtures) {
		const p = join(dir, name);
		if (!existsSync(p)) {
			ok(`fixture ${name} exists`, false, 'missing');
			continue;
		}
		let parsed: PublicClaimsFile;
		try {
			parsed = parsePublicClaims(readFileSync(p, 'utf8'));
		} catch (e) {
			ok(
				`fixture ${name} fails with ${code}`,
				kind === 'schema' && code === 'MALFORMED',
				kind === 'schema' ? 'rejected by the schema' : (e as Error).message
			);
			continue;
		}
		if (kind === 'schema') {
			ok(`fixture ${name} fails with ${code}`, false, 'schema fixture parsed unexpectedly');
			continue;
		}
		const { issues: fixtureIssues } = validateClaims(parsed, ROOT, ctx);
		expectIssues(`fixture ${name} fails with ${code}`, fixtureIssues, code);
	}
}

console.log(`\n  public claims: ${checks} checks, ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
