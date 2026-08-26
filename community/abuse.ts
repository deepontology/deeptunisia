/**
 * Anti-abuse layers beyond rate limiting.
 *
 * Section 13 of the spec: do not rely on one mechanism, and do not make a CAPTCHA
 * the default experience. The objective is not to make automated abuse impossible —
 * it is to make it expensive enough not to be worth doing, while a normal person
 * posting anonymously notices nothing.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No CAPTCHA. No browser fingerprinting. No "suspicious device" scoring. Each of
 * those either identifies the user, degrades the experience for everyone, or both —
 * and the people this site is for are exactly the ones who arrive on old phones,
 * through Tor, with JavaScript restricted. A defence that filters them out has
 * removed the audience rather than the abuse.
 *
 * Everything here is checked server-side. A client-side check is a suggestion.
 */

export class AbuseError extends Error {}

/**
 * A honeypot field: present in the form, invisible and unlabelled to a human,
 * irresistible to anything filling every input it finds.
 *
 * Cheap, silent, and it costs a real user nothing. It catches the low end of
 * automation, which is most of it.
 */
export function checkHoneypot(data: Record<string, unknown>): void {
	const trap = data.website ?? data.email ?? data.url_confirm;
	if (typeof trap === 'string' && trap.trim().length > 0) {
		throw new AbuseError('this submission looks automated');
	}
}

/**
 * Content that is the same thing again.
 *
 * Normalised so that whitespace and case changes do not evade it — the usual
 * trick for making the same advert look like twenty different posts. Compared
 * against what the identity recently wrote, not globally: two people
 * independently writing "yes" is not abuse, one person writing it forty times is.
 */
export function normaliseForDuplicates(body: string): string {
	return body
		.toLowerCase()
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function isDuplicate(body: string, recent: string[]): boolean {
	const now = normaliseForDuplicates(body);
	if (now.length < 12) return false; // "thanks" twice is not an attack
	return recent.some((prev) => normaliseForDuplicates(prev) === now);
}

/**
 * Posting faster than a person reads.
 *
 * Distinct from the hourly rate limit, which allows a burst inside its window.
 * This is the floor between two consecutive actions: a human composing a sentence
 * about a decree does not submit twice in the same second.
 */
export const MIN_INTERVAL_MS = 4_000;

export function checkInterval(lastPostAt: number | null, now: number): void {
	if (lastPostAt === null) return;
	const gap = now - lastPostAt;
	if (gap < MIN_INTERVAL_MS) {
		throw new AbuseError(`slow down — wait ${Math.ceil((MIN_INTERVAL_MS - gap) / 1000)}s`);
	}
}

/**
 * A proof-of-work challenge, applied only when something already looks wrong.
 *
 * Never for everybody. Proof of work is regressive: a bot farm has more CPU than
 * the person on a six-year-old phone this site exists to serve, so charging
 * everyone the same makes the honest user pay more in real terms. It is only
 * worth using as a cost imposed on an identity that has already tripped something
 * else — where the point is to make repeating it tedious.
 *
 * The client must find a nonce whose hash of `${challenge}:${nonce}` begins with
 * `difficulty` zero bits.
 */
export function makeChallenge(): string {
	return [...crypto.getRandomValues(new Uint8Array(16))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function verifyProofOfWork(
	challenge: string,
	nonce: string,
	difficulty: number
): Promise<void> {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${nonce}`))
	);
	let zeros = 0;
	for (const byte of digest) {
		if (byte === 0) {
			zeros += 8;
			continue;
		}
		zeros += Math.clz32(byte) - 24;
		break;
	}
	if (zeros < difficulty) throw new AbuseError('proof of work is insufficient');
}

/**
 * How many links a body carries.
 *
 * Only the ceiling lives here. WHETHER an identity may post links at all is a
 * capability question answered by trust level, and it belongs with the other
 * capability checks so that it returns "forbidden" rather than "you are being
 * throttled" — an identity told to slow down will try again, and an identity told
 * it lacks a permission will not. Conflating the two produced exactly that: a
 * permission refusal arriving as a 429.
 */
export const MAX_LINKS = 5;

export function countLinks(body: string): number {
	return body.match(/https?:\/\//gi)?.length ?? 0;
}

export function checkLinkCount(body: string): void {
	if (countLinks(body) > MAX_LINKS) throw new AbuseError(`too many links — at most ${MAX_LINKS}`);
}
