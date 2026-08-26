<script lang="ts">
	/**
	 * "Posting as …", attached to the thing you are about to post.
	 *
	 * WHY IT IS HERE AND NOT IN A SETTINGS PANEL
	 *
	 * It was a panel on its own route, reachable from a control in the page header,
	 * and it went unfound — which is the expected outcome, not bad luck. Choosing
	 * whether to attach a standing to something is a decision made *about a
	 * particular post*, at the moment of writing it. A person about to explain that
	 * they saw a document is deciding right then whether to say they worked there,
	 * and asking them to have visited a settings screen earlier gets the sequence
	 * backwards.
	 *
	 * So it sits above every composer, showing exactly what will appear under what
	 * they are writing. There is nothing per-composer to remember: it edits the one
	 * shared identity, so a name chosen once in a reply box is the name every other
	 * composer, thread list and proposal shows from then on.
	 *
	 * WHEN BURNING, IT SAYS SO
	 *
	 * "Post once" mints a throwaway keypair, which by construction has no name and no
	 * description — a fresh key has no row to carry them. That is the point of it, and
	 * it would be a bad surprise, so the control states it rather than showing an
	 * identity the post will not actually carry.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Popover from '$lib/ui/Popover.svelte';
	import Author from './Author.svelte';
	import IdentityForm from './IdentityForm.svelte';
	import { agora } from '$lib/agora.svelte';
	import { t } from '$lib/t.svelte';

	interface Props {
		/** True while the reader is hovering or focused on the throwaway option. */
		burning?: boolean;
	}

	let { burning = false }: Props = $props();

	let open = $state(false);
</script>

<div class="as">
	<span class="lbl">{t('agora.postingas')}</span>

	{#if burning}
		<span class="burn">{t('agora.postingas.burn')}</span>
	{:else if agora.handle}
		<Author author={{ handle: agora.handle, name: agora.name, note: agora.note }} />
		<div class="anchor">
			<Button size="xs" variant="ghost" onclick={() => (open = !open)}>
				{agora.name || agora.note ? t('agora.postingas.change') : t('agora.postingas.set')}
			</Button>
			<Popover {open} onclose={() => (open = false)} align="start" label={t('agora.identity.title')}>
				<div class="sheet">
					<IdentityForm
						verbose={false}
						onsaved={() => (open = false)}
						oncancel={() => (open = false)}
					/>
				</div>
			</Popover>
		</div>
	{/if}
</div>

<style>
	.as {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		padding-bottom: var(--s-3);
		margin-bottom: var(--s-3);
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--t-xs);
		color: var(--text-faint);
		min-width: 0;
	}
	.lbl {
		flex-shrink: 0;
	}
	.burn {
		color: var(--basis-inferred);
		font-style: italic;
	}
	.anchor {
		position: relative;
	}
	/*
	 * Wide enough to hold two labelled fields and the preview. On a phone Popover
	 * becomes a bottom sheet and takes the full width instead, so this is a maximum
	 * rather than a size.
	 */
	.sheet {
		width: min(420px, calc(100vw - var(--s-8)));
		padding: var(--s-6);
	}
	@media (max-width: 900px) {
		.sheet {
			width: auto;
		}
	}
</style>
