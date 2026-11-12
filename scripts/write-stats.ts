/**
 * npm run stats:write — refresh the generated values inside documents a person wrote.
 *
 * The build never writes these files. Each carries a block that has to agree with
 * the graph:
 *
 *   - the `<!--stat:key-->value<!--/stat-->` spans in README.md, AGENTS.md,
 *     DESIGN.md and the active release paper
 *   - the generated dictionary block, the DENSITY/NODES/EDGES arrays, the
 *     dataset-hash marker and the index cards in landing/index.html
 *
 * Run it after `npm run data`, commit the result, and `npm run test` proves the
 * values it wrote were the right ones. Nothing else repairs a stale number.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const statsPath = join(ROOT, 'src', 'generated', 'stats.json');
if (!existsSync(statsPath)) {
	console.error('\n  stats:write — src/generated/stats.json is missing; run `npm run data` first\n');
	process.exit(1);
}
const stats = JSON.parse(readFileSync(statsPath, 'utf8')) as Record<string, string>;

const DOCS = ['README.md', 'AGENTS.md', 'DESIGN.md', 'output/deeptunisia-release-paper-v0.1.2.md'];
const STAT_TAG = /<!--stat:([A-Za-z][A-Za-z0-9-]*)-->([\s\S]*?)<!--\/stat-->/g;

console.log('\n  stats:write — the documents the build no longer edits\n');

let changed = 0;
for (const file of DOCS) {
	const path = join(ROOT, file);
	if (!existsSync(path)) {
		console.log(`   -  ${file}: not present, skipped`);
		continue;
	}
	const before = readFileSync(path, 'utf8');
	let figures = 0;
	const after = before.replace(STAT_TAG, (whole, key: string, current: string) => {
		const value = stats[key];
		if (value === undefined) {
			console.log(`   !  ${file}: unknown stat key "${key}"`);
			return whole;
		}
		if (current !== value) figures++;
		return `<!--stat:${key}-->${value}<!--/stat-->`;
	});
	if (after !== before) {
		writeFileSync(path, after, 'utf8');
		changed++;
		console.log(`   ↻  ${file}: ${figures} figure(s) refreshed`);
	} else {
		console.log(`   ok ${file}: current`);
	}
}

// The landing page is the same kind of document: one file a person wrote, with
// generated regions inside it. build-landing.ts owns how they are filled.
const landing = spawnSync('npx', ['--no-install', 'tsx', 'scripts/build-landing.ts', '--write-source'], {
	cwd: ROOT,
	stdio: 'inherit'
});
if (landing.status !== 0) {
	console.error('\n  stats:write — the landing page could not be refreshed\n');
	process.exit(landing.status ?? 1);
}

console.log(`\n  stats:write — ${changed} document(s) changed\n`);
