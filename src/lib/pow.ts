/**
 * The first-party bot check, client side.
 *
 * Fetches the challenge the API issues for a study and solves it in a module
 * worker, so the main thread stays free while the respondent reads. Every
 * failure — no API, a study not fielding, a worker that cannot start — resolves
 * with proof null, and the submission goes out without a proof; the server then
 * answers the same 403 it uses for every failed challenge, and nothing here is
 * trusted either way.
 */
export interface ProofOfWork {
	salt: string;
	difficulty: number;
	expires: number;
	sig: string;
	nonce: number;
}

/**
 * What the background check hands back: the solved proof of work (null when it
 * could not be solved) and, only while the operator has the human check switched
 * on, the public site key that renders its widget. The site key is not a secret;
 * the challenge sends it only when the server is also verifying tokens, and it
 * is null whenever the check is off.
 */
export interface BotCheck {
	proof: ProofOfWork | null;
	turnstileSiteKey: string | null;
}

interface Challenge {
	salt: string;
	difficulty: number;
	expires: number;
	sig: string;
	turnstileSiteKey?: string;
}

/** Fetch a challenge for the study and solve it. Never throws; a failure arrives as an empty check. */
export async function startProofOfWork(slug: string): Promise<BotCheck> {
	let turnstileSiteKey: string | null = null;
	let challenge: Challenge;
	try {
		const res = await fetch(`/api/studies/${slug}/challenge`);
		if (!res.ok) return { proof: null, turnstileSiteKey };
		const body = (await res.json()) as Partial<Challenge>;
		if (
			typeof body.salt !== 'string' ||
			typeof body.difficulty !== 'number' ||
			typeof body.expires !== 'number' ||
			typeof body.sig !== 'string'
		) {
			return { proof: null, turnstileSiteKey };
		}
		challenge = { salt: body.salt, difficulty: body.difficulty, expires: body.expires, sig: body.sig };
		if (typeof body.turnstileSiteKey === 'string') turnstileSiteKey = body.turnstileSiteKey;
	} catch {
		return { proof: null, turnstileSiteKey };
	}
	const nonce = await solve(challenge.salt, challenge.difficulty);
	return { proof: nonce === null ? null : { ...challenge, nonce }, turnstileSiteKey };
}

/** Run one solve in a fresh worker; null if the worker cannot be created. */
function solve(salt: string, difficulty: number): Promise<number | null> {
	return new Promise((resolve) => {
		let worker: Worker;
		try {
			worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
		} catch {
			resolve(null);
			return;
		}
		worker.onmessage = (event: MessageEvent<{ nonce?: unknown }>) => {
			const nonce = event.data?.nonce;
			worker.terminate();
			resolve(typeof nonce === 'number' ? nonce : null);
		};
		// A worker that fails to load posts an error rather than a nonce; the
		// submission proceeds without a proof and the server decides.
		worker.onerror = () => {
			worker.terminate();
			resolve(null);
		};
		worker.postMessage({ salt, difficulty });
	});
}
