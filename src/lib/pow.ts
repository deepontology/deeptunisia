/**
 * The first-party bot check, client side.
 *
 * Fetches the challenge the API issues for a study and solves it in a module
 * worker, so the main thread stays free while the respondent reads. Every
 * failure — no API, a study not fielding, a worker that cannot start — resolves
 * null, and the submission goes out without a proof; the server then answers
 * the same 403 it uses for every failed challenge, and nothing here is trusted
 * either way.
 */
export interface ProofOfWork {
	salt: string;
	difficulty: number;
	expires: number;
	sig: string;
	nonce: number;
}

interface Challenge {
	salt: string;
	difficulty: number;
	expires: number;
	sig: string;
}

/** Fetch a challenge for the study and solve it; null when unavailable. */
export async function startProofOfWork(slug: string): Promise<ProofOfWork | null> {
	let challenge: Challenge;
	try {
		const res = await fetch(`/api/studies/${slug}/challenge`);
		if (!res.ok) return null;
		const body = (await res.json()) as Partial<Challenge>;
		if (
			typeof body.salt !== 'string' ||
			typeof body.difficulty !== 'number' ||
			typeof body.expires !== 'number' ||
			typeof body.sig !== 'string'
		) {
			return null;
		}
		challenge = { salt: body.salt, difficulty: body.difficulty, expires: body.expires, sig: body.sig };
	} catch {
		return null;
	}
	const nonce = await solve(challenge.salt, challenge.difficulty);
	return nonce === null ? null : { ...challenge, nonce };
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
