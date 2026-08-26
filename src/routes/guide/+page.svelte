<script lang="ts">
	import { t } from '$lib/t.svelte';
	import Content from '$lib/ui/Content.svelte';
	import { VIEWS } from '$lib/views';
	import { BASIS_ORDER } from '$lib/model';

	/**
	 * The guide — the in-product orientation page (W1).
	 *
	 * Long-form prose lives in src/content/guide.*.md (i18n-spec §5). The two
	 * things that must never drift are rendered live instead of written twice:
	 * the four-basis legend (from BASIS_ORDER + basis.desc keys) and the views
	 * table (from src/lib/views.ts + guide.* keys — the same source the caption
	 * line in Viewport.svelte reads).
	 */

	const BASES = BASIS_ORDER.map((b) => ({
		id: b,
		label: t(`basis.${b}`),
		desc: t(`basis.desc.${b}`),
		tint: `var(--basis-${b})`
	}));
</script>

<svelte:head>
	<title>Guide · DeepTunisia</title>
	<meta
		name="description"
		content="How to read DeepTunisia: the one rule that governs every claim, the two worlds of the interface, how time works, and which view answers which question."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">{t('guide.eyebrow')}</span>
		<h1>{t('guide.title')}</h1>
		<div class="lede"><Content view="guide" section="intro" /></div>
	</header>

	<div class="prose">
		<Content view="guide" section="rule" />

		<!-- The legend rendered live, so the four bases and their descriptions can
		     never drift from the chips the rest of the interface uses. -->
		<ul class="bases" aria-label={t('guide.bases.title')}>
			{#each BASES as b (b.id)}
				<li class="base">
					<span class="chip" style:--c={b.tint} aria-hidden="true"></span>
					<div>
						<strong>{b.label}</strong>
						<p>{b.desc}</p>
					</div>
				</li>
			{/each}
		</ul>

		<Content view="guide" section="bubbles" />
		<Content view="guide" section="time" />
		<Content view="guide" section="verified" />

		<Content view="guide" section="views" />

		<table class="views">
			<thead>
				<tr>
					<th>{t('guide.views.view')}</th>
					<th>{t('guide.views.answer')}</th>
					<th>{t('guide.views.when')}</th>
				</tr>
			</thead>
			<tbody>
				{#each VIEWS as v (v.route)}
					<tr>
						<td class="name">
							<a href={v.route}>{t(`nav.${v.key}`)}</a>
						</td>
						<td>{t(`guide.${v.key}.answer`)}</td>
						<td class="when">{t(`guide.${v.key}.when`)}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<Content view="guide" section="correct" />
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.page-head {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-8) var(--s-6) var(--s-3);
	}
	.page-head .eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.page-head h1 {
		margin: var(--s-3) 0 var(--s-4);
		font-family: var(--font-serif);
		font-size: var(--t-4xl);
		font-weight: 400;
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	.page-head :global(.lede p) {
		margin: 0;
		font-size: var(--t-lg);
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.prose {
		max-width: 76ch;
		margin-inline: auto;
		padding: var(--s-3) var(--s-6) var(--s-12);
	}

	/* The four-basis legend: chip + label + description, one row each. The chip
	   is a token colour (var(--basis-*)), the same swatch every claim in the
	   interface wears — this page just names them all in one place. */
	.bases {
		list-style: none;
		margin: 0 0 var(--s-7);
		padding: var(--s-5);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		background: var(--surface-sunken);
		display: grid;
		gap: var(--s-4);
	}
	.base {
		display: flex;
		align-items: flex-start;
		gap: var(--s-4);
	}
	.chip {
		flex: 0 0 auto;
		width: 18px;
		height: 18px;
		margin-top: 2px;
		border-radius: var(--r-sm);
		background: var(--c);
	}
	.base strong {
		display: block;
		font-size: var(--t-base);
		color: var(--text-primary);
	}
	.base p {
		margin: 2px 0 0;
		font-size: var(--t-sm);
		line-height: 1.55;
		color: var(--text-muted);
	}

	.views {
		width: 100%;
		border-collapse: collapse;
		margin: var(--s-5) 0 var(--s-8);
		font-size: var(--t-sm);
	}
	.views th {
		text-align: start;
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		padding: var(--s-3) var(--s-4);
		border-bottom: 1px solid var(--border-strong);
	}
	.views td {
		padding: var(--s-4);
		border-bottom: 1px solid var(--border-subtle);
		vertical-align: top;
		color: var(--text-secondary);
		line-height: 1.55;
	}
	.views .name {
		white-space: nowrap;
		font-weight: 520;
	}
	.views .name a {
		color: var(--accent);
	}
	.views .when {
		color: var(--text-muted);
	}

	@media (max-width: 900px) {
		/* One row per view: the "when" column reads better stacked on a phone. */
		.views th:nth-child(3),
		.views td.when {
			display: none;
		}
	}
</style>
