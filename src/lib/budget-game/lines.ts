/**
 * The game's lines, derived from the draft figures file.
 *
 * Nothing here is typed in by hand: each line is a sum of rows from
 * data/studies/dt-research-003/figures-2027.yaml, so the landing page and the
 * game read the same numbers (decision D3: draft figures, labelled "draft, not
 * verified"). The subsidies memo is split into two derived rows, fuel and
 * electricity versus basic food, so the largest line on the board can be cut in
 * the way people argue about it. The two rows sum to the memo. The energy and
 * trade line is what is left of the Industry and Trade rows once the two
 * subsidy rows are taken out, on the stated assumption that the memo sits
 * inside those two rows.
 *
 * Debt interest and the unforeseen reserve are locked: spent before the start.
 */

export interface FigureRowLike {
	id: string;
	amount_md: number;
}

export type LineId =
	| 'parliament'
	| 'presidency'
	| 'government_offices'
	| 'police'
	| 'justice'
	| 'foreign_affairs'
	| 'army'
	| 'finance'
	| 'economy'
	| 'farming'
	| 'subsidies_energy'
	| 'subsidies_food'
	| 'energy_trade'
	| 'tourism'
	| 'roads_housing'
	| 'environment'
	| 'transport'
	| 'culture'
	| 'youth_sports'
	| 'family'
	| 'health'
	| 'social_affairs'
	| 'education'
	| 'higher_education'
	| 'employment'
	| 'rest'
	| 'elections'
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

/**
 * Movable lines in the order of the finance law's tableau C (mission 1 first),
 * so the board never ranks the lines by what the designer thinks matters. The
 * split subsidy rows sit where their containing missions sit; the one derived
 * remainder and the election authority close the list.
 */
export const MOVABLE_ORDER: LineId[] = [
	'parliament',
	'presidency',
	'government_offices',
	'police',
	'justice',
	'foreign_affairs',
	'army',
	'finance',
	'economy',
	'farming',
	'subsidies_energy',
	'subsidies_food',
	'energy_trade',
	'tourism',
	'roads_housing',
	'environment',
	'transport',
	'culture',
	'youth_sports',
	'family',
	'health',
	'social_affairs',
	'education',
	'higher_education',
	'employment',
	'rest',
	'elections'
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
 * minus rows taken out. The two subsidy rows are derived from the memo and sum
 * to it; the energy and trade line is the two containing ministry rows less
 * both subsidy rows, so it is a remainder, not a ministry budget.
 */
export const LINE_ROWS: Record<LineId, { plus: string[]; minus?: string[] }> = {
	parliament: { plus: ['assembly_of_representatives'] },
	presidency: { plus: ['presidency'] },
	government_offices: { plus: ['head_of_government'] },
	police: { plus: ['interior'] },
	justice: { plus: ['justice'] },
	foreign_affairs: { plus: ['foreign_affairs'] },
	army: { plus: ['national_defence'] },
	finance: { plus: ['finance'] },
	economy: { plus: ['economy_planning'] },
	farming: { plus: ['agriculture_water_fisheries'] },
	subsidies_energy: { plus: ['subsidies_energy_2027'] },
	subsidies_food: { plus: ['subsidies_food_2027'] },
	energy_trade: { plus: ['industry_mines_energy', 'trade_export'], minus: ['subsidies_energy_2027', 'subsidies_food_2027'] },
	tourism: { plus: ['tourism'] },
	roads_housing: { plus: ['equipment_housing'] },
	environment: { plus: ['environment'] },
	transport: { plus: ['transport'] },
	culture: { plus: ['culture_arts'] },
	youth_sports: { plus: ['youth_sports'] },
	family: { plus: ['family_women_children_seniors'] },
	health: { plus: ['health'] },
	social_affairs: { plus: ['social_affairs'] },
	education: { plus: ['education'] },
	higher_education: { plus: ['higher_education_research'] },
	employment: { plus: ['employment_training'] },
	// The only remainder, and a small one: named missions whose 2027 drafts are not reported one by one.
	rest: { plus: ['all_other_missions'] },
	elections: { plus: ['isie_elections'] },
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

/**
 * The same board lines in the adopted laws of past years (tableau C, by mission).
 * Every mission of the law lands in exactly one line, so a year's lines add up to
 * the law's total. Subsidies are not a mission there: the board reads them as the
 * energy programme of Industry, Mines and Energy and the domestic trade programme
 * of Commerce. The energy and trade line is those two missions less the two
 * programmes. That is close to, not the same as, the 2027 memo and its derived split.
 */
export const HISTORY_ROWS: Record<LineId, { missions?: string[]; programmes?: string[]; minusProgrammes?: string[] }> = {
	parliament: { missions: ['arp'] },
	presidency: { missions: ['presidency'] },
	government_offices: { missions: ['head_of_government'] },
	police: { missions: ['interior'] },
	justice: { missions: ['justice'] },
	foreign_affairs: { missions: ['foreign_affairs'] },
	army: { missions: ['national_defence'] },
	finance: { missions: ['finance'] },
	economy: { missions: ['economy_planning'] },
	farming: { missions: ['agriculture_water_fisheries'] },
	subsidies_energy: { programmes: ['energy'] },
	subsidies_food: { programmes: ['domestic_trade'] },
	energy_trade: { missions: ['industry_mines_energy', 'trade_export'], minusProgrammes: ['energy', 'domestic_trade'] },
	tourism: { missions: ['tourism'] },
	roads_housing: { missions: ['equipment_housing'] },
	environment: { missions: ['environment'] },
	transport: { missions: ['transport'] },
	culture: { missions: ['culture_arts'] },
	youth_sports: { missions: ['youth_sports'] },
	family: { missions: ['family_women_children_seniors'] },
	health: { missions: ['health'] },
	social_affairs: { missions: ['social_affairs'] },
	education: { missions: ['education'] },
	higher_education: { missions: ['higher_education_research'] },
	employment: { missions: ['employment_training'] },
	rest: {
		missions: [
			'religious_affairs',
			'communication_technologies',
			'state_domains',
			'court_of_accounts',
			'anrd',
			'higher_council_education',
			'judicial_council',
			'constitutional_court',
			// 2020 only: the public service and administration modernisation mission.
			'other_fonction_publique'
		]
	},
	elections: { missions: ['isie_elections'] },
	debt: { missions: ['financing_costs'] },
	reserve: { missions: ['unforeseen'] }
};

export interface HistoryYearLike {
	missions: Record<string, { amount_md: number }>;
	programmes: Record<string, { amount_md: number }>;
}

/** One past year's law, read onto the board's lines (MD). Missions a year lacks count as zero. */
export function historyLines(year: HistoryYearLike): Record<LineId, number> {
	const mission = (id: string) => year.missions[id]?.amount_md ?? 0;
	const programme = (id: string) => {
		const p = year.programmes[id];
		if (!p) throw new Error(`history year has no programme "${id}"`);
		return p.amount_md;
	};
	const out = {} as Record<LineId, number>;
	for (const [id, made] of Object.entries(HISTORY_ROWS) as [LineId, (typeof HISTORY_ROWS)[LineId]][]) {
		const sum =
			(made.missions ?? []).reduce((s, m) => s + mission(m), 0) +
			(made.programmes ?? []).reduce((s, m) => s + programme(m), 0) -
			(made.minusProgrammes ?? []).reduce((s, m) => s + programme(m), 0);
		out[id] = Math.round(sum * 1000) / 1000;
	}
	// Every mission must land somewhere, or the lines would not add up to the law.
	const used = new Set(Object.values(HISTORY_ROWS).flatMap((m) => m.missions ?? []));
	for (const id of Object.keys(year.missions)) if (!used.has(id)) throw new Error(`history mission "${id}" is on no line`);
	return out;
}
