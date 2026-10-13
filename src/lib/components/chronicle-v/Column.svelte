<script lang="ts">
	import { type Basis } from '$lib/model';
	import { type ChronRow, visiblePositions } from '$lib/chronicle/rows';
	import type { VScale } from '$lib/chronicle/vscale';
	import TenureBlock from '$lib/components/chronicle-v/TenureBlock.svelte';

	/**
	 * One post, one column of the vertical Chronicle.
	 *
	 * The header is the part that sticks to the top of the canvas while the
	 * timeline scrolls under it: the role title clamped to two lines, the
	 * institution beneath it in mono. It overlays the body rather than pushing
	 * it, and it never takes a tap — so a block sitting under it stays reachable.
	 *
	 * The body is the column's height, from the canvas top, so a block positioned
	 * by `scale.y` lines up with the spine and every rupture rule to the pixel.
	 * Each visible officeholding — the positions that clear the reader's evidence
	 * floor — becomes one TenureBlock.
	 *
	 * `focus` is the event cross-highlight: 'linked' marks the column as one the
	 * focused event reaches, 'dim' fades it when the event reaches elsewhere. The
	 * outline paints above the reading line; the panels behind it keep their own
	 * z-index token above `--z-view` for exactly this reason.
	 */
	interface Props {
		row: ChronRow;
		scale: VScale;
		focus: 'none' | 'linked' | 'dim';
		basisFloor: Basis;
		onselect(personId: string): void;
	}

	let { row, scale, focus, basisFloor, onselect }: Props = $props();

	const visible = $derived(visiblePositions(row, basisFloor));
	/* Where each block starts on the scale, so a block knows the room below it. */
	const tops = $derived(visible.map((p) => scale.y(p.interval.startEarliest)));
	/* Pixels from `top` to the next block's top in this column; infinite for the last one. */
	function roomBelow(top: number) {
		let room = Infinity;
		for (const t of tops) if (t > top && t - top < room) room = t - top;
		return room;
	}
</script>

<div class="cv-col" class:linked={focus === 'linked'} class:dim={focus === 'dim'}>
	<header class="cv-col-head">
		<div class="cv-col-title">{row.title}</div>
		<div class="cv-col-inst">{row.institutionName}</div>
	</header>
	<div class="cv-col-body" style:height="{scale.height}px">
		{#each visible as pos (pos.id)}
			<TenureBlock {pos} {scale} layer={row.layer} room={roomBelow(scale.y(pos.interval.startEarliest))} {onselect} />
		{/each}
	</div>
</div>

<style>
	.cv-col {
		position: relative;
		flex: 1 0 var(--cv-col-min);
		min-width: var(--cv-col-min);
		border-inline-start: var(--rule);
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	/*
	   A linked column runs two accent rails down its full height, so the mark is
	   still visible however far the reader has scrolled from the event.
	 */
	.cv-col.linked {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.cv-col.dim {
		opacity: var(--dim);
	}
	.cv-col-head {
		position: sticky;
		top: 0;
		z-index: var(--z-sheet);
		height: var(--cv-head-h);
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--s-2) var(--s-3);
		overflow: hidden;
		background: var(--surface-base);
		border-block-end: var(--rule);
		pointer-events: none;
	}
	.cv-col-title {
		font-size: var(--t-xs);
		font-weight: 600;
		line-height: 1.2;
		color: var(--text-primary);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.cv-col-inst {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/*
	   Absolute and anchored to the column's own top: blocks are placed by
	   `scale.y` from here, the same origin the spine and ruptures use, so the
	   years line up. The header stays sticky in flow and floats over this.
	 */
	.cv-col-body {
		position: absolute;
		inset-inline: 0;
		top: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.cv-col {
			transition: none;
		}
	}
</style>
