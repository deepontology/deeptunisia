/**
 * The words that say where a record stands.
 *
 * Every sentence a record page uses to describe its own standing comes from
 * standingLines() below. The template holds no standing words of its own, so a
 * later change of vocabulary is a change to this file and its i18n keys, not a
 * search through three templates.
 *
 * Today's fields only: basis, confidence, the presence of a review, and the two
 * verification values that mean something a reader must see (needs a primary
 * source, disputed). The value `verified` is never printed, because today it is
 * the default on nearly every record and says nothing about who checked what.
 */
import type { Line } from './labels.ts';

export type Basis = 'documented' | 'reported' | 'inferred' | 'unsubstantiated' | 'attributed';

/** Strong enough standing to print on a page that talks about a person. */
export const SHOWN_BASES: readonly Basis[] = ['documented', 'reported'];

export interface StandingRecord {
	id: string;
	basis?: string;
	confidence?: string;
	verification?: string;
	review?: { date?: string } | null;
	sources?: string[];
}

export interface Omitted {
	inferred: number;
	unsubstantiated: number;
	/** Strong claims the page does not print because the record has too many. */
	beyondLength?: number;
}

export function isShown(basis: string | undefined): boolean {
	return (SHOWN_BASES as readonly string[]).includes(basis ?? '');
}

/** A source id that is an encyclopedia entry, not a data store mirror. */
function isEncyclopedia(id: string): boolean {
	return /wiki/i.test(id) && !/^wikidata/i.test(id);
}

/** True when every source behind a claim is an encyclopedia entry. */
export function restsOnEncyclopediaOnly(sources: string[] | undefined): boolean {
	return !!sources && sources.length > 0 && sources.every(isEncyclopedia);
}

/**
 * The standing of one record, as sentences.
 *
 * Returned as i18n keys rather than text: the same record page carries all three
 * languages and the stylesheet shows the set that matches the page's lang.
 */
export function standingLines(record: StandingRecord, omitted: Omitted = { inferred: 0, unsubstantiated: 0 }): Line[] {
	const lines: Line[] = [];
	const basis = record.basis && ['documented', 'reported', 'inferred', 'unsubstantiated', 'attributed'].includes(record.basis)
		? record.basis
		: 'reported';
	lines.push({ key: `rec.standing.${basis}` });

	const grade = record.confidence ?? '';
	if (grade && ['A', 'B', 'C', 'D'].includes(grade)) {
		lines.push({ key: `rec.standing.confidence.${grade}` });
	}

	if (restsOnEncyclopediaOnly(record.sources)) {
		lines.push({ key: 'rec.standing.wikipediaOnly' });
	}

	const reviewed = record.review && record.review.date;
	lines.push(reviewed ? { key: 'rec.standing.reviewed', params: { date: String(reviewed) } } : { key: 'rec.standing.unreviewed' });

	if (record.verification === 'needs-primary-source') lines.push({ key: 'rec.standing.needsPrimary' });
	if (record.verification === 'disputed') lines.push({ key: 'rec.standing.disputed' });

	/* Two different reasons for a claim not being here, stated separately and
	   followed by one sentence saying where the rest are. */
	const notices: Line[] = [];
	const weak = (omitted.inferred || 0) + (omitted.unsubstantiated || 0);
	if (weak > 0) notices.push({ key: 'rec.standing.omitted', params: { n: weak } });
	const beyond = omitted.beyondLength || 0;
	if (beyond > 0) notices.push({ key: 'rec.standing.unshown', params: { n: beyond } });
	if (notices.length) {
		lines.push(...notices);
		lines.push({ key: 'rec.standing.omittedWhere' });
	}

	return lines;
}
