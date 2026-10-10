<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { t } from '$lib/t.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { answerKeyFor } from '$lib/views';

	/**
	 * "About this view": the one place a view explains itself.
	 *
	 * Each view used to explain itself three times: a mono caption row above it
	 * (the sentence it answers, from the guide), an intro line in its toolbar, and
	 * paragraphs on the page. The caption row and the intro line are now one
	 * disclosure holding both texts, so a view gives up a row of chrome and loses
	 * no words. It is open on wide screens, where there is room to read it beside
	 * the controls, and closed on a phone, where the canvas needs the height.
	 *
	 * A button and a region rather than `<details>`, because it sits inline in a
	 * view's toolbar, beside the eyebrow and the controls, and has to lay out as
	 * one flex item there in every browser.
	 *
	 * Views with a toolbar place it there and pass their intro as `hint`. For
	 * routes without one, Viewport renders it as a standalone row instead of the
	 * old caption (see ABOUT_IN_TOOLBAR in views.ts).
	 */
	interface Props {
		/** The view's own intro line, already translated. */
		hint?: string;
		/** A row of its own above the view, for routes without a toolbar. */
		standalone?: boolean;
	}

	let { hint, standalone = false }: Props = $props();

	/* The Chronicle lives at /chronicle; the views table names it by the root route. */
	const answerKey = $derived(answerKeyFor(page.url.pathname === '/chronicle' ? '/' : page.url.pathname));
	const answer = $derived(answerKey ? t(answerKey) : '');

	/*
	 * Prerendered markup has no viewport, so it ships open (the wide default).
	 * Until the component mounts, a phone hides the text with CSS, so the closed
	 * state does not arrive as a flash of an open one.
	 */
	let open = $state(!compact.current);
	let mounted = $state(false);
	onMount(() => {
		open = !compact.current;
		mounted = true;
	});

	/* Stable across prerender and hydration. */
	const id = $props.id();
</script>

{#if answer || hint}
	<div class="about" class:standalone class:open class:mounted>
		<button type="button" class="about-toggle" aria-expanded={open} aria-controls={id} onclick={() => (open = !open)}>
			<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
				<path d="M3.5 2 L6.5 5 L3.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
			</svg>
			{t('view.about')}
		</button>
		<p class="about-text" {id} hidden={!open}>
			{#if answer}<span class="answer">{answer}</span>{/if}
			{#if hint}<span class="hint">{hint}</span>{/if}
		</p>
	</div>
{/if}

<style>
	/*
	   A run-in: the toggle opens the paragraph like a lead-in label and the text
	   flows on after it, so being open costs the text's lines and nothing more.
	*/
	.about {
		min-width: 0;
		max-width: 84ch;
		flex: 1 1 44ch;
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
	}
	.standalone {
		flex: 0 0 auto;
		padding: var(--s-2) calc(var(--s-5) + var(--safe-r)) var(--s-2) calc(var(--s-5) + var(--safe-l));
		border-bottom: 1px solid var(--border-subtle);
	}

	.about-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		margin-inline-end: var(--s-3);
		vertical-align: baseline;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--text-faint);
	}
	.about-toggle:hover {
		color: var(--text-primary);
	}
	.about-toggle svg {
		transition: transform var(--dur-fast) var(--ease-out);
	}
	.open .about-toggle svg {
		transform: rotate(90deg);
	}
	:global([dir='rtl']) .about-toggle svg {
		transform: scaleX(-1);
	}
	:global([dir='rtl']) .open .about-toggle svg {
		transform: rotate(90deg);
	}

	.about-text {
		display: inline;
		margin: 0;
		color: var(--text-secondary);
	}
	.about-text[hidden] {
		display: none;
	}
	.answer {
		color: var(--text-primary);
	}
	.answer + .hint::before {
		content: ' ';
	}

	@media (max-width: 900px) {
		.about {
			flex-basis: auto;
		}
		/* On a phone the text takes its own block under the toggle when opened. */
		.about-text {
			display: block;
			padding-block-end: var(--s-3);
		}
		.about:not(.mounted) .about-text {
			display: none;
		}
		.about-toggle {
			min-height: var(--touch);
		}
		/* The toggle's own target is the row; no padding on top of it. */
		.standalone {
			padding-block: 0;
		}
	}
</style>
