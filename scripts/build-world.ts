/**
 * Compiles the world geometry into `src/generated/world.json`.
 *
 * WHY THIS RUNS AT BUILD TIME
 *
 * The atlas makes zero cross-origin requests on every route — asserted, not assumed,
 * by scripts/smoke.ts, with a comment naming map tiles specifically. So there is no
 * tile server and no CDN: the shape of the world ships in the bundle or it does not
 * exist. This script is what puts it there.
 *
 * WHAT IT TRIMS, AND WHY EACH
 *
 * Natural Earth 110m via `world-atlas` is 108KB of TopoJSON for 177 features. Two
 * of those features are ice with no bearing on Tunisian trade — Antarctica alone is
 * a meaningful slice of the file, because a coastline that wraps the entire globe
 * has a lot of coordinates. Dropping them is free.
 *
 * Centroids are computed here rather than in the browser. `geoCentroid` over 177
 * MultiPolygons is not enormous, but it is the same answer every time, on every
 * page load, for every reader — which is the definition of something that belongs
 * in a build step.
 *
 * WHY LARGEST-POLYGON CENTROID RATHER THAN geoCentroid
 *
 * `geoCentroid` of a MultiPolygon averages over every part, which is right for a
 * centre of mass and wrong for an anchor a reader has to recognise. The United
 * States averaged with Alaska and Hawaii lands in the Pacific; France averaged with
 * its overseas departments leaves Europe entirely. An arc has to leave from
 * somewhere that looks like the country, so each anchor is the centroid of that
 * country's largest landmass.
 *
 * Usage: `npx tsx scripts/build-world.ts` (chained into `npm run data`).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { geoCentroid, geoArea } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import { CountriesFileSchema } from './schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'src', 'generated');
const SOURCE = join(ROOT, 'node_modules', 'world-atlas', 'countries-110m.json');
const COUNTRIES = join(ROOT, 'data', 'countries.yaml');
const FLOWS_DIR = join(ROOT, 'flows');
const DATASET = join(OUT_DIR, 'dataset.json');
const WDI_FILE = join(FLOWS_DIR, 'worldbank', 'tunisia-wdi.json');

/** The languages a country is named in, matching src/lib/i18n.ts. */
const LOCALES = ['en', 'fr', 'ar'] as const;

/**
 * Typographic normalisation before matching Natural Earth names to CLDR names.
 *
 * Only orthography, never wording. Natural Earth writes `Côte d'Ivoire` with a
 * straight apostrophe and CLDR with a curly one; CLDR writes `Bosnia & Herzegovina`
 * and Natural Earth `Bosnia and Herz.`. The first difference is nothing at all and
 * should not cost a hand-written alias; the second is a real abbreviation and
 * should. Normalising the ampersand as well as the apostrophe is safe because the
 * build asserts that no two features resolve to the same country, so an over-eager
 * normalisation fails loudly rather than silently merging two states.
 */
function normalise(s: string): string {
	return s
		.replace(/[’ʼ]/g, "'")
		.replace(/\s*&\s*/g, ' and ')
		.toLowerCase()
		.trim();
}

/**
 * Is this alpha-2 code a country that currently exists?
 *
 * CLDR knows historical and deprecated regions as well as current ones, and gives
 * many of them the SAME English name as their successor: SU and RU are both
 * "Russia", DD and DE are both "Germany", ZR and CD are both "Congo - Kinshasa",
 * YU and RS are both "Serbia". SU is the Soviet Union. DD is the German Democratic
 * Republic.
 *
 * Matching Natural Earth's names against that list without filtering picked whichever
 * code happened to be enumerated last, so France resolved to FX, the United Kingdom
 * to UK, Russia to SU and Germany to DD. Nothing would have looked wrong: the globe
 * renders identically, and the error only surfaces years later as trade attributed to
 * a state that stopped existing in 1990.
 *
 * The test is CLDR's own territory-alias table, reached through locale
 * canonicalisation: a current code canonicalises to itself, a deprecated one
 * canonicalises to its replacement. No list to maintain, and it stays correct when
 * the next country changes its name.
 *
 * (This project is a history of 1956-2026, so several of these defunct states are
 * genuinely part of its subject. That is an argument for naming them deliberately
 * where they belong, never for letting one stand in for a modern country by accident.)
 */
function isCurrentCountry(code: string): boolean {
	try {
		return new Intl.Locale(`und-${code}`).region === code;
	} catch {
		return false;
	}
}

/**
 * Every current country CLDR knows, by enumerating alpha-2 space.
 *
 * There is no API that lists them — `Intl.supportedValuesOf` has no 'region' key —
 * so the 676 two-letter combinations are asked directly and `fallback: 'none'`
 * discards the ones ICU does not recognise. This is the authoritative list on the
 * machine doing the build, which is better than a copy of it checked in here and
 * left to rot.
 */
function cldrRegions(): { code: string; names: Record<string, string> }[] {
	const dn = LOCALES.map((l) => [l, new Intl.DisplayNames([l], { type: 'region', fallback: 'none' })] as const);
	const out: { code: string; names: Record<string, string> }[] = [];
	for (let a = 65; a <= 90; a++) {
		for (let b = 65; b <= 90; b++) {
			const code = String.fromCharCode(a) + String.fromCharCode(b);
			const en = dn[0][1].of(code);
			if (!en || en === code) continue;
			if (!isCurrentCountry(code)) continue;
			const names: Record<string, string> = {};
			for (const [loc, fmt] of dn) names[loc] = fmt.of(code) ?? en;
			out.push({ code, names });
		}
	}
	return out;
}

/**
 * Features carrying no Tunisian relationship at any resolution, and a great many
 * coordinates. Numeric M49 codes, matching the topology's own ids.
 */
const DROP = new Set([
	'010', // Antarctica
	'260' // French Southern and Antarctic Lands
]);

/**
 * Territories Natural Earth draws but gives no id, because they have no M49 code,
 * because their statehood is disputed.
 *
 * They were silently collapsing into one `undefined` key, which merged three
 * unrelated territories into whichever happened to be processed last and quietly
 * lost the other two. That is the precise failure this project exists to not
 * commit: a contested status resolved by accident, in a build step, with no record
 * that a choice was made.
 *
 * So each gets a stable synthetic id, deliberately prefixed `x-` so it can never be
 * mistaken for an M49 code or joined against one, and an id-less feature that is
 * not on this list fails the build rather than being keyed on `undefined`. Drawing
 * them is not a statement about their status — Natural Earth draws these boundaries
 * and this file does not adjudicate them. Nothing in `data/` may cite an `x-` id as
 * a country; they exist to be rendered, not to carry claims.
 */
const UNCODED: Record<string, string> = {
	'N. Cyprus': 'x-northern-cyprus',
	Somaliland: 'x-somaliland',
	Kosovo: 'x-kosovo'
};

/**
 * States that ended, and where to draw them.
 *
 * Tunisia traded with the Soviet Union, Czechoslovakia, East Germany and Yugoslavia
 * for three decades of the period this project covers, and Comtrade still reports
 * those flows under their own codes. A globe of modern borders cannot draw them —
 * there is no polygon for a country that no longer exists — so each borrows the
 * anchor of a successor state. That is a placement, explicitly not a claim about
 * territory or succession: the Soviet Union was not Russia, and the arc lands near
 * Moscow because that is where the reader will look for it, not because the two are
 * the same country.
 *
 * The names are authored here rather than taken from CLDR, which is the one place
 * CLDR actively misleads: it resolves `SU` to "Russia" and `DD` to "Germany" —
 * the successor's name, not the historical one — which is also why the deprecated
 * codes had to be filtered out of the gazetteer in the first place.
 *
 * Codes are ISO 3166-1 alpha-2 as Comtrade reports them.
 */
const HISTORICAL: Record<string, { anchorOf: string; names: Record<string, string> }> = {
	SU: { anchorOf: 'RU', names: { en: 'Soviet Union', fr: 'Union soviétique', ar: 'الاتحاد السوفيتي' } },
	CS: { anchorOf: 'CZ', names: { en: 'Czechoslovakia', fr: 'Tchécoslovaquie', ar: 'تشيكوسلوفاكيا' } },
	DD: { anchorOf: 'DE', names: { en: 'East Germany', fr: 'Allemagne de l’Est', ar: 'ألمانيا الشرقية' } },
	YU: { anchorOf: 'RS', names: { en: 'Yugoslavia', fr: 'Yougoslavie', ar: 'يوغوسلافيا' } },
	YD: { anchorOf: 'YE', names: { en: 'South Yemen', fr: 'Yémen du Sud', ar: 'اليمن الجنوبي' } },
	VD: { anchorOf: 'VN', names: { en: 'North Vietnam', fr: 'Viêt Nam du Nord', ar: 'فيتنام الشمالية' } },
	AN: {
		anchorOf: 'VE',
		names: { en: 'Netherlands Antilles', fr: 'Antilles néerlandaises', ar: 'جزر الأنتيل الهولندية' }
	}
};

interface Country {
	/** ISO 3166-1 alpha-2, or null for a territory with no code — see UNCODED. */
	iso2: string | null;
	/** [lon, lat] the arcs leave from and the label hangs on. */
	anchor: [number, number];
	/** Reader-facing name per locale, from CLDR. Natural Earth's English name for
	 *  uncoded territories, which CLDR by definition cannot name. */
	names: Record<string, string>;
	/** Whether the country↔code identification was derived or asserted by a human. */
	via: 'cldr-name' | 'alias' | 'uncoded' | 'point' | 'historical';
}

/**
 * Bilateral trade, stored columnar.
 *
 * `years` is the shared axis; every partner's `out` and `in` are arrays of the same
 * length, aligned to it, with `null` where the year has no observation. As an array
 * of `{partner, year, value}` objects the same data is roughly a megabyte of repeated
 * key names; this way it is a fraction of that, and slicing a year is an index rather
 * than a scan — which matters because the time cursor moves on every frame of a drag.
 *
 * Values are millions of USD, rounded to three decimals. That is a thousand-dollar
 * granularity on figures that run to billions and are revised by more than that
 * between vintages.
 */
interface Flows {
	years: number[];
	/**
	 * alpha-2 → aligned series. `out` is Tunisia exporting; `in` is Tunisia importing.
	 *
	 * `mirrorOut` and `mirrorIn` are the same two flows as the PARTNER reported them.
	 * They are kept beside Tunisia's own figures, never merged with them and never
	 * averaged: two statistical offices describing one shipment is the textbook case
	 * of the source disagreement this project records rather than resolves.
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
	/**
	 * Crude, refined product and gas, split out from the totals above.
	 *
	 * A separate map rather than four more arrays on every partner: only about a third
	 * of Tunisia's counterparties trade fuel with it at all, and giving the other two
	 * thirds six empty arrays each would cost more than the data.
	 */
	energy: Record<string, Record<string, { out: (number | null)[]; in: (number | null)[] }>>;
	/**
	 * The publisher's own world totals, aligned to the same axis.
	 *
	 * Kept deliberately OUTSIDE `partners` so they can never be joined to a country
	 * and drawn as arcs. They are larger than the sum of the partner rows — the
	 * difference is the aggregates discarded as unplaceable ("Areas, nes" and
	 * friends), and the ledger shows the two side by side rather than picking one.
	 */
	totals: {
		out: (number | null)[];
		in: (number | null)[];
		mirrorOut: (number | null)[];
		mirrorIn: (number | null)[];
	} | null;
	unit: 'USD millions';
	source: string;
	retrieved: string;
	/** False while the licence is unconfirmed — see flows/manifest.json. */
	redistributable: boolean;
}

/**
 * Tunisia's external public debt, by creditor.
 *
 * Same columnar shape and the same shared year axis as the trade flows. `stock` is a
 * level — what is owed — and the other three are movements within the year, kept
 * apart because adding a stock to a flow is meaningless.
 *
 * `institutional` holds the creditors that are not states: the World Bank, the
 * African Development Bank, the Islamic Development Bank, bondholders. They dominate
 * the modern picture and they have no place on a globe of countries, so they are
 * carried as figures rather than arcs — see the note in loadDebt.
 */
interface Debt {
	years: number[];
	/** alpha-2 → aligned series, in millions of USD. */
	creditors: Record<
		string,
		{
			stock: (number | null)[];
			disbursed: (number | null)[];
			repaid: (number | null)[];
		}
	>;
	/** Creditor name → aligned stock series, for lenders with nowhere to be drawn. */
	institutional: Record<string, (number | null)[]>;
	/**
	 * Multilateral lenders that ARE in the graph and have a seat, so can be drawn.
	 *
	 * Kept apart from `creditors` rather than folded into the host country's row: an
	 * arc to Washington carrying World Bank debt is not United States bilateral debt,
	 * and adding them would say it was.
	 */
	bodies: Record<
		string,
		{
			/** Where to draw it: the alpha-2 of the country hosting its seat. */
			seat: string;
			stock: (number | null)[];
			disbursed: (number | null)[];
			repaid: (number | null)[];
		}
	>;
	/**
	 * The publisher's own total, aligned to the same axis and kept outside
	 * `creditors` for the same reason the trade totals live outside `partners`: a
	 * total is not a counterparty, and an arc drawn from it would be a lie.
	 * `repaid` is principal + interest, matching the creditor rows.
	 */
	totals: {
		stock: (number | null)[];
		disbursed: (number | null)[];
		repaid: (number | null)[];
	} | null;
	unit: 'USD millions';
	source: string;
	retrieved: string;
}

/** Country-level context, deliberately not bilateral and never drawn as an arc. */
interface Wdi {
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
	/** TopoJSON, delta-encoded and quantised as shipped by Natural Earth. */
	topology: unknown;
	/** Topology feature id (UN M49, or an `x-` synthetic) → country. */
	countries: Record<string, Country>;
	/** alpha-2 → topology id, the direction the graph joins in. */
	byIso2: Record<string, string>;
	/** Absent when `flows/` has not been fetched; the view degrades to agreements only. */
	flows: Flows | null;
	/** Absent until `npm run fetch:debt` has been run. */
	debt: Debt | null;
	/** Absent until `npm run fetch:wdi` has been run. */
	wdi: Wdi | null;
	generated: string;
	source: string;
}

function build(): WorldBundle {
	if (!existsSync(SOURCE)) {
		throw new Error(
			`world-atlas is not installed — expected ${SOURCE}. Run \`npm install\` and try again.`
		);
	}

	const topo = JSON.parse(readFileSync(SOURCE, 'utf8')) as Topology;
	const layer = topo.objects.countries as GeometryCollection<{ name: string }>;

	const kept = layer.geometries.filter((g) => !DROP.has(String(g.id)));
	const dropped = layer.geometries.length - kept.length;
	if (dropped !== DROP.size) {
		// A silent miss here would ship the ice and nobody would notice for months.
		throw new Error(
			`expected to drop ${DROP.size} features, dropped ${dropped} — has world-atlas changed its ids?`
		);
	}

	/*
	 * The synthetic ids are stamped into the emitted topology, not just into the
	 * anchor table. The browser decodes this file and looks features up by their own
	 * id; leaving three of them undefined there would reintroduce the collision on
	 * the other side of the build, where it is harder to see.
	 */
	const identified = kept.map((g) => {
		if (g.id !== undefined && g.id !== null) return g;
		const name = (g.properties as { name: string } | undefined)?.name ?? '';
		return { ...g, id: UNCODED[name] };
	});

	const trimmed: Topology = {
		...topo,
		objects: { countries: { ...layer, geometries: identified } }
	};

	const collection = feature(trimmed, trimmed.objects.countries as GeometryCollection<{ name: string }>);

	// --- the crosswalk ------------------------------------------------------

	const gazetteer = CountriesFileSchema.parse(parse(readFileSync(COUNTRIES, 'utf8')));
	const regions = cldrRegions();
	const byCode = new Map(regions.map((r) => [r.code, r]));

	/*
	 * Built by hand rather than `new Map(pairs)` so a collision is an error instead
	 * of a silent last-wins overwrite. That overwrite is precisely how Russia once
	 * resolved to SU and Germany to DD; `isCurrentCountry` removes the cases known
	 * today, and this makes any that appear later fail out loud instead of quietly
	 * mis-identifying a country.
	 */
	const byCldrName = new Map<string, string>();
	for (const r of regions) {
		const key = normalise(r.names.en);
		const prior = byCldrName.get(key);
		if (prior) {
			throw new Error(
				`CLDR gives ${prior} and ${r.code} the same English name "${r.names.en}". ` +
					`Name matching cannot tell them apart — add the right one to \`aliases\` in ` +
					`data/countries.yaml and exclude the other.`
			);
		}
		byCldrName.set(key, r.code);
	}

	for (const [neName, code] of Object.entries(gazetteer.aliases)) {
		if (!byCode.has(code)) {
			throw new Error(
				`data/countries.yaml aliases "${neName}" to ${code}, which CLDR does not recognise as a region.`
			);
		}
	}

	const countries: Record<string, Country> = {};
	const byIso2: Record<string, string> = {};
	const aliasReport: string[] = [];

	for (const f of collection.features) {
		const name = (f.properties as { name: string } | null)?.name ?? '';
		const id = f.id === undefined || f.id === null ? UNCODED[name] : String(f.id);

		if (!id) {
			throw new Error(
				`topology feature "${name}" has no id and is not a known uncoded territory. ` +
					`Add it to UNCODED with a synthetic \`x-\` id, or to DROP — do not let it key on undefined.`
			);
		}
		if (id in countries) {
			throw new Error(`duplicate topology id ${id} (${countries[id].names.en} and ${name})`);
		}

		const anchor = anchorOf(f as Feature<Polygon | MultiPolygon>);

		// An uncoded territory is drawn but not identified. It gets no alpha-2, so
		// nothing in data/ can join to it and no flow can be attributed to it.
		if (id.startsWith('x-')) {
			countries[id] = {
				iso2: null,
				anchor,
				names: Object.fromEntries(LOCALES.map((l) => [l, name])),
				via: 'uncoded'
			};
			continue;
		}

		const alias = gazetteer.aliases[name];
		const code = alias ?? byCldrName.get(normalise(name));

		if (!code) {
			throw new Error(
				`topology feature ${id} "${name}" matches no CLDR region name.\n` +
					`  Add an entry to the \`aliases\` map in data/countries.yaml identifying which ` +
					`ISO country this is.`
			);
		}
		if (byIso2[code]) {
			const other = countries[byIso2[code]].names.en;
			throw new Error(
				`two topology features both resolve to ${code}: "${other}" and "${name}". ` +
					`One of the aliases in data/countries.yaml is wrong.`
			);
		}

		const region = byCode.get(code)!;
		countries[id] = { iso2: code, anchor, names: region.names, via: alias ? 'alias' : 'cldr-name' };
		byIso2[code] = id;

		if (alias) aliasReport.push(`    ${name.padEnd(26)} ${code}  ${region.names.en}`);
	}

	// Every alias must have been used. One that matches nothing is a typo that would
	// otherwise sit in the file looking like it was doing something.
	for (const neName of Object.keys(gazetteer.aliases)) {
		if (!collection.features.some((f) => (f.properties as { name: string } | null)?.name === neName)) {
			throw new Error(
				`data/countries.yaml aliases "${neName}", which is not a name in the topology. ` +
				`Natural Earth may have renamed it.`
			);
		}
	}

	// Point anchors are sourced overrides for real countries omitted by the
	// 1:110m topology. Register them before graph validation, not only when a
	// trade row happens to mention them: an agreement can name a small state
	// even when the current trade snapshot has no row for it.
	for (const [iso2, anchor] of Object.entries(gazetteer.points)) {
		if (!byCode.has(iso2)) {
			throw new Error(`data/countries.yaml points names unknown country code ${iso2}`);
		}
		if (byIso2[iso2]) {
			throw new Error(`data/countries.yaml points duplicates topology country ${iso2}`);
		}
		const key = `p-${iso2}`;
		countries[key] = {
			iso2,
			anchor,
			names: byCode.get(iso2)!.names,
			via: 'point'
		};
		byIso2[iso2] = key;
	}

	// --- does the graph agree? ----------------------------------------------

	verifyGraph(byIso2);

	/**
	 * Seats, read once from the dataset build-data.ts just wrote.
	 *
	 * Passed to loadDebt as a function rather than a map so it does not need to know
	 * the graph is a JSON file on disk — it asks a question and gets an answer. The
	 * parse is hoisted out of the lookup deliberately: dataset.json is 1.3MB, and
	 * re-reading it per creditor name was five full parses to answer five questions.
	 */
	const seats = new Map<string, string>();
	if (existsSync(DATASET)) {
		const ds = JSON.parse(readFileSync(DATASET, 'utf8')) as {
			institutions: { id: string; seat?: string }[];
		};
		for (const i of ds.institutions) if (i.seat) seats.set(i.id, i.seat);
	}
	const seatOf = (institutionId: string): string | null => seats.get(institutionId) ?? null;

	if (aliasReport.length) {
		console.log('\n  identifications asserted in data/countries.yaml:');
		console.log('    Natural Earth              ISO  CLDR');
		for (const line of aliasReport) console.log(line);
		console.log('');
	}

	return {
		topology: trimmed,
		countries,
		byIso2,
		flows: loadFlows(byIso2, countries, byCode),
		debt: loadDebt(byIso2, gazetteer, seatOf),
		wdi: loadWdi(),
		generated: new Date().toISOString(),
		source: 'Natural Earth 1:110m via world-atlas (public domain); names from Unicode CLDR'
	};
}

/**
 * Join the fetched trade snapshot to the gazetteer, or return null if it is absent.
 *
 * Absence is a normal state, not an error: `flows/` is gitignored pending the licence
 * question, so a fresh clone has no snapshot and must still build. The world view
 * falls back to drawing agreements alone.
 */
function loadFlows(
	byIso2: Record<string, string>,
	countries: Record<string, Country>,
	byCode: Map<string, { code: string; names: Record<string, string> }>
): Flows | null {
	const tradeFile = join(FLOWS_DIR, 'comtrade', 'tunisia-trade.json');
	const mapFile = join(FLOWS_DIR, 'comtrade', 'partners.json');
	const manifestFile = join(FLOWS_DIR, 'manifest.json');
	if (!existsSync(tradeFile) || !existsSync(mapFile) || !existsSync(manifestFile)) {
		console.log('  flows: no snapshot in flows/ — run `npm run fetch:trade` (agreements still render)');
		return null;
	}

	const trade = JSON.parse(readFileSync(tradeFile, 'utf8')) as {
		retrieved: string;
		out: Record<string, Record<string, number>>;
		in: Record<string, Record<string, number>>;
		mirrorOut?: Record<string, Record<string, number>>;
		mirrorIn?: Record<string, Record<string, number>>;
		energy?: Record<string, { out: Record<string, Record<string, number>>; in: Record<string, Record<string, number>> }>;
		totals?: {
			out?: Record<string, number>;
			in?: Record<string, number>;
			mirrorOut?: Record<string, number>;
			mirrorIn?: Record<string, number>;
		};
	};
	const cross = JSON.parse(readFileSync(mapFile, 'utf8')) as {
		partners: Record<string, { iso2?: string; name: string; expired?: string; group: boolean }>;
		points?: Record<string, [number, number]>;
	};
	const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
		datasets: { id: string; redistributable?: boolean; licence?: string }[];
	};

	const ds = manifest.datasets.find((d) => d.id === 'comtrade');
	if (!ds?.licence) {
		// The rule from the plan: a dataset with no licence recorded fails the build.
		// A licence status of "unconfirmed" is a status and passes; a missing field
		// does not, because that is how data ships without anyone having looked.
		throw new Error('flows/manifest.json records no licence for the comtrade dataset');
	}

	const years = new Set<number>();
	for (const side of [trade.out, trade.in]) {
		for (const byYear of Object.values(side)) {
			for (const y of Object.keys(byYear)) years.add(Number(y));
		}
	}
	const axis = [...years].sort((a, b) => a - b);
	const slot = new Map(axis.map((y, i) => [y, i]));

	/**
	 * The publisher's world totals, aligned to the shared axis.
	 *
	 * A snapshot fetched before totals existed has none, and that is a normal state —
	 * the strip and the ledger's totals row degrade to the sum of partner rows, which
	 * they label as such. An arc can never read these: they are not in `partners`.
	 */
	const alignTotal = (src?: Record<string, number>): (number | null)[] => {
		const row = new Array(axis.length).fill(null) as (number | null)[];
		if (!src) return row;
		for (const [y, v] of Object.entries(src)) {
			const i = slot.get(Number(y));
			if (i === undefined) continue;
			row[i] = Math.round((v / 1e6) * 1000) / 1000;
		}
		return row;
	};
	const totals: Flows['totals'] = trade.totals
		? {
				out: alignTotal(trade.totals.out),
				in: alignTotal(trade.totals.in),
				mirrorOut: alignTotal(trade.totals.mirrorOut),
				mirrorIn: alignTotal(trade.totals.mirrorIn)
			}
		: null;

	const partners: Flows['partners'] = {};

	/*
	 * Partners that resolve to no country the globe already draws, in three kinds.
	 * Collapsing them into one "unplaced" count hid the only one that mattered.
	 *
	 *   grouped    Comtrade's own aggregates — "Areas, nes", "Other Asia, nes", and
	 *              similar. Discarded: drawing one would invent a state.
	 *
	 *   small      Current countries the 1:110m topology is too coarse to draw —
	 *              Malta, Singapore, Hong Kong, Bahrain, Mauritius. Placed from the
	 *              World Bank's capital coordinates rather than lost.
	 *
	 *   historical States that ended: the USSR, Czechoslovakia, East Germany,
	 *              Yugoslavia, both Yemens, both Vietnams. A modern globe has nowhere
	 *              to put them, so each borrows its successor's anchor and says so.
	 *              This project is a history of 1956-2026; that trade is the subject,
	 *              not noise, and dropping it silently would be the worse error.
	 *
	 * MULTIPLE CODES PER COUNTRY IS NORMAL AND MUST SUM. Belgium and
	 * Belgium-Luxembourg, Germany and the Federal Republic, the USA with and without
	 * Puerto Rico are each one place recorded under two codes in different periods.
	 * They land in the same row and are added, never overwritten — the time axis is
	 * what separates them.
	 */
	const grouped = new Set<string>();
	const placedSmall = new Set<string>();
	const placedHistorical = new Set<string>();
	const unplaced = new Map<string, number>();

	const peakOf = (byYear: Record<string, number>) => Math.max(0, ...Object.values(byYear));

	/** Register a country the topology has no polygon for, under a synthetic key. */
	const register = (prefix: string, iso2: string, anchor: [number, number], names: Record<string, string>) => {
		const key = `${prefix}-${iso2}`;
		countries[key] = { iso2, anchor, names, via: prefix === 'p' ? 'point' : 'historical' };
		byIso2[iso2] = key;
	};

	/**
	 * One Comtrade partner code → the alpha-2 the globe can draw it at, or null.
	 *
	 * Factored out because the totals, the mirror and the energy breakdown all arrive
	 * keyed by the same codes and all need the same resolution — including France
	 * being 251, and the multi-code countries summing into one row. A second copy of
	 * this logic for the fuels would be a second place for that to go wrong.
	 *
	 * Registers small and historical states as a side effect, and records anything it
	 * cannot place. `peak` is only used for the report, so it is optional.
	 */
	const resolvePartner = (code: string, byYear?: Record<string, number>): string | null => {
		const meta = cross.partners[code];
		if (!meta || meta.group) {
			grouped.add(code);
			return null;
		}

		const iso2 = meta.iso2;
		if (!iso2) {
			/*
			 * No ISO code means no country: "Areas, nes" (not elsewhere specified),
			 * "Bunkers" (fuel loaded onto ships and aircraft), "Free Zones", "Other
			 * Asia, nes". Comtrade marks none of these `isGroup`, so the flag alone
			 * misses them — the absence of a country code is the real signal, and
			 * "Areas, nes" carries $1.24bn, which is exactly the size of thing that
			 * should not quietly become a dot somewhere.
			 */
			grouped.add(code);
			return null;
		}

		if (!byIso2[iso2]) {
			const hist = HISTORICAL[iso2];
			const successorKey = hist ? byIso2[hist.anchorOf] : undefined;

			if (hist && successorKey) {
				if (!placedHistorical.has(iso2)) {
					placedHistorical.add(iso2);
					// Anchored on the successor state's centroid. Not a claim about
					// territory — a defunct state cannot be drawn on modern borders —
					// but a place to put an arc so the flow is visible at all.
					register('h', iso2, countries[successorKey].anchor, hist.names);
				}
			} else if (cross.points?.[iso2]) {
				if (!placedSmall.has(iso2)) {
					placedSmall.add(iso2);
					register('p', iso2, cross.points[iso2], byCode.get(iso2)?.names ?? { en: iso2, fr: iso2, ar: iso2 });
				}
			} else {
				if (byYear) unplaced.set(code, Math.max(unplaced.get(code) ?? 0, peakOf(byYear)));
				return null;
			}
		}
		return iso2;
	};

	const put = (side: 'out' | 'in' | 'mirrorOut' | 'mirrorIn', src: Record<string, Record<string, number>>) => {
		for (const [code, byYear] of Object.entries(src)) {
			const iso2 = resolvePartner(code, byYear);
			if (!iso2) continue;

			const row = (partners[iso2] ??= {
				out: new Array(axis.length).fill(null),
				in: new Array(axis.length).fill(null),
				mirrorOut: new Array(axis.length).fill(null),
				mirrorIn: new Array(axis.length).fill(null)
			});
			for (const [y, v] of Object.entries(byYear)) {
				const i = slot.get(Number(y));
				if (i === undefined) continue;
				const millions = Math.round((v / 1e6) * 1000) / 1000;
				// Summed, not assigned — see the note above about one country, two codes.
				row[side][i] = (row[side][i] ?? 0) + millions;
			}
		}
	};
	put('out', trade.out);
	put('in', trade.in);
	// The partner's own account of the same two flows. Same rows, different books.
	put('mirrorOut', trade.mirrorOut ?? {});
	put('mirrorIn', trade.mirrorIn ?? {});

	/*
	 * Energy, resolved through exactly the same partner join as the totals — the codes
	 * are Comtrade's, so France is 251 here too and the multi-code countries still have
	 * to sum. Reusing `resolvePartner` rather than repeating the lookup is the whole
	 * reason that was factored out.
	 */
	const energy: Flows['energy'] = {};
	for (const [fuel, sides] of Object.entries(trade.energy ?? {})) {
		const rows: Record<string, { out: (number | null)[]; in: (number | null)[] }> = {};
		for (const side of ['out', 'in'] as const) {
			for (const [code, byYear] of Object.entries(sides[side] ?? {})) {
				const iso2 = resolvePartner(code);
				if (!iso2) continue;
				const row = (rows[iso2] ??= {
					out: new Array(axis.length).fill(null),
					in: new Array(axis.length).fill(null)
				});
				for (const [y, v] of Object.entries(byYear)) {
					const i = slot.get(Number(y));
					if (i === undefined) continue;
					row[side][i] = (row[side][i] ?? 0) + Math.round((v / 1e6) * 1000) / 1000;
				}
			}
		}
		if (Object.keys(rows).length) energy[fuel] = rows;
	}

	console.log(
		`  flows: ${Object.keys(partners).length} partners, ${axis[0]}–${axis.at(-1)}, licence ${ds.licence}`
	);
	console.log(
		`         ${grouped.size} aggregates discarded · ${placedSmall.size} small states from World Bank points · ` +
			`${placedHistorical.size} former states on successor anchors`
	);

	const lost = [...unplaced.entries()].sort((a, b) => b[1] - a[1]).filter(([, p]) => p > 5e7);
	if (lost.length) {
		console.log(`         ${unplaced.size} partners still unplaced. Largest by peak annual trade:`);
		for (const [code, peak] of lost.slice(0, 8)) {
			console.log(`           ${(cross.partners[code]?.name ?? code).padEnd(34)} ${(peak / 1e9).toFixed(2)}bn USD`);
		}
	}

	return {
		years: axis,
		partners,
		energy,
		totals,
		unit: 'USD millions',
		source: 'UN Comtrade — Tunisia bilateral goods trade',
		retrieved: trade.retrieved,
		redistributable: ds.redistributable === true
	};
}

/**
 * Join the debt snapshot to the gazetteer, or return null if it is absent.
 *
 * WHY THE MULTILATERALS ARE NOT ARCS
 *
 * The dominant creditors in Tunisia's modern debt are not countries: the World Bank
 * at 4.3bn dollars, bondholders at 3.9bn, the African Development Bank at 2.6bn,
 * against roughly 1.1bn each for Germany and France. Drawing only the bilateral
 * arcs would therefore show the small half of the picture and imply it was the
 * whole one.
 *
 * They are not drawn anyway, and they are not dropped either — they are carried as
 * `institutional`, a named list of figures the view can show beside the globe. An
 * international organisation has no centroid; giving one an arc means giving it a
 * seat, which is a real and citable fact (Washington, Abidjan, Luxembourg) but a
 * sourced field per institution and a separate piece of work. Until then the honest
 * rendering is the one that says "here is what is not on the map".
 *
 * "Bondholders" would still not get an arc even then. A bond market is not a place.
 */
function loadDebt(
	byIso2: Record<string, string>,
	gazetteer: {
		creditor_aliases: Record<string, string>;
		creditor_institutions: Record<string, string>;
		creditor_not_places: string[];
	},
	/** institution id → the alpha-2 of its seat, or null if it has none recorded. */
	seatOf: (institutionId: string) => string | null
): Debt | null {
	const file = join(FLOWS_DIR, 'worldbank', 'tunisia-debt.json');
	if (!existsSync(file)) {
		console.log('  debt:  no snapshot in flows/worldbank/ — run `npm run fetch:debt`');
		return null;
	}

	const raw = JSON.parse(readFileSync(file, 'utf8')) as {
		retrieved: string;
		stock: Record<string, Record<string, number>>;
		disbursed: Record<string, Record<string, number>>;
		principal: Record<string, Record<string, number>>;
		interest: Record<string, Record<string, number>>;
		totals?: {
			stock?: Record<string, number>;
			disbursed?: Record<string, number>;
			principal?: Record<string, number>;
			interest?: Record<string, number>;
		};
	};

	const years = new Set<number>();
	for (const side of [raw.stock, raw.disbursed, raw.principal, raw.interest]) {
		for (const byYear of Object.values(side)) for (const y of Object.keys(byYear)) years.add(Number(y));
	}
	const axis = [...years].sort((a, b) => a - b);
	const slot = new Map(axis.map((y, i) => [y, i]));
	const blank = () => new Array(axis.length).fill(null) as (number | null)[];

	const notPlaces = new Set(gazetteer.creditor_not_places);
	const byName = new Map<string, string>();
	for (const [id, c] of Object.entries(countriesByName(byIso2))) byName.set(id, c);

	/**
	 * The publisher's total, aligned to the same axis as the creditors. `repaid`
	 * sums principal and interest exactly as the creditor rows do, and the series is
	 * kept OUTSIDE `creditors` so no arc can ever be drawn from it.
	 */
	const alignTotal = (src?: Record<string, number>): (number | null)[] => {
		const row = new Array(axis.length).fill(null) as (number | null)[];
		if (!src) return row;
		for (const [y, v] of Object.entries(src)) {
			const i = slot.get(Number(y));
			if (i !== undefined) row[i] = Math.round((v / 1e6) * 1000) / 1000;
		}
		return row;
	};
	const alignService = (principal?: Record<string, number>, interest?: Record<string, number>): (number | null)[] => {
		const years = new Set([...Object.keys(principal ?? {}), ...Object.keys(interest ?? {})]);
		if (!years.size) return new Array(axis.length).fill(null) as (number | null)[];
		const row = new Array(axis.length).fill(null) as (number | null)[];
		for (const y of years) {
			const i = slot.get(Number(y));
			if (i === undefined) continue;
			row[i] =
				Math.round((((principal?.[y] ?? 0) + (interest?.[y] ?? 0)) / 1e6) * 1000) / 1000;
		}
		return row;
	};
	const totals: Debt['totals'] = raw.totals
		? {
				stock: alignTotal(raw.totals.stock),
				disbursed: alignTotal(raw.totals.disbursed),
				repaid: alignService(raw.totals.principal, raw.totals.interest)
			}
		: null;

	const creditors: Debt['creditors'] = {};
	const institutional: Debt['institutional'] = {};
	const bodies: Debt['bodies'] = {};
	let bilateral = 0;

	const resolve = (name: string): string | null =>
		gazetteer.creditor_aliases[name] ?? byName.get(normalise(name)) ?? null;

	const add = (
		field: 'stock' | 'disbursed' | 'repaid',
		src: Record<string, Record<string, number>>
	) => {
		for (const [name, byYear] of Object.entries(src)) {
			if (notPlaces.has(name)) {
				if (field === 'stock') stash(institutional, name, byYear, slot, axis);
				continue;
			}

			/*
			 * A multilateral lender the graph knows, placed at its seat. Two World Bank
			 * windows (IBRD and IDA) map to one record and are summed here.
			 */
			const instId = gazetteer.creditor_institutions[name];
			if (instId) {
				const seat = seatOf(instId);
				if (seat && byIso2[seat]) {
					const row = (bodies[instId] ??= {
						seat,
						stock: blank(),
						disbursed: blank(),
						repaid: blank()
					});
					for (const [y, v] of Object.entries(byYear)) {
						const i = slot.get(Number(y));
						if (i === undefined) continue;
						row[field][i] = (row[field][i] ?? 0) + Math.round((v / 1e6) * 1000) / 1000;
					}
					continue;
				}
			}

			const iso2 = resolve(name);
			if (!iso2 || !byIso2[iso2]) {
				// Not a country and not a seated body: carried as a figure, never dropped.
				if (field === 'stock') stash(institutional, name, byYear, slot, axis);
				continue;
			}
			const row = (creditors[iso2] ??= { stock: blank(), disbursed: blank(), repaid: blank() });
			for (const [y, v] of Object.entries(byYear)) {
				const i = slot.get(Number(y));
				if (i === undefined) continue;
				const millions = Math.round((v / 1e6) * 1000) / 1000;
				// Summed: `repaid` receives both principal and interest, and several
				// World Bank names can resolve to one country across time.
				row[field][i] = (row[field][i] ?? 0) + millions;
			}
		}
	};

	add('stock', raw.stock);
	add('disbursed', raw.disbursed);
	add('repaid', raw.principal);
	add('repaid', raw.interest);
	bilateral = Object.keys(creditors).length;

	console.log(
		`  debt:  ${bilateral} bilateral creditors, ${Object.keys(bodies).length} seated bodies, ` +
			`${Object.keys(institutional).length} unplaceable, ${axis[0]}–${axis.at(-1)}`
	);

	return {
		years: axis,
		creditors,
		institutional,
		bodies,
		totals,
		unit: 'USD millions',
		source: 'World Bank International Debt Statistics',
		retrieved: raw.retrieved
	};
}

/**
 * Join the country-level WDI snapshot. These figures provide context for the
 * bilateral ledger but deliberately have no partner dimension and no place on
 * the globe. A missing snapshot is normal: the world view still builds with
 * trade, debt and agreements.
 */
function loadWdi(): Wdi | null {
	if (!existsSync(WDI_FILE)) {
		console.log('  wdi:    no snapshot in flows/worldbank/ — run `npm run fetch:wdi`');
		return null;
	}
	const manifestFile = join(FLOWS_DIR, 'manifest.json');
	if (!existsSync(manifestFile)) throw new Error('flows/manifest.json is missing while the WDI snapshot exists');
	const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
		datasets?: { id: string; licence?: string; redistributable?: boolean }[];
	};
	const entry = manifest.datasets?.find((d) => d.id === 'wdi');
	if (!entry?.licence) throw new Error('flows/manifest.json records no licence for the wdi dataset');

	const raw = JSON.parse(readFileSync(WDI_FILE, 'utf8')) as {
		retrieved: string;
		series: {
			reserves?: Record<string, number>;
			gdp?: Record<string, number>;
			currentAccount?: Record<string, number>;
			cpi?: Record<string, number>;
		};
	};
	const years = new Set<number>();
	for (const byYear of Object.values(raw.series)) {
		for (const y of Object.keys(byYear ?? {})) years.add(Number(y));
	}
	const axis = [...years].filter(Number.isFinite).sort((a, b) => a - b);
	const slot = new Map(axis.map((y, i) => [y, i]));
	const align = (src?: Record<string, number>): (number | null)[] => {
		const row = new Array(axis.length).fill(null) as (number | null)[];
		for (const [y, value] of Object.entries(src ?? {})) {
			const i = slot.get(Number(y));
			if (i !== undefined) row[i] = value;
		}
		return row;
	};

	console.log(`  wdi:    ${axis[0]}–${axis.at(-1)} (${axis.length} years)`);
	return {
		years: axis,
		reserves: align(raw.series.reserves),
		gdp: align(raw.series.gdp),
		currentAccount: align(raw.series.currentAccount),
		cpi: align(raw.series.cpi),
		remittancesReceived: align(raw.series.remittancesReceived),
		remittancesPaid: align(raw.series.remittancesPaid),
		unit: 'current USD except CPI',
		source: 'World Bank World Development Indicators',
		retrieved: raw.retrieved
	};
}

/** alpha-2 keyed by normalised English name, for matching creditor names. */
function countriesByName(byIso2: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const iso2 of Object.keys(byIso2)) {
		const region = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(iso2);
		if (region && region !== iso2) out[normalise(region)] = iso2;
	}
	return out;
}

function stash(
	into: Record<string, (number | null)[]>,
	name: string,
	byYear: Record<string, number>,
	slot: Map<number, number>,
	axis: number[]
) {
	const row = (into[name] ??= new Array(axis.length).fill(null));
	for (const [y, v] of Object.entries(byYear)) {
		const i = slot.get(Number(y));
		if (i === undefined) continue;
		row[i] = Math.round((v / 1e6) * 1000) / 1000;
	}
}

/**
 * Every `iso2` in the knowledge graph must land on a country the globe can draw.
 *
 * Without this the failure mode is silence: a typo'd or unrenderable code simply
 * never appears on the map, and the institution looks like it has no external
 * relationships rather than like it has a broken join.
 */
function verifyGraph(byIso2: Record<string, string>) {
	if (!existsSync(DATASET)) return; // build-data has not run yet; `npm run data` chains them
	const ds = JSON.parse(readFileSync(DATASET, 'utf8')) as {
		institutions: { id: string; type: string; iso2?: string; seat?: string }[];
		agreements?: { id: string; parties: string[] }[];
	};

	const seated = ds.institutions.filter((i) => (i as { seat?: string }).seat);
	const seatless = seated.filter((i) => !byIso2[(i as { seat?: string }).seat!]);
	if (seatless.length) {
		throw new Error(
			`these institutions name a seat the globe cannot place:\n` +
				seatless.map((i) => `    ${i.id} → ${(i as { seat?: string }).seat}`).join('\n')
		);
	}

	const linked = ds.institutions.filter((i) => i.iso2);
	const broken = linked.filter((i) => !byIso2[i.iso2!]);
	if (broken.length) {
		throw new Error(
			`these institutions carry an iso2 the globe cannot place:\n` +
				broken.map((i) => `    ${i.id} → ${i.iso2}`).join('\n') +
				`\n  Either the code is wrong, or the country is absent from the 1:110m topology ` +
				`and needs an entry in the \`points\` map of data/countries.yaml.`
		);
	}

	/*
	 * The other half of the check build-data.ts deliberately could not make: it
	 * verified that every non-alpha-2 party is a known institution, and left the
	 * country codes to this file, which is the only one holding the gazetteer.
	 *
	 * Without it a mistyped party code produces no error and no arc — the agreement
	 * simply looks like it has one fewer signatory, which is the kind of wrong that
	 * survives review because nothing about it looks broken.
	 */
	const badParties: string[] = [];
	let arcs = 0;
	for (const ag of ds.agreements ?? []) {
		for (const p of ag.parties) {
			if (!/^[A-Z]{2}$/.test(p)) {
				// A body rather than a state. It draws an arc once it has a seat, and
				// simply does not until then — an unseated institution is a gap, not an
				// error, because the seat has to be sourced before it can be asserted.
				const inst = ds.institutions.find((i) => i.id === p);
				if (inst?.seat && byIso2[inst.seat]) arcs++;
				continue;
			}
			if (byIso2[p]) arcs++;
			else badParties.push(`    ${ag.id} → ${p}`);
		}
	}
	if (badParties.length) {
		throw new Error(
			`these agreement parties are not countries the globe can place:\n` +
				badParties.join('\n') +
				`\n  Check the alpha-2 code, or add the country to the \`points\` map of ` +
				`data/countries.yaml if the 1:110m topology does not draw it.`
		);
	}

	console.log(
		`  ${linked.length} states and ${seated.length} seated bodies placed, ${arcs} agreement arcs resolved`
	);
}

/** The centroid of the country's largest landmass. See the header for why. */
function anchorOf(f: Feature<Polygon | MultiPolygon>): [number, number] {
	if (f.geometry.type === 'Polygon') {
		return round(geoCentroid(f));
	}

	let best: Position[][] | null = null;
	let bestArea = -1;
	for (const rings of f.geometry.coordinates) {
		const part: Feature<Polygon> = {
			type: 'Feature',
			properties: null,
			geometry: { type: 'Polygon', coordinates: rings }
		};
		const area = geoArea(part);
		if (area > bestArea) {
			bestArea = area;
			best = rings;
		}
	}

	if (!best) return round(geoCentroid(f));
	return round(
		geoCentroid({ type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: best } })
	);
}

/** Four decimals is ~11m at the equator, far finer than a country anchor needs. */
function round(p: [number, number]): [number, number] {
	return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
}

const bundle = build();

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

/*
 * The geometry separately, fetched at runtime by the world view instead of
 * riding in the shared bundle.
 *
 * WHY: EntityPanel (the Inspector, on every route) imports the world DATA
 * (flows, debt, country lookup) but never reads the topology. Before this
 * split, the 100KB topology sat in the shared chunk that every page
 * transfers. The map view already follows the R14 pattern — heavy geometry is
 * fetched at runtime, never bundled — and this is the same rule applied to
 * the globe: the data the Inspector needs stays in the bundle, the geometry
 * only the globe draws moves to /world-topo.json and loads on /world.
 *
 * world.json therefore ships WITHOUT the topology (the data-only face
 * countries.ts imports), and the geometry is a separate static file the
 * globe fetches after mount, degrading to a loading state until it arrives.
 */
const STATIC_DIR = join(ROOT, 'static');
if (!existsSync(STATIC_DIR)) mkdirSync(STATIC_DIR, { recursive: true });

const { topology, ...dataOnly } = bundle;
const out = join(OUT_DIR, 'world.json');
writeFileSync(out, JSON.stringify(dataOnly), 'utf8');
writeFileSync(join(STATIC_DIR, 'world-topo.json'), JSON.stringify(topology), 'utf8');

const kb = (JSON.stringify(bundle).length / 1024).toFixed(0);
const coded = Object.values(bundle.countries).filter((c) => c.iso2).length;
const uncoded = Object.keys(bundle.countries).length - coded;
console.log(
	`world.json  ${coded} countries + ${uncoded} uncoded territories, ${kb}KB total  →  ${Math.round(
		(JSON.stringify(dataOnly).length / 1024).toFixed(0)
	)}KB data (bundled) + ${Math.round((JSON.stringify(topology).length / 1024).toFixed(0))}KB topology (fetched)`
);
