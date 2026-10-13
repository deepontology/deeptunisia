<script lang="ts">
	import { BASIS_OPACITY, CUTOFF, DASH, LAYER_COLOR, personById, type Basis, type Layer, type Position } from '$lib/model';
	import { describeInterval, formatDate, nameOf } from '$lib/t.svelte';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * One officeholding, one vertical block on a post's column.
	 *
	 * The block is the whole envelope: from the earliest a source lets the post
	 * start to the latest it lets it end (the dataset horizon when it is still
	 * open). Basis is never flattened — the fill, the dashed border and the
	 * opacity each carry it — so a documented tenure and an unsubstantiated one
	 * cannot be mistaken for each other. The uncertain edges at either end of the
	 * envelope are hatched, exactly as the horizontal Chronicle hatches them.
	 *
	 * It is a button: the whole block is the tap target for opening the person in
	 * the inspector. A short block grows its touch area toward the 44px floor, but
	 * never past the top of the next block in its column, so a thin tenure cannot
	 * cover the tap target of the holder that follows it.
	 */
	interface Props {
		pos: Position;
		scale: VScale;
		/** The post's layer: blocks take the layer colour, as the horizontal bars do. */
		layer: Layer;
		/** Pixels from this block's top to the next block's top in the column. */
		room: number;
		onselect(holder: string): void;
	}

	let { pos, scale, layer, room, onselect }: Props = $props();

	const basis = $derived(pos.basis as Basis);
	/* Layer colour, like the horizontal bars; the basis is carried by the dash and
	   the opacity, never by a second colour system. */
	const color = $derived(LAYER_COLOR[layer]);
	const dash = $derived(DASH[basis]);
	const opacity = $derived(BASIS_OPACITY[basis]);
	/* A column block is far taller than a horizontal bar, so a full-strength fill
	   reads as a slab. The border carries BASIS_OPACITY with the dash; the fill is
	   a tint on the same ramp, so the order of the four bases is unchanged. */
	const TINT = 0.3;

	const iv = $derived(pos.interval);
	const top = $derived(scale.y(iv.startEarliest));
	const height = $derived(scale.y(iv.endLatest ?? CUTOFF) - top);
	/* The touch area: the drawn height, or the 44px floor where the room before the next block allows. */
	const TAP = 44;
	const hit = $derived(Math.max(height, Math.min(TAP, room)));

	/*
	 * The certain core sits between startLatest and endEarliest. The span either
	 * side of it is the uncertain edge — a source lets the post start earlier than
	 * this, or lets it run later — and each edge is drawn hatched. Both are
	 * expressed in block-local pixels, measured down from the block's own top.
	 */
	const leadH = $derived(Math.max(0, scale.y(iv.startLatest) - top));
	const tailTop = $derived(scale.y(iv.endEarliest ?? CUTOFF) - top);
	const tailH = $derived(Math.max(0, height - tailTop));

	const showLead = $derived(leadH > 0.8);
	const showTail = $derived(tailH > 0.8);
	/* The name needs about 14px of plate and the years line about 10px more, so a
	   block shows its name from 18px and adds the years only once both fit. */
	const showLabel = $derived(height >= 18);
	const showYears = $derived(height >= 30);

	const holderName = $derived(nameOf(personById.get(pos.holder)));
	const aria = $derived(`${holderName || pos.roleTitle}, ${describeInterval(iv)}`);

	/*
	 * The year label matches the block's own edges: earliest start to latest end,
	 * both read from the interval so no number is hand-typed. A single-year span
	 * prints once, not as "1980–1980".
	 */
	const years = $derived.by(() => {
		const a = formatDate(iv.startEarliest, 'year');
		const b = formatDate(iv.endLatest ?? CUTOFF, 'year');
		return a === b ? a : `${a}\u2013${b}`;
	});

	/*
	 * A hatch pattern per block. Finite, per-position ids so each block tints its
	 * own fuzzy edges with its own basis colour through the `--basis-*` token the
	 * surrounding SVG inherits.
	 */
	const patternId = $derived(`cv-fuzz-${pos.id}`);
</script>

<button
	type="button"
	class="tb"
	style:top="{top}px"
	style:height="{hit}px"
	aria-label={aria}
	onclick={() => onselect(pos.holder)}
>
	<svg class="tb-svg" style:height="{height}px" aria-hidden="true">
		<defs>
			<pattern id={patternId} width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
				<line x1="0" y1="0" x2="0" y2="5" style:stroke={color} stroke-width="1.6" opacity="0.55" />
			</pattern>
		</defs>
		<!-- Whole envelope: basis fill and the basis dash border, one pixel per -->
		<!-- user unit so the pattern matches the horizontal Chronicle exactly. -->
		<rect
			x="0"
			y="1"
			width="100%"
			height={Math.max(0, height - 2)}
			rx="2"
			style:fill={color}
			style:fill-opacity={String(opacity * TINT)}
			style:stroke={color}
			style:stroke-opacity={String(opacity)}
			style:stroke-width="2"
			style:stroke-dasharray={dash}
		/>
		<!-- Uncertain edges, hatched over the fill. -->
		{#if showLead}
			<rect x="0" y="0" width="100%" height={leadH} rx="2" fill="url(#{patternId})" />
		{/if}
		{#if showTail}
			<rect x="0" y={tailTop} width="100%" height={tailH} rx="2" fill="url(#{patternId})" />
		{/if}
	</svg>
	{#if showLabel}
		<span class="tb-label">
			<span class="tb-name">{holderName}</span>
			{#if showYears}<span class="tb-years">{years}</span>{/if}
		</span>
	{/if}
</button>

<style>
	.tb {
		position: absolute;
		inset-inline-start: 0;
		width: 100%;
		min-width: var(--tap);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--r-xs);
		background: none;
		text-align: start;
		cursor: pointer;
	}
	.tb:focus-visible {
		box-shadow: var(--ring);
	}
	.tb-svg {
		position: absolute;
		inset-inline-start: 0;
		top: 0;
		width: 100%;
		/* The 2px border centres on the rect edge; let its outer half draw. */
		overflow: visible;
	}
	/*
	   A small opaque plate behind the text. The fill sits at the basis opacity,
	   which ranges from solid to nearly clear against either theme, so no single
	   text colour stays legible over every basis — the plate guarantees it does.
	 */
	.tb-label {
		position: absolute;
		inset-inline-start: 2px;
		top: 2px;
		max-width: calc(100% - 4px);
		display: flex;
		flex-direction: column;
		padding: 1px 3px;
		background: var(--surface-base);
		border-radius: var(--r-xs);
		line-height: 1.15;
		pointer-events: none;
	}
	.tb-name {
		font-size: var(--t-2xs);
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tb-years {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-secondary);
	}
	@media (prefers-reduced-motion: reduce) {
		.tb:focus-visible {
			box-shadow: none;
			outline: 2px solid var(--accent);
			outline-offset: -2px;
		}
	}
</style>
