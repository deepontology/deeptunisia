<script lang="ts">
	import Now from '$lib/components/Now.svelte';
	import { t } from '$lib/t.svelte';
</script>

<svelte:head>
	<title>{t('nav.now')} · DeepTunisia</title>
	<meta name="description" content={t('now.hint')} />
</svelte:head>

<Now />
