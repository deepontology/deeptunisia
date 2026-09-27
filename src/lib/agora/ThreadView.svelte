<script lang="ts">
	/**
	 * One thread: its posts, and the reply that goes under them.
	 *
	 * REPLIES ARE NESTED NOW
	 *
	 * `posts.parent_id` has been in the schema since the first migration and the UI
	 * rendered a flat list, so the column was dead and every answer to a specific
	 * point looked like a new topic. Nesting is capped at one level: deeper trees
	 * are unreadable at 390px, and the cases that need depth are better served by
	 * quoting, which the composer now supports.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Popover from '$lib/ui/Popover.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Composer from './Composer.svelte';
	import PostBody from './PostBody.svelte';
	import Author from './Author.svelte';
	import { relativeTime } from './time';
	import { REPORT_REASONS } from '$lib/agora.svelte';
	import { copyText } from '$lib/share';
	import { t } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import type { MentionSpan } from './markdown';
	import type { Post, Thread, Mention } from '$lib/community';

	interface Props {
		thread: Thread;
		posts: Post[];
		mentions: Mention[];
		busy?: boolean;
		error?: string;
		canLink?: boolean;
		/** Which posts this browser has voted on, and which way. */
		votes: Record<string, 1 | -1>;
		onpost: (
			body: string,
			mentions: MentionSpan[],
			parent: string | null,
			burn: boolean
		) => Promise<boolean>;
		onvote: (post: Post, value: 1 | -1) => void;
		onreport: (post: Post, reason: string, details: string) => Promise<boolean>;
		/** Bring a mentioned record into the anchored rail. */
		onpeek?: (id: string) => void;
	}

	let {
		thread,
		posts,
		mentions,
		busy = false,
		error = '',
		canLink = true,
		votes,
		onpost,
		onvote,
		onreport,
		onpeek
	}: Props = $props();

	let replyingTo = $state<string | null>(null);
	let reporting = $state<string | null>(null);
	let reportDetails = $state('');
	let reportBusy = $state(false);
	let reportSent = $state<string | null>(null);
	let copied = $state(false);

	/** The thread's own permalink, so a discussion can be cited without a screenshot. */
	async function copyLink() {
		if (await copyText(location.href)) {
			copied = true;
			setTimeout(() => (copied = false), 1600);
		}
	}

	/**
	 * A reason alone is enough to queue a report, but "misinformation" without
	 * what the reporter checked hands the moderator a puzzle. Details are optional
	 * and travel with the report when given.
	 */
	async function submitReport(p: Post, reason: string) {
		if (reportBusy) return;
		reportBusy = true;
		const ok = await onreport(p, reason, reportDetails);
		reportBusy = false;
		if (ok) {
			reportSent = p.id;
			reportDetails = '';
			setTimeout(() => {
				reporting = null;
				reportSent = null;
			}, 1600);
		}
	}

	const roots = $derived(posts.filter((p) => !p.parent_id));
	const childrenOf = $derived.by(() => {
		const m = new Map<string, Post[]>();
		for (const p of posts) {
			if (!p.parent_id) continue;
			const kids = m.get(p.parent_id);
			if (kids) kids.push(p);
			else m.set(p.parent_id, [p]);
		}
		return m;
	});

	/**
	 * The offsets recorded against a post.
	 *
	 * `entity_id` becomes `id` here because the wire shape and the parser's shape
	 * are deliberately different names for the same thing — the API is describing a
	 * row, the parser is describing a span. Conflating them by casting looked like it
	 * worked and silently produced spans with no id at all, which resolve to nothing
	 * and render as plain prose. Which is the correct degradation, and therefore
	 * indistinguishable from the feature simply not being wired up.
	 *
	 * A malformed span is dropped rather than rendered: the body is always the truth
	 * and the annotation is optional.
	 */
	function spansFor(post: Post): MentionSpan[] {
		return mentions
			.filter((m) => m.post_id === post.id)
			.filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start)
			.map((m) => ({ id: m.entity_id, start: m.start, end: m.end }));
	}
</script>

{#snippet postCard(p: Post, nested: boolean)}
	<article class="post" class:nested>
		<div class="meta">
			<Author author={p.author} />
			<span class="sep" aria-hidden="true">·</span>
			<span>{relativeTime(p.created_at, app.locale)}</span>
			<span class="spacer"></span>

			<div class="votes">
				<Tooltip content={votes[p.id] === 1 ? t('agora.vote.undo') : t('agora.upvote')}>
					<Button
						size="xs"
						variant="ghost"
						active={votes[p.id] === 1}
						aria-pressed={votes[p.id] === 1}
						onclick={() => onvote(p, 1)}
						aria-label={t('agora.upvote')}
					>
						▲<b>{p.upvotes}</b>
					</Button>
				</Tooltip>
				<Tooltip content={votes[p.id] === -1 ? t('agora.vote.undo') : t('agora.downvote')}>
					<Button
						size="xs"
						variant="ghost"
						active={votes[p.id] === -1}
						aria-pressed={votes[p.id] === -1}
						onclick={() => onvote(p, -1)}
						aria-label={t('agora.downvote')}
					>
						▼<b>{p.downvotes}</b>
					</Button>
				</Tooltip>
			</div>

			{#if !nested}
				<Button size="xs" variant="ghost" onclick={() => (replyingTo = replyingTo === p.id ? null : p.id)}>
					{t('agora.reply')}
				</Button>
			{/if}

			<div class="reportwrap">
				<Button
					size="xs"
					variant="ghost"
					onclick={() => (reporting = reporting === p.id ? null : p.id)}
				>
					{t('agora.report')}
				</Button>
				<!-- A menu, not a row of nine buttons: nine equally-weighted controls
				     inline read as the primary thing on the card, which a report is not. -->
				<Popover
					open={reporting === p.id}
					onclose={() => (reporting = null)}
					label={t('agora.report')}
				>
					<div class="reasons">
						{#if reportSent === p.id}
							<p class="sent" role="status">{t('agora.reportsent')}</p>
						{:else}
							<p class="reasonhint">{t('agora.reporthint')}</p>
							<label class="details">
								<span>{t('agora.reportdetails')}</span>
								<Textarea
									bind:value={reportDetails}
									rows={2}
									limit={2000}
									placeholder={t('agora.reportdetailsph')}
								/>
							</label>
							{#each REPORT_REASONS as r (r)}
								<button
									type="button"
									class="reason"
									disabled={reportBusy}
									onclick={() => submitReport(p, r)}
								>
									{t(`agora.reason.${r}`)}
								</button>
							{/each}
						{/if}
					</div>
				</Popover>
			</div>
		</div>

		{#if p.removed}
			<p class="removed">
				<Chip tint="var(--basis-unsubstantiated)">{t('agora.removed')}</Chip>
				{p.removed_reason}
			</p>
		{:else if p.body}
			<PostBody body={p.body} mentions={spansFor(p)} {onpeek} />
		{/if}
	</article>

	{#if replyingTo === p.id}
		<div class="replybox">
			<Composer
				placeholder={t('agora.replyph')}
				{canLink}
				{busy}
				draftKey="reply:{p.id}"
				submitLabel={t('agora.reply')}
				onsubmit={async (b, m, burn) => {
					const landed = await onpost(b, m, p.id, burn);
					if (landed) replyingTo = null;
					return landed;
				}}
				oncancel={() => (replyingTo = null)}
			/>
		</div>
	{/if}
{/snippet}

<div class="thread">
	<header>
		<Chip>{t(`agora.kind.${thread.kind}`)}</Chip>
		<h2>{thread.title}</h2>
		<span class="spacer"></span>
		<Button size="xs" variant="ghost" onclick={copyLink} aria-live="polite">
			{copied ? t('agora.copied') : t('agora.copylink')}
		</Button>
	</header>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<ol class="posts">
		{#each roots as p (p.id)}
			<li>
				<Panel elevation={1}>
					{@render postCard(p, false)}
				</Panel>
				{#each childrenOf.get(p.id) ?? [] as child (child.id)}
					<div class="child">
						<Panel elevation={0}>
							{@render postCard(child, true)}
						</Panel>
					</div>
				{/each}
			</li>
		{/each}
	</ol>

	<Panel elevation={1} padded>
		<Composer
			placeholder={t('agora.replyph')}
			{canLink}
			{busy}
			draftKey="thread:{thread.id}"
			onsubmit={(b, m, burn) => onpost(b, m, null, burn)}
		/>
	</Panel>
</div>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 500;
		line-height: 1.3;
	}

	.posts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.post {
		padding: var(--s-5) var(--s-6);
	}
	/* One level, marked by a rule rather than by indentation alone — indentation
	   costs width the phone does not have. */
	.child {
		margin-inline-start: var(--s-6);
		border-inline-start: 2px solid var(--border-subtle);
		padding-inline-start: var(--s-4);
		margin-top: var(--s-3);
	}
	.nested {
		padding: var(--s-4) var(--s-5);
	}

	.meta {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.sep {
		opacity: 0.5;
	}
	.spacer {
		flex: 1;
	}
	.votes {
		display: flex;
		gap: var(--s-1);
	}
	/* Every number is mono and tabular — a count that shifts the button width when
	   it ticks from 9 to 10 makes the control move under the pointer. */
	.votes b {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		margin-inline-start: var(--s-2);
	}

	.reportwrap {
		position: relative;
	}
	.reasons {
		display: flex;
		flex-direction: column;
		min-width: 190px;
		padding: var(--s-3);
	}
	.reasonhint {
		margin: 0 0 var(--s-3);
		padding: 0 var(--s-3);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		line-height: 1.45;
		max-width: 34ch;
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: 0 var(--s-3) var(--s-3);
	}
	.details span {
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
	}
	.sent {
		margin: 0;
		padding: var(--s-4) var(--s-3);
		font-size: var(--t-sm);
		color: var(--basis-documented);
		max-width: 30ch;
		line-height: 1.5;
	}
	.reason:disabled {
		opacity: 0.5;
	}
	.reason {
		text-align: start;
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		min-height: var(--tap);
	}
	.reason:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	.removed {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-faint);
		font-style: italic;
	}
	.replybox {
		margin: var(--s-4) 0 0 0;
		margin-inline-start: var(--s-6);
		padding-inline-start: var(--s-4);
		border-inline-start: 2px solid var(--accent);
	}
	.error {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--basis-unsubstantiated);
	}
</style>
