/**
 * The published payload budget.
 *
 * The graph is the product, but a reader pays for it on every visit. The
 * dataset, the timeline slices and the static exports are all copied into the
 * built site, and the client bundle imports the graph at module scope. The
 * build already publishes the total (README, landing, llms), which catches a
 * number that drifts from the truth. It does not stop the number from growing.
 * This does.
 *
 * A cap is a decision, not a measurement. When a data wave genuinely needs more
 * room, raise the cap in the same change that adds the weight, so the growth is
 * something a person chose and the diff shows it.
 *
 * Usage: `npx tsx scripts/test-budget.ts`
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MB = 1024 * 1024;

/** Caps in megabytes. Deliberately close to today's weight. */
const CAPS = {
	'dataset (published)': 20,
	'timelines (published)': 3.5,
	'dataset (generated)': 12,
	'static tree': 36
};

const PATHS = {
	'dataset (published)': 'static/dataset.json',
	'timelines (published)': 'static/timelines.json',
	'dataset (generated)': 'src/generated/dataset.json',
	'static tree': 'static'
};

let checks = 0;
const failures: string[] = [];

function ok(name: string, pass: boolean, detail = '') {
	checks++;
	if (pass) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures.push(name);
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

function bytes(path: string): number {
	const s = statSync(path);
	if (!s.isDirectory()) return s.size;
	let total = 0;
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		total += bytes(join(path, entry.name));
	}
	return total;
}

for (const [name, cap] of Object.entries(CAPS)) {
	const path = join(ROOT, PATHS[name as keyof typeof PATHS]);
	let size: number;
	try {
		size = bytes(path);
	} catch {
		ok(`${name} is under ${cap} MB`, false, 'file or directory missing');
		continue;
	}
	const mb = size / MB;
	ok(
		`${name} is under ${cap} MB`,
		mb <= cap,
		`${mb.toFixed(1)} MB of ${cap} MB — raise the cap deliberately if this growth is intended`
	);
}

console.log(`\n   ${checks - failures.length}/${checks} budget checks passed${failures.length ? `, ${failures.length} FAILED` : ''}\n`);
if (failures.length) process.exit(1);
