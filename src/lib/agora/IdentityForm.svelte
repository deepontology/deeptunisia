<script lang="ts">
	/**
	 * The fields for choosing who you are, without deciding where they sit.
	 *
	 * Shared by the panel at `/agora?identity=1` and by the "posting as" control in
	 * the composer, because the second one is where this actually gets used: the
	 * moment a person decides whether to attach a standing to something is the moment
	 * they are about to write it, not some earlier visit to a settings screen. A
	 * separate page for it meant almost nobody found it.
	 *
	 * Saving updates the shared `agora` state, so a name chosen once in a reply box is
	 * the name every other composer, thread list and proposal shows from then on.
	 * There is nothing per-composer to remember.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Author from './Author.svelte';
	import { agora, send, messageFor } from '$lib/agora.svelte';
	import { t } from '$lib/t.svelte';

	interface Props {
		/** Called after a successful save, so a popover can close itself. */
		onsaved?: () => void;
		oncancel?: () => void;
		/** The long warning. Off inside a popover, which has its own summary. */
		verbose?: boolean;
	}

	let { onsaved, oncancel, verbose = true }: Props = $props();

	let name = $state(agora.name ?? '');
	let note = $state(agora.note ?? '');
	let error = $state('');
	let busy = $state(false);

	const preview = $derived({
		handle: agora.handle,
		name: name.trim() || null,
		note: note.trim() || null
	});
	const dirty = $derived(
		(name.trim() || null) !== (agora.name ?? null) || (note.trim() || null) !== (agora.note ?? null)
	);

	async function save() {
		busy = true;
		error = '';
		try {
			const r = await send('/api/name', {
				display_name: name.trim() || null,
				self_description: note.trim() || null
			});
			if (r.status !== 200) {
				error = r.body.error;
				return;
			}
			agora.name = r.body.name;
			agora.note = r.body.note;
			onsaved?.();
		} catch (e) {
			error = messageFor(e) ?? t('agora.offline');
		} finally {
			busy = false;
		}
	}

	function clear() {
		name = '';
		note = '';
		void save();
	}
</script>

<div class="form">
	<!--
		Before the fields, not after them. Somebody deciding whether to take a name is
		making that decision here, and a warning underneath the input arrives once it
		has already been typed.
	-->
	<div class="risk">
		<p>{t('agora.identity.risk')}</p>
		{#if verbose}
			<p>{t('agora.identity.risk2')}</p>
		{/if}
	</div>

	<Field label={t('agora.identity.name')} hint={verbose ? t('agora.identity.namehint') : undefined}>
		<Input bind:value={name} maxlength={40} size="md" placeholder={agora.handle} />
	</Field>

	<Field label={t('agora.identity.note')} hint={verbose ? t('agora.identity.notehint') : undefined}>
		<Input bind:value={note} maxlength={60} size="md" placeholder={t('agora.identity.noteph')} />
	</Field>

	<div class="preview">
		<span class="lbl">{t('agora.identity.preview')}</span>
		<Author author={preview} />
	</div>
	<!--
		The handle is in the preview whatever they type, because that is the fact this
		most needs to convey: a name is ADDED to an identity here, it does not replace
		it, and it cannot let you be mistaken for somebody else.
	-->
	<p class="fixed">{t('agora.identity.handlefixed')}</p>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<div class="actions">
		<Button variant="solid" onclick={save} disabled={busy || !dirty}>
			{t('agora.identity.save')}
		</Button>
		{#if agora.name || agora.note}
			<Button variant="ghost" onclick={clear} disabled={busy}>{t('agora.identity.clear')}</Button>
		{/if}
		{#if oncancel}
			<Button variant="ghost" onclick={oncancel}>{t('agora.cancel')}</Button>
		{/if}
	</div>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-width: 0;
	}
	.risk {
		border-inline-start: 2px solid var(--basis-inferred);
		background: var(--surface-sunken);
		border-radius: var(--r-sm);
		padding: var(--s-4) var(--s-5);
		margin-bottom: var(--s-4);
	}
	.risk p {
		margin: 0 0 var(--s-3);
		font-size: var(--t-xs);
		line-height: 1.55;
		color: var(--text-secondary);
		max-width: 62ch;
	}
	.risk p:last-child {
		margin-bottom: 0;
	}

	.preview {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		flex-wrap: wrap;
		padding: var(--s-4) var(--s-5);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-md);
		margin-top: var(--s-3);
	}
	.lbl {
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
	}
	.fixed {
		margin: var(--s-3) 0 0;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		line-height: 1.5;
		max-width: 62ch;
	}
	.error {
		margin: var(--s-4) 0 0;
		font-size: var(--t-sm);
		color: var(--basis-unsubstantiated);
	}
	.actions {
		display: flex;
		gap: var(--s-4);
		margin-top: var(--s-5);
		flex-wrap: wrap;
	}
</style>
