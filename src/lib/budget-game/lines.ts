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

export function linesFrom(rows: FigureRowLike[]): Lines {
	const subsidies = amountOf(rows, 'subsidies_total_memo');
	const energyTrade = amountOf(rows, 'industry_mines_energy') + amountOf(rows, 'trade_export') - subsidies;
	if (energyTrade < 0) throw new Error('subsidies exceed the Industry and Trade rows');

	const drafts: Record<LineId, number> = {
		education: amountOf(rows, 'education'),
		higher_education: amountOf(rows, 'higher_education_research'),
		health: amountOf(rows, 'health'),
		social: amountOf(rows, 'social_affairs') + amountOf(rows, 'family_women_children_seniors'),
		subsidies,
		energy_trade: energyTrade,
		police: amountOf(rows, 'interior'),
		army: amountOf(rows, 'national_defence'),
		justice: amountOf(rows, 'justice'),
		farming: amountOf(rows, 'agriculture_water_fisheries'),
		roads_housing: amountOf(rows, 'equipment_housing'),
		youth_sports: amountOf(rows, 'youth_sports'),
		culture: amountOf(rows, 'culture_arts'),
		presidency: amountOf(rows, 'presidency'),
		government:
			amountOf(rows, 'foreign_affairs') +
			amountOf(rows, 'head_of_government') +
			amountOf(rows, 'isie_elections') +
			amountOf(rows, 'assembly_of_representatives'),
		other: amountOf(rows, 'all_other_missions') + amountOf(rows, 'tourism'),
		debt: amountOf(rows, 'financing_costs_locked'),
		reserve: amountOf(rows, 'unforeseen_locked')
	};

	const movable = MOVABLE_ORDER.map((id) => ({ id, draft: drafts[id], locked: false }));
	const locked = LOCKED_ORDER.map((id) => ({ id, draft: drafts[id], locked: true }));
	const envelope = movable.reduce((s, l) => s + l.draft, 0);
	const total = envelope + locked.reduce((s, l) => s + l.draft, 0);
	return { movable, locked, envelope, total };
}
