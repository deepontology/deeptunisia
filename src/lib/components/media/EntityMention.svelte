<script lang="ts">
	/**
	 * EntityMention — an editorially-chosen entity name in the narrative.
	 *
	 * Register: a mention, not a chip. A dotted underline and an accent dot —
	 * no fill, no weight change — so the name stays prose until the reader
	 * engages with it. Stronger than an Agora mention (editorially curated,
	 * not community-typed) but never a box.
	 */

	import type { Entity } from '$lib/media/types';

	interface Props {
		entity: Entity;
		active: boolean;
		onclick: () => void;
	}

	let { entity, active, onclick }: Props = $props();

	const displayName = $derived(entity.name.en ?? entity.id);
	const role = $derived(entity.role ?? 'entity');
	const roleTint = $derived.by(() => {
		switch (role) {
			case 'primary_subject': return 'var(--layer-economic)';
			case 'political': return 'var(--layer-political)';
			case 'historical': return 'var(--layer-security)';
			case 'scientific': return 'var(--layer-judicial)';
			case 'institutional': return 'var(--layer-civil)';
			case 'industrial': return 'var(--layer-economic)';
			case 'regulatory': return 'var(--layer-media)';
			default: return 'var(--accent)';
		}
	});
</script>

<button
	class="mention"
	class:active
	style:--c={roleTint}
	onclick={(e) => { e.stopPropagation(); onclick(); }}
	aria-label="{displayName} — view in graph"
>
	<span class="dot" aria-hidden="true"></span>
	{displayName}
</button>

<style>
	.mention {
		display: inline;
		font: inherit;
		color: var(--text-primary);
		padding: 0 1px;
		margin: 0 1px;
		border: none;
		border-radius: 2px;
		background: none;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
		text-decoration-color: color-mix(in oklch, var(--c) 60%, transparent);
		transition:
			color var(--dur-fast) var(--ease-out),
			text-decoration-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}

	/* The layer dot: the name's link back to where it lives in the graph. */
	.dot {
		display: inline-block;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--c);
		margin-inline-end: 2px;
		vertical-align: 1.5px;
		opacity: 0.7;
		transition: opacity var(--dur-fast) var(--ease-out);
	}

	.mention:hover {
		color: var(--c);
		text-decoration-style: solid;
		text-decoration-color: var(--c);
		background: color-mix(in oklch, var(--c) 7%, transparent);
	}
	.mention:hover .dot {
		opacity: 1;
	}

	.mention.active {
		color: var(--c);
		text-decoration-style: solid;
		text-decoration-color: var(--c);
		background: color-mix(in oklch, var(--c) 12%, transparent);
	}
	.mention.active .dot {
		opacity: 1;
	}
</style>