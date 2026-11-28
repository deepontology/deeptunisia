<script lang="ts" generics="T extends string">
	import { tick } from 'svelte';
	import { app } from '$lib/state.svelte';

	/**
	 * A segmented switch between the faces of one view.
	 *
	 * A radio group in the ARIA sense: one tab stop (the current face), the
	 * arrow keys move between faces and switch to them, Home and End jump to the
	 * ends. In a right-to-left language the row is drawn right to left, so the
	 * left and right arrows swap to keep "next" pointing the way the row reads.
	 */

	interface Props {
		value: T;
		options: { value: T; label: string }[];
		label: string;
		onchange(value: T): void;
	}

	let { value, options, label, onchange }: Props = $props();

	let root = $state<HTMLDivElement | null>(null);

	async function move(to: number) {
		const n = options.length;
		const next = options[((to % n) + n) % n];
		if (next.value !== value) onchange(next.value);
		await tick();
		root?.querySelector<HTMLButtonElement>(`[data-face="${next.value}"]`)?.focus();
	}

	function onKey(e: KeyboardEvent) {
		const i = options.findIndex((o) => o.value === value);
		const rtl = app.locale === 'ar';
		let to: number | null = null;
		if (e.key === 'ArrowRight') to = rtl ? i - 1 : i + 1;
		else if (e.key === 'ArrowLeft') to = rtl ? i + 1 : i - 1;
		else if (e.key === 'ArrowDown') to = i + 1;
		else if (e.key === 'ArrowUp') to = i - 1;
		else if (e.key === 'Home') to = 0;
		else if (e.key === 'End') to = options.length - 1;
		if (to === null) return;
		e.preventDefault();
		void move(to);
	}
</script>

<div class="faces" role="radiogroup" aria-label={label} bind:this={root} tabindex="-1" onkeydown={onKey}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			data-face={o.value}
			aria-checked={o.value === value}
			tabindex={o.value === value ? 0 : -1}
			class:on={o.value === value}
			onclick={() => onchange(o.value)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.faces {
		display: inline-flex;
		flex-shrink: 0;
		padding: 2px;
		gap: 2px;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-raised);
	}
	.faces:focus {
		outline: none;
	}
	button {
		padding: 3px 12px;
		border-radius: var(--r-sm);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}
	button:hover {
		color: var(--text-primary);
	}
	button.on {
		color: var(--accent-text);
		background: var(--accent);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
</style>
