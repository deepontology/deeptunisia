/**
 * UI-consistency assertions (spec §14).
 *
 * What this covers and what it does not: the browser tests (smoke) see rendered
 * pages; this suite pins, at the source level, the things that make a page render
 * wrong in a way no screenshot catches — the Network legend claiming a basis that
 * does not exist, two distinct bases sharing one visual encoding, or a basis
 * label missing from one of the three languages. Rendering the legend from the
 * model (BASIS_ORDER/DASH/BASIS_COLOR) makes drift structurally impossible; these
 * assertions make removing that guarantee a failure.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASIS_ORDER, BASIS_COLOR, BASIS_OPACITY, DASH, LAYERS, REL_KIND } from '../src/lib/model.ts';
import { translate } from '../src/lib/i18n.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const NETWORK = readFileSync(join(HERE, '..', 'src', 'lib', 'components', 'NetworkView.svelte'), 'utf8');
const LABELS_CSS = readFileSync(join(HERE, '..', 'src', 'lib', 'viz', 'labels.css'), 'utf8');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

console.log('\n  ── §14.1: the basis legend and its encodings ──\n');

ok(
	'basis order runs documented → unsubstantiated',
	JSON.stringify(BASIS_ORDER) === JSON.stringify(['documented', 'reported', 'inferred', 'unsubstantiated']),
	BASIS_ORDER.join(', ')
);
ok('every basis has a dash', BASIS_ORDER.every((b) => typeof DASH[b] === 'string'));
ok('the dashes are pairwise distinct', new Set(BASIS_ORDER.map((b) => DASH[b])).size === 4);
ok(
	'unsubstantiated reads as the weakest claim (longest dash)',
	(DASH.unsubstantiated.match(/\d+/g) ?? []).reduce((a, b) => a + Number(b), 0) >
		(DASH.inferred.match(/\d+/g) ?? []).reduce((a, b) => a + Number(b), 0)
);
ok(
	'every basis has a token colour and an opacity',
	BASIS_ORDER.every((b) => BASIS_COLOR[b]?.startsWith('var(--basis-') && typeof BASIS_OPACITY[b] === 'number')
);

// The legend is rendered from the model, not hand-typed beside it.
ok('the legend iterates the model order', NETWORK.includes('{#each BASIS_ORDER as b'));
ok('the legend labels come from the dictionary', NETWORK.includes("t('basis.' + b)"));
ok('the invented "Corroborated" label is gone', !NETWORK.includes('Corroborated'));
ok('the swapped "Reported only" label is gone', !NETWORK.includes('Reported only'));
ok('the reported+alleged colour collapse is gone', !NETWORK.includes('.edge.reported,') && !NETWORK.includes('.edge.alleged {'));
ok(
	'every basis name appears as a legend label key in the component',
	BASIS_ORDER.every((b) => NETWORK.includes(`basis.${b}`) || NETWORK.includes(`'basis.' + b`))
);

console.log('\n  ── §14.2: the basis labels exist and stay distinct in every locale ──\n');

for (const loc of ['en', 'fr', 'ar'] as const) {
	const labels = BASIS_ORDER.map((b) => translate(loc, `basis.${b}`));
	ok(`basis labels exist in ${loc}`, labels.every((l) => l && !l.startsWith('basis.')), labels.join(' / '));
	ok(`basis labels are distinct in ${loc}`, new Set(labels).size === 4, labels.join(' / '));
}

console.log('\n  ── §14.3: the rebuilt network view — gutter, rings, staged colour, dismissal ──\n');

// The gutter channel: cross-layer edges travel in the strips between lanes.
ok('the gutter channel exists as a layout constant', NETWORK.includes('const GUTTER_W ='));
ok('the gutter strips are drawn between lanes', NETWORK.includes('gutter-strip'));
ok('lanes absorb the gutter cost (world still sums to W)', NETWORK.includes('(W - GUTTER_W * (lanes.length - 1)) / lanes.length'));
ok('cross-layer edges route through a gutter', NETWORK.includes('kind: \'cross\'') && NETWORK.includes('gutterCenter(k, laneW)'));
ok('parallel cross-layer edges are spread deterministically', NETWORK.includes('gxOff'));
ok('the card anchors to the routed midpoint, not a stale helper', NETWORK.includes('routes.get(pinned.id)?.mid'));

// Attention rings: graduated distance-from-focus, never a colour change.
ok('the binary neighbours set is gone', !NETWORK.includes('const neighbours'));
ok('attention rings compute 1-hop and 2-hop', NETWORK.includes('const rings = $derived.by') && NETWORK.includes('const two = new Set<string>()'));
ok('node emphasis is a class ladder, not a colour', NETWORK.includes('nodeRingClass') && NETWORK.includes('r-two'));
ok('distance is encoded by opacity only', NETWORK.includes('.node.r-rest {') && !NETWORK.includes('.node.r-rest { stroke'));

// The one-ring label modifier (place.ts untouched — a modifier, not a tier).
ok('the one-ring label modifier exists in labels.css', LABELS_CSS.includes('.vlabel.hop-one'));
ok('the neighbour modifier is additive, not a new tier', LABELS_CSS.includes('tier machine in place.ts stays untouched'));

// Staged edge language: only focus-incident edges recolor to relationship type.
ok('edge colour is staged by focus scope', NETWORK.includes('function edgeColor'));
ok('the bridge keeps a source-layer hairline', NETWORK.includes('class="hairline"'));
ok('direction arrows are gated on focus + zoom', NETWORK.includes('cam.zoomProgress > 0.25') && NETWORK.includes('marker-end'));
ok('the focused legend section is declared', NETWORK.includes('network.legend.focused'));
ok('legend swatches render from the relationship constants', NETWORK.includes('LEGEND_REL_TYPES') && NETWORK.includes('REL_TYPE_COLOR[rt]'));
ok(
	'every legend swatch type is a real relationship kind',
	(['institutional', 'appointment', 'family', 'business', 'prosecution', 'reported-influence'] as const).every((t) => t in REL_KIND)
);

// Group headers are zoom-gated and crossfade in (the measured overview pile-up:
// 42 headers at the fit floor used to render; now they fade in over 10-30%).
ok('group headers are zoom-gated', NETWORK.includes('showGroupHeaders') && NETWORK.includes('smoothStep(cam.zoomProgress, 0.1, 0.3)'));
ok('the roster crossfades instead of popping at a threshold', NETWORK.includes('rosterFade') && NETWORK.includes('--rf'));
ok('group bands carry a zone hairline', NETWORK.includes('band-line'));

// The dismissal machine: click-away pops exactly one level of the stack.
ok('background click-away exists', NETWORK.includes('function onCanvasBgClick'));
ok(
	'click-away pops one level: card first, then selection (and compare)',
	NETWORK.includes('if (pinnedId) pinnedId = null;') && NETWORK.includes('else if (app.selected) {') && NETWORK.includes('compareId = null;')
);
ok('a click on a node/hit/card/lane is never a dismissal', NETWORK.includes("t.closest('.node, .hit, .vlane, .edgecard, .viewnav, .legend')"));
ok('long-press is the touch hover tier', NETWORK.includes('startPress') && NETWORK.includes('500'));
ok('a long-press suppresses the click that follows it', NETWORK.includes('if (pressed)'));

// ?mode= is addressable and written back into the URL.
ok('the mode lens is URL-addressable', NETWORK.includes("searchParams.get('mode')"));
ok('changing the mode rewrites the URL', NETWORK.includes('syncModeUrl'));
ok('the mode hides nothing silently', NETWORK.includes('relCandidates') && NETWORK.includes('relShown') && NETWORK.includes('network.withheld'));

// The accessible equivalent keeps pace: the focused ego-network is a table too.
ok('the focus table exists (the highlight, for screen readers)', NETWORK.includes('network.table.focus'));
ok('the table caption carries the mode', NETWORK.includes('network.table.caption'));

// v0.0.2 records are first-class UI: a card, a route, and a search that opens it.
const RECORD_PANEL = readFileSync(join(HERE, '..', 'src', 'lib', 'components', 'RecordPanel.svelte'), 'utf8');
const INSPECTOR = readFileSync(join(HERE, '..', 'src', 'lib', 'shell', 'Inspector.svelte'), 'utf8');
const SEARCH = readFileSync(join(HERE, '..', 'src', 'lib', 'components', 'SearchPalette.svelte'), 'utf8');
const MODEL = readFileSync(join(HERE, '..', 'src', 'lib', 'model.ts'), 'utf8');
ok('the record card exists and carries basis chips', RECORD_PANEL.includes('basisLabel') && RECORD_PANEL.includes('CommunityActions'));
ok('every record kind has a lookup map', ['companyById', 'contractById', 'licenceById', 'declarationById', 'educationById', 'eventById'].every((m) => MODEL.includes(m)));
ok('the Inspector routes records away from the entity panel', INSPECTOR.includes('RecordPanel') && INSPECTOR.includes('personById.has(panelSel)'));
ok('search opens record cards instead of redirecting to a party', SEARCH.includes("app.selected = r.id") && !SEARCH.includes('no card yet'));
ok('the record card renders entity references as buttons', RECORD_PANEL.includes('class="ref"'));

// Polishing pass: the inspector keeps the card mounted through its exit and the
// docked panel animates width, so the chart gives way smoothly rather than
// snapping; long record values wrap instead of running out of the panel.
ok(
	'the inspector renders the last selection through its close transition',
	INSPECTOR.includes('let panelId') && INSPECTOR.includes('class:closing') && INSPECTOR.includes('panelSel') && INSPECTOR.includes('untrack')
);
ok(
	'the docked inspector animates width, with an exit transition',
	INSPECTOR.includes('dock-in-width') &&
		/\.inspector\.closing\s*\{[^}]*width:\s*0/.test(INSPECTOR) &&
		/\.inspector\s+\.inner\s*\{[^}]*width:\s*var\(--inspector-w\)/.test(INSPECTOR)
);
ok(
	'record rows let long values wrap instead of overflowing the panel',
	/\.kv b,\s*\.kv \.refs\s*\{[^}]*min-width:\s*0/.test(RECORD_PANEL) &&
		/\.ref\s*\{[^}]*max-width:\s*100%/.test(RECORD_PANEL)
);

// Hierarchy + navigation overlays + smoothing.
const GROUPS_TS = readFileSync(join(HERE, '..', 'src', 'lib', 'viz', 'groups.ts'), 'utf8');
ok('lane subsections are ordered by the authored groupOrder, never alphabetical', GROUPS_TS.includes('ds.meta.groupOrder') && !GROUPS_TS.includes('localeCompare'));
ok('the minimap exists with a live viewport rect', NETWORK.includes('miniView') && NETWORK.includes('class="minimap"'));
ok('clear-focus is an explicit dismissal', NETWORK.includes('clear-focus') && NETWORK.includes("t('network.clear')"));
ok('gutter traffic labels carry counts', NETWORK.includes('gutterTraffic') && NETWORK.includes('network.gutter.short'));
ok('wheel zoom is smoothed, with direct fallback', (() => {
	const G = readFileSync(join(HERE, '..', 'src', 'lib', 'viz', 'gestures.ts'), 'utf8');
	const C = readFileSync(join(HERE, '..', 'src', 'lib', 'viz', 'camera.svelte.ts'), 'utf8');
	return G.includes('zoomSmoothTo') && G.includes('else cam.zoomAt') && C.includes('zoomSmoothTo(');
})());

console.log('\n  ── §14.4: the chronicle events timeline (docs/plans/chronicle-events-timeline-v2.md) ──\n');

// Geometry over the graph, not decoration: the lane iterates ds.events and the
// marks read the basis language. v2 reworked the interaction model, so these
// assertions pin the two tracks, the cluster overview and the single picker.
const CHRONICLE = readFileSync(join(HERE, '..', 'src', 'lib', 'components', 'Chronicle.svelte'), 'utf8');
// The lane's own markup, so the no-raw-colour assertion cannot trip on the
// tenure rows below it (era accents, layer colours) or the tooltip above.
const LANE = CHRONICLE.slice(
	CHRONICLE.indexOf('<!-- Events lane'),
	CHRONICLE.indexOf('<!-- Rows -->')
);
ok('the lane block exists as one contiguous group', LANE.length > 1000, `${LANE.length} chars`);
ok('the lane band is tall enough to read as a layer', CHRONICLE.includes('const LANE_H = 72'));
ok(
	'the lane iterates the dataset, nothing hardcoded',
	CHRONICLE.includes('[...ds.events]') && CHRONICLE.includes('{#each laneItems as it')
);
ok('existing rupture lines/dots are untouched', CHRONICLE.includes('class="rupture-line"') && CHRONICLE.includes('class="rupture-dot"'));
ok('lane marks read BASIS_OPACITY, not a hand-picked alpha', LANE.includes('BASIS_OPACITY'));

// v2 #1: shape is decided by RENDERED width, not by "has an end" — every event
// has an end in this dataset, so the old test made every mark a pill.
ok(
	'shape follows rendered width, not the presence of an end',
	CHRONICLE.includes('const DOT_PX =') && CHRONICLE.includes('w >= DOT_PX') && !CHRONICLE.includes('isSpanEvent')
);
// v2 #2: clusters. Dense anchors collapse; ruptures and long spans are exempt.
ok(
	'dense anchors collapse into counted clusters',
	CHRONICLE.includes('const CLUSTER_PX =') &&
		CHRONICLE.includes("kind: 'cluster'") &&
		CHRONICLE.includes('laneItems') &&
		CHRONICLE.includes('ev-cluster-count')
);
ok(
	'ruptures and long spans are outside the clustering rule',
	CHRONICLE.includes('if (e.rupture)') && CHRONICLE.includes('if (isLongSpan(e))')
);
// v2 #4: long spans get their own track, classified by intrinsic duration.
ok(
	'long spans sit on their own track by intrinsic duration',
	CHRONICLE.includes('function intrinsicYears') &&
		CHRONICLE.includes('function isLongSpan') &&
		CHRONICLE.includes('SPAN_MID') &&
		LANE.includes('ev-spanbar')
);
// v2: one owner for pointer picking. Marks cannot intercept a click.
ok(
	'marks cannot intercept pointer picking',
	/\.ev-mark\s*\{[^}]*pointer-events:\s*none/.test(CHRONICLE) &&
		CHRONICLE.includes('function lanePick') &&
		LANE.includes('onclick={onLaneClick}')
);
ok(
	'cluster opens a list and offers zoom-to-drill',
	CHRONICLE.includes('function openCluster') &&
		CHRONICLE.includes('function zoomToCluster') &&
		CHRONICLE.includes('ev-pop') &&
		CHRONICLE.includes('Zoom in')
);
ok('the lane respects the evidence dial via the shared predicate', CHRONICLE.includes('meetsBasis(e.basis') && CHRONICLE.includes('eventPasses('));
ok(
	'no raw colour literals in the lane code (semantic tokens only)',
	!/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(LANE) && !/rgba?\(/.test(LANE),
	'category never gets a hue'
);
ok(
	'tier predicate plus fits() gating present on labels',
	CHRONICLE.includes('function eventTiered') && CHRONICLE.includes('laneLabels') && CHRONICLE.includes('eventTiered(e)') && CHRONICLE.includes('fits(title')
);
ok('the two-row stagger survives', CHRONICLE.includes('laneLabels') && CHRONICLE.includes('.findIndex('));
ok(
	'connectors render inside the lane group only',
	LANE.includes('ev-link-cause') &&
		LANE.includes('ev-link-conseq') &&
		!CHRONICLE.slice(CHRONICLE.indexOf('<!-- Rows -->'), CHRONICLE.indexOf('<!-- Gutter mask')).includes('ev-link-'),
	'no path element crosses into the rows'
);
ok(
	'indicator strokes never swallow mark clicks',
	/\.grid\s*\{[^}]*pointer-events:\s*none/.test(CHRONICLE) &&
		/\.rupture-line\s*\{[^}]*pointer-events:\s*none/.test(CHRONICLE) &&
		/\.playhead\s*\{[^}]*pointer-events:\s*none/.test(CHRONICLE),
	'.grid / .rupture-line / .playhead'
);
ok(
	'keyboard Enter/Space selects exactly that event',
	LANE.includes("ke.key === 'Enter'") && LANE.includes('app.select(e.id)')
);
ok(
	'pointer picking is measured against the lane rect, never the clicked mark',
	CHRONICLE.includes('laneBg.getBoundingClientRect()') && CHRONICLE.includes('function lanePick')
);
ok('selecting an event never dims the tenure bars', CHRONICLE.includes('anyFocus && !eventFocus'));
ok(
	'marks are keyboard-reachable buttons with spoken labels',
	LANE.includes('class="ev-mark"') && LANE.includes('role="button"') && LANE.includes('tabindex="0"') && LANE.includes('aria-label')
);
ok(
	'every mark kind the timeline draws is present',
	['ev-diamond', 'ev-dot', 'ev-pill', 'ev-contested', 'ev-selring', 'ev-cluster', 'ev-spanbar'].every((c) => LANE.includes(c)),
	'rupture, point, pill, contested, selection, cluster, duration'
);
// v2 P2: the expanded investigative view — events stacked into labelled rows
// with their own filters, reached from the events band's expand header.
ok(
	'the events band header is the control that opens the expanded view',
	CHRONICLE.includes('class="lane-head"') &&
		CHRONICLE.includes('data-no-pan') &&
		CHRONICLE.includes("setView(expanded ? 'timeline' : 'events')") &&
		CHRONICLE.includes("t('chronicle.events.expand')") &&
		CHRONICLE.includes("t('chronicle.events.collapse')")
);
ok(
	'the events header is a keyboard-reachable, labelled control',
	/class="lane-head"[\s\S]{0,260}role="button"[\s\S]{0,120}tabindex="0"[\s\S]{0,220}aria-label=/.test(CHRONICLE)
);
ok(
	'expanded mode stacks overlapping events into rows on one linear axis',
	CHRONICLE.includes('expandedLayout') && CHRONICLE.includes('function packRows') && CHRONICLE.includes('laneYs')
);
ok(
	'rows reserve label room for ruptures so the anchors always read',
	CHRONICLE.includes('function ruptureReserve') && CHRONICLE.includes('occ:')
);
ok(
	'expanded events aggregate into counted clusters on one axis',
	CHRONICLE.includes('function clusterEvents') &&
		CHRONICLE.includes('EXP_CLUSTER_PX') &&
		CHRONICLE.includes('clusters: ExpCluster[]') &&
		CHRONICLE.includes('ev-cluster-count')
);
ok(
	'the time axis ticks adapt from decades down to months and weeks',
	CHRONICLE.includes('const axisTicks') && CHRONICLE.includes('stepMonths') && CHRONICLE.includes('dayFmt')
);
ok(
	'the axis is a scrub surface with a draggable date cursor',
	CHRONICLE.includes('function axisTimeAt') &&
		CHRONICLE.includes('onAxisDown') &&
		CHRONICLE.includes('class="axis-scrub"') &&
		CHRONICLE.includes('axisDateLabel') &&
		CHRONICLE.includes('headX')
);
ok(
	'expanded labels truncate to the gap with metrics matching the render',
	CHRONICLE.includes('function fitText') &&
		CHRONICLE.includes('fitText(eventTitle') &&
		CHRONICLE.includes('const EV_LABEL_TYPE') &&
		/\.ev-label\s*\{[^}]*font-size:\s*10px/.test(CHRONICLE)
);
ok(
	'expanding lands on a readable window rather than full range',
	CHRONICLE.includes('YEAR_MS * 25') && CHRONICLE.includes('function setRange')
);
ok(
	'filters narrow events by category and rupture',
	CHRONICLE.includes('function eventPassesFilters') &&
		CHRONICLE.includes('hiddenCats') &&
		CHRONICLE.includes('rupturesOnly') &&
		CHRONICLE.includes('allEventCats')
);
ok(
	'the expanded filter bar reuses existing dictionary keys (no new strings)',
	CHRONICLE.includes("t('feed.all')") &&
		CHRONICLE.includes("t('record.rupture')") &&
		CHRONICLE.includes("t('record.category')") &&
		CHRONICLE.includes("t('chronicle.fullrange')")
);
// ZERO new i18n keys were added: every literal key the view calls must already
// resolve in all three locales (the sweep in test-i18n pins this repo-wide;
// this pins it for this view).
{
	const keys = [...CHRONICLE.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
	ok('the lane caption key already exists (no new keys)', keys.includes('timeline.lane.event'), `${keys.length} literal keys in the view`);
	ok(
		'every literal key in Chronicle.svelte exists in the dictionary',
		keys.every((k) => translate('en', k) !== k),
		keys.join(', ')
	);
	for (const loc of ['en', 'fr', 'ar'] as const) {
		ok(
			`the lane caption resolves in ${loc}`,
			translate(loc, 'timeline.lane.event') !== 'timeline.lane.event',
			translate(loc, 'timeline.lane.event')
		);
	}
}

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
