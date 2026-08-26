import type { Camera } from './camera.svelte';

/**
 * The part of a camera the label pass actually reads.
 *
 * Deliberately not `Camera`: the globe has no `worldToScreen` (its projection does
 * that work), and its label pass runs in screen space against an identity mapping
 * with `k` pinned to 1. `Camera` satisfies this structurally; the world view
 * passes its own two-line space. Declaring the small shape is what lets both
 * callers use one pass without either pretending to be the other.
 */
export interface LabelSpace {
	k: number;
	vw: number;
	vh: number;
	worldToScreen(wx: number, wy: number): { x: number; y: number };
}

/**
 * Label placement: which names are drawn, and where.
 *
 * THE PROBLEM
 *
 * A fixed-lane layout puts nodes on a grid, and a grid puts labels on a collision
 * course — every name extends to the right into the column beside it. Drawing them
 * all produces the overlap you can see in any screenshot of the old network; drawing
 * only the heaviest few leaves most of the map anonymous no matter how far the reader
 * zooms in.
 *
 * THE APPROACH, AND WHY NOT A SOLVER
 *
 * Greedy suppression in priority order. Sort by how much the reader is likely to want
 * the name, then place labels one at a time and drop any that would land on one
 * already placed.
 *
 * A force-based label solver would pack more names in, and it is the wrong tool here
 * for the same reason a force-directed layout is: its output depends on iteration
 * order and starting conditions, so the same map would label itself differently on
 * every load, and a name would drift away from its node. Greedy-by-priority is
 * deterministic — identical input gives identical output — which is what a research
 * artifact needs. The cost is that a dense corner shows fewer names than it could,
 * and the fix for that is zooming in, which is now possible.
 *
 * WIDTH IS ESTIMATED, NOT MEASURED
 *
 * Measuring text means laying it out, and laying out 300 labels to decide which 40 to
 * keep is the expensive thing this pass exists to avoid. So width is estimated from
 * character count and capped by the CSS `max-width` the labels actually carry. The
 * estimate can be wrong; because it is capped, being wrong means a slightly generous
 * or slightly tight gap, never a label of unbounded width. Arabic and French run
 * wider per character than English, hence the deliberately loose factor.
 */

export type LabelTier = 'focus' | 'major' | 'minor';

/** Where a label may sit relative to its node. */
export type LabelDir = 'right' | 'left' | 'above' | 'below';

export interface LabelCandidate<T = unknown> {
	id: string;
	/** Position in world coordinates — the node this label belongs to. */
	x: number;
	y: number;
	text: string;
	/** Higher wins a contested slot. */
	priority: number;
	/** Never suppressed, and drawn last so it sits on top. */
	pinned?: boolean;
	/** Radius of the node in world units, so the label clears it. */
	r?: number;
	data?: T;
	/**
	 * Anchor directions to try, in order. The pass places the label in the FIRST
	 * direction whose box is on-screen and collides with nothing already placed.
	 * Defaults to `['right']`, preserving the historical single-anchor behaviour
	 * for callers that do not opt in.
	 */
	dirs?: LabelDir[];
}

export interface PlacedLabel<T = unknown> extends LabelCandidate<T> {
	/** Screen position, already offset clear of the node. */
	sx: number;
	sy: number;
	tier: LabelTier;
	/** Which anchor direction won. */
	dir: LabelDir;
}

export interface PlaceOptions {
	/** Priority at or above which a label is "major" rather than "minor". */
	majorAt?: number;
	/** Suppress anything below this. Views lower it as the camera moves in. */
	floor?: number;
	/** Hard cap, so a pathological zoom cannot ask for a thousand labels. */
	limit?: number;
	/** Screen pixels of slack around the viewport, so labels do not pop at the edge. */
	margin?: number;
	maxWidth?: number;
	rowHeight?: number;
}

const CHAR_W = 6.6;

function overlaps(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number }
) {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function placeLabels<T>(
	candidates: LabelCandidate<T>[],
	space: LabelSpace,
	opts: PlaceOptions = {}
): PlacedLabel<T>[] {
	const majorAt = opts.majorAt ?? 66;
	const floor = opts.floor ?? 0;
	const limit = opts.limit ?? 90;
	const margin = opts.margin ?? 80;
	const maxWidth = opts.maxWidth ?? 170;
	const rowHeight = opts.rowHeight ?? 17;

	type Box = { x: number; y: number; w: number; h: number };
	const taken: Box[] = [];
	const out: PlacedLabel<T>[] = [];

	// Pinned first, then by priority. Ties break on id so the result cannot depend on
	// the order the caller happened to build the array in.
	const ordered = [...candidates].sort(
		(a, b) =>
			Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
			b.priority - a.priority ||
			a.id.localeCompare(b.id)
	);

	/**
	 * The box a label occupies for a given anchor direction.
	 *
	 * `right` is the historical default: the label leads from the node's right
	 * edge. `left` mirrors it. `above`/`below` centre the label over/under the
	 * node. Trying several directions is what lets a dense vertical column — the
	 * foreign lane's countries — keep its titles: the first country anchors
	 * right, the next right (collides) → above → below, and so on, instead of
	 * every label but the top few being suppressed.
	 */
	function anchorBox(
		dir: LabelDir,
		s: { x: number; y: number },
		gap: number,
		w: number,
		h: number
	): Box {
		switch (dir) {
			case 'left':
				return { x: s.x - gap - w, y: s.y - h / 2, w, h };
			case 'above':
				return { x: s.x - w / 2, y: s.y - gap - h, w, h };
			case 'below':
				return { x: s.x - w / 2, y: s.y + gap, w, h };
			default:
				return { x: s.x + gap, y: s.y - h / 2, w, h };
		}
	}

	for (const c of ordered) {
		if (!c.pinned && c.priority < floor) continue;
		if (out.length >= limit && !c.pinned) continue;

		const s = space.worldToScreen(c.x, c.y);
		// The label clears the node; the node's radius is in world units so it has
		// to travel through the camera scale too.
		const gap = (c.r ?? 4) * space.k + 6;
		const w = Math.min(maxWidth, 14 + c.text.length * CHAR_W);
		const h = rowHeight;
		const onScreen = (box: Box) =>
			box.x <= space.vw + margin &&
			box.x + box.w >= -margin &&
			box.y <= space.vh + margin &&
			box.y + box.h >= -margin;

		// Try the candidate's anchor directions in order; first fit wins. A pinned
		// label takes its first direction unconditionally — the focus plate is never
		// suppressed, and it is drawn on top anyway.
		const dirs = c.pinned ? [c.dirs?.[0] ?? 'right'] : (c.dirs ?? ['right']);
		let chosen: { dir: LabelDir; box: Box } | null = null;
		for (const dir of dirs) {
			const box = anchorBox(dir, s, gap, w, h);
			if (!onScreen(box)) continue;
			if (!c.pinned && taken.some((t) => overlaps(box, t))) continue;
			chosen = { dir, box };
			break;
		}
		if (!chosen) continue;

		taken.push(chosen.box);
		out.push({
			...c,
			sx: chosen.box.x,
			sy: chosen.box.y,
			tier: c.pinned ? 'focus' : c.priority >= majorAt ? 'major' : 'minor',
			dir: chosen.dir
		});
	}

	// Pinned labels are drawn last so their plate sits above everything else. They
	// were sorted first in order to win their slot; the two orders are different jobs.
	return out.sort((a, b) => Number(a.pinned ?? false) - Number(b.pinned ?? false));
}
