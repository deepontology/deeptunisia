<script lang="ts">
	import { archiveLookup, sourcesFor } from '$lib/model';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { t } from '$lib/t.svelte';

	let { ids, compact = false }: { ids: string[]; compact?: boolean } = $props();

	const sources = $derived(sourcesFor(ids));

</script>

{#if sources.length}
	<ul class="sources" class:compact>
		{#each sources as s (s.id)}
			<li>
				<div class="head">
					<Tooltip content={t(`sources.tier.${s.tier}`)}>
						<span class="tier t{s.tier}">T{s.tier}</span>
					</Tooltip>
					<a href={s.url} target="_blank" rel="noopener noreferrer" dir="auto">{s.title}</a>
				</div>
				<div class="meta">
					<span dir="auto">{s.publisher}</span>
					{#if s.date}<span class="mono">{s.date}</span>{/if}
					<a class="archive" href={archiveLookup(s)} target="_blank" rel="noopener noreferrer"
						>archive</a
					>
				</div>
				{#if s.excerpt}
					<p class="excerpt" dir="auto">{s.excerpt}</p>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.sources {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.compact {
		gap: 5px;
	}
	li {
		font-size: 12px;
		line-height: 1.45;
	}
	.head {
		display: flex;
		gap: 7px;
		align-items: baseline;
	}
	.head a {
		text-decoration-color: var(--border-default);
	}
	.tier {
		font-family: var(--font-mono);
		font-size: 9px;
		padding: 1px 4px;
		border-radius: 3px;
		border: 1px solid var(--border-default);
		color: var(--text-faint);
		flex-shrink: 0;
		cursor: help;
	}
	/* Tier is evidence quality, so it gets a colour ramp rather than being decorative. */
	.tier.t1 {
		color: var(--basis-documented);
		border-color: color-mix(in oklch, var(--basis-documented) 42%, transparent);
	}
	.tier.t2 {
		color: var(--basis-documented);
		border-color: color-mix(in oklch, var(--basis-documented) 42%, transparent);
	}
	.tier.t3 {
		color: var(--basis-reported);
		border-color: color-mix(in oklch, var(--basis-reported) 42%, transparent);
	}
	.tier.t4 {
		color: var(--basis-inferred);
		border-color: color-mix(in oklch, var(--basis-inferred) 42%, transparent);
	}
	.tier.t5 {
		color: var(--basis-unsubstantiated);
		border-color: color-mix(in oklch, var(--basis-unsubstantiated) 42%, transparent);
	}
	.meta {
		display: flex;
		gap: 9px;
		font-size: 10.5px;
		color: var(--text-faint);
		margin-top: 1px;
	}
	.archive {
		text-decoration: underline;
		text-decoration-color: var(--border-default);
	}
	.excerpt {
		margin: 5px 0 0;
		padding-inline-start: 8px;
		border-inline-start: 2px solid var(--border-subtle);
		font-size: 11.5px;
		color: var(--text-secondary);
		font-style: italic;
		line-height: 1.5;
	}
</style>
