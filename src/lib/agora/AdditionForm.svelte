<script lang="ts">
	/**
	 * "This record does not exist yet."
	 *
	 * A change request edits something the graph already holds. This is the other
	 * kind of contribution: a person, an institution or an event that belongs in the
	 * record and is not there. It files an `append-record` proposal carrying the
	 * record's fields, so the reviewer sees the whole new record at once, not a
	 * description of one.
	 *
	 * WHAT THIS FORM CANNOT DO YET
	 *
	 * The other record kinds (company, contract, licence, declaration, education)
	 * have no drafting form yet: their required fields are their own design, and
	 * the server validates their ids only. The five kinds here are the ones whose
	 * required fields a public form can honestly ask for.
	 *
	 * THE ID
	 *
	 * The record needs an id before it can exist. It is derived from the name, shown
	 * before filing, and checked against every id in the local graph so a collision
	 * is impossible to propose by accident. It is not editable: the id becomes part
	 * of every URL, source reference and thread that ever names this record.
	 *
	 * EVIDENCE
	 *
	 * The build refuses a record with no source. The evidence link filed here is a
	 * URL a reviewer can follow; if the proposer already knows a source id in the
	 * graph, naming it lets the record cite it directly and the addition can be
	 * applied without an editorial stop.
	 */
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import RecordPicker, { type PickerOption } from './RecordPicker.svelte';
	import { t, layerLabel, nameOf } from '$lib/t.svelte';
	import { agora } from '$lib/agora.svelte';
	import { LAYER_COLOR, communityTypeOf, ds, institutionById, type Layer } from '$lib/model';
	import {
		INSTITUTION_TYPES,
		EVENT_CATEGORIES,
		RELATIONSHIP_TYPES,
		LAYERS
	} from '$lib/taxonomy';

	interface Props {
		busy?: boolean;
		error?: string;
		onfile: (v: {
			kind: string;
			id: string;
			changes: { field: string; new_value: string }[];
			reason: string;
			url: string;
			title: string;
			sourceId: string;
		}) => void;
		oncancel: () => void;
		onidentity?: () => void;
	}

	let { busy = false, error = '', onfile, oncancel, onidentity }: Props = $props();

	const KINDS = ['person', 'institution', 'event', 'relationship', 'position'] as const;

	/*
	 * The pickers are built from the graph itself. People and institutions cover
	 * the ends of a relationship and the holder of an office; roles are not in the
	 * search index, so their list is built here from the generated dataset.
	 */
	const PEOPLE: PickerOption[] = ds.people.map((p) => ({
		id: p.id,
		name: p.name_en,
		detail: p.tagline ?? '',
		layer: p.layers?.[0]
	}));
	const INSTITUTIONS: PickerOption[] = ds.institutions.map((i) => ({
		id: i.id,
		name: i.name_en,
		detail: i.abbr ?? '',
		layer: i.layer
	}));
	const ENDPOINTS: PickerOption[] = [...PEOPLE, ...INSTITUTIONS];
	const ROLES: PickerOption[] = ds.roles.map((r) => ({
		id: r.id,
		name: r.title_en,
		detail: nameOf(institutionById.get(r.institution))
	}));

	let kind = $state('person');
	let name = $state('');
	let nameFr = $state('');
	let nameAr = $state('');
	let tagline = $state('');
	let summary = $state('');
	let instType = $state('ministry');
	let instLayer = $state<Layer>('political');
	let layers = $state<Layer[]>(['political']);
	let date = $state('');
	let dateEnd = $state('');
	let category = $state('political');
	let relFrom = $state<PickerOption | null>(null);
	let relTo = $state<PickerOption | null>(null);
	let relType = $state('institutional');
	let relSubtype = $state('');
	let relStart = $state('');
	let relEnd = $state('');
	let relDescription = $state('');
	let relConfidence = $state('B');
	let relAttributed = $state('');
	let posRole = $state<PickerOption | null>(null);
	let posHolder = $state<PickerOption | null>(null);
	let posStart = $state('');
	let posEnd = $state('');
	let posNotes = $state('');
	let url = $state('');
	let title = $state('');
	let sourceId = $state('');
	let reason = $state('');

	const locked = $derived(agora.ready === true && agora.can.createPr !== true);

	function slugify(value: string): string {
		return value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 64);
	}

	function idTaken(candidate: string): boolean {
		return communityTypeOf(candidate) !== 'open';
	}

	/** Derived from the names picked or typed, collision-free against the graph. */
	const proposedId = $derived.by(() => {
		let base: string;
		if (kind === 'relationship') {
			base = `rel-${relFrom?.id ?? 'from'}-${relTo?.id ?? 'to'}`;
		} else if (kind === 'position') {
			base = `p-${posRole?.id ?? 'role'}-${posHolder?.id ?? 'holder'}`;
		} else {
			base = slugify(name) || 'new-record';
		}
		base = base.slice(0, 72);
		if (!idTaken(base)) return base;
		for (let i = 2; i < 100; i++) {
			const candidate = `${base}-${i}`;
			if (!idTaken(candidate)) return candidate;
		}
		return `${base}-${Date.now().toString(36)}`;
	});

	function toggleLayer(layer: Layer) {
		layers = layers.includes(layer)
			? layers.filter((l) => l !== layer)
			: [...layers, layer];
	}

	const changes = $derived.by(() => {
		const out: { field: string; new_value: string }[] = [
			{ field: 'id', new_value: proposedId }
		];
		if (kind === 'person') {
			out.push({ field: 'name_en', new_value: name.trim() });
			if (nameFr.trim()) out.push({ field: 'name_fr', new_value: nameFr.trim() });
			if (nameAr.trim()) out.push({ field: 'name_ar', new_value: nameAr.trim() });
			out.push({ field: 'layers', new_value: layers.join(', ') });
			if (tagline.trim()) out.push({ field: 'tagline', new_value: tagline.trim() });
			if (summary.trim()) out.push({ field: 'summary', new_value: summary.trim() });
		} else if (kind === 'institution') {
			out.push({ field: 'name_en', new_value: name.trim() });
			if (nameFr.trim()) out.push({ field: 'name_fr', new_value: nameFr.trim() });
			if (nameAr.trim()) out.push({ field: 'name_ar', new_value: nameAr.trim() });
			out.push({ field: 'type', new_value: instType });
			out.push({ field: 'layer', new_value: instLayer });
			if (summary.trim()) out.push({ field: 'summary', new_value: summary.trim() });
		} else if (kind === 'relationship') {
			out.push({ field: 'from', new_value: relFrom?.id ?? '' });
			out.push({ field: 'to', new_value: relTo?.id ?? '' });
			out.push({ field: 'type', new_value: relType });
			if (relSubtype.trim()) out.push({ field: 'subtype', new_value: relSubtype.trim() });
			if (relStart.trim()) out.push({ field: 'start', new_value: relStart.trim() });
			if (relEnd.trim()) out.push({ field: 'end', new_value: relEnd.trim() });
			out.push({ field: 'description', new_value: relDescription.trim() });
			out.push({ field: 'confidence', new_value: relConfidence });
			if (relConfidence === 'C' || relConfidence === 'D') {
				out.push({ field: 'attributed_to', new_value: relAttributed.trim() });
			}
		} else if (kind === 'position') {
			out.push({ field: 'role', new_value: posRole?.id ?? '' });
			out.push({ field: 'holder', new_value: posHolder?.id ?? '' });
			if (posStart.trim()) out.push({ field: 'start', new_value: posStart.trim() });
			if (posEnd.trim()) out.push({ field: 'end', new_value: posEnd.trim() });
			if (posNotes.trim()) out.push({ field: 'notes', new_value: posNotes.trim() });
		} else {
			out.push({ field: 'title_en', new_value: name.trim() });
			if (nameFr.trim()) out.push({ field: 'title_fr', new_value: nameFr.trim() });
			if (nameAr.trim()) out.push({ field: 'title_ar', new_value: nameAr.trim() });
			out.push({ field: 'date', new_value: date.trim() });
			if (dateEnd.trim()) out.push({ field: 'date_end', new_value: dateEnd.trim() });
			out.push({ field: 'category', new_value: category });
			if (summary.trim()) out.push({ field: 'summary', new_value: summary.trim() });
		}
		return out;
	});

	const ready = $derived.by(() => {
		if (busy || locked || !reason.trim()) return false;
		if (kind === 'relationship') {
			if (!relFrom || !relTo || !relType) return false;
			if (relDescription.trim().length < 4) return false;
			if ((relConfidence === 'C' || relConfidence === 'D') && !relAttributed.trim()) return false;
			return true;
		}
		if (kind === 'position') {
			return !!posRole && !!posHolder && !!posStart.trim();
		}
		if (name.trim().length < 2) return false;
		if (kind === 'event' && !date.trim()) return false;
		if (kind === 'person' && layers.length === 0) return false;
		return true;
	});

	function file() {
		if (!ready) return;
		onfile({ kind, id: proposedId, changes, reason, url, title, sourceId });
	}
</script>

<Panel elevation={1} padded>
	<h3>{t('agora.add.title')}</h3>
	<p class="hint">{t('agora.add.hint')}</p>

	{#if locked}
		<div class="locked" role="note">
			<p class="locked-title">{t('agora.locked.title')}</p>
			<p class="locked-body">{t('agora.proposelocked')}</p>
			<div class="actions">
				{#if onidentity}
					<Button variant="solid" onclick={onidentity}>{t('agora.locked.action')}</Button>
				{/if}
				<Button variant="ghost" onclick={oncancel}>{t('agora.cancel')}</Button>
			</div>
		</div>
	{:else}
		<Field label={t('agora.add.kind')}>
			<div class="kinds">
				<Segmented
					options={KINDS.map((k) => ({ value: k, label: t(`agora.add.kind.${k}`) }))}
					value={kind}
					onchange={(v) => (kind = v)}
					label={t('agora.add.kind')}
				/>
			</div>
		</Field>

		{#if kind !== 'relationship' && kind !== 'position'}
			<Field for="add-f1" label={kind === 'event' ? t('agora.add.title_en') : t('agora.add.name_en')} required>
				<Input id="add-f1" bind:value={name} size="md" />
			</Field>

			<div class="row">
				<Field for="add-f2" label={t('agora.add.name_fr')}>
					<Input id="add-f2" bind:value={nameFr} size="md" />
				</Field>
				<Field for="add-f3" label={t('agora.add.name_ar')}>
					<Input id="add-f3" bind:value={nameAr} size="md" dir="rtl" lang="ar" />
				</Field>
			</div>
		{/if}

		{#if kind === 'person'}
			<Field label={t('agora.add.layers')} hint={t('agora.add.layershint')} required>
				<div class="chips" role="group" aria-label={t('agora.add.layers')}>
					{#each LAYERS as l (l)}
						<button
							type="button"
							class="chip"
							class:on={layers.includes(l)}
							aria-pressed={layers.includes(l)}
							style:--c={LAYER_COLOR[l]}
							onclick={() => toggleLayer(l)}
						>
							<i></i>{layerLabel(l)}
						</button>
					{/each}
				</div>
			</Field>
			<Field for="add-f4" label={t('agora.add.tagline')}>
				<Input id="add-f4" bind:value={tagline} size="md" />
			</Field>
		{:else if kind === 'institution'}
			<div class="row">
				<Field for="add-f5" label={t('agora.add.type')} required>
					<select id="add-f5" class="pick" bind:value={instType}>
						{#each INSTITUTION_TYPES as v (v)}<option value={v}>{v}</option>{/each}
					</select>
				</Field>
				<Field for="add-f6" label={t('agora.add.layer')} required>
					<select id="add-f6" class="pick" bind:value={instLayer}>
						{#each LAYERS as l (l)}<option value={l}>{layerLabel(l)}</option>{/each}
					</select>
				</Field>
			</div>
		{:else if kind === 'event'}
			<div class="row">
				<Field for="add-f7" label={t('agora.add.date')} required>
					<Input id="add-f7" bind:value={date} size="md" placeholder="1957-07-26" mono />
				</Field>
				<Field for="add-f8" label={t('agora.add.dateend')}>
					<Input id="add-f8" bind:value={dateEnd} size="md" mono />
				</Field>
			</div>
			<Field for="add-f9" label={t('agora.add.category')} required>
				<select id="add-f9" class="pick" bind:value={category}>
					{#each EVENT_CATEGORIES as v (v)}<option value={v}>{v}</option>{/each}
				</select>
			</Field>
		{:else if kind === 'relationship'}
			<RecordPicker
				inputId="add-from"
				label={t('agora.add.from')}
				options={ENDPOINTS}
				value={relFrom}
				onpick={(o) => (relFrom = o)}
				placeholder={t('agora.add.searchph')}
			/>
			<RecordPicker
				inputId="add-to"
				label={t('agora.add.to')}
				options={ENDPOINTS}
				value={relTo}
				onpick={(o) => (relTo = o)}
				placeholder={t('agora.add.searchph')}
			/>
			<Field for="add-f10" label={t('agora.add.reltype')} required>
				<select id="add-f10" class="pick" bind:value={relType}>
					{#each RELATIONSHIP_TYPES as v (v)}<option value={v}>{v}</option>{/each}
				</select>
			</Field>
			<Field for="add-f11" label={t('agora.add.subtype')}>
				<Input id="add-f11" bind:value={relSubtype} size="md" />
			</Field>
			<div class="row">
				<Field for="add-f12" label={t('agora.add.date')}>
					<Input id="add-f12" bind:value={relStart} size="md" mono placeholder="1957-07-26" />
				</Field>
				<Field for="add-f13" label={t('agora.add.dateend')}>
					<Input id="add-f13" bind:value={relEnd} size="md" mono />
				</Field>
			</div>
			<Field for="add-f14" label={t('agora.add.description')} required>
				<Textarea id="add-f14" bind:value={relDescription} rows={3} />
			</Field>
			<div class="row">
				<Field for="add-f15" label={t('agora.add.confidence')} required>
					<select id="add-f15" class="pick" bind:value={relConfidence}>
						{#each ['A', 'B', 'C', 'D'] as v (v)}<option value={v}>{v}</option>{/each}
					</select>
				</Field>
				{#if relConfidence === 'C' || relConfidence === 'D'}
					<Field for="add-f16" label={t('agora.add.attributed')} hint={t('agora.add.attributedhint')} required>
						<Input id="add-f16" bind:value={relAttributed} size="md" />
					</Field>
				{/if}
			</div>
		{:else if kind === 'position'}
			<RecordPicker
				inputId="add-role"
				label={t('agora.add.role')}
				options={ROLES}
				value={posRole}
				onpick={(o) => (posRole = o)}
				placeholder={t('agora.add.searchph')}
			/>
			<RecordPicker
				inputId="add-holder"
				label={t('agora.add.holder')}
				options={PEOPLE}
				value={posHolder}
				onpick={(o) => (posHolder = o)}
				placeholder={t('agora.add.searchph')}
			/>
			<div class="row">
				<Field for="add-f17" label={t('agora.add.date')} required>
					<Input id="add-f17" bind:value={posStart} size="md" mono placeholder="1957-07-26" />
				</Field>
				<Field for="add-f18" label={t('agora.add.dateend')}>
					<Input id="add-f18" bind:value={posEnd} size="md" mono />
				</Field>
			</div>
			<Field for="add-f19" label={t('agora.add.notes')}>
				<Textarea id="add-f19" bind:value={posNotes} rows={2} />
			</Field>
		{/if}

		{#if kind !== 'relationship' && kind !== 'position'}
			<Field for="add-f20" label={t('agora.add.summary')}>
				<Textarea id="add-f20" bind:value={summary} rows={3} />
			</Field>
		{/if}

		<div class="idbox">
			<span class="idlabel">{t('agora.add.id')}</span>
			<code>{proposedId}</code>
			<p class="idhint">{t('agora.add.idhint')}</p>
		</div>

		<Field for="add-f21" label={t('agora.add.reason')} hint={t('agora.add.reasonhint')} required>
			<Textarea id="add-f21" bind:value={reason} rows={3} limit={2000} placeholder={t('agora.whyph')} />
		</Field>

		<Field label={t('agora.evidence')} hint={t('agora.evidencehint')}>
			<div class="evidence">
				<Input bind:value={url} placeholder={t('agora.evidenceurl')} size="md" type="url" />
				<Input bind:value={title} placeholder={t('agora.evidencewhat')} size="md" />
			</div>
		</Field>

		<Field for="add-f22" label={t('agora.add.sourceid')} hint={t('agora.add.sourceidhint')}>
			<Input id="add-f22" bind:value={sourceId} size="md" mono />
		</Field>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			<Button variant="solid" onclick={file} disabled={!ready}>{t('agora.add.file')}</Button>
			<Button variant="ghost" onclick={oncancel}>{t('agora.cancel')}</Button>
		</div>
	{/if}
</Panel>

<style>
	h3 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-md);
	}
	.hint {
		margin: 0 0 var(--s-6);
		font-size: var(--t-xs);
		color: var(--text-secondary);
		line-height: 1.5;
		max-width: 66ch;
	}
	.locked {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		margin-top: var(--s-5);
		padding: var(--s-5);
		border: 1px solid var(--border-subtle);
		border-inline-start: 2px solid var(--basis-inferred);
		border-radius: var(--r-md);
		background: color-mix(in oklch, var(--basis-inferred) 6%, transparent);
	}
	.locked-title {
		margin: 0;
		font-size: var(--t-sm);
		font-weight: 560;
	}
	.locked-body {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-secondary);
		line-height: 1.55;
		max-width: 62ch;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-4);
	}
	/* Five kinds do not fit a phone; the control scrolls instead of overflowing. */
	.kinds {
		overflow-x: auto;
	}
	.kinds :global(.seg) {
		min-width: 520px;
	}
	.pick {
		width: 100%;
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text-primary);
		background: var(--surface-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		min-height: var(--tap);
	}
	.pick:focus {
		border-color: var(--accent-border);
		outline: none;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: var(--t-xs);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--r-full);
		padding: var(--s-1) var(--s-4);
		min-height: 26px;
	}
	.chip i {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: var(--c);
	}
	.chip.on {
		color: var(--text-primary);
		border-color: color-mix(in srgb, var(--c) 55%, var(--border-default));
		background: color-mix(in srgb, var(--c) 12%, transparent);
	}
	.idbox {
		margin: var(--s-5) 0;
		padding: var(--s-4) var(--s-5);
		border: 1px dashed var(--border-default);
		border-radius: var(--r-md);
		background: var(--surface-sunken);
	}
	.idlabel {
		display: block;
		font-size: var(--t-2xs);
		text-transform: uppercase;
		letter-spacing: var(--track-caps);
		color: var(--text-faint);
		margin-bottom: var(--s-2);
	}
	.idbox code {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		color: var(--text-primary);
	}
	.idhint {
		margin: var(--s-2) 0 0;
		font-size: var(--t-2xs);
		color: var(--text-faint);
		line-height: 1.45;
	}
	.evidence {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.actions {
		display: flex;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-top: var(--s-6);
	}
	.error {
		margin: var(--s-4) 0 0;
		color: var(--basis-unsubstantiated);
		font-size: var(--t-sm);
	}
	@media (max-width: 640px) {
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
