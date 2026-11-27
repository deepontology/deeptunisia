/* Growth rings: /events.
 *
 * One file, two jobs. The first block is the geometry the build and the browser
 * share: ring weights, the lens compression, the core fold, lane packing and the
 * angles. The build imports this file for its first frame; the page loads the
 * same bytes as a plain script. Nothing here reads the DOM at that point.
 *
 * The second block is the enhancement: it reads the ledger's rows (which are the
 * figure's data), draws the marks once, and updates attributes on them while the
 * lens moves. Every word comes from the page, never from this file.
 */
(function () {
	'use strict';

	var DAY = 86400000;
	var C = 500;
	var R = 455;
	var R0 = 8;
	var TAU = 2.2;

	function f1(v) {
		return Math.round(v * 10) / 10;
	}
	function yearOfDay(d) {
		return new Date(d * DAY).getUTCFullYear();
	}
	function startOfYear(y) {
		return Date.UTC(y, 0, 1) / DAY;
	}
	function fracOfDay(d) {
		var y = yearOfDay(d);
		return (d - startOfYear(y)) / (startOfYear(y + 1) - startOfYear(y));
	}
	function baseWeight(n) {
		return 0.5 + Math.pow(n, 0.75);
	}

	/* A ring is as thick as its year's record; years before the lens shrink
	   exponentially, so a recent lens pushes the old core close to the pith. */
	function weights(years, counts, F, growDay) {
		var fy = Math.floor(F);
		var gy = growDay == null ? Infinity : yearOfDay(growDay);
		var out = [];
		for (var i = 0; i < years.length; i++) {
			var y = years[i];
			var w = baseWeight(counts[i] || 0) * (y >= fy ? 1 : Math.exp(-(fy - y + (F % 1)) / TAU));
			if (y > gy) w = 0;
			else if (y === gy) w *= Math.max(0.02, fracOfDay(growDay));
			out.push(w);
		}
		return out;
	}

	/*
	 * Radius map for every year, from the first year to the bark.
	 *
	 * `total` is the full record's weight, also while growing, so the growth front
	 * travels outward through rings that are already the right thickness instead
	 * of rescaling the whole figure on every frame.
	 */
	function geometry(years, counts, F, growDay, rho) {
		var full = weights(years, counts, F, null);
		var w = growDay == null ? full : weights(years, counts, F, growDay);
		var total = 0;
		for (var i = 0; i < full.length; i++) total += full[i];
		var inner = [];
		var outer = [];
		var acc = 0;
		for (var j = 0; j < years.length; j++) {
			inner.push(R0 + ((R - R0) * acc) / total);
			acc += w[j];
			outer.push(R0 + ((R - R0) * acc) / total);
		}
		/* The run of years too thin to hold a mark folds into one core disc. */
		var coreEnd = null;
		var fy = Math.floor(F);
		if (fy > years[0] + 1 && growDay == null) {
			for (var k = 0; k < years.length; k++) {
				if (years[k] >= fy || outer[k] - inner[k] > 2.2 * rho) break;
				coreEnd = years[k];
			}
			if (coreEnd !== null && coreEnd - years[0] < 1) coreEnd = null;
		}
		var rc = coreEnd === null ? 0 : outer[coreEnd - years[0]];
		return { inner: inner, outer: outer, coreEnd: coreEnd, rc: rc, bark: outer[outer.length - 1] };
	}

	function angle(frac, dir) {
		return -Math.PI / 2 + dir * 2 * Math.PI * frac;
	}
	function point(r, a) {
		return [C + r * Math.cos(a), C + r * Math.sin(a)];
	}
	function arc(r, a0, a1) {
		if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-6) {
			var p0 = point(r, a0);
			var p1 = point(r, a0 + Math.PI);
			return 'M' + f1(p0[0]) + ',' + f1(p0[1]) + 'A' + f1(r) + ',' + f1(r) + ' 0 1 1 ' + f1(p1[0]) + ',' + f1(p1[1]) + 'A' + f1(r) + ',' + f1(r) + ' 0 1 1 ' + f1(p0[0]) + ',' + f1(p0[1]);
		}
		var a = point(r, a0);
		var b = point(r, a1);
		return 'M' + f1(a[0]) + ',' + f1(a[1]) + 'A' + f1(r) + ',' + f1(r) + ' 0 ' + (Math.abs(a1 - a0) > Math.PI ? 1 : 0) + ' ' + (a1 > a0 ? 1 : 0) + ' ' + f1(b[0]) + ',' + f1(b[1]);
	}

	/*
	 * Inside a ring, radius only spreads marks apart: lanes fill from the ring's
	 * centre line outward, so a quiet year keeps its marks on that line.
	 */
	function layout(events, years, G, rho, dir) {
		var first = years[0];
		var gap = 2 * rho + 1.4;
		var groups = {};
		var i;
		for (i = 0; i < events.length; i++) {
			var y = yearOfDay(events[i].day);
			if (!groups[y]) groups[y] = [];
			groups[y].push(events[i]);
		}
		var pos = [];
		for (var key in groups) {
			if (!Object.prototype.hasOwnProperty.call(groups, key)) continue;
			var year = Number(key);
			var yi = year - first;
			if (yi < 0 || yi >= years.length) continue;
			var list = groups[key];
			list.sort(function (a, b) {
				return a.day - b.day;
			});
			var r0 = G.inner[yi];
			var T = G.outer[yi] - r0;
			var lanes = Math.max(1, Math.floor((T * 0.9) / gap));
			var mid = (lanes - 1) / 2;
			var order = [];
			var k;
			for (k = 0; k < lanes; k++) order.push(k);
			order.sort(function (a, b) {
				return Math.abs(a - mid) - Math.abs(b - mid);
			});
			var last = [];
			for (k = 0; k < lanes; k++) last.push(-Infinity);
			for (i = 0; i < list.length; i++) {
				var e = list[i];
				var f = fracOfDay(e.day);
				var best = order[0];
				var bestGap = -Infinity;
				for (k = 0; k < order.length; k++) {
					var lane = order[k];
					var g = (f - last[lane]) * 2 * Math.PI * (r0 + (T * (lane + 0.5)) / lanes);
					if (g > gap) {
						best = lane;
						break;
					}
					if (g > bestGap) {
						bestGap = g;
						best = lane;
					}
				}
				last[best] = f;
				pos[e.i] = {
					r: r0 + (T * (best + 0.5)) / lanes,
					a: angle(f, dir),
					y: year,
					cored: G.coreEnd !== null && year <= G.coreEnd
				};
			}
		}
		return pos;
	}

	var api = {
		C: C,
		R: R,
		R0: R0,
		TAU: TAU,
		DAY: DAY,
		f1: f1,
		yearOfDay: yearOfDay,
		startOfYear: startOfYear,
		fracOfDay: fracOfDay,
		baseWeight: baseWeight,
		weights: weights,
		geometry: geometry,
		layout: layout,
		angle: angle,
		point: point,
		arc: arc
	};
	if (typeof document === 'undefined') {
		globalThis.EventsRingsGeometry = api;
		return;
	}

	var NS = 'http://www.w3.org/2000/svg';
	var root = document.documentElement;
	var fig = document.getElementById('rings-figure');
	var svg = document.getElementById('rings');
	var words = document.getElementById('events-words');
	var ledger = document.getElementById('ledger');
	if (!fig || !svg || !words || !ledger) return;

	var BASIS = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	var RANK = { documented: 0, reported: 1, inferred: 2, unsubstantiated: 3 };
	var SHORT = {
		lb: 'events.rings.lookBack',
		sd: 'events.rings.side',
		gr: 'events.rings.grow',
		sp: 'events.rings.stop',
		td: 'events.rings.today',
		fr: 'events.rings.fresh',
		ls: 'events.rings.lensRange',
		ev: 'events.rings.everything',
		si: 'events.rings.since',
		ss: 'events.rings.sinceShort',
		ys: 'events.years',
		op: 'events.rings.openRecord',
		cl: 'events.rings.close',
		fm: 'events.framings',
		rp: 'events.rupture'
	};
	var reverse = {};
	for (var code in SHORT) if (Object.prototype.hasOwnProperty.call(SHORT, code)) reverse[SHORT[code]] = code;

	var lang = root.getAttribute('lang');
	if (lang !== 'fr' && lang !== 'ar') lang = 'en';
	var dir = root.getAttribute('dir') === 'rtl' ? -1 : 1;
	var reduced = matchMedia('(prefers-reduced-motion: reduce)');

	/* ---------------------------------------------------------------------
	   Words: three copies are in the page, this reads the reader's language.
	   --------------------------------------------------------------------- */

	function read(selector) {
		var el = words.querySelector(selector + ' b[data-l="' + lang + '"]');
		return el ? el.textContent : '';
	}
	function phrase(code) {
		return read('[data-k="' + code + '"]');
	}
	function value(key) {
		return read('[data-word="' + key + '"]');
	}
	function keyText(key) {
		var el = words.querySelector('[data-key="' + key + '"] b[data-l="' + lang + '"]');
		return el ? el.textContent : '';
	}
	var WORDS = {
		today: phrase('td'),
		fresh: phrase('fr'),
		years: keyText('events.years'),
		count: keyText('events.count'),
		countOne: keyText('events.countOne')
	};
	function fill(tpl, vals) {
		return String(tpl).replace(/\{(\w+)\}/g, function (whole, name) {
			return Object.prototype.hasOwnProperty.call(vals, name) ? String(vals[name]) : whole;
		});
	}
	function countWord(n) {
		return fill(WORDS[n === 1 ? 'countOne' : 'count'], { n: n });
	}
	function el(name, attrs, parent) {
		var n = document.createElementNS(NS, name);
		if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
		if (parent) parent.appendChild(n);
		return n;
	}
	function esc(text) {
		return String(text).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function px(v) {
		return f1(v);
	}

	/* ---------------------------------------------------------------------
	   The rows are the data
	   --------------------------------------------------------------------- */

	var cutoff = Number(svg.getAttribute('data-cutoff'));
	var y0 = Number(svg.getAttribute('data-y0'));
	var defaultF = Number(svg.getAttribute('data-default'));
	var transition = Number(svg.getAttribute('data-transition'));
	var y1 = yearOfDay(cutoff);
	var years = [];
	for (var yy = y0; yy <= y1; yy++) years.push(yy);

	var rows = [].slice.call(ledger.querySelectorAll('[data-event]'));
	var events = [];
	var byId = {};
	var rowById = {};
	var counts = [];
	for (var c = 0; c < years.length; c++) counts.push(0);
	var floor = (document.getElementById('f-basis') || {}).value || ledger.getAttribute('data-floor') || 'reported';
	var floorRank = RANK[floor] == null ? 1 : RANK[floor];
	var state = {
		focus: defaultF,
		grow: null,
		sel: null,
		hot: null,
		thread: null,
		localThread: null,
		urlThread: null,
		floor: floor,
		floorRank: floorRank,
		rho: 4,
		k: 1
	};

	for (var r = 0; r < rows.length; r++) {
		var row = rows[r];
		var year = Number(row.dataset.year);
		var day = startOfYear(year) + Number(row.dataset.t || 0);
		var gy = yearOfDay(day);
		var e = {
			i: r,
			id: row.dataset.event,
			row: row,
			day: day,
			year: gy,
			basis: row.dataset.basis,
			rup: row.classList.contains('ev-rupture'),
			fr: Number(row.dataset.fr || 0),
			above: (RANK[row.dataset.basis] == null ? 9 : RANK[row.dataset.basis]) <= floorRank
		};
		events.push(e);
		byId[e.id] = e;
		rowById[e.id] = row;
		if (gy >= y0 && gy <= y1) counts[gy - y0]++;
	}

	var entityEvents = {};
	for (var q = 0; q < events.length; q++) {
		var ids = (events[q].row.getAttribute('data-entities') || '').split(' ');
		events[q].entities = [];
		for (var z = 0; z < ids.length; z++) {
			if (!ids[z]) continue;
			events[q].entities.push(ids[z]);
			if (!entityEvents[ids[z]]) entityEvents[ids[z]] = [];
			entityEvents[ids[z]].push(events[q]);
		}
	}

	function visible(e) {
		return !e.row.hidden;
	}
	function atFloor(e) {
		return e.above;
	}
	function inLens(e, F) {
		return e.year >= Math.floor(F == null ? state.focus : F);
	}
	function live(e, pos) {
		var p = pos ? pos[e.i] : null;
		return atFloor(e) && visible(e) && !(p && p.cored);
	}
	function shares(a, b) {
		for (var i = 0; i < a.entities.length; i++) if (b.entities.indexOf(a.entities[i]) >= 0) return true;
		return false;
	}
	function threadList(id) {
		var out = [];
		var list = entityEvents[id] || [];
		for (var i = 0; i < list.length; i++) if (atFloor(list[i]) && visible(list[i]) && !(P && P[list[i].i] && P[list[i].i].cored)) out.push(list[i]);
		out.sort(function (a, b) {
			return a.day - b.day;
		});
		return out;
	}

	/* ---------------------------------------------------------------------
	   Nodes that exist once
	   --------------------------------------------------------------------- */

	var groups = {};
	['tints', 'lines', 'core', 'scars', 'links', 'marks', 'years', 'months', 'today'].forEach(function (name) {
		groups[name] = document.getElementById('rings-' + name);
	});
	var monthFmt = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' });
	var TODAY_DATE = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(cutoff * DAY));
	(function () {
		var months = groups.months.querySelectorAll('text tspan');
		for (var m = 0; m < 12; m++) months[m].textContent = monthFmt.format(new Date(Date.UTC(y1, m, 1)));
	})();
	var marksGroup = groups.marks;

	var ringPool = [];
	var tintPool = [];
	var barkGroup = document.createElementNS(NS, 'g');
	groups.lines.parentNode.insertBefore(barkGroup, groups.lines.nextSibling);
	while (groups.lines.firstChild) groups.lines.removeChild(groups.lines.firstChild);
	while (groups.tints.firstChild) groups.tints.removeChild(groups.tints.firstChild);
	var markById = {};
	var scarById = {};
	var linkNodes = {};
	var threadNode = null;

	function adoptMark(a) {
		var href = a.getAttribute('href') || '';
		if (href.indexOf('/e/') !== 0) return;
		var id = decodeURIComponent(href.slice(3));
		var e = byId[id];
		if (!e) {
			a.parentNode.removeChild(a);
			return;
		}
		markById[id] = { a: a, m: a.querySelector('.m'), rr: a.querySelector('.rr'), fr: a.querySelector('.fr'), e: e };
		var node = markById[id];
		if (e.fr > 1 && !node.fr) node.fr = el('circle', { class: 'fr' }, a);
		if (e.rup && !node.rr) node.rr = el('circle', { class: 'rr' }, a);
		node.m.setAttribute('cx', 0);
		node.m.setAttribute('cy', 0);
		if (node.fr) {
			node.fr.setAttribute('cx', 0);
			node.fr.setAttribute('cy', 0);
		}
		if (node.rr) {
			node.rr.setAttribute('cx', 0);
			node.rr.setAttribute('cy', 0);
		}
	}
	[].slice.call(marksGroup.querySelectorAll('a')).forEach(adoptMark);

	function markFor(e) {
		if (markById[e.id]) return markById[e.id];
		var a = el('a', { class: 'rings-mark b-' + e.basis, href: '/e/' + encodeURIComponent(e.id), tabindex: '-1' });
		a.__ring = e;
		var fr = e.fr > 1 ? el('circle', { class: 'fr' }, a) : null;
		var rr = e.rup ? el('circle', { class: 'rr' }, a) : null;
		var m = el('circle', { class: 'm' }, a);
		marksGroup.appendChild(a);
		var node = { a: a, m: m, rr: rr, fr: fr, e: e };
		markById[e.id] = node;
		return node;
	}
	for (var mi = 0; mi < events.length; mi++) markFor(events[mi]);

	function scarFor(e) {
		if (scarById[e.id]) return scarById[e.id];
		var line = el('line', { class: 'rings-scar', stroke: 'url(#rings-scar-grad)' }, groups.scars);
		scarById[e.id] = line;
		return line;
	}
	for (var si = 0; si < events.length; si++) if (events[si].rup) scarFor(events[si]);

	/* ---------------------------------------------------------------------
	   Draw
	   --------------------------------------------------------------------- */

	var G = null;
	var P = null;

	function text(parent, cls, x, y, content, extra) {
		var t = el('text', Object.assign({ class: cls, x: px(x), y: px(y) }, extra || {}), parent);
		t.textContent = content;
		return t;
	}

	function renderBands(light) {
		var tints = groups.tints;
		var lines = groups.lines;
		var core = groups.core;
		var yearsGroup = groups.years;
		var today = groups.today;
		[core, yearsGroup, today].forEach(function (g) {
			while (g.firstChild) g.removeChild(g.firstChild);
		});
		var rc = G.rc;
		var i;
		/* era tint, by whole years, outside the core */
		for (i = 0; i < eraBands.length; i++) {
			var band = eraBands[i];
			var tint = tintPool[i];
			if (!tint) {
				tint = el('circle', { class: 'rings-tint', cx: C, cy: C, r: 0, 'stroke-width': 0, style: '--era: ' + band.color }, tints);
				tintPool[i] = tint;
			}
			var r0 = band.first < 0 ? 0 : Math.max(rc, G.inner[band.first]);
			var r1 = band.first < 0 ? 0 : G.outer[band.last];
			var show = band.first >= 0 && r1 - r0 >= 0.5;
			if (show !== tint.s) {
				tint.s = show;
				tint.setAttribute('display', show ? '' : 'none');
			}
			if (show) {
				tint.setAttribute('r', px((r0 + r1) / 2));
				tint.setAttribute('stroke-width', px(r1 - r0));
			}
		}
		/* ring boundaries */
		for (i = 1; i < years.length; i++) {
			var r = G.inner[i];
			var line = ringPool[i];
			if (!line) {
				var yv0 = years[i];
				line = el('circle', { class: 'rings-line' + (yv0 % 10 === 0 ? ' rings-dec' : '') + (eraStarts[yv0] ? ' rings-era' : ''), cx: C, cy: C, r: 0 }, lines);
				ringPool[i] = line;
			}
			var showLine = r > rc + 0.5 && r < G.bark - 0.1;
			if (showLine !== line.s) {
				line.s = showLine;
				line.setAttribute('display', showLine ? '' : 'none');
			}
			if (showLine) line.setAttribute('r', px(r));
		}
		/* the core */
		if (G.coreEnd !== null) {
			el('circle', { class: 'rings-core-disc', cx: C, cy: C, r: px(rc) }, core);
			var n = 0;
			for (i = 0; i < events.length; i++) if (events[i].year <= G.coreEnd && atFloor(events[i])) n++;
			text(core, 'rings-core-a', C, C - 8 * state.k, fill(WORDS.years, { start: years[0], end: G.coreEnd }));
			text(core, 'rings-core-b', C, C + 8 * state.k, countWord(n));
		}
		/* bark: solid up to today, dashed after; the growth front while growing */
		if (state.grow != null) {
			while (barkGroup.firstChild) barkGroup.removeChild(barkGroup.firstChild);
			var gyi = Math.min(y1, yearOfDay(state.grow)) - y0;
			el('circle', { class: 'rings-bark', cx: C, cy: C, r: px(G.outer[gyi]) }, barkGroup);
		} else {
			while (barkGroup.firstChild) barkGroup.removeChild(barkGroup.firstChild);
			var nowAngle = angle(fracOfDay(cutoff), dir);
			var a0 = dir > 0 ? -Math.PI / 2 : nowAngle;
			var a1 = dir > 0 ? nowAngle : -Math.PI / 2;
			el('path', { class: 'rings-bark', d: arc(R, a0, a1) }, barkGroup);
			el('path', { class: 'rings-bark rings-open', d: dir > 0 ? arc(R, nowAngle, 1.5 * Math.PI) : arc(R, -2.5 * Math.PI, nowAngle) }, barkGroup);
		}
		/* today, and what the last thirty days added to the bark */
		if (!light && state.grow == null) {
			var na = angle(fracOfDay(cutoff), dir);
			var p0 = point(G.inner[y1 - y0], na);
			var p1 = point(R + 30, na);
			el('line', { class: 'rings-now-line', x1: px(p0[0]), y1: px(p0[1]), x2: px(p1[0]), y2: px(p1[1]), 'stroke-dasharray': '2 3' }, today);
			var pos = point(R + 38, na);
			var extra = lang === 'ar' ? { lang: 'ar', dir: 'rtl' } : {};
			var tEl = el('text', Object.assign({ class: 'rings-today-text', x: px(pos[0]), y: px(pos[1] - 10 * state.k), 'text-anchor': Math.cos(na) < 0 ? 'end' : 'start' }, extra), today);
			var s1 = el('tspan', { x: px(pos[0]) }, tEl);
			s1.textContent = WORDS.today;
			var s2 = el('tspan', { class: 'rings-sub', x: px(pos[0]), dy: '1.25em' }, tEl);
			s2.textContent = TODAY_DATE;
			var s3 = el('tspan', { class: 'rings-sub', x: px(pos[0]), dy: '1.25em' }, tEl);
			s3.setAttribute('data-fresh', '1');
			s3.textContent = fill(WORDS.fresh, { n: state.fresh, days: 30 });
		}
		/* year labels up the January line, where a ring has room */
		if (light) return;
		var lastY = Infinity;
		for (i = years.length - 1; i >= 0; i--) {
			var yv = years[i];
			var rA = G.inner[i];
			var rB = G.outer[i];
			var midR = (rA + rB) / 2;
			var room = rB - rA;
			if (rA < rc || room < 2.5 || (rc && midR < rc + 16 * state.k)) continue;
			var want = yv === y1 || yv % 10 === 0 || eraStarts[yv] || room > 20;
			if (!want || lastY - midR < 15 * state.k) continue;
			lastY = midR;
			var ty = C - midR;
			text(yearsGroup, 'rings-year' + (yv === y1 || room > 40 ? ' rings-big' : ''), C + dir * 6, ty, String(yv), { 'data-y': yv, 'text-anchor': dir > 0 ? 'start' : 'end' });
		}
	}

	var eras = [];
	var eraStarts = {};
	(function initEras() {
		var raw = svg.getAttribute('data-eras') || '';
		var parts = raw.split(';');
		for (var i = 0; i < parts.length; i++) {
			var bits = parts[i].split(',');
			if (bits.length < 3) continue;
			var start = Number(bits[0]);
			var end = Number(bits[1]);
			eras.push({ start: start, end: end, color: bits[2] });
			eraStarts[yearOfDay(start)] = true;
		}
		eras.sort(function (a, b) {
			return a.start - b.start;
		});
	})();
	var eraBands = eras.map(function (era) {
		var first = -1;
		var last = -1;
		for (var i = 0; i < years.length; i++) {
			var mid = Date.UTC(years[i], 6, 1) / DAY;
			if (mid >= era.start && mid < era.end) {
				if (first < 0) first = i;
				last = i;
			}
		}
		return { first: first, last: last, color: era.color };
	});

	function updateRadii() {
		for (var id in markById) {
			var node = markById[id];
			var rad = state.rho * (node.e.rup ? 1.15 : 1);
			node.m.setAttribute('r', px(rad));
			if (node.fr) node.fr.setAttribute('r', px(rad + 2.6 + (node.rr ? 2.4 : 0)));
			if (node.rr) node.rr.setAttribute('r', px(rad + 2.6));
		}
	}

	function updateMarks() {
		var lit = null;
		if (state.thread) {
			lit = {};
			var list = threadList(state.thread);
			for (var i = 0; i < list.length; i++) lit[list[i].id] = true;
			if (list.length > 1) {
				if (!threadNode) threadNode = el('path', { class: 'rings-thread' }, groups.links);
				threadNode.setAttribute('d', smooth(list.map(function (e) { return point(P[e.i].r, P[e.i].a); })));
			}
		}
		if (!state.thread && threadNode) {
			groups.links.removeChild(threadNode);
			threadNode = null;
		}
		var sel = state.sel ? byId[state.sel] : null;
		var related = null;
		if (sel && !state.thread && P[sel.i]) {
			related = {};
			var rel = state.rel || [];
			for (var j = 0; j < rel.length; j++) {
				var o = byId[rel[j]];
				if (o && live(o, P)) related[o.id] = true;
			}
			lit = related;
			lit[sel.id] = true;
		}
		var growing = state.grow != null;
		for (var id in markById) {
			var node = markById[id];
			var e = node.e;
			var p = P[e.i];
			if (!p) {
				node.a.setAttribute('display', 'none');
				continue;
			}
			node.a.removeAttribute('display');
			var hidden = !atFloor(e) || p.cored || (growing && e.day > state.grow);
			if (!hidden) {
				var at = point(p.r, p.a);
				node.a.setAttribute('transform', 'translate(' + px(at[0]) + ' ' + px(at[1]) + ')');
			}
			var sig = (atFloor(e) ? 1 : 0) + (p.cored ? 2 : 0) + (growing && e.day > state.grow ? 4 : 0) + (atFloor(e) && !visible(e) ? 8 : 0) + (lit && !lit[e.id] ? 16 : 0) + (e.id === state.hot || e.id === state.sel ? 32 : 0);
			if (node.sig !== sig) {
				node.sig = sig;
				node.a.classList.toggle('rings-below', !atFloor(e));
				node.a.classList.toggle('rings-cored', !!p.cored);
				node.a.classList.toggle('rings-future', growing && e.day > state.grow);
				node.a.classList.toggle('rings-dim', atFloor(e) && !visible(e));
				node.a.classList.toggle('rings-faded', !!lit && !lit[e.id]);
				node.a.classList.toggle('rings-hot', e.id === state.hot || e.id === state.sel);
			}
		}
		/* chords from the selected mark to every event it shares a person or
		   institution with, pulled toward the centre */
		var links = groups.links;
		for (var lid in linkNodes) {
			if (!related || !related[lid]) {
				links.removeChild(linkNodes[lid]);
				delete linkNodes[lid];
			}
		}
		if (related && sel) {
			var s = point(P[sel.i].r, P[sel.i].a);
			for (var rid in related) {
				var o = byId[rid];
				var op = P[o.i];
				if (!op) continue;
				var q = point(op.r, op.a);
				var mx = (s[0] + q[0]) / 2;
				var my = (s[1] + q[1]) / 2;
				var d = 'M' + px(s[0]) + ',' + px(s[1]) + 'Q' + px(mx + (C - mx) * 0.5) + ',' + px(my + (C - my) * 0.5) + ' ' + px(q[0]) + ',' + px(q[1]);
				if (!linkNodes[rid]) linkNodes[rid] = el('path', { class: 'rings-chord' }, links);
				linkNodes[rid].setAttribute('d', d);
			}
		}
	}

	function updateScars() {
		for (var i = 0; i < events.length; i++) {
			var e = events[i];
			if (!e.rup) continue;
			var line = scarById[e.id];
			var p = P[e.i];
			if (!line || !p) continue;
			var rad = state.rho * 1.15;
			var from = p.cored ? G.rc : p.r + rad + 2.6;
			var to = Math.min(state.grow != null ? G.outer[Math.min(y1, yearOfDay(state.grow)) - y0] : R, from + (p.cored ? 70 : 150));
			var a = point(from, p.a);
			var b = point(to, p.a);
			line.setAttribute('x1', px(a[0]));
			line.setAttribute('y1', px(a[1]));
			line.setAttribute('x2', px(b[0]));
			line.setAttribute('y2', px(b[1]));
			line.style.opacity = atFloor(e) && visible(e) && !(state.grow != null && e.day > state.grow) && to > from ? '' : '0';
		}
	}

	function draw(light) {
		G = geometry(years, counts, state.focus, state.grow, state.rho);
		P = layout(events, years, G, state.rho, dir);
		renderBands(light);
		updateMarks();
		updateScars();
		syncStrip();
	}

	var smooth = function (pts) {
		if (!pts.length) return '';
		if (pts.length === 1) return 'M' + px(pts[0][0]) + ',' + px(pts[0][1]);
		var d = 'M' + px(pts[0][0]) + ',' + px(pts[0][1]);
		for (var i = 0; i < pts.length - 1; i++) {
			var p0 = pts[i - 1] || pts[i];
			var p1 = pts[i];
			var p2 = pts[i + 1];
			var p3 = pts[i + 2] || p2;
			d += 'C' + px(p1[0] + (p2[0] - p0[0]) / 9) + ',' + px(p1[1] + (p2[1] - p0[1]) / 9) + ' ' + px(p2[0] - (p3[0] - p1[0]) / 9) + ',' + px(p2[1] - (p3[1] - p1[1]) / 9) + ' ' + px(p2[0]) + ',' + px(p2[1]);
		}
		return d;
	};

	/* ---------------------------------------------------------------------
	   Reading rows back
	   --------------------------------------------------------------------- */

	function langCopy(node) {
		if (!node) return '';
		var b = node.querySelector('b[data-l="' + lang + '"]');
		return (b || node).textContent.trim();
	}
	/* ---------------------------------------------------------------------
	   The lens: presets, playback, the core sample under the slider
	   --------------------------------------------------------------------- */

	var lens = document.getElementById('rings-lens');
	var strip = document.getElementById('rings-strip');
	var stripIn = document.getElementById('rings-strip-in');
	var slider = null;
	var presets = [];
	var play = null;
	var plate = fig.querySelector('.rings-plate');
	var lensout = document.getElementById('rings-lensout');
	if (!lensout) {
		lensout = document.createElement('p');
		lensout.className = 'rings-lensout';
		lensout.id = 'rings-lensout';
		lensout.setAttribute('aria-live', 'polite');
		plate.insertBefore(lensout, svg);
	}
	var readout = document.getElementById('rings-readout');
	if (!readout) {
		readout = document.createElement('div');
		readout.className = 'rings-readout';
		readout.id = 'rings-readout';
		readout.hidden = true;
		plate.insertBefore(readout, svg);
	}
	var readoutYear = document.getElementById('rings-readout-year');
	if (!readoutYear) {
		readoutYear = document.createElement('span');
		readoutYear.className = 'rings-readout-year';
		readoutYear.id = 'rings-readout-year';
		readout.appendChild(readoutYear);
	}
	var readoutCount = document.getElementById('rings-readout-count');
	if (!readoutCount) {
		readoutCount = document.createElement('span');
		readoutCount.className = 'rings-readout-count';
		readoutCount.id = 'rings-readout-count';
		readout.appendChild(readoutCount);
	}

	function presetLabel(kind, year, short) {
		if (kind === 'all') return short ? String(y0) : phrase('ev');
		if (kind === 'year') return String(year);
		return fill(phrase(short ? 'ss' : 'si'), { year: year });
	}
	function buildLens() {
		if (!lens) return;
		lens.removeAttribute('hidden');
		lens.className = 'rings-lens';
		var row = document.createElement('div');
		row.className = 'rings-lens-row';
		var title = document.createElement('span');
		title.className = 'rings-lens-label';
		title.textContent = phrase('lb');
		row.appendChild(title);
		var seg = document.createElement('div');
		seg.className = 'rings-seg';
		var defs = [
			['all', null],
			['since', transition],
			['since', defaultF],
			['year', y1]
		];
		for (var i = 0; i < defs.length; i++) {
			var b = document.createElement('button');
			b.type = 'button';
			b.setAttribute('data-f', defs[i][0] === 'all' ? y0 : defs[i][1]);
			var long = document.createElement('span');
			long.className = 'rings-long';
			long.textContent = presetLabel(defs[i][0], defs[i][1], false);
			var short = document.createElement('span');
			short.className = 'rings-short';
			short.textContent = presetLabel(defs[i][0], defs[i][1], true);
			b.appendChild(long);
			b.appendChild(short);
			b.addEventListener('click', function () {
				stopGrow();
				setFocus(Number(this.getAttribute('data-f')));
			});
			seg.appendChild(b);
			presets.push(b);
		}
		row.appendChild(seg);
		play = document.createElement('button');
		play.type = 'button';
		play.className = 'rings-play';
		play.setAttribute('aria-pressed', 'false');
		play.textContent = phrase('gr');
		play.addEventListener('click', toggleGrow);
		row.appendChild(play);
		lens.appendChild(row);
		slider = document.createElement('input');
		slider.type = 'range';
		slider.className = 'rings-slider';
		slider.min = y0;
		slider.max = y1 + 0.95;
		slider.step = '0.05';
		slider.setAttribute('aria-label', phrase('lb'));
		slider.addEventListener('input', function () {
			stopGrow();
			setFocus(Number(this.value), false);
		});
		strip.appendChild(slider);
	}
	buildLens();

	var axis = document.getElementById('rings-axis');
	if (axis) {
		var marks = [y0];
		for (var ay = y0; ay <= y1; ay++) if (ay % 10 === 0 && ay - y0 > 7 && y1 - ay > 7) marks.push(ay);
		marks.push(y1);
		for (var ai = 0; ai < marks.length; ai++) {
			var span = document.createElement('span');
			span.textContent = String(marks[ai]);
			span.style.insetInlineStart = (((marks[ai] - y0 + 0.5) / years.length) * 100).toFixed(1) + '%';
			axis.appendChild(span);
		}
	}

	function syncStrip() {
		if (stripIn) {
			var pct;
			if (state.grow != null) {
				pct = ((Math.min(y1, yearOfDay(state.grow)) - y0 + 1) / years.length) * 100;
				stripIn.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
			} else {
				pct = ((Math.floor(state.focus) - y0) / years.length) * 100;
				stripIn.style.clipPath = 'inset(0 0 0 ' + Math.max(0, Math.min(100, pct)) + '%)';
			}
		}
		if (slider && document.activeElement !== slider) slider.value = state.focus;
	}

	function syncLens() {
		for (var i = 0; i < presets.length; i++) {
			var f = Number(presets[i].getAttribute('data-f'));
			presets[i].setAttribute('aria-pressed', String(Math.abs(f - state.focus) < 0.01));
		}
		var F = Math.floor(state.focus);
		var shown = 0;
		for (var j = 0; j < events.length; j++) if (events[j].year >= F && atFloor(events[j])) shown++;
		if (state.grow != null) {
			if (lensout) lensout.textContent = '';
			return;
		}
		if (lensout) lensout.textContent = fill(phrase('ls'), { from: F, n: shown });
	}

	var anim = null;
	function setFocus(F, smoothMove) {
		F = Math.max(y0, Math.min(y1 + 0.95, F));
		cancelAnimationFrame(anim);
		var from = state.focus;
		var duration = smoothMove === false || reduced.matches ? 0 : 560;
		var t0 = performance.now();
		function step(now) {
			var k = duration ? Math.min(1, (now - t0) / duration) : 1;
			state.focus = from + (F - from) * (1 - Math.pow(1 - k, 3));
			draw();
			if (k < 1) anim = requestAnimationFrame(step);
			else {
				draw(true);
				setTimeout(function () {
					state.focus = F;
					draw();
					syncLens();
					writeUrl();
					feedSoon();
				}, 0);
			}
		}
		anim = requestAnimationFrame(step);
	}

	/* ---------------------------------------------------------------------
	   Watch it grow
	   --------------------------------------------------------------------- */

	var playing = null;
	var sortedDays = events.map(function (e) { return e.day; }).sort(function (a, b) { return a - b; });
	var totalEvents = events.length;
	var SAMPLES = [];
	(function () {
		var t0 = startOfYear(y0);
		var t1 = cutoff;
		for (var i = 0; i <= 400; i++) {
			var t = t0 + ((t1 - t0) * i) / 400;
			var n = 0;
			while (n < sortedDays.length && sortedDays[n] <= t) n++;
			SAMPLES.push([t, 0.4 * (i / 400) + 0.6 * (n / Math.max(1, totalEvents))]);
		}
	})();
	function timeAt(p) {
		for (var i = 0; i < SAMPLES.length; i++) if (SAMPLES[i][1] >= p) return SAMPLES[i][0];
		return cutoff;
	}
	function stopGrow() {
		if (!playing) return;
		cancelAnimationFrame(playing.raf);
		clearTimeout(playing.timer);
		playing = null;
		state.grow = null;
		if (readout) readout.hidden = true;
		if (play) {
			play.setAttribute('aria-pressed', 'false');
			play.textContent = phrase('gr');
		}
		draw();
		syncLens();
		feedSoon();
	}
	function showGrow(day) {
		state.grow = day;
		draw(true);
		if (readoutYear) readoutYear.textContent = String(yearOfDay(day));
		var n = 0;
		while (n < sortedDays.length && sortedDays[n] <= day) n++;
		if (readoutCount) readoutCount.textContent = countWord(n);
	}
	function toggleGrow() {
		if (playing) {
			stopGrow();
			return;
		}
		cancelAnimationFrame(anim);
		select(null);
		state.focus = y0;
		syncLens();
		if (lensout) lensout.textContent = '';
		if (readout) readout.hidden = false;
		if (play) {
			play.setAttribute('aria-pressed', 'true');
			play.textContent = phrase('sp');
		}
		playing = {};
		if (reduced.matches) {
			showGrow(cutoff);
			playing.timer = setTimeout(stopGrow, 1600);
			return;
		}
		var t0 = performance.now();
		function step(now) {
			if (!playing) return;
			var p = Math.min(1, (now - t0) / 7000);
			showGrow(timeAt(p));
			if (p < 1) playing.raf = requestAnimationFrame(step);
			else playing.timer = setTimeout(stopGrow, 1200);
		}
		playing.raf = requestAnimationFrame(step);
	}

	/* ---------------------------------------------------------------------
	   The card
	   --------------------------------------------------------------------- */

	var card = document.getElementById('rings-card');

	function relatedTo(e) {
		var out = [];
		for (var i = 0; i < events.length; i++) {
			var o = events[i];
			if (o !== e && shares(e, o) && atFloor(o) && visible(o) && !(P && P[o.i] && P[o.i].cored)) out.push(o);
		}
		return out;
	}

	function whoChips(e) {
		var html = '';
		for (var i = 0; i < e.entities.length; i++) {
			var id = e.entities[i];
			var n = 0;
			for (var j = 0; j < events.length; j++) if (events[j].entities.indexOf(id) >= 0 && atFloor(events[j]) && visible(events[j])) n++;
			var name = names[id] || id;
			html += '<button type="button" data-k="' + esc(id) + '">' + esc(name) + '<span class="rings-n">' + n + '</span></button>';
		}
		return html;
	}

	var names = {};
	try {
		names = JSON.parse(document.getElementById('events-names').textContent) || {};
	} catch (err) {}

	function select(id, fromKeys) {
		state.sel = id && byId[id] ? id : null;
		var e = state.sel ? byId[state.sel] : null;
		if (e && P && P[e.i] && P[e.i].cored) setFocus(Math.max(y0, e.year));
		if (!e) {
			state.rel = null;
			card.hidden = true;
			draw();
			writeUrl();
				return;
		}
		var rel = relatedTo(e);
		state.rel = rel.map(function (o) { return o.id; });
		var basis = value('basis:' + e.basis);
		var grade = e.row.dataset.grade;
		var meta = fill(keyText('rec.meta.line'), { basis: basis, grade: grade }) + ': ' + value('grade:' + grade);
		var ar = '';
		if (lang !== 'ar') {
			var arNode = e.row.querySelector('.ev-title b[data-l="ar"], .rupture-title b[data-l="ar"]');
			if (arNode) ar = '<p class="rings-ar" lang="ar" dir="rtl">' + esc(arNode.textContent) + '</p>';
		}
		var place = langCopy(e.row.querySelector('.evp'));
		var flags = [];
		var ver = e.row.querySelector('.ev-ver');
		if (ver) flags.push(langCopy(ver));
		if (e.fr > 1) flags.push(fill(phrase('fm'), { n: e.fr }));
		var html = '<button class="rings-close" type="button" aria-label="' + esc(phrase('cl')) + '">×</button>' +
			'<p class="rings-card-date">' + (e.rup ? '<span class="rings-flag">' + esc(phrase('rp')) + '</span> · ' : '') + esc(langCopy(e.row.querySelector('.ev-date, .rupture-date'))) + ' · ' + esc(value('cat:' + e.row.dataset.cat)) + (place ? ' · ' + esc(place) : '') + '</p>' +
			'<h3>' + esc(langCopy(e.row.querySelector('.ev-title, .rupture-title'))) + '</h3>' + ar +
			'<p class="rings-card-meta">' + esc(meta) + (flags.length ? ' · ' + flags.map(esc).join(' · ') : '') + '</p>' +
			(e.entities.length ? '<div class="rings-who">' + whoChips(e) + '</div>' : '') +
			'<a class="rings-go" href="/e/' + encodeURIComponent(e.id) + '">' + esc(phrase('op')) + '</a>' +
			'<a class="rings-go" href="/chronicle?id=' + encodeURIComponent(e.id) + '">' + esc((document.querySelector('footer a[href="/chronicle"] b[data-l="' + lang + '"]') || {}).textContent || '') + '</a>';
		card.innerHTML = html;
		card.hidden = false;
		card.querySelector('.rings-close').addEventListener('click', function () {
			select(null);
		});
		var chips = card.querySelectorAll('.rings-who button');
		for (var i = 0; i < chips.length; i++) {
			chips[i].addEventListener('click', function () {
				setThread(this.getAttribute('data-k'));
			});
		}
		draw();
		writeUrl();
		feedSoon();
	}


	function setThread(id) {
		state.localThread = id;
		state.thread = id;
		draw();
		feedSoon();
	}
	function clearThread() {
		state.localThread = null;
		state.thread = state.urlThread;
		draw();
		feedSoon();
	}

	/* ---------------------------------------------------------------------
	   The side list: the lens, newest first, cloned from the ledger rows
	   --------------------------------------------------------------------- */

	var feedList = document.getElementById('rings-feed');
	var feedTitle = document.getElementById('rings-feedtitle');
	var feedCount = document.getElementById('rings-feedcount');
	if (feedTitle) feedTitle.textContent = phrase('sd');
	var feedRaf = 0;
	var wide = matchMedia('(min-width: 62rem)');
	function feedSoon() {
		clearTimeout(feedRaf);
		feedRaf = setTimeout(feed, 0);
	}
	function feed() {
		if (!wide.matches) return;
		var F = Math.floor(state.focus);
		var frag = document.createDocumentFragment();
		var n = 0;
		for (var i = 0; i < events.length; i++) {
			var e = events[i];
			if (!inLens(e, F) || !visible(e) || !atFloor(e)) continue;
			if (state.thread && (entityEvents[state.thread] || []).indexOf(e) < 0) continue;
			var li = e.row.cloneNode(true);
			li.removeAttribute('hidden');
			li.removeAttribute('id');
			li.classList.toggle('rings-sel', e.id === state.sel);
			frag.appendChild(li);
			n++;
		}
		feedList.replaceChildren(frag);
		if (feedCount) feedCount.textContent = countWord(n);
	}

	/* ---------------------------------------------------------------------
	   Pointer and keyboard
	   --------------------------------------------------------------------- */

	function toSvg(ev) {
		var m = svg.getScreenCTM();
		if (!m) return [0, 0, 1];
		var p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
		return [p.x, p.y, 1 / m.a];
	}
	function nearest(ev) {
		var at = toSvg(ev);
		var x = at[0];
		var y = at[1];
		var best = null;
		var bd = 22 * at[2];
		for (var i = 0; i < events.length; i++) {
			var e = events[i];
			if (!live(e, P) || !P[e.i]) continue;
			var p = point(P[e.i].r, P[e.i].a);
			var d = Math.hypot(p[0] - x, p[1] - y);
			if (d < bd) {
				bd = d;
				best = e;
			}
		}
		return best;
	}
	svg.addEventListener('wheel', function (ev) {
		if (!(ev.ctrlKey || ev.metaKey)) return;
		ev.preventDefault();
		stopGrow();
		setFocus(state.focus - ev.deltaY * 0.02, false);
	}, { passive: false });
	svg.addEventListener('pointermove', function (ev) {
		if (ev.pointerType !== 'mouse' || playing) return;
		var e = nearest(ev);
		if (state.hot !== (e ? e.id : null)) {
			state.hot = e ? e.id : null;
			}
		svg.style.cursor = e ? 'pointer' : '';
	});
	svg.addEventListener('pointerleave', function () {
		state.hot = null;
	});
	svg.addEventListener('click', function (ev) {
		ev.preventDefault();
		stopGrow();
		var yr = ev.target.closest && ev.target.closest('.rings-year');
		if (yr) {
			setFocus(Number(yr.getAttribute('data-y')));
			return;
		}
		if (ev.target.closest && ev.target.closest('.rings-core')) {
			setFocus(y0);
			return;
		}
		var e = nearest(ev);
		select(e ? e.id : null);
	});

	function walk() {
		var F = Math.floor(state.focus);
		var list = [];
		for (var i = 0; i < events.length; i++) {
			var e = events[i];
			if (e.year >= F && atFloor(e) && visible(e) && (!state.thread || e.entities.indexOf(state.thread) >= 0)) list.push(e);
		}
		list.sort(function (a, b) { return a.day - b.day; });
		return list;
	}
	svg.addEventListener('keydown', function (ev) {
		var k = ev.key;
		if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
			ev.preventDefault();
			stopGrow();
			var list = walk();
			if (!list.length) return;
			var later = k === 'ArrowUp' || (dir > 0 ? k === 'ArrowRight' : k === 'ArrowLeft');
			var i = -1;
			for (var j = 0; j < list.length; j++) if (list[j].id === state.sel) i = j;
			i = i < 0 ? list.length - 1 : Math.max(0, Math.min(list.length - 1, i + (later ? 1 : -1)));
			select(list[i].id, true);
		} else if (k === 'Enter' && state.sel) {
			location.href = '/e/' + encodeURIComponent(state.sel);
		} else if (k === '+' || k === '=') {
			ev.preventDefault();
			stopGrow();
			setFocus(Math.floor(state.focus) + 1);
		} else if (k === '-' || k === '_') {
			ev.preventDefault();
			stopGrow();
			setFocus(Math.floor(state.focus) - 1);
		} else if (k === 'Escape') {
			if (state.localThread) clearThread();
			else select(null);
		}
	});

	/* ---------------------------------------------------------------------
	   One state: the URL, and the ledger's filter passes
	   --------------------------------------------------------------------- */

	function writeUrl() {
		var q = new URLSearchParams(location.search);
		if (Math.floor(state.focus) !== defaultF) q.set('since', String(Math.floor(state.focus)));
		else q.delete('since');
		if (state.sel) q.set('id', state.sel);
		else q.delete('id');
		var s = q.toString();
		try {
			history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
		} catch (err) {}
	}

	document.addEventListener('events:filtered', function (ev) {
		var d = ev.detail || {};
		state.floor = d.floor || state.floor;
		state.floorRank = RANK[state.floor] == null ? 1 : RANK[state.floor];
		for (var i = 0; i < events.length; i++) events[i].above = RANK[events[i].basis] <= state.floorRank;
		state.urlThread = d.actor || d.institution || null;
		state.thread = state.localThread || state.urlThread;
		updateFresh();
		draw();
		feedSoon();
	});

	function updateFresh() {
		var n = 0;
		for (var i = 0; i < events.length; i++) {
			var e = events[i];
			if (atFloor(e) && visible(e) && cutoff - e.day <= 30 && cutoff >= e.day) n++;
		}
		state.fresh = n;
	}

	/* ---------------------------------------------------------------------
	   Size: marks a thumb can hit; type that scales with the plate
	   --------------------------------------------------------------------- */

	var resizeFrame = 0;
	new ResizeObserver(function () {
		cancelAnimationFrame(resizeFrame);
		resizeFrame = requestAnimationFrame(function () {
			var m = svg.getScreenCTM();
			var s = (m && m.a) || 1;
			state.rho = Math.max(3.2, Math.min(9, 3.4 / s));
			state.k = Math.max(1, Math.min(2.6, 0.95 / s));
			svg.style.setProperty('--k', state.k);
			updateRadii();
			draw();
		});
	}).observe(svg);

	/* ---------------------------------------------------------------------
	   Start
	   --------------------------------------------------------------------- */

	updateFresh();
	var q0 = new URLSearchParams(location.search);
	if (q0.has('since')) {
		var since = parseInt(q0.get('since'), 10);
		if (since >= y0 && since <= y1) state.focus = since;
	}
	if (q0.has('actor') || q0.has('institution')) state.urlThread = q0.get('actor') || q0.get('institution');
	state.thread = state.localThread || state.urlThread;
	var m0 = svg.getScreenCTM();
	var s0 = (m0 && m0.a) || 1;
	state.rho = Math.max(3.2, Math.min(9, 3.4 / s0));
	state.k = Math.max(1, Math.min(2.6, 0.95 / s0));
	svg.style.setProperty('--k', state.k);
	updateRadii();
	draw();
	syncLens();
	feed();
	if (q0.has('id') && byId[q0.get('id')]) select(q0.get('id'));
})();
