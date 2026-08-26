<script lang="ts">
	/**
	 * "I think the record is wrong."
	 *
	 * Two modes, and which one you get depends on whether we can see the record.
	 *
	 * When the target is a record in the graph, the form lists its actual fields
	 * with their actual values, and `old_value` is filled in by the machine rather
	 * than typed from memory. That column exists so a reviewer months later can tell
	 * that the record moved underneath the proposal; a hand-typed approximation
	 * cannot do that, so asking for one was worse than not asking.
	 *
	 * When there is no target — a proposal to add something that does not exist yet
	 * — it falls back to the free-text path, which is honest about being an expert
	 * affordance rather than pretending otherwise.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import { editableFields, type EditableField } from './fields';
	import { t } from '$lib/t.svelte';

	interface Props {
		target: { type: string; id: string; label: string } | null;
		busy?: boolean;
		error?: string;
		onfile: (v: {
			operation: string;
			field: string;
			old_value: string | null;
			new_value: string;
			reason: string;
			url: string;
			title: string;
		}) => void;
		oncancel: () => void;
	}

	let { target, busy = false, error = '', onfile, oncancel }: Props = $props();

	const fields = $derived<EditableField[]>(
		target ? editableFields(target.type, target.id) : []
	);
	const structured = $derived(fields.length > 0);

	let chosen = $state('');
	let value = $state('');
	let reason = $state('');
	let url = $state('');
	let title = $state('');
	/* Free-text fallback only. */
	let rawField = $state('');
	let rawOld = $state('');

	const field = $derived(fields.find((f) => f.path === chosen) ?? null);

	/* Selecting a field seeds the box with what the record says now, so the author
	   edits the value rather than retyping it — and a one-character correction is a
	   one-character edit. */
	function choose(path: string) {
		chosen = path;
		value = fields.find((f) => f.path === path)?.current ?? '';
	}

	const changed = $derived(structured ? !!field && value !== field.current : !!rawField && !!value);
	const ready = $derived(changed && reason.trim().length > 0 && !busy);

	function file() {
		if (!ready) return;
		onfile({
			operation: 'set',
			field: structured ? chosen : rawField,
			old_value: structured ? (field?.current ?? null) : rawOld || null,
			new_value: value,
			reason,
			url,
			title
		});
	}
</script>

<Panel elevation={1} padded>
	<h3>{t('agora.propose')}</h3>
	<p class="hint">{t('agora.proposehint')}</p>

	{#if target}
		<div class="target">
			<Chip variant="outline">{target.type}</Chip>
			<strong>{target.label}</strong>
		</div>
	{/if}

	{#if structured}
		<Field label={t('agora.whichfield')} required>
			<div class="fields">
				{#each fields as f (f.path)}
					<button
						type="button"
						class="fieldbtn"
						class:on={chosen === f.path}
						onclick={() => choose(f.path)}
					>
						<span class="fname">{f.label}</span>
						<span class="fval" class:blank={!f.current}>
							{f.current || t('agora.unset')}
						</span>
					</button>
				{/each}
			</div>
		</Field>

		{#if field}
			<Field label={t('agora.shouldsay')} required hint={t('agora.currentis')}>
				{#if field.multiline}
					<Textarea bind:value rows={4} />
				{:else}
					<Input bind:value size="md" />
				{/if}
			</Field>
		{/if}
	{:else}
		<!-- No structured record behind this target. Say so rather than pretending. -->
		<p class="fallback">{t('agora.freeform')}</p>
		<Field label="Field" required>
			<Input bind:value={rawField} placeholder={t('agora.exstart')} mono size="md" />
		</Field>
		<Field label={t('agora.nowsays')}>
			<Input bind:value={rawOld} mono size="md" />
		</Field>
		<Field label={t('agora.shouldsay')} required>
			<Input bind:value mono size="md" />
		</Field>
	{/if}

	<Field label={t('agora.why')} required hint={t('agora.whyhint')}>
		<Textarea bind:value={reason} rows={3} placeholder={t('agora.whyph')} limit={2000} />
	</Field>

	<!-- Evidence is not optional in spirit, only in mechanics: a proposal without it
	     can be filed so the observation is not lost, but it cannot be accepted. The
	     form says which of those two is happening. -->
	<Field label={t('agora.evidence')} hint={t('agora.evidencehint')}>
		<div class="evidence">
			<Input bind:value={url} placeholder={t('agora.evidenceurl')} size="md" type="url" />
			<Input bind:value={title} placeholder={t('agora.evidencewhat')} size="md" />
		</div>
	</Field>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
	{#if !url && changed}
		<p class="note">{t('agora.noevidence')}</p>
	{/if}

	<div class="actions">
		<Button variant="solid" onclick={file} disabled={!ready}>{t('agora.file')}</Button>
		<Button variant="ghost" onclick={oncancel}>{t('agora.cancel')}</Button>
	</div>
</Panel>

<style>
	h3 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-md);
	}
	.hint {
		margin: 0 0 var(--s-6);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		line-height: 1.5;
		max-width: 66ch;
	}
	.target {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-6);
		padding: var(--s-3) var(--s-4);
		border-inline-start: 2px solid var(--accent);
		background: var(--surface-sunken);
		border-radius: var(--r-sm);
		font-size: var(--t-sm);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		padding: var(--s-2);
		background: var(--surface-sunken);
		max-height: 260px;
		overflow-y: auto;
	}
	.fieldbtn {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		text-align: start;
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-sm);
		min-height: var(--tap);
	}
	.fieldbtn:hover {
		background: var(--surface-hover);
	}
	.fieldbtn.on {
		background: color-mix(in oklch, var(--accent) 14%, transparent);
	}
	.fname {
		font-size: var(--t-sm);
		color: var(--text-primary);
		flex-shrink: 0;
		min-width: 11ch;
	}
	.fval {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.fval.blank {
		font-style: italic;
		color: var(--text-faint);
	}

	.evidence {
		display: flex;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.evidence :global(> *) {
		flex: 1;
		min-width: 180px;
	}

	.fallback,
	.note {
		margin: 0 0 var(--s-5);
		font-size: var(--t-xs);
		color: var(--basis-inferred);
		line-height: 1.5;
	}
	.error {
		margin: 0 0 var(--s-4);
		font-size: var(--t-sm);
		color: var(--basis-unsubstantiated);
	}
	.actions {
		display: flex;
		gap: var(--s-4);
		margin-top: var(--s-5);
	}
</style>
