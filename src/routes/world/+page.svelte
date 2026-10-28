<script lang="ts">
	/**
	 * The world view — one system, two projections (see
	 * docs/plans/world-rebuild-v2.md).
	 *
	 * WHY THE STRIP LIVES HERE
	 *
	 * The totals strip answers "how much does the country owe, and how much does
	 * it move" for the cursor year, and the answer must not move when the reader
	 * switches projection — so it sits above the switch, owned by the page, not
	 * by either view.
	 *
	 * WHY ?view= IS CONSUMED AND WRITTEN
	 *
	 * A link to a query parameter nothing reads is the worst shape of broken
	 * (AGENTS.md): the page loads, and nothing happens, indistinguishable from
	 * the feature not existing. This page reads `?view=` on load and writes it
	 * back on switch, so a shared link to `/world?view=ledger` opens the table,
	 * and the smoke suite pins that behaviour.
	 */
	import WorldView from '$lib/components/WorldView.svelte';
	import WorldLedger from '$lib/components/WorldLedger.svelte';
	import ParliamentView from '$lib/components/ParliamentView.svelte';
	import GovernmentView from '$lib/components/GovernmentView.svelte';
	import WorldTotals from '$lib/components/WorldTotals.svelte';
	import AboutView from '$lib/shell/AboutView.svelte';
	import { world, type WorldFamily, type WorldViewMode } from '$lib/world/store.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import { t, tf, nameOf } from '$lib/t.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { app } from '$lib/state.svelte';
	import { ds, personById, positionsByRole, activity, meetsBasis } from '$lib/model';
	import { termAt, membersAt } from '$lib/civic';
	import { prefersReducedMotion } from 'svelte/motion';
	import { untrack } from 'svelte';

	/*
	 * WHY ONE TOOLBAR
	 *
	 * The page used to stack four bands above the globe: the about row, eight
	 * figure cards, the globe/ledger switch, and the trade/energy/debt switch on
	 * the globe itself. On a phone that was a quarter of the screen before the
	 * view began. It has the Network's shape now: one toolbar holding the name,
	 * the about disclosure, the figures as one line, and the switches at the
	 * end, and the stage takes the rest. The family switch moved here from the
	 * globe so the figures and the arcs answer to the same control. The ledger
	 * keeps its own family switch, which also offers "all".
	 */

	/*
	 * TWO SCALES, ONE TRAIL
	 *
	 * Outside is Tunisia among states: the globe at world scale and the ledger,
	 * with the trade, energy and debt switch that only means something there.
	 * Inside is the country: the governorate map, the parliament and the
	 * government. The toolbar shows the controls of the scale the reader is on,
	 * and the trail (World › Tunisia › …) is the one way up and down between them.
	 * Going inward is a camera move, not a page change: the map flies to the
	 * Bardo before the chamber opens, and to Carthage before the government.
	 */
	const outsideOptions = $derived([
		{ value: 'globe', label: t('world.view.globe') },
		{ value: 'ledger', label: t('world.view.ledger') }
	]);
	const insideOptions = $derived([
		{ value: 'map', label: t('world.view.map') },
		{ value: 'parliament', label: t('world.view.parliament') },
		{ value: 'government', label: t('world.view.government') }
	]);
	const lens = $derived(world.view === 'parliament' || world.view === 'government' ? world.view : 'map');

	/** Where each institution sits, for the flight in before its lens opens. */
	const PLACES: Record<'parliament' | 'government', [number, number]> = {
		parliament: [10.134, 36.8094], // the Bardo, seat of the Assembly
		government: [10.3319, 36.8546] // Carthage, seat of the Presidency
	};
	const FLIGHT_MS = 720;
	let pending: ReturnType<typeof setTimeout> | undefined;

	function enter(target: string) {
		clearTimeout(pending);
		if (target === 'map') {
			if (world.view === 'globe') return world.flyTo('tunisia');
			world.openInside = true;
			return setView('globe');
		}
		const lensTarget = target as 'parliament' | 'government';
		// From the map, fly to the building first; from another lens, cut across.
		if (world.view === 'globe' && world.globeInside && !prefersReducedMotion.current) {
			const [lon, lat] = PLACES[lensTarget];
			world.flyTo('point', lon, lat);
			pending = setTimeout(() => setView(lensTarget), FLIGHT_MS);
		} else {
			setView(lensTarget);
		}
	}

	function toWorld() {
		clearTimeout(pending);
		if (world.view === 'globe') world.flyTo('world');
		else setView('globe');
	}

	$effect(() => () => clearTimeout(pending));

	/*
	 * The inside line: who governs on the cursor date, in words. Each part opens
	 * the lens it belongs to, so the line is also the way in for a reader who
	 * does not know the lenses exist.
	 */
	function holderOf(role: string): string | null {
		for (const p of positionsByRole.get(role) ?? []) if (activity(p.interval, app.t) === 2) return p.holder;
		for (const p of positionsByRole.get(role) ?? []) if (activity(p.interval, app.t) === 1) return p.holder;
		return null;
	}
	const president = $derived(holderOf('president'));
	const premier = $derived(holderOf('prime-minister'));
	const chamber = $derived(termAt(app.t));
	const seated = $derived.by(() => {
		if (!chamber) return 0;
		// The chamber withholds seats below the floor, so this count must too,
		// or the toolbar disagrees with the tally on the same screen.
		const visible = membersAt(chamber, app.t).filter((m) =>
			meetsBasis(m.position.basis, app.basisFloor)
		);
		// Mirror the chamber's own rule: possibly-active members are seated only
		// while they fit, so the toolbar cannot disagree with the tally beside it.
		const named = (visible.length > chamber.seats ? visible.filter((m) => m.at === 2) : visible)
			.length;
		const split = chamber.institution.seat_split;
		// Where no member is named the seats are counted by party instead.
		return named || !split ? named : split.reduce((n, x) => n + x.seats, 0);
	});
	/** A term counted by party has no named member to say "sitting". */
	const countedByParty = $derived.by(() => {
		if (!chamber) return false;
		const named = membersAt(chamber, app.t).filter((m) => m.at === 2).length;
		return !named && !!chamber.institution.seat_split?.length;
	});
	const regionName = $derived(world.region ? nameOf(ds.regions.find((r) => r.id === world.region)) : '');
	const familyOptions = $derived([
		{ value: 'trade', label: t('world.trade') },
		{ value: 'energy', label: t('world.energy') },
		{ value: 'debt', label: t('world.debt') }
	]);

	/*
	 * THE URL IS THE STATE
	 *
	 * A lens, a family, a governorate and a date are what a reader means by "this
	 * view", so all four live in the query and all four are read back. Only known
	 * values count; anything else leaves the store's default alone, so a typo
	 * degrades to the default rather than a half-set view.
	 */
	const VIEWS: WorldViewMode[] = ['globe', 'parliament', 'government', 'ledger'];
	const FAMILIES: WorldFamily[] = ['trade', 'energy', 'debt'];

	function isoDay(ms: number): string {
		return new Date(ms).toISOString().slice(0, 10);
	}

	$effect(() => {
		// Only the URL is a dependency. Reading world.view or app.t here would
		// subscribe to them, so a lens click would re-run this effect and apply the
		// URL's *previous* value back over the click: the lens snapped to the globe.
		const p = page.url.searchParams;
		untrack(() => {
			const v = p.get('view');
			if (v && (VIEWS as string[]).includes(v) && world.view !== v) world.setView(v as WorldViewMode);
			const f = p.get('family');
			if (f && (FAMILIES as string[]).includes(f) && world.family !== f) world.setFamily(f as WorldFamily);
			const t = p.get('t');
			if (t) {
				const ms = Date.parse(t);
				if (!Number.isNaN(ms) && Math.abs(app.t - ms) > 1000) app.t = ms;
			}
		});
	});

	/**
	 * Write the shareable state back. A lens change is a history entry, so Back
	 * steps out of a lens the way it steps out of a page; a date or family change
	 * replaces, because scrubbing the dock should not fill the history.
	 */
	let pushNext = false;

	function writeUrl(push: boolean) {
		const url = new URL(page.url);
		url.searchParams.set('view', world.view);
		url.searchParams.set('t', isoDay(app.t));
		if (world.family === 'trade') url.searchParams.delete('family');
		else url.searchParams.set('family', world.family);
		// `at` describes the globe's scale only; the other inside lenses imply the
		// same place by their own name, and WorldView reads it once on arrival.
		if (world.view === 'globe' && world.globeInside) url.searchParams.set('at', 'tunisia');
		else url.searchParams.delete('at');
		if (url.href === page.url.href) return;
		void goto(url, { replaceState: !push, keepFocus: true, noScroll: true });
	}

	$effect(() => {
		// Track only what this page owns; region is written by the map itself.
		void world.view;
		void world.family;
		void world.globeInside;
		void app.t;
		const push = pushNext;
		pushNext = false;
		untrack(() => writeUrl(push));
	});

	function setView(v: string) {
		// The effect writes; the flag only decides whether it pushes.
		pushNext = true;
		world.setView(v as WorldViewMode);
	}

	function setFamily(v: string) {
		world.setFamily(v as WorldFamily);
	}
</script>

<svelte:head>
	<title>{t('world.page.title')}</title>
	<meta name="description" content={t('world.page.description')} />
</svelte:head>

<div class="worldpage">
	<div class="toolbar" class:inside={world.inside}>
		<nav class="trail" aria-label={t('world.trail')}>
			<button class:on={!world.inside} aria-current={!world.inside ? 'location' : undefined} onclick={toWorld}>
				{t('world.trail.world')}
			</button>
			<span class="sep" aria-hidden="true">›</span>
			<button
				class:on={world.inside && lens === 'map' && !world.region}
				aria-current={world.inside && lens === 'map' && !world.region ? 'location' : undefined}
				onclick={() => enter('map')}
			>
				{t('world.tunisia')}
			</button>
			{#if world.inside && (lens !== 'map' || world.region)}
				<span class="sep" aria-hidden="true">›</span>
				<span class="on here" aria-current="location">{lens === 'map' ? regionName : t(`world.view.${lens}`)}</span>
			{/if}
		</nav>

		{#if !world.inside}
			<AboutView />
			<div class="figures">
				<WorldTotals family={world.family} />
			</div>
			<div class="modes">
				{#if world.view === 'globe'}
					<Segmented
						options={familyOptions}
						value={world.family}
						onchange={setFamily}
						label={t('world.family')}
					/>
				{/if}
				<Segmented options={outsideOptions} value={world.view} onchange={setView} label={t('world.view.label')} />
			</div>
		{:else}
			<p class="context">
				{#if president}<button onclick={() => app.select(president!)}>{nameOf(personById.get(president))}</button>{/if}
				{#if premier}<span class="dot" aria-hidden="true">·</span><button onclick={() => app.select(premier!)}>{nameOf(personById.get(premier))}</button>{/if}
				{#if president || premier}<span class="dot" aria-hidden="true">·</span>{/if}
				{#if chamber}
					<button onclick={() => enter('parliament')}>{tf(countedByParty ? 'world.ctx.chamber.split' : 'world.ctx.chamber', { n: seated })}</button>
				{:else}
					<span class="muted">{t('world.ctx.nochamber')}</span>
				{/if}
			</p>
			<div class="modes">
				<Segmented options={insideOptions} value={lens} onchange={enter} label={t('world.view.inside')} />
			</div>
		{/if}
	</div>

	<div class="stage">
		{#if world.view === 'globe'}
			<WorldView />
		{:else if world.view === 'parliament'}
			<ParliamentView />
		{:else if world.view === 'government'}
			<GovernmentView />
		{:else}
			<WorldLedger />
		{/if}
	</div>
</div>

<style>
	.worldpage {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	/* The Network's toolbar, line for line, so the views read as one system. */
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--s-6);
		padding: var(--s-4) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}
	.trail {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
		flex: none;
	}
	.trail button,
	.trail .here {
		padding: var(--s-1) var(--s-2);
		border-radius: var(--r-full);
		color: inherit;
		min-height: 28px;
		display: inline-flex;
		align-items: center;
	}
	.trail button:hover {
		color: var(--text-primary);
	}
	.trail .on {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.trail .sep {
		color: var(--text-faint);
	}
	:global([dir='rtl']) .trail .sep {
		transform: scaleX(-1);
	}
	.context {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
	}
	.context button {
		color: var(--text-primary);
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 3px;
		white-space: nowrap;
	}
	.context button:hover {
		text-decoration-color: var(--accent);
	}
	.context .dot,
	.context .muted {
		color: var(--text-faint);
	}
	.figures {
		flex: 1;
		min-width: 0;
		display: flex;
		justify-content: flex-end;
	}
	.modes {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}

	@media (max-width: 900px) {
		.toolbar {
			gap: var(--s-2) var(--s-4);
			padding: var(--s-2) var(--s-4);
		}
		.trail button,
		.trail .here {
			min-height: var(--tap);
		}
		.context {
			order: 3;
			width: 100%;
			flex-basis: 100%;
		}
		.modes {
			order: 2;
			width: 100%;
			justify-content: space-between;
		}
		.figures {
			order: 3;
			width: 100%;
			flex-basis: 100%;
			justify-content: flex-start;
		}
	}

	.stage {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	/*
	 * The dissolve that says "same data, different arrangement". A cross-fade, not
	 * a 3-D morph: motion must mean something, and a flattening animation encodes
	 * nothing. Reduced motion gets the instant switch.
	 */
	.stage :global(.world),
	.stage :global(.parliament),
	.stage :global(.government),
	.stage :global(.ledger) {
		animation: world-in var(--dur-normal) var(--ease-out);
	}
	@keyframes world-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stage :global(.world),
		.stage :global(.ledger),
		.stage :global(.parliament),
		.stage :global(.government) {
			animation: none;
		}
	}
</style>
