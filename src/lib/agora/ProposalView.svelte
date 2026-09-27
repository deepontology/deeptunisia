<script lang="ts">
	/**
	 * One proposal: what would change, on what evidence, and who decided.
	 *
	 * Public while pending, per section 8 of the spec. Private identity, public
	 * process — the submitter is a pseudonym and the argument is not.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Chip from '$lib/ui/Chip.svelte';
	import Author from './Author.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import { targetName } from '$lib/model';
	import { relativeTime } from './time';
	import { hostOf } from './markdown';
	import { app } from '$lib/state.svelte';
	import { agora } from '$lib/agora.svelte';
	import { t } from '$lib/t.svelte';
	import type { Pr } from '$lib/community';

	interface Props {
		pr: Pr;
		busy?: boolean;
		error?: string;
		onwithdraw?: () => void;
	}

	let { pr, busy = false, error = '', onwithdraw }: Props = $props();

	/** The author can withdraw while the proposal is still theirs to withdraw. */
	const isAuthor = $derived(!!agora.handle && pr.author.handle === agora.handle);
	const canWithdraw = $derived(
		isAuthor && pr.status !== 'applied' && pr.status !== 'withdrawn' && pr.status !== 'rejected'
	);

	/**
	 * Only a real web address becomes a link. The API validates this server-side;
	 * this is the second lock, because a `javascript:` URL that slipped through an
	 * older database would otherwise render as an executable link in this origin.
	 */
	function webUrl(url: string | null | undefined): string | null {
		if (!url) return null;
		try {
			const parsed = new URL(url);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
		} catch {
			return null;
		}
	}
</script>

<div class="pr">
	<Panel elevation={1} padded>
		<div class="head">
			<Chip dot>{t(`agora.status.${pr.status}`)}</Chip>
			{#if pr.target_id}
				<Chip variant="outline">{targetName(pr.target_type, pr.target_id)}</Chip>
			{/if}
			{#if pr.applied_sha}
				<Chip tint="var(--basis-documented)">
					{t('agora.inthegraph')}
					{pr.applied_sha.slice(0, 7)}
				</Chip>
			{/if}
			<span class="spacer"></span>
			<Author author={pr.author} />
			<span>{relativeTime(pr.created_at, app.locale)}</span>
			{#if canWithdraw && onwithdraw}
				<Tooltip content={t('agora.withdraw.hint')}>
					<Button size="xs" variant="ghost" onclick={onwithdraw} disabled={busy}>
						{t('agora.withdraw')}
					</Button>
				</Tooltip>
			{/if}
		</div>

		<p class="reason">{pr.reason}</p>

		<h4>{pr.operation === 'append-record' ? t('agora.newrecord') : t('agora.thechange')}</h4>
		{#each pr.changes as c (c.field)}
			<div class="diff">
				<code class="field">{c.field}</code>
				{#if pr.operation === 'append-record'}
					<!-- A new record has no old value; a minus line would be noise. -->
					<div class="plus"><span aria-hidden="true">+</span> {c.new_value ?? '—'}</div>
				{:else}
					<div class="minus"><span aria-hidden="true">−</span> {c.old_value ?? t('agora.unset')}</div>
					<div class="plus"><span aria-hidden="true">+</span> {c.new_value ?? '—'}</div>
				{/if}
			</div>
		{/each}

		<h4>{t('agora.evidence')}</h4>
		<ul class="sources">
			{#each pr.sources as s (s.url || s.source_id)}
				{@const safe = webUrl(s.url)}
				<li>
					{#if safe}
						<a href={safe} target="_blank" rel="nofollow noopener noreferrer">
							{s.title || safe}
						</a>
						<span class="host">{hostOf(safe)}</span>
					{:else if s.url}
						<span class="badlink" title={t('agora.source.invalid')}>{s.title || s.url}</span>
					{:else}
						<code>{s.source_id}</code>
					{/if}
				</li>
			{:else}
				<li class="none">{t('agora.noevidence')}</li>
			{/each}
		</ul>

		<h4>{t('agora.review')}</h4>
		{#each pr.reviews as r (r.created_at)}
			<div class="review">
				<Chip>{t(`agora.decision.${r.decision}`)}</Chip>
				<Author author={r.reviewer} compact />
				<span class="when">{relativeTime(r.created_at, app.locale)}</span>
				<p>{r.reason}</p>
			</div>
		{:else}
			<p class="none">{t('agora.nodecision')}</p>
		{/each}
	</Panel>

	<!--
		No review or decision controls live here. Reviewing a proposed change to
		the graph is maintainer work and belongs in the editorial dashboard, not in
		the room where the change was argued for. This view is the public record of
		the proposal: what would change, on what evidence, and what was decided.
	-->
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.pr {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.spacer {
		flex: 1;
	}
	.reason {
		margin: var(--s-5) 0 0;
		font-size: var(--t-sm);
		line-height: 1.6;
		max-width: 70ch;
	}
	h4 {
		margin: var(--s-7) 0 var(--s-3);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
	}
	.error {
		margin: 0;
		color: var(--basis-unsubstantiated);
		font-size: var(--t-sm);
	}

	.diff {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-sm);
		overflow: hidden;
		margin-bottom: var(--s-3);
	}
	.field {
		display: block;
		padding: var(--s-2) var(--s-4);
		background: var(--surface-sunken);
		color: var(--text-secondary);
		border-bottom: 1px solid var(--border-subtle);
	}
	.minus,
	.plus {
		padding: var(--s-2) var(--s-4);
		overflow-wrap: anywhere;
	}
	.minus {
		color: var(--basis-unsubstantiated);
		background: color-mix(in oklch, var(--basis-unsubstantiated) 7%, transparent);
	}
	.plus {
		color: var(--basis-documented);
		background: color-mix(in oklch, var(--basis-documented) 7%, transparent);
	}

	.sources {
		margin: 0;
		padding-inline-start: var(--s-6);
		font-size: var(--t-sm);
	}
	.sources li {
		margin-bottom: var(--s-2);
	}
	.sources a {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.host {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-inline-start: var(--s-2);
	}
	.badlink {
		color: var(--text-faint);
		font-style: italic;
		overflow-wrap: anywhere;
	}
	.none {
		color: var(--basis-inferred);
		font-size: var(--t-sm);
		list-style: none;
		margin-inline-start: calc(var(--s-6) * -1);
	}

	.review {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--s-3);
		padding: var(--s-3) 0;
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.review p {
		flex-basis: 100%;
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-secondary);
		line-height: 1.55;
	}
	.when {
		flex: 1;
	}
</style>
