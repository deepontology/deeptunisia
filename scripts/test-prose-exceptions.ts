/**
 * Dated exceptions are a number and a deadline, never an open permission.
 *
 * Holds `scripts/prose-exceptions.ts` to the data: the count it states is the
 * count of roles with no `title_ar`, the ceiling it grants stays above the
 * ordinary one only until the date, and the date ends the exception to the day.
 * `scripts/build-data.ts` fails the build on the same two facts; this test fails
 * the suite when the exception is edited into something that no longer ends.
 *
 * The same rule decides the V33 `verified` exception in
 * `scripts/verified-exceptions.ts`, and it is tested here on fixed dates too:
 * a list with an id still in it expires the day after its date, and an empty
 * list expires nothing, so the mechanism can stay after its records are gone
 * without failing the build on a date that carries no exception.
 *
 * Usage: `npx tsx scripts/test-prose-exceptions.ts` (after `npm run data`)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARABIC_TITLE_EXCEPTION as X, arabicTitleExceptionActive } from './prose-exceptions.ts';
import { VERIFIED_EXCEPTIONS as V, verifiedExceptionsExpired } from './verified-exceptions.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
let failures = 0;
function ok(name: string, pass: boolean, detail = '') {
	checks++;
	if (pass) console.log(`  ok    ${name}${detail ? ` - ${detail}` : ''}`);
	else {
		failures++;
		console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
	}
}

const roles = (JSON.parse(readFileSync(join(ROOT, 'src/generated/dataset.json'), 'utf8')) as {
	roles: { id: string; title_ar?: string }[];
}).roles;
const missing = roles.filter((r) => !r.title_ar).length;

ok('the exception states the roles without title_ar', X.rolesWithoutTitleAr === missing, `${missing} of ${roles.length}`);
ok('the exception states the number of roles', X.rolesTotal === roles.length, String(roles.length));
ok('the ceiling it grants is above the ordinary one', X.ceiling > X.baseCeiling, `${X.ceiling} over ${X.baseCeiling}`);
ok('the expiry is a calendar date', /^\d{4}-\d{2}-\d{2}$/.test(X.expires) && !Number.isNaN(Date.parse(X.expires)), X.expires);
ok('the exception holds on its last day', arabicTitleExceptionActive(X.expires));
const next = new Date(Date.parse(X.expires) + 86_400_000).toISOString().slice(0, 10);
ok('the exception is over the day after', !arabicTitleExceptionActive(next), next);
ok('an exception with nothing left to translate has no reason to stay', missing > 0 || X.rolesWithoutTitleAr === 0);

// The V33 `verified` exception. One fixed id and the day after the date the
// exception states: the list decides, not the date.
{
	const dayAfter = new Date(Date.parse(V.expires) + 86_400_000).toISOString().slice(0, 10);
	ok('the verified exception states a calendar date', /^\d{4}-\d{2}-\d{2}$/.test(V.expires) && !Number.isNaN(Date.parse(V.expires)), V.expires);
	ok(
		'an empty verified exception does not expire the day after its date',
		!verifiedExceptionsExpired(dayAfter, [], V.expires),
		dayAfter
	);
	ok(
		'a verified exception with an id expires the day after its date',
		verifiedExceptionsExpired(dayAfter, ['person:example'], V.expires),
		dayAfter
	);
	ok(
		'a verified exception with an id holds on its last day',
		!verifiedExceptionsExpired(V.expires, ['person:example'], V.expires),
		V.expires
	);
	ok(
		'a verified exception with an id holds before its date',
		!verifiedExceptionsExpired('2026-01-01', ['person:example'], '2026-06-30')
	);
	ok(
		'an empty verified exception does not expire at any later date',
		!verifiedExceptionsExpired('2099-12-31', [], V.expires),
		'2099-12-31'
	);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
