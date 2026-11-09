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
