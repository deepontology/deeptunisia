<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { app, startPlayback } from '$lib/state.svelte';
	import { syncSelectionUrl, validEntity, validRelationship } from '$lib/deeplink.svelte';
	import { ensureLocaleProse } from '$lib/locale-prose.svelte';
	import { personById, institutionById, relationshipById, eventById, resolveEntity } from '$lib/model';
	import { eventTitle, nameOf } from '$lib/names.svelte';
	import Viewport from '$lib/shell/Viewport.svelte';
	import TimeDock from '$lib/shell/TimeDock.svelte';
	import Inspector from '$lib/shell/Inspector.svelte';
	import BootScreen from '$lib/shell/BootScreen.svelte';
	import TourOverlay from '$lib/shell/TourOverlay.svelte';
	import TourInvite from '$lib/shell/TourInvite.svelte';
	import { startTour, tour, tourSeen } from '$lib/shell/tour.svelte';

	/**
	 * The instrument frame. Everything here reads a record: the time dock, the
	 * Inspector, the boot screen, deep links and the preview titles that name the
	 * selected record. A page of prose gets the root frame alone, so none of this
	 * sits behind its reading.
	 */
	let { children } = $props();

	/**
	 * Boot runs once per session, not once per navigation. A loading screen that
	 * reappears when you click a tab stops being an entrance and becomes an
	 * obstruction.
	 *
	 * And only for a reader arriving at the Chronicle itself. Someone following a
	 * deep link (?id=) came for one record, and someone landing on any other view
	 * came for that view; both open directly, and the session counts as booted.
	 * The inline script in app.html applies the same rule before first paint.
	 */
	let booted = $state(browser ? document.documentElement.dataset.boot === 'ready' : true);
	onMount(() => {
		// The inline script in app.html already set data-boot before first paint;
		// keep .os hidden until we decide, then mirror the decision in Svelte
		// so the CSS gate and the component stay in sync.
		const skip = page.url.pathname !== '/chronicle' || page.url.searchParams.has('id');
		const already =
			skip ||
			(() => {
				try {
					return sessionStorage.getItem('deeptunisia:booted') === '1';
				} catch {
					return false;
				}
			})();
		booted = already;
		try {
			document.documentElement.dataset.boot = already ? 'ready' : 'pending';
		} catch {}
		if (skip) finishBoot();
		// Start the guided tour on first visit, or if ?tour=1 is present.
		// Defer until the boot animation has finished, otherwise the tour
		// modal appears on top of the counting boot — the exact overlap
		// testers reported (tour before loading ends).
		const force = page.url.searchParams.get('tour') === '1';
		if (booted) {
			startTour(force);
		} else {
			const iv = setInterval(() => {
				try {
					if (document.documentElement.dataset.boot === 'ready') {
						startTour(force);
						if (tour.open || tour.invite || tourSeen()) clearInterval(iv);
					}
				} catch {}
			}, 120);
			setTimeout(() => clearInterval(iv), 6000);
		}
	});
	function finishBoot() {
		booted = true;
		try {
			// The first-paint placeholder, when the boot never ran to remove it.
			document.getElementById('static-boot')?.remove();
			sessionStorage.setItem('deeptunisia:booted', '1');
			document.documentElement.dataset.boot = 'ready';
		} catch {}
	}

	/**
	 * Views for which the scrubbed instant is not a dimension of the data.
	 *
	 * The feed is a list of what other people published in the last few days; there
	 * is no sense in which it can be projected onto 1987. Leaving the dock visible
	 * there would put a playhead reading "14 Jan 2011" under today's headlines — an
	 * affordance that appears to drive the page and does not.
	 *
	 * /now deliberately does NOT belong here: it pins the playhead to the cutoff on
	 * arrival, so the dock keeps agreeing with the page and stays a live control for
	 * the evidence dial and layer filters, which that view does respond to.
	 */
	const TIMELESS = ['/feed'];
	const hasDock = $derived(!TIMELESS.includes(page.url.pathname));

	// OG preview — dynamic per selection/rel/flow, client-enhanced (crawlers use prerendered /share shells).
	// Prerender cannot access searchParams (SvelteKit forbids it); guard with browser so build succeeds.
	const og = $derived.by(() => {
		if (!browser) return null;
		const rel = page.url.searchParams.get('rel');
		if (rel && validRelationship(rel)) {
			const r = relationshipById.get(rel);
			const from = r ? (personById.get(r.from)?.name_en ?? institutionById.get(r.from)?.name_en ?? r.from) : rel;
			const to = r ? (personById.get(r.to)?.name_en ?? institutionById.get(r.to)?.name_en ?? r.to) : '';
			const label = to ? `${from} → ${to}` : from;
			const desc = r?.description ? r.description.slice(0, 160) : 'A documented relationship in the DeepTunisia graph.';
			return { title: `${label} · DeepTunisia`, desc, image: 'https://deeptunisia.org/og/default.png', url: page.url.href };
		}
		const flow = page.url.searchParams.get('flow');
		if (flow) {
			const [kind, year, iso] = flow.split(':');
			const label = kind && year && iso ? `${kind} ${iso} · ${year}` : flow;
			return { title: `${label} · DeepTunisia`, desc: 'A measured flow between Tunisia and a counterparty.', image: 'https://deeptunisia.org/og/default.png', url: page.url.href };
		}
		const agreement = page.url.searchParams.get('agreement');
		if (agreement) {
			return { title: `${agreement} · DeepTunisia`, desc: 'An agreement in the DeepTunisia world dataset.', image: 'https://deeptunisia.org/og/default.png', url: page.url.href };
		}
		const sel = page.url.searchParams.get('id') ?? app.selected;
		if (sel && validEntity(sel)) {
			const person = personById.get(sel);
			const inst = institutionById.get(sel);
			if (person || inst) {
				const ref = resolveEntity(sel);
				const raw = ref ? nameOf({ name_en: ref.name, name_fr: (ref as unknown as { name_fr?: string })?.name_fr, name_ar: (ref as unknown as { name_ar?: string })?.name_ar } as unknown as { name_en: string }) : sel;
				// nameOf already picks locale; fallback to ref.name
				const titleName = (() => {
					if (person) return nameOf(person);
					if (inst) return nameOf(inst);
					return ref?.name ?? sel;
				})();
				const descRaw = (person?.summary ?? inst?.summary ?? person?.tagline ?? '') as string;
				const desc = descRaw ? descRaw.slice(0, 160) : `An entity in the DeepTunisia graph — ${ref?.kind ?? 'record'}.`;
				return { title: `${titleName} · DeepTunisia`, desc, image: 'https://deeptunisia.org/og/default.png', url: page.url.href };
			}
			// Events (and only events, among records) are URL-addressable: lane
			// clicks sync ?id=, so shared event links deserve a real title, not
			// the id. resolveEntity covers persons and institutions only.
			const ev = eventById.get(sel);
			if (ev) {
				const descRaw = ev.summary ?? '';
				return {
					title: `${eventTitle(ev)} · DeepTunisia`,
					desc: descRaw ? descRaw.slice(0, 160) : 'An event in the DeepTunisia graph.',
					image: 'https://deeptunisia.org/og/default.png',
					url: page.url.href
				};
			}
		}
		return null;
	});

	onMount(() => {
		const stopPlay = startPlayback();
		return () => stopPlay();
	});

	// W2: every selection is a URL. Reads app.selected, so this re-runs on every
	// selection change anywhere, and keeps ?id= in step on the entity views that
	// consume it. replaceState, never pushState — selections are not history.
	$effect(() => {
		syncSelectionUrl();
	});

	// French and Arabic prose ships beside the graph, not in it: fetch the
	// reader's language (locale-prose.svelte.ts). English needs nothing.
	$effect(() => {
		void ensureLocaleProse(app.locale);
	});

	/* The transport keys belong to the instruments: space plays, arrows nudge
	   the playhead. Search, theme and Escape stay in the root frame. */
	function onKey(e: KeyboardEvent) {
		if (tour.open) return;
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (!hasDock) return;
		if (e.key === ' ') {
			e.preventDefault();
			app.playing = !app.playing;
		} else if (e.key === 'ArrowLeft' && !e.defaultPrevented) {
			// The date slider handles its own arrows and prevents the default;
			// without this check a focused slider stepped the date twice.
			app.nudge(e.shiftKey ? -5 : -1);
		} else if (e.key === 'ArrowRight' && !e.defaultPrevented) {
			app.nudge(e.shiftKey ? 5 : 1);
		}
	}
</script>

<svelte:head>
	{#if og}
		<title>{og.title}</title>
		<meta property="og:title" content={og.title} />
		<meta property="og:description" content={og.desc} />
		<meta property="og:url" content={og.url} />
		<meta property="og:image" content={og.image} />
		<meta property="og:type" content="article" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={og.title} />
		<meta name="twitter:description" content={og.desc} />
		<meta name="twitter:image" content={og.image} />
	{:else}
		<!-- Prerendered default card. Inline because a component that renders head
		     tags alone cannot hydrate in the body. -->
		<meta property="og:site_name" content="DeepTunisia" />
		<meta property="og:title" content="DeepTunisia: a public record of power" />
		<meta property="og:description" content="An open, source-backed public record of the people, institutions and networks that shape Tunisia, 1956 to 2026." />
		<meta property="og:type" content="website" />
		<meta property="og:image" content="https://deeptunisia.org/og/default.png" />
		<meta property="og:image:alt" content="DeepTunisia: the circle and dot mark beside the name and the line Power, institutions and evidence, 1956 to 2026." />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content="https://deeptunisia.org/og/default.png" />
	{/if}
</svelte:head>

<svelte:window onkeydown={onKey} />

<nav class="skip" aria-label="Skip to timeline controls">
	{#if hasDock}
		<a href="#timeline">Skip to timeline controls</a>
	{/if}
</nav>

<div class="body">
	<Viewport>
		{@render children()}
	</Viewport>
	<Inspector />
</div>

{#if hasDock}
	<TimeDock />
{/if}

{#if !booted}
	<BootScreen onDone={finishBoot} />
{/if}

<TourOverlay />
<TourInvite />

<style>
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: stretch;
	}

	/* Off-screen until focused, then a real, visible target. */
	.skip a {
		position: absolute;
		z-index: 700;
		inset-inline-start: -9999px;
		display: inline-block;
		white-space: nowrap;
		padding: var(--s-4) var(--s-6);
		background: var(--accent);
		color: var(--accent-text);
		font-size: var(--t-sm);
		font-weight: 520;
		border: none;
		border-radius: 0 0 var(--r-md) 0;
	}
	.skip a:focus-visible {
		inset-inline-start: 0;
		outline-offset: -3px;
	}
</style>
