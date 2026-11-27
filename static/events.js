/* The events ledger's filters.
 *
 * The page is complete without this file: every chapter, every row at the floor,
 * the contents and the silence lines are in the HTML. This script adds the one
 * thing a static file cannot do, filtering, and it keeps the state in the URL so
 * a filtered ledger can be shared or cited.
 *
 * It contains no words of its own. Every phrase is written into the page at
 * build time in three languages (the #events-words block) and read back here in
 * the reader's language, so a label can never drift from the dictionary.
 */
(function () {
	'use strict';

	var root = document.documentElement;
	root.setAttribute('data-js', '');

	var ledger = document.getElementById('ledger');
	var words = document.getElementById('events-words');
	if (!ledger || !words) return;

	var BASIS = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	var DEFAULT_BASIS = ledger.getAttribute('data-floor') || 'reported';
	var TOTAL = Number(ledger.getAttribute('data-total') || 0);
	var NARROW = ['era', 'period', 'cat', 'actor', 'institution', 'q', 'grade', 'ver', 'ruptures', 'contested'];

	function lang() {
		var l = root.getAttribute('lang');
		return l === 'fr' || l === 'ar' ? l : 'en';
	}

	function read(key, attr) {
		var el = words.querySelector('[' + attr + '="' + key + '"] b[data-l="' + lang() + '"]');
		return el ? el.textContent : '';
	}

	/* A phrase template, in the reader's language, with its placeholders. */
	function phrase(key) {
		return read(key, 'data-key');
	}

	/* A data word: a basis, an era, a category, a grade, a decade, a name. */
	function value(key) {
		return read(key, 'data-word');
	}

	function fill(tpl, vals) {
		return String(tpl).replace(/\{(\w+)\}/g, function (whole, name) {
			return Object.prototype.hasOwnProperty.call(vals, name) ? String(vals[name]) : whole;
		});
	}

	/* The same fold the build applies to data-q: case, accents, Arabic marks. */
	function fold(text) {
		return String(text)
			.normalize('NFKD')
			.replace(/[\u0300-\u036f\u0640\u064b-\u065f\u0670]/g, '')
			.toLowerCase();
	}

	function rank(basis) {
		var i = BASIS.indexOf(basis);
		return i < 0 ? 9 : i;
	}

	/* ---------------------------------------------------------------------
	   State: the URL is the state
	   --------------------------------------------------------------------- */

	var params = new URLSearchParams(location.search);
	var state = {
		basis: params.get('basis') || DEFAULT_BASIS,
		era: params.get('era') || '',
		period: params.get('period') || '',
		cat: params.get('cat') || '',
		grade: params.get('grade') || '',
		ver: params.get('ver') || '',
		q: (params.get('q') || '').trim(),
		qNorm: '',
		actor: params.get('actor') || '',
		institution: params.get('institution') || '',
		ruptures: params.get('ruptures') === '1' ? '1' : '',
		contested: params.get('contested') === '1' ? '1' : ''
	};
	if (BASIS.indexOf(state.basis) < 0) state.basis = DEFAULT_BASIS;
	state.qNorm = fold(state.q);

	var ORDER = ['era', 'period', 'ruptures', 'cat', 'actor', 'institution', 'q', 'grade', 'basis', 'ver', 'contested'];

	function query() {
		var out = [];
		for (var i = 0; i < ORDER.length; i++) {
			var key = ORDER[i];
			var v = state[key];
			if (key === 'basis') {
				if (v !== DEFAULT_BASIS) out.push('basis=' + encodeURIComponent(v));
				continue;
			}
			if (v) out.push(key + '=' + encodeURIComponent(v));
		}
		return out.length ? '?' + out.join('&') : '';
	}

	function writeUrl() {
		try {
			history.replaceState(null, '', location.pathname + query() + location.hash);
		} catch (e) {}
	}

	/* ---------------------------------------------------------------------
	   Matching
	   --------------------------------------------------------------------- */

	function listed(list, id) {
		return (' ' + list + ' ').indexOf(' ' + id + ' ') >= 0;
	}

	function pass(row, skip) {
		var d = row.dataset;
		if (skip !== 'basis' && rank(d.basis) > rank(state.basis)) return false;
		if (skip !== 'era' && state.era && d.era !== state.era) return false;
		if (skip !== 'period' && state.period && d.decade !== state.period) return false;
		if (skip !== 'cat' && state.cat && d.cat !== state.cat) return false;
		if (skip !== 'grade' && state.grade && d.grade !== state.grade) return false;
		if (skip !== 'ver' && state.ver && d.ver !== state.ver) return false;
		if (skip !== 'q' && state.qNorm && d.q.indexOf(state.qNorm) < 0) return false;
		if (skip !== 'actor' && state.actor && !listed(d.actors, state.actor)) return false;
		if (skip !== 'institution' && state.institution && !listed(d.institutions, state.institution)) return false;
		if (skip !== 'ruptures' && state.ruptures && d.rupture !== '1') return false;
		if (skip !== 'contested' && state.contested && d.contested !== '1') return false;
		return true;
	}

	function narrowing() {
		for (var i = 0; i < NARROW.length; i++) if (state[NARROW[i]]) return true;
		return false;
	}

	/* ---------------------------------------------------------------------
	   Controls
	   --------------------------------------------------------------------- */

	var basisSelect = document.getElementById('f-basis');
	var eraSelect = document.getElementById('f-era');
	var catSelect = document.getElementById('f-cat');
	var periodSelect = document.getElementById('f-period');
	var gradeSelect = document.getElementById('f-grade');
	var verSelect = document.getElementById('f-ver');
	var qInput = document.getElementById('f-q');
	var rupturesBox = document.getElementById('f-ruptures');
	var contestedBox = document.getElementById('f-contested');
	var resetButton = document.getElementById('f-reset');
	var metaLabel = document.getElementById('f-meta');
	var activeBox = document.getElementById('active');
	var activeCount = document.getElementById('af-count');
	var activeChips = document.getElementById('af-chips');
	var emptyBox = document.getElementById('empty');
	var emptyLine = document.getElementById('empty-line');
	var emptyLower = document.getElementById('empty-lower');
	var emptyNoLower = document.getElementById('empty-no-lower');
	var emptyChips = document.getElementById('empty-chips');
	var emptyReset = document.getElementById('empty-reset');
	var contents = document.getElementById('contents');

	function labelOptions() {
		var options = document.querySelectorAll('#filters option[data-key], #filters option[data-word]');
		for (var i = 0; i < options.length; i++) {
			var opt = options[i];
			var key = opt.getAttribute('data-key');
			var word = opt.getAttribute('data-word');
			if (key) opt.textContent = phrase(key);
			else if (word.indexOf('grade:') === 0) {
				opt.textContent = fill(phrase('events.grade'), { grade: word.slice(6), word: value(word) });
			} else if (word.indexOf('cat:') !== 0) {
				opt.textContent = value(word);
			}
		}
	}

	function categoryCounts() {
		var options = catSelect ? catSelect.querySelectorAll('option[data-word]') : [];
		var rows = ledger.querySelectorAll('[data-event]');
		for (var i = 0; i < options.length; i++) {
			var opt = options[i];
			var slug = opt.getAttribute('data-word').slice(4);
			var n = 0;
			for (var r = 0; r < rows.length; r++) {
				if (rows[r].dataset.cat === slug && pass(rows[r], 'cat')) n++;
			}
			opt.textContent = fill(phrase('events.catOption'), { word: value('cat:' + slug), n: n });
			opt.setAttribute('data-n', String(n));
		}
	}

	function syncControls() {
		if (basisSelect) basisSelect.value = state.basis;
		if (eraSelect) eraSelect.value = state.era;
		if (catSelect) catSelect.value = state.cat;
		if (periodSelect) periodSelect.value = state.period;
		if (gradeSelect) gradeSelect.value = state.grade;
		if (verSelect) verSelect.value = state.ver;
		if (qInput && qInput.value !== state.q) qInput.value = state.q;
		if (rupturesBox) rupturesBox.checked = state.ruptures === '1';
		if (contestedBox) contestedBox.checked = state.contested === '1';
	}

	/* ---------------------------------------------------------------------
	   Active filters, in words
	   --------------------------------------------------------------------- */

	var ACTIVE = [
		{ key: 'era', label: 'events.label.era', word: 'era:' },
		{ key: 'period', label: 'events.label.period', word: 'decade:' },
		{ key: 'cat', label: 'events.label.cat', word: 'cat:' },
		{ key: 'grade', label: 'events.label.grade', word: 'grade:' },
		{ key: 'ver', label: 'events.label.ver', word: 'ver:' },
		{ key: 'q', label: 'events.label.q', word: null },
		{ key: 'actor', label: 'events.label.actor', word: 'name:' },
		{ key: 'institution', label: 'events.label.institution', word: 'name:' },
		{ key: 'ruptures', label: 'events.label.ruptures', word: null },
		{ key: 'contested', label: 'events.label.contested', word: null },
		{ key: 'basis', label: 'events.label.basis', word: 'basis:' }
	];

	function activeEntries() {
		var out = [];
		for (var i = 0; i < ACTIVE.length; i++) {
			var entry = ACTIVE[i];
			var v = state[entry.key];
			if (entry.key === 'basis') {
				if (v === DEFAULT_BASIS) continue;
			} else if (!v) continue;
			var name = entry.word ? value(entry.word + v) : v;
			out.push({
				key: entry.key,
				name: name,
				label: fill(phrase(entry.label), { name: name })
			});
		}
		return out;
	}

	function chip(entry) {
		var button = document.createElement('button');
		button.type = 'button';
		button.className = 'af-chip';
		button.setAttribute('data-remove', entry.key);
		button.setAttribute('aria-label', fill(phrase('events.remove'), { name: entry.label }));
		button.textContent = entry.label + ' ×';
		return button;
	}

	function renderActive(entries, box, countBox) {
		if (countBox) countBox.textContent = fill(phrase('events.active.count'), { n: shown });
		if (!box) return;
		box.textContent = '';
		for (var i = 0; i < entries.length; i++) box.appendChild(chip(entries[i]));
		if (entries.length && box === activeChips) {
			var clear = document.createElement('button');
			clear.type = 'button';
			clear.className = 'af-chip';
			clear.setAttribute('data-remove', 'all');
			clear.textContent = phrase('events.active.clearAll');
			box.appendChild(clear);
		}
	}

	/* ---------------------------------------------------------------------
	   Apply
	   --------------------------------------------------------------------- */

	var shown = 0;
	var below = 0;
	var belowBasis = [];
	var weakestBelow = '';
	var quiet = false;

	function apply() {
		var sections = ledger.querySelectorAll('[data-chapter]');
		var basisBelow = { documented: 0, reported: 0, inferred: 0, unsubstantiated: 0 };
		shown = 0;
		below = 0;
		weakestBelow = '';

		for (var s = 0; s < sections.length; s++) {
			var section = sections[s];
			var rows = section.querySelectorAll('[data-event]');
			var years = {};
			var visible = 0;
			for (var r = 0; r < rows.length; r++) {
				var row = rows[r];
				var ok = pass(row);
				row.hidden = !ok;
				if (ok) {
					visible++;
					shown++;
					years[row.dataset.year] = true;
				} else if (pass(row, 'basis') && rank(row.dataset.basis) > rank(state.basis)) {
					below++;
					basisBelow[row.dataset.basis] = (basisBelow[row.dataset.basis] || 0) + 1;
					if (!weakestBelow || rank(row.dataset.basis) > rank(weakestBelow)) weakestBelow = row.dataset.basis;
				}
			}
			section.hidden = visible === 0;

			var ticks = section.querySelectorAll('[data-year-tick]');
			for (var t = 0; t < ticks.length; t++) ticks[t].hidden = !years[ticks[t].getAttribute('data-year-tick')];

			var counts = document.querySelectorAll('[data-count="' + section.getAttribute('data-chapter') + '"]');
			for (var c = 0; c < counts.length; c++) {
				counts[c].textContent = visible === 1 ? phrase('events.countOne') : fill(phrase('events.count'), { n: visible });
			}
			var toc = document.querySelector('[data-toc="' + section.getAttribute('data-chapter') + '"]');
			if (toc) toc.setAttribute('data-empty', visible === 0 ? '1' : '0');
		}

		var silences = ledger.querySelectorAll('.silence');
		for (var i = 0; i < silences.length; i++) silences[i].hidden = narrowing();

		var split = [];
		for (var b = 0; b < BASIS.length; b++) {
			if (basisBelow[BASIS[b]]) split.push(fill(phrase('events.belowBasis'), { n: basisBelow[BASIS[b]], basis: phrase('events.basisLower.' + BASIS[b]) }));
		}
		var standing = document.getElementById('standing-floor');
		if (standing) {
			standing.textContent = below
				? fill(phrase('events.standing.floor'), { shown: shown, basis: value('basis:' + state.basis), below: below, split: split.join(', ') })
				: fill(phrase('events.standing.floorNoBelow'), { shown: shown, basis: value('basis:' + state.basis) });
		}

		if (metaLabel) metaLabel.textContent = fill(phrase('events.filter.meta'), { basis: value('basis:' + state.basis), shown: shown, total: TOTAL });

		var entries = activeEntries();
		if (activeBox) activeBox.hidden = entries.length === 0;
		renderActive(entries, activeChips, activeCount);

		if (contents) contents.hidden = shown === 0;
		if (emptyBox) emptyBox.hidden = shown !== 0;
		if (shown === 0) {
			var names = [];
			for (var e = 0; e < entries.length; e++) names.push(entries[e].label);
			if (emptyLine) {
				emptyLine.textContent = names.length
					? fill(phrase('events.empty.line'), { filters: names.join(', '), basis: value('basis:' + state.basis) })
					: fill(phrase('events.empty.lineFloor'), { basis: value('basis:' + state.basis) });
			}
			renderActive(entries, emptyChips, null);
			if (emptyLower) {
				emptyLower.hidden = !below;
				emptyLower.textContent = below
					? fill(phrase(below === 1 ? 'events.empty.lowerOne' : 'events.empty.lower'), { n: below })
					: '';
				emptyLower.setAttribute('data-floor', weakestBelow);
			}
			if (emptyNoLower) {
				emptyNoLower.hidden = below > 0;
				emptyNoLower.textContent = below ? '' : phrase('events.empty.noLower');
			}
		}

		categoryCounts();
		syncControls();
	}

	function commit() {
		if (!quiet) writeUrl();
		apply();
	}

	function set(key, v) {
		state[key] = v;
		if (key === 'q') state.qNorm = fold(v);
		commit();
	}

	function reset() {
		var basis = state.basis;
		state.basis = DEFAULT_BASIS;
		state.era = '';
		state.period = '';
		state.cat = '';
		state.grade = '';
		state.ver = '';
		state.q = '';
		state.qNorm = '';
		state.actor = '';
		state.institution = '';
		state.ruptures = '';
		state.contested = '';
		void basis;
		commit();
	}

	/* ---------------------------------------------------------------------
	   Wiring
	   --------------------------------------------------------------------- */

	if (basisSelect) basisSelect.addEventListener('change', function () { set('basis', this.value); });
	if (eraSelect) eraSelect.addEventListener('change', function () { set('era', this.value); });
	if (catSelect) catSelect.addEventListener('change', function () { set('cat', this.value); });
	if (periodSelect) periodSelect.addEventListener('change', function () { set('period', this.value); });
	if (gradeSelect) gradeSelect.addEventListener('change', function () { set('grade', this.value); });
	if (verSelect) verSelect.addEventListener('change', function () { set('ver', this.value); });
	if (qInput) qInput.addEventListener('input', function () { set('q', this.value.trim()); });
	if (rupturesBox) rupturesBox.addEventListener('change', function () { set('ruptures', this.checked ? '1' : ''); });
	if (contestedBox) contestedBox.addEventListener('change', function () { set('contested', this.checked ? '1' : ''); });
	if (resetButton) resetButton.addEventListener('click', reset);
	if (emptyReset) emptyReset.addEventListener('click', reset);
	if (emptyLower) {
		emptyLower.addEventListener('click', function () {
			var target = this.getAttribute('data-floor');
			if (target && BASIS.indexOf(target) >= 0) set('basis', target);
		});
	}

	function removeKey(key) {
		if (key === 'all') {
			reset();
			return;
		}
		if (key === 'basis') set('basis', DEFAULT_BASIS);
		else set(key, '');
	}

	document.addEventListener('click', function (event) {
		var target = event.target;
		while (target && target !== document) {
			if (target.hasAttribute && target.hasAttribute('data-remove')) {
				removeKey(target.getAttribute('data-remove'));
				return;
			}
			target = target.parentNode;
		}
	});

	/* ---------------------------------------------------------------------
	   Start
	   --------------------------------------------------------------------- */

	labelOptions();
	quiet = true;
	apply();
	quiet = false;
	writeUrl();
})();
