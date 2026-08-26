/**
 * Identity recovery — deriving a keypair from a phrase.
 *
 * Implements docs/identity-recovery.md. Portability and persistence are one problem:
 * a second device and a cleared browser both need the key rebuilt from something
 * that is not this browser's storage, and there is exactly one such thing here — a
 * phrase the person holds.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No server round trip, no escrow, no lookup identifier, no email. The server learns
 * nothing from this file and stores nothing new because of it. A phrase never leaves
 * the browser and is never written to storage; see `deriveFrom`.
 *
 * WHAT THIS DOES NOT DO, WHICH MATTERS MORE
 *
 * It does not make anyone anonymous, and it makes the corpus problem WORSE: an
 * identity that survives a cleared cache is an identity that accumulates a longer
 * writing sample, and a persistent pseudonym leaks through its own corpus no matter
 * how good the cryptography is. That is why this is opt-in and why burn mode stays.
 * See docs/anonymity-audit.md Finding 5.
 */
import { generateMnemonic, validateMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as ed from '@noble/ed25519';

/**
 * The phrase is GENERATED, never chosen, and this is the load-bearing decision.
 *
 * A public key is public, so anyone can attack every identity on the site at once
 * and entirely offline: guess a phrase, derive the keypair, compare the public key
 * against the ones the site displays. No rate limit exists in that attack because it
 * never touches the server.
 *
 * A human-chosen passphrase carries perhaps 20–30 bits of real entropy and falls in
 * hours. 128 bits does not fall. Because it does not, no key-stretching is needed —
 * which is why there is no Argon2id here despite docs/anon-identity.md specifying it.
 * Stretching exists to make weak secrets expensive to guess; a secret that cannot be
 * guessed does not need it.
 *
 * Do not add a "use your own passphrase" option. Offering both means most people
 * choose the weak one, and the weak one is not weak at the margin — it is broken.
 */
const STRENGTH_BITS = 128;

/**
 * English only, and not for the reason it looks like.
 *
 * BIP-39 has no Arabic wordlist, so a phrase in the site's primary language is not
 * available off the shelf at all. Beyond that, every additional wordlist is another
 * chance for a normalisation difference to silently derive a DIFFERENT key from what
 * the reader believes is the same phrase — and Arabic normalisation in particular is
 * full of ways for two identical-looking strings to differ in bytes. A recovery
 * phrase that silently stops working is worse than one in a second language.
 *
 * The instructions around it are translated. The words are not.
 */
const WORDS = wordlist;

/** Domain separation, so this phrase can never derive this key under another scheme. */
const HKDF_SALT = new TextEncoder().encode('deeptunisia/identity');
const HKDF_INFO = new TextEncoder().encode('ed25519/v1');

/**
 * The DER preamble that turns 32 raw seed bytes into a PKCS#8 Ed25519 private key
 * (RFC 8410). WebCrypto has no "import a raw seed" form, and this is the shortest
 * standard path to one.
 */
const PKCS8_PREFIX = Uint8Array.from([
	0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
]);

function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

export function toB64u(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/*
 * noble needs a SHA-512 and ships none, so it takes one. WebCrypto's is used rather
 * than a second library: SHA-512 is universally available even on the engines that
 * lack Ed25519, which is precisely the case this fallback exists for.
 */
ed.hashes.sha512Async = async (...msgs: Uint8Array[]) =>
	new Uint8Array(await crypto.subtle.digest('SHA-512', concat(...msgs) as BufferSource));

/** A fresh phrase. Shown once, stored nowhere. */
export function newPhrase(): string {
	return generateMnemonic(WORDS, STRENGTH_BITS);
}

/**
 * Whitespace and case are forgiven; a wrong word is not.
 *
 * The checksum inside a BIP-39 phrase is what makes a typo report itself rather than
 * silently deriving a different identity and presenting it as "no history found",
 * which is the failure people would misread as data loss.
 */
export function normalisePhrase(raw: string): string {
	return raw.normalize('NFKD').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function isValidPhrase(raw: string): boolean {
	try {
		return validateMnemonic(normalisePhrase(raw), WORDS);
	} catch {
		return false;
	}
}

/** Which words are not in the list at all — so the interface can point at one. */
export function unknownWords(raw: string): string[] {
	const set = new Set(WORDS);
	return normalisePhrase(raw)
		.split(' ')
		.filter((w) => w.length > 0 && !set.has(w));
}

/** Whether this engine can hold a key the browser refuses to hand back. */
export async function hasNativeEd25519(): Promise<boolean> {
	try {
		await crypto.subtle.importKey(
			'pkcs8',
			concat(PKCS8_PREFIX, new Uint8Array(32)) as BufferSource,
			{ name: 'Ed25519' },
			false,
			['sign']
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * What a derived identity can do, without exposing how.
 *
 * `sign` is a closure rather than a key on a field so that on the fallback path the
 * seed is captured and unreachable rather than sitting on an object any other module
 * could read.
 */
export interface Derived {
	pubkey: string;
	sign(payload: Uint8Array): Promise<Uint8Array>;
	/** Native key, non-extractable. False when signing happens in JS — see below. */
	hard: boolean;
	/** Present only when `hard` is false, because that path has to persist it. */
	seed?: Uint8Array;
	keys?: CryptoKeyPair;
}

async function seedToSigner(seed: Uint8Array): Promise<Derived> {
	// noble derives the public key. WebCrypto cannot: importKey('pkcs8') yields only
	// a private CryptoKey, and a private JWK needs `x` — the public key — which is
	// the thing being derived. This one scalar multiplication is the whole reason
	// there is a crypto dependency in this project at all.
	const pub = await ed.getPublicKeyAsync(seed);
	const pubkey = toB64u(pub);

	if (await hasNativeEd25519()) {
		const privateKey = await crypto.subtle.importKey(
			'pkcs8',
			concat(PKCS8_PREFIX, seed) as BufferSource,
			{ name: 'Ed25519' },
			// Non-extractable, exactly like a minted key. Recovery does NOT cost the
			// browser's refusal to hand the key back — the phrase is the backup, the
			// key is not, and those are different things.
			false,
			['sign']
		);
		const publicKey = await crypto.subtle.importKey(
			'raw',
			pub as BufferSource,
			{ name: 'Ed25519' },
			true,
			['verify']
		);
		return {
			pubkey,
			hard: true,
			keys: { privateKey, publicKey },
			sign: async (payload) =>
				new Uint8Array(
					await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, payload as BufferSource)
				)
		};
	}

	/*
	 * No native Ed25519 — sign in JS instead of refusing to work.
	 *
	 * This is roughly one browser in five, concentrated in the old Android WebViews
	 * that are disproportionately this project's audience, so the alternative is not
	 * "weaker security" but "cannot participate at all".
	 *
	 * It IS weaker, and the interface must say so rather than quietly applying it: a
	 * key in JS memory is extractable by definition, and the seed has to be persisted
	 * because there is no CryptoKey to store instead. See docs/identity-recovery.md.
	 */
	return {
		pubkey,
		hard: false,
		seed,
		sign: async (payload) => ed.signAsync(payload, seed)
	};
}

/**
 * Phrase → identity.
 *
 * The phrase and the entropy are wiped before returning. They are not stored, not
 * logged, not put in a reactive store and never sent anywhere — a recovery phrase
 * that reaches the server is an escrowed identity, which is the design this file
 * exists to avoid.
 */
export async function deriveFrom(raw: string): Promise<Derived> {
	const phrase = normalisePhrase(raw);
	if (!validateMnemonic(phrase, WORDS)) {
		throw new Error('that phrase is not one of ours — check for a mistyped word');
	}

	const entropy = mnemonicToEntropy(phrase, WORDS);
	try {
		const ikm = await crypto.subtle.importKey('raw', entropy as BufferSource, 'HKDF', false, [
			'deriveBits'
		]);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT as BufferSource, info: HKDF_INFO as BufferSource },
			ikm,
			256
		);
		return await seedToSigner(new Uint8Array(bits));
	} finally {
		entropy.fill(0);
	}
}

/** Derive straight from a stored seed, for the fallback path only. */
export async function fromSeed(seed: Uint8Array): Promise<Derived> {
	return seedToSigner(seed);
}

/**
 * Solve a proof-of-work challenge.
 *
 * Only ever runs for an identity the server says owes one — after tripping the
 * honeypot, posting a duplicate, or writing faster than a person reads. Somebody who
 * has done none of those never reaches this function, which is the entire point:
 * proof of work is regressive, and a farm has more CPU than the old handset this site
 * is for.
 *
 * Yields to the event loop periodically. A tight hash loop freezes the tab, and a
 * frozen tab on a slow phone is indistinguishable from a crash — so the person being
 * asked to pay a few seconds would instead believe the site had died.
 */
export async function solveProofOfWork(
	challenge: string,
	difficulty: number,
	signal?: AbortSignal
): Promise<string> {
	const enc = new TextEncoder();
	for (let i = 0; ; i++) {
		if (signal?.aborted) throw new Error('proof of work cancelled');
		const candidate = String(i);
		const digest = new Uint8Array(
			await crypto.subtle.digest('SHA-256', enc.encode(`${challenge}:${candidate}`) as BufferSource)
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
		if (zeros >= difficulty) return candidate;
		if (i % 512 === 511) await new Promise((r) => setTimeout(r, 0));
	}
}
