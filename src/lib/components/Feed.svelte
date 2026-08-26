<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { nameOf, t, formatDate } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import Chip from '$lib/ui/Chip.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Content from '$lib/ui/Content.svelte';
	import { ds, institutionById, personById } from '$lib/model';
	import { feedItems, feedNotice, type FeedItem } from '$lib/feed';
	import { buildMatcher, type Match, type MatchEntity } from '$lib/match';

	/**
	 * Third-party headlines, linked into the graph.
	 *
	 * ── The rule this page exists to obey ─────────────────────────────────────
	 *
	 * None of this is DeepTunisia's data. The project has not read these articles,
	 * has not checked them, and takes no position on whether any of them is true.
	 * Every other surface on this site renders claims the project stands behind and
	 * grades; this one renders links to what other people published, and the design
	 * has to make that impossible to miss rather than merely stating it once.
	 *
	 * Hence: no basis chips, no confidence grades, no evidence dial, no counts that
	 * feed any statistic. Headlines are never restated as project prose, and the
	 * only route to an article is the outlet's own link.
	 *
	 * ── Entity links are navigation, never assertion ──────────────────────────
	 *
	 * A matched name is a jump to that entity's record. It is NOT a claim that the
	 * article is about them, that they did what the headline describes, or that any
	 * relationship exists. Matching is deterministic string comparison — never a
	 * language model — so a link can always be explained by the surface form that
	 * produced it.
	 *
	 * Surname-only matches are deliberately excluded. The matcher can only measure a
	 * name's distinctiveness against the 310 people in the graph, and Tunisia has
	 * around twelve million: on real headlines the rule linked a 2012 finance
	 * minister to a story about solar batteries, and an LTDH president to one about
	 * closed restaurants, purely on a shared surname. See scripts/test-match.ts,
	 * which pins that decision.
	 */

	const entities: MatchEntity[] = [
		...ds.people.map((p) => ({
			id: p.id,
			kind: 'person' as const,
			names: [p.name_en, p.name_fr, p.name_ar, ...(p.aliases ?? [])].filter(Boolean) as string[]
		})),
		...ds.institutions.map((i) => ({
			id: i.id,
			kind: 'institution' as const,
			names: [i.name_en, i.name_fr, i.name_ar].filter(Boolean) as string[]
		}))
	];

	const matcher = buildMatcher(entities);

	/** Surname-only links are refused here. See the note above. */
	const linksFor = (title: string): Match[] =>
		matcher.find(title).filter((x) => x.rule !== 'surname');

	interface Segment {
		text: string;
		match: Match | null;
	}

	/** Split a headline into plain runs and linked runs, preserving the original text. */
	function segments(title: string): Segment[] {
		const found = linksFor(title);
		if (found.length === 0) return [{ text: title, match: null }];
		const out: Segment[] = [];
		let at = 0;
		for (const mt of found) {
			if (mt.start > at) out.push({ text: title.slice(at, mt.start), match: null });
			out.push({ text: title.slice(mt.start, mt.end), match: mt });
			at = mt.end;
		}
		if (at < title.length) out.push({ text: title.slice(at), match: null });
		return out;
	}

	const OUTLETS = [...new Set(feedItems.map((i) => i.outlet))].sort();
	const LANGS = [...new Set(feedItems.map((i) => i.lang))].sort();

	let outletFilter = $state<string | 'all'>('all');
	let langFilter = $state<string | 'all'>('all');
	let onlyLinked = $state(false);

	const rows = $derived.by(() => {
		let list = feedItems;
		if (outletFilter !== 'all') list = list.filter((i) => i.outlet === outletFilter);
		if (langFilter !== 'all') list = list.filter((i) => i.lang === langFilter);
		if (onlyLinked) list = list.filter((i) => linksFor(i.title).length > 0);
		return list;
	});

	const linkedCount = $derived(feedItems.filter((i) => linksFor(i.title).length > 0).length);

	/** An entity id to a display name, in the reader's language. */
	const labelFor = (id: string) =>
		nameOf(personById.get(id)) || nameOf(institutionById.get(id)) || id;

	function when(iso: string): string {
		return formatDate(new Date(iso).getTime());
	}

	const newest = $derived(feedItems[0]?.published ?? null);
</script>

<div class="feed">
	<div class="toolbar">
		<span class="eyebrow">{t('feed.eyebrow')}</span>
		<p class="hint">
			{t('feed.hint')}
			{#if newest}
				{format(app.locale, 'feed.latest', { date: when(newest) })}
			{/if}
		</p>
	</div>

	<div class="scroll">
		<p class="notice">{feedNotice}</p>

		<div class="controls">
			<div class="outlets" role="group" aria-label={t('feed.outletAria')}>
				<button class:on={outletFilter === 'all'} onclick={() => (outletFilter = 'all')}>
					{t('feed.all')} <span class="n">{feedItems.length}</span>
				</button>
				{#each OUTLETS as o (o)}
					<button class:on={outletFilter === o} onclick={() => (outletFilter = o)}>{o}</button>
				{/each}
			</div>
			<div class="outlets langs" role="group" aria-label={t('feed.langAria')}>
				<button class:on={langFilter === 'all'} onclick={() => (langFilter = 'all')}>
					{t('feed.all')} <span class="n">{feedItems.length}</span>
				</button>
				{#each LANGS as l (l)}
					<button class:on={langFilter === l} onclick={() => (langFilter = l)} class="lang-tag mono">{l}</button>
				{/each}
			</div>
			<label class="linked">
				<input type="checkbox" bind:checked={onlyLinked} />
				{t('feed.onlyLinked')}
				<span class="n">{linkedCount}</span>
			</label>
		</div>

		<ol class="items">
			{#each rows as item (item.id)}
				<li>
					<div class="meta">
						<time datetime={item.published}>{when(item.published)}</time>
						<span class="outlet">{item.outlet}</span>
						<span class="lang mono">{item.lang}</span>
					</div>

					<p class="title" dir={item.lang === 'ar' ? 'rtl' : 'ltr'}>
						{#each segments(item.title) as seg}
							{#if seg.match}
								<Tooltip content={format(app.locale, 'feed.openEntity', { name: labelFor(seg.match.id) })}>
									<button
										class="ent"
										class:sel={app.selected === seg.match.id}
										onclick={() => app.select(seg.match!.id)}
									>{seg.text}</button>
								</Tooltip>
							{:else}{seg.text}{/if}
						{/each}
					</p>

					<a class="src" href={item.link} target="_blank" rel="noopener noreferrer nofollow">
						{format(app.locale, 'feed.readAt', { outlet: item.outlet })} <span aria-hidden="true">↗</span>
					</a>
				</li>
			{/each}
		</ol>

		{#if rows.length === 0}
			<p class="empty">{t('feed.empty')}</p>
		{/if}

		<div class="foot">
			<Content view="feed" section="foot" params={{ people: ds.people.length }} />
		</div>
	</div>
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.toolbar {
		display: flex;
		align-items: baseline;
		gap: var(--s-5);
		padding: var(--s-4) var(--s-6);
		border-bottom: 1px solid var(--border-subtle);
		flex-wrap: wrap;
	}
	.hint {
		margin: 0;
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
		max-width: 68ch;
	}
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: var(--s-6) var(--s-6) var(--s-11);
	}

	/* The disclaimer is not a footnote. It is the first thing on the page and it
	   carries the inferred tint, which everywhere else on this site means "do not
	   read this as established". */
	.notice {
		max-width: 88ch;
		margin: 0 0 var(--s-6);
		padding: var(--s-4) var(--s-5);
		border-inline-start: 2px solid var(--basis-inferred);
		background: color-mix(in oklch, var(--basis-inferred) 7%, transparent);
		font-size: var(--t-xs);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-5);
		margin-block-end: var(--s-6);
	}
	.outlets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.outlets button {
		font: inherit;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		background: var(--surface-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-sm);
		padding: var(--s-3) var(--s-4);
		cursor: pointer;
	}
	.outlets button:hover {
		background: var(--surface-hover);
	}
	.outlets button.on {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}
	.outlets .n,
	.linked .n {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
		margin-inline-start: var(--s-2);
	}
	.linked {
		display: inline-flex;
		align-items: center;
		gap: var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 900px;
		display: grid;
		gap: 1px;
		background: var(--border-subtle);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		overflow: hidden;
	}
	.items li {
		background: var(--surface-raised);
		padding: var(--s-4) var(--s-5);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		margin-block-end: var(--s-3);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.outlet {
		color: var(--text-muted);
	}
	.lang {
		margin-inline-start: auto;
		text-transform: uppercase;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-xs);
		padding: 0 4px;
		line-height: 1.6;
	}
	.langs {
		margin-block-start: 6px;
	}
	.lang-tag {
		text-transform: uppercase;
		font-size: var(--t-2xs);
	}

	.title {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		line-height: 1.6;
		color: var(--text-primary);
	}

	/* A linked name is underlined, not filled. Anything that reads as a badge would
	   look like an assessment, and no assessment has been made. */
	.ent {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
		text-decoration-color: var(--accent);
	}
	.ent:hover,
	.ent.sel {
		text-decoration-style: solid;
		color: var(--accent-text-strong, var(--text-primary));
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		border-radius: var(--r-xs);
	}
	.ent:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
		border-radius: var(--r-xs);
	}

	.src {
		font-size: var(--t-2xs);
		color: var(--text-muted);
		text-decoration: none;
	}
	.src:hover {
		color: var(--text-secondary);
		text-decoration: underline;
	}

	.empty,
	.foot {
		max-width: 88ch;
		margin-block-start: var(--s-6);
		font-size: var(--t-xs);
		line-height: 1.7;
		color: var(--text-muted);
	}
</style>
