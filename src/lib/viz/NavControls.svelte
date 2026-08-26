<script lang="ts">
	import type { Navigable } from './camera.svelte';
	import { t } from '$lib/t.svelte';

	/**
	 * Visible controls for the camera.
	 *
	 * Gestures are the fast path, but they are invisible: a reader on a touch screen
	 * who does not already know the canvas is pannable has no way to find out. These
	 * buttons are the discoverable version, and they are also the keyboard-reachable
	 * one — the canvas itself only answers arrow keys once it has focus, which is not
	 * something to rely on as the only route.
	 *
	 * Marked data-no-pan so a press on a button is never also the start of a drag.
	 */

	let { cam, label = 'View' }: { cam: Navigable; label?: string } = $props();

	/** Shown as a percentage of the fit scale: "100%" means the whole map is visible. */
	const relative = $derived(Math.round((cam.k / Math.max(cam.fitScale, 0.0001)) * 100));
</script>

<div class="nav" data-no-pan aria-label={label} role="group">
	<button
		onclick={() => (cam.zoomSmoothTo ? cam.zoomSmoothTo(1.5) : cam.zoomAt(1.5))}
		disabled={cam.k >= cam.maxScale}
		aria-label={t('view.zoomin')}
		title="{t('view.zoomin')}  +"
	>
		<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
			<path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
	</button>

	<button
		class="level mono"
		onclick={() => cam.fit()}
		aria-label={t('view.fit')}
		title="{t('view.fit')}  0"
	>
		{relative}%
	</button>

	<button
		onclick={() => (cam.zoomSmoothTo ? cam.zoomSmoothTo(1 / 1.5) : cam.zoomAt(1 / 1.5))}
		disabled={cam.k <= cam.minScale}
		aria-label={t('view.zoomout')}
		title="{t('view.zoomout')}  −"
	>
		<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
			<path d="M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
	</button>
</div>

<style>
	.nav {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		background: color-mix(in oklch, var(--surface-panel) 88%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		backdrop-filter: blur(8px);
		box-shadow: var(--elev-2);
		overflow: hidden;
	}

	button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 30px;
		color: var(--text-secondary);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}
	button:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	button:disabled {
		color: var(--text-faint);
		cursor: default;
	}
	button + button {
		border-top: 1px solid var(--border-subtle);
	}

	.level {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-tight);
		color: var(--text-muted);
	}

	@media (max-width: 900px) {
		button {
			width: var(--tap);
			height: 40px;
		}
	}
</style>
