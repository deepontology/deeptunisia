<script lang="ts">
	/**
	 * The world view — one system, two projections (see
	 * docs/plans/world-rebuild-v2.md).
	 *
	 * WHY THE STRIP LIVES HERE
	 *
	 * The totals strip answers "how much does the country owe, and how much does
	 * it move" for the cursor year, and the answer must not move when the reader
	 * switches projection — so it sits above the switch, owned by the page, not
	 * by either view.
	 *
	 * WHY ?view= IS CONSUMED AND WRITTEN
	 *
	 * A link to a query parameter nothing reads is the worst shape of broken
	 * (AGENTS.md): the page loads, and nothing happens, indistinguishable from
	 * the feature not existing. This page reads `?view=` on load and writes it
	 * back on switch, so a shared link to `/world?view=ledger` opens the table,
	 * and the smoke suite pins that behaviour.
	 */
	import WorldView from '$lib/components/WorldView.svelte';
	import WorldLedger from '$lib/components/WorldLedger.svelte';
	import WorldTotals from '$lib/components/WorldTotals.svelte';
	import { world, type WorldViewMode } from '$lib/world/store.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import { t } from '$lib/t.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const viewOptions = $derived([
		{ value: 'globe', label: t('world.view.globe') },
		{ value: 'ledger', label: t('world.view.ledger') }
	]);

	// Consume the parameter. Only the two known values count; anything else —
	// including an absent parameter — leaves the store's default alone.
	$effect(() => {
		const v = page.url.searchParams.get('view');
		if (v === 'globe' || v === 'ledger') {
			if (world.view !== v) world.setView(v);
		}
	});

	function setView(v: string) {
		const mode = v as WorldViewMode;
		world.setView(mode);
		// Write it back so the URL is shareable state, not a leftover.
		const url = new URL(page.url);
		url.searchParams.set('view', mode);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>{t('world.page.title')}</title>
	<meta name="description" content={t('world.page.description')} />
</svelte:head>

<div class="worldpage">
	<WorldTotals />

	<div class="viewbar">
		<Segmented options={viewOptions} value={world.view} onchange={setView} label={t('world.view.label')} />
	</div>

	<div class="stage">
		{#if world.view === 'globe'}
			<WorldView />
		{:else}
			<WorldLedger />
		{/if}
	</div>
</div>

<style>
	.worldpage {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.viewbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		padding: var(--s-2) var(--s-5);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--surface-base);
	}

	.stage {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	/*
	 * The dissolve that says "same data, different arrangement". A cross-fade, not
	 * a 3-D morph — the plan records why the literal globe-flattening was rejected:
	 * motion must mean something, and a flattening animation encodes nothing.
	 * Reduced motion gets the instant switch.
	 */
	.stage :global(.world),
	.stage :global(.ledger) {
		animation: world-in var(--dur-normal) var(--ease-out);
	}
	@keyframes world-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stage :global(.world),
		.stage :global(.ledger) {
			animation: none;
		}
	}
</style>
