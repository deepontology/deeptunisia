<script lang="ts">
	import { onMount } from 'svelte';
	import { ds } from '$lib/model';
	import { theme } from '$lib/design/theme.svelte';
	import { t } from '$lib/t.svelte';

	/**
	 * Boot sequence.
	 *
	 * Deliberately counts something real. The number climbing is the actual record
	 * total in the graph — sources, institutions, people, positions, relationships,
	 * events — accumulated stage by stage. A fake progress bar would be a small lie
	 * on the front door of a project whose whole argument is that it does not lie
	 * about what it knows, and the honest version is more interesting anyway: by the
	 * time the reader reaches the timeline they have already seen the shape of the
	 * evidence base.
	 *
	 * Runs once per session, and not at all for readers who ask for reduced motion.
	 */

	let { onDone }: { onDone: () => void } = $props();

	const STAGES = [
		{ label: 'Reading sources', n: ds.meta.counts.sources },
		{ label: 'Mapping institutions', n: ds.meta.counts.institutions + ds.meta.counts.roles },
		{ label: 'Resolving identities', n: ds.meta.counts.people },
		{ label: 'Reconstructing tenures', n: ds.meta.counts.positions },
		{ label: 'Tracing connections', n: ds.meta.counts.relationships },
		{ label: 'Indexing events', n: ds.meta.counts.events }
	];

	const TOTAL = STAGES.reduce((s, x) => s + x.n, 0);
	const DURATION = 1750;

	let count = $state(0);
	let stageIndex = $state(0);
	let progress = $state(0);
	let leaving = $state(false);

	const label = $derived(STAGES[Math.min(stageIndex, STAGES.length - 1)].label);

	onMount(() => {
		if (theme.reduceMotion) {
			onDone();
			return;
		}

		const start = performance.now();
		let raf = 0;

		const frame = (now: number) => {
			const p = Math.min(1, (now - start) / DURATION);
			// Ease out so the count decelerates into its final value rather than
			// stopping dead.
			const eased = 1 - Math.pow(1 - p, 2.4);
			progress = p;
			count = Math.round(eased * TOTAL);

			// Which stage the accumulated count falls into.
			let acc = 0;
			for (let i = 0; i < STAGES.length; i++) {
				acc += STAGES[i].n;
				if (count <= acc) {
					stageIndex = i;
					break;
				}
				stageIndex = i;
			}

			if (p < 1) {
				raf = requestAnimationFrame(frame);
			} else {
				count = TOTAL;
				leaving = true;
				setTimeout(onDone, 520);
			}
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="boot" class:leaving aria-hidden={leaving}>
	<div class="core" role="status" aria-live="polite">
		<span class="label">{label}</span>

		<div class="figure">
			<span class="count mono">{count.toLocaleString('en-US')}</span>
			<span class="unit mono">records</span>

			<span class="pulse" aria-hidden="true">
				<svg viewBox="0 0 28 28" width="26" height="26">
					<circle
						cx="14"
						cy="14"
						r="10"
						fill="none"
						stroke="var(--accent)"
						stroke-width="1"
						stroke-opacity="0.55"
					/>
					<circle class="ring2" cx="14" cy="14" r="10" fill="none" stroke="var(--accent)" stroke-width="1" />
					<circle cx="14" cy="14" r="2.6" fill="var(--accent)" />
				</svg>
			</span>
		</div>

		<div class="rule">
			<span class="fill" style:transform="scaleX({progress})"></span>
		</div>

		<div class="wordmark">
			<span>Deep<b>Tunisia</b></span>
			<span class="sub">{t('boot.sub')}</span>
		</div>
	</div>
</div>

<style>
	.boot {
		position: fixed;
		inset: 0;
		z-index: 500;
		display: grid;
		place-items: center;
		background: var(--surface-base);
		transition:
			opacity var(--dur-slower) var(--ease-in-out),
			filter var(--dur-slower) var(--ease-in-out);
	}
	.boot.leaving {
		opacity: 0;
		filter: blur(6px);
		pointer-events: none;
	}

	.core {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-4);
		width: min(420px, calc(100vw - 48px));
		animation: rise-in var(--dur-slow) var(--ease-out);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.figure {
		display: flex;
		align-items: baseline;
		gap: var(--s-4);
		width: 100%;
	}
	.count {
		font-size: var(--t-3xl);
		font-weight: 400;
		letter-spacing: 0.16em;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.unit {
		font-size: var(--t-xs);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.pulse {
		margin-inline-start: auto;
		display: grid;
		place-items: center;
	}
	/* Second ring expands and fades, so the mark reads as a live signal rather than
	   a static logo. */
	.ring2 {
		transform-origin: center;
		animation: sonar 1.9s var(--ease-out) infinite;
	}
	@keyframes sonar {
		0% {
			transform: scale(0.45);
			stroke-opacity: 0.9;
		}
		100% {
			transform: scale(1.3);
			stroke-opacity: 0;
		}
	}

	.rule {
		position: relative;
		width: 100%;
		height: 1px;
		background: var(--border-default);
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0;
		background: var(--text-primary);
		transform-origin: left center;
		will-change: transform;
	}
	:global([dir='rtl']) .fill {
		transform-origin: right center;
	}

	.wordmark {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-top: var(--s-5);
	}
	.wordmark span {
		font-size: var(--t-sm);
		color: var(--text-muted);
		letter-spacing: var(--track-tight);
	}
	.wordmark b {
		font-weight: 620;
		color: var(--text-primary);
	}
	.wordmark .sub {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: 0.14em;
		color: var(--text-faint);
	}
</style>
