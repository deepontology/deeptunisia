<script lang="ts">
	/**
	 * The ledger — every entity Tunisia has a measured or claimed relationship
	 * with, as rows. This is the table the brief asks for ("a list of each
	 * country"), and it is also the globe's table alternative, which closes a
	 * DESIGN.md violation that predates this view (the globe claimed a table it
	 * never had).
	 *
	 * WHY THREE SECTIONS
	 *
	 * The counterparties are not all one kind of thing. A state, a lender that is
	 * a body (the World Bank), a market ("Bondholders") and a company are four
	 * different objects, and a table that blended them would quietly assert they
	 * are interchangeable. Sections make the difference visible; the filter makes
	 * it navigable.
	 *
	 * WHY THE GLOBE STAYS TOP-20 AND THE LEDGER IS COMPLETE
	 *
	 * A hundred and ninety arcs from one point is a starburst that says nothing.
	 * The globe draws the shape — top partners, cut by value so the cut moves
	 * with the cursor — and the ledger has every row. The division of labour is
	 * stated in the UI rather than left for the reader to infer.
	 *
	 * WHY THE TOTALS ROW SHOWS TWO NUMBERS WHERE THEY DIFFER
	 *
	 * The publisher's own aggregate is larger than the sum of the rows by exactly
	 * the aggregates the build discards ("Areas, nes" and friends). The totals
	 * row shows the official total and the sum of the rows it contains, and the
	 * explainer says what the difference is. Never averaged, never merged.
	 *
	 * EPISTEMIC RULES, APPLIED
	 *
	 * Measurements get provenance, never a basis chip. Unobserved years are em
	 * dashes, never zeros. A row whose counterparty has no graph record shows
	 * that gap (hollow, not hidden) and offers no door that would open nothing.
	 * The Discuss door is discuss-only: a UN Comtrade figure is not this
	 * project's to edit.
	 */
	import { t, tf, nameOf, formatDate } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { ds, relationshipsByEntity } from '$lib/model';
	import {
		flows,
		debt,
		countryOf,
		tradeIn,
		energyIn,
		debtIn,
		institutionalDebtIn,
		tradeTotalsIn,
		debtTotalsIn,
		tradeSumIn,
		debtSumIn,
		type YearTrade,
		type YearEnergy,
		type YearDebt
	} from '$lib/world/countries';
	import { moneyM } from '$lib/world/format';
	import { world } from '$lib/world/store.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Content from '$lib/ui/Content.svelte';
	import { AGORA_OPEN } from '$lib/agora-gate';

	const year = $derived(new Date(app.t).getUTCFullYear());

	type LedgerFamily = 'all' | 'trade' | 'energy' | 'debt';
	let fam = $state<LedgerFamily>('all');
	const famOptions = $derived([
		{ value: 'all', label: t('world.ledger.fam.all') },
		{ value: 'trade', label: t('world.trade') },
		{ value: 'energy', label: t('world.energy') },
		{ value: 'debt', label: t('world.debt') }
	]);

	function setFamilyView(value: string) {
		fam = value as LedgerFamily;
		if (value !== 'all') world.setFamily(value as 'trade' | 'energy' | 'debt');
	}

	type Section = 'states' | 'bodies' | 'companies';
	let section = $state<'all' | Section>('all');
	const sectionOptions = $derived([
		{ value: 'all', label: t('world.ledger.section.all') },
		{ value: 'states', label: t('world.ledger.section.states') },
		{ value: 'bodies', label: t('world.ledger.section.bodies') },
		{ value: 'companies', label: t('world.ledger.section.companies') }
	]);

	let query = $state('');
	let recordsOnly = $state(false);
	let expanded = $state<string | null>(null);

	const lenderKeys: Record<string, string> = {
		'World Bank-IDA': 'world.lender.world-bank-ida',
		'World Bank-IBRD': 'world.lender.world-bank-ibrd',
		Czechoslovakia: 'world.lender.czechoslovakia',
		Bondholders: 'world.lender.bondholders',
		'African Dev. Bank': 'world.lender.african-dev-bank',
		'International Finance Corporation': 'world.lender.international-finance-corporation',
		'Arab Fund for Economic & Social Development': 'world.lender.arab-fund',
		'Multiple Lenders': 'world.lender.multiple-lenders',
		'OPEC Fund for International Dev.': 'world.lender.opec-fund',
		'Islamic Dev. Bank': 'world.lender.islamic-dev-bank',
		'European Investment Bank': 'world.lender.european-investment-bank',
		'International Fund for Agricultural Dev.': 'world.lender.international-fund-agricultural-development',
		'European Development Fund (EDF)': 'world.lender.european-development-fund',
		'Nordic Investment Bank': 'world.lender.nordic-investment-bank',
		'Arab Bank for Economic Dev. in Africa (BADEA)': 'world.lender.arab-bank-economic-development-africa',
		'European Social Fund (ESF)': 'world.lender.european-social-fund',
		'European Union': 'world.lender.european-union',
		'European Bank for Reconstruction and Dev. (EBRD)': 'world.lender.ebrd',
		'Arab Monetary Fund': 'world.lender.arab-monetary-fund',
		'World Trade Organization': 'world.lender.world-trade-organization',
		'African Export-Import Bank': 'world.lender.african-export-import-bank'
	};

	function lenderName(name: string): string {
		const key = lenderKeys[name];
		return key ? t(key) : name;
	}

	function localPercent(value: number): string {
		return new Intl.NumberFormat(app.locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
	}

	function localDate(raw: string): string {
		const time = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
		return Number.isNaN(time) ? raw.slice(0, 10) : formatDate(time, 'day');
	}

	/** iso2 → graph institution id, so a row can open the same record the globe opens. */
	const recordByIso = $derived.by(() => {
		const m = new Map<string, string>();
		for (const i of ds.institutions) {
			const iso2 = (i as { iso2?: string }).iso2;
			if (iso2) m.set(iso2, i.id);
		}
		return m;
	});

	interface Row {
		key: string;
		section: Section;
		name: string;
		iso2: string | null;
		recordId: string | null;
		trade: YearTrade | null;
		energy: YearEnergy | null;
		debt: YearDebt | null;
		/** Institutional lender name when the row is a body with no seat or record. */
		institutional: string | null;
		agreements: { id: string; kind: string; label: string }[];
		/** First/last year with any observation, for the expand line. */
		first: number | null;
		last: number | null;
		/** Largest measured number on the row — the default sort. */
		peak: number;
	}

	const rows = $derived.by<Row[]>(() => {
		const map = new Map<string, Row>();

		const mk = (key: string, section: Section, name: string, iso2: string | null, recordId: string | null): Row => {
			let r = map.get(key);
			if (!r) {
				r = {
					key,
					section,
					name,
					iso2,
					recordId,
					trade: null,
					energy: null,
					debt: null,
					institutional: null,
					agreements: [],
					first: null,
					last: null,
					peak: 0
				};
				map.set(key, r);
			}
			return r;
		};

		// Trade and energy partners, by country.
		for (const r of tradeIn(year)) {
			const c = countryOf(r.iso2);
			const name = c ? (c.names[app.locale] ?? c.names.en) : r.iso2;
			mk(r.iso2, 'states', name, r.iso2, recordByIso.get(r.iso2) ?? null).trade = r;
		}
		for (const r of energyIn(year)) {
			const c = countryOf(r.iso2);
			const name = c ? (c.names[app.locale] ?? c.names.en) : r.iso2;
			mk(r.iso2, 'states', name, r.iso2, recordByIso.get(r.iso2) ?? null).energy = r;
		}

		// Debt creditors: states by code, seated bodies by institution id.
		for (const r of debtIn(year)) {
			if (r.institutionId) {
				const inst = ds.institutions.find((i) => i.id === r.institutionId);
				const row = mk(`inst:${r.institutionId}`, 'bodies', nameOf(inst), null, r.institutionId);
				row.debt = r;
			} else {
				const c = countryOf(r.iso2);
				const name = c ? (c.names[app.locale] ?? c.names.en) : r.iso2;
				mk(r.iso2, 'states', name, r.iso2, recordByIso.get(r.iso2) ?? null).debt = r;
			}
		}
		// Lenders that are not places at all: bondholders, syndicates.
		for (const l of institutionalDebtIn(year)) {
			const name = lenderName(l.name);
			const row = mk(`inst-name:${l.name}`, 'bodies', name, null, null);
			row.institutional = l.name;
			row.debt = {
				iso2: '',
				stock: l.stock,
				disbursed: null,
				repaid: null,
				net: 0
			};
		}

		// Agreement parties — an agreement is a claim, and a party with no measured
		// flow still deserves a row: the relationship exists even when no number does.
		for (const ag of ds.agreements ?? []) {
			for (const party of ag.parties) {
				if (/^[A-Z]{2}$/.test(party)) {
					const c = countryOf(party);
					const name = c ? (c.names[app.locale] ?? c.names.en) : party;
					const row = mk(party, 'states', name, party, recordByIso.get(party) ?? null);
					row.agreements.push({ id: ag.id, kind: ag.kind, label: nameOf(ag) });
				} else {
					const inst = ds.institutions.find((i) => i.id === party);
					if (!inst) continue;
					const row = mk(`inst:${party}`, 'bodies', nameOf(inst), null, party);
					row.agreements.push({ id: ag.id, kind: ag.kind, label: nameOf(ag) });
				}
			}
		}

		// Companies: economic institutions the graph ties to a foreign counterparty.
		// These rows carry no measurements — they carry claims, and the expand shows
		// the relationships instead of series. Empty until the research lands; the
		// honest empty state says so rather than inventing a row.
		const foreign = new Set(
			ds.institutions
				.filter(
					(i) =>
						(i as { iso2?: string }).iso2 ||
						i.type === 'foreign-state' ||
						i.type === 'international-organisation'
				)
				.map((i) => i.id)
		);
		const companyTypes = new Set([
			'company',
			'bank',
			'holding',
			'media-company',
			'state-enterprise',
			'utility',
			'sovereign-fund',
			'cooperative'
		]);
		for (const inst of ds.institutions) {
			if (!companyTypes.has(inst.type)) continue;
			const rels = relationshipsByEntity.get(inst.id) ?? [];
			const linked = rels.some(
				(r) => (r.from === inst.id && foreign.has(r.to)) || (r.to === inst.id && foreign.has(r.from))
			);
			if (!linked) continue;
			mk(`inst:${inst.id}`, 'companies', nameOf(inst), null, inst.id);
		}

		// Observability span, from the underlying series (not the year slice).
		for (const row of map.values()) {
			const tr = row.trade?.iso2 ? flows?.partners[row.trade.iso2] : null;
			const years = flows?.years;
			if (tr && years) {
				for (const s of [tr.out, tr.in]) {
					for (let i = 0; i < s.length; i++) {
						if (s[i] === null) continue;
						row.first = row.first === null ? years[i] : row.first;
						row.last = years[i];
					}
				}
			}
			row.peak = Math.max(
				row.trade?.total ?? 0,
				row.energy?.total ?? 0,
				row.debt?.stock ?? 0,
				row.agreements.length
			);
			// A row that exists only through an agreement has no measurement peak —
			// its "size" is the claim itself, so it sorts below any measured row.
			if (!row.trade && !row.energy && !row.debt) row.peak = -1;
		}

		return [...map.values()];
	});

	/** The name cell a dossier link can point at: record id first, then iso2. */
	function dossierOf(row: Row): string | null {
		return row.recordId ?? row.iso2;
	}

	const filtered = $derived.by(() => {
		let list = rows;
		if (section !== 'all') list = list.filter((r) => r.section === section);
		if (recordsOnly) list = list.filter((r) => r.recordId !== null);
		const q = query.trim().toLocaleLowerCase(app.locale);
		if (q) {
			list = list.filter(
				(r) =>
					r.name.toLocaleLowerCase(app.locale).includes(q) ||
					(r.iso2 ?? '').toLocaleLowerCase(app.locale).includes(q)
			);
		}
		return list;
	});

	// --- sorting -------------------------------------------------------------

	type SortKey =
		| 'name'
		| 'exports'
		| 'imports'
		| 'total'
		| 'balance'
		| 'mirror'
		| 'gap'
		| 'owed'
		| 'received'
		| 'repaid'
		| 'net'
		| 'energy'
		| 'treaties';

	let sort = $state<{ key: SortKey; dir: 1 | -1 } | null>(null);

	function cellValue(row: Row, key: SortKey): number | null {
		switch (key) {
			case 'name':
				return null;
			case 'exports':
				return row.trade?.out ?? null;
			case 'imports':
				return row.trade?.in ?? null;
			case 'total':
				return row.trade?.total ?? null;
			case 'balance':
				return row.trade && row.trade.out !== null && row.trade.in !== null
					? row.trade.out - row.trade.in
					: null;
			case 'mirror':
				return row.trade?.mirrorTotal ?? null;
			case 'gap':
				return row.trade?.gap ?? null;
			case 'owed':
				return row.debt?.stock ?? null;
			case 'received':
				return row.debt?.disbursed ?? null;
			case 'repaid':
				return row.debt?.repaid ?? null;
			case 'net':
				return row.debt && row.debt.disbursed !== null && row.debt.repaid !== null
					? row.debt.disbursed - row.debt.repaid
					: null;
			case 'energy':
				return row.energy?.total ?? null;
			case 'treaties':
				return row.agreements.length;
		}
	}

	const sorted = $derived.by(() => {
		const list = [...filtered];
		const cmp = (a: Row, b: Row): number => {
			if (!sort) {
				// Default: measured rows by peak, claims last, ties by name.
				if (a.peak !== b.peak) return b.peak - a.peak;
				return a.name.localeCompare(b.name, app.locale);
			}
			if (sort.key === 'name') {
				return a.name.localeCompare(b.name, app.locale) * sort.dir;
			}
			const av = cellValue(a, sort.key);
			const bv = cellValue(b, sort.key);
			if (av === null && bv === null) return a.name.localeCompare(b.name, app.locale);
			if (av === null) return 1;
			if (bv === null) return -1;
			const d = (av - bv) * sort.dir;
			return d !== 0 ? d : a.name.localeCompare(b.name, app.locale);
		};
		list.sort(cmp);
		return list;
	});

	const sectionOrder: Section[] = ['states', 'bodies', 'companies'];
	const bySection = $derived.by(() => {
		const out = new Map<Section, Row[]>();
		for (const s of sectionOrder) out.set(s, sorted.filter((r) => r.section === s));
		return out;
	});

	function toggleSort(key: SortKey) {
		if (sort && sort.key === key) {
			if (sort.dir === -1) sort = null;
			else sort = { key, dir: -1 };
		} else {
			sort = { key, dir: -1 };
		}
	}
	function ariaSort(key: SortKey): 'ascending' | 'descending' | undefined {
		if (!sort || sort.key !== key) return undefined;
		return sort.dir === 1 ? 'ascending' : 'descending';
	}

	// --- the totals row -------------------------------------------------------

	const tt = $derived(tradeTotalsIn(year));
	const dt = $derived(debtTotalsIn(year));
	const tRows = $derived(tradeSumIn(year));
	const dRows = $derived(debtSumIn(year));
	const tSum = $derived(tt ? null : tRows);
	const dSum = $derived(dt ? null : dRows);
	const tOut = $derived(tt?.out ?? tSum?.out ?? null);
	const tIn = $derived(tt?.in ?? tSum?.in ?? null);
	const tBal = $derived(tOut !== null && tIn !== null ? tOut - tIn : null);
	const dStock = $derived(dt?.stock ?? dSum?.stock ?? null);
	const dRepaid = $derived(dt?.repaid ?? dSum?.repaid ?? null);

	// --- expand: series tables ------------------------------------------------

	/** Rows of the year-by-year table for one trade partner. */
	function tradeSeries(iso2: string): { y: number; out: number | null; inn: number | null }[] {
		const row = flows?.partners[iso2];
		const years = flows?.years;
		if (!row || !years) return [];
		const out: { y: number; out: number | null; inn: number | null }[] = [];
		for (let i = 0; i < years.length; i++) {
			if (row.out[i] === null && row.in[i] === null) continue;
			out.push({ y: years[i], out: row.out[i], inn: row.in[i] });
		}
		// Show every year up to ~20 rows, then thin to keep the table readable.
		if (out.length > 24) {
			const keep = new Set<number>();
			for (let i = 0; i < out.length; i += 5) keep.add(i);
			keep.add(out.length - 1);
			return out.filter((_, i) => keep.has(i));
		}
		return out;
	}

	function debtSeries(key: { institutionId?: string; iso2?: string; institutional?: string }): { y: number; stock: number | null; repaid: number | null }[] {
		const years = debt?.years;
		if (!years) return [];
		let stock: (number | null)[] | undefined;
		let repaid: (number | null)[] | undefined;
		if (key.institutionId !== undefined) {
			const b = debt?.bodies[key.institutionId];
			stock = b?.stock;
			repaid = b?.repaid;
		} else if (key.institutional !== undefined) {
			// Non-place lenders carry a stock series only.
			stock = debt?.institutional[key.institutional];
			repaid = undefined;
		} else if (key.iso2) {
			const c = debt?.creditors[key.iso2];
			stock = c?.stock;
			repaid = c?.repaid;
		}
		if (!stock) return [];
		const out: { y: number; stock: number | null; repaid: number | null }[] = [];
		for (let i = 0; i < years.length; i++) {
			if ((stock[i] ?? null) === null && (repaid?.[i] ?? null) === null) continue;
			out.push({ y: years[i], stock: stock[i] ?? null, repaid: repaid?.[i] ?? null });
		}
		return out;
	}

	/** Polyline segments of non-null runs, so gaps break the line instead of lying. */
	function spark(points: { y: number; v: number | null }[], w: number, h: number): string[] {
		const years = points.map((p) => p.y);
		const first = Math.min(...years);
		const last = Math.max(...years);
		const peak = Math.max(...points.map((p) => p.v ?? 0), 1);
		const segs: string[] = [];
		let run: string[] = [];
		for (const p of points) {
			const x = last === first ? 0 : ((p.y - first) / (last - first)) * w;
			const y = h - ((p.v ?? 0) / peak) * h;
			if (p.v === null) {
				if (run.length >= 2) segs.push(run.join(' '));
				run = [];
			} else {
				run.push(`${x.toFixed(1)},${y.toFixed(1)}`);
			}
		}
		if (run.length >= 2) segs.push(run.join(' '));
		return segs;
	}

	// Selected entity sync: when the reader switches from the globe with a
	// country selected, that row is the one that expands.
	$effect(() => {
		if (world.entity) expanded = world.entity;
	});

	function pick(row: Row) {
		expanded = expanded === row.key ? null : row.key;
		world.entity = expanded;
	}

	const count = $derived.by(() => ({ shown: sorted.length, total: rows.length }));

	/** Column count for this family mode — the colspans must match or the table breaks. */
	const cols = $derived(
		1 +
			(fam !== 'debt' && fam !== 'energy' ? 5 : 0) +
			(fam !== 'trade' && fam !== 'energy' ? 4 : 0) +
			(fam === 'energy' ? 2 : 0) +
			1
	);
</script>

<div class="ledger">
	<header class="controls">
		<div class="group">
			<Segmented options={famOptions} value={fam} onchange={setFamilyView} label={t('world.family')} />
			<Segmented options={sectionOptions} value={section} onchange={(v) => (section = v as typeof section)} label={t('world.ledger.section.label')} />
		</div>
		<div class="group">
			<Input placeholder={t('world.ledger.search')} value={query} oninput={(e) => (query = (e.currentTarget as HTMLInputElement).value)} />
			<label class="recs">
				<input type="checkbox" bind:checked={recordsOnly} />
				{t('world.ledger.records')}
			</label>
		</div>
	</header>

	<div class="count mono">
		{tf('world.ledger.count', { shown: count.shown, total: count.total, year })}
	</div>

	<div class="scroll">
		<table>
			<thead>
				<!-- The totals row is pinned above the sections: the answer to "how
				     much in total" is always the first line the reader meets. -->
				<tr class="totalsrow">
					<th scope="row" class="cname">
						{t('world.ledger.totals')}
						<span class="year mono">{year}</span>
					</th>
					{#if fam !== 'debt' && fam !== 'energy'}
						<td class="mono"><span>{moneyM(tOut, app.locale)}</span>{#if tt && tRows}<small class="sumrow"><Tooltip content={t('world.ledger.sumof')}>Σ {moneyM(tRows.out, app.locale)}</Tooltip></small>{/if}</td>
						<td class="mono"><span>{moneyM(tIn, app.locale)}</span>{#if tt && tRows}<small class="sumrow"><Tooltip content={t('world.ledger.sumof')}>Σ {moneyM(tRows.in, app.locale)}</Tooltip></small>{/if}</td>
						<td class="mono opt-bal">{moneyM(tBal, app.locale)}</td>
						<td class="mono opt-mirror">—</td>
						<td class="mono opt-gap">—</td>
					{/if}
					{#if fam !== 'trade' && fam !== 'energy'}
						<td class="mono"><span>{moneyM(dStock, app.locale)}</span>{#if dt && dRows}<small class="sumrow"><Tooltip content={t('world.ledger.sumof')}>Σ {moneyM(dRows.stock, app.locale)}</Tooltip></small>{/if}</td>
						<td class="mono opt-received">—</td>
						<td class="mono opt-repaid">{moneyM(dRepaid, app.locale)}</td>
						<td class="mono opt-net">—</td>
					{/if}
					{#if fam === 'energy'}
						<td class="mono">—</td>
						<td class="mono">—</td>
					{/if}
					<td class="opt-treaties">—</td>
				</tr>
				<tr class="heads">
					<th scope="col" class="cname" aria-sort={ariaSort('name')}>
						<button class="sort" onclick={() => toggleSort('name')}>
							{t('world.ledger.col.entity')}
						</button>
					</th>
					{#if fam !== 'debt' && fam !== 'energy'}
						<th scope="col" class="num" aria-sort={ariaSort('exports')}>
							<button class="sort" onclick={() => toggleSort('exports')}>{t('world.exports')}</button>
						</th>
						<th scope="col" class="num" aria-sort={ariaSort('imports')}>
							<button class="sort" onclick={() => toggleSort('imports')}>{t('world.imports')}</button>
						</th>
						<th scope="col" class="num opt-bal" aria-sort={ariaSort('balance')}>
							<button class="sort" onclick={() => toggleSort('balance')}>{t('world.ledger.col.balance')}</button>
						</th>
						<th scope="col" class="num opt-mirror" aria-sort={ariaSort('mirror')}>
							<button class="sort" onclick={() => toggleSort('mirror')}>
								<Tooltip content={t('world.partnersays')}>{t('world.ledger.col.mirror')}</Tooltip>
							</button>
						</th>
						<th scope="col" class="num opt-gap" aria-sort={ariaSort('gap')}>
							<button class="sort" onclick={() => toggleSort('gap')}>
								<Tooltip content={t('world.ledger.col.gap.why')}>{t('world.gap')}</Tooltip>
							</button>
						</th>
					{/if}
					{#if fam !== 'trade' && fam !== 'energy'}
						<th scope="col" class="num" aria-sort={ariaSort('owed')}>
							<button class="sort" onclick={() => toggleSort('owed')}>{t('world.owed')}</button>
						</th>
						<th scope="col" class="num opt-received" aria-sort={ariaSort('received')}>
							<button class="sort" onclick={() => toggleSort('received')}>{t('world.received')}</button>
						</th>
						<th scope="col" class="num opt-repaid" aria-sort={ariaSort('repaid')}>
							<button class="sort" onclick={() => toggleSort('repaid')}>{t('world.repaid')}</button>
						</th>
						<th scope="col" class="num opt-net" aria-sort={ariaSort('net')}>
							<button class="sort" onclick={() => toggleSort('net')}>{t('world.ledger.col.net')}</button>
						</th>
					{/if}
					{#if fam === 'energy'}
						<th scope="col" class="num" aria-sort={ariaSort('energy')}>
							<button class="sort" onclick={() => toggleSort('energy')}>{t('world.bought')}</button>
						</th>
						<th scope="col" class="num opt-bal" aria-sort={ariaSort('energy')}>
							<button class="sort" onclick={() => toggleSort('energy')}>{t('world.sold')}</button>
						</th>
					{/if}
					<th scope="col" class="num opt-treaties" aria-sort={ariaSort('treaties')}>
						<button class="sort" onclick={() => toggleSort('treaties')}>{t('world.ledger.col.treaties')}</button>
					</th>
				</tr>
			</thead>
			<tbody>
				{#if count.shown === 0}
					<tr class="emptyrow">
						<td colspan={cols}>
							{t('world.ledger.empty')}
						</td>
					</tr>
				{/if}
				{#each sectionOrder as s (s)}
					{@const secRows = bySection.get(s) ?? []}
					{#if secRows.length}
						<tr class="sectionhead">
							<th scope="colgroup" colspan={cols}>{t(`world.ledger.section.${s}`)} <span class="n mono">{secRows.length}</span></th>
						</tr>
						{#each secRows as row (row.key)}
							{@const dlink = dossierOf(row)}
							<tr class="row" class:open={expanded === row.key} class:blank={!row.recordId}>
								<th scope="row" class="cname">
									<button class="who" onclick={() => pick(row)} aria-expanded={expanded === row.key}>
										<span class="dot" aria-hidden="true"></span>
										{row.name}
									</button>
									{#if !row.recordId}
										<Tooltip content={t('world.ledger.norecord')}><span class="hollow mono" aria-hidden="true">◌</span></Tooltip>
									{/if}
								</th>
								{#if fam !== 'debt' && fam !== 'energy'}
									<td class="mono">{moneyM(row.trade?.out ?? null, app.locale)}</td>
									<td class="mono">{moneyM(row.trade?.in ?? null, app.locale)}</td>
									<td class="mono opt-bal">
										{row.trade && row.trade.out !== null && row.trade.in !== null
											? moneyM(row.trade.out - row.trade.in, app.locale)
											: '—'}
									</td>
									<td class="mono opt-mirror faint">{moneyM(row.trade?.mirrorTotal ?? null, app.locale)}</td>
									<td class="mono opt-gap faint">
										{row.trade?.gap !== null && row.trade?.gap !== undefined
											? localPercent(row.trade.gap)
											: '—'}
									</td>
								{/if}
								{#if fam !== 'trade' && fam !== 'energy'}
									<td class="mono">{moneyM(row.debt?.stock ?? null, app.locale)}</td>
									<td class="mono opt-received faint">{moneyM(row.debt?.disbursed ?? null, app.locale)}</td>
									<td class="mono opt-repaid faint">{moneyM(row.debt?.repaid ?? null, app.locale)}</td>
									<td class="mono opt-net faint">
										{row.debt && row.debt.disbursed !== null && row.debt.repaid !== null
											? moneyM(row.debt.disbursed - row.debt.repaid, app.locale)
											: '—'}
									</td>
								{/if}
								{#if fam === 'energy'}
									<td class="mono">{moneyM(row.energy?.bought ?? null, app.locale)}</td>
									<td class="mono opt-bal">{moneyM(row.energy?.sold ?? null, app.locale)}</td>
								{/if}
								<td class="num opt-treaties">
									{#if row.agreements.length}
										<span class="chip mono">{row.agreements.length}</span>
									{:else}
										<span class="faint">—</span>
									{/if}
								</td>
							</tr>
							{#if expanded === row.key}
								<tr class="expandrow">
									<td colspan={cols}>
										<div class="expand">
											{#if row.trade || row.energy || row.debt}
												<p class="span mono">
													{row.first !== null ? `${row.first}–${row.last ?? row.first}` : ''}
												</p>
											{/if}

											{#if row.trade && fam !== 'energy' && fam !== 'debt'}
												{@const series = tradeSeries(row.trade.iso2)}
												<div class="series">
													<svg
														class="spark"
														viewBox="0 0 120 28"
														preserveAspectRatio="none"
														role="img"
														aria-label={t('world.ledger.spark.trade')}
													>
														{#each spark(series.map((s) => ({ y: s.y, v: s.out })), 120, 28) as seg}
															<polyline class="l1" points={seg} />
														{/each}
														{#each spark(series.map((s) => ({ y: s.y, v: s.inn })), 120, 28) as seg}
															<polyline class="l2" points={seg} />
														{/each}
													</svg>
													<table class="mini">
														<thead>
															<tr>
																<th scope="col">{t('world.ledger.col.year')}</th>
																<th scope="col">{t('world.exports')}</th>
																<th scope="col">{t('world.imports')}</th>
															</tr>
														</thead>
														<tbody>
															{#each series as s (s.y)}
																<tr>
																	<td class="mono">{s.y}</td>
																	<td class="mono">{moneyM(s.out, app.locale)}</td>
																	<td class="mono">{moneyM(s.inn, app.locale)}</td>
																</tr>
															{/each}
														</tbody>
													</table>
												</div>
											{/if}

											{#if row.debt && fam !== 'trade' && fam !== 'energy'}
												{@const series = debtSeries(
													row.institutional !== null
														? { institutional: row.institutional }
														: row.debt.institutionId
															? { institutionId: row.debt.institutionId }
															: { iso2: row.trade?.iso2 ?? '' }
												)}
												{#if series.length}
													<div class="series">
														<svg
															class="spark"
															viewBox="0 0 120 28"
															preserveAspectRatio="none"
															role="img"
															aria-label={t('world.ledger.spark.debt')}
														>
															{#each spark(series.map((s) => ({ y: s.y, v: s.stock })), 120, 28) as seg}
																<polyline class="l1" points={seg} />
															{/each}
														</svg>
														<table class="mini">
															<thead>
																<tr>
																	<th scope="col">{t('world.ledger.col.year')}</th>
																	<th scope="col">{t('world.owed')}</th>
																	<th scope="col">{t('world.repaid')}</th>
																</tr>
															</thead>
															<tbody>
																{#each series as s (s.y)}
																	<tr>
																		<td class="mono">{s.y}</td>
																		<td class="mono">{moneyM(s.stock, app.locale)}</td>
																		<td class="mono">{moneyM(s.repaid, app.locale)}</td>
																	</tr>
																{/each}
															</tbody>
														</table>
													</div>
												{/if}
											{/if}

											{#if row.energy}
												<p class="fuels">
													{#each Object.entries(row.energy.fuels) as [fuel, v] (fuel)}
														<span class="fuel">
															{t(`world.fuel.${fuel}`)}:
											<span class="mono">{tf('world.ledger.energy.bought', { value: moneyM(v.in > 0 ? v.in : null, app.locale) })}</span>
											<span class="mono">{tf('world.ledger.energy.sold', { value: moneyM(v.out > 0 ? v.out : null, app.locale) })}</span>
														</span>
													{/each}
												</p>
											{/if}

											{#if row.agreements.length}
												<ul class="agreements">
													{#each row.agreements as a (a.id)}
														<li>
															<a href={`/world/${dlink ?? ''}#agreements`}>{a.label}</a>
															<span class="faint mono">{t(`world.kind.${a.kind}`)}</span>
														</li>
													{/each}
												</ul>
											{/if}

											{#if !row.trade && !row.energy && !row.debt}
												<p class="claims">{t('world.ledger.claimsonly')}</p>
											{/if}

											<div class="actions">
												{#if dlink}
													<a class="cbtn" href={`/world/${dlink}`}>{t('world.ledger.dossier')}</a>
												{/if}
												{#if row.recordId}
													{#if AGORA_OPEN}
														<a
															class="cbtn"
															href={`/agora?target_type=institution&target_id=${row.recordId}&label=${encodeURIComponent(row.name)}`}
														>
															{t('panel.discuss')}
														</a>
													{:else}
														<Tooltip content={t('agora.comingsoon')}>
															<span class="cbtn soon">
																{t('panel.discuss')}<i class="chip">{t('agora.soon.badge')}</i>
															</span>
														</Tooltip>
													{/if}
												{:else if row.iso2}
													<span class="norec">{t('world.ledger.norecord')}</span>
												{/if}
											</div>
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					{/if}
				{/each}
			</tbody>
		</table>
	</div>

	<footer class="prov">
		<details>
			<summary>{t('world.ledger.howread')}</summary>
			<Content view="world" section="how-read" compact />
		</details>
		<span class="src">
			{#if fam !== 'debt' && flows?.source}
				{tf('world.provenance', { source: flows.source, date: localDate(flows.retrieved) })}
			{/if}
			{#if fam !== 'trade' && fam !== 'energy' && debt?.source}
				{tf('world.provenance', { source: debt.source, date: localDate(debt.retrieved) })}
			{/if}
		</span>
	</footer>
</div>

<style>
	.ledger {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--surface-base);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-5);
		border-bottom: 1px solid var(--border-subtle);
	}
	.group {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
	.recs {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.count {
		padding: var(--s-2) var(--s-5) 0;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--s-2) var(--s-5) var(--s-6);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-xs);
	}
	thead th {
		position: sticky;
		top: 0;
		background: var(--surface-base);
		z-index: 1;
		border-bottom: 1px solid var(--border-subtle);
	}
	.sort {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
		padding: var(--s-2) 0;
		width: 100%;
		text-align: start;
	}
	.sort:hover {
		color: var(--text-primary);
	}
	/* The sort arrow hangs off the column header (aria-sort lives on the th), so
	   the reader sees the direction without hunting for the current column. */
	th[aria-sort='ascending'] .sort::after {
		content: ' ↑';
	}
	th[aria-sort='descending'] .sort::after {
		content: ' ↓';
	}
	.totalsrow {
		border-bottom: 2px solid var(--border-default);
	}
	.totalsrow th,
	.totalsrow td {
		padding: var(--s-2) 0;
		font-weight: 600;
		color: var(--text-primary);
	}
	.year {
		margin-inline-start: var(--s-2);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		font-weight: 400;
	}

	.sectionhead th {
		padding: var(--s-4) 0 var(--s-1);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
		border-bottom: 1px solid var(--border-subtle);
	}
	.n {
		font-weight: 400;
	}

	.row {
		border-bottom: 1px solid var(--border-subtle);
	}
	.row td,
	.row th {
		padding: var(--s-1) var(--s-2);
		vertical-align: baseline;
	}
	.row:hover td {
		background: var(--surface-sunken);
	}
	.row.open td {
		background: var(--surface-sunken);
	}

	.cname {
		text-align: start;
		min-width: 160px;
	}
	.who {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		text-align: start;
		font-size: var(--t-sm);
		color: var(--text-primary);
		padding: var(--s-1) 0;
	}
	.who:hover {
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 3px;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: var(--r-full);
		background: var(--layer-foreign);
		flex: none;
	}
	.row.blank .dot {
		background: transparent;
		border: 1px solid var(--layer-foreign);
		opacity: 0.7;
	}
	.hollow {
		color: var(--text-faint);
		margin-inline-start: var(--s-1);
	}

	.num {
		text-align: end;
		white-space: nowrap;
	}
	thead .num .sort {
		text-align: end;
	}
	td.mono {
		color: var(--text-primary);
	}
	.sumrow {
		display: block;
		font-size: var(--t-2xs);
		font-weight: 400;
		color: var(--text-faint);
	}
	.faint {
		color: var(--text-faint);
	}
	.chip {
		display: inline-block;
		min-width: 18px;
		text-align: center;
		padding: 0 4px;
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		font-size: var(--t-2xs);
		color: var(--text-secondary);
	}

	.expandrow td {
		background: var(--surface-sunken);
		padding: var(--s-3) var(--s-4);
	}
	.expand {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.span {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.series {
		display: flex;
		gap: var(--s-5);
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.spark {
		width: 220px;
		height: 40px;
		flex: none;
		background: var(--surface-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
	}
	.l1 {
		fill: none;
		stroke: var(--layer-economic);
		stroke-width: 1.5;
	}
	.l2 {
		fill: none;
		stroke: var(--layer-foreign);
		stroke-width: 1.5;
		opacity: 0.6;
	}
	.mini {
		font-size: var(--t-2xs);
		border-collapse: collapse;
	}
	.mini th {
		text-align: end;
		color: var(--text-faint);
		font-weight: 500;
		padding-block: 1px;
		padding-inline: 0 var(--s-3);
	}
	.mini td {
		text-align: end;
		color: var(--text-secondary);
		padding-block: 1px;
		padding-inline: 0 var(--s-3);
	}

	.fuels {
		display: flex;
		gap: var(--s-4);
		flex-wrap: wrap;
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	.fuel {
		display: inline-flex;
		gap: var(--s-3);
		align-items: baseline;
	}

	.agreements {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		font-size: var(--t-xs);
	}
	.agreements a {
		color: var(--accent);
	}
	.agreements .faint {
		margin-inline-start: var(--s-2);
	}

	.claims {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.cbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: var(--tap);
		padding: var(--s-2) var(--s-4);
		font-size: var(--t-xs);
		border: 1px solid var(--accent-border);
		border-radius: var(--r-md);
		color: var(--accent-text);
		background: var(--accent-muted);
		transition: background var(--dur-fast) var(--ease-out);
	}
	.cbtn:hover {
		background: var(--surface-hover);
	}
	.cbtn.soon {
		cursor: default;
		color: var(--text-secondary);
		background: var(--surface-base);
		border-color: var(--border-default);
		transition: none;
	}
	.chip {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-style: normal;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		padding: 2px 4px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
	}
	.norec {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	.emptyrow td {
		padding: var(--s-6);
		text-align: center;
		color: var(--text-faint);
	}

	.prov {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-4);
		flex-wrap: wrap;
		padding: var(--s-3) var(--s-5);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.prov summary {
		cursor: pointer;
		color: var(--text-faint);
	}
	.prov .src {
		margin-inline-start: auto;
	}

	/* Phone: the priority columns survive, the rest live in the expand. */
	@media (max-width: 640px) {
		.opt-bal,
		.opt-mirror,
		.opt-gap,
		.opt-received,
		.opt-repaid,
		.opt-net,
		.opt-treaties {
			display: none;
		}
		.scroll {
			padding-inline: var(--s-3);
		}
		.controls {
			padding-inline: var(--s-3);
		}
	}
</style>
