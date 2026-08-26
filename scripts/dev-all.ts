/**
 * Start the whole app: the atlas and the Agora API.
 *
 *   npm start
 *
 * Agora is a tab in the atlas but its data comes from the community worker, which
 * `npm run dev` alone does not start — so the tab correctly reported the service
 * as unreachable and it looked like something was broken. One command avoids the
 * question.
 *
 * Both are pinned to fixed ports with strictPort. Vite silently falls back to the
 * next free port when the requested one is taken, so a forgotten server leaves a
 * new one on 5174, then 5175, and every one of them runs `svelte-kit sync` against
 * the same .svelte-kit directory. Eight of them accumulated here once and rewrote
 * each other's generated modules, which the browser reports as 500s and "failed to
 * fetch dynamically imported module" — a failure that looks like a code bug and is
 * not. Failing loudly on a busy port is the fix.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const children: ChildProcess[] = [];

function start(label: string, args: string[], colour: string) {
	const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
	children.push(child);

	const prefix = `\x1b[${colour}m${label.padEnd(9)}\x1b[0m`;
	const relay = (chunk: Buffer) => {
		for (const line of chunk.toString().split('\n')) {
			if (line.trim()) console.log(`${prefix} ${line}`);
		}
	};
	child.stdout?.on('data', relay);
	child.stderr?.on('data', relay);

	child.on('exit', (code) => {
		if (code !== 0 && code !== null) {
			console.log(`${prefix} exited with ${code}`);
			// If one half dies the other is misleading — Agora would sit there
			// reporting the API unreachable while the process that serves it is gone.
			stop(1);
		}
	});
	return child;
}

function stop(code = 0) {
	for (const c of children) c.kill();
	process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

start('agora', [tsx, join(ROOT, 'community', 'server.ts')], '35');
start('atlas', [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--port', '5173', '--strictPort'], '36');

console.log('\n  atlas   http://localhost:5173');
console.log('  agora   the tab in that app; its API is on 5200\n');
console.log('  Ctrl-C stops both.\n');
