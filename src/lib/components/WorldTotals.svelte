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
	import { compact } from '$lib/design/media.svelte';
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
	import { sheetDrag, type SheetDragParams } from '$lib/ui/sheet-drag';
	import type { WorldFamily } from '$lib/world/store.svelte';

	/*
	 * WHY ONE LINE, ORDERED BY FAMILY
	 *
	 * The strip used to be a band of eight cards above the globe, which on a
	 * phone spent a quarter of the screen before the view began (DESIGN.md §5).
	 * It is one line of figures in the view's toolbar now, the same shape as the
	 * Network's counts. Every figure is still there; the family the globe is
	 * drawing decides which come first, so the numbers in reach are the ones the
	 * arcs are about. On a narrow screen the line scrolls sideways.
	 */
	let { family = 'trade' }: { family?: WorldFamily } = $props();

	const ORDER: Record<WorldFamily, string[]> = {
		trade: ['exports', 'imports', 'balance', 'reserves', 'debt', 'service', 'remittances-received', 'remittances-paid'],
		energy: ['imports', 'exports', 'balance', 'reserves', 'debt', 'service', 'remittances-received', 'remittances-paid'],
		debt: ['debt', 'service', 'reserves', 'remittances-received', 'remittances-paid', 'exports', 'imports', 'balance']
	};

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
	let explainPopEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (openExplain && explainPopEl) {
			explainPopEl.focus({ preventScroll: true });
		}
	});

	/** Matches the exit transition below, so the DOM leaves exactly when it ends. */
	const EXPLAIN_CLOSE_MS = 260;
	/** What the pop renders; it outlives `openExplain` by the exit transition. */
	let showExplain = $state<string | null>(null);
	let explainClosing = $state(false);
	let explainTimer: ReturnType<typeof setTimeout> | undefined;

	/*
	 * Mount with `openExplain`, stay mounted through the exit so the sheet can
	 * slide away instead of vanishing on the frame the key turns null. The wide
	 * layout is a centred popup with no closing style, so it leaves at once.
	 */
	$effect(() => {
		const key = openExplain;
		if (key) {
			clearTimeout(explainTimer);
			explainClosing = false;
			showExplain = key;
			return;
		}
		if (!showExplain) return;
		if (!compact.current) {
			explainClosing = false;
			showExplain = null;
			return;
		}
		explainClosing = true;
		explainTimer = setTimeout(() => {
			explainClosing = false;
			showExplain = null;
		}, EXPLAIN_CLOSE_MS);
		return () => clearTimeout(explainTimer);
	});

	/** Modal sheet on a phone, like Popover; centered popup on a wide screen. */
	const explainDrag: SheetDragParams = {
		enabled: () => compact.current,
		detent: () => 'full',
		setDetent: () => {},
		dismiss: () => (openExplain = null),
		hasPeek: () => false,
		handle: '.sheet-handle'
	};

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

	const ordered = $derived(
		ORDER[family].map((k) => figures.find((f) => f.key === k)).filter((f): f is Figure => !!f)
	);
</script>

<div class="totals" aria-label={t('world.strip.title')}>
	<span class="year mono">{year}</span>
	<dl class="line">
		{#each ordered as f (f.key)}
			<div class="fig">
				<dt>
					<!-- The label is the door to the explainer: a word to tap, not a
					     separate "explain" control under every number. -->
					<button
						class="why-btn"
						onclick={() => (openExplain = openExplain === f.key ? null : f.key)}
						aria-expanded={openExplain === f.key}
						aria-controls={'explain-' + f.key}
						title={t('world.strip.explain')}
					>
						{f.label}
					</button>
					{#if f.sumof}
						<Tooltip content={t('world.strip.sumof')}><span class="mark mono" aria-label={t('world.strip.sumof')}>Σ</span></Tooltip>
					{/if}
				</dt>
				<dd class="mono">
					{moneyM(f.value, app.locale)}{#if f.value !== null}<span class="unit">{t('world.usd')}</span>{/if}
				</dd>
			</div>
		{/each}
	</dl>
</div>

{#if showExplain}
	{@const active = figures.find((f) => f.key === showExplain)}
	{#if active}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="explain-scrim"
			class:closing={explainClosing}
			role="presentation"
			onclick={() => (openExplain = null)}
		></div>
		<div
			class="explain-pop"
			class:closing={explainClosing}
			bind:this={explainPopEl}
			use:sheetDrag={explainDrag}
			role="dialog"
			aria-modal="false"
			aria-label={active.label}
			tabindex="-1"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					openExplain = null;
				}
			}}
		>
			<span class="sheet-handle" aria-hidden="true"><i class="sheet-grip"></i></span>
			<button class="explain-close" onclick={() => (openExplain = null)} aria-label={t('world.strip.explain') + ' — close'}>×</button>
			<div id={"explain-" + active.key} class="why-pop sheet-scroll">
				<p class="pop-head">
					<span class="pop-label">{active.label}</span>
					<span class="mono">{moneyM(active.value, app.locale)} {active.value !== null ? t('world.usd') : ''}</span>
					{#if active.sub}<span class="pop-sub">{active.sub}</span>{/if}
				</p>
				<Content view="world" section={active.explain} compact />
			</div>
		</div>
	{/if}
{/if}

<style>
	.totals {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		min-width: 0;
	}
	.year {
		font-size: var(--t-xs);
		font-weight: 600;
		color: var(--text-primary);
		flex: none;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: var(--s-5);
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		/* The trailing fade says the line goes on. */
		mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
	}
	.line::-webkit-scrollbar {
		display: none;
	}
	:global([dir='rtl']) .line {
		mask-image: linear-gradient(to left, black calc(100% - 24px), transparent 100%);
		-webkit-mask-image: linear-gradient(to left, black calc(100% - 24px), transparent 100%);
	}
	.fig {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		flex: none;
		white-space: nowrap;
	}
	.fig dt {
		display: flex;
		align-items: baseline;
		gap: var(--s-1);
	}
	.fig dd {
		margin: 0;
		font-size: var(--t-xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}
	.fig .unit {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-inline-start: var(--s-1);
	}
	.mark {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		padding: 0 4px;
	}
	.why-btn {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
		cursor: help;
		background: none;
		border: none;
		padding: 0;
		border-bottom: 1px dotted var(--border-strong);
	}
	.why-btn:hover,
	.why-btn[aria-expanded='true'] {
		color: var(--text-primary);
		border-bottom-color: var(--accent);
	}
	.pop-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-1) var(--s-3);
		margin-bottom: var(--s-4);
		padding-inline-end: var(--s-8);
	}
	.pop-label {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.pop-sub {
		width: 100%;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.why-pop {
		max-width: 42ch;
		max-height: 50vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--s-2) var(--s-1);
	}

	.explain-scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-scrim);
	}
	.explain-scrim.closing {
		opacity: 0;
		transition: opacity var(--dur-normal) var(--ease-in-out);
	}

	.explain-pop {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: var(--z-modal);
		width: min(560px, calc(100vw - 32px));
		max-height: min(70vh, 600px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
		padding: var(--s-5) var(--s-6) var(--s-6);
		animation: rise-in var(--dur-fast) var(--ease-out);
	}

	.explain-close {
		position: absolute;
		top: var(--s-3);
		inset-inline-end: var(--s-3);
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		border: 1px solid var(--border-subtle);
		background: var(--surface-panel);
		color: var(--text-muted);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
	}

	.explain-close:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}

	@keyframes rise-in {
		from { opacity: 0; transform: translate(-50%, -45%); }
		to { opacity: 1; transform: translate(-50%, -50%); }
	}
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@media (max-width: 900px) {
		.explain-pop {
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			transform: translateY(var(--sheet-y, 0px));
			width: auto;
			max-width: none;
			max-height: 80dvh;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			border-inline: none;
			border-bottom: none;
			border-radius: var(--r-xl) var(--r-xl) 0 0;
			padding-bottom: var(--safe-b);
			/* Landscape notch: full-bleed frame, inset content. */
			padding-inline: var(--safe-l) var(--safe-r);
			animation: sheet-in var(--dur-normal) var(--ease-out);
			transition: transform var(--dur-normal) var(--ease-out);
		}
		/* Leaving: under the bottom edge, which clears the dock behind the scrim. */
		.explain-pop.closing {
			transform: translateY(100%);
			transition: transform var(--dur-normal) var(--ease-in-out);
		}
		/* One scroll surface under the fixed handle. */
		.why-pop {
			flex: 1;
			min-height: 0;
			max-height: none;
		}
		.explain-scrim {
			background: color-mix(in oklch, var(--n-1000) 55%, transparent);
			backdrop-filter: blur(2px);
			animation: fade-in var(--dur-fast) var(--ease-out);
		}
	}

	@keyframes sheet-in {
		from { transform: translateY(100%); }
	}
	@media (prefers-reduced-motion: reduce) {
		.explain-pop, .explain-scrim { animation: none; }
	}

</style>
