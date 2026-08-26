<script lang="ts">
	/**
	 * Who wrote this.
	 *
	 * Three things, and they are three different kinds of fact, so they must not
	 * render alike:
	 *
	 *   name    what they call themselves        — chosen, may be anything
	 *   handle  anon-xxxx, derived from a key    — cannot be claimed or collided with
	 *   note    what they say they are          — asserted, never checked
	 *
	 * THE HANDLE IS NEVER OMITTED. It is the only one of the three that is true
	 * rather than said, and it is the reason two people who pick the same name are
	 * still visibly two people. The server used to return the chosen name INSTEAD of
	 * the handle, which made impersonating `anon-dp5d` — or the project itself — a
	 * single field update from any identity at trust zero.
	 *
	 * The note is the interesting one. A source's standing genuinely changes how
	 * their account should be weighed, and without somewhere to put it people assert
	 * it in prose, where it carries no marking at all. So it gets a place — and that
	 * place is visibly a claim: hollow, dotted, prefixed by "says they are", never
	 * the filled chip the graph uses for things that survived review. This is the
	 * four-basis rule applied to identity, and `unsubstantiated` is the tier it
	 * belongs to.
	 */
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { t } from '$lib/t.svelte';

	interface Props {
		author: { handle: string; name: string | null; note: string | null };
		/** Compact form for dense list rows: name and handle, no note. */
		compact?: boolean;
	}

	let { author, compact = false }: Props = $props();
</script>

<span class="author">
	{#if author.name}
		<span class="name">{author.name}</span>
	{/if}
	<!--
		Always rendered. When there is no chosen name it is the only identifier and
		reads as the primary thing; when there is one it sits beside it, quieter but
		never hidden.
	-->
	<span class="handle" class:solo={!author.name}>{author.handle}</span>

	{#if author.note && !compact}
		<Tooltip content={t('agora.selfdeclared.hint')}>
			<span class="note">
				<span class="says">{t('agora.selfdeclared')}</span>{author.note}
			</span>
		</Tooltip>
	{/if}
</span>

<style>
	.author {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.name {
		font-weight: 520;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 22ch;
	}
	/* An identifier, so mono — and faint, because it is chrome next to a name. On its
	   own it is all the reader has, so it takes the name's colour instead. */
	.handle {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.handle.solo {
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}

	/*
	 * Deliberately not a Chip.
	 *
	 * Chip is what the graph uses for basis, layer and tier — things the project
	 * asserts. A dotted hollow outline is the visual opposite: it reads as
	 * provisional at a glance, which is exactly what it is.
	 */
	.note {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-2);
		padding: 0 var(--s-3);
		border: 1px dotted var(--basis-unsubstantiated);
		border-radius: var(--r-full);
		color: var(--text-secondary);
		font-size: var(--t-2xs);
		max-width: 30ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.says {
		color: var(--text-faint);
		font-style: italic;
	}
</style>
