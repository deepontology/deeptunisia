/**
 * State revenue of the adopted budgets, read from the committed revenue file.
 *
 * Every figure comes from Article premier and Article 2 of the year's finance law,
 * with the printed JORT page and a kept full-page crop. Two ratios are defined here,
 * once, and printed in words beside them on the page:
 *
 *   taxPer100Raised  = tax / (tax + non-tax receipts). The denominator is what the
 *                      state raises itself: grants and borrowing are excluded.
 *   coveredByTax     = tax / the payment credits of the same law.
 *
 * Both are rounded to one decimal of a percent, so the page never prints float dust.
 */
import { parse } from 'yaml';
import revenueRaw from '../../../data/studies/dt-research-003/revenue-lf-2020-2026.yaml?raw';

export interface RevenueYear {
	year: number;
	document: string;
	source: string;
	url: string;
	page: number;
	crop: string;
	tableau_a_page: number;
	tableau_a_crop: string;
	spending_md: number;
	revenue_md: number;
	tax_md: number;
	non_tax_md: number;
	grants_md: number;
	deficit_md: number;
	/** tax + non-tax: what the state raises itself. */
	own_md: number;
	/** Tax in every 100 dinars the state raises itself, one decimal. */
	tax_per_100: number;
	/** Share of the law's spending covered by tax, in per cent, one decimal. */
	covered_pct: number;
}

const doc = parse(revenueRaw) as { years: Record<string, Omit<RevenueYear, 'year' | 'own_md' | 'tax_per_100' | 'covered_pct'>> };

const tenth = (n: number) => Math.round(n * 10) / 10;

export const REVENUE: RevenueYear[] = Object.entries(doc.years)
	.map(([year, y]) => {
		const own = y.tax_md + y.non_tax_md;
		return {
			...y,
			year: Number(year),
			own_md: own,
			tax_per_100: tenth((y.tax_md / own) * 100),
			covered_pct: tenth((y.tax_md / y.spending_md) * 100)
		};
	})
	.sort((a, b) => a.year - b.year);

export function revenueFor(year: number | null | undefined): RevenueYear | null {
	if (year === null || year === undefined) return null;
	return REVENUE.find((r) => r.year === year) ?? null;
}
