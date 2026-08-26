/**
 * Assertions over identity recovery.
 *
 * Implements section 8 of docs/identity-recovery.md. What is checked here is mostly
 * what must NEVER happen: a phrase reaching storage, a derived key being extractable,
 * or two derivation paths disagreeing about who somebody is. A bug in this file's
 * subject does not produce an error message — it produces a person who has lost their
 * identity and cannot be told why.
 */
import * as ed from '@noble/ed25519';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import {
	newPhrase,
	deriveFrom,
	fromSeed,
	isValidPhrase,
	normalisePhrase,
	unknownWords,
	toB64u
} from '../src/lib/agora/recovery.ts';
import { verifyAction, payloadOf, createIdentity, signAction } from '../community/identity.ts';

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

function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

console.log('\n  ── the phrase is generated, and its shape is the whole security argument ──\n');

{
	ok('the wordlist is 2048 words', wordlist.length === 2048, `${wordlist.length}`);

	const phrase = newPhrase();
	ok('a phrase is twelve words', phrase.split(' ').length === 12, phrase.split(' ').length + ' words');
	ok('every word comes from the list', unknownWords(phrase).length === 0);

	/*
	 * 128 bits is what makes the offline attack infeasible and is therefore what
	 * allows there to be no Argon2id in this design. If generation ever silently
	 * dropped to a smaller strength, nothing would break and every identity would
	 * become guessable — so the entropy is asserted rather than assumed.
	 */
	const many = new Set<string>();
	for (let i = 0; i < 200; i++) many.add(newPhrase());
	ok('two hundred phrases are two hundred different phrases', many.size === 200, `${many.size}`);

	const first = [...many].map((p) => p.split(' ')[0]);
	ok('the first word is not always the same', new Set(first).size > 50, `${new Set(first).size} distinct`);
}

console.log('\n  ── a mistyped word reports itself rather than deriving a stranger ──\n');

{
	const phrase = newPhrase();
	ok('a good phrase validates', isValidPhrase(phrase));
	ok('case and spacing are forgiven', isValidPhrase(`  ${phrase.toUpperCase()}  `.replace(/ /g, '   ')));

	/*
	 * The checksum catches most single-word typos, and it is important to be exact
	 * about "most".
	 *
	 * A twelve-word BIP-39 phrase carries 128 bits of entropy and a FOUR-bit
	 * checksum. So a wrong word is caught about fifteen times in sixteen — and the
	 * sixteenth time it validates and derives a different identity, which presents as
	 * "no history here" rather than as an error.
	 *
	 * That residual cannot be engineered away at this phrase length, and it is why
	 * the interface asks the person to confirm words back at generation time rather
	 * than relying on validation at recovery time. Asserted as a rate, because
	 * asserting it as a certainty made this test fail roughly one run in sixteen —
	 * which is exactly the property being described.
	 */
	const words = phrase.split(' ');
	let caught = 0;
	const tries = 160;
	for (let i = 0; i < tries; i++) {
		const swapped = [...words];
		const at = i % 12;
		let replacement = wordlist[Math.floor(Math.random() * wordlist.length)];
		while (replacement === swapped[at]) {
			replacement = wordlist[Math.floor(Math.random() * wordlist.length)];
		}
		swapped[at] = replacement;
		if (!isValidPhrase(swapped.join(' '))) caught++;
	}
	// Generous margin: the expectation is ~93.75%, and this must not be flaky.
	ok(
		'a wrong word is nearly always refused by the checksum',
		caught / tries > 0.85,
		`${caught}/${tries} caught`
	);

	ok('a word that is not in the list is named', unknownWords('zzzz ' + phrase)[0] === 'zzzz');
	ok('a truncated phrase is refused', !isValidPhrase(words.slice(0, 11).join(' ')));

	let threw = '';
	try {
		await deriveFrom(words.slice(0, 11).join(' '));
	} catch (e) {
		threw = (e as Error).message;
	}
	ok('deriving from a bad phrase throws rather than returning somebody', threw.length > 0, threw);
}

console.log('\n  ── same phrase, same identity, on any device and after any clearing ──\n');

{
	const phrase = newPhrase();
	const a = await deriveFrom(phrase);
	const b = await deriveFrom(phrase);
	ok('the same phrase derives the same identity', a.pubkey === b.pubkey, a.pubkey);

	// The reader retypes it with their own spacing and capitalisation.
	const messy = await deriveFrom(`  ${phrase.replace(/ /g, '  ').toUpperCase()} `);
	ok('and derives it again from a messily typed copy', messy.pubkey === a.pubkey);

	const other = await deriveFrom(newPhrase());
	ok('a different phrase derives a different identity', other.pubkey !== a.pubkey);

	/*
	 * Catches the single most dangerous possible bug in this file: a salt or info
	 * constant that is accidentally derived from nothing, making every phrase produce
	 * the same key. It would look like a working feature and would hand every user
	 * the same identity.
	 */
	const twenty = new Set<string>();
	for (let i = 0; i < 20; i++) twenty.add((await deriveFrom(newPhrase())).pubkey);
	ok('twenty phrases derive twenty identities', twenty.size === 20, `${twenty.size}`);
}

console.log('\n  ── the derived key is as unhandable as a minted one ──\n');

{
	const derived = await deriveFrom(newPhrase());
	ok('this engine gives a native key', derived.hard === true);
	ok('the key pair is present', Boolean(derived.keys?.privateKey));
	ok('the private key reports itself non-extractable', derived.keys!.privateKey.extractable === false);

	let exported = 'no';
	try {
		await crypto.subtle.exportKey('pkcs8', derived.keys!.privateKey);
		exported = 'yes';
	} catch {
		exported = 'refused';
	}
	ok('and the browser refuses to export it', exported === 'refused', exported);

	// The seed is only persisted on the fallback path, and this is not it.
	ok('no seed is retained on the native path', derived.seed === undefined);

	/*
	 * Every derived identity must carry something that can be WRITTEN DOWN.
	 *
	 * This is the invariant that broke, and it broke silently. `Identity` in
	 * agora.svelte.ts exposes only a signing closure, so a freshly minted one had
	 * nothing persistable on it — and the store happily wrote `{pubkey, tier}`, which
	 * loads back as nothing. The result was a new stranger on every page load, with
	 * no error anywhere: the app worked, and the person simply was not the same
	 * person twice. Types and a runtime guard now prevent it; this asserts the shape
	 * they depend on.
	 */
	for (const [what, d] of [
		['a phrase-derived identity', derived],
		['a seed-derived identity', await fromSeed(crypto.getRandomValues(new Uint8Array(32)))]
	] as const) {
		ok(`${what} carries key material that can be stored`, Boolean(d.keys || d.seed));
	}
}

console.log('\n  ── the server cannot tell a derived identity from a minted one ──\n');

{
	const phrase = newPhrase();
	const derived = await deriveFrom(phrase);

	// Exactly what agora.svelte.ts sends: a signature over the canonical payload.
	const unsigned = {
		pubkey: derived.pubkey,
		nonce: toB64u(crypto.getRandomValues(new Uint8Array(12))),
		issued_at: Date.now(),
		body: JSON.stringify({ path: '/api/whoami', data: {} })
	};
	const signature = toB64u(
		await derived.sign(new TextEncoder().encode(payloadOf(unsigned)))
	);

	let accepted = true;
	try {
		await verifyAction({ ...unsigned, signature }, Date.now(), () => false);
	} catch {
		accepted = false;
	}
	ok('the API accepts a signature from a recovered identity', accepted);

	// And a minted one still works, through the identical path.
	const minted = await createIdentity();
	const mintedAction = await signAction(minted.keys, minted.pubkey, 'anything');
	let mintedOk = true;
	try {
		await verifyAction(mintedAction, Date.now(), () => false);
	} catch {
		mintedOk = false;
	}
	ok('and one from a minted identity, through the same verifier', mintedOk);

	// A signature must not verify against somebody else's key.
	const impostor = await deriveFrom(newPhrase());
	let forged = false;
	try {
		await verifyAction({ ...unsigned, pubkey: impostor.pubkey, signature }, Date.now(), () => false);
		forged = true;
	} catch {
		forged = false;
	}
	ok('a recovered signature does not verify under another identity', !forged);
}

console.log('\n  ── the two signing paths agree about who you are ──\n');

{
	/*
	 * The fallback exists because roughly one browser in five has no WebCrypto
	 * Ed25519, and those are concentrated in the old Android WebViews this project's
	 * audience actually uses. If the two paths disagreed, a person moving between a
	 * new phone and an old one would arrive as two different people with the same
	 * phrase — and would have no way to understand why.
	 */
	const PKCS8_PREFIX = Uint8Array.from([
		0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
	]);
	const seed = crypto.getRandomValues(new Uint8Array(32));

	const noblePub = await ed.getPublicKeyAsync(seed);
	const wcPriv = await crypto.subtle.importKey(
		'pkcs8',
		concat(PKCS8_PREFIX, seed) as BufferSource,
		{ name: 'Ed25519' },
		true,
		['sign']
	);
	const jwk = (await crypto.subtle.exportKey('jwk', wcPriv)) as JsonWebKey;
	const wcPub = Uint8Array.from(
		atob(jwk.x!.replace(/-/g, '+').replace(/_/g, '/')),
		(c) => c.charCodeAt(0)
	);
	ok(
		'JS and WebCrypto derive the same public key from a seed',
		toB64u(noblePub) === toB64u(wcPub),
		toB64u(noblePub)
	);

	const msg = new TextEncoder().encode('deeptunisia');
	const wcSig = new Uint8Array(
		await crypto.subtle.sign({ name: 'Ed25519' }, wcPriv, msg as BufferSource)
	);
	ok('a WebCrypto signature verifies in JS', await ed.verifyAsync(wcSig, msg, noblePub));

	const jsSig = await ed.signAsync(msg, seed);
	const wcPubKey = await crypto.subtle.importKey(
		'raw',
		noblePub as BufferSource,
		{ name: 'Ed25519' },
		true,
		['verify']
	);
	ok(
		'and a JS signature verifies in WebCrypto',
		await crypto.subtle.verify({ name: 'Ed25519' }, wcPubKey, jsSig as BufferSource, msg as BufferSource)
	);

	const viaSeed = await fromSeed(seed);
	ok('fromSeed reaches the same identity', viaSeed.pubkey === toB64u(noblePub));
}

console.log('\n  ── the phrase does not survive derivation ──\n');

{
	/*
	 * Not a proof — JS gives no way to prove a string is unreachable. It asserts the
	 * part that IS assertable: the returned object carries no phrase, no entropy and
	 * nothing that could reconstruct them, so nothing downstream can persist one by
	 * accident. The real guarantee is that no caller passes it anywhere, which is
	 * enforced by there being no field for it here.
	 */
	const phrase = newPhrase();
	const derived = await deriveFrom(phrase);

	/*
	 * Scan the VALUES, not the whole serialisation.
	 *
	 * Scanning everything matched the object's own field names: `hard` is a key here
	 * and also a word in the BIP-39 list, so the check reported a leak roughly
	 * whenever a generated phrase happened to contain it. The field set is asserted
	 * separately below, which is the stronger guarantee anyway — none of those fields
	 * is capable of holding a phrase.
	 */
	const fields = Object.keys(derived).sort().join(',');
	ok('the derived identity exposes only a pubkey, a signer and a flag', fields === 'hard,keys,pubkey,sign', fields);

	const values = JSON.stringify(
		Object.values(derived).map((v) => (v instanceof Uint8Array ? [...v].join(',') : v))
	);
	const leaked = phrase.split(' ').filter((w) => values.includes(w));
	ok('and no phrase word survives in any of its values', leaked.length === 0, leaked.join(', '));
	ok('the phrase does not appear whole anywhere on it', !values.includes(phrase));

	ok('normalisation is stable', normalisePhrase('  A  b ') === 'a b');
}

console.log(
	failures
		? `\n  ${checks - failures}/${checks} checks passed, ${failures} FAILED\n`
		: `\n  ${checks}/${checks} checks passed\n`
);
process.exit(failures ? 1 : 0);
