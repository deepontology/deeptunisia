<script lang="ts">
	/**
	 * The wave seal: the circular edition stamp from the reference, carrying the
	 * wave and the collection state. `live` adds a pulse only while the server
	 * reports the study as fielding; the stamp never claims a live wave the API
	 * has not confirmed.
	 */
	let {
		ring,
		center,
		live = false,
		joined = false
	}: { ring: string; center: string; live?: boolean; joined?: boolean } = $props();
	const id = `seal-${Math.random().toString(36).slice(2, 8)}`;
</script>

<!-- The ring runs clockwise from the left in every locale. An inherited RTL
     base direction would start the run at the path's end and push it off the
     circle; bidi still orders each script correctly inside the run. -->
<svg class="stamp" viewBox="0 0 120 120" role="img" aria-label="{ring} {center}" style="direction: ltr">
	<defs>
		<path id={id} d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
	</defs>
	<circle cx="60" cy="60" r="57" class="edge" />
	<circle cx="60" cy="60" r="35" class="edge thin" />
	<text class="ring" class:joined><textPath href="#{id}" startOffset="0">{ring}</textPath></text>
	<text class="center" x="60" y="64" text-anchor="middle">{center}</text>
	{#if live}
		<circle cx="60" cy="80" r="3" class="dot" />
	{/if}
</svg>

<style>
	.stamp {
		display: block;
		width: 100%;
		height: auto;
		transform: rotate(-8deg);
		color: var(--text-secondary);
		opacity: 0.85;
	}
	.edge {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.2;
	}
	.edge.thin {
		stroke-width: 0.7;
		stroke-dasharray: 2 2;
	}
	.ring {
		font-size: 9.5px;
		letter-spacing: 2.6px;
		text-transform: uppercase;
		fill: currentColor;
	}
	/* Arabic letters join: tracking breaks the joins and drops the run on a
	   curved path, so a joined script is set without it. */
	.ring.joined {
		letter-spacing: 0;
		text-transform: none;
		font-size: 10.5px;
	}
	.center {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 1px;
		fill: currentColor;
	}
	.dot {
		fill: var(--index-band-1);
		animation: pulse 2.4s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}
</style>
