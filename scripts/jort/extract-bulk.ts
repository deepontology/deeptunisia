/**
 * JORT bulk extractor — crawls French gazette issues for a year, extracts
 * sommaire appointment entries, matches them against needs-primary-source
 * positions, and writes a contrib candidate file.
 *
 * Usage:
 *   npx tsx scripts/jort/extract-bulk.ts --year 2019
 *   npx tsx scripts/jort/extract-bulk.ts --year 2019 --from 001 --to 010
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CACHE = join(ROOT, '.cache', 'jort');
const DATA = join(ROOT, 'data');

const UA = 'DeepTunisia/0.1 (open-source public-interest research; +https://deeptunisia.org)';

function assertAllowed(path: string) {
	const banned = [/^\/api\//, /^\/pdfjs\//, /^\/sign-/, /^\/sso-callback/, /^\/onboarding\//];
	if (banned.some((re) => re.test(path)) || path.includes('?')) {
		throw new Error(`robots.txt disallows "${path}"`);
	}
}

const THROTTLE_MS = 1500;
let lastFetch = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithCache(path: string, ext = '.html'): Promise<string> {
	assertAllowed(path);
	const key = path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + ext;
	const file = join(CACHE, key);
	if (existsSync(file)) return readFileSync(file, 'utf8');

	const wait = THROTTLE_MS - (Date.now() - lastFetch);
	if (wait > 0) await sleep(wait);
	lastFetch = Date.now();

	const res = await fetch('https://jort.tn' + path, { headers: { 'user-agent': UA } });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
	const body = await res.text();
	mkdirSync(CACHE, { recursive: true });
	writeFileSync(file, body, 'utf8');
	return body;
}

async function fetchPdf(url: string): Promise<Buffer> {
	const key = url.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '.pdf';
	const file = join(CACHE, key);
	if (existsSync(file)) return readFileSync(file);

	const wait = THROTTLE_MS - (Date.now() - lastFetch);
	if (wait > 0) await sleep(wait);
	lastFetch = Date.now();

	const res = await fetch(url, { headers: { 'user-agent': UA } });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
	const buf = Buffer.from(await res.arrayBuffer());
	mkdirSync(CACHE, { recursive: true });
	writeFileSync(file, buf);
	return buf;
}

// ---------------------------------------------------------------------------
// Institution matching
// ---------------------------------------------------------------------------

interface Institution { id: string; name_en: string; name_fr: string }

/**
 * French → institution ID mapping, derived from data/institutions.yaml.
 * Entries are lowercase and stripped of accents for fuzzy matching.
 */
function normalize(s: string): string {
	return s.toLowerCase()
		.normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Build the institution ID → French name lookup from the graph. */
function buildInstitutionIndex(): Map<string, Institution> {
	const instRaw = readFileSync(join(DATA, 'institutions.yaml'), 'utf8');
	const index = new Map<string, Institution>();
	let current: Partial<Institution> = {};
	for (const line of instRaw.split(/\r?\n/)) {
		const idMatch = line.match(/^-\s+id:\s+(.+)/);
		if (idMatch) {
			if (current.id) index.set(current.id, current as Institution);
			current = { id: idMatch[1].trim() };
		}
		const enMatch = line.match(/^\s+name_en:\s+(.+)/);
		if (enMatch) current.name_en = enMatch[1].trim().replace(/^["']|["']$/g, '');
		const frMatch = line.match(/^\s+name_fr:\s+(.+)/);
		if (frMatch) current.name_fr = frMatch[1].trim().replace(/^["']|["']$/g, '');
	}
	if (current.id) index.set(current.id, current as Institution);
	return index;
}

/** Known French institution keywords → institution ID (hand-curated for precision). */
const KEYWORD_MAP: [RegExp, string][] = [
	[/tribunal\s+administratif/, 'administrative-court'],
	[/cour\s+des\s+comptes/, 'audit-court'],
	[/cour\s+de\s+cassation/, 'court-of-cassation'],
	[/conseil\s+sup[ée]rieur\s+de\s+la\s+magistrature/, 'csm'],
	[/minist[èe]re\s+de\s+l['']int[ée]rieur/, 'ministry-interior'],
	[/direction\s+g[ée]n[ée]rale\s+de\s+la\s+s[ûu]ret[ée]\s+nationale/, 'national-security'],
	[/direction\s+g[ée]n[ée]rale\s+de\s+la\s+s[ûu]ret[ée]\s+publique/, 'public-security'],
	[/garde\s+nationale/, 'national-guard'],
	[/arm[ée]e\s+de\s+terre/, 'land-forces'],
	[/arm[ée]e\s+de\s+l['']air/, 'air-force'],
	[/marine\s+nationale/, 'navy'],
	[/forces\s+arm[ée]es/, 'armed-forces'],
	[/s[ée]curit[ée]\s+pr[ée]sidentielle/, 'presidential-security'],
	[/haute\s+autorit[ée].*communication\s+audiovisuelle/, 'haica'],
	[/[ée]tablissement.*t[ée]l[ée]vision/, 'ett'],
	[/tunisair/, 'tunisair'],
	[/soci[ée]t[ée]\s+tunisienne\s+de\s+l[''][ée]lectricit[ée]/, 'steg'],
	[/sonede/, 'sonede'],
	[/sncft/, 'sncft'],
	[/ordre\s+national\s+des\s+avocats/, 'onat'],
	[/instance\s+v[ée]rit[ée]\s+et\s+dignit[ée]/, 'ivd'],
	[/direction\s+g[ée]n[ée]rale\s+des\s+douanes/, 'douane'],
	[/banque\s+nationale\s+agricole/, 'bna'],
	[/banque\s+de\s+l['']habit/, 'bh-bank'],
	[/banque\s+tunisienne/, 'stb'],
	[/la\s+poste\s+tunisienne/, 'la-poste-tunisienne'],
];

/**
 * Match a sommaire entry against institutions.
 * Returns the institution ID, or null if no match.
 */
function matchInstitution(title: string): string | null {
	const norm = normalize(title);
	// Try keyword patterns first (highest precision)
	for (const [re, id] of KEYWORD_MAP) {
		if (id && re.test(norm)) return id;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Sommaire extraction
// ---------------------------------------------------------------------------

interface AppointmentEntry {
	type: 'nomination' | 'decree';
	title: string;
	institutionId: string | null;
}

function extractAppointments(text: string): AppointmentEntry[] {
	const entries: AppointmentEntry[] = [];
	const lines = text.split('\n');
	for (const line of lines) {
		const cleaned = line.replace(/\.{2,}/g, '').replace(/\s+/g, ' ').trim();
		if (/^Nomination\s+d[eu'\s]/i.test(cleaned) || /^Nomination\s+du\s+/i.test(cleaned)) {
			const instId = matchInstitution(cleaned);
			entries.push({ type: 'nomination', title: cleaned, institutionId: instId });
		}
		if ((/^Arrêté\s+du\s+ministre/i.test(cleaned) || /^Décret\s+(?:Présidentiel|du\s+Premier)/i.test(cleaned))
			&& /nomm/i.test(cleaned)) {
			const instId = matchInstitution(cleaned);
			entries.push({ type: 'decree', title: cleaned, institutionId: instId });
		}
	}
	return entries;
}

// ---------------------------------------------------------------------------
// Issue list discovery
// ---------------------------------------------------------------------------

function issueLinks(html: string): { lang: string; num: string }[] {
	const out: { lang: string; num: string }[] = [];
	const re = /\/view\/journal-officiel\/(fr|ar)\/(\d{4})\/(\d{3})/g;
	const seen = new Set<string>();
	for (const m of html.matchAll(re)) {
		const key = `${m[1]}-${m[3]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (m[1] === 'fr') out.push({ lang: m[1], num: m[3] });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const year = args.includes('--year') ? args[args.indexOf('--year') + 1] : '2019';
const fromIssue = args.includes('--from') ? args[args.indexOf('--from') + 1] : '001';
const toIssue = args.includes('--to') ? args[args.indexOf('--to') + 1] : '010';

console.log(`\n  JORT bulk extractor — ${year} issues ${fromIssue}–${toIssue}\n`);

// Build institution index
const instIndex = buildInstitutionIndex();
console.log(`  Institution index: ${instIndex.size} entries`);

// Discover issues
const yearHtml = await fetchWithCache(`/browse/journal-officiel/${year}/`);
const issues = issueLinks(yearHtml).filter((l) => {
	const n = parseInt(l.num, 10);
	return n >= parseInt(fromIssue, 10) && n <= parseInt(toIssue, 10);
});
console.log(`  Issues to process: ${issues.length}\n`);

// Process each issue
const allMatches: Array<{
	issue: string;
	title: string;
	institutionId: string;
	type: string;
	pdfUrl: string;
}> = [];

let processed = 0;
let skipped = 0;

for (const iss of issues) {
	const viewPath = `/view/journal-officiel/fr/${year}/${iss.num}`;
	try {
		const viewHtml = await fetchWithCache(viewPath);
		const pdfMatch = /lake\.jort\.tn\/journal-officiel\/fr\/\d{4}\/\d{3}\.pdf/.exec(viewHtml);
		if (!pdfMatch) { skipped++; continue; }

		const pdfUrl = `https://${pdfMatch[0]}`;
		const pdfBuf = await fetchPdf(pdfUrl);

		const { createRequire } = await import('module');
		const require = createRequire(import.meta.url);
		const { PDFParse } = require('pdf-parse');
		const parser = new PDFParse({ data: pdfBuf });
		const d = await parser.getText();

		const entries = extractAppointments(d.text);
		const matched = entries.filter((e) => e.institutionId);

		if (matched.length > 0) {
			for (const m of matched) {
				allMatches.push({
					issue: `${year}/${iss.num}`,
					title: m.title,
					institutionId: m.institutionId!,
					type: m.type,
					pdfUrl,
				});
			}
			console.log(`  ${year}/${iss.num}: ${d.total} pages, ${entries.length} entries, ${matched.length} matched`);
		} else {
			console.log(`  ${year}/${iss.num}: ${d.total} pages, ${entries.length} entries, 0 matched`);
		}
		processed++;
	} catch (e) {
		console.log(`  ${year}/${iss.num}: ERROR — ${(e as Error).message}`);
		skipped++;
	}
}

console.log(`\n  Processed: ${processed}, skipped: ${skipped}`);
console.log(`  Matched entries: ${allMatches.length}`);

// Group by institution
const byInstitution = new Map<string, typeof allMatches>();
for (const m of allMatches) {
	const list = byInstitution.get(m.institutionId) || [];
	list.push(m);
	byInstitution.set(m.institutionId, list);
}

	console.log(`\n  Institutions with matches:`);
for (const [instId, matches] of byInstitution) {
	const inst = instIndex.get(instId);
	console.log(`    ${instId} (${inst?.name_fr ?? '?'}): ${matches.length} entries`);
	for (const m of matches) {
		console.log(`      ${m.issue}: ${m.title}`);
	}
}

// Write output
const outDir = join(ROOT, 'output', 'jort');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `bulk-${year}-${fromIssue}-${toIssue}.json`);
writeFileSync(outFile, JSON.stringify({ year, fromIssue, toIssue, processed, skipped, matches: allMatches }, null, 2));
console.log(`\n  Results: ${outFile}\n`);
