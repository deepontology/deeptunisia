<script lang="ts">
	import type { Snippet } from 'svelte';
	import { compact } from '$lib/design/media.svelte';
	import { sheetDrag, type SheetDragParams } from './sheet-drag';

	/**
	 * An anchored panel that becomes a bottom sheet on small screens.
	 *
	 * The mode switch is CSS, not two components and not a JavaScript width check.
	 * A menu positioned relative to a 27px button is unusable with a thumb, and a
	 * sheet that slides up on a 27" monitor is theatre — but they hold the same
	 * content, so they are one component with one breakpoint.
	 *
	 * The scrim is a real element rather than a document-level listener: a listener
	 * has to decide whether each click landed inside the panel, and gets that wrong
	 * the moment the panel contains something that unmounts on click.
	 *
	 * ON A PHONE IT IS A REAL SHEET
	 *
	 * The grabber used to be decoration: it looked draggable and was not. It is
	 * now the handle for the shared drag action, so filters, share and settings
	 * all dismiss with the same downward pull as the entity card. Scrolling lives
	 * in `.pop-body`, one surface under a fixed handle, and containment keeps a
	 * flick from chaining into the app behind the scrim.
	 */

	interface Props {
		open: boolean;
		onclose: () => void;
		/** Which edge of the trigger the panel hangs from on wide screens. */
		align?: 'start' | 'end';
		label?: string;
		children: Snippet;
	}

	let { open = $bindable(), onclose, align = 'end', label, children }: Props = $props();

	let panel = $state<HTMLDivElement | null>(null);

	/** Matches the exit transition below, so the DOM leaves exactly when it ends. */
	const EXIT_MS = 260;

	let mounted = $state(open);
	let closing = $state(false);

	/*
	 * Mount with `open`, stay mounted through the exit so the sheet can slide
	 * away instead of vanishing on the frame `open` turns false.
	 */
	$effect(() => {
		if (open) {
			mounted = true;
			closing = false;
			return;
		}
		if (!mounted) return;
		closing = true;
		const t = setTimeout(() => {
			closing = false;
			mounted = false;
		}, EXIT_MS);
		return () => clearTimeout(t);
	});

	const dragParams: SheetDragParams = {
		enabled: () => compact.current,
		detent: () => 'full',
		setDetent: () => {},
		dismiss: () => onclose(),
		hasPeek: () => false,
		handle: '.grabber'
	};

	function portal(node: HTMLDivElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	/**
	 * Move focus into the panel when it opens so keyboard and screen-reader users
	 * land on the content rather than continuing from the trigger into the page
	 * behind it. Focus goes to the first control if there is one, or the panel.
	 */
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
	<div class="scrim" class:closing role="presentation" onclick={onclose} use:portal></div>
	<!--
		role="dialog" rather than "group": the panel takes focus, handles Escape and
		is dismissed by the scrim, which is dialog behaviour. aria-modal is false
		because the rest of the app stays reachable — nothing here is a decision the
		reader has to make before continuing.
	-->
	<div
		class="pop a-{align}"
		class:closing
		bind:this={panel}
		use:portal
		use:sheetDrag={dragParams}
		tabindex="-1"
		role="dialog"
		aria-modal="false"
		aria-label={label}
		onkeydown={onKey}
	>
		<span class="grabber sheet-handle" aria-hidden="true"><i class="sheet-grip"></i></span>
		<div class="pop-body sheet-scroll">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-scrim);
	}
	.scrim.closing {
		opacity: 0;
		transition: opacity var(--dur-normal) var(--ease-in-out);
	}

	.pop {
		position: fixed;
		z-index: var(--z-modal);
		inset: auto;
		top: 50%;
		left: 50%;
		right: auto;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 32px));
		max-height: min(70vh, 600px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
		animation: rise-in var(--dur-fast) var(--ease-out);
	}
	.pop-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.pop.closing {
		animation: none;
		opacity: 0;
		transform: translate(-50%, -46%);
		transition:
			opacity var(--dur-normal) var(--ease-in-out),
			transform var(--dur-normal) var(--ease-in-out);
	}
	/* The global .sheet-handle hides the grabber on wide screens. */

	@media (max-width: 900px) {
		.scrim {
			background: color-mix(in oklch, var(--n-1000) 55%, transparent);
			backdrop-filter: blur(2px);
			animation: fade-in var(--dur-fast) var(--ease-out);
		}
		.pop {
			position: fixed;
			inset: auto 0 0 0;
			top: auto;
			/*
			   The desktop rule centres with translate(-50%, -50%). Left in place it
			   shifts the sheet half its own width off the left edge and half its
			   height upward — the sheet hung off-screen and read as broken. A bottom
			   sheet is already placed by its insets, so the centreing transform is
			   explicitly cleared here rather than overridden per instance.
			*/
			transform: translateY(var(--sheet-y, 0px));
			/*
			   Full-bleed, not centred. The desktop width cap (min(360px, …)) would
			   otherwise over-constrain the box — left and right both set plus a
			   fixed width resolves with left winning, leaving a dead gap down the
			   right edge. With width auto the insets stretch it edge to edge.
			*/
			width: auto;
			max-height: 80dvh;
			padding-bottom: var(--safe-b);
			/* Landscape notch: full-bleed frame, inset content. */
			padding-inline: var(--safe-l) var(--safe-r);
			border-inline: none;
			border-bottom: none;
			border-radius: var(--r-xl) var(--r-xl) 0 0;
			box-shadow: var(--elev-4);
			animation: sheet-in var(--dur-normal) var(--ease-out);
			transition:
				transform var(--dur-normal) var(--ease-out),
				opacity var(--dur-normal) var(--ease-in-out);
		}
		/* Leaving: under the bottom edge, which clears the dock behind the scrim. */
		.pop.closing {
			transform: translateY(100%);
			transition: transform var(--dur-normal) var(--ease-in-out);
		}
	}

	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop {
			animation: none;
		}
	}
</style>
