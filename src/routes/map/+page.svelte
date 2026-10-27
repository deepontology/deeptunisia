<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/t.svelte';

	/*
	 * The governorate map is the world view at country scale now: one surface
	 * that zooms from the globe into the governorates. This route stays so old
	 * links keep working; it forwards `?region=` and lands zoomed in. The query
	 * is read on mount, because a prerendered page has none.
	 */
	onMount(() => {
		const region = new URL(location.href).searchParams.get('region');
		void goto(region ? `/world?region=${encodeURIComponent(region)}` : '/world?at=tunisia', { replaceState: true });
	});
</script>

<svelte:head>
	<title>{t('nav.map')} · DeepTunisia</title>
	<meta http-equiv="refresh" content="0; url=/world?at=tunisia" />
</svelte:head>

<p><a href="/world?at=tunisia">{t('nav.map.hint')}</a></p>
