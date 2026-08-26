<script lang="ts">
	/**
	 * Proposed changes.
	 *
	 * Status is the first thing on the row and it is tinted along the basis ramp,
	 * because the ramp already means "how well does this stand up" everywhere else
	 * in the product. `applied` is green for the same reason a documented claim is:
	 * it is in the graph now. `needs-evidence` sits at amber, which is the honest
	 * place for a change nobody has shown to be right yet.
	 */
	import Panel from '$lib/ui/Panel.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Author from './Author.svelte';
	import { targetName } from '$lib/model';
	import { relativeTime } from './time';
	import { app } from '$lib/state.svelte';
	import { t } from '$lib/t.svelte';
	import type { Pr, PrStatus } from '$lib/community';

	interface Props {
		items: Pr[];
		href: (pr: Pr) => string;
	}

	let { items, href }: Props = $props();

	const TINT: Record<PrStatus, string> = {
		applied: 'var(--basis-documented)',
		accepted: 'var(--basis-documented)',
		pending: 'var(--basis-reported)',
		'under-review': 'var(--basis-reported)',
		'needs-evidence': 'var(--basis-inferred)',
		rejected: 'var(--basis-unsubstantiated)',
		withdrawn: 'var(--text-faint)',
		superseded: 'var(--text-faint)'
	};
</script>

<ul class="list">
	{#each items as pr (pr.id)}
		<li>
			<Panel elevation={1} tint={TINT[pr.status]}>
				<a class="row" href={href(pr)}>
					<div class="top">
						<Chip tint={TINT[pr.status]} dot>{pr.status}</Chip>
						{#if pr.target_id}
							<Chip variant="outline">{targetName(pr.target_type, pr.target_id)}</Chip>
						{/if}
					</div>
					<h3>{pr.reason}</h3>
					<div class="meta">
						<Author author={pr.author} compact />
						<span class="sep" aria-hidden="true">·</span>
						<span>{relativeTime(pr.created_at, app.locale)}</span>
						<span class="spacer"></span>
						<span class="ev" class:none={!pr.sources.length}>
							<b>{pr.sources.length}</b>
							{t('agora.evidence')}
						</span>
					</div>
				</a>
			</Panel>
		</li>
	{/each}
</ul>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.row {
		display: block;
		padding: var(--s-5) var(--s-6);
		border-radius: var(--r-lg);
		color: inherit;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.top {
		display: flex;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-bottom: var(--s-3);
	}
	h3 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		font-weight: 460;
		line-height: 1.45;
		color: var(--text-primary);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.sep {
		opacity: 0.5;
	}
	.spacer {
		flex: 1;
	}
	.ev b {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	/* No citation is the interesting case — it is the reason a proposal cannot be
	   accepted, so it should not look like any other number. */
	.ev.none b {
		color: var(--basis-inferred);
	}
</style>
