<script module lang="ts">
	import { basisLabel, t, tf } from '$lib/t.svelte';
	import type { Basis } from '$lib/model';

	/**
	 * What one record's claim rests on: its basis, its grade, and the D3 origins
	 * line. Every surface that prints the standing of a single record uses this,
	 * so the same words and the same note appear everywhere.
	 */
	export interface BasisRecord {
		basis?: string | null;
		confidence?: string | null;
		restsOnOrigins?: number | null;
		encyclopediaOnly?: boolean | null;
	}

	/** The origins note, or an empty string when the record cites no source. */
	export function restsOnNote(record: BasisRecord | null | undefined): string {
		if (!record) return '';
		if (record.encyclopediaOnly) return t('restsOn.encyclopediaOnly');
		if (record.restsOnOrigins == null) return '';
		return record.restsOnOrigins === 1
			? t('restsOn.one')
			: tf('restsOn.many', { n: record.restsOnOrigins });
	}

	/** The same line as one string, for an aria-label or a text alternative. */
	export function basisLineText(record: BasisRecord | null | undefined): string {
		if (!record?.basis) return '';
		const head = record.confidence
			? `${record.confidence} ${basisLabel(record.basis as Basis)}`
			: basisLabel(record.basis as Basis);
		const note = restsOnNote(record);
		return note ? `${head}, ${note}` : head;
	}
</script>

<script lang="ts">
	import Chip from './Chip.svelte';

	interface Props {
		record: BasisRecord | null | undefined;
		size?: 'xs' | 'sm';
		/** Print the grade letter beside the basis. On by default. */
		grade?: boolean;
	}

	let { record, size = 'xs', grade = true }: Props = $props();
	const note = $derived(restsOnNote(record));
</script>

{#if record?.basis}
	<span class="basis-line">
		<Chip size={size} dot tint={`var(--basis-${record.basis})`}
			>{grade && record.confidence ? `${record.confidence} — ` : ''}{basisLabel(
				record.basis as Basis
			)}</Chip
		>
		{#if note}<span class="note">, {note}</span>{/if}
	</span>
{/if}

<style>
	.basis-line {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		flex-wrap: wrap;
	}
	.note {
		font-family: var(--font-mono);
		font-size: var(--t-2xs);
		color: var(--text-muted);
		white-space: nowrap;
	}
</style>
