<script lang="ts">
	import Rankings from '$lib/components/Rankings.svelte';
	import { t } from '$lib/t.svelte';
</script>

<svelte:head>
	<title>{t('nav.rankings')} · DeepTunisia</title>
	<meta name="description" content={t('rankings.hint')} />
</svelte:head>

<Rankings />
