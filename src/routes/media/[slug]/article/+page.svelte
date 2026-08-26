<script lang="ts">
	import { t } from '$lib/t.svelte';
	import ArticleLayout from '$lib/components/media/ArticleLayout.svelte';
	import type { InvestigationBundle } from '$lib/media/types';

	/**
	 * The narrative article — the primary reading experience.
	 * Loads the investigation bundle and renders the article with evidence
	 * indicators, entity mentions, sidebar timeline, and entity card.
	 */

	let { data } = $props();
	const investigation = $derived(data.investigation as unknown as InvestigationBundle);
</script>

<svelte:head>
	<title>{investigation.meta.title.en} · DeepTunisia Media</title>
	<meta name="description" content={investigation.meta.subtitle.en} />
</svelte:head>

<ArticleLayout {investigation} />
