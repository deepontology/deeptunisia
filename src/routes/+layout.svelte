<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { app, startPlayback } from '$lib/state.svelte';
	import { syncSelectionUrl } from '$lib/deeplink.svelte';
	import { initTheme, theme } from '$lib/design/theme.svelte';
	import { dirFor } from '$lib/i18n';
	import MenuBar from '$lib/shell/MenuBar.svelte';
	import SubNav from '$lib/shell/SubNav.svelte';
	import { rememberPath } from '$lib/shell/nav.svelte';
import { tour } from '$lib/shell/tour.svelte';
	import TimeDock from '$lib/shell/TimeDock.svelte';
	import Viewport from '$lib/shell/Viewport.svelte';
	import Inspector from '$lib/shell/Inspector.svelte';
	import BootScreen from '$lib/shell/BootScreen.svelte';
	import Cursor from '$lib/shell/Cursor.svelte';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import TourOverlay from '$lib/shell/TourOverlay.svelte';
	import { startTour } from '$lib/shell/tour.svelte';

	let { children } = $props();

	/**
	 * Boot runs once per session, not once per navigation. A loading screen that
	 * reappears when you click a tab stops being an entrance and becomes an
	 * obstruction.
	 */
	let booted = $state(browser ? document.documentElement.dataset.boot === 'ready' : true);
	onMount(() => {
		// The inline script in app.html already set data-boot before first paint;
		// keep .os hidden until we decide, then mirror the decision in Svelte
		// so the CSS gate and the component stay in sync.
		const already = (() => {
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
		if (isDoc) finishBoot();
		// Start the guided tour on first visit, or if ?tour=1 is present.
		const force = page.url.searchParams.get('tour') === '1';
		if (!isDoc) startTour(force);
	});
	function finishBoot() {
		booted = true;
		try {
			sessionStorage.setItem('deeptunisia:booted', '1');
			document.documentElement.dataset.boot = 'ready';
		} catch {}
	}

	/** Reference pages are documents: no time controls, and they scroll normally. */
	const DOC_PAGES = ['/evidence', '/methodology', '/corrections', '/about', '/data', '/guide'];
	const isDoc = $derived(
		DOC_PAGES.includes(page.url.pathname) || page.url.pathname.startsWith('/media')
	);

	/**
	 * Views for which the scrubbed instant is not a dimension of the data.
	 *
	 * The feed is a list of what other people published in the last few days; there
	 * is no sense in which it can be projected onto 1987. Leaving the dock visible
	 * there would put a playhead reading "14 Jan 2011" under today's headlines — an
	 * affordance that appears to drive the page and does not. Docs already lose the
	 * dock via isDoc; this is the same judgement for a page that is a view in every
	 * other respect.
	 *
	 * /now deliberately does NOT belong here: it pins the playhead to the cutoff on
	 * arrival, so the dock keeps agreeing with the page and stays a live control for
	 * the evidence dial and layer filters, which that view does respond to.
	 */
	const TIMELESS = ['/feed'];
	const hasDock = $derived(!isDoc && !TIMELESS.includes(page.url.pathname));
	const dir = $derived(dirFor(app.locale));

	// Remember where each section was left, so crossing between Graph and Agora and
	// back returns the reader to the view they were reading. See nav.svelte.ts.
	$effect(() => {
		rememberPath(page.url);
	});

	onMount(() => {
		const stopTheme = initTheme();
		const stopPlay = startPlayback();
		return () => {
			stopTheme();
			stopPlay();
		};
	});

	// Charts follow the theme through CSS variables, so nothing else needs to be
	// invalidated here. Do not add a counter — writing state that this effect also
	// reads self-triggers and Svelte aborts the whole tree.
	$effect(() => {
		document.documentElement.dataset.theme = theme.resolved;
	});

	// W2: every selection is a URL. Reads app.selected, so this re-runs on every
	// selection change anywhere, and keeps ?id= in step on the entity views that
	// consume it. replaceState, never pushState — selections are not history.
	$effect(() => {
		syncSelectionUrl();
	});

	$effect(() => {
		document.documentElement.setAttribute('dir', dir);
		document.documentElement.setAttribute('lang', app.locale);
	});

	function onKey(e: KeyboardEvent) {
		/* The tour is modal. Its overlay and the shell both listen on window,
		   and stopPropagation cannot order two listeners on one node - so
		   while the tour is open this handler stands down entirely. Without
		   this, Escape dismissed the tour AND cleared a deep-linked selection:
		   the card a reader had followed a link to vanished under their keys. */
		if (tour.open) return;
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
			e.preventDefault();
			app.searchOpen = true;
		} else if (e.key === 'Escape') {
			if (app.searchOpen) app.searchOpen = false;
			else app.selected = null;
		} else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) {
			theme.cycle();
		} else if (hasDock) {
			if (e.key === ' ') {
				e.preventDefault();
				app.playing = !app.playing;
			} else if (e.key === 'ArrowLeft') {
				app.nudge(e.shiftKey ? -5 : -1);
			} else if (e.key === 'ArrowRight') {
				app.nudge(e.shiftKey ? 5 : 1);
			}
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="os" class:inspecting={Boolean(app.selected)}>
	<!--
		Skip links. Not boilerplate: the instrument views put hundreds of focusable
		nodes in the tab order — the Chronicle alone has one per tenure — and the dock
		renders last, so without these a keyboard user has to traverse 70+ chart bars
		before reaching the timeline controls that drive the whole app.
	-->
	<nav class="skip" aria-label="Skip links">
		<a href="#view">Skip to view</a>
		{#if hasDock}
			<a href="#timeline">Skip to timeline controls</a>
		{/if}
	</nav>

	<MenuBar />
	<SubNav />

	<div class="body">
		<Viewport>
			{@render children()}
		</Viewport>
		<Inspector />
	</div>

	{#if hasDock}
		<TimeDock />
	{/if}
</div>

{#if app.searchOpen}
	<SearchPalette />
{/if}

{#if !booted && !isDoc}
	<BootScreen onDone={finishBoot} />
{/if}

<Cursor />
<TourOverlay />

<style>
	/* The application window. Fixed height, no page scroll — panes scroll
	   internally. This is the structural difference between an instrument and a
	   document, and everything else about the OS feel follows from it. */
	.os {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: stretch;
	}

	/* Off-screen until focused, then a real, visible target. */
	.skip {
		position: absolute;
		z-index: 700;
		top: 0;
		inset-inline-start: 0;
	}
	.skip a {
		position: absolute;
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
	.skip a:nth-child(2):focus-visible {
		inset-inline-start: 150px;
	}
</style>
