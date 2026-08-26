<script lang="ts">
	import type { Snippet } from 'svelte';
	import { theme } from '$lib/design/theme.svelte';

	/**
	 * Tooltip.
	 *
	 * Written natively rather than pulled from a component library, for two reasons
	 * that both bit us:
	 *
	 *  1. A library tooltip renders its own <button> trigger. Every caller here is
	 *     already a button (icon controls), which produced nested buttons — invalid
	 *     HTML and a hydration mismatch. This version wraps in a <span> and listens
	 *     on the wrapper, so the caller's own element stays the only interactive
	 *     node. The nesting problem is impossible by construction.
	 *  2. Importing the library barrel dragged in every component it ships, which
	 *     intermittently got handed to Node as raw .svelte files during SSR.
	 *
	 * Accessibility contract: the tooltip is SUPPLEMENTARY. Every caller must carry
	 * its own accessible name (aria-label or visible text) — this text is extra
	 * context, not the label. That is why it is aria-hidden rather than wired up as
	 * a description: duplicating the name into a description makes screen readers
	 * announce it twice.
	 *
	 * Opens on hover and on keyboard focus (focusin bubbles from the child), closes
	 * on leave, blur or Escape. Flips when it would overflow the viewport.
	 */

	interface Props {
		content: string;
		side?: 'top' | 'bottom';
		delay?: number;
		children: Snippet;
	}

	let { content, side = 'top', delay = 260, children }: Props = $props();

	let anchor = $state<HTMLSpanElement | null>(null);
	let open = $state(false);
	let x = $state(0);
	let y = $state(0);
	// Initialised to a literal, not to `side`: reading a prop during state
	// initialisation captures only its first value. place() computes the real
	// placement before every open anyway.
	let placement = $state<'top' | 'bottom'>('top');
	let timer: ReturnType<typeof setTimeout> | undefined;

	const GAP = 8;
	const ESTIMATED_H = 34;

	function place() {
		if (!anchor) return;
		const r = anchor.getBoundingClientRect();
		x = r.left + r.width / 2;

		// Flip if the preferred side would leave the viewport.
		let p = side;
		if (p === 'top' && r.top - ESTIMATED_H - GAP < 0) p = 'bottom';
		else if (p === 'bottom' && r.bottom + ESTIMATED_H + GAP > window.innerHeight) p = 'top';
		placement = p;

		y = p === 'top' ? r.top - GAP : r.bottom + GAP;
	}

	function show() {
		clearTimeout(timer);
		const wait = theme.reduceMotion ? 0 : delay;
		timer = setTimeout(() => {
			place();
			open = true;
		}, wait);
	}

	function hide() {
		clearTimeout(timer);
		open = false;
	}

	/**
	 * Escape is handled on the window rather than on the wrapper. The wrapper is a
	 * passive hover region, not an interactive element, so giving it key handling
	 * would misrepresent it to assistive technology — and a global listener also
	 * dismisses correctly when focus has already moved elsewhere.
	 */
	function onWindowKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') hide();
	}
</script>

<span
	class="tt-anchor"
	role="presentation"
	bind:this={anchor}
	onpointerenter={show}
	onpointerleave={hide}
	onfocusin={show}
	onfocusout={hide}
>
	{@render children()}
</span>

{#if open && content}
	<div
		class="tt p-{placement}"
		role="tooltip"
		aria-hidden="true"
		style:left="{x}px"
		style:top="{y}px"
	>
		{content}
	</div>
{/if}

<svelte:window onscroll={hide} onresize={hide} onkeydown={onWindowKeydown} />

<style>
	.tt-anchor {
		display: inline-flex;
		align-items: center;
	}

	.tt {
		position: fixed;
		z-index: 300;
		max-width: 260px;
		padding: var(--s-3) var(--s-5);
		border-radius: var(--r-md);
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		box-shadow: var(--elev-3);
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
		pointer-events: none;
		width: max-content;
		animation: tt-in var(--dur-fast) var(--ease-out);
	}
	.p-top {
		transform: translate(-50%, -100%);
	}
	.p-bottom {
		transform: translate(-50%, 0);
	}

	@keyframes tt-in {
		from {
			opacity: 0;
		}
	}
</style>
