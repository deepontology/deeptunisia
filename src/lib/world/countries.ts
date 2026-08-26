import raw from '$data/world.json';

/**
 * The typed face of `src/generated/world.json`.
 *
 * WHY THIS MODULE EXISTS
 *
 * `scripts/build-world.ts` writes that file and the world view reads it, so both
 * ends are ours — and AGENTS.md is explicit that a cast across a boundary you own
 * both sides of is a bug waiting to happen, because the cast keeps compiling long
 * after the shape has changed. TypeScript widens a JSON tuple to `number[]` on
 * import, so *something* has to narrow it; the choice is between one narrowing here,
 * checked once, or a `as [number, number]` at every call site that quietly outlives
 * the next schema change.
 *
 * So the narrowing happens once, at the boundary, and is verified rather than
 * asserted: `assertShape` runs over the real data and throws if the file is not what
 * this module claims. A build that emits the wrong shape fails on the first import
 * instead of rendering a globe with countries at NaN.
 */

export interface Country {
	/** ISO 3166-1 alpha-2, or null for a drawn-but-uncoded territory. */
	iso2: string | null;
	/** [lon, lat]; the centroid of the country's largest landmass. */
	anchor: [number, number];
	/** Locale → name. From Unicode CLDR, except for uncoded territories. */
	names: Record<string, string>;
	via: 'cldr-name' | 'alias' | 'uncoded' | 'point' | 'historical';
}

/**
 * Bilateral trade, columnar and aligned to a shared year axis.
 *
 * `out` is Tunisia exporting to the partner; `in` is Tunisia importing from it.
 * Values are millions of USD, `null` where the year carries no observation — which
 * is not the same as zero and must never be rendered as zero.
 */
export interface Flows {
	years: number[];
	/**
	 * `out`/`in` are Tunisia's own returns; `mirrorOut`/`mirrorIn` are the same two
	 * flows as the partner reported them. Never merged and never averaged — see
	 * YearTrade.gap below for what the difference is and why it is shown.
	 */
	partners: Record<
		string,
		{
			out: (number | null)[];
			in: (number | null)[];
			mirrorOut: (number | null)[];
			mirrorIn: (number | null)[];
		}
	>;
	/** fuel → alpha-2 → series. Only partners that trade fuel with Tunisia appear. */
	energy: Record<string, Record<string, { out: (number | null)[]; in: (number | null)[] }>>;
	/**
	 * The publisher's own world totals, aligned to `years`. Never a partner — the
	 * build keeps them outside `partners` so they cannot be drawn as arcs. Null for
	 * snapshots fetched before totals existed; callers fall back to sum-of-parts
	 * and label it as such.
	 */
	totals: {
		out: (number | null)[];
		in: (number | null)[];
		mirrorOut: (number | null)[];
		mirrorIn: (number | null)[];
	} | null;
	unit: string;
	source: string;
	retrieved: string;
	/**
	 * Whether the licence permits republishing these figures.
	 *
	 * True for UN Comtrade. It was false for the IMF's IMTS, which is why this project
	 * does not use IMTS despite its better coverage — see the header of
	 * scripts/fetch-trade.ts. The flag is carried in the bundle rather than left in a
	 * document so that any decision to publish has to pass something that knows.
	 */
	redistributable: boolean;
}

/**
 * External public debt by creditor.
 *
 * `stock` is what is owed — a level. `disbursed` and `repaid` are movements within
 * the year, and they are the pair worth looking at: for most of the period since the
 * 1990s Tunisia repaid more than it received, which a single netted line would hide.
 */
export interface Debt {
	years: number[];
	creditors: Record<
		string,
		{ stock: (number | null)[]; disbursed: (number | null)[]; repaid: (number | null)[] }
	>;
	/** Lenders with nowhere to be drawn — bondholders, syndicates, unseated bodies. */
	institutional: Record<string, (number | null)[]>;
	/**
	 * Multilateral lenders the graph knows, drawn at the country hosting their seat.
	 *
	 * Deliberately not folded into `creditors`: an arc to Washington carrying World
	 * Bank debt is not United States bilateral debt, and merging them would say it was.
	 */
	bodies: Record<
		string,
		{
			seat: string;
			stock: (number | null)[];
			disbursed: (number | null)[];
			repaid: (number | null)[];
		}
	>;
	/**
	 * The publisher's own total, aligned to `years`. `repaid` is principal +
	 * interest, matching the creditor rows. Never a creditor — no arc.
	 */
	totals: {
		stock: (number | null)[];
		disbursed: (number | null)[];
		repaid: (number | null)[];
	} | null;
	unit: string;
	source: string;
	retrieved: string;
}

/** Country-level context; not bilateral and never drawable as a world arc. */
export interface Wdi {
	years: number[];
	reserves: (number | null)[];
	gdp: (number | null)[];
	currentAccount: (number | null)[];
	cpi: (number | null)[];
	remittancesReceived: (number | null)[];
	remittancesPaid: (number | null)[];
	unit: string;
	source: string;
	retrieved: string;
}

interface WorldBundle {
	countries: Record<string, Country>;
	byIso2: Record<string, string>;
	/** Null when no snapshot has been fetched; the view falls back to agreements. */
	flows: Flows | null;
	debt: Debt | null;
	wdi: Wdi | null;
	generated: string;
	source: string;
}

function assertShape(v: unknown): asserts v is WorldBundle {
	const b = v as Partial<WorldBundle>;
	if (!b || typeof b !== 'object') throw new Error('world.json is not an object');
	if (!b.countries || !b.byIso2) {
		throw new Error('world.json is missing countries or byIso2 — rerun `npm run data`');
	}
	for (const [id, c] of Object.entries(b.countries)) {
		const a = (c as Country).anchor as unknown;
		if (!Array.isArray(a) || a.length !== 2 || !Number.isFinite(a[0]) || !Number.isFinite(a[1])) {
			throw new Error(`world.json: country ${id} has no usable [lon, lat] anchor`);
		}
	}
}

assertShape(raw);
const bundle: WorldBundle = raw;

/*
 * The topology is deliberately NOT exported here. This module is imported by
 * EntityPanel on every route (flows, debt, country lookup), and the 100KB
 * topology is geometry only the globe draws. It ships as static/world-topo.json
 * and is fetched at runtime by WorldView — see src/lib/world/topology.ts.
 * Keeping it out of this module keeps the shared bundle free of geometry
 * nothing on most routes reads (the R14 rule: heavy GIS payloads are fetched,
 * never bundled).
 */
export const countries = bundle.countries;

export const flows = bundle.flows;
export const debt = bundle.debt;
export const wdi = bundle.wdi;

/** Index of the latest year at or before `year`, or -1 if the axis starts later. */
function slotFor(years: number[], year: number): number {
	let index = -1;
	for (let i = 0; i < years.length; i++) {
		if (years[i] <= year) index = i;
		else break;
	}
	return index;
}

export interface YearDebt {
	/** Where to draw it: a country's own code, or the seat of a lending body. */
	iso2: string;
	/** Set when this row is a multilateral lender rather than a state. */
	institutionId?: string;
	/** Owed to this creditor, millions USD. Null means unobserved. */
	stock: number | null;
	disbursed: number | null;
	repaid: number | null;
	/** Net movement: what arrived less what went back out, for the year. */
	net: number;
}

export interface YearEnergy {
	iso2: string;
	/** Millions USD by fuel, Tunisia's own returns. `in` is Tunisia buying. */
	fuels: Record<string, { out: number; in: number }>;
	/** Everything Tunisia bought this year, across all three fuels. */
	bought: number;
	/** Everything it sold. Larger than `bought` until the early 1990s. */
	sold: number;
	total: number;
}

/**
 * Energy trade for a year, by partner, largest first.
 *
 * The fuels are kept separate rather than summed into "energy", because they answer
 * different questions and arrive from different places: crude and refined product
 * are bought on a world market, and gas comes down a pipe from one neighbour.
 */
export function energyIn(year: number): YearEnergy[] {
	if (!flows?.energy) return [];
	const i = slotFor(flows.years, year);
	if (i < 0) return [];

	const byCountry = new Map<string, YearEnergy>();
	for (const [fuel, partners] of Object.entries(flows.energy)) {
		for (const [iso2, row] of Object.entries(partners)) {
			const out = row.out[i] ?? 0;
			const inn = row.in[i] ?? 0;
			if (out <= 0 && inn <= 0) continue;
			const rec =
				byCountry.get(iso2) ?? ({ iso2, fuels: {}, bought: 0, sold: 0, total: 0 } as YearEnergy);
			rec.fuels[fuel] = { out, in: inn };
			rec.bought += inn;
			rec.sold += out;
			rec.total += out + inn;
			byCountry.set(iso2, rec);
		}
	}
	return [...byCountry.values()].sort((a, b) => b.total - a.total);
}

/** Bilateral creditors with a position in the given year, largest stock first. */
export function debtIn(year: number): YearDebt[] {
	if (!debt) return [];
	const i = slotFor(debt.years, year);
	if (i < 0) return [];

	const out: YearDebt[] = [];
	const push = (iso2: string, row: { stock: (number | null)[]; disbursed: (number | null)[]; repaid: (number | null)[] }, institutionId?: string) => {
		const stock = row.stock[i];
		const disbursed = row.disbursed[i];
		const repaid = row.repaid[i];
		if (stock === null && disbursed === null && repaid === null) return;
		out.push({ iso2, institutionId, stock, disbursed, repaid, net: (disbursed ?? 0) - (repaid ?? 0) });
	};

	for (const [iso2, row] of Object.entries(debt.creditors)) push(iso2, row);
	// Multilateral lenders, at their seats. They routinely outrank every state.
	for (const [id, row] of Object.entries(debt.bodies)) push(row.seat, row, id);

	return out.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));
}

/** Non-country lenders with a position in the given year, largest first. */
export function institutionalDebtIn(year: number): { name: string; stock: number }[] {
	if (!debt) return [];
	const i = slotFor(debt.years, year);
	if (i < 0) return [];
	const out: { name: string; stock: number }[] = [];
	for (const [name, row] of Object.entries(debt.institutional)) {
		const v = row[i];
		if (v === null || v <= 0) continue;
		out.push({ name, stock: v });
	}
	return out.sort((a, b) => b.stock - a.stock);
}

/** The country a graph institution's `iso2` refers to, or null if it has none. */
export function countryOf(iso2: string | undefined | null): Country | null {
	if (!iso2) return null;
	const id = bundle.byIso2[iso2];
	return id ? bundle.countries[id] : null;
}

/**
 * Tunisia's total external trade for the year, from the publisher's own aggregate.
 *
 * Deliberately a separate accessor from `tradeIn`: a total is not a partner row, and
 * keeping it apart is what stops it ever being drawn as an arc. `out`/`in` are
 * Tunisia's own filings, `mirrorOut`/`mirrorIn` are what the world reported of the
 * same flows — the same two books, at the level of the whole world. Nulls mean the
 * year carries no observation, never zero.
 */
export interface TradeTotals {
	year: number;
	out: number | null;
	in: number | null;
	/** out − in; null when either side is unobserved. */
	balance: number | null;
	mirrorOut: number | null;
	mirrorIn: number | null;
}

/** The total for the year under the cursor, or null when there is no series. */
export function tradeTotalsIn(year: number): TradeTotals | null {
	if (!flows?.totals) return null;
	const i = slotFor(flows.years, year);
	if (i < 0) return null;
	const out = flows.totals.out[i];
	const inn = flows.totals.in[i];
	if (out === null && inn === null) return null;
	return {
		year: flows.years[i],
		out,
		in: inn,
		balance: out === null || inn === null ? null : out - inn,
		mirrorOut: flows.totals.mirrorOut[i],
		mirrorIn: flows.totals.mirrorIn[i]
	};
}

/**
 * Tunisia's total external public debt for the year, from the publisher's own
 * aggregate. `stock` is a level (what is owed), `disbursed` and `repaid` are the
 * year's movements; `service` is what went back out (principal + interest).
 */
export interface DebtTotals {
	year: number;
	stock: number | null;
	disbursed: number | null;
	repaid: number | null;
	/** disbursed − repaid; null when either side is unobserved. */
	net: number | null;
}

/** The debt total for the year under the cursor, or null when there is no series. */
export function debtTotalsIn(year: number): DebtTotals | null {
	if (!debt?.totals) return null;
	const i = slotFor(debt.years, year);
	if (i < 0) return null;
	const stock = debt.totals.stock[i];
	const disbursed = debt.totals.disbursed[i];
	const repaid = debt.totals.repaid[i];
	if (stock === null && disbursed === null && repaid === null) return null;
	return {
		year: debt.years[i],
		stock,
		disbursed,
		repaid,
		net: disbursed === null || repaid === null ? null : disbursed - repaid
	};
}

export interface YearWdi {
	year: number;
	reserves: number | null;
	gdp: number | null;
	currentAccount: number | null;
	cpi: number | null;
	remittancesReceived: number | null;
	remittancesPaid: number | null;
}

/** Country-level WDI context at or before the cursor year. */
export function wdiIn(year: number): YearWdi | null {
	if (!wdi) return null;
	const i = slotFor(wdi.years, year);
	if (i < 0) return null;
	return {
		year: wdi.years[i],
		reserves: wdi.reserves[i],
		gdp: wdi.gdp[i],
		currentAccount: wdi.currentAccount[i],
		cpi: wdi.cpi[i],
		remittancesReceived: wdi.remittancesReceived[i],
		remittancesPaid: wdi.remittancesPaid[i]
	};
}

/**
 * Sum of the trade partner rows for the year — the fallback total.
 *
 * Smaller than the publisher's aggregate by exactly the unplaceable aggregates
 * the build discards. Callers must label it as a sum of rows, never as THE
 * total: the two figures differ for a reason, and the reason is the point.
 */
export function tradeSumIn(year: number): { out: number; in: number } | null {
	const rows = tradeIn(year);
	if (!rows.length) return null;
	let out = 0;
	let inn = 0;
	for (const r of rows) {
		if (r.out !== null) out += r.out;
		if (r.in !== null) inn += r.in;
	}
	return { out, in: inn };
}

/** Sum of the debt creditor rows for the year — the fallback total. */
export function debtSumIn(year: number): { stock: number; repaid: number } | null {
	const rows = debtIn(year);
	if (!rows.length) return null;
	let stock = 0;
	let repaid = 0;
	for (const r of rows) {
		if (r.stock !== null) stock += r.stock;
		if (r.repaid !== null) repaid += r.repaid;
	}
	return { stock, repaid };
}

export interface YearTrade {
	iso2: string;
	/** Tunisia's exports to this partner, millions USD. Null means unobserved. */
	out: number | null;
	/** Tunisia's imports from this partner. */
	in: number | null;
	/** The same two flows as the PARTNER reported them. */
	mirrorOut: number | null;
	mirrorIn: number | null;
	/** Sum of Tunisia's own two sides, treating unobserved as absent, not zero. */
	total: number;
	/** The partner's total for the same pair, where it reported one. */
	mirrorTotal: number | null;
	/**
	 * How far the two accounts differ, as a fraction of the larger — 0 when they
	 * agree, 1 when one side reports nothing at all. Null when only one side filed,
	 * because a single account is not a disagreement.
	 *
	 * Two countries describing one shipment routinely differ by tens of per cent:
	 * Tunisia values an export free-on-board while the partner values the same goods
	 * cost-insurance-freight, shipments cross the year boundary, and goods re-routed
	 * through a third country are attributed to whoever last handled them. The number
	 * is not noise — a persistent, one-sided gap is usually telling you something
	 * about how the trade is actually routed.
	 */
	gap: number | null;
}

/**
 * Every partner with an observation in the given year, largest first.
 *
 * Snaps to the nearest year at or before the cursor, and refuses to reach forward:
 * the reader scrubbing to 1961 must not be shown 1962's trade, because the whole
 * point of the time axis here is that it says what was true then. Before the first
 * year on the axis there is simply nothing, which is the honest answer for a globe
 * whose earliest observation is 1948.
 */
export function tradeIn(year: number): YearTrade[] {
	if (!flows) return [];
	const index = slotFor(flows.years, year);
	if (index < 0) return [];

	const out: YearTrade[] = [];
	for (const [iso2, row] of Object.entries(flows.partners)) {
		const x = row.out[index];
		const m = row.in[index];
		const mx = row.mirrorOut?.[index] ?? null;
		const mm = row.mirrorIn?.[index] ?? null;
		if (x === null && m === null) continue;

		const total = (x ?? 0) + (m ?? 0);
		if (total <= 0) continue;

		const mirrorTotal = mx === null && mm === null ? null : (mx ?? 0) + (mm ?? 0);
		const gap =
			mirrorTotal === null || mirrorTotal <= 0
				? null
				: Math.abs(total - mirrorTotal) / Math.max(total, mirrorTotal);

		out.push({ iso2, out: x, in: m, mirrorOut: mx, mirrorIn: mm, total, mirrorTotal, gap });
	}
	return out.sort((a, b) => b.total - a.total);
}
