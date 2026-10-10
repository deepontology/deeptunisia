<script lang="ts">
	/**
	 * A search combobox over the institution list, with the selected set shown as
	 * removable chips.
	 *
	 * The page this was lifted out of rendered every institution as a toggle chip.
	 * At the current dataset size that is a wall of 211 buttons that pushes the
	 * results below the fold, so the reader never sees an answer without scrolling
	 * past the whole vocabulary first. The combobox replaces the wall: type to
	 * filter, or pick from the ten institutions the dataset names most often.
	 *
	 * WHY THE SUGGESTIONS ARE THE TEN MOST NAMED
	 *
	 * A suggestion list has to answer "what would this reader most likely want".
	 * The honest answer available without guessing is frequency in the dataset:
	 * count the officeholding records and the relationship records that name each
	 * institution, and the top of that list is the institutions the atlas actually
	 * says the most about. It is also a statement the reader can check, because the
	 * count sits next to every name.
	 *
	 * The count respects the reader's evidence threshold and layer set. An
	 * institution with nothing at or above the current basis floor is not a useful
	 * suggestion, because picking it returns an empty result.
	 */
	import { format } from '$lib/i18n';
	import { app } from '$lib/state.svelte';
	import Input from '$lib/ui/Input.svelte';
	import { search } from '$lib/search';
	import {
		LAYER_COLOR,
		ds,
		institutionById,
		meetsBasis,
		type Basis,
		type Institution,
		type Layer
	} from '$lib/model';
	import { nameOf, t, tf } from '$lib/t.svelte';

	interface Props {
		/** Names the fieldset and the listbox. A word, never a code. */
		label: string;
		/** Selected institution ids, in the order they were added. */
		ids: string[];
		/** Distinguishes this control's generated element ids from the others. */
		id: string;
	}

	let { label, ids = $bindable([]), id }: Props = $props();

	let query = $state('');
	let open = $state(false);
	let cursor = $state(0);

	const SUGGESTED = 10;

	/**
	 * How many records name each institution, under the reader's current evidence
	 * threshold and layer set. Officeholdings and relationship ties are counted in
	 * the same filtered pass the results use, so the number beside a suggestion is
	 * the number of records picking it can return.
	 */
	const namedBy = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const p of ds.positions) {
			if (!meetsBasis(p.basis as Basis, app.basisFloor)) continue;
			if (!app.activeLayers.has(p.layer as Layer)) continue;
			if (!p.institution) continue;
			counts.set(p.institution, (counts.get(p.institution) ?? 0) + 1);
		}
		for (const rel of ds.relationships) {
			if (!meetsBasis(rel.basis as Basis, app.basisFloor)) continue;
			for (const end of [rel.from, rel.to]) {
				if (!institutionById.has(end)) continue;
				counts.set(end, (counts.get(end) ?? 0) + 1);
			}
		}
		return counts;
	});

	/** Institutional order breaks count ties, so the list is deterministic. */
	const mostNamed = $derived.by(() =>
		[...ds.institutions]
			.filter((i) => (namedBy.get(i.id) ?? 0) > 0)
			.sort((a, b) => (namedBy.get(b.id) ?? 0) - (namedBy.get(a.id) ?? 0) || a.order - b.order)
			.slice(0, SUGGESTED)
	);

	/*
	 * An empty field offers the ten most named. Anything typed goes through the
	 * shared index, so the same spelling finds it here as in the search palette:
	 * Arabic, French, English and the alias spellings are all in one haystack.
	 */
	const suggestions = $derived.by(() => {
		const q = query.trim();
		const pool = q
			? search(q, { kinds: ['institution'], limit: 16 })
					.map((hit) => institutionById.get(hit.id))
					.filter((i): i is Institution => Boolean(i))
			: mostNamed;
		const added = new Set(ids);
		return pool.filter((i) => !added.has(i.id)).slice(0, SUGGESTED);
	});

	const chosen = $derived(
		ids.map((i) => institutionById.get(i)).filter((i): i is Institution => Boolean(i))
	);

	/* Clamped rather than reset: a shrinking list must not strand the cursor. */
	const active = $derived(suggestions.length === 0 ? 0 : Math.min(cursor, suggestions.length - 1));

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open) {
				open = true;
				return;
			}
			const step = e.key === 'ArrowDown' ? 1 : -1;
			const n = suggestions.length;
			if (n > 0) cursor = (((cursor + step) % n) + n) % n;
		} else if (e.key === 'Home' || e.key === 'End') {
			if (!open || suggestions.length === 0) return;
			e.preventDefault();
			cursor = e.key === 'Home' ? 0 : suggestions.length - 1;
		} else if (e.key === 'Enter') {
			if (!open || !suggestions[active]) return;
			e.preventDefault();
			add(suggestions[active].id);
		} else if (e.key === 'Escape') {
			// The shell's own Escape clears the selection and stands down for text
			// fields, so without this the key would do nothing here.
			e.preventDefault();
			close();
		}
	}

	function close() {
		open = false;
		query = '';
		cursor = 0;
	}

	function add(instId: string) {
		if (ids.includes(instId)) return;
		ids = [...ids, instId];
		// Staying open and clearing the query lets the reader build a set without
		// reaching for the mouse between picks.
		query = '';
		cursor = 0;
		open = true;
	}

	function remove(instId: string) {
		ids = ids.filter((x) => x !== instId);
	}
</script>

<div
	class="picker"
	onfocusout={(e) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
	}}
>
	<div class="combo">
		<Input
			{id}
			bind:value={query}
			size="sm"
			placeholder={t('investigate.picker.placeholder')}
			aria-label={label}
			role="combobox"
			aria-expanded={open && suggestions.length > 0}
			aria-controls="{id}-list"
			aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
			aria-autocomplete="list"
			autocomplete="off"
			spellcheck="false"
			onfocus={() => (open = true)}
			oninput={() => {
				open = true;
				cursor = 0;
			}}
			onkeydown={onKey}
		/>
		{#if open}
			{#if suggestions.length > 0}
				<ul id="{id}-list" class="menu" role="listbox" aria-label={label} aria-multiselectable="true">
					{#each suggestions as inst, i (inst.id)}
						<li role="presentation">
							<button
								type="button"
								id="{id}-opt-{i}"
								role="option"
								aria-selected={i === active}
								class:on={i === active}
								tabindex="-1"
								onmouseenter={() => (cursor = i)}
								onmousedown={(e) => e.preventDefault()}
								onclick={() => add(inst.id)}
							>
								<i class="dot" style:background={LAYER_COLOR[inst.layer as Layer]} aria-hidden="true"></i>
								<span class="opt-name">{nameOf(inst)}</span>
								<span class="opt-count mono">
									{format(app.locale, 'investigate.picker.records', { n: namedBy.get(inst.id) ?? 0 })}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim()}
				<p class="menu-empty">{t('investigate.picker.none')}</p>
			{/if}
		{/if}
	</div>

	{#if !query.trim()}
		<p class="topline">{tf('investigate.picker.topHint', { n: SUGGESTED })}</p>
	{/if}

	{#if chosen.length > 0}
		<ul class="chosen">
			{#each chosen as inst (inst.id)}
				<li>
					<span class="sel" style:--tint={LAYER_COLOR[inst.layer as Layer]}>
						<i class="dot" aria-hidden="true"></i>
						<span class="sel-name">{nameOf(inst)}</span>
						<button
							type="button"
							class="rm"
							aria-label={format(app.locale, 'investigate.picker.remove', { name: nameOf(inst) })}
							onmousedown={(e) => e.preventDefault()}
							onclick={() => remove(inst.id)}
							>×</button
						>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		min-width: 0;
	}
	.combo {
		position: relative;
		max-width: 340px;
	}

	/*
	 * An overlay, not an inline disclosure. A list that pushes the results down
	 * moves the answer the reader came for, and every keystroke would reflow the
	 * whole page.
	 */
	.menu {
		position: absolute;
		z-index: var(--z-sheet);
		inset-inline-start: 0;
		inset-block-start: calc(100% + var(--s-1));
		width: 100%;
		max-height: min(46vh, 330px);
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: var(--s-1);
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		box-shadow: var(--elev-3);
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		text-align: start;
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-sm);
	}
	.menu button.on {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
		background: var(--tint, var(--text-faint));
	}
	.opt-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.opt-count {
		margin-inline-start: auto;
		flex-shrink: 0;
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}
	.menu-empty {
		position: absolute;
		z-index: var(--z-sheet);
		inset-inline-start: 0;
		inset-block-start: calc(100% + var(--s-1));
		margin: 0;
		padding: var(--s-4) var(--s-5);
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		box-shadow: var(--elev-2);
		font-size: var(--t-xs);
		color: var(--text-faint);
	}

	.topline {
		margin: var(--s-2) 0 0;
		max-width: 52ch;
		font-size: var(--t-2xs);
		line-height: var(--lh-snug);
		color: var(--text-faint);
	}

	.chosen {
		list-style: none;
		margin: var(--s-3) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.sel {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		height: 22px;
		padding-inline-start: var(--s-3);
		border-radius: var(--r-xs);
		border: 1px solid color-mix(in oklch, var(--tint) 30%, transparent);
		background: color-mix(in oklch, var(--tint) 13%, transparent);
		color: var(--tint);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		max-width: 100%;
	}
	.sel-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rm {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		margin-inline-start: calc(-1 * var(--s-2));
		border: none;
		border-radius: var(--r-xs);
		background: transparent;
		color: inherit;
		font-size: var(--t-sm);
		line-height: 1;
	}
	.rm:hover {
		background: color-mix(in oklch, var(--tint) 22%, transparent);
	}

	/*
	 * A thumb needs the target even when the visible mark is small. The hit area is
	 * the target, not the glyph.
	 */
	@media (pointer: coarse) {
		.sel {
			height: var(--tap);
			padding-inline-end: var(--s-2);
		}
		.rm {
			width: var(--tap);
			height: var(--tap);
		}
		.menu button {
			min-height: var(--tap);
		}
	}
</style>
