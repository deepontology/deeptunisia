#!/usr/bin/env node
/**
 * Regenerates scripts/changelog-synthetic.json from private history.
 *
 * Usage:
 *   node scripts/generate-synthetic-changelog.mjs
 *   node scripts/generate-synthetic-changelog.mjs --remote private --branch private/master
 *
 * The public history was squashed at 8584e09 (2026-08-26), so `git log -- data/`
 * on a public clone shows only 4 commits. The 49 pre-squash data commits live on
 * the private mirror (deeptunisiaorg/deep-tunisia private/master). This script
 * replays them into a committed synthetic file so the public build can still
 * render /corrections ("nobody decides which changes are flattering enough to
 * appear") without requiring a deep clone.
 *
 * The build (scripts/build-data.ts:readChangelog) merges this file with live
 * `git log` by hash and sorts newest-first; when git is absent it falls back to
 * the synthetic window.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const remote = process.argv.includes('--remote')
	? process.argv[process.argv.indexOf('--remote') + 1]
	: 'private';
const branch = process.argv.includes('--branch')
	? process.argv[process.argv.indexOf('--branch') + 1]
	: 'private/master';

function parseRaw(raw) {
	const entries = [];
	for (const block of raw.split('\0')) {
		if (!block.trim()) continue;
		const [header, ...rest] = block.split('\n');
		const sep = header.indexOf('|');
		const sep2 = header.indexOf('|', sep + 1);
		if (sep < 0 || sep2 < 0) continue;
		const files = [];
		for (const line of rest) {
			const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
			if (!m) continue;
			files.push({ file: m[3], added: m[1] === '-' ? 0 : Number(m[1]), removed: m[2] === '-' ? 0 : Number(m[2]) });
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

let raw;
try {
	raw = execFileSync('git', ['log', '--no-merges', '--format=%x00%H|%aI|%s', '--numstat', branch, '--', 'data/'], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024
	});
} catch (e) {
	console.error(`Failed to read git log ${branch} -- data/ :`, e.message);
	console.error(`Try: git fetch ${remote} && node scripts/generate-synthetic-changelog.mjs --branch ${remote}/master`);
	process.exit(1);
}

const entries = parseRaw(raw);
const out = {
	_note:
		'Synthetic replay of pre-squash data history. Source: private mirror deeptunisiaorg/deep-tunisia private/master (266 commits ahead) — extracted via `git log private/master -- data/` and committed so the public build can render /corrections without a deep git history. Regenerate by re-running: node scripts/generate-synthetic-changelog.mjs (or see scripts/build-data.ts header). This file is the fallback the build reads when `git log -- data/` is shallow (post-squash public history has only 4 commits). When the private mirror is unavailable, this committed snapshot keeps /corrections honest; replace with a fresh extraction when available. Dates are author dates (%aI), hashes truncated to 9. See docs/plans/grant-readiness-v0.1.md Phase 0.5.',
	generated: new Date().toISOString(),
	source: branch,
	count: entries.length,
	range: entries.length ? `${entries[entries.length - 1].date} → ${entries[0].date}` : '',
	entries
};

const dest = join(ROOT, 'scripts', 'changelog-synthetic.json');
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Wrote ${entries.length} entries to ${dest} (${out.range})`);
