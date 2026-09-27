<script lang="ts">
	/**
	 * A searchable picker over graph records.
	 *
	 * The proposal forms need to name records by identity (a role, a holder, the two
	 * ends of a relationship) without asking anyone to type an id. This filters a
	 * supplied option list and shows the top matches; the caller decides which
	 * records are offerable and how they are labelled.
	 *
	 * List sizes are in the hundreds, so a simple case-insensitive substring filter
	 * is enough and keeps the picker free of the search index, which does not hold
	 * roles or positions.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Input from '$lib/ui/Input.svelte';
	import { LAYER_COLOR, type Layer } from '$lib/model';
	import { t } from '$lib/t.svelte';

	export interface PickerOption {
		id: string;
		name: string;
		detail?: string;
		layer?: string;
	}

	interface Props {
		label: string;
		options: PickerOption[];
		value: PickerOption | null;
		onpick: (option: PickerOption | null) => void;
		placeholder?: string;
		hint?: string;
		/** Associates the Field label and the combobox, and names the listbox. */
		inputId?: string;
	}

	let { label, options, value, onpick, placeholder = '', hint, inputId }: Props = $props();

	let query = $state('');
	let focused = $state(false);
	let cursor = $state(0);

	const listId = $derived(inputId ? `${inputId}-list` : undefined);

	const hits = $derived.by(() => {
		if (!focused || value) return [];
		const q = query.trim().toLowerCase();
		return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 6);
	});

	function choose(option: PickerOption) {
		onpick(option);
		query = '';
		focused = false;
		cursor = 0;
	}

	function onKey(e: KeyboardEvent) {
		if (!hits.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = Math.min(hits.length - 1, cursor + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(0, cursor - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(hits[cursor]);
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			focused = false;
		}
	}
</script>

<Field {label} {hint} for={inputId}>
	{#if value}
		<div class="chosen">
			<i
				class="dot"
				style:background={value.layer ? LAYER_COLOR[value.layer as Layer] : 'var(--text-faint)'}
				aria-hidden="true"
			></i>
			<strong>{value.name}</strong>
			{#if value.detail}<span class="detail">{value.detail}</span>{/if}
			<Button size="xs" variant="ghost" onclick={() => onpick(null)}>{t('agora.detach')}</Button>
		</div>
	{:else}
		<Input
			id={inputId}
			bind:value={query}
			{placeholder}
			size="md"
			role="combobox"
			aria-expanded={hits.length > 0}
			aria-controls={listId}
			aria-autocomplete="list"
			onfocus={() => (focused = true)}
			onkeydown={onKey}
		/>
		{#if hits.length}
			<ul id={listId} class="menu" role="listbox" aria-label={label}>
				{#each hits as h, i (h.id)}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={i === cursor}
							class:on={i === cursor}
							onmouseenter={() => (cursor = i)}
							onclick={() => choose(h)}
						>
							<span class="hname">{h.name}</span>
							{#if h.detail}<span class="hdetail">{h.detail}</span>{/if}
						</button>
					</li>
				{/each}
			</ul>
		{:else if focused && query.trim()}
			<p class="empty">{t('agora.entitymenu.empty')}</p>
		{/if}
	{/if}
</Field>

<style>
	.chosen {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		min-height: var(--tap);
	}
	.chosen strong {
		font-size: var(--t-sm);
		font-weight: 520;
	}
	.chosen .detail {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.menu {
		list-style: none;
		margin: var(--s-2) 0 0;
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-overlay);
		box-shadow: var(--elev-2);
		overflow: hidden;
	}
	.menu button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		width: 100%;
		text-align: start;
		padding: var(--s-3) var(--s-4);
		min-height: var(--tap);
	}
	.menu button.on,
	.menu button:hover {
		background: var(--surface-hover);
	}
	.hname {
		font-size: var(--t-sm);
	}
	.hdetail {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.empty {
		margin: var(--s-2) 0 0;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
</style>
