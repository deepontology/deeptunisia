<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * A figure that counts up once, the first time it comes into view.
	 *
	 * The final value is what is rendered on the server and what a reader with
	 * reduced motion sees; the count only plays in a browser that allows it.
	 */
	let { value, format }: { value: number; format: (v: number) => string } = $props();

	let el: HTMLSpanElement;
	let shown = $state<number | null>(null);
	const out = $derived(format(shown ?? value));

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let raf = 0;
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				io.disconnect();
				const target = value;
				const start = performance.now();
				const dur = 1100;
				const step = (now: number) => {
					const p = Math.min(1, (now - start) / dur);
					shown = Math.round(target * (1 - Math.pow(1 - p, 3)));
					if (p < 1) raf = requestAnimationFrame(step);
					else shown = null;
				};
				shown = 0;
				raf = requestAnimationFrame(step);
			},
			{ threshold: 0.6 }
		);
		io.observe(el);
		return () => {
			io.disconnect();
			cancelAnimationFrame(raf);
		};
	});
</script>

<span bind:this={el} class="count">{out}</span>

<style>
	.count {
		font-variant-numeric: tabular-nums;
	}
</style>
