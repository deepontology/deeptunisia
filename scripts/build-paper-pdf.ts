/**
 * Release paper PDF (Phase 5 release mechanics).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The paper's citable form is a PDF, and the spec's release checklist requires
 * that PDF to come from the tracked markdown source rather than from a private
 * working tree. This script renders the newest gated release paper through
 * Chromium, so the figures, the stat tags and the release commit all come from
 * the same tree that `npm run data` and `scripts/test-paper.ts` operate on.
 *
 * Release use:
 *   DT_RELEASE_SHA=$(git rev-parse "$TAG^{commit}") npm run data
 *   npm run paper:pdf
 * The first command rewrites the paper's `commitSha` stat from the tag; the
 * second refuses to render if that tag is set and the paper does not show it,
 * so the PDF cannot silently carry an empty or stale commit.
 *
 * The PDF lands in `output/` beside the source. It is a release artifact, not a
 * tracked file; the CI release job uploads it with the dataset bundle.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUTPUT = join(ROOT, 'output');

/** Newest `deeptunisia-release-paper-v*.md` that carries stat tags. */
function newestGatedPaper(): string {
	const candidates = readdirSync(OUTPUT)
		.filter((f) => /^deeptunisia-release-paper-v.+\.md$/.test(f))
		.filter((f) => readFileSync(join(OUTPUT, f), 'utf8').includes('<!--stat:'))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	if (!candidates.length) throw new Error('no release paper source with stat tags found under output/');
	return join(OUTPUT, candidates[candidates.length - 1]);
}

const paperPath = process.argv[2] ? resolve(process.argv[2]) : newestGatedPaper();
if (!existsSync(paperPath)) throw new Error(`paper source not found: ${paperPath}`);
const markdown = readFileSync(paperPath, 'utf8');

// The one check that binds the PDF to the release commit. The build emits
// `stats.json meta.commitSha`; at release time `DT_RELEASE_SHA` populates it and
// the same build rewrites the paper's commitSha tag. If the paper does not show
// the build's commit, the PDF would freeze a different state, and the script
// fails instead of exporting it.
const releaseSha = process.env.DT_RELEASE_SHA ?? '';
const builtSha = (
	JSON.parse(readFileSync(join(ROOT, 'src', 'generated', 'stats.json'), 'utf8')) as { commitSha?: string }
).commitSha ?? '';
const shaTag = markdown.match(/<!--stat:commitSha-->([^<]*)<!--\/stat-->/)?.[1] ?? '';
if (releaseSha && builtSha !== releaseSha) {
	throw new Error(
		`stats.json commitSha is "${builtSha}" but DT_RELEASE_SHA is "${releaseSha}"; run \`DT_RELEASE_SHA=${releaseSha} npm run data\` first`
	);
}
if (builtSha && shaTag !== builtSha) {
	throw new Error(
		`paper commitSha tag is "${shaTag}" but the build emitted "${builtSha}"; the paper source and the graph are from different commits`
	);
}

// Resolve figure paths relative to the paper's directory. A missing figure
// renders as a labelled placeholder rather than a broken image, so an export
// from a tree that does not carry the untracked diagram sources is still
// honest about what it could not draw.
const paperDir = dirname(paperPath);
const htmlBody = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (whole, alt: string, src: string) => {
	if (/^https?:\/\//.test(src)) return whole;
	const figure = resolve(paperDir, src);
	if (existsSync(figure)) return `![${alt}](${pathToFileURL(figure).href})`;
	return `<div class="figure-missing">[figure not in this tree: ${alt}]</div>`;
});

const body = (await marked.parse(htmlBody, { gfm: true, breaks: false }))
	// The paper writes the tag syntax as escaped entities so the markdown
	// contains no live tag in that sentence. marked escapes the ampersand a
	// second time, which would render the literal text "&lt;" in the PDF; undo
	// exactly one level so the reader sees "<!--stat:key-->".
	.replaceAll('&amp;lt;', '&lt;')
	.replaceAll('&amp;gt;', '&gt;')
	.replaceAll('&amp;amp;', '&amp;');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${basename(paperPath, '.md')}</title>
<style>
	body { font: 10.5pt/1.5 Georgia, 'Times New Roman', serif; color: #111; margin: 0; }
	h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 4pt; }
	h2 { font-size: 14pt; margin: 16pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
	h3 { font-size: 11.5pt; margin: 12pt 0 4pt; }
	p, li { orphans: 3; widows: 3; }
	code, pre { font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace; font-size: 8.5pt; }
	code { background: #f2f2f2; padding: 0 2pt; }
	pre { background: #f6f6f6; border: 1px solid #ddd; padding: 6pt; white-space: pre-wrap; word-break: break-word; }
	table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin: 6pt 0 10pt; }
	th, td { border: 1px solid #bbb; padding: 2.5pt 4pt; text-align: left; vertical-align: top; }
	th { background: #f0f0f0; }
	blockquote { border-left: 3px solid #888; margin: 8pt 0; padding: 2pt 0 2pt 10pt; color: #222; }
	img { max-width: 100%; }
	hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
	.figure-missing { border: 1px dashed #999; padding: 6pt; color: #555; font-size: 9pt; margin: 6pt 0; }
	strong { color: #000; }
</style>
</head>
<body>${body}</body>
</html>`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.setContent(html, { waitUntil: 'load' });
	const outPath = join(OUTPUT, `${basename(paperPath, '.md')}.pdf`);
	await page.pdf({
		path: outPath,
		format: 'Letter',
		printBackground: true,
		margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' }
	});
	console.log(
		`paper pdf: ${outPath}\n  source ${basename(paperPath)} · release commit ${builtSha || '(local build, commitSha tag empty)'}`
	);
} finally {
	await browser.close();
}
