/**
 * JORT appointment-decree extractor — minimal viable version.
 *
 * Extracts text from a French JORT issue PDF and identifies appointment
 * decrees (décrets de nomination) that could upgrade positions from
 * needs-primary-source to documented.
 *
 * Usage:
 *   npx tsx scripts/jort/extract.ts --year 2019 --issue 001
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '..', '..', '.cache', 'jort');

const UA = 'DeepTunisia/0.1 (open-source public-interest research; +https://deeptunisia.org)';

/** Paths robots.txt disallows. */
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

/** Extract appointment entries from JORT sommaire text. */
function extractDecrees(text: string): Array<{ type: string; title: string }> {
	const decrees: Array<{ type: string; title: string }> = [];

	// Sommaire entries are short summaries like:
	//   "Nomination de conseillers adjoints au tribunal administratif ....."
	//   "Nomination d'un directeur ....."
	//   "Nomination du directeur de l'école supérieure du commerce de Tunis ....."
	// They sit on their own lines and end with dots or are followed by a page number.
	const lines = text.split('\n');
	for (const line of lines) {
		const cleaned = line.replace(/\.{2,}/g, '').replace(/\s+/g, ' ').trim();
		// Match sommaire-style nomination entries
		if (/^Nomination\s+d[eu'\s]/i.test(cleaned) || /^Nomination\s+du\s+/i.test(cleaned)) {
			decrees.push({ type: 'nomination', title: cleaned });
		}
		// Match decree/arrêté headers that mention nomination
		if ((/^Arrêté\s+du\s+ministre/i.test(cleaned) || /^Décret\s+(?:Présidentiel|du\s+Premier)/i.test(cleaned))
			&& /nomm/i.test(cleaned)) {
			decrees.push({ type: 'decree', title: cleaned });
		}
	}

	return decrees;
}

// --- Main ---

const args = process.argv.slice(2);
const year = args.includes('--year') ? args[args.indexOf('--year') + 1] : '2019';
const issue = args.includes('--issue') ? args[args.indexOf('--issue') + 1] : '001';

console.log(`\n  JORT extractor — ${year}/${issue}\n`);

// Fetch the view page to get the PDF URL
const viewHtml = await fetchWithCache(`/view/journal-officiel/fr/${year}/${issue}`);
const pdfMatch = /lake\.jort\.tn\/journal-officiel\/fr\/\d{4}\/\d{3}\.pdf/.exec(viewHtml);
if (!pdfMatch) {
	console.log('  No PDF link found in view page.');
	process.exit(1);
}
const pdfUrl = `https://${pdfMatch[0]}`;
console.log(`  PDF: ${pdfUrl}`);

// Fetch the PDF
const pdfBuf = await fetchPdf(pdfUrl);
console.log(`  Downloaded: ${(pdfBuf.length / 1024).toFixed(0)} KB`);

// Parse with pdf-parse
const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');
const parser = new PDFParse({ data: pdfBuf });
const d = await parser.getText();

console.log(`  Pages: ${d.total}, text: ${d.text.length} chars`);

// Extract decrees from full text
const decrees = extractDecrees(d.text);
console.log(`\n  Found ${decrees.length} appointment entries:\n`);
for (const dec of decrees) {
	console.log(`  [${dec.type}] ${dec.title}`);
}

// Write results
const outDir = join(HERE, '..', '..', 'output', 'jort');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${year}-${issue}.json`);
writeFileSync(outFile, JSON.stringify({
	year, issue, pdfUrl,
	pages: d.total,
	textLength: d.text.length,
	decrees,
}, null, 2));
console.log(`\n  Results written to ${outFile}\n`);
