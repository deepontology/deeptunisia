<script lang="ts">
	import { t } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { studies, titleOf } from '$lib/research';
	import Content from '$lib/ui/Content.svelte';

	/**
	 * The research program page.
	 *
	 * Register matters more than completeness here. The case for the program
	 * comes before the list of studies: a reader should understand why the
	 * question is worth asking before being asked to take part. Nothing on this
	 * page may render in the register of a sourced graph claim, and the
	 * population note travels with the list for the same reason it travels with
	 * every result.
	 */

	const statusKey = (status: string) => `research.status.${status}`;
	const number = (id: string) => id.split('-').pop() ?? '';
</script>

<svelte:head>
	<title>{t('nav.research')} · DeepTunisia</title>
</svelte:head>

<div class="wrap">
	<header class="prose">
		<p class="eyebrow">{t('research.eyebrow')}</p>
		<h1>{t('research.title')}</h1>
		<p class="lede">{t('research.lede')}</p>
	</header>

	<div class="prose">
		<Content view="research" section="program" />
	</div>

	<section class="prose">
		<h2>{t('research.studies')}</h2>
		{#if studies.length === 0}
			<p>{t('research.none')}</p>
		{:else}
			<ul class="cards">
				{#each studies as s (s.id)}
					<li>
						<a class="card" href="/research/{s.slug}">
							<span class="num" aria-hidden="true">{number(s.id)}</span>
							<span class="body">
								<span class="title">{titleOf(s, app.locale)}</span>
								<span class="status">{t(statusKey(s.status))}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="note">{t('research.study.populationNote')}</p>
	</section>
</div>

<style>
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
	.lede {
		font-size: 1.05rem;
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	.card {
		display: flex;
		align-items: center;
		gap: 1.1rem;
		padding: 1rem 1.15rem;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		text-decoration: none;
		color: inherit;
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.card:hover {
		border-color: var(--border-strong);
		background: var(--surface-overlay);
	}
	.num {
		font-family: var(--font-mono);
		font-size: 1.7rem;
		line-height: 1;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.title {
		font-weight: 600;
		color: var(--text-primary);
	}
	.status {
		font-size: 0.8rem;
		color: var(--text-faint);
	}
	.note {
		margin-top: 1.25rem;
		font-size: 0.86rem;
		color: var(--text-faint);
	}
</style>
