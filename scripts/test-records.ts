/**
 * Assertions over the generated record pages in build/e/.
 *
 * A record page is the thing a journalist links to, so every promise the spec
 * makes about one is checked here rather than trusted:
 *
 *   - one page per record, per kind, and nothing else in /e/ that claims to be one
 *   - the standing block comes before the first claim row
 *   - a claim about a person is printed only when it is documented or reported
 *   - the sentence that says how many claims were left out is on the page with
 *     the right number
 *   - no module script, no request for the graph
 *   - the weight ceilings from the spec
 *   - every /e/ link lands on a page that exists
 *   - the robots meta and the sitemap agree with the switch in records/config.ts
 *   - a data twin beside each page, holding the same claims
 *   - the fixture pages read correctly: Bourguiba, and the 1987 event with two
 *     framings
 *
 * Reads the built site, so it runs after `npm run build`. Without build/e it says
 * so and exits 0, because `npm run test` also runs on trees that were never built.
 * Usage: `npx tsx scripts/test-records.ts`
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, INDEXING } from './records/config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const E = join(ROOT, 'build', 'e');
const DATASET = join(ROOT, 'src', 'generated', 'dataset.json');
const SITEMAP = join(ROOT, 'build', 'sitemap.xml');
const I18N = join(ROOT, 'src', 'lib', 'i18n.ts');

const MAX_MEDIAN = 25 * 1024;
const MAX_P99 = 60 * 1024;
const MAX_HEAVY = 200 * 1024;
const MAX_CSS = 15 * 1024;
const MAX_JS = 1024;

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? `: ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
	}
}

/* Values are escaped into the page, so a fixture is searched for in that form. */
const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const shows = (html: string, text: string) => html.includes(text) || html.includes(escaped(text));

const sample = (list: string[]) => list.slice(0, 3).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');

console.log('\n  -- record pages --\n');

if (!existsSync(E)) {
	console.log('  note  build/e is missing: run `npm run build` to generate the record pages\n');
	process.exit(0);
}

interface Dataset {
	meta: { datasetHash: string };
	people: { id: string; sources?: string[] }[];
	institutions: { id: string }[];
	events: { id: string; contested?: { framing?: string; held_by?: string }[] }[];
}

const data = JSON.parse(readFileSync(DATASET, 'utf8')) as Dataset;
const rows = {
	person: data.people,
	institution: data.institutions,
	event: data.events
} as const;

const htmlFiles = readdirSync(E).filter((f) => f.endsWith('.html'));
const pageIds = new Set(htmlFiles.map((f) => f.replace(/\.html$/, '')));

/* ---------------------------------------------------------------------------
   One page per record
   --------------------------------------------------------------------------- */

const expected = KINDS.flatMap((kind) => rows[kind].map((r) => ({ kind, id: r.id })));
const missing = expected.filter((r) => !pageIds.has(r.id)).map((r) => `${r.kind}/${r.id}`);
const known = new Set(expected.map((r) => r.id));
const extra = [...pageIds].filter((id) => !known.has(id));

ok(
	`every record of a generated kind has a page (${expected.length})`,
	missing.length === 0,
	missing.length ? `missing ${missing.length}: ${sample(missing)}` : ''
);
ok('no page in /e/ is for a record that does not exist', extra.length === 0, extra.length ? sample(extra) : '');
ok('the number of pages equals the number of records', htmlFiles.length === expected.length, `${htmlFiles.length} of ${expected.length}`);

/* ---------------------------------------------------------------------------
   Every page, read once
   --------------------------------------------------------------------------- */

const pages = new Map<string, string>();
const sizes: { id: string; bytes: number }[] = [];
for (const id of pageIds) {
	const html = readFileSync(join(E, `${id}.html`), 'utf8');
	pages.set(id, html);
	sizes.push({ id, bytes: Buffer.byteLength(html) });
}

const noStanding: string[] = [];
const standingAfterClaim: string[] = [];
const moduleScripts: string[] = [];
const graphRequests: string[] = [];
const labelLeaks: string[] = [];
const refLeaks: string[] = [];

for (const [id, html] of pages) {
	const standing = html.indexOf('id=standing');
	const firstClaim = html.indexOf('class=claim');
	if (standing === -1) noStanding.push(id);
	else if (firstClaim !== -1 && firstClaim < standing) standingAfterClaim.push(id);
	if (/<script[^>]*type=["']?module/.test(html)) moduleScripts.push(id);
	if (/dataset\.json|prose-(fr|ar)\.json|timelines\.json/.test(html)) graphRequests.push(id);

	/* Every label must resolve: a raw key in the page is a bug a reader sees. */
	if (/\brec\.[a-z]+(\.[a-zA-Z]+)+\b/.test(html)) labelLeaks.push(id);
	/* Every source mark must point at a source in the list. */
	for (const mark of html.matchAll(/href="#src-(\d+)"/g)) {
		if (!new RegExp(`id="src-${mark[1]}"`).test(html)) refLeaks.push(id);
	}
}

ok('every page has a standing block', noStanding.length === 0, noStanding.length ? sample(noStanding) : '');
ok(
	'the standing block comes before the first claim row',
	standingAfterClaim.length === 0,
	standingAfterClaim.length ? sample(standingAfterClaim) : ''
);
ok('no page loads a module script', moduleScripts.length === 0, moduleScripts.length ? sample(moduleScripts) : '');
ok('no page asks for the graph at runtime', graphRequests.length === 0, graphRequests.length ? sample(graphRequests) : '');
ok('every page resolves its interface keys', labelLeaks.length === 0, labelLeaks.length ? sample(labelLeaks) : '');
ok('every source mark has a source in the list', refLeaks.length === 0, refLeaks.length ? sample(refLeaks) : '');

/* ---------------------------------------------------------------------------
   Weight
   --------------------------------------------------------------------------- */

sizes.sort((a, b) => a.bytes - b.bytes);
const median = sizes[Math.floor((sizes.length - 1) / 2)];
const p99 = sizes[Math.ceil(sizes.length * 0.99) - 1];
const heavy = sizes[sizes.length - 1];
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

ok(`the median page is at most 25 KB`, median.bytes <= MAX_MEDIAN, `${median.id} at ${kb(median.bytes)}`);
ok(`99% of pages are at most 60 KB`, p99.bytes <= MAX_P99, `${p99.id} at ${kb(p99.bytes)}`);
ok(`the heaviest page is at most 200 KB`, heavy.bytes <= MAX_HEAVY, `${heavy.id} at ${kb(heavy.bytes)}`);

const css = join(E, 'record.css');
const js = join(E, 'record.js');
ok('the shared stylesheet is at most 15 KB', existsSync(css) && statSync(css).size <= MAX_CSS, existsSync(css) ? kb(statSync(css).size) : 'missing');
ok('the script is optional and at most 1 KB', !existsSync(js) || statSync(js).size <= MAX_JS, existsSync(js) ? kb(statSync(js).size) : 'absent');

/* The stylesheet may not type a colour or a font size by hand. */
if (existsSync(css)) {
	const style = readFileSync(css, 'utf8');
	const hex = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
	const pxFont = [...style.matchAll(/font-size\s*:\s*[^;]*\d+px/g)].map((m) => m[0]);
	ok('the stylesheet has no raw hex colour', hex.length === 0, hex.slice(0, 3).join(', '));
	ok('the stylesheet has no pixel font size', pxFont.length === 0, pxFont.slice(0, 3).join(', '));
}

/* ---------------------------------------------------------------------------
   Every /e/ link lands somewhere
   --------------------------------------------------------------------------- */

const asset = /\.(css|js|json|png|svg|ico)$/;
const allRecordIds = new Set([...data.people, ...data.institutions, ...data.events].map((r) => r.id));
const dangling: string[] = [];
for (const [id, html] of pages) {
	for (const link of html.matchAll(/href="\/e\/([^"?#]+)"/g)) {
		const target = decodeURIComponent(link[1]);
		if (asset.test(target)) continue; /* the stylesheet, script and twin */
		/* A page for another kind may not be generated yet in this job; it will be.
		   An address that is not a record at all is a broken link now. */
		if (!pageIds.has(target) && !allRecordIds.has(target)) dangling.push(`${id} -> ${target}`);
	}
}
ok('every /e/ link in every page points at a record page, now or at the next job', dangling.length === 0, dangling.length ? sample(dangling) : '');

/* ---------------------------------------------------------------------------
   The honesty rules
   --------------------------------------------------------------------------- */

/* The word is reserved for a human check, so the page's own words may not use it.
   What the page says in its own voice is the standing block, the labels and the
   head text; everything else is the record's prose, quoted from the dataset, and
   not this project's vocabulary to rewrite. */
const ownVoice = (html: string) => {
	const standing = /<section id=standing[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
	const descriptions = [...html.matchAll(/<meta name=description content="([^"]*)"/g)].map((m) => m[1]);
	const cite = /<p class=cite>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
	return [standing, cite, ...descriptions].join(' ');
};
const saidVerified = [...pages.entries()].filter(([, html]) => /verified/i.test(ownVoice(html))).map(([id]) => id);
ok('no page says "verified" in its own voice', saidVerified.length === 0, saidVerified.length ? sample(saidVerified) : '');

const dictated = readFileSync(I18N, 'utf8');
const recValues = [...dictated.matchAll(/^\t['"](rec\.[^'"]+)['"]\s*:\s*([\s\S]*?)(?=,\n)/gm)].map((m) => m[2]);
ok(
	'no record page label says "verified"',
	recValues.every((v) => !/verified/i.test(v)),
	`${recValues.length} rec.* values`
);

/* Rule 2: a claim about a person is printed only when documented or reported.
   An institution page may keep a weak claim that names no person, so each weak
   row is looked up in the twin, which holds the claims in the order they print. */
const people = new Set(data.people.map((p) => p.id));
const weakNamingPerson: string[] = [];
const omittedWithoutCount: string[] = [];
for (const [id, html] of pages) {
	const split = html.indexOf('<section id=ties');
	const offices = split === -1 ? html : html.slice(0, split);
	const ties = split === -1 ? '' : html.slice(split);
	const weakRows = (part: string) => [...part.matchAll(/class=claim data-basis="(inferred|unsubstantiated)"/g)].length;
	if (weakRows(offices)) weakNamingPerson.push(`${id}: ${weakRows(offices)} in offices`);
	let twin: { relationships?: { from?: string; to?: string; basis?: string }[] } = {};
	try {
		twin = JSON.parse(readFileSync(join(E, `${id}.json`), 'utf8'));
	} catch {
		/* the twin checks report this on their own */
	}
	const relationships = twin.relationships ?? [];
	let row = 0;
	for (const match of ties.matchAll(/class=claim data-basis="([a-z-]+)"/g)) {
		const relationship = relationships[row++];
		if (match[1] === 'documented' || match[1] === 'reported') continue;
		if (!relationship || people.has(String(relationship.from)) || people.has(String(relationship.to))) {
			weakNamingPerson.push(`${id}: ${String(relationship?.id)}`);
		}
	}
	const omitted = /weaker standing[^<]*?(\d+)/i.exec(html);
	if (html.includes('further claims of weaker standing') && !omitted) omittedWithoutCount.push(id);
}
ok(
	'no page prints a claim of weaker standing that names a person',
	weakNamingPerson.length === 0,
	weakNamingPerson.length ? sample(weakNamingPerson) : ''
);
ok('the omitted-claims sentence always carries its number', omittedWithoutCount.length === 0, omittedWithoutCount.length ? sample(omittedWithoutCount) : '');

/* ---------------------------------------------------------------------------
   Indexing: the page's robots meta and the sitemap read the same switch
   --------------------------------------------------------------------------- */

const disagreeing: string[] = [];
for (const [id, html] of pages) {
	const kind = KINDS.find((k) => rows[k].some((r) => r.id === id));
	if (!kind) continue;
	const noindex = /<meta name=robots content=noindex>/.test(html);
	if (noindex === INDEXING[kind]) disagreeing.push(`${id}: ${kind}`);
}
ok('every page carries noindex exactly when its kind is out of the index', disagreeing.length === 0, disagreeing.length ? sample(disagreeing) : '');

if (existsSync(SITEMAP)) {
	const sitemap = readFileSync(SITEMAP, 'utf8');
	const listed = new Set([...sitemap.matchAll(/<loc>[^<]*\/e\/([^<]+)<\/loc>/g)].map((m) => m[1]));
	const shouldList = KINDS.filter((k) => INDEXING[k]).flatMap((k) => rows[k].map((r) => r.id));
	const missingFromSitemap = shouldList.filter((id) => !listed.has(id));
	const shouldNotList = KINDS.filter((k) => !INDEXING[k]).flatMap((k) => rows[k].map((r) => r.id));
	const listedWrongly = shouldNotList.filter((id) => listed.has(id));
	ok('the sitemap lists every page its kind allows', missingFromSitemap.length === 0, missingFromSitemap.length ? sample(missingFromSitemap) : `${listed.size} record addresses`);
	ok('the sitemap lists no page its kind keeps out', listedWrongly.length === 0, listedWrongly.length ? sample(listedWrongly) : '');
} else {
	ok('build/sitemap.xml exists so the indexing switch can be checked', false, 'missing');
}

/* ---------------------------------------------------------------------------
   The data twin
   --------------------------------------------------------------------------- */

const twinProblems: string[] = [];
const countProblems: string[] = [];
for (const [id, html] of pages) {
	const file = join(E, `${id}.json`);
	if (!existsSync(file)) {
		twinProblems.push(`${id}: no twin`);
		continue;
	}
	let twin: {
		schema?: string;
		record?: { id?: string };
		positions?: unknown[];
		relationships?: unknown[];
		sources?: unknown[];
		omitted?: { inferred?: number; unsubstantiated?: number };
		meta?: { datasetHash?: string; page?: string };
	};
	try {
		twin = JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		twinProblems.push(`${id}: unparseable`);
		continue;
	}
	if (twin.schema !== 'deeptunisia.record/1') twinProblems.push(`${id}: schema`);
	if (twin.record?.id !== id) twinProblems.push(`${id}: wrong record`);
	if (twin.meta?.datasetHash !== data.meta.datasetHash) twinProblems.push(`${id}: hash`);
	if (!Array.isArray(twin.positions) || !Array.isArray(twin.relationships)) twinProblems.push(`${id}: no claim arrays`);
	const pageRows = (html.match(/class=claim/g) ?? []).length;
	const twinRows = (twin.positions?.length ?? 0) + (twin.relationships?.length ?? 0);
	if (pageRows !== twinRows) countProblems.push(`${id}: ${pageRows} rows, ${twinRows} in the twin`);
}
ok('every page has a data twin that parses and names the same record', twinProblems.length === 0, twinProblems.length ? sample(twinProblems) : '');
ok('each twin holds exactly the claims the page shows', countProblems.length === 0, countProblems.length ? sample(countProblems) : '');

/* The JSON-LD block is identity only. */
const ALLOWED_LD = new Set(['@context', '@type', 'name', 'alternateName', 'url', 'identifier']);
const ldProblems: string[] = [];
for (const [id, html] of pages) {
	const m = /<script type=application\/ld\+json>([\s\S]*?)<\/script>/.exec(html);
	if (!m) {
		ldProblems.push(`${id}: none`);
		continue;
	}
	try {
		const ld = JSON.parse(m[1]) as Record<string, unknown>;
		if (ld.identifier !== id) ldProblems.push(`${id}: identifier`);
		for (const key of Object.keys(ld)) if (!ALLOWED_LD.has(key)) ldProblems.push(`${id}: ${key}`);
	} catch {
		ldProblems.push(`${id}: unparseable`);
	}
}
ok('every page carries a JSON-LD block of identity only', ldProblems.length === 0, ldProblems.length ? sample(ldProblems) : '');

/* ---------------------------------------------------------------------------
   Fixtures
   --------------------------------------------------------------------------- */

const bourguiba = pages.get('bourguiba');
ok('build/e/bourguiba.html exists', !!bourguiba);
if (bourguiba) {
	ok('the fixture carries the name in three scripts', bourguiba.includes('Habib Bourguiba') && bourguiba.includes('الحبيب بورقيبة'));
	ok('the fixture prints an office with its institution link', bourguiba.includes('President of the Republic') && bourguiba.includes('href="/e/presidency"'));
	ok('the fixture renders its dates through the app renderer', bourguiba.includes('Jul 25, 1957') && bourguiba.includes('1987'));
	ok('the fixture keeps an open end open', bourguiba.includes('end unknown'));
	ok('the fixture does not index the person page', /<meta name=robots content=noindex>/.test(bourguiba));
	ok('the fixture carries a citation with the record id', bourguiba.includes(`record bourguiba, dataset ${data.meta.datasetHash.slice(0, 12)}`));
	ok('the fixture lists numbered sources', /<ol class=sources><li id="src-1"/.test(bourguiba));
	ok('the fixture marks a claim it rests on Wikipedia for', bourguiba.includes('Rests on Wikipedia only.'));
}

const coup = pages.get('coup-1987');
if (KINDS.includes('event')) {
	ok('build/e/coup-1987.html exists', !!coup);
	if (coup) {
		const contested = data.events.find((e) => e.id === 'coup-1987')?.contested ?? [];
		const missingFramings = contested.filter((c) => !c.framing || !shows(coup, c.framing));
		const missingHolders = contested.filter((c) => !c.held_by || !shows(coup, c.held_by));
		ok(`the fixture shows both framings (${contested.length})`, contested.length > 1 && missingFramings.length === 0, sample(missingFramings.map((c) => String(c.framing))));
		ok('each framing names who holds it', missingHolders.length === 0, sample(missingHolders.map((c) => String(c.held_by))));
	}
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
