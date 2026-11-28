<script lang="ts">
	import EventsPage from '$lib/components/events/EventsPage.svelte';
	import { t } from '$lib/t.svelte';
</script>

<svelte:head>
	<title>{t('nav.events')} · DeepTunisia</title>
	<meta name="description" content="Every recorded event in Tunisia's political record from 1955 to 2026, on one time axis, with what caused it and what followed." />
</svelte:head>

<EventsPage />
