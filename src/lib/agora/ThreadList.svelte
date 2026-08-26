<script lang="ts">
	/**
	 * The list of threads.
	 *
	 * A thread row is an anchor, not a button, for the same reason `CommunityActions`
	 * is: it navigates. Making it a button costs middle-click, open-in-new-tab and
	 * copying the address of a specific argument — and this project already decided
	 * that argument once, for connections, on the grounds that citing the exact
	 * record you dispute is most of the point of records having URLs. A thread is a
	 * record of a dispute; the same reasoning applies unchanged.
	 */
	import Panel from '$lib/ui/Panel.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Author from './Author.svelte';
	import { t } from '$lib/t.svelte';
	import { targetName } from '$lib/model';
	import { relativeTime } from './time';
	import { app } from '$lib/state.svelte';
	import type { Thread } from '$lib/community';

	interface Props {
		threads: Thread[];
		/** Builds the permalink for a thread. */
		href: (t: Thread) => string;
	}

	let { threads, href }: Props = $props();
</script>

<ul class="list">
	{#each threads as thread (thread.id)}
		<li>
			<Panel elevation={1}>
				<a class="row" href={href(thread)}>
					<h3>{thread.title}</h3>
					<div class="meta">
						<Chip>{thread.kind}</Chip>
						{#if thread.target_id}
							<!-- Named, not slugged. A reader deciding whether to open a thread
							     should not have to decode `rel-leila-trabelsi-ben-ali-family`. -->
							<Chip variant="outline">
								{targetName(thread.target_type, thread.target_id)}
							</Chip>
						{/if}
						<Author author={thread.author} compact />
						<span class="dot" aria-hidden="true">·</span>
						<span>{relativeTime(thread.created_at, app.locale)}</span>
						<span class="spacer"></span>
						<span class="count">
							<b>{thread.post_count}</b>
							{t('agora.replies')}
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
		transition: background var(--dur-fast) var(--ease-out);
	}
	.row:hover {
		background: var(--surface-hover);
	}
	h3 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-md);
		font-weight: 500;
		line-height: 1.35;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.dot {
		opacity: 0.5;
	}
	.spacer {
		flex: 1;
	}
	.count b {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-weight: 520;
		color: var(--text-secondary);
	}
	@media (max-width: 900px) {
		.spacer {
			flex: 0;
		}
	}
</style>
