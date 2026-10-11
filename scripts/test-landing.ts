/**
 * Assertions over the landing page as a file: the things it promises about
 * itself that no browser check would notice drifting.
 *
 *   - Its tokens are the atlas's tokens. The page cannot import tokens.css (it
 *     opens off disk and ships as one file), so it carries a copy between
 *     `tokens:begin` and `tokens:end`, and every value in that copy must equal
 *     the atlas's, in the dark default and in light.
 *   - "The rule" draws the four bases with the atlas's own line styles (DASH,
 *     BASIS_OPACITY in src/lib/model.ts), so the four never render identically
 *     and never differ from the views.
 *   - The door figures, written by scripts/landing/doors.ts, agree with the
 *     stats the claim registry resolves them against.
 *   - The licences it names are the artifact's.
 *   - Every string key on the page has an English source and a French and an
 *     Arabic entry, and every {slot} in a template has its number in the markup.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DASH, BASIS_OPACITY, BASIS_ORDER } from '../src/lib/model.ts';
import { doorFigures, DOOR_STRINGS, type Dataset } from './landing/doors.ts';
import { INDEX_STRINGS } from './landing/indexes.ts';

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

const page = readFileSync(join(ROOT, 'landing', 'index.html'), 'utf8');
const tokensCss = readFileSync(join(ROOT, 'src', 'lib', 'design', 'tokens.css'), 'utf8');

// ── tokens ─────────────────────────────────────────────────────────────────

/** Top-level rules only: a `:root` inside `@media` is a responsive override, not the theme. */
function topLevelRules(css: string): { selector: string; body: string }[] {
	const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const out: { selector: string; body: string }[] = [];
	let depth = 0;
	let start = 0;
	let bodyStart = 0;
	let selector = '';
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (c === '{') {
			if (depth === 0) {
				selector = src.slice(start, i).trim();
				bodyStart = i + 1;
			}
			depth++;
		} else if (c === '}') {
			depth--;
			if (depth === 0) {
				out.push({ selector, body: src.slice(bodyStart, i) });
				start = i + 1;
			}
		}
	}
	return out;
}

function declarations(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
	return out;
}

function themeMaps(css: string, light: (selector: string) => boolean) {
	const dark = new Map<string, string>();
	const lightOnly = new Map<string, string>();
	for (const rule of topLevelRules(css)) {
		if (rule.selector === ':root') for (const [k, v] of declarations(rule.body)) dark.set(k, v);
		else if (light(rule.selector)) for (const [k, v] of declarations(rule.body)) lightOnly.set(k, v);
	}
	return { dark, light: new Map([...dark, ...lightOnly]), lightOnly };
}

const tokenBlock = page.match(/\/\* tokens:begin \*\/([\s\S]*?)\/\* tokens:end \*\//)?.[1];
ok('landing/index.html has a tokens:begin … tokens:end block', tokenBlock !== undefined);

if (tokenBlock !== undefined) {
	const atlas = themeMaps(tokensCss, (s) => s === "[data-theme='light']");
	const landing = themeMaps(tokenBlock, (s) => s === "html[data-theme='light']");

	ok('the landing block defines tokens', landing.dark.size > 0, `${landing.dark.size} tokens`);
	for (const [k, v] of landing.dark) {
		ok(`dark ${k} matches tokens.css`, atlas.dark.get(k) === v, atlas.dark.get(k) === v ? '' : `landing "${v}", atlas "${atlas.dark.get(k)}"`);
	}
	for (const [k, v] of landing.lightOnly) {
		ok(`light ${k} matches tokens.css`, atlas.light.get(k) === v, atlas.light.get(k) === v ? '' : `landing "${v}", atlas "${atlas.light.get(k)}"`);
	}
	/* A token the page uses that the atlas retunes for light must be retuned
	   here too, or the light page silently keeps the dark value. */
	for (const k of landing.dark.keys()) {
		if (atlas.light.get(k) !== atlas.dark.get(k)) {
			ok(`light theme retunes ${k}, as the atlas does`, landing.lightOnly.has(k));
		}
	}
}

// ── the rule: the four line styles ────────────────────────────────────────

const lines = [...page.matchAll(/<line\b[^>]*data-basis="(\w+)"[^>]*>/g)];
ok('the rule draws each of the four bases once', BASIS_ORDER.every((b) => lines.filter((m) => m[1] === b).length === 1));
for (const m of lines) {
	const basis = m[1] as keyof typeof DASH;
	const dash = m[0].match(/stroke-dasharray="([^"]*)"/)?.[1] ?? '';
	const opacity = Number(m[0].match(/stroke-opacity="([^"]*)"/)?.[1]);
	ok(`${basis} is drawn with DASH`, dash === DASH[basis], `"${dash}" vs "${DASH[basis]}"`);
	ok(`${basis} is drawn with BASIS_OPACITY`, opacity === BASIS_OPACITY[basis], `${opacity} vs ${BASIS_OPACITY[basis]}`);
	ok(`${basis} is drawn in its basis colour`, m[0].includes(`stroke="var(--basis-${basis})"`));
}
ok(
	'no two bases share a line style',
	new Set(lines.map((m) => `${m[0].match(/stroke-dasharray="([^"]*)"/)?.[1] ?? ''}|${m[0].match(/stroke-opacity="([^"]*)"/)?.[1]}`)).size === lines.length
);

// ── figures ────────────────────────────────────────────────────────────────

const ds = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'dataset.json'), 'utf8'));
const stats = JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'stats.json'), 'utf8')) as Record<string, string>;
const figures = doorFigures(ds as Dataset);
ok('the Now door counts what stats.json calls inPost', String(figures.inPost) === stats.inPost, `${figures.inPost} vs ${stats.inPost}`);
ok(
	'the Now door counts what stats.json calls inPostRecent',
	String(figures.inPostRecent) === stats.inPostRecent,
	`${figures.inPostRecent} vs ${stats.inPostRecent}`
);
const rolesHeld = new Set((ds.positions as { role: string }[]).map((p) => p.role)).size;
ok('"Posts" counts roles with at least one tenure', String(rolesHeld) === stats.rolesHeld, `${rolesHeld} vs ${stats.rolesHeld}`);

/* Every stat span on the page names a key the build emits. */
for (const m of page.matchAll(/<!--stat:([\w-]+)-->([^<]*)<!--\/stat-->/g)) {
	ok(`stat ${m[1]} shows what stats.json holds`, stats[m[1]] === m[2], `page ${m[2]}, stats ${stats[m[1]]}`);
}

// ── licences ───────────────────────────────────────────────────────────────

const graphLicence = String(ds.meta?.license ?? '').replace(/-/g, ' ');
ok('the page names the graph licence from the dataset', graphLicence.length > 0 && page.includes(`The full graph, ${graphLicence}`), graphLicence);
const codeLicence = existsSync(join(ROOT, 'LICENSE')) ? readFileSync(join(ROOT, 'LICENSE'), 'utf8') : '';
ok('the page names the code licence from LICENSE', /^MIT License/.test(codeLicence) && page.includes('Source code, MIT'));

// ── strings ────────────────────────────────────────────────────────────────

const dict = (lang: string) =>
	JSON.parse(readFileSync(join(ROOT, 'landing', `_strings.${lang}.json`), 'utf8')) as Record<string, string>;
const en = dict('en');
const fr = dict('fr');
const ar = dict('ar');

/* Keys the generated regions emit even when the region is empty today (no
   studies yet), so the dictionaries are ready before the section appears. */
const generated = new Set([...Object.keys(DOOR_STRINGS), ...Object.keys(INDEX_STRINGS)]);
const onPage = new Set<string>();
for (const m of page.matchAll(/data-i18n(?:-html|-tpl|-label)?="([^"]+)"/g)) onPage.add(m[1]);
const extra = page.match(/var EXTRA_EN = \{([\s\S]*?)\};/)?.[1] ?? '';
for (const m of extra.matchAll(/'([\w.-]+)':/g)) onPage.add(m[1]);

for (const key of new Set([...onPage, ...generated])) {
	ok(`${key} has an English source`, en[key] !== undefined);
	ok(`${key} has French`, fr[key] !== undefined);
	ok(`${key} has Arabic`, ar[key] !== undefined);
}
for (const key of Object.keys(DOOR_STRINGS)) ok(`${key} English matches doors.ts`, en[key] === DOOR_STRINGS[key]);
for (const key of Object.keys(INDEX_STRINGS)) ok(`${key} English matches indexes.ts`, en[key] === INDEX_STRINGS[key]);

const slots = (s: string | undefined) => [...(s ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
/* Template elements are written on one line, so the rest of the line is the element. */
for (const m of page.matchAll(/data-i18n-tpl="([^"]+)"[^>]*>([^\n]*)/g)) {
	const key = m[1];
	const want = slots(en[key]);
	ok(`${key}: French has the same slots as English`, slots(fr[key]) === want, `${slots(fr[key])} vs ${want}`);
	ok(`${key}: Arabic has the same slots as English`, slots(ar[key]) === want, `${slots(ar[key])} vs ${want}`);
	ok(`${key}: every slot has its number in the markup`, want.split(',').every((s) => m[2].includes(`data-v="${s}"`)));
}

/* Nothing in a dictionary may carry a current figure; numbers live in the
   markup, beside the strings. Years and the licence version are not figures. */
for (const [lang, d] of [['en', en], ['fr', fr], ['ar', ar]] as const) {
	const bad = [...onPage, ...generated].filter((k) =>
		/\d/.test((d[k] ?? '').replace(/\b(?:19|20)\d{2}\b/g, '').replace(/4\.0/g, '').replace(/href="[^"]*"/g, ''))
	);
	ok(`${lang}: no page string carries a figure`, bad.length === 0, bad.join(', '));
}

/* Agora: closed, and specified-not-wired. No string may claim otherwise. */
const ENFORCED = /\b(?:enforced|is limited to|appliqué|imposé)\b|مُطبَّق/i;
for (const [lang, d] of [['en', en], ['fr', fr], ['ar', ar]] as const) {
	const bad = [...onPage, ...generated].filter((k) => ENFORCED.test(d[k] ?? ''));
	ok(`${lang}: no page string claims the Agora budget or hold is enforced`, bad.length === 0, bad.join(', '));
}

console.log(`\ntest-landing: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
