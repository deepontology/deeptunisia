/**
 * Agora — the community layer, as a client of the same-origin API.
 *
 * The identity lives in this browser and nowhere else: an Ed25519 keypair,
 * non-extractable, in IndexedDB. It never reaches the server, which is why a leak
 * of the identities table lets an attacker impersonate nobody.
 *
 * WHAT THIS MODULE MUST NEVER CLAIM
 *
 * Anonymity. The edge receives an address on every clearnet connection, and a
 * pseudonym used for months leaks through its own writing — posting hours,
 * vocabulary, which of three languages, which people it cares about. No signature
 * scheme touches either. The interface says the true thing, including the
 * uncomfortable parts, because a person deciding whether it is safe to post
 * calibrates against what it tells them. See docs/anonymity-audit.md.
 */

import type { Capabilities } from '$lib/community';
import { deriveFrom } from '$lib/agora/recovery';

export interface Identity {
	pubkey: string;
	keys?: CryptoKeyPair;
	seed?: Uint8Array;
	tier: 'burn' | 'this-browser' | 'portable';
	sign: (payload: Uint8Array) => Promise<Uint8Array>;
}

const DB_NAME = 'deeptunisia-identity';
const STORE = 'keys';

function idb(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest) {
	return new Promise<any>((resolve) => {
		const open = indexedDB.open(DB_NAME, 1);
		open.onupgradeneeded = () => open.result.createObjectStore(STORE);
		open.onsuccess = () => {
			const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => resolve(null);
		};
		open.onerror = () => resolve(null);
	});
}

const b64u = (bytes: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

/** Non-extractable: the browser signs with it but will not hand it back. */
async function mint(): Promise<Identity> {
	const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const raw = await crypto.subtle.exportKey('raw', keys.publicKey);
	return {
		pubkey: b64u(raw),
		keys,
		tier: 'this-browser',
		sign: (payload) =>
			crypto.subtle
				.sign({ name: 'Ed25519' }, keys.privateKey, payload as BufferSource)
				.then((buf) => new Uint8Array(buf))
	};
}

/**
 * A throwaway identity for a single action.
 *
 * Forfeits history, which is the trade. It exists because a long-lived pseudonym
 * is deanonymisable from its own corpus, so somebody with one dangerous thing to
 * say should not have to choose between saying it and keeping everything else.
 */
export async function burnIdentity(): Promise<Identity> {
	const id = await mint();
	id.tier = 'burn';
	return id;
}

let cached: Identity | null = null;

/**
 * The browser's stored identity, WITHOUT minting one.
 *
 * Registration is implicit server-side: the first signed action creates the
 * row. That means a client that signs a read like whoami with a freshly-minted
 * key burns a write-side resource (an identity row and one unit of the
 * per-address identity budget) for a reader who may never post — and a
 * flooder can exhaust their own budget without ever writing anything. Reads
 * that answer "who am I" are answerable as "nobody, yet" when the browser
 * holds no identity, so they must not mint. Writes still go through
 * `identity()`, which mints on demand.
 */
export async function storedIdentity(): Promise<Identity | null> {
	if (cached) return cached;
	const stored = await idb('readonly', (s) => s.get('identity'));
	if (!stored) return null;
	if (stored.keys?.privateKey) {
		const id: Identity = {
			pubkey: stored.pubkey,
			keys: stored.keys,
			tier: stored.tier ?? 'this-browser',
			sign: (payload) =>
				crypto.subtle
					.sign({ name: 'Ed25519' }, stored.keys.privateKey, payload as BufferSource)
					.then((buf) => new Uint8Array(buf))
		};
		cached = id;
		agora.tier = id.tier;
		agora.hard = true;
		return cached;
	}
	if (stored.seed) {
		const { fromSeed } = await import('$lib/agora/recovery');
		const derived = await fromSeed(stored.seed);
		const id: Identity = {
			pubkey: stored.pubkey,
			seed: stored.seed,
			tier: 'portable',
			sign: derived.sign
		};
		cached = id;
		agora.tier = 'portable';
		agora.hard = false;
		return cached;
	}
	return null;
}

export async function identity(): Promise<Identity> {
	const existing = await storedIdentity();
	if (existing) return existing;
	const made = await mint();
	await idb('readwrite', (s) =>
		s.put({ pubkey: made.pubkey, keys: made.keys, tier: made.tier }, 'identity')
	);
	cached = made;
	agora.tier = made.tier;
	agora.hard = true;
	return made;
}

/**
 * The state the shell needs: who this browser is, and what it may do.
 *
 * `can` starts empty rather than permissive. Every capability check therefore
 * reads false until the server has answered, so a control that requires a
 * privilege is never briefly offered to someone who does not have it.
 */
export const agora = $state({
	/** Derived from the public key. Cannot be chosen, cannot collide, never hidden. */
	handle: '',
	/** Chosen. A claim, and rendered as one — see `agora/Author.svelte`. */
	name: null as string | null,
	/** Self-declared standing. Never checked. */
	note: null as string | null,
	trustLevel: 0,
	can: {} as Partial<Capabilities>,
	ready: false,
	/** True once a read or write has failed to reach the API at all. */
	offline: false,
	/** Burn = throwaway single-use; this-browser = minted, non-extractable, IndexedDB; portable = derived from a phrase. */
	tier: 'this-browser' as 'burn' | 'this-browser' | 'portable',
	/** True when the current identity's key is non-extractable (native Ed25519). False for the JS fallback. */
	hard: true
});

export interface ApiResult<T = any> {
	status: number;
	body: T;
}

/**
 * A signed write.
 *
 * The nonce and timestamp are inside the signed payload, and the payload includes
 * the path — a signature over a body alone can be replayed, and one that omits the
 * path can be lifted from a harmless endpoint onto a privileged one.
 */
export async function send<T = any>(
	path: string,
	data: unknown = {},
	as?: Identity
): Promise<ApiResult<T>> {
	const who = as ?? (await identity());
	const body = JSON.stringify({ path, data });
	const nonce = b64u(crypto.getRandomValues(new Uint8Array(12)));
	const issued_at = Date.now();
	const signature = b64u(
		await who.sign(new TextEncoder().encode(JSON.stringify({ pubkey: who.pubkey, nonce, issued_at, body })))
	);

	let res: Response;
	try {
		res = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: { pubkey: who.pubkey, nonce, issued_at, body, signature },
				data
			})
		});
	} catch {
		agora.offline = true;
		throw new OfflineError(path);
	}
	agora.offline = false;
	return { status: res.status, body: (await res.json()) as T };
}

/**
 * The API could not be reached at all — as distinct from the API answering with a
 * refusal.
 *
 * The two were collapsed: one `try/catch` in the route reported every failure as
 * "the community server is not running, try `npm run community`". A 500, a schema
 * mismatch and a genuine outage all produced the same sentence, so the one message
 * a reader could act on was the one they were least likely to be seeing. The
 * server's own refusals are written carefully and were being discarded.
 */
export class OfflineError extends Error {}

/** The API answered, and said no. `message` is the server's own wording. */
export class RefusedError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly retryAfterMs?: number
	) {
		super(message);
	}
}

/** Reads need no identity and are never throttled — see the API's comment on why. */
export async function read<T = any>(path: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(path);
	} catch {
		agora.offline = true;
		throw new OfflineError(path);
	}
	agora.offline = false;
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new RefusedError(body.error ?? `request failed (${res.status})`, res.status);
	}
	return (await res.json()) as T;
}

/**
 * Turn any thrown value into something worth showing a reader.
 *
 * Returns null for an offline failure, because that case has its own presentation:
 * it is a fact about the whole page rather than about the action attempted.
 */
export function messageFor(e: unknown): string | null {
	if (e instanceof OfflineError) return null;
	if (e instanceof RefusedError) return e.message;
	return e instanceof Error ? e.message : 'something went wrong';
}

export async function refreshIdentity() {
	try {
		/*
		 * A read must not mint. "Who am I" from a browser that holds no
		 * identity is answerable as "nobody, yet" — signing it with a freshly
		 * minted key would create an identity row and burn one unit of the
		 * per-address identity budget for a reader who may never post, and a
		 * flooder could exhaust their own budget without ever writing.
		 * (Caught by smoke: every fresh context on /agora minted for the
		 * whoami call and the 5/day/address limit tripped by the second pass.)
		 */
		const me = await storedIdentity();
		if (!me) {
			agora.handle = '';
			agora.name = null;
			agora.note = null;
			agora.trustLevel = 0;
			agora.can = {} as Partial<Capabilities>;
			agora.ready = true;
			return;
		}
		const r = await send('/api/whoami', {}, me);
		if (r.status === 200) {
			agora.handle = r.body.handle;
			agora.name = r.body.name ?? null;
			agora.note = r.body.note ?? null;
			agora.trustLevel = r.body.trust_level;
			agora.can = r.body.can;
		}
	} catch {
		// The community worker may not be running. The rest of the atlas does not
		// depend on it, and must not break because a discussion server is down.
	}
	agora.ready = true;
}

/**
 * Adopt a recovery phrase as this browser's identity.
 *
 * Mints a new portable identity derived from the phrase, abandons whatever the
 * browser held before (including history and trust level), and persists enough
 * material to reconstruct the signing key on reload. The phrase itself is never
 * stored — see docs/identity-recovery.md section 5.
 */
export async function adoptPhrase(raw: string): Promise<void> {
	const derived = await deriveFrom(raw);
	const id: Identity = {
		pubkey: derived.pubkey,
		keys: derived.keys,
		seed: derived.seed,
		tier: 'portable',
		sign: derived.sign
	};
	await idb('readwrite', (s) =>
		s.put({ pubkey: id.pubkey, keys: id.keys, seed: id.seed, tier: id.tier }, 'identity')
	);
	cached = id;
	agora.tier = 'portable';
	agora.hard = derived.hard;
	// Handle is derived server-side from the public key; refresh to pick up the new one.
	await refreshIdentity();
}

export const REPORT_REASONS = [
	'spam',
	'harassment',
	'hate',
	'manipulation',
	'misinformation',
	'off-topic',
	'duplicate',
	'illegal',
	'other'
] as const;

export const THREAD_KINDS = [
	'discussion',
	'question',
	'news',
	'investigation',
	'evidence',
	'correction',
	'opinion'
] as const;
