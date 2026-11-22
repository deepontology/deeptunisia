<script lang="ts" module>
	import { browser } from '$app/environment';

	/**
	 * Seen once per browser, like the site tour. Bump the version when a step is
	 * added, removed or rewritten, so a returning reader is shown what changed.
	 */
	const KEY = 'deeptunisia:budget-tour';
	const VERSION = '1';

	export function boardTourSeen(): boolean {
		if (!browser) return true;
		try {
			return localStorage.getItem(KEY) === VERSION;
		} catch {
			// Storage blocked: treat as seen rather than replaying it on every visit.
			return true;
		}
	}

	function markSeen() {
		try {
			localStorage.setItem(KEY, VERSION);
		} catch {
			/* it runs again next time, which is the lesser failure */
		}
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import type { BoardCopy, TourStepId } from './board-copy';
	import type { MoveRule } from './board';

	/**
	 * The board tour: a spotlight over the board's own controls, one sentence
	 * group per control, built the way the site tour is (one spotlight whose
	 * spread shadow is the dim, a card beside it, a catcher that keeps the board
	 * still while it runs, Skip on every step).
	 *
	 * Targets are data-tour attributes on the board. A step may name a desk
	 * control and its phone stand-in; the first one laid out wins, and a step
	 * with nothing laid out is left out of this run.
	 *
	 * It says nothing about whether an answer is collected. The last step points
	 * to the About step, which reads the study state.
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

	interface Step {
		id: TourStepId;
		target?: string;
		place?: 'top' | 'bottom';
	}

	const ALL: Step[] = [
		{ id: 'welcome' },
		{ id: 'purse', target: '[data-tour="purse"]' },
		{ id: 'locked', target: '[data-tour="locked"]' },
		{ id: 'row', target: '[data-tour="row"]' },
		{ id: 'move', target: '[data-tour="systems"]' },
		{ id: 'dock', target: '[data-tour="dock"]', place: 'top' },
		{ id: 'years', target: '[data-tour="years"]' },
		{ id: 'undo', target: '[data-tour="undo"]', place: 'top' },
		{ id: 'keep', target: '[data-tour="keep"]', place: 'top' },
		{ id: 'finish', target: '[data-tour="finish"]', place: 'top' },
		{ id: 'done' }
	];

	const PAD = 8;
	const CARD_W = 380;
	const GAP = 14;

	function laidOut(selector: string): Element | undefined {
		return [...document.querySelectorAll(selector)].find((e) => {
			const b = e.getBoundingClientRect();
			return b.width > 0 && b.height > 0;
		});
	}

	// Filtered once, when the tour opens: a step whose control is hidden at this
	// width (the locked lines on a phone) is left out rather than pointing at nothing.
	const steps = ALL.filter((s) => !s.target || laidOut(s.target));

	let i = $state(0);
	let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let card = $state<{ x: number; y: number } | null>(null);
	let cardEl = $state<HTMLElement | null>(null);
	let compact = $state(false);
	let dockTop = $state(false);
	let fine = $state(true);

	const step = $derived(steps[i]);
	const last = $derived(i === steps.length - 1);

	const body = $derived.by(() => {
		if (!step) return '';
		if (step.id === 'move') {
			return `${compact ? t.howToPhone : t.howTo[rule]} ${t.coinNote[rule]}`;
		}
		if (step.id === 'dock' && fine) return `${t.tour.steps.dock.b} ${t.keys}`;
		return t.tour.steps[step.id].b;
	});

	function measure() {
		compact = window.innerWidth < 760;
		fine = window.matchMedia('(pointer: fine)').matches;
		const el = step?.target ? laidOut(step.target) : undefined;
		if (!el) {
			rect = null;
			card = null;
			dockTop = false;
			return;
		}
		const r = el.getBoundingClientRect();
		// Clip to the viewport: the systems area is taller than the screen.
		const top = Math.max(r.top, 4);
		const bottom = Math.min(r.bottom, window.innerHeight - 4);
		rect = { x: r.left - PAD, y: top - PAD, w: r.width + PAD * 2, h: Math.max(bottom - top, 0) + PAD * 2 };

		if (compact) {
			card = null;
			dockTop = rect.y + rect.h / 2 > window.innerHeight / 2;
			return;
		}

		const h = cardEl?.offsetHeight ?? 220;
		const roomBelow = rect.y + rect.h + GAP + h < window.innerHeight - 12;
		const roomAbove = rect.y - GAP - h > 12;
		let x: number;
		let y: number;
		if ((step.place !== 'top' && roomBelow) || (step.place === 'top' && !roomAbove && roomBelow)) {
			x = rect.x + rect.w / 2 - CARD_W / 2;
			y = rect.y + rect.h + GAP;
		} else if (roomAbove) {
			x = rect.x + rect.w / 2 - CARD_W / 2;
			y = rect.y - GAP - h;
		} else {
			// No room above or below (a tall target): sit beside it, on the side
			// with more room. Physical pixels, so RTL needs no second path.
			const right = window.innerWidth - (rect.x + rect.w);
			x = right >= rect.x ? rect.x + rect.w + GAP : rect.x - GAP - CARD_W;
			y = rect.y + Math.min(rect.h, window.innerHeight) / 2 - h / 2;
		}
		card = {
			x: Math.max(12, Math.min(x, window.innerWidth - CARD_W - 12)),
			y: Math.max(12, Math.min(y, window.innerHeight - h - 12))
		};
	}

	$effect(() => {
		void i;
		void t;
		const el = step?.target ? laidOut(step.target) : undefined;
		el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		tick().then(() => {
			measure();
			tick().then(measure);
		});
	});

	$effect(() => {
		void i;
		cardEl?.focus();
	});

	function next() {
		if (last) end();
		else i += 1;
	}
	function prev() {
		if (i > 0) i -= 1;
	}
	/** Skip and finish are the same act: both mean "do not show me this again". */
	function end() {
		markSeen();
		onclose();
	}

	function onKey(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			end();
		} else if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prev();
		}
	}
</script>

<svelte:window onresize={measure} onkeydowncapture={onKey} />
<svelte:document onscrollcapture={measure} />

{#if step}
	<div class="catch" aria-hidden="true"></div>

	{#if rect}
		<div class="spot" aria-hidden="true" style:left="{rect.x}px" style:top="{rect.y}px" style:width="{rect.w}px" style:height="{rect.h}px"></div>
	{:else}
		<div class="spot flat" aria-hidden="true"></div>
	{/if}

	<div
		class="card"
		class:compact
		class:top={compact && dockTop}
		class:centred={!rect && !compact}
		bind:this={cardEl}
		style:left={card ? `${card.x}px` : null}
		style:top={card ? `${card.y}px` : null}
		role="dialog"
		aria-modal="true"
		aria-label={t.tour.open}
		aria-describedby="board-tour-body"
		tabindex="-1"
	>
		<p class="progress">{t.tour.progress(i + 1, steps.length)}</p>
		<h2>{t.tour.steps[step.id].t}</h2>
		<p class="body" id="board-tour-body">{body}</p>
		{#if last && t.interim}<p class="interim">{t.interim}</p>{/if}

		<div class="dots" aria-hidden="true">
			{#each steps as s, k (s.id)}
				<i class:on={k === i} class:past={k < i}></i>
			{/each}
		</div>

		<div class="actions">
			{#if !last}<button type="button" class="skip" onclick={end}>{t.tour.skip}</button>{/if}
			<span class="spacer"></span>
			{#if i > 0}<button type="button" class="ghost" onclick={prev}>{t.tour.back}</button>{/if}
			<button type="button" class="go" onclick={next}>{last ? t.tour.start : t.tour.next}</button>
		</div>
	</div>
{/if}

<style>
	.catch {
		position: fixed;
		inset: 0;
		z-index: 900;
	}
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
	.card.compact {
		inset-inline: 12px;
		inset-block-end: calc(12px + var(--safe-b, 0px));
		inset-block-start: auto;
		width: auto;
		max-height: calc(100dvh - 24px - var(--safe-t, 0px) - var(--safe-b, 0px));
		overflow-y: auto;
		overscroll-behavior: contain;
		transform: none;
		transition: none;
	}
	.card.compact.top {
		inset-block-start: calc(12px + var(--safe-t, 0px));
		inset-block-end: auto;
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
	.interim {
		margin: var(--s-4) 0 0;
		font-size: var(--t-xs);
		color: var(--text-muted);
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
		min-height: var(--tap, 44px);
	}
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
