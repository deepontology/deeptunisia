<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { Camera } from '$lib/viz/camera.svelte';
	import { navigable } from '$lib/viz/gestures';
	import { placeLabels } from '$lib/viz/place';
	import NavControls from '$lib/viz/NavControls.svelte';
	import { t, nameOf } from '$lib/t.svelte';
	import { cssVar } from '$lib/design/theme.svelte';

	/**
	 * Tunisia by governorate (spec §8.3).
	 *
	 * The polygons come from the geoBoundaries TUN ADM1 basemap
	 * (static/tn-adm.geojson, geoboundaries-tun-adm1) — nothing here is drawn by
	 * hand. The gazetteer (regions, places) comes from the graph build
	 * (static/geo.json), so the map can only place what the dataset sources.
	 * With no places authored yet the view shows the administrative layer alone,
	 * and the place layer renders the moment records exist.
	 */

	type Gov = {
		id: string;
		code: string;
		name: string;
		region: string;
		regionId: string;
		sources: string[];
		rings: [number, number][][];
		label: { x: number; y: number };
	};

	type Geom = { type?: string; coordinates?: unknown };

	/** Any GeoJSON geometry → a flat list of rings. The geoBoundaries basemap mixes
	 *  Polygon and MultiPolygon features (the islands are extra polygons), and the
	 *  old assumption that every feature is a Polygon fed non-point arrays to the
	 *  projection, which produced NaN on five governorates' labels and rings. */
	const ringsOf = (g: Geom): [number, number][][] => {
		if (!g.coordinates) return [];
		if (g.type === 'MultiPolygon') return (g.coordinates as [number, number][][][]).flat();
		if (g.type === 'Polygon') return g.coordinates as [number, number][][];
		return [];
	};

	let cam = $state<Camera>();
	let govs: Gov[] = $state([]);
	let world = $state({ w: 1, h: 1 });
	let selected: string | null = $state(null);
	/* Hover feedback: a selector map with no hover reads as a blank page.
	   State, not CSS :hover - fills are cssVar() attributes for engine
	   compatibility (see theme.svelte.ts), and attributes cannot express
	   hover. */
	let hovered: string | null = $state(null);
	let loading = $state(true);

	const regionLabel = (id: string): string => {
		const r = regionById.get(id);
		return r ? nameOf(r) : id;
	};
	// Region records from the build's geo.json (the same payload the map places).
	let regionById = new Map<string, { id: string; kind: string; name_en: string; name_fr?: string; name_ar?: string }>();

	onMount(async () => {
		const [adm, geo] = await Promise.all([
			fetch('/tn-adm.geojson').then((r) => r.json()),
			fetch('/geo.json').then((r) => r.json())
		]);
		regionById = new Map(
			geo.features
				.filter((f: { properties: { kind?: string } }) => f.properties.kind)
				.map((f: { properties: { id: string; kind: string; name_en: string; name_fr?: string; name_ar?: string } }) => [
					f.properties.id,
					{ id: f.properties.id, kind: f.properties.kind, name_en: f.properties.name_en, name_fr: f.properties.name_fr, name_ar: f.properties.name_ar }
				])
		);

		// Project lon/lat with an equirectangular fit over the basemap's extent.
		let minLon = Infinity,
			maxLon = -Infinity,
			minLat = Infinity,
			maxLat = -Infinity;
		for (const f of adm.features) {
			for (const ring of ringsOf(f.geometry)) {
				for (const [lon, lat] of ring) {
					if (lon < minLon) minLon = lon;
					if (lon > maxLon) maxLon = lon;
					if (lat < minLat) minLat = lat;
					if (lat > maxLat) maxLat = lat;
				}
			}
		}
		const k = 1000; // world units per degree of longitude
		const px = (lon: number) => (lon - minLon) * k;
		const py = (lat: number) => (maxLat - lat) * k;
		const W = (maxLon - minLon) * k;
		const H = (maxLat - minLat) * k;
		world = { w: W, h: H };

		const regionByCode = new Map<string, string>();
		const regionIdByCode = new Map<string, string>();
		for (const f of geo.features) {
			if (f.properties.kind === 'governorate' && f.properties.code) {
				regionByCode.set(f.properties.code, f.properties.parent ?? '');
				regionIdByCode.set(f.properties.code, f.properties.id);
			}
		}

		govs = adm.features
			.map((f: { properties: { shapeName: string; shapeISO: string }; geometry: Geom }) => {
				const rings = ringsOf(f.geometry)
					.map((ring) => ring.map(([lon, lat]: [number, number]) => [px(lon), py(lat)] as [number, number]))
					.filter((ring) => ring.length >= 2);
				const xs = rings.flat().map((p) => p[0]);
				const ys = rings.flat().map((p) => p[1]);
				const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
				const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
				return {
					id: regionIdByCode.get(f.properties.shapeISO) ?? f.properties.shapeISO,
					code: f.properties.shapeISO,
					name: f.properties.shapeName,
					region: regionByCode.get(f.properties.shapeISO) ?? '',
					regionId: regionByCode.get(f.properties.shapeISO) ?? '',
					sources: ['geoboundaries-tun-adm1'],
					rings,
					label: { x: cx, y: cy }
				} as Gov;
			})
			.sort((a: Gov, b: Gov) => a.id.localeCompare(b.id));

		cam = new Camera({ world, padding: 40 });
		loading = false;
	});

	// Deterministic labels through the same collision pass the other views use.
	const labels = $derived.by(() => {
		const c = cam;
		if (!c || govs.length === 0) return [];
		return placeLabels<Gov>(
			govs.map((g) => ({
				id: g.id,
				x: g.label.x,
				y: g.label.y,
				text: g.name,
				priority: 50,
				data: g
			})),
			{
				k: c.k,
				vw: c.vw,
				vh: c.vh,
				worldToScreen: (wx: number, wy: number) => ({ x: c.x + wx * c.k, y: c.y + wy * c.k })
			}
		);
	});

	const selectedGov = $derived(govs.find((g) => g.id === selected) ?? null);

	/**
	 * W2 deep link: `?region=` selects a governorate on arrival, once the async
	 * geo payload has populated `govs` (the id cannot be validated before that).
	 * One-shot — the URL is a door, not state that keeps re-applying.
	 */
	let regionLinked = false;
	$effect(() => {
		if (regionLinked || govs.length === 0) return;
		const want = page.url.searchParams.get('region');
		if (want && govs.some((g) => g.id === want)) {
			regionLinked = true;
			selected = want;
		}
	});

	// W2: keep ?region= in step with the selection. replaceState, never pushState —
	// a selection is not navigation history.
	//
	// Gated on the payload being loaded AND the arrival link having been read:
	// at mount, before the async geo fetch resolves, `selected` is null and this
	// effect would strip a `?region=` the reader just arrived on — then the
	// restore would no-op against the stale base. (Caught by the W2 smoke round
	// trip: cold /map?region=gov-tunis rendered the selection but dropped the
	// param from the URL.)
	$effect(() => {
		if (govs.length === 0 || !regionLinked) return;
		const u = new URL(page.url.href);
		if (selected) u.searchParams.set('region', selected);
		else u.searchParams.delete('region');
		if (u.href !== page.url.href) replaceState(u, '');
	});

	$effect(() => {
		// Keep the chosen governorate in view when the selection moves.
		if (cam && selectedGov) cam.flyTo(selectedGov.label.x, selectedGov.label.y);
	});
</script>

<svelte:head>
	<title>{t('nav.map')} · DeepTunisia</title>
	<meta name="description" content={t('nav.map.hint')} />
</svelte:head>

<section class="map-view">
	<header class="map-head">
		<h1>{t('nav.map')}</h1>
		<p class="sub">{t('nav.map.hint')}</p>
	</header>

	{#if loading}
		<p class="loading">{t('load')}</p>
	{:else if cam}
		<div class="canvas-wrap">
			<svg
				class="canvas"
				use:navigable={{ cam }}
				role="img"
				aria-label={t('map.aria')}
				style="width:100%;height:100%;touch-action:none"
			>
				<g transform="translate({cam.x} {cam.y}) scale({cam.k})">
					<g>
						{#each govs as g (g.id)}
							<path
								d={g.rings
									.map(
										(ring) =>
											'M' +
											ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') +
											' Z'
									)
									.join(' ')}
								fill={
									selected === g.id
										? cssVar('--accent', '#666')
										: hovered === g.id
											? cssVar('--surface-overlay', '#333')
											: cssVar('--surface-raised', '#efece4')
								}
								stroke={selected === g.id || hovered === g.id ? cssVar('--text-primary', '#222') : cssVar('--text-secondary', '#999')}
								stroke-width={selected === g.id ? 2 : hovered === g.id ? 1.4 : 1}
								tabindex="0"
								role="button"
								aria-label={`${g.name} (${g.code})`}
								class:selected={selected === g.id}
								onclick={() => (selected = g.id)}
								onmouseenter={() => (hovered = g.id)}
								onmouseleave={() => (hovered = null)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										selected = g.id;
									}
								}}
							/>
						{/each}
					</g>
					<g aria-hidden="true">
						{#each labels as l (l.id)}
							<text
								x={l.x}
								y={l.y}
								text-anchor="middle"
								dominant-baseline="middle"
								class="gov-label"
								font-size={13 / (cam?.k ?? 1)}
								fill={cssVar('--text-primary', '#222')}
								style="pointer-events:none;user-select:none"
							>
								{l.text}
							</text>
						{/each}
					</g>
				</g>
			</svg>
			<NavControls {cam} />
		</div>

		{#if selectedGov}
			<aside class="gov-card" role="status">
				<h2>{selectedGov.name} <span class="code">({selectedGov.code})</span></h2>
				{#if selectedGov.regionId}
					<p class="region">{t('map.region')}: {regionLabel(selectedGov.regionId)}</p>
				{/if}
				<dl>
					<dt>{t('map.sources')}</dt>
					<dd>{selectedGov.sources.length} · {t('map.basemap')}</dd>
				</dl>
				<button class="close" onclick={() => (selected = null)} aria-label={t('map.close')}>
					{t('map.close')}
				</button>
			</aside>
		{/if}

		<details class="table-alt">
			<summary>{t('map.table')}</summary>
			<table>
				<thead>
					<tr>
						<th>{t('map.code')}</th>
						<th>{t('map.governorate')}</th>
						<th>{t('map.region')}</th>
					</tr>
				</thead>
				<tbody>
					{#each govs as g}
						<tr>
							<td>{g.code}</td>
							<td>{g.name}</td>
							<td>{regionLabel(g.regionId)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{/if}
</section>

<style>
	.map-view {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 24px;
		height: 100%;
		min-width: 0;
	}
	.map-head h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	.sub {
		margin: 4px 0 0;
		color: var(--text-secondary);
	}
	.loading {
		color: var(--text-secondary);
	}
	.canvas-wrap {
		position: relative;
		flex: 1;
		min-height: 320px;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
	}
	.canvas {
		display: block;
	}
	:global(.gov-label) {
		font-weight: 500;
		letter-spacing: 0.01em;
	}
	.canvas :global(path) {
		cursor: pointer;
		transition: fill 120ms ease;
	}
	.canvas :global(path:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.gov-card {
		position: absolute;
		inset-inline-end: 24px;
		top: 160px;
		background: var(--surface-overlay);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 14px 16px;
		max-width: 280px;
		box-shadow: var(--shadow-1);
	}
	.gov-card h2 {
		margin: 0 0 6px;
		font-size: 1.05rem;
	}
	.code {
		color: var(--text-secondary);
		font-size: 0.85rem;
	}
	.region {
		margin: 0 0 8px;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}
	dl {
		margin: 0;
		font-size: 0.85rem;
	}
	dl dt {
		color: var(--text-secondary);
	}
	dl dd {
		margin: 0;
	}
	.close {
		margin-top: 10px;
	}
	.table-alt {
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 8px 12px;
	}
	.table-alt table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 8px;
		font-size: 0.9rem;
	}
	.table-alt th,
	.table-alt td {
		text-align: start;
		padding: 4px 8px;
		border-bottom: 1px solid var(--border);
	}
	@media (max-width: 640px) {
		.map-view {
			padding: 16px;
		}
		.gov-card {
			position: static;
			max-width: none;
			margin-top: 4px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.canvas :global(path) {
			transition: none;
		}
	}
</style>
