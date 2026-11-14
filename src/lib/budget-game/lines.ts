/**
 * The game's lines, derived from the draft figures file.
 *
 * Nothing here is typed in by hand: each line is a sum of rows from
 * data/studies/dt-research-003/figures-2027.yaml, so the landing page and the
 * game read the same numbers (decision D3: draft figures, labelled "draft, not
 * verified"). The subsidies line is the memo row. The energy and trade line is
 * what is left of the Industry and Trade rows once the subsidies are taken out,
 * on the stated assumption that all subsidies sit inside those two rows.
 *
 * Debt interest and the unforeseen reserve are locked: spent before the start.
 */

export interface FigureRowLike {
	id: string;
	amount_md: number;
}

export type LineId =
	| 'education'
	| 'higher_education'
	| 'health'
	| 'social'
	| 'subsidies'
	| 'energy_trade'
	| 'police'
	| 'army'
	| 'justice'
	| 'farming'
	| 'roads_housing'
	| 'youth_sports'
	| 'culture'
	| 'presidency'
	| 'government'
	| 'other'
	| 'debt'
	| 'reserve';

export interface GameLine {
	id: LineId;
	/** Draft amount in MD, from the figures file. */
	draft: number;
	locked: boolean;
}

/** One step is 5% of a line's draft: 500 basis points. */
export const STEP_SHARE = 0.05;
/** The draft sits at 20 steps (100%). Levels run 0 to 40 (0% to 200%). */
export const DRAFT_LEVEL = 20;
export const MAX_LEVEL = 40;
/** Finished when the purse is within this share of the envelope. */
export const BALANCE_TOLERANCE = 0.005;

/** Movable lines in official budget order (the order the board shows them). */
export const MOVABLE_ORDER: LineId[] = [
	'education',
	'higher_education',
	'health',
	'social',
	'subsidies',
	'energy_trade',
	'police',
	'army',
	'justice',
	'farming',
	'roads_housing',
	'youth_sports',
	'culture',
	'presidency',
	'government',
	'other'
];
export const LOCKED_ORDER: LineId[] = ['debt', 'reserve'];

function amountOf(rows: FigureRowLike[], id: string): number {
	const row = rows.find((r) => r.id === id);
	if (!row) throw new Error(`figures file has no row "${id}"`);
	return row.amount_md;
}

export interface Lines {
	movable: GameLine[];
	locked: GameLine[];
	/** Sum of the movable drafts: what the board distributes. */
	envelope: number;
	/** Every row of the budget: movable plus locked. */
	total: number;
}

/**
 * What each board line is made of: rows of the figures file added together,
 * minus rows taken out. The subsidies memo row sits inside the Industry and
 * Trade rows, so the energy and trade line is those two rows less subsidies.
 * The landing page prints this mapping next to the figures.
 */
export const LINE_ROWS: Record<LineId, { plus: string[]; minus?: string[] }> = {
	education: { plus: ['education'] },
	higher_education: { plus: ['higher_education_research'] },
	health: { plus: ['health'] },
	social: { plus: ['social_affairs', 'family_women_children_seniors'] },
	subsidies: { plus: ['subsidies_total_memo'] },
	energy_trade: { plus: ['industry_mines_energy', 'trade_export'], minus: ['subsidies_total_memo'] },
	police: { plus: ['interior'] },
	army: { plus: ['national_defence'] },
	justice: { plus: ['justice'] },
	farming: { plus: ['agriculture_water_fisheries'] },
	roads_housing: { plus: ['equipment_housing'] },
	youth_sports: { plus: ['youth_sports'] },
	culture: { plus: ['culture_arts'] },
	presidency: { plus: ['presidency'] },
	government: { plus: ['foreign_affairs', 'head_of_government', 'isie_elections', 'assembly_of_representatives'] },
	other: { plus: ['all_other_missions', 'tourism'] },
	debt: { plus: ['financing_costs_locked'] },
	reserve: { plus: ['unforeseen_locked'] }
};

export function linesFrom(rows: FigureRowLike[]): Lines {
	const drafts = {} as Record<LineId, number>;
	for (const [id, made] of Object.entries(LINE_ROWS) as [LineId, (typeof LINE_ROWS)[LineId]][]) {
		const sum = made.plus.reduce((s, r) => s + amountOf(rows, r), 0) - (made.minus ?? []).reduce((s, r) => s + amountOf(rows, r), 0);
		if (sum < 0) throw new Error(`line "${id}" comes out negative`);
		// Rounded to the thousand dinars the figures file is written in, so sums carry no float dust.
		drafts[id] = Math.round(sum * 1000) / 1000;
	}

	const movable = MOVABLE_ORDER.map((id) => ({ id, draft: drafts[id], locked: false }));
	const locked = LOCKED_ORDER.map((id) => ({ id, draft: drafts[id], locked: true }));
	const envelope = Math.round(movable.reduce((s, l) => s + l.draft, 0) * 1000) / 1000;
	const total = Math.round((envelope + locked.reduce((s, l) => s + l.draft, 0)) * 1000) / 1000;
	return { movable, locked, envelope, total };
}
