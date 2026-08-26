<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The wrapper that makes a form control legible: label, optional hint, and the
	 * space where an error appears.
	 *
	 * It exists because Agora was the one part of the product made mostly of forms
	 * and the kit had no form primitives at all — so every input, textarea and select
	 * in it shared one twelve-line CSS rule at the bottom of a 638-line route. That is
	 * why the discussion layer looked unfinished next to the Network while using the
	 * same tokens.
	 *
	 * The error slot is reserved rather than conditional. A message that appears by
	 * inserting a line pushes the submit button out from under a pointer that was
	 * already moving toward it, and the resulting mis-click lands on whatever
	 * replaced it.
	 */
	interface Props {
		label: string;
		/** Said before the control, not after the mistake. */
		hint?: string;
		error?: string;
		required?: boolean;
		/** Hide the label visually but keep it for screen readers. */
		hiddenLabel?: boolean;
		for?: string;
		children: Snippet;
	}

	let {
		label,
		hint,
		error,
		required = false,
		hiddenLabel = false,
		for: htmlFor,
		children
	}: Props = $props();
</script>

<div class="field" class:invalid={!!error}>
	<label for={htmlFor} class:visually-hidden={hiddenLabel}>
		{label}
		{#if required}<span class="req" aria-hidden="true">*</span>{/if}
	</label>
	{#if hint && !hiddenLabel}
		<p class="hint">{hint}</p>
	{/if}
	{@render children()}
	<!-- Reserved, not conditional: see the note above. -->
	<p class="err" role={error ? 'alert' : undefined}>{error ?? ''}</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-width: 0;
	}
	label {
		font-size: var(--t-xs);
		font-weight: 520;
		color: var(--text-secondary);
		letter-spacing: var(--track-wide);
	}
	.req {
		color: var(--basis-unsubstantiated);
		margin-inline-start: var(--s-1);
	}
	.hint {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-faint);
		line-height: 1.45;
	}
	.err {
		margin: 0;
		min-height: 1em;
		font-size: var(--t-xs);
		color: var(--basis-unsubstantiated);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
