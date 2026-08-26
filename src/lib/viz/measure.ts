/**
 * How wide is this text, really.
 *
 * WHY THIS EXISTS
 *
 * "Draw the label only if it fits" is one rule, and it had grown two
 * implementations: the dock compared a band's measured pixel width against a magic
 * 62, and the Chronicle multiplied character count by a hardcoded 6.4. Both were
 * guesses calibrated against English at one font size, which means both were wrong
 * for Arabic, wrong for French, and silently wrong again the moment anybody touched
 * the type scale.
 *
 * A canvas measures text the same way the renderer lays it out, so there is nothing
 * to calibrate. It is also cheap: the context is created once and `measureText` is a
 * lookup, not a layout.
 *
 * WHEN NOT TO USE IT
 *
 * HTML labels do not need this. They have `text-overflow: ellipsis` and a real box
 * model, so they truncate honestly on their own — see labels.css. This is for SVG
 * text, which cannot ellipsise and therefore has to be suppressed before it is
 * drawn, and for cases like the dock's era bands where the decision is whether to
 * render the element at all.
 */

let ctx: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
	if (ctx !== undefined) return ctx;
	if (typeof document === 'undefined') {
		ctx = null;
		return ctx;
	}
	ctx = document.createElement('canvas').getContext('2d');
	return ctx;
}

export interface TextMetrics {
	size: number;
	family?: string;
	weight?: number | string;
	/** In em, matching CSS `letter-spacing` — canvas has no notion of it. */
	tracking?: number;
	uppercase?: boolean;
}

/**
 * Width in CSS pixels.
 *
 * Falls back to a deliberately generous estimate when there is no canvas, which
 * happens during prerendering. Over-estimating means the static HTML suppresses a
 * label that would have fitted; under-estimating means it ships one that overlaps.
 * The first is invisible and self-corrects on hydration; the second is the bug this
 * whole helper exists to prevent.
 */
export function textWidth(text: string, m: TextMetrics): number {
	const body = m.uppercase ? text.toUpperCase() : text;
	const tracking = (m.tracking ?? 0) * m.size * body.length;

	const c = context();
	if (!c) return body.length * m.size * 0.72 + tracking;

	c.font = `${m.weight ?? 400} ${m.size}px ${m.family ?? 'sans-serif'}`;
	return c.measureText(body).width + tracking;
}

/** Does this text fit in `available` pixels, leaving `pad` px of breathing room? */
export function fits(text: string, available: number, m: TextMetrics, pad = 12): boolean {
	return textWidth(text, m) + pad <= available;
}
