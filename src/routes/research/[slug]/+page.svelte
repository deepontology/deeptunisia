<script lang="ts">
	import { t } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { titleOf } from '$lib/research';
	import Content from '$lib/ui/Content.svelte';
	import IndexStudy from '$lib/index-study/IndexStudy.svelte';

	/**
	 * A study page.
	 *
	 * The case comes first: why the question is worth asking, then what taking
	 * part involves, then what happens to the answers, then the method facts and
	 * the status of the data and results. A study in design says so plainly; it
	 * never borrows the register of a finding, and the population note sits
	 * beside the results blocks for the same reason it will sit beside every
	 * published number.
	 */
	let { data } = $props();

	const study = $derived(data.study);
	const instrument = $derived(data.instrument);
	const open = $derived(study.status === 'fielding');
	const statusKey = $derived(`research.status.${study.status}`);
	/** Design-stage statuses share one honest line: published as drafts, under review. */
	const inDesign = $derived(['proposed', 'design', 'ethics-review', 'frozen'].includes(study.status));
	const number = $derived(study.id.split('-').pop() ?? '');
</script>

<svelte:head>
	<title>{titleOf(study, app.locale)} · DeepTunisia</title>
</svelte:head>

<!-- A study that publishes a scoring specification is a live index, and its
     page is the instrument and its readouts rather than the study case. -->
{#if instrument?.scoring}
	<IndexStudy {study} {instrument} />
{:else}
<!-- The shell is a fixed window; a document page owns its own scroll. -->
<div class="scroll">
<div class="wrap">
	<header class="prose hero">
		<p class="eyebrow">
			{t('research.eyebrow')} <span class="num">{number}</span>
		</p>
		<h1>{titleOf(study, app.locale)}</h1>
		<p class="status">{t(statusKey)}</p>
		{#if open}
			<p>
				<a class="cta" href="/research/{study.slug}/participate">{t('research.study.participate')}</a>
			</p>
		{:else}
			<p class="note">{inDesign ? t('research.study.inDesign') : t('research.study.notOpen')}</p>
		{/if}
	</header>

	<div class="prose">
		<Content view="research" section="why" />
	</div>

	{#if open}
		<p class="prose">
			<a class="cta" href="/research/{study.slug}/participate">{t('research.study.participate')}</a>
		</p>
	{/if}

	<div class="prose">
		<Content view="research" section="how" />
	</div>

	<div class="prose">
		<Content view="research" section="answers" />
	</div>

	<section class="prose">
		<h2>{t('research.study.method')}</h2>
		<dl class="facts">
			<dt>{t('research.study.protocol')}</dt>
			<dd>{inDesign ? t('research.study.inDesign') : t('research.study.resultsSoon')}</dd>
			<dt>{t('research.study.protections')}</dt>
			<dd>{inDesign ? t('research.study.inDesign') : t('research.study.resultsSoon')}</dd>
			{#if instrument}
				<dt>{t('research.study.instrument')}</dt>
				<dd class="mono">{instrument.id} · {instrument.version}</dd>
			{/if}
		</dl>
	</section>

	<section class="prose">
		<h2>{t('research.study.data')}</h2>
		<p>{t('research.study.dataSoon')}</p>
		<p class="note">{t('research.study.populationNote')}</p>
	</section>

	<section class="prose">
		<h2>{t('research.study.results')}</h2>
		<p>{t('research.study.resultsSoon')}</p>
	</section>
</div>
</div>
{/if}

<style>
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.wrap {
		max-width: 46rem;
		margin-inline: auto;
		padding: 2.5rem 1.25rem 4rem;
	}
	.eyebrow {
		font-size: 0.78rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: 0.4rem;
	}
	.num {
		font-family: var(--font-mono);
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	.hero {
		margin-bottom: 1.5rem;
	}
	.status {
		color: var(--text-faint);
	}
	.cta {
		display: inline-block;
		background: var(--accent);
		color: var(--surface-sunken);
		font-weight: 600;
		border-radius: var(--r-md);
		padding: 0.5rem 1.1rem;
	}
	.note {
		color: var(--text-faint);
	}
	.facts {
		margin: 0;
	}
	.facts dt {
		font-weight: 600;
		margin-top: 0.8rem;
	}
	.facts dd {
		margin: 0.15rem 0 0;
		color: var(--text-secondary, var(--text-primary));
	}
	.mono {
		font-family: var(--font-mono, monospace);
		font-variant-numeric: tabular-nums;
	}
</style>
