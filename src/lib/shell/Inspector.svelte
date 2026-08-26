<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { ds, institutionById, personById } from '$lib/model';
	import { t } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import EntityPanel from '$lib/components/EntityPanel.svelte';
	import RecordPanel from '$lib/components/RecordPanel.svelte';

	/**
	 * W4 — the weak-chain advisory. meta.pathAudit carries the connected
	 * components of the all-weak influence subgraph (every edge inferred or
	 * unsubstantiated, spanning more than one hop). If the selected entity sits
	 * in one, the inspector says so above the record — the graph's own answer
	 * to "this looks like a path of influence" before the reader is shown the
	 * record. Warn-only by construction; the build never gates on it.
	 */
	const weakChain = $derived(
		(ds.meta.pathAudit?.chains ?? []).find((c) => c.entities.includes(app.selected ?? '')) ?? null
	);

	/**
	 * The inspector pane.
	 *
	 * Docked rather than floating on a wide screen: it takes width from the viewport
	 * instead of covering it, so the reader can keep a person selected while scrubbing
	 * the timeline and watch the Chronicle behind it respond. A modal overlay would
	 * make selection and time-travel mutually exclusive, which is exactly the pairing
	 * the whole app is built around.
	 *
	 * ON A PHONE IT BECOMES A SHEET, NOT A FULL-SCREEN TAKEOVER
	 *
	 * Same argument, different geometry. A card that covers the screen breaks the
	 * pairing just as surely as a modal does, so the sheet has two detents and rests
	 * at the lower one: enough to read who this is and their most recent office, with
	 * the timeline still visible and still working underneath. Dragging up commits to
	 * reading; dragging down dismisses.
	 *
	 * The detents are heights rather than a scroll position on purpose — a sheet that
	 * grows as you scroll it fights the reader for control of the same gesture.
	 */

	let detent = $state<'peek' | 'full'>('peek');

	/** Live drag offset in pixels, positive downward. Zero when not dragging. */
	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;

	/*
	 * A new selection always opens at the peek height. Leaving a sheet expanded from
	 * the previous entity means tapping a node buries the map you tapped it on.
	 * `detent` is written but never read here, so this cannot self-trigger.
	 */
	$effect(() => {
		void app.selected;
		detent = 'peek';
		dragY = 0;
	});

	function onDown(e: PointerEvent) {
		dragging = true;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onMove(e: PointerEvent) {
		if (!dragging) return;
		const dy = e.clientY - startY;
		// Resist upward drag past the full detent so the sheet cannot be thrown off
		// the top of the screen, while still acknowledging the gesture.
		dragY = dy < 0 && detent === 'full' ? dy * 0.25 : dy;
	}

	function onUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

		const dy = dragY;
		dragY = 0;

		if (dy < -48) detent = 'full';
		else if (dy > 110) {
			// From peek, a decisive downward drag dismisses. From full it returns to
			// peek first, so one gesture never both collapses and closes.
			if (detent === 'full') detent = 'peek';
			else app.selected = null;
		} else if (dy > 48 && detent === 'full') detent = 'peek';
	}

	/** Tapping the handle is the keyboard- and precision-friendly equivalent. */
	function toggle() {
		detent = detent === 'peek' ? 'full' : 'peek';
	}
</script>

{#if app.selected}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="backdrop"
		onclick={() => (app.selected = null)}
		onkeydown={() => {}}
		role="presentation"
	></div>

	<aside
		class="inspector d-{detent}"
		class:dragging
		aria-label="Entity inspector"
		style:--drag="{dragY}px"
	>
		{#if compact.current}
			<!--
				The drag handle. A button, not a bare div: expanding and collapsing has to
				be reachable without a pointer, and "drag me" is not something a screen
				reader can act on.
			-->
			<button
				class="handle"
				onpointerdown={onDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onUp}
				onclick={toggle}
				aria-expanded={detent === 'full'}
				aria-label={detent === 'full' ? 'Collapse panel' : 'Expand panel'}
			>
				<span class="grip"></span>
			</button>
		{/if}

		<div class="inner">
			{#if personById.has(app.selected) || institutionById.has(app.selected)}
				{#if weakChain}
					<div class="weakchain" role="note">
						<span class="wc-label">{t('inspector.weakChain.title')}</span>
						<span
							>{format(app.locale, 'inspector.weakChain.body', {
								edges: weakChain.edges.length,
								depth: weakChain.depth
							})}</span
						>
					</div>
				{/if}
				<EntityPanel id={app.selected} />
			{:else}
				<!-- v0.0.2 records (contracts, licences, declarations, education,
				     events, companies) get their own card; a selection that is
				     neither entity nor record renders the fallback below. -->
				<RecordPanel id={app.selected} />
			{/if}
		</div>
	</aside>
{/if}

<style>
	.inspector {
		flex-shrink: 0;
		width: var(--inspector-w);
		border-inline-start: 1px solid var(--border-default);
		background: var(--surface-panel);
		box-shadow: var(--elev-2);
		display: flex;
		min-height: 0;
		animation: dock-in var(--dur-normal) var(--ease-out);
	}
	.inner {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* W4 — the weak-chain advisory. Same tint the project gives every other
	   number that counts against it; quiet by design, it is a note above the
	   record, not a verdict on it. */
	.weakchain {
		margin: var(--s-4);
		margin-block-end: 0;
		padding: var(--s-3) var(--s-4);
		border-inline-start: 2px solid var(--basis-inferred);
		background: color-mix(in oklch, var(--basis-inferred) 6%, transparent);
		font-size: var(--t-2xs);
		line-height: 1.55;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.wc-label {
		font-weight: 600;
		color: var(--basis-inferred);
	}

	.handle {
		display: none;
	}

	@keyframes dock-in {
		from {
			opacity: 0;
			transform: translateX(24px);
		}
	}
	:global([dir='rtl']) .inspector {
		animation-name: dock-in-rtl;
	}
	@keyframes dock-in-rtl {
		from {
			opacity: 0;
			transform: translateX(-24px);
		}
	}

	/* No backdrop while the panel is docked — it is part of the layout, not over it. */
	.backdrop {
		display: none;
	}

	/* ---------------------------------------------------------------------------
	   Tablet: an overlay, but still a side panel.
	   --------------------------------------------------------------------------- */

	@media (max-width: 1100px) and (min-width: 901px) {
		.inspector {
			position: fixed;
			inset-block: var(--chrome-h) var(--dock-h);
			inset-inline-end: 0;
			width: min(var(--inspector-w), 100vw);
			z-index: 45;
		}
		.backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 44;
			background: color-mix(in srgb, var(--surface-base) 55%, transparent);
		}
	}

	/* ---------------------------------------------------------------------------
	   Phone: a sheet above the dock.
	   --------------------------------------------------------------------------- */

	@media (max-width: 900px) {
		.inspector {
			position: fixed;
			/* Above the dock, never over it: the timeline has to stay usable while a
			   record is open, which is the entire reason this is a sheet and not a page. */
			inset: auto 0 calc(var(--dock-h) + var(--safe-b)) 0;
			width: auto;
			height: var(--sheet-h, 46dvh);
			flex-direction: column;
			border-inline-start: none;
			border-top: 1px solid var(--border-strong);
			border-radius: var(--r-xl) var(--r-xl) 0 0;
			box-shadow: var(--elev-4);
			z-index: 45;
			transform: translateY(var(--drag, 0px));
			animation: sheet-up var(--dur-normal) var(--ease-out);
			transition:
				height var(--dur-normal) var(--ease-out),
				transform var(--dur-normal) var(--ease-out);
		}
		/* While a finger is down, the sheet must track it exactly — a transition here
		   makes the drag feel like it is fighting back. */
		.inspector.dragging {
			transition: none;
		}
		.d-peek {
			--sheet-h: 46dvh;
		}
		.d-full {
			--sheet-h: calc(100dvh - var(--chrome-h) - var(--dock-h) - var(--s-4));
		}

		.handle {
			display: grid;
			place-items: center;
			flex-shrink: 0;
			width: 100%;
			height: 26px;
			touch-action: none;
			cursor: grab;
		}
		.handle:active {
			cursor: grabbing;
		}
		.grip {
			width: 38px;
			height: 4px;
			border-radius: var(--r-full);
			background: var(--border-strong);
			transition: background var(--dur-fast) var(--ease-out);
		}
		.handle:hover .grip {
			background: var(--text-faint);
		}
		.inspector.dragging .grip {
			background: var(--text-muted);
			width: 44px;
		}

		/* The map behind stays visible and legible: this sheet is a companion to it,
		   so dimming the whole screen would defeat the point. */
		.backdrop {
			display: none;
		}
	}

	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.inspector {
			animation: none;
		}
	}
</style>
