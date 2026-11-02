<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<svelte:head>
	<title>Privacy · DeepTunisia</title>
	<meta
		name="description"
		content="What DeepTunisia stores, what it never stores, how rate limiting works, and how to withdraw a study answer."
	/>
</svelte:head>

<div class="page">
	<header class="page-head">
		<span class="eyebrow">Legal · draft</span>
		<span class="lang-note">English text · FR and AR pending</span>
		<h1>Privacy</h1>
		<div class="lede">
			<p>
				What this site stores and what it does not. Written in plain language and kept short
				enough to check.
			</p>
		</div>
	</header>

	<div class="prose">
		{#if app.locale !== 'en'}
			<p class="pending">Translation pending. The English text on this page is the operative draft.</p>
		{/if}
		<p class="draft">
			Draft for owner approval. This page is not legal advice. Before publication the owner
			confirms the jurisdiction, the correspondence retention period and the contact routing.
		</p>

		<h2 id="short">The short version</h2>
		<ul>
			<li>No accounts. No trackers. No advertising.</li>
			<li>No third-party fonts or scripts on this site. The fonts are self-hosted.</li>
			<li>A study answer asks nothing about who you are: no name, no email, no phone, no account.</li>
			<li>The only receipt that can delete an answer is the random code shown when you submit.</li>
		</ul>

		<h2 id="site">What the site itself stores</h2>
		<p>
			Reading the site does not create an account or a profile. The site sets no tracking
			cookies. The pages you read are served as files; there is no advertising system and no
			analytics script.
		</p>
		<p>
			The site runs on Cloudflare. Like any host, Cloudflare sees connections pass through and
			keeps sampled logs: the study pages state that its logs are sampled at one request in a
			hundred and are not joined to answers. Cloudflare's human check is switched on only during
			an attack, and the page says so when it appears. Your internet provider, and anyone
			watching your network, can see that you visited the site. The site cannot prevent that; a
			VPN or Tor Browser hides the visit from your provider.
		</p>

		<h2 id="study">What a study answer stores</h2>
		<p>
			The study page carries the complete text. In short, one row holds:
		</p>
		<ul>
			<li>your answers, the language you answered in, and the questionnaire version you saw;</li>
			<li>the link you arrived from, stored as a code and never published as an address;</li>
			<li>the time you started and the time you submitted, and a random receipt code;</li>
			<li>one word, only if it applies, saying that the answer updates an earlier one or came from a browser that had already answered this month.</li>
		</ul>
		<p>
			It stores no name, email address, phone number, account, IP address, browser fingerprint,
			device identifier or location. The last question, which governorate you live in, is
			optional; if you answer it, only your region is published, and never for a group of fewer
			than 20 people. The full explanation is on
			<a href="/research/police">the Police Satisfaction Index page</a>.
		</p>

		<h2 id="rate">Rate limiting</h2>
		<p>
			To stop one machine from flooding a survey, the server counts submissions per address
			using a salted fingerprint that changes every day. The address itself is never written
			down, and the fingerprint is not stored with your answers.
		</p>

		<h2 id="withdraw">Withdrawal and deletion</h2>
		<p>
			Your receipt code is the only way to delete your answers. It works until the end of the
			month in which you answered. If you lose it, the answers can no longer be deleted, by you
			or by the project, because nothing else links them to you. A month's figure never changes
			after the month closes; any later release has regions instead of governorates, no date
			finer than the month, and no receipt codes.
		</p>

		<h2 id="contact">Contact and correspondence</h2>
		<p>
			Write to <a href="mailto:contact@deeptunisia.org">contact@deeptunisia.org</a> for privacy
			questions, corrections and replies. Correspondence is kept for
			<span class="todo">[OWNER TO CONFIRM: retention period]</span>. It is not added to a study
			dataset and it is not sold or passed to an advertising system.
		</p>

		<h2 id="changes">Changes</h2>
		<p>
			A change to this page is dated in the repository's history. The page does not silently
			change its meaning.
		</p>

		<p class="foot">
			<a href="/terms">Terms</a> · <a href="/corrections">Corrections</a> ·
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
	.draft, .pending { border-inline-start: 3px solid var(--accent); padding: var(--s-3) var(--s-4); background: var(--surface-raised); }
	.pending { border-color: var(--warning); }
	.todo { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-faint); }
	.foot { margin-top: var(--s-8); padding-top: var(--s-4); border-top: 1px solid var(--border-subtle); font-size: var(--t-sm); }
</style>
