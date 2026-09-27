/**
 * Emit the public-claim registry (M3).
 *
 * Runs at the end of `npm run data`, after every artifact the resolvers read has
 * been produced. It is fail-closed: unresolved, stale, retired-still-published,
 * duplicated, malformed or unregistered claims abort the build with the claim id
 * and the file, and nothing is written until every check has passed.
 *
 * Outputs:
 *   src/generated/public-claims.json   machine-readable resolved registry (app)
 *   static/public-claims.json          stable public export
 *   static/build-manifest.json         public, non-secret build manifest
 *   output/public-claims.md / .csv     maintainer review table
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	loadClaimContext,
	loadPublicClaims,
	validateClaims,
	checkStatSpans,
	scanUnregistered,
	buildResolvedRegistry,
	buildManifest,
	type ClaimIssue,
	type PublicClaimsFile,
	type ResolvedRegistry
} from './public-claims.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function fail(issues: ClaimIssue[]): never {
	console.error(`\n  PUBLIC CLAIMS FAILED — ${issues.length} issue(s)\n`);
	for (const i of issues) console.error(`   x  [${i.code}] ${i.claimId ? i.claimId + ': ' : ''}${i.detail}`);
	console.error('');
	process.exit(1);
}

let file: PublicClaimsFile;
try {
	file = loadPublicClaims(join(ROOT, 'data', 'public-claims.yaml'));
} catch (e) {
	if (e && typeof e === 'object' && 'issues' in e) {
		const issues = (e as { issues: { message: string; path: (string | number)[] }[] }).issues;
		console.error(`\n  PUBLIC CLAIMS FAILED — declaration does not match the schema\n`);
		for (const i of issues) console.error(`   x  [MALFORMED] ${i.path.join('.')}: ${i.message}`);
		console.error('');
		process.exit(1);
	}
	console.error(`\n  PUBLIC CLAIMS FAILED — ${(e as Error).message}\n`);
	process.exit(1);
}

const ctx = loadClaimContext(ROOT);
const issues: ClaimIssue[] = [];
const { issues: claimIssues, resolved } = validateClaims(file, ROOT, ctx);
issues.push(...claimIssues);
issues.push(...checkStatSpans(file, ROOT, ctx));
issues.push(...scanUnregistered(file, ROOT));
if (issues.length) fail(issues);

const registry = buildResolvedRegistry(file, ctx);
const manifest = buildManifest(ctx, registry);

const appOut = join(ROOT, 'src', 'generated', 'public-claims.json');
writeFileSync(appOut, JSON.stringify(registry, null, 2), 'utf8');

const publicExport = {
	...registry,
	project: 'deeptunisia',
	origin: 'https://deeptunisia.org',
	license: 'CC-BY-4.0',
	note:
		'Every value resolves from typed state through data/public-claims.yaml. ' +
		'These are declarations about the product and its evidence state, not claims about Tunisia.'
};
writeFileSync(join(ROOT, 'static', 'public-claims.json'), JSON.stringify(publicExport, null, 2), 'utf8');
writeFileSync(join(ROOT, 'static', 'build-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

mkdirSync(join(ROOT, 'output'), { recursive: true });
writeFileSync(join(ROOT, 'output', 'public-claims.md'), reviewMarkdown(registry), 'utf8');
writeFileSync(join(ROOT, 'output', 'public-claims.csv'), reviewCsv(registry), 'utf8');

function csvCell(v: string): string {
	return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function reviewCsv(reg: ResolvedRegistry): string {
	const head = [
		'id', 'kind', 'lifecycle', 'locale', 'format', 'display', 'resolver', 'population',
		'owner', 'authority', 'assurance', 'validity', 'as_of', 'surfaces'
	];
	const rows = reg.claims.map((c) =>
		[
			c.id, c.kind, c.lifecycle, c.locale, c.format, c.display, `${c.resolver.source}:${c.resolver.key}`,
			c.population, c.owner, c.authority, c.assurance, c.validity, c.asOf ?? '',
			c.surfaces.map((s) => `${s.path}`).join(' | ')
		].map(csvCell).join(',')
	);
	return [head.join(','), ...rows].join('\n') + '\n';
}

function reviewMarkdown(reg: ResolvedRegistry): string {
	const lines: string[] = [];
	lines.push('# Public-claim registry — maintainer review table');
	lines.push('');
	lines.push(`Generated ${reg.generatedAt}; graph cutoff ${reg.cutoff}.`);
	lines.push('');
	lines.push(`**${reg.counts.claims} claims**: ${reg.counts.current} current, ${reg.counts.historical} historical, ${reg.counts.planning} planning, ${reg.counts.superseded} superseded.`);
	lines.push('');
	lines.push('Populations are named on every row and are never summed: an editorial review note is not an independent check, and the consulted research ledger is not the shipped media index.');
	lines.push('');
	const byKind = new Map<string, typeof reg.claims>();
	for (const c of reg.claims) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
	for (const [kind, claims] of byKind) {
		lines.push(`## ${kind}`);
		lines.push('');
		lines.push('| id | value | resolver | population | assurance | validity | surfaces |');
		lines.push('|---|---|---|---|---|---|---|');
		for (const c of claims) {
			const value = String(c.display).replaceAll('|', '\\|');
			const surfaces = c.surfaces.map((s) => `\`${s.path}\``).join(', ') || '— (not published inline)';
			lines.push(`| ${c.id} | ${value} | \`${c.resolver.source}:${c.resolver.key}\` | ${c.population} | ${c.assurance} | ${c.validity} | ${surfaces} |`);
		}
		lines.push('');
	}
	return lines.join('\n');
}

console.log(`\n  public claims   ${registry.counts.claims} resolved · ${registry.counts.current} current · ${registry.counts.superseded} superseded`);
console.log(`                  src/generated/public-claims.json · static/public-claims.json · static/build-manifest.json`);
console.log(`                  output/public-claims.md · output/public-claims.csv\n`);
