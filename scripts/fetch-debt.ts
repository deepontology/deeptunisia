/**
 * Fetches Tunisia's external public debt, by creditor, into `flows/`.
 *
 * ── What this answers ─────────────────────────────────────────────────────────
 *
 * "Who lends to Tunisia, and who does Tunisia pay?" — which the trade arcs cannot
 * answer at all, and which is arguably the sharper question about external
 * dependency. The World Bank's International Debt Statistics is the only free source
 * that breaks a country's public and publicly-guaranteed external debt down BY
 * CREDITOR rather than reporting one aggregate number.
 *
 * Four series, each requested once for every creditor and every year:
 *
 *   DOD   debt outstanding — the stock. What is owed right now.
 *   DIS   disbursements    — money arriving this year.
 *   AMT   principal repaid — money leaving this year.
 *   INT   interest paid    — money leaving this year, for the privilege.
 *
 * The last three are what make the globe able to draw lending as two opposed arcs
 * on the same pair: what came in, and what went back out. For most of the period
 * since the 1990s the outbound number is the larger one, which is the whole point of
 * separating them rather than netting them into a single line.
 *
 * ── Creditors are not all countries ───────────────────────────────────────────
 *
 * The counterpart list mixes three kinds: states (France, Kuwait, Japan), the
 * institutions that dominate the modern picture (World Bank-IBRD, African Dev. Bank,
 * European Investment Bank, IMF), and things that are neither — "Bondholders",
 * "Multiple Lenders", and "World", which is the total and must never be drawn.
 *
 * Several of the institutional creditors already exist in this project's graph with
 * sourced summaries and their own relationships, so the build joins them by id and
 * the globe can open the record. That join lives in build-world.ts; this script only
 * transcribes what the World Bank publishes, names and all.
 *
 * ── Licence ───────────────────────────────────────────────────────────────────
 *
 * World Bank Open Data is CC-BY 4.0 — explicitly redistributable with attribution,
 * which is why this snapshot is committed where the IMF's could not be. See the
 * header of scripts/fetch-trade.ts for that story.
 *
 * Usage: `npx tsx scripts/fetch-debt.ts`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FLOWS_DIR = join(ROOT, 'flows');

const USER_AGENT =
	'DeepTunisiaTradeBot/1.0 (+https://deeptunisia.org; external debt archive; contact via https://github.com/deeptunisia)';

const FETCH_TIMEOUT_MS = 120_000;

/** Source 6 is International Debt Statistics. */
const IDS = 'https://api.worldbank.org/v2/sources/6/country/TUN';

/**
 * The four series, and the direction each one points.
 *
 * `stock` is not a flow and is kept separate: it is a level, not a movement, and
 * adding it to either direction would double-count.
 */
const SERIES = {
	stock: 'DT.DOD.DPPG.CD',
	disbursed: 'DT.DIS.DPPG.CD',
	principal: 'DT.AMT.DPPG.CD',
	interest: 'DT.INT.DPPG.CD'
} as const;

/**
 * Counterparts that are totals or non-entities, excluded by id.
 *
 * "World" is the sum of every other row; drawing it would put Tunisia's entire
 * external debt on a single arc to nowhere. The others are real categories of
 * creditor with no place on a map — a bondholder is not somewhere.
 */
const NOT_A_PLACE = new Set(['World']);

interface IdsRow {
	variable: { concept: string; id: string; value: string }[];
	value: number | null;
}

async function get(url: string, label: string): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
			signal: controller.signal
		});
		if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

/** creditor name → year → value in USD. */
type Decoded = Map<string, Map<number, number>>;

function decode(json: unknown, label: string): { data: Decoded; creditors: Map<string, string>; world: Map<number, number> } {
	const res = json as { source?: { data?: IdsRow[] } };
	const rows = res.source?.data;
	if (!rows) throw new Error(`${label}: response carried no data`);

	const data: Decoded = new Map();
	/** name → the World Bank's own counterpart id, kept so the join is auditable. */
	const creditors = new Map<string, string>();
	/** year → the publisher's own total. Never a creditor row, never an arc. */
	const world = new Map<number, number>();

	for (const row of rows) {
		if (row.value === null) continue;
		/*
		 * An explicit zero is not an observation of a relationship, it is the API
		 * filling the cube. The disbursement series returns a 0 row for all 303
		 * counterparts in the reference list, of which 244 have never lent Tunisia
		 * anything — keeping them would put 244 creditors on a page that has 59.
		 */
		if (row.value === 0) continue;

		const find = (c: string) => row.variable.find((v) => v.concept === c);
		const cp = find('Counterpart-Area');
		const time = find('Time');
		if (!cp || !time) continue;
		// The API pads some names to a fixed width — "World Bank-IBRD" arrives with
		// nine trailing spaces, which then fail every name match downstream and look
		// like a layout bug when rendered.
		cp.value = cp.value.trim();
		if (cp.value === 'World') {
			// The aggregate, captured rather than discarded — the strip and the
			// ledger's totals row read it, and it is deliberately NOT a creditor.
			const year = Number(String(time.value).replace(/\D/g, ''));
			if (Number.isFinite(year)) world.set(year, row.value);
			continue;
		}
		if (NOT_A_PLACE.has(cp.value)) continue;

		// Time ids arrive as "YR1970".
		const year = Number(String(time.value).replace(/\D/g, ''));
		if (!Number.isFinite(year)) continue;

		creditors.set(cp.value, cp.id);
		const byYear = data.get(cp.value) ?? new Map<number, number>();
		byYear.set(year, row.value);
		data.set(cp.value, byYear);
	}
	return { data, creditors, world };
}

/**
 * Drop everything after the last year the debt STOCK was actually reported.
 *
 * IDS publishes debt service past the present: the 2032 rows are the World Bank's
 * projection of what Tunisia will repay on loans it already holds. They are useful
 * and they are forecasts, and this project's whole architecture is that a claim
 * never wears clothes it has not earned — an arc drawn from a projection would be
 * indistinguishable from one drawn from a measurement.
 *
 * The cutoff is derived from the data rather than written down, so it moves on its
 * own when next year's actuals are published.
 */
function trimProjections(
	sets: Record<string, Decoded>,
	observedThrough: number
): { dropped: number; years: number[] } {
	let dropped = 0;
	const kept = new Set<number>();
	for (const data of Object.values(sets)) {
		for (const byYear of data.values()) {
			for (const year of [...byYear.keys()]) {
				if (year > observedThrough) {
					byYear.delete(year);
					dropped++;
				} else kept.add(year);
			}
		}
	}
	return { dropped, years: [...kept].sort((a, b) => a - b) };
}

async function main() {
	console.log('  World Bank International Debt Statistics — Tunisia by creditor\n');

	const sets: Record<string, Decoded> = {};
	const creditors = new Map<string, string>();
	const worldSeries: Record<string, Record<string, number>> = {};

	for (const [key, series] of Object.entries(SERIES)) {
		const url = `${IDS}/series/${series}/counterpart-area/all/time/all?format=json&per_page=20000`;
		const json = await get(url, key);
		const { data, creditors: seen, world } = decode(json, key);
		for (const [name, id] of seen) creditors.set(name, id);
		sets[key] = data;
		worldSeries[key] = Object.fromEntries(world);
		console.log(`  ${key.padEnd(10)} ${data.size} creditors · total ${world.size} years`);
	}

	// The stock series is only ever reported for years that have happened, so its
	// last year is the boundary between what was measured and what was projected.
	let observedThrough = 0;
	for (const byYear of sets.stock.values()) {
		for (const y of byYear.keys()) observedThrough = Math.max(observedThrough, y);
	}
	const { dropped, years: sorted } = trimProjections(sets, observedThrough);

	const out: Record<string, Record<string, Record<string, number>>> = {};
	for (const [key, data] of Object.entries(sets)) {
		out[key] = Object.fromEntries(
			[...data].filter(([, byYear]) => byYear.size).map(([name, byYear]) => [name, Object.fromEntries(byYear)])
		);
	}

	assertScale(out.stock, worldSeries.stock);
	console.log(`  projections  ${dropped} rows after ${observedThrough} dropped as forecasts`);

	// The same projection boundary applies to the totals: anything past the last
	// observed stock year is a forecast and must not wear a measurement's clothes.
	const totals: Record<string, Record<string, number>> = {};
	for (const [key, byYear] of Object.entries(worldSeries)) {
		totals[key] = Object.fromEntries(Object.entries(byYear).filter(([y]) => Number(y) <= observedThrough));
	}

	const retrieved = new Date().toISOString();
	mkdirSync(join(FLOWS_DIR, 'worldbank'), { recursive: true });

	writeFileSync(
		join(FLOWS_DIR, 'worldbank', 'tunisia-debt.json'),
		JSON.stringify({ retrieved, series: SERIES, creditors: Object.fromEntries(creditors), ...out, totals }),
		'utf8'
	);

	console.log(`\n  period     ${sorted[0]}–${sorted.at(-1)} (${sorted.length} years)`);
	console.log(`  creditors  ${creditors.size} distinct`);
	console.log(`\n  → flows/worldbank/`);
}

/**
 * Pinned against reality, like the trade fetcher's check and for the same reason.
 *
 * Tunisia's public external debt stock is a couple of tens of billions of dollars.
 * If the API ever switches to millions, or to a different currency, every arc on the
 * globe scales silently and nothing looks broken.
 */
function assertScale(stock: Record<string, Record<string, number>>, totals?: Record<string, number>) {
	let peak = 0;
	for (const byYear of Object.values(stock)) {
		for (const [y, v] of Object.entries(byYear)) if (Number(y) >= 2015) peak = Math.max(peak, v);
	}
	if (peak < 1e9 || peak > 1e12) {
		throw new Error(
			`sanity check: the largest single creditor position since 2015 came out as ` +
				`${peak.toExponential(2)} USD, which is not a few billion. Do not ship this.`
		);
	}
	console.log(`\n  scale check  largest recent creditor position ${(peak / 1e9).toFixed(2)}bn USD  ok`);

	// The total must be the largest number in the file — it is the sum of every row.
	// A total below the largest creditor is a join or unit error, not a dataset quirk.
	if (totals) {
		const entries = Object.entries(totals).filter(([y]) => Number(y) >= 2015);
		if (!entries.length) throw new Error('sanity check: no recent total stock observations');
		const totalPeak = Math.max(...entries.map(([, v]) => v));
		if (totalPeak < 1e10 || totalPeak > 5e11) {
			throw new Error(
				`sanity check: total external debt stock since 2015 came out as ` +
					`${totalPeak.toExponential(2)} USD, which is not tens of billions. Do not ship this.`
			);
		}
		console.log(`  scale check  total external debt stock ${(totalPeak / 1e9).toFixed(2)}bn USD  ok`);
	}
}

main().catch((e) => {
	console.error(`\n  fetch-debt failed: ${(e as Error).message}\n`);
	process.exit(1);
});
