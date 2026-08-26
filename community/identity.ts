/**
 * Pseudonymous identity.
 *
 * Phase 2.1 of docs/community-sprint.md, implementing the design in
 * docs/anon-identity.md.
 *
 * WHAT THIS IS FOR
 *
 * People posting here are writing about named Tunisian officials under a law that
 * carries ten years when the target is one. The design goal is therefore not
 * convenience: it is that the server holds nothing worth taking. A leak of the
 * identities table must expose public keys and counters and let an attacker
 * impersonate nobody.
 *
 * WHAT IT CANNOT DO, WHICH MATTERS MORE THAN WHAT IT CAN
 *
 * It does not make anyone anonymous. The edge receives an IP on every clearnet
 * connection, and a pseudonym used over months leaks through its own corpus —
 * posting hours, vocabulary, which of three languages, which people it cares about.
 * No signature scheme touches either. The word "absolute" must never appear in the
 * interface; `docs/anonymity-audit.md` carries the wording that may.
 *
 * Ed25519 rather than a server-issued token: a token is a bearer secret the server
 * must store, and storing something that can impersonate a user is exactly what this
 * is trying to avoid.
 */

/** What the server keeps. Note what is absent: no IP, no user agent, no last-seen. */
export interface Identity {
	pubkey: string;
	created_at: number;
	trust_level: number;
	posts_count: number;
	reports_upheld: number;
	reports_rejected: number;
	prs_accepted: number;
	banned_at: number | null;
	banned_reason: string | null;
}

/**
 * A signed action.
 *
 * The nonce and timestamp are inside the signed payload, not beside it: a signature
 * over the body alone can be replayed by anyone who observed it once.
 */
export interface SignedAction {
	pubkey: string;
	nonce: string;
	issued_at: number;
	body: string;
	signature: string;
}

export class IdentityError extends Error {}

const enc = new TextEncoder();

/** Base64url without padding — safe in URLs, headers and JSON alike. */
export function toB64u(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(text: string): Uint8Array {
	const padded = text.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * The handle shown beside a post.
 *
 * Derived from the public key, so it cannot be claimed by anyone else and there is no
 * vanity namespace to fight over. A user may set a display name instead; that is a
 * deliberate act, and the interface says plainly that a chosen name is a correlation
 * risk they are accepting.
 *
 * Collision safety (spec §15.1): the handle was once the first 3 bytes of the digest
 * (24 bits), whose birthday bound puts a 50% collision at ~4,096 identities — false
 * for a community whose whole point is that one key cannot speak for another. It is
 * now the first 12 bytes (96 bits): 16 base64url characters, birthday bound ~2^48
 * identities. A mint-time uniqueness check is unnecessary at this width (the bound
 * is astronomically beyond any plausible population), and the 100k-mint test in
 * test-api.ts pins it empirically.
 */
export async function handleFor(pubkey: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', enc.encode(pubkey));
	return 'anon-' + toB64u(new Uint8Array(digest).slice(0, 12)).toLowerCase().slice(0, 16);
}

/** Generate a keypair. The private key never leaves the browser. */
export async function createIdentity(): Promise<{ pubkey: string; keys: CryptoKeyPair }> {
	const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const raw = await crypto.subtle.exportKey('raw', keys.publicKey);
	return { pubkey: toB64u(new Uint8Array(raw)), keys };
}

/** The exact bytes that get signed. Both sides must build this identically. */
export function payloadOf(action: Omit<SignedAction, 'signature'>): string {
	return JSON.stringify({
		pubkey: action.pubkey,
		nonce: action.nonce,
		issued_at: action.issued_at,
		body: action.body
	});
}

export async function signAction(
	keys: CryptoKeyPair,
	pubkey: string,
	body: string
): Promise<SignedAction> {
	const unsigned = {
		pubkey,
		nonce: toB64u(crypto.getRandomValues(new Uint8Array(12))),
		issued_at: Date.now(),
		body
	};
	const sig = await crypto.subtle.sign(
		{ name: 'Ed25519' },
		keys.privateKey,
		enc.encode(payloadOf(unsigned))
	);
	return { ...unsigned, signature: toB64u(new Uint8Array(sig)) };
}

/** How far out of step a client's clock may be before its actions are refused. */
export const MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * Verify a signed action.
 *
 * `seen` is the replay guard: a nonce that has been accepted once must never be
 * accepted again. Signature verification alone does not prevent replay, and a
 * replayed vote or report is a free extra vote or report.
 */
export async function verifyAction(
	action: SignedAction,
	now: number,
	seen: (nonce: string) => boolean | Promise<boolean>
): Promise<void> {
	if (!action.pubkey || !action.signature || !action.nonce) {
		throw new IdentityError('action is missing pubkey, nonce or signature');
	}
	if (Math.abs(now - action.issued_at) > MAX_SKEW_MS) {
		throw new IdentityError('action is stale or its clock is far out of step');
	}
	if (await seen(action.nonce)) {
		throw new IdentityError('nonce already used — this action is a replay');
	}

	let key: CryptoKey;
	try {
		key = await crypto.subtle.importKey(
			'raw',
			fromB64u(action.pubkey) as BufferSource,
			{ name: 'Ed25519' },
			false,
			['verify']
		);
	} catch {
		throw new IdentityError('public key is not a valid Ed25519 key');
	}

	const ok = await crypto.subtle.verify(
		{ name: 'Ed25519' },
		key,
		fromB64u(action.signature) as BufferSource,
		enc.encode(payloadOf(action))
	);
	if (!ok) throw new IdentityError('signature does not match');
}

/**
 * Trust levels, from Discourse by way of docs/prior-art.md.
 *
 * Banning a key is trivial and so is minting a new one, so ban evasion cannot be
 * prevented — it can only be made worthless. A returning user comes back at level 0,
 * where they post slowly, cannot open threads, cannot post links and cannot propose
 * graph changes. That is the whole anti-abuse story, and it is cheap.
 *
 * Level 3 is never reached automatically. An automatic path to moderation privileges
 * is a path a patient adversary walks.
 */
export const TRUST = {
	NEW: 0,
	BASIC: 1,
	ESTABLISHED: 2,
	TRUSTED: 3
} as const;

export interface Capabilities {
	comment: boolean;
	vote: boolean;
	report: boolean;
	createThread: boolean;
	postLinks: boolean;
	createPr: boolean;
	moderate: boolean;
	commentsPerHour: number;
	threadsPerDay: number;
}

/**
 * A chosen name, and what a reader is allowed to conclude from it.
 *
 * THE RULE THAT MAKES THIS SAFE
 *
 * A display name NEVER replaces the derived handle. `publicAuthor` used to return
 * `display_name ?? handleFor(pubkey)`, which meant setting your name to `anon-dp5d`
 * impersonated that person outright, and setting it to "DeepTunisia Moderator"
 * borrowed the project's own authority. Both are one field update away, from any
 * identity, at trust level zero.
 *
 * The handle is derived from a public key: it cannot be claimed by anyone else and
 * two identities can never share one. The name is a claim. So both are shown, always,
 * and the interface never lets the claim stand where the verifiable thing belongs —
 * which is the same rule the graph applies to `basis`, at the identity layer.
 *
 * Everything below is therefore about making impersonation impossible rather than
 * merely against the rules.
 */

/**
 * Characters that can make one string render as another.
 *
 * The bidi controls are the ones that matter here and would be easy to miss: this
 * interface is Arabic-first and RTL by default, and an embedded override can reverse
 * how a name displays without changing a byte of what is stored. Zero-width
 * characters let two visually identical names coexist, which is the whole mechanism
 * of an impersonation.
 */
const INVISIBLE = new RegExp(
	'[' +
		'\u0000-\u001F\u007F' + // control characters
		'\u00AD' + // soft hyphen
		'\u200B-\u200F' + // zero-width space and joiners, LRM, RLM
		'\u202A-\u202E' + // bidi embedding and override
		'\u2060-\u2064' + // word joiner, invisible operators
		'\u2066-\u2069' + // bidi isolates
		'\uFEFF' + // zero-width no-break space
		']'
);

/**
 * Words a self-chosen label may not contain, in the three scripts this site serves.
 *
 * Not a profanity filter — it is specifically about names that assert a standing the
 * project would be understood to have granted. "Journalist" is fine and is the whole
 * point of the feature; "verified journalist" is not, because the only thing that
 * could verify it is us.
 */
const RESERVED = [
	'moderator',
	'admin',
	'administrator',
	'official',
	'verified',
	'staff',
	'deeptunisia',
	'deep tunisia',
	'modérateur',
	'vérifié',
	'officiel',
	'مشرف',
	'إدارة',
	'موثق',
	'رسمي'
];

export const MAX_NAME = 40;
export const MAX_NOTE = 60;

/**
 * Validate a chosen name or self-description.
 *
 * Returns the normalised value, or throws with a reason the interface can show
 * verbatim. `null` clears the field and is always allowed — a person must be able to
 * stop being anybody at no cost.
 */
export function cleanLabel(
	raw: unknown,
	kind: 'name' | 'note'
): string | null {
	if (raw === null || raw === undefined || raw === '') return null;
	if (typeof raw !== 'string') throw new IdentityError('that is not a name');

	// Compose first: two different byte sequences that render identically must not be
	// two different names.
	const value = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (!value) return null;

	const max = kind === 'name' ? MAX_NAME : MAX_NOTE;
	if (value.length > max) throw new IdentityError(`keep this to ${max} characters`);
	if (INVISIBLE.test(value)) {
		throw new IdentityError('that contains invisible or direction-changing characters');
	}
	// Something has to be readable in it. A name of pure punctuation is indistinguishable
	// from every other name of pure punctuation.
	if (!/\p{L}|\p{N}/u.test(value)) throw new IdentityError('that needs at least one letter');

	const folded = value.toLowerCase();
	if (kind === 'name' && folded.startsWith('anon-')) {
		throw new IdentityError('names beginning "anon-" are the automatic handles — pick another');
	}
	for (const word of RESERVED) {
		if (folded.includes(word)) {
			throw new IdentityError(`"${word}" would suggest this site vouches for you, and it cannot`);
		}
	}
	return value;
}

export function capabilitiesFor(identity: Pick<Identity, 'trust_level' | 'banned_at'>): Capabilities {
	if (identity.banned_at) {
		return {
			comment: false,
			vote: false,
			report: false,
			createThread: false,
			postLinks: false,
			createPr: false,
			moderate: false,
			commentsPerHour: 0,
			threadsPerDay: 0
		};
	}
	const level = identity.trust_level;
	return {
		comment: true,
		vote: true,
		report: true,
		/*
		 * A new identity may open one thread a day.
		 *
		 * It could open none, which made the forum impossible to start: promotion to
		 * BASIC needs five posts, posts need a thread, and on a new site there are no
		 * threads. Every identity is level 0 on day one, so the rule that was meant to
		 * cost a returning banned user something instead guaranteed an empty room —
		 * and the refusal said "new identities cannot open threads yet", which reads
		 * as a wait when nothing was going to change.
		 *
		 * One a day still does the job it was there for. Ban evasion cannot be
		 * prevented, only made worthless, and an adversary willing to mint a key per
		 * thread is already paying more than the thread is worth to them.
		 */
		createThread: true,
		postLinks: level >= TRUST.BASIC,
		createPr: level >= TRUST.ESTABLISHED,
		moderate: level >= TRUST.TRUSTED,
		commentsPerHour: level >= TRUST.ESTABLISHED ? 60 : level >= TRUST.BASIC ? 20 : 5,
		threadsPerDay: level >= TRUST.ESTABLISHED ? 20 : level >= TRUST.BASIC ? 5 : 1
	};
}

/**
 * Promotion, evaluated on write.
 *
 * Deliberately not time-only: an identity that sat idle for a month has demonstrated
 * nothing. Level 3 is absent because it is granted by a human or not at all.
 */
export function earnedLevel(identity: Identity, now: number): number {
	if (identity.banned_at) return TRUST.NEW;
	const ageDays = (now - identity.created_at) / 86_400_000;

	if (
		identity.trust_level >= TRUST.BASIC &&
		ageDays >= 14 &&
		identity.posts_count >= 20 &&
		identity.reports_upheld === 0 &&
		(identity.prs_accepted > 0 || identity.posts_count >= 50)
	) {
		return Math.max(identity.trust_level, TRUST.ESTABLISHED);
	}
	if (ageDays >= 2 && identity.posts_count >= 5 && identity.reports_upheld === 0) {
		return Math.max(identity.trust_level, TRUST.BASIC);
	}
	return identity.trust_level;
}
