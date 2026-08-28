/**
 * Build OG images — single default and per-entity variants using the wordmark.
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

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
