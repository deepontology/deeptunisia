<script lang="ts">
	import { onMount } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { t, tf } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { titleOf, type RuntimeInstrument, type StudyRecord } from '$lib/research';
	import Barcode from './Barcode.svelte';
	import Stamp from './Stamp.svelte';
	import Grid from './Grid.svelte';
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

	const results = $derived(live?.results ?? null);
	const index = $derived(results?.index ?? null);
	const shown = Tween.of(() => index?.mean ?? 0, { duration: 900, easing: cubicOut });
	const hasIndex = $derived(index !== null && index.mean !== null && (results?.n ?? 0) > 0);

	const open = $derived(liveStatus === 'fielding');
	const waveLabel = $derived(tf('index.wave', { n: '01' }));

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
		hasIndex ? spec.bands.find((b) => index!.mean! >= b.min && (index!.mean! < b.max || b.max === 100)) : null
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

	const hourly = $derived(live?.submissions_per_hour.counts ?? []);
	const hourlyMax = $derived(Math.max(1, ...hourly));

	const regionKeys = ['grand_tunis', 'north_east', 'north_west', 'centre_east', 'centre_west', 'south_east', 'south_west'];
</script>

<!-- The shell is a fixed window; a document page owns its own scroll. -->
<div class="scroll">
<article class="pti" class:rtl={locale === 'ar'}>
	<!-- Masthead: the volume line from the reference, carrying the wave. -->
	<header class="masthead">
		<span class="kicker">{t('index.kicker')}</span>
		<span class="wave mono">
			{waveLabel}
			<span class="chips" aria-hidden="true">
				{#each spec.bands as b, i (b.id)}<span class="chip" style:background="var(--index-band-{i + 1})"></span>{/each}
			</span>
		</span>
	</header>

	<section class="hero">
		<div class="numeral" aria-live="polite">
			{#if hasIndex}
				<span class="digits mono" aria-label={tf('index.headline.aria', { value: fmt(index!.mean) })}>
					{Math.round(shown.current)}
				</span>
			{:else}
				<span class="digits mono empty" aria-label={t('index.headline.none')}>––</span>
			{/if}
		</div>

		<div class="title">
			<h1>{titleOf(study, locale)}</h1>
			<p class="readout mono">
				{#if hasIndex}
					{tf('index.headline.readout', {
						n: fmt(results!.n),
						lo: fmt(index!.ci95?.[0]),
						hi: fmt(index!.ci95?.[1])
					})}
				{:else if open}
					{t('index.headline.waiting')}
				{:else}
					{t('index.headline.notOpen')}
				{/if}
			</p>

			<!-- The scale itself: five bands from police state to guardian, with the
			     wave's position marked when there is one. -->
			<div class="scale" role="img" aria-label={hasIndex ? tf('index.scale.aria', { value: fmt(index!.mean), band: bandLabel(currentBand?.id) }) : t('index.scale.ariaEmpty')}>
				<div class="bands">
					{#each spec.bands as b, i (b.id)}
						<span class="band" class:on={currentBand?.id === b.id} style:background="var(--index-band-{i + 1})"></span>
					{/each}
				</div>
				{#if hasIndex}
					<span class="marker" style:inset-inline-start="{Math.min(100, Math.max(0, index!.mean!))}%"></span>
				{/if}
				<div class="ends">
					<span>0 · {bandLabel(spec.bands[0]?.id)}</span>
					<span>{bandLabel(spec.bands[spec.bands.length - 1]?.id)} · 100</span>
				</div>
			</div>

			<p class="tagline">{t('index.tagline.one')}<br />{t('index.tagline.two')}</p>
			{#if open}
				<a class="cta" href="/research/{study.slug}/participate">{t('index.cta')}</a>
			{/if}
		</div>

		<div class="seal">
			<Stamp
				ring={tf('index.stamp.ring', { wave: waveLabel })}
				center={t('index.stamp.center')}
				live={liveState === 'live' && open}
				joined={locale === 'ar'}
			/>
		</div>
	</section>

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

	{#snippet strip(id: string)}
		{@const summary = results?.items?.[id] ?? null}
		{@const hist = summary?.histogram ?? null}
		{@const peak = hist ? Math.max(1, ...hist) : 1}
		{@const ends = anchors(id)}
		<div class="question">
			<p class="q-text">{itemText(id)}</p>
			<!-- Each strip is scaled to its own fullest answer: the strip shows the
			     shape of one question's answers, and the table carries the counts. -->
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

	{#if (spec.report_items ?? []).length}
		<section class="block">
			<h2>{t('index.context.title')}</h2>
			<p class="note">{t('index.context.lede')}</p>
			{#each spec.report_items ?? [] as id (id)}
				{@render strip(id)}
			{/each}
		</section>
	{/if}

	<section class="block">
		<h2>{t('index.questions.title')}</h2>
		<p class="note">{t('index.questions.lede')}</p>
		{#each scaleItems as id (id)}
			{@render strip(id)}
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
				{:else}
					<p class="note">—</p>
				{/if}
			</div>
		{/each}
	</section>

	<section class="block">
		<h2>{t('index.splits.title')}</h2>
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
		</div>
	</section>

	<section class="block">
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

	{#if liveState === 'offline'}
		<p class="note">{t('index.offline')}</p>
	{/if}
</article>
</div>

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
	}
	.pti {
		--rule: var(--border-default);
		max-width: 72rem;
		margin-inline: auto;
		padding: 1.5rem 1rem 4rem;
		color: var(--text-primary);
	}

	/* ---- masthead ------------------------------------------------------- */
	.masthead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--rule);
		padding-bottom: 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.wave {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		letter-spacing: 0.12em;
	}
	.chips {
		display: inline-flex;
		gap: 2px;
	}
	.chip {
		width: 1.4rem;
		height: 0.45rem;
	}

	/* ---- hero ----------------------------------------------------------- */
	.hero {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 2rem;
		align-items: start;
		padding: 1.8rem 0 1.4rem;
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
	.title h1 {
		font-size: clamp(1.4rem, 2.6vw, 2rem);
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		margin: 0.4rem 0 0.3rem;
	}
	.readout {
		color: var(--text-secondary);
		font-size: 0.9rem;
		margin: 0 0 0.9rem;
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
	.rtl .masthead,
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
	.seal {
		width: 9.5rem;
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
			color-mix(in oklch, var(--index-band-5) calc(var(--share) * 100%), transparent),
			color-mix(in oklch, var(--index-band-5) calc(var(--share) * 100%), transparent)
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

	/* ---- phone ---------------------------------------------------------- */
	@media (max-width: 760px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
		.seal {
			position: absolute;
			inset-inline-end: 1rem;
			width: 6rem;
		}
		.hero {
			position: relative;
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
