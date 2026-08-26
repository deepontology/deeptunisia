<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { app } from '$lib/state.svelte';
	import { tour, nextStep, prevStep, endTour, STEPS } from './tour.svelte';

	/**
	 * The tour's chrome: one spotlight and one card.
	 *
	 * The dim is a single enormous spread shadow on the spotlight rather than four
	 * masking rectangles. It is one element, it animates as one element, and there
	 * is no seam between panels to show up on a fractional device pixel ratio.
	 *
	 * The spotlight itself never takes pointer events. A separate transparent
	 * catcher sits under it and swallows clicks, so the app underneath cannot be
	 * driven while the tour is running — a reader who scrubs the timeline mid-step
	 * ends up reading a caption about a control that has already moved.
	 */

	const PAD = 8;
	const CARD_W = 380;
	const GAP = 14;

	let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let card = $state<{ x: number; y: number } | null>(null);
	let cardEl = $state<HTMLElement | null>(null);
	let compact = $state(false);

	const step = $derived(tour.steps[tour.i]);
	const last = $derived(tour.i === tour.steps.length - 1);

	function measure() {
		compact = window.innerWidth < 760;
		if (!step?.target) {
			rect = null;
			card = null;
			return;
		}
		const el = document.querySelector(step.target);
		if (!el) {
			rect = null;
			card = null;
			return;
		}
		const r = el.getBoundingClientRect();
		rect = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };

		if (compact) {
			card = null; // docked to the bottom by CSS instead
			return;
		}

		const h = cardEl?.offsetHeight ?? 210;
		const below = step.place !== 'top' && rect.y + rect.h + GAP + h < window.innerHeight - 12;
		const y = below ? rect.y + rect.h + GAP : rect.y - GAP - h;

		// Centre on the spotlight, then clamp inside the viewport. Computed in
		// physical pixels, which is what makes this correct in RTL without a
		// second code path.
		const x = rect.x + rect.w / 2 - CARD_W / 2;
		card = {
			x: Math.max(12, Math.min(x, window.innerWidth - CARD_W - 12)),
			y: Math.max(12, Math.min(y, window.innerHeight - h - 12))
		};
	}

	$effect(() => {
		if (!tour.open) return;
		// read so the effect re-runs when the step or the language changes
		void tour.i;
		void app.locale;
		tick().then(() => {
			measure();
			// A second pass once the card has its real height: the first measure
			// guesses, and a three-line body and a six-line body sit differently.
			tick().then(measure);
		});
	});

	$effect(() => {
		if (tour.open) cardEl?.focus();
	});

	function onKey(e: KeyboardEvent) {
		if (!tour.open) return;
		/* The tour is modal: its keys must stop here. Without this, Escape
		   also reaches the app handler and clears a deep-linked selection
		   (the card the reader followed a link to vanishes), and the arrows,
		   space and `d` scrub time and cycle the theme behind the overlay. */
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			endTour();
		} else if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault();
			nextStep();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prevStep();
		}
	}
</script>

<svelte:window onresize={measure} onscroll={measure} onkeydown={onKey} />

{#if tour.open && step}
	<!-- Swallows every click aimed at the app underneath. Not a dismiss target:
	     a stray click should not end a tour a reader is still reading. -->
	<div class="catch" aria-hidden="true"></div>

	{#if rect}
		<div
			class="spot"
			aria-hidden="true"
			style:left="{rect.x}px"
			style:top="{rect.y}px"
			style:width="{rect.w}px"
			style:height="{rect.h}px"
		></div>
	{:else}
		<div class="spot flat" aria-hidden="true"></div>
	{/if}

	<div
		class="card"
		class:compact
		class:centred={!rect && !compact}
		bind:this={cardEl}
		style:left={card ? `${card.x}px` : null}
		style:top={card ? `${card.y}px` : null}
		role="dialog"
		aria-modal="true"
		aria-label={t('tour.label')}
		tabindex="-1"
	>
		<p class="progress">
			{format(app.locale, 'tour.progress', { n: step.n, total: STEPS.length })}
		</p>
		<h2>{t(`tour.${step.id}.t`)}</h2>
		<p class="body">{t(`tour.${step.id}.b`)}</p>

		<div class="dots" aria-hidden="true">
			{#each STEPS as s, k (s.id)}
				<i
					class:on={s.n === step.n}
					class:past={s.n < step.n}
					class:skip={!tour.steps.some((live) => live.n === s.n)}
				></i>
			{/each}
		</div>

		<div class="actions">
			<button class="skip" onclick={endTour}>{t('tour.skip')}</button>
			<span class="spacer"></span>
			{#if tour.i > 0}
				<button class="ghost" onclick={prevStep}>{t('tour.back')}</button>
			{/if}
			{#if last}
				<a class="ghost guide" href="/guide" onclick={endTour}>{t('nav.guide')}</a>
			{/if}
			<button class="go" onclick={nextStep}>{last ? t('tour.done') : t('tour.next')}</button>
		</div>
	</div>
{/if}

<style>
	.catch {
		position: fixed;
		inset: 0;
		z-index: 900;
	}

	/* One element carries the entire dim. The spread is larger than any viewport
	   this will ever run in, so no corner is ever left undimmed. */
	.spot {
		position: fixed;
		z-index: 901;
		pointer-events: none;
		border-radius: var(--r-lg);
		box-shadow:
			0 0 0 9999px oklch(0% 0 0 / 0.62),
			0 0 0 1px var(--accent-border) inset;
		outline: 1px solid var(--accent-border);
		transition:
			left var(--dur-slow) var(--ease-out),
			top var(--dur-slow) var(--ease-out),
			width var(--dur-slow) var(--ease-out),
			height var(--dur-slow) var(--ease-out);
	}
	/* The opening and closing steps point at nothing, so the whole screen dims. */
	.spot.flat {
		inset: 0;
		border-radius: 0;
		box-shadow: none;
		outline: none;
		background: oklch(0% 0 0 / 0.62);
	}

	.card {
		position: fixed;
		z-index: 902;
		width: 380px;
		max-width: calc(100vw - 24px);
		padding: var(--s-7);
		background: var(--surface-overlay);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-xl);
		box-shadow: var(--elev-4);
		transition:
			left var(--dur-slow) var(--ease-out),
			top var(--dur-slow) var(--ease-out);
	}
	.card:focus {
		outline: none;
	}
	.card.centred {
		inset-inline-start: 50%;
		inset-block-start: 50%;
		transform: translate(-50%, -50%);
		width: 460px;
		transition: none;
	}
	/* On a phone the card docks to the bottom and stops chasing the spotlight,
	   which on a 390px viewport would cover the thing it is describing. */
	.card.compact {
		inset-inline: 12px;
		inset-block-end: calc(12px + var(--safe-b));
		inset-block-start: auto;
		width: auto;
		transform: none;
		transition: none;
	}

	.progress {
		margin: 0 0 var(--s-4);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--accent);
	}

	h2 {
		margin: 0 0 var(--s-4);
		font-family: var(--font-serif);
		font-size: var(--t-2xl);
		font-weight: 400;
		line-height: var(--lh-tight);
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}

	.body {
		margin: 0;
		font-size: var(--t-md);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	.dots {
		display: flex;
		gap: var(--s-2);
		margin-block: var(--s-7) var(--s-6);
	}
	.dots i {
		width: 100%;
		height: 2px;
		border-radius: var(--r-full);
		background: var(--border-default);
		transition: background var(--dur-normal) var(--ease-io);
	}
	.dots i.past {
		background: var(--accent-border);
	}
	.dots i.on {
		background: var(--accent);
	}
	/* A step whose target is not on this route: it exists in the tour but is
	   skipped here, and the dot row says so rather than pretending the tour has
	   fewer parts. Kept quieter than both states — a skip is not progress. */
	.dots i.skip {
		background: color-mix(in oklch, var(--text-faint) 30%, transparent);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	.spacer {
		flex: 1;
	}

	.actions button {
		font-family: var(--font-sans);
		font-size: var(--t-base);
		border-radius: var(--r-md);
		padding: var(--s-4) var(--s-6);
		border: 1px solid transparent;
		background: none;
		cursor: pointer;
		min-height: var(--tap);
		transition:
			background var(--dur-fast) var(--ease-io),
			color var(--dur-fast) var(--ease-io),
			border-color var(--dur-fast) var(--ease-io);
	}
	/* Skip is always present and always legible. A tour a reader cannot see how
	   to leave is a modal, and this is not one. */
	.actions .skip {
		padding-inline: 0;
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.actions .skip:hover {
		color: var(--text-primary);
	}
	.actions .ghost {
		color: var(--text-secondary);
		border-color: var(--border-default);
	}
	.actions .ghost:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	/* The guide link on the final step is an anchor, not a button — it navigates
	   and must survive middle-click and open-in-new-tab like any other link. */
	.actions .guide {
		text-decoration: none;
	}
	.actions .go {
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 520;
	}
	.actions .go:hover {
		background: var(--accent-hover);
	}

	@media (prefers-reduced-motion: reduce) {
		.spot,
		.card {
			transition: none;
		}
	}
</style>
