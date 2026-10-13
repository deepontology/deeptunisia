<script lang="ts">
	import { untrack } from 'svelte';
	import { format } from '$lib/i18n';
	import { app } from '$lib/state.svelte';
	import { BASIS_COLOR, BASIS_OPACITY, DASH, eventById, type EventRec } from '$lib/model';
	import { eventTitle, formatDate, t, tf } from '$lib/t.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { sheetDrag, type SheetDragParams } from '$lib/ui/sheet-drag';

	/**
	 * The list behind a count badge.
	 *
	 * A badge on the spine is a promise: N events sat within 14px of each other,
	 * and this is where they are named. Rows are in the order the spine drew them,
	 * oldest first, each with the exact date the sources give it and the basis dot
	 * the mark on the spine carries — so opening the sheet is never how the reader
	 * learns what the mark meant.
	 *
	 * A SHEET, NOT A POPOVER
	 *
	 * The vertical Chronicle is a phone view, and a popover anchored to a 14px
	 * pill is unusable with a thumb. This is the same bottom sheet the inspector
	 * uses — one handle, one drag gesture, one dismissal — and it rests above the
	 * dock so the timeline underneath stays live.
	 */

	interface Props {
		open: boolean;
		/** Event ids, oldest first. */
		ids: string[];
		onpick(eventIds: string[]): void;
		onclose(): void;
	}

	let { open, ids, onpick, onclose }: Props = $props();

	/** Matches the exit transition below, so the DOM leaves exactly when it ends. */
	const EXIT_MS = 260;

	/*
	 * The seed value only — `untrack` because every later change is the effect's
	 * business, not this initialiser's.
	 */
	let mounted = $state(untrack(() => open));
	let closing = $state(false);
	let panel = $state<HTMLElement | null>(null);

	/*
	 * Mount with `open`, stay mounted through the exit so the sheet slides away
	 * instead of vanishing on the frame `open` turns false.
	 */
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

	const rows = $derived(
		ids.map((id) => eventById.get(id)).filter((e): e is EventRec => e !== undefined)
	);

	/**
	 * The range the sheet names. Assembled from the dictionary's own range
	 * sentence rather than a dash typed here, so a badge's tooltip, the sheet
	 * heading and every post interval on the site punctuate a range the same way.
	 */
	const heading = $derived.by(() => {
		if (rows.length === 0) return '';
		const first = rows[0].interval.startEarliest;
		const last = rows[rows.length - 1].interval.startEarliest;
		return tf('chronicle.vertical.spine.cluster', {
			n: rows.length,
			range: format(app.locale, 'interval.range', {
				start: formatDate(first, 'day'),
				end: formatDate(last, 'day')
			})
		});
	});

	const dragParams: SheetDragParams = {
		enabled: () => compact.current && mounted,
		detent: () => 'full',
		setDetent: () => {},
		dismiss: () => onclose(),
		hasPeek: () => false,
		handle: '.sheet-handle'
	};

	/** Out of the chart and out of its scroll container, so nothing clips or shifts it. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.parentNode?.removeChild(node);
			}
		};
	}

	$effect(() => {
		if (!open || !panel) return;
		const first = panel.querySelector<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		(first ?? panel).focus({ preventScroll: true });
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}
</script>

{#if mounted}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="cv-sheet-scrim" role="presentation" onclick={onclose} use:portal></div>

	<!--
		role="dialog" rather than "group": the sheet takes focus, handles Escape and
		is dismissed by the scrim. aria-modal is false because the rest of the app
		stays reachable — nothing here is a decision the reader must make first.
	-->
	<div
		class="cv-sheet"
		class:closing
		bind:this={panel}
		use:portal
		use:sheetDrag={dragParams}
		tabindex="-1"
		role="dialog"
		aria-modal="false"
		aria-label={heading}
		onkeydown={onKey}
	>
		<span class="sheet-handle" aria-hidden="true"><i class="sheet-grip"></i></span>

		<header class="cv-sheet-head">
			<h2 class="cv-sheet-title" dir="auto">{heading}</h2>
			<button
				type="button"
				class="cv-sheet-close"
				onclick={onclose}
				aria-label={t('chronicle.vertical.spine.close')}>&#215;</button
			>
		</header>

		<ul class="cv-sheet-body sheet-scroll">
			{#each rows as e (e.id)}
				<li>
					<button type="button" class="cv-row" onclick={() => onpick([e.id])}>
						<!-- The same basis encoding the spine's mark carries: colour,
						     opacity and dash, so the four tiers never look alike. -->
						<svg class="cv-row-basis" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
							<circle
								cx="6"
								cy="6"
								r="4"
								fill="none"
								stroke={BASIS_COLOR[e.basis]}
								stroke-opacity={BASIS_OPACITY[e.basis]}
								stroke-width="1.6"
								stroke-dasharray={DASH[e.basis]}
							/>
						</svg>
						<span class="cv-row-date mono">{formatDate(e.interval.startEarliest, 'day')}</span>
						<span class="cv-row-title" dir="auto">{eventTitle(e)}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.cv-sheet-scrim {
		position: fixed;
		inset: 0;
		/*
		   One step under the sheet, which is also one step under the dock: the
		   scrim catches taps on the canvas, and the dock stays live so the reader
		   can keep scrubbing while the list is open.
		*/
		z-index: calc(var(--z-sheet) - 1);
	}

	.cv-sheet {
		position: fixed;
		inset-inline: 0;
		inset-block-end: calc(var(--dock-h) + var(--safe-b));
		z-index: var(--z-sheet);
		max-height: min(70dvh, 520px);
		display: flex;
		flex-direction: column;
		background: var(--surface-panel);
		border-top: 1px solid var(--border-strong);
		border-radius: var(--r-xl) var(--r-xl) 0 0;
		box-shadow: var(--elev-4);
		padding-inline: var(--safe-l) var(--safe-r);
		transform: translateY(var(--sheet-y, 0px));
		animation: sheet-up var(--dur-normal) var(--ease-out);
		transition: transform var(--dur-normal) var(--ease-out);
	}
	.cv-sheet.closing {
		transform: translateY(100%);
		transition: transform var(--dur-normal) var(--ease-in-out);
	}

	.cv-sheet-head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: var(--s-4);
		padding-inline: var(--s-4);
		border-bottom: var(--rule);
	}
	.cv-sheet-title {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding-block: var(--s-4);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 500;
		letter-spacing: var(--track-wide);
		color: var(--text-secondary);
	}
	.cv-sheet-close {
		flex: 0 0 auto;
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
	.cv-sheet-close:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	.cv-sheet-body {
		flex: 1;
		min-height: 0;
		list-style: none;
		margin: 0;
		padding: var(--s-2) var(--s-2) var(--s-4);
	}

	.cv-row {
		display: grid;
		grid-template-columns: 10px auto 1fr;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		min-height: var(--tap);
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		text-align: start;
	}
	.cv-row:hover {
		background: var(--surface-hover);
	}
	.cv-row-basis {
		flex: 0 0 auto;
	}
	.cv-row-date {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.cv-row-title {
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.cv-row:hover .cv-row-title {
		color: var(--text-primary);
	}

	/*
	   Wide screens: an anchored card rather than a sheet. The vertical Chronicle
	   mounts below the compact breakpoint, so this is the branch a desktop reader
	   sees only if the view is ever mounted there — but a bottom sheet with a grab
	   rail on a 27" monitor is theatre, and the rail is already hidden by the
	   shared sheet rules.
	*/
	@media (min-width: 901px) {
		.cv-sheet-scrim {
			background: color-mix(in oklch, var(--surface-base) 55%, transparent);
		}
		.cv-sheet {
			inset: auto;
			inset-inline-start: 50%;
			top: 50%;
			width: min(360px, calc(100vw - var(--s-8)));
			max-height: min(70vh, 520px);
			border: 1px solid var(--border-default);
			border-radius: var(--r-lg);
			box-shadow: var(--elev-3);
			transform: translate(-50%, -50%);
			animation: rise-in var(--dur-fast) var(--ease-out);
		}
		.cv-sheet.closing {
			opacity: 0;
			transform: translate(-50%, -46%);
			transition:
				opacity var(--dur-normal) var(--ease-in-out),
				transform var(--dur-normal) var(--ease-in-out);
		}
	}

	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cv-sheet {
			animation: none;
		}
	}
</style>
