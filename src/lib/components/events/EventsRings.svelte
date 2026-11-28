<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { app } from '$lib/state.svelte';
	import { formatDate, eventCategoryLabel } from '$lib/t.svelte';
	import { eventTitle, nameOf } from '$lib/names.svelte';
	import { compact } from '$lib/design/media.svelte';
	import { CUTOFF, ds, meetsBasis, personById, institutionById, type Basis, type EventRec } from '$lib/model';
	import { C, DAY, R, angle, arc, chord, dayOf, f1, fracOfDay, geometry, growthClock, layout, point, smooth, startOfYear, yearOfDay } from './rings';
	import { ew, FIRST_YEAR, LAST_YEAR, type EventsView, type Thread } from './view.svelte';

	/**
	 * The rings face: the record as a tree's cross-section.
	 *
	 * One ring per year, January at the top, the bark today. A ring is as thick
	 * as its year's record, a rupture carries a ring of its own and a scar
	 * toward the bark, and the lens squeezes the years before it toward the pith
	 * so the years being read get the room. The geometry is `./rings.ts`; this
	 * file draws it and handles the reader.
	 *
	 * What it shares with the other faces lives in `view`: the filters, the
	 * followed person or institution, and the first year in view (`view.lens`,
	 * the floor of this face's fractional lens). The selection is the app's, so
	 * a selected mark opens the Inspector as everywhere else.
	 *
	 * Keyboard: the figure is one tab stop. The arrows walk the events in the
	 * lens in date order, Enter opens the one walked to, plus and minus move the
	 * lens a year, Escape clears what is set, newest first.
	 */

	interface Props {
		view: EventsView;
		onfollow(th: Thread): void;
		onunfollow(): void;
	}
	let { view, onfollow, onunfollow }: Props = $props();

	interface Ring {
		i: number;
		id: string;
		day: number;
		year: number;
		e: EventRec;
		entities: string[];
	}

	const cutoffDay = dayOf(CUTOFF);
	const years = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, k) => FIRST_YEAR + k);
	const ring: Ring[] = ds.events.map((e, i) => {
		const day = dayOf(e.interval.startEarliest);
		return { i, id: e.id, day, year: yearOfDay(day), e, entities: [...(e.actors ?? []), ...(e.institutions ?? [])] };
	});
	const byId = new Map(ring.map((r) => [r.id, r]));
	/* Ring thickness counts the whole record, whatever the filters, so a filter never reshapes the tree. */
	const counts = years.map(() => 0);
	for (const r of ring) if (r.year >= FIRST_YEAR && r.year <= LAST_YEAR) counts[r.year - FIRST_YEAR]++;
	const newest = [...ring].sort((a, b) => b.day - a.day || a.i - b.i);
	const ruptures = ring.filter((r) => r.e.rupture);

	/* Era starts draw a stronger ring line; every other era is shaded, in the theme's ink. */
	const eraStarts = new Set(ds.eras.map((era) => new Date(era.interval.startEarliest).getUTCFullYear()));
	const eraBands = [...ds.eras]
		.sort((a, b) => a.interval.startEarliest - b.interval.startEarliest)
		.map((era) => {
			const y0 = Math.max(FIRST_YEAR, new Date(era.interval.startEarliest).getUTCFullYear());
			const y1 = Math.min(LAST_YEAR, new Date(era.interval.endLatest ?? CUTOFF).getUTCFullYear());
			return { first: y0 - FIRST_YEAR, last: y1 - FIRST_YEAR };
		})
		.filter((b, k) => k % 2 === 1 && b.last >= b.first);

	/* ---------------------------------------------------------------- state */

	/** The fractional lens: its floor is the first year in full; the year before it is part-way squeezed. */
	let focus = $state(untrack(() => view.lens));
	/**
	 * Where the lens rests. While the lens animates, only the figure follows
	 * `focus` frame by frame; the side list, the counts and the shared state
	 * move once, when it lands, so a sweep across seventy years does not
	 * re-render the list seventy times.
	 */
	let settled = $state(untrack(() => view.lens));
	/** The growth front, a day, while "Watch it grow" plays. */
	let grow = $state<number | null>(null);
	let growing = $state(false);
	/** The mark under the mouse. */
	let hot = $state<string | null>(null);
	/** The mark the arrow keys walked to. */
	let cursor = $state<string | null>(null);
	/** Mark radius and type scale in figure units, so a mark stays a thumb's size on any screen. */
	let rho = $state(4);
	let k = $state(1);
	let svg = $state<SVGSVGElement | null>(null);

	const reduced = new MediaQuery('(prefers-reduced-motion: reduce)', false);
	const rtl = $derived(app.locale === 'ar');
	const dir = $derived(rtl ? -1 : 1);

	const geo = $derived(geometry(years, counts, focus, grow, rho));
	const pos = $derived(layout(ring, years, geo, rho, dir));
	const atFloor = $derived(ring.map((r) => meetsBasis(r.e.basis as Basis, app.basisFloor)));
	const passing = $derived(ring.map((r) => view.passes(r.e, app.basisFloor)));
	const growYear = $derived(grow == null ? null : Math.min(LAST_YEAR, yearOfDay(grow)));
	const growR = $derived(growYear == null ? R : geo.outer[growYear - FIRST_YEAR]);

	function live(r: Ring): boolean {
		const p = pos[r.i];
		return !!p && !p.cored && atFloor[r.i] && passing[r.i] && !(grow != null && r.day > grow);
	}

	const lensYear = $derived(Math.floor(settled));

	/** Events inside the drawn years; the rest have no ring to sit on. */
	const placed = ring.filter((r) => r.year >= FIRST_YEAR && r.year <= LAST_YEAR);
	/* The last year folded into the core: changes a few times per lens move, not every frame. */
	const coreEnd = $derived(geo.coreEnd);

	/*
	 * Mark positions are written here, in one pass, rather than through each
	 * mark's template: a lens move changes every position on every frame, and
	 * 257 template effects cost several times what one loop does. The template
	 * keeps what changes only with the selection or the filters.
	 */
	let marksEl = $state<SVGGElement | null>(null);
	$effect(() => {
		const P = pos;
		const root = marksEl;
		/* Marks come and go with the basis floor and the growth front; place the new ones too. */
		void atFloor;
		void grow;
		if (!root) return;
		for (const el of root.children) {
			const p = P[Number((el as SVGGElement).dataset.i)];
			if (!p) continue;
			el.setAttribute('transform', `translate(${f1(C + p.r * Math.cos(p.a))} ${f1(C + p.r * Math.sin(p.a))})`);
		}
	});
	const inLens = $derived(newest.filter((r) => r.year >= lensYear && atFloor[r.i] && passing[r.i]));

	/* --------------------------------------------- what the selection lights */

	const sel = $derived(app.selected ? (byId.get(app.selected) ?? null) : null);

	/** Events sharing a person or institution with the selected one, when no thread is followed. */
	const related = $derived.by(() => {
		if (!sel || view.thread || grow != null || !pos[sel.i]) return null;
		const out: Ring[] = [];
		for (const o of ring) if (o !== sel && live(o) && o.entities.some((id) => sel.entities.includes(id))) out.push(o);
		return out;
	});
	const lit = $derived(related && sel ? new Set([sel.id, ...related.map((o) => o.id)]) : null);

	const threadPath = $derived.by(() => {
		if (!view.thread) return '';
		const list = ring.filter((r) => live(r)).sort((a, b) => a.day - b.day);
		if (list.length < 2) return '';
		return smooth(list.map((r) => point(pos[r.i]!.r, pos[r.i]!.a)));
	});

	const chords = $derived.by(() => {
		if (!related || !sel) return [];
		const s = point(pos[sel.i]!.r, pos[sel.i]!.a);
		return related.map((o) => ({ id: o.id, d: chord(s, point(pos[o.i]!.r, pos[o.i]!.a)) }));
	});

	/* ------------------------------------------------------------- the marks */

	const rad = $derived(rho);
	function markRadius(r: Ring): number {
		return rad * (r.e.rupture ? 1.15 : 1);
	}

	const scars = $derived.by(() =>
		ruptures.flatMap((r) => {
			const p = pos[r.i];
			if (!p || !atFloor[r.i] || !passing[r.i] || (grow != null && r.day > grow)) return [];
			const from = p.cored ? geo.rc : p.r + markRadius(r) + 2.6;
			const to = Math.min(growR, from + (p.cored ? 70 : 150));
			if (to <= from) return [];
			const a = point(from, p.a);
			const b = point(to, p.a);
			return [{ i: r.i, id: r.id, x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]) }];
		})
	);

	/* ------------------------------------------------------- rings and bark */

	const ringLines = $derived.by(() => {
		const out: { y: number; r: number }[] = [];
		for (let i = 1; i < years.length; i++) {
			const r = geo.inner[i];
			if (r > geo.rc + 0.5 && r < geo.bark - 0.1) out.push({ y: years[i], r: f1(r) });
		}
		return out;
	});

	const tints = $derived.by(() =>
		eraBands.flatMap((b, n) => {
			const r0 = Math.max(geo.rc, geo.inner[b.first]);
			const r1 = geo.outer[b.last];
			return r1 - r0 >= 0.5 ? [{ n, r: f1((r0 + r1) / 2), w: f1(r1 - r0) }] : [];
		})
	);

	const nowAngle = $derived(angle(fracOfDay(cutoffDay), dir));
	const bark = $derived.by(() => {
		if (grow != null) return null;
		const top = -Math.PI / 2;
		return {
			lived: dir > 0 ? arc(R, top, nowAngle) : arc(R, nowAngle, top),
			open: dir > 0 ? arc(R, nowAngle, 1.5 * Math.PI) : arc(R, -2.5 * Math.PI, nowAngle)
		};
	});

	/* -------------------------------------------- today, and the last 30 days */

	const fresh = $derived(ring.filter((r) => atFloor[r.i] && passing[r.i] && r.day <= cutoffDay && cutoffDay - r.day <= 30));
	const freshTicks = $derived(
		fresh.map((r) => {
			const a = angle(fracOfDay(r.day), dir);
			const p0 = point(R + 2, a);
			const p1 = point(R + 11, a);
			return { id: r.id, x1: f1(p0[0]), y1: f1(p0[1]), x2: f1(p1[0]), y2: f1(p1[1]) };
		})
	);
	const today = $derived.by(() => {
		const p0 = point(geo.inner[LAST_YEAR - FIRST_YEAR], nowAngle);
		const p1 = point(R + 30, nowAngle);
		const at = point(R + 38, nowAngle);
		const left = Math.cos(nowAngle) < 0;
		return {
			line: { x1: f1(p0[0]), y1: f1(p0[1]), x2: f1(p1[0]), y2: f1(p1[1]) },
			x: f1(at[0]),
			y: f1(at[1] - 10 * k),
			anchor: left !== rtl ? 'end' : 'start'
		};
	});

	/* ------------------------------------------------------- months, years */

	const months = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat(app.locale, { month: 'short', timeZone: 'UTC' });
		const now = new Date(CUTOFF).getUTCMonth();
		return Array.from({ length: 12 }, (_, m) => {
			const t = Date.UTC(LAST_YEAR, m, 1);
			const at = point(R + 30, angle(fracOfDay(t / DAY) + 1 / 24, dir));
			return { m, x: f1(at[0]), y: f1(at[1]), label: fmt.format(new Date(t)), now: m === now };
		});
	});

	/* Year labels up the January line, where a ring has room for one. */
	const yearLabels = $derived.by(() => {
		const out: { y: number; ty: number; big: boolean }[] = [];
		if (grow != null) return out;
		const rc = geo.rc;
		let lastR = Infinity;
		for (let i = years.length - 1; i >= 0; i--) {
			const y = years[i];
			const rA = geo.inner[i];
			const rB = geo.outer[i];
			const mid = (rA + rB) / 2;
			const room = rB - rA;
			if (rA < rc || room < 2.5 || (rc && mid < rc + 16 * k)) continue;
			const want = y === LAST_YEAR || y % 10 === 0 || eraStarts.has(y) || room > 20;
			if (!want || lastR - mid < 15 * k) continue;
			lastR = mid;
			out.push({ y, ty: f1(C - mid), big: y === LAST_YEAR || room > 40 });
		}
		return out;
	});

	const coreCount = $derived(geo.coreEnd === null ? 0 : ring.filter((r) => r.year <= geo.coreEnd! && atFloor[r.i]).length);

	function countWord(n: number): string {
		return n === 1 ? ew('events.countOne') : ew('events.count', { n });
	}

	/* -------------------------------------------- the mark being looked at */

	const focusId = $derived(hot ?? cursor ?? (compact.current ? null : app.selected));
	const tag = $derived.by(() => {
		const r = focusId ? byId.get(focusId) : undefined;
		if (!r || !live(r)) return null;
		const p = pos[r.i]!;
		const at = point(p.r, p.a);
		const right = at[0] < C;
		const max = Math.round(90 / k);
		let title = eventTitle(r.e);
		if (title.length > max) title = title.slice(0, max - 1).trim() + '…';
		return {
			x: f1(at[0]),
			y: f1(at[1]),
			tx: f1(at[0] + (right ? 1 : -1) * rho * 3.4),
			ty: f1(at[1] - 6 * k),
			anchor: right !== rtl ? 'start' : 'end',
			title,
			sub: `${formatDate(r.e.interval.startEarliest, 'day')} · ${eventCategoryLabel(r.e.category)}`
		};
	});

	/* ------------------------------------------------------------- the lens */

	let anim = 0;
	function setFocus(F: number, animate = true) {
		const to = Math.max(FIRST_YEAR, Math.min(LAST_YEAR + 0.95, F));
		cancelAnimationFrame(anim);
		const from = focus;
		const duration = !animate || reduced.current ? 0 : 560;
		if (!duration || from === to) {
			focus = to;
			settled = to;
			return;
		}
		const t0 = performance.now();
		const step = (now: number) => {
			const p = Math.min(1, (now - t0) / duration);
			focus = from + (to - from) * (1 - Math.pow(1 - p, 3));
			if (p < 1) anim = requestAnimationFrame(step);
			else {
				focus = to;
				settled = to;
			}
		};
		anim = requestAnimationFrame(step);
	}

	/* The shared state follows this face's lens: its first full year, and whether it rests on a whole year. */
	$effect(() => {
		const F = settled;
		const n = inLens.length;
		untrack(() => {
			const y = Math.floor(F);
			if (view.lens !== y) view.lens = y;
			view.atCutoff = Number.isInteger(F) && grow == null;
			if (view.shown !== n) view.shown = n;
		});
	});

	/* A preset picked in the filter bar moves the lens. */
	let seenSeq = untrack(() => view.lensSeq);
	$effect(() => {
		const s = view.lensSeq;
		untrack(() => {
			if (s === seenSeq) return;
			seenSeq = s;
			stopGrow();
			setFocus(view.lens);
		});
	});

	/* Opening a record folded into the core widens the lens to its year. */
	$effect(() => {
		const r = sel;
		untrack(() => {
			if (r && pos[r.i]?.cored) setFocus(r.year);
		});
	});

	$effect(() => () => {
		cancelAnimationFrame(anim);
		stopGrow();
	});

	/* --------------------------------------------------------- the core sample */

	const stripMax = Math.max(1, ...counts);
	const stripBars = years
		.map((y, i) => {
			const n = counts[i];
			const h = n ? Math.max(6, (n / stripMax) * 92) : 2;
			return `M${f1(i + 0.5)} 100V${f1(100 - h)}`;
		})
		.join('');
	const stripRuptures = years
		.map((y, i) => (ruptures.some((r) => r.year === y) ? `M${f1(i + 0.1)} 0H${f1(i + 0.9)}V5H${f1(i + 0.1)}Z` : ''))
		.join('');
	const stripAxis = [FIRST_YEAR, ...years.filter((y) => y % 10 === 0 && y - FIRST_YEAR > 7 && LAST_YEAR - y > 7), LAST_YEAR].map((y) => ({
		y,
		at: (((y - FIRST_YEAR + 0.5) / years.length) * 100).toFixed(1)
	}));
	const stripClip = $derived.by(() => {
		if (growYear != null) return `inset(0 ${(100 - ((growYear - FIRST_YEAR + 1) / years.length) * 100).toFixed(1)}% 0 0)`;
		const pct = Math.max(0, Math.min(100, ((Math.floor(focus) - FIRST_YEAR) / years.length) * 100));
		return `inset(0 0 0 ${pct.toFixed(1)}%)`;
	});

	/* ---------------------------------------------------------- watch it grow */

	const clock = growthClock(
		FIRST_YEAR,
		cutoffDay,
		ring.map((r) => r.day)
	);
	const sortedDays = ring.map((r) => r.day).sort((a, b) => a - b);
	let growRaf = 0;
	let growTimer: ReturnType<typeof setTimeout> | undefined;

	const grownCount = $derived.by(() => {
		if (grow == null) return 0;
		let n = 0;
		while (n < sortedDays.length && sortedDays[n] <= grow) n++;
		return n;
	});

	function stopGrow() {
		cancelAnimationFrame(growRaf);
		clearTimeout(growTimer);
		if (!growing) return;
		growing = false;
		grow = null;
	}

	/*
	 * Reduced motion: no animation, the tree in steps instead, one era at a
	 * time, so the reader still sees how the record grew.
	 */
	const eraSteps = [...eraStarts].filter((y) => y > FIRST_YEAR && y <= LAST_YEAR).sort((a, b) => a - b);

	function toggleGrow() {
		if (growing) {
			stopGrow();
			return;
		}
		cancelAnimationFrame(anim);
		hot = null;
		cursor = null;
		focus = FIRST_YEAR;
		settled = FIRST_YEAR;
		growing = true;
		if (reduced.current) {
			const steps = [...eraSteps.map((y) => startOfYear(y) - 1), cutoffDay];
			let n = 0;
			const next = () => {
				if (!growing) return;
				grow = steps[n++];
				growTimer = setTimeout(n < steps.length ? next : stopGrow, n < steps.length ? 1400 : 1600);
			};
			next();
			return;
		}
		const t0 = performance.now();
		const step = (now: number) => {
			if (!growing) return;
			const p = Math.min(1, (now - t0) / 7000);
			grow = clock(p);
			if (p < 1) growRaf = requestAnimationFrame(step);
			else growTimer = setTimeout(stopGrow, 1200);
		};
		growRaf = requestAnimationFrame(step);
	}

	/* --------------------------------------------------- pointer and keyboard */

	function toFigure(ev: MouseEvent): [number, number, number] {
		const m = svg?.getScreenCTM();
		if (!m) return [0, 0, 1];
		const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
		return [p.x, p.y, 1 / m.a];
	}

	function nearest(ev: MouseEvent): Ring | null {
		const [x, y, unit] = toFigure(ev);
		let best: Ring | null = null;
		let bd = 22 * unit;
		for (const r of ring) {
			if (!live(r)) continue;
			const p = point(pos[r.i]!.r, pos[r.i]!.a);
			const d = Math.hypot(p[0] - x, p[1] - y);
			if (d < bd) {
				bd = d;
				best = r;
			}
		}
		return best;
	}

	function onMove(ev: PointerEvent) {
		if (ev.pointerType !== 'mouse' || growing) return;
		const r = nearest(ev);
		hot = r ? r.id : null;
	}

	function onClick(ev: MouseEvent) {
		stopGrow();
		const target = ev.target as Element;
		const yearEl = target.closest?.('[data-year]');
		if (yearEl) {
			setFocus(Number(yearEl.getAttribute('data-year')));
			return;
		}
		if (target.closest?.('.core')) {
			setFocus(FIRST_YEAR);
			return;
		}
		const r = nearest(ev);
		cursor = null;
		if (r) {
			if (app.selected !== r.id) app.select(r.id);
		} else if (app.selected) app.select(null);
	}

	function onWheel(ev: WheelEvent) {
		if (!(ev.ctrlKey || ev.metaKey)) return;
		ev.preventDefault();
		stopGrow();
		setFocus(focus - ev.deltaY * 0.02, false);
	}

	/** The events the arrow keys walk: in the lens, passing the filters, oldest first. */
	function walkList(): Ring[] {
		return ring.filter((r) => r.year >= lensYear && live(r)).sort((a, b) => a.day - b.day || a.i - b.i);
	}

	function onKey(ev: KeyboardEvent) {
		const key = ev.key;
		if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowDown') {
			ev.preventDefault();
			stopGrow();
			const list = walkList();
			if (!list.length) return;
			const later = key === 'ArrowUp' || (dir > 0 ? key === 'ArrowRight' : key === 'ArrowLeft');
			const from = cursor ?? app.selected;
			let i = list.findIndex((r) => r.id === from);
			i = i < 0 ? list.length - 1 : Math.max(0, Math.min(list.length - 1, i + (later ? 1 : -1)));
			cursor = list[i].id;
		} else if (key === 'Enter' || key === ' ') {
			if (!cursor) return;
			ev.preventDefault();
			if (app.selected !== cursor) app.select(cursor);
		} else if (key === '+' || key === '=') {
			ev.preventDefault();
			stopGrow();
			setFocus(lensYear + 1);
		} else if (key === '-' || key === '_') {
			ev.preventDefault();
			stopGrow();
			setFocus(lensYear - 1);
		} else if (key === 'Escape') {
			if (growing) stopGrow();
			else if (cursor) cursor = null;
			else if (app.selected) app.select(null);
			else if (view.thread) onunfollow();
			else return;
			ev.preventDefault();
		}
	}

	/** What the arrow keys landed on, for a screen reader. */
	const announce = $derived.by(() => {
		const r = cursor ? byId.get(cursor) : undefined;
		return r ? `${eventTitle(r.e)}, ${formatDate(r.e.interval.startEarliest, 'day')}` : '';
	});

	/* The plate scales with its box; marks and type are sized against the screen. */
	$effect(() => {
		const el = svg;
		if (!el) return;
		let frame = 0;
		const measure = () => {
			const m = el.getScreenCTM();
			const s = (m && m.a) || 1;
			rho = Math.max(3.2, Math.min(9, 3.4 / s));
			k = Math.max(1, Math.min(2.6, 0.95 / s));
		};
		measure();
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		});
		ro.observe(el);
		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
		};
	});

	/* --------------------------------------------------------- the side list */

	/** The selected event's people and institutions, each a thread the reader can follow. */
	const follow = $derived.by(() => {
		if (!sel) return [];
		return sel.entities.flatMap((id) => {
			const person = personById.get(id);
			const inst = person ? undefined : institutionById.get(id);
			if (!person && !inst) return [];
			let n = 0;
			for (const r of ring) if (atFloor[r.i] && r.entities.includes(id)) n++;
			return [{ id, kind: (person ? 'actor' : 'institution') as Thread['kind'], name: nameOf(person ?? inst), n }];
		});
	});
</script>

<div class="rings" class:compact={compact.current}>
	<div class="plate">
		<div class="lens">
			<div class="strip" aria-hidden={growing ? 'true' : undefined}>
				<svg class="strip-svg" class:flip={rtl} viewBox="0 0 {years.length} 100" preserveAspectRatio="none" aria-hidden="true">
					<path class="bars" d={stripBars} />
					<path class="bars in" d={stripBars} style:clip-path={stripClip} />
					<path class="strip-ruptures" d={stripRuptures} />
				</svg>
				<input
					class="slider"
					type="range"
					min={FIRST_YEAR}
					max={LAST_YEAR + 0.95}
					step="0.05"
					value={focus}
					dir={rtl ? 'rtl' : 'ltr'}
					aria-label={ew('events.lens')}
					aria-valuetext={String(lensYear)}
					oninput={(ev) => {
						stopGrow();
						setFocus(Number((ev.currentTarget as HTMLInputElement).value), false);
					}}
				/>
			</div>
			<div class="axis mono" aria-hidden="true">
				{#each stripAxis as a (a.y)}
					<span style:inset-inline-start="{a.at}%">{a.y}</span>
				{/each}
			</div>
			<div class="lens-row">
				<p class="readout mono" aria-live="polite">
					{#if growing && grow != null}
						<b>{yearOfDay(grow)}</b> {countWord(grownCount)}
					{:else}
						{ew('events.rings.lensRange', { from: lensYear, n: inLens.length })}
					{/if}
				</p>
				<button type="button" class="grow" aria-pressed={growing} onclick={toggleGrow}>
					{growing ? ew('events.rings.stop') : ew('events.rings.grow')}
				</button>
			</div>
		</div>

		<!-- The figure is one tab stop with its own keyboard model (arrows, Enter, plus, minus, Escape); see the header. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<svg
			bind:this={svg}
			class="figure"
			viewBox="-110 -45 1220 1100"
			role="application"
			tabindex="0"
			aria-label={ew('events.rings.label', { n: ds.events.length, years: years.length })}
			style:--k={k}
			onpointermove={onMove}
			onpointerleave={() => (hot = null)}
			onclick={onClick}
			onkeydown={onKey}
			onwheel={onWheel}
			class:pointing={hot !== null}
		>
			<g class="tints">
				{#each tints as b (b.n)}
					<circle cx={C} cy={C} r={b.r} stroke-width={b.w} />
				{/each}
			</g>
			<g class="lines">
				{#each ringLines as l (l.y)}
					<circle class:dec={l.y % 10 === 0} class:era={eraStarts.has(l.y)} cx={C} cy={C} r={l.r} />
				{/each}
			</g>
			{#if bark}
				<path class="bark" d={bark.lived} />
				<path class="bark open" d={bark.open} />
			{:else}
				<circle class="bark" cx={C} cy={C} r={f1(growR)} />
			{/if}
			{#if geo.coreEnd !== null}
				<g class="core">
					<circle class="core-disc" cx={C} cy={C} r={f1(geo.rc)} />
				</g>
			{/if}
			<g class="scars">
				{#each scars as s (s.id)}
					<linearGradient id="ev-scar-{s.i}" gradientUnits="userSpaceOnUse" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}>
						<stop offset="0" class="scar-from" />
						<stop offset="1" class="scar-to" />
					</linearGradient>
					<line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="url(#ev-scar-{s.i})" />
				{/each}
			</g>
			<g class="links">
				{#each chords as c (c.id)}
					<path class="chord" d={c.d} />
				{/each}
				{#if threadPath}
					<path class="thread" d={threadPath} />
				{/if}
			</g>
			<g class="marks" bind:this={marksEl}>
				{#each placed as r (r.id)}
					{#if atFloor[r.i] && !(grow != null && r.day > grow)}
						{@const mr = markRadius(r)}
						<g
							class="mark b-{r.e.basis}"
							data-i={r.i}
							class:cored={coreEnd !== null && r.year <= coreEnd}
							class:dim={!passing[r.i]}
							class:faded={lit !== null && !lit.has(r.id)}
							class:hot={r.id === focusId || r.id === app.selected}
						>
							{#if r.e.rupture}
								<circle class="rr" r={f1(mr + 2.6)} />
							{/if}
							<circle class="m" r={f1(mr)} />
						</g>
					{/if}
				{/each}
			</g>
			{#if geo.coreEnd !== null}
				<!-- The core's words sit above the marks: the first ring outside it is often the busiest. -->
				<g class="core">
					<text class="core-a" x={C} y={f1(C - 8 * k)} direction={rtl ? 'rtl' : 'ltr'}>{ew('events.years', { start: FIRST_YEAR, end: geo.coreEnd })}</text>
					<text class="core-b" x={C} y={f1(C + 8 * k)} direction={rtl ? 'rtl' : 'ltr'}>{countWord(coreCount)}</text>
				</g>
			{/if}
			<g class="years">
				{#each yearLabels as l (l.y)}
					<text
						class="year mono"
						class:big={l.big}
						data-year={l.y}
						x={C + dir * 6}
						y={l.ty}
						text-anchor="start"
						direction={rtl ? 'rtl' : 'ltr'}>{l.y}</text
					>
				{/each}
			</g>
			<g class="months" aria-hidden="true">
				<circle class="ticks" cx={C} cy={C} r={R} transform="rotate(-90 {C} {C})" stroke-dasharray="4 234.24" />
				{#each months as m (m.m)}
					<text class="month mono" class:now={m.now} x={m.x} y={m.y}>{m.label}</text>
				{/each}
			</g>
			{#if grow == null}
				<g class="today">
					<line class="now-line" {...today.line} stroke-dasharray="2 3" />
					{#each freshTicks as f (f.id)}
						<line class="fresh" x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
					{/each}
					<text class="today-text mono" x={today.x} y={today.y} text-anchor={today.anchor} direction={rtl ? 'rtl' : 'ltr'}>
						<tspan x={today.x}>{ew('events.rings.today')}</tspan>
						<tspan class="sub" x={today.x} dy="1.25em">{formatDate(CUTOFF, 'day')}</tspan>
						<tspan class="sub" x={today.x} dy="1.25em">{ew('events.rings.fresh', { n: fresh.length, days: 30 })}</tspan>
					</text>
				</g>
			{/if}
			{#if tag}
				<g class="hot-tag">
					<circle class="halo" cx={tag.x} cy={tag.y} r={f1(rho * 2.8)} />
					<text class="tag" x={tag.tx} y={tag.ty} text-anchor={tag.anchor} direction={rtl ? 'rtl' : 'ltr'}>
						{tag.title}<tspan class="sub" x={tag.tx} dy="1.35em">{tag.sub}</tspan>
					</text>
				</g>
			{/if}
		</svg>
		<p class="sr-only" aria-live="polite">{announce}</p>
	</div>

	{#if !compact.current}
		<aside class="side" aria-label={ew('events.rings.side')}>
			{#if follow.length}
				<div class="follow" role="group" aria-label={ew('events.rings.follow')}>
					<span class="follow-label">{ew('events.rings.follow')}</span>
					{#each follow as f (f.id)}
						<button
							type="button"
							class="who"
							class:on={view.thread?.id === f.id}
							aria-pressed={view.thread?.id === f.id}
							onclick={() => (view.thread?.id === f.id ? onunfollow() : onfollow({ kind: f.kind, id: f.id }))}
						>
							<span dir="auto">{f.name}</span> <span class="n mono">{f.n}</span>
						</button>
					{/each}
				</div>
			{/if}
			<div class="side-head">
				<span>{ew('events.rings.side')}</span>
				<span class="mono">{countWord(inLens.length)}</span>
			</div>
			<ul class="feed">
				{#each inLens as r (r.id)}
					<li>
						<button
							type="button"
							class="row"
							class:sel={app.selected === r.id}
							aria-current={app.selected === r.id ? 'true' : undefined}
							onpointerenter={() => (hot = r.id)}
							onpointerleave={() => (hot = null)}
							onclick={() => {
								if (app.selected !== r.id) app.select(r.id);
							}}
						>
							<span class="date mono">{formatDate(r.e.interval.startEarliest, 'day')}</span>
							<span class="title" dir="auto">{eventTitle(r.e)}</span>
							{#if r.e.rupture}<i class="rmark" aria-hidden="true"></i>{/if}
						</button>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
</div>

<style>
	.rings {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
	}
	.rings.compact {
		grid-template-columns: minmax(0, 1fr);
		overflow-y: auto;
	}
	.plate {
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding: var(--s-4) var(--s-6) var(--s-2);
	}
	.compact .plate {
		padding: var(--s-3) var(--s-4);
	}

	/* The core sample: the record per year, the lens's share of it in ink. */
	.lens {
		max-width: 720px;
		width: 100%;
		margin-inline: auto;
	}
	.strip {
		position: relative;
		height: 34px;
	}
	.strip-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.strip-svg.flip {
		transform: scaleX(-1);
	}
	.bars {
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 4px;
		vector-effect: non-scaling-stroke;
		opacity: 0.5;
	}
	.bars.in {
		stroke: var(--text-secondary);
		opacity: 0.9;
	}
	.strip-ruptures {
		fill: var(--rupture);
	}
	.slider {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		appearance: none;
		background: transparent;
		cursor: ew-resize;
	}
	.slider::-webkit-slider-runnable-track {
		height: 100%;
		background: transparent;
	}
	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 3px;
		height: 34px;
		background: var(--accent);
		border-radius: 1px;
	}
	.slider::-moz-range-track {
		background: transparent;
	}
	.slider::-moz-range-thumb {
		width: 3px;
		height: 34px;
		border: 0;
		border-radius: 1px;
		background: var(--accent);
	}
	.slider:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.axis {
		position: relative;
		height: 16px;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.axis span {
		position: absolute;
		top: 2px;
		transform: translateX(-50%);
	}
	.axis span:first-child {
		transform: none;
	}
	.axis span:last-child {
		transform: translateX(-100%);
	}
	:global([dir='rtl']) .axis span {
		transform: translateX(50%);
	}
	:global([dir='rtl']) .axis span:first-child {
		transform: none;
	}
	:global([dir='rtl']) .axis span:last-child {
		transform: translateX(100%);
	}
	.lens-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		margin-top: var(--s-1);
	}
	.readout {
		margin: 0;
		font-size: var(--t-2xs);
		color: var(--text-muted);
	}
	.readout b {
		font-weight: 500;
		color: var(--text-primary);
		margin-inline-end: var(--s-2);
	}
	.grow {
		flex-shrink: 0;
		border: 1px solid var(--accent-border);
		border-radius: var(--r-sm);
		padding: 2px 10px;
		font-size: var(--t-2xs);
		color: var(--accent);
		min-height: 24px;
	}
	.grow:hover,
	.grow[aria-pressed='true'] {
		color: var(--accent-text);
		background: var(--accent);
	}
	.grow:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	/* The figure, drawn in the theme's ink on the theme's surface. */
	.figure {
		contain: layout paint;
		flex: 1;
		min-height: 0;
		width: 100%;
		max-height: 100%;
		margin-top: var(--s-2);
		direction: ltr;
		--k: 1;
	}
	.compact .figure {
		flex: none;
		height: auto;
		aspect-ratio: 1220 / 1100;
	}
	.figure:focus {
		outline: none;
	}
	.figure:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: var(--r-md);
	}
	.figure.pointing {
		cursor: pointer;
	}
	circle,
	path,
	line {
		vector-effect: non-scaling-stroke;
	}
	.tints circle {
		fill: none;
		stroke: var(--text-primary);
		stroke-opacity: 0.035;
		vector-effect: none;
	}
	.lines circle {
		fill: none;
		stroke: var(--text-primary);
		stroke-opacity: 0.09;
		stroke-width: 0.6;
	}
	.lines circle.dec {
		stroke-opacity: 0.22;
	}
	.lines circle.era {
		stroke-opacity: 0.42;
	}
	.bark {
		fill: none;
		stroke: var(--text-primary);
		stroke-opacity: 0.75;
		stroke-width: 1.5;
	}
	.bark.open {
		stroke-dasharray: 3 4;
		stroke-opacity: 0.35;
	}
	.core {
		cursor: zoom-out;
	}
	.core-disc {
		fill: var(--text-primary);
		fill-opacity: 0.06;
		stroke: var(--text-primary);
		stroke-opacity: 0.35;
	}
	.core:hover .core-disc {
		fill-opacity: 0.12;
	}
	.core text {
		font-family: var(--font-mono);
		text-anchor: middle;
		dominant-baseline: middle;
		paint-order: stroke;
		stroke: var(--surface-base);
		stroke-width: calc(7px * var(--k));
		stroke-linejoin: round;
	}
	.core-a {
		font-size: calc(var(--t-xs) * var(--k));
		fill: var(--text-primary);
	}
	.core-b {
		font-size: calc(var(--t-2xs) * var(--k));
		fill: var(--text-muted);
	}
	.scar-from {
		stop-color: var(--rupture);
		stop-opacity: 0.6;
	}
	.scar-to {
		stop-color: var(--rupture);
		stop-opacity: 0.04;
	}
	.scars line {
		stroke-width: 1.2;
	}
	.chord {
		fill: none;
		stroke: var(--text-primary);
		stroke-opacity: 0.32;
		stroke-width: 1;
	}
	.thread {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	/* Marks: basis by fill and dash, never by colour alone. */
	.mark {
		transition: opacity var(--dur-fast) linear;
	}
	.mark .m {
		stroke-width: 1.3;
	}
	.mark.b-documented .m {
		fill: var(--basis-documented);
		stroke: var(--basis-documented);
	}
	.mark.b-reported .m {
		fill: none;
		stroke: var(--basis-reported);
		stroke-width: 1.8;
		stroke-dasharray: 3.2 2;
	}
	.mark.b-inferred .m {
		fill: none;
		stroke: var(--basis-inferred);
		stroke-dasharray: 1 2;
		opacity: 0.6;
	}
	.mark.b-unsubstantiated .m {
		fill: none;
		stroke: var(--basis-unsubstantiated);
		stroke-dasharray: 0.6 1.6 3 1.6;
		opacity: 0.45;
	}
	.mark .rr {
		fill: none;
		stroke: var(--rupture);
		stroke-width: 1.4;
		stroke-opacity: 0.85;
	}
	.mark.cored {
		opacity: 0.35;
	}
	.mark.faded {
		opacity: 0.22;
	}
	.mark.dim {
		opacity: 0.12;
	}
	.mark.hot .m {
		stroke-width: 2.6;
		opacity: 1;
	}
	.year {
		font-size: calc(var(--t-2xs) * var(--k));
		fill: var(--text-muted);
		paint-order: stroke;
		stroke: var(--surface-base);
		stroke-width: calc(6px * var(--k));
		stroke-linejoin: round;
		dominant-baseline: middle;
		cursor: zoom-in;
	}
	.year:hover {
		fill: var(--accent);
	}
	.year.big {
		font-size: calc(var(--t-xs) * var(--k));
		fill: var(--text-primary);
	}
	.ticks {
		fill: none;
		stroke: var(--text-primary);
		stroke-opacity: 0.4;
	}
	.month {
		font-size: calc(var(--t-xs) * var(--k));
		fill: var(--text-faint);
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.month.now {
		fill: var(--text-primary);
	}
	.now-line {
		stroke: var(--text-primary);
		stroke-width: 1.2;
	}
	.fresh {
		stroke: var(--accent);
		stroke-width: 1.4;
	}
	.today-text {
		font-size: calc(var(--t-xs) * var(--k));
		fill: var(--text-primary);
		paint-order: stroke;
		stroke: var(--surface-base);
		stroke-width: calc(6px * var(--k));
		stroke-linejoin: round;
	}
	.sub {
		font-size: calc(var(--t-2xs) * var(--k));
		fill: var(--text-muted);
	}
	.halo {
		fill: none;
		stroke: var(--text-primary);
		stroke-width: 1.2;
		pointer-events: none;
	}
	.tag {
		font-family: var(--font-sans);
		font-size: calc(var(--t-sm) * var(--k));
		fill: var(--text-primary);
		paint-order: stroke;
		stroke: var(--surface-base);
		stroke-width: calc(6px * var(--k));
		stroke-linejoin: round;
		pointer-events: none;
	}

	/* The side list: the lens, newest first. */
	.side {
		contain: layout paint;
		min-height: 0;
		display: flex;
		flex-direction: column;
		border-inline-start: 1px solid var(--border-subtle);
	}
	.follow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-3) var(--s-4);
		border-bottom: 1px solid var(--border-subtle);
	}
	.follow-label {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.who {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		border: 1px solid var(--border-default);
		border-radius: var(--r-sm);
		padding: 1px 8px;
		font-size: var(--t-2xs);
		color: var(--text-secondary);
		background: var(--surface-raised);
	}
	.who:hover {
		color: var(--text-primary);
		border-color: var(--border-strong);
	}
	.who.on {
		border-color: var(--accent-border);
		color: var(--text-primary);
		background: var(--accent-muted);
	}
	.who .n {
		color: var(--text-faint);
	}
	.who:focus-visible,
	.row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.side-head {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-4) var(--s-2);
		font-size: var(--t-2xs);
		color: var(--text-muted);
	}
	.side-head .mono {
		color: var(--text-faint);
	}
	.feed {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: 0 var(--s-2) var(--s-6);
	}
	.row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		gap: var(--s-3);
		width: 100%;
		padding: var(--s-2);
		border-radius: var(--r-sm);
		text-align: start;
	}
	.row:hover {
		background: var(--surface-hover);
	}
	.row.sel {
		background: var(--accent-muted);
	}
	.date {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.title {
		font-size: var(--t-xs);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.row:hover .title,
	.row.sel .title {
		color: var(--text-primary);
	}
	.rmark {
		width: 6px;
		height: 6px;
		transform: rotate(45deg);
		background: var(--rupture);
	}
</style>
