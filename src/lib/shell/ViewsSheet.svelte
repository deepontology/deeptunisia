<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { t } from '$lib/t.svelte';
	import { BUBBLES, isActive, type NavItem } from './nav.svelte';

	/**
	 * Every view, on one sheet: the phone's replacement for the section bubbles and
	 * the tab strip.
	 *
	 * Those two rows cost a phone 94px of standing chrome and still could not show
	 * what each view is for. Here every view is listed with the one sentence it
	 * answers (the same sentence the caption and /guide use), grouped by section,
	 * so choosing a view is reading a short menu rather than guessing at a label.
	 *
	 * BUILT FROM THE NAVIGATION MODEL, NOT BESIDE IT
	 *
	 * Groups and rows come from `BUBBLES` in nav.svelte.ts and nothing here names a
	 * section. A section added there appears here with no edit to this file; its
	 * rows show an answer line when the dictionary has `guide.<key>.answer` or
	 * `nav.<key>.hint`, and just the label when it has neither.
	 */

	interface Props {
		open: boolean;
		onclose(): void;
	}

	let { open, onclose }: Props = $props();

	const EXIT_MS = 200;

	let mounted = $state(untrack(() => open));
	let closing = $state(false);
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (open) {
			mounted = true;
			closing = false;
			return;
		}
		if (!mounted) return;
		closing = true;
		const timer = setTimeout(() => {
			closing = false;
			mounted = false;
		}, EXIT_MS);
		return () => clearTimeout(timer);
	});

	const tab = $derived(browser ? page.url.searchParams.get('tab') : null);
	/* The Chronicle lives at /chronicle; the model names it by the root route. */
	const path = $derived(page.url.pathname === '/chronicle' ? '/' : page.url.pathname);

	function current(item: NavItem): boolean {
		return isActive(item, path, tab);
	}

	/** The sentence a row carries: the guide's answer, else the strip's hint. */
	function answer(key: string): string | null {
		for (const k of [`guide.${key}.answer`, `nav.${key}.hint`]) {
			const s = t(k);
			if (s !== k) return s;
		}
		return null;
	}

	$effect(() => {
		if (!open || !panel) return;
		const here = panel.querySelector<HTMLElement>('[aria-current="page"]');
		(here ?? panel.querySelector<HTMLElement>('button') ?? panel).focus({ preventScroll: true });
		here?.scrollIntoView({ block: 'nearest' });
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.parentNode?.removeChild(node);
			}
		};
	}
</script>

{#if mounted}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="vs-scrim" class:closing role="presentation" onclick={onclose} use:portal></div>

	<div
		class="vs"
		class:closing
		bind:this={panel}
		use:portal
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label={t('nav.views.title')}
		onkeydown={onKey}
	>
		<header class="vs-head">
			<h2 class="vs-title">{t('nav.views.title')}</h2>
			<button type="button" class="vs-close" onclick={onclose} aria-label={t('nav.views.close')}
				>&#215;</button
			>
		</header>

		<nav class="vs-body" aria-label={t('nav.views.title')}>
			{#each BUBBLES as b (b.id)}
				<section class="vs-group">
					<h3 class="vs-group-head">
						<span class="dot" class:record={b.id === 'graph'} aria-hidden="true"></span>
						{t(`nav.${b.key}`)}
						{#if b.soon}<span class="soon">{t('agora.soon.badge')}</span>{/if}
					</h3>
					<ul class="vs-list">
						{#each b.items as item (item.href)}
							{@const line = answer(item.key)}
							<li>
								<a
									class="vs-row"
									href={item.href}
									aria-current={current(item) ? 'page' : undefined}
									onclick={onclose}
								>
									<span class="vs-name">{t(`nav.${item.key}`)}</span>
									{#if line}<span class="vs-answer">{line}</span>{/if}
								</a>
							</li>
						{/each}
					</ul>
					{#if b.docs}
						<ul class="vs-docs" aria-label={t('nav.docs')}>
							{#each b.docs as item (item.href)}
								<li>
									<a
										class="vs-doc"
										href={item.href}
										aria-current={current(item) ? 'page' : undefined}
										onclick={onclose}>{t(`nav.${item.key}`)}</a
									>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</nav>
	</div>
{/if}

<style>
	.vs-scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-scrim);
		background: color-mix(in oklch, var(--surface-base) 60%, transparent);
		animation: vs-fade var(--dur-fast) var(--ease-out);
	}
	.vs-scrim.closing {
		opacity: 0;
		transition: opacity var(--dur-fast) var(--ease-in-out);
	}

	/*
	   Hangs from the top bar and runs to the bottom of the screen: the button
	   that opened it stays visible above it, so the sheet reads as that button's
	   menu, and the whole height is list.
	*/
	.vs {
		position: fixed;
		inset-block: calc(var(--menubar-h) + var(--safe-t)) 0;
		inset-inline: 0;
		z-index: var(--z-modal);
		display: flex;
		flex-direction: column;
		background: var(--surface-panel);
		border-top: 1px solid var(--border-default);
		padding-inline: var(--safe-l) var(--safe-r);
		padding-block-end: var(--safe-b);
		animation: vs-drop var(--dur-normal) var(--ease-out);
	}
	.vs.closing {
		opacity: 0;
		transform: translateY(-8px);
		transition:
			opacity var(--dur-fast) var(--ease-in-out),
			transform var(--dur-fast) var(--ease-in-out);
	}
	.vs:focus {
		outline: none;
	}

	.vs-head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		padding-inline: var(--s-5) var(--s-2);
		border-bottom: var(--rule);
	}
	.vs-title {
		flex: 1;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 500;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.vs-close {
		width: var(--tap);
		height: var(--tap);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: var(--t-xl);
		line-height: 1;
		color: var(--text-muted);
		border-radius: var(--r-md);
	}
	.vs-close:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	.vs-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--s-2) 0 var(--s-8);
	}

	.vs-group + .vs-group {
		border-top: var(--rule);
	}
	.vs-group-head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin: 0;
		padding: var(--s-5) var(--s-5) var(--s-2);
		font-size: var(--t-xs);
		font-weight: 560;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	/* Filled: the sourced record. Hollow: not the record. Same as the bubbles. */
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1.5px solid currentColor;
	}
	.dot.record {
		background: currentColor;
	}
	.soon {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 400;
		padding: 1px 5px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
	}

	.vs-list,
	.vs-docs {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.vs-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: var(--tap);
		justify-content: center;
		padding: var(--s-3) var(--s-5);
		border: none;
		border-inline-start: 2px solid transparent;
		color: inherit;
	}
	.vs-row:hover {
		background: var(--surface-hover);
	}
	.vs-row[aria-current='page'] {
		border-inline-start-color: var(--accent);
		background: var(--accent-muted);
	}
	.vs-name {
		font-size: var(--t-md);
		font-weight: 520;
		color: var(--text-primary);
	}
	.vs-answer {
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-muted);
	}

	/* Reference pages: demoted to a wrap of plain links, as in the strip. */
	.vs-docs {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--s-1);
		padding: var(--s-2) var(--s-3) var(--s-4);
	}
	.vs-doc {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-muted);
		border: none;
		border-radius: var(--r-md);
	}
	.vs-doc:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.vs-doc[aria-current='page'] {
		color: var(--accent);
	}

	@keyframes vs-drop {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
	}
	@keyframes vs-fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.vs,
		.vs-scrim {
			animation: none;
		}
	}
</style>
