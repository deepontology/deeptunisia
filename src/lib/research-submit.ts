/**
 * One research submission path, shared by the study pages and tested without a
 * browser.
 *
 * The payload is exactly the shape community/research-api.ts accepts for every
 * study: the instrument hash, the locale, the channel, the consent version, the
 * timings, the answers, the signed arm assignment, the first-party proof of work
 * and the optional human-check token. Nothing here decides whether a study is
 * accepting. The server does, and the caller shows the refusal it gets.
 *
 * The board uses this module for the citizen budget study. The police runner
 * keeps its own copy of the same shape on purpose: a review of this change must
 * be able to see that the police submit path was not touched.
 */
import { channelCode, periodOf } from '../../community/research-scoring.ts';
import type { RuntimeInstrument, StudyRecord } from '$lib/research';

/** The signed arm assignment the study read hands back (contract §10). */
export interface Assignment {
	blockOrder: 'core_first' | 'extended_first';
	scaleDirection: 'ascending' | 'descending';
	token: string;
}

/** The live study, its instrument and the assignment, or null when the API could not be read. */
export interface LiveStudy {
	study: StudyRecord;
	instrument: RuntimeInstrument | null;
	assignment: Assignment | null;
}

export async function readLiveStudy(slug: string): Promise<LiveStudy | null> {
	try {
		const res = await fetch(`/api/studies/${slug}`);
		if (!res.ok) return null;
		const body = (await res.json()) as {
			study?: StudyRecord;
			instrument?: RuntimeInstrument;
			assignment?: Assignment;
		};
		if (!body.study) return null;
		return { study: body.study, instrument: body.instrument ?? null, assignment: body.assignment ?? null };
	} catch {
		return null;
	}
}

/**
 * The kind of link the respondent arrived through, as the server stores it.
 * The mapping is the one both sides share, so an unlisted value is `other` on
 * the client and on the server.
 */
export function channelFromLocation(search: string): string {
	return channelCode(new URLSearchParams(search).get('src') ?? '');
}

/** The calendar month in Tunisia time, the month the study's counters use. */
export function tunisiaMonth(now = Date.now()): string {
	return periodOf(now, 60);
}

export interface BudgetAnswersInput {
	readInfo: boolean;
	withdrawal: boolean;
	adult: boolean;
	/** The board's allocation: one basis-point integer per line plus kept_draft. */
	allocation: Record<string, number | boolean>;
	q1: 'lower' | 'same' | 'higher' | 'skip' | null;
	q2: number | null;
}

/**
 * The citizen budget answers in the instrument's own keys. A skipped question
 * is omitted, which the validator reads as a skip; the consent items and the
 * allocation are always present.
 */
export function budgetAnswers(input: BudgetAnswersInput): Record<string, unknown> {
	const answers: Record<string, unknown> = {
		consent_read: input.readInfo,
		consent_withdrawal: input.withdrawal,
		consent_age: input.adult,
		alloc_budget: input.allocation
	};
	if (input.q1 !== null && input.q1 !== 'skip') answers.q_spending = input.q1;
	if (input.q2 !== null) answers.q_say = input.q2;
	return answers;
}

export interface SubmitInput {
	instrument: Pick<RuntimeInstrument, 'hash' | 'version'>;
	locale: 'en' | 'fr' | 'ar';
	channel: string;
	startedAt: number;
	completionMs: number;
	answers: Record<string, unknown>;
	assignment?: Assignment | null;
	pow?: unknown;
	turnstileToken?: string;
	revision?: 'same-device' | 'update';
	replaces?: string;
}

/** The exact JSON the submit route parses. Optional fields are absent, not null. */
export function submissionPayload(input: SubmitInput): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		instrumentHash: input.instrument.hash,
		locale: input.locale,
		channel: input.channel,
		consentVersion: `${input.instrument.version}+${input.instrument.hash.slice(0, 12)}`,
		startedAt: input.startedAt,
		completionMs: input.completionMs,
		answers: input.answers
	};
	if (input.assignment) payload.assignment = input.assignment;
	if (input.pow) payload.pow = input.pow;
	if (input.turnstileToken !== undefined) payload.turnstileToken = input.turnstileToken;
	if (input.revision) payload.revision = input.revision;
	if (input.revision === 'update' && input.replaces) payload.replaces = input.replaces;
	return payload;
}

export type SubmitResult =
	| { ok: true; receipt: string }
	| { ok: false; status: number; error: string };

/**
 * POST the payload and return what the server said. A network failure is
 * status 0, so the caller can show the same honest "nothing was stored" line for
 * both a refused request and a request that never arrived.
 */
export async function submitResponse(
	slug: string,
	payload: Record<string, unknown>,
	fetchImpl: typeof fetch = fetch
): Promise<SubmitResult> {
	try {
		const res = await fetchImpl(`/api/studies/${slug}/submit`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const body = (await res.json().catch(() => ({}))) as { receipt?: unknown; error?: unknown };
		if (res.ok && typeof body.receipt === 'string') return { ok: true, receipt: body.receipt };
		return {
			ok: false,
			status: res.status,
			error: typeof body.error === 'string' ? body.error : ''
		};
	} catch {
		return { ok: false, status: 0, error: 'network' };
	}
}
