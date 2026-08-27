<script lang="ts">
	import { geoGraticule10, type GeoProjection } from 'd3-geo';
	import { feature, mesh } from 'topojson-client';
	import type { Topology, GeometryCollection } from 'topojson-specification';
	import {
		countryOf,
		flows,
		debt,
		tradeIn,
		debtIn,
		energyIn,
		institutionalDebtIn
	} from '$lib/world/countries';
	import { loadTopology } from '$lib/world/topology';
	import { scaleSqrt } from 'd3-scale';
	import Segmented from '$lib/ui/Segmented.svelte';
	import { Globe, pathFor, TUNISIA } from '$lib/world/globe.svelte';
	import { navigable } from '$lib/viz/gestures';
	import { placeLabels, type LabelCandidate } from '$lib/viz/place';
	import NavControls from '$lib/viz/NavControls.svelte';
	import FlowCard, { type FlowSelection } from './FlowCard.svelte';
	import { cssVar } from '$lib/design/theme.svelte';
	import { app } from '$lib/state.svelte';
	import { ds, LAYER_COLOR } from '$lib/model';
	import { t, tf, nameOf } from '$lib/t.svelte';
	import { world, type WorldFamily } from '$lib/world/store.svelte';

	/**
	 * The world view: Tunisia's external relations on a globe.
	 *
	 * WHY A GLOBE AND NOT A MAP
	 *
	 * Every flat projection has to cut the world somewhere, and wherever the cut goes
	 * it makes two countries that trade heavily look like opposite ends of the page.
	 * On a Mercator centred on Europe, Tunisia's relationships with China and with the
	 * United States run off opposite edges, which is precisely backwards: the whole
	 * claim of this view is that these are all radii of one thing. A sphere has no
	 * edge to fall off, and an arc between two countries is a real great circle rather
	 * than a line whose curvature is an artefact of the projection.
	 *
	 * The cost is that half the world is always hidden. That is a real cost, and it is
	 * paid deliberately: the reader turns the globe, and turning it is what tells them
	 * the far side exists. A flat map that shows everything at once shows all of it
	 * wrong.
	 *
	 * WHY CANVAS UNDERNEATH AND SVG ON TOP
	 *
	 * The sphere, the graticule and 175 country outlines are redrawn on every frame of
	 * a drag. As SVG that is 175 path re-layouts per frame and the rotation stutters on
	 * a phone. As canvas it is one draw call and it does not.
	 *
	 * Everything the reader can point at stays in the DOM: hover, focus, keyboard
	 * traversal, `<title>`, `var(--layer-*)` fills that follow the theme with no
	 * JavaScript, and Arabic labels that lay themselves out because they are real text.
	 * Rebuilding those four on canvas is exactly the work a WebGL globe would have
	 * imposed, and it is why this is not one.
	 *
	 * THE ONE PLACE COLOUR LIVES IN JAVASCRIPT
	 *
	 * Canvas cannot read a CSS custom property, so the draw call resolves tokens with
	 * `cssVar()`. Per the note at the bottom of theme.svelte.ts, that result is NEVER
	 * cached and there is NO reactive counter invalidating it — an earlier attempt at
	 * that pattern wrote state inside the effect that read it, which self-triggers and
	 * blanked the whole app.
	 *
	 * The repaint is instead triggered by watching `data-theme` land on the document.
	 * Depending on `theme.resolved` looks equivalent and is not; see the effect below
	 * for the ordering bug that distinction cost.
	 */

	/*
	 * The topology arrives at runtime, not in the bundle (see topology.ts).
	 * The globe paints its chrome — the control surface, the SVG layer, the
	 * labels — the moment the component mounts, and the land appears when the
	 * geometry lands. A loading state stands in until then; the table
	 * alternative is the ledger view, one switch away (world.store).
	 */
	let topo: Topology | null = $state(null);
	let topoError = $state(false);
	$effect(() => {
		let alive = true;
		loadTopology()
			.then((t) => {
				if (alive) {
					topo = t;
					topoError = false;
				}
			})
			.catch(() => {
				if (alive) topoError = true;
			});
		return () => {
			alive = false;
		};
	});

	const countries = $derived.by(() => {
		if (!topo) return null;
		return feature(topo, topo.objects.countries as GeometryCollection<{ name: string }>);
	});
	/**
	 * Interior borders as one path, rather than stroking 175 outlines.
	 *
	 * A shared border stroked twice — once from each side — is visibly heavier than a
	 * coastline, and at low zoom the accumulated double-strokes read as a grid over
	 * the land. `mesh` with the two-argument filter emits each internal boundary once.
	 */
	const borders = $derived.by(() => {
		if (!topo) return null;
		return mesh(topo, topo.objects.countries as GeometryCollection, (a, b) => a !== b);
	});
	/**
	 * The coastline: every boundary that is not shared with another country.
	 *
	 * Stroked separately and more strongly than the interior borders, because the
	 * land/sea edge is the one line on this map that carries no data and yet decides
	 * whether any of the rest is legible. The first version relied on the fill
	 * difference alone — `--surface-sunken` under `--surface-raised` — and those are
	 * adjacent steps on an elevation ramp meant for stacking panels, about two percent
	 * of lightness apart. In light theme they compress further still, since
	 * `--surface-panel` and `--surface-overlay` are both plain `--n-0`. The result was
	 * a sphere with continents you had to hunt for.
	 *
	 * Strengthening the line rather than the fill is also the cartographically correct
	 * answer: it keeps the land quiet enough to carry arcs and labels on top, which a
	 * high-contrast fill would fight.
	 */
	const coast = $derived.by(() => {
		if (!topo) return null;
		return mesh(topo, topo.objects.countries as GeometryCollection, (a, b) => a === b);
	});
	const graticule = geoGraticule10();

	const globe = new Globe();

	let canvas = $state<HTMLCanvasElement | null>(null);

	/** Screen position of Tunisia, for the marker in the SVG layer. */
	const tunis = $derived.by(() => {
		const p = globe.projection([TUNISIA[0], TUNISIA[1]]);
		return p && globe.visible(TUNISIA[0], TUNISIA[1]) ? p : null;
	});

	/**
	 * The countries the knowledge graph already knows something about.
	 *
	 * Not every country — 172 anonymous dots would say nothing. These are the fifteen
	 * `foreign-state` institutions that already carry a sourced summary, `diplomatic`
	 * relationships and their own Agora threads, joined to geography by the single
	 * `iso2` field added to the schema. Clicking one opens the same `EntityPanel` it
	 * opens from the network, because it is the same record; the globe is a second
	 * way in, not a second copy.
	 *
	 * When the flow datasets land, this list becomes "every country Tunisia has a
	 * measured relationship with" and the join stays exactly as it is.
	 */
	interface Place {
		/** Institution id where one exists; otherwise the alpha-2, for keying only. */
		id: string;
		iso2: string;
		lon: number;
		lat: number;
		name: string;
		/**
		 * Whether the graph holds a record for this country.
		 *
		 * The distinction is drawn, not hidden. A country Tunisia has a treaty with but
		 * no entry for is a gap in the dataset, and this project's habit everywhere else
		 * — the open-questions page, the review counters, the Known limits section — is
		 * to show the gap rather than let a blank space imply there is nothing there.
		 * Solid dot: a record you can open. Hollow dot: a place we have not written up.
		 */
		hasRecord: boolean;
	}

	const places = $derived.by(() => {
		const byIso: Map<string, Place> = new Map();

		for (const inst of ds.institutions) {
			const iso2 = (inst as { iso2?: string }).iso2;
			const c = countryOf(iso2);
			if (!iso2 || !c) continue; // build-world.ts fails before this can happen
			byIso.set(iso2, {
				id: inst.id,
				iso2,
				lon: c.anchor[0],
				lat: c.anchor[1],
				// The graph's own name, not CLDR's. The institution record is what the
				// reader clicks through to, and a globe that calls it one thing while
				// the panel calls it another reads as two different places.
				name: nameOf(inst),
				hasRecord: true
			});
		}

		// Countries on the far end of an agreement that the graph has not written up.
		// Without these an arc simply stops in open ocean.
		for (const ag of ds.agreements ?? []) {
			for (const party of ag.parties) {
				if (!/^[A-Z]{2}$/.test(party) || byIso.has(party)) continue;
				const c = countryOf(party);
				if (!c) continue;
				byIso.set(party, {
					id: party,
					iso2: party,
					lon: c.anchor[0],
					lat: c.anchor[1],
					name: c.names[app.locale] ?? c.names.en,
					hasRecord: false
				});
			}
		}

		// Trade, energy and debt partners: every country Tunisia has a flow with
		// gets a dot so arcs never terminate in empty ocean. No snapshot (flows is
		// null) means no dots — the same degradation every other consumer here uses.
		// Filtered to the top 30 by max yearly total so the globe does not drown
		// in 211 teal dots for micro-flows that have no other role in the graph.
		if (flows) {
			const topFlows = new Set(
				Object.entries(flows.partners)
					.map(([iso2, row]) => {
						let max = 0;
						for (let i = 0; i < row.out.length; i++) {
							const v = (row.out[i] ?? 0) + (row.in[i] ?? 0);
							if (v > max) max = v;
						}
						return { iso2, max };
					})
					.sort((a, b) => b.max - a.max)
					.slice(0, 30)
					.map((d) => d.iso2)
			);
			for (const iso2 of Object.keys(flows.partners)) {
				if (byIso.has(iso2)) continue;
				if (!topFlows.has(iso2)) continue;
				const c = countryOf(iso2);
				if (!c) continue;
				byIso.set(iso2, {
					id: iso2,
					iso2,
					lon: c.anchor[0],
					lat: c.anchor[1],
					name: c.names[app.locale] ?? c.names.en,
					hasRecord: false
				});
			}
			// Debt-only creditors that never appear in trade (rare, but arcs would
			// otherwise end in ocean). Keep all 39 — they are already filtered by
			// the debt snapshot and are never the source of the 211-dot clutter.
			if (debt) {
				for (const iso2 of Object.keys(debt.creditors)) {
					if (byIso.has(iso2)) continue;
					const c = countryOf(iso2);
					if (!c) continue;
					byIso.set(iso2, {
						id: iso2,
						iso2,
						lon: c.anchor[0],
						lat: c.anchor[1],
						name: c.names[app.locale] ?? c.names.en,
						hasRecord: false
					});
				}
			}
		}

		return [...byIso.values()];
	});

	/**
	 * Agreement arcs: one per (agreement, country party).
	 *
	 * WHY MULTILATERAL AGREEMENTS DRAW NOTHING YET
	 *
	 * An agreement's parties are either states — which have a place on the globe —
	 * or bodies that do not: the European Union, the WTO, COMESA. Four of the seven
	 * records are with a body, including the Association Agreement, which governs
	 * most of Tunisia's actual trade. Drawing those as arcs to the twenty-seven EU
	 * member states would assert twenty-seven bilateral treaties that do not exist,
	 * so for now they draw no line and appear only in the record.
	 *
	 * The honest fix is to give an international organisation its seat — Brussels,
	 * Geneva, Lusaka, Addis Ababa — and run the arc there, since that is a real and
	 * citable fact about where the counterparty sits. That needs a sourced field per
	 * institution and belongs with the trade data rather than ahead of it.
	 *
	 * An arc is dropped only when BOTH ends are behind the horizon. One end hidden is
	 * fine and in fact necessary: the projection clips the great circle at the limb,
	 * and watching a line disappear over the edge is most of what makes the sphere
	 * read as a sphere rather than a disc.
	 */
	/** The year the time cursor is sitting on. */
	const year = $derived(new Date(app.t).getUTCFullYear());

	/**
	 * Which family of relationship the globe is drawing.
	 *
	 * One at a time rather than all at once. Trade and debt are both radial fans from
	 * the same point, and superimposed they read as one undifferentiated starburst —
	 * the reader cannot tell which line means Tunisia sold something and which means
	 * Tunisia owes something. Treaties stay visible under both because there are seven
	 * of them and they are a different visual weight entirely.
	 *
	 * Held in the shared world store rather than locally: the ledger reads the same
	 * family, so switching views keeps the reader on the quantity they were looking
	 * at. A local `$effect` follows external changes (the ledger's family switcher),
	 * and local changes are written back out.
	 */
	type Family = 'trade' | 'debt' | 'energy';
	let family = $state<Family>(world.family as Family);
	$effect(() => {
		if (world.family !== family) family = world.family as Family;
	});
	const families = $derived([
		{ value: 'trade', label: t('world.trade') },
		{ value: 'energy', label: t('world.energy') },
		{ value: 'debt', label: t('world.debt') }
	]);

	/** Non-country lenders, which have no place on the globe. See loadDebt. */
	const offGlobe = $derived(family === 'debt' ? institutionalDebtIn(year).slice(0, 6) : []);

	const lenderKeys: Record<string, string> = {
		'World Bank-IDA': 'world.lender.world-bank-ida',
		'World Bank-IBRD': 'world.lender.world-bank-ibrd',
		Czechoslovakia: 'world.lender.czechoslovakia',
		Bondholders: 'world.lender.bondholders',
		'African Dev. Bank': 'world.lender.african-dev-bank',
		'International Finance Corporation': 'world.lender.international-finance-corporation',
		'Arab Fund for Economic & Social Development': 'world.lender.arab-fund',
		'Multiple Lenders': 'world.lender.multiple-lenders',
		'OPEC Fund for International Dev.': 'world.lender.opec-fund',
		'Islamic Dev. Bank': 'world.lender.islamic-dev-bank',
		'European Investment Bank': 'world.lender.european-investment-bank',
		'International Fund for Agricultural Dev.': 'world.lender.international-fund-agricultural-development',
		'European Development Fund (EDF)': 'world.lender.european-development-fund',
		'Nordic Investment Bank': 'world.lender.nordic-investment-bank',
		'Arab Bank for Economic Dev. in Africa (BADEA)': 'world.lender.arab-bank-economic-development-africa',
		'European Social Fund (ESF)': 'world.lender.european-social-fund',
		'European Union': 'world.lender.european-union',
		'European Bank for Reconstruction and Dev. (EBRD)': 'world.lender.ebrd',
		'Arab Monetary Fund': 'world.lender.arab-monetary-fund',
		'World Trade Organization': 'world.lender.world-trade-organization',
		'African Export-Import Bank': 'world.lender.african-export-import-bank'
	};

	function lenderName(name: string): string {
		const key = lenderKeys[name];
		return key ? t(key) : name;
	}

	/**
	 * The arc the reader clicked, if any.
	 *
	 * Held here rather than in `app` because it is a transient inspection, not a
	 * selection the rest of the app should follow — clicking an arc must not change
	 * what the Inspector is showing, which is the country record.
	 */
	let picked = $state<FlowSelection | null>(null);

	/**
	 * Trade arcs for the year under the cursor.
	 *
	 * WHY ONLY THE TOP PARTNERS
	 *
	 * A hundred and ninety arcs from one point is a starburst that says only "Tunisia
	 * trades with everywhere". The top twenty carry the overwhelming majority of the
	 * value and are the claim the view exists to make; the rest is a tail that costs
	 * legibility and adds nothing a reader can act on. The cut is by value, so it
	 * moves with the cursor rather than being a fixed list — which is the point.
	 *
	 * WHY SQRT AND NOT LINEAR
	 *
	 * Stroke width is a length, but the eye reads a thick line as an area. A linear
	 * map from value to width makes France's four billion look like forty times
	 * Algeria's four hundred million rather than ten. `scaleSqrt` is the same
	 * correction a proportional-symbol map makes, and for the same reason.
	 */
	const trade = $derived.by(() => {
		const rows: {
			iso2: string;
			/** Unique per arc: a country code, or an institution id for a lending body. */
			key: string;
			weight: number;
			/** The partner's own figure for the same pair, where it filed one. */
			counter: number | null;
			/**
			 * What the card shows when this arc is clicked.
			 *
			 * Narrowed to the measurement variants: this list is trade, energy and debt,
			 * never agreements, and typing it as the full union let `countryName` be
			 * spread onto a shape that has no such field.
			 */
			select: Extract<FlowSelection, { kind: 'trade' | 'energy' | 'debt' }>;
			title: (name: string) => string;
		}[] =
			family === 'energy'
				? (flows ? energyIn(year) : []).slice(0, 20).map((r) => ({
						iso2: r.iso2,
						key: r.iso2,
						weight: r.total,
						counter: null,
						select: { kind: 'energy', iso2: r.iso2, countryName: '', year },
						title: (name: string) => {
							/*
							 * Named per fuel, and in the direction that is actually happening.
							 * Tunisia both sold and bought crude for most of the period, and a
							 * single "energy" number would hide that it flipped from a net
							 * exporter to a net importer around 1990.
							 */
							const parts = Object.entries(r.fuels)
								.filter(([, v]) => v.out > 0 || v.in > 0)
							.map(([fuel, v]) => {
									const values = [
										v.in > 0 ? tf('world.tooltip.energy.bought', { value: money(v.in) }) : null,
										v.out > 0 ? tf('world.tooltip.energy.sold', { value: money(v.out) }) : null
									].filter((value): value is string => value !== null);
									return tf('world.tooltip.energy.line', {
										fuel: t(`world.fuel.${fuel}`),
										values: values.join(', ')
									});
								});
							return tf('world.tooltip.energy', { name, year, details: parts.join('\n') });
						}
					}))
				: family === 'trade'
					? (flows ? tradeIn(year) : []).slice(0, 20).map((r) => ({
						iso2: r.iso2,
						key: r.iso2,
						weight: r.total,
						counter: r.mirrorTotal,
						select: { kind: 'trade', iso2: r.iso2, countryName: '', year },
						 title: (name: string) => {
							const own = tf('world.tooltip.trade.own', {
								heading: t('world.tunisiasays'),
								exports: t('world.exports'),
								imports: t('world.imports'),
								out: money(r.out),
								in: money(r.in)
							});
							const mirror =
								r.mirrorTotal === null
									? t('world.nocounter')
									: r.gap === null
										? tf('world.tooltip.trade.mirror', {
												heading: t('world.partnersays'),
												exports: t('world.exports'),
												imports: t('world.imports'),
												out: money(r.mirrorOut),
												in: money(r.mirrorIn)
											})
										: tf('world.tooltip.trade.mirror.gap', {
												heading: t('world.partnersays'),
												exports: t('world.exports'),
												imports: t('world.imports'),
												out: money(r.mirrorOut),
												in: money(r.mirrorIn),
												gap: new Intl.NumberFormat(app.locale, { style: 'percent', maximumFractionDigits: 0 }).format(r.gap)
											});
							return tf('world.tooltip.trade', { name, year, own, mirror });
						}
					}))
				: (debt ? debtIn(year) : []).slice(0, 20).map((r) => ({
						// A lending body and its host country would collide on one key, so
						// the institution id disambiguates when there is one.
						iso2: r.iso2,
						key: r.institutionId ?? r.iso2,
						weight: r.stock ?? 0,
						counter: null,
						select: { kind: 'debt', iso2: r.iso2, countryName: '', institutionId: r.institutionId, year },
						title: (name: string) => {
							// Named for the lender, never the host: World Bank debt drawn to
							// Washington is not United States bilateral debt.
							const who = r.institutionId
								? nameOf(ds.institutions.find((i) => i.id === r.institutionId))
								: name;
							return tf('world.tooltip.debt', {
								who,
								year,
								stock: money(r.stock),
								disbursed: money(r.disbursed),
								repaid: money(r.repaid)
							});
						}
					}));

		const live = rows.filter((r) => r.weight > 0);
		if (!live.length) return [];

		const peak = Math.max(...live.map((r) => Math.max(r.weight, r.counter ?? 0)));
		const width = scaleSqrt().domain([0, peak]).range([0.4, 7]);
		const path = pathFor(globe.projection);

		const out: {
			key: string;
			iso2: string;
			d: string;
			/** The narrower of the two accounts, drawn solid. */
			w: number;
			/** The wider, drawn behind. Equal to `w` when the two agree or only one filed. */
			wide: number;
			title: string;
			select: FlowSelection;
		}[] = [];

		for (const row of live) {
			const c = countryOf(row.iso2);
			if (!c) continue;
			if (!globe.visible(TUNISIA[0], TUNISIA[1]) && !globe.visible(c.anchor[0], c.anchor[1])) continue;

			const d = path({
				type: 'LineString',
				coordinates: [[TUNISIA[0], TUNISIA[1]], c.anchor]
			});
			if (!d) continue;

			/*
			 * Two widths, not an average.
			 *
			 * The wider account is drawn behind and the narrower over it, so what the
			 * reader sees around the solid line is exactly the size of the disagreement
			 * between the two countries' statistical offices. Where they agree there is
			 * no halo at all. This is the one thing on the globe that is a picture of
			 * uncertainty rather than of a quantity, and it is here because averaging
			 * the two — which is what every other trade map does — would destroy the
			 * only evidence that anybody disagrees.
			 */
			const own = width(row.weight);
			const other = row.counter === null ? own : width(row.counter);

			const name = c.names[app.locale] ?? c.names.en;
			out.push({
				/*
				 * `row.key`, never `row.iso2`. A lending body is drawn at its seat, so the
				 * World Bank and the United States both carry `iso2: 'US'` — keying the
				 * each block on the country made two arcs claim one key, and Svelte threw
				 * `each_key_duplicate` and rolled the whole render back. The visible
				 * symptom was that the Trade/Debt switch simply did nothing: the state
				 * updated, the re-render aborted, and nothing in the console said so
				 * unless you were listening for a page error.
				 */
				key: row.key,
				iso2: row.iso2,
				d,
				w: Math.min(own, other),
				wide: Math.max(own, other),
				title: row.title(name),
				// The name is only known here, after the country has been resolved and
				// localised. Building the selection without it left the card's heading
				// blank and its Agora link reading `label=undefined`.
				select: { ...row.select, countryName: name }
			});
		}
		return out;
	});

	/**
	 * Millions of USD, in the reader's locale.
	 *
	 * An unobserved year renders as an em dash, never as zero. The IMF's series have
	 * real gaps — Tunisia reported nothing for several partners through the 1960s —
	 * and "0" would assert that trade was measured and found to be none.
	 */
	function money(m: number | null): string {
		if (m === null) return '—';
		const bn = m / 1000;
		if (bn >= 1) {
			return `${bn.toLocaleString(app.locale, { maximumFractionDigits: 1 })} ${t('world.bn')}`;
		}
		/*
		 * A positive amount never prints as "0".
		 *
		 * Rounding to whole millions turned real half-million-dollar flows into
		 * "bought 0 mn USD", which reads as "none" when it means "a little" — and this
		 * view already has a separate, honest way of saying none: an em dash for an
		 * unobserved year. Two different things must not print the same string.
		 */
		if (m > 0 && m < 0.5) return `<1 ${t('world.mn')}`;
		return `${m.toLocaleString(app.locale, { maximumFractionDigits: 0 })} ${t('world.mn')}`;
	}

	const arcs = $derived.by(() => {
		const path = pathFor(globe.projection);
		const out: { key: string; id: string; kind: string; d: string; title: string; select: FlowSelection }[] = [];

		for (const ag of ds.agreements ?? []) {
			for (const party of ag.parties) {
				/*
				 * A party is either a state, placed by its own alpha-2, or a body, placed
				 * at the country hosting its seat. The second case is why the EU
				 * Association Agreement — which governs most of Tunisia's real trade —
				 * finally draws a line: it runs to Belgium, where the Union sits.
				 *
				 * The arc is labelled with the body's name, never the host country's. An
				 * arc to Brussels marked "Belgium" would assert a bilateral treaty that
				 * does not exist.
				 */
				let c = /^[A-Z]{2}$/.test(party) ? countryOf(party) : null;
				let label: string | null = null;

				if (!c) {
					const inst = ds.institutions.find((i) => i.id === party);
					const seat = (inst as { seat?: string } | undefined)?.seat;
					if (!inst || !seat) continue; // unseated body — a known gap, not an error
					c = countryOf(seat);
					if (c) label = nameOf(inst);
				}
				if (!c) continue; // build-world.ts fails before this can happen

				if (!globe.visible(TUNISIA[0], TUNISIA[1]) && !globe.visible(c.anchor[0], c.anchor[1])) {
					continue;
				}

				const d = path({
					type: 'LineString',
					coordinates: [[TUNISIA[0], TUNISIA[1]], c.anchor]
				});
				if (!d) continue;

				out.push({
					key: `${ag.id}:${party}`,
					id: ag.id,
					kind: ag.kind,
					d,
					// nameOf detects the `title_*` convention itself; agreements have no `name_*`.
					title: tf('world.arc.agreement', {
						agreement: nameOf(ag),
						party: label ?? c.names[app.locale] ?? c.names.en
					}),
					select: {
						kind: 'agreement',
						agreementId: ag.id,
						/*
						 * The record to file a thread against. For a body that is the body
						 * itself; for a state it is that country's institution record, where
						 * one exists. Never the host country of a seat — a discussion about
						 * the EU Association Agreement addressed to Belgium is nonsense.
						 */
						targetId: /^[A-Z]{2}$/.test(party)
							? (ds.institutions.find((i) => (i as { iso2?: string }).iso2 === party)?.id ?? null)
							: party,
						partyName: label ?? c.names[app.locale] ?? c.names.en
					} as FlowSelection
				});
			}
		}
		return out;
	});

	/** Those currently on the near face, projected, with how head-on they are. */
	const visibleCountries = $derived.by(() =>
		places
			.filter((c) => globe.visible(c.lon, c.lat))
			.map((c) => {
				const p = globe.projection([c.lon, c.lat])!;
				return { ...c, sx: p[0], sy: p[1], facing: globe.facing(c.lon, c.lat) };
			})
			.filter((c) => Number.isFinite(c.sx) && Number.isFinite(c.sy))
	);

	/** Sourced point-features (spec §8/§13): rendered on the globe once authored. */
	const visibleAssets = $derived.by(() =>
		(ds.places ?? [])
			.filter((p) => p.coordinates && globe.visible(p.coordinates[0], p.coordinates[1]))
			.map((p) => {
				const proj = globe.projection(p.coordinates!);
				return proj
					? { ...p, sx: proj[0], sy: proj[1], facing: globe.facing(p.coordinates![0], p.coordinates![1]) }
					: null;
			})
			.filter((p): p is NonNullable<typeof p> => !!p && Number.isFinite(p.sx) && Number.isFinite(p.sy))
	);

	/**
	 * Which country names get drawn.
	 *
	 * Reuses the network's greedy, deterministic suppression rather than a second
	 * placement pass — western Europe puts four of these fifteen within a few degrees
	 * of each other, so at the default zoom their labels genuinely collide.
	 *
	 * Priority is how head-on the country is, which is the globe's equivalent of the
	 * network's node weight: the reader is looking at the middle of the disc, so a
	 * country facing them wins its slot over one sliding away at the limb. The
	 * selected country is pinned and never suppressed.
	 *
	 * The space adapter is an identity transform because these coordinates have
	 * already been through the projection — see `LabelSpace` in viz/place.ts.
	 */
	const labels = $derived.by(() => {
		const space = {
			vw: globe.vw,
			vh: globe.vh,
			k: 1,
			worldToScreen: (x: number, y: number) => ({ x, y })
		};
		const candidates: LabelCandidate<{ id: string; facing: number }>[] = visibleCountries.map(
			(c) => ({
				id: c.id,
				x: c.sx,
				y: c.sy,
				text: c.name,
				priority: Math.round(c.facing * 100),
				pinned: app.selected === c.id,
				r: 4,
				data: { id: c.id, facing: c.facing }
			})
		);
		return placeLabels(candidates, space, { limit: 20, majorAt: 70 });
	});

	function redraw() {
		const el = canvas;
		if (!el) return;

		const { vw, vh } = globe;
		if (vw < 2 || vh < 2) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		if (el.width !== Math.round(vw * dpr) || el.height !== Math.round(vh * dpr)) {
			el.width = Math.round(vw * dpr);
			el.height = Math.round(vh * dpr);
		}

		const ctx = el.getContext('2d');
		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, vw, vh);
		draw(ctx, globe.projection);
	}

	/** Geometry: rotation, zoom and viewport, read explicitly so each one triggers. */
	$effect(() => {
		const { lon, lat, k, vw, vh } = globe;
		void lon;
		void lat;
		void k;
		void vw;
		void vh;
		redraw();
	});

	/**
	 * Repaint when the theme lands on the document — NOT when `theme.resolved` changes.
	 *
	 * These are not the same moment, and the difference was a real bug. The layout
	 * writes `data-theme` in its own `$effect`; in Svelte 5 a child's effects run
	 * before its parent's, so a draw that depended on `theme.resolved` ran while the
	 * attribute still held the OLD value. `cssVar` reads computed style, so the canvas
	 * painted one theme behind on every switch: choosing dark left an ocean of light
	 * pixels, and choosing light then painted the dark ones.
	 *
	 * Observing the attribute inverts the dependency. The observer fires after the
	 * write, so the tokens are guaranteed current, and the ordering of two unrelated
	 * effects stops mattering.
	 *
	 * `style` is watched alongside it because the accent is applied as an inline
	 * custom property on the same element, and Tunisia is filled with it.
	 *
	 * Note this deliberately holds no reactive state. The warning at the bottom of
	 * theme.svelte.ts is about an epoch counter incremented inside the effect that
	 * read it, which self-triggers and takes down the whole effect tree; an observer
	 * calling a plain function has no such cycle.
	 */
	$effect(() => {
		const obs = new MutationObserver(redraw);
		obs.observe(document.documentElement, { attributeFilter: ['data-theme', 'style'] });
		return () => obs.disconnect();
	});

	function draw(ctx: CanvasRenderingContext2D, projection: GeoProjection) {
		const path = pathFor(projection, ctx);

		// The land layer only exists once the runtime topology has arrived; the
		// sphere and graticule are drawn regardless so the globe's shape is never
		// blank while geometry loads.
		const landShapes = countries && borders && coast;

		// Resolved per draw, never cached. See the header.
		const ocean = cssVar('--surface-sunken', '#0b0d10');
		const land = cssVar('--surface-base', '#141519');
		const line = cssVar('--border-subtle', '#2a2e35');
		const edge = cssVar('--border-strong', '#4a5058');
		const accent = cssVar('--accent', '#c08a2e');

		// The sphere itself. Filled before anything else so the graticule and the
		// land sit inside a disc with a real edge, which is most of what sells the
		// curvature at a glance.
		ctx.beginPath();
		path({ type: 'Sphere' });
		ctx.fillStyle = ocean;
		ctx.fill();

		ctx.beginPath();
		path(graticule);
		ctx.strokeStyle = line;
		ctx.lineWidth = 0.5;
		ctx.globalAlpha = 0.5;
		ctx.stroke();
		ctx.globalAlpha = 1;

		if (!landShapes) return;

		ctx.beginPath();
		path(countries);
		ctx.fillStyle = land;
		ctx.fill();

		// Interior borders first and quietly, then the coastline over them. The order
		// matters where a national border meets the sea: the stronger line should win
		// the junction, or coasts appear to dissolve into internal frontiers.
		ctx.beginPath();
		path(borders);
		ctx.strokeStyle = line;
		ctx.lineWidth = 0.5;
		ctx.stroke();

		ctx.beginPath();
		path(coast);
		ctx.strokeStyle = edge;
		ctx.lineWidth = 0.75;
		ctx.stroke();

		// Tunisia, filled in the accent. This is the atlas's subject; on a globe of
		// 175 equally-grey countries it has to be findable without reading a label.
		const tn = countries.features.find((f) => String(f.id) === '788');
		if (tn) {
			ctx.beginPath();
			path(tn);
			ctx.fillStyle = accent;
			ctx.fill();
		}

		// The limb. Drawn last so it sits over the land rather than under it —
		// without it, countries at the edge look torn off rather than curving away.
		ctx.beginPath();
		path({ type: 'Sphere' });
		ctx.strokeStyle = edge;
		ctx.lineWidth = 1;
		ctx.stroke();
	}
</script>

<!--
	The camera surface.

	Same rationale as NetworkView's: tabindex + role="application" because this is a
	navigable space, not a picture — once focused it answers arrows, +/- and 0. The
	lint rule below objects to a focusable element with a non-interactive role and is
	wrong here; "application" is the ARIA role for a widget handling its own keys, and
	it is useless without being focusable.

	`data-cursor="grab"` is an opt-in read by shell/Cursor.svelte, not decoration. The
	CSS `cursor: grab` alone does nothing for readers on a fine pointer, because the
	custom cursor is layered over the system one.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="world"
	use:navigable={{ cam: globe }}
	tabindex="0"
	role="application"
	aria-label={t('world.canvas')}
	data-cursor="grab"
	class:moving={globe.moving}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>

	{#if !topo}
		<!-- Geometry is fetched at runtime (see topology.ts); until it lands the
		     globe shows its sphere and graticule, and this line says the land is
		     on its way rather than leaving the reader to wonder. The ledger view
		     (one switch away, via world.store) carries the data meanwhile. -->
		<div class="geo-loading" role="status">
			{#if topoError}
				<span>{t('world.geoError')}</span>
			{:else}
				<span>{t('world.geoLoading')}</span>
			{/if}
		</div>
	{/if}

	<svg viewBox="0 0 {globe.vw} {globe.vh}" role="presentation">
		<!--
			Agreement arcs, drawn first so every node and label sits above them.

			These are real great circles run through the same projection as the land, so
			an arc to a country near the limb flattens and then vanishes over the edge
			exactly as the coastline does. That is the one thing this view gets for free
			from being a globe rather than a map, and it is the reason it is one.
		-->
		<!--
			Trade first and underneath: it is the continuous quantity, and the treaties
			are the discrete events drawn over it. Reversed, the thick arcs would bury
			the thin ones.
		-->
		<g class="trades" class:debt={family === 'debt'} class:energy={family === 'energy'}>
			{#each trade as f (f.key)}
				{#if f.wide > f.w + 0.15}
					<!-- The disagreement, drawn as the halo the solid line does not cover. -->
					<path class="disputed" style:stroke-width="{f.wide}px" d={f.d}></path>
				{/if}
				<path class="trade" style:stroke-width="{f.w}px" d={f.d}></path>
				<!--
					The fat invisible twin, exactly as the network does it. A sub-pixel arc
					is not clickable with a mouse and is hopeless on a phone, and an edge you
					can see but not address was the thing ConnectionCard was built to fix.
				-->
				<path
					class="hit"
					d={f.d}
					role="button"
					tabindex="0"
					aria-label={f.title}
					onclick={() => (picked = f.select)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							picked = f.select;
						}
					}}
				>
					<title>{f.title}</title>
				</path>
			{/each}
		</g>

		<g class="arcs">
			{#each arcs as a (a.key)}
				<path class="arc" class:on={app.selected === a.id} d={a.d}></path>
				<path
					class="hit"
					d={a.d}
					role="button"
					tabindex="0"
					aria-label={a.title}
					onclick={() => (picked = a.select)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							picked = a.select;
						}
					}}
				>
					<title>{a.title}</title>
				</path>
			{/each}
		</g>

		<!--
			Countries the graph knows. Real focusable elements rather than canvas marks,
			which is the whole reason the overlay exists: each one is a button that opens
			the same record the network opens.

			Opacity follows how head-on the country is, so a node does not blink out of
			existence at the limb — it turns away. Below the fade the node is still
			hit-testable for a few degrees, which is deliberate: a target that vanishes
			the instant it dims is harder to click than one that fades.
		-->
		{#each visibleCountries as c (c.id)}
			{#if c.hasRecord}
				<g
					class="cnode"
					class:selected={app.selected === c.id}
					transform="translate({c.sx} {c.sy})"
					style:opacity={0.25 + c.facing * 0.75}
					role="button"
					tabindex="0"
					aria-label={c.name}
					onclick={() => {
						app.select(c.id);
						world.entity = c.id;
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							app.select(c.id);
						}
					}}
					onmouseenter={() => (app.hovered = c.id)}
					onmouseleave={() => (app.hovered = null)}
				>
					<!-- The generous invisible target. A 4px dot is not tappable on a phone. -->
					<circle class="hit" r="13" />
					<circle class="dot" r="4" />
				</g>
			{:else}
				<!--
					A treaty counterparty with no entry in the graph. Deliberately NOT a
					button and not focusable: there is nothing to open, and a control that
					does nothing when pressed is worse than a mark that never offered.
					The <title> says so, which is the whole affordance.
				-->
				<g class="cnode blank" transform="translate({c.sx} {c.sy})" style:opacity={0.25 + c.facing * 0.75}>
					<circle class="dot" r="3.5" />
					<title>{tf('world.norecord.title', { name: c.name, status: t('world.norecord') })}</title>
				</g>
			{/if}
		{/each}

		{#if false}
			{#each visibleAssets as a (a.id)}
				<g class="anode" transform="translate({a.sx} {a.sy})" style:opacity={0.25 + a.facing * 0.75}>
					<circle class="dot" r="3.5" />
					<title>
						{a.asset
							? tf('world.asset.title.marked', {
									name: nameOf(a),
									kind: t(`world.place.${a.kind}`),
									asset: t('world.asset.label')
								})
							: tf('world.asset.title', { name: nameOf(a), kind: t(`world.place.${a.kind}`) })}
					</title>
				</g>
			{/each}
		{/if}

		{#each labels as l (l.id)}
			<text class="clabel" class:major={l.tier !== 'minor'} x={l.sx} y={l.sy + 12}>{l.text}</text>
		{/each}

		{#if tunis}
			<!-- Tunisia is the subject, not a foreign state: it has no institution record
			     to open, so it is a marker rather than a button. -->
			<g class="tunis" transform="translate({tunis[0]} {tunis[1]})">
				<circle r="3.5" />
				<text x="9" y="3.5">{t('world.tunisia')}</text>
			</g>
		{/if}
	</svg>

	{#if flows || debt}
		<div class="family" data-no-pan>
			<Segmented
				options={families}
				value={family}
				onchange={(v) => {
					family = v as Family;
					world.setFamily(v as WorldFamily);
					// A debt card cannot survive into trade; cleared where the change is
					// caused rather than in an effect that watches for it.
					picked = null;
				}}
				label={t('world.family')}
			/>
		</div>
	{/if}

	<!--
		Lenders with no place on a globe of countries.

		The World Bank, the African Development Bank and bondholders together hold more
		of Tunisia's external debt than every state combined, so a map that showed only
		the bilateral arcs would show the smaller half and imply it was all of it. They
		are listed rather than drawn because an institution has no centroid — giving one
		an arc means giving it a seat, which is a sourced fact and a separate job.
	-->
	{#if offGlobe.length}
		<div class="offglobe" data-no-pan>
			<h2>{t('world.notonmap')}</h2>
			<ul>
				{#each offGlobe as l (l.name)}
					<li><span class="who">{lenderName(l.name)}</span><span class="how-much">{money(l.stock)}</span></li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if picked}
		<!--
			Anchored bottom-centre rather than at the pointer. An arc runs most of the
			width of the globe, so "near the thing you clicked" has no single answer, and
			a card that jumps around the screen as you sample arcs is harder to read than
			one that stays put.
		-->
		<div class="flowcard" data-no-pan>
			<FlowCard
				selection={picked}
				onclose={() => (picked = null)}
					onpick={(id) => {
						app.select(id);
						world.entity = id;
						picked = null;
					}}
			/>
		</div>
	{/if}

	<div class="viewnav">
		<NavControls cam={globe} label={t('world.nav')} />
	</div>
</div>

<style>
	.world {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--surface-base);
		/* The browser must not claim the gestures we handle: without this, a one-finger
		   drag scrolls the page on touch and a pinch zooms the whole document. */
		touch-action: none;
		cursor: grab;
	}
	.world.moving {
		cursor: grabbing;
	}
	.world:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	/* A quiet status line while the runtime geometry loads. Positioned over the
	   sphere's centre, pointer-events: none so it never swallows a drag; the
	   ledger view (world.store) is the substantive content until the land draws. */
	.geo-loading {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		pointer-events: none;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
		background: color-mix(in oklch, var(--surface-panel) 92%, transparent);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		padding: var(--s-3) var(--s-5);
		backdrop-filter: blur(8px);
		animation: geo-pulse 1.8s var(--ease-in-out) infinite;
	}
	@keyframes geo-pulse {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.geo-loading { animation: none; }
	}

	canvas,
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	/*
	 * The overlay never eats a drag. Only the marks inside it opt back in, so the
	 * whole sphere stays grabbable through the gaps between them.
	 */
	svg {
		pointer-events: none;
	}

	/*
	 * Trade is drawn in the economic layer's hue, not the foreign one, because that is
	 * what it is — the same colour the rest of the project uses for money. Width is the
	 * only channel carrying magnitude, and it is set inline because it is data.
	 */
	.trade {
		pointer-events: none;
		fill: none;
		stroke: var(--layer-economic);
		stroke-linecap: round;
		opacity: 0.45;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.trade:hover {
		opacity: 0.9;
	}
	/*
	 * Debt gets the judicial hue rather than the economic one. Both are money, but a
	 * reader switching between the two families has to see instantly that the arcs
	 * changed meaning and not merely thickness — same colour would read as the same
	 * quantity rescaled.
	 */
	.trades.energy .trade {
		stroke: var(--layer-security);
	}
	.trades.energy .disputed {
		stroke: var(--layer-security);
	}

	.trades.debt .trade {
		stroke: var(--layer-judicial);
	}

	/*
	 * The disagreement between two national statistical offices about one flow.
	 *
	 * Deliberately quieter and softer than the figure itself: it is not a quantity, it
	 * is the width of the doubt around one. Nothing else on this globe is drawn this
	 * way, which is the point — the fuzzy edge has to read as a different KIND of
	 * thing from the solid line, not as more of the same.
	 */
	.disputed {
		fill: none;
		stroke: var(--layer-economic);
		stroke-linecap: round;
		opacity: 0.2;
		pointer-events: none;
	}

	/*
	 * The fat invisible twin every arc needs to be clickable, exactly as the network
	 * does it. Twelve pixels is over the 44px tap target only in one dimension, but an
	 * arc is long: the reachable area is the whole length of it.
	 */
	.hit {
		fill: none;
		stroke: transparent;
		stroke-width: 12;
		stroke-linecap: round;
		pointer-events: stroke;
		cursor: pointer;
	}
	.hit:focus {
		outline: none;
	}
	.hit:focus-visible {
		stroke: var(--accent);
		stroke-opacity: 0.35;
	}

	.flowcard {
		position: absolute;
		bottom: var(--s-4);
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
	}
	.trades.debt .disputed {
		stroke: var(--layer-judicial);
	}

	.family {
		position: absolute;
		top: var(--s-4);
		/* Physical: screen furniture, not text flow. Same rule as .viewnav below. */
		left: var(--s-4);
	}

	.offglobe {
		position: absolute;
		bottom: var(--s-4);
		left: var(--s-4);
		max-width: 280px;
		padding: var(--s-4) var(--s-5);
		background: color-mix(in oklch, var(--surface-panel) 88%, transparent);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		backdrop-filter: blur(8px);
		box-shadow: var(--elev-2);
	}
	.offglobe h2 {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: var(--s-3);
	}
	.offglobe li {
		display: flex;
		justify-content: space-between;
		gap: var(--s-4);
		font-size: var(--t-xs);
		padding-block: 1px;
	}
	.offglobe .who {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.offglobe .how-much {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
		flex: none;
	}

	/*
	 * An agreement is a treaty, not a measurement, so the arc is a plain line of
	 * uniform weight. Nothing here encodes magnitude, because nothing in an
	 * agreement record is a magnitude — width will start meaning something when the
	 * flow datasets arrive, and it would be dishonest for it to mean something now.
	 */
	.arc {
		fill: none;
		stroke: var(--layer-foreign);
		stroke-width: 1;
		stroke-linecap: round;
		opacity: 0.5;
		pointer-events: none;
		transition:
			opacity var(--dur-fast) var(--ease-out),
			stroke var(--dur-fast) var(--ease-out);
	}
	.arc.on {
		stroke: var(--accent);
		stroke-width: 1.75;
		opacity: 1;
	}

	/*
	 * The overlay itself never eats a drag; its marks opt back in individually, so
	 * the sphere stays grabbable through every gap between them.
	 */
	.cnode {
		pointer-events: auto;
		cursor: pointer;
		transition: opacity var(--dur-fast) var(--ease-out);
	}
	.anode {
		pointer-events: none;
	}
	.anode .dot {
		fill: var(--layer-economic);
		stroke: var(--surface-base);
		stroke-width: 1;
	}
	.cnode .hit {
		fill: transparent;
	}
	.cnode .dot {
		fill: var(--layer-foreign);
		stroke: var(--surface-base);
		stroke-width: 1.25;
		transition:
			r var(--dur-fast) var(--ease-out),
			stroke var(--dur-fast) var(--ease-out);
	}
	.cnode:hover .dot,
	.cnode:focus-visible .dot {
		r: 5.5;
	}
	.cnode.selected .dot {
		r: 6;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.cnode:focus {
		outline: none;
	}
	.cnode:focus-visible .hit {
		stroke: var(--accent);
		stroke-width: 1.5;
		fill: none;
	}

	/*
	 * Hollow, and quieter than a record. This is the same move the graph makes with
	 * an unsubstantiated claim: the thing is shown, and shown to be of a different
	 * kind, rather than either hidden or rendered as though it were the real article.
	 */
	.cnode.blank {
		pointer-events: auto;
	}
	.cnode.blank .dot {
		fill: var(--surface-base);
		stroke: var(--layer-foreign);
		stroke-width: 1.25;
		opacity: 0.7;
	}

	.clabel {
		font-family: var(--font-sans);
		font-size: var(--t-2xs);
		fill: var(--text-secondary);
		direction: ltr; /* screen geometry, not text flow — see the note below */
		paint-order: stroke;
		stroke: var(--surface-base);
		stroke-width: 3;
		stroke-linejoin: round;
		pointer-events: none;
	}
	.clabel.major {
		fill: var(--text-primary);
	}

	.tunis circle {
		fill: var(--accent);
		stroke: var(--surface-base);
		stroke-width: 1.5;
	}

	.tunis text {
		font-family: var(--font-sans);
		font-size: var(--t-xs);
		fill: var(--text-primary);
		/*
		 * Physical, not logical — the DESIGN.md rule, in the exact place it bites.
		 *
		 * The label is pinned to a point the projection computed, so its offset is
		 * screen geometry rather than text flow. Inheriting `direction: rtl` made
		 * `text-anchor: start` mean the text's RIGHT edge, so in Arabic the label
		 * extended leftward from x="9" and sat on top of the marker it was naming.
		 *
		 * Forcing the paragraph direction to ltr fixes the placement without touching
		 * the script: an all-Arabic label is still one right-to-left run, shaped and
		 * ordered correctly, but the run now starts at the anchor and grows away from
		 * the dot in every language.
		 */
		direction: ltr;
		paint-order: stroke;
		stroke: var(--surface-base);
		stroke-width: 3;
		stroke-linejoin: round;
	}

	.viewnav {
		position: absolute;
		/*
		 * Physical, not logical. This is screen-space furniture pinned to a corner of
		 * the viewport, not something following the text direction — per DESIGN.md,
		 * using inset-inline-end here would put the controls over the globe's left
		 * side in Arabic while the globe itself, being pixel geometry, did not move.
		 */
		right: var(--s-4);
		bottom: var(--s-4);
	}
</style>
