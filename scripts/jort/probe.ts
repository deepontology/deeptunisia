/**
 * JORT access probe.
 *
 * Reconnaissance tooling, NOT an ingestion pipeline. It fetches and caches the
 * pages that a real extractor would walk, so the remaining unknown — whether the
 * PDFs at lake.jort.tn carry a text layer — can be settled with one download
 * instead of a redesign. See docs/jort-recon.md for the findings.
 *
 * Etiquette, which here is unusually well defined:
 *
 *   jort.tn/robots.txt explicitly ALLOWS ClaudeBot and anthropic-ai, stating the
 *   gazette is public domain and citation is encouraged. It also disallows /api/
 *   and every query-string URL (/*?q=, /*?sort=, /*?page=). So this probe walks
 *   /browse/ and /view/ only, and never touches search. A pipeline that queried
 *   ?q= would be breaking the one file that otherwise grants us everything.
 *
 *   No Crawl-delay is declared. That is permission, not an invitation to hammer a
 *   volunteer archive, so requests are spaced and everything is cached to disk.
 *   Re-running this costs the site nothing.
 *
 * Usage:
 *   npx tsx scripts/jort/probe.ts              # structure probe, no PDF
 *   npx tsx scripts/jort/probe.ts --year 2019  # index one year
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '..', '..', '.cache', 'jort');

const BASE = 'https://jort.tn';
const UA =
	'DeepTunisia/0.1 (open-source public-interest research; +https://deeptunisia.org) ClaudeBot-compatible';

/** Minimum gap between requests. Nothing here is urgent. */
const THROTTLE_MS = 1500;
let lastFetch = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Paths robots.txt disallows. Checked in code so the rule cannot be forgotten. */
function assertAllowed(path: string) {
	const banned = [/^\/api\//, /^\/pdfjs\//, /^\/sign-/, /^\/sso-callback/, /^\/onboarding\//];
	if (banned.some((re) => re.test(path)) || path.includes('?')) {
		throw new Error(
			`robots.txt disallows "${path}". Query strings and /api/ are off-limits; ` +
				`use /browse/ and /view/, or the sitemap.`
		);
	}
}

async function get(path: string): Promise<string> {
	assertAllowed(path);
	const key = path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '.html';
	const file = join(CACHE, key);
	if (existsSync(file)) return readFileSync(file, 'utf8');

	const wait = THROTTLE_MS - (Date.now() - lastFetch);
	if (wait > 0) await sleep(wait);
	lastFetch = Date.now();

	const res = await fetch(BASE + path, { headers: { 'user-agent': UA } });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
	const body = await res.text();
	mkdirSync(CACHE, { recursive: true });
	writeFileSync(file, body, 'utf8');
	return body;
}

/** Issue links on a year page: /view/journal-officiel/<lang>/<year>/<NNN> */
function issueLinks(html: string): { lang: string; year: string; num: string; href: string }[] {
	const out: { lang: string; year: string; num: string; href: string }[] = [];
	const re = /\/view\/journal-officiel\/(fr|ar)\/(\d{4})\/(\d{3})/g;
	const seen = new Set<string>();
	for (const m of html.matchAll(re)) {
		if (seen.has(m[0])) continue;
		seen.add(m[0]);
		out.push({ lang: m[1], year: m[2], num: m[3], href: m[0] });
	}
	return out;
}

/** The PDF a view page points at, on the separate lake.jort.tn host. */
function pdfHref(html: string): string | null {
	const m = /lake\.jort\.tn\/journal-officiel\/(?:fr|ar)\/\d{4}\/\d{3}\.pdf/.exec(html);
	return m ? `https://${m[0]}` : null;
}

/** Gregorian dates in the OCR header. Issues routinely span two publication days. */
function dates(html: string): string[] {
	const text = html.replace(/<[^>]+>/g, ' ');
	const re =
		/(\d{1,2})(?:er)?\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi;
	return [...new Set([...text.matchAll(re)].map((m) => `${m[1]} ${m[2]} ${m[3]}`))].slice(0, 6);
}

const argYear = process.argv.includes('--year')
	? process.argv[process.argv.indexOf('--year') + 1]
	: '2019';

console.log(`\n  JORT probe — cache: ${CACHE}\n`);

const yearHtml = await get(`/browse/journal-officiel/${argYear}/`);
const links = issueLinks(yearHtml);
const fr = links.filter((l) => l.lang === 'fr');
const ar = links.filter((l) => l.lang === 'ar');
console.log(`  ${argYear}: ${links.length} issue links — ${fr.length} fr, ${ar.length} ar`);

if (links.length === 0) {
	console.log('\n  No issue links found. The markup may be client-rendered; check the cached HTML.');
	process.exit(0);
}

const sample = fr[0] ?? links[0];
const viewHtml = await get(sample.href);
const pdf = pdfHref(viewHtml);
const found = dates(viewHtml);

console.log(`\n  sample issue: ${sample.href}`);
console.log(`    dates in OCR header : ${found.length ? found.join(' | ') : '(none parsed)'}`);
console.log(`    pdf                 : ${pdf ?? '(no link found)'}`);

// The one question this probe cannot answer for you.
console.log(`
  UNRESOLVED — whether the PDF carries a text layer.

  This probe deliberately does not download it: 2019 issues ranged from 924 KB to
  93 MB, and the answer needs one small file, chosen by eye, not a blind fetch.

  To settle it:
    curl -A "${UA}" -o issue.pdf \\
      "${pdf ?? 'https://lake.jort.tn/journal-officiel/fr/2019/001.pdf'}"
    # then check for extractable text rather than page images

  If text  -> a cheap crawler over /view/ is viable; see docs/jort-recon.md.
  If not   -> we would be OCR'ing Arabic ourselves. Reassess before building.

  lake.jort.tn is a DIFFERENT HOST from jort.tn. Check its own robots.txt before
  any bulk download; the permission quoted above covers jort.tn.
`);
