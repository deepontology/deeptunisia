<script lang="ts">
	/**
	 * The totals strip — "how much the country owes, and how much it moves".
	 *
	 * Five figures for the cursor year, each with its own explainer: external
	 * public debt (a stock), debt service paid (a flow), exports, imports and
	 * the derived balance. Reserves join once WDI lands (W3); the strip's
	 * structure does not change when it does.
	 *
	 * WHY THE STRIP IS A DEFINITION LIST AND DISCLOSURES
	 *
	 * A strip of numbers is a chart in the DESIGN.md sense — it needs its table
	 * alternative, and here the table IS the strip: every figure is a labelled
	 * `dt`/`dd` pair and every explainer is a `<details>`, which is real,
	 * keyboard-reachable markup rather than a hover-only popover. A reader on a
	 * phone gets the same explanation a reader on a desktop gets.
	 *
	 * WHY TOTALS CAN FALL BACK TO SUM-OF-PARTS
	 *
	 * The publisher's own aggregate (flows.totals / debt.totals) is the honest
	 * total: the sum of partner rows is smaller by exactly the aggregates the
	 * build discards ("Areas, nes" and friends). When the snapshot predates the
	 * totals series — or a fresh clone has no snapshot at all — the strip shows
	 * the sum of the rows it can see and SAYS SO via the `sumof` mark. A total
	 * that silently changes meaning with the data underneath it is the one
	 * thing this strip must never do.
	 */
	import { t, tf } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import {
		flows,
		debt,
		tradeTotalsIn,
		debtTotalsIn,
		wdiIn,
		tradeIn,
		debtIn
	} from '$lib/world/countries';
	import { moneyM } from '$lib/world/format';
	import Content from '$lib/ui/Content.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Popover from '$lib/ui/Popover.svelte';

	const year = $derived(new Date(app.t).getUTCFullYear());

	const tt = $derived(tradeTotalsIn(year));
	const dt = $derived(debtTotalsIn(year));
	const wi = $derived(wdiIn(year));

	/** Sum of the partner rows shown, used only when the official total is absent. */
	const sumTrade = $derived.by(() => {
		const rows = tradeIn(year);
		let out = 0;
		let inn = 0;
		for (const r of rows) {
			if (r.out !== null) out += r.out;
			if (r.in !== null) inn += r.in;
		}
		return { out, in: inn, balance: out - inn };
	});
	const sumDebt = $derived.by(() => {
		const rows = debtIn(year);
		let stock = 0;
		let repaid = 0;
		for (const r of rows) {
			if (r.stock !== null) stock += r.stock;
			if (r.repaid !== null) repaid += r.repaid;
		}
		return { stock, repaid };
	});

	interface Figure {
		key: string;
		label: string;
		/** The value, already computed. */
		value: number | null;
		/** Present when the value is a sum of rows rather than the publisher's total. */
		sumof?: boolean;
		/** Which explainer section opens. */
		explain: string;
		/** Secondary line under the value. */
		sub?: string;
	}

	let openExplain = $state<string | null>(null);

const figures = $derived.by<Figure[]>(() => {
		const tOfficial = tt;
		const dOfficial = dt;
		const tSum = tOfficial ? null : sumTrade;
		const dSum = dOfficial ? null : sumDebt;

		return [
			{
				key: 'reserves',
				label: t('world.strip.reserves'),
				value: wi?.reserves === null || wi?.reserves === undefined ? null : wi.reserves / 1e6,
				explain: 'explain-totals',
					sub: wi ? tf('world.strip.observation', { label: t('world.dossier.wdi'), year: wi.year }) : undefined
			},
			{
				key: 'remittances-received',
				label: t('world.strip.remittancesReceived'),
				value: wi?.remittancesReceived === null || wi?.remittancesReceived === undefined ? null : wi.remittancesReceived / 1e6,
				explain: 'explain-totals',
				sub: wi ? tf('world.strip.observation', { label: t('world.dossier.wdi'), year: wi.year }) : undefined
			},
			{
				key: 'remittances-paid',
				label: t('world.strip.remittancesPaid'),
				value: wi?.remittancesPaid === null || wi?.remittancesPaid === undefined ? null : wi.remittancesPaid / 1e6,
				explain: 'explain-totals',
				sub: wi ? tf('world.strip.observation', { label: t('world.dossier.wdi'), year: wi.year }) : undefined
			},
			{
				key: 'debt',
				label: t('world.strip.debt'),
				value: dOfficial ? dOfficial.stock : (dSum ? dSum.stock : null),
				sumof: !dOfficial,
				explain: 'explain-debt'
			},
			{
				key: 'service',
				label: t('world.strip.service'),
				value: dOfficial ? dOfficial.repaid : (dSum ? dSum.repaid : null),
				sumof: !dOfficial,
				explain: 'explain-debt'
			},
			{
				key: 'exports',
				label: t('world.exports'),
				value: tOfficial ? tOfficial.out : (tSum ? tSum.out : null),
				sumof: !tOfficial,
				explain: 'explain-trade',
				sub:
					tOfficial && tOfficial.mirrorOut !== null
						? tf('world.strip.mirror', { value: moneyM(tOfficial.mirrorOut, app.locale) })
						: undefined
			},
			{
				key: 'imports',
				label: t('world.imports'),
				value: tOfficial ? tOfficial.in : (tSum ? tSum.in : null),
				sumof: !tOfficial,
				explain: 'explain-trade',
				sub:
					tOfficial && tOfficial.mirrorIn !== null
						? tf('world.strip.mirror', { value: moneyM(tOfficial.mirrorIn, app.locale) })
						: undefined
			},
			{
				key: 'balance',
				label: t('world.ledger.col.balance'),
				value: tOfficial ? tOfficial.balance : (tSum ? tSum.balance : null),
				sumof: !tOfficial,
				explain: 'explain-totals'
			}
		];
	});
</script>

<div class="totals" aria-label={t('world.strip.title')}>
	<div class="year mono" aria-hidden="true">{year}</div>
	<dl class="grid">
		{#each figures as f (f.key)}
			<div class="fig">
				<dt>
					{f.label}
					{#if f.sumof}
						<Tooltip content={t('world.strip.sumof')}><span class="mark mono" aria-label={t('world.strip.sumof')}>Σ</span></Tooltip>
					{/if}
				</dt>
				<dd class="mono">
					{moneyM(f.value, app.locale)}
					<span class="unit">{f.value !== null ? t('world.usd') : ''}</span>
				</dd>
				{#if f.sub}<dd class="sub">{f.sub}</dd>{/if}
				<div class="why">
					<button class="why-btn" onclick={() => (openExplain = openExplain === f.key ? null : f.key)} aria-expanded={openExplain === f.key} aria-controls={"explain-" + f.key}>
						{t('world.strip.explain')}
					</button>
					<Popover open={openExplain === f.key} onclose={() => (openExplain = null)} align="start" label={f.label}>
						<div id={"explain-" + f.key} class="why-pop">
							<Content view="world" section={f.explain} compact />
						</div>
					</Popover>
				</div>
			</div>
		{/each}
	</dl>
</div>

<style>
	.totals {
		display: flex;
		align-items: flex-start;
		gap: var(--s-4);
		padding: var(--s-4) var(--s-5);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--surface-base);
	}
	.year {
		font-size: var(--t-sm);
		color: var(--text-faint);
		padding-top: var(--s-1);
		flex: none;
	}
	.grid {
		display: flex;
		gap: var(--s-3);
		flex: 1;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
		scrollbar-color: var(--border-default) transparent;
		/* Trailing fade advertises that the strip scrolls; clipped without it at 1280px. */
		mask-image: linear-gradient(to right, black calc(100% - 28px), transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 28px), transparent 100%);
	}
	.fig {
		position: relative;
		flex: 1 0 160px;
		min-width: 160px;
		scroll-snap-align: start;
		padding: var(--s-2) var(--s-3);
		border-inline-start: 1px solid var(--border-subtle);
	}
	:global([dir='rtl']) .grid {
		mask-image: linear-gradient(to left, black calc(100% - 28px), transparent 100%);
		-webkit-mask-image: linear-gradient(to left, black calc(100% - 28px), transparent 100%);
	}
	@media (max-width: 900px) {
		.fig {
			flex: 0 0 160px;
			min-width: 160px;
		}
	}
	.fig dt {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.fig dd {
		font-size: var(--t-lg);
		font-weight: 520;
		color: var(--text-primary);
		margin-top: 2px;
	}
	.fig .unit {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-inline-start: var(--s-1);
		font-weight: 400;
	}
	.fig .sub {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-top: 1px;
	}
	.mark {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		padding: 0 4px;
	}
	.why {
		position: relative;
		margin-top: var(--s-2);
		font-size: var(--t-2xs);
	}
	.why-btn {
		color: var(--text-faint);
		cursor: pointer;
		list-style: none;
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		background: none;
		border: none;
		padding: 0;
		font: inherit;
	}
	.why-btn::after {
		content: '+';
		margin-inline-start: 2px;
	}
	.why-btn[aria-expanded='true']::after {
		content: '−';
	}
	.why-pop {
		max-width: 42ch;
		max-height: 50vh;
		overflow-y: auto;
		padding: var(--s-2) var(--s-1);
	}

</style>
