<script lang="ts">
	/**
	 * Agora — discussion and proposed changes, inside the atlas.
	 *
	 * Not a separate site. Same shell, same tokens, same primitives, same origin —
	 * a reader moves between a record and the argument about it without leaving the
	 * app, which is the binding the whole extension exists for.
	 *
	 * This file orchestrates and does not render. Every view is a component in
	 * `$lib/agora/`; what lives here is the URL, the fetches, and the optimistic
	 * bookkeeping that has to survive across them.
	 *
	 * EVERYTHING ADDRESSABLE IS IN THE URL
	 *
	 * `?tab`, `?thread`, `?pr`, `?compose`, `?propose`. It used to be `?tab` and
	 * component state, so a thread could not be linked, the back button did nothing
	 * inside Agora, and a refresh dropped you on the list. DESIGN.md had already
	 * settled this argument for connections — "that is how somebody cites the
	 * specific edge they are disputing, instead of describing where on the graph to
	 * look" — and a thread is a record of a dispute, so the reasoning transfers
	 * unchanged.
	 *
	 * The page renders on the client only. The atlas is prerendered and the API is
	 * answered by the community worker at /api, so there is nothing to render at
	 * build time and nothing here that the static build depends on.
	 *
	 * GATED
	 *
	 * The whole client below sits behind `AGORA_OPEN` in `$lib/agora-gate.ts`.
	 * While the flag is `false` the page renders a coming-soon banner and the
	 * script's guards keep it off the API entirely — no identity, no fetches.
	 * Flip the flag to `true` and this page becomes the live client again; flip
	 * it back and the section closes everywhere at once (banner, badge, doors).
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import ThreadList from '$lib/agora/ThreadList.svelte';
	import ThreadView from '$lib/agora/ThreadView.svelte';
	import NewThread from '$lib/agora/NewThread.svelte';
	import ProposalList from '$lib/agora/ProposalList.svelte';
	import ProposalView from '$lib/agora/ProposalView.svelte';
	import ProposalForm from '$lib/agora/ProposalForm.svelte';
	import EmptyState from '$lib/agora/EmptyState.svelte';
	import PrivacyNotice from '$lib/agora/PrivacyNotice.svelte';
	import Identity from '$lib/agora/Identity.svelte';
	import Author from '$lib/agora/Author.svelte';
	import { t } from '$lib/t.svelte';
	import {
		agora,
		send,
		read,
		burnIdentity,
		refreshIdentity,
		messageFor,
		OfflineError
	} from '$lib/agora.svelte';
	import { targetName as nameOfTarget } from '$lib/model';
	import type { MentionSpan } from '$lib/agora/markdown';
	import type { Thread, Post, Pr, Mention, QueueItem, ListResponse } from '$lib/community';
	import { AGORA_OPEN } from '$lib/agora-gate';

	/* ---- URL is the state ---- */

	const params = $derived(page.url.searchParams);
	const tab = $derived(params.get('tab') ?? 'discussion');
	const threadId = $derived(params.get('thread'));
	const prId = $derived(params.get('pr'));
	const composing = $derived(params.has('compose'));
	const proposing = $derived(params.has('propose'));
	const identityOpen = $derived(params.has('identity'));
	const sort = $derived(params.get('sort') ?? 'trending');

	/** The record this was opened against, if the reader came from an entity card. */
	const target = $derived.by(() => {
		const type = params.get('target_type');
		const id = params.get('target_id');
		if (!type || !id) return null;
		return {
			type,
			id,
			// Relationship ids render as "A → B"; fall back to whatever the card sent.
			label: nameOfTarget(type, id) ?? params.get('label') ?? id
		};
	});

	function go(patch: Record<string, string | null>, replace = false) {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(patch)) {
			if (v === null) next.delete(k);
			else next.set(k, v);
		}
		void goto(`/agora?${next}`, { replaceState: replace, noScroll: true, keepFocus: true });
	}

	/* ---- data ---- */

	let threads = $state<Thread[]>([]);
	let posts = $state<Post[]>([]);
	let mentions = $state<Mention[]>([]);
	let prs = $state<Pr[]>([]);
	let queue = $state<QueueItem[]>([]);
	let openThread = $state<Thread | null>(null);
	let openPr = $state<Pr | null>(null);

	let loading = $state(false);
	let error = $state('');
	/** This browser's own votes, so the arrows can show which way it went. */
	let votes = $state<Record<string, 1 | -1>>({});

	const canLink = $derived(agora.can.postLinks !== false);

	/**
	 * Run a request, and report what actually failed.
	 *
	 * `agora.offline` is set by the transport itself, so an unreachable API is a
	 * fact about the page rather than about the action — which is why it is not
	 * folded into `error`. Everything else keeps the server's own wording: those
	 * messages are written carefully and were previously being thrown away in
	 * favour of a blanket "the community server is not running".
	 */
	async function run<T>(fn: () => Promise<T>): Promise<T | null> {
		loading = true;
		error = '';
		try {
			return await fn();
		} catch (e) {
			if (!(e instanceof OfflineError)) error = messageFor(e) ?? '';
			return null;
		} finally {
			loading = false;
		}
	}

	async function loadThreads() {
		const q = new URLSearchParams({ sort });
		if (target) {
			q.set('target_type', target.type);
			q.set('target_id', target.id);
		}
		const r = await run(() => read<ListResponse<Thread>>(`/api/threads?${q}`));
		if (r) threads = r.items;
	}

	async function loadThread(id: string) {
		// Paginated (spec §15.3 R5): the server returns a bounded page plus an
		// opaque keyset cursor; walk it until the thread is fully loaded.
		const allPosts: Post[] = [];
		let cursor: string | null = null;
		do {
			const q = new URLSearchParams({ thread_id: id });
			if (cursor) q.set('cursor', cursor);
			const r = await run(() => read<ListResponse<Post>>(`/api/posts?${q}`));
			if (!r) return;
			allPosts.push(...r.items);
			cursor = r.next_cursor ?? null;
		} while (cursor);
		posts = allPosts;
		openThread =
			threads.find((t) => t.id === id) ??
			// Arrived by permalink with no list loaded. Fetch enough to title the page.
			(await (async () => {
				const all = await run(() => read<ListResponse<Thread>>('/api/threads?sort=recent'));
				return all?.items.find((t) => t.id === id) ?? null;
			})());

		const ids = posts.map((p) => p.id).join(',');
		if (ids) {
			const m = await run(() => read<ListResponse<Mention>>(`/api/mentions?posts=${ids}`));
			mentions = m?.items ?? [];
		}
	}

	async function loadProposals() {
		const q = target ? `?target_id=${encodeURIComponent(target.id)}` : '';
		const r = await run(() => read<ListResponse<Pr>>(`/api/prs${q}`));
		if (r) prs = r.items;
	}

	async function loadProposal(id: string) {
		const r = await run(() => read<Pr>(`/api/pr?id=${encodeURIComponent(id)}`));
		if (r) openPr = r;
	}

	async function loadQueue() {
		const r = await run(() => read<ListResponse<QueueItem>>('/api/queue'));
		if (r) queue = r.items;
	}

	/* ---- writes ---- */

	async function post(
		body: string,
		spans: MentionSpan[],
		parent: string | null,
		burn: boolean
	): Promise<boolean> {
		if (!openThread) return false;
		const who = burn ? await burnIdentity() : undefined;
		// Mentions travel with the post: one signed action, one rate-limit unit, and
		// no state where a post exists with only some of its links. See the API.
		const r = await run(() =>
			send(
				'/api/post',
				{
					thread_id: openThread!.id,
					body,
					parent_id: parent,
					mentions: spans.map((s) => ({ entity_id: s.id, start: s.start, end: s.end }))
				},
				who
			)
		);
		if (!r) return false;
		if (r.status !== 200) {
			error = r.body.error;
			return false;
		}
		await loadThread(openThread.id);
		return true;
	}

	async function createThread(v: { title: string; kind: string; type: string; id: string | null }) {
		const r = await run(() =>
			send('/api/thread', {
				title: v.title,
				kind: v.kind,
				target_type: v.type,
				target_id: v.id
			})
		);
		if (!r) return;
		if (r.status !== 200) {
			error = r.body.error;
			return;
		}
		go({ compose: null, thread: r.body.id });
	}

	/**
	 * Optimistic voting.
	 *
	 * The count moves immediately and the whole thread is no longer refetched for
	 * one arrow. A refusal rolls it back and shows the server's reason, which is the
	 * only case where the reader learns anything from a round trip.
	 */
	async function vote(p: Post, value: 1 | -1) {
		const was = votes[p.id];
		const undo = was === value;
		const delta = undo ? -value : value;

		posts = posts.map((x) =>
			x.id !== p.id
				? x
				: {
						...x,
						upvotes: x.upvotes + (delta === 1 ? 1 : was === 1 ? -1 : 0),
						downvotes: x.downvotes + (delta === -1 ? 1 : was === -1 ? -1 : 0)
					}
		);
		if (undo) delete votes[p.id];
		else votes[p.id] = value;

		const r = await run(() => send('/api/vote', { target_type: 'post', target_id: p.id, value }));
		if (!r || r.status !== 200) {
			if (r) error = r.body.error;
			await loadThread(openThread!.id);
		}
	}

	async function report(p: Post, reason: string) {
		const r = await run(() =>
			send('/api/report', { target_type: 'post', target_id: p.id, reason })
		);
		if (r && r.status !== 200) error = r.body.error;
	}

	async function fileProposal(v: {
		operation: string;
		field: string;
		old_value: string | null;
		new_value: string;
		reason: string;
		url: string;
		title: string;
	}) {
		const r = await run(() =>
			send('/api/pr', {
				target_type: target?.type ?? 'position',
				target_id: target?.id ?? null,
				operation: v.operation,
				reason: v.reason,
				changes: [{ field: v.field, old_value: v.old_value, new_value: v.new_value }],
				sources: v.url ? [{ url: v.url, title: v.title }] : []
			})
		);
		if (!r) return;
		if (r.status !== 200) {
			error = r.body.error;
			return;
		}
		go({ propose: null, tab: 'proposals', pr: r.body.id });
	}

	async function decide(decision: string, reason: string) {
		if (!openPr) return;
		const r = await run(() => send('/api/pr/review', { pr_id: openPr!.id, decision, reason }));
		if (!r) return;
		if (r.status !== 200) error = r.body.error;
		else await loadProposal(openPr.id);
	}

	onMount(() => {
		// Closed: the banner touches nothing — no identity, no fetches, no API.
		if (!AGORA_OPEN) return;
		refreshIdentity();
	});

	/**
	 * One effect drives every fetch, keyed on the URL.
	 *
	 * `seen` is a plain `let`, not state. Writing state that the same effect reads
	 * self-triggers, Svelte aborts the effect tree, and the app renders blank with
	 * only a `get_first_child` error to go on — that failure mode is documented in
	 * AGENTS.md and cost this project a blank screen once already. `untrack` guards
	 * the reads inside the loaders for the same reason.
	 */
	let seen: string | undefined;

	$effect(() => {
		// Closed: the banner is the whole page. Not even the URL is asked what it
		// wants — a reader must never reach the API through a closed door.
		if (!AGORA_OPEN) return;

		const key = `${tab}|${threadId}|${prId}|${composing}|${proposing}|${identityOpen}|${sort}|${target?.id ?? ''}`;
		if (key === seen) return;
		seen = key;

		untrack(() => {
			error = '';
			if (proposing || composing || identityOpen) return;
			if (threadId) void loadThread(threadId);
			else if (prId) void loadProposal(prId);
			else if (tab === 'proposals') void loadProposals();
			else if (tab === 'reported') void loadQueue();
			else void loadThreads();
		});
	});
</script>

<svelte:head><title>Agora · DeepTunisia</title></svelte:head>

{#if !AGORA_OPEN}
	<!-- The section is announced but not open: the door itself is the product.
	     No fetches, no identity, no API — see the script's guards. -->
	<div class="agora">
		<section class="soon">
			<span class="eyebrow mono">{t('agora.title')}</span>
			<h1>{t('agora.comingsoon')}</h1>
			<p>{t('agora.comingsoon.body')}</p>
		</section>
	</div>
{:else}
<div class="agora">
	<header>
		<div>
			<h1>{t('agora.title')}</h1>
			<p class="sub">{t('agora.sub')}</p>
		</div>
			<!--
			The identity control lives beside the handle rather than in Settings,
			because the handle is what prompts the question. Somebody who has just
			noticed they are "anon-dp5d" is exactly the person deciding whether to be
			something else.
		-->
		<button class="who" onclick={() => go({ identity: identityOpen ? null : '1' })}>
			{#if agora.handle}
				<Author author={{ handle: agora.handle, name: agora.name, note: agora.note }} />
			{:else}
				<span class="anon">{t('agora.identity.new')}</span>
			{/if}
			<span class="trust">{t('agora.trust')} {agora.trustLevel}</span>
		</button>
	</header>

	{#if target}
		<div class="context">
			<Chip variant="outline">{target.type}</Chip>
			<strong>{target.label}</strong>
			<span class="dim">{t('agora.attached')}</span>
			<a href="/agora">{t('agora.showall')}</a>
		</div>
	{/if}

	{#if agora.offline}
		<Panel elevation={1} padded>
			<p class="offline">
				{t('agora.offline')}<br /><code>npm run community</code>
			</p>
			<Button variant="outline" size="xs" onclick={() => location.reload()}>
				{t('agora.retry')}
			</Button>
		</Panel>
	{:else if threadId && openThread}
		<Button size="xs" variant="ghost" onclick={() => go({ thread: null })}>← {t('agora.back')}</Button>
		<ThreadView
			thread={openThread}
			{posts}
			{mentions}
			{votes}
			{canLink}
			busy={loading}
			{error}
			onpost={post}
			onvote={vote}
			onreport={report}
		/>
	{:else if prId && openPr}
		<Button size="xs" variant="ghost" onclick={() => go({ pr: null })}>← {t('agora.back')}</Button>
		<ProposalView
			pr={openPr}
			canModerate={!!agora.can.moderate}
			busy={loading}
			{error}
			ondecide={decide}
		/>
	{:else if identityOpen}
		<Identity onclose={() => go({ identity: null })} />
	{:else if composing}
		<NewThread
			fixed={target}
			busy={loading}
			{error}
			oncreate={createThread}
			oncancel={() => go({ compose: null })}
		/>
	{:else if proposing}
		<ProposalForm
			{target}
			busy={loading}
			{error}
			onfile={fileProposal}
			oncancel={() => go({ propose: null, tab: 'proposals' })}
		/>
	{:else}
		<PrivacyNotice />

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if tab === 'proposals'}
			<div class="bar">
				<span class="spacer"></span>
				{#if agora.can.createPr}
					<Button variant="outline" onclick={() => go({ propose: '1' })}>
						{t('agora.propose')}
					</Button>
				{:else}
					<Tooltip content={t('agora.proposelocked')}>
						<Button variant="outline" disabled>
							{t('agora.propose')}
						</Button>
					</Tooltip>
				{/if}
			</div>
			{#if prs.length}
				<ProposalList items={prs} href={(pr) => `/agora?tab=proposals&pr=${pr.id}`} />
			{:else if !loading}
				<EmptyState title={t('agora.emptytitle')} body={t('agora.emptyproposals')} />
			{/if}
		{:else if tab === 'reported'}
			<p class="dim">{t('agora.queuehint')}</p>
			{#each queue as q (q.target)}
				<Panel elevation={1}>
					<div class="qrow">
						<div class="meta">
							<Chip tint="var(--basis-unsubstantiated)" dot>
								{q.pressure}
								{t('agora.pressure')}
							</Chip>
							<Chip variant="outline">{q.target_type}</Chip>
							{#each q.reasons as r (r)}<Chip>{t(`agora.reason.${r}`)}</Chip>{/each}
							{#if q.removed}<Chip tint="var(--text-faint)">{t('agora.removed')}</Chip>{/if}
						</div>
						<p class="excerpt">{q.excerpt ?? t('agora.removed')}</p>
					</div>
				</Panel>
			{:else}
				{#if !loading}
					<EmptyState title={t('agora.emptytitle')} body={t('agora.emptyqueue')} />
				{/if}
			{/each}
		{:else}
			<div class="bar">
				<Segmented
					options={['trending', 'recent', 'top'].map((s) => ({
						value: s,
						label: t(`agora.sort.${s}`)
					}))}
					value={sort}
					onchange={(v) => go({ sort: v })}
					label={t('agora.discussion')}
				/>
				<span class="spacer"></span>
				<Button variant="outline" onclick={() => go({ compose: '1' })}>
					{t('agora.newthread')}
				</Button>
			</div>

			{#if threads.length}
				<ThreadList
					{threads}
					href={(th) => {
						const q = new URLSearchParams(params);
						q.set('thread', th.id);
						return `/agora?${q}`;
					}}
				/>
			{:else if !loading}
				<EmptyState title={t('agora.emptytitle')} body={t('agora.emptybody')}>
					{#snippet action()}
						<Button variant="solid" onclick={() => go({ compose: '1' })}>
							{t('agora.newthread')}
						</Button>
					{/snippet}
				</EmptyState>
			{/if}
		{/if}
	{/if}
</div>
{/if}

<style>
	.agora {
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
		padding: var(--s-7) var(--s-8) var(--s-11);
		max-width: 860px;
		margin-inline: auto;
	}

	/* The coming-soon banner: one raised surface, no affordances — it must not
	   be mistaken for a live view. Same register whether it sits in the closed
	   page or the moment the gate flips. */
	.soon {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		max-width: 560px;
		padding: var(--s-7) var(--s-8);
		background: var(--surface-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-1);
	}
	.eyebrow {
		display: block;
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: var(--s-2);
	}
	.soon h1 {
		font-family: var(--font-serif);
		font-weight: 560;
		line-height: var(--lh-snug);
	}
	.soon p {
		margin: var(--s-2) 0 0;
		color: var(--text-secondary);
		line-height: var(--lh-normal);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s-5);
		flex-wrap: wrap;
	}
	h1 {
		font-size: var(--t-lg);
		margin: 0;
	}
	.sub,
	.dim {
		color: var(--text-secondary);
		font-size: var(--t-sm);
		margin: 0;
	}
	.who {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-3);
		flex-wrap: wrap;
		padding: var(--s-2) var(--s-4);
		border-radius: var(--r-md);
		border: 1px solid transparent;
		font-size: var(--t-xs);
		color: var(--text-faint);
		min-height: var(--tap);
	}
	.who:hover {
		border-color: var(--border-default);
		background: var(--surface-hover);
	}
	.trust {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.anon {
		font-style: italic;
		color: var(--text-secondary);
	}

	.context {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		flex-wrap: wrap;
		padding: var(--s-4) var(--s-5);
		border-inline-start: 2px solid var(--accent);
		background: var(--surface-sunken);
		border-radius: var(--r-sm);
		font-size: var(--t-sm);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}

	.qrow {
		padding: var(--s-5) var(--s-6);
	}
	.meta {
		display: flex;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}
	.excerpt {
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.55;
		overflow-wrap: anywhere;
	}

	.error {
		margin: 0;
		color: var(--basis-unsubstantiated);
		font-size: var(--t-sm);
	}
	.offline {
		margin: 0 0 var(--s-4);
		color: var(--text-secondary);
		font-size: var(--t-sm);
		line-height: 1.55;
	}
	.offline code {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-primary);
	}

	@media (max-width: 900px) {
		.agora {
			padding: var(--s-6) var(--s-5) var(--s-10);
		}
	}
</style>
