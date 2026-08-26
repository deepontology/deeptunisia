<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { applyEntityLink } from '$lib/deeplink.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Content from '$lib/ui/Content.svelte';
	import {
		BASIS_COLOR,
		BASIS_SHORT,
		CUTOFF,
		LAYER_COLOR,
		ds,
		institutionById,
		meetsBasis,
		personById,
		type Basis,
		type Layer
	} from '$lib/model';
	import { t, durationLabel, formatDate, nameOf} from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { currencyOf, elapsedYears, monthsSince, tenureByRole, type Currency } from '$lib/tenure';

	/**
	 * The present slice: who holds what today.
	 *
	 * Almost all of this is data the project already had — 29 positions recorded as
	 * ongoing — but it was only reachable by scrubbing a timeline to the end. Making
	 * it a view of its own is what turns the atlas into something worth opening on a
	 * weekday.
	 *
	 * Two decisions carry the page.
	 *
	 * First, currency is never flattened. `ongoing`, `last-verified` and `unknown`
	 * are shown as three separate tiers, because merging them would make the page
	 * most confidently wrong exactly where the dataset is weakest: nearly every
	 * senior security post is `last-verified`, not confirmed. A reader deserves to
	 * see that the police and intelligence rows are the stale ones.
	 *
	 * Second, each holder is measured against their own office's historical median
	 * tenure. "In post 1y 2m, median for this office is 1y 5m" is a fact the dataset
	 * can support and no other source about Tunisia publishes. It is emphatically NOT
	 * a prediction — an office being "overdue" forecasts nothing, and the page says
	 * so rather than letting the comparison imply it.
	 */

	const TIER: { key: Currency; label: string; note: string; tint: string }[] = [
		{
			key: 'ongoing',
			label: t('now.tier.ongoing'),
			note: t('now.tier.ongoing.note'),
			tint: 'var(--basis-documented)'
		},
		{
			key: 'last-verified',
			label: t('now.tier.lastverified'),
			note: t('now.tier.lastverified.note'),
			tint: 'var(--basis-reported)'
		},
		{
			key: 'unknown',
			label: t('now.tier.unknown'),
			note: t('now.tier.unknown.note'),
			tint: 'var(--basis-inferred)'
		}
	];

	const tenure = $derived(tenureByRole(ds.positions));

	interface Row {
		id: string;
		person: string;
		personId: string;
		role: string;
		roleTitle: string;
		institution: string;
		layer: Layer;
		basis: Basis;
		authority: number;
		acting: boolean;
		elapsed: number;
		currency: Currency;
		staleMonths: number | null;
		median: number | null;
		ratio: number | null;
	}

	const rows = $derived.by((): Row[] => {
		const out: Row[] = [];
		for (const p of ds.positions) {
			const currency = currencyOf(p);
			if (!currency) continue;
			if (!meetsBasis(p.basis as Basis, app.basisFloor)) continue;
			if (!app.activeLayers.has(p.layer as Layer)) continue;

			const stats = tenure.get(p.role);
			const elapsed = elapsedYears(p.interval.startEarliest);

			out.push({
				id: p.id,
				person: nameOf(personById.get(p.holder)) ?? p.holder,
				personId: p.holder,
				role: p.role,
				roleTitle: p.roleTitle,
				institution: nameOf(institutionById.get(p.institution)) ?? '',
				layer: p.layer as Layer,
				basis: p.basis as Basis,
				authority: p.authority,
				acting: p.acting,
				elapsed,
				currency,
				staleMonths: monthsSince(p.interval.raw.end),
				median: stats?.median ?? null,
				ratio: stats && stats.median > 0 ? elapsed / stats.median : null
			});
		}
		return out.sort((a, b) => b.authority - a.authority || b.elapsed - a.elapsed);
	});

	const byTier = $derived(
		TIER.map((t) => ({ ...t, rows: rows.filter((r) => r.currency === t.key) }))
	);

	/**
	 * Offices that have had holders but show nobody open right now. Published for the
	 * same reason succession gaps are: a hole the reader can see is worth more than a
	 * tidy page that implies the map is complete.
	 */
	const silent = $derived.by(() => {
		const open = new Set(rows.map((r) => r.role));
		const seen = new Map<string, { title: string; layer: Layer; last: number }>();
		for (const p of ds.positions) {
			if (open.has(p.role)) continue;
			if (!app.activeLayers.has(p.layer as Layer)) continue;
			const end = p.interval.endLatest ?? p.interval.startEarliest;
			const prev = seen.get(p.role);
			if (!prev || end > prev.last) {
				seen.set(p.role, { title: p.roleTitle, layer: p.layer as Layer, last: end });
			}
		}
		return [...seen.entries()]
			.map(([role, v]) => ({ role, ...v }))
			.sort((a, b) => b.last - a.last)
			.slice(0, 24);
	});

	const asOf = $derived(formatDate(CUTOFF, 'day'));

	/**
	 * This view is pinned to the cutoff, and the timeline dock is not.
	 *
	 * Left alone the two contradict each other on screen — the dock reading January
	 * 2011 above a page headed "as of July 2026" — so arriving here moves the playhead
	 * to the present. That is a deliberate side effect on shared state: every other
	 * view is a projection of the scrubbed instant, and this one is a projection of a
	 * fixed one, so something has to give and it should be the thing the reader did
	 * not ask for.
	 *
	 * Set in onMount rather than an effect on purpose. Writing app.t inside an effect
	 * that also reads it self-triggers, and this project has already lost an entire
	 * render tree to exactly that mistake — see the traps in HANDOFF.md.
	 */
	onMount(() => {
		if (app.t !== CUTOFF) app.setDate(CUTOFF);
	});

	/** Scrubbing away is allowed; it just does not drive this view, so say so. */
	const scrubbedAway = $derived(Math.abs(app.t - CUTOFF) > 86_400_000);

	/**
	 * W2 deep link: `?id=` selects a holder on arrival. The selection is global,
	 * so the Inspector opens and the row highlights on its own; this only applies
	 * the id. One-shot, like the Network's deepLinked.
	 */
	let deepLinked = false;
	$effect(() => {
		if (!deepLinked && applyEntityLink()) deepLinked = true;
	});

	function ratioLabel(r: Row): string {
		if (r.ratio === null || r.median === null) return '';
		const key = r.ratio >= 1.6 ? 'wellpast' : r.ratio >= 1.15 ? 'past' : r.ratio <= 0.4 ? 'early' : 'around';
		return format(app.locale, 'now.ratio.' + key);
	}
</script>

<div class="now">
	<div class="toolbar">
		<span class="eyebrow">{t('now.eyebrow')}</span>
		<p class="hint">
			{format(app.locale, 'now.hint', { asOf })}
		</p>
		{#if scrubbedAway}
			<span class="pinned">
				{format(app.locale, 'now.pinned', { asOf })}
				<Button size="xs" variant="ghost" onclick={() => app.setDate(CUTOFF)}>{t('now.reset')}</Button>
			</span>
		{/if}
	</div>

	<div class="scroll">
		<section class="intro">
			<Content view="now" section="intro" />
		</section>

		{#each byTier as tier (tier.key)}
			{#if tier.rows.length}
				<section>
					<header>
						<h2>
							<Chip tint={tier.tint} dot>{tier.label}</Chip>
							<span class="count">{tier.rows.length}</span>
						</h2>
						<p>{tier.note}</p>
					</header>

					<ol class="holders">
						{#each tier.rows as r (r.id)}
							<li
								class:sel={app.selected === r.personId}
								style:--c={LAYER_COLOR[r.layer]}
							>
								<button
									class="who"
									onclick={() => app.select(r.personId)}
									aria-label={format(app.locale, 'now.select', { person: r.person })}
								>
									<i class="dot"></i>
									<span class="name">{r.person}</span>
									{#if r.acting}
										<Tooltip content={t('now.acting.title')}>
											<span class="acting">{t('now.acting')}</span>
										</Tooltip>
									{/if}
								</button>

								<span class="office">
									<span class="role">{r.roleTitle}</span>
									{#if r.institution}<span class="inst">{r.institution}</span>{/if}
								</span>

								<span class="basis">
									<Chip tint={BASIS_COLOR[r.basis]} dot size="xs">{BASIS_SHORT[r.basis]}</Chip>
								</span>

								<span class="elapsed">{durationLabel(r.elapsed)}</span>

								<span class="vs">
									{#if r.median !== null}
										<span class="vs-word">{ratioLabel(r)}</span>
										<span class="vs-num">{format(app.locale, 'now.median', { duration: durationLabel(r.median) })}</span>
									{:else}
										<Tooltip content={t('now.nomedian')}>
											<span class="vs-none">—</span>
										</Tooltip>
									{/if}
								</span>

								{#if r.staleMonths !== null}
									<span class="stale" class:old={r.staleMonths >= 12}>
										{format(app.locale, 'now.verified', { n: r.staleMonths })}
									</span>
								{:else}
									<span class="stale"></span>
								{/if}
							</li>
						{/each}
					</ol>
				</section>
			{/if}
		{/each}

		<section>
			<header>
				<h2>{t('now.silent')} <span class="count">{silent.length}</span></h2>
				<Content view="now" section="silent" />
			</header>
			<ul class="silent">
				{#each silent as s (s.role)}
					<li style:--c={LAYER_COLOR[s.layer]}>
						<i class="dot"></i>
						<span class="role">{s.title}</span>
						<span class="when">{new Date(s.last).getUTCFullYear()}</span>
					</li>
				{/each}
			</ul>
		</section>

		<div class="foot"><Content view="now" section="foot" /></div>
	</div>
</div>

<style>
	.now {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.toolbar {
		display: flex;
		align-items: baseline;
		gap: var(--s-5);
		padding: var(--s-4) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}
	.hint {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.pinned {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		margin-inline-start: auto;
		font-size: var(--t-2xs);
		color: var(--basis-inferred);
		white-space: nowrap;
	}
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: var(--s-6) var(--s-6) var(--s-11);
	}

	section {
		margin-block-end: var(--s-8);
		max-width: 1180px;
	}
	/* The intro paragraph now comes from the content files (Content.svelte) —
	   its typography lives there; this keeps the section's own rhythm. */
	.intro :global(.content p) {
		max-width: 84ch;
		margin: 0 0 var(--s-6);
		font-size: var(--t-sm);
		line-height: 1.7;
		color: var(--text-secondary);
	}
	header h2 {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		font-family: var(--font-serif);
		font-size: var(--t-lg);
		font-weight: 500;
		margin: 0 0 var(--s-3);
	}
	header p {
		max-width: 84ch;
		margin: 0 0 var(--s-5);
		font-size: var(--t-xs);
		line-height: 1.6;
		color: var(--text-muted);
	}
	.count {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}

	.holders {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1px;
		background: var(--border-subtle);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		overflow: hidden;
	}
	.holders li {
		display: grid;
		grid-template-columns:
			minmax(150px, 20ch) minmax(180px, 1fr) 5.5ch 6ch minmax(120px, 15ch)
			minmax(0, 13ch);
		align-items: center;
		gap: var(--s-4);
		padding: var(--s-3) var(--s-5);
		background: var(--surface-raised);
		font-size: var(--t-xs);
		border-inline-start: 2px solid transparent;
		transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
	}
	.holders li:hover {
		background: var(--surface-hover);
	}
	.holders li.sel {
		background: var(--surface-active);
		border-inline-start-color: var(--c);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		color: var(--text-primary);
		text-align: start;
		min-width: 0;
	}
	.who:hover .name {
		text-decoration: underline;
	}
	.who:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--r-xs);
	}
	.dot {
		inline-size: 6px;
		block-size: 6px;
		border-radius: 2px;
		background: var(--c);
		flex-shrink: 0;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.acting {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--basis-inferred);
		flex-shrink: 0;
	}

	.office {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.office .role {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.office .inst {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.elapsed {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: end;
		color: var(--text-primary);
	}

	.vs {
		display: flex;
		flex-direction: column;
		line-height: 1.35;
		min-width: 0;
	}
	.vs-word {
		font-size: var(--t-2xs);
		color: var(--text-secondary);
	}
	.vs-num,
	.vs-none {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	.stale {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		text-align: end;
		white-space: nowrap;
	}
	/* A verification more than a year old is doing very little work; say so. */
	.stale.old {
		color: var(--basis-inferred);
	}

	.silent {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1px 0;
	}
	.silent li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-3) 0;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		border-bottom: 1px solid var(--border-subtle);
		padding-inline-end: var(--s-6);
	}
	.silent .role {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.silent .when {
		margin-inline-start: auto;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	.foot {
		max-width: 84ch;
		font-size: var(--t-xs);
		line-height: 1.7;
		color: var(--text-muted);
	}

	@media (max-width: 900px) {
		.holders li {
			grid-template-columns: 1fr auto;
			row-gap: var(--s-2);
			padding: var(--s-4) var(--s-5);
		}
		.office {
			grid-column: 1 / -1;
			margin-top: var(--s-2);
			padding-top: var(--s-3);
			border-top: 1px solid var(--border-subtle);
		}
		.vs,
		.stale {
			grid-column: 1 / -1;
		}
	}
</style>
