<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { t, tf, nameOf, formatDate } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { ds, personById, institutionById, activity, type Institution, type Position, type Role } from '$lib/model';
	import { termAt, membersAt, tenureTag } from '$lib/civic';
	import { world } from '$lib/world/store.svelte';
	import { goto } from '$app/navigation';

	/**
	 * The state on the cursor date, as a chain of command drawn top to bottom.
	 *
	 * WHERE THE LINES COME FROM
	 *
	 * Each institution in the dataset names its parent. The presidency is the
	 * root; its children are the second row (the head of government in the
	 * middle, the ministries the presidency keeps on one side, its own services
	 * on the other); everything below hangs from those. Every name is a position
	 * record active on the date. The tree itself is not yet dated by
	 * constitution, and the view says so.
	 *
	 * WHY A BOX BELONGS TO AN OFFICE, NOT A PERSON
	 *
	 * Scrubbing the timeline used to reflow the whole view: a minister leaving
	 * removed a line, a reshuffle reordered the list. Now the set of offices is
	 * fixed for as long as one government sits (the cabinet in force on the
	 * date, or a window around the date before 2011), each office keeps its
	 * place, and only the name inside changes. A vacancy is a dash in the same
	 * box, never a gap that closes up.
	 */

	interface Slot {
		role: Role;
		position: Position | null;
		at: 0 | 1 | 2;
	}
	interface Node {
		inst: Institution;
		slots: Slot[];
		children: Node[];
		governors: number;
		depth: number;
	}

	const SKIP_ROLES = new Set(['diplomat-ambassador']);

	const rolesByInst = (() => {
		const m = new Map<string, Role[]>();
		for (const r of ds.roles) {
			if (r.seats || SKIP_ROLES.has(r.id)) continue;
			(m.get(r.institution) ?? m.set(r.institution, []).get(r.institution)!).push(r);
		}
		return m;
	})();
	const childrenOf = (() => {
		const m = new Map<string, Institution[]>();
		for (const i of ds.institutions) {
			// Cabinets are dated records of a government, not offices in the chain;
			// the head of government's own office is kept.
			if (!i.parent || i.type === 'legislature' || i.type === 'parliamentary-group') continue;
			if (i.type === 'government' && i.parent === 'head-of-government') continue;
			(m.get(i.parent) ?? m.set(i.parent, []).get(i.parent)!).push(i);
		}
		return m;
	})();
	const positionsByRole = (() => {
		const m = new Map<string, Position[]>();
		for (const p of ds.positions) (m.get(p.role) ?? m.set(p.role, []).get(p.role)!).push(p);
		return m;
	})();
	const cabinets = ds.institutions
		.filter((i) => i.type === 'government' && i.parent === 'head-of-government')
		.sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);

	const YEAR = 365.2425 * 86_400_000;

	/** The government in force, if the record has one for the date. */
	const cabinet = $derived(cabinets.findLast((c) => activity(c.interval, app.t) > 0) ?? null);

	/**
	 * The window an office must have been held in to get a box: the cabinet's
	 * span when there is one, so the boxes hold still for its whole life; a year
	 * either side of the date otherwise.
	 */
	const window = $derived.by<[number, number]>(() => {
		if (cabinet) return [cabinet.interval.startEarliest, cabinet.interval.endLatest ?? Date.now()];
		return [app.t - YEAR, app.t + YEAR];
	});

	function slotsOf(inst: Institution, t: number, [w0, w1]: [number, number]): { slots: Slot[]; governors: number } {
		const slots: Slot[] = [];
		const governed = new Set<string>();
		for (const role of rolesByInst.get(inst.id) ?? []) {
			const list = positionsByRole.get(role.id) ?? [];
			if (role.region) {
				for (const p of list) if (activity(p.interval, t)) governed.add(role.region);
				continue;
			}
			const inForce = list.some((p) => p.interval.startEarliest <= w1 && (p.interval.endLatest ?? Date.now()) >= w0);
			if (!inForce) continue;
			let best: Slot = { role, position: null, at: 0 };
			for (const p of list) {
				const at = activity(p.interval, t);
				if (at > best.at) best = { role, position: p, at };
			}
			slots.push(best);
		}
		slots.sort((a, b) => b.role.authority - a.role.authority || a.role.id.localeCompare(b.role.id));
		return { slots, governors: governed.size };
	}

	function build(inst: Institution, t: number, w: [number, number], depth: number): Node | null {
		const { slots, governors } = slotsOf(inst, t, w);
		const children =
			depth < 4
				? (childrenOf.get(inst.id) ?? [])
						.map((c) => build(c, t, w, depth + 1))
						.filter((n): n is Node => !!n)
						.sort((a, b) => (b.slots[0]?.role.authority ?? 0) - (a.slots[0]?.role.authority ?? 0) || a.inst.id.localeCompare(b.inst.id))
				: [];
		if (!slots.length && !children.length && !governors) return null;
		return { inst, slots, children, governors, depth };
	}

	const root = $derived.by(() => {
		const p = institutionById.get('presidency');
		return p ? build(p, app.t, window, 0) : null;
	});

	/** The second row, split three ways around the head of government. */
	const HEAD_ROLE = 'prime-minister';
	/** The head of government's own office, held or not: the box is for that office only. */
	const headSlot = $derived.by<Slot | null>(() => {
		const role = ds.roles.find((r) => r.id === HEAD_ROLE);
		if (!role) return null;
		const g = root?.children.find((k) => k.inst.id === 'head-of-government');
		return g?.slots.find((s) => s.role.id === HEAD_ROLE) ?? { role, position: null, at: 0 };
	});

	const branches = $derived.by(() => {
		const kids = root?.children ?? [];
		return {
			government: kids.find((k) => k.inst.id === 'head-of-government') ?? null,
			ministries: kids.filter((k) => k.inst.type === 'ministry'),
			services: kids.filter((k) => k.inst.id !== 'head-of-government' && k.inst.type !== 'ministry')
		};
	});

	const chamber = $derived(termAt(app.t));

	/**
	 * The constitutional rules in force on the date: who heads the government,
	 * who appoints the ministers, to whom they answer. Read from the texts and
	 * recorded as events; where two overlap (a decree that suspended part of a
	 * constitution), the later one governs.
	 */
	const REGIME_Q: Record<string, string> = {
		'Who heads the government': 'a',
		'Who appoints the head of government': 'b',
		'Who appoints and dismisses ministers': 'c',
		'To whom ministers answer': 'd',
		'Powers kept by the head of state': 'e',
		'Secretaries of state and delegated ministers': 'f'
	};
	const regime = $derived.by(() => {
		const live = ds.events.filter((e) => e.subcategory === 'executive-regime' && activity(e.interval, app.t) > 0);
		live.sort((a, b) => b.interval.startEarliest - a.interval.startEarliest);
		const e = live[0];
		if (!e) return null;
		const rows = e.summary
			.split('\n')
			.map((l) => {
				const i = l.indexOf(': ');
				return { q: REGIME_Q[l.slice(0, i)] ?? '', label: l.slice(0, i), text: l.slice(i + 2) };
			})
			.filter((r) => r.text);
		return { event: e, rows };
	});
	const chamberCount = $derived(chamber ? membersAt(chamber, app.t).filter((m) => m.at === 2).length : 0);
	const speakers = $derived.by(() => {
		const l = institutionById.get('legislature');
		return l ? slotsOf(l, app.t, window).slots : [];
	});

	function who(s: Slot): string {
		return s.position ? nameOf(personById.get(s.position.holder)) || s.position.holder : '—';
	}

	function toMap() {
		world.openInside = true;
		world.setView('globe');
		void goto('/world?view=globe', { replaceState: true, keepFocus: true, noScroll: true });
	}
	function toChamber() {
		world.focusRegion = null;
		world.setView('parliament');
		void goto('/world?view=parliament', { replaceState: true, keepFocus: true, noScroll: true });
	}

	const motion = $derived(!prefersReducedMotion.current);
</script>

{#snippet slot(s: Slot, lead: boolean)}
	{@const tag = s.position ? tenureTag(s.position, s.at) : null}
	<div class="slot" class:lead class:vacant={!s.position}>
		<span class="role">{nameOf(s.role)}</span>
		<!-- The status chips sit on the name's own line, in short form, so a card
		     never changes height when a holder has one and the next does not: a
		     second line made every row below it jump as the date moved. The full
		     wording is the tooltip. -->
		<span class="name">
			{#key s.position?.holder ?? ''}
				<span class="swap" in:fade={{ duration: motion ? 220 : 0 }}>
					{#if s.position}
						<button class="who" title={who(s)} onclick={() => app.select(s.position!.holder)}>{who(s)}</button>
					{:else}
						<span class="dash" title={t('govt.vacant')}>—</span>
					{/if}
				</span>
			{/key}
			{#if s.position?.acting}<i class="chip" title={t('gov.acting')}>{t('gov.acting')}</i>{/if}
			{#if tag}
				{@const full = tag.key === 'verified' && tag.date ? tf('gov.verified', { date: formatDate(tag.date, 'month') }) : t(`gov.${tag.key}`)}
				<i class="chip" title={full} aria-label={full}>{tag.key === 'verified' && tag.date ? '✓ ' + formatDate(tag.date, 'month') : tag.key === 'unknownEnd' ? '?' : '~'}</i>
			{/if}
		</span>
	</div>
{/snippet}

{#snippet subtree(n: Node)}
	<li class="node">
		<div class="box" style:--d={n.depth}>
			<span class="inst">{nameOf(n.inst)}</span>
			{#each n.slots as s, i (s.role.id)}
				{@render slot(s, i === 0)}
			{/each}
			{#if n.governors}
				<button class="link" onclick={toMap}>{tf('govt.governors', { n: n.governors })}</button>
			{/if}
		</div>
		{#if n.children.length}
			<ul class="kids">
				{#each n.children as c (c.inst.id)}
					{@render subtree(c)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<div class="government" class:motion>
	<header class="head">
		<div>
			<h2>{t('govt.title')}</h2>
			<p class="mono">
				{formatDate(app.t, 'day')}{#if cabinet}{' · '}{nameOf(cabinet)}{/if}
			</p>
		</div>
		<details class="caveat">
			<summary>{t('govt.caveat.short')}</summary>
			<div class="pop">
			<p>{t('govt.caveat')}</p>
			{#if regime}
				<section class="regime">
					<h3>{nameOf(regime.event) || regime.event.title_en}</h3>
					<p class="mono">{formatDate(regime.event.interval.startEarliest, 'month')} – {regime.event.interval.status === 'ongoing' ? t('parl.sitting') : formatDate(regime.event.interval.endEarliest ?? regime.event.interval.startLatest, 'month')}</p>
					<dl>
						{#each regime.rows as r (r.label)}
							<dt>{r.q ? t(`govt.q.${r.q}`) : r.label}</dt>
							<dd>{r.text}</dd>
						{/each}
					</dl>
				</section>
			{:else}
				<p>{t('govt.noregime')}</p>
			{/if}
			</div>
		</details>
	</header>

	{#if root}
		<div class="chart">
			<!-- Level 0: the head of state. -->
			<div class="apex box" style:--d={0}>
				<span class="inst">{nameOf(root.inst)}</span>
				{#each root.slots as s, i (s.role.id)}
					{@render slot(s, i === 0)}
				{/each}
			</div>

			<!-- Level 1: three branches under one rail. -->
			<div class="row" class:no-left={!branches.services.length} class:no-right={!branches.ministries.length}>
				<section class="branch services">
					{#if branches.services.length}
						<ul class="tree">
							{#each branches.services as n (n.inst.id)}{@render subtree(n)}{/each}
						</ul>
					{/if}
				</section>

				<section class="branch gov">
					{#if branches.government}
						{@const g = branches.government}
						<div class="box hog" style:--d={1}>
							<span class="inst">{nameOf(g.inst)}</span>
							{#if headSlot}{@render slot(headSlot, true)}{/if}
						</div>
						{#if g.slots.length > 1 || g.children.length}
							<div class="cabinet" style:--d={2}>
								{#each g.slots.filter((x) => x.role.id !== HEAD_ROLE) as s (s.role.id)}
									<div class="card">{@render slot(s, false)}</div>
								{/each}
								{#each g.children as c (c.inst.id)}
									{#each c.slots as s (s.role.id)}
										<div class="card">{@render slot(s, false)}</div>
									{/each}
								{/each}
							</div>
						{/if}
						{#if !cabinet}
							<!-- Before 2011 no government is recorded as a body, so the ministers shown
							     are the ones the record names, not the whole cabinet. -->
							<p class="partial">{t('govt.partial')}</p>
						{/if}
					{/if}
				</section>

				<section class="branch ministries">
					{#if branches.ministries.length}
						<ul class="tree">
							{#each branches.ministries as n (n.inst.id)}{@render subtree(n)}{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>
	{:else}
		<p class="empty">{t('govt.none')}</p>
	{/if}

	<section class="legis">
		<h3>{t('govt.legislature')}</h3>
		<div class="legis-row">
			{#each speakers as s (s.role.id)}
				<div class="card">{@render slot(s, true)}</div>
			{/each}
			{#if chamber}
				<button class="link" onclick={toChamber}>{tf('govt.chamber', { name: nameOf(chamber.institution), n: chamberCount })}</button>
			{:else}
				<p class="muted">{t('parl.none')}</p>
			{/if}
		</div>
	</section>
</div>

<style>
	.government {
		height: 100%;
		overflow-y: auto;
		padding: var(--s-5) var(--s-6) var(--s-10, var(--s-8));
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--s-4);
		max-width: 1200px;
		width: 100%;
		margin-inline: auto;
	}
	.head h2 {
		font-size: var(--t-lg);
		font-weight: 600;
		color: var(--text-primary);
	}
	.head p {
		font-size: var(--t-xs);
		color: var(--text-muted);
		margin-top: var(--s-1);
		white-space: nowrap;
	}
	.caveat {
		position: relative;
		max-width: 46ch;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.caveat summary {
		cursor: pointer;
		text-align: end;
		min-height: 28px;
	}
	/* Opens over the chart: reading the rules must not move the boxes under it. */
	.pop {
		position: absolute;
		inset-inline-end: 0;
		top: 100%;
		z-index: 6;
		white-space: normal;
		width: min(560px, calc(100vw - 2 * var(--s-4)));
		padding: var(--s-3);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-base);
		box-shadow: var(--shadow-md, 0 8px 24px rgb(0 0 0 / 0.12));
		text-align: start;
	}
	.caveat .pop > p {
		white-space: normal;
		margin: 0 0 var(--s-2);
		padding: 0;
		border: 0;
	}
	.regime {
		margin-top: var(--s-2);
		padding: var(--s-3);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		max-height: 50vh;
		overflow-y: auto;
		text-align: start;
	}
	.regime h3 {
		font-size: var(--t-xs);
		font-weight: 600;
		color: var(--text-primary);
	}
	.caveat .regime .mono {
		margin: var(--s-1) 0 var(--s-2);
		padding: 0;
		border: 0;
	}
	.regime dt {
		margin-top: var(--s-2);
		font-weight: 600;
		color: var(--text-secondary);
	}
	.regime dd {
		line-height: var(--lh-relaxed);
	}
	.caveat p {
		margin-top: var(--s-2);
		line-height: var(--lh-relaxed);
		padding: var(--s-3);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-md);
	}

	.chart {
		max-width: 1200px;
		width: 100%;
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.apex {
		width: min(420px, 100%);
		border-color: var(--accent-border) !important;
		text-align: center;
		align-items: center;
	}
	/* The rail: one line down from the apex, one across the three branches. */
	.row {
		position: relative;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: var(--s-5);
		margin-top: var(--s-6);
		padding-top: var(--s-5);
	}
	.row::before {
		content: '';
		position: absolute;
		top: calc(-1 * var(--s-6));
		left: 50%;
		height: var(--s-6);
		border-inline-start: 1px solid var(--border-strong);
	}
	.row::after {
		content: '';
		position: absolute;
		top: 0;
		inset-inline: calc(100% / 8) calc(100% / 8);
		border-top: 1px solid var(--border-strong);
	}
	.row.no-left::after {
		inset-inline-start: 50%;
	}
	.row.no-right::after {
		inset-inline-end: 50%;
	}
	.partial {
		font-size: var(--t-xs);
		line-height: var(--lh-relaxed);
		color: var(--text-muted);
		padding: var(--s-3) var(--s-4);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-md);
	}
	.branch {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		min-width: 0;
	}
	.branch::before {
		content: '';
		position: absolute;
		top: calc(-1 * var(--s-5));
		left: 50%;
		height: var(--s-5);
		border-inline-start: 1px solid var(--border-strong);
	}
	.branch:empty::before,
	.branch.services:not(:has(.tree))::before,
	.branch.ministries:not(:has(.tree))::before {
		display: none;
	}
	.hog {
		align-self: center;
		width: min(420px, 100%);
		text-align: center;
		align-items: center;
	}
	.cabinet {
		position: relative;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--s-2);
		margin-top: var(--s-4);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-strong);
	}
	.cabinet::before {
		content: '';
		position: absolute;
		top: calc(-1 * var(--s-4));
		left: 50%;
		height: var(--s-4);
		border-inline-start: 1px solid var(--border-strong);
	}

	.tree,
	.kids {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.kids {
		margin-top: var(--s-2);
		margin-inline-start: var(--s-3);
		padding-inline-start: var(--s-3);
		border-inline-start: 1px solid var(--border-default);
	}

	.box,
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-3) var(--s-4);
		background: var(--surface-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
	}
	.card {
		padding: var(--s-2) var(--s-3);
	}
	.inst {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.slot {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.slot .role {
		font-size: var(--t-2xs);
		color: var(--text-muted);
		line-height: var(--lh-snug);
		/* Two lines, always: a long ministry title never changes the card's height. */
		min-height: calc(2 * 1.3em);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.apex .slot .role,
	.hog .slot .role,
	.box .slot.lead .role {
		min-height: 0;
	}
	/* A fixed height, not a minimum: nothing a name line holds may change it. */
	.slot .name {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
		height: 1.6em;
		overflow: hidden;
	}
	.apex .slot .name,
	.hog .slot .name {
		height: 2.1em;
	}
	.slot .swap {
		min-width: 0;
		flex: 0 1 auto;
	}
	.slot .chip {
		flex: none;
		white-space: nowrap;
	}
	.apex .slot .name,
	.hog .slot .name {
		justify-content: center;
	}
	.who {
		display: block;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-primary);
		text-align: start;
		font-size: var(--t-sm);
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 3px;
	}
	.apex .who,
	.hog .who {
		font-size: var(--t-lg);
		font-weight: 600;
		text-align: center;
	}
	.slot.lead .who {
		font-weight: 600;
	}
	.who:hover {
		text-decoration-color: var(--accent);
	}
	.dash {
		color: var(--text-faint);
		cursor: help;
	}
	.chip {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-style: normal;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		padding: 1px 4px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
	}
	.link {
		align-self: flex-start;
		font-size: var(--t-xs);
		font-weight: 600;
		color: var(--text-primary);
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 3px;
		margin-top: var(--s-1);
	}

	.legis {
		max-width: 1200px;
		width: 100%;
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-subtle);
	}
	.legis h3 {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 400;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.legis-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-3);
	}
	/* A fixed width, so the link beside it stays put when the name changes. */
	.legis-row .card {
		width: min(260px, 100%);
	}
	.muted,
	.empty {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	/* The arrival: each level draws in after the one above it. It plays once,
	   when the view opens; scrubbing the date never replays it. */
	.motion .box,
	.motion .cabinet {
		animation: drop var(--dur-slow, 420ms) var(--ease-out) both;
		animation-delay: calc(var(--d, 0) * 140ms);
	}
	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
	}

	/* Phone: the three branches stack, government first. */
	@media (max-width: 900px) {
		.government {
			padding: var(--s-4) var(--s-4) var(--s-8);
		}
		.head {
			flex-direction: column;
		}
		.caveat summary {
			text-align: start;
		}
		.row {
			grid-template-columns: 1fr;
			margin-top: var(--s-4);
			padding-top: 0;
		}
		.row::after,
		.branch::before {
			display: none;
		}
		.row::before {
			top: calc(-1 * var(--s-4));
			height: var(--s-4);
		}
		.branch.gov {
			order: -1;
		}
		.cabinet {
			grid-template-columns: 1fr 1fr;
		}
		.who {
			min-height: var(--tap);
			display: inline-flex;
			align-items: center;
		}
	}
</style>
