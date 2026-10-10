/**
 * Assertions over the runtime research contract: the hash, the compiler and the
 * submission validator in community/research-contract.ts.
 *
 * This module is the only thing both the build and the deployed API trust, so
 * what is tested here is that it cannot drift: the hash is pinned against a
 * fixture value (a change to the implementation or the canonical projection
 * fails here rather than silently invalidating every declared hash), the real
 * draft instrument compiles to what its registry entry says, and the
 * submission validator accepts exactly what a respondent may send and refuses
 * everything else with the code the interface will render.
 *
 * Usage: `npx tsx scripts/test-research-contract.ts`
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
	compileInstrument,
	computeInstrumentHash,
	validateSubmission,
	type InstrumentDocument,
	type RuntimeInstrument
} from '../community/research-contract.ts';
import { InstrumentSchema } from './research-schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = '') {
	checks++;
	if (condition) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

// ---------------------------------------------------------------------------
// Fixture instrument — every response type the validator knows plus one auto
// item, so each rule can be exercised alone. The MaxDiff rules live on a
// separate compiled instrument so a payload for the plain one stays plain.
// Structural input only: compileInstrument takes a parsed document, not a Zod
// value (contract §2).
// ---------------------------------------------------------------------------

const fixtureDoc = (withMaxdiff: boolean, maxdiffStatus = 'generated'): InstrumentDocument => ({
	instrument: {
		id: 'it-fixture',
		study: 'dt-fixture',
		version: '1.0.0',
		source_locale: 'en',
		locales: ['en', 'fr', 'ar'],
		estimated_minutes: 5,
		completion_target_minutes_max: 15
	},
	modules: [
		{
			id: 'mod-1',
			label: 'Fixture module',
			items: ['consent_fix', 'scale_fix', 'agree_fix', 'choice_fix', 'multi_fix', 'text_fix', 'auto_fix']
		}
	],
	items: [
		{
			id: 'consent_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'consent',
			required: true,
			text_en: 'I consent.',
			text_fr: null,
			text_ar: null
		},
		{
			id: 'scale_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'scale_0_10',
			required: true,
			text_en: 'Scale from 0 to 10.',
			text_fr: null,
			text_ar: null
		},
		{
			id: 'agree_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'agree_4',
			required: true,
			text_en: 'Agree from 1 to 4.',
			text_fr: null,
			text_ar: null
		},
		{
			id: 'choice_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'single_choice',
			required: false,
			text_en: 'Pick one.',
			text_fr: null,
			text_ar: null,
			options: ['alpha', 'beta']
		},
		{
			id: 'multi_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'multi_choice',
			required: false,
			text_en: 'Pick any.',
			text_fr: null,
			text_ar: null,
			options: ['alpha', 'beta', 'gamma']
		},
		{
			id: 'text_fix',
			module: 'mod-1',
			tier: 'extended',
			response: 'text_short',
			required: false,
			text_en: 'Say something.',
			text_fr: null,
			text_ar: null,
			max_chars: 40
		},
		{
			id: 'auto_fix',
			module: 'mod-1',
			tier: 'core',
			response: 'auto',
			required: true,
			text_en: null,
			text_fr: null,
			text_ar: null
		}
	],
	maxdiff_priority: withMaxdiff
		? {
				id: 'maxdiff_fixture',
				items_per_set: 4,
				sets: 2,
				pool: ['md_a', 'md_b', 'md_c', 'md_d', 'md_e', 'md_f', 'md_g', 'md_h'],
				design: {
					status: maxdiffStatus,
					// A generated fixture carries two sets so duplicate-set and
					// per-set membership rules can be exercised; a to-generate
					// fixture carries none, as the real draft does.
					sets:
						maxdiffStatus === 'generated'
							? [
									{ id: 'mds1', items: ['md_a', 'md_b', 'md_c', 'md_d'] },
									{ id: 'mds2', items: ['md_e', 'md_f', 'md_g', 'md_h'] }
								]
							: undefined
				},
				instruction_en: 'Pick the most and the least.',
				text_fr: null,
				text_ar: null
			}
		: null,
	gap_block: null,
	experiments: []
});

const fixtureInstrument: RuntimeInstrument = compileInstrument(fixtureDoc(false));
const maxdiffInstrument: RuntimeInstrument = compileInstrument(fixtureDoc(true));
// The same block, still waiting on its design: the state the draft instrument
// is in until the freeze step generates it.
const ungeneratedMaxdiffInstrument: RuntimeInstrument = compileInstrument(fixtureDoc(true, 'to-generate'));

const payload = (over: Record<string, unknown> = {}) => ({
	instrumentHash: fixtureInstrument.hash,
	locale: 'en',
	channel: 'test',
	consentVersion: 'consent-v1',
	startedAt: 1_000,
	completionMs: 60_000,
	answers: { consent_fix: true, scale_fix: 7 },
	...over
});

/** Refuse AND prove why: a fixture failing for the wrong reason tests nothing. */
function rejectsCode(instrument: RuntimeInstrument, payloadValue: unknown, name: string, code: string) {
	const result = validateSubmission(instrument, payloadValue);
	ok(
		name,
		!result.ok && result.code === code,
		result.ok ? 'accepted — expected rejection' : (result as { code: string }).code
	);
}

// ---------------------------------------------------------------------------
// Hash — same input, same hash; changed text, changed hash
// ---------------------------------------------------------------------------

console.log('\n  ── instrument hash ──\n');

{
	// The implementation pin. This value was produced by the current sha256 and
	// canonical projection for the document below and cross-checked against
	// node:crypto. If this test fails, either the projection or the hash
	// implementation changed — both are contract changes (§2), so re-pin only
	// deliberately, and re-freeze every instrument that declares a hash.
	const pinDoc = {
		instrument: {
			id: 'pin',
			study: 'pin-study',
			version: '0.0.0',
			source_locale: 'en',
			locales: ['en'],
			estimated_minutes: 1,
			completion_target_minutes_max: 2
		},
		modules: [],
		items: [],
		maxdiff_priority: null,
		gap_block: null,
		experiments: []
	} as InstrumentDocument;
	ok(
		'hash: the implementation matches its pin',
		computeInstrumentHash(pinDoc) === 'a1dc02b793939cb107eafeb63f2091052ef5ff69f0fec65935fed6bfd67dc20a'
	);

	const doc = fixtureDoc(false);
	const hash = computeInstrumentHash(doc);
	ok('hash: the same document hashes identically twice', computeInstrumentHash(fixtureDoc(false)) === hash);
	ok('hash: a changed item text moves the hash',
		computeInstrumentHash({
			...doc,
			items: doc.items.map((it) => (it.id === 'scale_fix' ? { ...it, text_en: 'Different words.' } : it))
		}) !== hash
	);
	ok('hash: a changed response type moves the hash',
		computeInstrumentHash({
			...doc,
			items: doc.items.map((it) => (it.id === 'choice_fix' ? { ...it, response: 'multi_choice' } : it))
		}) !== hash
	);
	// The generated sets are instrument content: what the respondent was shown.
	// Reordering the items inside one set has to move the hash.
	const maxdiffDoc = fixtureDoc(true);
	const reorderedSet: InstrumentDocument = {
		...maxdiffDoc,
		maxdiff_priority: {
			...maxdiffDoc.maxdiff_priority!,
			design: {
				...maxdiffDoc.maxdiff_priority!.design,
				sets: [
					{ id: 'mds1', items: ['md_b', 'md_a', 'md_c', 'md_d'] },
					{ id: 'mds2', items: ['md_e', 'md_f', 'md_g', 'md_h'] }
				]
			}
		}
	};
	ok(
		'hash: changing a MaxDiff set moves the hash',
		computeInstrumentHash(reorderedSet) !== computeInstrumentHash(maxdiffDoc)
	);
	// Excluded by construction (contract §2): translation, per-item notes,
	// instrument status and content_hash. They are not part of the document type,
	// which is itself the exclusion — cast in only to prove they cannot leak in.
	const withNoise = {
		...doc,
		instrument: { ...doc.instrument, status: 'frozen', content_hash: 'f'.repeat(64) },
		items: doc.items.map((it) => ({ ...it, notes: 'a process note' })),
		translation: { policy: 'a policy', report: 'report.md', locales: {} }
	} as unknown as InstrumentDocument;
	ok('hash: status, content_hash, notes and translation are excluded', computeInstrumentHash(withNoise) === hash);
}

// ---------------------------------------------------------------------------
// The real draft instrument compiles to what the registry says it is
// ---------------------------------------------------------------------------

console.log('\n  ── the real draft instrument ──\n');

const WORKSHOP = join(ROOT, 'research', 'portal', 'study-001', 'instrument-v0.yaml');
const REGISTRY = join(ROOT, 'src', 'generated', 'studies.json');
if (!existsSync(WORKSHOP) || !existsSync(REGISTRY)) {
	ok('draft: the workshop instrument and the built registry are present', false, 'run `npm run data` first');
} else {
	const parsed = InstrumentSchema.safeParse(parseYaml(readFileSync(WORKSHOP, 'utf8')));
	ok('draft: the draft parses under the instrument schema', parsed.success);
	if (parsed.success) {
		const compiled = compileInstrument(parsed.data);
		ok('draft: identity', compiled.id === 'dt001-democracy' && compiled.version === '0.1.0-draft' && compiled.study === 'dt-research-001');
		ok('draft: locales carried through', compiled.sourceLocale === 'en' && compiled.locales.join(',') === 'en,fr,ar');
		ok('draft: the compiled hash is the projection hash', compiled.hash === computeInstrumentHash(parsed.data));
		const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as {
			instruments: Record<string, { hash: string }>;
		};
		ok(
			'draft: the compiled hash matches the built registry entry',
			registry.instruments['dt001-democracy@0.1.0-draft']?.hash === compiled.hash
		);
		ok('draft: 60 items, three platform-recorded', compiled.items.length === 60 && compiled.items.filter((i) => !i.displayed).length === 3);
		ok('draft: auto items are never displayed', compiled.items.filter((i) => i.response === 'auto').every((i) => !i.displayed));
		ok('draft: four consent items, all required', compiled.items.filter((i) => i.response === 'consent').length === 4 && compiled.items.filter((i) => i.response === 'consent').every((i) => i.required));
		ok(
			'draft: the MaxDiff design is generated with eight sets',
			compiled.maxdiff !== null &&
				compiled.maxdiff.setCount === 8 &&
				compiled.maxdiff.sets.length === 8 &&
				compiled.maxdiff.designStatus === 'generated'
		);
		ok('draft: the gap block is carried', compiled.gap !== null && compiled.gap.response === 'scale_present' && compiled.gap.items.length === 12);
		ok('draft: two experiments carried', compiled.experiments.length === 2);

		// The real design is generated now, so a submission that omits the block
		// is refused as incomplete; the to-generate waiver does not apply to it.
		const anyPayload = {
			instrumentHash: compiled.hash,
			locale: 'en',
			channel: 'test',
			consentVersion: 'v1',
			startedAt: 1,
			completionMs: 1,
			answers: {
				consent_read: true,
				consent_voluntary: true,
				consent_withdrawal: true,
				consent_age: true
			}
		};
		const result = validateSubmission(compiled, anyPayload);
		ok('draft: a submission without the block is refused', !result.ok && result.code === 'invalid-maxdiff');

		// A complete block is accepted and comes back normalized, ready to store.
		const fullMaxdiff = compiled.maxdiff!.sets.map((s) => ({
			set: s.id,
			most: s.items[0],
			least: s.items[1]
		}));
		const withBlock = validateSubmission(compiled, { ...anyPayload, maxdiff: fullMaxdiff });
		ok(
			'draft: a complete block is accepted with normalized choices',
			withBlock.ok &&
				withBlock.maxdiff !== null &&
				withBlock.maxdiff.length === 8 &&
				withBlock.maxdiff[0].set === compiled.maxdiff!.sets[0].id &&
				withBlock.maxdiff[0].most === compiled.maxdiff!.sets[0].items[0]
		);
	}
}

// ---------------------------------------------------------------------------
// validateSubmission — what a respondent may send
// ---------------------------------------------------------------------------

console.log('\n  ── submission validation: accepted ──\n');

{
	const result = validateSubmission(fixtureInstrument, payload());
	ok('a complete submission is accepted', result.ok);
	if (result.ok) {
		ok('the accepted answers are exactly the keys sent', Object.keys(result.answers).join(',') === 'consent_fix,scale_fix');
	}
	const sparse = validateSubmission(fixtureInstrument, payload({ answers: { consent_fix: true, scale_fix: null, choice_fix: null } }));
	ok('an explicit null is a skip and is allowed', sparse.ok);
	const everything = validateSubmission(
		fixtureInstrument,
		payload({
			answers: {
				consent_fix: true,
				scale_fix: 0,
				agree_fix: 4,
				choice_fix: 'beta',
				multi_fix: ['alpha', 'gamma'],
				text_fix: 'x'.repeat(40)
			}
		})
	);
	ok('every boundary value is accepted (0, 4, exact max_chars)', everything.ok);
	const maxdiffOk = validateSubmission(
		maxdiffInstrument,
		{
			...payload(),
			instrumentHash: maxdiffInstrument.hash,
			maxdiff: [
				{ set: 'mds1', most: 'md_a', least: 'md_b' },
				{ set: 'mds2', most: 'md_e', least: 'md_f' }
			]
		}
	);
	ok('a generated MaxDiff design accepts one entry per set id', maxdiffOk.ok);
	ok(
		'the compiled MaxDiff carries setCount and the sets',
		maxdiffInstrument.maxdiff?.setCount === 2 && maxdiffInstrument.maxdiff?.sets.length === 2
	);
}

console.log('\n  ── submission validation: refused ──\n');

{
	const reject = (over: Record<string, unknown>, name: string, code: string) =>
		rejectsCode(fixtureInstrument, payload(over), name, code);
	reject({ instrumentHash: '0'.repeat(64) }, 'a stale instrument hash is refused', 'hash-mismatch');
	reject({ locale: 'de' }, 'an undeclared locale is refused', 'locale-not-declared');
	reject({ channel: 'BAD CHANNEL' }, 'a channel outside the pattern is refused', 'bad-channel');
	reject({ channel: '' }, 'an empty channel is refused', 'bad-channel');
	reject({ channel: 'x'.repeat(33) }, 'a channel over 32 characters is refused', 'bad-channel');
	reject({ consentVersion: '   ' }, 'a blank consent version is refused', 'bad-consent-version');
	reject({ startedAt: 'recently' }, 'a non-numeric startedAt is refused', 'bad-timestamp');
	reject({ completionMs: Number.NaN }, 'a non-finite completionMs is refused', 'bad-completion');
	reject({ answers: [true, 7] }, 'an answers array is refused', 'bad-answers');

	reject({ answers: { consent_fix: true, scale_fix: 7, no_such_item: 3 } }, 'an unknown item id is refused', 'unknown-item');
	reject({ answers: { consent_fix: true, auto_fix: 'en' } }, 'an auto item can never be submitted', 'unknown-item');
	reject({ answers: { consent_fix: true, scale_fix: 11 } }, 'a scale value above 10 is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, scale_fix: -1 } }, 'a scale value below 0 is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, agree_fix: 5 } }, 'an agree_4 value above 4 is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, agree_fix: '3' } }, 'a string for agree_4 is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, agree_fix: 2.5 } }, 'a non-integer for agree_4 is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, choice_fix: 'gamma' } }, 'an undeclared single_choice option is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, multi_fix: ['alpha', 'zeta'] } }, 'an undeclared multi_choice option is refused', 'invalid-answer');
	reject({ answers: { consent_fix: true, text_fix: 'x'.repeat(41) } }, 'text over max_chars is refused', 'invalid-answer');
	reject({ answers: { scale_fix: 7 } }, 'a missing consent item is refused', 'missing-consent');
	reject({ answers: { consent_fix: false, scale_fix: 7 } }, 'a consent item answered false is refused', 'consent-not-given');
	reject({ answers: { consent_fix: 'yes', scale_fix: 7 } }, 'a non-boolean consent answer is refused', 'consent-not-given');

	const rejectMaxdiff = (maxdiff: unknown, name: string, code: string) =>
		rejectsCode(
			maxdiffInstrument,
			{ ...payload(), instrumentHash: maxdiffInstrument.hash, maxdiff },
			name,
			code
		);
	rejectMaxdiff(undefined, 'a generated design requires the block', 'invalid-maxdiff');
	rejectMaxdiff(
		[{ set: 'mds1', most: 'md_a', least: 'md_b' }],
		'maxdiff missing a set entry is refused',
		'invalid-maxdiff'
	);
	rejectMaxdiff(
		[
			{ set: 'mds1', most: 'md_a', least: 'md_b' },
			{ set: 'mds9', most: 'md_e', least: 'md_f' }
		],
		'a set id the instrument does not declare is refused',
		'invalid-maxdiff'
	);
	rejectMaxdiff(
		[
			{ set: 'mds1', most: 'md_e', least: 'md_b' },
			{ set: 'mds2', most: 'md_e', least: 'md_f' }
		],
		'a most outside its set is refused',
		'invalid-maxdiff'
	);
	rejectMaxdiff(
		[
			{ set: 'mds1', most: 'md_a', least: 'md_f' },
			{ set: 'mds2', most: 'md_e', least: 'md_f' }
		],
		'a least outside its set is refused',
		'invalid-maxdiff'
	);
	rejectMaxdiff(
		[
			{ set: 'mds1', most: 'md_a', least: 'md_a' },
			{ set: 'mds2', most: 'md_e', least: 'md_f' }
		],
		'maxdiff most equal to least is refused',
		'invalid-maxdiff'
	);
	rejectMaxdiff(
		[
			{ set: 'mds1', most: 'md_a', least: 'md_b' },
			{ set: 'mds1', most: 'md_c', least: 'md_d' }
		],
		'a repeated set id is refused',
		'invalid-maxdiff'
	);
}

console.log('\n  ── the MaxDiff design gate ──\n');

{
	// Strict, the only production mode: a `to-generate` design refuses every
	// submission, whether or not the payload carries a block. This is the state
	// the real draft instrument is in.
	rejectsCode(
		ungeneratedMaxdiffInstrument,
		{ ...payload(), instrumentHash: ungeneratedMaxdiffInstrument.hash },
		'a to-generate design is refused without the dev option',
		'maxdiff-not-generated'
	);

	// Local dev only: community/server.ts passes the option from
	// RESEARCH_DEV_STUDY. The runner has no block to render, so a payload that
	// omits it is accepted and no MaxDiff requirement applies.
	const omitted = validateSubmission(
		ungeneratedMaxdiffInstrument,
		{ ...payload(), instrumentHash: ungeneratedMaxdiffInstrument.hash },
		{ allowMissingMaxdiff: true }
	);
	ok(
		'allowMissingMaxdiff accepts a payload that omits the block',
		omitted.ok,
		omitted.ok ? '' : omitted.code
	);

	// The option does not make an ungenerated design scoreable: a supplied block
	// is still refused, exactly as it is with the option absent.
	const supplied = validateSubmission(
		ungeneratedMaxdiffInstrument,
		{
			...payload(),
			instrumentHash: ungeneratedMaxdiffInstrument.hash,
			maxdiff: [{ set: 0, most: 'md_a', least: 'md_b' }]
		},
		{ allowMissingMaxdiff: true }
	);
	ok(
		'allowMissingMaxdiff still refuses a supplied block on a to-generate design',
		!supplied.ok && supplied.code === 'maxdiff-not-generated',
		supplied.ok ? 'accepted when a rejection was expected' : supplied.code
	);
}

console.log(
	`\n  ${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}\n`
);
process.exit(failures > 0 ? 1 : 0);
