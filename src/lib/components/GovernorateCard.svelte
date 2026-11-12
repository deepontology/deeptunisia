<script lang="ts">
	import { t, tf, formatDate, describeInterval } from '$lib/t.svelte';
	import { nameOf, proseList } from '$lib/names.svelte';
	import { app } from '$lib/state.svelte';
	import { ds, personById, institutionById, meetsBasis, type Basis, type Position } from '$lib/model';
	import type { Vacancy } from '$data/index';
	import { compact } from '$lib/design/media.svelte';
	import { sheetDrag, type SheetDragParams } from '$lib/ui/sheet-drag';
	import { officesAt, officesOver, vacanciesAt, vacanciesOver, hasOffice, seatsAt, createdOf, notYet, tenureTag } from '$lib/civic';
	import SourceList from './SourceList.svelte';
	import Prose from '$lib/ui/Prose.svelte';
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
	 * A documented vacancy is a third thing: not a gap at all, but a sourced
	 * statement that nobody held the office titularly (decision 0007). It gets
	 * its own line with its basis and sources, and an acting holder, if any, is
	 * listed under it.
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
	/** A vacancy honours the basis floor like every other claim; below it, it is not shown. */
	const shown = (v: Vacancy) => meetsBasis(v.basis as Basis, app.basisFloor);
	const vacant = $derived(vacanciesAt(gov.id, app.t).filter((s) => shown(s.vacancy)));
	/**
	 * Earlier holders and documented vacancies, newest first: the record up to
	 * the cursor, not after it. A vacancy sits in the succession where it fell.
	 */
	const history = $derived.by(() => {
		const now = new Set([...governors.map((h) => h.position.id), ...vacant.map((s) => s.vacancy.id)]);
		const rows: ({ kind: 'held'; p: Position } | { kind: 'vacant'; v: Vacancy })[] = [
			...officesOver(gov.id).map((p) => ({ kind: 'held' as const, p })),
			...vacanciesOver(gov.id)
				.filter(shown)
				.map((v) => ({ kind: 'vacant' as const, v }))
		];
		const start = (r: (typeof rows)[number]) => (r.kind === 'held' ? r.p : r.v).interval.startEarliest;
		const id = (r: (typeof rows)[number]) => (r.kind === 'held' ? r.p : r.v).id;
		return rows
			.filter((r) => !now.has(id(r)) && start(r) <= app.t)
			.sort((a, b) => start(b) - start(a));
	});
	const heldBefore = $derived(history.filter((r) => r.kind === 'held').length);
	const tracked = $derived(hasOffice(gov.id));
	const terms = $derived(seatsAt(gov.id, app.t));

	function holder(p: Position): string {
		return nameOf(personById.get(p.holder)) || p.holder;
	}
</script>

{#snippet chips(basis: string, at: number)}
	{#if basis !== 'documented'}<i class="chip basis" data-basis={basis} title={t('basis.' + basis)}>{t('basis.' + basis)}</i>{/if}
	{#if at === 1}<i class="chip">{t('gov.possibly')}</i>{/if}
{/snippet}

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
			{:else}
				{#each vacant as s (s.vacancy.id)}
					<div class="vacant" data-basis={s.vacancy.basis}>
						<p class="vacant-head">
							<span class="vacant-label">{t('gov.vacant')}</span>
							<span class="when mono">{describeInterval(s.vacancy.interval)}</span>
							{@render chips(s.vacancy.basis, s.at)}
						</p>
						<p class="vacant-what">{t('gov.vacant.what')}</p>
						<details>
							<summary>{t('gov.vacant.why')}</summary>
							{#if s.vacancy.reasoning}<p class="vacant-why" dir="auto"><Prose record={s.vacancy} field="reasoning" block /></p>{/if}
							{#each proseList(s.vacancy, 'notes').items as n (n)}<p class="gap" dir="auto">{n}</p>{/each}
							<SourceList ids={s.vacancy.sources} compact />
						</details>
					</div>
				{/each}
				{#if governors.length}
					<ul class="people">
						{#each governors as h (h.position.id)}
							{@render person(h.position, h.at)}
						{/each}
					</ul>
				{:else if vacant.length === 0}
					<p class="gap">{t('gov.governor.unrecorded')}</p>
				{/if}
			{/if}
			{#if history.length}
				<details>
					<summary>{tf('gov.history', { n: String(heldBefore) })}</summary>
					<ul class="people">
						{#each history as r (r.kind === 'held' ? r.p.id : r.v.id)}
							{#if r.kind === 'held'}
								{@render person(r.p, 2)}
							{:else}
								<li class="vacant-row">
									<span class="vacant-label">{t('gov.vacant')}</span>
									<span class="when mono">{describeInterval(r.v.interval)}</span>
									{@render chips(r.v.basis, 2)}
								</li>
							{/if}
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
	/* A documented vacancy is a sourced fact, so it is framed like one: a solid
	   rule in the basis colour, unlike the faint text of a gap in the record. */
	.vacant {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-4);
		border: 1px solid var(--border-default);
		border-inline-start: 3px solid var(--basis-reported);
		border-radius: var(--r-md);
		margin-bottom: var(--s-3);
	}
	.vacant[data-basis='documented'] {
		border-inline-start-color: var(--basis-documented);
	}
	.vacant[data-basis='inferred'] {
		border-inline-start-style: dashed;
		border-inline-start-color: var(--basis-inferred);
	}
	.vacant-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-2) var(--s-3);
	}
	.vacant-label {
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--text-primary);
	}
	.vacant-row .vacant-label {
		font-weight: 400;
		color: var(--text-secondary);
	}
	.vacant-what,
	.vacant-why {
		font-size: var(--t-xs);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}
	/* The shared prose style is sized for panels; here it reads at the card's size. */
	.vacant-why :global(.prose) {
		font-size: inherit;
		line-height: inherit;
	}
	.vacant details summary {
		margin-top: 0;
	}
	.vacant details > :global(*:not(summary)) {
		margin-top: var(--s-2);
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
