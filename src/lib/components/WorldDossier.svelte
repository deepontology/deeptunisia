<script lang="ts">
	/**
	 * One counterparty, all the relationships the atlas can honestly put beside
	 * it. The globe is the shape and the ledger is the books; this is the
	 * explanation surface between them.
	 *
	 * A country without a graph record still gets a dossier when it has a
	 * measured flow. Its identity comes from the build-time CLDR gazetteer, and
	 * the missing record is shown rather than silently treated as a zero.
	 */
	import { app } from '$lib/state.svelte';
	import { ds, relationshipsByEntity } from '$lib/model';
	import {
		countryOf,
		flows,
		debt,
		tradeIn,
		energyIn,
		debtIn,
		type YearTrade,
		type YearEnergy,
		type YearDebt
	} from '$lib/world/countries';
	import { moneyM } from '$lib/world/format';
import { t, tf, nameOf, basisLabel, relLabel, describeInterval, confidenceLabel, entityName, formatDate, proseList } from '$lib/t.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Content from '$lib/ui/Content.svelte';
	import Prose from '$lib/ui/Prose.svelte';
	import SourceList from './SourceList.svelte';
	import { AGORA_OPEN } from '$lib/agora-gate';

	type Basis = 'documented' | 'reported' | 'inferred' | 'unsubstantiated';

	let { entity }: { entity: string } = $props();

	const year = $derived(new Date(app.t).getUTCFullYear());
	const isTunisia = $derived(entity.toLowerCase() === 'tunisia' || entity === 'TUN');
	const record = $derived(ds.institutions.find((i) => i.id === entity));
	const recordIso = $derived((record as unknown as { iso2?: string } | undefined)?.iso2);
	const iso2 = $derived(recordIso ?? (/^[A-Z]{2}$/.test(entity) ? entity : null));
	const country = $derived(countryOf(iso2));
	const heading = $derived(
		isTunisia
			? t('world.tunisia')
			: nameOf(record) || country?.names[app.locale] || country?.names.en || entity
	);

	const recordId = $derived(record?.id ?? null);
	const recordBasis = $derived(
		((record as unknown as { basis?: Basis } | undefined)?.basis ?? null) as Basis | null
	);
	const tradeCurrent = $derived(iso2 ? tradeIn(year).find((r) => r.iso2 === iso2) ?? null : null);
	const energyCurrent = $derived(iso2 ? energyIn(year).find((r) => r.iso2 === iso2) ?? null : null);
	const debtCurrent = $derived.by<YearDebt | null>(() => {
		if (!iso2 && !recordId) return null;
		return (
			debtIn(year).find((r) =>
				recordId ? r.institutionId === recordId : !r.institutionId && r.iso2 === iso2
			) ?? null
		);
	});

	interface TradePoint {
		y: number;
		out: number | null;
		inn: number | null;
	}
	interface DebtPoint {
		y: number;
		stock: number | null;
		repaid: number | null;
	}
	interface EnergyPoint {
		y: number;
		value: number | null;
	}

	function thin<T>(rows: T[], max = 24): T[] {
		if (rows.length <= max) return rows;
		const step = Math.ceil(rows.length / (max - 1));
		const out = rows.filter((_, i) => i % step === 0);
		if (out.length && out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
		return out;
	}

	const tradeSeries = $derived.by<TradePoint[]>(() => {
		if (!iso2 || !flows) return [];
		const row = flows.partners[iso2];
		if (!row) return [];
		const full: TradePoint[] = [];
		for (let i = 0; i < flows.years.length; i++) {
			if (row.out[i] === null && row.in[i] === null) continue;
			full.push({ y: flows.years[i], out: row.out[i], inn: row.in[i] });
		}
		return thin(full);
	});

	const debtSeries = $derived.by<DebtPoint[]>(() => {
		if (!debt) return [];
		let stock: (number | null)[] | undefined;
		let repaid: (number | null)[] | undefined;
		if (recordId && debt.bodies[recordId]) {
			stock = debt.bodies[recordId].stock;
			repaid = debt.bodies[recordId].repaid;
		} else if (iso2 && debt.creditors[iso2]) {
			stock = debt.creditors[iso2].stock;
			repaid = debt.creditors[iso2].repaid;
		}
		if (!stock) return [];
		const full: DebtPoint[] = [];
		for (let i = 0; i < debt.years.length; i++) {
			if ((stock[i] ?? null) === null && (repaid?.[i] ?? null) === null) continue;
			full.push({ y: debt.years[i], stock: stock[i] ?? null, repaid: repaid?.[i] ?? null });
		}
		return thin(full);
	});

	const energySeries = $derived.by(() => {
		if (!iso2 || !flows) return [] as { fuel: string; bought: EnergyPoint[]; sold: EnergyPoint[] }[];
		return Object.entries(flows.energy)
			.map(([fuel, partners]) => {
				const row = partners[iso2!];
				if (!row) return null;
				const bought: EnergyPoint[] = [];
				const sold: EnergyPoint[] = [];
				for (let i = 0; i < flows!.years.length; i++) {
					if (row.in[i] !== null) bought.push({ y: flows!.years[i], value: row.in[i] });
					if (row.out[i] !== null) sold.push({ y: flows!.years[i], value: row.out[i] });
				}
				return { fuel, bought: thin(bought), sold: thin(sold) };
			})
			.filter((v): v is { fuel: string; bought: EnergyPoint[]; sold: EnergyPoint[] } => v !== null);
	});

	function spark(points: { y: number; value: number | null }[], w = 260, h = 44): string[] {
		if (!points.length) return [];
		const first = points[0].y;
		const last = points[points.length - 1].y;
		const peak = Math.max(...points.map((p) => p.value ?? 0), 1);
		const segments: string[] = [];
		let run: string[] = [];
		for (const p of points) {
			const x = last === first ? 0 : ((p.y - first) / (last - first)) * w;
			if (p.value === null) {
				if (run.length > 1) segments.push(run.join(' '));
				run = [];
				continue;
			}
			const y = h - (p.value / peak) * h;
			run.push(`${x.toFixed(1)},${y.toFixed(1)}`);
		}
		if (run.length > 1) segments.push(run.join(' '));
		return segments;
	}

	const relationSpan = $derived.by(() => {
		const years: number[] = [];
		for (const p of tradeSeries) years.push(p.y);
		for (const p of debtSeries) years.push(p.y);
		for (const f of energySeries) {
			for (const p of f.bought) years.push(p.y);
			for (const p of f.sold) years.push(p.y);
		}
		if (!years.length) return null;
		return { first: Math.min(...years), last: Math.max(...years) };
	});

	const agreements = $derived.by(() => {
		if (isTunisia) return ds.agreements ?? [];
		const keys = new Set([iso2, recordId].filter((v): v is string => Boolean(v)));
		return (ds.agreements ?? []).filter((a) => a.parties.some((p) => keys.has(p)));
	});

	const graphRelations = $derived.by(() => {
		if (!recordId) return [];
		return relationshipsByEntity.get(recordId) ?? [];
	});

	const contracts = $derived.by(() => {
		if (!recordId) return [];
		return (ds.contracts ?? []).filter(
			(c) => c.institution === recordId || c.winner === recordId || c.financing?.lender === recordId
		);
	});
	const companyRecord = $derived(recordId ? ds.companies?.find((c) => c.id === recordId) ?? null : null);

	const claims = $derived.by(() => {
		if (!ds.worldClaims) return [];
		return ds.worldClaims.filter((c) =>
			isTunisia ? c.entity === null : c.entity === recordId || c.entity === entity
		);
	});

	function counterpart(rel: { from: string; to: string }): string {
		const id = rel.from === recordId ? rel.to : rel.from;
		return entityName(id) || id;
	}

	function relationInterval(rel: { interval?: Parameters<typeof describeInterval>[0] }): string {
		return rel.interval ? describeInterval(rel.interval) : '';
	}

	function currentTradeValue(row: YearTrade | null): number | null {
		return row ? row.total : null;
	}

	function currentEnergyValue(row: YearEnergy | null): number | null {
		return row ? row.total : null;
	}

	function energyYears(f: { bought: EnergyPoint[]; sold: EnergyPoint[] }): number[] {
		return [...new Set([...f.bought.map((p) => p.y), ...f.sold.map((p) => p.y)])].sort(
			(a, b) => a - b
		);
	}

	function localPercent(value: number): string {
		return new Intl.NumberFormat(app.locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
	}

	function localDate(raw: string): string {
		const time = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
		return Number.isNaN(time) ? raw.slice(0, 10) : formatDate(time, 'day');
	}

	const activityKeys: Record<string, string> = {
		'commercial aircraft': 'world.activity.commercial-aircraft',
		aerospace: 'world.activity.aerospace',
		'oil and gas': 'world.activity.oil-and-gas',
		chemicals: 'world.activity.chemicals',
		renewables: 'world.activity.renewables',
		'rolling stock': 'world.activity.rolling-stock',
		signalling: 'world.activity.signalling',
		'rail services': 'world.activity.rail-services',
		'buses (Solaris)': 'world.activity.buses-solaris',
		'fertiliser procurement and distribution': 'world.activity.fertiliser-procurement-distribution',
		seeds: 'world.activity.seeds',
		'minor irrigation': 'world.activity.minor-irrigation',
		'development finance': 'world.activity.development-finance',
		'technical cooperation': 'world.activity.technical-cooperation',
		'grant aid': 'world.activity.grant-aid',
		'electricity transmission': 'world.activity.electricity-transmission',
		'solar desalination': 'world.activity.solar-desalination',
		'water collection and supply': 'world.activity.water-collection-supply'
	};

	function localizedField(record: object, field: string): string {
		const values = record as Record<string, string | undefined>;
		return values[`${field}_${app.locale}`] ?? values[`${field}_en`] ?? values[field] ?? '';
	}

	function activityLabel(activity: string): string {
		const key = activityKeys[activity];
		return key ? t(key) : activity;
	}

	function notesValue(record: object) {
		return proseList(record, 'notes');
	}
</script>

<svelte:head>
	<title>{tf('world.dossier.title', { entity: heading })}</title>
	<meta name="description" content={tf('world.dossier.meta', { entity: heading })} />
</svelte:head>

<div class="dossier">
	<a class="back" href="/world?view=ledger"><span class="back-arrow" aria-hidden="true">←</span>{t('world.dossier.back')}</a>

	<header class="hero">
		<div class="eyebrow">{t('world.dossier.eyebrow')}</div>
		<h1 dir="auto">{heading}</h1>
		{#if iso2}<span class="iso mono">{iso2}</span>{/if}
		{#if relationSpan}
			<p class="span mono">{relationSpan.first}–{relationSpan.last}</p>
		{/if}
		{#if record}
			<div class="chips">
				<Chip variant="outline">{t(`inst.${record.type}`) || record.type}</Chip>
				{#if recordBasis}
					<Chip dot tint={`var(--basis-${recordBasis})`}>{record.confidence} — {basisLabel(recordBasis)}</Chip>
				{:else}
					<Chip variant="outline">{record.confidence}</Chip>
				{/if}
			</div>
			{#if record.summary}<p class="summary" dir="auto"><Prose record={record} field="summary" block /></p>{/if}
			{#if record.sources?.length}<SourceList ids={record.sources} compact />{/if}
		{:else if !isTunisia}
			<p class="missing">{t('world.dossier.norecord')}</p>
		{/if}
	</header>

	<Panel padded elevation={1}>
		<div class="panel-head">
			<div>
				<div class="eyebrow">{year}</div>
				<h2>{t('world.dossier.current')}</h2>
			</div>
			<p class="muted">{t('world.dossier.current.note')}</p>
		</div>
		<div class="metrics">
			<div class="metric">
				<span class="label">{t('world.exports')}</span>
				<strong class="mono">{moneyM(tradeCurrent?.out ?? null, app.locale)}</strong>
			</div>
			<div class="metric">
				<span class="label">{t('world.imports')}</span>
				<strong class="mono">{moneyM(tradeCurrent?.in ?? null, app.locale)}</strong>
			</div>
			<div class="metric">
				<span class="label">{t('world.dossier.trade.total')}</span>
				<strong class="mono">{moneyM(currentTradeValue(tradeCurrent), app.locale)}</strong>
			</div>
			<div class="metric">
				<span class="label">{t('world.owed')}</span>
				<strong class="mono">{moneyM(debtCurrent?.stock ?? null, app.locale)}</strong>
			</div>
			<div class="metric">
				<span class="label">{t('world.dossier.energy.total')}</span>
				<strong class="mono">{moneyM(currentEnergyValue(energyCurrent), app.locale)}</strong>
			</div>
		</div>
		{#if tradeCurrent && tradeCurrent.gap !== null}
			<p class="callout">{tf('world.dossier.twobooks', { gap: localPercent(tradeCurrent.gap) })}</p>
		{/if}
	</Panel>

	<section class="section">
		<div class="section-head">
			<div class="eyebrow">{t('world.dossier.period.eyebrow')}</div>
			<h2>{t('world.dossier.period')}</h2>
		</div>

		{#if tradeSeries.length}
			<Panel padded elevation={1}>
				<div class="series-head">
					<h3>{t('world.trade')}</h3>
					<span class="muted">{t('world.dossier.chart.table')}</span>
				</div>
				<svg class="chart" viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label={t('world.ledger.spark.trade')}>
					{#each spark(tradeSeries.map((p) => ({ y: p.y, value: p.out }))) as points}
						<polyline class="exports" points={points} />
					{/each}
					{#each spark(tradeSeries.map((p) => ({ y: p.y, value: p.inn }))) as points}
						<polyline class="imports" points={points} />
					{/each}
				</svg>
				<table class="series-table">
					<thead><tr><th>{t('world.ledger.col.year')}</th><th>{t('world.exports')}</th><th>{t('world.imports')}</th></tr></thead>
					<tbody>{#each tradeSeries as p (p.y)}<tr><td class="mono">{p.y}</td><td class="mono">{moneyM(p.out, app.locale)}</td><td class="mono">{moneyM(p.inn, app.locale)}</td></tr>{/each}</tbody>
				</table>
			</Panel>
		{/if}

		{#if debtSeries.length}
			<Panel padded elevation={1}>
				<div class="series-head">
					<h3>{t('world.debt')}</h3>
					<span class="muted">{t('world.dossier.chart.table')}</span>
				</div>
				<svg class="chart debt-chart" viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label={t('world.ledger.spark.debt')}>
					{#each spark(debtSeries.map((p) => ({ y: p.y, value: p.stock }))) as points}<polyline class="debt-line" points={points} />{/each}
				</svg>
				<table class="series-table">
					<thead><tr><th>{t('world.ledger.col.year')}</th><th>{t('world.owed')}</th><th>{t('world.repaid')}</th></tr></thead>
					<tbody>{#each debtSeries as p (p.y)}<tr><td class="mono">{p.y}</td><td class="mono">{moneyM(p.stock, app.locale)}</td><td class="mono">{moneyM(p.repaid, app.locale)}</td></tr>{/each}</tbody>
				</table>
			</Panel>
		{/if}

		{#each energySeries as f (f.fuel)}
			<Panel padded elevation={1}>
				<div class="series-head"><h3>{t(`world.fuel.${f.fuel}`)}</h3><span class="muted">{t('world.dossier.chart.table')}</span></div>
				<div class="energy-lines">
					<span>{t('world.bought')}</span>
					<svg class="chart" viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label={t('world.bought')}>
						{#each spark(f.bought) as points}<polyline class="imports" points={points} />{/each}
					</svg>
					<span>{t('world.sold')}</span>
					<svg class="chart" viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label={t('world.sold')}>
						{#each spark(f.sold) as points}<polyline class="exports" points={points} />{/each}
					</svg>
				</div>
				<table class="series-table">
					<thead><tr><th>{t('world.ledger.col.year')}</th><th>{t('world.bought')}</th><th>{t('world.sold')}</th></tr></thead>
					<tbody>
						{#each energyYears(f) as y (y)}
							{@const bought = f.bought.find((p) => p.y === y)?.value ?? null}
							{@const sold = f.sold.find((p) => p.y === y)?.value ?? null}
							<tr><td class="mono">{y}</td><td class="mono">{moneyM(bought, app.locale)}</td><td class="mono">{moneyM(sold, app.locale)}</td></tr>
						{/each}
					</tbody>
				</table>
			</Panel>
		{/each}

		{#if !tradeSeries.length && !debtSeries.length && !energySeries.length}
			<p class="empty">{t('world.dossier.no.measurements')}</p>
		{/if}
	</section>

	<section class="section">
		<div class="section-head"><div class="eyebrow">{t('world.dossier.claims.eyebrow')}</div><h2>{t('world.dossier.claims')}</h2></div>
		{#if agreements.length}
			<div class="claim-list">
				{#each agreements as ag (ag.id)}
					<Panel padded elevation={1}>
						<div class="claim-top"><h3 dir="auto">{nameOf(ag)}</h3><Chip dot tint={`var(--basis-${ag.basis})`}>{ag.confidence} — {basisLabel(ag.basis)}</Chip></div>
						<p dir="auto"><Prose record={ag} field="summary" block /></p>
						<div class="meta"><span>{t(`world.kind.${ag.kind}`)}</span>{#if ag.in_force}<span class="mono">{tf('world.inforce.date', { date: localDate(ag.in_force) })}</span>{/if}</div>
						{#if ag.attributed_to}<p class="attributed">{tf('world.dossier.attributed', { label: t('basis.attributed'), who: ag.attributed_to })}</p>{/if}
						{#if ag.disputes?.length}<div class="dispute">{tf('world.dossier.dispute.detail', { label: t('world.dossier.dispute'), claim: ag.disputes[0].claim })}</div>{/if}
						{#if ag.sources?.length}<SourceList ids={ag.sources} compact />{/if}
					</Panel>
				{/each}
			</div>
		{:else}
			<p class="empty">{t('world.dossier.no.agreements')}</p>
		{/if}
	</section>

	{#if graphRelations.length}
		<section class="section">
			<div class="section-head"><div class="eyebrow">{t('world.dossier.graph.eyebrow')}</div><h2>{t('world.dossier.graph')}</h2></div>
			<div class="relation-list">
				{#each graphRelations as rel (rel.id)}
					<Panel padded elevation={1}>
						<div class="claim-top"><h3>{tf('world.dossier.relationship.title', { relation: relLabel(rel.type), counterparty: counterpart(rel) })}</h3><Chip dot tint={`var(--basis-${rel.basis})`}>{rel.confidence} — {basisLabel(rel.basis)}</Chip></div>
						{#if rel.description}<p dir="auto"><Prose record={rel} field="description" block /></p>{/if}
						<div class="meta">{#if relationInterval(rel)}<span class="mono">{relationInterval(rel)}</span>{/if}<span>{confidenceLabel(rel.confidence)}</span></div>
						{#if rel.attributed_to}<p class="attributed">{tf('world.dossier.attributed', { label: t('basis.attributed'), who: rel.attributed_to })}</p>{/if}
						{#if rel.sources?.length}<SourceList ids={rel.sources} compact />{/if}
					</Panel>
				{/each}
			</div>
		</section>
	{/if}

	{#if contracts.length}
		<section class="section">
			<div class="section-head"><div class="eyebrow">{t('world.dossier.contracts.eyebrow')}</div><h2>{t('world.dossier.contracts')}</h2></div>
			<div class="claim-list">
				{#each contracts as contract (contract.id)}
					{@const notes = notesValue(contract)}
					<Panel padded elevation={1}>
						<div class="claim-top"><h3 dir="auto">{nameOf(contract)}</h3><Chip dot tint={`var(--basis-${contract.basis})`}>{contract.confidence} — {basisLabel(contract.basis)}</Chip></div>
						<div class="meta"><span>{t(`world.contract.status.${contract.status}`)}</span>{#if contract.award}<span class="mono">{contract.award.value} {contract.award.currency}</span>{/if}</div>
						{#if notes.items.length}<p dir="auto">{notes.items[0]}{#if !notes.translated}<span class="untranslated-note">{t('prose.untranslated')}</span>{/if}</p>{/if}
						{#if contract.sources?.length}<SourceList ids={contract.sources} compact />{/if}
					</Panel>
				{/each}
			</div>
		</section>
	{/if}

	{#if companyRecord}
		<section class="section">
			<div class="section-head"><div class="eyebrow">{t('world.dossier.company.eyebrow')}</div><h2>{t('world.dossier.company')}</h2></div>
			<Panel padded elevation={1}>
				<div class="meta"><span>{t(`world.company.status.${companyRecord.status}`)}</span>{#if companyRecord.founded}<span class="mono">{tf('world.dossier.company.founded.date', { date: localDate(companyRecord.founded) })}</span>{/if}</div>
				{#if companyRecord.legal_name_en}<p dir="auto">{localizedField(companyRecord, 'legal_name')}</p>{/if}
				{#if companyRecord.activities?.length}<p dir="auto">{companyRecord.activities.map(activityLabel).join(' · ')}</p>{/if}
				{#if companyRecord.sources?.length}<SourceList ids={companyRecord.sources} compact />{/if}
			</Panel>
		</section>
	{/if}

	<section class="section contested">
		<div class="section-head"><div class="eyebrow">{t('world.dossier.contested.eyebrow')}</div><h2>{t('world.dossier.contested')}</h2></div>
		<Content view="world" section="dossier-claims" compact />
		{#if claims.length}
			<div class="claim-list">
				{#each claims as claim (claim.id)}
					<Panel padded elevation={1} tint={`var(--basis-${claim.basis})`}>
						<div class="claim-top"><h3 dir="auto"><Prose record={claim} field="claim" /></h3><Chip dot tint={`var(--basis-${claim.basis})`}>{claim.confidence} — {basisLabel(claim.basis)}</Chip></div>
						<p class="assessment" dir="auto"><strong>{t('world.dossier.assessment')}:</strong> <Prose record={claim} field="assessment" /></p>
						{#if claim.attributed_to}<p class="attributed">{tf('world.dossier.attributed', { label: t('basis.attributed'), who: claim.attributed_to })}</p>{/if}
						{#if claim.sources?.length}<SourceList ids={claim.sources} compact />{/if}
					</Panel>
				{/each}
			</div>
		{:else}
			<p class="empty">{t('world.dossier.no.contested')}</p>
		{/if}
	</section>

	{#if recordId}
		<div class="actions">
			{#if AGORA_OPEN}
				<a class="action" href={`/agora?target_type=institution&target_id=${recordId}&label=${encodeURIComponent(heading)}`}>{t('panel.discuss')}</a>
			{:else}
				<span class="action disabled">{t('panel.discuss')} · {t('agora.soon.badge')}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.dossier {
		height: 100%;
		overflow-y: auto;
		padding: var(--s-7) clamp(var(--s-4), 5vw, var(--s-10)) var(--s-10);
		max-width: 1100px;
		margin: 0 auto;
		width: 100%;
	}
	.back { color: var(--text-muted); font-size: var(--t-xs); }
	.back-arrow { display: inline-block; margin-inline-end: var(--s-1); }
	:global([dir='rtl']) .back-arrow { transform: scaleX(-1); }
	.back:hover { color: var(--accent); }
	.hero { padding: var(--s-7) 0 var(--s-6); border-bottom: 1px solid var(--border-subtle); }
	.eyebrow { font-size: var(--t-2xs); letter-spacing: var(--track-wide); text-transform: uppercase; color: var(--text-muted); }
	h1 { margin-top: var(--s-2); font-size: clamp(var(--t-2xl), 4vw, var(--t-4xl)); color: var(--text-primary); }
	h2 { margin-top: var(--s-1); font-size: var(--t-xl); color: var(--text-primary); }
	h3 { font-size: var(--t-md); color: var(--text-primary); }
	.iso { display: inline-block; margin-top: var(--s-2); font-size: var(--t-xs); color: var(--text-faint); }
	.span { display: inline-block; margin-inline-start: var(--s-3); color: var(--text-muted); font-size: var(--t-xs); }
	.chips { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-4); }
	.summary { max-width: 75ch; margin-top: var(--s-4); color: var(--text-secondary); line-height: var(--lh-relaxed); }
	.missing, .empty { color: var(--text-faint); font-size: var(--t-sm); }
	.panel-head, .series-head, .claim-top { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-4); flex-wrap: wrap; }
	.panel-head { margin-bottom: var(--s-5); }
	.muted, .meta, .attributed { color: var(--text-faint); font-size: var(--t-xs); }
	.metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s-3); }
	.metric { padding-inline-start: var(--s-3); border-inline-start: 1px solid var(--border-subtle); }
	.metric .label { display: block; color: var(--text-muted); font-size: var(--t-2xs); }
	.metric strong { display: block; margin-top: var(--s-1); font-size: var(--t-lg); color: var(--text-primary); }
	.callout { margin-top: var(--s-4); color: var(--text-muted); font-size: var(--t-xs); }
	.section { margin-top: var(--s-8); }
	.section-head { margin-bottom: var(--s-4); }
	.section-head h2 { margin-bottom: var(--s-2); }
	.series-head { margin-bottom: var(--s-3); }
	.series-head .muted { font-size: var(--t-2xs); }
	.chart { display: block; width: 100%; height: 58px; margin: var(--s-3) 0 var(--s-4); background: var(--surface-sunken); border: 1px solid var(--border-subtle); border-radius: var(--r-md); }
	.exports, .imports, .debt-line { fill: none; stroke-linecap: round; stroke-width: 1.6; }
	.exports { stroke: var(--layer-economic); }
	.imports { stroke: var(--layer-foreign); }
	.debt-line { stroke: var(--layer-judicial); }
	.series-table { border-collapse: collapse; width: 100%; font-size: var(--t-xs); }
	.series-table th { text-align: end; color: var(--text-faint); font-weight: 500; border-bottom: 1px solid var(--border-subtle); padding: var(--s-2); }
	.series-table th:first-child, .series-table td:first-child { text-align: start; }
	.series-table td { text-align: end; color: var(--text-secondary); padding: var(--s-2); border-bottom: 1px solid var(--border-subtle); }
	.energy-lines { display: grid; grid-template-columns: auto 1fr; gap: var(--s-2) var(--s-4); align-items: center; font-size: var(--t-xs); color: var(--text-muted); }
	.energy-lines .chart { margin: 0; height: 42px; }
	.claim-list, .relation-list { display: grid; gap: var(--s-3); }
	.claim-top { align-items: center; }
	.claim-top h3 { flex: 1; }
	.claim-list p { margin-top: var(--s-3); color: var(--text-secondary); line-height: var(--lh-relaxed); }
	.meta { display: flex; gap: var(--s-4); flex-wrap: wrap; margin-top: var(--s-3); }
	.dispute { margin-top: var(--s-3); padding: var(--s-2) var(--s-3); border-inline-start: 2px solid var(--basis-unsubstantiated); color: var(--text-muted); font-size: var(--t-xs); }
	.assessment { border-inline-start: 2px solid var(--border-default); padding-inline-start: var(--s-3); }
	.attributed { margin-top: var(--s-2); }
	.untranslated-note { margin-inline-start: var(--s-3); color: var(--basis-inferred); font-size: var(--t-2xs); }
	.contested { padding-bottom: var(--s-4); }
	.actions { display: flex; gap: var(--s-3); margin-top: var(--s-6); }
	.action { display: inline-flex; align-items: center; min-height: var(--tap); padding: var(--s-2) var(--s-5); border: 1px solid var(--accent-border); border-radius: var(--r-md); background: var(--accent-muted); color: var(--accent-text); font-size: var(--t-sm); }
	.action:hover { background: var(--surface-hover); }
	.action.disabled { color: var(--text-faint); background: var(--surface-sunken); border-color: var(--border-default); }
	@media (max-width: 720px) {
		.metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.metric:last-child { grid-column: 1 / -1; }
		.dossier { padding-top: var(--s-5); }
	}
</style>
