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
	import Field from '$lib/ui/Field.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Author from './Author.svelte';
	import { targetName } from '$lib/model';
	import { relativeTime } from './time';
	import { hostOf } from './markdown';
	import { app } from '$lib/state.svelte';
	import { t } from '$lib/t.svelte';
	import type { Pr } from '$lib/community';

	interface Props {
		pr: Pr;
		canModerate?: boolean;
		busy?: boolean;
		error?: string;
		ondecide: (decision: string, reason: string) => void;
	}

	let { pr, canModerate = false, busy = false, error = '', ondecide }: Props = $props();

	let decision = $state('needs-evidence');
	let reason = $state('');

	const DECISIONS = ['needs-evidence', 'under-review', 'accept', 'reject'];
</script>

<div class="pr">
	<Panel elevation={1} padded>
		<div class="head">
			<Chip dot>{pr.status}</Chip>
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
		</div>

		<p class="reason">{pr.reason}</p>

		<h4>{t('agora.thechange')}</h4>
		{#each pr.changes as c (c.field)}
			<div class="diff">
				<code class="field">{c.field}</code>
				<div class="minus"><span aria-hidden="true">−</span> {c.old_value ?? t('agora.unset')}</div>
				<div class="plus"><span aria-hidden="true">+</span> {c.new_value ?? '—'}</div>
			</div>
		{/each}

		<h4>{t('agora.evidence')}</h4>
		<ul class="sources">
			{#each pr.sources as s (s.url || s.source_id)}
				<li>
					{#if s.url}
						<a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
							{s.title || s.url}
						</a>
						<span class="host">{hostOf(s.url)}</span>
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
				<Chip>{r.decision}</Chip>
				<Author author={r.reviewer} compact />
				<span class="when">{relativeTime(r.created_at, app.locale)}</span>
				<p>{r.reason}</p>
			</div>
		{:else}
			<p class="none">{t('agora.nodecision')}</p>
		{/each}
	</Panel>

	{#if canModerate && pr.status !== 'applied'}
		<Panel elevation={1} padded>
			<h4 class="first">{t('agora.record')}</h4>
			<Field label={t('agora.decision')}>
				<Segmented
					options={DECISIONS.map((d) => ({ value: d, label: d }))}
					value={decision}
					onchange={(v) => (decision = v)}
					label={t('agora.decision')}
				/>
			</Field>
			<Field label={t('agora.reasonlabel')} hint={t('agora.reasonph')} required error={error || undefined}>
				<Textarea bind:value={reason} rows={3} limit={2000} />
			</Field>
			<Button variant="solid" onclick={() => ondecide(decision, reason)} disabled={!reason.trim() || busy}>
				{t('agora.record')}
			</Button>
		</Panel>
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
	h4.first {
		margin-top: 0;
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
