/**
 * `npm run claims:write`: make the declared public figures match the graph.
 *
 * `data/public-claims.yaml` declares every mutable public number with one
 * resolver and one locator per surface it appears on. The build checks those
 * locators and fails when a surface publishes a stale value. This script is the
 * other half: it rewrites the captured value in each declared surface to what
 * the resolver returns now.
 *
 * It writes only the capture group, never the sentence around it, so a
 * translated string keeps its translation and changes only its figure. It is
 * fail-closed: a locator that matches zero or several times stops the run
 * before any file is written, because a silent guess there is a silent wrong
 * number. A tree that already agrees changes nothing and says so.
 *
 * Run order matters. Resolvers read the generated dataset, so:
 *
 *   tsx scripts/build-data.ts      fresh dataset and stats
 *   tsx scripts/write-claims.ts    this script
 *   npm run data                   the rest of the build, now that claims agree
 *   npm run stats:write            the tagged documents and the landing regions
 *
 * The desk's "Finish session" runs exactly that, because a review moves the
 * counts these surfaces publish.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	displayFor,
	loadClaimContext,
	loadPublicClaims,
	resolveClaim
} from './public-claims.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export interface SurfaceChange {
	claim: string;
	path: string;
	before: string;
	after: string;
}

/**
 * One claim's rewrite of one file, as a pure function.
 *
 * The locator must already be known to match exactly once; the caller checks
 * that for every surface before anything is written. `display` is the resolver
 * value rendered in the claim's own format, not a re-derivation here.
 */
export function rewriteClaimSurface(
	text: string,
	claim: { id: string; display: string },
	locator: string
): { text: string; changes: SurfaceChange[] } {
	const matches = [...text.matchAll(new RegExp(locator, 'gmd'))];
	if (matches.length !== 1) throw new Error(`locator matches ${matches.length} times`);
	const group = matches[0].indices?.[1];
	if (!group) throw new Error('the locator has no capture group');
	const [start, end] = group;
	const before = text.slice(start, end);
	if (before === claim.display) return { text, changes: [] };
	const change: SurfaceChange = { claim: claim.id, path: '', before, after: claim.display };
	return { text: text.slice(0, start) + claim.display + text.slice(end), changes: [change] };
}

/**
 * Every current claim's declared surfaces, rewritten in place. Throws before
 * writing when a locator is broken, so a partial refresh cannot leave two files
 * disagreeing.
 */
export function refreshClaimSurfaces(
	root: string,
	read: (relPath: string) => string | null = (rel) => {
		try {
			return readFileSync(join(root, rel), 'utf8');
		} catch {
			return null;
		}
	}
): { changes: SurfaceChange[]; written: { path: string; text: string }[] } {
	const file = loadPublicClaims(join(root, 'data', 'public-claims.yaml'));
	const ctx = loadClaimContext(root);

	const originals = new Map<string, string | null>();
	const texts = new Map<string, string | null>();
	const changes: SurfaceChange[] = [];
	const problems: string[] = [];
	for (const claim of file.claims) {
		if (claim.lifecycle !== 'current') continue;
		const resolved = resolveClaim(claim, ctx);
		for (const surface of claim.surfaces) {
			if (!originals.has(surface.path)) {
				originals.set(surface.path, read(surface.path));
				texts.set(surface.path, originals.get(surface.path) ?? null);
			}
			const text = texts.get(surface.path);
			if (text === null || text === undefined) {
				problems.push(`${surface.path}: missing, declared by "${claim.id}"`);
				continue;
			}
			// The surface's own format, not the claim's: a French surface groups
			// with a space and an Arabic one with a thousands separator, and the
			// gate compares against exactly this rendering.
			const expected = displayFor(claim, resolved, surface);
			try {
				const out = rewriteClaimSurface(text, { id: claim.id, display: expected }, surface.locator);
				texts.set(surface.path, out.text);
				for (const change of out.changes) changes.push({ ...change, path: surface.path });
			} catch (e) {
				problems.push(`${surface.path}: "${claim.id}": ${(e as Error).message}`);
			}
		}
	}
	if (problems.length) throw new Error(`the surfaces do not agree with their declarations:\n    ${problems.join('\n    ')}`);

	const written: { path: string; text: string }[] = [];
	for (const [relPath, text] of texts) {
		if (typeof text === 'string' && text !== originals.get(relPath)) written.push({ path: relPath, text });
	}
	changes.sort((a, b) => a.path.localeCompare(b.path) || a.claim.localeCompare(b.claim));
	return { changes, written };
}

function main(): number {
	const { changes, written } = refreshClaimSurfaces(ROOT);
	console.log('\n  claims:write: the declared public figures\n');
	if (!changes.length) {
		console.log('  ok  every declared surface publishes its resolved value');
		console.log('');
		return 0;
	}
	for (const file of written) writeFileSync(join(ROOT, file.path), file.text, 'utf8');
	for (const change of changes) console.log(`  ↻  ${change.path}: ${change.before} -> ${change.after}  (${change.claim})`);
	console.log(`\n  ${changes.length} figure(s) refreshed in ${written.length} file(s)\n`);
	return 0;
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly) {
	try {
		process.exit(main());
	} catch (e) {
		console.error(`\n  claims:write failed: ${(e as Error).message}\n`);
		process.exit(1);
	}
}
