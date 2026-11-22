<script lang="ts">
	import Feed from '$lib/components/Feed.svelte';
</script>

<svelte:head>
	<title>Feed · DeepTunisia</title>
	<meta
		name="description"
		content="Headlines published by Tunisian outlets, linked to entities in the graph by deterministic name matching. Not DeepTunisia data: unverified, ungraded, and never merged into the knowledge graph."
	/>
</svelte:head>

<Feed />
