<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { t, tf } from '$lib/t.svelte';

	/**
	 * The evidence floor, played with the record's real counts.
	 *
	 * The four numbers are the claim records the build counted by kind, so the
	 * bar is the dataset that published this page, not an illustration. Each
	 * floor keeps the kinds at or above it; the rest fade, the way the network
	 * thins when a reader raises the floor on the map.
	 */
	let { basis }: { basis: { documented: number; reported: number; inferred: number; unsubstantiated: number } } =
		$props();

	const KINDS = ['documented', 'reported', 'inferred', 'unsubstantiated'] as const;
	/** Floor index → how many kinds stay visible, strongest first. */
	const FLOORS = [
		{ key: 'intro.floor.all', keep: 4 },
		{ key: 'intro.floor.norumour', keep: 3 },
		{ key: 'intro.floor.reported', keep: 2 },
		{ key: 'intro.floor.documented', keep: 1 }
	];
	// The map's own default hides rumours, so the demo starts there too.
	let floor = $state(1);

	const nf = $derived(new Intl.NumberFormat(app.locale, { numberingSystem: 'latn' }));
	const total = $derived(KINDS.reduce((a, k) => a + basis[k], 0));
	const keep = $derived(FLOORS[floor].keep);
	const shown = $derived(KINDS.slice(0, keep).reduce((a, k) => a + basis[k], 0));
	const pct = $derived(total ? Math.round((shown / total) * 100) : 0);
</script>

<div class="floor">
	<div class="head">
		<p class="k mono">{t('intro.floor.title')}</p>
		<p class="lead-s">{t('intro.floor.lead')}</p>
	</div>
	<div class="seg" role="group" aria-label={t('intro.floor.aria')}>
		{#each FLOORS as f, i (f.key)}
			<button type="button" class="mono" aria-pressed={floor === i} onclick={() => (floor = i)}>{t(f.key)}</button>
		{/each}
	</div>
	<div class="bar" aria-hidden="true">
		{#each KINDS as k, i (k)}
			<span class="seg-{k}" class:off={i >= keep} style:flex-grow={basis[k]}></span>
		{/each}
	</div>
	<p class="readout" aria-live="polite">
		<span class="big-n">{nf.format(shown)}</span>
		<span class="pct mono">{nf.format(pct)}%</span>
		<span class="of">{tf('intro.floor.readout', { shown: nf.format(shown), total: nf.format(total) })}</span>
	</p>
	<ul class="legend mono">
		{#each KINDS as k, i (k)}
			<li class:off={i >= keep}><span class="sw seg-{k}"></span>{t(`basis.${k}`)} <b>{nf.format(basis[k])}</b></li>
		{/each}
	</ul>
</div>

<style>
	.floor {
		margin: 2rem 0;
		padding: 1.2rem 1.2rem 1rem;
		border: 1px solid var(--border-default);
	}
	.k {
		margin: 0 0 0.4rem;
		font-size: 0.6875rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.lead-s {
		margin: 0 0 1rem;
		max-width: 52ch;
		color: var(--text-secondary);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.seg {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.1rem;
	}
	.seg button {
		padding: 0.45rem 0.7rem;
		border: 1px solid var(--border-strong);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background 160ms ease,
			color 160ms ease,
			border-color 160ms ease;
	}
	.seg button:hover {
		border-color: var(--text-primary);
		color: var(--text-primary);
	}
	.seg button[aria-pressed='true'] {
		background: var(--text-primary);
		border-color: var(--text-primary);
		color: #000;
	}
	.seg button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 2.4rem;
	}
	.bar span {
		flex-basis: 0;
		min-width: 4px;
		transition:
			opacity 380ms ease,
			filter 380ms ease;
	}
	.bar span.off {
		opacity: 0.12;
		filter: saturate(0);
	}
	.seg-documented {
		background: var(--basis-documented);
	}
	.seg-reported {
		background: repeating-linear-gradient(90deg, var(--basis-reported) 0 9px, color-mix(in oklab, var(--basis-reported) 55%, transparent) 9px 12px);
	}
	.seg-inferred {
		background: repeating-linear-gradient(90deg, var(--basis-inferred) 0 3px, transparent 3px 6px);
	}
	.seg-unsubstantiated {
		background: repeating-linear-gradient(90deg, var(--basis-unsubstantiated) 0 7px, transparent 7px 9px, var(--basis-unsubstantiated) 9px 11px, transparent 11px 13px);
	}
	.readout {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.9rem;
		margin: 1rem 0 0.6rem;
	}
	.big-n {
		font-size: clamp(2rem, 6cqw, 3rem);
		line-height: 1;
		font-weight: 700;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.pct {
		font-size: 0.8rem;
		color: var(--accent);
	}
	.of {
		flex-basis: 100%;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		transition: opacity 380ms ease;
	}
	.legend li.off {
		opacity: 0.35;
	}
	.legend b {
		font-weight: 400;
		color: var(--text-primary);
	}
	.sw {
		display: inline-block;
		width: 1.4rem;
		height: 0.55rem;
	}
	@media (prefers-reduced-motion: reduce) {
		.bar span,
		.legend li,
		.seg button {
			transition: none;
		}
	}
</style>
