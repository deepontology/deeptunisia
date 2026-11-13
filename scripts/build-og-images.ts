/**
 * Build OG images: the default card, a study card, the introduction's card,
 * and the wordmark assets.
 *
 * The provided wordmark SVG (dark theme: accent #ddb049, text #f0eeec) is the
 * source. We wrap it in a 1200×630 canvas (Twitter large card) with a dark
 * surface background, and generate a PNG via sharp. A light variant is also
 * emitted for completeness (paper background #fefcf7, text #1a1816).
 *
 * This keeps OG previews on-brand without requiring per-entity titles in the
 * image itself — the title/description remain in og:title/og:description,
 * so the image stays cacheable and theme-stable.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse } from 'yaml';
import { linesFrom } from '../src/lib/budget-game/lines.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'static', 'og');

const WORDMARK_INNER = `
  <circle cx="32" cy="32" r="29" fill="none" stroke="#ddb049" stroke-opacity="0.42" stroke-width="3"/>
  <circle cx="32" cy="32" r="10" fill="#ddb049"/>
  <text x="76" y="42" font-family="'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif" font-size="30" font-weight="600" fill="__TEXT__">Deep Tunisia</text>
`.trim();

const SUBLINE = `Power, institutions and evidence · 1956–2026`;

function buildSvg(bg: string, text: string, sub: string, accent: string): string {
	// 1200×630 canvas. Wordmark centered at 50% vertical (~315) with lockup width ~320.
	// We place the 320×64 lockup at x=440, y=273 to center 1200 wide / 630 tall.
	// Subline sits below lockup.
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Deep Tunisia wordmark">
  <rect width="1200" height="630" fill="${bg}"/>
  <!-- subtle top hairline in accent at 8% -->
  <rect x="0" y="0" width="1200" height="4" fill="${accent}" opacity="0.35"/>
  <g transform="translate(440,273)">
    <circle cx="32" cy="32" r="29" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="3"/>
    <circle cx="32" cy="32" r="10" fill="${accent}"/>
    <text x="76" y="42" font-family="'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif" font-size="30" font-weight="600" fill="${text}">Deep Tunisia</text>
  </g>
  <text x="600" y="365" text-anchor="middle" font-family="'JetBrains Mono','IBM Plex Mono',monospace" font-size="13" letter-spacing="0.14em" fill="${text}" opacity="0.55">${SUBLINE}</text>
  <rect x="360" y="400" width="480" height="1" fill="${text}" opacity="0.12"/>
</svg>`;
}

/**
 * The study card. A crop of the index's own artwork over a solid panel, so the
 * title stays legible whatever the crop does. No figure is baked in: the page
 * is rebuilt at deploy time, and a number in an image outlives the month it
 * describes.
 */
function buildStudySvg(): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Police Satisfaction Index, a research study by DeepTunisia">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#11100e" stop-opacity="0"/>
      <stop offset="1" stop-color="#11100e" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="220" width="1200" height="140" fill="url(#fade)"/>
  <rect x="0" y="0" width="1200" height="3" fill="#ddb049" opacity="0.55"/>
  <rect x="72" y="404" width="56" height="2" fill="#ddb049"/>
  <text x="72" y="438" font-family="'JetBrains Mono', 'IBM Plex Mono', monospace" font-size="15" letter-spacing="0.16em" fill="#b9b4aa">RESEARCH 002 · POLICE SATISFACTION INDEX</text>
  <text x="72" y="498" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" font-size="50" font-weight="700" fill="#f0eeec">Police Satisfaction Index</text>
  <text x="72" y="538" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" font-size="19" fill="#b9b4aa">Trust, service, fear and harm, measured every month in the open.</text>
  <text x="72" y="592" font-family="'JetBrains Mono', 'IBM Plex Mono', monospace" font-size="14" fill="#ddb049">deeptunisia.org/research/police</text>
  <text x="1128" y="592" text-anchor="end" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="0.08em" fill="#f0eeec" opacity="0.75">DEEPTUNISIA</text>
</svg>`;
}

async function renderStudyCard(outPath: string) {
	const art = join(ROOT, 'static', 'research', 'media', 'psi-5.webp');
	if (!existsSync(art)) {
		console.warn(`  og  skipped ${outPath.replace(ROOT + '/', '')} (artwork missing)`);
		return;
	}
	const strip = await sharp(art)
		.resize(1200, 360, { fit: 'cover', position: 'north' })
		.toBuffer();
	const png = await sharp({
		create: { width: 1200, height: 630, channels: 4, background: '#11100e' }
	})
		.composite([
			{ input: strip, left: 0, top: 0 },
			{ input: Buffer.from(buildStudySvg()), left: 0, top: 0 }
		])
		.png({ compressionLevel: 9 })
		.toBuffer();
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, png);
	console.log(`  og  ${outPath.replace(ROOT + '/', '')}  ${Math.round(png.length / 1024)}KB`);
}

/**
 * The introduction's card: Eclipse black, the title in all three languages,
 * and a field of squares in the cover's manner. The squares are decoration
 * here and carry no count: the page prints the live figure, and a number in
 * an image outlives the record it describes.
 */
function buildIntroSvg(): string {
	const cols = 22;
	const rows = 26;
	const cell = 19;
	const sq = 12;
	const x0 = 760;
	const y0 = 64;
	let squares = '';
	for (let r = 0; r < rows; r++) {
		// A full field with a part-filled last row, as on the page's cover.
		for (let c = 0; c < (r === rows - 1 ? 9 : cols); c++) {
			squares += `<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${sq}" height="${sq}"/>`;
		}
	}
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DeepTunisia, an introduction: power, on the record.">
  <rect width="1200" height="630" fill="#000"/>
  <g fill="#f4f4f6" fill-opacity="0.42">${squares}</g>
  <rect x="0" y="0" width="1200" height="3" fill="#ddb049" opacity="0.6"/>
  <g transform="translate(72,72)">
    <circle cx="14" cy="14" r="12.5" fill="none" stroke="#ddb049" stroke-width="2"/>
    <circle cx="14" cy="14" r="4.5" fill="#ddb049"/>
    <text x="40" y="20" font-family="'JetBrains Mono', 'JetBrainsMono NF', 'Liberation Mono', monospace" font-size="15" letter-spacing="2.4" fill="#b8b8bc">DEEPTUNISIA · AN INTRODUCTION</text>
  </g>
  <text font-family="'Liberation Serif', 'Noto Serif', serif" font-weight="700" font-size="82" fill="#f4f4f6" letter-spacing="1">
    <tspan x="68" y="250">POWER,</tspan>
    <tspan x="68" y="336">ON THE</tspan>
    <tspan x="68" y="422">RECORD.</tspan>
  </text>
  <text x="72" y="482" font-family="'Liberation Serif', 'Noto Serif', serif" font-size="25" fill="#a9a9ae">Le pouvoir, consigné.</text>
  <text x="690" y="482" text-anchor="end" font-family="'Noto Sans Arabic', sans-serif" font-size="26" fill="#a9a9ae">السلطة، في السجل</text>
  <rect x="72" y="520" width="56" height="2" fill="#ddb049"/>
  <text x="72" y="566" font-family="'JetBrains Mono', 'JetBrainsMono NF', 'Liberation Mono', monospace" font-size="17" fill="#ddb049">deeptunisia.org/introduction</text>
</svg>`;
}

/**
 * The citizen budget's card, in the manner of its landing cover: the draft
 * budget as a field of squares, one band per board line, sized by its share.
 * The squares follow the draft figures file, so the card never shows a
 * proportion the page does not; no amount is printed in the image.
 */
function buildBudgetSvg(): string {
	const figures = parse(readFileSync(join(ROOT, 'data/studies/dt-research-003/figures-2027.yaml'), 'utf8')) as {
		rows: { id: string; amount_md: number; memo?: boolean }[];
	};
	const lines = linesFrom(figures.rows);
	const all = [...lines.locked, ...lines.movable];
	const total = all.reduce((t, l) => t + l.draft, 0);
	const cols = 22;
	const rows = 26;
	const cell = 19;
	const sq = 12;
	const x0 = 760;
	const y0 = 64;
	const cells = cols * rows;
	let squares = '';
	let k = 0;
	all.forEach((l, i) => {
		const n = Math.round((l.draft / total) * cells);
		const op = l.locked ? 0.18 : i % 2 === 0 ? 0.78 : 0.46;
		let band = '';
		for (let j = 0; j < n && k < cells; j++, k++) {
			const r = Math.floor(k / cols);
			const c = k % cols;
			band += `<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${sq}" height="${sq}"/>`;
		}
		squares += `<g fill="#f4f4f6" fill-opacity="${op}">${band}</g>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Citizen Budget 2027, a research study by DeepTunisia">
  <rect width="1200" height="630" fill="#0d0b09"/>
  ${squares}
  <rect x="0" y="0" width="1200" height="3" fill="#ddb049" opacity="0.6"/>
  <text x="72" y="104" font-family="'JetBrains Mono', 'JetBrainsMono NF', 'Liberation Mono', monospace" font-size="15" letter-spacing="2.4" fill="#ddb049">DEEPTUNISIA RESEARCH · 003 · BUDGET STUDY</text>
  <text font-family="'Liberation Serif', 'Noto Serif', serif" font-weight="700" font-size="82" fill="#f4f4f6" letter-spacing="1">
    <tspan x="68" y="232">CITIZEN</tspan>
    <tspan x="68" y="318">BUDGET</tspan>
    <tspan x="68" y="404">2027</tspan>
  </text>
  <text x="72" y="466" font-family="'Liberation Serif', 'Noto Serif', serif" font-size="25" fill="#a9a9ae">Divide the state budget yourself, on one board.</text>
  <rect x="72" y="520" width="56" height="2" fill="#ddb049"/>
  <text x="72" y="566" font-family="'JetBrains Mono', 'JetBrainsMono NF', 'Liberation Mono', monospace" font-size="17" fill="#ddb049">deeptunisia.org/research/citizen-budget</text>
</svg>`;
}
async function renderIntroCard(outPath: string) {
	await render(buildIntroSvg(), outPath);
}

async function render(svg: string, outPath: string) {
	const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, png);
	console.log(`  og  ${outPath.replace(ROOT + '/', '')}  ${Math.round(png.length / 1024)}KB`);
}

async function main() {
	if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

	// Dark — midnight/ember surface, dark text is #f0eeec (as in provided SVG)
	const darkBg = '#11100e'; // close to --surface-base dark (oklch 12.5%)
	const darkText = '#f0eeec';
	const accent = '#ddb049';
	await render(buildSvg(darkBg, darkText, SUBLINE, accent), join(OUT_DIR, 'default.png'));
	// Also emit explicit dark variant for share shells that want theme-matched
	await render(buildSvg(darkBg, darkText, SUBLINE, accent), join(OUT_DIR, 'default-dark.png'));

	// Light — paper surface
	const lightBg = '#fefcf7'; // paper --n-0
	const lightText = '#1a1816'; // near --text-primary light
	await render(buildSvg(lightBg, lightText, SUBLINE, accent), join(OUT_DIR, 'default-light.png'));
	// Keep an SVG source for auditing / fallback
	writeFileSync(join(OUT_DIR, 'default.svg'), buildSvg(darkBg, darkText, SUBLINE, accent));
	console.log('  og  default.svg (source) written');

	// A scoring study's preview card. One per study that ships one; the page
	// falls back to the default for any study without artwork.
	await renderStudyCard(join(OUT_DIR, 'police.png'));

	// The introduction, sent as a link more than it is browsed to.
	await renderIntroCard(join(OUT_DIR, 'introduction.png'));
	// The citizen budget, a design-stage study with its own card.
	await render(buildBudgetSvg(), join(OUT_DIR, 'citizen-budget.png'));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
