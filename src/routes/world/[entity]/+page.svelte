<script lang="ts">
	import { page } from '$app/state';
	import WorldDossier from '$lib/components/WorldDossier.svelte';

	const entity = $derived(page.params.entity ?? '');
</script>

<WorldDossier {entity} />
