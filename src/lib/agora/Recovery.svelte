<script lang="ts">
	/**
	 * Keeping an identity, and moving it to another device.
	 *
	 * Implements section 5 of docs/identity-recovery.md. Portability and persistence
	 * are one problem — a second device and a cleared browser both need the key
	 * rebuilt from something that is not this browser's storage — and a phrase is the
	 * only such thing here that does not involve a server holding a secret.
	 *
	 * THE THINGS THIS INTERFACE MUST NOT DO
	 *
	 * Call it a backup, or an account. It is neither: these words ARE the identity,
	 * and a person who thinks of them as a backup will treat losing them as
	 * recoverable.
	 *
	 * Offer to remember the phrase. Nothing here writes it anywhere, puts it in a URL
	 * or sends it — a phrase that reaches the server is an escrowed identity.
	 *
	 * Present continuity as free. It costs safety: an identity that survives a cleared
	 * cache accumulates a longer writing sample, and a corpus identifies a person no
	 * matter how good the cryptography is. That sentence is in the flow, not in a
	 * footnote, because someone deciding this needs it before deciding.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Input from '$lib/ui/Input.svelte';
	import { agora, adoptPhrase } from '$lib/agora.svelte';
	import { newPhrase, isValidPhrase, unknownWords } from '$lib/agora/recovery';
	import { t } from '$lib/t.svelte';

	interface Props {
		/** Called once the identity has changed, so a host panel can react. */
		onadopted?: () => void;
	}

	let { onadopted }: Props = $props();

	type Stage = 'idle' | 'showing' | 'confirming' | 'done' | 'restoring';
	let stage = $state<Stage>('idle');

	/*
	 * The phrase lives in this component and nowhere else, for as long as the person
	 * is looking at it. `reset()` clears it, and every exit from the flow goes through
	 * `reset()` rather than merely changing stage.
	 */
	let phrase = $state('');
	let checkAt = $state<number[]>([]);
	let answers = $state<string[]>(['', '', '']);
	let typed = $state('');
	let error = $state('');
	let busy = $state(false);

	const words = $derived(phrase ? phrase.split(' ') : []);
	const confirmed = $derived(
		checkAt.length === 3 &&
			checkAt.every((at, i) => answers[i].trim().toLowerCase() === words[at])
	);

	function reset() {
		phrase = '';
		answers = ['', '', ''];
		checkAt = [];
		typed = '';
		error = '';
		stage = 'idle';
	}

	function begin() {
		phrase = newPhrase();
		/*
		 * Three words at named positions, not the whole phrase.
		 *
		 * Asking for all twelve teaches people to paste it somewhere they can copy
		 * from — which manufactures exactly the written-down artefact that is the
		 * riskiest part of this feature. Three is enough to prove they have it.
		 */
		const picked = new Set<number>();
		while (picked.size < 3) picked.add(Math.floor(Math.random() * 12));
		checkAt = [...picked].sort((a, b) => a - b);
		answers = ['', '', ''];
		error = '';
		stage = 'showing';
	}

	async function keep() {
		busy = true;
		error = '';
		try {
			await adoptPhrase(phrase);
			// Wipe before the stage change, so the words are gone the instant they
			// stop being needed rather than whenever this component unmounts.
			phrase = '';
			answers = ['', '', ''];
			stage = 'done';
			onadopted?.();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function restore() {
		busy = true;
		error = '';
		try {
			const unknown = unknownWords(typed);
			if (unknown.length) {
				error = t('agora.recovery.unknownword').replace('{word}', unknown[0]);
				return;
			}
			if (!isValidPhrase(typed)) {
				error = t('agora.recovery.badphrase');
				return;
			}
			await adoptPhrase(typed);
			typed = '';
			stage = 'done';
			onadopted?.();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="recovery">
	<h4>{t('agora.recovery.title')}</h4>

	<!--
		What this browser currently is, stated before any offer to change it. Somebody
		about to write something dangerous needs to know whether it will attach to a
		history that survives.
	-->
	<p class="tier" class:portable={agora.tier === 'portable'}>
		{agora.tier === 'portable' ? t('agora.recovery.isportable') : t('agora.recovery.isbrowser')}
	</p>

	{#if !agora.hard}
		<!--
			Roughly one browser in five has no WebCrypto Ed25519, and those are the old
			Android WebViews this project's audience actually uses. Signing happens in
			JS instead, which works but means the key is readable by any script that
			gets in. Stated rather than quietly applied.
		-->
		<p class="soft">{t('agora.recovery.softkey')}</p>
	{/if}

	{#if stage === 'idle'}
		<!--
			The two states describe different situations and must not share a sentence.
			`cost` says "clearing your browsing data destroys this", which is true of a
			browser-held identity and flatly false of a portable one — showing it to
			somebody who already has a phrase contradicts the line directly above it.
		-->
		<p class="cost">
			{agora.tier === 'portable' ? t('agora.recovery.already') : t('agora.recovery.cost')}
		</p>
		<div class="actions">
			{#if agora.tier !== 'portable'}
				<Button variant="solid" onclick={begin}>{t('agora.recovery.begin')}</Button>
			{/if}
			<Button variant="ghost" onclick={() => ((error = ''), (stage = 'restoring'))}>
				{t('agora.recovery.haveone')}
			</Button>
		</div>
	{:else if stage === 'showing'}
		<p class="lede">{t('agora.recovery.showlede')}</p>
		<ol class="words">
			{#each words as word, i}
				<li><span class="n">{i + 1}</span>{word}</li>
			{/each}
		</ol>
		<p class="warn">{t('agora.recovery.showwarn')}</p>
		<div class="actions">
			<Button variant="solid" onclick={() => (stage = 'confirming')}>
				{t('agora.recovery.wroteit')}
			</Button>
			<Button variant="ghost" onclick={reset}>{t('agora.cancel')}</Button>
		</div>
	{:else if stage === 'confirming'}
		<p class="lede">{t('agora.recovery.checklede')}</p>
		<div class="checks">
			{#each checkAt as at, i}
				<Field label={t('agora.recovery.wordn').replace('{n}', String(at + 1))}>
					<Input bind:value={answers[i]} size="md" mono autocomplete="off" spellcheck={false} />
				</Field>
			{/each}
		</div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="actions">
			<Button variant="solid" onclick={keep} disabled={!confirmed || busy}>
				{t('agora.recovery.keep')}
			</Button>
			<Button variant="ghost" onclick={() => (stage = 'showing')}>
				{t('agora.recovery.showagain')}
			</Button>
			<Button variant="ghost" onclick={reset}>{t('agora.cancel')}</Button>
		</div>
	{:else if stage === 'restoring'}
		<p class="lede">{t('agora.recovery.restorelede')}</p>
		<!--
			The destructive part, said before the input rather than after it is filled.
			A minted key cannot be migrated into a derived one — a non-extractable key
			cannot be exported to be re-imported — so this abandons whatever this
			browser held, with its history and trust level.
		-->
		<p class="warn">{t('agora.recovery.restorewarn')}</p>
		<div class="phrase">
			<Field label={t('agora.recovery.phraselabel')} hint={t('agora.recovery.phrasehint')}>
				<Input bind:value={typed} size="md" mono autocomplete="off" spellcheck={false} />
			</Field>
		</div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="actions">
			<Button variant="solid" onclick={restore} disabled={busy || typed.trim().length === 0}>
				{t('agora.recovery.restore')}
			</Button>
			<Button variant="ghost" onclick={reset}>{t('agora.cancel')}</Button>
		</div>
	{:else if stage === 'done'}
		<p class="done">{t('agora.recovery.done').replace('{handle}', agora.handle)}</p>
		<div class="actions">
			<Button variant="ghost" onclick={reset}>{t('agora.recovery.back')}</Button>
		</div>
	{/if}
</section>

<style>
	.recovery {
		border-top: 1px solid var(--border-subtle);
		margin-top: var(--s-6);
		padding-top: var(--s-6);
	}
	h4 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
	}
	.tier {
		margin: 0 0 var(--s-4);
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
	}
	.tier.portable {
		color: var(--basis-documented);
	}
	.lede,
	.cost,
	.done {
		margin: 0 0 var(--s-4);
		font-size: var(--t-xs);
		line-height: 1.55;
		color: var(--text-secondary);
		max-width: 62ch;
	}
	.warn,
	.soft {
		border-inline-start: 2px solid var(--basis-inferred);
		background: var(--surface-sunken);
		border-radius: var(--r-sm);
		padding: var(--s-4) var(--s-5);
		margin: 0 0 var(--s-4);
		font-size: var(--t-xs);
		line-height: 1.55;
		color: var(--text-secondary);
		max-width: 62ch;
	}
	.soft {
		border-inline-start-color: var(--basis-unsubstantiated);
	}

	.words {
		list-style: none;
		margin: 0 0 var(--s-4);
		padding: var(--s-5);
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: var(--s-3) var(--s-5);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
		/*
		 * The words are Latin whatever the interface language is — BIP-39 has no
		 * Arabic list, and mixing lists risks a normalisation difference silently
		 * deriving a different key. So this block is LTR even under `dir="rtl"`.
		 */
		direction: ltr;
		text-align: start;
	}
	.words li {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
	}
	.n {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		min-width: 1.5rem;
		text-align: end;
	}

	.checks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: var(--s-4);
		margin-bottom: var(--s-4);
	}
	/*
	 * The inputs are LTR even under `dir="rtl"`, for the same reason the word list is.
	 *
	 * What goes in them is Latin text whose ORDER carries meaning — the phrase is only
	 * valid in sequence. An RTL input puts the caret on the right and renders a
	 * twelve-word Latin string in a way that makes "in order" ambiguous to read back,
	 * on the interface's primary language, for the one field where a transposition
	 * silently produces a stranger's identity instead of an error.
	 */
	.checks :global(input),
	.phrase :global(input) {
		direction: ltr;
		text-align: start;
	}
	.error {
		margin: 0 0 var(--s-4);
		font-size: var(--t-sm);
		color: var(--basis-unsubstantiated);
	}
	.actions {
		display: flex;
		gap: var(--s-4);
		flex-wrap: wrap;
	}
</style>
