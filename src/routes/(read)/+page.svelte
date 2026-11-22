<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	/**
	 * The root route serves the landing page (copied from landing/index.html
	 * during build). This fallback component exists only for local dev when the
	 * copy step hasn't run — it redirects to /chronicle so the app is never blank.
	 */
	onMount(() => {
		goto('/chronicle', { replaceState: true });
	});
</script>

<svelte:head>
	<title>DeepTunisia</title>
</svelte:head>

<!-- root fallback: this page is replaced by the landing page during the build.
     scripts/build-landing.ts refuses to overwrite any other content at the
     root, so if you are adding a real root route, say so in that script. -->
