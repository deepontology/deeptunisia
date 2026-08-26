<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	/**
	 * A multi-line text control that grows with its content and says how much room
	 * is left before the server refuses it.
	 *
	 * The counter appears only near the ceiling. A count that is always visible turns
	 * writing into a metered activity, and the limit here (20,000 characters) is one
	 * almost nobody will approach — so showing it from the first keystroke would
	 * pressure every writer to protect against a case that affects none of them.
	 *
	 * Growth is applied to the element's own style rather than through state. An
	 * effect that writes state it also reads self-triggers, Svelte aborts the effect
	 * tree, and the app renders blank — see the trap in AGENTS.md.
	 */
	interface Props extends HTMLTextareaAttributes {
		value?: string;
		invalid?: boolean;
		/** Height at rest, in rows. */
		rows?: number;
		/** Beyond this the box stops growing and scrolls instead. */
		maxRows?: number;
		/** Server ceiling. Omit for no counter. */
		limit?: number;
		/** Fraction of the limit at which the counter appears. */
		warnAt?: number;
		/** The underlying node, for callers that need the selection (toolbars). */
		element?: HTMLTextAreaElement | null;
	}

	let {
		value = $bindable(''),
		invalid = false,
		rows = 4,
		maxRows = 18,
		limit,
		warnAt = 0.7,
		element = $bindable(null),
		...rest
	}: Props = $props();

	let el = $state<HTMLTextAreaElement | null>(null);
	$effect(() => {
		element = el;
	});

	const remaining = $derived(limit ? limit - value.length : Infinity);
	const showCount = $derived(!!limit && value.length >= limit * warnAt);
	const over = $derived(remaining < 0);

	$effect(() => {
		// Read the value so this reruns as the text changes.
		void value;
		const node = el;
		if (!node) return;
		const line = parseFloat(getComputedStyle(node).lineHeight) || 16;
		node.style.height = 'auto';
		node.style.height = `${Math.min(node.scrollHeight, line * maxRows)}px`;
	});
</script>

<div class="wrap">
	<textarea
		bind:this={el}
		bind:value
		class:invalid={invalid || over}
		aria-invalid={invalid || over || undefined}
		{rows}
		{...rest}
	></textarea>
	{#if showCount}
		<!--
			Polite, not assertive: a live region that interrupts on every keystroke is
			unusable with a screen reader.
		-->
		<span class="count" class:over aria-live="polite">
			{remaining.toLocaleString()}
		</span>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		min-width: 0;
	}
	textarea {
		display: block;
		width: 100%;
		min-width: 0;
		font: inherit;
		font-size: var(--t-sm);
		line-height: 1.6;
		padding: var(--s-4) var(--s-5);
		background: var(--surface-sunken);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		resize: none;
		overflow-y: auto;
		transition:
			border-color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	textarea::placeholder {
		color: var(--text-faint);
	}
	textarea:hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	textarea:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: var(--ring);
	}
	textarea:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	textarea.invalid {
		border-color: var(--basis-unsubstantiated);
	}

	.count {
		position: absolute;
		bottom: var(--s-2);
		inset-inline-end: var(--s-3);
		padding: 0 var(--s-2);
		border-radius: var(--r-xs);
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		pointer-events: none;
	}
	.count.over {
		color: var(--basis-unsubstantiated);
	}

	@media (pointer: coarse) {
		textarea {
			font-size: var(--t-base);
		}
	}
</style>
