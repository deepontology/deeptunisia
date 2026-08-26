<script lang="ts">
	/**
	 * SidebarTimeline — an era indicator, not a table of contents.
	 *
	 * Shows where the reader is in time, not what every event is called.
	 * A large current-era header (section kicker + title) sits above a
	 * compact vertical rail. Events are tiny date+dot rows; only the
	 * current section's events expand to show their description.
	 */

	import type { TimelineEvent } from '$lib/media/types';

	interface Props {
		events: TimelineEvent[];
		currentSection: string | null;
		oneventclick: (sectionId: string) => void;
		sectionTitles?: Record<string, string>;
	}

	let { events, currentSection, oneventclick, sectionTitles = {} }: Props = $props();

	const sortKey = (s: unknown) => String(s ?? '').replace(/[^0-9A-Za-z]/g, '');
	const sorted = $derived(
		[...events].sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)))
	);

	const grouped = $derived.by(() => {
		const map = new Map<string, TimelineEvent[]>();
		const order: string[] = [];
		for (const e of sorted) {
			const sec = (e.section as string) ?? '—';
			if (!map.has(sec)) {
				map.set(sec, []);
				order.push(sec);
			}
			map.get(sec)!.push(e);
		}
		// order by id so S01 < S02 < S10, not insertion order if timeline file is unsorted
		order.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
		return order.map((sec) => ({ section: sec, title: sectionTitles[sec] ?? '', events: map.get(sec)! }));
	});

	const current = $derived(grouped.find((g) => g.section === currentSection) ?? grouped[0] ?? null);
	const currentIdx = $derived(current ? grouped.findIndex((g) => g.section === current!.section) : -1);
</script>

<div class="timeline" role="navigation" aria-label="Article timeline">
	{#if current}
		<div class="era-head" aria-live="polite">
			<span class="era-kicker">{current.section}</span>
			{#if current.title}
				<span class="era-title">{current.title}</span>
			{/if}
			<span class="era-progress">{currentIdx + 1} / {grouped.length}</span>
		</div>
	{/if}

	<div class="tracks">
		<div class="rail" aria-hidden="true"></div>

		{#each grouped as group (group.section)}
			<div class="group" class:active={group.section === currentSection}>
				<button class="group-head" onclick={() => oneventclick(group.section)} aria-label="Jump to {group.section}">
					<span class="group-dot" aria-hidden="true"></span>
					<span class="group-id">{group.section}</span>
					{#if group.title}
						<span class="group-title">{group.title}</span>
					{/if}
					<span class="group-count">{group.events.length}</span>
				</button>

				{#if group.section === currentSection}
					<div class="group-events">
						{#each group.events as ev (ev.id)}
							<div class="ev">
								<span class="ev-date">{ev.date}</span>
								<span class="ev-dot" class:air={ev.layer === 'air'} aria-hidden="true"></span>
								<span class="ev-desc">{ev.description.en ?? ''}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="group-dots" aria-hidden="true">
						{#each group.events as ev (ev.id)}
							<span class="mini-dot" class:air={ev.layer === 'air'}></span>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.timeline {
		font-size: var(--t-xs);
	}

	/* Current era — the reader's position in the story's time. */
	.era-head {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
		margin: 0 0 var(--s-3);
		background: color-mix(in oklch, var(--accent) 7%, var(--surface-raised));
		border-inline-start: 2px solid var(--accent);
		border-radius: var(--r-sm);
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-2) var(--s-3);
	}
	.era-kicker {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 700;
		letter-spacing: var(--track-caps);
		color: var(--accent);
	}
	.era-title {
		font-family: var(--font-serif);
		font-size: var(--t-sm);
		font-weight: 400;
		color: var(--text-primary);
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.era-progress {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-inline-start: auto;
	}

	.tracks {
		position: relative;
		padding-inline-start: var(--s-1);
	}
	.rail {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 7px;
		width: 1px;
		background: var(--border-subtle);
	}

	.group {
		position: relative;
		padding: var(--s-1) 0 var(--s-2);
		border-radius: var(--r-sm);
		transition: background var(--dur-fast) var(--ease-out);
	}
	.group.active {
		background: color-mix(in oklch, var(--accent) 6%, transparent);
	}

	.group-head {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		width: 100%;
		padding: var(--s-1) var(--s-2);
		background: none;
		border: none;
		cursor: pointer;
		text-align: start;
		border-radius: var(--r-xs);
	}
	.group-head:hover {
		background: var(--surface-hover);
	}

	.group-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--border-strong);
		flex-shrink: 0;
		margin-inline-start: 1px;
		transition:
			background var(--dur-fast) var(--ease-out),
			transform var(--dur-fast) var(--ease-spring),
			box-shadow var(--dur-fast) var(--ease-out);
	}
	.group.active .group-dot {
		background: var(--accent);
		transform: scale(1.25);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 18%, transparent);
	}

	.group-id {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 700;
		color: var(--text-faint);
	}
	.group.active .group-id {
		color: var(--accent);
	}

	.group-title {
		font-size: var(--t-xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}
	.group.active .group-title {
		color: var(--text-primary);
	}

	.group-count {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-faint);
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		padding: 0 5px;
		line-height: 1.6;
	}

	/* Collapsed groups: just a row of tiny dots. */
	.group-dots {
		display: flex;
		gap: 3px;
		padding: 2px 0 2px 26px;
		flex-wrap: wrap;
	}
	.mini-dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--border-strong);
		opacity: 0.5;
	}
	.mini-dot.air {
		background: var(--text-faint);
	}

	/* Expanded group: event rows. */
	.group-events {
		padding: 4px 0 2px 26px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.ev {
		display: grid;
		grid-template-columns: 52px 10px 1fr;
		align-items: start;
		gap: 0;
		padding: 1px 0;
	}
	.ev-date {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--text-faint);
		text-align: end;
		padding-inline-end: 6px;
		white-space: nowrap;
		line-height: 1.6;
	}
	.ev-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--border-strong);
		margin-top: 5px;
		justify-self: center;
	}
	.ev-dot.air {
		background: var(--text-faint);
	}
	.ev-desc {
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-muted);
		padding-inline-start: 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
