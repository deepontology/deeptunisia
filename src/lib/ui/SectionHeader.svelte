<script lang="ts">
	/**
	 * The numbered section head of the Archive register: a mono `01 / THE INDEX`
	 * eyebrow, a heading in the reading face, an optional dek under it.
	 *
	 * This is the only section-heading style, so an archive page numbers its
	 * sections the same way everywhere a reader looks. The number is data, so pages
	 * pass the position they actually hold, never a hand-typed count.
	 */
	interface Props {
		/** Section position. Omit it and the eyebrow is the bare word. */
		n?: number;
		eyebrow: string;
		title: string;
		dek?: string;
	}

	let { n, eyebrow, title, dek }: Props = $props();

	const padded = $derived(n === undefined ? null : String(n).padStart(2, '0'));
</script>

<header class="section-header">
	<p class="eyebrow">
		{#if padded !== null}
			<span class="num">{padded}</span>
			<span class="slash" aria-hidden="true">/</span>
		{/if}
		<span class="word">{eyebrow}</span>
	</p>
	<h2 class="title">{title}</h2>
	{#if dek}
		<p class="dek">{dek}</p>
	{/if}
</header>

<style>
	.eyebrow {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		margin: 0 0 var(--s-3);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
	}
	/* Arabic has no letter case and its script does not track; the same rule
		   every letter-spaced label in the app follows. */
	:global([dir='rtl']) .eyebrow {
		letter-spacing: 0;
	}
	.num {
		color: var(--accent);
		font-weight: 600;
	}
	.slash {
		color: var(--text-faint);
		opacity: var(--dim);
	}
	.word {
		color: var(--text-muted);
	}

	.title {
		margin: 0;
		font-family: var(--font-read);
		font-size: var(--step-2);
		font-weight: 500;
		line-height: var(--lh-snug);
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}

	.dek {
		margin: var(--s-4) 0 0;
		max-width: var(--measure);
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}
</style>
