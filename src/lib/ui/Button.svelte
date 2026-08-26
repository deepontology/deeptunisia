<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * The one button. Every clickable affordance in the app is this component with a
	 * variant, so hover, focus, radius and motion behave identically everywhere.
	 *
	 * variant  solid   primary action, accent fill
	 *          soft    secondary, tinted surface
	 *          ghost   tertiary, no chrome until hover
	 *          outline bordered, for toolbars
	 * size     xs | sm | md
	 */
	interface Props extends HTMLButtonAttributes {
		variant?: 'solid' | 'soft' | 'ghost' | 'outline';
		size?: 'xs' | 'sm' | 'md';
		active?: boolean;
		/** Tint the button with a layer or basis colour, passed as a CSS colour. */
		tint?: string;
		icon?: boolean;
		children: Snippet;
	}

	let {
		variant = 'ghost',
		size = 'sm',
		active = false,
		tint,
		icon = false,
		children,
		...rest
	}: Props = $props();
</script>

<button
	class="btn v-{variant} s-{size}"
	class:active
	class:icon
	style:--tint={tint}
	{...rest}
>
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		white-space: nowrap;
		border-radius: var(--r-md);
		border: 1px solid transparent;
		font-weight: 460;
		letter-spacing: var(--track-normal);
		transition:
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			transform var(--dur-instant) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
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
		padding: 0 var(--s-6);
		font-size: var(--t-base);
	}
	.icon.s-xs {
		width: 22px;
		padding: 0;
	}
	.icon.s-sm {
		width: 27px;
		padding: 0;
	}
	.icon.s-md {
		width: 33px;
		padding: 0;
	}

	/* --- variants --- */

	.v-solid {
		background: var(--tint, var(--accent));
		color: var(--accent-text);
		font-weight: 520;
	}
	.v-solid:hover:not(:disabled) {
		background: var(--tint, var(--accent-hover));
		box-shadow: var(--elev-2);
	}

	.v-soft {
		background: color-mix(in oklch, var(--tint, var(--accent)) 14%, transparent);
		color: var(--tint, var(--accent));
	}
	.v-soft:hover:not(:disabled) {
		background: color-mix(in oklch, var(--tint, var(--accent)) 22%, transparent);
	}

	.v-ghost {
		color: var(--text-muted);
	}
	.v-ghost:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	.v-outline {
		background: var(--surface-sunken);
		border-color: var(--border-default);
		color: var(--text-secondary);
	}
	.v-outline:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text-primary);
		background: var(--surface-hover);
	}

	/* Active is a state, not a variant: a toggled ghost and a toggled outline should
	   read as the same kind of "on". */
	.btn.active {
		color: var(--tint, var(--accent));
		background: color-mix(in oklch, var(--tint, var(--accent)) 15%, transparent);
		border-color: color-mix(in oklch, var(--tint, var(--accent)) 38%, transparent);
	}
</style>
