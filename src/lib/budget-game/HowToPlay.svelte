<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { BoardCopy } from './board-copy';
	import type { MoveRule } from './board';

	/**
	 * How to play: the board's mechanics in one sheet, opened from the board and
	 * from the Frame step. It says nothing about whether an answer is collected;
	 * that sentence belongs to the About step, which reads the study state.
	 */
	let {
		t,
		rule,
		onclose
	}: {
		t: BoardCopy;
		rule: MoveRule;
		onclose: () => void;
	} = $props();

	const g = $derived(t.guide);
	let closeEl = $state<HTMLButtonElement | null>(null);
	let returnTo: HTMLElement | null = null;

	onMount(() => {
		returnTo = document.activeElement as HTMLElement | null;
		void tick().then(() => closeEl?.focus());
		return () => returnTo?.focus?.();
	});

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onkey} />

<div class="howto-overlay" role="dialog" aria-modal="true" aria-labelledby="howto-heading">
	<div class="howto-sheet">
		<button type="button" class="howto-close" bind:this={closeEl} onclick={onclose}>{t.detailsClose}</button>
		<h2 id="howto-heading">{g.heading}</h2>
		<p class="lead">{g.lead}</p>

		<h3>{g.purseTitle}</h3>
		<p>{g.purseBody}</p>

		<h3>{g.moveTitle}</h3>
		<p>{t.howTo[rule]} {t.coinNote[rule]}</p>
		<p><strong>{g.phoneLabel}</strong> {t.howToPhone}</p>
		<p class="keys"><strong>{g.keysLabel}</strong> {t.keys}</p>

		<h3>{g.limitsTitle}</h3>
		<p>{g.limitsBody}</p>

		<h3>{g.rowsTitle}</h3>
		<p>{g.rowsBody}</p>

		<h3>{g.undoTitle}</h3>
		<p>{g.undoBody}</p>

		<h3>{g.finishTitle}</h3>
		<p>{g.finishBody(t.keepTick)}</p>

		<h3>{g.afterTitle}</h3>
		<p>{g.afterBody}</p>

		<h3>{g.figuresTitle}</h3>
		<p>{g.figuresBody}</p>

		<h3>{g.answerTitle}</h3>
		<p>{g.answerBody}</p>

		{#if t.interim}<p class="interim">{t.interim}</p>{/if}
	</div>
</div>

<style>
	.howto-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		display: flex;
		justify-content: center;
		align-items: center;
		padding: var(--s-6);
		background: color-mix(in srgb, var(--surface-base) 70%, transparent);
	}
	.howto-sheet {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		inline-size: 100%;
		max-inline-size: 40rem;
		max-block-size: 100%;
		overflow-y: auto;
		padding: var(--s-4) var(--s-6) var(--s-6);
		background: var(--surface-base);
		border: var(--rule);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-2);
	}
	.howto-close {
		align-self: flex-end;
		min-block-size: var(--touch);
		padding-inline: var(--s-4);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		background: transparent;
		color: var(--text-primary);
		font: 500 var(--t-xs) var(--font-sans);
		cursor: pointer;
	}
	h2 {
		margin: 0;
		font: 600 var(--t-xl) var(--font-sans);
	}
	h3 {
		margin: var(--s-3) 0 0;
		font: 600 var(--t-md) var(--font-sans);
	}
	p {
		margin: 0;
		font-size: var(--t-base);
		line-height: 1.55;
		color: var(--text-primary);
	}
	.lead {
		font-size: var(--t-md);
	}
	.keys,
	.interim {
		color: var(--text-muted);
		font-size: var(--t-xs);
	}
	/* The keyboard line is no use on a touch screen. */
	@media (pointer: coarse) {
		.keys {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.howto-overlay {
			padding: 0;
		}
		.howto-sheet {
			max-inline-size: none;
			block-size: 100%;
			border: 0;
			border-radius: 0;
			padding: var(--s-3) var(--s-5) var(--s-6);
		}
	}
</style>
