<script lang="ts">
	import { t, tf, nameOf, formatDate } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { personById, institutionById, ds, meetsBasis, BASIS_ORDER, type Basis } from '$lib/model';
	import { terms, termAt, membersAt, affiliation, type Term, type Holding } from '$lib/civic';
	import { world } from '$lib/world/store.svelte';
	import { compact } from '$lib/design/media.svelte';
	import Chamber3D, { type ChamberSeat } from './Chamber3D.svelte';

	/**
	 * The chamber sitting on the cursor date, drawn as a hemicycle.
	 *
	 * WHAT A SEAT SAYS, AND WHAT IT DOES NOT
	 *
	 * A seat is coloured by the member's parliamentary group on that date, or by
	 * the party list they were elected on when the record has no group. Never by
	 * an opinion: a stance is only ever shown where a recorded vote says it, and
	 * that is a separate mode. Seats the term has but the record does not fill are
	 * drawn hollow and counted, so a partly researched chamber never looks full.
	 *
	 * WHY GROUPS ARE ORDERED BY SIZE
	 *
	 * Hemicycles are usually laid out left to right by political position. That
	 * ordering is a claim this dataset does not make, so the largest group takes
	 * the first wedge in reading order and the legend names every colour.
	 */

	/**
	 * Ring patterns as fractions of the seat's circumference.
	 *
	 * `DASH` in model.ts is in user units, sized for a stroke on a chart a few
	 * hundred units across. A seat here is about 0.008 units in radius, so those
	 * values were longer than the whole circle and every weaker basis drew solid:
	 * the vocabulary existed in the key and not on the seats. Each circle sets
	 * pathLength=1, so these are fractions and a dash is a dash at any seat size.
	 */
	const RING_DASH: Record<Basis, string> = {
		documented: '',
		reported: '0.30 0.14',
		inferred: '0.05 0.12',
		unsubstantiated: '0.28 0.07 0.03 0.07'
	};

	/** Which chamber is shown; the upper one exists only in some years. */
	let chamber = $state<'lower' | 'upper'>('lower');
	const upperNow = $derived(!!termAt(app.t, 'upper'));
	const chamberTerms = $derived(terms.filter((x) => x.chamber === chamber));
	const term = $derived(termAt(app.t, chamber));
	/** Groups past this rank share one colour and one legend entry. */
	const OTHERS = 7;
	const index = $derived(term ? chamberTerms.indexOf(term) : -1);
	/**
	 * Who sits. A replacement known only to the year overlaps, on paper, with the
	 * member they replaced, so on some dates certain and possible members together
	 * outnumber the seats. Then only the certain ones are seated, and the others
	 * are counted in words rather than drawn in seats that do not exist.
	 */
	const everyone = $derived(term ? membersAt(term, app.t) : []);
	/**
	 * The evidence floor is the same control every other view honours. A member
	 * whose seat rests on a claim below the floor is not seated: the chair stays
	 * hollow, which is the same language the view already uses for a seat the
	 * record does not fill, and the count says how many were withheld.
	 */
	const visible = $derived(everyone.filter((m) => meetsBasis(m.position.basis, app.basisFloor)));
	const withheld = $derived(everyone.length - visible.length);
	const members = $derived(
		term && visible.length > term.seats ? visible.filter((m) => m.at === 2) : visible
	);
	const uncertain = $derived(visible.length - members.length);

	/**
	 * Where no member of a term is named but the source gives seats by party,
	 * the chamber is drawn from those counts: seats with a colour and no holder.
	 */
	const split = $derived.by(() => {
		const sp = term?.institution.seat_split;
		return term && sp?.length && !members.length ? sp : null;
	});
	const held = $derived(split ? split.reduce((a, x) => a + x.seats, 0) : members.length);

	interface Seat {
		x: number;
		y: number;
		r: number;
		holder: Holding | null;
		key: string | null;
		color: string;
		region: string | null;
		/** The basis of the claim that puts someone here, so a seat can carry it. */
		basis: Basis | null;
	}

	/** Groups present on the date, largest first, with their palette slot. */
	const groups = $derived.by(() => {
		if (!term) return [];
		if (split) {
			return [...split]
				.sort((a, b) => b.seats - a.seats)
				.map((x, i) => ({
					id: x.party,
					n: x.seats,
					kind: 'list' as 'group' | 'list' | null,
					name: nameOf(institutionById.get(x.party)) || x.party,
					color: `var(--seat-${Math.min(i, OTHERS) + 1})`,
					other: i >= OTHERS
				}));
		}
		const count = new Map<string, number>();
		const kind = new Map<string, 'group' | 'list'>();
		for (const m of members) {
			const a = affiliation(m.position.holder, term, app.t);
			const key = a?.id ?? '';
			count.set(key, (count.get(key) ?? 0) + 1);
			if (a) kind.set(a.id, a.kind);
		}
		// A term coloured by party lists has no "no group" seats, only seats whose
		// list was independent or is not in the record.
		const byList = [...kind.values()].includes('list');
		return [...count.entries()]
			.sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[1] - a[1]))
			.map(([id, n], i) => ({
				id,
				n,
				kind: kind.get(id) ?? null,
				name: id ? nameOf(institutionById.get(id)) || id : t(byList ? 'parl.nolist' : 'parl.unaffiliated'),
				// Seven distinct colours for the seven largest; every smaller group or
				// list shares the eighth, so no small party wears a large one's colour.
				color: id ? `var(--seat-${Math.min(i, OTHERS) + 1})` : 'var(--text-muted)',
				other: !!id && i >= OTHERS
			}));
	});

	/**
	 * Seat positions: rows of a half-annulus, seats per row in proportion to the
	 * row's length so the spacing is even, then read in angle order so each group
	 * fills a wedge. The row count grows with the chamber, which keeps 161 and 217
	 * seats at the same density.
	 */
	const geometry = $derived.by(() => {
		const n = term?.seats ?? 0;
		if (!n) return { pts: [] as { x: number; y: number; a: number; r: number }[], r: 0 };
		const rows = Math.max(3, Math.round(Math.sqrt(n / 1.9)));
		const radii = Array.from({ length: rows }, (_, i) => 0.4 + (0.6 * i) / (rows - 1));
		const total = radii.reduce((a, b) => a + b, 0);
		const raw = radii.map((r) => (n * r) / total);
		const per = raw.map(Math.floor);
		let left = n - per.reduce((a, b) => a + b, 0);
		raw.map((v, i) => [v - Math.floor(v), i] as const)
			.sort((a, b) => b[0] - a[0])
			.forEach(([, i]) => {
				if (left > 0) {
					per[i]++;
					left--;
				}
			});
		const pts: { x: number; y: number; a: number; r: number }[] = [];
		let gap = Infinity;
		radii.forEach((r, i) => {
			const k = per[i];
			if (k > 1) gap = Math.min(gap, (Math.PI * r) / (k - 1));
			for (let j = 0; j < k; j++) {
				const a = k === 1 ? Math.PI / 2 : Math.PI * (1 - j / (k - 1));
				pts.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a, r });
			}
		});
		gap = Math.min(gap, 0.6 / (rows - 1));
		pts.sort((p, q) => q.a - p.a || p.r - q.r);
		return { pts, r: gap * 0.42 };
	});

	const rtl = $derived(app.locale === 'ar');

	const seats = $derived.by<Seat[]>(() => {
		if (!term) return [];
		if (split) {
			const queue = groups.flatMap((g) => Array<string>(g.n).fill(g.id));
			const pts = rtl ? [...geometry.pts].reverse() : geometry.pts;
			return pts.map((p, i) => {
				const key = queue[i] ?? null;
				return { x: p.x, y: p.y, r: p.r, holder: null, key, color: groups.find((g) => g.id === key)?.color ?? 'none', region: null, basis: null };
			});
		}
		const order = new Map(groups.map((g, i) => [g.id, i]));
		const byKey = (m: Holding) => affiliation(m.position.holder, term, app.t)?.id ?? '';
		const sorted = [...members].sort(
			(a, b) =>
				(order.get(byKey(a)) ?? 99) - (order.get(byKey(b)) ?? 99) ||
				(a.position.constituency?.name_en ?? '').localeCompare(b.position.constituency?.name_en ?? '')
		);
		const pts = rtl ? [...geometry.pts].reverse() : geometry.pts;
		return pts.map((p, i) => {
			const m = sorted[i] ?? null;
			const key = m ? byKey(m) : null;
			const g = key !== null ? groups.find((x) => x.id === key) : undefined;
			return {
				x: p.x,
				y: p.y,
				r: p.r,
				holder: m,
				key,
				color: g?.color ?? 'none',
				region: m?.position.constituency?.region ?? (m?.position.constituency?.abroad ? 'abroad' : null),
				basis: m?.position.basis ?? null
			};
		});
	});

	const empty = $derived(term ? Math.max(0, term.seats - held) : 0);

	let hover = $state<Seat | null>(null);
	/** WebGL can be unavailable (old phones, some privacy modes): the flat hemicycle stands in. */
	let flat = $state(false);

	const chamberSeats = $derived<ChamberSeat[]>(
		seats.map((s) => ({ x: s.x, y: s.y, r: s.r, color: s.holder || s.key ? s.color : null, dim: dim(s), basis: s.basis, key: s.holder?.position.id ?? `${s.key ?? 'empty'}:${s.x.toFixed(3)}:${s.y.toFixed(3)}` }))
	);
	let picked = $state<string | null>(null);

	const focus = $derived(world.focusRegion);
	const focusName = $derived(focus ? nameOf(ds.regions.find((r) => r.id === focus)) : '');

	const OTHER_KEY = '#others';
	const others = $derived(groups.filter((g) => g.other));
	const otherIds = $derived(new Set(others.map((g) => g.id)));

	function dim(s: Seat): boolean {
		if (focus && s.region !== focus) return true;
		if (picked === OTHER_KEY) return !otherIds.has(s.key ?? '');
		if (picked !== null && s.key !== picked) return true;
		return false;
	}

	function step(dir: -1 | 1) {
		const next = chamberTerms[index + dir];
		if (!next) return;
		app.playing = false;
		// A day into the term, so the date falls inside it and not on the boundary.
		app.setDate(next.institution.interval.startLatest + 86_400_000);
	}

	function memberName(h: Holding): string {
		return nameOf(personById.get(h.position.holder)) || h.position.holder;
	}

	/** The nearest terms either side of a date with no chamber. */
	const around = $derived.by(() => {
		if (term) return { prev: null, next: null };
		const prev = [...chamberTerms].reverse().find((x) => x.institution.interval.startEarliest <= app.t) ?? null;
		const next = chamberTerms.find((x) => x.institution.interval.startEarliest > app.t) ?? null;
		return { prev, next };
	});

	function span(x: Term): string {
		const iv = x.institution.interval;
		const end = iv.status === 'ongoing' ? t('parl.sitting') : formatDate(iv.endEarliest ?? iv.startLatest, 'month');
		return `${formatDate(iv.startEarliest, 'month')} – ${end}`;
	}

	/** Terms by how near they are to the date, for a date with no chamber. */
	const byNearness = $derived.by(() => {
		const dist = (x: Term) => {
			const iv = x.institution.interval;
			const end = iv.endLatest ?? Date.now();
			return app.t < iv.startEarliest ? iv.startEarliest - app.t : app.t > end ? app.t - end : 0;
		};
		return [...chamberTerms].sort((a, b) => dist(a) - dist(b));
	});

	/** Short label for the term strip: the year it was elected. */
	function termYear(x: Term): string {
		return String(new Date(x.institution.interval.startEarliest).getUTCFullYear());
	}

	function goTerm(x: Term) {
		app.playing = false;
		app.setDate(x.institution.interval.startLatest + 86_400_000);
	}
</script>

<div class="parliament">
	{#if term}
		<div class="stage">
			<p id="chamber-help" class="sr">{t('parl.hint3d')}</p>
			{#if !flat}
				<Chamber3D
					seats={chamberSeats}
					label={tf('parl.aria', { name: nameOf(term.institution), n: members.length, seats: term.seats })}
					describedby="chamber-help"
					onhover={(i) => (hover = i === null ? null : seats[i])}
					onpick={(i) => {
						const h = seats[i]?.holder;
						if (h) app.select(h.position.holder);
					}}
					onfail={() => (flat = true)}
				/>
			{:else}
				<svg class="flat" viewBox="-1.06 -1.06 2.12 1.12" role="img" aria-label={tf('parl.aria', { name: nameOf(term.institution), n: members.length, seats: term.seats })}>
					{#each seats as s, i (i)}
						<circle
							cx={s.x}
							cy={s.y}
							r={geometry.r}
							class="seat"
							class:empty={!s.holder && !s.key}
							class:dim={dim(s)}
							data-basis={s.basis ?? undefined}
							pathLength={s.basis && s.basis !== 'documented' ? 1 : undefined}
							style:fill={s.holder || s.key ? s.color : 'none'}
							style:stroke={s.basis && s.basis !== 'documented' ? 'var(--text-secondary)' : undefined}
							style:stroke-width={s.basis && s.basis !== 'documented' ? geometry.r * 0.34 : undefined}
							style:stroke-dasharray={s.basis && s.basis !== 'documented' ? RING_DASH[s.basis] : undefined}
						/>
					{/each}
				</svg>
			{/if}

			<!-- One line, always the same height: it changes words, never size. -->
			<div class="readout" aria-live="polite">
				{#if hover?.holder}
					<strong>{memberName(hover.holder)}</strong>
					<span>{nameOf(hover.holder.position.constituency)}</span>
					<span class="g">{groups.find((g) => g.id === hover?.key)?.name ?? ''}</span>
					{#if hover.basis && hover.basis !== 'documented'}
						<span class="b" data-basis={hover.basis}>{t('basis.' + hover.basis)}</span>
					{/if}
				{:else if hover?.key}
					<strong>{groups.find((g) => g.id === hover?.key)?.name ?? ''}</strong>
					<span>{t('parl.splitseat')}</span>
				{:else if hover}
					<span>{t('parl.emptyseat')}</span>
				{:else}
					<span class="hint">{t('parl.hint3d')}</span>
				{/if}
			</div>
		</div>

		<aside class="panel">
			{#if upperNow || chamber === 'upper'}
				<div class="chambers" role="group" aria-label={t('parl.chambers')}>
					<button class:on={chamber === 'lower'} aria-pressed={chamber === 'lower'} onclick={() => (chamber = 'lower')}>{t('parl.chamber.lower')}</button>
					<button class:on={chamber === 'upper'} aria-pressed={chamber === 'upper'} onclick={() => (chamber = 'upper')}>{t('parl.chamber.upper')}</button>
				</div>
			{/if}
			<nav class="terms" aria-label={t('parl.terms')}>
				{#each chamberTerms as x (x.role.id)}
					<button class:on={x === term} aria-current={x === term ? 'true' : undefined} onclick={() => goTerm(x)}>{termYear(x)}</button>
				{/each}
			</nav>

			<header class="what">
				<h2 title={nameOf(term.institution)}>{nameOf(term.institution)}</h2>
				<!-- One line, fixed height: the uncertain count rides on it rather than
				     opening a row of its own and pushing the legend down. -->
				<p class="mono when" title={uncertain ? tf('parl.uncertain', { n: uncertain }) : undefined}>
					{span(term)}{#if uncertain}{' · '}<span class="unc">{tf('parl.uncertainShort', { n: uncertain })}</span>{/if}{#if withheld}{' · '}<span class="unc">{tf('parl.withheldShort', { n: withheld })}</span>{/if}
				</p>
				<dl class="tally mono">
					<div><dt>{t(split ? 'parl.t.partyseats' : 'parl.t.held')}</dt><dd>{held}</dd></div>
					<div><dt>{t('parl.t.seats')}</dt><dd>{term.seats}</dd></div>
					<div><dt>{t('parl.t.empty')}</dt><dd>{empty}</dd></div>
				</dl>
			</header>

			{#if focus}
				<div class="focus">
					<span>{tf('parl.focus', { name: focusName || focus })}</span>
					<button onclick={() => (world.focusRegion = null)} aria-label={t('panel.close')}>×</button>
				</div>
			{/if}

			<ul class="legend">
				{#each groups.filter((g) => !g.other) as g (g.id)}
					<li>
						<button class:on={picked === g.id} onclick={() => (picked = picked === g.id ? null : g.id)} aria-pressed={picked === g.id}>
							<i style:background={g.color}></i><span class="name">{g.name}</span><span class="n mono">{g.n}</span>
						</button>
					</li>
				{/each}
				{#if others.length}
					<li>
						<button
							class:on={picked === OTHER_KEY}
							onclick={() => (picked = picked === OTHER_KEY ? null : OTHER_KEY)}
							aria-pressed={picked === OTHER_KEY}
							title={others.map((g) => `${g.name} (${g.n})`).join(', ')}
						>
							<i style:background={others[0].color}></i><span class="name">{tf('parl.others', { n: others.length })}</span><span class="n mono">{others.reduce((a, g) => a + g.n, 0)}</span>
						</button>
					</li>
				{/if}
				{#if empty}
					<li class="hollow"><span><i></i><span class="name">{t('parl.unfilled')}</span><span class="n mono">{empty}</span></span></li>
				{/if}
			</ul>
			{#if seats.some((s) => s.basis && s.basis !== 'documented')}
				<ul class="basis-key" aria-label={t('parl.basiskey')}>
					{#each BASIS_ORDER.filter((b) => b !== 'documented' && seats.some((s) => s.basis === b)) as b (b)}
						<li data-basis={b}>
							<svg viewBox="-1 -1 2 2" width="12" height="12" aria-hidden="true">
								<circle r="0.72" pathLength={1} fill="none" stroke="currentColor" stroke-width="0.22" stroke-dasharray={RING_DASH[b]} />
							</svg>
							{t('basis.' + b)}
						</li>
					{/each}
				</ul>
			{/if}
			{#if split}
				<p class="note">{t('parl.splitnote')}</p>
			{:else if groups.some((g) => g.kind === 'list')}
				<p class="note">{t('parl.listnote')}</p>
			{/if}

			{#if !split}
			<details class="table-alt" open={compact.current}>
				<summary>{t('parl.table')}</summary>
				<table>
					<thead><tr><th>{t('parl.col.member')}</th><th>{t('parl.col.constituency')}</th><th>{t('parl.col.group')}</th></tr></thead>
					<tbody>
						{#each seats.filter((s) => s.holder) as s (s.holder!.position.id)}
							<tr>
								<td><button onclick={() => app.select(s.holder!.position.holder)}>{memberName(s.holder!)}</button></td>
								<td>{nameOf(s.holder!.position.constituency)}</td>
								<td>{groups.find((g) => g.id === s.key)?.name ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
			{:else}
			<!--
				A term counted by party instead of by member still needs the table.
				The chart is a chart; without this the only text was the legend, and
				a reader on a phone with no pointer could not reach the counts.
			-->
			<details class="table-alt" open={compact.current}>
				<summary>{t('parl.table')}</summary>
				<table>
					<caption>{t('parl.splittable')}</caption>
					<thead><tr><th>{t('parl.col.party')}</th><th>{t('parl.col.seats')}</th></tr></thead>
					<tbody>
						{#each groups as g (g.id)}
							<tr><th scope="row">{g.name}</th><td>{g.n}</td></tr>
						{/each}
						{#if empty}
							<tr><th scope="row">{t('parl.unfilled')}</th><td>{empty}</td></tr>
						{/if}
					</tbody>
				</table>
			</details>
			{/if}
		</aside>
	{:else}
		<div class="none">
			{#if upperNow || chamber === 'upper'}
				<div class="chambers" role="group" aria-label={t('parl.chambers')}>
					<button class:on={chamber === 'lower'} aria-pressed={chamber === 'lower'} onclick={() => (chamber = 'lower')}>{t('parl.chamber.lower')}</button>
					<button class:on={chamber === 'upper'} aria-pressed={chamber === 'upper'} onclick={() => (chamber = 'upper')}>{t('parl.chamber.upper')}</button>
				</div>
			{/if}
			<p>{t('parl.none')}</p>
			<div class="jump">
				{#each byNearness as x, i (x.role.id)}
					<button class:near={i === 0} onclick={() => goTerm(x)}>
						{#if i === 0}<span class="nearlabel">{t('parl.nearest')}</span>{/if}
						{nameOf(x.institution)}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Desktop: the room fills the stage and the panel sits beside it. */
	.parliament {
		position: relative;
		height: 100%;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		min-height: 0;
	}
	.stage {
		position: relative;
		min-height: 0;
		overflow: hidden;
		background: radial-gradient(120% 90% at 50% 0%, var(--surface-base), var(--surface-sunken));
	}
	.flat {
		position: absolute;
		inset: 10% 6% 14%;
		width: 88%;
		height: auto;
	}
	.seat {
		stroke: var(--surface-base);
		stroke-width: 0.004;
	}
	.seat.empty {
		stroke: var(--border-strong);
		stroke-dasharray: 0.008 0.006;
	}
	.seat.dim {
		opacity: 0.18;
	}
	.readout {
		position: absolute;
		inset-inline: var(--s-4);
		bottom: var(--s-4);
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		pointer-events: none;
	}
	@media (max-width: 640px) {
		.readout {
			white-space: normal;
			line-height: 1.3;
			height: auto;
			min-height: 36px;
			padding-block: var(--s-2);
			text-align: center;
		}
	}
	.readout strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.readout .g,
	.readout .hint {
		color: var(--text-muted);
		/* A flex child that does not shrink overflows from both ends under
		   justify-content: center, which cut the hint's first and last words off
		   on a phone. Let it shrink, then let it wrap. */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding: var(--s-5);
		border-inline-start: 1px solid var(--border-subtle);
		background: var(--surface-base);
		overflow-y: auto;
		min-height: 0;
	}
	.chambers {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
	}
	.chambers button {
		min-height: 32px;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		border-radius: var(--r-sm);
	}
	.chambers button.on {
		background: var(--accent);
		color: var(--accent-contrast, var(--surface-base));
	}
	.terms {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
	}
	.terms button {
		min-height: 32px;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		border-radius: var(--r-sm);
	}
	.terms button.on {
		background: var(--accent);
		color: var(--accent-contrast, var(--surface-base));
	}
	.what h2 {
		font-size: var(--t-md, var(--t-sm));
		font-weight: 600;
		line-height: var(--lh-snug);
		color: var(--text-primary);
		/* Two lines at most, always two lines tall, so a long name never moves the panel. */
		height: calc(2 * 1.25em);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.what > p {
		font-size: var(--t-xs);
		color: var(--text-muted);
		margin-top: var(--s-1);
	}
	.when {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.when .unc {
		color: var(--text-faint);
		border-bottom: 1px dotted var(--border-strong);
		cursor: help;
	}
	.tally {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--s-2);
		margin: var(--s-3) 0 0;
	}
	.tally div {
		padding: var(--s-2) var(--s-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
	}
	.tally dt {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.tally dd {
		margin: 0;
		font-size: var(--t-lg);
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.note {
		font-size: var(--t-2xs);
		line-height: var(--lh-relaxed);
		color: var(--text-faint);
	}
	.focus {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
		border: 1px solid var(--accent-border);
		background: var(--accent-muted);
		color: var(--accent-text);
		border-radius: var(--r-full);
		font-size: var(--t-xs);
	}
	.focus button {
		width: 28px;
		height: 28px;
		border-radius: var(--r-full);
	}
	.readout .b {
		color: var(--text-secondary);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.basis-key {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-3);
		margin: var(--s-2) 0 0;
		padding: 0;
		list-style: none;
		color: var(--text-secondary);
		font-size: var(--t-2xs);
	}
	.basis-key li {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.legend button,
	.legend .hollow > span {
		width: 100%;
		display: grid;
		grid-template-columns: 12px 1fr auto;
		align-items: center;
		gap: var(--s-3);
		min-height: 34px;
		padding: var(--s-1) var(--s-3);
		border-radius: var(--r-md);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		text-align: start;
	}
	.legend button:hover {
		background: var(--surface-hover);
	}
	.legend button.on {
		background: var(--surface-hover);
		color: var(--text-primary);
		box-shadow: inset 0 0 0 1px var(--text-primary);
	}
	.legend .name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.legend i {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}
	.legend .hollow i {
		border: 1px dashed var(--border-strong);
	}
	.legend .n {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.table-alt summary {
		font-size: var(--t-xs);
		color: var(--text-secondary);
		cursor: pointer;
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	.table-alt table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-xs);
	}
	.table-alt th,
	.table-alt td {
		text-align: start;
		padding: var(--s-1) var(--s-2);
		border-bottom: 1px solid var(--border-subtle);
	}
	.table-alt th {
		color: var(--text-muted);
		font-weight: 400;
	}
	.table-alt td button {
		color: var(--text-primary);
		text-align: start;
	}
	.none {
		grid-column: 1 / -1;
		margin: auto;
		text-align: center;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		max-width: 48ch;
		padding: var(--s-6);
	}
	.jump {
		display: flex;
		gap: var(--s-2);
		justify-content: center;
		flex-wrap: wrap;
	}
	.jump button {
		min-height: var(--tap);
		padding: var(--s-2) var(--s-4);
		border: 1px solid var(--border-default);
		border-radius: var(--r-full);
		font-size: var(--t-xs);
		color: var(--text-secondary);
	}
	.jump button.near {
		flex-basis: 100%;
		border-color: var(--accent);
		background: var(--accent-muted);
		color: var(--text-primary);
		font-size: var(--t-sm);
		font-weight: 600;
	}
	.nearlabel {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 400;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-secondary);
		margin-bottom: 2px;
	}

	/* Phone: the room on top at a fixed share of the screen, the panel below. */
	@media (max-width: 900px) {
		.parliament {
			grid-template-columns: 1fr;
			grid-template-rows: 56% minmax(0, 1fr);
		}
		.panel {
			border-inline-start: none;
			border-top: 1px solid var(--border-subtle);
			padding: var(--s-4);
		}
		.terms button {
			min-height: var(--tap);
		}
		.legend button,
		.legend .hollow > span {
			min-height: var(--tap);
		}
	}
</style>
