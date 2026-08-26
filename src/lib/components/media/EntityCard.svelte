<script lang="ts">
	/**
	 * EntityCard — the entity whose name was just read, opened alongside the
	 * article. Curated, not exhaustive: this investigation's claims about the
	 * entity, plus the way into the full graph record.
	 */

	import type { Claim, Entity } from '$lib/media/types';

	interface Props {
		entity: Entity;
		claims: Claim[];
		onclose: () => void;
	}

	let { entity, claims, onclose }: Props = $props();

	const displayName = $derived(entity.name.en ?? entity.id);
	const role = $derived(entity.role ?? 'entity');
	const roleLabel = $derived(role.replace(/_/g, ' '));
</script>

<div class="entity-card" role="complementary" aria-label="Entity: {displayName}">
	<header class="card-head">
		<h3>{displayName}</h3>
		<button class="close" onclick={onclose} aria-label="Close">✕</button>
	</header>
	<span class="role">{roleLabel}</span>

	{#if claims.length > 0}
		<div class="claims">
			<div class="label">In this investigation</div>
			{#each claims.slice(0, 8) as claim (claim.id)}
				<div class="claim">
					<span class="claim-id">{claim.id}</span>
					<span class="claim-text">{claim.text.en ?? ''}</span>
					<span class="claim-grade" class:documented={claim.grade === 'documented'} class:reported={claim.grade === 'reported'} class:inferred={claim.grade === 'inferred'} class:unsubstantiated={claim.grade === 'unsubstantiated'}>
						{claim.grade}
					</span>
				</div>
			{/each}
			{#if claims.length > 8}
				<div class="more">+{claims.length - 8} more in the ledger</div>
			{/if}
		</div>
	{/if}

	<a class="graph-link" href="/network?entity={entity.id}">
		<span>View full record in graph</span>
		<span class="arrow" aria-hidden="true">→</span>
	</a>
</div>

<style>
	.entity-card {
		padding: var(--s-5);
		background: var(--surface-raised);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-1);
	}

	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: var(--s-2);
	}
	.card-head h3 {
		font-family: var(--font-serif);
		font-size: var(--t-lg);
		font-weight: 400;
		line-height: 1.25;
		color: var(--text-primary);
		margin: 0;
	}

	.close {
		font-size: var(--t-sm);
		color: var(--text-faint);
		padding: var(--s-1) var(--s-2);
		border-radius: var(--r-xs);
		transition:
			color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.close:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}

	.role {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--text-faint);
		margin-bottom: var(--s-3);
	}

	.claims {
		margin-top: var(--s-4);
		padding-top: var(--s-4);
		border-top: 1px solid var(--border-subtle);
	}

	.claim {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.claim:last-child {
		border-bottom: none;
	}

	.claim-id {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-weight: 600;
		color: var(--text-faint);
	}

	.claim-text {
		font-size: var(--t-xs);
		line-height: 1.5;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.claim-grade {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		margin-top: 2px;
		align-self: flex-start;
	}
	.documented { color: var(--basis-documented); }
	.reported { color: var(--basis-reported); }
	.inferred { color: var(--basis-inferred); }
	.unsubstantiated { color: var(--basis-unsubstantiated); }

	.more {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-faint);
		margin-top: var(--s-2);
	}

	/* The graph link: the door out. An anchor, not a button — it navigates. */
	.graph-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		margin-top: var(--s-4);
		padding: var(--s-3) var(--s-4);
		background: var(--surface-sunken);
		border: 1px solid var(--border-default);
		border-radius: var(--r-md);
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--accent);
		text-decoration: none;
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background var(--dur-fast) var(--ease-out);
	}
	.graph-link:hover {
		border-color: color-mix(in oklch, var(--accent) 45%, var(--border-default));
		background: color-mix(in oklch, var(--accent) 6%, var(--surface-sunken));
	}
	.arrow {
		transition: transform var(--dur-fast) var(--ease-out);
	}
	.graph-link:hover .arrow {
		transform: translateX(3px);
	}
</style>