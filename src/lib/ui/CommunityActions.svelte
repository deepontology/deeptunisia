<script lang="ts">
	import { t } from '$lib/t.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { AGORA_OPEN } from '$lib/agora-gate';
	import { discussUrl, proposeUrl, type CommunityTarget } from '$lib/community';

	/**
	 * The two doors from a record into the Agora.
	 *
	 * WHY A COMPONENT
	 *
	 * This pair existed twice — once on the entity card, once on the connection card —
	 * as two hand-rolled `.cbtn` rules that had already drifted apart: one called its
	 * secondary variant `.propose`, the other `.quiet`, and their hover states did
	 * different things. They are the same affordance and they must look the same,
	 * because the difference the reader is meant to notice is between *discussing* a
	 * record and *proposing to change* it, not between two places it appears.
	 *
	 * GATED
	 *
	 * When AGORA_OPEN is false (the section is staged, not open), the doors render
	 * as inert buttons with a visible "soon" mark — nothing to navigate to. When the
	 * flag is true they become the real anchors: middle-click, open-in-new-tab and
	 * copy-the-link all return, and the plain links keep the atlas from ever making
	 * a request to the community server. The record the door belongs to stays on
	 * the container as data in both modes, so the wiring never changes.
	 */

	interface Props {
		type: CommunityTarget;
		id: string;
		/** Human name for the thread, since ids mean nothing to a reader. */
		label?: string;
		/** Full width on a card, inline on a dense list. */
		size?: 'md' | 'sm';
	}

	let { type, id, label, size = 'md' }: Props = $props();
</script>

<div class="acts s-{size}" data-target={type} data-id={id} data-label={label}>
	{#if AGORA_OPEN}
		<a class="cbtn" href={discussUrl(type, id, label)}>{t('panel.discuss')}</a>
		<a class="cbtn quiet" href={proposeUrl(type, id, label)}>{t('panel.propose')}</a>
	{:else}
		<Tooltip content={t('agora.comingsoon')}>
			<span class="cbtn soon">
				{t('panel.discuss')}<i class="chip">{t('agora.soon.badge')}</i>
			</span>
		</Tooltip>
		<Tooltip content={t('agora.comingsoon')}>
			<span class="cbtn quiet soon">
				{t('panel.propose')}<i class="chip">{t('agora.soon.badge')}</i>
			</span>
		</Tooltip>
	{/if}
</div>

<style>
	.acts {
		display: flex;
		gap: var(--s-3);
	}

	.cbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		font-weight: 520;
		text-align: center;
		color: var(--accent-text);
		background: var(--accent);
		border: 1px solid transparent;
		border-radius: var(--r-md);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.cbtn:hover,
	.cbtn:focus-visible {
		background: var(--accent-hover);
		color: var(--accent-text);
	}

	/*
	   Proposing a change is the heavier action and the rarer one. It must not compete
	   with reading the discussion, but it must not look disabled either — a proposal
	   is how the record improves.
	*/
	.cbtn.quiet {
		color: var(--text-secondary);
		background: transparent;
		border-color: var(--border-default);
	}
	.cbtn.quiet:hover,
	.cbtn.quiet:focus-visible {
		color: var(--text-primary);
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	/*
	   The coming-soon state. Not a disabled state: nothing is being refused, the
	   door simply does not exist yet. The visual register is "present but inert" —
	   muted surface, no hover movement — with the small "soon" mark carrying the
	   message, so the two buttons keep their relative weight (discuss over propose).
	*/
	.cbtn.soon {
		cursor: default;
		color: var(--text-secondary);
		background: var(--surface-sunken);
		border-color: var(--border-default);
		transition: none;
	}
	.cbtn.soon:hover,
	.cbtn.soon:focus-visible {
		background: var(--surface-sunken);
		color: var(--text-secondary);
		border-color: var(--border-default);
	}
	.cbtn.quiet.soon {
		color: var(--text-faint);
		background: transparent;
		border-color: var(--border-subtle);
	}
	.cbtn.quiet.soon:hover,
	.cbtn.quiet.soon:focus-visible {
		color: var(--text-faint);
		background: transparent;
		border-color: var(--border-subtle);
	}

	.chip {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-style: normal;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		line-height: 1;
		padding: 2px 4px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
		background: var(--surface-overlay);
	}

	.s-md .cbtn {
		flex: 1;
		min-height: 30px;
		padding: 0 var(--s-5);
		font-size: var(--t-sm);
	}
	.s-sm .cbtn {
		min-height: 24px;
		padding: 0 var(--s-4);
		font-size: var(--t-xs);
	}

	@media (max-width: 900px) {
		.s-md .cbtn {
			min-height: var(--tap);
		}
	}
</style>
