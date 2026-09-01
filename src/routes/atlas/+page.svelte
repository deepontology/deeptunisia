<script lang="ts">
	import Atlas from '$lib/components/Atlas.svelte';
	import { t } from '$lib/t.svelte';
</script>

<svelte:head>
	<title>{t('nav.atlas')} · DeepTunisia</title>
	<meta name="description" content={t('atlas.hint')} />
</svelte:head>

<Atlas />
