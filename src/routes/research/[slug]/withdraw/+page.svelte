<script lang="ts">
	import { t } from '$lib/t.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	/**
	 * Receipt-based withdrawal. The receipt is the only handle on a response;
	 * this page never asks for anything else, and deletion works only while the
	 * study is open. The API enforces both facts; this form is the honest front
	 * for them.
	 */
	let { data } = $props();

	const study = $derived(data.study);

	let code = $state('');
	let phase = $state<'idle' | 'busy' | 'done' | 'notfound' | 'error'>('idle');

	async function withdraw() {
		const trimmed = code.trim();
		if (!trimmed || phase === 'busy') return;
		phase = 'busy';
		try {
			const res = await fetch(`/api/studies/${study.slug}/withdraw`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ receipt: trimmed })
			});
			if (res.ok) {
				const body = (await res.json()) as { deleted?: boolean };
				phase = body.deleted ? 'done' : 'notfound';
			} else {
				phase = 'error';
			}
		} catch {
			phase = 'error';
		}
	}
</script>

<svelte:head>
	<title>{t('research.withdraw.title')} · DeepTunisia</title>
</svelte:head>

<div class="wrap">
	<header class="prose">
		<p class="eyebrow">{t('research.withdraw.eyebrow')}</p>
		<h1>{t('research.withdraw.title')}</h1>
		<p>{t('research.withdraw.lede')}</p>
	</header>

	{#if phase === 'done'}
		<p class="done">{t('research.withdraw.done')}</p>
	{:else}
		<form
			class="row"
			onsubmit={(e) => {
				e.preventDefault();
				void withdraw();
			}}
		>
			<Input
				bind:value={code}
				placeholder={t('research.withdraw.code')}
				mono
				size="md"
				aria-label={t('research.withdraw.code')}
			/>
			<Button variant="solid" size="md" type="submit" disabled={phase === 'busy' || !code.trim()}>
				{t('research.withdraw.submit')}
			</Button>
		</form>
		{#if phase === 'notfound'}
			<p class="note" role="alert">{t('research.withdraw.notFound')}</p>
		{:else if phase === 'error'}
			<p class="note" role="alert">{t('research.participate.error')}</p>
		{/if}
	{/if}
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
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin-top: 1.2rem;
	}
	.note {
		margin-top: 0.9rem;
		color: var(--text-faint);
	}
	.done {
		margin-top: 1.2rem;
		font-weight: 600;
	}
</style>
