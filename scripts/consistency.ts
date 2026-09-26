/**
 * Narrative ↔ canonical consistency (v0.1.3 plan, milestone M2).
 *
 * WHY THIS EXISTS
 * ---------------
 * The graph's own prose once said Bennour returned to the DGSN "in 2018, seven
 * years after the revolution" while `positions.yaml` dates that return
 * 2011-03-02. Nothing caught it, because the prose was never compared with the
 * records: it was free text, and free text is not machine-checkable.
 *
 * The fix is not to parse prose — that would claim general language
 * understanding, which this project does not have. The fix is to make the
 * assertion explicit and machine-readable, then check the explicit part:
 *
 *     references:
 *       - person: abdessatar-bennour
 *         role: dg-national-security
 *         on: 2011-03-02
 *
 * A hypothesis, an evidence finding, or a question may declare such a
 * reference. This module then compares it against the canonical positions and
 * their temporal intervals. What it checks:
 *
 *   1. The canonical record exists — some position for that person in that role
 *      (and institution, if named). Absence is reported, not guessed around.
 *   2. The instant the narrative asserts is inside that record's interval.
 *      This is the contradiction class: it is an error, and it fails the build.
 *   3. The canonical record the reference leans on carries a source. A
 *      reference resting on an unsourced record is reported as a warning.
 *
 * What it deliberately does NOT do: read English, French or Arabic sentences to
 * discover assertions. A claim that declares no reference gets a warning that
 * says so, and names the file and the claim id, so the backlog is visible
 * instead of assumed. Source-id resolution stays where it already is, in
 * `build-data.ts`'s `checkSources`.
 *
 * The warning is a backlog, not a defect: the build publishes it every run
 * until an editor decides whether the claim names a person, role, institution
 * or date — and if it does, writes the three fields that make it checkable.
 */

/** One explicit assertion about a person in a post at an instant. */
export interface NarrativeReference {
	/** Canonical person id, as `people.yaml` uses it. */
	person: string;
	/** Canonical role id, as `positions.yaml` uses it. */
	role?: string;
	/** Canonical institution id, when the narrative names the body, not the post. */
	institution?: string;
	/** The instant the narrative asserts. Exact, never a range. */
	on: string;
	/** Why this reference is here, when it is not obvious from the claim. */
	note?: string;
}

/** A narrative claim that may declare references. */
export interface NarrativeClaim {
	/** Which file it came from, for the warning text. */
	file: string;
	/** The claim id, for the warning text. */
	id: string;
	/** Sources the claim cites; empty is legal for scaffolding kinds. */
	sources?: readonly string[];
	references?: NarrativeReference[] | null;
}

/** A canonical position, as the build resolves it. */
export interface CanonicalPosition {
	id: string;
	holder?: string;
	role?: string;
	institution?: string;
	start?: string | null;
	end?: string | null;
	sources?: readonly string[];
	interval?: {
		startEarliest?: number | null;
		startLatest?: number | null;
		endEarliest?: number | null;
		endLatest?: number | null;
		status?: string;
	} | null;
}

export interface ConsistencyIssue {
	/** `file [claim-id]` — the warning text must name both. */
	where: string;
	message: string;
}

export interface ConsistencyReport {
	errors: ConsistencyIssue[];
	warnings: ConsistencyIssue[];
}

const EXACT_DATE = /^\d{4}-\d{2}-\d{2}$/;

function whereOf(claim: NarrativeClaim): string {
	return `${claim.file} [${claim.id}]`;
}

/** The raw span of a position, for a message a human can act on. */
function spanOf(p: CanonicalPosition): string {
	if (p.interval && p.interval.startEarliest != null) {
		const to = (t: number | null | undefined) => (t == null ? '?' : new Date(t).toISOString().slice(0, 10));
		return `${to(p.interval.startEarliest)} → ${to(p.interval.endLatest ?? p.interval.endEarliest)}`;
	}
	return `${p.start ?? '?'} → ${p.end ?? '?'}`;
}

/** Does the canonical interval contain this instant? */
function covers(p: CanonicalPosition, at: number, cutoff: number): boolean {
	const i = p.interval;
	if (i && i.startEarliest != null) {
		const from = i.startEarliest;
		// An open end is bounded by the dataset cutoff: the graph asserts nothing
		// about a person still in post after the last date it measures.
		const to = i.endLatest ?? i.endEarliest ?? cutoff;
		return at >= from && at <= to;
	}
	// Fixtures and kinds that carry no resolved interval fall back to the raw
	// tokens, using a year's extent when only a year is known.
	const s = p.start ? Date.parse(/^\d{4}$/.test(p.start) ? `${p.start}-01-01` : p.start) : NaN;
	const e = p.end && p.end !== 'ongoing' && p.end !== '?'
		? Date.parse(/^\d{4}$/.test(p.end) ? `${p.end}-12-31` : p.end.replace(/^~/, ''))
		: cutoff;
	if (Number.isNaN(s)) return false;
	return at >= s && (Number.isNaN(e) ? true : at <= e);
}

/**
 * Compare every typed narrative reference with the canonical record.
 *
 * Returns errors (the build fails) and warnings (the build publishes). Neither
 * is ever derived from prose.
 */
export function checkNarrative(
	claims: readonly NarrativeClaim[],
	positions: readonly CanonicalPosition[],
	cutoff: number
): ConsistencyReport {
	const errors: ConsistencyIssue[] = [];
	const warnings: ConsistencyIssue[] = [];

	// Candidate positions, bucketed by `holder/role` so the common case is one
	// lookup rather than a scan per reference.
	const byHolder = new Map<string, CanonicalPosition[]>();
	for (const p of positions) {
		if (!p.holder) continue;
		byHolder.set(p.holder, [...(byHolder.get(p.holder) ?? []), p]);
	}

	for (const claim of claims) {
		const where = whereOf(claim);
		const refs = claim.references ?? [];

		if (!refs.length) {
			warnings.push({
				where,
				message:
					'no typed reference — this claim\u2019s prose is never parsed, so it is unchecked against the canonical record. If it names a person, role, institution or date, declare it under `references` (person, role, on).'
			});
			continue;
		}

		for (const ref of refs) {
			const label = [ref.person, ref.role ?? ref.institution].filter(Boolean).join('/');

			if (!EXACT_DATE.test(ref.on ?? '')) {
				errors.push({
					where,
					message: `reference ${label} has no exact date ("${ref.on ?? ''}") — a typed reference needs YYYY-MM-DD, because a range cannot be contradicted cleanly`
				});
				continue;
			}
			const at = Date.parse(`${ref.on}T00:00:00Z`);
			if (Number.isNaN(at)) {
				errors.push({ where, message: `reference ${label} on "${ref.on}" is not a calendar date` });
				continue;
			}

			const held = (byHolder.get(ref.person) ?? []).filter(
				(p) => (!ref.role || p.role === ref.role) && (!ref.institution || p.institution === ref.institution)
			);

			if (!held.length) {
				errors.push({
					where,
					message:
						`reference ${label} on ${ref.on} has no canonical record: positions.yaml holds no position ` +
						`for ${ref.person}${ref.role ? ` in ${ref.role}` : ''}. Declare the record, or fix the reference.`
				});
				continue;
			}

			const matched = held.filter((p) => covers(p, at, cutoff));
			if (!matched.length) {
				errors.push({
					where,
					message:
						`reference ${label} on ${ref.on} contradicts the canonical record: no position for ` +
						`${ref.person}${ref.role ? ` in ${ref.role}` : ''} covers that date ` +
						`(${held.map((p) => `${p.id} ${spanOf(p)}`).join('; ')})`
				});
				continue;
			}

			// The reference resolves. If the canonical record it leans on carries
			// no source, the assertion is still unsourced — a warning, because
			// `data/source-exceptions.yaml` exists to record exactly that case.
			const unsourced = matched.filter((p) => !(p.sources && p.sources.length));
			if (unsourced.length) {
				warnings.push({
					where,
					message:
						`reference ${label} on ${ref.on} resolves only against unsourced canonical record(s) ` +
						`${unsourced.map((p) => p.id).join(', ')}: the narrative cannot be stronger than the record under it.`
				});
			}
		}
	}

	return { errors, warnings };
}

/**
 * Count the claims that declare nothing, for a report line. Kept separate from
 * `checkNarrative` so a caller can summarise without re-deriving the checks.
 */
export function unreferencedCount(claims: readonly NarrativeClaim[]): number {
	return claims.filter((c) => !(c.references && c.references.length)).length;
}
