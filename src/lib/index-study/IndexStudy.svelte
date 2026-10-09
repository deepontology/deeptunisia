<script lang="ts">
	import { onMount } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { t, tf } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { titleOf, type RuntimeInstrument, type StudyRecord } from '$lib/research';
	import Barcode from './Barcode.svelte';
	import Plate from './Plate.svelte';
	import Ruler from './Ruler.svelte';
	import { fade } from 'svelte/transition';
	import Grid from './Grid.svelte';
	import MonthlyChart from './MonthlyChart.svelte';
	import Content from '$lib/ui/Content.svelte';
	import type { LiveResults } from './live';

	/**
	 * The index study page: a live public instrument, not an article.
	 *
	 * Everything on it is either instrument content (item wording, the formula,
	 * the bands, all hashed with the instrument) or an aggregate from the live
	 * endpoint. Nothing is written here that the data does not say, and every
	 * number sits inside a block that carries the population statement, because
	 * an open online sample describes the people who answered and nobody else.
	 *
	 * While the study is not fielding the page shows the instrument and the
	 * formula with empty readouts. It never shows a placeholder number.
	 */
	let { study, instrument }: { study: StudyRecord; instrument: RuntimeInstrument } = $props();

	const spec = $derived(instrument.scoring!);
	const locale = $derived(app.locale);

	let live = $state<LiveResults | null>(null);
	let liveState = $state<'loading' | 'live' | 'closed' | 'offline'>('loading');
	/** The status the server reports; the build-time registry until it answers. */
	let serverStatus = $state<string | null>(null);
	const liveStatus = $derived(serverStatus ?? study.status);

	const POLL_MS = 30_000;

	async function refresh() {
		try {
			// The live status first: the static page was built from the registry,
			// the server is what decides whether responses are being collected.
			const res = await fetch(`/api/studies/${study.slug}/live`);
			if (res.status === 409 || res.status === 404) {
				liveState = 'closed';
				return;
			}
			if (!res.ok) {
				liveState = 'offline';
				return;
			}
			live = (await res.json()) as LiveResults;
			liveState = 'live';
		} catch {
			liveState = 'offline';
		}
	}

	onMount(() => {
		void refresh();
		void fetch(`/api/studies/${study.slug}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (body?.study?.status) serverStatus = body.study.status;
			})
			.catch(() => {});
		// Poll while the tab is visible; a hidden tab costs the Worker nothing.
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, POLL_MS);
		return () => clearInterval(timer);
	});

	// Three readings of the same answers (index-spec.md §8):
	//   now     the latest month's blended level, the registered headline;
	//   window  every kept answer from the last window_months, counted equally;
	//   all     every kept answer since the start, counted equally.
	// The big number shows one of them, "now" unless the reader picks another.
	// The panels below it (components, grid, bands, questions, breakdowns)
	// always read the window, and the month chart reads one month at a time.
	const months = $derived(live?.series?.months ?? []);
	const latest = $derived(months.length ? months[months.length - 1] : null);
	const previous = $derived.by(() => {
		for (let i = months.length - 2; i >= 0; i--) if (months[i].index.level !== null) return months[i];
		return null;
	});
	let chosen = $state<string | null>(null);
	/** The month the chart has selected; it drives only the month card. */
	const month = $derived(months.find((m) => m.period === chosen) ?? latest);

	const windowAgg = $derived(live?.series?.window ?? null);
	const allTime = $derived(live?.results ?? null);
	const results = $derived(windowAgg?.results ?? allTime);
	const windowMonths = $derived(windowAgg?.months ?? 12);

	// The publication floor (index-spec.md §7). Below it the server sends only
	// counts, and the page shows a counter in place of the number.
	const floor = $derived(live?.floor ?? null);
	const published = $derived(floor?.reached ?? false);

	// The readings arrive in stages, as soon as each can say something the
	// others do not:
	//   one figure      from the first-figure floor: every answer so far;
	//   now + since     once two months have a level, the monthly reading
	//                   differs from the pooled one;
	//   all three       once the series is longer than the window, the last
	//                   window_months differ from all time.
	const levelMonths = $derived(months.filter((m) => m.index.level !== null).length);
	const outgrown = $derived(months.length > windowMonths);
	type ReadingId = 'now' | 'window' | 'all';
	type Reading = { id: ReadingId; value: number | null; ci: [number | null, number | null]; n: number };
	const readings = $derived.by((): Reading[] => {
		if (!published || !allTime) return [];
		const all: Reading = { id: 'all', value: allTime.index.mean, ci: allTime.index.ci95, n: allTime.n };
		if (levelMonths < 2 || !latest || latest.index.level === null) return [all];
		const now: Reading = { id: 'now', value: latest.index.level, ci: latest.index.ci95, n: latest.n };
		const win = windowAgg?.results;
		if (!outgrown || !win) return [now, all];
		return [now, { id: 'window', value: win.index.mean, ci: win.index.ci95, n: win.n }, all];
	});
	let reading = $state<ReadingId | null>(null);
	const active = $derived(readings.find((r) => r.id === reading) ?? readings[0] ?? null);
	const headline = $derived(active?.value ?? null);
	const headlineCi = $derived(active?.ci ?? [null, null]);
	const shown = Tween.of(() => headline ?? 0, { duration: 900, easing: cubicOut });
	const hasIndex = $derived(published && headline !== null);
	/** Month-on-month change belongs to the monthly reading only. */
	const change = $derived(
		active?.id === 'now' && hasIndex && previous?.index.level != null ? headline! - previous.index.level : null
	);
	/** Until the series outgrows the window, "all time" is simply "since launch". */
	const readingKey = (id: ReadingId) => (id === 'all' && !outgrown ? 'since' : id);
	const readingName = (id: ReadingId) => tf(`index.reading.${readingKey(id)}`, { m: windowMonths });

	const open = $derived(liveStatus === 'fielding');

	function monthLabel(period: string, short = false): string {
		const [y, m] = period.split('-').map(Number);
		return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : locale, {
			month: short ? 'short' : 'long',
			year: short ? '2-digit' : 'numeric',
			timeZone: 'UTC'
		}).format(new Date(Date.UTC(y, m - 1, 1)));
	}
	const waveLabel = $derived(
		tf('index.wave', { month: latest ? monthLabel(latest.period) : monthLabel(new Date().toISOString().slice(0, 7)) })
	);

	function bandLabel(id: string | null | undefined): string {
		const band = spec.bands.find((b) => b.id === id);
		if (!band) return '';
		return (locale === 'fr' ? band.label_fr : locale === 'ar' ? band.label_ar : band.label_en) ?? band.label_en ?? band.id;
	}
	function bandDescription(b: (typeof spec.bands)[number]): string {
		return (
			(locale === 'fr' ? b.description_fr : locale === 'ar' ? b.description_ar : b.description_en) ??
			b.description_en ??
			''
		);
	}
	const currentBand = $derived(
		hasIndex ? spec.bands.find((b) => headline! >= b.min && (headline! < b.max || b.max === 100)) : null
	);

	const fmt = (v: number | null | undefined, digits = 0) =>
		v === null || v === undefined || !Number.isFinite(v)
			? '—'
			: new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : locale, {
					maximumFractionDigits: digits,
					minimumFractionDigits: digits
				}).format(v);
	const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmt(v * 100));

	/** Component readouts, in the order the formula reads them. */
	const components = $derived([
		{ id: 'T', key: 'index.component.trust', invert: false, value: results?.components?.T?.mean ?? null },
		{ id: 'G', key: 'index.component.grip', invert: true, value: results?.components?.G?.mean ?? null },
		{ id: 'H', key: 'index.component.harm', invert: true, value: results?.components?.H?.mean ?? null }
	]);

	const itemText = (id: string) => {
		const item = instrument.items.find((i) => i.id === id);
		return item ? (item.text[locale] ?? item.text.en ?? id) : id;
	};
	const anchors = (id: string) => {
		const item = instrument.items.find((i) => i.id === id);
		return item?.anchors?.[locale] ?? item?.anchors?.en ?? null;
	};
	const exclusiveOf = (id: string) => instrument.items.find((i) => i.id === id)?.exclusive ?? [];
	const optionsOf = (id: string) => instrument.items.find((i) => i.id === id)?.options ?? [];
	const optionText = (id: string, option: string) => {
		const item = instrument.items.find((i) => i.id === id);
		return item?.optionLabels?.[locale]?.[option] ?? item?.optionLabels?.en?.[option] ?? option;
	};

	const scaleItems = $derived(
		spec.components.flatMap((c) => (c.kind === 'mean' ? (c.items ?? []) : c.kind === 'scale' && c.item ? [c.item] : []))
	);
	const countItems = $derived(spec.components.flatMap((c) => (c.kind === 'count' && c.item ? [c.item] : [])));
	/** The scale questions grouped by the component they feed: T, G, then H. */
	const questionGroups = $derived.by(() => {
		const of = (id: string) => {
			const c = spec.components.find((x) => x.id === id);
			return c && c.kind === 'mean' ? (c.items ?? []) : [];
		};
		const t = of(spec.plane.x);
		const g = of(spec.plane.y);
		const h = scaleItems.filter((id) => !t.includes(id) && !g.includes(id));
		return [
			{ id: 'T', key: 'index.component.trust', items: t },
			{ id: 'G', key: 'index.component.grip', items: g },
			{ id: 'H', key: 'index.component.harm', items: h }
		].filter((x) => x.items.length);
	});

	const hourly = $derived(live?.submissions_per_hour.counts ?? []);
	const hourlyMax = $derived(Math.max(1, ...hourly));

	const regionKeys = $derived(Object.keys(spec.regions?.groups ?? {}));

	// ---- the page as a numbered record -------------------------------------
	// Each section has a number and a short name. The ruler notches them, and
	// the section bar names the one being read; nothing else announces it.
	let scrollEl = $state<HTMLElement | null>(null);
	const sections = $derived(
		[
			{ id: 'index', key: 'index.section.index' },
			// Data sections exist only once the first figure is published.
			...(published ? [{ id: 'grid', key: 'index.section.grid' }] : []),
			...(published && months.length ? [{ id: 'months', key: 'index.section.months' }] : []),
			{ id: 'method', key: 'index.section.method' },
			{ id: 'questions', key: 'index.section.questions' },
			...(published ? [{ id: 'splits', key: 'index.section.splits' }] : []),
			{ id: 'integrity', key: 'index.section.integrity' },
			{ id: 'record', key: 'index.section.record' },
			{ id: 'answer', key: 'index.section.answer' }
		].map((s, i) => ({ id: s.id, num: String(i + 1).padStart(2, '0'), label: t(s.key) }))
	);
	const sectionOf = (id: string) => sections.find((s) => s.id === id);
	let currentId = $state('index');
	const current = $derived(sectionOf(currentId) ?? sections[0]);

	$effect(() => {
		const el = scrollEl;
		if (!el) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			// The section whose top has passed a line a third of the way down.
			const line = el.getBoundingClientRect().top + el.clientHeight * 0.33;
			let id = sections[0]?.id ?? 'index';
			for (const s of sections) {
				const node = el.querySelector<HTMLElement>(`#${s.id}`);
				if (node && node.getBoundingClientRect().top <= line) id = s.id;
			}
			currentId = id;
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		update();
		return () => {
			cancelAnimationFrame(frame);
			el.removeEventListener('scroll', onScroll);
		};
	});
</script>

{#snippet scope()}
	{#if windowAgg && published}
		<p class="scope mono">
			{tf('index.window.scope', {
				m: windowMonths,
				// A window older than the series starts where the data starts.
				from: monthLabel(months.length && months[0].period > windowAgg.first ? months[0].period : windowAgg.first),
				to: monthLabel(windowAgg.last),
				n: fmt(windowAgg.n)
			})}
		</p>
	{/if}
{/snippet}

{#snippet kicker(id: string)}
	{@const s = sectionOf(id)}
	{#if s}<p class="sec-kicker mono"><span class="sec-num">{s.num}</span><span class="sec-slash">/</span>{s.label}</p>{/if}
{/snippet}

<!-- The shell is a fixed window; a document page owns its own scroll. The
     ruler sits beside the scroll, not inside it, so it never moves. -->
<div class="frame research-type" class:rtl={locale === 'ar'}>
<div class="scroll" bind:this={scrollEl}>
	<!-- The section bar: the one place the page says where the reader is. -->
	<div class="secbar mono">
		{#key current?.id}
			<span class="secbar-now" in:fade={{ duration: 160 }}>
				<span class="sec-num">{current?.num}</span><span class="sec-slash">/</span>{current?.label}
			</span>
		{/key}
		<span class="secbar-id">PSI · {waveLabel}</span>
	</div>
<article class="pti" class:rtl={locale === 'ar'}>
	<!-- Plate 01, edge to edge: the subject before the number. -->
	<Plate
		name="psi-5"
		width={1540}
		height={1026}
		eager
		focus="50% 30%"
		class="plate-hero"
		label="{t('index.fig.label')} 01"
		caption={t('index.fig.one')}
	>
		<!-- The cover: what this is, before the number. Always light on the
		     artwork's black, whatever the page theme. -->
		<div class="cover">
			<p class="cover-kicker mono">{t('index.kicker')} · {t('research.hub.kind.monthly')}</p>
			<h1 class="cover-title">{titleOf(study, locale)}</h1>
			<p class="cover-line">{t('index.cover.line')}</p>
			<p class="cover-meta mono">
				<span class="cover-tag" class:live={open}>
					{#if open}<span class="pulse" aria-hidden="true"></span>{/if}
					{t(open ? 'research.stage.live' : 'research.stage.development')}
				</span>
				{#if latest}<span>{monthLabel(latest.period)}</span>{/if}
				{#if open && floor && !published}<span>{fmt(floor.n)} / {fmt(floor.first_figure_n)}</span>{/if}
			</p>
		</div>
	</Plate>

	<!-- The title band: the number and its name on one full-width plate. -->
	<div class="title-band">

	<section class="hero" id="index">
		<div class="numeral" aria-live="polite">
			{#if hasIndex}
				<span class="digits mono" aria-label={tf('index.headline.aria', { value: fmt(headline) })}>
					{Math.round(shown.current)}
				</span>
			{:else if open && floor}
				<!-- The counter: one square per answer, until the first figure. -->
				<div class="counter" role="img" aria-label={tf('index.counter.aria', { n: fmt(floor.n), N: fmt(floor.first_figure_n) })}>
					{#each Array.from({ length: Math.min(100, floor.first_figure_n) }, (_, i) => i) as i (i)}
						<span class:on={i < Math.round((floor.n / floor.first_figure_n) * Math.min(100, floor.first_figure_n))}></span>
					{/each}
				</div>
			{:else}
				<span class="digits mono empty" aria-label={t('index.headline.none')}>––</span>
			{/if}
		</div>

		<div class="title">
			<p class="readout mono">
				{#if hasIndex}
					{tf('index.headline.readout', {
						state:
							active?.id === 'now'
								? t(latest && latest.closed ? 'index.series.closed' : 'index.series.provisional')
								: readingName(active?.id ?? 'all'),
						n: fmt(active?.n),
						lo: fmt(headlineCi[0]),
						hi: fmt(headlineCi[1])
					})}
					{#if change !== null}
						<span class="change" class:up={change > 0.05} class:down={change < -0.05}>
							{change > 0.05 ? '▲' : change < -0.05 ? '▼' : '■'}
							{tf('index.series.change', {
								delta: (change > 0 ? '+' : '') + fmt(change, 1),
								month: monthLabel(previous!.period)
							})}
						</span>
					{/if}
				{:else if open && floor}
					{tf('index.counter.line', { n: fmt(floor.n), N: fmt(floor.first_figure_n) })}
				{:else}
					{t('index.headline.notOpen')}
				{/if}
			</p>

			<!-- The scale itself: five bands from police state to guardian, with the
			     wave's position marked when there is one. -->
			<div class="scale" role="img" aria-label={hasIndex ? tf('index.scale.aria', { value: fmt(headline), band: bandLabel(currentBand?.id) }) : t('index.scale.ariaEmpty')}>
				<div class="bands">
					{#each spec.bands as b, i (b.id)}
						<span class="band" class:on={currentBand?.id === b.id} style:background="var(--index-band-{i + 1})"></span>
					{/each}
				</div>
				{#if hasIndex}
					<span class="marker" style:inset-inline-start="{Math.min(100, Math.max(0, headline!))}%"></span>
				{/if}
				<div class="ends">
					<span>0 · {bandLabel(spec.bands[0]?.id)}</span>
					<span>{bandLabel(spec.bands[spec.bands.length - 1]?.id)} · 100</span>
				</div>
			</div>

			{#if open && floor && !published}
				<p class="counter-why">{t('index.counter.why')}</p>
			{/if}
			<p class="tagline">{t('index.tagline.one')}<br />{t('index.tagline.two')}</p>
			{#if open}
				<a class="cta" href="/research/{study.slug}/participate">
					{floor && !published
						? tf('index.cta.first', { N: fmt(floor.first_figure_n), n: fmt(instrument.estimatedMinutes) })
						: tf('index.cta', { n: fmt(instrument.estimatedMinutes) })}
				</a>
			{/if}
		</div>

	</section>

	<!-- The three readings. The big number shows the chosen one. -->
	{#if readings.length > 1}
	<div class="readings" role="radiogroup" aria-label={t('index.reading.aria')} style:--count={readings.length}>
		{#each readings as r (r.id)}
			<button
				type="button"
				role="radio"
				aria-checked={active?.id === r.id}
				class="reading"
				class:on={active?.id === r.id}
				onclick={() => (reading = r.id)}
			>
				<span class="r-top">
					<span class="r-label mono">{readingName(r.id)}</span>
					<span class="r-value mono">{r.value === null ? '––' : fmt(r.value)}</span>
				</span>
				<span class="r-desc">{tf(`index.reading.${readingKey(r.id)}.desc`, { m: windowMonths })}</span>
				<span class="r-n mono">n = {fmt(r.n)}</span>
			</button>
		{/each}
	</div>
	{/if}
	</div>


	{#if published}
	<div class="sec" id="grid">
	{@render kicker('grid')}
	{@render scope()}
	<section class="panel-row">
		<!-- The three components as one vertical meter, like the swatch column in
		     the reference. Grip and harm count against the index, so their bars
		     are labelled with the direction they pull. -->
		<div class="meter" aria-label={t('index.components.title')}>
			{#each components as c (c.id)}
				<div class="meter-row">
					<span class="meter-key mono">{c.id}</span>
					<span class="meter-track"><span class="meter-fill" class:against={c.invert} style:height="{(c.value ?? 0) * 100}%"></span></span>
					<span class="meter-value mono">{pct(c.value)}</span>
					<span class="meter-label">{t(c.key)}</span>
				</div>
			{/each}
		</div>


		<figure class="plane-figure">
			<Grid
				grid={results?.plane ?? null}
				meanX={results?.components?.T?.mean ?? null}
				meanY={results?.components?.G?.mean ?? null}
			/>
			<figcaption>{t('index.plane.caption')}</figcaption>
		</figure>
	</section>

	<p class="population">{t('index.population')}</p>
	</div>
	{/if}

	{#if months.length && published}
		<section class="block series" id="months">
			{@render kicker('months')}
			<div class="series-head">
				<h2>{t('index.series.title')}</h2>
				<p class="note">{tf('index.series.lede', { min: live?.series?.settings.min_month_n ?? 30 })}</p>
			</div>
			<MonthlyChart
				{months}
				bands={spec.bands}
				selected={month?.period ?? null}
				onselect={(period) => (chosen = period)}
				{monthLabel}
				{fmt}
			/>
			{#if month}
				<div class="month-readout" aria-live="polite">
					<p class="month-name">
						<strong>{monthLabel(month.period)}</strong>
						<span class="tag" class:live={!month.closed}>{t(month.closed ? 'index.series.closed' : 'index.series.provisional')}</span>
					</p>
					<p>
						{#if month.n === 0}
							{t('index.series.noData')}
						{:else if month.results}
							{tf('index.series.own', { mean: fmt(month.results.index.mean), n: fmt(month.n) })}
						{:else}
							{tf('index.series.few', { n: fmt(month.n), min: fmt(live?.series?.settings.min_month_n ?? 30) })}
						{/if}
					</p>
					<p class="note">
						{#if month.index.gain !== null}
							{tf('index.series.weight', { w: fmt(month.index.gain * 100) })}
						{:else if month.index.level !== null}
							{tf('index.series.carried', { n: fmt(month.n), min: live?.series?.settings.min_month_n ?? 30 })}
						{/if}
					</p>
				</div>
			{/if}
			<details class="table-alt">
				<summary>{t('index.table.show')}</summary>
				<table>
					<thead>
						<tr>
							<th>{t('index.table.month')}</th>
							<th>{t('index.table.level')}</th>
							<th>{t('index.table.interval')}</th>
							<th>{t('index.table.own')}</th>
							<th>{t('index.table.n')}</th>
							<th>{t('index.table.weight')}</th>
						</tr>
					</thead>
					<tbody>
						{#each months as m (m.period)}
							<tr>
								<td>{monthLabel(m.period)}{m.closed ? '' : ` · ${t('index.series.provisional')}`}</td>
								<td class="mono">{fmt(m.index.level, 1)}</td>
								<td class="mono" dir="ltr">{m.index.level === null ? '—' : `${fmt(m.index.ci95[0], 1)}–${fmt(m.index.ci95[1], 1)}`}</td>
								<td class="mono">{fmt(m.results?.index.mean, 1)}</td>
								<td class="mono">{fmt(m.n)}</td>
								<td class="mono">{m.index.gain === null ? '—' : `${fmt(m.index.gain * 100)}%`}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		</section>
	{/if}

	<!-- Plate 02: a barrier, edge to edge, between the readings and the method. -->
	<Plate
		name="psi-6"
		width={1920}
		height={1080}
		focus="50% 35%"
		class="plate-strip"
		label="{t('index.fig.label')} 02"
		caption={t('index.fig.two')}
	/>

	<div class="sec" id="method">
	{@render kicker('method')}

	<section class="facts">
		<div class="fact">
			<h2>{t('index.method.title')}</h2>
			<p>{t('index.method.body')}</p>
			<p class="formula mono" dir="ltr">I = 100 · ( T + (1 − G) + (1 − H) ) / 3</p>
			<p class="note">{t('index.method.components')}</p>
		</div>
		<aside class="card">
			<div class="card-row">
				<span class="card-k">{t('index.card.instrument')}</span>
				<span class="card-v mono">{instrument.id} · {instrument.version}</span>
			</div>
			<div class="card-row">
				<span class="card-k">{t('index.card.received')}</span>
				<span class="card-v mono">{fmt(live?.received ?? null)}</span>
			</div>
			<div class="card-row">
				<span class="card-k">{t('index.card.excluded')}</span>
				<span class="card-v mono">{fmt(live?.exclusions?.rows_excluded ?? null)}</span>
			</div>
			<div class="card-row">
				<span class="card-k">{t('index.card.hash')}</span>
				<Barcode hash={instrument.hash} />
				<span class="card-v mono hash" dir="ltr">{instrument.hash.slice(0, 16)}…</span>
			</div>
		</aside>
	</section>

	<section class="block">
		<h2>{t('index.bands.title')}</h2>
		{@render scope()}
		<ol class="band-list">
			{#each spec.bands as b, i (b.id)}
				<li class:on={currentBand?.id === b.id}>
					<span class="swatch" style:background="var(--index-band-{i + 1})"></span>
					<span class="band-range mono">{b.min}–{b.max}</span>
					<strong>{bandLabel(b.id)}</strong>
					<span class="band-desc">{bandDescription(b)}</span>
					{#if results?.bands}
						<span class="band-n mono">{tf('index.bands.count', { n: fmt(results.bands[b.id] ?? 0) })}</span>
					{/if}
				</li>
			{/each}
		</ol>
	</section>
	</div>

	{#snippet strip(id: string)}
		{@const summary = results?.items?.[id] ?? null}
		{@const hist = summary?.histogram ?? null}
		{@const peak = hist ? Math.max(1, ...hist) : 1}
		{@const ends = anchors(id)}
		<div class="question">
			<p class="q-text">{itemText(id)}</p>
			<!-- Each strip is scaled to its own fullest answer: the strip shows the
			     shape of one question's answers, and the table carries the counts. -->
			{#if hist}
			<div class="strip" dir="ltr" role="img" aria-label={t('index.questions.stripAria')}>
				{#each Array.from({ length: (spec.scale_max ?? 10) + 1 }, (_, v) => v) as v (v)}
					<span class="cell" style:--share={hist ? hist[v] / peak : 0} title="{v}: {hist ? fmt(hist[v]) : '—'}">
						<span class="cell-v mono">{v}</span>
					</span>
				{/each}
			</div>
			{#if ends}
				<div class="strip-ends" dir="ltr">
					<span>{ends.low}</span>
					{#if ends.mid}<span>{ends.mid}</span>{/if}
					<span>{ends.high}</span>
				</div>
			{/if}
			{/if}
			{#if hist}
				<details class="table-alt">
					<summary>{t('index.table.show')}</summary>
					<table>
						<thead><tr><th>{t('index.table.answer')}</th><th>{t('index.table.count')}</th></tr></thead>
						<tbody>
							{#each hist as count, v (v)}<tr><td class="mono">{v}</td><td class="mono">{fmt(count)}</td></tr>{/each}
							<tr><td>{t('index.table.skipped')}</td><td class="mono">{fmt(summary?.skipped ?? 0)}</td></tr>
							{#if summary?.not_shown}
								<tr><td>{t('index.table.notShown')}</td><td class="mono">{fmt(summary.not_shown)}</td></tr>
							{/if}
						</tbody>
					</table>
				</details>
			{/if}
		</div>
	{/snippet}

	<div class="sec" id="questions">
	{@render kicker('questions')}

	<section class="block">
		<h2>{t('index.questions.title')}</h2>
		{@render scope()}
		<p class="note">{t('index.questions.lede')}</p>
		<!-- In the order the formula reads them: what raises the index, then
		     what lowers it. -->
		{#each questionGroups as group (group.id)}
			<h3 class="q-group"><span class="q-group-key mono">{group.id}</span>{t(group.key)}</h3>
			{#each group.items as id (id)}
				{@render strip(id)}
			{/each}
		{/each}

		{#each countItems as id (id)}
			{@const summary = results?.items?.[id] ?? null}
			{@const counts = summary?.counts ?? null}
			{@const asked = summary ? (results?.n_total ?? 0) - summary.not_shown - summary.skipped : 0}
			<div class="question">
				<p class="q-text">{itemText(id)}</p>
				{#if counts}
					<!-- Every option in the order the questionnaire shows it, zeros
					     included. A bar is the share of the people who were asked and
					     answered; a person may tick several, so the shares do not sum. -->
					<table class="options">
						<tbody>
							{#each optionsOf(id) as option (option)}
								{@const n = counts[option] ?? 0}
								<tr>
									<td>{optionText(id, option)}</td>
									<td class="bar-cell"><span class="bar" class:neutral={exclusiveOf(id).includes(option)} style:width="{asked ? (n / asked) * 100 : 0}%"></span></td>
									<td class="mono">{fmt(n)}</td>
								</tr>
							{/each}
							<tr class="aside"><td>{t('index.table.skipped')}</td><td></td><td class="mono">{fmt(summary?.skipped ?? 0)}</td></tr>
							{#if summary?.not_shown}
								<tr class="aside"><td>{t('index.table.notShown')}</td><td></td><td class="mono">{fmt(summary.not_shown)}</td></tr>
							{/if}
						</tbody>
					</table>
				{/if}
			</div>
		{/each}
	</section>

	{#if (spec.report_items ?? []).length}
		<section class="block">
			<h2>{t('index.context.title')}</h2>
			<p class="note">{t('index.context.lede')}</p>
			{#each spec.report_items ?? [] as id (id)}
				{@render strip(id)}
			{/each}
		</section>
	{/if}
	</div>

	{#if published}
	<section class="block" id="splits">
		{@render kicker('splits')}
		<h2>{t('index.splits.title')}</h2>
		{@render scope()}
		<p class="note">{tf('index.splits.floor', { n: spec.cell_floor ?? 20 })}</p>
		<div class="splits">
			<table>
				<caption>{t('index.splits.contact')}</caption>
				<thead><tr><th></th><th>{t('index.table.n')}</th><th>{t('index.table.mean')}</th></tr></thead>
				<tbody>
					{#each ['yes', 'no'] as key (key)}
						{@const cell = results?.splits?.contact?.[key]}
						<tr>
							<td>{optionText('pti_e1', key)}</td>
							<td class="mono">{cell?.suppressed ? t('index.splits.suppressed') : fmt(cell?.n)}</td>
							<td class="mono">{cell?.suppressed ? '' : fmt(cell?.mean)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if results?.splits?.regions}
			<table>
				<caption>{t('index.splits.region')}</caption>
				<thead><tr><th></th><th>{t('index.table.n')}</th><th>{t('index.table.mean')}</th></tr></thead>
				<tbody>
					{#each regionKeys as key (key)}
						{@const cell = results?.splits?.regions?.[key]}
						<tr>
							<td>{t(`index.region.${key}`)}</td>
							<td class="mono">{cell?.suppressed ? t('index.splits.suppressed') : fmt(cell?.n)}</td>
							<td class="mono">{cell?.suppressed ? '' : fmt(cell?.mean)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{/if}
		</div>
		{#if spec.regions}<p class="note">{t('index.splits.regionOptional')}</p>{/if}
	</section>
	{/if}

	<section class="block" id="integrity">
		{@render kicker('integrity')}
		<h2>{t('index.integrity.title')}</h2>
		<p class="note">{t('index.integrity.lede')}</p>
		<div class="hourly" dir="ltr" role="img" aria-label={t('index.integrity.hourlyAria')}>
			{#each hourly as count, i (i)}
				<span class="hour" style:height="{(count / hourlyMax) * 100}%" title="{fmt(count)}"></span>
			{/each}
		</div>
		<p class="axis mono" dir="ltr"><span>−72h</span><span>{t('index.integrity.now')}</span></p>
		{#if live}
			<details class="table-alt">
				<summary>{t('index.table.show')}</summary>
				<table>
					<thead><tr><th>{t('index.integrity.rule')}</th><th>{t('index.table.count')}</th></tr></thead>
					<tbody>
						{#each Object.entries(live.exclusions.rules) as [rule, n] (rule)}
							<tr><td>{t(`index.exclusion.${rule}`)}</td><td class="mono">{fmt(n)}</td></tr>
						{/each}
					</tbody>
				</table>
			</details>
		{/if}
	</section>

	<!-- Long-form statements live in content files (src/content/police-index.*.md),
	     where each locale's provenance is recorded in its front matter. #data is
	     the anchor the consent screen links to. -->
	<div class="sec" id="record">
	{@render kicker('record')}
	{#each ['data', 'limits', 'deviations'] as id (id)}
		<section class="block prose-block" id={id}>
			<Content view="police-index" section={id} />
		</section>
	{/each}
	</div>

	{#if liveState === 'offline'}
		<p class="note">{t('index.offline')}</p>
	{/if}

	<!-- The close: Fig. 03 under the one action the page asks for. -->
	<section class="closing" id="answer">
		{@render kicker('answer')}
		<Plate
			name="psi-9"
			width={1280}
			height={720}
			focus="60% 35%"
			class="plate-closing"
			label="{t('index.fig.label')} 03"
			caption={t('index.fig.three')}
		>
			<div class="closing-copy">
				<p class="closing-line">{t('index.closing.line')}</p>
				{#if open}
					<a class="cta cta-solid" href="/research/{study.slug}/participate">{tf('index.cta', { n: fmt(instrument.estimatedMinutes) })}</a>
					<p class="closing-note mono">{t('index.closing.note')}</p>
				{:else}
					<p class="closing-note mono">{t('index.headline.notOpen')}</p>
				{/if}
			</div>
		</Plate>
	</section>
</article>
</div>
<Ruler scroller={scrollEl} sections={sections} label={t('index.ruler.aria')} />
</div>

<style>
	.frame {
		--ruler: 3.25rem;
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding-inline-end: var(--ruler);
		scroll-behavior: smooth;
	}
	@media (prefers-reduced-motion: reduce) {
		.scroll {
			scroll-behavior: auto;
		}
	}
	.pti {
		--rule: var(--border-default);
		max-width: 72rem;
		margin-inline: auto;
		/* No top padding: plate 01 sits flush under the section bar. */
		padding: 0 1rem 4rem;
		color: var(--text-primary);
	}

	/* ---- the section bar ------------------------------------------------ */
	.secbar {
		position: sticky;
		top: 0;
		z-index: 4;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		height: 2.25rem;
		padding-inline: 1rem;
		border-bottom: 1px solid var(--border-subtle);
		background: color-mix(in oklab, var(--surface-base) 86%, transparent);
		backdrop-filter: blur(8px);
		font-size: 0.6875rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.secbar-now {
		display: inline-flex;
		align-items: baseline;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.secbar-id {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.sec-num {
		color: var(--text-primary);
		font-weight: 600;
	}
	.sec-slash {
		margin-inline: 0.55em;
		color: var(--text-faint);
	}
	.sec-kicker {
		display: flex;
		align-items: baseline;
		margin: 3.5rem 0 1.25rem;
		padding-top: 0.65rem;
		border-top: 1px solid var(--rule);
		font-size: 0.6875rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.rtl .secbar,
	.rtl .sec-kicker {
		letter-spacing: 0;
	}
	/* The kicker carries the section's rule; the block under it does not repeat it. */
	.block:has(> .sec-kicker),
	.sec-kicker + .block,
	.sec-kicker + .facts {
		border-top: 0;
		margin-top: 0;
		padding-top: 0;
	}

	/* ---- plates and the title band ----------------------------------- */
	/* The page is a size container so a plate can run edge to edge from
	   inside the reading column (Plate.svelte uses cqw). */
	.scroll {
		container-type: inline-size;
	}
	.pti :global(.plate-hero) {
		--plate-h: min(74vh, 56cqw);
	}
	.pti :global(.plate-strip) {
		--plate-h: clamp(15rem, 44vh, 30rem);
		margin-top: 4rem;
	}
	.pti :global(.plate-closing) {
		--plate-h: min(86vh, 60cqw);
		margin-top: 1.25rem;
	}
	/* The band carries the number: the theme colour, mixed into the page,
	   edge to edge like the plates above and below it. */
	.title-band {
		width: 100cqw;
		margin-inline: calc(50% - 50cqw);
		margin-top: 1.5rem;
		padding: 1.6rem max(1rem, calc((100cqw - 72rem) / 2 + 1rem)) 2.4rem;
		background: color-mix(in oklab, var(--accent) 13%, var(--surface-base));
		border-block: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
	}

	/* ---- the cover on plate 01 ------------------------------------------- */
	.cover {
		/* The cover always sits on the artwork's black, so it takes the dark
		   theme's accent lightness whatever the page theme is. */
		--cover-accent: oklch(78% 0.13 var(--accent-h));
		position: absolute;
		inset: auto 0 0 0;
		padding: 7rem max(1rem, calc((100cqw - 72rem) / 2 + 1rem)) 1.8rem;
		background: linear-gradient(to top, rgb(0 0 0 / 0.9) 30%, rgb(0 0 0 / 0.55) 65%, rgb(0 0 0 / 0));
		color: #f4f4f2;
	}
	.cover-kicker {
		margin: 0 0 0.7rem;
		font-size: 0.6875rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--cover-accent);
	}
	.cover-title {
		margin: 0;
		max-width: 16ch;
		font-size: clamp(2.2rem, 5.6vw, 4.8rem);
		line-height: 0.98;
		font-weight: 700;
		letter-spacing: -0.01em;
		text-transform: uppercase;
	}
	.cover-line {
		margin: 0.9rem 0 1.1rem;
		max-width: 46ch;
		font-family: var(--font-serif);
		font-size: clamp(1.05rem, 1.7vw, 1.3rem);
		line-height: 1.4;
		color: rgb(244 244 242 / 0.88);
	}
	.cover-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.1rem;
		margin: 0;
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgb(244 244 242 / 0.75);
	}
	.cover-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid rgb(244 244 242 / 0.45);
		color: #f4f4f2;
	}
	.cover-tag.live {
		background: var(--cover-accent);
		border-color: var(--cover-accent);
		color: #0b0b0b;
	}
	.pulse {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
		}
	}
	.rtl .cover-kicker,
	.rtl .cover-meta,
	.rtl .cover-title {
		letter-spacing: 0;
	}
	.rtl .cover-line {
		font-family: var(--font-sans);
	}

	/* ---- the close ------------------------------------------------------ */
	/* Over the artwork the copy is always light on dark: the plate is black
	   in both themes, so the text does not follow the page theme here. */
	.closing-copy {
		position: absolute;
		inset: auto 0 0 0;
		padding: 6rem max(1rem, calc((100cqw - 72rem) / 2 + 1rem)) 2rem;
		background: linear-gradient(to top, rgb(0 0 0 / 0.92) 40%, rgb(0 0 0 / 0));
		color: #f4f4f2;
	}
	.closing-line {
		font-family: var(--font-serif);
		font-size: clamp(1.5rem, 3.6vw, 2.4rem);
		line-height: 1.15;
		max-width: 30ch;
		margin: 0 0 1.1rem;
		color: #f4f4f2;
	}
	.rtl .closing-line {
		font-family: var(--font-sans);
		font-weight: 600;
	}
	.closing-note {
		margin: 0.8rem 0 0;
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgb(244 244 242 / 0.72);
	}
	.cta.cta-solid {
		border-color: #f4f4f2;
		background: #f4f4f2;
		color: #0b0b0b;
		padding: 0.75rem 1.2rem;
	}
	.cta.cta-solid:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}


	/* ---- hero ----------------------------------------------------------- */
	.hero {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas: 'num title';
		column-gap: 3rem;
		row-gap: 0.5rem;
		align-items: start;
		padding: 2rem 0 0;
	}
	.numeral {
		grid-area: num;
	}
	.title {
		grid-area: title;
	}
	.digits {
		display: block;
		font-size: clamp(6rem, 17vw, 13rem);
		line-height: 0.82;
		letter-spacing: -0.06em;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
		filter: url(#pti-grain);
	}
	.digits.empty {
		color: var(--text-faint);
	}
	.readout {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin: 0 0 0.9rem;
	}
	.change {
		display: inline-block;
		margin-inline-start: 0.5rem;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.change.up {
		color: var(--index-band-5);
	}
	.change.down {
		color: var(--index-band-1);
	}

	/* ---- the counter, before the first figure --------------------------- */
	.counter {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 3px;
		width: clamp(8rem, 15vw, 11.5rem);
		aspect-ratio: 1;
	}
	.counter span {
		background: color-mix(in oklab, var(--accent) 10%, var(--surface-sunken));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 22%, transparent);
	}
	.counter span.on {
		background: var(--accent);
		box-shadow: none;
	}
	.counter-why {
		max-width: 42ch;
		margin: 0 0 1rem;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	/* ---- the three readings ------------------------------------------- */
	.readings {
		display: grid;
		/* As many columns as there are readings at this stage: two, then three. */
		grid-template-columns: repeat(var(--count, 3), minmax(0, 1fr));
		gap: 1px;
		margin-top: 2rem;
		background: color-mix(in oklab, var(--accent) 30%, transparent);
		border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
	}
	.reading {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.9rem 1rem 0.85rem;
		border: 0;
		background: color-mix(in oklab, var(--accent) 6%, var(--surface-base));
		color: var(--text-primary);
		text-align: start;
		font: inherit;
		cursor: pointer;
		position: relative;
		-webkit-tap-highlight-color: transparent;
	}
	.reading.on {
		background: color-mix(in oklab, var(--accent) 18%, var(--surface-base));
	}
	.reading.on::before {
		content: '';
		position: absolute;
		inset: 0 0 auto 0;
		height: 3px;
		background: var(--accent);
	}
	@media (hover: hover) {
		.reading:hover {
			background: color-mix(in oklab, var(--accent) 12%, var(--surface-base));
		}
	}
	.reading:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.r-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.r-label {
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.reading.on .r-label {
		color: var(--text-primary);
		font-weight: 600;
	}
	.r-value {
		font-size: 1.6rem;
		line-height: 1;
	}
	.r-desc {
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text-secondary);
	}
	.r-n {
		font-size: 0.625rem;
		color: var(--text-faint);
	}
	.rtl .r-label {
		letter-spacing: 0;
	}
	.scope {
		margin: -0.4rem 0 1rem;
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	/* ---- the monthly series -------------------------------------------- */
	.series-head {
		margin-bottom: 1rem;
	}
	.month-readout {
		margin-top: 1rem;
		padding: 0.9rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border-subtle);
		border-inline-start: 3px solid var(--accent);
	}
	.month-readout p {
		margin: 0 0 0.35rem;
	}
	.month-readout p:last-child {
		margin-bottom: 0;
	}
	.month-name {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.tag {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		color: var(--text-secondary);
	}
	.tag.live {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-text);
	}
	.rtl .tag {
		letter-spacing: 0;
	}
	.scale {
		position: relative;
		max-width: 26rem;
		margin-bottom: 1rem;
	}
	.bands {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 2px;
		height: 0.7rem;
	}
	.band {
		opacity: 0.55;
	}
	.band.on {
		opacity: 1;
	}
	.marker {
		position: absolute;
		top: -0.3rem;
		width: 2px;
		height: 1.3rem;
		margin-inline-start: -1px;
		background: var(--text-primary);
	}
	.ends {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
		margin-top: 0.4rem;
	}
	.tagline {
		font-size: 0.78rem;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		color: var(--text-secondary);
		line-height: 2;
		margin: 0 0 1rem;
	}
	.rtl .tagline,
	.rtl .ends {
		letter-spacing: 0;
	}
	.cta {
		display: inline-block;
		padding: 0.55rem 1rem;
		border: 1px solid var(--text-primary);
		border-radius: var(--r-sm);
		color: var(--text-primary);
		text-decoration: none;
		font-weight: 600;
	}
	.cta:hover {
		background: var(--surface-hover);
	}

	/* ---- the panel row -------------------------------------------------- */
	.panel-row {
		display: grid;
		grid-template-columns: 11rem 1fr;
		gap: 1.5rem;
		align-items: stretch;
	}
	.meter {
		display: grid;
		grid-template-rows: repeat(3, 1fr);
		gap: 2px;
	}
	.meter-row {
		display: grid;
		grid-template-columns: 1.4rem 1rem 1fr;
		grid-template-rows: auto auto;
		column-gap: 0.5rem;
		align-items: end;
		background: var(--surface-sunken);
		padding: 0.6rem;
	}
	.meter-key {
		grid-row: 1 / 3;
		align-self: start;
		color: var(--text-faint);
	}
	.meter-track {
		grid-row: 1 / 3;
		position: relative;
		height: 100%;
		min-height: 4.5rem;
		background: var(--surface-base);
	}
	.meter-fill {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		background: var(--index-band-5);
	}
	.meter-fill.against {
		background: var(--index-band-1);
	}
	.meter-value {
		font-size: 1.4rem;
	}
	.meter-label {
		font-size: 0.72rem;
		color: var(--text-secondary);
	}
	.plane-figure {
		margin: 0;
		min-width: 0;
	}
	.plane-figure figcaption,
	.population {
		font-size: 0.8rem;
		color: var(--text-faint);
		margin-top: 0.5rem;
	}
	.population {
		border-inline-start: 2px solid var(--rule);
		padding-inline-start: 0.7rem;
		margin: 1.2rem 0 0;
	}

	/* ---- facts row ------------------------------------------------------ */
	.facts {
		display: grid;
		grid-template-columns: 1fr 22rem;
		gap: 2rem;
		border-top: 1px solid var(--rule);
		margin-top: 1.8rem;
		padding-top: 1.4rem;
	}
	.fact h2,
	.block h2 {
		font-size: 1.1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 0.6rem;
	}
	.formula {
		font-size: 1rem;
		padding: 0.6rem 0.8rem;
		background: var(--surface-sunken);
		border-radius: var(--r-sm);
		overflow-x: auto;
	}
	.note {
		color: var(--text-faint);
		font-size: 0.86rem;
	}
	.card {
		border: 1px solid var(--rule);
		padding: 0.4rem 0.9rem;
	}
	.card-row {
		display: grid;
		gap: 0.15rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.card-row:last-child {
		border-bottom: 0;
	}
	.card-k {
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.card-v {
		font-size: 0.86rem;
	}
	.hash {
		color: var(--text-faint);
	}

	/* ---- blocks --------------------------------------------------------- */
	.block {
		border-top: 1px solid var(--rule);
		margin-top: 2rem;
		padding-top: 1.4rem;
	}
	.band-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 2px;
	}
	.band-list li {
		display: grid;
		grid-template-columns: 0.8rem 4rem 9rem 1fr auto;
		gap: 0.8rem;
		align-items: baseline;
		padding: 0.55rem 0.6rem;
		background: var(--surface-sunken);
	}
	.band-list li.on {
		outline: 1px solid var(--text-primary);
	}
	.swatch {
		width: 0.8rem;
		height: 0.8rem;
		align-self: center;
	}
	.band-range,
	.band-n {
		color: var(--text-faint);
		font-size: 0.82rem;
	}
	.band-desc {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}
	.q-group {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin: 2rem 0 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px dashed var(--border-default);
		font-size: 0.95rem;
		font-weight: 600;
	}
	.q-group-key {
		font-size: 0.75rem;
		color: var(--accent);
	}
	.question {
		margin: 1.2rem 0 0;
	}
	.q-text {
		margin: 0 0 0.45rem;
		font-weight: 500;
	}
	.strip {
		display: grid;
		grid-template-columns: repeat(11, 1fr);
		gap: 2px;
		max-width: 36rem;
	}
	.cell {
		position: relative;
		height: 2.1rem;
		background: var(--surface-sunken);
		background-image: linear-gradient(
			color-mix(in oklab, var(--accent) calc(var(--share) * 100%), transparent),
			color-mix(in oklab, var(--accent) calc(var(--share) * 100%), transparent)
		);
		border-radius: 2px;
	}
	.cell-v {
		position: absolute;
		bottom: 0.15rem;
		inset-inline-start: 0.25rem;
		font-size: 0.62rem;
		color: var(--text-faint);
	}
	.strip-ends {
		display: flex;
		justify-content: space-between;
		max-width: 36rem;
		font-size: 0.74rem;
		color: var(--text-faint);
		margin-top: 0.25rem;
	}
	.table-alt {
		margin-top: 0.4rem;
		font-size: 0.82rem;
	}
	.table-alt summary {
		cursor: pointer;
		color: var(--text-secondary);
	}
	table {
		border-collapse: collapse;
		font-size: 0.86rem;
	}
	th,
	td {
		text-align: start;
		padding: 0.25rem 0.9rem 0.25rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	caption {
		text-align: start;
		font-weight: 600;
		padding-bottom: 0.4rem;
	}
	.options {
		width: 100%;
		max-width: 40rem;
	}
	.options .bar-cell {
		width: 45%;
	}
	.bar {
		display: block;
		height: 0.55rem;
		background: var(--index-band-1);
		border-radius: 0 2px 2px 0;
	}
	/* "None of these" is an answer, not a harm: it never wears the harm colour. */
	.bar.neutral {
		background: var(--text-faint);
	}
	.options .aside td {
		color: var(--text-faint);
	}
	.splits {
		align-items: start;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 2rem;
	}
	.hourly {
		display: flex;
		align-items: flex-end;
		gap: 1px;
		height: 4rem;
		background: var(--surface-sunken);
		padding: 0.3rem;
	}
	.hour {
		flex: 1;
		min-height: 1px;
		background: var(--text-secondary);
	}
	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: var(--text-faint);
		margin: 0.3rem 0 0;
	}

	.prose-block {
		max-width: 46rem;
	}
	/* The content files' headings take the same register as every other
	   section heading on the page. */
	.prose-block :global(h2) {
		font-size: 1.1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 0.8rem;
	}
	.rtl .prose-block :global(h2) {
		letter-spacing: 0;
	}

	/* ---- phone ---------------------------------------------------------- */
	@media (max-width: 760px) {
		.frame {
			--ruler: 0.9rem;
		}
		.readings {
			grid-template-columns: 1fr;
		}
		.secbar-id {
			display: none;
		}
		.hero {
			grid-template-columns: 1fr;
			grid-template-areas: 'num' 'title';
			row-gap: 1rem;
			padding-top: 1.25rem;
		}
		.pti :global(.plate-hero) {
			--plate-h: 58vh;
		}
		/* On a phone the street is a tall crop; it holds to the right so the
		   face of the man shouting stays in frame. */
		.pti :global(.plate-closing) {
			--plate-h: 82vh;
			--plate-focus: 80% 35%;
		}
		.panel-row,
		.facts {
			grid-template-columns: 1fr;
		}
		.meter {
			grid-template-rows: none;
			grid-template-columns: repeat(3, 1fr);
		}
		.band-list li {
			grid-template-columns: 0.8rem 3.4rem 1fr;
		}
		.band-desc,
		.band-n {
			grid-column: 2 / -1;
		}
	}
</style>

<!-- Letterpress grain for the numeral: a light displacement, so the digits read
     as printed rather than rendered. Purely visual; the number is in the DOM. -->
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
	<filter id="pti-grain">
		<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
		<feDisplacementMap in="SourceGraphic" scale="2.2" />
	</filter>
</svg>
