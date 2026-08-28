<script lang="ts" module>
	/**
	 * What the reader clicked.
	 *
	 * In a module block because a type declared in the instance script is not exported —
	 * WorldView needs this to type its own selection state.
	 */
	export type FlowSelection =
		| {
				kind: 'agreement';
				agreementId: string;
				/**
				 * The graph record to hang a thread on — an institution id, never a country
				 * code. The EU Association Agreement is drawn to Brussels because that is
				 * where the Union sits, and an early version filed its discussion against
				 * `BE`: a thread about the EU, addressed to Belgium.
				 *
				 * Null when the party has no record, in which case the card offers no door
				 * rather than a broken one.
				 */
				targetId: string | null;
				partyName: string;
		  }
		| {
				kind: 'trade' | 'energy' | 'debt';
				iso2: string;
				countryName: string;
				/** Set when the counterparty is a lending body rather than a state. */
				institutionId?: string;
				year: number;
		  };
</script>

<script lang="ts">
	import { t, tf, nameOf, basisLabel, formatDate } from '$lib/t.svelte';
	import { app } from '$lib/state.svelte';
	import { ds, type Basis } from '$lib/model';
	import { AGORA_OPEN } from '$lib/agora-gate';
	import Chip from '$lib/ui/Chip.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import CommunityActions from '$lib/ui/CommunityActions.svelte';
	import ShareMenu from '$lib/ui/ShareMenu.svelte';
	import { canonicalShareUrl, buildFlowId } from '$lib/share';
	import Prose from '$lib/ui/Prose.svelte';
	import SourceList from './SourceList.svelte';
	import { flows, debt } from '$lib/world/countries';
	import { moneyM } from '$lib/world/format';

	/**
	 * A connection on the globe, as a record you can address.
	 *
	 * WHY THIS IS NOT ConnectionCard
	 *
	 * It is the same affordance and deliberately the same shape, because a reader who
	 * has clicked an edge in the network and then clicks an arc here should find the
	 * same thing. But the two carry different KINDS of object and the difference has
	 * to be visible, which is the whole argument of this project applied to itself.
	 *
	 * A relationship is a claim: somebody asserted it, it has a basis, a confidence and
	 * a source, and if it is wrong you can propose a correction. `ConnectionCard`
	 * renders exactly that apparatus.
	 *
	 * A trade figure is a MEASUREMENT. Nobody on this project graded it; a statistical
	 * office produced it in bulk and will revise it without telling anyone. Giving it a
	 * basis chip would be a lie told in the interface, so it gets none — it gets the
	 * publisher, the retrieval date, and where two countries disagree, both numbers.
	 *
	 * THE TWO DOORS ARE NOT THE SAME EITHER
	 *
	 * An agreement gets Discuss AND Propose: it is a claim in `data/agreements.yaml`
	 * and a reader who finds the wrong entry-into-force date should be able to say so.
	 *
	 * A flow gets Discuss ONLY. "Propose a change" against a UN Comtrade figure would
	 * offer an edit this project cannot make and would not accept — the number is not
	 * ours to change. But the discussion is worth having, and sometimes it is the most
	 * interesting one available: when Tunisia reports exporting three times what
	 * Switzerland reports importing, somebody should be asking why.
	 */

	interface Props {
		selection: FlowSelection;
		onclose: () => void;
		/** Open the country's own record, where the graph has one. */
		onpick: (institutionId: string) => void;
	}

	let { selection, onclose, onpick }: Props = $props();

	/** The graph record this card can hang a discussion on, if there is one. */
	const countryRecord = $derived(
		selection.kind === 'agreement'
			? selection.targetId
				? ds.institutions.find((i) => i.id === selection.targetId)
				: undefined
			: selection.institutionId
				? ds.institutions.find((i) => i.id === selection.institutionId)
				: ds.institutions.find((i) => (i as { iso2?: string }).iso2 === selection.iso2)
	);

	const agreement = $derived(
		selection.kind === 'agreement'
			? ds.agreements?.find((a) => a.id === selection.agreementId)
			: undefined
	);

	function money(m: number | null | undefined): string {
		return moneyM(m ?? null, app.locale);
	}

	function localPercent(value: number): string {
		return new Intl.NumberFormat(app.locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
	}

	function localDate(raw: string): string {
		const time = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
		return Number.isNaN(time) ? raw.slice(0, 10) : formatDate(time, 'day');
	}

	const slot = $derived.by(() => {
		if (selection.kind === 'agreement') return -1;
		const years = selection.kind === 'debt' ? debt?.years : flows?.years;
		if (!years) return -1;
		let i = -1;
		for (let k = 0; k < years.length; k++) {
			if (years[k] <= selection.year) i = k;
			else break;
		}
		return i;
	});

	/** The rows of numbers this card shows, per family. */
	const figures = $derived.by(() => {
		if (selection.kind === 'agreement' || slot < 0) return [];

		if (selection.kind === 'trade') {
			const row = flows?.partners[selection.iso2];
			if (!row) return [];
			return [
				{ label: t('world.exports'), own: row.out[slot], mirror: row.mirrorOut?.[slot] ?? null },
				{ label: t('world.imports'), own: row.in[slot], mirror: row.mirrorIn?.[slot] ?? null }
			];
		}

		if (selection.kind === 'energy') {
			const out: { label: string; own: number | null; mirror: number | null }[] = [];
			for (const [fuel, partners] of Object.entries(flows?.energy ?? {})) {
				const row = partners[selection.iso2];
				if (!row) continue;
				const sold = row.out[slot];
				const bought = row.in[slot];
				if ((sold ?? 0) <= 0 && (bought ?? 0) <= 0) continue;
				if ((bought ?? 0) > 0) {
					out.push({
						label: tf('world.fuel.flow', { fuel: t(`world.fuel.${fuel}`), direction: t('world.bought') }),
						own: bought,
						mirror: null
					});
				}
				if ((sold ?? 0) > 0) {
					out.push({
						label: tf('world.fuel.flow', { fuel: t(`world.fuel.${fuel}`), direction: t('world.sold') }),
						own: sold,
						mirror: null
					});
				}
			}
			return out;
		}

		const row = selection.institutionId
			? debt?.bodies[selection.institutionId]
			: debt?.creditors[selection.iso2];
		if (!row) return [];
		return [
			{ label: t('world.owed'), own: row.stock[slot], mirror: null },
			{ label: t('world.received'), own: row.disbursed[slot], mirror: null },
			{ label: t('world.repaid'), own: row.repaid[slot], mirror: null }
		];
	});

	/** How far the two national accounts differ, when both filed. */
	const gap = $derived.by(() => {
		if (selection.kind !== 'trade') return null;
		const own = figures.reduce((s, f) => s + (f.own ?? 0), 0);
		const mirror = figures.reduce((s, f) => s + (f.mirror ?? 0), 0);
		if (own <= 0 || mirror <= 0) return null;
		return Math.abs(own - mirror) / Math.max(own, mirror);
	});

	const heading = $derived(
		selection.kind === 'agreement'
			? selection.partyName
			: selection.institutionId
				? nameOf(ds.institutions.find((i) => i.id === selection.institutionId))
				: selection.countryName
	);

	const eyebrow = $derived(
		selection.kind === 'agreement' ? t(`world.kind.${agreement?.kind}`) : t(`world.${selection.kind}`)
	);

	const provenance = $derived(
		selection.kind === 'agreement'
			? null
			: selection.kind === 'debt'
				? { source: debt?.source, retrieved: debt?.retrieved }
				: { source: flows?.source, retrieved: flows?.retrieved }
	);

	const shareUrl = $derived.by(() => {
		if (selection.kind === 'agreement') return canonicalShareUrl('agreement', selection.agreementId);
		const kind = selection.kind;
		const year = selection.year;
		const iso = selection.iso2;
		return canonicalShareUrl('flow', buildFlowId(kind, year, iso));
	});
	const shareTitle = $derived(heading);
</script>

<article class="card">
	<header>
		<div class="verb">
			<span class="eyebrow">{eyebrow}</span>
			{#if selection.kind !== 'agreement'}
				<span class="sub mono">{selection.year}</span>
			{/if}
		</div>
		<div class="h-actions">
			<ShareMenu url={shareUrl} title={shareTitle} />
			<button class="close" onclick={onclose} aria-label={t('panel.close')}>×</button>
		</div>
	</header>

	<div class="ends">
		<span class="end fixed">{t('world.tunisia')}</span>
		<span class="arrow" aria-hidden="true">↔</span>
		{#if countryRecord}
			<button class="end" onclick={() => onpick(countryRecord.id)}>{heading}</button>
		{:else}
			<span class="end plain">{heading}</span>
		{/if}
	</div>

	{#if selection.kind === 'agreement' && agreement}
		<!-- The ends say who; this says what. Both are needed: "Tunisia ↔ European Union"
		     is true of half a dozen things. -->
		<h3 class="title" dir="auto">{nameOf(agreement)}</h3>
		<p class="desc" dir="auto"><Prose record={agreement} field="summary" block /></p>
		<div class="meta">
			{#if agreement.basis}
				<Chip size="xs" dot tint="var(--basis-{agreement.basis})">
					{agreement.confidence ? `${agreement.confidence} — ` : ''}{basisLabel(agreement.basis as Basis)}
				</Chip>
			{/if}
			{#if agreement.in_force}
				<Chip variant="outline" size="xs">{tf('world.inforce.date', { date: localDate(agreement.in_force) })}</Chip>
			{/if}
		</div>
		{#if agreement.sources?.length}
			<SourceList ids={agreement.sources} />
		{/if}
	{:else}
		<dl class="figures">
			{#each figures as f (f.label)}
				<div class="row">
					<dt>{f.label}</dt>
					<dd class="mono">{money(f.own)}</dd>
					{#if f.mirror !== null}
						<dd class="mono mirror">
							<Tooltip content={t('world.partnersays')}>{money(f.mirror)}</Tooltip>
						</dd>
					{/if}
				</div>
			{/each}
		</dl>

		{#if selection.kind === 'trade'}
			<!--
				The disagreement, stated in words as well as drawn as a halo on the arc.
				A reader who cannot see the halo — on a phone, or with the arc behind the
				globe — still gets the number.
			-->
			<p class="two-books">
				{#if gap === null}
					{t('world.nocounter')}
				{:else}
					{tf('world.dossier.twobooks', { gap: localPercent(gap) })}
				{/if}
			</p>
		{/if}

		{#if provenance?.source}
			<!--
				Publisher and retrieval date instead of a basis chip. A measurement is not
				a graded claim and must not wear one's clothes; see the header.
			-->
			<p class="prov">
				{#if provenance.retrieved}
					{tf('world.provenance', { source: provenance.source, date: localDate(provenance.retrieved) })}
				{:else}
					{provenance.source}
				{/if}
			</p>
		{/if}
	{/if}

	{#if countryRecord && selection.kind === 'agreement'}
		<CommunityActions type="institution" id={countryRecord.id} label={nameOf(agreement)} />
	{:else if countryRecord}
		<!--
			Discuss only. There is no "propose a change" against a UN Comtrade figure:
			the number is not this project's to edit, and offering the door would promise
			something the review process cannot deliver. While the Agora is staged the
			door is a coming-soon mark; when AGORA_OPEN flips it becomes the real link.
		-->
		<div class="acts">
			{#if AGORA_OPEN}
				<a class="cbtn" href="/agora?target_type=institution&target_id={countryRecord.id}&label={encodeURIComponent(heading)}">
					{t('panel.discuss')}
				</a>
			{:else}
				<Tooltip content={t('agora.comingsoon')}>
					<span class="cbtn soon">
						{t('panel.discuss')}<i class="chip">{t('agora.soon.badge')}</i>
					</span>
				</Tooltip>
			{/if}
		</div>
	{:else}
		<p class="norecord">{t('world.norecord')}</p>
	{/if}
</article>

<style>
	.card {
		width: min(360px, calc(100vw - var(--s-8)));
		padding: var(--s-5) var(--s-6) var(--s-6);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--r-lg);
		box-shadow: var(--elev-3);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}

	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--s-4);
	}
	.verb {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.eyebrow {
		font-size: var(--t-2xs);
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.sub {
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.h-actions {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-shrink: 0;
	}
	.close {
		font-size: var(--t-lg);
		line-height: 1;
		color: var(--text-muted);
		padding: 0 var(--s-2);
	}
	.close:hover {
		color: var(--text-primary);
	}

	.ends {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	.end {
		font-size: var(--t-sm);
		color: var(--text-primary);
		text-align: start;
	}
	.end.fixed,
	.end.plain {
		color: var(--text-secondary);
	}
	button.end {
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 3px;
	}
	button.end:hover {
		text-decoration-color: var(--accent);
	}
	.arrow {
		color: var(--text-faint);
	}

	.title {
		font-size: var(--t-sm);
		font-weight: 600;
		line-height: var(--lh-snug);
		color: var(--text-primary);
	}

	.desc {
		font-size: var(--t-sm);
		line-height: var(--lh-relaxed);
		color: var(--text-secondary);
	}

	.meta {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
	}

	.figures {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: var(--s-4);
		align-items: baseline;
		font-size: var(--t-xs);
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		color: var(--text-primary);
	}
	/* The partner's figure, quieter: it is the counter-account, not the headline. */
	dd.mirror {
		color: var(--text-faint);
	}

	.two-books,
	.prov,
	.norecord {
		font-size: var(--t-2xs);
		color: var(--text-faint);
		line-height: var(--lh-relaxed);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.acts {
		display: flex;
		gap: var(--s-3);
	}
	.cbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		flex: 1;
		min-height: var(--tap);
		padding: var(--s-2) var(--s-4);
		font-size: var(--t-xs);
		border: 1px solid var(--accent-border);
		border-radius: var(--r-md);
		color: var(--accent-text);
		background: var(--accent-muted);
		transition: background var(--dur-fast) var(--ease-out);
	}
	.cbtn:hover {
		background: var(--surface-hover);
	}

	/* Coming soon: the door is announced but not open. Inert, muted, with the
	   mark doing the talking — same register as the CommunityActions pair. */
	.cbtn.soon {
		cursor: default;
		color: var(--text-secondary);
		background: var(--surface-sunken);
		border-color: var(--border-default);
		transition: none;
	}
	.cbtn.soon:hover {
		background: var(--surface-sunken);
	}
	.chip {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		font-style: normal;
		letter-spacing: var(--track-wide);
		text-transform: uppercase;
		line-height: 1;
		padding: 2px 4px;
		border-radius: var(--r-full);
		border: 1px solid var(--border-default);
		color: var(--text-faint);
		background: var(--surface-overlay);
	}
</style>
