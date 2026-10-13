<script lang="ts">
	import Chronicle from '$lib/components/Chronicle.svelte';
	import ChronicleVertical from '$lib/components/chronicle-v/ChronicleVertical.svelte';
	import { compact } from '$lib/design/media.svelte';
</script>

<svelte:head>
	<title>Chronicle — DeepTunisia</title>
	<meta
		name="description"
		content="Every senior political, military, security and economic post in Tunisia from 1956 to 2026, drawn to scale on one timeline."
	/>
</svelte:head>

{#if compact.current}
	<ChronicleVertical />
{:else}
	<Chronicle />
{/if}
