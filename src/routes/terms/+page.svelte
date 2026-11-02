<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<svelte:head>
	<title>Terms · DeepTunisia</title>
	<meta
		name="description"
		content="Who operates DeepTunisia, the licence for the code, data and film, the corrections policy, and the limits of the record."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">Legal · draft</span>
		<span class="lang-note">English text · FR and AR pending</span>
		<h1>Terms</h1>
		<div class="lede">
			<p>
				Who operates this site, what you may reuse, how corrections work, and what the record
				does not promise.
			</p>
		</div>
	</header>

	<div class="prose">
		{#if app.locale !== 'en'}
			<p class="pending">Translation pending. The English text on this page is the operative draft.</p>
		{/if}
		<p class="draft">
			Draft for owner approval. This page is not legal advice. Before publication the owner
			confirms the legal form, the jurisdiction and the film licence.
		</p>

		<h2 id="operator">Who operates the site</h2>
		<p>
			DeepTunisia is operated by the DeepOntology Collective. The site is an open-source,
			source-backed atlas of political, military, security and economic power in Tunisia,
			1956–2026. It is not a party, a company or a government body.
			<span class="todo">[OWNER TO CONFIRM: legal form, jurisdiction and registration number, if any]</span>
		</p>

		<h2 id="licences">Licences</h2>
		<ul>
			<li><strong>Code:</strong> MIT. The licence is in the repository's <code>LICENSE</code> file.</li>
			<li><strong>Data:</strong> CC BY 4.0. Attribution is required. The data licence is in the repository's <code>data/LICENSE</code> file.</li>
			<li><strong>Film:</strong> <span class="todo">[OWNER TO CONFIRM: licence for the film]</span>. The third-party photograph and video clips keep their own CC BY 3.0 licences and are credited on screen and on the film page.</li>
			<li><strong>Quoted documents and press:</strong> the rights remain with their authors. They are cited, not relicensed.</li>
		</ul>

		<h2 id="corrections">Corrections and replies</h2>
		<p>
			Every change to the dataset is published in the <a href="/corrections">corrections log</a>,
			generated from version control. A correction is not quietly applied. Write to
			<a href="mailto:contact@deeptunisia.org">contact@deeptunisia.org</a> with a source and the
			passage you challenge. The project publishes the outcome, including when it declines to
			change a record and why.
		</p>

		<h2 id="warranty">No warranty</h2>
		<p>
			The record is assembled from public sources and is published with its evidence grades and
			its gaps visible. It is provided as-is, without a warranty of completeness or fitness for a
			particular purpose. A grade describes the evidence behind a claim; it is not a guarantee
			that the claim is true.
		</p>

		<h2 id="advice">Not legal advice</h2>
		<p>
			Nothing on this site is legal advice. The film and the atlas name living people and
			describe allegations. A reader who needs legal advice should consult a qualified lawyer in
			the relevant jurisdiction.
		</p>

		<h2 id="privacy">Privacy</h2>
		<p>
			What the site stores, what it never stores, and how to withdraw a study answer are on the
			<a href="/privacy">privacy page</a>.
		</p>

		<p class="foot">
			<a href="/privacy">Privacy</a> · <a href="/corrections">Corrections</a> ·
			<a href="/colophon">Colophon</a>
		</p>
	</div>
</div>

<style>
	.page { flex: 1; min-height: 0; overflow-y: auto; }
	.page-head { max-width: 76ch; margin-inline: auto; padding: var(--s-8) var(--s-6) var(--s-3); }
	.page-head .eyebrow { font-family: var(--font-mono); font-size: var(--t-2xs); letter-spacing: var(--track-caps); text-transform: uppercase; color: var(--text-faint); }
	.lang-note { display: block; margin-top: var(--s-2); font-family: var(--font-mono); font-size: var(--t-2xs); letter-spacing: var(--track-wide); color: var(--text-faint); }
	.page-head h1 { margin: var(--s-3) 0 var(--s-4); font-family: var(--font-serif); font-size: var(--t-4xl); font-weight: 400; letter-spacing: var(--track-tight); color: var(--text-primary); }
	.page-head .lede p { margin: 0; font-size: var(--t-lg); line-height: 1.6; color: var(--text-secondary); }
	.prose { max-width: 76ch; margin-inline: auto; padding: var(--s-3) var(--s-6) var(--s-12); color: var(--text-secondary); line-height: 1.65; }
	.prose h2 { margin: var(--s-7) 0 var(--s-3); font-family: var(--font-serif); font-size: var(--t-2xl); font-weight: 400; color: var(--text-primary); }
	.prose p, .prose li { font-size: var(--t-base); }
	.prose ul { padding-inline-start: var(--s-5); }
	.prose li { margin-bottom: var(--s-2); }
	.prose a { color: var(--accent); }
	.prose code { font-family: var(--font-mono); font-size: var(--t-sm); }
	.draft, .pending { border-inline-start: 3px solid var(--accent); padding: var(--s-3) var(--s-4); background: var(--surface-raised); }
	.pending { border-color: var(--warning); }
	.todo { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-faint); }
	.foot { margin-top: var(--s-8); padding-top: var(--s-4); border-top: 1px solid var(--border-subtle); font-size: var(--t-sm); }
</style>
