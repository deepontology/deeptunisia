<script lang="ts">
	import { onMount } from 'svelte';
	import { Spring } from 'svelte/motion';
	import { theme } from '$lib/design/theme.svelte';

	/**
	 * Custom cursor: a precise dot that tracks the pointer exactly, plus a ring that
	 * trails it on a spring. The lag between the two is the whole effect — the dot
	 * says where you are, the ring says where you came from.
	 *
	 * It adapts to what is underneath rather than being uniform decoration:
	 *   - over a button or link, the ring swells and fills faintly
	 *   - over the timeline track, it becomes a horizontal scrub bracket
	 *   - over text, it collapses to a thin caret so it stops obscuring what you read
	 *   - while pressed, it contracts
	 *
	 * Safety rails, all of which matter more than the effect itself:
	 *   - only on devices with a fine pointer and hover (never touch)
	 *   - never when the reader asks for reduced motion
	 *   - the real system cursor stays visible; this is layered on top, so nobody
	 *     loses their pointer if a style fails to load
	 */

	let enabled = $state(false);
	let visible = $state(false);
	/**
	 * `grab` is the pannable-canvas mode, used by the network map.
	 *
	 * It existed as a `data-cursor="grab"` attribute before it existed here, which did
	 * nothing at all: the attribute is cast straight into this union, so an unlisted
	 * value fell through every branch and the map got the default dot. Anything added
	 * to `data-cursor` has to be added here too.
	 */
	let mode = $state<'default' | 'action' | 'scrub' | 'text' | 'grab'>('default');
	let pressed = $state(false);
	let hint = $state('');

	// Dot is stiff enough to feel exact; ring is loose enough to visibly follow.
	const dot = new Spring({ x: -100, y: -100 }, { stiffness: 0.62, damping: 0.85 });
	const ring = new Spring({ x: -100, y: -100 }, { stiffness: 0.13, damping: 0.72 });

	onMount(() => {
		const fine = window.matchMedia('(pointer: fine) and (hover: hover)');
		if (!fine.matches || theme.reduceMotion) return;

		enabled = true;

		const onMove = (e: PointerEvent) => {
			visible = true;
			dot.target = { x: e.clientX, y: e.clientY };
			ring.target = { x: e.clientX, y: e.clientY };

			const el = e.target as HTMLElement | null;
			if (!el) return;

			// Explicit opt-in wins, so views can label their own affordances.
			const labelled = el.closest<HTMLElement>('[data-cursor]');
			if (labelled) {
				mode = (labelled.dataset.cursor as typeof mode) ?? 'default';
				hint = labelled.dataset.cursorHint ?? '';
				return;
			}
			hint = '';

			if (el.closest('button, a, [role="button"], [role="radio"], [role="menuitem"], summary')) {
				mode = 'action';
			} else if (el.closest('input, textarea, select, [contenteditable]')) {
				mode = 'text';
			} else if (el.closest('p, li, td, .prose, h1, h2, h3')) {
				mode = 'text';
			} else {
				mode = 'default';
			}
		};

		const onLeave = () => (visible = false);
		const onDown = () => (pressed = true);
		const onUp = () => (pressed = false);

		window.addEventListener('pointermove', onMove, { passive: true });
		window.addEventListener('pointerdown', onDown, { passive: true });
		window.addEventListener('pointerup', onUp, { passive: true });
		document.addEventListener('pointerleave', onLeave);

		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointerup', onUp);
			document.removeEventListener('pointerleave', onLeave);
		};
	});
</script>

{#if enabled}
	<div class="layer" class:visible aria-hidden="true">
		<!-- Trailing ring -->
		<div
			class="ring m-{mode}"
			class:pressed
			style:transform="translate3d({ring.current.x}px, {ring.current.y}px, 0) translate(-50%, -50%)"
		>
			{#if mode === 'scrub'}
				<svg viewBox="0 0 44 20" width="44" height="20">
					<path d="M7 4 L3 10 L7 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
					<path d="M37 4 L41 10 L37 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
					<line x1="22" y1="2" x2="22" y2="18" stroke="currentColor" stroke-width="1" stroke-opacity="0.45" />
				</svg>
			{/if}
		</div>

		<!-- Precise dot -->
		<div
			class="dot m-{mode}"
			class:pressed
			style:transform="translate3d({dot.current.x}px, {dot.current.y}px, 0) translate(-50%, -50%)"
		></div>

		{#if hint}
			<div
				class="hint mono"
				style:transform="translate3d({dot.current.x}px, {dot.current.y}px, 0) translate(18px, 12px)"
			>
				{hint}
			</div>
		{/if}
	</div>
{/if}

<style>
	.layer {
		position: fixed;
		inset: 0;
		z-index: 600;
		pointer-events: none;
		opacity: 0;
		transition: opacity var(--dur-normal) var(--ease-out);
	}
	.layer.visible {
		opacity: 1;
	}

	.ring {
		position: absolute;
		top: 0;
		left: 0;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 1px solid var(--accent);
		color: var(--accent);
		opacity: 0.55;
		display: grid;
		place-items: center;
		transition:
			width var(--dur-fast) var(--ease-spring),
			height var(--dur-fast) var(--ease-spring),
			opacity var(--dur-fast) var(--ease-out),
			border-radius var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
		will-change: transform;
	}
	.ring.m-action {
		width: 40px;
		height: 40px;
		opacity: 1;
		background: color-mix(in oklch, var(--accent) 10%, transparent);
	}
	.ring.m-text {
		width: 2px;
		height: 22px;
		border-radius: var(--r-full);
		background: var(--accent);
		border-color: transparent;
		opacity: 0.7;
	}
	.ring.m-scrub {
		width: 46px;
		height: 22px;
		border-radius: var(--r-sm);
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		opacity: 1;
	}
	.ring.pressed {
		width: 20px;
		height: 20px;
		background: color-mix(in oklch, var(--accent) 22%, transparent);
	}
	.ring.m-scrub.pressed {
		width: 42px;
		height: 20px;
	}
	/*
	   A pannable surface. Wider and hollow — it reads as "you may take hold of this"
	   rather than "there is a target here", which is what the action ring says. On
	   press it contracts, the same grammar a physical grab has.
	*/
	.ring.m-grab {
		width: 34px;
		height: 34px;
		opacity: 0.8;
		border-style: dashed;
		border-color: color-mix(in oklch, var(--accent) 70%, transparent);
	}
	.ring.m-grab.pressed {
		width: 22px;
		height: 22px;
		border-style: solid;
		background: color-mix(in oklch, var(--accent) 18%, transparent);
	}

	.dot {
		position: absolute;
		top: 0;
		left: 0;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		transition:
			width var(--dur-fast) var(--ease-out),
			height var(--dur-fast) var(--ease-out),
			opacity var(--dur-fast) var(--ease-out);
		will-change: transform;
	}
	/* Over text the dot would sit on the glyphs, so it gets out of the way. */
	.dot.m-text {
		opacity: 0;
	}
	.dot.pressed {
		width: 8px;
		height: 8px;
	}

	.hint {
		position: absolute;
		top: 0;
		left: 0;
		padding: 3px var(--s-4);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--accent-text);
		background: var(--accent);
		border-radius: var(--r-xs);
		white-space: nowrap;
		will-change: transform;
	}
</style>
