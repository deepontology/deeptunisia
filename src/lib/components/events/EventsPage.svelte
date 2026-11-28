<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import AboutView from '$lib/shell/AboutView.svelte';
	import { app } from '$lib/state.svelte';
	import { t, eventCategoryLabel } from '$lib/t.svelte';
	import { nameOf } from '$lib/names.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { applyEntityLink, rewriteUrl } from '$lib/deeplink.svelte';
	import { ds, personById, institutionById } from '$lib/model';
	import { eventEnd } from '$lib/chronicle/events';
	import EventsTimeline from './EventsTimeline.svelte';
	import EventsList from './EventsList.svelte';
	import EventsRings from './EventsRings.svelte';
	import FaceSwitch from './FaceSwitch.svelte';
	import { EventsView, FACES, FIRST_YEAR, LENS_PRESETS, ew, lensStart, parseFace, parseThread, type Face, type Thread } from './view.svelte';

	/**
	 * The events page: every recorded event, inside the instrument.
	 *
	 * One state (`EventsView`) and the faces that draw it. Above the faces sits
	 * what they share: which categories are in, ruptures only, a person or
	 * institution being followed, and the years in view. The selected event is
	 * the app's selection, so the Inspector opens it here as on every view.
	 *
	 * The address bar carries what a shared link needs: `?view=` for the face,
	 * `?actor=` or `?institution=` for a followed thread (the links record pages
	 * print), and `?id=` for the open record.
	 */

	const view = new EventsView();

	onMount(() => {
		const params = page.url.searchParams;
		view.face = parseFace(params.get('view'));
		view.thread = parseThread(params);
		applyEntityLink();
	});

	function setFace(f: Face) {
		view.face = f;
		rewriteUrl((u) => {
			if (f === FACES[0]) u.searchParams.delete('view');
			else u.searchParams.set('view', f);
		});
	}

	function follow(th: Thread) {
		view.thread = th;
		rewriteUrl((u) => {
			u.searchParams.delete(th.kind === 'actor' ? 'institution' : 'actor');
			u.searchParams.set(th.kind, th.id);
		});
	}

	function clearThread() {
		view.thread = null;
		rewriteUrl((u) => {
			u.searchParams.delete('actor');
			u.searchParams.delete('institution');
		});
	}

	function resetAll() {
		if (view.thread) clearThread();
		view.clear();
	}

	const faceLabels: Record<Face, string> = $derived({ timeline: ew('events.face.timeline'), rings: ew('events.face.rings') });

	/*
	 * Category counts in the years shown, under every filter but the category
	 * itself, so a chip says how many events switching it on would bring back.
	 */
	const categories = $derived.by(() => {
		const from = lensStart(view.lens);
		const m = new Map<string, number>();
		for (const e of ds.events) {
			if (eventEnd(e) < from) continue;
			if (!view.passes(e, app.basisFloor, true)) continue;
			m.set(e.category, (m.get(e.category) ?? 0) + 1);
		}
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	});

	const threadName = $derived.by(() => {
		const th = view.thread;
		if (!th) return '';
		return nameOf(personById.get(th.id)) || nameOf(institutionById.get(th.id)) || th.id;
	});

	const hint = $derived(
		view.face === 'rings'
			? compact.current
				? ew('events.hint.rings.compact')
				: ew('events.hint.rings')
			: compact.current
				? ew('events.hint.compact')
				: ew('events.hint')
	);

	const lensLabel = (y: number) => (y <= FIRST_YEAR ? ew('events.lens.all') : ew('events.lens.since', { year: y }));
</script>

<div class="events">
	<div class="toolbar">
		<span class="eyebrow">{t('nav.events')}</span>
		{#if FACES.length > 1}
			<FaceSwitch
				value={view.face}
				options={FACES.map((f) => ({ value: f, label: faceLabels[f] }))}
				label={ew('events.face')}
				onchange={setFace}
			/>
		{/if}
		<AboutView hint={hint} />
	</div>

	<div class="filters" role="group" aria-label={ew('events.filters')}>
		<div class="row" role="group" aria-label={ew('events.lens')}>
			{#each LENS_PRESETS as y (y)}
				<button
					type="button"
					class="chip"
					class:on={view.lens === y && view.atCutoff}
					aria-pressed={view.lens === y && view.atCutoff}
					onclick={() => view.setLens(y)}>{lensLabel(y)}</button
				>
			{/each}
		</div>
		<span class="sep" aria-hidden="true"></span>
		<div class="row" role="group" aria-label={t('record.category')}>
			<button
				type="button"
				class="chip"
				class:on={view.hiddenCats.size === 0}
				aria-pressed={view.hiddenCats.size === 0}
				onclick={() => (view.hiddenCats = new Set())}>{t('feed.all')}</button
			>
			{#each categories as [cat, n] (cat)}
				<button
					type="button"
					class="chip"
					class:off={view.hiddenCats.has(cat)}
					aria-pressed={!view.hiddenCats.has(cat)}
					onclick={() => view.toggleCat(cat)}
				>
					{eventCategoryLabel(cat)} <span class="n mono">{n}</span>
				</button>
			{/each}
		</div>
		<span class="sep" aria-hidden="true"></span>
		<button
			type="button"
			class="chip rupture"
			class:on={view.rupturesOnly}
			aria-pressed={view.rupturesOnly}
			onclick={() => (view.rupturesOnly = !view.rupturesOnly)}
		>
			<i class="diamond" aria-hidden="true"></i>{t('record.rupture')}
		</button>
		{#if view.thread}
			<span class="thread">
				<span dir="auto">{view.thread.kind === 'actor' ? ew('events.thread.actor', { name: threadName }) : ew('events.thread.institution', { name: threadName })}</span>
				<button type="button" class="thread-x" onclick={clearThread} aria-label={ew('events.thread.remove', { name: threadName })}>×</button>
			</span>
		{/if}
		<span class="count mono" aria-live="polite">{ew('events.shown', { shown: view.shown, total: ds.events.length })}</span>
		{#if view.filtered}
			<button type="button" class="chip reset" onclick={resetAll}>{ew('events.reset')}</button>
		{/if}
	</div>

	{#if view.face === 'rings'}
		<EventsRings {view} onfollow={follow} onunfollow={clearThread} />
	{:else if browser && compact.current}
		<EventsList {view} />
	{:else}
		<EventsTimeline {view} />
	{/if}
</div>

<style>
	.events {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--s-6);
		padding: var(--s-4) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}
	.filters {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.filters::-webkit-scrollbar {
		display: none;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		flex-shrink: 0;
	}
	.chip {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		padding: 2px 9px;
		font-size: var(--t-2xs);
		color: var(--text-secondary);
		background: var(--surface-raised);
		white-space: nowrap;
	}
	.chip:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.chip.on {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}
	.chip.off {
		color: var(--text-faint);
		border-style: dashed;
	}
	.chip:focus-visible,
	.thread-x:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.n {
		color: var(--text-faint);
	}
	.diamond {
		width: 6px;
		height: 6px;
		transform: rotate(45deg);
		background: var(--rupture);
	}
	.chip.on .diamond {
		background: var(--accent-text);
	}
	.sep {
		flex-shrink: 0;
		width: 1px;
		height: 14px;
		background: var(--border-default);
		margin-inline: var(--s-2);
	}
	.thread {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		padding: 1px 2px 1px 9px;
		border: 1px solid var(--accent-border);
		border-radius: var(--r-sm);
		font-size: var(--t-2xs);
		color: var(--text-primary);
		white-space: nowrap;
	}
	.thread-x {
		padding: 0 6px;
		color: var(--text-muted);
		font-size: var(--t-sm);
		line-height: 1;
	}
	.thread-x:hover {
		color: var(--text-primary);
	}
	.count {
		flex-shrink: 0;
		margin-inline-start: auto;
		padding-inline-start: var(--s-4);
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.reset {
		color: var(--accent);
		border-color: var(--accent-border);
	}

	@media (max-width: 900px) {
		.toolbar {
			padding: var(--s-3) var(--s-4);
			gap: var(--s-4);
		}
		.filters {
			padding: var(--s-2) var(--s-4);
		}
	}
</style>
