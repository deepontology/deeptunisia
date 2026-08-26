<script lang="ts">
	/**
	 * What the system can and cannot see.
	 *
	 * This is the best writing in the product and it was being wasted: all four
	 * paragraphs rendered above every view, on every visit, including the ones where
	 * nobody was about to write anything. Text that always appears stops being read
	 * — and the one outcome this particular text cannot afford is becoming
	 * wallpaper, because a person calibrating their own risk against it needs to
	 * actually take it in.
	 *
	 * So it is summarised while browsing and open by default at the moment of
	 * composing, which is when the decision is being made. `expanded` is a prop
	 * rather than a preference: this is not something a reader gets to permanently
	 * dismiss, and every composer mounts it open again.
	 */
	import { t } from '$lib/t.svelte';

	interface Props {
		expanded?: boolean;
	}

	let { expanded = false }: Props = $props();
</script>

<details class="privacy" open={expanded}>
	<summary>
		<span class="mark" aria-hidden="true"></span>
		<strong>{t('agora.privacy.title')}</strong>
		<span class="lede">{t('agora.privacy.summary')}</span>
	</summary>
	<div class="full">
		<p>{t('agora.privacy.ip')}</p>
		<p>{t('agora.privacy.host')}</p>
		<p>{t('agora.privacy.corpus')}</p>
		<p>{t('agora.privacy.tor')}</p>
	</div>
</details>

<style>
	.privacy {
		border: 1px solid var(--border-subtle);
		border-inline-start: 2px solid var(--basis-inferred);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	summary {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-4) var(--s-5);
		cursor: pointer;
		list-style: none;
		min-height: var(--tap);
	}
	summary::-webkit-details-marker {
		display: none;
	}
	strong {
		color: var(--text-primary);
		font-weight: 520;
		flex-shrink: 0;
	}
	.lede {
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	/* The summary line is redundant once the full text is showing. */
	.privacy[open] .lede {
		display: none;
	}

	.mark {
		width: 5px;
		height: 5px;
		border-radius: var(--r-full);
		background: var(--basis-inferred);
		flex-shrink: 0;
		transition: transform var(--dur-fast) var(--ease-out);
	}
	.privacy[open] .mark {
		transform: scale(1.6);
	}

	.full {
		padding: 0 var(--s-5) var(--s-5);
	}
	.full p {
		margin: 0 0 var(--s-4);
		line-height: 1.55;
		max-width: 68ch;
	}
	.full p:last-child {
		margin-bottom: 0;
	}

	@media (max-width: 900px) {
		.lede {
			display: none;
		}
	}
</style>
