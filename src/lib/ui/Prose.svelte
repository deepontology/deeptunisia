<script lang="ts">
	/**
	 * A piece of authored prose, and an honest statement about what language it is in.
	 *
	 * WHY THE MARKER EXISTS
	 *
	 * Falling back to English silently is the easy implementation and the wrong one. A
	 * reader on the Arabic interface who meets an English paragraph with no explanation
	 * cannot tell whether the translation is missing, the record is quoting a source, or
	 * the site is broken — and if the fallback is invisible everywhere, the interface as
	 * a whole reads as complete when it is not.
	 *
	 * That is the same overstatement the published human-review number exists to
	 * prevent, so it gets the same answer: say the shortfall out loud, in the place the
	 * reader meets it.
	 *
	 * The marker uses `--basis-inferred`, the amber already meaning "reasoned, not
	 * established" everywhere else in the product. It is deliberately not an error
	 * colour: an untranslated field is a gap in the work, not a fault in the record.
	 */
	import { prose, t } from '$lib/t.svelte';

	interface Props {
		/** The record the field lives on. */
		record: object;
		field: string;
		/** Render as a block with the marker underneath, or inline with it after. */
		block?: boolean;
		class?: string;
	}

	let { record, field, block = false, class: klass = '' }: Props = $props();

	const value = $derived(prose(record, field));
</script>

{#if value.text}
	<span class="prose {klass}" class:block>
		<!--
			`dir="auto"` is doing the heavy lifting, and `lang` is not a substitute for it.

			An English sentence rendered inside the Arabic page came out with its full
			stop at the WRONG END — ".Ali's electoral campaigns" — because the paragraph
			inherits RTL and the trailing neutral character resolves against the
			paragraph direction, not the sentence's. `lang` says nothing about direction;
			only `dir` does. `dir="auto"` infers from the first strong character, which is
			right here because the same field may hold English today and Arabic tomorrow,
			and it brings `unicode-bidi: isolate` with it so the run cannot reorder the
			text around it either.

			This does not stop mattering once translation is finished: source titles are
			never translated, so a French title inside an Arabic page is permanent.

			`lang` stays for speech — it is the difference between a screen reader
			switching voice and an Arabic engine mangling an English sentence.
		-->
		<span dir="auto" lang={value.translated ? undefined : 'en'}>{value.text}</span>
		{#if !value.translated}
			<span class="untranslated">{t('prose.untranslated')}</span>
		{/if}
	</span>
{/if}

<style>
	.prose.block {
		display: block;
	}
	.untranslated {
		display: inline-block;
		margin-inline-start: var(--s-3);
		padding: 0 var(--s-3);
		border: 1px dotted var(--basis-inferred);
		border-radius: var(--r-full);
		font-size: var(--t-2xs);
		color: var(--basis-inferred);
		white-space: nowrap;
		vertical-align: middle;
	}
	.block .untranslated {
		margin-inline-start: 0;
		margin-top: var(--s-2);
	}
</style>
