<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { goto } from '$app/navigation';
	import { LAYER_COLOR, ds } from '$lib/model';
	import { formatDate } from '$lib/t.svelte';
	import { search, type Hit } from '$lib/search';

	let query = $state('');
	let cursor = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	/* The index itself lives in $lib/search, shared with Agora's mention menu, so
	   typing a name here and typing it in a post rank identically. */
	const results = $derived(search(query, { limit: query.trim() ? 24 : 9 }));

	$effect(() => {
		inputEl?.focus();
	});

	$effect(() => {
		void query;
		cursor = 0;
	});

		function choose(r: Hit) {
		if (r.kind === 'event') {
			// Jump the timeline to the event AND open its card.
			const ev = ds.events.find((e) => e.id === r.id);
			if (ev) {
				app.playing = false;
				app.setDate(ev.interval.startEarliest);
			}
			app.selected = r.id;
		} else if (r.kind === 'relationship') {
			// A connection is not an entity, so there is nothing to select - it lives on
			// the map. Same route the entity panel's rows use.
			void goto(`/network?rel=${encodeURIComponent(r.id)}`);
		} else if (r.kind === 'place' || r.kind === 'region') {
			// Geographic records live on the map, not in the entity panel.
			void goto('/map');
		} else {
			// People, institutions, and the v0.0.2 records (contracts, licences,
			// declarations, education) all open their card in the Inspector.
			app.selected = r.id;
		}
		app.searchOpen = false;
	}

function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = Math.min(results.length - 1, cursor + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(0, cursor - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (results[cursor]) choose(results[cursor]);
		}
	}
</script>

<div
	class="backdrop"
	onclick={() => (app.searchOpen = false)}
	onkeydown={(e) => e.key === 'Escape' && (app.searchOpen = false)}
	role="presentation"
></div>

<div class="palette" role="dialog" aria-modal="true" aria-label="Search">
	<input
		bind:this={inputEl}
		bind:value={query}
		onkeydown={onKey}
		placeholder="Search people, institutions, events — Arabic, French or English"
		aria-label="Search query"
		autocomplete="off"
		spellcheck="false"
	/>
	<ul>
		{#each results as r, i (r.id)}
			<li>
				<button
					class:active={i === cursor}
					onclick={() => choose(r)}
					onmouseenter={() => (cursor = i)}
				>
					<i class="dot" style:background={LAYER_COLOR[r.layer]}></i>
					<span class="name">{r.name}</span>
					<!-- An event's date is re-formatted in the reader's language; the index
					     was built once, before a locale existed. See $lib/search. -->
					<span class="detail">{r.date ? formatDate(r.date, 'month') : r.detail}</span>
					<span class="kind">{r.kind}</span>
				</button>
			</li>
		{/each}
		{#if results.length === 0}
			<li class="empty">No match. Try a surname, an institution, or a year.</li>
		{/if}
	</ul>
	<footer>
		<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
		<span><kbd>enter</kbd> open</span>
		<span><kbd>esc</kbd> dismiss</span>
	</footer>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.55);
		backdrop-filter: blur(2px);
		z-index: 60;
	}
	.palette {
		position: fixed;
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(600px, calc(100vw - 32px));
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
		z-index: 61;
		overflow: hidden;
	}
	input {
		width: 100%;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: 15px;
		padding: 15px 17px;
		border-bottom: 1px solid var(--border-subtle);
	}
	input:focus {
		outline: none;
	}
	input::placeholder {
		color: var(--text-faint);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 5px;
		max-height: 52vh;
		overflow-y: auto;
	}
	li button {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		border-radius: var(--r-md);
		font-size: 13px;
	}
	li button.active {
		background: var(--surface-raised);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.name {
		font-weight: 500;
		white-space: nowrap;
	}
	.detail {
		color: var(--text-faint);
		font-size: 11.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}
	.kind {
		font-family: var(--font-mono);
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
		flex-shrink: 0;
	}
	.empty {
		padding: 14px 12px;
		font-size: 12.5px;
		color: var(--text-faint);
	}
	footer {
		display: flex;
		gap: 14px;
		padding: 8px 14px;
		border-top: 1px solid var(--border-subtle);
		font-size: 10.5px;
		color: var(--text-faint);
	}
	kbd {
		font-family: var(--font-mono);
		font-size: 9.5px;
		border: 1px solid var(--border-default);
		border-radius: 3px;
		padding: 0 3px;
		margin-inline-end: 3px;
	}
</style>
