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

/**
 * The exact policy, as directive to allowed sources. Comparison is a set test per
 * directive, not a substring test: `connect-src 'self'` must NOT pass when the
 * value is `connect-src 'self' https://example.com`. Every source that could reach
 * a third party or run code is listed here on purpose, so weakening one is a
 * failing check rather than a passing substring.
 */
const EXPECTED_CSP: Record<string, string[]> = {
	'default-src': ["'self'"],
	'script-src': ["'self'", "'unsafe-inline'"],
	'style-src': ["'self'", "'unsafe-inline'"],
	'img-src': ["'self'", 'data:'],
	'font-src': ["'self'"],
	'connect-src': ["'self'"],
	'media-src': ["'none'"],
	'object-src': ["'none'"],
	'frame-src': ["'none'"],
	'worker-src': ["'self'"],
	'manifest-src': ["'self'"],
	'base-uri': ["'self'"],
	'form-action': ["'self'"],
	'frame-ancestors': ["'none'"]
};
// Directives that carry no source list.
const FLAG_DIRECTIVES = new Set(['upgrade-insecure-requests']);

/** Every problem with a policy: a missing directive, an altered source list, an
 *  added source, or an unexpected directive. Empty means it is exactly the one
 *  reviewed in this file. */
function cspProblems(policy: string): string[] {
	const problems: string[] = [];
	const seen = new Map<string, string[]>();
	for (const part of policy.split(';')) {
		const tokens = part.trim().split(/\s+/).filter(Boolean);
		if (!tokens.length) continue;
		seen.set(tokens[0], tokens.slice(1).sort());
	}
	for (const [directive, sources] of Object.entries(EXPECTED_CSP)) {
		const actual = seen.get(directive);
		if (!actual) {
			problems.push(`${directive} is missing`);
			continue;
		}
		const want = [...sources].sort();
		if (actual.join(' ') !== want.join(' ')) {
			problems.push(`${directive} = ${actual.join(' ')} (expected ${want.join(' ')})`);
		}
	}
	for (const directive of seen.keys()) {
		if (!(directive in EXPECTED_CSP) && !FLAG_DIRECTIVES.has(directive)) {
			problems.push(`unexpected directive ${directive}`);
		}
	}
	return problems;
}

const problems = cspProblems(csp);
ok('the policy is exactly the reviewed set of directives and sources', problems.length === 0, problems.join('; '));

// Fixtures: the check must reject a weakened policy, not just describe a good one.
// An added external origin on connect-src is what would let an injected script
// exfiltrate off-origin; 'unsafe-eval' is what would let it run a string.
ok(
	'fixture: an added external connect-src origin is rejected',
	cspProblems(csp.replace("connect-src 'self'", "connect-src 'self' https://example.com")).length > 0
);
ok(
	"fixture: an added 'unsafe-eval' in script-src is rejected",
	cspProblems(csp.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'"))
		.length > 0
);

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
