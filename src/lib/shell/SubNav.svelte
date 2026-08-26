<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { t } from '$lib/t.svelte';
	import { bubbleFor, isActive, type NavItem } from './nav.svelte';
	import Popover from '$lib/ui/Popover.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	/**
	 * The sub-navigation — tier two.
	 *
	 * A horizontally scrollable strip rather than a wrapping row. Wrapping changes
	 * the height of fixed chrome, which moves the viewport under the reader every
	 * time they resize; scrolling keeps the shell's geometry constant, which is what
	 * lets --chrome-h stay a token every view can trust.
	 *
	 * The strip is scrolled to reveal the active item on mount, so arriving on a
	 * narrow screen at a view whose label sits off the right edge does not look like
	 * the label is missing.
	 */

	const bubble = $derived(bubbleFor(page.url.pathname));
	const tab = $derived(browser ? page.url.searchParams.get('tab') : null);

	let strip = $state<HTMLDivElement | null>(null);
	let docsOpen = $state(false);

	/**
	 * Keep the current item in view when the route changes or the strip mounts.
	 *
	 * Deliberately NOT `scrollIntoView`. That method scrolls every scrollable ancestor,
	 * and `overflow: hidden` only stops a *user* from scrolling an element — it stays
	 * scriptable. So on a narrow screen, revealing an item near the right edge panned
	 * the entire fixed application shell sideways, taking the menu bar and the whole
	 * viewport with it. Setting scrollLeft on the strip touches nothing else.
	 */
	$effect(() => {
		// Read these so the effect re-runs on navigation.
		void page.url.pathname;
		void tab;

		const el = strip?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!el || !strip) return;

		const pad = 16;
		const left = el.offsetLeft - strip.offsetLeft;
		const right = left + el.offsetWidth;
		if (left - pad < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - pad);
		else if (right + pad > strip.scrollLeft + strip.clientWidth) {
			strip.scrollLeft = right + pad - strip.clientWidth;
		}
	});

	function active(item: NavItem) {
		return isActive(item, page.url.pathname, tab);
	}

	const docsActive = $derived((bubble.docs ?? []).some(active));
</script>

<nav class="subnav" aria-label={t(`nav.${bubble.key}`)}>
	<div class="strip" bind:this={strip} data-tour="views">
		{#each bubble.items as item (item.href)}
			<Tooltip content={t(`nav.${item.key}.hint`)}>
				<a
					href={item.href}
					class:on={active(item)}
					aria-current={active(item) ? 'page' : undefined}
				>
					{t(`nav.${item.key}`)}
				</a>
			</Tooltip>
		{/each}

		{#if bubble.docs}
			<span class="rule" aria-hidden="true"></span>
			<!--
				Reference material, kept in the strip but visually demoted. It belongs to
				Graph — methodology, corrections and the evidence ledger are statements
				about the record — but it is not an instrument, and giving it equal weight
				made six instruments look like eleven of something.
			-->
			{#each bubble.docs as item (item.href)}
				<a
					class="doc"
					href={item.href}
					class:on={active(item)}
					aria-current={active(item) ? 'page' : undefined}
				>
					{t(`nav.${item.key}`)}
				</a>
			{/each}
		{/if}
	</div>

	{#if bubble.docs}
		<div class="anchor">
			<button
				class="more"
				class:on={docsOpen || docsActive}
				aria-expanded={docsOpen}
				aria-haspopup="menu"
				onclick={() => (docsOpen = !docsOpen)}
			>
				{t('nav.docs')}
				<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" class:flip={docsOpen}>
					<path
						d="M2 4 L5 7 L8 4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
					/>
				</svg>
			</button>

			<Popover bind:open={docsOpen} onclose={() => (docsOpen = false)} label={t('nav.docs')}>
				<div class="menu" role="menu">
					{#each bubble.docs as item (item.href)}
						<a
							role="menuitem"
							href={item.href}
							class:on={active(item)}
							onclick={() => (docsOpen = false)}
						>
							{t(`nav.${item.key}`)}
						</a>
					{/each}
					<!-- The framing disclaimer. The fixed shell has no footer, but the
					     commitment does not disappear with the layout. -->
					<p class="note">{t('footer.disclaimer')}</p>
				</div>
			</Popover>
		</div>
	{/if}
</nav>

<style>
	.subnav {
		position: relative;
		z-index: 35;
		flex-shrink: 0;
		display: flex;
		align-items: stretch;
		height: var(--subnav-h);
		padding-inline: calc(var(--s-5) + var(--safe-l)) calc(var(--s-5) + var(--safe-r));
		background: color-mix(in oklch, var(--surface-raised) 82%, transparent);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--border-subtle);
	}

	.strip {
		display: flex;
		align-items: stretch;
		gap: var(--s-2);
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
	}
	.strip::-webkit-scrollbar {
		display: none;
	}

	a {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--s-5);
		font-size: var(--t-base);
		white-space: nowrap;
		color: var(--text-muted);
		border: none;
		border-bottom: 2px solid transparent;
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	a:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	a.on {
		color: var(--text-primary);
		font-weight: 540;
		border-bottom-color: var(--accent);
	}
	/* Documents are reference, not instruments: same strip, lower voice. */
	a.doc {
		font-size: var(--t-sm);
		color: var(--text-faint);
	}

	/* Each tab is wrapped in a Tooltip, so the strip's flex items are the tooltip
	   anchors (stretched to the full rail) and the links inside them sat at text
	   height — a 42px rail of 20px-tall targets. Let the link fill its anchor:
	   the whole rail becomes the hit area. */
	.strip :global(.tt-anchor) {
		align-items: stretch;
	}
	.strip :global(.tt-anchor a) {
		flex: 1;
	}
	a.doc:hover,
	a.doc.on {
		color: var(--text-secondary);
	}

	.rule {
		flex-shrink: 0;
		align-self: center;
		width: 1px;
		height: 16px;
		margin-inline: var(--s-4);
		background: var(--border-default);
	}

	/* --- collapsed docs menu, narrow screens only --- */

	.anchor {
		position: relative;
		display: none;
		align-items: center;
		margin-inline-start: auto;
		padding-inline-start: var(--s-4);
	}
	.more {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		height: 26px;
		padding: 0 var(--s-4);
		font-size: var(--t-sm);
		color: var(--text-faint);
		border-radius: var(--r-md);
		white-space: nowrap;
	}
	.more:hover,
	.more.on {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.more svg {
		transition: transform var(--dur-fast) var(--ease-out);
	}
	.more svg.flip {
		transform: rotate(180deg);
	}

	.menu {
		min-width: 180px;
		padding: var(--s-3);
	}
	.menu a {
		display: block;
		min-height: 34px;
		align-items: center;
		padding: var(--s-3) var(--s-5);
		border-bottom: none;
		border-radius: var(--r-sm);
		color: var(--text-secondary);
	}
	.menu a.on {
		color: var(--accent);
		background: var(--accent-muted);
	}
	.note {
		max-width: 32ch;
		margin: var(--s-4) var(--s-2) var(--s-1);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-2xs);
		line-height: var(--lh-snug);
		color: var(--text-faint);
	}

	/*
		Below this width the strip cannot hold eleven labels, so the five documents
		fold into a menu and the six instruments keep the strip to themselves.
	*/
	@media (max-width: 1100px) {
		.strip .doc,
		.strip .rule {
			display: none;
		}
		.anchor {
			display: flex;
		}
	}

	@media (max-width: 900px) {
		a {
			padding: 0 var(--s-4);
		}
		.subnav {
			padding-inline: calc(var(--s-3) + var(--safe-l)) calc(var(--s-3) + var(--safe-r));
		}
		/* A fading edge, so a strip with more items off-screen looks scrollable
		   rather than truncated. */
		.strip {
			mask-image: linear-gradient(to right, transparent 0, black 12px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.strip {
			scroll-behavior: auto;
		}
	}
</style>
