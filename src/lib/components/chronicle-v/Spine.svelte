<script lang="ts">
	import { format } from '$lib/i18n';
	import { app } from '$lib/state.svelte';
	import { eventTitle, formatDate, tf } from '$lib/t.svelte';
	import { BASIS_COLOR, BASIS_OPACITY, DASH, meetsBasis, type EventRec } from '$lib/model';
	import type { VScale } from '$lib/chronicle/vscale';
	import EventListSheet from './EventListSheet.svelte';

	/**
	 * The year spine.
	 *
	 * A ruler and a set of marks, pinned to the inline-start edge so it stays put
	 * while the columns scroll underneath it. The ticks come from `scale.ticks()` —
	 * the scale owns which years are worth a label at this zoom, so the spine never
	 * invents one.
	 *
	 * WHAT IS DRAWN, AND WHAT IS NOT
	 *
	 * Every event clearing the reader's evidence floor gets a mark, in the basis
	 * language the rest of the site speaks: colour, opacity and dash from
	 * `BASIS_COLOR`, `BASIS_OPACITY` and `DASH`, never a style of this component's
	 * own. A rupture's mark is a diamond in the rupture colour: the spine is where a
	 * rupture is tapped, and `RuptureRule` only draws its quiet line across the
	 * columns, with no label over them.
	 *
	 * CLUSTERS
	 *
	 * Events closer than `CLUSTER_PX` collapse into one counted badge, because a
	 * column of dots 2px apart is a smear rather than information. The badge opens
	 * `EventListSheet`, which names every event it swallowed with its exact date.
	 * Zooming splits the badges back apart, so nothing stays hidden behind a count
	 * the reader cannot get past.
	 *
	 * NO MARK STEALS ITS NEIGHBOUR'S TAP
	 *
	 * Marks share one rail, so two close together would otherwise overlap their
	 * touch targets and whichever painted later would win both. The pass at the
	 * bottom of the script gives each mark an area that ends at its own mark and
	 * never covers its neighbour's, so a tap lands on the mark it was aimed at.
	 */

	interface Props {
		scale: VScale;
		/** Every event clearing the reader's evidence floor, oldest first. */
		events: EventRec[];
		onpick(eventIds: string[]): void;
	}

	let { scale, events, onpick }: Props = $props();

	/** Marks closer than this collapse into one counted badge. */
	const CLUSTER_PX = 14;
	/** The touch target, in pixels. `var(--tap)` is the same number. */
	const TAP = 44;

	const ticks = $derived(scale.ticks());

	/** Rupture positions: the spine carries its segment of each rupture rule. */
	const ruptureYs = $derived(
		events.filter((e) => e.rupture).map((e) => ({ id: e.id, y: scale.y(e.interval.startEarliest) }))
	);

	interface Mark {
		key: string;
		kind: 'dot' | 'badge';
		/** Where the date is, in canvas pixels. The visible mark is drawn here. */
		y: number;
		/** Top of the tap area. */
		top: number;
		/** Height of the tap area. */
		height: number;
		event?: EventRec;
		members?: EventRec[];
	}

	const marks = $derived.by<Mark[]>(() => {
		const drawn = events
			.filter((e) => meetsBasis(e.basis, app.basisFloor))
			.map((e) => ({ event: e, y: scale.y(e.interval.startEarliest) }))
			.sort((a, b) => a.y - b.y || (a.event.id < b.event.id ? -1 : 1));

		/*
		 * Chain, do not bucket: two events 10px apart and a third 10px after that
		 * are one cluster, not two, because the reader cannot tell them apart on
		 * screen either. Anything within CLUSTER_PX of the anchor before it joins the
		 * group still open.
		 */
		const groups: (typeof drawn)[] = [];
		for (const it of drawn) {
			const current = groups[groups.length - 1];
			if (current && it.y - current[current.length - 1].y <= CLUSTER_PX) current.push(it);
			else groups.push([it]);
		}

		const out: Mark[] = groups.map((g) =>
			g.length === 1
				? {
						key: `d-${g[0].event.id}`,
						kind: 'dot',
						y: g[0].y,
						top: 0,
						height: TAP,
						event: g[0].event
					}
				: {
						key: `b-${g[0].event.id}`,
						kind: 'badge',
						y: g.reduce((sum, x) => sum + x.y, 0) / g.length,
						top: 0,
						height: TAP,
						members: g.map((x) => x.event)
					}
		);

		/*
		 * Tap areas, top to bottom. Two anchors a rail-width apart would otherwise
		 * each claim a 44px box covering the other's mark, so the boundary between
		 * them sits at their midpoint until they are far enough apart to keep the
		 * full box each. Every area therefore ends at its own mark and never covers
		 * its neighbour's, so a tap lands on the mark it was aimed at.
		 *
		 * A badge is the exception, because it is the one mark that hides several
		 * events behind a count: it claims its full 44px, reaching down to the next
		 * dot's own position — a dot beside a badge still owns everything below its
		 * own mark. Against another badge the boundary stays at the midpoint, so two
		 * clusters share the room instead of the upper one taking all of it.
		 */
		let cursor = 0;
		for (let i = 0; i < out.length; i++) {
			const mark = out[i];
			const next = i + 1 < out.length ? out[i + 1] : null;
			const nextY = next ? next.y : scale.height;
			/** Halfway to the next mark: as far as anything may run before covering it. */
			const fair = (mark.y + nextY) / 2;

			const top = Math.max(cursor, mark.y - TAP / 2);
			const reach = Math.min(fair, mark.y + TAP / 2);
			const limit = !next || next.kind === 'badge' ? fair : nextY;
			const bottom =
				mark.kind === 'badge' ? Math.min(limit, Math.max(reach, top + TAP)) : reach;

			mark.top = top;
			mark.height = Math.max(1, bottom - top);
			cursor = bottom;
		}

		return out;
	});

	/**
	 * The badge whose sheet is open, or null. Held as a key rather than as the mark,
	 * so a badge that zoom or the evidence floor removes cannot hold a sheet open.
	 */
	let openKey = $state<string | null>(null);
	const openMark = $derived(marks.find((m) => m.key === openKey) ?? null);

	function pick(ids: string[]) {
		openKey = null;
		onpick(ids);
	}

	/**
	 * The range a badge stands for. Assembled from the dictionary's own range
	 * sentence rather than a dash typed here, so a badge's name, the sheet heading
	 * and every post interval on the site punctuate a range the same way.
	 */
	function badgeLabel(members: EventRec[]): string {
		const first = members[0].interval.startEarliest;
		const last = members[members.length - 1].interval.startEarliest;
		return tf('chronicle.vertical.spine.cluster', {
			n: members.length,
			range: format(app.locale, 'interval.range', {
				start: formatDate(first, 'day'),
				end: formatDate(last, 'day')
			})
		});
	}
</script>

<div class="cv-spine" style:height="{scale.height}px">
	<div class="cv-spine-inner">
		{#each ticks as tick (tick.t)}
			<div class="cv-tick" class:major={tick.major} style:top="{scale.y(tick.t)}px" aria-hidden="true">
				<span class="cv-tick-label mono">{tick.label}</span>
				<i class="cv-tick-line"></i>
			</div>
		{/each}

		{#each ruptureYs as r (r.id)}
			<i class="cv-rupture-seg" style:top="{r.y}px" aria-hidden="true"></i>
		{/each}

		{#each marks as m (m.key)}
			{#if m.kind === 'dot' && m.event}
				{@const ev = m.event}
				<button
					type="button"
					class="cv-mark"
					style:top="{m.top}px"
					style:height="{m.height}px"
					aria-label="{eventTitle(ev)}, {formatDate(ev.interval.startEarliest, 'day')}"
					onclick={() => pick([ev.id])}
				>
					<span class="cv-mark-vis" style:top="{m.y - m.top}px">
						{#if ev.rupture}
							<svg class="cv-dot" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
								<path d="M6 1 L11 6 L6 11 L1 6 Z" fill="var(--rupture)" />
							</svg>
						{:else}
						<svg class="cv-dot" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
							<circle
								cx="6"
								cy="6"
								r="4"
								fill="none"
								stroke={BASIS_COLOR[ev.basis]}
								stroke-opacity={BASIS_OPACITY[ev.basis]}
								stroke-width="1.6"
								stroke-dasharray={DASH[ev.basis]}
							/>
						</svg>
						{/if}
					</span>
				</button>
			{:else if m.kind === 'badge' && m.members}
				{@const members = m.members}
				<button
					type="button"
					class="cv-mark"
					style:top="{m.top}px"
					style:height="{m.height}px"
					aria-label={badgeLabel(members)}
					aria-haspopup="dialog"
					aria-expanded={openKey === m.key}
					onclick={() => (openKey = openKey === m.key ? null : m.key)}
				>
					<span class="cv-mark-vis" style:top="{m.y - m.top}px">
						<span class="cv-badge mono" class:rupture={members.some((e) => e.rupture)}>{members.length}</span>
					</span>
				</button>
			{/if}
		{/each}
	</div>

	<!--
		Mounted for the life of the spine, not per badge: the sheet owns its own exit
		transition, so closing one badge and opening the next is one gesture rather
		than a card that vanishes on the frame.
	-->
	<EventListSheet
		open={openMark !== null}
		ids={openMark?.members?.map((e) => e.id) ?? []}
		onpick={(ids) => pick(ids)}
		onclose={() => (openKey = null)}
	/>
</div>

<style>
	.cv-spine {
		position: sticky;
		inset-inline-start: 0;
		/* Above the sticky column headers, so a column scrolled sideways passes
		   under the spine's top corner instead of over it. */
		z-index: calc(var(--z-sheet) + 1);
		flex: 0 0 var(--cv-spine-w);
		min-width: var(--cv-spine-w);
		align-self: stretch;
		background: var(--surface-sunken);
		border-inline-end: var(--rule);
	}

	/* Everything is positioned against the canvas, so a mark's top is its date. */
	.cv-spine-inner {
		position: relative;
		height: 100%;
	}

	.cv-rupture-seg {
		position: absolute;
		inset-inline: 0;
		height: 1px;
		background: var(--rupture-soft);
	}

	.cv-tick {
		position: absolute;
		inset-inline: 0;
		height: 0;
	}
	.cv-tick-label {
		position: absolute;
		inset-inline: 0;
		/* Clears the rail the marks sit on, so a label and a mark never collide. */
		inset-inline-end: 24px;
		text-align: end;
		font-size: var(--t-2xs);
		line-height: 1;
		color: var(--text-faint);
		transform: translateY(-50%);
	}
	.cv-tick.major .cv-tick-label {
		color: var(--text-muted);
	}
	.cv-tick-line {
		position: absolute;
		inset-inline-end: 0;
		width: 1px;
		height: 4px;
		background: var(--border-subtle);
		transform: translateY(-50%);
	}
	.cv-tick.major .cv-tick-line {
		height: 7px;
		background: var(--border-strong);
	}

	/*
	   A mark's tap area spans the whole spine, so a 10px ring still clears the
	   44px floor. The visible mark is drawn separately, at its own date.
	*/
	.cv-mark {
		position: absolute;
		inset-inline: 0;
		display: block;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.cv-mark-vis {
		/* The rail: an 18px band ending 3px short of the seam the rule runs along. */
		position: absolute;
		inset-inline-end: 3px;
		width: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		transform: translateY(-50%);
	}
	.cv-mark:hover .cv-dot {
		stroke-width: 2.2;
	}
	.cv-badge {
		/* As tall as the closest two marks may sit, so badges cannot overdraw. */
		height: 14px;
		min-width: 20px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding-inline: 3px;
		border: 1px solid var(--border-strong);
		border-radius: var(--r-full);
		background: var(--surface-overlay);
		font-size: var(--t-2xs);
		line-height: 1;
		color: var(--text-secondary);
	}
	/* A cluster holding a rupture says so before it is opened. */
	.cv-badge.rupture {
		border-color: var(--rupture);
	}
	.cv-mark:hover .cv-badge {
		border-color: var(--text-muted);
		color: var(--text-primary);
	}
	.cv-mark[aria-expanded='true'] .cv-badge {
		border-color: var(--accent-border);
		color: var(--text-primary);
	}
</style>
