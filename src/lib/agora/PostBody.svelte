<script lang="ts">
	/**
	 * A post's text, rendered from the parsed tree.
	 *
	 * THE RULE THIS COMPONENT EXISTS TO KEEP
	 *
	 * A mention must never render in the same register as a sourced claim.
	 *
	 * The two navigation bubbles encode a promise — Graph is the sourced record,
	 * Agora is everything the record is not — and a filled entity Chip inside a
	 * forum post would quietly break it, by letting anonymous text borrow the
	 * typography the graph uses for things that survived review. The mention here
	 * is therefore *quieter* than the prose around it: a hairline underline and a
	 * layer dot, no fill, no border, no weight change. It is a pointer, not a
	 * citation.
	 *
	 * The hover card is allowed to look like the graph, because it is the graph.
	 */
	import { parse, type Block, type Inline, type MentionSpan } from './markdown';
	import { hitById } from '$lib/search';
	import { LAYER_COLOR } from '$lib/model';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	interface Props {
		body: string;
		mentions?: MentionSpan[];
	}

	let { body, mentions = [] }: Props = $props();

	const blocks = $derived<Block[]>(parse(body, mentions));

	/** A mention whose record has gone is plain text, not a dead link. */
	function resolve(id: string) {
		return hitById(id);
	}
</script>

{#snippet inline(nodes: Inline[])}
	{#each nodes as n, i (i)}
		{#if n.t === 'text'}{n.v}
		{:else if n.t === 'strong'}<strong>{@render inline(n.v)}</strong>
		{:else if n.t === 'em'}<em>{@render inline(n.v)}</em>
		{:else if n.t === 'code'}<code>{n.v}</code>
		{:else if n.t === 'link'}<a
				href={n.href}
				target="_blank"
				rel="nofollow noopener noreferrer"
				class="ext">{n.label}{#if n.label !== n.href}<span class="host">{n.host}</span>{/if}</a
			>
		{:else if n.t === 'mention'}
			{@const hit = resolve(n.id)}
			{#if hit}
				<Tooltip content={hit.detail || hit.name}>
					<a
						class="mention"
						href={hit.kind === 'relationship'
							? `/network?rel=${encodeURIComponent(hit.id)}`
							: `/network?id=${encodeURIComponent(hit.id)}`}
					>
						<i class="dot" style:background={LAYER_COLOR[hit.layer]} aria-hidden="true"></i>{n.raw}
					</a>
				</Tooltip>
			{:else}{n.raw}{/if}
		{/if}
	{/each}
{/snippet}

<div class="prose">
	{#each blocks as b, i (i)}
		{#if b.t === 'quote'}
			<blockquote>{@render inline(b.v)}</blockquote>
		{:else}
			<p>{@render inline(b.v)}</p>
		{/if}
	{/each}
</div>

<style>
	.prose {
		font-size: var(--t-sm);
		line-height: 1.62;
		overflow-wrap: anywhere;
	}
	.prose :global(p) {
		margin: 0 0 var(--s-4);
	}
	.prose :global(p:last-child),
	.prose :global(blockquote:last-child) {
		margin-bottom: 0;
	}

	blockquote {
		margin: 0 0 var(--s-4);
		padding: var(--s-2) var(--s-5);
		border-inline-start: 2px solid var(--border-strong);
		color: var(--text-secondary);
		font-style: italic;
	}

	code {
		font-family: var(--font-mono);
		font-size: 0.92em;
		padding: 1px var(--s-2);
		border-radius: var(--r-xs);
		background: var(--surface-sunken);
	}

	/*
	 * An outbound link shows its host.
	 *
	 * Link text is written by the poster and the destination is not visible until
	 * the pointer is already over it — and never on a phone. Naming the host in the
	 * text is what stops a friendly label from disguising where it goes, which
	 * matters more here than on an ordinary forum: `postLinks` is trust-gated
	 * precisely because a link is the cheapest thing to abuse.
	 */
	.ext {
		color: var(--accent);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklch, var(--accent) 40%, transparent);
		text-underline-offset: 2px;
	}
	.ext:hover {
		text-decoration-color: var(--accent);
	}
	.host {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-inline-start: var(--s-2);
	}
	.host::before {
		content: '(';
	}
	.host::after {
		content: ')';
	}

	/*
	 * Quieter than the prose it sits in. See the header comment: this may not read
	 * as a citation, because nothing in Agora has been through review.
	 */
	.mention {
		color: inherit;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 2px;
		white-space: nowrap;
	}
	.mention:hover {
		text-decoration-color: var(--text-secondary);
		background: var(--surface-hover);
		border-radius: var(--r-xs);
	}
	.dot {
		display: inline-block;
		width: 5px;
		height: 5px;
		border-radius: 1px;
		margin-inline-end: 3px;
		vertical-align: baseline;
	}
</style>
