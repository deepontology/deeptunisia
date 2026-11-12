/**
 * The validator register: one entry per numbered validator, its status, its
 * gate, and the code that enforces it.
 *
 * This file is the single place that says whether a numbered rule runs. The
 * header of `scripts/schema.ts` points here instead of restating a range, and
 * `scripts/test-paper.ts` checks this register against the paper's Appendix A
 * and against the enforcing files. A rule that is only specified is recorded
 * as `specified`; it is never called enforced because the number exists.
 */

export type ValidatorStatus = 'enforced' | 'specified' | 'reserved';
export type ValidatorGate = 'fail' | 'warn' | 'fail-or-warn' | 'none';

export interface ValidatorEntry {
	/** The published id, for example `V12`. */
	id: string;
	/** One line naming the rule, not its implementation history. */
	rule: string;
	status: ValidatorStatus;
	gate: ValidatorGate;
	/** Required when status is `enforced`: the file and a string in it. */
	site?: { file: string; anchor: string };
}

export const VALIDATOR_REGISTER: ValidatorEntry[] = [
	{
		id: 'V1',
		rule: 'ownership shares on all ownership edges sum to 100 percent or less per company and interval window',
		status: 'specified',
		gate: 'none'
	},
	{
		id: 'V2',
		rule: 'company capital and registration dates agree with the institution active period',
		status: 'specified',
		gate: 'none'
	},
	{
		id: 'V3',
		rule: 'company registration numbers are valid and unique',
		status: 'specified',
		gate: 'none'
	},
	{
		id: 'V4',
		rule: 'a contract award value is attributed or backed by a tier-1 or tier-2 source',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'award.value must be attributed or backed by a primary source' }
	},
	{
		id: 'V5',
		rule: 'a contract award value with neither attribution nor a tier-1 or tier-2 source fails the build',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'award.value must be attributed or backed by a primary source' }
	},
	{
		id: 'V6',
		rule: 'duplicate companies are detected by name similarity across Arabic, French and English',
		status: 'specified',
		gate: 'none'
	},
	{
		id: 'V7',
		rule: 'a person on two overlapping board edges is flagged as a conflict of interest',
		status: 'specified',
		gate: 'none'
	},
	{
		id: 'V8',
		rule: 'a cause cannot begin after its consequence, and a causal cycle fails',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'causal cycle:' }
	},
	{
		id: 'V9',
		rule: 'an influence-family edge needs a position or a documented edge on one endpoint',
		status: 'enforced',
		gate: 'fail-or-warn',
		site: { file: 'scripts/build-data.ts', anchor: 'is unmoored' }
	},
	{
		id: 'V10',
		rule: 'a place parent chain terminates at a region and point places carry coordinates',
		status: 'enforced',
		gate: 'fail-or-warn',
		site: { file: 'scripts/build-data.ts', anchor: 'every place needs a parent region/governorate' }
	},
	{
		id: 'V11',
		rule: 'events with no participants, organisations or documents are orphaned',
		status: 'specified',
		gate: 'none'
	},
	{
		id: 'V12',
		rule: 'every claim record cites a source or holds a live exception',
		status: 'enforced',
		gate: 'fail',
		site: {
			file: 'scripts/build-data.ts',
			anchor: 'every claim record must cite at least one source, or be listed in data/source-exceptions.yaml'
		}
	},
	{
		id: 'V13',
		rule: 'finance metadata only on funding, sponsorship or ownership, and equity percentages are in bounds',
		status: 'enforced',
		gate: 'fail',
		site: {
			file: 'scripts/schema.ts',
			anchor: 'finance metadata is allowed only on funding, sponsorship and ownership edges (V13)'
		}
	},
	{
		id: 'V14',
		rule: 'directed edge endpoints have the kinds fixed by the ontology',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'is directed: "from" must be a person' }
	},
	{
		id: 'V15',
		rule: 'an interval may not end before it begins',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'node_modules/deepepisteme/src/kernel/time.ts', anchor: 'Interval ends before it begins' }
	},
	{
		id: 'V16',
		rule: 'duplicate relationships on the same key with overlapping intervals fail',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'with an overlapping interval' }
	},
	{
		id: 'V17',
		rule: 'a rupture event not linked into the causal graph is flagged',
		status: 'enforced',
		gate: 'warn',
		site: { file: 'scripts/build-data.ts', anchor: 'not linked into the causal graph (V17)' }
	},
	{
		id: 'V18',
		rule: 'an inferred claim states its reasoning and a falsifier',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'an inferred claim must state its reasoning and what would falsify it' }
	},
	{
		id: 'V19',
		rule: 'strict schemas reject an undeclared key',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'export const ReviewSchema = z.strictObject({' }
	},
	{
		id: 'V20',
		rule: 'grade C and D claims name who makes the claim',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'grade C/D claims must name who is making the claim' }
	},
	{
		id: 'V21',
		rule: 'date tokens follow the grammar and are calendar-valid',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'date token must be YYYY, YYYY-MM, YYYY-MM-DD' }
	},
	{
		id: 'V22',
		rule: 'an interval contradiction fails unless disputed, and every clamp is published',
		status: 'enforced',
		gate: 'fail-or-warn',
		site: { file: 'scripts/build-data.ts', anchor: 'allowEnvelopeTrim: (pos.disputes?.length ?? 0) > 0' }
	},
	{
		id: 'V23',
		rule: 'review dates are calendar-valid, methods are an enum, and a gazette claim must be supported',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'review date must be a calendar-valid date' }
	},
	{
		id: 'V24',
		rule: 'succession thresholds are published and the counts recompute from them',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/test-data.ts', anchor: 'V24: succession gaps reproducible from the emitted constants' }
	},
	{
		id: 'V25',
		rule: 'a grade A claim cites a tier-1 or tier-2 source or holds a live exception',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'grade A must cite at least one tier-1 or tier-2 source (V25)' }
	},
	{
		id: 'V26',
		rule: 'source relation, independence count and basis cannot contradict each other',
		status: 'enforced',
		gate: 'fail-or-warn',
		site: {
			file: 'scripts/schema.ts',
			anchor: 'source_relation requires independence: how many independent origins carry this claim? (V26)'
		}
	},
	{
		id: 'V27',
		rule: 'an authored basis stronger than the grade needs review, reasoning, falsifier, source and reason',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'a basis override requires basis_override_reason' }
	},
	{
		id: 'V28',
		rule: 'undeclared keys in a claim record and its nested objects fail',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'const intervalSpec = z.strictObject({' }
	},
	{
		id: 'V29',
		rule: 'evidence needs a passage, locator, retrieval date and a real capture or a dated retry',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/schema.ts', anchor: 'capture_url must be an actual snapshot' }
	},
	{
		id: 'V30',
		rule: 'grade B corroboration needs two sources or an attribution',
		status: 'reserved',
		gate: 'none'
	},
	{
		id: 'V31',
		rule: 'no record interval begins or ends past the research cutoff',
		status: 'enforced',
		gate: 'fail',
		site: { file: 'scripts/build-data.ts', anchor: 'past the research cutoff' }
	},
	{
		id: 'V32',
		rule: 'a vacancy names a known non-seated role and does not overlap a holder',
		status: 'enforced',
		gate: 'fail',
		site: {
			file: 'scripts/build-data.ts',
			anchor: 'is a seated term, which has no single holder to be vacant'
		}
	}
];

/** The register keyed by id, for callers that look one rule up. */
export const validatorById = new Map(VALIDATOR_REGISTER.map((v) => [v.id, v]));
