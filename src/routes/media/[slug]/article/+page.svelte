<script lang="ts">
	import ArticleLayout from '$lib/components/media/ArticleLayout.svelte';
	import { localized } from '$lib/media/meta';
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
	<title>{localized(investigation.meta.title)} · DeepTunisia Media</title>
	<meta name="description" content={localized(investigation.meta.subtitle)} />
</svelte:head>

<ArticleLayout {investigation} />
