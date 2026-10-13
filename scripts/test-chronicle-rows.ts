/**
 * Assertions over the Chronicle row model.
 *
 * The component used to build its rows inline, in the middle of a $derived that
 * also did the pixel geometry. That made three properties untestable: that
 * institutions come out in `order`, that a role with no position never draws an
 * empty row, and that turning a layer off removes its group entirely. Each is
 * asserted here against tiny fixtures, and then the whole grouping is replayed
 * against the real dataset next to an inline copy of the old loop, so the
 * extraction cannot change what the chart draws.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGroups, visiblePositions, type ChronGroup } from '../src/lib/chronicle/rows.ts';
import { meetsBasis, LAYERS, type Basis, type Institution, type Layer, type Position, type Role } from '../src/lib/model.ts';

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

// ── fixtures ───────────────────────────────────────────────────────────────
//
// Partial records: these assertions are about ordering and filtering, and the
// fields the row model never reads would only obscure the failures.

function inst(id: string, layer: Layer, order: number): Institution {
	return {
		id,
		name_en: `${id} name`,
		layer,
		order,
		type: 'test',
		parent: null,
		confidence: 'A',
		verification: 'verified',
		sources: [],
		group: 'test',
		timeline: []
	} as unknown as Institution;
}

function role(id: string, institution: string, authority: number, title = `${id} title`): Role {
	return { id, title_en: title, institution, authority, sources: [] } as unknown as Role;
}

function pos(id: string, roleId: string, basis: Basis = 'documented'): Position {
	return {
		id,
		role: roleId,
		holder: `p-${id}`,
		acting: false,
		confidence: 'A',
		basis,
		datesInferred: false,
		verification: 'verified',
		disputes: [],
		notes: [],
		sources: []
	} as unknown as Position;
}

const labelOf = (rec: { name_en?: string; title_en?: string } | undefined) =>
	rec ? (rec.name_en ?? rec.title_en ?? '') : '';

const ALL_LAYERS = new Set<Layer>(LAYERS);

// ── institution order and authority order ──────────────────────────────────

console.log('\n  ── groups come out in institution order, rows in authority order ──\n');
{
	const groups = buildGroups({
		institutions: [inst('zeta', 'political', 30), inst('alpha', 'political', 10), inst('mid', 'political', 20)],
		roles: [
			role('r-low', 'alpha', 2),
			role('r-high', 'alpha', 9),
			role('r-mid', 'alpha', 5),
			role('r-other', 'mid', 6),
			role('r-only', 'zeta', 7)
		],
		positions: [pos('a', 'r-low'), pos('b', 'r-high'), pos('c', 'r-mid'), pos('e', 'r-other'), pos('d', 'r-only')],
		activeLayers: ALL_LAYERS,
		nameOf: labelOf
	});

	ok('three groups', groups.length === 3, String(groups.length));
	ok(
		'institutions are ordered by `order`, not by array order',
		groups.map((g) => g.institutionId).join(',') === 'alpha,mid,zeta',
		groups.map((g) => g.institutionId).join(',')
	);
	ok(
		'rows are ordered by authority, descending',
		groups[0].rows.map((r) => r.roleId).join(',') === 'r-high,r-mid,r-low',
		groups[0].rows.map((r) => r.roleId).join(',')
	);
	ok('the group label is the institution name', groups[0].label === 'alpha name', groups[0].label);
	ok('the row title is the role title', groups[0].rows[0].title === 'r-high title', groups[0].rows[0].title);
	ok('the row carries its institution id', groups[0].rows[0].institutionId === 'alpha', groups[0].rows[0].institutionId);
	ok('the row carries its institution name', groups[0].rows[0].institutionName === 'alpha name', groups[0].rows[0].institutionName);
	ok('the row takes the institution layer', groups[0].rows[0].layer === 'political', groups[0].rows[0].layer);
	ok('the group takes the institution layer', groups[2].layer === 'political', groups[2].layer);
	ok('the row carries its authority', groups[0].rows[0].authority === 9, String(groups[0].rows[0].authority));
	ok(
		'the row carries its positions',
		groups[0].rows[0].positions.length === 1 && groups[0].rows[0].positions[0].id === 'b',
		JSON.stringify(groups[0].rows[0].positions.map((p) => p.id))
	);
}

// ── equal authority keeps the dataset order ────────────────────────────────

console.log('\n  ── equal authority is stable ──\n');
{
	const groups = buildGroups({
		institutions: [inst('solo', 'security', 1)],
		roles: [role('first', 'solo', 4), role('second', 'solo', 4), role('third', 'solo', 4)],
		positions: [pos('1', 'first'), pos('2', 'second'), pos('3', 'third')],
		activeLayers: ALL_LAYERS,
		nameOf: labelOf
	});
	ok(
		'ties keep the order the roles were given in',
		groups[0].rows.map((r) => r.roleId).join(',') === 'first,second,third',
		groups[0].rows.map((r) => r.roleId).join(',')
	);
}

// ── empty roles and empty institutions ─────────────────────────────────────

console.log('\n  ── a role with no position draws nothing ──\n');
{
	const groups = buildGroups({
		institutions: [inst('has', 'political', 1), inst('empty-inst', 'political', 2), inst('empty-role', 'political', 3)],
		roles: [role('held', 'has', 8), role('unheld', 'empty-role', 8)],
		positions: [pos('1', 'held')],
		activeLayers: ALL_LAYERS,
		nameOf: labelOf
	});
	ok('the group with a held role survives', groups.length === 1, String(groups.length));
	ok('the institution with no roles is dropped', !groups.some((g) => g.institutionId === 'empty-inst'));
	ok('the institution whose only role is unheld is dropped', !groups.some((g) => g.institutionId === 'empty-role'));
	ok('no empty row is drawn', groups[0].rows.length === 1 && groups[0].rows[0].roleId === 'held');
	ok('no empty group is drawn', groups.every((g) => g.rows.length > 0));
}

// ── layer filtering ────────────────────────────────────────────────────────

console.log('\n  ── layer filtering ──\n');
{
	const institutions = [inst('sec', 'security', 1), inst('pol', 'political', 2), inst('eco', 'economic', 3)];
	const roles = [role('r-sec', 'sec', 8), role('r-pol', 'pol', 8), role('r-eco', 'eco', 8)];
	const positions = [pos('1', 'r-sec'), pos('2', 'r-pol'), pos('3', 'r-eco')];

	const all = buildGroups({ institutions, roles, positions, activeLayers: new Set<Layer>(LAYERS), nameOf: labelOf });
	ok('every layer present', all.map((g) => g.institutionId).join(',') === 'sec,pol,eco', all.map((g) => g.institutionId).join(','));

	const one = buildGroups({
		institutions,
		roles,
		positions,
		activeLayers: new Set<Layer>(['political']),
		nameOf: labelOf
	});
	ok('only the active layer survives', one.length === 1 && one[0].layer === 'political', JSON.stringify(one.map((g) => g.layer)));

	const two = buildGroups({
		institutions,
		roles,
		positions,
		activeLayers: new Set<Layer>(['security', 'economic']),
		nameOf: labelOf
	});
	ok(
		'two active layers keep their `order` sequence',
		two.map((g) => g.institutionId).join(',') === 'sec,eco',
		two.map((g) => g.institutionId).join(',')
	);

	const none = buildGroups({ institutions, roles, positions, activeLayers: new Set<Layer>(), nameOf: labelOf });
	ok('an empty selection yields no groups', none.length === 0, String(none.length));

	const call = () => buildGroups({ institutions, roles, positions, activeLayers: ALL_LAYERS, nameOf: labelOf });
	ok('the given arrays are not mutated', (call(), institutions.map((i) => i.id).join(',') === 'sec,pol,eco'));
}

// ── the evidence floor ─────────────────────────────────────────────────────

console.log('\n  ── the evidence floor is the same rule the rest of the model uses ──\n');
{
	const bases: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	const floors: Basis[] = ['documented', 'reported', 'inferred', 'unsubstantiated'];
	const rows = [
		{
			roleId: 'r',
			title: 'r',
			institutionId: 'i',
			institutionName: 'i',
			layer: 'political' as Layer,
			authority: 1,
			positions: bases.map((b, n) => pos(`p${n}`, 'r', b))
		}
	];

	for (const floor of floors) {
		const shown = visiblePositions(rows[0], floor).map((p) => p.basis);
		const expected = bases.filter((b) => meetsBasis(b, floor));
		ok(
			`floor ${floor} keeps ${expected.length} of four bases`,
			shown.join(',') === expected.join(','),
			`${shown.join(',')} vs ${expected.join(',')}`
		);
	}

	ok(
		'a documented floor hides everything weaker',
		visiblePositions(rows[0], 'documented').every((p) => p.basis === 'documented')
	);
	ok(
		'the weakest floor keeps every position',
		visiblePositions(rows[0], 'unsubstantiated').length === rows[0].positions.length
	);
}

// ── the real dataset ───────────────────────────────────────────────────────

console.log('\n  ── the real dataset, against an inline copy of the old loop ──\n');
{
	const ds = JSON.parse(readFileSync(join(HERE, '..', 'src', 'generated', 'dataset.json'), 'utf8'));

	/**
	 * The loop as it stood in Chronicle.svelte before this extraction, kept here
	 * as the reference. If the module and this disagree, the chart moved.
	 */
	function legacy(institutions: Institution[], roles: Role[], positions: Position[], activeLayers: Set<Layer>) {
		const items: { id: string; label: string; layer: Layer; rows: { roleId: string; title: string; layer: Layer; authority: number; positions: Position[] }[] }[] = [];
		const insts = [...institutions]
			.filter((i) => activeLayers.has(i.layer as Layer))
			.sort((a, b) => a.order - b.order);
		for (const i of insts) {
			const rows: { roleId: string; title: string; layer: Layer; authority: number; positions: Position[] }[] = [];
			for (const role of roles.filter((r) => r.institution === i.id)) {
				const positionsForRole = positions.filter((p) => p.role === role.id);
				if (positionsForRole.length === 0) continue;
				rows.push({
					roleId: role.id,
					title: labelOf(role),
					layer: i.layer as Layer,
					authority: role.authority,
					positions: positionsForRole
				});
			}
			if (rows.length === 0) continue;
			rows.sort((a, b) => b.authority - a.authority);
			items.push({ id: i.id, label: labelOf(i), layer: i.layer as Layer, rows });
		}
		return items;
	}

	const activeLayers = new Set<Layer>(LAYERS);
	const groups = buildGroups({
		institutions: ds.institutions,
		roles: ds.roles,
		positions: ds.positions,
		activeLayers,
		nameOf: labelOf
	});
	const reference = legacy(ds.institutions, ds.roles, ds.positions, activeLayers);

	const shape = (list: ChronGroup[] | ReturnType<typeof legacy>) =>
		JSON.stringify(
			list.map((g) => [
				'id' in g ? g.id : g.institutionId,
				g.label,
				g.layer,
				g.rows.map((r) => [r.roleId, r.title, r.authority, r.positions.map((p) => p.id)])
			])
		);

	ok('the dataset produced groups', groups.length > 0, `${groups.length} groups`);
	ok('the extraction matches the old loop exactly', shape(groups) === shape(reference));
	ok(
		'every group in the reference is present',
		reference.every((g) => groups.some((h) => h.institutionId === g.id)),
		`${reference.length} reference groups`
	);

	// Independent recount from the raw arrays, so a shared bug cannot hide.
	const expectedRows: string[] = [];
	for (const i of [...ds.institutions].filter((x: Institution) => activeLayers.has(x.layer)).sort((a: Institution, b: Institution) => a.order - b.order)) {
		for (const r of ds.roles.filter((x: Role) => x.institution === i.id)) {
			if (ds.positions.some((p: Position) => p.role === r.id)) expectedRows.push(r.id);
		}
	}
	const drawnRows = groups.flatMap((g) => g.rows.map((r) => r.roleId));
	ok(
		'the recount agrees, row for row',
		[...drawnRows].sort().join(',') === [...expectedRows].sort().join(','),
		`${drawnRows.length} rows`
	);
	ok('no row is drawn twice', new Set(drawnRows).size === drawnRows.length);
	ok('every row carries its positions', groups.every((g) => g.rows.every((r) => r.positions.length > 0)));
	ok(
		'each row keeps its institution layer',
		groups.every((g) => g.rows.every((r) => r.layer === g.layer))
	);
	ok(
		'authority never rises down a group',
		groups.every((g) => g.rows.every((r, n) => n === 0 || g.rows[n - 1].authority >= r.authority))
	);
	ok(
		'every position belongs to its row role',
		groups.every((g) => g.rows.every((r) => r.positions.every((p) => p.role === r.roleId)))
	);

	const documented = groups.flatMap((g) => g.rows.map((r) => visiblePositions(r, 'documented').length));
	const documentedExpected = groups.flatMap((g) => g.rows.map((r) => r.positions.filter((p) => p.basis === 'documented').length));
	ok(
		'the floor hides the weaker claims on the real data',
		JSON.stringify(documented) === JSON.stringify(documentedExpected),
		`${documented.reduce((a, b) => a + b, 0)} of ${documentedExpected.reduce((a, b) => a + b, 0)} positions`
	);
	ok(
		'the weakest floor hides nothing',
		groups.every((g) => g.rows.every((r) => visiblePositions(r, 'unsubstantiated').length === r.positions.length))
	);
}

console.log(`\n  ${checks - failures}/${checks} chronicle-row checks passed\n`);
if (failures) process.exit(1);
