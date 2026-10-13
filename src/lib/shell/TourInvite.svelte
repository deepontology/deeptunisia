<script lang="ts">
	import { t } from '$lib/t.svelte';
	import { tour, startTour, dismissInvite } from './tour.svelte';

	/**
	 * The tour, offered on a phone.
	 *
	 * One line above the dock with two choices. It covers nothing the reader needs
	 * (it sits over the canvas, never over the dock or the bar), blocks nothing,
	 * and does not wait to be answered: it leaves after a few seconds, or as soon
	 * as the reader starts using the page, and either way it does not come back.
	 * The full tour stays one tap away in the Views sheet.
	 */

	/** Long enough to read the line; short enough not to become furniture. */
	const LINGER_MS = 9000;

	$effect(() => {
		if (!tour.invite) return;
		const timer = setTimeout(dismissInvite, LINGER_MS);
		/* Using the page is an answer too. The first touch anywhere outside the
		   invitation, or a scroll, retires it. */
		const away = (e: Event) => {
			const el = e.target as Element | null;
			if (el instanceof Element && el.closest('.tour-invite')) return;
			dismissInvite();
		};
		document.addEventListener('pointerdown', away, { capture: true, passive: true });
		document.addEventListener('wheel', away, { capture: true, passive: true });
		return () => {
			clearTimeout(timer);
			document.removeEventListener('pointerdown', away, { capture: true });
			document.removeEventListener('wheel', away, { capture: true });
		};
	});

	function take() {
		tour.invite = false;
		startTour(true);
	}
</script>

{#if tour.invite}
	<div class="tour-invite" role="status">
		<span class="text">{t('tour.invite')}</span>
		<button type="button" class="take" onclick={take}>{t('tour.invite.take')}</button>
		<button type="button" class="close" aria-label={t('tour.skip')} onclick={dismissInvite}>&#215;</button>
	</div>
{/if}

<style>
	.tour-invite {
		position: fixed;
		inset-inline: calc(var(--s-3) + var(--safe-l)) calc(var(--s-3) + var(--safe-r));
		bottom: calc(var(--dock-h) + var(--safe-b) + var(--s-3));
		z-index: var(--z-dock);
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1) var(--s-1) var(--s-1) var(--s-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		background: var(--surface-overlay);
		box-shadow: var(--elev-3);
		animation: invite-in var(--dur-normal) var(--ease-out);
	}
	.text {
		flex: 1;
		min-width: 0;
		font-size: var(--t-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.take {
		flex: 0 0 auto;
		min-height: var(--tap);
		padding: 0 var(--s-4);
		border-radius: var(--r-md);
		background: var(--accent);
		color: var(--accent-text);
		font-size: var(--t-sm);
		font-weight: 560;
	}
	.close {
		flex: 0 0 auto;
		width: var(--tap);
		height: var(--tap);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: var(--t-xl);
		color: var(--text-muted);
	}
	@keyframes invite-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tour-invite {
			animation: none;
		}
	}
</style>
