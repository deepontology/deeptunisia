<script lang="ts">
	import { page } from '$app/state';
	import { app } from '$lib/state.svelte';
	import { theme } from '$lib/design/theme.svelte';
	import { t } from '$lib/t.svelte';
	import { LOCALES, localeCoverage, type Locale } from '$lib/i18n';
	import { BUBBLES, bubbleFor, bubbleHref, isActive } from './nav.svelte';
	import Settings from './Settings.svelte';
	import ViewsSheet from './ViewsSheet.svelte';
	import Popover from '$lib/ui/Popover.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	/**
	 * The menu bar — tier one.
	 *
	 * Three bubbles: Graph (the sourced record), Media (the reading surfaces:
	 * investigations and the third-party feed), Agora (discussion and proposed
	 * changes). Media is architecturally connected to Graph — investigations are a
	 * narrative interface over the same evidence system — but gets its own
	 * navigation slot because the reading experience is fundamentally different
	 * from the instrument. See nav.svelte.ts.
	 *
	 * Everything narrower than the bubbles collapses: the wordmark first, then the
	 * search label, then the language switcher into Settings. The bubbles themselves
	 * never collapse — a phone reader has to be able to cross that line too.
	 */

	const current = $derived(bubbleFor(page.url.pathname));
	const activeBubble = $derived(BUBBLES.findIndex((b) => b.id === current.id));

	let settingsOpen = $state(false);
	let viewsOpen = $state(false);

	/*
	 * The phone bar names the view the reader is on, not the section: the name is
	 * the button that opens every other view. The Chronicle lives at /chronicle,
	 * which the navigation model names by the root route.
	 */
	const viewName = $derived.by(() => {
		const path = page.url.pathname === '/chronicle' ? '/' : page.url.pathname;
		const tab = page.url.searchParams.get('tab');
		const item = [...current.items, ...(current.docs ?? [])].find((i) => isActive(i, path, tab));
		return t(`nav.${(item ?? current).key}`);
	});
</script>

<header class="menubar" data-tour="chrome">
	<a class="brand" href="/" aria-label="DeepTunisia home">
		<span class="mark" aria-hidden="true">
			<svg viewBox="0 0 32 32" width="20" height="20">
				<g stroke="var(--accent)" stroke-width="1.7" fill="none" stroke-linecap="round">
					<path d="M16 6.5v6" /><path d="M8.5 26v-7" /><path d="M23.5 26v-7" />
					<path d="M8.5 19h15" />
				</g>
				<circle cx="16" cy="5" r="2.7" fill="var(--accent)" />
				<circle cx="8.5" cy="26.5" r="2.3" fill="var(--layer-security)" />
				<circle cx="23.5" cy="26.5" r="2.3" fill="var(--layer-economic)" />
			</svg>
		</span>
		<span class="word">Deep<b>Tunisia</b></span>
	</a>

	<!-- Compact only: one button carries the view's name and opens every view.
	     It replaces the bubbles and the tab strip, which cost a phone two rows. -->
	<button
		type="button"
		class="viewbtn"
		data-tour="viewmenu"
		aria-haspopup="dialog"
		aria-expanded={viewsOpen}
		onclick={() => (viewsOpen = !viewsOpen)}
	>
		<span class="viewbtn-name">{viewName}</span>
		<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true" class:flip={viewsOpen}>
			<path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
		</svg>
		<span class="sr">{t('nav.views.title')}</span>
	</button>
	<ViewsSheet open={viewsOpen} onclose={() => (viewsOpen = false)} />

	<nav
		class="bubbles"
		aria-label="Sections"
		style:--i={activeBubble}
		style:--n={BUBBLES.length}
		data-tour="bubbles"
	>
		<span class="pill" aria-hidden="true"></span>
		{#each BUBBLES as b (b.id)}
			<a
				href={bubbleHref(b)}
				class:on={current.id === b.id}
				aria-current={current.id === b.id ? 'page' : undefined}
			>
				<span class="dot" class:record={b.id === 'graph'} aria-hidden="true"></span>
				{t(`nav.${b.key}`)}
				{#if b.soon}
					<!-- The section is announced but not open. The badge is the honest
					     version of a placeholder tab: it says what the tab is and that
					     there is nothing behind it yet, in the same visual register a
					     chip uses — not the record's. On a phone the word cannot fit
					     three labelled bubbles (French alone spends 51px on it), so it
					     collapses to a dashed hollow dot — the project's provisional
					     marker, same vocabulary as the bubble dots — and the sr-only
					     word keeps saying it. -->
					<span class="soon"><span class="soon-word">{t('agora.soon.badge')}</span></span>
				{/if}
			</a>
		{/each}
	</nav>

	<div class="right">
		<button class="search" onclick={() => (app.searchOpen = true)} aria-label={t('ctl.search')}>
			<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
				<circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4" />
				<path
					d="M9.2 9.2 L12.5 12.5"
					stroke="currentColor"
					stroke-width="1.4"
					stroke-linecap="round"
				/>
			</svg>
			<span>{t('ctl.search')}</span>
			<kbd>/</kbd>
		</button>

		<div class="locale" role="radiogroup" aria-label={t('ctl.language')}>
			{#each LOCALES as l (l.id)}
				<Tooltip content="{l.native} — interface {localeCoverage(l.id)}% translated">
					<button
						role="radio"
						aria-checked={app.locale === l.id}
						class:on={app.locale === l.id}
						lang={l.id}
						onclick={() => app.setLocale(l.id as Locale)}
					>
						{l.id === 'ar' ? 'ع' : l.id.toUpperCase()}
					</button>
				</Tooltip>
			{/each}
		</div>

		<div class="anchor">
			<Tooltip content={t('nav.guide')}>
				<a
					class="help"
					href="/guide"
					aria-label={t('nav.guide')}
				>
					<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
						<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3" />
						<path
							d="M6.3 6.2a1.9 1.9 0 1 1 2.6 1.8c-.6.25-.9.6-.9 1.3v.4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.3"
							stroke-linecap="round"
						/>
						<circle cx="8" cy="12.1" r="0.9" fill="currentColor" />
					</svg>
				</a>
			</Tooltip>

			<button
				class="gear"
				class:on={settingsOpen}
				aria-expanded={settingsOpen}
				aria-haspopup="dialog"
				aria-label={t('set.title')}
				onclick={() => (settingsOpen = !settingsOpen)}
			>
				<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
					<circle
						cx="8"
						cy="8"
						r="2.5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.3"
					/>
					<path
						d="M8 1.4v1.6M8 13v1.6M2.35 4.7l1.4.8M12.25 10.5l1.4.8M2.35 11.3l1.4-.8M12.25 5.5l1.4-.8"
						stroke="currentColor"
						stroke-width="1.3"
						stroke-linecap="round"
					/>
				</svg>
				<!-- The current accent, shown on the control that changes it. -->
				<i class="swatch" aria-hidden="true"></i>
			</button>

			<Popover bind:open={settingsOpen} onclose={() => (settingsOpen = false)} label={t('set.title')}>
				<Settings />
			</Popover>
		</div>
	</div>
</header>

<style>
	.menubar {
		position: relative;
		z-index: var(--z-chrome);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--s-6);
		/*
		   The safe-area inset is inside the height, not beside it. app.html opts
		   into viewport-fit=cover, so under a notch this bar starts at y=0 beneath
		   the status bar; padding-top keeps the controls clear of the clock while
		   --chrome-h (which includes --safe-t) still describes the whole rail.
		*/
		height: calc(var(--menubar-h) + var(--safe-t));
		padding: var(--safe-t) calc(var(--s-5) + var(--safe-r)) 0 calc(var(--s-5) + var(--safe-l));
		background: color-mix(in oklch, var(--surface-panel) 90%, transparent);
		backdrop-filter: blur(18px) saturate(1.3);
		border-bottom: 1px solid var(--border-default);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		border: none;
		flex-shrink: 0;
		/* Full-rail hit area: the wordmark is 20px of content in a 44-52px bar,
		   and on a phone the whole thing should be tappable, not just the glyphs. */
		align-self: stretch;
	}
	.brand:hover {
		color: inherit;
	}
	.mark {
		display: grid;
		place-items: center;
		transition: transform var(--dur-slow) var(--ease-spring);
	}
	.brand:hover .mark {
		transform: rotate(-8deg) scale(1.08);
	}
	.word {
		font-size: var(--t-md);
		font-weight: 400;
		letter-spacing: var(--track-tight);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.word b {
		font-weight: 620;
		color: var(--text-primary);
	}

	/* --- tier one: the two bubbles --- */

	.bubbles {
		position: relative;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 2px;
		padding: 3px;
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		isolation: isolate;
	}
	.bubbles a {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		height: 28px;
		padding: 0 var(--s-6);
		font-size: var(--t-base);
		white-space: nowrap;
		color: var(--text-muted);
		border: none;
		border-radius: var(--r-full);
		transition: color var(--dur-fast) var(--ease-out);
	}
	.bubbles a:hover {
		color: var(--text-primary);
	}
	.bubbles a.on {
		color: var(--text-primary);
		font-weight: 560;
	}

	/*
		The "soon" badge on a section that is announced but not open. Uppercase
		mono micro-label, muted — it borrows the chip's register (reference, not
		record) so it can never be mistaken for a live count or a claim.
	*/
	.soon {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		line-height: 1;
		padding: 2px 4px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
		background: var(--surface-sunken);
	}

	/* One element that moves, so switching reads as one object sliding rather than
	   two backgrounds blinking. Same rule as the Segmented primitive. */
	.pill {
		position: absolute;
		z-index: 0;
		top: 3px;
		bottom: 3px;
		inset-inline-start: 3px;
		/* One slot per section, however many BUBBLES holds. */
		width: calc((100% - 6px) / var(--n));
		transform: translateX(calc(var(--i) * 100%));
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		box-shadow: var(--elev-1);
		transition: transform var(--dur-normal) var(--ease-spring);
	}
	:global([dir='rtl']) .pill {
		transform: translateX(calc(var(--i) * -100%));
	}

	/*
		The two dots are not decoration. Filled means "this is the sourced record";
		hollow means "this is not". It is the same distinction the basis colours make
		inside a view, restated at the level of the whole section, so the promise is
		visible before the reader has opened anything.
	*/
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1.5px solid currentColor;
		opacity: 0.55;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.dot.record {
		background: currentColor;
	}
	.bubbles a.on .dot {
		opacity: 1;
		color: var(--accent);
	}

	/* --- right cluster --- */

	.right {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-inline-start: auto;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		height: 28px;
		padding: 0 var(--s-4) 0 var(--s-5);
		font-size: var(--t-sm);
		color: var(--text-muted);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		transition:
			border-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}
	.search:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	kbd {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		border: 1px solid var(--border-default);
		border-radius: var(--r-xs);
		padding: 0 4px;
		line-height: 1.5;
	}

	.locale {
		display: flex;
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		overflow: hidden;
	}
	.locale button {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		min-width: 25px;
		height: 26px;
		color: var(--text-faint);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}
	.locale button:hover {
		color: var(--text-primary);
	}
	.locale button.on {
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 560;
	}

	.anchor {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.gear {
		position: relative;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--r-md);
		color: var(--text-muted);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.help {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--r-md);
		color: var(--text-muted);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.help:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.gear:hover,
	.gear.on {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.swatch {
		position: absolute;
		right: 2px;
		bottom: 2px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 1.5px var(--surface-panel);
	}
	:global([dir='rtl']) .swatch {
		right: auto;
		left: 2px;
	}

	@media (max-width: 1100px) {
		.locale {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.search span,
		kbd {
			display: none;
		}
		/* An icon among icons: no field chrome once the label has gone. */
		.search {
			width: 44px;
			height: 44px;
			padding: 0;
			justify-content: center;
			background: none;
			border-color: transparent;
		}
	}
	/* The view button exists for the compact bar only. */
	.viewbtn {
		display: none;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/*
	 * The compact bar: mark, the current view's name, search and settings, in one
	 * row of --menubar-h (which tokens.css sets to --bar-h here). The section
	 * bubbles and the tab strip give way to the view button and its sheet, which
	 * lists every view with what it answers; the Guide link is in that sheet too.
	 * Settings stays rather than a bare theme toggle because it also carries the
	 * language, which has nowhere else to go on a phone. Every control keeps the
	 * full 44px target.
	 */
	@media (max-width: 900px) {
		.menubar {
			gap: var(--s-2);
			padding-inline: calc(var(--s-3) + var(--safe-l)) calc(var(--s-3) + var(--safe-r));
		}
		.brand {
			/* The mark is 20px of glyphs; pad it to a real target without moving
			   its visual position (negative margin cancels the padding). */
			padding-inline: var(--s-4);
			margin-inline-start: calc(-1 * var(--s-3));
		}
		.bubbles,
		.help {
			display: none;
		}
		.viewbtn {
			display: inline-flex;
			align-items: center;
			gap: var(--s-3);
			flex: 1 1 auto;
			min-width: 0;
			height: var(--tap);
			padding: 0 var(--s-4);
			font-size: var(--t-md);
			font-weight: 560;
			color: var(--text-primary);
			border-radius: var(--r-md);
		}
		.viewbtn:hover,
		.viewbtn[aria-expanded='true'] {
			background: var(--surface-hover);
		}
		.viewbtn-name {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.viewbtn svg {
			flex: 0 0 auto;
			color: var(--text-muted);
			transition: transform var(--dur-fast) var(--ease-out);
		}
		.viewbtn svg.flip {
			transform: rotate(180deg);
		}
		.right,
		.anchor {
			gap: var(--s-1);
		}
		.gear {
			width: var(--tap);
			height: var(--tap);
		}
	}
	@media (max-width: 640px) {
		.word {
			display: none;
		}
	}
	@media (pointer: coarse) {
		.search {
			min-width: 44px;
			min-height: 44px;
		}
		.gear,
		.help {
			min-width: 44px;
			min-height: 44px;
		}
		.locale button {
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
