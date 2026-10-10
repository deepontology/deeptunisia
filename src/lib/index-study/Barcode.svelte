<script lang="ts">
	/**
	 * The instrument hash drawn as bars.
	 *
	 * Not a scannable code. Each hex digit sets one bar's width and the gap after
	 * it, so two different hashes always draw differently and the formula's
	 * fingerprint is something a reader can see change between waves. The hash
	 * text sits beside it; this is the same value, not a decoration over it.
	 */
	let { hash }: { hash: string } = $props();

	const bars = $derived.by(() => {
		let x = 0;
		const out: Array<{ x: number; w: number }> = [];
		for (const ch of hash.slice(0, 40)) {
			const v = parseInt(ch, 16);
			if (Number.isNaN(v)) continue;
			const w = 1 + (v >> 2);
			out.push({ x, w });
			x += w + 1 + (v & 3);
		}
		return { out, width: x };
	});
</script>

<svg
	class="barcode"
	viewBox="0 0 {bars.width} 20"
	preserveAspectRatio="none"
	role="img"
	aria-label="sha256 {hash}"
	style="direction: ltr"
>
	{#each bars.out as b, i (i)}
		<rect x={b.x} y="0" width={b.w} height="20" />
	{/each}
</svg>

<style>
	.barcode {
		display: block;
		width: 100%;
		height: 1.6rem;
		fill: var(--text-primary);
	}
</style>
