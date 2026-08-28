<script lang="ts">
	import { t } from '$lib/t.svelte';
	import Popover from './Popover.svelte';
	import { copyText, shareOrCopy, canNativeShare, platformShareUrls } from '$lib/share';

	interface Props {
		url: string;
		title?: string;
		text?: string;
		/** compact icon in card header; default ghost */
		variant?: 'icon' | 'compact';
		label?: string;
	}

	let { url, title, text, variant = 'icon', label }: Props = $props();

	let open = $state(false);
	let copied = $state(false);
	let failed = $state(false);
	let toastTimer: number | null = null;

	const native = $derived(canNativeShare(url));
	const platforms = $derived(platformShareUrls(url, title));

	function close() {
		open = false;
	}

	async function onCopy() {
		const ok = await copyText(url);
		copied = ok;
		failed = !ok;
		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			copied = false;
			failed = false;
		}, 2200);
	}

	async function onNativeShare() {
		const res = await shareOrCopy({ url, title, text });
		if (res === 'copied') {
			copied = true;
			failed = false;
			if (toastTimer) window.clearTimeout(toastTimer);
			toastTimer = window.setTimeout(() => (copied = false), 2200);
		} else if (res === 'failed') {
			// user dismissed — keep quiet; but if copy fallback failed, show failed
			// shareOrCopy already handled AbortError silent case
		}
		if (res === 'shared') close();
	}
</script>

<div class="wrap" class:compact={variant === 'compact'}>
	<button
		class="trigger"
		aria-label={label ?? t('share.share')}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<!-- share icon: minimal, stroke currentColor, no raw colour -->
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="13" cy="3" r="2" />
			<circle cx="3" cy="8" r="2" />
			<circle cx="13" cy="13" r="2" />
			<path d="M5 7.2 L11 3.8 M5 8.8 L11 12.2" />
		</svg>
		{#if variant === 'compact'}
			<span class="lab">{t('share.share')}</span>
		{/if}
	</button>

	<Popover bind:open onclose={close} label={t('share.title')} align="end">
		<div class="panel" role="dialog" aria-label={t('share.title')}>
			<div class="head">
				<span class="eyebrow">{t('share.title')}</span>
				<button class="close" onclick={close} aria-label={t('panel.close')}>×</button>
			</div>

			<label class="field">
				<span class="flabel">{t('share.fields.link')}</span>
				<div class="row">
					<input class="url mono" readonly dir="ltr" value={url} spellcheck="false" aria-label={t('share.fields.link')} />
					<button class="cbtn" class:ok={copied} onclick={onCopy}>
						{#if copied}
							{t('share.copied')}
						{:else}
							{t('share.copyLink')}
						{/if}
					</button>
				</div>
				{#if copied}
					<p class="live" role="status" aria-live="polite">{t('share.copied')}</p>
				{:else if failed}
					<p class="live err" role="status" aria-live="polite">{t('share.failed')}</p>
				{/if}
			</label>

			{#if native}
				<button class="native" onclick={onNativeShare}>
					<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M8 2.5 L8 10 M8 2.5 L5 5.5 M8 2.5 L11 5.5"/><path d="M3 11.5 L13 11.5 L13 13.5 L3 13.5 Z"/></svg>
					{t('share.native')}
				</button>
			{/if}

			<div class="fallback">
				<span class="eyebrow">{t('share.fallback.note')}</span>
				<div class="plats">
					<a class="plat" href={platforms.x} target="_blank" rel="noopener noreferrer" aria-label={t('share.platform.x')}>{t('share.platform.x')}</a>
					<a class="plat" href={platforms.facebook} target="_blank" rel="noopener noreferrer" aria-label={t('share.platform.facebook')}>{t('share.platform.facebook')}</a>
					<a class="plat" href={platforms.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={t('share.platform.whatsapp')}>{t('share.platform.whatsapp')}</a>
					<a class="plat" href={platforms.telegram} target="_blank" rel="noopener noreferrer" aria-label={t('share.platform.telegram')}>{t('share.platform.telegram')}</a>
					<a class="plat" href={platforms.email} target="_blank" rel="noopener noreferrer" aria-label={t('share.platform.email')}>{t('share.platform.email')}</a>
				</div>
			</div>
		</div>
	</Popover>
</div>

<style>
	.wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--r-sm);
		color: var(--text-muted);
		border: 1px solid var(--border-default);
		background: transparent;
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.trigger:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}
	.trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.compact .trigger {
		width: auto;
		padding: 0 var(--s-4);
		height: 30px;
	}
	.lab {
		font-size: var(--t-xs);
		font-weight: 520;
	}

	.panel {
		width: min(360px, calc(100vw - var(--s-7)));
		padding: var(--s-5) var(--s-5) var(--s-6);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.close {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		font-size: var(--t-lg);
		line-height: 1;
		color: var(--text-faint);
		border-radius: var(--r-sm);
	}
	.close:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.flabel {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.row {
		display: flex;
		gap: var(--s-3);
		align-items: stretch;
	}
	.url {
		flex: 1;
		min-width: 0;
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-sm);
		border: 1px solid var(--border-subtle);
		background: var(--surface-sunken);
		color: var(--text-primary);
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.url:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.cbtn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--s-5);
		border-radius: var(--r-sm);
		border: 1px solid var(--accent-border);
		background: var(--accent-muted);
		color: var(--text-primary);
		font-size: var(--t-xs);
		font-weight: 520;
		min-height: 32px;
		white-space: nowrap;
		transition:
			background var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.cbtn:hover {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}
	.cbtn.ok {
		color: var(--accent);
		border-color: var(--accent-border);
		background: var(--accent-muted);
	}
	.live {
		font-size: var(--t-2xs);
		color: var(--text-muted);
		line-height: var(--lh-snug);
	}
	.live.err {
		color: var(--basis-unsubstantiated);
	}
	.native {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: var(--tap);
		padding: 0 var(--s-5);
		border-radius: var(--r-md);
		border: 1px solid var(--border-default);
		background: var(--surface-raised);
		color: var(--text-secondary);
		font-size: var(--t-sm);
		font-weight: 520;
	}
	.native:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.fallback {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-subtle);
	}
	.plats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.plat {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		background: var(--surface-sunken);
		color: var(--text-secondary);
		font-size: var(--t-2xs);
		font-family: var(--font-mono);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		border-bottom: 1px solid var(--border-default);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}
	.plat:hover {
		background: var(--surface-hover);
		color: var(--accent);
		border-color: var(--accent-border);
		border-bottom-color: var(--accent-border);
	}

	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.cbtn,
		.plat {
			transition: none;
		}
	}
</style>
