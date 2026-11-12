<script lang="ts">
	import '../app.css';
	import { onMount, type Component } from 'svelte';
	import { page } from '$app/state';
	import { app } from '$lib/state.svelte';
	import { initTheme, theme } from '$lib/design/theme.svelte';
	import { dirFor } from '$lib/i18n';
	import { rememberPath } from '$lib/shell/nav.svelte';
	import { tour } from '$lib/shell/tour.svelte';
	import { ownsPreviewTags } from '$lib/shell/preview';
	import { t } from '$lib/t.svelte';
	import MenuBar from '$lib/shell/MenuBar.svelte';
	import SubNav from '$lib/shell/SubNav.svelte';
	import Cursor from '$lib/shell/Cursor.svelte';

	let { children } = $props();

	/** Share pages are redirect stubs: they render no shell and load no app JavaScript (csr = false). */
	const isShare = $derived(page.url.pathname.startsWith('/share/'));
	const dir = $derived(dirFor(app.locale));
	const ownsPreview = $derived(ownsPreviewTags(page.url.pathname));

	/**
	 * The palette is fetched the first time a reader opens it. A static import
	 * would put its chunk on every page before anyone asked to search.
	 */
	let Palette = $state<Component | null>(null);
	$effect(() => {
		if (!app.searchOpen || Palette) return;
		void import('$lib/components/SearchPalette.svelte').then((m) => (Palette = m.default));
	});

	onMount(() => initTheme());

	// Remember where each section was left, so crossing between Graph and Agora and
	// back returns the reader to the view they were reading. See nav.svelte.ts.
	$effect(() => {
		rememberPath(page.url);
	});

	// Charts follow the theme through CSS variables, so nothing else needs to be
	// invalidated here. Do not add a counter — writing state that this effect also
	// reads self-triggers and Svelte aborts the whole tree.
	$effect(() => {
		document.documentElement.dataset.theme = theme.resolved;
	});

	$effect(() => {
		document.documentElement.setAttribute('dir', dir);
		document.documentElement.setAttribute('lang', app.locale);
	});

	/*
	 * The keys every page uses: search, the theme, and Escape. The instruments add
	 * their transport keys on top (their own layout).
	 */
	function onKey(e: KeyboardEvent) {
		/* The tour is modal: while it is open, the shell stands down. */
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
		}
	}
</script>

<svelte:head>
	{#if !ownsPreview}
		<link rel="canonical" href={`https://deeptunisia.org${page.url.pathname.replace(/\/$/, '')}`} />
	{/if}
</svelte:head>

<svelte:window onkeydown={onKey} />

{#if isShare}
	{@render children()}
{:else}
	<div class="os" class:inspecting={Boolean(app.selected)}>
		<!--
			Skip link. Not boilerplate: the instrument views put hundreds of focusable
			nodes in the tab order (the Chronicle alone has one per tenure), so without
			this a keyboard user has to traverse 70+ chart bars before reaching the
			view. The instruments add a second link to their transport controls.
		-->
		<nav class="skip" aria-label={t('skip.links')}>
			<a href="#view">{t('skip.view')}</a>
		</nav>

		<MenuBar />
		<SubNav />

		{@render children()}
	</div>

	{#if app.searchOpen && Palette}
		<Palette />
	{/if}

	<Cursor />
{/if}

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
</style>
