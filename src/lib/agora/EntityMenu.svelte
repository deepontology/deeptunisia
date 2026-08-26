<script lang="ts">
	/**
	 * The list of records you can point at.
	 *
	 * One component behind two affordances: the `@` menu inside the composer, and
	 * the "attach this thread to a record" picker. Both search the same index as
	 * ⌘K — see `$lib/search` for why that had to be extracted — so a name ranks
	 * identically wherever you type it.
	 *
	 * ANCHORED TO THE FIELD, NOT TO THE CARET
	 *
	 * Caret anchoring needs a mirror element that reproduces the textarea's exact
	 * wrapping to find where the cursor is on screen. That measurement is wrong the
	 * moment the text is Arabic — the mirror has to reproduce bidi reordering as
	 * well as wrapping — and this composer is trilingual by requirement. A menu
	 * pinned under the field is always in the same place, always the right way round
	 * in RTL, and on a phone it sits above the keyboard instead of under it.
	 */
	import { LAYER_COLOR } from '$lib/model';
	import { formatDate, t } from '$lib/t.svelte';
	import type { Hit } from '$lib/search';

	interface Props {
		hits: Hit[];
		cursor: number;
		onpick: (hit: Hit) => void;
		onhover: (index: number) => void;
		/** Shown when the query matched nothing. */
		empty?: string;
	}

	let { hits, cursor, onpick, onhover, empty = 'No record matches.' }: Props = $props();
</script>

<ul class="menu" role="listbox" aria-label={t('agora.records')}>
	{#each hits as h, i (h.id)}
		<li>
			<button
				type="button"
				role="option"
				aria-selected={i === cursor}
				class:active={i === cursor}
				onmouseenter={() => onhover(i)}
				onclick={() => onpick(h)}
			>
				<i class="dot" style:background={LAYER_COLOR[h.layer]} aria-hidden="true"></i>
				<span class="name">{h.name}</span>
				<!-- See SearchPalette: the index carries an English date, `date` re-formats. -->
				<span class="detail">{h.date ? formatDate(h.date, 'month') : h.detail}</span>
				<span class="kind">{h.kind}</span>
			</button>
		</li>
	{:else}
		<li class="empty">{empty}</li>
	{/each}
</ul>

<style>
	.menu {
		list-style: none;
		margin: var(--s-2) 0 0;
		padding: var(--s-2);
		max-height: 240px;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
	}
	li button {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		width: 100%;
		text-align: start;
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		font-size: var(--t-sm);
		color: var(--text-primary);
	}
	li button.active {
		background: var(--surface-raised);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.name {
		font-weight: 500;
		white-space: nowrap;
	}
	.detail {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-faint);
		font-size: var(--t-xs);
	}
	.kind {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
	}
	.empty {
		padding: var(--s-5);
		font-size: var(--t-xs);
		color: var(--text-faint);
	}

	@media (pointer: coarse) {
		li button {
			min-height: var(--tap);
			font-size: var(--t-base);
		}
	}
</style>
