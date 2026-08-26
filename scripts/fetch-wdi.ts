/**
 * Fetches Tunisia's country-level World Development Indicators for the World
 * view's national context strip.
 *
 * These are measurements, not authored claims, so they live beside the trade
 * and debt snapshots in flows/. World Bank Open Data is CC-BY 4.0 and can be
 * republished with attribution; the manifest records that decision.
 *
 * This answers a deliberately bounded version of "how much does the country
 * have?": gross international reserves (including gold), GDP as a scale
 * reference, current-account balance, and CPI for a future real-terms toggle.
 * It does NOT turn reserves into wealth or domestic debt into external debt.
 * Those boundaries are explained in the UI and in world-claims.yaml.
 *
 * Usage: npx tsx scripts/fetch-wdi.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FLOWS = join(ROOT, 'flows');
const OUT_DIR = join(FLOWS, 'worldbank');
const MANIFEST = join(FLOWS, 'manifest.json');

const USER_AGENT =
	'DeepTunisiaTradeBot/1.0 (+https://deeptunisia.org; country indicators archive; contact via https://github.com/deeptunisia)';
const COUNTRY = 'TUN';
const API = 'https://api.worldbank.org/v2/country/TUN/indicator';

const INDICATORS = {
	reserves: 'FI.RES.TOTL.CD',
	gdp: 'NY.GDP.MKTP.CD',
	currentAccount: 'BN.CAB.XOKA.CD',
	cpi: 'FP.CPI.TOTL',
	remittancesReceived: 'BX.TRF.PWKR.CD.DT',
	remittancesPaid: 'BM.TRF.PWKR.CD.DT'
} as const;

type Series = Record<string, number>;

async function get(url: string): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 90_000);
	try {
		const response = await fetch(url, {
			headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
		return response.json();
	} finally {
		clearTimeout(timer);
	}
}

function decode(raw: unknown, label: string): Series {
	const payload = raw as [unknown, { date: string; value: number | null }[]?];
	const rows = payload?.[1];
	if (!rows) throw new Error(`${label}: World Bank response carried no rows`);
	const out: Series = {};
	for (const row of rows) {
		const year = Number(row.date);
		if (!Number.isInteger(year) || row.value === null || !Number.isFinite(row.value)) continue;
		out[String(year)] = row.value;
	}
	return out;
}

async function main() {
	console.log('  World Bank WDI — Tunisia national context\n');
	const series: Record<string, Series> = {};
	for (const [name, indicator] of Object.entries(INDICATORS)) {
		const url = `${API}/${indicator}?format=json&per_page=200`;
		series[name] = decode(await get(url), `${name} (${indicator})`);
		console.log(`  ${name.padEnd(16)} ${Object.keys(series[name]).length} observations`);
	}

	const recentGdp = Object.entries(series.gdp)
		.filter(([year]) => Number(year) >= 2015)
		.map(([, value]) => value);
	if (!recentGdp.length) throw new Error('scale check: no recent GDP observation');
	const peakGdp = Math.max(...recentGdp);
	if (peakGdp < 1e10 || peakGdp > 1e12) {
		throw new Error(`scale check: recent GDP ${peakGdp.toExponential(2)} is not tens of billions USD`);
	}
	console.log(`  scale check     recent GDP ${(peakGdp / 1e9).toFixed(2)}bn USD  ok`);

	const retrieved = new Date().toISOString();
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(
		join(OUT_DIR, 'tunisia-wdi.json'),
		JSON.stringify({ retrieved, country: COUNTRY, indicators: INDICATORS, series }),
		'utf8'
	);

	const manifest = existsSync(MANIFEST)
		? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { generated?: string; datasets?: Record<string, unknown>[] })
		: { datasets: [] };
	const datasets = (manifest.datasets ?? []).filter((d) => d.id !== 'wdi');
	datasets.push({
		id: 'wdi',
		title: 'World Bank World Development Indicators — Tunisia national context',
		publisher: 'World Bank',
		url: 'https://data.worldbank.org/country/tunisia',
		api: API,
		retrieved,
		coverage: { series: Object.keys(INDICATORS), observations: Object.values(series).reduce((n, s) => n + Object.keys(s).length, 0) },
		licence: 'CC-BY-4.0',
		licence_url: 'https://datacatalog.worldbank.org/public-licenses',
		redistributable: true,
		attribution: 'World Bank Open Data'
	});
	writeFileSync(
		MANIFEST,
		JSON.stringify({ ...manifest, generated: retrieved, datasets }, null, 1),
		'utf8'
	);

	console.log(`\n  → flows/worldbank/tunisia-wdi.json`);
}

main().catch((error) => {
	console.error(`\n  fetch-wdi failed: ${(error as Error).message}`);
	process.exit(1);
});
