<script lang="ts">
	/**
	 * The one renderer for long-form content files (i18n-spec §5).
	 *
	 * Renders the tree from src/lib/content.ts — never HTML, never a per-page
	 * renderer. Prose carries the document typography; a `compact` prop drops it
	 * into list views where a full document reading is not the point.
	 */
	import { app } from '$lib/state.svelte';
	import { content, type ContentBlock, type ContentInline } from '$lib/content';

	interface Props {
		view: string;
		/** Restrict to the section under this heading id (see content.ts). */
		section?: string;
		compact?: boolean;
		/**
		 * `{param}` interpolation for text nodes, same placeholder syntax the
		 * dictionary's format() uses. A missing param stays visible as `{key}` —
		 * a visible hole, not a silent one.
		 */
		params?: Record<string, string | number>;
	}

	let { view, section, compact = false, params = {} }: Props = $props();

	const doc = $derived(content(view, app.locale));
	const blocks = $derived(section ? doc.section(section) : doc.blocks);

	function text(v: string): string {
		return v.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (m, k: string) => {
			const p = params[k];
			return p === undefined || p === null ? m : String(p);
		});
	}
</script>

{#snippet inline(nodes: ContentInline[])}
	{#each nodes as n, i (i)}
		{#if n.t === 'strong'}
			<strong>{@render inline(n.v)}</strong>
		{:else if n.t === 'em'}
			<em>{@render inline(n.v)}</em>
		{:else if n.t === 'code'}
			<code>{n.v}</code>
		{:else if n.t === 'link'}
			<a href={n.href}>{n.label}</a>
		{:else}
			{text(n.v)}
		{/if}
	{/each}
{/snippet}

<div class="content" class:compact>
	{#each blocks as b, i (i)}
		{#if b.t === 'h2' || b.t === 'h3'}
			{#if b.t === 'h2'}
				<h2>{@render inline(b.v)}</h2>
			{:else}
				<h3>{@render inline(b.v)}</h3>
			{/if}
		{:else if b.t === 'p'}
			{#if b.v.length}<p>{@render inline(b.v)}</p>{/if}
		{:else if b.t === 'ul'}
			<ul>
				{#each b.items as item, i (i)}
					<li>{@render inline(item)}</li>
				{/each}
			</ul>
		{:else if b.t === 'ol'}
			<ol>
				{#each b.items as item, i (i)}
					<li>{@render inline(item)}</li>
				{/each}
			</ol>
		{:else if b.t === 'quote'}
			<blockquote>{@render inline(b.v)}</blockquote>
		{:else if b.t === 'hr'}
			<hr />
		{/if}
	{/each}
</div>

<style>
	.content {
		font-size: 15.5px;
		line-height: 1.7;
		color: var(--text-secondary);
		max-width: 76ch;
	}
	.content :global(h2) {
		font-family: var(--font-serif);
		font-size: var(--t-2xl);
		color: var(--text-primary);
		margin: 26px 0 10px;
	}
	.content :global(h3) {
		font-family: var(--font-serif);
		font-size: var(--t-lg);
		color: var(--text-primary);
		margin: 20px 0 8px;
	}
	.content :global(p) {
		margin: 0 0 12px;
	}
	.content :global(ul),
	.content :global(ol) {
		margin: 0 0 14px;
		padding-inline-start: 22px;
	}
	.content :global(li) {
		margin-bottom: 5px;
	}
	.content :global(blockquote) {
		margin: 0 0 14px;
		padding: 2px 14px;
		border-inline-start: 2px solid var(--border-default);
		color: var(--text-muted);
		font-style: italic;
	}
	.content :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		background: var(--surface-sunken);
		border-radius: var(--r-xs);
		padding: 1px 5px;
	}
	.content :global(a) {
		/* --accent, not --accent-text: the latter is text ON an accent fill and
		   is near-black in dark mode — black links on a black page (smoke caught
		   it at 1.02:1 the day it shipped). */
		color: var(--accent);
	}
	.content :global(hr) {
		border: none;
		border-top: 1px solid var(--border-subtle);
		margin: 18px 0;
	}
	.content.compact {
		font-size: var(--t-sm);
		line-height: 1.6;
	}
	.content.compact :global(h2),
	.content.compact :global(h3) {
		margin: 16px 0 6px;
	}
</style>
