<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '$lib/state.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { ds, institutionById, personById, relationshipById } from '$lib/model';
	import { basisLabel, entityName, relLabel, t, tf } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { INFLUENCE_CARRYING_TYPES, intervalsOverlap } from '$lib/interpretation';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import EntityPanel from '$lib/components/EntityPanel.svelte';
	import RecordPanel from '$lib/components/RecordPanel.svelte';
	import { sheetDrag, type SheetDragParams } from '$lib/ui/sheet-drag';

	/**
	 * The panel outlives the selection by one transition.
	 *
	 * `panelId` is what the card renders; `closing` drives the exit animation.
	 * Without it the pane unmounted the instant a selection cleared, so it
	 * snapped away while the chart snapped back — the most jarring part of the
	 * old behaviour. Now the chart gives way and closes smoothly.
	 */
	let panelId = $state<string | null>(null);
	let closing = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * The close timer matches the exit transition, not a fixed guess.
	 *
	 * The two exits differ: on a phone the sheet slides away in --dur-normal
	 * (240ms), while the docked panel animates its width over --dur-slow
	 * (380ms). A phone-sized timer on the wide layout unmounted the pane 100ms
	 * before its own animation ended, which read as a snap at the end.
	 */
	const CLOSE_PHONE_MS = 280;
	const CLOSE_WIDE_MS = 420;

	/** What the advisories and content branch read — live id, or the one leaving. */
	const panelSel = $derived(app.selected ?? panelId);

	$effect(() => {
		const sel = app.selected;
		if (sel !== null) {
			clearTimeout(closeTimer);
			closing = false;
			panelId = sel;
		} else {
			// untrack: we only act on the selection turning null, not on our own writes.
			const had = untrack(() => panelId);
			if (had !== null) {
				closing = true;
				closeTimer = setTimeout(() => {
					panelId = null;
					closing = false;
				}, compact.current ? CLOSE_PHONE_MS : CLOSE_WIDE_MS);
			}
		}
	});

	/** Never let a pending close tick outlive the component. */
	$effect(() => () => clearTimeout(closeTimer));

	/**
	 * W4 — the weak-chain advisory. meta.pathAudit carries the connected
	 * components of the all-weak influence subgraph (every edge inferred or
	 * unsubstantiated, spanning more than one hop). If the selected entity sits
	 * in one, the inspector says so above the record — the graph's own answer
	 * to "this looks like a path of influence" before the reader is shown the
	 * record. Warn-only by construction; the build never gates on it.
	 */
	const weakChain = $derived(
		(ds.meta.pathAudit?.chains ?? []).find((c) => c.entities.includes(panelSel ?? '')) ?? null
	);

	/**
	 * L3 interpretation advisories (warn-only). Each is an undirected 2-3 hop
	 * path flagged for a different reason. Surface above the record as quiet
	 * notes — they are advisories about how to read the chain, not verdicts
	 * on the entities themselves. See src/lib/interpretation.ts.
	 */
	const temporalChain = $derived(
		((ds.meta as unknown as { interpretationAudit?: { temporal: { entities: string[]; edges: string[]; depth: number; reason?: string }[] } }).interpretationAudit?.temporal ?? []).find((c) =>
			c.entities.includes(panelSel ?? '')
		) ?? null
	);
	const typeChain = $derived(
		((ds.meta as unknown as { interpretationAudit?: { typeIncompatible: { entities: string[]; edges: string[]; depth: number; reason?: string }[] } }).interpretationAudit?.typeIncompatible ?? []).find((c) =>
			c.entities.includes(panelSel ?? '')
		) ?? null
	);
	const confidenceChain = $derived(
		((ds.meta as unknown as { interpretationAudit?: { lowConfidence: { entities: string[]; edges: string[]; depth: number; reason?: string }[] } }).interpretationAudit?.lowConfidence ?? []).find((c) =>
			c.entities.includes(panelSel ?? '')
		) ?? null
	);

	/**
	 * The advisories as reading notes, in names rather than record ids.
	 *
	 * The audit stores each chain's edges and a `reason` written for the build log,
	 * which names edges by id and grades by code. A reader needs the people at either
	 * end of the link and the word for what it rests on, so each note is rebuilt here
	 * from the chain's own edges: the first pair that does not overlap in time, the
	 * first link that is not an influence channel, the weakest link and its basis.
	 * The notes sit under the entity's name, folded into one disclosure: identity
	 * first, then how to read the chains it sits in.
	 */
	type NoteKind = 'weak' | 'temporal' | 'type' | 'confidence';
	interface Note {
		kind: NoteKind;
		title: string;
		body: string;
	}

	function link(id: string | undefined): string {
		const r = id ? relationshipById.get(id) : undefined;
		return r ? tf('inspector.note.link', { from: entityName(r.from), to: entityName(r.to) }) : '';
	}

	const notes = $derived.by<Note[]>(() => {
		const out: Note[] = [];
		if (weakChain) {
			out.push({
				kind: 'weak',
				title: t('inspector.weakChain.title'),
				body: format(app.locale, 'inspector.weakChain.body', {
					edges: weakChain.edges.length,
					depth: weakChain.depth
				})
			});
		}
		if (temporalChain) {
			const rels = temporalChain.edges.map((id) => relationshipById.get(id));
			let i = 0;
			while (i < rels.length - 1) {
				const a = rels[i];
				const b = rels[i + 1];
				if (a && b && !intervalsOverlap(a.interval, b.interval)) break;
				i++;
			}
			const pair = i < rels.length - 1 ? [rels[i], rels[i + 1]] : null;
			out.push({
				kind: 'temporal',
				title: t('inspector.temporal.title'),
				body: pair
					? tf('inspector.temporal.named', { first: link(pair[0]?.id), second: link(pair[1]?.id) })
					: tf('inspector.temporal.plain', { edges: temporalChain.edges.length })
			});
		}
		if (typeChain) {
			const off = typeChain.edges
				.map((id) => relationshipById.get(id))
				.find((r) => r && !INFLUENCE_CARRYING_TYPES.has(r.type));
			if (off) {
				out.push({
					kind: 'type',
					title: t('inspector.type.title'),
					body: tf('inspector.type.named', { link: link(off.id), type: relLabel(off.type) })
				});
			}
		}
		if (confidenceChain) {
			const weak = confidenceChain.edges
				.map((id) => relationshipById.get(id))
				.find(
					(r) =>
						r && (r.confidence === 'D' || (r.confidence === 'C' && r.verification === 'needs-primary-source'))
				);
			if (weak) {
				out.push({
					kind: 'confidence',
					title: t('inspector.confidence.title'),
					body: tf('inspector.confidence.named', { link: link(weak.id), basis: basisLabel(weak.basis) })
				});
			}
		}
		return out;
	});

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
	 * at the lower one, with the timeline still visible and still working underneath.
	 * Dragging up commits to reading; dragging down tucks the card under the dock and
	 * dismisses it.
	 *
	 * ONE SCROLL SURFACE
	 *
	 * The sheet is the only scroller on a phone. A card's internal body used to keep
	 * its own scrollbar inside a 46dvh sheet, so advisories stayed pinned while the
	 * record scrolled somewhere else, and content taller than the sheet painted over
	 * the dock and made its controls untappable. Now the card stops scrolling, the
	 * card header sticks to the top of the sheet, and everything between handle and
	 * dock scrolls as one document. See the compact block in the styles.
	 */

	let detent = $state<'peek' | 'full'>('peek');

	/**
	 * TUCKED: the sheet steps aside without closing.
	 *
	 * At the peek height the sheet still covers almost half a phone, and it stayed
	 * there while the reader went back to the canvas, so the record they had
	 * finished with sat over the thing they were now reading. Touching or
	 * scrolling anything behind the sheet now tucks it down to its title bar: the
	 * record is one tap away, and the canvas is the reader's again. Selecting
	 * something else brings the sheet back at the peek height.
	 */
	let tucked = $state(false);
	let asideEl = $state<HTMLElement | null>(null);

	/*
	 * A new selection always opens at the peek height. Leaving a sheet expanded from
	 * the previous entity means tapping a node buries the map you tapped it on.
	 * `detent` is written but never read here, so this cannot self-trigger.
	 */
	$effect(() => {
		void app.selected;
		detent = 'peek';
		tucked = false;
	});

	/** The chrome the reader uses alongside the sheet; touching it is not leaving the record. */
	const KEEPS_SHEET = '.dock, .menubar, [role="dialog"], .pop, .vs';

	$effect(() => {
		if (!compact.current || panelId === null) return;
		const away = (e: Event) => {
			if (tucked || detent !== 'peek' || closing) return;
			const target = e.target as Element | null;
			if (!target || !(target instanceof Element)) return;
			if (asideEl?.contains(target) || target.closest(KEEPS_SHEET)) return;
			tucked = true;
			asideEl?.querySelector('.sheet-scroll')?.scrollTo({ top: 0 });
		};
		document.addEventListener('pointerdown', away, { capture: true, passive: true });
		document.addEventListener('wheel', away, { capture: true, passive: true });
		return () => {
			document.removeEventListener('pointerdown', away, { capture: true });
			document.removeEventListener('wheel', away, { capture: true });
		};
	});

	/**
	 * The gesture contract, passed once. The action reads these callbacks at
	 * gesture time, so a stale object can never settle the wrong detent.
	 */
	const dragParams: SheetDragParams = {
		enabled: () => compact.current && panelId !== null && !tucked,
		detent: () => detent,
		setDetent: (d) => (detent = d),
		dismiss: () => (app.selected = null),
		hasPeek: () => true,
		handle: '.handle'
	};

	/** Tapping the handle is the keyboard- and precision-friendly equivalent. */
	function toggle() {
		if (tucked) {
			tucked = false;
			return;
		}
		detent = detent === 'peek' ? 'full' : 'peek';
	}

	/** A tucked sheet comes back on any tap, not only on its handle. */
	function untuck(e: MouseEvent) {
		if (!tucked) return;
		e.preventDefault();
		e.stopPropagation();
		tucked = false;
	}
</script>

{#snippet readingNotes()}
	<Disclosure>
		{#snippet summary()}{tf('inspector.notes', { n: notes.length })}{/snippet}
		{#each notes as note (note.kind)}
			<div class="weakchain {note.kind}" role="note">
				<span class="wc-label">{note.title}</span>
				<span>{note.body}</span>
			</div>
		{/each}
	</Disclosure>
{/snippet}

{#if panelId}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="backdrop"
		onclick={() => (app.selected = null)}
		onkeydown={() => {}}
		role="presentation"
	></div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<aside
		class="inspector d-{detent}"
		class:closing
		class:tucked
		aria-label="Entity inspector"
		bind:this={asideEl}
		onclickcapture={untuck}
		use:sheetDrag={dragParams}
	>
		{#if compact.current}
			<!--
				The drag handle. A button, not a bare div: expanding and collapsing has to
				be reachable without a pointer, and "drag me" is not something a screen
				reader can act on. The drag itself is the shared action on the aside; this
				button reports the keyboard/tap equivalent and never both at once.
			-->
			<button
				class="handle sheet-handle"
				onclick={toggle}
				aria-expanded={!tucked && detent === 'full'}
				aria-label={detent === 'full' && !tucked ? 'Collapse panel' : 'Expand panel'}
			>
				<span class="grip sheet-grip"></span>
			</button>
		{/if}

		<div class="inner sheet-scroll">
			{#if panelSel}
			{#if personById.has(panelSel) || institutionById.has(panelSel)}
				<EntityPanel id={panelSel} notes={notes.length ? readingNotes : undefined} />
			{:else}
				<!-- v0.0.2 records (contracts, licences, declarations, education,
				     events, companies) get their own card; a selection that is
				     neither entity nor record renders the fallback below. -->
				<RecordPanel id={panelSel} />
			{/if}
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

	/* W4 + L3 — interpretation advisories, inside the reading-notes disclosure.
	   Same quiet tint family; each variant keeps its own accent so the kind is
	   visible at a glance but none shouts — they are notes on how to read the
	   record, not verdicts on it. */
	.weakchain {
		margin: 0 0 var(--s-3);
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
	.weakchain.temporal {
		border-inline-start-color: var(--basis-reported);
		background: color-mix(in oklch, var(--basis-reported) 6%, transparent);
	}
	.weakchain.temporal .wc-label {
		color: var(--basis-reported);
	}
	.weakchain.type {
		border-inline-start-color: var(--basis-unsubstantiated);
		background: color-mix(in oklch, var(--basis-unsubstantiated) 6%, transparent);
	}
	.weakchain.type .wc-label {
		color: var(--basis-unsubstantiated);
	}
	.weakchain.confidence {
		border-inline-start-color: var(--basis-documented);
		background: color-mix(in oklch, var(--basis-documented) 6%, transparent);
	}
	.weakchain.confidence .wc-label {
		color: var(--basis-documented);
	}
	.wc-label {
		font-weight: 600;
		color: var(--basis-inferred);
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

	/*
	 * Docked panel: it takes width from the layout, so animating its width is
	 * what makes the CHART give way smoothly. The old slide translated only the
	 * panel's own 24px while the viewport reflowed in a single frame, which read
	 * as a snap. `.inner` stays at the full width and is clipped, so the record
	 * does not reflow mid-slide.
	 */
	@media (min-width: 1101px) {
		.inspector {
			overflow: hidden;
			animation-name: dock-in-width;
		}
		:global([dir='rtl']) .inspector {
			animation-name: dock-in-width;
		}
		.inspector .inner {
			width: var(--inspector-w);
			flex: none;
		}
		.inspector.closing {
			animation: none;
			width: 0;
			opacity: 0;
			border-inline-start-width: 0;
			transition:
				width var(--dur-slow) var(--ease-in-out),
				opacity var(--dur-normal) var(--ease-in-out),
				border-inline-start-width var(--dur-slow) var(--ease-in-out);
		}
	}
	@keyframes dock-in-width {
		from {
			width: 0;
			opacity: 0;
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
			z-index: var(--z-sheet);
		}
		/*
		   One level under the panel, which also puts it under the dock. Dimming
		   the timeline while the reader is meant to keep scrubbing it was the
		   wrong trade: the scrim catches taps on the view, the dock stays live.
		*/
		.backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: calc(var(--z-sheet) - 1);
			background: color-mix(in srgb, var(--surface-base) 55%, transparent);
		}
	}

	/* ---------------------------------------------------------------------------
	   Phone: a sheet above the dock, below it while leaving.
	   --------------------------------------------------------------------------- */

	@media (max-width: 900px) {
		.inspector {
			position: fixed;
			/*
			   Above the dock at rest, never over it: the timeline has to stay usable
			   while a record is open, which is the entire reason this is a sheet and
			   not a page. The dock is layered above the sheet so a dismissal reads as
			   the card sliding under the chrome rather than climbing it.
			*/
			inset: auto 0 calc(var(--dock-h) + var(--safe-b)) 0;
			width: auto;
			/* Landscape notch: the sheet spans the screen, its content does not. */
			padding-inline: var(--safe-l) var(--safe-r);
			--sheet-peek: 42dvh;
			/* Tucked: the handle and the record's sticky title bar, nothing more. */
			--sheet-mini: 104px;
			--sheet-full: calc(100dvh - var(--chrome-h) - var(--dock-h) - var(--s-4));
			height: calc(var(--sheet-peek) + (var(--sheet-full) - var(--sheet-peek)) * var(--sheet-p, 0));
			flex-direction: column;
			/* The sheet is the box. Content that outgrows it scrolls inside; nothing
			   paints past the rounded corners onto the dock behind. */
			overflow: hidden;
			border-inline-start: none;
			border-top: 1px solid var(--border-strong);
			border-radius: var(--r-xl) var(--r-xl) 0 0;
			box-shadow: var(--elev-4);
			z-index: var(--z-sheet);
			transform: translateY(var(--sheet-y, 0px));
			animation: sheet-up var(--dur-normal) var(--ease-out);
			transition:
				height var(--dur-normal) var(--ease-out),
				transform var(--dur-normal) var(--ease-out);
		}
		/*
		   The two detents are the same height formula at 0 and 1. The shared drag
		   action writes --sheet-p between them while a finger is down, so growing
		   and settling are one continuous movement.
		*/
		.d-peek {
			--sheet-p: 0;
		}
		.d-full {
			--sheet-p: 1;
		}
		.inspector.tucked {
			height: var(--sheet-mini);
			cursor: pointer;
		}
		/* Tucked, the body does not scroll under the finger that is about to open it. */
		.inspector.tucked .inner {
			overflow: hidden;
		}
		/* Leaving: the card slides all the way down, under the dock. */
		.inspector.closing {
			transform: translateY(100%);
			transition: transform var(--dur-normal) var(--ease-in-out);
		}
		/*
		   A phone sheet rises from the bottom in every language. The wide-screen
		   RTL rule slides in from the inline edge and outranks the shorthand above,
		   so it has to be named back here or the sheet enters sideways in Arabic.
		*/
		:global([dir='rtl']) .inspector {
			animation-name: sheet-up;
		}

		/*
		   ONE SCROLL SURFACE. The card's own body stops scrolling on a phone and
		   the sheet scrolls as a single document, so the card header can stick to
		   the top and the advisories scroll away with the record. Without this the
		   card was a second scroller inside the sheet and anything taller than the
		   peek painted over the dock, making its controls untappable.
		*/
		.inner :global(.panel) {
			flex: none;
		}
		.inner :global(.panel .body) {
			overflow: visible;
			flex: none;
		}
		.inner :global(.panel header) {
			position: sticky;
			top: 0;
			z-index: 1;
			background: var(--surface-panel);
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
