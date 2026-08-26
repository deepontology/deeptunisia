<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * What a section says when it holds nothing.
	 *
	 * This is the highest-traffic screen the forum has, and will be for its first
	 * months: a civic project opens with nobody in it. Rendering `no threads` in
	 * grey 10px reports a null where the reader needed an invitation — and it reads
	 * as breakage rather than as newness, which is a costly first impression for a
	 * project whose whole asset is looking like it knows what it is doing.
	 */
	interface Props {
		title: string;
		body: string;
		action?: Snippet;
	}

	let { title, body, action }: Props = $props();
</script>

<div class="empty">
	<span class="mark" aria-hidden="true"></span>
	<h3>{title}</h3>
	<p>{body}</p>
	{#if action}
		<div class="act">{@render action()}</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--s-11) var(--s-6);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-sunken);
	}
	.mark {
		width: 26px;
		height: 26px;
		border-radius: var(--r-full);
		border: 1px dashed var(--border-strong);
		margin-bottom: var(--s-5);
	}
	h3 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-md);
		font-weight: 500;
		color: var(--text-primary);
	}
	p {
		margin: 0;
		max-width: 46ch;
		font-size: var(--t-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}
	.act {
		margin-top: var(--s-6);
	}
</style>
