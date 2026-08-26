/**
 * Double-encoding detector — the shared implementation behind the mojibake
 * gate (test-encoding.ts) and the smoke rendered-text sweep.
 *
 * A file "fixed" by a wrong guess is worse than a file never touched, and this
 * detector exists because a wrong guess already corrupted three files once:
 * the first repair accepted any valid-UTF-8 decode, and a broken cp1252 table
 * produced plausible-looking garbage that sailed past it. The round-trip guard
 * below is what makes false positives (and wrong guesses) impossible:
 *
 *   text → utf8 → decode-bytes-as-cp1252 → re-encode-as-utf8
 *
 * is the corruption, so its residue is a run of characters that, cp1252-encoded
 * and utf8-decoded, round-trips to a different, shorter string. Legitimate
 * French ("créé", "âgé", "Âme") never survives the transform because its
 * cp1252 bytes are not valid UTF-8.
 */

// cp1252 code points for bytes 0x80–0x9F (Latin-1 maps the rest identically).
// Checked byte-by-byte against the Windows-1252 specification: quotes at
// 0x91–0x94, dashes at 0x96–0x97.
const CP1252_BYTE: Record<number, number> = {
	0x20ac: 0x80, // €
	0x201a: 0x82, // ‚
	0x0192: 0x83, // ƒ
	0x201e: 0x84, // „
	0x2026: 0x85, // …
	0x2020: 0x86, // †
	0x2021: 0x87, // ‡
	0x02c6: 0x88, // ˆ
	0x2030: 0x89, // ‰
	0x0160: 0x8a, // Š
	0x2039: 0x8b, // ‹
	0x0152: 0x8c, // Œ
	0x017d: 0x8e, // Ž
	0x2018: 0x91, // '
	0x2019: 0x92, // '
	0x201c: 0x93, // "
	0x201d: 0x94, // "
	0x2022: 0x95, // •
	0x2013: 0x96, // – en dash
	0x2014: 0x97, // — em dash
	0x02dc: 0x98, // ˜
	0x2122: 0x99, // ™
	0x0161: 0x9a, // š
	0x203a: 0x9b, // ›
	0x0153: 0x9c, // œ
	0x017e: 0x9e, // ž
	0x0178: 0x9f // Ÿ
};
const CP1252_CHAR: (string | null)[] = [];
for (const [cp, b] of Object.entries(CP1252_BYTE)) CP1252_CHAR[Number(b)] = String.fromCodePoint(Number(cp));

const SUSPECT = new Set<number>();
for (let c = 0x80; c <= 0xff; c++) SUSPECT.add(c);
for (const cp of Object.keys(CP1252_BYTE)) SUSPECT.add(Number(cp));

function toCp1252Byte(ch: string): number | null {
	const c = ch.codePointAt(0)!;
	if (c < 0x80) return c;
	if (c >= 0xa0 && c <= 0xff) return c;
	return CP1252_BYTE[c] ?? null;
}
function fromCp1252Byte(b: number): string | null {
	if (b < 0x80) return String.fromCharCode(b);
	if (b >= 0xa0 && b <= 0xff) return String.fromCharCode(b);
	return CP1252_CHAR[b] ?? null;
}

/**
 * True when the text contains a multi-character run that is the residue of
 * double-encoding. Single Latin-1 characters (é, §, ·, —) are normal and pass;
 * a run of suspect characters that cp1252-decodes to valid, different UTF-8 is
 * corruption by construction.
 */
export function hasDoubleEncoding(text: string): { found: boolean; detail?: string } {
	for (let i = 0; i < text.length; i++) {
		if (!SUSPECT.has(text.codePointAt(i)!)) continue;
		let j = i;
		while (j < text.length && SUSPECT.has(text.codePointAt(j)!)) j++;
		const run = text.slice(i, j);
		if ([...run].length < 2) {
			i = j - 1;
			continue;
		}
		const bytes: number[] = [];
		for (const ch of run) {
			const b = toCp1252Byte(ch);
			if (b === null) break;
			bytes.push(b);
		}
		if (bytes.length !== [...run].length) {
			i = j - 1;
			continue;
		}
		try {
			const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
			// Round-trip guard: re-corrupting the decoded text must reproduce the run.
			const utf8 = new TextEncoder().encode(decoded);
			let back = '';
			for (const b of utf8) {
				const c = fromCp1252Byte(b);
				if (c === null) break;
				back += c;
			}
			if (back === run) {
				return {
					found: true,
					detail: `"${run}" (${[...run].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(' ')}) decodes to ${JSON.stringify(decoded)}`
				};
			}
		} catch {
			// not valid UTF-8 after cp1252 encoding — legitimate text
		}
		i = j - 1;
	}
	return { found: false };
}
