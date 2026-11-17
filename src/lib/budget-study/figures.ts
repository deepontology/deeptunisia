/**
 * The draft figures for the citizen budget study, read from the committed
 * figures file. Every row carries its status: nothing here is verified against
 * the official document while the status is draft-press or draft-derived.
 */
import { parse } from 'yaml';
import figuresRaw from '../../../data/studies/dt-research-003/figures-2027.yaml?raw';

export interface FigureRow {
	id: string;
	label_en: string;
	amount_md: number;
	status: 'draft-press' | 'draft-derived' | 'draft-plf' | 'adopted-lf';
	source: string;
	url: string | null;
	memo?: boolean;
}

export interface Figures {
	document: string;
	total_label: string;
	total_md: number;
	checked: string;
	rows: FigureRow[];
}

export const FIGURES: Figures = parse(figuresRaw) as Figures;

/** Human words for each status, shown next to every figure. */
export const STATUS_WORDS: Record<FigureRow['status'], string> = {
	'draft-press': 'Reported by the press. Not verified.',
	'draft-derived': 'Derived as a remainder. Not verified.',
	'draft-plf': 'In the draft law. Not verified.',
	'adopted-lf': 'In the adopted law, with page reference.'
};

import historyRaw from '../../../data/studies/dt-research-003/history-lf-2020-2026.yaml?raw';
import { historyLines, type LineId } from '../budget-game/lines';

interface HistoryEntry {
	amount_md: number;
	page: number;
	label: string;
}

/** One past year's adopted budget, read from tableau C of its finance law. */
export interface HistoryYear {
	year: number;
	document: string;
	source: string;
	url: string;
	total_md: number;
	missions: Record<string, HistoryEntry>;
	programmes: Record<string, HistoryEntry>;
	/** The same year on the board's lines, in MD. */
	lines: Record<LineId, number>;
}

const historyDoc = parse(historyRaw) as { years: Record<string, Omit<HistoryYear, 'year' | 'lines'>> };

/** Adopted budgets 2024 to 2026, oldest first. Status adopted-lf, each mission with its JORT page. */
export const HISTORY: HistoryYear[] = Object.entries(historyDoc.years)
	.map(([year, y]) => ({ ...y, year: Number(year), lines: historyLines(y) }))
	.sort((a, b) => a.year - b.year);

/* The 2026 law's programme lines, for the board's detail panel. Not used to split 2027. */
import programmesRaw from '../../../data/studies/dt-research-003/programmes-2026.yaml?raw';

export interface ProgrammeEntry {
	label: string;
	amount_md: number;
}

export interface MissionProgrammes {
	label: string;
	total_md: number;
	page: number;
	programmes: ProgrammeEntry[];
}

interface ProgrammesDoc {
	document: string;
	source: string;
	url: string;
	year: number;
	pages: Record<string, string>;
	missions: Record<string, MissionProgrammes>;
}

export const PROGRAMMES_2026: ProgrammesDoc = parse(programmesRaw) as ProgrammesDoc;

/** Which 2026 missions sit inside each board line, for the detail panel. */
export const LINE_MISSIONS: Partial<Record<LineId, string[]>> = {
	education: ['education'],
	higher_education: ['higher_education_research'],
	health: ['health'],
	social_affairs: ['social_affairs'],
	family: ['family_women_children_seniors'],
	employment: ['employment_training'],
	subsidies_energy: ['industry_mines_energy'],
	subsidies_food: ['trade_export'],
	energy_trade: ['industry_mines_energy', 'trade_export'],
	police: ['interior'],
	army: ['national_defence'],
	justice: ['justice'],
	finance: ['finance'],
	farming: ['agriculture_water_fisheries'],
	roads_housing: ['equipment_housing'],
	transport: ['transport'],
	environment: ['environment'],
	economy: ['economy_planning'],
	youth_sports: ['youth_sports'],
	culture: ['culture_arts'],
	tourism: ['tourism'],
	presidency: ['presidency'],
	government_offices: ['head_of_government'],
	foreign_affairs: ['foreign_affairs'],
	parliament: ['arp'],
	elections: ['isie_elections'],
	rest: ['religious_affairs', 'communication_technologies', 'state_domains', 'court_of_accounts', 'anrd', 'higher_council_education']
};

/** The 2026 programme rows for a board line; empty when the law's detail was not read. */
export function programmesForLine(id: LineId): { mission: MissionProgrammes; key: string }[] {
	return (LINE_MISSIONS[id] ?? [])
		.map((key) => ({ key, mission: PROGRAMMES_2026.missions[key] }))
		.filter((m): m is { key: string; mission: MissionProgrammes } => Boolean(m.mission));
}
