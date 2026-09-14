<script lang="ts">
	import { t, tf } from '$lib/t.svelte';
	import Chip from './Chip.svelte';
	import Tooltip from './Tooltip.svelte';

	/**
	 * Independent evidence origins behind a claim.
	 *
	 * `origins` is derived by the build from evidence lineage: unique origin
	 * groups, never a count of links, and the first lineage step is the origin so
	 * a wire republished by several outlets counts once. `independence` is the
	 * authored fallback that predates the evidence layer.
	 *
	 * The chip renders nothing when neither value is present, so a record without
	 * an origin count gets no badge and no invented zero. The note is
	 * supplementary context; the visible count is the accessible name.
	 */
	interface Props {
		origins?: number | null;
		independence?: number | null;
		size?: 'xs' | 'sm';
	}

	let { origins = null, independence = null, size = 'xs' }: Props = $props();
	const value = $derived(origins ?? independence);
</script>

{#if value != null}
	<Tooltip content={t('origins.note')}>
		<Chip variant="outline" {size}>{tf('origins.count', { n: value })}</Chip>
	</Tooltip>
{/if}
