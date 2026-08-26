<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { app } from '$lib/state.svelte';
	import { theme } from '$lib/design/theme.svelte';
	import { t, nameOf} from '$lib/t.svelte';
	import {
		CUTOFF,
		FLOOR,
		LAYERS,
		LAYER_COLOR,
		BASIS_ORDER,
		ds,
		eraAt,
		meetsBasis,
		possiblyActive,
		type Basis,
		type Layer
	} from '$lib/model';
	import { layerLabel, formatDate } from '$lib/t.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { fits } from '$lib/viz/measure';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Popover from '$lib/ui/Popover.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	/**
	 * The dock.
	 *
	 * The timeline lives at the bottom of the window, permanently, like a transport
	 * bar. That placement is doing real work: the date is the app's global state, so
	 * it belongs in persistent chrome rather than at the top of one view where it
	 * looks like a filter for that view alone.
	 *
	 * Behind the track is a density curve — how many senior posts the dataset can
	 * account for at each moment. It doubles as an honesty signal: the curve is thin
	 * before 1987 because the records are thin, and the reader can see that without
	 * being told.
	 */

	let track = $state<HTMLDivElement | null>(null);
	let trackW = $state(1);
	let trackH = $state(34);
	let dragging = $state(false);

	/**
	 * The instant under the pointer, which is not the instant the app is showing.
	 *
	 * Scrubbing used to be commit-only: the single way to find out what 1994 looked
	 * like was to go there, and the single way back was to remember where you had been.
	 * A preview makes the track answerable — hover it and it tells you the date and how
	 * much the record holds at that moment, before anything moves.
	 */
	let hoverT = $state<number | null>(null);

	const span = CUTOFF - FLOOR;
	const pct = (v: number) => ((v - FLOOR) / span) * 100;

	/* Spring on the playhead so scrubbing feels weighted and playback glides.
	   Stiffness is high enough that dragging still feels direct. */
	const head = new Spring(pct(app.t), { stiffness: 0.28, damping: 0.72 });
	$effect(() => {
		const target = pct(app.t);
		if (dragging || theme.reduceMotion) head.set(target, { instant: true });
		else head.target = target;
	});

	const currentEra = $derived(eraAt(app.t));
	const ruptures = ds.events.filter((e) => e.rupture);

	/* --- Density curve -----------------------------------------------------
	   Sampled once per filter change, not per frame. 240 samples across 70 years
	   is roughly one per quarter, which is finer than the data's precision. */
	const SAMPLES = 240;
	const density = $derived.by(() => {
		const eligible = ds.positions.filter(
			(p) => meetsBasis(p.basis as Basis, app.basisFloor) && app.activeLayers.has(p.layer as Layer)
		);
		const counts: number[] = [];
		for (let i = 0; i < SAMPLES; i++) {
			const at = FLOOR + (span * i) / (SAMPLES - 1);
			counts.push(eligible.reduce((n, p) => n + (possiblyActive(p.interval, at) ? 1 : 0), 0));
		}
		const max = Math.max(1, ...counts);
		const pts = counts.map((c, i) => `${(i / (SAMPLES - 1)) * 100},${100 - (c / max) * 100}`);
		return { path: `M0,100 L${pts.join(' L')} L100,100 Z`, max, counts };
	});

	/** Live senior posts at an arbitrary instant, read off the sampled curve. */
	function countAt(at: number) {
		const i = Math.round(((at - FLOOR) / span) * (SAMPLES - 1));
		return density.counts[Math.max(0, Math.min(SAMPLES - 1, i))] ?? 0;
	}

	const liveCount = $derived(countAt(app.t));

	/**
	 * Era bands, with the geometry needed to decide whether their names fit.
	 *
	 * The labels used to be `nowrap` inside an `overflow: hidden` band, which cut them
	 * mid-word — "Presidential re-ce" — and made the shortest eras unreadable rather
	 * than merely abbreviated. A band now either has room for its name or shows none,
	 * and what it does show ellipsises honestly. The current era is always named,
	 * however narrow, because that is the one the reader is standing in.
	 */
	/** Must match the `.era-name` rule below, or the fit test lies about the render. */
	const ERA_NAME_TYPE = { size: 9.5, family: 'JetBrains Mono, monospace', tracking: 0.04 };

	const bands = $derived(
		ds.eras.map((era) => {
			const l = pct(era.interval.startEarliest);
			const w = pct(era.interval.endLatest ?? CUTOFF) - l;
			const px = (w / 100) * trackW;
			return {
				era,
				l,
				w,
				// Measured against the actual type rather than compared to a magic number.
				// The same rule runs in Chronicle; see src/lib/viz/measure.ts.
				named: fits(era.label_en, px, ERA_NAME_TYPE, 10),
				current: currentEra?.id === era.id
			};
		})
	);

	/** Where the hover readout sits, clamped so it never hangs off either end. */
	const preview = $derived.by(() => {
		if (hoverT === null || dragging) return null;
		const p = pct(hoverT);
		const half = trackW > 1 ? (76 / trackW) * 100 : 8;
		return {
			at: hoverT,
			p,
			label: Math.min(100 - half, Math.max(half, p)),
			count: countAt(hoverT),
			era: eraAt(hoverT)
		};
	});

	let hoverRupture = $state<string | null>(null);

	/**
	 * Where a count sits on the density curve, in pixels from the bottom of the track.
	 *
	 * The curve is the project's honesty signal — it is thin before 1987 because the
	 * records are thin, not because less was happening — and until now it was a shape
	 * with nothing attaching it to any number. Riding a marker along it at the playhead
	 * makes the reading explicit: you can watch coverage collapse as you scrub back,
	 * which is a more convincing statement about the archive than a sentence would be.
	 *
	 * 12px is the tick strip at the bottom, which the density svg is inset by.
	 */
	function curveY(count: number) {
		const usable = Math.max(1, trackH - 12);
		return 12 + (count / Math.max(1, density.max)) * usable;
	}

	const decades: number[] = [];
	for (let y = 1960; y <= 2020; y += 10) decades.push(Date.UTC(y, 0, 1));

	function fromClientX(clientX: number) {
		if (!track) return app.t;
		const r = track.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
		return FLOOR + ratio * span;
	}

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		app.playing = false;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		app.setDate(fromClientX(e.clientX));
	}
	function onPointerMove(e: PointerEvent) {
		if (dragging) app.setDate(fromClientX(e.clientX));
		// Touch has no hover, and showing a readout under the finger that is already
		// dragging the playhead would only cover the thing it describes.
		else if (e.pointerType !== 'touch') hoverT = fromClientX(e.clientX);
	}
	function onPointerUp(e: PointerEvent) {
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function onKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 5 : 1;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			app.nudge(-step);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			app.nudge(step);
		} else if (e.key === 'Home') {
			e.preventDefault();
			app.setDate(FLOOR);
		} else if (e.key === 'End') {
			e.preventDefault();
			app.setDate(CUTOFF);
		}
	}

	const basisOptions = $derived(
		BASIS_ORDER.map((b, i) => ({
			value: b,
			label: ['DOC', '+REP', '+INF', '+UNS'][i],
			title: t(`basis.floor.${b}`),
			tint: `var(--basis-${b})`
		}))
	);

	const SPEEDS = [
		{ value: '0.5', label: '½×' },
		{ value: '1', label: '1×' },
		{ value: '4', label: '4×' }
	];

	/**
	 * On a phone the evidence dial and the seven layer chips do not fit beside the
	 * date, and letting them overflow put half the layer palette off the screen edge —
	 * silently, because the document itself never overflowed. They move behind one
	 * button instead.
	 *
	 * Rendered from a snippet so there is exactly one copy of the markup: two
	 * hand-maintained versions of the app's most important filter is how the two drift
	 * apart, and this control is the single most informative interaction on the site.
	 */
	let filtersOpen = $state(false);

	/** How far the reader has moved from the default standard of evidence. */
	const filtersDirty = $derived(
		app.basisFloor !== 'reported' || app.activeLayers.size < LAYERS.length
	);
</script>

{#snippet evidenceDial()}
	<div class="group" data-tour="evidence">
		<span class="eyebrow">{t('ctl.evidence')}</span>
		<Segmented
			options={basisOptions}
			value={app.basisFloor}
			onchange={(v) => (app.basisFloor = v as Basis)}
			size="xs"
			cumulative
			label={t('ctl.evidence')}
		/>
		{#if app.basisFloor === 'unsubstantiated'}
			<span class="warn">{t('basis.warning')}</span>
		{/if}
	</div>
{/snippet}

{#snippet layerChips()}
	<div class="group" data-tour="layers">
		<span class="eyebrow">{t('ctl.layers')}</span>
		<div class="layers">
			{#each LAYERS as layer (layer)}
				<Tooltip content="{layerLabel(layer)} — click to toggle, alt-click to isolate">
					<button
						class="lchip"
						class:on={app.activeLayers.has(layer)}
						style:--c={LAYER_COLOR[layer]}
						aria-pressed={app.activeLayers.has(layer)}
						aria-label={layerLabel(layer)}
						onclick={(e) => (e.altKey ? app.soloLayer(layer) : app.toggleLayer(layer))}
					>
						<i></i>
					</button>
				</Tooltip>
			{/each}
			{#if app.activeLayers.size < LAYERS.length}
				<Button size="xs" variant="ghost" onclick={() => app.allLayers()}>
					{t('ctl.reset')}
				</Button>
			{/if}
		</div>
	</div>
{/snippet}

<footer class="dock" id="timeline" tabindex="-1" aria-label="Timeline controls">
	<!-- Row 1: transport and filters -->
	<div class="row controls">
		<div class="transport">
			<Button
				variant="solid"
				size="md"
				icon
				aria-label={app.playing ? t('ctl.pause') : t('ctl.play')}
				onclick={() => (app.playing = !app.playing)}
			>
				{#if app.playing}
					<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
						<rect x="2.5" y="1.5" width="2.8" height="9" rx="0.7" fill="currentColor" />
						<rect x="6.7" y="1.5" width="2.8" height="9" rx="0.7" fill="currentColor" />
					</svg>
				{:else}
					<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
						<path d="M3.2 1.7 L10.2 6 L3.2 10.3 Z" fill="currentColor" />
					</svg>
				{/if}
			</Button>

			<div class="readout">
				<span class="date mono">{formatDate(app.t, 'day')}</span>
				<span class="meta">
					{#if currentEra}
						<i class="era-dot" style:background={currentEra.accent}></i>
						<span class="era">{currentEra.label_en}</span>
					{/if}
					<span class="sep">·</span>
					<!--
						Named, because "18 live" beside an unlabelled curve does not tell the
						reader that the two are the same number. The tooltip carries the part
						that matters most and is easiest to leave unsaid: the curve is thin
						before 1987 because the archive is thin.
					-->
					<Tooltip content={t('ctl.coverage.hint')}>
						<span class="live mono">{liveCount} {t('ctl.coverage')}</span>
					</Tooltip>
				</span>
			</div>

			<div class="speed">
				<Segmented
					options={SPEEDS}
					value={String(app.playSpeed)}
					onchange={(v) => (app.playSpeed = Number(v))}
					size="xs"
					label="Playback speed"
				/>
			</div>
		</div>

		{#if compact.current}
			<div class="anchor">
				<button
					class="filter-btn"
					class:dirty={filtersDirty}
					class:on={filtersOpen}
					aria-expanded={filtersOpen}
					aria-haspopup="dialog"
					data-tour="filters"
					onclick={() => (filtersOpen = !filtersOpen)}
				>
					<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
						<path
							d="M1.5 3.5h11M3.5 7h7M5.5 10.5h3"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linecap="round"
						/>
					</svg>
					<span>{t('ctl.filters')}</span>
				</button>

				<Popover
					bind:open={filtersOpen}
					onclose={() => (filtersOpen = false)}
					label={t('ctl.filters')}
				>
					<div class="filter-sheet">
						{@render evidenceDial()}
						{@render layerChips()}
					</div>
				</Popover>
			</div>
		{:else}
			<div class="filters">
				{@render evidenceDial()}
				{@render layerChips()}
			</div>
		{/if}
	</div>

	<!-- Row 2: the timeline itself -->
	<div class="row timeline">
		<div
			class="track"
			bind:this={track}
			bind:clientWidth={trackW}
			bind:clientHeight={trackH}
			data-cursor="scrub"
			data-cursor-hint="drag to scrub"
			data-tour="time"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onpointerleave={() => (hoverT = null)}
			role="presentation"
		>
			<!-- Density: how much the dataset can account for at each moment -->
			<svg class="density" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<defs>
					<linearGradient id="dock-density" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32" />
						<stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
					</linearGradient>
				</defs>
				<path d={density.path} fill="url(#dock-density)" />
				<path d={density.path.replace(/^M0,100 L/, 'M').replace(/ L100,100 Z$/, '')} fill="none"
					stroke="var(--accent)" stroke-opacity="0.55" stroke-width="0.6"
					vector-effect="non-scaling-stroke" />
			</svg>

			<!-- Era bands -->
			<div class="eras">
				{#each bands as b (b.era.id)}
					<button
						class="era-band"
						style:left="{b.l}%"
						style:width="{b.w}%"
						style:--c={b.era.accent}
						class:current={b.current}
						aria-label="Jump to {b.era.label_en}"
						onclick={(e) => {
							e.stopPropagation();
							app.playing = false;
							// Land in the middle of the era rather than on its boundary, where
							// the state is ambiguous between two periods.
							const end = b.era.interval.endLatest ?? CUTOFF;
							app.setDate((b.era.interval.startEarliest + end) / 2);
						}}
					>
						<!-- Named only if the name fits, or if this is where the reader is
						     standing. A band too narrow for even an ellipsis showed three
						     letters and a hyphen, which reads as a rendering fault. -->
						{#if b.named || b.current}
							<span class="era-name">{b.era.label_en}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Decade ticks -->
			{#each decades as d (d)}
				<span class="tick" style:left="{pct(d)}%" aria-hidden="true">
					<span class="tick-label mono">{new Date(d).getUTCFullYear()}</span>
				</span>
			{/each}

			<!--
				Ruptures — the moments that reorganised the power structure.

				These are the most navigationally useful points on the whole track and were
				9px diamonds whose only description was a `title` attribute, which never
				appears on touch and appears after a second's delay everywhere else. Now the
				hit area is a comfortable band and the name is drawn.
			-->
			{#each ruptures as ev (ev.id)}
				<button
					class="rupture"
					class:lit={hoverRupture === ev.id}
					style:left="{pct(ev.interval.startEarliest)}%"
					aria-label="Jump to {nameOf(ev)}, {formatDate(ev.interval.startEarliest, 'day')}"
					onmouseenter={() => (hoverRupture = ev.id)}
					onmouseleave={() => (hoverRupture = null)}
					onfocus={() => (hoverRupture = ev.id)}
					onblur={() => (hoverRupture = null)}
					onclick={(e) => {
						e.stopPropagation();
						app.playing = false;
						app.setDate(ev.interval.startEarliest);
					}}
				>
					<i></i>
				</button>
			{/each}

			{#each ruptures.filter((e) => hoverRupture === e.id) as ev (ev.id)}
				<span
					class="rupture-name"
					style:left="{Math.min(88, Math.max(12, pct(ev.interval.startEarliest)))}%"
				>
					<b class="mono">{formatDate(ev.interval.startEarliest, 'day')}</b>
					{nameOf(ev)}
				</span>
			{/each}

			<!--
				The reading on the curve at the playhead, and at the pointer while
				previewing. Without these the curve is decoration; with them it is an axis
				the reader can see themselves moving along.
			-->
			<span
				class="coverage"
				style:left="{head.current}%"
				style:bottom="{curveY(liveCount)}px"
				aria-hidden="true"
			></span>
			{#if preview}
				<span
					class="coverage ghosted"
					style:left="{preview.p}%"
					style:bottom="{curveY(preview.count)}px"
					aria-hidden="true"
				></span>
			{/if}

			<!-- Scrub preview: what is here, before you commit to going here. -->
			{#if preview}
				<span class="ghost" style:left="{preview.p}%" aria-hidden="true"></span>
				<span class="preview" style:left="{preview.label}%" aria-hidden="true">
					<b class="mono">{formatDate(preview.at, 'day')}</b>
					<span class="p-meta">
						{#if preview.era}
							<i class="era-dot" style:background={preview.era.accent}></i>
						{/if}
						<span class="mono">{preview.count}</span>
						{t('network.live')}
					</span>
				</span>
			{/if}

			<!-- Playhead -->
			<div
				class="playhead"
				class:dragging
				style:left="{head.current}%"
				role="slider"
				tabindex="0"
				aria-label={t('ctl.date')}
				aria-valuemin={FLOOR}
				aria-valuemax={CUTOFF}
				aria-valuenow={app.t}
				aria-valuetext={formatDate(app.t, 'day')}
				onkeydown={onKey}
			>
				<span class="grip"></span>
				<span class="head-year mono">{new Date(app.t).getUTCFullYear()}</span>
			</div>
		</div>
	</div>
</footer>

<style>
	.dock {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		/*
		   The token is the height, not an approximation of it.

		   The rows used to add up to it by hand, which meant the border added a pixel
		   nobody counted and the mobile block could wrap to any height it liked while
		   --dock-h still claimed 56px. Since the inspector sheet and the views position
		   themselves against this token, that drift silently put the sheet underneath
		   the dock. Now the dock is exactly as tall as it advertises and the timeline
		   row absorbs whatever is left over.
		*/
		height: var(--dock-h);
		box-sizing: border-box;
		background: color-mix(in oklch, var(--surface-panel) 92%, transparent);
		backdrop-filter: blur(18px) saturate(1.3);
		border-top: 1px solid var(--border-default);
		box-shadow: 0 -1px 0 var(--border-subtle), var(--elev-3);
		z-index: 30;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--s-7);
		padding: 0 var(--s-6);
	}
	.controls {
		height: 44px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	/* Takes the remainder, so the two rows always sum to --dock-h exactly. */
	.timeline {
		flex: 1;
		min-height: 0;
		padding: 0 var(--s-6);
	}

	/* --- transport --- */

	.transport {
		display: flex;
		align-items: center;
		gap: var(--s-5);
		flex-shrink: 0;
	}
	.readout {
		display: flex;
		flex-direction: column;
		line-height: var(--lh-tight);
		min-width: 172px;
	}
	.date {
		font-size: var(--t-md);
		font-weight: 520;
		letter-spacing: var(--track-tight);
		font-variant-numeric: tabular-nums;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.era-dot {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.era {
		color: var(--text-muted);
	}
	.sep {
		opacity: 0.5;
	}

	/* --- filters --- */

	.filters {
		display: flex;
		align-items: center;
		gap: var(--s-7);
		margin-inline-start: auto;
	}
	.group {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	.warn {
		font-size: var(--t-2xs);
		color: var(--basis-unsubstantiated);
		white-space: nowrap;
	}
	.layers {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
	.lchip {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: var(--r-sm);
		border: 1px solid var(--border-subtle);
		background: var(--surface-sunken);
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			transform var(--dur-instant) var(--ease-out);
	}
	.lchip i {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		background: var(--c);
		opacity: 0.3;
		transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-spring);
	}
	.lchip.on {
		border-color: color-mix(in oklch, var(--c) 55%, transparent);
		background: color-mix(in oklch, var(--c) 14%, transparent);
	}
	.lchip.on i {
		opacity: 1;
		transform: scale(1.1);
	}
	.lchip:hover {
		transform: translateY(-1px);
	}

	/* --- timeline track --- */

	.track {
		position: relative;
		flex: 1;
		height: 34px;
		cursor: ew-resize;
		touch-action: none;
		/*
		   Clip sideways, bleed vertically.

		   The last era band's label and the rupture markers sit slightly past the end of
		   the track, which stretched the shell's scroll width and made the whole fixed
		   window pannable. `overflow: hidden` would fix that and also clip the playhead's
		   grip and year readout, which deliberately overhang the track above and below.
		   `overflow-x: clip` with `overflow-y: visible` is the one combination that does
		   only the half we want.
		*/
		overflow-x: clip;
		overflow-y: visible;
	}

	.density {
		position: absolute;
		inset: 0 0 12px 0;
		width: 100%;
		height: calc(100% - 12px);
		pointer-events: none;
	}

	.eras {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 12px;
		height: 100%;
		/*
		   The time axis runs left-to-right in every language — that is the documented
		   exception in i18n.ts, because reversing a chart's time axis makes it
		   unreadable to anyone who reads charts. The bands inherit that: without this,
		   `flex-start` resolves to the right in Arabic and every era's name hugs the
		   end of its span, so "Bourguiba" appeared at 1987 rather than 1956. The names
		   themselves are Latin (`label_en`), so nothing here is being mis-set.
		*/
		direction: ltr;
		/* The bands tile the entire track. If they accept pointer events they swallow
		   every drag, which silently breaks scrubbing across the whole timeline — the
		   band surface is decoration, only its label is a target. */
		pointer-events: none;
	}
	.era-band {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: flex-start;
		padding: 1px 0 0 4px;
		border-left: 1px solid color-mix(in oklch, var(--c) 45%, transparent);
		background: linear-gradient(
			to bottom,
			color-mix(in oklch, var(--c) 12%, transparent),
			transparent 70%
		);
		overflow: hidden;
		transition: background var(--dur-normal) var(--ease-out);
	}
	.era-band:hover,
	.era-band.current {
		background: linear-gradient(
			to bottom,
			color-mix(in oklch, var(--c) 26%, transparent),
			transparent 80%
		);
	}
	/* The label is the only part of a band that is clickable, so jumping to an era
	   stays available without the band blocking the scrub surface behind it. */
	.era-name {
		/* Ellipsis, not a mid-word cut. `nowrap` inside an `overflow: hidden` parent
		   truncates at whatever character happens to land on the edge, which reads as a
		   rendering fault rather than as an abbreviation. */
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		/* Era accents come from the data as fixed hex, chosen as period identity
		   colours rather than as text colours — several are far too dark to read on a
		   dark surface. Lifting them toward the foreground keeps the hue as
		   identification while making the label legible in either theme. */
		color: color-mix(in oklch, var(--c) 45%, var(--text-primary));
		white-space: nowrap;
		opacity: 0.75;
		pointer-events: auto;
		cursor: pointer;
		padding: 1px 3px;
		border-radius: var(--r-xs);
		transition: background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
	}
	.era-name:hover {
		opacity: 1;
		background: color-mix(in oklch, var(--c) 22%, transparent);
	}
	.era-band.current .era-name {
		opacity: 1;
		font-weight: 500;
	}

	.tick {
		position: absolute;
		bottom: 0;
		height: 11px;
		border-left: 1px solid var(--border-default);
		pointer-events: none;
	}
	.tick-label {
		position: absolute;
		bottom: -1px;
		left: 3px;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	/* The button is a generous invisible band; the diamond inside it is the mark.
	   Separating the two is what lets the target be thumb-sized without drawing a
	   thumb-sized shape on a track that is only 34px tall. */
	.rupture {
		position: absolute;
		top: 0;
		bottom: 11px;
		width: 18px;
		margin-left: -9px;
		display: grid;
		place-items: end center;
		padding-bottom: 2px;
	}
	.rupture i {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		background: var(--rupture);
		border: 1px solid color-mix(in oklch, var(--rupture) 55%, black);
		transform: rotate(45deg);
		transition:
			transform var(--dur-fast) var(--ease-spring),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.rupture:hover i,
	.rupture.lit i,
	.rupture:focus-visible i {
		transform: rotate(45deg) scale(1.55);
		box-shadow: 0 0 0 4px var(--rupture-soft);
	}

	.rupture-name {
		position: absolute;
		/* Above the track, not on it. Both readouts used to land on the era band row and
		   cover the very label the reader was trying to place themselves against. The
		   track clips horizontally only, so overflowing upward is allowed. */
		bottom: calc(100% - 2px);
		transform: translateX(-50%);
		z-index: 6;
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		max-width: 40ch;
		padding: 2px var(--s-4);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--t-2xs);
		color: var(--text-primary);
		background: var(--surface-overlay);
		border: 1px solid color-mix(in oklch, var(--rupture) 45%, var(--border-default));
		border-radius: var(--r-sm);
		box-shadow: var(--elev-2);
		pointer-events: none;
		animation: fade-in var(--dur-instant) var(--ease-out);
	}
	.rupture-name b {
		font-weight: 500;
		color: var(--rupture);
	}
	/*
	   No RTL transform override here, deliberately.

	   This element is anchored with a physical `left` and centred with
	   `translateX(-50%)`. Neither flips in Arabic, so the pair is already correct —
	   an override would move it half its own width the wrong way. Overrides belong
	   only where the anchor itself is a logical property.
	*/

	/* --- scrub preview --- */

	/* The marker riding the density curve. */
	.coverage {
		position: absolute;
		width: 7px;
		height: 7px;
		margin-left: -3.5px;
		margin-bottom: -3.5px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 2px var(--surface-panel);
		pointer-events: none;
		transition: bottom var(--dur-fast) var(--ease-out);
	}
	.coverage.ghosted {
		background: var(--text-faint);
		box-shadow: 0 0 0 2px var(--surface-panel);
		transition: none;
	}

	.ghost {
		position: absolute;
		top: 0;
		bottom: 11px;
		width: 1px;
		margin-left: -0.5px;
		background: var(--text-faint);
		opacity: 0.55;
		pointer-events: none;
	}
	.preview {
		position: absolute;
		bottom: calc(100% - 2px);
		transform: translateX(-50%);
		z-index: 5;
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		padding: 2px var(--s-4);
		white-space: nowrap;
		font-size: var(--t-2xs);
		color: var(--text-secondary);
		background: color-mix(in oklch, var(--surface-overlay) 94%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		box-shadow: var(--elev-2);
		backdrop-filter: blur(6px);
		pointer-events: none;
	}
	.preview b {
		font-weight: 540;
		color: var(--text-primary);
	}
	.p-meta {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		color: var(--text-faint);
	}

	.playhead {
		position: absolute;
		top: -3px;
		bottom: 9px;
		width: 2px;
		margin-left: -1px;
		background: var(--text-primary);
		border-radius: var(--r-full);
		cursor: ew-resize;
		box-shadow: 0 0 12px color-mix(in oklch, var(--accent) 45%, transparent);
	}
	.playhead .grip {
		position: absolute;
		left: 50%;
		top: -4px;
		transform: translateX(-50%);
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 3px var(--surface-panel);
		transition: transform var(--dur-fast) var(--ease-spring);
	}
	.playhead.dragging .grip {
		transform: translateX(-50%) scale(1.35);
	}
	/*
	   The year sits under the playhead, in the same strip as the decade ticks, and used
	   to overlap them whenever the reader parked near one — two numbers on top of each
	   other, one of which is the app's primary state. Giving it the panel colour as a
	   background and a hairline lets it occlude the tick cleanly instead.
	*/
	.head-year {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		bottom: -14px;
		font-size: var(--t-2xs);
		font-weight: 560;
		line-height: 1.5;
		color: var(--accent-text);
		background: var(--accent);
		padding: 0 4px;
		border-radius: var(--r-xs);
		pointer-events: none;
	}

	/* --- the collapsed filter control, phones only --- */

	.anchor {
		position: relative;
		margin-inline-start: auto;
	}
	.filter-btn {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		height: 30px;
		padding: 0 var(--s-5);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
	}
	.filter-btn:hover,
	.filter-btn.on {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	/* A dot when the reader has moved off the default evidence standard or hidden a
	   layer. Without it, a filtered map behind a closed sheet looks like the data. */
	.filter-btn.dirty::after {
		content: '';
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
	}
	.filter-sheet {
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
		padding: var(--s-6);
		min-width: 240px;
	}
	.filter-sheet .group {
		flex-direction: column;
		align-items: stretch;
		gap: var(--s-4);
	}
	.filter-sheet .layers {
		gap: var(--s-4);
	}
	/* Thumb-sized in the sheet. The 22px version is a pointer-precision control and
	   has no business being the only way to change a layer on a phone. */
	.filter-sheet .lchip {
		width: 34px;
		height: 34px;
	}
	.filter-sheet .lchip i {
		width: 13px;
		height: 13px;
	}

	@media (max-width: 1280px) {
		.filters {
			gap: var(--s-5);
		}
		.warn {
			display: none;
		}
	}

	/*
		Phones. The dock keeps a fixed two-row height that matches --dock-h, because the
		Inspector sheet and the views both position themselves against that token — a
		dock that grows by wrapping silently overlaps whatever trusted it.
	*/
	@media (max-width: 900px) {
		.controls {
			height: 32px;
			gap: var(--s-4);
			padding: 0 var(--s-5);
		}
		.timeline {
			padding: 0 var(--s-4);
		}
		.transport {
			gap: var(--s-4);
			min-width: 0;
		}
		.readout {
			min-width: 0;
		}
		.date {
			font-size: var(--t-base);
		}
		/* The era name and live count are the first things to go: the era is already
		   named on the track itself, directly under the playhead. */
		.meta {
			display: none;
		}
		.speed {
			display: none;
		}
		.track {
			height: 40px;
		}
		/* A bigger grip and a wider playhead, because this is now a thumb target. */
		.playhead {
			width: 3px;
		}
		.playhead .grip {
			width: 14px;
			height: 14px;
			top: -5px;
		}
		.era-name {
			font-size: 8px;
		}
		.tick-label {
			font-size: 8px;
		}
		/* The home-indicator inset is added to the height rather than taken out of it,
		   so the track keeps its full thumb-sized depth on hardware that has one. */
		.dock {
			height: calc(var(--dock-h) + var(--safe-b));
			padding-bottom: var(--safe-b);
		}
	}
</style>
