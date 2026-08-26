<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * A single-line text control, sized to match `Button` so the two line up in a row
	 * without anyone nudging a padding value.
	 *
	 * `mono` is not decoration. DESIGN.md's rule is that every number, date, id and
	 * code is mono and tabular; a field that will hold a record id or a YAML field
	 * path has to say so before it is filled in, not after.
	 */
	interface Props extends Omit<HTMLInputAttributes, 'size'> {
		value?: string;
		size?: 'xs' | 'sm' | 'md';
		invalid?: boolean;
		mono?: boolean;
	}

	let {
		value = $bindable(''),
		size = 'sm',
		invalid = false,
		mono = false,
		...rest
	}: Props = $props();
</script>

<input
	class="in s-{size}"
	class:invalid
	class:mono
	aria-invalid={invalid || undefined}
	bind:value
	{...rest}
/>

<style>
	.in {
		width: 100%;
		min-width: 0;
		font: inherit;
		background: var(--surface-sunken);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.in::placeholder {
		color: var(--text-faint);
	}
	.in:hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	.in:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: var(--ring);
	}
	.in:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.in.invalid {
		border-color: var(--basis-unsubstantiated);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.s-xs {
		height: 22px;
		padding: 0 var(--s-4);
		font-size: var(--t-xs);
	}
	.s-sm {
		height: 27px;
		padding: 0 var(--s-5);
		font-size: var(--t-sm);
	}
	.s-md {
		height: 33px;
		padding: 0 var(--s-5);
		font-size: var(--t-base);
	}

	/*
	 * A thumb needs 44px and a mouse does not. Raising the floor only where the
	 * pointer is coarse keeps the desktop instrument dense, which is the whole
	 * premise of the shell.
	 */
	@media (pointer: coarse) {
		.s-xs,
		.s-sm,
		.s-md {
			height: var(--tap);
			font-size: var(--t-base);
		}
	}
</style>
