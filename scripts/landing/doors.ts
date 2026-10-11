/**
 * The "Start here" section of the landing page: three doors into the atlas, each
 * with a thumbnail drawn from the dataset.
 *
 * WHY THE THUMBNAILS ARE COMPUTED
 *
 * The page says "Nothing is illustrative". So a thumbnail is a projection of the
 * graph, never an artwork: the Chronicle bars are real tenures, the Now dots are
 * the real in-post count, the Network lanes are the real most-connected people.
 * The figures printed under the Now door come from the same pass, so the picture
 * and the number cannot disagree.
 *
 * Nothing data-derived enters the markup as text. Every label is a translatable
 * key from DOOR_STRINGS (the Now figure line is a {slot} template the page fills), and the layer names used in a style attribute are
 * whitelisted against LAYERS, so no string from the data is ever spliced in.
 */
import { currencyOf, monthsSince } from '../../src/lib/tenure';
import { BASIS_OPACITY, BASIS_ORDER, DASH, LAYERS, type Basis, type Layer } from '../../src/lib/model';

export interface DoorInterval {
	startEarliest: number;
	endLatest: number | null;
	status: string;
	raw?: { end?: string | null };
}

export interface DoorPosition {
	id: string;
	role: string;
	holder: string;
	interval: DoorInterval;
}

/* A loose type for the fields this module reads; the full Dataset lives in src/lib. */
export interface Dataset {
	meta: { cutoff: number };
	positions: DoorPosition[];
	people: { id: string; layers?: string[] }[];
	relationships: { from: string; to: string; basis?: string }[];
}

export const DOOR_STRINGS: Record<string, string> = {
	'start.eyebrow': 'Start here',
	'door.chronicle': 'Who held which post?',
	'door.now': 'Who holds office today?',
	'door.network': 'Who connects to whom?',
	/* Translated whole, with slots: the page puts the numbers back (data-i18n-tpl). */
	'door.now.fig': '{n} in post · {recent} verified in the last year'
};

const W = 160;
const H = 96;

/* Chronicle: the chart opens at 1956, the atlas's own first year, so the bars
   read against the same calendar as the view the door opens. */
const CHRONICLE_FROM = Date.UTC(1956, 0, 1);
const CHRONICLE_ROWS = 12;
const CHRONICLE_PAD = 4;
const HEAD_OF_STATE = 'president';
const HEAD_OF_GOVERNMENT = 'prime-minister';
const BAR_H = 4;
const BAR_GAP = 3;

const DOT_R = 2.6;
const RECENT_MONTHS = 12;

const TOP_PEOPLE = 24;
const NODE_R = 2.5;
const NODE_PAD_X = 8;
const NODE_PAD_Y = 8;

/* One decimal is plenty for a 160-unit box, and it keeps the output byte-stable. */
const n1 = (x: number): string => String(Math.round(x * 10) / 10);

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/* The in-post set is defined once, here, and both the figures and the Now
   thumbnail read it, so the printed count is the number of dots drawn. */
function inPost(ds: Dataset): { p: DoorPosition; recent: boolean }[] {
	const out: { p: DoorPosition; recent: boolean }[] = [];
	for (const p of ds.positions) {
		if (currencyOf(p) === null) continue;
		const months = monthsSince(p.interval.raw?.end, ds.meta.cutoff);
		out.push({ p, recent: months !== null && months <= RECENT_MONTHS });
	}
	return out;
}

export function doorFigures(ds: Dataset): { inPost: number; inPostRecent: number } {
	const open = inPost(ds);
	return { inPost: open.length, inPostRecent: open.filter((o) => o.recent).length };
}

function chronicleSvg(ds: Dataset): string {
	const cutoff = ds.meta.cutoff;
	const span = cutoff - CHRONICLE_FROM;
	const x = (t: number): number => {
		const clamped = Math.min(Math.max(t, CHRONICLE_FROM), cutoff);
		return CHRONICLE_PAD + ((clamped - CHRONICLE_FROM) / span) * (W - 2 * CHRONICLE_PAD);
	};

	/* Longest tenures first, so the cut to twelve is made on duration; then the
	   survivors are drawn in start order, which is what makes the chart read as a
	   sequence of holders rather than a ranking. */
	const tenures = ds.positions
		.filter((p) => p.role === HEAD_OF_STATE || p.role === HEAD_OF_GOVERNMENT)
		.map((p) => {
			const iv = p.interval;
			const end = iv.status === 'ongoing' || iv.endLatest === null ? cutoff : iv.endLatest;
			return { id: p.id, role: p.role, start: iv.startEarliest, end };
		})
		.sort((a, b) => b.end - b.start - (a.end - a.start) || byId(a, b))
		.slice(0, CHRONICLE_ROWS)
		.sort((a, b) => a.start - b.start || byId(a, b));

	const total = tenures.length * BAR_H + Math.max(tenures.length - 1, 0) * BAR_GAP;
	const top = (H - total) / 2;
	const bars = tenures.map((t, i) => {
		const x1 = Math.round(x(t.start) * 10) / 10;
		const x2 = Math.round(x(t.end) * 10) / 10;
		const y = top + i * (BAR_H + BAR_GAP);
		const paint =
			t.role === HEAD_OF_STATE
				? ' style="fill:var(--layer-political)"'
				: ' fill="currentColor" opacity=".55"';
		return `<rect x="${n1(x1)}" y="${n1(y)}" width="${n1(Math.max(x2 - x1, 1))}" height="${BAR_H}"${paint}/>`;
	});

	return `<svg class="thumb" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${bars.join('')}</svg>`;
}

/* The grid that fills the box best: among column counts, the one whose cells
   are largest once the rows are fitted to the height. Ties go to fewer columns. */
function gridShape(n: number): { cols: number; rows: number; cell: number } {
	let best = { cols: 1, rows: 1, cell: 0 };
	for (let cols = 1; cols <= Math.max(n, 1); cols++) {
		const rows = Math.max(1, Math.ceil(n / cols));
		const cell = Math.min(W / cols, H / rows);
		if (cell > best.cell + 1e-9) best = { cols, rows, cell };
	}
	return best;
}

function nowSvg(ds: Dataset): string {
	const open = inPost(ds).sort(
		(a, b) =>
			Number(b.recent) - Number(a.recent) || a.p.interval.startEarliest - b.p.interval.startEarliest || byId(a.p, b.p)
	);
	const { cols, rows, cell } = gridShape(open.length);
	const ox = (W - cols * cell) / 2;
	const oy = (H - rows * cell) / 2;
	const dots = open.map((o, i) => {
		const cx = n1(ox + ((i % cols) + 0.5) * cell);
		const cy = n1(oy + (Math.floor(i / cols) + 0.5) * cell);
		return o.recent
			? `<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="currentColor"/>`
			: `<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="none" stroke="currentColor" opacity=".5" vector-effect="non-scaling-stroke"/>`;
	});

	return `<svg class="thumb" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${dots.join('')}</svg>`;
}

/* The most-connected people by relationship degree, with their real primary
   layer, the same selection the atlas's network lanes start from. */
const LAYER_SET: readonly string[] = LAYERS;

function primaryLayer(p: { layers?: string[] }): Layer {
	const l = p.layers?.[0] ?? '';
	return LAYER_SET.includes(l) ? (l as Layer) : 'political';
}

function edgeBasis(b: string | undefined): Basis {
	return b && (BASIS_ORDER as string[]).includes(b) ? (b as Basis) : 'reported';
}

function networkSvg(ds: Dataset): string {
	const deg = new Map<string, number>();
	for (const r of ds.relationships) {
		if (!r.from || !r.to) continue;
		deg.set(r.from, (deg.get(r.from) ?? 0) + 1);
		deg.set(r.to, (deg.get(r.to) ?? 0) + 1);
	}
	const people = new Map(ds.people.map((p) => [p.id, p]));
	const top = [...deg.entries()]
		.filter(([id]) => people.has(id))
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
		.slice(0, TOP_PEOPLE)
		.map(([id]) => ({ id, layer: primaryLayer(people.get(id)!) }));
	const inTop = new Set(top.map((n) => n.id));

	/* One lane per layer present among the people, in the fixed layer order; each
	   lane's nodes are spread evenly in degree order (the order of `top`). */
	const lanes = LAYERS.filter((l) => top.some((n) => n.layer === l));
	const pos = new Map<string, { x: number; y: number }>();
	lanes.forEach((lane, li) => {
		const y = lanes.length === 1 ? H / 2 : NODE_PAD_Y + (li * (H - 2 * NODE_PAD_Y)) / (lanes.length - 1);
		const members = top.filter((n) => n.layer === lane);
		members.forEach((n, j) => {
			const x = members.length === 1 ? W / 2 : NODE_PAD_X + (j * (W - 2 * NODE_PAD_X)) / (members.length - 1);
			pos.set(n.id, { x, y });
		});
	});

	/* Edges go underneath the nodes. Their basis drives opacity and dash, the same
	   visual grammar the atlas uses for claims. */
	const lines = ds.relationships
		.filter((r) => r.from && r.to && inTop.has(r.from) && inTop.has(r.to))
		.map((r) => {
			const a = pos.get(r.from)!;
			const b = pos.get(r.to)!;
			const basis = edgeBasis(r.basis);
			const dash = DASH[basis];
			return (
				`<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="currentColor"` +
				` stroke-opacity="${BASIS_OPACITY[basis]}"` +
				(dash ? ` stroke-dasharray="${dash}"` : '') +
				` vector-effect="non-scaling-stroke"/>`
			);
		});

	const nodes = top.map((n) => {
		const p = pos.get(n.id)!;
		return `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${NODE_R}" style="fill:var(--layer-${n.layer})"/>`;
	});

	return `<svg class="thumb" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${lines.join('')}${nodes.join('')}</svg>`;
}

export function renderDoors(ds: Dataset): string {
	const figures = doorFigures(ds);
	const s = DOOR_STRINGS;
	return [
		'<section class="sec" id="start" aria-labelledby="start-title">',
		'\t<header class="sec-head">',
		`\t\t<h2 class="sec-title" id="start-title" data-i18n="start.eyebrow">${s['start.eyebrow']}</h2>`,
		'\t</header>',
		'\t<ul class="doors">',
		'\t\t<li><a class="door" href="/chronicle">',
		`\t\t\t${chronicleSvg(ds)}`,
		`\t\t\t<span class="door-q" data-i18n="door.chronicle">${s['door.chronicle']}</span>`,
		'\t\t</a></li>',
		'\t\t<li><a class="door" href="/now">',
		`\t\t\t${nowSvg(ds)}`,
		`\t\t\t<span class="door-q" data-i18n="door.now">${s['door.now']}</span>`,
		'\t\t\t<span class="door-fig" data-i18n-tpl="door.now.fig">' +
			`<span data-v="n"><!--stat:inPost-->${figures.inPost}<!--/stat--></span> in post · ` +
			`<span data-v="recent"><!--stat:inPostRecent-->${figures.inPostRecent}<!--/stat--></span> verified in the last year` +
			'</span>',
		'\t\t</a></li>',
		'\t\t<li><a class="door" href="/network">',
		`\t\t\t${networkSvg(ds)}`,
		`\t\t\t<span class="door-q" data-i18n="door.network">${s['door.network']}</span>`,
		'\t\t</a></li>',
		'\t</ul>',
		'</section>'
	].join('\n');
}
