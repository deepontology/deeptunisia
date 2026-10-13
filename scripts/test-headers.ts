/**
 * Response-header gate.
 *
 * The security posture of this site is declared in static/_headers, and until
 * now nothing on the test path read it. scripts/verify-build.cjs and
 * verify-deploy.cjs assert the same headers, but only through a live browser
 * against a built site, and neither is wired to a script or a workflow — so a
 * regression in _headers shipped unblocked.
 *
 * This suite parses static/_headers directly, the way Cloudflare and Netlify
 * read it, and asserts the directives that stop a page from reaching a third
 * party or executing injected code. It runs in the ordinary test chain, with no
 * build and no browser, so the gate that guards the claim is the cheap one that
 * always runs.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

interface Block {
	selector: string;
	headers: Map<string, string>;
}

/** Parse a _headers file into path blocks. A line that starts at column 0 is a
 *  selector; an indented line is a `Name: value` header; '#' begins a comment. */
function parseHeaders(text: string): Block[] {
	const blocks: Block[] = [];
	let current: Block | null = null;
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) {
			current = null;
			continue;
		}
		if (line.trim().startsWith('#')) continue;
		if (/^\s/.test(line)) {
			if (!current) continue;
			const idx = line.indexOf(':');
			if (idx < 0) continue;
			current.headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
		} else {
			current = { selector: line.trim(), headers: new Map() };
			blocks.push(current);
		}
	}
	return blocks;
}

console.log('\n  ── response headers: static/_headers ──\n');

const blocks = parseHeaders(readFileSync(join(ROOT, 'static', '_headers'), 'utf8'));
const bySelector = new Map(blocks.map((b) => [b.selector, b]));
const glob = bySelector.get('/*');
const csp = glob?.headers.get('content-security-policy') ?? '';

ok('a /* block exists', Boolean(glob));
ok('Content-Security-Policy is present', csp.length > 0);
for (const directive of [
	"default-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"frame-ancestors 'none'",
	"form-action 'self'",
	"connect-src 'self'",
	"font-src 'self'",
	"media-src 'none'"
]) {
	ok(`CSP carries ${directive}`, csp.includes(directive));
}
ok("CSP does not allow 'unsafe-eval'", !csp.includes('unsafe-eval'));

ok(
	'X-Content-Type-Options is nosniff',
	(glob?.headers.get('x-content-type-options') ?? '') === 'nosniff'
);
ok('Referrer-Policy is no-referrer', (glob?.headers.get('referrer-policy') ?? '') === 'no-referrer');

const hsts = glob?.headers.get('strict-transport-security') ?? '';
const maxAge = Number((hsts.match(/max-age=(\d+)/) ?? [])[1] ?? 0);
ok('HSTS is present with max-age of at least one year', maxAge >= 31_536_000, `max-age=${maxAge}`);
ok('HSTS includes subdomains', /includeSubDomains/.test(hsts));

const perms = glob?.headers.get('permissions-policy') ?? '';
for (const feature of ['camera=()', 'microphone=()', 'geolocation=()']) {
	ok(`Permissions-Policy disables ${feature}`, perms.includes(feature));
}

// CORS is deliberate on exactly the four published exports and nowhere else.
// Anything broader would let an arbitrary origin read every response.
const corsSelectors = blocks
	.filter((b) => b.headers.has('access-control-allow-origin'))
	.map((b) => b.selector)
	.sort();
const EXPECTED_CORS = ['/dataset.json', '/positions.csv', '/relationships.csv', '/sources.csv'];
ok(
	'Access-Control-Allow-Origin appears on exactly the published exports',
	corsSelectors.length === EXPECTED_CORS.length &&
		corsSelectors.every((s, i) => s === EXPECTED_CORS[i]),
	corsSelectors.join(', ') || '(none)'
);
ok(
	'each CORS block allows only a wildcard-origin read, no credentials',
	blocks
		.filter((b) => b.headers.has('access-control-allow-origin'))
		.every(
			(b) =>
				b.headers.get('access-control-allow-origin') === '*' &&
				!b.headers.has('access-control-allow-credentials')
		)
);

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
