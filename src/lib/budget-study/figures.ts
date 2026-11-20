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

import historyRaw from '../../../data/studies/dt-research-003/history-lf-2024-2026.yaml?raw';
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
