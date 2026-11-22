<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Viewport from '$lib/shell/Viewport.svelte';
	import { ownsPreviewTags } from '$lib/shell/preview';

	let { children } = $props();

	/**
	 * Pages of prose: the menu, the sub-navigation and a scrolling view. Nothing
	 * that reads a record is mounted here, which is what keeps the graph off a
	 * page whose only job is to explain the record.
	 */
	const ownsPreview = $derived(ownsPreviewTags(page.url.pathname));

	/* A link with ?id= names a record. A reading page has no panel to open it
	   in, so it sends the reader to the record's own page instead. */
	$effect(() => {
		if (!browser) return;
		const id = page.url.searchParams.get('id');
		if (id) void goto(`/e/${encodeURIComponent(id)}`, { replaceState: true });
	});
</script>

<svelte:head>
	{#if !ownsPreview}
		<!-- Prerendered default card, so a link to a page that sets none of its own
		     still previews with the mark. Inline because a component that renders
		     head tags alone cannot hydrate in the body. -->
		<meta property="og:site_name" content="DeepTunisia" />
		<meta property="og:title" content="DeepTunisia: a public record of power" />
		<meta property="og:description" content="An open, source-backed public record of the people, institutions and networks that shape Tunisia, 1956 to 2026." />
		<meta property="og:type" content="website" />
		<meta property="og:image" content="https://deeptunisia.org/og/default.png" />
		<meta property="og:image:alt" content="DeepTunisia: the circle and dot mark beside the name and the line Power, institutions and evidence, 1956 to 2026." />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content="https://deeptunisia.org/og/default.png" />
	{/if}
</svelte:head>

<div class="body">
	<Viewport>
		{@render children()}
	</Viewport>
</div>

<style>
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: stretch;
	}
</style>
