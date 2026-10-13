import { meetsBasis, type Basis, type Institution, type Layer, type Position, type Role } from '../model';

/**
 * The Chronicle row model, extracted from the component so it can be tested
 * against fixtures and against the real dataset without mounting a view.
 *
 * Rows are grouped by institution and filtered by layer only. Confidence is
 * deliberately absent: keeping the layout stable while the evidence dial moves
 * is what lets the reader perceive edges appearing and vanishing instead of
 * watching the whole chart reflow.
 */

export interface ChronRow {
	roleId: string;
	title: string;
	institutionId: string;
	institutionName: string;
	layer: Layer;
	authority: number;
	positions: Position[];
}

export interface ChronGroup {
	institutionId: string;
	label: string;
	layer: Layer;
	rows: ChronRow[];
}

/**
 * Groups the rows the Chronicle draws, in draw order.
 *
 * `nameOf` is injected because it resolves through the reader's locale, and a
 * name is a label, not part of the model. Roles carry `title_en`, institutions
 * `name_en`, so the parameter type admits both.
 */
export function buildGroups(input: {
	institutions: Institution[];
	roles: Role[];
	positions: Position[];
	activeLayers: Set<Layer>;
	nameOf: (rec: { name_en?: string; title_en?: string } | undefined) => string;
}): ChronGroup[] {
	const { institutions, roles, positions, activeLayers, nameOf } = input;

	const insts = [...institutions]
		.filter((i) => activeLayers.has(i.layer))
		.sort((a, b) => a.order - b.order);

	const groups: ChronGroup[] = [];
	for (const inst of insts) {
		const rows: ChronRow[] = [];
		for (const role of roles.filter((r) => r.institution === inst.id)) {
			const held = positions.filter((p) => p.role === role.id);
			if (held.length === 0) continue;
			rows.push({
				roleId: role.id,
				title: nameOf(role),
				institutionId: inst.id,
				institutionName: nameOf(inst),
				layer: inst.layer,
				authority: role.authority,
				positions: held
			});
		}
		if (rows.length === 0) continue;
		rows.sort((a, b) => b.authority - a.authority);

		groups.push({ institutionId: inst.id, label: nameOf(inst), layer: inst.layer, rows });
	}
	return groups;
}

/** The positions on a row that meet the reader's evidence floor. */
export function visiblePositions(row: ChronRow, basisFloor: Basis): Position[] {
	return row.positions.filter((p) => meetsBasis(p.basis, basisFloor));
}
