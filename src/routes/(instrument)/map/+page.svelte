<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/t.svelte';

	/*
	 * The governorate map is the world view at country scale now: one surface
	 * that zooms from the globe into the governorates. This route stays so old
	 * links keep working; it forwards `?region=` and lands zoomed in.
	 *
	 * There is deliberately no <meta refresh> fallback. It fired before this
	 * mount and always targeted the bare country view, so a `/map?region=…` link
	 * silently lost its governorate on the way. A reader without JavaScript gets
	 * the link below instead.
	 */
	onMount(() => {
		const region = new URL(location.href).searchParams.get('region');
		void goto(region ? `/world?region=${encodeURIComponent(region)}` : '/world?at=tunisia', { replaceState: true });
	});
</script>

<svelte:head>
	<title>{t('nav.map')} · DeepTunisia</title>
</svelte:head>

<p><a href="/world?at=tunisia">{t('nav.map.hint')}</a></p>
