<script lang="ts" module>
	export interface FieldBlock {
		id: string;
		name: string;
		md: number;
		locked: boolean;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * The whole 2027 draft as a field of dots, one dot for a fixed number of
	 * MD, one block per budget line, largest first and the two locked lines
	 * (owed before any choice) at the start, drawn hollow. The plate is ink in
	 * both themes. Touching or hovering a block, or focusing its row in the
	 * list, names it with its amount and its share of the draft.
	 *
	 * The same numbers are in the list under the field (DESIGN section 9).
	 */
	let {
		blocks,
		total,
		words,
		active = $bindable<string | null>(null)
	}: {
		blocks: FieldBlock[];
		total: number;
		words: {
			caption: (perDot: string) => string;
			idle: string;
			share: (pct: string) => string;
			lockedNote: string;
			listLabel: string;
			unit: string;
		};
		active?: string | null;
	} = $props();

	let wrap = $state<HTMLElement | undefined>(undefined);
	let canvas = $state<HTMLCanvasElement | undefined>(undefined);
	let width = $state(0);

	const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	/**
	 * Ten MD a dot when the dots stay at least 4.5 px, otherwise 20, 25 or 50,
	 * and as many columns as keep the field about three quarters as tall as it
	 * is wide, so it reads the same on a desk and a phone.
	 */
	const grid = $derived.by(() => {
		const w = Math.max(width, 200);
		const target = Math.min(440, w * 0.75);
		for (const per of [10, 20, 25, 50]) {
			const n = total / per;
			const c = Math.sqrt((w * target) / n);
			if (c >= 4.5 || per === 50) return { perDot: per, cols: Math.max(10, Math.floor(w / c)) };
		}
		return { perDot: 50, cols: 40 };
	});
	const perDot = $derived(grid.perDot);
	const cols = $derived(grid.cols);
	const cell = $derived(width > 0 ? width / cols : 6);

	/** Dots per block and where each block starts. */
	const layout = $derived.by(() => {
		let at = 0;
		return blocks.map((b) => {
			const n = Math.max(1, Math.round(b.md / perDot));
			const start = at;
			at += n;
			return { ...b, n, start, end: at };
		});
	});
	const dots = $derived(layout.length ? layout[layout.length - 1].end : 0);
	const rows = $derived(Math.ceil(dots / cols));
	const height = $derived(Math.ceil(rows * cell));

	const focus = $derived(layout.find((b) => b.id === active) ?? null);
	const readout = $derived(
		focus
			? `${focus.name} · ${fmt(focus.md)} ${words.unit} · ${words.share(((focus.md / total) * 100).toFixed(1))}${focus.locked ? ` · ${words.lockedNote}` : ''}`
			: `${words.idle} · ${fmt(total)} ${words.unit}`
	);

	let shown = $state(Infinity);

	function colors() {
		const s = getComputedStyle(wrap!);
		return { ink: s.getPropertyValue('--plate-ink').trim() || 'white', accent: s.getPropertyValue('--accent').trim() || 'orange' };
	}

	function draw() {
		if (!canvas || !wrap || width === 0) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const { ink, accent } = colors();
		const rtl = getComputedStyle(wrap).direction === 'rtl';
		const size = Math.max(1, cell - Math.max(1, cell * 0.28));
		layout.forEach((b, k) => {
			const on = active === b.id;
			const dim = active !== null && !on;
			ctx.fillStyle = on ? accent : ink;
			ctx.strokeStyle = on ? accent : ink;
			ctx.lineWidth = 1;
			ctx.globalAlpha = dim ? 0.22 : b.locked ? 0.7 : k % 2 ? 0.62 : 1;
			for (let i = b.start; i < Math.min(b.end, shown); i++) {
				const r = Math.floor(i / cols);
				const c = i % cols;
				const x = (rtl ? cols - 1 - c : c) * cell;
				const y = r * cell;
				if (b.locked) ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
				else ctx.fillRect(x, y, size, size);
			}
		});
		ctx.globalAlpha = 1;
	}

	$effect(() => {
		void active;
		void layout;
		void shown;
		void height;
		draw();
	});

	function hit(e: PointerEvent): string | null {
		if (!canvas) return null;
		const r = canvas.getBoundingClientRect();
		const rtl = getComputedStyle(canvas).direction === 'rtl';
		let c = Math.floor((e.clientX - r.left) / cell);
		if (rtl) c = cols - 1 - c;
		const row = Math.floor((e.clientY - r.top) / cell);
		const i = row * cols + c;
		if (c < 0 || c >= cols || i < 0 || i >= dots) return null;
		return layout.find((b) => i >= b.start && i < b.end)?.id ?? null;
	}

	onMount(() => {
		const ro = new ResizeObserver(([entry]) => (width = Math.floor(entry.contentRect.width)));
		if (wrap) ro.observe(wrap);
		const theme = new MutationObserver(() => draw());
		theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
		// One orchestrated moment: the budget fills in, largest blocks first. Reduced motion draws it at once.
		let frame = 0;
		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			const t0 = performance.now();
			shown = 0;
			const step = (now: number) => {
				const p = Math.min(1, (now - t0) / 1100);
				shown = Math.ceil(dots * (1 - Math.pow(1 - p, 3)));
				if (p < 1) frame = requestAnimationFrame(step);
				else shown = Infinity;
			};
			frame = requestAnimationFrame(step);
		}
		return () => {
			ro.disconnect();
			theme.disconnect();
			cancelAnimationFrame(frame);
		};
	});
</script>

<figure class="field" bind:this={wrap}>
	<canvas
		bind:this={canvas}
		style:block-size="{height}px"
		aria-hidden="true"
		onpointermove={(e) => (active = hit(e))}
		onpointerdown={(e) => (active = hit(e))}
		onpointerleave={(e) => {
			if (e.pointerType === 'mouse') active = null;
		}}
	></canvas>
	<p class="readout" aria-live="polite">{readout}</p>
	<details class="list">
		<summary>{words.listLabel}</summary>
		<ol>
			{#each blocks as b (b.id)}
				<li>
					<button
						type="button"
						class:on={active === b.id}
						onmouseenter={() => (active = b.id)}
						onfocus={() => (active = b.id)}
						onclick={() => (active = active === b.id ? null : b.id)}
					>
						<span class="n">{b.name}{#if b.locked}<span class="lock"> · {words.lockedNote}</span>{/if}</span>
						<span class="v">{fmt(b.md)}</span>
						<span class="p">{((b.md / total) * 100).toFixed(1)}%</span>
					</button>
				</li>
			{/each}
		</ol>
	</details>
	<figcaption class="caption">{words.caption(String(perDot))}</figcaption>
</figure>

<style>
	.field {
		margin: 0;
		display: grid;
		gap: var(--s-4);
		color: var(--plate-ink);
	}
	canvas {
		display: block;
		inline-size: 100%;
		cursor: crosshair;
		touch-action: pan-y;
	}
	.readout {
		margin: 0;
		min-block-size: 2.6em;
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		line-height: 1.35;
		font-variant-numeric: tabular-nums;
	}
	.caption {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		opacity: 0.7;
	}
	.list summary {
		display: inline-flex;
		align-items: center;
		min-block-size: var(--touch);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.85;
	}
	.list ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		column-gap: var(--s-8);
	}
	.list button {
		display: grid;
		grid-template-columns: 1fr auto 4.5ch;
		gap: var(--s-4);
		inline-size: 100%;
		padding: var(--s-3) 0;
		border: none;
		border-block-end: 1px solid oklch(100% 0 0 / 0.12);
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--t-sm);
		text-align: start;
		cursor: pointer;
	}
	.list button.on {
		color: var(--accent);
	}
	.list button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.v,
	.p {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: end;
	}
	.p {
		opacity: 0.7;
	}
	.lock {
		opacity: 0.7;
	}
</style>
