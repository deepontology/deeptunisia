<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * An accessible disclosure: the native `<details>` element, so the keyboard,
	 * the announcement and the find-in-page behaviour all come from the platform
	 * rather than from scripted ARIA.
	 *
	 * This exists to give every disclosure in a reading page one summary style:
	 * same marker, same type, same boundary, instead of each route growing its
	 * own `<details>` CSS and drifting.
	 */
	interface Props {
		open?: boolean;
		summary: Snippet;
		children: Snippet;
	}

	let { open = false, summary, children }: Props = $props();
</script>

<details class="disclosure" {open}>
	<summary>
		<span class="summary-text">{@render summary()}</span>
	</summary>
	<div class="body">{@render children()}</div>
</details>

<style>
	.disclosure {
		border-bottom: var(--rule);
	}

	summary {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		min-height: var(--s-9);
		padding: var(--s-2) var(--s-4);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	:global([dir='rtl']) summary {
		letter-spacing: 0;
	}
	summary::before {
		content: '▸';
		font-size: 9px;
		/* Duration and easing come from the tokens, which collapse to nothing
		   under prefers-reduced-motion: the marker still flips, it stops moving. */
		transition: transform var(--dur-fast) var(--ease-out);
	}
	/* The marker points the way the content opens; mirrored, it points back in
	   RTL where reading runs the other way. */
	:global([dir='rtl']) summary::before {
		content: '◂';
	}
	.disclosure[open] summary::before {
		transform: rotate(90deg);
	}
	:global([dir='rtl']) .disclosure[open] summary::before {
		transform: rotate(-90deg);
	}
	summary:hover {
		color: var(--text-primary);
	}
	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.body {
		padding: 0 var(--s-4) var(--s-4);
	}

	/* A thumb needs 44px and a mouse does not. Raising the floor only where the
	   pointer is coarse keeps a reading page as quiet as it is on desktop. */
	@media (pointer: coarse) {
		summary {
			min-height: var(--touch);
		}
	}
</style>
