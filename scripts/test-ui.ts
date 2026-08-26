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
ok('the Inspector routes records away from the entity panel', INSPECTOR.includes('RecordPanel') && INSPECTOR.includes('personById.has(app.selected)'));
ok('search opens record cards instead of redirecting to a party', SEARCH.includes("app.selected = r.id") && !SEARCH.includes('no card yet'));
ok('the record card renders entity references as buttons', RECORD_PANEL.includes('class="ref"'));

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

console.log(`
  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}
`);
if (failures) process.exit(1);
