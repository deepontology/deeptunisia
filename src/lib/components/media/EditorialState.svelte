<script lang="ts">
	/**
	 * EditorialState — the line that says what state an investigation is in,
	 * what that state means, and who reviewed it.
	 *
	 * WHY IT IS DATA, NOT DICTIONARY
	 *
	 * The wording comes from src/content/media/editorial-state.yaml through the
	 * emitted bundle, for the same reason titles do: it is the piece's own
	 * editorial metadata, and the build refuses to ship a status it cannot
	 * label in all three locales. A reviewer of null renders the record's own
	 * words ("No reviewer recorded.") instead of a name or a silence, so
	 * publication never implies a review that did not happen.
	 */
	import Chip from '$lib/ui/Chip.svelte';
	import { localized, statusTint } from '$lib/media/meta';
	import type { EditorialState as EditorialStateData } from '$lib/media/types';

	interface Props {
		/** The resolved status, e.g. `draft`. Drives the chip's ink. */
		status: string;
		/** The localized wording for that status, from the emitted bundle. */
		state: EditorialStateData;
		/** The recorded reviewer, or null when the record names none. */
		reviewer?: string | null;
		size?: 'xs' | 'sm';
	}

	let { status, state, reviewer = null, size = 'sm' }: Props = $props();
</script>

<div class="editorial-state">
	<Chip {size} variant="soft" tint={statusTint(status)}>{localized(state.label)}</Chip>
	{#if state.note}
		<span class="note">{localized(state.note)}</span>
	{/if}
	<span class="reviewer">
		{#if reviewer}
			{localized(state.reviewer_label)}: {reviewer}
		{:else}
			{localized(state.no_reviewer)}
		{/if}
	</span>
</div>

<style>
	.editorial-state {
		/*
		 * inline-flex, not flex: the article header centers its meta line while
		 * the index card and the gateway start theirs. An inline-level box is
		 * placed by the parent's text-align, so one component sits correctly
		 * in both without each caller overriding the alignment.
		 */
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-3);
		margin: var(--s-3) 0 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.note {
		color: var(--text-secondary);
	}
	.reviewer {
		color: var(--text-faint);
	}
</style>
