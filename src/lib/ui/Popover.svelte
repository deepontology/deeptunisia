<script lang="ts">
	import type { Snippet } from 'svelte';

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

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="scrim" role="presentation" onclick={onclose} use:portal></div>
	<!--
		role="dialog" rather than "group": the panel takes focus, handles Escape and
		is dismissed by the scrim, which is dialog behaviour. aria-modal is false
		because the rest of the app stays reachable — nothing here is a decision the
		reader has to make before continuing.
	-->
	<div
		class="pop a-{align}"
		bind:this={panel}
		use:portal
		tabindex="-1"
		role="dialog"
		aria-modal="false"
		aria-label={label}
		onkeydown={onKey}
	>
		<span class="grabber" aria-hidden="true"></span>
		{@render children()}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
	}

	.pop {
		position: fixed;
		z-index: 91;
		inset: auto;
		top: 50%;
		left: 50%;
		right: auto;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 32px));
		max-height: min(70vh, 600px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
		animation: rise-in var(--dur-fast) var(--ease-out);
	}
	/* Only the sheet form needs a drag handle; hidden until then. */
	.grabber {
		display: none;
	}

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
			max-height: 80dvh;
			overflow-y: auto;
			overscroll-behavior: contain;
			padding-bottom: var(--safe-b);
			border-inline: none;
			border-bottom: none;
			border-radius: var(--r-xl) var(--r-xl) 0 0;
			box-shadow: var(--elev-4);
			animation: sheet-in var(--dur-normal) var(--ease-out);
		}
		.grabber {
			display: block;
			width: 36px;
			height: 4px;
			margin: var(--s-3) auto 0;
			border-radius: var(--r-full);
			background: var(--border-strong);
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
