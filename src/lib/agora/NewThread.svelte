<script lang="ts">
	/**
	 * Opening a thread.
	 *
	 * THE HOLE THIS CLOSES
	 *
	 * The target used to be whatever the URL arrived with, and nothing else. If you
	 * came from an entity card you got a thread attached to that record; if you
	 * opened Agora directly you could only ever create an unattached one — which
	 * removes the entire premise. "Discussion has an object" is the thing that makes
	 * this different from a forum, and it was reachable from exactly one direction.
	 *
	 * The picker searches the same index as ⌘K, so attaching a thread to a record
	 * and finding that record anywhere else in the app are the same gesture.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import EntityMenu from './EntityMenu.svelte';
	import PrivacyNotice from './PrivacyNotice.svelte';
	import PostingAs from './PostingAs.svelte';
	import { search, type Hit } from '$lib/search';
	import { THREAD_KINDS } from '$lib/agora.svelte';
	import { t } from '$lib/t.svelte';
	import { LAYER_COLOR } from '$lib/model';

	interface Props {
		/** Preset when the reader arrived from an entity card. */
		fixed?: { type: string; id: string; label: string } | null;
		busy?: boolean;
		error?: string;
		oncreate: (v: { title: string; kind: string; type: string; id: string | null }) => void;
		oncancel: () => void;
	}

	let { fixed = null, busy = false, error = '', oncreate, oncancel }: Props = $props();

	let title = $state('');
	let kind = $state('discussion');

	let chosen = $state<Hit | null>(null);
	let query = $state('');
	let cursor = $state(0);
	let focused = $state(false);

	const hits = $derived(focused && !chosen ? search(query, { limit: 6 }) : []);

	function choose(h: Hit) {
		chosen = h;
		query = '';
		focused = false;
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

	/** A relationship is a `relationship`; everything else maps by its own kind. */
	function typeOf(h: Hit): string {
		return h.kind;
	}

	function create() {
		if (!title.trim() || busy) return;
		if (fixed) oncreate({ title, kind, type: fixed.type, id: fixed.id });
		else if (chosen) oncreate({ title, kind, type: typeOf(chosen), id: chosen.id });
		else oncreate({ title, kind, type: 'open', id: null });
	}
</script>

<Panel elevation={1} padded>
	<h3>{t('agora.newthread')}</h3>

	<Field label={t('agora.title.label')} required error={error || undefined}>
		<Input bind:value={title} placeholder={t('agora.titleph')} size="md" maxlength={200} />
	</Field>

	<Field label={t('agora.kind')} hint={t('agora.kindhint')}>
		<div class="kinds">
			<Segmented
				options={THREAD_KINDS.map((k) => ({ value: k, label: t(`agora.kind.${k}`) }))}
				value={kind}
				onchange={(v) => (kind = v)}
				label={t('agora.kind')}
			/>
		</div>
	</Field>

	<Field label={t('agora.attachto')} hint={t('agora.attachhint')}>
		{#if fixed}
			<div class="chosen">
				<Chip variant="outline">{fixed.type}</Chip>
				<strong>{fixed.label}</strong>
			</div>
		{:else if chosen}
			<div class="chosen">
				<i class="dot" style:background={LAYER_COLOR[chosen.layer]} aria-hidden="true"></i>
				<strong>{chosen.name}</strong>
				<span class="kind">{chosen.kind}</span>
				<Button size="xs" variant="ghost" onclick={() => (chosen = null)}>
					{t('agora.detach')}
				</Button>
			</div>
		{:else}
			<Input
				bind:value={query}
				placeholder={t('agora.attachsearch')}
				size="md"
				onfocus={() => (focused = true)}
				onkeydown={onKey}
			/>
			{#if hits.length}
				<EntityMenu {hits} {cursor} onpick={choose} onhover={(i) => (cursor = i)} />
			{/if}
		{/if}
	</Field>

	<!--
		The identity this thread will carry, shown where the thread is being made.
		A thread is the most visible thing anyone posts here — it is what appears in
		the list — so if there is one place the question "who am I here?" has to be
		answerable without hunting, it is this one.
	-->
	<div class="who">
		<PostingAs />
	</div>

	<PrivacyNotice expanded />

	<div class="actions">
		<Button variant="solid" onclick={create} disabled={!title.trim() || busy}>
			{t('agora.create')}
		</Button>
		<Button variant="ghost" onclick={oncancel}>{t('agora.cancel')}</Button>
	</div>
</Panel>

<style>
	h3 {
		margin: 0 0 var(--s-6);
		font-size: var(--t-md);
	}
	/* The control is a fixed row of seven; below 900px it scrolls rather than
	   wrapping into a second row that the sliding indicator cannot describe. */
	.kinds {
		overflow-x: auto;
		scrollbar-width: none;
	}
	.kinds::-webkit-scrollbar {
		display: none;
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-4);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		font-size: var(--t-sm);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.kind {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
		flex: 1;
	}
	.who {
		margin: var(--s-5) 0 var(--s-6);
	}
	.actions {
		display: flex;
		gap: var(--s-4);
		margin-top: var(--s-6);
	}
</style>
