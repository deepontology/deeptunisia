<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { eventTitle, formatDate } from '$lib/t.svelte';
	import { ds, meetsBasis, type EventRec } from '$lib/model';
	import type { VScale } from '$lib/chronicle/vscale';

	/**
	 * One rupture, as a rule across the whole strip.
	 *
	 * A rupture is not a post and not an ordinary event: it is the line the rest of
	 * the record is read against, so it spans the spine and every column instead of
	 * living in one of them, and it is positioned by the scale at the date its
	 * sources give it rather than spread over an interval.
	 *
	 * The chip below the rule is the whole label — the date and the event's title,
	 * on one line, ellipsised. A rupture is never a spine dot, so the chip is how a
	 * reader opens it: tapping it focuses the event and opens its record.
	 *
	 * WHY THE CHIP STACKS
	 *
	 * Ruptures cluster — three pairs in this dataset share a date, and the 2013
	 * sequence falls within a few pixels at every zoom level. A chip drawn at a
	 * fixed offset from its rule would sit exactly on top of the chip before it, so
	 * each rule places its chip below the last chip already placed. The pass runs
	 * over the whole rupture list from the dataset, which means every instance
	 * computes the same answer from the same inputs and none of them has to know
	 * whether its siblings have rendered yet. The list is filtered by the reader's
	 * evidence floor, the same rule the canvas draws the rules by, so the cascade
	 * never reserves room for a rule that is not there.
	 *
	 * A chip can therefore sit some way below its own rule. The leader line keeps
	 * them attached, which is the difference between a stacked label and an orphan.
	 */

	interface Props {
		event: EventRec;
		scale: VScale;
		onpick(eventIds: string[]): void;
	}

	let { event, scale, onpick }: Props = $props();

	/** The chip's height. Fixed rather than measured, so the pass above can compute. */
	const CHIP_H = 20;
	/** Between a rule and its own chip. */
	const CHIP_GAP = 4;
	/** Between a stacked chip and the one above it. */
	const CHIP_STACK = 4;

	const y = $derived(scale.y(event.interval.startEarliest));

	/** Where this rule's chip sits, once the chips above it have taken their room. */
	const chipTop = $derived.by(() => {
		const rules = ds.events
			.filter((e) => e.rupture && meetsBasis(e.basis, app.basisFloor))
			.sort((a, b) => a.interval.startEarliest - b.interval.startEarliest);

		let below = -Infinity;
		let top = y + CHIP_GAP;
		for (const rule of rules) {
			const ruleY = scale.y(rule.interval.startEarliest);
			const candidate = Math.max(ruleY + CHIP_GAP, below + CHIP_STACK);
			below = candidate + CHIP_H;
			if (rule.id === event.id) top = candidate;
		}
		return top;
	});
</script>

<div class="cv-rupture" style:--cv-rule-y="{y}px" style:--cv-chip-top="{chipTop}px">
	<!-- Joins the rule to the chip it names, including when the chip was pushed
	     down the canvas by the one above it. -->
	<i class="cv-rupture-leader" aria-hidden="true"></i>
	<div class="cv-rupture-rule" aria-hidden="true"></div>
	<button type="button" class="cv-rupture-chip" onclick={() => onpick([event.id])}>
		<span class="cv-chip-mark" aria-hidden="true">&#9670;</span>
		<span class="cv-chip-text" dir="auto">
			{formatDate(event.interval.startEarliest, 'day')} &#183; {eventTitle(event)}
		</span>
	</button>
</div>

<style>
	.cv-rupture {
		position: absolute;
		inset-inline: 0;
		top: var(--cv-rule-y);
		height: 0;
		/* Above the tenure blocks, below the sticky column headers and the spine.
		   The spine draws its own segment of each rule, so the rule still reads as
		   one line across the whole canvas. */
		z-index: 2;
		pointer-events: none;
	}

	.cv-rupture-rule {
		position: absolute;
		inset-inline: 0;
		top: 0;
		height: 1px;
		background: var(--rupture-soft);
	}

	.cv-rupture-leader {
		position: absolute;
		inset-inline-start: var(--cv-spine-w);
		top: 0;
		width: 1px;
		height: calc(var(--cv-chip-top) - var(--cv-rule-y));
		background: var(--rupture-soft);
	}

	.cv-rupture-chip {
		position: absolute;
		inset-inline-start: var(--cv-spine-w);
		top: calc(var(--cv-chip-top) - var(--cv-rule-y));
		/* The height comes from the script's CHIP_H, so the pass that stacks the
		   chips and the box it stacks them into can never disagree. */
		max-width: min(380px, calc(100vw - var(--cv-spine-w) - var(--s-5)));
		height: 20px;
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin: 0;
		padding: 0 var(--s-2);
		font: inherit;
		text-align: start;
		cursor: pointer;
		pointer-events: auto;
		border: 1px solid var(--border-default);
		border-inline-start: 1px solid var(--rupture-soft);
		border-radius: var(--r-sm);
		background: var(--surface-panel);
	}
	.cv-rupture-chip:hover .cv-chip-text,
	.cv-rupture-chip:focus-visible .cv-chip-text {
		color: var(--text-primary);
	}
	.cv-rupture-chip:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	/* The chip is short so stacked chips stay compact; on touch its hit area
	   grows to the floor without changing what is drawn. */
	@media (pointer: coarse) {
		.cv-rupture-chip::after {
			content: '';
			position: absolute;
			inset-inline: 0;
			top: 50%;
			height: var(--touch);
			transform: translateY(-50%);
		}
	}
	.cv-chip-mark {
		flex: 0 0 auto;
		font-size: var(--t-2xs);
		line-height: 1;
		color: var(--rupture);
	}
	.cv-chip-text {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--t-2xs);
		line-height: 1.2;
		color: var(--text-secondary);
	}
</style>
