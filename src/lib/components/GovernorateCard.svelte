<script lang="ts">
	import { t, tf, nameOf, formatDate, describeInterval, proseList } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { ds, personById, institutionById, type Position } from '$lib/model';
	import { compact } from '$lib/design/media.svelte';
	import { sheetDrag, type SheetDragParams } from '$lib/ui/sheet-drag';
	import { officesAt, officesOver, hasOffice, seatsAt, createdOf, notYet, tenureTag } from '$lib/civic';
	import type { Governorate } from '$lib/world/governorates';
	import { world } from '$lib/world/store.svelte';
	import { goto } from '$app/navigation';

	/** Open the hemicycle with this governorate's seats brought forward. */
	function toSeats() {
		world.focusRegion = gov.id;
		world.setView('parliament');
		void goto('/world?view=parliament', { replaceState: true, keepFocus: true, noScroll: true });
	}

	/**
	 * A governorate at the cursor date: who governed it, and who sat for it.
	 *
	 * Every line is a position record sliced by `app.t`, so scrubbing the time
	 * dock changes the answer with no extra state. Absence is stated, never left
	 * blank: "no record" means the dataset has nothing for this office, and
	 * "no holder on this date" means it has the office but not this stretch of it.
	 * The two are different gaps and the reader should be able to tell them apart.
	 */

	interface Props {
		gov: Governorate;
		onclose: () => void;
		closing?: boolean;
	}

	let { gov, onclose, closing = false }: Props = $props();

	const dragParams: SheetDragParams = {
		enabled: () => compact.current,
		detent: () => 'full',
		setDetent: () => {},
		dismiss: () => onclose(),
		hasPeek: () => false,
		handle: '.sheet-handle'
	};

	const region = $derived(nameOf(ds.regions.find((r) => r.id === gov.region)));
	const record = $derived(ds.regions.find((r) => r.id === gov.id));
	/** Former names and how it was carved out, from the gazetteer's sourced notes. */
	const historyNotes = $derived(record ? proseList(record, 'notes').items : []);
	const created = $derived(createdOf(gov.id));
	const before = $derived(notYet(gov.id, app.t));

	/** The creation token at its own precision: a year stays a year. */
	function when(c: { token: string; earliest: number }): string {
		const p = c.token.length <= 4 ? 'year' : c.token.length <= 7 ? 'month' : 'day';
		return formatDate(c.earliest, p);
	}
	const governors = $derived(officesAt(gov.id, app.t));
	/** Earlier holders, newest first: the record up to the cursor, not after it. */
	const history = $derived.by(() => {
		const now = new Set(governors.map((h) => h.position.id));
		return officesOver(gov.id)
			.filter((p) => !now.has(p.id) && p.interval.startEarliest <= app.t)
			.reverse();
	});
	const tracked = $derived(hasOffice(gov.id));
	const terms = $derived(seatsAt(gov.id, app.t));

	function holder(p: Position): string {
		return nameOf(personById.get(p.holder)) || p.holder;
	}
</script>

{#snippet person(p: Position, at: number)}
	{@const tag = tenureTag(p, at)}
	<li>
		<button class="who" onclick={() => app.select(p.holder)}>{holder(p)}</button>
		<span class="when mono">{describeInterval(p.interval)}</span>
		{#if p.basis !== 'documented'}<i class="chip basis" data-basis={p.basis} title={t('basis.' + p.basis)}>{t('basis.' + p.basis)}</i>{/if}
		{#if p.acting}<i class="chip">{t('gov.acting')}</i>{/if}
		{#if tag}<i class="chip">{tag.key === 'verified' && tag.date ? tf('gov.verified', { date: formatDate(tag.date, 'month') }) : t(`gov.${tag.key}`)}</i>{/if}
	</li>
{/snippet}

<article class="card" class:closing use:sheetDrag={dragParams}>
	<span class="sheet-handle" aria-hidden="true"><i class="sheet-grip"></i></span>
	<div class="body sheet-scroll">
		<header>
			<div class="verb">
				<span class="eyebrow">{t('map.governorate')} · {gov.code}</span>
				<span class="sub mono">{formatDate(app.t, 'month')}</span>
			</div>
			<button class="close" onclick={onclose} aria-label={t('panel.close')}>×</button>
		</header>

		<div>
			<h2 class="title">{nameOf(gov)}</h2>
			{#if region}<p class="sub">{region}</p>{/if}
			{#if created && historyNotes.length === 0}<p class="sub">{tf('gov.created', { date: when(created) })}</p>{/if}
			{#each historyNotes as n (n)}<p class="gap">{n}</p>{/each}
		</div>

		{#if before && created}
			<!-- Before the governorate existed there is no office to fill: saying
			     "no governor known" here would invent a gap in the record. -->
			<p class="notyet">{tf('gov.notyet', { date: when(created) })}</p>
		{:else}

		<section>
			<h3>{t('gov.governor')}</h3>
			{#if !tracked}
				<p class="gap">{t('gov.governor.none')}</p>
			{:else if governors.length === 0}
				<p class="gap">{t('gov.governor.vacant')}</p>
			{:else}
				<ul class="people">
					{#each governors as h (h.position.id)}
						{@render person(h.position, h.at)}
					{/each}
				</ul>
			{/if}
			{#if history.length}
				<details>
					<summary>{tf('gov.history', { n: String(history.length) })}</summary>
					<ul class="people">
						{#each history as p (p.id)}
							{@render person(p, 2)}
						{/each}
					</ul>
				</details>
			{/if}
		</section>

		{/if}

		<section>
			<h3>{t('gov.members')}</h3>
			{#if terms.length === 0}
				<p class="gap">{t('gov.members.none')}</p>
			{/if}
			{#each terms as term (term.role.id)}
				<p class="sub">{nameOf(institutionById.get(term.role.institution)) || nameOf(term.role)}</p>
				{#if term.members.length === 0}
					<p class="gap">{t('gov.members.unsourced')}</p>
				{:else}
					<ul class="people">
						{#each term.members as h (h.position.id)}
							<li>
								<button class="who" onclick={() => app.select(h.position.holder)}>{holder(h.position)}</button>
								<span class="when">{nameOf(h.position.constituency)}</span>
								{#if h.at === 1}<i class="chip">{t('gov.possibly')}</i>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{/each}
			{#if terms.some((x) => x.members.length)}
				<button class="tochamber" onclick={toSeats}>{t('gov.seeseats')}</button>
			{/if}
		</section>

		<p class="prov">{t('map.sources')}: {t('map.basemap')}</p>
	</div>
</article>

<style>
	.card {
		width: min(360px, calc(100vw - var(--s-8)));
		max-height: 100%;
		padding: var(--s-5) var(--s-6) var(--s-6);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
		display: flex;
		flex-direction: column;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
		overflow-y: auto;
		min-height: 0;
	}
	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.verb {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.eyebrow,
	h3 {
		font-size: var(--t-2xs);
		font-weight: 400;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h3 {
		margin-bottom: var(--s-2);
	}
	.sub {
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.title {
		font-size: var(--t-lg);
		font-weight: 600;
		line-height: var(--lh-snug);
		color: var(--text-primary);
	}
	.close {
		font-size: var(--t-lg);
		line-height: 1;
		color: var(--text-muted);
		padding: 0 var(--s-2);
	}
	.close:hover {
		color: var(--text-primary);
	}
	.people {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.people li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-2) var(--s-3);
		font-size: var(--t-sm);
	}
	.who {
		color: var(--text-primary);
		text-align: start;
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 3px;
	}
	.who:hover {
		text-decoration-color: var(--accent);
	}
	.when {
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	details summary {
		font-size: var(--t-xs);
		color: var(--text-secondary);
		cursor: pointer;
		margin-top: var(--s-3);
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	.tochamber {
		margin-top: var(--s-3);
		font-size: var(--t-xs);
		color: var(--accent-text);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.notyet {
		font-size: var(--t-sm);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
		padding: var(--s-3) var(--s-4);
		border: 1px dashed var(--border-strong);
		border-radius: var(--r-md);
	}
	.gap,
	.prov {
		font-size: var(--t-xs);
		line-height: var(--lh-relaxed);
		color: var(--text-faint);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.chip {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-style: normal;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		line-height: 1;
		padding: 2px 4px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
		background: var(--surface-overlay);
	}

	/* Phone: the same one-detent sheet the flow card uses, and thumb-sized names. */
	@media (max-width: 900px) {
		.who {
			min-height: var(--tap);
		}
		.card {
			width: auto;
			padding-top: var(--s-2);
			overflow: hidden;
			transform: translateY(var(--sheet-y, 0px));
			overscroll-behavior: contain;
			animation: sheet-up var(--dur-normal) var(--ease-out);
			transition: transform var(--dur-normal) var(--ease-out);
		}
		.card.closing {
			transform: translateY(100%);
			transition: transform var(--dur-normal) var(--ease-in-out);
		}
		.body {
			flex: 1;
		}
	}
	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
		}
	}
</style>
