<script lang="ts">
	import { tick } from 'svelte';
	import { LAYER_COLOR, type Layer } from '$lib/model';
	import { tf, t } from '$lib/t.svelte';

	/**
	 * Layer tabs — the standing head of the vertical Chronicle.
	 *
	 * The vertical Chronicle reads one layer at a time, so this is a choice of one
	 * layer, not the multi-select the horizontal chart uses. The tabs sit above the
	 * scroller and never scroll away, because they are the reader's only way
	 * through the layer they are in.
	 *
	 * Each tab carries the layer's colour beside the word — the same vocabulary the
	 * rest of the atlas uses for a layer, so a reader who has learned that
	 * political is blue in one view recognises it here — the count of posts in the
	 * layer, and a dot when an event the reader has focused reaches a post in that
	 * layer while they are looking at another. The dot is decoration for the eye;
	 * the description beside it is what a screen reader gets.
	 */

	interface Props {
		layers: { id: Layer; label: string; count: number; marked: boolean }[];
		active: Layer;
		onchange(l: Layer): void;
	}

	let { layers, active, onchange }: Props = $props();

	let root = $state<HTMLDivElement | null>(null);

	/**
	 * Keep the open layer's tab in view as the reader moves between layers, and on
	 * first paint, when the tab with the long label — foreign and international —
	 * starts life past the edge of a 390px screen.
	 *
	 * Deliberately not `scrollIntoView`: that method scrolls every scrollable
	 * ancestor, and `overflow: hidden` only stops a reader from scrolling an
	 * element, not a script. The shells above this strip would pan sideways with
	 * it. The distance is measured from element rects, which is the same on both
	 * sides of the inline axis, and it is applied by moving the strip's own
	 * scroll position — which in RTL runs negative toward the inline-end, and a
	 * distance measured from rects is physical in either direction.
	 */
	$effect(() => {
		const el = root?.querySelector<HTMLElement>('.cv-tab[aria-selected="true"]');
		if (!el || !root) return;
		// Read `active` so the effect re-runs on every change of layer.
		void active;

		const pad = 12;
		const box = root.getBoundingClientRect();
		const tab = el.getBoundingClientRect();
		if (tab.left - pad >= box.left && tab.right + pad <= box.right) return;

		const delta =
			tab.left - pad < box.left ? tab.left - box.left - pad : tab.right - box.right + pad;
		root.scrollLeft += delta;
	});

	/**
	 * Put focus back on the tab the reader is now on, after the DOM has caught up.
	 * `preventScroll`, because the strip's own scroll position is the effect's
	 * job: focusing an element scrolls its scroll container, and the two writing
	 * to the same position is how a strip ends up showing the tab beside the one
	 * the reader asked for.
	 */
	function focusOpen() {
		const el = root?.querySelector<HTMLElement>('.cv-tab[aria-selected="true"]');
		el?.focus({ preventScroll: true });
	}

	async function choose(id: Layer) {
		if (id !== active) onchange(id);
		await tick();
		focusOpen();
	}

	/**
	 * One tab in the tab order at a time, arrows move between them, and the tab
	 * they land on becomes the open one — the choice is a switch between layers,
	 * not a second step after it. RTL mirrors the arrows, because in Arabic the
	 * next layer sits to the left.
	 */
	function onKeydown(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		const i = layers.findIndex((l) => l.id === active);
		if (i < 0) return;
		e.preventDefault();

		let next = i;
		if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = layers.length - 1;
		else {
			const rtl = getComputedStyle(root!).direction === 'rtl';
			const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : rtl ? 1 : -1;
			next = i + step;
		}
		if (next < 0) next = layers.length - 1;
		if (next >= layers.length) next = 0;
		choose(layers[next].id);
	}
</script>

<div
	class="cv-tabs"
	role="tablist"
	aria-label={t('ctl.layers')}
	tabindex="0"
	bind:this={root}
	onkeydown={onKeydown}
>
	{#each layers as l (l.id)}
		<button
			type="button"
			class="cv-tab"
			role="tab"
			aria-selected={l.id === active}
			aria-describedby={l.marked ? `cv-mark-${l.id}` : undefined}
			tabindex={l.id === active ? 0 : -1}
			style:--tab-tint={LAYER_COLOR[l.id]}
			onclick={() => choose(l.id)}
		>
			<i class="swatch" aria-hidden="true"></i>
			<span class="lab">{l.label}</span>
			<span class="count mono">{tf('chronicle.vertical.posts', { n: l.count })}</span>
			{#if l.marked}
				<i class="mark" aria-hidden="true"></i>
				<span id={`cv-mark-${l.id}`} class="vh">{t('chronicle.vertical.marked')}</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.cv-tabs {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
		/*
		   A strip that scrolls sideways rather than wrapping: wrapping changes the
		   height of the standing head, which moves the canvas under the reader
		   every time the layers change.
		*/
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}

	.cv-tab {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		min-width: var(--tap);
		min-height: var(--tap);
		padding-inline: var(--s-4);
		border: var(--rule);
		border-radius: var(--r-full);
		background: var(--surface-sunken);
		color: var(--text-muted);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.cv-tab:hover {
		background: var(--surface-hover);
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	.cv-tab[aria-selected='true'] {
		background: var(--surface-active);
		border-color: var(--border-strong);
		color: var(--text-primary);
	}

	.swatch {
		flex: 0 0 auto;
		width: var(--s-2);
		height: var(--s-2);
		border-radius: var(--r-full);
		background: var(--tab-tint, var(--text-faint));
	}

	.lab {
		font-size: var(--t-sm);
		white-space: nowrap;
	}

	.count {
		font-size: var(--t-xs);
		color: var(--text-faint);
		white-space: nowrap;
	}

	/*
	   The reach of the focused event into a layer the reader is not looking at.
	   The accent colour is the one the reader already associates with what they
	   picked, so the dot is a continuation of that choice rather than a new
	   warning.
	*/
	.mark {
		flex: 0 0 auto;
		width: var(--s-2);
		height: var(--s-2);
		border-radius: var(--r-full);
		background: var(--accent);
	}

	/* Out of sight, still read aloud — the standard clip recipe. */
	.vh {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.cv-tab {
			transition: none;
		}
	}
</style>
