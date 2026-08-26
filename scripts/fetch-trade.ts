/**
 * Fetches Tunisia's bilateral goods trade into `flows/`.
 *
 * ── What this is, and why it is not in data/ ──────────────────────────────────
 *
 * A trade statistic is not the same kind of object as the rest of the graph. A
 * position or a relationship is a claim somebody made, which a source can be cited
 * for and a human can grade. A trade figure is a MEASUREMENT: produced in bulk by a
 * statistical office, revised without announcement, and — the part that matters most
 * here — reported differently by each of the two countries involved.
 *
 * So flows live in `flows/`, a sibling of `data/` rather than a child, for exactly
 * the reason the news archive lives in `feed/`: so that nobody skimming the
 * repository mistakes an ingested number for a graded claim. Nothing here carries a
 * `basis`, a `confidence` or a `sources` list, because those four fields mean "a
 * human checked this against evidence" and no human checked forty thousand numbers.
 *
 * ── Why UN Comtrade and not the IMF ───────────────────────────────────────────
 *
 * The IMF's IMTS (formerly Direction of Trade Statistics) is the better dataset on
 * coverage alone: it runs from 1948 where Comtrade starts in 1962, which for a
 * project about Tunisia since independence in 1956 is six years at exactly the
 * moment that matters most. It was implemented first and then abandoned, for one
 * reason: the IMF's general terms grant non-commercial personal use "without any
 * right to resell, redistribute, compile, or create derivative works", the separate
 * terms covering statistical Data could not be read because imf.org refuses
 * automated requests, and this project publishes its entire dataset as a public
 * download. Shipping it would have been redistribution of material we could not
 * establish a right to redistribute.
 *
 * Comtrade is the UN's own bilateral trade database, free without an API key on the
 * preview endpoint, and the basis on which both the Observatory of Economic
 * Complexity and Harvard's Atlas of Economic Complexity publish derived data.
 *
 * The swap also bought something the IMF could not give: Comtrade carries states that
 * no longer exist as first-class partners — the USSR (810), Czechoslovakia (200),
 * East Germany (278), Yugoslavia (890), both Yemens, both Vietnams — each with a
 * publisher-supplied expiry date. Tunisia's Cold War trade is part of this project's
 * subject, and under the IMF those rows had no code at all and were dropped.
 *
 * ── Comtrade's partner codes are NOT plain M49, and this cost real time ───────
 *
 * Both Comtrade and Natural Earth describe their country codes as M49, which makes
 * joining on the number look obviously correct. It is not. About a dozen countries
 * differ, including the largest ones here: France is 251 ("France, incl. Monaco")
 * against the topology's 250, the United States 842 against 840, Switzerland 757
 * against 756, India 699 against 356. Joining on the number silently dropped
 * Tunisia's single biggest trading partner while everything still rendered.
 *
 * Worse, the obvious fix is also wrong: several countries hold MORE THAN ONE code
 * across time — Belgium and Belgium-Luxembourg, Germany and the Federal Republic,
 * the USA with and without Puerto Rico — and both 250 and 251 are listed as `FR`.
 * Taking the first match found the empty one.
 *
 * So the only correct join is: partner code → ISO alpha-2 via the reference table →
 * country, SUMMING every code that shares a country. The scale check at the bottom
 * of this file is what caught both mistakes and is the reason it exists.
 *
 * ── Two limits of the free preview endpoint, and what they cost ───────────────
 *
 * 1. One period per request. Each year needs three calls — Tunisia's own returns, the
 *    partners' mirror of them, and the energy breakdown — so a full run is around 190
 *    requests, and firing them without a pause earns HTTP 429. With the throttle below
 *    the run takes roughly fifteen minutes. It is not something to invoke casually.
 *
 * 2. Commodity classifications do not span the period. HS did not exist before 1988,
 *    and a request for 1970 under HS returns an empty result rather than an error —
 *    which is the dangerous shape, because it looks like "Tunisia had no trade" — so
 *    early years are requested under SITC Revision 1 instead. The changeover is the
 *    one place this script asserts something about the data rather than transcribing
 *    it: `TOTAL` is the same aggregate in both schemes, and the three fuel codes are
 *    matched across them in ENERGY below.
 *
 * Usage: `npx tsx scripts/fetch-trade.ts`
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FLOWS_DIR = join(ROOT, 'flows');

/**
 * Identifies the project and points at it, so an administrator seeing this in a log
 * can find out who is asking and complain to a human. Same contract as the feed
 * fetcher.
 */
const USER_AGENT =
	'DeepTunisiaTradeBot/1.0 (+https://deeptunisia.org; bilateral trade archive; contact via https://github.com/deeptunisia)';

const FETCH_TIMEOUT_MS = 90_000;

const COMTRADE = 'https://comtradeapi.un.org/public/v1/preview/C/A';
const PARTNER_AREAS = 'https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json';
/** Capital coordinates for countries the topology cannot draw. CC-BY 4.0. */
const WORLD_BANK = 'https://api.worldbank.org/v2/country?format=json&per_page=400';

/** Tunisia, in the M49 numeric code Comtrade and Natural Earth both use. */
const REPORTER = 788;

/** Comtrade's earliest year. Tunisia's own returns begin around here. */
const FIRST_YEAR = 1962;

/** HS exists from 1988; before that, SITC Revision 1. See the header. */
const HS_FROM = 1988;

/**
 * Energy, in the two classifications, at the level that answers the question.
 *
 * "Who sends Tunisia its oil, and who sends it gas" needs the commodity split, not a
 * fuels total: crude and gas arrive from different countries for different reasons,
 * and the transit royalty Tunisia takes in kind from the Algeria-Italy pipeline is
 * gas and nothing else.
 *
 * The two schemes line up at this level — HS 2709 crude against SITC 331, 2710
 * refined against 332, 2711 gas against 341 — which is what makes a series that
 * crosses 1988 comparable at all. It is not a perfect identity and should not be
 * read as one; the categories were drawn by different committees.
 *
 * Worth knowing before reading the result: Tunisia exported over a billion dollars
 * of crude in 1980 and is now a net energy importer. The reversal is the point.
 */
const ENERGY = {
	crude: { HS: '2709', S1: '331' },
	refined: { HS: '2710', S1: '332' },
	gas: { HS: '2711', S1: '341' }
} as const;

type Fuel = keyof typeof ENERGY;

/**
 * Pause between requests.
 *
 * The preview endpoint publishes no rate limit and sends no `RateLimit` or
 * `Retry-After` header, so there is nothing to read and obey — 1.3s earned a 429 on
 * the third call. This is a starting guess; `get` below backs off when it is wrong,
 * which is the part that actually matters. A fixed delay tuned once is a delay that
 * breaks silently the next time the limit changes.
 */
const THROTTLE_MS = 4_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, label: string, attempt = 0): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
			signal: controller.signal
		});

		if (res.status === 429) {
			if (attempt >= 6) {
				throw new Error(`${label}: still rate limited after ${attempt} backoffs — try again later`);
			}
			// Honour Retry-After if it ever appears; otherwise double each time from 8s.
			const stated = Number(res.headers.get('retry-after'));
			const wait = Number.isFinite(stated) && stated > 0 ? stated * 1000 : 8_000 * 2 ** attempt;
			process.stdout.write(`\r  rate limited — waiting ${Math.round(wait / 1000)}s          `);
			await sleep(wait);
			return get(url, label, attempt + 1);
		}

		if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

interface PartnerArea {
	id: number;
	text: string;
	PartnerCodeIsoAlpha2?: string;
	entryExpiredDate?: string;
	isGroup: boolean;
}

interface Row {
	refYear: number;
	partnerCode: number;
	flowCode: string;
	primaryValue: number;
}

async function main() {
	const thisYear = new Date().getUTCFullYear();

	console.log('  UN Comtrade — Tunisia bilateral goods trade\n');

	// --- the partner reference table ---------------------------------------
	const areasRaw = (await get(PARTNER_AREAS, 'partner areas')) as
		| { results: PartnerArea[] }
		| PartnerArea[];
	const areas = Array.isArray(areasRaw) ? areasRaw : areasRaw.results;

	const partners: Record<
		string,
		{ iso2?: string; name: string; expired?: string; group: boolean }
	> = {};
	for (const a of areas) {
		if (a.id === 0) continue; // "World" — an aggregate wearing a country's clothes
		partners[String(a.id)] = {
			...(a.PartnerCodeIsoAlpha2 && /^[A-Z]{2}$/.test(a.PartnerCodeIsoAlpha2)
				? { iso2: a.PartnerCodeIsoAlpha2 }
				: {}),
			name: a.text,
			// Publisher-supplied. This is what identifies the USSR, Czechoslovakia,
			// East Germany and Yugoslavia as states that ended, without anybody here
			// typing a date into a file.
			...(a.entryExpiredDate ? { expired: a.entryExpiredDate.slice(0, 10) } : {}),
			group: Boolean(a.isGroup)
		};
	}
	console.log(`  partner areas   ${Object.keys(partners).length}`);

	// --- year by year --------------------------------------------------------
	const out: Record<string, Record<string, number>> = {};
	const inn: Record<string, Record<string, number>> = {};
	/**
	 * The same flows as the partner reports them.
	 *
	 * `mirrorOut[P][year]` is what P says it IMPORTED from Tunisia, against which
	 * `out[P][year]` is what Tunisia says it EXPORTED to P. They describe one event
	 * and they disagree, routinely and substantially — different valuation (Tunisia
	 * reports exports free-on-board, the partner reports imports cost-insurance-
	 * freight), different timing at the year boundary, goods re-routed through a third
	 * country, and sometimes one side simply not filing.
	 *
	 * Every other trade visualisation picks a side or quietly averages. This project
	 * already has a mechanism for two sources disagreeing about one fact and a rule
	 * that the disagreement is recorded rather than resolved, so both numbers are kept
	 * and the gap becomes something the reader can see.
	 */
	const mirrorOut: Record<string, Record<string, number>> = {};
	const mirrorIn: Record<string, Record<string, number>> = {};
	/**
	 * The World aggregate — partnerCode 0 — captured, never a partner row.
	 *
	 * Every own-returns response already carries this row; the first version of this
	 * script threw it away. It is the publisher's own total and the only honest
	 * "total trade" figure: the sum of partner rows is smaller by exactly the
	 * aggregates the build discards ("Areas, nes" and friends, $1.24bn at peak).
	 * Kept under `totals` so the build can assert it never reaches the arc renderer.
	 */
	const totalsOut: Record<string, number> = {};
	const totalsIn: Record<string, number> = {};
	const totalsMirrorOut: Record<string, number> = {};
	const totalsMirrorIn: Record<string, number> = {};
	/** fuel → direction → partner → year → USD. */
	const energy: Record<Fuel, { out: Record<string, Record<string, number>>; in: Record<string, Record<string, number>> }> =
		{ crude: { out: {}, in: {} }, refined: { out: {}, in: {} }, gas: { out: {}, in: {} } };
	const empty: number[] = [];
	let observations = 0;
	let mirrored = 0;
	let fuelObs = 0;

	for (let year = FIRST_YEAR; year <= thisYear; year++) {
		/**
		 * `own` asks Tunisia what it traded with everyone; `mirror` asks everyone what
		 * they traded with Tunisia. Same events, two sets of books.
		 */
		const ask = async (cls: string, direction: 'own' | 'mirror' = 'own', cmd = 'TOTAL') => {
			const who =
				direction === 'own'
					? `reporterCode=${REPORTER}&partnerCode=`
					: `reporterCode=&partnerCode=${REPORTER}`;
			const url =
				`${COMTRADE}/${cls}?${who}&period=${year}` +
				`&cmdCode=${cmd}&flowCode=X,M&partner2Code=0&customsCode=C00&motCode=0`;
			const json = (await get(url, `${year} (${cls}, ${direction}, ${cmd})`)) as { data?: Row[] };
			return json.data ?? [];
		};

		const primary = year >= HS_FROM ? 'HS' : 'S1';
		let rows = await ask(primary);

		/*
		 * An empty year is ambiguous and the ambiguity is dangerous: it means either
		 * "no trade was reported" or "this country was not filing under this
		 * classification yet", and the API returns the same empty array for both.
		 * Tunisia filed under SITC until 1990 even though HS existed from 1988, so
		 * three years came back blank and looked like a collapse in Tunisian trade.
		 *
		 * So an empty result is retried under the other scheme before being believed.
		 * A year that is empty under both is recorded as genuinely absent.
		 */
		if (!rows.length) {
			await sleep(THROTTLE_MS);
			rows = await ask(primary === 'HS' ? 'S1' : 'HS');
		}

		if (!rows.length) {
			empty.push(year);
		} else {
			for (const r of rows) {
				// partnerCode 0 is the world total, not a counterparty. Including it
				// among the partners would draw an arc to nowhere carrying the sum of
				// all the others — so it is captured into the totals series instead,
				// where the strip and the ledger's totals row can read it.
				if (!r.partnerCode) {
					const t = r.flowCode === 'X' ? totalsOut : r.flowCode === 'M' ? totalsIn : null;
					if (t) t[String(r.refYear)] = Number(r.primaryValue);
					continue;
				}
				const meta = partners[String(r.partnerCode)];
				if (!meta || meta.group) continue;
				const value = Number(r.primaryValue);
				if (!Number.isFinite(value) || value <= 0) continue;

				const side = r.flowCode === 'X' ? out : r.flowCode === 'M' ? inn : null;
				if (!side) continue;
				(side[String(r.partnerCode)] ??= {})[String(r.refYear)] = value;
				observations++;
			}
		}

		/*
		 * The mirror is only asked for where Tunisia itself reported. A year Tunisia
		 * did not file has nothing to disagree with, and asking doubles the request
		 * count against an endpoint that rate-limits at three per five seconds.
		 */
		if (rows.length) {
			await sleep(THROTTLE_MS);
			const back = await ask(primary, 'mirror');
			for (const r of back) {
				const reporter = (r as Row & { reporterCode: number }).reporterCode;
				// reporterCode 0 is the world total of every partner's filing, not a
				// counterparty — captured as the mirror totals, never a partner row.
				if (reporter === 0) {
					const t =
						r.flowCode === 'M' ? totalsMirrorOut : r.flowCode === 'X' ? totalsMirrorIn : null;
					if (t) t[String(year)] = Number(r.primaryValue);
					continue;
				}
				if (!reporter || reporter === REPORTER) continue;
				const meta = partners[String(reporter)];
				if (!meta || meta.group) continue;
				const value = Number(r.primaryValue);
				if (!Number.isFinite(value) || value <= 0) continue;

				// The partner's IMPORT is the mirror of Tunisia's EXPORT, and vice versa.
				const side = r.flowCode === 'M' ? mirrorOut : r.flowCode === 'X' ? mirrorIn : null;
				if (!side) continue;
				(side[String(reporter)] ??= {})[String(year)] = value;
				mirrored++;
			}
		}

		/*
		 * Energy, as one request covering all three fuels. Only asked for where Tunisia
		 * filed at all, for the same reason as the mirror.
		 */
		if (rows.length) {
			await sleep(THROTTLE_MS);
			const scheme = primary === 'HS' ? 'HS' : 'S1';
			const codes = (Object.keys(ENERGY) as Fuel[]).map((f) => ENERGY[f][scheme]);
			const byCode = new Map<string, Fuel>(
				(Object.keys(ENERGY) as Fuel[]).map((f) => [ENERGY[f][scheme], f])
			);

			for (const r of await ask(primary, 'own', codes.join(','))) {
				if (!r.partnerCode) continue;
				const meta = partners[String(r.partnerCode)];
				if (!meta || meta.group) continue;
				const fuel = byCode.get(String((r as Row & { cmdCode: string }).cmdCode));
				if (!fuel) continue;
				const value = Number(r.primaryValue);
				if (!Number.isFinite(value) || value <= 0) continue;

				const side = r.flowCode === 'X' ? energy[fuel].out : r.flowCode === 'M' ? energy[fuel].in : null;
				if (!side) continue;
				(side[String(r.partnerCode)] ??= {})[String(year)] = value;
				fuelObs++;
			}
		}

		process.stdout.write(
			`\r  fetching        ${year}  (${observations} own, ${mirrored} mirrored, ${fuelObs} energy)   `
		);
		if (year < thisYear) await sleep(THROTTLE_MS);
	}
	process.stdout.write('\n');

	assertScale(out, partners);

	// --- write ---------------------------------------------------------------
	const retrieved = new Date().toISOString();
	mkdirSync(join(FLOWS_DIR, 'comtrade'), { recursive: true });

	writeFileSync(
		join(FLOWS_DIR, 'comtrade', 'tunisia-trade.json'),
		JSON.stringify({
			retrieved,
			reporter: REPORTER,
			out,
			in: inn,
			mirrorOut,
			mirrorIn,
			energy,
			totals: { out: totalsOut, in: totalsIn, mirrorOut: totalsMirrorOut, mirrorIn: totalsMirrorIn }
		}),
		'utf8'
	);
	/*
	 * Capital coordinates, from the World Bank's country list.
	 *
	 * Comtrade's reference table carries no geometry, and the 1:110m topology is too
	 * coarse to draw Malta, Singapore, Bahrain, Hong Kong or Mauritius — every one a
	 * real Tunisian counterparty, and Malta materially so. A capital is not a centroid,
	 * but for a country that small the difference is smaller than the dot, and taking
	 * it from a publisher beats typing latitudes nobody can check.
	 *
	 * World Bank Open Data is CC-BY 4.0, so unlike the trade figures this part is
	 * unambiguously redistributable.
	 */
	const wbRaw = (await get(WORLD_BANK, 'World Bank countries')) as [
		unknown,
		{ iso2Code: string; region?: { id: string }; longitude?: string; latitude?: string }[]
	];
	const points: Record<string, [number, number]> = {};
	for (const r of wbRaw[1] ?? []) {
		if (!r.region || r.region.id === 'NA') continue;
		if (!/^[A-Z]{2}$/.test(r.iso2Code)) continue;
		const lon = Number(r.longitude);
		const lat = Number(r.latitude);
		if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue;
		points[r.iso2Code] = [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];
	}

	writeFileSync(
		join(FLOWS_DIR, 'comtrade', 'partners.json'),
		JSON.stringify(
			{ retrieved, source: PARTNER_AREAS, pointsSource: WORLD_BANK, partners, points },
			null,
			1
		),
		'utf8'
	);

	const years = new Set<number>();
	for (const side of [out, inn]) {
		for (const byYear of Object.values(side)) for (const y of Object.keys(byYear)) years.add(Number(y));
	}
	const sorted = [...years].sort((a, b) => a - b);

	writeFileSync(
		join(FLOWS_DIR, 'manifest.json'),
		JSON.stringify(
			{
				generated: retrieved,
				datasets: [
					{
						id: 'comtrade',
						title: 'UN Comtrade — Tunisia bilateral goods trade, all partners, annual totals',
						publisher: 'United Nations Statistics Division',
						url: 'https://comtradeplus.un.org/',
						api: COMTRADE,
						retrieved,
						coverage: {
							from: sorted[0],
							to: sorted.at(-1),
							partners: new Set([...Object.keys(out), ...Object.keys(inn)]).size,
							observations,
							mirrored,
							energy: fuelObs
						},
						unit: 'USD',
						classification: `SITC Rev.1 to ${HS_FROM - 1}, HS from ${HS_FROM}`,
						licence: 'UN Comtrade terms of use',
						licence_url: 'https://comtradeplus.un.org/',
						/*
						 * True, on the basis that Comtrade is free to access without a key,
						 * requires attribution, and is the source both the Observatory of
						 * Economic Complexity and Harvard's Atlas of Economic Complexity
						 * republish derived data from. If that reading is ever challenged,
						 * this flag is the single place to change and the build reads it.
						 */
						redistributable: true,
						attribution: 'United Nations Statistics Division, UN Comtrade'
					},
					{
						id: 'wb-points',
						title: 'Capital coordinates, for countries absent from the 1:110m topology',
						publisher: 'World Bank',
						url: 'https://api.worldbank.org/v2/country',
						retrieved,
						licence: 'CC-BY-4.0',
						licence_url: 'https://datacatalog.worldbank.org/public-licenses',
						redistributable: true,
						attribution: 'World Bank Open Data'
					}
				]
			},
			null,
			1
		),
		'utf8'
	);

	const defunct = Object.entries(partners).filter(([id, p]) => p.expired && (out[id] || inn[id]));

	console.log(`  period          ${sorted[0]}–${sorted.at(-1)} (${sorted.length} years)`);
	console.log(`  observations    ${observations} own · ${mirrored} mirrored · ${fuelObs} energy`);
	console.log(
		`  totals          ${Object.keys(totalsOut).length} years · ` +
			`mirror ${Object.keys(totalsMirrorOut).length} years`
	);
	if (empty.length) {
		console.log(`  no data         ${empty.length} years returned nothing: ${empty.join(', ')}`);
	}
	console.log(`  former states   ${defunct.length} with trade: ${defunct.map(([, p]) => p.name).join(', ')}`);
	console.log(`\n  → flows/comtrade/`);
}

/**
 * Values must be plain USD.
 *
 * There is no field in the payload distinguishing dollars from thousands or
 * millions, so the scale is pinned against reality: France is Tunisia's largest
 * export market and the figure runs to billions a year. A silent unit change is the
 * one failure here that would look entirely plausible on the globe.
 */
function assertScale(
	out: Record<string, Record<string, number>>,
	partners: Record<string, { iso2?: string }>
) {
	/*
	 * France is looked up by ISO code, never by M49 number — and by EVERY code that
	 * carries it, never the first one found.
	 *
	 * Two things bite here, and they bit in sequence. Comtrade's partner codes are not
	 * standard M49 for about a dozen countries: France is 251 ("France, incl. Monaco")
	 * not 250, the United States 842 not 840, Switzerland 757 not 756, India 699 not
	 * 356. Joining on the number looked obviously right — both sides say "M49" — and
	 * silently dropped Tunisia's largest trading partner.
	 *
	 * Then the fix had the same flaw one level up: the reference table lists BOTH 250
	 * and 251 as `FR`, and taking the first match found the empty one. Several
	 * countries genuinely span multiple codes across time — Belgium and
	 * Belgium-Luxembourg, Germany and the Federal Republic, the USA with and without
	 * Puerto Rico — so the only correct move is to sum every code sharing a country,
	 * which is what the build does too.
	 */
	const codes = Object.entries(partners)
		.filter(([, p]) => p.iso2 === 'FR')
		.map(([code]) => code);
	const byYear = new Map<string, number>();
	for (const code of codes) {
		for (const [y, v] of Object.entries(out[code] ?? {})) {
			byYear.set(y, (byYear.get(y) ?? 0) + v);
		}
	}
	if (!byYear.size) throw new Error('sanity check: no French series to check the scale against');
	const recent = [...byYear.entries()]
		.filter(([y]) => Number(y) >= 2015)
		.map(([, v]) => v);
	if (!recent.length) throw new Error('sanity check: no recent French observations');
	const peak = Math.max(...recent);
	if (peak < 1e9 || peak > 5e10) {
		throw new Error(
			`sanity check: peak recent exports to France came out as ${peak.toExponential(2)} USD, ` +
				`which is not a few billion. The unit has changed — do not ship this.`
		);
	}
	console.log(`  scale check     peak recent exports to France ${(peak / 1e9).toFixed(2)}bn USD  ok`);
}

main().catch((e) => {
	console.error(`\n  fetch-trade failed: ${(e as Error).message}\n`);
	process.exit(1);
});
