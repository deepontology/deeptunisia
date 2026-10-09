<script lang="ts">
	/**
	 * A measuring rule down the page's edge: how far through the record the
	 * reader is, with each numbered section notched where it begins.
	 *
	 * The scale is fixed and the marker moves, so the rule reads like an
	 * instrument rather than a scrollbar. Ticks at every 2.5%, labels at every
	 * tenth, the reading in three digits. A notch is a link to its section, and
	 * pressing anywhere on the rule moves the page to that point, so it is also
	 * the fastest way through a long page on a phone. The rule names nothing as
	 * the reader moves: the section bar does that, once and quietly.
	 */
	let {
		scroller,
		sections,
		label
	}: {
		scroller: HTMLElement | null;
		sections: { id: string; num: string; label: string }[];
		/** Accessible name of the section links. */
		label: string;
	} = $props();

	let progress = $state(0);
	let marks = $state<{ id: string; num: string; label: string; at: number }[]>([]);
	let rail: HTMLDivElement;
	let track: HTMLDivElement;
	let dragging = $state(false);

	const ticks = Array.from({ length: 41 }, (_, i) => i * 2.5);

	function measure() {
		if (!scroller) return;
		const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
		progress = Math.min(1, Math.max(0, scroller.scrollTop / max));
		const top = scroller.getBoundingClientRect().top - scroller.scrollTop;
		marks = sections
			.map((s) => {
				const el = scroller!.querySelector<HTMLElement>(`#${CSS.escape(s.id)}`);
				if (!el) return null;
				const y = el.getBoundingClientRect().top - top;
				return { ...s, at: Math.min(1, Math.max(0, y / max)) };
			})
			.filter((m): m is NonNullable<typeof m> => m !== null);
	}

	function seek(clientY: number) {
		if (!scroller) return;
		const box = track.getBoundingClientRect();
		const p = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
		scroller.scrollTo({ top: p * (scroller.scrollHeight - scroller.clientHeight) });
	}

	function down(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('a')) return;
		dragging = true;
		rail.setPointerCapture(e.pointerId);
		seek(e.clientY);
	}
	function move(e: PointerEvent) {
		if (dragging) seek(e.clientY);
	}
	function up() {
		dragging = false;
	}

	$effect(() => {
		const el = scroller;
		if (!el) return;
		let frame = 0;
		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				measure();
			});
		};
		const ro = new ResizeObserver(onScroll);
		el.addEventListener('scroll', onScroll, { passive: true });
		ro.observe(el);
		if (el.firstElementChild) ro.observe(el.firstElementChild);
		measure();
		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
			el.removeEventListener('scroll', onScroll);
		};
	});

	const reading = $derived(String(Math.round(progress * 100)).padStart(3, '0'));
</script>

<div
	class="ruler"
	class:dragging
	bind:this={rail}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	role="presentation"
>
	<div class="track" bind:this={track}>
	{#each ticks as v (v)}
		<span class="tick" class:major={v % 10 === 0} class:mid={v % 10 === 5} style:top="{v}%">
			{#if v % 10 === 0 && v > 0 && v < 100 && !marks.some((m) => Math.abs(m.at * 100 - v) < 3.5)}<span class="tick-n">{v}</span>{/if}
		</span>
	{/each}

	<nav class="marks" aria-label={label}>
		{#each marks as m (m.id)}
			<a class="mark" class:passed={progress >= m.at - 0.001} href="#{m.id}" style:top="{m.at * 100}%" title={m.label}>
				<span class="mark-n">{m.num}</span>
			</a>
		{/each}
	</nav>

	<span class="cursor" style:top="{progress * 100}%" aria-hidden="true">
		<span class="reading">{reading}%</span>
	</span>
	</div>
</div>

<style>
	.ruler {
		--w: 3.25rem;
		position: absolute;
		inset-block: 0;
		inset-inline-end: 0;
		width: var(--w);
		border-inline-start: 1px solid var(--border-subtle);
		background: color-mix(in oklch, var(--surface-base) 88%, transparent);
		backdrop-filter: blur(6px);
		cursor: crosshair;
		touch-action: none;
		user-select: none;
		z-index: 5;
		font-family: var(--font-mono);
	}
	/* Inset from both ends so the 0 and 100 marks are not cut by the edge. */
	.track {
		position: absolute;
		inset: 1rem 0;
	}
	.tick,
	.mark,
	.cursor {
		position: absolute;
		inset-inline-end: 0;
		/* Ticks are placed inside the padded track. */
		transform: translateY(-50%);
	}
	.tick {
		width: 0.55rem;
		height: 1px;
		background: var(--border-strong);
	}
	.tick.mid {
		width: 0.85rem;
	}
	.tick.major {
		width: 1.25rem;
		background: var(--text-faint);
	}
	.tick-n {
		position: absolute;
		inset-inline-end: 1.6rem;
		top: 50%;
		transform: translateY(-50%);
		font-size: 0.5625rem;
		color: var(--text-faint);
		direction: ltr;
	}
	.marks {
		position: absolute;
		inset: 0;
	}
	.mark {
		inset-inline-start: 0;
		inset-inline-end: auto;
		display: flex;
		align-items: center;
		height: 1.5rem;
		padding-inline: 0.3rem;
		text-decoration: none;
		color: var(--text-faint);
		font-size: 0.5625rem;
		letter-spacing: 0.04em;
	}
	.mark::before {
		content: '';
		width: 0.35rem;
		height: 0.35rem;
		margin-inline-end: 0.25rem;
		border: 1px solid currentColor;
		transform: rotate(45deg);
	}
	.mark.passed {
		color: var(--text-secondary);
	}
	.mark.passed::before {
		background: currentColor;
	}
	.mark:hover,
	.mark:focus-visible {
		color: var(--accent);
	}
	.cursor {
		inset-inline-start: -1px;
		height: 2px;
		background: var(--accent);
		pointer-events: none;
	}
	.reading {
		position: absolute;
		inset-inline-end: 0.15rem;
		bottom: 0.2rem;
		font-size: 0.5625rem;
		color: var(--accent);
		direction: ltr;
		font-variant-numeric: tabular-nums;
	}

	/* Phones: a slim rule in the gutter, ticks and marker only. */
	@media (max-width: 760px) {
		.ruler {
			--w: 0.9rem;
			backdrop-filter: none;
			background: none;
			border-inline-start-color: transparent;
		}
		.tick {
			width: 0.3rem;
		}
		.tick.mid {
			width: 0.45rem;
		}
		.tick.major {
			width: 0.65rem;
		}
		.tick-n,
		.mark-n,
		.reading {
			display: none;
		}
		.mark {
			padding: 0;
			inset-inline-end: 0;
			inset-inline-start: auto;
			width: 0.9rem;
			justify-content: center;
		}
		.mark::before {
			margin: 0;
		}
		.cursor {
			inset-inline-start: 0;
		}
	}
</style>
