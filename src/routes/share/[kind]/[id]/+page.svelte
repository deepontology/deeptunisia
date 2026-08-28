<script lang="ts">
	import { page } from '$app/state';
	import { personById, institutionById, relationshipById, resolveEntity } from '$lib/model';
	import { nameOf } from '$lib/t.svelte';

	let { data } = $props<{ data: { kind: string; id: string } }>();

	const kind = $derived(data.kind);
	const id = $derived(data.id);

	const title = $derived.by(() => {
		if (kind === 'relationship') {
			const r = relationshipById.get(id);
			if (!r) return `${id} · DeepTunisia`;
			const from = personById.get(r.from) ? nameOf(personById.get(r.from)!) : (institutionById.get(r.from) ? nameOf(institutionById.get(r.from)!) : r.from);
			const to = personById.get(r.to) ? nameOf(personById.get(r.to)!) : (institutionById.get(r.to) ? nameOf(institutionById.get(r.to)!) : r.to);
			return `${from} → ${to} · DeepTunisia`;
		}
		if (kind === 'flow' || kind === 'agreement') return `${id} · DeepTunisia`;
		const p = personById.get(id);
		if (p) return `${nameOf(p)} · DeepTunisia`;
		const inst = institutionById.get(id);
		if (inst) return `${nameOf(inst)} · DeepTunisia`;
		const ref = resolveEntity(id);
		return `${ref?.name ?? id} · DeepTunisia`;
	});

	const desc = $derived.by(() => {
		if (kind === 'relationship') {
			const r = relationshipById.get(id);
			return r?.description?.slice(0, 160) ?? 'A documented relationship in the DeepTunisia graph.';
		}
		if (kind === 'flow') return 'A measured flow between Tunisia and a counterparty.';
		if (kind === 'agreement') return 'An agreement in the DeepTunisia world dataset.';
		const p = personById.get(id);
		if (p?.summary) return p.summary.slice(0, 160);
		const inst = institutionById.get(id);
		if (inst?.summary) return inst.summary.slice(0, 160);
		return 'An entity in the DeepTunisia atlas of power, 1956–2026.';
	});

	const canonical = $derived.by(() => {
		if (kind === 'entity') return `https://deeptunisia.org/network?id=${encodeURIComponent(id)}`;
		if (kind === 'relationship') return `https://deeptunisia.org/network?rel=${encodeURIComponent(id)}`;
		if (kind === 'flow') return `https://deeptunisia.org/network?flow=${encodeURIComponent(id)}`;
		if (kind === 'agreement') return `https://deeptunisia.org/network?agreement=${encodeURIComponent(id)}`;
		return `https://deeptunisia.org/network?id=${encodeURIComponent(id)}`;
	});

	const shareUrl = $derived(canonical);
</script>

<svelte:head>
	<title>{title}</title>
	<meta property="og:title" content={title} />
	<meta property="og:description" content={desc} />
	<meta property="og:url" content={shareUrl} />
	<meta property="og:image" content="https://deeptunisia.org/og/default.png" />
	<meta property="og:type" content="article" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={desc} />
	<meta name="twitter:image" content="https://deeptunisia.org/og/default.png" />
	<link rel="canonical" href={canonical} />
	<meta http-equiv="refresh" content="0;url={canonical}" />
</svelte:head>

<main class="sheet">
	<p class="eyebrow">DeepTunisia — share</p>
	<h1>{title}</h1>
	<p class="desc">{desc}</p>
	<p class="goto">Redirecting to <a href={canonical}>{canonical}</a>…</p>
	<script>
		location.replace(canonical);
	</script>
</main>

<style>
	.sheet {
		max-width: 640px;
		margin: 12vh auto;
		padding: var(--s-8);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-2);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
	}
	h1 {
		font-size: var(--t-xl);
		line-height: var(--lh-tight);
		color: var(--text-primary);
	}
	.desc {
		font-size: var(--t-base);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}
	.goto {
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.goto a {
		color: var(--accent);
		border-bottom: 1px solid var(--accent-border);
	}
</style>
