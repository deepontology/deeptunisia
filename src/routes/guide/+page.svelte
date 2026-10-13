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
	 *
	 * ARCHIVE REGISTER. One column, reading face, measure. The h2 headings belong
	 * to the markdown, so their numbers are CSS counters on the section
	 * container rather than props on a component — a count that follows the
	 * document cannot drift from it.
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
	<div class="column">
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
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	/* ARCHIVE REGISTER, one column. The reading face and the body size are set
	   HERE, with the measure, because the measure is in `ch`: it only comes out as
	   one width across the whole column in the face and at the size the prose is
	   set in. Everything inside — head, sections, legend, table — is measured
	   against this one box.

	   --font-read carries every script on the page: Libron has no Arabic glyphs, so
	   Arabic falls through to the Plex Arabic fallback in the same stack. */
	.column {
		max-width: var(--measure);
		margin-inline: auto;
		padding: 0 var(--s-6) var(--s-12);
		font-family: var(--font-read);
		font-size: var(--step-0);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	.page-head {
		padding: var(--s-9) 0 var(--s-5);
	}
	.page-head .eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* Arabic has no letter case and its script does not track. */
	:global([dir='rtl']) .page-head .eyebrow {
		letter-spacing: 0;
	}
	.page-head h1 {
		margin: var(--s-3) 0 var(--s-4);
		font-family: var(--font-read);
		font-size: var(--step-4);
		font-weight: 500;
		line-height: var(--lh-snug);
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	.lede :global(.content p) {
		margin: 0;
		font-size: var(--step-1);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	.prose :global(.content p),
	.prose :global(.content ul),
	.prose :global(.content ol),
	.prose :global(.content li),
	.prose :global(.content blockquote) {
		font-family: var(--font-read);
		font-size: var(--step-0);
	}
	.prose :global(.content p) {
		margin: 0 0 var(--s-5);
	}
	.prose :global(.content ul),
	.prose :global(.content ol) {
		margin: 0 0 var(--s-5);
		padding-inline-start: var(--s-6);
	}
	.prose :global(.content li) {
		margin-bottom: var(--s-2);
	}
	.prose :global(.content blockquote) {
		border-inline-start: 2px solid var(--border-default);
		color: var(--text-muted);
	}
	.prose :global(.content a) {
		color: var(--accent);
	}
	.prose :global(.content strong) {
		color: var(--text-primary);
	}

	/* The column owns the measure and the body size, so the long-form block in
	   app.css — which sets its own on `.prose` — is overridden here. */
	.prose {
		max-width: none;
		font-size: inherit;
	}

	/* The section number. The heading text is the markdown's; the count comes
	   from the document order, so adding a section renumbers the rest for free. */
	.prose {
		counter-reset: section;
	}
	.prose :global(.content h2) {
		counter-increment: section;
		margin: var(--s-9) 0 var(--s-4);
		font-family: var(--font-read);
		font-size: var(--step-2);
		font-weight: 500;
		line-height: var(--lh-snug);
		letter-spacing: var(--track-tight);
		color: var(--text-primary);
	}
	/* The eyebrow SectionHeader wears: mono, capped, tracked, number in the
	   accent with a faint slash. */
	.prose :global(.content h2)::before {
		content: counter(section, decimal-leading-zero) ' /';
		display: block;
		margin-bottom: var(--s-2);
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 400;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--accent);
	}
	:global([dir='rtl']) .prose :global(.content h2)::before {
		letter-spacing: 0;
	}
	.prose :global(.content h3) {
		margin: var(--s-6) 0 var(--s-3);
		font-family: var(--font-read);
		font-size: var(--step-1);
		font-weight: 500;
		line-height: var(--lh-snug);
		color: var(--text-primary);
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
		font-size: var(--step--1);
		color: var(--text-primary);
	}
	.base p {
		margin: var(--s-1) 0 0;
		font-size: var(--step--1);
		line-height: var(--lh-normal);
		color: var(--text-muted);
	}

	/* The table fills the reading column, in the reading face: the measure it
	   wraps at is the measure the prose is set to. */
	.views {
		border-collapse: collapse;
		width: 100%;
		margin: var(--s-5) 0 var(--s-8);
		font-family: var(--font-read);
		font-size: var(--step--1);
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
		line-height: var(--lh-normal);
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
