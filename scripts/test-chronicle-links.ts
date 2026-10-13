/**
 * Fixture gate for the event ↔ post join.
 *
 * The join decides which offices the Chronicle can show against an event, so
 * its edge cases are the whole risk. This suite proves them on a fixture with
 * a hand-built clock, then runs the same function over the shipped graph and
 * reports what it finds there:
 *
 *   1. Rule (a) is institutional: every role of a linked institution links,
 *      whether or not anyone held the post at the time.
 *   2. Rule (b) is temporal: the role of a linked person's post links when
 *      the post's window and the event's window meet — touching counts, one
 *      tick apart does not, and a post with no recorded end runs to the
 *      horizon the data itself sets.
 *   3. Actors that are institutions link like institutions; references that
 *      land in no table at all are reported as unresolved, never dropped.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../src/generated/index.ts';
import { buildEventLinks, type EventLinkTables, type LinkEvent } from '../src/lib/chronicle/links.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

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

function sameSet(actual: Set<string>, expected: string[]): boolean {
	return actual.size === expected.length && expected.every((id) => actual.has(id));
}

function sameList(actual: string[], expected: string[]): boolean {
	return actual.length === expected.length && actual.every((id, i) => id === expected[i]);
}

// ── fixture ─────────────────────────────────────────────────────────────────

// A fixture clock in arbitrary milliseconds, spaced to be readable.
const T = {
	aminaFrom: 1_000, // amina: governor of gov-sfax, 1000..2000
	aminaTo: 2_000,
	bilelFrom: 3_000, // bilel: minister of cabinet, 3000..4000
	bilelTo: 4_000,
	celiaFrom: 5_000, // celia: adviser of cabinet, no end recorded
	latest: 8_000 // the latest end anywhere in the fixture: the horizon
};

const EVENTS: LinkEvent[] = [
	// Listed out of chronological order on purpose: the reverse indices must
	// sort by date, not by table order.
	{
		id: 'ev-late',
		actors: ['amina', 'bilel'],
		interval: { startEarliest: 3_900, endEarliest: 3_900, endLatest: 4_000 }
	},
	{
		id: 'ev-just-out',
		actors: ['amina'],
		interval: { startEarliest: 2_001, endEarliest: 2_002, endLatest: 2_002 }
	},
	{
		id: 'ev-ghost',
		actors: ['ghost-actor'],
		institutions: ['ghost-inst'],
		interval: { startEarliest: 3_500, endEarliest: 3_500, endLatest: 3_500 }
	},
	{
		id: 'ev-rule-a',
		institutions: ['cabinet'],
		interval: { startEarliest: 3_500, endEarliest: 3_500, endLatest: 3_500 }
	},
	{
		id: 'ev-early',
		actors: ['amina'],
		interval: { startEarliest: 1_000, endEarliest: 1_500, endLatest: 1_500 }
	},
	{
		id: 'ev-army',
		actors: ['gov-sfax'],
		interval: { startEarliest: 1_000, endEarliest: 1_200, endLatest: 1_200 }
	},
	{
		id: 'ev-touch-start',
		actors: ['amina'],
		interval: { startEarliest: 2_000, endEarliest: 2_000, endLatest: 2_000 }
	},
	{
		id: 'ev-touch-end',
		actors: ['bilel'],
		interval: { startEarliest: 3_000, endEarliest: 3_000, endLatest: 3_000 }
	},
	{
		id: 'ev-open-gap',
		actors: ['celia'],
		interval: { startEarliest: 4_000, endEarliest: 4_900, endLatest: 4_900 }
	},
	{
		id: 'ev-horizon',
		actors: ['celia'],
		interval: { startEarliest: 6_000, endEarliest: T.latest, endLatest: T.latest }
	},
	{
		id: 'ev-role-actor',
		actors: ['minister'],
		interval: { startEarliest: 3_500, endEarliest: 3_500, endLatest: 3_500 }
	},
	{
		id: 'ev-pos-actor',
		actors: ['p-gov-amina'],
		interval: { startEarliest: 3_500, endEarliest: 3_500, endLatest: 3_500 }
	}
];

const FIXTURE: EventLinkTables = {
	events: EVENTS,
	roles: [
		{ id: 'governor', institution: 'gov-sfax' },
		{ id: 'minister', institution: 'cabinet' },
		{ id: 'adviser', institution: 'cabinet' }
	],
	positions: [
		{
			id: 'p-gov-amina',
			role: 'governor',
			holder: 'amina',
			interval: { startEarliest: T.aminaFrom, endEarliest: T.aminaTo, endLatest: T.aminaTo }
		},
		{
			role: 'minister',
			holder: 'bilel',
			interval: { startEarliest: T.bilelFrom, endEarliest: T.bilelTo, endLatest: T.bilelTo }
		},
		{ role: 'adviser', holder: 'celia', interval: { startEarliest: T.celiaFrom } }
	],
	people: [{ id: 'amina' }, { id: 'bilel' }, { id: 'celia' }],
	institutions: [{ id: 'gov-sfax' }, { id: 'cabinet' }]
};

console.log('\n  chronicle-links: fixtures\n');
{
	const idx = buildEventLinks(FIXTURE);

	ok(
		'rule (a): every role of a linked institution',
		sameSet(idx.byEvent.get('ev-rule-a')!.roleIds, ['minister', 'adviser']),
		'the cabinet, including a post nobody held at the time'
	);
	ok(
		'rule (b): the role of a post held while the event was live',
		sameSet(idx.byEvent.get('ev-late')!.roleIds, ['minister']),
		'governor is out: it ended one tick too early'
	);

	ok(
		'overlap: touching at a post end counts',
		sameSet(idx.byEvent.get('ev-touch-start')!.roleIds, ['governor']),
		'event day = last day of the post'
	);
	ok(
		'overlap: touching at a post start counts',
		sameSet(idx.byEvent.get('ev-touch-end')!.roleIds, ['minister']),
		'event day = first day of the post'
	);
	ok('overlap: one tick after a closed post ends does not', idx.byEvent.get('ev-just-out')!.roleIds.size === 0);
	ok(
		'overlap: an open post runs to the horizon the data sets',
		sameSet(idx.byEvent.get('ev-horizon')!.roleIds, ['adviser']),
		'no end recorded → the latest end in the fixture'
	);
	ok('overlap: an open post does not count before it begins', idx.byEvent.get('ev-open-gap')!.roleIds.size === 0);

	ok(
		'an actor that is an institution links its roles',
		sameSet(idx.byEvent.get('ev-army')!.roleIds, ['governor']) &&
			sameSet(idx.byEvent.get('ev-army')!.institutionIds, ['gov-sfax'])
	);
	ok('personIds are the actors that are people', sameSet(idx.byEvent.get('ev-late')!.personIds, ['amina', 'bilel']));
	ok('an actor that is a role id links nothing', idx.byEvent.get('ev-role-actor')!.roleIds.size === 0);
	ok('every event has an entry, linked or not', EVENTS.every((e) => idx.byEvent.has(e.id)));

	ok(
		'unresolved: ids found in no table',
		sameList(
			idx.unresolved.map((u) => `${u.eventId}:${u.id}`),
			['ev-ghost:ghost-actor', 'ev-ghost:ghost-inst']
		)
	);
	ok(
		'an id found in the roles or positions table is not unresolved',
		idx.unresolved.every((u) => u.id !== 'minister' && u.id !== 'p-gov-amina')
	);

	ok(
		'eventsByRole is sorted by date',
		sameList(idx.eventsByRole.get('governor')!, ['ev-army', 'ev-early', 'ev-touch-start'])
	);
	ok(
		'eventsByPerson is sorted by date',
		sameList(idx.eventsByPerson.get('amina')!, ['ev-early', 'ev-touch-start', 'ev-just-out', 'ev-late']),
		'ev-just-out links the person without linking a role'
	);
	ok('rule (a) feeds the reverse indices too', sameList(idx.eventsByRole.get('adviser')!, ['ev-rule-a', 'ev-horizon']));
	ok('eventsByPerson only lists linked people', idx.eventsByPerson.has('gov-sfax') === false);
}

// ── shipped graph ───────────────────────────────────────────────────────────

console.log('\n  chronicle-links: shipped graph\n');
{
	const ds = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8')) as Dataset;
	const idx = buildEventLinks(ds);
	const withRoles = [...idx.byEvent.values()].filter((l) => l.roleIds.size > 0).length;

	ok('every event has an entry', idx.byEvent.size === ds.events.length, `${idx.byEvent.size}/${ds.events.length}`);
	ok('the reverse indices are sorted by date', isSortedByDate(idx, ds));
	ok(
		'at least 100 events link to at least one role',
		withRoles >= 100,
		`${withRoles}/${ds.events.length} events · ${idx.eventsByRole.size} roles · ${idx.eventsByPerson.size} people`
	);
	console.log(`  unresolved actor/institution ids in the shipped graph: ${idx.unresolved.length}`);
}

function isSortedByDate(idx: ReturnType<typeof buildEventLinks>, ds: Dataset): boolean {
	const startOf = new Map(ds.events.map((e) => [e.id, e.interval.startEarliest]));
	for (const list of [...idx.eventsByRole.values(), ...idx.eventsByPerson.values()]) {
		for (let i = 1; i < list.length; i++) {
			if ((startOf.get(list[i - 1]) ?? 0) > (startOf.get(list[i]) ?? 0)) return false;
		}
	}
	return true;
}

console.log(`\n  ${checks - failures}/${checks} chronicle-link checks passed\n`);
if (failures) process.exit(1);
