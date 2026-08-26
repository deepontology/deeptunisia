<script lang="ts">
	import { changelog, type ChangeEntry } from '$data/index';
	import Chip from '$lib/ui/Chip.svelte';
	import Content from '$lib/ui/Content.svelte';
	import { t, formatDate } from '$lib/t.svelte';

	/**
	 * The dataset's change history.
	 *
	 * /about states that corrections are published rather than quietly applied. The
	 * record for that already existed — the data is plain text under version control,
	 * so every factual change is a dated, attributable diff — but nothing surfaced it,
	 * which left the commitment unverifiable by exactly the people it addresses. This
	 * is the surfacing. It is generated, not written: nobody curates which changes are
	 * flattering enough to appear.
	 */

	type Kind = ChangeEntry['kind'];

	const KIND_META: Record<Kind, { label: string; tint: string; blurb: string }> = {
		revision: {
			label: t('corr.kind.revision.label'),
			tint: 'var(--basis-reported)',
			blurb: t('corr.kind.revision.blurb')
		},
		expansion: {
			label: t('corr.kind.expansion.label'),
			tint: 'var(--basis-documented)',
			blurb: t('corr.kind.expansion.blurb')
		},
		retraction: {
			label: t('corr.kind.retraction.label'),
			tint: 'var(--basis-inferred)',
			blurb: t('corr.kind.retraction.blurb')
		}
	};

	const KIND_ORDER: Kind[] = ['revision', 'expansion', 'retraction'];

	let filter = $state<Kind | 'all'>('all');

	const shown = $derived(
		filter === 'all' ? changelog : changelog.filter((e) => e.kind === filter)
	);

	const tally = $derived.by(() => {
		const t = { revision: 0, expansion: 0, retraction: 0 } as Record<Kind, number>;
		for (const e of changelog) t[e.kind]++;
		return t;
	});

	const fmtDate = (iso: string) => formatDate(new Date(iso).getTime());

	const shortFile = (f: string) => f.replace(/^data\//, '');
</script>

<svelte:head>
	<title>Corrections · DeepTunisia</title>
	<meta
		name="description"
		content="Every change to the DeepTunisia dataset, generated from version control. Corrections are published, not quietly applied."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('corr.eyebrow')}</span>
		<h1>{t('corr.title')}</h1>
		<div class="lede"><Content view="corrections" section="lede" /></div>
	</header>

	{#if changelog.length === 0}
		<p class="empty">{t('corr.empty')}</p>
	{:else}
		<div class="legend">
			{#each KIND_ORDER as k (k)}
				<div class="leg">
					<Chip tint={KIND_META[k].tint} dot>{KIND_META[k].label}</Chip>
					<span class="leg-blurb">{KIND_META[k].blurb}</span>
					<span class="leg-n">{tally[k]}</span>
				</div>
			{/each}
		</div>

		<div class="filters" role="group" aria-label={t('corr.filterAria')}>
			<button class:on={filter === 'all'} onclick={() => (filter = 'all')}>
				{t('corr.all')} <span class="n">{changelog.length}</span>
			</button>
			{#each KIND_ORDER as k (k)}
				<button class:on={filter === k} onclick={() => (filter = k)} disabled={tally[k] === 0}>
					{KIND_META[k].label} <span class="n">{tally[k]}</span>
				</button>
			{/each}
		</div>

		<ol class="entries">
			{#each shown as e (e.hash)}
				<li class="entry">
					<div class="meta">
						<time datetime={e.date}>{fmtDate(e.date)}</time>
						<code class="hash">{e.hash}</code>
						<Chip tint={KIND_META[e.kind].tint} dot>{KIND_META[e.kind].label}</Chip>
					</div>
					<p class="subject">{e.subject}</p>
					<ul class="files">
						{#each e.files as f (f.file)}
							<li>
								<span class="fname">{shortFile(f.file)}</span>
								<span class="delta">
									<span class="plus" class:nil={f.added === 0}>+{f.added}</span><span
										class="minus"
										class:nil={f.removed === 0}>−{f.removed}</span
									>
								</span>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>

		<div class="foot"><Content view="corrections" section="foot" /></div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		overflow-y: auto;
		padding: 32px 22px 90px;
	}
	.page-head {
		max-width: 76ch;
		margin-block-end: var(--s-7);
	}
	h1 {
		font-size: 30px;
		margin: 4px 0 12px;
		font-family: var(--font-serif);
	}
	.lede {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.7;
		color: var(--text-secondary);
	}
	.empty {
		max-width: 76ch;
		padding: var(--s-5) var(--s-6);
		border-inline-start: 2px solid var(--basis-inferred);
		background: color-mix(in oklch, var(--basis-inferred) 6%, transparent);
		font-size: var(--t-sm);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.legend {
		display: grid;
		gap: var(--s-3);
		max-width: 76ch;
		margin-block-end: var(--s-6);
	}
	.leg {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	.leg-blurb {
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.leg-n {
		margin-inline-start: auto;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-xs);
		color: var(--text-faint);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-block-end: var(--s-6);
	}
	.filters button {
		font: inherit;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		background: var(--surface-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-sm);
		padding: var(--s-3) var(--s-4);
		cursor: pointer;
		transition: background var(--dur-instant) var(--ease-out);
	}
	.filters button:hover:not(:disabled) {
		background: var(--surface-hover);
	}
	.filters button.on {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}
	.filters button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.filters .n {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
		margin-inline-start: var(--s-2);
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 900px;
		display: grid;
		gap: var(--s-5);
	}
	.entry {
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		background: var(--surface-raised);
		padding: var(--s-5) var(--s-6);
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-4);
		margin-block-end: var(--s-3);
	}
	.meta time,
	.hash {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.subject {
		margin: 0 0 var(--s-4);
		font-size: var(--t-sm);
		line-height: 1.6;
		color: var(--text-primary);
	}

	.files {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 3px;
	}
	.files li {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		font-size: var(--t-2xs);
	}
	.fname {
		font-family: var(--font-mono);
		color: var(--text-muted);
	}
	.delta {
		display: inline-flex;
		gap: var(--s-3);
		margin-inline-start: auto;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.plus {
		color: var(--basis-documented);
	}
	.minus {
		color: var(--basis-unsubstantiated);
	}
	/* A zero side of the diff is context, not a signal. Kept visible so the columns
	   stay aligned and the reader can see it really is zero, but drained of colour. */
	.plus.nil,
	.minus.nil {
		color: var(--text-faint);
	}

	.foot {
		max-width: 76ch;
		margin-block-start: var(--s-7);
		font-size: var(--t-xs);
		line-height: 1.65;
		color: var(--text-muted);
	}
</style>
