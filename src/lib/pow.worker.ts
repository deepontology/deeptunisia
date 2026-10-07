/**
 * The proof-of-work solver, on its own thread.
 *
 * A study page must not load a script from another origin
 * (research/portal/README.md §8), so the bot check is a local hash puzzle: find
 * a nonce whose `sha256(salt + ':' + nonce)` starts with at least `difficulty`
 * zero bits. The search is CPU-bound and must never run on the main thread,
 * where it would freeze the question the respondent is reading.
 *
 * The protocol is one message in, one message out: `{ salt, difficulty }` to
 * `{ nonce }`. A module worker, so the same WebCrypto SHA-256 runs here and on
 * the server.
 */

/** The message the runner sends. */
interface Challenge {
	salt: string;
	difficulty: number;
}

/*
 * A module worker's own types come from the WebWorker lib, which cannot be
 * loaded beside DOM without a declaration conflict. The two globals actually
 * used are declared here, which keeps the rest of the file untouched.
 */
const scope = globalThis as unknown as {
	onmessage: ((event: MessageEvent<Challenge>) => void) | null;
	postMessage: (message: { nonce: number }) => void;
};

/** The number of leading zero bits in a digest: the proof-of-work score. */
function leadingZeroBits(bytes: Uint8Array): number {
	let bits = 0;
	for (const byte of bytes) {
		if (byte === 0) {
			bits += 8;
			continue;
		}
		bits += Math.clz32(byte) - 24;
		break;
	}
	return bits;
}

/*
 * Nonces are hashed in batches and each batch is awaited together, which keeps
 * the hashing pipeline full: one digest per await is mostly scheduling
 * overhead, and on a phone that is the difference between a fast solve and a
 * slow one.
 */
const BATCH = 64;

async function solve({ salt, difficulty }: Challenge): Promise<void> {
	const encoder = new TextEncoder();
	let nonce = 0;
	for (;;) {
		const batch: Promise<boolean>[] = [];
		for (let i = 0; i < BATCH; i++) {
			const candidate = nonce + i;
			batch.push(
				crypto.subtle
					.digest('SHA-256', encoder.encode(`${salt}:${candidate}`))
					.then((digest) => leadingZeroBits(new Uint8Array(digest)) >= difficulty)
			);
		}
		const found = await Promise.all(batch);
		const index = found.indexOf(true);
		if (index !== -1) {
			scope.postMessage({ nonce: nonce + index });
			return;
		}
		nonce += BATCH;
	}
}

scope.onmessage = (event) => {
	void solve(event.data);
};
