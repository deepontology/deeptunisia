<script lang="ts" module>
	export interface ChamberSeat {
		/** Unit hemicycle coordinates: x across, y toward the back (negative), r the row radius 0.4..1. */
		x: number;
		y: number;
		r: number;
		/** A CSS colour (a var() is fine), or null for a seat with no recorded holder. */
		color: string | null;
		dim: boolean;
		/** The basis of the claim that seats this person, carried into the room. */
		basis: 'documented' | 'reported' | 'inferred' | 'unsubstantiated' | null;
		key: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';

	/**
	 * The chamber in three dimensions.
	 *
	 * WHAT THE DEPTH IS FOR
	 *
	 * The flat hemicycle answers "how many seats does each group hold"; the room
	 * answers "this is a place, and these are people sitting in it". The camera
	 * arrives from straight above, where the chamber reads exactly as the flat
	 * diagram and the map it came from, then tilts down into the room. That one
	 * move is the transition from the map to the institution, and it is the only
	 * animation that plays on its own. Everything else moves because the reader
	 * moved it: a term change glides the seats to their new places, a drag turns
	 * the room a little.
	 *
	 * WHY IT RENDERS ON DEMAND
	 *
	 * Most visits are on phones. A loop drawing sixty frames a second of a room
	 * that is standing still would drain a battery to show nothing, so a frame is
	 * drawn only while something is moving and the loop stops when it settles.
	 *
	 * Three.js is imported when this component mounts, so no other page carries it.
	 */

	interface Props {
		seats: ChamberSeat[];
		/** Changes when the term changes, so the arrival plays again. */
		termKey: string;
		onhover: (i: number | null) => void;
		onpick: (i: number) => void;
		onfail?: () => void;
	}

	let { seats, termKey, onhover, onpick, onfail }: Props = $props();

	let host: HTMLDivElement;
	let api: {
		update: (s: ChamberSeat[]) => void;
		arrive: () => void;
		retheme: () => void;
		destroy: () => void;
	} | null = null;

	onMount(() => {
		let disposed = false;
		import('./chamber-scene').then(({ createChamber }) => {
			if (disposed) return;
			try {
				api = createChamber(host, {
					onhover: (i) => onhover(i),
					onpick: (i) => onpick(i),
					reduced: () => prefersReducedMotion.current
				});
				api.update(seats);
				api.arrive();
			} catch {
				onfail?.();
			}
		}, () => onfail?.());
		const obs = new MutationObserver(() => api?.retheme());
		obs.observe(document.documentElement, { attributeFilter: ['data-theme', 'style', 'data-palette'] });
		return () => {
			disposed = true;
			obs.disconnect();
			api?.destroy();
		};
	});

	$effect(() => {
		const s = seats;
		api?.update(s);
	});

	let lastTerm = '';
	$effect(() => {
		const k = termKey;
		if (lastTerm && k !== lastTerm) api?.arrive();
		lastTerm = k;
	});
</script>

<div class="chamber" bind:this={host}></div>

<style>
	.chamber {
		position: absolute;
		inset: 0;
		touch-action: none;
		cursor: grab;
	}
	.chamber :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
