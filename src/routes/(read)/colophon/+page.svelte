<script lang="ts">
	import { t } from '$lib/t.svelte';
	import Content from '$lib/ui/Content.svelte';
</script>

<svelte:head>
	<title>How this was made · DeepTunisia</title>
	<meta
		name="description"
		content="How DeepTunisia was built: one person with a swarm of AI assistants, what the models did and did not do, the paper behind the compiler, and why the project does not overclaim."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('colophon.eyebrow')}</span>
		<h1>{t('colophon.title')}</h1>
		<div class="lede"><Content view="colophon" section="intro" /></div>
	</header>

	<div class="prose">
		<Content view="colophon" section="what" />
		<Content view="colophon" section="paper" />
		<Content view="colophon" section="not" />
		<Content view="colophon" section="review" />
		<Content view="colophon" section="why" />
		<Content view="colophon" section="how" />
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.page-head {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-8) var(--s-6) var(--s-3);
	}
	.page-head .eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.page-head h1 {
		margin: var(--s-3) 0 var(--s-4);
		font-family: var(--font-serif);
		font-size: var(--t-4xl);
		font-weight: 400;
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	.page-head :global(.lede p) {
		margin: 0;
		font-size: var(--t-lg);
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.prose {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-3) var(--s-6) var(--s-12);
	}
</style>
