<script lang="ts" module>
	/** Whole MD with grouping; one decimal only when a short coin leaves one. */
	export function fmtMd(n: number): string {
		const r = Math.round(n * 10) / 10;
		const whole = Math.abs(r - Math.round(r)) < 0.05;
		return r.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 1, maximumFractionDigits: whole ? 0 : 1 });
	}

	/** Signed, with a true minus sign, never a negative zero. */
	export function signed(n: number, digits = 0): string {
		const r = Number(n.toFixed(digits));
		if (r === 0) return digits ? (0).toFixed(digits) : '0';
		const body = Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
		return `${r > 0 ? '+' : '−'}${body}`;
	}
</script>

<script lang="ts">
	import type { Direction } from './diff';

	/**
	 * One system on the board: its name, two bars on the board's common scale
	 * (the state's 2027 plan as a filled reference, the citizen's allocation in
	 * the accent), a mark at the plan across both, and the difference in MD
	 * and per cent. Direction is carried by the sign and the word, never by
	 * colour alone.
	 */
	let {
		id,
		name,
		plan,
		yours,
		scale,
		deltaMd,
		deltaPct,
		direction,
		words,
		active = false,
		target = false,
		source = false,
		refused = false,
		pan = false
	}: {
		id: string;
		name: string;
		plan: number;
		yours: number;
		scale: number;
		deltaMd: number;
		deltaPct: number;
		direction: Direction;
		words: { plan: string; yours: string; more: string; less: string; same: string };
		active?: boolean;
		target?: boolean;
		source?: boolean;
		refused?: boolean;
		/** On a page that scrolls, let a touch pan the page; buttons move the money there. */
		pan?: boolean;
	} = $props();

	const pct = (n: number) => `${Math.min(100, (Math.max(0, n) / scale) * 100)}%`;
	const over = $derived(yours > scale);
	const word = $derived(direction === 'more' ? words.more : direction === 'less' ? words.less : words.same);
</script>

<div class="row" class:active class:target class:source class:refused class:pan data-drop={id} data-dir={direction}>
	<div class="head">
		<span class="grip" aria-hidden="true"></span>
		<span class="name">{name}</span>
		<span class="yours num" dir="ltr">{fmtMd(yours)}</span>
		<span class="delta num" title={word}>
			<span class="arrow" aria-hidden="true">{direction === 'more' ? '▲' : direction === 'less' ? '▼' : '='}</span>{#if direction !== 'same'}<bdi dir="ltr">{`${signed(deltaMd)} · ${signed(deltaPct, 1)}%`}</bdi>{/if}<span class="sr">{word}</span>
		</span>
	</div>
	<div class="bars" aria-hidden="true">
		<span class="bar plan" style:inline-size={pct(plan)}></span>
		<span class="bar mine" class:over style:inline-size={pct(yours)}></span>
		<span class="mark" style:inset-inline-start={pct(plan)}></span>
	</div>
	<div class="foot num" aria-hidden="true">
		<span>{words.plan} {fmtMd(plan)}</span>
	</div>
</div>

<style>
	.row {
		--bar-h: var(--s-4);
		position: relative;
		display: grid;
		grid-template-rows: auto auto auto;
		align-content: center;
		gap: var(--s-2);
		block-size: 100%;
		padding-block: var(--s-3);
		padding-inline: var(--s-5) var(--s-4);
		border-radius: var(--r-md);
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		transition:
			background-color var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.row.pan {
		touch-action: pan-y;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.active {
		background: var(--accent-muted);
		box-shadow: inset 0 0 0 1px var(--accent-border);
	}
	.row.source {
		cursor: grabbing;
		opacity: 0.7;
	}
	.row.target {
		background: var(--accent-muted);
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.row.refused {
		animation: nudge var(--dur-slow) var(--ease-out);
	}
	@keyframes nudge {
		30% {
			transform: translateX(var(--s-2));
		}
		60% {
			transform: translateX(calc(-1 * var(--s-2)));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.row.refused {
			animation: none;
		}
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		min-inline-size: 0;
	}
	.grip {
		flex: none;
		inline-size: var(--s-3);
		block-size: var(--s-5);
		align-self: center;
		margin-inline-start: calc(-1 * var(--s-4));
		background-image: radial-gradient(circle, var(--text-faint) 1px, transparent 1.2px);
		background-size: 3px 4px;
		opacity: 0.8;
	}
	.name {
		flex: 1;
		min-inline-size: 0;
		font-family: var(--font-sans);
		font-size: var(--t-md);
		font-weight: 550;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.yours {
		flex: none;
		unicode-bidi: isolate;
		font-size: var(--t-md);
		font-weight: 600;
		color: var(--text-primary);
	}
	.delta {
		flex: none;
		unicode-bidi: isolate;
		min-inline-size: 11.5ch;
		text-align: end;
		font-size: var(--t-sm);
		color: var(--text-secondary);
	}
	.arrow {
		display: inline-block;
		margin-inline-end: var(--s-2);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	[data-dir='more'] .arrow {
		color: var(--index-band-5);
	}
	[data-dir='less'] .arrow {
		color: var(--index-band-1);
	}
	.sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.bars {
		position: relative;
		display: grid;
		gap: var(--s-1);
	}
	.bar {
		display: block;
		block-size: var(--bar-h);
		min-inline-size: var(--s-1);
		border-start-end-radius: var(--r-xs);
		border-end-end-radius: var(--r-xs);
		transition: inline-size var(--dur-normal) var(--ease-out);
	}
	.plan {
		background: var(--text-faint);
		opacity: 0.55;
	}
	.mine {
		background: var(--accent);
	}
	.mine.over {
		border-radius: 0;
		mask-image: linear-gradient(to right, black 92%, transparent);
	}
	:global([dir='rtl']) .mine.over {
		mask-image: linear-gradient(to left, black 92%, transparent);
	}
	.mark {
		position: absolute;
		inset-block: calc(-1 * var(--s-1));
		inline-size: 2px;
		margin-inline-start: -1px;
		background: var(--text-primary);
		border-radius: var(--r-xs);
		transition: inset-inline-start var(--dur-normal) var(--ease-out);
	}

	.foot {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}

	/* Short rows, on a phone or a low window: one line of text, thinner bars, no foot. */
	@media (max-width: 720px), (max-height: 760px) {
		.row {
			--bar-h: var(--s-3);
			gap: var(--s-1);
			padding-block: var(--s-2);
		}
		.foot {
			display: none;
		}
		.name,
		.yours {
			font-size: var(--t-base);
		}
		.delta {
			font-size: var(--t-xs);
			min-inline-size: 10.5ch;
		}
	}
</style>
