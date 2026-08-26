<script lang="ts">
	/**
	 * Where a post is written.
	 *
	 * WHY A TEXTAREA AND NOT A RICH-TEXT EDITOR
	 *
	 * Three reasons, in order of how much they cost to get wrong.
	 *
	 * 1. This composer is trilingual by requirement, and `contenteditable` plus
	 *    bidirectional text plus a mention widget is where editors break. Caret
	 *    placement across an RTL/LTR boundary, IME composition, and a selection
	 *    that spans a mention are each their own defect class, and Arabic is not an
	 *    edge case here — it is the primary language of the audience.
	 * 2. The mention model stores offsets into plain text (see `markdown.ts`). A
	 *    rich editor's document is a tree, so every mention would have to be
	 *    serialised back into text and offsets anyway, on every keystroke.
	 * 3. DESIGN.md's no-library rule came from two specific failures — a component
	 *    library rendering its own nested `<button>` and breaking hydration, and a
	 *    barrel import handing raw `.svelte` files to Node under SSR. An editor
	 *    package is a larger version of both bets.
	 *
	 * What makes a composer feel good is the affordances around the field, not the
	 * DOM technique inside it.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import EntityMenu from './EntityMenu.svelte';
	import PostBody from './PostBody.svelte';
	import PostingAs from './PostingAs.svelte';
	import { search, type Hit } from '$lib/search';
	import { countLinks, type MentionSpan } from './markdown';
	import { t } from '$lib/t.svelte';
	import { format } from '$lib/i18n';
	import { app } from '$lib/state.svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		/** Server ceiling, mirrored so the count means something. */
		limit?: number;
		/** How many links this identity may include. */
		maxLinks?: number;
		/** Whether this identity may post links at all. */
		canLink?: boolean;
		busy?: boolean;
		/** Key for the retained draft. Omit to disable retention. */
		draftKey?: string;
		/**
		 * Resolve true when the post landed. The composer only clears itself on a
		 * true — a refusal must leave the text exactly where the author left it,
		 * because the most common refusals here (rate limit, duplicate, links not yet
		 * permitted) are all ones they will retry in a moment.
		 */
		onsubmit: (body: string, mentions: MentionSpan[], burn: boolean) => Promise<boolean>;
		oncancel?: () => void;
		submitLabel?: string;
		/** Offer the throwaway identity. Off for replies inside a thread you own. */
		burnable?: boolean;
	}

	let {
		value = $bindable(''),
		placeholder = '',
		limit = 20_000,
		maxLinks = 5,
		canLink = true,
		busy = false,
		draftKey,
		onsubmit,
		oncancel,
		submitLabel,
		burnable = true
	}: Props = $props();

	let el = $state<HTMLTextAreaElement | null>(null);
	let previewing = $state(false);
	/**
	 * True while the pointer or focus is on "Post once".
	 *
	 * It drives the identity line above, so the reader is told the post will carry no
	 * name *before* they commit to it rather than discovering it afterwards — which,
	 * for the one control here meant to be used when something is dangerous to say,
	 * is the wrong moment to be surprised.
	 */
	let burning = $state(false);

	/**
	 * Records the author has pointed at, in the order they were inserted.
	 *
	 * Offsets are NOT stored here. They are recomputed from the text on submit, by
	 * finding each label in order — because the author keeps editing after
	 * inserting, and an offset captured at insertion time is wrong as soon as they
	 * fix a typo earlier in the sentence. Recomputing also means a mention whose
	 * text the author deleted simply stops resolving, which is the correct outcome
	 * and needs no bookkeeping to achieve.
	 */
	let picked = $state<{ id: string; label: string }[]>([]);

	/* ---- the @ menu ---- */

	let query = $state<string | null>(null);
	let at = $state(0);
	let cursor = $state(0);

	const hits = $derived(query === null ? [] : search(query, { limit: 8 }));
	const open = $derived(query !== null && hits.length > 0);

	const links = $derived(countLinks(value));
	const tooManyLinks = $derived(links > maxLinks);
	const overLimit = $derived(value.length > limit);
	const blocked = $derived(!value.trim() || overLimit || tooManyLinks || (links > 0 && !canLink));

	/** Names contain spaces, so the trigger runs to the end of the line, capped. */
	const TRIGGER = /(?:^|\s)@([^\n@]{0,32})$/;

	function sync() {
		const node = el;
		if (!node) return;
		const before = value.slice(0, node.selectionStart ?? 0);
		const m = TRIGGER.exec(before);
		if (!m) {
			query = null;
			return;
		}
		query = m[1];
		at = before.length - m[1].length - 1;
		cursor = 0;
	}

	function pick(hit: Hit) {
		const node = el;
		const caret = node?.selectionStart ?? value.length;
		// The inserted text is the plain name — no `@` survives into the body. The
		// mention is an annotation over ordinary prose, so a post still reads
		// correctly to anything that never loads the mention table.
		value = value.slice(0, at) + hit.name + value.slice(caret);
		picked = [...picked, { id: hit.id, label: hit.name }];
		query = null;
		queueMicrotask(() => {
			node?.focus();
			const to = at + hit.name.length;
			node?.setSelectionRange(to, to);
		});
	}

	function unpick(i: number) {
		picked = picked.filter((_, j) => j !== i);
	}

	/**
	 * Locate each mention in the final text.
	 *
	 * Sequential, so the same record mentioned twice produces two spans rather than
	 * two copies of the first one. A label that is no longer present is dropped —
	 * the author edited it away, and a span pointing at text that changed is worse
	 * than no span at all.
	 */
	function spans(body: string): MentionSpan[] {
		const out: MentionSpan[] = [];
		let from = 0;
		for (const p of picked) {
			const start = body.indexOf(p.label, from);
			if (start === -1) continue;
			out.push({ id: p.id, start, end: start + p.label.length });
			from = start + p.label.length;
		}
		return out;
	}

	/* ---- markup helpers ---- */

	function wrap(before: string, after = before) {
		const node = el;
		if (!node) return;
		const s = node.selectionStart ?? 0;
		const e = node.selectionEnd ?? s;
		value = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
		queueMicrotask(() => {
			node.focus();
			node.setSelectionRange(s + before.length, e + before.length);
		});
	}

	function quote() {
		const node = el;
		if (!node) return;
		const s = value.lastIndexOf('\n', (node.selectionStart ?? 1) - 1) + 1;
		value = value.slice(0, s) + '> ' + value.slice(s);
		queueMicrotask(() => node.focus());
	}

	function onKey(e: KeyboardEvent) {
		if (open) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				cursor = Math.min(hits.length - 1, cursor + 1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				cursor = Math.max(0, cursor - 1);
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				pick(hits[cursor]);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				// Stop here: the shell also listens for Escape, and dismissing the menu
				// should not additionally close whatever contains the composer.
				e.stopPropagation();
				query = null;
				return;
			}
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			submit();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
			e.preventDefault();
			wrap('**');
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
			e.preventDefault();
			wrap('*');
		}
	}

	async function submit(burn = false) {
		if (blocked || busy) return;
		const landed = await onsubmit(value, spans(value), burn);
		if (!landed) return;
		value = '';
		picked = [];
		previewing = false;
		clearDraft();
	}

	/**
	 * Drafts survive a misclick, and nothing more.
	 *
	 * `sessionStorage`, never `localStorage`. A half-written paragraph about a named
	 * official persisting on disk after the tab is closed is a document someone else
	 * can find on that machine, and this project's whole identity design is built on
	 * holding nothing that is worth taking. Surviving a navigation is worth having;
	 * surviving the session is not worth the risk.
	 */
	$effect(() => {
		if (!draftKey) return;
		const saved = sessionStorage.getItem(`agora-draft:${draftKey}`);
		if (saved && !value) value = saved;
	});

	$effect(() => {
		if (!draftKey) return;
		if (value) sessionStorage.setItem(`agora-draft:${draftKey}`, value);
		else sessionStorage.removeItem(`agora-draft:${draftKey}`);
	});

	function clearDraft() {
		if (draftKey) sessionStorage.removeItem(`agora-draft:${draftKey}`);
	}
</script>

<div class="composer">
	<!--
		Above the field, so the identity that will appear under this post is visible
		while it is being written rather than discoverable somewhere else. `burning`
		makes it say what "Post once" actually does, since a throwaway key has no name
		by construction.
	-->
	<PostingAs {burning} />

	<div class="tools">
		<Tooltip content={t('agora.format.boldhint')}>
			<Button size="xs" variant="ghost" onclick={() => wrap('**')} aria-label={t('agora.format.bold')}>B</Button>
		</Tooltip>
		<Tooltip content={t('agora.format.italichint')}>
			<Button size="xs" variant="ghost" onclick={() => wrap('*')} aria-label={t('agora.format.italic')}>
				<span class="i">I</span>
			</Button>
		</Tooltip>
		<Tooltip content={t('agora.quotehint')}>
			<Button size="xs" variant="ghost" onclick={quote} aria-label={t('agora.format.quote')}>&gt;</Button>
		</Tooltip>
		<Tooltip content={t('agora.mentionhint')}>
			<Button size="xs" variant="ghost" onclick={() => wrap('@', '')} aria-label={t('agora.format.mention')}>
				@
			</Button>
		</Tooltip>
		<span class="spacer"></span>
		<Button
			size="xs"
			variant="ghost"
			active={previewing}
			onclick={() => (previewing = !previewing)}
		>
			{previewing ? t('agora.write') : t('agora.preview')}
		</Button>
	</div>

	{#if previewing}
		<div class="preview">
			{#if value.trim()}
				<PostBody body={value} mentions={spans(value)} />
			{:else}
				<p class="dim">{t('agora.nothingyet')}</p>
			{/if}
		</div>
	{:else}
		<Textarea
			bind:value
			bind:element={el}
			{placeholder}
			{limit}
			onkeydown={onKey}
			oninput={sync}
			onclick={sync}
			aria-label={placeholder}
		/>
		{#if open}
			<EntityMenu {hits} {cursor} onpick={pick} onhover={(i) => (cursor = i)} />
		{/if}
	{/if}

	{#if picked.length}
		<div class="linked">
			<span class="lbl">{t('agora.linked')}</span>
			{#each picked as p, i (p.id + i)}
				<Tooltip content={t('agora.unlink')}>
					<button
						type="button"
						class="tag"
						onclick={() => unpick(i)}
						aria-label={format(app.locale, 'agora.unlinkWho', { who: p.label })}
					>
						{p.label}<span aria-hidden="true">A-</span>
					</button>
				</Tooltip>
			{/each}
		</div>
	{/if}

	<!--
		Said before the refusal, not after it. The server enforces both of these and
		its message is correct, but finding out by having a finished post rejected is
		the expensive way to learn a rule.
	-->
	{#if links > 0 && !canLink}
		<p class="warn">{t('agora.nolinks')}</p>
	{:else if tooManyLinks}
		<p class="warn">{t('agora.toomanylinks')} {maxLinks}.</p>
	{/if}

	<div class="actions">
		<Button variant="solid" onclick={() => submit(false)} disabled={blocked || busy}>
			{submitLabel ?? t('agora.post')}
		</Button>
		{#if burnable}
			<!--
				The throwaway identity. It forfeits history, which is the trade — a
				long-lived pseudonym is deanonymisable from its own corpus, so somebody
				with one dangerous thing to say should not have to choose between saying
				it and keeping everything else.

				It carried a bare `title` attribute before, which DESIGN.md forbids and
				which never appears on touch at all — leaving the single most consequential
				control here as an unexplained button on exactly the devices most of this
				audience uses.
			-->
			<Tooltip content={t('agora.burnhint')}>
				<span
					class="burnwrap"
					onmouseenter={() => (burning = true)}
					onmouseleave={() => (burning = false)}
					onfocusin={() => (burning = true)}
					onfocusout={() => (burning = false)}
					role="presentation"
				>
					<Button variant="outline" onclick={() => submit(true)} disabled={blocked || busy}>
						{t('agora.burn')}
					</Button>
				</span>
			</Tooltip>
		{/if}
		{#if oncancel}
			<Button variant="ghost" onclick={oncancel}>{t('agora.cancel')}</Button>
		{/if}
		<span class="hint">{t('agora.submithint')}</span>
	</div>
</div>

<style>
	.composer {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin-bottom: var(--s-2);
	}
	.spacer {
		flex: 1;
	}
	.i {
		font-style: italic;
	}

	.preview {
		min-height: 96px;
		padding: var(--s-4) var(--s-5);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
	}
	.dim {
		margin: 0;
		color: var(--text-faint);
		font-size: var(--t-sm);
	}

	.linked {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-top: var(--s-4);
	}
	.lbl {
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		padding: 1px var(--s-3);
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		background: var(--surface-sunken);
		color: var(--text-secondary);
		font-size: var(--t-xs);
	}
	.tag:hover {
		border-color: var(--basis-unsubstantiated);
		color: var(--text-primary);
	}

	.warn {
		margin: var(--s-3) 0 0;
		font-size: var(--t-xs);
		color: var(--basis-inferred);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		margin-top: var(--s-5);
		flex-wrap: wrap;
	}
	/* Only a hover/focus sensor — it must not become a tab stop of its own, or the
	   keyboard route to the button gains a meaningless step before it. */
	.burnwrap {
		display: inline-flex;
	}
	.hint {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	/* On a phone the shortcut does not exist and the row is tight. */
	@media (max-width: 900px) {
		.hint {
			display: none;
		}
	}
</style>
