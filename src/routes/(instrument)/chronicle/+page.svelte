<script lang="ts">
	import Chronicle from '$lib/components/Chronicle.svelte';
	import ChronicleVertical from '$lib/components/chronicle-v/ChronicleVertical.svelte';
	import { compact } from '$lib/design/media.svelte';
</script>

<svelte:head>
	<title>Chronicle — DeepTunisia</title>
	<!-- The two faces the first record panel draws that the page itself does not: the Arabic name and
	     the italic tagline. Asked for on first use they arrive after the page is built, and every
	     face that arrives then lays the whole page out again. Low priority, so the page's own scripts are
	     not made to wait for them; they still land before the first tap. The italic is the tagline's
	     serif voice (.tagline in EntityPanel); the roman face is about twice the italic's size and is not
	     on the page at first paint, so setting the tagline roman would cost more. content-visibility on the
	     tenure blocks does not bound a late face: most of the blocks are on screen at once. See
	     static/fonts/fonts.css. -->
	<link rel="preload" fetchpriority="low" as="font" type="font/woff2" href="/fonts/ibm-plex-sans-arabic-w400-arabic.woff2" crossorigin="anonymous" />
	<link rel="preload" fetchpriority="low" as="font" type="font/woff2" href="/fonts/newsreader-w400-italic-latin.woff2" crossorigin="anonymous" />
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
