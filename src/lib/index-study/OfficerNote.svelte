<script lang="ts">
	import { t, tf } from '$lib/t.svelte';
	import { STORIES_EMAIL } from '$lib/research';

	/**
	 * A note for police officers who land on the index: please do not answer,
	 * and where to write if they have a story. A request, not a gate: the survey
	 * asks nothing about who anyone is, so there is no question to screen with
	 * and none is added. Closed by default, so it costs everyone else one line.
	 */
</script>

<details class="officer">
	<summary>{t('research.officer.open')}</summary>
	<p>
		{#each tf('research.officer.body', { email: '\u0000' }).split('\u0000') as part, i (i)}
			{#if i > 0}<a href="mailto:{STORIES_EMAIL}" dir="ltr">{STORIES_EMAIL}</a>{/if}{part}
		{/each}
	</p>
</details>

<style>
	.officer {
		margin-block: var(--space-3, 12px);
		font-size: var(--text-sm, 0.875rem);
		color: var(--text-secondary);
	}
	.officer summary {
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		width: fit-content;
	}
	.officer p {
		margin-block-start: var(--space-2, 8px);
		max-width: 60ch;
	}
</style>
