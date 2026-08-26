<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { theme, DEFAULT_ACCENT, THEMES, type ThemeId } from '$lib/design/theme.svelte';
	import { t } from '$lib/t.svelte';
	import { LOCALES, localeCoverage, type Locale } from '$lib/i18n';

	/**
	 * Reader settings.
	 *
	 * Everything here is a property of the reader rather than of the data, which
	 * is why these persist while nothing else in the app's state does.
	 *
	 * A theme is one complete look — its own lightness and its own character.
	 * There is no separate light/dark switch to compose with it, because a tint
	 * grid plus a mode switch made four options read as two. `System` stays at
	 * the top of the grid because most readers should never need the rest: it
	 * maps the OS preference onto Paper (light) or Midnight (dark) and keeps
	 * following. The accent below is deliberately last and small — it moves one
	 * hue, nothing more.
	 *
	 * What is NOT offered is the point: no control recolours a layer or a basis.
	 * Those hues say what a claim is and what it rests on, and a reader who could
	 * rotate them could quietly restyle the argument — see DESIGN.md
	 * §Customisation and the note above --accent-hue in tokens.css.
	 */

	function pickTheme(id: string) {
		theme.set(id === 'system' ? 'system' : (id as ThemeId));
	}
</script>

<!-- Focus, Escape and dismissal belong to Popover, which is the dialog. -->
<div class="settings">
	<section>
		<h3 class="eyebrow">
			{t('set.appearance')}
			{#if theme.choice !== 'system'}
				<button class="reset" onclick={() => theme.set('system')}>
					{t('ctl.reset')}
				</button>
			{/if}
		</h3>

		<div class="themes" role="radiogroup" aria-label={t('set.appearance')}>
			<!--
				System first, full width. Its preview is split: what the choice means
				on each side of the OS preference — Paper on the light half, Midnight
				on the dark one.
			-->
			<button
				role="radio"
				class="theme system"
				aria-checked={theme.choice === 'system'}
				onclick={() => pickTheme('system')}
			>
				<span class="peek" aria-hidden="true">
					<span class="half" data-theme="light" data-palette="paper">
						<i></i><u></u>
					</span>
					<span class="half" data-theme="dark" data-palette="midnight">
						<i></i><u></u>
					</span>
				</span>
				<span class="name">{t('set.system')}</span>
			</button>

			{#each THEMES as th (th.id)}
				<button
					role="radio"
					class="theme"
					class:on={theme.choice === th.id}
					aria-checked={theme.choice === th.id}
					onclick={() => pickTheme(th.id)}
				>
					<!--
						The chip carries BOTH attributes, so the entire cascade — mode
						structure and palette character — resolves inside this subtree:
						each preview shows its own theme truthfully, in your accent,
						regardless of the theme currently applied to <html>.
					-->
					<span class="peek" aria-hidden="true" data-theme={th.mode} data-palette={th.id}>
						<i></i><u></u>
					</span>
					<span class="name">{t(th.labelKey)}</span>
				</button>
			{/each}
		</div>
		{#if theme.choice === 'system'}
			<p class="note">{t('set.appearance.system.hint')}</p>
		{/if}
		<p class="note">{t('set.appearance.note')}</p>
	</section>

	<section>
		<h3 class="eyebrow">
			{t('set.accent')}
			{#if theme.accent !== DEFAULT_ACCENT}
				<button class="reset" onclick={() => theme.setAccent(DEFAULT_ACCENT)}>
					{t('ctl.reset')}
				</button>
			{/if}
		</h3>

		<label class="hue">
			<span class="sr-only">{t('set.accent.hue')}</span>
			<input
				type="range"
				min="0"
				max="359"
				step="1"
				value={theme.accent}
				oninput={(e) => theme.setAccent(Number(e.currentTarget.value))}
				aria-label={t('set.accent.hue')}
				aria-valuetext="{theme.accent}°"
			/>
		</label>
		<p class="note">{t('set.accent.note')}</p>
	</section>

	<!--
		Hidden on wide screens, where the menu bar has room to show the language
		switcher permanently. It is duplicated rather than moved because an Arabic
		reader landing on an English page should not have to open a settings menu to
		discover the interface speaks Arabic.
	-->
	<section class="lang">
		<h3 class="eyebrow">{t('ctl.language')}</h3>
		<div class="locales" role="radiogroup" aria-label={t('ctl.language')}>
			{#each LOCALES as l (l.id)}
				<button
					role="radio"
					aria-checked={app.locale === l.id}
					class:on={app.locale === l.id}
					lang={l.id}
					onclick={() => app.setLocale(l.id as Locale)}
				>
					<span class="native">{l.native}</span>
					<span class="cov mono">{localeCoverage(l.id)}%</span>
				</button>
			{/each}
		</div>
	</section>
</div>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: var(--s-7);
		width: 272px;
		max-width: calc(100vw - var(--s-6) * 2);
		padding: var(--s-6);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}

	h3 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-4);
		margin: 0;
	}

	.reset {
		font-family: var(--font-sans);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-normal);
		text-transform: none;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-default);
	}
	.reset:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-border);
	}

	/* --- appearance --- */

	.themes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-3);
	}
	.theme {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		border-radius: var(--r-md);
		border: 1px solid var(--border-subtle);
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}
	.theme:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	/* Selection carried by borders in dark and shadow in light, per DESIGN.md —
	   the card renders in every palette it offers, so it does both. */
	.theme.on {
		border-color: var(--border-strong);
		box-shadow:
			0 0 0 1px var(--border-strong),
			var(--elev-1);
		color: var(--text-primary);
	}

	/* System spans the grid and reads as one row: the split preview, then its name. */
	.theme.system {
		grid-column: 1 / -1;
		flex-direction: row;
		align-items: center;
		gap: var(--s-4);
	}
	.theme.system .peek {
		flex: 1;
	}

	/*
	 * The preview chip. Every colour in it is a semantic token; the chip's own
	 * data-theme + data-palette attributes scope the whole cascade — mode
	 * structure AND palette character — into this subtree, so each chip is
	 * painted by the very rules that will paint the app when chosen.
	 */
	.peek {
		position: relative;
		display: flex;
		height: 38px;
		border-radius: var(--r-sm);
		background: var(--surface-base);
		border: 1px solid var(--border-default);
		overflow: hidden;
	}
	.peek i {
		position: absolute;
		top: 6px;
		inset-inline: 7px;
		height: 13px;
		border-radius: var(--r-xs);
		background: var(--surface-panel);
		border: 1px solid var(--border-subtle);
	}
	.peek u {
		position: absolute;
		bottom: 8px;
		inset-inline: 7px;
		height: 3px;
		border-radius: var(--r-full);
		/* An abstract text line plus the reader's own accent. Physical direction is
		   deliberate: this is a miniature of screen geometry, not flowing text. */
		background: linear-gradient(
			to right,
			var(--accent) 0 26%,
			var(--text-faint) 26% 62%,
			var(--border-default) 62% 100%
		);
	}

	/* The two halves of the System chip: what the choice means on each side of
	   the OS preference. The seam is the one strong border on purpose — this is
	   the boundary the bubbles also draw. */
	.half {
		position: relative;
		flex: 1;
		background: var(--surface-base);
	}
	.half + .half {
		border-inline-start: 1px solid var(--border-strong);
	}

	.name {
		text-align: center;
		letter-spacing: var(--track-wide);
	}
	.theme.system .name {
		text-align: start;
	}

	/* --- accent - slider only (presets removed: slider covers 0-359) */

	.hue {
		display: block;
	}
	.hue input {
		appearance: none;
		width: 100%;
		height: 12px;
		margin: 0;
		border-radius: var(--r-full);
		background: var(--accent-scale);
		border: 1px solid var(--border-default);
		cursor: pointer;
	}
	.hue input::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--surface-overlay);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.hue input::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--surface-overlay);
		box-shadow: 0 0 0 1px var(--border-strong);
	}

	.note {
		font-size: var(--t-2xs);
		line-height: var(--lh-snug);
		color: var(--text-faint);
	}

	/* --- language --- */

	.locales {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.locales button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		min-height: 30px;
		padding: 0 var(--s-4);
		font-size: var(--t-base);
		color: var(--text-secondary);
		border-radius: var(--r-sm);
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}
	.locales button:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.locales button.on {
		background: var(--accent-muted);
		color: var(--accent);
	}
	.cov {
		font-size: var(--t-2xs);
		color: var(--text-faint);
	}

	@media (min-width: 1101px) {
		.lang {
			display: none;
		}
	}
</style>
